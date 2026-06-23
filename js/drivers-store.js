'use strict';

import {
  fetchFirebaseData,
  isFirebaseConfigured,
  storeFirebaseData,
  subscribeFirebasePath,
  updateFirebaseData,
} from './firebase.js';
import { DEFAULT_DRIVERS } from './drivers.js';

const DRIVERS_PATH = 'drivers';

/* ── Driver availability status (v1.16.4.4) ──────────────────────────
   `status` is the source of truth; the legacy boolean mirrors `active`
   and `archived` are kept in sync on every write so existing consumers
   (getActiveDrivers, validation.js, timeline.js, requests.js) are
   unchanged. Leave statuses (Cuti/Sakit/Izin) carry a `leave` period
   { start, end, note } and auto-return to Aktif once `end` passes. */
export const DRIVER_STATUS = {
  ACTIVE: 'Aktif',
  CUTI: 'Cuti',
  SAKIT: 'Sakit',
  IZIN: 'Izin',
  NONAKTIF: 'Nonaktif',
  ARSIP: 'Arsip',
};
export const DRIVER_LEAVE_STATUSES = [DRIVER_STATUS.CUTI, DRIVER_STATUS.SAKIT, DRIVER_STATUS.IZIN];
const VALID_SET_STATUSES = [
  DRIVER_STATUS.ACTIVE, DRIVER_STATUS.CUTI, DRIVER_STATUS.SAKIT, DRIVER_STATUS.IZIN, DRIVER_STATUS.NONAKTIF,
];

export function isLeaveStatus(status) {
  return DRIVER_LEAVE_STATUSES.includes(status);
}

/** Local-day ISO (yyyy-mm-dd), timezone-safe — mirrors the petty-cash todayISO. */
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Stored status, deriving a value for legacy records that predate `status`. */
export function deriveStatus(driver) {
  if (!driver) return DRIVER_STATUS.NONAKTIF;
  if (driver.archived === true) return DRIVER_STATUS.ARSIP;
  if (driver.status && Object.values(DRIVER_STATUS).includes(driver.status)) return driver.status;
  return driver.active === false ? DRIVER_STATUS.NONAKTIF : DRIVER_STATUS.ACTIVE;
}

/** Effective status: a leave whose `end` has passed reads as Aktif immediately,
    even before the auto-reactivation sweep persists it. */
export function effectiveStatus(driver, today = todayISO()) {
  const status = deriveStatus(driver);
  if (isLeaveStatus(status)) {
    const end = driver && driver.leave && driver.leave.end;
    if (end && String(end) < today) return DRIVER_STATUS.ACTIVE;
  }
  return status;
}

/** Eligible for assignment selection ⇔ effective status is Aktif. */
export function isDriverEligible(driver) {
  return effectiveStatus(driver) === DRIVER_STATUS.ACTIVE;
}

let drivers = [];
let driversLoaded = false;
let driversSubscribed = false;
let onDriversChangeCallbacks = [];

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function makeDriverId(name, index = 0) {
  const slug = normalizeName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `drv_${slug || index + 1}`;
}

function mapFirebaseDrivers(value) {
  const raw = value || {};
  return Object.keys(raw)
    .map(key => ({ id: key, ...raw[key] }))
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 9999;
      const orderB = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || '').localeCompare(String(b.name || ''), 'id');
    });
}

function buildSeedDrivers() {
  const now = new Date().toISOString();
  return DEFAULT_DRIVERS.reduce((map, driver, index) => {
    const id = makeDriverId(driver.name, index);
    map[id] = {
      id,
      name: driver.name,
      phone: driver.phone || '',
      active: true,
      linkedUserUsername: '',
      normalizedName: normalizeName(driver.name),
      sortOrder: index + 1,
      legacyNames: [driver.name],
      inactiveAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return map;
  }, {});
}

function refreshDriversCache(nextDrivers) {
  drivers = nextDrivers;
  driversLoaded = true;
  onDriversChangeCallbacks.forEach(cb => cb(drivers));
}

async function seedDriversIfEmpty() {
  if (!isFirebaseConfigured()) return;

  const raw = await fetchFirebaseData(DRIVERS_PATH);
  const hasExistingDrivers = raw && typeof raw === 'object' && Object.keys(raw).length > 0;

  if (hasExistingDrivers) {
    refreshDriversCache(mapFirebaseDrivers(raw));
    return;
  }

  const seed = buildSeedDrivers();
  await storeFirebaseData(DRIVERS_PATH, seed);
  refreshDriversCache(mapFirebaseDrivers(seed));
}

export async function initDriversStore() {
  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(buildSeedDrivers()));
    return;
  }

  if (!driversLoaded) {
    try {
      await seedDriversIfEmpty();
    } catch (error) {
      console.warn('[DriversStore] Failed to seed/load Firebase drivers. Using DEFAULT_DRIVERS fallback.', error);
      refreshDriversCache(mapFirebaseDrivers(buildSeedDrivers()));
    }
  }

  if (!driversSubscribed) {
    driversSubscribed = true;
    subscribeFirebasePath(DRIVERS_PATH, snapshot => {
      refreshDriversCache(mapFirebaseDrivers(snapshot.val()));
    });
  }
}

