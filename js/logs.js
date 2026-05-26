'use strict';

import { fetchFirebaseData, subscribeFirebasePath, storeFirebaseData, isFirebaseConfigured } from './firebase.js';
import { generateId } from './utils.js';

const LOGS_PATH = 'logs';
let logs = [];
let logsLoaded = false;
let onLogsChangeCallback = null;

function mapFirebaseLogs(value) {
  const raw = value || {};
  return Object.keys(raw)
    .map(key => ({ id: key, ...raw[key] }))
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

function refreshLogsCache(nextLogs) {
  logs = nextLogs;
  logsLoaded = true;
  if (onLogsChangeCallback) onLogsChangeCallback(logs);
}

export async function getLogs() {
  if (logsLoaded) return logs;
  const raw = await fetchFirebaseData(LOGS_PATH);
  refreshLogsCache(mapFirebaseLogs(raw));
  return logs;
}

export async function logAction({ userId, username, action, targetId = '', metadata = {} }) {
  if (!isFirebaseConfigured()) return null;
  const id = generateId();
  const entry = {
    userId: userId || '',
    username: username || 'unknown',
    action,
    targetId: targetId || '',
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
  };

  try {
    await storeFirebaseData(`${LOGS_PATH}/${id}`, entry);
  } catch (error) {
    console.error('Failed to write log entry:', error);
  }

  return entry;
}

export function subscribeLogsChangeListener(callback) {
  onLogsChangeCallback = callback;
  if (!isFirebaseConfigured()) return;
  subscribeFirebasePath(LOGS_PATH, snapshot => {
    refreshLogsCache(mapFirebaseLogs(snapshot.val()));
  });
}
