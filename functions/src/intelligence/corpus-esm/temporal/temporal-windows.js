/* ============================================================
   TEMPORAL-WINDOWS.JS — Historical vs Current Convention
   (V2, Phase 5.x.3)

   PURPOSE: turn the operator-configured evidence windows
   (corpus-analysis-config.js `temporal` block) into a resolved,
   deterministic classifier for ONE canonical `sourceDate`.

   THE RULES (§6, §14, §15):
     • dates come ONLY from the document's canonical `sourceDate`. This
       module never sees an upload date, an ingestion date, a filename,
       or "now".
     • if NEITHER `historicalCutoff` NOR `currentWindowStart` is set (and
       there is no `eraCutoverDate` to fall back on) → the windows are
       "unconfigured": every date buckets as `unknown`, and the temporal
       layer returns `unknown` / `insufficient_evidence` everywhere.
     • a null `sourceDate` always buckets as `unknown` — never guessed.

   FALLBACK: when `temporal.historicalCutoff` / `temporal.currentWindowStart`
   are unset but the @1 `eraCutoverDate` is set, both boundaries are
   derived from it, with `± transitionalWindowDays` (or the temporal
   block's own `transitionalOverlapDays`, whichever is larger) forming the
   transitional band. This keeps a single-cutover operator config working
   without a second thing to configure.

   RESPONSIBILITY: resolveTemporalWindows(config) -> ResolvedWindows;
   bucketSourceDate(sourceDate, windows) -> 'historical'|'current'|
   'transitional'|'unknown'.

   DEPENDENCIES: ../contracts/temporal-contract.js (TEMPORAL_CLASSIFICATION).
   PURE.
   ============================================================ */

'use strict';

import { TEMPORAL_CLASSIFICATION } from './contracts/temporal-contract.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoOrNull(v) {
  return typeof v === 'string' && ISO_DATE.test(v) ? v : null;
}

/** Add `days` to an ISO 'YYYY-MM-DD' → ISO 'YYYY-MM-DD' (UTC, deterministic). */
function shiftIso(iso, days) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/**
 * @typedef {Object} ResolvedWindows
 * @property {boolean} configured        - false ⇒ every date buckets `unknown`
 * @property {string|null} historicalEnd - a date STRICTLY before this is historical
 * @property {string|null} currentStart  - a date ON or AFTER this is current
 * @property {number} transitionalOverlapDays
 * @property {string} source             - 'temporal_block' | 'era_cutover_fallback' | 'unconfigured'
 */
export function resolveTemporalWindows(config = {}) {
  const t = (config && typeof config.temporal === 'object' && config.temporal) || {};
  let historicalEnd = isoOrNull(t.historicalCutoff);
  let currentStart = isoOrNull(t.currentWindowStart);
  const overlap = Number.isInteger(t.transitionalOverlapDays) && t.transitionalOverlapDays >= 0 ? t.transitionalOverlapDays : 0;

  if (historicalEnd || currentStart) {
    // an operator may set just one boundary; the other defaults to it
    historicalEnd = historicalEnd || currentStart;
    currentStart = currentStart || historicalEnd;
    // guard a nonsensical ordering
    if (currentStart < historicalEnd) { const swap = currentStart; currentStart = historicalEnd; historicalEnd = swap; }
    return Object.freeze({ configured: true, historicalEnd, currentStart, transitionalOverlapDays: overlap, source: 'temporal_block' });
  }

  const cutover = isoOrNull(config.eraCutoverDate);
  if (cutover) {
    const band = Math.max(
      overlap,
      Number.isFinite(Number(config.transitionalWindowDays)) && Number(config.transitionalWindowDays) >= 0 ? Math.floor(Number(config.transitionalWindowDays)) : 0,
    );
    return Object.freeze({
      configured: true,
      historicalEnd: shiftIso(cutover, -band) || cutover,
      currentStart: shiftIso(cutover, band) || cutover,
      transitionalOverlapDays: band,
      source: 'era_cutover_fallback',
    });
  }

  return Object.freeze({ configured: false, historicalEnd: null, currentStart: null, transitionalOverlapDays: 0, source: 'unconfigured' });
}

/**
 * @param {string|null} sourceDate  the document's CANONICAL sourceDate (ISO 'YYYY-MM-DD') or null
 * @param {ResolvedWindows} windows
 * @returns {string} TEMPORAL_CLASSIFICATION.*
 */
export function bucketSourceDate(sourceDate, windows) {
  const d = isoOrNull(sourceDate);
  if (!windows || !windows.configured || !d) return TEMPORAL_CLASSIFICATION.UNKNOWN;
  if (d < windows.historicalEnd) return TEMPORAL_CLASSIFICATION.HISTORICAL;
  if (d >= windows.currentStart) return TEMPORAL_CLASSIFICATION.CURRENT;
  return TEMPORAL_CLASSIFICATION.TRANSITIONAL;
}

/** How many whole days between two ISO dates (b - a), or null. */
export function daysBetweenIso(a, b) {
  const ta = Date.parse(`${isoOrNull(a)}T00:00:00Z`);
  const tb = Date.parse(`${isoOrNull(b)}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}
