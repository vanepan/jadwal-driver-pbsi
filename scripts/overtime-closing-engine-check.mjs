/* overtime-closing-engine-check.mjs — pins Sprint 9's pure Monthly Closing
   validation rules (js/overtime/overtime-closing-engine.js).
   Run: node scripts/overtime-closing-engine-check.mjs (exit 0 = pass) */

import {
  WARNING_CODE, validateMonthForClosing, buildClosingSnapshot, isPeriodLocked, findDuplicateRecords,
} from '../js/overtime/overtime-closing-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const employees = [{ id: 'e1' }, { id: 'e2' }];
const rateVersions = [{ id: 'rv1' }];
const resolveTierForDate = (dateISO) => (dateISO === '2026-07-04' ? { tierKey: 'nationalHoliday' } : { tierKey: 'normal' });

console.log('[clean month — zero warnings]');
{
  const records = [
    { id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-01', tierKey: 'normal', rateVersionId: 'rv1', overrideApplied: false },
    { id: 'r2', employeeId: 'e2', unitId: 'u1', date: '2026-07-02', tierKey: 'normal', rateVersionId: 'rv1', overrideApplied: false },
  ];
  const result = validateMonthForClosing({ records, employees, rateVersions, resolveTierForDate });
  check('no warnings on clean data', result.warningCount === 0 && result.warnings.length === 0);
  check('checkedAt is a timestamp', typeof result.checkedAt === 'number' && result.checkedAt > 0);
}

console.log('[duplicate detection]');
{
  const records = [
    { id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-01', tierKey: 'normal', rateVersionId: 'rv1' },
    { id: 'r2', employeeId: 'e1', unitId: 'u1', date: '2026-07-01', tierKey: 'normal', rateVersionId: 'rv1' },
  ];
  const result = validateMonthForClosing({ records, employees, rateVersions, resolveTierForDate });
  check('flags duplicate employee+unit+date', result.warnings.some(w => w.code === WARNING_CODE.DUPLICATE));
  check('duplicate warning references both record ids', result.warnings.find(w => w.code === WARNING_CODE.DUPLICATE).recordIds.length === 2);
}

console.log('[missing employee]');
{
  const records = [{ id: 'r1', employeeId: 'e999', unitId: 'u1', date: '2026-07-01', tierKey: 'normal', rateVersionId: 'rv1' }];
  const result = validateMonthForClosing({ records, employees, rateVersions, resolveTierForDate });
  check('flags a record whose employee no longer exists', result.warnings.some(w => w.code === WARNING_CODE.MISSING_EMPLOYEE));
}

console.log('[invalid rate]');
{
  const records = [{ id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-01', tierKey: 'normal', rateVersionId: 'rv999' }];
  const result = validateMonthForClosing({ records, employees, rateVersions, resolveTierForDate });
  check('flags a record whose rate version no longer exists', result.warnings.some(w => w.code === WARNING_CODE.INVALID_RATE));
}

console.log('[holiday mismatch]');
{
  const mismatched = [{ id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-04', tierKey: 'normal', rateVersionId: 'rv1', overrideApplied: false }];
  const result = validateMonthForClosing({ records: mismatched, employees, rateVersions, resolveTierForDate });
  check('flags a record whose tier no longer matches the current calendar', result.warnings.some(w => w.code === WARNING_CODE.HOLIDAY_MISMATCH));

  const overridden = [{ id: 'r2', employeeId: 'e1', unitId: 'u1', date: '2026-07-04', tierKey: 'normal', rateVersionId: 'rv1', overrideApplied: true }];
  const result2 = validateMonthForClosing({ records: overridden, employees, rateVersions, resolveTierForDate });
  check('override-applied entries are NEVER flagged as holiday mismatch (by design)', !result2.warnings.some(w => w.code === WARNING_CODE.HOLIDAY_MISMATCH));
}

console.log('[never throws / blocks — the warn-only contract]');
{
  check('empty records array -> no throw, zero warnings', validateMonthForClosing({ records: [], employees, rateVersions }).warningCount === 0);
  check('null records -> no throw', validateMonthForClosing({ records: null, employees, rateVersions }).warningCount === 0);
  check('no args at all -> no throw', validateMonthForClosing().warningCount === 0);
  check('missing resolveTierForDate -> no throw, no holiday-mismatch check attempted', validateMonthForClosing({ records: [{ id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-04', tierKey: 'normal' }], employees, rateVersions }).warningCount === 0);
  // A month with MANY issues still returns normally — Closing is never blocked.
  const messy = [
    { id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-01', tierKey: 'normal', rateVersionId: 'rv1' },
    { id: 'r2', employeeId: 'e1', unitId: 'u1', date: '2026-07-01', tierKey: 'normal', rateVersionId: 'rv1' },
    { id: 'r3', employeeId: 'e999', unitId: 'u1', date: '2026-07-02', tierKey: 'normal', rateVersionId: 'rv999' },
    { id: 'r4', employeeId: 'e1', unitId: 'u1', date: '2026-07-04', tierKey: 'normal', rateVersionId: 'rv1', overrideApplied: false },
  ];
  const messyResult = validateMonthForClosing({ records: messy, employees, rateVersions, resolveTierForDate });
  check('a heavily-flagged month still returns (never throws) with multiple warning types', messyResult.warningCount >= 4);
}

console.log('[findDuplicateRecords — extracted for Dashboard/Penyesuaian Data reuse (Final UX Refinement §8L3)]');
{
  const clean = [
    { id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-01' },
    { id: 'r2', employeeId: 'e2', unitId: 'u1', date: '2026-07-01' },
  ];
  check('no duplicates on clean data', findDuplicateRecords(clean).length === 0);

  const dupe = [
    { id: 'r1', employeeId: 'e1', unitId: 'u1', date: '2026-07-01' },
    { id: 'r2', employeeId: 'e1', unitId: 'u1', date: '2026-07-01' },
    { id: 'r3', employeeId: 'e2', unitId: 'u1', date: '2026-07-01' },
  ];
  const groups = findDuplicateRecords(dupe);
  check('finds exactly one duplicate group', groups.length === 1);
  check('duplicate group carries both record ids', groups[0].recordIds.length === 2 && groups[0].recordIds.includes('r1') && groups[0].recordIds.includes('r2'));
  check('duplicate group identifies the employee/unit/date', groups[0].employeeId === 'e1' && groups[0].unitId === 'u1' && groups[0].date === '2026-07-01');
  check('empty/null input -> no crash, empty result', findDuplicateRecords([]).length === 0 && findDuplicateRecords(null).length === 0 && findDuplicateRecords(undefined).length === 0);
  check('validateMonthForClosing\'s own DUPLICATE warning uses this same primitive (cross-check)', validateMonthForClosing({ records: dupe, employees: [{ id: 'e1' }, { id: 'e2' }], rateVersions: [] }).warnings.filter(w => w.code === WARNING_CODE.DUPLICATE).length === 1);
}

console.log('[buildClosingSnapshot — versioning]');
{
  const s1 = buildClosingSnapshot({ yyyyMM: '2026-07', summary: { totalRecords: 2, totalAmount: 200000 }, recordIds: ['r1', 'r2'], warnings: [], priorVersion: 0, actorLabel: 'Admin' });
  check('first Closing -> version 1', s1.version === 1);
  check('reportRef starts null (filled in by the UI later)', s1.reportRef === null);
  check('recordCount derived from recordIds', s1.recordCount === 2);

  const s2 = buildClosingSnapshot({ yyyyMM: '2026-07', summary: { totalRecords: 3, totalAmount: 300000 }, recordIds: ['r1', 'r2', 'r3'], warnings: [], priorVersion: s1.version });
  check('re-Closing increments version (1 -> 2)', s2.version === 2);
}

console.log('[isPeriodLocked]');
{
  check('status closed -> locked', isPeriodLocked({ status: 'closed' }) === true);
  check('status open -> not locked', isPeriodLocked({ status: 'open' }) === false);
  check('null closing record -> not locked (never-closed month)', isPeriodLocked(null) === false);
  check('undefined -> not locked', isPeriodLocked(undefined) === false);
}

console.log('\n' + '─'.repeat(50));
console.log(`Overtime Closing Engine: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
