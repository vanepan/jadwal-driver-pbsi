# Push VAPID Frontend Fix — Audit & Corrective Plan Review

**Status:** Audit only. No implementation.
**Date:** 2026-06-14
**Root cause (confirmed):** `js/config.js#VAPID_PUBLIC_KEY = ''` → `js/push.js#isPushSupported()` returns `false` → no browser ever calls `pushManager.subscribe()` → `/push_subscriptions` is never written. The empty RTDB node is a *symptom*, not the cause.
**Method:** Read of `js/config.js`, `js/push.js`, `service-worker.js`, `scripts/sync-version.mjs`, `version.json`, `firebase.json`.

---

## 1. Exact source of the VAPID public key

There is exactly **one** client-side source, by design:

```
js/config.js  →  export const VAPID_PUBLIC_KEY = '<base64url>';
        │  ES module import
        ▼
js/push.js    →  import { VAPID_PUBLIC_KEY } from './config.js';
                 isPushSupported() = … && Boolean(VAPID_PUBLIC_KEY)
                 pushManager.subscribe({ applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
```

The **value** itself originates from the VAPID keypair generated once (`npx web-push generate-vapid-keys`). Its private half lives in Secret Manager as `PUSH_VAPID_PRIVATE_KEY` (server, `dispatchPush`); its public half:
- is stored in Secret Manager as `PUSH_VAPID_PUBLIC_KEY` (bound to `onEventWrite`), **and**
- **must be pasted, verbatim and matching, into `js/config.js`** for the browser to subscribe.

The public key is an *application-server identity, not a secret* — shipping it in client source is correct and intended (the config.js comment says so explicitly). **The two copies must be byte-identical**: a browser subscription minted against a public key whose private pair the server doesn't hold will fail to send (VAPID signature mismatch).

**Authoritative retrieval for the fix:**
```
firebase functions:secrets:access PUSH_VAPID_PUBLIC_KEY
```
Use that exact string — do not regenerate the keypair (regenerating would orphan the deployed private key and any future subscriptions).

---

## 2. Where it *should* be read from — evaluation of each candidate

| Candidate | Verdict | Why |
|---|---|---|
| **`js/config.js`** | ✅ **Correct, and the only correct source** | The app is a build-less static ES-module PWA; `push.js` imports the constant directly. This is the designed path. |
| Generated build artifact | ❌ N/A | **There is no build step.** `firebase.json` hosting `"public": "."` serves the repo root **verbatim** — no bundler, no transform, no asset pipeline. There is nothing to generate the key into. |
| Environment variable | ❌ Impossible client-side | No bundler / `process.env` substitution reaches the browser. A static module cannot read host env vars at runtime. (Env/Secret Manager is the *server's* source — `PUSH_VAPID_PRIVATE_KEY` — not the client's.) |
| Firebase Hosting config | ❌ Not used this way | `firebase.json` defines only `ignore`, cache `headers`, functions, DB rules. No `rewrites`, no env injection, no templating. Hosting cannot inject a value into `config.js`. |
| Another source (RTDB / remote config) | ❌ Not wired, and wrong layer | `push.js` reads the key synchronously at module load from the static import; nothing fetches it from RTDB. Adding a remote source would be new architecture, not a fix. |

**Conclusion:** the key belongs in `js/config.js` exactly where the empty constant already sits. The fix is to populate that constant — not to introduce a new source.

---

## 3. Minimal corrective action

**One value edit:**
```
// js/config.js
export const VAPID_PUBLIC_KEY = '<the PUSH_VAPID_PUBLIC_KEY secret value>';
```

That single change flips `isPushSupported()` to `true` and lets `pushManager.subscribe()` run. **No logic change** to `push.js`, the callables, the dispatcher, the SW push handler, or the rules — all of those are already correct and deployed; they were simply never reachable.

Two caveats that make the "minimal" edit slightly larger in practice (§4–§6):
- The edit must actually **reach installed clients**, which are serving a **cache-first** copy of `config.js` (proven in §5). That requires a version bump + SW re-stamp.
- To *receive* (not just *subscribe*), the pilot user must also be on `PUSH_CONFIG.pilotAllowlist` — a **separate, server-side** change covered in `docs/PUSH_PILOT_ACTIVATION_REVIEW.md`. This audit scopes the *frontend* fix; note the dependency so the pilot isn't declared done after only the key is set.

