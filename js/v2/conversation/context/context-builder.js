/* ============================================================
   CONTEXT-BUILDER.JS — Conversation Intelligence Foundation (Phase 6, Part 5)

   PURPOSE: assemble the Explainable Context Object
   (contracts/context-contract.js) a READY Conversation hands to the Task
   Executor. PURE composition, exactly the "connect, don't invent"
   discipline organizational-memory-engine.js's own header establishes for
   its eight facts: every field here is a real, already-computed slice of
   an existing read-only engine or service, never a new statistic and
   never a prompt.

   Recomputed fresh on every call — cheap and safe to call at every turn,
   the same "a converged read costs nothing" idiom every pure engine in
   this platform follows (pattern-discovery-engine.js, coverage-engine.js).
   There is no cached/stale Context anywhere; Conversation just stores the
   most recent one for display.

   DOMAIN-LESS GRACEFUL DEGRADATION. Some intents (e.g.
   GENERATE_EXECUTIVE_BRIEFING with no domain named) genuinely have no
   single domainType to scope to. Every domain-scoped read below is
   skipped (never guessed at) when domainType is falsy — an honest, mostly
   empty Context, never a fabricated cross-domain one.

   RESPONSIBILITY: buildContext.

   DEPENDENCIES (read-only, one-way): knowledge/services/knowledge-service.js,
   knowledge/services/profile-override-service.js,
   knowledge/services/pattern-discovery-service.js,
   organizational-memory/services/archive-service.js,
   organizational-memory/organizational-memory-engine.js.
   ============================================================ */

'use strict';

import { makeConversationContext } from '../contracts/context-contract.js';
import { listKnowledge, LIFECYCLE_STATE } from '../../knowledge/services/knowledge-service.js';
import { listApprovedOverrides, PROFILE_OVERRIDE_TYPE } from '../../knowledge/services/profile-override-service.js';
import { computePatternRecommendations } from '../../knowledge/services/pattern-discovery-service.js';
import { listArchive } from '../../../../src/organizational-memory/services/archive-service.js';
import { computeOrganizationalMemory } from '../../../../src/organizational-memory/organizational-memory-engine.js';

/**
 * @param {{domainType: string|null, conversationHistory?: Object[]}} args
 * @returns {import('../contracts/context-contract.js').ConversationContext}
 */
export function buildContext({ domainType = null, conversationHistory = [] }) {
  if (!domainType) {
    return makeConversationContext({ domainType: domainType || '', conversationHistory });
  }

  const knowledgeResult = listKnowledge({ domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  const knowledge = (knowledgeResult.ok ? knowledgeResult.data : [])
    .map((k) => ({ id: k.id, kind: k.kind, payload: k.payload }));

  const archiveResult = listArchive({ sourceDomainType: domainType });
  const archive = (archiveResult.ok ? archiveResult.data : [])
    .map((r) => ({ id: r.id, documentNumber: r.documentNumber, state: r.state }));

  const orgMemoryResult = computeOrganizationalMemory(domainType);
  const organizationMemory = orgMemoryResult.ok ? orgMemoryResult.data : null;

  const policiesResult = listApprovedOverrides(domainType, PROFILE_OVERRIDE_TYPE.BUSINESS_RULE);
  const policies = policiesResult.ok
    ? policiesResult.overrides.map((o) => ({ id: o.id, key: o.key, payload: o.payload }))
    : [];

  const patterns = computePatternRecommendations(domainType);

  return makeConversationContext({
    domainType, knowledge, archive, organizationMemory, policies, patterns, conversationHistory,
  });
}
