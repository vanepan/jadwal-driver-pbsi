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
import { isDevelopment, getAppEnv } from '../../config.js';
import { getCurrentUser } from '../../auth.js';
import { todayString, offsetDate } from '../../utils.js';
import { initPbsiDatepicker, syncPbsiDatepicker } from '../../pbsi-datepicker.js';
import {
  getAssignment, listAssignments, upsertAssignment, removeAssignment,
  registerEngineeringChangeListener, nextAssignmentSequence,
  hydrateAssignments,
  upsertWorkReport, nextReportSequence, hydrateWorkReports, listWorkReports,
} from '../stores/engineering-store.js';
import {
  createAssignment, publishAssignment, markAvailable, joinAssignment,
  startAssignment, finishAssignment, continueTomorrowAssignment,
  postponeAssignment, transitionAssignment, cancelAssignment, archiveAssignment,
} from '../engines/assignment-engine.js';
import { verifyAssignment } from '../engines/verification-engine.js';
import {
  loadAll, loadAnalytics, initializeProvider,
  saveAssignmentThrough, subscribeProvider, transactAssignmentThrough,
  deleteAssignmentThrough, saveWorkReportThrough,
} from '../providers/engineering-provider.js';
import { normalizeAssignment, isDeletable } from '../models/engineering-assignment.js';
import { createWorkReportModel } from '../models/engineering-work-report.js';
import { listEngineeringPersonnel } from '../personnel/engineering-personnel.js';
import { registerAdapter, hasAdapter, resolveAdapter } from '../providers/provider-registry.js';
import { loadDemoData, resetDemoData, clearAllData } from '../providers/seed-manager.js';
import { categoryProvider, priorityProvider } from '../master-data/engineering-master-data.js';
import { bidangRoster } from '../../petty-cash/petty-cash-service.js';
import { excludeAkuntesFromSuggestions } from '../../services/dispatch-policy-engine.js';
import { esc, icon, fmtDeadline } from './engineering-atoms.js';
import { renderQueue } from './engineering-queue.js';
import { renderOpsDashboard, renderMemberDashboard } from './engineering-dashboard.js';
import { renderTimelinePage, renderHistory, renderSettings } from './engineering-views.js';
import { renderDrawer } from './engineering-drawer.js';

const st = {
  screen: 'dashboard',
  drawerId: null,
  creating: false,
  formMode: 'assignment',   // 'assignment' (Buat Penugasan) | 'report' (Catat Pekerjaan)
  filters: { cat: 'all', q: '', tl: 'semua', hq: '' },
  expandedId: null,   // the single timeline card the user has expanded (null = all collapsed)
  form: null,
};

let host = null, unsub = null, mounted = false, loaded = false, adapter = null, providerUnsub = null;

// Idempotency guard: assignment ids with an ownership-sensitive write in flight.
// A repeated click / retry on the same assignment while one is pending is ignored,
// so duplicate joins and duplicate timeline events cannot be produced by the UI.
const inFlight = new Set();

/* The Engineering "roster" is DATA-DRIVEN — the distinct members who have
   actually participated in assignments — never a hardcoded list. So an empty
   store yields an empty roster (0 members), and the roster only fills once real
   (or, in Development, explicitly-seeded) assignments exist. */
function deriveRoster(assignments) {
  const names = new Set();
  for (const a of assignments) {
    for (const p of (a.participants || [])) if (p && p.name) names.add(p.name);
  }
  return [...names];
}

/* ── context (role + identity + capabilities) ─────────────────────────── */
function ctx() {
  const u = getCurrentUser() || {};
  const role = u.role || 'admin';
  return {
    role,
    me: { id: u.username || u.id || 'me', name: u.name || u.username || 'Pengguna' },
    canEng: (cap) => registryCan(cap, role),
    roster: deriveRoster(listAssignments()),
    workReports: listWorkReports(),
    now: Date.now(),
    filters: st.filters,
    expandedId: st.expandedId,
    isDev: isDevelopment(),   // gates Development-only Seed Manager controls
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
    // Deterministic startup: APP_ENV → resolve adapter → initialize → fetch →
    // subscribe. NO automatic seeding anywhere. In Development the adapter is an
    // EMPTY in-memory store (data appears only via the Seed Manager); in staging
    // and production it is the real Firebase adapter, so an existing RTDB state
    // is fetched (a browser refresh preserves data) and realtime keeps every
    // device in sync. An empty store simply renders the clean empty state.
    adapter = await ensureAdapter();
    await initializeProvider(adapter);
    try { await loadAll(adapter); } catch (e) { console.warn('[Engineering] initial load failed', e); }
    // Live sync: the adapter pushes the engineering root ({assignments,
    // notifications}) on every remote change → hydrate the store → re-render.
    providerUnsub = subscribeProvider(adapter, onRemoteEngineeringChange);
  }
  render();
}

