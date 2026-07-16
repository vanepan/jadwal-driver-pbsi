/* ============================================================
   OVERTIME-ANALYTICS-VIEW.JS — Dashboard/Analytics screen (Sprint 7)

   Renders svc.getDashboardAnalytics()'s view-model — ONE service call
   per render (see overtime-service.js header comment). Pure render +
   its own `analyticsActions` data-act map, wired into overtime-center.js
   via a single fallback line in its onClick switch (the extension
   mechanism every later sprint's screen file reuses).

   File-split precedent: js/engineering/ split its center file into a
   shell + dedicated view files rather than growing one file past
   ~2500 lines — overtime-center.js (957L before Sprint 7) follows the
   same split starting here.
   ============================================================ */

'use strict';

import * as svc from '../overtime-service.js';
import { esc, rp, fmtMonth, fmtDate } from './overtime-atoms.js';
import { renderHeatmap } from './overtime-heatmap.js';

const TREND_TABS = [
  { key: 'daily', label: 'Harian' },
  { key: 'weekly', label: 'Mingguan' },
  { key: 'monthly', label: 'Bulanan' },
  { key: 'yearly', label: 'Tahunan' },
];

/* ── Small render primitives ────────────────────────────────────── */

function statTile(label, value, tone) {
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;flex:1;min-width:150px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--label);text-transform:uppercase">${esc(label)}</div>
      <div style="font-size:23px;font-weight:800;margin-top:6px;color:${tone || 'var(--text)'}">${value}</div>
    </div>`;
}

function rankingCard(title, rows, opts = {}) {
  const { emptyLabel = 'Belum ada data bulan ini.', showEmployeeCount = false } = opts;
  const body = rows.length
    ? rows.map((r, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:${i === 0 ? 'none' : '1px solid var(--border)'}">
        <div style="width:22px;height:22px;border-radius:7px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--muted);flex:none">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
          <div style="font-size:11px;color:var(--muted)">${r.count} hari${showEmployeeCount ? ` · ${r.employeeCount} pegawai` : ''}</div>
        </div>
        <div style="font-size:13px;font-weight:700;color:var(--primary);flex:none">${esc(rp(r.amount))}</div>
      </div>`).join('')
    : `<div style="font-size:12px;color:var(--muted);padding:8px 0">${esc(emptyLabel)}</div>`;
  return `
    <div style="flex:1;min-width:280px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px">
      <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:2px">${esc(title)}</div>
      ${body}
    </div>`;
}

