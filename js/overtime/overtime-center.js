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

   v1.25.2 — Domain Model Correction #2: Unit is a flat employee
   category — no Department picker, no hierarchy (see overtime-config.js
   header). Employee is the PRIMARY master data (Sprint 2): the add flow
   is deliberately Nama → Unit → Save, nothing more. Sprint 3 adds the
   Rates screen (per-tier current rate + append-only version history).

   Sprint 1 (v1.25.0) — Module Skeleton + Unit Management. Dashboard is
   a minimal placeholder (real KPIs land in Sprint 7); Unit/Employee/
   Rates are complete vertical slices: list, search, add, edit,
   activate/deactivate (soft — never a hard delete).
   ============================================================ */

'use strict';

import { isAdmin } from '../auth.js';
import { initOvertimeStore, registerChangeListener } from './overtime-store.js';
import * as svc from './overtime-service.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '<path d="M3 4a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM11 4a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zM11 10a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6zM3 13a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z"/>' },
  { key: 'employees', label: 'Employees', icon: '<path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 18a7 7 0 0114 0H3z"/>' },
  { key: 'units', label: 'Unit', icon: '<path d="M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h6v6h-6v-6z"/>' },
  { key: 'rates', label: 'Rates', icon: '<path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.5 3.5v1.6c1.3.25 2.3 1 2.3 2.2 0 1.15-.9 1.75-2.05 2.05l-.25.07v2.4c.5-.1.9-.35.9-.75h1.6c0 1.35-1.1 2.2-2.5 2.4V15h-1v-1.55c-1.4-.2-2.5-1-2.5-2.35h1.6c0 .5.45.85 1.4.95v-2.25l-.3-.08C8.15 9.4 7 8.85 7 7.6c0-1.15 1-1.9 2.5-2.1V4h1v1.5z"/>' },
];

/* ── Module state ────────────────────────────────────────────────── */
const st = {
  screen: 'dashboard',
  // Unit
  unitSearch: '',
  unitModalOpen: false, editUnitId: null,
  unitForm: { name: '' }, unitFormErr: '',
  // Employee
  employeeSearch: '', employeeUnitFilter: '',
  employeeModalOpen: false, editEmployeeId: null,
  employeeForm: { name: '', unitId: '', note: '' }, employeeFormErr: '',
  // Rate
  rateModalOpen: false, rateModalTierKey: null,
  rateForm: { amount: '', effectiveFrom: '', note: '' }, rateFormErr: '',
  expandedTierKey: null,
  toast: null, _toastT: null,
};

let root = null, bound = false, opened = false, listening = false;

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
function rp(n) { return 'Rp' + Number(Math.round(n || 0)).toLocaleString('id-ID'); }
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

/* ── Focus preservation across full re-render (mirrors petty-cash-center.js) ── */
let pendingFocus = null;
function captureFocus() {
  const el = document.activeElement;
  if (el && root && root.contains(el) && el.dataset && el.dataset.focus) {
    pendingFocus = { key: el.dataset.focus, start: el.selectionStart, end: el.selectionEnd };
  } else pendingFocus = null;
}
function restoreFocus() {
  if (!pendingFocus) return;
  const el = root.querySelector(`[data-focus="${CSS.escape(pendingFocus.key)}"]`);
  if (el) {
    el.focus();
    try { if (pendingFocus.start != null) el.setSelectionRange(pendingFocus.start, pendingFocus.end); } catch (_) {}
  }
  pendingFocus = null;
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
  render();
  await initOvertimeStore();
  if (!listening) { listening = true; registerChangeListener(() => { if (opened) render(); }); }
  render();
}

/** Switch the active screen — driven by the platform panel menu / mobile sub-nav. */
export function setOvertimeScreen(key) {
  opened = true;
  st.screen = key;
  st.unitModalOpen = false; st.editUnitId = null;
  st.employeeModalOpen = false; st.editEmployeeId = null;
  st.rateModalOpen = false; st.rateModalTierKey = null;
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
  captureFocus();
  root.innerHTML = shell();
  restoreFocus();
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
  ${st.rateModalOpen ? rateModal() : ''}
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
  if (st.screen === 'units') return unitsScreen();
  if (st.screen === 'employees') return employeesScreen();
  if (st.screen === 'rates') return ratesScreen();
  return dashboardScreen();
}

