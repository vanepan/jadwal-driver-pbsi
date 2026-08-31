/* ============================================================
   INDEX.JS — Sarpras Intelligence public barrel (V2, Phase 0)

   PURPOSE: the single import surface for the Sarpras Intelligence layer —
   the AI request/response contracts, the provider abstraction + registry,
   the audit/usage/provenance/classification vocabularies, the config, and
   the NOR Registry facade.

   RESPONSIBILITY: re-export only.

   DEPENDENCIES: every module under src/intelligence/.

   NON-GOALS: no logic. DORMANT — nothing outside src/intelligence/ imports
   this file (or any file under this tree) in Phase 0. That is the phase's
   structural success criterion, enforced by
   scripts/intelligence-foundation-check.mjs. Wiring a real caller (a
   Sarpras Intelligence Service, a UI, a server-backed provider) is a later
   phase.

   DEPENDENCY DIRECTION (one-way, non-negotiable — see
   docs/V2_SARPRAS_INTELLIGENCE_ARCHITECTURE.md §2, §3): this layer MAY read
   src/knowledge/, src/organizational-memory/, src/document-intelligence/
   (read-only). None of them may ever depend on src/intelligence/.
   src/knowledge/ in particular must remain fully buildable with ZERO
   providers registered.
   ============================================================ */

'use strict';

export * from './config/intelligence-config.js';

export * from './contracts/intelligence-request-contract.js';
export * from './contracts/intelligence-response-contract.js';
export * from './contracts/provider-contract.js';
export * from './contracts/generation-provenance-contract.js';
export * from './contracts/audit-contract.js';
export * from './contracts/usage-contract.js';
export * from './contracts/data-classification-contract.js';

export * from './provider-registry.js';
export { nullProvider, NULL_PROVIDER_ID, NULL_PROVIDER_VERSION } from './providers/null-provider.js';

export * from './nor-registry/nor-registry.js';
export {
  NOR_RECORD_SCHEMA,
  NOR_STATUS_DEFS,
  NOR_HUMAN_GATED_STATES,
  NOR_RECORD_FIELDS,
  hasNorSourceModule,
  resetNorSourceModules,
} from './nor-registry/contracts/nor-record-contract.js';
export {
  NOR_NUMBERING_SCHEMA,
  NUMBERING_ERRORS,
  isNumberAllocation,
} from './nor-registry/contracts/nor-numbering-contract.js';
export {
  NOR_REGISTRY_SCHEMA,
  registrySuccess,
  registryFailure,
  isNorRegistryBackend,
} from './nor-registry/contracts/registry-contract.js';

/* ── Phase 1 — Intelligence Service, OpenAI provider, durable conversation ── */
export * from './providers/model-completion-contract.js';
export { createOpenAiProvider, OPENAI_PROVIDER_ID, OPENAI_PROVIDER_VERSION } from './providers/openai-provider.js';
export * from './conversation/intelligence-conversation-store.js';
export { retrieveApprovedKnowledge } from './retrieval/knowledge-retrieval.js';
export { retrieveRecentArchive, summarizeRecipientPatterns } from './retrieval/memory-retrieval.js';
export { factQuestions, resolveRecipient, recipientQuestion } from './service/clarification.js';
export { assembleNorDraft } from './service/nor-draft-assembler.js';
export { createIntelligenceService } from './service/intelligence-service.js';
export { buildDefaultPorts } from './service/default-ports.js';
export { bootstrapIntelligenceClient } from './client-bootstrap.js';
export {
  isIntelligenceFlagValueOn,
  resolveIntelligenceFlag,
  applyIntelligenceFeatureFlag,
} from './config/feature-flag-sync.js';
