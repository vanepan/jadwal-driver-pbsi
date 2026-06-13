'use strict';

/* ============================================================
   events/onRequestWrite.js — authoritative request events

   Fires on every write to /driver_requests/{requestId}. Derives a
   canonical event from the TRUE state change. The client persists
   requests via a full-map set (saveRequests), but RTDB diffs children,
   so only the actually-changed request fires this trigger.

   Transition → type:
     • node created           → request.created
     • status → 'approved'    → request.approved
     • status → 'rejected'    → request.rejected
     • any other update       → request.updated

   Note: comment.added is NOT derived here (comments are an embedded
   array; a comment write also looks like a request.updated). The
   comment.added event is published explicitly by the client via
   publishEvent() — see events/publishEvent.js and Phase 6.

   VALIDATION-only downstream — no fan-out, no sending in this release.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { buildEnvelope, writeEvent } = require('./schema');

function deriveActor(node, type) {
  if (type === 'request.created') {
    return { uid: node.requesterId || null, role: 'bidang', displayName: node.requesterName || null };
  }
  if (type === 'request.approved' || type === 'request.rejected') {
    // Admin acted; only the display name is persisted on the node.
    return { uid: null, role: 'admin', displayName: node.approvedBy || null };
  }
  return { uid: node.requesterId || null, role: null, displayName: node.requesterName || null };
}

function buildPayload(node) {
  return {
    requesterId:   node.requesterId ?? null,
    requesterName: node.requesterName ?? null,
    driver:        node.driver ?? null,
    vehicle:       node.vehicle ?? null,
    purpose:       node.purpose ?? null,
    startDate:     node.startDate ?? node.date ?? null,
    endDate:       node.endDate ?? null,
    startTime:     node.startTime ?? null,
    endTime:       node.endTime ?? null,
    status:        node.status ?? null,
  };
}

function classify(before, after) {
  const existedBefore = before !== null && before !== undefined;
  const existsAfter   = after !== null && after !== undefined;

  if (!existedBefore && existsAfter) return 'request.created';
  if (!existsAfter) return null; // deletion of a request is not a tracked business event

  const prevStatus = before ? before.status : null;
  const nextStatus = after.status;
  if (nextStatus !== prevStatus) {
    if (nextStatus === 'approved') return 'request.approved';
    if (nextStatus === 'rejected') return 'request.rejected';
  }
  return 'request.updated';
}

const onRequestWrite = onValueWritten(
  { ref: '/driver_requests/{requestId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    const type   = classify(before, after);
    if (!type) return;

    const entityId = event.params.requestId;
    try {
      const stored = await writeEvent(buildEnvelope({
        type,
        actor:   deriveActor(after || {}, type),
        entity:  { kind: 'request', id: entityId },
        payload: buildPayload(after || {}),
        timestamp: event.time || new Date().toISOString(),
      }));
      logger.info('[onRequestWrite] event emitted', { type, eventId: stored.id, requestId: entityId });
    } catch (err) {
      logger.error('[onRequestWrite] failed to emit event', { type, requestId: entityId, error: err.message });
    }
  }
);

module.exports = { onRequestWrite };
