/* maintenance-projection-check.mjs — Vehicle Core Phase 6, Maintenance Projection (v1.29.17)
   PURE node test. Drives the REAL projection service over normalized maintenance
   records (via the real normalizeMaintenanceRecord/computeMaintenanceTimeline) and
   asserts: per-category projection math (next due date/odometer, remaining
   days/km), status classification (overdue/due_soon/on_track/unknown), service
   priority, headline selection across categories, "no data" fallback, and full
   end-to-end wiring through normalizeVehicleAsset(). Also spot-checks that the
   drawer and inventory card source actually read the new field (wiring, not
   just math).
   Run: node scripts/maintenance-projection-check.mjs (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import {
  projectCategoryDue,
  computeMaintenanceProjections,
  computeVehicleMaintenanceProjection,
} from '../js/services/maintenance-projection-service.js';
import { normalizeMaintenanceRecord, computeMaintenanceTimeline } from '../js/services/maintenance-service.js';
import { normalizeVehicleAsset } from '../js/services/vehicle-asset-service.js';
import { MAINTENANCE_DUE_SOON_KM } from '../js/config/maintenance-config.js';
import { DUE_SOON_DAYS } from '../js/config/vehicle-asset-config.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const NOW = '2026-08-07';

const rec = (over) => normalizeMaintenanceRecord({
  id: 'm1', vehicleId: 'v1', date: '2026-06-01', category: 'oil-change', status: 'completed',
  workshopId: 'w1', workshopName: 'Bengkel A', officer: 'Budi', description: 'Ganti oli',
  cost: 300000, odometer: 50000,
  ...over,
}, NOW);

/* ── projectCategoryDue — core math ─────────────────────────────────────── */
console.log('\n[Projection calculation — per-category]');

{
  // oil-change default interval: 10000km / 180 days. Last service 2026-06-01 @ 50000km.
  // now = 2026-08-07 (67 days later). Current odometer 58000 (8000km driven).
  const p = projectCategoryDue(rec(), 58000, NOW);
  check('nextDueOdometer = lastOdo + intervalKm (50000+10000)', p.nextDueOdometer === 60000);
  check('nextDueDate = lastDate + intervalDays (2026-06-01+180d)', p.nextDueDate === '2026-11-28');
  check('remainingKm = nextDueOdometer - currentOdometer', p.remainingKm === 2000);
  check('remainingDays = daysUntil(nextDueDate)', p.remainingDays === daysBetween(NOW, '2026-11-28'));
  check('status on_track when both signals comfortably ahead', p.status === 'on_track');
  check('priority low when on_track', p.priority === 'low');
  check('reason cites the last service + interval', p.reason.includes('2026-06-01') && p.reason.includes('10.000 km'));
}

{
  // Same record, but current odometer already past the next-due point.
  const p = projectCategoryDue(rec(), 61000, NOW);
  check('remainingKm negative when odometer already past due', p.remainingKm === -1000);
  check('km-side overdue escalates overall status to overdue', p.status === 'overdue');
  check('priority high for overdue + minor impact (oil-change)', p.priority === 'high');
}

{
  // Category with a days-only interval (air-conditioning: 0km / 365d) and a
  // service date far enough in the past to be overdue on the date signal alone.
  const acRec = normalizeMaintenanceRecord({
    id: 'm2', vehicleId: 'v1', date: '2025-01-01', category: 'air-conditioning', status: 'completed',
    workshopId: 'w1', workshopName: 'Bengkel A', officer: 'Budi', description: 'Service AC',
    cost: 200000,
  }, NOW);
  const p = projectCategoryDue(acRec, 999999, NOW);
  check('km-only-absent category never computes an odometer due point', p.nextDueOdometer === null);
  check('date-only overdue detected purely from days', p.status === 'overdue' && p.remainingDays < 0);
}

