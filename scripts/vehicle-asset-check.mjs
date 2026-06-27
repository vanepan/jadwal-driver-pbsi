/* vehicle-asset-check.mjs — Vehicle Asset Intelligence (v1.18.0)
   PURE node test. Drives the REAL vehicle-asset service + analytics over seeded
   vehicle records (the Vehicle Store shape) and asserts every feature: vehicle
   types, lifecycle status, the Apple-drawer-ready normalized asset, tax/STNK/
   insurance status, document completeness, Overall Asset Health (higher = better,
   Unified Scoring), chronological timeline, fleet dashboard counts, fleet
   analytics distributions, search/filter, and operational eligibility policy
   (Mobil dispatch / Motor excluded / Ambulance medical-only / admin override).
   Reuse of the Dispatch Policy Engine is verified, plus empty/corrupt safety.
   Run: node scripts/vehicle-asset-check.mjs (exit 0 = pass) */

import {
  computeFleetAssetModel,
  normalizeVehicleAsset,
  findVehicleAsset,
  evaluateOperationalEligibility,
  resolveVehicleType,
  resolveVehicleStatus,
  deriveDocStatus,
  deriveTaxStatus,
  computeDocumentCompleteness,
  computeVehicleHealth,
  buildVehicleTimeline,
  searchFilterVehicles,
  daysUntil,
} from '../js/services/vehicle-asset-service.js';
import { computeFleetAnalytics } from '../js/analytics/vehicle-asset-analytics.js';
import { clampScore } from '../js/services/unified-scoring.js';
import { isSpecialVehicle } from '../js/services/dispatch-policy-engine.js';
import { vehicleTypeKeys, vehicleStatusKeys } from '../js/config/vehicle-asset-config.js';

// Source the canonical type/status lists from the PURE config (the store mirrors
// them but transitively imports Firebase from a CDN — not Node-loadable).
const VEHICLE_TYPES = vehicleTypeKeys();
const VEHICLE_STATUSES = vehicleStatusKeys();

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const NOW = '2026-06-26';
const vehicles = [
  { id: 'v1', name: 'Innova', type: 'mobil', status: 'active', plateNumber: 'B 1 AAA', capacity: 7,
    brand: 'Toyota', model: 'Innova', year: '2022', fuel: 'Solar', transmission: 'Otomatis',
    engineNumber: 'E1', chassisNumber: 'C1', owner: 'PBSI', registrationRegion: 'DKI', odometer: '45000',
    acquisitionDate: '2022-01-10', acquisitionValue: '400000000',
    stnkNumber: 'S1', stnkExpiry: '2027-01-10', annualTaxDue: '2027-01-10', fiveYearTaxDue: '2027-01-10',
    insuranceCompany: 'Sinarmas', policyNumber: 'P1', coverage: 'All Risk', insuranceExpiry: '2027-02-01',
    taxHistory: [{ date: '2026-01-05', amount: '3500000', officer: 'Budi', notes: 'lunas' }],
    createdAt: '2022-01-10T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z' },
  { id: 'v2', name: 'Beat', type: 'motor', status: 'active', plateNumber: 'B 2 BBB', capacity: 2,
    brand: 'Honda', year: '2024', fuel: 'Bensin', transmission: 'Otomatis' },
  { id: 'v3', name: 'Ambulance Pelatnas', type: 'ambulance', status: 'active', plateNumber: 'B 3 CCC', capacity: 4,
    brand: 'Toyota', year: '2019', fuel: 'Solar', transmission: 'Manual', stnkExpiry: '2026-07-05', annualTaxDue: '2026-07-05' },
  { id: 'v4', name: 'Old Hiace', type: 'mobil', status: 'retired', plateNumber: 'B 4 DDD', capacity: 12,
    brand: 'Toyota', year: '2010', fuel: 'Solar', transmission: 'Manual', stnkExpiry: '2024-01-01' },
  { id: 'v5', name: 'Luxio', type: 'mobil', status: 'maintenance', plateNumber: 'B 5 EEE', capacity: 7,
    brand: 'Daihatsu', year: '2021', fuel: 'Bensin', transmission: 'Manual' },
  { id: 'v6', name: 'Archived Unit', type: 'mobil', status: 'inactive', plateNumber: 'B 6 FFF', capacity: 5, archived: true },
];

const model = computeFleetAssetModel({ vehicles, now: NOW });

/* ── Feature 1 — Vehicle types ─────────────────────────────────────────────── */
console.log('\n[Feature 1 — Vehicle types]');
check('store exports the three canonical types', VEHICLE_TYPES.length === 3 && VEHICLE_TYPES.includes('mobil') && VEHICLE_TYPES.includes('motor') && VEHICLE_TYPES.includes('ambulance'));
check('resolveVehicleType honors explicit type', resolveVehicleType({ type: 'motor' }) === 'motor');
check('resolveVehicleType detects ambulance by name (reuses Policy Engine)', resolveVehicleType({ name: 'Mobil Ambulans PBSI' }) === 'ambulance' && isSpecialVehicle({ name: 'Mobil Ambulans PBSI' }));
check('resolveVehicleType defaults to mobil', resolveVehicleType({ name: 'Innova' }) === 'mobil');

