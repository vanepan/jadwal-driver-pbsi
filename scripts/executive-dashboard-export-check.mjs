/* executive-dashboard-export-check.mjs — Executive Analytics Report (v1.18.8)
   PURE node check for the export builders. Assembles the SAME aggregate model
   the dashboard builds (real Operational Health Score + Driver Wellness + Fleet
   engines, plus documented-shape Dispatch / Recommendation summaries) and pins
   the pdfmake docDefinition + the one-worksheet-per-module workbook to it —
   proving the report reuses the dashboard projection and adds no new maths.
   Run: node scripts/executive-dashboard-export-check.mjs (exit 0 = pass) */

import { computeExecutiveAnalytics } from '../js/analytics/executive-analytics.js';
import { computeDriverWellnessModel } from '../js/services/driver-wellness-service.js';
import { computeFleetAssetModel } from '../js/services/vehicle-asset-service.js';
import {
  buildExecutiveReportDocDefinition,
  buildExecutiveReportSheets,
} from '../js/exports/analytics/executive-dashboard-export.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const NOW = '2026-06-25';

const driverModel = { kpis: {
  total: 120, tripsWithoutVehicle: 20, tripsWithVehicle: 100,
  activeDrivers: 8, driversWithTrips: 6, activeVehicles: 5, vehiclesWithTrips: 4,
  compRate: 88, workloadTop: { name: 'Aria', score: 82 }, workloadLow: { name: 'Budi', score: 40 },
  workloadAvgScore: 60, totalActualHours: 200, totalOvertimeHours: 20, weekendAssignments: 5,
} };
const exec = computeExecutiveAnalytics({ driverModel, pettyModel: null, meta: { periodLabel: '30 Hari' } });

const drivers = [{ id: 'd1', name: 'Igo' }, { id: 'd2', name: 'Dedi' }, { id: 'd3', name: 'Aria' }, { id: 'd4', name: 'Grace' }];
const assignments = [];
for (const day of ['2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25']) {
  assignments.push({ driver: 'Igo', vehicle: 'Innova', date: day, startTime: '07:00', endTime: '19:00', status: 'assigned', distanceTravelled: 150 });
}
const wellness = computeDriverWellnessModel({ drivers, assignments, now: NOW, window: '30d' });

const fleet = computeFleetAssetModel({ vehicles: [
  { id: 'v1', name: 'Innova', type: 'mobil', status: 'active' },
  { id: 'v2', name: 'Avanza', type: 'mobil', status: 'active' },
  { id: 'v3', name: 'HiAce', type: 'mobil', status: 'maintenance' },
  { id: 'v4', name: 'Ambulance 1', type: 'ambulance', status: 'active' },
], now: NOW });

const dispatch = { kpi: { dispatchAccuracy: 82, overrideRate: 12, recommendationAcceptance: 82, avgDispatchScore: 78, sampleSize: 40 } };
const recommendation = {
  kpi: { acceptanceRate: 84, recommendationAccuracy: 84, overrideRate: 16, avgDispatchScore: 80, sampleSize: 40 },
  driverAccuracy: { rows: [{ name: 'Aria', recommendations: 12, accepted: 11, accuracyPct: 92 }] },
};

const model = { generatedAt: new Date(NOW).toISOString(), exec, dispatch, recommendation, wellness, fleet, petty: null };
const meta = { appVersion: '1.18.8', generatedBy: 'Tester', periodLabel: 'Kondisi terkini' };

console.log('\n[PDF docDefinition]');
const doc = buildExecutiveReportDocDefinition(model, meta);
const texts = JSON.stringify(doc.content);
check('docDefinition is A4 with content', doc.pageSize === 'A4' && Array.isArray(doc.content) && doc.content.length > 0);
check('§ Ringkasan Eksekutif (Executive Summary)', texts.includes('Ringkasan Eksekutif'));
check('§ Status Operasional Hari Ini (Operational Status)', texts.includes('Status Operasional Hari Ini'));
check('§ Indikator Utama (Executive KPIs)', texts.includes('Indikator Utama'));
check('§ Sorotan Hari Ini (Highlights)', texts.includes('Sorotan Hari Ini'));
check('§ Ringkasan per Modul (Module summaries)', texts.includes('Ringkasan per Modul'));
check('every module title present in PDF', ['Analytics Driver', 'Dispatch Analytics', 'Recommendation Accuracy', 'Driver Wellness', 'Vehicle Analytics', 'Petty Cash Analytics'].every((t) => texts.includes(t)));
check('operational status verdict reused from engine score', texts.includes(exec.score.label));
check('title + version in footer', doc.info.title === 'Executive Analytics' && typeof doc.footer === 'function');

console.log('\n[Excel workbook — one worksheet per module]');
const sheets = buildExecutiveReportSheets(model);
const names = sheets.map((s) => s.name);
check('lead summary sheet present', names[0] === 'Ringkasan Eksekutif');
check('one worksheet per module (6 module sheets)',
  ['Analytics Driver', 'Dispatch Analytics', 'Recommendation Accuracy', 'Driver Wellness', 'Vehicle Analytics', 'Petty Cash Analytics'].every((n) => names.includes(n)));
check('total sheets = summary + 6 modules', sheets.length === 7);
check('summary sheet carries KPI rows', sheets[0].aoa.some((r) => r[0] === 'Skor Operasional'));
check('summary sheet carries the status verdict', sheets[0].aoa.some((r) => r[0] === 'Status Operasional' && r[1] === exec.score.label));
check('wellness sheet reuses the wellness summary (driver count)',
  sheets.find((s) => s.name === 'Driver Wellness').aoa.some((r) => r[0] === 'Driver Dipantau' && Number(r[1]) === wellness.summary.driverCount));
check('vehicle sheet reuses the fleet dashboard (active count)',
  sheets.find((s) => s.name === 'Vehicle Analytics').aoa.some((r) => r[0] === 'Aktif' && Number(r[1]) === fleet.dashboard.active));

console.log('\n[safety]');
const empty = {};
check('builders safe on empty model', buildExecutiveReportSheets(empty).length === 7 && buildExecutiveReportDocDefinition(empty).content.length >= 6);
check('builders safe on null model', buildExecutiveReportSheets(null).length === 7 && !!buildExecutiveReportDocDefinition(null));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
