'use strict';

/* ============================================================
   notifications/dispatcher.js — channel delivery foundation

   dispatch(notification, context) fans a single canonical
   notification out to its enabled channels. The dispatcher is the
   ONLY place that knows how to talk to a channel; the engine never
   contains channel-specific logic.

   Channels:
     • dispatchInApp   — the persisted /notifications record IS the
       in-app surface; this records the inApp delivery row.
     • dispatchTelegram — server send via the v1.11.1.3 Telegram
       foundation (sendWithRetry + delivery audit). Idempotent.
     • dispatchPush    — live Web Push (v1.11.3 lifecycle, v1.11.4
       reminders) via the v1.11.3 push foundation. Multi-device, retried,
       self-pruning on Gone (404/410) subscriptions.

   v1.25.x Driver Notification V2 (Final Hardening): this dispatcher is now
   the SOLE creator of every assignment-lifecycle notification on every
   channel — Push, Telegram, and the in-app /notifications record all
   originate from the SAME canonical notification (one per recipient,
   engine.js#processEvent), never from a second, independent client-side
   send. See liveFor() for the live per-channel gate this relies on.

   Migration safety: per-channel flags in config/constants.js#NOTIFICATION_FLAGS
   / REMINDER_FLAGS, and (for assignment.* lifecycle events specifically)
   the LIVE /settings/notifications node via config/runtimeSettings.js. While
   a channel is OFF the dispatcher records a SHADOW delivery (status queued,
   shadow:true) and sends nothing.
   ============================================================ */

const logger = require('firebase-functions/logger');
const {
  CHANNELS, DELIVERY_STATUS, NOTIFICATION_STATUS,
  recordDelivery, getDelivery, deliveryId, setNotificationStatus,
} = require('./model');
const { render } = require('./templates');
const { telegramChatIds } = require('./recipients');
const { NOTIFICATION_FLAGS, PUSH_CONFIG, REMINDER_FLAGS } = require('../config/constants');
const { getAssignmentNotifyConfig } = require('../config/runtimeSettings');
const { sendWithRetry } = require('../telegram/retry');
const { recordDelivery: recordTelegramAudit } = require('../telegram/deliveryLog');
const { loadSubscriptions, pruneSubscription } = require('../push/model');
const { sendPushWithRetry } = require('../push/send');

/** assignment.created/reassigned/updated/completed/cancelled — NOT
 *  assignment.reminder (its own, separate REMINDER_FLAGS-gated path). */
function isAssignmentLifecycleType(type) {
  return typeof type === 'string' && type.startsWith('assignment.') && type !== 'assignment.reminder';
}

/**
 * The single send-vs-shadow gate (v1.11.4, extended v1.25.x Final Hardening
 * Part 1/4). Reminder-type notifications consult REMINDER_FLAGS; assignment
 * LIFECYCLE notifications (created/reassigned/updated/completed/cancelled)
 * consult the LIVE /settings/notifications node (config/runtimeSettings.js —
 * the SAME node js/settings-store.js owns, edited from the app's Settings
 * screen, Part 3); everything else (request.*, comment.added) is unchanged,
 * consulting NOTIFICATION_FLAGS/PUSH_CONFIG as before. This MUST read the
 * same REMINDER_FLAGS predicates that onEventWrite uses to load credentials
 * (REV2 §2.2) — gate and credential cannot disagree, or a reminder channel
 * either fails or leaks.
 *
 * @param {string} channel        CHANNELS.*
 * @param {Object} notification   carries `type` and `recipientId`
 * @param {string} recipientId    the resolved recipient (username/uid)
 * @param {string} [recipientRole] the recipient's role (role-based reminder push)
 * @returns {Promise<boolean>} true → real send; false → shadow.
 */
