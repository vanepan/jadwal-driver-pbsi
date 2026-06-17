/* ============================================================
   EXPORT-HISTORY.JS — metadata logging for every report export
   (v1.12.1B — Export Metadata Foundation).

   Records WHAT was exported, WHEN, BY WHOM, and WHETHER it
   succeeded — metadata only. It never stores the PDF, blob,
   base64, or any report content. Pairs with the export registry
   (export-registry.js) as the metadata layer beneath the planned
   Export Center, Export History screen, Report Archive, and
   Scheduled Exports.

   Persistence mirrors logs.js: a single Firebase RTDB collection
   (/analytics_exports) with one child per export. Read/subscribe
   helpers are provided so future UIs can list history without a
   schema migration.

   This module owns persistence only. It does NOT touch PDF
   rendering, Puppeteer, Chromium, analytics calculations, or
   report templates.
   ============================================================ */

'use strict';

import { readNode, subscribeNode, storeFirebaseData, isFirebaseConfigured } from '../firebase.js';
import { generateId } from '../utils.js';

const EXPORTS_PATH = 'analytics_exports';

/** Record status vocabulary. */
export const EXPORT_STATUS = { SUCCESS: 'success', FAILED: 'failed' };

// State machine — mirrors logs.js. LOADED/SUBSCRIBED only latch on a
// successful read; permission_denied never caches an empty list.
const LOAD = { UNLOADED: 'UNLOADED', LOADING: 'LOADING', LOADED: 'LOADED' };
const SUB = { IDLE: 'IDLE', SUBSCRIBING: 'SUBSCRIBING', SUBSCRIBED: 'SUBSCRIBED' };

let exportRecords = [];
let loadState = LOAD.UNLOADED;
let subState = SUB.IDLE;
let unsubscribe = null;
let onChangeCallback = null;

function mapFirebaseExports(value) {
  const raw = value || {};
  return Object.keys(raw)
    .map(key => ({ id: key, ...raw[key] }))
    .sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')));
}

function refreshCache(next) {
  exportRecords = next;
  loadState = LOAD.LOADED;
  if (onChangeCallback) onChangeCallback(exportRecords);
}

// Firebase rejects undefined values. Replace any undefined (recursively, one
// level into filters) with null — PBSI's convention for absent optional fields.
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return {};
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (v === undefined) return [k, null];
      if (v && typeof v === 'object' && !Array.isArray(v)) return [k, sanitize(v)];
      return [k, v];
    })
  );
}

/**
 * @typedef {Object} ExportContext
 * @property {string}  reportId      Registry id (driver | vehicle | bidang | complete).
 * @property {string}  reportTitle   Human label from the registry.
 * @property {string}  [periodLabel] e.g. "30 Hari Terakhir".
 * @property {string}  [dateRangeKey] raw range key (today|7d|30d|90d|all).
 * @property {Object}  [filters]     { driver, vehicle, bidang } labels.
 * @property {string}  [generatedBy] display name of the actor.
 * @property {string}  [userId]      actor id (for future per-user filtering).
 * @property {string}  [username]    actor username.
 * @property {string}  [appVersion]  app version at export time.
 * @property {number}  [durationMs]  wall-clock duration of the export.
 * @property {number}  [fileSize]    PDF size in bytes (success only).
 * @property {string}  [error]       error message (failure only).
 */

/**
 * Build the canonical persisted record. `status` is set by the caller; every
 * field has a defined default so the schema is stable across success/failure
 * and ready for the planned consumer screens without a migration.
 */
