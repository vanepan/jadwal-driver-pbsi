/* ============================================================
   PETTY-CASH-CENTER.JS — Admin-only module UI (full-screen)

   Vanilla-JS port of the approved Petty Cash Center design. Mounts
   a self-contained `.pc-root` overlay (icon rail · sidebar · topbar ·
   content) into the DOM, mirroring how the platform's other heavy
   modules mount their own surface. The design's inline styling is
   reproduced verbatim for exact visual fidelity; only the data
   bindings and event plumbing were adapted to the production
   architecture (RTDB store + domain service + shared doc engine).

   Rendering model: full re-render of the root on every state change,
   with focus/caret restoration so live-filter inputs keep focus.
   Interactions are dispatched through one delegated handler reading
   data-act / name / data-id attributes (no inline handlers).

   v1.13.0 — Petty Cash Center production implementation.
   ============================================================ */

'use strict';

import { isAdmin, getCurrentUser } from '../auth.js';
import {
  initPettyCashStore, registerChangeListener, getSettings, getActiveCycle,
  getNors, getNorById, getExpenses, getExpenseById, saveSettings as storeSaveSettings,
} from './petty-cash-store.js';
import * as svc from './petty-cash-service.js';
import { buildNorViewModel } from './nor-document-engine.js';
import { renderNorPaper } from './nor-paper.js';
import { previewNorPdf } from './nor-pdf-exporter.js';
import { exportNorExcel, exportExpensesExcel } from './nor-excel-exporter.js';
import {
  UNITS, CATEGORIES, EXPENSE_STATUS, NOR_STATUS, NOR_TYPE, AUDIT_LABEL,
  rp, fmtShort, fmtLong, todayISO, parseAmount, unitColor, unitDisplay,
  norAutoSubject, norStatusMeta, norNumberFromSequence, isValidNorSequence,
} from './petty-cash-config.js';

const LOGO_SRC = 'assets/Logo-PBSI.png';

/* ── Module state ────────────────────────────────────────────────── */
const st = {
  screen: 'dashboard',
  addOpen: false, notifOpen: false, cycleModalOpen: false, drawerOpen: false,
  detailId: null, norDetailId: null,
  fUnit: 'all', fStatus: 'all', fSearch: '', norSearch: '',
  selectedIds: [], norStep: 'select', norFilter: NOR_TYPE.OFFICIAL,
  norForm: { sequence: '', date: todayISO(), isTest: false },
  form: blankForm(),
  newCycleBalance: '',
  settingsDraft: null,
  toast: null, _toastT: null,
};

let root = null, bound = false, opened = false, listening = false;

function blankForm() {
  return { expenseDate: todayISO(), unit: 'Engineering', customUnit: '', category: 'Inventaris', description: '', amount: '', notes: '', _err: '' };
}

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
const BADGE_BASE = 'display:inline-flex;align-items:center;gap:4px;font-family:\'JetBrains Mono\',monospace;font-size:9.5px;letter-spacing:.5px;padding:4px 8px;border-radius:6px;';

/** True when this expense is locked inside a TEST NOR (vs an Official one). */
function lockedByTestNor(e) {
  if (!e || e.status !== EXPENSE_STATUS.LOCKED || !e.norId) return false;
  const nor = getNorById(e.norId);
  return !!(nor && nor.type === NOR_TYPE.TEST);
}

/**
 * Status badge descriptor — { label, style, tip } — distinguishing an Official
 * lock ("Termasuk NOR", amber) from a Test lock ("TEST NOR", blue), and a plain
 * archive ("Arsip") from a cascade archive ("ARSIP · TEST NOR"). Tooltips (P6)
 * ride along as `tip`. (v1.13.2.1)
 */
function expenseBadge(e) {
  const s = e.status;
  if (s === EXPENSE_STATUS.LOCKED) {
    return lockedByTestNor(e)
      ? { label: 'TEST NOR', style: BADGE_BASE + 'background:var(--blue-tint);color:var(--blue);border:1px solid var(--blue-bd)', tip: 'Pengeluaran digunakan oleh NOR uji coba.' }
      : { label: 'Termasuk NOR', style: BADGE_BASE + 'background:var(--amber-tint);color:var(--amber);border:1px solid var(--amber-bd)', tip: 'Pengeluaran terkunci dalam Nota Organisasi Realisasi.' };
  }
  if (s === EXPENSE_STATUS.ARCHIVED) {
    return e.archivedByNor
      ? { label: 'ARSIP · TEST NOR', style: BADGE_BASE + 'background:var(--border2);color:var(--muted);border:1px solid var(--border)', tip: 'Pengeluaran diarsipkan otomatis bersama TEST NOR.' }
      : { label: 'Arsip', style: BADGE_BASE + 'background:var(--border2);color:var(--muted);border:1px solid var(--border)', tip: 'Pengeluaran tidak dihitung dalam operasional aktif.' };
  }
  return { label: 'Tersedia', style: BADGE_BASE + 'background:var(--green-tint);color:var(--green);border:1px solid var(--green-bd)', tip: 'Siap dipilih untuk realisasi NOR.' };
}
function dotStyle(unit) { return `width:8px;height:8px;border-radius:50%;flex:none;background:${unitColor(unit)}`; }

/** Decorate a raw expense with presentation fields. */
function decorate(e) {
  const badge = expenseBadge(e);
  return {
    ...e,
    unitDisp: unitDisplay(e),
    amountFmt: rp(e.amount),
    dateFmt: fmtShort(e.expenseDate),
    statusLabel: badge.label,
    badgeStyle: badge.style,
    badgeTip: badge.tip,
    dotStyle: dotStyle(e.unit),
    notesDisplay: e.notes || '—',
  };
}

/* ── Consistent empty state (v1.13.2.1) ──────────────────────────────
   One visual treatment for every "no data" surface: a tinted glyph tile,
   a title, and an optional supporting line. `icon` defaults to a document
   glyph; callers pass a fitting one. */
const EMPTY_ICONS = {
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/>',
  archive: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
};
function emptyState(title, sub, icon) {
  const path = EMPTY_ICONS[icon] || EMPTY_ICONS.doc;
  return `
    <div style="padding:46px 24px;text-align:center">
      <div style="width:46px;height:46px;margin:0 auto 14px;border-radius:13px;background:var(--card2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg></div>
      <div style="font-weight:700;font-size:14px;color:var(--text)">${esc(title)}</div>
      ${sub ? `<div style="font-size:12px;color:var(--muted);margin:4px auto 0;max-width:330px;line-height:1.5">${esc(sub)}</div>` : ''}
    </div>`;
}

/* ── Focus preservation across full re-render ────────────────────── */
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

/* ── Mount / open / close ────────────────────────────────────────── */
function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'pcRoot';
  root.className = 'pc-root';
  // Below the shared document viewer (z-index:1000) so the NOR PDF preview
  // layers above this overlay; above the normal app chrome. The module's own
  // modals/toast sit within this root's stacking context.
  root.style.cssText = 'position:fixed;inset:0;z-index:999;display:none';
  document.body.appendChild(root);
  bindDelegation();
  return root;
}

function syncTheme() {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (root) root.setAttribute('data-theme', t);
}

/** Public entry — open the Petty Cash Center (admin only). */
export async function openPettyCashCenter() {
  if (!isAdmin()) { console.warn('[PettyCash] admin only'); return; }
  ensureRoot();
  syncTheme();
  root.style.display = 'block';
  document.body.style.overflow = 'hidden';
  opened = true;
  if (!st.settingsDraft) st.settingsDraft = clone(getSettings());
  render();
  await initPettyCashStore();
  if (!listening) { listening = true; registerChangeListener(() => { if (opened) render(); }); }
  render();
}

export function closePettyCashCenter() {
  if (root) root.style.display = 'none';
  document.body.style.overflow = '';
  opened = false;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

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
  const user = getCurrentUser() || {};
  const initial = (user.displayName || user.username || 'A').charAt(0).toUpperCase();
  const m = svc.computeMetrics();
  return `
  <div style="display:flex;height:100vh;width:100%;overflow:hidden;background:var(--bg);color:var(--text)">
    ${iconRail()}
    ${sidebar(m)}
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;height:100vh">
      ${topbar(user, initial, m)}
      <div style="flex:1;overflow-y:auto;overflow-x:hidden">
        <div class="pc-content-pad" style="max-width:1200px;margin:0 auto;padding:26px 30px 60px">
          ${content(m)}
        </div>
      </div>
    </div>
  </div>
  ${st.drawerOpen ? mobileDrawer(m) : ''}
  ${st.addOpen ? addModal() : ''}
  ${st.detailId ? detailDrawer() : ''}
  ${st.notifOpen ? notifModal(m) : ''}
  ${st.cycleModalOpen ? cycleModal(m) : ''}
  ${st.toast ? toastEl() : ''}`;
}

/* ── Icon rail ───────────────────────────────────────────────────── */
function iconRail() {
  return `
  <div class="pc-rail" style="width:64px;flex:none;background:var(--rail);border-right:1px solid var(--border);display:flex;flex-direction:column;align-items:center;padding:14px 0;gap:8px;z-index:20">
    <div style="width:38px;height:38px;border-radius:11px;background:var(--green);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px;letter-spacing:.5px;margin-bottom:10px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)">PBSI</div>
    <div data-act="exit" title="Kembali ke Driver Operations" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    </div>
    <div title="Petty Cash Center" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--primary);background:var(--primary-tint);position:relative;cursor:pointer">
      <span style="position:absolute;left:-1px;top:9px;bottom:9px;width:3px;border-radius:3px;background:var(--primary)"></span>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M21 7H8a2 2 0 0 0 0 4h13a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><circle cx="17.5" cy="9" r="1" fill="currentColor"/></svg>
    </div>
    <div style="flex:1"></div>
    <div data-act="toggleTheme" title="Ganti tema" style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </div>
  </div>`;
}

