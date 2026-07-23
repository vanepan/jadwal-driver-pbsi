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
/** True when `r` is the PREVIOUS driver of an assignment.reassigned event
 *  (the one losing the assignment), not the new one. Matches on the stable
 *  username first, falling back to display name for legacy records that
 *  predate driverUsername stamping. */
const isPreviousDriver = (e, r) => {
  if (!r || !e.payload) return false;
  const p = e.payload;
  if (p.previousDriverUsername) return lc(r.username) === lc(p.previousDriverUsername);
  if (p.previousDriver) return lc(r.displayName) === lc(p.previousDriver);
  return false;
};

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

  // v1.25.x Driver Notification V2 (Part 2) — driver reassignment. ONE event,
  // TWO very different recipient perspectives: the previous driver (losing
  // it) and the new driver (gaining it, worded identically to
  // assignment.created so it reads the same either way).
  'assignment.reassigned': {
    title: (e, r) => (isPreviousDriver(e, r) ? 'Assignment Dialihkan' : 'Penugasan Baru'),
    body: (e, r) => {
      if (isPreviousDriver(e, r)) return 'Assignment Anda telah dialihkan ke driver lain.';
      if (isDriver(r)) return 'Anda mendapatkan penugasan baru.';
      return e.payload.driver ? `Driver ${e.payload.driver} telah ditugaskan.` : 'Penugasan dialihkan.';
    },
    telegram: (e, r) => {
      const p = e.payload;
      if (isPreviousDriver(e, r)) {
        return 'ℹ️ *Assignment Dialihkan*\n\n' +
          `*Tanggal:* ${fmtDate(p.previousDate || p.date)}\n` +
          `*Waktu:* ${p.previousStartTime || p.startTime || '-'} – ${p.previousEndTime || p.endTime || '-'}\n` +
          `*Tujuan:* ${p.previousDestination || p.destination || '-'}\n` +
          `*Kendaraan:* ${p.previousVehicle || p.vehicle || '-'}\n\n` +
          '_Assignment ini telah dialihkan ke driver lain oleh admin._';
      }
      return '🚗 *Penugasan Baru*\n\n' +
        `*Tanggal:* ${fmtDate(p.date)}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n` +
        `*Tujuan:* ${p.destination || '-'}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}\n\n` +
        '_Cek dashboard Anda untuk detail._';
    },
  },

  // v1.25.x Driver Notification V2 (Part 2/3) — a meaningful, non-reassignment
  // change (date/time-beyond-threshold/destination/vehicle). Always shows
  // what changed, not just the final state, when the previous values differ.
  'assignment.updated': {
    title: () => 'Jadwal Diperbarui',
    body: (e, r) => (isDriver(r)
      ? 'Jadwal penugasan Anda telah diperbarui.'
      : `Penugasan diperbarui oleh ${actorName(e)}.`),
    telegram: (e) => {
      const p = e.payload;
      const dateChanged = p.previousDate && p.previousDate !== p.date;
      const timeChanged = (p.previousStartTime && p.previousStartTime !== p.startTime)
        || (p.previousEndTime && p.previousEndTime !== p.endTime);
      const destChanged = p.previousDestination && p.previousDestination !== p.destination;
      const vehicleChanged = p.previousVehicle && p.previousVehicle !== p.vehicle;
      return '✏️ *Jadwal Assignment Diperbarui*\n\n' +
        `*Tujuan:* ${p.destination || '-'}${destChanged ? ` (sebelumnya ${p.previousDestination})` : ''}\n` +
        `*Tanggal:* ${fmtDate(p.date)}${dateChanged ? ` (sebelumnya ${fmtDate(p.previousDate)})` : ''}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}${timeChanged ? ` (sebelumnya ${p.previousStartTime || '-'} – ${p.previousEndTime || '-'})` : ''}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}${vehicleChanged ? ` (sebelumnya ${p.previousVehicle})` : ''}\n\n` +
        '_Silakan cek dashboard Anda untuk detail terbaru._';
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

  // v1.11.4 Reminder Engine — one template, copy branches on payload.offset.
  'assignment.reminder': {
    title: (e) => (e.payload.offset === 'H-1h' ? 'Pengingat: 1 Jam Lagi' : 'Pengingat: Besok'),
    body: (e) => {
      const p = e.payload;
      const when = p.offset === 'H-1h'
        ? `Tugas dimulai dalam 1 jam (${p.startTime || '-'})`
        : 'Anda memiliki tugas besok';
      return p.destination ? `${when} — ${p.destination}` : when;
    },
    telegram: (e) => {
      const p = e.payload;
      const head = p.offset === 'H-1h'
        ? '⏰ *Pengingat — 1 Jam Lagi*'
        : '🔔 *Pengingat — Besok*';
      return head + '\n\n' +
        `*Tanggal:* ${fmtDate(p.date)}\n` +
        `*Waktu:* ${p.startTime || '-'} – ${p.endTime || '-'}\n` +
        `*Tujuan:* ${p.destination || '-'}\n` +
        `*Kendaraan:* ${p.vehicle || '-'}\n` +
        `*Driver:* ${p.driver || '-'}\n\n` +
        (p.offset === 'H-1h'
          ? '🚗 Keberangkatan sebentar lagi. Siap-siap ya!'
          : '⏰ Jadwal Anda besok. Pastikan semua siap!');
    },
  },
};

/* ── Engineering Operations (v1.20.4) ──────────────────────────────────────
   In-app + push copy, recipient-agnostic (Engineering notifications fan out to
   coordinators/members/admins — no single "you" perspective). One helper builds
   the "Title — Gedung · Ruang. <action>" line from the payload. */
function engWhere(p) { return [p.building, p.room].filter(Boolean).join(' · '); }
function engLine(e, tail) {
  const p = e.payload || {};
  const head = [p.title, engWhere(p)].filter(Boolean).join(' — ');
  return head ? `${head}. ${tail}` : tail;
}

Object.assign(TEMPLATES, {
  'engineering.published': {
    title: () => 'Penugasan Engineering Baru',
    body: (e) => engLine(e, 'Penugasan baru tersedia — ketuk untuk bergabung.'),
  },
  'engineering.accepted': {
    title: () => 'Penugasan Dikerjakan',
    body: (e) => engLine(e, `${actorName(e)} mulai mengerjakan.`),
  },
  'engineering.joined': {
    title: () => 'Anggota Bergabung',
    body: (e) => engLine(e, `${actorName(e)} bergabung ke penugasan.`),
  },
  'engineering.resumed': {
    title: () => 'Penugasan Dilanjutkan',
    body: (e) => engLine(e, 'Pekerjaan dilanjutkan kembali.'),
  },
  'engineering.postponed': {
    title: () => 'Penugasan Ditunda',
    body: (e) => engLine(e, `Ditunda oleh ${actorName(e)}.`),
  },
  'engineering.completed': {
    title: () => 'Menunggu Verifikasi',
    body: (e) => engLine(e, 'Pekerjaan selesai — menunggu verifikasi.'),
  },
  'engineering.verified': {
    title: () => 'Penugasan Terverifikasi',
    body: (e) => engLine(e, `Diverifikasi oleh ${actorName(e)}.`),
  },
  'engineering.rejected': {
    title: () => 'Verifikasi Ditolak',
    body: (e) => engLine(e, 'Perlu perbaikan — dikembalikan untuk dikerjakan.'),
  },
  'engineering.cancelled': {
    title: () => 'Penugasan Dibatalkan',
    body: (e) => engLine(e, `Dibatalkan oleh ${actorName(e)}.`),
  },
});

/**
 * Build a deep-link target the PWA can resolve from a push click
 * ("/?view=assignment&id=ASG-…"). Derived from the canonical entity.
 */
function deepLink(event) {
  const ent = (event && event.entity) || {};
  if (!ent.kind || !ent.id) return '/';
  return `/?view=${encodeURIComponent(ent.kind)}&id=${encodeURIComponent(ent.id)}`;
}

/**
 * Render a notification for a recipient on a channel.
 *   telegram → { title, body, text:<rich Markdown> }
 *   push     → { title, body, text, data:{ type, url, entityId } }
 *   default  → { title, body, text:"title\nbody" }
 * @returns {{title:string, body:string, text:string, data?:Object}|null}
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
  if (channel === 'push') {
    const ent = ev.entity || {};
    // The SW collapses notifications by data.entityId (its `tag`). For
    // reminders, suffix the offset so H-1d and H-1h are independently
    // dismissable and don't collapse with lifecycle events on the same
    // assignment (REV2 §5.4). Navigation uses `url` (real entity) — so the
    // deep link is unaffected. No service-worker change required.
    let entityId = ent.id || null;
    if (type === 'assignment.reminder' && entityId && ev.payload && ev.payload.offset) {
      entityId = `${entityId}__${ev.payload.offset}`;
    }
    return {
      title, body, text: `${title}\n${body}`,
      data: { type, url: deepLink(ev), entityId },
    };
  }
  return { title, body, text: `${title}\n${body}` };
}

module.exports = { render, TEMPLATES, deepLink };
