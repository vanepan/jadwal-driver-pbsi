/* ============================================================
   agenda-store.js — Firebase data access + the ONE canonical write path
   (V1.31 Agenda & To-Do, Phase C3)

   READ MODEL: RTDB has no collection-level `.read` on /agendaEvents or
   /agendaTasks (C1 Rules — every read is per-record, by design, so
   Kabid-scope data is never bulk-readable). The only way to discover
   WHICH ids are visible is the derived index (C2): this store subscribes
   to `agendaEventsByScope/{scope}` / `agendaTasksByScope/{scope}` for
   every scope the current user can read (agenda-permissions.js
   #readableScopes()), then maintains one live per-record listener per
   discovered id, added/removed as the index itself changes.

   This deliberately does NOT subscribe to agendaEventsByUser/
   agendaTasksByUser (the PERSONAL fan-out index) — verified against the
   C2 index-sync trigger's own computeVisible(): ANY participant whose
   role resolves to 'sarpras_shared' (i.e. any admin — which is every
   Sarpras staff account, Phase B §3) already widens an event's SCOPE
   index to include 'sarpras_shared', regardless of who organized it. The
   product's own spec examples (a Kabid-organized meeting that also
   includes Sarpras participants must appear on the shared calendar) are
   therefore already covered by the scope index alone. The only case NOT
   covered is a THIRD-party role (driver/bidang/viewer) personally invited
   with no admin/Kabid co-participant — and Phase A/B/C3's own product
   scope never asked for those roles to have a personal Agenda view (see
   agenda-permissions.js#canSeeAgendaWorkspace(): gated on agenda.view /
   agenda.kabid.view only). Documented, not silently dropped.

   WRITE MODEL: every event/task field write funnels through
   withActorFields(), the ONE place `updatedBy`/`updatedAt` (and
   `createdBy`/`createdAt`/`id` on create) are injected — required
   because database.rules.json's agendaEvents/agendaTasks .write rule
   refuses ANY write, on every branch, where updatedBy !== auth.uid
   (Phase B.1 §4.4's own explicit instruction: no call site may
   hand-assemble a partial write). This file NEVER writes to agendaAudit
   or any *ByUser/*ByScope index node — those are exclusively
   Cloud-Function-owned (C2); attempting to would be rejected by Rules
   anyway, but the point is this code doesn't try.

   ONE deliberate exception (Phase C3.1): setMyRsvpStatus() writes
   directly via storeFirebaseData(), NOT withActorFields()/updateEvent()
   — see its own doc comment for why (the C3.1 Rules grant is scoped to
   exactly participants/$uid, which an updatedBy/updatedAt-carrying
   multi-location update from the event root would not satisfy).

   V1.31.1 "Agenda, Kalender & To-Do" additions: a third sibling entity,
   Calendar (/agendaCalendars), mirroring the event write path exactly
   (see the "Calendar" section near the end of this file), plus a
   soft-delete ("Dihapus") transition — deleteEvent()/deleteTask()/
   deleteCalendarItem() — for all three entities, distinct from cancel
   ("Dibatalkan"). getVisibleEvents()/getVisibleTasks()/
   getVisibleCalendarItems() filter status==='deleted' out centrally, so
   every existing and future consumer (views, search, PDF, ECC) excludes
   deleted records automatically without having to remember to.
   ============================================================ */

'use strict';

import { subscribeNode, storeFirebaseData, updateFirebaseData } from '../firebase.js';
import { getCurrentUser } from '../auth.js';
import { generateId } from '../utils.js';
import { readableScopes } from './agenda-permissions.js';

const EVENTS_PATH = 'agendaEvents';
const TASKS_PATH = 'agendaTasks';
const CALENDARS_PATH = 'agendaCalendars';
const EVENTS_SCOPE_INDEX = 'agendaEventsByScope';
const TASKS_SCOPE_INDEX = 'agendaTasksByScope';
const CALENDARS_SCOPE_INDEX = 'agendaCalendarsByScope';

let _initialized = false;
const _eventRecords = new Map();   // eventId -> record
const _eventUnsubs = new Map();    // eventId -> unsubscribe fn
const _taskRecords = new Map();
const _taskUnsubs = new Map();
const _calendarRecords = new Map();
const _calendarUnsubs = new Map();
const _scopeIndexUnsubs = [];      // all top-level scope-index subscriptions, for a future full teardown

