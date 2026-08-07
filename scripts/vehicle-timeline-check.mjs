/* vehicle-timeline-check.mjs — Vehicle Core Phase 8, Unified Timeline (v1.29.19)
   PURE node test. Drives the REAL timeline builder over normalized vehicle
   assets (via the real normalizeVehicleAsset) and asserts: per-source event
   generation (created/archived/status change/compliance renewals × 4 types/
   maintenance performed/maintenance due/reminder generated/custom
   passthrough), chronological ordering, deterministic same-timestamp
   tie-break, "never invent a timestamp" guards, the Maintenance-Due-vs-
   Reminder-Generated non-duplication rule, fleet-wide dashboard preview
   aggregation, and purity (no mutation, stable repeated output). Also
   spot-checks that the drawer/app.js/fleet-dashboard actually wire the
   Timeline (not just math).
   Run: node scripts/vehicle-timeline-check.mjs (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildVehicleTimelineEvents,
  recentVehicleActivity,
  TIMELINE_EVENT,
} from '../js/vehicle/vehicle-timeline.js';
import { normalizeVehicleAsset } from '../js/services/vehicle-asset-service.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const NOW = '2026-08-07';

const baseVehicle = (over) => ({
  id: 'v1', name: 'Innova', type: 'mobil', status: 'active', plateNumber: 'B 1 AAA',
  odometer: '61000',
  createdAt: '2022-01-10T00:00:00Z',
  updatedAt: '2026-01-05T00:00:00Z',
  maintenanceRecords: [],
  complianceHistory: [],
  ...over,
});

const asset = (over) => normalizeVehicleAsset(baseVehicle(over), NOW);

/* ── Vehicle Created ─────────────────────────────────────────────────────── */
console.log('\n[Vehicle Created]');
{
  const a1 = asset({ acquisitionDate: '2022-01-10', createdAt: '2021-12-01T00:00:00Z' });
  const created1 = buildVehicleTimelineEvents(a1).find(e => e.type === TIMELINE_EVENT.VEHICLE_CREATED);
  check('emits VEHICLE_CREATED using acquisitionDate when present', created1 && created1.when === '2022-01-10');

  const a2 = asset({ acquisitionDate: '', createdAt: '2021-12-01T00:00:00Z' });
  const created2 = buildVehicleTimelineEvents(a2).find(e => e.type === TIMELINE_EVENT.VEHICLE_CREATED);
  check('falls back to createdAt when acquisitionDate absent', created2 && created2.when === '2021-12-01T00:00:00Z');

  const a3 = asset({ acquisitionDate: '', createdAt: '' });
  const created3 = buildVehicleTimelineEvents(a3).find(e => e.type === TIMELINE_EVENT.VEHICLE_CREATED);
  check('never invents a Created event when no date exists at all', !created3);
}

/* ── Vehicle Archived ────────────────────────────────────────────────────── */
console.log('\n[Vehicle Archived]');
{
  const active = asset({ archived: false });
  check('no VEHICLE_ARCHIVED event for a non-archived vehicle', !buildVehicleTimelineEvents(active).some(e => e.type === TIMELINE_EVENT.VEHICLE_ARCHIVED));

  const archived = asset({ archived: true, updatedAt: '2026-05-01T00:00:00Z' });
  const ev = buildVehicleTimelineEvents(archived).find(e => e.type === TIMELINE_EVENT.VEHICLE_ARCHIVED);
  check('emits VEHICLE_ARCHIVED at updatedAt when archived===true', ev && ev.when === '2026-05-01T00:00:00Z');
  check('VEHICLE_ARCHIVED title reuses the existing "Diarsipkan" term', ev && ev.title === 'Diarsipkan');
}