/* ── Sidebar ─────────────────────────────────────────────────────── */
const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>' },
  { key: 'expenses', label: 'Pengeluaran', icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/>' },
  { key: 'norGenerate', label: 'Generate NOR', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>' },
  { key: 'norHistory', label: 'Riwayat NOR', icon: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>' },
  { key: 'settings', label: 'Pengaturan', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  { key: 'mobile', label: 'Tampilan Mobile', icon: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>' },
];
function sidebar(m) {
  const screen = st.screen;
  const items = NAV.map(n => {
    const act = n.key === screen || (n.key === 'norHistory' && screen === 'norDetail');
    const badge = n.key === 'expenses' ? String(svc.availableExpenses().length) : '';
    return `
    <div data-act="nav" data-id="${n.key}" style="display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:9px;font-size:13.5px;font-weight:${act ? '700' : '600'};cursor:pointer;${act ? 'background:var(--primary-tint);color:var(--primary-text);box-shadow:inset 2px 0 0 var(--primary)' : 'color:var(--text)'}">
      <span style="display:flex;color:${act ? 'var(--primary-text)' : 'var(--muted)'}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg></span>
      <span style="flex:1">${n.label}</span>
      ${badge ? `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;padding:1px 7px;border-radius:20px;${act ? 'background:var(--primary);color:#fff' : 'background:var(--border2);color:var(--muted)'}">${badge}</span>` : ''}
    </div>`;
  }).join('');
  const user = getCurrentUser() || {};
  return `
  <div class="pc-sidebar" style="width:248px;flex:none;background:var(--sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:10">
    <div style="padding:18px 18px 14px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1.5px;color:var(--label);text-transform:uppercase;margin-bottom:2px">Petty Cash</div>
      <div style="font-weight:800;font-size:16px;letter-spacing:-.2px">Kas Operasional</div>
      <div style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.5px;color:var(--amber);background:var(--amber-tint);border:1px solid var(--amber-bd);padding:3px 7px;border-radius:6px">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        ADMIN ONLY
      </div>
    </div>
    <div style="padding:0 14px 14px">
      <button data-act="openAdd" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:11px;font-weight:700;font-size:13.5px;cursor:pointer;box-shadow:var(--shadow)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Tambah Pengeluaran
      </button>
    </div>
    <div style="padding:6px 18px 6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1.5px;color:var(--label)">MENU</div>
    <div style="padding:0 12px;display:flex;flex-direction:column;gap:2px">${items}</div>
    <div style="flex:1"></div>
    <div style="border-top:1px solid var(--border);padding:12px 14px;display:flex;align-items:center;gap:10px">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${esc((user.displayName || user.username || 'A').charAt(0).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;line-height:1.2">${esc(user.displayName || user.username || 'Admin')}</div>
        <div style="font-size:11px;color:var(--muted);line-height:1.3">Administrator</div>
      </div>
    </div>
  </div>`;
}

/* ── Mobile drawer ───────────────────────────────────────────────
   Below 1024px the icon rail + sidebar are hidden (petty-cash.css) and
   this slide-in drawer carries navigation and identity. It reuses the
   same NAV model and data-act dispatch as the desktop sidebar; the
   "Tampilan Mobile" showcase is omitted (redundant on a real phone). */
function mobileDrawer(m) {
  const screen = st.screen;
  const user = getCurrentUser() || {};
  const items = NAV.filter(n => n.key !== 'mobile').map(n => {
    const act = n.key === screen || (n.key === 'norHistory' && screen === 'norDetail');
    const badge = n.key === 'expenses' ? String(svc.availableExpenses().length) : '';
    return `
    <div data-act="nav" data-id="${n.key}" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:9px;font-size:14px;font-weight:${act ? '700' : '600'};cursor:pointer;${act ? 'background:var(--primary-tint);color:var(--primary-text);box-shadow:inset 2px 0 0 var(--primary)' : 'color:var(--text)'}">
      <span style="display:flex;color:${act ? 'var(--primary-text)' : 'var(--muted)'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg></span>
      <span style="flex:1">${n.label}</span>
      ${badge ? `<span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;padding:1px 7px;border-radius:20px;${act ? 'background:var(--primary);color:#fff' : 'background:var(--border2);color:var(--muted)'}">${badge}</span>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="pc-drawer-scrim" data-act="closeDrawer">
    <div class="pc-drawer" data-act="stop">
      <div style="padding:18px 18px 14px;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1.5px;color:var(--label);text-transform:uppercase;margin-bottom:2px">Petty Cash</div>
          <div style="font-weight:800;font-size:17px;letter-spacing:-.2px">Kas Operasional</div>
          <div style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.5px;color:var(--amber);background:var(--amber-tint);border:1px solid var(--amber-bd);padding:3px 7px;border-radius:6px">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            ADMIN ONLY
          </div>
        </div>
        <div data-act="closeDrawer" style="width:32px;height:32px;flex:none;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></div>
      </div>
      <div style="padding:0 14px 14px">
        <button data-act="openAdd" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:12px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:var(--shadow)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Tambah Pengeluaran
        </button>
      </div>
      <div style="padding:6px 18px 6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1.5px;color:var(--label)">MENU</div>
      <div style="padding:0 12px;display:flex;flex-direction:column;gap:3px">${items}</div>
      <div style="flex:1;min-height:14px"></div>
      <div style="padding:0 12px 6px;display:flex;flex-direction:column;gap:3px;border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
        <div data-act="toggleTheme" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:9px;font-size:14px;font-weight:600;color:var(--text);cursor:pointer">
          <span style="display:flex;color:var(--muted)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>
          <span style="flex:1">Ganti Tema</span>
        </div>
        <div data-act="exit" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:9px;font-size:14px;font-weight:600;color:var(--text);cursor:pointer">
          <span style="display:flex;color:var(--muted)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
          <span style="flex:1">Kembali ke Driver Ops</span>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);padding:12px 16px;display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;flex:none;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${esc((user.displayName || user.username || 'A').charAt(0).toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(user.displayName || user.username || 'Admin')}</div>
          <div style="font-size:11px;color:var(--muted);line-height:1.3">Administrator</div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── Topbar ──────────────────────────────────────────────────────── */
const TITLES = { dashboard: 'Petty Cash Center', expenses: 'Pengeluaran', norGenerate: 'Generate NOR', norHistory: 'Riwayat NOR', norDetail: 'Detail NOR', settings: 'Pengaturan', mobile: 'Tampilan Mobile' };
function topbar(user, initial, m) {
  const todayLbl = new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `
  <div class="pc-topbar" style="height:58px;flex:none;border-bottom:1px solid var(--border);background:var(--card);display:flex;align-items:center;gap:16px;padding:0 18px;z-index:5">
    <div class="pc-topbar-title" style="min-width:150px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;color:var(--label);text-transform:uppercase">Sarpras Ops</div>
      <div style="font-weight:800;font-size:15px;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(TITLES[st.screen] || 'Petty Cash Center')}</div>
    </div>
    <div class="pc-desktop-only" style="flex:1;max-width:340px;display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:8px 12px;color:var(--muted)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-3.5-3.5"/></svg>
      <input value="${esc(st.fSearch)}" data-act="search" data-focus="topSearch" placeholder="Cari pengeluaran, NOR..." style="border:none;background:transparent;color:var(--text);font-size:13px;width:100%"/>
    </div>
    <div style="flex:1"></div>
    <div class="pc-desktop-only" style="display:flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--text);border:1px solid var(--border);border-radius:9px;padding:7px 11px">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      ${esc(todayLbl)}
    </div>
    <div data-act="openNotif" style="position:relative;width:38px;height:38px;flex:none;border-radius:9px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
      ${m.low ? '<span style="position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--primary);border:1.5px solid var(--card)"></span>' : ''}
    </div>
    <div class="pc-desktop-only" style="display:flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:10px;padding:5px 11px 5px 5px">
      <div style="width:30px;height:30px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">${esc(initial)}</div>
      <div style="line-height:1.15"><div style="font-weight:700;font-size:12.5px">${esc(user.displayName || user.username || 'Admin')}</div><div style="font-size:10.5px;color:var(--muted)">Administrator</div></div>
    </div>
    <div class="pc-mobile-only" data-act="openDrawer" title="Menu" style="width:38px;height:38px;flex:none;border-radius:9px;border:1px solid var(--border);align-items:center;justify-content:center;color:var(--text);cursor:pointer">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </div>
  </div>`;
}

/* ── Content router ──────────────────────────────────────────────── */
function content(m) {
  switch (st.screen) {
    case 'dashboard': return dashboard(m);
    case 'expenses': return expensesScreen(m);
    case 'norGenerate': return generateScreen(m);
    case 'norHistory': return historyScreen();
    case 'norDetail': return norDetailScreen(m);
    case 'settings': return settingsScreen(m);
    case 'mobile': return mobileScreen(m);
    default: return dashboard(m);
  }
}

/* ── DASHBOARD ───────────────────────────────────────────────────── */
function dashboard(m) {
  const cycle = m.cycle || {};
  const archivedCount = svc.archivedExpenses().length;
  const recent = svc.activeExpenses().slice(0, 5).map(decorate);
  const recentRows = recent.map(e => `
    <div data-act="openDetail" data-id="${esc(e.id)}" style="display:flex;align-items:center;gap:13px;padding:12px 18px;border-bottom:1px solid var(--border2);cursor:pointer">
      <div style="${dotStyle(e.unit)}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.description)}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);margin-top:2px">${esc(e.refNumber)} · ${esc(e.unitDisp)} · ${esc(e.dateFmt)}</div>
      </div>
      <div style="font-weight:700;font-size:13px;font-family:'JetBrains Mono',monospace">${esc(e.amountFmt)}</div>
    </div>`).join('') || emptyState('Belum ada pengeluaran pada siklus ini.', 'Catat nota petty cash pertama untuk memulai siklus berjalan.', 'list');

  const card = (accent, tintBg, tintColor, iconPath, label, value, sub, badge) => `
    <div style="background:var(--card);border:1px solid var(--border);border-left:3px solid ${accent};border-radius:13px;padding:16px;box-shadow:var(--shadow)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="width:32px;height:32px;border-radius:9px;background:${tintBg};color:${tintColor};display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg></div>
        ${badge || ''}
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase;margin-top:13px">${label}</div>
      <div style="font-weight:800;font-size:25px;letter-spacing:-.5px;margin-top:3px">${value}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:3px">${sub}</div>
    </div>`;

  const lowBadge = m.low ? '<span style="font-family:\'JetBrains Mono\',monospace;font-size:9px;letter-spacing:.5px;color:var(--amber);background:var(--amber-tint);border:1px solid var(--amber-bd);padding:3px 6px;border-radius:5px">RENDAH</span>' : '';

  return `
  <div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--label);text-transform:uppercase;margin-bottom:14px">Petty Cash Center</div>
    <div class="pc-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
      ${card('var(--primary)', 'var(--primary-tint)', 'var(--primary)', '<path d="M19 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M21 7H8a2 2 0 0 0 0 4h13a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/>', 'Saldo Petty Cash', esc(rp(m.balance)), `Siklus #${esc(cycle.cycleNumber || 1)} · awal ${esc(rp(m.opening))}`, lowBadge)}
      ${card('var(--blue)', 'var(--blue-tint)', 'var(--blue)', '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', 'Total Pengeluaran', esc(rp(m.spent)), `${m.expenseCount} transaksi tercatat`)}
      ${card('var(--green)', 'var(--green-tint)', 'var(--green)', '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 'Siap Direalisasi', esc(rp(m.availableTotal)), `${m.availableCount} nota tersedia untuk NOR`)}
      ${card('var(--amber)', 'var(--amber-tint)', 'var(--amber)', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', 'NOR Diterbitkan', String(m.norCount), 'Sepanjang riwayat realisasi')}
    </div>

    <div class="pc-stat-split" style="margin-top:14px;display:flex;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px;background:var(--card);border:1px solid var(--border);border-radius:13px;box-shadow:var(--shadow);padding:14px 16px;display:flex;align-items:center;gap:13px">
        <div style="width:34px;height:34px;flex:none;border-radius:10px;background:var(--green-tint);color:var(--green);display:flex;align-items:center;justify-content:center"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor"/></svg></div>
        <div style="flex:1"><div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Pengeluaran Aktif</div><div style="font-weight:800;font-size:20px;margin-top:2px">${m.expenseCount}</div></div>
        <div style="font-size:11px;color:var(--muted);text-align:right;max-width:120px">Tercatat pada siklus berjalan</div>
      </div>
      <div data-act="goArchive" title="Lihat pengeluaran terarsip" style="flex:1;min-width:220px;background:var(--card);border:1px solid var(--border);border-radius:13px;box-shadow:var(--shadow);padding:14px 16px;display:flex;align-items:center;gap:13px;cursor:pointer">
        <div style="width:34px;height:34px;flex:none;border-radius:10px;background:var(--border2);color:var(--muted);display:flex;align-items:center;justify-content:center"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg></div>
        <div style="flex:1"><div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Pengeluaran Diarsipkan</div><div style="font-weight:800;font-size:20px;margin-top:2px">${archivedCount}</div></div>
        <span style="display:flex;color:var(--muted)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>
      </div>
    </div>

    ${m.low ? `
    <div style="margin-top:16px;background:var(--amber-tint);border:1px solid var(--amber-bd);border-radius:13px;padding:15px 17px;display:flex;align-items:center;gap:14px">
      <div style="width:38px;height:38px;flex:none;border-radius:10px;background:var(--amber);color:#fff;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13.5px;color:var(--amber)">Petty Cash hampir habis. Disarankan membuat Nota Organisasi Realisasi.</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Saldo ${esc(rp(m.balance))} berada di bawah ambang ${esc(rp(m.threshold))}. Notifikasi ini hanya dikirim ke Admin.</div>
      </div>
      <button data-act="nav" data-id="norGenerate" style="flex:none;background:var(--amber);color:#fff;border:none;border-radius:9px;padding:10px 16px;font-weight:700;font-size:12.5px;cursor:pointer">Buat NOR</button>
    </div>` : ''}

    <div class="pc-2col" style="display:grid;grid-template-columns:1.55fr 1fr;gap:16px;margin-top:16px;align-items:start">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);overflow:hidden">
        <div style="padding:16px 18px 14px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:800;font-size:15px">Pengeluaran Terbaru</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--muted);margin-top:2px">${m.expenseCount} transaksi · siklus berjalan</div>
          </div>
          <button data-act="nav" data-id="expenses" style="background:transparent;border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer">Lihat Semua</button>
        </div>
        <div>${recentRows}</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:18px">
          <div style="font-weight:800;font-size:15px;margin-bottom:3px">Penggunaan Dana</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--muted)">Siklus #${esc(cycle.cycleNumber || 1)} · mulai ${esc(fmtLong(cycle.startDate))}</div>
          <div style="margin-top:16px;height:10px;border-radius:6px;background:var(--border2);overflow:hidden">
            <div style="height:100%;width:${m.usagePct}%;border-radius:6px;background:${m.low ? 'var(--amber)' : 'var(--primary)'}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:9px;font-size:11.5px">
            <span style="color:var(--muted)">Terpakai ${m.usagePct}%</span>
            <span style="font-weight:600">Sisa ${esc(rp(m.balance))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--border2)">
            <div><div style="font-size:10.5px;color:var(--label);font-family:'JetBrains Mono',monospace;letter-spacing:.5px">DANA AWAL</div><div style="font-weight:700;font-size:13px;margin-top:2px">${esc(rp(m.opening))}</div></div>
            <div style="text-align:right"><div style="font-size:10.5px;color:var(--label);font-family:'JetBrains Mono',monospace;letter-spacing:.5px">TERPAKAI</div><div style="font-weight:700;font-size:13px;margin-top:2px;color:var(--primary)">${esc(rp(m.spent))}</div></div>
          </div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:18px">
          <div style="font-weight:800;font-size:15px;margin-bottom:13px">Aksi Cepat</div>
          <div style="display:flex;flex-direction:column;gap:9px">
            <button data-act="openAdd" style="display:flex;align-items:center;gap:10px;width:100%;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:11px 13px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;text-align:left"><span style="color:var(--primary)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>Catat Pengeluaran Baru</button>
            <button data-act="nav" data-id="norGenerate" style="display:flex;align-items:center;gap:10px;width:100%;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:11px 13px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;text-align:left"><span style="color:var(--amber)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>Generate Nota Realisasi</button>
            <button data-act="nav" data-id="norHistory" style="display:flex;align-items:center;gap:10px;width:100%;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:11px 13px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer;text-align:left"><span style="color:var(--blue)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg></span>Lihat Riwayat NOR</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── EXPENSES ────────────────────────────────────────────────────── */
function filteredExpenses() {
  const q = st.fSearch.trim().toLowerCase();
  // Arsip filter reads the archived set; all other filters read the active
  // (non-archived) operational set. Archived stays searchable here. (v1.13.2)
  const base = st.fStatus === 'archived' ? svc.archivedExpenses() : svc.activeExpenses();
  return base.filter(e => {
    if (st.fStatus === 'available' && e.status !== EXPENSE_STATUS.AVAILABLE) return false;
    if (st.fStatus === 'locked' && e.status !== EXPENSE_STATUS.LOCKED) return false;
    if (st.fUnit !== 'all' && e.unit !== st.fUnit) return false;
    if (q && !((e.description || '').toLowerCase().includes(q) || (e.refNumber || '').toLowerCase().includes(q) || unitDisplay(e).toLowerCase().includes(q))) return false;
    return true;
  });
}
function expensesScreen(m) {
  const all = svc.activeExpenses();
  const archivedCount = svc.archivedExpenses().length;
  const list = filteredExpenses();
  const total = list.reduce((a, e) => a + (e.amount || 0), 0);
  const chips = [
    { key: 'all', label: 'Semua', count: all.length },
    { key: 'available', label: 'Tersedia', count: all.filter(e => e.status === EXPENSE_STATUS.AVAILABLE).length },
    { key: 'locked', label: 'Termasuk NOR', count: all.filter(e => e.status === EXPENSE_STATUS.LOCKED).length },
    { key: 'archived', label: 'Arsip', count: archivedCount },
  ].map(c => `<button data-act="filterStatus" data-id="${c.key}" style="border:none;border-radius:7px;padding:7px 13px;font-size:12.5px;font-weight:600;cursor:pointer;${st.fStatus === c.key ? 'background:var(--primary);color:#fff' : 'background:transparent;color:var(--muted)'}">${c.label} <span style="opacity:.6">${c.count}</span></button>`).join('');

  const rows = list.map(decorate).map(e => `
    <div class="pc-exp-row" data-act="openDetail" data-id="${esc(e.id)}" style="display:grid;grid-template-columns:128px 1fr 150px 130px 130px 120px;gap:12px;padding:13px 18px;border-bottom:1px solid var(--border2);cursor:pointer;align-items:center">
      <div><div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600">${esc(e.refNumber)}</div><div style="font-size:10.5px;color:var(--muted);margin-top:2px">${esc(e.dateFmt)}</div></div>
      <div style="min-width:0"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.description)}</div><div style="font-size:10.5px;color:var(--muted);margin-top:1px">${esc(e.notesDisplay)}</div></div>
      <div style="display:flex;align-items:center;gap:7px"><span style="${dotStyle(e.unit)}"></span><span style="font-size:12.5px">${esc(e.unitDisp)}</span></div>
      <div style="font-size:12px;color:var(--muted)">${esc(e.category)}</div>
      <div style="text-align:right;font-weight:700;font-size:13px;font-family:'JetBrains Mono',monospace">${esc(e.amountFmt)}</div>
      <div style="text-align:right"><span style="${e.badgeStyle}" title="${esc(e.badgeTip)}">${esc(e.statusLabel)}</span></div>
    </div>`).join('') || (st.fStatus === 'archived'
      ? emptyState('Belum ada data arsip.', 'Pengeluaran yang diarsipkan—termasuk yang ikut terarsip bersama NOR Test—akan muncul di sini.', 'archive')
      : emptyState('Tidak ada pengeluaran yang cocok dengan filter.', 'Ubah filter status atau unit untuk melihat nota lain.', 'list'));

  return `
  <div>
    <div class="pc-head-row" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px;gap:10px">
      <div>
        <div style="font-weight:800;font-size:26px;letter-spacing:-.5px">Pengeluaran</div>
        <div style="font-size:13px;color:var(--muted);margin-top:3px">Semua nota petty cash pada siklus berjalan. Nota yang masuk NOR terkunci otomatis.</div>
      </div>
      <div style="display:flex;gap:10px">
        <button data-act="openAdd" style="display:flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px 16px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:var(--shadow)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Tambah Pengeluaran</button>
        <button data-act="exportExpenses" style="display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:11px 14px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export Excel</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <div style="display:flex;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:4px">${chips}</div>
      <select data-act="filterUnit" style="background:var(--input);border:1px solid var(--input-bd);border-radius:10px;padding:9px 12px;font-size:12.5px;color:var(--text);cursor:pointer">
        <option value="all"${st.fUnit === 'all' ? ' selected' : ''}>Semua Unit</option>
        ${UNITS.map(u => `<option value="${esc(u)}"${st.fUnit === u ? ' selected' : ''}>${esc(u === 'Others' ? 'Others / Custom' : u)}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <div style="font-size:12.5px;color:var(--muted)">Total tampil: <span style="font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace">${esc(rp(total))}</span></div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);overflow:hidden">
      <div class="pc-exp-head" style="display:grid;grid-template-columns:128px 1fr 150px 130px 130px 120px;gap:12px;padding:13px 18px;border-bottom:1px solid var(--border);background:var(--card2);font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">
        <div>Ref · Tanggal</div><div>Deskripsi</div><div>Unit</div><div>Kategori</div><div style="text-align:right">Jumlah</div><div style="text-align:right">Status</div>
      </div>
      ${rows}
    </div>
  </div>`;
}

/* ── GENERATE NOR ────────────────────────────────────────────────── */
function previewVm(m) {
  const cycle = getActiveCycle();
  const selected = svc.availableExpenses().filter(e => st.selectedIds.includes(e.id));
  const realized = selected.reduce((a, e) => a + (e.amount || 0), 0);
  const opening = cycle ? cycle.openingBalance : m.opening;
  const pseudo = {
    norNumber: st.norForm.sequence ? norNumberFromSequence(st.norForm.sequence, st.norForm.date) : '—',
    norDate: st.norForm.date,
    type: st.norForm.isTest ? NOR_TYPE.TEST : NOR_TYPE.OFFICIAL,
    subject: norAutoSubject(st.norForm.date),
    items: selected.map(e => ({ expenseId: e.id, refNumber: e.refNumber, expenseDate: e.expenseDate, unit: unitDisplay(e), description: e.description, keterangan: e.notes || '—', amount: e.amount })),
    openingBalance: opening, realizedAmount: realized, remainingBalance: opening - realized,
    cycleId: cycle ? cycle.id : null,
  };
  return buildNorViewModel(pseudo);
}
function generateScreen(m) {
  if (st.norStep === 'preview') {
    const vm = previewVm(m);
    return `
    <div>
      <div class="pc-head-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px">
        <div style="display:flex;align-items:center;gap:7px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)"><span style="width:22px;height:22px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">✓</span>Pilih <span style="opacity:.4">→</span><span style="width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">2</span>Preview</div>
        <div style="display:flex;gap:10px"><button data-act="backToSelect" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 16px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">← Kembali</button><button data-act="confirmGenerate" style="background:var(--primary);color:#fff;border:none;border-radius:9px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer">Generate &amp; Terbitkan NOR</button></div>
      </div>
      ${renderNorPaper(vm, LOGO_SRC)}
    </div>`;
  }

  const avail = svc.availableExpenses().filter(e => {
    const q = (st.norSearch || '').trim().toLowerCase();
    if (!q) return true;
    return (e.refNumber || '').toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q);
  });
  const selectedCount = st.selectedIds.length;
  const selTotal = svc.availableExpenses().filter(e => st.selectedIds.includes(e.id)).reduce((a, e) => a + (e.amount || 0), 0);

  const rows = avail.map(e => {
    const sel = st.selectedIds.includes(e.id);
    return `
    <div class="pc-nor-row" data-act="toggleSel" data-id="${esc(e.id)}" style="display:grid;grid-template-columns:34px 110px 1fr 130px 120px;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border2);cursor:pointer;align-items:center;${sel ? 'background:var(--primary-tint)' : 'background:transparent'}">
      <div style="width:19px;height:19px;border-radius:6px;display:flex;align-items:center;justify-content:center;${sel ? 'background:var(--primary);border:1px solid var(--primary)' : 'background:var(--card);border:1.5px solid var(--input-bd)'}">${sel ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : ''}</div>
      <div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:600">${esc(e.refNumber)}</div><div style="font-size:10px;color:var(--muted);margin-top:1px">${esc(fmtShort(e.expenseDate))}</div></div>
      <div style="min-width:0"><div style="font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.description)}</div><div style="font-size:10px;color:var(--muted);margin-top:1px">${esc(e.notes || '—')}</div></div>
      <div style="display:flex;align-items:center;gap:6px"><span style="${dotStyle(e.unit)}"></span><span style="font-size:11.5px">${esc(unitDisplay(e))}</span></div>
      <div style="text-align:right;font-weight:700;font-size:12.5px;font-family:'JetBrains Mono',monospace">${esc(rp(e.amount))}</div>
    </div>`;
  }).join('') || emptyState('Belum ada pengeluaran yang siap direalisasikan.', 'Tambahkan nota petty cash baru atau pilih siklus yang masih memiliki nota tersedia.', 'check');

  return `
  <div>
    <div class="pc-head-row" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px;gap:10px">
      <div>
        <div style="font-weight:800;font-size:26px;letter-spacing:-.5px">Generate Nota Realisasi</div>
        <div style="font-size:13px;color:var(--muted);margin-top:3px">Pilih nota yang akan direalisasikan. Nota terpilih akan terkunci setelah NOR diterbitkan.</div>
      </div>
      <div style="display:flex;align-items:center;gap:7px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)"><span style="width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">1</span>Pilih <span style="opacity:.4">→</span><span style="width:22px;height:22px;border-radius:50%;background:var(--border2);color:var(--muted);display:flex;align-items:center;justify-content:center;font-weight:700">2</span>Preview</div>
    </div>
    <div class="pc-2col" style="display:grid;grid-template-columns:1fr 320px;gap:18px;margin-top:18px;align-items:start">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);overflow:hidden">
        <div class="pc-head-row" style="display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--border);background:var(--card2)">
          <button data-act="selectAll" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:7px 13px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer">Pilih Semua</button>
          <button data-act="clearSel" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:7px 13px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer">Hapus Pilihan</button>
          <div style="flex:1;background:var(--card);border:1px solid var(--input-bd);border-radius:8px;display:flex;align-items:center;gap:8px;padding:6px 11px;color:var(--muted)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-3.5-3.5"/></svg><input value="${esc(st.norSearch)}" data-act="norSearch" data-focus="norSearch" placeholder="Cari ref / deskripsi..." style="border:none;background:transparent;font-size:12px;color:var(--text);width:100%"/></div>
          <div style="font-size:12px;color:var(--muted)"><span style="font-weight:700;color:var(--text)">${selectedCount}</span> dipilih</div>
        </div>
        ${rows}
      </div>
      <div style="position:sticky;top:0;display:flex;flex-direction:column;gap:14px">
        <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:18px">
          <div style="font-weight:800;font-size:15px;margin-bottom:14px">Detail NOR</div>
          <label style="display:block;margin-bottom:13px"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Nomor Urut NOR *</span><input name="sequence" value="${esc(st.norForm.sequence)}" data-act="norForm" data-focus="norSequence" inputmode="numeric" placeholder="cth: 120" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:9px 11px;font-size:12.5px;color:var(--text);font-family:'JetBrains Mono',monospace"/></label>
          <div style="margin:-6px 0 13px"><span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.5px;color:var(--label);text-transform:uppercase">Nomor Lengkap (otomatis)</span><div id="pcNorFull" style="margin-top:5px;background:var(--card2);border:1px solid var(--border2);border-radius:9px;padding:9px 11px;font-size:12px;line-height:1.4;font-family:'JetBrains Mono',monospace;${isValidNorSequence(st.norForm.sequence) ? 'color:var(--primary-text);font-weight:600' : 'color:var(--muted)'}">${esc(isValidNorSequence(st.norForm.sequence) ? norNumberFromSequence(st.norForm.sequence, st.norForm.date) : 'Masukkan nomor urut (angka) untuk melihat nomor lengkap')}</div></div>
          <label style="display:block;margin-bottom:13px"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Tanggal NOR *</span><input type="date" name="date" value="${esc(st.norForm.date)}" data-act="norForm" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:9px 11px;font-size:12.5px;color:var(--text)"/></label>
          <div style="display:block;margin-bottom:13px"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Perihal <span style="color:var(--muted);font-weight:400;letter-spacing:0">(otomatis dari tanggal)</span></span><div id="pcNorSubject" style="margin-top:6px;background:var(--card2);border:1px solid var(--border2);border-radius:9px;padding:9px 11px;font-size:12.5px;color:var(--muted);line-height:1.4">${esc(norAutoSubject(st.norForm.date))}</div></div>
          <div data-act="toggleTestNor" style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;background:${st.norForm.isTest ? 'var(--amber-tint)' : 'var(--card2)'};border:1px solid ${st.norForm.isTest ? 'var(--amber-bd)' : 'var(--border2)'};border-radius:9px;padding:10px 12px">
            <div style="width:18px;height:18px;flex:none;margin-top:1px;border-radius:5px;display:flex;align-items:center;justify-content:center;${st.norForm.isTest ? 'background:var(--amber);border:1px solid var(--amber)' : 'background:var(--card);border:1.5px solid var(--input-bd)'}">${st.norForm.isTest ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : ''}</div>
            <div><div style="font-weight:600;font-size:12.5px;color:var(--text)">Generate as Test NOR</div><div style="font-size:11px;color:var(--muted);margin-top:1px;line-height:1.35">NOR uji coba: tidak mengunci nota, tidak memengaruhi metrik, dan tersembunyi dari Riwayat resmi.</div></div>
          </div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:18px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>Nota dipilih</span><span style="font-weight:700;color:var(--text)">${selectedCount}</span></div>
          <div style="margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Total Realisasi</div>
          <div style="font-weight:800;font-size:24px;font-family:'JetBrains Mono',monospace;margin-top:2px;color:var(--primary)">${esc(rp(selTotal))}</div>
          <button data-act="gotoPreview" style="width:100%;margin-top:15px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:12px;font-weight:700;font-size:13.5px;cursor:pointer;opacity:${selectedCount ? '1' : '.5'}">Preview NOR →</button>
          ${selectedCount ? '' : '<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px">Pilih minimal satu nota untuk lanjut.</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

/* ── NOR HISTORY ─────────────────────────────────────────────────── */
/* Riwayat NOR has two tabs only (v1.13.2): Official and Archived. The Test
   tab was removed — a non-archived Test NOR is transient validation data, so
   it lives in the Official view (clearly badged TEST, excluded from metrics)
   until it is archived, after which it moves to Archived ("ARSIP · TEST").
   Archived can hold both archived Official ("ARSIP") and archived Test. */
/** Apply the active history filter ('official' | 'archived'). */
function norMatchesFilter(n, filter) {
  if (filter === 'archived') return !!n.archived;
  return !n.archived; // 'official' tab = all non-archived (Test NORs badged inline)
}
function historyScreen() {
  const all = getNors();
  const list = all.slice()
    .filter(n => norMatchesFilter(n, st.norFilter))
    .sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));

  const chips = [
    { key: NOR_TYPE.OFFICIAL, label: 'Official', count: all.filter(n => !n.archived).length },
    { key: 'archived', label: 'Archived', count: all.filter(n => !!n.archived).length },
  ].map(c => `<button data-act="filterNorType" data-id="${c.key}" style="border:none;border-radius:7px;padding:7px 13px;font-size:12.5px;font-weight:600;cursor:pointer;${st.norFilter === c.key ? 'background:var(--primary);color:#fff' : 'background:transparent;color:var(--muted)'}">${c.label} <span style="opacity:.6">${c.count}</span></button>`).join('');

  const testBadge = '<span style="font-family:\'JetBrains Mono\',monospace;font-size:9px;letter-spacing:.5px;padding:4px 8px;border-radius:6px;background:var(--amber-tint);color:var(--amber);border:1px solid var(--amber-bd)">TEST</span>';
  const archBadge = '<span style="font-family:\'JetBrains Mono\',monospace;font-size:9px;letter-spacing:.5px;padding:4px 8px;border-radius:6px;background:var(--border2);color:var(--muted);border:1px solid var(--border)">ARSIP</span>';
  const archTestBadge = '<span style="font-family:\'JetBrains Mono\',monospace;font-size:9px;letter-spacing:.5px;padding:4px 8px;border-radius:6px;background:var(--border2);color:var(--muted);border:1px solid var(--border)">ARSIP · TEST</span>';

  const rows = list.map(n => {
    const meta = norStatusMeta(n.status);
    const total = n.realizedAmount || 0;
    const isTest = n.type === NOR_TYPE.TEST;
    const tag = n.archived
      ? (isTest ? archTestBadge : archBadge)
      : (isTest ? testBadge : `<span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.5px;padding:4px 9px;border-radius:6px;${meta.done ? 'background:var(--green-tint);color:var(--green);border:1px solid var(--green-bd)' : 'background:var(--amber-tint);color:var(--amber);border:1px solid var(--amber-bd)'}">${meta.label}</span>`);
    return `
    <div class="pc-nor-hist" data-act="norOpen" data-id="${esc(n.id)}" style="background:var(--card);border:1px solid var(--border);border-radius:13px;box-shadow:var(--shadow);padding:17px 19px;display:flex;align-items:center;gap:18px;cursor:pointer;${isTest || n.archived ? 'opacity:.92' : ''}">
      <div style="width:42px;height:42px;flex:none;border-radius:11px;background:var(--primary-tint);color:var(--primary);display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
      <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:14px;font-family:'JetBrains Mono',monospace">${esc(n.norNumber)}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(n.subject)} · ${esc(fmtLong(n.norDate))}</div></div>
      <div style="text-align:right"><div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--label);letter-spacing:.5px">TOTAL</div><div style="font-weight:700;font-size:14px;font-family:'JetBrains Mono',monospace">${esc(rp(total))}</div></div>
      <div style="text-align:center;min-width:64px"><div style="font-weight:700;font-size:15px">${(n.expenseIds || n.items || []).length}</div><div style="font-size:10px;color:var(--muted)">nota</div></div>
      ${tag}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>`;
  }).join('') || `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px">${
    st.norFilter === 'archived'
      ? emptyState('Belum ada arsip NOR.', 'NOR yang diarsipkan—Official maupun Test—akan tersimpan di sini.', 'archive')
      : emptyState('Belum ada Nota Organisasi yang diterbitkan.', 'Buat NOR baru dari nota petty cash yang tersedia untuk mulai merealisasikan.', 'doc')
  }</div>`;

  return `
  <div>
    <div class="pc-head-row" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;gap:10px">
      <div><div style="font-weight:800;font-size:26px;letter-spacing:-.5px">Riwayat NOR</div><div style="font-size:13px;color:var(--muted);margin-top:3px">Seluruh Nota Organisasi Realisasi yang pernah diterbitkan.</div></div>
      <button data-act="nav" data-id="norGenerate" style="display:flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:11px 16px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:var(--shadow)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>NOR Baru</button>
    </div>
    <div style="display:flex;gap:6px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:4px;margin-bottom:16px;width:max-content;max-width:100%;flex-wrap:wrap">${chips}</div>
    <div style="display:flex;flex-direction:column;gap:12px">${rows}</div>
  </div>`;
}

/* ── NOR DETAIL ──────────────────────────────────────────────────── */
function norDetailScreen(m) {
  const nor = st.norDetailId ? getNorById(st.norDetailId) : null;
  if (!nor) return `<div style="padding:48px;text-align:center;color:var(--muted)">NOR tidak ditemukan. <button data-act="nav" data-id="norHistory" style="color:var(--primary);background:none;border:none;cursor:pointer;text-decoration:underline">Kembali</button></div>`;
  const meta = norStatusMeta(nor.status);
  const isTest = nor.type === NOR_TYPE.TEST;
  // Test / archived NORs never lock expenses, so cycle rollover is N/A.
  const awaiting = !isTest && !nor.archived && (nor.status === NOR_STATUS.GENERATED || nor.status === NOR_STATUS.WAITING);
  const vm = buildNorViewModel(nor);
  const statusStyle = `font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.5px;padding:6px 11px;border-radius:7px;${meta.done ? 'background:var(--green-tint);color:var(--green);border:1px solid var(--green-bd)' : 'background:var(--amber-tint);color:var(--amber);border:1px solid var(--amber-bd)'}`;
  // Type/archive badge (v1.13.2): distinguishes archived Official ("ARSIP")
  // from archived Test ("ARSIP · TEST"), and flags a live Test NOR ("TEST ONLY").
  const typeBadge = nor.archived
    ? (isTest
        ? '<span style="font-family:\'JetBrains Mono\',monospace;font-size:9.5px;letter-spacing:.5px;padding:6px 11px;border-radius:7px;background:var(--border2);color:var(--muted);border:1px solid var(--border)">ARSIP · TEST</span>'
        : '<span style="font-family:\'JetBrains Mono\',monospace;font-size:9.5px;letter-spacing:.5px;padding:6px 11px;border-radius:7px;background:var(--border2);color:var(--muted);border:1px solid var(--border)">ARSIP</span>')
    : (isTest ? '<span style="font-family:\'JetBrains Mono\',monospace;font-size:9.5px;letter-spacing:.5px;padding:6px 11px;border-radius:7px;background:var(--amber-tint);color:var(--amber);border:1px solid var(--amber-bd)">TEST ONLY</span>' : '');

  // Cascade summary (v1.13.2): how many expenses ride along with this Test NOR.
  // When archived → those currently tagged archivedByNor; when live → its LOCKED
  // TEST expenses that an archive would carry. Official NORs never cascade.
  const cascadeArchived = isTest && nor.archived
    ? getExpenses().filter(e => e.archivedByNor === nor.id).length
    : 0;
  const cascadeLive = isTest && !nor.archived
    ? getExpenses().filter(e => (nor.expenseIds || []).includes(e.id) && e.status !== EXPENSE_STATUS.ARCHIVED).length
    : 0;
  // Summary card (P3, v1.13.2.1): at-a-glance stats. Test NORs get an extra
  // "Pengeluaran Diarsipkan" tile reflecting the cascade.
  const summaryCount = (nor.expenseIds || nor.items || []).length;
  const statusText = nor.archived ? (isTest ? 'Arsip · Test' : 'Arsip') : (isTest ? 'Test Only' : meta.label);
  const summaryTile = (label, value, idx) => `
    <div style="flex:1;min-width:130px;padding:14px 16px;${idx > 0 ? 'border-left:1px solid var(--border2);' : ''}">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--label);text-transform:uppercase">${esc(label)}</div>
      <div style="font-weight:800;font-size:19px;margin-top:5px;line-height:1.1">${value}</div>
    </div>`;
  const summaryTiles = [
    summaryTile('Jumlah Pengeluaran', String(summaryCount), 0),
    summaryTile('Total Nilai', `<span style="font-family:'JetBrains Mono',monospace">${esc(rp(nor.realizedAmount || 0))}</span>`, 1),
    summaryTile('Status', `<span style="font-size:14px">${esc(statusText)}</span>`, 2),
  ];
  if (isTest) summaryTiles.push(summaryTile('Pengeluaran Diarsipkan', String(cascadeArchived), 3));
  const summaryCard = `
    <div style="margin-bottom:16px;background:var(--card);border:1px solid var(--border);border-radius:13px;box-shadow:var(--shadow);display:flex;flex-wrap:wrap;overflow:hidden">${summaryTiles.join('')}</div>`;

  const cascadeBanner = (cascadeArchived || cascadeLive) ? `
    <div style="margin-bottom:16px;background:var(--card2);border:1px solid var(--border);border-left:3px solid ${cascadeArchived ? 'var(--muted)' : 'var(--amber)'};border-radius:12px;padding:12px 15px;display:flex;align-items:center;gap:11px">
      <span style="color:${cascadeArchived ? 'var(--muted)' : 'var(--amber)'};display:flex"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg></span>
      <div style="font-size:12.5px;color:var(--text)">
        ${cascadeArchived
          ? `<b>${cascadeArchived} pengeluaran</b> diarsipkan bersama NOR ini. Memulihkan NOR akan memulihkannya kembali.`
          : `NOR Test ini mengunci <b>${cascadeLive} pengeluaran</b>. Mengarsipkan NOR akan ikut mengarsipkannya otomatis.`}
      </div>
    </div>` : '';

  return `
  <div>
    <div class="pc-head-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px">
      <button data-act="nav" data-id="norHistory" style="display:flex;align-items:center;gap:7px;background:transparent;border:none;font-weight:600;font-size:13px;color:var(--muted);cursor:pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>Riwayat NOR</button>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        ${typeBadge}
        <span style="${statusStyle}">${meta.label}</span>
        <button data-act="exportNor" data-id="${esc(nor.id)}" style="display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 15px;font-weight:600;font-size:12.5px;color:var(--text);cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export Excel</button>
        <button data-act="printNor" data-id="${esc(nor.id)}" style="display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 15px;font-weight:600;font-size:12.5px;color:var(--text);cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Cetak / PDF</button>
        ${awaiting ? `<button data-act="receiveFunds" data-id="${esc(nor.id)}" style="display:flex;align-items:center;gap:7px;background:var(--green);color:#fff;border:none;border-radius:9px;padding:10px 15px;font-weight:700;font-size:12.5px;cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Dana Pengganti Diterima</button>` : ''}
        ${nor.archived
          ? `<button data-act="restoreNor" data-id="${esc(nor.id)}" style="display:flex;align-items:center;gap:7px;background:var(--green-tint);border:1px solid var(--green-bd);border-radius:9px;padding:10px 15px;font-weight:600;font-size:12.5px;color:var(--green);cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 7"/></svg>Pulihkan NOR</button>`
          : `<button data-act="archiveTestNor" data-id="${esc(nor.id)}" style="display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 15px;font-weight:600;font-size:12.5px;color:var(--muted);cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>${isTest ? 'Arsipkan Test NOR' : 'Arsipkan NOR'}</button>`}
      </div>
    </div>
    ${summaryCard}
    ${cascadeBanner}
    ${renderNorPaper(vm, LOGO_SRC, 'norPaper')}
  </div>`;
}

/* ── SETTINGS ────────────────────────────────────────────────────── */
function settingsScreen(m) {
  const sd = st.settingsDraft || getSettings();
  const sigs = (sd.signatories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const sigRows = sigs.map(s => `
    <div class="pc-sig-row" style="display:grid;grid-template-columns:64px 1fr 1fr 1fr 36px;gap:10px;align-items:center">
      <input type="number" name="order" data-act="sigInput" data-id="${s.id}" data-focus="sig-order-${s.id}" value="${esc(s.order)}" style="width:100%;background:var(--input);border:1px solid var(--input-bd);border-radius:8px;padding:8px;font-size:12px;color:var(--text);text-align:center;font-family:'JetBrains Mono',monospace"/>
      <input name="label" data-act="sigInput" data-id="${s.id}" data-focus="sig-label-${s.id}" value="${esc(s.label)}" style="width:100%;background:var(--input);border:1px solid var(--input-bd);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text)"/>
      <input name="name" data-act="sigInput" data-id="${s.id}" data-focus="sig-name-${s.id}" value="${esc(s.name)}" style="width:100%;background:var(--input);border:1px solid var(--input-bd);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text)"/>
      <input name="position" data-act="sigInput" data-id="${s.id}" data-focus="sig-pos-${s.id}" value="${esc(s.position)}" style="width:100%;background:var(--input);border:1px solid var(--input-bd);border-radius:8px;padding:8px 10px;font-size:12px;color:var(--text)"/>
      <div data-act="removeSig" data-id="${s.id}" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></div>
    </div>`).join('');

  return `
  <div>
    <div style="margin-bottom:8px"><div style="font-weight:800;font-size:26px;letter-spacing:-.5px">Pengaturan Petty Cash</div><div style="font-size:13px;color:var(--muted);margin-top:3px">Konfigurasi saldo awal, ambang notifikasi, dan penandatangan NOR.</div></div>
    <div class="pc-set-stats" style="display:flex;gap:40px;margin:22px 0 24px">
      <div><div id="pcStatOpening" style="font-weight:800;font-size:32px;letter-spacing:-1px">${esc(rp(sd.openingBalance))}</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Saldo Awal Default</div></div>
      <div><div id="pcStatThreshold" style="font-weight:800;font-size:32px;letter-spacing:-1px">${esc(rp(sd.lowBalanceThreshold))}</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Ambang Notifikasi</div></div>
      <div><div style="font-weight:800;font-size:32px;letter-spacing:-1px">${(sd.signatories || []).length}</div><div style="font-size:11.5px;color:var(--muted);margin-top:2px">Penandatangan NOR</div></div>
    </div>
    <div class="pc-2col" style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:20px">
        <div style="font-weight:800;font-size:15px;margin-bottom:4px">Saldo &amp; Notifikasi</div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:16px">Dipakai saat memulai siklus petty cash baru.</div>
        <label style="display:block;margin-bottom:15px"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Saldo Awal Default (Rp)</span><input name="openingBalance" data-act="setInput" data-focus="set-opening" value="${esc(sd.openingBalance)}" inputmode="numeric" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text);font-family:'JetBrains Mono',monospace"/></label>
        <label style="display:block;margin-bottom:6px"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Ambang Notifikasi (Rp)</span><input name="lowBalanceThreshold" data-act="setInput" data-focus="set-threshold" value="${esc(sd.lowBalanceThreshold)}" inputmode="numeric" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text);font-family:'JetBrains Mono',monospace"/></label>
        <div style="font-size:11px;color:var(--muted);line-height:1.4">Saat saldo turun di bawah nilai ini, notifikasi dikirim ke Admin.</div>
        <div style="border-top:1px solid var(--border2);margin:16px 0 0;padding-top:16px">
          <label style="display:block;margin-bottom:13px"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Kepada Yth. (NOR)</span><input name="recipients" data-act="setInput" data-focus="set-recipients" value="${esc(sd.recipients)}" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:9px 11px;font-size:12px;color:var(--text)"/></label>
          <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Tembusan (NOR)</span><input name="ccRecipients" data-act="setInput" data-focus="set-cc" value="${esc(sd.ccRecipients)}" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:9px 11px;font-size:12px;color:var(--text)"/></label>
        </div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-weight:800;font-size:15px">Konfigurasi Penandatangan NOR</div><button data-act="addSig" style="display:flex;align-items:center;gap:6px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Tambah</button></div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:16px">Dikonfigurasi sekali, otomatis dipakai saat generate NOR. Urutkan dengan kolom "Urutan".</div>
        <div class="pc-sig-head" style="display:grid;grid-template-columns:64px 1fr 1fr 1fr 36px;gap:10px;padding:0 2px 8px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--label);text-transform:uppercase"><div>Urutan</div><div>Label Peran</div><div>Nama</div><div>Jabatan</div><div></div></div>
        <div style="display:flex;flex-direction:column;gap:9px">${sigRows}</div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border2)"><button data-act="resetSettings" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 18px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Reset</button><button data-act="saveSettings" style="background:var(--primary);color:#fff;border:none;border-radius:9px;padding:10px 20px;font-weight:700;font-size:13px;cursor:pointer">Simpan</button></div>
      </div>
    </div>
  </div>`;
}

/* ── MOBILE (responsive showcase) ────────────────────────────────── */
function mobileScreen(m) {
  const recent = svc.activeExpenses().slice(0, 3).map(decorate);
  const recentRows = recent.map(e => `<div style="display:flex;align-items:center;gap:9px;padding:8px 2px;border-bottom:1px solid var(--border2)"><div style="${dotStyle(e.unit)}"></div><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.description)}</div><div style="font-size:9px;color:var(--muted)">${esc(e.unitDisp)}</div></div><div style="font-weight:700;font-size:11px;font-family:'JetBrains Mono',monospace">${esc(e.amountFmt)}</div></div>`).join('');
  return `
  <div>
    <div style="margin-bottom:8px"><div style="font-weight:800;font-size:26px;letter-spacing:-.5px">Tampilan Mobile</div><div style="font-size:13px;color:var(--muted);margin-top:3px">Layout responsif Petty Cash Center untuk perangkat Admin di lapangan.</div></div>
    <div style="display:flex;gap:34px;flex-wrap:wrap;justify-content:center;margin-top:26px">
      <div style="text-align:center">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;color:var(--muted);margin-bottom:10px;text-transform:uppercase">Dashboard</div>
        <div style="width:300px;height:620px;background:#111;border-radius:38px;padding:11px;box-shadow:var(--shadow-lg)">
          <div style="width:100%;height:100%;background:var(--bg);border-radius:28px;overflow:hidden;display:flex;flex-direction:column;text-align:left">
            <div style="background:var(--card);padding:14px 16px 10px;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:800;font-size:15px">Petty Cash</div><div style="width:28px;height:28px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">E</div></div></div>
            <div style="flex:1;overflow:hidden;padding:14px">
              <div style="background:var(--primary);color:#fff;border-radius:14px;padding:16px"><div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;opacity:.8">SALDO PETTY CASH</div><div style="font-weight:800;font-size:24px;margin-top:4px;font-family:'JetBrains Mono',monospace">${esc(rp(m.balance))}</div><div style="font-size:10.5px;opacity:.85;margin-top:3px">Siklus #${esc((m.cycle || {}).cycleNumber || 1)} · awal ${esc(rp(m.opening))}</div></div>
              ${m.low ? '<div style="background:var(--amber-tint);border:1px solid var(--amber-bd);border-radius:11px;padding:11px 13px;margin-top:12px;font-size:11px;font-weight:600;color:var(--amber);line-height:1.4">⚠ Petty Cash hampir habis. Disarankan membuat NOR.</div>' : ''}
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px">
                <div style="background:var(--card);border:1px solid var(--border);border-radius:11px;padding:11px"><div style="font-size:9px;color:var(--label);font-family:'JetBrains Mono',monospace">TERPAKAI</div><div style="font-weight:700;font-size:13px;margin-top:3px;font-family:'JetBrains Mono',monospace">${esc(rp(m.spent))}</div></div>
                <div style="background:var(--card);border:1px solid var(--border);border-radius:11px;padding:11px"><div style="font-size:9px;color:var(--label);font-family:'JetBrains Mono',monospace">TERSEDIA</div><div style="font-weight:700;font-size:13px;margin-top:3px">${m.availableCount} nota</div></div>
              </div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--label);margin:15px 2px 8px">PENGELUARAN TERBARU</div>
              ${recentRows}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── MODALS ──────────────────────────────────────────────────────── */
function addModal() {
  const f = st.form;
  const cats = CATEGORIES.map(c => `<option${f.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const units = UNITS.map(u => `<option value="${esc(u)}"${f.unit === u ? ' selected' : ''}>${esc(u)}</option>`).join('');
  return `
  <div data-act="closeAdd" style="position:fixed;inset:0;background:rgba(20,16,14,.5);backdrop-filter:blur(2px);z-index:1500;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;animation:pcFade .18s ease">
    <div data-act="stop" style="width:100%;max-width:560px;background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);animation:pcPop .22s ease">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--border2)">
        <div><div style="font-weight:800;font-size:17px">Tambah Pengeluaran</div><div style="font-size:11.5px;color:var(--muted);margin-top:1px">Catat nota fisik petty cash · Ref otomatis ${esc(svc.nextRefNumber())}</div></div>
        <div data-act="closeAdd" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></div>
      </div>
      <div style="padding:20px 22px;display:flex;flex-direction:column;gap:15px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Tanggal *</span>
            <input type="date" name="expenseDate" data-act="formInput" value="${esc(f.expenseDate)}" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text)"/></label>
          <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Unit *</span>
            <select name="unit" data-act="formInput" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text);cursor:pointer">${units}</select></label>
        </div>
        ${f.unit === 'Others' ? `<label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Nama Unit *</span>
          <input name="customUnit" data-act="formInput" data-focus="customUnit" value="${esc(f.customUnit)}" placeholder="Contoh: Sekretariat, Humas, Turnamen, PP PBSI" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text)"/></label>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Kategori *</span>
            <select name="category" data-act="formInput" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text);cursor:pointer">${cats}</select></label>
          <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Jumlah (Rp) *</span>
            <input name="amount" data-act="formInput" data-focus="amount" value="${esc(f.amount)}" inputmode="numeric" placeholder="0" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text);font-family:'JetBrains Mono',monospace"/></label>
        </div>
        <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Deskripsi *</span>
          <input name="description" data-act="formInput" data-focus="description" value="${esc(f.description)}" placeholder="Contoh: Pembelian cairan pembersih & alat pel" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text)"/></label>
        <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Catatan / Keterangan</span>
          <input name="notes" data-act="formInput" data-focus="notes" value="${esc(f.notes)}" placeholder="Contoh: nama PIC / no. kendaraan (opsional)" style="width:100%;margin-top:6px;background:var(--input);border:1px solid var(--input-bd);border-radius:9px;padding:10px 12px;font-size:13px;color:var(--text)"/></label>
        <label style="display:block"><span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Foto Nota <span style="color:var(--muted);font-weight:400;letter-spacing:0">(Opsional · disimpan untuk arsip digital)</span></span>
          <div data-act="pickReceipt" style="margin-top:6px;border:1.5px dashed var(--input-bd);border-radius:9px;padding:18px 14px;text-align:center;color:var(--muted);font-size:12.5px;cursor:pointer;background:var(--card2)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 8px;display:block"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>${f._photoName ? esc(f._photoName) : 'Klik untuk pilih foto nota fisik<br/><span style="font-size:11px">JPG, PNG · maks. 5 MB · tidak wajib</span>'}</div>
          <input id="pcReceiptInput" type="file" accept="image/*" data-act="receiptFile" style="display:none"/></label>
        ${f._err ? `<div id="pcAddErr" style="font-size:12px;color:var(--primary);background:var(--primary-tint);border-radius:8px;padding:9px 12px">${esc(f._err)}</div>` : ''}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--border2)">
        <button data-act="closeAdd" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 18px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button data-act="submitAdd" style="background:var(--primary);color:#fff;border:none;border-radius:9px;padding:10px 20px;font-weight:700;font-size:13px;cursor:pointer">Simpan Pengeluaran</button>
      </div>
    </div>
  </div>`;
}

function detailDrawer() {
  const raw = st.detailId ? getExpenseById(st.detailId) : null;
  if (!raw) return '';
  const d = decorate(raw);
  const locked = raw.status === EXPENSE_STATUS.LOCKED;
  const archived = raw.status === EXPENSE_STATUS.ARCHIVED;
  // Cascade-archived (v1.13.2): archived automatically because its Test NOR was
  // archived. Owned by the NOR — restored via the NOR, not individually.
  const cascadeArchived = archived && !!raw.archivedByNor;
  const lockedTest = lockedByTestNor(raw);
  const nor = raw.norId ? getNorById(raw.norId) : null;
  const audit = svc.getExpenseAudit(raw.id);
  const auditRows = audit.map(a => `
    <div style="position:relative;padding-bottom:16px">
      <div style="position:absolute;left:-19px;top:3px;width:10px;height:10px;border-radius:50%;background:var(--card);border:2px solid ${a.color}"></div>
      <div style="font-weight:600;font-size:12.5px">${esc(a.label || AUDIT_LABEL[a.action] || a.action)}</div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:1px">${esc(a.note)}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--label);margin-top:3px">${esc(new Date(a.timestamp).toLocaleString('id-ID'))} · ${esc(a.user)}</div>
    </div>`).join('') || '<div style="font-size:12px;color:var(--muted)">Belum ada riwayat.</div>';

  return `
  <div data-act="closeDetail" style="position:fixed;inset:0;background:rgba(20,16,14,.5);backdrop-filter:blur(2px);z-index:1500;display:flex;justify-content:flex-end;animation:pcFade .18s ease">
    <div data-act="stop" style="width:440px;max-width:94vw;height:100%;background:var(--card);border-left:1px solid var(--border);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;animation:pcPop .24s ease">
      <div style="padding:18px 22px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:flex-start">
        <div><div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)">${esc(d.refNumber)}</div><div style="font-weight:800;font-size:18px;margin-top:3px;line-height:1.25">${esc(d.description)}</div></div>
        <div data-act="closeDetail" style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 22px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
          <span style="${d.badgeStyle}" title="${esc(d.badgeTip)}">${esc(d.statusLabel)}</span>
          ${locked && nor ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Terkunci dalam ${esc(nor.norNumber)}</span>` : ''}
        </div>
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center;margin-bottom:18px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Jumlah</div>
          <div style="font-weight:800;font-size:30px;font-family:'JetBrains Mono',monospace;margin-top:4px">${esc(d.amountFmt)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--border2)"><span style="font-size:12px;color:var(--muted)">Tanggal</span><span style="font-size:12.5px;font-weight:600">${esc(d.dateFmt)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--border2)"><span style="font-size:12px;color:var(--muted)">Unit</span><span style="font-size:12.5px;font-weight:600">${esc(d.unitDisp)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--border2)"><span style="font-size:12px;color:var(--muted)">Kategori</span><span style="font-size:12.5px;font-weight:600">${esc(d.category)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid var(--border2)"><span style="font-size:12px;color:var(--muted)">Catatan</span><span style="font-size:12.5px;font-weight:600;text-align:right;max-width:60%">${esc(d.notesDisplay)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:11px 14px"><span style="font-size:12px;color:var(--muted)">Dibuat oleh</span><span style="font-size:12.5px;font-weight:600">${esc(d.createdBy || '—')}</span></div>
        </div>
        ${locked && nor ? (lockedTest
          ? `<div style="background:var(--blue-tint);border:1px solid var(--blue-bd);border-radius:11px;padding:12px 14px;margin-bottom:18px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--blue);text-transform:uppercase;margin-bottom:4px">Digunakan oleh TEST NOR</div>
          <div style="font-weight:700;font-size:13px;font-family:'JetBrains Mono',monospace">${esc(nor.norNumber)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:5px;line-height:1.4">Pengeluaran ini sedang digunakan oleh TEST NOR dan tidak dapat digunakan pada NOR lain.</div>
          <button data-act="openNorFromDetail" data-id="${esc(nor.id)}" style="margin-top:8px;background:transparent;border:none;color:var(--blue);font-size:11.5px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline">Lihat TEST NOR →</button>
        </div>`
          : `<div style="background:var(--amber-tint);border:1px solid var(--amber-bd);border-radius:11px;padding:12px 14px;margin-bottom:18px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--amber);text-transform:uppercase;margin-bottom:4px">Termasuk dalam NOR</div>
          <div style="font-weight:700;font-size:13px;font-family:'JetBrains Mono',monospace">${esc(nor.norNumber)}</div>
          <button data-act="openNorFromDetail" data-id="${esc(nor.id)}" style="margin-top:8px;background:transparent;border:none;color:var(--amber);font-size:11.5px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline">Lihat NOR Terkait →</button>
        </div>`) : ''}
        ${cascadeArchived && nor ? `<div style="background:var(--card2);border:1px solid var(--border);border-radius:11px;padding:12px 14px;margin-bottom:18px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Diarsipkan bersama NOR Test</div>
          <div style="font-weight:700;font-size:13px;font-family:'JetBrains Mono',monospace">${esc(nor.norNumber)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:5px;line-height:1.4">Pengeluaran ini diarsipkan bersama TEST NOR. Pulihkan melalui NOR terkait agar status semula kembali.</div>
          <button data-act="openNorFromDetail" data-id="${esc(nor.id)}" style="margin-top:8px;background:transparent;border:none;color:var(--primary);font-size:11.5px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline">Buka NOR Test →</button>
        </div>` : ''}
        <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1.5px;color:var(--label);text-transform:uppercase;margin-bottom:12px">Riwayat Audit</div>
        <div style="position:relative;padding-left:20px">
          <div style="position:absolute;left:5px;top:4px;bottom:6px;width:1.5px;background:var(--border)"></div>
          ${auditRows}
        </div>
      </div>
      <div style="padding:14px 22px;border-top:1px solid var(--border2);display:flex;gap:10px">
        ${locked && nor
          ? `<button data-act="openNorFromDetail" data-id="${esc(nor.id)}" style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:11px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Lihat NOR Terkait</button>`
          : cascadeArchived
            ? `<button data-act="closeDetail" style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:11px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Tutup</button>
          <button data-act="openNorFromDetail" data-id="${esc(raw.norId)}" style="display:flex;align-items:center;gap:7px;background:var(--primary-tint);border:1px solid var(--primary-tint);border-radius:9px;padding:11px 16px;font-weight:600;font-size:13px;color:var(--primary);cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>Pulihkan via NOR Test</button>`
          : archived
            ? `<button data-act="closeDetail" style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:11px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Tutup</button>
          <button data-act="restoreExpense" data-id="${esc(d.id)}" style="display:flex;align-items:center;gap:7px;background:var(--green-tint);border:1px solid var(--green-bd);border-radius:9px;padding:11px 16px;font-weight:600;font-size:13px;color:var(--green);cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 7"/></svg>Pulihkan Pengeluaran</button>`
            : `<button data-act="closeDetail" style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:11px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Tutup</button>
          <button data-act="archiveExpense" data-id="${esc(d.id)}" style="display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:11px 14px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>Arsipkan</button>
          <button data-act="deleteExpense" data-id="${esc(d.id)}" style="background:var(--primary-tint);border:1px solid var(--primary-tint);border-radius:9px;padding:11px 16px;font-weight:600;font-size:13px;color:var(--primary);cursor:pointer">Hapus</button>`}
      </div>
    </div>
  </div>`;
}

function notifModal(m) {
  const notifs = [
    m.low ? { title: 'Petty Cash Hampir Habis', time: 'baru saja', accent: 'var(--amber)', bd: 'var(--amber-bd)', icon: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>', body: `Saldo ${rp(m.balance)} di bawah ambang ${rp(m.threshold)}. Disarankan membuat Nota Organisasi Realisasi.` } : null,
  ].filter(Boolean);
  const items = notifs.map(n => `
    <div style="border:1px solid ${n.bd};border-left:3px solid ${n.accent};border-radius:11px;padding:13px 14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="display:flex;align-items:center;gap:7px;font-weight:700;font-size:13px"><span style="color:${n.accent}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${n.icon}</svg></span>${esc(n.title)}</div><div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--label)">${esc(n.time)}</div></div>
      <div style="font-size:12px;color:var(--muted);margin-top:5px;line-height:1.4">${esc(n.body)}</div>
    </div>`).join('') || '<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px">Tidak ada notifikasi.</div>';
  return `
  <div data-act="closeNotif" style="position:fixed;inset:0;background:rgba(20,16,14,.5);backdrop-filter:blur(2px);z-index:1500;display:flex;align-items:flex-start;justify-content:center;padding:60px 20px;animation:pcFade .18s ease">
    <div data-act="stop" style="width:100%;max-width:440px;background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);max-height:80vh;display:flex;flex-direction:column;animation:pcPop .22s ease">
      <div style="padding:17px 20px;border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center"><div style="font-weight:800;font-size:17px">Notifikasi</div><div data-act="closeNotif" style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted)"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></div></div>
      <div style="flex:1;overflow-y:auto;padding:14px 18px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase;margin-bottom:10px">Untuk Admin</div>
        ${items}
      </div>
      <div style="padding:13px 18px;border-top:1px solid var(--border2);display:flex;justify-content:flex-end;gap:9px"><button data-act="closeNotif" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:9px 16px;font-weight:600;font-size:12.5px;color:var(--text);cursor:pointer">Tutup</button></div>
    </div>
  </div>`;
}

function cycleModal(m) {
  const cycle = m.cycle || {};
  return `
  <div data-act="closeCycleModal" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
    <div data-act="stop" style="width:100%;max-width:480px;background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);overflow:hidden">
      <div style="background:var(--green);padding:22px 26px 20px">
        <div style="color:rgba(255,255,255,.85);font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px">Dana Pengganti Diterima</div>
        <div style="font-weight:800;font-size:20px;color:#fff;letter-spacing:-.3px">Tutup Siklus &amp; Mulai Siklus Baru</div>
      </div>
      <div style="padding:22px 26px;display:flex;flex-direction:column;gap:16px">
        <div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase;margin-bottom:9px">Ringkasan Siklus #${esc(cycle.cycleNumber || 1)}</div>
          <div style="border:1px solid var(--border);border-radius:11px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border2)"><span style="font-size:12px;color:var(--muted)">Siklus Berjalan</span><span style="font-size:12.5px;font-weight:600">#${esc(cycle.cycleNumber || 1)}</span></div>
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border2)"><span style="font-size:12px;color:var(--muted)">Saldo Awal</span><span style="font-size:12.5px;font-weight:600;font-family:'JetBrains Mono',monospace">${esc(rp(m.opening))}</span></div>
            <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border2)"><span style="font-size:12px;color:var(--muted)">Total Direalisasi</span><span style="font-size:12.5px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--primary)">${esc(rp(m.spent))}</span></div>
            <div style="display:flex;justify-content:space-between;padding:10px 14px"><span style="font-size:12px;color:var(--muted)">Sisa Kas (dikembalikan)</span><span style="font-size:12.5px;font-weight:700;font-family:'JetBrains Mono',monospace">${esc(rp(m.balance))}</span></div>
          </div>
        </div>
        <label style="display:block">
          <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:var(--label);text-transform:uppercase">Saldo Awal Siklus #${esc((cycle.cycleNumber || 1) + 1)} (Rp) *</span>
          <input value="${esc(st.newCycleBalance)}" data-act="newBalInput" data-focus="newBal" inputmode="numeric" placeholder="${esc(m.opening)}" style="width:100%;margin-top:8px;background:var(--input);border:1.5px solid var(--green);border-radius:10px;padding:12px 14px;font-size:16px;font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace"/>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">Jumlah dana pengganti yang diterima dari Finance untuk siklus berikutnya.</div>
        </label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;padding:16px 26px;border-top:1px solid var(--border2)">
        <button data-act="closeCycleModal" style="background:var(--card);border:1px solid var(--border);border-radius:9px;padding:11px 18px;font-weight:600;font-size:13px;color:var(--text);cursor:pointer">Batal</button>
        <button data-act="confirmNewCycle" style="background:var(--green);color:#fff;border:none;border-radius:9px;padding:11px 22px;font-weight:700;font-size:13px;cursor:pointer">Tutup &amp; Mulai Siklus Baru</button>
      </div>
    </div>
  </div>`;
}

function toastEl() {
  return `
  <div style="position:fixed;bottom:26px;left:50%;transform:translateX(-50%);z-index:1700;background:var(--text);color:var(--bg);padding:12px 20px;border-radius:11px;font-weight:600;font-size:13px;box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:9px;animation:pcToast .3s ease">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${esc(st.toast)}
  </div>`;
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
function bindDelegation() {
  if (bound) return; bound = true;
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
}

function actorEl(e) { return e.target.closest('[data-act]'); }

async function onClick(e) {
  const el = actorEl(e);
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  switch (act) {
    case 'stop': e.stopPropagation(); return;
    case 'exit': closePettyCashCenter(); return;
    case 'toggleTheme':
      if (typeof window.__pbsiToggleTheme === 'function') window.__pbsiToggleTheme();
      else {
        const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', cur);
      }
      render(); return;
    case 'nav': setState({ screen: id, addOpen: false, notifOpen: false, drawerOpen: false, norStep: id === 'norGenerate' ? 'select' : st.norStep }); return;
    case 'openDrawer': setState({ drawerOpen: true }); return;
    case 'closeDrawer': setState({ drawerOpen: false }); return;
    case 'openAdd': setState({ addOpen: true, drawerOpen: false, form: blankForm() }); return;
    case 'closeAdd': setState({ addOpen: false }); return;
    case 'openNotif': setState({ notifOpen: true }); return;
    case 'closeNotif': setState({ notifOpen: false }); return;
    case 'openDetail': setState({ detailId: id }); return;
    case 'closeDetail': setState({ detailId: null }); return;
    case 'pickReceipt': { const inp = root.querySelector('#pcReceiptInput'); if (inp) inp.click(); return; }
    case 'submitAdd': return submitAdd();
    case 'deleteExpense': return doDeleteExpense(id);
    case 'archiveExpense': return doArchiveExpense(id);
    case 'restoreExpense': return doRestoreExpense(id);
    case 'openNorFromDetail': setState({ detailId: null, screen: 'norDetail', norDetailId: id }); return;
    case 'filterStatus': setState({ fStatus: id }); return;
    case 'goArchive': setState({ screen: 'expenses', fStatus: 'archived', drawerOpen: false }); return;
    case 'toggleSel': return toggleSel(id);
    case 'selectAll': setState({ selectedIds: svc.availableExpenses().map(x => x.id) }); return;
    case 'clearSel': setState({ selectedIds: [] }); return;
    case 'gotoPreview': return gotoPreview();
    case 'toggleTestNor': st.norForm.isTest = !st.norForm.isTest; render(); return;
    case 'backToSelect': setState({ norStep: 'select' }); return;
    case 'confirmGenerate': return confirmGenerate();
    case 'norOpen': setState({ screen: 'norDetail', norDetailId: id }); return;
    case 'filterNorType': setState({ norFilter: id }); return;
    case 'archiveTestNor': return doArchiveTestNor(id);
    case 'restoreNor': return doRestoreNor(id);
    case 'exportNor': return doExportNor(id);
    case 'printNor': return doPrintNor(id);
    case 'receiveFunds': return openCycleModal(id);
    case 'exportExpenses': return doExportExpenses();
    case 'closeCycleModal': setState({ cycleModalOpen: false }); return;
    case 'confirmNewCycle': return confirmNewCycle();
    case 'addSig': return addSig();
    case 'removeSig': return removeSig(id);
    case 'saveSettings': return doSaveSettings();
    case 'resetSettings': setState({ settingsDraft: clone(getSettings()) }); toast('Perubahan dibatalkan'); return;
    default: return;
  }
}

function onInput(e) {
  const el = actorEl(e);
  if (!el) return;
  const act = el.dataset.act;
  const v = el.value;
  // List-filter inputs re-render the visible list. They carry data-focus so the
  // search box itself survives the re-render (the box is not a typed-into form).
  if (act === 'search') { st.fSearch = v; render(); return; }
  if (act === 'norSearch') { st.norSearch = v; render(); return; }
  // ── Form fields: update state ONLY — never re-render the active form. ──
  // A full render() here would replace the focused <input>, destroying its
  // native focus and caret on every keystroke. The DOM already shows the typed
  // value, so state just needs to stay in sync for the next structural render
  // (open/close/submit). Read-only previews that depend on a field are patched
  // in place below, without touching the form. (v1.13.2 focus-retention fix)
  if (act === 'formInput') { st.form[el.name] = v; st.form._err = ''; clearAddError(); return; }
  if (act === 'norForm') { st.norForm[el.name] = v; patchNorPreview(); return; }
  if (act === 'newBalInput') { st.newCycleBalance = v; return; }
  if (act === 'setInput') { setDraftField(el.name, v); patchSettingsStats(); return; }
  if (act === 'sigInput') { setSigField(el.dataset.id, el.name, v); return; }
}

/* ── Targeted in-place patches for read-only previews ──────────────────
   These update a single dependent display node without re-rendering the
   form, so typed inputs keep focus and caret naturally. */
function clearAddError() {
  const errEl = root && root.querySelector('#pcAddErr');
  if (errEl) errEl.remove();
}
function patchNorPreview() {
  if (!root) return;
  const full = root.querySelector('#pcNorFull');
  if (full) {
    const valid = isValidNorSequence(st.norForm.sequence);
    full.textContent = valid
      ? norNumberFromSequence(st.norForm.sequence, st.norForm.date)
      : 'Masukkan nomor urut (angka) untuk melihat nomor lengkap';
    full.style.color = valid ? 'var(--primary-text)' : 'var(--muted)';
    full.style.fontWeight = valid ? '600' : '';
  }
  const subj = root.querySelector('#pcNorSubject');
  if (subj) subj.textContent = norAutoSubject(st.norForm.date);
}
function patchSettingsStats() {
  if (!root) return;
  const sd = st.settingsDraft || {};
  const o = root.querySelector('#pcStatOpening');
  if (o) o.textContent = rp(sd.openingBalance);
  const t = root.querySelector('#pcStatThreshold');
  if (t) t.textContent = rp(sd.lowBalanceThreshold);
}

function onChange(e) {
  const el = actorEl(e);
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'filterUnit') { setState({ fUnit: el.value }); return; }
  if (act === 'formInput') {
    st.form[el.name] = el.value; st.form._err = '';
    // Only the Unit select toggles dependent layout (the custom-unit field),
    // so it alone needs a structural re-render. Other fields (category select,
    // date picker) update state silently to preserve focus. (v1.13.2)
    if (el.name === 'unit') render(); else clearAddError();
    return;
  }
  if (act === 'norForm') { st.norForm[el.name] = el.value; patchNorPreview(); return; }
  if (act === 'receiptFile') { return onReceiptFile(el); }
}

/* ── Action implementations ──────────────────────────────────────── */
function toggleSel(id) {
  const s = st.selectedIds;
  setState({ selectedIds: s.includes(id) ? s.filter(x => x !== id) : s.concat(id) });
}

async function submitAdd() {
  const f = st.form;
  const amount = parseAmount(f.amount);
  if (!f.description.trim() || !amount || (f.unit === 'Others' && !f.customUnit.trim())) {
    st.form._err = 'Lengkapi deskripsi, jumlah, dan nama unit.'; render(); return;
  }
  try {
    const exp = await svc.createExpense({
      expenseDate: f.expenseDate, unit: f.unit, customUnit: f.customUnit,
      category: f.category, amount, description: f.description, notes: f.notes,
      receiptImage: f._receiptData || null,
    });
    setState({ addOpen: false, form: blankForm() });
    toast(`Pengeluaran ${exp.refNumber} tersimpan`);
  } catch (err) { st.form._err = err.message || 'Gagal menyimpan.'; render(); }
}

async function doDeleteExpense(id) {
  try { await svc.removeExpense(id); setState({ detailId: null }); toast('Pengeluaran dihapus'); }
  catch (err) { toast(err.message || 'Gagal menghapus'); }
}

async function doArchiveExpense(id) {
  const e = getExpenseById(id);
  const ref = e ? e.refNumber : 'ini';
  // Confirmation required (P3). Archiving is reversible via the Arsip filter.
  if (!window.confirm(`Arsipkan pengeluaran ${ref}?\n\nPengeluaran akan keluar dari daftar operasional dan tidak dapat dipilih untuk NOR. Anda dapat memulihkannya kapan saja dari filter Arsip.`)) return;
  try { await svc.archiveExpense(id); setState({ detailId: null }); toast('Pengeluaran diarsipkan'); }
  catch (err) { toast(err.message || 'Gagal mengarsipkan'); }
}

async function doRestoreExpense(id) {
  try { await svc.restoreExpense(id); setState({ detailId: null }); toast('Pengeluaran dipulihkan'); }
  catch (err) { toast(err.message || 'Gagal memulihkan'); }
}

function gotoPreview() {
  if (!st.selectedIds.length) { toast('Pilih minimal satu nota untuk lanjut.'); return; }
  if (!isValidNorSequence(st.norForm.sequence)) { toast('Nomor urut NOR wajib diisi (angka positif).'); return; }
  setState({ norStep: 'preview' });
}

async function confirmGenerate() {
  if (!isValidNorSequence(st.norForm.sequence)) { toast('Nomor urut NOR wajib diisi (angka positif).'); return; }
  try {
    const fullNumber = norNumberFromSequence(st.norForm.sequence, st.norForm.date);
    const nor = await svc.generateNor({
      expenseIds: st.selectedIds, norNumber: fullNumber, norDate: st.norForm.date,
      type: st.norForm.isTest ? NOR_TYPE.TEST : NOR_TYPE.OFFICIAL,
    });
    setState({
      selectedIds: [], norStep: 'select', screen: 'norDetail', norDetailId: nor.id,
      norFilter: NOR_TYPE.OFFICIAL, // non-archived NORs (incl. Test) live under Official
      norForm: { sequence: '', date: todayISO(), isTest: false },
    });
    toast(`NOR ${nor.norNumber} berhasil dibuat${nor.type === NOR_TYPE.TEST ? ' (TEST)' : ''}`);
  } catch (err) { toast(err.message || 'Gagal membuat NOR'); }
}

async function doArchiveTestNor(id) {
  const nor = getNorById(id); if (!nor) return;
  const isTest = nor.type === NOR_TYPE.TEST;
  // Test NOR archive cascades to its expenses, so confirm the wider effect.
  const msg = isTest
    ? `Arsipkan NOR Test ${nor.norNumber}?\n\nSemua pengeluaran yang terkunci di NOR ini akan ikut diarsipkan dan keluar dari daftar operasional. Anda dapat memulihkannya kembali dengan memulihkan NOR ini.`
    : `Arsipkan NOR ${nor.norNumber}?`;
  if (!window.confirm(msg)) return;
  try {
    const res = await svc.archiveTestNor(id);
    setState({ screen: 'norHistory', norFilter: 'archived', norDetailId: null });
    toast(res.isTest && res.cascadedCount
      ? `${nor.norNumber} diarsipkan · ${res.cascadedCount} pengeluaran ikut diarsipkan`
      : `${nor.norNumber} diarsipkan${isTest ? ' (Test)' : ''}`);
  } catch (err) { toast(err.message || 'Gagal mengarsipkan'); }
}

async function doRestoreNor(id) {
  const nor = getNorById(id); if (!nor) return;
  try {
    const res = await svc.restoreNor(id);
    setState({ screen: 'norDetail', norDetailId: id });
    toast(res.isTest && res.cascadedCount
      ? `${nor.norNumber} dipulihkan · ${res.cascadedCount} pengeluaran ikut dipulihkan`
      : `${nor.norNumber} dipulihkan`);
  } catch (err) { toast(err.message || 'Gagal memulihkan NOR'); }
}

async function doExportNor(id) {
  const nor = getNorById(id); if (!nor) return;
  toast('Menyiapkan Excel…');
  try { const fn = await exportNorExcel(nor); toast(`Excel diunduh: ${fn}`); }
  catch (err) { console.error(err); toast('Gagal membuat Excel'); }
}
async function doExportExpenses() {
  toast('Menyiapkan Excel…');
  try { const fn = await exportExpensesExcel(); toast(`Excel diunduh: ${fn}`); }
  catch (err) { console.error(err); toast('Gagal membuat Excel'); }
}
async function doPrintNor(id) {
  const nor = getNorById(id); if (!nor) return;
  toast('Menyiapkan PDF…');
  try { await previewNorPdf(nor); }
  catch (err) { console.error(err); toast('Gagal membuat PDF'); }
}

function openCycleModal(norId) {
  const m = svc.computeMetrics();
  setState({ cycleModalOpen: true, norDetailId: norId || st.norDetailId, newCycleBalance: String(m.opening) });
}
async function confirmNewCycle() {
  const bal = parseAmount(st.newCycleBalance) || svc.computeMetrics().opening;
  try {
    const res = await svc.receiveReplenishment({ norId: st.norDetailId, newOpeningBalance: bal });
    setState({ cycleModalOpen: false, screen: 'dashboard' });
    toast(`Siklus #${res.newCycleNumber} dimulai. Saldo awal: ${rp(res.opening)}`);
  } catch (err) { toast(err.message || 'Gagal menutup siklus'); }
}

