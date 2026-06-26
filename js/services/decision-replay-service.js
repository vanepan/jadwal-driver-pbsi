/* ============================================================
   DECISION-REPLAY-SERVICE.JS — Decision Replay & Explainable AI (v1.17.5)

   The explainability layer of Dispatch Intelligence. It turns a recommendation
   that the engines ALREADY produced into a fully auditable, replayable decision
   model: the step-by-step replay timeline, why the recommended driver/vehicle
   was chosen, why the others were not, the transparent score composition, the
   policy evaluation, the confidence band, the admin override analysis, and the
   full candidate ranking.

   PURE PRESENTATION + REPLAY. It adds NO scoring and NO recommendation logic —
   every number is READ from the engine package the Dispatch Scoring Engine
   produced (driver / vehicle / dispatch diagnostics + policy diagnostics) and
   reshaped through the EXISTING presentation helpers:
     • confidenceFromScore   (dispatch-presentation)   — Feature 7
     • buildScoreBreakdown   (dispatch-presentation)   — Feature 5
     • buildSubScoreRows     (dispatch-presentation)   — Features 2/3/4
     • buildExplanation      (dispatch-presentation)   — Features 2/4
     • buildComparison       (dispatch-presentation)   — Feature 8
     • classifyOutcome       (override-workflow)       — Feature 8
     • severityBand          (recommendation-accuracy) — Feature 8
     • POLICY_REASON_LABEL   (dispatch-policy-engine)  — Feature 6

   Nothing here can change a score — it only re-expresses what the engines
   computed. Replay reads the STORED recommendation headline (never recomputes a
   historical decision differently) and the LIVE package's diagnostics for the
   SAME pairing for the transparent breakdown.

   PURE: no DOM, no Firebase, no `window`. Validated by
   scripts/decision-replay-check.mjs; rendered by the Explainability Drawer.
   ============================================================ */

'use strict';

import {
  confidenceFromScore,
  buildScoreBreakdown,
  buildSubScoreRows,
  buildExplanation,
  buildComparison,
} from './dispatch-presentation.js';
import { classifyOutcome, OVERRIDE_OUTCOME } from './override-workflow-service.js';
import { severityBand } from '../analytics/recommendation-accuracy-engine.js';
import { POLICY_REASON_LABEL } from './dispatch-policy-engine.js';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Severity label for the four override outcomes (id-ID), for Feature 8. */
export const OVERRIDE_OUTCOME_LABEL = Object.freeze({
  [OVERRIDE_OUTCOME.ACCEPTED]: 'Diterima',
  [OVERRIDE_OUTCOME.DRIVER_OVERRIDE]: 'Ganti Driver',
  [OVERRIDE_OUTCOME.VEHICLE_OVERRIDE]: 'Ganti Kendaraan',
  [OVERRIDE_OUTCOME.FULL_OVERRIDE]: 'Ganti Keduanya',
});

/**
 * Resolve the transparent diagnostics for a driver/vehicle pairing out of a LIVE
 * engine package WITHOUT recalculating anything — it only READS the sub-scores
 * the engines already produced. Mirrors the approval panel's resolver so the two
 * surfaces always agree. The pairing is chosen by the stored recommendation's
 * ids when given, otherwise the package's own #1.
 * @param {Object} pkg     buildRecommendationPackage() result
 * @param {{driverId?:string, vehicleId?:string}} [target]
 * @returns {Object|null}
 */
export function resolveReplayDiagnostics(pkg, target = {}) {
  const disp = (pkg && pkg.dispatchRecommendation) || {};
  const rec = (pkg && pkg.recommendedDispatch) || null;
  const driverId = target.driverId || (rec && rec.driverId);
  const vehicleId = target.vehicleId || (rec && rec.vehicleId);
  if (driverId == null && vehicleId == null) return null;

  const driverDiag = (((pkg || {}).driverRecommendation || {}).diagnostics || []).find((d) => d.driverId === driverId) || {};
  const vehicleDiag = (((pkg || {}).vehicleRecommendation || {}).diagnostics || []).find((v) => v.vehicleId === vehicleId) || {};
  const dispatchDiag = (disp.diagnostics || []).find((d) => d.driverId === driverId && d.vehicleId === vehicleId) || {};
  if (dispatchDiag.driverScore == null && dispatchDiag.vehicleScore == null
      && driverDiag.score == null && vehicleDiag.score == null) return null;

  return {
    weights: disp.weights || { driver: 60, vehicle: 40 },
    driverName: dispatchDiag.driverName || driverDiag.driverName || driverId || '',
    vehicleName: dispatchDiag.vehicleName || vehicleDiag.vehicleName || vehicleId || '',
    driverDiag,
    vehicleDiag,
    driverScore: dispatchDiag.driverScore != null ? dispatchDiag.driverScore : driverDiag.score,
    vehicleScore: dispatchDiag.vehicleScore != null ? dispatchDiag.vehicleScore : vehicleDiag.score,
  };
}

