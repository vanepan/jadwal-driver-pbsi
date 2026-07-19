/* ============================================================
   SECTION-LEARNING-BRIDGE.JS — Live Document Workspace (Phase 11 Course
   Correction, Workstream 3)

   PURPOSE: the ONE place a human's edit to a ComposerDocument section
   becomes structured learning, automatically — the reviewer never
   "teaches" anything explicitly, this fires as a side effect of the same
   editSection()/addSection() call review-workspace.js's inline editor
   already makes on blur.

   REVIVES, DOES NOT DUPLICATE: knowledge/learning/diff-learning-
   engine.js#submitDraftEditAsCorrection — built and tested since V2.0.16,
   confirmed (by direct repo-wide trace before this file was written) to
   have ZERO real callers anywhere in the codebase; its own bridge to
   correction-pipeline-engine.js#submitCorrection is untouched here. This
   file is that bridge's first real caller.

   TWO DISTINCT SIGNALS, PER FIELD PROVENANCE (product-owner decision,
   confirmed before this file was written — see the plan's Workstream 3):

     1. ALWAYS: learning/services/learning-service.js#recordCorrection —
        the universal audit trail. Fires for every edit/delete, even a
        plain fact field ("quantity 20 -> 24") that has no single
        KnowledgeItem behind it to correct — recordCorrection's own
        `affectedKnowledgeId` is nullable for exactly this case.

     2. ONLY when the edited field traces to a specific Knowledge pattern
        (`field` starts with `pattern:<knowledgeId>` — nor-composer.js's
        own, pre-existing convention, the SAME parsing composer-
        document.js#fieldLabel() already does) AND this is a genuine TEXT
        EDIT, never a deletion: ALSO submitDraftEditAsCorrection() against
        that pattern KnowledgeItem. A DELETION records only the audit
        entry (signal 1) — deleting a sentence from ONE document means
        "this document doesn't need it," not "the shared pattern's
        wording is wrong for everyone"; submitCorrection's own safety
        property (never mutates an Approved item in place — mints a
        linked Candidate for the normal review queue instead) is what
        makes signal 2 safe to fire with no extra human gate for a real
        edit, but a deletion carries no replacement TEXT to propose as a
        correction in the first place.

   RESPONSIBILITY: recordSectionEdit({documentId, domainType, field,
   before, after, actorId}).

   DEPENDENCIES: learning/services/learning-service.js,
   knowledge/learning/diff-learning-engine.js,
   knowledge/services/knowledge-service.js (read-only, to find the cited
   pattern's own `kind` for the Correction call).
   ============================================================ */

'use strict';

import { recordCorrection, CORRECTION_TYPE } from '../../learning/services/learning-service.js';
// Sprint 11.3 (Document-first Experience), Learning requirement — "Template
// edits [carry] Highest learning weight." learning-event-contract.js
// already registers CORRECTION_TYPE.PATTERN for exactly this concept ("a
// human overrode/approved a detected pattern") — this file previously
// tagged EVERY edit as CORRECTION_TYPE.KNOWLEDGE regardless of whether the
// edited field was pattern-sourced, an honest classification gap (not a
// missing weight number to invent): a real, already-registered vocabulary
// value existed and simply was not being used. See recordSectionEdit below.
import { submitDraftEditAsCorrection } from '../../knowledge/learning/diff-learning-engine.js';
import { getKnowledge } from '../../knowledge/services/knowledge-service.js';
// Sprint 11.4 (Human Learning Intelligence) — WHAT changed, not only that
// something changed. See that file's own header for why this is a
// deterministic classification, never an invented confidence number.
import { classifySemanticDiff } from './semantic-diff-engine.js';

const PATTERN_FIELD_PREFIX = 'pattern:';

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * @param {{documentId: string, domainType: string, field: string, before: *, after: *, actorId: string}} params
 * @returns {{ok: boolean, editKind: 'edit'|'delete', semanticDiff: import('./semantic-diff-engine.js').SemanticDiffResult, correctionRecorded: boolean, patternCorrectionSubmitted: boolean, error: object|null}}
 */
