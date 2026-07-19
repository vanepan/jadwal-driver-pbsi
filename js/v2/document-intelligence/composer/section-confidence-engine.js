/* ============================================================
   SECTION-CONFIDENCE-ENGINE.JS — Live Document Workspace (Phase 11 Course
   Correction, Workstream 4/5)

   PURPOSE: a section's visual confidence (green/yellow/red) — computed at
   RENDER TIME ONLY, never persisted (EditableSection's own contract is
   NOT touched; a pattern's confidence can change as it gains
   corroboration, so a stale stored number would silently drift from the
   truth). Every number below traces to an EXISTING, already-real engine —
   nothing here invents a weight.

   THE DOCUMENTED HIERARCHY (product owner's four tiers, reconciled
   against what is concretely reachable in this codebase today):

     1. Official Approved Template  — a `pattern:<id>` section citing a
        `kind:'template_pattern'` KnowledgeItem (nor-composer.js's own
        PATTERN_KINDS already treats this kind as distinct from
        sentence_pattern/paragraph_pattern) — real signal, not invented.
     2. Real Approved NOR Documents — a `pattern:<id>` section citing any
        OTHER Approved pattern (sentence_pattern/paragraph_pattern), or
        norNumber when a real numbering-engine.js#suggestNextNumber()
        confidence was attached to this document's explainability bag
        (source-weight-contract.js's own 'nor' entry, 0.9, is this tier's
        real grounding: "a real connector reading V1 directly").
     3. Human Review corrections / human answers — ANY section a human
        has directly set: `isOverridden:true` (edited via editSection/
        addSection), or a section that is neither pattern-sourced nor a
        recognized structural-suggestion field (i.e. a Conversation
        answer). Resolved via source-weight-contract.js's OWN existing
        `correction` entry (1.0) — "the platform's highest-trust input by
        design," a decision that predates this feature. This is the
        concrete mechanism satisfying "human corrections must increase
        confidence more than AI-generated output": 1.0 structurally
        outranks tier 1/2's `suggestConfidence()` outputs, whose formula
        (sourceWeight*0.6 + corroboration*0.4) cannot exceed 1.0 either
        and realistically sits below it without extraordinary
        corroboration.
     4. AI-generated/structural draft, no citation, no human touch —
        structural-suggestion fields (signatoryTopCount etc.) with no
        per-call confidence of their own: source-weight-contract.js's
        'extraction' entry (0.7, "mechanically derived from already-
        Approved knowledge") — the closest existing documented tier,
        reused rather than a new number.

   Unresolved (a visible UNRESOLVED_MARKER still in the value) is 0,
   already knowable without computation — matches nor-composer.js's own
   honest-abstention design unchanged.

   RESPONSIBILITY: computeSectionConfidence(section, doc), confidenceTone
   (3-state green/yellow/red collapse of unified-scoring.js's 4-tone
   system, per the product owner's explicit Grammarly-style ask).

   DEPENDENCIES: knowledge/services/knowledge-service.js,
   knowledge/machine-learning/confidence-engine.js,
   knowledge/services/confidence-service.js,
   knowledge/contracts/source-weight-contract.js,
   composer-store.js#getExplainability (numbering confidence, if attached),
   services/unified-scoring.js (the ONE color-tone system this platform
   already uses — reused, never a new palette).
   ============================================================ */

'use strict';

import { getKnowledge } from '../../knowledge/services/knowledge-service.js';
import { suggestConfidence } from '../../knowledge/machine-learning/confidence-engine.js';
import { explainConfidenceAsEvidence } from '../../knowledge/services/confidence-service.js';
import { getSourceWeight } from '../../knowledge/contracts/source-weight-contract.js';
import { getExplainability } from './composer-store.js';
import { clampScore, scoreColor } from '../../../services/unified-scoring.js';

/** Structural-suggestion field names nor-generator.js#proposeNorFields()
 *  produces (js/v2/document-intelligence/nor/nor-generator.js) — pure
 *  statistics, never a human answer, never pattern-cited. norNumber is
 *  listed separately below since it may carry a real attached confidence. */
const STRUCTURAL_SUGGESTION_FIELDS = Object.freeze([
  'suggestedSignatoryTopCount', 'suggestedSignatoryBottomCount', 'typicalItemCount', 'typicalReimburseLineCount',
]);

const HUMAN_WEIGHT = getSourceWeight('correction'); // {weight:1.0, rationale:"...highest-trust input..."}
const EXTRACTION_WEIGHT = getSourceWeight('extraction'); // {weight:0.7, rationale:"...mechanically derived..."}
const NOR_WEIGHT = getSourceWeight('nor'); // {weight:0.9, rationale:"...real connector reading V1 directly."}

function isUnresolved(value) {
  return typeof value === 'string' && value.includes('UNKNOWN');
}

