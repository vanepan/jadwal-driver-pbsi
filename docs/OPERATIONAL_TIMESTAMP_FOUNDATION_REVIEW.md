# Operational Timestamp Foundation Review (v1.11.4)

**Status:** Architecture / data-foundation review only. No implementation, no commits, no deploy.
**Date:** 2026-06-14
**Companions:** `ASSIGNMENT_LIFECYCLE_NOTIFICATION_AUDIT.md`, `REMINDER_ENGINE_ARCHITECTURE_v1.11.4_REV2.md`.
**Method:** Read of the *actual* data capture and consumption paths — `js/app.js` (start/complete callbacks), `js/assignments.js` (record shape), `js/reimbursement.js` (odometer → cost), `js/analytics/analytics-engine.js` (current metric derivation), `functions/src/events/onAssignmentWrite.js` (canonical event emission).

---

## 0. The finding that reframes everything

`assignment.started` and `assignment.completed` capture **four operational ground-truth fields** that no other event in the system produces:

| Field (record key) | Captured at | Code |
|---|---|---|
| `actualStart` (`startedAt`) | start callback | [app.js:7213](js/app.js#L7213) |
| `actualEnd` (`completedAt`) | complete callback | [app.js:7262](js/app.js#L7262) |
| `startOdometer` | start callback (odometer modal) | [app.js:7215](js/app.js#L7215) |
| `endOdometer` (+ derived `distanceTravelled`) | complete callback | [app.js:7264-7265](js/app.js#L7264) |

**These fields are captured but almost entirely unconsumed.** The current analytics engine measures driver/vehicle utilization by **trip *count* on *planned* dates** — never by actual engaged time or distance:

```js
// analytics-engine.js — utilization = COUNT of assignments, keyed on planned date
function _asgDate(a) { return a.date || a.startDate || ''; }   // planned schedule date
for (const a of filteredAsg) { const e = driverMap.get(...); if (e) e.count++; }  // count, not hours
```
([analytics-engine.js:135](js/analytics/analytics-engine.js#L135), [analytics-engine.js:200-228](js/analytics/analytics-engine.js#L200))

The only place actuals are consumed today is **reimbursement** — i.e. **money** — which already reads `startOdometer`/`endOdometer`/`distanceTravelled` ([reimbursement.js:117-119](js/reimbursement.js#L117)). That is the tell: **the moment a field touches cost, it must be ground truth.** The roadmap's entire cost/utilization/AI tier is built on exactly these four fields — yet they are currently client-written, mutable, non-validated, and not even guaranteed to exist (see §3.3). This review argues they must be promoted to **Tier 1 Operational Data** before analytics build on them.

---

## 1. Operational Timestamp Hierarchy

Two distinct time domains exist on every assignment. They answer different questions and **must not be conflated**.

```
PLANNED  (intent — set at request/approval, schedule-bound)
  plannedStart   = date + startTime          // "what we scheduled"
  plannedEnd     = date + endTime
  plannedDate    = date | startDate

ACTUAL   (truth — set at execution, operator-bound, irreversible)
  actualStart    = startedAt    (+ startedBy)        // vehicle departure
  actualEnd      = completedAt  (+ completedBy)      // vehicle return
  startOdometer  = odometer reading at departure
  endOdometer    = odometer reading at return
  distanceTravelled = endOdometer − startOdometer    // derived (km driven)

DERIVED OPERATIONAL METRICS (computed from ACTUAL, validated against PLANNED)
  actualDuration   = actualEnd − actualStart          // real engaged time
  plannedDuration  = plannedEnd − plannedStart        // scheduled time (baseline)
  startDelay       = actualStart − plannedStart        // punctuality
  overrun          = actualDuration − plannedDuration  // schedule adherence
  distance         = distanceTravelled                 // cost/fuel/maintenance driver
```

**Semantic rule:** `PLANNED` is a *forecast*; `ACTUAL` is a *record*. A forecast can be revised; a record, once written, is history. The system today treats both as ordinary mutable assignment fields — that is the integrity gap.

> Note on naming: the codebase stores actuals as `startedAt`/`completedAt`/`startOdometer`/`endOdometer`. This review uses `actualStart`/`actualEnd` as the *conceptual* names and recommends them as canonical aliases in the analytics contract, so planned-vs-actual is unambiguous in every downstream formula.

---

## 2. Recommended Analytics Source of Truth

| Concern | Source of truth | Why |
|---|---|---|
| **Operational time** (duration, departure, return, punctuality) | **ACTUAL** (`actualStart`/`actualEnd`) | Planned is intent; only actuals reflect what the fleet did. |
| **Distance / cost basis** | **ACTUAL** (`startOdometer`/`endOdometer`/`distanceTravelled`) | Cost is incurred against km driven, not km planned. Already true for reimbursement. |
| **Forward capacity / scheduling load** | **PLANNED** | Future trips have no actuals yet; planning is inherently forecast-based. |
| **Adherence / variance / anomaly** | **PLANNED vs ACTUAL delta** | The *gap* between the two is itself a Tier-1 signal (delays, overruns, no-shows). |
| **The authoritative store** | the **`/assignments` record** + the **canonical `/events` stream** (`assignment.started`/`assignment.completed`) | `onAssignmentWrite` already emits these as canonical events ([onAssignmentWrite.js:77-78](functions/src/events/onAssignmentWrite.js#L77)); the event stream is append-only and replay-capable — the right backbone for an analytics ledger. **Not `/logs`** (its `assignment_started` metadata is impoverished — no driver/requesterId — per the lifecycle audit). |

**Single sentence:** *Actuals are the source of truth for everything measured after a trip happens; planned is the source of truth for everything projected before it happens; the delta between them is the highest-value operational intelligence.*

---

## 3. Fields That Should Become Protected Operational Records

### 3.1 The protected set

| Field | Protection required |
|---|---|
| `actualStart` (`startedAt`) | **set-once**, server-validated, immutable after set |
| `actualEnd` (`completedAt`) | set-once, server-validated (`≥ actualStart`), immutable after completion |
| `startOdometer` | set-once, monotonic vs vehicle's last reading, immutable after set |
| `endOdometer` | set-once, `≥ startOdometer`, immutable after completion |
| `distanceTravelled` | **server-derived** (not client-trusted); recompute from odometers |
| `startedBy` / `completedBy` (actor) | recorded for accountability; immutable |

### 3.2 What "protected" must mean (it is none of these today)

Currently these fields are written by the **client** via `saveOneAssignment` (localStorage + Firebase) ([app.js:7221](js/app.js#L7221), [app.js:7271](js/app.js#L7271)), under **permissive root rules** (`/assignments` inherits `.write: "auth != null"`), with **no server validation** and **no immutability**. Any authenticated client can overwrite `completedAt`, inflate `endOdometer`, or null `distanceTravelled`. For data that **feeds reimbursement and will feed all cost analytics, that is a financial-integrity hole.**

Protected should mean:
1. **Set-once / append-only** — an actual, once written, cannot be silently overwritten (correction requires an explicit, audited amendment path, not a field edit).
2. **Server-validated** — monotonic odometer, `endOdometer ≥ startOdometer`, `actualEnd ≥ actualStart`, `actualStart` not in the future. Reject/flag violations rather than store garbage.
3. **Server-derived where derivable** — `distanceTravelled` recomputed server-side from the two odometers; never trust a client-supplied distance.
4. **Audited** — the `assignment.started`/`assignment.completed` canonical events already provide the audit trail; make them the *system of record* for the actuals, not a side effect.

### 3.3 Data-integrity holes to close (verified in code)

- **Complete-without-start.** The complete callback does not require a prior `started`; `distanceTravelled` is computed only `if (endOdometer != null && startOdometer != null && endOdometer >= startOdometer)` else **`null`** ([app.js:7255-7257](js/app.js#L7255)). A trip completed without a start → `startOdometer = null` → `distanceTravelled = null` **and** `actualStart = null` → **no duration, no distance** for that record. Cost/utilization analytics silently lose it.
- **Odometer optional.** `startOdometer`/`endOdometer` come from an odometer modal but default to `null` ([app.js:7215](js/app.js#L7215), [app.js:7252](js/app.js#L7252)). Optional financial inputs = systematically incomplete cost data.
- **No monotonicity check.** Nothing validates `endOdometer ≥ startOdometer` across trips or against the vehicle's running odometer — fraudulent or fat-fingered readings are stored verbatim.

These are not edge cases for a count-based analytics world; they are **blocking defects** for a cost/duration analytics world. Tier-1 classification is what forces them to be fixed.

---

## 4. Future Analytics Dependencies — Planned vs Actual, per domain

For each roadmap domain: **(A) Planned Schedule Time** or **(B) Actual Operational Time**, with the dependency.

| # | Domain | Source | Depends on | Notes |
|---|---|---|---|---|
| 1 | **Driver Utilization** | **B — Actual** | `actualStart`/`actualEnd` (engaged hours); count is a crude proxy | Planned over-counts (cancellations/no-shows). Real utilization = Σ actualDuration ÷ available hours. Today: count-only, planned-date — **must migrate to actual.** |
| 2 | **Vehicle Utilization** | **B — Actual** | `actualStart`/`actualEnd` + `distanceTravelled` | Vehicle wear/availability tracks engaged time **and** km, not scheduled slots. |
| 3 | **Assignment Duration** | **B — Actual** (exclusively) | `actualEnd − actualStart` | Planned duration is a *different metric* (the baseline). Reporting planned as "duration" is simply wrong. |
| 4 | **Cost per Assignment** | **B — Actual** | `distanceTravelled` (× rate) + `actualDuration` (× time-rate) | Already the reimbursement basis. Cost = f(km driven, hours), never km planned. |
| 5 | **Cost per Driver** | **B — Actual** | Σ actualDuration, Σ distance per driver | Aggregation of #3/#4 by driver. |
| 6 | **Cost per Vehicle** | **B — Actual** | Σ distance per vehicle (fuel/maintenance proxy) + engaged time | Odometer is the canonical fleet-cost input. |
| 7 | **Capacity Planning** | **Both** (Planned primary for projection; Actual to calibrate) | Planned for forward load; Actual-vs-Planned variance to make projections realistic | Plan with planned, **calibrate with actual** (e.g. "scheduled 2h trips actually run 3.1h"). Planned-only capacity models systematically under-provision. |
| 8 | **Workload Analytics** | **B — Actual** | Actual engaged hours per driver (not trip count) | Count-based workload hides that one 6h trip > three 30-min trips. Current `classifiedDrivers` uses count ([analytics-engine.js:261-265](js/analytics/analytics-engine.js#L261)) — **needs actual-hours.** |
| 9 | **Operational Intelligence** | **B — Actual** + **Planned-vs-Actual delta** | `startDelay`, `overrun`, completion-without-start rate, odometer anomalies | The *delta* is the product: punctuality, schedule adherence, anomaly detection. Pure planned = blind. |
| 10 | **AI Operations Assistant** | **B — Actual** (ground truth) + **delta as features** | All of the above, clean and validated | An LLM reasoning over **planned** data will confidently report fiction (e.g. "vehicle free at 14:00" when it returned at 15:10). Actuals are non-negotiable; the planned-vs-actual variance is a core predictive feature (delay forecasting, anomaly flagging). **Garbage actuals → hallucinated ops advice.** |

**Tally: 8 of 10 domains require Actual as primary; 2 (Capacity, Op-Intelligence) require the Planned-vs-Actual *delta*; 0 are served by Planned alone.** Planned's only standalone role is forward projection — which by definition has no actuals yet.

---

## 5. Recommended Roadmap Implications

1. **Promote the four actual fields to Tier-1 before any cost/duration analytics ships.** Building Driver/Vehicle/Cost analytics on the current mutable, optional, unvalidated capture would bake bad data into financial reporting. Sequence: **protect the data → then analyze it.**
2. **Make the canonical `/events` stream (`assignment.started`/`assignment.completed`) the analytics system-of-record**, not `/logs`. They are already emitted ([onAssignmentWrite.js:77-78](functions/src/events/onAssignmentWrite.js#L77)), append-only, and replay-capable — the natural operational ledger. Enrich the `assignment.started` payload to carry the actuals + driver/requester identity (the lifecycle audit flagged its metadata is currently thin).
3. **Close the three integrity holes (§3.3)** — require start-before-complete, make odometer capture mandatory (or explicitly mark a record `distanceUnknown`), and add server-side monotonic/ordering validation. These are prerequisites, not enhancements.
4. **Server-derive `distanceTravelled` and `actualDuration`**; never trust client math for cost inputs.
5. **Add a "planned vs actual" data contract** to the analytics layer (`plannedStart/End` vs `actualStart/End`) so every metric explicitly declares which domain it uses — preventing the silent planned-for-actual substitution that the current count-based engine represents.
6. **Tie to v1.11.4:** the Reminder Engine rides the same `/events` spine. Classifying started/completed as Tier-1 reinforces that the event foundation is the operational backbone and that **data integrity on these events is now a first-class concern**, not a workflow afterthought. (Reminders themselves remain pre-trip and unaffected — but they share the backbone whose integrity this review is about.)

---

## 6. Final Question

> Should `assignment.started` and `assignment.completed` be formally classified as **Tier 1 Operational Events** within the Sarpras Operations architecture?

## **YES.**

**Justification, against the roadmap and future analytics plans:**

1. **They are the sole source of operational ground truth.** No other event records when a vehicle actually departed/returned or how far it drove. `actualStart`, `actualEnd`, `startOdometer`, `endOdometer` exist *only* on these two events. Every other timestamp in the system is intent (planned), not record (actual).

2. **The roadmap depends on them, not on planned data.** 8 of 10 future analytics domains require **Actual** as primary source; the remaining 2 require the **Planned-vs-Actual delta**; **none** is correctly served by planned time alone (§4). Driver/Vehicle/Cost/Workload analytics, Capacity calibration, Operational Intelligence, and the AI Assistant **all** resolve to these four fields. An analytics roadmap built on planned time would be measuring intentions, not operations.

3. **They are already financial-grade data.** Reimbursement consumes the odometers today ([reimbursement.js:117-119](js/reimbursement.js#L117)). Any field that determines money owed has already crossed the threshold that warrants Tier-1 protection — it simply hasn't been formally granted it.

4. **Tier-1 status is what forces the guarantees the roadmap needs.** Classifying them Tier-1 mandates: guaranteed capture (no complete-without-start, no optional odometer), server validation (monotonic, ordered), immutability/append-only, audit via the canonical event stream, and — closing the loop with the lifecycle audit — **operational visibility** (the very events that today notify *no one* on start and *silently* on complete). Without Tier-1 classification, these remain best-effort workflow side-effects feeding best-effort analytics.

5. **It aligns data integrity with the event architecture already in place.** `onAssignmentWrite` already mints these as canonical `/events`. Formal Tier-1 classification elevates that emission from "a notification trigger" to "the authoritative operational record," which is precisely what Driver/Vehicle/Cost/AI analytics must be able to trust.

**The risk of NOT classifying them Tier-1:** the entire analytics and AI roadmap inherits mutable, optional, unvalidated, occasionally-null inputs — and an AI Operations Assistant reasoning over them will produce confident, wrong operational guidance. Tier-1 classification is the prerequisite that makes the roadmap buildable on fact rather than intent.
