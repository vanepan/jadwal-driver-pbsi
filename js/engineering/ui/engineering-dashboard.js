/* ============================================================
   ENGINEERING-DASHBOARD.JS — role-aware operational dashboards (v1.20.1)

   The landing Dashboard. NOT analytics — it answers "what needs doing / needs
   attention / who is working / what awaits verification" at a glance.
     • renderOpsDashboard   — Admin Sarpras + Koordinator Engineering
     • renderMemberDashboard — Engineering field worker (work-first, big taps)

   PURE render → HTML from store data. Actions are `data-act` hooks.
   ============================================================ */

'use strict';

import { STATUS, PARTICIPANT_STATUS, PRIORITY } from '../config/engineering-config.js';
import { ENGINEERING_ROLE } from '../../config/role-registry.js';
import {
  esc, icon, catTile, avatar, catMeta,
  fmtDuration, workerElapsedMin, activeParticipants,
} from './engineering-atoms.js';
import {
  renderAssignmentCard, pageHeader, sectionHeader, emptyState,
} from './engineering-queue.js';
import { eventMeta, formatEventTime } from './engineering-timeline.js';

const DONE = new Set([STATUS.VERIFIED, STATUS.COMPLETED]);
const by = (arr, fn) => arr.filter(fn);

/* ── small presentation helpers ───────────────────────────────────────── */
export function kpiCard(label, value, caption, tone) {
  return `<div class="eng-kpi${tone ? ` -${tone}` : ''}">
    <div class="eng-kpi-label">${esc(label)}</div>
    <div class="eng-kpi-value">${esc(value)}</div>
    ${caption ? `<div class="eng-kpi-cap">${esc(caption)}</div>` : ''}
  </div>`;
}

export function ringGauge(value, size = 128, tone = 'green') {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - 16) / 2, c = 2 * Math.PI * r, dash = c * (v / 100);
  return `<svg class="eng-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--c-${tone === 'crit' ? 'crit' : tone === 'amber' ? 'amber' : 'green'}, var(--c-green))" stroke-width="11" stroke-linecap="round" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${c / 4}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="eng-ring-num">${v}</text>
  </svg>`;
}

function donut(segments, size = 104) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const thick = 16, r = (size - thick) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const arcs = segments.map((s) => {
    const dash = c * (s.value / total);
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-off}"/>`;
    off += dash; return el;
  }).join('');
  return `<div class="eng-donut" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">${arcs}</svg>
    <div class="eng-donut-center"><div class="eng-donut-num">${total}</div></div>
  </div>`;
}

function catSegments(all) {
  const m = {};
  all.forEach((a) => { m[a.category] = (m[a.category] || 0) + 1; });
  return Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 5)
    .map((k) => ({ label: catMeta(k).label, value: m[k], color: `var(--${catMeta(k).tone})` }));
}

/* ── activity feed ────────────────────────────────────────────────────── */
export function activityFeed(all, ctx, limit = 7) {
  const rows = [];
  all.forEach((a) => (a.timeline || []).forEach((e, i) => {
    if (ctx.role === ENGINEERING_ROLE.MEMBER && ctx.me && !(e.actor && (e.actor.name === ctx.me.name || e.actor.id === ctx.me.id))) return;
    rows.push({ a, e, t: Date.parse(e.timestamp) || 0, i });
  }));
  rows.sort((x, y) => (y.t - x.t) || (y.i - x.i));
  const top = rows.slice(0, limit);
  if (!top.length) return '<div class="eng-muted eng-pad">Belum ada aktivitas.</div>';
  return `<div class="eng-feed">${top.map(({ a, e }) => {
    const m = eventMeta(e.type);
    return `<div class="eng-feed-row" data-act="eng-open" data-id="${esc(a.id)}">
      <span class="eng-feed-ic" data-tone="${m.tone}">${icon(m.icon, { size: 14, tone: m.tone })}</span>
      <div class="eng-feed-main">
        <div class="eng-feed-label"><span>${esc((e.actor && e.actor.name) || 'Sistem')}</span> · ${esc(m.label)}</div>
        <div class="eng-feed-sub">${esc(a.title)}</div>
      </div>
      <span class="eng-feed-time">${esc(formatEventTime(e.timestamp, ctx.now))}</span>
    </div>`;
  }).join('')}</div>`;
}