const _listeners = new Set();
let _notifyQueued = false;
function scheduleNotify() {
  if (_notifyQueued) return;
  _notifyQueued = true;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  raf(() => {
    _notifyQueued = false;
    _listeners.forEach((cb) => { try { cb(); } catch (err) { console.error('[agenda-store] listener failed', err); } });
  });
}

/** @param {() => void} cb */
export function registerAgendaChangeListener(cb) { _listeners.add(cb); }
export function unregisterAgendaChangeListener(cb) { _listeners.delete(cb); }

function reconcileRecordSubscriptions(indexIds, recordsMap, unsubsMap, basePath) {
  for (const id of indexIds) {
    if (unsubsMap.has(id)) continue;
    const unsub = subscribeNode(`${basePath}/${id}`, (snap) => {
      const val = snap.val();
      if (val) recordsMap.set(id, val); else recordsMap.delete(id);
      scheduleNotify();
    }, {
      onDenied: () => { recordsMap.delete(id); scheduleNotify(); },
      onError: () => { /* transient — keep whatever we last had */ },
    });
    unsubsMap.set(id, unsub);
  }
  for (const [id, unsub] of [...unsubsMap.entries()]) {
    if (!indexIds.has(id)) { unsub(); unsubsMap.delete(id); recordsMap.delete(id); }
  }
}

/**
 * Idempotent, re-entrant — safe to call on every mount, mirrors this
 * codebase's established store-init convention (e.g.
 * custom-roles-store.js#initCustomRolesStore()). Subscribes to the scope
 * index for every scope readableScopes() currently returns; if that set
 * later changes (a role reassignment mid-session), the caller re-invokes
 * this after re-checking permissions — it does not watch for that itself.
 */
export function initAgendaStore() {
  if (_initialized) return;
  _initialized = true;

  for (const scope of readableScopes()) {
    const eventsUnsub = subscribeNode(`${EVENTS_SCOPE_INDEX}/${scope}`, (snap) => {
      const ids = new Set(Object.keys(snap.val() || {}));
      reconcileRecordSubscriptions(ids, _eventRecords, _eventUnsubs, EVENTS_PATH);
    }, { onDenied: () => {}, onError: () => {} });
    const tasksUnsub = subscribeNode(`${TASKS_SCOPE_INDEX}/${scope}`, (snap) => {
      const ids = new Set(Object.keys(snap.val() || {}));
      reconcileRecordSubscriptions(ids, _taskRecords, _taskUnsubs, TASKS_PATH);
    }, { onDenied: () => {}, onError: () => {} });
    const calendarsUnsub = subscribeNode(`${CALENDARS_SCOPE_INDEX}/${scope}`, (snap) => {
      const ids = new Set(Object.keys(snap.val() || {}));
      reconcileRecordSubscriptions(ids, _calendarRecords, _calendarUnsubs, CALENDARS_PATH);
    }, { onDenied: () => {}, onError: () => {} });
    _scopeIndexUnsubs.push(eventsUnsub, tasksUnsub, calendarsUnsub);
  }
}

// 'deleted' ("Dihapus") is a terminal tombstone, not merely a status value —
// per V1.31.1's soft-delete requirement it must disappear from EVERY normal
// projection (calendar/agenda/to-do lists, search, PDF, counts, reminders,
// notifications). Filtering it out here, once, at the one place every
// consumer in this app already reads visible records from, is what makes
// that guarantee automatic for every current and future caller rather than
// something each one has to remember to re-implement.
const notDeleted = (r) => r && r.status !== 'deleted';

export function getVisibleEvents() { return [..._eventRecords.values()].filter(notDeleted); }
export function getVisibleTasks() { return [..._taskRecords.values()].filter(notDeleted); }
export function getVisibleCalendarItems() { return [..._calendarRecords.values()].filter(notDeleted); }
export function getEventById(id) { return _eventRecords.get(id) || null; }
export function getTaskById(id) { return _taskRecords.get(id) || null; }
export function getCalendarItemById(id) { return _calendarRecords.get(id) || null; }

