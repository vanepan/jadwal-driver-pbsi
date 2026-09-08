/* odometer-anomaly-audit-check.mjs — V1 broad odometer anomaly detector.

   Pure Node against js/analytics/odometer-audit.js (no DOM, no Firebase, no
   settings). The detector CLASSIFIES suspicious odometer data for human review
   — it never writes and never says "confirmed wrong".

   Run: node scripts/odometer-anomaly-audit-check.mjs   (exit 0 = all pass)
*/

import { auditOdometerAnomalies, recomputeCorrectedTrip } from '../js/analytics/odometer-audit.js';

let pass = 0, fail = 0;
const check = (n, c, detail) => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const A = (o) => ({
  id: o.id, driver: o.driver ?? 'Igo', vehicle: o.vehicle ?? 'B 1234 XY',
  date: o.date ?? '2026-09-01', startTime: o.startTime ?? '08:00', endTime: o.endTime ?? '10:00',
  status: o.status ?? 'completed',
  startOdometer: o.s ?? null, endOdometer: o.e ?? null,
  distanceTravelled: o.dist === undefined ? ((o.s != null && o.e != null && o.e >= o.s) ? o.e - o.s : null) : o.dist,
});
const T = { warnJumpKm: 300, continuityGapKm: 500, arithmeticToleranceKm: 1 };
const findRow = (rows, id) => rows.find(r => r.assignmentId === id);

/* ══ 1 — the brief's BROAD AUDIT TEST fixture ══ */
console.log('\n[1 — A/B/C chain: C is the anomaly]');
const chain = auditOdometerAnomalies([
  A({ id: 'A', date: '2026-09-01', s: 20000, e: 20100 }),
  A({ id: 'B', date: '2026-09-02', s: 20100, e: 20250 }),
  A({ id: 'C', date: '2026-09-03', s: 20250, e: 40250 }),
], T);
check('A and B are NOT flagged', !findRow(chain, 'A') && !findRow(chain, 'B'), chain.map(r => r.assignmentId));
check('C IS flagged', !!findRow(chain, 'C'), chain);
check('C anomaly is LARGE_JUMP, severity low (suspicious, not "wrong")',
  findRow(chain, 'C')?.anomalies.includes('LARGE_JUMP') && findRow(chain, 'C')?.severity === 'low', findRow(chain, 'C'));
check('C is NOT classified as impossible / confirmed', !findRow(chain, 'C')?.anomalies.includes('IMPOSSIBLE'), findRow(chain, 'C'));

/* ══ 2 — the anomaly kinds ══ */
console.log('\n[2 — each anomaly kind]');
const kinds = auditOdometerAnomalies([
  A({ id: 'imp',  s: 22491, e: 22390 }),                                  // IMPOSSIBLE
  A({ id: 'ari',  s: 10000, e: 10100, dist: 999 }),                       // ARITHMETIC_MISMATCH
  A({ id: 'miss', s: null,  e: null }),                                   // MISSING_ODOMETER
  A({ id: 'v1a',  vehicle: 'V2', date: '2026-09-01', s: 500, e: 600 }),
  A({ id: 'v1b',  vehicle: 'V2', date: '2026-09-02', s: 400, e: 450 }),   // CONTINUITY_BACKWARD (400 < 600)
  A({ id: 'v3a',  vehicle: 'V3', date: '2026-09-01', s: 1000, e: 1100 }),
  A({ id: 'v3b',  vehicle: 'V3', date: '2026-09-02', s: 2000, e: 2100 }), // CONTINUITY_GAP (+900 > 500)
  A({ id: 'st1',  vehicle: 'V4', date: '2026-09-01', s: 3000, e: 3100 }),
  A({ id: 'st2',  vehicle: 'V4', date: '2026-09-02', s: 3000, e: 3200 }), // STALE_START (3000 reused)
], T);
check('IMPOSSIBLE flagged, severity high', findRow(kinds, 'imp')?.anomalies.includes('IMPOSSIBLE') && findRow(kinds, 'imp')?.severity === 'high');
check('ARITHMETIC_MISMATCH flagged (stored 999 vs derived 100)', findRow(kinds, 'ari')?.anomalies.includes('ARITHMETIC_MISMATCH'));
check('MISSING_ODOMETER flagged for a completed vehicle trip with no odo', findRow(kinds, 'miss')?.anomalies.includes('MISSING_ODOMETER'));
check('CONTINUITY_BACKWARD flagged (start below previous vehicle end), severity high',
  findRow(kinds, 'v1b')?.anomalies.includes('CONTINUITY_BACKWARD') && findRow(kinds, 'v1b')?.severity === 'high');
