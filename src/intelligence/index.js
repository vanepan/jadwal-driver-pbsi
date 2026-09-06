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
/* ── Phase 5 — canonical NOR Registry persistence + human publication.
   The facade (nor-registry.js, re-exported above) already surfaces
   `approve`, `REGISTRY_EVENT`, `useCallableNorRegistryBackend`,
   `norIdFromConversation`, `registryContent*`, `makeNorRecordFromDraft`,
   `REGISTRY_AUDIT_EVENTS` and `REGISTRY_CHANGE_TYPE`. These are the
   remaining pure helpers + the backend factory. ── */
export {
  appendRegistryVersion, markApproved, markPublished, canRegistryTransition,
} from './nor-registry/nor-registry-record.js';
export { createCallableNorRegistryBackend } from './nor-registry/backends/callable-nor-registry-backend.js';
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

/* ── Phase 5.x.7 — Certified Retrieval Integration. ONE read-only gateway
   that composes the approved Phase 5.x.5 Style Guide rules + the approved
   Phase 5.x.6 Visual Template into ONE structured, deterministic context
   for a FUTURE NOR generator. It adds NO resolution logic, NO ranking, NO
   storage — it reuses the two resolvers. APPROVED rules/templates ONLY
   reach the authoritative sections; proposed/rejected/deprecated NEVER do.
   It FAILS CLOSED: certification ∈ certified | incomplete | conflict |
   unavailable, and per-domain status ∈ resolved | conflict | missing |
   unavailable — never collapsed. NO OpenAI, NO RAG, NO generator wiring.
   Callable STAGED (not in functions/index.js). See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X7_RETRIEVAL.md. ── */
export {
  NOR_RETRIEVAL_CONTEXT_SCHEMA, NOR_RETRIEVAL_REQUEST_SCHEMA,
  RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS,
  RETRIEVAL_DOCUMENT_TYPES, isRetrievalDocumentType,
  makeNorRetrievalRequest, isNorRetrievalRequest,
  makeNorRetrievalContext, isNorRetrievalContext,
} from './retrieval/contracts/nor-retrieval-contract.js';
export { retrieveNorContext } from './retrieval/nor-context-retrieval.js';

/* ── Phase 6 — Certified Retrieval → NOR Generation. The CONTROLLED
   BOUNDARY: one deterministic gate + two deterministic projections that
   turn a Phase 5.x.7 `nor-retrieval-context@1` snapshot into ONE
   `intelligence-generation-context@1` telling the NOR generator whether —
   and how — it may proceed. It adds NO retrieval, NO resolution, NO
   ranking, NO storage, NO model call. The generator never promotes
   evidence into authority, never approves, never resolves a conflict.
   HYBRID incomplete policy: missing approved Style Guide ⇒ deterministic
   wording fallback + a visible warning; missing approved Visual Template ⇒
   BLOCK. `GENERATION_MODE.LEGACY` is the default and only reachable mode
   while the feature flag is OFF; `intelligence` mode needs the master flag
   AND config.generation.certifiedRetrieval === true. Callable
   (intelligenceNorGeneration) STAGED — not in functions/index.js. See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_6_CERTIFIED_RETRIEVAL_NOR_GENERATION.md. ── */
