# PWA Push Notification Foundation — Architecture Review (v1.11.3)

**Status:** Design / architecture review only. No implementation.
**Date:** 2026-06-13
**Scope:** Add web push as a first-class channel inside the *existing* Event → Notification Engine → Dispatcher pipeline. No parallel notification path.
**Supersedes:** `docs/PUSH_NOTIFICATION_ARCHITECTURE.md` (the v1.11.1 review, written before the backend, auth, and engine existed — its three "prerequisites" are now shipped; see §0).

---

## 0. What changed since the v1.11.1 review

The earlier review's headline finding was *"the codebase is a 100% client-side static PWA with no backend, no Firebase Auth, no rules — standing up a trusted server is the real work."* **That work is done.** Push no longer requires founding new infrastructure; it slots into infrastructure that already exists:

| v1.11.1 review assumed | Reality at v1.11.3 |
|---|---|
| No backend | `functions/` Cloud Functions deployed (region `asia-southeast1`) |
| Mock PIN auth in localStorage, no `request.auth` | **Identity Foundation (v1.11.1.2):** `verifyPin` mints a custom token with a `role` claim; client `signInWithCustomToken`. RTDB rules already use `auth.uid` and `auth.token.role`. |
| `/logs` is the de-facto, forgeable event bus | **Event Foundation (v1.11.1.3):** canonical `/events` append-only outbox, validated envelope (`events/schema.js`), Admin-SDK-only writes |
| Recipient logic duplicated across 3 files | **Notification Engine (v1.11.2):** `engine.processEvent` → `recipients.resolveRecipients` → `registry` → `templates.render` → `model` → `dispatcher.dispatch` |
| Push is a greenfield design | **`dispatcher.dispatchPush` scaffold already exists** and records a shadow delivery; `CHANNELS.PUSH`, `DELIVERY_STATUS.DELIVERED` (reserved "for push receipts"), and `NOTIFICATION_FLAGS.channels.push` are all already in place |

**Consequence:** v1.11.3 is *activation*, not construction. The dispatcher comment already promises "*the future cutover is one registry edit, not a dispatcher rewrite.*" This review specifies exactly what fills the existing `dispatchPush` stub, what the device registry looks like, and how it rolls out under the established shadow-flag discipline.

---

## 1. Architecture Review (Phase 1 — Foundation Audit)

### 1.1 The pipeline push must join (unchanged)

```
 mutation (assignments / requests / comments)
        │  publishEvent → writeEvent
        ▼
   /events/{id}            ← canonical, Admin-SDK-only, validated
        │  onValueCreated
        ▼
   onEventWrite ──► engine.processEvent(event)
                          │ 1 validate envelope
                          │ 2 resolveRecipients(event, users)
                          │ 3 render + buildNotification (per recipient)
                          │ 4 persistNotification  → /notifications/{recipientId}/{id}
                          │ 5 dispatch(notification, {event, recipient, token})
                          ▼
                     dispatcher.dispatch
                       ├─ dispatchInApp    (the /notifications record IS the surface)
                       ├─ dispatchTelegram (server send, retry, audit)
                       └─ dispatchPush     ← SCAFFOLD — this release fills it
```

Push **must not** introduce a second path. It is a third arm of `dispatch()`, fed the same canonical `notification` + `context` every other channel gets.

### 1.2 What already exists (reuse, do not rebuild)