/* ── The ONE canonical write path ───────────────────────────────────── */

function currentUsername() {
  const user = getCurrentUser();
  return user ? user.username : null;
}

/** Injects the actor-attribution fields every accepted write MUST carry
 *  (C1 Rules invariant) — never overridable by a caller-supplied value. */
function withActorFields(patch, { isCreate = false } = {}) {
  const username = currentUsername();
  if (!username) throw new Error('Tidak dapat menyimpan: sesi tidak valid.');
  const now = new Date().toISOString();
  const out = { ...patch, updatedBy: username, updatedAt: now };
  if (isCreate) {
    out.createdBy = username;
    out.createdAt = now;
  }
  return out;
}

/**
 * @param {Object} fields everything EXCEPT id/createdBy/createdAt/updatedBy/
 *   updatedAt/organizerUsername/status (organizer is always the creator;
 *   status always starts 'scheduled' — neither is caller-overridable here).
 * @returns {Promise<string>} the new event id
 */
export async function createEvent(fields) {
  const username = currentUsername();
  const id = `evt_${generateId()}`;
  const record = withActorFields({
    ...fields,
    id,
    organizerUsername: username,
    status: 'scheduled',
    participants: fields.participants || {},
  }, { isCreate: true });
  await storeFirebaseData(`${EVENTS_PATH}/${id}`, record);
  return id;
}

/** `patch` must never include organizerUsername/scope/createdBy/id —
 *  the C1 Rules reject any write that changes them; this function does
 *  not strip them defensively because a caller that tries is a bug worth
 *  surfacing as a Rules rejection, not silently swallowing. */
export async function updateEvent(id, patch) {
  await updateFirebaseData(`${EVENTS_PATH}/${id}`, withActorFields(patch));
}

export async function cancelEvent(id, reason) {
  const username = currentUsername();
  await updateEvent(id, { status: 'cancelled', cancelledBy: username, cancelledAt: new Date().toISOString(), cancelReason: reason || null });
}

/** Soft-delete ("Dihapus") — a terminal tombstone, distinct from cancel
 *  ("Dibatalkan"). Rules forbid hard delete (no .write path ever accepts a
 *  remove()); this is the one sanctioned way an event stops appearing
 *  anywhere (getVisibleEvents() filters status==='deleted' out) while the
 *  record itself, and its full agendaAudit history, remain intact for
 *  administrative forensic purposes. */
export async function deleteEvent(id, reason) {
  const username = currentUsername();
  await updateEvent(id, { status: 'deleted', deletedBy: username, deletedAt: new Date().toISOString(), deleteReason: reason || null });
}

export async function acknowledgeEvent(id) {
  const username = currentUsername();
  await updateEvent(id, { acknowledgedAt: new Date().toISOString(), acknowledgedBy: username });
}

/** @param {{isPic?: boolean, status?: string}} opts */
export async function setEventParticipant(id, username, opts = {}) {
  const event = getEventById(id);
  const existing = (event && event.participants && event.participants[username]) || {};
  const actor = currentUsername();
  const entry = {
    isPic: opts.isPic === true,
    status: opts.status || existing.status || 'invited',
    invitedBy: existing.invitedBy || actor,
    invitedAt: existing.invitedAt || new Date().toISOString(),
  };
  await updateEvent(id, { [`participants/${username}`]: entry });
}

export async function removeEventParticipant(id, username) {
  await updateEvent(id, { [`participants/${username}`]: null });
}

const RSVP_STATUSES = new Set(['accepted', 'declined', 'tentative']);

/**
 * Self-RSVP (Phase C3.1). Deliberately bypasses updateEvent()/
 * withActorFields() — those inject updatedBy/updatedAt onto the SAME
 * atomic write at the event root, which the C3.1 Rules grant
 * (agendaEvents/$id/participants/$uid only) does not cover, and RTDB
 * denies a multi-location update in full if any touched path lacks a
 * grant. This is a single-location set() at exactly
 * agendaEvents/{id}/participants/{username}, preserving isPic/invitedBy/
 * invitedAt unchanged (the Rules equality-lock them) — the only thing an
 * ordinary participant can ever change about an event.
 */
