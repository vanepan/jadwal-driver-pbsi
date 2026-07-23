/* ============================================================
   STATISTICS-ENGINE.JS — Machine Learning Foundation (V2.0.9, Phase 12)

   PURPOSE: "Statistics" — computes real numeric aggregates (mean, median,
   min, max, standard deviation) over every numeric payload field across a
   population, writing knowledge/language/contracts/
   statistics-confidence-contract.js's StatisticEntry payloads (real since
   Phase 3.5, `kind:'statistic'` — a registered kind with zero writers
   until now). One Candidate item per numeric field.

   RESPONSIBILITY: `computeFieldStatistics(values)` (pure) and
   `computeStatistics(domainType, kind)` (writes through
   extraction-write-helper.js).

   DEPENDENCIES: knowledge/extraction/index-engine.js,
   knowledge/extraction/extraction-write-helper.js,
   knowledge/language/contracts/statistics-confidence-contract.js,
   knowledge/contracts/identity-contract.js.

   NON-GOALS: never modifies Approved Knowledge — every statistic is
   Candidate-lifecycle.
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from '../extraction/index-engine.js';
import { writeExtractedCandidate } from '../extraction/extraction-write-helper.js';
import { isStatisticEntry } from '../language/contracts/statistics-confidence-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';

/** Pure. @param {number[]} values @returns {{mean:number, median:number, min:number, max:number, stddev:number, count:number}} */
export function computeFieldStatistics(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / count;
  const median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[(count - 1) / 2];
  const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count;
  return { mean, median, min: sorted[0], max: sorted[count - 1], stddev: Math.sqrt(variance), count };
}

function numericFieldValues(items) {
  const byField = new Map();
  for (const item of items) {
    for (const [key, value] of Object.entries(item.payload || {})) {
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      if (!byField.has(key)) byField.set(key, []);
      byField.get(key).push(value);
    }
  }
  return byField;
}

/**
 * @param {string} domainType
 * @param {string} kind
 * @returns {{ok: boolean, itemsAnalyzed: number, fieldsAnalyzed: number, writes: object[], error: object|null}}
 */
export function computeStatistics(domainType, kind) {
  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind);

  if (items.length === 0) {
    return { ok: false, itemsAnalyzed: 0, fieldsAnalyzed: 0, writes: [], error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items to compute statistics from.` } };
  }

  const byField = numericFieldValues(items);
  const now = new Date().toISOString();
  const writes = [];

  for (const [field, values] of byField) {
    const stats = computeFieldStatistics(values);
    const entry = Object.freeze({ label: `${domainType}/${kind}.${field} (mean)`, value: Math.round(stats.mean * 100) / 100, unit: field, computedAt: now });
    if (!isStatisticEntry(entry)) continue;

    const sourceRef = `statistic:${domainType}:${kind}:${field}`;
    const candidate = Object.freeze({
      id: generateKnowledgeId({ domainType, sourceType: 'extraction', sourceRef }),
      version: 1, domainType, sourceType: 'extraction', kind: 'statistic',
      payload: Object.freeze({ ...entry, median: stats.median, min: stats.min, max: stats.max, stddev: Math.round(stats.stddev * 100) / 100, sampleSize: stats.count }),
      confidence: Math.min(1, stats.count / 10),
      lifecycleState: LIFECYCLE_STATE.CANDIDATE,
      provenance: Object.freeze({ connectorId: 'extraction', sourceRef, capturedAt: now }),
      approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
    });
    writes.push(writeExtractedCandidate(candidate));
  }

  return { ok: true, itemsAnalyzed: items.length, fieldsAnalyzed: byField.size, writes, error: null };
}
