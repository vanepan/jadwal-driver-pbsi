/* ============================================================
   PETTY-CASH-REPORT-MODEL.JS — PettyCashAnalyticsModel → single-report
   projection  (v1.15.0 — Analytics Expansion Foundation)

   Client-side projection for the Analytics Petty Cash PDF. It reads the
   EXISTING petty-cash analytics model (computePettyCashAnalytics output)
   and reshapes it into the generic single-report model (the same shape the
   Driver/Vehicle reports use). No analytics computation here.
   ============================================================ */

'use strict';

import { formatInt } from '../format/numbers.js';
import { longDateID, shortDateID } from '../format/dates.js';

const CAT_LABEL = { efficiency: 'Efisiensi', warning: 'Peringatan', trend: 'Tren', nor: 'NOR', forecast: 'Proyeksi' };
const TONE_OF = { success: 'good', warning: 'attention', info: 'neutral' };

function rp(n) { return 'Rp ' + Number(Math.round(Number(n) || 0)).toLocaleString('id-ID'); }

/**
 * @param {Object} model PettyCashAnalyticsModel
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string }} [meta]
 * @returns {Object} single-report model (PettyCashReportModel)
 */
export function buildPettyCashReportModel(model = {}, meta = {}) {
  const hero = model.hero || {};
  const cycle = model.cycle || {};
  const breakdown = model.breakdown || {};
  const generatedAt = (model.metadata && model.metadata.generatedAt) || Date.now();

  const metaOut = {
    org: 'Bidang Sarana dan Prasarana',
    orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
    title: 'Laporan Analitik Petty Cash',
    periodLabel: meta.periodLabel || (model.metadata && model.metadata.rangeLabel) || '',
    dateLabel: longDateID(generatedAt),
    filterLine: `Periode: ${meta.periodLabel || (model.metadata && model.metadata.rangeLabel) || '—'}`,
    versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
    contributorsLabel: 'Unit Pengguna Dana Terbesar',
  };

  const heroOut = { value: formatInt(hero.norOfficial || 0), unit: 'NOR', label: 'NOR Official' };

  const kpis = [
    { value: hero.avgRealizationDays == null ? '—' : formatInt(hero.avgRealizationDays),
      unit: hero.avgRealizationDays == null ? '' : 'hari', label: 'Rata-rata Realisasi' },
    { value: rp(cycle.opening || 0), label: 'Saldo Awal Siklus' },
    { value: rp(cycle.spent || 0), label: 'Total Pengeluaran' },
    { value: formatInt(cycle.realizationPct || 0), unit: '%', label: 'Realisasi' },
  ];

  // Zone C — category distribution (bar fill relative to the leader).
  const catRows = (breakdown.category && breakdown.category.rows) || [];
  const maxVal = catRows.reduce((m, r) => Math.max(m, r.value || 0), 0) || 1;
  const distribution = {
    label: 'Distribusi Pengeluaran per Kategori',
    rows: catRows.slice(0, 7).map(r => ({
      name: r.label,
      fillPct: Math.round((r.value / maxVal) * 100),
      shareLabel: `${r.pct}%`,
      secondaryLabel: rp(r.value),
    })),
    note: `Saldo tersisa siklus: ${rp(cycle.remaining || 0)}`,
  };

  // Zone D — insight highlights (reuse the model's already-generated insights).
  const highlights = (model.insights || []).slice(0, 6).map(i => ({
    category: CAT_LABEL[i.category] || 'Wawasan',
    tone: TONE_OF[i.type] || 'neutral',
    statement: i.title,
    context: i.description,
  }));

  // Footer contributors — top units by spend (name + share/value role line).
  const unitRows = (breakdown.unit && breakdown.unit.rows) || [];
  const contributors = unitRows.slice(0, 3).map(u => ({ name: u.label, role: `${rp(u.value)} · ${u.pct}%` }));

  return { meta: metaOut, hero: heroOut, kpis, distribution, highlights, contributors };
}
