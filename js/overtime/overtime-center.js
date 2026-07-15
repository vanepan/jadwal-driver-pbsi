/* ============================================================
   OVERTIME-CENTER.JS — Admin-only platform module (embedded)

   Mounts into a platform-owned host container (#v2OvertimeWorkspace,
   class .ot-root so its scoped tokens resolve) via mountOvertime() and
   renders ONLY content + modals — the rail, panel, topbar, profile and
   theme are owned by the unified shell. setOvertimeScreen() (driven by
   the platform panel menu / mobile sub-nav) switches screens. Mirrors
   js/petty-cash/petty-cash-center.js exactly (mount/render/dispatch
   shape, full re-render with focus restoration, delegated data-act
   handling) — same architecture, new domain.

   v1.25.3 — FIX 1 (focus stability, HIGH PRIORITY): root-caused and
   fixed. Two problems compounded: (1) `bindDelegation()` bound BOTH
   'input' and 'change' to the SAME render()-triggering handler — when a
   focused, edited field was removed from the DOM by its own render(),
   the removal synchronously fired an implicit 'change' event that
   RE-ENTERED render() before the outer DOM mutation had finished,
   throwing (Chrome: "moved in a 'blur' event handler") and losing focus
   to <body>. Fixed: only 'input' is bound now, never both. (2) Plain
   form fields (name/amount/note/date) called render() on EVERY
   keystroke at all, which is unnecessary AND fragile — the proven
   pattern already used by js/petty-cash/petty-cash-center.js and
   js/engineering/ui/engineering-center.js is to update state ONLY for
   plain fields (the native input already shows what was typed; nothing
   needs to re-render until the next structural change). render() is now
   called ONLY for fields with live dependent UI (search/filter boxes,
   the Daily Entry unit/date pickers). Capture/restore itself is now the
   shared js/ui/focus-preserving-render.js (also used by Petty Cash).

   v1.25.3 — FIX 2/3: Employees is redesigned as a grouped, collapsible
   list (User Management style) — Unit is no longer a standalone screen,
   only a grouping label; Unit CRUD (add/rename/deactivate) is reachable
   inline from this screen. Employee gained `displayOrder` (up/down
   reorder within its unit) — Daily Entry's checklist follows it.

   Sprint 4 — Holiday Engine screen. Sprint 5 — Daily Entry (the core
   workflow: date → unit → checklist → save, holiday/rate auto-detected,
   batch save, duplicate detection, bulk copy, recent entry, favorite
   unit via localStorage). Sprint 6 — Employee History drawer (profile,
   totals, monthly/yearly bars, transactions, CSV export).
   ============================================================ */

'use strict';

import { isAdmin } from '../auth.js';
import { createFocusGuard } from '../ui/focus-preserving-render.js';
import { initOvertimeStore, registerChangeListener } from './overtime-store.js';
import * as svc from './overtime-service.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '<path d="M3 4a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM11 4a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM11 10a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6zM3 13a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z"/>' },
  { key: 'employees', label: 'Employees', icon: '<path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 18a7 7 0 0114 0H3z"/>' },
  { key: 'dailyEntry', label: 'Daily Entry', icon: '<path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm2 5a1 1 0 000 2h4a1 1 0 100-2H8zm-1 5a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clip-rule="evenodd"/>' },
  { key: 'rates', label: 'Rates', icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.09c-1.2.24-2.25 1-2.25 2.16 0 1.4 1.28 2 2.63 2.37l.37.1v2.4c-.6-.1-.98-.42-1-.87H6.7c.04 1.2 1.05 2.1 2.3 2.32V15a1 1 0 102 0v-.1c1.3-.23 2.4-1 2.4-2.28 0-1.45-1.36-2.03-2.65-2.38l-.37-.1V7.8c.5.1.85.4.87.8H12.9c-.05-1.14-1-2-2.2-2.24V5z" clip-rule="evenodd"/>' },
  { key: 'holidays', label: 'Holidays', icon: '<path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>' },
];

const FAVORITE_UNIT_KEY = 'ot_favorite_unit';

/* ── Module state ────────────────────────────────────────────────── */
const st = {
  screen: 'dashboard',

  // Unit (modal only — no standalone screen, FIX 2)
  unitModalOpen: false, editUnitId: null,
  unitForm: { name: '' }, unitFormErr: '',

  // Employees (grouped by unit)
  employeeSearch: '',
  collapsedUnits: {},
  employeeModalOpen: false, editEmployeeId: null,
  employeeForm: { name: '', unitId: '', note: '' }, employeeFormErr: '',
  historyEmployeeId: null,

  // Rates
  rateModalOpen: false, rateModalTierKey: null,
  rateForm: { amount: '', effectiveFrom: '', note: '' }, rateFormErr: '',
  expandedTierKey: null,

  // Holidays
  holidaySearch: '',
  holidayModalOpen: false, editHolidayId: null,
  holidayForm: { date: '', name: '', type: 'national', tierKey: 'nationalHoliday', note: '' }, holidayFormErr: '',

  // Daily Entry
  entryDate: '',
  entryUnitId: '',
  entrySelected: {},
  entryOverrideOn: false, entryOverrideTierKey: '', entryOverrideNote: '',
  entryConfirmDuplicates: false,
  entryErr: '',

  toast: null, _toastT: null,
};

let root = null, bound = false, opened = false, listening = false;
const focusGuard = createFocusGuard();

/* ── Small helpers ───────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function setState(patch) { Object.assign(st, patch); render(); }
function toast(msg) {
  if (st._toastT) clearTimeout(st._toastT);
  st._toastT = setTimeout(() => { st.toast = null; render(); }, 2600);
  setState({ toast: msg });
}
function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso) {
  if (!iso) return '—';
  const p = String(iso).split('-');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${p[2]} ${MONTHS[+p[1] - 1]} ${p[0]}`;
}
function fmtMonth(yyyyMM) {
  const p = String(yyyyMM || '').split('-');
  if (p.length < 2) return yyyyMM || '—';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${MONTHS[+p[1] - 1]} ${p[0]}`;
}
function rp(n) { return 'Rp' + Number(Math.round(n || 0)).toLocaleString('id-ID'); }
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDaysISO(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv(filename, headerRow, rows) {
  const lines = [headerRow, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Consistent empty state (mirrors petty-cash-center.js emptyState) ── */