/* ── Feature 1 + 11 — Decision Replay timeline ────────────────────────── */

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * The replay STAGES (Feature 1) — the ordered pipeline the engines walked to
 * produce this recommendation. Each stage's `detail` is read from the package;
 * `done` reflects whether that stage produced usable data. Never recomputes the
 * historical decision — it narrates the stored/live package.
 */
function buildReplayStages({ request, policy, driverDiags, vehicleDiags, data, score, confidence, recommended, decision }) {
  const topDriver = driverDiags[0];
  const topVehicle = vehicleDiags[0];
  const recName = `${recommended.driver || (data && data.driverName) || '—'} + ${recommended.vehicle || (data && data.vehicleName) || '—'}`;
  const stages = [
    { key: 'request', label: 'Request Dibuat', detail: `${request.date || ''} ${request.startTime || ''}–${request.endTime || ''} · ${num(request.passengers)} penumpang`, done: true },
    { key: 'policy', label: 'Evaluasi Policy', detail: policy ? `${policy.driverEligible} driver & ${policy.vehicleEligible} kendaraan lolos kebijakan` : 'Tidak ada kebijakan khusus', done: !!policy },
    { key: 'eligibleDrivers', label: 'Driver Eligible', detail: `${driverDiags.length} kandidat driver dinilai`, done: driverDiags.length > 0 },
    { key: 'driverScores', label: 'Skor Driver', detail: topDriver ? `Tertinggi: ${topDriver.driverName} (${topDriver.score})` : 'Tidak ada driver dinilai', done: !!topDriver },
    { key: 'eligibleVehicles', label: 'Kendaraan Eligible', detail: `${vehicleDiags.length} kandidat kendaraan dinilai`, done: vehicleDiags.length > 0 },
    { key: 'vehicleScores', label: 'Skor Kendaraan', detail: topVehicle ? `Tertinggi: ${topVehicle.vehicleName} (${topVehicle.score})` : 'Tidak ada kendaraan dinilai', done: !!topVehicle },
    { key: 'dispatchScore', label: 'Skor Dispatch', detail: `${score} / 100`, done: score > 0 },
    { key: 'confidence', label: 'Confidence', detail: `${confidence.glyph} ${confidence.label}`, done: true },
    { key: 'recommendation', label: 'Rekomendasi Dibuat', detail: recName, done: !!(recommended.driver || recommended.vehicle || (data && data.driverName)) },
    { key: 'decision', label: 'Keputusan Admin', detail: decision.decided ? `${OVERRIDE_OUTCOME_LABEL[decision.outcome] || decision.outcome}` : 'Menunggu keputusan', done: decision.decided },
  ];
  return stages;
}

/**
 * The lifecycle TIMELINE (Feature 11) — the events a recommendation owns over its
 * life. Built ONLY from timestamps the workflow already records (no invented
 * times). Future events append automatically as the request progresses.
 */
