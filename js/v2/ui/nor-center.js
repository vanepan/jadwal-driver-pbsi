/* ============================================================
   NOR-CENTER.JS — NOR Center Foundation (V2.0.11)

   The flagship application of Sarpras Intelligence. Nested inside the
   Sarpras Intelligence workspace (mounted by ./sarpras-intelligence-center.js
   when its "nor" screen is shown), owning its OWN internal navigation —
   Dashboard / Generate NOR / Drafts / Archive / Review / Settings — exactly
   as a real product would, even though most of it is presentation over
   honestly-empty state today.

   MISSION (V2.0.11 — foundation, not intelligence):
     - Build the WORKSPACE future intelligence will live inside, not the
       intelligence itself. No AI call. No fabricated NLP. No fake numbers.
     - Generate NOR routes the request through the REAL, already-registered
       Document Intelligence NOR pipeline (document-intelligence/nor/*.js,
       V2.0.6 Phase 9.5) — analyze -> draft -> validate -> explain ->
       recommend. Today that pipeline honestly halts at the DRAFT step with
       NO_KNOWLEDGE (no repository backend is selected yet — see
       knowledge/repository/repository-registry.js — and even once one is,
       no Approved `nor`/`structure` Knowledge exists to draft from), so the
       page shows "Generation engine coming soon." — a REAL outcome, not a
       hardcoded string.
     - Archive reads the REAL Organizational Memory engines
       (archive-health-engine.js, archive-timeline-engine.js,
       archive-repository.js) scoped to domainType 'nor'. Currently empty
       (nothing has run archive ingestion yet), so every number shown is a
       real, currently-zero computation — never invented.
     - Review reads the REAL Knowledge repository facade, filtered to
       domainType 'nor', reusing the SAME lifecycle vocabulary
       (Pending Review / Candidate / Approved — knowledge/contracts/
       lifecycle-contract.js) the Knowledge Review Workflow already defines.
     - Settings is READ-ONLY and pulls LIVE from
       js/petty-cash/petty-cash-store.js#getSettings() — the actual NOR
       configuration (signatories, sender title, numbering format). NOR
       Center never duplicates this configuration; it only references it.
     - Drafts has no backing store yet (a genuinely new concept — authored-
       but-unfinished NOR documents — distinct from Knowledge's "Draft"
       lifecycle state shown on the Dashboard/Review pages) — an honest
       empty page, not a fake one.

   REUSE, NEVER DUPLICATE: no new PDF pipeline, no new numbering logic, no
   new Petty Cash settings UI, no new Knowledge repository, no new Archive
   repository. Every number on this page traces to an existing engine call.

   NON-GOALS (explicitly deferred, do not build here): the intelligent
   generator itself, a live editable composer, diff-based learning, Archive
   Center / Knowledge Center / Learning Dashboard (siblings under Sarpras
   Intelligence, still flat "Coming Soon" — see sarpras-intelligence-center.js).
   ============================================================ */

'use strict';

import { runPipeline } from '../document-intelligence/document-intelligence-engine.js';
// Side-effect import: this is the explicit opt-in that registers the NOR
// pilot's 5 pipeline steps (analyze/draft/validate/explain/recommend) into
// registry/step-registry.js — see nor/index.js's own header. NOR Center is
// the first real caller.
import { NOR_PIPELINE } from '../document-intelligence/nor/index.js';
import { startDocumentSession, transitionDocumentSession } from '../document-intelligence/session-store.js';
import { DOCUMENT_SESSION_STATE } from '../document-intelligence/contracts/document-context-contract.js';

import { list as knowledgeList } from '../knowledge/repository/knowledge-repository.js';
import { LIFECYCLE_STATE, LIFECYCLE_STATE_DEFS } from '../knowledge/contracts/lifecycle-contract.js';

import { computeArchiveHealth } from '../organizational-memory/archive-health-engine.js';
import { getArchiveTimeline } from '../organizational-memory/archive-timeline-engine.js';
import { list as archiveList } from '../organizational-memory/repository/archive-repository.js';

