/* ============================================================
   CONVERSATION-CONTRACT.JS — Conversation Intelligence Foundation (Phase 6)

   PURPOSE: fix the shape of ONE Conversation — a deterministic task session,
   NOT a chat transcript. A Conversation exists so a human can describe what
   they want in one sentence and have the platform figure out, turn by turn,
   what is already known and what is genuinely missing — never so two
   parties can exchange messages. There is no "message log" field anywhere
   in this shape; gatheredFacts/missingFacts/explainability are the entire
   state that matters, because they are the entire state a deterministic
   engine can act on.

   ══════════════════════════════════════════════════════════════════════
   THE CONVERSATION LIFECYCLE — STARTED -> ACTIVE -> READY -> COMPLETED,
   with CANCELLED and FAILED as the two other honest exits.

   Same discipline as every lifecycle in this platform (see
   learning/contracts/learning-event-contract.js's header, archive-record-
   contract.js's header): a state is only declared here if something in
   this codebase can genuinely be observed resting in it. Two states that
   might look tempting are deliberately ABSENT:

     "DETECTING_INTENT"   NOT MODELLED. Intent detection is a pure,
                          instantaneous function of the opening utterance
                          (intent/intent-engine.js#detectIntent) — no
                          Conversation is ever created before its intent is
                          known, so there is no waypoint to name. The
                          detected intent is a FIELD on the STARTED record
                          (currentIntent), not a state of its own — exactly
                          how Import Session's PREPARING/FINGERPRINTING are
                          real enum members nothing is ever created at.

     "BUILDING_CONTEXT"   NOT MODELLED. Context Builder recomputes fresh on
                          every start/continue call (context/context-
                          builder.js is PURE and stateless, like every other
                          report engine in this platform) — building context
                          is not a step a Conversation waits at, it is a
                          side-effect-free read performed before every
                          resting state is written. Persisting a waypoint
                          for it would be the exact fabricated fact
                          archive-record-contract.js's header refuses for
                          "Indexed".

   The four REAL resting states:

     STARTED    the opening utterance was parsed and an intent was
                assigned (possibly UNKNOWN). Transient — startConversation()
                immediately advances it to ACTIVE, READY or FAILED in the
                same call, exactly like Archive's CREATED. Kept as a real
                state because a start that fails structurally (a malformed
                seed) is genuinely distinguishable from one that completed.
     ACTIVE     genuine facts are still missing; the human (or a future
                turn) must supply at least one more answer before this
                conversation can be acted on. This is where
                continueConversation() is called, any number of times.
     READY      every required fact is known — asked, or resolved by the
                Question Optimizer — and Context has been built. Nothing is
                missing, but the Task Executor has not run yet. A real,
                separately-observable resting point: a conversation can sit
                here for an arbitrary amount of time before a human (or an
                automated caller) decides to actually execute it.
     COMPLETED  the Task Executor ran and reported success. Terminal.
     CANCELLED  a human (or the platform) stopped this conversation before
                it executed anything. Terminal.
     FAILED     the platform could not proceed — intent was UNKNOWN/too low
                confidence to act on, or the Task Executor's dispatch itself
                reported failure. Terminal. Never silently reinterpreted as
                CANCELLED: a human choosing to stop and the platform being
                unable to understand are different facts with different
                remedies.
   ══════════════════════════════════════════════════════════════════════

   RESPONSIBILITY: CONVERSATION_STATE, CONVERSATION_GRAPH,
   canTransitionConversation, isTerminalConversationState,
   makeConversation, isConversation.

   DEPENDENCIES: none. Conversation is the platform's newest, most
   downstream domain — it reads knowledge/, organizational-memory/,
   learning/ and document-intelligence/ (all read-only, through their own
   services/pure engines — see services/conversation-service.js's header),
   but nothing in those domains may ever import conversation/ (Part 8 of
   the mission: "Conversation Memory must never contaminate Organization
   Memory" — enforced by scripts/conversation-ownership-check.mjs).
   ============================================================ */

'use strict';

export const CONVERSATION_SCHEMA = 'conversation@1';