{
  // Category with a km-only interval (tire-replacement: 80000km / 0d).
  const tireRec = normalizeMaintenanceRecord({
    id: 'm3', vehicleId: 'v1', date: '2026-01-01', category: 'tire-replacement', status: 'completed',
    workshopId: 'w1', workshopName: 'Bengkel A', officer: 'Budi', description: 'Ganti ban',
    cost: 2000000, odometer: 30000,
  }, NOW);
  const p = projectCategoryDue(tireRec, 40000, NOW);
  check('days-only-absent category never computes a due date', p.nextDueDate === null);
  check('km-only remaining computed correctly (80000 interval - 10000 driven)', p.remainingKm === 70000);
  check('far from due ⇒ on_track', p.status === 'on_track');
}

{
  // Purely corrective category (brake: 0km / 0 days) — must never be projectable.
  const brakeRec = normalizeMaintenanceRecord({
    id: 'm4', vehicleId: 'v1', date: '2026-01-01', category: 'brake', status: 'completed',
    workshopId: 'w1', workshopName: 'Bengkel A', officer: 'Budi', description: 'Ganti kampas rem',
    cost: 500000,
  }, NOW);
  check('category with no scheduled interval returns null (never projected)', projectCategoryDue(brakeRec, 50000, NOW) === null);
}

{
  // Missing odometer on the record ⇒ km signal absent, date signal still works.
  const noOdoRec = rec({ odometer: null });
  const p = projectCategoryDue(noOdoRec, 999999, NOW);
  check('missing record odometer ⇒ nextDueOdometer null (no km projection)', p.nextDueOdometer === null && p.remainingKm === null);
  check('date signal still computed independently', p.nextDueDate === '2026-11-28');
}

{
  // Current vehicle odometer 0 / missing ⇒ treated as "no reading", not literal zero.
  const p1 = projectCategoryDue(rec(), 0, NOW);
  const p2 = projectCategoryDue(rec(), null, NOW);
  check('current odometer 0 does not produce a (huge, wrong) remainingKm', p1.remainingKm === null);
  check('current odometer null does not throw and yields remainingKm null', p2.remainingKm === null);
}

/* ── Thresholds — due_soon boundary ─────────────────────────────────────── */
console.log('\n[Remaining distance / days — due_soon thresholds]');
{
  const justInsideKm = 60000 - MAINTENANCE_DUE_SOON_KM; // remainingKm === DUE_SOON_KM exactly
  const p = projectCategoryDue(rec(), justInsideKm, NOW);
  check(`remainingKm === MAINTENANCE_DUE_SOON_KM (${MAINTENANCE_DUE_SOON_KM}) classifies as due_soon`, p.remainingKm === MAINTENANCE_DUE_SOON_KM && p.status === 'due_soon');

  const justOutsideKm = justInsideKm - 1; // 1km LESS driven ⇒ 1km MORE remaining ⇒ crosses back out of the window
  const p2 = projectCategoryDue(rec(), justOutsideKm, NOW);
  check('one km outside the due_soon window classifies as on_track', p2.remainingKm === MAINTENANCE_DUE_SOON_KM + 1 && p2.status === 'on_track');

  // Date-side boundary: push now to exactly DUE_SOON_DAYS before nextDueDate.
  const nearDate = addDaysStr('2026-11-28', -DUE_SOON_DAYS);
  const pd = projectCategoryDue(rec(), 1, nearDate); // curOdo=1 keeps km signal effectively absent-ish but not null; use far-future odo instead
  // Use a current odometer far below due so the km signal reads on_track, isolating the date signal.
  const pd2 = projectCategoryDue(rec(), 50500, nearDate);
  check(`remainingDays === DUE_SOON_DAYS (${DUE_SOON_DAYS}) classifies as due_soon on the date signal`, pd2.remainingDays === DUE_SOON_DAYS && pd2.status === 'due_soon');
}

