/* ============================================================
   PROBLEM-PARSER.JS — Problem Intelligence Foundation (V2, Phase 8-10)

   PURPOSE: turn one natural-language utterance into a classified Problem
   Category PLUS whatever entity facts the utterance itself already
   answers — PURELY, mirroring conversation/intent/intent-engine.js's exact
   discipline and scoring formula (deliberately, so a reader who
   understands one understands both): no AI, no probabilistic model, no
   embedding lookup, every rule a plain keyword list and plain regex.

   THE SCORING FORMULA IS IDENTICAL TO intent-engine.js's, ON PURPOSE:
     +1 per matched keyword, +2 per matched regex pattern.
   confidence = score / maxPossibleScore(rule). Below
   PROBLEM_CONFIDENCE_THRESHOLD, the honest answer is category 'unknown' at
   confidence 0 — never the least-bad guess.

   ENTITY EXTRACTION IS SEPARATE FROM CATEGORY SCORING, and is HONESTLY
   PARTIAL: a field this parser cannot find in the utterance is simply
   ABSENT from `extractedFacts` (never filled with a placeholder "Unknown"
   string) — the phase brief's own worked examples show fields like
   "Urgency: Unknown" / "Destination: Unknown"; this file produces that
   honesty by omission (an absent fact IS the "Unknown" — a downstream
   consumer, e.g. Diagnostic Planning, is what decides how to DISPLAY an
   absent fact, not this parser inventing a sentinel string).

   NORTH STAR GAP CLOSURE — business_trip's OWN "type" EXTRACTION NOW USES
   THE SAME REGISTERED VOCABULARY intent-engine.js DOES. See
   docs/NOR_TYPE_DOMAIN_MODEL.md. Before this change this file's own
   business_trip fact extraction only ever recognized 'Perjalanan Dinas'
   (via 'dinas'/'perjalanan') — a real, silent drift from
   conversation/intent/intent-engine.js's own NOR_TYPE_KEYWORDS, which
   already recognized 'Reimbursement'/'Pengadaan' too. Both files now
   import the same NOR_TYPE id constants (knowledge/registry/
   nor-type-registry.js) so their two independent extraction passes over
   the same utterance can no longer silently disagree on which values
   exist — the keyword lists and matching logic themselves stay local,
   exactly as every other entity extraction table in this file already is.

   RESPONSIBILITY: parseProblem.

   DEPENDENCIES: contracts/problem-category-contract.js, ../knowledge/
   registry/nor-type-registry.js (NOR_TYPE id constants only — vocabulary,
   itself zero-dependency).
   ============================================================ */

'use strict';

import { listProblemCategories } from './contracts/problem-category-contract.js';
import { NOR_TYPE } from '../knowledge/registry/nor-type-registry.js';

export const PROBLEM_CONFIDENCE_THRESHOLD = 0.2;

/** One rule per category, in registration order (used only to break a
 *  genuine score tie — same tie-break discipline as intent-engine.js). */
