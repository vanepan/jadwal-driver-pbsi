/* ============================================================
   RECOMMENDATION-ACCURACY-DASHBOARD.JS — Recommendation Accuracy
   (v1.18.6 — Executive Migration)

   The premium executive render layer over the Recommendation Accuracy model
   (js/analytics/recommendation-accuracy-engine.js). PURE RENDER: it computes
   nothing; it turns the model into markup. The engine is untouched, so every
   business value is byte-identical to before — only the presentation changed.

   ── ONE QUESTION ────────────────────────────────────────────────────────────
   The page answers a single executive question, top to bottom:
     "Apakah rekomendasi AI memang semakin akurat?"
   Everything here supports answering that; nothing else is on the page.

   ── DESIGN AUTHORITY ────────────────────────────────────────────────────────
   Recommendation Accuracy is now a SIBLING of Analytics Driver and Dispatch
   Analytics. It consumes the SAME Executive UI Kit as its single design language
   (ExecutiveHeader/Toolbar, ExecutiveKPICard/Grid, ExecutiveSectionShell,
   ExecutiveTable, ExecutiveStatusPill, ExecutiveSparkline, ExecutiveEmptyState,
   the one icon engine). The inner micro-viz that has no kit primitive — the hero
   stat band, the Executive Status verdict, the entity spotlights, the movement
   headline, and the calibration/history ladders — reuses the SHARED `.daa-*`
   classes owned by Dispatch Analytics (injected via injectDispatchAnalyticsStyles).
   That is the single source of truth; this file only adds the tiny `.raa-*`
   supplement for the per-entity search/sort controls.

   Page structure (v1.18.6):
     Hero (stat band) → Executive Status (one verdict) → Executive KPI
     → Performa Akurasi (movement + calibration, merged) → Driver Spotlight
     → Vehicle Spotlight → Riwayat Rekomendasi.
   (No Bidang Spotlight: the accuracy engine computes no per-bidang block, and
   adding one would be a business-logic change — out of scope for a presentation
   sprint. See the migration report.)

   Every dynamic value is HTML-escaped and emoji-free (numeric confidence, no ★),
   matching the Dispatch Analytics executive vocabulary.

   API:
     injectRecommendationAccuracyStyles()                        — idempotent <style>
     renderRecommendationAccuracyDashboard(model, opts) → string — dashboard HTML
   `opts.trendWindow` (7d|30d|90d|ytd) selects the learning-trend window that
   feeds Performa Akurasi + Riwayat Rekomendasi; `opts.driverSort/driverSearch/
   vehicleSort/vehicleSearch` drive the per-entity sort + search (host re-renders).
   ============================================================ */

'use strict';

import { injectDispatchAnalyticsStyles } from './dispatch-analytics-dashboard.js';
// v1.17.3 Unified Scoring System — single source of color interpretation (higher = better).
import { scoreColor } from '../services/unified-scoring.js';
// v1.18.6 Executive UI — the shared design authority (same kit Dispatch Analytics uses).
import {
  ExecutiveHeader,
  ExecutiveToolbar,
  ExecutiveKPICard,
  ExecutiveKPIGrid,
  ExecutiveSectionShell,
  ExecutiveTable,
  ExecutiveStatusPill,
  ExecutiveSparkline,
  ExecutiveEmptyState,
  anIcon,
} from '../analytics/executive-ui-kit.js';

const STYLE_ID = 'raa-dashboard-styles';

// The ONLY shapes Recommendation Accuracy adds beyond the shared `.daa-*` system:
// the per-entity search + sort controls (whose data-raa-* contract the host binds).
// Everything else is the Executive UI Kit or the shared `.daa-*` micro-viz.
const CSS = `
.raa-controls{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.15rem 0 .55rem;}
.raa-search{font-size:.74rem;color:var(--text);background:var(--surface);border:1px solid var(--border);
  border-radius:9px;padding:.35rem .6rem;min-width:9rem;}
.raa-sort{font-size:.72rem;color:var(--text);background:var(--surface);border:1px solid var(--border);
  border-radius:9px;padding:.35rem .5rem;}
.raa-controls__count{font-size:.72rem;color:var(--muted);}
`;

