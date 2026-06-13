'use strict';

import { readNode, subscribeNode, storeFirebaseData, isFirebaseConfigured } from './firebase.js';
import { generateId } from './utils.js';

const LOGS_PATH = 'logs';

// State machines (v1.11.3.3) — mirror users.js. LOADED/SUBSCRIBED only on a
// successful read; permission_denied never latches an empty cache.
const LOAD = { UNLOADED: 'UNLOADED', LOADING: 'LOADING', LOADED: 'LOADED' };
const SUB = { IDLE: 'IDLE', SUBSCRIBING: 'SUBSCRIBING', SUBSCRIBED: 'SUBSCRIBED' };

let logs = [];
let loadState = LOAD.UNLOADED;
let subState = SUB.IDLE;
let unsubscribe = null;
let onLogsChangeCallback = null;

function mapFirebaseLogs(value) {
  const raw = value || {};
  return Object.keys(raw)
    .map(key => ({ id: key, ...raw[key] }))
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

function refreshLogsCache(nextLogs) {
  logs = nextLogs;
  loadState = LOAD.LOADED;
  if (onLogsChangeCallback) onLogsChangeCallback(logs);
}

/**
 * Idempotent, re-entrant: load + attach the realtime listener for /logs.
 * Driven by the auth-available signal (see app.js loadAuthedAdminData).
 */
export async function ensureLogsLoadedAndSubscribed() {
  if (!isFirebaseConfigured()) return;
  if (subState !== SUB.IDLE) return;
  subState = SUB.SUBSCRIBING;
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  unsubscribe = subscribeNode(
    LOGS_PATH,
    snapshot => {
      refreshLogsCache(mapFirebaseLogs(snapshot.val())); // sets LOADED
      subState = SUB.SUBSCRIBED;
    },
    {
      onDenied: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
      onError: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
    }
  );
}

/** Tear down on sign-out/expiry so a re-login reloads from a clean state. */
export function resetLogsSync() {
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  subState = SUB.IDLE;
  loadState = LOAD.UNLOADED;
  logs = [];
}

// Firebase rejects undefined values. Replace any undefined in the metadata
// object with null, which is PBSI's convention for absent optional fields.
function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return {};
  return Object.fromEntries(
    Object.entries(meta).map(([k, v]) => [k, v === undefined ? null : v])
  );
}

export async function getLogs() {
  if (loadState === LOAD.LOADED) return logs;
  const res = await readNode(LOGS_PATH);
  if (res.status === 'ok') {
    refreshLogsCache(mapFirebaseLogs(res.value)); // sets LOADED only on success
  }
  // denied/error → return current cache WITHOUT latching; next call retries.
  return logs;
}

export async function logAction({ userId, username, displayName = '', action, targetId = '', metadata = {} }) {
  if (!isFirebaseConfigured()) return null;
  const id = generateId();
  const entry = {
    userId:      userId || '',
    username:    username || 'unknown',
    displayName: displayName || username || 'unknown',
    action,
    targetId:    targetId || '',
    metadata:    sanitizeMetadata(metadata),
    timestamp:   new Date().toISOString(),
  };

  try {
    await storeFirebaseData(`${LOGS_PATH}/${id}`, entry);
  } catch (error) {
    console.error('Failed to write log entry:', error);
  }

  return entry;
}

// Registers the UI change callback only. The actual realtime subscription is
// attached by ensureLogsLoadedAndSubscribed() behind the authenticated-session
// gate — so it never attaches (and gets cancelled) while unauthenticated.
export function subscribeLogsChangeListener(callback) {
  onLogsChangeCallback = callback;
}
