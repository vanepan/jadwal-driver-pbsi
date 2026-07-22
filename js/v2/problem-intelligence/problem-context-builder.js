/* ============================================================
   PROBLEM-CONTEXT-BUILDER.JS — Problem Intelligence Foundation
   (V2, Phase 8-10)

   PURPOSE: assemble a read-only ProblemContext for a classified Problem's
   `domainType` — Approved Knowledge + Archive + Organization Memory,
   PURE composition, computed fresh every call (the same "a converged read
   costs nothing" idiom conversation/context/context-builder.js's own
   header names).

   WHY THIS IS A SEPARATE FILE FROM conversation/context/context-builder.js,
   NOT A REUSE OF IT. That file's own output shape is a Conversation-scoped
   concept (it also composes `policies`/`patterns`/`conversationHistory` —
   fields a bare Problem, before any Conversation exists, has none of).
   More importantly: conversation/ is documented (js/v2/README.md) as
   depending on reasoning/, and reasoning/ depends on problem-intelligence/'s
   own Problem contract transitively — importing conversation/ FROM
   problem-intelligence/ would create exactly the backwards edge
   (an upstream domain depending on a downstream one) this platform's own
   dependency-direction discipline exists to prevent. This file instead
   composes the SAME underlying read-only services conversation/'s context
   builder also composes (knowledge-service.js, archive-service.js,
   organizational-memory-engine.js) — a second, independent CONSUMER of
   those services, never a reimplementation of what they compute.

   RESPONSIBILITY: buildProblemContext.

   DEPENDENCIES (read-only, one-way — problem-intelligence/ may depend on
   knowledge/ and organizational-memory/, never the reverse):
   knowledge/services/knowledge-service.js, organizational-memory/services/
   archive-service.js, organizational-memory/organizational-memory-engine.js.
   ============================================================ */

'use strict';

import { listKnowledge, LIFECYCLE_STATE } from '../knowledge/services/knowledge-service.js';
import { listArchive } from '../../../src/organizational-memory/services/archive-service.js';
import { computeOrganizationalMemory } from '../../../src/organizational-memory/organizational-memory-engine.js';

/**
 * @param {string|null} domainType
 * @returns {{domainType: string, knowledge: object[], archive: object[], organizationMemory: object|null}}
 */
export function buildProblemContext(domainType) {
  if (!domainType) {
    return Object.freeze({ domainType: '', knowledge: Object.freeze([]), archive: Object.freeze([]), organizationMemory: null });
  }

  const knowledgeResult = listKnowledge({ domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  const knowledge = (knowledgeResult.ok ? knowledgeResult.data : [])
    .map((k) => Object.freeze({ id: k.id, kind: k.kind, payload: k.payload }));

  const archiveResult = listArchive({ sourceDomainType: domainType });
  const archive = (archiveResult.ok ? archiveResult.data : [])
    .map((r) => Object.freeze({ id: r.id, documentNumber: r.documentNumber, state: r.state }));

  const orgMemoryResult = computeOrganizationalMemory(domainType);
  const organizationMemory = orgMemoryResult.ok ? orgMemoryResult.data : null;

  return Object.freeze({
    domainType, knowledge: Object.freeze(knowledge), archive: Object.freeze(archive), organizationMemory,
  });
}