import {
  initPettyCashStore, registerChangeListener as onPettyCashChange, getSettings as getPettyCashSettings,
} from '../../petty-cash/petty-cash-store.js';
import { norNumberFromSequence, todayISO } from '../../petty-cash/petty-cash-config.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'generate', label: 'Generate NOR' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'archive', label: 'Archive' },
  { id: 'review', label: 'Review' },
  { id: 'settings', label: 'Settings' },
];

const st = {
  section: 'dashboard',
  generateText: '',
  generateOutcome: null, // {kind:'coming-soon'|'ready', title, message, detail} | null
};

let host = null;
let contentEl = null;
let mounted = false;
let pcLiveStarted = false;

/* ── mount / teardown ─────────────────────────────────────────────── */

export async function mountNorCenter(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('nc-root');
  if (!mounted) {
    mounted = true;
    host.innerHTML = shellMarkup();
    contentEl = host.querySelector('.nc-content');
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
  }
  render();
}

export function closeNorCenter() { /* shell hides the host; state is retained */ }

function shellMarkup() {
  const tabs = SECTIONS.map((s) => `<button class="nc-tab" data-act="nc-tab" data-id="${s.id}" type="button">${s.label}</button>`).join('');
  return `
    <div class="nc-shell">
      <div class="nc-tabbar" role="tablist" aria-label="NOR Center">${tabs}</div>
      <div class="nc-content"></div>
    </div>`;
}

/* ── render dispatch ──────────────────────────────────────────────── */

const RENDERERS = {
  dashboard: renderDashboardSection,
  generate: renderGenerateSection,
  drafts: renderDraftsSection,
  archive: renderArchiveSection,
  review: renderReviewSection,
  settings: renderSettingsSection,
};

function render() {
  if (!contentEl) return;
  host.querySelectorAll('.nc-tab').forEach((btn) => {
    btn.classList.toggle('nc-tab--active', btn.dataset.id === st.section);
  });
  contentEl.innerHTML = (RENDERERS[st.section] || renderDashboardSection)();
  if (st.section === 'settings') ensurePettyCashSettingsLive();
}

function setSection(id) {
  st.section = SECTIONS.some((s) => s.id === id) ? id : 'dashboard';
  render();
}

/* ── delegated events ─────────────────────────────────────────────── */

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'nc-tab') { setSection(el.dataset.id); return; }
  if (act === 'nc-generate-submit') { handleGenerateSubmit(); return; }
}

function onInput(e) {
  if (e.target && e.target.id === 'ncGenerateInput') {
    st.generateText = e.target.value;
    const btn = host.querySelector('[data-act="nc-generate-submit"]');
    if (btn) btn.disabled = !st.generateText.trim();
  }
}

/* ── shared presentation helpers ──────────────────────────────────── */

function emptyState(title, subtitle) {
  return `
    <div class="nc-empty">
      <svg class="nc-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>
      </svg>
      <div class="nc-empty-title">${esc(title)}</div>
      ${subtitle ? `<div class="nc-empty-sub">${esc(subtitle)}</div>` : ''}
    </div>`;
}

function renderArchiveRows(records) {
  return `
    <ul class="nc-row-list">
      ${records.map((r) => `
        <li class="nc-row">
          <span class="nc-row-primary">${esc(r.documentNumber)}</span>
          <span class="nc-row-secondary">${esc(r.documentDate || r.archivedAt || '—')}</span>
        </li>`).join('')}
    </ul>`;
}

/* ── data helpers (thin reads over existing engines — no new stores) ── */

function getNorArchiveRecords() {
  const result = archiveList({ sourceDomainType: 'nor' });
  return result.ok ? result.data : [];
}

function safeKnowledgeList(filter) {
  const result = knowledgeList(filter);
  return result.ok ? result.data : [];
}