---

## 4. Must `APP_VERSION` be bumped?

**Yes — required for any installed/cached client; strongly recommended in all cases.**

`config.js` is a `.js` static asset, served **cache-first** by the service worker (§5). An installed PWA (and any returning browser that already cached it) will keep serving the **old, empty-key** `config.js` until its version-scoped cache is purged. That purge only happens when a **new SW activates**, and the SW's bytes only change when `SW_VERSION` changes — which is stamped from `APP_VERSION`.

Therefore, without an `APP_VERSION` bump:
- a fresh/uninstalled browser on a hard reload *might* fetch the new key, but
- **installed PWAs — including the iPhone PWA, which is mandatory for iOS push — will not**, because they serve the cached empty-key config.js.

**Recommendation:** bump `APP_VERSION` to a **patch** like `1.11.3.1` (frontend-only fix). Avoid `1.11.4` — that number is reserved for the planned Reminder Push Engine. The bump is what makes the SW bytes change and the cache purge.

---

## 5. Must `service-worker.js` be regenerated?

**Yes — for cache invalidation, not because the SW logic changes.**

Proof the SW caches `config.js`:
```
STATIC_EXT = /\.(css|js|mjs|…|json)(\?|$)/i      // matches config.js
fetch handler: if (_isStaticAsset(url)) → caches.match(request) first  // cache-first
CACHE_NAME = `sarpras-cache-v${SW_VERSION}`        // version-scoped
activate(): delete every cache key !== CACHE_NAME  // purge only on new SW_VERSION
```

So the **only** reliable way to evict the stale empty-key `config.js` from installed clients is to ship a new `SW_VERSION` → new `CACHE_NAME` → `activate()` deletes the old cache → `config.js` re-fetched fresh. The SW's push/notification logic itself is untouched (and does **not** use the VAPID key — it only renders the server-sent payload). Regeneration here means **re-stamping `SW_VERSION`**, which is exactly what the version script does.

> If you bump `APP_VERSION` but *don't* re-stamp the SW, the SW bytes stay identical, no new SW installs, no cache purge, and the fix never reaches installed clients. The two steps are inseparable.

---

## 6. Must `sync-version.mjs` be executed?

**Yes — it is the mechanism that makes §4 and §5 real.**

`scripts/sync-version.mjs` reads `APP_VERSION` from `js/config.js` (the single source of truth) and propagates it to the two artifacts that can't import the ES module:
- `service-worker.js` → re-stamps `SW_VERSION` (→ new `CACHE_NAME` → cache purge),
- `version.json` → the deploy oracle `pwa.js` polls to show the "Versi baru tersedia" update banner.

Run it **after** editing `APP_VERSION` (and the VAPID key) in `config.js`, **before** deploying:
```
node scripts/sync-version.mjs
```
It is idempotent. Skipping it means `version.json` still says `1.11.3` (no update banner fires) and `SW_VERSION` is unchanged (no cache purge) — the fix would silently fail to propagate.

---

## 7. Exact deployment sequence after the fix

> Two independent deploy targets are involved: **hosting** (the VAPID frontend fix) and **functions** (the pilot allowlist, per the companion review). The frontend fix is hosting-only; the allowlist is functions-only.

**A. Edit (single commit):**
1. `firebase functions:secrets:access PUSH_VAPID_PUBLIC_KEY` → copy the exact value.
2. `js/config.js`: set `VAPID_PUBLIC_KEY = '<that value>'`.
3. `js/config.js`: bump `APP_VERSION` `1.11.3` → `1.11.3.1`.
4. *(Optional but consistent)* add a `VERSION_HISTORY` entry for `1.11.3.1`.

**B. Propagate version:**
5. `node scripts/sync-version.mjs` → re-stamps `service-worker.js` `SW_VERSION` and writes `version.json`. Sanity-check both changed to `1.11.3.1`.

**C. Deploy hosting (the fix):**
6. `firebase deploy --only hosting`.

**D. Deploy the pilot gate (separate, server-side — see companion review):**
7. `functions/src/config/constants.js`: `PUSH_CONFIG.pilotAllowlist = ['<evan's exact /users key>']` (and bump `SERVICE_VERSION` for traceability).
8. `firebase deploy --only functions`.