export function getDrivers() {
  return drivers;
}

export function getActiveDrivers() {
  // Eligible = effective status Aktif (excludes Cuti/Sakit/Izin/Nonaktif/Arsip,
  // but a leave whose end has passed reads as Aktif right away).
  return drivers.filter(isDriverEligible);
}

export function getDriverById(id) {
  if (!id) return null;
  return drivers.find(driver => driver.id === id) || null;
}

export function findDriverByLegacyName(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  return drivers.find(driver => {
    if (driver.normalizedName === normalized) return true;
    if (normalizeName(driver.name) === normalized) return true;
    const legacyNames = Array.isArray(driver.legacyNames) ? driver.legacyNames : [];
    return legacyNames.some(item => normalizeName(item) === normalized);
  }) || null;
}

export function getDriverUserUsername(id) {
  return getDriverById(id)?.linkedUserUsername || '';
}

export function registerDriversChangeListener(callback) {
  onDriversChangeCallbacks.push(callback);
}

export function getActiveDriverNames() {
  return drivers.filter(isDriverEligible).map(d => d.name);
}

/* ── Status write helpers (v1.16.4.4) ────────────────────────────────
   Single place that derives the legacy mirrors (active/archived/inactiveAt/
   archivedAt) and the leave period from a chosen `status`, so every write
   path stays consistent. */
function sanitizeLeave(status, leave) {
  if (!isLeaveStatus(status)) return null;
  return {
    start: leave && leave.start ? String(leave.start).slice(0, 10) : '',
    end: leave && leave.end ? String(leave.end).slice(0, 10) : '',
    note: leave && leave.note ? String(leave.note).trim() : '',
  };
}

function statusFields(status, leave, existing, now) {
  const isActive = status === DRIVER_STATUS.ACTIVE;
  const isArchived = status === DRIVER_STATUS.ARSIP;
  return {
    status,
    active: isActive,
    archived: isArchived,
    leave: sanitizeLeave(status, leave),
    inactiveAt: isActive ? null : ((existing && existing.inactiveAt) || now),
    archivedAt: isArchived ? ((existing && existing.archivedAt) || now) : null,
    updatedAt: now,
  };
}

/** Apply a partial update to one driver — local cache when offline, Firebase
    merge otherwise (a `leave:null` field deletes the node, the intended reset). */
async function writeDriverUpdates(id, updates) {
  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(Object.fromEntries(
      drivers.map(d => [d.id, d.id === id ? { ...d, ...updates } : d])
    )));
    return;
  }
  await updateFirebaseData(DRIVERS_PATH + '/' + id, updates);
}

export async function createDriver({ name, phone, linkedUserUsername = '', status = DRIVER_STATUS.ACTIVE, leave = null }) {
  const trimName = String(name || '').trim();
  if (!trimName) throw new Error('Nama driver wajib diisi.');
  const trimPhone = String(phone || '').trim();
  if (!trimPhone) throw new Error('Nomor telepon wajib diisi.');

  const normalized = normalizeName(trimName);
  if (drivers.find(d => d.active !== false && normalizeName(d.name) === normalized)) {
    throw new Error('Driver aktif dengan nama ini sudah ada.');
  }

  let id = makeDriverId(trimName);
  let suffix = 0;
  while (drivers.find(d => d.id === id)) {
    suffix++;
    id = makeDriverId(trimName + suffix);
  }

  const now = new Date().toISOString();
  const maxOrder = drivers.reduce((m, d) => Math.max(m, Number(d.sortOrder) || 0), 0);
  const driver = {
    id,
    name: trimName,
    phone: trimPhone,
    linkedUserUsername: String(linkedUserUsername || '').trim(),
    normalizedName: normalized,
    sortOrder: maxOrder + 1,
    legacyNames: [trimName],
    createdAt: now,
    ...statusFields(status, leave, null, now),
  };

  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers({ ...Object.fromEntries(drivers.map(d => [d.id, d])), [id]: driver }));
    return driver;
  }
  await storeFirebaseData(DRIVERS_PATH + '/' + id, driver);
  return driver;
}