function getNorKnowledgeStatus() {
  return LIFECYCLE_STATE_DEFS
    .filter((s) => s.id !== LIFECYCLE_STATE.DEPRECATED)
    .map((s) => ({ id: s.id, label: s.label, count: safeKnowledgeList({ domainType: 'nor', lifecycleState: s.id }).length }));
}

/* ── Dashboard ─────────────────────────────────────────────────────── */

function renderDashboardSection() {
  const archives = getNorArchiveRecords().slice(-5).reverse();
  const knowledgeStatus = getNorKnowledgeStatus();

  return `
    <div class="nc-page">
      <div class="nc-page-head">
        <div class="nc-page-crumb">NOR CENTER</div>
        <h1 class="nc-page-title">NOR Center</h1>
        <p class="nc-page-lede">Ruang kerja terpadu untuk Nota Organisasi — draf, arsip, dan pengetahuan organisasi dalam satu tempat.</p>
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Draft Terbaru</div>
        ${emptyState('Belum ada draft tersimpan.', 'Draft yang Anda mulai akan muncul di sini.')}
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Arsip Terbaru</div>
        ${archives.length ? renderArchiveRows(archives) : emptyState('Belum ada dokumen yang diarsipkan.', 'NOR resmi yang diarsipkan akan muncul di sini.')}
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Status Pengetahuan</div>
        <ul class="nc-status-grid">
          ${knowledgeStatus.map((s) => `
            <li class="nc-status-item">
              <span class="nc-status-count">${s.count}</span>
              <span class="nc-status-label">${esc(s.label)}</span>
            </li>`).join('')}
        </ul>
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Aksi Cepat</div>
        <div class="nc-quick-actions">
          <button class="nc-quick-btn" data-act="nc-tab" data-id="generate" type="button">Generate NOR</button>
          <button class="nc-quick-btn" data-act="nc-tab" data-id="drafts" type="button">Lihat Draft</button>
          <button class="nc-quick-btn" data-act="nc-tab" data-id="archive" type="button">Buka Arsip</button>
          <button class="nc-quick-btn" data-act="nc-tab" data-id="review" type="button">Antrean Review</button>
        </div>
      </div>
    </div>`;
}

/* ── Generate NOR ──────────────────────────────────────────────────── */

function renderGenerateSection() {
  return `
    <div class="nc-page">
      <div class="nc-page-head">
        <div class="nc-page-crumb">NOR CENTER · GENERATE</div>
        <h1 class="nc-page-title">Apa yang ingin Anda buat hari ini?</h1>
        <p class="nc-page-lede">Sarpras Intelligence akan menyusun draf berdasarkan pengetahuan organisasi yang telah disetujui — Anda tetap meninjau dan menyetujui setiap draf sebelum diterbitkan.</p>
      </div>

      <div class="nc-generate-card">
        <input id="ncGenerateInput" class="nc-generate-input" type="text"
               placeholder="Contoh: Permohonan pembelian mesin potong rumput"
               value="${esc(st.generateText)}" autocomplete="off" />
        <button class="nc-generate-submit" data-act="nc-generate-submit" type="button" ${st.generateText.trim() ? '' : 'disabled'}>Buat Draf</button>
      </div>

      ${st.generateOutcome ? renderGenerateOutcome(st.generateOutcome) : ''}
    </div>`;
}

function renderGenerateOutcome(outcome) {
  return `
    <div class="nc-outcome nc-outcome--${outcome.kind}">
      <div class="nc-outcome-title">${esc(outcome.title)}</div>
      <div class="nc-outcome-message">${esc(outcome.message)}</div>
      ${outcome.detail ? `<div class="nc-outcome-detail">${esc(outcome.detail)}</div>` : ''}
    </div>`;
}

/**
 * Route the request through the real Document Intelligence NOR pipeline
 * (analyze -> draft -> validate -> explain -> recommend). Never generates a
 * NOR itself — reports the pipeline's real outcome honestly.
 */
