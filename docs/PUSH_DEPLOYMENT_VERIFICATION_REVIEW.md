# Push VAPID Rollout — Deployment Verification Audit

**Status:** Audit only. No code modified, no fix implemented.
**Date:** 2026-06-14
**Situation:** The new `VAPID_PUBLIC_KEY` was committed to `js/config.js` and `firebase deploy --only hosting` ran successfully — but `APP_VERSION` was **not** bumped first, so `sync-version.mjs` was a no-op (`1.11.3 → 1.11.3`). `SW_VERSION` and `version.json` remain `1.11.3`.
**Method:** Read of `.firebaserc`, `firebase.json`, `js/config.js`, `js/pwa.js`, `service-worker.js`, `scripts/sync-version.mjs`. Project: `schedule-driver-pbsi` (hosting `*.web.app` / `*.firebaseapp.com`).

---

## 0. One-paragraph verdict

The **origin is serving the new key** — that part of the rollout worked. But because `APP_VERSION`/`SW_VERSION`/`version.json` never changed, **(a)** no update banner will fire, **(b)** no new service worker installs, **(c)** the version-scoped cache `sarpras-cache-v1.11.3` is never purged, so **any browser that already cached `js/config.js` keeps serving the old empty-key copy indefinitely**, and **(d)** clients now silently diverge — some cache the empty-key file, some the new-key file, all under the *same* cache name. This is a stuck, non-deterministic state. The corrective action is exactly the step that was skipped: bump `APP_VERSION`, re-run `sync-version.mjs`, redeploy hosting. **No re-edit of the key is needed — it is already correct and already deployed.**

---

## 1. Is the deployed hosting site actually serving the new `VAPID_PUBLIC_KEY`?

**Yes — at the origin.** Firebase Hosting is `"public": "."` with no build step (`firebase.json`), so it serves the repository file verbatim. `firebase deploy --only hosting` uploaded the edited `js/config.js`. A request that **bypasses the service worker cache** (a fresh client, an incognito window, or `curl`) receives the new key.

> This is independent of the version bump. Versioning governs **cache propagation to existing clients**, not what the origin stores. The bytes on the CDN are correct.

**What is *not* guaranteed:** that any *given returning browser* receives it — see §2.

---

## 2. Can the service worker cache still serve the old `config.js`?

**Yes — and for already-cached clients it will, indefinitely.** Proven from `service-worker.js`:

```
STATIC_EXT matches .js               → js/config.js is a "static asset"
fetch handler: static → cache-first  → caches.match(request) returns the cached copy if present;
                                        network is consulted ONLY on a cache miss
CACHE_NAME = `sarpras-cache-v${SW_VERSION}`   → still "sarpras-cache-v1.11.3"
activate(): delete keys !== CACHE_NAME        → runs ONLY when a new SW activates
```

Because `SW_VERSION` is unchanged, the SW script bytes are unchanged, **no new SW installs, `activate()` never runs, and the `v1.11.3` cache is never deleted.** Any client that cached `js/config.js` (empty key) before/at the time of the key deploy will keep serving that cached empty-key file on every load. `isPushSupported()` stays `false` for them → no subscription possible.

**Non-deterministic divergence (the subtle hazard):** the cache *name* is identical (`v1.11.3`) but its *contents* now differ across clients:

| Client state at the moment of the key deploy | What it serves now |
|---|---|
| Never visited / `config.js` not yet cached | **New key** (network fetch, then caches it under v1.11.3) |
| Already cached `config.js` (empty key) | **Old empty key** (cache hit; never revalidated) |

Two users on "the same version 1.11.3" can therefore be in opposite states. A version bump collapses this: a new cache name forces every client to re-fetch `config.js` fresh.

---

## 3. Must `APP_VERSION` be bumped now?