/**
 * Resolve the data-source adapter for the active APP_ENV through the registry.
 *   • development → the EMPTY in-memory dev-seed adapter (seedable, offline)
 *   • staging / production → the real Firebase adapter (persist + realtime)
 * Each adapter module is imported lazily so the dev seed never ships to
 * production and firebase.js never loads in Development.
 */
async function ensureAdapter() {
  const env = getAppEnv();
  if (env === 'development') {
    if (!hasAdapter('development')) {
      const { createDevSeedAdapter } = await import('../providers/dev-seed-adapter.js');
      registerAdapter('development', () => createDevSeedAdapter());
    }
  } else if (!hasAdapter(env)) {
    const { createFirebaseAdapter } = await import('../providers/firebase-adapter.js');
    registerAdapter(env, () => createFirebaseAdapter());
  }
  return resolveAdapter(env);
}

/**
 * Apply a remote storage snapshot to the store. Hydrating notifies the store's
 * change listener, which re-renders; analytics are recomputed + cached so the
 * Engineering Analytics section reflects the same live data.
 * @param {?{assignments?:Object, notifications?:Array|Object}} root
 */
function onRemoteEngineeringChange(root) {
  hydrateAssignments((root && root.assignments) || {});
  hydrateWorkReports((root && root.workReports) || {});
  // Notifications are NOT read from engineering/notifications. Engineering
  // notifications flow through the SAME pipeline as Driver/Request: the
  // onEngineeringAssignmentWrite Cloud Function → /events → notification engine
  // → /notifications/{uid}, surfaced by the shared bell (js/notifications.js
  // syncServerNotifications). There is no separate Engineering notification
  // store, no client-generated notification, and no parallel persistence (Obj 4).
  loadAnalytics({ now: Date.now() });
  _diagLastSyncAt = Date.now(); _diagLastAnalyticsAt = _diagLastSyncAt;   /* DIAGNOSTIC (removable) */
}

/* DIAGNOSTIC (removable): read-only runtime snapshot for the Production Diagnostic
   panel (Ctrl+Shift+D). Reports existing module state; changes no behaviour. */
let _diagLastSyncAt = null, _diagLastAnalyticsAt = null;
export function getEngineeringRuntimeInfo() {
  return {
    adapterKind: adapter ? adapter.kind : null,
    subscriptionActive: !!providerUnsub,
    lastSyncAt: _diagLastSyncAt,
    lastAnalyticsAt: _diagLastAnalyticsAt,
    inFlight: inFlight.size,
    env: getAppEnv(),
  };
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
  st.formMode = 'assignment';
  st.form = blankForm();
  render();
}

/**
 * Open the "Catat Pekerjaan" (Operational Work Report) modal — v1.20.6,
 * Objective 3. Available to Admin + Engineering Coordinator (eng.report.create).
 * Reuses the create modal in report mode; silently no-ops otherwise.
 */