/* ── OPS DASHBOARD (admin / coordinator) ──────────────────────────────── */
export function renderOpsDashboard(all, ctx) {
  const isAdmin = ctx.role === 'admin';
  const inProg = by(all, (a) => a.status === STATUS.IN_PROGRESS);
  const verify = by(all, (a) => a.status === STATUS.WAITING_VERIFICATION);
  const paused = by(all, (a) => a.status === STATUS.CONTINUE_TOMORROW);
  const available = by(all, (a) => a.status === STATUS.AVAILABLE);
  const crit = by(all, (a) => a.priority === PRIORITY.CRITICAL && !DONE.has(a.status) && a.status !== STATUS.POSTPONED);
  const doneToday = by(all, (a) => DONE.has(a.status));
  const todayCount = by(all, (a) => a.status !== STATUS.POSTPONED && !DONE.has(a.status) && a.status !== STATUS.ARCHIVED).length;

  const activeWorkers = [];
  inProg.forEach((a) => activeParticipants(a).filter((p) => p.status === PARTICIPANT_STATUS.WORKING).forEach((p) => activeWorkers.push({ a, p })));
  const roster = ctx.roster || [];
  const busy = new Set(activeWorkers.map((x) => x.p.name));
  const availEng = Math.max(0, roster.length - busy.size);

  const health = Math.max(0, Math.round(100 - (verify.length * 6 + crit.length * 8 + paused.length * 4)));
  const healthTone = health >= 80 ? 'green' : health >= 65 ? 'amber' : 'crit';

  const attention = crit.filter((a) => a.status === STATUS.IN_PROGRESS).map((a) => ({ a, kind: 'crit' }))
    .concat(paused.map((a) => ({ a, kind: 'paused' })));

  const cardCtx = ctx;
  const cards = (list) => `<div class="eng-card-grid">${list.map((a) => renderAssignmentCard(a, cardCtx)).join('')}</div>`;

  const heroAdmin = `<div class="eng-hero">
    <div class="eng-hero-health">
      ${ringGauge(health, 128, healthTone)}
      <div><div class="eng-hero-lbl">Kesehatan Operasional</div>
      <div class="eng-grade" data-tone="${healthTone}">${icon('check-circle', { size: 14 })} ${health >= 80 ? 'Terkendali' : 'Perlu perhatian'}</div></div>
    </div>
    <div class="eng-hero-stats -c4">
      ${kpiCard('Assignment Hari Ini', String(todayCount), 'aktif')}
      ${kpiCard('Dikerjakan', String(inProg.length), 'berlangsung')}
      ${kpiCard('Verifikasi', String(verify.length), 'perlu tindakan', 'alert')}
      ${kpiCard('Selesai', String(doneToday.length), 'total')}
    </div>
  </div>`;

  const heroCoord = `<div class="eng-hero-strip"><div class="eng-hero-stats -c5">
    ${kpiCard('Task Belum Diambil', String(available.length), 'siap dikerjakan')}
    ${kpiCard('Sedang Dikerjakan', String(inProg.length), 'berjalan')}
    ${kpiCard('Menunggu Verifikasi', String(verify.length), 'perlu tindakan', 'alert')}
    ${kpiCard('Dilanjutkan Besok', String(paused.length), 'menunggu lanjut')}
    ${kpiCard('Engineering Tersedia', String(availEng), `dari ${roster.length}`)}
  </div></div>`;

  const verifyBanner = verify.length ? `<div class="eng-level"><div class="eng-verify-banner">
    <span class="eng-verify-ic">${icon('clock', { size: 20 })}</span>
    <div class="eng-verify-txt"><div class="eng-verify-title">${verify.length} pekerjaan menunggu verifikasi</div>
    <div class="eng-verify-sub">${esc(verify.slice(0, 2).map((a) => a.title).join(' · '))}${verify.length > 2 ? ` +${verify.length - 2} lainnya` : ''}</div></div>
    <div class="eng-verify-actions">${verify.slice(0, 2).map((a) => `<button class="eng-btn -sm -primary" data-act="eng-verify" data-id="${esc(a.id)}">${icon('check-circle', { size: 14 })} Verifikasi ${esc(a.assignmentNumber || a.id)}</button>`).join('')}</div>
  </div></div>` : '';

  const seg = catSegments(all);
  const legend = seg.map((s) => `<div class="eng-legend-li"><span class="eng-legend-sw" style="background:${s.color}"></span>${esc(s.label)}<span class="eng-legend-v">${s.value}</span></div>`).join('');

  const rightPanel = isAdmin
    ? `<div class="eng-card -pad"><div class="eng-card-head"><div class="eng-card-h-title">Mini Operational Analytics</div><div class="eng-card-h-sub">Distribusi kategori</div></div>
        <div class="eng-donut-wrap">${donut(seg)}<div class="eng-legend">${legend}</div></div>
        <div class="eng-card-cta"><span class="eng-muted-inline">${icon('chart', { size: 14 })} Analytics lengkap tersedia di modul Analytics</span></div></div>`
    : `<div class="eng-card -pad">${sectionHeader('TERSEDIA', 'Engineering Tersedia', `${availEng} siap`)}
        ${roster.map((n) => `<div class="eng-avail-row">${avatar(n, 30)}<span class="eng-avail-name">${esc(n)}</span><span class="eng-pill" data-pill="${busy.has(n) ? 'active' : 'done'}">${busy.has(n) ? 'Bekerja' : 'Tersedia'}</span></div>`).join('')}</div>`;

  // The primary "Buat Penugasan" action lives in the left sidebar CTA (platform
  // convention, v1.20.2) — no floating action inside content.
  return `<div class="eng-screen">
    ${pageHeader('ENGINEERING OPERATIONS', 'Dashboard',
      `${inProg.length} penugasan berjalan, ${verify.length} menunggu verifikasi.`)}
    ${isAdmin ? heroAdmin : heroCoord}
    ${verifyBanner}
    ${crit.length ? `<div class="eng-level">${sectionHeader('KRITIS', 'Critical Assignment', `${crit.length} penugasan`)}${cards(crit)}</div>` : ''}
    <div class="eng-level"><div class="eng-grid -lead">
      <div class="eng-card -pad">${sectionHeader('PERHATIAN', 'Perlu Tindakan', `${attention.length} item`)}
        ${attention.length === 0 ? '<div class="eng-muted eng-pad">Tidak ada yang perlu tindakan. Operasi berjalan lancar.</div>'
          : attention.map(({ a, kind }) => attnRow(a, kind, ctx)).join('')}</div>
      <div class="eng-card -pad">${sectionHeader('LANGSUNG', 'Engineering Sedang Bekerja', `${activeWorkers.length}`)}
        ${activeWorkers.length === 0 ? '<div class="eng-muted eng-pad">Tidak ada teknisi yang aktif saat ini.</div>'
          : activeWorkers.map(({ a, p }) => liveWorkerRow(a, p, ctx.now)).join('')}</div>
    </div></div>
    <div class="eng-level">${sectionHeader(isAdmin ? 'HARI INI' : 'ANTREAN', isAdmin ? 'Assignment Hari Ini' : 'Penugasan Menunggu & Berjalan', `${inProg.concat(available, paused).length}`)}
      ${cards(inProg.concat(available, paused))}</div>
    <div class="eng-level"><div class="eng-grid -lead">
      <div class="eng-card -pad">${sectionHeader('AKTIVITAS', 'Recent Activity', 'Terbaru', `<button class="eng-link" data-act="eng-goto" data-val="timeline">Buka Timeline →</button>`)}
        ${activityFeed(all, ctx, 7)}</div>
      ${rightPanel}
    </div></div>
  </div>`;
}

