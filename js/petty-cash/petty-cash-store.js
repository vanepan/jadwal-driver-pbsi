/* ============================================================
   PETTY-CASH-STORE.JS — Realtime data layer (RTDB)

   The Sarpras Operations platform persists everything in Firebase
   Realtime Database (see js/firebase.js). To stay consistent with
   that architecture, the four Petty Cash "collections" are modelled
   as top-level RTDB nodes keyed by id:

     pettyCashExpenses/{id}   pettyCashNors/{id}
     pettyCashCycles/{id}     pettyCashSettings   (single object)
     pettyCashAudit/{id}      (global audit trail)

   Schemas follow the v1.13.0 specification exactly. This module owns
   subscriptions, the in-memory cache, id generation, and primitive
   CRUD. Domain orchestration (NOR generation, cycle rollover, audit
   semantics) lives in petty-cash-service.js.
   ============================================================ */

'use strict';

import {
  isFirebaseConfigured,
  fetchFirebaseData,
  storeFirebaseData,
  updateFirebaseData,
  subscribeFirebasePath,
} from '../firebase.js';
import { DEFAULT_SETTINGS, CYCLE_STATUS, todayISO } from './petty-cash-config.js';

const PATH = {
  expenses: 'pettyCashExpenses',
  nors: 'pettyCashNors',
  cycles: 'pettyCashCycles',
  settings: 'pettyCashSettings',
  audit: 'pettyCashAudit',
};

/* ── In-memory cache (maps keyed by id; settings is a plain object) ── */
const cache = {
  expenses: {},
  nors: {},
  cycles: {},
  settings: { ...DEFAULT_SETTINGS },
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
  changeListeners.forEach(cb => { try { cb(); } catch (e) { console.error('[PettyCash] listener error', e); } });
}

/** Generate a stable, sortable id (time-ordered + random suffix). */
export function genId(prefix) {
  return `${prefix || 'pc'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Seeding ─────────────────────────────────────────────────────
   On first run, write canonical settings and open cycle #1 so the
   dashboard has a coherent starting state. */
async function seedIfEmpty() {
  const rawSettings = await fetchFirebaseData(PATH.settings);
  if (!rawSettings || typeof rawSettings !== 'object') {
    await storeFirebaseData(PATH.settings, DEFAULT_SETTINGS);
    cache.settings = { ...DEFAULT_SETTINGS };
  }

  const rawCycles = await fetchFirebaseData(PATH.cycles);
  const hasCycle = rawCycles && Object.keys(rawCycles).length > 0;
  if (!hasCycle) {
    const opening = (cache.settings && cache.settings.openingBalance) || DEFAULT_SETTINGS.openingBalance;
    const id = genId('cycle');
    const cycle = {
      id,
      cycleNumber: 1,
      startDate: todayISO(),
      endDate: null,
      openingBalance: opening,
      realizedAmount: 0,
      closingBalance: opening,
      status: CYCLE_STATUS.ACTIVE,
      createdAt: Date.now(),
    };
    await storeFirebaseData(`${PATH.cycles}/${id}`, cycle);
    cache.cycles[id] = cycle;
  }
}

/** Initialize the store: seed (once) then attach realtime subscriptions. */
export async function initPettyCashStore() {
  if (!isFirebaseConfigured()) {
    // Offline / unconfigured: operate on in-memory defaults so the UI still renders.
    cache.settings = { ...DEFAULT_SETTINGS };
    if (Object.keys(cache.cycles).length === 0) {
      const id = genId('cycle');
      cache.cycles[id] = {
        id, cycleNumber: 1, startDate: todayISO(), endDate: null,
        openingBalance: DEFAULT_SETTINGS.openingBalance, realizedAmount: 0,
        closingBalance: DEFAULT_SETTINGS.openingBalance, status: CYCLE_STATUS.ACTIVE, createdAt: Date.now(),
      };
    }
    initialized = true;
    notify();
    return;
  }

  if (!initialized) {
    try { await seedIfEmpty(); }
    catch (e) { console.warn('[PettyCash] seed failed, continuing with defaults', e); }
    initialized = true;
  }

  if (!subscribed) {
    subscribed = true;
    subscribeFirebasePath(PATH.expenses, snap => { cache.expenses = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.nors, snap => { cache.nors = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.cycles, snap => { cache.cycles = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.audit, snap => { cache.audit = snap.val() || {}; notify(); });
    subscribeFirebasePath(PATH.settings, snap => {
      const v = snap.val();
      cache.settings = v ? { ...DEFAULT_SETTINGS, ...v } : { ...DEFAULT_SETTINGS };
      // TEMP TRACE (v1.13.2.1) — remove after UAT. Proves load reads the SAME path.
      console.info('[PettyCash] settings loaded ← read', PATH.settings, '· openingBalance =', cache.settings.openingBalance);
      notify();
    });
  }
  notify();
}

export function registerChangeListener(cb) { if (typeof cb === 'function') changeListeners.push(cb); }
export function isReady() { return initialized; }

/* ── Getters (return plain copies / arrays) ──────────────────────── */
export function getExpenses() { return mapToArray(cache.expenses); }
export function getNors() { return mapToArray(cache.nors); }
export function getCycles() { return mapToArray(cache.cycles); }
export function getAudit() { return mapToArray(cache.audit); }
export function getSettings() { return { ...DEFAULT_SETTINGS, ...(cache.settings || {}) }; }

export function getExpenseById(id) { return cache.expenses[id] ? { ...cache.expenses[id] } : null; }
export function getNorById(id) { return cache.nors[id] ? { ...cache.nors[id] } : null; }
export function getNorByNumber(num) { return getNors().find(n => n.norNumber === num) || null; }

/** The single active cycle (or the most recent one). */
export function getActiveCycle() {
  const cycles = getCycles();
  return cycles.find(c => c.status === CYCLE_STATUS.ACTIVE)
    || cycles.sort((a, b) => (b.cycleNumber || 0) - (a.cycleNumber || 0))[0]
    || null;
}

/* ── Primitive writes ────────────────────────────────────────────
   Writes go to Firebase; the subscription echoes them back into the
   cache and fires listeners. When Firebase is unconfigured we mutate
   the local cache directly so the UI stays responsive. */
function localWrite(node, id, value) {
  if (value === null) delete cache[node][id]; else cache[node][id] = value;
  notify();
}

export async function putExpense(expense) {
  if (!isFirebaseConfigured()) { localWrite('expenses', expense.id, expense); return; }
  await storeFirebaseData(`${PATH.expenses}/${expense.id}`, expense);
}
export async function deleteExpense(id) {
  if (!isFirebaseConfigured()) { localWrite('expenses', id, null); return; }
  await storeFirebaseData(`${PATH.expenses}/${id}`, null);
}
export async function putNor(nor) {
  if (!isFirebaseConfigured()) { localWrite('nors', nor.id, nor); return; }
  await storeFirebaseData(`${PATH.nors}/${nor.id}`, nor);
}
export async function putCycle(cycle) {
  if (!isFirebaseConfigured()) { localWrite('cycles', cycle.id, cycle); return; }
  await storeFirebaseData(`${PATH.cycles}/${cycle.id}`, cycle);
}
export async function putAudit(entry) {
  if (!isFirebaseConfigured()) { localWrite('audit', entry.id, entry); return; }
  await storeFirebaseData(`${PATH.audit}/${entry.id}`, entry);
}
export async function saveSettings(settings, cycle) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  // Apply locally first so state.settings updates immediately and a same-session
  // read returns exactly what was saved — independent of when the realtime echo
  // arrives. The subscription re-applies the identical payload shortly after.
  // When an active cycle's opening balance is synced too (v1.13.2.2 smart sync),
  // mirror it into the cache in the same tick so the dashboard KPI refreshes
  // immediately, and persist both nodes atomically.
  cache.settings = merged;
  if (cycle) cache.cycles[cycle.id] = cycle;
  notify();
  if (!isFirebaseConfigured()) return;
  // TEMP TRACE (v1.13.2.1) — remove after UAT. Proves the write target path.
  console.info('[PettyCash] saveSettings → write', PATH.settings, '· openingBalance =', merged.openingBalance, cycle ? `· synced cycle #${cycle.cycleNumber}` : '');
  const updates = { [PATH.settings]: merged };
  if (cycle) updates[`${PATH.cycles}/${cycle.id}`] = cycle;
  await updateFirebaseData('/', updates);
}

