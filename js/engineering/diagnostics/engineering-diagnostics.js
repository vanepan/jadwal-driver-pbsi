/* ============================================================
   ENGINEERING-DIAGNOSTICS.JS — TEMPORARY Production Diagnostic Mode
   (v1.20.6 — REMOVABLE. See "HOW TO REMOVE" at the bottom.)

   A developer-only, read-only overlay that lets a human tester confirm every
   Engineering production subsystem at a glance (auth, Firebase, engineering
   store, notifications, executive refresh). It reads LIVE state through existing
   public getters — it changes NO business logic and mutates NO app state.

   ACTIVATION: Ctrl + Shift + D toggles the panel.
   GATE:       visible ONLY when APP_ENV === 'development' OR the current user is
               Administrator. Never visible to Engineering Members/Coordinators.
   PERFORMANCE: a single keydown listener is the only always-on cost. The panel
               DOM, the .info/connected listener, and the auto-refresh interval
               are created on OPEN and torn down on CLOSE — zero cost when closed.
   ============================================================ */

'use strict';

import { getCurrentUser, isAdmin } from '../../auth.js';
import { isDevelopment, getAppEnv } from '../../config.js';
import { capabilitiesOf, roleLabel } from '../../config/role-registry.js';
import { resolveWorkspaceForRole } from '../../workspace/workspace-registry.js';
import { getEngineeringState } from '../stores/engineering-store.js';
import { isFirebaseConfigured, subscribeNode, reconnectFirebaseRealtime } from '../../firebase.js';
import { getEngineeringRuntimeInfo } from '../ui/engineering-center.js';
import { getNotificationRuntimeInfo } from '../../notifications.js';

/* Firebase project coordinates (for Console deep-links). */
const PROJECT_ID = 'schedule-driver-pbsi';
const DB_INSTANCE = 'schedule-driver-pbsi-default-rtdb';

let panel = null;
let open = false;
let refreshTimer = null;
let connUnsub = null;
let connected = null;          // last .info/connected value (null until first read)
let stylesInjected = false;

/** The gate: development env OR Administrator. Excludes every Engineering role. */
function canShow() {
  return isDevelopment() || isAdmin();
}

/** Public entry — wire the hidden shortcut. Safe to call once at startup. */
export function initEngineeringDiagnostics() {
  document.addEventListener('keydown', onKey, true);
}

function onKey(e) {
  // Ctrl+Shift+D (layout-stable via e.code). Gate is re-checked at toggle time
  // so a role change (e.g. admin logs out, member logs in) is always respected.
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
    e.preventDefault();
    toggle();
  }
}

function toggle() {
  if (!canShow()) return;        // never opens for a non-admin / non-dev
  if (open) closePanel(); else openPanel();
}

/* ── open / close (all live listeners scoped to OPEN) ─────────────────── */
function openPanel() {
  injectStyles();
  if (!panel) panel = buildShell();
  document.body.appendChild(panel);
  open = true;
  // Realtime connection probe — attached only while open.
  connUnsub = subscribeNode('.info/connected', (snap) => {
    connected = snap && typeof snap.val === 'function' ? !!snap.val() : null;
    render();
  }, { onError: () => {}, onDenied: () => {} });
  refreshTimer = setInterval(render, 2000);   // light auto-refresh while open
  render();
}

function closePanel() {
  open = false;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (connUnsub) { try { connUnsub(); } catch (_) {} connUnsub = null; }
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
}