check('CONTINUITY_GAP flagged (large forward jump between trips), severity low',
  findRow(kinds, 'v3b')?.anomalies.includes('CONTINUITY_GAP') && findRow(kinds, 'v3b')?.severity === 'low');
check('STALE_START flagged (same start reused on one vehicle)', findRow(kinds, 'st2')?.anomalies.includes('STALE_START'));
check('a modest forward gap (v3a→v3b uses vehicle chain, not v1) does not false-positive elsewhere',
  !findRow(kinds, 'v3a'), findRow(kinds, 'v3a'));

/* ══ 3 — private mileage between trips is NOT auto-flagged ══ */
console.log('\n[3 — legitimate small gap between assignments is tolerated]');
const priv = auditOdometerAnomalies([
  A({ id: 'p1', vehicle: 'VP', date: '2026-09-01', s: 5000, e: 5080 }),
  A({ id: 'p2', vehicle: 'VP', date: '2026-09-02', s: 5140, e: 5200 }), // +60 km private use — under continuityGapKm
], T);
check('a 60 km inter-trip gap is NOT flagged (private/maintenance mileage is legitimate)', priv.length === 0, priv);

/* ══ 4 — the six Igo correction patterns (correctStart + validEnd = correctDistance) ══ */
console.log('\n[4 — recomputeCorrectedTrip for the six known corrections]');
// operator-confirmed correct KM Awal ; a plausible valid end ; expected distance
const cases = [
  { name: 'C1', correctStart: 3424,  existingEnd: 3525,  expectDist: 101, oldDist: 597 },
  { name: 'C2', correctStart: 22149, existingEnd: 22250, expectDist: 101, oldDist: 20004 },
  { name: 'C3', correctStart: 20789, existingEnd: 20890, expectDist: 101, oldDist: 18644 },
  { name: 'C4', correctStart: 20490, existingEnd: 20591, expectDist: 101, oldDist: 17664 },
  { name: 'C5', correctStart: 21947, existingEnd: 22048, expectDist: 101, oldDist: 19801 },
  { name: 'C6', correctStart: 21961, existingEnd: 22062, expectDist: 101, oldDist: 19815 },
];
for (const c of cases) {
  const r = recomputeCorrectedTrip({ correctStart: c.correctStart, existingEnd: c.existingEnd, oldDistance: c.oldDist });
  check(`${c.name}: corrected distance = end − correctStart = ${c.expectDist}`, r.correctedDistance === c.expectDist, r);
  check(`${c.name}: valid END is kept (endKept)`, r.endKept === true && r.correctedEnd === c.existingEnd, r);
  check(`${c.name}: excess KM removed = oldDistance − correctedDistance`, r.excessKm === c.oldDist - c.expectDist, r);
}

/* ══ 5 — the worked incident from the brief: 22.390 → 22.491 = 101 km ══ */
console.log('\n[5 — brief incident: start 22.390, end 22.491]');
const inc = recomputeCorrectedTrip({ correctStart: 22390, existingEnd: 22491, oldDistance: 20245 });
check('corrected distance = 101 km', inc.correctedDistance === 101, inc);
check('end 22.491 is preserved (not reset to 22.390 or 2.246)', inc.correctedEnd === 22491, inc);
check('excess mileage removed = 20.245 − 101 = 20.144 km', inc.excessKm === 20144, inc);

/* ══ 6 — END below the corrected START ⇒ end is NOT kept ══ */
console.log('\n[6 — a genuinely-invalid end is not blindly kept]');
const bad = recomputeCorrectedTrip({ correctStart: 22390, existingEnd: 22380, oldDistance: null });
check('when existingEnd < correctStart, endKept is false and distance clamps to 0', bad.endKept === false && bad.correctedDistance === 0, bad);

/* ══ 7 — determinism + read-only ══ */
console.log('\n[7 — deterministic, read-only]');
const input = [A({ id: 'x', s: 100, e: 5000 }), A({ id: 'y', s: 5000, e: 5050 })];
const snapshot = JSON.stringify(input);
const run1 = JSON.stringify(auditOdometerAnomalies(input, T));
const run2 = JSON.stringify(auditOdometerAnomalies(input, T));
check('two runs on the same input are byte-identical', run1 === run2);
check('the input array is not mutated', JSON.stringify(input) === snapshot);
check('rows are ordered most-severe first', (() => {
  const rows = auditOdometerAnomalies([
    A({ id: 'lo', vehicle: 'Z', date: '2026-09-01', s: 0, e: 400 }),      // LARGE_JUMP (low)
    A({ id: 'hi', vehicle: 'Z', date: '2026-09-02', s: 200, e: 250 }),    // CONTINUITY_BACKWARD (high)
  ], T);
  return rows[0].assignmentId === 'hi';
})());

console.log(`\nodometer-anomaly-audit-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