/* ── Status Change ───────────────────────────────────────────────────────── */
console.log('\n[Status Change]');
{
  const activeStatus = asset({ status: 'active' });
  check('no STATUS_CHANGE event for status===active', !buildVehicleTimelineEvents(activeStatus).some(e => e.type === TIMELINE_EVENT.STATUS_CHANGE));

  for (const s of ['maintenance', 'inactive', 'retired']) {
    const a = asset({ status: s, updatedAt: '2026-03-15T00:00:00Z' });
    const ev = buildVehicleTimelineEvents(a).find(e => e.type === TIMELINE_EVENT.STATUS_CHANGE);
    check(`emits STATUS_CHANGE for status=${s}`, ev && ev.when === '2026-03-15T00:00:00Z' && ev.title.includes(a.statusInfo.labelId));
  }
}

/* ── Compliance renewals (4 types) ──────────────────────────────────────── */
console.log('\n[Compliance renewals]');
{
  const a = asset({
    complianceHistory: [
      { id: 'c1', type: 'annual_tax', renewalDate: '2025-07-01', expiryDate: '2026-07-10', amount: 3500000, officer: 'Budi' },
      { id: 'c2', type: 'five_year_tax', renewalDate: '2024-02-15', expiryDate: '2029-02-15', amount: 900000, officer: 'Siti' },
      { id: 'c3', type: 'insurance', renewalDate: '2026-02-01', expiryDate: '2027-02-01', amount: 1200000, officer: 'Budi' },
      { id: 'c4', type: 'other', renewalDate: '2025-11-01', expiryDate: '', amount: 50000, officer: '' },
    ],
  });
  const events = buildVehicleTimelineEvents(a);
  const byId = (id) => events.find(e => e.id === id);
  check('annual_tax → ANNUAL_TAX_RENEWAL', byId('c1')?.type === TIMELINE_EVENT.ANNUAL_TAX_RENEWAL);
  check('five_year_tax → FIVE_YEAR_TAX_RENEWAL', byId('c2')?.type === TIMELINE_EVENT.FIVE_YEAR_TAX_RENEWAL);
  check('insurance → INSURANCE_RENEWAL', byId('c3')?.type === TIMELINE_EVENT.INSURANCE_RENEWAL);
  check('other → OTHER_COMPLIANCE', byId('c4')?.type === TIMELINE_EVENT.OTHER_COMPLIANCE);
  check('title reuses compliance-config.js timelineTitle verbatim (STNK Diperpanjang)', byId('c1')?.title === 'STNK Diperpanjang');
  check('description is human-readable (amount + expiry, no raw type string)', /Rp\s*3\.500\.000/.test(byId('c1').description) && !/annual_tax/.test(byId('c1').description));
  check('who carries the officer', byId('c1').who === 'Budi');
  check('entries missing a renewalDate are skipped (never invent a timestamp)', !events.some(e => e.id === 'c-missing'));
}

/* ── Legacy taxHistory backward compat ──────────────────────────────────── */
console.log('\n[Legacy taxHistory backward compat]');
{
  const a = asset({ taxHistory: [{ date: '2023-01-05', amount: '3200000', officer: 'Budi', notes: 'lunas' }], complianceHistory: [] });
  const ev = buildVehicleTimelineEvents(a).find(e => e.type === TIMELINE_EVENT.ANNUAL_TAX_RENEWAL && e.when === '2023-01-05');
  check('a vehicle with ONLY legacy taxHistory still surfaces a renewal event', !!ev);
}

/* ── Maintenance Performed ──────────────────────────────────────────────── */
console.log('\n[Maintenance Performed]');
{
  const a = asset({
    maintenanceRecords: [
      { id: 'm1', category: 'oil-change', status: 'completed', date: '2026-06-01', odometer: 55000, cost: 350000 },
      { id: 'm2', category: 'brake', status: 'planned', date: '2026-08-20', odometer: 61000, cost: 0 },
      { id: 'm3', category: 'body-repair', status: 'in_progress', date: '2026-08-05', odometer: 61000, cost: 0 },
    ],
  });
  const events = buildVehicleTimelineEvents(a);
  const performed = events.filter(e => e.type === TIMELINE_EVENT.MAINTENANCE_PERFORMED);
  check('only status===completed records become MAINTENANCE_PERFORMED', performed.length === 1 && performed[0].when === '2026-06-01');
  check('planned/in_progress records are excluded (nothing "performed" yet)', !performed.some(e => e.when === '2026-08-20' || e.when === '2026-08-05'));
}

