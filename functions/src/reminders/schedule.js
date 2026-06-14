'use strict';

/* ============================================================
   reminders/schedule.js — materialized reminder timer queue (v1.11.4)

   The /reminders node is a server-only, durable, inspectable timer
   queue. One row per (assignment, offset); the row IS the idempotency
   marker. Maintained by onAssignmentReminderSync (on /assignments
   writes) and consumed by the tick (every 5 min).

     /reminders/{reminderId} = {
       id, assignmentId, offset: "H-1d"|"H-1h",
       fireAt:  <epoch ms, UTC>,        ← .indexOn for the due-range query
       status:  "pending"|"fired"|"cancelled"|"skipped",
       firedAt: <ISO|null>,
       eventId: <deterministic event id, set when fired>,
       updatedAt: <ISO>,
     }

   reminderId = keySafe("<assignmentId>__<offset>") → deterministic, so a
   reschedule OVERWRITES in place (never duplicates). Server-written only
   (Admin SDK bypasses rules); clients never touch it.

   Time zone: assignment date "YYYY-MM-DD" + startTime "HH:MM" are LOCAL
   Asia/Jakarta (WIB = UTC+7, no DST). +07:00 is hard-coded explicitly —
   never rely on the container TZ.
   ============================================================ */

const { db } = require('../config/admin');

const REMINDERS_PATH = 'reminders';

/** The two reminder offsets. H-1d vs H-1h is data, not a second type. */
const OFFSETS = ['H-1d', 'H-1h'];

/** Offset → milliseconds before tripStart. */
const OFFSET_MS = {
  'H-1d': 24 * 60 * 60 * 1000,
  'H-1h': 1 * 60 * 60 * 1000,
};

/** RTDB keys may not contain . # $ / [ ]. Replace any with _. */
function keySafe(value) {
  return String(value == null ? '' : value).replace(/[.#$/[\]]/g, '_');
}

/** Deterministic per (assignment, offset). */
function reminderId(assignmentId, offset) {
  return keySafe(`${assignmentId}__${offset}`);
}

/**
 * Trip start as epoch-ms UTC from a WIB local date + time. Returns null
 * if either is missing/malformed (caller skips materialization).
 */
function tripStartMs(date, startTime) {
  if (!date || !startTime) return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
  const t = /^(\d{1,2}):(\d{2})/.exec(String(startTime).trim());
  if (!d || !t) return null;
  const hh = String(t[1]).padStart(2, '0');
  const ms = Date.parse(`${d[1]}-${d[2]}-${d[3]}T${hh}:${t[2]}:00+07:00`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Compute both fireAts (epoch-ms UTC) for an assignment, or null if the
 * trip start can't be derived.
 * @returns {{ 'H-1d': number, 'H-1h': number, tripStart: number }|null}
 */
function computeFireAts(date, startTime) {
  const tripStart = tripStartMs(date, startTime);
  if (tripStart == null) return null;
  return {
    'H-1d': tripStart - OFFSET_MS['H-1d'],
    'H-1h': tripStart - OFFSET_MS['H-1h'],
    tripStart,
  };
}

/** Read one reminder row (or null). */
async function getReminder(id) {
  const snap = await db.ref(`${REMINDERS_PATH}/${id}`).once('value');
  return snap.exists() ? snap.val() : null;
}

/**
 * Upsert both offset rows for an assignment to `pending` with fresh
 * fireAts (overwrite-in-place on reschedule). A row already `fired` is
 * NOT reverted to pending — the deterministic event id makes a reminder
 * one-shot per (assignment, offset), so re-firing it would be a no-op
 * anyway (REV2 §3); preserving `fired` keeps the queue honest.
 */
async function syncOffsets(assignmentId, fireAts) {
  for (const offset of OFFSETS) {
    const id = reminderId(assignmentId, offset);
    const prior = (await getReminder(id)) || {};
    const status = prior.status === 'fired' ? 'fired' : 'pending';
    await db.ref(`${REMINDERS_PATH}/${id}`).set({
      id,
      assignmentId,
      offset,
      fireAt: fireAts[offset],
      status,
      firedAt: prior.firedAt ?? null,
      eventId: prior.eventId ?? null,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Tombstone both offset rows (status → cancelled) when the trip is
 * cancelled/completed/started/deleted. Keeps audit + blocks a racing
 * tick. No-op for offsets with no row.
 */
async function tombstoneOffsets(assignmentId) {
  for (const offset of OFFSETS) {
    const id = reminderId(assignmentId, offset);
    const prior = await getReminder(id);
    if (!prior) continue;
    if (prior.status === 'cancelled') continue;
    await db.ref(`${REMINDERS_PATH}/${id}`).update({
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });
  }
}

/** Patch a reminder row (status/firedAt/eventId) with a fresh updatedAt. */
async function markReminder(id, patch) {
  await db.ref(`${REMINDERS_PATH}/${id}`).update({
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Load due, still-pending reminders (fireAt ≤ now). Uses the fireAt
 * index; status is filtered in code (RTDB can't range two children).
 */
async function loadDueReminders(now) {
  const snap = await db.ref(REMINDERS_PATH)
    .orderByChild('fireAt').endAt(now).once('value');
  const raw = snap.val() || {};
  return Object.values(raw).filter(r => r && r.status === 'pending');
}

module.exports = {
  REMINDERS_PATH,
  OFFSETS,
  OFFSET_MS,
  keySafe,
  reminderId,
  tripStartMs,
  computeFireAts,
  getReminder,
  syncOffsets,
  tombstoneOffsets,
  markReminder,
  loadDueReminders,
};
