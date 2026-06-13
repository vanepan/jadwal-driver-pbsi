# PWA Push Notification Foundation — Implementation Plan (v1.11.3)

**Status:** Implementation planning only. No code in this document.
**Date:** 2026-06-13
**Reference architecture:** [PUSH_NOTIFICATION_ARCHITECTURE_v1.11.3.md](PUSH_NOTIFICATION_ARCHITECTURE_v1.11.3.md) (approved)
**Protocol decision (locked):** standards-based **Web Push + VAPID** via the `web-push` library, sent server-side; **no FCM, no second service worker, no client messaging SDK.**

---

## Scope-control principle (read first)

This release is **activation, not construction**. The engine, dispatcher, delivery model, shadow flags, and the `dispatchPush` stub already exist. To keep scope contained, v1.11.3 obeys three rules:

1. **All code ships in ONE release, dormant.** Stages 1–5 build everything (backend + frontend). Nothing user-facing sends a real push until a config flag flips.
2. **Rollout is configuration, not code.** Phases A→D after the ship are driven by `NOTIFICATION_FLAGS` + a pilot allowlist + the registry — never by editing dispatch logic.
3. **Out-of-scope is explicit.** Scheduled stale-subscription TTL sweep, durable cross-invocation retry, tightening the permissive RTDB root, and a `notificationChannels` preferences UI are **NOT in v1.11.3** (architecture §6/§9 "later"). They are listed once, in §11, and not planned here.

---

## 1. Stage-by-Stage Implementation Plan

| Stage | Name | Layer | Builds | Rollout phase it enables |
|---|---|---|---|---|
| 1 | VAPID Infrastructure | Backend + shared | keypair, secrets, public-key delivery | (prereq) |
| 2 | Push Subscription Registry | Backend | `/push_subscriptions` model + register/unregister callables + rules | (prereq) |
| 3 | Service Worker Extension | Frontend | `push` + `notificationclick` handlers added to existing SW | (prereq) |
| 4 | Permission & Opt-In UX | Frontend | `js/push.js` soft-ask → install gate → prompt → subscribe → register | Phase A (collection) |
| 5 | Dispatcher Integration | Backend | fill `dispatchPush`, push render variant, multi-device delivery, registry `PUSH` | Phase A (shadow rows) |
| 6 | Shadow Rollout | Config/deploy | ship all of 1–5 with `channels.push = false` | **Phase A** |
| 7 | Pilot Rollout | Config | allowlist override for internal team → pilot users | **Phase B + C** |
| 8 | Production Activation | Config | flip `channels.push = true`, remove allowlist | **Phase D** |

**Rationale per stage**

- **Stage 1 — VAPID first.** Everything downstream needs the keypair: the client needs the public key to `subscribe()`, the server needs the private key to send. Establishing it first (and proving the secret binds like `TELEGRAM_BOT_TOKEN`) de-risks the rest.
- **Stage 2 — Registry before UX.** The permission flow's final step *writes* a subscription. The callable + rules must exist before the client can register, or opt-in dead-ends. Server-only writes (no client-direct write) is the security spine (§9 of architecture) and must be in place before any subscription is accepted.
- **Stage 3 — SW before UX.** `pushManager.subscribe()` requires an active service-worker registration with push handlers; a subscription with no `push` handler is useless. SW handlers are additive and must not touch cache/update logic (Phase 4 below).
- **Stage 4 — UX after its dependencies.** Only once VAPID + registry + SW exist can the opt-in flow complete end-to-end. This is the only stage that mints subscriptions; it can ship with the channel OFF and simply collect data.
- **Stage 5 — Dispatcher last in the build.** Filling `dispatchPush` is the send path. It ships gated by `NOTIFICATION_FLAGS.channels.push` (default OFF) so deploying it produces only shadow rows. Adding `PUSH` to the registry here is what makes `dispatch()` *invoke* `dispatchPush` at all.
- **Stage 6 — Shadow.** Deploy 1–5. Real subscriptions accrue; shadow delivery rows prove recipient/device parity with zero sends.
- **Stage 7 — Pilot.** A narrow allowlist sends to internal devices, then a pilot cohort, while the global flag stays OFF. Validates real delivery on real hardware before broad exposure.
- **Stage 8 — Production.** One flag flip. No competing browser path → no double-send → clean cutover and clean rollback.

