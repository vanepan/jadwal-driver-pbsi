'use strict';

/* ============================================================
   events/onAssignmentWrite.js — authoritative assignment events

   Fires on every write to /assignments/{assignmentId}. Derives a
   canonical event from the TRUE state change (not a client-supplied
   log), so events cannot be forged or skipped by an offline client.

   Transition → type:
     • node created                 → assignment.created
     • status → 'cancelled'         → assignment.cancelled
     • status → 'completed'         → assignment.completed
     • status → 'started'           → assignment.started
     • node deleted                 → assignment.deleted
     • any other update             → assignment.updated

   Each logical change emits exactly one event (status transition
   takes precedence over a generic update). VALIDATION-only subscriber
   downstream (onEventWrite) — no fan-out, no sending in this release.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { buildEnvelope, writeEvent } = require('./schema');

/** Best-effort actor from the persisted node (the writer wasn't recorded server-side). */
function deriveActor(after, type) {
  if (type === 'assignment.cancelled' && after.cancelledBy) {
    return {
      uid:         after.cancelledBy.uid || null,
      role:        after.cancelledBy.role || null,
      displayName: after.cancelledBy.name || null,
    };
  }
  if (type === 'assignment.completed') {
    return { uid: null, role: null, displayName: after.completedBy || null };
  }
  if (type === 'assignment.created') {
    return { uid: null, role: null, displayName: after.createdBy || null };
  }
  return { uid: null, role: null, displayName: null };
}

/** Payload mirrors the fields the recipient resolver + in-app center consume. */
function buildPayload(node) {
  return {
    driver:            node.driver ?? null,
    driverUsername:    node.driverUsername ?? null,
    vehicle:           node.vehicle ?? null,
    destination:       node.destination ?? null,
    date:              node.date ?? node.startDate ?? null,
    startTime:         node.startTime ?? null,
    endTime:           node.endTime ?? null,
    status:            node.status ?? null,
    requestId:         node.requestId ?? null,
    requesterId:       node.requesterId ?? null,
    cancellationReason: node.cancellationReason ?? null,
    distanceTravelled: node.distanceTravelled ?? null,
  };
}

/** Decide the canonical type from before/after snapshots. Returns null if no event. */
function classify(before, after) {
  const existedBefore = before !== null && before !== undefined;
  const existsAfter   = after !== null && after !== undefined;

  if (!existedBefore && existsAfter) return 'assignment.created';
  if (existedBefore && !existsAfter) return 'assignment.deleted';
  if (!existsAfter) return null;

  const prevStatus = before ? before.status : null;
  const nextStatus = after.status;
  if (nextStatus !== prevStatus) {
    if (nextStatus === 'cancelled') return 'assignment.cancelled';
    if (nextStatus === 'completed') return 'assignment.completed';
    if (nextStatus === 'started')   return 'assignment.started';
  }
  return 'assignment.updated';
}

const onAssignmentWrite = onValueWritten(
  { ref: '/assignments/{assignmentId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    const type   = classify(before, after);
    if (!type) return;

    const node = type === 'assignment.deleted' ? before : after;
    const entityId = event.params.assignmentId;

    try {
      const stored = await writeEvent(buildEnvelope({
        type,
        actor:   deriveActor(node || {}, type),
        entity:  { kind: 'assignment', id: entityId },
        payload: buildPayload(node || {}),
        timestamp: event.time || new Date().toISOString(),
      }));
      logger.info('[onAssignmentWrite] event emitted', { type, eventId: stored.id, assignmentId: entityId });
    } catch (err) {
      logger.error('[onAssignmentWrite] failed to emit event', { type, assignmentId: entityId, error: err.message });
    }
  }
);

module.exports = { onAssignmentWrite };
