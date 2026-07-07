/* ============================================================
   ENGINEERING-ATOMS.JS — Engineering UI presentation atoms (v1.20.1)

   The shared, PURE presentation layer for the Engineering module: icon set,
   category / priority / status display metadata, worker avatars, duration
   formatting, and the small reusable HTML fragments (category tile, priority
   tag, status pill, worker stack, timeline node) the screens compose.

   All functions return escaped HTML strings (no DOM, no framework) so the
   center can do a single innerHTML render per state change — mirroring the
   Petty Cash Center. Presentation ONLY: no business logic, no store writes.
   Every colour comes from a design token; nothing is hardcoded.
   ============================================================ */

'use strict';

import { STATUS, PRIORITY } from '../config/engineering-config.js';

/** HTML-escape (attribute/text safe). */
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── Icon set ─────────────────────────────────────────────────────────── */
/** name → { d, fill? } — stroke glyphs unless `fill`. Ported from the prototype
 *  facility set plus the platform UI glyphs the screens use. */
const ICONS = {
  wrench: { d: 'M15.5 7a4.5 4.5 0 0 1-5.9 5.9L4 18.5 5.5 20l5.6-5.6A4.5 4.5 0 0 0 17 8.5a4.5 4.5 0 0 0-.3-1.6l-2.6 2.6-2-.5-.5-2 2.6-2.6A4.5 4.5 0 0 0 15.5 7z' },
  plus: { d: 'M12 5v14M5 12h14' },
  bell: { d: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0' },
  clock: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2' },
  'check-circle': { d: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3' },
  'x-circle': { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-6 6M9 9l6 6' },
  reset: { d: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5' },
  chart: { d: 'M4 20V10M10 20V4M16 20v-7M4 20h16' },
  gear: { d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 12c0-.5 0-.9-.1-1.3l1.7-1.3-1.7-3-2 .8a6.7 6.7 0 0 0-2.2-1.3L14.5 4h-5l-.6 2.6a6.7 6.7 0 0 0-2.2 1.3l-2-.8-1.7 3L4.7 10.7c0 .4-.1.8-.1 1.3s0 .9.1 1.3L3 14.6l1.7 3 2-.8a6.7 6.7 0 0 0 2.2 1.3L9.5 20h5l.6-2.6a6.7 6.7 0 0 0 2.2-1.3l2 .8 1.7-3-1.7-1.3c.1-.4.1-.8.1-1.3z' },
  grid: { d: 'M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z' },
  file: { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5' },
  pin: { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  camera: { d: 'M4 8h3l1.5-2h7L17 8h3v12H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z' },
  close: { d: 'M18 6 6 18M6 6l12 12' },
  'arrow-right': { d: 'M5 12h14M13 6l6 6-6 6' },
  'arrow-left': { d: 'M19 12H5M11 18l-6-6 6-6' },
  'chevron-down': { d: 'M6 9l6 6 6-6' },
  'chevron-right': { d: 'M9 6l6 6-6 6' },
  download: { d: 'M12 3v12M7 10l5 5 5-5M5 21h14' },
  shield: { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  users: { d: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' },
  play: { d: 'M8 5.5v13l10-6.5z', fill: true },
  hand: { d: 'M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-3.6-1.6L4 16.5s-1-1.3.2-2.2 2 .4 2 .4L8 16' },
  moon: { d: 'M20.5 14.5A8 8 0 1 1 10 4a6.2 6.2 0 0 0 10.5 10.5z' },
  sun: { d: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7' },
  note: { d: 'M6 3h9l3 3v15H6zM9 9.5h6M9 13.5h6M9 17.5h3.5' },
  layers: { d: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5' },
  phone: { d: 'M7 2.5h10v19H7zM10.5 18h3' },
  history: { d: 'M3.5 12a8.5 8.5 0 1 0 2.8-6.3M6 5.5V9h3.5M12 8v4.2l3 1.8' },
  fan: { d: 'M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h10a3 3 0 1 1-3 3' },
  bolt: { d: 'M13 2 5 13h6l-1 9 9-12h-6l0-8z' },
  droplet: { d: 'M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3z' },
  gauge: { d: 'M5 18a8 8 0 1 1 14 0M12 12l3.5-2.5M12 12.5a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2z' },
  flame: { d: 'M12 3c.6 3.4 4 4.2 4 8a4 4 0 0 1-8 0c0-1.6.7-2.6 1.6-3.6.6 1.2 1.4 1.6 2.4 1.6-.4-2.4-1-4-.4-6z' },
  chair: { d: 'M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M5 10h14v3H5zM7 13v7M17 13v7' },
  door: { d: 'M6 21V3h11v18M5 21h13M14 12h.6' },
  box: { d: 'M4 4h16v16H4zM12 4v16M9 9v3M15 9v3' },
  trash: { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' },
  archive: { d: 'M3 4h18v4H3zM5 8v12h14V8M9 12h6' },
};

/**
 * Inline SVG icon string.
 * @param {string} name
 * @param {Object} [o] { size=18, tone='currentColor', cls='' }
 */
export function icon(name, o = {}) {
  const g = ICONS[name] || ICONS.wrench;
  const size = o.size || 18;
  const tone = o.tone || 'currentColor';
  const color = tone === 'currentColor' ? 'currentColor'
    : (/^(var\(|#|rgb)/.test(tone) ? tone : `var(--${String(tone).replace(/^--/, '')})`);
  const fill = g.fill ? color : 'none';
  const stroke = g.fill ? 'none' : color;
  const sw = g.fill ? 0 : (o.strokeWidth || 1.7);
  return `<svg class="eng-ic ${o.cls || ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${g.d}"/></svg>`;
}

/* ── Category / priority / status metadata ────────────────────────────── */
const CAT_META = {
  'ac-maintenance': { label: 'AC / Pendingin', tone: 'c-blue', icon: 'fan' },
  kelistrikan: { label: 'Kelistrikan', tone: 'c-amber', icon: 'bolt' },
  furniture: { label: 'Furnitur', tone: 'c-violet', icon: 'chair' },
  plumbing: { label: 'Plumbing', tone: 'c-teal', icon: 'droplet' },
  pompa: { label: 'Pompa Air', tone: 'c-teal', icon: 'gauge' },
  hydrant: { label: 'Hydrant', tone: 'crit', icon: 'flame' },
  'sound-system': { label: 'Sound System', tone: 'c-violet', icon: 'box' },
  'cctv-wifi': { label: 'CCTV / WiFi', tone: 'c-blue', icon: 'box' },
  'general-repair': { label: 'Perbaikan Umum', tone: 'c-neutral', icon: 'wrench' },
  other: { label: 'Lainnya', tone: 'c-neutral', icon: 'wrench' },
};
export const catMeta = (id) => CAT_META[id] || CAT_META.other;

const PRIO_META = {
  [PRIORITY.CRITICAL]: { label: 'Kritis', tone: 'crit' },
  [PRIORITY.HIGH]: { label: 'Tinggi', tone: 'c-amber' },
  [PRIORITY.NORMAL]: { label: 'Sedang', tone: 'c-blue' },
  [PRIORITY.LOW]: { label: 'Rendah', tone: 'c-neutral' },
};
export const prioMeta = (id) => PRIO_META[id] || PRIO_META[PRIORITY.NORMAL];

const STATUS_META = {
  [STATUS.DRAFT]: { label: 'Draf', pill: 'neutral' },
  [STATUS.PUBLISHED]: { label: 'Dipublikasikan', pill: 'sched' },
  [STATUS.AVAILABLE]: { label: 'Tersedia', pill: 'sched' },
  [STATUS.IN_PROGRESS]: { label: 'Dikerjakan', pill: 'active' },
  [STATUS.WAITING_VERIFICATION]: { label: 'Menunggu Verifikasi', pill: 'sched' },
  [STATUS.VERIFIED]: { label: 'Terverifikasi', pill: 'done' },
  [STATUS.COMPLETED]: { label: 'Selesai', pill: 'done' },
  [STATUS.CONTINUE_TOMORROW]: { label: 'Dilanjut Besok', pill: 'neutral' },
  [STATUS.POSTPONED]: { label: 'Ditunda', pill: 'cancel' },
  [STATUS.CANCELLED]: { label: 'Dibatalkan', pill: 'cancel' },
  [STATUS.ARCHIVED]: { label: 'Diarsipkan', pill: 'neutral' },
};
export const statusMeta = (id) => STATUS_META[id] || { label: id || '—', pill: 'neutral' };

/* ── Worker avatar (colour + initials derived from name) ──────────────── */
const AVATAR_TONES = ['c-blue', 'c-green', 'c-amber', 'c-violet', 'c-teal'];
export function workerColorVar(name) {
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(--${AVATAR_TONES[h % AVATAR_TONES.length]})`;
}
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ── Duration ─────────────────────────────────────────────────────────── */
export function fmtDuration(min) {
  const m = Math.max(0, Math.round(min));
  if (m <= 0) return '0m';
  const h = Math.floor(m / 60), mm = m % 60;
  return (h ? `${h}j ` : '') + `${mm}m`;
}
/** Live elapsed minutes for a participant (adds running segment if working). */
export function workerElapsedMin(p, now = Date.now()) {
  const banked = (Number(p.actualWorkingDurationMs) || 0) / 60000;
  let live = 0;
  if (p.status === 'working' && p.startedTime) {
    const t = Date.parse(p.startedTime);
    if (!Number.isNaN(t)) live = Math.max(0, (now - t) / 60000);
  }
  return banked + live;
}
export function actualMinutes(a, now = Date.now()) {
  return (a.participants || []).filter((p) => p.status !== 'left')
    .reduce((s, p) => s + workerElapsedMin(p, now), 0);
}
export const activeParticipants = (a) => (a.participants || []).filter((p) => p.status !== 'left');

/* ── Deadline display (from the structured deadlineAt ISO) ─────────────────
   Renders a human label: Hari ini · Besok · Kemarin · "7 Jul" · "7 Jul 2027". */
const _MON_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function fmtDeadline(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t), n = new Date(now);
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((midnight(d) - midnight(n)) / 86400000);
  if (dayDiff === 0) return 'Hari ini';
  if (dayDiff === 1) return 'Besok';
  if (dayDiff === -1) return 'Kemarin';
  const base = `${d.getDate()} ${_MON_ID[d.getMonth()]}`;
  return d.getFullYear() === n.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/* ── Fragments ────────────────────────────────────────────────────────── */
export function catTile(categoryId, size = 42, radius = 12) {
  const m = catMeta(categoryId);
  return `<span class="eng-cat-tile" data-tone="${m.tone}" style="width:${size}px;height:${size}px;border-radius:${radius}px">${icon(m.icon, { size: Math.round(size * 0.5), tone: m.tone })}</span>`;
}

export function priorityTag(priorityId, mono = true) {
  const p = prioMeta(priorityId);
  return `<span class="eng-prio${mono ? ' -mono' : ''}" style="color:var(--${p.tone})"><span class="eng-prio-dot" style="background:var(--${p.tone})"></span>${esc(p.label)}</span>`;
}

export function statusPill(statusId) {
  const s = statusMeta(statusId);
  return `<span class="eng-pill" data-pill="${s.pill}">${esc(s.label)}</span>`;
}

/** Small avatar chip for a participant name. */
export function avatar(name, size = 26, ring = false) {
  return `<span class="eng-ava${ring ? ' -ring' : ''}" style="width:${size}px;height:${size}px;background:${workerColorVar(name)};font-size:${Math.round(size * 0.4)}px" title="${esc(name)}">${esc(initials(name))}</span>`;
}

/** Overlapping stack of participant avatars (workers = participant objects). */
export function workerStack(participants, size = 26, max = 4) {
  const list = activeParticipants({ participants });
  if (!list.length) return '<span class="eng-empty-dash">—</span>';
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  const chips = shown.map((p, i) => `<span class="eng-ava eng-stack-ava${p.status === 'working' ? ' -active' : ''}" style="width:${size}px;height:${size}px;background:${workerColorVar(p.name)};font-size:${Math.round(size * 0.4)}px;margin-left:${i ? -Math.round(size * 0.34) : 0}px" title="${esc(p.name)}">${esc(initials(p.name))}</span>`).join('');
  const more = extra > 0 ? `<span class="eng-ava eng-stack-more" style="width:${size}px;height:${size}px;margin-left:${-Math.round(size * 0.34)}px">+${extra}</span>` : '';
  return `<span class="eng-stack">${chips}${more}</span>`;
}
