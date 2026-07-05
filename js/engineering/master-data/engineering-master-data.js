/* ============================================================
   ENGINEERING-MASTER-DATA.JS — Reusable master-data providers (v1.20.2)

   Engineering Operations' reusable reference datasets, exposed through ONE
   common provider interface so every current and future consumer reads from a
   single source: the create form today, and Machine Learning / Heatmap /
   Recommendation / Prediction / Preventive Maintenance / Room Mapping later.

   This sprint is ARCHITECTURE ONLY — no ML, no Firebase. Providers are pure and
   serializable. The location hierarchy (Gedung → Lantai → Ruangan) is seeded
   here as the master directory; a future sprint swaps the SEED for a Firebase
   adapter without changing the provider interface or any consumer.

   Provider interface (every provider implements it):
     { key, label, list(), get(id), has(id), labelOf(id) }
   The location provider additionally exposes the nested hierarchy accessors
   (buildings / floors / rooms), themselves plain list()-shaped providers.
   ============================================================ */

'use strict';

import { PRIORITY_DEFS } from '../config/engineering-config.js';
import { getEnabledCategories } from '../settings/engineering-settings.js';

/* ── generic provider factory ─────────────────────────────────────────────
   Wraps a record array ({ id, label, ... }) in the common read interface.
   `resolve` lets a provider stay live (e.g. categories come from settings). */
export function makeProvider(key, label, resolve) {
  const all = () => {
    const recs = typeof resolve === 'function' ? resolve() : resolve;
    return Array.isArray(recs) ? recs.slice() : [];
  };
  return Object.freeze({
    key,
    label,
    list: all,
    get: (id) => all().find((r) => r.id === id) || null,
    has: (id) => all().some((r) => r.id === id),
    labelOf: (id) => {
      const r = all().find((x) => x.id === id);
      return r ? r.label : (id || '');
    },
  });
}

/* ── Category / Priority (sourced from config + settings, never duplicated) ─ */
export const categoryProvider = makeProvider('category', 'Kategori',
  () => getEnabledCategories().map((c) => ({ id: c.id, label: c.label })));

export const priorityProvider = makeProvider('priority', 'Prioritas',
  () => PRIORITY_DEFS.map((p) => ({ id: p.id, label: p.label, weight: p.weight })));

/* ── Severity (impact level — a master-data domain concept, distinct from the
   scheduling Priority; both are exposed so future models can weigh them). */
export const SEVERITY_SEED = Object.freeze([
  { id: 'minor', label: 'Minor', weight: 1 },
  { id: 'moderate', label: 'Sedang', weight: 2 },
  { id: 'major', label: 'Berat', weight: 3 },
  { id: 'critical', label: 'Kritis', weight: 4 },
]);
export const severityProvider = makeProvider('severity', 'Severity', SEVERITY_SEED);

/* ── Equipment Type (asset taxonomy — seeds future preventive maintenance). */
export const EQUIPMENT_TYPE_SEED = Object.freeze([
  { id: 'ac', label: 'AC / Pendingin' },
  { id: 'panel-listrik', label: 'Panel Listrik' },
  { id: 'pompa', label: 'Pompa Air' },
  { id: 'genset', label: 'Genset' },
  { id: 'hydrant', label: 'Hydrant' },
  { id: 'cctv', label: 'CCTV' },
  { id: 'jaringan', label: 'Jaringan / WiFi' },
  { id: 'sound-system', label: 'Sound System' },
  { id: 'plumbing', label: 'Perpipaan' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'lift', label: 'Lift' },
  { id: 'other', label: 'Lainnya' },
]);
export const equipmentTypeProvider = makeProvider('equipmentType', 'Tipe Peralatan', EQUIPMENT_TYPE_SEED);

/* ── Location hierarchy: Gedung → Lantai → Ruangan ─────────────────────────
   The master directory. Rooms nest under floors, floors under buildings, so a
   future Room-Mapping / Heatmap consumer can resolve a room to its floor and
   building deterministically. Seeded now; Firebase-backed later. */
