'use strict';

/* ============================================================
   notifications/recipients.js — unified recipient resolution

   Collapses the THREE divergent encodings of "who is involved in
   this event" into one server-side resolver:

     • notification-service.js  findDriverUser + role fan-out  (Telegram)
     • notifications.js         isVisibleToUser                (in-app)
     • comments.js              _canView                       (comments)

   resolveRecipients(event, users) → { users: [], telegram: [], push: [] }

   This release: SHADOW ONLY. The resolver is exercised by
   onEventWrite to validate parity against the legacy paths. It is
   NOT yet authoritative and drives no sending. push[] is always [].
   ============================================================ */

const { db } = require('../config/admin');

const USERS_PATH = 'users';

/**
 * Load the user directory once (Admin SDK bypasses rules).
 * @returns {Promise<Array>} array of user objects (username included)
 */
async function loadUserDirectory() {
  const snap = await db.ref(USERS_PATH).once('value');
  const raw = snap.val() || {};
  return Object.entries(raw).map(([username, u]) => ({ username, ...u }));
}

const lc = (v) => String(v || '').trim().toLowerCase();
const isActive = (u) => u && u.active !== false && u.archived !== true;

/** All active admins. */
function admins(users) {
  return users.filter(u => u.role === 'admin' && isActive(u));
}

/** Resolve a user by username (= uid). */
function byUsername(users, username) {
  if (!username) return null;
  const key = lc(username);
  return users.find(u => lc(u.username) === key) || null;
}

/**
 * Resolve the driver user for an assignment payload. Prefers the stable
 * driverUsername; falls back to display-name match (legacy entries).
 * Mirrors notification-service.js#findDriverUser + isVisibleToUser fallback.
 */
function resolveDriver(users, payload) {
  if (payload.driverUsername) {
    const u = byUsername(users, payload.driverUsername);
    if (u) return u;
  }
  const name = lc(payload.driver);
  if (!name) return null;
  return users.find(u =>
    u.role === 'driver' && isActive(u) &&
    (lc(u.displayName) === name || lc(u.username) === name)
  ) || null;
}

/** Collect telegram chat IDs for a user, gated by notificationsEnabled. */
function telegramChatIds(user) {
  if (!user || !user.notificationsEnabled) return [];
  const ids = [];
  if (user.telegramChatIds && typeof user.telegramChatIds === 'object') {
    Object.values(user.telegramChatIds).forEach(v => { if (v) ids.push(String(v).trim()); });
  }
  if (!ids.length && user.telegramChatId) ids.push(String(user.telegramChatId).trim());
  return ids.filter(Boolean);
}

/**
 * Resolve recipients for a canonical event.
 *
 * @param {Object} event  — canonical envelope (events/schema.js)
 * @param {Array}  users  — user directory (loadUserDirectory())
 * @returns {{ users: string[], telegram: string[], push: string[] }}
 */
function resolveRecipients(event, users) {
  const out = { users: [], telegram: [], push: [] }; // push reserved — always empty this release
  if (!event || !Array.isArray(users)) return out;

  const type = event.type;
  const p = event.payload || {};
  const actorUid = event.actor && event.actor.uid ? lc(event.actor.uid) : null;

  const seenUsers = new Set();
  const seenTelegram = new Set();

  const add = (user, { excludeActor = false } = {}) => {
    if (!user || !user.username) return;
    if (excludeActor && actorUid && lc(user.username) === actorUid) return;
    if (!seenUsers.has(lc(user.username))) {
      seenUsers.add(lc(user.username));
      out.users.push(user.username);
    }
    for (const id of telegramChatIds(user)) {
      if (!seenTelegram.has(id)) { seenTelegram.add(id); out.telegram.push(id); }
    }
  };

  switch (type) {
    case 'request.created': {
      admins(users).forEach(a => add(a));
      add(byUsername(users, p.requesterId)); // requester sees their own submission in-app
      break;
    }
    case 'request.approved':
    case 'request.rejected': {
      add(byUsername(users, p.requesterId));
      admins(users).forEach(a => add(a));
      break;
    }
    case 'assignment.created': {
      add(resolveDriver(users, p));
      add(byUsername(users, p.requesterId));
      break;
    }
    case 'assignment.started': {
      // Trip started by the driver — notify the trackers (admins + requester),
      // excluding the actor (the driver who started it).
      admins(users).forEach(a => add(a, { excludeActor: true }));
      add(byUsername(users, p.requesterId), { excludeActor: true });
      break;
    }
    case 'assignment.completed': {
      admins(users).forEach(a => add(a));
      add(byUsername(users, p.requesterId));
      break;
    }
    case 'assignment.cancelled': {
      add(resolveDriver(users, p));
      // Cancelled by bidang → admins; otherwise → requester (mirrors notification-service).
      const cancelledByRole = lc(event.actor && event.actor.role);
      if (cancelledByRole === 'bidang') {
        admins(users).forEach(a => add(a));
      } else {
        add(byUsername(users, p.requesterId));
      }
      break;
    }
    case 'assignment.reminder': {
      // System-originated (no human actor to exclude) — remind everyone on
      // the trip: assigned driver + requester (if the trip came from a request).
      add(resolveDriver(users, p));
      add(byUsername(users, p.requesterId));
      break;
    }
    case 'comment.added': {
      // Thread participants minus the author: admin(s), owning bidang, assigned driver.
      admins(users).forEach(a => add(a, { excludeActor: true }));
      add(byUsername(users, p.requesterId), { excludeActor: true });
      add(resolveDriver(users, p), { excludeActor: true });
      break;
    }
    default:
      // assignment.updated / request.updated / assignment.started / notification.sent
      // intentionally resolve to no recipients in this foundation.
      break;
  }

  return out;
}

module.exports = { resolveRecipients, loadUserDirectory, telegramChatIds, byUsername };
