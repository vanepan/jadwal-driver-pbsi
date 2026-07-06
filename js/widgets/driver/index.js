/* ============================================================
   WIDGETS/DRIVER/INDEX.JS — v1.19.9 Executive Command Center

   Driver workspace widgets — a daily task board. Drivers only see today's
   work: assignment, vehicle, schedule, trip timeline, reminder, history.
   NO executive / prediction / recommendation / simulation / petty cash.

   Assignment buckets come from getDriverAssignmentBuckets() in
   driver-dashboard.js (the SAME logic the driver dashboard renders — reused,
   not duplicated). Rows deep-link into the existing detail modal via the
   renderer's data-wsp-detail delegation.
   ============================================================ */

'use strict';

import { esc, empty, lead, listRow, list, placeholder } from '../_widget-base.js';
import { formatDateShort, vehicleLabel } from '../../utils.js';
import { getDriverAssignmentBuckets } from '../../driver-dashboard.js';

const STATUS = {
  assigned: { label: 'Dijadwalkan', tone: 'info' },
  started: { label: 'Berlangsung', tone: 'good' },
  completed: { label: 'Selesai', tone: 'neutral' },
  cancelled: { label: 'Dibatalkan', tone: 'neutral' },
};
const statusOf = (s) => STATUS[s] || { label: s || '—', tone: 'neutral' };

function timeLabel(a) {
  return a.fullDay ? 'Penuh Hari' : `${a.startTime || '—'}–${a.endTime || '—'}`;
}
function assignmentRow(a, { showDate = false } = {}) {
  const st = statusOf(a.status);
  const meta = `${showDate && a.date ? formatDateShort(a.date) + ' · ' : ''}${timeLabel(a)}`;
  return listRow({
    title: a.purpose || a.destination || 'Penugasan',
    meta, trailing: st.label, tone: st.tone, detailId: a.id,
  });
}
const buckets = (ctx) => getDriverAssignmentBuckets(ctx.myAssignments || []);

export const widgets = {
  /* Today's Assignment — active + today's work, front and center. */
  'drv-today': {
    render(ctx) {
      const { active, today } = buckets(ctx);
      const items = [...active, ...today];
      if (!items.length) return empty('Tidak ada tugas untuk hari ini.');
      return list(items.map(a => assignmentRow(a)).join(''));
    },
  },

  /* Assigned Vehicle — the vehicle for the current/next trip. */
  'drv-vehicle': {
    render(ctx) {
      const { active, today, upcoming } = buckets(ctx);
      const a = active[0] || today[0] || upcoming[0];
      if (!a || !a.vehicle) return empty('Belum ada kendaraan ditugaskan.');
      return `<div class="wsp-assign">
        <div class="wsp-assign__value">${esc(vehicleLabel(a.vehicle))}</div>
        <div class="wsp-assign__meta">${esc(a.date ? formatDateShort(a.date) : '')} · ${esc(timeLabel(a))}</div>
      </div>`;
    },
  },

  /* Today's Schedule — today's assignments as a compact time list. */
  'drv-schedule': {
    render(ctx) {
      const { today } = buckets(ctx);
      if (!today.length) return empty('Tidak ada jadwal hari ini.');
      return list(today.map(a => listRow({
        title: a.purpose || a.destination || 'Kegiatan', meta: timeLabel(a),
        tone: 'info', detailId: a.id,
      })).join(''));
    },
  },

  /* Trip Timeline — the ordered flow: active → today → next upcoming. */
  'drv-timeline': {
    render(ctx) {
      const { active, today, upcoming } = buckets(ctx);
      const seq = [...active, ...today, ...upcoming.slice(0, 3)];
      if (!seq.length) return empty('Belum ada perjalanan terjadwal.');
      return list(seq.map(a => assignmentRow(a, { showDate: true })).join(''));
    },
  },

  /* Reminder — the single most relevant next thing. */
  'drv-reminder': {
    render(ctx) {
      const { active, today, upcoming } = buckets(ctx);
      if (active.length) return lead(`Sedang berlangsung: ${active[0].purpose || active[0].destination || 'perjalanan'} (${timeLabel(active[0])}).`);
      const next = today[0] || upcoming[0];
      if (next) return lead(`Berikutnya: ${next.purpose || next.destination || 'penugasan'} — ${next.date ? formatDateShort(next.date) : ''} ${timeLabel(next)}.`);
      return empty('Tidak ada pengingat.');
    },
  },

  /* Quick Actions — driver-relevant jumps (read-only role). */
  'drv-quick': {
    render() {
      return placeholder('Aksi cepat akan ditambahkan.');
    },
  },

  /* Reimbursement — reserved (no driver-facing reimbursement flow yet). */
  'drv-reimbursement': {
    render() { return placeholder('Belum ada reimbursement.'); },
  },

  /* History — completed / past trips, clickable to detail. */
  'drv-history': {
    render(ctx) {
      const { history } = buckets(ctx);
      if (!history.length) return empty('Belum ada riwayat penugasan.');
      return list(history.slice(0, 6).map(a => assignmentRow(a, { showDate: true })).join(''));
    },
  },
};