export async function setMyRsvpStatus(id, status) {
  if (!RSVP_STATUSES.has(status)) throw new Error(`Status RSVP tidak valid: ${status}`);
  const username = currentUsername();
  if (!username) throw new Error('Tidak dapat menyimpan: sesi tidak valid.');
  // Deliberately a live one-shot read, NOT getEventById()/_eventRecords —
  // that cache only ever contains ids discovered via a scope-index this
  // session subscribes to (readableScopes(), i.e. agenda.view/
  // agenda.kabid.view). A legitimate participant whose OWN role holds
  // neither (the exact "ordinary participant" case RSVP exists for) would
  // then be wrongly told "you're not a participant" even though the C1
  // Rules' participant-membership read grant plainly allows fetching
  // exactly this record. Reading live matches the Rules' own authority
  // source instead of this session's unrelated scope-subscription state.
  const existing = await new Promise((resolve, reject) => {
    let unsub = null;
    unsub = subscribeNode(`${EVENTS_PATH}/${id}/participants/${username}`, (snap) => {
      if (unsub) unsub();
      resolve(snap.val());
    }, {
      onDenied: () => { if (unsub) unsub(); resolve(null); },
      onError: (err) => { if (unsub) unsub(); reject(err); },
    });
  });
  if (!existing) throw new Error('Anda bukan peserta agenda ini.');
  const entry = {
    isPic: existing.isPic === true,
    status,
    invitedBy: existing.invitedBy,
    invitedAt: existing.invitedAt,
  };
  await storeFirebaseData(`${EVENTS_PATH}/${id}/participants/${username}`, entry);
}

/**
 * @param {Object} fields title/description/dueDate/dueTime/dueAt/priority/
 *   checklist/reminderConfig/attachments — everything except id/status/
 *   createdBy/createdAt/updatedBy/updatedAt.
 */
export async function createTask(fields) {
  const id = `task_${generateId()}`;
  const record = withActorFields({
    ...fields,
    id,
    status: 'not_started',
    responsible: fields.responsible || {},
  }, { isCreate: true });
  await storeFirebaseData(`${TASKS_PATH}/${id}`, record);
  return id;
}

export async function updateTask(id, patch) {
  await updateFirebaseData(`${TASKS_PATH}/${id}`, withActorFields(patch));
}

export async function completeTask(id) {
  const username = currentUsername();
  await updateTask(id, { status: 'done', completedAt: new Date().toISOString(), completedBy: username });
}

/** Reopening is a real, supported transition (C1's own lifecycle tests
 *  cover "reopened task" explicitly) — clears the completion markers so a
 *  stale completedAt/completedBy doesn't linger on a task that's active again. */
export async function reopenTask(id) {
  await updateTask(id, { status: 'in_progress', completedAt: null, completedBy: null });
}

/** Soft-delete ("Dihapus") for a task — see deleteEvent()'s doc comment;
 *  identical reasoning, mirrored for the task entity. */
export async function deleteTask(id, reason) {
  const username = currentUsername();
  await updateTask(id, { status: 'deleted', deletedBy: username, deletedAt: new Date().toISOString(), deleteReason: reason || null });
}

export async function setTaskResponsible(id, username) {
  const actor = currentUsername();
  await updateTask(id, { [`responsible/${username}`]: { assignedBy: actor, assignedAt: new Date().toISOString() } });
}

export async function removeTaskResponsible(id, username) {
  await updateTask(id, { [`responsible/${username}`]: null });
}

/** Toggles one checklist item's `done` flag. Rewrites the whole array
 *  (checklist items have no stable RTDB key of their own — they're a
 *  plain array per the C1 schema, so a targeted multi-path patch isn't
 *  possible; the array is small by nature, this is not a scale concern). */
export async function toggleChecklistItem(id, itemId) {
  const task = getTaskById(id);
  if (!task) return;
  const checklist = (task.checklist || []).map((item) => (
    item.id === itemId ? { ...item, done: !item.done } : item
  ));
  await updateTask(id, { checklist });
}

