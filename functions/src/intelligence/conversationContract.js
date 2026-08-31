'use strict';

/* ============================================================
   functions/src/intelligence/conversationContract.js — Phase 2C
   — CJS mirror of the SERVER-relevant parts of
     src/intelligence/conversation/contracts/intelligence-conversation-contract.js
     and src/intelligence/conversation/intelligence-conversation-store-contract.js

   The Functions runtime is CJS and self-contained; it cannot import the
   browser-ESM contracts. This mirrors ONLY what the server needs to
   validate a record it is about to persist and to speak the same result
   envelope. Kept byte-equivalent to the ESM originals by the drift test in
   scripts/intelligence-conversation-backend-check.mjs — change one, change
   both.
   ============================================================ */

const INTELLIGENCE_CONVERSATION_SCHEMA = 'intelligence-conversation@1';

const IC_STATUS = Object.freeze({
  NEEDS_INPUT: 'needs_input',
  READY: 'ready',
  DRAFTED: 'drafted',
  ERROR: 'error',
  CANCELLED: 'cancelled',
});
const IC_STATUS_LIST = Object.freeze(Object.values(IC_STATUS));

const INTELLIGENCE_CONVERSATION_FIELDS = Object.freeze([
  'schema', 'convId', 'version', 'actorId', 'actorRole', 'sourceModule', 'sourceFeature',
  'task', 'domainType', 'openingUtterance', 'collectedFields', 'missingFields', 'status',
  'draft', 'numbering', 'turnCount', 'turns', 'knowledgeRefs', 'memoryRefs', 'createdAt', 'updatedAt',
]);

/** Structural check — the CJS twin of ESM isIntelligenceConversation(). */
function isIntelligenceConversation(c) {
  if (!c || typeof c !== 'object') return false;
  if (c.schema !== INTELLIGENCE_CONVERSATION_SCHEMA) return false;
  if (typeof c.convId !== 'string' || !c.convId) return false;
  if (typeof c.actorId !== 'string' || !c.actorId) return false;
  if (typeof c.openingUtterance !== 'string') return false;
  if (!IC_STATUS_LIST.includes(c.status)) return false;
  if (!Array.isArray(c.turns) || c.turns.length < 1) return false;
  return INTELLIGENCE_CONVERSATION_FIELDS.every((f) => f in c);
}

/* ── store result envelope (CJS twin of intelligence-conversation-store-contract.js) ── */

const IC_STORE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_RECORD: 'INVALID_RECORD',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

function icSuccess(data) {
  return Object.freeze({ ok: true, data: data == null ? null : data, error: null });
}
function icFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

module.exports = {
  INTELLIGENCE_CONVERSATION_SCHEMA,
  IC_STATUS,
  IC_STATUS_LIST,
  INTELLIGENCE_CONVERSATION_FIELDS,
  isIntelligenceConversation,
  IC_STORE_ERRORS,
  icSuccess,
  icFailure,
};