/**
 * @param {import('./contracts/editable-section-contract.js').EditableSection} section
 * @param {import('./contracts/composer-document-contract.js').ComposerDocument} doc
 * @returns {{confidence: number, tier: string, tone: 'ok'|'info'|'warn'|'danger', rationale: string, evidence: import('../../knowledge/contracts/evidence-contract.js').Evidence[]}}
 */
export function computeSectionConfidence(section, doc) {
  const { field, value, isOverridden } = section;

  if (isUnresolved(value)) {
    return { confidence: 0, tier: 'unresolved', tone: 'danger', rationale: 'Belum terisi — memerlukan masukan manusia.', evidence: [] };
  }

  if ((value === null || value === undefined || value === '') && !field.startsWith('pattern:')) {
    return { confidence: 0, tier: 'unresolved', tone: 'danger', rationale: 'Bagian ini belum diisi.', evidence: [] };
  }

  // Tier 3 — a human has directly set this value, regardless of what it
  // originally was. Checked BEFORE the pattern branch: an edited pattern
  // section is no longer "AI-composed text", it is a human's own words.
  if (isOverridden) {
    return {
      confidence: HUMAN_WEIGHT.weight, tier: 'human-correction', tone: scoreColor(clampScore(HUMAN_WEIGHT.weight * 100)),
      rationale: `Disunting manusia — ${HUMAN_WEIGHT.rationale}`, evidence: [],
    };
  }

  // Tiers 1/2 — pattern-composed prose, never edited. The cited
  // KnowledgeItem's OWN real confidence (machine-learning/confidence-
  // engine.js#suggestConfidence — sourceWeight*0.6 + corroboration*0.4)
  // IS this section's confidence; no separate number is invented.
  if (field.startsWith('pattern:')) {
    const knowledgeId = field.slice('pattern:'.length);
    const itemResult = getKnowledge(knowledgeId);
    if (!itemResult.ok) {
      return { confidence: 0, tier: 'unresolved', tone: 'danger', rationale: 'Sumber pengetahuan untuk bagian ini tidak lagi tersedia.', evidence: [] };
    }
    const item = itemResult.data;
    const conf = suggestConfidence(item);
    const evidenceResult = explainConfidenceAsEvidence(item);
    const tier = item.kind === 'template_pattern' ? 'official-template' : 'approved-pattern';
    const confidence = conf.ok ? conf.suggestedConfidence : 0;
    return {
      confidence, tier, tone: scoreColor(clampScore(confidence * 100)),
      rationale: conf.ok ? conf.rationale : 'Confidence tidak dapat dihitung untuk sumber ini.',
      evidence: evidenceResult.ok ? evidenceResult.data : [],
    };
  }

  // norNumber — prefer the REAL numbering-engine.js confidence attached to
  // this document's explainability bag (problem-solving-service.js#
  // composeApprovedNor), falling back to the structural-default tier only
  // when none was attached (e.g. a document composed before this wiring,
  // or the numbering engine itself abstained at confidence 0).
  if (field === 'norNumber') {
    const bag = getExplainability(doc.documentId);
    const numbering = bag && bag.numberingSuggestion;
    if (numbering && typeof numbering.confidence === 'number') {
      return {
        confidence: numbering.confidence, tier: 'nor-archive', tone: scoreColor(clampScore(numbering.confidence * 100)),
        rationale: numbering.basis || `${NOR_WEIGHT.rationale}`, evidence: [],
      };
    }
    return { confidence: EXTRACTION_WEIGHT.weight, tier: 'ai-draft', tone: scoreColor(clampScore(EXTRACTION_WEIGHT.weight * 100)), rationale: EXTRACTION_WEIGHT.rationale, evidence: [] };
  }

  // Tier 4 — a structural statistic, never a citation, never a human touch.
  if (STRUCTURAL_SUGGESTION_FIELDS.includes(field)) {
    return { confidence: EXTRACTION_WEIGHT.weight, tier: 'ai-draft', tone: scoreColor(clampScore(EXTRACTION_WEIGHT.weight * 100)), rationale: EXTRACTION_WEIGHT.rationale, evidence: [] };
  }

  // Everything else not pattern-sourced, not a recognized structural
  // field, and not (yet) overridden is a Conversation answer — a direct
  // human statement of fact, same trust tier as an edit.
  return {
    confidence: HUMAN_WEIGHT.weight, tier: 'human-answer', tone: scoreColor(clampScore(HUMAN_WEIGHT.weight * 100)),
    rationale: `Jawaban langsung dari pengguna — ${HUMAN_WEIGHT.rationale}`, evidence: [],
  };
}

/** Collapses unified-scoring.js's 4-tone system (ok/info/warn/danger) to
 *  exactly 3 visual states, per the product owner's explicit Grammarly-
 *  style ask (Green/Yellow/Red, no blue) — 'ok' and 'info' both read as
 *  "no action needed" at a glance; only 'warn'/'danger' ask for
 *  attention. */
export function confidenceHighlightTone(tone) {
  if (tone === 'ok' || tone === 'info') return 'green';
  if (tone === 'warn') return 'yellow';
  return 'red';
}
