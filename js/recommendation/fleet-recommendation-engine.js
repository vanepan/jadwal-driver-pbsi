/* ============================================================
   FLEET-RECOMMENDATION-ENGINE.JS — Fleet Recommendation Engine (v1.19.7)

   The platform already answers "what will happen?" (Prediction) and "why will it
   happen?" (Explainability). This module answers the next question:

     "What should the administrator DO about it?"

   It transforms a CERTIFIED prediction into concrete, explainable, operational
   recommendations — each one answering What? · Why? · How urgent? · Expected
   benefit? — and always referencing the prediction it came from.

   ── CONSUMES CERTIFIED PREDICTION ONLY — NEVER RE-PREDICTS ────────────────────
   This file computes NO prediction and invents NO risk score. It NEVER imports
   the Prediction Engine, Validator, Provider or Service. It is handed a model the
   Prediction Service already certified (built once by the caller through
   getPrediction) and ARRANGES it into recommendations, reusing the PURE Fleet
   Explainability layer (js/prediction/explainability.js) for the dominant risk,
   confidence and prediction window, and the priority grammar
   (recommendation-priority.js) for urgency + execution window. Every field is a
   presentation arrangement of an already-certified value.

   ── RECOMMENDATION PHILOSOPHY (spec) ─────────────────────────────────────────
   Recommendations are NEVER generic ("monitor vehicle", "observe condition").
   Each is an OPERATIONAL action ("schedule maintenance within 3 days", "assign a
   replacement for high-utilization routes", "renew STNK before availability
   drops"), and each carries: category · title · priority · confidence · reason ·
   expected benefit · estimated impact · prediction reference · timeline ·
   operational notes · dependencies · source. When nothing is required the
   recommendation is a positive "No Action Required" — the fleet is healthy, not
   ignored.

   ── CONTRACT (v1.19 foundation, unchanged) ───────────────────────────────────
     • PURE — no window, document, DOM, network, storage, timers, randomness.
     • DETERMINISTIC — the same certified model ⇒ byte-identical recommendations.
     • CACHED — per-projection + per-model derivations memoized (WeakMap) so the
       drawer and dashboard never recompute; a new certified model self-invalidates.
     • NODE-TESTABLE — every export is a plain function of its inputs.

   API (all pure):
     buildVehicleRecommendation(projection)  → Recommendation
     buildFleetRecommendations(model)         → Recommendation[]
     fleetOptimizations(model)                → Recommendation[]
     allRecommendations(model)                → Recommendation[]
     RECOMMENDATION_SOURCE                     → string[] (Recommendation Source)
   ============================================================ */

'use strict';

import {
  dominantRisk,
  confidenceAnalytics,
  predictionWindow,
  operationalNotes,
} from '../prediction/explainability.js';
import { priorityFor, priorityRank, timelineFor } from './recommendation-priority.js';

/* ── tiny pure helpers ──────────────────────────────────────────────────────── */

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function arr(v) { return Array.isArray(v) ? v : []; }
function firstReason(pred) {
  const reasons = arr(pred && pred.reasons).filter(Boolean);
  if (reasons.length) return String(reasons[0]);
  if (pred && pred.summary) return String(pred.summary);
  return 'Diproyeksikan dari sinyal operasional yang tersedia.';
}

/* ── The certified vocabulary the engine surfaces (never internals) ──────────── */

/* Every recommendation belongs to exactly one category. `label` is the
   user-facing Indonesian word; `icon` is a VALID analytics-shell glyph name
   (check / alert / pulse / vehicle-car / tool-wrench / doc-shield / analytics —
   the set the sibling dashboards already use). */
