/* ============================================================
   CONTEXT-CONTRACT.JS — Conversation Intelligence Foundation (Phase 6)

   PURPOSE: fix the shape of the Explainable Context Object Part 5 asks for
   — the structured, no-prompt, no-LLM-formatting bundle the Task Executor
   (and, eventually, an optional AI adapter — ai-foundation/, never this
   phase) is handed once a Conversation reaches READY. Every field is a
   real, minimal, already-computed slice of an existing engine's output —
   context/context-builder.js's entire job is composition, never new
   computation, exactly how organizational-memory-engine.js composes eight
   facts from data that already exists elsewhere.

   RESPONSIBILITY: makeConversationContext, isConversationContext.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const CONTEXT_SCHEMA = 'conversation-context@1';

/**
 * @typedef {Object} ConversationContext
 * @property {string} domainType
 * @property {Object[]} knowledge          - relevant Approved KnowledgeItems (trimmed: id/kind/payload)
 * @property {Object[]} archive            - related ArchiveRecords for this domain (trimmed: id/documentNumber/state)
 * @property {Object|null} organizationMemory - computeOrganizationalMemory()'s report, scoped to domainType
 * @property {Object[]} policies           - Approved BUSINESS_RULE Profile Overrides for this domain
 * @property {Object[]} patterns           - computePatternRecommendations()'s output for this domain
 * @property {Object[]} conversationHistory - prior COMPLETED conversations for the same actor+intent (trimmed)
 * @property {Object} explain              - {knowledgeCount, archiveCount, policyCount, patternCount, historyCount}
 * @property {string} builtAt              - ISO 8601
 */
export function makeConversationContext({
  domainType, knowledge = [], archive = [], organizationMemory = null, policies = [],
  patterns = [], conversationHistory = [],
}) {
  return Object.freeze({
    domainType,
    knowledge: Object.freeze([...knowledge]),
    archive: Object.freeze([...archive]),
    organizationMemory,
    policies: Object.freeze([...policies]),
    patterns: Object.freeze([...patterns]),
    conversationHistory: Object.freeze([...conversationHistory]),
    explain: Object.freeze({
      knowledgeCount: knowledge.length,
      archiveCount: archive.length,
      policyCount: policies.length,
      patternCount: patterns.length,
      historyCount: conversationHistory.length,
    }),
    builtAt: new Date().toISOString(),
  });
}

export function isConversationContext(c) {
  return !!c && typeof c === 'object'
    && typeof c.domainType === 'string' && c.domainType.length > 0
    && Array.isArray(c.knowledge) && Array.isArray(c.archive)
    && Array.isArray(c.policies) && Array.isArray(c.patterns) && Array.isArray(c.conversationHistory);
}
