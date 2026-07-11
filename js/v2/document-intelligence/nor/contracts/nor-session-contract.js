/* ============================================================
   NOR-SESSION-CONTRACT.JS — NOR Intelligence Foundation (V2, Phase 8)

   PURPOSE: specialize document-intelligence's generic DocumentSession/
   DocumentContext (../../contracts/document-context-contract.js) for the
   `domainType: 'nor'` pilot — NOT a redefinition. NOR is the first pilot
   consumer, never a second platform (reminder repeated in every file
   here, per the master prompt).

   RESPONSIBILITY: NorPromptSession, NorContext typedefs — thin, fixed-
   domainType wrappers over the generic shapes.

   DEPENDENCIES: document-intelligence/contracts/document-context-contract.js.

   NON-GOALS: no session is created. No prompt is ever sent anywhere (no
   AI is implemented in Phase 8).

   FUTURE EVOLUTION: a real NOR pilot (Phase 8+, still not this phase)
   creates a NorPromptSession the first time a user starts an assisted NOR
   flow — reusing the generic DocumentSession state machine unchanged.
   ============================================================ */

'use strict';

import { DOCUMENT_SESSION_STATE, canTransitionDocumentSession } from '../../contracts/document-context-contract.js';

export const NOR_DOMAIN_TYPE = 'nor';

/**
 * @typedef {Object} NorContext
 * @property {string} sessionId
 * @property {'nor'} domainType   - always 'nor' — the one fixed field distinguishing this from the generic DocumentContext
 * @property {object} [knowledgeContext]
 */

/**
 * @typedef {Object} NorPromptSession
 * @property {string} id
 * @property {string} state        - one of DOCUMENT_SESSION_STATE (reused, not redefined)
 * @property {'nor'} domainType
 * @property {string} startedAt
 * @property {string} updatedAt
 */

export { DOCUMENT_SESSION_STATE, canTransitionDocumentSession };
