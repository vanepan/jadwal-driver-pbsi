'use strict';

import {
  isFirebaseConfigured,
  readNode,
  storeFirebaseData,
  subscribeFirebasePath,
  updateFirebaseData,
} from './firebase.js';
import { COMPLIANCE_TYPES } from './config/compliance-config.js';

const VEHICLES_PATH = 'vehicles';

// Default seed — mirrors existing VEHICLES map in drivers.js (Phase A compatibility)
const DEFAULT_VEHICLES = [
  { name: 'Innova',   plateNumber: '', capacity: 7,  color: '#1565C0' },
  { name: 'Luxio',    plateNumber: '', capacity: 7,  color: '#2E7D32' },
  { name: 'Polytron', plateNumber: '', capacity: 7,  color: '#E65100' },
  { name: 'Hiace',    plateNumber: '', capacity: 12, color: '#6A1B9A' },
];

let vehicles = [];
let vehiclesLoaded = false;
let vehiclesSubscribed = false;
let onVehiclesChangeCallbacks = [];

function makeVehicleId(name, index = 0) {
  const slug = String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `vhc_${slug || index + 1}`;
}

// Normalize plate: strip all whitespace, lowercase — for uniqueness comparison only
function normalizePlate(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

/* ── v1.18.0 Vehicle Asset Intelligence — asset identity fields ──────────────
   The Vehicle Store is the SINGLE SOURCE OF TRUTH for every PBSI vehicle asset.
   These fields are ADDITIVE: legacy records (name/plate/capacity/color/active)
   keep working untouched. `type` + `status` become part of asset identity and
   `active` stays mirrored from `status` so every operational module that already
   reads `v.active` (dispatch, recommendation, analytics) behaves unchanged —
   only an 'active' status participates in operations. */
export const VEHICLE_TYPES = Object.freeze(['mobil', 'motor', 'ambulance']);
export const VEHICLE_STATUSES = Object.freeze(['active', 'maintenance', 'inactive', 'retired']);

// Registration + legal + insurance asset fields persisted verbatim (passthrough).
const ASSET_STRING_FIELDS = Object.freeze([
  'brand', 'model', 'year', 'fuel', 'transmission', 'engineNumber', 'chassisNumber',
  'owner', 'registrationRegion', 'odometer', 'acquisitionDate', 'acquisitionValue',
  'stnkNumber', 'stnkExpiry', 'annualTaxDue', 'fiveYearTaxDue', 'taxStatus',
  'insuranceCompany', 'policyNumber', 'coverage', 'insuranceExpiry', 'insuranceStatus',
]);

function normalizeType(value) {
  const t = String(value || '').trim().toLowerCase();
  return VEHICLE_TYPES.includes(t) ? t : 'mobil';
}

function normalizeStatus(value, fallbackActive) {
  const s = String(value || '').trim().toLowerCase();
  if (VEHICLE_STATUSES.includes(s)) return s;
  return fallbackActive === false ? 'inactive' : 'active';
}

// Build the additive asset payload from an input bag, dropping undefined so a
// Firebase write never carries `undefined` (RTDB rejects it). timeline is
// reserved future-ready event storage (kept verbatim when supplied).
//
// v1.29.14: dropped write-acceptance of the legacy `taxHistory[]` field — no
// caller has ever populated it (superseded by `complianceHistory` since
// v1.29.2) and `updateVehicle` writes via a partial Firebase `update()`, so
// this never touches any `taxHistory` a legacy record already has in RTDB.
// Reading/displaying that legacy data (vehicle-asset-service.js) is untouched.
function sanitizeAssetFields(input = {}) {
  const out = {};
  for (const key of ASSET_STRING_FIELDS) {
    if (input[key] !== undefined) out[key] = input[key] === null ? null : String(input[key]).trim();
  }
  if (Array.isArray(input.timeline)) out.timeline = input.timeline;
  return out;
}

function mapFirebaseVehicles(value) {
  const raw = value || {};
  return Object.keys(raw)
    .map(key => ({ id: key, ...raw[key] }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'));
}

function buildSeedVehicles() {
  const now = new Date().toISOString();
  return DEFAULT_VEHICLES.reduce((map, v, index) => {
    const id = makeVehicleId(v.name, index);
    map[id] = {
      id,
      name: v.name,
      plateNumber: v.plateNumber,
      capacity: v.capacity,
      color: v.color,
      type: 'mobil',
      status: 'active',
      active: true,
      createdAt: now,
      updatedAt: now,
      inactiveAt: null,
      maintenanceRecords: [],
      complianceHistory: [],
    };
    return map;
  }, {});
}

function refreshVehiclesCache(nextVehicles) {
  vehicles = nextVehicles;
  vehiclesLoaded = true;
  onVehiclesChangeCallbacks.forEach(cb => cb(vehicles));
}

/**
 * v1.29.13 — Refresh Consistency. The ONE post-write refresh path every
 * mutating export below now calls, replacing what used to be a
 * copy-pasted `mapFirebaseVehicles(Object.fromEntries(...))` /
 * `refreshVehiclesCache(...)` pair duplicated per writer (and, for several
 * writers, only present in their offline branch — see the investigation in
 * docs/VEHICLE_CORE_INVESTIGATION_AND_ROADMAP.md §15 for why that was
 * inconsistent). Every writer calls this exactly once, AFTER its Firebase
 * write has been confirmed (or immediately, when running fully offline) —
 * never before, so this is a refresh of confirmed state, not an optimistic
 * pre-confirmation update. `mutate(map)` receives a plain `{ [id]: vehicle }`
 * object built from the CURRENT cache and mutates it in place (set/delete a
 * key); the result is re-sorted and pushed through the exact same
 * `refreshVehiclesCache` every other refresh path (create/update/delete, the
 * offline branches, and the Firebase realtime echo) already uses — so
 * `getVehicles()` and every `registerVehiclesChangeListener` subscriber are
 * updated through the SAME single mechanism, for every writer, every time.
 * @param {(map: Object) => void} mutate
 */
function applyVehiclesPatch(mutate) {
  const map = Object.fromEntries(vehicles.map(v => [v.id, v]));
  mutate(map);
  refreshVehiclesCache(mapFirebaseVehicles(map));
}

async function seedVehiclesIfEmpty() {
  if (!isFirebaseConfigured()) return;

  const readResult = await readNode(VEHICLES_PATH);
  if (!readResult || typeof readResult !== 'object' || readResult.status !== 'ok') {
    const status = readResult && typeof readResult === 'object' ? readResult.status : 'unknown';
    const code = readResult && typeof readResult === 'object' ? readResult.code : '';
    throw new Error(`[VehiclesStore] readNode failed (${status}${code ? `:${code}` : ''})`);
  }

  const raw = readResult.value;
  const hasExisting = raw && typeof raw === 'object' && Object.keys(raw).length > 0;

  if (hasExisting) {
    refreshVehiclesCache(mapFirebaseVehicles(raw));
    return;
  }

  const seed = buildSeedVehicles();
  await storeFirebaseData(VEHICLES_PATH, seed);
  refreshVehiclesCache(mapFirebaseVehicles(seed));
}

export async function initVehiclesStore() {
  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles(buildSeedVehicles()));
    return;
  }

  if (!vehiclesLoaded) {
    try {
      await seedVehiclesIfEmpty();
    } catch (error) {
      console.warn('[VehiclesStore] Failed to seed/load Firebase vehicles. Using fallback.', error);
      refreshVehiclesCache(mapFirebaseVehicles(buildSeedVehicles()));
    }
  }

  if (!vehiclesSubscribed) {
    vehiclesSubscribed = true;
    subscribeFirebasePath(VEHICLES_PATH, snapshot => {
      refreshVehiclesCache(mapFirebaseVehicles(snapshot.val()));
    });
  }
}

export function getVehicles() {
  return vehicles;
}

export function getActiveVehicles() {
  return vehicles.filter(v => v.active !== false && v.archived !== true);
}

export function getVehicleById(id) {
  if (!id) return null;
  return vehicles.find(v => v.id === id) || null;
}

export function registerVehiclesChangeListener(callback) {
  onVehiclesChangeCallbacks.push(callback);
}

export function getVehicleColorByName(vehicleName) {
  const v = vehicles.find(veh => veh.name === vehicleName && veh.archived !== true);
  return v ? v.color : null;
}

// v1.27.0 Self-Drive Assignment — assignment.vehicle stores the vehicle's NAME
// (not its RTDB key), so odometer autofill/write-back needs a name → record
// lookup. Mirrors getVehicleColorByName's matching rule.
export function getVehicleByName(vehicleName) {
  if (!vehicleName) return null;
  return vehicles.find(v => v.name === vehicleName && v.archived !== true) || null;
}

/**
 * Update a vehicle's `odometer` — the existing Vehicle Registration field
 * (ASSET_STRING_FIELDS above) — the single source of truth Start Assignment
 * autofills Odometer Awal from. Called once an assignment completes with a
 * captured Odometer Akhir (see app.js registerCompleteCallback). Stored as a
 * trimmed string, matching every other admin-edited asset field (and the
 * Vehicle Registration form, which also writes this field as a string) — the
 * value is still numeric-safe to read back via Number(vehicle.odometer).
 * SS2 hotfix (v1.27.1): v1.27.0 introduced a separate additive `lastOdometer`
 * field for this instead of reusing the existing `odometer` field, so a
 * vehicle's registration Odometer never advanced and Start Assignment kept
 * defaulting Odometer Awal to empty. Renamed from updateVehicleLastOdometer.
 * @param {string} vehicleId
 * @param {number} value
 */
export async function updateVehicleOdometer(vehicleId, value) {
  const existing = vehicles.find(v => v.id === vehicleId);
  if (!existing) return;

  const updates = { odometer: String(Number(value)), updatedAt: new Date().toISOString() };

  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + vehicleId, updates);
  }
  applyVehiclesPatch(map => { map[vehicleId] = { ...map[vehicleId], ...updates }; });
}

