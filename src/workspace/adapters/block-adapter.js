/* ============================================================
   BLOCK-ADAPTER.JS — Live Word Workspace (V2, Phase 12.8.1)

   PURPOSE: the ONE, LOSSLESS, PURE conversion between
   document-intelligence/'s existing EditableSection[] (a ComposerDocument's
   real shape, unchanged) and workspace/'s own LiveBlock[] — so
   workspace/ can read a document's content without document-intelligence/
   ever growing a new field or workspace/ ever writing into
   composer-document-repository.js.

   WHY THIS FILE LIVES IN workspace/, NOT document-intelligence/: the
   Phase 12.8 dependency-direction extension (js/v2/README.md) is
   one-way — `workspace/` depends on `document-intelligence/`, and
   `document-intelligence/` NEVER depends on `workspace/` (same rule
   every other domain this platform reads from enforces symmetrically).
   An earlier draft of this file lived under
   document-intelligence/composer/ and imported workspace/'s LiveBlock
   contract — scripts/workspace-ownership-check.mjs's Part 4 caught the
   resulting cycle immediately. Moving the adapter here, importing
   document-intelligence/'s EditableSection contract (an already-approved
   direction), resolves it cleanly: the conversion lives with its
   OUTPUT's owner, not its input's — the same choice
   knowledge/learning/diff-learning-engine.js makes by living with the
   domain that CONSUMES a diff, not the one that produces the raw values.

   RESPONSIBILITY: sectionsToLiveBlocks(sections) and
   liveBlocksToSections(blocks) — both pure, both round-trip-safe.
   `blockType` defaults to BLOCK_TYPE.PARAGRAPH for every block converted
   FROM an EditableSection (which never carried a type of its own) and is
   silently dropped when converting back (EditableSection has no field for
   it). `order` is the section's array index at conversion time;
   `liveEntityRefs` starts empty (Sprint 12.8.4 is the first real
   populator).

   DEPENDENCIES:
   document-intelligence/composer/contracts/editable-section-contract.js,
   ../contracts/live-block-contract.js.

   NON-GOALS: does not read or write composer-document-repository.js —
   both functions take/return plain arrays, callers
   (workspace-context-builder.js) supply the sections themselves via
   composer-store.js#getDocument.
   ============================================================ */

'use strict';

import { makeEditableSection, isEditableSection } from '../../document-intelligence/composer/contracts/editable-section-contract.js';
import { makeLiveBlock, BLOCK_TYPE } from '../contracts/live-block-contract.js';

/**
 * @param {import('../../document-intelligence/composer/contracts/editable-section-contract.js').EditableSection[]} sections
 * @returns {import('../contracts/live-block-contract.js').LiveBlock[]}
 */
export function sectionsToLiveBlocks(sections) {
  return sections.map((section, index) => makeLiveBlock({
    blockId: section.sectionId,
    blockType: BLOCK_TYPE.PARAGRAPH,
    order: index,
    field: section.field,
    value: section.value,
    isOverridden: section.isOverridden,
    knowledgeReferences: section.knowledgeReferences,
    suggestionPlaceholder: section.suggestionPlaceholder,
    liveEntityRefs: [],
  }));
}

/**
 * @param {import('../contracts/live-block-contract.js').LiveBlock[]} blocks
 * @returns {import('../../document-intelligence/composer/contracts/editable-section-contract.js').EditableSection[]}
 */
export function liveBlocksToSections(blocks) {
  return [...blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => Object.freeze({
      ...makeEditableSection({
        field: block.field,
        value: block.value,
        knowledgeReferences: block.knowledgeReferences,
        suggestionPlaceholder: block.suggestionPlaceholder,
      }),
      sectionId: block.blockId,
      isOverridden: block.isOverridden,
    }));
}

/** Round-trip guard used by this file's own tests — not a runtime path. */
export function isRoundTripSafe(sections) {
  if (!sections.every(isEditableSection)) return false;
  const roundTripped = liveBlocksToSections(sectionsToLiveBlocks(sections));
  return JSON.stringify(roundTripped) === JSON.stringify(sections);
}
