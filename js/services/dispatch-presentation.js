/* ============================================================
   DISPATCH-PRESENTATION.JS — Auto Assignment Assistant (v1.16.4.12)

   PURE PRESENTATION DERIVATIONS for the admin approval experience. This layer
   adds NO scoring and NO recommendation logic — it only RESHAPES the values the
   Dispatch Intelligence engines already produced into the things the approval UI
   shows: a confidence band, a score composition that totals to the dispatch
   score, a plain-language explanation, and the AI↔Admin comparison.

   It deliberately does NOT import any engine: the caller passes the diagnostics
   the engines already computed (driverScore / vehicleScore / sub-score
   breakdowns) and these helpers map them to display shapes. Nothing here can
   change a score — the math only re-expresses the engine's own weighting.

   PURE: no DOM, no Firebase, no `window`. Used by the approval-intelligence
   panel (DOM) and validated directly by scripts/dispatch-presentation-check.mjs.
   ============================================================ */

'use strict';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Confidence bands — purely a re-expression of the dispatch score (0–100).
 *  The score itself is NEVER recomputed here; this only labels it. */
export const CONFIDENCE_BANDS = Object.freeze([
  { min: 95, stars: 5, level: 'SANGAT_TINGGI', label: 'Sangat Tinggi' },
  { min: 85, stars: 4, level: 'TINGGI',        label: 'Tinggi' },
  { min: 70, stars: 3, level: 'SEDANG',        label: 'Sedang' },
  { min: 0,  stars: 2, level: 'PERLU_REVIEW',  label: 'Perlu Review' },
]);

const TOTAL_STARS = 5;

/**
 * Band a dispatch score into a confidence badge. Presentation only.
 *   95–100 → ★★★★★ Sangat Tinggi · 85–94 → ★★★★☆ Tinggi
 *   70–84  → ★★★☆☆ Sedang        · <70   → ★★☆☆☆ Perlu Review
 * @param {number} score 0–100 dispatch score
 * @returns {{ level:string, label:string, stars:number, totalStars:number, glyph:string, score:number }}
 */
export function confidenceFromScore(score) {
  const s = clamp(Math.round(num(score)), 0, 100);
  const band = CONFIDENCE_BANDS.find((b) => s >= b.min) || CONFIDENCE_BANDS[CONFIDENCE_BANDS.length - 1];
  return {
    level: band.level,
    label: band.label,
    stars: band.stars,
    totalStars: TOTAL_STARS,
    glyph: '★'.repeat(band.stars) + '☆'.repeat(TOTAL_STARS - band.stars),
    score: s,
  };
}

/**
 * Compose the dispatch score into its DRIVER and VEHICLE contributions — the
 * exact two terms the Dispatch Scoring Engine fuses:
 *   dispatch = (driverScore·Wd + vehicleScore·Wv) / (Wd + Wv)
 * The driver term is rounded and the vehicle term takes the remainder, so the
 * two points ALWAYS sum to the displayed dispatch score (no rounding drift). No
 * scoring is duplicated — this only re-expresses the engine's own weighting.
 *
 * @param {{driverScore:number, vehicleScore:number, dispatchScore:number}} diag
 * @param {{driver:number, vehicle:number}} weights
 * @returns {{ rows:Array<{key:string,label:string,score:number,weightPct:number,points:number}>, total:number }}
 */
export function buildScoreBreakdown(diag = {}, weights = {}) {
  const driverScore = clamp(Math.round(num(diag.driverScore)), 0, 100);
  const vehicleScore = clamp(Math.round(num(diag.vehicleScore)), 0, 100);
  const total = clamp(Math.round(num(diag.dispatchScore)), 0, 100);

  const Wd = num(weights.driver);
  const Wv = num(weights.vehicle);
  const sum = Wd + Wv;
  const wdPct = sum > 0 ? Math.round((Wd / sum) * 100) : 50;
  const wvPct = 100 - wdPct;

  // Driver points rounded from the fused term; vehicle points = remainder so the
  // two ALWAYS add up to `total` exactly (the displayed dispatch score).
  const driverPoints = sum > 0 ? clamp(Math.round((driverScore * Wd) / sum), 0, total) : Math.round(total / 2);
  const vehiclePoints = total - driverPoints;

  return {
    total,
    rows: [
      { key: 'driver',  label: 'Driver',    score: driverScore,  weightPct: wdPct, points: driverPoints },
      { key: 'vehicle', label: 'Kendaraan', score: vehicleScore, weightPct: wvPct, points: vehiclePoints },
    ],
  };
}

/**
 * The detailed sub-score rows for the recommended driver + vehicle, read
 * straight from the engine breakdowns (informational 0–100 sub-scores). These
 * are NOT recomputed — they are the engine's own `breakdown` values relabeled.
 * @param {Object} [driverDiag]  a Driver Recommendation Engine diagnostic
 * @param {Object} [vehicleDiag] a Vehicle Recommendation Engine diagnostic
 * @returns {{ driver:Array<{label:string,score:number}>, vehicle:Array<{label:string,score:number}> }}
 */