- **Idempotency spine.** `notificationId = keySafe(eventId)`; `deliveryId = eventId__recipientId__channel`. Re-processing an event neither duplicates the record nor re-sends (dispatcher checks the delivery row before sending). Push inherits this for free.
- **Per-channel delivery audit.** `/notification_deliveries/{deliveryId}` with `status ∈ {queued, sent, failed, delivered}`, `attempts`, `terminal`, `error`, `target`, `shadow`, `updatedAt`. `recordDelivery` is channel-agnostic.
- **Shadow-first migration discipline.** `NOTIFICATION_FLAGS.channels.push` already exists (OFF). While OFF, `dispatchPush` records a `{status: queued, shadow: true}` row and sends nothing — exactly the Phase A/B comparison data we want.
- **Resilience pattern to mirror.** `telegram/retry.js#sendWithRetry` classifies transient (5xx/429/network → backoff, honor `Retry-After`) vs terminal (403/chat-not-found → no retry, flag stale). Push's 404/410-Gone handling is the direct analogue.
- **Server secret pattern.** `config/secrets.js#defineSecret('TELEGRAM_BOT_TOKEN')`, bound per-function via `{ secrets: [...] }`, read lazily with `.value()` only when the channel is live. The VAPID private key follows this pattern identically.
- **Platform/install detection.** `pwa.js#_detectPlatform()` (`ios-safari | android-chrome | desktop-chrome | other`), `_detectInstalled()`, `showIOSInstallModal()`, and the 7-day `pbsi_pwa_install_dismissed` TTL pattern — all reusable for the permission flow and the iOS gate.
- **Single service worker.** `service-worker.js` is version-stamped (`SW_VERSION` from `APP_VERSION`) and owns cache/offline + the update banner. It has **no** `push`/`notificationclick` handlers yet.

### 1.3 What push requires (the gaps)

| # | Gap | Where it lands |
|---|---|---|
| G1 | A device/subscription registry | new `/push_subscriptions/{userId}/{deviceId}` (§2) |
| G2 | A protocol + server send credential | standards-based **Web Push + VAPID** via `web-push` lib; VAPID keypair in Secret Manager (§3) |
| G3 | `dispatchPush` actually sending | fill the existing stub; resolve subs, render, send-with-retry, record, prune (§4) |
| G4 | A push render variant | add a `push` case to `templates.render` → `{title, body, data:{url,type,entityId}}` (§4) |
| G5 | SW `push` + `notificationclick` handlers | extend the existing `service-worker.js` (§4, §7) |
| G6 | Permission/opt-in UX | new client module reusing `pwa.js` detection (§5) |
| G7 | Subscribe/unsubscribe callables | server-only writes, mirroring `verifyPin` (§6, §9) |
| G8 | Multi-device delivery tracking | extend the delivery row with a per-device map (§6) |
| G9 | Rules for the new node | `/push_subscriptions` write via function only; owner-scoped read (§9) |

### 1.4 Protocol decision — Web Push + VAPID (revising the v1.11.1 FCM lean)

The v1.11.1 review recommended FCM, primarily to offload payload encryption and Safari handling. Two things have changed that decision:

1. **The brief explicitly asks to avoid vendor lock-in and prefer standards.** Raw Web Push is the W3C/IETF standard; FCM is a Google transport on top of it.
2. **The hard parts FCM was sold to hide are now cheap.** The `web-push` npm library performs the `aes128gcm` payload encryption and VAPID signing server-side. iOS/iPadOS 16.4+ supports the **standard** Push API for installed PWAs *without* FCM. So the encryption/Safari arguments for FCM have largely evaporated for our scale.

**Recommendation: standards-based Web Push + VAPID, server-sent via the `web-push` library.**

| | Web Push + VAPID (recommended) | FCM |
|---|---|---|
| Lock-in | None — portable, standards-based | Google transport |
| Client weight | **Zero new SDK**; native `PushManager` | `firebase-messaging` (~30–40 KB) + second SW |
| Service worker | **Extend the existing `service-worker.js`** | Needs separate `firebase-messaging-sw.js` coexisting with the version-stamped SW (the exact risk the v1.11.1 doc flagged) |
| Server send | `web-push.sendNotification(sub, payload)` — mirrors `sendWithRetry` shape | `admin.messaging().sendEachForMulticast` |
| iOS 16.4+ PWA | Supported natively | Supported via SDK |
| Encryption | Handled by `web-push` lib | Handled by FCM |
| Stale-token signal | HTTP **404 / 410 Gone** → prune | `messaging/registration-token-not-registered` |

The decisive factor is the **single service worker**: Web Push lets us add `push`/`notificationclick` handlers to the existing, version-stamped `service-worker.js` without introducing a second SW that could destabilize the mature update flow. FCM remains a clean fallback if we ever need topic broadcast or very high fan-out — but nothing in this app's scale demands it.

