/* ============================================================
   FLEET-DASHBOARD.JS — Vehicle Management Executive Summary
   (v1.18.4 — Executive UI Sprint 2)

   A THIN executive summary strip (≤20% of page height) that sits ABOVE the
   Vehicle Inventory. It is NOT a second analytics page: it answers only the five
   questions an asset manager opens the module with —
     • How many vehicles?
     • Anything wrong?
     • Average health?
     • Tax falling due?
     • In maintenance?

   v1.18.4 migration: the bespoke KPI tiles + local `kpi()` builder are
   GONE. The five KPIs are now rendered with the Executive UI Kit
   (ExecutiveKPICard / ExecutiveKPIGrid) — the SAME grammar as Analytics Driver —
   and every glyph comes from the single icon engine (anIcon). Only the thin
   eyebrow strip keeps a tiny local style; the KPI styling lives in platform.css.

   PURE PRESENTATION. Every value comes from computeFleetAssetModel() in
   vehicle-asset-service.js. This file computes nothing and changes no business
   logic. Zero emoji — all glyphs are SVG via the platform icon engine.
   ============================================================ */

'use strict';

import { ExecutiveKPICard, ExecutiveKPIGrid, anIcon } from '../analytics/executive-ui-kit.js';

const STYLE_ID = 'vm-summary-styles';

/* Only the thin eyebrow strip needs local style now — the KPI tiles inherit the
   canonical `.v2-analytics-kpi-*` grammar from platform.css (Executive UI). */
const CSS = `
.vms{display:flex;flex-direction:column;gap:.55rem;min-width:0;margin-bottom:var(--space-section,26px);
  color:var(--text);font-family:var(--font-sans, inherit);}
.vms *{box-sizing:border-box;}
.vms__head{display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.vms__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  display:flex;align-items:center;gap:.4rem;}
.vms__meta{font-size:.66rem;color:var(--muted);font-variant-numeric:tabular-nums;}
`;

export function injectFleetDashboardStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ── helpers ─────────────────────────────────────────────────────── */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

/** Count assets that need attention (read-only aggregation over the already
 *  normalized vehicles — no new calculation). An asset is an "issue" when any
 *  legal document is expired or the overall health lands in the danger band. */
function countIssues(vehicles) {
  return vehicles.reduce((n, v) => {
    const expired =
      v.stnk?.status === 'expired' ||
      v.tax?.status === 'expired' ||
      v.insurance?.status === 'expired';
    const unhealthy = v.health?.color === 'danger';
    return n + (expired || unhealthy ? 1 : 0);
  }, 0);
}

/** One executive KPI tile — the kit's ONE KPI grammar (replaces the old local
 *  `kpi()` builder). `tone` (ok/warn/danger/info) becomes the card status accent. */
function fleetKpi({ label, icon, num, tone, sub }) {
  return ExecutiveKPICard({
    title: esc(label),
    value: esc(num),
    icon: icon ? anIcon(icon, { size: 14 }) : '',
    status: tone || '',
    subtitle: esc(sub),
  });
}

/* ── main export ─────────────────────────────────────────────────── */

export function renderFleetDashboard(model) {
  if (!model) return '';
  const d = model.dashboard || {};
  const vehicles = model.vehicles || [];

  const issues = countIssues(vehicles);
  const health = Math.round(d.healthAvg || 0);
  const healthTone = health >= 70 ? 'ok' : (health >= 50 ? 'warn' : 'danger');
  const taxDue = d.taxDueSoon || 0;
  const maint = d.maintenance || 0;

  const cards = [
    fleetKpi({ label: 'Armada', icon: 'vehicle-car', num: d.totalAssets || 0, tone: 'info', sub: 'total kendaraan' }),
    fleetKpi({ label: 'Perlu Perhatian', icon: 'legal-warning', num: issues, tone: issues > 0 ? 'danger' : 'ok', sub: 'aset bermasalah' }),
    fleetKpi({ label: 'Kesehatan', icon: 'health-' + healthTone, num: health, tone: healthTone, sub: 'rata-rata 0–100' }),
    fleetKpi({ label: 'Pajak Jatuh Tempo', icon: 'doc-tax', num: taxDue, tone: taxDue > 0 ? 'warn' : 'ok', sub: 'segera kedaluwarsa' }),
    fleetKpi({ label: 'Perawatan', icon: 'tool-wrench', num: maint, tone: maint > 0 ? 'warn' : 'ok', sub: 'sedang servis' }),
  ];

  return `
    <section class="vms exec-ui v2-analytics-claude" aria-label="Ringkasan Armada">
      <div class="vms__head">
        <div class="vms__title">${anIcon('vehicle-car', { size: 14 })} Ringkasan Armada</div>
        <div class="vms__meta">Diperbarui ${esc(fmtTime(model.now))}</div>
      </div>
      ${ExecutiveKPIGrid(cards)}
    </section>`;
}
