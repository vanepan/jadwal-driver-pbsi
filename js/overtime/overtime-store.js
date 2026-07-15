/* ============================================================
   OVERTIME-STORE.JS — Realtime data layer (RTDB)

   The Sarpras Operations platform persists everything in Firebase
   Realtime Database (see js/firebase.js). Overtime Management's
   "collections" are modelled as top-level RTDB nodes keyed by id,
   following the exact convention established by
   js/petty-cash/petty-cash-store.js:

     overtimeUnits/{id}          overtimeEmployees/{id}
     overtimeRates/{tierKey}     overtimeRateVersions/{id}
     overtimeAudit/{id}          (global audit trail)

   This module owns subscriptions, the in-memory cache, id
   generation, and primitive CRUD. Domain orchestration (validation,
   audit semantics) lives in overtime-service.js.

   v1.25.2 — Domain Model Correction #2: Unit is a flat employee
   category, no Department relation (see overtime-config.js header).
   Sprint 2 adds Employee (the module's PRIMARY master data). Sprint 3
   adds the Rate Engine's two nodes.

   Sprint 1 (v1.25.0) — Module Skeleton + Unit Management. Later
   sprints extend PATH/cache with holidays, records, monthly summaries
   — never a second store module.
   ============================================================ */

'use strict';

import {
  isFirebaseConfigured,
  readNode,
  storeFirebaseData,
  subscribeFirebasePath,
} from '../firebase.js';
import { SEED_UNITS } from './overtime-config.js';
import { RATE_TIERS } from './overtime-rate-engine.js';

const PATH = {
  units: 'overtimeUnits',
  employees: 'overtimeEmployees',
  rates: 'overtimeRates',
  rateVersions: 'overtimeRateVersions',
  audit: 'overtimeAudit',
};

/* ── In-memory cache (maps keyed by id) ──────────────────────────── */
const cache = {
  units: {},
  employees: {},
  rates: {},
  rateVersions: {},
  audit: {},
};

let initialized = false;
let subscribed = false;
const changeListeners = [];

/** Convert a RTDB map → array; null-safe. */
function mapToArray(map) {
  return map ? Object.keys(map).map(k => map[k]).filter(Boolean) : [];
}

function notify() {
  changeListeners.forEach(cb => { try { cb(); } catch (e) { console.error('[Overtime] listener error', e); } });
}