export {
  GENERATION_CONTEXT_SCHEMA, GENERATION_MODE, isGenerationMode,
  GENERATION_GATE_OUTCOME, isGenerationGateOutcome, isBlockedGateOutcome,
  GENERATION_STATUS, isGenerationStatus, generationStatusForGate,
  GENERATION_STYLE_SLOT, GENERATION_STYLE_SLOT_LIST, isGenerationStyleSlot,
  STYLE_SLOT_CATEGORY_MAP, SINGLE_VALUE_SLOTS,
  STYLE_SLOT_SOURCE, isStyleSlotSource, VISUAL_BINDING_SOURCE, isVisualBindingSource,
  makeGenerationStyleSlot, makeGenerationStyleContext, makeVisualBinding,
  makeGenerationContext, isGenerationContext,
} from './generation/contracts/generation-context-contract.js';
export {
  STYLE_SLOT_RENDERER_SOURCE, STYLE_SLOT_DEFAULT_REASON, STYLE_SLOT_FALLBACK_REASON,
  VISUAL_RENDERER_SOURCE, VISUAL_FALLBACK_REASON, styleFallbackReason, visualFallbackReason,
} from './generation/generation-fallbacks.js';
export { evaluateGenerationContext } from './generation/certification-gate.js';
export { resolveStyleSlots } from './generation/style-slot-resolver.js';
export { bindVisualTemplate } from './generation/visual-template-binding.js';
export { buildGenerationContext } from './generation/build-generation-context.js';
/* `isCertifiedRetrievalGenerationEnabled` is already surfaced by the
   `export * from './config/intelligence-config.js'` at the top of this file. */

/* ── Phase 6B — Deterministic Renderer Consumption. The PURE projection
   from an approved-template VisualBinding into a small, renderer-ready
   NorVisualRenderingModel (POINTS, top-left origin, y-down — the one
   convention js/docs/* / pdfmake uses). Consumes ONLY
   `source === 'approved_template'`; never fabricates geometry; never
   interprets typography/spacing/structuralRules as anything but inert
   data. js/docs/templates/nor.js consumes this ADDITIVELY (page size /
   margins / logo position only — every other region kind is disclosed as
   unsupported, never applied) — absent for every existing caller (Petty
   Cash V1 never sets it) ⇒ byte-identical legacy rendering. See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_6B_VISUAL_RENDERER.md, including its
   §1/§14 finding that no V2 caller yet invokes the renderer at all. ── */
export {
  RENDERING_MODEL_SCHEMA, RENDER_FIDELITY, resolveRenderingVisualModel,
} from './generation/visual-rendering-model.js';

/* ── Phase 6C — NOR Draft → Live Preview. The PURE translation from a
   persisted NorDraftRecord into the input of the EXISTING generic
   `composer-document` renderer (js/docs/templates/composer-document.js) so
   a reviewer can see a real PDF of the draft they are reviewing. Maps only
   actual record fields (never invents one); discloses a proposed recipient
   in the printed text; emits NO NOR number and NO signer. The resolved
   Phase 6B renderingVisualModel is carried through, never resolved here.
   Preview is READ/RENDER ONLY — never approves, numbers, registers, or
   publishes. See docs/V2_SARPRAS_INTELLIGENCE_PHASE_6C_NOR_PREVIEW.md. ── */
export { buildIntelligenceNorViewModel } from './generation/nor-preview-view-model.js';

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

/* ── Phase 3B — the minimal user-facing console (pure state machine) ── */
export { createIntelligenceConsoleController, CONSOLE_PHASE } from './console/intelligence-console-controller.js';

/* ── Phase 5.x.1 — NOR & Memorandum Corpus Acquisition Foundation.
   The historical corpus + extracted observations + their human-gated
   lifecycle. DORMANT: the Null backend is active by default; no OpenAI,
   no knowledge write, no numbering, no V1 coupling. See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X_CORPUS.md. ── */
export * from './corpus/contracts/corpus-document-contract.js';
export * from './corpus/contracts/corpus-provenance-contract.js';
export * from './corpus/contracts/observation-lifecycle-contract.js';
export * from './corpus/contracts/corpus-observation-contract.js';
export * from './corpus/contracts/corpus-store-contract.js';
export * from './corpus/corpus-store.js';
export {
  memoryCorpusBackend, resetMemoryCorpusBackend, MEMORY_CORPUS_BACKEND_ID,
} from './corpus/backends/memory-corpus-backend.js';
export { nullCorpusBackend } from './corpus/backends/null-corpus-backend.js';

