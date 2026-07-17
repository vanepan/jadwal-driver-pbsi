/* ============================================================
   INTENT-CONTRACT.JS — Conversation Intelligence Foundation (Phase 6)

   PURPOSE: fix the closed vocabulary of intents this platform can act on,
   the shape of one IntentDetectionResult, and — Part 3's "determine exactly
   what information is missing" — the REQUIRED FACT SCHEMA per intent: the
   one, named, human-readable list of fields a Conversation must resolve
   (by asking, or by the Question Optimizer) before it may reach READY.

   NO AI. NO PROBABILISTIC GUESSING. Every field here is either a closed
   enum or a plain data table a human can read top to bottom — intent
   detection itself (intent/intent-engine.js) is a deterministic keyword/
   pattern match against this same vocabulary, never a model call.

   WHY THE REQUIRED-FACT SCHEMA LIVES HERE, NOT IN THE QUESTIONNAIRE ENGINE.
   Same reasoning as every other contract in this platform: this is
   vocabulary (WHAT facts CREATE_NOR needs), not logic (HOW to figure out
   which ones are still missing, or how to source them elsewhere — that is
   questionnaire/questionnaire-engine.js and questionnaire/
   question-optimizer.js's job, respectively). A contract fixes the shape;
   an engine computes over it.

   HONESTY OF THE SCHEMA. Every required field named below is a field this
   platform genuinely cannot invent — no engine anywhere in js/v2/ has a
   statistical or recorded basis to fabricate a NOR's destination or a
   correction's new value. That is precisely why the Question Optimizer
   exists: not to guess these facts, but to check whether a human already
   told the platform the answer once before (Knowledge, Organization
   Memory, an approved Profile Override, or a prior Conversation of the
   same actor) — see question-optimizer.js's header.

   RESPONSIBILITY: INTENT, INTENT_FIELD_SCHEMA, getRequiredFacts,
   makeIntentResult, isIntentResult.

   NORTH STAR GAP CLOSURE — CREATE_NOR'S SCHEMA IS NOW NOR-TYPE-BRANCHED.
   See docs/NOR_TYPE_DOMAIN_MODEL.md (the approved design this implements).
   CREATE_NOR's own INTENT_FIELD_SCHEMA entry below now holds only `type`
   ("Jenis NOR") — the one fact every CREATE_NOR conversation must resolve
   regardless of which NOR Type it turns out to be. getRequiredFacts(intent,
   norType) appends that NOR Type's own fieldSchema (knowledge/registry/
   nor-type-registry.js — the same registered-vocabulary shape
   problem-category-contract.js already established for Problem Category)
   once `type` is known. This is the one deliberate exception to this
   file's "DEPENDENCIES: none" discipline below: NOR Type is a real,
   registered vocabulary value (not parsing logic), so importing it here is
   the same kind of dependency intent-contract.js already accepts none of —
   except this one, because the alternative (duplicating NOR Type's
   fieldSchema content inside this file, a second time) is the exact
   drift risk this whole change exists to close.

   DEPENDENCIES: knowledge/registry/nor-type-registry.js (NOR_TYPE id
   constants, hasNorType, getNorTypeFieldSchema — vocabulary only, itself
   zero-dependency).
   ============================================================ */

'use strict';

import { NOR_TYPE, hasNorType, getNorTypeFieldSchema } from '../../knowledge/registry/nor-type-registry.js';

export const INTENT_RESULT_SCHEMA = 'intent-detection-result@1';

/** The closed set of intents this platform can act on — exactly the six the
 *  mission names, plus the one honest fallback. */
export const INTENT = Object.freeze({
  CREATE_NOR: 'create_nor',
  UPLOAD_KNOWLEDGE: 'upload_knowledge',
  CORRECT_METADATA: 'correct_metadata',
  ARCHIVE_DOCUMENT: 'archive_document',
  REVIEW_KNOWLEDGE: 'review_knowledge',
  GENERATE_EXECUTIVE_BRIEFING: 'generate_executive_briefing',
  UNKNOWN: 'unknown',
});

/**
 * @typedef {Object} RequiredFact
 * @property {string} field    - the gatheredFacts key
 * @property {string} label    - what a human calls this fact (Indonesian, matching the mission's own examples)
 * @property {string} prompt   - the question to ask when this fact is genuinely missing
 * @property {boolean} optimizable - whether the Question Optimizer should even attempt to resolve this
 *   field from Knowledge/Archive/Organization Memory/Profile Overrides/prior Conversations before asking.
 *   false for facts that are, by construction, unique to this one occasion (e.g. a NOR's destination) and
 *   for which no prior answer or organizational fact could ever honestly apply twice — the Optimizer still
 *   tries a prior-Conversation match for these (the same actor may genuinely repeat the same trip), but
 *   never a Knowledge/Organization-Memory lookup that would risk fabricating a per-occasion fact.
 */

/** The mission's own CREATE_NOR walkthrough, named field for field: "Type =
 *  Perjalanan Dinas [known from the utterance]... Missing: Destination,
 *  Traveler, Departure, Return, Budget." — `type` here is the ONLY field
 *  every CREATE_NOR conversation asks unconditionally; the rest of that
 *  walkthrough's fields now live on NOR Type "Perjalanan Dinas" itself
 *  (knowledge/registry/nor-type-registry.js), reached through
 *  getRequiredFacts(intent, norType) below once `type` is known. */
