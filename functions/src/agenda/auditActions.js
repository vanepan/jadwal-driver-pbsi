'use strict';

/* ============================================================
   agenda/auditActions.js — pure before/after -> audit-action diff
   (V1.31 Agenda & To-Do, Phase C2)

   Entity-agnostic: works for both /agendaEvents (member field
   `participants`) and /agendaTasks (member field `responsible`) — the
   field present on the record decides which action names are used
   (participant_added/removed vs responsible_added/removed), so
   onAgendaEventWrite.js and onAgendaTaskWrite.js share this ONE diff
   engine rather than each hand-rolling their own (Phase B.1's original
   draft had one copy per entity type; validated here that a single
   generic diff is correct for both and simpler to keep in sync).

   PURE: no Firebase, no Date.now(), no I/O. `before`/`after` are plain
   .val() results (or null). Deliberately mirrors
   functions/src/events/onAssignmentWrite.js's classify() shape (a pure
   function the trigger calls, unit-tested independently of any live
   write) rather than inlining this logic into the trigger handler.
   ============================================================ */

/** Fields every accepted write must touch (C1 Rules invariant) — never a
 *  meaningful content change on their own. */
const IGNORED_FIELDS = ['updatedBy', 'updatedAt'];

function stripIgnored(obj) {
  const copy = { ...(obj || {}) };
  for (const f of IGNORED_FIELDS) delete copy[f];
  return copy;
}

/** Which member-map field is present, and the added/removed usernames. */
function diffMemberField(before, after) {
  const field = (after && after.participants) || (before && before.participants) ? 'participants'
    : (after && after.responsible) || (before && before.responsible) ? 'responsible'
      : null;
  if (!field) return { field: null, added: [], removed: [] };
  const beforeMembers = new Set(Object.keys((before && before[field]) || {}));
  const afterMembers = new Set(Object.keys((after && after[field]) || {}));
  const added = [...afterMembers].filter((u) => !beforeMembers.has(u));
  const removed = [...beforeMembers].filter((u) => !afterMembers.has(u));
  return { field, added, removed };
}

/**
 * Derive the list of consequential audit actions for one before/after
 * transition. Never returns a generic 'updated' action alongside a more
 * specific one for the SAME transition (status_changed/cancelled/completed
 * are mutually exclusive with each other and with a trailing 'updated').
 *
 * @param {Object|null} before
 * @param {Object|null} after
 * @returns {Array<{action: string, note?: string|null, affectedUsername?: string}>}
 */
function diffToAuditActions(before, after) {
  if (!before && after) return [{ action: 'created' }];
  if (!before || !after) return []; // defensive — Rules forbid delete, should never happen

  const actions = [];

  if (before.status !== after.status) {
    if (after.status === 'cancelled') {
      actions.push({ action: 'cancelled', note: after.cancelReason || null });
    } else if (after.status === 'deleted') {
      // V1.31.1 soft-delete ("Dihapus") — a dedicated audit action, not the
      // generic 'status_changed' fallback below, per the spec's own audit
      // requirement (created/updated/participant invited/removed/RSVP
      // changed/cancelled/deleted/restored). Mirrors 'cancelled' exactly.
      actions.push({ action: 'deleted', note: after.deleteReason || null });
    } else if (after.status === 'done') {
      actions.push({ action: 'completed' });
    } else {
      actions.push({ action: 'status_changed', note: `${before.status} -> ${after.status}` });
    }
  }

  if (!before.acknowledgedAt && after.acknowledgedAt) {
    actions.push({ action: 'acknowledged' });
  }

  const { field, added, removed } = diffMemberField(before, after);
  const addAction = field === 'responsible' ? 'responsible_added' : 'participant_added';
  const removeAction = field === 'responsible' ? 'responsible_removed' : 'participant_removed';
  for (const u of added) actions.push({ action: addAction, affectedUsername: u });
  for (const u of removed) actions.push({ action: removeAction, affectedUsername: u });

  if (actions.length === 0 && JSON.stringify(stripIgnored(before)) !== JSON.stringify(stripIgnored(after))) {
    actions.push({ action: 'updated' });
  }

  return actions;
}

module.exports = { diffToAuditActions, diffMemberField, stripIgnored, IGNORED_FIELDS };
