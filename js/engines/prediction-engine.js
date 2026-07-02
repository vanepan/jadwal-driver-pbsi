/* ============================================================
   PREDICTION-ENGINE.JS — Prediction Foundation (v1.19.0)

   The first engine of the platform's "what is LIKELY to happen?" generation.
   Every module before this answered "what IS happening?" (descriptive). This
   engine adds a forward-looking INTERPRETATION layer on top of the models the
   platform already computes, and turns their present-state metrics into
   explainable, forward-looking RISK.

   ── WHAT THIS ENGINE IS ─────────────────────────────────────────────────────
   A PURE, deterministic, rule-based projection layer. It:
     • receives the platform's EXISTING module models (Driver Wellness, Dispatch
       Analytics, Recommendation Accuracy, Vehicle Analytics, Petty Cash
       Analytics) plus the raw driver / vehicle / assignment collections,
     • NEVER mutates or re-shapes any of them (read-only), and
     • returns ONE immutable PredictionModel of forward-looking risk, each
       prediction carrying its own explanation.

   ── WHAT THIS ENGINE IS NOT ─────────────────────────────────────────────────
   It is NOT UI, NOT a scoring/recommendation/dispatch/analytics engine, and it
   invents NO new descriptive metric. It re-reads what the descriptive engines
   already produced and projects it forward. It builds NOTHING visual.

   ── FOUNDATION CONTRACT (v1.19 non-negotiables) ─────────────────────────────
     • PURE — no window, document, DOM, Firebase, localStorage, sessionStorage,
       network, timers. Every input is passed in.
     • DETERMINISTIC — no Math.random, no AI/ML/LLM, no external API. The ONLY
       clock read is `generatedAt`, and only when the caller omits `now`
       (callers/tests should pass `now` for byte-identical output).
     • EXPLAINABLE — every Prediction is { score, level, reasons } and no
       prediction is ever returned without at least one reason.
     • IMMUTABLE — the whole returned model is deep-frozen.
     • NODE-TESTABLE — see prediction-engine-check.mjs.

   ── RISK DIRECTION INVARIANT ────────────────────────────────────────────────
   A Prediction's `score` is a RISK on 0–100 where HIGHER = MORE RISK (0 = no
   concern, 100 = critical). This is the OPPOSITE polarity of the platform's
   quality scores (higher = better), because a prediction answers "how likely is
   something to go wrong?". Quality inputs (health, capacity health, acceptance)
   are inverted into risk here — the one place the inversion happens for
   prediction. `overallHealth` is the single quality-polarity output and is
   presented on its own quality band.
   ============================================================ */

'use strict';

/* ── schema / identity ──────────────────────────────────────────────────────── */

export const PREDICTION_SCHEMA = 'prediction@1';

/* ── numeric utilities (pure, not business logic) ───────────────────────────── */

function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp100(v) { return clamp(Math.round(num(v)), 0, 100); }
/** Is a value a real, finite number we can trust as a signal? */
function isNum(v) { return typeof v === 'number' ? Number.isFinite(v) : (v != null && v !== '' && Number.isFinite(Number(v))); }
function mean(list) {
  const xs = list.filter(isNum).map(Number);
  return xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : null;
}
function isArr(v) { return Array.isArray(v); }
function asArray(v) { return Array.isArray(v) ? v : []; }
function isObj(v) { return v != null && typeof v === 'object'; }

/**
 * Read the first defined value from a list of key PATHS on an object. Each path
 * is a dot-string ('capacityHealth.utilization'). This is what keeps the engine
 * TOLERANT of the exact model shapes — it reads what is there and degrades to
 * `undefined` when a module (or field) is absent, without ever throwing.
 */
function pick(obj, ...paths) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of String(path).split('.')) {
      if (isObj(cur) && key in cur) cur = cur[key];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}
/** pick(), coerced to a finite number or the fallback (default undefined). */
function pickNum(obj, paths, fallback) {
  for (const p of paths) { const v = pick(obj, p); if (isNum(v)) return Number(v); }
  return fallback;
}

/* ── risk + quality bands (the prediction interpretation scale) ─────────────── */

/**
 * RISK levels — higher score = higher risk. `min` is inclusive, ordered low →
 * high. `tone` maps onto the platform design tokens (ok / info / warn / danger)
 * so any future UI never hard-codes a colour. NOTE: this scale is prediction-
 * specific (a RISK direction) and intentionally distinct from the quality bands
 * used by the descriptive engines.
 */
export const RISK_LEVELS = Object.freeze([
  { key: 'LOW',       min: 0,  label: 'Low',       labelId: 'Rendah',       tone: 'ok' },
  { key: 'MODERATE',  min: 25, label: 'Moderate',  labelId: 'Sedang',       tone: 'info' },
  { key: 'ELEVATED',  min: 45, label: 'Elevated',  labelId: 'Meningkat',    tone: 'warn' },
  { key: 'HIGH',      min: 65, label: 'High',      labelId: 'Tinggi',       tone: 'danger' },
  { key: 'CRITICAL',  min: 85, label: 'Critical',  labelId: 'Kritis',       tone: 'danger' },
]);

/** The full risk band for a 0–100 risk score (never null — floors at LOW). */
export function riskLevel(score) {
  const s = clamp100(score);
  let band = RISK_LEVELS[0];
  for (const b of RISK_LEVELS) if (s >= b.min) band = b;
  return band;
}

/**
 * QUALITY levels — higher score = better. Used ONLY by overallHealth (the one
 * quality-polarity output). Mirrors the platform's higher=better philosophy so
 * a future dashboard can present it with the same grammar as the health score.
 */
export const QUALITY_LEVELS = Object.freeze([
  { key: 'EXCELLENT', min: 85, label: 'Excellent', labelId: 'Sangat Baik',    tone: 'ok' },
  { key: 'GOOD',      min: 70, label: 'Good',      labelId: 'Baik',           tone: 'ok' },
  { key: 'FAIR',      min: 55, label: 'Fair',      labelId: 'Cukup',          tone: 'info' },
  { key: 'ATTENTION', min: 35, label: 'Attention', labelId: 'Perlu Perhatian', tone: 'warn' },
  { key: 'CRITICAL',  min: 0,  label: 'Critical',  labelId: 'Kritis',         tone: 'danger' },
]);
export function qualityLevel(score) {
  const s = clamp100(score);
  return QUALITY_LEVELS.find((b) => s >= b.min) || QUALITY_LEVELS[QUALITY_LEVELS.length - 1];
}