/* ── live data gather (read-only) ─────────────────────────────────────── */
function gather() {
  const u = getCurrentUser() || {};
  const role = u.role || null;
  const st = getEngineeringState();
  const assignments = Object.values((st && st.assignments) || {});
  const timelineEvents = assignments.reduce(
    (n, a) => n + (Array.isArray(a.timeline) ? a.timeline.length : 0), 0);
  const eng = safe(getEngineeringRuntimeInfo) || {};
  const notif = safe(getNotificationRuntimeInfo) || {};
  const uid = u.username || u.id || null;

  return {
    auth: {
      uid: uid || '—',
      role: role ? `${role}  ·  ${roleLabel(role)}` : '—',
      workspace: role ? resolveWorkspaceForRole(role).id : '—',
      permissions: role ? (capabilitiesOf(role).filter(c => c.startsWith('eng.')).join(', ') || 'none') : '—',
      session: uid ? (isFirebaseConfigured() ? 'localStorage cache · Firebase custom-token' : 'localStorage cache (local)') : 'not signed in',
    },
    firebase: {
      provider: eng.adapterKind ? eng.adapterKind : (isFirebaseConfigured() ? 'firebase (not mounted)' : 'none'),
      connection: connected === null ? 'probing…' : (connected ? 'online' : 'offline'),
      realtime: connected === null ? '—' : (connected ? 'connected' : 'disconnected'),
      lastSync: fmtTime(eng.lastSyncAt),
      listeners: `engineering: ${eng.subscriptionActive ? 1 : 0} · diag: ${open ? 1 : 0} (RTDB SDK exposes no global count)`,
      pending: `engineering in-flight: ${Number.isFinite(eng.inFlight) ? eng.inFlight : 0} (RTDB SDK exposes no global count)`,
    },
    engineering: {
      assignments: assignments.length,
      notifications: notif.serverCount != null ? notif.serverCount : 0,
      timeline: timelineEvents,
      adapter: eng.adapterKind || '—',
      subscription: eng.subscriptionActive ? 'active' : 'inactive',
    },
    notifications: {
      last: notif.lastReceivedAt ? `${fmtTime(notif.lastReceivedAt)} — ${notif.lastTitle || ''}` : '—',
      unread: notif.unreadCount != null ? notif.unreadCount : '—',
      recipient: notif.recipientUid || '—',
      source: notif.source || '—',
    },
    executive: {
      analytics: fmtTime(eng.lastAnalyticsAt),
      health: '— (executive Health Score not wired to Engineering diagnostics)',
      recommendation: '— (Recommendation build not wired to Engineering diagnostics)',
    },
  };
}

/* ── render ───────────────────────────────────────────────────────────── */
function render() {
  if (!panel) return;
  const body = panel.querySelector('#engdiag-body');
  if (!body) return;
  const d = gather();
  const env = getAppEnv();
  const envEl = panel.querySelector('#engdiag-env');
  if (envEl) envEl.textContent = env;
  body.innerHTML =
    section('AUTH', [
      row('Current UID', d.auth.uid),
      // Diagnostic shows the raw token claim paired with its formatted label
      // (roleLabel) so a claim↔label mismatch is visible without leaking a bare id.
      row('Current Role', d.auth.role ? `${d.auth.role}  ·  ${roleLabel(d.auth.role)}` : '—'),
      row('Resolved Workspace', d.auth.workspace),
      row('Resolved Permissions', d.auth.permissions),
      row('Session Source', d.auth.session),
    ]) +
    section('FIREBASE', [
      row('Provider', d.firebase.provider),
      row('Connection State', d.firebase.connection),
      row('Realtime Connected', d.firebase.realtime),
      row('Last Sync', d.firebase.lastSync),
      row('Listener Count', d.firebase.listeners),
      row('Pending Writes', d.firebase.pending),
    ]) +
    section('ENGINEERING', [
      row('Assignment Count', d.engineering.assignments),
      row('Notification Count', d.engineering.notifications),
      row('Timeline Events', d.engineering.timeline),
      row('Current Adapter', d.engineering.adapter),
      row('Current Subscription', d.engineering.subscription),
    ]) +
    section('NOTIFICATIONS', [
      row('Last Notification Received', d.notifications.last),
      row('Unread Count', d.notifications.unread),
      row('Recipient UID', d.notifications.recipient),
      row('Notification Source', d.notifications.source),
    ]) +
    section('EXECUTIVE', [
      row('Analytics Refresh Time', d.executive.analytics),
      row('Health Score Refresh', d.executive.health),
      row('Last Recommendation Build', d.executive.recommendation),
    ]);
}

/* ── DOM shell (built once) ───────────────────────────────────────────── */
function buildShell() {
  const el = document.createElement('div');
  el.id = 'engdiag-panel';
  el.innerHTML = `
    <div id="engdiag-head">
      <span id="engdiag-title">⚙ ENGINEERING DIAGNOSTICS</span>
      <span id="engdiag-env" class="engdiag-badge"></span>
      <button class="engdiag-x" data-diag="close" title="Close (Ctrl+Shift+D)">✕</button>
    </div>
    <div id="engdiag-body"></div>
    <div id="engdiag-actions">
      <button data-diag="refresh">Refresh Diagnostics</button>
      <button data-diag="reconnect">Reconnect Firebase</button>
      <button data-diag="open-assignments">Open Assignment Node</button>
      <button data-diag="open-notifications">Open Notification Node</button>
      <button data-diag="open-events">Open Events Node</button>
    </div>`;
  el.addEventListener('click', onAction);
  return el;
}

