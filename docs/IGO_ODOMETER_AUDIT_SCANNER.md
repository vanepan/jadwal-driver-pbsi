# V1 PRODUCTION ODOMETER AUDIT — SUSPICIOUS DISTANCE SCANNER

**AUDIT ONLY / READ ONLY. NO WRITES. NO CODE CHANGES. NO DB MUTATION.**

The agent has **no production RTDB access** (no admin custom-token;
unauthenticated reads are denied — `smoke-boot` → `Permission denied`). It will
not bypass/weaken rules or add a backdoor. This document is the analysis of the
data the operator supplied plus a **read-only console scanner** to run in the
DevTools console of the logged-in production app; it produces Report Sections
A–G and writes nothing.

Related: `docs/IGO_ODOMETER_REPAIR_PLAN_TEMPLATE.md` (the 6+1 repair);
`js/analytics/odometer-audit.js` (`auditOdometerAnomalies`, shipped `f8517f1`).

---

## 1. Pattern in the 7 verified historical repairs

Reconstructed from the operator's list (old start → new start · old dist → new
dist; `oldEnd == newEnd` in every case — the repair kept `endOdometer` and only
fixed `startOdometer` + `distanceTravelled`):

| Assignment ID | Old start | Corrected start | Old dist | New dist | Kept end | Class |
|---|---|---|---|---|---|---|
| `mtmv5txuq4e0` |  2 927 |  3 424 |   548 |  51 |  3 475 | **typo-low** (Polytron) |
| `mtoiatre6k44` |  2 246 | 22 390 | 20 245 | 101 | 22 491 | **typo-low** (end ≈ Innova range) |
| `mtmbg3d9qtjz` | 20 886 | 22 149 | 1 375 | 112 | 22 261 | **stale baseline 20 886** (Innova) |
| `mti2b4bbfzzm` | 20 886 | 21 947 | 1 075 |  14 | 21 961 | **stale baseline 20 886** (Innova) |
| `mtih8radt5n5` | 20 886 | 21 961 | 1 143 |  68 | 22 029 | **stale baseline 20 886** (Innova) |
| `mtjp75573427` | 19 422 | 20 490 | 1 130 |  62 | 20 552 | **stale baseline 19 422** (Luxio) |
| `mtrvqwql228i` | 19 422 | 20 789 | 1 415 |  48 | 20 837 | **stale baseline 19 422** (Luxio) |

**Two distinct corruption modes:**

- **Stale-baseline reuse** — the same wrong `startOdometer` value stamped on
  multiple assignments for one vehicle: **`20 886` on Innova** (3×), **`19 422`
  on Luxio** (2×). Mechanism: the Start dialog autofilled `vehicles/{id}.odometer`
  and that field was **not advancing between trips** (write-back failing/lagging,
  or the trips created/started in a burst before any completed). Not independent
  typos — a systemic stale source.
- **Typo-low** — a hand-typed start far below any plausible reading
  (`2 927`, `2 246`).

**Vehicle-odometer field is itself suspect.** If `vehicles/Luxio.odometer` still
reads ~`19 422` (and `vehicles/Innova.odometer` ~`20 886`), then the **`f8517f1`
completion guard does not help** for these vehicles — it locks KM Awal to the
*authoritative* value, and the authoritative value is wrong. **The scanner must
read `/vehicles` and compare each `.odometer` to the last valid completed end
for that vehicle.** Correcting the two vehicle odometer fields is likely a
prerequisite to any further assignment repair (separate, evidence-gated).

## 2. The new suspicious record — analysis (NO REPAIR)

```
Igo · Luxio · 2026-09-09 01:10–03:10 · Stasiun Senen - Pelatnas · Kepulangan Panel Pontianak
startOdometer 19 422 · endOdometer 21 001 · distanceTravelled 1 579
```

| Signal | Finding |
|---|---|
| **STALE_START** | `startOdometer 19 422` is the **exact** stale Luxio baseline already corrected on `mtjp75573427` and `mtrvqwql228i`. This is the **3rd** Luxio assignment on `19 422`. |
| **CONTINUITY_BACKWARD** | Last known valid Luxio end (`mtrvqwql228i`, 8 Sep) = **20 837**. This trip starts at `19 422` — **1 415 km below** the previous real end. Physically impossible for an odometer to run backwards. |
| **ARITHMETIC** | `21 001 − 19 422 = 1 579` — stored distance is internally consistent with the (wrong) start, so this is a start error, not an arithmetic-entry error. |
| **SPEED** | `1 579 km / 2.0 h ≈ 790 km/h` — impossible (well above any aircraft cruise; Senen↔Pelatnas is a ~15 km intra-Jakarta route). |
| **BAND** | LOW band by raw distance (1 579 is < 2 000) but **CRITICAL by evidence** — do not rely on the 2 000 km threshold. |

