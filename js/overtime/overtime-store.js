/* ============================================================
   OVERTIME-STORE.JS — Realtime data layer (RTDB)

   The Sarpras Operations platform persists everything in Firebase
   Realtime Database (see js/firebase.js). Overtime Management's
   "collections" are modelled as top-level RTDB nodes keyed by id,
   following the exact convention established by
   js/petty-cash/petty-cash-store.js:

     overtimeUnits/{id}          overtimeEmployees/{id}
     overtimeRateVersions/{id}
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
  updateFirebaseData,
  subscribeFirebasePath,
} from '../firebase.js';
import { SEED_UNITS } from './overtime-config.js';
import { RATE_TIERS } from './overtime-rate-engine.js';

const PATH = {
  units: 'overtimeUnits',
  employees: 'overtimeEmployees',
  rateVersions: 'overtimeRateVersions',
  holidays: 'overtimeHolidays',
  records: 'overtimeRecords',
  dailySummary: 'overtimeDailySummary',
  monthlySummary: 'overtimeMonthlySummary',
  audit: 'overtimeAudit',
  budget: 'overtimeBudget',
  reportHistory: 'overtimeReportHistory',
  closing: 'overtimeClosing',
  archive: 'overtimeArchive',
};

/* ── In-memory cache (maps keyed by id) ──────────────────────────── */
const cache = {
  units: {},
  employees: {},
  rateVersions: {},
  holidays: {},
  records: {},
  dailySummary: {},
  monthlySummary: {},
  audit: {},
  budget: {},
  reportHistory: {},
  closing: {},
  archive: {},
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

  const versionsRead = await readNode(PATH.rateVersions);
  if (!versionsRead || typeof versionsRead !== 'object' || versionsRead.status !== 'ok') {
    const status = versionsRead && typeof versionsRead === 'object' ? versionsRead.status : 'unknown';
    const code = versionsRead && typeof versionsRead === 'object' ? versionsRead.code : '';
    throw new Error(`[Overtime] readNode failed (${status}${code ? `:${code}` : ''})`);
  }
  const rawVersions = versionsRead.value;
  if (!rawVersions || Object.keys(rawVersions).length === 0) {
    const now = Date.now();
    const today = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const SEED_AMOUNTS = { normal: 100000, nationalHoliday: 150000, specialEvent: 200000 };
    const versionMap = {};
    RATE_TIERS.forEach(t => {
      const vid = genId('rv');
      versionMap[vid] = {
        id: vid, tierKey: t.key, amount: SEED_AMOUNTS[t.key] || 0,
        effectiveFrom: today, note: 'Tarif awal (seed)', isActive: true,
        createdAt: now, createdBy: null, updatedAt: now, updatedBy: null,
      };
    });
    await storeFirebaseData(PATH.rateVersions, versionMap);
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
    if (Object.keys(cache.rateVersions).length === 0) {
      const now = Date.now();
      const today = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const SEED_AMOUNTS = { normal: 100000, nationalHoliday: 150000, specialEvent: 200000 };
      RATE_TIERS.forEach(t => {
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
    subscribeFirebasePath(PATH.rateVersions, snap => { cache.rateVersions = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.holidays, snap => { cache.holidays = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.records, snap => { cache.records = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.dailySummary, snap => { cache.dailySummary = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.monthlySummary, snap => { cache.monthlySummary = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.audit, snap => { cache.audit = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.budget, snap => { cache.budget = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.reportHistory, snap => { cache.reportHistory = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.closing, snap => { cache.closing = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.archive, snap => { cache.archive = snap.val() || {}; notify(); });
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
export function getRateVersions() { return mapToArray(cache.rateVersions); }
export function getHolidays() { return mapToArray(cache.holidays); }
export function getRecords() { return mapToArray(cache.records); }
export function getDailySummary(dateISO) { return cache.dailySummary[dateISO] ? { ...cache.dailySummary[dateISO] } : null; }
export function getMonthlySummary(yyyyMM) { return cache.monthlySummary[yyyyMM] ? { ...cache.monthlySummary[yyyyMM] } : null; }
/** Full { [dateISO]: summary } / { [yyyy-mm]: summary } maps — Analytics
    (Sprint 7) buckets/ranges over these, never over raw overtimeRecords. */
export function getAllDailySummaries() { return { ...cache.dailySummary }; }
export function getAllMonthlySummaries() { return { ...cache.monthlySummary }; }
export function getAudit() { return mapToArray(cache.audit); }
export function getBudget() { return cache.budget.default ? { ...cache.budget.default } : null; }
/** Report generation metadata only (Sprint 8) — mirrors export-history.js's
    convention: never the PDF/blob itself, "re-download" = regenerate. */
export function getReportHistory() {
  return mapToArray(cache.reportHistory).sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));
}
/** Monthly Closing lock state (Sprint 9) — one entry per yyyy-mm, global
    across all units (confirmed product decision, Sprint 9). */
export function getClosing(yyyyMM) { return cache.closing[yyyyMM] ? { ...cache.closing[yyyyMM] } : null; }
export function getAllClosings() {
  return mapToArray(cache.closing).sort((a, b) => String(b.yyyyMM || '').localeCompare(String(a.yyyyMM || '')));
}
/** Frozen monthly archive snapshot — latest version per month (see header
    comment in overtime-service.js's closeMonth() for the versioning design). */
export function getArchive(yyyyMM) { return cache.archive[yyyyMM] ? { ...cache.archive[yyyyMM] } : null; }
export function getAllArchives() {
  return mapToArray(cache.archive).sort((a, b) => String(b.yyyyMM || '').localeCompare(String(a.yyyyMM || '')));
}

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

export async function putHoliday(holiday) {
  if (!isFirebaseConfigured()) { localWrite('holidays', holiday.id, holiday); return; }
  await storeFirebaseData(`${PATH.holidays}/${holiday.id}`, holiday);
}

export async function putAudit(entry) {
  if (!isFirebaseConfigured()) { localWrite('audit', entry.id, entry); return; }
  await storeFirebaseData(`${PATH.audit}/${entry.id}`, entry);
}

export async function putBudget(budget) {
  if (!isFirebaseConfigured()) { localWrite('budget', 'default', budget); return; }
  await storeFirebaseData(`${PATH.budget}/default`, budget);
}

export async function putReportHistoryEntry(entry) {
  if (!isFirebaseConfigured()) { localWrite('reportHistory', entry.id, entry); return; }
  await storeFirebaseData(`${PATH.reportHistory}/${entry.id}`, entry);
}

/* ── Atomic multi-node writes (Daily Entry batch save) ──────────────
   Mirrors petty-cash-store.js's applyUpdates(): `updates` is a flat map of
   "node/id" → value (Firebase fan-out shape), e.g.
   { "overtimeRecords/rec_1": {...}, "overtimeDailySummary/2026-07-16": {...},
     "overtimeAudit/audit_1": {...} }. Applied to the in-memory cache
   OPTIMISTICALLY first (so every live view reflects the mutation in the same
   tick, independent of when the realtime echo arrives — same runtime-sync
   fix petty-cash-store.js documents), then persisted as a single Firebase
   multi-path update so a batch of N employee records + the daily/monthly
   summary + one audit entry commit atomically — never partially. */
const NODE_TO_CACHE_KEY = Object.fromEntries(Object.entries(PATH).map(([k, v]) => [v, k]));
function applyUpdatesToCache(updates) {
  Object.keys(updates).forEach(p => {
    const parts = p.split('/');
    const cacheKey = NODE_TO_CACHE_KEY[parts[0]];
    if (!cacheKey || !cache[cacheKey]) return;
    const id = parts[1];
    if (updates[p] === null) delete cache[cacheKey][id]; else cache[cacheKey][id] = updates[p];
  });
}
export async function applyOvertimeUpdates(updates) {
  applyUpdatesToCache(updates);
  notify();
  if (!isFirebaseConfigured()) return;
  await updateFirebaseData('/', updates);
}

export const OVERTIME_PATHS = PATH;
