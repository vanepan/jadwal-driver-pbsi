/* ============================================================
   EXECUTIVE-REPORT-MODEL.JS — ExecutiveAnalyticsModel → executive report
   projection  (v1.15.0 — Analytics Expansion Foundation)

   Client-side projection for the Analytics Executive PDF. Reads the
   EXISTING executive model (computeExecutiveAnalytics output) and reshapes
   it for the server-side executive-report builder (health hero + KPI grid +
   highlights). No analytics computation here.
   ============================================================ */

'use strict';

import { formatInt } from '../format/numbers.js';
import { longDateID, shortDateID } from '../format/dates.js';
import { healthLevel } from '../../../analytics/engines/executive-score-engine.js';

const CAT_LABEL = { efficiency: 'Efisiensi', warning: 'Peringatan', trend: 'Tren', nor: 'NOR', forecast: 'Proyeksi' };
const TONE_OF = { success: 'good', warning: 'attention', info: 'neutral' };

function rp(n) { return 'Rp ' + Number(Math.round(Number(n) || 0)).toLocaleString('id-ID'); }

/**
 * @param {Object} exec ExecutiveAnalyticsModel
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string }} [meta]
 * @returns {Object} ExecutiveReportModel
 */
export function buildExecutiveReportModel(exec = {}, meta = {}) {
  const s = exec.score || {};
  const d = exec.driverKpis || {};
  const p = exec.pettyKpis || {};
  const generatedAt = (exec.metadata && exec.metadata.generatedAt) || Date.now();

  const metaOut = {
    title: 'Laporan Eksekutif Operasional',
    periodLabel: meta.periodLabel || '',
    dateLabel: longDateID(generatedAt),
    kpisLabel: 'Indikator Eksekutif',
    highlightsLabel: 'Sorotan Eksekutif',
    filterLine: `Periode: ${meta.periodLabel || '—'}`,
    versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
  };

  // B2 parity: the PDF badge must carry the SAME tone the dashboard hero shows
  // (green / amber / crit). `s.tone` is the executive score engine's qualitative
  // tone — passed straight through so the badge colour matches the screen rather
  // than always rendering green. health-score-hero keeps green as the default
  // when badgeTone is absent, so the Complete report stays byte-identical.
  const health = {
    score: s.value == null ? null : s.value,
    outOf: 100,
    badge: s.label || '—',
    badgeTone: s.tone || 'green',
    label: 'Kesehatan Operasional',
  };

  // ── Phase D — Executive Narrative parity. The SAME cross-domain narrative the
  //    dashboard hero shows as its sub-line. Read straight from the model; no
  //    regeneration, no narrative engine here. ─────────────────────────────────
  const narrative = (exec.narrative || '').trim();

  // ── Phase C — Explainability parity. Project the Petty Cash Health Score V2
  //    breakdown the dashboard already renders (exec.pettyHealth) into a PDF-ready
  //    shape: the four weighted components + the derived petty narrative. NO new
  //    computation — every score comes from exec.pettyHealth.components; the per-
  //    row tone reuses healthLevel() exactly as analytics-executive-view does. ──
  const ph = exec.pettyHealth || {};
  const explainability = {
    label: 'Rincian Kesehatan Petty Cash',
    narrative: (ph.narrative || '').trim(),
    score: ph.score == null ? null : ph.score,
    levelLabel: ph.levelLabel || '',
    components: (Array.isArray(ph.components) ? ph.components : []).map((c) => ({
      label: c.label,
      weightPct: c.weightPct,
      score: c.score == null ? null : c.score,
      tone: c.score == null ? 'amber' : healthLevel(c.score).tone,
    })),
  };

  const kpis = [
    { value: formatInt(d.totalTrip || 0), label: 'Total Trip' },
    { value: formatInt(d.driverUtilization || 0), unit: '%', label: 'Driver Utilization' },
    { value: formatInt(d.vehiclesWithTrips || 0), label: 'Kendaraan Aktif' },
    { value: rp(p.activeBalance || 0), label: 'Saldo Aktif' },
    { value: rp(p.consumedSpend || 0), label: 'Dana Terpakai' },
    { value: formatInt(p.realizationPct || 0), unit: '%', label: 'Realisasi' },
  ];

  const highlights = (exec.insights || []).slice(0, 6).map(i => ({
    category: CAT_LABEL[i.category] || 'Wawasan',
    tone: TONE_OF[i.type] || 'neutral',
    statement: i.title,
    context: i.description,
  }));

  return { meta: metaOut, health, narrative, explainability, kpis, highlights };
}
