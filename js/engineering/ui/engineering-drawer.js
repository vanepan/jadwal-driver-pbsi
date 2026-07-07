/* ============================================================
   ENGINEERING-DRAWER.JS — Assignment detail drawer (v1.20.1)

   The approved Executive detail drawer for one assignment: Summary · Priority
   · Status · Room · Category · Description · Engineering Members · Timeline ·
   Notes · Attachments (placeholder) · Verification · role-aware Actions.

   PURE render → HTML string. All actions are expressed as `data-act` hooks the
   center's delegated handler routes into the Assignment / Verification engines;
   nothing here mutates the store. Action visibility is gated by capability
   (canEng) + role + status, so every role sees exactly its command bar.
   ============================================================ */

'use strict';

import { STATUS, PARTICIPANT_STATUS } from '../config/engineering-config.js';
import { ENGINEERING_ROLE } from '../../config/role-registry.js';
import { isDeletable } from '../models/engineering-assignment.js';
import { resolveAssignedUsers } from '../personnel/engineering-personnel.js';
import {
  esc, icon, catTile, catMeta, statusPill, priorityTag, avatar,
  fmtDuration, workerElapsedMin, actualMinutes, activeParticipants,
} from './engineering-atoms.js';
import { renderTimeline } from './engineering-timeline.js';

const COMPLETED = new Set([STATUS.VERIFIED, STATUS.COMPLETED]);
const JOINABLE = new Set([STATUS.AVAILABLE, STATUS.IN_PROGRESS, STATUS.CONTINUE_TOMORROW]);

function findMine(a, me) {
  if (!me) return null;
  return (a.participants || []).find((p) => p.workerId === me.id || p.name === me.name) || null;
}

/** Designated personnel (assignedUsers) resolved to names from User Management. */
function assignedNames(a) {
  const uids = a && a.assignedUsers ? Object.keys(a.assignedUsers) : [];
  if (!uids.length) return '';
  return resolveAssignedUsers(uids).map((p) => p.name).join(', ');
}

function btn(act, label, iconName, opts = {}) {
  const cls = `eng-btn${opts.variant ? ` -${opts.variant}` : ''}${opts.big ? ' -big' : ''}${opts.tone ? ` -tone-${opts.tone}` : ''}`;
  const data = `data-act="${act}" data-id="${esc(opts.id)}"${opts.worker ? ` data-worker="${esc(opts.worker)}"` : ''}`;
  return `<button class="${cls}" ${data}>${icon(iconName, { size: opts.big ? 17 : 15 })}<span>${esc(label)}</span></button>`;
}

