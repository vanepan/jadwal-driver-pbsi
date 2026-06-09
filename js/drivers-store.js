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
  return drivers.filter(driver => driver.active !== false && driver.archived !== true);
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
  return drivers
    .filter(d => d.active !== false && d.archived !== true)
    .map(d => d.name);
}

export async function createDriver({ name, phone, linkedUserUsername = '', active = true }) {
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
    active: Boolean(active),
    linkedUserUsername: String(linkedUserUsername || '').trim(),
    normalizedName: normalized,
    sortOrder: maxOrder + 1,
    legacyNames: [trimName],
    inactiveAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers({ ...Object.fromEntries(drivers.map(d => [d.id, d])), [id]: driver }));
    return driver;
  }
  await storeFirebaseData(DRIVERS_PATH + '/' + id, driver);
  return driver;
}

export async function updateDriver(id, { name, phone, linkedUserUsername, active }) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');

  const trimName = String(name || '').trim();
  if (!trimName) throw new Error('Nama driver wajib diisi.');
  const trimPhone = String(phone || '').trim();
  if (!trimPhone) throw new Error('Nomor telepon wajib diisi.');

  const normalized = normalizeName(trimName);
  if (drivers.find(d => d.id !== id && d.active !== false && normalizeName(d.name) === normalized)) {
    throw new Error('Driver aktif dengan nama ini sudah ada.');
  }

  const legacyNames = Array.isArray(existing.legacyNames) ? [...existing.legacyNames] : [existing.name];
  if (!legacyNames.includes(existing.name)) legacyNames.push(existing.name);

  const now = new Date().toISOString();
  const isNowActive = active !== false;
  const wasActive = existing.active !== false;

  const updates = {
    name: trimName,
    phone: trimPhone,
    active: isNowActive,
    linkedUserUsername: String(linkedUserUsername || '').trim(),
    normalizedName: normalized,
    legacyNames,
    inactiveAt: isNowActive ? null : (wasActive ? now : (existing.inactiveAt || now)),
    updatedAt: now,
  };

  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(Object.fromEntries(
      drivers.map(d => [d.id, d.id === id ? { ...d, ...updates } : d])
    )));
    return { ...existing, ...updates };
  }
  await updateFirebaseData(DRIVERS_PATH + '/' + id, updates);
  return { ...existing, ...updates };
}

export async function deactivateDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { active: false, inactiveAt: now, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(Object.fromEntries(
      drivers.map(d => [d.id, d.id === id ? { ...d, ...updates } : d])
    )));
    return;
  }
  await updateFirebaseData(DRIVERS_PATH + '/' + id, updates);
}

export async function reactivateDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { active: true, inactiveAt: null, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(Object.fromEntries(
      drivers.map(d => [d.id, d.id === id ? { ...d, ...updates } : d])
    )));
    return;
  }
  await updateFirebaseData(DRIVERS_PATH + '/' + id, updates);
}

export async function archiveDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { archived: true, archivedAt: now, active: false, inactiveAt: existing.inactiveAt || now, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(Object.fromEntries(
      drivers.map(d => [d.id, d.id === id ? { ...d, ...updates } : d])
    )));
    return;
  }
  await updateFirebaseData(DRIVERS_PATH + '/' + id, updates);
}

export async function restoreDriver(id) {
  const existing = drivers.find(d => d.id === id);
  if (!existing) throw new Error('Driver tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { archived: false, archivedAt: null, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshDriversCache(mapFirebaseDrivers(Object.fromEntries(
      drivers.map(d => [d.id, d.id === id ? { ...d, ...updates } : d])
    )));
    return;
  }
  await updateFirebaseData(DRIVERS_PATH + '/' + id, updates);
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
