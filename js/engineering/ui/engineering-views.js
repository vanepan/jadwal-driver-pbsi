/* ============================================================
   ENGINEERING-VIEWS.JS — Timeline page · History · Analytics · Settings
   (v1.20.1)

   The remaining approved screens, all PURE render → HTML:
     • renderTimelinePage — task-centric operational activity (expandable cards)
     • renderHistory       — archived (verified/postponed) assignments, filterable
     • renderAnalytics     — Admin only; renders ONLY the Analytics Provider
                             snapshot (no metric math here) + a verification list
     • renderSettings      — Admin only; renders editable settings + roadmap
                             placeholders (Spare Parts / SLA / Bidang Request /
                             Preventive Maintenance)
   ============================================================ */

'use strict';

import { STATUS, PRIORITY } from '../config/engineering-config.js';
import { ENGINEERING_ROLE } from '../../config/role-registry.js';
import {
  getEnabledCategories, getNotificationPreferences,
  getVerificationRules,
} from '../settings/engineering-settings.js';
import {
  esc, icon, catTile, catMeta, prioMeta, statusPill, priorityTag,
  fmtDuration, actualMinutes, workerStack, activeParticipants, isMyAssignment,
} from './engineering-atoms.js';
import { renderTimeline, eventMeta, formatEventTime } from './engineering-timeline.js';
import { pageHeader, sectionHeader, emptyState, renderAssignmentCard } from './engineering-queue.js';
import { resolveAssignedUsers } from '../personnel/engineering-personnel.js';

/** Short comma-joined display of designated personnel (resolved from Users). */
function personnelNames(record) {
  const uids = record && record.assignedUsers ? Object.keys(record.assignedUsers) : [];
  if (!uids.length) return '';
  return resolveAssignedUsers(uids).map((p) => p.name).join(', ');
}

const DONE = new Set([STATUS.VERIFIED, STATUS.COMPLETED]);
const latestTs = (a) => (a.timeline || []).reduce((mx, e) => Math.max(mx, Date.parse(e.timestamp) || 0), 0);

/* ── Timeline page ────────────────────────────────────────────────────── */
const TL_FILTERS = [
  { id: 'semua', label: 'Semua', test: () => true },
  { id: 'berjalan', label: 'Sedang Berjalan', test: (a) => a.status === STATUS.IN_PROGRESS },
  { id: 'verifikasi', label: 'Menunggu Verifikasi', test: (a) => a.status === STATUS.WAITING_VERIFICATION },
  { id: 'besok', label: 'Dilanjutkan Besok', test: (a) => a.status === STATUS.CONTINUE_TOMORROW },
  { id: 'postponed', label: 'Postponed', test: (a) => a.status === STATUS.POSTPONED },
  { id: 'selesai', label: 'Selesai', test: (a) => DONE.has(a.status) },
  { id: 'kritis', label: 'Critical', test: (a) => a.priority === PRIORITY.CRITICAL },
];

export function renderTimelinePage(all, ctx) {
  const personal = ctx.role === ENGINEERING_ROLE.MEMBER;
  const me = ctx.me || {};
  let list = all.filter((a) => a.status !== STATUS.ARCHIVED);
  if (personal) list = list.filter((a) => isMyAssignment(a, me));
  list.sort((x, y) => latestTs(y) - latestTs(x));

  const filterId = (ctx.filters && ctx.filters.tl) || 'semua';
  const active = TL_FILTERS.find((f) => f.id === filterId) || TL_FILTERS[0];
  const rows = list.filter(active.test);
  // Collapsed by default; only the single user-selected card is expanded (v1.20.2).
  const isOpen = (a) => a.id === ctx.expandedId;

  const chips = TL_FILTERS.map((f) => {
    const c = list.filter(f.test).length;
    return `<button class="eng-chip" data-on="${filterId === f.id}" data-act="eng-tl-filter" data-val="${f.id}">${esc(f.label)}<span class="eng-chip-count">${c}</span></button>`;
  }).join('');

  const lede = personal
    ? 'Riwayat pekerjaan yang Anda tangani — kisah tiap penugasan dari dibuat, dikerjakan, hingga diverifikasi.'
    : 'Lini masa operasional Engineering — kisah tiap penugasan dari waktu ke waktu: siapa bergabung, apa yang terjadi, dan status terkininya.';

  return `<div class="eng-screen">
    ${pageHeader('ENGINEERING OPERATIONS', personal ? 'Timeline Saya' : 'Timeline', lede)}
    <div class="eng-filterbar"><div class="eng-chips">${chips}</div><span class="eng-newest">${icon('history', { size: 14 })} Terbaru dahulu</span></div>
    ${rows.length === 0 ? emptyState('Tidak ada aktivitas', 'Tidak ada penugasan pada filter ini. Coba filter lain.')
      : `<div class="eng-tl-cards">${rows.map((a) => timelineCard(a, isOpen(a), ctx)).join('')}</div>`}
  </div>`;
}