function onAction(e) {
  const btn = e.target.closest('[data-diag]');
  if (!btn) return;
  const uid = (getCurrentUser() || {}).username || (getCurrentUser() || {}).id || '';
  switch (btn.dataset.diag) {
    case 'close': closePanel(); break;
    case 'refresh': render(); flash(btn); break;
    case 'reconnect': {
      const ok = reconnectFirebaseRealtime();
      flash(btn, ok ? 'Reconnecting…' : 'Unavailable');
      break;
    }
    case 'open-assignments': openConsole('engineering/assignments'); break;
    case 'open-notifications': openConsole(uid ? `notifications/${uid}` : 'notifications'); break;
    case 'open-events': openConsole('events'); break;
    default: break;
  }
}

/* ── helpers ──────────────────────────────────────────────────────────── */
function safe(fn) { try { return fn(); } catch (_) { return null; } }

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function row(label, value) {
  return `<div class="engdiag-row"><span class="engdiag-k">${esc(label)}</span><span class="engdiag-v">${esc(value)}</span></div>`;
}

function section(title, rows) {
  return `<div class="engdiag-sec"><div class="engdiag-sec-t">${esc(title)}</div>${rows.join('')}</div>`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const ago = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  return `${d.toLocaleTimeString('id-ID', { hour12: false })} (${ago}s ago)`;
}

function openConsole(path) {
  const enc = '~2F' + String(path).split('/').filter(Boolean).join('~2F');
  const url = `https://console.firebase.google.com/project/${PROJECT_ID}/database/${DB_INSTANCE}/data/${enc}`;
  window.open(url, '_blank', 'noopener');
}

function flash(btn, text) {
  const original = btn.textContent;
  btn.textContent = text || 'Done';
  setTimeout(() => { btn.textContent = original; }, 900);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'engdiag-styles';
  s.textContent = `
    #engdiag-panel{position:fixed;right:16px;bottom:16px;width:360px;max-height:80vh;overflow:auto;z-index:2147483000;
      background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:10px;
      font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-shadow:0 12px 40px rgba(0,0,0,.5)}
    #engdiag-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #30363d;position:sticky;top:0;background:#0d1117}
    #engdiag-title{font-weight:700;letter-spacing:.4px;flex:0 0 auto}
    .engdiag-badge{margin-left:auto;padding:1px 8px;border:1px solid #30363d;border-radius:999px;color:#7ee787;font-weight:700;text-transform:uppercase}
    .engdiag-x{background:none;border:none;color:#8b949e;cursor:pointer;font-size:14px;padding:2px 4px}
    .engdiag-x:hover{color:#f85149}
    #engdiag-body{padding:6px 12px 2px}
    .engdiag-sec{margin:8px 0}
    .engdiag-sec-t{color:#58a6ff;font-weight:700;letter-spacing:.6px;margin:8px 0 4px;border-bottom:1px dotted #30363d;padding-bottom:2px}
    .engdiag-row{display:flex;gap:8px;padding:2px 0;align-items:baseline}
    .engdiag-k{flex:0 0 46%;color:#8b949e}
    .engdiag-v{flex:1;color:#e6edf3;word-break:break-word;text-align:right}
    #engdiag-actions{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;border-top:1px solid #30363d;position:sticky;bottom:0;background:#0d1117}
    #engdiag-actions button{flex:1 1 auto;background:#21262d;color:#e6edf3;border:1px solid #30363d;border-radius:6px;
      padding:6px 8px;cursor:pointer;font:inherit}
    #engdiag-actions button:hover{background:#30363d;border-color:#8b949e}`;
  document.head.appendChild(s);
}

/* ============================================================
   HOW TO REMOVE (after production validation):
     1. Delete this file (js/engineering/diagnostics/engineering-diagnostics.js).
     2. app.js — remove the import + the initEngineeringDiagnostics() call
        (both tagged: DIAGNOSTIC (removable)).
     3. Delete the three read-only getters (all tagged DIAGNOSTIC (removable)):
        • js/engineering/ui/engineering-center.js → getEngineeringRuntimeInfo()
          + the _lastSyncAt/_lastAnalyticsAt trackers.
        • js/notifications.js → getNotificationRuntimeInfo() + its trackers.
        • js/firebase.js → reconnectFirebaseRealtime() (+ goOffline/goOnline import).
     `grep -rn "DIAGNOSTIC (removable)" js/` lists every touch-point.
   ============================================================ */