export function buildSubScoreRows(driverDiag = {}, vehicleDiag = {}) {
  const db = driverDiag.breakdown || {};
  const vb = vehicleDiag.breakdown || {};
  return {
    driver: [
      { label: 'Ketersediaan', score: num(db.availability) },
      { label: 'Beban Kerja',  score: num(db.workload) },
      { label: 'Aktivitas 7-Hari', score: num(db.recency) },
      { label: 'Prioritas',    score: num(db.priority) },
    ],
    vehicle: [
      { label: 'Ketersediaan', score: num(vb.availability) },
      { label: 'Kesesuaian Kapasitas', score: num(vb.capacityFit) },
      { label: 'Utilisasi',    score: num(vb.utilization) },
      { label: 'Kondisi',      score: num(vb.health) },
    ],
  };
}

/**
 * Build the plain-language "Mengapa?" checklist from the engine diagnostics —
 * reusing the booleans/status the engines already produced (NO new AI text, no
 * new scoring). Each item is a verified observation, not a generated sentence.
 * @param {Object} [driverDiag]  Driver Recommendation Engine diagnostic
 * @param {Object} [vehicleDiag] Vehicle Recommendation Engine diagnostic
 * @returns {Array<{ ok:boolean, text:string }>}
 */
export function buildExplanation(driverDiag = {}, vehicleDiag = {}) {
  const items = [];
  const workloadGood = driverDiag.status === 'LOW' || driverDiag.status === 'NORMAL';

  items.push({ ok: driverDiag.available !== false, text: driverDiag.available !== false ? 'Driver tersedia' : 'Driver tidak tersedia' });
  items.push({ ok: !driverDiag.conflict, text: driverDiag.conflict ? 'Ada konflik jadwal driver' : 'Tidak ada konflik jadwal' });
  items.push({ ok: workloadGood, text: workloadGood ? 'Beban kerja driver seimbang' : 'Beban kerja driver tinggi' });
  items.push({ ok: vehicleDiag.available !== false, text: vehicleDiag.available !== false ? 'Kendaraan tersedia' : 'Kendaraan tidak tersedia' });
  items.push({ ok: !vehicleDiag.overCapacity, text: vehicleDiag.overCapacity ? 'Kapasitas kurang' : 'Kapasitas sesuai' });

  return items;
}

/**
 * Compare the AI recommendation against the admin's current selection.
 * Comparison is by trimmed, case-insensitive name so cosmetic differences are
 * not flagged as overrides.
 * @param {{driver?:string, vehicle?:string}} recommended  AI recommendation
 * @param {{driver?:string, vehicle?:string}} selection     admin's current pick
 * @returns {{ driver:{ai:string,admin:string,changed:boolean}, vehicle:{ai:string,admin:string,changed:boolean}, anyChange:boolean }}
 */
export function buildComparison(recommended = {}, selection = {}) {
  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
  const aiDriver = String(recommended.driver || '');
  const aiVehicle = String(recommended.vehicle || '');
  const adminDriver = String(selection.driver || '');
  const adminVehicle = String(selection.vehicle || '');

  // Only flag a change when the admin has actually chosen something different
  // (an empty selection is "not yet decided", not an override).
  const driverChanged = !!adminDriver && norm(adminDriver) !== norm(aiDriver);
  const vehicleChanged = !!adminVehicle && norm(adminVehicle) !== norm(aiVehicle);

  return {
    driver:  { ai: aiDriver,  admin: adminDriver,  changed: driverChanged },
    vehicle: { ai: aiVehicle, admin: adminVehicle, changed: vehicleChanged },
    anyChange: driverChanged || vehicleChanged,
  };
}

/**
 * Format a timeline of approval events from the timestamps the workflow already
 * records (no new timestamps invented). Each event is { time, label, done }.
 * @param {Object} input
 * @param {string} [input.createdAt]    request creation ISO
 * @param {string} [input.generatedAt]  recommendation generation ISO
 * @param {boolean} [input.overridden]  admin is currently overriding
 * @param {string} [input.approvedAt]   approval ISO (only when already approved)
 * @returns {Array<{ key:string, time:string, label:string, done:boolean }>}
 */
export function buildTimeline(input = {}) {
  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const events = [];
  if (input.createdAt)   events.push({ key: 'created',   time: fmt(input.createdAt),   label: 'Request Dibuat', done: true });
  if (input.generatedAt) events.push({ key: 'generated', time: fmt(input.generatedAt), label: 'Rekomendasi Dibuat', done: true });
  if (input.overridden)  events.push({ key: 'override',  time: '',                     label: 'Admin Override', done: true });
  if (input.approvedAt)  events.push({ key: 'approved',  time: fmt(input.approvedAt),  label: 'Disetujui', done: true });
  else                   events.push({ key: 'pending',   time: '',                     label: 'Menunggu Keputusan', done: false });
  return events;
}