export function getActiveVehicleNames() {
  return vehicles
    .filter(v => v.active !== false && v.archived !== true)
    .map(v => v.name);
}

export async function createVehicle({ name, plateNumber, capacity, color, active = true, type, status, ...assetInput }) {
  const trimName = String(name || '').trim();
  if (!trimName) throw new Error('Nama kendaraan wajib diisi.');

  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('Kapasitas harus lebih dari 0.');

  // Plate must be unique among active vehicles (case-insensitive, whitespace-stripped)
  const trimPlate = String(plateNumber || '').trim();
  const normalizedNewPlate = normalizePlate(trimPlate);
  if (normalizedNewPlate) {
    const duplicate = vehicles.find(v =>
      v.active !== false && v.archived !== true &&
      normalizePlate(v.plateNumber) === normalizedNewPlate
    );
    if (duplicate) throw new Error('Plat nomor ini sudah digunakan oleh kendaraan aktif lain.');
  }

  let id = makeVehicleId(trimName);
  let suffix = 0;
  while (vehicles.find(v => v.id === id)) {
    suffix++;
    id = makeVehicleId(trimName + suffix);
  }

  const now = new Date().toISOString();
  // status is authoritative; `active` stays mirrored (only 'active' participates
  // in operational modules). When only a legacy `active` is given, derive status.
  const resolvedStatus = normalizeStatus(status, active);
  const isActive = resolvedStatus === 'active';
  const vehicle = {
    id,
    name: trimName,
    plateNumber: trimPlate,
    capacity: cap,
    color: String(color || '#555555'),
    type: normalizeType(type),
    status: resolvedStatus,
    active: isActive,
    createdAt: now,
    updatedAt: now,
    inactiveAt: isActive ? null : now,
    maintenanceRecords: [],
    complianceHistory: [],
    ...sanitizeAssetFields(assetInput),
  };

  if (isFirebaseConfigured()) {
    await storeFirebaseData(VEHICLES_PATH + '/' + id, vehicle);
  }
  applyVehiclesPatch(map => { map[id] = vehicle; });
  return vehicle;
}