/* ── Phase 5.x.2 — Corpus Ingestion & Document Analysis. The controlled
   deterministic analysis pipeline: extract → classify → observe, every
   observation lifecycleState 'observed', no model call wired, no
   promotion. DORMANT (corpus-analysis-config.enabled default false). See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X_CORPUS_INGESTION.md. ── */
export * from './corpus/ingestion/contracts/corpus-source-contract.js';
export * from './corpus/ingestion/contracts/extraction-result-contract.js';
export * from './corpus/ingestion/contracts/classification-result-contract.js';
export * from './corpus/ingestion/contracts/corpus-adapter-contract.js';
export * from './corpus/pipeline/pipeline-contract.js';
export * from './corpus/corpus-analysis-config.js';
export { computeCorpusChecksum, normalizeChecksum, isChecksum } from './corpus/ingestion/corpus-checksum.js';
export { createExtractorRegistry, defaultExtractorRegistry } from './corpus/ingestion/extractors/extractor-registry.js';
export { createDocxExtractor, DOCX_EXTRACTOR_ID } from './corpus/ingestion/extractors/docx-extractor.js';
export { createPdfStructureExtractor, PDF_STRUCTURE_EXTRACTOR_ID } from './corpus/ingestion/extractors/pdf-structure-extractor.js';
export { nullExtractor, NULL_EXTRACTOR_ID } from './corpus/ingestion/extractors/null-extractor.js';
export { classifyDocumentType } from './corpus/ingestion/classify/document-type-classifier.js';
export { classifyDocumentEra } from './corpus/ingestion/classify/document-era-classifier.js';
export { extractSourceDate } from './corpus/ingestion/classify/source-date-extractor.js';
export { observeStructure } from './corpus/analysis/structure-observer.js';
export { observeTerminology } from './corpus/analysis/terminology-observer.js';
export { groupObservations, promoteGroupsToCandidates } from './corpus/analysis/candidate-grouping.js';
export { analyzeLayoutDeterministically } from './corpus/analysis/visual/deterministic-layout-analyzer.js';
export {
  PAGE_RENDER_SCHEMA, PAGE_RENDER_ERRORS, renderSuccess, renderFailure,
  isPageRenderPort, nullPageRenderPort, NULL_PAGE_RENDER_ID,
} from './corpus/analysis/visual/page-render-port.js';
export {
  VISUAL_ANALYZER_SCHEMA, VISUAL_ANALYZER_ERRORS, analyzerSuccess, analyzerFailure,
  isVisualAnalyzerPort, nullVisualAnalyzer, NULL_VISUAL_ANALYZER_ID,
} from './corpus/analysis/visual/visual-analyzer-port.js';
export {
  ANALYSIS_PROMPT_VERSION, ANALYSIS_SYSTEM_INSTRUCTIONS, ANALYSIS_OUTPUT_SCHEMA, mapModelObservationToContract,
} from './corpus/analysis/analysis-prompt-config.js';
export { runAnalysisPipeline } from './corpus/pipeline/analysis-pipeline.js';

/* ── Phase 5.x.3 — Historical vs Current Convention. A read-only temporal
   interpretation VIEW over corpus observations: historical | current |
   transitional | unknown + a small drift vocabulary. Never rewrites an
   observation, never moves a lifecycle state, never creates an approval,
   never modifies an approved rule. DORMANT (returns `unknown` until the
   temporal windows are configured). See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X_HISTORICAL_CURRENT.md. ── */
export * from './corpus/temporal/contracts/temporal-contract.js';
export {
  resolveTemporalWindows, bucketSourceDate, daysBetweenIso,
} from './corpus/temporal/temporal-windows.js';
export { buildConventionEvidence, indexBySlot } from './corpus/temporal/convention-evidence.js';
export { classifyConventionEra, classifyConventionStatus } from './corpus/temporal/convention-currentness.js';
export { buildTemporalInput, sanitizeApprovedRules } from './corpus/temporal/temporal-input.js';
export { analyzeConventionTemporal } from './corpus/temporal/convention-temporal-analyzer.js';

