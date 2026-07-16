/* overtime-analytics-engine-check.mjs — pins Sprint 7's pure summary math
   (js/overtime/overtime-analytics-engine.js). Run: node scripts/overtime-analytics-engine-check.mjs
   (exit 0 = pass). No Firebase, no DOM — the engine is pure. */

import {
  emptySummary, addRecordToSummary, subtractRecordFromSummary, buildSummaryFromRecords, mergeSummaries,
  reconcileSummaryEdit,
  topUnits, topEmployees, sumDailySummariesInRange, weekRangeContaining, monthRangeOf, yearRangeOf,
  buildTrendSeries, buildHeatmapGrid, buildBudgetAnalytics, buildExecutiveCards,
} from '../js/overtime/overtime-analytics-engine.js';
import { annualizedProjection } from '../js/analytics/engines/trend-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const units = [{ id: 'u1', name: 'Engineering' }, { id: 'u2', name: 'Cleaning Service' }];
const employees = [{ id: 'e1', name: 'Budi', unitId: 'u1' }, { id: 'e2', name: 'Siti', unitId: 'u1' }, { id: 'e3', name: 'Agus', unitId: 'u2' }];

const r1 = { employeeId: 'e1', unitId: 'u1', date: '2026-07-01', rateAmount: 100000 };
const r2 = { employeeId: 'e2', unitId: 'u1', date: '2026-07-01', rateAmount: 100000 };
const r3 = { employeeId: 'e3', unitId: 'u2', date: '2026-07-02', rateAmount: 150000 };
const r4 = { employeeId: 'e1', unitId: 'u1', date: '2026-07-15', rateAmount: 100000 };
const r5 = { employeeId: 'e3', unitId: 'u2', date: '2026-08-01', rateAmount: 150000 };
const r6 = { employeeId: 'e1', unitId: 'u1', date: '2025-12-31', rateAmount: 100000 };
const allRecords = [r1, r2, r3, r4, r5, r6];
const julyRecords = [r1, r2, r3, r4];

console.log('[emptySummary / addRecordToSummary / subtractRecordFromSummary]');
check('emptySummary shape', JSON.stringify(emptySummary()) === JSON.stringify({ totalRecords: 0, totalAmount: 0, byUnit: {}, byEmployee: {}, updatedAt: null }));
{
  const s1 = addRecordToSummary(null, r1);
  check('add to null == add to empty', s1.totalRecords === 1 && s1.totalAmount === 100000);
  const s2 = addRecordToSummary(s1, r2);
  check('two adds accumulate totals', s2.totalRecords === 2 && s2.totalAmount === 200000);
  check('byUnit bucket accumulates', s2.byUnit.u1.count === 2 && s2.byUnit.u1.amount === 200000);
  check('byEmployee split by employee', s2.byEmployee.e1.count === 1 && s2.byEmployee.e2.count === 1);
  const s3 = subtractRecordFromSummary(s2, r1);
  const s2r = addRecordToSummary(null, r2);
  check('add(r1,r2) minus r1 == add(r2) [totals]', s3.totalRecords === s2r.totalRecords && s3.totalAmount === s2r.totalAmount);
  check('subtract removes the emptied byUnit... no, byUnit still has u1 (r2 also u1)', s3.byUnit.u1 && s3.byUnit.u1.count === 1);
  check('subtract deletes an employee bucket once its count hits 0', s3.byEmployee.e1 === undefined && s3.byEmployee.e2.count === 1);
  const s4 = subtractRecordFromSummary(s2r, r2);
  check('subtracting the only record empties byUnit/byEmployee entirely', Object.keys(s4.byUnit).length === 0 && Object.keys(s4.byEmployee).length === 0 && s4.totalRecords === 0);
}

