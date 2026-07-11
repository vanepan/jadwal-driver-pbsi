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
   computed here, nothing is invented. Archive Center, Knowledge Center and
   Learning Dashboard are still honest "Coming Soon" placeholders (reusing
   the platform's existing .v2-module-placeholder markup/classes — the same
   ones showModulePlaceholder() in app.js uses). NOR Center (V2.0.11) is the
   first real nested workspace — see ./nor-center.js.
   ============================================================ */

'use strict';

const ROADMAP = [
  { label: 'Foundation', tier: 'done' },
  { label: 'Knowledge Platform', tier: 'done' },
  { label: 'Machine Learning Foundation', tier: 'done' },
  { label: 'NOR Center', tier: 'foundation' },
  { label: 'Knowledge Center', tier: 'soon' },
  { label: 'Archive Center', tier: 'soon' },
  { label: 'Learning Dashboard', tier: 'soon' },
];

const ROADMAP_TIER_LABEL = {
  done: '✓ Selesai',
  foundation: 'Foundation Ready',
  soon: 'Coming Soon',
};

const COMING_SOON = {
  archive: { title: 'Archive Center', message: 'Pusat arsip organisasi — segera hadir di Sarpras Intelligence.' },
  knowledge: { title: 'Knowledge Center', message: 'Pusat pengetahuan organisasi — segera hadir di Sarpras Intelligence.' },
  learning: { title: 'Learning Dashboard', message: 'Dasbor pembelajaran organisasi — segera hadir di Sarpras Intelligence.' },
};

const SCREEN_IDS = ['dashboard', 'nor', 'archive', 'knowledge', 'learning'];

let host = null;
let screen = 'dashboard';
let sections = null;   // {screenId: HTMLElement}
let norMounted = false;
// nor-center.js pulls in the whole Document Intelligence + Organizational
// Memory + Knowledge + Petty Cash store surface (and its import is what
// registers the NOR pilot's pipeline steps — see that file's own header).
// Dynamically imported on first visit to "nor" only, never at Sarpras
// Intelligence's own load time, mirroring the Analytics Petty Cash view's
// lazy-view idiom in app.js (loadPettyCashAnalyticsView / _fnMountAnalyticsPettyCash).
let _fnMountNorCenter = null;
let _fnCloseNorCenter = null;

/** Mount into a platform-owned host (mirrors mountEngineering/mountPettyCash). */
export async function mountSarprasIntelligence(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('sic-root');
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
  sections.archive.innerHTML = renderComingSoon('archive');
  sections.knowledge.innerHTML = renderComingSoon('knowledge');
  sections.learning.innerHTML = renderComingSoon('learning');
  // #nor is left empty — nor-center.js owns its own content once mounted.
}

export function setSarprasIntelligenceScreen(nextScreen) {
  screen = nextScreen || 'dashboard';
  if (sections) showScreen(screen);
}

function showScreen(id) {
  SCREEN_IDS.forEach((key) => { sections[key].style.display = key === id ? '' : 'none'; });
  if (id === 'nor' && !norMounted) {
    norMounted = true;
    import('./nor-center.js').then(({ mountNorCenter, closeNorCenter }) => {
      _fnMountNorCenter = mountNorCenter;
      _fnCloseNorCenter = closeNorCenter;
      _fnMountNorCenter(sections.nor);
    });
  }
}

export function closeSarprasIntelligence() {
  if (norMounted) _fnCloseNorCenter && _fnCloseNorCenter();
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

function renderComingSoon(screenId) {
  const copy = COMING_SOON[screenId] || COMING_SOON.archive;
  return `
    <div class="v2-module-placeholder">
      <div class="v2-module-placeholder-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
             stroke-linecap="round" stroke-linejoin="round" width="40" height="40" aria-hidden="true">
          <path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>
        </svg>
        <h2 class="v2-module-placeholder-title">${copy.title}</h2>
        <p class="v2-module-placeholder-text">${copy.message}</p>
      </div>
    </div>`;
}
