/* ============================================================
   ENGINEERING-TIMELINE.JS — Operational event history renderer (v1.20.1)

   Renders an assignment's embedded timeline (from the Timeline Engine) as the
   approved vertical event rail: time · node · actor · what happened · implied
   status. It is an operational HISTORY, never a schedule. Reused inside the
   detail drawer and the Timeline page cards.

   PURE: maps the real TIMELINE_EVENT types to display metadata and returns an
   escaped HTML string. No store writes, no DOM handles.
   ============================================================ */

'use strict';

import { TIMELINE_EVENT } from '../timeline/timeline-engine.js';
import { esc, icon, avatar } from './engineering-atoms.js';

/** event type → { icon, tone, label, status } (status = lifecycle it implies). */
const EVENT_META = {
  [TIMELINE_EVENT.CREATED]: { icon: 'note', tone: 'c-neutral', label: 'Penugasan dibuat' },
  [TIMELINE_EVENT.PUBLISHED]: { icon: 'bell', tone: 'c-neutral', label: 'Penugasan dipublikasikan', status: 'Menunggu Engineering' },
  [TIMELINE_EVENT.NOTIFICATION_SENT]: { icon: 'bell', tone: 'c-neutral', label: 'Notifikasi terkirim ke semua teknisi', status: 'Tersedia' },
  [TIMELINE_EVENT.WORKER_JOINED]: { icon: 'hand', tone: 'c-green', label: 'Bergabung ke penugasan', status: 'Sedang Berjalan' },
  [TIMELINE_EVENT.WORKER_LEFT]: { icon: 'x-circle', tone: 'text-faint', label: 'Keluar dari penugasan' },
  [TIMELINE_EVENT.STARTED]: { icon: 'play', tone: 'c-blue', label: 'Mulai mengerjakan', status: 'Sedang Berjalan' },
  [TIMELINE_EVENT.PAUSED]: { icon: 'moon', tone: 'c-violet', label: 'Dijeda' },
  [TIMELINE_EVENT.POSTPONED]: { icon: 'x-circle', tone: 'text-faint', label: 'Penugasan ditunda', status: 'Ditunda' },
  [TIMELINE_EVENT.CONTINUE_TOMORROW]: { icon: 'moon', tone: 'c-violet', label: 'Dilanjutkan besok', status: 'Dilanjutkan Besok' },
  [TIMELINE_EVENT.FINISHED]: { icon: 'check-circle', tone: 'c-green', label: 'Menyelesaikan pekerjaan', status: 'Menunggu Verifikasi' },
  [TIMELINE_EVENT.VERIFIED]: { icon: 'check-circle', tone: 'accent', label: 'Pekerjaan diverifikasi · ditutup', status: 'Terverifikasi' },
  [TIMELINE_EVENT.CANCELLED]: { icon: 'x-circle', tone: 'crit', label: 'Penugasan dibatalkan', status: 'Dibatalkan' },
  [TIMELINE_EVENT.ARCHIVED]: { icon: 'file', tone: 'text-faint', label: 'Diarsipkan' },
  [TIMELINE_EVENT.WORK_REPORT_SUBMITTED]: { icon: 'check-circle', tone: 'c-green', label: 'Laporan pekerjaan dicatat', status: 'Selesai' },
};
export const eventMeta = (type) => EVENT_META[type] || EVENT_META[TIMELINE_EVENT.PUBLISHED];

/** Same local calendar day? */
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Format an ISO timestamp for the timeline: HH:MM, "Kemarin HH:MM", or date. */
export function formatEventTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t), n = new Date(now);
  const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (sameDay(d, n)) return hh;
  const y = new Date(n.getTime() - 86400000);
  if (sameDay(d, y)) return `Kemarin ${hh}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hh}`;
}

const actorName = (e) => (e.actor && e.actor.name) ? e.actor.name : 'Sistem';
const reasonOf = (e) => (e.metadata && e.metadata.reason) || e.notes || '';

/**
 * Render a timeline (chronological event array) as the vertical rail.
 * @param {Array} events
 * @param {Object} [opts] { dense=false, now }
 * @returns {string} HTML
 */
export function renderTimeline(events, opts = {}) {
  const list = Array.isArray(events) ? events : [];
  const now = opts.now || Date.now();
  const dense = !!opts.dense;
  if (!list.length) return '<div class="eng-muted eng-pad-sm">Belum ada aktivitas.</div>';
  return `<div class="eng-tl${dense ? ' -dense' : ''}">${list.map((e, i) => {
    const m = eventMeta(e.type);
    const person = e.actor && e.actor.name && e.actor.name !== 'Sistem' ? e.actor.name : null;
    const reason = reasonOf(e);
    const last = i === list.length - 1;
    return `<div class="eng-tl-row">
      <div class="eng-tl-time">${esc(formatEventTime(e.timestamp, now))}</div>
      <div class="eng-tl-node">
        <span class="eng-tl-dot" data-tone="${m.tone}">${icon(m.icon, { size: dense ? 12 : 14, tone: m.tone })}</span>
        ${last ? '' : '<span class="eng-tl-line"></span>'}
      </div>
      <div class="eng-tl-body">
        <div class="eng-tl-label">${esc(m.label)}</div>
        <div class="eng-tl-meta">
          ${person ? avatar(person, 17) : ''}
          <span class="eng-tl-actor">${esc(actorName(e))}</span>
          ${m.status ? `<span class="eng-dot-sep">·</span><span class="eng-tl-status" style="color:var(--${m.tone})">${esc(m.status)}</span>` : ''}
        </div>
        ${reason ? `<div class="eng-tl-reason" data-warn="${/tunda|suku cadang|menunggu/i.test(reason)}">${/tunda|suku cadang|menunggu/i.test(reason) ? '<span class="eng-tl-reason-tag">Alasan</span>' : ''}<span>${esc(reason)}</span></div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}
