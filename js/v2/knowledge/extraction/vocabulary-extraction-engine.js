/* ============================================================
   VOCABULARY-EXTRACTION-ENGINE.JS — Knowledge Learning Foundation (V2.0.8, Phase 11)

   PURPOSE: "Vocabulary Extraction" — a real, generic, deterministic term-
   frequency extractor over string-valued payload fields across an
   Approved population, writing knowledge/language/contracts/
   lexical-contract.js's VocabularyEntry payloads (real since Phase 3.5,
   never redefined here). Genuinely honest limitation, stated plainly:
   `nor`'s `structure` payloads (knowledge/connectors/nor-connector.js)
   deliberately carry counts/flags, never free text (per that connector's
   own "learn structure, not content" design) — so this engine currently
   has little to mine from the one real domainType. It is not fake: the
   algorithm is real and dependency-free NLP-adjacent tokenization
   (no AI, no LLM), correctly exercised in scripts/knowledge-extraction-check.mjs
   against synthetic text-bearing payloads, ready the moment any future
   connector emits text.

   RESPONSIBILITY: `extractVocabulary(domainType, kind, opts)` — writes one
   Candidate `kind:'vocabulary'` item PER term meeting the occurrence
   threshold.

   DEPENDENCIES: index-engine.js, extraction-write-helper.js,
   knowledge/language/contracts/lexical-contract.js,
   knowledge/contracts/identity-contract.js.

   NON-GOALS: no stemming, no stopword list, no semantic analysis — pure
   tokenize + count. No AI, no LLM, no fake NLP (frozen roadmap rule).
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from './index-engine.js';
import { writeExtractedCandidate } from './extraction-write-helper.js';
import { isVocabularyEntry } from '../language/contracts/lexical-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

const DEFAULT_MIN_OCCURRENCE = 2;
const MIN_TERM_LENGTH = 3;

/** Collects every string value from a payload's top-level fields (and
 *  string array entries), lowercased and split on non-word characters. */
function tokenize(payload) {
  const strings = [];
  for (const value of Object.values(payload || {})) {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) strings.push(...value.filter((v) => typeof v === 'string'));
  }
  return strings.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= MIN_TERM_LENGTH);
}

/**
 * @param {string} domainType
 * @param {string} kind
 * @param {{minOccurrence?: number}} [opts]
 * @returns {{ok: boolean, itemsAnalyzed: number, termsExtracted: number, writes: object[], error: object|null}}
 */
export function extractVocabulary(domainType, kind, opts = {}) {
  const minOccurrence = opts.minOccurrence ?? DEFAULT_MIN_OCCURRENCE;
  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind);

  if (items.length === 0) {
    return { ok: false, itemsAnalyzed: 0, termsExtracted: 0, writes: [], error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items to extract vocabulary from.` } };
  }

  /** @type {Map<string, Set<string>>} term -> set of item ids it appears in */
  const occurrences = new Map();
  for (const item of items) {
    for (const term of new Set(tokenize(item.payload))) {
      if (!occurrences.has(term)) occurrences.set(term, new Set());
      occurrences.get(term).add(item.id);
    }
  }

  const qualifying = [...occurrences.entries()].filter(([, ids]) => ids.size >= minOccurrence);
  const now = new Date().toISOString();
  const writes = [];

  for (const [term, ids] of qualifying) {
    const entry = Object.freeze({ term });
    if (!isVocabularyEntry(entry)) continue;
    const sourceRef = `vocabulary:${domainType}:${kind}:${term}`;
    const candidate = Object.freeze({
      id: generateKnowledgeId({ domainType, sourceType: 'extraction', sourceRef }),
      version: 1, domainType, sourceType: 'extraction', kind: 'vocabulary',
      payload: entry, confidence: Math.min(1, ids.size / items.length),
      lifecycleState: LIFECYCLE_STATE.CANDIDATE,
      provenance: Object.freeze({ connectorId: 'extraction', sourceRef, capturedAt: now }),
      approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
    });
    writes.push(writeExtractedCandidate(candidate));
  }

  return { ok: true, itemsAnalyzed: items.length, termsExtracted: writes.length, writes, error: null };
}
