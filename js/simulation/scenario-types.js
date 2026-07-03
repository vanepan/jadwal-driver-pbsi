/* ============================================================
   SCENARIO-TYPES.JS — Scenario Simulation Engine (v1.19.8)

   The catalogue of operational assumptions an administrator can simulate. Each
   scenario is a TEMPORARY operational "what if" applied to a CLONED input — never
   production. A scenario knows how to describe itself and how to mutate the clone
   so the Prediction Service re-forecasts under the assumption.

   ── PURE MUTATIONS ON A CLONE ONLY ───────────────────────────────────────────
   No DOM, no Firebase, no randomness, no timers. Every `apply(input, params)`
   mutates ONLY the cloned input it is handed (produced by scenario-state
   cloneInput), touching only the vehicle fields the Prediction Engine reads
   (health.operational / utilization / registration.year / status / stnkStatus /
   taxStatus / insuranceStatus / health.documents). It writes nothing back to
   production and invents no prediction — the Prediction Service still does the
   forecasting.

   Scenario types (spec): Maintenance Delay · Maintenance Reschedule · Vehicle
   Replacement · Vehicle Deactivation · Administrative Renewal · Utilization
   Adjustment · New Vehicle.

   API (all pure):
     SCENARIOS               → frozen scenario definition list
     getScenario(key)        → definition (or null)
     listScenarios()         → definitions without the apply fn (UI-safe)
   ============================================================ */

'use strict';

import { findVehicle, clampPct, fleetMaxYear } from './scenario-state.js';

function isObj(v) { return v && typeof v === 'object'; }

/* Ensure a vehicle's nested containers exist so a mutation never throws on a
   sparsely-populated record. Operates on the CLONE only. */
function ensureHealth(v) { if (!isObj(v.health)) v.health = {}; return v.health; }
function ensureReg(v) { if (!isObj(v.registration)) v.registration = {}; return v.registration; }

/* Each scenario definition:
     key         stable id
     label       full executive label
     shortLabel  quick-start card label
     description one-line "what this assumes"
     icon        a VALID analytics-shell glyph
     scope       'vehicle' (needs a target) | 'fleet'
     tone        default accent tone for the card
     defaults()  base params (target id is injected by the engine)
     describe(params, name) → executive sentence for the impact summary
     apply(input, params)   → mutate the CLONE (never production)
*/

