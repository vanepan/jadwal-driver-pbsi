# Push Pilot Activation Review — Deployment-Readiness Audit (v1.11.3)

**Status:** Audit only. No implementation, no configuration change.
**Date:** 2026-06-14
**Goal:** Determine the exact current push activation state and the *smallest* safe change to deliver real push to **only** user `evan`.
**Method:** Read of the deployed implementation — `functions/src/push/*`, `functions/src/notifications/dispatcher.js`, `functions/src/events/onEventWrite.js`, `functions/src/config/constants.js`, `js/push.js`, `js/config.js`, `service-worker.js`.

---

## 0. Headline finding (read first)

There are **two independent gates** between "deployed" and "evan receives a push," and they live in **different deploy artifacts**:

| Gate | Controls | Current value | Artifact |
|---|---|---|---|
| **Server send gate** | whether the server *sends* a real push | shadow (no send) | `functions/` (`PUSH_CONFIG.pilotAllowlist = []`) |
| **Client subscribe gate** | whether a browser can *create a subscription at all* | **disabled** | `js/config.js` (`VAPID_PUBLIC_KEY = ''`) |

> ⚠️ **`js/config.js#VAPID_PUBLIC_KEY` is the empty string in the repo.** With it empty, `js/push.js#isPushSupported()` returns `false`, so the opt-in UI never appears and `pushManager.subscribe()` is never called — **evan has no `/push_subscriptions` record and cannot create one.** Flipping the server pilot allowlist alone will deliver **nothing**; `dispatchPush` will record `failed: "no push subscription"`.
>
> **Action required before any pilot:** confirm whether the *deployed* `js/config.js` carries the real public key (it may have been set at deploy time and not committed back to the repo). If the deployed asset also has it empty, the pilot is blocked until the public key is published client-side. This is the single most important readiness gap.

The rest of this audit assumes that precondition is satisfied (public key published, matching the `PUSH_VAPID_PUBLIC_KEY` secret).

---

## 1. Exact current push activation state

```
Server pipeline:   onEventWrite → engine.processEvent → dispatcher.dispatch → dispatchPush   ✅ deployed
Registry:          assignment.* + request.* carry CHANNELS.PUSH  → dispatchPush IS invoked   ✅
Send decision:     _pushLive(recipientId) = NOTIFICATION_FLAGS.channels.push (false)
                                          || pilotAllowlist.includes(recipientId)  ([] → false)
                   ⇒ EVERY push currently records a SHADOW row and sends nothing            ✅ shadow
Secrets:           PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY set; bound to onEventWrite  ✅
VAPID load gate:   onEventWrite loads VAPID only if channels.push OR pilotAllowlist.length>0
                   ⇒ currently null (never read at runtime in pure shadow)                   ✅
Client:            VAPID_PUBLIC_KEY = '' ⇒ isPushSupported() false ⇒ NO subscriptions exist   ❌ blocker
Service worker:    push + notificationclick handlers present; lifecycle unchanged            ✅
```

**Net state:** the push *machinery* is fully deployed and exercising the shadow path (delivery rows written, nothing sent). The channel is **off by two independent controls**, and the client cannot even subscribe yet. No production user is receiving push — **confirmed by code**, not just by policy.

---

## 2. Which flags are preventing real push delivery

The send decision is `dispatcher.js#_pushLive(recipientId)`:

```
NOTIFICATION_FLAGS.channels.push === true        // config/constants.js — currently FALSE
  OR
PUSH_CONFIG.pilotAllowlist.includes(recipientId) // config/constants.js — currently []
```

Both are `false`/empty, so every recipient takes the shadow branch:

```
dispatchPush → recordDelivery({ status: QUEUED, shadow: true, target: "N device(s)" })  // sends nothing
```

A *second* flag participates upstream in `onEventWrite.js` — it decides whether the VAPID secret is even loaded:

```
pushMaySend = NOTIFICATION_FLAGS.channels.push || (pilotAllowlist.length > 0)
vapid       = pushMaySend ? {…secrets…} : null
```

