/* overtime-report-model-check.mjs — pins the canonical two-section
   administrative layout (js/exports/analytics/model/overtime-report-model.js),
   built to match the org's real payroll spreadsheet: date-grouped detail
   with subtotals + grand total, and an alphabetically-sorted recap with
   Total Keseluruhan. This file has zero Firebase dependency (pure
   projection of a plain snapshot object), so it's directly Node-testable
   even though overtime-service.js (which builds the real snapshot) is not.
   Run: node scripts/overtime-report-model-check.mjs (exit 0 = pass) */

import { buildOvertimeReportModel } from '../js/exports/analytics/model/overtime-report-model.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const snapshot = {
  period: 'month',
  periodLabel: 'Bulanan — 2026-04',
  dateRangeStart: '2026-04-01',
  dateRangeEnd: '2026-04-30',
  scope: { type: 'all', label: 'Semua Unit & Karyawan' },
  detailRecords: [
    { date: '2026-04-03', employeeName: 'Sadino', unitName: 'Lapangan', amount: 150000 },
    { date: '2026-04-03', employeeName: 'Senen', unitName: 'Lapangan', amount: 150000 },
    { date: '2026-04-04', employeeName: 'Fahmi', unitName: 'Engineering', amount: 100000 },
  ],
  employeeRows: [
    { employeeId: 'e3', name: 'Zubaidah', count: 2, amount: 300000, unitName: 'Taman' },
    { employeeId: 'e1', name: 'Ahmad', count: 1, amount: 150000, unitName: 'Lapangan' },
  ],
};

const model = buildOvertimeReportModel(snapshot, { generatedBy: 'Admin', appVersion: '1.27.0', generatedAt: Date.now() });

console.log('[meta / titles]');
check('detailTitle matches the canonical spreadsheet wording', model.meta.detailTitle === 'DATA PENGAJUAN LEMBUR TIM/KARYAWAN SARPRAS PBSI PERIODE APRIL 2026');
check('recapTitle matches the canonical spreadsheet wording', model.meta.recapTitle === 'Rekapitulasi Lembur Staf Sarpras Periode April 2026');

console.log('[Section A — dateGroups: grouping, subtotal, grand total, running No]');
check('groups by DATE, sorted chronologically (2 distinct dates)', model.dateGroups.length === 2 && model.dateGroups[0].date === '2026-04-03' && model.dateGroups[1].date === '2026-04-04');
{
  const d = new Date('2026-04-03T00:00:00');
  const expectedLabel = `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })} ${d.getFullYear()}`;
  check('date label uses the ENGLISH weekday format, matching the source sheet exactly', model.dateGroups[0].dateLabel === expectedLabel);
}
check('first date group has 2 rows (Sadino, Senen)', model.dateGroups[0].rows.length === 2);
check('first date group subtotal == 300000', model.dateGroups[0].subtotal === 'Rp300.000');
check('second date group subtotal == 100000', model.dateGroups[1].subtotal === 'Rp100.000');
check('running "No" continues ACROSS date groups (1,2 then 3, not resetting per date)', model.dateGroups[0].rows[0].no === 1 && model.dateGroups[0].rows[1].no === 2 && model.dateGroups[1].rows[0].no === 3);
check('detailGrandTotal == sum of all 3 records (400000)', model.detailGrandTotal === 'Rp400.000');
check('detailIsEmpty is false when records exist', model.detailIsEmpty === false);

console.log('[empty detail — no crash, correct empty flag]');
{
  const emptyModel = buildOvertimeReportModel({ ...snapshot, detailRecords: [] }, {});
  check('zero records -> zero groups, grand total Rp0, isEmpty true', emptyModel.dateGroups.length === 0 && emptyModel.detailGrandTotal === 'Rp0' && emptyModel.detailIsEmpty === true);
}

console.log('[Section B — recapRows: ALPHABETICAL sort (not amount-ranked), grand total]');
check('recap rows sorted alphabetically by name (Ahmad before Zubaidah, despite Zubaidah having the higher amount)', model.recapRows[0].name === 'Ahmad' && model.recapRows[1].name === 'Zubaidah');
check('recap "No" reflects the NEW alphabetical order, not the input order', model.recapRows[0].no === 1 && model.recapRows[1].no === 2);
check('recap row carries the extra "Jumlah Hari" column (days) beyond the sheet\'s literal 3 columns', model.recapRows[0].days === 1 && model.recapRows[1].days === 2);
check('recap row carries Bidang (unitName)', model.recapRows[0].unitName === 'Lapangan' && model.recapRows[1].unitName === 'Taman');
check('recapGrandTotal == Total Keseluruhan (450000)', model.recapGrandTotal === 'Rp450.000');
check('recapIsEmpty is false when rows exist', model.recapIsEmpty === false);

console.log('[metadata passthrough]');
check('generatedBy passes through', model.generatedBy === 'Admin');
check('appVersion passes through', model.appVersion === '1.27.0');

console.log('[period title variants]');
{
  const yearModel = buildOvertimeReportModel({ ...snapshot, period: 'year', dateRangeStart: '2026-01-01' }, {});
  check('year period -> "2026" title', yearModel.meta.detailTitle.endsWith('PERIODE 2026'));
  const dayModel = buildOvertimeReportModel({ ...snapshot, period: 'day', dateRangeStart: '2026-04-03', dateRangeEnd: '2026-04-03' }, {});
  check('day period falls back to the literal date range in the title', dayModel.meta.detailTitle.includes('2026-04-03'));
}

console.log('\n' + '─'.repeat(50));
console.log(`Overtime Report Model: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
