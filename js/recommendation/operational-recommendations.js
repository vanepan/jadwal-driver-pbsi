/* ============================================================
   OPERATIONAL-RECOMMENDATIONS.JS — v1.21.0 Executive Command Center

   The Fleet Recommendation Engine (fleet-recommendation-engine.js) is
   vehicle/prediction-scoped ONLY — it never imports the prediction engine
   itself and stays that way. Engineering and Request have no prediction
   layer at all, so their recommendations cannot come from that engine.

   This module is a SEPARATE, deliberately thin, deterministic rule set —
   no prediction, no AI, no LLM. It reads ONLY fields the existing
   Engineering Analytics builder and the raw Request list already produce.
   Output shape matches the generic subset of the Fleet Recommendation
   Engine's Recommendation object that the Executive widgets actually
   render (title/reason/expectedBenefit/confidence/estimatedImpact/
   category/actionable), so `exec-recommendation` needs no widget-side
   branching to display either source side by side.

   Pure: no DOM, no Firebase, no side effects.
   ============================================================ */

'use strict';

// v1.23.0 hotfix — pending-verification is now the same assignment-level
// count Attention uses (see that module's own header). Previously this
// file summed workerProductivity's per-participant finished-minus-verified
// counts, which double-counts any backlog assignment with more than one
// worker relative to Attention's per-assignment tally.
import { unverifiedEngineeringAssignments } from './engineering-verification.js';

const CONFIDENCE_HIGH = { levelWord: 'Tinggi', tone: 'good' };
const CONFIDENCE_MEDIUM = { levelWord: 'Sedang', tone: 'warn' };

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * Deterministic recommendations from the Engineering domain. Reuses ONLY
 * fields `buildEngineeringAnalytics` already computes, plus the same
 * engineering timeline events Attention reads for its own unverified count
 * — no new query, and no second tally of the same fact.
 * @param {Object} engineeringModel  the model from engineering-analytics.js
 * @param {Array} engineeringEvents  ctx.engineeringEvents (see app.js)
 * @returns {Array<Object>}
 */
export function engineeringRecommendations(engineeringModel, engineeringEvents) {
  const m = engineeringModel || {};
  const out = [];

  const overdue = num((m.overdueAssignments || {}).count);
  if (overdue > 0) {
    out.push({
      category: 'engineering-overdue',
      actionable: true,
      title: 'Jadwalkan Ulang Pekerjaan Teknik yang Melewati Batas Waktu',
      reason: `${overdue} penugasan teknik telah melewati batas waktu penyelesaian.`,
      expectedBenefit: 'Mencegah eskalasi risiko fasilitas dan menjaga SLA operasional.',
      confidence: CONFIDENCE_HIGH,
      estimatedImpact: { label: 'Kepatuhan SLA' },
      source: 'Engineering Analytics',
    });
  }

  const pendingVerify = unverifiedEngineeringAssignments(engineeringEvents).length;
  if (pendingVerify > 0) {
    out.push({
      category: 'engineering-verification',
      actionable: true,
      title: 'Verifikasi Laporan Teknik',
      reason: `${pendingVerify} pekerjaan telah selesai namun belum diverifikasi koordinator.`,
      expectedBenefit: 'Menutup siklus kerja dan memastikan kualitas pekerjaan tercatat.',
      confidence: CONFIDENCE_MEDIUM,
      estimatedImpact: { label: 'Kualitas & Akuntabilitas' },
      source: 'Engineering Analytics',
    });
  }

  return out;
}

/**
 * Deterministic recommendations from the Request domain. Reuses ONLY the
 * raw request list already loaded in app.js — no new query/engine.
 * @param {Array} requests
 * @param {{ pendingThreshold?: number }} [options]
 * @returns {Array<Object>}
 */
export function requestRecommendations(requests, options = {}) {
  const threshold = num(options.pendingThreshold) || 1;
  const list = Array.isArray(requests) ? requests : [];
  const pending = list.filter((r) => r && r.status === 'pending').length;
  if (pending < threshold) return [];
  return [{
    category: 'request-review',
    actionable: true,
    title: 'Tinjau Permintaan Tertunda',
    reason: `${pending} permintaan bidang menunggu persetujuan admin.`,
    expectedBenefit: 'Mempercepat kelancaran operasional bidang yang bergantung pada persetujuan.',
    confidence: pending >= 3 ? CONFIDENCE_HIGH : CONFIDENCE_MEDIUM,
    estimatedImpact: { label: 'Kelancaran Operasional Bidang' },
    source: 'Request Queue',
  }];
}