console.log('[buildSummaryFromRecords — hand-computed cross-check]');
{
  const full = buildSummaryFromRecords(allRecords);
  check('totalRecords == 6', full.totalRecords === 6);
  check('totalAmount == 700000', full.totalAmount === 700000);
  check('byUnit.u1 == {count:4, amount:400000}', full.byUnit.u1.count === 4 && full.byUnit.u1.amount === 400000);
  check('byUnit.u2 == {count:2, amount:300000}', full.byUnit.u2.count === 2 && full.byUnit.u2.amount === 300000);
  check('byEmployee.e1 == {count:3, amount:300000}', full.byEmployee.e1.count === 3 && full.byEmployee.e1.amount === 300000);
  check('byEmployee.e2 == {count:1, amount:100000}', full.byEmployee.e2.count === 1 && full.byEmployee.e2.amount === 100000);
  check('byEmployee.e3 == {count:2, amount:300000}', full.byEmployee.e3.count === 2 && full.byEmployee.e3.amount === 300000);

  const folded = allRecords.reduce((s, r) => addRecordToSummary(s, r), null);
  check('buildSummaryFromRecords === fold of addRecordToSummary (order-independent construction)', JSON.stringify({ ...full, updatedAt: null }) === JSON.stringify({ ...folded, updatedAt: null }));
}

console.log('[mergeSummaries]');
{
  const dayA = addRecordToSummary(null, r1); // e1/u1, 100000
  const dayB = addRecordToSummary(null, r3); // e3/u2, 150000
  const merged = mergeSummaries([dayA, dayB]);
  check('mergeSummaries totals == sum of inputs', merged.totalRecords === 2 && merged.totalAmount === 250000);
  check('mergeSummaries preserves per-bucket detail', merged.byUnit.u1.amount === 100000 && merged.byUnit.u2.amount === 150000);
  check('mergeSummaries([]) == emptySummary (modulo updatedAt)', JSON.stringify({ ...mergeSummaries([]), updatedAt: null }) === JSON.stringify(emptySummary()));
  check('mergeSummaries ignores null/undefined entries', mergeSummaries([dayA, null, undefined, dayB]).totalRecords === 2);
  check('mergeSummaries == buildSummaryFromRecords for the same records (cross-check)', JSON.stringify({ ...merged, updatedAt: null }) === JSON.stringify({ ...buildSummaryFromRecords([r1, r3]), updatedAt: null }));
}

console.log('[reconcileSummaryEdit — Sprint 9 record-edit reconciliation]');
{
  // Simulates the store: a plain dateISO/yyyy-mm -> summary lookup.
  const store = { '2026-07-01': addRecordToSummary(null, r1) }; // r1 = e1/u1, 100000
  const getSummary = (key) => store[key] || null;

  // Case 1: date unchanged, amount changes (e.g. reassigned to a different rate).
  const r1Edited = { ...r1, rateAmount: 200000 };
  const patch1 = reconcileSummaryEdit(getSummary, '2026-07-01', '2026-07-01', r1, r1Edited);
  check('same-key edit returns exactly one key', Object.keys(patch1).length === 1 && '2026-07-01' in patch1);
  check('same-key edit nets the amount to the NEW value (100000 -> 200000)', patch1['2026-07-01'].totalAmount === 200000);
  check('same-key edit keeps recordCount at 1 (subtract-then-add, not a net add)', patch1['2026-07-01'].totalRecords === 1);
  check('same-key edit result matches a full rebuild of the same end-state', JSON.stringify({ ...patch1['2026-07-01'], updatedAt: null }) === JSON.stringify({ ...buildSummaryFromRecords([r1Edited]), updatedAt: null }));

  // Case 2: date changes (e.g. corrected to the right day) — old day empties, new day gains it.
  const r1Moved = { ...r1, date: '2026-07-05' };
  const patch2 = reconcileSummaryEdit(getSummary, '2026-07-01', '2026-07-05', r1, r1Moved);
  check('key-changed edit returns both the old and new keys', Object.keys(patch2).length === 2);
  check('old key summary empties out entirely', patch2['2026-07-01'].totalRecords === 0 && Object.keys(patch2['2026-07-01'].byUnit).length === 0);
  check('new key summary gains exactly the moved record', patch2['2026-07-05'].totalRecords === 1 && patch2['2026-07-05'].totalAmount === r1.rateAmount);
}

