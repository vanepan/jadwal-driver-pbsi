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
import { initPbsiDatepicker, syncPbsiDatepicker } from '../pbsi-datepicker.js';
import { initOvertimeStore, registerChangeListener } from './overtime-store.js';
import * as svc from './overtime-service.js';
import {
  esc, fmtDateTime, fmtDate, fmtMonth, rp, todayISO, addDaysISO, csvCell, downloadCsv, emptyState,
} from './ui/overtime-atoms.js';
import { renderAnalyticsScreen, analyticsActions } from './ui/overtime-analytics-view.js';
import { renderReportsScreen, reportsActions } from './ui/overtime-reports-view.js';
import { renderReportHistoryScreen, reportHistoryActions } from './ui/overtime-report-history-view.js';
import { renderRecordsScreen, renderEditRecordModal, recordsActions } from './ui/overtime-records-view.js';
import { renderClosingScreen, renderUnlockModal, closingActions } from './ui/overtime-closing-view.js';
import { renderArchiveScreen, archiveActions } from './ui/overtime-archive-view.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '<path d="M3 4a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM11 4a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM11 10a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6zM3 13a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z"/>' },
  { key: 'dailyEntry', label: 'Rekap Lembur', icon: '<path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm2 5a1 1 0 000 2h4a1 1 0 100-2H8zm-1 5a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clip-rule="evenodd"/>' },
  { key: 'employees', label: 'Karyawan', icon: '<path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 18a7 7 0 0114 0H3z"/>' },
  { key: 'rates', label: 'Tarif', icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.09c-1.2.24-2.25 1-2.25 2.16 0 1.4 1.28 2 2.63 2.37l.37.1v2.4c-.6-.1-.98-.42-1-.87H6.7c.04 1.2 1.05 2.1 2.3 2.32V15a1 1 0 102 0v-.1c1.3-.23 2.4-1 2.4-2.28 0-1.45-1.36-2.03-2.65-2.38l-.37-.1V7.8c.5.1.85.4.87.8H12.9c-.05-1.14-1-2-2.2-2.24V5z" clip-rule="evenodd"/>' },
  { key: 'holidays', label: 'Hari Libur', icon: '<path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>' },
  { key: 'reports', label: 'Laporan', icon: '<path fill-rule="evenodd" d="M4 4a2 2 0 012-2h5.586A2 2 0 0113 2.586L15.414 5A2 2 0 0116 6.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 8a1 1 0 000 2h6a1 1 0 100-2H7zm0-4a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>' },
  { key: 'reportHistory', label: 'Riwayat Laporan', icon: '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v5a1 1 0 00.293.707l3 3a1 1 0 001.414-1.414L11 9.586V5z" clip-rule="evenodd"/>' },
  { key: 'records', label: 'Penyesuaian Data', icon: '<path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm2 5a1 1 0 000 2h4a1 1 0 100-2H8zm-1 5a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clip-rule="evenodd"/>' },
  { key: 'closing', label: 'Tutup Periode', icon: '<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>' },
  { key: 'archive', label: 'Arsip', icon: '<path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7a1 1 0 01-1-1V4zm2 3v8a1 1 0 001 1h8a1 1 0 001-1V7H5zm2-2h6V4H7v1z" clip-rule="evenodd"/>' },
];

const FAVORITE_UNIT_KEY = 'ot_favorite_unit';
const AUTO_ADVANCE_KEY = 'ot_rekap_auto_advance';

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

  // Rekap Lembur (Final UX Refinement — always-open grid, no accordion;
  // entryConfirmDuplicates' old two-click "confirm and save anyway" flow
  // is gone — superseded by §8 Level 1 disabled checkboxes + Level 2's
  // hard backend rejection, no override path)
  entryDate: '',
  entryUnitId: '',
  entrySelected: {},
  entryOverrideOn: false, entryOverrideTierKey: '', entryOverrideNote: '',
  entryErr: '',
  rekapAutoAdvance: true,
  saveConfirmData: null,

  // Analytics (Sprint 7)
  analyticsTrendGranularity: 'daily',
  budgetEditing: false,
  budgetForm: { amount: '' }, budgetFormErr: '',

  // Reports / Report History (Sprint 8)
  reportPeriod: 'month', reportScope: 'all',
  reportUnitId: '', reportEmployeeId: '', reportRefDate: '',
  historyFormatFilter: 'all',

  // Records (Sprint 9)
  recordsFilterDate: '', recordsFilterUnitId: '', recordsFilterEmployeeId: '', recordsShowDeleted: false,
  editRecordModalOpen: false, editRecordId: null,
  editRecordForm: { employeeId: '', unitId: '', date: '', tierKey: '', overrideNote: '' }, editRecordFormErr: '',
  deleteRecordConfirmId: null,

  // Closing (Sprint 9)
  closingSelectedMonth: '', closingNote: '',
  unlockModalOpen: false, unlockReason: '', unlockReasonErr: '',

  // Archive (Sprint 9)
  archiveSearchQuery: '', archiveExpandedMonth: null,

  toast: null, _toastT: null,
};

