/* ============================================================
   KNOWLEDGE-SERVICE.JS — Knowledge Ownership & Governance (Phase 3)

   PURPOSE: Knowledge's ONE owner. Everything that creates, updates, merges,
   promotes, rejects, archives or restores a KnowledgeItem goes through here,
   exactly as everything that moves an Import Session goes through
   pipeline-scheduler.js. This file is the Knowledge domain's answer to that
   scheduler, and it exists for the same reason.

   WHY. The Phase 2.6 ownership audit found five independent writers against
   knowledge-repository.js:

     acquisition-engine.js          create() + appendVersion()
     extraction-write-helper.js     create() + appendVersion()
     knowledge-rehydration-engine.js create()
     correction-pipeline-engine.js  create() + appendVersion()
     lifecycle-engine.js            appendVersion()   (+ review-workflow, promotion)

   Five writers, no owner. The repository was acting as an owner, but a
   repository is a PERSISTENCE MECHANISM, not an authority: it can enforce that
   a record is well-formed and that a transition is legal, but it cannot
   enforce that the transition was one anybody was entitled to make. Nothing
   could answer "who is allowed to approve knowledge?" — because nothing owned
   the question. A shared persistence object is not a domain.

   Concretely, that gap was load-bearing: any connector could have emitted an
   item already stamped `lifecycleState: 'approved'` and the repository would
   have written it, silently bypassing the human gate that is the entire point
   of the lifecycle (Decision 6). ingest() below closes that door for good —
   see INGESTABLE_STATES.

   THE RULE, stated once:

     knowledge-repository.js#create / appendVersion / rollback
     lifecycle-engine.js#requestTransition

     ...have exactly ONE caller in the entire platform: this file.
     Every other module is a CLIENT. Enforced by
     scripts/knowledge-ownership-check.mjs, not by discipline.

   WHAT THIS FILE IS NOT. It is not a second lifecycle graph. The graph still
   lives in contracts/lifecycle-contract.js (LIFECYCLE_GRAPH), the transition
   mechanics still live in lifecycle/lifecycle-engine.js, and the decision
   shape still lives in contracts/review-contract.js. This file OWNS them; it
   does not reimplement them. There is one authority, and it delegates to one
   mechanism — the same relationship pipeline-scheduler.js has with
   import-session-engine.js.

   LAYERING NOTE (why the owner lives in services/). The engines below it
   (acquisition, extraction, correction, rehydration) import THIS file, which
   looks like an engine importing a service. It is not a violation: this file
   imports only the repository facade, the lifecycle engine and two contracts —
   never an engine that could import it back — so the dependency graph stays
   acyclic. Deliberately, it does NOT import import-session-engine.js (which
   would close a real cycle through dataset-import-service -> acquisition-engine
   -> knowledge-service). Import Session linkage is exposed as a plain
   `sourceRef` reference in explainKnowledge(), which the UI — the one layer
   allowed to see both — resolves for itself.

   RESPONSIBILITY:
     write   ingest / createDraft / updateDraft / mergeKnowledge
     govern  promoteKnowledge / requestChanges / rejectKnowledge /
             archiveKnowledge / restoreKnowledge
     read    getKnowledge / listKnowledge / searchKnowledge /
             getKnowledgeHistory / getKnowledgeVersion / getKnowledgeMetrics /
             getPendingReviewKnowledge / getKnowledgeDependencies
     explain explainKnowledge

   DEPENDENCIES: ../repository/knowledge-repository.js (the ONLY module allowed
   to call its writers), ../lifecycle/lifecycle-engine.js (the ONLY module
   allowed to call requestTransition), ../contracts/lifecycle-contract.js,
   ../contracts/review-contract.js. Phase 5 adds ../../learning/services/
   learning-service.js (a knowledge Approval is recorded as a Learning Event
   — see that file's header on why knowledge/ may depend on learning/ but
   never the reverse).
   ============================================================ */

