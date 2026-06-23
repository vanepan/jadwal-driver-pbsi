/* ============================================================
   ANALYTICS-EXECUTIVE-VIEW.JS — Analytics Executive screen
   (v1.15.0 — Analytics Expansion Foundation; renames "Analytics Gabungan")

   Lazily-mounted workspace combining Driver + Petty Cash analytics into an
   executive keynote: Operational Health Score hero, executive KPIs, cross-
   domain insights, and a PDF export. Calculations live in engines /
   executive-analytics.js; this module only renders.
   ============================================================ */

'use strict';

import {
  initPettyCashStore, registerChangeListener as registerPcListener, isReady as pcReady,
  getExpenses, getNors, getActiveCycle, getSettings,
} from '../../petty-cash/petty-cash-store.js';
import { rp, rpCompact } from '../../petty-cash/petty-cash-config.js';
import { bidangRoster } from '../../petty-cash/petty-cash-service.js';
import { getDrivers } from '../../drivers-store.js';
import { getActiveVehicles } from '../../vehicles-store.js';
import { computePettyCashAnalytics } from '../petty-cash-analytics.js';
import { computeExecutiveAnalytics } from '../executive-analytics.js';
import { healthLevel } from '../engines/executive-score-engine.js';
import {
  renderHeroSection, renderEyebrow, renderAnalyticsKPICard,
  renderInsightRow, renderInsightDividerList, renderScoreBreakdown, renderExportCenter,
  renderAnalyticsEmptyState, renderResponsiveCurrency, anIcon,
} from '../analytics-shell.js';
import { bindResponsiveCurrency, unbindResponsiveCurrency } from '../responsive-currency.js';

/** Container-aware currency cell (sized by ResizeObserver to actual card width). */
const curResp = (v, cls = '') => renderResponsiveCurrency(rp(v), rpCompact(v), cls);

/* ── Phase B: Executive filter architecture (v1.15.3) ─────────────────────────
   executiveFilterState is the SINGLE source of truth for Executive Analytics
   filters, INDEPENDENT of Driver Analytics' own filter state (app.js). Changing
   it recomputes the executive aggregate (Driver + Petty sub-models) on the fly. */
const EXEC_PERIODS = ['today', '7d', '30d', '90d', 'ytd'];
const EXEC_PERIOD_LABELS = {
  today: 'Hari Ini', '7d': '7 Hari', '30d': '30 Hari', '90d': '90 Hari', ytd: 'Tahun Berjalan',
};
const executiveFilterState = { period: '30d', driver: '', vehicle: '', bidang: '' };

/**
 * SINGLE source for period → engine windows. The Driver and Petty engines have
 * different range vocabularies, so this is the one place that reconciles them.
 *   today → driver 'today'  · petty 'today'      (v1.15.5.1: single-day window
 *                                                 on BOTH engines — no 7d fallback)
 *   ytd   → driver 'ytd'    · petty 'annualized'(both Jan 1 → now = true YTD)
 * v1.15.4: "Tahun Berjalan" now maps to the driver engine's NEW 'ytd' window
 * (Jan 1 → now) instead of 'all' (all-time). Previously the two halves of the
 * Executive aggregate covered DIFFERENT windows for YTD — petty was year-to-date
 * while driver was all-time — so KPIs/insights/score silently mixed timeframes.
 * Custom Range is intentionally NOT here yet — it needs a unified explicit-window
 * contract in BOTH engines (see Phase C); shipping an approximation would emit
 * wrong numbers, which this architecture explicitly avoids.
 * @returns {{driverRange:string, pettyRange:string}}
 */