/**
 * CONFIDENCE levels — how much EVIDENCE stands behind a prediction (0–100 =
 * share of the intended decision weight that had real data). Banded LOW /
 * MEDIUM / HIGH. Confidence is EVIDENCE-driven, never random: missing data
 * lowers it. `min` inclusive, ordered low → high.
 */
export const CONFIDENCE_LEVELS = Object.freeze([
  { key: 'LOW',    min: 0,  label: 'Low',    labelId: 'Rendah' },
  { key: 'MEDIUM', min: 40, label: 'Medium', labelId: 'Sedang' },
  { key: 'HIGH',   min: 70, label: 'High',   labelId: 'Tinggi' },
]);
export function confidenceBand(pct) {
  const s = clamp100(pct);
  let band = CONFIDENCE_LEVELS[0];
  for (const b of CONFIDENCE_LEVELS) if (s >= b.min) band = b;
  return band;
}

/**
 * A single plain-language SUMMARY sentence for a risk prediction — written for
 * operational users, not developers. `opts.subject` names what is at risk;
 * `opts.advice` (string or level→string fn) appends a recommended action;
 * HIGH/CRITICAL fall back to `opts.adviceHigh`. Deterministic — pure string ops.
 */
function buildRiskSummary(band, reasons, opts = {}) {
  const subject = opts.subject || 'Risiko operasional';
  if (!opts.hasData) return `${subject}: data belum cukup untuk memproyeksikan.`;
  const primary = asArray(reasons).find(Boolean);
  const lead = `${subject} ${band.labelId.toLowerCase()}`;
  let s = primary ? `${lead} — ${primary}.` : `${lead}.`;
  let advice = typeof opts.advice === 'function' ? opts.advice(band) : opts.advice;
  if (!advice && (band.key === 'HIGH' || band.key === 'CRITICAL')) advice = opts.adviceHigh;
  if (advice) s += ` ${advice}`;
  return s;
}

/* ── the Prediction primitive + risk assembly ───────────────────────────────── */

/**
 * A "signal" contributes to a risk assessment:
 *   { key, label, weight, value(0–100 risk), reason?(string), available(bool) }
 * `value` is ALREADY expressed as risk (higher = worse). Quality inputs must be
 * inverted (100 − quality) by the caller before becoming a signal.
 */
function signal(key, label, weight, value, reason) {
  const available = isNum(value);
  return {
    key, label,
    weight: num(weight, 0),
    value: available ? clamp100(value) : null,
    reason: reason || null,
    available,
  };
}

/**
 * The ONE risk-assembly routine every prediction flows through, so scoring +
 * explainability are computed identically everywhere.
 *
 *   • score  = weighted mean of AVAILABLE signal values (0 signals ⇒ score 0,
 *              level LOW, and a single "insufficient data" reason so the
 *              contract "no prediction without a reason" always holds),
 *   • level  = riskLevel(score),
 *   • reasons = the human-readable drivers of the score: every available signal
 *              whose risk value ≥ reasonThreshold, ordered by contribution
 *              (weight×value) desc, tie-broken by key for determinism. When
 *              nothing crosses the threshold a positive baseline reason is used.
 *
 * The returned object is frozen. It is the universal { score, level, reasons }
 * shape the foundation guarantees, plus `tone`, `confidence` and the frozen
 * `signals` for downstream explainability.
 */
function assessRisk(signals, opts = {}) {
  const reasonThreshold = num(opts.reasonThreshold, 45);
  const baselineReason = opts.baselineReason || 'Tidak ada faktor risiko signifikan';
  const noDataReason = opts.noDataReason || 'Data tidak cukup untuk memproyeksikan risiko';

  const list = asArray(signals).filter(Boolean);
  const available = list.filter((s) => s.available && s.weight > 0);

  let score = 0;
  let confidence = 0;
  let emitted = [];
  if (available.length) {
    const totalW = available.reduce((s, x) => s + x.weight, 0) || 1;
    score = clamp100(available.reduce((s, x) => s + x.weight * x.value, 0) / totalW);
    // Confidence = share of the intended weight that had real data behind it.
    const intendedW = list.reduce((s, x) => s + Math.max(0, x.weight), 0) || totalW;
    confidence = clamp100((totalW / intendedW) * 100);
    // Emitted signals are INTERNAL evidence: `weight` is the signal's share of
    // the decision (%), `contribution` the points it added to the score. Ordered
    // by contribution desc, tie-broken by id — deterministic + auditable.
    emitted = available
      .map((s) => ({
        id: s.key,
        label: s.label,
        value: s.value,
        weight: Math.round((s.weight / totalW) * 100),
        contribution: Math.round((s.weight * s.value) / totalW),
        reason: s.reason,
      }))
      .sort((a, b) => b.contribution - a.contribution || (a.id < b.id ? -1 : 1))
      .map((s) => Object.freeze(s));
  }

  let reasons;
  if (!available.length) {
    reasons = [noDataReason];
  } else {
    const drivers = available
      .filter((s) => s.value >= reasonThreshold && s.reason)
      .sort((a, b) => (b.weight * b.value) - (a.weight * a.value) || (a.key < b.key ? -1 : 1))
      .map((s) => s.reason);
    reasons = drivers.length ? drivers : [baselineReason];
  }

  const band = riskLevel(score);
  const cBand = confidenceBand(confidence);
  const summary = buildRiskSummary(band, reasons, { ...opts, hasData: available.length > 0 });
  return Object.freeze({
    kind: 'risk',
    score,
    level: band.key,
    levelLabel: band.label,
    levelLabelId: band.labelId,
    tone: band.tone,
    confidence,                       // 0–100 evidence coverage
    confidenceLevel: cBand.key,       // LOW / MEDIUM / HIGH
    reasons: Object.freeze(reasons),  // user-facing WHY
    signals: Object.freeze(emitted),  // internal evidence
    summary,                          // one operational sentence
  });
}

/**
 * Build a quality-polarity prediction (higher = better). Carries the SAME full
 * explainability contract as a risk prediction (score, level, confidence,
 * confidenceLevel, reasons, signals, summary) so every prediction in the model
 * is uniform. `opts.signals` are the (already-formed) evidence, `opts.confidence`
 * the evidence coverage (defaults LOW when no signals were supplied).
 */