'use strict';

import {
  create as repoCreate,
  appendVersion as repoAppendVersion,
  rollback as repoRollback,
  getById as repoGetById,
  getVersion as repoGetVersion,
  getHistory as repoGetHistory,
  list as repoList,
  search as repoSearch,
  getMetrics as repoGetMetrics,
  getPendingReview as repoGetPendingReview,
  getDependencies as repoGetDependencies,
} from '../repository/knowledge-repository.js';
import { REPOSITORY_ERRORS } from '../repository/contracts/repository-contract.js';
import { requestTransition } from '../lifecycle/lifecycle-engine.js';
import { LIFECYCLE_STATE, canTransition } from '../contracts/lifecycle-contract.js';
import { isValidReviewDecision } from '../contracts/review-contract.js';
// Phase 5 — knowledge/ may depend on learning/ (never the reverse — see
// learning-service.js's header for the full layering rationale). Knowledge
// Approval is one of Part 9's expected Learning producers.
import { recordKnowledgeEvolution } from '../../learning/services/learning-service.js';

export const KNOWLEDGE_SERVICE_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  INVALID_ITEM: 'INVALID_ITEM',
  NOT_INGESTABLE: 'NOT_INGESTABLE',
  IMMUTABLE_STATE: 'IMMUTABLE_STATE',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  INVALID_REVIEW_DECISION: 'INVALID_REVIEW_DECISION',
});

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

/** The only lifecycle states a machine may WRITE INTO the repository.
 *
 *  APPROVED is absent on purpose, and this is the single most important line
 *  in this file. Approval is the organization saying "this is true of us" —
 *  it is a human act, and nothing that ingests, extracts, corrects or
 *  rehydrates may perform it, however confident it is. Before this file
 *  existed nothing enforced that: a connector could emit an item already
 *  stamped `approved` and every writer would have persisted it without
 *  comment. DEPRECATED is absent for the mirror reason — retiring knowledge is
 *  a decision, not an ingest. */
const INGESTABLE_STATES = Object.freeze([
  LIFECYCLE_STATE.DRAFT, LIFECYCLE_STATE.CANDIDATE, LIFECYCLE_STATE.PENDING_REVIEW,
]);

/** States whose CONTENT may still be edited in place. Approved/Deprecated
 *  knowledge is immutable — a correction to it becomes a NEW Candidate that
 *  supersedes it (see correction-pipeline-engine.js), never a silent rewrite
 *  of something the organization already blessed. */
const MUTABLE_STATES = Object.freeze([
  LIFECYCLE_STATE.DRAFT, LIFECYCLE_STATE.CANDIDATE, LIFECYCLE_STATE.PENDING_REVIEW,
]);

export function isIngestableState(state) { return INGESTABLE_STATES.includes(state); }
export function isMutableState(state) { return MUTABLE_STATES.includes(state); }

/* ══ WRITE — the four ways knowledge may come into existence ═══════════ */

/**
 * The idempotent ingest every producing engine funnels through: create the
 * item, or append a new version if it already exists (the deterministic-id
 * DUPLICATE_ID pattern acquisition-engine.js and extraction-write-helper.js
 * each used to implement separately, now stated once).
 *
 * Refuses to write an item into a state no machine is entitled to reach —
 * this is the human gate, enforced at the only door.
 *
 * @param {object} item — a full KnowledgeItem
 * @returns {{ok: boolean, data: object|null, error: object|null, op: 'create'|'append'|null}}
 */
