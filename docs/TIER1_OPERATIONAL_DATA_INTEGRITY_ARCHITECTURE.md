# Tier 1 Operational Data Integrity — Architecture (v1.11.5)

**Status:** Architecture / design only. No implementation, no code, no commits, no deploy.
**Date:** 2026-06-14
**Depends on / reads:** `OPERATIONAL_TIMESTAMP_FOUNDATION_REVIEW.md` (Tier-1 verdict), `ASSIGNMENT_LIFECYCLE_NOTIFICATION_AUDIT.md` (the two events under design), `REMINDER_ENGINE_ARCHITECTURE_v1.11.4_REV2.md` (the event spine + callable/server-only precedents).
**Scope of protection:** `actualStart`, `actualEnd`, `startOdometer`, `endOdometer`, `distanceTravelled`, `startedBy`, `completedBy`.

---

## 0. The core architectural decision (read first)

Today, operational actuals are **client-authored**: the Mulai/Selesai buttons mutate the assignment locally and persist via `saveOneAssignment` (localStorage + a direct Firebase `set`) ([app.js:7221](js/app.js#L7221), [app.js:7271](js/app.js#L7271)), under **permissive root rules** (`/assignments` inherits `.write: "auth != null"`), with **advisory-only** client validation ([validation.js:381-425](js/validation.js#L381) emits *warnings*, not rejections) and **client-computed** distance ([app.js:7255-7257](js/app.js#L7255)). The client is the authority for financial-grade data. That is the defect.

**The fix is one inversion: move write-authority for the seven protected fields from the client to the server.** The codebase already contains the exact precedent — `/push_subscriptions` is `".write": "false"` and is mutated *only* through the `registerPushSubscription` callable ([push/callables.js], rules [database.rules.json:28-34](database.rules.json#L28)). Tier-1 actuals adopt the same shape:

```
Client button  ──►  callable (startAssignment / completeAssignment / amendActual)
                        │  validate → derive → write (Admin SDK, bypasses rules)
                        ▼
                 /assignment_actuals/{id}   ".write": false   ← PROTECTED, server-only
                 /vehicle_odometer/{vehId}   ".write": false   ← running ledger
                        │  status transition still flips on /assignments
                        ▼
                 onAssignmentWrite ──► /events (assignment.started / .completed)
                        │              now GUARANTEED to carry validated actuals
                        ▼
                 audit + analytics read from /events + /assignment_actuals
```

Everything below is the elaboration of that inversion. **No analytics is designed here** — only the integrity layer the analytics roadmap will stand on.

---

## 1. Architecture

### 1.1 Protected store (server-only)

Actuals move out of the client-owned `/assignments/{id}` object into a parallel, server-written node — so the client's existing wholesale `saveAssignments`/`saveOneAssignment` pattern keeps working for *planned + workflow* fields without ever touching protected data.

```
/assignment_actuals/{assignmentId} = {
  assignmentId,
  // — start —
  actualStart:        <ISO|null>,        // = startedAt
  startOdometer:      <int|null>,
  startedBy:          { uid, role, name },
  startedAt_server:   <serverTimestamp>, // server clock, anti-tamper
  // — complete —
  actualEnd:          <ISO|null>,        // = completedAt
  endOdometer:        <int|null>,
  completedBy:        { uid, role, name },
  completedAt_server: <serverTimestamp>,
  // — derived (server authority) —
  distanceTravelled:  <int|null>,        // = endOdometer − startOdometer (server)
  actualDuration:     <int ms|null>,     // = actualEnd − actualStart (server)
  // — integrity —
  state:              "none"|"started"|"completed",
  anomalies:          [ {code, detail, severity, at} ],  // soft flags (see §3)
  lockedAt:           <ISO|null>,        // set-once seal on completion
  schemaVersion:      1
}
```

- **Rules:** `".write": "false"`, read restricted to admin/developer **and** the assigned driver (mirrors `/push_subscriptions/$userId`). Admin SDK writes bypass rules.
- **Why a separate node, not children of `/assignments/{id}`:** locking individual children to `.write:false` would break the client's whole-object `set()` (RTDB denies a parent write that touches a read-only child, even with an unchanged value). A separate protected node keeps the two ownership models cleanly separated — exactly how `/notifications` and `/push_subscriptions` already sit beside client-owned nodes.

### 1.2 Write authority — three callables (the only mutation path)

| Callable | Caller | Does |
|---|---|---|
| `startAssignment(assignmentId, { startOdometer })` | driver (or admin) with `start` permission | validate (§2.1) → write start fields → update vehicle ledger → flip `/assignments/{id}.status = 'started'` → (onAssignmentWrite emits `assignment.started`) |
| `completeAssignment(assignmentId, { endOdometer })` | driver/admin with `complete` permission | validate (§2.2) → derive distance + duration → write complete fields → seal (`lockedAt`) → update vehicle ledger → flip `status = 'completed'` → (emits `assignment.completed`) |
| `amendActual(assignmentId, { field, newValue, reason })` | **admin/developer only** | the **only** way to change a sealed actual: append-only correction (§5), never in-place edit |

The callables are the **single authority**. The client buttons stop writing actuals directly; they invoke the callable and reflect the returned state. `onAssignmentWrite` continues to emit the canonical events from the status transition — now with the guarantee that a `started`/`completed` status can *only* have been produced by a validated callable.

### 1.3 Vehicle odometer ledger (new — nothing like it exists today)

```
/vehicle_odometer/{vehicleId} = {
  lastReading:       <int>,             // last accepted odometer for this vehicle
  lastAssignmentId:  <id>,
  lastEvent:         "start"|"complete",
  lastAt:            <ISO>,
  updatedBy:         { uid, role },
}
```

Server-only. Updated **transactionally** inside the start/complete callables. This is the anchor that makes *cross-assignment* monotonic validation possible (§3.2). Without it, "is this reading plausible for this vehicle?" is unanswerable — which is the situation today.

### 1.4 Set-once + seal semantics

| Field | Writable when | Immutable after |
|---|---|---|
| `actualStart`, `startOdometer`, `startedBy` | `state == "none"` (the one start call) | start accepted |
| `actualEnd`, `endOdometer`, `completedBy` | `state == "started"` (the one complete call) | completion accepted (`lockedAt` set) |
| `distanceTravelled`, `actualDuration` | server-derived at completion | sealed; only `amendActual` recomputes |

Set-once is enforced **server-side** by reading `state` before write (a transaction guards against double-fire). After `lockedAt`, the record is history: the *only* legal mutation is an audited amendment.

---

## 2. Start & Complete Integrity

### 2.1 Actual Start Integrity

**Prevent:**
- **Duplicate starts** — callable reads `state`; if `!= "none"` → reject `already-started` (today's client guard at [app.js:7205](js/app.js#L7205) is local-only and forgeable; this makes it authoritative + transactional).
- **Editing `actualStart` / `startOdometer`** — set-once (§1.4); direct RTDB writes blocked by `.write:false`; the only post-hoc change is `amendActual`.

**Set-once behavior:** start fields are written exactly once, in the `startAssignment` transaction, gated on `state == "none"`.

**Correction workflow:** wrong start odometer/time → `amendActual` (admin) appends a correction (§5); original is preserved; distance recomputed if completed; `assignment.actual.corrected` event emitted.

**Audit requirements:** `startedBy` (uid/role/name), `startedAt_server` (server clock, not client time), and the canonical `assignment.started` event are all mandatory and immutable.

### 2.2 Actual Complete Integrity

**Prevent:**
- **Complete-without-start** — callable rejects if `state != "started"`. This closes the verified hole where a complete-without-start nulls both duration and distance ([app.js:7255-7257](js/app.js#L7255)). **Completion is only valid from a started state.**
- **Editing `actualEnd` / `endOdometer`** — set-once + seal; `amendActual` only.

**Completion requirements (all must hold or the call is rejected):**
1. `state == "started"` (a start exists).
2. `endOdometer` present, numeric, `≥ 0`.
3. `endOdometer ≥ startOdometer` (hard).
4. `actualEnd ≥ actualStart` (hard; server clocks).

**Validation sequence (ordered, fail-fast):**
```
1. load /assignment_actuals/{id}         → must exist, state=="started"
2. assert endOdometer numeric, ≥ 0
3. assert endOdometer ≥ startOdometer                       [HARD reject]
4. assert actualEnd ≥ actualStart                           [HARD reject]
5. vehicle-ledger check vs lastReading (§3.2)               [HARD or SOFT]
6. distance = endOdometer − startOdometer   (server)        [§4]
7. duration = actualEnd − actualStart       (server)
8. anomaly scan (spike / zero / duration)   (§3.4)          [SOFT flag]
9. write complete fields + distance + duration, set lockedAt
10. transactional vehicle_odometer update (lastReading=endOdometer)
11. flip status → 'completed' (emits assignment.completed)
```

**Correction workflow:** identical amendment path (§5); on any odometer amendment, `distanceTravelled` is **re-derived server-side**, never hand-edited.

---

## 3. Odometer Validation

Four layers, escalating in scope. Each violation is either **HARD** (reject the write — data would be structurally invalid) or **SOFT** (accept, but record an `anomalies[]` flag so analytics can exclude/weight — data is *suspicious*, not *impossible*).

### 3.1 Monotonic (within an assignment)
`endOdometer ≥ startOdometer`. Violation → **HARD reject** (`end-before-start-odometer`). Negative distance is never storable.

### 3.2 Vehicle-level (cross-assignment, via the ledger §1.3)
On **start**: `startOdometer ≥ vehicle.lastReading`.
- `startOdometer < lastReading` → **vehicle odometer rollback** → **SOFT flag** `vehicle-rollback` + require explicit admin override to proceed (a vehicle can't un-drive km; either a misread or a swapped unit). Configurable to HARD if policy demands.
- `startOdometer == lastReading` → normal (vehicle resumed where it stopped).
- Large positive gap (`startOdometer − lastReading` > threshold) → **SOFT flag** `untracked-mileage` (vehicle moved outside the system — still recorded, flagged for reconciliation).

### 3.3 Cross-assignment continuity
The ledger makes each completion's `endOdometer` the next assignment's expected `startOdometer` baseline. Discontinuities surface as §3.2 flags. This is what turns isolated readings into a **per-vehicle odometer timeline** — the substrate for Vehicle and Cost analytics.

### 3.4 Anomaly detection
| Anomaly | Rule | Disposition |
|---|---|---|
| `endOdometer < startOdometer` | hard inequality | **HARD reject** |
| Vehicle rollback | `startOdometer < lastReading` | **SOFT** `vehicle-rollback` (+override) |
| **Distance spike** | `distance > operations.odometerWarnJumpKm` (existing setting, [validation.js:418](js/validation.js#L418)) **or** `> k·median(vehicle history)` | **SOFT** `distance-spike` |
| **Zero-distance completion** | `distance == 0` on a completed trip | **SOFT** `zero-distance` |
| **Implausible duration** | `actualDuration < 0` | **HARD reject**; `> operations.maxTripHours` → **SOFT** `duration-outlier` |
| **Stale start** | open `started` state older than `operations.maxOpenTripHours` | **SOFT** `stale-open` (surfaced for ops follow-up; reminder-adjacent) |

The existing client `validateOdometer` is **retained as a pre-submit UX hint** (fast feedback) but is **no longer authoritative** — the callable re-runs every check server-side. Thresholds live in `settings operations.*` (already the pattern: `odometerWarnJumpKm`).

---

## 4. Distance Authority

`distanceTravelled` is reclassified from *client-computed field* to **server-derived operational field**.

- **Calculation authority:** computed **only** inside `completeAssignment` (and recomputed inside `amendActual`) as `endOdometer − startOdometer`, after validation §2.2/§3. Never accepted from the client.
- **Client trust model:** the client may *display* a provisional distance for UX, but any client-supplied `distanceTravelled` is **ignored** by the callable. The protected node's value is canonical; the client `/assignments` copy (if retained for legacy UI) is a **read-through mirror**, explicitly non-authoritative.
- **Correction behavior:** changing either odometer via `amendActual` triggers automatic server re-derivation of `distanceTravelled` **and** `actualDuration`; the prior values are preserved in the amendment record (§5). Reimbursement ([reimbursement.js:117-119](js/reimbursement.js#L117)) and all cost analytics read the derived value, so a correction propagates consistently to money.

---

## 5. Operational Audit Trail

Two complementary records; both append-only.

**(a) Canonical events (already emitted, now guaranteed-valid):** `assignment.started` / `assignment.completed` on `/events` ([onAssignmentWrite.js:77-78](functions/src/events/onAssignmentWrite.js#L77)). The Tier-1 work **enriches** the `assignment.started` payload (today thin — no driver/requesterId per the lifecycle audit) to carry the full validated actuals + actor.

**(b) Amendment ledger (new):**
```
/operational_amendments/{assignmentId}/{amendmentId} = {
  field:        "startOdometer"|"endOdometer"|"actualStart"|"actualEnd",
  originalValue, newValue,
  derivedBefore: { distanceTravelled, actualDuration },
  derivedAfter:  { distanceTravelled, actualDuration },
  reason:       <required, non-empty>,
  amendedBy:    { uid, role, name },
  amendedAt:    <serverTimestamp>,
}
```
Server-only, append-only. Each `amendActual` also emits an `assignment.actual.corrected` canonical event for the unified audit/notification spine.

**What the trail answers (the §5 requirement set):**
- **who started / completed** → `startedBy` / `completedBy`.
- **when** → `actualStart`/`actualEnd` (operator-entered) **and** `*_server` (server clock — tamper anchor).
- **original values** → preserved in `/operational_amendments` (`originalValue`, `derivedBefore`).
- **corrected values** → `newValue`, `derivedAfter`, plus the live sealed value on the protected node.

**Invariant:** an actual is never destroyed — it is sealed, and any change is an *additional* record. The current truth + its entire revision history are both always recoverable.

---

## 6. Operational Data Classification

| Tier | Definition | Integrity guarantees | Examples |
|---|---|---|---|
| **Tier 1 — Operational Truth** | Irreversible records of what physically happened; feed money + analytics + AI. | Server-write-only, set-once + sealed, server-validated, server-derived where derivable, append-only audit, immutable. | **`actualStart`, `actualEnd`, `startOdometer`, `endOdometer`, `distanceTravelled`, `actualDuration`, `startedBy`, `completedBy`** — i.e. the contents of **`assignment.started` / `assignment.completed`**. |
| **Tier 2 — Operational Plan/State** | Intent and workflow state; revisable before execution, drives scheduling. | Client-writable, validated on form, audited via `/events`, but **not** immutable. | `plannedStart`/`plannedEnd` (`date`/`startTime`/`endTime`), `driver`, `vehicle`, `destination`, `status`, assignment↔request linkage. |
| **Tier 3 — Administrative / Reference** | Configuration, directory, presentation. | Standard role-gated CRUD; no operational-integrity guarantees. | users, drivers, vehicles directory, settings, aliases, notes, UI prefs. |

**Placement of the two events:** `assignment.started` and `assignment.completed` are **Tier 1** — they are the *only* producers of Tier-1 fields. Their *triggering action* (a driver tapping Mulai/Selesai) and their *status side-effect* are Tier-2 workflow; the *captured actuals* they carry are Tier-1. The architecture above is precisely the mechanism that holds those Tier-1 payloads to Tier-1 guarantees while leaving the Tier-2 status flip on its existing client path.

> Distinguishing principle: **Tier-2 answers "what do we intend / what state is it in?" (revisable forecast). Tier-1 answers "what actually occurred?" (sealed record).** Money and AI may only stand on Tier-1.

---

## 7. Analytics Dependencies on Tier-1 Integrity

How each roadmap layer fails *without* this layer, and what it gains *with* it (carries forward the planned-vs-actual mapping from the timestamp review — 8/10 domains need actuals as primary):

| Roadmap layer | Needs from Tier-1 | Without integrity (today) |
|---|---|---|
| **Analytics Foundation** | a trustworthy actuals ledger + clean event stream | builds on mutable, optional, occasionally-null inputs → every downstream number inherits the doubt |
| **Driver Analytics** | `actualStart`/`actualEnd` (engaged hours), `startedBy`/`completedBy` (attribution) | utilization is trip-count on planned dates ([analytics-engine.js:200-213](js/analytics/analytics-engine.js#L200)); a forged/edited completion silently skews a driver's record |
| **Vehicle Analytics** | per-vehicle odometer timeline (§3.3 ledger), `distanceTravelled` | no vehicle ledger exists → utilization is count-only; rollbacks/spikes corrupt mileage |
| **Cost Analytics** | server-derived `distanceTravelled` + `actualDuration` | cost = f(km, hours); client-trusted distance + null-on-incomplete = unauditable financials (yet reimbursement already pays against it) |
| **Operational Intelligence** | planned-vs-actual delta on *validated* actuals (delay, overrun, anomaly flags) | the delta is only meaningful if actuals are real; flags (`anomalies[]`) don't exist today |
| **AI Operations Assistant** | sealed, validated, anomaly-tagged ground truth | an LLM over editable/forgeable actuals emits confident, wrong ops advice; no integrity = no safe autonomy |

**One line:** every layer above Analytics Foundation is a *function of Tier-1 fields*; integrity at Tier-1 is the precondition for any of them to be correct. Garbage-in is not a quality issue here — it is a correctness and financial-trust issue.

---

## Final Deliverables

### 1. Architecture (summary)
Invert write-authority: seven protected fields move to a server-only `/assignment_actuals/{id}` node + a new `/vehicle_odometer/{vehicleId}` ledger, mutated **only** through three validating callables (`startAssignment`, `completeAssignment`, `amendActual`) — reusing the proven `/push_subscriptions` callable+`.write:false` pattern. Set-once + seal, server-side validation (monotonic / vehicle-level / anomaly), server-derived distance & duration, append-only amendment ledger, and enriched canonical `/events`. Tier-2 workflow (status, planned fields) stays on the existing client path.

### 2. Risk Assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Callable migration breaks the Mulai/Selesai flow | High | Phased dual-write + shadow validation (Migration §3) before cutover; feature-flagged |
| Offline drivers can't reach a callable at start/complete | High | Queue-and-replay: client records intent locally, callable reconciles on reconnect with **server** timestamps as `*_server`; operator time captured as entered. Define an offline contract before cutover |
| Legacy assignments have no `/assignment_actuals` / no ledger baseline | Medium | Backfill (Migration §3.1) from existing `startedAt`/`completedAt`/odometers; seed `vehicle_odometer.lastReading` from latest completed trip per vehicle; mark backfilled records `provenance: "migrated"` (excluded from strict anomaly checks) |
| Stricter validation rejects real-but-messy field data (rollbacks, missing odometer) | Medium | Default rollback/spike/zero to **SOFT** flags (accept + tag), not HARD reject; HARD only for structurally impossible data; thresholds in `settings operations.*` |
| Double-fire / race on start or complete | Medium | RTDB transaction on `state` inside each callable (set-once is transactional) |
| Permissive root rules still allow legacy direct `/assignments` writes to carry stale actual mirrors | Medium | Make the protected node authoritative; treat any `/assignments` actual copy as a non-authoritative read-through mirror; eventually stop writing it client-side |
| Reimbursement reads diverge from corrected distance | Low | Reimbursement sources `distanceTravelled` from the protected/derived value; amendments re-derive and re-emit |

### 3. Migration Strategy (shadow-first, mirroring the Notification Engine discipline)
- **Phase 0 — Backfill:** create `/assignment_actuals` from existing records; seed `/vehicle_odometer` per vehicle; tag `provenance:"migrated"`. Read-only; nothing changes behavior.
- **Phase A — Shadow validate:** deploy the callables + a server validator that **observes** every client start/complete (via `onAssignmentWrite`) and writes the protected node + `anomalies[]` **without** blocking the client. Compare server-derived distance/duration against the client's. Pure measurement.
- **Phase B — Dual-write:** client buttons call the callable **and** keep the legacy local write; callable is authoritative for the protected node; reconcile divergences. Validate offline queue-and-replay.
- **Phase C — Cutover:** client buttons call **only** the callable; stop writing actuals to `/assignments`; protected node + `.write:false` become the sole authority. `amendActual` is the only correction path.
- **Phase D — Lock down:** tighten rules; retire the client-trusted distance computation; (optionally) tighten selected SOFT flags to HARD per observed data quality.

Advance/rollback one phase at a time behind a flag (same operational contract as `NOTIFICATION_FLAGS`/`REMINDER_FLAGS`).

### 4. Rollback Strategy
- Each phase is flag-reversible: **Phase C→B→A** by re-enabling the legacy client write and demoting the callable to shadow; **A→off** by disabling the validator. Because Phases 0–B are **additive** (the protected node and ledger are written *alongside* the untouched legacy path), rollback is "stop reading/enforcing the new node," never a data migration.
- The protected node and amendment ledger are **append-only and immutable** → rolling back the *enforcement* never destroys captured truth; the worst case is reverting to the pre-v1.11.5 (client-authoritative) behavior with all shadow data preserved for a later retry.
- No envelope/schema break (additive event payload + new nodes), so no `ENVELOPE_VERSION` bump; backend `SERVICE_VERSION` only.

### 5. Recommended Roadmap Position
**Immediately after v1.11.4 (Reminder Engine) and *before* the Analytics Foundation build-out.** It shares and hardens the same `/events` spine v1.11.4 rides, and it is the *precondition* for every analytics/AI layer. Sequencing it after a partial analytics build would mean re-pointing those metrics at a new source of truth and re-validating historical numbers — far costlier than laying the integrity layer first. It can proceed in parallel with the separate lifecycle-notification-coverage patch (the audit's G1/G2), since both enrich the same start/complete events.

---

## Final Answer

> **Should this architecture be implemented before Analytics Foundation?**

## **YES.**

**Justification:**
1. **Analytics Foundation is a function of Tier-1 fields.** §7 shows every layer from Driver/Vehicle/Cost analytics through Operational Intelligence and the AI Assistant resolves to `actualStart/End`, the odometers, and server-derived `distanceTravelled`/`actualDuration`. Building analytics first means building on inputs that are currently mutable, optional, unvalidated, and occasionally null — the numbers would be wrong and unauditable from day one.
2. **The data is already financial.** Reimbursement pays against client-trusted odometers today ([reimbursement.js:117-119](js/reimbursement.js#L117)). Any analytics layer added before integrity inherits a known financial-trust hole and amplifies it across every report.
3. **Source-of-truth changes are cheap before consumers exist, expensive after.** Establishing the protected node + ledger + derivation authority *before* analytics means analytics is written once, against the right source. Doing it after forces a migration of live metrics and a re-validation of history.
4. **It is the integrity precondition for safe autonomy.** An AI Operations Assistant reasoning over editable/forgeable actuals will produce confident, wrong operational guidance. Tier-1 integrity is the floor beneath any AI feature; it cannot be retrofitted under a system already making decisions.
5. **Cost of delay compounds; cost of doing it first is bounded.** The migration is additive and shadow-first (§3), fully reversible (§4), and shares the v1.11.4 event spine. There is no cheaper moment to lay this foundation than now — immediately after the reminder engine and before the first analytics metric depends on it.

**Conversely — implementing Analytics Foundation first is the one sequence to avoid:** it would canonize bad data, pay against unaudited distance, and require ripping out and re-pointing every metric once the integrity layer finally lands.
