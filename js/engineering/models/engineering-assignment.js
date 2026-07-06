/* ============================================================
   ENGINEERING-ASSIGNMENT.JS — Engineering Operations Foundation
   (v1.20.0)

   The Engineering Assignment model — the central operational entity. Every
   assignment represents real engineering work, and the platform exists above
   all to guarantee no assignment is forgotten. This module owns the SHAPE of
   an assignment and of a participant, plus normalization / serialization so
   the record round-trips through Firebase byte-cleanly.

   NOT an engine: this file creates and normalizes data ONLY. All lifecycle
   behaviour (publish/join/start/finish/verify/…) lives in the engines, which
   consume these factories. Keeping shape separate from behaviour is what lets
   both the engines and the store reuse one canonical model with no duplication.

   PARTICIPANT MODEL — workers are EQUAL: no owner, no leader, unlimited
   participants. Each participant runs its own small lifecycle and carries its
   own timeline and (reserved) performance metrics.

   Everything here is plain-JSON serializable: times are ISO strings, durations
   are numbers, collections are arrays/objects — no class instances, no Dates.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import {
  cleanString, deepClone, isPlainObject, num, nowISO,
} from '../utils/engineering-utils.js';
import {
  STATUS, PRIORITY, DEFAULT_PRIORITY, DEFAULT_SOURCE,
  PARTICIPANT_STATUS, VERIFICATION_STATUS,
  isKnownPriority, isKnownSource, isKnownStatus,
} from '../config/engineering-config.js';

/**
 * @typedef {Object} EngineeringParticipant
 * @property {string} id                       participant id (worker identity)
 * @property {string} workerId                 the engineering member id
 * @property {string} name                     display name (denormalized)
 * @property {string} status                   PARTICIPANT_STATUS.*
 * @property {?string} joinedTime              ISO
 * @property {?string} startedTime             ISO
 * @property {?string} finishedTime            ISO
 * @property {number}  actualWorkingDurationMs summed working time
 * @property {boolean} continueTomorrow        carried to the next working day
 * @property {string}  verificationStatus      VERIFICATION_STATUS.*
 * @property {Array<Object>} timeline          per-participant event history
 * @property {Object}  metrics                 reserved: future performance metrics
 */

/**
 * Build a normalized participant record. Workers are equal — this carries no
 * ownership/leadership flag by design.
 * @param {Object} [input]
 * @param {Object} [options]
 * @param {string} [options.id]
 * @param {Date|number|string} [options.now]
 * @returns {EngineeringParticipant}
 */
export function createParticipant(input = {}, options = {}) {
  const now = options.now;
  return {
    id: cleanString(options.id || input.id) || '',
    workerId: cleanString(input.workerId || input.id),
    name: cleanString(input.name),
    status: PARTICIPANT_STATUS.JOINED,
    joinedTime: input.joinedTime ? nowISO(input.joinedTime) : nowISO(now),
    startedTime: input.startedTime ? nowISO(input.startedTime) : null,
    finishedTime: input.finishedTime ? nowISO(input.finishedTime) : null,
    actualWorkingDurationMs: num(input.actualWorkingDurationMs),
    continueTomorrow: !!input.continueTomorrow,
    verificationStatus: VERIFICATION_STATUS.PENDING,
    timeline: Array.isArray(input.timeline) ? input.timeline.slice() : [],
    metrics: isPlainObject(input.metrics) ? deepClone(input.metrics) : {},
  };
}

/** Coerce a persisted participant node back to a clean participant record. */
export function normalizeParticipant(raw) {
  if (!isPlainObject(raw)) return null;
  const p = createParticipant(raw, { id: raw.id, now: raw.joinedTime });
  // Preserve persisted lifecycle fields the factory resets to defaults.
  p.status = Object.values(PARTICIPANT_STATUS).includes(raw.status) ? raw.status : p.status;
  p.verificationStatus = Object.values(VERIFICATION_STATUS).includes(raw.verificationStatus)
    ? raw.verificationStatus : p.verificationStatus;
  return p;
}

/**
 * @typedef {Object} EngineeringAssignment
 * @property {string}  id
 * @property {string}  assignmentNumber
 * @property {string}  title
 * @property {string}  description
 * @property {string}  category                category id
 * @property {string}  priority                PRIORITY.*
 * @property {string}  status                  STATUS.*
 * @property {string}  source                  SOURCE.*
 * @property {string}  building
 * @property {string}  room
 * @property {string}  location                free-text / coordinate hint
 * @property {?Object} creator                 { id, name }
 * @property {Array<EngineeringParticipant>} participants
 * @property {Array<Object>} timeline          assignment-level event history
 * @property {Array<Object>} attachments
 * @property {string}  notes
 * @property {string}  createdTime             ISO
 * @property {?string} publishedTime
 * @property {?string} startedTime
 * @property {?string} finishedTime
 * @property {?string} verifiedTime
 * @property {?string} postponedTime
 * @property {?string} continueTomorrowTime
 * @property {string}  updatedTime             ISO (last mutation)
 * @property {Object}  verification            { verifierId, verifierName, verifiedTime, notes }
 * @property {Object}  references              reserved future-source references
 */

