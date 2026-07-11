/* ============================================================
   OUTLIER-DETECTION-ENGINE.JS — Machine Learning Foundation (V2.0.9, Phase 12)

   PURPOSE: "Outlier Detection" — a real, deterministic z-score check
   reusing statistics-engine.js#computeFieldStatistics rather than
   re-deriving mean/stddev. An item is an outlier on a field if its value
   is more than `zThreshold` standard deviations from the population mean.

   RESPONSIBILITY: `detectOutliers(domainType, kind, field, opts)`.

   DEPENDENCIES: knowledge/extraction/index-engine.js, statistics-engine.js.

   NON-GOALS: does not write anything — a report only, same as
   knowledge/extraction/scope-detection-engine.js and
   promotion-candidate-engine.js. Requires stddev > 0 (a population with
   zero variance has no meaningful outliers, not a divide-by-zero crash).
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from '../extraction/index-engine.js';
import { computeFieldStatistics } from './statistics-engine.js';

const DEFAULT_Z_THRESHOLD = 2;

/**
 * @param {string} domainType
 * @param {string} kind
 * @param {string} field
 * @param {{zThreshold?: number}} [opts]
 * @returns {{ok: boolean, itemsAnalyzed: number, outlierIds: string[], mean: number, stddev: number, error: object|null}}
 */
export function detectOutliers(domainType, kind, field, opts = {}) {
  const zThreshold = opts.zThreshold ?? DEFAULT_Z_THRESHOLD;
  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind).filter((i) => typeof i.payload[field] === 'number');

  if (items.length === 0) {
    return { ok: false, itemsAnalyzed: 0, outlierIds: [], mean: 0, stddev: 0, error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items with a numeric "${field}" field.` } };
  }

  const stats = computeFieldStatistics(items.map((i) => i.payload[field]));
  if (stats.stddev === 0) {
    return { ok: true, itemsAnalyzed: items.length, outlierIds: [], mean: stats.mean, stddev: 0, error: null };
  }

  const outlierIds = items
    .filter((i) => Math.abs((i.payload[field] - stats.mean) / stats.stddev) > zThreshold)
    .map((i) => i.id);

  return { ok: true, itemsAnalyzed: items.length, outlierIds, mean: Math.round(stats.mean * 100) / 100, stddev: Math.round(stats.stddev * 100) / 100, error: null };
}
