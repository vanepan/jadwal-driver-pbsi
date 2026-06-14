# Reminder Push Engine — Architecture v1.11.4 **REV2** (Correction Pass)

**Status:** Design / architecture only. No implementation, no commits, no deploy.
**Date:** 2026-06-14
**Supersedes:** the affected sections of `REMINDER_PUSH_ENGINE_ARCHITECTURE_v1.11.4.md`.
**Driven by:** `REMINDER_ENGINE_READINESS_REVIEW.md` → verdict **B (changes required)**.
**Companion:** `ASSIGNMENT_LIFECYCLE_NOTIFICATION_AUDIT.md` (Part B).

This document carries forward everything in REV1 that the readiness review **verified as sound** — the `assignment.reminder` event model, the deterministic id, the materialized `/reminders` schedule, the every-5-min `asia-southeast1` tick with explicit `+07:00` time math, the staleness/grace guards, the three additive data edits (registry/recipients/templates), `REMINDER_FLAGS`, `SERVICE_VERSION → 1.11.4` with no `APP_VERSION` bump — and **rewrites the five sections the review found wrong or incomplete**. Where REV2 and REV1 disagree, **REV2 wins.**

---

## Correction summary (what changed and why)

| # | REV1 said | REV2 corrects to | Root cause |
|---|---|---|---|
| 1 | "one sanctioned dispatcher edit (`liveFor`)" gates send | **Two** gates: credential load in `onEventWrite.js` **and** `liveFor` in `dispatcher.js`, both keyed on event type via `REMINDER_FLAGS` | Credentials are loaded in `onEventWrite`, not the dispatcher; without the upstream gate, reminder Telegram/Push get `null` creds and fail |
| 2 | `liveFor` is incidental | `liveFor(channel, notification)` is **specified** and **paired** with the credential gate (both must agree) | The dispatcher decides send-vs-shadow; the credential gate decides whether creds even exist. They are two halves of one decision. |
| 3 | "re-emit the same eventId → engine guards no-op → recovery" | Re-write of an existing event key does **NOT** re-fire `onValueCreated`; the engine does **not** re-run. Behavior is **at-most-once**. Dedup ≠ retry ≠ recovery. | `onEventWrite` is `onValueCreated` (create-only); `set()` on an existing key is an update |
| 4 | `/reminders` "server-only (nominal under permissive root)" | Explicit `/reminders` rules block (`".write": "false"`) is **required**, not nominal | Root rules are permissive (`auth != null`); without an explicit block, clients can forge timer rows |
| 5 | pilot lessons scattered | Consolidated **push-pilot lessons** section constraining the flag block and VAPID reuse | Real pilot surfaced exact-case allowlist, Apple VAPID subject, subscription prerequisite, notification-replacement |

---

## §1. Credential-Gate Layer (REQUIRED — REV1 omitted this) — `onEventWrite.js`

### 1.1 The problem REV1 missed

Channel credentials are **not** loaded in the dispatcher. They are resolved once, upstream, in `onEventWrite.js` and passed into `processEvent(event, { token, vapid })`. The current gate keys **only** on `NOTIFICATION_FLAGS`:

```js
// functions/src/events/onEventWrite.js — CURRENT (lifecycle-only gating)
const token = NOTIFICATION_FLAGS.channels.telegram ? TELEGRAM_BOT_TOKEN.value() : null;
const pushMaySend = NOTIFICATION_FLAGS.channels.push ||
  (Array.isArray(PUSH_CONFIG.pilotAllowlist) && PUSH_CONFIG.pilotAllowlist.length > 0);
const vapid = pushMaySend ? { subject, publicKey, privateKey } : null;
```

Consequence: a reminder event arriving while `NOTIFICATION_FLAGS.channels.telegram === false` (its permanent state until the *lifecycle* Phase D) receives `token = null`. The dispatcher then records `FAILED: telegram token unavailable` — **so REV1's headline "reminder Telegram can lead the lifecycle cutover" is unachievable with a dispatcher-only edit.** Push only works today by accident (the lifecycle `pilotAllowlist` happens to be non-empty, so `vapid` loads).

### 1.2 The corrected gate — type-aware, lifecycle-independent