function buildLifecycleTimeline({ request, generatedAt, decision }) {
  const events = [];
  if (request.createdAt) events.push({ key: 'created', time: fmtTime(request.createdAt), label: 'Request Dibuat', done: true });
  if (generatedAt) events.push({ key: 'generated', time: fmtTime(generatedAt), label: 'Rekomendasi Dibuat', done: true });
  events.push({ key: 'viewed', time: fmtTime(decision.viewedAt), label: 'Ditinjau Admin', done: true });
  if (decision.decided && decision.overridden) events.push({ key: 'overridden', time: fmtTime(decision.timestamp), label: 'Admin Override', done: true });
  const approved = decision.decided && (request.status === 'approved' || request.status === 'assigned' || !!request.approvedAt);
  if (approved) {
    events.push({ key: 'approved', time: fmtTime(request.approvedAt || decision.timestamp), label: 'Disetujui', done: true });
    events.push({ key: 'assignment', time: fmtTime(request.approvedAt || decision.timestamp), label: 'Penugasan Dibuat', done: true });
  } else {
    events.push({ key: 'pending', time: '', label: 'Menunggu Keputusan', done: false });
  }
  if (request.status === 'completed') events.push({ key: 'completed', time: fmtTime(request.completedAt), label: 'Selesai', done: true });
  if (request.archived === true) events.push({ key: 'archived', time: fmtTime(request.archivedAt), label: 'Diarsipkan', done: true });
  return events;
}

/* ── Features 2/4 — Why this driver / vehicle ─────────────────────────── */

/**
 * Why the recommended driver was selected — reuses buildExplanation (the first
 * three items are the driver checks) + buildSubScoreRows for the contributing
 * sub-scores. No new text, no recompute.
 */
function buildWhyDriver(data) {
  if (!data) return null;
  const expl = buildExplanation(data.driverDiag, data.vehicleDiag).slice(0, 3); // driver items
  const subs = buildSubScoreRows(data.driverDiag, data.vehicleDiag).driver;
  return {
    name: data.driverName,
    score: num(data.driverScore),
    reasons: expl,
    subScores: subs,
  };
}

/** Why the recommended vehicle was selected — the last two buildExplanation
 *  items are the vehicle checks + the vehicle sub-scores. */
function buildWhyVehicle(data) {
  if (!data) return null;
  const expl = buildExplanation(data.driverDiag, data.vehicleDiag).slice(3); // vehicle items
  const subs = buildSubScoreRows(data.driverDiag, data.vehicleDiag).vehicle;
  return {
    name: data.vehicleName,
    score: num(data.vehicleScore),
    reasons: expl,
    subScores: subs,
  };
}

/* ── Feature 3 — Why not the other drivers ────────────────────────────── */

/**
 * Compare the recommended entity against each rejected candidate, sub-score by
 * sub-score, using the EXISTING engine breakdowns (read, never recomputed). The
 * `finalDifference` is the headline score gap. Works for both driver and vehicle
 * sides via the supplied sub-score selector.
 * @param {Object} winnerDiag   the recommended entity's diagnostic
 * @param {Array}  otherDiags   the rejected candidates' diagnostics (already ranked)
 * @param {(d:Object)=>Array<{label:string,score:number}>} subOf
 * @param {(d:Object)=>{name:string,score:number,id:string}} idOf
 */
function buildWhyNot(winnerDiag, otherDiags, subOf, idOf) {
  if (!winnerDiag) return { recommended: null, others: [] };
  const winSub = subOf(winnerDiag);
  const win = idOf(winnerDiag);
  const others = otherDiags
    .filter((d) => idOf(d).id !== win.id)
    .map((d) => {
      const oSub = subOf(d);
      const o = idOf(d);
      const differences = winSub.map((w, i) => ({
        label: w.label,
        winner: num(w.score),
        other: num((oSub[i] || {}).score),
        delta: num(w.score) - num((oSub[i] || {}).score),
      }));
      return {
        name: o.name,
        score: o.score,
        differences,
        finalDifference: num(win.score) - num(o.score),
      };
    });
  return { recommended: { name: win.name, score: win.score }, others };
}

/* ── Feature 6 — Policy evaluation ────────────────────────────────────── */

/**
 * Replay the Dispatch Policy Engine evaluation from its read-only diagnostics —
 * eligible counts, medical/driver-required flags, and the filtered-reason tally
 * (mapped to human labels). Reuses POLICY_REASON_LABEL; nothing re-evaluated.
 */
function buildPolicyExplanation(policyDiagnostics) {
  const pd = policyDiagnostics || null;
  const d = (pd && pd.drivers) || {};
  const v = (pd && pd.vehicles) || {};
  const ctx = (pd && pd.context) || {};
  const reasonRows = (obj) => Object.keys(obj.reasons || {}).map((code) => ({
    label: POLICY_REASON_LABEL[code] || code,
    code,
    count: obj.reasons[code],
  }));
  return {
    present: !!pd,
    medicalMode: !!ctx.medicalMode,
    driverRequired: !ctx.driverOptional,
    ambulanceRequested: !!ctx.ambulanceRequested,
    adminOverride: !!ctx.adminOverride,
    specialCase: v.specialCase || 'none',
    driverEligible: num(d.eligible),
    driverFiltered: num(d.filtered),
    driverSkipped: !!d.skipped,
    vehicleEligible: num(v.eligible),
    vehicleFiltered: num(v.filtered),
    filteredReasons: [...reasonRows(d), ...reasonRows(v)],
  };
}