async function liveFor(channel, notification, recipientId, recipientRole) {
  const isReminder = notification && notification.type === 'assignment.reminder';
  const isAssignmentLifecycle = !isReminder && isAssignmentLifecycleType(notification && notification.type);

  if (channel === CHANNELS.IN_APP) {
    // In-app is the shared surface; reminders inherit the lifecycle flag.
    return Boolean(NOTIFICATION_FLAGS.channels.inApp);
  }
  if (channel === CHANNELS.TELEGRAM) {
    if (isReminder) return Boolean(REMINDER_FLAGS.channels.telegram);
    if (isAssignmentLifecycle) {
      const cfg = await getAssignmentNotifyConfig();
      return Boolean(cfg.enableTelegramFallback);
    }
    return Boolean(NOTIFICATION_FLAGS.channels.telegram); // request.*/comment.added — unchanged
  }
  if (channel === CHANNELS.PUSH) {
    if (isReminder) {
      // Role-based pilot (admin/driver) OR exact-username pilot OR global.
      return Boolean(REMINDER_FLAGS.channels.push)
        || _inRoles(REMINDER_FLAGS.pushRoles, recipientRole)
        || _inAllowlist(REMINDER_FLAGS.pilotAllowlist, recipientId);
    }
    if (isAssignmentLifecycle) {
      const cfg = await getAssignmentNotifyConfig();
      // Can only NARROW the global push flag, never widen it.
      if (!cfg.enablePushNotification) return false;
    }
    return Boolean(NOTIFICATION_FLAGS.channels.push) || _inAllowlist(PUSH_CONFIG.pilotAllowlist, recipientId);
  }
  return false;
}

/** Exact, case-sensitive allowlist match (the documented pilot gotcha). */
function _inAllowlist(list, recipientId) {
  return Array.isArray(list) && list.map(String).includes(String(recipientId));
}

/** Role match (case-insensitive — roles are a controlled lowercase vocab). */
function _inRoles(list, role) {
  if (!Array.isArray(list) || !role) return false;
  const r = String(role).trim().toLowerCase();
  return list.map(x => String(x).trim().toLowerCase()).includes(r);
}

/**
 * Is this recipient the actor who triggered the event? (v1.12.2.1)
 * Used to suppress self-PUSH only — a user should not get a push popup for an
 * action they just performed (e.g. bidang submitting a request, an admin
 * approving/rejecting one). The notification record, in-app surface, audit
 * deliveries, and Telegram are all unaffected; this gates PUSH delivery only.
 *
 * Identity match prefers the actor uid (request.created carries
 * actor.uid = requesterId). When the emitter has no uid (request.approved /
 * request.rejected persist only the admin's display name — onRequestWrite
 * deriveActor), fall back to display-name identity against the resolved
 * recipient. Returning false (no actor / ambiguous) means "send" — never
 * silently drops a legitimate recipient.
 */
function _isActorRecipient(recipientId, recipient, event) {
  const actor = event && event.actor;
  if (!actor) return false;
  const rid = String(recipientId || '').trim().toLowerCase();
  if (actor.uid) {
    return String(actor.uid).trim().toLowerCase() === rid;
  }
  if (actor.displayName && recipient && recipient.displayName) {
    return String(recipient.displayName).trim().toLowerCase()
      === String(actor.displayName).trim().toLowerCase();
  }
  return false;
}

/**
 * Dispatch one notification to all its channels. Channel failures are
 * isolated (one bad channel never blocks the others).
 *
 * @param {Object} notification  canonical record (model.buildNotification)
 * @param {Object} context       { event, recipient (user obj), token? }
 */
async function dispatch(notification, context = {}) {
  const results = [];
  for (const channel of notification.channels || []) {
    try {
      if (channel === CHANNELS.IN_APP) {
        results.push(await dispatchInApp(notification, context));
      } else if (channel === CHANNELS.TELEGRAM) {
        results.push(await dispatchTelegram(notification, context));
      } else if (channel === CHANNELS.PUSH) {
        results.push(await dispatchPush(notification, context));
      } else {
        logger.warn('[dispatcher] unknown channel', { channel });
      }
    } catch (err) {
      logger.error('[dispatcher] channel dispatch failed', {
        channel, notificationId: notification.id, error: err.message,
      });
    }
  }
  await setNotificationStatus(notification.recipientId, notification.id, NOTIFICATION_STATUS.DISPATCHED);
  return results;
}

/* ── inApp ──────────────────────────────────────────────────
   The notification record (written by the engine) is the in-app
   surface. Delivery here = confirming/auditing that surface. */
async function dispatchInApp(notification) {
  const base = {
    eventId: notification.eventId,
    notificationId: notification.id,
    recipientId: notification.recipientId,
    channel: CHANNELS.IN_APP,
    target: notification.recipientId,
  };
  if (!(await liveFor(CHANNELS.IN_APP, notification, notification.recipientId))) {
    return recordDelivery({ ...base, status: DELIVERY_STATUS.QUEUED, shadow: true });
  }
  return recordDelivery({ ...base, status: DELIVERY_STATUS.SENT, attempts: 1 });
}

