/* ============================================================
   ANALYTICS-PETTY-CASH-VIEW.JS — Analytics Petty Cash screen
   (v1.15.0 — Analytics Expansion Foundation)

   A self-contained, lazily-mounted workspace that renders the Petty Cash
   analytics model with the Analytics design language (.v2-analytics-claude
   scope + analytics-shell primitives). It performs NO calculations — every
   number comes from computePettyCashAnalytics() (engines). UI only renders.

   Layout (spec P7): Hero Insight → Hero KPI → Ringkasan Siklus → Trend Chart
   → Breakdown → Ranking → Insight Cards → Export Actions.
   ============================================================ */

'use strict';

import {
  initPettyCashStore, registerChangeListener, isReady,
  getExpenses, getNors, getActiveCycle, getSettings,
} from '../../petty-cash/petty-cash-store.js';
import { rp } from '../../petty-cash/petty-cash-config.js';
import { bidangRoster } from '../../petty-cash/petty-cash-service.js';
import {
  computePettyCashAnalytics, PC_RANGES, PC_RANGE_LABELS,
} from '../petty-cash-analytics.js';
import {
  renderEyebrow, renderAnalyticsKPICard, renderKPIGrid, renderAnalyticsChart,
  renderInsightRow, renderInsightDividerList, renderExportCenter, renderHighlights,
  renderAnalyticsEmptyState, anIcon,
} from '../analytics-shell.js';

const PALETTE = ['#3B5BA9', '#2F7D62', '#946420', '#6B4E9E', '#1E7A8A', '#A8292F', '#7A6E2A', '#2A7A6E'];

const state = { host: null, range: '30d', listening: false, visible: false, dirty: false };
const charts = new Map();

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function destroyCharts() {
  charts.forEach(c => { try { c.destroy(); } catch (_) {} });
  charts.clear();
}

/** Build the current model from the live store + selected range. */
function buildModel() {
  return computePettyCashAnalytics({
    expenses: getExpenses(),
    nors: getNors(),
    activeCycle: getActiveCycle(),
    settings: getSettings(),
    bidangRoster: bidangRoster(),
    range: state.range,
  });
}

/* ── Section builders ──────────────────────────────────────────────────── */

function heroInsight(model) {
  const top = model.insights[0];
  const toneMap = { warning: 'crit', success: 'good', info: 'info' };
  const tone = top ? (toneMap[top.type] || 'info') : 'info';
  const headline = top ? esc(top.title) : 'Analitik Petty Cash';
  return `
    <section class="hero pc-an-hero an-tone-${tone === 'crit' ? 'crit' : tone === 'good' ? 'green' : 'amber'}" style="margin-bottom:var(--space-section);">
      <div class="hero-head">
        <span class="an-tag" style="display:block;margin-bottom:14px;">Ringkasan Eksekutif</span>
        <h1 class="hero-title">${headline}</h1>
        <p class="hero-sub">${esc(model.narrative)}</p>
      </div>
    </section>`;
}

function heroKpi(model) {
  const h = model.hero;
  const norCard = renderAnalyticsKPICard({
    title: 'NOR Official', icon: anIcon('file', { size: 15 }),
    value: `${h.norOfficial} NOR`, status: 'info',
    subtitle: `Diterbitkan pada periode ${esc(model.metadata.rangeLabel)}`,
  });
  const rt = h.realizationTrend;
  let comparison = '';
  if (rt && rt.available && rt.deltaDays !== 0) {
    comparison = rt.deltaDays < 0
      ? `Lebih cepat ${Math.abs(rt.deltaDays)} hari dibanding periode sebelumnya`
      : `Lebih lama ${Math.abs(rt.deltaDays)} hari dibanding periode sebelumnya`;
  } else if (h.avgRealizationDays == null) {
    comparison = 'Belum ada NOR yang direalisasikan';
  }
  const realCard = renderAnalyticsKPICard({
    title: 'Rata-rata Waktu Realisasi', icon: anIcon('pulse', { size: 15 }),
    value: h.avgRealizationDays == null ? '—' : `${h.avgRealizationDays} Hari`,
    status: rt && rt.tone === 'positive' ? 'ok' : rt && rt.tone === 'negative' ? 'warn' : '',
    subtitle: comparison,
  });
  return renderKPIGrid([norCard, realCard]);
}

