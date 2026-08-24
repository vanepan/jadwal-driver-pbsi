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

/* V1 Redesign Phase 8 (v1.30.9.20) — "Sarpras Engineering.dc.html" specifies
   a numbered lifecycle stepper (Join/Start/Finish/Postpone/Verify) in the
   work-order detail view, "its own component, visually distinct from the
   Assignment Board's trip-lifecycle chip — same tokens, different shape."
   Confirmed no such component existed anywhere before this change. Postpone
   is a BRANCH off "Started" (an assignment goes Start->Finish OR
   Start->Postpone, never both), not a strict 5th sequential milestone — the
   mockup's own example only ever fills steps 1-2 and leaves 3-5 upcoming,
   so this reads the current status into a single "furthest reached" stage
   and highlights 1..stage, exactly matching that visual, rather than
   inventing parallel-track semantics the mockup doesn't actually show. */
const LIFECYCLE_STEPS = ['Join', 'Start', 'Finish', 'Postpone', 'Verify'];
function lifecycleStage(status) {
  if (status === STATUS.POSTPONED) return 4;
  if (COMPLETED.has(status)) return 5;
  if (status === STATUS.WAITING_VERIFICATION) return 3;
  if (status === STATUS.IN_PROGRESS || status === STATUS.CONTINUE_TOMORROW) return 2;
  return 1; // AVAILABLE — the drawer only opens for an already-existing work order
}
function renderLifecycleStepper(a) {
  const stage = lifecycleStage(a.status);
  return `<div class="eng-stepper">${LIFECYCLE_STEPS.map((label, i) => {
    const n = i + 1;
    const reached = n <= stage;
    return `<div class="eng-stepper-step" data-reached="${reached}">
      <span class="eng-stepper-num">${n}</span>
      <span class="eng-stepper-label">${esc(label)}</span>
    </div>`;
  }).join('')}</div>`;
}

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

/* Design System Program Phase 10 (Canonical Drawer Migration): actionZone()
   used to return a full HTML string (icon buttons + tone/big styling) for
   the drawer's own hand-rolled fixed footer. The canonical shell's footer
   slot (js/components/drawer.js's openDrawer({footer})) only renders plain
   label+action+variant('primary'|'danger') buttons — no icon slot, no
   'tone'/'big' modifiers. Split in two: actionButtons() returns the real
   button DESCRIPTORS for genuine action states (still a real, always-
   visible footer — sticky-pinned action visibility is preserved, only the
   icon/tone/big cosmetic styling is not); actionNote() returns the
   message-only states (nothing to click) as a body block instead, since
   the footer slot can't render plain text. This is a disclosed, narrow
   cosmetic simplification, not a functional loss — every action still has
   a clear Indonesian label and still fires the exact same engine call. */
function actionButtons(a, ctx) {
  const { role, me, canEng } = ctx;
  const mine = findMine(a, me);
  if (COMPLETED.has(a.status)) return [];

  if (role === ENGINEERING_ROLE.MEMBER) {
    if (mine && mine.status === PARTICIPANT_STATUS.WORKING) {
      return [
        { label: 'Lanjutkan Besok', action: 'eng-continue' },
        { label: 'Selesaikan', action: 'eng-finish', variant: 'primary' },
      ];
    }
    if (mine && mine.status === PARTICIPANT_STATUS.CONTINUE_TOMORROW) {
      return [
        { label: 'Lanjutkan Pekerjaan', action: 'eng-resume', variant: 'primary' },
        { label: 'Selesaikan', action: 'eng-finish' },
      ];
    }
    if (mine && mine.status === PARTICIPANT_STATUS.FINISHED) return [];
    if (a.status === STATUS.POSTPONED) return [];
    return [{ label: 'Mulai Mengerjakan', action: 'eng-begin', variant: 'primary' }];
  }

  // Admin / Coordinator — supervisory command bar.
  const btns = [];
  if (a.status === STATUS.WAITING_VERIFICATION && canEng('eng.verify')) {
    btns.push({ label: 'Verifikasi Pekerjaan', action: 'eng-verify', variant: 'primary' });
  }
  if (role === ENGINEERING_ROLE.COORDINATOR && JOINABLE.has(a.status) && canEng('eng.join')) {
    const joined = (a.participants || []).some((p) => (p.workerId === me.id || p.name === me.name) && p.status !== PARTICIPANT_STATUS.LEFT);
    if (!joined) btns.push({ label: 'Gabung', action: 'eng-begin' });
  }
  if (a.status === STATUS.POSTPONED && canEng('eng.reopen')) {
    btns.push({ label: 'Buka Kembali', action: 'eng-reopen', variant: 'primary' });
  } else if (!COMPLETED.has(a.status) && a.status !== STATUS.POSTPONED && canEng('eng.postpone')) {
    btns.push({ label: 'Tunda Penugasan', action: 'eng-postpone' });
  }
  return btns;
}

