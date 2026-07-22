/* ============================================================
   WORKSPACE-SERVICE.JS — Live Word Workspace (V2, Phase 12.8.2 / 12.8.4 / 12.8.5)

   PURPOSE: the ONE owner of the Workspace Repository AND the Workspace
   Timeline Repository — mirrors body/services/entity-service.js's role
   for two repositories instead of one (the same shape
   body/services/body-sensing-service.js already takes as ORCHESTRATOR
   over relationship-repository.js + body-event-repository.js). The
   single legitimate caller of repository/workspace-repository.js's
   `create`/`appendVersion` and repository/workspace-timeline-repository.js's
   `append` — both enforced by scripts/workspace-ownership-check.mjs.

   RESPONSIBILITY:
     createWorkspace / getWorkspace / getOrCreateWorkspaceForDocument
       — Sprint 12.8.2. `createWorkspace` REFUSES to create a Workspace
       for a documentId that does not resolve to a real ComposerDocument
       (composer-store.js#getDocument) — a Workspace with no document
       behind it would be exactly the "reader with nothing real to read"
       dormant-subsystems.js exists to catch, except worse: a writer that
       accepts garbage input.
     buildContext(workspaceId, opts) — thin delegation to
       workspace-context-builder.js (Sprint 12.8.2).
     computeSuggestionsFor(workspaceId, opts) — builds a fresh context,
       then delegates to workspace-suggestion-engine.js (Sprint 12.8.3).
       Suggestions themselves are NEVER persisted — see
       live-suggestion-contract.js's header: they are recomputed fresh on
       every call, exactly like body-context-builder.js's own context and
       learning-recommendation-engine.js's own recommendations. Only a
       human DECISION about one becomes a persisted fact (below).
     decideSuggestion(workspaceId, suggestion, decision, opts) — Sprint
       12.8.5. The ONE place a human's accept/reject of a LiveSuggestion
       becomes two real, separate writes: (1) a WorkspaceTimelineEntry
       (this domain's own append-only log) and (2) a real Learning Signal
       via learning/services/learning-signal-service.js#emitLearningSignal
       — closing CLAUDE.md's Learning step of the Thinking Model for the
       live editor for the first time. `signalType` is namespaced
       (`workspace.suggestion.accepted`/`.rejected`) specifically so it
       never collides with document-intelligence/composer/
       section-learning-bridge.js's OWN, pre-existing, UNCHANGED
       `document.section.edited`-shaped corrections — two real signal
       producers, never double-counted (see
       learning-signal-service.js's own Dedup stage, which this
       namespacing makes effective). An ACCEPTED suggestion whose
       evidence cites Knowledge/Organizational-Memory records also
       appends a CITATION_BOUND entry — this platform's realization of
       "Live Citation": bound at the WORKSPACE layer, never written back
       into the ComposerDocument's own EditableSection.knowledgeReferences
       (which would require document-intelligence/composer-store.js to
       grow a new write path — explicitly out of scope, see
       workspace/README.md's "What Phase 12.8 does NOT do").
     getWorkspaceTimeline / getBlockCitations — read passthroughs.

   DEPENDENCIES: repository/workspace-repository.js,
   repository/workspace-timeline-repository.js,
   contracts/{workspace,workspace-timeline-entry}-contract.js,
   context/workspace-context-builder.js,
   suggestion/workspace-suggestion-engine.js,
   document-intelligence/composer/composer-store.js (getDocument, read-only),
   learning/services/learning-signal-service.js (emitLearningSignal).

   NON-GOALS: does not call a sensor, an extractor, or a classifier
   directly — those are workspace-context-builder.js's and
   workspace-suggestion-engine.js's own jobs. Does not decide WHEN to
   refresh a context or recompute suggestions — that is every UI caller's
   own cadence decision (Sprint 12.8.4 uses block-blur, the same idle
   cadence document-intelligence/composer/composer-store.js#editSection
   already commits on).
   ============================================================ */

'use strict';

