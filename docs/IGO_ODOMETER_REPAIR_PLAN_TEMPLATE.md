# IGO ODOMETER REPAIR PLAN

**Status: BLOCKED for execution by the agent.** This session has **no access to
the production Firebase RTDB** (`schedule-driver-pbsi-default-rtdb`,
`asia-southeast1`) — no admin credentials / custom-token, so authenticated reads
and writes are impossible; unauthenticated reads are denied (`scripts/smoke-boot.mjs`
→ `Permission denied`); and there is no data export in the repo. The agent will
not bypass/weaken RTDB rules, add a service account, fake auth, or add a
cleanup endpoint. As of 2026-09-09 the operator supplied the **six full business
identities + correct KM Awal** (below) and the separate incident's full numbers
— but the `assignmentId`s and current stored values still have to be resolved
from production, which needs an authenticated admin session.

**Execution path (for someone with admin access):** the console procedure in
"Write — only via the authenticated admin session" below — run in the DevTools
console of the running, logged-in production app. It uses the app's own
`readNode` / `updateFirebaseData` / `logAction` (no code change, no new
endpoint): DRY RUN (reads + classifies, writes nothing) → per-row WRITE with
re-read + field-integrity assert → reconcile. Only `startOdometer` +
`distanceTravelled` are written; a bad START with a valid END never touches
`endOdometer` or `vehicles/{id}.odometer`.

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

## Repair targets — operator-confirmed KM Awal, matched by BUSINESS IDENTITY

Match each row in production by **all** of: date + start/end time + `driver`
(Igo) + vehicle + destination + purpose. Resolve `assignmentId`, re-read the
full record, then classify. Never match on `assignmentId` alone, never trust
list order, never repair the first partial match.

| # | Tanggal | Jam | Kendaraan | Tujuan | Keperluan | Correct KM Awal |
|---|---|---|---|---|---|---|
| 1 | 2026-09-07 | 08:00–10:00 | Polytron | Pelatnas – Kedubes Mesir | Pengantaran Pengurusan Visa Mesir Pak Ketum | **3.424** |
| 2 | 2026-09-04 | 17:00–19:30 | Innova   | T3 (Domestik) Soetta – Pelatnas | Penjemputan Kepulangan Tim Pontianak IM SI100 | **22.149** |
| 3 | 2026-09-08 | 06:30–08:00 | Luxio    | Pelatnas – Imigrasi Depok | Pengantaran Pengurusan Paspor | **20.789** |
| 4 | 2026-09-03 | 12:00–16:00 | Luxio    | Pelatnas – Santika Slipi | Pengantaran Rapat dengan Dewan Pengawas | **20.490** |
| 5 | 2026-09-01 | 09:50–11:50 | Innova   | T3 Soetta – RM Gama (Green Terrace) | Penjemputan Makanan Ketum | **21.947** |
| 6 | 2026-09-02 | 08:30–12:30 | Innova   | Pelatnas – Kemenpora | Pengantaran Rapat Bidang Binpres | **21.961** |

**7 — the separately documented incident** (all numbers known; still locate the
record independently by its own business identity + stored odometer values —
do **not** assume it is any of rows 1–6, do **not** search-and-replace `2.246`):

| Field | Current | Correct |
|---|---|---|
| KM Awal | 2.246 | **22.390** |
| KM Akhir | 22.491 | 22.491 *(unchanged — valid)* |
| distanceTravelled | 20.245 | **101** |
| Excess removed | — | **20.144** |

## Per-row classification — CONFIRMED / AMBIGUOUS / NOT FOUND

Only **CONFIRMED** rows may be written. A row is CONFIRMED only when **all** hold:

1. Exactly one production assignment matches all six business-identity fields.
2. `record.driver` resolves to Igo; `record.status === 'completed'`.
3. `correctStart ≤ record.endOdometer` (the END is kept — if this fails the END
   is also wrong → **AMBIGUOUS**, do not write, report).
4. `correctStart` sits sanely in the vehicle's chronological chain
   (≥ previous completed trip's valid end for that vehicle, ≤ next trip's start),
   OR any gap has a documented operational reason.
5. `vehicles/{vehicleId}.odometer` is consistent with the kept END (normally
   already correct — a bad START with a valid END does not imply a wrong vehicle
   odometer). **Do not** change vehicle state as collateral.