**Yes.** It is the *only* mechanism in this architecture that:
1. changes `SW_VERSION` → changes the SW bytes → a new SW is detected and installs;
2. changes `CACHE_NAME` → `activate()` purges the stale `v1.11.3` cache (evicting the empty-key `config.js`);
3. changes `version.json` → `pwa.js` detects a version mismatch and shows the "Versi baru tersedia" banner.

Without the bump, all three stay dormant and the empty-key cache is permanent for affected clients (short of a manual DevTools cache clear or reinstall per device — not a deployable fix). The skipped step is now mandatory.

---

## 4. Recommended version number

**`1.11.3.1`.** Rationale, against the actual versioning scheme:
- This is a **frontend-only corrective patch** to the v1.11.3 Push Foundation — not a new feature. A 4th-segment patch communicates exactly that.
- **`1.11.4` is reserved** for the planned Reminder Push Engine; do not consume it for a cache-bust.
- `1.11.3.1` is a strict, comparable increase, so `pwa.js`'s mismatch check (`version.json` value ≠ running `APP_VERSION`) fires correctly.

(Any value strictly different from `1.11.3` would *function* for cache-busting, but `1.11.3.1` is the semantically correct, collision-free choice.)

---

## 5. Exact files that must be changed

**Hand-edited (one file):**
- `js/config.js` — bump `APP_VERSION` `'1.11.3'` → `'1.11.3.1'`. *(Optional: add a `VERSION_HISTORY` entry for 1.11.3.1 noting "VAPID public key cache-bust.")*
  **Do NOT touch `VAPID_PUBLIC_KEY`** — it is already correct and already on the origin.

**Auto-rewritten by `node scripts/sync-version.mjs` (do not edit by hand):**
- `service-worker.js` — `SW_VERSION` `'1.11.3'` → `'1.11.3.1'` (→ `CACHE_NAME = sarpras-cache-v1.11.3.1`).
- `version.json` — `{ "version": "1.11.3.1" }`.

No other files. No functions change, no rules change, no key change for *this* corrective step. (The server-side pilot allowlist remains a separate concern per `docs/PUSH_PILOT_ACTIVATION_REVIEW.md`.)

---

## 6. Exact expected `sync-version.mjs` output after the correction

After editing `APP_VERSION` to `1.11.3.1` and running `node scripts/sync-version.mjs`:

```
APP_VERSION (source) : 1.11.3.1
service-worker.js    : SW_VERSION 1.11.3 → 1.11.3.1
version.json         : { "version": "1.11.3.1" }
Done. CACHE_NAME is now sarpras-cache-v1.11.3.1
```

The middle line showing `1.11.3 → 1.11.3.1` (an actual transition, not `1.11.3 → 1.11.3`) is the proof the bump took effect. If it still prints `→ 1.11.3.1` with a left side of `1.11.3.1`, the edit was already applied; the line that matters is that **both** the SW and `version.json` now read `1.11.3.1`.

---

## 7. Exact deployment sequence from this point forward

1. **Edit** `js/config.js`: `APP_VERSION = '1.11.3.1'`. (Leave the VAPID key as-is.)
2. **Propagate:** `node scripts/sync-version.mjs`.
3. **Verify the script output** matches §6 — confirm `service-worker.js` `SW_VERSION` and `version.json` both now say `1.11.3.1` before deploying. (Guards against repeating the no-op.)
4. **Deploy hosting:** `firebase deploy --only hosting`.
5. **Confirm origin** (SW-bypassing) serves both the new key and new version (see §9, Stage 0).
6. **Pilot enablement (separate, server-side):** if not already done, set `PUSH_CONFIG.pilotAllowlist = ['<evan's exact /users key>']` and `firebase deploy --only functions`. Required to *receive* (not to *subscribe*).

Hosting and functions are independent deploy targets; the key/version fix is hosting-only.

---

## 8. What must existing browser sessions do?