function handleGenerateSubmit() {
  const text = st.generateText.trim();
  if (!text) return;

  const session = startDocumentSession('nor');
  const result = runPipeline(NOR_PIPELINE, {
    sessionId: session.id,
    input: { domainType: 'nor', text, norNumber: '', expenseIds: [] },
  });

  if (result.ok) {
    transitionDocumentSession(session.id, DOCUMENT_SESSION_STATE.DRAFTING);
    const draftOutput = result.results.draft;
    st.generateOutcome = {
      kind: 'ready',
      title: 'Panduan struktural tersedia',
      message: `Sarpras Intelligence menemukan panduan struktural dari ${draftOutput.sampleSize} NOR yang telah disetujui.`,
      detail: 'Penyusunan draf lengkap belum tersedia pada versi ini — panduan ini hanya informasi pendukung untuk tinjauan manual.',
    };
  } else {
    transitionDocumentSession(session.id, DOCUMENT_SESSION_STATE.ABANDONED);
    st.generateOutcome = {
      kind: 'coming-soon',
      title: 'Generation engine coming soon.',
      message: 'Sarpras Intelligence belum memiliki pengetahuan organisasi yang disetujui untuk menyusun draf.',
      detail: (result.error && result.error.message) || null,
    };
  }
  render();
}

/* ── Drafts ────────────────────────────────────────────────────────── */

function renderDraftsSection() {
  return `
    <div class="nc-page">
      <div class="nc-page-head">
        <div class="nc-page-crumb">NOR CENTER · DRAFTS</div>
        <h1 class="nc-page-title">Draft Repository</h1>
        <p class="nc-page-lede">Draf yang sedang disusun akan tersimpan di sini, siap ditinjau sebelum diterbitkan sebagai NOR resmi.</p>
      </div>
      ${emptyState('Belum ada draft tersimpan.', 'Repositori draf akan aktif pada pembaruan mendatang.')}
    </div>`;
}

/* ── Archive ───────────────────────────────────────────────────────── */

function renderArchiveSection() {
  const records = getNorArchiveRecords();
  const timeline = getArchiveTimeline('nor');
  const health = computeArchiveHealth('nor');

  return `
    <div class="nc-page">
      <div class="nc-page-head">
        <div class="nc-page-crumb">NOR CENTER · ARCHIVE</div>
        <h1 class="nc-page-title">Digital Archive</h1>
        <p class="nc-page-lede">Arsip terstruktur untuk setiap NOR resmi — status, linimasa, dan kesehatan arsip dalam satu tempat.</p>
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Unggah Dokumen</div>
        <div class="nc-upload-area">
          <svg class="nc-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          </svg>
          <div class="nc-empty-title">Unggah Dokumen — Coming Soon</div>
          <div class="nc-empty-sub">Digital Archive untuk dokumen hasil pindai akan hadir pada pembaruan mendatang.</div>
        </div>
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Daftar Arsip</div>
        ${records.length ? renderArchiveRows(records) : emptyState('Belum ada dokumen yang diarsipkan.', 'NOR resmi yang diarsipkan akan muncul di sini.')}
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Linimasa Arsip</div>
        ${timeline.length ? renderTimelineRows(timeline) : emptyState('Belum ada entri pada linimasa arsip.')}
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Kesehatan Arsip</div>
        <ul class="nc-status-grid">
          <li class="nc-status-item"><span class="nc-status-count">${health.healthScore}</span><span class="nc-status-label">Skor Kesehatan</span></li>
          <li class="nc-status-item"><span class="nc-status-count">${health.totalArchived}</span><span class="nc-status-label">Total Terarsip</span></li>
          <li class="nc-status-item"><span class="nc-status-count">${health.openGapCount}</span><span class="nc-status-label">Gap Terbuka</span></li>
          <li class="nc-status-item"><span class="nc-status-count">${health.knowledgeContributionPct}%</span><span class="nc-status-label">Kontribusi Pengetahuan</span></li>
        </ul>
      </div>
    </div>`;
}

