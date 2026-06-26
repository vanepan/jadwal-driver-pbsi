/* ============================================================
   UNIFIED-SCORING.JS — Unified Scoring System
   (v1.17.3)

   The ONE place every displayed score is interpreted. Platform-wide invariant:

       Higher score = Better.  100 = best,  0 = worst.  No exceptions.

   This is a NORMALIZATION layer, not a scoring layer. It adds NO recommendation,
   capacity, dispatch, override, or analytics math — every formula stays exactly
   as the engines produced it. These helpers only RE-EXPRESS a raw 0–100 value as
   a band, a label, a color tone, or (for "lower is better" raw metrics like
   utilization) an inverted health score — at interpretation time. No Firebase
   migration: historical data is read as-is and normalized on the way out.

   Every consumer (recommendation, analytics, dashboards, approval, exports) MUST
   reuse these helpers so no module re-implements a band / label / color / invert.

   PURE: no DOM, no Firebase, no `window`. Node-testable
   (scripts/unified-scoring-check.mjs).
   ============================================================ */

'use strict';

// Feature 8 — the ONE confidence scale. Re-exported (not re-implemented) so every
// confidence badge resolves through the same banding the approval panel uses.
import { confidenceFromScore } from './dispatch-presentation.js';
export { confidenceFromScore };

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Clamp any value to a whole-number 0–100 score. */
export function clampScore(value) {
  return clamp(Math.round(num(value)), 0, 100);
}

/**
 * Map a raw value within [min, max] onto the unified 0–100 scale (higher =
 * better). When the source range is "lower is better", pass invert:true (or use
 * invertScore on the result). Degenerate ranges return 0.
 * @param {number} value
 * @param {{min?:number, max?:number, invert?:boolean}} [opts]
 * @returns {number} 0–100
 */
export function normalizeScore(value, opts = {}) {
  const min = num(opts.min);
  const max = opts.max == null ? 100 : num(opts.max);
  if (max <= min) return 0;
  const pct = clamp(((num(value) - min) / (max - min)) * 100, 0, 100);
  const out = opts.invert ? 100 - pct : pct;
  return Math.round(out);
}

/** Invert a "lower is better" 0–100 value into a "higher is better" score. */
export function invertScore(score) {
  return clampScore(100 - clampScore(score));
}

/* ── Feature 1 — Unified score scale (8 bands) ────────────────────────── */

/** The universal score bands. `min` is inclusive; ordered high → low. */
export const SCORE_BANDS = Object.freeze([
  { key: 'excellent', min: 100, label: 'Excellent', labelId: 'Sempurna' },
  { key: 'very-good', min: 90,  label: 'Very Good', labelId: 'Sangat Baik' },
  { key: 'good',      min: 80,  label: 'Good',      labelId: 'Baik' },
  { key: 'fair',      min: 70,  label: 'Fair',      labelId: 'Cukup Baik' },
  { key: 'average',   min: 60,  label: 'Average',   labelId: 'Cukup' },
  { key: 'poor',      min: 40,  label: 'Poor',      labelId: 'Kurang' },
  { key: 'bad',       min: 20,  label: 'Bad',       labelId: 'Buruk' },
  { key: 'critical',  min: 0,   label: 'Critical',  labelId: 'Kritis' },
]);

/** The full band object for a score (never null — floors at 'critical'). */
export function scoreBandInfo(score) {
  const s = clampScore(score);
  return SCORE_BANDS.find((b) => s >= b.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
}

/** Band key for a score ('excellent' … 'critical'). */
export function scoreBand(score) { return scoreBandInfo(score).key; }

/** English band label for a score (Feature 1). */
export function scoreLabel(score) { return scoreBandInfo(score).label; }

/** Indonesian band label for a score (for the id-ID UI). */
export function scoreLabelId(score) { return scoreBandInfo(score).labelId; }

/* ── Feature 7 — Color semantics ──────────────────────────────────────── */

/** Color tones mapped to design tokens (NO hard-coded colors). Ordered high → low.
 *    90–100 → green (--ok) · 70–89 → blue (--info) · 50–69 → orange (--warn) · 0–49 → red (--danger) */
export const COLOR_BANDS = Object.freeze([
  { min: 90, tone: 'ok' },
  { min: 70, tone: 'info' },
  { min: 50, tone: 'warn' },
  { min: 0,  tone: 'danger' },
]);

/** Color tone token suffix for a score ('ok' | 'info' | 'warn' | 'danger').
 *  Maps onto the existing --ok / --info / --warn / --danger design tokens and the
 *  `*-pill--{tone}` CSS classes — never a hard-coded hex. */
export function scoreColor(score) {
  const s = clampScore(score);
  return (COLOR_BANDS.find((b) => s >= b.min) || COLOR_BANDS[COLOR_BANDS.length - 1]).tone;
}

/** The design-token CSS value for a score's color (e.g. 'var(--ok)'). */
export function scoreColorVar(score) { return `var(--${scoreColor(score)})`; }

/* ── Feature 2 / 3 — Capacity health score (normalized) ───────────────── */

/**
 * Normalize a capacity UTILIZATION percent (where higher = busier = worse) into
 * a capacity HEALTH score where higher = better:
 *   idle/available 0% → 100 · balanced 10% → 90 · busy 30% → 70 ·
 *   near overload 70% → 30 · overloaded 100% → 0.
 * The underlying capacity CALCULATION is unchanged — this only inverts the
 * interpretation (utilization stays available as its own raw metric).
 * @param {number} utilizationPercent 0–100
 * @returns {number} capacity health score 0–100 (higher = better)
 */
export function capacityScore(utilizationPercent) {
  return invertScore(utilizationPercent);
}