export const CATEGORIES = Object.freeze({
  maintenance:        { key: 'maintenance',        label: 'Perawatan',          icon: 'tool-wrench' },
  utilization:        { key: 'utilization',        label: 'Utilisasi',          icon: 'pulse' },
  availability:       { key: 'availability',       label: 'Ketersediaan',       icon: 'vehicle-car' },
  administration:     { key: 'administration',     label: 'Administrasi',       icon: 'doc-shield' },
  'fleet-optimization': { key: 'fleet-optimization', label: 'Optimasi Armada',  icon: 'analytics' },
  preventive:         { key: 'preventive',         label: 'Tindakan Preventif', icon: 'pulse' },
  monitoring:         { key: 'monitoring',         label: 'Pemantauan',         icon: 'pulse' },
  none:               { key: 'none',               label: 'Tanpa Tindakan',     icon: 'check' },
});

const KIND_LABEL = { maintenance: 'Perawatan', administrative: 'Administrasi', availability: 'Ketersediaan' };

/* Estimated operational impact — a qualitative band read from the certified risk
   level (the higher the certified band, the greater the downside avoided). It is
   a LABEL over the certified level, not a new number. */
function estimatedImpact(level) {
  if (level === 'CRITICAL' || level === 'HIGH') return { key: 'high', label: 'Tinggi', tone: 'danger' };
  if (level === 'ELEVATED') return { key: 'medium', label: 'Sedang', tone: 'warn' };
  if (level === 'MODERATE') return { key: 'low', label: 'Rendah', tone: 'info' };
  return { key: 'minimal', label: 'Minimal', tone: 'ok' };
}

/* The operational benefit each category delivers — the "why act" in one line. */
const EXPECTED_BENEFIT = Object.freeze({
  maintenance: 'Mengurangi downtime yang diproyeksikan.',
  administration: 'Mencegah kendaraan tidak dapat dioperasikan karena dokumen kedaluwarsa.',
  availability: 'Menjaga ketersediaan armada untuk rute prioritas.',
  utilization: 'Menyeimbangkan beban penggunaan dan mengurangi keausan.',
  preventive: 'Mencegah eskalasi risiko lebih dini.',
  monitoring: 'Mendeteksi perubahan kondisi lebih awal.',
  'fleet-optimization': 'Meningkatkan efisiensi pemanfaatan armada.',
  none: 'Mempertahankan kesiapan armada.',
});

/* The concrete operational dependencies each action relies on — never generic. */
const DEPENDENCIES = Object.freeze({
  maintenance: ['Ketersediaan slot bengkel', 'Konfirmasi jadwal operasional'],
  administration: ['Dokumen STNK/pajak terbaru', 'Koordinasi administrasi'],
  availability: ['Armada pengganti tersedia', 'Penjadwalan ulang rute'],
  utilization: ['Data rotasi penggunaan', 'Ketersediaan kendaraan alternatif'],
  preventive: ['Jadwal inspeksi', 'Petugas pemeriksa'],
  monitoring: ['Pemantauan berkala'],
  'fleet-optimization': ['Kapasitas armada', 'Perencanaan rute'],
  none: [],
});

/* The Recommendation Source — identifies WHERE the recommendation originates,
   without exposing implementation details (spec: Recommendation Explainability). */
export const RECOMMENDATION_SOURCE = Object.freeze([
  'Prediction Service',
  'Explainability Layer',
  'Certified Model',
]);

/* A high-utilization read on the certified utilization trend — used only to pick
   between an availability action (assign a replacement) and a utilization action
   (rotate usage). It is a presentation branch over a certified value, not a new
   score; when no utilization figure exists it is simply false. */
function highUtilization(projection) {
  const t = (projection && projection.utilizationTrend) || {};
  return typeof t.current === 'number' && t.current >= 75;
}

/**
 * Resolve the category + whether an action is warranted from the dominant risk.
 * A pure lookup on the certified band + kind; adds no risk logic.
 */
function resolveCategory(kind, level, projection) {
  if (level === 'CRITICAL' || level === 'HIGH') {
    if (kind === 'maintenance') return { category: 'maintenance', actionable: true };
    if (kind === 'administrative') return { category: 'administration', actionable: true };
    // availability-dominant: rotate a heavily-used vehicle, else assign a spare.
    return { category: highUtilization(projection) ? 'utilization' : 'availability', actionable: true };
  }
  if (level === 'ELEVATED') return { category: 'preventive', actionable: true };
  if (level === 'MODERATE') return { category: 'monitoring', actionable: false };
  return { category: 'none', actionable: false };
}