/* ── Dashboard (placeholder — real KPIs land in Sprint 7) ─────────── */
function dashboardScreen() {
  const units = svc.listUnits();
  const employees = svc.listEmployees();
  const activeEmployees = employees.filter(e => e.isActive !== false).length;
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
      ${card('Total Karyawan', employees.length, 'var(--primary)')}
      ${card('Karyawan Aktif', activeEmployees, 'var(--green)')}
      ${card('Unit', units.length, 'var(--text)')}
    </div>
    <div style="margin-top:22px;padding:16px 18px;background:var(--card2);border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted);line-height:1.6">
      Daily Entry, Holiday Engine, Analytics dan Reports akan hadir pada sprint
      berikutnya. Sprint ini menyiapkan Unit, Employee Management, dan Rate Engine.
    </div>`;
}

/* ── Units screen ───────────────────────────────────────────────── */
function unitsScreen() {
  const q = st.unitSearch.trim().toLowerCase();
  const units = svc.listUnits().filter(u => !q || u.name.toLowerCase().includes(q));

  const rows = units.map(u => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:50%;flex:none;background:${u.isActive !== false ? 'var(--green)' : 'var(--muted)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13.5px;color:var(--text)">${esc(u.name)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Diperbarui ${fmtDateTime(u.updatedAt)}</div>
      </div>
      <span style="font-size:10.5px;font-weight:700;letter-spacing:.3px;padding:3px 9px;border-radius:999px;background:${u.isActive !== false ? 'var(--green-tint)' : 'var(--border2)'};color:${u.isActive !== false ? 'var(--green)' : 'var(--muted)'};border:1px solid ${u.isActive !== false ? 'var(--green-bd)' : 'var(--border)'}">${u.isActive !== false ? 'Aktif' : 'Nonaktif'}</span>
      <button data-act="openEditUnit" data-id="${u.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">Edit</button>
      <button data-act="toggleUnitActive" data-id="${u.id}" data-active="${u.isActive !== false ? '0' : '1'}" type="button" style="border:1px solid var(--border);background:var(--card);color:${u.isActive !== false ? 'var(--crit,#9a1b2d)' : 'var(--green)'};border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">${u.isActive !== false ? 'Nonaktifkan' : 'Aktifkan'}</button>
    </div>`).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0 14px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Unit</h2>
        <div style="font-size:13px;color:var(--muted)">Kategori pengelompokan karyawan untuk input, filter, dan analytics — bukan struktur organisasi.</div>
      </div>
      <button data-act="openAddUnit" type="button" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer">+ Tambah Unit</button>
    </div>
    <div style="margin-bottom:14px">
      <input data-focus="unitSearch" data-act="input:unitSearch" type="text" value="${esc(st.unitSearch)}" placeholder="Cari unit…"
        style="width:100%;max-width:320px;padding:9px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px" />
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden">
      ${rows || emptyState('Belum ada unit', q ? 'Tidak ada unit yang cocok dengan pencarian.' : 'Tambahkan unit pertama untuk mulai mencatat lembur.')}
    </div>`;
}

function unitModal() {
  const editing = !!st.editUnitId;
  return `
  <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
    <div data-act="closeUnitModal" style="position:absolute;inset:0"></div>
    <form data-act="submitUnit" style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:400px;padding:22px">
      <div style="font-weight:800;font-size:15px;margin-bottom:14px">${editing ? 'Edit Unit' : 'Tambah Unit'}</div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin-bottom:6px">Nama Unit</label>
      <input data-focus="unitFormName" data-act="input:unitFormName" type="text" value="${esc(st.unitForm.name)}" autofocus
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      ${st.unitFormErr ? `<div style="color:var(--primary);font-size:12px;margin-top:8px">${esc(st.unitFormErr)}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button data-act="closeUnitModal" type="button" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button type="submit" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button>
      </div>
    </form>
  </div>`;
}

