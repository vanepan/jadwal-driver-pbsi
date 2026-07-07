'use strict';

/* ============================================================
   events/engineeringEvents.js — Engineering lifecycle → canonical event

   PURE classification + payload helpers for the Engineering Operations
   module, kept free of firebase-admin so they are unit-testable in
   isolation (see scripts/engineering-notification-check.mjs). The trigger
   (onEngineeringAssignmentWrite) composes these with the shared event
   writer (events/schema.js) — the SAME /events → onEventWrite → engine
   pipeline the Driver and Request modules already use. No parallel
   notification system: Engineering only adds new event TYPES.

   Transition → type (derived from the TRUE persisted state change, so a
   client cannot forge or skip it):
     node created (create publishes straight to 'available')  → engineering.published
     available            → in_progress                       → engineering.accepted
     in_progress (same)   + participant added                 → engineering.joined
     postponed/continue_tomorrow → in_progress/available      → engineering.resumed
     in_progress          → waiting_verification               → engineering.completed  (verification requested)
     waiting_verification → verified                           → engineering.verified
     waiting_verification → in_progress                        → engineering.rejected
     * → postponed                                             → engineering.postponed
     * → cancelled                                             → engineering.cancelled
     anything else / node deleted                              → engineering.updated / .deleted (non-notifiable)
   ============================================================ */

/** Engineering lifecycle status strings — mirror of js/engineering/config
 *  STATUS (kept as literals so this module has no cross-package import). */
const S = Object.freeze({
  AVAILABLE: 'available',
  IN_PROGRESS: 'in_progress',
  WAITING_VERIFICATION: 'waiting_verification',
  VERIFIED: 'verified',
  POSTPONED: 'postponed',
  CONTINUE_TOMORROW: 'continue_tomorrow',
  CANCELLED: 'cancelled',
});

/** Count active participants regardless of RTDB array/object encoding. */
function participantCount(node) {
  const p = node && node.participants;
  if (Array.isArray(p)) return p.filter(Boolean).length;
  if (p && typeof p === 'object') return Object.keys(p).length;
  return 0;
}

/** Normalize participants (array or keyed object) → array. */
function participantList(node) {
  const p = node && node.participants;
  if (Array.isArray(p)) return p.filter(Boolean);
  if (p && typeof p === 'object') return Object.values(p).filter(Boolean);
  return [];
}

/** Normalize the embedded timeline (array or keyed object) → array. */
function timelineList(node) {
  const t = node && node.timeline;
  if (Array.isArray(t)) return t.filter(Boolean);
  if (t && typeof t === 'object') return Object.values(t).filter(Boolean);
  return [];
}

/**
 * Classify a before/after write into a canonical Engineering event type.
 * Returns a type string, or 'engineering.updated'/'engineering.deleted' for
 * changes that are intentionally non-notifiable.
 * @param {*} before  the pre-write node (null on create)
 * @param {*} after   the post-write node (null on delete)
 * @returns {string|null}
 */
function classifyEngineering(before, after) {
  const existedBefore = before !== null && before !== undefined;
  const existsAfter = after !== null && after !== undefined;

  if (!existedBefore && existsAfter) return 'engineering.published';
  if (existedBefore && !existsAfter) return 'engineering.deleted';
  if (!existsAfter) return null;

  const prev = before ? before.status : null;
  const next = after.status;

  if (next !== prev) {
    switch (next) {
      case S.IN_PROGRESS:
        if (prev === S.AVAILABLE) return 'engineering.accepted';
        if (prev === S.POSTPONED || prev === S.CONTINUE_TOMORROW) return 'engineering.resumed';
        if (prev === S.WAITING_VERIFICATION) return 'engineering.rejected';
        return 'engineering.updated';
      case S.WAITING_VERIFICATION: return 'engineering.completed';
      case S.VERIFIED: return 'engineering.verified';
      case S.POSTPONED: return 'engineering.postponed';
      case S.CANCELLED: return 'engineering.cancelled';
      case S.AVAILABLE:
        return (prev === S.POSTPONED || prev === S.CONTINUE_TOMORROW) ? 'engineering.resumed' : 'engineering.updated';
      default: return 'engineering.updated';
    }
  }

  // Status unchanged — an additional member joining an active assignment.
  if ((next === S.IN_PROGRESS || next === S.AVAILABLE) &&
      participantCount(after) > participantCount(before)) {
    return 'engineering.joined';
  }
  return 'engineering.updated';
}

/** Build the notification payload (superset of what templates + recipients read). */
function buildEngineeringPayload(node) {
  const parts = participantList(node);
  return {
    title: node.title != null ? node.title : null,
    assignmentNumber: node.assignmentNumber != null ? node.assignmentNumber : null,
    category: node.category != null ? node.category : null,
    priority: node.priority != null ? node.priority : null,
    status: node.status != null ? node.status : null,
    building: node.building != null ? node.building : null,
    room: node.room != null ? node.room : null,
    location: node.location != null ? node.location : null,
    requester: node.requester != null ? node.requester : null,
    requesterId: node.requesterId != null ? node.requesterId : null,
    dueDate: node.dueDate != null ? node.dueDate : null,
    // Recipients for verified/rejected/postponed = the members who worked on it.
    participantIds: parts.map((p) => p && (p.workerId || p.id)).filter(Boolean),
    participantNames: parts.map((p) => p && p.name).filter(Boolean),
  };
}

/** Best-effort actor from the most recent timeline event (its actor did the change). */
function deriveEngineeringActor(node) {
  const tl = timelineList(node);
  const last = tl.length ? tl[tl.length - 1] : null;
  const actor = last && last.actor ? last.actor : null;
  if (actor) {
    return {
      uid: actor.id != null ? actor.id : (actor.uid != null ? actor.uid : null),
      role: actor.role != null ? actor.role : null,
      displayName: actor.name != null ? actor.name : (actor.displayName != null ? actor.displayName : null),
    };
  }
  return { uid: null, role: null, displayName: node.createdBy != null ? node.createdBy : null };
}

module.exports = {
  ENGINEERING_STATUS: S,
  classifyEngineering,
  buildEngineeringPayload,
  deriveEngineeringActor,
  participantCount,
};
