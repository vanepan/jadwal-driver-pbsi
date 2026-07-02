/* ============================================================
   PREDICTION-VALIDATOR.JS — Prediction Validation & Explainability (v1.19.1)

   Certifies that every prediction produced by prediction-engine.js is
   consistent, explainable, and auditable BEFORE any dashboard consumes it.
   This sprint builds NO UI — it proves the engine's output is trustworthy.

   ── THE EXPLAINABILITY CONTRACT ─────────────────────────────────────────────
   Every prediction MUST answer "WHY?". No prediction may exist without an
   explanation. Concretely, each prediction object must carry:

       score            0–100 number
       level            a known band (risk: LOW…CRITICAL / quality: EXCELLENT…CRITICAL)
       confidence       0–100 number  (evidence coverage, never random)
       confidenceLevel  LOW / MEDIUM / HIGH
       reasons[]        ≥1 user-facing sentence (WHY, for operational users)
       signals[]        internal evidence { id, value, weight } (auditable)
       summary          one operational sentence

   ── VALIDATION RULES ────────────────────────────────────────────────────────
   ERRORS block certification:
     • a missing/invalid required field (wrong type, score/confidence out of
       0–100, unknown level, unknown confidenceLevel),
     • reasons empty  → "no prediction without reasons",
     • a CONFIDENT prediction (confidenceLevel ≠ LOW) with NO signals →
       "no prediction without evidence" (a claim you cannot audit is invalid),
     • a malformed signal ({ id, value, weight } missing/invalid).
   WARNINGS flag consistency concerns but do NOT block certification:
     • HIGH/CRITICAL risk asserted on LOW confidence (strong claim, thin
       evidence) — allowed only because the reasons still explain it,
     • confidenceLevel that disagrees with the numeric confidence band,
     • an empty-signals prediction at LOW confidence (a genuine insufficient-
       data state — safe to render as "belum cukup data").

   A model is CERTIFIED READY FOR UI when it has ZERO errors.

   PURE: no DOM, no Firebase, no browser APIs, no randomness. Deterministic and
   node-testable (scripts/prediction-validator-check.mjs). The engine models are
   READ-ONLY here — the validator never mutates what it inspects, and its report
   is deep-frozen.
   ============================================================ */

'use strict';

import {
  RISK_LEVELS,
  QUALITY_LEVELS,
  CONFIDENCE_LEVELS,
  confidenceBand,
  PREDICTION_SCHEMA,
} from './prediction-engine.js';

export const VALIDATION_SCHEMA = 'prediction-validation@1';

/* ── the contract, as data (single source for the rules) ────────────────────── */

export const PREDICTION_CONTRACT = Object.freeze({
  requiredFields: Object.freeze(['score', 'level', 'confidence', 'confidenceLevel', 'reasons', 'signals', 'summary']),
  riskLevels: Object.freeze(RISK_LEVELS.map((l) => l.key)),
  qualityLevels: Object.freeze(QUALITY_LEVELS.map((l) => l.key)),
  confidenceLevels: Object.freeze(CONFIDENCE_LEVELS.map((l) => l.key)),
  signalFields: Object.freeze(['id', 'value', 'weight']),
});

const ALL_LEVELS = new Set([...PREDICTION_CONTRACT.riskLevels, ...PREDICTION_CONTRACT.qualityLevels]);
const CONFIDENCE_SET = new Set(PREDICTION_CONTRACT.confidenceLevels);

/* ── tiny pure helpers ──────────────────────────────────────────────────────── */

function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function isArr(v) { return Array.isArray(v); }
function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function inRange(v, lo, hi) { return isFiniteNum(v) && v >= lo && v <= hi; }
function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return obj;
}

/**
 * Does this node look like a Prediction (vs. a warning / signal / recommendation)?
 * Every engine prediction is tagged `kind: 'risk' | 'quality'` — that tag is the
 * precise discriminator (warnings/opportunities also carry score+level+reasons
 * but are NOT predictions and have no `kind`).
 */
export function isPredictionNode(node) {
  return isObj(node) && (node.kind === 'risk' || node.kind === 'quality');
}

/* ── signal validation ──────────────────────────────────────────────────────── */

function validateSignal(sig, path, errors, warnings) {
  if (!isObj(sig)) { errors.push({ path, code: 'SIGNAL_NOT_OBJECT', message: 'Signal is not an object' }); return; }
  if (!isNonEmptyStr(sig.id)) errors.push({ path: `${path}.id`, code: 'SIGNAL_ID', message: 'Signal id must be a non-empty string' });
  if (!inRange(sig.value, 0, 100)) errors.push({ path: `${path}.value`, code: 'SIGNAL_VALUE', message: 'Signal value must be a number 0–100' });
  if (!isFiniteNum(sig.weight)) errors.push({ path: `${path}.weight`, code: 'SIGNAL_WEIGHT', message: 'Signal weight must be a finite number' });
  else if (sig.weight < 0 || sig.weight > 100) warnings.push({ path: `${path}.weight`, code: 'SIGNAL_WEIGHT_RANGE', message: 'Signal weight outside 0–100' });
}

