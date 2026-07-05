/* ============================================================
   ENGINEERING-CENTER.JS — Engineering module entry (v1.20.1)

   Mounts the Engineering Operations UI into a platform-owned host and drives
   it: loads data through the PROVIDER (dev-seed adapter today, Firebase next
   sprint), subscribes to the Engineering Store, renders the active screen +
   drawer + create modal, and routes every user action through the ASSIGNMENT
   and VERIFICATION engines. It contains NO business logic and NO hardcoded
   data — it is the presentation shell over the v1.20.0 foundation.

   Rendering model mirrors the Petty Cash Center: a single innerHTML render per
   state change, one delegated handler reading data-act, with search-input
   focus/caret restoration.
   ============================================================ */

'use strict';

import { STATUS } from '../config/engineering-config.js';
import { ENGINEERING_ROLE, can as registryCan } from '../../config/role-registry.js';
import { isDevelopment } from '../../config.js';
import { getCurrentUser } from '../../auth.js';
import {
  getAssignment, listAssignments, upsertAssignment,
  registerEngineeringChangeListener, nextAssignmentSequence,
} from '../stores/engineering-store.js';
import {
  createAssignment, publishAssignment, markAvailable, joinAssignment,
  startAssignment, finishAssignment, continueTomorrowAssignment,
  postponeAssignment, transitionAssignment,
} from '../engines/assignment-engine.js';
import { verifyAssignment } from '../engines/verification-engine.js';
import { loadAll } from '../providers/engineering-provider.js';
import { createDevSeedAdapter } from '../providers/dev-seed-adapter.js';
import { SEED_MEMBERS } from '../providers/dev-seed-data.js';
import { locationProvider, categoryProvider, priorityProvider } from '../master-data/engineering-master-data.js';
import { bidangRoster } from '../../petty-cash/petty-cash-service.js';
import { esc, icon } from './engineering-atoms.js';
import { renderQueue } from './engineering-queue.js';
import { renderOpsDashboard, renderMemberDashboard } from './engineering-dashboard.js';
import { renderTimelinePage, renderHistory, renderSettings } from './engineering-views.js';
import { renderDrawer } from './engineering-drawer.js';

const st = {
  screen: 'dashboard',
  drawerId: null,
  creating: false,
  filters: { cat: 'all', q: '', tl: 'semua', hq: '' },
  expandedId: null,   // the single timeline card the user has expanded (null = all collapsed)
  form: null,
};

let host = null, unsub = null, mounted = false, loaded = false;

/* ── context (role + identity + capabilities) ─────────────────────────── */
function ctx() {
  const u = getCurrentUser() || {};
  const role = u.role || 'admin';
  return {
    role,
    me: { id: u.username || u.id || 'me', name: u.name || u.username || 'Pengguna' },
    canEng: (cap) => registryCan(cap, role),
    roster: SEED_MEMBERS,
    now: Date.now(),
    filters: st.filters,
    expandedId: st.expandedId,
  };
}

/* ── mount / screen / teardown ────────────────────────────────────────── */
export async function mountEngineering(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('eng-root');
  if (!mounted) {
    mounted = true;
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('submit', onSubmit);
    unsub = registerEngineeringChangeListener(() => render());
  }
  if (!loaded) {
    loaded = true;
    // Dev seed loads ONLY in Development. In staging/production the store stays
    // empty until the Firebase adapter is wired (next sprint) → clean empty state,
    // never fake production data.
    if (isDevelopment()) {
      try { await loadAll(createDevSeedAdapter()); } catch (e) { console.warn('[Engineering] seed load failed', e); }
    }
  }
  render();
}

export function setEngineeringScreen(screen) {
  st.screen = screen || 'dashboard';
  st.drawerId = null;
  render();
}

/**
 * Open the "Buat Penugasan" modal from the shell sidebar CTA (v1.20.2).
 * Admin-only (matches the eng.create capability); silently no-ops otherwise.
 */
export function openEngineeringCreate() {
  const c = ctx();
  if (!c.canEng('eng.create')) return;
  st.creating = true;
  st.form = blankForm();
  render();
}

/** Set the module-aware global search query (adaptive search adapter, v1.20.2).
 *  The Assignment Queue is the searchable surface, so a non-empty query surfaces
 *  it (title / lokasi / ID / pemohon are filtered by ctx.filters.q). */
