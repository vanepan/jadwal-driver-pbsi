/* ============================================================
   NOTIFICATION-ENGINE.JS — Engineering Operations Foundation
   (v1.20.0)

   The Engineering notification builder. It turns a lifecycle moment into a
   structured notification PAYLOAD plus its recipient list — it does NOT send
   anything (no Firebase, no push, no telegram). The provider/orchestrator
   layer wires a transport later; keeping this pure makes the recipient rules
   and payload shape independently testable.

   IMPLEMENTED WORKFLOW (the only one this sprint):
     Admin Sarpras creates an Assignment
       → publish → notify Coordinator Engineering AND ALL Engineering Members
       → assignment becomes Available → members may immediately join.

   FUTURE — Bidang Request flow MUST NOT be implemented. Only the extension
   interface is prepared: registerSourceNotifier() lets a later sprint attach a
   source-specific recipient/payload strategy (bidang request, preventive
   maintenance, spare part, scheduled maintenance) without touching this engine.

   No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { cleanString, generateId, isPlainObject, nowISO } from '../utils/engineering-utils.js';
import { SOURCE, PRIORITY_DEFS, STATUS } from '../config/engineering-config.js';
import { TIMELINE_EVENT, createTimelineEvent } from '../timeline/timeline-engine.js';

/** Notification kinds this engine can build. */
export const NOTIFICATION_TYPE = Object.freeze({
  ASSIGNMENT_PUBLISHED: 'assignment_published',
});

/** Audience roles a notification can target (denormalized — resolved by transport). */
export const AUDIENCE = Object.freeze({
  ENGINEERING_COORDINATOR: 'engineering_coordinator',
  ENGINEERING_MEMBERS: 'engineering_members',
});

function priorityLabel(priorityId) {
  const def = PRIORITY_DEFS.find((p) => p.id === priorityId);
  return def ? def.label : 'Normal';
}

/**
 * @typedef {Object} EngineeringNotification
 * @property {string}  id
 * @property {string}  type          NOTIFICATION_TYPE.*
 * @property {string}  assignmentId
 * @property {string}  assignmentNumber
 * @property {string}  title
 * @property {string}  body
 * @property {string[]} audiences    AUDIENCE.* the notification targets
 * @property {Object}  data          structured payload (deep-linkable fields)
 * @property {string}  createdTime   ISO
 */

/**
 * Build the publish notification for an assignment: targeted at the Engineering
 * Coordinator AND all Engineering Members, per the approved workflow.
 * @param {Object} assignment
 * @param {Object} [options]
 * @param {Date|number|string} [options.now]
 * @returns {EngineeringNotification}
 */
export function buildPublishNotification(assignment = {}, options = {}) {
  const title = cleanString(assignment.title) || 'Engineering Assignment';
  const number = cleanString(assignment.assignmentNumber);
  const where = [cleanString(assignment.building), cleanString(assignment.room)]
    .filter(Boolean).join(' · ');
  const body = [
    `${priorityLabel(assignment.priority)} priority`,
    where && `at ${where}`,
    '— tap to join.',
  ].filter(Boolean).join(' ');

  return {
    id: generateId('ntf', options.now),
    type: NOTIFICATION_TYPE.ASSIGNMENT_PUBLISHED,
    assignmentId: cleanString(assignment.id),
    assignmentNumber: number,
    title: number ? `${title} (${number})` : title,
    body,
    audiences: [AUDIENCE.ENGINEERING_COORDINATOR, AUDIENCE.ENGINEERING_MEMBERS],
    data: {
      assignmentId: cleanString(assignment.id),
      category: cleanString(assignment.category),
      priority: cleanString(assignment.priority),
      building: cleanString(assignment.building),
      room: cleanString(assignment.room),
      source: cleanString(assignment.source) || SOURCE.DIRECT,
    },
    createdTime: nowISO(options.now),
  };
}

/**
 * Resolve the concrete recipient ids for a notification from a directory of
 * engineering people. Coordinator + every member; de-duplicated. The directory
 * is injected (no user store dependency here).
 * @param {EngineeringNotification} notification
 * @param {Object} directory
 * @param {Array<{id:string}>} [directory.members]
 * @param {{id:string}} [directory.coordinator]
 * @returns {string[]} unique recipient ids
 */
export function resolveRecipients(notification, directory = {}) {
  const audiences = new Set(notification && Array.isArray(notification.audiences) ? notification.audiences : []);
  const ids = new Set();
  if (audiences.has(AUDIENCE.ENGINEERING_COORDINATOR) && directory.coordinator && directory.coordinator.id) {
    ids.add(cleanString(directory.coordinator.id));
  }
  if (audiences.has(AUDIENCE.ENGINEERING_MEMBERS) && Array.isArray(directory.members)) {
    for (const m of directory.members) if (m && m.id) ids.add(cleanString(m.id));
  }
  ids.delete('');
  return [...ids];
}

/**
 * Build the NOTIFICATION_SENT timeline event for a dispatched notification.
 * The Assignment Engine's markAvailable() records its own; this factory is for
 * a transport that dispatched the notification out-of-band and wants to log it.
 */
export function buildNotificationSentEvent(notification, recipientIds, options = {}) {
  return createTimelineEvent(TIMELINE_EVENT.NOTIFICATION_SENT, {
    actor: options.actor,
    metadata: {
      notificationId: notification && notification.id,
      recipientCount: Array.isArray(recipientIds) ? recipientIds.length : 0,
    },
    now: options.now,
  });
}

/* ── Future-source extension registry (interfaces only) ──────────────────
   Reserved so a later sprint can attach a source-specific notification
   strategy (bidang request, preventive maintenance, spare part, scheduled
   maintenance) WITHOUT modifying this engine. No such strategy is implemented
   or invoked this sprint — the direct publish flow above is the only behaviour. */

const _sourceNotifiers = new Map();

/**
 * Register a notifier strategy for a future request source. A strategy is a
 * function (assignment, options) → EngineeringNotification. Ignored for the
 * DIRECT source, which is handled by buildPublishNotification.
 * @param {string} source        SOURCE.* (a future source)
 * @param {Function} notifier
 * @returns {boolean} whether it was registered
 */
export function registerSourceNotifier(source, notifier) {
  if (source === SOURCE.DIRECT || typeof notifier !== 'function') return false;
  _sourceNotifiers.set(source, notifier);
  return true;
}

/** Whether a future-source notifier has been registered (extension probe). */
export function hasSourceNotifier(source) {
  return _sourceNotifiers.has(source);
}

/**
 * Build the appropriate notification for an assignment by its source. DIRECT
 * uses the implemented publish flow; a future source delegates to its
 * registered notifier if one exists, otherwise falls back to the direct flow.
 * This is the single extension seam for future request-driven notifications.
 */
export function buildNotificationForAssignment(assignment = {}, options = {}) {
  const source = cleanString(assignment.source) || SOURCE.DIRECT;
  if (source !== SOURCE.DIRECT && _sourceNotifiers.has(source)) {
    const built = _sourceNotifiers.get(source)(assignment, options);
    if (isPlainObject(built)) return built;
  }
  return buildPublishNotification(assignment, options);
}

/** Clear registered notifiers (test/teardown helper). */
export function _resetSourceNotifiers() {
  _sourceNotifiers.clear();
}

/** Whether an assignment is in a state where a publish notification is due. */
export function shouldNotifyOnPublish(assignment) {
  return !!assignment && assignment.status === STATUS.PUBLISHED;
}
