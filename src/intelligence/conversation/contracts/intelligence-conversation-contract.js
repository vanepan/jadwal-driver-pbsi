/* ============================================================
   INTELLIGENCE-CONVERSATION-CONTRACT.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: fix the shape of a DURABLE multi-turn generation session
   (PART 10). Server-owned state — a conversation id, the accumulated facts,
   the still-missing facts, the current status, the draft (if any) — so
   continuity does not depend on the browser holding anything.

   It WRAPS, it does not replace, src/conversation/'s deterministic
   Conversation: every turn the Intelligence Service recomputes a fresh
   src/conversation Conversation from `openingUtterance` + accumulated
   `collectedFields`, then snapshots the outcome here. This record is the
   thing persisted to /intelligence_conversations/{convId}.

   RESPONSIBILITY: IC_STATUS, makeIntelligenceConversation,
   isIntelligenceConversation, appendTurn (pure — returns the next
   version), redactForStore (strips anything that should not be persisted).

   DEPENDENCIES: none.

   NON-GOALS: no persistence (see intelligence-conversation-store.js), no
   recompute logic (that is the service), no chat transcript — like
   src/conversation, there is no message log, only facts + status.
   ============================================================ */

'use strict';

export const INTELLIGENCE_CONVERSATION_SCHEMA = 'intelligence-conversation@1';

/** Status mirrors the IntelligenceResponse states a session can rest in. */
export const IC_STATUS = Object.freeze({
  NEEDS_INPUT: 'needs_input',   // required facts still missing
  READY: 'ready',               // every required fact known; draft can be produced
  DRAFTED: 'drafted',           // a structured draft has been produced (still not published)
  ERROR: 'error',               // could not proceed (unknown intent, limit hit, provider error)
  CANCELLED: 'cancelled',       // a human stopped it
});

export const IC_STATUS_LIST = Object.freeze(Object.values(IC_STATUS));

export const IC_TERMINAL = Object.freeze([IC_STATUS.CANCELLED]);

/**
 * @typedef {Object} IntelligenceConversationTurn
 * @property {number} turn
 * @property {string} at                  - ISO 8601
 * @property {Object} answers             - {field: value} a human supplied on this turn ({} for turn 1)
 * @property {string} status              - IC_STATUS after this turn
 * @property {string[]} missingFields     - field ids still unresolved after this turn
 * @property {string|null} requestId      - the IntelligenceRequest that drove this turn (audit)
 */

/**
 * @typedef {Object} IntelligenceConversation
 * @property {string} schema
 * @property {string} convId
 * @property {number} version             - 1 on create, +1 per appendTurn
 * @property {string} actorId             - the ONLY user allowed to read/continue this session
 * @property {string|null} actorRole
 * @property {string} sourceModule        - where the request came from (e.g. 'intelligence', 'petty_cash')
 * @property {string|null} sourceFeature
 * @property {string} task                - REQUEST_TASK.* (e.g. 'nor.generate')
 * @property {string|null} domainType     - e.g. 'nor'
 * @property {string} openingUtterance    - the sentence that started the session; intent is fixed from it
 * @property {Object} collectedFields     - {field: value} accumulated across every turn
 * @property {string[]} missingFields     - field ids still unresolved (empty ⇒ ready)
 * @property {string} status              - IC_STATUS
 * @property {Object|null} draft           - the last IntelligenceDraft produced (never authoritative)
 * @property {Object|null} numbering       - the last NumberAllocation (suggestion only)
 * @property {number} turnCount
 * @property {IntelligenceConversationTurn[]} turns
 * @property {string[]} knowledgeRefs     - Approved KnowledgeItem ids used as context (audit)
 * @property {string[]} memoryRefs        - ArchiveRecord ids used as context (audit)
 * @property {string} createdAt           - ISO 8601
 * @property {string} updatedAt           - ISO 8601
 */

export const INTELLIGENCE_CONVERSATION_FIELDS = Object.freeze([
  'schema', 'convId', 'version', 'actorId', 'actorRole', 'sourceModule', 'sourceFeature',
  'task', 'domainType', 'openingUtterance', 'collectedFields', 'missingFields', 'status',
  'draft', 'numbering', 'turnCount', 'turns', 'knowledgeRefs', 'memoryRefs', 'createdAt', 'updatedAt',
]);

function strArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
}

/**
 * @param {Object} c
 * @returns {IntelligenceConversation}
 */
