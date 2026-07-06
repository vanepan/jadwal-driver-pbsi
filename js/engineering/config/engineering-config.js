/* ============================================================
   ENGINEERING-CONFIG.JS — Engineering Operations Foundation
   (v1.20.0)

   The single source of truth for every ENUM and STRUCTURAL rule the
   Engineering module is built on: assignment categories (seed), priority
   grammar, the assignment lifecycle status set, the deterministic lifecycle
   transition graph, and the request-source vocabulary (direct today; bidang
   request / preventive maintenance / spare part / scheduled maintenance are
   reserved for future sprints and MUST NOT be implemented here).

   SHAPE — frozen ENUMS + a small mutable tunables layer:
     The enums (categories seed, priorities, statuses, lifecycle graph,
     sources) are immutable — they define the domain and every engine reads
     them directly. A tiny ACTIVE tunables layer (assignment-number prefix,
     id prefix) is mergeable at runtime via setEngineeringConfig(), mirroring
     the DEFAULT + ACTIVE pattern in js/config/dispatch-intelligence-config.js.

   The editable OPERATIONAL settings (which categories are enabled, buildings,
   rooms, notification preferences, working hours, priority/verification rules)
   live in engineering-settings.js and SEED their category list from the
   CATEGORY_SEED here — so the default category list is defined exactly once.

   PURE: plain data + merge helpers. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { deepFreeze, num } from '../utils/engineering-utils.js';

/* ── Categories (seed) ───────────────────────────────────────────────────
   The canonical initial category list. Settings clones this into an editable
   layer; nothing outside Settings should mutate it. */
export const CATEGORY_SEED = deepFreeze([
  { id: 'ac-maintenance', label: 'AC Maintenance' },
  { id: 'kelistrikan', label: 'Kelistrikan' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'pompa', label: 'Pompa' },
  { id: 'hydrant', label: 'Hydrant' },
  { id: 'sound-system', label: 'Sound System' },
  { id: 'cctv-wifi', label: 'CCTV / WiFi Support' },
  { id: 'general-repair', label: 'General Repair' },
  { id: 'other', label: 'Other' },
]);

/* ── Priority ────────────────────────────────────────────────────────────
   `weight` orders priorities and seeds the future priority-calculation layer
   (higher = more urgent); it is data only and drives no logic this sprint. */
export const PRIORITY = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
});

export const PRIORITY_DEFS = deepFreeze([
  { id: PRIORITY.CRITICAL, label: 'Critical', weight: 4 },
  { id: PRIORITY.HIGH, label: 'High', weight: 3 },
  { id: PRIORITY.NORMAL, label: 'Normal', weight: 2 },
  { id: PRIORITY.LOW, label: 'Low', weight: 1 },
]);

export const DEFAULT_PRIORITY = PRIORITY.NORMAL;

/** Numeric weight for a priority id (0 for unknown). */
export function priorityWeight(priorityId) {
  const def = PRIORITY_DEFS.find((p) => p.id === priorityId);
  return def ? def.weight : 0;
}

/* ── Lifecycle statuses ──────────────────────────────────────────────────
   The complete, deterministic set of assignment states. */
export const STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  AVAILABLE: 'available',
  IN_PROGRESS: 'in_progress',
  WAITING_VERIFICATION: 'waiting_verification',
  VERIFIED: 'verified',
  COMPLETED: 'completed',
  POSTPONED: 'postponed',
  CONTINUE_TOMORROW: 'continue_tomorrow',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
});

export const STATUS_DEFS = deepFreeze([
  { id: STATUS.DRAFT, label: 'Draft' },
  { id: STATUS.PUBLISHED, label: 'Published' },
  { id: STATUS.AVAILABLE, label: 'Available' },
  { id: STATUS.IN_PROGRESS, label: 'In Progress' },
  { id: STATUS.WAITING_VERIFICATION, label: 'Waiting Verification' },
  { id: STATUS.VERIFIED, label: 'Verified' },
  { id: STATUS.COMPLETED, label: 'Completed' },
  { id: STATUS.POSTPONED, label: 'Postponed' },
  { id: STATUS.CONTINUE_TOMORROW, label: 'Continue Tomorrow' },
  { id: STATUS.CANCELLED, label: 'Cancelled' },
  { id: STATUS.ARCHIVED, label: 'Archived' },
]);

/** Statuses from which no further operational work happens (terminal). */
export const TERMINAL_STATUSES = deepFreeze([STATUS.ARCHIVED]);

/** Statuses that still consume/represent live engineering work (for analytics). */
export const ACTIVE_STATUSES = deepFreeze([
  STATUS.AVAILABLE, STATUS.IN_PROGRESS, STATUS.WAITING_VERIFICATION,
  STATUS.POSTPONED, STATUS.CONTINUE_TOMORROW,
]);

/** Statuses that count as successfully completed engineering work. */
export const COMPLETED_STATUSES = deepFreeze([STATUS.VERIFIED, STATUS.COMPLETED]);

/* ── Lifecycle transition graph ──────────────────────────────────────────
   The ONE authority on legal state moves — the Assignment Engine and the
   Verification Engine both read it, so an invalid transition is impossible by
   construction. Every key maps to the set of statuses reachable from it. */