/** The reserved future-source reference block — populated later, inert now. */
function emptyReferences(input = {}) {
  const r = isPlainObject(input.references) ? input.references : {};
  return {
    bidangRequestRef: cleanString(r.bidangRequestRef || input.bidangRequestRef) || null,
    preventiveMaintenanceRef: cleanString(r.preventiveMaintenanceRef || input.preventiveMaintenanceRef) || null,
    sparePartRef: cleanString(r.sparePartRef || input.sparePartRef) || null,
    scheduledMaintenanceRef: cleanString(r.scheduledMaintenanceRef || input.scheduledMaintenanceRef) || null,
  };
}

function emptyVerification(input = {}) {
  const v = isPlainObject(input.verification) ? input.verification : {};
  return {
    verifierId: cleanString(v.verifierId) || null,
    verifierName: cleanString(v.verifierName) || null,
    verifiedTime: v.verifiedTime ? nowISO(v.verifiedTime) : null,
    notes: cleanString(v.notes) || '',
  };
}

/**
 * Build a normalized Engineering Assignment in DRAFT.
 *
 * This is a pure shape factory — it does NOT emit timeline events or advance
 * the lifecycle (the Assignment Engine wraps it to do that). Unknown category
 * ids are preserved verbatim (Settings owns the editable category list);
 * unknown priority/source/status values fall back to the safe default.
 *
 * @param {Object} input
 * @param {Object} [options]
 * @param {string} [options.id]                assignment id (else caller fills later)
 * @param {string} [options.assignmentNumber]  human number (else caller fills later)
 * @param {Date|number|string} [options.now]
 * @returns {EngineeringAssignment}
 */
export function createAssignmentModel(input = {}, options = {}) {
  const now = options.now;
  const created = nowISO(now);
  const priority = isKnownPriority(input.priority) ? input.priority : DEFAULT_PRIORITY;
  const source = isKnownSource(input.source) ? input.source : DEFAULT_SOURCE;
  const status = isKnownStatus(input.status) ? input.status : STATUS.DRAFT;

  const participants = (Array.isArray(input.participants) ? input.participants : [])
    .map((p) => normalizeParticipant(p))
    .filter(Boolean);

  return {
    id: cleanString(options.id || input.id) || '',
    assignmentNumber: cleanString(options.assignmentNumber || input.assignmentNumber) || '',
    title: cleanString(input.title),
    description: cleanString(input.description),
    category: cleanString(input.category),
    priority,
    status,
    source,
    building: cleanString(input.building),
    room: cleanString(input.room),
    location: cleanString(input.location),
    requester: cleanString(input.requester),   // optional: requesting bidang/unit
    dueDate: cleanString(input.dueDate),        // optional: display target completion
    creator: normalizeActor(input.creator),
    participants,
    timeline: Array.isArray(input.timeline) ? input.timeline.slice() : [],
    attachments: Array.isArray(input.attachments) ? input.attachments.slice() : [],
    notes: cleanString(input.notes),
    createdTime: input.createdTime ? nowISO(input.createdTime) : created,
    publishedTime: input.publishedTime ? nowISO(input.publishedTime) : null,
    startedTime: input.startedTime ? nowISO(input.startedTime) : null,
    finishedTime: input.finishedTime ? nowISO(input.finishedTime) : null,
    verifiedTime: input.verifiedTime ? nowISO(input.verifiedTime) : null,
    postponedTime: input.postponedTime ? nowISO(input.postponedTime) : null,
    continueTomorrowTime: input.continueTomorrowTime ? nowISO(input.continueTomorrowTime) : null,
    updatedTime: input.updatedTime ? nowISO(input.updatedTime) : created,
    verification: emptyVerification(input),
    references: emptyReferences(input),
  };
}

/** Normalize a { id, name } actor (creator / verifier); null when empty. */
export function normalizeActor(raw) {
  if (!isPlainObject(raw)) {
    const s = cleanString(raw);
    return s ? { id: s, name: s } : null;
  }
  const id = cleanString(raw.id);
  const name = cleanString(raw.name) || id;
  return id || name ? { id, name } : null;
}

/**
 * Round-trip a persisted assignment node into a clean model (fills defaults,
 * drops malformed participants). Safe on partial / legacy nodes.
 * @param {Object} raw
 * @returns {?EngineeringAssignment}
 */
export function normalizeAssignment(raw) {
  if (!isPlainObject(raw)) return null;
  return createAssignmentModel(raw, {
    id: raw.id, assignmentNumber: raw.assignmentNumber, now: raw.createdTime,
  });
}

/** Serialize to a plain JSON object (deep clone — never leaks a live reference). */
export function serializeAssignment(assignment) {
  return deepClone(assignment);
}

/** Whether the assignment has at least one active (non-left) participant. */
export function hasActiveParticipants(assignment) {
  return !!assignment && Array.isArray(assignment.participants)
    && assignment.participants.some((p) => p && p.status !== PARTICIPANT_STATUS.LEFT);
}

/** Find a participant by worker id; null when absent. */
export function findParticipant(assignment, workerId) {
  if (!assignment || !Array.isArray(assignment.participants)) return null;
  const id = cleanString(workerId);
  return assignment.participants.find((p) => p && (p.workerId === id || p.id === id)) || null;
}