/** Inject the supplement stylesheet (and ensure the shared .daa-* styles exist). */
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
/** Numeric confidence display (no ★ glyphs — matches Dispatch Analytics). */
function conf(n) {
  const v = Number(n) || 0;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} / 5`;
}
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd} ${mo} ${hh}:${mi}`;
}
/** Unified color scale (higher = better → greener). Single source: scoreColor. */
function rateClass(rate) { return scoreColor(rate); }
/** Capacity/quality status pill via the kit (replaces the old .daa-pill). */
function tonePill(text, tone, title) { return ExecutiveStatusPill(text, tone, title || ''); }

const TREND_WINDOWS = ['7d', '30d', '90d', 'ytd'];

function activeWindow(model, opts) {
  const key = TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d';
  const ws = model.learningTrend.windows;
  return ws.find((w) => w.key === key) || ws[1] || ws[0] || null;
}

/* ── 1. HERO — title + one verdict subtitle + a band of three headline figures.
   No icon, no technical explanation; the numbers carry the confidence. Every
   value is read straight from the model — the hero states the verdict, it does
   not compute a new one. ─────────────────────────────────────────────────── */

function renderHeader(model, opts) {
  const win = TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d';
  // Executive segmented control — SAME `seg` control Dispatch uses, keeping the
  // data-raa-window contract the host's delegated handler binds (no workflow change).
  const toggle = `<div class="seg" role="tablist" aria-label="Rentang tren pembelajaran">${model.learningTrend.windows.map((w) =>
    `<button type="button" class="${w.key === win ? 'on' : ''}" data-raa-window="${esc(w.key)}" data-active="${w.key === win}">${esc(w.label)}</button>`,
  ).join('')}</div>`;
  // Export buttons keep the data-raa-export contract + the byte-identical pipeline.
  const exportBtns =
    `<button type="button" class="exec-reset" data-raa-export="pdf">${anIcon('download', { size: 14 })}PDF</button>` +
    `<button type="button" class="exec-reset" data-raa-export="excel">${anIcon('download', { size: 14 })}Excel</button>`;

  const k = model.kpi;
  const total = model.totals.decisions;
  const accuracy = Number(k.recommendationAccuracy) || 0;
  const overridden = model.totals.overridden;
  const dAcc = Math.round(Number((k.previousPeriod && k.previousPeriod.delta && k.previousPeriod.delta.recommendationAccuracy)) || 0);
  const subtitle = dAcc > 0
    ? 'Rekomendasi AI makin konsisten digunakan.'
    : accuracy >= 90
      ? 'Rekomendasi AI konsisten dipakai tanpa koreksi.'
      : accuracy >= 75
        ? 'Rekomendasi AI dipakai untuk sebagian besar keputusan.'
        : 'Akurasi rekomendasi AI sedang dipantau.';
  const stat = (v, l) => `<div class="daa-hero-stat"><span class="daa-hero-stat__v">${esc(v)}</span><span class="daa-hero-stat__l">${esc(l)}</span></div>`;
  const statBand = `<div class="daa-hero-stats">
      ${stat(total, 'rekomendasi')}
      ${stat(pct(accuracy), 'tepat')}
      ${stat(overridden, 'dikoreksi admin')}
    </div>`;
  return ExecutiveHeader({
    title: 'Recommendation Accuracy',
    subtitle,
    meta: `Diperbarui ${fmtTime(model.generatedAt)} · ${total} keputusan dievaluasi`,
  }) + statBand + ExecutiveToolbar({ left: toggle, right: exportBtns });
}

