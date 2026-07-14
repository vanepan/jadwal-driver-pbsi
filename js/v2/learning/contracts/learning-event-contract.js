/* ============================================================
   LEARNING-EVENT-CONTRACT.JS — Learning Ownership & Organizational Memory (Phase 5)

   PURPOSE: fix the shape of ONE LearningEvent — the single unit Organization
   Memory, Pattern Discovery, Coverage and the Executive Briefing are all built
   out of. Before this phase these were five partially-connected subsystems
   (Correction Log, Gap Workflow, Pattern Discovery, Coverage, Learning
   Dashboard) each inventing its own ad-hoc log shape (`{itemId, generatedNew,
   similarityMatchFound, at}` for corrections; a bare `Map<string,GAP_STATUS>`
   for gaps; nothing at all for coverage). A LearningEvent is the one shape
   all of them now produce and consume.

   WHAT A LEARNING EVENT IS. A recorded, provenanced fact that the
   organization learned something — a human corrected metadata, a gap was
   resolved, a pattern reached real statistical support, a coverage snapshot
   was taken, a piece of knowledge was approved, two documents were found to
   relate. It is NEVER a prediction, a suggestion, or an AI inference — every
   field is either something a human explicitly did, or a deterministic
   computation over data that already exists elsewhere in this platform. See
   services/learning-service.js's header for the full "why".

   ══════════════════════════════════════════════════════════════════════
   THE LEARNING LIFECYCLE — Observed → Validated → Accepted → Applied →
   Historical, exactly as the mission specifies, but read this before
   assuming every one of the five is a real resting state.

   Precedent: Phase 2.6's Import Session ladder includes PREPARING /
   FINGERPRINTING / DEDUPLICATION as real enum members even though no session
   is ever CREATED at any of them — "a session that exists has, by
   construction, already passed them," so CLASSIFICATION is the true starting
   persisted stage. Phase 4's Archive contract went further and REFUSED to
   declare "Indexed" as a state at all, because unlike Import Session's
   pre-stages, nothing about Archive's indexing is even conceptually a
   waypoint — it's permanently instantaneous, so persisting it would be
   inventing a fact.

   VALIDATED is the Import-Session case, not the Archive-Indexed case:
   structural validation (a real actor, a real domainType, a real change
   rather than a no-op) is deterministic and instantaneous, but it is a real,
   nameable step every event conceptually passes through — so it stays in the
   enum for explainability, while the actual first PERSISTED state is
   VALIDATED itself. No LearningEvent is ever created at OBSERVED; the
   Learning Service's recordX() functions validate at the door (mirroring
   Knowledge Service's ingest() refusing a malformed item outright) and simply
   never persist anything that fails. OBSERVED remains in the enum purely so
   "what did this event conceptually pass through" can be answered honestly
   in explainLearningEvent() — exactly how DEV_STAGE_LABEL still names
   FINGERPRINTING even though no session is ever observed there.

   ACCEPTED and APPLIED are BOTH decided deterministically, together, at
   record time — because every consumer of accepted knowledge (Organization
   Memory, Pattern Discovery, Coverage) is a PURE, STATELESS aggregator that
   recomputes fresh on every read (exactly like Pattern Discovery already
   worked before this phase — "never writes anything... a pure report").
   There is no queue of "accepted but not yet applied" events waiting for a
   sweep to fold them in, because nothing in this design needs one: an event
   either qualifies for organizational memory the moment it is recorded, or
   it doesn't. Modelling a separate pending-APPLIED resting state that every
   event passes through in zero real time would be the same fabricated
   waypoint INDEXED was refused for.

   HISTORICAL is the one real, separately-triggered, later transition: when a
   NEWER correction targets the same (domainType, correctionType, targetId,
   field) as an EARLIER one, the earlier one is superseded — mirroring
   exactly how Archive's supersede chain retires a predecessor. This is
   genuinely observable and genuinely happens at a different time than the
   original recording, which is what makes it a real lifecycle transition
   rather than an instant one.
   ══════════════════════════════════════════════════════════════════════

   RESPONSIBILITY: define LEARNING_STATE, LEARNING_GRAPH, CORRECTION_TYPE,
   LEARNING_KIND, makeLearningEvent, isLearningEvent, canTransitionLearning.

   DEPENDENCIES: none. Learning is the platform's most upstream domain — see
   js/v2/README.md's dependency graph and services/learning-service.js's
   header for why knowledge/ and organizational-memory/ may depend on
   learning/, and learning/ depends on neither ENGINE OR SERVICE in either
   domain. The one precedented exception (repository/learning-repository.js
   reuses knowledge/contracts/identity-contract.js#nextVersion — a pure,
   zero-import leaf utility, exactly as archive-repository.js and
   knowledge-repository.js already do) is not a domain dependency; it is
   the same "don't duplicate a one-line utility" discipline every repository
   in this platform follows, and it is allowlisted by name in
   scripts/learning-ownership-check.mjs rather than silently exempted.
   ============================================================ */