export async function updateVehicle(id, { name, plateNumber, capacity, color, active, type, status, ...assetInput }) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');

  const trimName = String(name || '').trim();
  if (!trimName) throw new Error('Nama kendaraan wajib diisi.');

  const cap = Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('Kapasitas harus lebih dari 0.');

  // Plate uniqueness: check active vehicles excluding self
  const trimPlate = String(plateNumber || '').trim();
  const normalizedNewPlate = normalizePlate(trimPlate);
  if (normalizedNewPlate) {
    const duplicate = vehicles.find(v =>
      v.id !== id && v.active !== false && v.archived !== true &&
      normalizePlate(v.plateNumber) === normalizedNewPlate
    );
    if (duplicate) throw new Error('Plat nomor ini sudah digunakan oleh kendaraan aktif lain.');
  }

  const now = new Date().toISOString();
  // Resolve status (authoritative). If the caller did not send `status`, fall
  // back to the legacy active flag (or the existing status) so callers that only
  // toggle `active` keep working.
  const resolvedStatus = status !== undefined
    ? normalizeStatus(status, active)
    : (active !== undefined ? normalizeStatus(existing.status, active !== false) : (existing.status || normalizeStatus(null, existing.active !== false)));
  const isNowActive = resolvedStatus === 'active';
  const wasActive = existing.active !== false;

  const updates = {
    name: trimName,
    plateNumber: trimPlate,
    capacity: cap,
    color: String(color || '#555555'),
    type: type !== undefined ? normalizeType(type) : (existing.type || 'mobil'),
    status: resolvedStatus,
    active: isNowActive,
    inactiveAt: isNowActive ? null : (wasActive ? now : (existing.inactiveAt || now)),
    updatedAt: now,
    ...sanitizeAssetFields(assetInput),
  };

  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
  }
  applyVehiclesPatch(map => { map[id] = { ...map[id], ...updates }; });
  return { ...existing, ...updates };
}

