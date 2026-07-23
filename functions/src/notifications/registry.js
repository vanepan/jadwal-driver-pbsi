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
   Types intentionally ABSENT (assignment.deleted, request.updated,
   notification.sent) are non-notifiable → the engine no-ops on them.

   v1.25.x Driver Notification V2 (Part 2): assignment.updated and the new
   assignment.reassigned are now BOTH notifiable — onAssignmentWrite.js only
   ever emits either one after its own meaningful-change + debounce gates
   (Parts 3 + 4), so by the time an event reaches this registry it is always
   worth telling the driver about; no additional filtering happens here.
   ============================================================ */

const { CHANNELS } = require('./model');

const { IN_APP, TELEGRAM, PUSH } = CHANNELS;

/* PUSH is on the assignment + request lifecycle and request.created.
   Membership only makes dispatch() INVOKE dispatchPush — it records a
   shadow row until NOTIFICATION_FLAGS.channels.push (or a pilot
   allowlist entry) makes it actually send (v1.11.3 §7). comment.added
   PUSH is intentionally deferred to v1.11.5. */
const REGISTRY = {
  'assignment.created':    { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.created' },
  'assignment.reassigned': { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.reassigned' },
  'assignment.updated':    { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.updated' },
  'assignment.started':    { channels: [IN_APP],                 template: 'assignment.started' },
  'assignment.completed':  { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.completed' },
  'assignment.cancelled':  { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.cancelled' },

  'request.created':      { channels: [IN_APP, TELEGRAM, PUSH], template: 'request.created' },
  'request.approved':     { channels: [IN_APP, TELEGRAM, PUSH], template: 'request.approved' },
  'request.rejected':     { channels: [IN_APP, TELEGRAM, PUSH], template: 'request.rejected' },

  'comment.added':        { channels: [IN_APP, TELEGRAM],       template: 'comment.added' },

  // v1.11.4 Reminder Engine. Membership only makes dispatch() INVOKE each
  // arm; whether it SENDS is the REMINDER_FLAGS gate (dispatcher.liveFor),
  // independent of the lifecycle NOTIFICATION_FLAGS.
  'assignment.reminder':  { channels: [IN_APP, TELEGRAM, PUSH], template: 'assignment.reminder' },

  // v1.20.4 Engineering Operations — in-app + push (the live channels). No
  // Telegram: Engineering members are notified in-app and via Web Push, the
  // same delivery every other live notifiable event uses.
  'engineering.published': { channels: [IN_APP, PUSH], template: 'engineering.published' },
  'engineering.accepted':  { channels: [IN_APP, PUSH], template: 'engineering.accepted' },
  'engineering.joined':    { channels: [IN_APP, PUSH], template: 'engineering.joined' },
  'engineering.resumed':   { channels: [IN_APP, PUSH], template: 'engineering.resumed' },
  'engineering.postponed': { channels: [IN_APP, PUSH], template: 'engineering.postponed' },
  'engineering.completed': { channels: [IN_APP, PUSH], template: 'engineering.completed' },
  'engineering.verified':  { channels: [IN_APP, PUSH], template: 'engineering.verified' },
  'engineering.rejected':  { channels: [IN_APP, PUSH], template: 'engineering.rejected' },
  'engineering.cancelled': { channels: [IN_APP, PUSH], template: 'engineering.cancelled' },
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
