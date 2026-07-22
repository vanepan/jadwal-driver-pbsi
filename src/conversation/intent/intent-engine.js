/* ============================================================
   INTENT-ENGINE.JS — Conversation Intelligence Foundation (Phase 6, Part 2)

   PURPOSE: turn one natural-language utterance into one INTENT, PURELY —
   no AI, no probabilistic model, no embedding lookup. Every rule below is a
   plain keyword list and a plain regex a human can read and audit; the
   confidence this file reports is arithmetic over how much of a rule
   matched, never a learned score.

   THE SCORING FORMULA, STATED ONCE. Each rule contributes:
     +1 per matched keyword, +2 per matched regex pattern.
   confidence = score / maxPossibleScore(rule), where maxPossibleScore is
   keywords.length + patterns.length*2 — so a rule that matches everything
   it names scores exactly 1.0, and a rule that matches nothing is never a
   candidate at all (score 0 rules are excluded before ranking). The
   highest-scoring rule wins; a genuine tie is broken by RULE ORDER below
   (declared once, deterministic, never randomized).

   If nothing scores above INTENT_CONFIDENCE_THRESHOLD, the honest answer is
   INTENT.UNKNOWN at confidence 0 — never the least-bad guess. A Conversation
   started from an unrecognized utterance goes straight to FAILED (see
   services/conversation-service.js) rather than pretending to understand.

   FACT EXTRACTION IS SEPARATE FROM SCORING. Once an intent is chosen,
   extractFacts() pulls out the handful of facts the utterance ITSELF
   already answers (e.g. "perjalanan dinas" -> {type: 'Perjalanan Dinas'}) —
   the same deterministic substring matching, never inference beyond what
   is literally written.

   RESPONSIBILITY: detectIntent.

   NORTH STAR GAP CLOSURE — NOR_TYPE_KEYWORDS' VALUES NOW COME FROM THE
   REGISTRY. See docs/NOR_TYPE_DOMAIN_MODEL.md. This file's own extraction
   table previously hand-wrote 'Perjalanan Dinas'/'Reimbursement'/
   'Pengadaan' as bare string literals — the same three values
   problem-parser.js independently hand-wrote a SECOND time (and had
   already drifted from: that file recognized only one of the three). Both
   files now import NOR_TYPE (knowledge/registry/nor-type-registry.js) so
   the values themselves can never silently diverge again; the keyword
   lists and matching logic stay local and unchanged (registries hold
   vocabulary, never parsing logic).

   PHASE 9, SPRINT 9.1 (ORGANIZATIONAL DECISION) — 'Reimbursement' removed
   from NOR_TYPE_KEYWORDS entirely. See
   docs/SPRINT_9_1_ORGANIZATIONAL_DECISION.md Decision 1: a human confirmed
   it is not a NOR Type at all, so an utterance mentioning it should no
   longer silently resolve `type`, exactly as if it had never been
   recognized. Administration (Decision 3) is NOT added here — it is
   registered as a NOR Type but has no evidenced keyword vocabulary yet;
   adding one without evidence would be inventing NLU, not registering
   vocabulary.

   DEPENDENCIES: ../contracts/intent-contract.js, ../../knowledge/registry/
   nor-type-registry.js (NOR_TYPE id constants only — vocabulary, itself
   zero-dependency).
   ============================================================ */

'use strict';

import { INTENT, makeIntentResult } from '../contracts/intent-contract.js';
import { NOR_TYPE } from '../../../js/v2/knowledge/registry/nor-type-registry.js';

export const INTENT_CONFIDENCE_THRESHOLD = 0.2;

/** One rule per intent, in priority order (used only to break a genuine
 *  score tie). Keywords and patterns are Indonesian-first (this is an
 *  Indonesian operations platform) with common English aliases alongside. */
const INTENT_RULES = Object.freeze([
  Object.freeze({
    intent: INTENT.CREATE_NOR,
    // North-Star Gap Closure — "membuat" (the me- prefixed form of "buat",
    // e.g. "Saya ingin membuat NOR...") never matched the old keyword/
    // pattern list: hasKeyword()'s word-boundary match is deliberately
    // exact (see its own comment above), so "buat" cannot match inside
    // "membuat". Added explicitly rather than loosened into a substring
    // match, preserving the file's own no-double-counting discipline.
    // Verified: 'membuat' does not appear in any other rule below.
    keywords: Object.freeze(['nor', 'buatkan', 'buat', 'membuat', 'bikin', 'susun', 'create']),
    patterns: Object.freeze([
      Object.freeze({ name: 'CREATE_VERB_THEN_NOR', re: /\b(buat(kan)?|membuat|bikin|susun|create)\b[^.?!]{0,40}\bnor\b/i }),
    ]),
  }),
  Object.freeze({
    intent: INTENT.UPLOAD_KNOWLEDGE,
    keywords: Object.freeze(['unggah', 'upload', 'impor', 'import', 'dokumen', 'pengetahuan', 'knowledge']),
    patterns: Object.freeze([
      Object.freeze({ name: 'UPLOAD_VERB', re: /\b(unggah|upload|impor|import)\b/i }),
    ]),
  }),
  Object.freeze({
    intent: INTENT.CORRECT_METADATA,
    keywords: Object.freeze(['koreksi', 'perbaiki', 'ubah', 'ralat', 'correct', 'fix', 'metadata']),
    patterns: Object.freeze([
      Object.freeze({ name: 'CORRECT_VERB', re: /\b(koreksi|perbaiki|ralat|correct|fix)\b/i }),
    ]),
  }),
  Object.freeze({
    intent: INTENT.ARCHIVE_DOCUMENT,
    keywords: Object.freeze(['arsipkan', 'arsip', 'archive']),
    patterns: Object.freeze([
      Object.freeze({ name: 'ARCHIVE_VERB', re: /\b(arsipkan|arsip(kan)?|archive)\b/i }),
    ]),
  }),
  Object.freeze({
    intent: INTENT.REVIEW_KNOWLEDGE,
    keywords: Object.freeze(['review', 'tinjau', 'periksa', 'peninjauan']),
    patterns: Object.freeze([
      Object.freeze({ name: 'REVIEW_VERB', re: /\b(review|tinjau|periksa)\b/i }),
    ]),
  }),
  Object.freeze({
    intent: INTENT.GENERATE_EXECUTIVE_BRIEFING,
    keywords: Object.freeze(['briefing', 'ringkasan', 'eksekutif', 'executive', 'laporan']),
    patterns: Object.freeze([
      Object.freeze({ name: 'BRIEFING_PHRASE', re: /\b(executive\s+briefing|ringkasan\s+eksekutif|laporan\s+eksekutif)\b/i }),
    ]),
  }),
]);

