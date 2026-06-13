'use strict';

/* ============================================================
   notifications/registry.js — single source of truth for which
   events become notifications, on which channels, with which copy.

   Replaces the logic that was spread across:
     • js/notifications.js   OPERATIONAL_ACTIONS whitelist
     • js/notifications.js   ACTION_META (per-type metadata)
     • js/notification-service.js  per-send recipient fan-out

   Adding a new notifiable event = one entry here. Enabling push
   later = add 'push' to a channels array — nothing else changes.

   `recipients` is delegated to functions/src/notifications/recipients.js
   (the unified resolver); the registry only declares channels + copy.
   Types intentionally ABSENT (assignment.updated/deleted, request.updated,
   notification.sent) are non-notifiable → the engine no-ops on them.
   ============================================================ */

const { CHANNELS } = require('./model');

const { IN_APP, TELEGRAM, PUSH } = CHANNELS;

/* PUSH is on the assignment + request lifecycle and request.created.
   Membership only makes dispatch() INVOKE dispatchPush — it records a
   shadow row until NOTIFICATION_FLAGS.channels.push (or a pilot
   allowlist entry) makes it actually send (v1.11.3 §7). comment.added
   PUSH is intentionally deferred to v1.11.5. */
const REGISTRY = {
  'assignment.created':   { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.created' },
  'assignment.started':   { channels: [IN_APP],                 template: 'assignment.started' },
  'assignment.completed': { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.completed' },
  'assignment.cancelled': { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.cancelled' },

  'request.created':      { channels: [IN_APP, TELEGRAM, PUSH], template: 'request.created' },
  'request.approved':     { channels: [IN_APP, TELEGRAM, PUSH], template: 'request.approved' },
  'request.rejected':     { channels: [IN_APP, TELEGRAM, PUSH], template: 'request.rejected' },

  'comment.added':        { channels: [IN_APP, TELEGRAM],       template: 'comment.added' },
};

/** Registry entry for a canonical type, or null if not notifiable. */
function getRegistryEntry(type) {
  return REGISTRY[type] || null;
}

/** Whether an event type produces notifications at all. */
function isNotifiable(type) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type);
}

module.exports = { REGISTRY, getRegistryEntry, isNotifiable };