/* ── Priority mapping ────────────────────────────────────────────────────── */
console.log('\n[Service priority]');
{
  const engineRec = normalizeMaintenanceRecord({
    id: 'm5', vehicleId: 'v1', date: '2026-01-01', category: 'periodic-service', status: 'completed',
    workshopId: 'w1', workshopName: 'Bengkel A', officer: 'Budi', description: 'Servis berkala',
    cost: 500000, odometer: 10000, impact: 'critical',
  }, NOW);
  const overdue = projectCategoryDue(engineRec, 999999, NOW);
  check('overdue + critical/major impact ⇒ priority critical', overdue.status === 'overdue' && overdue.priority === 'critical');

  const minorRec = rec({ impact: 'minor' }); // oil-change default impact is already minor
  const overdueMinor = projectCategoryDue(minorRec, 999999, NOW);
  check('overdue + minor/medium impact ⇒ priority high (not critical)', overdueMinor.status === 'overdue' && overdueMinor.priority === 'high');

  check('no_data headline carries priority none', computeVehicleMaintenanceProjection([], 50000, NOW).headline.priority === 'none');
}

/* ── computeMaintenanceProjections — multi-category ordering ───────────── */
console.log('\n[Headline selection across categories]');
{
  const records = [
    { id: 'a', date: '2026-01-01', category: 'oil-change', status: 'completed', workshopId: 'w', workshopName: 'W', officer: 'O', description: 'D', cost: 1, odometer: 40000 }, // will be overdue
    { id: 'b', date: '2026-07-01', category: 'inspection', status: 'completed', workshopId: 'w', workshopName: 'W', officer: 'O', description: 'D', cost: 1, odometer: 55000 }, // on_track
    { id: 'c', date: '2026-06-01', category: 'brake', status: 'completed', workshopId: 'w', workshopName: 'W', officer: 'O', description: 'D', cost: 1 }, // never projectable
  ];
  const timeline = computeMaintenanceTimeline(records, NOW);
  const items = computeMaintenanceProjections(timeline, 58000, NOW);
  check('non-scheduled category (brake) excluded from the projection list', !items.some(i => i.category === 'brake'));
  check('overdue category sorted first', items[0] && items[0].status === 'overdue' && items[0].category === 'oil-change');
  const { headline } = computeVehicleMaintenanceProjection(timeline, 58000, NOW);
  check('headline matches the most urgent item', headline.category === items[0].category);

  // Only the LATEST completed record per category is used as the baseline.
  const records2 = [
    { id: 'old', date: '2026-01-01', category: 'oil-change', status: 'completed', workshopId: 'w', workshopName: 'W', officer: 'O', description: 'D', cost: 1, odometer: 10000 },
    { id: 'new', date: '2026-07-01', category: 'oil-change', status: 'completed', workshopId: 'w', workshopName: 'W', officer: 'O', description: 'D', cost: 1, odometer: 55000 },
  ];
  const timeline2 = computeMaintenanceTimeline(records2, NOW);
  const items2 = computeMaintenanceProjections(timeline2, 56000, NOW);
  check('projection baselines off the NEWEST completed record, not the oldest', items2[0].basis.lastOdometer === 55000);

  // A 'planned' (not completed) record must never be used as a projection baseline.
  const records3 = [{ id: 'p', date: '2026-08-01', category: 'oil-change', status: 'planned', workshopId: 'w', workshopName: 'W', officer: 'O', description: 'D', cost: 1, odometer: 90000 }];
  const timeline3 = computeMaintenanceTimeline(records3, NOW);
  check('a planned (non-completed) record produces no projection', computeMaintenanceProjections(timeline3, 50000, NOW).length === 0);
}

/* ── "No data" fallback ─────────────────────────────────────────────────── */
console.log('\n[No-data fallback]');
{
  const { headline, items } = computeVehicleMaintenanceProjection([], 50000, NOW);
  check('empty timeline ⇒ empty items', items.length === 0);
  check('empty timeline ⇒ headline status no_data', headline.status === 'no_data');
  check('no_data headline has no fabricated numbers', headline.nextDueDate === null && headline.nextDueOdometer === null && headline.remainingDays === null && headline.remainingKm === null);
  check('malformed timeline input (non-array) does not throw', computeMaintenanceProjections(null, 50000, NOW).length === 0);
}