export async function deactivateVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  // Keep status mirrored. Preserve maintenance/retired if already set; only a
  // plain active→inactive toggle moves status to 'inactive'.
  const nextStatus = (existing.status && existing.status !== 'active') ? existing.status : 'inactive';
  const updates = { active: false, status: nextStatus, inactiveAt: now, updatedAt: now };
  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
  }
  applyVehiclesPatch(map => { map[id] = { ...map[id], ...updates }; });
}

export async function reactivateVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { active: true, status: 'active', inactiveAt: null, updatedAt: now };
  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
  }
  applyVehiclesPatch(map => { map[id] = { ...map[id], ...updates }; });
}

export async function archiveVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { archived: true, archivedAt: now, active: false, inactiveAt: existing.inactiveAt || now, updatedAt: now };
  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
  }
  applyVehiclesPatch(map => { map[id] = { ...map[id], ...updates }; });
}

export async function restoreVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { archived: false, archivedAt: null, updatedAt: now };
  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
  }
  applyVehiclesPatch(map => { map[id] = { ...map[id], ...updates }; });
}

export async function deleteVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  if (existing.archived !== true) throw new Error('Kendaraan harus diarsipkan sebelum dapat dihapus permanen.');
  if (isFirebaseConfigured()) {
    await storeFirebaseData(VEHICLES_PATH + '/' + id, null);
  }
  applyVehiclesPatch(map => { delete map[id]; });
}

/* ── Maintenance Records (v1.18.1) ────────────────────────────────────────── */

/**
 * Get maintenance records for a vehicle.
 * @param {string} vehicleId - Vehicle ID
 * @returns {Array} Maintenance records (or empty array if vehicle/records not found)
 */
export function getMaintenanceRecords(vehicleId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle || !Array.isArray(vehicle.maintenanceRecords)) return [];
  return vehicle.maintenanceRecords;
}

/**
 * Add a maintenance record to a vehicle.
 * @param {string} vehicleId - Vehicle ID
 * @param {Object} record - Maintenance record (will be assigned an id and timestamps)
 * @returns {Object} Created record with id and timestamps
 */
export async function addMaintenanceRecord(vehicleId, record) {
  const existing = vehicles.find(v => v.id === vehicleId);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');

  // Generate ID and timestamps
  const id = 'maint_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const newRecord = {
    ...record,
    id,
    vehicleId,
    createdAt: now,
    updatedAt: now
  };

  // v1.29.13 — build the next array immutably (no longer mutates `existing`
  // in place) so the cache only changes through applyVehiclesPatch below,
  // after the write is confirmed (or immediately, offline).
  const nextRecords = [
    ...(Array.isArray(existing.maintenanceRecords) ? existing.maintenanceRecords : []),
    newRecord,
  ];
  const updates = { maintenanceRecords: nextRecords, updatedAt: now };

  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + vehicleId, updates);
  }
  applyVehiclesPatch(map => { map[vehicleId] = { ...map[vehicleId], ...updates }; });
  return newRecord;
}

