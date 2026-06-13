# Reminder Push Engine — Architecture Review (v1.11.4)

**Status:** Design / architecture review only. No implementation.
**Date:** 2026-06-14
**Scope:** Add **time-based reminders** (H‑1 day, H‑1 hour) for scheduled trips as a new *class of notification* delivered through the **existing** Event → Notification Engine → Dispatcher → Delivery pipeline. **No parallel notification path.**
**Depends on:** v1.11.1.2 Identity · v1.11.1.3 Event Foundation · v1.11.2 Notification Engine · v1.11.3 Push Foundation (deployed, shadow‑validated; push channel still disabled).

---

## 0. The one thing that is genuinely new

Every notification shipped so far is **reactive**: a state change writes `/events/{id}`, an RTDB `onValueCreated` trigger fires, the engine fans out. The whole spine is event‑driven and *synchronous with a mutation*.

A reminder has **no triggering mutation**. Nothing happens at H‑1h except the clock advancing. So the only net‑new capability v1.11.4 must build is **a clock that mints a canonical event at the right time**. Everything downstream of that event — recipient resolution, templates, persistence, dispatch, delivery tracking, idempotency, retry, push pruning — already exists and is reused unchanged.

> **Design rule for this release:** the reminder subsystem's only job is to drop a well‑formed `assignment.reminder` envelope into `/events` at the correct instant. From that row onward it is indistinguishable from any other event. If a reminder requires *any* change to `engine.js`, `dispatcher.js`, or `model.js`, that is a smell — push the logic up into the scheduler or down into `registry`/`templates`/`recipients` data.

---

## 1. Architecture Review (Foundation Audit)

### 1.1 The pipeline a reminder must join (unchanged)

```
 [NEW] Cloud Scheduler tick (every 5 min, Asia/Jakarta)
        │  scan due reminder rows → mint deterministic envelope
        ▼
   writeEvent(envelope)                 ← REUSED (events/schema.js)
        │
        ▼
   /events/{reminderEventId}            ← canonical, Admin-SDK-only, validated
        │  onValueCreated
        ▼
   onEventWrite ──► engine.processEvent(event)        ← REUSED, untouched
                          │ 1 validate envelope
                          │ 2 resolveRecipients(event, users)   ← + reminder case
                          │ 3 render + buildNotification          ← + reminder copy
                          │ 4 persistNotification → /notifications/{recipientId}/{id}
                          │ 5 dispatch(notification, {event, recipient, token, vapid})
                          ▼
                     dispatcher.dispatch              ← REUSED, untouched*
                       ├─ dispatchInApp     (optional — see §5.3)
                       ├─ dispatchTelegram  (server send, retry, audit)
                       └─ dispatchPush      (Web Push + VAPID, multi-device, prune)
```

\* one small, additive change to the dispatcher's *gating* decision is required so reminders can go live independently of the lifecycle‑event Telegram cutover (§8.2). No change to how a channel actually sends.

### 1.2 What already exists (reuse, do not rebuild)

| Capability | Lives in | Reminders inherit |
|---|---|---|
| Canonical envelope + validator + writer | `events/schema.js` | the envelope shape; needs one additive type + a deterministic‑id writer (§2, §6) |
| Single notification entrypoint | `notifications/engine.js#processEvent` | **verbatim** — reminders are just another event |
| Recipient resolution | `notifications/recipients.js#resolveRecipients` | + an `assignment.reminder` case (driver + requester) (§5.2) |
| Channel/template declaration | `notifications/registry.js` | + one registry entry (§5.1) |
| Wording (role/channel-aware) | `notifications/templates.js#render` | + reminder copy branching on `payload.offset` (§5.4) |
| Persistence + idempotency spine | `notifications/model.js` | `id = keySafe(eventId)`, `deliveryId = eventId__recipientId__channel` — **the entire idempotency guarantee** (§6) |
| Channel send + retry + audit | `dispatcher.js`, `telegram/retry.js`, `push/send.js` | **verbatim** |
| Per‑channel delivery audit | `/notification_deliveries/{id}` | **verbatim** |
| Shadow‑first flag discipline | `config/constants.js#NOTIFICATION_FLAGS`, `PUSH_CONFIG.pilotAllowlist` | mirrored as `REMINDER_FLAGS` (§8) |
| Push subscription registry + pruning | `push/model.js` | **verbatim** |

