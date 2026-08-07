/* ============================================================
   VEHICLE-ACTIVITY-PANEL.JS — Vehicle Core Phase 8 (Unified Timeline)

   A compact "recent vehicle activity" strip for the Vehicle Inventory page —
   the Dashboard preview the release brief asks for ("Dashboard may display a
   small Recent Vehicle Activity preview. The Timeline remains the owner.
   Dashboard only consumes it."). Structurally identical to Phase 7's
   vehicle-reminder-panel.js: ADDITIVE, separate from fleet-dashboard.js's
   protected fixed 5-KPI strip, computes nothing of its own.

   PURE PRESENTATION. Every value comes from recentVehicleActivity()
   (js/vehicle/vehicle-timeline.js), which itself only re-arranges facts
   already computed by vehicle-asset-service.js / compliance-config.js /
   maintenance-service.js / reminder-engine.js. No DOM query, no Firebase, no
   business logic. Zero emoji — glyphs via the platform icon engine (anIcon).
   ============================================================ */

'use strict';

import { ExecutiveCard, ExecutiveStatusPill, anIcon, escHtml } from '../analytics/executive-ui-kit.js';
import { recentVehicleActivity } from '../vehicle/vehicle-timeline.js';

const STYLE_ID = 'vm-activity-panel-styles';
const esc = escHtml;

const CSS = `
.vap{display:flex;flex-direction:column;gap:.55rem;min-width:0;margin-bottom:var(--space-section,26px);}
.vap *{box-sizing:border-box;}
.vap__head{display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.vap__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  display:flex;align-items:center;gap:.4rem;}
.vap__list{display:flex;flex-direction:column;gap:.4rem;}
.vap__row{display:flex;align-items:center;gap:.6rem;padding:.5rem .7rem;border:1px solid var(--border,#e8e6e2);
  border-radius:var(--radius-sm,11px);background:var(--surface-2,#fbfaf8);}
.vap__row-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}
.vap__row-title{font-size:.82rem;font-weight:700;color:var(--text,#1a1917);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vap__row-sub{font-size:.72rem;color:var(--muted,#5b5953);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vap__empty{font-size:.82rem;color:var(--muted,#5b5953);padding:.4rem .1rem;}
`;

export function injectVehicleActivityPanelStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function toneOf(t) {
  return (t === 'ok' || t === 'warn' || t === 'danger' || t === 'info') ? t : 'info';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function activityRow(e) {
  const meta = e.meta || {};
  return `
    <div class="vap__row">
      ${ExecutiveStatusPill(fmtDate(e.when), toneOf(meta.tone))}
      <div class="vap__row-main">
        <span class="vap__row-title">${esc(meta.vehicleName || 'Tanpa nama')} · ${esc(e.title)}</span>
        <span class="vap__row-sub">${esc(e.description || '—')}</span>
      </div>
    </div>`;
}

/**
 * Render the Recent Vehicle Activity preview from an array of ALREADY
 * NORMALIZED vehicle assets (e.g. computeFleetAssetModel().vehicles) — never
 * a raw vehicle, never recomputed here.
 * @param {Array<Object>} vehicles
 * @param {{limit?:number}} [opts]
 * @returns {string}
 */
export function renderVehicleActivityPanel(vehicles, opts = {}) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const entries = recentVehicleActivity(list, { limit: opts.limit || 8 });

  const body = entries.length
    ? `<div class="vap__list">${entries.map(activityRow).join('')}</div>`
    : `<div class="vap__empty">Belum ada aktivitas kendaraan yang tercatat.</div>`;

  return `
    <section class="vap exec-ui v2-analytics-claude" aria-label="Aktivitas Kendaraan Terbaru">
      <div class="vap__head">
        <div class="vap__title">${anIcon('timeline', { size: 14 })} Aktivitas Kendaraan Terbaru</div>
      </div>
      ${ExecutiveCard({ content: body })}
    </section>`;
}

console.info('Vehicle activity panel module loaded');
