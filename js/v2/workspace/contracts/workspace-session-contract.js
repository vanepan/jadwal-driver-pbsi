/* ============================================================
   WORKSPACE-SESSION-CONTRACT.JS — Live Word Workspace (V2, Phase 12.8.1)

   PURPOSE: fix the shape of a WorkspaceSession — "someone has this
   Workspace open right now." Deliberately EPHEMERAL: a session is held
   in-memory by workspace-service.js (Sprint 12.8.2) for the lifetime of
   one open editor, never written to the Workspace Repository. Persisting
   session churn (open/close on every screen visit) would pollute the
   Workspace Timeline (Sprint 12.8.5), whose whole purpose is a curated
   log of MEANINGFUL events (a suggestion accepted/rejected), not raw
   presence — the same "don't persist what nobody asked to query later"
   restraint learning-signal-service.js's own header documents for
   write-time explanations nobody asked for yet.

   RESPONSIBILITY: define WorkspaceSession and a constructor.

   DEPENDENCIES: none.

   NON-GOALS: no multi-user presence/locking model — one session object
   per open() call, no conflict detection between two concurrent sessions
   on the same Workspace. That is a real future concern (Workspace
   Permissions, still using V1's existing role system per
   js/v2/workspace/README.md) but not this sprint's problem.
   ============================================================ */

'use strict';

export const WORKSPACE_SESSION_SCHEMA = 'workspace-session@1';

/**
 * @typedef {Object} WorkspaceSession
 * @property {string} sessionId
 * @property {string} workspaceId
 * @property {string} actorId
 * @property {string} startedAt
 * @property {string|null} endedAt
 */

let _counter = 0;

/** @param {{workspaceId: string, actorId: string}} seed @returns {WorkspaceSession} */
export function makeWorkspaceSession({ workspaceId, actorId }) {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('makeWorkspaceSession: workspaceId is required.');
  if (typeof actorId !== 'string' || !actorId) throw new Error('makeWorkspaceSession: actorId is required.');
  _counter += 1;
  return Object.freeze({
    sessionId: `workspace-session:${workspaceId}:${Date.now()}:${_counter}`,
    workspaceId, actorId, startedAt: new Date().toISOString(), endedAt: null,
  });
}

/** @param {WorkspaceSession} session @returns {WorkspaceSession} */
export function endWorkspaceSession(session) {
  return Object.freeze({ ...session, endedAt: new Date().toISOString() });
}

/** @param {*} s @returns {boolean} */
export function isWorkspaceSession(s) {
  return !!s && typeof s === 'object'
    && typeof s.sessionId === 'string' && s.sessionId.length > 0
    && typeof s.workspaceId === 'string' && s.workspaceId.length > 0
    && typeof s.actorId === 'string' && s.actorId.length > 0
    && typeof s.startedAt === 'string' && s.startedAt.length > 0
    && (s.endedAt === null || typeof s.endedAt === 'string');
}