/* ── Phase 5.x.4 — Organizational Writing Memory. A derived, evidence-
   backed summary of recurring WRITING/LANGUAGE patterns (layout is out).
   authorityState is ONLY observed | candidate — this layer NEVER produces
   `approved`. confidence ≠ authority. Consumes the 5.x.3 temporal layer,
   preserves document-type scope + distribution, keeps competing values
   side by side, passes drift findings through unchanged. Pure,
   deterministic, read-only. No RAG, no OpenAI, no NOR-generator wiring.
   See docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X_WRITING_MEMORY.md. ── */
export * from './corpus/writing-memory/contracts/writing-memory-contract.js';
export { buildWritingMemory } from './corpus/writing-memory/writing-memory-builder.js';
export {
  queryWritingMemory, getWritingConventionsForType, getCurrentEvidence, getHistoricalOnly,
  getPreferredTerminology, getRecipientConventions, getSubjectConventions,
  getConflicts as getWritingMemoryConflicts, getPossibleDrift as getWritingMemoryPossibleDrift, getAligned,
} from './corpus/writing-memory/writing-memory-query.js';

/* ── Phase 5.x.5 — PBSI NOR Style Guide. The FIRST authority layer: an
   explicit human-approved organizational writing rule. authorityState is
   DERIVED from status ('authoritative' iff approved) — NEVER client-set,
   NEVER automatic. A proposal is built ONLY from a Writing Memory entry
   (the one allowed upstream integration); approval requires an
   authenticated actor + a non-empty human rationale; a changed approved
   rule is a NEW superseding rule (the old one deprecated + retained).
   getEffectiveStyleGuide returns approved rules ONLY; resolveEffectiveRule
   fails closed on a conflict (never picks by frequency). Pure + dormant:
   the Null backend is active by default, the callable is STAGED (not in
   functions/index.js), the RTDB rule is undeployed, no NOR-generator
   wiring. See docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X_STYLE_GUIDE.md. ── */
export * from './corpus/style-guide/contracts/style-guide-contract.js';
export * from './corpus/style-guide/contracts/style-guide-store-contract.js';
export {
  STYLE_GUIDE_PROPOSAL_SET_SCHEMA, makeStyleGuideProposalFromMemory,
  buildStyleGuideProposals, makeSupersedingProposal,
} from './corpus/style-guide/style-guide-proposal.js';
export {
  markApproved as markStyleRuleApproved,
  markRejected as markStyleRuleRejected,
  markDeprecated as markStyleRuleDeprecated,
} from './corpus/style-guide/style-guide-authority.js';
export {
  queryStyleGuide, getEffectiveStyleGuide, getProposedStyleRules,
  getEffectiveRulesForType, getEffectiveRulesByCategory,
  resolveEffectiveRule, findStyleGuideConflicts, getSupersessionChain,
  isStyleGuideRuleSet,
} from './corpus/style-guide/style-guide-query.js';
export {
  DEFAULT_STYLE_GUIDE_BACKEND_ID, STYLE_GUIDE_EVENT,
  registerStyleGuideBackend, setActiveStyleGuideBackend, getActiveStyleGuideBackendId,
  listStyleGuideBackends, useCallableStyleGuideBackend, resetStyleGuideStore,
  registerStyleGuideListener, unregisterStyleGuideListener,
  listStyleRules, getStyleRule, proposeStyleRuleFromMemory,
  approveStyleRule, rejectStyleRule, deprecateStyleRule,
  resolveStyleRule, getStyleRuleHistory,
  memoryStyleGuideBackend, resetMemoryStyleGuideBackend, MEMORY_STYLE_GUIDE_BACKEND_ID,
  createCallableStyleGuideBackend, CALLABLE_STYLE_GUIDE_BACKEND_ID,
} from './corpus/style-guide/style-guide-store.js';
export { nullStyleGuideBackend, NULL_STYLE_GUIDE_BACKEND_ID } from './corpus/style-guide/backends/null-style-guide-backend.js';