> **Carry-forward risk either way:** anything beyond standard Web Push (badge counts, rich images on some platforms) is platform-dependent; the foundation targets title + body + deep-link `data` only.

---

## 2. Device Registry Design (Phase 2)

### 2.1 Stable device identity (reinstall- and rotation-safe)

A `PushSubscription.endpoint` is the natural unique identity but is a long URL (unsafe as an RTDB key, and it rotates when the browser refreshes the subscription). Mint a **stable deviceId** once per install and key the registry on it:

```
pbsi_device_id = crypto.randomUUID()   // created once; persisted in localStorage AND IndexedDB
```

- **localStorage** for fast sync access; **IndexedDB mirror** because the service worker (which has no localStorage) may need it, and IDB survives some cache clears that wipe LS.
- Re-subscribing (endpoint rotation) overwrites the **same** `deviceId` record → no orphan accumulation, the rotation problem the v1.11.1 doc called out.

### 2.2 Schema — `/push_subscriptions/{userId}/{deviceId}`

`userId === auth.uid === the /users key` (the Identity Foundation guarantees this equality).

```jsonc
/push_subscriptions/{userId}/{deviceId} = {
  endpoint:   "https://fcm.googleapis.com/fcm/send/…",   // or Mozilla/Apple push service
  keys: {
    p256dh:   "<base64url public key>",                  // from PushSubscription.toJSON()
    auth:     "<base64url auth secret>"
  },
  platform:   "android-chrome" | "ios-safari" | "desktop-chrome" | "other", // reuse _detectPlatform()
  userAgent:  "<navigator.userAgent>",
  appVersion: "1.11.3",
  createdAt:  "<ISO8601>",
  lastSeenAt: "<ISO8601>",   // refreshed each app open → drives stale TTL sweep
  enabled:    true,          // user muted push on this device without uninstalling
  expiredAt:  null           // set when a send returns 404/410; record is then pruned
}
```

**Requirements coverage:**
- **Per-user / multi-device:** each install is a distinct `{deviceId}` under the same `{userId}`. Send = fan out over `Object.values(/push_subscriptions/{userId})`.
- **Reinstall-safe:** a reinstall mints a new `deviceId` (new install = new device — correct); the old record ages out via the `lastSeenAt` TTL sweep or is pruned on first 410.
- **Logout-safe:** logout deletes *this device's* record only (§9) — siblings keep working.
- **Desktop / Android / iPhone PWA:** all three are just `platform` values on otherwise-identical records.

### 2.3 Per-channel preference (optional, additive)

Push opt-in is already represented by the *existence* of an `enabled: true` subscription, so a separate boolean isn't strictly required for the foundation. If/when a unified preferences UI lands, add `/users/{id}/notificationChannels = { inApp, telegram, push }` as an additive map — do not retrofit it as a blocker for v1.11.3.

---

## 3. Push Subscription Model & Web Push Architecture (Phase 3)

```
  Browser (installed PWA)
    │  Notification.requestPermission()  (user gesture)
    │  reg.pushManager.subscribe({ userVisibleOnly:true,
    │                              applicationServerKey: <VAPID public> })
    ▼
  PushSubscription  ──POST──►  registerPushSubscription()   (onCall, Admin SDK)
                                   │ validate endpoint origin + auth.uid ownership
                                   ▼
                              /push_subscriptions/{uid}/{deviceId}   (server-written)

  …later, on a business event…

  dispatcher.dispatchPush(notification, {recipient})
    │ load /push_subscriptions/{recipientId}
    │ render(type, event, recipient, 'push') → { title, body, data }
    │ web-push.sendNotification(sub, JSON.stringify(payload), { vapidDetails, TTL })
    ▼
  Push Service (FCM/Mozilla/Apple)  ──►  SW 'push' event  ──►  showNotification()
```