/* ── Settings draft helpers ──────────────────────────────────────── */
function ensureDraft() { if (!st.settingsDraft) st.settingsDraft = clone(getSettings()); }
function setDraftField(name, value) {
  ensureDraft();
  if (name === 'openingBalance' || name === 'lowBalanceThreshold') st.settingsDraft[name] = parseAmount(value);
  else st.settingsDraft[name] = value;
}
function setSigField(id, field, value) {
  ensureDraft();
  const sid = Number(id);
  st.settingsDraft.signatories = (st.settingsDraft.signatories || []).map(s =>
    s.id === sid ? { ...s, [field]: field === 'order' ? (parseInt(value, 10) || 1) : value } : s);
}
function addSig() {
  ensureDraft();
  const list = st.settingsDraft.signatories || [];
  const nid = list.length ? Math.max(...list.map(s => s.id)) + 1 : 1;
  list.push({ id: nid, label: 'Mengetahui', name: '', position: '', order: list.length + 1 });
  st.settingsDraft.signatories = list;
  render();
}
function removeSig(id) {
  ensureDraft();
  const sid = Number(id);
  st.settingsDraft.signatories = (st.settingsDraft.signatories || []).filter(s => s.id !== sid);
  render();
}
async function doSaveSettings() {
  ensureDraft();
  try { await storeSaveSettings(st.settingsDraft); toast('Pengaturan disimpan'); }
  catch (err) { toast(err.message || 'Gagal menyimpan'); }
}

/* ── Receipt image (optional, stored as data URL for digital archive) ── */
function onReceiptFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Foto melebihi 5 MB'); return; }
  const reader = new FileReader();
  reader.onload = () => { st.form._receiptData = reader.result; st.form._photoName = file.name; render(); };
  reader.readAsDataURL(file);
}

/* ── Expose for app.js wiring ────────────────────────────────────── */
export function initPettyCash() { /* lazy — store initialises on first open */ }