function renderTimelineRows(entries) {
  return `
    <ul class="nc-timeline">
      ${entries.map((e) => `
        <li class="nc-timeline-row">
          <span class="nc-timeline-dot ${e.hasContributedKnowledge ? 'nc-timeline-dot--done' : ''}"></span>
          <span class="nc-row-primary">${esc(e.documentNumber)}</span>
          <span class="nc-row-secondary">${esc(e.documentDate || e.archivedAt || '—')}</span>
        </li>`).join('')}
    </ul>`;
}

/* ── Review ────────────────────────────────────────────────────────── */

function renderReviewSection() {
  const pending = safeKnowledgeList({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.PENDING_REVIEW });
  const candidate = safeKnowledgeList({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.CANDIDATE });

  return `
    <div class="nc-page">
      <div class="nc-page-head">
        <div class="nc-page-crumb">NOR CENTER · REVIEW</div>
        <h1 class="nc-page-title">Review Queue</h1>
        <p class="nc-page-lede">Pengetahuan yang diusulkan sistem menunggu tinjauan manusia sebelum berstatus Approved.</p>
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Pending Review</div>
        ${pending.length ? renderReviewRows(pending) : emptyState('Tidak ada item dalam antrean Pending Review.')}
      </div>

      <div class="nc-sec">
        <div class="nc-sec-title">Candidate</div>
        ${candidate.length ? renderReviewRows(candidate) : emptyState('Tidak ada item berstatus Candidate.')}
      </div>
    </div>`;
}

function renderReviewRows(items) {
  return `
    <ul class="nc-row-list">
      ${items.map((it) => `
        <li class="nc-row">
          <span class="nc-row-primary">${esc(it.kind || it.id)}</span>
          <span class="nc-row-secondary">${esc(String(it.updatedAt || '').slice(0, 10))}</span>
        </li>`).join('')}
    </ul>`;
}

/* ── Settings (read-only reference — never a parallel configuration) ── */

function renderSettingsSection() {
  const settings = getPettyCashSettings();
  const sampleNumber = norNumberFromSequence('XXX', todayISO());
  const topCount = (settings.signatories || []).length;
  const recapCount = (settings.recapSignatories || []).length;

  return `
    <div class="nc-page">
      <div class="nc-page-head">
        <div class="nc-page-crumb">NOR CENTER · SETTINGS</div>
        <h1 class="nc-page-title">Pengaturan</h1>
        <p class="nc-page-lede">NOR Center menggunakan konfigurasi NOR yang sama dengan Petty Cash Center — tidak ada konfigurasi terpisah.</p>
      </div>

      <div class="nc-sec">
        <div class="nc-settings-card">
          <div class="nc-settings-row"><span class="nc-settings-label">Pejabat Pengirim</span><span class="nc-settings-value">${esc(settings.senderTitle || '—')}</span></div>
          <div class="nc-settings-row"><span class="nc-settings-label">Penandatangan</span><span class="nc-settings-value">${topCount} penandatangan utama · ${recapCount} penandatangan rekap</span></div>
          <div class="nc-settings-row"><span class="nc-settings-label">Format Penomoran</span><span class="nc-settings-value nc-settings-mono">${esc(sampleNumber)}</span></div>
          <div class="nc-settings-note">Logo, template surat, dan pengaturan PDF dikelola sepenuhnya di <strong>Petty Cash Center → Pengaturan</strong> — NOR Center hanya menampilkan referensinya di sini.</div>
        </div>
      </div>
    </div>`;
}

/** Lazily connect to the live Petty Cash settings store (same idiom the
 *  Analytics Petty Cash / Executive views already use) and re-render the
 *  Settings section whenever it changes. Guarded so it only ever runs once. */
function ensurePettyCashSettingsLive() {
  if (pcLiveStarted) return;
  pcLiveStarted = true;
  initPettyCashStore().catch(() => {});
  onPettyCashChange(() => { if (st.section === 'settings') render(); });
}