console.log('[topUnits / topEmployees]');
{
  const julySummary = buildSummaryFromRecords(julyRecords);
  const tu = topUnits(julySummary, units, employees, 5);
  check('topUnits sorted desc by amount', tu[0].unitId === 'u1' && tu[0].amount === 300000 && tu[1].unitId === 'u2');
  check('topUnits.employeeCount is a DISTINCT headcount (u1: e1+e2 -> 2)', tu[0].employeeCount === 2);
  check('topUnits.employeeCount for u2 (only e3) -> 1', tu[1].employeeCount === 1);
  const te = topEmployees(julySummary, employees, 1);
  check('topEmployees respects limit', te.length === 1 && te[0].employeeId === 'e1' && te[0].amount === 200000);
}

console.log('[sumDailySummariesInRange / weekRangeContaining / monthRangeOf / yearRangeOf]');
const dailySummaries = {
  '2026-07-01': { totalRecords: 2, totalAmount: 200000, byUnit: {}, byEmployee: {} },
  '2026-07-02': { totalRecords: 1, totalAmount: 150000, byUnit: {}, byEmployee: {} },
  '2026-07-15': { totalRecords: 1, totalAmount: 100000, byUnit: {}, byEmployee: {} },
  '2026-08-01': { totalRecords: 1, totalAmount: 150000, byUnit: {}, byEmployee: {} },
  '2025-12-31': { totalRecords: 1, totalAmount: 100000, byUnit: {}, byEmployee: {} },
};
{
  const r = sumDailySummariesInRange(dailySummaries, '2026-07-01', '2026-07-07');
  check('range sum bounds correctly (excludes day15/Aug/2025)', r.days === 2 && r.amount === 350000 && r.records === 3);

  const wk = weekRangeContaining('2026-07-15');
  const startD = new Date(`${wk.start}T00:00:00`), endD = new Date(`${wk.end}T00:00:00`);
  check('weekRangeContaining returns a Mon..Sun 7-day span containing the date', startD.getDay() === 1 && endD.getDay() === 0 && (endD - startD) === 6 * 86400000 && wk.start <= '2026-07-15' && '2026-07-15' <= wk.end);

  check('monthRangeOf non-leap Feb', JSON.stringify(monthRangeOf('2026-02')) === JSON.stringify({ start: '2026-02-01', end: '2026-02-28' }));
  check('monthRangeOf leap Feb', JSON.stringify(monthRangeOf('2024-02')) === JSON.stringify({ start: '2024-02-01', end: '2024-02-29' }));
  check('yearRangeOf', JSON.stringify(yearRangeOf('2026')) === JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }));
}

console.log('[buildTrendSeries — daily/weekly/monthly/yearly, month+year boundary fixture]');
{
  const daily = buildTrendSeries(dailySummaries, 'daily');
  check('daily granularity: one point per date (5 dates)', daily.points.length === 5);
  check('daily granularity total == sum of all amounts', daily.summary.total === 700000);

  const monthly = buildTrendSeries(dailySummaries, 'monthly');
  check('monthly granularity buckets across a year boundary into 3 buckets (2025-12, 2026-07, 2026-08)', monthly.points.length === 3);
  const julyBucket = monthly.points.find(p => p.label === '2026-07');
  check('monthly bucket for 2026-07 sums its 3 days', julyBucket && julyBucket.value === 450000 && julyBucket.count === 4);

  const yearly = buildTrendSeries(dailySummaries, 'yearly');
  check('yearly granularity buckets into 2 years (2025, 2026)', yearly.points.length === 2);
  const y2026 = yearly.points.find(p => p.label === '2026');
  check('yearly bucket for 2026 sums July+Aug', y2026 && y2026.value === 600000);

  const weekly = buildTrendSeries(dailySummaries, 'weekly');
  const weeklyTotal = weekly.points.reduce((a, p) => a + p.value, 0);
  check('weekly granularity conserves total amount across buckets', weeklyTotal === 700000);
}