export function makeIntelligenceConversation({
  convId,
  actorId,
  actorRole = null,
  sourceModule = 'intelligence',
  sourceFeature = null,
  task,
  domainType = null,
  openingUtterance,
  collectedFields = {},
  missingFields = [],
  status = IC_STATUS.NEEDS_INPUT,
  draft = null,
  numbering = null,
  knowledgeRefs = [],
  memoryRefs = [],
  requestId = null,
  now = new Date().toISOString(),
} = {}) {
  const firstTurn = Object.freeze({
    turn: 1,
    at: now,
    answers: {},
    status,
    missingFields: Object.freeze(strArray(missingFields)),
    requestId: requestId || null,
  });
  return Object.freeze({
    schema: INTELLIGENCE_CONVERSATION_SCHEMA,
    convId: convId || null,
    version: 1,
    actorId: actorId || null,
    actorRole,
    sourceModule: sourceModule || 'intelligence',
    sourceFeature: sourceFeature || null,
    task: task || null,
    domainType: domainType || null,
    openingUtterance: String(openingUtterance || ''),
    collectedFields: collectedFields && typeof collectedFields === 'object' ? { ...collectedFields } : {},
    missingFields: Object.freeze(strArray(missingFields)),
    status: IC_STATUS_LIST.includes(status) ? status : IC_STATUS.NEEDS_INPUT,
    draft: draft ?? null,
    numbering: numbering ?? null,
    turnCount: 1,
    turns: Object.freeze([firstTurn]),
    knowledgeRefs: Object.freeze(strArray(knowledgeRefs)),
    memoryRefs: Object.freeze(strArray(memoryRefs)),
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Pure — produce the next version of a conversation after one more turn.
 * @param {IntelligenceConversation} current
 * @param {Object} patch  { answers, collectedFields, missingFields, status, draft, numbering, knowledgeRefs, memoryRefs, requestId }
 * @param {string} [now]
 * @returns {IntelligenceConversation}
 */
export function appendTurn(current, patch = {}, now = new Date().toISOString()) {
  const nextTurnNo = current.turnCount + 1;
  const status = IC_STATUS_LIST.includes(patch.status) ? patch.status : current.status;
  const missingFields = Object.freeze(strArray(patch.missingFields != null ? patch.missingFields : current.missingFields));
  const turn = Object.freeze({
    turn: nextTurnNo,
    at: now,
    answers: patch.answers && typeof patch.answers === 'object' ? { ...patch.answers } : {},
    status,
    missingFields,
    requestId: patch.requestId || null,
  });
  return Object.freeze({
    ...current,
    version: current.version + 1,
    collectedFields: patch.collectedFields && typeof patch.collectedFields === 'object'
      ? { ...patch.collectedFields } : current.collectedFields,
    missingFields,
    status,
    draft: 'draft' in patch ? (patch.draft ?? null) : current.draft,
    numbering: 'numbering' in patch ? (patch.numbering ?? null) : current.numbering,
    turnCount: nextTurnNo,
    turns: Object.freeze([...current.turns, turn]),
    knowledgeRefs: Object.freeze(strArray(patch.knowledgeRefs != null ? patch.knowledgeRefs : current.knowledgeRefs)),
    memoryRefs: Object.freeze(strArray(patch.memoryRefs != null ? patch.memoryRefs : current.memoryRefs)),
    updatedAt: now,
  });
}

/** Structural check. */
export function isIntelligenceConversation(c) {
  if (!c || typeof c !== 'object') return false;
  if (c.schema !== INTELLIGENCE_CONVERSATION_SCHEMA) return false;
  if (typeof c.convId !== 'string' || !c.convId) return false;
  if (typeof c.actorId !== 'string' || !c.actorId) return false;
  if (typeof c.openingUtterance !== 'string') return false;
  if (!IC_STATUS_LIST.includes(c.status)) return false;
  if (!Array.isArray(c.turns) || c.turns.length < 1) return false;
  return INTELLIGENCE_CONVERSATION_FIELDS.every((f) => f in c);
}

export function isTerminalIcStatus(status) {
  return IC_TERMINAL.includes(status);
}

/** The subset safe to persist — identical here (no secret ever enters this
 *  shape), but an explicit hook so a future field that must not be stored
 *  has one obvious place to be stripped. */
export function redactForStore(c) {
  return c;
}