const SCENARIOS = Object.freeze([
  {
    key: 'maintenance-delay',
    label: 'Tunda Perawatan',
    shortLabel: 'Tunda Perawatan',
    description: 'Menunda perawatan yang diproyeksikan beberapa hari.',
    icon: 'tool-wrench', scope: 'vehicle', tone: 'warn',
    defaults: () => ({ days: 7 }),
    describe: (p, name) => `Perawatan ${name} ditunda ${Number(p.days) || 0} hari.`,
    apply: (input, p) => {
      const v = findVehicle(input, p.vehicleId);
      if (!v) return;
      const days = Math.max(0, Number(p.days) || 0);
      const h = ensureHealth(v);
      // Deferring maintenance degrades operational health and lets utilisation
      // pressure accumulate — the two signals the maintenance risk reads.
      if (typeof h.operational === 'number') h.operational = clampPct(h.operational - days);
      if (typeof v.utilization === 'number') v.utilization = clampPct(v.utilization + Math.round(days / 2));
    },
  },
  {
    key: 'maintenance-reschedule',
    label: 'Jadwalkan Ulang Perawatan',
    shortLabel: 'Percepat Perawatan',
    description: 'Menjadwalkan perawatan lebih awal (diselesaikan sekarang).',
    icon: 'tool-wrench', scope: 'vehicle', tone: 'ok',
    defaults: () => ({}),
    describe: (p, name) => `Perawatan ${name} dijadwalkan ulang lebih awal.`,
    apply: (input, p) => {
      const v = findVehicle(input, p.vehicleId);
      if (!v) return;
      const h = ensureHealth(v);
      // Completing maintenance restores operational health and returns the unit
      // to active service.
      h.operational = Math.max(clampPct(h.operational), 90);
      v.status = 'active';
    },
  },
  {
    key: 'vehicle-replacement',
    label: 'Ganti Kendaraan',
    shortLabel: 'Ganti Kendaraan',
    description: 'Mengganti kendaraan berisiko dengan unit yang lebih baru.',
    icon: 'vehicle-car', scope: 'vehicle', tone: 'info',
    defaults: () => ({}),
    describe: (p, name) => `${name} diganti dengan unit pengganti yang lebih baru.`,
    apply: (input, p) => {
      const v = findVehicle(input, p.vehicleId);
      if (!v) return;
      const h = ensureHealth(v);
      const reg = ensureReg(v);
      h.operational = 95; h.documents = 100; h.legal = 98; h.overall = 95;
      v.status = 'active';
      v.taxStatus = 'paid'; v.stnkStatus = 'valid'; v.insuranceStatus = 'valid';
      v.utilization = 45;
      const y = fleetMaxYear(input);
      if (Number.isFinite(y)) reg.year = y;
    },
  },
  {
    key: 'vehicle-deactivation',
    label: 'Nonaktifkan Kendaraan',
    shortLabel: 'Nonaktifkan Unit',
    description: 'Menonaktifkan kendaraan sementara (tidak tersedia).',
    icon: 'alert', scope: 'vehicle', tone: 'danger',
    defaults: () => ({}),
    describe: (p, name) => `${name} dinonaktifkan sementara.`,
    apply: (input, p) => {
      const v = findVehicle(input, p.vehicleId);
      if (v) v.status = 'inactive';
    },
  },
  {
    key: 'administrative-renewal',
    label: 'Perbarui Dokumen',
    shortLabel: 'Perbarui Dokumen',
    description: 'Memperbarui STNK, pajak, dan asuransi.',
    icon: 'doc-shield', scope: 'vehicle', tone: 'ok',
    defaults: () => ({}),
    describe: (p, name) => `Dokumen legal ${name} diperbarui.`,
    apply: (input, p) => {
      const v = findVehicle(input, p.vehicleId);
      if (!v) return;
      v.stnkStatus = 'valid'; v.taxStatus = 'paid'; v.insuranceStatus = 'valid';
      ensureHealth(v).documents = 100;
    },
  },
  {
    key: 'utilization-adjustment',
    label: 'Sesuaikan Utilisasi',
    shortLabel: 'Naikkan Utilisasi',
    description: 'Menaikkan atau menurunkan utilisasi kendaraan.',
    icon: 'pulse', scope: 'vehicle', tone: 'warn',
    defaults: () => ({ deltaPct: 20 }),
    describe: (p, name) => {
      const d = Number(p.deltaPct) || 0;
      const who = p.vehicleId === 'all' ? 'seluruh armada' : name;
      return `Utilisasi ${who} ${d >= 0 ? 'dinaikkan' : 'diturunkan'} ${Math.abs(d)}%.`;
    },
    apply: (input, p) => {
      const d = Number(p.deltaPct) || 0;
      const targets = p.vehicleId === 'all'
        ? (Array.isArray(input.vehicles) ? input.vehicles : [])
        : [findVehicle(input, p.vehicleId)].filter(Boolean);
      for (const v of targets) {
        if (typeof v.utilization === 'number') v.utilization = clampPct(v.utilization + d);
        else v.utilization = clampPct(50 + d);
      }
    },
  },
  {
    key: 'new-vehicle',
    label: 'Tambah Kendaraan Baru',
    shortLabel: 'Aktifkan Unit Cadangan',
    description: 'Menambahkan kendaraan cadangan yang siap operasi.',
    icon: 'vehicle-car', scope: 'fleet', tone: 'info',
    defaults: () => ({ name: 'Unit Cadangan (Simulasi)' }),
    describe: (p) => `Menambahkan ${p.name || 'kendaraan baru'} ke armada.`,
    apply: (input, p) => {
      if (!Array.isArray(input.vehicles)) input.vehicles = [];
      const y = fleetMaxYear(input);
      input.vehicles.push({
        id: 'sim-new-vehicle',
        name: p.name || 'Unit Cadangan (Simulasi)',
        status: 'active', type: 'mobil',
        registration: { year: Number.isFinite(y) ? y : undefined },
        health: { operational: 92, legal: 96, documents: 98, overall: 94 },
        taxStatus: 'paid', stnkStatus: 'valid', insuranceStatus: 'valid',
        utilization: 40,
      });
    },
  },
]);

const BY_KEY = Object.freeze(SCENARIOS.reduce((m, s) => { m[s.key] = s; return m; }, {}));

export { SCENARIOS };
export function getScenario(key) { return BY_KEY[key] || null; }

/** UI-safe scenario list (definition metadata without the apply function). */
export function listScenarios() {
  return SCENARIOS.map((s) => Object.freeze({
    key: s.key, label: s.label, shortLabel: s.shortLabel,
    description: s.description, icon: s.icon, scope: s.scope, tone: s.tone,
    defaults: s.defaults(),
  }));
}

export default { SCENARIOS, getScenario, listScenarios };