import {
  getById as repoGetById, list as repoList, create as repoCreate,
  appendVersion as repoAppendVersion, getMetrics as repoGetMetrics,
  setActiveRepository, getActiveRepositoryId,
} from '../repository/workspace-repository.js';
import { append as timelineAppend, list as timelineList } from '../repository/workspace-timeline-repository.js';
import { REPOSITORY_ERRORS } from '../repository/contracts/repository-contract.js';
import { makeWorkspace, isWorkspace } from '../contracts/workspace-contract.js';
import { makeWorkspaceTimelineEntry, ENTRY_TYPE } from '../contracts/workspace-timeline-entry-contract.js';
import { SUGGESTION_SOURCE_DOMAIN } from '../contracts/live-suggestion-contract.js';
import { buildWorkspaceContext } from '../context/workspace-context-builder.js';
import { computeSuggestions } from '../suggestion/workspace-suggestion-engine.js';
import { getDocument } from '../../document-intelligence/composer/composer-store.js';
import { emitLearningSignal } from '../../learning/services/learning-signal-service.js';
import { explainSuggestion } from '../explainability/workspace-explainability-service.js';
import { cacheSnapshot, getSnapshot } from '../snapshot/workspace-snapshot-cache.js';

export const WORKSPACE_SERVICE_ERRORS = Object.freeze({
  INVALID_CANDIDATE: 'INVALID_CANDIDATE',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  INVALID_DECISION: 'INVALID_DECISION',
});

function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @param {{documentId: string, ownerId: string, domainType?: string}} seed */
export function createWorkspace({ documentId, ownerId, domainType }) {
  if (typeof documentId !== 'string' || !documentId) {
    return { ...failure(WORKSPACE_SERVICE_ERRORS.INVALID_CANDIDATE, 'createWorkspace: documentId is required.'), op: null };
  }
  const doc = getDocument(documentId);
  if (!doc) {
    return { ...failure(WORKSPACE_SERVICE_ERRORS.DOCUMENT_NOT_FOUND, `createWorkspace: no ComposerDocument "${documentId}".`), op: null };
  }
  const candidate = makeWorkspace({ documentId, domainType: domainType || doc.domainType, ownerId });
  const created = repoCreate(candidate);
  return { ...created, op: created.ok ? 'create' : null };
}

export function getWorkspace(workspaceId) { return repoGetById(workspaceId); }

/** Convenience for the common "one document, one workspace" case — reuses
 *  an existing Workspace for this documentId if one exists, otherwise
 *  creates one. NOT append-only reconciliation like observeEntity()'s
 *  create-or-version pattern: a Workspace's identity is the document it
 *  wraps, and re-opening it is not itself a fact worth a new version. */
export function getOrCreateWorkspaceForDocument(documentId, { ownerId }) {
  const existing = repoList({ documentId });
  if (existing.ok && existing.data.length > 0) {
    return { ok: true, data: existing.data[0], error: null, op: null };
  }
  return createWorkspace({ documentId, ownerId });
}

/** Sprint 12.8.6 — every successful build (a real documentId resolved)
 *  is also cached, so a subsequent getLastSnapshot() can serve a
 *  same-tab, honestly-aged fallback if a later build fails or a reviewer
 *  reopens the Workspace — see workspace-snapshot-cache.js's own header
 *  for why this stays a narrow, same-process cache this phase. */
export function buildContext(workspaceId, opts) {
  const context = buildWorkspaceContext({ workspaceId, ...opts });
  if (context.documentId) cacheSnapshot(workspaceId, context);
  return context;
}

export function getLastSnapshot(workspaceId, opts) { return getSnapshot(workspaceId, opts); }

/** @param {string} workspaceId @param {{blockId?: string|null, entityIds?: string[]}} [opts] */
export function computeSuggestionsFor(workspaceId, { blockId = null, entityIds = [] } = {}) {
  const context = buildWorkspaceContext({ workspaceId, entityIds });
  return computeSuggestions(context, { blockId });
}

const DECISIONS = Object.freeze({ ACCEPTED: 'accepted', REJECTED: 'rejected', IGNORED: 'ignored' });
const CITATION_SOURCE_DOMAINS = Object.freeze([SUGGESTION_SOURCE_DOMAIN.KNOWLEDGE, SUGGESTION_SOURCE_DOMAIN.ORGANIZATIONAL_MEMORY]);
const DECISION_ENTRY_TYPE = Object.freeze({
  [DECISIONS.ACCEPTED]: ENTRY_TYPE.SUGGESTION_ACCEPTED,
  [DECISIONS.REJECTED]: ENTRY_TYPE.SUGGESTION_REJECTED,
  // Phase 12.8.x, Sprint 5 — a real, distinct outcome, never conflated
  // with an explicit reject: "the reviewer said no" and "the reviewer
  // never engaged with it at all" are different, both real signals
  // worth Learning recording separately (see learning-recommendation-
  // engine.js's own FLAG_ANOMALY rule, which this can feed).
  [DECISIONS.IGNORED]: ENTRY_TYPE.SUGGESTION_IGNORED,
});

