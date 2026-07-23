/* ============================================================
   SEMANTIC-DIFF-ENGINE.JS — Live Document Workspace (Phase 11, Sprint 11.4:
   Human Learning Intelligence)

   PURPOSE: turn a raw {before, after} value pair into WHAT changed, not
   only that something changed. Every human edit already reaches
   section-learning-bridge.js#recordSectionEdit as an old/new string pair;
   this module is the ONE place that pair is classified into the
   organization's own vocabulary for edits — a real answer to "what kind of
   thing did the reviewer just do" instead of a diff a person has to read
   themselves.

   NOTHING HERE IS AN ML MODEL OR AN INVENTED CONFIDENCE NUMBER. Every
   classification is a deterministic, explainable computation over the
   ACTUAL tokens of `before`/`after` (longest common prefix/suffix, numeric-
   token detection, change-ratio) plus signals section-learning-bridge.js
   and section-confidence-engine.js already resolve independently (whether
   the field is pattern-sourced, and — reusing the SAME knowledge-service
   read those two files already perform, not a new engine —  whether the
   cited item is a `template_pattern`). CLAUDE.md: "Never invent business
   rules" / "Every recommendation must be explainable" apply directly: a
   thresholded rule here (e.g. "more than half the tokens changed reads as
   a rewrite, not a wording tweak") is a stated, deterministic ALGORITHM
   DEFINITION, not a fabricated organizational fact or confidence score —
   the same category of design decision problem-parser.js's own scoring
   windows already are (see docs/SPRINT_11_2_ADAPTIVE_CONVERSATION_FIX.md).

   TAXONOMY (Sprint 11.4's own four requirements, made concrete):

     category   — WHERE the edited content comes from (reuses signals that
                  already exist elsewhere, never re-derives them from
                  scratch):
       'structural' — a section was entirely added or entirely removed
       'template'   — an edit to a `pattern:<id>` field citing a
                       kind:'template_pattern' KnowledgeItem
       'pattern'    — an edit to a `pattern:<id>` field citing any other
                       Approved pattern (sentence_pattern/paragraph_pattern)
       'fact'       — an edit to a plain, non-pattern-sourced field (a
                       document-specific value: quantity, traveler, date...)

     diffNature — WHAT KIND OF CHANGE the token diff itself is, computed
                  independently of category (a template edit AND a fact
                  edit can both be a "quantity_correction" — a slot value
                  inside a template is still a number, a plain fact field
                  is too):
       'new_content'        — before was empty, after is not (structural insert)
       'removed_content'    — after is empty, before was not (structural delete)
       'quantity_correction'— the only tokens that differ are numeric on
                               both sides ("20 kursi" -> "24 kursi")
       'opening_phrase'     — the differing tokens are a leading run, and
                               everything from there to the end is identical
                               ("Pengajuan Pembelian" -> "Permohonan Pembelian")
       'closing_phrase'     — the differing tokens are a trailing run, and
                               everything from the start up to there is
                               identical
       'wording_change'     — a small, non-edge run of tokens differs (a
                               single word swapped mid-sentence), the rest
                               is identical
       'full_rewrite'       — more than half of the longer side's tokens
                               changed — a genuinely new formulation, not a
                               tweak
       null                 — before/after are both empty (nothing to diff)

   RESPONSIBILITY: classifySemanticDiff({field, before, after, editKind,
   isPatternField}) -> {category, diffNature, label, evidence}.

   DEPENDENCIES: knowledge/services/knowledge-service.js (read-only, the
   SAME single reader section-confidence-engine.js and
   section-learning-bridge.js already call — no new data-access path).
   ============================================================ */

'use strict';

import { getKnowledge } from '../../knowledge/services/knowledge-service.js';

const PATTERN_FIELD_PREFIX = 'pattern:';
const REWRITE_RATIO_THRESHOLD = 0.5; // see header: a stated algorithm definition, not a fabricated business rule

