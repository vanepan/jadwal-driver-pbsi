# Reminder Engine — Readiness Review (v1.11.4)

**Status:** Architecture review only. No implementation, no commits, no deploy.
**Date:** 2026-06-14
**Question:** Can v1.11.4 (Reminder Push Engine) be implemented *exactly as designed* in
`docs/REMINDER_PUSH_ENGINE_ARCHITECTURE_v1.11.4.md`?
**Method:** Read of the *deployed implementation* (not only docs) — `functions/src/events/{schema,onEventWrite,onAssignmentWrite,onRequestWrite}.js`, `functions/src/notifications/{engine,dispatcher,recipients,registry,templates,model}.js`, `functions/src/push/{send,model}.js`, `functions/src/config/constants.js`, `functions/index.js`, `database.rules.json`. Cross-checked against the three push pilot reviews.

---

## 0. Verdict (read first)

The **core architecture holds**: the reminder event model, the deterministic-id strategy, the materialized `/reminders` schedule, and the reuse of `notifications` / `notification_deliveries` / `dispatchPush` / `dispatchTelegram` are all **confirmed implementable against the real code**. The pipeline is genuinely additive as claimed; `engine.js` and `model.js` need no change.

**But two of the design's own headline guarantees do not survive contact with the deployed code**, and the change inventory in the architecture doc is incomplete because of them:

1. **The credential gate that decides whether a channel can send lives in `onEventWrite.js`, not in `dispatcher.js`.** The design's "one sanctioned dispatcher edit" (`liveFor()`) is necessary but **not sufficient**. `onEventWrite` loads the Telegram token / VAPID keys based on `NOTIFICATION_FLAGS` only. Its stated marquee feature — *"reminder Telegram can go live independently of the lifecycle cutover"* (Phase C) — **cannot work as designed**: the token is `null` whenever `NOTIFICATION_FLAGS.channels.telegram` is false, so reminder Telegram will record `FAILED: telegram token unavailable`. This requires a second, unlisted file change. (Blocking for Phase C/D.)

2. **The re-emit-as-recovery mechanism (§4 steps 5–6, §7) is incorrect under `onValueCreated` semantics.** `writeEventWithId` re-writing an existing key is an *update*, not a *create* — so it **does not re-fire `onEventWrite`**, and the engine does **not** re-run. The deterministic id still gives correct *at-most-once* behavior (equivalent to every lifecycle event today), but the documented "next tick re-emits → engine guards no-op → partial delivery recovers" story is false and must be rewritten before implementers build a recovery path that silently does nothing.

Neither finding invalidates the design's bones. Both are **targeted corrections** (one extra file in the change set, one corrected idempotency narrative, plus two minor hardening items). Because the design as *written* cannot deliver its own Phase C independent-cutover and overstates its recovery guarantee, the honest conclusion is **B**.

---

## 1. Event Foundation assumptions — VERIFIED ✅

