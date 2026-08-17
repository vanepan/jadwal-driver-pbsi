/* ============================================================
   DRIVERS.JS — Driver Data & UI Initialization
   
   Daftar driver, kendaraan, dan inisialisasi dropdown driver.
   ============================================================ */

'use strict';

import { getDrivers, getActiveDrivers, findDriverByLegacyName } from './drivers-store.js';
import { getVehicleColorByName, getActiveVehicles } from './vehicles-store.js';
import { buildVehicleShapeMap, vehicleShapeParts } from './utils/vehicle-identity.js';

/* ── Data: Daftar Driver ── */
export const DEFAULT_DRIVERS = [
  { name: 'Igo',  phone: '+62 813-1107-3261' },
  { name: 'Dedi', phone: '+62 818-0693-4345' },
  { name: 'Aria', phone: '+62 813-8954-1138' },
];

/* ── Data: Daftar Kendaraan & Warna Timeline ── */
// Internal fallback only — authoritative source is /vehicles in Firebase via vehicles-store.
// Used by getVehicleColor() when vehicles-store cache is empty (e.g. pre-init race).
const VEHICLES = {
  'Innova':   '#1565C0',
  'Luxio':    '#2E7D32',
  'Polytron': '#E65100',
  'Hiace':    '#6A1B9A',
};


function getActiveDriversOrFallback() {
  if (getDrivers().length === 0) return DEFAULT_DRIVERS;
  const activeDrivers = getActiveDrivers();
  return activeDrivers;
}

/**
 * Initialize dropdown driver di form
 * - Isi options dengan daftar driver (active only)
 * - Auto-fill nomor HP saat driver dipilih (one-time listener)
 */
export function initDriverSelect() {
  const sel = document.getElementById('fieldDriver');
  if (!sel) return;

  _buildDriverOptions(sel);

  sel.addEventListener('change', () => {
    const driver = getDriverByName(sel.value);
    const phoneInput = document.getElementById('fieldPhone');
    if (phoneInput) {
      phoneInput.value = driver ? driver.phone : '';
    }
  });
}

/**
 * Rebuild driver options without adding a new event listener.
 * Call this when the driver list changes (create/deactivate/reactivate).
 * The PBSI Select MutationObserver picks up option changes automatically.
 */
export function refreshDriverSelect() {
  const sel = document.getElementById('fieldDriver');
  if (sel) _buildDriverOptions(sel);
}

function _buildDriverOptions(sel) {
  const prev = sel.value;
  // v1.27.0: "Tanpa Driver" (Self-Drive Assignment) sentinel — mirrors the
  // existing "Tanpa Kendaraan" pattern on #fieldVehicle. NEVER persisted as-is;
  // assignments.js normalizes it to driver: '' before saving.
  sel.innerHTML = '<option value="">-- Pilih Driver --</option>'
    + '<option value="__none__">Tanpa Driver</option>';
  getActiveDriversOrFallback().forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });
  // Restore selection only if the driver is still in the list (still active)
  if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
}

function getActiveVehiclesOrFallback() {
  const active = getActiveVehicles();
  if (active.length > 0) return active;
  return Object.keys(VEHICLES).map(name => ({ name }));
}

/**
 * Initialize dropdown kendaraan di form.
 * V1 Redesign Phase 4 (P0 fix): #fieldVehicle was a static 4-option
 * hardcode in index.html (Innova/Luxio/Polytron/Hiace only) — now reads
 * getActiveVehicles() so a 5th/6th vehicle appears without a code change.
 * Mirrors initDriverSelect()/_buildDriverOptions() exactly.
 */
export function initVehicleSelect() {
  const sel = document.getElementById('fieldVehicle');
  if (!sel) return;
  _buildVehicleOptions(sel);
}

/**
 * Rebuild vehicle options without adding a new event listener.
 * Call this when the vehicle list changes (create/deactivate/reactivate).
 * Mirrors refreshDriverSelect().
 */
export function refreshVehicleSelect() {
  const sel = document.getElementById('fieldVehicle');
  if (sel) _buildVehicleOptions(sel);
}

function _buildVehicleOptions(sel) {
  const prev = sel.value;
  sel.innerHTML = '<option value="">-- Pilih Kendaraan --</option>';
  getActiveVehiclesOrFallback().forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name;
    sel.appendChild(opt);
  });
  // "Tanpa Kendaraan" (self-drive / no-vehicle) sentinel always last — matches
  // the existing v1.27.0 pattern; assignments.js normalizes it before saving.
  const noneOpt = document.createElement('option');
  noneOpt.value = '__none__';
  noneOpt.textContent = 'Tanpa Kendaraan';
  sel.appendChild(noneOpt);
  // Restore selection only if the vehicle is still in the list (still active)
  if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
}

/**
 * Render the timeline's vehicle-color legend from live vehicle data.
 * V1 Redesign Phase 4 (P0 fix, same gap as initVehicleSelect() above) — the
 * legend was a static 4-item hardcode in index.html. Each item's swatch
 * color is set via a CSS custom property read from the vehicle's own stored
 * `color` field (getVehicleColor), NOT from style.css's old
 * [data-vehicle="X"]::before rules — those only ever covered the original 4
 * seed vehicles by name and are left in place untouched (harmless; they
 * happen to resolve to the same colors for those four, and simply don't
 * match anything for a 5th/6th vehicle, where this custom property is what
 * actually supplies the color).
 */
export function renderVehicleLegend() {
  const legend = document.querySelector('.legend');
  if (!legend) return;
  const title = legend.querySelector('.legend-title')
    || Object.assign(document.createElement('span'), { className: 'legend-title', textContent: 'Kendaraan:' });
  legend.innerHTML = '';
  legend.appendChild(title);
  const activeVehicles = getActiveVehiclesOrFallback();
  // V1 Redesign Phase 3 (v1.30.9.15) — shape half of vehicle identity
  // (colorblind-safe: color alone fails both new-vehicle-added and
  // colorblind cases, per the Claude Design brief). Shape assignment is
  // stable by name across the whole active fleet, not just this legend.
  const shapeMap = buildVehicleShapeMap(activeVehicles);
  activeVehicles.forEach(v => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.dataset.vehicle = v.name;
    item.style.setProperty('--legend-swatch-color', getVehicleColor(v.name));
    const parts = vehicleShapeParts(shapeMap.get(v.id || v.name) || 'rounded');
    item.style.setProperty('--legend-swatch-radius', parts.radius);
    item.style.setProperty('--legend-swatch-clip', parts.clipPath);
    item.style.setProperty('--legend-swatch-transform', parts.transform);
    item.textContent = v.name;
    legend.appendChild(item);
  });
}

/**
 * Get driver info by name
 * @param {string} name - Nama driver
 * @returns {Object|undefined} - Driver object atau undefined
 */
export function getDriverByName(name) {
  return findDriverByLegacyName(name) || DEFAULT_DRIVERS.find(d => d.name === name);
}

/**
 * Get warna kendaraan. Primary source: vehicles-store (Firebase).
 * Falls back to legacy VEHICLES map then '#555' if store is not yet loaded.
 * @param {string} vehicleName
 * @returns {string} - Hex color code
 */
export function getVehicleColor(vehicleName) {
  return getVehicleColorByName(vehicleName) || VEHICLES[vehicleName] || '#555';
}

console.info('Drivers module loaded');