/** The message-only states actionButtons() has no buttons for — rendered
 *  as a body block (see the Phase 10 comment above actionButtons()). */
function actionNote(a, ctx) {
  const { role, me } = ctx;
  const mine = findMine(a, me);
  if (COMPLETED.has(a.status)) return `<div class="eng-action-note -ok">${icon('check-circle', { size: 18 })} Terverifikasi dan ditutup</div>`;
  if (role === ENGINEERING_ROLE.MEMBER) {
    if (mine && mine.status === PARTICIPANT_STATUS.FINISHED) return `<div class="eng-action-note -wait">${icon('clock', { size: 18 })} Pekerjaan Anda selesai · menunggu verifikasi</div>`;
    if (a.status === STATUS.POSTPONED) return `<div class="eng-action-note -muted">Penugasan ditunda oleh admin</div>`;
    return '';
  }
  return actionButtons(a, ctx).length ? '' : `<div class="eng-action-note -muted">Tidak ada tindakan untuk peran ini.</div>`;
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
  // data-drawer-action (not data-act): this button lives in the canonical
  // drawer's body, which openDrawer() appends to document.body — outside
  // this module's own `host` element its data-act delegation is scoped
  // to. data-drawer-action routes through the SAME onAction callback the
  // real footer buttons use (js/components/drawer.js dispatches it
  // anywhere inside the drawer, not just the footer slot).
  return `<div class="eng-danger-zone">
    <button class="eng-btn -ghost -danger" data-drawer-action="eng-delete">${icon(hard ? 'trash' : 'archive', { size: 15 })}<span>${esc(label)}</span></button>
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
 * Design System Program Phase 10 (Canonical Drawer Migration): used to
 * return a full HTML shell string (.eng-scrim/.eng-drawer, its own close
 * button, its own fixed footer). Now returns the pieces
 * js/components/drawer.js's openDrawer()/refreshDrawerBody() consume — the
 * shell (scrim, header, close button, focus trap, focus restore, body
 * scroll lock, safe-area, swipe-dismiss) is that module's job now, none of
 * which this file ever implemented itself (see the Phase 10 migration
 * map — this drawer had NONE of those before). The category tile + badges
 * that used to sit in the shell's own header now render as the first
 * block of the body — the canonical `subtitle` slot is plain escaped
 * text, not markup, so it can't host the colored status pill or the
 * category-tile image; `subtitle` is used instead for the one genuinely
 * plain-text header line (location), which fits it exactly.
 * @param {Object|null} a  the assignment (null/not-found → a message body)
 * @param {Object} ctx     { role, me, canEng }
 * @returns {{ title: string, subtitle: string, body: string, footer: Array }}
 */
export function renderDrawer(a, ctx) {
  if (!a) return { title: 'Penugasan tidak ditemukan', subtitle: '', body: '<div class="eng-muted eng-pad-sm">Penugasan ini mungkin sudah dihapus atau diarsipkan.</div>', footer: [] };
  const now = ctx.now || Date.now();
  const cat = catMeta(a.category);
  const members = activeParticipants(a);
  const joinable = JOINABLE.has(a.status);

  const kv = (k, v, extra = '') => `<div class="eng-kv"><span class="eng-kv-k">${esc(k)}</span><span class="eng-kv-v" ${extra}>${v}</span></div>`;

  const headBlock = `<div class="eng-drawer-head-main eng-mb">
    ${catTile(a.category, 46, 13)}
    <div class="eng-drawer-head-txt">
      <div class="eng-drawer-badges"><span class="eng-badge">${esc(a.assignmentNumber || a.id)}</span>${statusPill(a.status)}</div>
    </div>
  </div>`;

  const body = `
    ${headBlock}
    ${renderLifecycleStepper(a)}
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

    ${actionNote(a, ctx)}
    ${ctx.canEng('eng.delete') ? deleteZone(a) : ''}`;

  return {
    title: a.title,
    subtitle: a.location || [a.building, a.room].filter(Boolean).join(' · '),
    body,
    footer: actionButtons(a, ctx),
  };
}