export const CONVERSATION_STATE = Object.freeze({
  STARTED: 'started',
  ACTIVE: 'active',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

export const CONVERSATION_STATE_DEFS = Object.freeze([
  Object.freeze({ id: CONVERSATION_STATE.STARTED, label: 'Dimulai' }),
  Object.freeze({ id: CONVERSATION_STATE.ACTIVE, label: 'Menunggu Jawaban' }),
  Object.freeze({ id: CONVERSATION_STATE.READY, label: 'Siap Dieksekusi' }),
  Object.freeze({ id: CONVERSATION_STATE.COMPLETED, label: 'Selesai' }),
  Object.freeze({ id: CONVERSATION_STATE.CANCELLED, label: 'Dibatalkan' }),
  Object.freeze({ id: CONVERSATION_STATE.FAILED, label: 'Gagal' }),
]);

/** The ONE authority on legal Conversation moves. */
export const CONVERSATION_GRAPH = Object.freeze({
  [CONVERSATION_STATE.STARTED]: Object.freeze([
    CONVERSATION_STATE.ACTIVE, CONVERSATION_STATE.READY, CONVERSATION_STATE.FAILED,
  ]),
  [CONVERSATION_STATE.ACTIVE]: Object.freeze([
    CONVERSATION_STATE.READY, CONVERSATION_STATE.CANCELLED,
  ]),
  [CONVERSATION_STATE.READY]: Object.freeze([
    CONVERSATION_STATE.COMPLETED, CONVERSATION_STATE.FAILED, CONVERSATION_STATE.CANCELLED,
  ]),
  // terminal, absorbing.
  [CONVERSATION_STATE.COMPLETED]: Object.freeze([]),
  [CONVERSATION_STATE.CANCELLED]: Object.freeze([]),
  [CONVERSATION_STATE.FAILED]: Object.freeze([]),
});

export function canTransitionConversation(from, to) {
  const reachable = CONVERSATION_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}

export function isTerminalConversationState(state) {
  return state === CONVERSATION_STATE.COMPLETED
    || state === CONVERSATION_STATE.CANCELLED
    || state === CONVERSATION_STATE.FAILED;
}

/**
 * @typedef {Object} Conversation
 * @property {string} id                 - `conversation:<actorId>:<discriminator>`
 * @property {number} version            - append-only, same invariants as every other domain record
 * @property {string} state              - one of CONVERSATION_STATE
 * @property {string} actorId            - the human this session belongs to
 * @property {string} utterance          - the opening natural-language request, verbatim
 * @property {Object} currentIntent      - the IntentDetectionResult (contracts/intent-contract.js)
 * @property {Object} gatheredFacts      - {field: value} — every fact known so far, from any source
 * @property {Object[]} missingFacts     - Question[] still unanswered (contracts/question-contract.js)
 * @property {Object} explainability     - {questionsAsked, questionsSkipped, knowledgeUsed, policiesApplied, patternMatches}
 * @property {Object|null} context       - the ConversationContext built for this session, once READY (contracts/context-contract.js)
 * @property {Object|null} taskResult    - what the Task Executor returned, once COMPLETED/FAILED
 * @property {string} createdAt          - ISO 8601
 * @property {string} updatedAt          - ISO 8601
 */

let _counter = 0;
function nextDiscriminator() {
  _counter += 1;
  return `${Date.now()}:${_counter}`;
}

/** The record-time constructor. Always produces the honest starting state —
 *  the Service decides ACTIVE/READY/FAILED afterward, exactly how
 *  makeLearningEvent() only ever produces VALIDATED. */
export function makeConversation({
  id = null, actorId, utterance, currentIntent, gatheredFacts = {}, missingFacts = [],
  explainability = null,
}) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: id || `conversation:${actorId}:${nextDiscriminator()}`,
    version: 1,
    state: CONVERSATION_STATE.STARTED,
    actorId,
    utterance,
    currentIntent,
    gatheredFacts: Object.freeze({ ...gatheredFacts }),
    missingFacts: Object.freeze([...missingFacts]),
    explainability: Object.freeze(explainability || {
      questionsAsked: Object.freeze([]),
      questionsSkipped: Object.freeze([]),
      knowledgeUsed: Object.freeze([]),
      policiesApplied: Object.freeze([]),
      patternMatches: Object.freeze([]),
    }),
    context: null,
    taskResult: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function isConversation(c) {
  return !!c && typeof c === 'object'
    && typeof c.id === 'string' && c.id.length > 0
    && typeof c.version === 'number' && c.version >= 1
    && typeof c.state === 'string' && Object.values(CONVERSATION_STATE).includes(c.state)
    && typeof c.actorId === 'string' && c.actorId.length > 0
    && typeof c.utterance === 'string'
    && !!c.currentIntent && typeof c.currentIntent === 'object'
    && !!c.gatheredFacts && typeof c.gatheredFacts === 'object'
    && Array.isArray(c.missingFacts);
}
