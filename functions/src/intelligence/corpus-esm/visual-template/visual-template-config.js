/* ============================================================
   VISUAL-TEMPLATE-CONFIG.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: the single source of truth for every Visual Template tunable —
   the geometric tolerance / normalisation (§14) and the temporal-evidence
   windows (§9). Mirrors the frozen-DEFAULT + validated-ACTIVE pattern of
   src/intelligence/corpus/corpus-analysis-config.js.

   THE MASTER SWITCH: `enabled` defaults to FALSE and is ALSO gated by the
   Intelligence master flag (a caller ANDs the two). With it false the
   whole aggregation layer is inert.

   THE TOLERANCE (§14) — deterministic, configurable, documented, testable:
     • pageSizeTolerancePt — two page sizes within this many pdf-points are
       "the same size". Default 6 — the SAME tolerance
       src/intelligence/corpus/analysis/visual/deterministic-layout-analyzer.js
       already uses in paperName() (reused, not re-invented).
     • pageRelativeDecimals — every region is normalised to a page-relative
       fraction (0..1 of page width/height) and rounded to this many
       decimal places before comparison. Default 2 ⇒ a 1%-of-page grid.
       Coordinates are NEVER rounded in the stored template — only in the
       fingerprint used for grouping (§5).
     • minDocumentsForPattern — a visual pattern needs at least this many
       DISTINCT source documents before it is emitted as a candidate (§13).
     • minDocumentsForRecurrence — page-recurrence (header on every page,
       signature on the final page only, …) is inferred ONLY from at least
       this many multi-page documents; otherwise recurrence is `unknown`
       (§16).

   RESPONSIBILITY: DEFAULT_VISUAL_TEMPLATE_CONFIG, getVisualTemplateConfig(),
   setVisualTemplateConfig(partial) (validated merge),
   resetVisualTemplateConfig(), isVisualTemplateAnalysisEnabled().

   DEPENDENCIES: none. PURE — no DOM, no Firebase, no secret, no model.
   ============================================================ */

'use strict';

export const VISUAL_TEMPLATE_CONFIG_SCHEMA = 'visual-template-config@1';

export const DEFAULT_VISUAL_TEMPLATE_CONFIG = Object.freeze({
  /** Master switch for the aggregation layer. FALSE ⇒ inert. */
  enabled: false,

  geometryTolerance: Object.freeze({
    pageSizeTolerancePt: 6,       // matches deterministic-layout-analyzer.paperName()
    pageRelativeDecimals: 2,      // 1%-of-page grid for fingerprint grouping
    minDocumentsForPattern: 2,
    minDocumentsForRecurrence: 2,
  }),

  /* §9 — reuse the Phase 5.x.3 evidence windows. When BOTH boundary dates
     are null the temporal evidence on every candidate is
     `insufficient_evidence` / `unknown` — no chronology is guessed. */
  temporal: Object.freeze({
    historicalCutoff: null,
    currentWindowStart: null,
    transitionalOverlapDays: 0,
    minCurrentDocuments: 2,
    minHistoricalDocuments: 1,
  }),
});

function clone(cfg) {
  return {
    enabled: cfg.enabled === true,
    geometryTolerance: { ...cfg.geometryTolerance },
    temporal: { ...cfg.temporal },
  };
}

let _active = clone(DEFAULT_VISUAL_TEMPLATE_CONFIG);

export function getVisualTemplateConfig() {
  return _active;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function setVisualTemplateConfig(partial = {}) {
  const p = partial && typeof partial === 'object' ? partial : {};
  const next = clone(_active);
  if (typeof p.enabled === 'boolean') next.enabled = p.enabled;

  if (p.geometryTolerance && typeof p.geometryTolerance === 'object') {
    const g = p.geometryTolerance;
    if (Number.isFinite(Number(g.pageSizeTolerancePt)) && Number(g.pageSizeTolerancePt) >= 0) next.geometryTolerance.pageSizeTolerancePt = Number(g.pageSizeTolerancePt);
    if (Number.isInteger(Number(g.pageRelativeDecimals)) && Number(g.pageRelativeDecimals) >= 0 && Number(g.pageRelativeDecimals) <= 6) next.geometryTolerance.pageRelativeDecimals = Math.floor(Number(g.pageRelativeDecimals));
    if (Number.isInteger(Number(g.minDocumentsForPattern)) && Number(g.minDocumentsForPattern) >= 1) next.geometryTolerance.minDocumentsForPattern = Math.floor(Number(g.minDocumentsForPattern));
    if (Number.isInteger(Number(g.minDocumentsForRecurrence)) && Number(g.minDocumentsForRecurrence) >= 1) next.geometryTolerance.minDocumentsForRecurrence = Math.floor(Number(g.minDocumentsForRecurrence));
  }

  if (p.temporal && typeof p.temporal === 'object') {
    const t = p.temporal;
    if (t.historicalCutoff === null || (typeof t.historicalCutoff === 'string' && ISO_DATE.test(t.historicalCutoff))) next.temporal.historicalCutoff = t.historicalCutoff;
    if (t.currentWindowStart === null || (typeof t.currentWindowStart === 'string' && ISO_DATE.test(t.currentWindowStart))) next.temporal.currentWindowStart = t.currentWindowStart;
    if (Number.isFinite(Number(t.transitionalOverlapDays)) && Number(t.transitionalOverlapDays) >= 0) next.temporal.transitionalOverlapDays = Math.floor(Number(t.transitionalOverlapDays));
    if (Number.isInteger(Number(t.minCurrentDocuments)) && Number(t.minCurrentDocuments) >= 1) next.temporal.minCurrentDocuments = Math.floor(Number(t.minCurrentDocuments));
    if (Number.isInteger(Number(t.minHistoricalDocuments)) && Number(t.minHistoricalDocuments) >= 1) next.temporal.minHistoricalDocuments = Math.floor(Number(t.minHistoricalDocuments));
    if (next.temporal.historicalCutoff && next.temporal.currentWindowStart && next.temporal.currentWindowStart < next.temporal.historicalCutoff) {
      next.temporal.historicalCutoff = _active.temporal.historicalCutoff;
      next.temporal.currentWindowStart = _active.temporal.currentWindowStart;
    }
  }

  _active = next;
  return _active;
}

export function resetVisualTemplateConfig() {
  _active = clone(DEFAULT_VISUAL_TEMPLATE_CONFIG);
  return _active;
}

/** Whether the aggregation layer may run. `intelligenceEnabled` is the
 *  master flag the caller passes in (the two are ANDed — this module never
 *  reads a flag itself). */
export function isVisualTemplateAnalysisEnabled(intelligenceEnabled, cfg = _active) {
  return intelligenceEnabled === true && !!cfg && cfg.enabled === true;
}