function cycleSummary(model) {
  const c = model.cycle;
  const item = (label, value, accent) => `
    <div class="pc-an-cyc-item" style="flex:1 1 160px;padding:14px 16px;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;">
      <div class="an-label" style="margin-bottom:6px;">${esc(label)}</div>
      <div class="an-figure"${accent ? ` style="color:${accent};"` : ''}>${value}</div>
    </div>`;
  return `
    ${renderEyebrow({ tag: 'Siklus Aktif', title: `Ringkasan Siklus${c.number ? ` #${c.number}` : ''}`, sub: 'Status saldo siklus berjalan' })}
    <div class="pc-an-cyc" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:26px;">
      ${item('Saldo Awal Siklus', rp(c.opening))}
      ${item('Total Pengeluaran', rp(c.spent), 'var(--c-amber,#946420)')}
      ${item('Saldo Tersisa', rp(c.remaining), c.remaining < 0 ? 'var(--c-crit,#A8292F)' : 'var(--c-green,#2F7D62)')}
      ${item('Persentase Realisasi', `${c.realizationPct}%`)}
    </div>`;
}

function trendSection(model) {
  const segHtml = `<div class="seg" role="tablist" style="display:inline-flex;">${PC_RANGES.map(r => `
    <button type="button" class="${r === state.range ? 'on' : ''}" data-pc-range="${r}" aria-selected="${r === state.range}">${esc(PC_RANGE_LABELS[r])}</button>`).join('')}</div>`;

  let annualizedHtml = '';
  if (model.trend.isAnnualized) {
    const a = model.trend.annualized;
    annualizedHtml = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
        <div style="flex:1 1 200px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;">
          <div class="an-caption" style="margin-bottom:4px;">Aktual YTD (${a.elapsedDays} hari)</div>
          <div class="an-figure">${rp(a.actual)}</div>
        </div>
        <div style="flex:1 1 200px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;">
          <div class="an-caption" style="margin-bottom:4px;">Proyeksi Akhir Tahun</div>
          <div class="an-figure" style="color:var(--accent);">${rp(a.projected)}</div>
        </div>
      </div>`;
  }

  const chart = model.trend.series.length > 0
    ? renderAnalyticsChart({ title: 'Tren Pengeluaran', subtitle: `Periode ${esc(model.metadata.rangeLabel)}`, canvasId: 'pcTrendChart', height: 240 })
    : renderAnalyticsEmptyState({ message: 'Belum ada pengeluaran pada periode ini.' });

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:8px 0 14px;">
      ${renderEyebrow({ tag: 'Tren', title: 'Visualisasi Pengeluaran', sub: 'Pergerakan belanja dari waktu ke waktu' })}
      ${segHtml}
    </div>
    ${annualizedHtml}
    ${chart}
    <div style="height:var(--space-section);"></div>`;
}

function breakdownSection(model) {
  const cat = model.breakdown.category;
  const unit = model.breakdown.unit;
  const catChart = cat.rows.length > 0
    ? renderAnalyticsChart({ title: 'Kategori Pengeluaran', canvasId: 'pcCatChart', boxVariant: 'donut' })
    : renderAnalyticsEmptyState({ message: 'Belum ada data kategori.' });
  const unitChart = unit.rows.length > 0
    ? renderAnalyticsChart({ title: 'Unit Pengguna Dana', canvasId: 'pcUnitChart', boxVariant: 'donut' })
    : renderAnalyticsEmptyState({ message: 'Belum ada data unit.' });
  return `
    ${renderEyebrow({ tag: 'Rincian', title: 'Breakdown Pengeluaran', sub: 'Distribusi belanja per kategori dan unit' })}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:18px;margin-bottom:26px;">
      ${catChart}
      ${unitChart}
    </div>`;
}

function rankingSection(model) {
  const r = model.ranking;
  const tu = r.topUnit, tb = r.topBidang, tc = r.topCategory;
  const highlights = renderHighlights([
    tu ? { label: 'Top Unit', value: tu.label, unit: '', context: `${rp(tu.value)} · ${tu.pct}% dari total` } : null,
    tb ? { label: 'Top Bidang', value: tb.label, context: `${rp(tb.value)} · ${tb.pct}% teridentifikasi` }
       : { label: 'Top Bidang', value: '—', context: 'Belum ada bidang teridentifikasi' },
    tc ? { label: 'Top Kategori', value: tc.label, context: `${rp(tc.value)} · ${tc.pct}% dari total` } : null,
  ]);

  const txRows = r.topTransactions.length > 0
    ? r.topTransactions.map(t => `
      <tr>
        <td style="padding:9px 10px;border-bottom:1px solid var(--border,#e8e6e2);font-size:12.5px;color:var(--text-dim,#5b5b64);white-space:nowrap;">${esc(t.date)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid var(--border,#e8e6e2);font-size:12.5px;">${esc(t.unit)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid var(--border,#e8e6e2);font-size:12.5px;">${esc(t.category)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid var(--border,#e8e6e2);font-size:12.5px;font-weight:700;text-align:right;white-space:nowrap;">${rp(t.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--text-dim,#5b5b64);font-size:12.5px;">Belum ada transaksi.</td></tr>`;

  const bidangNote = r.bidangUnresolved > 0
    ? `<p class="an-caption" style="margin:6px 0 0;">${r.bidangUnresolved} transaksi belum tercocokkan ke bidang (unit tetap / tanpa kecocokan nama).</p>`
    : '';

  return `
    ${renderEyebrow({ tag: 'Intelijen', title: 'Spending Intelligence', sub: 'Pengguna dana terbesar & transaksi teratas' })}
    ${highlights}
    ${bidangNote}
    <div style="margin:18px 0 26px;overflow-x:auto;">
      <div class="an-label" style="margin-bottom:8px;">Transaksi Teratas</div>
      <table style="width:100%;border-collapse:collapse;min-width:420px;">
        <thead><tr>
          <th class="an-label" style="padding:8px 10px;text-align:left;border-bottom:1.5px solid var(--border);">Tanggal</th>
          <th class="an-label" style="padding:8px 10px;text-align:left;border-bottom:1.5px solid var(--border);">Unit</th>
          <th class="an-label" style="padding:8px 10px;text-align:left;border-bottom:1.5px solid var(--border);">Kategori</th>
          <th class="an-label" style="padding:8px 10px;text-align:right;border-bottom:1.5px solid var(--border);">Nilai</th>
        </tr></thead>
        <tbody>${txRows}</tbody>
      </table>
    </div>`;
}

function insightSection(model) {
  if (!model.insights.length) return '';
  const toneFor = (i) => i.type === 'warning'
    ? (i.priority === 1 ? 'crit' : 'warn')
    : i.type === 'success' ? 'good' : 'info';
  const rows = model.insights.map(i => renderInsightRow({
    tone: toneFor(i), title: i.title, desc: i.description, kind: 'Wawasan',
  }));
  return `
    ${renderEyebrow({ tag: 'Wawasan', title: 'Insight Engine', sub: 'Temuan otomatis dari data periode ini' })}
    ${renderInsightDividerList(rows)}
    <div style="height:var(--space-section);"></div>`;
}

function exportSection() {
  return `
    ${renderEyebrow({ tag: 'Ekspor', title: 'Unduh Laporan', sub: 'Bagikan ringkasan analitik petty cash' })}
    ${renderExportCenter({
      description: 'Ekspor analitik petty cash untuk pelaporan dan arsip.',
      formats: [
        { id: 'pdf', label: 'Laporan PDF', sub: 'Ringkasan analitik petty cash (A4)', icon: 'file', action: 'pc-export-pdf', actionLabel: 'Unduh PDF', enabled: true },
        { id: 'excel', label: 'Data Excel', sub: 'Rincian pengeluaran & NOR (xlsx)', icon: 'sheet', action: 'pc-export-excel', actionLabel: 'Unduh Excel', enabled: true },
      ],
    })}`;
}

/* ── Charts ─────────────────────────────────────────────────────────────── */

function makeChart(id, config) {
  const el = document.getElementById(id);
  if (!el || typeof window.Chart === 'undefined') return;
  try { charts.set(id, new window.Chart(el, config)); } catch (_) {}
}

function renderCharts(model) {
  if (typeof window.Chart === 'undefined') return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#9A9690' : '#5B5953';
  const gridColor = isDark ? '#31333C' : '#E8E6E2';
  const surfBg = isDark ? '#262830' : '#FBFAF8';

  // Trend (bar)
  const series = model.trend.series;
  if (series.length > 0) {
    makeChart('pcTrendChart', {
      type: 'bar',
      data: {
        labels: series.map(p => p.label),
        datasets: [{ label: 'Pengeluaran', data: series.map(p => p.value),
          backgroundColor: '#3B5BA9CC', borderColor: '#3B5BA9', borderWidth: 1, borderRadius: 3 }],
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + rp(c.parsed.y) } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor }, border: { color: gridColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => 'Rp ' + Number(v).toLocaleString('id-ID') }, border: { color: gridColor } },
        } },
    });
  }

  const donutOpts = (rows) => ({
    responsive: true, maintainAspectRatio: true, cutout: '62%',
    plugins: {
      legend: { position: 'bottom', labels: { color: textColor, padding: 12, boxWidth: 12 } },
      tooltip: { callbacks: { label: c => ` ${c.label}: ${rp(c.parsed)} (${rows[c.dataIndex] ? rows[c.dataIndex].pct : 0}%)` } },
    },
  });

  const cat = model.breakdown.category.rows;
  if (cat.length > 0) {
    makeChart('pcCatChart', {
      type: 'doughnut',
      data: { labels: cat.map(r => r.label), datasets: [{ data: cat.map(r => r.value),
        backgroundColor: cat.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: surfBg, borderWidth: 2, hoverOffset: 4 }] },
      options: donutOpts(cat),
    });
  }
  const unit = model.breakdown.unit.rows;
  if (unit.length > 0) {
    makeChart('pcUnitChart', {
      type: 'doughnut',
      data: { labels: unit.map(r => r.label), datasets: [{ data: unit.map(r => r.value),
        backgroundColor: unit.map((_, i) => PALETTE[(i + 2) % PALETTE.length]), borderColor: surfBg, borderWidth: 2, hoverOffset: 4 }] },
      options: donutOpts(unit),
    });
  }
}