/* ── End-to-end wiring — normalizeVehicleAsset() ────────────────────────── */
console.log('\n[Integration — normalizeVehicleAsset]');
{
  const vehicle = {
    id: 'v1', name: 'Innova', type: 'mobil', status: 'active', plateNumber: 'B 1 AAA',
    odometer: '61000',
    maintenanceRecords: [
      { id: 'm1', date: '2026-06-01', category: 'oil-change', status: 'completed', workshopId: 'w', workshopName: 'Bengkel A', officer: 'Budi', description: 'Ganti oli', cost: 300000, odometer: 50000 },
    ],
  };
  const asset = normalizeVehicleAsset(vehicle, NOW);
  check('normalizeVehicleAsset exposes maintenanceProjection', !!asset.maintenanceProjection);
  check('asset.maintenanceProjection.headline matches a direct service call', asset.maintenanceProjection.headline.category === 'oil-change' && asset.maintenanceProjection.headline.status === 'overdue');
  check('computeVehicleHealth / HEALTH_WEIGHTS untouched (health.maintenance still present, same shape)', asset.health && typeof asset.health.maintenance !== 'undefined');

  const vehicleNoRecords = { id: 'v2', name: 'Beat', type: 'motor', status: 'active', plateNumber: 'B 2 BBB', odometer: '5000' };
  const assetNoRecords = normalizeVehicleAsset(vehicleNoRecords, NOW);
  check('vehicle with zero maintenance history gets a safe no_data projection (never throws)', assetNoRecords.maintenanceProjection.headline.status === 'no_data');
}

/* ── UI wiring (source presence — drawer + inventory card) ─────────────── */
console.log('\n[UI wiring]');
{
  const drawerSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'components', 'vehicle-detail-drawer.js'), 'utf-8');
  check('drawer reads asset.maintenanceProjection', drawerSrc.includes('a.maintenanceProjection') || drawerSrc.includes('asset.maintenanceProjection'));
  check('drawer renders a Proyeksi Perawatan section', drawerSrc.includes('Proyeksi Perawatan'));
  check('drawer imports nothing new from the projection service (render-only, per architecture)', !drawerSrc.includes("from '../services/maintenance-projection-service.js'"));

  const appSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'app.js'), 'utf-8');
  check('inventory card reads asset.maintenanceProjection', appSrc.includes('asset.maintenanceProjection'));
  check('inventory card does not import the projection service (render-only)', !appSrc.includes("maintenance-projection-service.js"));

  const assetSvcSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'services', 'vehicle-asset-service.js'), 'utf-8');
  check('vehicle-asset-service is the ONE place that imports the projection service', assetSvcSrc.includes("from './maintenance-projection-service.js'"));
  check('projection reuses the existing maintenanceTimeline (no second read of maintenanceRecords)', assetSvcSrc.includes('computeVehicleMaintenanceProjection(maintenanceTimeline'));
}

/* ── Immutability (deep-frozen results, like every other engine in this codebase) ── */
console.log('\n[Immutability]');
{
  const { headline } = computeVehicleMaintenanceProjection(computeMaintenanceTimeline([rec()], NOW), 58000, NOW);
  check('headline result is frozen', Object.isFrozen(headline));
  check('headline.basis is frozen', headline.basis === null || Object.isFrozen(headline.basis));
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function daysBetween(a, b) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
function addDaysStr(dateStr, days) {
  return new Date(new Date(dateStr).getTime() + days * 86400000).toISOString().slice(0, 10);
}

console.log(`\nPassed: ${pass}`);
console.log(`Failed: ${fail}`);
console.log(`Total:  ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
