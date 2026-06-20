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
import { rp } from '../../petty-cash/petty-cash-config.js';
import { bidangRoster } from '../../petty-cash/petty-cash-service.js';
import { computePettyCashAnalytics } from '../petty-cash-analytics.js';
import { computeExecutiveAnalytics } from '../executive-analytics.js';
import {
  renderHeroSection, renderEyebrow, renderAnalyticsKPICard, renderKPIGrid,
  renderInsightRow, renderInsightDividerList, renderExportCenter, renderAnalyticsEmptyState, anIcon,
} from '../analytics-shell.js';

const RANGES = ['7d', '30d', '90d'];
const RANGE_LABELS = { '7d': '7 Hari', '30d': '30 Hari', '90d': '90 Hari' };

const state = { host: null, range: '30d', listening: false, visible: false, dirty: false };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildModels() {
  const pettyModel = computePettyCashAnalytics({
    expenses: getExpenses(), nors: getNors(), activeCycle: getActiveCycle(),
    settings: getSettings(), bidangRoster: bidangRoster(), range: state.range,
  });
  // Driver model is owned by app.js (it holds the assignment/request data).
  let driverModel = null;
  try {
    if (typeof window.__computeDriverAnalyticsModel === 'function') {
      driverModel = window.__computeDriverAnalyticsModel(state.range);
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
  const cur = (v) => `<span style="font-size:0.6em;letter-spacing:-0.01em;white-space:nowrap;">${rp(v)}</span>`;
  return renderHeroSection({
    headline: `Kesehatan operasional <span class="hl">${esc(s.label)}</span>`,
    sub: esc(exec.narrative),
    score: s.value, grade: s.label, ringValue: s.value / 100, ringColor, tone: s.tone,
    stats: [
      { lbl: 'Total Trip', big: String(dkv.totalTrip) },
      { lbl: 'Driver Utilization', big: `${dkv.driverUtilization}<span class="u">%</span>` },
      { lbl: 'Dana Terpakai', big: cur(pk.consumedSpend) },
    ],
  });
}

function kpiBlock(exec) {
  const d = exec.driverKpis, p = exec.pettyKpis;
  const driverCards = renderKPIGrid([
    renderAnalyticsKPICard({ title: 'Total Trip', icon: anIcon('car', { size: 15 }), value: String(d.totalTrip), subtitle: 'Penugasan operasional' }),
    renderAnalyticsKPICard({ title: 'Driver Utilization', icon: anIcon('user', { size: 15 }), value: `${d.driverUtilization}%`, subtitle: `${d.activeDrivers} driver aktif` }),
    renderAnalyticsKPICard({ title: 'Kendaraan Aktif', icon: anIcon('car', { size: 15 }), value: String(d.activeVehicles), subtitle: `${d.vehiclesWithTrips} terpakai` }),
  ]);
  const pettyCards = renderKPIGrid([
    renderAnalyticsKPICard({ title: 'Saldo Aktif', icon: anIcon('chart', { size: 15 }), value: rp(p.activeBalance), status: p.activeBalance < 0 ? 'warn' : 'ok' }),
    renderAnalyticsKPICard({ title: 'NOR Official', icon: anIcon('file', { size: 15 }), value: `${p.norOfficial} NOR` }),
    renderAnalyticsKPICard({ title: 'Realisasi', icon: anIcon('pulse', { size: 15 }), value: `${p.realizationPct}%`, subtitle: 'Siklus berjalan' }),
  ]);
  return `
    ${renderEyebrow({ tag: 'Driver Operations', title: 'Kinerja Operasional', sub: 'Aktivitas penugasan & armada' })}
    ${driverCards}
    <div style="height:22px;"></div>
    ${renderEyebrow({ tag: 'Petty Cash', title: 'Kesehatan Dana', sub: 'Saldo, NOR, dan realisasi' })}
    ${pettyCards}
    <div style="height:26px;"></div>`;
}

function insightBlock(exec) {
  if (!exec.insights.length) return '';
  const toneFor = (i) => i.type === 'warning' ? (i.priority === 1 ? 'crit' : 'warn') : i.type === 'success' ? 'good' : 'info';
  const rows = exec.insights.map(i => renderInsightRow({ tone: toneFor(i), title: i.title, desc: i.description, kind: 'Wawasan' }));
  return `
    ${renderEyebrow({ tag: 'Wawasan', title: 'Insight Eksekutif', sub: 'Temuan lintas-domain periode ini' })}
    ${renderInsightDividerList(rows)}
    <div style="height:26px;"></div>`;
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

function rangeSeg() {
  return `<div class="seg" role="tablist" style="display:inline-flex;">${RANGES.map(r => `
    <button type="button" class="${r === state.range ? 'on' : ''}" data-exec-range="${r}" aria-selected="${r === state.range}">${esc(RANGE_LABELS[r])}</button>`).join('')}</div>`;
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
  window._executiveAnalyticsMeta = { range: state.range, appVersion: (window.__APP_VERSION__ || '') };

  state.host.innerHTML = `
    <div class="v2-analytics-claude v2-analytics-exec">
      <div class="v2-admin-workspace-layout" style="max-width:1080px;margin:0 auto;padding:6px 4px 40px;">
        <div class="v2-admin-page-header" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <div>
            <h1 class="v2-admin-page-title">Analytics Executive</h1>
            <p class="v2-admin-page-subtitle">Ringkasan kesehatan operasional lintas Driver & Petty Cash.</p>
          </div>
          ${rangeSeg()}
        </div>
        ${heroBlock(exec)}
        <div style="height:26px;"></div>
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
}

function onHostClick(e) {
  const rangeBtn = e.target.closest('[data-exec-range]');
  if (rangeBtn) {
    const r = rangeBtn.dataset.execRange;
    if (RANGES.includes(r) && r !== state.range) { state.range = r; render(); }
    return;
  }
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn && actionBtn.dataset.action === 'exec-export-pdf' && typeof window.exportExecutiveAnalyticsPdf === 'function') {
    Promise.resolve(window.exportExecutiveAnalyticsPdf()).catch(err => console.error('[AnalyticsExecutive] PDF export failed', err));
  }
}

export async function mountAnalyticsExecutive(host) {
  if (!host) return;
  state.host = host;
  state.visible = true;
  if (!state.listening) {
    host.addEventListener('click', onHostClick);
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

export function closeAnalyticsExecutive() { state.visible = false; }
