/* ============================================================
   PREDICTION-SERVICE.JS — Hybrid Prediction Architecture (v1.19.3)

   The SINGLE certified gateway to the platform's prediction layer. Every future
   dashboard and module (Prediction UI, Executive Analytics, Operational
   Forecast, Executive Narrative, Early Warning Center) consumes predictions
   ONLY through this service — never buildPredictionModel() or
   validatePredictionModel() directly.

   ── WHAT THIS SERVICE IS ─────────────────────────────────────────────────────
   A PURE orchestration layer that composes a PREDICTION PROVIDER and the
   validator into one contract:
       1. BUILD      → activeProvider.predict(input, config)  [RuleProvider by default]
       2. VALIDATE   → prediction-validator.validatePredictionModel(model)
       3. CERTIFY    → expose a model ONLY when validation reports zero errors
       4. DESCRIBE   → attach service metadata (engine/validator versions,
                       coverage, confidence, certification)
       5. RETURN     → one immutable, deep-frozen PredictionResult

   ── HYBRID (v1.19.3): the service no longer depends on an engine ─────────────
   BUILD is delegated to whichever provider is active in the provider registry
   (js/prediction/prediction-provider.js). The default active provider is the
   RuleProvider, which wraps the v1.19.0 JavaScript engine — so runtime is
   byte-identical to v1.19.2. A future Python provider can be activated with
   setActiveProvider('python') and this service, its cache, certification, and
   metadata all work unchanged, because certification is applied uniformly to
   whatever model a provider returns. The service imports NOTHING from the
   engine — only from the provider layer and the validator.

   It is the ONLY certification gate. If validation fails, the service NEVER
   exposes a certified model — getPrediction() returns the report + a structured
   error with model:null, and getCertifiedPrediction() returns null.

   ── WHAT THIS SERVICE IS NOT ─────────────────────────────────────────────────
   It is NOT UI, and it invents NO prediction logic, NO scoring, NO new metric.
   It adds ZERO business rules on top of the engines — it only orchestrates,
   certifies, caches, and describes. The prediction values are 100% the engine's.

   ── FOUNDATION CONTRACT (v1.19 non-negotiables) ─────────────────────────────
     • PURE — no window, document, DOM, Firebase, localStorage, sessionStorage,
       network, timers. Every input is passed in. (The in-memory cache is a
       plain Map in module/instance scope — no browser storage, no persistence.)
     • DETERMINISTIC — no Math.random. Same input ⇒ byte-identical result. (Pass
       `input.now` for a deterministic model, exactly like the engine.)
     • IMMUTABLE — every returned PredictionResult is deep-frozen; a cache hit
       returns the SAME frozen reference.
     • PREDICTABLE FAILURE — never throws a browser error to the caller; every
       failure is a structured result { ok:false, error:{ code, message } }.
     • NODE-TESTABLE — see scripts/prediction-service-check.mjs.
   ============================================================ */

'use strict';

// The service depends on the PROVIDER LAYER (never the engine directly). The
// provider module re-exports the shared classification contract (PREDICTION_SCHEMA
// as a fallback identity, confidenceBand) so the service still treats them as
// provider-supplied, not engine-supplied.
import {
  getActiveProvider,
  PROVIDER_ERRORS,
  PREDICTION_SCHEMA,
  confidenceBand,
} from '../prediction/prediction-provider.js';
import {
  validatePredictionModel,
  VALIDATION_SCHEMA,
} from '../engines/prediction-validator.js';

/* ── identity ───────────────────────────────────────────────────────────────── */

export const SERVICE_SCHEMA = 'prediction-service@1';

/** Structured error codes — a closed set so callers can switch on them. */
export const SERVICE_ERRORS = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',     // input/config was a non-object primitive
  BUILD_FAILED: 'BUILD_FAILED',       // the provider failed to build a model
  VALIDATE_FAILED: 'VALIDATE_FAILED', // the validator threw while inspecting
  NOT_CERTIFIED: 'NOT_CERTIFIED',     // model built + validated but has ≥1 error
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', // the active provider is a stub (e.g. python)
  PROVIDER_ERROR: 'PROVIDER_ERROR',   // any other provider-reported build failure
});