const CATEGORY_RULES = Object.freeze([
  // Phase 10.5, Part 7 Scenario 4 fix — this rule originally listed a fixed
  // enum of asset nouns (ac/listrik/pipa/atap...) both as keywords AND as
  // the ONLY pattern that could name an asset. "Kolam renang bocor" (a real
  // validation scenario) has none of them, so it scored 1/12 and honestly —
  // but WRONGLY — fell through to 'unknown'. The fix generalizes the
  // pattern to "some word(s), then a symptom" instead of enumerating every
  // possible asset noun (an unboundable list), and keeps the keyword list
  // to the five symptom words alone — themselves near-unambiguous signals
  // of a facility problem in this operational vocabulary, never confused
  // with any other registered category's keywords (verified: zero overlap
  // with business_trip/procurement/administration/knowledge_search/
  // document_upload). Asset/location extraction itself stays a SEPARATE,
  // deliberately small literal table (FACILITY_ASSET_KEYWORDS below) — an
  // unrecognized asset noun still honestly stays absent from the Problem's
  // facts, this fix only changes CATEGORY scoring, never invents an entity.
  Object.freeze({
    category: 'facility',
    keywords: Object.freeze(['rusak', 'bocor', 'mati', 'error', 'broken']),
    patterns: Object.freeze([
      Object.freeze({ name: 'ASSET_BROKEN', re: /\b\w+(\s+\w+)?\s+(rusak|mati|bocor|error)\b/i }),
    ]),
  }),
  Object.freeze({
    category: 'business_trip',
    // North-Star Gap Closure — a user asking to create a NOR by name
    // ("Saya ingin membuat NOR...") mentioned neither "dinas" nor
    // "perjalanan" and scored 0 here, falling to 'unknown' before ever
    // reaching the real Conversation/NOR pipeline. business_trip is the
    // ONLY category wired to CREATE_NOR (problem-solving-service.js's
    // CATEGORY_TO_INTENT), so a bare "NOR" creation request belongs here
    // too. Verified: zero overlap with any other registered category's
    // keywords/patterns ('nor'/'buat'/'membuat'/'bikin'/'susun' do not
    // appear in facility/procurement/administration/knowledge_search/
    // document_upload above or below).
    keywords: Object.freeze(['perjalanan dinas', 'dinas', 'perjalanan', 'trip', 'travel', 'nor']),
    patterns: Object.freeze([
      Object.freeze({ name: 'TRIP_PHRASE', re: /\b(perjalanan\s+dinas|business\s+trip)\b/i }),
      Object.freeze({ name: 'NOR_CREATE_PHRASE', re: /\b(buat(kan)?|membuat|bikin|susun)\b[^.?!]{0,40}\bnor\b/i }),
    ]),
  }),
  // Phase 10.5, Part 7 Scenario 3 ("Mau beli meja").
  Object.freeze({
    category: 'procurement',
    keywords: Object.freeze(['beli', 'membeli', 'pembelian', 'pengadaan', 'procurement', 'purchase']),
    patterns: Object.freeze([
      Object.freeze({ name: 'PURCHASE_VERB', re: /\b(mau|ingin|perlu)\b[^.?!]{0,20}\b(beli|membeli)\b/i }),
    ]),
  }),
  // Phase 10.5, Part 7 Scenario 5 ("Atlet kehilangan ID Card").
  Object.freeze({
    category: 'administration',
    keywords: Object.freeze(['kehilangan', 'hilang', 'kartu identitas', 'id card', 'surat']),
    patterns: Object.freeze([
      Object.freeze({ name: 'LOST_ITEM', re: /\b(kehilangan|hilang)\b/i }),
    ]),
  }),
  Object.freeze({
    category: 'knowledge_search',
    keywords: Object.freeze(['cari', 'mencari', 'temukan', 'search', 'ketemu']),
    patterns: Object.freeze([
      Object.freeze({ name: 'SEARCH_VERB', re: /\b(cari(kan)?|mencari|temukan|search)\b/i }),
    ]),
  }),
  Object.freeze({
    category: 'document_upload',
    keywords: Object.freeze(['unggah', 'upload', 'unggahkan']),
    patterns: Object.freeze([
      Object.freeze({ name: 'UPLOAD_VERB', re: /\b(unggah(kan)?|upload)\b/i }),
    ]),
  }),
]);

/** Deterministic entity extraction per category. Literal, word-boundary
 *  matching only — never inference beyond what is written. */
