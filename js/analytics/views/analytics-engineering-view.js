/* ============================================================
   ANALYTICS-ENGINEERING-VIEW.JS — Engineering Analytics (global module)
   (v1.20.2)

   Engineering Operations no longer owns an Analytics page — it exposes only its
   analytics PROVIDER (buildEngineeringAnalytics). This view renders that provider
   snapshot INSIDE the global Analytics module, reusing the shared Analytics kit
   (analytics-shell) for the KPI grid, sections, insight list, and the shared
   Export Center component. It computes nothing — pure projection of the snapshot.
   ============================================================ */

'use strict';

import {
  renderEyebrow, renderKPIGrid, renderAnalyticsKPICard, renderAnalyticsSection,
  renderInsightList, renderExportCenter, renderAnalyticsEmptyState, anIcon,
} from '../analytics-shell.js';
import { CATEGORY_SEED, STATUS } from '../../engineering/config/engineering-config.js';

const CAT_LABEL = Object.fromEntries(CATEGORY_SEED.map((c) => [c.id, c.label]));
const catLabel = (id) => CAT_LABEL[id] || id;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hours = (ms) => Math.round(((Number(ms) || 0) / 3600000) * 10) / 10;

/** A simple, theme-token bar list (reused for category / building / workload). */
function barList(items, unit) {
  if (!items.length) return '<div style="padding:14px 2px;color:var(--text-dim,#5b5b64);font-size:13px;">Belum ada data.</div>';
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div style="display:flex;flex-direction:column;gap:10px;">${items.map((i) => `
    <div style="display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:center;">
      <span style="font-size:12.5px;color:var(--text-dim,#5b5b64);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(i.name)}</span>
      <span style="height:8px;border-radius:6px;background:var(--surface-2,#f0f0f3);overflow:hidden;"><span style="display:block;height:100%;border-radius:6px;width:${Math.round((i.value / max) * 100)}%;background:var(--accent,#cf4a43);"></span></span>
      <span style="font-family:var(--font-mono,monospace);font-size:12px;color:var(--text,#18181d);font-weight:700;">${esc(i.value)}${unit ? ` ${unit}` : ''}</span>
    </div>`).join('')}</div>`;
}

/**
 * Render the Engineering Analytics view from a provider snapshot.
 * @param {Object} snapshot  buildEngineeringAnalytics() output
 * @param {Object} [opts]    { generatedBy, periodLabel }
 * @returns {string} HTML
 */
export function renderEngineeringAnalyticsView(snapshot, opts = {}) {
  const s = snapshot || {};
  if (!s.totalAssignments) {
    return `<div class="daa exec-ui v2-analytics-claude">
      ${renderEyebrow({ tag: 'ENGINEERING', title: 'Engineering Analytics', sub: 'Ringkasan operasional Engineering.' })}
      ${renderAnalyticsEmptyState({ message: 'Belum ada data Engineering.', hint: 'Analytics akan terisi setelah ada penugasan Engineering.' })}
    </div>`;
  }

  const completed = s.completedAssignments || 0;
  const overdue = s.overdueAssignments ? s.overdueAssignments.count : 0;
  const avgHours = s.averageCompletionTime ? hours(s.averageCompletionTime.averageMs) : 0;
  const waiting = (s.statusDistribution && s.statusDistribution[STATUS.WAITING_VERIFICATION]) || 0;

  const kpis = renderKPIGrid([
    renderAnalyticsKPICard({ title: 'Task Selesai', value: String(completed), subtitle: 'terverifikasi', icon: 'check', status: 'good' }),
    renderAnalyticsKPICard({ title: 'Overdue', value: String(overdue), subtitle: 'lewat target', icon: 'alert', status: overdue > 0 ? 'bad' : 'good' }),
    renderAnalyticsKPICard({ title: 'Rata Penyelesaian', value: `${avgHours}`, subtitle: 'jam / task', icon: 'clock' }),
    renderAnalyticsKPICard({ title: 'Antrean Verifikasi', value: String(waiting), subtitle: 'menunggu', icon: 'clock', status: waiting > 0 ? 'warn' : 'good' }),
  ]);

  const catDist = s.categoryDistribution || {};
  const catItems = Object.keys(catDist).map((k) => ({ name: catLabel(k), value: catDist[k] })).sort((a, b) => b.value - a.value).slice(0, 8);
  const bld = s.buildingDistribution || {};
  const bldItems = Object.keys(bld).map((k) => ({ name: k || '—', value: bld[k] })).sort((a, b) => b.value - a.value).slice(0, 8);
  const workItems = (s.engineeringWorkload || []).map((w) => ({ name: w.name || w.workerId, value: hours(w.workingMs) }))
    .filter((w) => w.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);

  const insights = renderInsightList([
    { type: overdue > 0 ? 'warning' : 'info', title: overdue > 0 ? `${overdue} penugasan melewati target` : 'Tidak ada penugasan overdue', description: 'Distribusi dan beban tim dihitung dari data operasional Engineering aktual.', source: 'Engineering Provider' },
    { type: 'info', title: 'Preventive maintenance (arsitektur)', description: 'Master data peralatan & lokasi disiapkan untuk model prediksi/preventive maintenance mendatang.', source: 'Roadmap' },
  ]);

  const exportCenter = renderExportCenter({
    description: 'Ekspor ringkasan Engineering Analytics dengan komponen ekspor bersama.',
    formats: [
      { ic: anIcon('download', { size: 14 }), label: 'PDF', sub: 'Ringkasan berformat', action: 'export-engineering-analytics-pdf', actionLabel: 'Unduh PDF', enabled: true },
      { ic: anIcon('download', { size: 14 }), label: 'Excel', sub: 'Workbook .xlsx', action: 'export-engineering-analytics-excel', actionLabel: 'Unduh Excel', enabled: true },
    ],
  });

  return `<div class="daa exec-ui v2-analytics-claude">
    ${renderEyebrow({ tag: 'ENGINEERING', title: 'Engineering Analytics', sub: `Ringkasan operasional Engineering — ${s.totalAssignments} penugasan.` })}
    ${kpis}
    ${renderAnalyticsSection({ id: 'eng-an-workload', title: 'Beban Engineering', description: 'Jam kerja aktual per teknisi', content: barList(workItems, 'jam') })}
    ${renderAnalyticsSection({ id: 'eng-an-category', title: 'Task per Kategori', description: `${s.totalAssignments} total`, content: barList(catItems, 'task') })}
    ${renderAnalyticsSection({ id: 'eng-an-building', title: 'Task per Gedung', description: 'Lokasi paling sering', content: barList(bldItems, 'task') })}
    ${renderAnalyticsSection({ id: 'eng-an-insights', title: 'Wawasan Operasional', description: 'Dihasilkan dari data Engineering', content: insights })}
    ${exportCenter}
  </div>`;
}