/* ── Render + lifecycle ─────────────────────────────────────────────────── */

function render() {
  if (!state.host || !state.visible) return;
  destroyCharts();

  if (!isReady()) {
    state.host.innerHTML = `<div class="v2-analytics-claude">${renderAnalyticsEmptyState({ message: 'Memuat data petty cash…' })}</div>`;
    return;
  }

  let model;
  try { model = buildModel(); }
  catch (err) {
    console.error('[AnalyticsPettyCash] compute failed:', err);
    state.host.innerHTML = `<div class="v2-analytics-claude">${renderAnalyticsEmptyState({ message: 'Gagal memuat analitik petty cash.', hint: 'Silakan muat ulang halaman.' })}</div>`;
    return;
  }

  // Publish for export hooks (mirrors the Driver analytics pattern).
  window._lastPettyCashAnalyticsModel = model;
  window._pettyCashAnalyticsMeta = {
    periodLabel: model.metadata.rangeLabel,
    range: model.metadata.range,
    appVersion: (window.__APP_VERSION__ || ''),
  };

  state.host.innerHTML = `
    <div class="v2-analytics-claude v2-analytics-pc">
      <div class="v2-admin-workspace-layout v2-analytics-shell">
        <div class="v2-admin-page-header" style="margin-bottom:6px;">
          <h1 class="v2-admin-page-title">Analytics Petty Cash</h1>
          <p class="v2-admin-page-subtitle">Analisis realisasi NOR, siklus dana, dan pola pengeluaran.</p>
        </div>
        ${heroInsight(model)}
        ${heroKpi(model)}
        <div style="height:var(--space-section);"></div>
        ${cycleSummary(model)}
        ${trendSection(model)}
        ${breakdownSection(model)}
        ${rankingSection(model)}
        ${insightSection(model)}
        ${exportSection()}
      </div>
    </div>`;

  renderCharts(model);
}

