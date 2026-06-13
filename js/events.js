'use strict';

/* ============================================================
   EVENTS.JS — client event publisher (v1.11.1.3)

   Thin, fire-and-forget wrapper over the publishEvent Cloud Function.
   Used for canonical events that have NO authoritative data-node
   trigger — in this release, that is exactly comment.added (comments
   are an embedded array, so a comment write is indistinguishable from
   request.updated at the data layer).

   The server (functions/src/events/publishEvent.js) derives the actor
   from the verified auth token and restricts the accepted type set, so
   this module never asserts identity itself. All failures are swallowed
   — publishing an event must never break the user-facing flow.

   Authoritative assignment.* / request.* events are emitted server-side
   by the data-node triggers, NOT from here.
   ============================================================ */

import { callPublishEvent, isFirebaseConfigured } from './firebase.js';

/**
 * Publish a canonical event to /events (fire-and-forget, never throws).
 *
 * @param {string} type        canonical type (e.g. 'comment.added')
 * @param {string} entityKind  'comment' | 'assignment' | 'request' | 'notification'
 * @param {string} entityId
 * @param {Object} [payload]
 * @returns {Promise<{id:string}|null>} the new event id, or null on failure
 */
export async function publishEvent(type, entityKind, entityId, payload = {}) {
  if (!isFirebaseConfigured()) return null;
  try {
    return await callPublishEvent({
      type,
      entity: { kind: entityKind, id: entityId },
      payload,
    });
  } catch (err) {
    console.warn('[events] publish failed (non-fatal):', err?.message || err);
    return null;
  }
}