export function recordSectionEdit({ documentId, domainType, field, before, after, actorId }) {
  const editKind = isEmpty(after) && !isEmpty(before) ? 'delete' : 'edit';
  const isPatternField = field.startsWith(PATTERN_FIELD_PREFIX);
  const citedKnowledgeId = isPatternField ? field.slice(PATTERN_FIELD_PREFIX.length) : null;

  // Sprint 11.4 — classify WHAT changed (fact correction / phrasing
  // preference / structural insert-or-removal / full rewrite), on top of
  // the existing WHO/WHERE signals (isPatternField, editKind) this file
  // already resolves. See semantic-diff-engine.js's own header.
  const semanticDiff = classifySemanticDiff({ field, before, after, editKind, isPatternField });

  // Signal 1 — always, the universal audit trail. Reused verbatim: this
  // is the SAME recordCorrection() Part A2's re-analysis sweep and
  // dataset-import-center.js's Advanced Metadata save already call.
  //
  // correctionType now honestly distinguishes a template/pattern edit
  // (CORRECTION_TYPE.PATTERN — the field cites a specific KnowledgeItem's
  // reusable wording) from a plain per-occasion document fact
  // (CORRECTION_TYPE.KNOWLEDGE — no single Knowledge item is being
  // reworked, e.g. "quantity 20 -> 24"). Both a genuine edit AND a
  // deletion of a pattern-sourced section are tagged PATTERN here — this
  // is the audit trail's classification of WHAT KIND OF THING was
  // touched, independent of signal 2's separate edit-vs-delete gate below
  // (a deletion still means "this document's use of that pattern
  // changed," even though it never proposes new pattern wording).
  const correctionResult = recordCorrection({
    domainType,
    correctionType: isPatternField ? CORRECTION_TYPE.PATTERN : CORRECTION_TYPE.KNOWLEDGE,
    targetKey: `${documentId}:${field}`,
    actorId,
    reason: editKind === 'delete'
      ? `Reviewer menghapus bagian "${field}" dari draf ini. (${semanticDiff.label})`
      : `Reviewer mengubah bagian "${field}": "${before ?? ''}" -> "${after ?? ''}". (${semanticDiff.label})`,
    before: { [field]: before ?? null },
    after: { [field]: editKind === 'delete' ? null : after },
    sourceDocumentId: documentId,
    affectedKnowledgeId: citedKnowledgeId,
    evidence: { field, editKind, patternSourced: isPatternField, semanticDiff },
  });

  let patternCorrectionSubmitted = false;
  let patternCorrectionError = null;

  // Signal 2 — only a genuine text edit to a pattern-sourced section.
  //
  // IMPORTANT: `field` here is the ComposerDocument's OWN field id
  // (`pattern:<knowledgeId>`), never the cited KnowledgeItem's real
  // payload shape — a PatternEntry's actual field is `template` (plus
  // `slots`/`granularity`, see knowledge/language/contracts/
  // pattern-contract.js#isPatternEntry). Diffing/correcting under the
  // composer's own field id, or dropping the item's other payload keys,
  // would silently corrupt the shared pattern's structure the moment a
  // Correction was ever approved. `before` is read from the item's OWN
  // current payload (never a synthetic reconstruction from the composed,
  // slot-resolved document text — those are never string-equal, since
  // the document shows `{{slot}}` already substituted with real facts);
  // `after` keeps every other payload key untouched and only replaces
  // `template` with the reviewer's edited (fully-resolved) text.
  //
  // Baking one occasion's resolved facts into a reusable template is a
  // real, known tradeoff — accepted deliberately, not overlooked: this
  // codebase's own submitCorrection() safety property (never mutates an
  // Approved item in place, see correction-pipeline-engine.js's own
  // header) means a cited pattern — Approved in virtually every real
  // case, since composition only ever draws from Approved patterns —
  // is NEVER touched by this call. It only ever mints a new, linked
  // Candidate for the ordinary review queue, so a human must explicitly
  // approve it (CLAUDE.md: "Human owns final authority") before this
  // proposed wording could ever affect a future composition.
  if (isPatternField && editKind === 'edit' && citedKnowledgeId) {
    const itemResult = getKnowledge(citedKnowledgeId);
    if (itemResult.ok) {
      const item = itemResult.data;
      const submission = submitDraftEditAsCorrection({
        domainType,
        kind: item.kind,
        itemId: citedKnowledgeId,
        before: item.payload,
        after: { ...item.payload, template: after },
        correctedBy: actorId,
        note: `Diedit langsung dari Live Document Workspace, dokumen "${documentId}".`,
      });
      patternCorrectionSubmitted = submission.ok;
      if (!submission.ok) patternCorrectionError = submission.error;
    }
    // A cited item that no longer resolves (deleted/renamed since
    // composition) is not an error worth surfacing to the reviewer here —
    // signal 1's audit entry already recorded the real edit; the pattern
    // simply can't be improved from something that no longer exists.
  }

  return {
    ok: correctionResult.ok,
    editKind,
    semanticDiff,
    correctionRecorded: correctionResult.ok,
    patternCorrectionSubmitted,
    error: correctionResult.ok ? patternCorrectionError : correctionResult.error,
  };
}