/** Generate a stable, sortable id (time-ordered + random suffix). */
export function genId(prefix) {
  return `${prefix || 'ot'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Seeding ─────────────────────────────────────────────────────
   On first run, seed:
   - the 6 named units (Daily Entry, later sprints, needs a coherent
     starting state)
   - the 3 rate tiers' illustrative first version (Normal/National
     Holiday/Special Event — spec-illustrative amounts, editable from
     day one via the Rates screen; NEVER re-read after seeding)
   Idempotent — each seed only runs when its own node is empty, so a
   partially-seeded DB (e.g. units already exist, rates don't yet)
   still gets rates seeded on the next init. */
async function seedIfEmpty() {
  const unitsRead = await readNode(PATH.units);
  if (!unitsRead || typeof unitsRead !== 'object' || unitsRead.status !== 'ok') {
    const status = unitsRead && typeof unitsRead === 'object' ? unitsRead.status : 'unknown';
    const code = unitsRead && typeof unitsRead === 'object' ? unitsRead.code : '';
    throw new Error(`[Overtime] readNode failed (${status}${code ? `:${code}` : ''})`);
  }
  const rawUnits = unitsRead.value;
  if (!rawUnits || Object.keys(rawUnits).length === 0) {
    const now = Date.now();
    const seedMap = {};
    SEED_UNITS.forEach((name, i) => {
      const id = genId('unit');
      seedMap[id] = { id, name, isActive: true, sortOrder: i, createdAt: now, updatedAt: now };
    });
    await storeFirebaseData(PATH.units, seedMap);
    cache.units = seedMap;
  }

  const ratesRead = await readNode(PATH.rates);
  if (!ratesRead || typeof ratesRead !== 'object' || ratesRead.status !== 'ok') {
    const status = ratesRead && typeof ratesRead === 'object' ? ratesRead.status : 'unknown';
    const code = ratesRead && typeof ratesRead === 'object' ? ratesRead.code : '';
    throw new Error(`[Overtime] readNode failed (${status}${code ? `:${code}` : ''})`);
  }
  const rawRates = ratesRead.value;
  if (!rawRates || Object.keys(rawRates).length === 0) {
    const now = Date.now();
    const today = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const SEED_AMOUNTS = { normal: 100000, nationalHoliday: 150000, specialEvent: 200000 };
    const rateMap = {};
    const versionMap = {};
    RATE_TIERS.forEach(t => {
      rateMap[t.key] = { tierKey: t.key, label: t.label };
      const vid = genId('rv');
      versionMap[vid] = {
        id: vid, tierKey: t.key, amount: SEED_AMOUNTS[t.key] || 0,
        effectiveFrom: today, note: 'Tarif awal (seed)', isActive: true,
        createdAt: now, createdBy: null, updatedAt: now, updatedBy: null,
      };
    });
    await storeFirebaseData(PATH.rates, rateMap);
    await storeFirebaseData(PATH.rateVersions, versionMap);
    cache.rates = rateMap;
    cache.rateVersions = versionMap;
  }
}

/** Initialize the store: seed (once) then attach realtime subscriptions. */
export async function initOvertimeStore() {
  if (!isFirebaseConfigured()) {
    // Offline / unconfigured: operate on in-memory defaults so the UI still renders.
    if (Object.keys(cache.units).length === 0) {
      const now = Date.now();
      SEED_UNITS.forEach((name, i) => {
        const id = genId('unit');
        cache.units[id] = { id, name, isActive: true, sortOrder: i, createdAt: now, updatedAt: now };
      });
    }
    if (Object.keys(cache.rates).length === 0) {
      const now = Date.now();
      const today = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const SEED_AMOUNTS = { normal: 100000, nationalHoliday: 150000, specialEvent: 200000 };
      RATE_TIERS.forEach(t => {
        cache.rates[t.key] = { tierKey: t.key, label: t.label };
        const vid = genId('rv');
        cache.rateVersions[vid] = {
          id: vid, tierKey: t.key, amount: SEED_AMOUNTS[t.key] || 0,
          effectiveFrom: today, note: 'Tarif awal (seed)', isActive: true,
          createdAt: now, createdBy: null, updatedAt: now, updatedBy: null,
        };
      });
    }
    initialized = true;
    notify();
    return;
  }

  if (!initialized) {
    try { await seedIfEmpty(); }
    catch (e) { console.warn('[Overtime] seed failed, continuing with defaults', e); }
    initialized = true;
  }

  if (!subscribed) {
    subscribed = true;
    subscribeFirebasePath(PATH.units, snap => { cache.units = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.employees, snap => { cache.employees = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.rates, snap => { cache.rates = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.rateVersions, snap => { cache.rateVersions = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.audit, snap => { cache.audit = snap.val() || {}; notify(); });
  }
  notify();
}

export function registerChangeListener(cb) { if (typeof cb === 'function') changeListeners.push(cb); }
export function isReady() { return initialized; }

/* ── Getters (return plain copies / arrays) ──────────────────────── */
export function getUnits() { return mapToArray(cache.units); }
export function getUnitById(id) { return cache.units[id] ? { ...cache.units[id] } : null; }
export function getEmployees() { return mapToArray(cache.employees); }
export function getEmployeeById(id) { return cache.employees[id] ? { ...cache.employees[id] } : null; }
export function getRates() { return mapToArray(cache.rates); }
export function getRateVersions() { return mapToArray(cache.rateVersions); }
export function getAudit() { return mapToArray(cache.audit); }

/* ── Primitive writes ────────────────────────────────────────────
   Writes go to Firebase; the subscription echoes them back into the
   cache and fires listeners. When Firebase is unconfigured we mutate
   the local cache directly so the UI stays responsive. */
function localWrite(node, id, value) {
  if (value === null) delete cache[node][id]; else cache[node][id] = value;
  notify();
}

export async function putUnit(unit) {
  if (!isFirebaseConfigured()) { localWrite('units', unit.id, unit); return; }
  await storeFirebaseData(`${PATH.units}/${unit.id}`, unit);
}

export async function putEmployee(employee) {
  if (!isFirebaseConfigured()) { localWrite('employees', employee.id, employee); return; }
  await storeFirebaseData(`${PATH.employees}/${employee.id}`, employee);
}

export async function putRateVersion(version) {
  if (!isFirebaseConfigured()) { localWrite('rateVersions', version.id, version); return; }
  await storeFirebaseData(`${PATH.rateVersions}/${version.id}`, version);
}

export async function putAudit(entry) {
  if (!isFirebaseConfigured()) { localWrite('audit', entry.id, entry); return; }
  await storeFirebaseData(`${PATH.audit}/${entry.id}`, entry);
}

export const OVERTIME_PATHS = PATH;