export function openEngineeringReport() {
  const c = ctx();
  if (!c.canEng('eng.report.create')) return;
  st.creating = true;
  st.formMode = 'report';
  st.form = blankReportForm();
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
  const modal = st.creating ? createModal(c) : '';
  // Empty store (fresh production RTDB, or a fresh dev boot) → a clean empty
  // state on the data screens, never blank widgets or fake data. The create
  // modal still overlays it so an admin can add the first assignment.
  if (all.length === 0 && listWorkReports().length === 0 && st.screen !== 'settings') {
    host.innerHTML = `<div class="eng-content">${emptyScreen(c)}</div>${modal}`;
    if (st.creating) mountCreateWidgets();
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
  host.innerHTML = `<div class="eng-content">${screen}</div>${drawer}${modal}`;
  restoreFocus();
  if (st.creating) mountCreateWidgets();
}

/** Attach the shared PBSI date picker to the create modal's date input — the
 *  assignment "deadline" or the work-report "workDate" (whichever is present).
 *  Idempotent per element (the picker registry guards re-init). */
function mountCreateWidgets() {
  const isReport = st.formMode === 'report';
  const field = isReport ? 'workDate' : 'deadline';
  const input = host.querySelector(`.eng-modal-box [data-field="${field}"]`);
  if (!input) return;
  initPbsiDatepicker(input, {
    presets: isReport
      ? [
        { label: 'Hari Ini', getValue: () => todayString() },
        { label: 'Kemarin', getValue: () => offsetDate(todayString(), -1) },
        { label: 'Pilih Tanggal', openCalendar: true },
      ]
      : [
        { label: 'Hari Ini', getValue: () => todayString() },
        { label: 'Besok', getValue: () => offsetDate(todayString(), 1) },
        { label: '+7 Hari', getValue: () => offsetDate(todayString(), 7) },
        { label: 'Pilih Tanggal', openCalendar: true },
      ],
  });
  const val = st.form && st.form[field];
  if (val) { input.value = val; syncPbsiDatepicker(input); }
}

function denied() {
  return `<div class="eng-screen"><div class="eng-empty"><div class="eng-empty-t">Akses terbatas</div><div class="eng-empty-h">Halaman ini hanya untuk Admin Sarpras.</div></div></div>`;
}

/* Empty state communicates STATUS ONLY — no create CTA. The single global
   "Buat Penugasan" action is the sidebar button (admins), so the empty state
   never renders a second create button (v1.20.4). */
function emptyScreen(c) {
  const canCreate = c.canEng('eng.create');
  return `<div class="eng-screen"><div class="eng-empty">
    <span class="eng-empty-ic">${icon('wrench', { size: 28 })}</span>
    <div class="eng-empty-t">Belum ada penugasan</div>
    <div class="eng-empty-h">${canCreate
      ? 'Buat penugasan pertama untuk memulai operasional Engineering.'
      : 'Penugasan akan muncul di sini setelah dipublikasikan oleh Admin Sarpras.'}</div>
  </div></div>`;
}

/* ── delegated events ─────────────────────────────────────────────────── */
function onClick(e) {
  const scrim = e.target.closest('[data-act="eng-scrim"]');
  if (scrim && !e.target.closest('.eng-drawer') && !e.target.closest('.eng-modal-box')) { st.drawerId = null; st.creating = false; st.formMode = 'assignment'; render(); return; }
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
    // Create opens ONLY via the sidebar CTA → openEngineeringCreate(); there is
    // no in-content 'eng-create' trigger anymore (single global entry point).
    case 'eng-create-cancel': st.creating = false; st.formMode = 'assignment'; render(); break;
    case 'eng-personnel-toggle': togglePersonnel(el.dataset.uid); break;
    case 'eng-goto': setEngineeringScreen(val); break;
    case 'eng-filter-cat': st.filters.cat = val; render(); break;
    case 'eng-tl-filter': st.filters.tl = val; render(); break;
    case 'eng-tl-toggle': toggleExpanded(id); break;
    case 'eng-seed-load': doSeedOp('load'); break;
    case 'eng-seed-reset': doSeedOp('reset'); break;
    case 'eng-seed-clear': doSeedOp('clear'); break;
    case 'eng-noop': break;
    case 'eng-begin': doBegin(id, c); break;
    case 'eng-resume': doResume(id, c); break;
    case 'eng-finish': commitTx(id, (a) => finishAssignment(a, { workerId: worker || c.me.id, actor: c.me })); break;
    case 'eng-continue': commitTx(id, (a) => continueTomorrowAssignment(a, { workerId: worker || c.me.id, actor: c.me })); break;
    case 'eng-verify': if (c.canEng('eng.verify')) commitTx(id, (a) => verifyAssignment(a, c.me, { now: Date.now() })); break;
    case 'eng-postpone': if (c.canEng('eng.postpone')) commitTx(id, (a) => postponeAssignment(a, { actor: c.me })); break;
    case 'eng-delete': doDelete(id, c); break;
    case 'eng-reopen': if (c.canEng('eng.reopen')) commitTx(id, (a) => transitionAssignment(a, STATUS.AVAILABLE, { now: Date.now() })); break;
    default: break;
  }
}

