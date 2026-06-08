'use strict';

import {
  fetchFirebaseData,
  isFirebaseConfigured,
  storeFirebaseData,
  subscribeFirebasePath,
} from './firebase.js';
import { DEFAULT_DRIVERS } from './drivers.js';

const DRIVERS_PATH = 'drivers';

let drivers = [];
let driversLoaded = false;
let driversSubscribed = false;

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
  return drivers.filter(driver => driver.active !== false);
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

console.info('Drivers store module loaded');