`> 1` match → **AMBIGUOUS** (report all candidates, write nothing).
`0` matches → **NOT FOUND** (report, skip).

## Corrected values (arithmetic; fill `endOdometer` from the re-read)

```
correctStart    = <operator value from the table>
correctEnd      = record.endOdometer            (keep; if < correctStart → AMBIGUOUS)
correctDistance = correctEnd − correctStart
excessRemoved   = record.distanceTravelled − correctDistance
```

`TOTAL IGO KM BEFORE` = Igo's Resource-Analytics number for the selected window.
`TOTAL CONFIRMED EXCESS REMOVED` = Σ `excessRemoved` over CONFIRMED rows **inside
that window**. `TOTAL IGO KM AFTER` = BEFORE − that sum. Reconcile before/after.

## Write — only via the authenticated admin session, one record at a time

Run this in the **browser DevTools console while logged in to the production app
as an admin** (same origin → same-origin dynamic `import()` of the app modules;
this is the sanctioned existing access path — no code change, no new endpoint).

### Step A — DRY RUN (reads + classifies, writes NOTHING)

```js
// paste in the console of the running, authenticated admin app
const { readNode } = await import('/js/firebase.js');
const norm = s => String(s ?? '').trim().toLowerCase();

const TARGETS = [
  { n:1, date:'2026-09-07', start:'08:00', end:'10:00', vehicle:'Polytron', dest:'Pelatnas - Kedubes Mesir', purpose:'Pengantaran Pengurusan Visa Mesir Pak Ketum', correctStart:3424 },
  { n:2, date:'2026-09-04', start:'17:00', end:'19:30', vehicle:'Innova',   dest:'T3 (Domestik) Soetta - Pelatnas', purpose:'Penjemputan Kepulangan Tim Pontianak IM SI100', correctStart:22149 },
  { n:3, date:'2026-09-08', start:'06:30', end:'08:00', vehicle:'Luxio',    dest:'Pelatnas - Imigrasi Depok', purpose:'Pengantaran Pengurusan Paspor', correctStart:20789 },
  { n:4, date:'2026-09-03', start:'12:00', end:'16:00', vehicle:'Luxio',    dest:'Pelatnas - Santika Slipi', purpose:'Pengantaran Rapat dengan Dewan Pengawas', correctStart:20490 },
  { n:5, date:'2026-09-01', start:'09:50', end:'11:50', vehicle:'Innova',   dest:'T3 Soetta - RM Gama (Green Terrace)', purpose:'Penjemputan Makanan Ketum', correctStart:21947 },
  { n:6, date:'2026-09-02', start:'08:30', end:'12:30', vehicle:'Innova',   dest:'Pelatnas - Kemenpora', purpose:'Pengantaran Rapat Bidang Binpres', correctStart:21961 },
  // Row 7 — the incident: leave correctStart undefined and instead confirm the
  // record shows startOdometer 2246 / endOdometer 22491 before treating it as row 7.
  { n:7, date:null, incident:true, expectStart:2246, expectEnd:22491, correctStart:22390 },
];

const res = await readNode('assignments');
if (res.status !== 'ok' || !res.value) { console.error('READ FAILED', res); throw new Error('no assignments'); }
const all = Object.entries(res.value).map(([id, r]) => ({ id, ...r }));

for (const t of TARGETS) {
  let cand;
  if (t.incident) {
    cand = all.filter(a => norm(a.driver) === 'igo'
      && Number(a.startOdometer) === t.expectStart && Number(a.endOdometer) === t.expectEnd);
  } else {
    cand = all.filter(a => norm(a.driver) === 'igo'
      && (a.date === t.date || a.startDate === t.date)
      && a.startTime === t.start && a.endTime === t.end
      && norm(a.vehicle) === norm(t.vehicle)
      && norm(a.destination) === norm(t.dest)
      && norm(a.purpose) === norm(t.purpose));
  }
  if (cand.length !== 1) { console.warn(`ROW ${t.n}: ${cand.length===0?'NOT FOUND':'AMBIGUOUS ('+cand.length+')'}`, cand.map(c=>c.id)); continue; }
  const a = cand[0];
  const correctEnd = Number(a.endOdometer);
  const status =
    a.status !== 'completed'         ? 'AMBIGUOUS (not completed)' :
    !Number.isFinite(correctEnd)     ? 'AMBIGUOUS (no endOdometer)' :
    correctEnd < t.correctStart      ? 'AMBIGUOUS (end < correctStart — END also wrong)' :
    'CONFIRMED';
  const correctDistance = correctEnd - t.correctStart;
  console.log(`ROW ${t.n} [${status}] id=${a.id}`, {
    date:a.date, jam:`${a.startTime}-${a.endTime}`, vehicle:a.vehicle, dest:a.destination,
    currentStart:a.startOdometer, currentEnd:a.endOdometer, currentDistance:a.distanceTravelled,
    correctStart:t.correctStart, correctEnd, correctDistance,
    excessRemoved: (a.distanceTravelled == null ? null : a.distanceTravelled - correctDistance),
  });
}
```