function onInput(e) {
  // Read the event target directly: search inputs carry data-act, while modal
  // fields carry data-field (they have no data-act, so a closest('[data-act]')
  // lookup would resolve to the form and drop the value).
  const t = e.target;
  const ds = t && t.dataset ? t.dataset : null;
  if (!ds) return;
  if (ds.act === 'eng-search') { st.filters.q = t.value; render(); return; }
  if (ds.act === 'eng-hsearch') { st.filters.hq = t.value; render(); return; }
  if (ds.act === 'eng-personnel-search') { if (st.form) st.form._pq = t.value; render(); return; }
  if (ds.field) {
    // Building & Room are free-text (intentionally un-normalized — future ML
    // normalizes spelling/aliases); title/note/category/priority/requester and
    // the deadline picker input all feed through here too.
    if (!st.form) return;
    st.form[ds.field] = t.value;
  }
}

function onSubmit(e) {
  const form = e.target.closest('[data-act="eng-create-form"]');
  if (!form) return;
  e.preventDefault();
  submitCreate(ctx());
}

/* ── write paths ──────────────────────────────────────────────────────────
   TWO paths, both funnel through the provider so nothing bypasses persistence:

   • commit()   — for CREATE only (a brand-new unique id, no contention). Updates
                  the store optimistically and persists via a surgical set-by-id
                  (idempotent — the same id re-set is not a duplicate).
   • commitTx() — for every OWNERSHIP-SENSITIVE lifecycle action (join/start/
                  resume/finish/continue/verify/postpone/reopen). Runs the pure
                  engine transform inside a Firebase TRANSACTION via the provider,
                  applied on top of the LATEST committed value at the source, so
                  two members/coordinators acting at once never lose each other's
                  update, double-join, or double-verify. An illegal or already-
                  applied transition aborts as a clean no-op. The store is
                  reconciled from the transaction's AUTHORITATIVE result; the
                  Firebase realtime echo re-hydrates every other device. */
function commit(a) {
  upsertAssignment(a);
  saveAssignmentThrough(adapter, a);
  return a;
}

/** Build a transaction transform from a pure engine function: normalize the raw
 *  source record, apply the engine, return the next record — or undefined to
 *  abort (missing record, or an illegal/concurrent transition). */
function txTransform(engineFn) {
  return (rawCurrent) => {
    if (rawCurrent == null) return undefined;
    try {
      const next = engineFn(normalizeAssignment(rawCurrent));
      return next || undefined;
    } catch (_) { return undefined; }
  };
}

/** Atomic + idempotent commit of one lifecycle action on assignment `id`. */
async function commitTx(id, engineFn) {
  if (!id || inFlight.has(id)) return;   // idempotency: ignore repeat while pending
  inFlight.add(id);
  try {
    const res = await transactAssignmentThrough(adapter, id, txTransform(engineFn));
    if (res && res.committed && res.value) {
      upsertAssignment(normalizeAssignment(res.value));   // reconcile with source of truth
    } else if (!adapter) {
      // No backend configured — apply to the store directly so the app still runs.
      const cur = getAssignment(id);
      if (cur) { try { upsertAssignment(engineFn(cur)); } catch (_) { /* illegal — ignore */ } }
    }
    // committed:false with an adapter = concurrent no-op; the realtime echo already
    // carries the winning state, so there is nothing to reconcile here.
  } catch (err) {
    console.warn('[Engineering] action failed', err);
  } finally {
    inFlight.delete(id);
    render();
  }
}

function doBegin(id, c) {
  if (!c.canEng('eng.join')) return;
  commitTx(id, (a) => {
    const joined = joinAssignment(a, { workerId: c.me.id, name: c.me.name }, { actor: c.me });
    return startAssignment(joined, { workerId: c.me.id, actor: c.me });
  });
}

function doResume(id, c) {
  commitTx(id, (a) => {
    const next = a.status === STATUS.CONTINUE_TOMORROW
      ? transitionAssignment(a, STATUS.IN_PROGRESS, { now: Date.now() })
      : a;
    return startAssignment(next, { workerId: c.me.id, actor: c.me });
  });
}