function qualityPrediction(score, reasons, opts = {}) {
  const s = clamp100(score);
  const band = qualityLevel(s);
  const list = asArray(reasons).filter(Boolean);
  const rlist = list.length ? list : ['Berdasarkan sinyal modul yang tersedia'];
  const emitted = asArray(opts.signals).filter(Boolean).map((x) => Object.freeze({ ...x }));
  const confidence = isNum(opts.confidence) ? clamp100(opts.confidence) : (emitted.length ? 70 : 30);
  const cBand = confidenceBand(confidence);
  const subject = opts.subject || 'Kondisi';
  const summary = `${subject} ${band.labelId.toLowerCase()} (${s}/100). ${rlist[0]}.`;
  return Object.freeze({
    kind: 'quality',
    score: s,
    level: band.key,
    levelLabel: band.label,
    levelLabelId: band.labelId,
    tone: band.tone,
    confidence,
    confidenceLevel: cBand.key,
    reasons: Object.freeze(rlist),
    signals: Object.freeze(emitted),
    summary,
  });
}

/* ── deterministic trend / forecast primitives ──────────────────────────────── */

/**
 * A deterministic trend from `previous` → `current`. Direction thresholds keep
 * tiny noise flat. `deltaPct` is relative to the previous value (0 when the
 * previous value is 0 and current is 0). All rule-based, no randomness.
 */
function trend(current, previous, opts = {}) {
  const flatBand = num(opts.flatBand, 5); // ±5% is "flat"
  if (!isNum(current) || !isNum(previous)) {
    return Object.freeze({ direction: 'unknown', current: isNum(current) ? Number(current) : null,
      previous: isNum(previous) ? Number(previous) : null, deltaPct: null, available: false });
  }
  const c = Number(current); const p = Number(previous);
  const delta = c - p;
  const deltaPct = p === 0 ? (c === 0 ? 0 : 100) : Math.round((delta / Math.abs(p)) * 100);
  let direction = 'flat';
  if (deltaPct > flatBand) direction = 'up';
  else if (deltaPct < -flatBand) direction = 'down';
  return Object.freeze({ direction, current: c, previous: p, delta, deltaPct, available: true });
}

/**
 * A deterministic one-step-ahead forecast of a numeric series (oldest → newest)
 * using the last observed step (linear last-delta extrapolation). Pure and
 * reproducible; returns null when there is not enough data.
 */
function forecastNext(series, opts = {}) {
  const xs = asArray(series).filter(isNum).map(Number);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];
  const last = xs[xs.length - 1];
  const prev = xs[xs.length - 2];
  const step = last - prev;
  let next = last + step;
  if (opts.min != null) next = Math.max(opts.min, next);
  if (opts.max != null) next = Math.min(opts.max, next);
  return Math.round(next * 100) / 100;
}

/** trend() → a forward-looking risk contribution (a rising bad metric = risk). */
function trendRisk(t, opts = {}) {
  if (!t || !t.available) return null;
  const cap = num(opts.cap, 40);
  const perPct = num(opts.perPct, 1);
  const rising = opts.risingIsBad !== false; // default: an increase is bad
  const magnitude = clamp(Math.abs(num(t.deltaPct)) * perPct, 0, cap);
  const bad = rising ? t.direction === 'up' : t.direction === 'down';
  return bad ? magnitude : 0;
}

/* ════════════════════════════════════════════════════════════════════════════
   INPUT NORMALIZATION — read the platform models WITHOUT changing them.
   Each reader returns a normalized, read-only projection or `null` when the
   source model is absent, so every downstream computation handles "missing
   module" the same way.
   ════════════════════════════════════════════════════════════════════════════ */

function normDrivers(input) {
  // Primary source: the Driver Wellness model (rich, already-derived signals).
  const wellness = input.wellness;
  if (isObj(wellness) && isArr(wellness.drivers) && wellness.drivers.length) {
    return wellness.drivers.map((d) => Object.freeze({
      id: pick(d, 'driverId', 'id') != null ? String(pick(d, 'driverId', 'id')) : '',
      name: pick(d, 'driverName', 'name') || '—',
      health: pickNum(d, ['health.score', 'healthScore']),
      fatigue: pickNum(d, ['fatigue.index', 'fatigueIndex']),
      burnout: pickNum(d, ['burnout.index', 'burnoutIndex']),
      capacityHealth: pickNum(d, ['capacityHealth.score']),
      utilization: pickNum(d, ['capacityHealth.utilization', 'raw.utilization', 'utilization']),
      avgRestDays: pickNum(d, ['recovery.avgRestDays', 'raw.avgRestDays']),
      maxStreak: pickNum(d, ['recovery.maxStreak', 'raw.maxStreak']),
      trendDelta: null, // populated below from the wellness trend if present
    }));
  }
  // Fallback: only the raw driver roster (no derived signals available).
  const roster = asArray(input.drivers).filter((d) => isObj(d) && d.active !== false && d.archived !== true);
  if (roster.length) {
    return roster.map((d) => Object.freeze({
      id: d.id != null ? String(d.id) : '',
      name: d.name || (d.id != null ? String(d.id) : '—'),
      health: undefined, fatigue: undefined, burnout: undefined,
      capacityHealth: undefined, utilization: undefined,
      avgRestDays: undefined, maxStreak: undefined, trendDelta: null,
    }));
  }
  return [];
}

function normVehicles(input) {
  const list = asArray(input.vehicles).filter((v) => isObj(v));
  if (!list.length) return [];
  return list.map((v) => Object.freeze({
    id: v.id != null ? String(v.id) : '',
    name: v.name || v.plate || (v.id != null ? String(v.id) : '—'),
    status: String(pick(v, 'status') || 'active').toLowerCase(),
    type: String(pick(v, 'type') || '').toLowerCase(),
    year: pickNum(v, ['registration.year', 'year']),
    odometer: pickNum(v, ['registration.odometer', 'odometer']),
    healthOperational: pickNum(v, ['health.operational', 'healthOperational']),
    healthLegal: pickNum(v, ['health.legal', 'healthLegal']),
    healthDocuments: pickNum(v, ['health.documents', 'documentCompleteness', 'healthDocuments']),
    healthOverall: pickNum(v, ['health.overall', 'healthOverall']),
    taxStatus: String(pick(v, 'taxStatus', 'tax.status') || '').toLowerCase(),
    stnkStatus: String(pick(v, 'stnkStatus', 'stnk.status') || '').toLowerCase(),
    insuranceStatus: String(pick(v, 'insuranceStatus', 'insurance.status') || '').toLowerCase(),
    utilization: pickNum(v, ['utilization', 'utilizationPercent']),
  }));
}