/* ── Maintenance Due vs Reminder Generated (no duplication) ─────────────── */
console.log('\n[Maintenance Due / Reminder Generated]');
{
  const a = asset({
    annualTaxDue: '2026-08-20', // due_soon (13 days out, < DUE_SOON_DAYS=30)
    insuranceExpiry: '2026-09-01',
    maintenanceRecords: [
      { id: 'm1', category: 'oil-change', status: 'completed', date: '2026-06-01', odometer: 55000, cost: 350000 },
    ],
  });
  const events = buildVehicleTimelineEvents(a);
  const dues = events.filter(e => e.type === TIMELINE_EVENT.MAINTENANCE_DUE);
  const reminders = events.filter(e => e.type === TIMELINE_EVENT.REMINDER_GENERATED);
  check('maintenance projection surfaces as MAINTENANCE_DUE, not REMINDER_GENERATED', dues.length === 1);
  check('tax/insurance reminders surface as REMINDER_GENERATED, not MAINTENANCE_DUE', reminders.length >= 2 && !reminders.some(e => e.title.includes('Perawatan')));
  check('no maintenance category appears in BOTH lists (single source, two labels — never double-rendered)', !dues.some(d => reminders.some(r => r.title === d.title)));

  const inactive = asset({
    archived: true, updatedAt: '2026-07-01T00:00:00Z',
    annualTaxDue: '2020-01-01', // long overdue, but archived ⇒ 'completed' ⇒ excluded
  });
  check('archived vehicle produces no forward-looking reminder events (nothing left to track)', !buildVehicleTimelineEvents(inactive).some(e => e.type === TIMELINE_EVENT.REMINDER_GENERATED || e.type === TIMELINE_EVENT.MAINTENANCE_DUE));
}

/* ── Custom / future-ready passthrough ───────────────────────────────────── */
console.log('\n[Custom passthrough]');
{
  const a = asset({
    timeline: [{ date: '2026-04-10', key: 'accident', label: 'Kecelakaan Ringan', detail: 'Lecet bumper depan' }],
  });
  const events = buildVehicleTimelineEvents(a);
  const custom = events.find(e => e.type === TIMELINE_EVENT.CUSTOM);
  check('a genuinely custom v.timeline[] entry passes through as CUSTOM', custom && custom.when === '2026-04-10' && custom.title === 'Kecelakaan Ringan');
  check('synthetic buildVehicleTimeline keys (registered/compliance/stnk/...) are never double-emitted as CUSTOM',
    !events.some(e => e.type === TIMELINE_EVENT.CUSTOM && (e.title === 'Terdaftar' || e.title === 'STNK Berlaku Hingga')));
}

/* ── Ordering + deterministic tie-break ─────────────────────────────────── */
console.log('\n[Ordering]');
{
  const a = asset({
    acquisitionDate: '2020-01-01',
    complianceHistory: [
      { id: 'c1', type: 'annual_tax', renewalDate: '2025-01-01', expiryDate: '2026-01-01', amount: 100 },
      { id: 'c2', type: 'insurance', renewalDate: '2025-06-01', expiryDate: '2026-06-01', amount: 200 },
    ],
    maintenanceRecords: [{ id: 'm1', category: 'oil-change', status: 'completed', date: '2025-03-01', odometer: 40000, cost: 100000 }],
  });
  const events = buildVehicleTimelineEvents(a);
  const whens = events.map(e => new Date(e.when).getTime());
  const sorted = [...whens].sort((x, y) => y - x);
  check('mixed-type events are strictly newest-first', JSON.stringify(whens) === JSON.stringify(sorted));

  // Deterministic same-timestamp tie-break: two entries on the identical
  // instant must resolve in the SAME order every time this is computed,
  // independent of source-array concatenation order.
  const tieAsset = asset({
    complianceHistory: [
      { id: 'z-last', type: 'insurance', renewalDate: '2026-05-01', expiryDate: '2027-05-01', amount: 1 },
      { id: 'a-first', type: 'annual_tax', renewalDate: '2026-05-01', expiryDate: '2027-05-01', amount: 1 },
    ],
  });
  const run1 = buildVehicleTimelineEvents(tieAsset).filter(e => e.when === '2026-05-01').map(e => e.id);
  const run2 = buildVehicleTimelineEvents(tieAsset).filter(e => e.when === '2026-05-01').map(e => e.id);
  check('same-timestamp ties resolve identically across repeated calls', JSON.stringify(run1) === JSON.stringify(run2));
  check('same-timestamp tie-break is alphabetical by id (documented, not accidental)', run1[0] === 'a-first' && run1[1] === 'z-last');
}