/* Delete an assignment (v1.20.6, Objective 2) — admin only. Re-checks
   isDeletable() authoritatively (ignoring the button's advisory data-mode):
     • never worked on → HARD delete (store remove + provider delete-through)
     • has execution history → cancel→archive through the transactional commitTx
       path, so the timeline event + analytics history are preserved (never lost).
   Reuses the existing lifecycle engines; no new state handling. */
async function doDelete(id, c) {
  if (!id || !c.canEng('eng.delete')) return;
  const a = getAssignment(id);
  if (!a) return;
  if (isDeletable(a)) {
    if (typeof confirm === 'function'
      && !confirm('Hapus penugasan ini secara permanen? Tindakan ini tidak dapat dibatalkan.')) return;
    removeAssignment(id);                                   // optimistic store remove
    try { await deleteAssignmentThrough(adapter, id); }     // persist (no-op without adapter)
    catch (err) { console.warn('[Engineering] delete failed', err); }
    st.drawerId = null;
    render();
    return;
  }
  if (typeof confirm === 'function'
    && !confirm('Batalkan dan arsipkan penugasan ini? Riwayat dan analitik akan dipertahankan.')) return;
  st.drawerId = null;
  // One atomic transform: cancel (when still cancellable) then archive.
  await commitTx(id, (x) => {
    let next = x;
    const TERMINAL_OR_DONE = [STATUS.VERIFIED, STATUS.COMPLETED, STATUS.CANCELLED, STATUS.ARCHIVED];
    if (!TERMINAL_OR_DONE.includes(next.status)) next = cancelAssignment(next, { actor: c.me });
    if (next.status !== STATUS.ARCHIVED) next = archiveAssignment(next, { actor: c.me });
    return next;
  });
}

function toggleExpanded(id) {
  // Collapsed by default; at most ONE card expanded at a time. Selecting another
  // collapses the previous one. The choice persists across filter changes because
  // it lives in st (not recomputed per render).
  st.expandedId = (st.expandedId === id) ? null : id;
  render();
}

/* Development-only Seed Manager operations. Double-gated: the controls render
   only when ctx.isDev, and this guard blocks execution outside Development. In
   staging/production `adapter` is null and the seed manager is a no-op anyway. */
async function doSeedOp(kind) {
  if (!isDevelopment()) return;
  try {
    if (kind === 'load') await loadDemoData(adapter);
    else if (kind === 'reset') await resetDemoData(adapter);
    else if (kind === 'clear') await clearAllData(adapter);
  } catch (e) { console.warn('[Engineering] seed op failed', e); }
  render();
}

/* ── create-assignment modal ──────────────────────────────────────────────
   ONE centralized create flow (opened from the sidebar CTA and the in-content
   "Buat Penugasan" buttons on Dashboard / Timeline / Settings / Queue). Building
   and Room are FREE-TEXT — we intentionally capture natural operational language
   (future ML normalizes spelling/aliases/facility graph); no Floor field. The
   deadline uses the shared PBSI date picker and is stored as an ISO deadlineAt.
   Requester comes from the shared Bidang roster (petty-cash-service) — no second
   list, no hard-coded name. */

/* The OFFICIAL Bidang requester roster — the SINGLE source for every Engineering
   requester surface (Assignment, Catat Pekerjaan, and — via the requester values
   they persist — Analytics, Filters, Search, Export). Built from the shared Bidang
   master (petty-cash-service.bidangRoster, the one bidang source of truth) with the
   Akuntes exclusion REUSED from the Dispatch Policy Engine (Akuntes is never a
   selectable requester — v1.20.4 policy, rule NOT duplicated here), and the owning
   unit "Bidang Sarana dan Prasarana" guaranteed present for internal work. */
export const SARPRAS_BIDANG = 'Bidang Sarana dan Prasarana';
function officialRequesters() {
  const filtered = excludeAkuntesFromSuggestions(bidangRoster());
  const seen = new Set();
  const out = [];
  for (const b of filtered) {
    const name = (b && b.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: name, name });
  }
  if (!seen.has(SARPRAS_BIDANG.toLowerCase())) {
    out.unshift({ id: SARPRAS_BIDANG, name: SARPRAS_BIDANG });
  }
  return out;
}
function firstBidangName() {
  const roster = officialRequesters();
  return roster.length ? roster[0].name : SARPRAS_BIDANG;
}