### 1.3 What reminders require (the gaps)

| # | Gap | Where it lands |
|---|---|---|
| G1 | A clock | `onSchedule` Cloud Scheduler tick, region `asia-southeast1` (§3) |
| G2 | A "what is due, and has it fired?" store | new `/reminders/{reminderId}` materialized schedule (§3.2) |
| G3 | Schedule maintenance on trip create/change/cancel | a dedicated `/assignments` trigger that mirrors `onAssignmentWrite`'s classification (§3.3) |
| G4 | A reminder event type | additive `assignment.reminder` in `EVENT_TYPES` (§2) |
| G5 | A **deterministic‑id** event write | `writeEventWithId(id, envelope)` helper (`push()` mints random keys today) (§6) |
| G6 | Recipient + registry + template entries | three additive data edits (§5) |
| G7 | Independent live‑gating for reminders | `REMINDER_FLAGS` + a `liveFor()` branch in the dispatcher (§8.2) |

There is **no** new delivery code, no new channel, no second service worker, no new client SDK. Reminders ride the v1.11.3 push transport exactly as lifecycle events do.

---

## 2. Reminder Event Model

**One additive canonical type**, not two. The H‑1d vs H‑1h distinction is data (`payload.offset`), not a new type — this keeps registry/recipients/templates DRY and lets a single deterministic‑id scheme cover both.

```
type:     "assignment.reminder"          ← additive to EVENT_TYPES (events/schema.js)
version:  1                              ← no envelope schema change
entity:   { kind: "assignment", id }     ← already a valid ENTITY_KIND
actor:    { uid: null, role: "system", displayName: "Pengingat" }   ← system-originated
timestamp: <fireAt ISO>
payload: {
  offset:        "H-1d" | "H-1h",        ← THE discriminator (drives copy + deterministic id)
  fireAt:        <ISO>,                  ← the scheduled instant (audit)
  // mirror of the assignment fields recipients + templates already consume:
  driver, driverUsername, vehicle, destination,
  date, startTime, endTime, status, requestId, requesterId
}
```

**Why one type, anchored on the assignment, with `actor.role: "system"`:**

- **Anchored on the assignment, not the request.** A reminder is about a *scheduled trip*. An approved request *is* an assignment, and the assignment payload already carries `requesterId` — so "remind the requester" is satisfied without a separate `request.reminder` type. A pending/unapproved request has no scheduled trip and therefore no reminder. This collapses the "Requester (if applicable)" target into the existing assignment fan‑out and avoids a second event type. *(If, later, requests carry a hard deadline independent of any assignment, a `request.reminder` type can be added the same additive way.)*
- **`actor.role: "system"` is new but harmless.** The validator (`validateEnvelope`) checks `entity.kind` and required fields, **not** `actor.role` against an enum — so a synthetic system actor validates today. It also makes reminders trivially distinguishable in `/events` and lets `recipients.js` skip the `excludeActor` logic (no human actor to exclude — everyone on the trip should be reminded).

**No envelope version bump** — `version` stays `1`. This is purely additive (`EVENT_TYPES` is documented as additive).

---

## 3. Scheduling Strategy

Two viable shapes. **Recommend the materialized schedule (B)**; (A) is the fallback if we want zero new storage.

### 3.1 Option comparison

| | (A) Periodic full scan | **(B) Materialized reminder rows (recommended)** |
|---|---|---|
| How | Tick queries *all* assignments, computes fireAt on the fly, decides what's due | Trip create/change writes the two `fireAt` rows once; tick reads only *due, unfired* rows |
| Tick cost | O(all upcoming assignments) every 5 min | O(reminders due this tick) — bounded, tiny |
| Idempotency | needs a separate "already fired" marker anyway | the row **is** the marker (`status`, `firedAt`) |
| Recompute on reschedule | implicit (recomputed each scan) | explicit (trigger rewrites the row) — but cheap |
| Index needs | scan/filter assignments by date | `.indexOn: ["fireAt"]` on `/reminders` |
| Failure visibility | none — ephemeral | a durable, inspectable queue |

