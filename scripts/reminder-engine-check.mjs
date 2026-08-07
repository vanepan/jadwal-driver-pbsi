/* reminder-engine-check.mjs — Vehicle Core Phase 7, Reminder Engine (v1.29.18)
   PURE node test. Drives the REAL reminder engine over normalized vehicle
   assets (via the real normalizeVehicleAsset/computeFleetAssetModel) and
   asserts: per-type reminder generation (annual tax / five-year tax /
   insurance / maintenance), status mapping (overdue/due_soon/upcoming/
   completed, 'unknown' filtered), priority is READ not recomputed, fleet-wide
   sort ordering, needsAttention/summarizeReminders, and immutability. Also
   spot-checks that the drawer + new reminder panel + app.js actually wire the
   engine (not just math).
   Run: node scripts/reminder-engine-check.mjs (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import {
  computeVehicleReminders,
  computeFleetReminders,
  needsAttention,
  summarizeReminders,
  reminderTypeInfo,
} from '../js/services/reminder-engine.js';
import { normalizeVehicleAsset, computeFleetAssetModel } from '../js/services/vehicle-asset-service.js';
import { DUE_SOON_DAYS } from '../js/config/vehicle-asset-config.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const NOW = '2026-08-07';
function addDaysStr(dateStr, days) {
  return new Date(new Date(dateStr).getTime() + days * 86400000).toISOString().slice(0, 10);
}

const vehicle = (over) => ({
  id: 'v1', name: 'Innova', type: 'mobil', status: 'active', plateNumber: 'B 1 AAA',
  odometer: '61000',
  ...over,
});

/* ── Annual tax reminders ────────────────────────────────────────────────── */
console.log('\n[Annual tax reminders]');
{
  const a = normalizeVehicleAsset(vehicle({ annualTaxDue: addDaysStr(NOW, -5) }), NOW);
  const r = computeVehicleReminders(a);
  const tax = r.find((x) => x.type === 'annual_tax');
  check('overdue annual tax classified overdue', tax.status === 'overdue');
  check('overdue annual tax carries remainingDays from deriveDocStatus verbatim', tax.remainingDays === -5);
  check('overdue annual tax priority critical (no severity axis for compliance)', tax.priority === 'critical');
  check('reminder carries vehicle identity', tax.vehicleId === 'v1' && tax.vehicleName === 'Innova' && tax.plateNumber === 'B 1 AAA');

  const aDS = normalizeVehicleAsset(vehicle({ annualTaxDue: addDaysStr(NOW, DUE_SOON_DAYS) }), NOW);
  const taxDS = computeVehicleReminders(aDS).find((x) => x.type === 'annual_tax');
  check(`due in exactly DUE_SOON_DAYS (${DUE_SOON_DAYS}) reuses vehicle-asset-service's own threshold ⇒ due_soon`, taxDS.status === 'due_soon' && taxDS.priority === 'high');

  const aUp = normalizeVehicleAsset(vehicle({ annualTaxDue: addDaysStr(NOW, DUE_SOON_DAYS + 1) }), NOW);
  const taxUp = computeVehicleReminders(aUp).find((x) => x.type === 'annual_tax');
  check('one day outside the due_soon window ⇒ upcoming', taxUp.status === 'upcoming' && taxUp.priority === 'low');

  const aFallback = normalizeVehicleAsset(vehicle({ annualTaxDue: '', stnkExpiry: addDaysStr(NOW, -1) }), NOW);
  const taxFallback = computeVehicleReminders(aFallback).find((x) => x.type === 'annual_tax');
  check('empty annualTaxDue falls back to stnkExpiry, same as vehicle-asset-service.deriveTaxStatus', taxFallback.status === 'overdue' && taxFallback.dueDate === aFallback.stnkExpiry);

  const aNoDate = normalizeVehicleAsset(vehicle({}), NOW);
  check('no annualTaxDue/stnkExpiry on file ⇒ no annual_tax reminder (unknown filtered)', !computeVehicleReminders(aNoDate).some((x) => x.type === 'annual_tax'));
}

/* ── Five-year tax reminders (independent from annual tax) ─────────────────── */
console.log('\n[Five-year tax reminders]');
{
  const a = normalizeVehicleAsset(vehicle({ annualTaxDue: addDaysStr(NOW, 400), fiveYearTaxDue: addDaysStr(NOW, -10) }), NOW);
  const r = computeVehicleReminders(a);
  const annual = r.find((x) => x.type === 'annual_tax');
  const five = r.find((x) => x.type === 'five_year_tax');
  check('annual tax and five-year tax classified independently', annual.status === 'upcoming' && five.status === 'overdue');
  check('five-year tax dueDate reads asset.fiveYearTaxDue', five.dueDate === a.fiveYearTaxDue);

  const aNoFive = normalizeVehicleAsset(vehicle({ annualTaxDue: addDaysStr(NOW, 10) }), NOW);
  check('no fiveYearTaxDue on file ⇒ no five_year_tax reminder', !computeVehicleReminders(aNoFive).some((x) => x.type === 'five_year_tax'));
}

