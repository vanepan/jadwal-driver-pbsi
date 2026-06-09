'use strict';

import {
  fetchFirebaseData,
  isFirebaseConfigured,
  storeFirebaseData,
  subscribeFirebasePath,
  updateFirebaseData,
} from './firebase.js';

const SETTINGS_PATH = 'settings';

// Canonical defaults — all consuming modules fall back to these when
// Firebase is unavailable or a key hasn't been written yet.
const DEFAULTS = {
  general: {},
  operations: {
    workStartMins: 360,          // 06:00
    workEndMins: 1260,           // 21:00
    odometerWarnJumpKm: 2000,
  },
  notifications: {
    h2WindowMinFrom: 110,
    h2WindowMinTo: 135,
    h1ReminderCheckIntervalMs: 60 * 60 * 1000,   // 1 hour
    h2ReminderCheckIntervalMs: 5 * 60 * 1000,    // 5 minutes
  },
  telegram: {},
  system: {
    backupRetentionDays: 30,
  },
  ui: {},
};

let settings = null;
let settingsLoaded = false;
let settingsSubscribed = false;
let onSettingsChangeCallbacks = [];

function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides || {})) {
    const isPlainObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (isPlainObj(overrides[key]) && isPlainObj(defaults[key])) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

function refreshSettingsCache(nextSettings) {
  settings = nextSettings;
  settingsLoaded = true;
  onSettingsChangeCallbacks.forEach(cb => cb(settings));
}

async function seedSettingsIfEmpty() {
  if (!isFirebaseConfigured()) return;

  const raw = await fetchFirebaseData(SETTINGS_PATH);
  const hasExisting = raw && typeof raw === 'object' && Object.keys(raw).length > 0;

  if (hasExisting) {
    refreshSettingsCache(deepMerge(DEFAULTS, raw));
    return;
  }

  await storeFirebaseData(SETTINGS_PATH, DEFAULTS);
  refreshSettingsCache(deepMerge(DEFAULTS, {}));
}

export async function initSettingsStore() {
  if (!isFirebaseConfigured()) {
    refreshSettingsCache(deepMerge(DEFAULTS, {}));
    return;
  }

  if (!settingsLoaded) {
    try {
      await seedSettingsIfEmpty();
    } catch (error) {
      console.warn('[SettingsStore] Failed to seed/load Firebase settings. Using defaults.', error);
      refreshSettingsCache(deepMerge(DEFAULTS, {}));
    }
  }

  if (!settingsSubscribed) {
    settingsSubscribed = true;
    subscribeFirebasePath(SETTINGS_PATH, snapshot => {
      const raw = snapshot.val();
      refreshSettingsCache(raw ? deepMerge(DEFAULTS, raw) : deepMerge(DEFAULTS, {}));
    });
  }
}

export function getSettings() {
  return settings || DEFAULTS;
}

/**
 * Returns a setting value by dot-notation path (e.g. 'operations.workStartMins').
 * Falls back to DEFAULTS if the key is missing or the store hasn't loaded yet.
 */
export function getSetting(path) {
  const parts = String(path).split('.');

  if (settings !== null) {
    let value = settings;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') { value = undefined; break; }
      value = value[part];
    }
    if (value !== undefined) return value;
  }

  let def = DEFAULTS;
  for (const part of parts) {
    if (def == null || typeof def !== 'object') return undefined;
    def = def[part];
  }
  return def;
}

/**
 * Writes a single setting to Firebase by dot-notation path.
 * The subscription will propagate the change back to all listeners.
 */
export async function updateSetting(path, value) {
  if (!isFirebaseConfigured()) {
    console.warn('[SettingsStore] Firebase not configured — updateSetting is a no-op.');
    return;
  }
  const parts = String(path).split('.');
  const firebasePath = [SETTINGS_PATH, ...parts].join('/');
  await storeFirebaseData(firebasePath, value);
}

export function registerSettingsChangeListener(callback) {
  onSettingsChangeCallbacks.push(callback);
}