/* ════════════════════════════════════════════════════════════════════════════
   DOMAIN PREDICTORS — each returns forward-looking, explainable risk.
   ════════════════════════════════════════════════════════════════════════════ */

/* ── DRIVER ──────────────────────────────────────────────────────────────────
   fatigueRisk (short-term), availabilityRisk (can we field them next?),
   recoveryRecommended (boolean), workloadTrend. Signals derive ONLY from the
   wellness model's already-computed indices — quality inputs are inverted. */
function predictDriver(d, cfg) {
  const invHealth = isNum(d.health) ? 100 - Number(d.health) : undefined;
  const invCapacity = isNum(d.capacityHealth) ? 100 - Number(d.capacityHealth) : undefined;
  const restDeficit = isNum(d.avgRestDays)
    ? clamp((cfg.recoveryTargetDays - Number(d.avgRestDays)) / cfg.recoveryTargetDays, 0, 1) * 100
    : undefined;
  const streakRisk = isNum(d.maxStreak)
    ? clamp((Number(d.maxStreak) - cfg.healthyStreakDays) / cfg.healthyStreakDays, 0, 1) * 100
    : undefined;

  const fatigueRisk = assessRisk([
    signal('fatigue', 'Fatigue index', 0.45, d.fatigue,
      isNum(d.fatigue) ? `Indeks kelelahan ${clamp100(d.fatigue)}` : null),
    signal('recovery', 'Recovery deficit', 0.25, restDeficit,
      isNum(restDeficit) ? `Rata-rata pemulihan ${Number(d.avgRestDays)} hari (target ${cfg.recoveryTargetDays})` : null),
    signal('streak', 'Consecutive working days', 0.18, streakRisk,
      isNum(streakRisk) ? `Bekerja ${Number(d.maxStreak)} hari beruntun` : null),
    signal('health', 'Health headroom', 0.12, invHealth,
      isNum(invHealth) ? `Skor kesehatan ${clamp100(d.health)}` : null),
  ], { subject: `Risiko kelelahan ${d.name}`, baselineReason: 'Kondisi kelelahan dalam batas aman',
       adviceHigh: 'Sebaiknya diistirahatkan / dirotasi dalam waktu dekat.' });

  const availabilityRisk = assessRisk([
    signal('capacity', 'Capacity pressure', 0.4, invCapacity,
      isNum(d.utilization) ? `Utilisasi ${clamp100(d.utilization)}% membatasi kapasitas` : null),
    signal('burnout', 'Burnout index', 0.3, d.burnout,
      isNum(d.burnout) ? `Indeks burnout ${clamp100(d.burnout)}` : null),
    signal('recovery', 'Recovery deficit', 0.2, restDeficit,
      isNum(restDeficit) ? `Pemulihan di bawah target` : null),
    signal('fatigue', 'Fatigue index', 0.1, d.fatigue,
      isNum(d.fatigue) ? `Kelelahan terkini ${clamp100(d.fatigue)}` : null),
  ], { subject: `Ketersediaan ${d.name}`, baselineReason: 'Diproyeksikan tersedia untuk operasional',
       adviceHigh: 'Kapasitas terbatas — pertimbangkan driver lain.' });

  const recoveryRecommended = Boolean(
    ['HIGH', 'CRITICAL'].includes(fatigueRisk.level) ||
    (isNum(d.burnout) && Number(d.burnout) >= cfg.burnoutRecoveryThreshold) ||
    (isNum(restDeficit) && restDeficit >= 60)
  );

  const workloadTrend = isNum(d.trendDelta)
    ? trend(Number(d.utilization), Number(d.utilization) - Number(d.trendDelta))
    : Object.freeze({ direction: 'unknown', available: false, deltaPct: null, current: isNum(d.utilization) ? Number(d.utilization) : null, previous: null });

  return Object.freeze({
    id: d.id,
    name: d.name,
    fatigueRisk,
    availabilityRisk,
    recoveryRecommended,
    workloadTrend,
  });
}

/* ── VEHICLE ─────────────────────────────────────────────────────────────────
   maintenanceRisk, administrativeRisk, utilizationTrend, availabilityForecast.
   Reads the vehicle asset's already-derived health + legal statuses. */
function docStatusRisk(status) {
  const s = String(status || '').toLowerCase();
  if (!s) return undefined;
  if (/(expired|overdue|lapsed|invalid)/.test(s)) return 100;
  if (/(due|soon|pending|warning|attention)/.test(s)) return 60;
  if (/(valid|active|ok|current|paid|good)/.test(s)) return 0;
  return undefined;
}