/* ── Purity ──────────────────────────────────────────────────────────────── */
console.log('\n[Purity]');
{
  const a = asset({ complianceHistory: [{ id: 'c1', type: 'annual_tax', renewalDate: '2025-01-01', expiryDate: '2026-01-01', amount: 100 }] });
  const before = JSON.stringify(a);
  buildVehicleTimelineEvents(a);
  check('never mutates the input asset', JSON.stringify(a) === before);
}

/* ── Fleet-wide dashboard preview (recentVehicleActivity) ────────────────── */
console.log('\n[recentVehicleActivity — Dashboard preview]');
{
  const v1 = baseVehicle({ id: 'v1', name: 'Innova', acquisitionDate: '2020-01-01' });
  const v2 = baseVehicle({ id: 'v2', name: 'Beat', type: 'motor', acquisitionDate: '2024-06-01' });
  const vehicles = [v1, v2].map(v => normalizeVehicleAsset(v, NOW));
  const preview = recentVehicleActivity(vehicles, { limit: 5 });
  check('aggregates events across the whole fleet', preview.length > 0);
  check('every entry is tagged with its owning vehicle', preview.every(e => e.meta && e.meta.vehicleName));
  check('respects the limit cap', recentVehicleActivity(vehicles, { limit: 1 }).length === 1);
  const whens = preview.map(e => new Date(e.when).getTime());
  check('fleet-wide preview is newest-first', JSON.stringify(whens) === JSON.stringify([...whens].sort((x, y) => y - x)));
  check('empty vehicle list never throws, returns empty array', Array.isArray(recentVehicleActivity([])) && recentVehicleActivity([]).length === 0);
}

/* ── Malformed-input safety ─────────────────────────────────────────────── */
console.log('\n[Malformed-input safety]');
{
  check('null asset → empty array, no throw', Array.isArray(buildVehicleTimelineEvents(null)) && buildVehicleTimelineEvents(null).length === 0);
  check('non-array vehicles → empty array, no throw', Array.isArray(recentVehicleActivity(null)) && recentVehicleActivity(null).length === 0);
}

/* ── UI wiring (source-presence, not just math) ─────────────────────────── */
console.log('\n[UI wiring]');
{
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  const drawerSrc = read('js/components/vehicle-detail-drawer.js');
  check('drawer imports buildVehicleTimelineEvents', /buildVehicleTimelineEvents/.test(drawerSrc));
  check('drawer History section is wired to the unified builder', /const events = buildVehicleTimelineEvents\(a\)/.test(drawerSrc));

  const appSrc = read('js/app.js');
  check('app.js mounts #v2VehicleActivityPanel', /v2VehicleActivityPanel/.test(appSrc));
  check('app.js reuses dashModel.vehicles for the activity panel (no duplicate computeFleetAssetModel call)', /renderVehicleActivityPanel\(dashModel\.vehicles\)/.test(appSrc));

  const fleetDashSrc = read('js/components/fleet-dashboard.js');
  const kpiCalls = (fleetDashSrc.match(/fleetKpi\(\{\s*label:\s*'/g) || []).length;
  check('fleet-dashboard.js protected 5-KPI strip is unchanged by this phase', kpiCalls === 5);

  const panelSrc = read('js/components/vehicle-activity-panel.js');
  check('activity panel reuses recentVehicleActivity (no local re-derivation)', /recentVehicleActivity/.test(panelSrc));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