function buildRecord(ctx = {}, status, extra = {}) {
  return sanitize({
    // identity
    reportId:     ctx.reportId    || '',
    reportTitle:  ctx.reportTitle || '',
    // provenance
    generatedAt:  new Date().toISOString(),
    generatedBy:  ctx.generatedBy || '—',
    userId:       ctx.userId   || '',
    username:     ctx.username || '',
    // scope
    periodLabel:  ctx.periodLabel  || '',
    dateRangeKey: ctx.dateRangeKey || '',
    filters: {
      driver:  ctx.filters?.driver  || '',
      vehicle: ctx.filters?.vehicle || '',
      bidang:  ctx.filters?.bidang  || '',
    },
    // outcome
    status,
    fileSize:   extra.fileSize   ?? null,
    durationMs: extra.durationMs ?? null,
    error:      extra.error      ?? null,
    // environment
    appVersion: ctx.appVersion || '',
    // future-compat reserved fields (no migration needed when these light up):
    source:   ctx.source || 'manual',   // manual | scheduled (Scheduled Exports)
    archived: false,                     // Report Archive flag
  });
}

async function persist(record) {
  if (!isFirebaseConfigured()) return null;
  const id = generateId();
  try {
    await storeFirebaseData(`${EXPORTS_PATH}/${id}`, record);
  } catch (error) {
    console.error('[ExportHistory] Failed to write export record:', error);
    return null;
  }
  return { id, ...record };
}

/**
 * Log a successful export. Metadata only — never the PDF/blob.
 * @param {ExportContext} ctx
 * @param {{ fileSize?:number, durationMs?:number }} [outcome]
 * @returns {Promise<Object|null>} the persisted record (with id) or null.
 */
export function logExportSuccess(ctx = {}, outcome = {}) {
  return persist(buildRecord(ctx, EXPORT_STATUS.SUCCESS, {
    fileSize:   typeof outcome.fileSize === 'number' ? outcome.fileSize : null,
    durationMs: typeof outcome.durationMs === 'number' ? outcome.durationMs : null,
  }));
}

/**
 * Log a failed export, capturing the error message when available.
 * @param {ExportContext} ctx
 * @param {{ error?:(Error|string), durationMs?:number }} [outcome]
 * @returns {Promise<Object|null>} the persisted record (with id) or null.
 */
export function logExportFailure(ctx = {}, outcome = {}) {
  const err = outcome.error;
  const message = err instanceof Error ? err.message : (err ? String(err) : 'Unknown error');
  return persist(buildRecord(ctx, EXPORT_STATUS.FAILED, {
    durationMs: typeof outcome.durationMs === 'number' ? outcome.durationMs : null,
    error: message,
  }));
}

/* ── Read / subscribe (for Export Center & History screen) ────────────── */

/**
 * Idempotent, re-entrant load + realtime listener for /analytics_exports.
 * Call behind the authenticated-session gate (see loadAuthedAdminData).
 */
export async function ensureExportHistoryLoadedAndSubscribed() {
  if (!isFirebaseConfigured()) return;
  if (subState !== SUB.IDLE) return;
  subState = SUB.SUBSCRIBING;
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  unsubscribe = subscribeNode(
    EXPORTS_PATH,
    snapshot => {
      refreshCache(mapFirebaseExports(snapshot.val())); // sets LOADED
      subState = SUB.SUBSCRIBED;
    },
    {
      onDenied: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
      onError:  () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
    }
  );
}

/** Tear down on sign-out so a re-login reloads from a clean state. */
export function resetExportHistorySync() {
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  subState = SUB.IDLE;
  loadState = LOAD.UNLOADED;
  exportRecords = [];
}

/** Synchronous snapshot of the in-memory cache (newest-first). For render
 *  paths that build HTML synchronously; the realtime listener keeps it fresh. */
export function getExportHistoryCache() {
  return exportRecords;
}

/** Records newest-first; one-shot read if the realtime cache isn't warm yet. */
export async function getExportHistory() {
  if (loadState === LOAD.LOADED) return exportRecords;
  const res = await readNode(EXPORTS_PATH);
  if (res.status === 'ok') {
    refreshCache(mapFirebaseExports(res.value)); // latch LOADED only on success
  }
  return exportRecords;
}

/** Register the UI change callback (subscription itself attaches separately). */
export function subscribeExportHistoryChangeListener(callback) {
  onChangeCallback = callback;
}
