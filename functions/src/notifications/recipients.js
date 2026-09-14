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

/** All active Engineering coordinators / members (v1.20.4). */
function engCoordinators(users) {
  return users.filter(u => u.role === 'engineering_coordinator' && isActive(u));
}
function engMembers(users) {
  return users.filter(u => u.role === 'engineering_member' && isActive(u));
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
      // v1.25.x Final Hardening (Part 4): admins were already seeing this in
      // the in-app Notification Center via the legacy /logs path (isVisibleToUser
      // — role==='admin' sees everything). Now that the bell reads assignment.*
      // from THIS SAME server outbox instead (js/notifications.js), admins must
      // be a resolved recipient here too, or they'd silently lose that visibility.
      admins(users).forEach(a => add(a));
      break;
    }
    case 'assignment.reassigned': {
      // Both drivers are recipients of the SAME event — templates.js branches
      // per-recipient (previous driver vs new driver) using
      // payload.previousDriverUsername/previousDriver vs driverUsername/driver.
      if (p.previousDriverUsername || p.previousDriver) {
        add(resolveDriver(users, { driver: p.previousDriver, driverUsername: p.previousDriverUsername }));
      }
      add(resolveDriver(users, p));
      add(byUsername(users, p.requesterId));
      break;
    }
    case 'assignment.updated': {
      // A meaningful, debounced, non-reassignment change (date/time beyond
      // threshold/destination/vehicle) — v1.25.x Part 2/3.
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
      // System-originated (no human actor to exclude) — remind everyone with
      // an operational stake in the trip: assigned driver + requester (if the
      // trip came from a request) + all active admins (fleet oversight).
      // Dedup is handled by add(); whether each actually receives PUSH is the
      // role gate (REMINDER_FLAGS.pushRoles) — admins/drivers live, bidang shadow.
      add(resolveDriver(users, p));
      add(byUsername(users, p.requesterId));
      admins(users).forEach(a => add(a));
      break;
    }
    case 'comment.added': {
      // Thread participants minus the author: admin(s), owning bidang, assigned driver.
      admins(users).forEach(a => add(a, { excludeActor: true }));
      add(byUsername(users, p.requesterId), { excludeActor: true });
      add(resolveDriver(users, p), { excludeActor: true });
      break;
    }

    /* ── Engineering Operations (v1.20.4) — role-based fan-out ──────────────
       Recipients resolve from the user directory by Engineering role, plus the
       assignment's own participant members (by workerId = username) for the
       verify/reject/postpone/cancel outcomes. Actor is excluded so no one is
       notified of their own action. */
    case 'engineering.published': {
      // New work published → whole Engineering team can pick it up.
      engCoordinators(users).forEach(u => add(u));
      engMembers(users).forEach(u => add(u));
      break;
    }
    case 'engineering.accepted':
    case 'engineering.joined':
    case 'engineering.resumed': {
      // Field progress → supervisors (admins + coordinators), minus the actor.
      admins(users).forEach(a => add(a, { excludeActor: true }));
      engCoordinators(users).forEach(u => add(u, { excludeActor: true }));
      break;
    }
    case 'engineering.completed': {
      // Work finished → verification requested → the verifiers.
      admins(users).forEach(a => add(a, { excludeActor: true }));
      engCoordinators(users).forEach(u => add(u, { excludeActor: true }));
      break;
    }
    case 'engineering.verified': {
      // Certified → the members who did the work + admins, minus the verifier.
      (p.participantIds || []).forEach(id => add(byUsername(users, id), { excludeActor: true }));
      admins(users).forEach(a => add(a, { excludeActor: true }));
      break;
    }
    case 'engineering.rejected': {
      // Sent back → the members who did the work + coordinators, minus the verifier.
      (p.participantIds || []).forEach(id => add(byUsername(users, id), { excludeActor: true }));
      engCoordinators(users).forEach(u => add(u, { excludeActor: true }));
      break;
    }
    case 'engineering.postponed':
    case 'engineering.cancelled': {
      admins(users).forEach(a => add(a, { excludeActor: true }));
      engCoordinators(users).forEach(u => add(u, { excludeActor: true }));
      (p.participantIds || []).forEach(id => add(byUsername(users, id), { excludeActor: true }));
      break;
    }
    /* ── Agenda & To-Do (V1.31, Phase C2) ──────────────────────────────────
       DELIBERATELY, structurally different from every case above: NONE of
       these ever call admins(users). Every other case in this file CCs
       admins somewhere (fleet oversight, approval visibility) — doing that
       here would notify every Sarpras admin of a Kabid-scope event's/task's
       existence through the bell even when they are not a participant,
       reopening exactly the privacy leak database.rules.json's agendaEvents/
       agendaTasks/agendaAudit rules were built to close (Phase B.1 §5.3) —
       just through the notification path instead of the read path, which
       Rules alone cannot prevent (the Admin SDK bypasses Rules by design).
       If you are adding an Agenda-adjacent case here later, do NOT copy a
       nearby non-Agenda case that CCs admins(); copy one of these instead. */
    case 'agenda.created':
    case 'agenda.updated':
    case 'agenda.cancelled': {
      Object.keys(p.participants || {}).forEach(u => add(byUsername(users, u), { excludeActor: true }));
      break;
    }
    case 'agenda.participant_added':
    case 'agenda.participant_removed': {
      // Personal notice to the ONE affected person, not a fan-out to every
      // participant — avoids notifying the whole guest list every time
      // anyone is added/removed from a meeting.
      add(byUsername(users, p.affectedUsername), { excludeActor: true });
      break;
    }
    case 'agenda.reminder':
    case 'agenda.overdue': {
      // System-originated (the reminder tick has no human actor to exclude).
      add(byUsername(users, p.organizerUsername));
      Object.keys(p.participants || {}).forEach(u => add(byUsername(users, u)));
      break;
    }
    case 'task.created':
    case 'task.updated': {
      Object.keys(p.responsible || {}).forEach(u => add(byUsername(users, u), { excludeActor: true }));
      break;
    }
    case 'task.completed': {
      Object.keys(p.responsible || {}).forEach(u => add(byUsername(users, u), { excludeActor: true }));
      add(byUsername(users, p.createdBy), { excludeActor: true });
      break;
    }
    case 'task.responsible_added':
    case 'task.responsible_removed': {
      add(byUsername(users, p.affectedUsername), { excludeActor: true });
      break;
    }
    case 'task.reminder':
    case 'task.overdue': {
      Object.keys(p.responsible || {}).forEach(u => add(byUsername(users, u)));
      break;
    }

    /* ── Calendar (V1.31.1 "Agenda, Kalender & To-Do") ──────────────────────
       Byte-for-byte the SAME shape and the SAME privacy reasoning as the
       Agenda cases immediately above — never admins(), for the identical
       Kabid-scope-leak reason. calendar.ended takes agenda.overdue's slot
       (system-originated, organizer + all participants). */
    case 'calendar.created':
    case 'calendar.updated':
    case 'calendar.cancelled': {
      Object.keys(p.participants || {}).forEach(u => add(byUsername(users, u), { excludeActor: true }));
      break;
    }
    case 'calendar.participant_added':
    case 'calendar.participant_removed': {
      add(byUsername(users, p.affectedUsername), { excludeActor: true });
      break;
    }
    case 'calendar.reminder':
    case 'calendar.ended': {
      add(byUsername(users, p.organizerUsername));
      Object.keys(p.participants || {}).forEach(u => add(byUsername(users, u)));
      break;
    }

    default:
      // request.updated / notification.sent (assignment.started is handled
      // above) intentionally resolve to no recipients in this foundation.
      break;
  }

  return out;
}

module.exports = { resolveRecipients, loadUserDirectory, telegramChatIds, byUsername };
