/* ============================================================
   SARPRAS-INTELLIGENCE-CENTER.JS — Sarpras Intelligence workspace (V2.0.10)

   The first live presentation surface for js/v2/ (Organizational Memory,
   Knowledge Platform, Machine Learning Foundation). Mounted into a
   platform-owned host exactly like Petty Cash / Engineering
   (js/petty-cash/petty-cash-center.js, js/engineering/ui/engineering-center.js):
   host.classList.add('sic-root') for scoped design tokens, one render() per
   screen change, no independent shell/router.

   SCOPE (V2.0.10 only): Dashboard is a static roadmap/status panel — no
   analytics are computed here, nothing is invented. NOR Center, Archive
   Center, Knowledge Center and Learning Dashboard are honest "Coming Soon"
   placeholders (reusing the platform's existing .v2-module-placeholder
   markup/classes — the same ones showModulePlaceholder() in app.js uses —
   so there is no second placeholder component). Wiring those screens to the
   real js/v2/knowledge and js/v2/organizational-memory engines is future
   work (V2.0.11+), tracked screen-by-screen on the frozen roadmap.
   ============================================================ */

'use strict';

const ROADMAP = [
  { label: 'Foundation', done: true },
  { label: 'Knowledge Platform', done: true },
  { label: 'Machine Learning Foundation', done: true },
  { label: 'NOR Center', done: false },
  { label: 'Knowledge Center', done: false },
  { label: 'Archive Center', done: false },
  { label: 'Learning Dashboard', done: false },
];

const COMING_SOON = {
  nor: { title: 'NOR Center', message: 'Pusat NOR terintegrasi — segera hadir di Sarpras Intelligence.' },
  archive: { title: 'Archive Center', message: 'Pusat arsip organisasi — segera hadir di Sarpras Intelligence.' },
  knowledge: { title: 'Knowledge Center', message: 'Pusat pengetahuan organisasi — segera hadir di Sarpras Intelligence.' },
  learning: { title: 'Learning Dashboard', message: 'Dasbor pembelajaran organisasi — segera hadir di Sarpras Intelligence.' },
};

let host = null;
let screen = 'dashboard';

/** Mount into a platform-owned host (mirrors mountEngineering/mountPettyCash). */
export async function mountSarprasIntelligence(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('sic-root');
  render();
}

export function setSarprasIntelligenceScreen(nextScreen) {
  screen = nextScreen || 'dashboard';
  render();
}

export function closeSarprasIntelligence() { /* shell hides the host; state is retained */ }

function render() {
  if (!host) return;
  host.innerHTML = screen === 'dashboard' ? renderDashboard() : renderComingSoon(screen);
}

function renderDashboard() {
  const rows = ROADMAP.map((item) => `
    <li class="sic-roadmap-item">
      <span class="sic-roadmap-label">${item.label}</span>
      <span class="sic-roadmap-status ${item.done ? 'sic-roadmap-status--done' : 'sic-roadmap-status--soon'}">
        ${item.done ? '✓ Selesai' : 'Coming Soon'}
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
  const copy = COMING_SOON[screenId] || COMING_SOON.nor;
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
