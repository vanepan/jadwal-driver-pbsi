/* ============================================================
   CANDIDATE-EXTRACTION-ENGINE.JS — Autonomous Knowledge Acquisition
   (Sprint 02, Task 1)

   PURPOSE: turn a population of NorHistoricalRecord (already structured —
   no PDF, no OCR, no free-text parsing) into raw, pre-consensus
   observations: exact-value groupings for fields that may have a fixed
   organizational rule (recipients/cc/sender/signatory composition), term
   frequency for vocabulary, a diffed sentence template for the subject
   line, and population statistics. NOTHING here decides "this is THE
   rule" yet — that is consensus-engine.js's job (Task 3); this file only
   observes and counts.

   NO HARDCODED NOR EXAMPLES. Every function below is domain-agnostic
   over whatever population it is handed — it does not know PBSI's real
   recipient names, does not assume any specific vocabulary term, and
   makes no claim it cannot support with a real count from the records it
   was actually given (mirrors knowledge/extraction/vocabulary-extraction-engine.js's
   own "pure tokenize + count, no AI" discipline, applied one stage
   further upstream — to raw historical records instead of already-
   Approved Knowledge).

   AN HONEST, STATED LIMITATION: this population (buildNorViewModel()'s
   own fields) carries structured facts, never signature-ink presence,
   never free-running prose beyond `subject`/item text, and never the
   RENDERING/typography rules that only live in template CODE (js/docs/
   templates/nor.js), not in any document instance. So this engine
   genuinely cannot infer `rendering_rule`, `workflow` (ordered,
   evidence-of-signature steps), or `question_tree` items — see
   ARCHITECTURE_NOTES for the full coverage/non-coverage table. Forcing a
   weak version of those categories from data that does not carry the
   signal would be exactly the fabrication CLAUDE.md Principle 7 forbids.

   RESPONSIBILITY: `observeField`, `extractVocabulary`,
   `extractSubjectPattern`, `extractStatistics`.

   DEPENDENCIES: none (pure).
   ============================================================ */

'use strict';

const MIN_TERM_LENGTH = 3;
const DEFAULT_MIN_VOCAB_OCCURRENCE = 2;