/** Deterministic, literal substring facts an utterance can answer about
 *  itself — never inferred beyond what is written. */
const NOR_TYPE_KEYWORDS = Object.freeze([
  Object.freeze({ value: NOR_TYPE.PERJALANAN_DINAS, keywords: Object.freeze(['perjalanan dinas', 'dinas']) }),
  Object.freeze({ value: NOR_TYPE.PENGADAAN, keywords: Object.freeze(['pengadaan', 'pembelian']) }),
]);

const DOMAIN_KEYWORDS = Object.freeze({
  nor: Object.freeze(['nor']),
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary matching, not substring — "buat" must never count as a hit
 *  just because "buatkan" is present (and, symmetrically, "nor" must never
 *  count as a hit inside some unrelated longer word). Substring matching
 *  would silently inflate a rule's score off overlapping keywords, which is
 *  exactly the kind of double-counting this deterministic scorer exists to
 *  avoid — the same reasoning that makes an explicit formula better than a
 *  black box: every point has to be independently real. */
function hasKeyword(normalized, keyword) {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(normalized);
}

function scoreRule(rule, normalized) {
  const matchedKeywords = rule.keywords.filter((k) => hasKeyword(normalized, k));
  const matchedPatterns = rule.patterns.filter((p) => p.re.test(normalized)).map((p) => p.name);
  const score = matchedKeywords.length + matchedPatterns.length * 2;
  const maxScore = rule.keywords.length + rule.patterns.length * 2;
  return {
    intent: rule.intent, score, confidence: maxScore > 0 ? score / maxScore : 0, matchedKeywords, matchedPatterns,
  };
}

function extractFacts(intent, normalized) {
  const facts = {};
  if (intent === INTENT.CREATE_NOR) {
    const hit = NOR_TYPE_KEYWORDS.find((t) => t.keywords.some((k) => hasKeyword(normalized, k)));
    if (hit) facts.type = hit.value;
  }
  if (intent === INTENT.CORRECT_METADATA || intent === INTENT.ARCHIVE_DOCUMENT
    || intent === INTENT.REVIEW_KNOWLEDGE || intent === INTENT.GENERATE_EXECUTIVE_BRIEFING
    || intent === INTENT.UPLOAD_KNOWLEDGE) {
    const domainHit = Object.entries(DOMAIN_KEYWORDS).find(([, kws]) => kws.some((k) => hasKeyword(normalized, k)));
    if (domainHit) facts.domainType = domainHit[0];
  }
  return facts;
}

/**
 * @param {string} utterance
 * @returns {import('../contracts/intent-contract.js').IntentDetectionResult}
 */
export function detectIntent(utterance) {
  const normalized = (utterance || '').toLowerCase();
  const scored = INTENT_RULES.map((rule) => scoreRule(rule, normalized)).filter((r) => r.score > 0);

  if (!scored.length) {
    return makeIntentResult({ intent: INTENT.UNKNOWN, confidence: 0 });
  }

  // Highest confidence wins; ties broken by INTENT_RULES declaration order
  // (scored[] preserves that order, and Array#reduce below only replaces the
  // leader on a STRICT improvement).
  const best = scored.reduce((leader, cur) => (cur.confidence > leader.confidence ? cur : leader), scored[0]);

  if (best.confidence < INTENT_CONFIDENCE_THRESHOLD) {
    return makeIntentResult({ intent: INTENT.UNKNOWN, confidence: best.confidence, matchedKeywords: best.matchedKeywords, matchedPatterns: best.matchedPatterns });
  }

  return makeIntentResult({
    intent: best.intent,
    confidence: best.confidence,
    matchedRules: [best.intent],
    matchedKeywords: best.matchedKeywords,
    matchedPatterns: best.matchedPatterns,
    extractedFacts: extractFacts(best.intent, normalized),
  });
}
