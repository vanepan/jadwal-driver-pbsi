/* ============================================================
   BIDANG-REPORT-MODEL.JS — AnalyticsModel → BidangReportModel

   The client-side projection for the Bidang Analytics Export
   (IMPLEMENTATION_ARCHITECTURE §5/§7). Reads the EXISTING
   AnalyticsModel + Insight Engine — it does NOT compute analytics
   or create an engine. Zone C is the fulfilled/waiting status strip
   (BidangStatusStrip), so the model carries `bidangStatus` instead
   of `distribution`; single-report.js renders it accordingly.

   Per-bidang distance is NOT held by the engine — the app already
   aggregates it (Sprint 7C) and passes it in via meta.bidangKm
   (resolved bidang name → km). This reuses existing computation; no
   new aggregation is introduced here.

   Field mapping (AnalyticsModel → BidangReportModel):
     hero.value           ← render.filteredReqs.length     (Permintaan)
     kpis[Bidang Aktif]   ← render.bidangEnhanced.length
     kpis[Terpenuhi]      ← #bidang fully fulfilled
     kpis[Menunggu]       ← #bidang with unmet requests
     kpis[Jarak Tercatat] ← Σ meta.bidangKm
     kpis[Tingkat …]      ← fulfilled / activeBidang
     bidangStatus.items   ← render.bidangEnhanced (+ meta.bidangKm)
     highlights           ← selectBidangHighlights
     contributors         ← selectBidangContributors
   ============================================================ */

'use strict';

import { formatInt, formatKmLabel } from '../format/numbers.js';
import { longDateID, shortDateID } from '../format/dates.js';
import { selectBidangHighlights } from '../insights/bidang-highlights.js';
import { selectBidangContributors } from '../insights/bidang-contributors.js';

function _isFulfilled(b) {
  return (b.reqCount || 0) > 0 && (b.asgCount || 0) >= (b.reqCount || 0);
}

/**
 * Build the Bidang report projection.
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {{ periodLabel?:string, generatedBy?:string, appVersion?:string,
 *           filters?:{driver?:string,vehicle?:string,bidang?:string},
 *           bidangKm?:Object.<string,number> }} [meta]
 * @returns {import('./report-types.js').BidangReportModel}
 */
export function buildBidangReportModel(model, meta = {}) {
  const r = (model && model.render) || {};
  const generatedAt = (model && model.metadata && model.metadata.generatedAt) || Date.now();
  const bidangKm = meta.bidangKm || {};

  const filters = meta.filters || {};
  const fDriver  = filters.driver  || 'Semua Pengemudi';
  const fVehicle = filters.vehicle || 'Semua Kendaraan';
  const fBidang  = filters.bidang  || 'Semua Bidang';

  const metaOut = {
    org: 'Bidang Sarana dan Prasarana',
    orgSub: 'PBSI — Persatuan Bulu Tangkis Seluruh Indonesia',
    title: 'Laporan Analitik Bidang',
    periodLabel: meta.periodLabel || '',
    dateLabel: longDateID(generatedAt),
    // Bidang-first filter order (matches the approved Bidang tab).
    filterLine: `Filter: ${fBidang} · ${fDriver} · ${fVehicle}`,
    versionLine: `v${meta.appVersion || '—'} · ${meta.generatedBy || '—'} · ${shortDateID(generatedAt)}`,
    contributorsLabel: 'Kontributor Utama',
  };

  const bidangs = Array.isArray(r.bidangEnhanced) ? r.bidangEnhanced : []; // desc reqCount
  const totalReqs = Array.isArray(r.filteredReqs) ? r.filteredReqs.length : 0;
  const activeBidang = bidangs.length;
  const fulfilledCount = bidangs.filter(_isFulfilled).length;
  const waitingCount = activeBidang - fulfilledCount;
  const totalBidangKm = Object.values(bidangKm).reduce((s, km) => s + (km || 0), 0);
  const fulfillmentRate = activeBidang > 0 ? Math.round((fulfilledCount / activeBidang) * 100) : 0;

  // ── Hero — total requests ─────────────────────────────────────
  const hero = { value: formatInt(totalReqs), label: 'Permintaan' };

  // ── KPI grid (5 cells, matching the approved Bidang layout) ──
  const kpis = [
    { value: formatInt(activeBidang),    label: 'Bidang Aktif' },
    { value: formatInt(fulfilledCount),  label: 'Terpenuhi' },
    { value: formatInt(waitingCount),    label: 'Menunggu' },
    { value: formatInt(totalBidangKm),   unit: 'km', label: 'Jarak Tercatat' },
    { value: formatInt(fulfillmentRate), unit: '%',  label: 'Tingkat Pemenuhan' },
  ];

  // ── Zone C — fulfilled/waiting status strips ──────────────────
  const bidangStatus = {
    label: 'Permintaan per Bidang',
    items: bidangs.map((b) => {
      const km = bidangKm[b.name] || 0;
      const fulfilled = _isFulfilled(b);
      return {
        name: b.name,
        detail: `${formatInt(b.reqCount || 0)} permintaan · ${formatInt(b.asgCount || 0)} penugasan · ${formatKmLabel(km)}`,
        status: fulfilled ? 'fulfilled' : 'waiting',
        statusLabel: fulfilled ? 'Terpenuhi' : 'Menunggu',
      };
    }),
  };

  // ── Highlights + Contributors (reuse engine outputs) ─────────
  const highlights = selectBidangHighlights(model, bidangKm);
  const { contributors } = selectBidangContributors(model, bidangKm);

  return { meta: metaOut, hero, kpis, bidangStatus, highlights, contributors };
}