export function setEngineeringSearch(q) {
  st.filters.q = q || '';
  if (st.filters.q && st.screen !== 'queue') st.screen = 'queue';
  render();
}

export function closeEngineering() { /* shell hides the host; state is retained */ }

/* ── render ───────────────────────────────────────────────────────────── */
function render() {
  if (!host) return;
  const c = ctx();
  const all = listAssignments();
  // Empty store (production before Firebase, or a fresh dev boot) → a clean
  // empty state on the data screens, never blank widgets or fake data.
  if (all.length === 0 && st.screen !== 'settings') {
    host.innerHTML = `<div class="eng-content">${emptyScreen(c)}</div>`;
    return;
  }
  let screen;
  switch (st.screen) {
    case 'timeline': screen = renderTimelinePage(all, c); break;
    case 'history': screen = renderHistory(all, c); break;
    case 'settings': screen = c.canEng('eng.settings') ? renderSettings(all, c) : denied(); break;
    case 'queue': screen = renderQueue(all, c); break;
    case 'dashboard':
    default:
      screen = c.role === ENGINEERING_ROLE.MEMBER ? renderMemberDashboard(all, c) : renderOpsDashboard(all, c);
  }
  const drawer = st.drawerId ? renderDrawer(getAssignment(st.drawerId), c) : '';
  const modal = st.creating ? createModal(c) : '';
  host.innerHTML = `<div class="eng-content">${screen}</div>${drawer}${modal}`;
  restoreFocus();
}

function denied() {
  return `<div class="eng-screen"><div class="eng-empty"><div class="eng-empty-t">Akses terbatas</div><div class="eng-empty-h">Halaman ini hanya untuk Admin Sarpras.</div></div></div>`;
}

function emptyScreen(c) {
  const canCreate = c.canEng('eng.create');
  return `<div class="eng-screen"><div class="eng-empty">
    <span class="eng-empty-ic">${icon('wrench', { size: 28 })}</span>
    <div class="eng-empty-t">Belum ada penugasan</div>
    <div class="eng-empty-h">${canCreate
      ? 'Buat penugasan pertama dari tombol di panel kiri untuk memulai operasi Engineering.'
      : 'Penugasan akan muncul di sini setelah dipublikasikan oleh Admin Sarpras.'}</div>
  </div></div>`;
}

/* ── delegated events ─────────────────────────────────────────────────── */
function onClick(e) {
  const scrim = e.target.closest('[data-act="eng-scrim"]');
  if (scrim && !e.target.closest('.eng-drawer') && !e.target.closest('.eng-modal-box')) { st.drawerId = null; st.creating = false; render(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || !host.contains(el)) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const worker = el.dataset.worker;
  const val = el.dataset.val;
  const c = ctx();

  switch (act) {
    case 'eng-open': st.drawerId = id; render(); break;
    case 'eng-close-drawer': st.drawerId = null; render(); break;
    case 'eng-create': if (c.canEng('eng.create')) { st.creating = true; st.form = blankForm(); render(); } break;
    case 'eng-create-cancel': st.creating = false; render(); break;
    case 'eng-goto': setEngineeringScreen(val); break;
    case 'eng-filter-cat': st.filters.cat = val; render(); break;
    case 'eng-tl-filter': st.filters.tl = val; render(); break;
    case 'eng-tl-toggle': toggleExpanded(id); break;
    case 'eng-reset-seed': reseed(); break;
    case 'eng-noop': break;
    case 'eng-begin': doBegin(id, c); break;
    case 'eng-resume': doResume(id, c); break;
    case 'eng-finish': act1(id, (a) => finishAssignment(a, { workerId: worker || c.me.id, actor: c.me }), c); break;
    case 'eng-continue': act1(id, (a) => continueTomorrowAssignment(a, { workerId: worker || c.me.id, actor: c.me }), c); break;
    case 'eng-verify': if (c.canEng('eng.verify')) act1(id, (a) => verifyAssignment(a, c.me, { now: Date.now() })); break;
    case 'eng-postpone': if (c.canEng('eng.postpone')) act1(id, (a) => postponeAssignment(a, { actor: c.me })); break;
    case 'eng-reopen': if (c.canEng('eng.reopen')) act1(id, (a) => transitionAssignment(a, STATUS.AVAILABLE, { now: Date.now() })); break;
    default: break;
  }
}

function onInput(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'eng-search') { st.filters.q = el.value; render(); }
  else if (el.dataset.act === 'eng-hsearch') { st.filters.hq = el.value; render(); }
  else if (el.dataset.field) {
    if (!st.form) return;
    st.form[el.dataset.field] = el.value;
    // Location cascade: a Gedung/Lantai change re-derives the dependent selects.
    if (el.dataset.field === 'building' || el.dataset.field === 'floor') {
      reconcileLocation(st.form);
      render();
    }
  }
}

