/* ============================================================
   WORKSPACE-CONTEXT-BUILDER.JS — Live Word Workspace (V2, Phase 12.8.2)

   PURPOSE: assemble a Workspace Context — "what does the organization
   already know that's relevant to what's being written right now" — for
   one open Workspace. Mirrors body/context/body-context-builder.js's
   exact discipline: PURE composition (every field is a real,
   already-computed slice of an existing read-only engine/service, never
   a new statistic, never a prompt), recomputed fresh on every call,
   honest graceful degradation when the Workspace is not found.

   THIS IS THE ARCHITECTURAL SEAM §1.4 OF THE PHASE 12.8 REVIEW NAMED:
   nothing else in this platform is allowed to compose
   document-intelligence/ + knowledge/ + organizational-memory/ + body/ +
   recognition/ + learning/ in one place (ui/ explicitly never depends on
   body/; document-intelligence/ never depends on recognition/; even
   problem-solving/ does not read body/ or recognition/ directly). This
   file is workspace/'s one reason to exist: the narrow, explicit,
   documented graph extension in js/v2/README.md's "Phase 12.8" section
   grants JUST workspace/ read-only access to all of them, the same way
   learning-bridge/ was granted a narrow bridge between body/ and
   learning/ in Phase 12.6 — not a general precedent, a specific,
   approved exception for a specific, named cross-cutting need.

   BODY FACTS STAY DESCRIPTIVE HERE TOO: this file reuses
   body/services/index.js#context.buildBodyContext() VERBATIM — it does
   not reshape or reinterpret what comes back. A live `observedState` in
   the returned context is exactly as descriptive-only as it always was
   (see body/README.md §1) — workspace-suggestion-engine.js (Sprint
   12.8.3) must not, and does not, treat it as a citable business rule.

   RESPONSIBILITY: buildWorkspaceContext({workspaceId, entityIds}).

   DEPENDENCIES (read-only, one-way, all pre-approved by the Phase 12.8
   graph extension): repository/workspace-repository.js,
   document-intelligence/composer/composer-store.js (getDocument),
   document-intelligence/composer/block-adapter.js,
   body/services/index.js (context.buildBodyContext),
   organizational-memory/organizational-memory-engine.js
   (computeOrganizationalMemory), recognition/services/index.js
   (records.listRecognitionRecords), learning/learning-recommendation-engine.js
   (computeRecommendations).

   NON-GOALS: does not write anything, anywhere. Does not call
   reasoning/reasoning-engine.js#reason() — a Workspace Context is
   descriptive material for workspace-suggestion-engine.js's own
   cite-or-abstain suggestions, never itself a normative Recommendation.
   ============================================================ */

'use strict';

import { getById as getWorkspaceById } from '../repository/workspace-repository.js';
import { getDocument } from '../../document-intelligence/composer/composer-store.js';
import { sectionsToLiveBlocks } from '../adapters/block-adapter.js';
import { context as bodyContext } from '../../body/services/index.js';
import { computeOrganizationalMemory } from '../../../../src/organizational-memory/organizational-memory-engine.js';
import { records as recognitionRecords } from '../../recognition/services/index.js';
import { computeRecommendations } from '../../learning/learning-recommendation-engine.js';
// Phase 12.8.x, Sprint 2 ("Live Entity Recognition") — deterministic,
// non-NLP text matching against vocabulary this context has already
// assembled from body/organizational-memory. See that file's own header.
import { buildVocabulary, matchEntityMentions } from './entity-text-matcher.js';
// Phase 12.8.x, Sprint 3 — the SECOND narrow graph grant (js/v2/README.md's
// Phase 12.8.x extension), mirroring Phase 12.8's body/ grant exactly.
// reasonWithGaps() is reasoning/'s own existing composed convenience
// (Phase 4-7, unmodified) — never a second Recommendation/Gap computation.
import { reasonWithGaps, makeProblem } from '../../reasoning/services/reasoning-service.js';

function emptyContext(workspaceId, asOf) {
  return Object.freeze({
    workspaceId, documentId: null, domainType: null,
    blocks: [], body: null, organizationalMemory: null, recognition: [], learningRecommendations: [],
    reasoning: null,
    explain: { sourcesQueried: [], asOf },
    builtAt: asOf,
  });
}