/* ── tiny pure helpers ──────────────────────────────────────────────────────── */

function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isNullish(v) { return v === undefined || v === null; }

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return obj;
}

/**
 * A deterministic, key-sorted serialization used ONLY as the cache key. Sorting
 * keys makes the cache insensitive to input property order (two structurally
 * equal inputs share one cache entry), which is what "cache invalidates only
 * when input changes" means. Dates serialize to their ISO string (mirroring how
 * the engine reads `now`), so the key tracks the real reference time.
 */
function stableKey(v) {
  if (v === undefined) return 'u';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map(stableKey).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableKey(v[k])).join(',') + '}';
}

/* ── metadata assembly ──────────────────────────────────────────────────────── */

/**
 * Build the service metadata for a validated model. Adds NO prediction logic —
 * it only summarizes what the engine + validator already produced:
 *   • version identity of the engine, validator, and service,
 *   • certification verdict,
 *   • predictionCoverage — which platform modules reported data (+ how many of
 *     the collected predictions individually certified),
 *   • predictionConfidence — the executive evidence-coverage score + band.
 */
function buildMetadata(model, report, engineVersion = PREDICTION_SCHEMA) {
  const coverage = isObj(model) && isObj(model.coverage) ? model.coverage : {};
  const modules = {
    drivers: coverage.drivers === true,
    vehicles: coverage.vehicles === true,
    dispatch: coverage.dispatch === true,
    finance: coverage.finance === true,
  };
  const moduleKeys = Object.keys(modules);
  const modulesCovered = moduleKeys.filter((k) => modules[k]).length;

  const counts = isObj(report) && isObj(report.counts) ? report.counts : {};
  const totalPredictions = Number.isFinite(counts.predictions) ? counts.predictions : 0;
  const certifiedPredictions = Number.isFinite(counts.certifiedPredictions) ? counts.certifiedPredictions : 0;

  const execConfidence = isObj(model) && isObj(model.executive) && Number.isFinite(model.executive.confidence)
    ? model.executive.confidence : 0;

  return deepFreeze({
    schema: SERVICE_SCHEMA,
    engineVersion,
    validatorVersion: VALIDATION_SCHEMA,
    generatedAt: isObj(model) && typeof model.generatedAt === 'string' ? model.generatedAt : null,
    deterministic: isObj(model) ? model.deterministic === true : false,
    certified: isObj(report) ? report.certified === true : false,
    predictionCoverage: {
      modules,
      modulesCovered,
      moduleCount: moduleKeys.length,
      pct: moduleKeys.length ? Math.round((modulesCovered / moduleKeys.length) * 100) : 0,
      predictions: totalPredictions,
      certifiedPredictions,
    },
    predictionConfidence: {
      score: execConfidence,
      level: confidenceBand(execConfidence).key,
    },
    counts: {
      predictions: totalPredictions,
      certifiedPredictions,
      recommendations: Number.isFinite(counts.recommendations) ? counts.recommendations : 0,
      errors: Number.isFinite(counts.errors) ? counts.errors : 0,
      warnings: Number.isFinite(counts.warnings) ? counts.warnings : 0,
    },
  });
}

/** A minimal metadata block for a failure that never produced a model. */
function failureMetadata(engineVersion = PREDICTION_SCHEMA) {
  return deepFreeze({
    schema: SERVICE_SCHEMA,
    engineVersion,
    validatorVersion: VALIDATION_SCHEMA,
    generatedAt: null,
    deterministic: false,
    certified: false,
    predictionCoverage: {
      modules: { drivers: false, vehicles: false, dispatch: false, finance: false },
      modulesCovered: 0, moduleCount: 4, pct: 0, predictions: 0, certifiedPredictions: 0,
    },
    predictionConfidence: { score: 0, level: confidenceBand(0).key },
    counts: { predictions: 0, certifiedPredictions: 0, recommendations: 0, errors: 0, warnings: 0 },
  });
}

/* ── result assembly ────────────────────────────────────────────────────────── */