function emptyState(title, sub) {
  return `
    <div style="padding:46px 24px;text-align:center">
      <div style="width:46px;height:46px;margin:0 auto 14px;border-radius:13px;background:var(--card2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/></svg></div>
      <div style="font-weight:700;font-size:14px;color:var(--text)">${esc(title)}</div>
      ${sub ? `<div style="font-size:12px;color:var(--muted);margin:4px auto 0;max-width:330px;line-height:1.5">${esc(sub)}</div>` : ''}
    </div>`;
}

function syncTheme() {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (root) root.setAttribute('data-theme', t);
}

/** Mount the module into a platform-owned host container (admin only). */
export async function mountOvertime(container) {
  if (!isAdmin()) { console.warn('[Overtime] admin only'); return; }
  if (!container) { console.warn('[Overtime] mount container missing'); return; }
  root = container;
  if (!root.classList.contains('ot-root')) root.classList.add('ot-root');
  bindDelegation();
  opened = true;
  syncTheme();
  if (!st.entryDate) st.entryDate = todayISO();
  render();
  await initOvertimeStore();
  if (!st.entryUnitId) st.entryUnitId = resolveFavoriteUnit();
  if (!listening) { listening = true; registerChangeListener(() => { if (opened) render(); }); }
  render();
}

function resolveFavoriteUnit() {
  const units = svc.listActiveUnits();
  if (!units.length) return '';
  let fav = null;
  try { fav = localStorage.getItem(FAVORITE_UNIT_KEY); } catch (_) {}
  return units.some(u => u.id === fav) ? fav : units[0].id;
}

/** Switch the active screen — driven by the platform panel menu / mobile sub-nav. */
export function setOvertimeScreen(key) {
  opened = true;
  st.screen = key;
  st.unitModalOpen = false; st.editUnitId = null;
  st.employeeModalOpen = false; st.editEmployeeId = null;
  st.rateModalOpen = false; st.rateModalTierKey = null;
  st.holidayModalOpen = false; st.editHolidayId = null;
  render();
}

/** Current active screen key. */
export function getOvertimeScreen() { return st.screen; }

/** Adaptive global-search hook (mirrors setPettyCashSearch) — filters the
    Employee list (the module's primary search surface); jumps to that
    screen if the query starts elsewhere. */
export function setOvertimeSearch(q) {
  if (!opened) return;
  st.employeeSearch = q || '';
  if (st.employeeSearch && st.screen !== 'employees') st.screen = 'employees';
  render();
}

/** Leaving the module — keep state, stop reacting to store changes while hidden. */
export function closeOvertimeCenter() { opened = false; }

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  if (!root || !opened) return;
  syncTheme();
  focusGuard.capture(root);
  root.innerHTML = shell();
  focusGuard.restore(root);
}

function shell() {
  return `
  <div class="ot-embed" style="width:100%;background:var(--bg);color:var(--text)">
    ${embedNav()}
    <div style="overflow-x:hidden">
      <div class="ot-content-pad">
        ${content()}
      </div>
    </div>
  </div>
  ${st.unitModalOpen ? unitModal() : ''}
  ${st.employeeModalOpen ? employeeModal() : ''}
  ${st.historyEmployeeId ? employeeHistoryDrawer() : ''}
  ${st.rateModalOpen ? rateModal() : ''}
  ${st.holidayModalOpen ? holidayModal() : ''}
  ${st.toast ? toastEl() : ''}`;
}

/* Mobile-only in-content screen switcher (hidden ≥768px via overtime.css —
   the platform panel menu handles navigation on desktop). */
function embedNav() {
  const items = NAV.map(n => {
    const act = n.key === st.screen;
    return `
    <button data-act="nav" data-id="${n.key}" type="button"
      style="flex:none;display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:9px;border:1px solid ${act ? 'var(--primary)' : 'var(--border)'};background:${act ? 'var(--primary-tint)' : 'var(--card)'};color:${act ? 'var(--primary-text)' : 'var(--text)'};font-size:13px;font-weight:${act ? '700' : '600'};white-space:nowrap;cursor:pointer">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">${n.icon}</svg>
      ${n.label}
    </button>`;
  }).join('');
  return `<div class="ot-embed-nav" style="display:flex;gap:8px;overflow-x:auto;padding:14px 16px 4px;-webkit-overflow-scrolling:touch">${items}</div>`;
}

function content() {
  if (st.screen === 'employees') return employeesScreen();
  if (st.screen === 'dailyEntry') return dailyEntryScreen();
  if (st.screen === 'rates') return ratesScreen();
  if (st.screen === 'holidays') return holidaysScreen();
  return dashboardScreen();
}

/* ── Dashboard ──────────────────────────────────────────────────── */
function dashboardScreen() {
  const units = svc.listUnits();
  const employees = svc.listEmployees();
  const activeEmployees = employees.filter(e => e.isActive !== false).length;
  const today = todayISO();
  const daily = svc.listRecordsForDate(today);
  const todayCount = daily.length;
  const todayAmount = daily.reduce((a, r) => a + (r.rateAmount || 0), 0);

  const card = (label, value, tone) => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 20px;flex:1;min-width:150px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--label);text-transform:uppercase">${esc(label)}</div>
      <div style="font-size:26px;font-weight:800;margin-top:6px;color:${tone || 'var(--text)'}">${value}</div>
    </div>`;
  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Overtime Management</h2>
      <div style="font-size:13px;color:var(--muted)">Rekap lembur seluruh unit Bidang Sarana dan Prasarana.</div>
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px">
      ${card('Lembur Hari Ini', todayCount, 'var(--primary)')}
      ${card('Nominal Hari Ini', rp(todayAmount), 'var(--green)')}
      ${card('Total Karyawan', employees.length, 'var(--text)')}
      ${card('Karyawan Aktif', activeEmployees, 'var(--green)')}
      ${card('Unit', units.length, 'var(--text)')}
    </div>
    <div style="margin-top:22px;padding:16px 18px;background:var(--card2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.6">
      Analytics penuh dan Reports akan hadir pada sprint berikutnya — Dashboard ini sudah
      membaca ringkasan harian, bukan menghitung ulang seluruh transaksi setiap dibuka.
    </div>`;
}