function blankForm() {
  return {
    title: '',
    building: '', room: '',
    category: categoryProvider.list()[0]?.id || 'general-repair',
    priority: 'normal',
    requester: firstBidangName(),
    deadline: todayString(),   // YYYY-MM-DD (fed to the shared date picker)
    assignedUsers: {},         // { uid: true } — designated Engineering personnel (Obj 4)
    _pq: '',                   // transient personnel-picker search query
    note: '',
  };
}

/* Blank "Catat Pekerjaan" (Operational Work Report) form — v1.20.6, Objective 3.
   Shares most fields with an assignment; adds the operational-capture fields. */
function blankReportForm() {
  return {
    title: '',
    building: '', room: '',
    category: categoryProvider.list()[0]?.id || 'general-repair',
    priority: 'normal',
    requester: firstBidangName(),
    workDate: todayString(),   // YYYY-MM-DD (fed to the shared date picker)
    startTime: '', finishTime: '',
    assignedUsers: {},
    _pq: '',
    rootCause: '', actionTaken: '', recommendation: '',
    materialsUsed: '', estimatedCost: '',
    note: '',
  };
}

/** Toggle a personnel uid in the current form's assignedUsers map. */
function togglePersonnel(uid) {
  if (!uid || !st.form) return;
  const map = { ...(st.form.assignedUsers || {}) };
  if (map[uid]) delete map[uid]; else map[uid] = true;
  st.form.assignedUsers = map;
  render();
}

/* The Engineering Personnel selector (Obj 4) — searchable, multi-select, avatar +
   name + FORMATTED role label (Obj 5). Personnel come from User Management
   (active Engineering users, Coordinator-first); no manual text entry, no second
   roster. Only uid references are stored; names resolve from Users at render. */
function personnelPicker(f) {
  const roster = listEngineeringPersonnel();
  const q = (f._pq || '').trim().toLowerCase();
  const selected = f.assignedUsers || {};
  const selCount = Object.keys(selected).length;
  const filtered = q
    ? roster.filter((p) => p.name.toLowerCase().includes(q) || p.roleLabel.toLowerCase().includes(q))
    : roster;
  const row = (p) => {
    const on = !!selected[p.uid];
    return `<button type="button" class="eng-person-row${on ? ' -on' : ''}" data-act="eng-personnel-toggle" data-uid="${esc(p.uid)}">
      <span class="eng-person-ava">${esc(p.initials)}</span>
      <span class="eng-person-meta"><span class="eng-person-name">${esc(p.name)}</span><span class="eng-person-role">${esc(p.roleLabel)}</span></span>
      <span class="eng-person-check">${on ? icon('check-circle', { size: 16 }) : ''}</span>
    </button>`;
  };
  const body = roster.length === 0
    ? `<div class="eng-person-empty">Belum ada pengguna Engineering aktif. Tambahkan melalui Manajemen Pengguna.</div>`
    : (filtered.length === 0
      ? `<div class="eng-person-empty">Tidak ada teknisi yang cocok.</div>`
      : filtered.map(row).join(''));
  return `<label class="eng-field"><span>Teknisi Engineering${selCount ? ` · ${selCount} dipilih` : ''}</span>
    <input class="eng-input" data-act="eng-personnel-search" value="${esc(f._pq || '')}" placeholder="Cari teknisi…" autocomplete="off" />
    <div class="eng-person-list">${body}</div>
  </label>`;
}