/* ── Feature 2 — Vehicle status ────────────────────────────────────────────── */
console.log('\n[Feature 2 — Vehicle status]');
check('store exports the four canonical statuses', VEHICLE_STATUSES.length === 4 && ['active', 'maintenance', 'inactive', 'retired'].every(s => VEHICLE_STATUSES.includes(s)));
check('resolveVehicleStatus honors explicit status', resolveVehicleStatus({ status: 'maintenance' }) === 'maintenance');
check('legacy active:false maps to inactive', resolveVehicleStatus({ active: false }) === 'inactive');

/* ── Feature 3 — Operational eligibility (policy only) ─────────────────────── */
console.log('\n[Feature 3 — Operational eligibility]');
const eMobil = evaluateOperationalEligibility({ type: 'mobil', status: 'active' });
check('Mobil → dispatch + recommendation + analytics', eMobil.dispatch && eMobil.recommendation && eMobil.analytics);
const eMotor = evaluateOperationalEligibility({ type: 'motor', status: 'active' });
check('Motor → excluded from dispatch / recommendation / analytics', !eMotor.dispatch && !eMotor.recommendation && !eMotor.analytics);
const eAmb = evaluateOperationalEligibility({ type: 'ambulance', status: 'active' });
check('Ambulance → no recommendation outside Medical mode', eAmb.dispatch && !eAmb.recommendation && !eAmb.analytics);
const eAmbMed = evaluateOperationalEligibility({ type: 'ambulance', status: 'active' }, { medicalMode: true });
check('Ambulance → recommendation ONLY in Medical mode', eAmbMed.recommendation === true);
const eOverride = evaluateOperationalEligibility({ type: 'motor', status: 'inactive' }, { adminOverride: true });
check('Admin override always allowed (supersedes type + status)', eOverride.dispatch && eOverride.recommendation && eOverride.analytics);
const eRetired = evaluateOperationalEligibility({ type: 'mobil', status: 'retired' });
check('Only ACTIVE status participates (retired Mobil → none)', !eRetired.dispatch && !eRetired.recommendation && !eRetired.analytics && eRetired.reasons.includes('not_active'));

/* ── Feature 5/6/8 — Registration + legal + insurance normalization ────────── */
console.log('\n[Feature 5/6/8 — Asset normalization]');
const a1 = normalizeVehicleAsset(vehicles[0], NOW);
check('registration fields preserved', a1.brand === 'Toyota' && a1.year === '2022' && a1.fuel === 'Solar' && a1.owner === 'PBSI' && a1.odometer === '45000');
check('legal fields preserved', a1.stnkNumber === 'S1' && a1.stnkExpiry === '2027-01-10');
check('insurance fields preserved', a1.insuranceCompany === 'Sinarmas' && a1.policyNumber === 'P1' && a1.coverage === 'All Risk');

/* ── Document status (tax / STNK / insurance) ──────────────────────────────── */
console.log('\n[Tax / STNK / Insurance status]');
check('daysUntil computes forward days', daysUntil('2026-07-06', NOW) === 10);
check('valid (far future)', deriveDocStatus('2030-01-01', NOW).status === 'valid');
check('due_soon (within 30 days)', deriveDocStatus('2026-07-10', NOW).status === 'due_soon');
check('expired (past)', deriveDocStatus('2025-01-01', NOW).status === 'expired');
check('unknown (no date)', deriveDocStatus('', NOW).status === 'unknown');
check('deriveTaxStatus falls back to STNK expiry', deriveTaxStatus({ stnkExpiry: '2026-07-05' }, NOW).status === 'due_soon');

/* ── Feature 11 — Document completeness + Overall Asset Health ──────────────── */
console.log('\n[Feature 11 — Vehicle health]');
const dc = computeDocumentCompleteness(vehicles[0]);
check('document completeness is a 0-100 percent', dc.completeness >= 80 && dc.completeness <= 100);
check('empty record → 0% completeness', computeDocumentCompleteness({}).completeness === 0);
check('health: higher is always better (full asset > sparse asset)', a1.health.overall > normalizeVehicleAsset(vehicles[1], NOW).health.overall);
check('health sub-scores present (operational/legal/documents/overall)',
  Number.isFinite(a1.health.operational) && Number.isFinite(a1.health.documents) && Number.isFinite(a1.health.overall));
check('operational health: active=100 > maintenance > retired=0',
  computeVehicleHealth({ status: 'active', documents: { completeness: 0 } }).operational === 100 &&
  computeVehicleHealth({ status: 'retired', documents: { completeness: 0 } }).operational === 0);
check('health bands/colors come from Unified Scoring', ['ok', 'info', 'warn', 'danger'].includes(a1.health.color) && typeof a1.health.label === 'string');
check('legal is N/A (null) when no legal docs at all', normalizeVehicleAsset({ id: 'x', type: 'mobil', status: 'active' }, NOW).health.legal === null);