The intended, low-friction path is **accept the update banner**. Mechanics from `js/pwa.js`:
- The SW is registered with `updateViaCache:'none'` and `/service-worker.js` carries `Cache-Control: no-cache` (`firebase.json`) → the SW script is always revalidated from network. After step 4, the new `1.11.3.1` SW is fetched and installs as *waiting*.
- On load and on throttled focus/visibility, `pwa.js` fetches `/version.json` (`no-store`), sees `1.11.3.1 ≠ 1.11.3`, and shows **"Versi baru tersedia. / Refresh Sekarang."**
- Accepting it triggers `SKIP_WAITING` → the new SW activates → `activate()` deletes the `v1.11.3` cache → next load re-fetches `js/config.js` fresh (new key) → reload.

| Action | Needed? |
|---|---|
| **Accept update banner** | ✅ **Recommended / sufficient.** Purges the stale cache and loads the new key. The installed iPhone PWA must be reopened to surface the banner/update. |
| Hard refresh | Works as an alternative (forces an SW update check + reload), but the banner is the designed flow and is gentler. |
| Uninstall / reinstall PWA | ❌ Not required. Only a last resort if banner + refresh somehow fail. |
| Do nothing | ⚠️ Not immediate, but self-heals: the next `version.json` poll (load or focus, ≤ ~1/min throttle) raises the banner. The user still has to accept it to activate. |

So: **no reinstall.** Bump + redeploy, then users accept the banner (or it appears on next focus).

---

## 9. Fastest validation procedure

**Stage 0 — Origin truth (no browser, seconds):**
```
curl -s https://schedule-driver-pbsi.web.app/js/config.js | grep VAPID_PUBLIC_KEY
curl -s https://schedule-driver-pbsi.web.app/version.json
```
Expect a **non-empty** `VAPID_PUBLIC_KEY` and `{ "version": "1.11.3.1" }`. This bypasses every service worker and proves the CDN content. (The key check is already true *today*; the version check is what step 4 fixes.)

**Stage 1 — Client received the update (proves cache purge):**
- In the pilot browser after accepting the banner: DevTools → Application → Service Workers shows the active worker is the `1.11.3.1` build; Cache Storage shows **`sarpras-cache-v1.11.3.1`** and **no** `v1.11.3`.
- Network/Sources: `js/config.js` shows the non-empty key (proves no stale cache). The push soft-ask (`#pushSoftAsk`) now appears — `isPushSupported()` is true.

**Stage 2 — A push subscription can be created:**
- Trigger opt-in (tap "Aktifkan" → grant OS permission).
- Network: callable POST `…/registerPushSubscription` returns `{ ok:true, created:true }`.
- Functions logs: `[push/register] subscription stored { uid, deviceId, created:true, platform }`.

**Stage 3 — `/push_subscriptions` appears (refutes the original symptom):**
- RTDB: `/push_subscriptions/{uid}/{deviceId}` now exists with `endpoint`, `keys:{p256dh,auth}`, `platform`, `enabled:true`. This is the direct proof the node materializes once a browser can subscribe.

*(Receiving an actual push additionally requires the pilot allowlist — §7 step 6 — and is validated per the companion review; it is downstream of "subscription can be created" and out of scope for verifying the VAPID/version fix itself.)*

---

### Appendix — what is known vs. assumed

| Statement | Basis |
|---|---|
| Origin serves the new key now | `firebase.json` `"public":"."` + no build + successful hosting deploy — **certain**. |
| Already-cached clients serve the old empty key | `service-worker.js` cache-first + unchanged `CACHE_NAME` — **certain**. |
| Which *specific* returning client is stale vs. fresh | Depends on whether it had cached `config.js` before the deploy — **client-state-dependent, not assumable**. The version bump makes it deterministic for all, which is why it's required rather than optional. |
| Bump → banner → cache purge → new key | `pwa.js` version-mismatch + `SKIP_WAITING` + `activate()` purge — **certain** from code. |
| Reinstall needed | **No** — refuted by the update lifecycle. |