function predictVehicle(v, cfg, nowYear) {
  const invOperational = isNum(v.healthOperational) ? 100 - Number(v.healthOperational) : undefined;
  const age = isNum(v.year) && isNum(nowYear) ? Math.max(0, nowYear - Number(v.year)) : undefined;
  const ageRisk = isNum(age) ? clamp((age - cfg.vehicleAgeGrace) / cfg.vehicleAgeSpan, 0, 1) * 100 : undefined;
  const overUtil = isNum(v.utilization) ? clamp((Number(v.utilization) - cfg.vehicleUtilCeil) / (100 - cfg.vehicleUtilCeil), 0, 1) * 100 : undefined;
  const inMaintenance = v.status === 'maintenance';

  const maintenanceRisk = assessRisk([
    signal('operational', 'Operational health', 0.35, invOperational,
      isNum(v.healthOperational) ? `Kesehatan operasional ${clamp100(v.healthOperational)}` : null),
    signal('utilization', 'Over-utilization', 0.25, overUtil,
      isNum(v.utilization) && overUtil > 0 ? `Utilisasi ${clamp100(v.utilization)}% di atas ambang` : null),
    signal('age', 'Asset age', 0.2, ageRisk,
      isNum(age) && ageRisk > 0 ? `Usia kendaraan ${age} tahun` : null),
    signal('status', 'Maintenance status', 0.2, inMaintenance ? 100 : (v.status === 'active' ? 0 : undefined),
      inMaintenance ? 'Sedang dalam perawatan' : null),
  ], { subject: `Risiko perawatan ${v.name}`, baselineReason: 'Risiko perawatan rendah',
       adviceHigh: 'Sebaiknya dijadwalkan perawatan dalam waktu dekat.' });

  const administrativeRisk = assessRisk([
    signal('stnk', 'STNK status', 0.34, docStatusRisk(v.stnkStatus),
      docStatusRisk(v.stnkStatus) >= 60 ? `Status STNK: ${v.stnkStatus}` : null),
    signal('tax', 'Tax status', 0.33, docStatusRisk(v.taxStatus),
      docStatusRisk(v.taxStatus) >= 60 ? `Status pajak: ${v.taxStatus}` : null),
    signal('insurance', 'Insurance status', 0.18, docStatusRisk(v.insuranceStatus),
      docStatusRisk(v.insuranceStatus) >= 60 ? `Status asuransi: ${v.insuranceStatus}` : null),
    signal('documents', 'Document completeness', 0.15,
      isNum(v.healthDocuments) ? 100 - Number(v.healthDocuments) : undefined,
      isNum(v.healthDocuments) && v.healthDocuments < 70 ? `Kelengkapan dokumen ${clamp100(v.healthDocuments)}%` : null),
  ], { subject: `Risiko administrasi ${v.name}`, baselineReason: 'Administrasi legal dalam kondisi baik',
       adviceHigh: 'Perbarui dokumen legal (STNK / pajak) sebelum jatuh tempo.' });

  const utilizationTrend = Object.freeze({
    direction: 'unknown', available: false, deltaPct: null,
    current: isNum(v.utilization) ? Number(v.utilization) : null, previous: null,
  });

  // availabilityForecast: risk the vehicle will NOT be available next cycle.
  const availabilityForecast = assessRisk([
    signal('maintenance', 'Projected maintenance', 0.5, maintenanceRisk.score,
      maintenanceRisk.score >= 45 ? 'Kemungkinan masuk perawatan' : null),
    signal('administrative', 'Administrative block', 0.3, administrativeRisk.score,
      administrativeRisk.score >= 45 ? 'Dokumen dapat menghambat operasional' : null),
    signal('status', 'Current status', 0.2,
      inMaintenance ? 100 : (v.status === 'active' ? 0 : (v.status ? 80 : undefined)),
      inMaintenance ? 'Belum tersedia (perawatan)' : (v.status && v.status !== 'active' ? `Status: ${v.status}` : null)),
  ], { subject: `Ketersediaan ${v.name}`, baselineReason: 'Diproyeksikan tersedia',
       adviceHigh: 'Kemungkinan tidak siap operasional periode depan.' });

  return Object.freeze({
    id: v.id,
    name: v.name,
    maintenanceRisk,
    administrativeRisk,
    utilizationTrend,
    availabilityForecast,
  });
}

/* ── DISPATCH ────────────────────────────────────────────────────────────────
   conflictRisk, delayRisk, capacityRisk, recommendationConfidence — aggregate
   forward-looking pressure on the dispatch pipeline. */
function predictDispatch(input, drivers, vehicles, cfg) {
  const dispatch = input.dispatch;
  const recommendation = input.recommendation;

  // Fleet + cohort pressure derived from the per-driver / per-vehicle predictions.
  const availDriverRisks = drivers.map((d) => d.availabilityRisk.score);
  const availVehicleRisks = vehicles.map((v) => v.availabilityForecast.score);
  const driverPressure = mean(availDriverRisks);
  const vehiclePressure = mean(availVehicleRisks);
  const fatiguePressure = mean(drivers.map((d) => d.fatigueRisk.score));

  // Read whatever the Dispatch Analytics model already surfaced, defensively.
  const dispatchUtil = pickNum(dispatch, ['summary.utilization', 'utilization', 'capacity.utilization']);
  const backlog = pickNum(dispatch, ['summary.pending', 'pending', 'backlog', 'summary.backlog']);
  const acceptance = pickNum(recommendation, ['summary.acceptanceRate', 'acceptanceRate', 'summary.acceptancePct']);
  const accuracy = pickNum(recommendation, ['summary.accuracy', 'accuracy', 'summary.accuracyPct']);
  const avgConfidence = pickNum(recommendation, ['summary.avgConfidence', 'avgConfidence', 'summary.confidence']);

  const capacityRisk = assessRisk([
    signal('drivers', 'Driver availability', 0.4, driverPressure,
      isNum(driverPressure) && driverPressure >= 45 ? 'Ketersediaan driver menyusut' : null),
    signal('vehicles', 'Vehicle availability', 0.35, vehiclePressure,
      isNum(vehiclePressure) && vehiclePressure >= 45 ? 'Ketersediaan armada menyusut' : null),
    signal('utilization', 'Fleet utilization', 0.25,
      isNum(dispatchUtil) ? clamp((dispatchUtil - cfg.dispatchUtilCeil) / (100 - cfg.dispatchUtilCeil), 0, 1) * 100 : undefined,
      isNum(dispatchUtil) && dispatchUtil >= cfg.dispatchUtilCeil ? `Utilisasi dispatch ${clamp100(dispatchUtil)}%` : null),
  ], { subject: 'Risiko kapasitas dispatch', baselineReason: 'Kapasitas dispatch mencukupi',
       adviceHigh: 'Tambah kapasitas atau seimbangkan beban.' });

  const conflictRisk = assessRisk([
    signal('capacity', 'Capacity pressure', 0.5, capacityRisk.score,
      capacityRisk.score >= 45 ? 'Kapasitas ketat meningkatkan bentrok jadwal' : null),
    signal('backlog', 'Pending backlog', 0.3,
      isNum(backlog) ? clamp(backlog * cfg.backlogPerUnit, 0, 100) : undefined,
      isNum(backlog) && backlog > 0 ? `${backlog} permintaan menunggu` : null),
    signal('vehicles', 'Vehicle scarcity', 0.2, vehiclePressure,
      isNum(vehiclePressure) && vehiclePressure >= 45 ? 'Armada terbatas' : null),
  ], { subject: 'Risiko bentrok jadwal', baselineReason: 'Risiko bentrok jadwal rendah',
       adviceHigh: 'Tinjau jadwal untuk mencegah tumpang tindih.' });

  const delayRisk = assessRisk([
    signal('fatigue', 'Driver fatigue', 0.4, fatiguePressure,
      isNum(fatiguePressure) && fatiguePressure >= 45 ? 'Kelelahan driver dapat memperlambat operasional' : null),
    signal('capacity', 'Capacity pressure', 0.35, capacityRisk.score,
      capacityRisk.score >= 45 ? 'Kapasitas ketat berisiko menunda' : null),
    signal('backlog', 'Pending backlog', 0.25,
      isNum(backlog) ? clamp(backlog * cfg.backlogPerUnit, 0, 100) : undefined,
      isNum(backlog) && backlog > 0 ? `Antrian ${backlog} permintaan` : null),
  ], { subject: 'Risiko keterlambatan', baselineReason: 'Risiko keterlambatan rendah',
       adviceHigh: 'Antisipasi penundaan — siapkan cadangan.' });

  // recommendationConfidence: quality-polarity (higher = more trustworthy).
  // Signals are the acceptance / accuracy / avg-confidence evidence; confidence
  // reflects how many of the three were actually reported.
  const confReasons = [];
  const confParts = [];
  const confSignals = [];
  const RC_W = 33;
  if (isNum(acceptance)) { confParts.push(clamp100(acceptance)); confReasons.push(`Penerimaan rekomendasi ${clamp100(acceptance)}%`); confSignals.push({ id: 'acceptance', label: 'Acceptance rate', value: clamp100(acceptance), weight: RC_W }); }
  if (isNum(accuracy)) { confParts.push(clamp100(accuracy)); confReasons.push(`Akurasi rekomendasi ${clamp100(accuracy)}%`); confSignals.push({ id: 'accuracy', label: 'Accuracy', value: clamp100(accuracy), weight: RC_W }); }
  if (isNum(avgConfidence)) { confParts.push(clamp100(avgConfidence)); confReasons.push(`Keyakinan rata-rata ${clamp100(avgConfidence)}`); confSignals.push({ id: 'avgConfidence', label: 'Avg confidence', value: clamp100(avgConfidence), weight: RC_W }); }
  const recommendationConfidence = confParts.length
    ? qualityPrediction(mean(confParts), confReasons,
        { subject: 'Keyakinan rekomendasi', signals: confSignals, confidence: clamp100((confParts.length / 3) * 100) })
    : qualityPrediction(50, ['Belum ada data akurasi rekomendasi — keyakinan netral'],
        { subject: 'Keyakinan rekomendasi', confidence: 30 });

  return Object.freeze({ conflictRisk, delayRisk, capacityRisk, recommendationConfidence });
}