So a non-empty `pilotAllowlist` does double duty: it (a) makes `onEventWrite` load VAPID and pass it to the dispatcher, and (b) makes `_pushLive(evan)` true. One edit satisfies both.

> **Important:** these are **code constants**, not runtime/remote config. Changing them requires a **functions redeploy** — there is no remote-config or RTDB-driven toggle.

---

## 3. Pilot allowlist — does it exist, and how does it work?

**Yes.** `PUSH_CONFIG.pilotAllowlist` (currently `[]`) in `functions/src/config/constants.js`. It is the per-recipient escape hatch that lets specific users get **real** push while the global `channels.push` flag stays `false`.

Mechanics:

- `dispatchPush` calls `_pushLive(notification.recipientId)`. `recipientId` is the **username** (`= /users` key `= auth.uid`, per Identity Foundation), as produced by `recipients.resolveRecipients` (`out.users.push(user.username)`).
- `_pushLive` does `pilotAllowlist.map(String).includes(String(recipientId))` — an **exact, case-sensitive** string match against the recipient's username.

> ⚠️ **Case sensitivity gotcha.** `_pushLive` does **not** lowercase, but the resolver pushes the username in its stored case. The allowlist entry must match the `/users` node key for evan **exactly** (including case). If evan's key is `Evan`, then `pilotAllowlist: ['evan']` will **not** match. Verify the exact key before editing.

- Empty allowlist (`[]`) = pure shadow (Phase A). A non-empty allowlist = Phase B pilot. Phase D flips `channels.push = true` and empties the list.

---

## 4. Smallest possible change to enable push for ONLY `evan`

**Preconditions (verify, do not assume):**
- **P1.** `js/config.js#VAPID_PUBLIC_KEY` in the *deployed* client equals the `PUSH_VAPID_PUBLIC_KEY` secret. If empty (as in the repo), publish it first — otherwise evan can never subscribe. *(A client redeploy / cache-busted asset is needed if this changes.)*
- **P2.** Confirm evan's exact `/users` key (case) → that exact string is the allowlist entry.

**The change (one line, server-side):**

```
// functions/src/config/constants.js
PUSH_CONFIG.pilotAllowlist = ['evan']   // exact /users key for evan
```

Then **redeploy functions only** (`firebase deploy --only functions`). Leave `NOTIFICATION_FLAGS.channels.push = false` untouched — that keeps everyone else in shadow.

**Then evan must opt in** (the allowlist authorizes a send; it does not create a subscription):
- Evan signs in → soft-ask appears (or trigger `enablePush()` from a gesture) → grants permission → `pushManager.subscribe()` → `registerPushSubscription` writes `/push_subscriptions/evan/{deviceId}`.
- On iPhone this requires the **installed PWA** (A2HS) first (see §6.3).

That is the minimum: **one constant edit + functions redeploy + evan opts in.** No frontend logic change, no rules change, no `channels.push` flip, no envelope/version bump.

---

## 5. Rollback procedure

Push send is reversible with a single edit; nothing is destructive or one-way.

1. **Primary (instant disable of sends):**
   ```
   PUSH_CONFIG.pilotAllowlist = []
   ```
   Redeploy functions. `_pushLive(evan)` returns `false` again → `dispatchPush` reverts to recording shadow rows and sends nothing. `pushMaySend` also returns to `false`, so VAPID stops being loaded. **No further push reaches anyone.** This is the whole rollback.

2. **Optional device cleanup (evan-side):** evan toggles push off → `disablePush()` → `pushManager.unsubscribe()` + `unregisterPushSubscription` deletes `/push_subscriptions/evan/{deviceId}`. Not required for rollback (subscriptions left in place are harmless once the allowlist is empty; sends are gated server-side), but tidy.

**No data migration, no schema change to undo.** Existing `/notification_deliveries` rows (sent or shadow) are an immutable audit trail and can stay. Self-healing already handles dead subscriptions (404/410 → `pruneSubscription`).

---

## 6. Validation procedure

For all platforms, prerequisite: P1/P2 satisfied, `pilotAllowlist=['evan']` deployed, evan signed in as `evan`.