function onSubmit(e) {
  const form = e.target.closest('[data-act="eng-create-form"]');
  if (!form) return;
  e.preventDefault();
  submitCreate(ctx());
}

/* ── action helpers (all go through the engines + store) ──────────────── */
function act1(id, fn, c) {
  const a = getAssignment(id);
  if (!a) return;
  try { upsertAssignment(fn(a)); } catch (err) { console.warn('[Engineering] action failed', err); }
}

function doBegin(id, c) {
  const a = getAssignment(id);
  if (!a || !c.canEng('eng.join')) return;
  try {
    let next = joinAssignment(a, { workerId: c.me.id, name: c.me.name }, { actor: c.me });
    next = startAssignment(next, { workerId: c.me.id, actor: c.me });
    upsertAssignment(next);
  } catch (err) { console.warn('[Engineering] begin failed', err); }
}

function doResume(id, c) {
  const a = getAssignment(id);
  if (!a) return;
  try {
    let next = a.status === STATUS.CONTINUE_TOMORROW ? transitionAssignment(a, STATUS.IN_PROGRESS, { now: Date.now() }) : a;
    next = startAssignment(next, { workerId: c.me.id, actor: c.me });
    upsertAssignment(next);
  } catch (err) { console.warn('[Engineering] resume failed', err); }
}

function toggleExpanded(id) {
  // Collapsed by default; at most ONE card expanded at a time. Selecting another
  // collapses the previous one. The choice persists across filter changes because
  // it lives in st (not recomputed per render).
  st.expandedId = (st.expandedId === id) ? null : id;
  render();
}

async function reseed() {
  if (!isDevelopment()) return;   // demo data is a Development-only fixture
  loaded = false;
  try { await loadAll(createDevSeedAdapter()); } catch (e) { /* ignore */ }
  loaded = true;
  render();
}

/* ── create-assignment modal ──────────────────────────────────────────────
   Operational inputs come from the reusable MASTER DATA providers (location
   hierarchy, category, priority) and the shared Bidang roster (requester) — no
   free-text location, no hard-coded requester (v1.20.2). */
function firstBidangName() {
  const roster = bidangRoster();
  return roster.length ? roster[0].name : '';
}

function blankForm() {
  const b0 = locationProvider.buildings()[0];
  const f0 = b0 ? (locationProvider.floors(b0.id)[0] || null) : null;
  const r0 = (b0 && f0) ? (locationProvider.rooms(b0.id, f0.id)[0] || null) : null;
  return {
    title: '',
    building: b0 ? b0.id : '', floor: f0 ? f0.id : '', room: r0 ? r0.id : '',
    category: categoryProvider.list()[0]?.id || 'general-repair',
    priority: 'normal',
    requester: firstBidangName(),
    dueDate: 'Hari ini · 16:00', note: '',
  };
}

/** Keep the location cascade consistent after a Gedung/Lantai change. */
function reconcileLocation(f) {
  const floors = locationProvider.floors(f.building);
  if (!floors.some((x) => x.id === f.floor)) f.floor = floors[0]?.id || '';
  const rooms = locationProvider.rooms(f.building, f.floor);
  if (!rooms.some((x) => x.id === f.room)) f.room = rooms[0]?.id || '';
}

function submitCreate(c) {
  const f = st.form || blankForm();
  if (!f.title.trim()) return;
  const buildingLabel = locationProvider.labelOf(f.building);
  const floorLabel = (locationProvider.floors(f.building).find((x) => x.id === f.floor) || {}).label || '';
  const roomLabel = (locationProvider.rooms(f.building, f.floor).find((x) => x.id === f.room) || {}).label || '';
  const location = [buildingLabel, floorLabel, roomLabel].filter(Boolean).join(' · ');
  try {
    let a = createAssignment({
      title: f.title, description: f.note, category: f.category, priority: f.priority,
      building: buildingLabel, room: roomLabel, location,
      requester: f.requester, dueDate: f.dueDate, creator: c.me,
    }, { sequence: nextAssignmentSequence(), actor: c.me });
    a = publishAssignment(a, { actor: c.me });
    a = markAvailable(a, { actor: c.me, recipientCount: SEED_MEMBERS.length + 1 });
    upsertAssignment(a);
  } catch (err) { console.warn('[Engineering] create failed', err); }
  st.creating = false;
  st.drawerId = null;
  render();
}