/* ── Calendar — V1.31.1 "Agenda, Kalender & To-Do". Mirrors the Event
   write path above exactly (same participant/PIC/organizer/scope shape,
   same Rules, same self-RSVP carve-out) — Calendar is a first-class sibling
   entity, not a repurposed Agenda event, but it is authorized and shaped
   the same way because it shares the identical Sarpras-staff/Kabid
   population. `status` starts 'scheduled' and only ever moves to
   'cancelled' ("Dibatalkan") or 'deleted' ("Dihapus") — the in-between
   display states (Terjadwal/Berlangsung/Selesai) are DERIVED from the date
   range by agenda-calendar-lifecycle.js, never stored, exactly as overdue
   is derived (never stored) for events/tasks. ───────────────────────── */

/**
 * @param {Object} fields title/description/location/startDate/endDate/
 *   allDay/startTime/endTime/startAt/endAt/participants — everything
 *   except id/organizerUsername/status/createdBy/createdAt/updatedBy/
 *   updatedAt (organizer is always the creator; status always starts
 *   'scheduled'; neither is caller-overridable here).
 * @returns {Promise<string>} the new calendar item id
 */
export async function createCalendarItem(fields) {
  const username = currentUsername();
  const id = `cal_${generateId()}`;
  const record = withActorFields({
    ...fields,
    id,
    organizerUsername: username,
    status: 'scheduled',
    participants: fields.participants || {},
  }, { isCreate: true });
  await storeFirebaseData(`${CALENDARS_PATH}/${id}`, record);
  return id;
}

/** `patch` must never include organizerUsername/scope/createdBy/id — the
 *  Rules reject any write that changes them. */
export async function updateCalendarItem(id, patch) {
  await updateFirebaseData(`${CALENDARS_PATH}/${id}`, withActorFields(patch));
}

export async function cancelCalendarItem(id, reason) {
  const username = currentUsername();
  await updateCalendarItem(id, { status: 'cancelled', cancelledBy: username, cancelledAt: new Date().toISOString(), cancelReason: reason || null });
}

/** Soft-delete ("Dihapus") — see deleteEvent()'s doc comment; identical
 *  reasoning, mirrored for the calendar entity. */
export async function deleteCalendarItem(id, reason) {
  const username = currentUsername();
  await updateCalendarItem(id, { status: 'deleted', deletedBy: username, deletedAt: new Date().toISOString(), deleteReason: reason || null });
}

/** @param {{isPic?: boolean, status?: string}} opts */
export async function setCalendarItemParticipant(id, username, opts = {}) {
  const item = getCalendarItemById(id);
  const existing = (item && item.participants && item.participants[username]) || {};
  const actor = currentUsername();
  const entry = {
    isPic: opts.isPic === true,
    status: opts.status || existing.status || 'invited',
    invitedBy: existing.invitedBy || actor,
    invitedAt: existing.invitedAt || new Date().toISOString(),
  };
  await updateCalendarItem(id, { [`participants/${username}`]: entry });
}

export async function removeCalendarItemParticipant(id, username) {
  await updateCalendarItem(id, { [`participants/${username}`]: null });
}

/** Self-RSVP for a calendar item — see setMyRsvpStatus()'s doc comment for
 *  why this bypasses updateCalendarItem()/withActorFields(): the Rules
 *  grant is scoped to exactly agendaCalendars/{id}/participants/{username},
 *  which an updatedBy/updatedAt-carrying multi-location update from the
 *  item root would not satisfy. */
export async function setMyCalendarRsvpStatus(id, status) {
  if (!RSVP_STATUSES.has(status)) throw new Error(`Status RSVP tidak valid: ${status}`);
  const username = currentUsername();
  if (!username) throw new Error('Tidak dapat menyimpan: sesi tidak valid.');
  const existing = await new Promise((resolve, reject) => {
    let unsub = null;
    unsub = subscribeNode(`${CALENDARS_PATH}/${id}/participants/${username}`, (snap) => {
      if (unsub) unsub();
      resolve(snap.val());
    }, {
      onDenied: () => { if (unsub) unsub(); resolve(null); },
      onError: (err) => { if (unsub) unsub(); reject(err); },
    });
  });
  if (!existing) throw new Error('Anda bukan peserta kalender ini.');
  const entry = {
    isPic: existing.isPic === true,
    status,
    invitedBy: existing.invitedBy,
    invitedAt: existing.invitedAt,
  };
  await storeFirebaseData(`${CALENDARS_PATH}/${id}/participants/${username}`, entry);
}