**Assessment: HIGH CONFIDENCE this record is corrupted by the same stale-Luxio-baseline pattern.**

**Proposed corrected value — FOR HUMAN REVIEW ONLY, not a fact:**
`endOdometer 21 001` is kept (it is above the previous real end and plausible).
The true start is between the last valid Luxio end (**20 837**) and `21 001`:

- If Luxio was idle since 8 Sep 08:00 → correct start ≈ **20 837**, corrected
  distance ≈ **164 km** (still high for this route — implies intervening mileage).
- More likely there were trips / private use in the 17 h gap → true start closer
  to `21 001 − (route distance ~30–60 km)` ≈ **20 940–20 970**, corrected
  distance ≈ **30–60 km**.

**Corrected distance is very likely 30–170 km, not 1 579 → excess ≈ 1 410–1 550 km.**
Confidence on *"corrupted"*: **HIGH**. Confidence on the *exact* corrected value:
**LOW** — needs the full Luxio chain (all drivers), `vehicles/Luxio.odometer`,
and `startedAt`/`completedAt` between 8 Sep 08:00 and 9 Sep 01:10.

## 3. Driver-analytics impact (from what is known)

Only the corrected magnitudes are known; the analytics window is not, so exact
percentages need the scanner. Directional:

- The 7 repairs removed **≈ 6 500 km** of inflation from Igo
  (`Σ oldDist − Σ newDist` ≈ `27 129 − 442`).  Wait — the incident alone is
  `20 245 → 101` = 20 144; the other six sum `6 086 → 341` ≈ 5 745. Total
  removed ≈ **25 889 km** across the 7 (dominated by the 20 144 incident).
- The new record adds another **≈ 1 410–1 550 km** of suspected inflation still
  in Igo's number.
- Dedi (2 704) / Aria (1 721) — no evidence of inflation yet; the scanner checks
  them the same way.
- The reported **84 km** gap between the per-driver sum and the vehicle-keyed
  total is **by design** (driver-keyed `driverOdoList` vs vehicle-keyed
  `totalKm`) — **not** an anomaly, do not "repair" it.

---

## 4. READ-ONLY console scanner — Report Sections A–G

Run in the **DevTools console of the running, authenticated admin app**. Reads
`/assignments` + `/vehicles` via the app's own `readNode`; writes nothing.