function createModal(c) {
  const f = st.form || blankForm();
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  const buildings = locationProvider.buildings();
  const floors = locationProvider.floors(f.building);
  const rooms = locationProvider.rooms(f.building, f.floor);
  const roster = bidangRoster();
  const requesterField = roster.length
    ? `<select class="eng-input" data-field="requester">${roster.map((b) => opt(b.name, b.name, b.name === f.requester)).join('')}</select>`
    : `<input class="eng-input" data-field="requester" value="${esc(f.requester)}" placeholder="Nama bidang pemohon" />`;
  return `<div class="eng-scrim -open -center" data-act="eng-scrim">
    <form class="eng-modal-box" data-act="eng-create-form">
      <div class="eng-modal-head"><div><div class="eng-modal-kicker">Penugasan Baru</div><h2 class="eng-modal-title">Buat Penugasan</h2></div>
        <button type="button" class="eng-icon-btn" data-act="eng-create-cancel">${icon('close', { size: 18 })}</button></div>
      <div class="eng-modal-body">
        <label class="eng-field"><span>Judul pekerjaan</span><input class="eng-input" data-field="title" value="${esc(f.title)}" placeholder="mis. Ganti lampu koridor Lantai 2" /></label>
        <div class="eng-field-row">
          <label class="eng-field"><span>Gedung</span><select class="eng-input" data-field="building">${buildings.map((b) => opt(b.id, b.label, b.id === f.building)).join('')}</select></label>
          <label class="eng-field"><span>Lantai</span><select class="eng-input" data-field="floor">${floors.map((fl) => opt(fl.id, fl.label, fl.id === f.floor)).join('')}</select></label>
          <label class="eng-field"><span>Ruangan</span><select class="eng-input" data-field="room">${rooms.map((r) => opt(r.id, r.label, r.id === f.room)).join('')}</select></label>
        </div>
        <div class="eng-field-row">
          <label class="eng-field"><span>Kategori</span><select class="eng-input" data-field="category">${categoryProvider.list().map((k) => opt(k.id, k.label, k.id === f.category)).join('')}</select></label>
          <label class="eng-field"><span>Prioritas</span><select class="eng-input" data-field="priority">${priorityProvider.list().map((p) => opt(p.id, p.label, p.id === f.priority)).join('')}</select></label>
        </div>
        <div class="eng-field-row">
          <label class="eng-field"><span>Pemohon (Bidang)</span>${requesterField}</label>
          <label class="eng-field"><span>Target selesai</span><input class="eng-input" data-field="dueDate" value="${esc(f.dueDate)}" /></label>
        </div>
        <label class="eng-field"><span>Catatan</span><textarea class="eng-input eng-textarea" data-field="note" placeholder="Deskripsi singkat pekerjaan…">${esc(f.note)}</textarea></label>
      </div>
      <div class="eng-modal-foot">
        <span class="eng-modal-hint">${icon('bell', { size: 14 })} Notifikasi terkirim ke semua teknisi</span>
        <div class="eng-modal-actions"><button type="button" class="eng-btn -ghost" data-act="eng-create-cancel">Batal</button>
        <button type="submit" class="eng-btn -primary">${icon('check-circle', { size: 15 })} Publikasikan</button></div>
      </div>
    </form>
  </div>`;
}

/* ── focus restoration for live search inputs ─────────────────────────── */
function restoreFocus() {
  const act = st._focusAct;
  if (!act) return;
  const el = host.querySelector(`[data-act="${act}"]`);
  if (el) { el.focus(); try { const n = el.value.length; el.setSelectionRange(n, n); } catch (_) {} }
}
// track which search input is focused so re-render can restore it
document.addEventListener('focusin', (e) => {
  const a = e.target && e.target.dataset && e.target.dataset.act;
  st._focusAct = (a === 'eng-search' || a === 'eng-hsearch') ? a : null;
}, true);