/* ── prediction validation ──────────────────────────────────────────────────── */

/**
 * Validate ONE prediction against the explainability contract.
 * @returns {Readonly<{path, kind, valid, errors, warnings}>}
 */
export function validatePrediction(pred, path = 'prediction') {
  const errors = [];
  const warnings = [];

  if (!isObj(pred)) {
    return deepFreeze({ path, kind: null, valid: false,
      errors: [{ path, code: 'NOT_OBJECT', message: 'Prediction is not an object' }], warnings: [] });
  }

  // Required fields present at all?
  for (const f of PREDICTION_CONTRACT.requiredFields) {
    if (!(f in pred)) errors.push({ path: `${path}.${f}`, code: 'MISSING_FIELD', message: `Missing required field "${f}"` });
  }

  const kind = pred.kind === 'quality' ? 'quality' : (pred.kind === 'risk' ? 'risk' : null);

  // score
  if (!inRange(pred.score, 0, 100)) errors.push({ path: `${path}.score`, code: 'SCORE_RANGE', message: 'score must be a number 0–100' });

  // level (kind-aware; union when kind is absent)
  if (typeof pred.level !== 'string' || !ALL_LEVELS.has(pred.level)) {
    errors.push({ path: `${path}.level`, code: 'LEVEL_UNKNOWN', message: `level "${pred.level}" is not a known band` });
  } else if (kind === 'risk' && !PREDICTION_CONTRACT.riskLevels.includes(pred.level)) {
    errors.push({ path: `${path}.level`, code: 'LEVEL_KIND', message: `risk prediction has non-risk level "${pred.level}"` });
  } else if (kind === 'quality' && !PREDICTION_CONTRACT.qualityLevels.includes(pred.level)) {
    errors.push({ path: `${path}.level`, code: 'LEVEL_KIND', message: `quality prediction has non-quality level "${pred.level}"` });
  }

  // confidence + band
  if (!inRange(pred.confidence, 0, 100)) errors.push({ path: `${path}.confidence`, code: 'CONFIDENCE_RANGE', message: 'confidence must be a number 0–100' });
  if (typeof pred.confidenceLevel !== 'string' || !CONFIDENCE_SET.has(pred.confidenceLevel)) {
    errors.push({ path: `${path}.confidenceLevel`, code: 'CONFIDENCE_LEVEL_UNKNOWN', message: `confidenceLevel "${pred.confidenceLevel}" is not LOW/MEDIUM/HIGH` });
  } else if (isFiniteNum(pred.confidence) && confidenceBand(pred.confidence).key !== pred.confidenceLevel) {
    warnings.push({ path: `${path}.confidenceLevel`, code: 'CONFIDENCE_BAND_MISMATCH',
      message: `confidenceLevel ${pred.confidenceLevel} disagrees with confidence ${pred.confidence} (band ${confidenceBand(pred.confidence).key})` });
  }

  // reasons — no prediction without a reason
  if (!isArr(pred.reasons) || pred.reasons.length === 0) {
    errors.push({ path: `${path}.reasons`, code: 'REASONS_EMPTY', message: 'reasons must be a non-empty array (no prediction without a reason)' });
  } else if (!pred.reasons.every(isNonEmptyStr)) {
    errors.push({ path: `${path}.reasons`, code: 'REASONS_INVALID', message: 'every reason must be a non-empty string' });
  }

  // signals — no CONFIDENT prediction without evidence
  if (!isArr(pred.signals)) {
    errors.push({ path: `${path}.signals`, code: 'SIGNALS_NOT_ARRAY', message: 'signals must be an array' });
  } else {
    pred.signals.forEach((s, i) => validateSignal(s, `${path}.signals[${i}]`, errors, warnings));
    if (pred.signals.length === 0) {
      if (pred.confidenceLevel !== 'LOW') {
        errors.push({ path: `${path}.signals`, code: 'SIGNALS_EMPTY_CONFIDENT',
          message: 'a prediction with confidence above LOW must expose ≥1 signal (evidence)' });
      } else {
        warnings.push({ path: `${path}.signals`, code: 'SIGNALS_EMPTY_LOWDATA',
          message: 'no contributing signals — treated as an insufficient-data prediction' });
      }
    }
  }

  // summary — every prediction gets one operational sentence
  if (!isNonEmptyStr(pred.summary)) errors.push({ path: `${path}.summary`, code: 'SUMMARY_EMPTY', message: 'summary must be a non-empty string' });

  // consistency — HIGH/CRITICAL risk on LOW confidence (allowed, but flagged)
  if (kind === 'risk' && (pred.level === 'HIGH' || pred.level === 'CRITICAL') && pred.confidenceLevel === 'LOW') {
    warnings.push({ path, code: 'HIGH_RISK_LOW_CONFIDENCE',
      message: `${pred.level} risk asserted on LOW confidence — verify the ${isArr(pred.reasons) ? pred.reasons.length : 0} reason(s) justify it` });
  }

  return deepFreeze({ path, kind, valid: errors.length === 0, errors, warnings });
}