/* ── FINANCE ─────────────────────────────────────────────────────────────────
   pettyCashRisk, forecastBalance, upcomingExpenses — projected from the Petty
   Cash Analytics model's already-computed balances + spend history. */
function predictFinance(input, cfg) {
  const finance = input.finance;
  if (!isObj(finance)) {
    return Object.freeze({
      pettyCashRisk: assessRisk([], { subject: 'Risiko petty cash', noDataReason: 'Modul Petty Cash tidak tersedia' }),
      forecastBalance: null,
      upcomingExpenses: null,
    });
  }

  const balance = pickNum(finance, ['summary.balance', 'balance', 'summary.remaining', 'remaining', 'currentBalance']);
  const initial = pickNum(finance, ['summary.initial', 'initial', 'summary.allocation', 'allocation', 'budget', 'summary.budget']);
  const spent = pickNum(finance, ['summary.spent', 'spent', 'summary.realized', 'realized']);
  const remainingRatio = isNum(balance) && isNum(initial) && initial > 0 ? clamp(balance / initial, 0, 1) : undefined;

  // Recent per-period spend series (oldest → newest) for a deterministic forecast.
  const series = asArray(pick(finance, 'spendSeries', 'trend.series', 'history'))
    .map((p) => (isNum(p) ? Number(p) : pickNum(p, ['amount', 'total', 'spent', 'value'])))
    .filter(isNum);
  const avgSpend = series.length ? mean(series) : (isNum(spent) ? spent : undefined);
  const upcomingExpenses = isNum(avgSpend)
    ? Object.freeze({
        projected: Math.round((forecastNext(series) ?? avgSpend) * 100) / 100,
        basis: series.length >= 2 ? 'trend' : 'average',
        periods: series.length,
      })
    : null;

  const forecastBalance = (isNum(balance) && upcomingExpenses)
    ? Math.round((balance - upcomingExpenses.projected) * 100) / 100
    : (isNum(balance) ? balance : null);

  const depletionRisk = isNum(remainingRatio) ? (1 - remainingRatio) * 100 : undefined;
  const forecastShortfallRisk = (isNum(forecastBalance) && isNum(initial) && initial > 0)
    ? clamp((1 - clamp(forecastBalance / initial, 0, 1)), 0, 1) * 100
    : undefined;
  const negativeForecast = isNum(forecastBalance) && forecastBalance < 0;

  const pettyCashRisk = assessRisk([
    signal('depletion', 'Current depletion', 0.5, depletionRisk,
      isNum(remainingRatio) && remainingRatio <= cfg.cashLowRatio ? `Saldo tersisa ${Math.round(remainingRatio * 100)}%` : null),
    signal('forecast', 'Forecast shortfall', 0.35, negativeForecast ? 100 : forecastShortfallRisk,
      negativeForecast ? 'Saldo diproyeksikan defisit periode depan'
        : (isNum(forecastShortfallRisk) && forecastShortfallRisk >= 60 ? 'Saldo diproyeksikan menipis' : null)),
    signal('velocity', 'Spend velocity', 0.15,
      (isNum(avgSpend) && isNum(initial) && initial > 0) ? clamp((avgSpend / initial) * 100 * cfg.velocityGain, 0, 100) : undefined,
      (isNum(avgSpend) && isNum(initial) && initial > 0 && (avgSpend / initial) >= cfg.velocityWarnRatio) ? 'Laju pengeluaran tinggi' : null),
  ], { subject: 'Risiko petty cash', baselineReason: 'Kondisi kas dalam batas aman',
       adviceHigh: 'Pertimbangkan isi ulang / tinjau anggaran petty cash.' });

  return Object.freeze({ pettyCashRisk, forecastBalance, upcomingExpenses });
}

/* ── EXECUTIVE roll-up ───────────────────────────────────────────────────────
   overallRisk, overallHealth, confidence, summary, warnings, opportunities. */