(B) wins because it turns "is this due?" into an indexed range query and turns idempotency into a row state we already know how to reason about (same mental model as `/notification_deliveries`).

### 3.2 The materialized store

```
/reminders/{reminderId}            reminderId = keySafe("<assignmentId>__<offset>")
  {
    assignmentId,
    offset:     "H-1d" | "H-1h",
    fireAt:     <epoch ms, UTC>,        ← .indexOn for the range query
    status:     "pending" | "fired" | "cancelled" | "skipped",
    firedAt:    <ISO|null>,
    eventId:    <deterministic event id, set when fired>,   ← back-reference / dedup
    updatedAt:  <ISO>
  }
```

- **Server‑written only** (Admin SDK), same posture as `/events`, `/notifications`, `/push_subscriptions`. Clients never touch it.
- `reminderId` is deterministic per (assignment, offset) → re‑computing on a reschedule **overwrites in place**, never duplicates. Same `keySafe`‑deterministic‑key discipline used by `notifications/model.js` and `push/model.js`.

### 3.3 Schedule maintenance (who writes the rows)

A dedicated `onValueWritten('/assignments/{id}')` trigger — call it `onAssignmentReminderSync` — **mirrors `onAssignmentWrite`'s `classify(before, after)`** (reuse the same transition logic, do not re‑invent it):

| Transition | Reminder action |
|---|---|
| `assignment.created` | compute both `fireAt`s (§4), upsert two `pending` rows |
| date/`startTime` changed (`assignment.updated`) | recompute `fireAt`, upsert (overwrite in place) |
| `assignment.cancelled` / `completed` / `deleted` | set both rows `cancelled` (tombstone, not delete — keeps audit + blocks a racing tick) |

> **Separation of concerns:** keep this in its own trigger, not bolted into `onAssignmentWrite`. The event trigger's job is to mint business events; the reminder trigger's job is to maintain a timer queue. Two triggers on the same node is an established, additive Cloud Functions pattern (the cost is one extra invocation per assignment write — negligible).

### 3.4 Time zone (must get right)

Assignment `date` is `"YYYY-MM-DD"` and `startTime` is `"HH:MM"`, both **local Asia/Jakarta (WIB, UTC+7, no DST)**.

```
tripStart(UTC) = Date.parse(`${date}T${startTime}:00+07:00`)
fireAt_H-1d    = tripStart − 24h
fireAt_H-1h    = tripStart − 1h
```

Store `fireAt` as epoch‑ms UTC; compare against `Date.now()`. No DST math needed (WIB is fixed offset) — but **hard‑code +07:00 explicitly**; never rely on the Cloud Functions container's local TZ.

---

## 4. Trigger Strategy

- **Mechanism:** `onSchedule` (Cloud Scheduler → Pub/Sub) in `functions/index.js`, region `asia-southeast1`, schedule `every 5 minutes`, `timeZone: "Asia/Jakarta"`.
- **Granularity rationale:** the H‑1h reminder is the tight one; a 5‑minute tick bounds its lateness to ≤ 5 min ([T‑1h‑5m, T‑1h]). 1‑min ticks tighten this at 5× the invocation cost — not worth it for trip reminders. The H‑1d reminder is insensitive to a few minutes.
- **Tick algorithm (idempotent, re‑runnable):**
  1. `now = Date.now()`.
  2. Query `/reminders` `orderByChild("fireAt").endAt(now)`; in code filter `status === "pending"`.
  3. **Grace window / staleness guard:** skip (mark `skipped`) any row whose underlying trip already started — for H‑1h, if `now ≥ tripStart`; for H‑1d, if `now ≥ tripStart` (a day‑before reminder for a trip already underway is noise). This catches the "function was down for hours" case: late reminders that are no longer useful are suppressed, not blasted out stale.
  4. **Re‑validate against live state** (cheap single read of the assignment): confirm not cancelled/completed/deleted and fields unchanged. Guards the race where cancellation lands between maintenance and tick. If invalid → mark `cancelled`/`skipped`, emit nothing.
  5. Mint the deterministic envelope and `writeEventWithId(eventId, envelope)` (§6).
  6. Set the row `status: "fired"`, `firedAt`, `eventId`.

  Crucially, steps 5→6 are safe to repeat: if the tick crashes after the event write but before marking `fired`, the **next tick re‑emits the same deterministic `eventId`** → the engine's `persistNotification`/`deliveryId` guards make the re‑emit a no‑op. The row marker is an *optimization* to avoid re‑emitting; the deterministic id is the *correctness* guarantee. Belt and suspenders, mirroring the existing engine philosophy.

