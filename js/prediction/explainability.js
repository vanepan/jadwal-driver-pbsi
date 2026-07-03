/* ============================================================
   EXPLAINABILITY.JS — Fleet Explainability & Prediction Analytics (v1.19.6)

   Prediction answers "what is likely to happen?". This module answers
   "WHY does the platform believe this prediction?" — the explainability and
   analytics layer that turns a certified per-vehicle projection into executive,
   plain-language transparency.

   ── PURE DERIVATION ONLY ─────────────────────────────────────────────────────
   This file computes NO prediction. It NEVER imports the prediction engine,
   validator, provider or service. It only ARRANGES data the Prediction Service
   already certified (a `model.vehicles[i]` projection: the `{ score, level,
   confidence, confidenceLevel, reasons, signals }` risks the engine emitted, and
   the fleet-level `model.executive` / `model.recommendations`). It invents no new
   metric, no new score, and adds ZERO business rules. Every percentage surfaced
   here is a presentation arrangement of an already-certified value.

   ── WHAT IT EXPOSES (and what it never does) ─────────────────────────────────
   The engine's per-risk `signals` carry INTERNAL evidence — `{ id, label, value,
   weight, contribution, reason }`. The dashboards deliberately hide these. The
   EXPLAINABILITY layer surfaces them, but ONLY as plain operational language: a
   factor's `weight` becomes its "contribution / relative importance" (a share of
   the decision, not a formula), and its `reason` becomes the operational
   explanation. Raw signal `value`, validator terminology, weighting maths and
   thresholds are NEVER exposed.

   ── CONTRACT (v1.19 foundation, unchanged) ───────────────────────────────────
     • PURE — no window, document, DOM, network, storage, timers.
     • DETERMINISTIC — same certified projection ⇒ byte-identical derivation.
     • CACHED — derivations are memoized per frozen projection reference (WeakMap),
       so re-opening a drawer never recomputes. Cache invalidates automatically
       when the service produces a new frozen model.
     • NODE-TESTABLE — every export is a plain function of its inputs.

   API (all pure):
     contributingFactors(projection)      → Factor[]
     confidenceAnalytics(projection)       → ConfidenceAnalysis
     historicalComparison(projection, prev)→ HistoricalComparison
     predictionMethodology()               → Methodology
     predictionWindow(projection)          → Window
     dataCoverage(projection)              → Coverage
     limitations(projection)               → string[]
     operationalNotes(projection, recMsg?) → string[]
     dominantRisk(projection)              → { pred, kind }
     fleetHeatmap(model)                   → HeatCell[]
     executiveInsights(model)              → Insight[]
   ============================================================ */

'use strict';

/* ── tiny pure helpers ──────────────────────────────────────────────────────── */

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function arr(v) { return Array.isArray(v) ? v : []; }
function clampPct(n) { return Math.max(0, Math.min(100, Math.round(num(n)))); }

/* Confidence is presented as ONE operational word — never a formula, a validator
   term, or the underlying maths. LOW/MEDIUM/HIGH is the only vocabulary exposed. */
