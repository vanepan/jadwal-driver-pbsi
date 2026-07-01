/* ============================================================
   DISPATCH-ANALYTICS-DASHBOARD.JS — Dispatch Intelligence Analytics
   (v1.17.0)

   The premium, Apple-style executive dashboard that visualizes the Dispatch
   Intelligence Analytics model (js/analytics/dispatch-analytics-engine.js). It
   is a PURE RENDER layer: it computes nothing, it only turns the model into
   markup. All section math is the engine's; this file owns presentation only.

   DESIGN: built entirely on the platform CSS custom properties (var(--surface),
   --surface-2, --border, --text, --muted, --info/--info-bg, --warn/--warn-bg,
   --ok/--ok-bg, --danger/--danger-bg, --accent/--on-accent, --shadow-sm) so it
   adapts to dark mode automatically (no hard-coded #fff — the --white trap) and
   is fully responsive (CSS grid with auto-fit, min-width:0, no horizontal
   scroll). Every dynamic value is HTML-escaped, so a driver / vehicle / bidang
   name can never inject markup. Styles are injected ONCE under scoped `.daa-*`.

   API:
     injectDispatchAnalyticsStyles()                       — idempotent <style>
     renderDispatchAnalyticsDashboard(model, opts) → string — full dashboard HTML
   `opts.trendWindow` (7d|30d|90d|ytd) selects the active trend window; the host
   re-calls render with a new window on toggle.
   ============================================================ */

'use strict';

// v1.17.3 Unified Scoring System — the ONE source of band/color/capacity
// interpretation (higher = better). The dashboard reuses these; it never
// re-implements a band or color or inverts a score locally.
import { scoreColor, capacityScore, scoreLabelId } from '../services/unified-scoring.js';

// v1.18.5 Executive UI Sprint 3 — Dispatch Analytics now consumes the Executive
// UI Kit as its single design authority (header, toolbar, KPIs, section shells,
// tables, badges, sparkline, empty states, and the one icon engine). Only the
// inner micro-viz (hero stat band, Executive Status, entity spotlights, movement
// headline, funnel/rank/timeline/reason chips) — which have no kit primitive —
// still use the scoped `.daa-*` classes below.
// v1.18.6 — Recommendation Accuracy has now ALSO migrated to the Executive UI Kit
// and SHARES this same `.daa-*` micro-viz block (spotlight, status, hero stats,
// funnel, bar, cols, detail-cap, movement). This block therefore remains the
// single source of truth for both dashboards. The presentation classes that were
// only used by the pre-migration dashboards (`.daa-top/.daa-btn/.daa-toggle`,
// `.daa-kpi*`, `.daa-dist*`, `.daa-spark*`) were removed as dead code in the RAA
// migration — the kit's ExecutiveHeader/Toolbar/KPICard/Sparkline own those now.
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

const STYLE_ID = 'daa-dashboard-styles';

