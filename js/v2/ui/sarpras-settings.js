/* ============================================================
   SARPRAS-SETTINGS.JS — Experience Architecture phase (⚙ Settings)

   PURPOSE: the fifth primary-nav item Part 2 asks for. Deliberately thin —
   this is not a new configuration engine, it is a quiet, honest front door
   onto TWO real things that already exist elsewhere:

     1. The ONE shared Normal/Developer presentation toggle (already lives
        in sarpras-intelligence-center.js's mode bar, above every screen) —
        this page explains it, it does not duplicate the control itself
        (Part 7/11: "no duplicated actions").
     2. Power Views — real navigation to Knowledge Center, the one nested
        workspace that lost its primary nav button this phase (Part 1's
        "would a normal PBSI user understand why this menu exists?" answer
        for Knowledge Center was no — but the screen itself, and everything
        it does, is unchanged and still fully reachable, just one click
        deeper, for the actual power users who need it).

   NON-GOALS: no new settings storage, no new preference engine, no new
   role/permission model — every real setting already lives where it always
   did (NOR's own Settings tab for numbering/signatories, the shared
   presentation-mode flag for Normal/Developer). This page composes links,
   it does not own any new state.

   DEPENDENCIES: ./sarpras-intelligence-center.js (setSarprasIntelligenceScreen
   — the same cross-screen navigation primitive js/app.js's own
   navSarprasIntelligence() calls), ./shared/workspace-list-kit.js (esc,
   isDeveloperMode — read only, this file never calls setPresentationMode
   itself).
   ============================================================ */

'use strict';

import { setSarprasIntelligenceScreen } from './sarpras-intelligence-center.js';
import { esc, isDeveloperMode } from './shared/workspace-list-kit.js';

let host = null;
let mounted = false;

export function mountSarprasSettings(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  if (!mounted) {
    mounted = true;
    host.addEventListener('click', onClick);
  }
  render();
}

export function closeSarprasSettings() { /* shell hides the host; state is retained */ }

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'settings-open-knowledge') setSarprasIntelligenceScreen('knowledge');
  if (el.dataset.act === 'settings-open-nor') setSarprasIntelligenceScreen('nor');
  if (el.dataset.act === 'settings-open-review') setSarprasIntelligenceScreen('review');
}

function render() {
  const dev = isDeveloperMode();
  host.innerHTML = `
    <div class="sic-content">
      <div class="sic-page-head">
        <div>
          <div class="sic-page-crumb">SARPRAS INTELLIGENCE</div>
          <h1 class="sic-page-title">Settings</h1>
          <p class="sic-page-lede">Tampilan dan tautan ke tampilan lanjutan — tidak ada pengaturan baru di sini, semuanya menunjuk ke sesuatu yang sudah nyata.</p>
        </div>
      </div>

      <div class="sic-card">
        <div class="sic-card-head">
          <div class="sic-card-h-title">Mode Tampilan</div>
          <div class="sic-card-h-sub">Saat ini: ${dev ? 'Developer' : 'Normal'}</div>
        </div>
        <p class="sic-next-action">Tombol Normal/Developer di bagian atas setiap layar Sarpras Intelligence berlaku untuk seluruh platform sekaligus — satu tombol, bukan satu per layar. <strong>Normal</strong> menampilkan aksi yang bisa Anda lakukan; <strong>Developer</strong> menambahkan detail teknis (tahapan pipeline mentah, confidence score, id internal) untuk audit dan penelusuran masalah.</p>
      </div>

      <div class="sic-card">
        <div class="sic-card-head">
          <div class="sic-card-h-title">Tampilan Lanjutan (Power View)</div>
          <div class="sic-card-h-sub">Untuk tugas lintas-dokumen yang bukan tentang satu dokumen tertentu.</div>
        </div>
        <ul class="sic-brief-list">
          <li>
            <span class="sic-brief-label">Menyetujui, menolak, atau meninjau siklus hidup Knowledge secara langsung (di luar konteks satu dokumen)</span>
            <button class="wlk-btn" data-act="settings-open-knowledge" type="button" style="margin-top:8px;">Buka Knowledge Center</button>
          </li>
          <li>
            <span class="sic-brief-label">Meninjau draf NOR yang sudah disusun — isi lengkap, metadata, dan riwayat versi (Phase 10)</span>
            <button class="wlk-btn" data-act="settings-open-review" type="button" style="margin-top:8px;">Buka Review Workspace</button>
          </li>
        </ul>
      </div>

      <div class="sic-card">
        <div class="sic-card-head"><div class="sic-card-h-title">Pengaturan NOR</div></div>
        <p class="sic-next-action">Nomor urut, penandatangan, dan format NOR diatur di tab <strong>Settings</strong> di dalam NOR.</p>
        <button class="wlk-btn wlk-btn--ghost" data-act="settings-open-nor" type="button">Buka NOR</button>
      </div>
    </div>`;
}