function onHostClick(e) {
  const rangeBtn = e.target.closest('[data-pc-range]');
  if (rangeBtn) {
    const r = rangeBtn.dataset.pcRange;
    if (PC_RANGES.includes(r) && r !== state.range) { state.range = r; render(); }
    return;
  }
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    const action = actionBtn.dataset.action;
    if (action === 'pc-export-pdf' && typeof window.exportPettyCashAnalytics === 'function') {
      Promise.resolve(window.exportPettyCashAnalytics()).catch(err => console.error('[AnalyticsPettyCash] PDF export failed', err));
    } else if (action === 'pc-export-excel' && typeof window.exportPettyCashAnalyticsExcel === 'function') {
      Promise.resolve(window.exportPettyCashAnalyticsExcel()).catch(err => console.error('[AnalyticsPettyCash] Excel export failed', err));
    }
  }
}

/** Mount into a host element; idempotent. */
export async function mountAnalyticsPettyCash(host) {
  if (!host) return;
  state.host = host;
  state.visible = true;
  if (!state.listening) {
    host.addEventListener('click', onHostClick);
    // Live data changes (e.g. a NOR convert echo from the store): re-render when
    // visible; otherwise mark dirty so the next show recomputes from fresh cache.
    registerChangeListener(() => { if (state.visible) render(); else state.dirty = true; });
    state.listening = true;
  }
  state.dirty = false;
  render();                 // immediate paint (may show loading)
  try { await initPettyCashStore(); } catch (_) {}
  render();                 // repaint once data is ready
}

/**
 * Recompute + repaint whenever the workspace becomes visible. Called by
 * setWorkspace() on EVERY show path (desktop panel-nav + mobile sub-nav), so a
 * pending data change (convert) is always reflected without a page refresh.
 */
export function refreshAnalyticsPettyCash() {
  if (!state.host) return;        // not mounted yet — mount() will paint
  state.visible = true;
  state.dirty = false;
  render();
}

/** Hide + release chart resources (called when navigating away). */
export function closeAnalyticsPettyCash() {
  state.visible = false;
  destroyCharts();
}