export const LIFECYCLE = deepFreeze({
  [STATUS.DRAFT]: [STATUS.PUBLISHED, STATUS.CANCELLED],
  [STATUS.PUBLISHED]: [STATUS.AVAILABLE, STATUS.CANCELLED],
  [STATUS.AVAILABLE]: [STATUS.IN_PROGRESS, STATUS.POSTPONED, STATUS.CANCELLED],
  [STATUS.IN_PROGRESS]: [
    STATUS.WAITING_VERIFICATION, STATUS.POSTPONED,
    STATUS.CONTINUE_TOMORROW, STATUS.CANCELLED,
  ],
  [STATUS.WAITING_VERIFICATION]: [STATUS.VERIFIED, STATUS.IN_PROGRESS, STATUS.CANCELLED],
  [STATUS.VERIFIED]: [STATUS.COMPLETED, STATUS.ARCHIVED],
  [STATUS.COMPLETED]: [STATUS.ARCHIVED],
  [STATUS.POSTPONED]: [STATUS.AVAILABLE, STATUS.IN_PROGRESS, STATUS.CANCELLED],
  [STATUS.CONTINUE_TOMORROW]: [STATUS.AVAILABLE, STATUS.IN_PROGRESS, STATUS.CANCELLED],
  [STATUS.CANCELLED]: [STATUS.ARCHIVED],
  [STATUS.ARCHIVED]: [],
});

/**
 * Whether `from → to` is a legal lifecycle transition.
 * @param {string} from  current status
 * @param {string} to    target status
 * @returns {boolean}
 */
export function canTransition(from, to) {
  const allowed = LIFECYCLE[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/* ── Participant + verification sub-states ───────────────────────────────
   Each worker on an assignment runs its own small lifecycle (workers are
   equal — no owner, no leader). Verification is tracked separately from work
   completion (Completion and Verification are distinct concerns). */
export const PARTICIPANT_STATUS = Object.freeze({
  JOINED: 'joined',
  WORKING: 'working',
  FINISHED: 'finished',
  CONTINUE_TOMORROW: 'continue_tomorrow',
  LEFT: 'left',
});

export const VERIFICATION_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
});

/* ── Request sources ─────────────────────────────────────────────────────
   How an assignment originated. DIRECT is the only implemented source this
   sprint. The others are RESERVED extension points — their reference fields
   exist on the model, but NO source-specific workflow is implemented here. */
export const SOURCE = Object.freeze({
  DIRECT: 'direct',
  BIDANG_REQUEST: 'bidang_request',
  PREVENTIVE_MAINTENANCE: 'preventive_maintenance',
  SPARE_PART: 'spare_part',
  SCHEDULED_MAINTENANCE: 'scheduled_maintenance',
});

export const SOURCE_DEFS = deepFreeze([
  { id: SOURCE.DIRECT, label: 'Direct', future: false },
  { id: SOURCE.BIDANG_REQUEST, label: 'Bidang Request', future: true },
  { id: SOURCE.PREVENTIVE_MAINTENANCE, label: 'Preventive Maintenance', future: true },
  { id: SOURCE.SPARE_PART, label: 'Spare Part', future: true },
  { id: SOURCE.SCHEDULED_MAINTENANCE, label: 'Scheduled Maintenance', future: true },
]);

export const DEFAULT_SOURCE = SOURCE.DIRECT;

/* ── Tunables (the small mutable ACTIVE layer) ───────────────────────────
   The only runtime-configurable structural values. Everything above is a
   fixed domain enum; these two format tunables are merge-overridable. */
export const DEFAULT_ENGINEERING_CONFIG = deepFreeze({
  assignmentNumberPrefix: 'ENG',
  idPrefix: 'eng',
});

function cloneTunables(cfg) {
  return { assignmentNumberPrefix: cfg.assignmentNumberPrefix, idPrefix: cfg.idPrefix };
}

let activeConfig = cloneTunables(DEFAULT_ENGINEERING_CONFIG);

/** The live tunables the engines read (treat as read-only; mutate via setter). */
export function getEngineeringConfig() {
  return activeConfig;
}

/**
 * Merge a partial tunable override onto the active config; only non-empty
 * string overrides are applied, so a bad write can never corrupt id/number
 * generation.
 * @param {{assignmentNumberPrefix?:string, idPrefix?:string}} partial
 * @returns {Object} the updated active config
 */
export function setEngineeringConfig(partial = {}) {
  const next = cloneTunables(activeConfig);
  if (typeof partial.assignmentNumberPrefix === 'string' && partial.assignmentNumberPrefix.trim()) {
    next.assignmentNumberPrefix = partial.assignmentNumberPrefix.trim();
  }
  if (typeof partial.idPrefix === 'string' && partial.idPrefix.trim()) {
    next.idPrefix = partial.idPrefix.trim();
  }
  activeConfig = next;
  return activeConfig;
}

/** Reset the tunables back to the immutable default (test/teardown helper). */
export function resetEngineeringConfig() {
  activeConfig = cloneTunables(DEFAULT_ENGINEERING_CONFIG);
  return activeConfig;
}

/** True when `categoryId` is a known seed category id. */
export function isKnownCategory(categoryId) {
  return CATEGORY_SEED.some((c) => c.id === categoryId);
}

/** True when `priorityId` is a known priority id. */
export function isKnownPriority(priorityId) {
  return PRIORITY_DEFS.some((p) => p.id === priorityId);
}

/** True when `statusId` is a known lifecycle status. */
export function isKnownStatus(statusId) {
  return Object.prototype.hasOwnProperty.call(LIFECYCLE, statusId);
}

/** True when `sourceId` is a known request source (implemented or reserved). */
export function isKnownSource(sourceId) {
  return SOURCE_DEFS.some((s) => s.id === sourceId);
}

/** True when a source is reserved for a future sprint (not implemented). */
export function isFutureSource(sourceId) {
  const def = SOURCE_DEFS.find((s) => s.id === sourceId);
  return !!(def && def.future);
}

/** Compare two priorities by weight (desc): negative when `a` is more urgent. */
export function comparePriority(a, b) {
  return num(priorityWeight(b)) - num(priorityWeight(a));
}
