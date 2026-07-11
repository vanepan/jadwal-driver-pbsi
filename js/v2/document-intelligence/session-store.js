/* ============================================================
   SESSION-STORE.JS — Document Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: the real DocumentSession store contracts/document-context-contract.js's
   own header deferred ("Phase 7+/8 implements a real session store...
   once a real Analyzer/Generator exists to put something meaningful into
   it" — V2.0.6 is that point). Domain-agnostic — NOR is the only current
   caller but nothing here is NOR-specific.

   RESPONSIBILITY: startDocumentSession/getDocumentSession/
   transitionDocumentSession/listDocumentSessions — a process-wide Map,
   the same non-durable singleton idiom as acquisition/cursor-store.js and
   every registry in this tree.

   DEPENDENCIES: contracts/document-context-contract.js
   (canTransitionDocumentSession, real since Phase 7).
   ============================================================ */

'use strict';

import { DOCUMENT_SESSION_STATE, canTransitionDocumentSession } from './contracts/document-context-contract.js';

/** @type {Map<string, import('./contracts/document-context-contract.js').DocumentSession>} */
const _sessions = new Map();
let _counter = 0;

export function startDocumentSession(domainType) {
  _counter += 1;
  const now = new Date().toISOString();
  const session = Object.freeze({
    id: `doc-session:${domainType}:${Date.now()}:${_counter}`,
    state: DOCUMENT_SESSION_STATE.ANALYZING,
    domainType,
    startedAt: now,
    updatedAt: now,
  });
  _sessions.set(session.id, session);
  return session;
}

export function getDocumentSession(id) {
  return _sessions.get(id) || null;
}

export function transitionDocumentSession(id, toState) {
  const session = _sessions.get(id);
  if (!session) return { ok: false, data: null, error: { code: 'NOT_FOUND', message: `No document session "${id}".` } };
  if (!canTransitionDocumentSession(session.state, toState)) {
    return { ok: false, data: null, error: { code: 'ILLEGAL_TRANSITION', message: `${session.state} -> ${toState} is not a legal DocumentSession transition.` } };
  }
  const next = Object.freeze({ ...session, state: toState, updatedAt: new Date().toISOString() });
  _sessions.set(id, next);
  return { ok: true, data: next, error: null };
}

export function listDocumentSessions(domainType = null) {
  return Object.freeze([..._sessions.values()].filter((s) => !domainType || s.domainType === domainType));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetDocumentSessionStore() {
  _sessions.clear();
}