/**
 * Update a maintenance record.
 * @param {string} vehicleId - Vehicle ID
 * @param {string} recordId - Maintenance record ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated record
 */
export async function updateMaintenanceRecord(vehicleId, recordId, updates) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) throw new Error('Kendaraan tidak ditemukan.');
  if (!Array.isArray(vehicle.maintenanceRecords)) {
    throw new Error('Kendaraan tidak memiliki catatan perawatan.');
  }

  const recordIndex = vehicle.maintenanceRecords.findIndex(r => r.id === recordId);
  if (recordIndex < 0) throw new Error('Catatan perawatan tidak ditemukan.');

  const now = new Date().toISOString();
  const updated = {
    ...vehicle.maintenanceRecords[recordIndex],
    ...updates,
    id: recordId,  // never change ID
    vehicleId,     // never change vehicle reference
    createdAt: vehicle.maintenanceRecords[recordIndex].createdAt,  // preserve creation time
    updatedAt: now
  };

  // v1.29.13 — immutable replace (no longer mutates vehicle.maintenanceRecords
  // in place); cache only changes through applyVehiclesPatch below.
  const nextRecords = vehicle.maintenanceRecords.map((r, i) => (i === recordIndex ? updated : r));
  const vUpdates = { maintenanceRecords: nextRecords, updatedAt: now };

  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + vehicleId, vUpdates);
  }
  applyVehiclesPatch(map => { map[vehicleId] = { ...map[vehicleId], ...vUpdates }; });
  return updated;
}

/**
 * Delete a maintenance record.
 * @param {string} vehicleId - Vehicle ID
 * @param {string} recordId - Maintenance record ID
 */
export async function deleteMaintenanceRecord(vehicleId, recordId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) throw new Error('Kendaraan tidak ditemukan.');
  if (!Array.isArray(vehicle.maintenanceRecords)) {
    throw new Error('Kendaraan tidak memiliki catatan perawatan.');
  }

  const recordIndex = vehicle.maintenanceRecords.findIndex(r => r.id === recordId);
  if (recordIndex < 0) throw new Error('Catatan perawatan tidak ditemukan.');

  // v1.29.13 — immutable removal (no longer splices vehicle.maintenanceRecords
  // in place); cache only changes through applyVehiclesPatch below.
  const nextRecords = vehicle.maintenanceRecords.filter((_, i) => i !== recordIndex);
  const now = new Date().toISOString();
  const updates = { maintenanceRecords: nextRecords, updatedAt: now };

  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + vehicleId, updates);
  }
  applyVehiclesPatch(map => { map[vehicleId] = { ...map[vehicleId], ...updates }; });
}

/* ── Compliance History (Vehicle Compliance & Financial History) ─────────────
   `complianceHistory` is the source of truth for STNK/tax renewals going
   forward — a NEW, additive field. The legacy `taxHistory[]` field it
   superseded is no longer write-accepted by sanitizeAssetFields (v1.29.14);
   any pre-existing `taxHistory` data on a legacy record is left untouched in
   RTDB and still reads/displays via vehicle-asset-service.js. Every entry is immutable
   once saved (no update/delete — a correction is recorded as a new entry).
   Adding a record also recomputes the vehicle's current-state mirror fields
   (stnkExpiry / annualTaxDue / fiveYearTaxDue) from the latest entry per
   type, so the vehicle card + drawer badges + health score stay in sync
   automatically — those three fields are no longer meant to be hand-edited
   (removed from the Vehicle Registration form; see app.js). */

/** Derive the current-state mirror (stnkExpiry/annualTaxDue/fiveYearTaxDue/
 *  insuranceExpiry) from the latest compliance entry per type. An annual OR
 *  five-year renewal both extend STNK + the annual tax cycle (they coincide
 *  in ID); a five-year renewal additionally extends the five-year due date.
 *  An insurance renewal extends only insuranceExpiry — it is a separate
 *  real-world cadence/provider from STNK/tax, never coincident with it.
 *  'other' entries don't move any mirror field — they're informational
 *  (e.g. a correction/fee). */