---

## 5. Delivery Strategy (reuse, three data edits)

### 5.1 Registry (`registry.js`) — one entry

```
'assignment.reminder': { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.reminder' }
```

Membership in `channels` only makes `dispatch()` *invoke* each arm; whether it actually **sends** is the flag/gating decision (§8). Identical to how `assignment.created` already lists PUSH while push is globally OFF.

### 5.2 Recipients (`recipients.js`) — one case

```
case 'assignment.reminder':
  add(resolveDriver(users, p));          // assigned driver
  add(byUsername(users, p.requesterId)); // requester, if present
  break;
```

Reuses `resolveDriver`, `byUsername`, and the dedup/`telegramChatIds` machinery verbatim. No `excludeActor` (system actor — remind everyone on the trip).

### 5.3 In‑App reminders — evaluated (recommend **include, eyes open**)

Including `IN_APP` costs nothing extra: the persisted `/notifications` record *is* the in‑app surface, and `dispatchInApp` already records it. **But** the bell still reads `/logs` until the Notification Engine Phase C UI switch ([[project_v1_11_2_notification_engine]]), so an in‑app reminder is **recorded but invisible** today.

**Recommendation:** list `IN_APP` in the registry now (forward‑compatible, gives a free audit trail and a shadow record), but do **not** count on user‑visible in‑app reminders until the bell migrates. Treat Push + Telegram as the only *visible* reminder channels for v1.11.4. This avoids coupling the reminder release to the unrelated Phase C bell cutover.

### 5.4 Templates (`templates.js`) — branch on `payload.offset`

One `assignment.reminder` template whose copy varies by offset (e.g. *"Besok"* / *"Dalam 1 jam"*), reusing `fmtDate`, `deepLink`, and the existing `push`/`telegram` render variants. The `push` variant already emits `data:{ url, type, entityId }` for click‑through — reminders get deep‑linking for free.

---

## 6. Idempotency Strategy

Three layers, two of them already built:

1. **Deterministic event id (new, the linchpin).**
   `eventId = "reminder__<assignmentId>__<offset>"`.
   `writeEvent` today uses `db.ref('events').push()` → a **random** key, which would let a re‑run create a *second* reminder event. Add `writeEventWithId(id, envelope)` that does `db.ref('events/'+keySafe(id)).set({id, ...envelope})`. One deterministic event per (trip, offset), forever.
2. **Notification id = eventId** (existing). `buildNotification` sets `id = keySafe(eventId)`; `persistNotification` skips if the record exists (preserving `readAt`). Re‑emitting the same reminder event → at most one notification per recipient.
3. **`deliveryId = eventId__recipientId__channel`** (existing). The dispatcher checks the delivery row before a Telegram/Push send and skips an already‑`sent` row. Re‑emit → no double send.

Plus the **reminder‑row `status`** (§3.2) as a fast pre‑filter so the common case never even re‑emits.

> **Trade‑off to record:** a deterministic event key breaks the chronological ordering that `push()` keys give `/events`. If any consumer relies on push‑key ordering, it must sort by `timestamp` instead. Reminder events carry an accurate `timestamp` (= `fireAt`), so time‑ordering is intact; only lexical‑key ordering is affected. Acceptable.

---

## 7. Failure Recovery Strategy