export async function updateDriver(id, { name, phone, linkedUserUsername, status, leave }) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');

  const trimName = String(name || '').trim();
  if (!trimName) throw new Error('Nama driver wajib diisi.');
  const trimPhone = String(phone || '').trim();
  if (!trimPhone) throw new Error('Nomor telepon wajib diisi.');

  const nextStatus = status || deriveStatus(existing);
  if (!VALID_SET_STATUSES.includes(nextStatus)) throw new Error('Status driver tidak valid.');
  if (isLeaveStatus(nextStatus)) {
    if (!leave || !leave.start || !leave.end) throw new Error('Tanggal mulai dan selesai wajib diisi untuk status cuti/sakit/izin.');
    if (String(leave.end) < String(leave.start)) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  }

  const normalized = normalizeName(trimName);
  if (drivers.find(d => d.id !== id && d.active !== false && normalizeName(d.name) === normalized)) {
    throw new Error('Driver aktif dengan nama ini sudah ada.');
  }

  const legacyNames = Array.isArray(existing.legacyNames) ? [...existing.legacyNames] : [existing.name];
  if (!legacyNames.includes(existing.name)) legacyNames.push(existing.name);

  const now = new Date().toISOString();
  const updates = {
    name: trimName,
    phone: trimPhone,
    linkedUserUsername: String(linkedUserUsername || '').trim(),
    normalizedName: normalized,
    legacyNames,
    ...statusFields(nextStatus, leave, existing, now),
  };

  await writeDriverUpdates(id, updates);
  return { ...existing, ...updates };
}

/**
 * Set a driver's availability status directly (quick card actions / leave).
 * Validates the status + leave period, syncs the legacy mirrors, and returns
 * { before, after, leave } so the caller can write an audit entry.
 */
export async function setDriverStatus(id, status, leave = null) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  if (!VALID_SET_STATUSES.includes(status)) throw new Error('Status driver tidak valid.');
  if (isLeaveStatus(status)) {
    if (!leave || !leave.start || !leave.end) throw new Error('Tanggal mulai dan selesai wajib diisi untuk status cuti/sakit/izin.');
    if (String(leave.end) < String(leave.start)) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  }
  const before = deriveStatus(existing);
  const now = new Date().toISOString();
  const fields = statusFields(status, leave, existing, now);
  await writeDriverUpdates(id, fields);
  return { before, after: status, leave: fields.leave };
}

/**
 * Auto-reactivation sweep: drivers whose leave `end` has passed return to Aktif.
 * Returns the affected drivers (pre-restore snapshots) so the caller can audit.
 * Idempotent — once restored they no longer match, so repeated calls are safe.
 */
export async function autoReactivateDueDrivers({ persist = false } = {}) {
  const today = todayISO();
  const due = drivers.filter(d => {
    const s = deriveStatus(d);
    return isLeaveStatus(s) && d.leave && d.leave.end && String(d.leave.end) < today;
  });
  if (!persist || due.length === 0) return due;
  const now = new Date().toISOString();
  for (const d of due) {
    await writeDriverUpdates(d.id, {
      status: DRIVER_STATUS.ACTIVE, active: true, archived: false,
      leave: null, inactiveAt: null, updatedAt: now,
    });
  }
  return due;
}

export async function deactivateDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  await writeDriverUpdates(id, { status: DRIVER_STATUS.NONAKTIF, active: false, leave: null, inactiveAt: now, updatedAt: now });
}

export async function reactivateDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  await writeDriverUpdates(id, { status: DRIVER_STATUS.ACTIVE, active: true, leave: null, inactiveAt: null, updatedAt: now });
}

export async function archiveDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  await writeDriverUpdates(id, { status: DRIVER_STATUS.ARSIP, archived: true, archivedAt: now, active: false, leave: null, inactiveAt: existing.inactiveAt || now, updatedAt: now });
}

export async function restoreDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  // Restored to Nonaktif (not auto-eligible) — matches the prior behaviour where
  // a restored driver stayed inactive until explicitly reactivated.
  await writeDriverUpdates(id, { status: DRIVER_STATUS.NONAKTIF, archived: false, archivedAt: null, active: false, inactiveAt: existing.inactiveAt || now, updatedAt: now });
}

export async function deleteDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  if (existing.archived !== true) throw new Error('Driver harus diarsipkan sebelum dapat dihapus permanen.');
  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(
      Object.fromEntries(drivers.filter(d => d.id !== id).map(d => [d.id, d]))
    ));
    return;
  }
  await storeFirebaseData(DRIVERS_PATH + '/' + id, null);
}

console.info('Drivers store module loaded');
