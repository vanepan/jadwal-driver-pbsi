/* ============================================================
   agenda-permissions.js — thin permission-service wrapper
   (V1.31 Agenda & To-Do, Phase C3)

   No new authorization mechanism — every function here is a direct,
   named call into the existing js/permission-service.js#can(). This
   file exists only so the rest of js/agenda/ never spells out the raw
   permission-id strings inline (a typo in 'agenda.kabid.manage' would
   silently fail closed with no error; centralizing it here means it's
   spelled once, matching the same discipline every other module in
   this app already exercises through its own can()-gated actions).

   The UI's available actions are ALWAYS derived from these — never from
   a role name, a display name, or anything client-guessed (§8's explicit
   instruction). The server (C1 Rules + C2 verifyPin.js) is still the
   real authority; these functions only decide what the UI OFFERS to
   attempt, never what is actually allowed to land.
   ============================================================ */

'use strict';

import { can } from '../permission-service.js';
import { getCurrentUser } from '../auth.js';

/** Whether the Agenda & To-Do section should render on Today at all.
 *  Routed through canViewKabidAgenda() (not a raw can('agenda.kabid.view'))
 *  so this gate picks up that function's agendaKabid-claim fallback —
 *  otherwise a real Kabid session's OWN Home render would evaluate this
 *  false forever and the whole section would stay hidden from them. */
export function canSeeAgendaWorkspace() {
  return can('agenda.view') || canViewKabidAgenda();
}

/** Read the shared Sarpras scope. */
export function canViewSharedAgenda() {
  return can('agenda.view');
}

/** Create/edit shared Sarpras-scope events & tasks. */
export function canManageSharedAgenda() {
  return can('agenda.manage');
}

/**
 * Read the Kabid scope.
 *
 * OR's in getCurrentUser().agendaKabid (the verifyPin.js-minted token claim,
 * captured onto the session by auth.js) alongside the generic can() check.
 * Root cause: a Custom-Role session cannot read the /customRoles COLLECTION
 * (database.rules.json scopes that .read to admin/developer only), so
 * permission-service.js's live Custom-Role resolution can never see a
 * Kabid user's OWN role — can('agenda.kabid.view') permanently resolves
 * false for that session no matter how long it waits, which is what hid
 * the whole Agenda section from a real Kabid login (found via the V1.31
 * live-emulator E2E, not by inspection). The token claim is the one signal
 * a Custom-Role session already has about its own grant, so it's used here
 * as a fallback — never a broadening: it degrades EXACTLY to the coarse
 * granularity database.rules.json's own agendaEvents/agendaTasks scope-
 * bypass already enforces (one boolean covering both view and manage), and
 * every OTHER caller of can() elsewhere in the app is untouched.
 */
export function canViewKabidAgenda() {
  return can('agenda.kabid.view') || getCurrentUser()?.agendaKabid === true;
}

/** Create/edit Kabid-scope events & tasks. Same fallback, same reasoning as
 *  canViewKabidAgenda() above. */
export function canManageKabidAgenda() {
  return can('agenda.kabid.manage') || getCurrentUser()?.agendaKabid === true;
}

/**
 * Which scope(s) the current user may CREATE a new event/task in — drives
 * the create-drawer's scope selector (hidden entirely if only one scope
 * is available, since there's nothing to choose).
 * @returns {Array<'sarpras_shared'|'kabid'>}
 */
export function writableScopes() {
  const scopes = [];
  if (canManageSharedAgenda()) scopes.push('sarpras_shared');
  if (canManageKabidAgenda()) scopes.push('kabid');
  return scopes;
}

/** Which scope(s) the current user may READ — drives which index buckets
 *  agenda-store.js subscribes to. */
export function readableScopes() {
  const scopes = [];
  if (canViewSharedAgenda()) scopes.push('sarpras_shared');
  if (canViewKabidAgenda()) scopes.push('kabid');
  return scopes;
}

/**
 * Whether the current user may write to a SPECIFIC already-loaded event,
 * mirroring database.rules.json's agendaEvents.write predicate exactly
 * (organizer, PIC-only participant, or scope-bypass) — used to decide
 * whether to show an Edit action at all. This is a UI convenience, NOT
 * the authorization boundary; the Rules re-check independently on every
 * real write regardless of what this function returns.
 * @param {Object} event an already-loaded /agendaEvents record
 */
export function canWriteEvent(event) {
  if (!event) return false;
  const user = getCurrentUser();
  const uid = user && (user.username || user.id);
  if (!uid) return false;
  if (event.organizerUsername === uid) return true;
  const p = event.participants && event.participants[uid];
  if (p && p.isPic === true) return true;
  if (event.scope === 'sarpras_shared') return canManageSharedAgenda();
  if (event.scope === 'kabid') return canManageKabidAgenda();
  return false;
}

/**
 * Whether the current user has a participant entry on this event at all
 * (regardless of isPic) — drives whether the self-RSVP control renders.
 * Mirrors the C3.1 Rules grant (agendaEvents/$id/participants/$uid: only
 * an existing participant may write their own status) — UI convenience,
 * not the authorization boundary; Rules re-check independently.
 * @param {Object} event an already-loaded /agendaEvents record
 */
export function isEventParticipant(event) {
  if (!event) return false;
  const user = getCurrentUser();
  const uid = user && (user.username || user.id);
  if (!uid) return false;
  return !!(event.participants && event.participants[uid]);
}

/** Same idea for a task (creator, responsible member, or scope-bypass). */
export function canWriteTask(task) {
  if (!task) return false;
  const user = getCurrentUser();
  const uid = user && (user.username || user.id);
  if (!uid) return false;
  if (task.createdBy === uid) return true;
  if (task.responsible && task.responsible[uid]) return true;
  if (task.scope === 'sarpras_shared') return canManageSharedAgenda();
  if (task.scope === 'kabid') return canManageKabidAgenda();
  return false;
}

/**
 * Same idea for a calendar item (V1.31.1) — organizer, PIC-only
 * participant, or scope-bypass. Deliberately identical shape to
 * canWriteEvent(): Calendar reuses Agenda's exact scope/permission
 * architecture rather than a parallel one (same Sarpras-staff/Kabid
 * population, no new permission id, no new role).
 * @param {Object} item an already-loaded /agendaCalendars record
 */
export function canWriteCalendarItem(item) {
  if (!item) return false;
  const user = getCurrentUser();
  const uid = user && (user.username || user.id);
  if (!uid) return false;
  if (item.organizerUsername === uid) return true;
  const p = item.participants && item.participants[uid];
  if (p && p.isPic === true) return true;
  if (item.scope === 'sarpras_shared') return canManageSharedAgenda();
  if (item.scope === 'kabid') return canManageKabidAgenda();
  return false;
}

/** Mirrors isEventParticipant() for a calendar item. */
export function isCalendarItemParticipant(item) {
  if (!item) return false;
  const user = getCurrentUser();
  const uid = user && (user.username || user.id);
  if (!uid) return false;
  return !!(item.participants && item.participants[uid]);
}
