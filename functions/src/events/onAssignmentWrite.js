'use strict';

/* ============================================================
   events/onAssignmentWrite.js — authoritative assignment events

   Fires on every write to /assignments/{assignmentId}. Derives a
   canonical event from the TRUE state change (not a client-supplied
   log), so events cannot be forged or skipped by an offline client.

   Transition → type:
     • node created                 → assignment.created
     • status → 'cancelled'         → assignment.cancelled
     • status → 'completed'         → assignment.completed
     • status → 'started'           → assignment.started
     • node deleted                 → assignment.deleted
     • driver changed (meaningful)  → assignment.reassigned  (v1.25.x)
     • other meaningful change      → assignment.updated
     • no MEANINGFUL change         → no event at all         (v1.25.x Part 3)

   "Meaningful" (Part 3 — Change Threshold, isMeaningfulChange() below):
   driver / date / destination / vehicle changing is ALWAYS meaningful;
   a departure-time-only change is meaningful only past the LIVE
   changeThresholdMinutes setting (config/runtimeSettings.js — the SAME
   /settings/notifications node js/settings-store.js owns; see Part 1). A
   small nudge (e.g. 09:00→09:05) never reaches /events, so it can never
   spam a driver.

   Notification debounce (v1.25.x Final Hardening, Part 2 — a TRUE trailing-
   edge debounce, not a flat mandatory wait): assignment.updated /
   assignment.reassigned sleep the LIVE debounceMs, then re-read the LIVE
   assignment; if a newer write already superseded this one, this invocation
   skips SILENTLY — the newer invocation's own debounce window is what
   actually emits, using ITS before/after (the coalesced final state). An
   ISOLATED edit still only waits ONE debounce window (now a short, live-
   tunable ~2s default, not a flat 10s) before sending; a BURST of edits
   arriving faster than that window apart coalesces into exactly ONE
   notification, fired shortly after the LAST edit in the burst — earlier
   edits in the burst never independently notify. Persistence (the
   /assignments write itself, already committed before this trigger even
   runs) is never delayed — only the notification-worthy event this trigger
   would emit.

   Each logical change emits at most one event (status transition takes
   precedence over reassignment/update). onEventWrite is the downstream
   fan-out (registry → recipients → templates → dispatch).
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { getAssignmentNotifyConfig } = require('../config/runtimeSettings');
const { buildEnvelope, writeEvent } = require('./schema');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();

/** Minutes-from-midnight for "HH:MM" (or null if unparseable). */
function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? (Number(m[1]) * 60) + Number(m[2]) : null;
}

/**
 * Is the change from `before` to `after` "meaningful" enough to notify on?
 * (Part 3 — Change Threshold.) Driver/date/destination/vehicle changing is
 * ALWAYS meaningful; a departure-time-only nudge needs to clear
 * `thresholdMinutes`. Returns false for a no-op resave (nothing changed).
 *
 * Deliberately a PURE function (threshold passed in, not read from global
 * config) — the caller fetches the live value once via
 * getAssignmentNotifyConfig() (Part 1: the live /settings/notifications
 * node), keeping this testable with a plain number and with no Firebase
 * dependency of its own.
 */
function isMeaningfulChange(before, after, thresholdMinutes) {
  if (!before || !after) return true; // defensive — classify() already handles create/delete
  if (lc(before.driver) !== lc(after.driver)) return true;
  if ((before.date ?? before.startDate) !== (after.date ?? after.startDate)) return true;
  if (lc(before.destination) !== lc(after.destination)) return true;
  if (lc(before.vehicle) !== lc(after.vehicle)) return true;

  const beforeMin = timeToMinutes(before.startTime);
  const afterMin = timeToMinutes(after.startTime);
  if (beforeMin == null || afterMin == null) return beforeMin !== afterMin;
  const thresholdMin = Number(thresholdMinutes) || 0;
  return Math.abs(afterMin - beforeMin) >= thresholdMin;
}

/** Best-effort actor from the persisted node (the writer wasn't recorded server-side). */
function deriveActor(after, type) {
  if (type === 'assignment.cancelled' && after.cancelledBy) {
    return {
      uid:         after.cancelledBy.uid || null,
      role:        after.cancelledBy.role || null,
      displayName: after.cancelledBy.name || null,
    };
  }
  if (type === 'assignment.completed') {
    return { uid: null, role: null, displayName: after.completedBy || null };
  }
  if (type === 'assignment.created') {
    return { uid: null, role: null, displayName: after.createdBy || null };
  }
  return { uid: null, role: null, displayName: null };
}

/**
 * Payload mirrors the fields the recipient resolver + in-app center consume.
 * `prev` (only present for assignment.reassigned/assignment.updated) carries
 * the PRE-change values the templates use to render a "was X, now Y" diff —
 * e.g. the previous driver's "reassigned away" message shows THEIR original
 * date/time/destination/vehicle, not the new state.
 */