/** The operational, non-generic title for a recommendation. */
function buildTitle(category, name, windowLabel) {
  const w = String(windowLabel || '7 Hari').toLowerCase();
  switch (category) {
    case 'maintenance':    return `Jadwalkan perawatan ${name} dalam ${w}`;
    case 'administration': return `Perbarui dokumen legal ${name} sebelum ketersediaan menurun`;
    case 'availability':   return `Siapkan armada pengganti untuk ${name}`;
    case 'utilization':    return `Rotasi penggunaan ${name} pada ${w}`;
    case 'preventive':     return `Tingkatkan frekuensi inspeksi preventif ${name}`;
    case 'monitoring':     return `Pantau ketat kondisi ${name}`;
    default:               return `${name} beroperasi normal`;
  }
}

/* ── memoization — one recommendation per frozen projection reference ──────────
   The Prediction Service deep-freezes every model and returns the same frozen
   reference for a structurally-equal input, so a WeakMap keyed on the projection
   (drawer) / model (dashboard) is a safe, self-invalidating cache. */
const _vehMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _fleetMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

/**
 * Build the single enriched Recommendation for one certified per-vehicle
 * projection (model.vehicles[i]). Answers What / Why / Priority / Expected
 * benefit, and references the prediction it was distilled from.
 * @param {Object} projection  a certified `model.vehicles[i]`
 * @returns {Object} a frozen Recommendation
 */
export function buildVehicleRecommendation(projection) {
  if (!projection || typeof projection !== 'object') return null;
  if (_vehMemo && _vehMemo.has(projection)) return _vehMemo.get(projection);

  const { pred, kind } = dominantRisk(projection);
  const level = pred.level || 'LOW';
  const name = String(projection.name || '—');
  const vehicleId = String(projection.id != null ? projection.id : name);

  const { category, actionable } = resolveCategory(kind, level, projection);
  const cat = CATEGORIES[category] || CATEGORIES.none;
  const win = predictionWindow(projection);
  const ca = confidenceAnalytics(projection);
  const priority = priorityFor(level, actionable);
  const timeline = actionable ? timelineFor(level, kind) : timelineFor('LOW', kind);
  const impact = actionable ? estimatedImpact(level) : estimatedImpact('LOW');

  const rec = Object.freeze({
    id: `${vehicleId}:${category}`,
    vehicleId,
    vehicleName: name,
    category,
    categoryLabel: cat.label,
    icon: cat.icon,
    actionable,
    title: buildTitle(category, name, win.label),
    priority,                                   // { key,label,tone,rank }
    confidence: Object.freeze({                 // certified confidence, reused as-is
      score: ca.score, level: ca.level, levelWord: ca.levelWord, tone: ca.tone,
    }),
    reason: firstReason(pred),
    expectedBenefit: EXPECTED_BENEFIT[category] || EXPECTED_BENEFIT.none,
    estimatedImpact: impact,                    // { key,label,tone }
    // Prediction Reference — every recommendation points back at its prediction.
    predictionRef: Object.freeze({
      kind,
      kindLabel: KIND_LABEL[kind] || 'Operasional',
      level,
      levelLabel: pred.levelLabelId || '—',
      tone: pred.tone || 'info',
      window: win.label,
      methodology: 'Prakiraan Statistik Deterministik',
    }),
    timeline: Object.freeze({ key: timeline.key, label: timeline.label, note: timeline.note, order: timeline.order }),
    operationalNotes: Object.freeze(operationalNotes(projection).slice()),
    dependencies: Object.freeze((DEPENDENCIES[category] || []).slice()),
    source: RECOMMENDATION_SOURCE,
    rank: priorityRank(priority.key),
  });

  if (_vehMemo) _vehMemo.set(projection, rec);
  return rec;
}