/* ── Phase 5.x.6 — PBSI Visual Template System. The VISUAL authority
   layer, sibling of the Style Guide: an explicit human-approved
   document-layout template (page size, margins, region geometry,
   typography, spacing). authorityState is DERIVED from status
   ('authoritative' iff approved) — NEVER client-set, NEVER automatic.
   Geometry is NEVER fabricated (unknown ⇒ null); coordinate spaces are
   explicit and never silently converted. A proposal is built ONLY from an
   aggregated visual pattern over corpus 'layout'/'visual' observations
   (the one allowed upstream integration); approval requires an
   authenticated actor + a non-empty human rationale; a changed approved
   template is a NEW superseding template (the old one deprecated +
   retained). getEffectiveVisualTemplates returns approved templates ONLY;
   resolveEffectiveTemplate fails closed on a conflict (never picks by
   frequency). Pure + dormant: the Null backend is active by default, the
   callable is STAGED (not in functions/index.js), the RTDB rule is
   undeployed, NO renderer wiring. See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X6_VISUAL_TEMPLATE.md. ── */
export * from './corpus/visual-template/contracts/visual-template-contract.js';
export * from './corpus/visual-template/contracts/visual-template-store-contract.js';
export {
  VISUAL_TEMPLATE_CONFIG_SCHEMA, DEFAULT_VISUAL_TEMPLATE_CONFIG,
  getVisualTemplateConfig, setVisualTemplateConfig, resetVisualTemplateConfig,
  isVisualTemplateAnalysisEnabled,
} from './corpus/visual-template/visual-template-config.js';
export {
  isVisualLayoutObservation, visualObservationRegionKind, pageGeometryOf, regionOf,
} from './corpus/visual-template/visual-observation.js';
export {
  VISUAL_EVIDENCE_REPORT_SCHEMA, aggregateVisualEvidence,
} from './corpus/visual-template/visual-evidence-aggregator.js';
export {
  VISUAL_TEMPLATE_PROPOSAL_SET_SCHEMA, makeVisualTemplateProposalFromPattern,
  buildVisualTemplateProposals, makeSupersedingVisualTemplateProposal,
} from './corpus/visual-template/visual-template-proposal.js';
export {
  markApproved as markVisualTemplateApproved,
  markRejected as markVisualTemplateRejected,
  markDeprecated as markVisualTemplateDeprecated,
} from './corpus/visual-template/visual-template-authority.js';
export {
  queryVisualTemplates, getEffectiveVisualTemplates, getProposedVisualTemplates,
  resolveEffectiveTemplate, findVisualTemplateConflicts, getVisualTemplateHistory,
  isVisualTemplateSet,
} from './corpus/visual-template/visual-template-query.js';
export {
  DEFAULT_VISUAL_TEMPLATE_BACKEND_ID, VISUAL_TEMPLATE_EVENT,
  registerVisualTemplateBackend, setActiveVisualTemplateBackend, getActiveVisualTemplateBackendId,
  listVisualTemplateBackends, useCallableVisualTemplateBackend, resetVisualTemplateStore,
  registerVisualTemplateListener, unregisterVisualTemplateListener,
  listVisualTemplates, getVisualTemplate, proposeVisualTemplateFromEvidence,
  approveVisualTemplate, rejectVisualTemplate, deprecateVisualTemplate,
  resolveVisualTemplate, getVisualTemplateHistoryChain,
  memoryVisualTemplateBackend, resetMemoryVisualTemplateBackend, MEMORY_VISUAL_TEMPLATE_BACKEND_ID,
  createCallableVisualTemplateBackend, CALLABLE_VISUAL_TEMPLATE_BACKEND_ID,
} from './corpus/visual-template/visual-template-store.js';
export { nullVisualTemplateBackend, NULL_VISUAL_TEMPLATE_BACKEND_ID } from './corpus/visual-template/backends/null-visual-template-backend.js';

