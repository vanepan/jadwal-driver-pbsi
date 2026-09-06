/* ============================================================
   MODULE-LOADER-REGISTRY.JS — v1.20.9 Native Runtime Excellence

   One dynamic import() per heavy, role-exclusive module that used to be a
   static top-level import in js/app.js (parsed/evaluated on every boot
   regardless of role). Each loader is memoized in `_moduleCache` so the
   underlying import() only ever fires once per session and every caller
   shares the same in-flight/resolved promise — the exact Map-cache idiom
   already proven by js/workspace/widget-registry.js's GROUP_LOADERS/
   loadGroup() and js/exports/export-registry.js's ensureExportModulesLoaded().

   This registry only describes *how* to load each module. It owns no
   business logic, no call sites, no role/workspace gating — callers in
   app.js decide *when* to call these (on entering the owning admin section,
   or in the background once Home needs them).
   ============================================================ */

'use strict';

const _moduleCache = new Map();

/** @returns {Promise<any>} the (memoized) resolved module namespace. */
function loadModule(key, importer) {
  if (!_moduleCache.has(key)) {
    _moduleCache.set(key, importer());
  }
  return _moduleCache.get(key);
}

/* ── Vehicle Management → Prediction view (v1.19.5) ── */
export const loadVehiclePrediction = () =>
  loadModule('vehicle-prediction', () => import('../components/vehicle-prediction-dashboard.js'));
export const loadSimulationPanel = () =>
  loadModule('simulation-panel', () => import('../analytics/simulation-panel.js'));

/* ── Analytics module (admin-only) ── */
export const loadDriverWellnessDashboard = () =>
  loadModule('driver-wellness-dashboard', () => import('../components/driver-wellness-dashboard.js'));
export const loadDispatchAnalyticsEngine = () =>
  loadModule('dispatch-analytics-engine', () => import('../analytics/dispatch-analytics-engine.js'));
export const loadPettyCashAnalytics = () =>
  loadModule('petty-cash-analytics', () => import('../analytics/petty-cash-analytics.js'));
export const loadExecutiveAnalytics = () =>
  loadModule('executive-analytics', () => import('../analytics/executive-analytics.js'));
export const loadPredictionService = () =>
  loadModule('prediction-service', () => import('../services/prediction-service.js'));
export const loadDriverPredictionDashboard = () =>
  loadModule('driver-prediction-dashboard', () => import('../components/driver-prediction-dashboard.js'));
export const loadExecutiveDashboard = () =>
  loadModule('executive-dashboard', () => import('../components/executive-dashboard.js'));
export const loadPettyCashAnalyticsView = () =>
  loadModule('petty-cash-analytics-view', () => import('../analytics/views/analytics-petty-cash-view.js'));
export const loadExecutiveAnalyticsView = () =>
  loadModule('executive-analytics-view', () => import('../analytics/views/analytics-executive-view.js'));

/* ── Sarpras Intelligence (V2.0.10) — gated to a single pilot identity via
   isV2Enabled() (js/config/feature-gates.js), so it must never be a static
   top-level import: every other user's session should never fetch it. ── */
export const loadSarprasIntelligence = () =>
  loadModule('sarpras-intelligence', () => import('../../src/ui/sarpras-intelligence-center.js'));

/* ── Sarpras Intelligence — V2 Phase 2F client backend wiring. Registers the
   deployed callable conversation backend + the OpenAI provider adapter into
   the ESM src/intelligence/ layer. Same pilot gate + same "never a static
   import" reasoning as loadSarprasIntelligence above. Registration only;
   NOT UI, and it never enables the feature flag or calls OpenAI. ── */
export const loadIntelligenceBackendWiring = () =>
  loadModule('intelligence-backend-wiring', () => import('../intelligence-backend-wiring.js'));

/* ── Sarpras Intelligence — V2 Phase 3B minimal console UI. The first
   user-facing surface (input → needs_input → review). Same pilot gate as
   loadSarprasIntelligence above, and additionally only reached when the
   synced /feature_flags/intelligence/enabled flag is ON — so with the flag
   OFF (production default) this is never fetched. ── */
export const loadIntelligenceConsole = () =>
  loadModule('intelligence-console', () => import('../intelligence-console.js'));

/* ── Sarpras Intelligence — V2 Phase 5.x.8 Human Curation Workspace (Style
   Rules / Visual Templates review + the human-gated approve / reject /
   deprecate / supersede lifecycle). Same pilot + flag-ON gate as
   loadIntelligenceConsole; never fetched in production (flag OFF). ── */
export const loadIntelligenceCurationConsole = () =>
  loadModule('intelligence-curation-console', () => import('../intelligence-curation-console.js'));

/* ── Sarpras Intelligence — V2 Phase C3 Corpus & Authority operator
   workspace (source → ingest → deterministic analysis → observations /
   Writing Memory → Style Guide / Visual Template PROPOSALS). Proposal-only;
   approval lives in the Curation workspace. Same pilot + flag-ON gate;
   never fetched in production (flag OFF). No OpenAI. ── */
export const loadIntelligenceCorpusConsole = () =>
  loadModule('intelligence-corpus-console', () => import('../intelligence-corpus-console.js'));
