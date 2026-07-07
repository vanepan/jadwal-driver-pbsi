'use strict';

/* ============================================================
   events/schema.js — Canonical event envelope (v1.11.1.3)

   The single definition of the platform event envelope, its
   version, the allowed type namespace, the legacy /logs action
   mapping, validation, and the append-only writer to /events.

   Canonical envelope (field names are AUTHORITATIVE — the older
   draft used v/ts/subject/metadata; those are retired):

     {
       id,         // RTDB push key (assigned at write time)
       type,       // domain.action  (see EVENT_TYPES)
       version,    // envelope schema version (ENVELOPE_VERSION)
       timestamp,  // ISO8601 event time
       actor,      // { uid, role, displayName }  (best-effort)
       entity,     // { kind, id }
       payload     // domain data (superset of legacy logAction metadata)
     }

   /logs is NEVER touched by this module. /events is a NEW,
   append-only, audit/replay-capable outbox.
   ============================================================ */

const { db } = require('../config/admin');

/** Envelope schema version. Bumps ONLY on breaking envelope changes. */
const ENVELOPE_VERSION = 1;

/** Append-only event outbox path. Distinct from /logs (untouched). */
const EVENTS_PATH = 'events';

/** Recognized entity kinds. */
const ENTITY_KINDS = ['assignment', 'request', 'comment', 'notification', 'engineering'];

/**
 * Canonical event type namespace (domain.action). Additive — new
 * modules add types here, never new envelope machinery.
 */
const EVENT_TYPES = [
  'assignment.created',
  'assignment.updated',
  'assignment.started',
  'assignment.completed',
  'assignment.cancelled',
  'assignment.deleted',
  'request.created',
  'request.updated',
  'request.approved',
  'request.rejected',
  'comment.added',
  'notification.sent',
  // v1.11.4 Reminder Engine — additive, system-originated time-based reminder.
  // H-1d vs H-1h is data (payload.offset), not a separate type.
  'assignment.reminder',
  // v1.20.4 Engineering Operations — additive lifecycle types. Ride the SAME
  // /events → onEventWrite → engine pipeline; only new TYPES, no new machinery.
  // (.updated/.deleted are declared for validity but stay out of the registry.)
  'engineering.published',
  'engineering.accepted',
  'engineering.joined',
  'engineering.resumed',
  'engineering.postponed',
  'engineering.completed',
  'engineering.verified',
  'engineering.rejected',
  'engineering.cancelled',
  'engineering.updated',
  'engineering.deleted',
];
const EVENT_TYPE_SET = new Set(EVENT_TYPES);

/**
 * Legacy flat /logs action → canonical type. Used only where the new
 * envelope is produced; /logs entries themselves are never rewritten.
 */
const LEGACY_ACTION_TO_TYPE = {
  assignment_created:   'assignment.created',
  assignment_edited:    'assignment.updated',
  assignment_started:   'assignment.started',
  assignment_completed: 'assignment.completed',
  assignment_cancelled: 'assignment.cancelled',
  assignment_deleted:   'assignment.deleted',
  request_created:      'request.created',
  request_updated:      'request.updated',
  request_approved:     'request.approved',
  request_rejected:     'request.rejected',
  comment_added:        'comment.added',
};

/** Reverse map (canonical type → legacy action) for back-references. */
const TYPE_TO_LEGACY_ACTION = Object.fromEntries(
  Object.entries(LEGACY_ACTION_TO_TYPE).map(([k, v]) => [v, k])
);

/** Map a legacy /logs action to a canonical type (or null if unknown). */
function legacyActionToType(action) {
  return LEGACY_ACTION_TO_TYPE[action] || null;
}

/** Infer the entity kind from a canonical type ("assignment.created" → "assignment"). */
function inferEntityKind(type) {
  const domain = String(type || '').split('.')[0];
  return ENTITY_KINDS.includes(domain) ? domain : null;
}

/**
 * Firebase rejects `undefined`. Recursively replace undefined with null
 * (PBSI convention) so envelopes never fail to write. Mirrors
 * logs.js#sanitizeMetadata, generalized one level for nested payloads.
 */
