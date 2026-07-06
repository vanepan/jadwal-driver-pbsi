/* ============================================================
   WIDGETS/REQUEST/INDEX.JS — v1.19.9 Executive Command Center

   Bidang (requesting unit) workspace widgets. Operational consumers: they
   monitor their own requests / approvals / assignments and create new
   requests. NO executive, prediction, recommendation, or fleet intelligence.

   All data comes from ctx.myRequests (the user's own requests, already
   filtered by the host) — requests carry requester, schedule, and (once
   approved) the assigned driver + vehicle, so the workspace is self-contained.
   ============================================================ */

'use strict';

import { esc, empty, lead, pill, metric, metricRow, listRow, list, actionBtn, actionGrid, placeholder } from '../_widget-base.js';
import { todayString, formatDateShort } from '../../utils.js';

const STATUS = {
  pending: { label: 'Menunggu', tone: 'warn' },
  approved: { label: 'Disetujui', tone: 'good' },
  assigned: { label: 'Dijadwalkan', tone: 'info' },
  started: { label: 'Berlangsung', tone: 'info' },
  completed: { label: 'Selesai', tone: 'neutral' },
  rejected: { label: 'Ditolak', tone: 'danger' },
  cancelled: { label: 'Dibatalkan', tone: 'neutral' },
};
const statusOf = (s) => STATUS[s] || { label: s || '—', tone: 'neutral' };
const byNewest = (a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);

/** The user's nearest upcoming request that has an assignment attached. */
function nextAssigned(reqs) {
  const today = todayString();
  return reqs
    .filter(r => (r.status === 'approved' || r.status === 'assigned' || r.status === 'started') && (r.startDate || '') >= today)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))[0] || null;
}

export const widgets = {
  /* My Requests — recent requests with live status. */
  'req-my-requests': {
    render(ctx) {
      const reqs = (ctx.myRequests || []).slice().sort(byNewest).slice(0, 5);
      if (!reqs.length) {
        return empty('Anda belum membuat permintaan.') +
          actionBtn('Ajukan Permintaan', 'openRequestFormModal', { variant: 'primary' });
      }
      const rows = reqs.map(r => {
        const st = statusOf(r.status);
        return listRow({
          title: r.purpose || r.destination || 'Permintaan',
          meta: `${r.startDate ? formatDateShort(r.startDate) : '—'} · ${r.fullDay ? 'Penuh Hari' : (r.startTime || '—')}`,
          trailing: st.label, tone: st.tone,
        });
      }).join('');
      return list(rows) + actionGrid([
        actionBtn('Ajukan Permintaan', 'openRequestFormModal', { variant: 'primary' }),
        actionBtn('Lihat Semua', 'openRequestsList', { variant: 'ghost' }),
      ]);
    },
  },

  /* Approval Status — counts by state. */
  'req-approval': {
    render(ctx) {
      const reqs = ctx.myRequests || [];
      const c = (s) => reqs.filter(r => r.status === s).length;
      const pending = c('pending');
      return metricRow(
        metric('Menunggu', pending, { tone: pending > 0 ? 'warn' : 'neutral' }) +
        metric('Disetujui', c('approved') + c('assigned') + c('started'), { tone: 'good' }) +
        metric('Ditolak', c('rejected'), { tone: c('rejected') > 0 ? 'danger' : 'neutral' })
      );
    },
  },

  /* Today's Schedule — my requests happening today. */
  'req-today': {
    render(ctx) {
      const today = todayString();
      const list_ = (ctx.myRequests || [])
        .filter(r => r.startDate === today && r.status !== 'rejected' && r.status !== 'cancelled')
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      if (!list_.length) return empty('Tidak ada jadwal hari ini.');
      return list(list_.map(r => listRow({
        title: r.purpose || r.destination || 'Kegiatan',
        meta: r.fullDay ? 'Penuh Hari' : `${r.startTime || '—'}–${r.endTime || '—'}`,
        trailing: statusOf(r.status).label, tone: statusOf(r.status).tone,
      })).join(''));
    },
  },

  /* Assigned Vehicle — from the nearest upcoming approved request. */
  'req-vehicle': {
    render(ctx) {
      const n = nextAssigned(ctx.myRequests || []);
      if (!n || !n.vehicle) return empty('Belum ada kendaraan ditugaskan.');
      return `<div class="wsp-assign">
        <div class="wsp-assign__value">${esc(n.vehicle)}</div>
        <div class="wsp-assign__meta">${esc(n.startDate ? formatDateShort(n.startDate) : '')} · ${esc(n.purpose || n.destination || '')}</div>
      </div>`;
    },
  },

  /* Assigned Driver — from the nearest upcoming approved request. */
  'req-driver': {
    render(ctx) {
      const n = nextAssigned(ctx.myRequests || []);
      if (!n || !n.driver) return empty('Belum ada driver ditugaskan.');
      return `<div class="wsp-assign">
        <div class="wsp-assign__value">${esc(n.driver)}</div>
        <div class="wsp-assign__meta">${esc(n.startDate ? formatDateShort(n.startDate) : '')} · ${esc(n.fullDay ? 'Penuh Hari' : (n.startTime || ''))}</div>
      </div>`;
    },
  },

  /* Announcements — reserved (no announcement subsystem yet). */
  'req-announcements': {
    render() { return placeholder('Belum ada pengumuman.'); },
  },

  /* Quick Request — the primary CTA for this role. */
  'req-quick': {
    render() {
      return lead('Butuh kendaraan? Ajukan permintaan baru.') +
        actionBtn('Ajukan Permintaan', 'openRequestFormModal', { variant: 'primary' });
    },
  },

  /* History — resolved / past requests. */
  'req-history': {
    render(ctx) {
      const today = todayString();
      const hist = (ctx.myRequests || [])
        .filter(r => r.status === 'completed' || r.status === 'rejected' || r.status === 'cancelled' || (r.startDate && r.startDate < today))
        .sort(byNewest).slice(0, 6);
      if (!hist.length) return empty('Belum ada riwayat permintaan.');
      return list(hist.map(r => listRow({
        title: r.purpose || r.destination || 'Permintaan',
        meta: r.startDate ? formatDateShort(r.startDate) : '—',
        trailing: statusOf(r.status).label, tone: statusOf(r.status).tone,
      })).join(''));
    },
  },

  /* Recent Activity — most recent request updates. */
  'req-activity': {
    render(ctx) {
      const reqs = (ctx.myRequests || []).slice().sort(byNewest).slice(0, 4);
      if (!reqs.length) return empty('Belum ada aktivitas.');
      return list(reqs.map(r => listRow({
        title: `${statusOf(r.status).label} — ${r.purpose || r.destination || 'Permintaan'}`,
        meta: r.startDate ? formatDateShort(r.startDate) : '', tone: statusOf(r.status).tone,
      })).join(''));
    },
  },
};
