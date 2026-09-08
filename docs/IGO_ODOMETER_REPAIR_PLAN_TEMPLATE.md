# IGO ODOMETER REPAIR PLAN — TEMPLATE (NOT EXECUTED)

**Status: BLOCKED for automated execution.** This session has **no access to
the production Firebase RTDB** (`schedule-driver-pbsi-default-rtdb`,
`asia-southeast1`). Unauthenticated reads are denied (confirmed via
`scripts/smoke-boot.mjs` → `Permission denied`), the repo contains no
assignments/vehicles export, and the six correction screenshots referenced in
the task were **not attached** — only six bare km values were provided:

```
3.424   22.149   20.789   20.490   21.947   21.961
```

Per the task's PRIMARY SAFETY RULE, no production data is modified until every
candidate is matched to a real assignment ID and proven safe against the
surrounding odometer history. That verification requires the data. **Fill this
template from a production export, verify every row, then execute the repair
through the app's own supervised path — never a blind script.**

---

## INCIDENT 2026-09-08 — Resource Analytics still shows Igo ≈ 31.729 km

Prevention shipped in `f8517f1` (v1.30.14.3); it does **not** touch historical
records, so the inflated number is expected until the data is repaired.

Reported screenshot:

| Driver | km |
|---|---|
| Igo  | 31.729 |
| Dedi |  2.704 |
| Aria |  1.721 |
| **Total Jarak Tempuh** | **36.238** |

**Per-driver sum = 31.729 + 2.704 + 1.721 = 36.154 → 84 km short of the 36.238
total.** This is code-explained, not a bug: `Total Jarak Tempuh` (`totalKm`) is
**vehicle-keyed** (`Σ vehicleOdoList[].km` — every distance-bearing trip with a
vehicle, incl. Self-Drive `driver:''` and trips by a driver not in the active
roster), while the per-driver breakdown (`driverOdoList`) is **driver-keyed** and
drops those. The two views need not sum equal. Reconcile the repair against
**both** — a mistyped Igo trip could sit under `totalKm`/`vehicleOdoList` without
appearing under "Igo" if it was logged Self-Drive or under an archived name.

### Phase 1 — exact "Jarak Tempuh per Driver" code path

`js/app.js` ~10251–10300 renders `driverOdoList` / `chartOdoDriver` /
`Total Jarak Tempuh` from `computeAnalyticsModel(...).charts.odoDriver`
(`js/analytics/analytics-engine.js`):

```
Igo km  =  Σ  a.distanceTravelled
           over  filteredAsg  where:
             • _asgDate(a) >= cutoff         ← rolling window; DEFAULT '30d'
                                               (today−29d). User-selectable:
                                               today / 7d / 30d / 90d / ytd / all.
                                               ⇒ CONFIRM the range shown in the
                                                 screenshot before reconciling.
             • a.status !== 'cancelled'
             • a.distanceTravelled != null && > 0   (only completed trips have it)
             • !isUnassignedAssignment(a)           (a.driver non-empty)
             • (a.driver || '').toLowerCase() === <Igo roster displayName>.toLowerCase()
```

`_driverOdo` loop: `js/analytics/analytics-engine.js` ~424. `driverOdoList`
projection: ~441. **`distanceTravelled` is read verbatim — never recomputed from
`startOdometer`/`endOdometer` at analytics time.**

### Phase 8 — repair MUST update BOTH fields

`distanceTravelled` is **persisted independently** at completion
(`js/app.js` `registerCompleteCallback` ~13845: `end − start` when both present
and `end ≥ start`, else `null`). Correcting only `startOdometer` leaves the
analytics **unchanged**. Each repaired record must set:

```
after.startOdometer     = <confirmed correct KM Awal>
after.endOdometer       = before.endOdometer                       (kept if ≥ correct start)
after.distanceTravelled = after.endOdometer − after.startOdometer   (else null / STOP)
```

### Root cause (mechanism proven; the specific pattern needs the data)