export function ingest(item) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) {
    return { ...failure(KNOWLEDGE_SERVICE_ERRORS.INVALID_ITEM, 'ingest: item must be a KnowledgeItem with an id.'), op: null };
  }
  if (!isIngestableState(item.lifecycleState)) {
    return {
      ...failure(
        KNOWLEDGE_SERVICE_ERRORS.NOT_INGESTABLE,
        `ingest: no engine may write knowledge directly into "${item.lifecycleState}" — approval and deprecation are human decisions (see promoteKnowledge/archiveKnowledge).`,
      ),
      op: null,
    };
  }
  const created = repoCreate(item);
  if (created.ok) return { ...created, op: 'create' };
  if (created.error && created.error.code === REPOSITORY_ERRORS.DUPLICATE_ID) {
    const appended = repoAppendVersion(item.id, item);
    return { ...appended, op: 'append' };
  }
  return { ...created, op: null };
}

/** A brand-new Draft. Used by the rehydration projection and by any producer
 *  whose output is genuinely unreviewed raw knowledge. Idempotent by id: an
 *  item that already exists is returned untouched, never silently rewritten. */
export function createDraft(item) {
  if (!item || item.lifecycleState !== LIFECYCLE_STATE.DRAFT) {
    return failure(KNOWLEDGE_SERVICE_ERRORS.INVALID_ITEM, 'createDraft: item must have lifecycleState "draft".');
  }
  const existing = repoGetById(item.id);
  if (existing.ok) return existing;
  return repoCreate(item);
}

/** Edits the CONTENT of knowledge that is still in play. Refuses to touch
 *  Approved or Deprecated knowledge — that is not an edit, it is a rewrite of
 *  organizational record, and the correct move is a new superseding Candidate. */
export function updateDraft(id, patch) {
  const current = repoGetById(id);
  if (!current.ok) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  if (!isMutableState(current.data.lifecycleState)) {
    return failure(
      KNOWLEDGE_SERVICE_ERRORS.IMMUTABLE_STATE,
      `updateDraft: "${id}" is ${current.data.lifecycleState} and may not be edited in place — supersede it with a new Candidate instead.`,
    );
  }
  if (patch && 'lifecycleState' in patch) {
    return failure(
      KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION,
      'updateDraft: content edits may not move the lifecycle — use promoteKnowledge/rejectKnowledge/archiveKnowledge.',
    );
  }
  return repoAppendVersion(id, patch);
}

/** Alias kept for the mission's vocabulary — merging and ingesting are the
 *  same deterministic operation here (create-or-append on a deterministic id),
 *  and giving them two implementations is exactly the duplication this phase
 *  exists to remove. */
export const mergeKnowledge = ingest;

/* ══ GOVERN — the lifecycle, owned ════════════════════════════════════ */

function currentStateOf(id) {
  const result = repoGetById(id);
  return result.ok ? result.data.lifecycleState : null;
}

/**
 * Advances knowledge toward Approved, taking every legal intermediate step.
 *
 * Draft -> Candidate -> Pending Review -> Approved
 *
 * A human pressing "Approve" on a Draft means "this is true of us", not "please
 * advance it one graph edge and make me click twice more" — the same reasoning
 * that removed the Setujui -> Impor double-approval from Import Session in
 * Phase 2.6. The intermediate edges are bookkeeping; the final one is the
 * decision, and only it demands a ReviewDecision with a real rationale
 * (isValidReviewDecision, unchanged).
 *
 * Every step goes through lifecycle-engine.requestTransition(), so every step
 * is legality-checked against LIFECYCLE_GRAPH and emits its LifecycleEvent.
 * Nothing here reimplements the graph.
 *
 * @param {string} id
 * @param {{approverId: string, decidedAt: string, preferenceRationale: string}} reviewDecision
 */
