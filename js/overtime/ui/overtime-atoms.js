/* ============================================================
   OVERTIME-ATOMS.JS — shared render helpers (Sprint 7 file-split)

   Extracted verbatim from overtime-center.js so every new screen file
   (Analytics, Reports, Records, Closing, Archive...) can import them
   instead of redefining — behavior-preserving, no logic change.
   overtime-center.js itself now imports from here too.
   ============================================================ */

'use strict';

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const p = String(iso).split('-');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${p[2]} ${MONTHS[+p[1] - 1]} ${p[0]}`;
}

export function fmtMonth(yyyyMM) {
  const p = String(yyyyMM || '').split('-');
  if (p.length < 2) return yyyyMM || '—';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${MONTHS[+p[1] - 1]} ${p[0]}`;
}

export function rp(n) { return 'Rp' + Number(Math.round(n || 0)).toLocaleString('id-ID'); }

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function downloadCsv(filename, headerRow, rows) {
  const lines = [headerRow, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Consistent empty state (mirrors petty-cash-center.js emptyState). */
export function emptyState(title, sub) {
  return `
    <div style="padding:46px 24px;text-align:center">
      <div style="width:46px;height:46px;margin:0 auto 14px;border-radius:13px;background:var(--card2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/></svg></div>
      <div style="font-weight:700;font-size:14px;color:var(--text)">${esc(title)}</div>
      ${sub ? `<div style="font-size:12px;color:var(--muted);margin:4px auto 0;max-width:330px;line-height:1.5">${esc(sub)}</div>` : ''}
    </div>`;
}