/**
 * @param {{workspaceId: string, entityIds?: string[]}} args
 * @returns {{
 *   workspaceId: string, documentId: string|null, domainType: string|null,
 *   blocks: import('../contracts/live-block-contract.js').LiveBlock[],
 *   body: object|null,
 *   organizationalMemory: object|null,
 *   recognition: object[],
 *   learningRecommendations: object[],
 *   explain: {sourcesQueried: string[], asOf: string},
 *   builtAt: string,
 * }}
 */
export function buildWorkspaceContext({ workspaceId, entityIds = [] } = {}) {
  const asOf = new Date().toISOString();
  if (typeof workspaceId !== 'string' || !workspaceId) return emptyContext(workspaceId ?? null, asOf);

  const wsResult = getWorkspaceById(workspaceId);
  if (!wsResult.ok) return emptyContext(workspaceId, asOf);
  const workspace = wsResult.data;

  const doc = getDocument(workspace.documentId);
  const blocks = doc ? sectionsToLiveBlocks(doc.sections) : [];

  const sourcesQueried = [];

  const body = bodyContext.buildBodyContext({ entityIds });
  if (body.entities.length > 0) sourcesQueried.push('body');

  let organizationalMemory = null;
  try {
    const memResult = computeOrganizationalMemory(workspace.domainType);
    organizationalMemory = memResult.ok ? memResult.data : null;
    if (organizationalMemory) sourcesQueried.push('organizational-memory');
  } catch { /* unbound domainType — honest null, never a guess */ }

  let recognition = [];
  try {
    const recResult = recognitionRecords.listRecognitionRecords({});
    recognition = recResult.ok ? recResult.data : [];
    if (recognition.length > 0) sourcesQueried.push('recognition');
  } catch { /* Recognition backend not configured — honest empty */ }

  let learningRecommendations = [];
  try {
    learningRecommendations = computeRecommendations({ domainType: workspace.domainType });
    if (learningRecommendations.length > 0) sourcesQueried.push('learning');
  } catch { /* honest empty */ }

  // Phase 12.8.x, Sprint 2 — enrich each block's ALREADY-EXISTING
  // liveEntityRefs field (reserved by live-block-contract.js since Sprint
  // 12.8.1 specifically for this) via deterministic text matching. Never
  // a new contract field; never NLP. A block whose text matches nothing
  // in the vocabulary keeps its honest, empty liveEntityRefs — exactly
  // the same "no fabricated match" restraint every suggestion rule in
  // this platform already follows.
  const vocabulary = buildVocabulary({ body, organizationalMemory });
  const enrichedBlocks = vocabulary.length === 0 ? blocks : blocks.map((block) => {
    const value = typeof block.value === 'string' ? block.value : '';
    const matches = matchEntityMentions(value, vocabulary);
    if (!matches.length) return block;
    return Object.freeze({
      ...block,
      liveEntityRefs: Object.freeze(matches.map((m) => m.refId || m.term)),
    });
  });
  if (enrichedBlocks.some((b) => b.liveEntityRefs.length > 0)) sourcesQueried.push('entity-text-match');

  // Phase 12.8.x, Sprint 3 ("Live Organizational Context") — the SAME
  // Problem-construction shape problem-solving-service.js#composeApprovedNor
  // already uses for its own `reasoningConsidered` instrumentation (see
  // that file's own header — this is not a new pattern, a second real
  // caller of it). `reason()`'s cite-or-abstain machinery only ever cites
  // Approved KnowledgeItems of kind rule/policy — never a live Body fact
  // (see body/README.md §1) — so this stays fully consistent with that
  // constraint. Best-effort: reasoning/ throwing or finding
  // NO_APPLICABLE_KNOWLEDGE is an honest, expected outcome, never a bug.
  let reasoning = null;
  try {
    const facts = Object.fromEntries(enrichedBlocks.map((b) => [b.field, b.value]));
    const problem = makeProblem({ domainType: workspace.domainType, description: `Workspace review — ${workspace.documentId}`, facts: { ...facts, type: facts.type || null } });
    reasoning = reasonWithGaps(problem);
    if ((reasoning.recommendation.ok) || (reasoning.gaps && reasoning.gaps.length > 0)) sourcesQueried.push('reasoning');
  } catch { /* honest null, never a guess */ }

  return Object.freeze({
    workspaceId, documentId: workspace.documentId, domainType: workspace.domainType,
    blocks: enrichedBlocks, body, organizationalMemory, recognition, learningRecommendations, reasoning,
    explain: { sourcesQueried, asOf },
    builtAt: asOf,
  });
}