| Design assumption | Reality in code | Verdict |
|---|---|---|
| `assignment.reminder` is additive to `EVENT_TYPES` | `EVENT_TYPES` is an explicit array + `Set`; adding one string is the documented additive pattern ([schema.js:42](functions/src/events/schema.js#L42)) | ✅ |
| `entity.kind: "assignment"` validates | `ENTITY_KINDS` includes `'assignment'` ([schema.js:36](functions/src/events/schema.js#L36)) | ✅ |
| `actor.role: "system"` validates (no actor-role enum) | `validateEnvelope` checks `actor` is an *object* only — never its `role` ([schema.js:132](functions/src/events/schema.js#L132)) | ✅ |
| No envelope version bump | `ENVELOPE_VERSION = 1`; reminder is type-only | ✅ |
| `writeEvent` mints **random** push keys (so a deterministic writer is genuinely needed) | `writeEvent` = `db.ref('events').push()` ([schema.js:151-156](functions/src/events/schema.js#L151)) — confirmed; `writeEventWithId` does not exist and must be added | ✅ (gap correctly identified) |
| Assignment payload already carries the fields reminders need (`date`, `startTime`, `requesterId`, `driverUsername`…) | `onAssignmentWrite.buildPayload` mirrors exactly these ([onAssignmentWrite.js:47-62](functions/src/events/onAssignmentWrite.js#L47)) | ✅ |
| `classify(before, after)` transition logic is reusable for schedule maintenance | Present and self-contained ([onAssignmentWrite.js:65-81](functions/src/events/onAssignmentWrite.js#L65)) | ✅ |

The Event Foundation supports reminders as designed.

---

## 2. Notification Engine assumptions — VERIFIED ✅

- `processEvent` is the single entrypoint and is **event-type-agnostic**: validate → registry lookup → resolve → render → persist → dispatch ([engine.js:44-97](functions/src/notifications/engine.js#L44)). A reminder event flows through unchanged.
- Idempotency spine is exactly as described: `notificationId = keySafe(eventId)` and `persistNotification` skips an existing record, preserving `readAt` ([model.js:73-81](functions/src/notifications/model.js#L73)); `deliveryId = eventId__recipientId__channel` ([model.js:91-93](functions/src/notifications/model.js#L91)).
- A *missing* registry entry makes the engine no-op (`not notifiable`), and a *missing* template makes `render` return `null` → engine falls back to `title = event.type, body = ''` ([engine.js:56-57](functions/src/notifications/engine.js#L56), [engine.js:77-84](functions/src/notifications/engine.js#L77)). So the three additive data edits (registry/recipients/templates) are each independently required for a *complete* reminder, and the engine degrades safely if any is absent. As designed.

`engine.js` needs **no** change. ✅

---

## 3. Dispatcher assumptions — PARTIALLY VERIFIED ⚠️

- `dispatch` already fans to `inApp` / `telegram` / `push` with per-channel failure isolation ([dispatcher.js:47-68](functions/src/notifications/dispatcher.js#L47)). ✅
- The notification record carries `type` ([model.js:53-66](functions/src/notifications/model.js#L53)), so a `liveFor(channel, notification)` helper branching on `notification.type === 'assignment.reminder'` is feasible exactly as the design proposes. ✅
- Push gating is already a two-part `_pushLive(recipientId)` (`channels.push || pilotAllowlist.includes`) ([dispatcher.js:162-166](functions/src/notifications/dispatcher.js#L162)); mirroring it with `REMINDER_FLAGS` is a clean additive edit. ✅

**The gap (Finding 1):** the dispatcher only decides *send vs shadow*. It does **not** load credentials — by the time `dispatchTelegram`/`dispatchPush` run, the token/VAPID are already passed in from `onEventWrite`. See §4.

---

## 4. Push assumptions after real pilot activation — VERIFIED, with one design-blocking omission ❌

**What the pilot proved and the code confirms:**
- `dispatchPush` is the full real-send path (load subs → encrypted send w/ retry → prune 404/410 → aggregate per-device delivery row) ([dispatcher.js:168-232](functions/src/notifications/dispatcher.js#L168)). Reminders reuse it verbatim. ✅
- `PUSH_CONFIG.pilotAllowlist` is now `['evan']` and `subject` is the Apple-valid `https://schedule-driver-pbsi.web.app` ([constants.js:73](functions/src/config/constants.js#L73), [constants.js:81](functions/src/config/constants.js#L81)) — the VAPID-subject fix from the pilot is live. ✅
- `sendPushWithRetry` treats 403 as **terminal** ([send.js:36](functions/src/push/send.js#L36)) — exactly the Apple `BadJwtToken` class. Reminders inherit this hardening. ✅

**The blocking omission — credential gating lives in `onEventWrite`, and it is keyed to `NOTIFICATION_FLAGS` only:**

```js
// onEventWrite.js:65-72  (the ACTUAL gate, not in the design's change inventory)
const token = NOTIFICATION_FLAGS.channels.telegram ? TELEGRAM_BOT_TOKEN.value() : null;
const pushMaySend = NOTIFICATION_FLAGS.channels.push ||
  (Array.isArray(PUSH_CONFIG.pilotAllowlist) && PUSH_CONFIG.pilotAllowlist.length > 0);
const vapid = pushMaySend ? { …secrets… } : null;
const result = await processEvent({ …envelope }, { token, vapid });
```

Consequence for the design's own phases:

- **Phase C (reminder Telegram live, lifecycle Telegram still OFF):** `NOTIFICATION_FLAGS.channels.telegram` is `false` ([constants.js:48](functions/src/config/constants.js#L48)) → `token = null` → `dispatchTelegram` returns `FAILED: telegram token unavailable` ([dispatcher.js:116-117](functions/src/notifications/dispatcher.js#L116)). A `liveFor()` edit in the dispatcher **cannot fix this** — the token never arrives. The design's central justification ("reminders have no legacy browser sender, so reminder Telegram can lead the lifecycle cutover") is sound *in principle* but **unimplementable without also gating the `onEventWrite` token load on `REMINDER_FLAGS` by event type.**
- **Phase B/D (reminder push):** today `vapid` happens to load because the lifecycle `pilotAllowlist` is non-empty (`['evan']`). That is **coincidental coupling** — the moment the lifecycle pilot is emptied or push goes to global GA-then-rollback, reminder push loses its VAPID unless `onEventWrite` also consults `REMINDER_FLAGS`.

`envelope.type` *is* available at the gate, so the fix is mechanical — but it is **a required change to a file the architecture doc's appendix does not list**, and without it two of the four rollout phases do not function.

---

## 5. Telegram assumptions — VERIFIED ✅ (subject to §4)

- `dispatchTelegram` reuses `sendWithRetry` + `/telegram_deliveries` audit, gated on `chatIds` and the channel flag, with the same idempotent `getDelivery → skip if SENT` guard ([dispatcher.js:91-149](functions/src/notifications/dispatcher.js#L91)). Reminders reuse it verbatim.
- `telegramChatIds(recipient)` (gated by `notificationsEnabled`) and the dedup machinery are reused by the resolver as the design assumes ([recipients.js:68-76](functions/src/notifications/recipients.js#L68)). ✅
- The "no legacy browser reminder sender → no double-send" claim is **true** (no client code sends trip reminders). The *independence* it's meant to enable is the part blocked by §4, not the double-send analysis.

---

## 6. Is `assignment.reminder` still the correct event model? — YES ✅

Confirmed against code:
- Anchoring on the **assignment** (not the request) is correct: the assignment payload already carries `requesterId` ([onAssignmentWrite.js:58](functions/src/events/onAssignmentWrite.js#L58)), so "remind the requester" needs no second event type. `byUsername(users, p.requesterId)` resolves it ([recipients.js:43-47](functions/src/notifications/recipients.js#L43)).
- A single type discriminated by `payload.offset` keeps registry/recipients/templates DRY — consistent with how the existing table is structured.
- `actor.role: "system"` is harmless (§1). The resolver's `excludeActor` is opt-in and simply won't be passed for reminders — everyone on the trip is reminded, as intended.

No change to the event model is required.

---

## 7. Is `reminder__<assignmentId>__<offset>` still the preferred deterministic id? — YES, but its idempotency story must be corrected ⚠️

**The id strategy is correct and implementable.** `keySafe` leaves `_` untouched, so the key is stable; `notificationId = keySafe(eventId)` and `deliveryId` derive cleanly from it; one deterministic event per (trip, offset) is exactly what dedup needs.

**What is wrong is the stated *recovery* behavior built on top of it (Finding 2).** The design says (§4.5–6, §7): *"if the tick crashes after the event write but before marking `fired`, the next tick re-emits the same deterministic `eventId` → the engine's `persistNotification`/`deliveryId` guards make the re-emit a no-op."* Under the real trigger:

- `onEventWrite` is `onValueCreated('/events/{eventId}')` ([onEventWrite.js:32-37](functions/src/events/onEventWrite.js#L32)). It fires **only on create** (non-existent → existent).
- `writeEventWithId` re-writing an **existing** key is a `set()` = *update*. `onValueCreated` does **not** fire. **The engine does not re-run on re-emit.**

Net effect, traced through:
- *Event write succeeded on the first tick, engine ran to completion, row marker not yet set:* re-emit is a silent no-op update; engine already delivered once. **Correct outcome — but not for the reason stated** ("guards no-op"); the truth is "re-emit doesn't even trigger." 
- *Event write itself failed before the node existed:* re-emit *creates* it → engine runs. **Correct.**
- *Engine fired once but threw partway (e.g., Telegram sent, push persist failed):* `onEventWrite` swallows the throw and logs ([onEventWrite.js:75-77](functions/src/events/onEventWrite.js#L75)), so there is **no platform retry**, and re-emit **cannot** re-trigger it. The partial delivery is **not** recovered by re-emit.

That last case is **not a new risk** — it is identical to every push-keyed lifecycle event today (fire once, engine catches-and-logs, no retry). So the *safety posture* is sound and equivalent to production. But the architecture doc **promises a recovery that does not exist**. Before implementation, §4/§7 must be rewritten to state the real guarantee: **at-most-once engine invocation per reminder**, with the deterministic id providing *dedup* (not *re-drive*). If true crash-recovery of a partially-delivered reminder is wanted, that is a separate mechanism (e.g. enabling function retry, or a reconciliation sweep), **not** re-emit — and it would be a deliberate scope addition, not a freebie.

---

## 8. Is the `/reminders` materialized schedule still the best architecture? — YES ✅ (one hardening note)

- The recommendation (materialized rows + `.indexOn: ["fireAt"]` + `onSchedule` every-5-min tick) is sound and the toolchain supports it: `firebase-functions/v2/scheduler#onSchedule` is present in the installed deps (verified). ✅
- Server-only write posture matches `/events`, `/notifications`, `/push_subscriptions`. ✅
- **Hardening note (minor):** `database.rules.json` does **not** yet have a `/reminders` block, and the root is permissive (`.read/.write: "auth != null"`) ([database.rules.json:3-4](database.rules.json#L3)). Like the other engine nodes, `/reminders` should get an explicit `".write": "false"` block. This is the same known permissive-root cascade caveat carried by the engine work — additive, non-blocking, but should be in the change set so clients can never forge timer rows.

The deterministic `reminderId` (overwrite-in-place on reschedule, tombstone on cancel) is consistent with the `keySafe` discipline used everywhere else. ✅

---

## 9. Can reminder events reuse the pipeline without modification? — MOSTLY ✅, with the §4 exception ❌

| Component | Reused unmodified? | Note |
|---|---|---|
| `notifications` (record + idempotent persist) | ✅ Yes | `engine.js`/`model.js` untouched |
| `notification_deliveries` (audit) | ✅ Yes | deterministic `deliveryId` covers reminders |
| `dispatchPush` (send/prune/record) | ✅ Yes (send code) | gating only (see below) |
| `dispatchTelegram` (send/retry/audit) | ✅ Yes (send code) | gating only |
| **Channel *send gating*** | ❌ **No** | needs `liveFor()` in `dispatcher.js` **and** `REMINDER_FLAGS`-aware credential load in `onEventWrite.js` (Finding 1). The design listed only the first. |
| `recipients.js` | ➕ additive case | as designed |
| `registry.js` / `templates.js` | ➕ additive entries | as designed |

So the design's litmus test ("nothing in `engine.js`/`model.js` changes") **passes** — but its companion claim ("the only sanctioned edit is one `dispatcher.js` gate") **fails**: a second gate in `onEventWrite.js` is mandatory.

---

## 10. Risks discovered during the real push pilot that should influence reminder design

1. **VAPID `subject` must be a real, push-service-accepted domain** — Apple rejects an invalid claim with **403 `BadJwtToken`** ([constants.js:67-73](functions/src/config/constants.js#L67)). Already fixed for lifecycle push; reminders inherit it because they reuse the same `vapid` object. *Implication:* the §4 credential fix must pass the **same** `PUSH_CONFIG.subject`; do not introduce a reminder-specific subject.
2. **Allowlist matching is exact and case-sensitive** — `_pushLive` does `map(String).includes(String(recipientId))` with no lowercasing ([dispatcher.js:164-165](functions/src/notifications/dispatcher.js#L164)), while the resolver pushes `user.username` in stored case ([recipients.js:99-101](functions/src/notifications/recipients.js#L99)). *Implication:* `REMINDER_FLAGS.pilotAllowlist` entries must match the `/users` key case exactly — the same gotcha that bit the push pilot. Document it on the reminder flag block.
3. **Client subscription gate is independent of server send** — push only reaches a user who has a `/push_subscriptions/{uid}/{deviceId}` record, which requires the published `VAPID_PUBLIC_KEY` in `js/config.js` and per-device opt-in (iPhone: installed PWA). *Implication:* reminder **push** (Phase B/D) has the **same client precondition** as lifecycle push and cannot be validated on a device that never subscribed. Reminder **Telegram** has no such precondition and is the lower-friction first live channel — which is exactly why the §4 token-gate fix matters most.
4. **`tag: entityId` collapses notifications per entity** in the service worker — an `assignment.reminder` (H-1h) and a later `assignment.cancelled` on the *same* assignment will **replace**, not stack, on the device. Expected, but call it out in reminder validation so a "replaced" reminder isn't read as a lost one.

None of these change the reminder *architecture*; items 1–2 constrain the §4 fix and the flag block.

---

## 11. Is the rollout sequence (Phase A→D) still valid? — VALID IN SHAPE, BLOCKED IN MECHANISM ⚠️

| Phase | Intent | Works against current code as designed? |
|---|---|---|
| **A — Shadow** (`enabled`, all channels off, pilot `[]`) | rows materialize, tick fires events, engine records `/notifications` + shadow deliveries, nothing sends | ✅ Yes. Shadow path is exactly the deployed behavior. |
| **B — Pilot** (push/telegram to an allowlist) | real send to allowlisted reminder recipients | ⚠️ Push works *only because* lifecycle `pilotAllowlist` is currently non-empty (VAPID coincidentally loads). Telegram **fails** (`token=null`). Needs the §4 fix. |
| **C — Telegram live** (reminder telegram on, lifecycle telegram off) | reminder Telegram to everyone, ahead of the lifecycle cutover | ❌ **Blocked.** This is the phase that most directly depends on the §4 `onEventWrite` token-gate change. Without it, every reminder Telegram is `FAILED`. |
| **D — Push live** | full reminders, gated on lifecycle push GA | ⚠️ Depends on the §4 VAPID-gate fix to stop relying on the lifecycle allowlist being non-empty. |

The **phasing model** (advance/rollback by one boolean, shadow-first, reminder gating independent of lifecycle) is the right shape and should be kept. It simply **cannot be driven by a dispatcher-only edit** — the gate that the phases turn (`onEventWrite` credential load) is upstream of the dispatcher.

---

## Required changes before implementation (the "B" list)

These are the **minimum** changes to make the design implementable *as intended*. The architecture's bones are unchanged; this is a corrected, completed change set.

1. **[Blocking] Gate credential loading in `onEventWrite.js` on `REMINDER_FLAGS` by event type.**
   For `envelope.type === 'assignment.reminder'`, load the Telegram token when `REMINDER_FLAGS.channels.telegram` (independent of `NOTIFICATION_FLAGS.channels.telegram`), and set `pushMaySend` from `REMINDER_FLAGS.channels.push || REMINDER_FLAGS.pilotAllowlist.length` (independent of the lifecycle push flag/allowlist). Without this, Phases B (telegram), C, and D do not function. **Add `onEventWrite.js` to the change inventory** (the doc's appendix omits it).

2. **[Blocking-for-correctness] Add `liveFor(channel, notification)` to `dispatcher.js`** branching on `notification.type === 'assignment.reminder'` to consult `REMINDER_FLAGS` for the *send-vs-shadow* decision — paired with #1. (This is the edit the design *did* anticipate; it is necessary but not sufficient alone.)

3. **[Correctness] Rewrite the idempotency/recovery narrative (§4.5–6, §7).** State the real guarantee: deterministic id + `onValueCreated` give **at-most-once** engine invocation per reminder (dedup, not re-drive). Re-emit via `set()` on an existing key does **not** re-trigger the engine. If partial-failure recovery is a requirement, specify a *real* mechanism (function retry or a reconciliation sweep) as an explicit, separate scope item — do not rely on re-emit.

4. **[Hardening, minor] Add an explicit `/reminders` server-only block to `database.rules.json`** (`".write": "false"`), mirroring `/events` and `/push_subscriptions`, rather than inheriting the permissive root.

5. **[Hardening, minor] On the `REMINDER_FLAGS` block, document the exact-case `pilotAllowlist` discipline** and reuse `PUSH_CONFIG.subject` for VAPID (do not introduce a reminder-specific subject) — per the pilot risks in §10.

Everything else in the architecture doc (event model, deterministic id, materialized schedule, `writeEventWithId`, the three additive data edits, `REMINDER_FLAGS`, the every-5-min `asia-southeast1` tick, the WIB `+07:00` time math, the staleness/grace guards, `SERVICE_VERSION → 1.11.4` with no `APP_VERSION` bump) is **confirmed sound and unchanged**.

---

## Final Conclusion

**B. ARCHITECTURE CHANGES REQUIRED**

The reminder engine's design is fundamentally correct and the foundation genuinely supports it — but as *written* it cannot deliver its own Phase C/D independent cutover (credential gating lives in `onEventWrite`, not the dispatcher) and it overstates its crash-recovery guarantee (re-emit does not re-trigger `onValueCreated`). The required changes are the five targeted items above — additive in spirit, not a redesign. Apply items 1–3 before implementation begins; items 4–5 alongside.