/** Deterministic ordering: most urgent first, then most-confident, then name. */
function byUrgency(a, b) {
  return a.rank - b.rank
    || num(b.confidence.score) - num(a.confidence.score)
    || String(a.vehicleName).localeCompare(String(b.vehicleName));
}

/**
 * Build one recommendation per certified vehicle projection, ranked by urgency.
 * @param {Object} model  the certified prediction model
 * @returns {Array<Object>} frozen Recommendation[]
 */
export function buildFleetRecommendations(model) {
  if (!model || typeof model !== 'object') return [];
  if (_fleetMemo && _fleetMemo.has(model)) return _fleetMemo.get(model).vehicles;
  const vehicles = arr(model.vehicles).filter(Boolean).map(buildVehicleRecommendation).filter(Boolean);
  vehicles.sort(byUrgency);
  const frozen = Object.freeze(vehicles);
  if (_fleetMemo) _fleetMemo.set(model, { vehicles: frozen, opt: null });
  return frozen;
}

/**
 * Fleet-level OPTIMIZATION recommendations distilled from the certified
 * executive OPPORTUNITIES (domains that are notably healthy). These are the
 * "where can we do better?" actions — not tied to a single at-risk vehicle, but
 * still referencing a certified signal. Positive, informational priority.
 * @param {Object} model  the certified prediction model
 * @returns {Array<Object>} frozen Recommendation[]
 */
export function fleetOptimizations(model) {
  if (!model || typeof model !== 'object') return [];
  const cached = _fleetMemo && _fleetMemo.get(model);
  if (cached && cached.opt) return cached.opt;

  const opps = arr(model.executive && model.executive.opportunities).filter(Boolean);
  const cat = CATEGORIES['fleet-optimization'];
  const out = opps
    .filter((o) => o.domain === 'vehicle')
    .map((o) => Object.freeze({
      id: `fleet:${o.domain}:optimization`,
      vehicleId: null,
      vehicleName: 'Armada',
      category: 'fleet-optimization',
      categoryLabel: cat.label,
      icon: cat.icon,
      actionable: true,
      title: 'Manfaatkan peluang optimasi armada',
      priority: priorityFor('LOW', false),      // informational — an opportunity, not a risk
      confidence: Object.freeze({ score: num(o.score), level: 'HIGH', levelWord: 'Tinggi', tone: 'ok' }),
      reason: String(o.message || 'Domain kendaraan berada dalam kondisi sehat.'),
      expectedBenefit: EXPECTED_BENEFIT['fleet-optimization'],
      estimatedImpact: { key: 'opportunity', label: 'Peluang', tone: 'ok' },
      predictionRef: Object.freeze({
        kind: 'opportunity', kindLabel: 'Peluang', level: 'LOW', levelLabel: 'Sehat',
        tone: 'ok', window: '7 Hari', methodology: 'Prakiraan Statistik Deterministik',
      }),
      timeline: Object.freeze({ key: 'later', label: 'Selanjutnya', note: 'Optimasi berkelanjutan', order: 4 }),
      operationalNotes: Object.freeze([String(o.message || '')].filter(Boolean)),
      dependencies: Object.freeze((DEPENDENCIES['fleet-optimization'] || []).slice()),
      source: RECOMMENDATION_SOURCE,
      rank: priorityRank('informational'),
    }));

  const frozen = Object.freeze(out);
  if (cached) _fleetMemo.set(model, { vehicles: cached.vehicles, opt: frozen });
  return frozen;
}

/**
 * All recommendations for a certified model: per-vehicle actions first (by
 * urgency), then fleet optimization opportunities.
 * @param {Object} model  the certified prediction model
 * @returns {Array<Object>} frozen Recommendation[]
 */
export function allRecommendations(model) {
  return Object.freeze([...buildFleetRecommendations(model), ...fleetOptimizations(model)]);
}

export default {
  CATEGORIES,
  RECOMMENDATION_SOURCE,
  buildVehicleRecommendation,
  buildFleetRecommendations,
  fleetOptimizations,
  allRecommendations,
};