let root = null, bound = false, opened = false, listening = false;
const focusGuard = createFocusGuard();

/* ── Small helpers ───────────────────────────────────────────────── */
function setState(patch) { Object.assign(st, patch); render(); }
function toast(msg) {
  if (st._toastT) clearTimeout(st._toastT);
  st._toastT = setTimeout(() => { st.toast = null; render(); }, 2600);
  setState({ toast: msg });
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
  st.rekapAutoAdvance = loadAutoAdvance();
  render();
  await initOvertimeStore();
  if (!st.entryUnitId) st.entryUnitId = resolveFavoriteUnit();

  // §11 Offline Safety — restore an in-progress Rekap Lembur draft (lost
  // connection or accidental navigation must not lose typed-in checks).
  const draft = loadRekapDraft();
  if (draft) {
    st.entryDate = draft.date;
    if (draft.unitId) st.entryUnitId = draft.unitId;
    st.entrySelected = draft.selected;
    toast('Draft rekap dipulihkan.');
  }

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

/** "Lanjut ke unit berikutnya setelah simpan" — defaults ON (the whole
    point of the accordion redesign is speed transcribing a coordinator's
    recap unit-by-unit); persisted the same way as the favorite-unit. */
function loadAutoAdvance() {
  try { const v = localStorage.getItem(AUTO_ADVANCE_KEY); return v === null ? true : v === '1'; }
  catch (_) { return true; }
}
function saveAutoAdvance(v) {
  try { localStorage.setItem(AUTO_ADVANCE_KEY, v ? '1' : '0'); } catch (_) {}
}

/** Prev/Next/Today date-nav (§1) — the date field itself is source of
    truth (mountRekapDatepicker() re-syncs the picker after this render). */
function setRekapDate(nextDate) {
  st.entryDate = nextDate;
  st.entryErr = '';
  render();
}

/** §7 Auto Next Unit — walks forward from `fromUnitId`, skipping units
    where every active employee already has a record for `dateISO`
    (nothing left to do there), and returns the first workable unit's id
    (or null if none remain). */
function findNextWorkableUnit(fromUnitId, dateISO) {
  const units = svc.listActiveUnits();
  const idx = units.findIndex(u => u.id === fromUnitId);
  if (idx === -1) return null;
  for (let i = idx + 1; i < units.length; i++) {
    const candidate = units[i];
    const employees = svc.listActiveEmployees(candidate.id);
    if (!employees.length) continue;
    const existingIds = new Set(svc.listRecordsForDate(dateISO, candidate.id).map(r => r.employeeId));
    if (employees.some(e => !existingIds.has(e.id))) return candidate.id;
  }
  return null;
}

/* ── §11 Offline Safety — in-progress Rekap Lembur draft ────────────
   A lost connection or accidental navigation must not lose typed-in
   checks. Persisted on every checklist change, restored on mount if
   recent enough, cleared per-unit once that unit's entries are saved. */
const REKAP_DRAFT_KEY = 'ot_rekap_draft';
const REKAP_DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48h — survives an overnight gap, not a month-old orphan

function saveRekapDraft() {
  try {
    localStorage.setItem(REKAP_DRAFT_KEY, JSON.stringify({
      date: st.entryDate, unitId: st.entryUnitId, selected: st.entrySelected, savedAt: Date.now(),
    }));
  } catch (_) {}
}

function loadRekapDraft() {
  try {
    const raw = localStorage.getItem(REKAP_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || !draft.date || !draft.selected) return null;
    if (!Object.keys(draft.selected).some(k => draft.selected[k])) return null; // nothing pending
    if (Date.now() - (draft.savedAt || 0) > REKAP_DRAFT_MAX_AGE_MS) return null;
    return draft;
  } catch (_) { return null; }
}

/** Clears just one unit's pending checks from the persisted draft (mirrors
    the in-memory entrySelected clearing after a successful save) — other
    units' still-pending draft entries are kept. */
function clearRekapDraftForUnit(unitId) {
  try {
    const raw = localStorage.getItem(REKAP_DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft || !draft.selected) return;
    const unitEmployeeIds = new Set(svc.listActiveEmployees(unitId).map(e => e.id));
    const nextSelected = { ...draft.selected };
    unitEmployeeIds.forEach(id => { delete nextSelected[id]; });
    localStorage.setItem(REKAP_DRAFT_KEY, JSON.stringify({ ...draft, selected: nextSelected, savedAt: Date.now() }));
  } catch (_) {}
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
  if (st.screen === 'dailyEntry') mountRekapDatepicker();
}

/** Wraps the (freshly re-created, per the full-innerHTML-replace render
    model) native date input with the shared PBSI datepicker — mirrors
    engineering-center.js's mountCreateWidgets(), called right after
    render() rather than from inside the render() string-builder. The
    trigger button initPbsiDatepicker() creates doesn't expose a tabindex
    option, so it's set directly here (§3: date-nav stays mouse-reachable
    but out of the Tab chain). */
function mountRekapDatepicker() {
  const input = document.getElementById('otRekapDateInput');
  if (!input) return;
  initPbsiDatepicker(input, {
    presets: [
      { label: 'Hari Ini', getValue: () => todayISO() },
      { label: 'Kemarin', getValue: () => addDaysISO(todayISO(), -1) },
      { label: 'Pilih Tanggal', openCalendar: true },
    ],
  });
  const trigger = input.parentElement && input.parentElement.querySelector('.pbsi-datepicker-trigger');
  if (trigger) trigger.tabIndex = -1;
  syncPbsiDatepicker(input);
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
  ${st.editRecordModalOpen ? renderEditRecordModal(st) : ''}
  ${st.unlockModalOpen ? renderUnlockModal(st) : ''}
  ${st.saveConfirmData ? saveConfirmModal() : ''}
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
  if (st.screen === 'reports') return renderReportsScreen(st);
  if (st.screen === 'reportHistory') return renderReportHistoryScreen(st);
  if (st.screen === 'records') return renderRecordsScreen(st);
  if (st.screen === 'closing') return renderClosingScreen(st);
  if (st.screen === 'archive') return renderArchiveScreen(st);
  return dashboardScreen();
}

/* ── Dashboard ──────────────────────────────────────────────────── */
function dashboardScreen() {
  return renderAnalyticsScreen(st);
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
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Karyawan</h2>
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
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Tarif</h2>
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
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Hari Libur</h2>
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

/* ── Rekap Lembur screen (Final UX Refinement — always-open workspace)
   Reframed from "Daily Entry" (admin types a timesheet) to "Rekap Lembur"
   (admin transcribes a coordinator's already-grouped-by-unit recap).
   Superseded twice now: v1 was a single-unit dropdown; v2 (one UX pass
   ago) was a single-expand accordion; this pass removes the accordion
   entirely — EVERY active unit's grid renders open at once, and
   st.entryUnitId is FOCUS-DERIVED (updated silently by onRekapFocusIn(),
   not by clicking a unit header — there is no header toggle anymore).
   st.entrySelected stays a FLAT {employeeId: checked} map across ALL
   units (employee ids never collide across units), so moving focus
   between units never loses another unit's pending checks — this is why
   confirmSaveDailyEntry/bulkCopyYesterdayUnit below explicitly scope
   reads/writes to one unit's employee ids instead of trusting the whole
   map. Native Tab/Shift+Tab cross unit boundaries for free (see
   onRekapGridKeydown's header comment for why). ── */
function dailyEntryScreen() {
  const units = svc.listActiveUnits();
  const date = st.entryDate || todayISO();
  if (!st.entryUnitId || !units.some(u => u.id === st.entryUnitId)) st.entryUnitId = units[0] ? units[0].id : '';
  const activeUnit = units.find(u => u.id === st.entryUnitId) || null;
  const resolved = st.entryOverrideOn && st.entryOverrideTierKey
    ? svc.getActiveRate(st.entryOverrideTierKey, date)
    : svc.resolveEntryRate(date);
  const tierOptions = svc.listRateTiers().map(t => `<option value="${t.key}" ${st.entryOverrideTierKey === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('');

  // ONE store call for the whole day, bucketed by unit client-side — not
  // one listRecordsForDate() call per unit block.
  const existingIdsByUnit = new Map();
  svc.listRecordsForDate(date).forEach(r => {
    if (!existingIdsByUnit.has(r.unitId)) existingIdsByUnit.set(r.unitId, new Set());
    existingIdsByUnit.get(r.unitId).add(r.employeeId);
  });

  // §8 Level 3: duplicate warning for whatever's already recorded this
  // month, surfaced right here too (not just Dashboard/Penyesuaian Data)
  // since this is where the admin is actively adding more.
  const monthDupes = svc.findDuplicatesInMonth(date.slice(0, 7));

  const blocks = units.length
    ? units.map(unit => unitGridSection(unit, date, existingIdsByUnit.get(unit.id) || new Set())).join('')
    : emptyState('Belum ada unit aktif');

  const recent = svc.listRecentRecords(6).map(r => {
    const emp = svc.listEmployees().find(e => e.id === r.employeeId);
    const u = svc.getUnitLabel(r.unitId);
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border);font-size:12px">
      <span style="flex:1;color:var(--text)">${esc(emp ? emp.name : '—')} · ${esc(u || '—')}</span>
      <span style="color:var(--muted)">${fmtDate(r.date)}</span>
    </div>`;
  }).join('');

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Rekap Lembur</h2>
      <div style="font-size:13px;color:var(--muted)">Pindahkan rekap dari koordinator — semua unit terbuka, Tab untuk transkrip cepat.</div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0;align-items:center">
      <button data-act="rekapToday" type="button" tabindex="-1" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;padding:9px 14px;font-size:12.5px;font-weight:700;cursor:pointer">Hari Ini</button>
      <button data-act="prevRekapDay" type="button" tabindex="-1" aria-label="Hari sebelumnya" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;width:36px;height:36px;font-size:15px;cursor:pointer">◀</button>
      <input id="otRekapDateInput" data-focus="entryDate" data-act="input:entryDate" type="date" tabindex="-1" value="${esc(date)}"
        style="padding:9px 10px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <button data-act="nextRekapDay" type="button" tabindex="-1" aria-label="Hari berikutnya" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:9px;width:36px;height:36px;font-size:15px;cursor:pointer">▶</button>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer;margin-left:6px">
        <input data-act="toggleAutoAdvance" type="checkbox" tabindex="-1" ${st.rekapAutoAdvance ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--primary)" />
        Lanjut ke unit berikutnya setelah simpan
      </label>
    </div>

    <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="font-size:11px;font-weight:700;color:var(--label);text-transform:uppercase">Tarif Berlaku</div>
        <div style="font-size:16px;font-weight:800;margin-top:2px">${resolved ? `${rp(resolved.amount)} <span style="font-size:11.5px;font-weight:600;color:var(--muted)">(${esc(resolved.tierLabel)}${resolved.holiday ? ' · ' + esc(resolved.holiday.name) : ''})</span>` : '<span style="color:var(--crit,#9a1b2d)">Belum tersedia</span>'}</div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer">
        <input data-act="toggleEntryOverride" type="checkbox" tabindex="-1" ${st.entryOverrideOn ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--primary)" />
        Override Rate
      </label>
      ${st.entryOverrideOn ? `<select data-act="statefield:entryOverrideTierKey" tabindex="-1" style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:12.5px">
          <option value="">— Pilih Tarif —</option>
          ${tierOptions}
        </select>` : ''}
    </div>

    ${monthDupes.length ? `<div style="margin-top:12px;background:var(--amber-tint,#f8eed4);border:1px solid var(--amber-bd,#ecdcb2);color:var(--amber,#a9781a);border-radius:10px;padding:10px 14px;font-size:12.5px">⚠ ${monthDupes.length} kombinasi karyawan/unit/tanggal terekam lebih dari sekali bulan ini. Periksa di Penyesuaian Data.</div>` : ''}

    <div style="margin-top:16px">${blocks}</div>

    ${activeUnit ? rekapStickyFooter(activeUnit, date, resolved, existingIdsByUnit.get(activeUnit.id) || new Set()) : ''}
    ${st.entryErr ? `<div style="margin-top:10px;color:var(--primary);font-size:12.5px">${esc(st.entryErr)}</div>` : ''}

    <div style="margin-top:22px">
      <div style="font-weight:700;font-size:12.5px;color:var(--text);margin-bottom:6px">Recent Entry</div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 14px">
        ${recent || `<div style="font-size:12px;color:var(--muted)">Belum ada entri.</div>`}
      </div>
    </div>`;
}

/** Every unit's grid renders open, always — the accordion is gone (Final
    UX Refinement §2). A bordered divider separates unit blocks instead of
    a chevron header. Already-recorded employees render DISABLED (§8
    Level 1 — a real behavior change from badged-but-clickable) which
    automatically removes them from Tab order and every keyboard query. */
function unitGridSection(unit, date, existingIds) {
  const employees = svc.listActiveEmployees(unit.id);
  const checkedCount = employees.filter(e => !!st.entrySelected[e.id]).length;

  const cells = employees.length ? employees.map(e => {
    const alreadyHas = existingIds.has(e.id);
    const checked = alreadyHas || !!st.entrySelected[e.id];
    return `
    <label style="display:flex;align-items:center;gap:8px;padding:8px 8px;border-radius:8px;cursor:${alreadyHas ? 'default' : 'pointer'};opacity:${alreadyHas ? '.6' : '1'}">
      <input data-focus="rekap-${e.id}" data-act="toggleEntryEmployee" data-id="${e.id}" data-unit="${unit.id}" type="checkbox" ${checked ? 'checked' : ''} ${alreadyHas ? 'disabled' : ''} style="width:17px;height:17px;flex:none;accent-color:var(--primary)" />
      <span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.name)}</span>
      ${alreadyHas ? `<span style="font-size:9.5px;font-weight:700;color:var(--amber,#a9781a);background:var(--amber-tint,#f8eed4);border:1px solid var(--amber-bd,#ecdcb2);border-radius:999px;padding:2px 6px;flex:none">✓ tercatat</span>` : ''}
    </label>`;
  }).join('') : `<div style="padding:16px;font-size:12px;color:var(--muted)">Belum ada karyawan aktif di unit ini.</div>`;

  return `
    <div data-unit-block="${unit.id}" style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--card2);border-bottom:1px solid var(--border)">
        <span style="flex:1;font-weight:800;font-size:13.5px;color:var(--text)">${esc(unit.name)}</span>
        <span style="font-size:10.5px;font-weight:700;color:var(--muted)">${employees.length} pegawai</span>
        ${checkedCount > 0 ? `<span style="font-size:10.5px;font-weight:700;color:var(--primary-text);background:var(--primary-tint);border-radius:999px;padding:2px 9px">${checkedCount} dipilih</span>` : ''}
        <button data-act="selectAllUnit" data-id="${unit.id}" type="button" tabindex="-1" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer">Pilih Semua</button>
        <button data-act="clearUnit" data-id="${unit.id}" type="button" tabindex="-1" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer">Kosongkan</button>
        <button data-act="bulkCopyYesterdayUnit" data-id="${unit.id}" type="button" tabindex="-1" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer">Salin Kemarin</button>
      </div>
      <div class="ot-rekap-grid" style="padding:10px 14px;gap:2px 10px">${cells}</div>
    </div>`;
}

/** Shared by rekapStickyFooter() (render-time HTML string) AND
    syncStickyFooterDOM() (focus-time live DOM patch) — the "what counts
    as dirty/total/canSave" business logic lives in exactly one place.
    `existingIds`, when the caller already has it (dailyEntryScreen()'s
    single whole-day listRecordsForDate() call), is reused instead of a
    second store hit for the same date+unit — event-handler callers that
    don't have it pre-fetched (Enter, openSaveConfirm, syncStickyFooterDOM)
    fall back to a fresh lookup, which is also the deliberately-current
    read those call sites want. */
function computeFooterValues(unit, date, resolved, existingIds) {
  const employees = svc.listActiveEmployees(unit.id);
  const unitEmployeeIds = new Set(employees.map(e => e.id));
  const selectedIds = Object.keys(st.entrySelected).filter(id => st.entrySelected[id] && unitEmployeeIds.has(id));
  const existing = existingIds || new Set(svc.listRecordsForDate(date, unit.id).map(r => r.employeeId));
  const dirty = selectedIds.length !== existing.size || selectedIds.some(id => !existing.has(id));
  const total = resolved ? resolved.amount * selectedIds.length : 0;
  const canSave = dirty && selectedIds.length > 0 && !!resolved;
  return { selectedIds, dirty, total, canSave };
}

function rekapStickyFooter(unit, date, resolved, existingIds) {
  const { selectedIds, total, canSave } = computeFooterValues(unit, date, resolved, existingIds);
  return `
    <div style="position:sticky;bottom:12px;z-index:5;background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);padding:12px 16px;margin-top:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Pegawai Dipilih</div>
        <div id="otFooterCount" style="font-size:15px;font-weight:800">${selectedIds.length}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Total Nominal</div>
        <div id="otFooterTotal" style="font-size:15px;font-weight:800">${esc(rp(total))}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Tarif Aktif</div>
        <div style="font-size:15px;font-weight:800">${resolved ? esc(rp(resolved.amount)) : '—'}</div>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Unit Aktif</div>
        <div id="otFooterUnit" style="font-size:15px;font-weight:800">${esc(unit.name)}</div>
      </div>
      <div style="flex:1;min-width:90px">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Tanggal</div>
        <div style="font-size:15px;font-weight:800">${esc(fmtDate(date))}</div>
      </div>
      <button id="otFooterSaveBtn" data-act="openSaveConfirm" type="button" ${canSave ? '' : 'disabled'}
        style="background:${canSave ? 'var(--primary)' : 'var(--border2)'};color:${canSave ? 'var(--primary-fg)' : 'var(--muted)'};border:none;border-radius:10px;padding:11px 22px;font-size:13.5px;font-weight:700;cursor:${canSave ? 'pointer' : 'default'}">Simpan Rekap</button>
    </div>`;
}

/** Focus-time live DOM patch (no render()) — see file header note near
    onRekapFocusIn for why this narrow exception to the render-everything
    model exists. Tarif Aktif and Tanggal don't depend on the focused
    unit, so they're not patched here. */
function syncStickyFooterDOM() {
  const date = st.entryDate || todayISO();
  const unit = svc.listActiveUnits().find(u => u.id === st.entryUnitId);
  if (!unit) return;
  const resolved = st.entryOverrideOn && st.entryOverrideTierKey
    ? svc.getActiveRate(st.entryOverrideTierKey, date)
    : svc.resolveEntryRate(date);
  const { selectedIds, total, canSave } = computeFooterValues(unit, date, resolved);

  const countEl = document.getElementById('otFooterCount');
  const totalEl = document.getElementById('otFooterTotal');
  const unitEl = document.getElementById('otFooterUnit');
  const saveBtn = document.getElementById('otFooterSaveBtn');
  if (countEl) countEl.textContent = String(selectedIds.length);
  if (totalEl) totalEl.textContent = rp(total);
  if (unitEl) unitEl.textContent = unit.name;
  if (saveBtn) {
    saveBtn.disabled = !canSave;
    saveBtn.style.background = canSave ? 'var(--primary)' : 'var(--border2)';
    saveBtn.style.color = canSave ? 'var(--primary-fg)' : 'var(--muted)';
    saveBtn.style.cursor = canSave ? 'pointer' : 'default';
  }
}

function saveConfirmModal() {
  const d = st.saveConfirmData;
  if (!d) return '';
  return `
    <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
      <div data-act="closeSaveConfirm" style="position:absolute;inset:0"></div>
      <div style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:400px;padding:22px">
        <div style="font-size:15px;font-weight:800;margin-bottom:14px">Konfirmasi Simpan Rekap</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${[['Tanggal', fmtDate(d.date)], ['Unit', d.unitName], ['Jumlah Pegawai', String(d.count)], ['Total Nominal', rp(d.total)]].map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0;border-top:1px solid var(--border)">
              <span style="color:var(--muted)">${esc(k)}</span>
              <span style="font-weight:700;color:var(--text)">${esc(v)}</span>
            </div>`).join('')}
        </div>
        ${st.entryErr ? `<div style="color:var(--primary);font-size:12px;margin-top:10px">${esc(st.entryErr)}</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:16px">
          <button data-act="confirmSaveDailyEntry" type="button" style="flex:1;background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:11px;font-size:13.5px;font-weight:700;cursor:pointer">Simpan</button>
          <button data-act="closeSaveConfirm" type="button" style="flex:1;border:1px solid var(--border);background:var(--card2);color:var(--text);border-radius:10px;padding:11px;font-size:13.5px;font-weight:600;cursor:pointer">Batal</button>
        </div>
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
  // Rekap Lembur keyboard navigation (UX Refinement) — same single-
  // delegation-root convention, not a second listener architecture.
  root.addEventListener('keydown', onRekapGridKeydown);
  // focusin bubbles (unlike plain 'focus') — one more delegated listener
  // on the same root, tracking which unit currently has keyboard focus.
  root.addEventListener('focusin', onRekapFocusIn);
}