function trendChart(trend, activeGranularity) {
  const tabs = TREND_TABS.map(t => `
    <button data-act="setTrendGranularity" data-id="${t.key}" type="button"
      style="border:1px solid ${t.key === activeGranularity ? 'var(--primary)' : 'var(--border)'};background:${t.key === activeGranularity ? 'var(--primary-tint)' : 'var(--card)'};color:${t.key === activeGranularity ? 'var(--primary-text)' : 'var(--text)'};border-radius:8px;padding:6px 12px;font-size:12px;font-weight:${t.key === activeGranularity ? '700' : '600'};cursor:pointer">${t.label}</button>`).join('');

  const points = trend.points.slice(-14); // last 14 buckets — enough signal, never unbounded
  const max = Math.max(1, ...points.map(p => p.value));
  const bars = points.length
    ? points.map(p => `
      <div title="${esc(p.label)}: ${esc(rp(p.value))}" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0">
        <div style="width:100%;max-width:26px;height:70px;display:flex;align-items:flex-end">
          <div style="width:100%;background:var(--primary);border-radius:4px 4px 0 0;height:${Math.max(2, Math.round((p.value / max) * 70))}px"></div>
        </div>
        <div style="font-size:9.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36px">${esc(p.label.slice(-5))}</div>
      </div>`).join('')
    : `<div style="font-size:12px;color:var(--muted);padding:8px 0">Belum ada data.</div>`;

  const t = trend.summary.trend;
  const trendNote = points.length > 1
    ? `<div style="font-size:11px;color:var(--muted);margin-top:8px">Dibanding titik pertama: ${t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '—'} ${t.percentChange == null ? '—' : Math.abs(t.percentChange) + '%'}</div>`
    : '';

  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;font-weight:800;color:var(--text)">Tren Lembur</div>
        <div style="display:flex;gap:6px">${tabs}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:flex-end;margin-top:14px">${bars}</div>
      ${trendNote}
    </div>`;
}

function budgetSection(budget, editing, form, formErr) {
  const utilLabel = budget.utilization == null ? '— (target belum diatur)' : `${Math.round(budget.utilization)}%`;
  const utilTone = budget.utilization == null ? 'var(--muted)' : budget.utilization > 100 ? 'var(--danger, #b3382c)' : 'var(--primary)';
  const editor = editing ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px">Target Bulanan (Rp)</div>
        <input data-act="statefield:budgetForm.amount" type="number" min="0" value="${esc(form.amount)}" placeholder="0"
          style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px;width:180px">
      </div>
      <button data-act="saveBudgetTarget" type="button" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:8px;padding:9px 14px;font-size:12.5px;font-weight:700;cursor:pointer">Simpan</button>
      <button data-act="closeBudgetEditor" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer">Batal</button>
      ${formErr ? `<div style="width:100%;color:var(--primary);font-size:12px">${esc(formErr)}</div>` : ''}
    </div>` : '';

  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:13px;font-weight:800;color:var(--text)">Budget Analytics</div>
        ${!editing ? `<button data-act="openBudgetEditor" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Ubah Target</button>` : ''}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        ${statTile('Running Budget', esc(rp(budget.running)))}
        ${statTile('Remaining Budget', esc(rp(budget.remaining)), budget.remaining < 0 ? 'var(--danger, #b3382c)' : 'var(--text)')}
        ${statTile('Utilisasi', utilLabel, utilTone)}
        ${statTile('Rata-rata / Hari', esc(rp(budget.avgPerDay)))}
        ${statTile('Proyeksi Akhir Bulan', esc(rp(budget.projectedEOM)))}
        ${statTile('Proyeksi Akhir Tahun', esc(rp(budget.projectedEOY)))}
      </div>
      ${editor}
    </div>`;
}

function executiveStrip(exec) {
  const tiles = [
    statTile('Top Unit', exec.topUnit ? esc(exec.topUnit.name) : '—'),
    statTile('Top Karyawan', exec.topEmployee ? esc(exec.topEmployee.name) : '—'),
    statTile('Hari Terboros', exec.mostExpensiveDay ? esc(fmtDate(exec.mostExpensiveDay.date)) : '—'),
    statTile('Hari Terfavorit', exec.mostFrequentDayOfWeek ? esc(exec.mostFrequentDayOfWeek.label) : '—'),
    statTile('Rata-rata Biaya', esc(rp(exec.averageCost))),
    statTile('Rata-rata Pegawai/Hari', exec.averageEmployeePerDay ? exec.averageEmployeePerDay.toFixed(1) : '0'),
  ];
  return `
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">Executive Summary</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${tiles.join('')}</div>
    </div>`;
}

/* ── Screen ─────────────────────────────────────────────────────── */

export function renderAnalyticsScreen(state) {
  const data = svc.getDashboardAnalytics({ trendGranularity: state.analyticsTrendGranularity || 'daily' });
  // §8 Level 3: duplicate warning for the current month — same
  // findDuplicatesInMonth() (and, under it, the same findDuplicateRecords()
  // primitive Closing's validator uses) that Rekap Lembur and Penyesuaian
  // Data both call, never a re-implementation.
  const monthDupes = svc.findDuplicatesInMonth(data.heatmap.month);

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Dashboard</h2>
      <div style="font-size:13px;color:var(--muted)">Rekap lembur seluruh unit Bidang Sarana dan Prasarana.</div>
    </div>

    ${monthDupes.length ? `<div style="margin-bottom:14px;background:var(--amber-tint,#f8eed4);border:1px solid var(--amber-bd,#ecdcb2);color:var(--amber,#a9781a);border-radius:10px;padding:10px 14px;font-size:12.5px">⚠ ${monthDupes.length} kombinasi karyawan/unit/tanggal terekam lebih dari sekali bulan ini. Periksa di Penyesuaian Data.</div>` : ''}

    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px">
      ${statTile('Total Nominal', esc(rp(data.kpis.totalAmount)), 'var(--green)')}
      ${statTile('Jumlah Pegawai', data.kpis.employeeCount, 'var(--primary)')}
      ${statTile('Jumlah Entry', data.kpis.totalRecords)}
      ${statTile('Unit Aktif', data.kpis.unitCount)}
    </div>

    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:18px">
      ${rankingCard('Per Unit', data.topUnits, { showEmployeeCount: true })}
      ${rankingCard('Per Karyawan', data.topEmployees)}
    </div>

    <div style="margin-top:14px">${trendChart(data.trend, state.analyticsTrendGranularity || 'daily')}</div>

    <div style="margin-top:14px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px">
      <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:10px">Heatmap — ${esc(fmtMonth(data.heatmap.month))}</div>
      ${renderHeatmap(data.heatmap.cells, fmtMonth(data.heatmap.month))}
    </div>

    <div style="margin-top:14px">${budgetSection(data.budget, !!state.budgetEditing, state.budgetForm || { amount: '' }, state.budgetFormErr)}</div>

    <div style="margin-top:18px">${executiveStrip(data.executive)}</div>

    <div style="margin-top:18px;display:flex;justify-content:flex-end">
      <button data-act="recalculateSummaries" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--muted);border-radius:8px;padding:7px 12px;font-size:11.5px;font-weight:600;cursor:pointer">Hitung Ulang Ringkasan</button>
    </div>`;
}

/* ── Actions — merged into overtime-center.js's onClick switch via one
   fallback line: `if (analyticsActions[act]) return analyticsActions[act]({el, id, state, setState, toast});` ── */
export const analyticsActions = {
  setTrendGranularity({ id, setState }) { setState({ analyticsTrendGranularity: id }); },

  openBudgetEditor({ setState }) {
    const target = svc.getBudgetTarget();
    setState({ budgetEditing: true, budgetForm: { amount: target ? String(target) : '' }, budgetFormErr: '' });
  },
  closeBudgetEditor({ setState }) { setState({ budgetEditing: false, budgetFormErr: '' }); },
  async saveBudgetTarget({ state, setState, toast }) {
    try {
      await svc.setBudgetTarget((state.budgetForm && state.budgetForm.amount) || 0);
      setState({ budgetEditing: false, budgetFormErr: '' });
      toast('Target anggaran tersimpan.');
    } catch (err) {
      setState({ budgetFormErr: err.message || 'Gagal menyimpan target.' });
    }
  },

  async recalculateSummaries({ toast }) {
    try {
      const r = await svc.rebuildAllSummaries();
      toast(`Ringkasan dihitung ulang — ${r.dailyCount} harian, ${r.monthlyCount} bulanan.`);
    } catch (err) {
      toast(err.message || 'Gagal menghitung ulang ringkasan.');
    }
  },
};