/**
 * A PredictionResult is the ONE shape every consumer receives:
 *   { ok, certified, metadata, model, validation, error }
 *
 *   • model      — the CERTIFIED, deep-frozen PredictionModel, or null when the
 *                  model could not be certified (the certification gate).
 *   • validation — the full validator report (null only when the model could
 *                  not be built/validated at all), so a caller can always see WHY.
 *   • error      — a structured { code, message } on failure, else null.
 */
function successResult(model, report, engineVersion) {
  return deepFreeze({
    ok: true,
    certified: true,
    metadata: buildMetadata(model, report, engineVersion),
    model,               // already deep-frozen by the engine
    validation: report,  // already deep-frozen by the validator
    error: null,
  });
}

function rejectedResult(model, report, engineVersion) {
  // Built + validated, but NOT certified → the model is withheld (never exposed
  // as certified). The report is returned so the caller can inspect the errors.
  const firstError = isObj(report) && Array.isArray(report.errors) && report.errors.length
    ? report.errors[0] : null;
  return deepFreeze({
    ok: false,
    certified: false,
    metadata: buildMetadata(model, report, engineVersion),
    model: null,
    validation: report,
    error: {
      code: SERVICE_ERRORS.NOT_CERTIFIED,
      message: firstError
        ? `Prediction model failed certification: ${firstError.code} at ${firstError.path}`
        : 'Prediction model failed certification.',
    },
  });
}

