/* ============================================================
   DRIVER-WELLNESS-SERVICE.JS — Driver Wellness Intelligence (v1.17.6)

   The wellness INTERPRETATION layer of Dispatch Intelligence. It evolves the
   subsystem from operational optimization into operational sustainability: it
   does not assign the best driver — it continuously interprets each driver's
   wellbeing from the operational data the platform already records.

   ── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
   This is an INTERPRETATION layer, NOT a scheduling/scoring engine. It adds no
   recommendation, dispatch, policy, or persistence logic, and changes no
   formula. Every derived value REUSES the existing engines:
     • driver capacity / utilization / density  → driver-capacity-engine.js
       (calculateDriverCapacity — the one capacity calculation)
     • capacity HEALTH (invert of utilization)  → unified-scoring.js
       (capacityScore / invertScore / clampScore — higher = better, no
        second inversion implemented here)
     • normalized workload (cohort balance)     → workload-engine.js
       (buildWorkloadModel — the one workload normalization method)
     • score band / color tone                  → unified-scoring.js
       (scoreColor — the one color scale)

   The wellness-SPECIFIC components (recovery time, consecutive working days,
   weekend frequency, night-assignment frequency, working hours) are derived
   directly from the assignment timeline — these are NEW observations, not a
   re-computation of any existing metric.

   WELLNESS DIRECTION INVARIANT: every component and the Driver Health Score
   obey "higher = better" (100 = healthiest, 0 = critical). Utilization is never
   shown as a quality — it is always inverted to Capacity Health first.

   PURE: no DOM, no Firebase, no `window`. Every input is passed in, so the whole
   model is node-testable (scripts/driver-wellness-check.mjs).
   ============================================================ */

'use strict';

import { calculateDriverCapacity } from './driver-capacity-engine.js';
import { capacityScore, invertScore, clampScore, scoreColor } from './unified-scoring.js';
import { buildWorkloadModel } from '../analytics/engines/workload-engine.js';

