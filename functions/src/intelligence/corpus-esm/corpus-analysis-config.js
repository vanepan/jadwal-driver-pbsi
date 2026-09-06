/* ============================================================
   CORPUS-ANALYSIS-CONFIG.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: the single source of truth for every corpus-analysis tunable.
   Mirrors the frozen-DEFAULT + mutable-ACTIVE pattern of
   src/intelligence/config/intelligence-config.js.

   THE MASTER SWITCH: `enabled` defaults to FALSE and is ALSO gated by the
   Intelligence master flag (a caller ANDs the two). With it false the
   whole pipeline is inert.

   NO CHRONOLOGY IS ASSUMED: `eraCutoverDate` defaults to `null`. The era
   classifier only ever compares a document's OWN stated date against a
   cutover the operator explicitly configures — never against "now" (§7).

   Phase 5.x.3 adds the `temporal` block — the explicit evidence windows
   (historicalCutoff / currentWindowStart / transitional band + evidence
   thresholds) for the Historical-vs-Current interpretation layer. When
   BOTH boundary dates are unset the temporal layer returns `unknown` for
   every convention; nothing is guessed.

   RESPONSIBILITY: DEFAULT_CORPUS_ANALYSIS_CONFIG, getCorpusAnalysisConfig(),
   setCorpusAnalysisConfig(partial) (validated merge),
   resetCorpusAnalysisConfig(), isCorpusAnalysisEnabled().

   DEPENDENCIES: none. PURE — no DOM, no Firebase, no secret.
   ============================================================ */

'use strict';

// @2 — Phase 5.x.3 added the `temporal` block (evidence windows for the
// Historical-vs-Current interpretation layer). Additive only; every @1
// key keeps its meaning.
export const CORPUS_ANALYSIS_CONFIG_SCHEMA = 'corpus-analysis-config@2';

export const DEFAULT_CORPUS_ANALYSIS_CONFIG = Object.freeze({
  /** Master switch for the analysis pipeline. FALSE ⇒ inert. */
  enabled: false,
  /** Per-stage toggles. A false stage is SKIPPED (not failed). */
  stages: Object.freeze({
    textExtraction: true,
    structureExtraction: true,
    pageRender: false,       // needs a real renderer — off by default (§13, §14)
    visualAnalysis: false,   // needs a real analyzer — off by default (§14)
    classification: true,
    observations: true,
  }),
  /** Era cutover — null = no chronology assumed (§7). An ISO 'YYYY-MM-DD'
   *  string enables the era classifier's date comparison. */
  eraCutoverDate: null,
  /** ± window (days) around the cutover that reads as 'transitional'. */
  transitionalWindowDays: 120,
  /** A terminology phrase must occur at least this many times IN A
   *  DOCUMENT to be recorded (1 = record every occurrence). */
  terminologyMinOccurrence: 1,
  /** A cross-document group needs at least this many DISTINCT source
   *  documents before candidate-grouping.js may emit a `candidate`
   *  (still non-authoritative — §21). */
  candidateMinDocuments: 3,
  /** Hard cap on observations emitted per document (bound the write). */
  maxObservationsPerDocument: 200,

  /* ── Phase 5.x.3 — Historical-vs-Current evidence windows ──
     EXPLICIT, versionable, deterministic (§6). When BOTH boundary dates
     are null the temporal layer returns `unknown` for every convention —
     no chronology is guessed (§6, §15). If only `eraCutoverDate` (above)
     is set, the temporal layer derives both boundaries from it plus the
     `transitionalOverlapDays` band. */
  temporal: Object.freeze({
    /** ISO 'YYYY-MM-DD'. A document dated strictly BEFORE this is
     *  historical evidence. null = unset. */
    historicalCutoff: null,
    /** ISO 'YYYY-MM-DD'. A document dated ON or AFTER this is current
     *  evidence. null = unset. Must be >= historicalCutoff when both set;
     *  the span between them (if any) is the transitional band. */
    currentWindowStart: null,
    /** Extra days added to each side of the transitional band. */
    transitionalOverlapDays: 0,
    /** Distinct CURRENT-window documents required before a convention may
     *  be called `current_evidence`. Frequency alone is never enough
     *  (§9) — this is a floor, not the whole test. */
    minCurrentDocuments: 2,
    /** Distinct HISTORICAL-window documents required before a convention
     *  may be called `historical_only`. */
    minHistoricalDocuments: 1,
    /** Within the current window, if a COMPETING convention (same
     *  category+key, different observed value) holds at least this share
     *  of the current-window documents, the pair is `conflicting`
     *  rather than either being called current. */
    conflictMinorityRatio: 0.34,
  }),
});

