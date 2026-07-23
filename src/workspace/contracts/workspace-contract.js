/* ============================================================
   WORKSPACE-CONTRACT.JS — Live Word Workspace (V2, Phase 12.8.1)

   PURPOSE: fix the shape of a Workspace — a thin, 1:1 wrapper around an
   EXISTING document-intelligence/composer/ ComposerDocument. A Workspace
   is not a second document system: it never stores sections/content
   itself (see workspace-context-builder.js, Sprint 12.8.2, which reads
   the live ComposerDocument fresh on every call). It exists only to give
   Body/Recognition/Learning-facing concerns — sessions, live suggestions,
   a timeline of accept/reject decisions — an id to hang off that is NOT
   documentId itself, so document-intelligence/'s own contract never has
   to grow a field it doesn't own (see js/v2/README.md's Phase 12.8
   dependency-direction extension for why this indirection exists).

   RESPONSIBILITY: define Workspace and a constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not validate documentId against a real ComposerDocument
   — that is workspace-service.js#createWorkspace's job (Sprint 12.8.2),
   which calls document-intelligence/composer/composer-store.js#getDocument
   before ever constructing one of these.
   ============================================================ */

'use strict';

export const WORKSPACE_SCHEMA = 'workspace@1';

/**
 * @typedef {Object} Workspace
 * @property {string} workspaceId
 * @property {string} documentId    - the ComposerDocument this Workspace wraps, 1:1
 * @property {string} domainType    - copied from the ComposerDocument at creation time (read-only mirror, never a second source of truth — a domainType change on the document itself is out of scope for this platform, same as document-intelligence/'s own assumption)
 * @property {string} ownerId
 * @property {number} version       - append-only, bumped only by workspace-service.js's own writes (never by document edits — those are document-intelligence/'s version, a disjoint axis)
 * @property {string} createdAt
 * @property {string} updatedAt
 */

let _counter = 0;

/** @param {{documentId: string, domainType: string, ownerId: string}} seed
 *  @returns {Workspace} */
export function makeWorkspace({ documentId, domainType, ownerId }) {
  if (typeof documentId !== 'string' || !documentId) throw new Error('makeWorkspace: documentId is required.');
  if (typeof domainType !== 'string' || !domainType) throw new Error('makeWorkspace: domainType is required.');
  if (typeof ownerId !== 'string' || !ownerId) throw new Error('makeWorkspace: ownerId is required.');
  _counter += 1;
  const now = new Date().toISOString();
  return Object.freeze({
    workspaceId: `workspace:${documentId}:${Date.now()}:${_counter}`,
    documentId, domainType, ownerId, version: 1,
    createdAt: now, updatedAt: now,
  });
}

/** @param {*} w @returns {boolean} */
export function isWorkspace(w) {
  return !!w && typeof w === 'object'
    && typeof w.workspaceId === 'string' && w.workspaceId.length > 0
    && typeof w.documentId === 'string' && w.documentId.length > 0
    && typeof w.domainType === 'string' && w.domainType.length > 0
    && typeof w.ownerId === 'string' && w.ownerId.length > 0
    && typeof w.version === 'number' && w.version >= 1
    && typeof w.createdAt === 'string' && w.createdAt.length > 0
    && typeof w.updatedAt === 'string' && w.updatedAt.length > 0;
}
