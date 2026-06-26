/* ============================================================
   RECOMMENDATION-ACCURACY-DASHBOARD.JS — Recommendation Accuracy Engine
   (v1.17.1)

   The premium executive render layer over the Recommendation Accuracy model
   (js/analytics/recommendation-accuracy-engine.js). It is a PURE RENDER layer:
   it computes nothing; it turns the model into markup.

   DESIGN REUSE: it REUSES the Dispatch Analytics design system — the same scoped
   `.daa-*` classes (KPI hero cards, section shells, tables, pills, rankings,
   funnels, sparklines, typography, dark-mode-safe CSS variables). It only injects
   a SMALL `.raa-*` supplement for the calibration chart, the severity meter, the
   delta chips, and the insight cards. So it inherits the exact layout, spacing,
   and dark-mode behaviour of v1.17.0 with no duplicated design tokens. Every
   dynamic value is HTML-escaped.

   API:
     injectRecommendationAccuracyStyles()                           — idempotent <style>
     renderRecommendationAccuracyDashboard(model, opts) → string    — dashboard HTML
   `opts.trendWindow` (7d|30d|90d|ytd) selects the learning-trend window;
   `opts.driverSort` / `opts.driverSearch` / `opts.vehicleSort` / `opts.vehicleSearch`
   drive the per-entity sort + search (the host re-renders on change).
   ============================================================ */

'use strict';

import { injectDispatchAnalyticsStyles } from './dispatch-analytics-dashboard.js';
// v1.17.3 Unified Scoring System — single source of color interpretation (higher = better).
import { scoreColor } from '../services/unified-scoring.js';

const STYLE_ID = 'raa-dashboard-styles';

// Supplements the .daa-* system (which must already be injected). Only the few
// shapes the accuracy dashboard adds beyond Dispatch Analytics.
const CSS = `
.raa-deltas{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.15rem;}
.raa-chip{display:inline-flex;align-items:center;gap:.25rem;font-size:.62rem;font-weight:700;
  border-radius:999px;padding:.1rem .45rem;border:1px solid var(--border);color:var(--muted);background:var(--surface-2);}
.raa-chip--up{color:var(--ok);background:var(--ok-bg);border-color:var(--ok);}
.raa-chip--down{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}

/* Calibration chart: a confidence band ladder with an acceptance fill. */
.raa-cal{display:flex;flex-direction:column;gap:.5rem;}
.raa-cal__row{display:grid;grid-template-columns:6.5rem 1fr auto;align-items:center;gap:.7rem;}
.raa-cal__stars{font-size:.92rem;color:var(--warn);letter-spacing:.04em;white-space:nowrap;}
.raa-cal__track{height:.7rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;position:relative;min-width:2rem;}
.raa-cal__fill{height:100%;border-radius:999px;background:var(--ok);}
.raa-cal__fill--warn{background:var(--warn);}
.raa-cal__fill--danger{background:var(--danger);}
.raa-cal__meta{font-size:.72rem;color:var(--muted);white-space:nowrap;text-align:right;}
.raa-cal__meta b{color:var(--text);}

/* Severity meter — four-segment stacked bar. */
.raa-sev{display:flex;height:1rem;border-radius:999px;overflow:hidden;border:1px solid var(--border);background:var(--surface-2);}
.raa-sev__seg{height:100%;}
.raa-sev__seg--minor{background:var(--ok);}
.raa-sev__seg--medium{background:var(--info);}
.raa-sev__seg--major{background:var(--warn);}
.raa-sev__seg--critical{background:var(--danger);}
.raa-sevlegend{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:.5rem;}
.raa-sevlegend__i{display:inline-flex;align-items:center;gap:.35rem;font-size:.7rem;color:var(--muted);}
.raa-dot{width:.6rem;height:.6rem;border-radius:50%;display:inline-block;}
.raa-dot--minor{background:var(--ok);}.raa-dot--medium{background:var(--info);}
.raa-dot--major{background:var(--warn);}.raa-dot--critical{background:var(--danger);}

/* Insight cards. */
.raa-insights{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.7rem;}
.raa-insight{border:1px solid var(--border);border-left-width:3px;border-radius:12px;padding:.65rem .8rem;
  background:var(--surface-2);display:flex;flex-direction:column;gap:.2rem;}
.raa-insight--success{border-left-color:var(--ok);}
.raa-insight--warning{border-left-color:var(--warn);}
.raa-insight--info{border-left-color:var(--info);}
.raa-insight__t{font-size:.8rem;font-weight:800;color:var(--text);}
.raa-insight__d{font-size:.72rem;color:var(--muted);}
.raa-insight__s{font-size:.6rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}

/* Entity controls (search + sort). */
.raa-controls{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.2rem;}
.raa-search{font-size:.74rem;color:var(--text);background:var(--surface);border:1px solid var(--border);
  border-radius:9px;padding:.35rem .6rem;min-width:9rem;}
.raa-sort{font-size:.72rem;color:var(--text);background:var(--surface);border:1px solid var(--border);
  border-radius:9px;padding:.35rem .5rem;}
.raa-pii{font-size:.78rem;color:var(--text);}

/* Big stat tiles (false-high-confidence / unexpected acceptance). */
.raa-bigs{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.8rem;}
.raa-big{border:1px solid var(--border);border-radius:15px;padding:.85rem .95rem;background:var(--surface-2);
  display:flex;flex-direction:column;gap:.25rem;}
.raa-big__num{font-size:1.7rem;font-weight:800;letter-spacing:-.02em;color:var(--text);line-height:1.05;}
.raa-big__lbl{font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.raa-big__sub{font-size:.66rem;color:var(--muted);}
`;