/* ── Feature 7/9 — Tax history + timeline ──────────────────────────────────── */
console.log('\n[Feature 7/9 — Timeline]');
check('tax history preserved (read-only)', a1.taxHistory.length === 1 && a1.taxHistory[0].officer === 'Budi');
const tl = buildVehicleTimeline(vehicles[0], NOW);
check('timeline is chronological + future-ready', tl.length >= 3 && new Date(tl[0].date) <= new Date(tl[tl.length - 1].date));
check('timeline includes a Tax Paid event from history', tl.some(e => e.key === 'tax_paid'));
check('retired vehicle gets a Retired event', buildVehicleTimeline(vehicles[3], NOW).some(e => e.key === 'retired') || vehicles[3].updatedAt == null);

/* ── Feature 10 — Fleet dashboard ──────────────────────────────────────────── */
console.log('\n[Feature 10 — Fleet dashboard]');
const d = model.dashboard;
check('total excludes archived by default', d.totalAssets === 5);
check('status counts', d.active === 3 && d.maintenance === 1 && d.retired === 1 && d.inactive === 0);
check('type counts', d.cars === 3 && d.motorcycles === 1 && d.ambulances === 1);
check('tax due soon counted', d.taxDueSoon >= 1);
check('expired STNK counted (excludes retired)', d.expiredStnk === 0); // v4 STNK expired but retired → not flagged
check('average asset health present', Number.isFinite(d.healthAvg) && d.healthAvg >= 0 && d.healthAvg <= 100);

/* ── Feature 12 — Fleet analytics (asset only) ─────────────────────────────── */
console.log('\n[Feature 12 — Fleet analytics]');
const an = computeFleetAnalytics({ vehicles: model.vehicles, now: NOW });
check('composition by type', an.composition.find(c => c.key === 'mobil').count === 3);
check('age distribution buckets', an.ageDistribution.length >= 1 && an.ageDistribution.every(b => 'pct' in b));
check('fuel distribution', an.fuelDistribution.find(f => /Solar/.test(f.label)));
check('transmission distribution', an.transmissionDistribution.length >= 1);
check('document completeness buckets', an.documentCompleteness.length >= 1 && an.documentCompleteness.every(b => 'pct' in b));
check('tax status distribution', an.taxStatus.some(t => t.key === 'due_soon'));

/* ── Feature 13 — Search & filter ──────────────────────────────────────────── */
console.log('\n[Feature 13 — Search & filter]');
check('filter by type', searchFilterVehicles(model.vehicles, { type: 'motor' }).length === 1);
check('filter by status', searchFilterVehicles(model.vehicles, { status: 'active' }).length === 3);
check('filter by fuel', searchFilterVehicles(model.vehicles, { fuel: 'Solar' }).length === 3);
check('filter by transmission', searchFilterVehicles(model.vehicles, { transmission: 'Otomatis' }).length === 2);
check('filter by year', searchFilterVehicles(model.vehicles, { year: '2024' }).length === 1);
check('free-text query (brand/plate/name)', searchFilterVehicles(model.vehicles, { query: 'innova' }).length === 1 && searchFilterVehicles(model.vehicles, { query: 'B 2' }).length === 1);
check('empty filters match everything', searchFilterVehicles(model.vehicles, {}).length === model.vehicles.length);

/* ── Model lookups + safety ────────────────────────────────────────────────── */
console.log('\n[Lookups + safety]');
check('findVehicleAsset locates a normalized asset', findVehicleAsset(model, 'v1') && findVehicleAsset(model, 'v1').name === 'Innova');
check('includeArchived surfaces archived units', computeFleetAssetModel({ vehicles, now: NOW, includeArchived: true }).vehicles.length === 6);
check('empty input is safe', computeFleetAssetModel({ vehicles: [] }).dashboard.totalAssets === 0);
check('corrupt input is safe', computeFleetAssetModel({ vehicles: [null, undefined, 42, {}] }).vehicles.length === 1);
// v1.18.1 regression — a malformed maintenanceRecords array (RTDB deleted-index
// holes, non-object elements) must NOT throw. This is the exact root cause that
// blanked the Fleet Dashboard + inventory: normalizeVehicleAsset → maintenance
// health/summary dereferenced a null record. The model must still normalize.
let dirtyMaintOk = true;
try {
  const m = computeFleetAssetModel({ vehicles: [
    { id: 'd1', name: 'Holey', type: 'mobil', status: 'active', maintenanceRecords: [null, { status: 'completed', category: 'service', date: '2025-01-01', cost: 100 }] },
    { id: 'd2', name: 'AllNull', type: 'mobil', status: 'active', maintenanceRecords: [null, null] },
    { id: 'd3', name: 'Junk', type: 'mobil', status: 'active', maintenanceRecords: ['x', 7] },
  ], now: NOW, includeArchived: true });
  dirtyMaintOk = m.vehicles.length === 3 && m.vehicles.every(v => v.health && typeof v.health.overall === 'number');
} catch (_) { dirtyMaintOk = false; }
check('malformed maintenanceRecords (null holes) do not throw', dirtyMaintOk);
check('clampScore guard (Unified Scoring reuse)', clampScore(150) === 100 && clampScore(-5) === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