/* ── recommendation validation (lightweight — not a prediction) ─────────────── */

function validateRecommendation(rec, path, errors, warnings) {
  if (!isObj(rec)) { errors.push({ path, code: 'REC_NOT_OBJECT', message: 'Recommendation is not an object' }); return; }
  if (!isNonEmptyStr(rec.message)) errors.push({ path: `${path}.message`, code: 'REC_MESSAGE', message: 'Recommendation needs a message' });
  if (typeof rec.level !== 'string' || !ALL_LEVELS.has(rec.level)) errors.push({ path: `${path}.level`, code: 'REC_LEVEL', message: `Recommendation level "${rec.level}" unknown` });
  if (!isArr(rec.reasons) || rec.reasons.length === 0 || !rec.reasons.every(isNonEmptyStr)) {
    errors.push({ path: `${path}.reasons`, code: 'REC_REASONS', message: 'Recommendation must carry ≥1 reason' });
  }
  if (!isFiniteNum(rec.priority)) warnings.push({ path: `${path}.priority`, code: 'REC_PRIORITY', message: 'Recommendation priority is not numeric' });
}

/* ── deterministic prediction traversal ─────────────────────────────────────── */

/** Collect every prediction node with a stable dotted path (deterministic). */
export function collectPredictions(model, base = '', acc = []) {
  if (!model || typeof model !== 'object') return acc;
  if (isArr(model)) {
    model.forEach((item, i) => collectPredictions(item, `${base}[${i}]`, acc));
    return acc;
  }
  if (isPredictionNode(model)) { acc.push({ path: base || 'root', node: model }); return acc; }
  for (const key of Object.keys(model)) {
    const child = model[key];
    if (child && typeof child === 'object') collectPredictions(child, base ? `${base}.${key}` : key, acc);
  }
  return acc;
}

/* ════════════════════════════════════════════════════════════════════════════
   PUBLIC API — validatePredictionModel(model) → immutable validation report.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Validate a full PredictionModel and certify it for UI consumption.
 * @returns {Readonly<Object>} report — deep-frozen.
 */
export function validatePredictionModel(model) {
  const errors = [];
  const warnings = [];

  if (!isObj(model)) {
    return deepFreeze({
      schema: VALIDATION_SCHEMA, valid: false, certified: false,
      target: null, counts: { predictions: 0, errors: 1, warnings: 0, recommendations: 0 },
      errors: [{ path: 'root', code: 'MODEL_NOT_OBJECT', message: 'Model is not an object' }],
      warnings: [], predictions: [],
    });
  }

  // Structural expectations (present-shape only; the schema itself is fixed).
  if ('schema' in model && model.schema !== PREDICTION_SCHEMA) {
    warnings.push({ path: 'schema', code: 'SCHEMA_MISMATCH', message: `schema "${model.schema}" is not ${PREDICTION_SCHEMA}` });
  }
  for (const container of ['executive', 'dispatch', 'finance']) {
    if (container in model && !isObj(model[container])) errors.push({ path: container, code: 'CONTAINER_TYPE', message: `${container} must be an object` });
  }
  for (const listKey of ['drivers', 'vehicles', 'recommendations']) {
    if (listKey in model && !isArr(model[listKey])) errors.push({ path: listKey, code: 'CONTAINER_TYPE', message: `${listKey} must be an array` });
  }

  // Validate every prediction.
  const found = collectPredictions(model);
  const predictions = found.map(({ path, node }) => validatePrediction(node, path));
  for (const p of predictions) {
    for (const e of p.errors) errors.push(e);
    for (const w of p.warnings) warnings.push(w);
  }

  // Validate recommendations (not predictions, but must still explain themselves).
  let recCount = 0;
  if (isArr(model.recommendations)) {
    recCount = model.recommendations.length;
    model.recommendations.forEach((r, i) => validateRecommendation(r, `recommendations[${i}]`, errors, warnings));
  }

  // Deterministic ordering of findings by path then code.
  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  errors.sort(byPath);
  warnings.sort(byPath);

  const certified = errors.length === 0;
  return deepFreeze({
    schema: VALIDATION_SCHEMA,
    valid: errors.length === 0,
    certified,                 // === valid: zero errors ⇒ ready for UI
    target: isNonEmptyStr(model.schema) ? model.schema : null,
    generatedAt: typeof model.generatedAt === 'string' ? model.generatedAt : null,
    counts: {
      predictions: predictions.length,
      certifiedPredictions: predictions.filter((p) => p.valid).length,
      recommendations: recCount,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
    predictions,
  });
}

export default validatePredictionModel;