/**
 * The one place a human decision about a LiveSuggestion becomes real —
 * see this file's header for the full two-write shape. 'ignored' is
 * never fired by a human click — it is the ONE decision a caller (see
 * ui/review-workspace.js#refreshLiveSuggestions) infers itself, when a
 * suggestion that was genuinely rendered for at least one prior cycle
 * quietly stops applying without ever being accepted or rejected.
 * @param {string} workspaceId
 * @param {import('../contracts/live-suggestion-contract.js').LiveSuggestion} suggestion
 * @param {'accepted'|'rejected'|'ignored'} decision
 * @param {{actorId: string, blockId?: string|null}} opts
 */
export function decideSuggestion(workspaceId, suggestion, decision, { actorId, blockId = null } = {}) {
  const entryType = DECISION_ENTRY_TYPE[decision];
  if (!entryType) {
    return { ...failure(WORKSPACE_SERVICE_ERRORS.INVALID_DECISION, `decideSuggestion: decision must be "accepted", "rejected", or "ignored", got "${decision}".`), timelineEntry: null, citationEntry: null, learningResult: null };
  }
  const wsResult = repoGetById(workspaceId);
  if (!wsResult.ok) {
    return { ...failure(WORKSPACE_SERVICE_ERRORS.WORKSPACE_NOT_FOUND, `decideSuggestion: no workspace "${workspaceId}".`), timelineEntry: null, citationEntry: null, learningResult: null };
  }
  const workspace = wsResult.data;
  const resolvedBlockId = blockId ?? suggestion.blockId;
  const timelineEntry = makeWorkspaceTimelineEntry({
    workspaceId, entryType, suggestionId: suggestion.suggestionId, blockId: resolvedBlockId, actorId,
    detail: { suggestionType: suggestion.suggestionType, sourceDomain: suggestion.sourceDomain, confidence: suggestion.confidence },
  });
  timelineAppend(timelineEntry);

  const learningResult = emitLearningSignal({
    domainType: 'workspace',
    entityType: suggestion.sourceDomain,
    entityId: suggestion.sourceRecordId,
    signalType: `workspace.suggestion.${decision}`,
    sourceType: 'workspace-suggestion',
    actorId,
    reason: null,
    before: null,
    after: { suggestionType: suggestion.suggestionType, payload: suggestion.payload, blockId: resolvedBlockId },
    sourceDocumentId: workspace.documentId,
    affectedKnowledgeId: suggestion.sourceDomain === SUGGESTION_SOURCE_DOMAIN.KNOWLEDGE ? suggestion.sourceRecordId : null,
    evidence: { suggestionId: suggestion.suggestionId, confidence: suggestion.confidence },
  });

  let citationEntry = null;
  if (decision === DECISIONS.ACCEPTED && CITATION_SOURCE_DOMAINS.includes(suggestion.sourceDomain)) {
    citationEntry = makeWorkspaceTimelineEntry({
      workspaceId, entryType: ENTRY_TYPE.CITATION_BOUND, suggestionId: suggestion.suggestionId, blockId: resolvedBlockId, actorId,
      detail: { citedItemIds: suggestion.evidence.map((e) => e.itemId) },
    });
    timelineAppend(citationEntry);
  }

  return { ok: true, error: null, timelineEntry, citationEntry, learningResult };
}

export function getWorkspaceTimeline(workspaceId) {
  return timelineList({ workspaceId });
}

/** Folds every CITATION_BOUND entry for one block into a flat, deduped
 *  list — "Live Citation," read side. Never invents a citation: every
 *  entry here traces back to a real accepted LiveSuggestion's own
 *  evidence (see decideSuggestion above). */
export function getBlockCitations(workspaceId, blockId) {
  const result = timelineList({ workspaceId, blockId, entryType: ENTRY_TYPE.CITATION_BOUND });
  if (!result.ok) return [];
  const seen = new Set();
  const citations = [];
  for (const entry of result.data) {
    for (const itemId of (entry.detail && entry.detail.citedItemIds) || []) {
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      citations.push({ itemId, boundAt: entry.occurredAt, boundBy: entry.actorId });
    }
  }
  return citations;
}

export { explainSuggestion };
export { isWorkspace };
export function setWorkspaceBackend(id) { return setActiveRepository(id); }
export function getWorkspaceBackendId() { return getActiveRepositoryId(); }
export function getWorkspaceMetrics() { return repoGetMetrics(); }
export { REPOSITORY_ERRORS as WORKSPACE_REPOSITORY_ERRORS };