```js
// ============ V1 ODOMETER SUSPICIOUS-DISTANCE SCANNER (READ ONLY) ============
const { readNode } = await import('/js/firebase.js');
const { auditOdometerAnomalies } = await import('/js/analytics/odometer-audit.js');

const REPAIRED = new Set(['mtmv5txuq4e0','mtmbg3d9qtjz','mtjp75573427','mti2b4bbfzzm','mtih8radt5n5','mtrvqwql228i','mtoiatre6k44']);
const num  = v => (v == null || v === '' ? null : (Number.isFinite(+v) ? +v : null));
const norm = s => String(s ?? '').trim().toLowerCase();
const isCompleted = a => a.status === 'completed' || a.status === 'selesai';
const fmt = n => n == null ? '—' : n.toLocaleString('id-ID');

const aRes = await readNode('assignments');
const vRes = await readNode('vehicles');
if (aRes.status !== 'ok' || !aRes.value) { console.error('READ /assignments FAILED', aRes); throw new Error('no data'); }
const ALL = Object.entries(aRes.value).map(([id, r]) => ({ id, ...r }));
const VEH = vRes.status === 'ok' && vRes.value
  ? Object.entries(vRes.value).map(([id, r]) => ({ id, ...r })) : [];
const vehOdo = new Map(VEH.map(v => [norm(v.name), num(v.odometer)]));

// ---- duration (hours), overnight-aware ----
const durH = a => {
  const m = t => { const x = /^(\d{1,2}):(\d{2})/.exec(t || ''); return x ? +x[1]*60 + +x[2] : null; };
  const s = m(a.startTime), e = m(a.endTime);
  if (s == null || e == null) return null;
  return ((e >= s ? e - s : e + 1440 - s) / 60) || null;
};
const band = d => d == null ? null : d >= 2000 ? 'CRITICAL' : d >= 1000 ? 'HIGH' : d >= 500 ? 'MEDIUM' : d >= 250 ? 'LOW' : null;

// ---- per-record enrichment ----
const rows = ALL.map(a => {
  const s = num(a.startOdometer), e = num(a.endOdometer), stored = num(a.distanceTravelled);
  const derived = (s != null && e != null) ? e - s : null;
  const dur = durH(a);
  const dist = stored != null ? stored : derived;
  return {
    id: a.id, date: a.date || a.startDate || '', jam: `${a.startTime||''}-${a.endTime||''}`,
    driver: a.driver || '', vehicle: a.vehicle || '', status: a.status || '',
    dest: a.destination || '', purpose: a.purpose || '',
    s, e, stored, derived, dur,
    arithMismatch: stored != null && derived != null && Math.abs(stored - derived) > 1,
    impossible: s != null && e != null && e < s,
    negative: stored != null && stored < 0,
    zeroDespiteDelta: (stored === 0 || stored == null) && derived != null && Math.abs(derived) >= 5,
    posDespiteNoMove: stored != null && stored > 0 && derived != null && Math.abs(derived) < 1,
    missingOdo: isCompleted(a) && norm(a.vehicle) && (s == null || e == null),
    band: band(dist),
    kmh: (dist != null && dur) ? dist / dur : null,
    repaired: REPAIRED.has(a.id),
  };
});

const completedOdo = rows.filter(r => isCompleted(r) && (r.s != null || r.e != null));
const NEW = rows.filter(r => !r.repaired);

// ---- percentiles over completed derived/stored distances ----
const dists = completedOdo.map(r => r.stored != null ? r.stored : r.derived).filter(d => d != null && d > 0).sort((x,y)=>x-y);
const pctile = p => dists.length ? dists[Math.min(dists.length-1, Math.floor(p/100*dists.length))] : null;
const P95 = pctile(95), P99 = pctile(99);

// ---- canonical anomaly pass (js/analytics/odometer-audit.js) ----
const anomA = auditOdometerAnomalies(ALL, { warnJumpKm: 300, continuityGapKm: 500, arithmeticToleranceKm: 1 });
const anomById = new Map(anomA.map(r => [r.assignmentId, r]));

// ---- SECTION A ----
console.log('\n===== SECTION A — SUMMARY =====');
console.table({
  'assignments scanned': ALL.length,
  'completed w/ odometer': completedOdo.length,
  'known repaired (excluded from findings)': rows.filter(r=>r.repaired).length,
  'integrity errors (impossible/neg/arith/mismatch)': NEW.filter(r=>r.impossible||r.negative||r.arithMismatch||r.posDespiteNoMove||r.zeroDespiteDelta).length,
  'anomaly candidates (canonical pass)': anomA.filter(r=>!REPAIRED.has(r.assignmentId)).length,
  'band CRITICAL >=2000': NEW.filter(r=>r.band==='CRITICAL').length,
  'band HIGH 1000-1999':  NEW.filter(r=>r.band==='HIGH').length,
  'band MEDIUM 500-999':  NEW.filter(r=>r.band==='MEDIUM').length,
  'band LOW 250-499':     NEW.filter(r=>r.band==='LOW').length,
  'P95 completed trip km': P95, 'P99 completed trip km': P99,
});

// ---- SECTION B — integrity errors + HIGH-confidence anomalies ----
const highConf = NEW.filter(r =>
  r.impossible || r.negative || r.arithMismatch || r.posDespiteNoMove || r.zeroDespiteDelta ||
  anomById.get(r.id)?.severity === 'high' ||
  (r.kmh != null && r.kmh > 120));
console.log('\n===== SECTION B — INTEGRITY ERRORS / HIGH-CONFIDENCE =====');
console.table(highConf.map(r => ({
  id:r.id, date:r.date, jam:r.jam, driver:r.driver, vehicle:r.vehicle,
  start:fmt(r.s), end:fmt(r.e), stored:fmt(r.stored), derived:fmt(r.derived),
  kmh: r.kmh==null?'—':Math.round(r.kmh),
  anomaly: [
    r.impossible&&'IMPOSSIBLE', r.negative&&'NEGATIVE_DISTANCE', r.arithMismatch&&'ARITHMETIC_MISMATCH',
    r.posDespiteNoMove&&'DISTANCE_WITHOUT_MOVEMENT', r.zeroDespiteDelta&&'ZERO_DISTANCE_WITH_DELTA',
    r.kmh>120&&'IMPLAUSIBLE_SPEED', ...(anomById.get(r.id)?.anomalies||[])
  ].filter(Boolean).join(', '),
  evidence: anomById.get(r.id)?.evidence || '',
})));

// ---- SECTION C — other anomaly candidates (medium/low/statistical) ----
const otherCand = anomA.filter(r => !REPAIRED.has(r.assignmentId) && !highConf.some(h=>h.id===r.assignmentId))
  .concat(NEW.filter(r => (r.band && !anomById.has(r.id) && !highConf.some(h=>h.id===r.id)))
    .map(r => ({ assignmentId:r.id, driver:r.driver, vehicle:r.vehicle, date:r.date,
                 startOdometer:r.s, endOdometer:r.e, distanceStored:r.stored, distanceDerived:r.derived,
                 anomalies:['DISTANCE_BAND_'+r.band], severity:'low', evidence:`band ${r.band}` })));
console.log('\n===== SECTION C — OTHER ANOMALY CANDIDATES =====');
console.table(otherCand.map(r => ({ id:r.assignmentId, date:r.date, driver:r.driver, vehicle:r.vehicle,
  start:fmt(r.startOdometer), end:fmt(r.endOdometer), stored:fmt(r.distanceStored), derived:fmt(r.distanceDerived),
  anomaly:(r.anomalies||[]).join(', '), severity:r.severity, evidence:r.evidence })));

// ---- SECTION D — per-vehicle continuity chains ----
console.log('\n===== SECTION D — VEHICLE CONTINUITY =====');
const byVeh = {};
for (const r of rows.filter(r => norm(r.vehicle) && (r.status==='completed'||r.status==='selesai')))
  (byVeh[r.vehicle] ||= []).push(r);
for (const [v, list] of Object.entries(byVeh)) {
  list.sort((a,b)=> (a.date+a.jam).localeCompare(b.date+b.jam));
  const chain = list.map((r,i) => {
    const prev = list[i-1];
    const gapVsPrevEnd = (prev && prev.e != null && r.s != null) ? r.s - prev.e : null;
    return { id:r.id, date:r.date, jam:r.jam, driver:r.driver, start:fmt(r.s), end:fmt(r.e),
      stored:fmt(r.stored), gapVsPrevEnd: gapVsPrevEnd==null?'—':fmt(gapVsPrevEnd),
      flag: gapVsPrevEnd==null ? '' : gapVsPrevEnd < -1 ? 'BACKWARD' : gapVsPrevEnd > 500 ? 'BIG_GAP' : '',
      repaired: r.repaired ? '✔ repaired' : '' };
  });
  console.log(`--- ${v}  (vehicles/{}.odometer = ${fmt(vehOdo.get(norm(v)))}) ---`);
  console.table(chain);
}

// ---- SECTION E — driver impact ----
console.log('\n===== SECTION E — DRIVER IMPACT =====');
const flaggedIds = new Set([...highConf.map(r=>r.id), ...otherCand.map(r=>r.assignmentId)]);
const byDrv = {};
for (const r of completedOdo) {
  const d = r.driver || '(kosong)';
  const km = r.stored != null ? r.stored : r.derived;
  if (km == null || km <= 0) continue;
  (byDrv[d] ||= { total:0, susp:0 });
  byDrv[d].total += km;
  if (flaggedIds.has(r.id)) byDrv[d].susp += km;
}
console.table(Object.fromEntries(Object.entries(byDrv).map(([d,x]) =>
  [d, { totalKm: fmt(x.total), suspiciousKm: fmt(x.susp), pctAffected: x.total? Math.round(x.susp/x.total*100)+'%' : '—' }])));

// ---- SECTION F — top 20 distances ----
console.log('\n===== SECTION F — TOP 20 COMPLETED DISTANCES =====');
console.table(completedOdo
  .map(r => ({ id:r.id, date:r.date, jam:r.jam, driver:r.driver, vehicle:r.vehicle,
    dist: r.stored != null ? r.stored : r.derived, kmh: r.kmh==null?'—':Math.round(r.kmh),
    repaired: r.repaired?'✔':'' }))
  .filter(r => r.dist != null).sort((a,b)=>b.dist-a.dist).slice(0,20)
  .map(r => ({ ...r, dist: fmt(r.dist) })));

// ---- SECTION G — recommended review order ----
console.log('\n===== SECTION G — RECOMMENDED REVIEW ORDER =====');
console.log('1 IMMEDIATE  : SECTION B rows (integrity errors, backward continuity, impossible speed).');
console.log('2 CONFIRM    : SECTION D rows flagged BACKWARD/BIG_GAP whose start == a known stale baseline (19422 Luxio / 20886 Innova) or is far below the vehicle chain.');
console.log('3 STATISTICAL: SECTION C band-only rows and rows above P95/P99 with no continuity evidence.');
console.log('4 LIKELY OK  : everything else — large but with a matching vehicle chain, plausible speed, and a long-distance destination.');
console.log('\nDONE — nothing was written.');
```

## 5. Constraints honoured

- **No writes / no mutations** — the scanner only calls `readNode`.
- **No application-code change** — the scanner is a console paste, not a repo file; `js/analytics/odometer-audit.js` is reused unmodified.
- The 7 repaired IDs are excluded from "new findings" and shown as `✔ repaired`.
- Every proposed corrected value in §2 is **explicitly FOR HUMAN REVIEW**, with
  separate confidence for "is it corrupted" (HIGH) vs "the exact value" (LOW).
- `vehicles/{id}.odometer` is **read and displayed** (Section D header) so the
  operator can see whether the vehicle field itself is stuck — but it is not
  changed.
