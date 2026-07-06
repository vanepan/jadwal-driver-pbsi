/* ============================================================
   ASSIGNMENT-ENGINE.JS — Engineering Operations Foundation
   (v1.20.0)

   The operational heart of Engineering: every lifecycle action an assignment
   can undergo, expressed as a PURE state transition. Each operation takes an
   assignment (plus arguments), validates the move against the lifecycle graph
   in engineering-config, and returns a NEW assignment with its status, times
   and participants updated AND a timeline event recorded. The input is never
   mutated and no store/Firebase is touched — the caller persists the result.

   INVARIANT — no invalid state transitions: every status change routes through
   `transitionAssignment`, which throws a TransitionError unless the lifecycle
   graph permits from→to. An illegal move is impossible by construction.

   PARTICIPANTS ARE EQUAL: join/leave/start/finish operate on a worker without
   any notion of owner or leader. Per-worker timing (started/finished/duration)
   and the assignment-level timing are both maintained.

   No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import {
  cleanString, durationMs, generateId, generateAssignmentNumber, nowISO, num,
} from '../utils/engineering-utils.js';
import {
  STATUS, PARTICIPANT_STATUS, canTransition, getEngineeringConfig,
} from '../config/engineering-config.js';
import {
  createAssignmentModel, createParticipant, findParticipant,
} from '../models/engineering-assignment.js';
import {
  TIMELINE_EVENT, createTimelineEvent, recordEvents,
} from '../timeline/timeline-engine.js';

/** Thrown when an operation would move an assignment along an illegal edge. */
export class TransitionError extends Error {
  constructor(from, to) {
    super(`Illegal transition: ${from} → ${to}`);
    this.name = 'TransitionError';
    this.from = from;
    this.to = to;
  }
}

/**
 * The ONE guarded status mutator. Every named operation funnels through here,
 * so the lifecycle graph is the single authority on legality.
 * @param {Object} assignment
 * @param {string} toStatus
 * @param {Object} [opts]
 * @param {string} [opts.eventType]   timeline event to record (default: none extra)
 * @param {Object} [opts.actor]
 * @param {Object} [opts.metadata]
 * @param {string} [opts.notes]
 * @param {Object} [opts.patch]       extra assignment fields to set (times, etc.)
 * @param {Date|number|string} [opts.now]
 * @returns {Object} new assignment
 */
export function transitionAssignment(assignment, toStatus, opts = {}) {
  const from = assignment ? assignment.status : undefined;
  if (from !== toStatus && !canTransition(from, toStatus)) {
    throw new TransitionError(from, toStatus);
  }
  const patched = { ...assignment, ...(opts.patch || {}), status: toStatus };
  if (!opts.eventType) return { ...patched, updatedTime: nowISO(opts.now) };
  const event = createTimelineEvent(opts.eventType, {
    actor: opts.actor, metadata: { from, to: toStatus, ...(opts.metadata || {}) },
    notes: opts.notes, now: opts.now,
  });
  return recordEvents(patched, event);
}

/**
 * Create a brand-new assignment in DRAFT with an id, assignment number and a
 * CREATED timeline event.
 * @param {Object} input     assignment fields (title, category, priority, …)
 * @param {Object} [options]
 * @param {number} [options.sequence]  per-day counter for the assignment number
 * @param {Object} [options.actor]     defaults to the creator
 * @param {Date|number|string} [options.now]
 * @returns {Object} the new DRAFT assignment
 */
export function createAssignment(input = {}, options = {}) {
  const cfg = getEngineeringConfig();
  const id = cleanString(input.id) || generateId(cfg.idPrefix, options.now);
  const assignmentNumber = cleanString(input.assignmentNumber)
    || generateAssignmentNumber({ prefix: cfg.assignmentNumberPrefix, sequence: options.sequence, now: options.now });
  const model = createAssignmentModel({ ...input, status: STATUS.DRAFT }, { id, assignmentNumber, now: options.now });
  const actor = options.actor || model.creator;
  const event = createTimelineEvent(TIMELINE_EVENT.CREATED, {
    actor, metadata: { assignmentNumber, category: model.category, priority: model.priority }, now: options.now,
  });
  return recordEvents(model, event);
}

/** DRAFT → PUBLISHED. Records publishedTime + a PUBLISHED event. */
export function publishAssignment(assignment, options = {}) {
  return transitionAssignment(assignment, STATUS.PUBLISHED, {
    eventType: TIMELINE_EVENT.PUBLISHED,
    actor: options.actor,
    patch: { publishedTime: nowISO(options.now) },
    now: options.now,
  });
}

