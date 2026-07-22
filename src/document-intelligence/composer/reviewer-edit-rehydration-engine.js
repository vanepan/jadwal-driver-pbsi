/* ============================================================
   REVIEWER-EDIT-REHYDRATION-ENGINE.JS — Phase 11, Sprint 11.9
   (Persistent Organizational Learning)

   PURPOSE: make a human reviewer's inline edits become PERSISTENT,
   governed, promotable organizational learning — "Teach Once, Learn
   Forever" — WITHOUT inventing a new engine, a parallel repository, a
   second promotion workflow, or a new persisted store.

   THE ENTIRE MECHANISM IS ONE REUSED PATTERN. This file is the exact
   analogue of knowledge/datasets/import-session/knowledge-rehydration-
   engine.js#rehydrateKnowledgeFromSessions, applied to a different already-
   persistent source:

     Import Sessions (RTDB)   ──project──>  Draft Knowledge     (that engine)
     Composer Revisions (RTDB) ─project──>  Candidate Learning  (this engine)

   WHY THIS NEEDS NO NEW STORE. Reviewer edits are ALREADY durably persisted:
   composer-document-repository.js is RTDB-backed, and every editSection()/
   addSection() appends a ComposerRevision carrying the real per-field Diff
   (before/after) and editedBy. The knowledge repository is in-memory, but —
   exactly like imported Knowledge — organizational learning derived from a
   persistent source does not need its own second persisted copy: it is
   RE-PROJECTED from that source on every load. The persistent ComposerDocument
   is the single source of truth (Sprint 11.9 requirement 6); the Candidate
   KnowledgeItem is reconstructed from it, never independently persisted.

   WHY THIS BELONGS IN document-intelligence/ (not knowledge/). It reads
   composer-store.js (getRevisionHistory/listAllDocuments) AND writes through
   knowledge-service.js. js/v2/README.md's dependency rule is that knowledge/
   may NEVER depend on document-intelligence/, but document-intelligence/ MAY
   depend on knowledge/ — so this projection can only live here, the same way
   review-metrics-service.js already lives here for the same reason.

   DETERMINISM & IDEMPOTENCE (the property that makes "run on every load /
   every edit" safe). The Candidate's id is deterministic per (documentId,
   field): `generateKnowledgeId({domainType, sourceType:'correction',
   sourceRef:'reviewer-edit:<documentId>:<field>'})`. A re-run:
     - skips a Candidate whose payload is byte-identical (no write),
     - updates a still-mutable Candidate in place if the reviewer's preferred
       wording changed (updateDraft — Candidate is a MUTABLE_STATE),
     - NEVER touches an Approved/Deprecated item (the human already decided —
       requirement "Knowledge must NEVER be updated directly"; a decided
       preference stands).
   So running it on every composer change and on every mount converges to a
   fixed point and then writes nothing — the same "a converged sweep costs
   nothing" discipline the import-session sweep already established.

   WHAT IS PROJECTED, AND WHAT IS DELIBERATELY NOT.
     - Projected: a reviewer edit to a NON-pattern field whose Sprint 11.4
       semantic classification is a reusable WORDING/PHRASING preference
       (opening_phrase / closing_phrase / wording_change). These are genuine
       organizational writing style — the thing "Learn Forever" is about.
       Landed as a `kind:'writing_style'` CANDIDATE so an approval feeds
       buildProfile(domainType, WRITING_STYLE) → Pattern Discovery
       recommendations, closing the loop with zero new plumbing.
     - NOT projected: a per-document FACT correction (quantity_correction —
       "20 → 24 kursi" for ONE document is not reusable organizational
       knowledge; it already lives, durably, in that document's own persisted
       revision), and STRUCTURAL edits (a section added/removed). Fabricating
       reusable Knowledge from a one-off document value would violate
       CLAUDE.md's "Knowledge is structured organizational understanding" /
       "Never invent business rules".
     - NOT projected here: pattern-sourced (`pattern:<id>`) edits. Those are
       already handled by section-learning-bridge.js Signal 2
       (submitDraftEditAsCorrection → a Candidate correcting the cited
       pattern). Persisting THOSE across refresh is the natural same-mechanism
       extension point (see the Sprint 11.9 report), left out of this diff to
       keep it bounded and to avoid double-generating a Candidate for one edit.

   HUMAN GATE PRESERVED (requirement 3/4, CLAUDE.md Principle 5). Everything
   lands as CANDIDATE — unapproved. Nothing here ever calls submitForReview/
   approve. Promotion to Approved organizational Knowledge remains the
   existing, human-only decision (knowledge-service.js#promoteKnowledge).

   ORGANIZATIONAL MEMORY RECORD (requirement "preserve Original AI output →
   Human edit → Semantic classification → Reviewer → Timestamp → Evidence →
   Approval status → Promotion history"). All eight are preserved through
   EXISTING structures: the payload carries originalAiOutput / value(human
   edit) / semanticClassification / reviewer / sourceDocumentId(evidence);
   provenance.capturedAt is the edit Timestamp; the KnowledgeItem's
   lifecycleState is the Approval status; its append-only version history is
   the Promotion history.

   RESPONSIBILITY: rehydrateLearningFromDocuments() (project every document),
   projectReviewerEditLearning(documentId, domainType) (project one).

   DEPENDENCIES: ./composer-store.js (listAllDocuments/getRevisionHistory),
   ./semantic-diff-engine.js (classifySemanticDiff — the SAME Sprint 11.4
   engine, reused not duplicated), ../../knowledge/contracts/identity-
   contract.js (generateKnowledgeId), ../../knowledge/contracts/lifecycle-
   contract.js (LIFECYCLE_STATE), ../../knowledge/services/knowledge-service.js
   (getKnowledge/ingest/updateDraft — the governed write door).
   ============================================================ */

