/* ============================================================
   KNOWLEDGE-DRIFT-ENGINE.JS — Phase 11, Sprint 11.7 (Continuous
   Organizational Memory)

   PURPOSE: a pure, read-only REPORT — same NON-GOALS discipline as
   pattern-discovery-engine.js and machine-learning/confidence-engine.js
   (never writes anything, never auto-applies, never mutates a
   KnowledgeItem's stored confidence). Composes ALREADY-REAL signals into
   the four things this sprint names: obsolete wording, deprecated
   templates, conflicting organizational styles, knowledge drift.

   WHAT WAS DELIBERATELY NOT BUILT, AND WHY. "Rarely-used patterns
   gradually lose confidence" reads, on a literal interpretation, as a
   TIME-BASED DECAY — some number that shrinks the longer a pattern goes
   unused. This file does NOT implement that. Two real, checked facts rule
   it out:

     1. No usage-recency data exists to decay against. A ComposerDocument
        citing `pattern:<knowledgeId>` (document-intelligence/composer/)
        leaves no trace on the KnowledgeItem itself, and ArchiveRecord's
        own `knowledgeItemId` field is SINGULAR — "what this archived
        thing became" (organizational-memory/services/archive-service.js's
        own header), not a multi-citation ledger a document with several
        cited patterns could append to. Building that ledger would be a
        real, its-own-sprint architecture change, not a small diff.
     2. Even with usage data, a decay RATE (how much confidence per day of
        disuse, or after how many days) is a number nobody in this
        codebase has decided — exactly the "invented business rule"
        CLAUDE.md's own Principle 7 and this sprint's OWN instruction
        ("Do NOT invent arbitrary decay numbers") forbid fabricating.

   What this file does instead — reuse the EXISTING confidence formula
   (machine-learning/confidence-engine.js#suggestConfidence, unchanged) and
   compute a REAL, relative statistic over it (a group's own mean), the
   same "deterministic count/mean over repository data" discipline
   pattern-recommendation-contract.js's own NON-GOALS already establish:
   an item scoring meaningfully below its OWN kind's real average is
   surfaced as a review candidate — never silently reduced, never a
   fabricated absolute threshold. A human decides what "low" means for
   their organization by reading the real numbers, same as every other
   Pattern Discovery recommendation in this platform.

   RESPONSIBILITY: computeKnowledgeDrift(domainType).

   DEPENDENCIES: services/knowledge-service.js (list, read-only),
   machine-learning/confidence-engine.js (suggestConfidence, unchanged),
   contracts/lifecycle-contract.js, ./pattern-discovery-engine.js
   (writingStyleRecommendations' own public surface, computeLearningPatterns
   — reused verbatim for "obsolete wording", never recomputed a second way).
   ============================================================ */

'use strict';

import { listKnowledge } from '../services/knowledge-service.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { suggestConfidence } from '../machine-learning/confidence-engine.js';
import { computeLearningPatterns } from './pattern-discovery-engine.js';
import { PATTERN_TYPE } from '../contracts/pattern-recommendation-contract.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Kinds that represent "a preferred way to say/structure something" —
 *  the ones where more than one Approved item for the same role is a
 *  genuine organizational-style conflict, not simply "two different
 *  facts" (two Approved recipients, for instance, are not a conflict —
 *  an organization legitimately has more than one real recipient). */
const STYLE_ROLE_KINDS = Object.freeze(['template_pattern', 'sentence_pattern', 'paragraph_pattern', 'writing_style']);

/** "Knowledge drift" — Approved items whose real suggestConfidence() sits
 *  below their OWN kind's real mean. Grouped by kind (not domainType alone)
 *  because a rule's confidence and a recipient's confidence are not
 *  comparable quantities — only items of the SAME kind are ever compared
 *  to each other. */
function lowRelativeConfidence(domainType) {
  const result = listKnowledge({ domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  if (!result.ok) return [];

  const byKind = new Map();
  for (const item of result.data) {
    const suggestion = suggestConfidence(item);
    if (!suggestion.ok) continue;
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push({ item, confidence: suggestion.suggestedConfidence, rationale: suggestion.rationale });
  }

  const flagged = [];
  for (const [kind, entries] of byKind.entries()) {
    if (entries.length < 2) continue; // no real "relative to peers" comparison with a group of one
    const groupMean = round2(entries.reduce((s, e) => s + e.confidence, 0) / entries.length);
    for (const e of entries) {
      if (e.confidence < groupMean) {
        flagged.push({
          itemId: e.item.id,
          kind,
          domainType,
          confidence: e.confidence,
          groupMeanConfidence: groupMean,
          groupSize: entries.length,
          rationale: `${e.rationale} Di bawah rata-rata nyata kelompoknya (${groupMean}) di antara ${entries.length} item Approved berjenis "${kind}".`,
        });
      }
    }
  }
  return flagged.sort((a, b) => a.confidence - b.confidence);
}

/** "Conflicting organizational styles" — more than one Approved item of
 *  the SAME style-role kind in the SAME domainType. A real, structural
 *  count (how many, which ids) — never a guess at which one is "right";
 *  that stays a human decision, same as every Profile Override. */
function conflictingStyles(domainType) {
  const result = listKnowledge({ domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  if (!result.ok) return [];

  const byKind = new Map();
  for (const item of result.data) {
    if (!STYLE_ROLE_KINDS.includes(item.kind)) continue;
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push(item);
  }

  const conflicts = [];
  for (const [kind, items] of byKind.entries()) {
    if (items.length < 2) continue;
    conflicts.push({
      kind,
      domainType,
      itemIds: items.map((i) => i.id),
      count: items.length,
      rationale: `${items.length} item Approved berjenis "${kind}" ditemukan untuk domain "${domainType}" — tinjau apakah semuanya masih relevan atau salah satu sudah usang.`,
    });
  }
  return conflicts;
}

/** "Obsolete wording" — reuses Sprint 11.5's writingStyleRecommendations()
 *  (via computeLearningPatterns) VERBATIM, zero new computation: a wording
 *  reviewers repeatedly chose over the AI/template default IS, by
 *  construction, evidence the default is becoming obsolete. Relabeled
 *  here only for this report's own explainability surface. */
function obsoleteWordingCandidates(domainType) {
  return computeLearningPatterns(domainType).filter((p) => p.patternType === PATTERN_TYPE.WRITING_STYLE);
}

/**
 * Phase 11, Sprint 11.7 — the Knowledge Drift & Organizational Evolution
 * report. Pure, deterministic, never writes anything; a human reviews and
 * acts (deprecate a template, approve a new one, adjust a Profile
 * Override) through the existing review pipelines this file never
 * bypasses.
 * @param {string} domainType
 */
export function computeKnowledgeDrift(domainType) {
  const lowConfidence = lowRelativeConfidence(domainType);
  const conflicts = conflictingStyles(domainType);
  const obsoleteWording = obsoleteWordingCandidates(domainType);
  return Object.freeze({
    domainType,
    lowRelativeConfidence: Object.freeze(lowConfidence),
    conflictingStyles: Object.freeze(conflicts),
    obsoleteWordingCandidates: Object.freeze(obsoleteWording),
    hasDrift: lowConfidence.length > 0 || conflicts.length > 0 || obsoleteWording.length > 0,
    computedAt: new Date().toISOString(),
  });
}