---

## 2. File Impact Analysis

Legend: **C** = created, **M** = modified. Scope = rough size (S ≤ ~40 lines, M ~40–120, L > 120).

### Stage 1 — VAPID Infrastructure
| File | C/M | Layer | Scope | Note |
|---|---|---|---|---|
| `functions/src/config/secrets.js` | M | Backend | S | add `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mirror `TELEGRAM_BOT_TOKEN`) |
| `functions/src/config/constants.js` | M | Backend | S | add `VAPID_PUBLIC_KEY` (non-secret) **or** keep public key in client config only |
| `js/config.js` | M | Frontend | S | export `VAPID_PUBLIC_KEY` (public, safe to ship) |
| `functions/package.json` | M | Backend | S | add `web-push` dependency (§3) |
| *(no file)* keypair generation | — | Ops | — | one-time `npx web-push generate-vapid-keys`; set secrets via CLI |

### Stage 2 — Push Subscription Registry
| File | C/M | Layer | Scope | Note |
|---|---|---|---|---|
| `functions/src/push/model.js` | C | Backend | M | subscription CRUD: `saveSubscription`, `loadSubscriptions(userId)`, `pruneSubscription`, `touchLastSeen` |
| `functions/src/push/callables.js` | C | Backend | M | `registerPushSubscription`, `unregisterPushSubscription` (`onCall`, Admin SDK, ownership + endpoint-origin + device-cap validation) |
| `functions/index.js` | M | Backend | S | export the two callables |
| `database.rules.json` | M | Shared | S | `/push_subscriptions` owner+admin read; keep `.write:false` |
| `js/firebase.js` | M | Frontend | S | `callRegisterPushSubscription` / `callUnregisterPushSubscription` (mirror `callPublishEvent`) |

### Stage 3 — Service Worker Extension
| File | C/M | Layer | Scope | Note |
|---|---|---|---|---|
| `service-worker.js` | M | Frontend | S–M | add `push` + `notificationclick` listeners **only**; do not touch install/activate/fetch (§4) |

### Stage 4 — Permission & Opt-In UX
| File | C/M | Layer | Scope | Note |
|---|---|---|---|---|
| `js/push.js` | C | Frontend | L | deviceId mint (LS+IDB), feature-detect, soft-ask card, iOS gate (reuse `pwa.js`), `requestPermission`, `subscribe`, register, unsubscribe, re-enable |
| `js/app.js` | M | Frontend | S–M | init `js/push.js` after `authReady()`; add SW `message` → NAV deep-link handler; honor deep-link param on cold start |
| `js/pwa.js` | M | Frontend | S | export `showIOSInstallModal`/`_detectInstalled`/`_detectPlatform` for reuse (or expose via `getPWAState`) |
| `index.html` | M | Frontend | S | optional: Settings toggle anchor + header "Aktifkan Notifikasi" affordance (cards built in JS like `pwa.js`) |
| `css/*.css` | M | Frontend | S | styles for the soft-ask card / toggle (reuse existing `v2-pwa-*` patterns) |

### Stage 5 — Dispatcher Integration
| File | C/M | Layer | Scope | Note |
|---|---|---|---|---|
| `functions/src/push/send.js` | C | Backend | M | `sendPushWithRetry(sub, payload, vapidDetails)` — `web-push` + retry/terminal classification mirroring `telegram/retry.js` |
| `functions/src/notifications/dispatcher.js` | M | Backend | M | fill `dispatchPush`: load subs, render, send-with-retry, per-device delivery, prune on 404/410 |
| `functions/src/notifications/templates.js` | M | Backend | S–M | add `push` case to `render` → `{title, body, data:{type,url,entityId}}` |
| `functions/src/notifications/model.js` | M | Backend | S | add `DELIVERY_STATUS.EXPIRED`; extend `recordDelivery` to accept a `devices` map |
| `functions/src/notifications/registry.js` | M | Backend | S | add `PUSH` to relevant `channels` arrays (assignment.created/completed/cancelled, request.*, comment.added) |

### Stage 6–8 — Rollout (config only)
| File | C/M | Layer | Scope | Note |
|---|---|---|---|---|
| `functions/src/config/constants.js` | M | Backend | S | Stage 7: add pilot allowlist; Stage 8: `channels.push = true` |
| `js/config.js` | M | Frontend | S | Stage 6: `APP_VERSION → 1.11.3` (single bump at ship) |
| `functions/package.json` + `constants.js#SERVICE_VERSION` | M | Backend | S | version bumps per §9 |

**Aggregate new files:** 4 (`functions/src/push/{model,callables,send}.js`, `js/push.js`). **Modified:** ~12. **No file deleted.** No existing notification path (in-app, Telegram) is touched.

---

## 3. Dependency Analysis

| Dependency | Type | Where | Notes |
|---|---|---|---|
| `web-push` (npm) | **Required** | `functions/package.json` | server-side VAPID signing + `aes128gcm` payload encryption; the one new runtime dep |
| VAPID keypair | **Required** | one-time ops | `npx web-push generate-vapid-keys`; private → Secret Manager, public → client config |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` secrets | **Required** | Secret Manager | bound per-function via `{ secrets: [...] }`, read lazily with `.value()` (mirrors `TELEGRAM_BOT_TOKEN`) |
| `registerPushSubscription` / `unregisterPushSubscription` callables | **Required** | `functions/` | server-only subscription writes |
| Native `PushManager` / `Notification` / `ServiceWorker` APIs | **Required** | browser | **zero new client dependency** — no `firebase-messaging`, no extra gstatic import |
| `httpsCallable` / `getFunctions` | **Already present** | `js/firebase.js` | reuse existing callable plumbing |
| Firebase Auth custom token + `role` claim | **Already present** | Identity Foundation | provides `auth.uid` ownership for rules |
| Scheduled function (TTL sweep / durable retry) | **Future** | out of scope | architecture §6/§9 "later" |
| `firebase-messaging` SDK / `firebase-messaging-sw.js` | **Not used** | — | explicitly rejected by the Web Push decision |
| `notificationChannels` preferences map | **Optional/Future** | `/users` | not required; opt-in is represented by subscription existence |

**Frontend dependency footprint: none added** (bundler-less ESM app; push uses native browser APIs). **Backend: one** (`web-push`).

---

## 4. Service Worker Strategy

Existing [service-worker.js](../service-worker.js) structure: `SW_VERSION` (stamped from `APP_VERSION` by [sync-version.mjs](../scripts/sync-version.mjs)) → `install` (precache offline) → `activate` (purge stale caches, claim) → `fetch` (bypass/version/navigate/static) → `message` (`SKIP_WAITING`).

**Insertion strategy — additive only:**

- **Where `push` belongs:** a new top-level `self.addEventListener('push', …)` appended **after** the existing `message` listener. It parses `event.data.json()` → `{title, body, data}` and calls `self.registration.showNotification(title, {body, data, icon, tag})` inside `event.waitUntil(...)`. It reads nothing from caches and touches no cache logic.
- **Where `notificationclick` belongs:** a new `self.addEventListener('notificationclick', …)`, also appended after `message`. It does `event.notification.close()` + focus-or-open: `clients.matchAll` → focus existing window and `postMessage({type:'NAV', url})`, else `clients.openWindow(url)`.
- **How to avoid breaking update logic:** the update flow depends on (a) `SW_VERSION` changing the SW bytes each release, and (b) the `install`/`activate`/`SKIP_WAITING` choreography. Adding two **independent event listeners** changes the file bytes (good — a normal new-version pickup) but does **not** alter install/activate/fetch/message. Do **not** call `skipWaiting()` from the new handlers; leave the banner-driven activation intact. Do **not** add new precache entries.
- **How to preserve the cache lifecycle:** push/notificationclick never read or write `caches`, so the version-scoped cache purge in `activate` is unaffected. `CACHE_NAME` and `BYPASS_ORIGINS` are untouched.
- **Deep-link cold-start:** the SW posts `{type:'NAV', url}` to a live client; the **app side** (Stage 4, `js/app.js`) adds the matching `message` listener and also parses the deep-link param on cold load so `openWindow` lands correctly. This is app code, not SW code.

**Net SW change:** two appended listeners, ~25–35 lines, zero edits to existing blocks.

---

## 5. Device Lifecycle Plan — `/push_subscriptions/{userId}/{deviceId}`

**Implementation order:** (1) deviceId mint → (2) registration → (3) update/rotation → (4) unsubscribe → (5) logout cleanup. Each step is independently testable.

```
                         ┌─────────────────────────────┐
   first run ──────────► │  mint deviceId (UUID)        │  localStorage + IndexedDB mirror
                         │  (once; never changes)       │
                         └──────────────┬──────────────┘
                                        │ user opts in (Stage 4 flow)
                                        ▼
                         ┌─────────────────────────────┐
   REGISTRATION ───────► │ pushManager.subscribe()      │ ─callable─► saveSubscription()
                         │ → registerPushSubscription   │            /push_subscriptions/{uid}/{deviceId}
                         └──────────────┬──────────────┘            { endpoint, keys, platform, enabled:true,
                                        │                              createdAt, lastSeenAt }
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                            ▼
   ┌─────────────────┐      ┌───────────────────────┐     ┌────────────────────┐
   │ UPDATE          │      │ ROTATION              │      │ each app open      │
   │ touchLastSeen   │      │ browser refreshes     │      │ → touchLastSeen    │
   │ (lastSeenAt)    │      │ endpoint → re-subscribe│     │ (drives TTL sweep) │
   │                 │      │ → SAME deviceId        │      └────────────────────┘
   └─────────────────┘      │ → overwrite record    │
                            │ (no orphan)           │
                            └───────────┬───────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                            ▼
   ┌─────────────────┐      ┌───────────────────────┐     ┌────────────────────┐
   │ UNSUBSCRIBE     │      │ LOGOUT CLEANUP        │      │ SEND-TIME PRUNE    │
   │ user toggles off│      │ on signOut:           │      │ 404/410 Gone →     │
   │ subscription    │      │ unregisterPush(deviceId)│    │ pruneSubscription  │
   │ .unsubscribe()  │      │ + subscription         │      │ + mark expired     │
   │ + unregisterPush│      │   .unsubscribe()      │      │ (dispatcher §6.2)  │
   │ → delete record │      │ → delete THIS device  │      └────────────────────┘
   └─────────────────┘      │   (siblings untouched)│
                            └───────────────────────┘
```

- **deviceId** is the stable RTDB child key; the rotating `endpoint` lives *inside* the record. This is what makes rotation a same-key overwrite rather than a duplicate.
- **enabled:false** (mute without delete) vs **delete** (unsubscribe/logout) are distinct: mute keeps the record for fast re-enable; logout/unsubscribe removes it so a logged-out device cannot receive.
- **All writes go through the callables** (Admin SDK) — the client never writes `/push_subscriptions` directly (security spine).

---

## 6. Permission UX Plan

**Exact order (per platform):**

```
Soft Ask ─► Install Check ─► Native Prompt ─► Subscription ─► Registration
```

| Step | Android Chrome | Desktop Chrome/Edge | iPhone PWA (iOS 16.4+) |
|---|---|---|---|
| **Soft Ask** | in-app card after meaningful action | same | same — but only if `'PushManager' in window` |
| **Install Check** | optional (push works in browser tab too) | optional | **MANDATORY** — `_detectInstalled()`; if not installed → `showIOSInstallModal()` and stop |
| **Native Prompt** | `Notification.requestPermission()` on gesture | same | same — **must run inside installed app from a gesture** |
| **Subscription** | `pushManager.subscribe({userVisibleOnly:true, applicationServerKey})` | same | same |
| **Registration** | `registerPushSubscription(sub, deviceId, platform)` | same | same |

**Edge-case handling:**
- **Permission already `denied`:** skip the prompt; show OS-specific "re-enable in Settings" guidance. Never re-fire the native prompt.
- **Unsupported browser / iOS < 16.4:** feature-detect (`'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`); if absent, **never show the push affordance** — degrade silently to in-app + Telegram.
- **iOS Safari tab (not installed):** never call `subscribe()` (it throws); route to the install modal first.
- **User dismisses soft-ask ("Nanti"):** persist `pbsi_push_softasked` with the 7-day TTL pattern from `pwa.js`; don't nag.
- **`subscribe()` fails after permission granted:** surface a retry; do not mark push enabled; do not write a partial subscription.
- **Permission granted but registration callable fails:** local subscription exists but no server record → retry registration on next app open (idempotent upsert by deviceId).
- **Re-enable after mute:** re-run Native Prompt→Registration; flip record `enabled:true`.
- **Multiple tabs:** registration is idempotent per deviceId; concurrent registrations converge on one record.

---

## 7. Dispatcher Activation Plan

Three independent gates, activated in a deliberate order so a deploy can never send a surprise push:

| Control | File | Stage it changes | Effect |
|---|---|---|---|
| **Registry `PUSH` membership** | `registry.js` | Stage 5 (ship) | makes `dispatch()` *invoke* `dispatchPush` for those event types — but it only records **shadow** rows while the flag is OFF |
| **`dispatchPush` send logic** | `dispatcher.js` | Stage 5 (ship) | gated internally on `NOTIFICATION_FLAGS.channels.push`; OFF → `{status:queued, shadow:true}`, no send |
| **`NOTIFICATION_FLAGS.channels.push`** | `constants.js` | Stage 8 (Phase D) | OFF→ON is the single production cutover |
| **Pilot allowlist** (Stage 7) | `constants.js` | Stage 7 (Phase B/C) | overrides the OFF flag for specific `auth.uid`s only → real sends to test/pilot devices while everyone else stays shadow |

**Ordering guarantee against accidental production sends:**
1. Ship Stage 5 with `channels.push = false` and **no allowlist** → 100% shadow. Verified by inspecting `/notification_deliveries` for `channel:'push', shadow:true`.
2. Phase B: add only internal `auth.uid`s to the allowlist. Only those devices receive.
3. Phase C: extend the allowlist to pilot users. Still flag-OFF for the rest.
4. Phase D: set `channels.push = true` and remove the allowlist branch.

Because the send is gated by **both** the flag/allowlist **and** registry membership, no single accidental edit flips production: a registry change alone still only writes shadow rows; a flag flip alone only matters for registry-enabled types. This is the same belt-and-suspenders the Telegram channel uses.

---

## 8. Rollout Plan

| Phase | Stage | Audience | Config state | Success criteria | Rollback method |
|---|---|---|---|---|---|
| **A — Shadow** | 6 | nobody (collection only) | `push=false`, registry has `PUSH`, no allowlist | Subscriptions appear in `/push_subscriptions`; `dispatchPush` writes `shadow:true` queued rows; **shadow recipients match in-app/Telegram recipients** for the same events; zero real sends | Redeploy with `PUSH` removed from registry (stops even shadow rows); or revert frontend to suppress opt-in |
| **B — Internal team** | 7 | dev/admin `auth.uid`s | `push=false` + allowlist = internal | Real push received on Android + Desktop + an installed iPhone PWA; per-device delivery rows `sent`; click deep-links into the right detail; **no duplicate** vs in-app | Remove uids from allowlist (instant; backend deploy) |
| **C — Pilot users** | 7 | small pilot cohort | `push=false` + allowlist = pilot | Pilot reports correct, timely, non-spammy notifications across their real devices; expired/stale subs pruned cleanly; no permission complaints | Shrink/empty the allowlist |
| **D — Production** | 8 | all subscribed users | `push=true`, allowlist removed | All subscribed devices receive; delivery dashboards show healthy sent/expired ratios; no double-send (there is no competing browser path); error/prune rates nominal | **Flip `channels.push = false`** — single boolean, backend-only deploy, immediate stop; subscriptions retained |

**Why rollback is safe at every phase:** push is purely additive. In-app and Telegram never depend on it, so disabling push degrades to exactly today's behavior with zero data loss. Unlike the Telegram Phase D (which had to disable a live browser sender in the same change), push has **no competing sender** → the flip is atomic and reversible.

---

## 9. Versioning Plan

| Milestone | `APP_VERSION` (frontend) | `SERVICE_VERSION` / `functions` pkg | PWA update banner? |
|---|---|---|---|
| **Before implementation** | `1.11.1.3` | `1.11.2` | — |
| **After Stage 6 ship (Phase A)** | **`1.11.3`** | **`1.11.3`** | **YES — fires once** (frontend changes: SW push handlers + permission UI). Expected and acceptable. |
| **Phase B / C (pilot)** | `1.11.3` (unchanged) | `1.11.3.x` (backend-only allowlist deploys) | **No** — backend-only, no frontend bytes change |
| **After Phase D (production activation)** | `1.11.3` (unchanged) | `1.11.3.x` (backend-only flag flip) | **No** — backend-only deploy |

**Strategy & implications:**
- **The single frontend bump happens once, at Stage 6 ship.** `APP_VERSION 1.11.3` re-stamps `SW_VERSION` via [sync-version.mjs](../scripts/sync-version.mjs), so the new SW (with push handlers) is picked up through the **existing** update-banner flow. This is the one and only "Versi baru tersedia" users see for this release.
- **All rollout phases B–D are backend-only.** Allowlist edits and the final flag flip change only Cloud Functions / `constants.js` → no `APP_VERSION` change → **no further update banners**. This mirrors the v1.11.2 discipline (backend `SERVICE_VERSION` advances independently of `APP_VERSION`).
- **Do not bump `APP_VERSION` at Phase D.** A second bump would fire a needless banner for a change users can't see.
- **Reasonableness check:** v1.11.3 is the next version in the published roadmap ([config.js VERSION_HISTORY](../js/config.js)), which already names "Push (v1.11.3)" — no renumbering needed.

---

## 10. Validation Checklist (release gate)

**Platforms** — run each scenario on all three:
- [ ] Android Chrome (browser + installed)
- [ ] Desktop Chrome / Edge
- [ ] iPhone installed PWA (iOS 16.4+) — and confirm a non-installed Safari tab is correctly gated to the install modal

**Subscribe / opt-in**
- [ ] Soft-ask appears only after a meaningful action, never cold
- [ ] iOS path forces install before prompt; never calls `subscribe()` in a tab
- [ ] Granting permission writes exactly one `/push_subscriptions/{uid}/{deviceId}` record via the callable
- [ ] Direct client write to `/push_subscriptions` is **rejected** by rules
- [ ] `denied` state shows re-enable guidance, no re-prompt
- [ ] Unsupported browser / iOS <16.4 shows **no** push affordance

**Device registry**
- [ ] Single device: one record; `lastSeenAt` refreshes on app open
- [ ] Multi device (same user, 2+ devices): distinct `deviceId` records; both receive
- [ ] Rotation: forced endpoint refresh overwrites the **same** deviceId (no duplicate)
- [ ] Device cap + endpoint-origin validation enforced in the callable

**Unsubscribe / logout**
- [ ] Settings toggle off → `subscription.unsubscribe()` + record deleted
- [ ] Logout deletes **this** device's record and unsubscribes locally; sibling devices keep working
- [ ] After logout, that device receives no further push

**Delivery**
- [ ] Shadow (Phase A): `dispatchPush` writes `channel:'push', shadow:true`; **zero** real sends
- [ ] Shadow recipients match in-app/Telegram recipients for the same events (parity)
- [ ] Real send (Phase B+): per-device statuses recorded in the `devices` map; aggregate `status` correct
- [ ] Click on notification focuses an existing window (NAV deep-link) or opens one to the right detail; cold-start deep-link lands correctly
- [ ] Idempotency: re-processing an event does not double-send (delivery `SENT` guard holds)

**Retry / expiry**
- [ ] Transient (429/5xx/network): backoff honoring `Retry-After`; recoverable via re-dispatch
- [ ] Terminal (404/410 Gone): no retry; subscription pruned; row marked `expired`
- [ ] No competing browser path → no duplicate push at Phase D

**Regression (must stay green)**
- [ ] PWA install/update banner still works; SW cache lifecycle unchanged; offline fallback intact
- [ ] In-app notifications and Telegram unchanged throughout all phases
- [ ] Rollback drill: flipping `channels.push = false` stops all sends with no data loss

---

## 11. Explicitly out of scope for v1.11.3 (do not implement)

Named once so they cannot creep in:
- Scheduled stale-subscription TTL sweep (periodic prune by `lastSeenAt`).
- Durable cross-invocation retry sweep for transient-failed push rows.
- Tightening the permissive RTDB root (`auth != null`) so child rules stop being nominal.
- `/users/{id}/notificationChannels` preferences UI / per-category muting.
- FCM, topic broadcast, badge counts, rich media.
- Server-side reminders (v1.11.4) and comment push (v1.11.5).

---

**IMPLEMENTATION PLANNING ONLY. NO CODE.**
