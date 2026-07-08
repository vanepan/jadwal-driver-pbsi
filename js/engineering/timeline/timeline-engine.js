/* ============================================================
   TIMELINE-ENGINE.JS — Engineering Operations Foundation
   (v1.20.0)

   The Engineering Timeline is NOT a scheduler — it is an operational event
   HISTORY. Every assignment owns its own timeline: an ordered, append-only
   log of what happened, who did it, and when. This engine is the single
   authority for creating and querying those events, so every lifecycle
   operation records provenance the same way.

   An event is a plain, serializable record:
     { id, type, timestamp, actor, metadata, notes, attachments }

   PURE + IMMUTABLE: builders return NEW arrays/objects; nothing here mutates
   its input assignment. The Assignment / Verification / Notification engines
   compose events through these factories and hand them to the store to append.

   No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import {
  cleanString, deepClone, generateId, isPlainObject, nowISO, toMillis,
} from '../utils/engineering-utils.js';
import { normalizeActor } from '../models/engineering-assignment.js';

/** The complete Engineering timeline event vocabulary. */
export const TIMELINE_EVENT = Object.freeze({
  CREATED: 'assignment_created',
  PUBLISHED: 'published',
  NOTIFICATION_SENT: 'notification_sent',
  WORKER_JOINED: 'worker_joined',
  WORKER_LEFT: 'worker_left',
  STARTED: 'started',
  PAUSED: 'paused',
  POSTPONED: 'postponed',
  CONTINUE_TOMORROW: 'continue_tomorrow',
  FINISHED: 'finished',
  VERIFIED: 'verified',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
  // v1.21.2 — an Operational Work Report ("Catat Pekerjaan") has no lifecycle
  // of its own (see engineering-work-report.js): it is a single completed
  // record, never a multi-stage assignment. It gets exactly ONE synthesized
  // event of this type (see `workReportTimelineEvent` below) so it can be
  // represented in the SAME timeline model/renderer as assignment events.
  WORK_REPORT_SUBMITTED: 'work_report_submitted',
});

const KNOWN_EVENT_TYPES = new Set(Object.values(TIMELINE_EVENT));

/** True when `type` is a recognized timeline event type. */
export function isKnownEventType(type) {
  return KNOWN_EVENT_TYPES.has(type);
}

/**
 * @typedef {Object} TimelineEvent
 * @property {string}  id
 * @property {string}  type        TIMELINE_EVENT.*
 * @property {string}  timestamp   ISO
 * @property {?Object} actor       { id, name } — who caused the event
 * @property {Object}  metadata    event-specific structured data
 * @property {string}  notes
 * @property {Array<Object>} attachments  reserved: future attachments
 */

/**
 * Build one immutable timeline event. Unknown types are still recorded (with a
 * flag in metadata) rather than dropped — the timeline must never lose history.
 * @param {string} type
 * @param {Object} [details]
 * @param {Object} [details.actor]
 * @param {Object} [details.metadata]
 * @param {string} [details.notes]
 * @param {Array}  [details.attachments]
 * @param {Date|number|string} [details.now]  injectable clock
 * @param {string} [details.id]
 * @returns {TimelineEvent}
 */
export function createTimelineEvent(type, details = {}) {
  const known = isKnownEventType(type);
  const metadata = isPlainObject(details.metadata) ? deepClone(details.metadata) : {};
  if (!known) metadata.unknownType = true;
  return {
    id: cleanString(details.id) || generateId('evt', details.now),
    type: cleanString(type) || 'unknown',
    timestamp: nowISO(details.now),
    actor: normalizeActor(details.actor),
    metadata,
    notes: cleanString(details.notes),
    attachments: Array.isArray(details.attachments) ? details.attachments.slice() : [],
  };
}

/**
 * Append events to a timeline array, returning a NEW sorted array (oldest →
 * newest by timestamp, ties broken by insertion order). Never mutates input.
 * @param {Array<TimelineEvent>} timeline
 * @param {TimelineEvent|Array<TimelineEvent>} events
 * @returns {Array<TimelineEvent>}
 */
export function appendEvents(timeline, events) {
  const base = Array.isArray(timeline) ? timeline : [];
  const add = Array.isArray(events) ? events : [events];
  const merged = [...base, ...add.filter(Boolean)];
  return merged
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ta = toMillis(a.e.timestamp);
      const tb = toMillis(b.e.timestamp);
      const da = Number.isNaN(ta) ? 0 : ta;
      const db = Number.isNaN(tb) ? 0 : tb;
      return da === db ? a.i - b.i : da - db;
    })
    .map(({ e }) => e);
}

/**
 * Return a NEW assignment with the given event(s) appended to its timeline and
 * `updatedTime` advanced to the newest event. This is the ONE place lifecycle
 * engines record history onto an assignment, keeping the pattern uniform.
 * @param {Object} assignment
 * @param {TimelineEvent|Array<TimelineEvent>} events
 * @returns {Object} a new assignment (input untouched)
 */
export function recordEvents(assignment, events) {
  const add = (Array.isArray(events) ? events : [events]).filter(Boolean);
  const timeline = appendEvents(assignment && assignment.timeline, add);
  const newest = add.reduce((max, e) => {
    const t = toMillis(e.timestamp);
    return !Number.isNaN(t) && t > max ? t : max;
  }, toMillis(assignment && assignment.updatedTime) || 0);
  return {
    ...assignment,
    timeline,
    updatedTime: newest ? nowISO(newest) : (assignment ? assignment.updatedTime : nowISO()),
  };
}

/** All events of a given type (chronological). */
export function eventsOfType(timeline, type) {
  return (Array.isArray(timeline) ? timeline : []).filter((e) => e && e.type === type);
}

/** The most recent event (by timestamp); null when empty. */
export function latestEvent(timeline) {
  const sorted = appendEvents(timeline, []);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/** The first event of a type (e.g. the CREATED / PUBLISHED marker); null absent. */
export function firstEventOfType(timeline, type) {
  return eventsOfType(timeline, type)[0] || null;
}

/**
 * Synthesize the ONE timeline event an Operational Work Report ("Catat
 * Pekerjaan") contributes to the unified timeline model (v1.21.2). Work
 * reports are NOT assignments and carry no `.timeline` array of their own
 * (see engineering-work-report.js) — this is the single place that bridges
 * a persisted report into the SAME event shape assignment lifecycle events
 * use, so every consumer (Timeline page, Executive Timeline) renders both
 * through the ONE existing renderer/model instead of a parallel one.
 *
 * Deterministic: keyed off the report's own id/createdTime, never a random
 * id or "now" — calling this twice for the same report yields an
 * identical event, safe to recompute at render time on every pass.
 * @param {Object} report  a normalized work-report record (createWorkReportModel shape)
 * @returns {?TimelineEvent}
 */
export function workReportTimelineEvent(report) {
  if (!isPlainObject(report) || !report.id) return null;
  return createTimelineEvent(TIMELINE_EVENT.WORK_REPORT_SUBMITTED, {
    id: `wrevt-${report.id}`,
    now: report.createdTime,
    actor: report.creator,
    metadata: { reportId: report.id, reportNumber: report.reportNumber, category: report.category },
    notes: report.category ? `Kategori: ${report.category}` : '',
  });
}