| Failure | Recovery (mostly inherited) |
|---|---|
| Tick invocation fails / Functions down for a window | Next tick re‑queries `fireAt ≤ now, status=pending` and fires late; **staleness guard (§4.3)** suppresses reminders whose trip already passed → no stale blast. |
| Tick crashes after event write, before marking `fired` | Next tick re‑emits the **same deterministic eventId** → engine + delivery guards make it a no‑op (§6). |
| Transient channel error (5xx/429/network) | `telegram/retry.js#sendWithRetry` and `push/send.js#sendPushWithRetry` back off and retry; honored `Retry-After`. **Verbatim reuse.** |
| Dead push subscription (404/410 Gone) | `dispatchPush` prunes the subscription and records `expired`. **Verbatim reuse.** |
| Trip cancelled/rescheduled between maintenance and fire | `onAssignmentReminderSync` tombstones/recomputes the row; the tick also re‑validates live state (§4.4) → cancelled trips never fire. |
| Duplicate emission from any source | Deterministic id collapses it (§6). |
| Recipient has no deliverable target (no chat id / no subscription) | Existing dispatcher records a `failed` delivery row with a reason; no crash, isolated per channel. |

No new resilience primitives — reminders reuse the engine's "re‑dispatch is always safe" property end‑to‑end.

---

## 8. Rollout Strategy (shadow‑first, mirroring v1.11.2/.3)

### 8.1 A dedicated flag block

Add to `config/constants.js`, parallel to `NOTIFICATION_FLAGS`:

```
REMINDER_FLAGS = {
  enabled: false,                 // master: does the tick emit events at all?
  channels: { inApp: true, telegram: false, push: false },
  pilotAllowlist: [],             // recipients who get REAL reminders while flags are OFF
}
```

### 8.2 Why reminders need *their own* channel gating (key insight)

The Telegram channel is globally OFF in `NOTIFICATION_FLAGS` because the **browser is still the live Telegram sender** for lifecycle events; flipping it on without the Phase D browser cutover double‑sends ([[project_v1_11_2_notification_engine]]).

**Reminders have no legacy browser equivalent — there is no existing client code that sends trip reminders.** So reminder Telegram (and push) can go live **independently** of the lifecycle‑event cutover, with zero double‑send risk.

To express that, the dispatcher's "should I actually send?" check must consult `REMINDER_FLAGS` for reminder‑type notifications and `NOTIFICATION_FLAGS` for everything else. The minimal, additive change: a small `liveFor(channel, notification)` helper in `dispatcher.js` that branches on `notification.type === 'assignment.reminder'`. The *send code itself* is untouched; only the gate moves behind one function. This is the one sanctioned dispatcher edit from §1.1.

### 8.3 Phases

| Phase | `enabled` | telegram | push | pilot | State |
|---|---|---|---|---|---|
| **A — Shadow** | true | false | false | `[]` | Rows materialize, tick fires events, engine records `/notifications` + **shadow** deliveries. **Nothing sends.** Validate timing/recipients/copy against real trips. |
| **B — Pilot** | true | false | false | `[ops uid ]` | Real Push + Telegram reminders to allowlisted recipients only (reuses the v1.11.3 pilot‑allowlist gate). Verify end‑to‑end delivery + click‑through. |
| **C — Telegram live** | true | **true** | false | `[]` | Telegram reminders to everyone. Safe with browser Telegram still live (no legacy reminder sender). |
| **D — Push live** | true | true | **true** | `[]` | Full reminders. **Gated on v1.11.3 push channel going live** (push transport must be enabled first). |

Advance/rollback by flipping one boolean — same operability contract as the engine and push foundations. Phase D explicitly **depends** on the v1.11.3 push cutover; until push is live globally, run Push reminders via the pilot allowlist (Phase B posture) only.

---

## 9. Validation Checklist

**Schedule correctness**
- [ ] `fireAt` computed with explicit `+07:00`; verified for a trip near midnight WIB and across a month boundary.
- [ ] Create assignment → two `pending` rows (`H-1d`, `H-1h`) with correct `fireAt`.
- [ ] Reschedule (date/`startTime` change) → rows overwritten in place, no duplicates.
- [ ] Cancel/complete/delete → both rows tombstoned `cancelled`; tick emits nothing.