export const INTENT_FIELD_SCHEMA = Object.freeze({
  [INTENT.CREATE_NOR]: Object.freeze([
    Object.freeze({ field: 'type', label: 'Jenis NOR', prompt: 'NOR jenis apa yang ingin dibuat?', optimizable: false }),
  ]),
  [INTENT.UPLOAD_KNOWLEDGE]: Object.freeze([
    Object.freeze({ field: 'domainType', label: 'Domain', prompt: 'Dokumen ini termasuk domain apa (mis. nor)?', optimizable: false }),
    Object.freeze({ field: 'documentDescription', label: 'Deskripsi Dokumen', prompt: 'Dokumen apa yang ingin diunggah?', optimizable: false }),
  ]),
  [INTENT.CORRECT_METADATA]: Object.freeze([
    Object.freeze({ field: 'domainType', label: 'Domain', prompt: 'Koreksi ini untuk domain apa?', optimizable: false }),
    Object.freeze({ field: 'targetKey', label: 'Target', prompt: 'Data mana yang perlu dikoreksi (id/nomor)?', optimizable: false }),
    Object.freeze({ field: 'correctedValue', label: 'Nilai Baru', prompt: 'Apa nilai yang benar?', optimizable: false }),
  ]),
  [INTENT.ARCHIVE_DOCUMENT]: Object.freeze([
    Object.freeze({ field: 'domainType', label: 'Domain', prompt: 'Dokumen ini termasuk domain apa?', optimizable: false }),
    Object.freeze({ field: 'documentNumber', label: 'Nomor Dokumen', prompt: 'Berapa nomor dokumennya?', optimizable: false }),
  ]),
  [INTENT.REVIEW_KNOWLEDGE]: Object.freeze([
    Object.freeze({ field: 'domainType', label: 'Domain', prompt: 'Tinjau pengetahuan untuk domain apa?', optimizable: true }),
  ]),
  [INTENT.GENERATE_EXECUTIVE_BRIEFING]: Object.freeze([
    Object.freeze({ field: 'domainType', label: 'Domain', prompt: 'Briefing untuk domain apa (kosongkan untuk seluruh platform)?', optimizable: true }),
  ]),
  [INTENT.UNKNOWN]: Object.freeze([]),
});

/**
 * @param {string} intent
 * @param {string|null} [norType] - only consulted for INTENT.CREATE_NOR; the
 *   extracted/answered "Jenis NOR" fact (gatheredFacts.type). Every other
 *   intent's schema is unaffected — this parameter is meaningless to them,
 *   exactly as documented on INTENT_FIELD_SCHEMA itself.
 */
export function getRequiredFacts(intent, norType = null) {
  const base = INTENT_FIELD_SCHEMA[intent] || Object.freeze([]);
  if (intent !== INTENT.CREATE_NOR || !norType) return base;

  const ownSchema = hasNorType(norType) ? getNorTypeFieldSchema(norType) : Object.freeze([]);
  // Registered but not yet specialized (e.g. Reimbursement — see
  // nor-type-registry.js's own bootstrap comment) or an unregistered value
  // altogether: fall back to the one schema this platform has always asked
  // (Perjalanan Dinas's), rather than asking nothing beyond "Jenis NOR" for
  // a NOR Type nobody has authored real content for yet. Never a
  // regression from pre-North-Star-Gap-Closure behavior.
  const effectiveSchema = ownSchema.length ? ownSchema : getNorTypeFieldSchema(NOR_TYPE.PERJALANAN_DINAS);
  return Object.freeze([...base, ...effectiveSchema]);
}

/**
 * @typedef {Object} IntentDetectionResult
 * @property {string} intent            - one of INTENT
 * @property {number} confidence        - 0..1, deterministic (see intent-engine.js)
 * @property {string[]} matchedRules    - which named rule(s) fired
 * @property {string[]} matchedKeywords - which literal keywords were found in the utterance
 * @property {string[]} matchedPatterns - which regex patterns matched, by name
 * @property {Object} extractedFacts    - facts the utterance itself already answered (e.g. {type: 'Perjalanan Dinas'})
 */
export function makeIntentResult({
  intent, confidence, matchedRules = [], matchedKeywords = [], matchedPatterns = [], extractedFacts = {},
}) {
  return Object.freeze({
    intent,
    confidence,
    matchedRules: Object.freeze([...matchedRules]),
    matchedKeywords: Object.freeze([...matchedKeywords]),
    matchedPatterns: Object.freeze([...matchedPatterns]),
    extractedFacts: Object.freeze({ ...extractedFacts }),
  });
}

export function isIntentResult(r) {
  return !!r && typeof r === 'object'
    && typeof r.intent === 'string' && Object.values(INTENT).includes(r.intent)
    && typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1
    && Array.isArray(r.matchedRules) && Array.isArray(r.matchedKeywords) && Array.isArray(r.matchedPatterns)
    && !!r.extractedFacts && typeof r.extractedFacts === 'object';
}