function attnRow(a, kind, ctx) {
  const cfg = { crit: { tone: 'crit', label: 'Kritis · sedang berjalan', icon: 'flame' }, paused: { tone: 'c-violet', label: 'Dilanjut besok', icon: 'moon' } }[kind];
  const canVerify = ctx.canEng('eng.verify');
  return `<div class="eng-attn-row">
    ${catTile(a.category, 38)}
    <div class="eng-attn-main" data-act="eng-open" data-id="${esc(a.id)}">
      <div class="eng-attn-title">${esc(a.title)}</div>
      <div class="eng-attn-sub"><span style="color:var(--${cfg.tone})">${icon(cfg.icon, { size: 13, tone: cfg.tone })} ${esc(cfg.label)}</span><span class="eng-dot-sep">·</span> ${esc((a.location || '').split(' · ')[0])}</div>
    </div>
    <button class="eng-btn -sm -ghost" data-act="eng-open" data-id="${esc(a.id)}">${icon('arrow-right', { size: 14 })} Detail</button>
  </div>`;
}

function liveWorkerRow(a, p, now) {
  return `<div class="eng-live-row" data-act="eng-open" data-id="${esc(a.id)}">
    <span class="eng-live-ava">${avatar(p.name, 34)}<span class="eng-live-pulse"></span></span>
    <div class="eng-live-main"><div class="eng-live-name">${esc(p.name)}</div><div class="eng-live-task">${esc(a.title)}</div></div>
    <span class="eng-live-dur">${esc(fmtDuration(workerElapsedMin(p, now)))}</span>
  </div>`;
}