**E. Client update (pilot user, per device):**
9. Evan loads the app → `pwa.js` sees `version.json` = `1.11.3.1` → "Versi baru tersedia" banner → accept → new SW activates → old cache purged → fresh `config.js` (with the key) served.
   - **iPhone:** must be the **installed PWA** (iOS 16.4+); reopen it after the update.
   - If the banner is missed: hard reload / reinstall forces the new SW. *Do not* rely on the old cached config.js clearing on its own without the new SW.
10. Evan opts in (soft-ask → permission → subscribe → `registerPushSubscription`).

**Notes:**
- **No DB rules change** is needed (the `/push_subscriptions` rules and callables already shipped in v1.11.3).
- **No envelope/schema bump.**
- Hosting and functions can deploy in either order; the *subscription* needs only hosting (the key), the *send* needs functions (the allowlist).

---

## 8. Validation procedure

**Stage 0 — key is live on the client (proves the fix landed):**
- In evan's updated browser DevTools → Application → Service Workers: confirm the active SW is the `1.11.3.1` build (and Cache Storage shows `sarpras-cache-v1.11.3.1`, old cache gone).
- Network tab: open `config.js` response → `VAPID_PUBLIC_KEY` is the non-empty key (proves no stale cache).
- Console: `isPushSupported()` path is now true — the soft-ask card (`#pushSoftAsk`) appears, or `enablePush()` proceeds past the support guard.

**Stage 1 — `registerPushSubscription` callable executes:**
- Trigger opt-in (tap "Aktifkan" → grant permission).
- Network tab: a callable POST to `…/registerPushSubscription` returns `{ ok: true, created: true }`.
- Functions logs: `[push/register] subscription stored { uid:"evan", deviceId, created:true, platform }`.
- Failure signatures to watch: `invalid-argument "Endpoint push tidak dikenal"` (endpoint origin not in allowlist), or no call at all (support gate still false → cache not purged → repeat Stage 0).

**Stage 2 — `push_subscriptions` node appears:**
- RTDB: `/push_subscriptions/evan/{deviceId}` now exists with `endpoint`, `keys:{p256dh,auth}`, `platform`, `createdAt`, `lastSeenAt`, `enabled:true`, `expiredAt:null`.
- This is the direct refutation of the original symptom ("no push_subscriptions node").

**Stage 3 — pilot user receives push (requires §7-D allowlist deployed):**
- Fire a triggering event that resolves evan as recipient (assign evan as driver, or evan as requester).
- Expect an OS notification (templated title/body). On Android/iPhone, test with the app **backgrounded**.
- RTDB: `/notification_deliveries/{eventId__evan__push}` = `status:"sent"`, `attempts:1`, `devices:{ <deviceId>:{ status:"sent" } }`, `target:"1 device(s)"`, no `shadow` / `shadow:false`.
- Click the notification → existing window focuses + routes (`pbsi:push-nav`) or opens at the deep link.
- **Isolation check:** a non-allowlisted recipient on the same event shows `/notification_deliveries/{eventId__<other>__push}` = `status:"queued", shadow:true` and gets **no** OS notification.

**Regression checks:**
- The update banner fired (proves `version.json`/`sync-version` worked).
- Telegram behavior unchanged (browser still the live sender; `channels.telegram` untouched).
- Re-firing the same event produces **no** duplicate notification (idempotent delivery row).

---

### Appendix — corrected mental model

| Claim | Reality |
|---|---|
| "The deployed config.js might secretly have the key" | **No.** Hosting serves the repo root verbatim (`"public": "."`, no build). What's in the repo *is* what's deployed. The empty string is the live value. |
| "Just paste the key and redeploy hosting" | Insufficient for installed PWAs — they serve a **cache-first** `config.js`. Needs `APP_VERSION` bump + `sync-version.mjs` + new SW to purge the cache. |
| "The service worker needs the VAPID key" | No. The SW only renders the server-sent payload. The key is needed by `push.js` for `subscribe()`. The SW is re-stamped solely for cache invalidation. |
| "Setting the key lets evan receive push" | It lets evan **subscribe**. Receiving also requires the **server-side pilot allowlist** (companion review) — two independent gates. |