Copy the printed rows into the FINAL REPORT table. **Manually eyeball each
CONFIRMED row** against the vehicle chain (rows 2/5/6 share Innova; rows 3/4
share Luxio) before Step B.

### Step B — WRITE, one CONFIRMED row at a time

For **each** CONFIRMED `assignmentId` (do them individually, re-reading first):

```js
const { readNode, updateFirebaseData } = await import('/js/firebase.js');
const { logAction } = await import('/js/logs.js');
const { getCurrentUser } = await import('/js/auth.js');

const ID = '<assignmentId from Step A>';
const CORRECT_START = <number>;        // from the table
const REASON = 'Koreksi salah input odometer. Nilai KM awal dikonfirmasi ulang berdasarkan data operasional kendaraan.';

const cur = (await readNode(`assignments/${ID}`)).value;
if (!cur) throw new Error('gone');
console.log('BEFORE', { id: ID, ...cur });
// re-verify identity + preconditions here, by eye, against Step A's row.
const correctEnd = Number(cur.endOdometer);
if (!(correctEnd >= CORRECT_START)) throw new Error('END < correctStart — STOP, AMBIGUOUS');
const newDistance = correctEnd - CORRECT_START;

await updateFirebaseData(`assignments/${ID}`, {   // surgical merge — ONLY these two keys
  startOdometer: CORRECT_START,
  distanceTravelled: newDistance,
});

const u = getCurrentUser();
await logAction({
  userId: u?.id, username: u?.username, displayName: u?.name,
  action: 'odometer_corrected', targetId: ID,
  metadata: {
    field: 'startOdometer', phase: 'historical_repair', vehicle: cur.vehicle, assignmentId: ID,
    before: cur.startOdometer, after: CORRECT_START,
    beforeDistance: cur.distanceTravelled, afterDistance: newDistance,
    reason: REASON,
  },
});

const after = (await readNode(`assignments/${ID}`)).value;
console.log('AFTER', after);
console.assert(after.startOdometer === CORRECT_START && after.distanceTravelled === newDistance
  && after.driver === cur.driver && after.vehicle === cur.vehicle && after.status === cur.status
  && after.endOdometer === cur.endOdometer, 'UNEXPECTED FIELD CHANGE');
```

If any row's assert fails or `updateFirebaseData` rejects → **STOP**, do not
continue, report the row.

### Step C — reconcile

Reload Analytics → Resource Analytics (same date range). Verify Igo dropped by
exactly Σ excessRemoved (CONFIRMED, in-window); Dedi/Aria unchanged; total
vehicle km dropped by the same Σ. Then re-run the anomaly pass on the corrected
data:

```js
const { auditOdometerAnomalies } = await import('/js/analytics/odometer-audit.js');
const rows = Object.entries((await (await import('/js/firebase.js')).readNode('assignments')).value)
  .map(([id, r]) => ({ id, ...r }));
console.table(auditOdometerAnomalies(rows.filter(a => String(a.driver||'').toLowerCase()==='igo'),
  { warnJumpKm: 300, continuityGapKm: 500 }));
```

Report remaining SUSPICIOUS rows for review — **do not** auto-repair them.

## Broad audit (Phase 5) — also blocked on data

Run `auditOdometerAnomalies(allAssignments, { warnJumpKm: getSetting('operations.odometerWarnJumpKm'), continuityGapKm: 500 })`
(`js/analytics/odometer-audit.js`) against a full export to produce the
Driver / Vehicle / Date / Anomaly / Severity / Evidence table. It classifies
`SUSPICIOUS` only — never `CONFIRMED WRONG`. Repair nothing outside Igo without
operator-confirmed correct values + the same per-row gate.
