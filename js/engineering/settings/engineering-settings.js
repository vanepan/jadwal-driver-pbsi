/* ============================================================
   ENGINEERING-SETTINGS.JS — Engineering Operations Foundation
   (v1.20.0)

   The editable OPERATIONAL configuration for Engineering — the layer a future
   Settings UI will drive. Where engineering-config.js holds the immutable
   domain enums, this module holds the parts an administrator can tune:
   which categories are enabled, the building/room directory, notification
   preferences, working hours, and the rule blocks for priority, verification
   and continue-tomorrow. Preventive-maintenance and spare-part settings are
   reserved (present but empty) for future sprints.

   SHAPE — frozen DEFAULT + mutable ACTIVE, merged: getEngineeringSettings()
   returns the live settings the app reads; updateEngineeringSettings() deep-
   merges a partial override (validated) and takes effect immediately. This is
   the DEFAULT + ACTIVE pattern used across the platform (settings-store,
   dispatch-intelligence-config).

   The default category list is SEEDED from CATEGORY_SEED in engineering-config
   so it is defined exactly once — no duplicated model.

   Architecture only: no UI, no Firebase. Pure data + merge helpers.
   ============================================================ */

'use strict';

import { deepClone, deepFreeze, isPlainObject, num } from '../utils/engineering-utils.js';
import { CATEGORY_SEED, PRIORITY, VERIFICATION_STATUS } from '../config/engineering-config.js';

/** The immutable canonical settings baseline. */
export const DEFAULT_ENGINEERING_SETTINGS = deepFreeze({
  // Editable copy of the seed categories; `enabled` toggles availability.
  categories: CATEGORY_SEED.map((c) => ({ id: c.id, label: c.label, enabled: true })),

  // Location directory. Rooms carry a buildingId so rooms nest under buildings.
  buildings: [],   // { id, label }
  rooms: [],       // { id, label, buildingId }

  notificationPreferences: {
    notifyCoordinatorOnPublish: true,
    notifyMembersOnPublish: true,
    notifyOnVerification: true,
    channels: { push: true, telegram: false, inApp: true },
  },

  workingHours: {
    // 24h local clock; used later by priority/overdue rules (not enforced here).
    start: '08:00',
    end: '17:00',
    workingDays: [1, 2, 3, 4, 5],   // Mon–Fri (0 = Sunday)
    timezone: 'Asia/Jakarta',
  },

  priorityRules: {
    default: PRIORITY.NORMAL,
    // Reserved: future auto-escalation thresholds (hours in a state → bump).
    autoEscalate: false,
    escalateAfterHours: {},
  },

  verificationRules: {
    required: true,                              // completion needs verification
    defaultStatus: VERIFICATION_STATUS.PENDING,
    allowSelfVerification: false,               // a worker may not verify their own work
    requirePhoto: false,                        // reserved: future before/after photo gate
  },

  continueTomorrowRules: {
    enabled: true,
    maxConsecutiveDays: 5,      // guardrail for future enforcement
    autoResumeToAvailable: true,
  },

  // Reserved future modules — present so their settings slot exists, empty now.
  preventiveMaintenance: {},
  spareParts: {},
});

let activeSettings = deepClone(DEFAULT_ENGINEERING_SETTINGS);

/** The live settings the app reads (treat as read-only; mutate via the updater). */
export function getEngineeringSettings() {
  return activeSettings;
}

/** Deep-merge helper: overlay `patch` onto `base` (arrays replace, objects merge). */
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = isPlainObject(v) ? deepClone(v) : (Array.isArray(v) ? v.slice() : v);
  }
  return out;
}

/**
 * Deep-merge a partial override onto the active settings. Arrays replace whole
 * (so a category/building list update is explicit); nested objects merge. Only
 * a plain-object patch is applied; anything else is a no-op.
 * @param {Object} patch
 * @returns {Object} the updated active settings
 */
export function updateEngineeringSettings(patch = {}) {
  if (!isPlainObject(patch)) return activeSettings;
  activeSettings = deepMerge(activeSettings, patch);
  return activeSettings;
}

/** Reset settings to the immutable default (test/teardown helper). */
export function resetEngineeringSettings() {
  activeSettings = deepClone(DEFAULT_ENGINEERING_SETTINGS);
  return activeSettings;
}

/* ── Convenience readers ─────────────────────────────────────────────── */

/** The enabled categories only (what an assignment form should offer). */
export function getEnabledCategories() {
  return activeSettings.categories.filter((c) => c.enabled !== false);
}

/** All buildings. */
export function getBuildings() {
  return activeSettings.buildings.slice();
}

/** Rooms, optionally filtered to one building. */
export function getRooms(buildingId) {
  const rooms = activeSettings.rooms.slice();
  return buildingId == null ? rooms : rooms.filter((r) => r.buildingId === buildingId);
}

/** Notification preferences (copy). */
export function getNotificationPreferences() {
  return deepClone(activeSettings.notificationPreferences);
}

/** Working-hours configuration (copy). */
export function getWorkingHours() {
  return deepClone(activeSettings.workingHours);
}

/** Verification rules (copy). */
export function getVerificationRules() {
  return deepClone(activeSettings.verificationRules);
}

/** Continue-tomorrow rules (copy). */
export function getContinueTomorrowRules() {
  return deepClone(activeSettings.continueTomorrowRules);
}

/** Whether verification is required before an assignment may complete. */
export function isVerificationRequired() {
  return activeSettings.verificationRules.required !== false;
}

/** Max consecutive continue-tomorrow days permitted (0 = unlimited/disabled). */
export function maxContinueTomorrowDays() {
  return num(activeSettings.continueTomorrowRules.maxConsecutiveDays);
}