/** The role-aware command bar (drawer footer). */
function actionZone(a, ctx) {
  const { role, me, canEng } = ctx;
  const id = a.id;
  const mine = findMine(a, me);

  if (COMPLETED.has(a.status)) {
    return `<div class="eng-action-note -ok">${icon('check-circle', { size: 18 })} Terverifikasi dan ditutup</div>`;
  }

  // Engineering Member — personal work actions.
  if (role === ENGINEERING_ROLE.MEMBER) {
    if (mine && mine.status === PARTICIPANT_STATUS.WORKING) {
      return `<div class="eng-action-row">
        ${btn('eng-continue', 'Lanjutkan Besok', 'moon', { id, worker: me.id, big: true, tone: 'violet' })}
        ${btn('eng-finish', 'Selesaikan', 'check-circle', { id, worker: me.id, big: true, variant: 'primary' })}
      </div>`;
    }
    if (mine && mine.status === PARTICIPANT_STATUS.CONTINUE_TOMORROW) {
      return `<div class="eng-action-row">
        ${btn('eng-resume', 'Lanjutkan Pekerjaan', 'play', { id, worker: me.id, big: true, variant: 'primary' })}
        ${btn('eng-finish', 'Selesaikan', 'check-circle', { id, worker: me.id, big: true })}
      </div>`;
    }
    if (mine && mine.status === PARTICIPANT_STATUS.FINISHED) {
      return `<div class="eng-action-note -wait">${icon('clock', { size: 18 })} Pekerjaan Anda selesai · menunggu verifikasi</div>`;
    }
    if (a.status === STATUS.POSTPONED) {
      return `<div class="eng-action-note -muted">Penugasan ditunda oleh admin</div>`;
    }
    return `<div class="eng-action-row">${btn('eng-begin', 'Mulai Mengerjakan', 'play', { id, worker: me.id, big: true, variant: 'primary', block: true })}</div>`;
  }

  // Admin / Coordinator — supervisory command bar.
  const btns = [];
  if (a.status === STATUS.WAITING_VERIFICATION && canEng('eng.verify')) {
    btns.push(btn('eng-verify', 'Verifikasi Pekerjaan', 'check-circle', { id, big: true, variant: 'primary' }));
  }
  if (role === ENGINEERING_ROLE.COORDINATOR && JOINABLE.has(a.status) && canEng('eng.join')) {
    const joined = (a.participants || []).some((p) => (p.workerId === me.id || p.name === me.name) && p.status !== PARTICIPANT_STATUS.LEFT);
    if (!joined) btns.push(btn('eng-begin', 'Gabung', 'hand', { id, worker: me.id, big: true }));
  }
  if (a.status === STATUS.POSTPONED && canEng('eng.reopen')) {
    btns.push(btn('eng-reopen', 'Buka Kembali', 'reset', { id, big: true, variant: 'primary' }));
  } else if (!COMPLETED.has(a.status) && a.status !== STATUS.POSTPONED && canEng('eng.postpone')) {
    btns.push(btn('eng-postpone', 'Tunda Penugasan', 'x-circle', { id, big: true, tone: 'muted' }));
  }
  if (!btns.length) return `<div class="eng-action-note -muted">Tidak ada tindakan untuk peran ini.</div>`;
  return `<div class="eng-action-row">${btns.join('')}</div>`;
}

/**
 * Admin-only "danger zone" (v1.20.6, Objective 2). The SAME button either hard-
 * deletes an assignment that was never worked on, or cancels+archives one that
 * already has execution history — so analytics/timeline are always preserved.
 * The mode here is advisory; the center re-checks isDeletable() authoritatively.
 */
function deleteZone(a) {
  if (a.status === STATUS.ARCHIVED) return '';
  const hard = isDeletable(a);
  const label = hard ? 'Hapus Penugasan' : 'Batalkan & Arsipkan';
  const hint = hard
    ? 'Belum pernah dikerjakan — dapat dihapus permanen.'
    : 'Sudah memiliki riwayat — akan diarsipkan (riwayat & analitik dipertahankan).';
  return `<div class="eng-danger-zone">
    <button class="eng-btn -ghost -danger" data-act="eng-delete" data-id="${esc(a.id)}" data-mode="${hard ? 'hard' : 'archive'}">${icon(hard ? 'trash' : 'archive', { size: 15 })}<span>${esc(label)}</span></button>
    <span class="eng-danger-hint">${esc(hint)}</span>
  </div>`;
}

function memberRow(a, p, me, now) {
  const stMap = {
    [PARTICIPANT_STATUS.WORKING]: { l: 'Sedang bekerja', c: 'c-blue' },
    [PARTICIPANT_STATUS.CONTINUE_TOMORROW]: { l: 'Dilanjut besok', c: 'c-violet' },
    [PARTICIPANT_STATUS.FINISHED]: { l: 'Selesai', c: 'c-green' },
    [PARTICIPANT_STATUS.JOINED]: { l: 'Bergabung', c: 'c-green' },
  };
  const s = stMap[p.status] || { l: p.status, c: 'text-faint' };
  const isMe = me && (p.workerId === me.id || p.name === me.name);
  return `<div class="eng-member-row">
    ${avatar(p.name, 34)}
    <div class="eng-member-info">
      <div class="eng-member-name">${esc(p.name)}${isMe ? ' <span class="eng-muted-inline">· Anda</span>' : ''}</div>
      <div class="eng-member-state" style="color:var(--${s.c})">${p.status === PARTICIPANT_STATUS.WORKING ? '<span class="eng-pulse-dot"></span>' : ''}${esc(s.l)}</div>
    </div>
    <span class="eng-member-dur">${esc(fmtDuration(workerElapsedMin(p, now)))}</span>
  </div>`;
}