/* ── Employees screen (Sprint 2 — the PRIMARY master data) ────────── */
function employeesScreen() {
  const q = st.employeeSearch.trim();
  const employees = svc.searchEmployees(q, { unitId: st.employeeUnitFilter || null });
  const units = svc.listUnits();
  const unitOptions = units.map(u => `<option value="${esc(u.id)}" ${st.employeeUnitFilter === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');

  const rows = employees.map(e => {
    const unitName = svc.getUnitLabel(e.unitId) || '—';
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:50%;flex:none;background:${e.isActive !== false ? 'var(--green)' : 'var(--muted)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13.5px;color:var(--text)">${esc(e.name)}</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(unitName)}${e.note ? ' · ' + esc(e.note) : ''}</div>
      </div>
      <span style="font-size:10.5px;font-weight:700;letter-spacing:.3px;padding:3px 9px;border-radius:999px;background:${e.isActive !== false ? 'var(--green-tint)' : 'var(--border2)'};color:${e.isActive !== false ? 'var(--green)' : 'var(--muted)'};border:1px solid ${e.isActive !== false ? 'var(--green-bd)' : 'var(--border)'}">${e.isActive !== false ? 'Aktif' : 'Nonaktif'}</span>
      <button data-act="openEditEmployee" data-id="${e.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">Edit</button>
      <button data-act="toggleEmployeeActive" data-id="${e.id}" data-active="${e.isActive !== false ? '0' : '1'}" type="button" style="border:1px solid var(--border);background:var(--card);color:${e.isActive !== false ? 'var(--crit,#9a1b2d)' : 'var(--green)'};border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer">${e.isActive !== false ? 'Nonaktifkan' : 'Aktifkan'}</button>
    </div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0 14px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Employees</h2>
        <div style="font-size:13px;color:var(--muted)">Master data utama — dipakai langsung oleh Daily Entry.</div>
      </div>
      <button data-act="openAddEmployee" type="button" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer">+ Tambah Karyawan</button>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <input data-focus="employeeSearch" data-act="input:employeeSearch" type="text" value="${esc(st.employeeSearch)}" placeholder="Cari nama karyawan…"
        style="flex:1;min-width:200px;max-width:320px;padding:9px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px" />
      <select data-act="input:employeeUnitFilter" style="padding:9px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">
        <option value="">Semua Unit</option>
        ${unitOptions}
      </select>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden">
      ${rows || emptyState('Belum ada karyawan', (q || st.employeeUnitFilter) ? 'Tidak ada karyawan yang cocok dengan pencarian/filter.' : 'Tambahkan karyawan pertama untuk mulai mencatat lembur.')}
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
      <input data-focus="employeeFormName" data-act="input:employeeFormName" type="text" value="${esc(st.employeeForm.name)}" autofocus
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Unit</label>
      <select data-act="input:employeeFormUnit" style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
        <option value="">— Pilih Unit —</option>
        ${unitOptions}
      </select>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Catatan <span style="font-weight:400;color:var(--muted)">(opsional)</span></label>
      <textarea data-focus="employeeFormNote" data-act="input:employeeFormNote" rows="2"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;font-family:inherit;resize:vertical">${esc(st.employeeForm.note)}</textarea>
      ${st.employeeFormErr ? `<div style="color:var(--primary);font-size:12px;margin-top:8px">${esc(st.employeeFormErr)}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button data-act="closeEmployeeModal" type="button" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button type="submit" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button>
      </div>
    </form>
  </div>`;
}

/* ── Rates screen (Sprint 3 — append-only versioning) ─────────────── */
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
          <div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--label);text-transform:uppercase">${esc(t.label)}</div>
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
      <input data-focus="rateFormAmount" data-act="input:rateFormAmount" type="number" min="0" step="1000" value="${esc(st.rateForm.amount)}" autofocus
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Berlaku Mulai</label>
      <input data-focus="rateFormEffectiveFrom" data-act="input:rateFormEffectiveFrom" type="date" value="${esc(st.rateForm.effectiveFrom)}"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px" />
      <label style="display:block;font-size:12px;font-weight:700;color:var(--label);margin:14px 0 6px">Catatan <span style="font-weight:400;color:var(--muted)">(opsional)</span></label>
      <textarea data-focus="rateFormNote" data-act="input:rateFormNote" rows="2"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;font-family:inherit;resize:vertical">${esc(st.rateForm.note)}</textarea>
      ${st.rateFormErr ? `<div style="color:var(--primary);font-size:12px;margin-top:8px">${esc(st.rateFormErr)}</div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button data-act="closeRateModal" type="button" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button type="submit" style="background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button>
      </div>
    </form>
  </div>`;
}

function toastEl() {
  return `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:1700;box-shadow:var(--shadow-lg)">${esc(st.toast)}</div>`;
}

/* ── Delegated events ─────────────────────────────────────────────── */
function bindDelegation() {
  if (bound) return; bound = true;
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('submit', onSubmit);
}

function actorEl(e) { return e.target.closest('[data-act]'); }

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

    // Employee
    case 'openAddEmployee': setState({ employeeModalOpen: true, editEmployeeId: null, employeeForm: { name: '', unitId: st.employeeUnitFilter || '', note: '' }, employeeFormErr: '' }); return;
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

    // Rate
    case 'openRateVersionModal': setState({ rateModalOpen: true, rateModalTierKey: id, rateForm: { amount: '', effectiveFrom: todayISO(), note: '' }, rateFormErr: '' }); return;
    case 'closeRateModal': setState({ rateModalOpen: false, rateModalTierKey: null }); return;
    case 'toggleRateHistory': setState({ expandedTierKey: st.expandedTierKey === id ? null : id }); return;
    case 'deleteRateVersion': {
      try { await svc.softDeleteRateVersion(id); toast('Tarif dihapus.'); }
      catch (err) { toast(err.message || 'Gagal menghapus tarif.'); }
      return;
    }
    case 'restoreRateVersion': {
      try { await svc.restoreRateVersion(id); toast('Tarif dipulihkan.'); }
      catch (err) { toast(err.message || 'Gagal memulihkan tarif.'); }
      return;
    }

    default: return;
  }
}

