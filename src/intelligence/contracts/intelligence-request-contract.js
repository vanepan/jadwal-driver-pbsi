/* ============================================================
   INTELLIGENCE-REQUEST-CONTRACT.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: fix the ONE internal shape the application uses to ask the
   Sarpras Intelligence layer for something (PART 6). Written entirely in
   the application's own domain terms — no provider-specific parameter
   names ever appear here. A provider adapter (server-side) is what
   translates this into whatever a given model API expects.

   RESPONSIBILITY: define IntelligenceRequest, its task/output vocabularies,
   `makeIntelligenceRequest`, and `isIntelligenceRequest`.

   DEPENDENCIES: intelligence/contracts/data-classification-contract.js
   (for the `classification` ceiling — PART 20).

   NON-GOALS: does not send anything, does not choose a provider or model,
   does not validate that referenced knowledge/NOR ids exist. `requestId`
   is caller-supplied (this file stays pure — no id generation, no clock
   for identity), mirroring knowledge-item-contract.js requiring `id`.

   FUTURE EVOLUTION: a real Intelligence Service builds one of these per
   user action and hands it to the active provider through
   provider-registry.js; the shape should not need to change to add a new
   `task` — only the vocabulary list grows.
   ============================================================ */

'use strict';

import { DATA_CLASS, isDataClass } from './data-classification-contract.js';

export const INTELLIGENCE_REQUEST_SCHEMA = 'intelligence-request@1';

/** WHAT is being asked for. Open vocabulary — a new value is a one-line
 *  addition, never a switch elsewhere. */
export const REQUEST_TASK = Object.freeze({
  NOR_GENERATE: 'nor.generate',       // draft a NOR from a described need
  DOCUMENT_ANALYZE: 'document.analyze', // extract structure/facts from a document
  KNOWLEDGE_QUERY: 'knowledge.query',   // answer a question grounded in Approved Knowledge
});

export const REQUEST_TASK_LIST = Object.freeze(Object.values(REQUEST_TASK));

/** The kind of result the caller expects back. */
export const OUTPUT_TYPE = Object.freeze({
  NOR_DRAFT: 'nor_draft',
  ANALYSIS: 'analysis',
  ANSWER: 'answer',
});

export const OUTPUT_TYPE_LIST = Object.freeze(Object.values(OUTPUT_TYPE));

/**
 * @typedef {Object} IntelligenceRequest
 * @property {string} schema
 * @property {string} requestId                 - caller-supplied stable id (audit + trace linkage)
 * @property {string} createdAt                 - ISO 8601
 * @property {{userId: string|null, role: string|null, sourceModule: string|null, sourceFeature: string|null}} actor  - WHO + WHERE
 * @property {string} task                      - REQUEST_TASK.* (free string; unknown values allowed but flagged by isIntelligenceRequest)
 * @property {string|null} domainType           - e.g. 'nor' (registry-backed downstream)
 * @property {{text: string, fields: Object}} input   - the user's ask, in application terms
 * @property {{knowledgeRefs: string[], norRefs: string[], notes: string|null}} context  - grounding refs ONLY (KnowledgeItem / NorRecord ids), never inline secrets
 * @property {string} requestedOutput           - OUTPUT_TYPE.*
 * @property {{conversationId: string|null, turn: number}} session  - conversation continuity
 * @property {{model: string|null, maxOutputTokens: number|null}} modelConfig  - abstract; the adapter maps it to provider params
 * @property {string} classification            - DATA_CLASS ceiling of everything in input+context (PART 20)
 * @property {{parentRequestId: string|null, origin: string|null}} trace
 */

export const INTELLIGENCE_REQUEST_FIELDS = Object.freeze([
  'schema', 'requestId', 'createdAt', 'actor', 'task', 'domainType', 'input',
  'context', 'requestedOutput', 'session', 'modelConfig', 'classification', 'trace',
]);

function strArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
}

/**
 * @param {Object} r
 * @returns {IntelligenceRequest}
 */
export function makeIntelligenceRequest({
  requestId,
  createdAt = new Date().toISOString(),
  actor = {},
  task = null,
  domainType = null,
  input = {},
  context = {},
  requestedOutput = null,
  session = {},
  modelConfig = {},
  classification = DATA_CLASS.INTERNAL,
  trace = {},
} = {}) {
  return Object.freeze({
    schema: INTELLIGENCE_REQUEST_SCHEMA,
    requestId: requestId || null,
    createdAt,
    actor: Object.freeze({
      userId: actor.userId ?? null,
      role: actor.role ?? null,
      sourceModule: actor.sourceModule ?? null,
      sourceFeature: actor.sourceFeature ?? null,
    }),
    task: task || null,
    domainType: domainType || null,
    input: Object.freeze({
      text: typeof input.text === 'string' ? input.text : '',
      fields: input.fields && typeof input.fields === 'object' ? input.fields : {},
    }),
    context: Object.freeze({
      knowledgeRefs: Object.freeze(strArray(context.knowledgeRefs)),
      norRefs: Object.freeze(strArray(context.norRefs)),
      notes: typeof context.notes === 'string' ? context.notes : null,
    }),
    requestedOutput: requestedOutput || null,
    session: Object.freeze({
      conversationId: session.conversationId ?? null,
      turn: Number.isFinite(Number(session.turn)) ? Number(session.turn) : 0,
    }),
    modelConfig: Object.freeze({
      model: modelConfig.model ?? null,
      maxOutputTokens: Number.isFinite(Number(modelConfig.maxOutputTokens)) ? Number(modelConfig.maxOutputTokens) : null,
    }),
    classification: isDataClass(classification) ? classification : DATA_CLASS.RESTRICTED,
    trace: Object.freeze({
      parentRequestId: trace.parentRequestId ?? null,
      origin: trace.origin ?? null,
    }),
  });
}

/** Structural check — non-empty `requestId`, a `task`, a known `classification`,
 *  and the full field set. Does NOT require `task` to be in REQUEST_TASK_LIST
 *  (forward-compatible), but does require it to be a non-empty string. */
export function isIntelligenceRequest(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== INTELLIGENCE_REQUEST_SCHEMA) return false;
  if (typeof r.requestId !== 'string' || !r.requestId) return false;
  if (typeof r.task !== 'string' || !r.task) return false;
  if (!isDataClass(r.classification)) return false;
  return INTELLIGENCE_REQUEST_FIELDS.every((f) => f in r);
}