**Trigger for an end-to-end test:** create/approve/cancel an assignment or request that resolves evan as a recipient (evan as the assigned driver, or evan as the requester via `payload.requesterId`). That mints `/events/{id}` → engine → `dispatchPush(evan)` → real send.

### 6.1 Desktop Chrome
1. Sign in as evan in Chrome (PWA install optional on desktop). Accept the soft-ask → permission prompt → **Allow**.
2. Verify `/push_subscriptions/evan/{deviceId}` exists with `platform: "desktop-chrome"`, `endpoint` on `fcm.googleapis.com`.
3. Fire a triggering event. Expect an OS notification with the templated title/body.
4. Click it → existing window focuses and routes (`pbsi:push-nav` → `?view=…&id=…`); or a new window opens at the deep link.
5. Confirm `/notification_deliveries/{eventId__evan__push}` = `status: sent`, `devices: { <deviceId>: { status:"sent", attempts:1 } }`, `shadow: absent/false`.

### 6.2 Android Chrome
1. Install the PWA (A2HS) or use Chrome tab. Sign in as evan → enable push → **Allow**.
2. Verify `/push_subscriptions/evan/{deviceId}` with `platform: "android-chrome"`.
3. **Background test (the important one):** lock the device / background the app, then fire the event. Expect a heads-up notification in the tray.
4. Tap → app opens/focuses at the deep link.
5. Confirm the same `sent` delivery row as 6.1.

### 6.3 iPhone PWA
1. **Must install first:** open in Safari (iOS **16.4+**), Share → *Add to Home Screen*. Launch from the home-screen icon (standalone). The `js/push.js` iOS gate (`isIOSSafari && !isInstalled → showIOSInstallModal()`) blocks subscription in the Safari tab by design.
2. In the installed PWA, sign in as evan → enable push → **Allow**.
3. Verify `/push_subscriptions/evan/{deviceId}` with `endpoint` on `web.push.apple.com`.
4. Background the PWA, fire the event → expect a notification on the lock screen.
5. Tap → PWA opens at the deep link.
6. Confirm the `sent` delivery row (Apple endpoint).

**Negative checks (all platforms):**
- A *non*-allowlisted recipient on the same event gets `status: queued, shadow: true` (no OS notification). This proves isolation.
- Re-fire / reprocess the same event → **no second notification** (idempotency, §8); delivery row stays `sent`.
- Revoke OS permission, fire again → eventual 404/410 → `pruneSubscription` removes the device row, delivery records `expired`.

---

## 7. Expected RTDB records during the pilot

On evan opting in:
```
/push_subscriptions/evan/{deviceId} = {
  endpoint, keys:{p256dh,auth}, platform, userAgent, appVersion,
  createdAt, lastSeenAt, enabled:true, expiredAt:null
}
```

On an event that resolves evan (+ possibly others), e.g. `assignment.created`:
```
/events/{eventId}                                   ← canonical envelope (unchanged path)
/notifications/evan/{eventId}                       ← { type, title, body, channels:[inApp,telegram,push], status:dispatched, readAt:null }
/notification_deliveries/{eventId__evan__inApp}     ← status: SENT      (channels.inApp = true)
/notification_deliveries/{eventId__evan__telegram}  ← status: QUEUED, shadow:true   (telegram still OFF — browser is live sender)
/notification_deliveries/{eventId__evan__push}      ← status: SENT, attempts:1, devices:{<deviceId>:{status:"sent"}}, target:"1 device(s)"   ← REAL send
```

For any **other** recipient on the same event:
```
/notification_deliveries/{eventId__<other>__push}   ← status: QUEUED, shadow:true   ← still shadow (not allowlisted)
```

Also preserved (Telegram audit foundation is untouched): the browser path continues to write `/telegram_deliveries/*` exactly as today.

---

## 8. Risk of duplicate notifications

**Within the push channel: no.** Three structural guards:
- One notification per recipient per event (`notificationId = keySafe(eventId)`; `persistNotification` skips if it exists).
- `deliveryId = eventId__evan__push` is deterministic; `dispatchPush` checks for an existing `sent` row and returns early before re-sending.
- Re-processing/replaying the same event is therefore a no-op for sends.

