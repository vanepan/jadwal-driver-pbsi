/* ============================================================
   LIVE-BLOCK-CONTRACT.JS — Live Word Workspace (V2, Phase 12.8.1)

   PURPOSE: fix the shape of a Live Block — a STRICT, LOSSLESS SUPERSET of
   document-intelligence/composer/contracts/editable-section-contract.js's
   EditableSection, typed by `blockType` (Live Paragraph / Live Table /
   Live Reference / Live Citation / Live Heading / Live Signature from the
   Phase 12.8 brief are all `blockType` VALUES here, not separate
   contracts — the same "closed enum for the outer shape, open registry
   for inner vocabulary" split recognition-record-contract.js draws for
   RECORD_TYPE). Every field EditableSection already has (sectionId ->
   blockId, field, value, isOverridden, knowledgeReferences,
   suggestionPlaceholder) is preserved verbatim so the round-trip adapter
   (document-intelligence/composer/block-adapter.js, this same sprint) is
   provably lossless — see that file's own tests.

   WHY A NEW CONTRACT AND NOT A CHANGE TO EditableSection ITSELF: this
   platform's own "never replace production logic" discipline
   (js/v2/README.md, CLAUDE.md) forbids widening a shape every existing
   composer-store.js/review-workspace.js/composer-document.js call site
   already depends on. Live Block lives in workspace/ instead — a NEW,
   additive, dormant domain — so document-intelligence/'s existing
   contract, and everything built on it, stays byte-for-byte unchanged.

   NEW FIELDS beyond EditableSection, and why each earns its place:
     - blockType   — BLOCK_TYPE, registry-free (a small, closed,
                     structural set — mirrors RECORD_TYPE's own closed-set
                     reasoning). Defaults to 'paragraph' for any block
                     round-tripped from an existing EditableSection, which
                     never carried a type of its own.
     - order       — EditableSection's ordering was always implicit
                     (array position in ComposerDocument.sections); made
                     explicit here because a Live Table block's own rows/
                     cells (Sprint 12.8.x, not this sprint) will need a
                     stable position independent of the DOCUMENT array,
                     once inline block insertion (not just field editing)
                     is a real feature.
     - liveEntityRefs — Body Entity ids (js/v2/body/contracts/
                     entity-contract.js#Entity.id) this block's text
                     currently mentions/is bound to. Empty by default —
                     populated only by Sprint 12.8.4's live Recognition/
                     Body wiring, never invented here. A bare id string,
                     the same "cross-domain reference is an id, resolved
                     by the layer allowed to see both domains" idiom
                     learning/'s own header establishes — this contract
                     does not import body/.

   RESPONSIBILITY: define BLOCK_TYPE, the LiveBlock shape, and a structural
   validator.

   DEPENDENCIES: knowledge/contracts/evidence-contract.js (Evidence[] for
   knowledgeReferences — the SAME reuse editable-section-contract.js
   already makes, not a second citation shape),
   document-intelligence/composer/contracts/suggestion-placeholder-
   contract.js (reused verbatim, same reasoning).

   NON-GOALS: does not decide a block's value — a caller supplies it,
   exactly like EditableSection. Does not itself convert to/from
   EditableSection — see block-adapter.js.
   ============================================================ */

'use strict';

import { isEvidenceList } from '../../knowledge/contracts/evidence-contract.js';
import { isSuggestionPlaceholder } from '../../../../src/document-intelligence/composer/contracts/suggestion-placeholder-contract.js';

export const LIVE_BLOCK_SCHEMA = 'live-block@1';

/** Closed, structural set — realizes the brief's Live Paragraph/Live
 *  Table/Live Reference/Live Citation/Live Heading/Live Signature as
 *  VALUES of one field, never separate contracts. */
export const BLOCK_TYPE = Object.freeze({
  PARAGRAPH: 'paragraph',
  HEADING: 'heading',
  TABLE: 'table',
  REFERENCE: 'reference',
  CITATION: 'citation',
  SIGNATURE: 'signature',
});

export function isBlockType(t) {
  return Object.values(BLOCK_TYPE).includes(t);
}

/**
 * @typedef {Object} LiveBlock
 * @property {string} blockId
 * @property {string} blockType              - one of BLOCK_TYPE
 * @property {number} order                  - stable position, 0-based
 * @property {string} field
 * @property {*} value
 * @property {boolean} isOverridden
 * @property {import('../../knowledge/contracts/evidence-contract.js').Evidence[]} knowledgeReferences
 * @property {import('../../../../src/document-intelligence/composer/contracts/suggestion-placeholder-contract.js').SuggestionPlaceholder|null} suggestionPlaceholder
 * @property {string[]} liveEntityRefs        - Body Entity ids this block currently references, [] by default
 */

/** @param {{blockId: string, blockType?: string, order: number, field: string, value: *,
 *   isOverridden?: boolean, knowledgeReferences?: Array, suggestionPlaceholder?: Object|null,
 *   liveEntityRefs?: string[]}} seed
 *  @returns {LiveBlock} */
export function makeLiveBlock({
  blockId, blockType = BLOCK_TYPE.PARAGRAPH, order, field, value,
  isOverridden = false, knowledgeReferences = [], suggestionPlaceholder = null, liveEntityRefs = [],
}) {
  if (typeof blockId !== 'string' || !blockId) throw new Error('makeLiveBlock: blockId is required.');
  if (!isBlockType(blockType)) throw new Error(`makeLiveBlock: unknown blockType "${blockType}".`);
  if (typeof order !== 'number' || order < 0) throw new Error('makeLiveBlock: order must be a non-negative number.');
  if (typeof field !== 'string' || !field) throw new Error('makeLiveBlock: field is required.');
  return Object.freeze({
    blockId, blockType, order, field, value, isOverridden,
    knowledgeReferences: Object.freeze([...knowledgeReferences]),
    suggestionPlaceholder,
    liveEntityRefs: Object.freeze([...liveEntityRefs]),
  });
}

/** @param {*} b @returns {boolean} */
export function isLiveBlock(b) {
  return !!b && typeof b === 'object'
    && typeof b.blockId === 'string' && b.blockId.length > 0
    && isBlockType(b.blockType)
    && typeof b.order === 'number' && b.order >= 0
    && typeof b.field === 'string' && b.field.length > 0
    && typeof b.isOverridden === 'boolean'
    && isEvidenceList(b.knowledgeReferences)
    && (b.suggestionPlaceholder === null || isSuggestionPlaceholder(b.suggestionPlaceholder))
    && Array.isArray(b.liveEntityRefs) && b.liveEntityRefs.every((r) => typeof r === 'string');
}