/* ── numeric / time helpers (utility, not business logic) ─────────────────── */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mean(list) { return list.length ? Math.round(list.reduce((s, n) => s + n, 0) / list.length) : 0; }
function mean1(list) { return list.length ? Math.round((list.reduce((s, n) => s + n, 0) / list.length) * 10) / 10 : 0; }
function normName(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/** Local-day ISO (yyyy-mm-dd), timezone-safe — mirrors the capacity engine. */
function dayISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function assignmentDay(a) {
  return (a && (a.date || a.startDate)) ? String(a.date || a.startDate).slice(0, 10) : '';
}
/** Whole local days between two yyyy-mm-dd strings (a − b); null if unparseable. */
function dayDiff(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = Date.parse(`${aISO}T00:00:00`);
  const b = Date.parse(`${bISO}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}
function isTime(t) { return /^(\d{1,2}):(\d{2})$/.test(String(t || '')); }
function timeToHours(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}
/** Saturday/Sunday detection for a yyyy-mm-dd day. */
function isWeekend(dayStr) {
  if (!dayStr) return false;
  const t = Date.parse(`${dayStr}T00:00:00`);
  if (Number.isNaN(t)) return false;
  const dow = new Date(t).getDay();
  return dow === 0 || dow === 6;
}

const NON_CAPACITY_STATUSES = new Set(['cancelled']);

/* ── configuration (frozen DEFAULT references) ────────────────────────────── */

/** Wellness reference points + component weights. References are the same
 *  "fixed reference" philosophy as the capacity engine (an absolute question:
 *  "is THIS driver near a healthy ceiling?"). All weights sum to 1.0. */
export const WELLNESS_CONFIG = Object.freeze({
  windowDays: 30,
  recoveryTargetDays: 2,        // healthy avg rest between worked days
  workingHoursReference: 160,   // ~ full monthly working hours (≈ 40h/week)
  weeklyTripReference: 12,      // recent-density reference (last-7-day trips)
  consecutiveHealthyDays: 2,    // beyond this, consecutive working days erode wellness
  fullDayHours: 8,              // hours credited to a full-day assignment
  nightStartHour: 20,           // assignments starting ≥ 20:00 …
  nightEndHour: 6,              // … or starting before 06:00 are "night"
  weights: Object.freeze({
    recovery: 0.22,
    workingHours: 0.18,
    workloadBalance: 0.15,
    assignmentDensity: 0.15,
    consecutiveDays: 0.12,
    weekendFrequency: 0.10,
    nightFrequency: 0.08,
  }),
});

/** The labelled wellness components, in display order. `key` joins to the
 *  computed component scores; `weight` is the health-score contribution. */
export const WELLNESS_COMPONENTS = Object.freeze([
  { key: 'recovery', label: 'Waktu Pemulihan', labelEn: 'Recovery Time' },
  { key: 'workingHours', label: 'Jam Kerja', labelEn: 'Working Hours' },
  { key: 'workloadBalance', label: 'Keseimbangan Beban', labelEn: 'Workload Balance' },
  { key: 'assignmentDensity', label: 'Kepadatan Tugas', labelEn: 'Assignment Density' },
  { key: 'consecutiveDays', label: 'Hari Kerja Beruntun', labelEn: 'Consecutive Working Days' },
  { key: 'weekendFrequency', label: 'Frekuensi Akhir Pekan', labelEn: 'Weekend Frequency' },
  { key: 'nightFrequency', label: 'Frekuensi Tugas Malam', labelEn: 'Night Assignment Frequency' },
]);

/* ── Feature 1 — Driver Health Score bands ────────────────────────────────── */

/** Health bands (min inclusive, ordered high → low). Higher is ALWAYS better.
 *  Derived from the checkpoint's six tiers (Excellent → Critical). `tone` maps
 *  onto the platform design tokens (no hard-coded color). */
export const HEALTH_BANDS = Object.freeze([
  { key: 'excellent', min: 90, label: 'Excellent', labelId: 'Sangat Sehat', tone: 'ok' },
  { key: 'very-good', min: 80, label: 'Very Good', labelId: 'Baik Sekali', tone: 'ok' },
  { key: 'good', min: 70, label: 'Good', labelId: 'Sehat', tone: 'info' },
  { key: 'attention', min: 55, label: 'Needs Attention', labelId: 'Perlu Perhatian', tone: 'warn' },
  { key: 'high-risk', min: 35, label: 'High Risk', labelId: 'Risiko Tinggi', tone: 'danger' },
  { key: 'critical', min: 0, label: 'Critical', labelId: 'Kritis', tone: 'danger' },
]);

/** The full band object for a health score (never null — floors at 'critical'). */
export function healthBand(score) {
  const s = clampScore(score);
  return HEALTH_BANDS.find((b) => s >= b.min) || HEALTH_BANDS[HEALTH_BANDS.length - 1];
}

/* ── Feature 3 — Fatigue Risk bands (short-term) ──────────────────────────── */

/** Fatigue is a RISK indicator (higher index = more fatigue). Five categories. */
export const FATIGUE_BANDS = Object.freeze([
  { key: 'very-low', min: 0, label: 'Very Low', labelId: 'Sangat Rendah', tone: 'ok' },
  { key: 'low', min: 20, label: 'Low', labelId: 'Rendah', tone: 'ok' },
  { key: 'medium', min: 40, label: 'Medium', labelId: 'Sedang', tone: 'warn' },
  { key: 'high', min: 60, label: 'High', labelId: 'Tinggi', tone: 'danger' },
  { key: 'critical', min: 80, label: 'Critical', labelId: 'Kritis', tone: 'danger' },
]);
export function fatigueBand(index) {
  const s = clamp(Math.round(num(index)), 0, 100);
  let band = FATIGUE_BANDS[0];
  for (const b of FATIGUE_BANDS) if (s >= b.min) band = b;
  return band;
}

/* ── Feature 4 — Burnout Risk bands (long-term) ───────────────────────────── */

/** Burnout is an independent long-term RISK (higher index = more risk). Four
 *  categories (Low / Medium / High / Critical). */
export const BURNOUT_BANDS = Object.freeze([
  { key: 'low', min: 0, label: 'Low', labelId: 'Rendah', tone: 'ok' },
  { key: 'medium', min: 30, label: 'Medium', labelId: 'Sedang', tone: 'warn' },
  { key: 'high', min: 55, label: 'High', labelId: 'Tinggi', tone: 'danger' },
  { key: 'critical', min: 75, label: 'Critical', labelId: 'Kritis', tone: 'danger' },
]);
export function burnoutBand(index) {
  const s = clamp(Math.round(num(index)), 0, 100);
  let band = BURNOUT_BANDS[0];
  for (const b of BURNOUT_BANDS) if (s >= b.min) band = b;
  return band;
}

/* ── identity + per-driver assignment aggregation ─────────────────────────── */

function driverIdentities(driver) {
  const ids = new Set();
  if (driver.id != null) ids.add(String(driver.id));
  if (driver.name) ids.add(normName(driver.name));
  if (driver.normalizedName) ids.add(normName(driver.normalizedName));
  for (const ln of (Array.isArray(driver.legacyNames) ? driver.legacyNames : [])) {
    if (ln) ids.add(normName(ln));
  }
  return ids;
}

/** A driver's own non-cancelled assignments that fall on/before `today` and
 *  within `windowDays` (future bookings are excluded from wellness state). */
function driverAssignmentsInWindow(driver, assignments, today, windowDays) {
  const ids = driverIdentities(driver);
  const list = Array.isArray(assignments) ? assignments : [];
  const mine = [];
  for (const a of list) {
    if (!a || NON_CAPACITY_STATUSES.has(a.status)) continue;
    const matches = ids.has(String(a.driverId)) || ids.has(normName(a.driver));
    if (!matches) continue;
    const day = assignmentDay(a);
    const age = dayDiff(today, day);
    if (age === null || age < 0) continue;       // future / unknown — not current state
    if (age >= windowDays) continue;
    mine.push({ ...a, _day: day });
  }
  return mine;
}

/* ── wellness-specific component derivations (NEW observations) ────────────── */

/** Average rest (days off) between consecutive worked days → recovery score.
 *  0/1 worked days ⇒ fully rested (100). */
function recoveryFromDays(workedDays, cfg) {
  const days = [...new Set(workedDays)].filter(Boolean).sort();
  if (days.length <= 1) return { score: 100, avgRestDays: cfg.recoveryTargetDays, maxStreak: days.length };
  let restSum = 0; let gaps = 0;
  let streak = 1; let maxStreak = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = dayDiff(days[i], days[i - 1]);
    if (gap == null) continue;
    restSum += Math.max(0, gap - 1);            // rest days between two worked days
    gaps++;
    if (gap === 1) { streak++; maxStreak = Math.max(maxStreak, streak); } else { streak = 1; }
  }
  const avgRestDays = gaps > 0 ? restSum / gaps : cfg.recoveryTargetDays;
  const score = clampScore((avgRestDays / cfg.recoveryTargetDays) * 100);
  return { score, avgRestDays: Math.round(avgRestDays * 10) / 10, maxStreak };
}

/** Working hours over the window → invert vs the reference (more = lower wellness). */
function workingHoursScore(mine, cfg) {
  let hours = 0;
  for (const a of mine) {
    if (a.fullDay) { hours += cfg.fullDayHours; continue; }
    const s = timeToHours(a.startTime); const e = timeToHours(a.endTime);
    if (s == null || e == null) { hours += cfg.fullDayHours; continue; } // unknown duration ≈ full day
    let dur = e - s; if (dur < 0) dur += 24;     // overnight
    hours += dur;
  }
  hours = Math.round(hours * 10) / 10;
  const load = clamp((hours / cfg.workingHoursReference) * 100, 0, 100);
  return { score: invertScore(load), hours };
}

/** Recent intensity (last-7-day trip count) → invert vs the weekly reference. */
function densityScore(last7, cfg) {
  const load = clamp((num(last7) / cfg.weeklyTripReference) * 100, 0, 100);
  return invertScore(load);
}

/** Longest consecutive working-day streak → erodes wellness beyond the healthy
 *  ceiling (1 day = 100; each extra consecutive day past the ceiling −15). */
function consecutiveScore(maxStreak, cfg) {
  const extra = Math.max(0, num(maxStreak) - cfg.consecutiveHealthyDays);
  return clampScore(100 - extra * 15);
}

/** Weekend share of the window's assignments → invert (more weekend = lower). */
function weekendScore(weekendCount, total) {
  if (total <= 0) return { score: 100, count: 0, ratio: 0 };
  const ratio = weekendCount / total;
  return { score: invertScore(Math.round(ratio * 100)), count: weekendCount, ratio };
}

/** Night share of the window's TIMED assignments → invert. Null score (N/A)
 *  when no assignment carries usable time data. */
function nightScore(nightCount, timed) {
  if (timed <= 0) return { score: null, count: 0, ratio: null, available: false };
  const ratio = nightCount / timed;
  return { score: invertScore(Math.round(ratio * 100)), count: nightCount, ratio, available: true };
}

/* ── per-driver wellness assembly ─────────────────────────────────────────── */

function buildComponentScores(driver, assignments, today, cfg, workloadByName) {
  const mine = driverAssignmentsInWindow(driver, assignments, today, cfg.windowDays);
  const cap = calculateDriverCapacity(driver.id, assignments, { now: today, aliases: [driver.name, driver.normalizedName, ...(driver.legacyNames || [])].filter(Boolean) });

  const days = mine.map((a) => a._day).filter(Boolean);
  const total = mine.length;
  let weekendCount = 0; let nightCount = 0; let timed = 0;
  for (const a of mine) {
    if (isWeekend(a._day)) weekendCount++;
    if (isTime(a.startTime)) {
      timed++;
      const sh = timeToHours(a.startTime);
      if (sh != null && (sh >= cfg.nightStartHour || sh < cfg.nightEndHour)) nightCount++;
    }
  }

  const rec = recoveryFromDays(days, cfg);
  const wh = workingHoursScore(mine, cfg);
  const wknd = weekendScore(weekendCount, total);
  const nite = nightScore(nightCount, timed);
  const dens = densityScore(cap.assignmentsLast7Days, cfg);
  const consec = consecutiveScore(rec.maxStreak, cfg);

  // Workload balance reuses the cohort workload normalization (single source).
  const wl = workloadByName.get(normName(driver.name));
  const workloadBalance = wl ? invertScore(wl.score) : 100;

  const scores = {
    recovery: rec.score,
    workingHours: wh.score,
    workloadBalance,
    assignmentDensity: dens,
    consecutiveDays: consec,
    weekendFrequency: wknd.score,
    nightFrequency: nite.score,            // may be null (N/A)
  };

  return {
    capacity: cap,
    scores,
    raw: {
      assignments: total,
      workedDays: [...new Set(days)].length,
      hours: wh.hours,
      avgRestDays: rec.avgRestDays,
      maxStreak: rec.maxStreak,
      weekendCount: wknd.count,
      weekendRatio: Math.round((wknd.ratio || 0) * 100),
      nightCount: nite.count,
      nightRatio: nite.available ? Math.round((nite.ratio || 0) * 100) : null,
      nightAvailable: nite.available,
      last7: cap.assignmentsLast7Days,
      last30: cap.assignmentsLast30Days,
      utilization: cap.utilizationPercent,
    },
  };
}

/** Weighted Driver Health Score from the component scores. When Night Frequency
 *  is N/A its weight is redistributed proportionally across the rest, so the
 *  score is always a fair 0–100 (Explainability points sum exactly to it). */
function buildHealthScore(scores, cfg) {
  const w = cfg.weights;
  const active = WELLNESS_COMPONENTS
    .map((c) => c.key)
    .filter((k) => scores[k] != null);
  const totalWeight = active.reduce((s, k) => s + num(w[k]), 0) || 1;

  let acc = 0;
  const contributions = active.map((k) => {
    const weightShare = num(w[k]) / totalWeight;
    const exact = scores[k] * weightShare;
    acc += exact;
    return { key: k, score: scores[k], weightPct: Math.round(weightShare * 100), _exact: exact };
  });
  const score = clampScore(acc);

  // Points that sum EXACTLY to the rounded health score (last takes remainder).
  let assigned = 0;
  contributions.forEach((c, i) => {
    if (i === contributions.length - 1) c.points = score - assigned;
    else { c.points = Math.round((c._exact / (acc || 1)) * score); assigned += c.points; }
    delete c._exact;
  });
  return { score, contributions };
}

function fatigueIndex(scores) {
  // Short-term: poor recovery + long streaks + recent density.
  return clamp(Math.round(
    (100 - scores.recovery) * 0.40
    + (100 - scores.consecutiveDays) * 0.35
    + (100 - scores.assignmentDensity) * 0.25,
  ), 0, 100);
}
function burnoutIndex(scores, utilization) {
  // Long-term: workload imbalance + sustained utilization + weekend load + poor recovery.
  return clamp(Math.round(
    (100 - scores.workloadBalance) * 0.30
    + clamp(num(utilization), 0, 100) * 0.30
    + (100 - scores.weekendFrequency) * 0.20
    + (100 - scores.recovery) * 0.20,
  ), 0, 100);
}

/* ── Feature 8 — Driver Timeline (derived wellness events) ────────────────── */

function buildTimeline(driver, raw, health, fatigue, burnout) {
  // Derived from the CURRENT snapshot (future-ready: a persisted history can be
  // appended later). Each event is a verified observation, never invented.
  const events = [];
  const b = healthBand(health);
  events.push({ key: 'health', tone: b.tone, label: `Skor kesehatan ${health} · ${b.labelId}`,
    detail: `${raw.assignments} tugas / ${raw.workedDays} hari kerja dalam jendela` });
  if (raw.utilization >= 76) {
    events.push({ key: 'high-workload', tone: 'warn', label: 'Beban kerja tinggi',
      detail: `Utilisasi ${raw.utilization}% · ${raw.last30} tugas (30 hari)` });
  }
  if (raw.maxStreak >= 4) {
    events.push({ key: 'streak', tone: 'warn', label: `Bekerja ${raw.maxStreak} hari beruntun`,
      detail: 'Pertimbangkan rotasi atau hari istirahat' });
  }
  if (raw.weekendCount > 0) {
    events.push({ key: 'weekend', tone: raw.weekendRatio >= 40 ? 'warn' : 'info', label: `${raw.weekendCount} tugas akhir pekan`,
      detail: `${raw.weekendRatio}% dari tugas pada Sabtu/Minggu` });
  }
  if (raw.avgRestDays >= 2) {
    events.push({ key: 'recovery', tone: 'ok', label: 'Pemulihan terjaga',
      detail: `Rata-rata ${raw.avgRestDays} hari istirahat antar tugas` });
  }
  if (raw.utilization <= 40) {
    events.push({ key: 'capacity', tone: 'ok', label: 'Kapasitas normal',
      detail: `Utilisasi ${raw.utilization}% · banyak slot tersedia` });
  }
  if (fatigue.key === 'high' || fatigue.key === 'critical') {
    events.push({ key: 'fatigue', tone: 'danger', label: `Risiko kelelahan ${fatigue.labelId}`, detail: 'Sinyal jangka pendek meningkat' });
  }
  if (burnout.key === 'high' || burnout.key === 'critical') {
    events.push({ key: 'burnout', tone: 'danger', label: `Risiko burnout ${burnout.labelId}`, detail: 'Tren beban jangka panjang meningkat' });
  }
  return events;
}

/* ── Feature 9 — Executive recommendations (pure presentation) ─────────────── */

function buildRecommendations(scores, raw, fatigue, burnout) {
  const recs = [];
  if (scores.consecutiveDays < 60 || raw.maxStreak >= 5) {
    recs.push({ key: 'rotate', label: 'Rotasi Driver', detail: `Bekerja ${raw.maxStreak} hari beruntun — jadwalkan rotasi.`, severity: 'high' });
  }
  if (scores.weekendFrequency < 60) {
    recs.push({ key: 'reduce-weekend', label: 'Kurangi Tugas Akhir Pekan', detail: `${raw.weekendRatio}% tugas jatuh di akhir pekan.`, severity: 'medium' });
  }
  if (scores.recovery < 60) {
    recs.push({ key: 'recovery', label: 'Tambah Jendela Pemulihan', detail: `Rata-rata hanya ${raw.avgRestDays} hari istirahat antar tugas.`, severity: 'high' });
  }
  if (scores.workloadBalance < 55 || raw.utilization >= 76) {
    recs.push({ key: 'balance', label: 'Distribusi Lebih Seimbang', detail: `Utilisasi ${raw.utilization}% — alihkan sebagian tugas ke driver lain.`, severity: 'medium' });
  }
  if (scores.assignmentDensity < 55) {
    recs.push({ key: 'consecutive', label: 'Kurangi Tugas Beruntun', detail: `${raw.last7} tugas dalam 7 hari terakhir.`, severity: 'medium' });
  }
  if (!recs.length) {
    recs.push({ key: 'maintain', label: 'Pertahankan Distribusi', detail: 'Indikator wellness sehat — tidak ada tindakan mendesak.', severity: 'low' });
  }
  return recs;
}

/** Build one driver's complete wellness object. */
function buildDriverWellness(driver, assignments, today, cfg, workloadByName) {
  const { capacity, scores, raw } = buildComponentScores(driver, assignments, today, cfg, workloadByName);
  const health = buildHealthScore(scores, cfg);
  const fIdx = fatigueIndex(scores);
  const bIdx = burnoutIndex(scores, raw.utilization);
  const fatigue = fatigueBand(fIdx);
  const burnout = burnoutBand(bIdx);
  const hBand = healthBand(health.score);
  const capHealth = capacityScore(raw.utilization);

  // Feature 2 — labelled components (N/A surfaced explicitly).
  const components = WELLNESS_COMPONENTS.map((c) => ({
    key: c.key, label: c.label, labelEn: c.labelEn,
    score: scores[c.key],                                  // null ⇒ N/A
    available: scores[c.key] != null,
    tone: scores[c.key] != null ? scoreColor(scores[c.key]) : 'muted',
  }));

  return {
    driverId: driver.id != null ? String(driver.id) : '',
    driverName: driver.name || (driver.id != null ? String(driver.id) : '—'),
    health: { score: health.score, band: hBand.key, label: hBand.label, labelId: hBand.labelId, tone: hBand.tone },
    explainability: health.contributions,                  // Feature 10 — sums to health.score
    components,                                             // Feature 2
    fatigue: { index: fIdx, key: fatigue.key, label: fatigue.label, labelId: fatigue.labelId, tone: fatigue.tone }, // Feature 3
    burnout: { index: bIdx, key: burnout.key, label: burnout.label, labelId: burnout.labelId, tone: burnout.tone }, // Feature 4
    capacityHealth: { score: capHealth, utilization: raw.utilization, status: capacity.status, tone: scoreColor(capHealth) }, // Feature 5
    recovery: { score: scores.recovery, avgRestDays: raw.avgRestDays, maxStreak: raw.maxStreak }, // Recovery
    workingTime: { score: scores.workingHours, hours: raw.hours, last7: raw.last7, last30: raw.last30 },
    raw,
    timeline: buildTimeline(driver, raw, health.score, fatigue, burnout),        // Feature 8
    recommendations: buildRecommendations(scores, raw, fatigue, burnout),        // Feature 9
  };
}

/* ── cohort computation (reused per trend window) ─────────────────────────── */

function activeDrivers(drivers) {
  return (Array.isArray(drivers) ? drivers : []).filter(
    (d) => d && typeof d === 'object' && d.active !== false && d.archived !== true);
}

/** Aggregate raw workload components per driver, then run the SAME cohort
 *  normalization the workload analytics uses (buildWorkloadModel). Returns a
 *  map normName(name) → workload driver row. */
function buildWorkloadIndex(drivers, assignments, today, cfg) {
  const inputs = drivers.map((d) => {
    const mine = driverAssignmentsInWindow(d, assignments, today, cfg.windowDays);
    let hours = 0; let distance = 0; let weekend = 0; const days = new Set();
    for (const a of mine) {
      if (a.fullDay) hours += cfg.fullDayHours;
      else { const s = timeToHours(a.startTime); const e = timeToHours(a.endTime); if (s != null && e != null) { let dur = e - s; if (dur < 0) dur += 24; hours += dur; } else hours += cfg.fullDayHours; }
      distance += num(a.distanceTravelled);
      if (isWeekend(a._day)) weekend++;
      if (a._day) days.add(a._day);
    }
    return { name: d.name, completed: mine.length, hours, distance, weekend, daysWorked: days.size };
  });
  const model = buildWorkloadModel(inputs);
  const byName = new Map();
  for (const row of model.drivers) byName.set(normName(row.name), row);
  return byName;
}

function computeCohort(drivers, assignments, today, cfg) {
  const workloadByName = buildWorkloadIndex(drivers, assignments, today, cfg);
  return drivers.map((d) => buildDriverWellness(d, assignments, today, cfg, workloadByName));
}

/* ── distributions + summary (Features 6 & 11) ────────────────────────────── */

function distribution(rows, bands, classify) {
  const counts = new Map(bands.map((b) => [b.key, 0]));
  for (const r of rows) counts.set(classify(r), (counts.get(classify(r)) || 0) + 1);
  return bands.map((b) => ({ key: b.key, label: b.label, labelId: b.labelId, tone: b.tone, count: counts.get(b.key) || 0 }));
}

function buildSummary(rows) {
  const n = rows.length;
  const healths = rows.map((r) => r.health.score);
  const healthy = rows.filter((r) => r.health.score >= 70).length;
  const attention = rows.filter((r) => r.health.score >= 35 && r.health.score < 70).length;
  const highFatigue = rows.filter((r) => r.fatigue.key === 'high' || r.fatigue.key === 'critical').length;
  const burnoutRisk = rows.filter((r) => r.burnout.key === 'high' || r.burnout.key === 'critical').length;
  return {
    driverCount: n,
    averageHealth: mean(healths),
    healthyDrivers: healthy,
    needsAttention: attention,
    highFatigue,
    burnoutRisk,
    averageRecovery: mean(rows.map((r) => r.recovery.score)),
    averageCapacityHealth: mean(rows.map((r) => r.capacityHealth.score)),
  };
}

/* ── Feature 12 — trend windows ───────────────────────────────────────────── */

/** Window definitions (Today / 7 / 30 / 90 / YTD). `days` is the lookback. */
export const WELLNESS_WINDOWS = Object.freeze([
  { key: 'today', label: 'Hari Ini', days: 1 },
  { key: '7d', label: '7 Hari', days: 7 },
  { key: '30d', label: '30 Hari', days: 30 },
  { key: '90d', label: '90 Hari', days: 90 },
  { key: 'ytd', label: 'YTD', days: null },   // resolved to days-since-Jan-1
]);

function windowDays(key, today) {
  const def = WELLNESS_WINDOWS.find((w) => w.key === key);
  if (!def) return WELLNESS_CONFIG.windowDays;
  if (def.days != null) return def.days;
  const d = new Date(`${today}T00:00:00`);
  const soy = new Date(d.getFullYear(), 0, 1);
  return Math.max(1, Math.round((d - soy) / 86400000) + 1);
}

/* ── main entry ───────────────────────────────────────────────────────────── */

/**
 * Compute the complete Driver Wellness model.
 *
 * @param {Object} input
 * @param {Array<Object>} input.drivers      driver registry (id/name/aliases/active)
 * @param {Array<Object>} input.assignments  operational assignments (current state)
 * @param {Date|string}   [input.now]        "today" reference (default: real now)
 * @param {string}        [input.window]     active window key (default '30d')
 * @param {Object}        [input.config]     config override (merged over WELLNESS_CONFIG)
 * @returns {Object} the wellness model
 */
export function computeDriverWellnessModel(input = {}) {
  const cfgBase = { ...WELLNESS_CONFIG, ...(input.config || {}) };
  cfgBase.weights = { ...WELLNESS_CONFIG.weights, ...((input.config || {}).weights || {}) };
  const today = dayISO(input.now || new Date());
  const drivers = activeDrivers(input.drivers);
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  const activeWindow = WELLNESS_WINDOWS.some((w) => w.key === input.window) ? input.window : '30d';

  const cfg = { ...cfgBase, windowDays: windowDays(activeWindow, today) };
  const rows = computeCohort(drivers, assignments, today, cfg)
    .sort((a, b) => a.health.score - b.health.score || a.driverName.localeCompare(b.driverName, 'id'));

  // Feature 12 — average health/fatigue/burnout per window (reuses computeCohort).
  const trendWindows = WELLNESS_WINDOWS.map((w) => {
    const wc = { ...cfgBase, windowDays: windowDays(w.key, today) };
    const wr = computeCohort(drivers, assignments, today, wc);
    const s = buildSummary(wr);
    return {
      key: w.key, label: w.label,
      averageHealth: s.averageHealth,
      averageRecovery: s.averageRecovery,
      averageCapacityHealth: s.averageCapacityHealth,
      highFatigue: s.highFatigue,
      burnoutRisk: s.burnoutRisk,
      healthyDrivers: s.healthyDrivers,
    };
  });

  return {
    schema: 'driver-wellness@1',
    generatedAt: new Date().toISOString(),
    window: activeWindow,
    windowDays: cfg.windowDays,
    config: { weights: cfgBase.weights, references: { recoveryTargetDays: cfgBase.recoveryTargetDays, workingHoursReference: cfgBase.workingHoursReference, weeklyTripReference: cfgBase.weeklyTripReference } },
    summary: buildSummary(rows),                                       // Feature 6
    drivers: rows,                                                     // Features 1–10 (per driver)
    distributions: {                                                   // Feature 11
      health: distribution(rows, HEALTH_BANDS, (r) => r.health.band),
      fatigue: distribution(rows, FATIGUE_BANDS, (r) => r.fatigue.key),
      burnout: distribution(rows, BURNOUT_BANDS, (r) => r.burnout.key),
      capacity: distribution(rows, HEALTH_BANDS, (r) => healthBand(r.capacityHealth.score).key),
    },
    recoveryTrend: rows.map((r) => ({ driverId: r.driverId, driverName: r.driverName, recovery: r.recovery.score, health: r.health.score })),
    trend: { windows: trendWindows },                                 // Feature 12
  };
}

/** Convenience: find one driver's wellness in a computed model by id or name. */
export function findDriverWellness(model, idOrName) {
  if (!model || !Array.isArray(model.drivers)) return null;
  const key = String(idOrName);
  const keyN = normName(idOrName);
  return model.drivers.find((d) => d.driverId === key || normName(d.driverName) === keyN) || null;
}