function resolveExecRanges(period) {
  switch (period) {
    case 'today': return { driverRange: 'today', pettyRange: 'today' };
    case '7d':    return { driverRange: '7d',    pettyRange: '7d' };
    case '30d':   return { driverRange: '30d',   pettyRange: '30d' };
    case '90d':   return { driverRange: '90d',   pettyRange: '90d' };
    case 'ytd':   return { driverRange: 'ytd',   pettyRange: 'annualized' };
    default:      return { driverRange: '30d',   pettyRange: '30d' };
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const state = { host: null, listening: false, visible: false, dirty: false };

function buildModels() {
  const { driverRange, pettyRange } = resolveExecRanges(executiveFilterState.period);
  const pettyModel = computePettyCashAnalytics({
    expenses: getExpenses(), nors: getNors(), activeCycle: getActiveCycle(),
    settings: getSettings(), bidangRoster: bidangRoster(), range: pettyRange,
  });
  // Driver model is owned by app.js (it holds the assignment/request data). Scope
  // (driver/vehicle/bidang) refines the Driver sub-model — the Petty engine has
  // no driver/vehicle scope, so scope currently shapes the Driver portion only.
  let driverModel = null;
  try {
    if (typeof window.__computeDriverAnalyticsModel === 'function') {
      driverModel = window.__computeDriverAnalyticsModel(driverRange, {
        driver: executiveFilterState.driver,
        vehicle: executiveFilterState.vehicle,
        bidang: executiveFilterState.bidang,
      });
    } else if (window._lastAnalyticsFullModel) {
      driverModel = window._lastAnalyticsFullModel;
    }
  } catch (err) { console.warn('[AnalyticsExecutive] driver model unavailable', err); }
  return { pettyModel, driverModel, exec: computeExecutiveAnalytics({ driverModel, pettyModel }) };
}

function heroBlock(exec) {
  const s = exec.score;
  const ringColor = s.tone === 'crit' ? 'var(--c-crit,#A8292F)' : s.tone === 'amber' ? 'var(--c-amber,#946420)' : 'var(--c-green,#2F7D62)';
  const pk = exec.pettyKpis, dkv = exec.driverKpis;
  // Dana Terpakai is currency, so it is rendered in a size-scaled span to stay
  // on one line inside the keynote strip's fixed 1/3 column (the column cannot
  // fit a full "Rp …" value at the default .big size — that caused the earlier
  // overlap bug). Total Trip / Driver Utilization stay full-size numerics.
  // v1.15.3: container-aware currency. `.an-cur--hero` is a direct child of the
  // stat's `.big` block, so the ResizeObserver measures the real cell width and
  // picks full → "Rp 10 Jt" → "10 Jt" → "10Jt" as the column tightens.
  const cur = (v) => curResp(v, 'an-cur--hero');
  // v1.15.8: score may be null (no domain had data). Pass it through so the hero
  // renders "—" instead of a misleading 0, and leave the ring empty.
  const hasScore = s.value != null;
  return renderHeroSection({
    headline: `Kesehatan operasional <span class="hl">${esc(s.label)}</span>`,
    sub: esc(exec.narrative),
    score: hasScore ? s.value : null, grade: s.label, ringValue: hasScore ? s.value / 100 : 0, ringColor, tone: s.tone,
    // v1.15.7 (Phase D — card prioritization): Dana Terpakai is the most
    // executive-relevant figure (Sekjen/Waketum), so it leads the keynote strip,
    // followed by Total Trip then Driver Utilization. Reordered from the prior
    // Trip → Utilization → Dana sequence.
    stats: [
      { lbl: 'Dana Terpakai', big: cur(pk.consumedSpend) },
      { lbl: 'Total Trip', big: String(dkv.totalTrip) },
      { lbl: 'Driver Utilization', big: `${dkv.driverUtilization}<span class="u">%</span>` },
    ],
  });
}

/**
 * Petty Cash Health Score V2 explainability (v1.16.3). Renders the four weighted
 * components (Compliance / Budget / Cash / Stability) as score bars plus the
 * derived narrative, so the Executive understands WHY the petty score is what it
 * is. Sits directly under the hero. Hidden when there is no petty score and no
 * component data (keeps the screen clean rather than showing four em-dashes).
 */
function pettyBreakdownBlock(exec) {
  const ph = exec.pettyHealth;
  if (!ph) return '';
  const comps = ph.components || [];
  const anyData = ph.score != null || comps.some((c) => c.score != null);
  if (!anyData) return '';
  const rows = comps.map((c) => ({
    label: c.label,
    score: c.score,
    weightPct: c.weightPct,
    tone: c.score == null ? 'amber' : healthLevel(c.score).tone,
  }));
  return `
    ${renderEyebrow({ tag: 'Petty Cash', title: 'Rincian Skor Kesehatan', sub: esc(ph.narrative || '') })}
    ${renderScoreBreakdown(rows)}
    <div style="height:var(--space-section);"></div>`;
}

/**
 * Executive KPI strip (v1.16.4.5 — KPI Rationalization). One unified row of six
 * rationalized indicators — three Operasional, three Petty Cash — replacing the
 * prior two-grid (3+3 split) layout. Order/labels/values are LOCKED to match the
 * Executive PDF exactly (see executive-report-model.js). The dedicated
 * `.v2-exec-kpi-grid` class (platform.css) lays them out 6-up on desktop, 3+3 on
 * tablet, stacked on mobile — without touching any other analytics screen.
 *
 * Petty display rules (locked):
 *   • Dana Digunakan YTD            → compact rupiah ("Rp 84,2 Jt"), never full.
 *   • Jumlah Realisasi NOR          → "<n> NOR".
 *   • Persentase Pemakaian RAB      → "<n>%", or "—" when annualBudget ≤ 0 (null).
 */
function kpiBlock(exec) {
  const d = exec.driverKpis, p = exec.pettyKpis;
  // v1.15.6: when some trips used a requester vehicle, show the armada vs
  // "Tanpa Kendaraan" split as the Total Trip subtitle (no new KPI card). The
  // default subtitle is preserved when every trip used a PBSI vehicle.
  const tripSubtitle = (Number(d.tripsWithoutVehicle) > 0)
    ? `${Number(d.tripsWithVehicle) || 0} armada • ${Number(d.tripsWithoutVehicle)} tanpa kendaraan`
    : 'Penugasan operasional';
  const rabValue = p.rabUsagePct == null ? '—' : `${p.rabUsagePct}%`;
  const cards = [
    // Operasional
    renderAnalyticsKPICard({ title: 'Total Trip', icon: anIcon('car', { size: 15 }), value: String(d.totalTrip), subtitle: tripSubtitle }),
    renderAnalyticsKPICard({ title: 'Driver Utilization', icon: anIcon('user', { size: 15 }), value: `${d.driverUtilization}%`, subtitle: `${d.activeDrivers} driver aktif` }),
    renderAnalyticsKPICard({ title: 'Tingkat Penyelesaian', icon: anIcon('pulse', { size: 15 }), value: `${d.compRate}%`, subtitle: 'Penugasan selesai' }),
    // Petty Cash — compact rupiah for Dana Digunakan YTD (rpCompact = single
    // source of truth; never the full "Rp 84.234.500" form).
    renderAnalyticsKPICard({ title: 'Dana Digunakan YTD', icon: anIcon('chart', { size: 15 }), value: rpCompact(p.actualBurnYtd), subtitle: 'Realisasi resmi YTD' }),
    renderAnalyticsKPICard({ title: 'Jumlah Realisasi NOR', icon: anIcon('file', { size: 15 }), value: `${p.realizedCount} NOR`, subtitle: 'NOR terealisasi' }),
    renderAnalyticsKPICard({ title: 'Persentase Pemakaian RAB Petty Cash', icon: anIcon('pulse', { size: 15 }), value: rabValue, subtitle: 'Terhadap anggaran tahunan' }),
  ];
  return `
    ${renderEyebrow({ tag: 'Indikator Eksekutif', title: 'Indikator Kinerja Utama', sub: 'Operasional & Petty Cash' })}
    <div class="v2-analytics-kpi-grid v2-exec-kpi-grid">${cards.join('')}</div>
    <div style="height:var(--space-section);"></div>`;
}

function insightBlock(exec) {
  if (!exec.insights.length) return '';
  const toneFor = (i) => i.type === 'warning' ? (i.priority === 1 ? 'crit' : 'warn') : i.type === 'success' ? 'good' : 'info';
  const rows = exec.insights.map(i => renderInsightRow({ tone: toneFor(i), title: i.title, desc: i.description, kind: 'Wawasan' }));
  return `
    ${renderEyebrow({ tag: 'Wawasan', title: 'Insight Eksekutif', sub: 'Temuan lintas-domain periode ini' })}
    ${renderInsightDividerList(rows)}
    <div style="height:var(--space-section);"></div>`;
}

function exportBlock() {
  return `
    ${renderEyebrow({ tag: 'Ekspor', title: 'Unduh Laporan', sub: 'Ringkasan eksekutif untuk pelaporan' })}
    ${renderExportCenter({
      description: 'Ekspor ringkasan eksekutif gabungan ke PDF.',
      formats: [
        { id: 'pdf', label: 'Laporan PDF', sub: 'Ringkasan eksekutif (A4)', icon: 'file', action: 'exec-export-pdf', actionLabel: 'Unduh PDF', enabled: true },
      ],
    })}`;
}

function scopeOptions(values, selected) {
  return values.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

/** Executive filter bar: period segment + driver/vehicle/bidang scope selects. */
function filterBar() {
  const periodBtns = EXEC_PERIODS.map(p =>
    `<button type="button" class="${p === executiveFilterState.period ? 'on' : ''}" data-exec-period="${p}" aria-selected="${p === executiveFilterState.period}">${esc(EXEC_PERIOD_LABELS[p])}</button>`).join('');
  const driverNames  = [...new Set(getDrivers().map(d => d && d.name).filter(Boolean))].sort();
  const vehicleNames = [...new Set(getActiveVehicles().map(v => v && v.name).filter(Boolean))].sort();
  const bidangNames  = [...new Set((bidangRoster() || []).map(b => b && b.name).filter(Boolean))].sort();
  return `
    <div class="exec-filter-bar">
      <div class="seg exec-period-seg" role="tablist" aria-label="Periode">${periodBtns}</div>
      <div class="exec-scope-row">
        <select class="v2-admin-filter" data-exec-scope="driver" aria-label="Filter driver">
          <option value="">Semua Driver</option>${scopeOptions(driverNames, executiveFilterState.driver)}
        </select>
        <select class="v2-admin-filter" data-exec-scope="vehicle" aria-label="Filter kendaraan">
          <option value="">Semua Kendaraan</option>${scopeOptions(vehicleNames, executiveFilterState.vehicle)}
        </select>
        <select class="v2-admin-filter" data-exec-scope="bidang" aria-label="Filter bidang">
          <option value="">Semua Bidang</option>${scopeOptions(bidangNames, executiveFilterState.bidang)}
        </select>
      </div>
    </div>`;
}

function render() {
  if (!state.host || !state.visible) return;
  let models;
  try { models = buildModels(); }
  catch (err) {
    console.error('[AnalyticsExecutive] compute failed:', err);
    state.host.innerHTML = `<div class="v2-analytics-claude">${renderAnalyticsEmptyState({ message: 'Gagal memuat analitik eksekutif.' })}</div>`;
    return;
  }
  const exec = models.exec;
  window._lastExecutiveAnalyticsModel = exec;
  window._executiveAnalyticsMeta = {
    range: resolveExecRanges(executiveFilterState.period).pettyRange,
    period: executiveFilterState.period,
    periodLabel: EXEC_PERIOD_LABELS[executiveFilterState.period] || '',
    scope: { driver: executiveFilterState.driver, vehicle: executiveFilterState.vehicle, bidang: executiveFilterState.bidang },
    appVersion: (window.__APP_VERSION__ || ''),
  };

  state.host.innerHTML = `
    <div class="v2-analytics-claude v2-analytics-exec">
      <div class="v2-admin-workspace-layout v2-analytics-shell">
        <div class="v2-admin-page-header" style="margin-bottom:14px;">
          <h1 class="v2-admin-page-title">Analytics Executive</h1>
          <p class="v2-admin-page-subtitle">Ringkasan kesehatan operasional lintas Driver & Petty Cash.</p>
        </div>
        ${heroBlock(exec)}
        ${pettyBreakdownBlock(exec)}
        ${filterBar()}
        <div style="height:var(--space-section);"></div>
        ${kpiBlock(exec)}
        ${insightBlock(exec)}
        ${exportBlock()}
      </div>
    </div>`;

  // Animate the health ring (mirrors the Driver hero behavior).
  requestAnimationFrame(() => {
    state.host.querySelectorAll('.an-ring-val').forEach(el => {
      const len = el.getAttribute('data-ring-len');
      const circ = el.getAttribute('data-ring-circ');
      if (len && circ) el.style.transition = 'stroke-dasharray .9s ease', el.setAttribute('stroke-dasharray', `${len} ${circ}`);
    });
    state.host.querySelectorAll('[data-countup]').forEach(el => {
      const target = Number(el.getAttribute('data-countup')) || 0;
      el.textContent = String(target);
    });
  });

  // v1.15.3: (re)bind container-aware currency sizing for the freshly rendered
  // KPI cards + hero stat. Safe to call every render (idempotent per host).
  bindResponsiveCurrency(state.host);
}

function onHostClick(e) {
  // Phase B: period segment → recompute the executive aggregate.
  const periodBtn = e.target.closest('[data-exec-period]');
  if (periodBtn) {
    const p = periodBtn.dataset.execPeriod;
    if (EXEC_PERIODS.includes(p) && p !== executiveFilterState.period) {
      executiveFilterState.period = p;
      render();
    }
    return;
  }
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn && actionBtn.dataset.action === 'exec-export-pdf' && typeof window.exportExecutiveAnalytics === 'function') {
    Promise.resolve(window.exportExecutiveAnalytics()).catch(err => console.error('[AnalyticsExecutive] PDF export failed', err));
  }
}

/** Phase B: scope selects (driver/vehicle/bidang) → recompute on change. */
function onHostChange(e) {
  const sel = e.target.closest('[data-exec-scope]');
  if (!sel) return;
  const key = sel.dataset.execScope;
  if (key === 'driver' || key === 'vehicle' || key === 'bidang') {
    executiveFilterState[key] = sel.value;
    render();
  }
}

export async function mountAnalyticsExecutive(host) {
  if (!host) return;
  state.host = host;
  state.visible = true;
  if (!state.listening) {
    host.addEventListener('click', onHostClick);
    host.addEventListener('change', onHostChange);
    // Live data changes (convert echo): re-render when visible, else mark dirty.
    registerPcListener(() => { if (state.visible) render(); else state.dirty = true; });
    state.listening = true;
  }
  state.dirty = false;
  render();
  try { await initPettyCashStore(); } catch (_) {}
  render();
}

/** Recompute + repaint on becoming visible (called by setWorkspace on all show paths). */
export function refreshAnalyticsExecutive() {
  if (!state.host) return;
  state.visible = true;
  state.dirty = false;
  render();
}

export function closeAnalyticsExecutive() {
  state.visible = false;
  if (state.host) unbindResponsiveCurrency(state.host);
}