Pre-`f8517f1` the Start Assignment KM Awal was a free-typed input (autofilled
from `vehicle.odometer`; `validateOdometer` only **warns** on a mismatch, never
blocks). A low start persisted and, at completion, produced an inflated
persisted `distanceTravelled`. Whether Igo's errors are isolated typos, a stale
`vehicle.odometer` that several assignments inherited as their autofilled start,
or one repeated wrong baseline **cannot be decided from code** — run
`auditOdometerAnomalies(assignments, { warnJumpKm, continuityGapKm: 500 })`
(`js/analytics/odometer-audit.js`) against the export; it classifies
`STALE_START` / `CONTINUITY_*` / `LARGE_JUMP` / `ARITHMETIC_MISMATCH` etc.

### MINIMUM SANCTIONED EXPORT NEEDED

No terminal/agent path to production RTDB exists (every read requires an
interactive authenticated admin browser session; forbidden to bypass/weaken
rules or add any backdoor). Provide, from an authenticated session, a JSON dump
of these two RTDB nodes:

**`/assignments`** — every record where `driver` (case-insensitive) is Igo OR
`vehicle` is any vehicle Igo has used (for the vehicle-chain reconstruction),
across **all dates** (not just the analytics window), each with **exactly**:

```
id, driver, vehicle, date, startDate, startTime, endTime, status,
startOdometer, endOdometer, distanceTravelled,
startedAt, completedAt, createdAt, requestId, destination, purpose
```

**`/vehicles`** — every vehicle referenced above, each with: `id, name,
odometer, archived, status`.

Also state the **analytics date range** currently selected in the Resource
Analytics UI (default is `30d`), so the 31.729 km can be reconciled to the same
window.

---

## Phase 1 — Odometer architecture (verified from code, read-only)

| Concern | Source of truth | Where |
|---|---|---|
| Assignment start odometer | `assignments/{id}.startOdometer` (persisted) | written by `js/app.js` `registerStartCallback` from the odometer modal (`js/modal.js` `_handleOdometerConfirm`, `type='start'`) |
| Assignment end odometer | `assignments/{id}.endOdometer` (persisted) | `registerCompleteCallback`, `type='complete'` |
| Assignment distance | `assignments/{id}.distanceTravelled` (**persisted**, not derived at read) | `registerCompleteCallback`: `endOdometer − startOdometer` **only when** both present and `end ≥ start`, else `null` (`js/app.js` ~13845) |
| Vehicle current odometer | `vehicles/{id}.odometer` (persisted string) | `js/vehicles-store.js` `updateVehicleOdometer(id, value)`; written fire-and-forget by `registerCompleteCallback` on every completed trip with a vehicle + a non-null `endOdometer` (`js/app.js` ~13870). **A bad START with a valid END leaves this field correct.** |
| Vehicle odometer history | none — the app keeps only the latest `vehicles/{id}.odometer`; per-trip history lives in the `assignments` records themselves |
| Monthly / fleet vehicle mileage | **derived**, never materialized | `js/analytics/analytics-engine.js` `_vehicleOdo` / `vehicleOdoList` / `totalKm` — summed from `assignments[].distanceTravelled` grouped by vehicle, per the active analytics date filter |
| Driver mileage (`driverOdoList`) | **derived** from `assignments[].distanceTravelled` by driver name; excludes unassigned (`driver: ''`) |
| Executive Command Center vehicle metrics | **derived** — `js/analytics/executive-analytics.js` reads the analytics model above; `Kendaraan Siap` etc. are roster/flags, not mileage |

**Consequence:** there is **no cache or materialized layer to rebuild**. Fixing
`assignments/{id}.startOdometer` + `distanceTravelled` on the authoritative
records makes every analytics surface (monthly mileage, fleet, Executive)
recompute correctly on the next render. Do **not** hand-patch any dashboard.

## Phase 7/8 — END odometer & vehicle state

For each correction the operator supplied the **START** value only. Do **not**
touch `endOdometer` unless it is itself below the corrected start. Keep it and
recompute:

```
correctedDistance = endOdometer − correctStart          (endOdometer ≥ correctStart)
```

`js/analytics/odometer-audit.js#recomputeCorrectedTrip({ correctStart, existingEnd, oldDistance })`
is the single shared definition (tested in `scripts/odometer-anomaly-audit-check.mjs`).