const CSS = `
.daa{display:flex;flex-direction:column;gap:1.1rem;min-width:0;color:var(--text);
  font-family:var(--font-sans, inherit);}
.daa *{box-sizing:border-box;}

/* Section shell */
.daa-sec{border:1px solid var(--border);border-radius:18px;background:var(--surface);
  padding:1.05rem 1.15rem;display:flex;flex-direction:column;gap:.85rem;box-shadow:var(--shadow-sm);
  min-width:0;}
.daa-sec__head{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem;flex-wrap:wrap;}
.daa-sec__title{font-size:.95rem;font-weight:800;letter-spacing:-.01em;color:var(--text);
  display:flex;align-items:center;gap:.5rem;}
.daa-sec__sub{font-size:.72rem;color:var(--muted);}
.daa-sec__hint{font-size:.66rem;color:var(--muted);font-style:italic;}

/* Empty state */
.daa-empty{display:flex;flex-direction:column;align-items:center;gap:.4rem;
  padding:1.6rem 1rem;text-align:center;color:var(--muted);}
.daa-empty__ic{font-size:1.8rem;opacity:.7;}
.daa-empty__t{font-size:.9rem;font-weight:700;color:var(--text);}
.daa-empty__d{font-size:.76rem;max-width:32rem;}

/* Hero stat band — the three headline figures under the hero title. Large,
   de-boxed, whitespace-led: the hero is the strongest visual element on the page. */
.daa-hero-stats{display:flex;flex-wrap:wrap;gap:2.4rem;margin:.35rem 0 .1rem;}
.daa-hero-stat{display:flex;flex-direction:column;gap:.15rem;min-width:0;}
.daa-hero-stat__v{font-size:2.1rem;font-weight:800;letter-spacing:-.03em;color:var(--text);line-height:1;}
.daa-hero-stat__l{font-size:.72rem;font-weight:600;color:var(--muted);}

/* Executive Status — one verdict card (replaces the four-row checklist). Tinted
   by tone; the largest single message block below the hero. */
.daa-status{display:flex;flex-direction:column;gap:.3rem;padding:1.2rem 1.35rem;
  border:1px solid var(--border);border-left-width:4px;border-radius:16px;background:var(--surface-2);}
.daa-status__eye{font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
.daa-status__level{font-size:1.5rem;font-weight:800;letter-spacing:-.02em;line-height:1.1;color:var(--text);}
.daa-status__msg{font-size:.86rem;color:var(--muted);max-width:44rem;line-height:1.45;}
.daa-status--good{border-left-color:var(--ok);background:var(--ok-bg);}
.daa-status--good .daa-status__level{color:var(--ok);}
.daa-status--info{border-left-color:var(--info);background:var(--info-bg);}
.daa-status--info .daa-status__level{color:var(--info);}
.daa-status--warn{border-left-color:var(--warn);background:var(--warn-bg);}
.daa-status--warn .daa-status__level{color:var(--warn);}

/* Executive spotlight — the premium "who to trust" card leading each entity
   section (Driver / Kendaraan / Bidang). Apple-Health/Linear feel: big name, one
   large primary figure, minimal supporting metadata, generous whitespace. */
.daa-spot{display:flex;flex-direction:column;gap:.15rem;padding:1.45rem 1.5rem;margin-bottom:1.15rem;
  border:1px solid var(--border);border-radius:18px;
  background:linear-gradient(180deg, var(--info-bg), var(--surface));min-width:0;}
.daa-spot__eye{font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--info);}
.daa-spot__name{font-size:1.55rem;font-weight:800;letter-spacing:-.01em;color:var(--text);line-height:1.15;
  text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
.daa-spot__score{display:flex;align-items:baseline;gap:.5rem;margin-top:.55rem;}
.daa-spot__score-v{font-size:2.9rem;font-weight:800;letter-spacing:-.03em;color:var(--text);line-height:.95;}
.daa-spot__score-l{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.daa-spot__meta{font-size:.8rem;color:var(--muted);margin-top:.5rem;}
.daa-spot__meta b{color:var(--text);font-weight:700;}

/* "Rincian" caption that demotes the detail table below each spotlight. */
.daa-detail-cap{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);margin:.15rem 0 .55rem;}

/* Trend movement headline — direction + magnitude, not a statistic. */
.daa-move{display:flex;flex-direction:column;gap:.2rem;}
.daa-move__row{display:flex;align-items:baseline;gap:.5rem;}
.daa-move__dir{font-size:1.35rem;font-weight:800;line-height:1;letter-spacing:-.02em;}
.daa-move__dir--up{color:var(--ok);}
.daa-move__dir--down{color:var(--danger);}
.daa-move__dir--flat{color:var(--muted);}
.daa-move__t{font-size:.9rem;font-weight:700;color:var(--text);}
.daa-move__sub{font-size:.72rem;color:var(--muted);}

/* Bar (funnel / calibration ladder fill) */
.daa-bar{height:.62rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);
  overflow:hidden;min-width:2rem;}
.daa-bar__fill{height:100%;background:var(--info);border-radius:999px;}
.daa-bar__fill--ok{background:var(--ok);}
.daa-bar__fill--warn{background:var(--warn);}
.daa-bar__fill--danger{background:var(--danger);}

/* Tables */
.daa-tablewrap{width:100%;min-width:0;max-width:100%;overflow-x:auto;
  -webkit-overflow-scrolling:touch;}
.daa-table{width:100%;border-collapse:collapse;font-size:.78rem;min-width:0;}
.daa-table th,.daa-table td{text-align:left;padding:.45rem .55rem;border-bottom:1px solid var(--border);
  white-space:nowrap;}
.daa-table th{font-size:.64rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}
.daa-table td.daa-num,.daa-table th.daa-num{text-align:right;}
.daa-table td.daa-name{white-space:normal;font-weight:700;color:var(--text);max-width:14rem;}
.daa-table tbody tr:last-child td{border-bottom:0;}
.daa-pill{display:inline-block;font-size:.64rem;font-weight:700;border-radius:999px;padding:.1rem .45rem;
  border:1px solid var(--border);color:var(--muted);background:var(--surface-2);}
.daa-pill--ok{color:var(--ok);background:var(--ok-bg);border-color:var(--ok);}
.daa-pill--info{color:var(--info);background:var(--info-bg);border-color:var(--info);}
.daa-pill--warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn);}
.daa-pill--danger{color:var(--danger);background:var(--danger-bg);border-color:var(--danger);}

/* Two-column layout helper */
.daa-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1.1rem;}

/* Rankings */
.daa-rank{display:flex;flex-direction:column;gap:.55rem;}
.daa-rank__h{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);}
.daa-rank__list{display:flex;flex-direction:column;gap:.35rem;margin:0;padding:0;list-style:none;}
.daa-rank__item{display:flex;align-items:center;gap:.6rem;font-size:.8rem;}
.daa-rank__n{flex:0 0 1.3rem;height:1.3rem;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:.66rem;font-weight:800;color:var(--on-accent);background:var(--accent);}
.daa-rank__nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-weight:600;color:var(--text);}
.daa-rank__v{flex:0 0 auto;font-size:.72rem;color:var(--muted);}
.daa-rank__v b{color:var(--text);}

/* Funnel */
.daa-funnel{display:flex;flex-direction:column;gap:.5rem;}
.daa-funnel__row{display:grid;grid-template-columns:9rem 1fr auto;align-items:center;gap:.7rem;}
.daa-funnel__k{font-size:.78rem;font-weight:600;color:var(--text);}
.daa-funnel__meta{font-size:.74rem;color:var(--muted);white-space:nowrap;text-align:right;}
.daa-funnel__meta b{color:var(--text);}

/* Timeline */
.daa-tl{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;}
.daa-tl__li{display:flex;gap:.7rem;position:relative;padding:0 0 .85rem;}
.daa-tl__li:last-child{padding-bottom:0;}
.daa-tl__rail{flex:0 0 .8rem;display:flex;flex-direction:column;align-items:center;}
.daa-tl__dot{width:.7rem;height:.7rem;border-radius:50%;margin-top:.2rem;background:var(--info);border:2px solid var(--surface);}
.daa-tl__dot--ok{background:var(--ok);}
.daa-tl__dot--warn{background:var(--warn);}
.daa-tl__dot--danger{background:var(--danger);}
.daa-tl__line{flex:1 1 auto;width:2px;background:var(--border);margin-top:.1rem;}
.daa-tl__li:last-child .daa-tl__line{display:none;}
.daa-tl__body{display:flex;flex-direction:column;gap:.15rem;min-width:0;padding-bottom:.2rem;}
.daa-tl__top{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;}
.daa-tl__when{font-size:.68rem;color:var(--muted);font-variant-numeric:tabular-nums;}
.daa-tl__title{font-size:.82rem;font-weight:700;color:var(--text);}
.daa-tl__d{font-size:.72rem;color:var(--muted);}

/* Reason chips */
.daa-reasons{display:flex;flex-direction:column;gap:.4rem;margin:0;padding:0;list-style:none;}
.daa-reasons__li{display:flex;align-items:center;gap:.6rem;font-size:.8rem;}
.daa-reasons__txt{flex:1 1 auto;min-width:0;color:var(--text);}
.daa-reasons__n{flex:0 0 auto;font-size:.7rem;font-weight:700;color:var(--muted);
  background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:.1rem .5rem;}

/* Trend window summary cards */
.daa-trendcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));gap:.7rem;}
.daa-trendcard{border:1px solid var(--border);border-radius:13px;padding:.7rem .8rem;background:var(--surface-2);
  display:flex;flex-direction:column;gap:.2rem;}
.daa-trendcard__lbl{font-size:.62rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}
.daa-trendcard__num{font-size:1.25rem;font-weight:800;color:var(--text);}
.daa-trendcard__sub{font-size:.62rem;color:var(--muted);}

@media (max-width:560px){
  .daa-funnel__row{grid-template-columns:7rem 1fr;}
  .daa-funnel__meta{grid-column:1 / -1;text-align:left;}
}
`;

