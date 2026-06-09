'use strict';

import {
  fetchFirebaseData,
  isFirebaseConfigured,
  storeFirebaseData,
  subscribeFirebasePath,
  updateFirebaseData,
} from './firebase.js';

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
      active: true,
      createdAt: now,
      updatedAt: now,
      inactiveAt: null,
    };
    return map;
  }, {});
}

function refreshVehiclesCache(nextVehicles) {
  vehicles = nextVehicles;
  vehiclesLoaded = true;
  onVehiclesChangeCallbacks.forEach(cb => cb(vehicles));
}

async function seedVehiclesIfEmpty() {
  if (!isFirebaseConfigured()) return;

  const raw = await fetchFirebaseData(VEHICLES_PATH);
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

export async function createVehicle({ name, plateNumber, capacity, color, active = true }) {
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
  const vehicle = {
    id,
    name: trimName,
    plateNumber: trimPlate,
    capacity: cap,
    color: String(color || '#555555'),
    active: Boolean(active),
    createdAt: now,
    updatedAt: now,
    inactiveAt: null,
  };

  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles({
      ...Object.fromEntries(vehicles.map(v => [v.id, v])),
      [id]: vehicle,
    }));
    return vehicle;
  }
  await storeFirebaseData(VEHICLES_PATH + '/' + id, vehicle);
  return vehicle;
}

export async function updateVehicle(id, { name, plateNumber, capacity, color, active }) {
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
  const isNowActive = active !== false;
  const wasActive = existing.active !== false;

  const updates = {
    name: trimName,
    plateNumber: trimPlate,
    capacity: cap,
    color: String(color || '#555555'),
    active: isNowActive,
    inactiveAt: isNowActive ? null : (wasActive ? now : (existing.inactiveAt || now)),
    updatedAt: now,
  };

  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles(Object.fromEntries(
      vehicles.map(v => [v.id, v.id === id ? { ...v, ...updates } : v])
    )));
    return { ...existing, ...updates };
  }
  await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
  return { ...existing, ...updates };
}

export async function deactivateVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { active: false, inactiveAt: now, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles(Object.fromEntries(
      vehicles.map(v => [v.id, v.id === id ? { ...v, ...updates } : v])
    )));
    return;
  }
  await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
}

export async function reactivateVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { active: true, inactiveAt: null, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles(Object.fromEntries(
      vehicles.map(v => [v.id, v.id === id ? { ...v, ...updates } : v])
    )));
    return;
  }
  await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
}

export async function archiveVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { archived: true, archivedAt: now, active: false, inactiveAt: existing.inactiveAt || now, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles(Object.fromEntries(
      vehicles.map(v => [v.id, v.id === id ? { ...v, ...updates } : v])
    )));
    return;
  }
  await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
}

export async function restoreVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  const now = new Date().toISOString();
  const updates = { archived: false, archivedAt: null, updatedAt: now };
  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles(Object.fromEntries(
      vehicles.map(v => [v.id, v.id === id ? { ...v, ...updates } : v])
    )));
    return;
  }
  await updateFirebaseData(VEHICLES_PATH + '/' + id, updates);
}

export async function deleteVehicle(id) {
  const existing = vehicles.find(v => v.id === id);
  if (!existing) throw new Error('Kendaraan tidak ditemukan.');
  if (existing.archived !== true) throw new Error('Kendaraan harus diarsipkan sebelum dapat dihapus permanen.');
  if (!isFirebaseConfigured()) {
    refreshVehiclesCache(mapFirebaseVehicles(
      Object.fromEntries(vehicles.filter(v => v.id !== id).map(v => [v.id, v]))
    ));
    return;
  }
  await storeFirebaseData(VEHICLES_PATH + '/' + id, null);
}

console.info('Vehicles store module loaded');
