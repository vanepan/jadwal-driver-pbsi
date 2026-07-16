/* ============================================================
   OVERTIME-HEATMAP.JS — simple calendar heatmap (Sprint 7)

   No charting library — plain CSS-grid cells, matching the brief's own
   ASCII-bar guidance ("Senin ████ Selasa ██ ..."). Cells are laid out
   by CALENDAR WEEK COLUMN × WEEKDAY ROW (GitHub-contributions style),
   which reconciles the brief's weekday-row example with a genuine
   month-at-a-glance heatmap: each cell's row position already reads as
   "this is a Senin/Selasa/..." the same way the brief's bars do.

   No heatmap component existed anywhere in this repo before Sprint 7 —
   confirmed by audit. Pure render: no state, no Firebase.
   ============================================================ */

'use strict';

import { esc, fmtDate, rp } from './overtime-atoms.js';

const WEEKDAY_ROW_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** Maps JS getDay() (0=Sun..6=Sat) to a Monday-first row index (0=Sen..6=Min). */
function mondayFirstRow(jsDay) { return jsDay === 0 ? 6 : jsDay - 1; }

function intensityColor(intensity) {
  if (intensity <= 0) return 'var(--card2)';
  // 5-step scale from a faint tint to the full primary color.
  const steps = ['color-mix(in srgb, var(--primary) 15%, var(--card2))',
    'color-mix(in srgb, var(--primary) 35%, var(--card2))',
    'color-mix(in srgb, var(--primary) 55%, var(--card2))',
    'color-mix(in srgb, var(--primary) 75%, var(--card2))',
    'var(--primary)'];
  const idx = Math.min(steps.length - 1, Math.floor(intensity * steps.length));
  return steps[idx];
}

/**
 * @param {Array<{date,day,count,amount,intensity}>} cells - buildHeatmapGrid() output
 * @param {string} monthLabel - display label, e.g. "Jul 2026"
 */
export function renderHeatmap(cells, monthLabel) {
  if (!cells || !cells.length) {
    return `<div style="font-size:12px;color:var(--muted);padding:10px 2px">Belum ada data bulan ini.</div>`;
  }

  // Column = ISO week-of-month bucket (0-based), row = weekday.
  const grid = new Map(); // "col:row" -> cell
  let maxCol = 0;
  cells.forEach(c => {
    const jsDay = new Date(`${c.date}T00:00:00`).getDay();
    const row = mondayFirstRow(jsDay);
    const col = Math.floor((c.day - 1 + mondayFirstRow(new Date(`${cells[0].date}T00:00:00`).getDay())) / 7);
    if (col > maxCol) maxCol = col;
    grid.set(`${col}:${row}`, c);
  });

  const rows = WEEKDAY_ROW_LABELS.map((label, row) => {
    const cellsHtml = [];
    for (let col = 0; col <= maxCol; col++) {
      const c = grid.get(`${col}:${row}`);
      if (!c) { cellsHtml.push(`<div style="width:15px;height:15px"></div>`); continue; }
      const title = `${esc(fmtDate(c.date))} — ${c.count} entri, ${esc(rp(c.amount))}`;
      cellsHtml.push(`<div title="${title}" style="width:15px;height:15px;border-radius:4px;background:${intensityColor(c.intensity)};border:1px solid var(--border)"></div>`);
    }
    return `<div style="display:flex;align-items:center;gap:5px">
      <div style="width:26px;font-size:10px;color:var(--muted);text-align:right;flex:none">${label}</div>
      <div style="display:flex;gap:4px">${cellsHtml.join('')}</div>
    </div>`;
  }).join('');

  return `
    <div style="display:flex;flex-direction:column;gap:4px">${rows}</div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:10.5px;color:var(--muted)">
      <span>Sepi</span>
      ${[0, 0.25, 0.5, 0.75, 1].map(i => `<div style="width:12px;height:12px;border-radius:3px;background:${intensityColor(i)};border:1px solid var(--border)"></div>`).join('')}
      <span>Padat</span>
      <span style="margin-left:auto">${esc(monthLabel)}</span>
    </div>`;
}
