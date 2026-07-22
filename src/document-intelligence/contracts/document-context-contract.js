/* ============================================================
   DOCUMENT-CONTEXT-CONTRACT.JS — Document Intelligence Foundation (V2, Phase 7)

   PURPOSE: fix the shape of a Document Session — the authoring/analysis
   session a future user-facing flow would hold open while working on one
   document — and its own small state machine, DELIBERATELY separate from
   the Knowledge lifecycle (knowledge/contracts/lifecycle-contract.js). A
   Document Session tracks "where is this ONE document in ITS OWN
   authoring flow"; Knowledge's lifecycle tracks "is this LEARNED FACT
   trustworthy yet" — unrelated axes that happen to share vocabulary
   words like "draft".

   RESPONSIBILITY: DocumentContext, DocumentSession, DOCUMENT_SESSION_STATE
   typedefs/enums.

   DEPENDENCIES: none.

   NON-GOALS: no session is ever created here. No UI.

   FUTURE EVOLUTION: Phase 7+/8 implements a real session store (mirroring
   how js/engineering/stores/engineering-store.js holds live state) once a
   real Analyzer/Generator exists to put something meaningful into it.
   ============================================================ */

'use strict';

export const DOCUMENT_SESSION_STATE = Object.freeze({
  ANALYZING: 'analyzing',
  DRAFTING: 'drafting',
  REVIEWING: 'reviewing',
  FINALIZED: 'finalized',
  ABANDONED: 'abandoned',
});

export const DOCUMENT_SESSION_STATE_GRAPH = Object.freeze({
  [DOCUMENT_SESSION_STATE.ANALYZING]: Object.freeze([DOCUMENT_SESSION_STATE.DRAFTING, DOCUMENT_SESSION_STATE.ABANDONED]),
  [DOCUMENT_SESSION_STATE.DRAFTING]: Object.freeze([DOCUMENT_SESSION_STATE.REVIEWING, DOCUMENT_SESSION_STATE.ABANDONED]),
  [DOCUMENT_SESSION_STATE.REVIEWING]: Object.freeze([DOCUMENT_SESSION_STATE.DRAFTING, DOCUMENT_SESSION_STATE.FINALIZED, DOCUMENT_SESSION_STATE.ABANDONED]),
  [DOCUMENT_SESSION_STATE.FINALIZED]: Object.freeze([]),
  [DOCUMENT_SESSION_STATE.ABANDONED]: Object.freeze([]),
});

export function canTransitionDocumentSession(from, to) {
  const reachable = DOCUMENT_SESSION_STATE_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

/**
 * @typedef {Object} DocumentContext
 * @property {string} sessionId
 * @property {string} domainType     - the registered knowledge domainType this document belongs to
 * @property {object} [knowledgeContext] - whatever Approved Knowledge (services layer) the session has pulled in so far
 */

/**
 * @typedef {Object} DocumentSession
 * @property {string} id
 * @property {string} state          - one of DOCUMENT_SESSION_STATE
 * @property {string} domainType
 * @property {string} startedAt      - ISO 8601
 * @property {string} updatedAt      - ISO 8601
 */