If a bad START produced e.g. `2.246 → 22.491` and the real trip was
`22.390 → 22.491`, the vehicle's latest odometer (`22.491`) is **already
correct** — do not reset it.

---

## Repair table — FILL FROM PRODUCTION, verify each row before any write

| # | Confirmed correct KM Awal | Assignment ID | Date | Vehicle | Current KM Awal | Current KM Akhir | Current Distance | Correct KM Awal | Correct KM Akhir (keep if valid) | Correct Distance | Excess KM removed | Evidence checked |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 3 424  | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | 3 424  | `<= current KM Akhir>` | `<end − 3424>` | `<current − corrected>` | ☐ identity ☐ vehicle ☐ chronology ☐ prev/next odo ☐ vehicle odo |
| 2 | 22 149 | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | 22 149 | `<keep>` | `<end − 22149>` | `<…>` | ☐ … |
| 3 | 20 789 | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | 20 789 | `<keep>` | `<end − 20789>` | `<…>` | ☐ … |
| 4 | 20 490 | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | 20 490 | `<keep>` | `<end − 20490>` | `<…>` | ☐ … |
| 5 | 21 947 | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | 21 947 | `<keep>` | `<end − 21947>` | `<…>` | ☐ … |
| 6 | 21 961 | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | `<TBD>` | 21 961 | `<keep>` | `<end − 21961>` | `<…>` | ☐ … |

> The six values are **not** guaranteed to be in chronological order. Match each
> to its assignment by the value + vehicle + date, not by list position. The
> displayed KM Awal may differ from the correct value (e.g. shows `2.927`,
> correct is `3.424`).

**Worked example from the brief** (for arithmetic reference only, not a row above):
`2.246 → 22.491` (distance `20.245`) becomes `22.390 → 22.491` (distance `101`);
excess removed = `20.245 − 101 = 20.144 km`; vehicle latest odometer stays `22.491`.

**Total excess KM removed = Σ (Current Distance − Correct Distance)** across the
six confirmed rows — fill once the table is complete.

## Per-row safety gate (all must pass before writing that row)

1. Assignment ID resolved; `driver === 'Igo'` (or the canonical Igo record).
2. Vehicle matches the screenshot.
3. `correctStart ≤ current endOdometer` (else the END is also wrong — STOP, mark SUSPICIOUS).
4. `correctStart` is `≥` the previous completed Igo/vehicle assignment's valid end and `≤` the next one's start (continuity holds), OR the gap has a documented reason.
5. `vehicles/{vehicleId}.odometer` is consistent with the KEPT end (usually already correct).
6. Only `startOdometer` + `distanceTravelled` change. `driver`, `vehicle`, `date`, `startTime`, `endTime`, `destination`, `purpose`, `status`, `endOdometer` unchanged.

## Execution (operator, supervised — NOT this session)

- Prefer the app's own flow if a correction UI exists; otherwise a single
  supervised RTDB multi-location update, one assignment at a time, with a fresh
  precondition re-read immediately before each write.
- For every row, write an audit entry via the existing `logAction` mechanism:

  ```
  action:   'odometer_corrected'
  targetId: <assignmentId>
  metadata: { field: 'startOdometer', phase: 'repair', vehicle: <name>,
              before: <old start>, after: <correct start>,
              beforeDistance: <old>, afterDistance: <correct>,
              reason: 'Koreksi salah input odometer. Nilai KM awal dikonfirmasi ulang berdasarkan data operasional kendaraan.' }
  ```

  The original value is preserved in `before` — never erase the evidence.
- After each write: re-read the assignment, re-read `vehicles/{id}.odometer`,
  and confirm the analytics monthly mileage dropped by exactly the row's excess.

## Broad audit (Phase 5) — also blocked on data

Run `auditOdometerAnomalies(allAssignments, { warnJumpKm: getSetting('operations.odometerWarnJumpKm'), continuityGapKm: 500 })`
(`js/analytics/odometer-audit.js`) against a full export to produce the
Driver / Vehicle / Date / Anomaly / Severity / Evidence table. It classifies
`SUSPICIOUS` only — never `CONFIRMED WRONG`. Repair nothing outside Igo without
operator-confirmed correct values + the same per-row gate.
