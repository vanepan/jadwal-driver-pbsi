'use strict';

import {
  readNode,
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
    workStartMins: 540,          // 09:00 (office-hours window; also the overtime boundary, v1.16.4.7)
    workEndMins: 1020,           // 17:00
    odometerWarnJumpKm: 2000,
  },
  notifications: {
    // v1.25.x — retained for backward compatibility only (existing Firebase
    // installations may still carry these under /settings/notifications).
    // The browser reminder path that read them (checkAndSendH1Reminders /
    // checkAndSendHoursReminders) was retired in Driver Notification V2 —
    // the server-side reminder queue (functions/src/reminders/*) replaced it
    // and needs no client-tunable check interval. No code reads these four
    // anymore; the Settings UI no longer exposes them (see Part 3 below).
    h2WindowMinFrom: 110,
    h2WindowMinTo: 135,
    h1ReminderCheckIntervalMs: 60 * 60 * 1000,   // 1 hour
    h2ReminderCheckIntervalMs: 5 * 60 * 1000,    // 5 minutes

    // v1.25.x Driver Notification V2 (Final Hardening) — THE single runtime
    // source of truth for these four values. The client reads them
    // synchronously via getSetting(); Cloud Functions read the SAME
    // /settings/notifications node live (functions/src/config/runtimeSettings.js),
    // falling back to functions/src/config/constants.js#ASSIGNMENT_NOTIFY_DEFAULTS
    // only when that read is unavailable. Neither runtime hardcodes its own
    // independent copy of these numbers — see runtimeSettings.js's header.
    assignmentChangeThresholdMinutes: 15,
    notificationDebounceMs: 2000,
    enableTelegramFallback: true,
    enablePushNotification: true,
  },
  telegram: {},
  system: {
    backupRetentionDays: 30,
  },
  ui: {},
  // v1.25.x — Dispatch Intelligence's Recovery Buffer (Driver Recommendation
  // Engine), surfaced in the Settings UI alongside Notification V2 (Part 3).
  // js/config/dispatch-intelligence-config.js#getDispatchConfig() reads this
  // live value (falling back to its own DEFAULT_DISPATCH_INTELLIGENCE_CONFIG
  // literal only when settings-store hasn't loaded) — this is now the ONE
  // way to actually change it; the setDispatchConfig() setter alone was
  // never wired to any UI before this.
  dispatch: {
    recoveryBufferMinutes: 60,
  },
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

  const readResult = await readNode(SETTINGS_PATH);
  if (!readResult || typeof readResult !== 'object' || readResult.status !== 'ok') {
    const status = readResult && typeof readResult === 'object' ? readResult.status : 'unknown';
    const code = readResult && typeof readResult === 'object' ? readResult.code : '';
    throw new Error(`[SettingsStore] readNode failed (${status}${code ? `:${code}` : ''})`);
  }

  const raw = readResult.value;
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
