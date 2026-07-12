/* ============================================================
   SARPRAS-INTELLIGENCE-CENTER.JS — Sarpras Intelligence workspace (V2.0.10 / V2.0.11)

   The first live presentation surface for js/v2/ (Organizational Memory,
   Knowledge Platform, Machine Learning Foundation). Mounted into a
   platform-owned host exactly like Petty Cash / Engineering
   (js/petty-cash/petty-cash-center.js, js/engineering/ui/engineering-center.js):
   host.classList.add('sic-root') for scoped design tokens, no independent
   shell/router beyond this file.

   SHELL MODEL (V2.0.11): five PERSISTENT sibling screen containers (mount
   once, toggle `display`) — the same "mount once, never destroy" idiom
   app.js's setWorkspace() uses for its own top-level workspaces
   (#v2PettyCashWorkspace, #v2EngineeringWorkspace, ...). This replaced
   V2.0.10's "replace host.innerHTML per screen switch" because NOR Center
   (below) is now a real, STATEFUL nested mini-app — wiping its container on
   every outer screen change would destroy its internal tab position on
   every trip back to the Dashboard.

   SCOPE: Dashboard is a static roadmap/status panel — no analytics are
   computed here, nothing is invented. NOR Center (V2.0.11), Archive Center,
   Knowledge Center and Learning Dashboard (all V2.0.18) are real nested
   workspaces — see ./nor-center.js, ./archive-center.js,
   ./knowledge-center.js, ./learning-dashboard.js.

   V2.1.2 — this is now the ONE true entry point for repository activation
   and RTDB persistence sync (moved here from nor-center.js's own mount,
   where it was only arbitrarily first needed — Archive Center needs the
   same activation without ever visiting NOR Center). setActiveRepository
   and the three init*Sync() functions imported below are all safe to
   import STATICALLY here: none of them eagerly touch js/firebase.js at
   module load — the real Firebase import happens lazily INSIDE each
   init*Sync() function, only once actually CALLED (see
   import-session-repository.js's header for the full reasoning) — so
   this file's own "nothing loads Firebase until a screen needs it"
   design is preserved; mounting Sarpras Intelligence at all is now
   exactly the trigger point that design already existed for.
   ============================================================ */

'use strict';

import { setActiveRepository } from '../knowledge/repository/knowledge-repository.js';
import { initImportSessionSync, initImportBatchSync } from '../knowledge/services/import-session-service.js';
import { initFileStorageSync } from '../file-storage/file-storage-registry.js';

const ROADMAP = [
  { label: 'Foundation', tier: 'done' },
  { label: 'Knowledge Platform', tier: 'done' },
  { label: 'Machine Learning Foundation', tier: 'done' },
  { label: 'NOR Center', tier: 'foundation' },
  { label: 'Knowledge Center', tier: 'foundation' },
  { label: 'Archive Center', tier: 'foundation' },
  { label: 'Learning Dashboard', tier: 'foundation' },
];

// V2.1 — the 'soon' tier and its label were dead code (every ROADMAP row
// is 'done'/'foundation'; nothing has used tier 'soon' since V2.0.18) and
// contained the one remaining literal "Coming Soon" string outside a doc
// comment in js/v2/ui/ — removed per the Operational Readiness Audit.
const ROADMAP_TIER_LABEL = {
  done: '✓ Selesai',
  foundation: 'Foundation Ready',
};

const SCREEN_IDS = ['dashboard', 'nor', 'archive', 'knowledge', 'learning'];

// Each nested workspace pulls in its own slice of Organizational Memory /
// Knowledge / Document Intelligence — dynamically imported on first visit
// to its screen only, never at Sarpras Intelligence's own load time,
// mirroring the Analytics Petty Cash view's lazy-view idiom in app.js
// (loadPettyCashAnalyticsView / _fnMountAnalyticsPettyCash).
const WORKSPACES = {
  nor: { modulePath: './nor-center.js', mountName: 'mountNorCenter', closeName: 'closeNorCenter' },
  archive: { modulePath: './archive-center.js', mountName: 'mountArchiveCenter', closeName: 'closeArchiveCenter' },
  knowledge: { modulePath: './knowledge-center.js', mountName: 'mountKnowledgeCenter', closeName: 'closeKnowledgeCenter' },
  learning: { modulePath: './learning-dashboard.js', mountName: 'mountLearningDashboard', closeName: 'closeLearningDashboard' },
};