'use strict';

export const LEARNING_EVENT_SCHEMA = 'learning-event@1';

/** What KIND of organizational fact this event records — the five funnel
 *  stages the mission's architecture diagram names, plus the two producers
 *  Part 9 explicitly expects (Knowledge Approval, Archive Relationships)
 *  folded into CORRECTION/EVOLUTION since they are both, structurally, "the
 *  organization learned a fact just changed." */
export const LEARNING_KIND = Object.freeze({
  CORRECTION: 'correction',           // a human corrected something (see CORRECTION_TYPE)
  GAP_RESOLUTION: 'gap_resolution',   // a detected numbering gap was resolved
  PATTERN: 'pattern',                 // Pattern Discovery found real statistical support
  COVERAGE_SNAPSHOT: 'coverage_snapshot', // a Coverage Report was computed
  KNOWLEDGE_EVOLUTION: 'knowledge_evolution', // a KnowledgeItem reached Approved
});

/** Part 3's five correction categories — a closed, deterministic taxonomy.
 *  Only CORRECTION-kind events carry one. */
export const CORRECTION_TYPE = Object.freeze({
  METADATA: 'metadata',           // Import Session domain/dataset/kind correction (Advanced Metadata)
  KNOWLEDGE: 'knowledge',         // a human declared existing Knowledge needs rework (Request Changes)
  RELATIONSHIP: 'relationship',   // a document/knowledge relationship was established or corrected (Archive supersede)
  DOMAIN: 'domain',               // a domainType classification was corrected
  PATTERN: 'pattern',             // a human overrode/approved a detected pattern (Profile Override)
});

export const LEARNING_STATE = Object.freeze({
  OBSERVED: 'observed',
  VALIDATED: 'validated',
  ACCEPTED: 'accepted',
  APPLIED: 'applied',
  HISTORICAL: 'historical',
});

export const LEARNING_STATE_DEFS = Object.freeze([
  Object.freeze({ id: LEARNING_STATE.OBSERVED, label: 'Diamati' }),
  Object.freeze({ id: LEARNING_STATE.VALIDATED, label: 'Divalidasi' }),
  Object.freeze({ id: LEARNING_STATE.ACCEPTED, label: 'Diterima' }),
  Object.freeze({ id: LEARNING_STATE.APPLIED, label: 'Diterapkan' }),
  Object.freeze({ id: LEARNING_STATE.HISTORICAL, label: 'Riwayat' }),
]);

/** The full conceptual ladder, for explainability — see the header on why
 *  OBSERVED is never a persisted resting point. */
export const LEARNING_STATE_ORDER = Object.freeze([
  LEARNING_STATE.OBSERVED, LEARNING_STATE.VALIDATED, LEARNING_STATE.ACCEPTED,
  LEARNING_STATE.APPLIED, LEARNING_STATE.HISTORICAL,
]);

