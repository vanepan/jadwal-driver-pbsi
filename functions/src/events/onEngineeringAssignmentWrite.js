'use strict';

/* ============================================================
   events/onEngineeringAssignmentWrite.js — Engineering lifecycle events

   Fires on every write to /engineering/assignments/{assignmentId}. Derives a
   canonical event from the TRUE state change (never a client-supplied log) and
   appends it to /events — the SAME append-only outbox the Driver and Request
   triggers use. Downstream, onEventWrite → notifications/engine.js resolves
   recipients (coordinators / members / admins), renders copy and delivers
   in-app + Web Push. There is NO separate Engineering notification path.

   Non-notifiable transitions (engineering.updated / .deleted) short-circuit
   before any /events write, so the outbox only carries meaningful lifecycle
   moments. Each logical change emits exactly one event → one notification set.
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { buildEnvelope, writeEvent } = require('./schema');
const {
  classifyEngineering, buildEngineeringPayload, deriveEngineeringActor,
} = require('./engineeringEvents');

/** Types that carry no notification — never written to the outbox. */
const NON_NOTIFIABLE = new Set(['engineering.updated', 'engineering.deleted']);

const onEngineeringAssignmentWrite = onValueWritten(
  { ref: '/engineering/assignments/{assignmentId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const type = classifyEngineering(before, after);
    if (!type || NON_NOTIFIABLE.has(type)) return;

    const node = after || before || {};
    const entityId = event.params.assignmentId;

    try {
      const stored = await writeEvent(buildEnvelope({
        type,
        actor: deriveEngineeringActor(node),
        entity: { kind: 'engineering', id: entityId },
        payload: buildEngineeringPayload(node),
        timestamp: event.time || new Date().toISOString(),
      }));
      logger.info('[onEngineeringAssignmentWrite] event emitted', { type, eventId: stored.id, assignmentId: entityId });
    } catch (err) {
      logger.error('[onEngineeringAssignmentWrite] failed to emit event', { type, assignmentId: entityId, error: err.message });
    }
  }
);

module.exports = { onEngineeringAssignmentWrite };
