/* ============================================================
   FLEET-DASHBOARD.JS — Vehicle Management Executive Summary (v1.18.2)

   A THIN executive summary strip (≤20% of page height) that sits ABOVE the
   Vehicle Inventory. It is NOT a second analytics page: it answers only the five
   questions an asset manager opens the module with —
     • How many vehicles?
     • Anything wrong?
     • Average health?
     • Tax falling due?
     • In maintenance?

   It inherits the Dispatch Analytics design LANGUAGE (token-driven KPI tiles,
   gradient hero, soft shadow, same type rhythm) without forking the `.daa-sec`
   section system — there is no section shell here, only a compact KPI row, so
   the inventory below stays the visual hero.

   PURE PRESENTATION. Every value comes from computeFleetAssetModel() in
   vehicle-asset-service.js. This file computes nothing and changes no business
   logic. All glyphs are SVG via the platform icon system — zero emoji.
   ============================================================ */

'use strict';

import { renderIcon } from './icon-system.js';

const STYLE_ID = 'vm-summary-styles';

const CSS = `
.vms{display:flex;flex-direction:column;gap:.55rem;min-width:0;margin-bottom:var(--space-section,26px);
  color:var(--text);font-family:var(--font-sans, inherit);}
.vms *{box-sizing:border-box;}
.vms__head{display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.vms__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  display:flex;align-items:center;gap:.4rem;}
.vms__meta{font-size:.66rem;color:var(--muted);font-variant-numeric:tabular-nums;}

/* KPI row — gradient tiles in the Dispatch Analytics idiom, compact density */
.vms__kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:.6rem;}
.vms__kpi{border:1px solid var(--border);border-radius:14px;padding:.7rem .8rem;
  background:linear-gradient(180deg, var(--surface-2), var(--surface));
  display:flex;flex-direction:column;gap:.25rem;min-width:0;box-shadow:var(--shadow-sm);}
.vms__kpi--hero{border-color:var(--info);background:linear-gradient(180deg, var(--info-bg), var(--surface));}
.vms__lbl{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);
  display:flex;align-items:center;gap:.32rem;}
.vms__num{font-size:1.5rem;font-weight:800;letter-spacing:-.02em;line-height:1.05;color:var(--text);
  font-variant-numeric:tabular-nums;}
.vms__num[data-tone="ok"]{color:var(--ok);}
.vms__num[data-tone="warn"]{color:var(--warn);}
.vms__num[data-tone="danger"]{color:var(--danger);}
.vms__sub{font-size:.62rem;color:var(--muted);}

@media (max-width:800px){
  .vms__kpis{grid-template-columns:repeat(auto-fit,minmax(7rem,1fr));}
}
@media (max-width:560px){
  .vms__kpis{grid-template-columns:repeat(2,1fr);gap:.5rem;}
  .vms__kpi{padding:.6rem .7rem;}
  .vms__num{font-size:1.35rem;}
}
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

function kpi({ label, icon, num, tone, sub, hero }) {
  const ic = icon ? renderIcon(icon, '0.72rem', 'currentColor') : '';
  return `
    <div class="vms__kpi${hero ? ' vms__kpi--hero' : ''}">
      <div class="vms__lbl">${ic} ${esc(label)}</div>
      <div class="vms__num"${tone ? ` data-tone="${esc(tone)}"` : ''}>${esc(num)}</div>
      <div class="vms__sub">${esc(sub)}</div>
    </div>`;
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

  return `
    <section class="vms" aria-label="Ringkasan Armada">
      <div class="vms__head">
        <div class="vms__title">${renderIcon('vehicle-car', '0.85rem', 'currentColor')} Ringkasan Armada</div>
        <div class="vms__meta">Diperbarui ${esc(fmtTime(model.now))}</div>
      </div>
      <div class="vms__kpis">
        ${kpi({ label: 'Armada', icon: 'vehicle-car', num: d.totalAssets || 0, sub: 'total kendaraan', hero: true })}
        ${kpi({ label: 'Perlu Perhatian', icon: 'legal-warning', num: issues, tone: issues > 0 ? 'danger' : 'ok', sub: 'aset bermasalah' })}
        ${kpi({ label: 'Kesehatan', icon: 'health-' + (healthTone === 'ok' ? 'ok' : healthTone === 'warn' ? 'warn' : 'danger'), num: health, tone: healthTone, sub: 'rata-rata 0–100' })}
        ${kpi({ label: 'Pajak Jatuh Tempo', icon: 'doc-tax', num: taxDue, tone: taxDue > 0 ? 'warn' : 'ok', sub: 'segera kedaluwarsa' })}
        ${kpi({ label: 'Perawatan', icon: 'tool-wrench', num: maint, tone: maint > 0 ? 'warn' : 'ok', sub: 'sedang servis' })}
      </div>
    </section>`;
}