export function promoteKnowledge(id, reviewDecision) {
  let from = currentStateOf(id);
  if (!from) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  if (from === LIFECYCLE_STATE.APPROVED) {
    return failure(KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `"${id}" is already Approved.`);
  }

  const decision = { ...reviewDecision, toState: LIFECYCLE_STATE.APPROVED };

  // Walk the ladder. Bounded by the graph's depth — Draft is the furthest
  // start, three edges from Approved.
  for (let step = 0; step < 4; step += 1) {
    from = currentStateOf(id);
    if (from === LIFECYCLE_STATE.APPROVED) return repoGetById(id);

    if (from === LIFECYCLE_STATE.PENDING_REVIEW || from === LIFECYCLE_STATE.DEPRECATED) {
      // The human-gated edge. This is the ONLY step that is a decision.
      if (!isValidReviewDecision(decision, from)) {
        return failure(
          KNOWLEDGE_SERVICE_ERRORS.INVALID_REVIEW_DECISION,
          'promoteKnowledge: approving knowledge requires a ReviewDecision with an approverId and a real preferenceRationale.',
        );
      }
      const approved = requestTransition(id, from, LIFECYCLE_STATE.APPROVED, {
        approvedBy: decision.approverId,
        approvedAt: decision.decidedAt,
        preferenceRationale: decision.preferenceRationale,
      }, { viaReviewDecision: true });
      // Phase 5, Part 9 — Knowledge Approval as a Learning producer. Reaching
      // Approved is the organization declaring a fact true of itself, which is
      // exactly what organizational learning means (Part 5's "common approval
      // patterns" and Part 8's "knowledge quality trend" both read this).
      // Best-effort and never blocking: a Learning-recording failure must not
      // undo a real, already-persisted knowledge approval.
      if (approved.ok) {
        recordKnowledgeEvolution({
          domainType: approved.data.domainType, knowledgeId: id, fromState: from,
          toState: LIFECYCLE_STATE.APPROVED, actorId: decision.approverId, reason: decision.preferenceRationale,
        });
      }
      return approved;
    }

    const next = from === LIFECYCLE_STATE.DRAFT ? LIFECYCLE_STATE.CANDIDATE : LIFECYCLE_STATE.PENDING_REVIEW;
    if (!canTransition(from, next)) {
      return failure(KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot promote "${id}" from "${from}".`);
    }
    const stepped = requestTransition(id, from, next);
    if (!stepped.ok) return stepped;
  }
  return failure(KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `promoteKnowledge exhausted its step budget for "${id}" — this indicates a cycle in LIFECYCLE_GRAPH.`);
}

/** One step only: Candidate -> Pending Review. This is the queueing act (put
 *  it in front of a human), not the deciding act, so it carries no
 *  ReviewDecision. Kept as its own verb because the review subsystem genuinely
 *  needs the intermediate state to exist — the Review Queue is built from it. */
export function submitKnowledgeForReview(id) {
  const from = currentStateOf(id);
  if (!from) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  if (!canTransition(from, LIFECYCLE_STATE.PENDING_REVIEW)) {
    return failure(KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot submit "${id}" for review from "${from}".`);
  }
  return requestTransition(id, from, LIFECYCLE_STATE.PENDING_REVIEW);
}

/** One step only: Draft -> Candidate. The engine-side promotion (this is not a
 *  decision — a Candidate is still unapproved knowledge). */
export function promoteToCandidate(id, { actorId = null } = {}) {
  const from = currentStateOf(id);
  if (!from) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  if (!canTransition(from, LIFECYCLE_STATE.CANDIDATE)) {
    return failure(KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot promote "${id}" to Candidate from "${from}".`);
  }
  return requestTransition(id, from, LIFECYCLE_STATE.CANDIDATE, actorId ? { approvedBy: actorId } : {});
}

/**
 * "Request Changes" — the reviewer sends knowledge back for rework. NOT a
 * rejection: the item stays alive as a Candidate and can be corrected and
 * resubmitted. This is the existing Pending Review -> Candidate edge, given
 * the name it always meant.
 */
export function requestChanges(id, reviewDecision) {
  const from = currentStateOf(id);
  if (!from) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  const decision = { ...reviewDecision, toState: LIFECYCLE_STATE.CANDIDATE };
  if (!isValidReviewDecision(decision, from)) {
    return failure(KNOWLEDGE_SERVICE_ERRORS.INVALID_REVIEW_DECISION, 'requestChanges: requires a valid ReviewDecision, and is only legal from Pending Review.');
  }
  return requestTransition(id, from, LIFECYCLE_STATE.CANDIDATE);
}

/**
 * "Reject" — the organization declines this knowledge. Terminal in intent: it
 * lands in DEPRECATED, the single "no longer current" sink.
 *
 * NOTE ON VOCABULARY, because the mission and the code use different words.
 * The mission names five states (Draft / Candidate / Approved / Archived /
 * Superseded). The real contract (contracts/lifecycle-contract.js) has five
 * too, but they are Draft / Candidate / Pending Review / Approved /
 * Deprecated. "Archived" and "Superseded" are not separate states here — they
 * are the same fact ("this is no longer the organization's current answer")
 * arrived at from two different places, and DEPRECATED is that fact. Rather
 * than invent two states the graph does not have, this file gives the two
 * JOURNEYS their own verbs and their own recorded rationale:
 *
 *   rejectKnowledge()   never-accepted knowledge  -> Deprecated
 *   archiveKnowledge()  once-Approved knowledge   -> Deprecated  (supersession)
 *
 * Same sink, different history, and the history is what a human actually needs
 * to read. Inventing states to match a diagram would be fabrication.
 */
export function rejectKnowledge(id, { actorId = null, reason = null } = {}) {
  const from = currentStateOf(id);
  if (!from) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  if (from === LIFECYCLE_STATE.APPROVED) {
    return failure(
      KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION,
      `"${id}" is Approved — retiring live knowledge is an archive/supersession, not a rejection. Use archiveKnowledge().`,
    );
  }
  if (!canTransition(from, LIFECYCLE_STATE.DEPRECATED)) {
    return failure(KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot reject "${id}" from "${from}".`);
  }
  return requestTransition(id, from, LIFECYCLE_STATE.DEPRECATED, {
    preferenceRationale: reason || null,
    approvedBy: actorId || null,
  });
}

/** Retires knowledge the organization once approved (supersession). Same sink
 *  as rejectKnowledge, deliberately a different verb — see that function. */
export function archiveKnowledge(id, { actorId = null, reason = null } = {}) {
  const from = currentStateOf(id);
  if (!from) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  if (!canTransition(from, LIFECYCLE_STATE.DEPRECATED)) {
    return failure(KNOWLEDGE_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot archive "${id}" from "${from}".`);
  }
  return requestTransition(id, from, LIFECYCLE_STATE.DEPRECATED, {
    preferenceRationale: reason || null,
    approvedBy: actorId || null,
  });
}

/** Re-approves a PRIOR version as current. Append-only: this writes a NEW
 *  version carrying the old payload; it never edits or deletes history. Still
 *  a human decision, so still gated by a real ReviewDecision. */
export function restoreKnowledge(id, toVersion, reviewDecision) {
  const current = repoGetById(id);
  if (!current.ok) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  return repoRollback(id, toVersion, reviewDecision);
}

/* ══ READ — every consumer's one door ═════════════════════════════════ */

export const getKnowledge = (id, opts) => repoGetById(id, opts);
export const listKnowledge = (filter) => repoList(filter);
export const searchKnowledge = (query) => repoSearch(query);
export const getKnowledgeHistory = (id) => repoGetHistory(id);
export const getKnowledgeVersion = (id, version) => repoGetVersion(id, version);
export const getKnowledgeMetrics = () => repoGetMetrics();
export const getPendingReviewKnowledge = () => repoGetPendingReview();
export const getKnowledgeDependencies = (id) => repoGetDependencies(id);

/* Infrastructure, re-exported so that NO module outside this file and
   lifecycle-engine.js needs to import knowledge-repository.js at all — which
   is what makes "one owner" a property a script can check, rather than a claim
   in a comment. Neither of these is a knowledge mutation: one subscribes to
   change events, the other selects which persistence backend is live (a
   bootstrap concern, called once from the platform's mount). */
export {
  registerRepositoryListener as registerKnowledgeListener,
  unregisterRepositoryListener as unregisterKnowledgeListener,
  setActiveRepository as setKnowledgeBackend,
} from '../repository/knowledge-repository.js';

/* ══ EXPLAIN — why does this knowledge exist? ═════════════════════════ */

/**
 * Assembles the full provenance of one KnowledgeItem. Every field is READ from
 * data the item and its version history already carry — nothing here is
 * inferred, scored or invented, and a field with no real answer is reported as
 * null rather than filled with a plausible one.
 *
 * `importSessionId` is returned as a bare reference, not a resolved session:
 * this file must not import import-session-engine.js (it would close a real
 * dependency cycle — see the header). The UI resolves it, because the UI is
 * the one layer permitted to see both domains.
 *
 * @param {string} id
 */
export function explainKnowledge(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(KNOWLEDGE_SERVICE_ERRORS.NOT_FOUND, `No knowledge item "${id}".`);
  const item = current.data;
  const historyResult = repoGetHistory(id);
  const versions = historyResult.ok ? historyResult.data : [];
  const provenance = item.provenance || {};

  // An Import Session is the origin ONLY when the item genuinely came from the
  // manual-file upload bridge — that connector stamps the session id as its
  // sourceRef (connectors/manual-file-connector.js#buildManualFileKnowledgeItem).
  // For any other source this is honestly null, not a guess.
  const importSessionId = provenance.connectorId === 'manual-file' ? (provenance.sourceRef || null) : null;

  // The normalization block the connector attached is the real, recorded
  // statement of how this payload was derived. No connector fabricates one.
  const extractionRationale = item.payload && item.payload.normalization
    ? item.payload.normalization
    : null;

  // A manual edit is a version whose payload changed while the item was still
  // mutable — the correction pipeline's own footprint, read back out of history.
  const manualEdits = [];
  for (let i = 1; i < versions.length; i += 1) {
    const prev = versions[i - 1];
    const next = versions[i];
    if (JSON.stringify(prev.payload) !== JSON.stringify(next.payload)) {
      manualEdits.push({
        version: next.version,
        at: next.updatedAt,
        by: (next.provenance && next.provenance.connectorId === 'correction') ? 'correction' : (next.sourceType || null),
      });
    }
  }

  // Every version where the lifecycle actually moved — the audit trail of who
  // decided what, and why.
  const approvalHistory = [];
  for (let i = 0; i < versions.length; i += 1) {
    const prev = i > 0 ? versions[i - 1] : null;
    const v = versions[i];
    if (!prev || prev.lifecycleState !== v.lifecycleState) {
      approvalHistory.push({
        version: v.version,
        fromState: prev ? prev.lifecycleState : null,
        toState: v.lifecycleState,
        by: v.approvedBy || null,
        at: v.approvedAt || v.updatedAt,
        rationale: v.preferenceRationale || null,
      });
    }
  }

  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      id: item.id,
      kind: item.kind,
      domainType: item.domainType,
      lifecycleState: item.lifecycleState,
      origin: Object.freeze({
        sourceType: item.sourceType || null,
        connectorId: provenance.connectorId || null,
        sourceRef: provenance.sourceRef || null,
        capturedAt: provenance.capturedAt || null,
      }),
      importSessionId,
      extractionRationale,
      confidence: typeof item.confidence === 'number' ? item.confidence : null,
      manualEdits: Object.freeze(manualEdits),
      approvalHistory: Object.freeze(approvalHistory),
      versionHistory: Object.freeze(versions.map((v) => Object.freeze({
        version: v.version, lifecycleState: v.lifecycleState, updatedAt: v.updatedAt,
      }))),
    }),
  });
}

export { LIFECYCLE_STATE };