function onInput(e) {
  const el = actorEl(e);
  if (!el || !el.dataset.act || !el.dataset.act.startsWith('input:')) return;
  const field = el.dataset.act.slice('input:'.length);
  switch (field) {
    case 'unitSearch': st.unitSearch = el.value; render(); return;
    case 'unitFormName': st.unitForm.name = el.value; render(); return;
    case 'employeeSearch': st.employeeSearch = el.value; render(); return;
    case 'employeeUnitFilter': st.employeeUnitFilter = el.value; render(); return;
    case 'employeeFormName': st.employeeForm.name = el.value; render(); return;
    case 'employeeFormUnit': st.employeeForm.unitId = el.value; render(); return;
    case 'employeeFormNote': st.employeeForm.note = el.value; render(); return;
    case 'rateFormAmount': st.rateForm.amount = el.value; render(); return;
    case 'rateFormEffectiveFrom': st.rateForm.effectiveFrom = el.value; render(); return;
    case 'rateFormNote': st.rateForm.note = el.value; render(); return;
    default: return;
  }
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
    const payload = {
      tierKey: st.rateModalTierKey,
      amount: st.rateForm.amount,
      effectiveFrom: st.rateForm.effectiveFrom,
      note: st.rateForm.note,
    };
    try {
      await svc.createRateVersion(payload);
      setState({ rateModalOpen: false, rateModalTierKey: null });
      toast('Tarif baru tersimpan.');
    } catch (err) {
      setState({ rateFormErr: err.message || 'Gagal menyimpan tarif.' });
    }
    return;
  }
}