/* ── Insurance reminders ────────────────────────────────────────────────── */
console.log('\n[Insurance reminders]');
{
  const a = normalizeVehicleAsset(vehicle({ insuranceExpiry: addDaysStr(NOW, 10) }), NOW);
  const ins = computeVehicleReminders(a).find((x) => x.type === 'insurance');
  check('insurance due soon inside the window', ins.status === 'due_soon' && ins.remainingDays === 10);
  check('insurance dueDate reads asset.insuranceExpiry', ins.dueDate === a.insuranceExpiry);
}

/* ── Maintenance reminders — priority/reason READ, never recomputed ────────── */
console.log('\n[Maintenance reminders]');
{
  const raw = vehicle({
    maintenanceRecords: [
      { id: 'm1', date: '2026-01-01', category: 'oil-change', status: 'completed', workshopId: 'w', workshopName: 'W', officer: 'O', description: 'D', cost: 1, odometer: 40000 },
    ],
  });
  const a = normalizeVehicleAsset(raw, NOW);
  const r = computeVehicleReminders(a);
  const maint = r.find((x) => x.type === 'maintenance');
  const projItem = a.maintenanceProjection.items[0];
  check('maintenance reminder generated for a scheduled, overdue category', !!maint && maint.status === 'overdue');
  check('maintenance reminder priority is the SAME reference value as the projection item (read, not recomputed)', maint.priority === projItem.priority);
  check('maintenance reminder reason is the SAME string as the projection item (read, not recomputed)', maint.reason === projItem.reason);
  check('maintenance reminder carries category + categoryLabel', maint.category === projItem.category && maint.categoryLabel === projItem.categoryLabel);
  check('maintenance reminder carries remainingKm from the projection item', maint.remainingKm === projItem.remainingKm);

  const aNoRecords = normalizeVehicleAsset(vehicle({}), NOW);
  check('vehicle with no maintenance history produces zero maintenance reminders', !computeVehicleReminders(aNoRecords).some((x) => x.type === 'maintenance'));
}

/* ── Completed override — archived / retired vehicles ───────────────────── */
console.log('\n[Completed override]');
{
  const aRetired = normalizeVehicleAsset(vehicle({ status: 'retired', annualTaxDue: addDaysStr(NOW, -100) }), NOW);
  const taxRetired = computeVehicleReminders(aRetired).find((x) => x.type === 'annual_tax');
  check('retired vehicle forces status completed regardless of an overdue underlying date', taxRetired.status === 'completed');
  check('completed reminders carry priority none', taxRetired.priority === 'none');

  const aArchived = normalizeVehicleAsset(vehicle({ archived: true, insuranceExpiry: addDaysStr(NOW, -1) }), NOW);
  const insArchived = computeVehicleReminders(aArchived).find((x) => x.type === 'insurance');
  check('archived vehicle also forces status completed', insArchived.status === 'completed');
}

/* ── Fleet-wide aggregation + sort ───────────────────────────────────────── */
console.log('\n[Fleet aggregation]');
{
  const RANK = { overdue: 0, due_soon: 1, upcoming: 2, completed: 3 };
  const raws = [
    vehicle({ id: 'a', annualTaxDue: addDaysStr(NOW, -5) }),                        // overdue
    vehicle({ id: 'b', annualTaxDue: addDaysStr(NOW, 5) }),                         // due_soon
    vehicle({ id: 'c', annualTaxDue: addDaysStr(NOW, 400) }),                       // upcoming
    vehicle({ id: 'd', status: 'retired', annualTaxDue: addDaysStr(NOW, -1) }),     // completed
  ];
  const model = computeFleetAssetModel({ vehicles: raws, now: NOW, includeArchived: true });
  const fleet = computeFleetReminders(model.vehicles);

  check('fleet reminders is a flat array across every vehicle', fleet.length > raws.length); // each vehicle contributes >=1 (tax only here, but >=4)
  check('fleet reminders never regress in urgency rank (overdue…due_soon…upcoming…completed)',
    fleet.every((r, i) => i === 0 || RANK[fleet[i - 1].status] <= RANK[r.status]));
  check('most urgent reminder sorts first', fleet[0].status === 'overdue');

  const na = needsAttention(fleet);
  check('needsAttention returns only overdue/due_soon', na.length > 0 && na.every((r) => r.status === 'overdue' || r.status === 'due_soon'));
  check('needsAttention excludes upcoming/completed', !na.some((r) => r.status === 'upcoming' || r.status === 'completed'));

  const summary = summarizeReminders(fleet, 1);
  check('summary.overdueCount matches a direct filter', summary.overdueCount === fleet.filter((r) => r.status === 'overdue').length);
  check('summary.dueSoonCount matches a direct filter', summary.dueSoonCount === fleet.filter((r) => r.status === 'due_soon').length);
  check('summary.total matches the full fleet list length', summary.total === fleet.length);
  check('summary.top respects the requested cap', summary.top.length <= 1);
  check('summary.top is a subset of needsAttention (dashboard never sees non-actionable items)', summary.top.every((r) => r.status === 'overdue' || r.status === 'due_soon'));
}