'use strict';

import { listAllDocuments, getRevisionHistory } from './composer-store.js';
import { classifySemanticDiff } from './semantic-diff-engine.js';
import { CHANGE_TYPE } from '../../../js/v2/knowledge/learning/contracts/diff-contract.js';
import { generateKnowledgeId } from '../../../js/v2/knowledge/contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../../../js/v2/knowledge/contracts/lifecycle-contract.js';
import { getKnowledge, ingest, updateDraft } from '../../../js/v2/knowledge/services/knowledge-service.js';

/** The three Sprint 11.4 diffNatures that represent a reusable wording/
 *  phrasing preference — the SAME set Sprint 11.5's
 *  writingStyleRecommendations() already treats as writing style (kept in
 *  sync deliberately; a fact correction or a structural edit is never a
 *  style preference). */
const WRITING_STYLE_DIFF_NATURES = Object.freeze(['opening_phrase', 'closing_phrase', 'wording_change']);

const PATTERN_FIELD_PREFIX = 'pattern:';

function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

/** Reconstructs, per field, the ORIGINAL AI output (the `before` of the
 *  earliest human modification of that field — i.e. the composed draft
 *  value) and the CURRENT preferred wording (the `after` of the latest
 *  modification), walking the persisted revisions oldest→newest. Only
 *  non-pattern fields whose latest change is a reusable wording preference
 *  survive. */
function reusableWordingEditsOf(documentId) {
  const revisions = getRevisionHistory(documentId); // oldest first
  const byField = new Map();

  for (const rev of revisions) {
    if (!rev.editedBy || !rev.diff || !Array.isArray(rev.diff.entries)) continue;
    for (const entry of rev.diff.entries) {
      if (entry.changeType !== CHANGE_TYPE.MODIFIED) continue; // ADDED/REMOVED are structural
      if (typeof entry.field !== 'string' || entry.field.startsWith(PATTERN_FIELD_PREFIX)) continue; // Signal 2 owns pattern edits
      const sd = classifySemanticDiff({ field: entry.field, before: entry.before, after: entry.after, editKind: 'edit', isPatternField: false });
      if (!WRITING_STYLE_DIFF_NATURES.includes(sd.diffNature)) continue;

      const prior = byField.get(entry.field);
      byField.set(entry.field, {
        // originalAiOutput is fixed at the FIRST reusable modification of the field.
        originalAiOutput: prior ? prior.originalAiOutput : (entry.before ?? ''),
        after: entry.after,
        editedBy: rev.editedBy,
        at: rev.createdAt || new Date(0).toISOString(),
        semanticDiff: sd,
      });
    }
  }

  // Drop fields whose net effect returned to the original AI wording, or
  // whose current value is empty — neither is a real learned preference.
  const out = [];
  for (const [field, info] of byField.entries()) {
    if (isEmpty(info.after)) continue;
    if (String(info.after).trim() === String(info.originalAiOutput).trim()) continue;
    out.push({ field, ...info });
  }
  return out;
}