const CONF_WORD = { HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' };
const CONF_TONE = { HIGH: 'ok', MEDIUM: 'info', LOW: 'warn' };
export function confWord(level) { return CONF_WORD[level] || 'Rendah'; }
export function confTone(level) { return CONF_TONE[level] || 'warn'; }

/* The three forward-looking risks the vehicle engine emits, in the order the
   dashboards headline them. */
const RISK_KINDS = [
  { key: 'maintenance', field: 'maintenanceRisk', title: 'Perawatan' },
  { key: 'administrative', field: 'administrativeRisk', title: 'Administrasi' },
  { key: 'availability', field: 'availabilityForecast', title: 'Ketersediaan' },
];

/**
 * Which of a projection's risks is the dominant (most severe) one — the same
 * pick the dashboards headline. Computes no new risk; it only SELECTS the highest
 * already-certified score. Shared so the drawer, dashboard and this module never
 * disagree on which risk explains the headline.
 * @returns {{ pred: Object, kind: string, title: string }}
 */
export function dominantRisk(projection) {
  const p = projection && typeof projection === 'object' ? projection : {};
  let dom = { pred: p[RISK_KINDS[0].field] || {}, kind: RISK_KINDS[0].key, title: RISK_KINDS[0].title };
  for (const rk of RISK_KINDS) {
    const pred = p[rk.field] || {};
    if (num(pred.score) > num(dom.pred.score)) dom = { pred, kind: rk.key, title: rk.title };
  }
  return dom;
}

/* ── memoization — one derivation set per frozen projection reference ─────────
   The service deep-freezes every model, and a structurally-equal input returns
   the SAME frozen reference, so a WeakMap keyed on the projection is a safe,
   self-invalidating cache (a new model ⇒ new reference ⇒ fresh derivation; the
   old entry is GC'd). Non-object inputs bypass the cache. */
const _memo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function memoized(projection, key, compute) {
  if (!_memo || !projection || typeof projection !== 'object') return compute();
  let bucket = _memo.get(projection);
  if (!bucket) { bucket = {}; _memo.set(projection, bucket); }
  if (!(key in bucket)) bucket[key] = compute();
  return bucket[key];
}

/* ── Contributing Factors ─────────────────────────────────────────────────────
   Visualize WHY a prediction exists. Reads the dominant risk's already-certified
   `signals` (the factors that had real data), and presents each as:
     • contribution  — its share of the decision (%), the signal's own `weight`,
     • importance     — a plain band (Tinggi / Sedang / Rendah) of that share,
     • explanation    — the operational reason the engine attached, or a neutral
                        in-range sentence when the factor stayed below threshold.
   No formula, no raw signal value, no weighting maths is exposed. */

/* Signal id → executive, operational Indonesian label. Ids are unique within a
   risk; a couple recur across risks with a compatible meaning, so one label each
   reads correctly wherever the dominant risk surfaces it. */
const FACTOR_LABEL = {
  operational: 'Kesehatan Operasional',
  utilization: 'Utilisasi Kendaraan',
  age: 'Usia Kendaraan',
  status: 'Status Operasional',
  stnk: 'Status STNK',
  tax: 'Status Pajak',
  insurance: 'Status Asuransi',
  documents: 'Kelengkapan Dokumen',
  maintenance: 'Proyeksi Perawatan',
  administrative: 'Status Administratif',
};

/** A plain band for a factor's share of the decision (never the raw weight maths). */
function importanceBand(sharePct) {
  if (sharePct >= 33) return { key: 'high', label: 'Tinggi' };
  if (sharePct >= 18) return { key: 'medium', label: 'Sedang' };
  return { key: 'low', label: 'Rendah' };
}

/**
 * @param {Object} projection  a certified `model.vehicles[i]`
 * @returns {Array<{ id, label, contribution, importanceKey, importanceLabel, tone, explanation }>}
 *          ordered by contribution desc (already the engine's order). Empty when
 *          the projection carries no factor evidence.
 */
export function contributingFactors(projection) {
  return memoized(projection, 'factors', () => {
    const { pred } = dominantRisk(projection);
    const signals = arr(pred.signals).filter(Boolean);
    if (!signals.length) return [];
    // The engine's `weight` is already each factor's share of THIS decision (it
    // sums to ~100 across available signals). We surface it verbatim as the
    // contribution; no renormalization invents a number. Ordered by that share
    // desc (tie-broken by id) so the visualization descends cleanly — the engine
    // orders signals by contribution POINTS, a different axis from the share we
    // headline, so we re-order for a coherent read.
    return signals.map((s) => {
      const contribution = clampPct(s.weight);
      const band = importanceBand(contribution);
      const label = FACTOR_LABEL[s.id] || s.label || 'Faktor Operasional';
      const explanation = s.reason
        ? String(s.reason)
        : `${label} berada dalam batas normal dan hanya berkontribusi kecil terhadap proyeksi.`;
      return {
        id: String(s.id || label),
        label,
        contribution,
        importanceKey: band.key,
        importanceLabel: band.label,
        tone: pred.tone || 'info',
        explanation,
      };
    }).sort((a, b) => b.contribution - a.contribution || a.id.localeCompare(b.id));
  });
}

/* ── Confidence Analytics ─────────────────────────────────────────────────────
   Expand the single "75%" into an executive confidence analysis, using ONLY the
   certified confidence the engine already produced. `confidence` IS the evidence
   coverage the engine measured (share of the intended weighting that had real
   data behind it), so we present it as coverage — we never recompute it. */

/**
 * @param {Object} projection  a certified `model.vehicles[i]`
 * @returns {{ score, level, levelWord, tone, coveragePct, factorsUsed,
 *             missingFactors, windowLabel }}
 */
export function confidenceAnalytics(projection) {
  return memoized(projection, 'confidence', () => {
    const { pred } = dominantRisk(projection);
    const level = pred.confidenceLevel || 'LOW';
    const score = clampPct(pred.confidence);
    const factorsUsed = arr(pred.signals).filter(Boolean).length;
    return {
      score,
      level,
      levelWord: confWord(level),
      tone: confTone(level),
      // Confidence is the engine's own evidence-coverage measure — reused as-is.
      coveragePct: score,
      factorsUsed,
      // The share of the decision the model could NOT support with data.
      missingFactors: Math.max(0, 100 - score),
      windowLabel: predictionWindow(projection).label,
    };
  });
}

/* ── Historical Trend ─────────────────────────────────────────────────────────
   Compare this prediction with a previous one. The certified projection carries a
   `utilizationTrend` ({ direction, deltaPct, current, previous }); when a real
   previous value exists we present the change, otherwise an informative executive
   message. We NEVER fabricate a prior snapshot. */

/**
 * @param {Object} projection  a certified `model.vehicles[i]`
 * @returns {{ available, current, previous, deltaPct, direction, tone, message }}
 */
export function historicalComparison(projection) {
  return memoized(projection, 'history', () => {
    const t = (projection && projection.utilizationTrend) || {};
    const hasPrev = t.available === true && typeof t.previous === 'number' && typeof t.current === 'number';
    if (!hasPrev) {
      return {
        available: false,
        current: typeof t.current === 'number' ? t.current : null,
        previous: null,
        deltaPct: null,
        direction: 'unknown',
        tone: 'info',
        message: 'Perbandingan historis belum tersedia. Riwayat operasional tambahan akan memperkaya penjelasan prediksi berikutnya.',
      };
    }
    const delta = Math.round(num(t.current) - num(t.previous));
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return {
      available: true,
      current: clampPct(t.current),
      previous: clampPct(t.previous),
      deltaPct: delta,
      direction,
      tone: direction === 'up' ? 'ok' : direction === 'down' ? 'warn' : 'info',
      message: direction === 'flat'
        ? 'Proyeksi stabil dibanding periode sebelumnya.'
        : `Proyeksi ${direction === 'up' ? 'membaik' : 'menurun'} ${Math.abs(delta)} poin dibanding periode sebelumnya.`,
    };
  });
}

/* ── Prediction Methodology ───────────────────────────────────────────────────
   An executive descriptor of HOW the forecast is produced — plain language,
   never implementation details, signals, weights or thresholds. Static because
   the method is a platform property, not a per-vehicle value. */

export function predictionMethodology() {
  return {
    type: 'Prakiraan Statistik Deterministik',
    methods: [
      'Rata-rata bergerak berbobot',
      'Frekuensi historis',
      'Proyeksi tren linear',
      'Estimasi interval perawatan',
    ],
    purpose: 'Prakiraan operasional ke depan',
    audience: 'Dukungan keputusan eksekutif',
    note: 'Prediksi bersifat deterministik: data yang sama menghasilkan proyeksi yang sama.',
  };
}

/* ── Prediction Window ────────────────────────────────────────────────────────
   The horizon this projection speaks to. Urgent maintenance is called out at
   3 days; everything else at the standard 7-day horizon (the engine's window).
   This mirrors the dashboards; it introduces no new number. */

export function predictionWindow(projection) {
  const { pred, kind } = dominantRisk(projection);
  const urgent = kind === 'maintenance' && (pred.level === 'HIGH' || pred.level === 'CRITICAL');
  return urgent
    ? { label: '3 Hari', days: 3, note: 'Perawatan mendesak diproyeksikan dalam 3 hari.' }
    : { label: '7 Hari', days: 7, note: 'Proyeksi kesiapan untuk 7 hari ke depan.' };
}

/* ── Data Coverage ────────────────────────────────────────────────────────────
   How much evidence supports the prediction, expressed as the engine's own
   coverage measure plus the count of operational factors that had data. Honest:
   we present coverage and factor counts, never fabricated record totals. */

export function dataCoverage(projection) {
  return memoized(projection, 'coverage', () => {
    const ca = confidenceAnalytics(projection);
    const factors = contributingFactors(projection);
    const level = ca.coveragePct >= 70 ? { word: 'Baik', tone: 'ok' }
      : ca.coveragePct >= 40 ? { word: 'Cukup', tone: 'warn' }
        : { word: 'Terbatas', tone: 'danger' };
    return {
      coveragePct: ca.coveragePct,
      coverageWord: level.word,
      coverageTone: level.tone,
      factorsUsed: factors.length,
      windowLabel: ca.windowLabel,
    };
  });
}

/* ── Limitations ──────────────────────────────────────────────────────────────
   Honest, positively-framed executive caveats derived from the certified
   confidence + coverage. Maintains enterprise language; never alarmist. */

export function limitations(projection) {
  return memoized(projection, 'limitations', () => {
    const ca = confidenceAnalytics(projection);
    const out = [];
    if (ca.level === 'LOW') {
      out.push('Keyakinan prediksi masih berkembang — perlakukan proyeksi sebagai indikatif hingga riwayat bertambah.');
    } else if (ca.level === 'MEDIUM') {
      out.push('Keyakinan prediksi sedang — proyeksi cukup andal namun akan menguat seiring bertambahnya data.');
    }
    if (ca.coveragePct < 60) {
      out.push('Sebagian faktor operasional belum memiliki data lengkap; cakupan akan meningkat seiring pencatatan rutin.');
    }
    if (!out.length) {
      out.push('Tidak ada keterbatasan berarti — cakupan data dan keyakinan prediksi sudah memadai.');
    }
    return out;
  });
}

/* ── Operational Notes ────────────────────────────────────────────────────────
   The "should action be taken?" answer, distilled from the dominant risk's own
   reasons and (optionally) the recommendation the service already produced. */

export function operationalNotes(projection, recommendationMessage) {
  const { pred } = dominantRisk(projection);
  const notes = [];
  const reasons = arr(pred.reasons).filter(Boolean);
  if (pred.level === 'HIGH' || pred.level === 'CRITICAL') {
    notes.push(recommendationMessage
      ? String(recommendationMessage)
      : 'Direkomendasikan menjadwalkan tindakan dalam jendela prediksi.');
  } else if (pred.level === 'ELEVATED') {
    notes.push('Pantau kesiapan kendaraan menjelang akhir jendela prediksi.');
  } else {
    notes.push('Tidak ada tindakan mendesak — pertahankan pemantauan rutin.');
  }
  if (reasons.length && !notes.includes(reasons[0])) notes.push(reasons[0]);
  return notes;
}

/* ── Fleet Heatmap ────────────────────────────────────────────────────────────
   An at-a-glance executive overview: one cell per vehicle, coloured by its
   dominant projected concern. Arranges certified projections only — selecting a
   cell opens the SAME enriched drawer (via the shared `data-vehicle-predict`
   contract the dashboard already binds). */

const HEAT_TONE_ORDER = { danger: 0, warn: 1, ok: 2, info: 3 };

/**
 * @param {Object} model  the certified prediction model
 * @returns {Array<{ id, name, tone, level, statusWord, headline }>} sorted
 *          most-concerning first (deterministic; tie-broken by name).
 */
export function fleetHeatmap(model) {
  const vehicles = arr(model && model.vehicles);
  return vehicles.map((v) => {
    const { pred, title } = dominantRisk(v);
    const isCrit = pred.level === 'HIGH' || pred.level === 'CRITICAL';
    const isWatch = !isCrit && pred.level === 'ELEVATED';
    const tone = isCrit ? 'danger' : isWatch ? 'warn' : 'ok';
    const statusWord = isCrit ? 'Kritis' : isWatch ? 'Waspada' : 'Aman';
    return {
      id: String(v.id != null ? v.id : v.name),
      name: String(v.name || '—'),
      tone,
      level: pred.level || 'LOW',
      statusWord,
      headline: isCrit ? `Risiko ${title.toLowerCase()} tinggi` : isWatch ? `Tekanan ${title.toLowerCase()} meningkat` : 'Diproyeksikan siap',
    };
  }).sort((a, b) =>
    (HEAT_TONE_ORDER[a.tone] - HEAT_TONE_ORDER[b.tone]) || a.name.localeCompare(b.name));
}

/* ── Executive Insights ───────────────────────────────────────────────────────
   Fleet-wide, certified-data-only insights an executive can read in seconds:
   highest / lowest confidence prediction, most influential factor, highest
   operational risk. Each is a SELECTION over already-certified projections — no
   new business logic. Returns only the insights that have supporting data. */

/**
 * @param {Object} model  the certified prediction model
 * @returns {Array<{ id, key, title, subject, value, detail, tone, icon, vehicleId }>}
 */
export function executiveInsights(model) {
  const vehicles = arr(model && model.vehicles).filter(Boolean);
  if (!vehicles.length) return [];
  const out = [];

  const byConf = vehicles
    .map((v) => ({ v, ca: confidenceAnalytics(v) }))
    .sort((a, b) => b.ca.score - a.ca.score || String(a.v.name).localeCompare(String(b.v.name)));
  const highConf = byConf[0];
  const lowConf = byConf[byConf.length - 1];

  if (highConf) {
    out.push({
      id: 'high-conf', key: 'highestConfidence', title: 'Keyakinan Tertinggi',
      subject: String(highConf.v.name), value: `${highConf.ca.score}%`,
      detail: `Proyeksi paling didukung data (${highConf.ca.levelWord.toLowerCase()}).`,
      tone: 'ok', icon: 'check', vehicleId: String(highConf.v.id != null ? highConf.v.id : highConf.v.name),
    });
  }
  if (lowConf && lowConf !== highConf) {
    out.push({
      id: 'low-conf', key: 'lowestConfidence', title: 'Keyakinan Terendah',
      subject: String(lowConf.v.name), value: `${lowConf.ca.score}%`,
      detail: 'Prediksi akan menguat seiring bertambahnya riwayat operasional.',
      tone: lowConf.ca.tone, icon: 'pulse', vehicleId: String(lowConf.v.id != null ? lowConf.v.id : lowConf.v.name),
    });
  }

  // Most influential factor across the fleet — the factor whose share of the
  // decision is highest anywhere. A selection over certified signals, no maths.
  let topFactor = null;
  for (const v of vehicles) {
    for (const f of contributingFactors(v)) {
      if (!topFactor || f.contribution > topFactor.contribution) topFactor = { f, v };
    }
  }
  if (topFactor) {
    out.push({
      id: 'top-factor', key: 'mostInfluentialFactor', title: 'Faktor Paling Berpengaruh',
      subject: topFactor.f.label, value: `${topFactor.f.contribution}%`,
      detail: `Paling menentukan proyeksi ${topFactor.v.name}.`,
      tone: 'info', icon: 'analytics', vehicleId: String(topFactor.v.id != null ? topFactor.v.id : topFactor.v.name),
    });
  }

  // Highest operational risk — the dominant-risk score leader.
  const byRisk = vehicles
    .map((v) => ({ v, dom: dominantRisk(v) }))
    .sort((a, b) => num(b.dom.pred.score) - num(a.dom.pred.score) || String(a.v.name).localeCompare(String(b.v.name)));
  const topRisk = byRisk[0];
  if (topRisk && (topRisk.dom.pred.level === 'HIGH' || topRisk.dom.pred.level === 'CRITICAL' || topRisk.dom.pred.level === 'ELEVATED')) {
    out.push({
      id: 'top-risk', key: 'highestOperationalRisk', title: 'Risiko Operasional Tertinggi',
      subject: String(topRisk.v.name), value: topRisk.dom.pred.levelLabelId || '—',
      detail: `Prioritas ${topRisk.dom.title.toLowerCase()} — tindak dalam jendela prediksi.`,
      tone: topRisk.dom.pred.tone || 'warn', icon: 'alert',
      vehicleId: String(topRisk.v.id != null ? topRisk.v.id : topRisk.v.name),
    });
  }

  return out;
}

export default {
  dominantRisk,
  contributingFactors,
  confidenceAnalytics,
  historicalComparison,
  predictionMethodology,
  predictionWindow,
  dataCoverage,
  limitations,
  operationalNotes,
  fleetHeatmap,
  executiveInsights,
  confWord,
  confTone,
};
