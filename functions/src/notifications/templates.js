'use strict';

/* ============================================================
   notifications/templates.js — single source of notification wording

   Unifies the two template sets that drifted apart:
     • js/notifications.js ACTION_META   (in-app, short)
     • js/notification-service.js build*Message  (Telegram, rich)

   render(type, event, recipient, channel) → { title, body, text }

     title / body  — channel-agnostic, recipient-perspective-aware
                     (driver vs admin vs requester). Stored on the
                     notification record.
     text          — the channel-specific payload. For telegram this
                     is the rich Markdown message; otherwise it is
                     "title\nbody".

   Recipient perspective is allowed (objective Phase 3): the driver
   sees "Anda mendapatkan penugasan baru"; an admin sees "Penugasan
   baru dibuat". No wording lives anywhere else.
   ============================================================ */

/* ── Date helpers (Node full-ICU → id-ID locale available) ── */
function fmtDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const [y, m, d] = String(dateStr).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return String(dateStr); }
}

function dateRange(p) {
  const start = p.startDate || p.date || '';
  const end = p.endDate || start;
  if (!start) return '-';
  return start === end ? fmtDate(start) : `${fmtDate(start)} → ${fmtDate(end)}`;
}

/* ── Perspective helpers ── */
const lc = (v) => String(v || '').trim().toLowerCase();
const isDriver = (r) => Boolean(r && r.role === 'driver');
const isRequester = (e, r) => Boolean(r && e.payload && lc(r.username) === lc(e.payload.requesterId));
const actorName = (e) => (e.actor && e.actor.displayName) || '-';

/* ── Template table (keyed by canonical event type) ── */
const TEMPLATES = {
  'assignment.created': {
    title: () => 'Penugasan Baru',
    body: (e, r) => isDriver(r)
      ? 'Anda mendapatkan penugasan baru'
      : (e.payload.driver ? `Driver ${e.payload.driver} telah ditugaskan.` : 'Penugasan baru dibuat'),
    telegram: (e) => {
      const p = e.payload;
      return '🚗 *Assignment Baru*\n\n' +
        `*Tanggal:* ${fmtDate(p.date)}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n` +
        `*Tujuan:* ${p.destination || '-'}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}\n` +
        `*Driver:* ${p.driver || '-'}\n\n` +
        '_Cek dashboard Anda untuk detail._';
    },
  },

  'assignment.started': {
    title: () => 'Penugasan Dimulai',
    body: () => 'Penugasan telah dimulai.',
    telegram: (e) => {
      const p = e.payload;
      return '▶️ *Penugasan Dimulai*\n\n' +
        `*Tujuan:* ${p.destination || '-'}\n` +
        `*Driver:* ${p.driver || '-'}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n`;
    },
  },

  'assignment.completed': {
    title: () => 'Pengantaran Selesai',
    body: (e, r) => isDriver(r)
      ? 'Penugasan Anda telah selesai.'
      : (e.payload.driver ? `Driver ${e.payload.driver} telah menyelesaikan penugasan.` : 'Penugasan telah diselesaikan.'),
    telegram: (e) => {
      const p = e.payload;
      return '✔️ *Pengantaran Selesai*\n\n' +
        `*Tujuan:* ${p.destination || '-'}\n` +
        `*Tanggal:* ${fmtDate(p.date)}\n` +
        `*Driver:* ${p.driver || '-'}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}\n`;
    },
  },

  'assignment.cancelled': {
    title: () => 'Assignment Dibatalkan',
    body: (e) => `Assignment dibatalkan oleh ${actorName(e)}.`,
    telegram: (e) => {
      const p = e.payload;
      return '🚫 *Assignment Dibatalkan*\n\n' +
        `*Tujuan:* ${p.destination || '-'}\n` +
        `*Tanggal:* ${fmtDate(p.date)}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n` +
        `*Driver:* ${p.driver || '-'}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}\n` +
        `*Dibatalkan oleh:* ${actorName(e)}\n` +
        `*Alasan:* ${p.cancellationReason || '-'}\n`;
    },
  },

  'request.created': {
    title: () => 'Request Baru',
    body: (e, r) => isRequester(e, r)
      ? 'Request Anda telah dikirim.'
      : `${e.payload.requesterName || 'Seseorang'} mengajukan request driver`,
    telegram: (e) => {
      const p = e.payload;
      return '📋 *Request Jadwal Baru*\n\n' +
        `*Dari:* ${p.requesterName || '-'}\n` +
        `*Keperluan:* ${p.purpose || '-'}\n` +
        `*Tanggal:* ${dateRange(p)}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}\n\n` +
        '_Silakan login untuk approve/reject._';
    },
  },

  'request.approved': {
    title: () => 'Request Disetujui',
    body: (e, r) => isRequester(e, r)
      ? `Request Anda disetujui. Driver: ${e.payload.driver || 'TBD'}`
      : `Request disetujui oleh ${actorName(e)}`,
    telegram: (e) => {
      const p = e.payload;
      return '✅ *Request Jadwal Disetujui*\n\n' +
        `*Keperluan:* ${p.purpose || '-'}\n` +
        `*Tanggal:* ${dateRange(p)}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n` +
        `*Driver:* ${p.driver || 'TBD'}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}\n\n` +
        '✨ Jadwal Anda telah dikonfirmasi!';
    },
  },

  'request.rejected': {
    title: () => 'Request Ditolak',
    body: (e, r) => isRequester(e, r)
      ? 'Request Anda ditolak.'
      : `Request ditolak oleh ${actorName(e)}`,
    telegram: (e) => {
      const p = e.payload;
      return '❌ *Request Jadwal Ditolak*\n\n' +
        `*Keperluan:* ${p.purpose || '-'}\n` +
        `*Tanggal:* ${dateRange(p)}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n\n` +
        '_Silakan buat request baru atau hubungi admin._';
    },
  },

  'comment.added': {
    title: () => 'Komentar Baru',
    body: (e) => `${actorName(e)} menambahkan komentar`,
    telegram: (e) => {
      const p = e.payload;
      return '💬 *Komentar Baru*\n\n' +
        `*Request:* ${p.purpose || '-'}\n` +
        `*Oleh:* ${actorName(e)}\n`;
    },
  },
};

/**
 * Render a notification for a recipient on a channel.
 * @returns {{title:string, body:string, text:string}|null}
 */
function render(type, event, recipient, channel) {
  const t = TEMPLATES[type];
  if (!t) return null;
  const ev = event || {};
  ev.payload = ev.payload || {};
  const title = t.title(ev, recipient);
  const body = t.body(ev, recipient);
  if (channel === 'telegram' && typeof t.telegram === 'function') {
    return { title, body, text: t.telegram(ev, recipient) };
  }
  return { title, body, text: `${title}\n${body}` };
}

module.exports = { render, TEMPLATES };