/** All checkboxes checked in DOM order, disabled (already-recorded) ones
    excluded — matches native Tab's own skip-disabled behavior, so every
    keyboard query here stays consistent with what Tab actually does. */
function rekapCheckboxItems() {
  return Array.from(root.querySelectorAll('input[type="checkbox"][data-act="toggleEntryEmployee"]:not(:disabled)'));
}

/** Keyboard-first navigation across the WHOLE always-open grid (Final UX
    Refinement §3 — supersedes the prior pass's single-unit-grid, Enter-
    toggles design). Arrows/Home/End/Ctrl+A/Esc are pure focus/selection
    moves — no render() — only Space (native) and Enter (opens Save
    Confirmation) touch state. Tab/Shift+Tab need no code at all here:
    native DOM-order tabbing already crosses unit boundaries correctly
    because every non-checkbox control in this screen carries
    tabindex="-1" (see dailyEntryScreen()/unitGridSection()). */
function onRekapGridKeydown(e) {
  const el = e.target;
  const isCheckbox = el.matches && el.matches('input[type="checkbox"][data-act="toggleEntryEmployee"]');

  if (e.key === 'Escape' && (isCheckbox || (el.matches && el.matches('#otRekapDateInput')))) {
    e.preventDefault();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return;
  }
  if (!isCheckbox) return;

  const items = rekapCheckboxItems();
  const idx = items.indexOf(el);
  if (idx === -1) return;
  const unitBlock = el.closest('[data-unit-block]');
  const unitItems = unitBlock ? items.filter(it => unitBlock.contains(it)) : items;

  if (e.key === 'ArrowRight') { e.preventDefault(); items[(idx + 1) % items.length].focus(); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    let best = null, bestScore = Infinity;
    items.forEach((it, i) => {
      if (i === idx) return;
      const r = it.getBoundingClientRect();
      const vDelta = (r.top - rect.top) * dir;
      if (vDelta <= 2) return; // not in the requested direction (allow same-row float rounding)
      const hDelta = Math.abs(r.left - rect.left);
      const score = vDelta * 10 + hDelta; // nearest row first, then closest column
      if (score < bestScore) { bestScore = score; best = it; }
    });
    if (best) best.focus();
    return;
  }
  if (e.key === 'Home') { e.preventDefault(); if (unitItems[0]) unitItems[0].focus(); return; }
  if (e.key === 'End') { e.preventDefault(); if (unitItems.length) unitItems[unitItems.length - 1].focus(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    const entrySelected = { ...st.entrySelected };
    unitItems.forEach(it => { entrySelected[it.dataset.id] = true; });
    setState({ entrySelected, entryErr: '' });
    saveRekapDraft();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // "ENTER tidak boleh melakukan apa pun apabila belum ada perubahan" —
    // reuses the exact same dirty check the footer's Save button uses.
    const unit = unitBlock && svc.listActiveUnits().find(u => u.id === unitBlock.dataset.unitBlock);
    if (!unit) return;
    const date = st.entryDate || todayISO();
    const resolved = st.entryOverrideOn && st.entryOverrideTierKey ? svc.getActiveRate(st.entryOverrideTierKey, date) : svc.resolveEntryRate(date);
    const { selectedIds, canSave, total } = computeFooterValues(unit, date, resolved);
    if (!canSave) return;
    setState({ saveConfirmData: { date, unitId: unit.id, unitName: unit.name, count: selectedIds.length, total }, entryErr: '' });
  }
}

/** Tracks which unit currently "owns" the sticky footer/Save action —
    focus-derived (no more accordion expand/collapse state). Deliberately
    does NOT call render() (see computeFooterValues()/syncStickyFooterDOM()
    header note) — a full rebuild of every checkbox on every arrow/Tab
    move would be the exact "unnecessary render" §14 audits against. */
function onRekapFocusIn(e) {
  const el = e.target;
  if (!el.matches || !el.matches('input[type="checkbox"][data-act="toggleEntryEmployee"]')) return;
  const unitId = el.dataset.unit;
  if (!unitId || unitId === st.entryUnitId) return;
  st.entryUnitId = unitId;
  syncStickyFooterDOM();
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

    // Rekap Lembur (Final UX Refinement — always-open grid, no accordion)
    case 'toggleAutoAdvance': {
      const next = !st.rekapAutoAdvance;
      saveAutoAdvance(next);
      setState({ rekapAutoAdvance: next });
      return;
    }
    case 'toggleEntryEmployee': {
      const entrySelected = { ...st.entrySelected, [id]: !st.entrySelected[id] };
      setState({ entrySelected, entryErr: '' });
      saveRekapDraft();
      return;
    }
    case 'toggleEntryOverride': setState({ entryOverrideOn: !st.entryOverrideOn, entryOverrideTierKey: '' }); return;

    case 'selectAllUnit': {
      const date = st.entryDate || todayISO();
      const existingIds = new Set(svc.listRecordsForDate(date, id).map(r => r.employeeId));
      const entrySelected = { ...st.entrySelected };
      svc.listActiveEmployees(id).forEach(e => { if (!existingIds.has(e.id)) entrySelected[e.id] = true; });
      setState({ entrySelected, entryErr: '' });
      saveRekapDraft();
      return;
    }
    case 'clearUnit': {
      const entrySelected = { ...st.entrySelected };
      svc.listActiveEmployees(id).forEach(e => { delete entrySelected[e.id]; });
      setState({ entrySelected, entryErr: '' });
      saveRekapDraft();
      return;
    }
    case 'bulkCopyYesterdayUnit': {
      const date = st.entryDate || todayISO();
      const yesterday = addDaysISO(date, -1);
      const ids = svc.getEntryEmployeeIds(yesterday, id);
      if (!ids.length) { toast('Tidak ada entri kemarin untuk unit ini.'); return; }
      const existingIds = new Set(svc.listRecordsForDate(date, id).map(r => r.employeeId));
      // MERGE (not overwrite) — entrySelected spans every unit's pending
      // checks, and already-recorded employees stay excluded (Level 1).
      const entrySelected = { ...st.entrySelected };
      ids.forEach(id2 => { if (!existingIds.has(id2)) entrySelected[id2] = true; });
      setState({ entrySelected });
      saveRekapDraft();
      toast(`${ids.length} karyawan disalin — periksa lalu Simpan Rekap.`);
      return;
    }

    case 'prevRekapDay': setRekapDate(addDaysISO(st.entryDate || todayISO(), -1)); return;
    case 'nextRekapDay': setRekapDate(addDaysISO(st.entryDate || todayISO(), 1)); return;
    case 'rekapToday': setRekapDate(todayISO()); return;

    case 'openSaveConfirm': {
      const unit = svc.listActiveUnits().find(u => u.id === st.entryUnitId);
      if (!unit) return;
      const date = st.entryDate || todayISO();
      const resolved = st.entryOverrideOn && st.entryOverrideTierKey ? svc.getActiveRate(st.entryOverrideTierKey, date) : svc.resolveEntryRate(date);
      const { selectedIds, canSave, total } = computeFooterValues(unit, date, resolved);
      if (!canSave) return; // matches "ENTER tidak boleh melakukan apa pun apabila belum ada perubahan"
      setState({ saveConfirmData: { date, unitId: unit.id, unitName: unit.name, count: selectedIds.length, total }, entryErr: '' });
      return;
    }
    case 'closeSaveConfirm': setState({ saveConfirmData: null, entryErr: '' }); return;

    case 'confirmSaveDailyEntry': {
      const d = st.saveConfirmData;
      if (!d) return;
      const unitEmployeeIds = new Set(svc.listActiveEmployees(d.unitId).map(e => e.id));
      const selectedIds = Object.keys(st.entrySelected).filter(k => st.entrySelected[k] && unitEmployeeIds.has(k));
      if (!selectedIds.length) { setState({ entryErr: 'Pilih minimal satu karyawan.' }); return; }
      try {
        const overrideTierKey = st.entryOverrideOn && st.entryOverrideTierKey ? st.entryOverrideTierKey : null;
        const result = await svc.createDailyEntries({
          date: d.date, unitId: d.unitId, employeeIds: selectedIds,
          overrideTierKey, overrideNote: st.entryOverrideNote,
        });
        try { localStorage.setItem(FAVORITE_UNIT_KEY, d.unitId); } catch (_) {}
        // Clear only the just-saved unit's pending checks — other units'
        // pending selections (if the admin pre-checked ahead) are kept.
        const entrySelected = { ...st.entrySelected };
        unitEmployeeIds.forEach(empId => { delete entrySelected[empId]; });
        clearRekapDraftForUnit(d.unitId);

        // §7 Auto Next Unit: skip units where every active employee is
        // already recorded (nothing left to do there).
        let nextUnitId = d.unitId;
        if (st.rekapAutoAdvance) {
          const found = findNextWorkableUnit(d.unitId, d.date);
          if (found) nextUnitId = found;
        }
        setState({
          entrySelected, entryErr: '', entryOverrideOn: false, entryOverrideTierKey: '',
          entryUnitId: nextUnitId, saveConfirmData: null,
        });
        toast(`Tersimpan — ${result.count} karyawan · ${rp(result.rate.amount)}/orang.`);
        if (st.rekapAutoAdvance && nextUnitId !== d.unitId) {
          // First workable (non-disabled) checkbox in the next unit's
          // block — checkboxes render in employee order, so the first
          // DOM match is the first workable employee.
          const target = root.querySelector(`[data-unit-block="${nextUnitId}"] input[data-act="toggleEntryEmployee"]:not(:disabled)`);
          if (target) target.focus();
        }
      } catch (err) {
        setState({ entryErr: err.message || 'Gagal menyimpan.' });
      }
      return;
    }

    default: {
      // Extension point: each new sprint's screen (Analytics, Reports,
      // Records, Closing, Archive...) owns its own data-act map instead of
      // growing this switch — see overtime-analytics-view.js.
      const ctx = { el, id, state: st, setState, toast };
      const handler = analyticsActions[act] || reportsActions[act] || reportHistoryActions[act]
        || recordsActions[act] || closingActions[act] || archiveActions[act];
      if (handler) { await handler(ctx); return; }
      return;
    }
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
  if (act === 'input:entryDate') { st.entryDate = el.value; st.entryErr = ''; render(); return; }
  if (act === 'input:reportRefDate') { st.reportRefDate = el.value; render(); return; }
  if (act === 'input:reportUnitId') { st.reportUnitId = el.value; render(); return; }
  if (act === 'input:reportEmployeeId') { st.reportEmployeeId = el.value; render(); return; }
  if (act === 'input:recordsFilterDate') { st.recordsFilterDate = el.value; render(); return; }
  if (act === 'input:recordsFilterUnitId') { st.recordsFilterUnitId = el.value; render(); return; }
  if (act === 'input:recordsFilterEmployeeId') { st.recordsFilterEmployeeId = el.value; render(); return; }
  if (act === 'input:closingSelectedMonth') { st.closingSelectedMonth = el.value; render(); return; }
  if (act === 'input:archiveSearchQuery') { st.archiveSearchQuery = el.value; render(); return; }
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