function buildPayload(node, before) {
  const payload = {
    driver:            node.driver ?? null,
    driverUsername:    node.driverUsername ?? null,
    vehicle:           node.vehicle ?? null,
    destination:       node.destination ?? null,
    date:              node.date ?? node.startDate ?? null,
    startTime:         node.startTime ?? null,
    endTime:           node.endTime ?? null,
    status:            node.status ?? null,
    requestId:         node.requestId ?? null,
    requesterId:       node.requesterId ?? null,
    cancellationReason: node.cancellationReason ?? null,
    distanceTravelled: node.distanceTravelled ?? null,
  };
  if (before) {
    payload.previousDriver         = before.driver ?? null;
    payload.previousDriverUsername = before.driverUsername ?? null;
    payload.previousVehicle        = before.vehicle ?? null;
    payload.previousDestination    = before.destination ?? null;
    payload.previousDate           = before.date ?? before.startDate ?? null;
    payload.previousStartTime      = before.startTime ?? null;
    payload.previousEndTime        = before.endTime ?? null;
  }
  return payload;
}

/**
 * Decide the canonical type from before/after snapshots. Returns null if no
 * event should be emitted at all (Part 3 — a non-meaningful update is
 * indistinguishable from no change, from the notification pipeline's view).
 * @param {number} thresholdMinutes — live changeThresholdMinutes (see isMeaningfulChange)
 */
function classify(before, after, thresholdMinutes) {
  const existedBefore = before !== null && before !== undefined;
  const existsAfter   = after !== null && after !== undefined;

  if (!existedBefore && existsAfter) return 'assignment.created';
  if (existedBefore && !existsAfter) return 'assignment.deleted';
  if (!existsAfter) return null;

  const prevStatus = before ? before.status : null;
  const nextStatus = after.status;
  if (nextStatus !== prevStatus) {
    if (nextStatus === 'cancelled') return 'assignment.cancelled';
    if (nextStatus === 'completed') return 'assignment.completed';
    if (nextStatus === 'started')   return 'assignment.started';
  }

  if (!isMeaningfulChange(before, after, thresholdMinutes)) return null; // Part 3 — e.g. a <15min time nudge alone
  if (lc(before && before.driver) !== lc(after.driver)) return 'assignment.reassigned';
  return 'assignment.updated';
}

const DEBOUNCED_TYPES = new Set(['assignment.updated', 'assignment.reassigned']);

/**
 * TRUE debounce re-check (Part 2 — Final Hardening): sleep, then ask
 * `readLiveFn()` for the CURRENT state. Returns true when `after` is STILL
 * current (safe to emit now — either an isolated edit, or the last write in
 * a burst); false when a newer write has already superseded it (skip — that
 * newer invocation's own re-check is what actually emits, using ITS
 * before/after — the coalesced final state). `debounceMs <= 0` short-
 * circuits to "always current" (debounce disabled).
 *
 * Dependency-injected (readLiveFn, sleepFn) specifically so this can be
 * unit-tested with a fake clock/store — see
 * functions/scripts/assignment-notify-debounce-check.js — without needing a
 * live Firebase connection or actually waiting out the real window.
 *
 * @param {Object|null} after       this invocation's captured post-write state
 * @param {number} debounceMs
 * @param {() => Promise<Object|null>} readLiveFn  resolves the CURRENT live node
 * @param {(ms:number) => Promise<void>} [sleepFn]
 * @returns {Promise<boolean>}
 */
async function isStillCurrentAfterDebounce(after, debounceMs, readLiveFn, sleepFn = sleep) {
  if (!(debounceMs > 0)) return true;
  await sleepFn(debounceMs);
  try {
    const live = await readLiveFn();
    return JSON.stringify(live) === JSON.stringify(after);
  } catch (err) {
    logger.error('[onAssignmentWrite] debounce re-check failed — proceeding anyway', { error: err.message });
    return true; // fail OPEN — never silently swallow a legitimate notification
  }
}

const onAssignmentWrite = onValueWritten(
  { ref: '/assignments/{assignmentId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after  = event.data.after.val();
    const config = await getAssignmentNotifyConfig(); // Part 1 — the ONE live source of truth
    const type   = classify(before, after, config.changeThresholdMinutes);
    if (!type) return;

    const entityId = event.params.assignmentId;

    // Part 2 — TRUE debounce. An isolated edit only pays this ONE short wait
    // (the live default is 2s, was a flat 10s); a burst of edits arriving
    // faster than that window apart coalesces into exactly ONE notification,
    // fired shortly after the LAST edit — earlier edits in the burst skip
    // silently. Persistence already happened before this trigger ran, so
    // only the notification-worthy event is ever delayed, never the save.
    if (DEBOUNCED_TYPES.has(type)) {
      const stillCurrent = await isStillCurrentAfterDebounce(
        after, Number(config.debounceMs) || 0,
        async () => (await db.ref(`assignments/${entityId}`).once('value')).val(),
      );
      if (!stillCurrent) {
        logger.info('[onAssignmentWrite] superseded within debounce window — skipping', { type, assignmentId: entityId });
        return;
      }
    }

    const node = type === 'assignment.deleted' ? before : after;
    const carryPrev = type === 'assignment.reassigned' || type === 'assignment.updated';

    try {
      const stored = await writeEvent(buildEnvelope({
        type,
        actor:   deriveActor(node || {}, type),
        entity:  { kind: 'assignment', id: entityId },
        payload: buildPayload(node || {}, carryPrev ? before : null),
        timestamp: event.time || new Date().toISOString(),
      }));
      logger.info('[onAssignmentWrite] event emitted', { type, eventId: stored.id, assignmentId: entityId });
    } catch (err) {
      logger.error('[onAssignmentWrite] failed to emit event', { type, assignmentId: entityId, error: err.message });
    }
  }
);

module.exports = { onAssignmentWrite, classify, isMeaningfulChange, buildPayload, isStillCurrentAfterDebounce };