/** The ONE authority on legal Learning Event moves. */
export const LEARNING_GRAPH = Object.freeze({
  // pre-persistence, instantaneous — no event is ever created here (see header)
  [LEARNING_STATE.OBSERVED]: Object.freeze([LEARNING_STATE.VALIDATED]),
  // the real starting persisted state. Most events accept-and-apply in the
  // same write (deterministic, no human gate); a structurally-valid-but-
  // not-memory-worthy event (a no-op, an immediately-reverted correction)
  // may go straight to Historical instead.
  [LEARNING_STATE.VALIDATED]: Object.freeze([LEARNING_STATE.ACCEPTED, LEARNING_STATE.HISTORICAL]),
  [LEARNING_STATE.ACCEPTED]: Object.freeze([LEARNING_STATE.APPLIED, LEARNING_STATE.HISTORICAL]),
  [LEARNING_STATE.APPLIED]: Object.freeze([LEARNING_STATE.HISTORICAL]),
  // terminal, absorbing — a superseded fact stays superseded.
  [LEARNING_STATE.HISTORICAL]: Object.freeze([]),
});

export function canTransitionLearning(from, to) {
  const reachable = LEARNING_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

export function isTerminalLearningState(state) {
  return state === LEARNING_STATE.HISTORICAL;
}

/**
 * @typedef {Object} LearningEvent
 * @property {string} id                  - deterministic: `learning:<kind>:<domainType>:<discriminator>`
 * @property {number} version             - append-only, same invariants as every other domain record
 * @property {string} kind                - one of LEARNING_KIND
 * @property {string|null} correctionType - one of CORRECTION_TYPE, only when kind is CORRECTION
 * @property {string} domainType          - registry-backed domainType
 * @property {string} state               - one of LEARNING_STATE
 * @property {string} actorId             - who performed the action (a human identity, or 'pipeline'/'system' for deterministic engine-observed facts — never fabricated, always the REAL actor)
 * @property {string|null} reason         - why, in the actor's own words (nullable — not every event has a human-typed reason, e.g. a pattern observation)
 * @property {*} before                   - the prior value/fact, or null if this is a first observation
 * @property {*} after                    - the new value/fact
 * @property {string|null} sourceDocumentId  - the Import Session or Archive Record this traces to, if any (bare reference — see the service header on why Learning never imports knowledge/ or organizational-memory/)
 * @property {string|null} affectedKnowledgeId - the KnowledgeItem this affects, if any (bare reference)
 * @property {string|null} supersedesId   - the earlier LearningEvent this one corrects/replaces, if any
 * @property {string|null} supersededById - the later LearningEvent that replaced this one
 * @property {Object|null} evidence       - deterministic supporting data (support counts, confidence, affected ids) — never a probability, never a score without a stated formula
 * @property {string} observedAt          - ISO 8601, when the underlying fact actually happened
 * @property {string} updatedAt           - ISO 8601
 */

let _counter = 0;
function nextDiscriminator() {
  _counter += 1;
  return `${Date.now()}:${_counter}`;
}

/** @param {{id?: string, kind: string, correctionType?: string|null, domainType: string, actorId: string, reason?: string|null, before?: *, after: *, sourceDocumentId?: string|null, affectedKnowledgeId?: string|null, evidence?: Object|null}} seed */
export function makeLearningEvent({
  id = null, kind, correctionType = null, domainType, actorId, reason = null,
  before = null, after, sourceDocumentId = null, affectedKnowledgeId = null, evidence = null,
}) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: id || `learning:${kind}:${domainType}:${nextDiscriminator()}`,
    version: 1,
    kind,
    correctionType,
    domainType,
    // makeLearningEvent() is the record-time constructor; the Service decides
    // ACCEPTED/APPLIED/HISTORICAL by calling appendVersion afterward — this
    // factory only ever produces the honest starting state.
    state: LEARNING_STATE.VALIDATED,
    actorId,
    reason,
    before,
    after,
    sourceDocumentId,
    affectedKnowledgeId,
    supersedesId: null,
    supersededById: null,
    evidence,
    observedAt: now,
    updatedAt: now,
  });
}

export function isLearningEvent(e) {
  return !!e && typeof e === 'object'
    && typeof e.id === 'string' && e.id.length > 0
    && typeof e.version === 'number' && e.version >= 1
    && typeof e.kind === 'string' && Object.values(LEARNING_KIND).includes(e.kind)
    && typeof e.domainType === 'string' && e.domainType.length > 0
    && typeof e.state === 'string' && Object.values(LEARNING_STATE).includes(e.state)
    && typeof e.actorId === 'string' && e.actorId.length > 0
    && e.after !== undefined;
}
