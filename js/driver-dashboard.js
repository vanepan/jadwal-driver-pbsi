/* ============================================================
   DRIVER-DASHBOARD.JS — Driver Personal Assignment View

   Dedicated read-only dashboard for the driver role.
   Sections: Active (started) · Today · Upcoming · History

   Entry point: renderDriverDashboard() called from app.js
   whenever assignments change or the role view is activated.
   ============================================================ */

'use strict';

import { todayString, formatDateShort } from './utils.js';
import { VEHICLES } from './drivers.js';
import { openDetailModal } from './modal.js';

/* ── Module State ── */
let assignments = [];

const STATUS_LABELS = {
  pending:   'Menunggu',
  approved:  'Disetujui',
  assigned:  'Dijadwalkan',
  started:   'Berlangsung',
  completed: 'Selesai',
};

export function setAssignments(newAssignments) {
  assignments = newAssignments;
}

/**
 * Render the driver dashboard into #driverDashboard.
 * Safe to call even when the container is hidden — exits early.
 */
export function renderDriverDashboard() {
  const container = document.getElementById('driverDashboard');
  if (!container || container.style.display === 'none') return;

  const today = todayString();

  // Active: currently in-progress (any date)
  const active = assignments
    .filter(a => a.status === 'started')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Today: today's assignments that are not yet started or completed
  const todayList = assignments
    .filter(a => a.date === today && a.status === 'assigned')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Upcoming: future dates, not completed
  const upcoming = assignments
    .filter(a => a.date > today && a.status !== 'completed')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, 20);

  // History: completed assignments + overdue non-completed past assignments
  const historyRaw = [
    ...assignments.filter(a => a.status === 'completed'),
    ...assignments.filter(a => a.date < today && a.status !== 'completed' && a.status !== 'started'),
  ];
  const seen = new Set();
  const history = historyRaw
    .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; })
    .sort((a, b) => {
      const da = a.completedAt || (a.date + 'T23:59');
      const db = b.completedAt || (b.date + 'T23:59');
      return db.localeCompare(da);
    })
    .slice(0, 20);

  const activeEl   = document.getElementById('dashActiveSection');
  const todayEl    = document.getElementById('dashTodaySection');
  const upcomingEl = document.getElementById('dashUpcomingSection');
  const historyEl  = document.getElementById('dashHistorySection');

  if (activeEl) {
    activeEl.innerHTML = active.length
      ? buildSection('Berlangsung Sekarang', active, { highlight: true })
      : '';
  }
  if (todayEl)    todayEl.innerHTML    = buildSection('Jadwal Hari Ini',   todayList, { emptyText: 'Tidak ada jadwal hari ini' });
  if (upcomingEl) upcomingEl.innerHTML = buildSection('Jadwal Mendatang',  upcoming,  { showDate: true, emptyText: 'Tidak ada jadwal mendatang' });
  if (historyEl)  historyEl.innerHTML  = buildSection('Riwayat',           history,   { showDate: true, muted: true, emptyText: 'Belum ada riwayat penugasan' });

  // Wire card clicks → open existing detail modal
  container.querySelectorAll('[data-asgn-id]').forEach(card => {
    card.addEventListener('click', () => openDetailModal(card.dataset.asgnId));
  });
}

/* ── Private Helpers ── */

function buildSection(title, items, opts = {}) {
  const { highlight = false, showDate = false, muted = false, emptyText = 'Tidak ada data' } = opts;
  const cls = highlight ? 'dash-section dash-section--active' : 'dash-section';
  const cards = items.length
    ? items.map(a => buildCard(a, { showDate, muted })).join('')
    : `<div class="dash-empty">${esc(emptyText)}</div>`;
  return `<div class="${cls}"><div class="dash-section-title">${esc(title)}</div>${cards}</div>`;
}

function buildCard(a, { showDate = false, muted = false } = {}) {
  const status = a.status || 'assigned';
  const label  = STATUS_LABELS[status] || status;
  const color  = VEHICLES[a.vehicle] || '#555';

  const datePart = showDate
    ? `<span class="dash-meta-item">📅 ${formatDateShort(a.date)}</span>` : '';
  const timePart = a.fullDay
    ? `<span class="dash-meta-item">⏰ Penuh Hari</span>`
    : `<span class="dash-meta-item">⏰ ${esc(a.startTime)} – ${esc(a.endTime)}</span>`;
  const picPart = a.pic
    ? `<div class="dash-card-pic">👤 ${esc(a.pic)}</div>` : '';

  return `
    <div class="dash-card dash-card--${esc(status)}${muted ? ' dash-card--muted' : ''}"
         data-asgn-id="${esc(a.id)}" role="button" tabindex="0"
         aria-label="${esc(a.purpose || a.destination)}">
      <div class="dash-card-header">
        <span class="badge-status badge-status--${esc(status)}">${esc(label)}</span>
        <span class="vehicle-badge" style="background:${esc(color)}">${esc(a.vehicle)}</span>
      </div>
      <div class="dash-card-title">${esc(a.purpose || a.destination)}</div>
      <div class="dash-card-destination">📍 ${esc(a.destination)}</div>
      <div class="dash-card-meta">${datePart}${timePart}</div>
      ${picPart}
    </div>`;
}

function esc(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}

console.info('Driver Dashboard module loaded');