function errorResult(code, message, report = null, engineVersion = PREDICTION_SCHEMA) {
  return deepFreeze({
    ok: false,
    certified: false,
    metadata: failureMetadata(engineVersion),
    model: null,
    validation: report,
    error: { code, message },
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   THE SERVICE — a factory so callers can hold isolated caches (and tests can
   exercise cache behaviour deterministically). A default singleton is exported
   for the common case.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} [options]
 * @param {number} [options.maxCacheEntries=64]  In-memory LRU cap. Set 0 to disable caching.
 * @param {Object} [options.config]              Default engine threshold overrides for every call.
 */
export function createPredictionService(options = {}) {
  const maxCacheEntries = Number.isFinite(options.maxCacheEntries) ? Math.max(0, options.maxCacheEntries) : 64;
  const defaultConfig = isObj(options.config) ? options.config : {};
  // Insertion-ordered Map → cheap LRU (delete+set on hit moves to newest).
  const cache = new Map();

  // Non-object primitives are a predictable INVALID_INPUT (nullish is allowed and
  // treated as an empty model, like the engine). Returned as a structured error,
  // checked BEFORE the cache so an invalid arg can never masquerade as a hit.
  function guardInput(input, config) {
    if (!isNullish(input) && !isObj(input)) {
      return errorResult(SERVICE_ERRORS.INVALID_INPUT, 'input must be an object (or omitted).');
    }
    if (!isNullish(config) && !isObj(config)) {
      return errorResult(SERVICE_ERRORS.INVALID_INPUT, 'config must be an object (or omitted).');
    }
    return null;
  }

  // Map a provider-reported build failure to a service error code (closed set).
  function providerErrorCode(providerCode) {
    if (providerCode === PROVIDER_ERRORS.NOT_IMPLEMENTED) return SERVICE_ERRORS.NOT_IMPLEMENTED;
    if (providerCode === PROVIDER_ERRORS.BUILD_FAILED) return SERVICE_ERRORS.BUILD_FAILED;
    return SERVICE_ERRORS.PROVIDER_ERROR;
  }

  function compute(input, config) {
    const src = isObj(input) ? input : {};
    const cfg = { ...defaultConfig, ...(isObj(config) ? config : {}) };

    // 1) Resolve the active provider (RuleProvider by default).
    const provider = getActiveProvider();
    const providerVersion = provider && provider.version ? provider.version : PREDICTION_SCHEMA;

    // 2) BUILD — delegated to the provider. The provider contract says predict()
    //    never throws, but we still guard so a misbehaving provider can't escape.
    let built;
    try {
      built = provider.predict(src, cfg);
    } catch (e) {
      return errorResult(
        SERVICE_ERRORS.PROVIDER_ERROR,
        `Prediction provider "${provider && provider.id ? provider.id : 'unknown'}" threw: ${e && e.message ? e.message : e}`,
        null, providerVersion,
      );
    }
    if (!built || built.ok !== true || !isObj(built.model)) {
      const perr = built && isObj(built.error) ? built.error : { code: SERVICE_ERRORS.PROVIDER_ERROR, message: 'Provider returned no model.' };
      const version = built && built.engineVersion ? built.engineVersion : providerVersion;
      return errorResult(providerErrorCode(perr.code), perr.message, null, version);
    }
    const model = built.model;
    const engineVersion = built.engineVersion || providerVersion;

    // 3) VALIDATE (the validator is the service's own certification tool).
    let report;
    try {
      report = validatePredictionModel(model);
    } catch (e) {
      return errorResult(SERVICE_ERRORS.VALIDATE_FAILED, `Prediction validator failed: ${e && e.message ? e.message : e}`, null, engineVersion);
    }

    // 4) CERTIFY — the single gate. Only a zero-error report exposes a model.
    return report && report.certified
      ? successResult(model, report, engineVersion)
      : rejectedResult(model, report, engineVersion);
  }

  function cacheGet(key) {
    if (!cache.has(key)) return undefined;
    const val = cache.get(key);
    cache.delete(key); cache.set(key, val); // refresh recency
    return val;
  }
  function cacheSet(key, val) {
    if (maxCacheEntries === 0) return;
    cache.set(key, val);
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value); // evict oldest
  }

  /**
   * getPrediction(input, config?) → PredictionResult (never throws).
   * Cached: an identical (structurally-equal) input+config returns the SAME
   * frozen result reference; any change to input invalidates the entry.
   */
  function getPrediction(input, config) {
    const invalid = guardInput(input, config);
    if (invalid) return invalid;
    // The cache key is scoped to the ACTIVE provider so switching providers can
    // never return another provider's cached result for the same input.
    const activeProvider = getActiveProvider();
    const providerId = activeProvider && activeProvider.id ? activeProvider.id : 'unknown';
    const key = maxCacheEntries === 0 ? null : providerId + '¦' + stableKey(input) + '§' + stableKey({ ...defaultConfig, ...(isObj(config) ? config : {}) });
    if (key !== null) {
      const hit = cacheGet(key);
      if (hit !== undefined) return hit;
    }
    const result = compute(input, config);
    if (key !== null) cacheSet(key, result);
    return result;
  }

  /**
   * getCertifiedPrediction(input, config?) → the certified, deep-frozen
   * PredictionModel, or null when certification fails. NEVER throws. This is the
   * strict accessor for consumers that only ever want a trustworthy model.
   */
  function getCertifiedPrediction(input, config) {
    const result = getPrediction(input, config);
    return result.ok ? result.model : null;
  }

  /** Boolean certification check for an input (convenience over getPrediction). */
  function isCertified(input, config) {
    return getPrediction(input, config).ok === true;
  }

  /** The service metadata for an input (always available, even on failure). */
  function getMetadata(input, config) {
    return getPrediction(input, config).metadata;
  }

  /** Drop all cached results (e.g. when upstream module data is known to change). */
  function clearCache() { cache.clear(); }

  /** Introspection for tests / diagnostics — never part of a PredictionResult. */
  function cacheStats() {
    return Object.freeze({ size: cache.size, maxEntries: maxCacheEntries, enabled: maxCacheEntries > 0 });
  }

  return Object.freeze({
    schema: SERVICE_SCHEMA,
    getPrediction,
    getCertifiedPrediction,
    isCertified,
    getMetadata,
    clearCache,
    cacheStats,
  });
}

/* ── default singleton + thin functional facade ─────────────────────────────── */

export const predictionService = createPredictionService();

export function getPrediction(input, config) { return predictionService.getPrediction(input, config); }
export function getCertifiedPrediction(input, config) { return predictionService.getCertifiedPrediction(input, config); }
export function isCertified(input, config) { return predictionService.isCertified(input, config); }
export function getPredictionMetadata(input, config) { return predictionService.getMetadata(input, config); }

export default predictionService;