function predictExecutive(parts, cfg) {
  const { drivers, vehicles, dispatch, finance, coverage } = parts;

  const driverRisk = mean(drivers.map((d) => Math.max(d.fatigueRisk.score, d.availabilityRisk.score)));
  const vehicleRisk = mean(vehicles.map((v) => Math.max(v.maintenanceRisk.score, v.administrativeRisk.score)));
  const dispatchRisk = dispatch ? mean([dispatch.conflictRisk.score, dispatch.delayRisk.score, dispatch.capacityRisk.score]) : null;
  const financeRisk = finance ? finance.pettyCashRisk.score : null;

  const overallRisk = assessRisk([
    signal('driver', 'Driver domain', 0.3, driverRisk,
      isNum(driverRisk) && driverRisk >= 45 ? 'Risiko domain driver meningkat' : null),
    signal('vehicle', 'Vehicle domain', 0.25, vehicleRisk,
      isNum(vehicleRisk) && vehicleRisk >= 45 ? 'Risiko domain kendaraan meningkat' : null),
    signal('dispatch', 'Dispatch domain', 0.25, dispatchRisk,
      isNum(dispatchRisk) && dispatchRisk >= 45 ? 'Risiko domain dispatch meningkat' : null),
    signal('finance', 'Finance domain', 0.2, financeRisk,
      isNum(financeRisk) && financeRisk >= 45 ? 'Risiko domain keuangan meningkat' : null),
  ], { subject: 'Risiko operasional keseluruhan', baselineReason: 'Seluruh domain dalam batas risiko aman',
       adviceHigh: 'Beberapa domain memerlukan perhatian — tinjau peringatan.' });

  // overallHealth: the single quality-polarity output (higher = better). It
  // reuses overallRisk's domain signals as its evidence (same coverage), so it
  // carries the full explainability contract like every other prediction.
  const healthReasons = [];
  if (isNum(driverRisk)) healthReasons.push(`Kesehatan driver ${100 - clamp100(driverRisk)}`);
  if (isNum(vehicleRisk)) healthReasons.push(`Kesehatan armada ${100 - clamp100(vehicleRisk)}`);
  const overallHealth = qualityPrediction(100 - overallRisk.score,
    healthReasons.length ? healthReasons : ['Diproyeksikan dari sinyal modul yang tersedia'],
    { subject: 'Kesehatan operasional', signals: overallRisk.signals, confidence: overallRisk.confidence });

  // Confidence: how much of the platform actually reported data.
  const present = [coverage.drivers, coverage.vehicles, coverage.dispatch, coverage.finance].filter(Boolean).length;
  const confidence = clamp100((present / 4) * 100 * (overallRisk.confidence ? 1 : 0.6) + (present ? 0 : 0));

  // Warnings — every HIGH+ domain risk, most severe first (deterministic order).
  const warnings = [];
  const pushWarn = (domain, pred, label) => {
    if (pred && ['HIGH', 'CRITICAL'].includes(pred.level)) {
      warnings.push(Object.freeze({ domain, level: pred.level, score: pred.score, message: label, reasons: pred.reasons }));
    }
  };
  pushWarn('driver', riskLevel(driverRisk) && { level: riskLevel(driverRisk).key, score: clamp100(driverRisk), reasons: overallRisk.reasons }, 'Domain driver memerlukan perhatian');
  pushWarn('vehicle', isNum(vehicleRisk) ? { level: riskLevel(vehicleRisk).key, score: clamp100(vehicleRisk), reasons: [] } : null, 'Domain kendaraan memerlukan perhatian');
  pushWarn('dispatch', dispatch ? { level: riskLevel(dispatchRisk).key, score: clamp100(dispatchRisk), reasons: [] } : null, 'Domain dispatch memerlukan perhatian');
  pushWarn('finance', finance ? { level: finance.pettyCashRisk.level, score: finance.pettyCashRisk.score, reasons: finance.pettyCashRisk.reasons } : null, 'Domain keuangan memerlukan perhatian');
  warnings.sort((a, b) => b.score - a.score || (a.domain < b.domain ? -1 : 1));

  // Opportunities — domains that are notably healthy (low risk), a positive read.
  const opportunities = [];
  const pushOpp = (domain, risk, label) => {
    if (isNum(risk) && risk < cfg.opportunityRiskCeil) {
      opportunities.push(Object.freeze({ domain, score: 100 - clamp100(risk), message: label }));
    }
  };
  pushOpp('driver', driverRisk, 'Kondisi driver sehat — kapasitas siap ditingkatkan');
  pushOpp('vehicle', vehicleRisk, 'Armada prima — utilisasi dapat dioptimalkan');
  pushOpp('dispatch', dispatchRisk, 'Dispatch stabil — ruang untuk menambah volume');
  pushOpp('finance', financeRisk, 'Kas sehat — anggaran fleksibel');
  opportunities.sort((a, b) => b.score - a.score || (a.domain < b.domain ? -1 : 1));

  const summary = buildExecutiveSummary(overallRisk, overallHealth, warnings.length, opportunities.length, present);

  return Object.freeze({
    overallRisk,
    overallHealth,
    confidence,
    summary,
    warnings: Object.freeze(warnings),
    opportunities: Object.freeze(opportunities),
  });
}

function buildExecutiveSummary(overallRisk, overallHealth, warnCount, oppCount, present) {
  if (!present) return 'Belum ada data modul untuk memproyeksikan kondisi operasional.';
  const risk = overallRisk.levelLabelId;
  const health = overallHealth.levelLabelId;
  const w = warnCount ? `${warnCount} peringatan` : 'tanpa peringatan kritis';
  return `Proyeksi risiko operasional: ${risk}. Kesehatan keseluruhan: ${health}. Terdapat ${w}` +
    (oppCount ? ` dan ${oppCount} peluang.` : '.');
}

/* ── forward-looking RECOMMENDATIONS (top-level) ─────────────────────────────
   Deterministic, data-only actions distilled from the domain predictions. This
   is a MODEL, not UI copy — a future module renders it. */
