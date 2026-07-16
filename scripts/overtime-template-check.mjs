/* overtime-template-check.mjs — pins js/exports/analytics/overtime-template.js's
   pdfmake DocumentDefinition output. build() is pure data construction (no
   DOM, no pdfmake runtime calls), so it's directly Node-testable even
   though the actual PDF rendering only happens in-browser.

   Exists specifically as a regression guard for a real shipped bug (FIX 18,
   Production Polish Round 2): the Grand Total row's fillColor was a hex
   string missing its '#' prefix ('F7E6E8' instead of '#F7E6E8') — pdfmake
   silently rendered that as solid BLACK instead of the intended tint,
   making the "TOTAL KESELURUHAN" label unreadable. Also pins the Total
   column being wide enough (+ noWrap:true) that a real payroll figure like
   "Rp1.900.000" never wraps onto two lines.

   Run: node scripts/overtime-template-check.mjs (exit 0 = pass) */

import { getTemplate } from '../js/docs/template-registry.js';
import '../js/exports/analytics/overtime-template.js'; // self-registers 'overtime-report'
import { buildOvertimeReportModel } from '../js/exports/analytics/model/overtime-report-model.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

console.log('[registration]');
const tpl = getTemplate('overtime-report');
check('overtime-report template self-registered with a build() function', !!tpl && typeof tpl.build === 'function');
check('filename() is a function', typeof tpl.filename === 'function');

// Reproduces the exact scenario from the bug report: 19 records across 4
// dates, Rp1.900.000 grand total.
const dates = ['2026-07-15', '2026-07-18', '2026-07-25', '2026-07-31'];
const perDate = [5, 4, 7, 3];
const detailRecords = [];
perDate.forEach((n, di) => {
  for (let i = 0; i < n; i++) detailRecords.push({ date: dates[di], employeeName: `Emp${di}-${i}`, unitName: 'Engineering', amount: 100000 });
});
const snapshot = {
  period: 'month', periodLabel: 'Bulanan — 2026-07',
  dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-31',
  scope: { type: 'all', label: 'Semua Unit & Karyawan' },
  detailRecords, employeeRows: [],
};
const vm = buildOvertimeReportModel(snapshot, { generatedBy: 'Admin', appVersion: '1.26.2', generatedAt: Date.now() });
check('fixture reproduces the reported Rp1.900.000 grand total', vm.detailGrandTotal === 'Rp1.900.000');

const doc = tpl.build(vm);

console.log('[FIX 18 — Grand Total fill: valid color, never black, never an "error" tint]');
check('styles.totalRow.fillColor is a valid CSS hex (has the "#" prefix pdfmake requires)', HEX_COLOR.test(doc.styles.totalRow.fillColor));
check('styles.totalAmount.fillColor is a valid CSS hex', HEX_COLOR.test(doc.styles.totalAmount.fillColor));
check('total fill is NOT solid black (the exact regression this guards)', doc.styles.totalRow.fillColor.toLowerCase() !== '#000000' && doc.styles.totalAmount.fillColor.toLowerCase() !== '#000000');
check('total fill matches the table HEADER\'s own neutral fill — same design language, not a distinct accent/alert color', doc.styles.totalRow.fillColor === doc.styles.th.fillColor && doc.styles.totalAmount.fillColor === doc.styles.th.fillColor);
check('totalRow label uses an explicit, readable dark ink color', doc.styles.totalRow.color === '#1A1917');
check('totalAmount stays accent-maroon (prominent, not black, not washed out)', doc.styles.totalAmount.color === '#A8292F');
check('totalAmount is bigger than the plain cell style (prominence without a colored background)', doc.styles.totalAmount.fontSize > doc.styles.cell.fontSize);

console.log('[FIX 18 — Grand Total nominal never wraps to two lines]');
check('styles.totalAmount declares noWrap:true', doc.styles.totalAmount.noWrap === true);
const detailTable = doc.content.find(n => n.table && n.table.widths && n.table.widths.length === 6);
check('detail table Total column widened to fit "Rp1.900.000" without wrapping (>= 90pt, was 65)', detailTable.table.widths[5] >= 90);
const grandTotalCell = detailTable.table.body[detailTable.table.body.length - 1][5];
check('grand total cell text is the single unwrapped figure', grandTotalCell.text === vm.detailGrandTotal);
check('grand total cell carries noWrap:true directly (belt-and-suspenders on top of the style)', grandTotalCell.noWrap === true);

console.log('[FIX 15 — metadata is a real page footer, not content]');
check('doc.footer is a function (real pdfmake page footer)', typeof doc.footer === 'function');
const contentStr = JSON.stringify(doc.content);
check('content array contains no leftover Filter Snapshot / Metadata Laporan block', !contentStr.includes('Filter Snapshot') && !contentStr.includes('Metadata Laporan'));

console.log('\n' + '─'.repeat(50));
console.log(`Overtime Template: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