function recomputeComplianceMirror(history) {
  const list = Array.isArray(history) ? history : [];
  const latestByType = {};
  for (const r of list) {
    if (!r || !COMPLIANCE_TYPES.includes(r.type) || !r.expiryDate) continue;
    const cur = latestByType[r.type];
    if (!cur || new Date(r.expiryDate).getTime() > new Date(cur.expiryDate).getTime()) {
      latestByType[r.type] = r;
    }
  }
  const updates = {};
  const stnkCandidates = [latestByType.annual_tax, latestByType.five_year_tax].filter(Boolean);
  if (stnkCandidates.length) {
    const latest = stnkCandidates.reduce((a, b) =>
      new Date(a.expiryDate).getTime() > new Date(b.expiryDate).getTime() ? a : b);
    updates.stnkExpiry = latest.expiryDate;
    updates.annualTaxDue = latest.expiryDate;
  }
  if (latestByType.five_year_tax) updates.fiveYearTaxDue = latestByType.five_year_tax.expiryDate;
  if (latestByType.insurance) updates.insuranceExpiry = latestByType.insurance.expiryDate;
  return updates;
}

/**
 * Get the compliance/financial history for a vehicle.
 * @param {string} vehicleId
 * @returns {Array} Compliance records (or empty array if vehicle/records not found)
 */
export function getComplianceHistory(vehicleId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle || !Array.isArray(vehicle.complianceHistory)) return [];
  return vehicle.complianceHistory;
}

/**
 * Record a compliance renewal (STNK / annual tax / five-year tax / other) and
 * recompute the vehicle's current expiry/tax mirror fields from history.
 * v1.29.13 — refreshes the cache (and notifies every
 * registerVehiclesChangeListener subscriber) through the single unified
 * applyVehiclesPatch path, same as every other writer, so a `getVehicles()`
 * read AND a change-listener callback both already reflect it immediately
 * after this resolves, without waiting on the separate Firebase echo.
 * @param {string} vehicleId
 * @param {{type?:string, renewalDate:string, expiryDate:string, amount:number,
 *          paymentMethod?:string, receiptNumber?:string, notes?:string, officer?:string}} record
 * @returns {Object} Created record with id and timestamps
 */
export async function addComplianceRecord(vehicleId, record) {
  const existing = vehicles.find(v => v.id === vehicleId);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');

  const renewalDate = String((record && record.renewalDate) || '').trim();
  const expiryDate = String((record && record.expiryDate) || '').trim();
  if (!renewalDate) throw new Error('Tanggal perpanjangan wajib diisi.');
  if (!expiryDate) throw new Error('Tanggal masa berlaku baru wajib diisi.');

  const amount = Number(record && record.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Jumlah pembayaran tidak valid.');

  const type = COMPLIANCE_TYPES.includes(record && record.type) ? record.type : 'annual_tax';

  const id = 'comp_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const newRecord = {
    id,
    vehicleId,
    type,
    renewalDate,
    expiryDate,
    amount,
    paymentMethod: String((record && record.paymentMethod) || '').trim(),
    receiptNumber: String((record && record.receiptNumber) || '').trim(),
    notes: String((record && record.notes) || '').trim(),
    officer: String((record && record.officer) || '').trim(),
    createdAt: now,
    updatedAt: now,
  };

  // v1.29.13 — immutable append (no longer mutates `existing` in place);
  // cache only changes through applyVehiclesPatch below.
  const nextHistory = [
    ...(Array.isArray(existing.complianceHistory) ? existing.complianceHistory : []),
    newRecord,
  ];
  const mirror = recomputeComplianceMirror(nextHistory);
  const updates = { complianceHistory: nextHistory, ...mirror, updatedAt: now };

  if (isFirebaseConfigured()) {
    await updateFirebaseData(VEHICLES_PATH + '/' + vehicleId, updates);
  }
  applyVehiclesPatch(map => { map[vehicleId] = { ...map[vehicleId], ...updates }; });
  return newRecord;
}

console.info('Vehicles store module loaded');
