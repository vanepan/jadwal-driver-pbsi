/* ============================================================
   LEARNING-SERVICE.JS — Learning Ownership & Organizational Memory (Phase 5)

   PURPOSE: Learning's ONE owner — the fourth domain in this series, after
   Import Session (pipeline-scheduler.js, Phase 2.6), Knowledge
   (knowledge-service.js, Phase 3) and Archive (archive-service.js, Phase 4).
   Built to the identical shape on purpose: a reader who understands one
   understands all four.

   WHY. Before this phase, "Learning" was five partially-connected
   subsystems, each with its own ad-hoc log and its own silent failure mode:

     Correction Log     a bare array (_correctionLog) in
                        correction-pipeline-engine.js, DORMANT — its only
                        writer (submitCorrection, via diff-learning-engine.js)
                        had zero real callers. Five UI surfaces counted it and
                        rendered a confident, permanent zero (Phase 3's
                        finding, formally declared in dormant-subsystems.js).
     Gap Workflow       a bare Map in gap-workflow-engine.js. Real writers
                        existed (Phase 3 activated them into Archive Center),
                        but resolving a gap was pure bookkeeping — nothing
                        recorded that a resolution had happened as a fact the
                        organization could remember or trend on.
     Pattern Discovery  a pure, stateless read over Approved Knowledge — real
                        and correct, but blind to the platform's own
                        correction history: it could never notice "this field
                        keeps needing fixing," because nothing recorded
                        corrections anywhere it could read them.
     Coverage           one fabricated-feeling number ("Coverage 72%")
                        actually three DIFFERENT coverage percentages
                        (Knowledge/Profile/Dataset) computed by three
                        different call sites with no shared vocabulary and no
                        history — a snapshot with no trend, because nothing
                        persisted a snapshot.
     Learning Dashboard  composed the above four honestly (Phase 3's audit
                        confirmed no fabrication), but composing five
                        semi-connected sources is not the same thing as
                        owning a domain.

   Five surfaces, no owner, no shared vocabulary, no shared lifecycle. This
   file is that owner.

   THE RULE, stated once, same as every domain before it:

     repository/learning-repository.js#create / appendVersion

     ...have exactly ONE caller in the platform: this file. Every producer
     (metadata correction, knowledge approval, gap resolution, pattern
     discovery, coverage snapshot, archive relationships) is a CLIENT.
     Enforced by scripts/learning-ownership-check.mjs.

   ══════════════════════════════════════════════════════════════════════
   LAYERING — WHY LEARNING IS THE PLATFORM'S MOST UPSTREAM DOMAIN.

   js/v2/README.md's existing rule: `organizational-memory/ ──depends on──>
   knowledge/ (read-only); knowledge/ ──never depends on──> organizational-
   memory/`. Learning needs to receive corrections from BOTH sides — a human
   correcting Import Session metadata (knowledge/) and a human resolving an
   Archive gap or superseding a document (organizational-memory/) are both,
   structurally, the same kind of fact: organizational learning happened.
   Making Learning depend on either domain would either re-create the
   forbidden knowledge<->organizational-memory cycle, or force an arbitrary
   choice of which domain Learning "belongs" to when it genuinely belongs to
   neither.

   So Learning depends on NOTHING above it. Every reference to a document, a
   session, or a piece of knowledge is a bare id string (sourceDocumentId,
   affectedKnowledgeId) — exactly the discipline Archive already established
   for knowledgeItemId/importSessionId (see archive-service.js's header).
   Learning Service never imports knowledge/ or organizational-memory/, so:

     knowledge/              ──may depend on──>  learning/   (Pattern Discovery, Knowledge approval)
     organizational-memory/  ──may depend on──>  learning/   (Gap resolution, Archive supersession)
     learning/                ──never depends on──>  knowledge/ or organizational-memory/
     ui/                      ──depends on──>  learning/, knowledge/, organizational-memory/, document-intelligence/

   This is a strict extension of the existing acyclic graph, not a
   modification of it — no existing edge changes direction. See
   js/v2/README.md's updated dependency section.

   IDEMPOTENCY, AND WHY IT IS NOT OPTIONAL HERE. Pattern Discovery and
   Coverage are PURE, STATELESS engines that recompute on every render
   (unchanged from before this phase — see pattern-discovery-engine.js's own
   NON-GOALS). If recording their findings as Learning Events required a new
   render-triggering mechanism, this phase would have had to invent event
   infrastructure the mission explicitly forbids ("no feature expansion").
   Instead, recordPattern()/recordCoverage() are safe to call on EVERY read:
   they compare the new value against the last recorded one and perform
   ZERO writes when nothing changed — the exact "a converged sweep costs
   nothing" discipline pipeline-scheduler.js already established. A pattern
   or coverage snapshot only ever grows a new version when something REAL
   changed, which is what makes the resulting history an honest trend
   instead of a render-frequency artifact.

   RESPONSIBILITY:
     write    recordCorrection / recordGapResolution / recordPattern /
              recordCoverage / recordKnowledgeEvolution / recordLearningEvent
     govern   acceptLearningEvent / applyLearningEvent / supersedeLearningEvent
     read     findLearningEvent / listLearningEvents / getLearningHistory
     explain  explainLearningEvent

   DEPENDENCIES: ../repository/learning-repository.js (the ONLY module
   allowed to call its writers), ../contracts/learning-event-contract.js.
   ============================================================ */