`onEventWrite` already has `envelope.type` in hand. The credential load must consider **both** flag blocks, choosing per event type:

```text
isReminder = (envelope.type === 'assignment.reminder')

# Telegram token — load if EITHER the lifecycle channel is live
# OR this is a reminder and the reminder Telegram channel is live.
telegramMaySend =
      NOTIFICATION_FLAGS.channels.telegram
   || (isReminder && REMINDER_FLAGS.channels.telegram)
token = telegramMaySend ? TELEGRAM_BOT_TOKEN.value() : null

# VAPID — load if EITHER lifecycle push may send (flag or lifecycle pilot)
# OR this is a reminder and reminder push may send (flag or reminder pilot).
pushMaySend =
      NOTIFICATION_FLAGS.channels.push
   || PUSH_CONFIG.pilotAllowlist.length > 0
   || (isReminder && (REMINDER_FLAGS.channels.push || REMINDER_FLAGS.pilotAllowlist.length > 0))
vapid = pushMaySend ? { subject: PUSH_CONFIG.subject, publicKey, privateKey } : null
```

**Telegram token loading.** Loaded whenever the lifecycle telegram channel is live **or** the event is a reminder and `REMINDER_FLAGS.channels.telegram` is true. This is what lets reminder Telegram (Phase C) go live while lifecycle Telegram stays OFF — with **zero double-send risk**, because there is no legacy browser sender for reminders (verified: `js/notification-service.js` has no reminder-of-this-kind server cutover conflict; its `checkAndSend*Reminders` are the *old* browser reminders that v1.11.4 will retire — see §1.4).

**VAPID loading.** Loaded whenever lifecycle push may send **or** the event is a reminder and reminder push may send. Critically, **reuse `PUSH_CONFIG.subject`** — do not introduce a reminder-specific subject (Apple validates it; see §5). Reminder push must not depend on the lifecycle `pilotAllowlist` being non-empty.

**REMINDER_FLAGS interaction.** The flag block (unchanged from REV1):
```text
REMINDER_FLAGS = {
  enabled: false,                                  // tick emits events at all?
  channels: { inApp: true, telegram: false, push: false },
  pilotAllowlist: [],                              // real reminders while flags OFF
}
```
`onEventWrite` consults `REMINDER_FLAGS.channels.*` / `.pilotAllowlist` **only for `assignment.reminder` events**. Lifecycle events are completely unaffected — they continue to read `NOTIFICATION_FLAGS` / `PUSH_CONFIG` exactly as today.

**Lifecycle independence (the guarantee, now real).** Because both the credential gate (§1) and the send gate (§2) branch on `isReminder`, reminder channels advance/rollback by flipping `REMINDER_FLAGS` **without touching** `NOTIFICATION_FLAGS`. Reminder Telegram can go live (Phase C) before the lifecycle Telegram cutover; reminder push pilot can run on its own allowlist independent of the lifecycle push pilot.

### 1.3 Change inventory correction

REV1's appendix listed a `dispatcher.js` edit but **omitted `onEventWrite.js`**. REV2 adds it:

| File | Change | Kind |
|---|---|---|
| `functions/src/events/onEventWrite.js` | type-aware credential gate (above) | **additive (required — was missing)** |
| `functions/src/notifications/dispatcher.js` | `liveFor(channel, notification)` (see §2) | additive (gate only) |

### 1.4 Retire the legacy browser reminders (or they double-send)

`js/notification-service.js` already ships `checkAndSendH1Reminders` / `checkAndSendHoursReminders` (H-1 day / ~2h, browser-side, localStorage-deduped). When reminder **Telegram** goes live (Phase C), these browser senders **will double-send** to driver+requester. Therefore, **disabling the browser reminder calls is part of the reminder Telegram cutover** — the same "flip server on + browser off in one change" discipline as the lifecycle Telegram cutover. (This is a reminder-specific exception to "reminders have no legacy sender": they have no legacy *server* path, but they **do** have a legacy *browser* reminder path that must be retired at Phase C.) Capture this in the rollout checklist.

> Correction to REV1 §8.2: the claim "reminders have no legacy browser equivalent" is **false** for Telegram — `checkAndSendH1Reminders`/`checkAndSendHoursReminders` are exactly that. Push has no legacy equivalent. So reminder **Push** can lead freely; reminder **Telegram** must retire the browser reminders in the same change.