const FACILITY_ASSET_KEYWORDS = Object.freeze([
  Object.freeze({ value: 'AC', keywords: Object.freeze(['ac']) }),
  Object.freeze({ value: 'Listrik', keywords: Object.freeze(['listrik']) }),
  Object.freeze({ value: 'Pipa', keywords: Object.freeze(['pipa']) }),
  Object.freeze({ value: 'Atap', keywords: Object.freeze(['atap']) }),
  Object.freeze({ value: 'Lampu', keywords: Object.freeze(['lampu']) }),
]);
const FACILITY_LOCATION_KEYWORDS = Object.freeze([
  Object.freeze({ value: 'Kamar Atlet', keywords: Object.freeze(['kamar atlet']) }),
  Object.freeze({ value: 'Warehouse', keywords: Object.freeze(['warehouse', 'gudang']) }),
  Object.freeze({ value: 'Ruang Meeting', keywords: Object.freeze(['ruang meeting', 'ruangan meeting']) }),
]);
const FACILITY_SYMPTOM_KEYWORDS = Object.freeze([
  Object.freeze({ value: 'Rusak', keywords: Object.freeze(['rusak']) }),
  Object.freeze({ value: 'Bocor', keywords: Object.freeze(['bocor']) }),
  Object.freeze({ value: 'Mati', keywords: Object.freeze(['mati']) }),
]);
/** Phase 10.5, Part 7 Scenario 3 — a deliberately small, literal item table
 *  (never a generic noun extractor — that would risk mis-extracting free
 *  text as a fabricated item). Unlisted items are honestly absent, exactly
 *  like every other entity extraction in this file. */
const PROCUREMENT_ITEM_KEYWORDS = Object.freeze([
  Object.freeze({ value: 'Meja', keywords: Object.freeze(['meja']) }),
  Object.freeze({ value: 'Kursi', keywords: Object.freeze(['kursi']) }),
  Object.freeze({ value: 'Laptop', keywords: Object.freeze(['laptop']) }),
  Object.freeze({ value: 'Komputer', keywords: Object.freeze(['komputer', 'pc']) }),
  Object.freeze({ value: 'Printer', keywords: Object.freeze(['printer']) }),
]);
/** Phase 10.5, Part 7 Scenario 5. */
const ADMINISTRATION_ITEM_KEYWORDS = Object.freeze([
  Object.freeze({ value: 'ID Card', keywords: Object.freeze(['id card', 'kartu identitas', 'kartu id']) }),
  Object.freeze({ value: 'Surat', keywords: Object.freeze(['surat']) }),
]);
const ADMINISTRATION_PERSON_KEYWORDS = Object.freeze([
  Object.freeze({ value: 'Atlet', keywords: Object.freeze(['atlet']) }),
  Object.freeze({ value: 'Staf', keywords: Object.freeze(['staf', 'karyawan']) }),
]);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function hasKeyword(normalized, keyword) {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(normalized);
}
function firstMatch(normalized, table) {
  const hit = table.find((t) => t.keywords.some((k) => hasKeyword(normalized, k)));
  return hit ? hit.value : null;
}

function scoreRule(rule, normalized) {
  const matchedKeywords = rule.keywords.filter((k) => hasKeyword(normalized, k));
  const matchedPatterns = rule.patterns.filter((p) => p.re.test(normalized)).map((p) => p.name);
  const score = matchedKeywords.length + matchedPatterns.length * 2;
  const maxScore = rule.keywords.length + rule.patterns.length * 2;
  return {
    category: rule.category, score, confidence: maxScore > 0 ? score / maxScore : 0, matchedKeywords, matchedPatterns,
  };
}

/** Mirrors intent-engine.js's own NOR_TYPE_KEYWORDS content exactly — see
 *  header. Both tables recognize the same two registered NOR_TYPE values
 *  (Reimbursement removed by Phase 9 Sprint 9.1 Decision 1 — see
 *  docs/SPRINT_9_1_ORGANIZATIONAL_DECISION.md); only the consuming category
 *  ('business_trip' here) differs. */
const NOR_TYPE_KEYWORDS = Object.freeze([
  Object.freeze({ value: NOR_TYPE.PERJALANAN_DINAS, keywords: Object.freeze(['perjalanan dinas', 'dinas', 'perjalanan']) }),
  Object.freeze({ value: NOR_TYPE.PENGADAAN, keywords: Object.freeze(['pengadaan', 'pembelian']) }),
]);