/**
 * Render the drawer. When `a` is null the scrim renders closed (for smooth
 * open/close transitions driven by CSS class).
 * @param {Object|null} a  the assignment
 * @param {Object} ctx     { role, me, canEng }
 * @returns {string} HTML
 */
export function renderDrawer(a, ctx) {
  if (!a) return `<div class="eng-scrim" data-act="eng-scrim"><div class="eng-drawer"></div></div>`;
  const now = ctx.now || Date.now();
  const cat = catMeta(a.category);
  const members = activeParticipants(a);
  const joinable = JOINABLE.has(a.status);

  const kv = (k, v, extra = '') => `<div class="eng-kv"><span class="eng-kv-k">${esc(k)}</span><span class="eng-kv-v" ${extra}>${v}</span></div>`;

  return `<div class="eng-scrim -open" data-act="eng-scrim">
    <div class="eng-drawer" data-stop="1">
      <div class="eng-drawer-head">
        <div class="eng-drawer-head-main">
          ${catTile(a.category, 46, 13)}
          <div class="eng-drawer-head-txt">
            <div class="eng-drawer-badges"><span class="eng-badge">${esc(a.assignmentNumber || a.id)}</span>${statusPill(a.status)}</div>
            <h2 class="eng-drawer-title">${esc(a.title)}</h2>
            <div class="eng-drawer-loc">${icon('pin', { size: 14 })} ${esc(a.location || [a.building, a.room].filter(Boolean).join(' · '))}</div>
          </div>
        </div>
        <button class="eng-icon-btn" data-act="eng-close-drawer" aria-label="Tutup">${icon('close', { size: 18 })}</button>
      </div>

      <div class="eng-drawer-body">
        <div class="eng-sec">
          <div class="eng-sec-t">Informasi</div>
          ${kv('Kategori', `<span style="color:var(--${cat.tone})">${esc(cat.label)}</span>`)}
          ${kv('Prioritas', priorityTag(a.priority, false))}
          ${a.requester ? kv('Pemohon', esc(a.requester)) : ''}
          ${a.dueDate ? kv('Target selesai', `<span${a.priority === 'critical' ? ' style="color:var(--crit)"' : ''}>${esc(a.dueDate)}</span>`) : ''}
          ${assignedNames(a) ? kv('Ditugaskan', esc(assignedNames(a))) : ''}
        </div>

        <div class="eng-sec">
          <div class="eng-sec-t">Engineering (${members.length})</div>
          <div class="eng-total-time">
            <span class="eng-total-num">${esc(fmtDuration(actualMinutes(a, now)))}</span>
            <span class="eng-total-cap">waktu kerja total lintas ${members.length} teknisi</span>
          </div>
          ${members.length === 0
            ? '<div class="eng-muted eng-pad-sm">Belum ada Engineering. Terbuka untuk semua teknisi.</div>'
            : members.map((p) => memberRow(a, p, ctx.me, now)).join('')}
          ${joinable ? `<div class="eng-joinable">${icon('hand', { size: 13 })} Masih bisa bergabung</div>` : ''}
        </div>

        <div class="eng-sec">
          <div class="eng-sec-t">Timeline Operasional</div>
          ${renderTimeline(a.timeline, { dense: true, now })}
        </div>

        <div class="eng-sec">
          <div class="eng-sec-t">Lampiran</div>
          <div class="eng-attach-placeholder">${icon('camera', { size: 18 })}<div><div class="eng-attach-t">Foto sebelum / sesudah</div><div class="eng-attach-s">Tersedia pada versi mendatang</div></div></div>
        </div>

        <div class="eng-sec">
          <div class="eng-sec-t">Catatan</div>
          <p class="eng-note-body">${esc(a.description || a.notes || '—')}</p>
        </div>

        ${a.verification && a.verification.verifierId ? `<div class="eng-sec">
          <div class="eng-sec-t">Verifikasi</div>
          ${kv('Diverifikasi oleh', esc(a.verification.verifierName || a.verification.verifierId))}
          ${a.verification.notes ? kv('Catatan', esc(a.verification.notes)) : ''}
        </div>` : ''}
      </div>

      <div class="eng-drawer-foot">${actionZone(a, ctx)}${ctx.canEng('eng.delete') ? deleteZone(a) : ''}</div>
    </div>
  </div>`;
}