function keyOf(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

/**
 * Exact-value grouping over one field across the population — the raw
 * material Task 3's Consensus Engine turns into a majority + exceptions.
 * Works for both scalar fields (senderTitle) and array fields
 * (recipients, cc, signatoryRoles) — arrays are compared by exact,
 * order-sensitive content.
 *
 * @param {import('./contracts/nor-historical-record-contract.js').NorHistoricalRecord[]} population
 * @param {string} fieldName
 * @returns {{value: *, count: number, sourceRefs: string[]}[]} sorted desc by count
 */
export function observeField(population, fieldName) {
  const groups = new Map();
  for (const record of population) {
    const value = record[fieldName];
    const key = keyOf(value);
    if (!groups.has(key)) groups.set(key, { value, count: 0, sourceRefs: [] });
    const group = groups.get(key);
    group.count += 1;
    group.sourceRefs.push(record.sourceRef);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Tokenize + lowercase, dropping short noise tokens — the SAME formula
 *  knowledge/extraction/vocabulary-extraction-engine.js already uses,
 *  applied to raw item text instead of a repository payload. */
function tokenize(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= MIN_TERM_LENGTH);
}

/** Also mines organizational-unit-style prefixes ("IT:", "Sekretariat:")
 *  — a real, structural signal (a colon-terminated leading token),
 *  distinct from plain word tokens, mirroring the exact convention
 *  NOR-Specification.md §B.1 found by hand; this engine finds it by
 *  counting, not by knowing PBSI's department names in advance. */
function extractPrefix(text) {
  const match = String(text || '').match(/^\s*([A-Za-z][A-Za-z\s-]{1,30}?)\s*:/);
  return match ? `${match[1].trim()}:` : null;
}

/**
 * @param {import('./contracts/nor-historical-record-contract.js').NorHistoricalRecord[]} population
 * @param {{minOccurrence?: number}} [opts]
 * @returns {{term: string, occurrenceCount: number, sourceRefs: string[], isPrefix: boolean}[]}
 */
export function extractVocabulary(population, opts = {}) {
  const minOccurrence = opts.minOccurrence ?? DEFAULT_MIN_VOCAB_OCCURRENCE;
  /** @type {Map<string, {sourceRefs: Set<string>, isPrefix: boolean}>} */
  const occurrences = new Map();

  for (const record of population) {
    const seenThisRecord = new Set();
    for (const text of record.itemTexts) {
      const prefix = extractPrefix(text);
      if (prefix) seenThisRecord.add(`PREFIX::${prefix}`);
      for (const term of tokenize(text)) seenThisRecord.add(`TERM::${term}`);
    }
    for (const key of seenThisRecord) {
      if (!occurrences.has(key)) occurrences.set(key, { sourceRefs: new Set(), isPrefix: key.startsWith('PREFIX::') });
      occurrences.get(key).sourceRefs.add(record.sourceRef);
    }
  }

  const results = [];
  for (const [key, data] of occurrences) {
    if (data.sourceRefs.size < minOccurrence) continue;
    const term = key.replace(/^(PREFIX|TERM)::/, '');
    results.push({ term, occurrenceCount: data.sourceRefs.size, sourceRefs: [...data.sourceRefs], isPrefix: data.isPrefix });
  }
  return results.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

/**
 * Diffs `subject` across the population, token by token, to infer a
 * template with a slot — the same structural fact NOR-Specification.md
 * §D.7 stated as a hand-derived conclusion ("the subject line is a
 * deterministic function of one date"), here re-derived from counting,
 * not asserted from prior knowledge of PBSI's real subject line.
 *
 * Only attempts the inference when every subject in the population has
 * the SAME token count — a genuinely different sentence shape is honestly
 * reported as `null` (no pattern), never forced into a template it does
 * not fit.
 *
 * @param {import('./contracts/nor-historical-record-contract.js').NorHistoricalRecord[]} population
 * @returns {{template: string, slotCount: number, sourceRefs: string[]}|null}
 */
export function extractSubjectPattern(population) {
  const withSubject = population.filter((r) => typeof r.subject === 'string' && r.subject.trim().length > 0);
  if (withSubject.length < 2) return null;

  const tokenized = withSubject.map((r) => r.subject.trim().split(/\s+/));
  const tokenCount = tokenized[0].length;
  if (!tokenized.every((t) => t.length === tokenCount)) return null;

  const templateTokens = [];
  let slotCount = 0;
  for (let i = 0; i < tokenCount; i += 1) {
    const valuesAtPosition = new Set(tokenized.map((t) => t[i]));
    if (valuesAtPosition.size === 1) {
      templateTokens.push(tokenized[0][i]);
    } else {
      templateTokens.push(`{{slot${slotCount}}}`);
      slotCount += 1;
    }
  }
  if (slotCount === 0 || slotCount === tokenCount) return null; // all-fixed (no pattern to learn) or all-variable (not a template)

  return {
    template: templateTokens.join(' '),
    slotCount,
    sourceRefs: withSubject.map((r) => r.sourceRef),
  };
}

function mean(values) { return values.reduce((s, v) => s + v, 0) / values.length; }
function stdDev(values, avg) {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Population-level statistics — the same facts NOR-Specification.md §D.1,
 * §D.2, §A.3 reported from n=2 real samples, now computed from however
 * large the real population actually is.
 *
 * @param {import('./contracts/nor-historical-record-contract.js').NorHistoricalRecord[]} population
 * @returns {{utilization: object, itemCount: object, cycleSpanDays: object|null}}
 */
export function extractStatistics(population) {
  const utilizationRatios = population
    .filter((r) => r.openingAmount > 0)
    .map((r) => r.realizedAmount / r.openingAmount);
  const utilMean = utilizationRatios.length ? mean(utilizationRatios) : null;
  const utilStdDev = utilizationRatios.length ? stdDev(utilizationRatios, utilMean) : null;

  const itemCounts = population.map((r) => r.itemCount);

  const dates = population.map((r) => (r.norDate ? new Date(r.norDate).getTime() : null)).filter((t) => t !== null && !Number.isNaN(t));
  const cycleSpanDays = dates.length >= 2
    ? Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000)
    : null;

  return {
    utilization: {
      meanPct: utilMean !== null ? Math.round(utilMean * 1000) / 10 : null,
      stdDevPct: utilStdDev !== null ? Math.round(utilStdDev * 1000) / 10 : null,
      sampleSize: utilizationRatios.length,
    },
    itemCount: {
      min: itemCounts.length ? Math.min(...itemCounts) : null,
      max: itemCounts.length ? Math.max(...itemCounts) : null,
      sampleSize: itemCounts.length,
    },
    cycleSpanDays: cycleSpanDays === null ? null : { value: cycleSpanDays, sampleSize: dates.length },
  };
}