function tokenize(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

function isNumericToken(token) {
  return /^\d+([.,]\d+)?$/.test(token.replace(/[.,;:]+$/, ''));
}

/** Longest common prefix/suffix over token arrays, non-overlapping. */
function diffTokenRuns(beforeTokens, afterTokens) {
  const maxCommon = Math.min(beforeTokens.length, afterTokens.length);
  let prefix = 0;
  while (prefix < maxCommon && beforeTokens[prefix] === afterTokens[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < maxCommon - prefix
    && beforeTokens[beforeTokens.length - 1 - suffix] === afterTokens[afterTokens.length - 1 - suffix]
  ) suffix += 1;

  const changedBefore = beforeTokens.slice(prefix, beforeTokens.length - suffix);
  const changedAfter = afterTokens.slice(prefix, afterTokens.length - suffix);
  return {
    prefix, suffix, changedBefore, changedAfter,
    isLeadingRun: prefix === 0 && suffix > 0,
    isTrailingRun: prefix > 0 && suffix === 0,
  };
}

/** @returns {'quantity_correction'|'opening_phrase'|'closing_phrase'|'wording_change'|'full_rewrite'|'new_content'|'removed_content'|null} */
function classifyDiffNature(before, after) {
  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);

  if (beforeTokens.length === 0 && afterTokens.length === 0) return null;
  if (beforeTokens.length === 0) return 'new_content';
  if (afterTokens.length === 0) return 'removed_content';

  const run = diffTokenRuns(beforeTokens, afterTokens);
  if (run.changedBefore.length === 0 && run.changedAfter.length === 0) return null; // identical

  const changedTokens = [...run.changedBefore, ...run.changedAfter];
  const allNumeric = changedTokens.length > 0 && changedTokens.every(isNumericToken);
  if (allNumeric) return 'quantity_correction';

  const longerLength = Math.max(beforeTokens.length, afterTokens.length);
  const changedRatio = Math.max(run.changedBefore.length, run.changedAfter.length) / longerLength;
  if (changedRatio > REWRITE_RATIO_THRESHOLD) return 'full_rewrite';

  if (run.isLeadingRun) return 'opening_phrase';
  if (run.isTrailingRun) return 'closing_phrase';
  return 'wording_change';
}

const DIFF_NATURE_LABEL = Object.freeze({
  new_content: 'Konten baru ditambahkan',
  removed_content: 'Konten dihapus',
  quantity_correction: 'Koreksi kuantitas/angka',
  opening_phrase: 'Preferensi frasa pembuka berubah',
  closing_phrase: 'Preferensi frasa penutup berubah',
  wording_change: 'Perubahan kata/istilah',
  full_rewrite: 'Perumusan ulang menyeluruh',
});

const CATEGORY_LABEL = Object.freeze({
  structural: 'Struktural',
  template: 'Template',
  pattern: 'Pola',
  fact: 'Fakta',
});

/** Resolves whether a `pattern:<id>` field cites a template vs. an ordinary
 *  approved pattern — the SAME distinction section-confidence-engine.js's
 *  tier 1/2 already makes (getKnowledge + item.kind), read again here
 *  rather than re-derived by a different method. Honest 'pattern' fallback
 *  (never 'unresolved') when the citation no longer resolves — this
 *  module's job is only to classify the diff that already happened, and
 *  section-learning-bridge.js's own signal 2 already handles an
 *  unresolvable citation as "not an error worth surfacing". */
function resolvePatternCategory(knowledgeId) {
  const itemResult = getKnowledge(knowledgeId);
  if (!itemResult.ok) return 'pattern';
  return itemResult.data.kind === 'template_pattern' ? 'template' : 'pattern';
}

/**
 * @param {{field: string, before: *, after: *, editKind: 'edit'|'delete', isPatternField?: boolean}} params
 * @returns {{category: 'structural'|'template'|'pattern'|'fact', diffNature: string|null, label: string, evidence: {changedTokenCount: number, totalTokenCount: number}}}
 */
export function classifySemanticDiff({ field, before, after, editKind, isPatternField }) {
  const isPattern = isPatternField ?? field.startsWith(PATTERN_FIELD_PREFIX);
  const diffNature = classifyDiffNature(before, after);

  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);
  const totalTokenCount = Math.max(beforeTokens.length, afterTokens.length);
  const run = diffTokenRuns(beforeTokens, afterTokens);
  const changedTokenCount = Math.max(run.changedBefore.length, run.changedAfter.length);

  // Structural takes priority over provenance: a whole section appearing or
  // disappearing is a structural fact regardless of what it once contained.
  if (editKind === 'delete' || diffNature === 'removed_content') {
    const label = isPattern ? 'Paragraf ditolak' : 'Bagian dihapus dari dokumen';
    return { category: 'structural', diffNature: 'removed_content', label, evidence: { changedTokenCount: totalTokenCount, totalTokenCount } };
  }
  if (diffNature === 'new_content') {
    const label = isPattern ? 'Pola organisasi baru diusulkan' : 'Bagian baru ditambahkan ke dokumen';
    return { category: 'structural', diffNature: 'new_content', label, evidence: { changedTokenCount: totalTokenCount, totalTokenCount } };
  }

  const category = isPattern
    ? resolvePatternCategory(field.slice(PATTERN_FIELD_PREFIX.length))
    : 'fact';

  const natureLabel = diffNature ? DIFF_NATURE_LABEL[diffNature] : 'Perubahan tercatat';
  const label = diffNature && diffNature !== 'full_rewrite'
    ? `${natureLabel} (${CATEGORY_LABEL[category]})`
    : `${natureLabel} — ${CATEGORY_LABEL[category]}`;

  return { category, diffNature, label, evidence: { changedTokenCount, totalTokenCount } };
}