/* ── 2. EXECUTIVE STATUS — ONE verdict card directly under the hero. It states a
   single accuracy status, a matching level word, and one supporting sentence,
   all read from values already in the model (no prediction, no new analytics).
   The trend delta decides whether "membaik" is part of the story. ─────────── */

function renderStatus(model) {
  const k = model.kpi;
  const acc = Number(k.recommendationAccuracy) || 0;
  const dAcc = Math.round(Number((k.previousPeriod && k.previousPeriod.delta && k.previousPeriod.delta.recommendationAccuracy)) || 0);
  const improving = dAcc > 0, declining = dAcc < 0;

  let tone, level, msg;
  if (acc >= 90 && !declining) {
    tone = 'good'; level = 'Sangat Baik';
    msg = `Rekomendasi hampir selalu tepat — ${pct(acc)} dipakai admin tanpa perubahan.`;
  } else if (acc >= 75 && !declining) {
    tone = 'good'; level = 'Baik';
    msg = improving
      ? `Akurasi membaik — kini ${pct(acc)} rekomendasi dipakai tanpa koreksi.`
      : `Sebagian besar rekomendasi dipakai tanpa koreksi — ${pct(acc)} tepat.`;
  } else if (improving) {
    tone = 'info'; level = 'Membaik';
    msg = `Akurasi naik ${Math.abs(dAcc)} poin dibanding periode sebelumnya — arah sudah tepat.`;
  } else if (acc >= 60) {
    tone = 'info'; level = 'Cukup Stabil';
    msg = `Akurasi bertahan di ${pct(acc)}, sebagian keputusan masih dikoreksi admin.`;
  } else {
    tone = 'warn'; level = 'Perlu Perhatian';
    msg = `Rekomendasi masih sering dikoreksi — baru ${pct(acc)} dipakai tanpa perubahan.`;
  }
  return `<div class="daa-status daa-status--${tone}">
      <div class="daa-status__eye">Status Akurasi</div>
      <div class="daa-status__level">${esc(level)}</div>
      <div class="daa-status__msg">${esc(msg)}</div>
    </div>`;
}

/* ── 3. EXECUTIVE KPI — four indicators in business language. Every subtitle says
   why the number matters. AI/model/developer terminology is avoided. ──────── */