/** Inject the dashboard stylesheet once (browser-only; safe no-op in node). */
export function injectDispatchAnalyticsStyles() {
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
/** Numeric confidence display (replaces the ★ rating glyphs). Mean → 1 decimal,
 *  shown on the system's 5-band scale (e.g. "3.2 / 5"). */
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
/** Acceptance/quality color class from a 0–100 rate — the unified color scale
 *  (higher = better → greener). Single source: unified-scoring scoreColor. */
function rateClass(rate) {
  return scoreColor(rate);
}

/* ── section renderers ────────────────────────────────────────────────────────
   Every section uses the Executive UI Kit: ExecutiveSectionShell (the Driver
   Analytics section card), ExecutiveKPICard/Grid, ExecutiveTable, ExecutiveStatusPill,
   ExecutiveSparkline, ExecutiveEmptyState. Section titles are plain executive text
   (no glyphs beside them — matches Analytics Driver); anIcon is reserved for KPI
   cards and toolbar controls. The inner micro-viz (distribution/funnel/rank/
   timeline/reason chips) reuse the shared `.daa-*` classes (no kit primitive;
   token-driven; RAA-shared). */

const TREND_WINDOWS = ['7d', '30d', '90d', 'ytd'];

function renderHeader(model, opts) {
  const win = TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d';
  // Executive segmented control — preserves the data-daa-window / data-active
  // contract the host's delegated handler binds (no workflow change).
  const toggle = `<div class="seg" role="tablist" aria-label="Rentang tren">${model.trends.windows.map((w) =>
    `<button type="button" class="${w.key === win ? 'on' : ''}" data-daa-window="${esc(w.key)}" data-active="${w.key === win}">${esc(w.label)}</button>`,
  ).join('')}</div>`;
  // Export buttons keep the data-daa-export contract + the byte-identical pipeline.
  const exportBtns =
    `<button type="button" class="exec-reset" data-daa-export="pdf">${anIcon('download', { size: 14 })}PDF</button>` +
    `<button type="button" class="exec-reset" data-daa-export="excel">${anIcon('download', { size: 14 })}Excel</button>`;
  // Hero = title + one verdict subtitle + a band of three headline figures. No
  // icon, no decorative graphic; the numbers carry the emotional weight. Every
  // value is read straight from the model — the hero states the verdict, it does
  // not compute a new one.
  const k = model.kpi;
  const total = model.totals.decisions;
  const acceptedCount = (model.recommendationQuality.funnel.find((f) => f.key === 'ACCEPTED') || {}).count || 0;
  const changedCount = Math.max(0, total - acceptedCount);
  const accept = Number(k.recommendationAcceptance) || 0;
  const subtitle = accept >= 95
    ? 'AI membantu hampir seluruh keputusan operasional.'
    : accept >= 80
      ? 'AI membantu sebagian besar keputusan operasional.'
      : 'AI membantu pengambilan keputusan operasional.';
  const stat = (v, l) => `<div class="daa-hero-stat"><span class="daa-hero-stat__v">${esc(v)}</span><span class="daa-hero-stat__l">${esc(l)}</span></div>`;
  const statBand = `<div class="daa-hero-stats">
      ${stat(total, 'rekomendasi')}
      ${stat(pct(accept), 'diterima')}
      ${stat(changedCount, 'diubah admin')}
    </div>`;
  return ExecutiveHeader({
    title: 'Dispatch Intelligence',
    subtitle,
    meta: `Diperbarui ${fmtTime(model.generatedAt)} · ${total} keputusan`,
  }) + statBand + ExecutiveToolbar({ left: toggle, right: exportBtns });
}

/**
 * Executive Status — ONE verdict card directly under the hero (replaces the
 * four-row checklist). It states a single operational status, a matching level
 * word, and one supporting sentence, all read from values already in the model
 * (no prediction, no new analytics). Tone drives the accent only.
 */
function renderStatus(model) {
  const k = model.kpi;
  const accept = Number(k.recommendationAcceptance) || 0;
  const override = Number(k.overrideRate) || 0;

  let tone, level, msg;
  if (override <= 5 && accept >= 95) {
    tone = 'good'; level = 'Sangat Baik';
    msg = 'Hampir semua rekomendasi digunakan tanpa perubahan.';
  } else if (override <= 20 && accept >= 80) {
    tone = 'good'; level = 'Baik';
    msg = `Sebagian besar rekomendasi digunakan admin — ${pct(accept)} tanpa perubahan.`;
  } else if (override <= 40) {
    tone = 'info'; level = 'Cukup Stabil';
    msg = `Sebagian keputusan masih disesuaikan admin — ${pct(override)} diubah.`;
  } else {
    tone = 'warn'; level = 'Perlu Perhatian';
    msg = `${pct(override)} rekomendasi masih sering diubah admin.`;
  }
  return `<div class="daa-status daa-status--${tone}">
      <div class="daa-status__eye">Status Operasional</div>
      <div class="daa-status__level">${esc(level)}</div>
      <div class="daa-status__msg">${esc(msg)}</div>
    </div>`;
}

function renderKpis(model) {
  const k = model.kpi;
  // Four indicators that read as a left-to-right story: how much AI is used, how
  // often admin steps in, how good the decisions are, how sure the AI is. Every
  // subtitle says why the number matters. (dispatchAccuracy and
  // recommendationAcceptance are the SAME engine value, so only one is shown.)
  const cards = [
    ExecutiveKPICard({ title: 'Rekomendasi Digunakan', value: pct(k.recommendationAcceptance), subtitle: 'AI dipakai langsung tanpa koreksi', icon: anIcon('check', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Perubahan Admin', value: pct(k.overrideRate), subtitle: 'Seberapa sering admin turun tangan', icon: anIcon('repeat', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Kualitas Dispatch', value: esc(k.avgDispatchScore), subtitle: 'Mutu keputusan penugasan (0–100)', icon: anIcon('target', { size: 15 }) }),
    ExecutiveKPICard({ title: 'Keyakinan AI', value: conf(k.avgConfidence.stars), subtitle: `Seberapa yakin AI · ${esc(k.avgConfidence.label).toLowerCase()}`, icon: anIcon('bulb', { size: 15 }) }),
  ];
  return ExecutiveSectionShell({
    title: 'Ringkasan Eksekutif',
    content: ExecutiveKPIGrid(cards),
  });
}

function rankList(items, valueFn) {
  if (!items.length) return `<div class="v2-analytics-section-desc" style="color:var(--text-dim)">—</div>`;
  return `<ul class="daa-rank__list">${items.map((it, i) =>
    `<li class="daa-rank__item"><span class="daa-rank__n">${i + 1}</span>
      <span class="daa-rank__nm">${esc(it.name)}</span>
      <span class="daa-rank__v">${valueFn(it)}</span></li>`).join('')}</ul>`;
}

/** Capacity / acceptance status pill via the kit (replaces .daa-pill). */
function tonePill(text, tone, title) {
  return ExecutiveStatusPill(text, tone, title || '');
}

/**
 * Executive spotlight card — the premium "who to trust" summary that leads each
 * entity section. Reads an already-ranked entity from the model (no new
 * calculation): big name, one large primary figure, one line of supporting
 * metadata. The section answers itself before the detail table is ever read.
 */
function spotlight({ eyebrow, name, primary, meta }) {
  return `<div class="daa-spot">
      <div class="daa-spot__eye">${esc(eyebrow)}</div>
      <div class="daa-spot__name">${esc(name)}</div>
      <div class="daa-spot__score"><span class="daa-spot__score-v">${esc(primary.value)}</span><span class="daa-spot__score-l">${esc(primary.label)}</span></div>
      <div class="daa-spot__meta">${meta}</div>
    </div>`;
}

function driverTable(rows) {
  if (!rows.length) return ExecutiveEmptyState({ message: 'Belum ada rekomendasi driver.' });
  const columns = [
    { key: 'driver', label: 'Driver', primary: true },
    { key: 'recommended', label: 'Direkomendasikan', align: 'right' },
    { key: 'acceptance', label: 'Diterima', align: 'right', render: (v) => tonePill(pct(v), rateClass(v)) },
    { key: 'override', label: 'Diubah', align: 'right', render: (v) => pct(v) },
    { key: 'score', label: 'Skor', align: 'right' },
    { key: 'capacity', label: 'Kapasitas', align: 'right', render: (v) => tonePill(String(v.score), v.tone, 'Skor kapasitas (100 = paling lengang/tersedia)') },
    { key: 'conflict', label: 'Hindar Konflik', align: 'right', render: (v) => pct(v) },
    { key: 'last', label: 'Terakhir' },
  ];
  const data = rows.map((r) => {
    const cap = capacityScore(r.capacityUtilization);
    return {
      driver: r.driverName, recommended: r.recommended, acceptance: r.acceptance,
      override: r.overrideRate, score: r.avgScore,
      capacity: { score: cap, tone: scoreColor(cap) }, conflict: r.conflictAvoidance,
      last: fmtTime(r.lastRecommendation),
    };
  });
  return ExecutiveTable({ columns, rows: data, ariaLabel: 'Intelijen Driver' });
}

function renderDriverIntel(model) {
  const di = model.driverIntelligence;
  const top = di.rankings.mostAccepted[0];
  const spot = top ? spotlight({
    eyebrow: 'Driver Paling Dipercaya',
    name: top.name,
    primary: { value: top.avgScore, label: 'Kualitas' },
    meta: `<b>${pct(top.acceptance)}</b> diterima · <b>${esc(top.recommended)}</b> rekomendasi`,
  }) : '';
  const content = `${spot}
      ${di.rows.length ? '<div class="daa-detail-cap">Rincian per driver</div>' : ''}
      ${driverTable(di.rows)}
      <div class="daa-cols" style="margin-top:14px">
        <div class="daa-rank"><div class="daa-rank__h">Paling Direkomendasikan</div>
          ${rankList(di.rankings.topRecommended, (it) => `<b>${esc(it.recommended)}</b> rek.`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Diterima</div>
          ${rankList(di.rankings.mostAccepted, (it) => `<b>${esc(it.accepted)}</b> diterima`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Sering Diubah</div>
          ${rankList(di.rankings.mostOverridden, (it) => `<b>${esc(it.overridden)}</b> diubah`)}</div>
      </div>`;
  return ExecutiveSectionShell({
    title: 'Ringkasan Driver',
    description: 'Driver mana yang paling sering direkomendasikan dan dipercaya',
    content,
  });
}

function vehicleTable(rows) {
  if (!rows.length) return ExecutiveEmptyState({ message: 'Belum ada rekomendasi kendaraan.' });
  const columns = [
    { key: 'vehicle', label: 'Kendaraan', primary: true },
    { key: 'recommended', label: 'Direkomendasikan', align: 'right' },
    { key: 'acceptance', label: 'Diterima', align: 'right', render: (v) => tonePill(pct(v), rateClass(v)) },
    { key: 'override', label: 'Diubah', align: 'right', render: (v) => pct(v) },
    { key: 'score', label: 'Skor', align: 'right' },
    { key: 'utilization', label: 'Utilisasi', align: 'right', render: (v) => pct(v) },
    { key: 'idle', label: 'Kapasitas', align: 'right', render: (v) => tonePill(String(v.score), v.tone, 'Skor kapasitas (100 = paling lengang/tersedia)') },
    { key: 'conflict', label: 'Hindar Konflik', align: 'right', render: (v) => pct(v) },
  ];
  const data = rows.map((r) => {
    const cap = capacityScore(r.utilization);
    return {
      vehicle: r.vehicleName, recommended: r.recommended, acceptance: r.acceptance,
      override: r.overrideRate, score: r.avgScore, utilization: r.utilization,
      idle: { score: cap, tone: scoreColor(cap) }, conflict: r.conflictAvoidance,
    };
  });
  return ExecutiveTable({ columns, rows: data, ariaLabel: 'Intelijen Kendaraan' });
}

function renderVehicleIntel(model) {
  const vi = model.vehicleIntelligence;
  const top = vi.rankings.mostAccepted[0];
  const spot = top ? spotlight({
    eyebrow: 'Kendaraan Paling Diandalkan',
    name: top.name,
    primary: { value: top.avgScore, label: 'Kualitas' },
    meta: `<b>${pct(top.acceptance)}</b> diterima · <b>${esc(top.recommended)}</b> rekomendasi`,
  }) : '';
  const content = `${spot}
      ${vi.rows.length ? '<div class="daa-detail-cap">Rincian per kendaraan</div>' : ''}
      ${vehicleTable(vi.rows)}
      <div class="daa-cols" style="margin-top:14px">
        <div class="daa-rank"><div class="daa-rank__h">Paling Direkomendasikan</div>
          ${rankList(vi.rankings.topRecommended, (it) => `<b>${esc(it.recommended)}</b> rek.`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Diterima</div>
          ${rankList(vi.rankings.mostAccepted, (it) => `<b>${esc(it.accepted)}</b> diterima`)}</div>
        <div class="daa-rank"><div class="daa-rank__h">Paling Sering Diubah</div>
          ${rankList(vi.rankings.mostOverridden, (it) => `<b>${esc(it.overridden)}</b> diubah`)}</div>
      </div>`;
  return ExecutiveSectionShell({
    title: 'Ringkasan Kendaraan',
    description: 'Kendaraan mana yang paling efektif dan tersedia',
    content,
  });
}

function renderBidang(model) {
  const rows = model.bidangIntelligence;
  if (!rows.length) {
    return ExecutiveSectionShell({
      title: 'Ringkasan Bidang',
      content: ExecutiveEmptyState({ message: 'Belum ada request yang diproses per bidang.' }),
    });
  }
  const columns = [
    { key: 'bidang', label: 'Bidang', primary: true },
    { key: 'requests', label: 'Request', align: 'right' },
    { key: 'acceptance', label: 'Diterima', align: 'right', render: (v) => tonePill(pct(v), rateClass(v)) },
    { key: 'override', label: 'Diubah', align: 'right', render: (v) => pct(v) },
    { key: 'score', label: 'Skor', align: 'right' },
    { key: 'confidence', label: 'Keyakinan', align: 'right' },
    { key: 'topDestination', label: 'Tujuan Teratas' },
    { key: 'conflict', label: 'Konflik', align: 'right', render: (v) => pct(v) },
  ];
  const data = rows.map((r) => ({
    bidang: r.bidang, requests: r.requests, acceptance: r.acceptanceRate,
    override: r.overrideRate, score: r.avgScore, confidence: conf(r.avgConfidenceStars),
    topDestination: r.topDestination || '—', conflict: r.conflictRate,
  }));
  // rows are pre-sorted by requests desc, so [0] is the busiest bidang.
  const top = rows[0];
  const spot = spotlight({
    eyebrow: 'Bidang Paling Aktif',
    name: top.bidang,
    primary: { value: top.requests, label: 'Permintaan' },
    meta: `<b>${pct(top.acceptanceRate)}</b> diterima · kualitas <b>${esc(top.avgScore)}</b>`,
  });
  return ExecutiveSectionShell({
    title: 'Ringkasan Bidang',
    description: 'Bidang mana yang paling banyak dilayani dan tingkat penerimaannya',
    content: `${spot}
      <div class="daa-detail-cap">Rincian per bidang</div>
      ${ExecutiveTable({ columns, rows: data, ariaLabel: 'Ringkasan Bidang' })}`,
  });
}

/** One movement headline — direction + magnitude read from a window series
 *  (last minus first). `goodDir` decides which direction is green. Copy only;
 *  the delta is a subtraction of two values already in the model. */
function movementCard(label, series, unit, goodDir, phrases) {
  const arr = (Array.isArray(series) ? series : []).map((n) => Number(n) || 0);
  const spark = arr.length >= 2 ? ExecutiveSparkline(arr, { tone: 'info' })
    : '<div class="v2-analytics-section-desc" style="color:var(--text-dim)">Belum cukup data</div>';
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

/**
 * Performa Dispatch — the single "is dispatch healthy and improving?" section.
 * MERGES the old Trend + Recommendation Quality blocks: first the movement
 * (direction + magnitude over the selected window), then the flow from AI
 * recommendation to the admin's final decision. No new analytics.
 */
function renderPerforma(model, opts) {
  const win = model.trends.windows.find((w) => w.key === (TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d')) || model.trends.windows[1];
  const s = win && Array.isArray(win.series) ? win.series : [];
  const acceptSeries = s.map((d) => Number(d.acceptanceRate) || 0);
  const overrideSeries = s.map((d) => Number(d.overrideRate) || 0);
  const movement = `<div class="daa-cols">
      ${movementCard('Penerimaan AI', acceptSeries, '%', 'up', { up: 'AI makin dipercaya', down: 'AI makin jarang dipakai', flat: 'Penerimaan stabil' })}
      ${movementCard('Perubahan Admin', overrideSeries, '%', 'down', { up: 'Admin makin sering mengubah', down: 'Admin makin jarang mengubah', flat: 'Perubahan admin stabil' })}
    </div>`;

  const q = model.recommendationQuality;
  const cls = { ACCEPTED: 'ok', DRIVER_OVERRIDE: 'warn', VEHICLE_OVERRIDE: 'warn', FULL_OVERRIDE: 'danger' };
  const funnel = q.funnel.map((f) => `<div class="daa-funnel__row">
    <div class="daa-funnel__k">${esc(f.label)}</div>
    <div class="daa-bar"><div class="daa-bar__fill daa-bar__fill--${cls[f.key] || 'info'}" style="width:${esc(f.percentage)}%"></div></div>
    <div class="daa-funnel__meta"><b>${esc(f.count)}</b> · ${esc(f.percentage)}%</div></div>`).join('');

  return ExecutiveSectionShell({
    title: 'Performa Dispatch',
    description: win ? `${win.label} · ${win.total} keputusan` : '',
    content: `${movement}
      <div class="daa-detail-cap" style="margin-top:1rem">Dari rekomendasi ke keputusan akhir</div>
      <div class="daa-funnel">${funnel}</div>`,
  });
}

function reasonList(items, emptyText) {
  if (!items.length) return `<div class="v2-analytics-section-desc" style="color:var(--text-dim)">${esc(emptyText)}</div>`;
  return `<ul class="daa-reasons">${items.map((r) =>
    `<li class="daa-reasons__li"><span class="daa-reasons__txt">${esc(r.text)}</span><span class="daa-reasons__n">${esc(r.count)}×</span></li>`).join('')}</ul>`;
}

/**
 * Riwayat Keputusan — the single "what happened, and why?" section. MERGES the
 * old Reason + Timeline blocks: why AI recommended / why admin changed, then the
 * most recent decision events. One narrative, top to bottom.
 */
function renderDecisionHistory(model) {
  const ex = model.explainability;
  const reasons = `<div class="daa-cols">
        <div class="daa-rank"><div class="daa-rank__h">Mengapa AI Merekomendasikan</div>
          ${reasonList(ex.topReasons, 'Belum ada ringkasan alasan.')}</div>
        <div class="daa-rank"><div class="daa-rank__h">Mengapa Admin Mengubah</div>
          ${reasonList(ex.adminOverrideReasons, 'Belum ada perubahan dengan alasan.')}</div>
      </div>`;

  const ev = model.timeline;
  let events;
  if (!ev.length) {
    events = ExecutiveEmptyState({ message: 'Belum ada riwayat keputusan.' });
  } else {
    const dotCls = { ACCEPTED: 'ok', DRIVER_OVERRIDE: 'warn', VEHICLE_OVERRIDE: 'warn', FULL_OVERRIDE: 'danger' };
    const outLabel = { ACCEPTED: 'Diterima', DRIVER_OVERRIDE: 'Driver diganti', VEHICLE_OVERRIDE: 'Kendaraan diganti', FULL_OVERRIDE: 'Keduanya diganti' };
    const items = ev.map((e) => `<li class="daa-tl__li">
      <div class="daa-tl__rail"><span class="daa-tl__dot daa-tl__dot--${dotCls[e.outcome] || 'info'}"></span><span class="daa-tl__line"></span></div>
      <div class="daa-tl__body">
        <div class="daa-tl__top"><span class="daa-tl__when">${esc(fmtTime(e.decidedAt))}</span>
          <span class="daa-tl__title">${esc(outLabel[e.outcome] || 'Keputusan')}</span></div>
        <div class="daa-tl__d">${esc(e.driverName)} · ${esc(e.vehicleName)} · skor ${esc(e.score)}${e.bidang ? ' · ' + esc(e.bidang) : ''}</div>
      </div></li>`).join('');
    events = `<ul class="daa-tl">${items}</ul>`;
  }

  return ExecutiveSectionShell({
    title: 'Riwayat Keputusan',
    description: ev.length ? `${ev.length} keputusan terbaru` : '',
    content: `${reasons}
      <div class="daa-detail-cap" style="margin-top:1rem">Keputusan terbaru</div>
      ${events}`,
  });
}

function renderGlobalEmpty() {
  return ExecutiveSectionShell({
    title: 'Belum ada data',
    content: ExecutiveEmptyState({
      message: 'Dashboard ini terisi setelah ada persetujuan request.',
      hint: 'Setujui beberapa request melalui Dispatch Intelligence untuk melihat akurasi, keyakinan AI, dan tren keputusan.',
    }),
  });
}

/* ── public render ────────────────────────────────────────────────────── */

/**
 * Render the full Dispatch Intelligence Analytics dashboard as an HTML string.
 * @param {Object} model  output of computeDispatchAnalyticsModel
 * @param {Object} [opts]  { trendWindow:'7d'|'30d'|'90d'|'ytd' }
 * @returns {string}
 */
export function renderDispatchAnalyticsDashboard(model, opts = {}) {
  // Root keeps `.daa` for layout + the shared inner-viz scope, and adds
  // `exec-ui v2-analytics-claude` so the kit/analytics classes (and the dark-mode
  // variant) resolve even though the dashboard renders outside an analytics scope.
  const ROOT = 'daa exec-ui v2-analytics-claude';
  if (!model) return `<div class="${ROOT}">${renderGlobalEmpty()}</div>`;
  const o = { trendWindow: TREND_WINDOWS.includes(opts.trendWindow) ? opts.trendWindow : '30d' };
  const hasData = model.totals && model.totals.decisions > 0;
  // Executive experience hierarchy (v1.18.5.3) — the page answers itself in <5s,
  // then offers detail. Each block carries a different visual weight:
  //   Hero (stat band) → Status (one verdict) → KPI (four-number story) →
  //   Performa (movement + quality, merged) → Driver → Vehicle → Bidang
  //   (spotlight-led) → Riwayat (why + history, merged).
  // First screen is only Hero → Status → KPI; the standalone confidence
  // distribution was retired (its story now lives in the KPI + Status).
  return `<div class="${ROOT}">
    ${renderHeader(model, o)}
    ${hasData ? renderStatus(model) : renderGlobalEmpty()}
    ${renderKpis(model)}
    ${renderPerforma(model, o)}
    ${renderDriverIntel(model)}
    ${renderVehicleIntel(model)}
    ${renderBidang(model)}
    ${renderDecisionHistory(model)}
  </div>`;
}