/* ── Feature 9 — Candidate ranking ────────────────────────────────────── */

/**
 * The full ranked list of driver×vehicle dispatch candidates, straight from the
 * dispatch diagnostics (already ranked + scored by the engine). Each row carries
 * the fused sub-scores so the drawer can expand a per-candidate breakdown.
 */
function buildRanking(pkg, recId) {
  const disp = (pkg && pkg.dispatchRecommendation) || {};
  const diags = disp.diagnostics || [];
  return diags.map((c) => ({
    rank: c.rank,
    driverName: c.driverName,
    vehicleName: c.vehicleName,
    score: num(c.dispatchScore),
    driverScore: num(c.driverScore),
    vehicleScore: num(c.vehicleScore),
    valid: !!c.valid,
    reasons: Array.isArray(c.reasons) ? c.reasons : [],
    recommended: !!(recId && c.driverId === recId.driverId && c.vehicleId === recId.vehicleId && c.valid),
  }));
}

/* ── Master assembler ─────────────────────────────────────────────────── */

/**
 * Build the complete Decision Replay model for one recommendation.
 *
 * @param {Object} input
 * @param {Object} [input.pkg]       a LIVE buildRecommendationPackage() result (diagnostics source)
 * @param {Object} [input.stored]    the STORED request.recommendation (headline — no recompute)
 * @param {Object} [input.request]   the request record (date/times/createdAt/status/approvedAt…)
 * @param {{driver?:string, vehicle?:string}} [input.recommended] stored recommendation names
 * @param {{driver?:string, vehicle?:string}} [input.selection]   admin's current selection
 * @param {Object} [input.overrideRecord]  an override-workflow record (when a decision exists)
 * @param {Object} [options]
 * @param {string|number|Date} [options.now]  "viewed at" reference (default: now)
 * @returns {Object} the replay model (all 11 feature blocks)
 */