console.log('[buildHeatmapGrid]');
{
  const grid31 = buildHeatmapGrid(dailySummaries, '2026-07');
  check('31-day month produces 31 cells', grid31.length === 31);
  const day1 = grid31.find(c => c.date === '2026-07-01');
  const day2 = grid31.find(c => c.date === '2026-07-02');
  check('busiest day (day1, 200000) has intensity 1', day1.intensity === 1);
  check('day2 intensity scaled relative to day1 (150000/200000)', Math.abs(day2.intensity - 0.75) < 1e-9);
  check('empty day has count 0, amount 0, intensity 0', grid31.find(c => c.date === '2026-07-10').amount === 0 && grid31.find(c => c.date === '2026-07-10').intensity === 0);

  const grid29 = buildHeatmapGrid({}, '2024-02');
  check('leap-Feb month produces 29 cells', grid29.length === 29);
  const grid30 = buildHeatmapGrid({}, '2026-04');
  check('30-day month produces 30 cells', grid30.length === 30);
}

console.log('[buildBudgetAnalytics]');
{
  const zeroTarget = buildBudgetAnalytics({ monthlyAmount: 450000, yearAmount: 450000, target: 0, today: '2026-07-15' });
  check('target=0 -> utilization is null, never Infinity', zeroTarget.utilization === null);

  const b = buildBudgetAnalytics({ monthlyAmount: 450000, yearAmount: 450000, target: 500000, today: '2026-07-15' });
  check('running == monthlyAmount', b.running === 450000);
  check('remaining == target - running', b.remaining === 50000);
  check('utilization == running/target*100', b.utilization === 90);
  check('avgPerDay == running / elapsedDaysInMonth (15)', b.avgPerDay === 30000);
  const expectedEOM = annualizedProjection(450000, 15, 31).projected;
  check('projectedEOM reuses trend-engine.annualizedProjection with horizon=daysInMonth', b.projectedEOM === expectedEOM);
  const dayOfYear = Math.floor((new Date('2026-07-15T00:00:00') - new Date(2026, 0, 1)) / 86400000) + 1;
  const expectedEOY = annualizedProjection(450000, dayOfYear, 365).projected;
  check('projectedEOY reuses trend-engine.annualizedProjection with horizon=daysInYear', b.projectedEOY === expectedEOY);
}

console.log('[buildExecutiveCards]');
{
  const julySummary = buildSummaryFromRecords(julyRecords);
  const julyCells = buildHeatmapGrid(dailySummaries, '2026-07');
  const cards = buildExecutiveCards({ heatmapCells: julyCells, monthlySummary: julySummary, units, employees });
  check('topUnit == u1 (highest July amount)', cards.topUnit && cards.topUnit.unitId === 'u1');
  check('topEmployee == e1 (highest July amount)', cards.topEmployee && cards.topEmployee.employeeId === 'e1');
  check('mostExpensiveDay == 2026-07-01 (200000)', cards.mostExpensiveDay && cards.mostExpensiveDay.date === '2026-07-01' && cards.mostExpensiveDay.amount === 200000);
  const dow1 = new Date('2026-07-01T00:00:00').getDay();
  const dow15 = new Date('2026-07-15T00:00:00').getDay();
  const expectedFrequentCount = dow1 === dow15 ? 3 : 2;
  check('mostFrequentDayOfWeek count matches independently-grouped weekday totals', cards.mostFrequentDayOfWeek && cards.mostFrequentDayOfWeek.count === expectedFrequentCount);
  check('averageCost == totalAmount/totalRecords (450000/4)', cards.averageCost === 112500);
  check('averageEmployeePerDay == totalRecords / daysWithData (4/3)', Math.abs(cards.averageEmployeePerDay - 4 / 3) < 1e-9);

  const empty = buildExecutiveCards({ heatmapCells: [], monthlySummary: emptySummary(), units, employees });
  check('empty month: no crash, all nullable fields null/zero', empty.topUnit === null && empty.mostExpensiveDay === null && empty.mostFrequentDayOfWeek === null && empty.averageCost === 0 && empty.averageEmployeePerDay === 0);
}

console.log('\n' + '─'.repeat(50));
console.log(`Overtime Analytics Engine: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