'use strict';

import {
  create as repoCreate,
  appendVersion as repoAppendVersion,
  getById as repoGetById,
  getVersion as repoGetVersion,
  getHistory as repoGetHistory,
  list as repoList,
} from '../repository/learning-repository.js';
import {
  LEARNING_STATE, LEARNING_KIND, CORRECTION_TYPE,
  canTransitionLearning, isTerminalLearningState, makeLearningEvent,
} from '../contracts/learning-event-contract.js';

export const LEARNING_SERVICE_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  INVALID_EVENT: 'INVALID_EVENT',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
});

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}

function sameFact(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ══ THE ENTRY GATE — structural validation, no registry dependency ═══ */

function validateSeed(seed) {
  if (!seed || typeof seed !== 'object') return 'a seed object is required.';
  if (typeof seed.domainType !== 'string' || !seed.domainType) return 'domainType is required.';
  if (typeof seed.actorId !== 'string' || !seed.actorId) return 'actorId is required — a Learning Event must always name who or what observed it.';
  if (seed.after === undefined) return '"after" is required — a Learning Event with no new fact records nothing.';
  return null;
}

/* ══ THE SHARED RECORDING PATH ═════════════════════════════════════════
   Every recordX() function below is a thin, named wrapper over this. It:
     1. validates at the door (never persists a malformed event — the same
        discipline Knowledge Service's ingest() established for NOT_INGESTABLE),
     2. finds the CURRENT event for the same `targetKey` (if any),
     3. is a no-op if the new fact is identical to the current one
        (idempotent-when-unchanged — what makes it safe to call on every render),
     4. otherwise creates a NEW event and, if a current one existed,
        supersedes it (the Archive-style chain, applied to learning).
   ═══════════════════════════════════════════════════════════════════ */

function currentEventFor(kind, domainType, targetKey) {
  const result = repoList({ kind, domainType });
  if (!result.ok) return null;
  return result.data.find((e) => e.targetKey === targetKey && !isTerminalLearningState(e.state)) || null;
}

function record({
  kind, correctionType = null, domainType, targetKey, actorId, reason = null,
  before = null, after, sourceDocumentId = null, affectedKnowledgeId = null, evidence = null,
}) {
  const seedError = validateSeed({ domainType, actorId, after });
  if (seedError) return { ...failure(LEARNING_SERVICE_ERRORS.INVALID_EVENT, `record: ${seedError}`), op: null };

  const current = targetKey ? currentEventFor(kind, domainType, targetKey) : null;
  // The comparable fact is `after` PLUS `evidence` — for a Pattern or
  // Coverage producer, `after` names WHAT was observed (e.g. which pattern)
  // while `evidence` carries the actual changing measurement (support count,
  // the coverage numbers themselves). Comparing `after` alone would treat a
  // support count going from 5 to 50 as "the same fact" forever.
  if (current && sameFact(current.after, after) && sameFact(current.evidence, evidence)) {
    // The exact same fact was reported again (a render-time recompute, a
    // duplicate save). No new occasion happened — a real no-op, not a write.
    return { ok: true, data: current, error: null, op: 'noop' };
  }

  const event = makeLearningEvent({
    kind, correctionType, domainType, actorId, reason, before: current ? current.after : before,
    after, sourceDocumentId, affectedKnowledgeId, evidence,
  });
  const created = repoCreate({ ...event, targetKey: targetKey || null });
  if (!created.ok) return { ...created, op: null };

  // VALIDATED -> ACCEPTED -> APPLIED, in the same call, deterministically —
  // see the contract header on why these three are decided together rather
  // than left as separately-observable resting states nothing would ever
  // wait in.
  const applied = repoAppendVersion(event.id, { state: LEARNING_STATE.ACCEPTED });
  const finalResult = repoAppendVersion(event.id, { state: LEARNING_STATE.APPLIED });

  // A genuinely new fact about the same target supersedes the old one — the
  // organization's CURRENT understanding moves forward, but nothing is lost;
  // the prior event becomes HISTORICAL, chained.
  if (current) {
    repoAppendVersion(current.id, { state: LEARNING_STATE.HISTORICAL, supersededById: event.id });
    repoAppendVersion(event.id, { supersedesId: current.id });
  }

  return { ...(finalResult.ok ? finalResult : applied), op: current ? 'superseded' : 'create' };
}

/* ══ WRITE — the named producers Part 1 requires ══════════════════════ */

/**
 * Part 3 — a human corrected something. `targetKey` names WHAT was corrected
 * (the Import Session id for a metadata correction, the KnowledgeItem id for
 * a knowledge correction, the Archive Record id for a relationship
 * correction, the Profile Override id for a pattern correction) so repeat
 * corrections to the same target chain together instead of accumulating as
 * unrelated events.
 */
export function recordCorrection({
  domainType, correctionType, targetKey, actorId, reason = null, before = null, after,
  sourceDocumentId = null, affectedKnowledgeId = null, evidence = null,
}) {
  if (!Object.values(CORRECTION_TYPE).includes(correctionType)) {
    return { ...failure(LEARNING_SERVICE_ERRORS.INVALID_EVENT, `recordCorrection: "${correctionType}" is not a known CORRECTION_TYPE.`), op: null };
  }
  return record({
    kind: LEARNING_KIND.CORRECTION, correctionType, domainType, targetKey, actorId, reason,
    before, after, sourceDocumentId, affectedKnowledgeId, evidence,
  });
}

/** Part 4 — resolving a gap IS learning: the organization now knows this
 *  numbering gap was accounted for (filled, or deliberately accepted as a
 *  permanent hole). Idempotent per (domainType, expectedNumber). */
export function recordGapResolution({ domainType, expectedNumber, actorId, reason = null }) {
  return record({
    kind: LEARNING_KIND.GAP_RESOLUTION,
    domainType,
    targetKey: `gap:${expectedNumber}`,
    actorId,
    reason,
    after: { expectedNumber, resolved: true },
  });
}

/** Part 6/9 — Pattern Discovery, as a PRODUCER: a pattern that reached real
 *  statistical support becomes organizational memory. Idempotent per
 *  (domainType, patternType, value) — safe to call on every render; a
 *  converged pattern set writes nothing (see the header). */
export function recordPattern({ domainType, patternType, value, evidence, actorId = 'pattern-discovery' }) {
  return record({
    kind: LEARNING_KIND.PATTERN,
    domainType,
    targetKey: `pattern:${patternType}:${value}`,
    actorId,
    after: { patternType, value },
    evidence,
  });
}

/** Part 7 — a Coverage Report snapshot. Idempotent when unchanged, so calling
 *  it on every render produces a real HISTORY of coverage over time (a new
 *  version only when coverage actually moved) rather than a flood of
 *  identical snapshots — this is what makes "Knowledge quality trend"
 *  (Part 8) an honest trend instead of a fabricated one. */
export function recordCoverage({ domainType, report, actorId = 'coverage-engine' }) {
  return record({
    kind: LEARNING_KIND.COVERAGE_SNAPSHOT,
    domainType,
    targetKey: 'coverage-snapshot',
    actorId,
    after: report,
  });
}

/** Part 9 — Knowledge Approval as a producer: reaching Approved is the
 *  organization declaring a fact true of itself, which is exactly what
 *  organizational learning means. Always a genuinely new occasion (a real
 *  lifecycle transition just happened), never collapsed by idempotency. */
export function recordKnowledgeEvolution({ domainType, knowledgeId, fromState, toState, actorId, reason = null }) {
  return record({
    kind: LEARNING_KIND.KNOWLEDGE_EVOLUTION,
    domainType,
    targetKey: null, // every transition is its own occasion, never superseded
    actorId,
    reason,
    before: fromState,
    after: toState,
    affectedKnowledgeId: knowledgeId,
  });
}

/** Part 1 — the generic entry point, for a producer that does not fit one of
 *  the five named shapes above. Identical machinery, no special case. */
export function recordLearningEvent(seed) {
  return record(seed);
}

/* ══ GOVERN — explicit lifecycle transitions, for direct testability ═══
   record()'s ACCEPTED->APPLIED already happens automatically for every
   producer (see the header); these are exposed so the transition graph
   itself is independently exercisable and so a future producer that
   genuinely needs a slower path (a correction that should NOT auto-apply)
   has somewhere real to call. */

export function acceptLearningEvent(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(LEARNING_SERVICE_ERRORS.NOT_FOUND, `No learning event "${id}".`);
  if (!canTransitionLearning(current.data.state, LEARNING_STATE.ACCEPTED)) {
    return failure(LEARNING_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot accept "${id}" from "${current.data.state}".`);
  }
  return repoAppendVersion(id, { state: LEARNING_STATE.ACCEPTED });
}

export function applyLearningEvent(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(LEARNING_SERVICE_ERRORS.NOT_FOUND, `No learning event "${id}".`);
  if (!canTransitionLearning(current.data.state, LEARNING_STATE.APPLIED)) {
    return failure(LEARNING_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot apply "${id}" from "${current.data.state}".`);
  }
  return repoAppendVersion(id, { state: LEARNING_STATE.APPLIED });
}

/** Explicitly supersede one event with another already-recorded one —
 *  exposed for a producer composing its own chain outside record()'s
 *  automatic targetKey matching. */
export function supersedeLearningEvent(oldId, newId) {
  const old = repoGetById(oldId);
  if (!old.ok) return failure(LEARNING_SERVICE_ERRORS.NOT_FOUND, `No learning event "${oldId}".`);
  if (!canTransitionLearning(old.data.state, LEARNING_STATE.HISTORICAL)) {
    return failure(LEARNING_SERVICE_ERRORS.ILLEGAL_TRANSITION, `Cannot supersede "${oldId}" from "${old.data.state}".`);
  }
  const result = repoAppendVersion(oldId, { state: LEARNING_STATE.HISTORICAL, supersededById: newId });
  if (result.ok) repoAppendVersion(newId, { supersedesId: oldId });
  return result;
}

/* ══ READ — every consumer's one door ══════════════════════════════════ */

export const findLearningEvent = (id) => repoGetById(id);
export const getLearningVersion = (id, version) => repoGetVersion(id, version);
export const listLearningEvents = (filter) => repoList(filter || {});
export const getLearningHistory = (id) => repoGetHistory(id);

/* ══ EXPLAIN — Part 2's "every transition must have provenance" ═══════ */

/**
 * The complete story of one Learning Event: what changed, why, who, when,
 * the source document, the affected knowledge, and its place in any
 * supersession chain — assembled entirely from data the event and its
 * history already carry.
 */
export function explainLearningEvent(id) {
  const current = repoGetById(id);
  if (!current.ok) return failure(LEARNING_SERVICE_ERRORS.NOT_FOUND, `No learning event "${id}".`);
  const e = current.data;
  const historyResult = repoGetHistory(id);
  const versions = historyResult.ok ? historyResult.data : [];

  const lifecycleHistory = [];
  for (let i = 0; i < versions.length; i += 1) {
    const prev = i > 0 ? versions[i - 1] : null;
    const v = versions[i];
    if (!prev || prev.state !== v.state) {
      lifecycleHistory.push(Object.freeze({ version: v.version, fromState: prev ? prev.state : null, toState: v.state, at: v.updatedAt }));
    }
  }

  // Walk the full chain, oldest first, cycle-safe.
  const chain = [];
  const seen = new Set();
  let head = e;
  while (head && head.supersedesId && !seen.has(head.id)) {
    seen.add(head.id);
    const prevResult = repoGetById(head.supersedesId);
    if (!prevResult.ok) break;
    head = prevResult.data;
  }
  let cursor = head;
  const walked = new Set();
  while (cursor && !walked.has(cursor.id)) {
    walked.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.supersededById ? (repoGetById(cursor.supersededById).ok ? repoGetById(cursor.supersededById).data : null) : null;
  }

  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      id: e.id,
      kind: e.kind,
      correctionType: e.correctionType,
      state: e.state,
      domainType: e.domainType,
      what: Object.freeze({ before: e.before, after: e.after }),
      why: e.reason,
      who: e.actorId,
      when: e.observedAt,
      sourceDocumentId: e.sourceDocumentId,
      affectedKnowledgeId: e.affectedKnowledgeId,
      evidence: e.evidence,
      supersessionChain: chain.map((c) => Object.freeze({ id: c.id, state: c.state, at: c.observedAt, after: c.after })),
      lifecycleHistory: Object.freeze(lifecycleHistory),
      versionCount: versions.length,
    }),
  });
}

export { LEARNING_STATE, LEARNING_KIND, CORRECTION_TYPE };