function timelineCard(a, open, ctx) {
  const st = statusPill(a.status);
  const latest = (a.timeline || [])[a.timeline.length - 1];
  const room = (a.location || '').split(' · ').slice(-1)[0] || a.room || '';
  const members = activeParticipants(a);
  return `<div class="eng-tlc" data-open="${open}">
    <div class="eng-tlc-head" data-act="eng-tl-toggle" data-id="${esc(a.id)}">
      ${catTile(a.category, 44, 13)}
      <div class="eng-tlc-main">
        <div class="eng-tlc-badges"><span class="eng-card-id">${esc(a.assignmentNumber || a.id)}</span>${st}${priorityTag(a.priority)}</div>
        <div class="eng-tlc-title">${esc(a.title)}</div>
        <div class="eng-tlc-meta"><span class="eng-tlc-metalbl">Ruang</span> <span>${esc(room)}</span>
          ${members.length ? `<span class="eng-tlc-metalbl">Tim</span> ${workerStack(a.participants, 22)}` : '<span class="eng-muted-inline">Belum ada yang bergabung</span>'}</div>
      </div>
      <div class="eng-tlc-right"><span class="eng-tlc-time">${latest ? esc(formatEventTime(latest.timestamp, ctx.now)) : ''}</span>${icon('chevron-down', { size: 16, cls: 'eng-chev' })}</div>
    </div>
    ${open ? `<div class="eng-tlc-body">${renderTimeline(a.timeline, { dense: true, now: ctx.now })}
      <div class="eng-tlc-detail"><button class="eng-chip" data-act="eng-open" data-id="${esc(a.id)}">Buka detail ${icon('arrow-right', { size: 13 })}</button></div></div>`
      : (latest ? `<div class="eng-tlc-collapsed" data-act="eng-tl-toggle" data-id="${esc(a.id)}">
          <span class="eng-tlc-cdot" data-tone="${eventMeta(latest.type).tone}">${icon(eventMeta(latest.type).icon, { size: 11, tone: eventMeta(latest.type).tone })}</span>
          <span class="eng-tlc-clabel">${esc(eventMeta(latest.type).label)}${latest.actor && latest.actor.name ? ` — ${esc(latest.actor.name)}` : ''}</span>
          <span class="eng-tlc-ccount">${(a.timeline || []).length} aktivitas</span></div>` : '')}
  </div>`;
}

/* ── My Jobs (Pekerjaan) ──────────────────────────────────────────────────
   v1.20.8 — bottom-nav "Pekerjaan" (Objective 5/6c). The member/coordinator's
   personal work queue: every assignment they participate in, across
   joined/active/waiting-verification/completed states — distinct from
   Timeline (the operational activity feed, ALL states) and Riwayat
   (closed-only). Reuses the exact same card + selector machinery as the
   Queue and History screens; no new data logic. */
const MY_JOBS_STATUSES = new Set([
  STATUS.AVAILABLE, STATUS.IN_PROGRESS, STATUS.WAITING_VERIFICATION,
  STATUS.VERIFIED, STATUS.COMPLETED,
]);

export function renderMyJobs(all, ctx) {
  const me = ctx.me || {};
  const rows = all
    .filter((a) => MY_JOBS_STATUSES.has(a.status) && isMyAssignment(a, me))
    .sort((x, y) => latestTs(y) - latestTs(x));

  return `<div class="eng-screen">
    ${pageHeader('ENGINEERING OPERATIONS', 'Pekerjaan', 'Penugasan yang melibatkan Anda — dari bergabung hingga selesai diverifikasi.')}
    ${rows.length === 0
      ? emptyState('Belum ada pekerjaan', 'Penugasan yang Anda ikuti akan muncul di sini.')
      : `<div class="eng-card-grid">${rows.map((a) => renderAssignmentCard(a, ctx)).join('')}</div>`}
  </div>`;
}