function clone(cfg) {
  return {
    enabled: cfg.enabled === true,
    stages: { ...cfg.stages },
    eraCutoverDate: cfg.eraCutoverDate,
    transitionalWindowDays: cfg.transitionalWindowDays,
    terminologyMinOccurrence: cfg.terminologyMinOccurrence,
    candidateMinDocuments: cfg.candidateMinDocuments,
    maxObservationsPerDocument: cfg.maxObservationsPerDocument,
    temporal: { ...cfg.temporal },
  };
}

let _active = clone(DEFAULT_CORPUS_ANALYSIS_CONFIG);

export function getCorpusAnalysisConfig() {
  return _active;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function setCorpusAnalysisConfig(partial = {}) {
  const next = clone(_active);
  if (typeof partial.enabled === 'boolean') next.enabled = partial.enabled;
  if (partial.stages && typeof partial.stages === 'object') {
    for (const k of Object.keys(next.stages)) {
      if (typeof partial.stages[k] === 'boolean') next.stages[k] = partial.stages[k];
    }
  }
  if (partial.eraCutoverDate === null || (typeof partial.eraCutoverDate === 'string' && ISO_DATE.test(partial.eraCutoverDate))) {
    next.eraCutoverDate = partial.eraCutoverDate;
  }
  if (Number.isFinite(Number(partial.transitionalWindowDays)) && Number(partial.transitionalWindowDays) >= 0) {
    next.transitionalWindowDays = Math.floor(Number(partial.transitionalWindowDays));
  }
  if (Number.isFinite(Number(partial.terminologyMinOccurrence)) && Number(partial.terminologyMinOccurrence) >= 1) {
    next.terminologyMinOccurrence = Math.floor(Number(partial.terminologyMinOccurrence));
  }
  if (Number.isFinite(Number(partial.candidateMinDocuments)) && Number(partial.candidateMinDocuments) >= 2) {
    next.candidateMinDocuments = Math.floor(Number(partial.candidateMinDocuments));
  }
  if (Number.isFinite(Number(partial.maxObservationsPerDocument)) && Number(partial.maxObservationsPerDocument) >= 1) {
    next.maxObservationsPerDocument = Math.floor(Number(partial.maxObservationsPerDocument));
  }
  if (partial.temporal && typeof partial.temporal === 'object') {
    const t = partial.temporal;
    if (t.historicalCutoff === null || (typeof t.historicalCutoff === 'string' && ISO_DATE.test(t.historicalCutoff))) {
      next.temporal.historicalCutoff = t.historicalCutoff;
    }
    if (t.currentWindowStart === null || (typeof t.currentWindowStart === 'string' && ISO_DATE.test(t.currentWindowStart))) {
      next.temporal.currentWindowStart = t.currentWindowStart;
    }
    if (Number.isFinite(Number(t.transitionalOverlapDays)) && Number(t.transitionalOverlapDays) >= 0) {
      next.temporal.transitionalOverlapDays = Math.floor(Number(t.transitionalOverlapDays));
    }
    if (Number.isInteger(Number(t.minCurrentDocuments)) && Number(t.minCurrentDocuments) >= 1) {
      next.temporal.minCurrentDocuments = Math.floor(Number(t.minCurrentDocuments));
    }
    if (Number.isInteger(Number(t.minHistoricalDocuments)) && Number(t.minHistoricalDocuments) >= 1) {
      next.temporal.minHistoricalDocuments = Math.floor(Number(t.minHistoricalDocuments));
    }
    if (Number.isFinite(Number(t.conflictMinorityRatio)) && Number(t.conflictMinorityRatio) > 0 && Number(t.conflictMinorityRatio) <= 1) {
      next.temporal.conflictMinorityRatio = Number(t.conflictMinorityRatio);
    }
    // a nonsensical ordering (current before historical) is rejected wholesale
    if (next.temporal.historicalCutoff && next.temporal.currentWindowStart
      && next.temporal.currentWindowStart < next.temporal.historicalCutoff) {
      next.temporal.historicalCutoff = _active.temporal.historicalCutoff;
      next.temporal.currentWindowStart = _active.temporal.currentWindowStart;
    }
  }
  _active = next;
  return _active;
}

export function resetCorpusAnalysisConfig() {
  _active = clone(DEFAULT_CORPUS_ANALYSIS_CONFIG);
  return _active;
}

/** Whether the pipeline may run. `intelligenceEnabled` is the master flag
 *  the caller passes in (the two are ANDed — this module never reads a
 *  flag itself). */
export function isCorpusAnalysisEnabled(intelligenceEnabled, cfg = _active) {
  return intelligenceEnabled === true && !!cfg && cfg.enabled === true;
}
