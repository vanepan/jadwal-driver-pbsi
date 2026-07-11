/* ============================================================
   STATISTICS-CONFIDENCE-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 3.5)

   PURPOSE: fix (a) the payload shape for `kind: 'statistic'` — a computed
   numeric fact learned about a domain (e.g. "average NOR line count: 14"),
   distinct from contracts/metrics-contract.js's KnowledgeHealthReport
   (which measures the PLATFORM's own health, not a domain fact); and (b)
   how a KnowledgeItem's own 0-1 `confidence` field is BANDED for display —
   reusing js/services/unified-scoring.js's scoreBand/scoreBandInfo rather
   than re-implementing a banding scale (per the master prompt's explicit
   "reuse existing V1 engines whenever possible / never duplicate" rule).

   RESPONSIBILITY: StatisticEntry typedef + validator; a thin
   `confidenceBand(confidence)` that converts the 0-1 scale to
   unified-scoring's 0-100 scale and delegates.

   DEPENDENCIES: js/services/unified-scoring.js (read-only reuse — pure,
   no DOM/Firebase, confirmed by that module's own header).

   NON-GOALS: does not compute any KnowledgeItem's confidence value (that
   remains Phase 4+ builder/connector work). Does not touch
   confidenceFromScore's 0-100 scale directly — everything Knowledge-side
   stays 0-1, converted only at this one seam.

   FUTURE EVOLUTION: if Knowledge ever needs its own banding thresholds
   distinct from the platform's shared scale, this is the one file to
   change — no caller elsewhere should re-derive a band from raw
   `confidence` itself.
   ============================================================ */

'use strict';

import { scoreBand, scoreBandInfo } from '../../../../services/unified-scoring.js';

/**
 * Payload shape for `kind: 'statistic'`.
 * @typedef {Object} StatisticEntry
 * @property {string} label       - e.g. "Average NOR line count"
 * @property {number} value
 * @property {string} [unit]      - e.g. "lines" | "%" | "km"
 * @property {string} [computedAt] - ISO 8601
 */

export function isStatisticEntry(s) {
  return !!s && typeof s === 'object'
    && typeof s.label === 'string' && s.label.length > 0
    && typeof s.value === 'number';
}

/**
 * Bands a KnowledgeItem's 0-1 confidence using the platform's shared
 * 0-100 scale (js/services/unified-scoring.js), converting only at this
 * boundary.
 * @param {number} confidence  0-1
 * @returns {string} one of unified-scoring's SCORE_BANDS keys
 */
export function confidenceBand(confidence) {
  const clamped = Math.max(0, Math.min(1, Number(confidence) || 0));
  return scoreBand(clamped * 100);
}

/** Full band info (key, label, labelId) for a 0-1 confidence value. */
export function confidenceBandInfo(confidence) {
  const clamped = Math.max(0, Math.min(1, Number(confidence) || 0));
  return scoreBandInfo(clamped * 100);
}