/** Convert a picker date (YYYY-MM-DD) to an ISO end-of-day deadline; '' → null. */
function toDeadlineISO(dateStr) {
  const s = (dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 23, 59, 0, 0);   // local end-of-day
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function submitCreate(c) {
  // Idempotency: consume the form so a duplicate submit (double-click / retry)
  // finds nothing and is a clean no-op. blankForm()/blankReportForm() is
  // recreated when the modal is next opened.
  const f = st.form;
  if (!f || !f.title.trim()) return;
  st.form = null;
  if ((st.formMode || 'assignment') === 'report') { submitReport(f, c); return; }
  const building = (f.building || '').trim();
  const room = (f.room || '').trim();
  const location = [building, room].filter(Boolean).join(' · ');
  const deadlineAt = toDeadlineISO(f.deadline);
  const dueDate = deadlineAt ? fmtDeadline(deadlineAt, Date.now()) : '';
  try {
    let a = createAssignment({
      title: f.title, description: f.note, category: f.category, priority: f.priority,
      building, room, location,
      requester: f.requester, deadlineAt, dueDate, creator: c.me,
      assignedUsers: f.assignedUsers,   // designated technicians (Obj 4)
    }, { sequence: nextAssignmentSequence(), actor: c.me });
    a = publishAssignment(a, { actor: c.me });
    a = markAvailable(a, { actor: c.me, recipientCount: c.roster.length + 1 });
    commit(a);
    // No client-side notification: the assignment write triggers the
    // onEngineeringAssignmentWrite Cloud Function, which emits an
    // 'engineering.published' event → notification engine → /notifications/{uid}
    // → shared bell + Web Push. A local addNotification here would be a parallel,
    // creator-only, non-persisted shadow (and a duplicate) — removed (Obj 4).
  } catch (err) { console.warn('[Engineering] create failed', err); }
  st.creating = false;
  st.formMode = 'assignment';
  st.drawerId = null;
  render();
}

/* Persist a "Catat Pekerjaan" work report (v1.20.6, Objective 3). NOT an
   assignment: no lifecycle, own node. Recomputes analytics so the report shows
   up immediately, and records an informational notification into the log. */
function submitReport(f, c) {
  const building = (f.building || '').trim();
  const room = (f.room || '').trim();
  const location = [building, room].filter(Boolean).join(' · ');
  try {
    const r = createWorkReportModel({
      title: f.title, category: f.category, priority: f.priority,
      building, room, location, requester: f.requester,
      workDate: f.workDate, startTime: f.startTime, finishTime: f.finishTime,
      assignedUsers: f.assignedUsers,
      rootCause: f.rootCause, actionTaken: f.actionTaken, recommendation: f.recommendation,
      materialsUsed: f.materialsUsed, estimatedCost: f.estimatedCost,
      notes: f.note, creator: c.me,
    }, { sequence: nextReportSequence() });
    upsertWorkReport(r);                       // optimistic store insert
    saveWorkReportThrough(adapter, r);         // persist (no-op without adapter)
    loadAnalytics({ now: Date.now() });        // reflect in the analytics cache
    // Work-report notifications (if any) follow the same Cloud Function → shared
    // notification pipeline as assignments — no client-side/parallel path (Obj 4).
  } catch (err) { console.warn('[Engineering] report save failed', err); }
  st.creating = false;
  st.formMode = 'assignment';
  st.drawerId = null;
  render();
}

function createModal(c) {
  const isReport = (st.formMode || 'assignment') === 'report';
  const f = st.form || (isReport ? blankReportForm() : blankForm());
  const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
  const roster = officialRequesters();
  const requesterField = roster.length
    ? `<select class="eng-input" data-field="requester">${roster.map((b) => opt(b.name, b.name, b.name === f.requester)).join('')}</select>`
    : `<input class="eng-input" data-field="requester" value="${esc(f.requester)}" placeholder="Nama bidang pemohon" />`;

  // Mode-specific: work-report capture fields vs. the assignment deadline.
  const dateField = isReport
    ? `<label class="eng-field"><span>Tanggal Pekerjaan</span><input type="date" class="eng-input" data-field="workDate" value="${esc(f.workDate || '')}" /></label>`
    : `<label class="eng-field"><span>Deadline</span><input type="date" class="eng-input" data-field="deadline" value="${esc(f.deadline || '')}" /></label>`;
  const reportFields = isReport ? `
        <div class="eng-field-row">
          <label class="eng-field"><span>Jam Mulai</span><input type="time" class="eng-input" data-field="startTime" value="${esc(f.startTime || '')}" /></label>
          <label class="eng-field"><span>Jam Selesai</span><input type="time" class="eng-input" data-field="finishTime" value="${esc(f.finishTime || '')}" /></label>
        </div>
        <label class="eng-field"><span>Akar Masalah (Root Cause)</span><textarea class="eng-input eng-textarea" data-field="rootCause" placeholder="Penyebab utama masalah…">${esc(f.rootCause)}</textarea></label>
        <label class="eng-field"><span>Tindakan Dilakukan (Action Taken)</span><textarea class="eng-input eng-textarea" data-field="actionTaken" placeholder="Pekerjaan yang dilakukan…">${esc(f.actionTaken)}</textarea></label>
        <label class="eng-field"><span>Rekomendasi</span><textarea class="eng-input eng-textarea" data-field="recommendation" placeholder="Saran pencegahan / tindak lanjut…">${esc(f.recommendation)}</textarea></label>
        <div class="eng-field-row">
          <label class="eng-field"><span>Material Digunakan <em class="eng-opt">(opsional)</em></span><input class="eng-input" data-field="materialsUsed" value="${esc(f.materialsUsed || '')}" placeholder="mis. 2 lampu LED, 1 fitting" autocomplete="off" /></label>
          <label class="eng-field"><span>Estimasi Biaya <em class="eng-opt">(opsional)</em></span><input type="number" min="0" step="1000" class="eng-input" data-field="estimatedCost" value="${esc(f.estimatedCost || '')}" placeholder="Rp" /></label>
        </div>
        <div class="eng-attach-placeholder eng-attach-placeholder--form">${icon('camera', { size: 18 })}<div><div class="eng-attach-t">Foto sebelum / sesudah</div><div class="eng-attach-s">Tersedia pada versi mendatang</div></div></div>
  ` : '';

  return `<div class="eng-scrim -open -center" data-act="eng-scrim">
    <form class="eng-modal-box" data-act="eng-create-form">
      <div class="eng-modal-head"><div><div class="eng-modal-kicker">${isReport ? 'Laporan Operasional' : 'Penugasan Baru'}</div><h2 class="eng-modal-title">${isReport ? 'Catat Pekerjaan' : 'Buat Penugasan'}</h2></div>
        <button type="button" class="eng-icon-btn" data-act="eng-create-cancel">${icon('close', { size: 18 })}</button></div>
      <div class="eng-modal-body">
        <label class="eng-field"><span>Judul pekerjaan</span><input class="eng-input" data-field="title" value="${esc(f.title)}" placeholder="mis. Ganti lampu koridor Lantai 2" /></label>
        <div class="eng-field-row">
          <label class="eng-field"><span>Gedung</span><input class="eng-input" data-field="building" value="${esc(f.building)}" placeholder="mis. Gedung Pelatnas / GOR" autocomplete="off" /></label>
          <label class="eng-field"><span>Ruangan</span><input class="eng-input" data-field="room" value="${esc(f.room)}" placeholder="mis. Lantai 2 · Ruang Fitness" autocomplete="off" /></label>
        </div>
        <div class="eng-field-row">
          <label class="eng-field"><span>Kategori</span><select class="eng-input" data-field="category">${categoryProvider.list().map((k) => opt(k.id, k.label, k.id === f.category)).join('')}</select></label>
          <label class="eng-field"><span>Prioritas</span><select class="eng-input" data-field="priority">${priorityProvider.list().map((p) => opt(p.id, p.label, p.id === f.priority)).join('')}</select></label>
        </div>
        <div class="eng-field-row">
          <label class="eng-field"><span>Pemohon (Bidang)</span>${requesterField}</label>
          ${dateField}
        </div>
        ${personnelPicker(f)}
        ${reportFields}
        <label class="eng-field"><span>Catatan</span><textarea class="eng-input eng-textarea" data-field="note" placeholder="Deskripsi singkat pekerjaan…">${esc(f.note)}</textarea></label>
      </div>
      <div class="eng-modal-foot">
        <span class="eng-modal-hint">${isReport ? `${icon('file', { size: 14 })} Data operasional untuk analitik &amp; ML` : `${icon('bell', { size: 14 })} Notifikasi terkirim ke semua teknisi`}</span>
        <div class="eng-modal-actions"><button type="button" class="eng-btn -ghost" data-act="eng-create-cancel">Batal</button>
        <button type="submit" class="eng-btn -primary">${icon('check-circle', { size: 15 })} ${isReport ? 'Simpan Laporan' : 'Publikasikan'}</button></div>
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
  st._focusAct = (a === 'eng-search' || a === 'eng-hsearch' || a === 'eng-personnel-search') ? a : null;
}, true);