**Trigger / tick**
- [ ] Tick fires H‑1h within ≤ 5 min of target; H‑1d on the right day.
- [ ] Simulated multi‑hour downtime → on recovery, future reminders fire; already‑started trips' reminders marked `skipped`, not sent.
- [ ] Tick crash injected after event write, before `fired` → next tick re‑emits, **zero** duplicate notifications/deliveries.

**Engine reuse / idempotency**
- [ ] Reminder event validates (`assignment.reminder`, system actor, `entity.kind=assignment`).
- [ ] Re‑emitting the same deterministic `eventId` → `persistNotification` returns `created:false`; delivery guard skips `sent` rows.
- [ ] `/events` consumers unaffected by deterministic (non‑push) keys; ordering by `timestamp` intact.

**Recipients / delivery**
- [ ] Driver + requester resolved; both reachable on enabled channels; system actor not excluded.
- [ ] Shadow phase: `/notifications` + `shadow:true` delivery rows written, **nothing sent**.
- [ ] Pilot phase: only allowlisted recipients receive real Push/Telegram.
- [ ] Push click deep‑links to the assignment (`data.url`); dead subscription pruned + `expired`.

**Rollout / safety**
- [ ] `liveFor()` gates reminder Telegram via `REMINDER_FLAGS`, not `NOTIFICATION_FLAGS` → no interaction with the lifecycle Telegram cutover; **no double‑send** observed with browser Telegram still live.
- [ ] Each flag flip advances/rolls back exactly one phase.
- [ ] In‑app reminders recorded (audit) but acknowledged invisible until bell Phase C.

---

## 10. Versioning Recommendation

- **Backend:** `SERVICE_VERSION` `1.11.3` → **`1.11.4`** (`config/constants.js`).
- **Frontend:** **no `APP_VERSION` bump.** v1.11.4 is backend‑only (scheduler + triggers + data edits); no client code changes, so the PWA "Versi baru tersedia" banner must not fire — same discipline as v1.11.2 ([[project_v1_11_2_notification_engine]]). The only client‑visible surfaces (Push, Telegram) reuse v1.11.3 transport that already shipped.
- **Envelope schema:** unchanged (`ENVELOPE_VERSION` stays `1`) — additive type only.
- **Dependency note:** full reminder push (Phase D) is gated on the v1.11.3 push channel going live globally. Reminder **Telegram** has no such dependency and can lead.

---

### Appendix — Net change inventory (for the implementation plan that follows)

| File | Change | Kind |
|---|---|---|
| `functions/src/events/schema.js` | `+ 'assignment.reminder'` in `EVENT_TYPES`; `+ writeEventWithId(id, envelope)` | additive |
| `functions/src/reminders/schedule.js` *(new)* | `fireAt` compute + `/reminders` row maintenance | new |
| `functions/src/reminders/onAssignmentReminderSync.js` *(new)* | `/assignments` trigger mirroring `classify()` | new |
| `functions/src/reminders/tick.js` *(new)* | `onSchedule` every‑5‑min emitter | new |
| `functions/src/notifications/registry.js` | `+ 'assignment.reminder'` entry | additive |
| `functions/src/notifications/recipients.js` | `+ 'assignment.reminder'` case | additive |
| `functions/src/notifications/templates.js` | `+ 'assignment.reminder'` template (offset‑branched) | additive |
| `functions/src/notifications/dispatcher.js` | `+ liveFor()` gate branching reminder vs lifecycle | additive (gate only) |
| `functions/src/config/constants.js` | `+ REMINDER_FLAGS`; `SERVICE_VERSION → 1.11.4` | additive |
| `functions/index.js` | export the new trigger + scheduled tick | additive |
| `database.rules.json` | `/reminders` server‑only (nominal under permissive root — see [[project_v1_11_2_notification_engine]] cascade note) | additive |

**Nothing in `engine.js` or `model.js` changes.** That is the test of whether reminders truly reused the pipeline.