---

## §2. Dispatcher — `liveFor(channel, notification)` and its relationship to the credential gate

### 2.1 Specification

Today the dispatcher gates each channel separately: Telegram on `NOTIFICATION_FLAGS.channels.telegram` ([dispatcher.js:106](functions/src/notifications/dispatcher.js#L106)), Push on `_pushLive(recipientId)` ([dispatcher.js:162-166](functions/src/notifications/dispatcher.js#L162)). REV2 generalizes the send-vs-shadow decision into one helper, branching on the **notification type** (the record carries `type` — [model.js:54](functions/src/notifications/model.js#L54)):

```text
function liveFor(channel, notification, recipientId):
    isReminder = (notification.type === 'assignment.reminder')
    if channel === TELEGRAM:
        return isReminder ? REMINDER_FLAGS.channels.telegram
                          : NOTIFICATION_FLAGS.channels.telegram
    if channel === PUSH:
        if isReminder:
            return REMINDER_FLAGS.channels.push
                || REMINDER_FLAGS.pilotAllowlist.includes(recipientId)   # exact-case (see §5)
        return NOTIFICATION_FLAGS.channels.push
            || PUSH_CONFIG.pilotAllowlist.includes(recipientId)
    if channel === IN_APP:
        return NOTIFICATION_FLAGS.channels.inApp   # in-app is shared; reminders inherit it
```

`dispatchTelegram` replaces its inline `NOTIFICATION_FLAGS.channels.telegram` check with `liveFor(TELEGRAM, notification, recipientId)`; `dispatchPush` replaces `_pushLive(recipientId)` with `liveFor(PUSH, notification, recipientId)`. `_pushLive` is folded into `liveFor` (or kept as the lifecycle branch it calls). **No change to how any channel actually sends.**

### 2.2 Relationship to the credential gate (they are two halves of one AND)

A channel sends **iff** `liveFor(...)` is true **AND** the credential it needs was loaded by `onEventWrite` (§1). The two must agree:

| | credential loaded (§1) | `liveFor` true (§2) | Result |
|---|---|---|---|
| both | ✅ | ✅ | **real send** |
| gate true, no cred | ❌ | ✅ | `FAILED: …unavailable` (the bug REV1 would have shipped) |
| cred loaded, gate false | ✅ | ❌ | **shadow** (intended during pilot soak) |
| neither | ❌ | ❌ | shadow, no secret read (pure Phase A) |

Because **both** gates derive from the **same** `REMINDER_FLAGS` (one reads `.channels`/`.pilotAllowlist` for the credential decision, the other for the send decision), they cannot disagree as long as both consult the same flags for the same event type. **This coupling is the correctness requirement** — REV2 mandates that the §1 credential gate and the §2 `liveFor` gate read identical `REMINDER_FLAGS` predicates for `assignment.reminder`.

---

## §3. Idempotency — rewritten (REV1 was wrong about recovery)

### 3.1 The incorrect REV1 assumption (removed)

REV1 (§4 steps 5–6, §7) claimed: *"if the tick crashes after the event write but before marking `fired`, the next tick re-emits the same deterministic eventId → the engine's guards make the re-emit a no-op,"* implying re-emit **re-runs the engine** and recovers a partial delivery. **This is false.**

`onEventWrite` is `onValueCreated('/events/{eventId}')` — it fires **only on create** (path goes non-existent → existent). `writeEventWithId(id, …)` re-writing an **existing** key is a `set()` = **update**, which fires `onValueUpdated` (not subscribed), **not** `onValueCreated`. **Re-emit does not re-trigger the engine. The engine never re-runs for a given reminder event.**

### 3.2 The actual behavior — at-most-once, three clearly-separated concepts

> **Deduplication ≠ Retry ≠ Recovery.** REV1 conflated them. They are distinct:

**A. Deduplication (what the deterministic id actually buys).**
`eventId = "reminder__<assignmentId>__<offset>"` ⇒ exactly **one** `/events` node per (trip, offset), ever. Two effects, both dedup (not recovery):
1. A second tick that re-writes the same key produces **no second event** and **no second engine run** (update, not create). 
2. Even if the engine *did* somehow run twice, `notificationId = keySafe(eventId)` (`persistNotification` skips existing — [model.js:73-81](functions/src/notifications/model.js#L73)) and `deliveryId = eventId__recipientId__channel` (delivery guard skips `sent` — [dispatcher.js:113-114](functions/src/notifications/dispatcher.js#L113)) collapse it.
The combined guarantee is **at-most-once engine invocation per reminder**, and **at-most-once delivery per (reminder, recipient, channel)**.

**B. Retry (what exists, and where).**
Retry is **per-channel and in-process**, inside a single engine run: `telegram/retry.js#sendWithRetry` and `push/send.js#sendPushWithRetry` (exponential backoff, honor `Retry-After`, terminal on 4xx/Gone). Retry does **not** mean re-running the engine. If the engine run completes (even with a channel marked `FAILED` after exhausting in-process retries), there is **no** automatic re-drive.

**C. Recovery (what the system does and does NOT do).**
- **Tick-level recovery (exists):** if the tick **never created** the event (crash before `writeEventWithId` committed), the `/reminders` row stays `pending` with `fireAt ≤ now`; the next tick **creates** the event (first create → engine fires). This is real recovery for the *pre-event-write* failure.
- **Engine-partial recovery (does NOT exist):** if the event **was** created (engine fired once) but the engine threw mid-fan-out (e.g., Telegram sent, push persist failed), `onEventWrite` catches-and-logs and does **not** re-throw ([onEventWrite.js:75-77](functions/src/events/onEventWrite.js#L75)) → **no platform retry**, and re-emit cannot re-trigger it. The partial state persists. **This is identical to every push-keyed lifecycle event today** — so it is an accepted, pre-existing posture, not a reminder regression.

### 3.3 The `/reminders` row marker — optimization, not correctness

The row `status` (`pending → fired`) is a **fast pre-filter** so the common case never re-writes the event. It is **not** the idempotency guarantee (the deterministic key + create-only trigger are). Belt-and-suspenders, but be precise about which is which: **the create-only trigger is the correctness boundary; the row marker is the optimization.**

### 3.4 If true engine-partial recovery is ever required (explicit, out of scope for v1.11.4)

It would need a *real* mechanism — **not** re-emit. Options (deliberate future scope, not v1.11.4): (a) enable function retry on `onEventWrite` (requires full idempotency on every channel — already largely true via delivery guards, but raises double-send risk if a guard is missed); or (b) a reconciliation sweep that reads `/notification_deliveries` for a fired reminder and re-dispatches only the non-`sent` channels. v1.11.4 ships with **at-most-once** and documents it as such.

---

## §4. Reminder Security Model — `/reminders` server-only

### 4.1 The requirement (REV1 under-specified this)

`database.rules.json` root is permissive: `".read": "auth != null"`, `".write": "auth != null"`. Without an explicit block, **any authenticated client could write `/reminders`** — forging timer rows, suppressing a reminder (`status: cancelled`), or scheduling spurious `fireAt`s that the tick would mint into events. REV1 called this "nominal"; REV2 makes it **required**.

### 4.2 The rule (mirrors `/events`, `/notifications`, `/push_subscriptions`)

```json
"reminders": {
  ".read": "auth.token.role === 'admin' || auth.token.role === 'developer'",
  ".write": "false",
  "$reminderId": { ".validate": "newData.hasChildren(['assignmentId','offset','fireAt','status'])" }
}
```

- **`".write": "false"`** — only the Admin SDK (the `onAssignmentReminderSync` trigger and the tick) writes `/reminders`. Clients never touch it. This matches the posture of every other engine node.
- **Read restricted** to admin/developer for inspectability of the timer queue, like `/events` and `/notification_deliveries`.
- Server writes bypass rules (Admin SDK), so `".write": "false"` does not impede the trigger or tick.
- The same applies to any reminder fields written elsewhere — **no client write path to reminder state exists**.

### 4.3 Posture consistency

`/reminders` joins `/events`, `/notifications`, `/notification_deliveries`, `/push_subscriptions` as **server-written, client-read-restricted**. This closes the only new attack surface reminders introduce.

---

## §5. Push-Pilot Lessons Learned (constrain the reminder design)

From the real v1.11.3 pilot (`PUSH_PILOT_ACTIVATION_REVIEW.md`, `PUSH_VAPID_*`), four lessons that **directly constrain** reminders:

1. **Exact-case pilot allowlist.** `liveFor`/`_pushLive` match the allowlist with `String(...).includes(String(recipientId))` — **no lowercasing** ([dispatcher.js:164-165](functions/src/notifications/dispatcher.js#L164)) — while the resolver pushes `user.username` in its stored case ([recipients.js:99-101](functions/src/notifications/recipients.js#L99)). **`REMINDER_FLAGS.pilotAllowlist` entries must match the `/users` key case exactly** (e.g. `evan` ≠ `Evan`). Document this on the flag block; verify the exact key before Phase B.

2. **Apple VAPID subject requirement.** Apple Web Push (`web.push.apple.com`) validates the VAPID `subject` claim and rejects an invalid domain with **403 `BadJwtToken`**; FCM/Mozilla ignore it. The working value is `PUSH_CONFIG.subject = 'https://schedule-driver-pbsi.web.app'` ([constants.js:67-73](functions/src/config/constants.js#L67)). **Reminder push MUST reuse `PUSH_CONFIG.subject`** — do not invent a reminder-specific subject. (`sendPushWithRetry` already treats 403 as terminal — [send.js:36](functions/src/push/send.js#L36) — so a bad subject would silently fail every reminder push.)

3. **Subscription prerequisite (client-side gate, independent of server send).** A user receives push **only** if `/push_subscriptions/{uid}/{deviceId}` exists, which requires the published `VAPID_PUBLIC_KEY` in `js/config.js` **and** per-device opt-in (iPhone: the **installed PWA**, iOS 16.4+). Reminder **push** (Phase B/D) inherits this precondition and cannot be validated on a device that never subscribed. **Reminder Telegram has no such precondition** → it is the lower-friction first *visible* channel, which is exactly why the §1 token-gate fix is the highest-value correction.

4. **Notification replacement (`tag` collapsing).** The service worker uses `tag: data.entityId`, so notifications for the **same entity** **replace** rather than stack on the device. A reminder (H-1h) and a later lifecycle event (e.g. `assignment.cancelled`) on the **same assignment** will overwrite each other on screen. Expected; flag it in reminder validation so a "replaced" reminder is not read as a lost one. (If H-1d and H-1h should coexist, their payloads must carry **distinct tags** — e.g. include `offset` in the tag — otherwise the H-1h reminder replaces the H-1d one. **Decision needed at implementation:** per-offset tag vs. intentional collapse.)

---

## §6. Carried forward from REV1 (verified sound — unchanged)

These need no correction (confirmed against code in the readiness review): the `assignment.reminder` event model (one type, `payload.offset` discriminator, `actor.role: "system"`, `entity.kind: "assignment"`); `writeEventWithId(id, envelope)` (REV1 §6 layer 1 — still required since `writeEvent` uses random `push()` keys); the materialized `/reminders` store + `onAssignmentReminderSync` trigger mirroring `classify()`; the `onSchedule` every-5-min `asia-southeast1` tick; explicit `+07:00` WIB time math; staleness/grace guards; the three additive data edits (registry/recipients/templates with offset-branched copy); `SERVICE_VERSION → 1.11.4`, **no** `APP_VERSION` bump, `ENVELOPE_VERSION` stays `1`. `engine.js` and `model.js` remain untouched.

---

## §7. Corrected rollout (REV1 §8.3, amended)

| Phase | `REMINDER_FLAGS` | Browser reminders (§1.4) | State |
|---|---|---|---|
| **A — Shadow** | `enabled:true`, all channels off, pilot `[]` | leave ON (still the live sender) | Rows materialize, tick fires events, engine records `/notifications` + shadow deliveries. Nothing new sends. Validate timing/recipients/copy. |
| **B — Pilot** | push+telegram via `pilotAllowlist:[<exact key>]` | leave ON, but pilot users may double-receive Telegram — **note it** | Real Push+Telegram to allowlisted reminder recipients. Requires the §1 credential gate. Verify delivery + click-through + tag behavior. |
| **C — Telegram live** | `channels.telegram:true`, pilot `[]` | **DISABLE `checkAndSendH1Reminders`/`checkAndSendHoursReminders` in the SAME change** | Reminder Telegram to everyone. Safe **only** with the browser reminders retired (else double-send). |
| **D — Push live** | `channels.push:true` | already off | Full reminders. Gated on the v1.11.3 push channel + subscription coverage. |

Each step flips `REMINDER_FLAGS` only; lifecycle `NOTIFICATION_FLAGS` is never touched. The **one** added operational step vs. REV1: **Phase C must retire the browser reminders** (§1.4).

---

## §8. Net change inventory (corrected)

| File | Change | Kind | New vs REV1 |
|---|---|---|---|
| `functions/src/events/schema.js` | `+ 'assignment.reminder'`; `+ writeEventWithId` | additive | — |
| `functions/src/events/onEventWrite.js` | **type-aware credential gate (§1)** | additive | **NEW (was missing)** |
| `functions/src/reminders/schedule.js` *(new)* | `fireAt` compute + `/reminders` maintenance | new | — |
| `functions/src/reminders/onAssignmentReminderSync.js` *(new)* | `/assignments` trigger mirroring `classify()` | new | — |
| `functions/src/reminders/tick.js` *(new)* | `onSchedule` every-5-min emitter | new | — |
| `functions/src/notifications/registry.js` | `+ 'assignment.reminder'` entry | additive | — |
| `functions/src/notifications/recipients.js` | `+ 'assignment.reminder'` case | additive | — |
| `functions/src/notifications/templates.js` | `+ 'assignment.reminder'` template (offset-branched, distinct tag decision §5.4) | additive | — |
| `functions/src/notifications/dispatcher.js` | `+ liveFor(channel, notification, recipientId)` (§2) | additive (gate only) | clarified |
| `functions/src/config/constants.js` | `+ REMINDER_FLAGS`; `SERVICE_VERSION → 1.11.4` | additive | — |
| `functions/index.js` | export new trigger + tick | additive | — |
| `database.rules.json` | **explicit `/reminders` server-only block (§4)** | additive | **NEW (was "nominal")** |
| `js/notification-service.js` | **disable `checkAndSendH1/HoursReminders` at Phase C (§1.4)** | removal (cutover) | **NEW (REV1 missed the legacy browser reminders)** |

`engine.js` and `model.js` unchanged — the reuse test still passes.

---

## §9. Final Verdict

**A. READY FOR IMPLEMENTATION.**

With REV2 incorporated, every blocker from the readiness review is resolved **in design**:
- credential gate added to `onEventWrite.js` (§1) → reminder Telegram/Push can go live independently (the previously-unimplementable Phase C now works);
- `liveFor` specified and explicitly coupled to the credential gate (§2);
- idempotency rewritten to the true **at-most-once** model with dedup/retry/recovery cleanly separated (§3);
- `/reminders` security model made explicit and server-only (§4);
- pilot lessons (exact-case allowlist, Apple VAPID subject reuse, subscription prerequisite, tag replacement) bound into the design (§5);
- legacy **browser** reminders identified and scheduled for retirement at Phase C (§1.4) — the one item REV1 entirely missed.

**Remaining conditions on implementation (not blockers — constraints to honor):**
1. The §1 credential gate and §2 `liveFor` gate **must read identical `REMINDER_FLAGS` predicates** for `assignment.reminder` (else cred/gate disagree → silent failures).
2. **Phase C must disable the browser reminders in the same change** (else double-send).
3. **Decide per-offset push `tag`** (distinct H-1d vs H-1h) vs intentional collapse (§5.4).
4. Reminder `pilotAllowlist` entries must match `/users` keys **exact-case**.

**Relationship to the lifecycle audit (Part B):** the Assignment Lifecycle Notification Audit found real operational gaps — **admins are not notified when trips start, and only silently/in-app when trips complete (no push/Telegram).** Those gaps are a **separate workstream**; the Reminder Engine **neither fixes nor is blocked by them**. Reminders are pre-trip, time-based nudges and **do not** provide departure/return real-time visibility. **v1.11.4 may begin safely** on that understanding.