/** Builds the deterministic CANDIDATE writing_style KnowledgeItem for one
 *  reusable wording edit. The full organizational-memory record lives in the
 *  payload + provenance + lifecycle, per this file's header. */
function buildReviewerEditCandidate({ domainType, documentId, field, originalAiOutput, after, editedBy, at, semanticDiff }) {
  const sourceRef = `reviewer-edit:${documentId}:${field}`;
  const id = generateKnowledgeId({ domainType, sourceType: 'correction', sourceRef });
  return {
    id,
    version: 1,
    domainType,
    sourceType: 'correction', // an explicit human statement — getSourceWeight('correction') = 1.0
    kind: 'writing_style',
    payload: {
      value: after,                              // Human edit — the profile grouping key (PROFILE_VALUE_FIELD)
      field,
      originalAiOutput,                          // Original AI output
      humanEdit: after,                          // (== value; named explicitly for the record)
      semanticClassification: semanticDiff.diffNature, // Semantic classification
      category: semanticDiff.category,
      reviewer: editedBy,                        // Reviewer
      sourceDocumentId: documentId,              // Evidence
    },
    confidence: 1,
    lifecycleState: LIFECYCLE_STATE.CANDIDATE,   // Approval status (pre-approval)
    provenance: { connectorId: 'reviewer-edit', sourceRef, capturedAt: at }, // Timestamp
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: at,
    updatedAt: at,
  };
}

function payloadEquivalent(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Create-or-reconcile the Candidate for one reusable wording edit —
 *  idempotent and human-gate-safe (see header). Returns the op taken. */
function upsertCandidate(item) {
  const existing = getKnowledge(item.id);
  if (existing.ok) {
    const cur = existing.data;
    // The human already decided — never overwrite organizational record.
    if (cur.lifecycleState === LIFECYCLE_STATE.APPROVED || cur.lifecycleState === LIFECYCLE_STATE.DEPRECATED) return 'decided';
    if (payloadEquivalent(cur.payload, item.payload)) return 'unchanged';
    // Still a mutable Candidate whose preferred wording moved on — update in
    // place (updateDraft refuses Approved/Deprecated by contract, so this can
    // never bypass the human gate).
    const upd = updateDraft(item.id, { payload: item.payload, provenance: item.provenance });
    return upd.ok ? 'updated' : 'error';
  }
  const ing = ingest(item); // lands as CANDIDATE; gated existence check above keeps it idempotent
  return ing.ok ? 'created' : 'error';
}

/**
 * Project persistent Candidate writing-style learning from ONE document's
 * persisted revisions. Safe to call on every edit (live responsiveness) and
 * on every load — idempotent by construction.
 * @param {string} documentId
 * @param {string} domainType
 * @returns {{ok: boolean, created: number, updated: number, unchanged: number, decided: number}}
 */
export function projectReviewerEditLearning(documentId, domainType) {
  const edits = reusableWordingEditsOf(documentId);
  const tally = { ok: true, created: 0, updated: 0, unchanged: 0, decided: 0 };
  for (const e of edits) {
    const item = buildReviewerEditCandidate({ domainType, documentId, ...e });
    const op = upsertCandidate(item);
    if (op === 'created') tally.created += 1;
    else if (op === 'updated') tally.updated += 1;
    else if (op === 'unchanged') tally.unchanged += 1;
    else if (op === 'decided') tally.decided += 1;
  }
  return tally;
}

/**
 * Project persistent Candidate writing-style learning from EVERY persisted
 * ComposerDocument. The mount-time + composer-change-listener entry point —
 * the analogue of rehydrateKnowledgeFromSessions(). Idempotent; a converged
 * corpus writes nothing.
 * @returns {{ok: boolean, created: number, updated: number, unchanged: number, decided: number, documents: number}}
 */
export function rehydrateLearningFromDocuments() {
  const docs = listAllDocuments();
  const total = { ok: true, created: 0, updated: 0, unchanged: 0, decided: 0, documents: docs.length };
  for (const doc of docs) {
    const t = projectReviewerEditLearning(doc.documentId, doc.domainType);
    total.created += t.created;
    total.updated += t.updated;
    total.unchanged += t.unchanged;
    total.decided += t.decided;
  }
  return total;
}