**Multi-device is not duplication.** If evan is signed in on phone + desktop, he gets one push *per device* — intended fan-out, recorded as a per-device map in the single delivery row.

**Cross-channel is not duplication.** Evan may see a Telegram message (from the still-live browser sender) **and** a push for the same event. These are different channels by design, not a duplicate. *(If that feels redundant during the pilot, it is a UX observation, not a defect — and it disappears at the Phase D Telegram cutover.)*

**The one real risk:** `tag: data.entityId` in the SW collapses repeat notifications for the *same entity*. Distinct events on the same entity (e.g. `assignment.created` then `assignment.cancelled`) will **replace** rather than stack on the device. Expected behavior; flagged so it isn't mistaken for a lost notification during validation.

---

## 9. Is Telegram affected?

**No.** Telegram send is gated independently by `NOTIFICATION_FLAGS.channels.telegram` (still `false`) and the Telegram token load in `onEventWrite` (`token = channels.telegram ? … : null`). The pilot edit touches only `PUSH_CONFIG.pilotAllowlist`, consumed solely by `_pushLive` and the `pushMaySend`/VAPID branch. `dispatchTelegram` continues to record shadow rows; the **browser remains the live Telegram sender**, unchanged. Enabling push for evan changes nothing about Telegram for evan or anyone else.

---

## 10. Recommended rollout sequence

1. **Resolve the client-key precondition (P1).** Publish `VAPID_PUBLIC_KEY` in the deployed `js/config.js` (matching the secret); redeploy the client; confirm `isPushSupported()` is true and the soft-ask appears. *Until this is done, no pilot is possible.* Commit the key back to the repo so it isn't lost.
2. **Single-user pilot — evan.** `pilotAllowlist = ['evan']` (exact case), redeploy functions. Evan opts in on each target device. Run the §6 validation across Desktop Chrome, Android Chrome, iPhone PWA. Watch `/notification_deliveries` for real `sent` rows and confirm non-allowlisted recipients stay `shadow:true`.
3. **Soak.** Leave the single-user pilot running for a few days of real events; confirm no duplicates, correct deep-links, and that dead subscriptions self-prune (`expired`).
4. **Widen the pilot.** Add a handful more usernames to `pilotAllowlist` (e.g. one driver, one bidang/requester) to exercise every recipient role and multi-device. Redeploy.
5. **General availability.** Flip `NOTIFICATION_FLAGS.channels.push = true` **and** empty `pilotAllowlist = []` in the same change; redeploy. Now `_pushLive` returns true for everyone with a subscription.
6. **(Separate track) Telegram cutover.** Unrelated to push; when `channels.telegram` flips true, the browser `send*` calls in `js/notification-service.js` must be disabled in the *same* change to avoid double Telegram sends (see project memory / `NOTIFICATION_ENGINE_ARCHITECTURE_v1.11.2.md`). Do not bundle this with push GA.

Each step is independently reversible by emptying the allowlist (steps 2–4) or re-flipping the flag (step 5), per §5. No step requires a frontend logic change beyond step 1, and no envelope/version bump is needed for the pilot itself.

---

### Appendix — readiness scorecard

| Item | State |
|---|---|
| Functions deployed (engine, dispatcher, push send, callables) | ✅ |
| `dispatchPush` real send path (resolve subs → send → prune → record) | ✅ |
| VAPID secrets set + bound to `onEventWrite` | ✅ |
| Registry membership (PUSH on assignment/request) → dispatch invoked | ✅ |
| Shadow gating (`pilotAllowlist=[]`, `channels.push=false`) | ✅ pure shadow |
| Service worker `push` + `notificationclick` handlers | ✅ |
| Idempotency / no-duplicate guarantees | ✅ |
| Telegram isolation | ✅ unaffected |
| **Client `VAPID_PUBLIC_KEY` published** | ❌ **empty in repo — verify deployed asset; blocks all subscriptions if empty** |
| Exact `/users` key case for `evan` (allowlist match) | ⚠️ verify before editing |
