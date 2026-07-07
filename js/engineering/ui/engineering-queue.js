/* ============================================================
   ENGINEERING-QUEUE.JS — Assignment Queue + shared Assignment Card (v1.20.1)

   The card-based Assignment Queue, auto-sorted by operational urgency, plus
   the AssignmentCard fragment reused across the dashboards. Cards surface
   priority · category · room · status · participants · current workers ·
   created · due · a role-aware primary action.

   PURE render → HTML. Data comes from the store (passed in). Actions are
   `data-act` hooks; the whole card is `data-act="eng-open"`.
   ============================================================ */

'use strict';

import { STATUS, PARTICIPANT_STATUS, PRIORITY } from '../config/engineering-config.js';
import { ENGINEERING_ROLE } from '../../config/role-registry.js';
import {
  esc, icon, catTile, priorityTag, statusPill,
  fmtDuration, actualMinutes, activeParticipants, workerStack,
} from './engineering-atoms.js';

const STATUS_RANK = {
  [STATUS.IN_PROGRESS]: 0, [STATUS.AVAILABLE]: 1, [STATUS.CONTINUE_TOMORROW]: 2,
  [STATUS.WAITING_VERIFICATION]: 3, [STATUS.POSTPONED]: 4,
  [STATUS.VERIFIED]: 5, [STATUS.COMPLETED]: 5,
};
const PRIO_RANK = { [PRIORITY.CRITICAL]: 0, [PRIORITY.HIGH]: 1, [PRIORITY.NORMAL]: 2, [PRIORITY.LOW]: 3 };

export function urgencyScore(a) {
  return (STATUS_RANK[a.status] ?? 9) * 10 + (PRIO_RANK[a.priority] ?? 9);
}

const DONE = new Set([STATUS.VERIFIED, STATUS.COMPLETED]);
export const canJoinTask = (a) => new Set([STATUS.AVAILABLE, STATUS.IN_PROGRESS, STATUS.CONTINUE_TOMORROW]).has(a.status);

/** The single searchable projection of an assignment — the one source of truth
 *  for both the in-module search and the global adaptive search. Covers title,
 *  building, room, location, id/number, category, status, priority, requester
 *  and every assigned member's name. */
