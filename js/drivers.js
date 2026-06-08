/* ============================================================
   DRIVERS.JS — Driver Data & UI Initialization
   
   Daftar driver, kendaraan, dan inisialisasi dropdown driver.
   ============================================================ */

'use strict';

import { getDrivers, getActiveDrivers, findDriverByLegacyName } from './drivers-store.js';

/* ── Data: Daftar Driver ── */
export const DEFAULT_DRIVERS = [
  { name: 'Igo',  phone: '+62 813-1107-3261' },
  { name: 'Dedi', phone: '+62 818-0693-4345' },
  { name: 'Aria', phone: '+62 813-8954-1138' },
];

/* ── Data: Daftar Kendaraan & Warna Timeline ── */
export const VEHICLES = {
  'Innova':   '#1565C0',
  'Luxio':    '#2E7D32',
  'Polytron': '#E65100',
  'Hiace':    '#6A1B9A',
};

/* ── Data: Nomor Polisi Kendaraan ─────────────────────────────
   Update these values to match the actual license plates.
   Used by the reimbursement form generator (v1.2.4+).
   ─────────────────────────────────────────────────────────── */
export const VEHICLE_PLATES = {
  'Innova':   '',
  'Luxio':    '',
  'Polytron': '',
  'Hiace':    '',
};

function getActiveDriversOrFallback() {
  if (getDrivers().length === 0) return DEFAULT_DRIVERS;
  const activeDrivers = getActiveDrivers();
  return activeDrivers;
}

/**
 * Initialize dropdown driver di form
 * - Isi options dengan daftar driver
 * - Auto-fill nomor HP saat driver dipilih
 */
export function initDriverSelect() {
  const sel = document.getElementById('fieldDriver');
  if (!sel) return;

  sel.innerHTML = '<option value="">-- Pilih Driver --</option>';
  getActiveDriversOrFallback().forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });

  // Saat driver dipilih, otomatis isi nomor HP
  sel.addEventListener('change', () => {
    const driver = getDriverByName(sel.value);
    const phoneInput = document.getElementById('fieldPhone');
    if (phoneInput) {
      phoneInput.value = driver ? driver.phone : '';
    }
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
 * Get warna kendaraan dari VEHICLES map
 * @param {string} vehicleName - Nama kendaraan
 * @returns {string} - Hex color code (atau default #555 jika tidak ditemukan)
 */
export function getVehicleColor(vehicleName) {
  return VEHICLES[vehicleName] || '#555';
}

console.info('Drivers module loaded');
