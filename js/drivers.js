/* ============================================================
   DRIVERS.JS — Driver Data & UI Initialization
   
   Daftar driver, kendaraan, dan inisialisasi dropdown driver.
   ============================================================ */

'use strict';

import { getDrivers, getActiveDrivers, findDriverByLegacyName } from './drivers-store.js';
import { getVehicleColorByName } from './vehicles-store.js';

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
  sel.innerHTML = '<option value="">-- Pilih Driver --</option>';
  getActiveDriversOrFallback().forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });
  // Restore selection only if the driver is still in the list (still active)
  if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
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