/**
 * PUBLISHED → AVAILABLE. This is the workflow bridge fired once the publish
 * notification has been dispatched: it records the NOTIFICATION_SENT event
 * (recipient summary in metadata) and opens the assignment for members to join.
 * @param {Object} assignment
 * @param {Object} [options]
 * @param {number} [options.recipientCount]  recipients notified (for the event)
 * @param {Object} [options.actor]
 * @param {Date|number|string} [options.now]
 */
export function markAvailable(assignment, options = {}) {
  return transitionAssignment(assignment, STATUS.AVAILABLE, {
    eventType: TIMELINE_EVENT.NOTIFICATION_SENT,
    actor: options.actor,
    metadata: { recipientCount: num(options.recipientCount) },
    now: options.now,
  });
}

/**
 * A worker joins the assignment. Valid while AVAILABLE or IN_PROGRESS. Adds a
 * JOINED participant (idempotent — re-joining a LEFT worker reactivates them)
 * and records WORKER_JOINED. Status is unchanged (workers are equal).
 * @param {Object} assignment
 * @param {Object} worker     { workerId, name }
 * @param {Object} [options]
 */
export function joinAssignment(assignment, worker = {}, options = {}) {
  assertState(assignment, [STATUS.AVAILABLE, STATUS.IN_PROGRESS], 'join');
  const existing = findParticipant(assignment, worker.workerId || worker.id);
  let participants;
  if (existing) {
    participants = assignment.participants.map((p) => (p === existing
      ? { ...p, status: PARTICIPANT_STATUS.JOINED, joinedTime: p.joinedTime || nowISO(options.now) }
      : p));
  } else {
    const participant = createParticipant(worker, {
      id: generateId('wk', options.now), now: options.now,
    });
    participants = [...(assignment.participants || []), participant];
  }
  const event = createTimelineEvent(TIMELINE_EVENT.WORKER_JOINED, {
    actor: options.actor || { id: worker.workerId, name: worker.name },
    metadata: { workerId: cleanString(worker.workerId || worker.id), name: cleanString(worker.name) },
    now: options.now,
  });
  return recordEvents({ ...assignment, participants }, event);
}

/** A worker leaves. Marks the participant LEFT and records WORKER_LEFT. */
export function leaveAssignment(assignment, workerId, options = {}) {
  const target = findParticipant(assignment, workerId);
  if (!target) return assignment;
  const participants = assignment.participants.map((p) => (p === target
    ? { ...p, status: PARTICIPANT_STATUS.LEFT }
    : p));
  const event = createTimelineEvent(TIMELINE_EVENT.WORKER_LEFT, {
    actor: options.actor || { id: cleanString(workerId), name: target.name },
    metadata: { workerId: cleanString(workerId) },
    now: options.now,
  });
  return recordEvents({ ...assignment, participants }, event);
}

/**
 * Start work. The acting worker (options.workerId) moves to WORKING with a
 * startedTime; the FIRST start transitions the assignment AVAILABLE → IN_PROGRESS
 * and stamps the assignment startedTime. Subsequent starts only update the
 * worker. Records STARTED.
 * @param {Object} assignment
 * @param {Object} [options]
 * @param {string} [options.workerId]
 */
export function startAssignment(assignment, options = {}) {
  const now = nowISO(options.now);
  const participants = touchParticipant(assignment, options.workerId, (p) => ({
    ...p, status: PARTICIPANT_STATUS.WORKING, startedTime: now,
  }));

  const isFirstStart = assignment.status === STATUS.AVAILABLE;
  const base = { ...assignment, participants };
  if (isFirstStart) {
    return transitionAssignment(base, STATUS.IN_PROGRESS, {
      eventType: TIMELINE_EVENT.STARTED,
      actor: options.actor,
      metadata: { workerId: cleanString(options.workerId) },
      patch: { startedTime: assignment.startedTime || now },
      now: options.now,
    });
  }
  assertState(assignment, [STATUS.IN_PROGRESS], 'start');
  const event = createTimelineEvent(TIMELINE_EVENT.STARTED, {
    actor: options.actor, metadata: { workerId: cleanString(options.workerId) }, now: options.now,
  });
  return recordEvents(base, event);
}

/**
 * Finish work. The acting worker moves to FINISHED, their working segment is
 * added to actualWorkingDurationMs, and startedTime is cleared. When every
 * active (non-LEFT) participant has finished — or options.force is set — the
 * assignment transitions IN_PROGRESS → WAITING_VERIFICATION and stamps
 * finishedTime. Records FINISHED.
 * @param {Object} assignment
 * @param {Object} [options]
 * @param {string} [options.workerId]
 * @param {boolean} [options.force]  close the assignment regardless of others
 */