export function buildDecisionReplay(input = {}, options = {}) {
  const pkg = input.pkg || {};
  const stored = input.stored || null;
  const request = input.request || {};
  const selection = input.selection || { driver: '', vehicle: '' };
  const overrideRecord = input.overrideRecord || null;
  const viewedAt = new Date(options.now || Date.now()).toISOString();

  const hasStored = !!(stored && stored.hasRecommendation);
  const liveRec = pkg.recommendedDispatch || null;

  const recommended = (input.recommended && (input.recommended.driver || input.recommended.vehicle))
    ? input.recommended
    : { driver: (stored && stored.recommendedDriver) || '', vehicle: (stored && stored.recommendedVehicle) || '' };

  const recId = hasStored
    ? { driverId: stored.recommendedDriverId, vehicleId: stored.recommendedVehicleId }
    : (liveRec ? { driverId: liveRec.driverId, vehicleId: liveRec.vehicleId } : null);

  const data = resolveReplayDiagnostics(pkg, recId || {});

  const score = hasStored ? num(stored.dispatchScore) : (liveRec ? num(liveRec.dispatchScore) : 0);
  const confidence = confidenceFromScore(score);
  const generatedAt = (stored && stored.generatedAt) || pkg.generatedAt || '';
  const hasRecommendation = !!(hasStored || liveRec || data);

  const driverDiags = ((pkg.driverRecommendation || {}).diagnostics) || [];
  const vehicleDiags = ((pkg.vehicleRecommendation || {}).diagnostics) || [];

  const policy = buildPolicyExplanation(pkg.policyDiagnostics);

  // ── Feature 8 — Admin Override Analysis ──────────────────────────────
  // Prefer an explicit recorded override; otherwise derive from the current
  // selection vs the recommendation (live, pre-approval). Reuses classifyOutcome
  // + buildComparison + severityBand (single source for each).
  let decision;
  if (overrideRecord) {
    const sevDiff = num(overrideRecord.dispatchScore) - score;
    const band = severityBand(sevDiff);
    decision = {
      decided: true,
      outcome: overrideRecord.outcome,
      overridden: !!overrideRecord.overridden,
      reason: overrideRecord.reason || '',
      approvedBy: overrideRecord.approvedBy || '',
      timestamp: overrideRecord.timestamp || '',
      viewedAt,
      recommended: { driver: recommended.driver, vehicle: recommended.vehicle },
      selected: {
        driver: overrideRecord.selectedDriverId || '',
        vehicle: overrideRecord.selectedVehicleId || '',
      },
      severity: band.key,
      severityLabel: band.label,
      scoreDifference: Math.round(sevDiff),
    };
  } else {
    const cmp = buildComparison(recommended, selection);
    const outcome = classifyOutcome(recommended.driver, recommended.vehicle, selection.driver, selection.vehicle);
    decision = {
      decided: !!(selection.driver || selection.vehicle),
      outcome,
      overridden: cmp.anyChange,
      reason: '',
      approvedBy: '',
      timestamp: '',
      viewedAt,
      recommended: { driver: recommended.driver, vehicle: recommended.vehicle },
      selected: { driver: selection.driver || '', vehicle: selection.vehicle || '' },
      severity: cmp.anyChange ? 'minor' : 'none',
      severityLabel: cmp.anyChange ? (OVERRIDE_OUTCOME_LABEL[outcome] || 'Override') : 'Diterima',
      scoreDifference: 0,
      comparison: cmp,
    };
  }

  // ── Feature 5 — Score breakdown ──────────────────────────────────────
  const scoreBreakdown = data
    ? (() => {
        const bd = buildScoreBreakdown(
          { driverScore: data.driverScore, vehicleScore: data.vehicleScore, dispatchScore: score },
          data.weights,
        );
        return { ...bd, subScores: buildSubScoreRows(data.driverDiag, data.vehicleDiag), weights: data.weights };
      })()
    : null;

  return {
    schema: 'decision-replay@1',
    generatedAt,
    viewedAt,
    requestId: request.id || (stored && stored.requestId) || '',
    hasRecommendation,
    request: {
      id: request.id || '',
      date: request.date || request.startDate || '',
      startTime: request.startTime || '',
      endTime: request.endTime || '',
      passengers: num(request.passengers != null ? request.passengers : request.pax),
      destination: request.destination || request.purpose || '',
      requester: request.requesterName || '',
      createdAt: request.createdAt || '',
      status: request.status || '',
    },

    // Feature 10 header — recommendation + driver + vehicle + confidence
    recommendation: {
      driver: recommended.driver || (data && data.driverName) || '',
      vehicle: recommended.vehicle || (data && data.vehicleName) || '',
      dispatchScore: score,
      confidence,
    },

    replayStages: buildReplayStages({ request: { date: request.date || request.startDate, startTime: request.startTime, endTime: request.endTime, passengers: request.passengers != null ? request.passengers : request.pax }, policy: policy.present ? policy : null, driverDiags, vehicleDiags, data, score, confidence, recommended, decision }), // Feature 1
    confidence,                                                       // Feature 7
    whyDriver: buildWhyDriver(data),                                  // Feature 2
    whyVehicle: buildWhyVehicle(data),                                // Feature 4
    whyNotDrivers: buildWhyNot(                                       // Feature 3
      data ? data.driverDiag : null,
      driverDiags,
      (d) => buildSubScoreRows(d, {}).driver,
      (d) => ({ id: d.driverId, name: d.driverName || d.driverId, score: num(d.score) }),
    ),
    whyNotVehicles: buildWhyNot(                                      // Feature 4 (comparison)
      data ? data.vehicleDiag : null,
      vehicleDiags,
      (v) => buildSubScoreRows({}, v).vehicle,
      (v) => ({ id: v.vehicleId, name: v.vehicleName || v.vehicleId, score: num(v.score) }),
    ),
    scoreBreakdown,                                                   // Feature 5
    policy,                                                           // Feature 6
    override: decision,                                               // Feature 8
    ranking: buildRanking(pkg, recId),                               // Feature 9
    timeline: buildLifecycleTimeline({ request, generatedAt, decision }), // Feature 11
  };
}