/**
 * Push-coverage check (v1.25.x Driver Notification V2, Part 1). "Coverage"
 * means push would ACTUALLY be attempted for this recipient/notification —
 * live per liveFor() AND at least one subscription on file — not merely
 * "could theoretically subscribe". Fails CLOSED toward Telegram on error:
 * a lookup failure must never silently drop a driver's only notification.
 */
async function _hasLivePushCoverage(notification, recipientId, recipientRole) {
  if (!(await liveFor(CHANNELS.PUSH, notification, recipientId, recipientRole))) return false;
  try {
    const subs = await loadSubscriptions(recipientId);
    return subs.length > 0;
  } catch (err) {
    logger.error('[dispatcher] push-coverage check failed', { recipientId, error: err.message });
    return false;
  }
}

/* ── telegram ───────────────────────────────────────────────
   Uses the v1.11.1.3 server Telegram foundation. While the channel
   flag is OFF, records a shadow delivery and sends nothing — the browser
   path remains the live sender for lifecycle Telegram (reminder Telegram
   has no browser equivalent — see REMINDER_FLAGS). v1.25.x Part 1: for a
   DRIVER recipient, Telegram is now a FALLBACK — sent only when Push
   cannot reach them (no live subscription). Admin/requester Telegram
   (request.*, comment.added) is unaffected — this gate only applies to
   role==='driver'. */
async function dispatchTelegram(notification, { event, recipient, token }) {
  const base = {
    eventId: notification.eventId,
    notificationId: notification.id,
    recipientId: notification.recipientId,
    channel: CHANNELS.TELEGRAM,
  };

  const chatIds = telegramChatIds(recipient);
  if (!chatIds.length) {
    // notificationsEnabled off or no chat IDs — nothing deliverable.
    return recordDelivery({ ...base, status: DELIVERY_STATUS.FAILED, error: 'no telegram target' });
  }

  // Shadow: channel off (assignment-lifecycle enableTelegramFallback setting
  // off, reminder channel off, or the unrelated request.*/comment.added
  // flag off). Record intent, do NOT send. All of that gating (including
  // the live /settings/notifications read for assignment lifecycle) is in
  // liveFor() — the ONE place that decides live-vs-shadow per channel.
  if (!(await liveFor(CHANNELS.TELEGRAM, notification, notification.recipientId))) {
    return recordDelivery({
      ...base, status: DELIVERY_STATUS.QUEUED, shadow: true, target: chatIds.join(','),
    });
  }

  // Push-primary fallback gate (Part 1) — driver recipients only. Admin /
  // requester Telegram (request.*, comment.added, and assignment-lifecycle
  // admins/requester) never reaches this branch — only a driver's Telegram
  // is conditional on THEIR OWN push coverage. liveFor() above already
  // confirmed enableTelegramFallback is on, so reaching here means Telegram
  // is allowed in principle; this only decides whether THIS driver specifically
  // still needs it.
  if (recipient && recipient.role === 'driver'
      && await _hasLivePushCoverage(notification, notification.recipientId, recipient.role)) {
    return recordDelivery({
      ...base, status: DELIVERY_STATUS.QUEUED, shadow: true, target: chatIds.join(','), error: 'push-covered-skip',
    });
  }

  // Idempotency: a prior successful send for this (event,recipient,channel) → skip.
  const existing = await getDelivery(deliveryId(base));
  if (existing && existing.status === DELIVERY_STATUS.SENT) return existing;

  if (!token) {
    return recordDelivery({ ...base, status: DELIVERY_STATUS.FAILED, error: 'telegram token unavailable' });
  }

  const text = render(notification.type, event, recipient, CHANNELS.TELEGRAM)?.text || notification.body;
  let last = null;
  for (const chatId of chatIds) {
    last = await sendWithRetry(token, chatId, text);
    // Preserve the existing Telegram audit foundation (/telegram_deliveries
    // + notification.sent). Do NOT remove existing delivery logging (Phase 7).
    try {
      await recordTelegramAudit({
        eventId: notification.eventId,
        chatId,
        ok: last.ok,
        status: last.status,
        error: last.ok ? '' : last.description,
        attempts: last.attempts,
        terminal: last.terminal,
      });
    } catch (err) {
      logger.error('[dispatcher] telegram audit failed', { error: err.message });
    }
  }

  return recordDelivery({
    ...base,
    status:   last && last.ok ? DELIVERY_STATUS.SENT : DELIVERY_STATUS.FAILED,
    attempts: (last && last.attempts) || 1,
    terminal: Boolean(last && last.terminal),
    error:    last && !last.ok ? last.description : null,
    target:   chatIds.join(','),
  });
}