export function finishAssignment(assignment, options = {}) {
  const now = nowISO(options.now);
  const participants = touchParticipant(assignment, options.workerId, (p) => {
    const segment = durationMs(p.startedTime, now);
    return {
      ...p,
      status: PARTICIPANT_STATUS.FINISHED,
      finishedTime: now,
      startedTime: null,
      actualWorkingDurationMs: num(p.actualWorkingDurationMs) + (segment || 0),
    };
  });

  const base = { ...assignment, participants };
  const active = participants.filter((p) => p.status !== PARTICIPANT_STATUS.LEFT);
  const allFinished = active.length > 0 && active.every((p) => p.status === PARTICIPANT_STATUS.FINISHED);

  if (options.force || allFinished || active.length === 0) {
    return transitionAssignment(base, STATUS.WAITING_VERIFICATION, {
      eventType: TIMELINE_EVENT.FINISHED,
      actor: options.actor,
      metadata: { workerId: cleanString(options.workerId), allFinished, forced: !!options.force },
      patch: { finishedTime: now },
      now: options.now,
    });
  }
  // A worker finished but others are still working — record the worker finish only.
  const event = createTimelineEvent(TIMELINE_EVENT.FINISHED, {
    actor: options.actor, metadata: { workerId: cleanString(options.workerId), allFinished: false }, now: options.now,
  });
  return recordEvents(base, event);
}

/** IN_PROGRESS / AVAILABLE → POSTPONED. Stamps postponedTime, records POSTPONED. */
export function postponeAssignment(assignment, options = {}) {
  return transitionAssignment(assignment, STATUS.POSTPONED, {
    eventType: TIMELINE_EVENT.POSTPONED,
    actor: options.actor,
    metadata: { reason: cleanString(options.reason) },
    notes: options.notes,
    patch: { postponedTime: nowISO(options.now) },
    now: options.now,
  });
}

/**
 * IN_PROGRESS → CONTINUE_TOMORROW. Flags the acting worker to continue and
 * stamps continueTomorrowTime; records CONTINUE_TOMORROW. Any working segment
 * up to now is banked into the worker's actualWorkingDurationMs.
 */
export function continueTomorrowAssignment(assignment, options = {}) {
  const now = nowISO(options.now);
  const participants = touchParticipant(assignment, options.workerId, (p) => {
    const segment = durationMs(p.startedTime, now);
    return {
      ...p,
      status: PARTICIPANT_STATUS.CONTINUE_TOMORROW,
      continueTomorrow: true,
      startedTime: null,
      actualWorkingDurationMs: num(p.actualWorkingDurationMs) + (segment || 0),
    };
  });
  return transitionAssignment({ ...assignment, participants }, STATUS.CONTINUE_TOMORROW, {
    eventType: TIMELINE_EVENT.CONTINUE_TOMORROW,
    actor: options.actor,
    metadata: { workerId: cleanString(options.workerId) },
    patch: { continueTomorrowTime: now },
    now: options.now,
  });
}

/** Any pre-terminal state → CANCELLED. Records CANCELLED with an optional reason. */
export function cancelAssignment(assignment, options = {}) {
  return transitionAssignment(assignment, STATUS.CANCELLED, {
    eventType: TIMELINE_EVENT.CANCELLED,
    actor: options.actor,
    metadata: { reason: cleanString(options.reason) },
    notes: options.notes,
    now: options.now,
  });
}

/** VERIFIED / COMPLETED / CANCELLED → ARCHIVED. Records ARCHIVED. */
export function archiveAssignment(assignment, options = {}) {
  return transitionAssignment(assignment, STATUS.ARCHIVED, {
    eventType: TIMELINE_EVENT.ARCHIVED,
    actor: options.actor,
    now: options.now,
  });
}

/* ── internal helpers ────────────────────────────────────────────────── */

/** Apply `fn` to the participant matching workerId, returning a new array. */
function touchParticipant(assignment, workerId, fn) {
  const target = findParticipant(assignment, workerId);
  const list = Array.isArray(assignment.participants) ? assignment.participants : [];
  if (!target) return list.slice();
  return list.map((p) => (p === target ? fn(p) : p));
}

/** Guard that the assignment is in one of the allowed statuses for an op. */
function assertState(assignment, allowed, op) {
  const status = assignment ? assignment.status : undefined;
  if (!allowed.includes(status)) {
    throw new TransitionError(status, `${op}(requires ${allowed.join('|')})`);
  }
}