/* ── MEMBER DASHBOARD ─────────────────────────────────────────────────── */
export function renderMemberDashboard(all, ctx) {
  const me = ctx.me || {};
  const isMine = (p) => p.workerId === me.id || p.name === me.name;
  const myActive = by(all, (a) => (a.participants || []).some((p) => isMine(p) && p.status === PARTICIPANT_STATUS.WORKING));
  const myPaused = by(all, (a) => (a.participants || []).some((p) => isMine(p) && p.status === PARTICIPANT_STATUS.CONTINUE_TOMORROW) && !DONE.has(a.status));
  const available = by(all, (a) => a.status === STATUS.AVAILABLE);
  const myDone = by(all, (a) => (a.participants || []).some((p) => isMine(p) && (p.status === PARTICIPANT_STATUS.FINISHED)) || (DONE.has(a.status) && (a.participants || []).some(isMine)));
  const first = (me.name || 'Teknisi').split(' ')[0];

  const heroFor = (a) => {
    const mine = (a.participants || []).find(isMine) || {};
    const active = mine.status === PARTICIPANT_STATUS.WORKING;
    return `<div class="eng-mywork" data-active="${active}">
      <span class="eng-mywork-bar"></span>
      <div class="eng-mywork-top">
        ${catTile(a.category, 48, 14)}
        <div class="eng-mywork-info">
          <div class="eng-mywork-kicker" style="color:var(--${active ? 'c-blue' : 'c-violet'})">${active ? '<span class="eng-pulse-dot"></span>Sedang Anda kerjakan' : 'Dilanjut besok'}</div>
          <div class="eng-mywork-title" data-act="eng-open" data-id="${esc(a.id)}">${esc(a.title)}</div>
          <div class="eng-mywork-loc">${icon('pin', { size: 14 })} ${esc(a.location || '')}</div>
        </div>
        <div class="eng-mywork-time"><div class="eng-mywork-num">${esc(fmtDuration(workerElapsedMin(mine, ctx.now)))}</div><div class="eng-mywork-cap">waktu kerja Anda</div></div>
      </div>
      <div class="eng-action-row">
        ${active
          ? `<button class="eng-btn -big -tone-violet" data-act="eng-continue" data-id="${esc(a.id)}" data-worker="${esc(me.id)}">${icon('moon', { size: 17 })} Lanjut Besok</button>
             <button class="eng-btn -big -primary" data-act="eng-finish" data-id="${esc(a.id)}" data-worker="${esc(me.id)}">${icon('check-circle', { size: 17 })} Selesai</button>`
          : `<button class="eng-btn -big -primary" data-act="eng-resume" data-id="${esc(a.id)}" data-worker="${esc(me.id)}">${icon('play', { size: 16 })} Lanjutkan</button>
             <button class="eng-btn -big" data-act="eng-finish" data-id="${esc(a.id)}" data-worker="${esc(me.id)}">${icon('check-circle', { size: 17 })} Selesai</button>`}
      </div>
    </div>`;
  };

  return `<div class="eng-screen">
    ${pageHeader('ENGINEERING OPERATIONS', `Halo, ${esc(first)}`,
      myActive.length ? `Anda punya ${myActive.length} pekerjaan berjalan. ${available.length} penugasan baru tersedia.` : `${available.length} penugasan tersedia untuk dikerjakan sekarang.`)}
    <div class="eng-hero-strip"><div class="eng-hero-stats -c3">
      ${kpiCard('Sedang Saya Kerjakan', String(myActive.length), 'berjalan')}
      ${kpiCard('Task Tersedia', String(available.length), 'bisa diambil')}
      ${kpiCard('Dilanjut Besok', String(myPaused.length), 'menunggu Anda')}
    </div></div>
    ${myActive.length ? `<div class="eng-level">${sectionHeader('PEKERJAAN SAYA', 'Sedang Saya Kerjakan', `${myActive.length}`)}<div class="eng-stack">${myActive.map(heroFor).join('')}</div></div>` : ''}
    <div class="eng-level">${sectionHeader('TERSEDIA', 'Task Tersedia', 'Ketuk untuk mulai')}
      ${available.length === 0 ? emptyState('Tidak ada penugasan tersedia', 'Anda akan menerima notifikasi saat ada yang baru.')
        : `<div class="eng-card-grid">${available.map((a) => renderAssignmentCard(a, ctx)).join('')}</div>`}</div>
    ${myPaused.length ? `<div class="eng-level">${sectionHeader('DILANJUT BESOK', 'Menunggu Dilanjutkan', `${myPaused.length}`)}<div class="eng-stack">${myPaused.map(heroFor).join('')}</div></div>` : ''}
    <div class="eng-level"><div class="eng-grid -2">
      <div class="eng-card -pad">${sectionHeader('TIMELINE', 'Timeline Hari Ini', 'Aktivitas Anda', `<button class="eng-link" data-act="eng-goto" data-val="timeline">Buka →</button>`)}${activityFeed(all, ctx, 5)}</div>
      <div class="eng-card -pad">${sectionHeader('RIWAYAT', 'Riwayat Terakhir', `${myDone.length}`)}
        ${myDone.length === 0 ? '<div class="eng-muted eng-pad">Belum ada pekerjaan selesai hari ini.</div>'
          : myDone.map((a) => `<div class="eng-hist-row" data-act="eng-open" data-id="${esc(a.id)}">${catTile(a.category, 34)}<div class="eng-hist-main"><div class="eng-hist-title">${esc(a.title)}</div><div class="eng-hist-sub">${esc((a.location || '').split(' · ')[0])}</div></div><span class="eng-hist-status" style="color:var(--${DONE.has(a.status) ? 'c-green' : 'c-amber'})">${icon(DONE.has(a.status) ? 'check-circle' : 'clock', { size: 14 })} ${DONE.has(a.status) ? 'Terverifikasi' : 'Menunggu'}</span></div>`).join('')}</div>
    </div></div>
  </div>`;
}