function sanitize(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
}

/**
 * Build a canonical envelope (without `id` — assigned at write time).
 * @param {Object} input { type, actor, entity, payload, timestamp? }
 * @returns {Object} envelope
 */
function buildEnvelope({ type, actor, entity, payload, timestamp } = {}) {
  return {
    type:      String(type || ''),
    version:   ENVELOPE_VERSION,
    timestamp: timestamp || new Date().toISOString(),
    actor:     sanitize(actor || {}),
    entity:    sanitize(entity || {}),
    payload:   sanitize(payload || {}),
  };
}

/**
 * Validate an envelope's shape. Returns { valid, errors[] }.
 * Used by onEventWrite (Phase 8 shadow validation) and publishEvent.
 */
function validateEnvelope(env) {
  const errors = [];
  if (!env || typeof env !== 'object') {
    return { valid: false, errors: ['envelope is not an object'] };
  }
  if (!EVENT_TYPE_SET.has(env.type)) errors.push(`unknown type: ${env.type}`);
  if (env.version !== ENVELOPE_VERSION) errors.push(`unexpected version: ${env.version}`);
  if (typeof env.timestamp !== 'string' || !env.timestamp) errors.push('missing timestamp');
  if (!env.actor || typeof env.actor !== 'object') errors.push('missing actor');
  if (!env.entity || typeof env.entity !== 'object') {
    errors.push('missing entity');
  } else {
    if (!ENTITY_KINDS.includes(env.entity.kind)) errors.push(`bad entity.kind: ${env.entity.kind}`);
    if (!env.entity.id) errors.push('missing entity.id');
  }
  if (!env.payload || typeof env.payload !== 'object') errors.push('missing payload');
  return { valid: errors.length === 0, errors };
}

/**
 * Append an envelope to /events (push-keyed → chronological, unique).
 * The Admin SDK bypasses security rules, so the writer is the only
 * authority that mints events. Returns the stored envelope incl. id.
 *
 * @param {Object} envelope — output of buildEnvelope()
 * @returns {Promise<Object>} the written envelope with its id
 */
async function writeEvent(envelope) {
  const ref = db.ref(EVENTS_PATH).push();
  const stored = { id: ref.key, ...envelope };
  await ref.set(stored);
  return stored;
}

/** RTDB keys may not contain . # $ / [ ]. Replace any with _. Mirrors
 *  notifications/model.js#keySafe (inlined to keep events foundational —
 *  events must not depend on the notifications layer). */
function keySafe(value) {
  return String(value == null ? '' : value).replace(/[.#$/[\]]/g, '_');
}

/**
 * Append an envelope to /events under a DETERMINISTIC id (v1.11.4).
 * Unlike writeEvent (random push key), this lets a producer mint one
 * canonical event per logical occurrence — e.g. one reminder per
 * (assignment, offset), forever. Because onEventWrite is onValueCreated,
 * re-writing an existing id is an UPDATE (not a create) and does NOT
 * re-fire the engine: the guarantee is at-most-once, dedup not re-drive
 * (see REMINDER_ENGINE_ARCHITECTURE_v1.11.4_REV2.md §3).
 *
 * @param {string} id        deterministic id (e.g. "reminder__<asg>__<offset>")
 * @param {Object} envelope  output of buildEnvelope()
 * @returns {Promise<Object>} the written envelope incl. its (keySafe) id
 */
async function writeEventWithId(id, envelope) {
  const safeId = keySafe(id);
  const ref = db.ref(`${EVENTS_PATH}/${safeId}`);
  const stored = { id: safeId, ...envelope };
  await ref.set(stored);
  return stored;
}

module.exports = {
  ENVELOPE_VERSION,
  EVENTS_PATH,
  ENTITY_KINDS,
  EVENT_TYPES,
  EVENT_TYPE_SET,
  LEGACY_ACTION_TO_TYPE,
  TYPE_TO_LEGACY_ACTION,
  legacyActionToType,
  inferEntityKind,
  sanitize,
  keySafe,
  buildEnvelope,
  validateEnvelope,
  writeEvent,
  writeEventWithId,
};