/* ── Phase 5.x.8 — Human Curation Workspace. The GOVERNANCE UI layer over
   the Style Guide (5.x.5) + Visual Template (5.x.6) authority stores: an
   authorized operator inspects proposals, evidence, temporal context,
   provenance, conflicts and supersession candidates, then EXPLICITLY
   approves / rejects / supersedes / deprecates. It adds NO storage, NO new
   authority model and NO new resolution logic — the two authority
   contracts remain the ONE authority on lifecycle. The pure projection
   layer (curation-view) NEVER nominates a conflict winner; the pure state
   machine (curation-workspace-controller) mutates ONLY via an explicit
   confirmDecision() with a non-empty human rationale, sends ONLY
   { id, action, rationale, expectedVersion, acknowledgeConflict? } (the
   server owns actor / timestamp / authority / version / scope), and
   surfaces a stale expectedVersion as "reload before deciding" — never a
   silent overwrite. NO OpenAI, NO RAG, NO generator wiring. The workspace
   is gated exactly like the intake console (V2 pilot + synced flag +
   effective-admin) and stays behind the OFF flag. See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X8_HUMAN_CURATION.md. ── */
export {
  CURATION_WORKSPACE_SCHEMA, CURATION_TAB, CURATION_PROPOSAL_KIND, CURATION_DECISION,
  CURATION_DECISION_METHOD, CURATION_DOMAIN_STATE, CURATION_AUTHORITY_LABEL,
  isCurationTab, isCurationProposalKind, isCurationDecision,
  authorityLabelForStatus as curationAuthorityLabelForStatus, temporalContextLabel as curationTemporalContextLabel,
  CURATION_ERROR_TEXT, CURATION_ERROR_FALLBACK, curationErrorText,
  CURATION_STALE_CODES, isStaleCode as isCurationStaleCode,
  CURATION_UNAVAILABLE_CODES, isUnavailableCode as isCurationUnavailableCode,
} from './curation/contracts/curation-contract.js';
export {
  buildCurationDashboard, buildStyleProposalRows, buildVisualProposalRows,
  filterCurationRows, availableFilterValues, buildStyleRuleReview, buildVisualTemplateReview,
  describeGeometry as describeCurationGeometry, buildConflictView as buildCurationConflictView,
  buildHistoryEntries as buildCurationHistoryEntries, buildLineageHistory as buildCurationLineageHistory,
  decisionCapability as curationDecisionCapability, confidenceText as curationConfidenceText,
} from './curation/curation-view.js';
export { createCurationWorkspaceController } from './console/curation-workspace-controller.js';

/* ── Phase 4 — the persistent, human-reviewable NOR draft ── */
export {
  NOR_DRAFT_SCHEMA, NOR_DRAFT_STATUS, NOR_DRAFT_FIELDS, DRAFT_FACT_FIELDS, DRAFT_EDITABLE_FIELDS,
  DRAFT_AUDIT_EVENTS, makeNorDraftRecord, applyDraftEdits, sanitizeDraftEdits, isNorDraftRecord,
} from './nor-draft/contracts/nor-draft-record-contract.js';
export {
  DRAFT_STORE_ERRORS, NOR_DRAFT_STORE_SCHEMA, draftSuccess, draftFailure,
  NOR_DRAFT_STORE_CONTRACT, isNorDraftBackend,
} from './nor-draft/contracts/nor-draft-store-contract.js';
export {
  registerNorDraftBackend, setActiveNorDraftBackend, getActiveNorDraftBackendId,
  listNorDraftBackends, resetNorDraftStore, useCallableNorDraftBackend,
  createCallableNorDraftBackend, CALLABLE_NOR_DRAFT_BACKEND_ID, DEFAULT_NOR_DRAFT_BACKEND_ID,
} from './nor-draft/nor-draft-store.js';
export {
  createDraft as createNorDraft, getDraft as getNorDraft,
  updateDraft as updateNorDraft, listDrafts as listNorDrafts,
} from './nor-draft/nor-draft-store.js';