/** Inject the supplement stylesheet (and ensure the base .daa-* styles exist). */
export function injectRecommendationAccuracyStyles() {
  injectDispatchAnalyticsStyles();
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ── escaping + formatting ────────────────────────────────────────────── */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function pct(n) { return `${Math.round(Number(n) || 0)}%`; }
function stars(n) {
  const s = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(s) + '☆'.repeat(5 - s);
}
/** Unified color scale (higher = better). Single source: scoreColor. */
function rateClass(rate) {
  return scoreColor(rate);
}
/** Calibration fill mapped through the unified color scale (ok/info → green fill). */
function calFillClass(rate) {
  const tone = scoreColor(rate);
  if (tone === 'warn') return ' raa-cal__fill--warn';
  if (tone === 'danger') return ' raa-cal__fill--danger';
  return '';
}

const TREND_WINDOWS = ['7d', '30d', '90d', 'ytd'];

/* ── header ───────────────────────────────────────────────────────────── */

function renderHeader(model, opts) {
  const win = TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d';
  const toggles = model.learningTrend.windows.map((w) =>
    `<button type="button" class="daa-toggle__b" data-raa-window="${esc(w.key)}" data-active="${w.key === win}">${esc(w.label)}</button>`,
  ).join('');
  return `
    <div class="daa-top">
      <div class="daa-top__l">
        <div class="daa-top__title">🎯 Recommendation Accuracy</div>
        <div class="daa-top__sub">Seberapa AKURAT rekomendasi Dispatch Intelligence dari waktu ke waktu — akurasi, kalibrasi confidence, keparahan override, dan tren pembelajaran. Read-only; tidak mengubah rekomendasi atau penugasan.</div>
        <div class="daa-top__meta">${esc(model.totals.decisions)} keputusan dievaluasi</div>
      </div>
      <div class="daa-top__actions">
        <div class="daa-toggle" role="group" aria-label="Rentang tren pembelajaran">${toggles}</div>
        <button type="button" class="daa-btn" data-raa-export="pdf">⬇️ PDF</button>
        <button type="button" class="daa-btn daa-btn--accent" data-raa-export="excel">⬇️ Excel</button>
      </div>
    </div>`;
}

/* ── Feature 1 — overall KPI ──────────────────────────────────────────── */

function deltaChip(label, value, invert) {
  const v = Math.round(Number(value) || 0);
  if (v === 0) return `<span class="raa-chip">${esc(label)} ±0</span>`;
  // For most metrics up = good; for override/invert metrics up = bad.
  const good = invert ? v < 0 : v > 0;
  const cls = good ? 'raa-chip--up' : 'raa-chip--down';
  const arrow = v > 0 ? '▲' : '▼';
  return `<span class="raa-chip ${cls}">${esc(label)} ${arrow}${Math.abs(v)}</span>`;
}

function renderKpis(model) {
  const k = model.kpi;
  const d = (k.previousPeriod && k.previousPeriod.delta) || {};
  const card = (lbl, value, sub, hero) =>
    `<div class="daa-kpi${hero ? ' daa-kpi--hero' : ''}">
      <div class="daa-kpi__lbl">${esc(lbl)}</div>
      <div class="daa-kpi__num">${value}</div>
      <div class="daa-kpi__sub">${sub}</div>
    </div>`;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">Ringkasan Akurasi</div>
        <div class="daa-sec__sub">${esc(k.sampleSize)} sampel keputusan</div></div>
      <div class="daa-kpis">
        ${card('Akurasi Rekomendasi', pct(k.recommendationAccuracy), 'Diterima tanpa perubahan', true)}
        ${card('Tingkat Penerimaan', pct(k.acceptanceRate), 'Rekomendasi diterima / total')}
        ${card('Tingkat Override', pct(k.overrideRate), 'Override / total')}
        ${card('Override Driver', pct(k.driverOverrideRate), 'Driver diganti')}
        ${card('Override Kendaraan', pct(k.vehicleOverrideRate), 'Kendaraan diganti')}
        ${card('Override Penuh', pct(k.fullOverrideRate), 'Driver & kendaraan diganti')}
        ${card('Rata-rata Skor Dispatch', esc(k.avgDispatchScore), 'Skala 0–100')}
        ${card('Rata-rata Confidence', `<span class="daa-kpi__stars">${esc(stars(k.avgConfidence.stars))}</span>`, `${esc(k.avgConfidence.label)} · ${esc(k.avgConfidence.stars)}★`)}
      </div>
      <div>
        <div class="daa-sec__hint">${esc((k.previousPeriod && k.previousPeriod.label) || 'Perbandingan periode')}</div>
        <div class="raa-deltas">
          ${deltaChip('Akurasi', d.recommendationAccuracy, false)}
          ${deltaChip('Penerimaan', d.acceptanceRate, false)}
          ${deltaChip('Override', d.overrideRate, true)}
          ${deltaChip('Skor', d.avgDispatchScore, false)}
        </div>
      </div>
    </div>`;
}

/* ── Feature 2 & 3 — driver / vehicle accuracy (shared renderer) ──────── */

const ENTITY_SORTS = [
  { key: 'ranking', label: 'Peringkat' },
  { key: 'accuracy', label: 'Akurasi' },
  { key: 'recommendations', label: 'Rekomendasi' },
  { key: 'overridden', label: 'Override' },
  { key: 'score', label: 'Skor' },
];

function sortEntityRows(rows, sortKey) {
  const list = [...rows];
  switch (sortKey) {
    case 'accuracy': list.sort((a, b) => b.accuracyPct - a.accuracyPct || a.ranking - b.ranking); break;
    case 'recommendations': list.sort((a, b) => b.recommendations - a.recommendations || a.ranking - b.ranking); break;
    case 'overridden': list.sort((a, b) => b.overridden - a.overridden || a.ranking - b.ranking); break;
    case 'score': list.sort((a, b) => b.avgDispatchScore - a.avgDispatchScore || a.ranking - b.ranking); break;
    default: list.sort((a, b) => a.ranking - b.ranking);
  }
  return list;
}

function entitySection(title, hint, rows, kind, opts) {
  const sortKey = opts.sort || 'ranking';
  const search = String(opts.search || '');
  const term = search.trim().toLowerCase();
  let view = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  view = sortEntityRows(view, sortKey);

  const head = kind === 'driver' ? 'Driver' : 'Kendaraan';
  const sortOpts = ENTITY_SORTS.map((s) =>
    `<option value="${esc(s.key)}"${s.key === sortKey ? ' selected' : ''}>Urut: ${esc(s.label)}</option>`).join('');
  const controls = `
    <div class="raa-controls">
      <input type="search" class="raa-search" data-raa-search="${esc(kind)}" value="${esc(search)}" placeholder="Cari ${esc(head.toLowerCase())}…" aria-label="Cari ${esc(head)}" />
      <select class="raa-sort" data-raa-sort="${esc(kind)}" aria-label="Urutkan">${sortOpts}</select>
      <span class="daa-sec__sub">${view.length}/${rows.length} ${esc(head.toLowerCase())}</span>
    </div>`;

  const body = view.length ? view.map((r) => `<tr>
    <td class="daa-num">${esc(r.ranking)}</td>
    <td class="daa-name">${esc(r.name)}</td>
    <td class="daa-num">${esc(r.recommendations)}</td>
    <td class="daa-num">${esc(r.accepted)}</td>
    <td class="daa-num">${esc(r.overridden)}</td>
    <td class="daa-num"><span class="daa-pill daa-pill--${rateClass(r.accuracyPct)}">${pct(r.accuracyPct)}</span></td>
    <td class="daa-num">${pct(r.acceptancePct)}</td>
    <td class="daa-num">${esc(r.avgDispatchScore)}</td>
    <td class="daa-num">${esc(stars(r.avgConfidenceStars))}</td>
    <td class="daa-num">${esc(r.avgOverrideDifference)}</td>
  </tr>`).join('') : '';

  const table = body ? `<div class="daa-tablewrap"><table class="daa-table">
      <thead><tr><th class="daa-num">#</th><th>${esc(head)}</th><th class="daa-num">Rek.</th><th class="daa-num">Terima</th>
        <th class="daa-num">Override</th><th class="daa-num">Akurasi</th><th class="daa-num">Penerimaan</th>
        <th class="daa-num">Skor</th><th class="daa-num">Confidence</th><th class="daa-num">Selisih</th></tr></thead>
      <tbody>${body}</tbody></table></div>`
    : `<div class="daa-empty"><div class="daa-empty__ic">📭</div><div class="daa-empty__d">${term ? 'Tidak ada hasil pencarian.' : 'Belum ada rekomendasi.'}</div></div>`;

  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">${esc(title)}</div>
        <div class="daa-sec__hint">${esc(hint)}</div></div>
      ${controls}
      ${table}
    </div>`;
}

/* ── Feature 4 — confidence calibration ───────────────────────────────── */

function renderCalibration(model) {
  const rows = model.calibration.buckets.map((b) => `<div class="raa-cal__row">
    <div class="raa-cal__stars" title="${esc(b.label)}">${esc(b.glyph)}</div>
    <div class="raa-cal__track"><div class="raa-cal__fill${calFillClass(b.acceptancePct)}" style="width:${esc(b.acceptancePct)}%"></div></div>
    <div class="raa-cal__meta"><b>${esc(b.generated)}</b> dibuat · terima ${esc(b.acceptancePct)}% · skor ${esc(b.avgDispatchScore)}</div>
  </div>`).join('');
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🎚️ Kalibrasi Confidence</div>
        <div class="daa-sec__hint">Penerimaan aktual per band (kalibrasi tinggi = penerimaan naik seiring bintang)</div></div>
      <div class="raa-cal">${rows}</div>
    </div>`;
}

/* ── Feature 5 — override severity ────────────────────────────────────── */

function renderSeverity(model) {
  const s = model.severity;
  const total = s.totalOverrides || 0;
  const segs = s.categories.map((c) => {
    const w = total ? Math.round((c.count / total) * 100) : 0;
    return w > 0 ? `<div class="raa-sev__seg raa-sev__seg--${esc(c.key)}" style="width:${w}%" title="${esc(c.label)}: ${esc(c.count)}"></div>` : '';
  }).join('');
  const legend = s.categories.map((c) =>
    `<span class="raa-sevlegend__i"><span class="raa-dot raa-dot--${esc(c.key)}"></span>${esc(c.label)} <b>${esc(c.count)}</b> · ${esc(c.percentage)}%</span>`).join('');
  const worst = s.worstCases.slice(0, 6).map((c) => `<tr>
    <td class="daa-name">${esc(c.driverName)} · ${esc(c.vehicleName)}</td>
    <td><span class="daa-pill daa-pill--${c.severity === 'critical' ? 'danger' : c.severity === 'major' ? 'warn' : ''}">${esc(c.severityLabel)}</span></td>
    <td class="daa-num">${esc(c.recommendedScore)} → ${esc(c.selectedScore)}</td>
    <td class="daa-num">−${esc(c.combinedDifference)}</td>
    <td>${esc(c.reason || '—')}</td>
  </tr>`).join('');
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">⚠️ Keparahan Override</div>
        <div class="daa-sec__hint">Selisih skor dispatch antara rekomendasi & pilihan admin · gabungan rata-rata −${esc(s.avgCombinedDifference)}</div></div>
      ${total ? `<div class="raa-sev">${segs}</div><div class="raa-sevlegend">${legend}</div>
      <div class="daa-tablewrap" style="margin-top:.6rem;"><table class="daa-table">
        <thead><tr><th>Penugasan Dipilih</th><th>Keparahan</th><th class="daa-num">Skor</th><th class="daa-num">Selisih</th><th>Alasan</th></tr></thead>
        <tbody>${worst}</tbody></table></div>`
      : `<div class="daa-empty"><div class="daa-empty__ic">✅</div><div class="daa-empty__d">Belum ada override untuk dianalisis.</div></div>`}
    </div>`;
}

/* ── Feature 6 — override reason analytics ────────────────────────────── */

function renderReasons(model) {
  const ra = model.reasonAnalytics;
  const total = ra.totalOverrides || 0;
  const cats = ra.categories.map((c) => `<div class="daa-funnel__row">
    <div class="daa-funnel__k">${esc(c.label)}</div>
    <div class="daa-bar"><div class="daa-bar__fill" style="width:${esc(c.percentage)}%"></div></div>
    <div class="daa-funnel__meta"><b>${esc(c.count)}</b> · ${esc(c.percentage)}%</div></div>`).join('');
  const top = ra.topReasons.length ? `<ul class="daa-reasons">${ra.topReasons.map((r) =>
    `<li class="daa-reasons__li"><span class="daa-reasons__txt">${esc(r.text)}</span><span class="daa-reasons__n">${esc(r.count)}× · ${esc(r.percentage)}%</span></li>`).join('')}</ul>`
    : `<div class="daa-sec__sub">Belum ada alasan override tercatat.</div>`;
  const months = ra.monthlyTrend.length ? `<ul class="daa-reasons">${ra.monthlyTrend.map((m) =>
    `<li class="daa-reasons__li"><span class="daa-reasons__txt">${esc(m.label)} — teratas: ${esc(m.topCategory)}</span><span class="daa-reasons__n">${esc(m.total)}×</span></li>`).join('')}</ul>`
    : `<div class="daa-sec__sub">Belum ada tren bulanan.</div>`;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🗂️ Analitik Alasan Override</div>
        <div class="daa-sec__sub">${total} override · ${ra.reasonedOverrides} beralasan</div></div>
      <div class="daa-cols">
        <div><div class="daa-rank__h" style="margin-bottom:.4rem;">Kategori Alasan</div><div class="daa-funnel">${cats}</div></div>
        <div class="daa-rank"><div class="daa-rank__h">Alasan Teratas</div>${top}</div>
      </div>
      <div class="daa-rank"><div class="daa-rank__h">Tren Bulanan</div>${months}</div>
    </div>`;
}

/* ── Feature 7 & 8 — false-high-confidence + unexpected acceptance ────── */

function renderConfidenceVsDecision(model) {
  const fhc = model.falseHighConfidence;
  const ua = model.unexpectedAcceptance;
  const worst = fhc.worstCases.slice(0, 5).map((c) => `<tr>
    <td class="daa-name">${esc(c.driverName)} · ${esc(c.vehicleName)}</td>
    <td class="daa-num">${esc(c.recommendedScore)} → ${esc(c.selectedScore)}</td>
    <td class="daa-num">−${esc(c.drop)}</td>
    <td>${esc(c.reason || '—')}</td>
  </tr>`).join('');
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">🔎 Confidence vs Keputusan</div>
        <div class="daa-sec__hint">False High Confidence = ★★★★★ tetap di-override · Penerimaan Tak Terduga = ≤3★ tetap diterima</div></div>
      <div class="raa-bigs">
        <div class="raa-big">
          <div class="raa-big__lbl">False High Confidence</div>
          <div class="raa-big__num">${pct(fhc.falseHighConfidencePct)}</div>
          <div class="raa-big__sub">${esc(fhc.overridden)} dari ${esc(fhc.total)} rekomendasi ★★★★★ di-override</div>
        </div>
        <div class="raa-big">
          <div class="raa-big__lbl">Penerimaan Tak Terduga</div>
          <div class="raa-big__num">${pct(ua.acceptancePct)}</div>
          <div class="raa-big__sub">${esc(ua.accepted)} dari ${esc(ua.totalLowConfidence)} rekomendasi ≤3★ diterima</div>
        </div>
      </div>
      ${worst ? `<div class="daa-tablewrap"><table class="daa-table">
        <thead><tr><th>Penugasan (★★★★★ di-override)</th><th class="daa-num">Skor</th><th class="daa-num">Selisih</th><th>Alasan</th></tr></thead>
        <tbody>${worst}</tbody></table></div>` : `<div class="daa-sec__sub">Tidak ada kasus false high confidence — semua rekomendasi ★★★★★ diterima.</div>`}
    </div>`;
}

/* ── Feature 9 — learning trend ───────────────────────────────────────── */

function sparkline(series, field) {
  const list = Array.isArray(series) ? series : [];
  if (!list.length) return `<div class="daa-sec__sub">Tidak ada data dalam rentang.</div>`;
  const max = Math.max(1, ...list.map((s) => Number(s[field]) || 0));
  const cols = list.map((s) => {
    const v = Number(s[field]) || 0;
    const h = Math.max(4, Math.round((v / max) * 100));
    return `<div class="daa-spark__col${v === 0 ? ' daa-spark__col--empty' : ''}" style="height:${h}%" title="${esc(s.label)}: ${esc(v)}"></div>`;
  }).join('');
  return `<div class="daa-spark">${cols}</div>`;
}

function renderLearningTrend(model, opts) {
  const win = model.learningTrend.windows.find((w) => w.key === (TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d')) || model.learningTrend.windows[1];
  if (!win) return '';
  const card = (lbl, value, sub) => `<div class="daa-trendcard">
    <div class="daa-trendcard__lbl">${esc(lbl)}</div><div class="daa-trendcard__num">${value}</div>
    <div class="daa-trendcard__sub">${esc(sub)}</div></div>`;
  const monthly = win.series.length
    ? `<div class="daa-tablewrap"><table class="daa-table">
        <thead><tr><th>Bulan</th><th class="daa-num">Keputusan</th><th class="daa-num">Akurasi</th><th class="daa-num">Override</th><th class="daa-num">Skor</th></tr></thead>
        <tbody>${win.series.map((m) => `<tr><td class="daa-name">${esc(m.label)}</td><td class="daa-num">${esc(m.total)}</td>
          <td class="daa-num">${pct(m.recommendationAccuracy)}</td><td class="daa-num">${pct(m.overrideRate)}</td><td class="daa-num">${esc(m.avgDispatchScore)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="daa-sec__sub">Tidak ada data bulanan dalam rentang.</div>`;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">📈 Tren Pembelajaran — ${esc(win.label)}</div>
        <div class="daa-sec__sub">${esc(win.total)} keputusan dalam rentang</div></div>
      <div class="daa-trendcards">
        ${card('Akurasi', pct(win.recommendationAccuracy), 'rata-rata rentang')}
        ${card('Penerimaan', pct(win.acceptanceRate), 'rata-rata rentang')}
        ${card('Override', pct(win.overrideRate), 'rata-rata rentang')}
        ${card('Skor', esc(win.avgDispatchScore), 'rata-rata')}
        ${card('Confidence', `<span class="daa-kpi__stars">${esc(stars(win.avgConfidenceStars))}</span>`, `${esc(win.avgConfidenceStars)}★`)}
      </div>
      <div><div class="daa-rank__h" style="margin-bottom:.35rem;">Akurasi per Bulan</div>${sparkline(win.series, 'recommendationAccuracy')}</div>
      ${monthly}
    </div>`;
}

/* ── Feature 10 — executive insights ──────────────────────────────────── */

function renderInsights(model) {
  const ins = model.insights || [];
  const cards = ins.length ? `<div class="raa-insights">${ins.map((i) => `<div class="raa-insight raa-insight--${esc(i.type)}">
    <div class="raa-insight__s">${esc(i.source || '')}</div>
    <div class="raa-insight__t">${esc(i.title)}</div>
    <div class="raa-insight__d">${esc(i.description)}</div>
  </div>`).join('')}</div>`
    : `<div class="daa-empty"><div class="daa-empty__ic">💡</div><div class="daa-empty__d">Belum cukup data untuk menyusun insight eksekutif.</div></div>`;
  return `
    <div class="daa-sec">
      <div class="daa-sec__head"><div class="daa-sec__title">💡 Insight Eksekutif</div>
        <div class="daa-sec__sub">Temuan otomatis dari metrik akurasi</div></div>
      ${cards}
    </div>`;
}

/* ── global empty ─────────────────────────────────────────────────────── */

function renderGlobalEmpty() {
  return `
    <div class="daa-sec">
      <div class="daa-empty">
        <div class="daa-empty__ic">🎯</div>
        <div class="daa-empty__t">Belum ada data akurasi</div>
        <div class="daa-empty__d">Dashboard ini mengukur akurasi rekomendasi setelah ada persetujuan request (override log). Setujui beberapa request melalui Dispatch Intelligence untuk melihat akurasi, kalibrasi confidence, keparahan override, dan tren pembelajaran.</div>
      </div>
    </div>`;
}

/* ── public render ────────────────────────────────────────────────────── */

/**
 * Render the full Recommendation Accuracy dashboard as an HTML string.
 * @param {Object} model output of computeRecommendationAccuracyModel
 * @param {Object} [opts] { trendWindow, driverSort, driverSearch, vehicleSort, vehicleSearch }
 * @returns {string}
 */
export function renderRecommendationAccuracyDashboard(model, opts = {}) {
  if (!model) return `<div class="daa raa">${renderGlobalEmpty()}</div>`;
  const o = {
    trendWindow: TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d',
    driverSort: opts.driverSort || 'ranking', driverSearch: opts.driverSearch || '',
    vehicleSort: opts.vehicleSort || 'ranking', vehicleSearch: opts.vehicleSearch || '',
  };
  const hasData = model.totals && model.totals.decisions > 0;
  return `<div class="daa raa">
    ${renderHeader(model, o)}
    ${hasData ? '' : renderGlobalEmpty()}
    ${renderKpis(model)}
    ${entitySection('🧑‍✈️ Akurasi Rekomendasi Driver', 'Per driver: rekomendasi, penerimaan, akurasi, skor, selisih override', model.driverAccuracy.rows, 'driver', { sort: o.driverSort, search: o.driverSearch })}
    ${entitySection('🚐 Akurasi Rekomendasi Kendaraan', 'Mesin yang sama dengan akurasi driver — satu sumber kebenaran', model.vehicleAccuracy.rows, 'vehicle', { sort: o.vehicleSort, search: o.vehicleSearch })}
    ${renderCalibration(model)}
    ${renderSeverity(model)}
    ${renderReasons(model)}
    ${renderConfidenceVsDecision(model)}
    ${renderLearningTrend(model, o)}
    ${renderInsights(model)}
  </div>`;
}
