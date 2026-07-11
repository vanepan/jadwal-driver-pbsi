/* ============================================================
   VALIDATION-SERVICE.JS — Knowledge Services (V2, Phase 6)

   PURPOSE: one named entry point — `validate(shapeName, value)` — over
   every structural validator scattered across Phase 3/3.5/4/5's contract
   files, so a caller does not need to know which file `isConnector` lives
   in versus `isPatternEntry`.

   RESPONSIBILITY: pure composition/orchestration — a lookup table mapping
   a shape name to the validator already defined elsewhere. Adds NO new
   validation rule of its own; every check still lives in its own contract
   file (single source of truth preserved).

   DEPENDENCIES: every `isX` validator across knowledge/contracts/ and
   knowledge/language/contracts/.

   NON-GOALS: does not validate anything not already covered by an
   existing contract. Does not throw — `validate()` returns a boolean like
   every underlying validator does; callers wanting an error message call
   the specific validator directly for now (Phase 6 does not standardize
   validator error messages, only exposes a single lookup surface).

   FUTURE EVOLUTION: as new contract shapes are added, they register a new
   entry in SHAPE_VALIDATORS — the `validate()` signature itself should not
   need to change.
   ============================================================ */

'use strict';

import { isKnowledgeItem } from '../contracts/knowledge-item-contract.js';
import { isProvenance } from '../contracts/explainability-contract.js';
import { isConnector } from '../contracts/connector-contract.js';
import { isRelationshipPayload } from '../contracts/dependency-graph-contract.js';
import { isKnowledgeSource, isReference } from '../language/contracts/reference-contract.js';
import { isVocabularyEntry } from '../language/contracts/lexical-contract.js';
import { isPatternEntry } from '../language/contracts/pattern-contract.js';
import { isPolicyEntry, isMetadata } from '../language/contracts/metadata-contract.js';
import { isStatisticEntry } from '../language/contracts/statistics-confidence-contract.js';
import { isTag, isCategory } from '../language/contracts/taxonomy-contract.js';

export const SHAPE_VALIDATORS = Object.freeze({
  knowledge_item: isKnowledgeItem,
  provenance: isProvenance,
  connector: isConnector,
  relationship_payload: isRelationshipPayload,
  knowledge_source: isKnowledgeSource,
  reference: isReference,
  vocabulary_entry: isVocabularyEntry,
  pattern_entry: isPatternEntry,
  policy_entry: isPolicyEntry,
  metadata: isMetadata,
  statistic_entry: isStatisticEntry,
  tag: isTag,
  category: isCategory,
});

/**
 * @param {keyof typeof SHAPE_VALIDATORS} shapeName
 * @param {*} value
 * @returns {boolean}
 */
export function validate(shapeName, value) {
  const validator = SHAPE_VALIDATORS[shapeName];
  if (typeof validator !== 'function') {
    throw new Error(`validate: unknown shape "${shapeName}". Known shapes: ${Object.keys(SHAPE_VALIDATORS).join(', ')}.`);
  }
  return validator(value);
}

export function knownShapes() {
  return Object.freeze(Object.keys(SHAPE_VALIDATORS));
}