/* ── Type registry / malformed input safety ─────────────────────────────── */
console.log('\n[Type registry + safety]');
{
  check('reminderTypeInfo falls back to maintenance for an unknown key', reminderTypeInfo('bogus').label === reminderTypeInfo('maintenance').label);
  check('computeVehicleReminders(null) returns empty array, never throws', computeVehicleReminders(null).length === 0);
  check('computeFleetReminders(null) returns empty array, never throws', computeFleetReminders(null).length === 0);
  check('summarizeReminders(null) never throws, total 0', summarizeReminders(null).total === 0);
  check('needsAttention(null) returns empty array, never throws', needsAttention(null).length === 0);
}

/* ── Immutability (deep-frozen results, like every other engine in this codebase) ── */
console.log('\n[Immutability]');
{
  const a = normalizeVehicleAsset(vehicle({ annualTaxDue: addDaysStr(NOW, -5) }), NOW);
  const [tax] = computeVehicleReminders(a);
  check('reminder objects are frozen', Object.isFrozen(tax));
}

/* ── UI wiring (source presence — drawer + reminder panel + app.js) ─────── */
console.log('\n[UI wiring]');
{
  const engineSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'services', 'reminder-engine.js'), 'utf-8');
  const engineImports = engineSrc.split('\n').filter((l) => /^\s*import /.test(l)).join('\n');
  check('engine reuses deriveDocStatus (does not reinvent doc classification)', engineSrc.includes("import { deriveDocStatus } from './vehicle-asset-service.js'"));
  check('engine has no Firebase/store import (pure, reads normalized assets only)', !/vehicles-store|firebase/i.test(engineImports));
  check('engine is not a scheduler (no actual setInterval/setTimeout call)', !/\bset(Interval|Timeout)\s*\(/.test(engineSrc));

  const drawerSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'components', 'vehicle-detail-drawer.js'), 'utf-8');
  check('drawer imports computeVehicleReminders from the reminder engine', drawerSrc.includes("from '../services/reminder-engine.js'"));
  check('drawer renders a Pengingat section', drawerSrc.includes("'Pengingat'"));

  const panelSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'components', 'vehicle-reminder-panel.js'), 'utf-8');
  check('reminder panel imports computeFleetReminders + summarizeReminders', panelSrc.includes('computeFleetReminders') && panelSrc.includes('summarizeReminders'));
  check('reminder panel is render-only (no vehicle-asset-service import — consumes already-normalized vehicles)', !panelSrc.includes('vehicle-asset-service'));

  const appSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'app.js'), 'utf-8');
  check('app.js mounts the reminder panel into its own container', appSrc.includes("getElementById('v2VehicleReminderPanel')"));
  check('app.js reuses the Fleet Dashboard\'s already-computed model (no duplicate computeFleetAssetModel call)', appSrc.includes('renderVehicleReminderPanel(dashModel.vehicles)'));

  const fleetDashSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'components', 'fleet-dashboard.js'), 'utf-8');
  const fleetKpiCalls = fleetDashSrc.split('\n').filter((l) => /\bfleetKpi\(\{/.test(l) && !/^\s*function /.test(l)).length; // calls only, excludes the `function fleetKpi(` definition line
  check('the protected 5-KPI Fleet Dashboard grid was NOT touched (still exactly 5 fleetKpi() calls)', fleetKpiCalls === 5);
  check('reminder engine was NOT imported into the protected Fleet Dashboard file', !fleetDashSrc.includes('reminder-engine'));
}

console.log(`\nPassed: ${pass}`);
console.log(`Failed: ${fail}`);
console.log(`Total:  ${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
