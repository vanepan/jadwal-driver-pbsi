// Pure-logic verification for js/utils/vehicle-identity.js (Phase 2/3, V1 Redesign).
// No DOM needed — the whole module is DOM-free by design.
import { VEHICLE_SHAPES, vehicleShapeCss, vehicleShapeParts, buildVehicleShapeMap, vehicleShapeFor }
  from '../js/utils/vehicle-identity.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; } else { fail++; console.error(`  ✗ ${name}`); }
}

// 1) Every shape produces valid CSS parts, consistent between the two representations.
for (const shape of VEHICLE_SHAPES) {
  const css = vehicleShapeCss(shape);
  const parts = vehicleShapeParts(shape);
  check(`${shape}: css string non-empty`, typeof css === 'string' && css.length > 0);
  check(`${shape}: parts has radius/clipPath/transform`, 'radius' in parts && 'clipPath' in parts && 'transform' in parts);
}
check('unknown shape falls back to rounded css', vehicleShapeCss('nonsense') === 'border-radius:9px');
check('unknown shape falls back to rounded parts', vehicleShapeParts('nonsense').radius === '9px');

// 2) Stable, deterministic assignment: same input -> same output, every call.
const fleet = [{ name: 'Toyota Hiace' }, { name: 'Avanza' }, { name: 'Innova' }, { name: 'Fortuner' }];
const map1 = buildVehicleShapeMap(fleet);
const map2 = buildVehicleShapeMap([...fleet].reverse()); // order-independent (sorts internally)
check('stable across input order', map1.get('Avanza') === map2.get('Avanza'));
check('stable across repeated calls', buildVehicleShapeMap(fleet).get('Innova') === map1.get('Innova'));

// 3) Keyed by NAME (the established join key everywhere else in this codebase —
//    assignment.vehicle / getVehicleColorByName both key by name, not id).
const withIds = [{ id: 'v1', name: 'Toyota Hiace' }, { id: 'v2', name: 'Avanza' }];
const idMap = buildVehicleShapeMap(withIds);
check('keyed by name even when id is present', idMap.has('Toyota Hiace') && !idMap.has('v1'));

// 4) 7th vehicle wraps around to the first shape (fixed 6-shape rotation, not unbounded).
const sevenVehicles = Array.from({ length: 7 }, (_, i) => ({ name: `V${i}` }));
const sevenMap = buildVehicleShapeMap(sevenVehicles);
const sorted = [...sevenVehicles].sort((a, b) => a.name.localeCompare(b.name));
check('7th vehicle wraps to shape[0]', sevenMap.get(sorted[6].name) === sevenMap.get(sorted[0].name));

// 5) vehicleShapeFor() convenience matches the map-based lookup.
check('vehicleShapeFor matches map lookup', vehicleShapeFor({ name: 'Avanza' }, fleet) === map1.get('Avanza'));
check('vehicleShapeFor(null) is safe', vehicleShapeFor(null, fleet) === 'rounded');
check('vehicleShapeFor(no-name) is safe', vehicleShapeFor({}, fleet) === 'rounded');

// 6) Empty/non-array input never throws.
check('empty array is safe', buildVehicleShapeMap([]).size === 0);
check('non-array is safe', buildVehicleShapeMap(null).size === 0);

console.log(`\nVEHICLE-IDENTITY VERIFICATION: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