let host = null;
let screen = 'dashboard';
let sections = null;   // {screenId: HTMLElement}
const mountedState = {};   // {screenId: {mounted: boolean, mount: Function, close: Function}}

let _persistenceStarted = false;

/** Mount into a platform-owned host (mirrors mountEngineering/mountPettyCash). */
export async function mountSarprasIntelligence(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('sic-root');
  // V2.1.2 — activate the in-memory repository AND real RTDB persistence
  // sync exactly once, on the first mount of Sarpras Intelligence itself
  // (not gated to any one nested screen). Session-scoped in-memory
  // activation is unchanged from V2.1; RTDB sync is the new, explicitly
  // authorized reversal of the prior dormant/no-persistence design (see
  // this milestone's plan, Decision 1) — still only ever reachable behind
  // the existing pilot feature gate.
  if (!_persistenceStarted) {
    _persistenceStarted = true;
    setActiveRepository('memory');
    initImportSessionSync().catch((err) => console.error('[sarpras-intelligence-center] import session sync failed:', err));
    initImportBatchSync().catch((err) => console.error('[sarpras-intelligence-center] import batch sync failed:', err));
    initFileStorageSync().catch((err) => console.error('[sarpras-intelligence-center] file storage sync failed:', err));
  }
  if (!sections) buildShell();
  showScreen(screen);
}

/** Build the five persistent screen containers once; never rebuilt after. */
function buildShell() {
  host.innerHTML = SCREEN_IDS
    .map((id) => `<div class="sic-screen" data-sic-screen="${id}" style="display:none;"></div>`)
    .join('');
  sections = {};
  host.querySelectorAll('[data-sic-screen]').forEach((el) => { sections[el.dataset.sicScreen] = el; });
  sections.dashboard.innerHTML = renderDashboard();
  // #nor / #archive / #knowledge / #learning are left empty — each nested
  // workspace module owns its own content once mounted (see WORKSPACES).
}

export function setSarprasIntelligenceScreen(nextScreen) {
  screen = nextScreen || 'dashboard';
  if (sections) showScreen(screen);
}

function showScreen(id) {
  SCREEN_IDS.forEach((key) => { sections[key].style.display = key === id ? '' : 'none'; });
  const workspace = WORKSPACES[id];
  if (workspace && !mountedState[id]) {
    mountedState[id] = { mounted: true, mount: null, close: null };
    import(workspace.modulePath).then((mod) => {
      mountedState[id].mount = mod[workspace.mountName];
      mountedState[id].close = mod[workspace.closeName];
      mountedState[id].mount(sections[id]);
    });
  }
}

export function closeSarprasIntelligence() {
  Object.values(mountedState).forEach((entry) => { if (entry.close) entry.close(); });
}

function renderDashboard() {
  const rows = ROADMAP.map((item) => `
    <li class="sic-roadmap-item">
      <span class="sic-roadmap-label">${item.label}</span>
      <span class="sic-roadmap-status sic-roadmap-status--${item.tier}">
        ${ROADMAP_TIER_LABEL[item.tier]}
      </span>
    </li>`).join('');

  return `
    <div class="sic-content">
      <div class="sic-page-head">
        <div>
          <div class="sic-page-crumb">SARPRAS INTELLIGENCE</div>
          <h1 class="sic-page-title">Sarpras Intelligence</h1>
          <p class="sic-page-lede">Organizational Learning Platform</p>
        </div>
      </div>

      <div class="sic-card">
        <div class="sic-card-head">
          <div class="sic-card-h-title">Roadmap &amp; Status</div>
          <div class="sic-card-h-sub">Fondasi platform yang telah diverifikasi, dan modul yang akan menyusul.</div>
        </div>
        <ul class="sic-roadmap">${rows}</ul>
      </div>
    </div>`;
}