- **VAPID keypair:** one keypair for the project. **Public** key shipped to the client (safe — it's an application server identity, not a secret). **Private** key stored as a Secret Manager secret `VAPID_PRIVATE_KEY` (+ `VAPID_SUBJECT` = `mailto:` contact), bound only to the function that sends, read lazily — exactly the `TELEGRAM_BOT_TOKEN` pattern in `config/secrets.js`. No secret ever reaches the browser.
- **Standards-based, no lock-in:** the stored record is a vanilla `PushSubscription`; the send is a vanilla encrypted Web Push request. Swappable to FCM HTTP v1 later without touching the engine.
- **Payload:** keep under the ~4 KB Web Push limit — title, body, and a small `data` deep-link object only.

---

## 4. Dispatcher Integration Design (Phase 5 of the brief)

`dispatchPush` is invoked by `dispatch()` **only when `PUSH` is in `notification.channels`** — which comes from the registry entry. So there are **two independent controls**, mirroring the existing telegram migration:

1. **Registry membership** = "is this event type a push candidate?" → add `PUSH` to `channels` arrays in `registry.js`.
2. **`NOTIFICATION_FLAGS.channels.push`** = "actually send vs. record a shadow row?".

This two-part control is what makes shadow collection possible: add `PUSH` to the registry **with the flag still OFF** → `dispatchPush` runs and writes `shadow:true` queued rows (real recipient/device data) while sending nothing.

### 4.1 Contract (fills the existing stub — no new entrypoint)

```
dispatchPush(notification, { event, recipient }):
  base = { eventId, notificationId, recipientId, channel: 'push' }

  subs = load /push_subscriptions/{notification.recipientId} where enabled !== false
  if subs is empty:
      return recordDelivery({ ...base, status: FAILED, error: 'no push subscription' })

  if !NOTIFICATION_FLAGS.channels.push:                 # shadow (Phase A–C)
      return recordDelivery({ ...base, status: QUEUED, shadow: true,
                              target: subs.length + ' device(s)' })

  existing = getDelivery(deliveryId(base))              # idempotency guard
  if existing.status === SENT: return existing

  payload = render(notification.type, event, recipient, 'push')   # { title, body, data }
  perDevice = {}
  for sub in subs:
      r = sendPushWithRetry(sub, payload, vapidDetails)           # §6.2
      perDevice[sub.deviceId] = { status: r.status, attempts: r.attempts, error }
      if r.terminal (404/410): prune /push_subscriptions/{recipientId}/{deviceId}

  return recordDelivery({ ...base,
      status:  anyDeviceSent ? SENT : (anyExpired && !anyOther ? EXPIRED : FAILED),
      devices: perDevice, attempts: maxAttempts, target: subs.length + ' device(s)' })
```

**Key points**
- **No notification creation in the push layer.** It receives the canonical `notification` and renders a *channel view* of it. The engine remains authoritative — same rule already enforced for telegram.
- **Recipient resolution stays in the engine; device resolution stays in the dispatcher.** `recipients.resolveRecipients` works on the in-memory user directory and cannot read `/push_subscriptions`; resolving devices at dispatch time is correct and keeps the resolver pure. The `push: []` field currently returned by the resolver is vestigial for this design — leave it reserved or drop it; do not try to populate device tokens there.
- **`templates.render(..., 'push')`** is a new `push` case alongside the existing `telegram` case — copy lives in `templates.js` only (G4). `data.url` is a deep link (`/?view=assignment&id=…`) consumed by §7.

---

## 5. Permission Flow (Phase 4)

**Principle: never cold-fire `Notification.requestPermission()`.** A denied prompt is effectively permanent.

```
 ┌─ 1. Soft pre-prompt (in-app education card) ─────────────────┐
 │   Contextual, NOT on first load. Trigger after a meaningful  │
 │   action (driver opens first assignment / header affordance).│
 │   "Aktifkan notifikasi agar tahu langsung saat ada           │
 │    penugasan, persetujuan, atau pengingat."  [Aktifkan][Nanti]│
 └──────────────────────────────────────────────────────────────┘
            │ Aktifkan
            ▼
 ┌─ 2. iOS gate (conditional) ─────────────────────────────────┐
 │   platform==='ios-safari' && !installed → showIOSInstallModal()│
 │   iOS push REQUIRES an installed (A2HS) PWA. Do NOT prompt in  │
 │   a browser tab — subscribe() will throw.                     │
 └──────────────────────────────────────────────────────────────┘
            │ installed / non-iOS
            ▼
 ┌─ 3. Native prompt (user gesture) ───────────────────────────┐
 │   Notification.requestPermission()                            │
 └──────────────────────────────────────────────────────────────┘
            │ granted
            ▼
 ┌─ 4. Subscribe + register ───────────────────────────────────┐
 │   reg.pushManager.subscribe({userVisibleOnly,applicationServerKey})│
 │   → registerPushSubscription(subscription, deviceId, platform) │
 │   → toast "Notifikasi aktif di perangkat ini"                 │
 └──────────────────────────────────────────────────────────────┘
```

- **Denied handling:** if `Notification.permission === 'denied'`, the card shows OS-specific "re-enable in Settings" guidance instead of a dead button.
- **Anti-spam:** reuse the `pbsi_pwa_install_dismissed` 7-day TTL pattern as `pbsi_push_softasked` so "Nanti" doesn't nag.
- **Re-enable:** a Settings toggle re-runs step 3–4; flipping off calls the unsubscribe path (§6/§9) and `subscription.unsubscribe()`.
- **Reuse, don't rebuild:** `_detectPlatform`, `_detectInstalled`, `showIOSInstallModal`, and the dismiss-TTL helpers already exist in `pwa.js`.

> **Frontend note:** v1.11.3 *does* change the frontend (SW handlers + permission UI), so `APP_VERSION` (currently `1.11.1.3`) **will** bump → the "Versi baru tersedia" banner fires. That's expected here (unlike v1.11.2, which deliberately held the version to stay silent). The new SW must keep the existing cache/update logic byte-for-byte and only *add* `push`/`notificationclick` listeners.

---

## 6. Delivery Tracking Design (Phase 6)

### 6.1 Reuse `/notification_deliveries`, extend for multi-device

The existing row is keyed per `(event, recipient, channel)` — but push is multi-device. Rather than fork the key (which would break the idempotency guard the dispatcher relies on), **keep one push row per (event, recipient) and embed a per-device map**:

```jsonc
/notification_deliveries/{eventId__recipientId__push} = {
  …standard fields…,
  channel: "push",
  status:  "sent" | "failed" | "expired" | "queued",   // aggregate (sent if ≥1 device sent)
  devices: {
    "{deviceId}": { status: "sent",    attempts: 1 },
    "{deviceId}": { status: "expired", attempts: 1, error: "410 Gone" }
  }
}
```

- Add `DELIVERY_STATUS.EXPIRED = 'expired'` to `model.js` (`DELIVERED` is already reserved for future receipts).
- Aggregate `status`: `sent` if any device sent; `expired` if all deliverable devices were Gone; `failed` otherwise.

### 6.2 Retry strategy (mirror `sendWithRetry`)

```
sendPushWithRetry(sub, payload, vapidDetails, maxAttempts=3):
  classify HTTP response from web-push:
    • 201/2xx                      → ok (sent)
    • 429 / 5xx / network          → TRANSIENT: backoff (honor Retry-After header), retry
    • 404 / 410 Gone               → TERMINAL: do NOT retry; mark device expired + prune
    • 400 / 413 (bad/too-large)    → TERMINAL: log; no retry (payload/key bug, not transient)
```

- **In-process retry only** for the foundation (same as telegram). Exhausted-transient rows stay `failed` and are recoverable by **re-dispatch** (engine idempotency makes re-running an event safe and lets a partially delivered event heal).
- **Durable cross-invocation retry** (a scheduled sweep that re-drives `failed` non-terminal push rows) is a *later* enhancement, not foundation scope — call it out, don't build it.
- **Stale pruning, two sources:** (a) immediate, on 404/410 during send; (b) periodic, a scheduled sweep deleting records whose `lastSeenAt` exceeds a TTL (e.g. 60–90 days).

---

## 7. iPhone PWA Analysis (Phase 7)

| Aspect | Status on iOS / iPadOS |
|---|---|
| Web Push API | **Supported on 16.4+** — standard `PushManager` + VAPID. **No FCM required.** |
| Hard constraint | **Only inside an installed (Add-to-Home-Screen) PWA.** A Safari *tab* cannot subscribe — `pushManager.subscribe()` throws. |
| Permission trigger | Must be a **user gesture** *inside the installed app* (our step 3 gate). |
| Visibility | `userVisibleOnly: true` is mandatory — every push **must** show a notification; no silent/data-only push. |
| App must be launched once | The PWA must have been opened from the Home Screen at least once before it can subscribe. |
| Subscription durability | iOS may drop a subscription if the PWA is unused for long periods → the 404/410 prune + re-subscribe-on-open flow handles this. |
| Badges / rich media | Limited/inconsistent — target title + body + deep link only. |
| Below 16.4 | **Unsupported.** Degrade gracefully: keep in-app + Telegram; the permission card should not appear for these clients. |

**Implementation guidance:** the existing `showIOSInstallModal()` + `_detectInstalled()` are exactly the gate. Sequence for iOS: educate → require install → (re-open from Home Screen) → prompt → subscribe. Feature-detect `'PushManager' in window && 'serviceWorker' in navigator && Notification.permission !== 'denied'` before showing any push affordance, so unsupported iOS versions simply never see it.

---

## 8. Rollout Strategy (Phase 8 — shadow-first)

Push has **no competing browser send path** (unlike Telegram, where the browser is still the live sender). That removes the double-send hazard entirely — the Phase D cutover here is a *single clean flag flip*, far simpler than the Telegram cutover.

| Phase | Action | Flag / control | Sends? |
|---|---|---|---|
| **A — Subscription collection** | Ship SW handlers, permission UI, subscribe callable, registry `PUSH` added | `channels.push = false` | No — `dispatchPush` writes `shadow:true` rows; real device data accrues |
| **B — Internal testing** | Send to dev/admin devices only via a narrow allowlist (e.g. gate on `auth.uid` or a claim inside `dispatchPush`) | flag still `false` globally; allowlist override | To test devices only |
| **C — Selected users** | Expand the allowlist to a pilot cohort | allowlist | Pilot only |
| **D — Production** | Remove the allowlist; flip the flag | `channels.push = true` | All subscribed devices |

- **Validation in A/B:** compare shadow push rows against in-app/telegram deliveries for the same events — recipient parity is proven *before* a single real push leaves the server.
- **Rollback:** flip `channels.push` back to `false`. No code change, no double-send to untangle.
- **No disruption:** in-app and Telegram are untouched throughout; push is purely additive.

---

## 9. Security Review (Phase 9)

| Concern | Recommendation |
|---|---|
| **Auth ownership** | `userId === auth.uid` is guaranteed by the Identity Foundation. A push subscription (endpoint + `p256dh`/`auth` keys) is a **capability to send to that device** — treat it like a secret. |
| **Who writes `/push_subscriptions`** | **Not the client directly.** Route subscribe/unsubscribe through `onCall` functions (`registerPushSubscription`, `unregisterPushSubscription`) that write via the Admin SDK after asserting `request.auth.uid === userId` — the exact pattern `verifyPin` and `/events`/`/notifications` already use. Keep `/push_subscriptions` `.write: "false"` for clients. |
| **Read scope** | Owner + admin/developer only: `".read": "auth.uid === $userId || auth.token.role === 'admin' || auth.token.role === 'developer'"`. |
| **⚠️ Known rules limitation** | `database.rules.json` root `".read"/".write": "auth != null"` **cascades and overrides** child rules (documented for `/notifications`, `/events`, etc.). Today the real protection is "clients simply don't write these paths." `/push_subscriptions` inherits the same caveat — so the server-only-write-via-callable approach above is **load-bearing, not belt-and-suspenders**, until the permissive root is tightened (the deferred Role/Ownership Rules work). Tightening the root is the right long-term fix and should be scheduled. |
| **Subscription abuse** | In `registerPushSubscription`: validate the `endpoint` host against an allowlist of known push services (`*.googleapis.com`, `*.mozilla.com`, `*.push.apple.com`); cap devices per user (e.g. ≤ 10) to bound storage/fan-out. |
| **Stale subscriptions** | Immediate prune on 404/410 during send; periodic TTL sweep on `lastSeenAt`. Both already designed in §6.2. |
| **User logout** | On logout: call `unregisterPushSubscription(deviceId)` **and** `subscription.unsubscribe()` locally. A logged-out device must stop receiving pushes immediately. Per-device records ensure logging out one device never silences the others. |
| **VAPID private key** | Secret Manager only (`VAPID_PRIVATE_KEY`), bound per-function, read lazily with `.value()`. Public key may ship to the client (it is an identity, not a secret). |
| **Payload privacy** | Push bodies traverse third-party push services. Keep them low-sensitivity (titles + light context + opaque entity id); the full record lives behind auth in `/notifications`. |

---

## Validation Checklist

**Foundation (Phase A)**
- [ ] `/push_subscriptions/{uid}/{deviceId}` written **only** by the Admin-SDK callable; direct client write is rejected.
- [ ] `deviceId` is stable across reloads and re-subscriptions (localStorage + IDB); endpoint rotation overwrites the same record (no duplicates).
- [ ] SW gains `push` + `notificationclick` handlers **without** altering cache/offline/update behavior; `SW_VERSION` stamping intact; update banner still fires.
- [ ] Permission flow never cold-prompts; iOS path forces install first; denied state shows re-enable guidance; soft-ask respects the 7-day TTL.
- [ ] With `channels.push = false`, `dispatchPush` records `shadow:true` queued rows and sends nothing.
- [ ] Registry `PUSH` membership + flag are independent; either alone does not send.

**Activation (Phases B–D)**
- [ ] Shadow push recipients match in-app/telegram recipients for the same events (parity proven).
- [ ] Multi-device: two devices for one user both receive; per-device statuses recorded in `devices` map.
- [ ] 410 Gone → device pruned and marked `expired`; no retry.
- [ ] Transient 429/5xx → backoff honoring `Retry-After`; recoverable by re-dispatch.
- [ ] Idempotency: re-processing an event does not double-send (delivery `SENT` guard holds).
- [ ] Logout deletes this device's subscription and unsubscribes locally; siblings unaffected.
- [ ] Rollback: flipping `channels.push = false` cleanly stops all real sends.

**iOS**
- [ ] Push works only as installed PWA on 16.4+; unsupported clients never see the push affordance.
- [ ] `userVisibleOnly:true`; every push shows a notification.

---

## Recommended Implementation Plan

> Architecture only — sequencing, not code.

1. **Provision (no behavior change).** Generate VAPID keypair; add `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` secrets (mirror `TELEGRAM_BOT_TOKEN`); ship the public key to client config. Add `DELIVERY_STATUS.EXPIRED`.
2. **Device registry + callables.** Add `registerPushSubscription` / `unregisterPushSubscription` (`onCall`, Admin SDK, ownership + endpoint-origin validation, device cap). Add the `/push_subscriptions` read rule. Keep `.write:false`.
3. **Service worker handlers.** Add `push` (parse payload → `showNotification`) and `notificationclick` (focus-or-open + `postMessage` deep link) to the **existing** `service-worker.js`; add the app-side `message` listener mapping `{type:'NAV',url}` onto the existing assignment/request open flow; honor the deep-link param on cold start.
4. **Permission/opt-in UX.** New client module reusing `pwa.js` detection: soft pre-prompt → iOS install gate → native prompt → subscribe → register. Settings toggle for re-enable/disable.
5. **Push render variant.** Add the `push` case to `templates.render` → `{title, body, data:{type,url,entityId}}`. No engine change.
6. **Fill `dispatchPush`.** Load subs, send-with-retry (`sendPushWithRetry` mirroring `sendWithRetry`), per-device delivery map, prune on 404/410. Gate on `NOTIFICATION_FLAGS.channels.push`.
7. **Registry membership.** Add `PUSH` to the relevant `registry.js` entries (assignment.created/completed/cancelled, request.*, comment.added) **with the flag OFF** → begin shadow collection (Phase A).
8. **Roll out** A → B → C → D per §8, validating parity at each gate.
9. **Later (out of foundation scope):** scheduled stale-subscription TTL sweep; durable retry sweep for transient-failed push rows; tighten the permissive RTDB root (`auth != null`) so child rules stop being merely nominal; optional `notificationChannels` preferences UI.

---

**DO NOT IMPLEMENT. Architecture review only.**