function buildRecommendations(driverPreds, vehiclePreds, finance, dispatch) {
  const recs = [];

  for (const d of driverPreds) {
    if (d.recoveryRecommended) {
      recs.push({
        id: `driver:${d.id || d.name}:recovery`,
        domain: 'driver', target: d.name, action: 'recovery',
        priority: d.fatigueRisk.score, level: d.fatigueRisk.level,
        message: `Rotasikan atau istirahatkan ${d.name}`,
        reasons: d.fatigueRisk.reasons,
      });
    }
  }
  for (const v of vehiclePreds) {
    if (['HIGH', 'CRITICAL'].includes(v.maintenanceRisk.level)) {
      recs.push({
        id: `vehicle:${v.id || v.name}:maintenance`,
        domain: 'vehicle', target: v.name, action: 'maintenance',
        priority: v.maintenanceRisk.score, level: v.maintenanceRisk.level,
        message: `Jadwalkan perawatan untuk ${v.name}`,
        reasons: v.maintenanceRisk.reasons,
      });
    }
    if (['HIGH', 'CRITICAL'].includes(v.administrativeRisk.level)) {
      recs.push({
        id: `vehicle:${v.id || v.name}:administrative`,
        domain: 'vehicle', target: v.name, action: 'administrative',
        priority: v.administrativeRisk.score, level: v.administrativeRisk.level,
        message: `Perbarui dokumen legal ${v.name}`,
        reasons: v.administrativeRisk.reasons,
      });
    }
  }
  if (finance && ['HIGH', 'CRITICAL'].includes(finance.pettyCashRisk.level)) {
    recs.push({
      id: 'finance:pettycash:replenish',
      domain: 'finance', target: 'Petty Cash', action: 'replenish',
      priority: finance.pettyCashRisk.score, level: finance.pettyCashRisk.level,
      message: 'Isi ulang / tinjau anggaran petty cash',
      reasons: finance.pettyCashRisk.reasons,
    });
  }
  if (dispatch && ['HIGH', 'CRITICAL'].includes(dispatch.capacityRisk.level)) {
    recs.push({
      id: 'dispatch:capacity:relieve',
      domain: 'dispatch', target: 'Dispatch', action: 'relieve-capacity',
      priority: dispatch.capacityRisk.score, level: dispatch.capacityRisk.level,
      message: 'Tambah kapasitas atau seimbangkan beban dispatch',
      reasons: dispatch.capacityRisk.reasons,
    });
  }

  // Deterministic order: most urgent first, tie-broken by stable id.
  recs.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  return Object.freeze(recs.map((r) => Object.freeze({ ...r, reasons: Object.freeze([...r.reasons]) })));
}

/* ── configuration (frozen; every rule threshold lives here) ─────────────────── */

export const PREDICTION_CONFIG = Object.freeze({
  // Driver
  recoveryTargetDays: 2,
  healthyStreakDays: 3,
  burnoutRecoveryThreshold: 60,
  // Vehicle
  vehicleAgeGrace: 5,      // years before age begins contributing to risk
  vehicleAgeSpan: 12,      // years over which age risk ramps to full
  vehicleUtilCeil: 80,     // utilization above this begins to add risk
  // Dispatch
  dispatchUtilCeil: 85,
  backlogPerUnit: 12,      // risk points per pending request
  // Finance
  cashLowRatio: 0.25,      // remaining ≤ 25% flags depletion
  velocityGain: 3,
  velocityWarnRatio: 0.2,  // avg spend ≥ 20% of budget/period is fast
  // Executive
  opportunityRiskCeil: 25, // domain risk below this is an opportunity
});

/* ── deep freeze (guarantees the whole model is immutable) ───────────────────── */

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  return obj;
}

/* ── time resolution (the ONE sanctioned clock read) ─────────────────────────── */

function resolveGeneratedAt(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now.toISOString();
  if (typeof now === 'number' && Number.isFinite(now)) return new Date(now).toISOString();
  if (typeof now === 'string' && now) { const t = Date.parse(now); if (!Number.isNaN(t)) return new Date(t).toISOString(); }
  // Only when the caller omits `now` — the single non-deterministic field.
  return new Date().toISOString();
}
function resolveNowYear(now) {
  const iso = resolveGeneratedAt(now);
  return Number(iso.slice(0, 4));
}

/* ════════════════════════════════════════════════════════════════════════════
   PUBLIC API — buildPredictionModel(input) → immutable PredictionModel.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} input                Existing platform models + raw collections (all optional).
 * @param {Date|number|string} [input.now]        Reference time. Pass it for deterministic output.
 * @param {Array}  [input.drivers]       Raw driver roster (fallback when wellness is absent).
 * @param {Array}  [input.vehicles]      Raw vehicle asset records.
 * @param {Array}  [input.assignments]   Raw assignments (reserved; not required by the foundation).
 * @param {Object} [input.wellness]      Driver Wellness model  (primary driver signal source).
 * @param {Object} [input.dispatch]      Dispatch Analytics model.
 * @param {Object} [input.recommendation] Recommendation Accuracy model.
 * @param {Object} [input.vehicleAnalytics] Vehicle/Fleet Analytics model (reserved).
 * @param {Object} [input.finance]       Petty Cash Analytics model.
 * @param {Object} [config]              Threshold overrides (merged over PREDICTION_CONFIG).
 * @returns {Readonly<Object>} PredictionModel — deep-frozen.
 */
export function buildPredictionModel(input = {}, config = {}) {
  const src = isObj(input) ? input : {};
  const cfg = Object.freeze({ ...PREDICTION_CONFIG, ...(isObj(config) ? config : {}) });
  const generatedAt = resolveGeneratedAt(src.now);
  const nowYear = resolveNowYear(src.now);

  // 1) Normalize the inputs (read-only projections of the existing models).
  const nDrivers = normDrivers(src);
  const nVehicles = normVehicles(src);

  // 2) Per-entity domain predictions.
  const drivers = nDrivers.map((d) => predictDriver(d, cfg));
  const vehicles = nVehicles.map((v) => predictVehicle(v, cfg, nowYear));

  // 3) Aggregate domain predictions.
  const dispatch = predictDispatch(src, drivers, vehicles, cfg);
  const finance = predictFinance(src, cfg);

  // 4) Coverage → executive roll-up.
  const coverage = {
    drivers: nDrivers.length > 0,
    vehicles: nVehicles.length > 0,
    dispatch: isObj(src.dispatch) || isObj(src.recommendation) || drivers.length > 0 || vehicles.length > 0,
    finance: isObj(src.finance),
  };
  const executive = predictExecutive({ drivers, vehicles, dispatch, finance, coverage }, cfg);

  // 5) Forward-looking recommendations distilled from every domain.
  const recommendations = buildRecommendations(drivers, vehicles, finance, dispatch);

  const model = {
    schema: PREDICTION_SCHEMA,
    generatedAt,
    deterministic: src.now != null,   // false only signals generatedAt used the wall clock
    coverage,
    executive,
    drivers,
    vehicles,
    dispatch,
    finance,
    recommendations,
  };

  return deepFreeze(model);
}

export default buildPredictionModel;