/* ── Employees screen (grouped by Unit — FIX 2/3) ──────────────────
   Unit is presentation-only grouping here (no standalone screen); Unit
   CRUD (add/rename/deactivate) is reachable inline via the group header
   and the "+ Tambah Unit" action. Employee is the primary master data:
   click a name to open its History drawer (Sprint 6); reorder within a
   group with the up/down arrows (FIX 3 — displayOrder). */
function employeesScreen() {
  const q = st.employeeSearch.trim().toLowerCase();
  const units = svc.listUnits();
  const searching = !!q;

  const groups = units.map(unit => {
    const members = svc.listEmployees({ unitId: unit.id })
      .filter(e => !q || e.name.toLowerCase().includes(q));
    if (searching && !members.length) return '';
    const collapsed = !searching && !!st.collapsedUnits[unit.id];

    const rows = members.map((e, idx) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px 10px 40px;border-top:1px solid var(--border)">
        <div style="display:flex;flex-direction:column;gap:1px">
          <button data-act="moveEmployeeUp" data-id="${e.id}" type="button" ${idx === 0 ? 'disabled' : ''} style="border:none;background:none;color:${idx === 0 ? 'var(--border)' : 'var(--muted)'};cursor:${idx === 0 ? 'default' : 'pointer'};padding:0;line-height:1"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6l-5 5h10z"/></svg></button>
          <button data-act="moveEmployeeDown" data-id="${e.id}" type="button" ${idx === members.length - 1 ? 'disabled' : ''} style="border:none;background:none;color:${idx === members.length - 1 ? 'var(--border)' : 'var(--muted)'};cursor:${idx === members.length - 1 ? 'default' : 'pointer'};padding:0;line-height:1"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path d="M10 14l5-5H5z"/></svg></button>
        </div>
        <div style="width:7px;height:7px;border-radius:50%;flex:none;background:${e.isActive !== false ? 'var(--green)' : 'var(--muted)'}"></div>
        <button data-act="openEmployeeHistory" data-id="${e.id}" type="button" style="flex:1;min-width:0;text-align:left;background:none;border:none;padding:0;cursor:pointer">
          <div style="font-weight:700;font-size:13.5px;color:var(--text)">${esc(e.name)}</div>
          ${e.note ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(e.note)}</div>` : ''}
        </button>
        <span style="font-size:10.5px;font-weight:700;letter-spacing:.3px;padding:3px 9px;border-radius:999px;background:${e.isActive !== false ? 'var(--green-tint)' : 'var(--border2)'};color:${e.isActive !== false ? 'var(--green)' : 'var(--muted)'};border:1px solid ${e.isActive !== false ? 'var(--green-bd)' : 'var(--border)'}">${e.isActive !== false ? 'Aktif' : 'Nonaktif'}</span>
        <button data-act="openEditEmployee" data-id="${e.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">Edit</button>
        <button data-act="toggleEmployeeActive" data-id="${e.id}" data-active="${e.isActive !== false ? '0' : '1'}" type="button" style="border:1px solid var(--border);background:var(--card);color:${e.isActive !== false ? 'var(--crit,#9a1b2d)' : 'var(--green)'};border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">${e.isActive !== false ? 'Nonaktifkan' : 'Aktifkan'}</button>
      </div>`).join('');

    return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--card2)">
        <button data-act="toggleUnitGroup" data-id="${unit.id}" type="button" style="border:none;background:none;color:var(--muted);cursor:pointer;padding:0;display:flex;transform:rotate(${collapsed ? '-90deg' : '0deg'});transition:transform .15s">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
        </button>
        <div style="flex:1;min-width:0;font-weight:800;font-size:13.5px;color:var(--text)">${esc(unit.name)}</div>
        <span style="font-size:11px;font-weight:700;color:var(--muted);background:var(--border2);border-radius:999px;padding:2px 9px">${members.length}</span>
        ${unit.isActive === false ? `<span style="font-size:10px;font-weight:700;color:var(--muted)">NONAKTIF</span>` : ''}
        <button data-act="openEditUnit" data-id="${unit.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer">Edit</button>
        <button data-act="toggleUnitActive" data-id="${unit.id}" data-active="${unit.isActive !== false ? '0' : '1'}" type="button" style="border:1px solid var(--border);background:var(--card);color:${unit.isActive !== false ? 'var(--crit,#9a1b2d)' : 'var(--green)'};border-radius:8px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer">${unit.isActive !== false ? 'Nonaktifkan' : 'Aktifkan'}</button>
      </div>
      ${collapsed ? '' : (rows || `<div style="padding:16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)">Belum ada karyawan di unit ini.</div>`)}
    </div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0 14px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Employees</h2>
        <div style="font-size:13px;color:var(--muted)">Master data utama, dikelompokkan per unit — klik nama untuk riwayat.</div>
      </div>
      <div style="display:flex;gap:8px">
        <button data-act="openAddUnit" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer">+ Unit</button>
        <button data-act="openAddEmployee" type="button" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer">+ Tambah Karyawan</button>
      </div>
    </div>
    <div style="margin-bottom:14px">
      <input data-focus="employeeSearch" data-act="input:employeeSearch" type="text" value="${esc(st.employeeSearch)}" placeholder="Cari nama karyawan…"
        style="width:100%;max-width:320px;padding:9px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px" />
    </div>
    ${groups || emptyState('Belum ada unit', 'Tambahkan unit pertama untuk mulai mengelompokkan karyawan.')}
  `;
}

function unitModal() {
  const editing = !!st.editUnitId;
  return `
  <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
    <div data-act="closeUnitModal" style="position:absolute;inset:0"></div>
    <form data-act="submitUnit" style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:400px;padding:22px">
      <div style="font-weight:800;font-size:15px;margin-bottom:14px">${editing ? 'Edit Unit' : 'Tambah Unit'}</div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin-bottom:6px">Nama Unit</label>
      <input data-focus="unitFormName" data-act="statefield:unitForm.name" type="text" value="${esc(st.unitForm.name)}" autofocus
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      ${st.unitFormErr ? `<div style="color:var(--primary);font-size:12px;margin-top:8px">${esc(st.unitFormErr)}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button data-act="closeUnitModal" type="button" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button type="submit" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button>
      </div>
    </form>
  </div>`;
}

function employeeModal() {
  const editing = !!st.editEmployeeId;
  const units = svc.listActiveUnits();
  const unitOptions = units.map(u => `<option value="${esc(u.id)}" ${st.employeeForm.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  return `
  <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
    <div data-act="closeEmployeeModal" style="position:absolute;inset:0"></div>
    <form data-act="submitEmployee" style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:400px;padding:22px">
      <div style="font-weight:800;font-size:15px;margin-bottom:14px">${editing ? 'Edit Karyawan' : 'Tambah Karyawan'}</div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin-bottom:6px">Nama</label>
      <input data-focus="employeeFormName" data-act="statefield:employeeForm.name" type="text" value="${esc(st.employeeForm.name)}" autofocus
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Unit</label>
      <select data-act="statefield:employeeForm.unitId" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
        <option value="">— Pilih Unit —</option>
        ${unitOptions}
      </select>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Catatan <span style="font-weight:400;color:var(--muted)">(opsional)</span></label>
      <textarea data-focus="employeeFormNote" data-act="statefield:employeeForm.note" rows="2"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;font-family:inherit;resize:vertical">${esc(st.employeeForm.note)}</textarea>
      ${st.employeeFormErr ? `<div style="color:var(--primary);font-size:12px;margin-top:8px">${esc(st.employeeFormErr)}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button data-act="closeEmployeeModal" type="button" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button type="submit" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button>
      </div>
    </form>
  </div>`;
}

/* ── Employee History drawer (Sprint 6) ────────────────────────────── */
function miniBarChart(series, labelFn, valueKey) {
  if (!series.length) return `<div style="font-size:12px;color:var(--muted);padding:10px 0">Belum ada data.</div>`;
  const max = Math.max(1, ...series.map(s => s[valueKey]));
  const bars = series.map(s => {
    const h = Math.max(4, Math.round((s[valueKey] / max) * 80));
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0">
      <div style="font-size:9px;color:var(--muted)">${s.count}</div>
      <div style="width:100%;max-width:24px;height:${h}px;background:var(--primary);border-radius:4px 4px 0 0"></div>
      <div style="font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(labelFn(s))}</div>
    </div>`;
  }).join('');
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:110px;padding:8px 4px;overflow-x:auto">${bars}</div>`;
}

function employeeHistoryDrawer() {
  const employee = svc.listEmployees().find(e => e.id === st.historyEmployeeId);
  if (!employee) return '';
  const unit = svc.getUnitLabel(employee.unitId) || '—';
  const h = svc.employeeHistory(employee.id);
  const txRows = h.transactions.slice(0, 30).map(r => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;font-size:12.5px;color:var(--text)">${fmtDate(r.date)}</div>
      <div style="font-size:11.5px;color:var(--muted)">${esc(r.tierKey)}${r.overrideApplied ? ' · override' : ''}</div>
      <div style="font-size:12.5px;font-weight:700;color:var(--text)">${rp(r.rateAmount)}</div>
    </div>`).join('');

  return `
  <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1650;display:flex;align-items:center;justify-content:flex-end">
    <div data-act="closeEmployeeHistory" style="position:absolute;inset:0"></div>
    <div style="position:relative;background:var(--card);height:100%;width:100%;max-width:460px;padding:24px;overflow-y:auto;box-shadow:var(--shadow-lg)">
      <button data-act="closeEmployeeHistory" type="button" style="position:absolute;top:18px;right:18px;border:none;background:none;color:var(--muted);cursor:pointer">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>
      <div style="font-weight:800;font-size:17px;color:var(--text)">${esc(employee.name)}</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${esc(unit)} · ${employee.isActive !== false ? 'Aktif' : 'Nonaktif'}</div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <div style="flex:1;min-width:120px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
          <div style="font-size:10.5px;font-weight:700;color:var(--label);text-transform:uppercase">Total Hari</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px">${h.totalDays}</div>
        </div>
        <div style="flex:1;min-width:120px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
          <div style="font-size:10.5px;font-weight:700;color:var(--label);text-transform:uppercase">Total Nominal</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px">${rp(h.totalAmount)}</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <div style="flex:1;min-width:120px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
          <div style="font-size:10.5px;font-weight:700;color:var(--label);text-transform:uppercase">Rata² / Bulan</div>
          <div style="font-size:15px;font-weight:800;margin-top:4px">${rp(h.avgPerMonth)}</div>
        </div>
        <div style="flex:1;min-width:120px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
          <div style="font-size:10.5px;font-weight:700;color:var(--label);text-transform:uppercase">Rata² / Tahun</div>
          <div style="font-size:15px;font-weight:800;margin-top:4px">${rp(h.avgPerYear)}</div>
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:10px">
        Terakhir lembur: ${fmtDate(h.lastOvertime)} · Bulan paling aktif: ${h.mostActiveMonth ? fmtMonth(h.mostActiveMonth) : '—'}
      </div>

      <div style="font-weight:700;font-size:12.5px;color:var(--text);margin-top:20px">Grafik Bulanan</div>
      ${miniBarChart(h.monthlySeries.slice(-12), s => fmtMonth(s.month), 'amount')}

      <div style="font-weight:700;font-size:12.5px;color:var(--text);margin-top:14px">Grafik Tahunan</div>
      ${miniBarChart(h.yearlySeries, s => s.year, 'amount')}

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px">
        <div style="font-weight:700;font-size:12.5px;color:var(--text)">Daftar Transaksi</div>
        <button data-act="exportEmployeeHistoryCsv" data-id="${employee.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:600;cursor:pointer">Export CSV</button>
      </div>
      <div style="margin-top:6px">${txRows || emptyState('Belum ada transaksi')}</div>
    </div>
  </div>`;
}

/* ── Rates screen (Sprint 3) ───────────────────────────────────────── */
function ratesScreen() {
  const tiers = svc.listRateTiers();
  const cards = tiers.map(t => {
    const active = svc.getActiveRate(t.key, todayISO());
    const versions = svc.listRateVersions(t.key);
    const expanded = st.expandedTierKey === t.key;
    const historyRows = versions.map(v => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--border);${v.isActive === false ? 'opacity:.55' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;color:var(--text)">${rp(v.amount)} <span style="font-weight:500;color:var(--muted)">· berlaku ${fmtDate(v.effectiveFrom)}</span></div>
          ${v.note ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(v.note)}</div>` : ''}
        </div>
        ${v.isActive === false
          ? `<span style="font-size:10px;font-weight:700;color:var(--muted);padding:2px 8px;border-radius:999px;background:var(--border2)">Dihapus</span>
             <button data-act="restoreRateVersion" data-id="${v.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--green);border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer">Pulihkan</button>`
          : `<button data-act="deleteRateVersion" data-id="${v.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--crit,#9a1b2d);border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer">Hapus</button>`}
      </div>`).join('');

    return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 18px">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--label);text-transform:uppercase">${esc(t.label)}${t.key === 'normal' ? ' · Default' : ''}</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px;color:var(--text)">${active ? rp(active.amount) : '—'}</div>
          ${active ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px">Berlaku sejak ${fmtDate(active.effectiveFrom)}</div>` : `<div style="font-size:11.5px;color:var(--muted);margin-top:2px">Belum ada tarif aktif</div>`}
        </div>
        <button data-act="openRateVersionModal" data-id="${t.key}" type="button" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:9px 14px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">Ubah Tarif</button>
        <button data-act="toggleRateHistory" data-id="${t.key}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;padding:9px 12px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap">${expanded ? 'Sembunyikan' : 'Riwayat'}</button>
      </div>
      ${expanded ? (historyRows || `<div style="padding:14px 18px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)">Belum ada riwayat.</div>`) : ''}
    </div>`;
  }).join('');

  return `
    <div style="padding:18px 0 14px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Overtime Rate Engine</h2>
      <div style="font-size:13px;color:var(--muted)">Tarif tidak hardcoded — setiap perubahan membuat versi baru, riwayat lama tidak pernah berubah.</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">${cards}</div>`;
}

function rateModal() {
  const tierKey = st.rateModalTierKey;
  const tier = svc.listRateTiers().find(t => t.key === tierKey);
  return `
  <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
    <div data-act="closeRateModal" style="position:absolute;inset:0"></div>
    <form data-act="submitRateVersion" style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:400px;padding:22px">
      <div style="font-weight:800;font-size:15px;margin-bottom:4px">Ubah Tarif — ${esc(tier ? tier.label : '')}</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Membuat versi baru. Tarif lama tetap tersimpan sebagai riwayat.</div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin-bottom:6px">Nominal (Rp)</label>
      <input data-focus="rateFormAmount" data-act="statefield:rateForm.amount" type="number" min="0" step="1000" value="${esc(st.rateForm.amount)}" autofocus
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Berlaku Mulai</label>
      <input data-focus="rateFormEffectiveFrom" data-act="statefield:rateForm.effectiveFrom" type="date" value="${esc(st.rateForm.effectiveFrom)}"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Catatan <span style="font-weight:400;color:var(--muted)">(opsional)</span></label>
      <textarea data-focus="rateFormNote" data-act="statefield:rateForm.note" rows="2"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;font-family:inherit;resize:vertical">${esc(st.rateForm.note)}</textarea>
      ${st.rateFormErr ? `<div style="color:var(--primary);font-size:12px;margin-top:8px">${esc(st.rateFormErr)}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button data-act="closeRateModal" type="button" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button type="submit" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button>
      </div>
    </form>
  </div>`;
}

/* ── Holidays screen (Sprint 4) ─────────────────────────────────────── */
function holidaysScreen() {
  const q = st.holidaySearch.trim();
  const holidays = svc.searchHolidays(q);
  const rows = holidays.map(h => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:50%;flex:none;background:${h.isActive !== false ? 'var(--green)' : 'var(--muted)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13.5px;color:var(--text)">${esc(h.name)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${fmtDate(h.date)} · ${esc(svc.listHolidayTypes().find(t => t.key === h.type)?.label || h.type)} · ${esc(svc.listRateTiers().find(t => t.key === h.tierKey)?.label || h.tierKey)}${h.note ? ' · ' + esc(h.note) : ''}</div>
      </div>
      <span style="font-size:10.5px;font-weight:700;letter-spacing:.3px;padding:3px 9px;border-radius:999px;background:${h.isActive !== false ? 'var(--green-tint)' : 'var(--border2)'};color:${h.isActive !== false ? 'var(--green)' : 'var(--muted)'};border:1px solid ${h.isActive !== false ? 'var(--green-bd)' : 'var(--border)'}">${h.isActive !== false ? 'Aktif' : 'Nonaktif'}</span>
      <button data-act="openEditHoliday" data-id="${h.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">Edit</button>
      <button data-act="toggleHolidayActive" data-id="${h.id}" data-active="${h.isActive !== false ? '0' : '1'}" type="button" style="border:1px solid var(--border);background:var(--card);color:${h.isActive !== false ? 'var(--crit,#9a1b2d)' : 'var(--green)'};border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">${h.isActive !== false ? 'Nonaktifkan' : 'Aktifkan'}</button>
    </div>`).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0 14px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Holiday Calendar</h2>
        <div style="font-size:13px;color:var(--muted)">Daily Entry otomatis mengetahui tarif hari libur — tanpa klik tambahan.</div>
      </div>
      <button data-act="openAddHoliday" type="button" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer">+ Tambah Hari Libur</button>
    </div>
    <div style="margin-bottom:14px">
      <input data-focus="holidaySearch" data-act="input:holidaySearch" type="text" value="${esc(st.holidaySearch)}" placeholder="Cari nama atau tanggal (yyyy-mm-dd)…"
        style="width:100%;max-width:320px;padding:9px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px" />
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden">
      ${rows || emptyState('Belum ada hari libur', q ? 'Tidak ada hasil yang cocok.' : 'Tambahkan hari libur nasional, cuti bersama, atau custom.')}
    </div>`;
}

function holidayModal() {
  const editing = !!st.editHolidayId;
  const typeOptions = svc.listHolidayTypes().map(t => `<option value="${t.key}" ${st.holidayForm.type === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const tierOptions = svc.listRateTiers().map(t => `<option value="${t.key}" ${st.holidayForm.tierKey === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  return `
  <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
    <div data-act="closeHolidayModal" style="position:absolute;inset:0"></div>
    <form data-act="submitHoliday" style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:400px;padding:22px;max-height:90vh;overflow-y:auto">
      <div style="font-weight:800;font-size:15px;margin-bottom:14px">${editing ? 'Edit Hari Libur' : 'Tambah Hari Libur'}</div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin-bottom:6px">Tanggal</label>
      <input data-focus="holidayFormDate" data-act="statefield:holidayForm.date" type="date" value="${esc(st.holidayForm.date)}" autofocus
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Nama</label>
      <input data-focus="holidayFormName" data-act="statefield:holidayForm.name" type="text" value="${esc(st.holidayForm.name)}"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Jenis</label>
      <select data-act="statefield:holidayForm.type" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
        ${typeOptions}
      </select>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Tarif</label>
      <select data-act="statefield:holidayForm.tierKey" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
        ${tierOptions}
      </select>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Catatan <span style="font-weight:400;color:var(--muted)">(opsional)</span></label>
      <textarea data-focus="holidayFormNote" data-act="statefield:holidayForm.note" rows="2"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;font-family:inherit;resize:vertical">${esc(st.holidayForm.note)}</textarea>
      ${st.holidayFormErr ? `<div style="color:var(--primary);font-size:12px;margin-top:8px">${esc(st.holidayFormErr)}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button data-act="closeHolidayModal" type="button" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button type="submit" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button>
      </div>
    </form>
  </div>`;
}

/* ── Daily Entry screen (Sprint 5 — the core workflow) ─────────────── */
function dailyEntryScreen() {
  const units = svc.listActiveUnits();
  const date = st.entryDate || todayISO();
  const unit = units.find(u => u.id === st.entryUnitId) || null;
  const employees = unit ? svc.listActiveEmployees(unit.id) : [];
  const selectedIds = Object.keys(st.entrySelected).filter(id => st.entrySelected[id]);
  const resolved = st.entryOverrideOn && st.entryOverrideTierKey
    ? svc.getActiveRate(st.entryOverrideTierKey, date)
    : svc.resolveEntryRate(date);
  const tierOptions = svc.listRateTiers().map(t => `<option value="${t.key}" ${st.entryOverrideTierKey === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const unitOptions = units.map(u => `<option value="${esc(u.id)}" ${st.entryUnitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');

  const existingIds = unit ? new Set(svc.listRecordsForDate(date, unit.id).map(r => r.employeeId)) : new Set();
  const checklist = employees.map(e => {
    const checked = !!st.entrySelected[e.id];
    const alreadyHas = existingIds.has(e.id);
    return `
    <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--border);cursor:pointer">
      <input data-act="toggleEntryEmployee" data-id="${e.id}" type="checkbox" ${checked ? 'checked' : ''} style="width:17px;height:17px;accent-color:var(--primary)" />
      <span style="flex:1;font-size:13.5px;font-weight:600;color:var(--text)">${esc(e.name)}</span>
      ${alreadyHas ? `<span style="font-size:10px;font-weight:700;color:var(--amber,#a9781a);background:var(--amber-tint,#f8eed4);border:1px solid var(--amber-bd,#ecdcb2);border-radius:999px;padding:2px 8px">Sudah tercatat</span>` : ''}
    </label>`;
  }).join('');

  const recent = svc.listRecentRecords(6).map(r => {
    const emp = svc.listEmployees().find(e => e.id === r.employeeId);
    const u = svc.getUnitLabel(r.unitId);
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border);font-size:12px">
      <span style="flex:1;color:var(--text)">${esc(emp ? emp.name : '—')} · ${esc(u || '—')}</span>
      <span style="color:var(--muted)">${fmtDate(r.date)}</span>
    </div>`;
  }).join('');

  const duplicateWarning = st.entryConfirmDuplicates
    ? `<div style="background:var(--amber-tint,#f8eed4);border:1px solid var(--amber-bd,#ecdcb2);color:var(--amber,#a9781a);border-radius:10px;padding:10px 14px;font-size:12.5px;margin-top:12px">Beberapa karyawan sudah memiliki entri pada tanggal &amp; unit ini. Klik <b>Simpan</b> sekali lagi untuk tetap menyimpan.</div>`
    : '';

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Daily Entry</h2>
      <div style="font-size:13px;color:var(--muted)">Tanggal → Unit → Checklist → Save. Tidak ada dialog tambahan.</div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
      <div style="flex:1;min-width:160px">
        <label style="display:block;font-size:11px;font-weight:700;color:var(--label);margin-bottom:6px">Tanggal</label>
        <input data-focus="entryDate" data-act="input:entryDate" type="date" value="${esc(date)}"
          style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      </div>
      <div style="flex:1;min-width:160px">
        <label style="display:block;font-size:11px;font-weight:700;color:var(--label);margin-bottom:6px">Unit</label>
        <select data-focus="entryUnitId" data-act="input:entryUnitId" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
          <option value="">— Pilih Unit —</option>
          ${unitOptions}
        </select>
      </div>
    </div>

    <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="font-size:11px;font-weight:700;color:var(--label);text-transform:uppercase">Tarif Berlaku</div>
        <div style="font-size:16px;font-weight:800;margin-top:2px">${resolved ? `${rp(resolved.amount)} <span style="font-size:11.5px;font-weight:600;color:var(--muted)">(${esc(resolved.tierLabel)}${resolved.holiday ? ' · ' + esc(resolved.holiday.name) : ''})</span>` : '<span style="color:var(--crit,#9a1b2d)">Belum tersedia</span>'}</div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer">
        <input data-act="toggleEntryOverride" type="checkbox" ${st.entryOverrideOn ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--primary)" />
        Override Rate
      </label>
      ${st.entryOverrideOn ? `<select data-act="statefield:entryOverrideTierKey" style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:12.5px">
          <option value="">— Pilih Tarif —</option>
          ${tierOptions}
        </select>` : ''}
    </div>

    ${unit ? `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px">
      <div style="font-weight:700;font-size:13px;color:var(--text)">Checklist — ${esc(unit.name)} (${selectedIds.length} dipilih)</div>
      <button data-act="bulkCopyYesterday" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer">Salin dari Kemarin</button>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-top:8px">
      ${checklist || emptyState('Belum ada karyawan aktif di unit ini')}
    </div>
    ${duplicateWarning}
    ${st.entryErr ? `<div style="color:var(--primary);font-size:12.5px;margin-top:10px">${esc(st.entryErr)}</div>` : ''}
    <button data-act="saveDailyEntry" type="button" style="width:100%;margin-top:14px;background:var(--primary);color:var(--primary-fg);border:none;border-radius:11px;padding:13px;font-size:14px;font-weight:700;cursor:pointer">${st.entryConfirmDuplicates ? 'Simpan Tetap' : 'Save'}</button>
    ` : `<div style="margin-top:16px">${emptyState('Pilih unit terlebih dahulu')}</div>`}

    <div style="margin-top:22px">
      <div style="font-weight:700;font-size:12.5px;color:var(--text);margin-bottom:6px">Recent Entry</div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 14px">
        ${recent || `<div style="font-size:12px;color:var(--muted)">Belum ada entri.</div>`}
      </div>
    </div>`;
}

function toastEl() {
  return `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:1700;box-shadow:var(--shadow-lg)">${esc(st.toast)}</div>`;
}

/* ── Delegated events ─────────────────────────────────────────────── */
function bindDelegation() {
  if (bound) return; bound = true;
  root.addEventListener('click', onClick);
  // FIX 1: 'input' ONLY — never also 'change' on the same delegated root
  // bound to a render()-triggering handler (see file header for the exact
  // reentrancy bug this caused).
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
}

function actorEl(e) { return e.target.closest('[data-act]'); }

/** Set a nested state path like "employeeForm.name" without calling
    render() — see FIX 1: plain fields never re-render on every keystroke. */
function setStateField(path, value) {
  const parts = path.split('.');
  let obj = st;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  obj[parts[parts.length - 1]] = value;
}

async function onClick(e) {
  const el = actorEl(e);
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  switch (act) {
    case 'stop': e.stopPropagation(); return;
    case 'nav': setState({ screen: id }); return;

    // Unit
    case 'openAddUnit': setState({ unitModalOpen: true, editUnitId: null, unitForm: { name: '' }, unitFormErr: '' }); return;
    case 'openEditUnit': {
      const u = svc.listUnits().find(x => x.id === id);
      if (!u) return;
      setState({ unitModalOpen: true, editUnitId: id, unitForm: { name: u.name }, unitFormErr: '' });
      return;
    }
    case 'closeUnitModal': setState({ unitModalOpen: false, editUnitId: null }); return;
    case 'toggleUnitActive': {
      const nextActive = el.dataset.active === '1';
      try { await svc.setUnitActive(id, nextActive); toast(nextActive ? 'Unit diaktifkan.' : 'Unit dinonaktifkan.'); }
      catch (err) { toast(err.message || 'Gagal memperbarui unit.'); }
      return;
    }
    case 'toggleUnitGroup': {
      const collapsedUnits = { ...st.collapsedUnits, [id]: !st.collapsedUnits[id] };
      setState({ collapsedUnits });
      return;
    }

    // Employee
    case 'openAddEmployee': setState({ employeeModalOpen: true, editEmployeeId: null, employeeForm: { name: '', unitId: '', note: '' }, employeeFormErr: '' }); return;
    case 'openEditEmployee': {
      const emp = svc.listEmployees().find(x => x.id === id);
      if (!emp) return;
      setState({ employeeModalOpen: true, editEmployeeId: id, employeeForm: { name: emp.name, unitId: emp.unitId, note: emp.note || '' }, employeeFormErr: '' });
      return;
    }
    case 'closeEmployeeModal': setState({ employeeModalOpen: false, editEmployeeId: null }); return;
    case 'toggleEmployeeActive': {
      const nextActive = el.dataset.active === '1';
      try { await svc.setEmployeeActive(id, nextActive); toast(nextActive ? 'Karyawan diaktifkan.' : 'Karyawan dinonaktifkan.'); }
      catch (err) { toast(err.message || 'Gagal memperbarui karyawan.'); }
      return;
    }
    case 'moveEmployeeUp': try { await svc.moveEmployee(id, 'up'); } catch (err) { toast(err.message || 'Gagal memindahkan.'); } return;
    case 'moveEmployeeDown': try { await svc.moveEmployee(id, 'down'); } catch (err) { toast(err.message || 'Gagal memindahkan.'); } return;
    case 'openEmployeeHistory': setState({ historyEmployeeId: id }); return;
    case 'closeEmployeeHistory': setState({ historyEmployeeId: null }); return;
    case 'exportEmployeeHistoryCsv': {
      const employee = svc.listEmployees().find(x => x.id === id);
      if (!employee) return;
      const h = svc.employeeHistory(id);
      const rows = h.transactions.map(r => [r.date, esc(svc.getUnitLabel(r.unitId) || ''), r.tierKey, r.rateAmount, r.overrideApplied ? 'override' : '']);
      downloadCsv(`riwayat-lembur-${employee.name.replace(/\s+/g, '-')}.csv`, ['Tanggal', 'Unit', 'Tarif', 'Nominal', 'Catatan'], rows);
      return;
    }

    // Rate
    case 'openRateVersionModal': setState({ rateModalOpen: true, rateModalTierKey: id, rateForm: { amount: '', effectiveFrom: todayISO(), note: '' }, rateFormErr: '' }); return;
    case 'closeRateModal': setState({ rateModalOpen: false, rateModalTierKey: null }); return;
    case 'toggleRateHistory': setState({ expandedTierKey: st.expandedTierKey === id ? null : id }); return;
    case 'deleteRateVersion': try { await svc.softDeleteRateVersion(id); toast('Tarif dihapus.'); } catch (err) { toast(err.message || 'Gagal menghapus tarif.'); } return;
    case 'restoreRateVersion': try { await svc.restoreRateVersion(id); toast('Tarif dipulihkan.'); } catch (err) { toast(err.message || 'Gagal memulihkan tarif.'); } return;

    // Holiday
    case 'openAddHoliday': setState({ holidayModalOpen: true, editHolidayId: null, holidayForm: { date: todayISO(), name: '', type: 'national', tierKey: 'nationalHoliday', note: '' }, holidayFormErr: '' }); return;
    case 'openEditHoliday': {
      const h = svc.listHolidays().find(x => x.id === id);
      if (!h) return;
      setState({ holidayModalOpen: true, editHolidayId: id, holidayForm: { date: h.date, name: h.name, type: h.type, tierKey: h.tierKey, note: h.note || '' }, holidayFormErr: '' });
      return;
    }
    case 'closeHolidayModal': setState({ holidayModalOpen: false, editHolidayId: null }); return;
    case 'toggleHolidayActive': {
      const nextActive = el.dataset.active === '1';
      try { await svc.setHolidayActive(id, nextActive); toast(nextActive ? 'Hari libur diaktifkan.' : 'Hari libur dinonaktifkan.'); }
      catch (err) { toast(err.message || 'Gagal memperbarui hari libur.'); }
      return;
    }

    // Daily Entry
    case 'toggleEntryEmployee': {
      const entrySelected = { ...st.entrySelected, [id]: !st.entrySelected[id] };
      setState({ entrySelected, entryConfirmDuplicates: false, entryErr: '' });
      return;
    }
    case 'toggleEntryOverride': setState({ entryOverrideOn: !st.entryOverrideOn, entryOverrideTierKey: '' }); return;
    case 'bulkCopyYesterday': {
      if (!st.entryUnitId) return;
      const yesterday = addDaysISO(st.entryDate || todayISO(), -1);
      const ids = svc.getEntryEmployeeIds(yesterday, st.entryUnitId);
      if (!ids.length) { toast('Tidak ada entri kemarin untuk unit ini.'); return; }
      const entrySelected = {};
      ids.forEach(id2 => { entrySelected[id2] = true; });
      setState({ entrySelected, entryConfirmDuplicates: false });
      toast(`${ids.length} karyawan disalin — periksa lalu Save.`);
      return;
    }
    case 'saveDailyEntry': {
      const selectedIds = Object.keys(st.entrySelected).filter(k => st.entrySelected[k]);
      if (!selectedIds.length) { setState({ entryErr: 'Pilih minimal satu karyawan.' }); return; }
      const date = st.entryDate || todayISO();
      if (!st.entryConfirmDuplicates) {
        const dupes = svc.findDuplicateEmployeeIds(date, st.entryUnitId, selectedIds);
        if (dupes.length) { setState({ entryConfirmDuplicates: true, entryErr: '' }); return; }
      }
      try {
        const overrideTierKey = st.entryOverrideOn && st.entryOverrideTierKey ? st.entryOverrideTierKey : null;
        const result = await svc.createDailyEntries({
          date, unitId: st.entryUnitId, employeeIds: selectedIds,
          overrideTierKey, overrideNote: st.entryOverrideNote,
        });
        try { localStorage.setItem(FAVORITE_UNIT_KEY, st.entryUnitId); } catch (_) {}
        setState({ entrySelected: {}, entryConfirmDuplicates: false, entryErr: '', entryOverrideOn: false, entryOverrideTierKey: '' });
        toast(`Tersimpan — ${result.count} karyawan · ${rp(result.rate.amount)}/orang.`);
      } catch (err) {
        setState({ entryErr: err.message || 'Gagal menyimpan.' });
      }
      return;
    }

    default: return;
  }
}

function onInput(e) {
  const el = actorEl(e);
  if (!el || !el.dataset.act) return;
  const act = el.dataset.act;

  // Plain form fields (modals): update state ONLY — never render() on every
  // keystroke. See FIX 1 in the file header for why.
  if (act.startsWith('statefield:')) {
    setStateField(act.slice('statefield:'.length), el.value);
    return;
  }

  // Live-filter / dependent-UI fields: DO re-render (capture/restore keeps
  // focus stable — verified safe as long as 'change' is never ALSO bound to
  // this same handler on the same root, which FIX 1 removed).
  if (act === 'input:employeeSearch') { st.employeeSearch = el.value; render(); return; }
  if (act === 'input:holidaySearch') { st.holidaySearch = el.value; render(); return; }
  if (act === 'input:entryDate') { st.entryDate = el.value; st.entryConfirmDuplicates = false; st.entryErr = ''; render(); return; }
  if (act === 'input:entryUnitId') { st.entryUnitId = el.value; st.entrySelected = {}; st.entryConfirmDuplicates = false; st.entryErr = ''; render(); return; }
}

async function onSubmit(e) {
  const el = actorEl(e);
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'submitUnit') {
    e.preventDefault();
    try {
      if (st.editUnitId) await svc.updateUnit(st.editUnitId, { name: st.unitForm.name });
      else await svc.createUnit({ name: st.unitForm.name });
      setState({ unitModalOpen: false, editUnitId: null });
      toast('Unit tersimpan.');
    } catch (err) {
      setState({ unitFormErr: err.message || 'Gagal menyimpan unit.' });
    }
    return;
  }
  if (act === 'submitEmployee') {
    e.preventDefault();
    const payload = { name: st.employeeForm.name, unitId: st.employeeForm.unitId, note: st.employeeForm.note };
    try {
      if (st.editEmployeeId) await svc.updateEmployee(st.editEmployeeId, payload);
      else await svc.createEmployee(payload);
      setState({ employeeModalOpen: false, editEmployeeId: null });
      toast('Karyawan tersimpan.');
    } catch (err) {
      setState({ employeeFormErr: err.message || 'Gagal menyimpan karyawan.' });
    }
    return;
  }
  if (act === 'submitRateVersion') {
    e.preventDefault();
    const payload = { tierKey: st.rateModalTierKey, amount: st.rateForm.amount, effectiveFrom: st.rateForm.effectiveFrom, note: st.rateForm.note };
    try {
      await svc.createRateVersion(payload);
      setState({ rateModalOpen: false, rateModalTierKey: null });
      toast('Tarif baru tersimpan.');
    } catch (err) {
      setState({ rateFormErr: err.message || 'Gagal menyimpan tarif.' });
    }
    return;
  }
  if (act === 'submitHoliday') {
    e.preventDefault();
    const payload = { date: st.holidayForm.date, name: st.holidayForm.name, type: st.holidayForm.type, tierKey: st.holidayForm.tierKey, note: st.holidayForm.note };
    try {
      if (st.editHolidayId) await svc.updateHoliday(st.editHolidayId, payload);
      else await svc.createHoliday(payload);
      setState({ holidayModalOpen: false, editHolidayId: null });
      toast('Hari libur tersimpan.');
    } catch (err) {
      setState({ holidayFormErr: err.message || 'Gagal menyimpan hari libur.' });
    }
    return;
  }
}