export function searchableText(a) {
  const members = (a.participants || []).map((p) => p && p.name).filter(Boolean).join(' ');
  return [
    a.title, a.building, a.room, a.location, a.assignmentNumber, a.id,
    a.category, a.status, a.priority, a.requester, members,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function targetTone(a) {
  if (DONE.has(a.status)) return 'c-green';
  if (a.priority === PRIORITY.CRITICAL) return 'crit';
  if (String(a.dueDate).indexOf('Ditunda') === 0) return 'text-faint';
  return 'text-dim';
}

export function urgencyBadges(a) {
  const b = [];
  if (DONE.has(a.status) || a.status === STATUS.POSTPONED) return b;
  if (a.priority === PRIORITY.CRITICAL) b.push({ label: 'Critical', tone: 'crit' });
  else if (a.priority === PRIORITY.HIGH) b.push({ label: 'Prioritas Tinggi', tone: 'c-amber' });
  if (String(a.dueDate).indexOf('Hari ini') === 0) b.push({ label: 'Deadline Hari Ini', tone: 'c-amber' });
  return b;
}

export function opsContextLine(a) {
  if (DONE.has(a.status) || a.status === STATUS.POSTPONED) return null;
  const list = activeParticipants(a);
  const active = list.filter((p) => p.status === PARTICIPANT_STATUS.WORKING).length;
  const paused = list.filter((p) => p.status === PARTICIPANT_STATUS.CONTINUE_TOMORROW).length;
  if (active === 0 && paused === 0) return { text: 'Belum ada Engineering', tone: 'text-faint', icon: 'wrench' };
  if (active > 0) return { text: `${active} Engineering sedang bekerja`, tone: 'c-blue', icon: 'play' };
  return { text: `${paused} Engineering menunggu lanjut`, tone: 'c-violet', icon: 'moon' };
}

function findMine(a, me) {
  if (!me) return null;
  return (a.participants || []).find((p) => p.workerId === me.id || p.name === me.name) || null;
}

/** The small primary action on a card, role-aware. */
function cardAction(a, ctx) {
  const { role, me } = ctx;
  const id = a.id;
  const b = (act, label, iconName, variant, worker) =>
    `<button class="eng-btn -sm${variant ? ` -${variant}` : ''}" data-act="${act}" data-id="${esc(id)}"${worker ? ` data-worker="${esc(worker)}"` : ''}>${icon(iconName, { size: 13 })}<span>${esc(label)}</span></button>`;

  if (role === ENGINEERING_ROLE.MEMBER) {
    if (DONE.has(a.status) || a.status === STATUS.POSTPONED) return '';
    const mine = findMine(a, me);
    if (mine && mine.status === PARTICIPANT_STATUS.WORKING) return b('eng-continue', 'Lanjut Besok', 'moon', 'tone-violet', me.id);
    if (mine && mine.status === PARTICIPANT_STATUS.CONTINUE_TOMORROW) return b('eng-resume', 'Lanjutkan', 'play', 'primary', me.id);
    if (mine && mine.status === PARTICIPANT_STATUS.FINISHED) return `<span class="eng-wait-inline">${icon('clock', { size: 14 })} Menunggu verifikasi</span>`;
    return b('eng-begin', 'Mulai Mengerjakan', 'play', 'primary', me.id);
  }
  if (a.status === STATUS.WAITING_VERIFICATION && ctx.canEng('eng.verify')) return b('eng-verify', 'Verifikasi', 'check-circle', 'primary');
  return b('eng-open', 'Detail', 'arrow-right', 'ghost');
}

/**
 * One assignment card.
 * @param {Object} a
 * @param {Object} ctx { role, me, canEng, now }
 */
export function renderAssignmentCard(a, ctx) {
  const now = ctx.now || Date.now();
  const crit = a.priority === PRIORITY.CRITICAL && !DONE.has(a.status);
  const badges = urgencyBadges(a);
  const ctxLine = opsContextLine(a);
  const loc = a.location || [a.building, a.room].filter(Boolean).join(' · ');
  return `<div class="eng-card" data-act="eng-open" data-id="${esc(a.id)}" role="button" tabindex="0">
    ${crit ? '<span class="eng-card-crit"></span>' : ''}
    <div class="eng-card-top">
      ${catTile(a.category, 42)}
      <div class="eng-card-main">
        <div class="eng-card-line1">
          ${priorityTag(a.priority)}
          <span class="eng-card-id">${esc(a.assignmentNumber || a.id)}</span>
          <span class="eng-flex1"></span>
          ${statusPill(a.status)}
        </div>
        <div class="eng-card-title">${esc(a.title)}</div>
        <div class="eng-card-loc">${icon('pin', { size: 13 })} <span>${esc(loc)}</span></div>
        ${badges.length ? `<div class="eng-card-badges">${badges.map((x) => `<span class="eng-ubadge" data-tone="${x.tone}">${esc(x.label)}</span>`).join('')}</div>` : ''}
        ${ctxLine ? `<div class="eng-card-ctx" style="color:var(--${ctxLine.tone})">${icon(ctxLine.icon, { size: 13 })} ${esc(ctxLine.text)}${canJoinTask(a) ? '<span class="eng-dot-sep">·</span><span class="eng-muted-inline">Masih bisa bergabung</span>' : ''}</div>` : ''}
      </div>
    </div>
    <div class="eng-card-foot">
      <div class="eng-card-foot-left">
        ${workerStack(a.participants, 26)}
        ${activeParticipants(a).length > 0 && a.status === STATUS.IN_PROGRESS ? `<span class="eng-card-dur">${esc(fmtDuration(actualMinutes(a, now)))}</span>` : ''}
      </div>
      <span class="eng-flex1"></span>
      ${a.dueDate ? `<span class="eng-card-target" style="color:var(--${targetTone(a)})">${icon('clock', { size: 13 })} ${esc(a.dueDate)}</span>` : ''}
      ${cardAction(a, ctx)}
    </div>
  </div>`;
}

const CAT_FILTERS = [
  ['all', 'Semua'], ['ac-maintenance', 'AC'], ['kelistrikan', 'Kelistrikan'],
  ['plumbing', 'Plumbing'], ['pompa', 'Pompa'], ['hydrant', 'Hydrant'],
];

/**
 * The Assignment Queue screen.
 * @param {Array} assignments  all assignments (from store)
 * @param {Object} ctx { role, me, canEng, now, filters }
 */
export function renderQueue(assignments, ctx) {
  const f = ctx.filters || {};
  const catFilter = f.cat || 'all';
  const q = (f.q || '').toLowerCase();

  let rows = assignments.filter((a) => !DONE.has(a.status) && a.status !== STATUS.ARCHIVED && a.status !== STATUS.CANCELLED);
  if (catFilter !== 'all') rows = rows.filter((a) => a.category === catFilter);
  if (q) rows = rows.filter((a) => searchableText(a).includes(q));
  rows = rows.slice().sort((x, y) => urgencyScore(x) - urgencyScore(y));

  const chips = CAT_FILTERS.map(([k, l]) => `<button class="eng-chip" data-on="${catFilter === k}" data-act="eng-filter-cat" data-val="${k}">${esc(l)}</button>`).join('');

  return `<div class="eng-screen">
    ${pageHeader('ENGINEERING OPERATIONS', 'Antrean Penugasan', 'Semua penugasan terbuka diurutkan otomatis menurut urgensi operasional — yang paling mendesak di atas.')}
    <div class="eng-filterbar">
      <div class="eng-search"><input type="search" class="eng-search-input" data-act="eng-search" value="${esc(f.q || '')}" placeholder="Cari penugasan, lokasi, ID…" /></div>
      <div class="eng-chips">${chips}</div>
    </div>
    <div class="eng-level">
      ${sectionHeader('ANTREAN', 'Urutan Operasional', `${rows.length} penugasan aktif`)}
      ${rows.length === 0
        ? emptyState('Tidak ada penugasan', 'Tidak ada penugasan pada filter ini.')
        : `<div class="eng-card-grid">${rows.map((a) => renderAssignmentCard(a, ctx)).join('')}</div>`}
    </div>
  </div>`;
}

/* ── shared header/empty helpers (used across screens) ────────────────── */
export function pageHeader(crumb, title, lede, actions = '') {
  return `<div class="eng-page-head">
    <div class="eng-page-head-txt">
      <div class="eng-page-crumb">${esc(crumb)}</div>
      <h1 class="eng-page-title">${esc(title)}</h1>
      ${lede ? `<p class="eng-page-lede">${esc(lede)}</p>` : ''}
    </div>
    ${actions ? `<div class="eng-page-actions">${actions}</div>` : ''}
  </div>`;
}

export function sectionHeader(tag, title, subtitle = '', action = '') {
  return `<div class="eng-sec-head">
    <div><span class="eng-sec-tag">${esc(tag)}</span><div class="eng-sec-title">${esc(title)}</div></div>
    ${subtitle ? `<span class="eng-sec-sub">${esc(subtitle)}</span>` : ''}
    ${action}
  </div>`;
}

export function emptyState(title, hint) {
  return `<div class="eng-empty"><div class="eng-empty-t">${esc(title)}</div><div class="eng-empty-h">${esc(hint)}</div></div>`;
}
