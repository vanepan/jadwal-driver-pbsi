/* ============================================================
   DATASET-CLASSIFICATION-CONTRACT.JS — Bootstrap Dataset Foundation (V2.0.13)

   PURPOSE: fix "how much should a whole Dataset's say-so count" — the
   Dataset-spec-level counterpart to contracts/source-weight-contract.js's
   existing sourceType weight table. Kept as a SEPARATE table (not merged
   into source-weight-contract.js) because a Dataset classifies a
   collection before any item is even acquired, while SourceWeight scores
   an already-acquired KnowledgeItem's sourceType — two different points
   in the pipeline, same underlying trust reasoning.

   Weight rationale (matches the roadmap's explicit priority list, "Manual
   Correction > Official NOR > Historical NOR > Bootstrap Dataset"):
   CORRECTION (1.0) — an explicit human statement, the platform's
   highest-trust input by design (Decision 6, mirrored from
   source-weight-contract.js). OFFICIAL (0.8) — a real organizational
   document. HISTORICAL (0.6) — a real organizational document, but
   older/less current. SYNTHETIC and TRAINING (0.3 each) — Bootstrap
   Knowledge: "the teacher, never the source of truth" (roadmap's exact
   words) — deliberately low, deliberately never allowed to outrank a real
   document classification.

   RESPONSIBILITY: `getDatasetTypeWeight(datasetType)`, `isBootstrapType`,
   `KNOWLEDGE_PRIORITY_ORDER` (the roadmap's priority list, as data).

   DEPENDENCIES: dataset-contract.js (DATASET_TYPE).

   NON-GOALS: does not compute a KnowledgeItem's confidence — that
   remains machine-learning/confidence-engine.js's job, reading
   source-weight-contract.js, unchanged by this file. This table is read
   by V2.0.14's dataset-import-service.js only to ANNOTATE an import
   report with the dataset's classification/weight, never to alter what
   confidence-engine.js computes.
   ============================================================ */

'use strict';

import { DATASET_TYPE } from './dataset-contract.js';

export const DATASET_CLASSIFICATION_SCHEMA = 'dataset-classification@1';

/** The roadmap's own priority ordering, highest-trust first — as data,
 *  never a hardcoded if/else chain. */
export const KNOWLEDGE_PRIORITY_ORDER = Object.freeze([
  DATASET_TYPE.CORRECTION,
  DATASET_TYPE.OFFICIAL,
  DATASET_TYPE.HISTORICAL,
  DATASET_TYPE.SYNTHETIC,
  DATASET_TYPE.TRAINING,
]);

const _weights = Object.freeze({
  [DATASET_TYPE.CORRECTION]: 1.0,
  [DATASET_TYPE.OFFICIAL]: 0.8,
  [DATASET_TYPE.HISTORICAL]: 0.6,
  [DATASET_TYPE.SYNTHETIC]: 0.3,
  [DATASET_TYPE.TRAINING]: 0.3,
});

/** Bootstrap types are never the source of truth — always outranked by
 *  any real (official/historical/correction) dataset. */
const _bootstrapTypes = Object.freeze([DATASET_TYPE.SYNTHETIC, DATASET_TYPE.TRAINING]);

/**
 * @param {string} datasetType - one of DATASET_TYPE
 * @returns {number} 0–1
 */
export function getDatasetTypeWeight(datasetType) {
  return _weights[datasetType] ?? 0;
}

/** @param {string} datasetType @returns {boolean} */
export function isBootstrapType(datasetType) {
  return _bootstrapTypes.includes(datasetType);
}

/**
 * Compares two dataset types by the roadmap's priority order.
 * @returns {number} negative if `a` outranks `b`, positive if `b` outranks `a`, 0 if equal
 */
export function compareDatasetPriority(a, b) {
  return KNOWLEDGE_PRIORITY_ORDER.indexOf(a) - KNOWLEDGE_PRIORITY_ORDER.indexOf(b);
}