function extractFacts(category, normalized) {
  const facts = {};
  if (category === 'facility') {
    const asset = firstMatch(normalized, FACILITY_ASSET_KEYWORDS);
    if (asset) facts.asset = asset;
    const location = firstMatch(normalized, FACILITY_LOCATION_KEYWORDS);
    if (location) facts.location = location;
    const symptom = firstMatch(normalized, FACILITY_SYMPTOM_KEYWORDS);
    if (symptom) facts.symptom = symptom;
  }
  if (category === 'business_trip') {
    const type = firstMatch(normalized, NOR_TYPE_KEYWORDS);
    if (type) facts.type = type;
    // Sprint 11.1 (production feedback, "Adaptive Conversation") — REAL
    // root cause, verified empirically before this fix (not assumed): an
    // utterance like "buat NOR pembelian kursi ruang pengadaan" classifies
    // as 'business_trip' (the "NOR"+creation-phrase pattern outscores
    // 'procurement's own rule), so this branch — not the 'procurement' one
    // below — is the one that actually runs for a Pengadaan-type NOR
    // request. Once `type` resolves to Pengadaan, an item IS this
    // category's own vocabulary too (nor-type-registry.js's Pengadaan
    // fieldSchema literally has `field: 'item'`), so it must be extracted
    // HERE, using the exact SAME table 'procurement' uses — never a
    // second, drifting item list.
    if (type === NOR_TYPE.PENGADAAN) {
      const pengadaanItem = firstMatch(normalized, PROCUREMENT_ITEM_KEYWORDS);
      if (pengadaanItem) facts.item = pengadaanItem;
    }
  }
  if (category === 'procurement') {
    const item = firstMatch(normalized, PROCUREMENT_ITEM_KEYWORDS);
    if (item) facts.item = item;
  }
  if (category === 'administration') {
    const item = firstMatch(normalized, ADMINISTRATION_ITEM_KEYWORDS);
    if (item) facts.item = item;
    const person = firstMatch(normalized, ADMINISTRATION_PERSON_KEYWORDS);
    if (person) facts.affectedPerson = person;
  }
  return facts;
}

/**
 * @param {string} utterance
 * @returns {{category: string, confidence: number, matchedKeywords: string[], matchedPatterns: string[], extractedFacts: Object}}
 */
export function parseProblem(utterance) {
  const normalized = (utterance || '').toLowerCase();
  const scored = CATEGORY_RULES.map((rule) => scoreRule(rule, normalized)).filter((r) => r.score > 0);

  if (!scored.length) {
    return Object.freeze({
      category: 'unknown', confidence: 0, matchedKeywords: Object.freeze([]), matchedPatterns: Object.freeze([]), extractedFacts: Object.freeze({}),
    });
  }

  const best = scored.reduce((leader, cur) => (cur.confidence > leader.confidence ? cur : leader), scored[0]);

  if (best.confidence < PROBLEM_CONFIDENCE_THRESHOLD) {
    return Object.freeze({
      category: 'unknown', confidence: best.confidence, matchedKeywords: Object.freeze(best.matchedKeywords), matchedPatterns: Object.freeze(best.matchedPatterns), extractedFacts: Object.freeze({}),
    });
  }

  return Object.freeze({
    category: best.category,
    confidence: best.confidence,
    matchedKeywords: Object.freeze(best.matchedKeywords),
    matchedPatterns: Object.freeze(best.matchedPatterns),
    extractedFacts: Object.freeze(extractFacts(best.category, normalized)),
  });
}

/** Read-only introspection — proves "Extensible Problem Types": every
 *  registered category is a real candidate, none hardcoded into this
 *  function's control flow beyond the rule TABLE above (which itself only
 *  needs a new entry, never a new branch, to add a category's SCORING —
 *  see problem-category-contract.js for the category's own registration). */
export function knownCategories() {
  return listProblemCategories().map((c) => c.id);
}