function renderKpis(model) {
  const k = model.kpi;
  const cards = [
    ExecutiveKPICard({ title: 'Rekomendasi Tepat', value: pct(k.recommendationAccuracy), subtitle: 'Dipakai admin tanpa koreksi', icon: anIcon('check', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Perubahan Admin', value: pct(k.overrideRate), subtitle: 'Seberapa sering admin mengoreksi', icon: anIcon('repeat', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Kualitas Keputusan', value: esc(k.avgDispatchScore), subtitle: 'Mutu penugasan yang dipilih (0–100)', icon: anIcon('target', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Keyakinan AI', value: conf(k.avgConfidence.stars), subtitle: `Seberapa yakin sistem · ${esc(k.avgConfidence.label).toLowerCase()}`, icon: anIcon('bulb', { size: 15 }) }),
  ];
  return ExecutiveSectionShell({
    title: 'Ringkasan Eksekutif',
    content: ExecutiveKPIGrid(cards),
  });
}

/* ── 4. PERFORMA AKURASI — the single "is accuracy healthy and improving?" section.
   MERGES the movement (direction + magnitude over the selected window) with the
   confidence-calibration ladder (does higher AI confidence really earn higher
   acceptance?). No new analytics — both read straight from the model. ─────── */

/** One movement headline — direction + magnitude read from a window series
 *  (last minus first). `goodDir` decides which direction is green. */
function movementCard(label, series, unit, goodDir, phrases) {
  const arr = (Array.isArray(series) ? series : []).map((n) => Number(n) || 0);
  const spark = arr.length >= 2 ? ExecutiveSparkline(arr, { tone: 'info' })
    : '<div class="daa-move__sub">Belum cukup data</div>';
  let dirCls = 'flat', arrow = '→', mag = '', phrase = phrases.flat;
  if (arr.length >= 2) {
    const delta = Math.round(arr[arr.length - 1] - arr[0]);
    if (delta > 0) { dirCls = goodDir === 'up' ? 'up' : 'down'; arrow = '↑'; mag = `${Math.abs(delta)}${unit}`; phrase = phrases.up; }
    else if (delta < 0) { dirCls = goodDir === 'down' ? 'up' : 'down'; arrow = '↓'; mag = `${Math.abs(delta)}${unit}`; phrase = phrases.down; }
  }
  return `<div class="daa-trendcard">
      <div class="daa-trendcard__lbl">${esc(label)}</div>
      <div class="daa-move__row"><span class="daa-move__dir daa-move__dir--${dirCls}">${arrow}${mag ? ' ' + esc(mag) : ''}</span><span class="daa-move__t">${esc(phrase)}</span></div>
      <div style="margin-top:.5rem">${spark}</div>
    </div>`;
}

function renderPerforma(model, opts) {
  const win = activeWindow(model, opts);
  const s = win && Array.isArray(win.series) ? win.series : [];
  const accSeries = s.map((m) => Number(m.recommendationAccuracy) || 0);
  const ovrSeries = s.map((m) => Number(m.overrideRate) || 0);
  const movement = `<div class="daa-cols">
      ${movementCard('Akurasi Rekomendasi', accSeries, '%', 'up', { up: 'AI makin akurat', down: 'AI makin sering meleset', flat: 'Akurasi stabil' })}
      ${movementCard('Perubahan Admin', ovrSeries, '%', 'down', { up: 'Admin makin sering mengoreksi', down: 'Admin makin jarang mengoreksi', flat: 'Perubahan admin stabil' })}
    </div>`;

  // Calibration ladder — only bands the AI actually produced, high confidence
  // first. A well-calibrated engine shows acceptance rising with confidence.
  const buckets = model.calibration.buckets.filter((b) => b.generated > 0);
  const ladder = buckets.length ? `<div class="daa-funnel">${buckets.map((b) => {
    const tone = scoreColor(b.acceptancePct);
    const fillCls = tone === 'ok' ? ' daa-bar__fill--ok' : tone === 'warn' ? ' daa-bar__fill--warn' : tone === 'danger' ? ' daa-bar__fill--danger' : '';
    return `<div class="daa-funnel__row">
        <div class="daa-funnel__k">${esc(b.label)}</div>
        <div class="daa-bar"><div class="daa-bar__fill${fillCls}" style="width:${esc(b.acceptancePct)}%"></div></div>
        <div class="daa-funnel__meta"><b>${esc(b.acceptancePct)}%</b> diterima · ${esc(b.generated)} rek.</div></div>`;
  }).join('')}</div>` : ExecutiveEmptyState({ message: 'Belum cukup rekomendasi untuk menilai kalibrasi.' });

  return ExecutiveSectionShell({
    title: 'Performa Akurasi',
    description: win ? `${win.label} · ${win.total} keputusan` : '',
    content: `${movement}
      <div class="daa-detail-cap" style="margin-top:1rem">Makin yakin AI, makin sering diterima?</div>
      ${ladder}`,
  });
}

/* ── 5 & 6. ENTITY SPOTLIGHTS — Driver / Kendaraan. Each section leads with the
   premium "who is most accurate" spotlight (big name, one large figure, minimal
   metadata), then the detail table. The per-entity search + sort controls keep
   their data-raa-* contract. ────────────────────────────────────────────── */

function spotlight({ eyebrow, name, primary, meta }) {
  return `<div class="daa-spot">
      <div class="daa-spot__eye">${esc(eyebrow)}</div>
      <div class="daa-spot__name">${esc(name)}</div>
      <div class="daa-spot__score"><span class="daa-spot__score-v">${esc(primary.value)}</span><span class="daa-spot__score-l">${esc(primary.label)}</span></div>
      <div class="daa-spot__meta">${meta}</div>
    </div>`;
}

const ENTITY_SORTS = [
  { key: 'ranking', label: 'Peringkat' },
  { key: 'accuracy', label: 'Akurasi' },
  { key: 'recommendations', label: 'Rekomendasi' },
  { key: 'overridden', label: 'Diubah' },
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

function entityTable(view, head) {
  if (!view.length) return ExecutiveEmptyState({ message: 'Tidak ada hasil pencarian.' });
  const columns = [
    { key: 'ranking', label: '#', align: 'right' },
    { key: 'name', label: head, primary: true },
    { key: 'recommendations', label: 'Rekomendasi', align: 'right' },
    { key: 'accepted', label: 'Diterima', align: 'right' },
    { key: 'overridden', label: 'Diubah', align: 'right' },
    { key: 'accuracy', label: 'Akurasi', align: 'right', render: (v) => tonePill(pct(v), rateClass(v)) },
    { key: 'score', label: 'Skor', align: 'right' },
  ];
  const rows = view.map((r) => ({
    ranking: r.ranking, name: r.name, recommendations: r.recommendations,
    accepted: r.accepted, overridden: r.overridden, accuracy: r.accuracyPct, score: r.avgDispatchScore,
  }));
  return ExecutiveTable({ columns, rows, ariaLabel: `Akurasi ${head}` });
}

function entitySection({ title, description, eyebrow, rows, kind, opts }) {
  const head = kind === 'driver' ? 'Driver' : 'Kendaraan';
  if (!rows.length) {
    return ExecutiveSectionShell({
      title,
      content: ExecutiveEmptyState({ message: `Belum ada rekomendasi ${head.toLowerCase()}.` }),
    });
  }
  // Spotlight = the overall most-accurate entity (rows are ranked by accuracy),
  // shown regardless of any active search term.
  const top = rows[0];
  const spot = spotlight({
    eyebrow,
    name: top.name,
    primary: { value: pct(top.accuracyPct), label: 'Akurat' },
    meta: `<b>${esc(top.recommendations)}</b> rekomendasi · skor <b>${esc(top.avgDispatchScore)}</b>`,
  });

  const sortKey = opts.sort || 'ranking';
  const search = String(opts.search || '');
  const term = search.trim().toLowerCase();
  let view = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;
  view = sortEntityRows(view, sortKey);

  const sortOpts = ENTITY_SORTS.map((so) =>
    `<option value="${esc(so.key)}"${so.key === sortKey ? ' selected' : ''}>Urut: ${esc(so.label)}</option>`).join('');
  const controls = `<div class="raa-controls">
      <input type="search" class="raa-search" data-raa-search="${esc(kind)}" value="${esc(search)}" placeholder="Cari ${esc(head.toLowerCase())}…" aria-label="Cari ${esc(head)}" />
      <select class="raa-sort" data-raa-sort="${esc(kind)}" aria-label="Urutkan">${sortOpts}</select>
      <span class="raa-controls__count">${view.length}/${rows.length} ${esc(head.toLowerCase())}</span>
    </div>`;

  return ExecutiveSectionShell({
    title,
    description,
    content: `${spot}
      ${controls}
      <div class="daa-detail-cap">Rincian per ${esc(head.toLowerCase())}</div>
      ${entityTable(view, head)}`,
  });
}

/* ── 7. RIWAYAT REKOMENDASI — the final section: the month-by-month record of
   accuracy over the selected window, so the reader can see the trajectory that
   the hero + status summarised. No new analytics — the monthly series is the
   engine's. ─────────────────────────────────────────────────────────────── */

function renderHistory(model, opts) {
  const win = activeWindow(model, opts);
  const series = win && Array.isArray(win.series) ? win.series : [];
  if (!series.length) {
    return ExecutiveSectionShell({
      title: 'Riwayat Rekomendasi',
      content: ExecutiveEmptyState({ message: 'Belum ada riwayat bulanan dalam rentang ini.' }),
    });
  }
  const columns = [
    { key: 'label', label: 'Bulan', primary: true },
    { key: 'total', label: 'Keputusan', align: 'right' },
    { key: 'accuracy', label: 'Akurasi', align: 'right', render: (v) => tonePill(pct(v), rateClass(v)) },
    { key: 'override', label: 'Dikoreksi', align: 'right', render: (v) => pct(v) },
    { key: 'score', label: 'Skor', align: 'right' },
  ];
  const rows = series.map((m) => ({
    label: m.label, total: m.total, accuracy: m.recommendationAccuracy,
    override: m.overrideRate, score: m.avgDispatchScore,
  }));
  return ExecutiveSectionShell({
    title: 'Riwayat Rekomendasi',
    description: `${win.label} · ${win.total} keputusan`,
    content: ExecutiveTable({ columns, rows, ariaLabel: 'Riwayat Rekomendasi' }),
  });
}

/* ── global empty ─────────────────────────────────────────────────────── */

function renderGlobalEmpty() {
  return ExecutiveSectionShell({
    title: 'Belum ada data akurasi',
    content: ExecutiveEmptyState({
      message: 'Dashboard ini terisi setelah ada persetujuan request.',
      hint: 'Setujui beberapa request melalui Dispatch Intelligence untuk melihat apakah rekomendasi AI semakin akurat dari waktu ke waktu.',
    }),
  });
}

/* ── public render ────────────────────────────────────────────────────── */

/**
 * Render the full Recommendation Accuracy dashboard as an HTML string.
 * @param {Object} model output of computeRecommendationAccuracyModel
 * @param {Object} [opts] { trendWindow, driverSort, driverSearch, vehicleSort, vehicleSearch }
 * @returns {string}
 */
export function renderRecommendationAccuracyDashboard(model, opts = {}) {
  // Root keeps `.daa raa` for layout + the shared inner-viz scope, and adds
  // `exec-ui v2-analytics-claude` so the kit/analytics classes (and the dark-mode
  // variant) resolve even though the dashboard renders outside an analytics scope.
  const ROOT = 'daa raa exec-ui v2-analytics-claude';
  if (!model) return `<div class="${ROOT}">${renderGlobalEmpty()}</div>`;
  const o = {
    trendWindow: TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d',
    driverSort: opts.driverSort || 'ranking', driverSearch: opts.driverSearch || '',
    vehicleSort: opts.vehicleSort || 'ranking', vehicleSearch: opts.vehicleSearch || '',
  };
  const hasData = model.totals && model.totals.decisions > 0;
  // Executive experience hierarchy (v1.18.6) — the page answers "apakah AI makin
  // akurat?" in <5s, then offers detail. Each block carries a different visual
  // weight: Hero (stat band) → Status (one verdict) → KPI (four-number story) →
  // Performa Akurasi (movement + calibration, merged) → Driver → Vehicle
  // (spotlight-led) → Riwayat (monthly record).
  return `<div class="${ROOT}">
    ${renderHeader(model, o)}
    ${hasData ? renderStatus(model) : renderGlobalEmpty()}
    ${renderKpis(model)}
    ${renderPerforma(model, o)}
    ${entitySection({ title: 'Ringkasan Driver', description: 'Driver mana yang rekomendasinya paling akurat', eyebrow: 'Driver Paling Akurat', rows: model.driverAccuracy.rows, kind: 'driver', opts: { sort: o.driverSort, search: o.driverSearch } })}
    ${entitySection({ title: 'Ringkasan Kendaraan', description: 'Kendaraan mana yang rekomendasinya paling akurat', eyebrow: 'Kendaraan Paling Akurat', rows: model.vehicleAccuracy.rows, kind: 'vehicle', opts: { sort: o.vehicleSort, search: o.vehicleSearch } })}
    ${renderHistory(model, o)}
  </div>`;
}
