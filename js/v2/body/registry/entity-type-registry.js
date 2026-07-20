/* ============================================================
   ENTITY-TYPE-REGISTRY.JS — Body Intelligence (V2, Phase 12.5.1)

   PURPOSE: make `entityType` a registered vocabulary value, never a
   hardcoded enum baked into the repository or contract core — mirrors
   knowledge/registry/domain-type-registry.js exactly. Registering an
   entityType here does NOT imply a real sensor exists for it (see
   registry/sensor-registry.js) — this is vocabulary, not liveness.

   RESPONSIBILITY: register/list/check entityType ids and their labels.
   No entityType-specific behavior lives here.

   DEPENDENCIES: none.

   NON-GOALS: no sensor logic, no repository logic.

   FUTURE EVOLUTION: a real sensor for a currently-placeholder entityType
   is added by replacing its sensor's `sense` body (mirrors
   knowledge/connectors/nor-connector.js's precedent) — this registry does
   not change.
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string}>} */
const _entityTypes = new Map();

export function registerEntityType(id, label) {
  if (typeof id !== 'string' || !id) throw new Error('registerEntityType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerEntityType: label must be a non-empty string');
  _entityTypes.set(id, Object.freeze({ id, label }));
}

export function hasEntityType(id) {
  return _entityTypes.has(id);
}

export function getEntityType(id) {
  return _entityTypes.get(id) || null;
}

export function listEntityTypes() {
  return Object.freeze([..._entityTypes.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetEntityTypeRegistry() {
  _entityTypes.clear();
  bootstrap();
}

/* ── bootstrap: every entityType named in the Phase 12.5 brief — the 3
   pilot types (real sensors, Phase 12.5.3) plus the 16 the brief also
   named (placeholder sensors only, registry/sensor-registry.js). Entity
   VOCABULARY is registered for all 19 up front; only 3 have a real
   sensor. ──────────────────────────────────────────────────────────── */
function bootstrap() {
  // Pilot (real sensor, Phase 12.5.3)
  registerEntityType('vehicle', 'Kendaraan');
  registerEntityType('driver', 'Pengemudi');
  registerEntityType('assignment', 'Penugasan');
  // Placeholder (no real sensor yet — see sensors/placeholder-sensor.js)
  registerEntityType('building', 'Gedung');
  registerEntityType('room', 'Ruangan');
  registerEntityType('equipment', 'Peralatan');
  registerEntityType('budget', 'Anggaran');
  registerEntityType('nor', 'Nota Organisasi');
  registerEntityType('petty_cash', 'Kas Kecil');
  registerEntityType('employee', 'Pegawai');
  registerEntityType('vendor', 'Vendor');
  registerEntityType('inventory', 'Inventaris');
  registerEntityType('maintenance', 'Pemeliharaan');
  registerEntityType('knowledge', 'Pengetahuan');
  registerEntityType('policy', 'Kebijakan');
  registerEntityType('workflow', 'Alur Kerja');
  registerEntityType('approval', 'Persetujuan');
  registerEntityType('meeting', 'Rapat');
  registerEntityType('organization_unit', 'Unit Organisasi');
}

bootstrap();