/* ── History ──────────────────────────────────────────────────────────── */
export function renderHistory(all, ctx) {
  const personal = ctx.role === ENGINEERING_ROLE.MEMBER;
  const me = ctx.me || {};
  const q = ((ctx.filters && ctx.filters.hq) || '').toLowerCase();
  let rows = all.filter((a) => DONE.has(a.status) || a.status === STATUS.POSTPONED);
  if (personal) rows = rows.filter((a) => isMyAssignment(a, me));
  if (q) rows = rows.filter((a) => `${a.title} ${a.location} ${a.assignmentNumber}`.toLowerCase().includes(q));
  rows.sort((x, y) => latestTs(y) - latestTs(x));

  const body = rows.length === 0
    ? emptyState('Belum ada riwayat', 'Penugasan yang telah diverifikasi atau ditunda akan muncul di sini.')
    : `<div class="eng-table-wrap"><table class="eng-table"><thead><tr>
        <th>Penugasan</th><th>Lokasi</th><th>Engineering</th><th class="-right">Waktu Kerja</th><th>Status</th></tr></thead><tbody>
        ${rows.map((a) => `<tr data-act="eng-open" data-id="${esc(a.id)}">
          <td><span class="eng-td-title"><span class="eng-cat-dot" style="background:var(--${catMeta(a.category).tone})"></span>${esc(a.title)}</span></td>
          <td>${esc((a.location || '').split(' · ')[0])}</td>
          <td>${esc(activeParticipants(a).map((p) => p.name.split(' ')[0]).join(', ') || '—')}</td>
          <td class="-right -mono">${esc(fmtDuration(actualMinutes(a, ctx.now)))}</td>
          <td>${statusPill(a.status)}</td></tr>`).join('')}
      </tbody></table></div>`;

  return `<div class="eng-screen">
    ${pageHeader('ENGINEERING OPERATIONS', personal ? 'Riwayat Saya' : 'Riwayat',
      personal ? 'Penugasan yang pernah Anda kerjakan dan telah ditutup.' : 'Arsip penugasan yang telah diverifikasi atau ditunda — jejak operasional lengkap.')}
    <div class="eng-filterbar"><div class="eng-search"><input type="search" class="eng-search-input" data-act="eng-hsearch" value="${esc((ctx.filters && ctx.filters.hq) || '')}" placeholder="Cari riwayat…" /></div></div>
    <div class="eng-card -pad">${body}</div>
    ${workReportsSection(ctx, q, personal, me)}
  </div>`;
}

/* Operational Work Reports ("Catat Pekerjaan") section — completed work logged
   outside assignments (v1.20.6, Objective 3). Members see only reports they were
   assigned to. Rendered under the assignment history so both live in one place. */
function workReportsSection(ctx, q, personal, me) {
  let reports = Array.isArray(ctx.workReports) ? ctx.workReports.slice() : [];
  if (personal) reports = reports.filter((r) => r.assignedUsers && r.assignedUsers[me.id]);
  if (q) reports = reports.filter((r) => `${r.title} ${r.location} ${r.reportNumber} ${personnelNames(r)}`.toLowerCase().includes(q));
  reports.sort((x, y) => (Date.parse(y.createdTime) || 0) - (Date.parse(x.createdTime) || 0));
  if (reports.length === 0) return '';
  const rows = reports.map((r) => `<tr>
      <td><span class="eng-td-title"><span class="eng-cat-dot" style="background:var(--${catMeta(r.category).tone})"></span>${esc(r.title)}</span></td>
      <td>${esc((r.location || '').split(' · ')[0] || '—')}</td>
      <td>${esc(personnelNames(r) || '—')}</td>
      <td>${esc(r.workDate || '—')}</td>
      <td class="-right -mono">${esc([r.startTime, r.finishTime].filter(Boolean).join('–') || '—')}</td>
    </tr>`).join('');
  return `<div class="eng-level" style="margin-top:22px;">
    ${sectionHeader('CATAT PEKERJAAN', 'Laporan Pekerjaan Operasional', 'Pekerjaan nyata yang dicatat di luar penugasan formal — dataset operasional untuk analitik & ML.')}
    <div class="eng-card -pad"><div class="eng-table-wrap"><table class="eng-table"><thead><tr>
      <th>Pekerjaan</th><th>Lokasi</th><th>Teknisi</th><th>Tanggal</th><th class="-right">Waktu</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
  </div>`;
}

/* NOTE (v1.20.2): the Engineering Analytics PAGE moved into the global Analytics
   module (js/analytics/views/analytics-engineering-view.js). Engineering exposes
   only its analytics PROVIDER now — there is no renderAnalytics here anymore. */

