'use strict';

/* ============================================================
   VEHICLE-IDENTITY.JS — v1.30.9.14 (V1 True Redesign)

   A vehicle's on-screen identity should never be color-only (fails both
   colorblind users and any fleet past a hardcoded palette size) — the
   Claude Design mockups pair every vehicle color with a distinct SHAPE.
   No shape-identity concept existed anywhere in this codebase before this
   module (confirmed via grep — vehicles-store.js's per-record `.color`
   field has always been the only identity axis).

   PURE: no DOM, no Firebase, no `window`. Shape assignment is a stable
   function of a vehicle's position in a caller-supplied ordering (e.g. by
   id, so it does not reshuffle as unrelated vehicles are added/archived
   elsewhere) — never randomized, never re-derived per render.
   ============================================================ */

/** Fixed rotation, six shapes — matches the Design System mockup's own
 *  vehicleIdentities palette exactly (circle/square/diamond/triangle/
 *  hexagon/rounded), so a 7th vehicle repeats the first shape rather than
 *  growing an unbounded list. Existing per-vehicle `.color` is reused
 *  as-is — this module only adds the shape axis, never a second color. */
export const VEHICLE_SHAPES = Object.freeze(['circle', 'square', 'diamond', 'triangle', 'hexagon', 'rounded']);

/**
 * CSS declarations (as a single string, ready for a `style` attribute or
 * inline style assignment) that render a small square element as the given
 * shape. Byte-for-byte the same shape vocabulary as the mockups' own
 * shapeCss() helper.
 * @param {string} shape one of VEHICLE_SHAPES
 * @returns {string}
 */
export function vehicleShapeCss(shape) {
  switch (shape) {
    case 'circle':   return 'border-radius:50%';
    case 'square':   return 'border-radius:3px';
    case 'diamond':  return 'border-radius:3px;transform:rotate(45deg)';
    case 'triangle': return 'clip-path:polygon(50% 4%,4% 96%,96% 96%);border-radius:0';
    case 'hexagon':  return 'clip-path:polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0% 50%)';
    default:         return 'border-radius:9px'; /* 'rounded' + any unknown value */
  }
}

/**
 * The same shape vocabulary as vehicleShapeCss(), split into discrete
 * radius/clip-path/transform parts for callers that render the shape on a
 * CSS `::before` pseudo-element (which can't take a multi-declaration inline
 * style string the way a real element can — each part is set as its own
 * custom property instead, e.g. `--swatch-radius`/`--swatch-clip`/
 * `--swatch-transform`, and the pseudo-element's own rule references all
 * three with safe defaults so an un-set property is a no-op, not an error).
 * @param {string} shape one of VEHICLE_SHAPES
 * @returns {{radius:string, clipPath:string, transform:string}}
 */
export function vehicleShapeParts(shape) {
  switch (shape) {
    case 'circle':   return { radius: '50%', clipPath: 'none', transform: 'none' };
    case 'square':   return { radius: '3px', clipPath: 'none', transform: 'none' };
    case 'diamond':  return { radius: '3px', clipPath: 'none', transform: 'rotate(45deg)' };
    case 'triangle': return { radius: '0',   clipPath: 'polygon(50% 4%,4% 96%,96% 96%)', transform: 'none' };
    case 'hexagon':  return { radius: '0',   clipPath: 'polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0% 50%)', transform: 'none' };
    default:         return { radius: '9px', clipPath: 'none', transform: 'none' };
  }
}

/**
 * Assigns each vehicle a stable shape from VEHICLE_SHAPES, keyed by NAME —
 * not id. This codebase's own established join key for "which vehicle" is
 * always the name (assignment.vehicle stores a name, not an RTDB key; see
 * getVehicleColorByName()/getVehicleByName() in vehicles-store.js and the
 * v1.27.0 comment there explaining why) — keying this map any other way
 * would silently miss every lookup done the way the rest of the app already
 * does them. Ordering comes from sorting by name so the same vehicle always
 * gets the same shape across renders and sessions, regardless of which
 * subset of the fleet is currently active/passed in.
 * @param {Array<{name?:string}>} vehicles
 * @returns {Map<string,string>} vehicle name -> shape
 */
export function buildVehicleShapeMap(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const sorted = [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const map = new Map();
  sorted.forEach((v, i) => {
    if (v.name) map.set(v.name, VEHICLE_SHAPES[i % VEHICLE_SHAPES.length]);
  });
  return map;
}

/**
 * Convenience: shape for one vehicle, given the full active fleet for
 * stable ordering. Prefer buildVehicleShapeMap() + a single map lookup
 * when rendering a list (this recomputes the sort/map every call).
 * @param {{name?:string}} vehicle
 * @param {Array<{name?:string}>} allVehicles
 * @returns {string}
 */
export function vehicleShapeFor(vehicle, allVehicles) {
  if (!vehicle?.name) return 'rounded';
  return buildVehicleShapeMap(allVehicles).get(vehicle.name) || 'rounded';
}