/**
 * Apply a flat multi-path update map into the in-memory cache. Keys mirror the
 * Firebase fan-out shape: "pettyCashNode/id" → full record (or null to delete),
 * and "pettyCashSettings" → settings object (merged). Pure cache mutation — no
 * notify, no I/O. Every real call site (NOR generate / archive / restore /
 * convert / replenish) uses the two-level "node/id" form, so a whole record is
 * always replaced — never a partial field path.
 */
function applyUpdatesToCache(updates) {
  Object.keys(updates).forEach(p => {
    const parts = p.split('/');
    const node = parts[0].replace('pettyCash', '').toLowerCase();
    if (node === 'settings') { cache.settings = { ...cache.settings, ...updates[p] }; return; }
    const id = parts[1];
    if (cache[node]) { if (updates[p] === null) delete cache[node][id]; else cache[node][id] = updates[p]; }
  });
}

/**
 * Apply many writes atomically across nodes via a single multi-path
 * update. `updates` is a flat map of "node/id" → value (Firebase fan-out).
 * Used by every NOR-lifecycle mutation (generate / archive / restore /
 * convert) and cycle rollover.
 *
 * RUNTIME-SYNC ROOT CAUSE (v1.15.0): the in-memory cache is updated LOCALLY
 * first, then notify() fires synchronously, so every live view (dashboard,
 * petty cash center, analytics) reflects the mutation in the SAME tick —
 * independent of when the realtime echo arrives. This mirrors saveSettings'
 * optimistic-write pattern (v1.13.2.2).
 *
 * Previously the Firebase-configured path only awaited the root-level update()
 * and relied solely on the onValue echo to refresh the cache. Unlike a direct
 * child set() (putExpense), a root multi-path update() did not reflect into the
 * in-session cache before the user observed the screen — so a NOR Official↔Test
 * conversion left analytics showing pre-conversion spending until a page reload
 * re-read the node from the server. Optimistic local apply fixes the live
 * runtime path at its source; the echo later re-applies an identical payload
 * (idempotent re-render).
 */
export async function applyUpdates(updates) {
  applyUpdatesToCache(updates);
  notify();
  if (!isFirebaseConfigured()) return;
  await updateFirebaseData('/', updates);
}

export const PETTY_CASH_PATHS = PATH;