/* ── push (Web Push / VAPID — v1.11.3) ──────────────────────
   Multi-device. Resolves the recipient's /push_subscriptions, sends
   one encrypted Web Push per device (with retry), prunes Gone (404/410)
   subscriptions, and records ONE aggregate delivery row carrying the
   per-device breakdown.

   Gating (architecture §7 — two-part control, no accidental sends):
     • registry membership puts PUSH in notification.channels → we get here.
     • NOTIFICATION_FLAGS.channels.push (or a Phase B/C pilot allowlist
       entry for this recipient) decides SEND vs SHADOW. While neither
       is satisfied we record a shadow row and send nothing. */
async function dispatchPush(notification, { event, recipient, vapid } = {}) {
  const base = {
    eventId: notification.eventId,
    notificationId: notification.id,
    recipientId: notification.recipientId,
    channel: CHANNELS.PUSH,
  };

  // Actor self-PUSH suppression (v1.12.2.1). The actor still gets the in-app
  // record + (shadow) audit; only the push popup is withheld. Recorded as a
  // non-sent row so the suppression is auditable and idempotent on re-dispatch.
  if (_isActorRecipient(notification.recipientId, recipient, event)) {
    return recordDelivery({
      ...base, status: DELIVERY_STATUS.QUEUED, shadow: true, target: 'actor-excluded',
    });
  }

  const subs = await loadSubscriptions(notification.recipientId);
  if (!subs.length) {
    return recordDelivery({ ...base, status: DELIVERY_STATUS.FAILED, error: 'no push subscription' });
  }

  // Shadow: record intent + device count, send nothing. Reminder vs
  // lifecycle gating (incl. each pilot allowlist + role pilot) is in liveFor();
  // the recipient's role drives the role-based reminder push pilot.
  if (!(await liveFor(CHANNELS.PUSH, notification, notification.recipientId, recipient && recipient.role))) {
    return recordDelivery({
      ...base, status: DELIVERY_STATUS.QUEUED, shadow: true, target: `${subs.length} device(s)`,
    });
  }

  // Idempotency: a prior successful push for this (event,recipient) → skip.
  const existing = await getDelivery(deliveryId(base));
  if (existing && existing.status === DELIVERY_STATUS.SENT) return existing;

  if (!vapid || !vapid.publicKey || !vapid.privateKey) {
    return recordDelivery({ ...base, status: DELIVERY_STATUS.FAILED, error: 'vapid keys unavailable' });
  }

  const rendered = render(notification.type, event, recipient, CHANNELS.PUSH) || {};
  const payload = JSON.stringify({
    title: rendered.title || notification.title,
    body:  rendered.body || notification.body,
    data:  rendered.data || {},
  });

  const devices = {};
  let anySent = false, anyExpired = false, anyOther = false, maxAttempts = 0;

  for (const sub of subs) {
    const r = await sendPushWithRetry(
      { endpoint: sub.endpoint, keys: sub.keys }, payload, vapid,
    );
    maxAttempts = Math.max(maxAttempts, r.attempts || 1);
    if (r.ok) {
      anySent = true;
      devices[sub.deviceId] = { status: DELIVERY_STATUS.SENT, attempts: r.attempts };
    } else if (r.expired) {
      anyExpired = true;
      devices[sub.deviceId] = { status: DELIVERY_STATUS.EXPIRED, attempts: r.attempts, error: r.error };
      try { await pruneSubscription(notification.recipientId, sub.deviceId); }
      catch (err) { logger.error('[dispatcher] push prune failed', { error: err.message }); }
    } else {
      anyOther = true;
      devices[sub.deviceId] = { status: DELIVERY_STATUS.FAILED, attempts: r.attempts, error: r.error };
    }
  }

  const status = anySent
    ? DELIVERY_STATUS.SENT
    : (anyExpired && !anyOther ? DELIVERY_STATUS.EXPIRED : DELIVERY_STATUS.FAILED);

  return recordDelivery({
    ...base, status, attempts: maxAttempts, devices, target: `${subs.length} device(s)`,
  });
}

module.exports = { dispatch, dispatchInApp, dispatchTelegram, dispatchPush, liveFor, _isActorRecipient };