/* ── Settings (Admin) ─────────────────────────────────────────────────── */
export function renderSettings(all, ctx) {
  const cats = getEnabledCategories();
  const np = getNotificationPreferences();
  const vr = getVerificationRules();
  const buildings = [...new Set(all.map((a) => a.building).filter(Boolean))];
  const prios = [PRIORITY.CRITICAL, PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW];

  const toggle = (on) => `<span class="eng-toggle" data-on="${!!on}"><span class="eng-toggle-knob"></span></span>`;
  const rule = (t, sub, on) => `<div class="eng-rule"><div class="eng-rule-txt"><div class="eng-rule-t">${esc(t)}</div><div class="eng-rule-s">${esc(sub)}</div></div>${toggle(on)}</div>`;
  const future = [
    ['Spare Parts', 'Inventaris & permintaan suku cadang'],
    ['SLA & Target Waktu', 'Batas waktu penyelesaian per severity'],
    ['Bidang Request', 'Permintaan perbaikan lintas bidang'],
    ['Preventive Maintenance', 'Jadwal pemeliharaan berkala otomatis'],
  ];

  return `<div class="eng-screen">
    ${pageHeader('ENGINEERING OPERATIONS', 'Pengaturan', 'Konfigurasi operasional Engineering. Khusus Admin Sarpras.')}
    <div class="eng-level">${sectionHeader('MASTER DATA', 'Data Operasional')}
      <div class="eng-grid -3">
        <div class="eng-card -pad"><div class="eng-settings-h"><div class="eng-settings-t">Daftar Gedung</div><span class="eng-link">${buildings.length} gedung</span></div>
          <div class="eng-badge-wrap">${buildings.map((b) => `<span class="eng-badge">${esc(b)}</span>`).join('') || '<span class="eng-muted-inline">—</span>'}</div></div>
        <div class="eng-card -pad"><div class="eng-settings-h"><div class="eng-settings-t">Kategori</div><span class="eng-link">${cats.length} kategori</span></div>
          <div class="eng-cat-wrap">${cats.slice(0, 8).map((c) => `<span class="eng-cat-chip" style="color:var(--${catMeta(c.id).tone})">${icon(catMeta(c.id).icon, { size: 14 })}${esc(c.label)}</span>`).join('')}</div></div>
        <div class="eng-card -pad"><div class="eng-settings-h"><div class="eng-settings-t">Severity</div></div>
          <div class="eng-sev-wrap">${prios.map((p) => priorityTag(p, false)).join('')}</div></div>
      </div>
    </div>
    <div class="eng-level">${sectionHeader('NOTIFIKASI', 'Reminder & Notification Rules')}
      <div class="eng-card -pad">
        ${rule('Notifikasi penugasan baru', 'Kirim ke Koordinator Engineering + SELURUH Engineering saat dipublikasikan', np.notifyMembersOnPublish)}
        ${rule('Notifikasi verifikasi', 'Beri tahu saat pekerjaan menunggu verifikasi', np.notifyOnVerification)}
        ${rule('Kanal Push', 'Kirim melalui push notification perangkat', np.channels && np.channels.push)}
        ${rule('Kanal Telegram', 'Kirim melalui Telegram', np.channels && np.channels.telegram)}
      </div></div>
    <div class="eng-level">${sectionHeader('ATURAN KERJA', 'Operasional')}
      <div class="eng-card -pad">
        ${rule('Izinkan beberapa Engineering per penugasan', 'Beberapa anggota dapat bergabung ke satu pekerjaan', true)}
        ${rule('Wajib verifikasi', 'Penugasan hanya ditutup setelah diverifikasi Koordinator / Admin', vr.required)}
        ${rule('Catat waktu kerja aktual', 'Rekam durasi per sesi kerja tiap anggota', true)}
      </div></div>
    <div class="eng-level">${sectionHeader('ROADMAP', 'Arsitektur Mendatang', 'Disiapkan, belum aktif')}
      <div class="eng-grid -2">${future.map(([t, d]) => `<div class="eng-card -pad eng-roadmap"><span class="eng-roadmap-ic">${icon('layers', { size: 18 })}</span><div class="eng-roadmap-txt"><div class="eng-roadmap-t">${esc(t)}</div><div class="eng-roadmap-d">${esc(d)}</div></div><span class="eng-pill" data-pill="cancel">Segera</span></div>`).join('')}</div></div>
    ${ctx.isDev ? `<div class="eng-level">${sectionHeader('DEVELOPMENT', 'Seed Manager', 'Alat pengembang — tidak tersedia di staging / produksi')}
      <div class="eng-card -pad eng-seedmgr">
        <div class="eng-seedmgr-txt">
          <div class="eng-seedmgr-t">Data demo Engineering</div>
          <div class="eng-seedmgr-s">Startup selalu kosong. Data demo hanya dimuat saat Anda menekannya di sini — tidak pernah otomatis.</div>
        </div>
        <div class="eng-seedmgr-actions">
          <button class="eng-btn -sm -primary" data-act="eng-seed-load">${icon('reset', { size: 14 })} Muat Data Demo</button>
          <button class="eng-btn -sm -ghost" data-act="eng-seed-reset">${icon('history', { size: 14 })} Reset Data Demo</button>
          <button class="eng-btn -sm -ghost" data-act="eng-seed-clear">${icon('x-circle', { size: 14 })} Kosongkan Semua</button>
        </div>
      </div></div>` : ''}
  </div>`;
}