const genericFloor = (id, label, rooms) => ({ id, label, rooms: rooms.map((r, i) => ({ id: `${id}-r${i + 1}`, label: r })) });
export const LOCATION_SEED = Object.freeze([
  {
    id: 'gd-pusat', label: 'Gedung PBSI Pusat',
    floors: [
      genericFloor('gd-pusat-b1', 'Basement', ['Ruang Genset', 'Ruang Pompa', 'Gudang', 'Parkir Basement']),
      genericFloor('gd-pusat-l1', 'Lantai 1', ['Lobby', 'Resepsionis', 'Ruang Tamu', 'Koridor Lantai 1']),
      genericFloor('gd-pusat-l2', 'Lantai 2', ['Ruang Rapat A', 'Ruang Rapat B', 'Ruang Sekretariat', 'Pantry Lantai 2']),
      genericFloor('gd-pusat-l3', 'Lantai 3', ['Ruang Ketua Umum', 'Ruang Bidang', 'Ruang Arsip', 'Aula']),
    ],
  },
  {
    id: 'gor', label: 'GOR Bulutangkis',
    floors: [
      genericFloor('gor-l1', 'Lantai 1', ['Lapangan 1', 'Lapangan 2', 'Lapangan 3', 'Lapangan 4', 'Ruang Ganti', 'Ruang Wasit']),
      genericFloor('gor-l2', 'Lantai 2', ['Tribun', 'Ruang Operator Sound', 'Ruang Panel']),
    ],
  },
  {
    id: 'asrama', label: 'Asrama Atlet',
    floors: [
      genericFloor('asrama-l1', 'Lantai 1', ['Kamar 101', 'Kamar 102', 'Ruang Makan', 'Dapur']),
      genericFloor('asrama-l2', 'Lantai 2', ['Kamar 201', 'Kamar 202', 'Ruang Fisioterapi']),
      genericFloor('asrama-l3', 'Lantai 3', ['Kamar 301', 'Kamar 302', 'Ruang Cuci']),
    ],
  },
  {
    id: 'serbaguna', label: 'Gedung Serbaguna',
    floors: [
      genericFloor('serbaguna-l1', 'Lantai 1', ['Hall Utama', 'Ruang Ganti', 'Toilet', 'Ruang Panel']),
    ],
  },
]);

/** Buildings as a flat provider. */
export const buildingProvider = makeProvider('building', 'Gedung',
  () => LOCATION_SEED.map((b) => ({ id: b.id, label: b.label })));

/** Floors of a building (all floors when buildingId is null). */
export function floorsOf(buildingId) {
  const src = buildingId ? LOCATION_SEED.filter((b) => b.id === buildingId) : LOCATION_SEED;
  return src.flatMap((b) => b.floors.map((f) => ({ id: f.id, label: f.label, buildingId: b.id })));
}

/** Rooms of a floor (or all rooms of a building when floorId is null). */
export function roomsOf(buildingId, floorId) {
  const b = LOCATION_SEED.find((x) => x.id === buildingId);
  if (!b) return [];
  const floors = floorId ? b.floors.filter((f) => f.id === floorId) : b.floors;
  return floors.flatMap((f) => f.rooms.map((r) => ({ id: r.id, label: r.label, floorId: f.id, buildingId: b.id })));
}

/** Nested location provider — buildings + hierarchy accessors. */
export const locationProvider = Object.freeze({
  key: 'location',
  label: 'Lokasi',
  list: buildingProvider.list,
  get: buildingProvider.get,
  has: buildingProvider.has,
  labelOf: buildingProvider.labelOf,
  buildings: buildingProvider.list,
  floors: floorsOf,
  rooms: roomsOf,
});

/* ── Registry — the one place consumers discover every provider ──────────── */
export const MASTER_DATA_PROVIDERS = Object.freeze({
  category: categoryProvider,
  priority: priorityProvider,
  severity: severityProvider,
  equipmentType: equipmentTypeProvider,
  location: locationProvider,
});
