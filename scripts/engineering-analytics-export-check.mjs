/* engineering-analytics-export-check.mjs — validates the Engineering Analytics
   export PURE builders (v1.20.2): the pdfmake docDefinition + xlsx sheets project
   the provider snapshot faithfully, reusing the shared export libraries (no new
   exporter type). Run: node scripts/engineering-analytics-export-check.mjs */

import {
  buildEngineeringAnalyticsDocDefinition, buildEngineeringAnalyticsSheets,
} from '../js/exports/analytics/engineering-analytics-export.js';
import { buildDevSeedAssignments } from '../js/engineering/providers/dev-seed-data.js';
import { resetEngineeringStore, hydrateAssignments, listAssignments } from '../js/engineering/stores/engineering-store.js';
import { buildEngineeringAnalytics } from '../js/engineering/analytics/engineering-analytics.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

resetEngineeringStore();
hydrateAssignments(buildDevSeedAssignments());
const snapshot = buildEngineeringAnalytics(listAssignments(), { now: Date.now() });

console.log('\n[pdf docDefinition]');
const doc = buildEngineeringAnalyticsDocDefinition(snapshot, { generatedBy: 'Tester', periodLabel: 'Semua riwayat' });
check('has a content array', Array.isArray(doc.content) && doc.content.length > 0);
const flat = JSON.stringify(doc);
check('titled Engineering Analytics', flat.includes('Engineering Analytics'));
check('has a Ringkasan (KPI) table', flat.includes('Ringkasan') && flat.includes('Total Penugasan'));
check('has category + building + workload sections', flat.includes('Task per Kategori') && flat.includes('Task per Gedung') && flat.includes('Beban Engineering'));
check('footer is a function (page numbers)', typeof doc.footer === 'function');

console.log('\n[xlsx sheets]');
const sheets = buildEngineeringAnalyticsSheets(snapshot);
check('produces five sheets (incl. per-technician)', sheets.length === 5);
check('includes a Teknisi (per-technician) sheet', sheets.some((s) => s.name === 'Teknisi'));
check('every sheet has a name + aoa with a header row', sheets.every((s) => s.name && Array.isArray(s.aoa) && s.aoa.length >= 1));
check('summary sheet reflects total assignments', (() => {
  const sum = sheets.find((s) => s.name === 'Ringkasan');
  const row = sum.aoa.find((r) => r[0] === 'Total Penugasan');
  return row && row[1] === snapshot.totalAssignments;
})());

console.log('\n[empty snapshot safety]');
const emptyDoc = buildEngineeringAnalyticsDocDefinition({}, {});
check('empty snapshot still builds a valid docDefinition', Array.isArray(emptyDoc.content));
check('empty snapshot still builds sheets', buildEngineeringAnalyticsSheets({}).length === 5);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
