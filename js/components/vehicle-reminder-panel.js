/* ============================================================
   VEHICLE-REMINDER-PANEL.JS — Vehicle Core Phase 7 (v1.29.18)

   A compact "needs attention" strip for the Vehicle Inventory page, separate
   from fleet-dashboard.js's fixed 5-KPI strip (that file self-documents
   exactly five questions; a 6th tile there would be a protected "Dashboard
   calculations" change — see Phase 6's own precedent). This panel is
   ADDITIVE: a new, isolated section that consumes the Reminder Engine
   directly and decides NOTHING about priority or status — it only renders
   the counts/top-N list the engine already computed and sorted.

   PURE PRESENTATION. Every value comes from computeFleetReminders() /
   summarizeReminders() (js/services/reminder-engine.js). No DOM query, no
   Firebase, no business logic. Zero emoji — glyphs via the platform icon
   engine (anIcon).
   ============================================================ */

'use strict';

import { ExecutiveCard, ExecutiveStatusPill, anIcon, escHtml } from '../analytics/executive-ui-kit.js';
import { computeFleetReminders, summarizeReminders } from '../services/reminder-engine.js';

const STYLE_ID = 'vm-reminder-panel-styles';
const esc = escHtml;

const CSS = `
.vrp{display:flex;flex-direction:column;gap:.55rem;min-width:0;margin-bottom:var(--space-section,26px);}
.vrp *{box-sizing:border-box;}
.vrp__head{display:flex;align-items:baseline;justify-content:space-between;gap:.6rem;flex-wrap:wrap;}
.vrp__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  display:flex;align-items:center;gap:.4rem;}
.vrp__badges{display:flex;flex-wrap:wrap;gap:.35rem;}
.vrp__list{display:flex;flex-direction:column;gap:.4rem;}
.vrp__row{display:flex;align-items:center;gap:.6rem;padding:.5rem .7rem;border:1px solid var(--border,#e8e6e2);
  border-radius:var(--radius-sm,11px);background:var(--surface-2,#fbfaf8);}
.vrp__row-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}
.vrp__row-title{font-size:.82rem;font-weight:700;color:var(--text,#1a1917);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vrp__row-sub{font-size:.72rem;color:var(--muted,#5b5953);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.vrp__empty{font-size:.82rem;color:var(--muted,#5b5953);padding:.4rem .1rem;}
`;

export function injectVehicleReminderPanelStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function toneOf(t) {
  return (t === 'ok' || t === 'warn' || t === 'danger' || t === 'info') ? t : 'neutral';
}

function reminderRow(r) {
  const label = r.category ? `${r.typeLabel} — ${r.categoryLabel}` : r.typeLabel;
  return `
    <div class="vrp__row">
      ${ExecutiveStatusPill(r.statusLabel, toneOf(r.tone))}
      <div class="vrp__row-main">
        <span class="vrp__row-title">${esc(r.vehicleName || 'Tanpa nama')} · ${esc(label)}</span>
        <span class="vrp__row-sub">${esc(r.reason)}</span>
      </div>
    </div>`;
}

/**
 * Render the reminders panel from an array of ALREADY NORMALIZED vehicle
 * assets (e.g. computeFleetAssetModel().vehicles) — never a raw vehicle, never
 * recomputed here.
 * @param {Array<Object>} vehicles
 * @returns {string}
 */
export function renderVehicleReminderPanel(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const reminders = computeFleetReminders(list);
  const summary = summarizeReminders(reminders);

  const badges = [
    summary.overdueCount ? ExecutiveStatusPill(`${summary.overdueCount} Terlambat`, 'danger') : '',
    summary.dueSoonCount ? ExecutiveStatusPill(`${summary.dueSoonCount} Segera`, 'warn') : '',
  ].filter(Boolean).join('');

  const body = summary.top.length
    ? `<div class="vrp__list">${summary.top.map(reminderRow).join('')}</div>`
    : `<div class="vrp__empty">Tidak ada kendaraan yang memerlukan tindakan segera.</div>`;

  return `
    <section class="vrp exec-ui v2-analytics-claude" aria-label="Pengingat Kendaraan">
      <div class="vrp__head">
        <div class="vrp__title">${anIcon('legal-warning', { size: 14 })} Pengingat Kendaraan</div>
        <div class="vrp__badges">${badges}</div>
      </div>
      ${ExecutiveCard({ content: body })}
    </section>`;
}

console.info('Vehicle reminder panel module loaded');
