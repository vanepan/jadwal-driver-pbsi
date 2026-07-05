/* engineering-master-data-check.mjs — validates the reusable Engineering
   master-data providers (v1.20.2): every provider implements the common
   interface, the Gedung → Lantai → Ruangan hierarchy resolves deterministically,
   and category/priority stay sourced from config/settings (no duplication).
   Run: node scripts/engineering-master-data-check.mjs   (exit 0 = all pass) */

import {
  MASTER_DATA_PROVIDERS, makeProvider,
  categoryProvider, priorityProvider, severityProvider, equipmentTypeProvider,
  locationProvider, buildingProvider, floorsOf, roomsOf,
  SEVERITY_SEED, EQUIPMENT_TYPE_SEED, LOCATION_SEED,
} from '../js/engineering/master-data/engineering-master-data.js';
import { PRIORITY_DEFS } from '../js/engineering/config/engineering-config.js';
import { getEnabledCategories } from '../js/engineering/settings/engineering-settings.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── common interface ─────────────────────────────────────────────────── */
console.log('\n[common interface]');
const IFACE = ['key', 'label', 'list', 'get', 'has', 'labelOf'];
for (const [name, p] of Object.entries(MASTER_DATA_PROVIDERS)) {
  check(`${name} provider implements the common interface`, IFACE.every((k) => k in p));
  check(`${name} provider .list() returns a non-empty {id,label} array`,
    Array.isArray(p.list()) && p.list().length > 0 && p.list().every((r) => r.id && r.label));
}

/* ── factory semantics ────────────────────────────────────────────────── */
console.log('\n[factory]');
const t = makeProvider('t', 'T', [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]);
check('get returns the record', t.get('a')?.label === 'A');
check('get unknown returns null', t.get('zzz') === null);
check('has is true/false correctly', t.has('b') === true && t.has('zzz') === false);
check('labelOf falls back to id', t.labelOf('a') === 'A' && t.labelOf('zzz') === 'zzz');
check('list() returns a copy (mutation-safe)', (() => { const l = t.list(); l.push({}); return t.list().length === 2; })());

/* ── sourced, not duplicated ──────────────────────────────────────────── */
console.log('\n[sourced from config/settings]');
check('category provider mirrors enabled categories',
  categoryProvider.list().length === getEnabledCategories().length);
check('priority provider mirrors PRIORITY_DEFS',
  priorityProvider.list().length === PRIORITY_DEFS.length && priorityProvider.has('critical'));
check('severity is a distinct domain set', severityProvider.list().length === SEVERITY_SEED.length && severityProvider.has('critical'));
check('equipment type seeded', equipmentTypeProvider.list().length === EQUIPMENT_TYPE_SEED.length && equipmentTypeProvider.has('ac'));

/* ── location hierarchy ───────────────────────────────────────────────── */
console.log('\n[location hierarchy]');
const b0 = buildingProvider.list()[0];
check('buildings come from LOCATION_SEED', buildingProvider.list().length === LOCATION_SEED.length);
const floors = floorsOf(b0.id);
check('floorsOf(building) returns that building\'s floors', floors.length > 0 && floors.every((f) => f.buildingId === b0.id));
const rooms = roomsOf(b0.id, floors[0].id);
check('roomsOf(building,floor) returns nested rooms', rooms.length > 0 && rooms.every((r) => r.floorId === floors[0].id && r.buildingId === b0.id));
check('floorsOf(null) returns all floors', floorsOf(null).length >= floors.length);
check('roomsOf unknown building is empty', roomsOf('nope', 'nope').length === 0);
check('locationProvider exposes buildings/floors/rooms accessors',
  typeof locationProvider.buildings === 'function' && typeof locationProvider.floors === 'function' && typeof locationProvider.rooms === 'function');
check('every room resolves back to a real floor + building', roomsOf(b0.id, null).every((r) => {
  const b = LOCATION_SEED.find((x) => x.id === r.buildingId);
  return b && b.floors.some((f) => f.id === r.floorId);
}));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
