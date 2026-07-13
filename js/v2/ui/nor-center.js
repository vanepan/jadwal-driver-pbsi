/* ============================================================
   NOR-CENTER.JS — NOR Center Foundation (V2.0.11 → V2.1 GA completion)

   The flagship application of Sarpras Intelligence. Nested inside the
   Sarpras Intelligence workspace (mounted by ./sarpras-intelligence-center.js
   when its "nor" screen is shown), owning its OWN internal navigation —
   Dashboard / Generate NOR / Drafts / Archive / Profil Organisasi / Review /
   Settings — exactly as a real product would.

   V2.1 CHANGES (Knowledge Acquisition Operational Readiness / GA):
     - The Archive tab's "Unggah Dokumen — Coming Soon" static block (a
       real, unconditional placeholder — the Operational Readiness Audit's
       one confirmed finding) is REMOVED and replaced with a real, working
       upload surface: ./dataset-import-center.js's controller, scoped to
       domainType:'nor', embedded directly in this tab. Every upload here
       walks the real Import Session lifecycle (Uploaded -> Pending Review
       -> Approved -> Knowledge Imported -> Archived).
     - Generate NOR's "Generation engine coming soon." string is reworded
       to name its real, honest blocking condition (no Approved `nor`
       Knowledge exists yet to draft from) — the underlying pipeline call
       and its NO_KNOWLEDGE outcome are UNCHANGED, only the wording no
       longer reads like a dummy placeholder.
     - A new "Profil Organisasi" tab: the computed Organizational Profiles
       (profiles/profile-engine.js, unchanged, promoted from a small
       Dashboard card to a full tab), the editable Profile Override layer
       (knowledge/profiles/overrides/*, draft -> candidate -> pending
       review -> approve, reusing the real unmodified Knowledge lifecycle),
       and Pattern Discovery's Candidate Recommendations
       (knowledge/profiles/pattern-discovery-engine.js) — read-only
       statistical evidence a human may turn into an override draft.
       Organizational Profiles are updated ONLY after a human approves an
       override; nothing here auto-applies anything.
     - Migrated onto js/v2/ui/shared/workspace-list-kit.js (the deferred
       V2.0.19 hardening task) — every generic render helper (tab shell,
       empty state, row list, stat cards) now reuses the shared kit
       instead of this file's own local duplicates. Verified markup-
       identical: nor-center.css's nc-shell / nc-tabbar / nc-tab / nc-page
       / nc-sec / nc-empty / nc-row / nc-status rules are byte-identical
       (same CSS property values) to workspace-list-kit.css's wlk-
       counterparts — this file's own header already documented that the
       kit was "generalized FROM nor-center.js's own local helpers".
       Genuinely NOR-specific markup with no shared-kit equivalent (Quick
       Actions, the Generate NOR card + outcome panel, Timeline rows,
       Settings card) keeps its own local nc-* styles unchanged.

   MISSION (unchanged from V2.0.11 — foundation, not intelligence):
     - No AI call. No fabricated NLP. No fake numbers.
     - Archive/Review/Settings/Drafts/Dashboard all still read the SAME
       real engines they always did — see each section's own comment
       below for the specific reuse trace.

   REUSE, NEVER DUPLICATE: no new PDF pipeline, no new numbering logic, no
   new Petty Cash settings UI, no new Knowledge repository, no new Archive
   repository, no second diff algorithm, no second upload mechanism (the
   Archive tab's upload reuses ./dataset-import-center.js unchanged — the
   SAME controller Archive Center embeds).
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

import { list as knowledgeList, getById as knowledgeGetById } from '../knowledge/repository/knowledge-repository.js';
import { LIFECYCLE_STATE, LIFECYCLE_STATE_DEFS } from '../knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../knowledge/contracts/identity-contract.js';
import { buildAllProfiles, listProfileTypes } from '../knowledge/profiles/profile-engine.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';

import { computeArchiveHealth } from '../organizational-memory/archive-health-engine.js';
import { getArchiveTimeline } from '../organizational-memory/archive-timeline-engine.js';
import { list as archiveList } from '../organizational-memory/repository/archive-repository.js';
import { checkKnowledgeContribution } from '../organizational-memory/knowledge-contribution-engine.js';

import { getComposerTimeline, getRevisionHistory } from '../document-intelligence/composer/composer-store.js';

import {
  initPettyCashStore, registerChangeListener as onPettyCashChange, getSettings as getPettyCashSettings,
} from '../../petty-cash/petty-cash-store.js';
import { norNumberFromSequence, todayISO } from '../../petty-cash/petty-cash-config.js';

import {
  esc, renderEmptyState, renderTabShell, renderRowList, renderStatCards,
  renderFilterBar, renderDetailSection, renderKvList, renderDetail, renderDiffTable,
} from './shared/workspace-list-kit.js';
import { createDatasetImportController } from './dataset-import-center.js';
import {
  registerImportSessionChangeListener, registerImportBatchChangeListener,
} from '../knowledge/services/import-session-service.js';
import { registerChangeListener as registerFileStorageChangeListener } from '../file-storage/file-storage-registry.js';

import {
  PROFILE_OVERRIDE_TYPE, OVERRIDE_ACTION, OVERRIDE_PAYLOAD_SHAPE, isOverlayType, isStandaloneType,
  createOverrideDraft, promoteOverrideToCandidate, submitOverrideForReview, approveOverride, rejectOverride,
  getEffectiveProfile, listOverrides,
} from '../knowledge/services/profile-override-service.js';
import { computePatternRecommendations } from '../knowledge/services/pattern-discovery-service.js';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'generate', label: 'Generate NOR' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'archive', label: 'Archive' },
  { id: 'profiles', label: 'Profil Organisasi' },
  { id: 'review', label: 'Review' },
  { id: 'settings', label: 'Settings' },
];

const PROFILE_SUBTABS = [
  { id: 'computed', label: 'Profil Terhitung' },
  { id: 'overrides', label: 'Override' },
  { id: 'recommendations', label: 'Rekomendasi' },
];

const st = {
  section: 'dashboard',
  generateText: '',
  generateOutcome: null, // {kind:'coming-soon'|'ready', title, message, detail} | null
  draftsSelectedId: null,
  archiveLinkId: null,
  reviewLinkId: null,
  profilesSubtab: 'computed',
  override: {
    overrideType: PROFILE_OVERRIDE_TYPE.RECIPIENT,
    key: '',
    action: OVERRIDE_ACTION.PIN,
    payloadText: '{"rationale": ""}',
    payloadError: null,
  },
};

let host = null;
let contentEl = null;
let mounted = false;
let pcLiveStarted = false;
let importPipelineLiveStarted = false;

// V2.1 — this Archive tab's upload surface is the SAME controller Archive
// Center embeds (./dataset-import-center.js), scoped to domainType:'nor'
// so an upload started here can never be misfiled under another domain.
const importController = createDatasetImportController({ domainType: 'nor', lockDomainType: true });

/* ── mount / teardown ─────────────────────────────────────────────── */

export async function mountNorCenter(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('nc-root', 'wlk-root');
  // V2.1.2 — repository activation + RTDB persistence sync moved to
  // sarpras-intelligence-center.js's own mount (the true single entry
  // point both Archive Center and NOR Center sit behind) — see that
  // file's header for why.
  if (!mounted) {
    mounted = true;
    host.innerHTML = renderTabShell(SECTIONS, st.section, { ariaLabel: 'NOR Center' });
    contentEl = host.querySelector('.wlk-content');
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('change', onChange);
    // V2.1 — real drag & drop for the Archive tab's embedded Dataset
    // Import Center controller (Part F).
    host.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('[data-act="dic-dropzone"]')) e.preventDefault(); });
    host.addEventListener('drop', onDrop);
    // Phase 2 (Autonomous Learning Pipeline), Part 4 — the dropzone's
    // ".dic-dropzone--active" visual state existed in CSS since V2.1 but
    // nothing ever toggled it; wired here the same way dragover/drop
    // already are.
    host.addEventListener('dragenter', (e) => { const zone = e.target.closest && e.target.closest('[data-act="dic-dropzone"]'); if (zone) zone.classList.add('dic-dropzone--active'); });
    host.addEventListener('dragleave', (e) => { const zone = e.target.closest && e.target.closest('[data-act="dic-dropzone"]'); if (zone && (!e.relatedTarget || !zone.contains(e.relatedTarget))) zone.classList.remove('dic-dropzone--active'); });
  }
  ensureImportPipelineLive();
  render();
}

export function closeNorCenter() { /* shell hides the host; state is retained */ }

/* ── render dispatch ──────────────────────────────────────────────── */

const RENDERERS = {
  dashboard: renderDashboardSection,
  generate: renderGenerateSection,
  drafts: renderDraftsSection,
  archive: renderArchiveSection,
  profiles: renderProfilesSection,
  review: renderReviewSection,
  settings: renderSettingsSection,
};

function render() {
  if (!contentEl) return;
  host.querySelectorAll('.wlk-tab').forEach((btn) => {
    btn.classList.toggle('wlk-tab--active', btn.dataset.id === st.section);
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
  if (act.startsWith('dic-')) { importController.onClick(el, render); return; }
  if (act === 'wlk-tab') { setSection(el.dataset.id); return; }
  if (act === 'nc-generate-submit') { handleGenerateSubmit(); return; }
  if (act === 'nc-draft-row') { st.draftsSelectedId = st.draftsSelectedId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'nc-archive-row') { st.archiveLinkId = st.archiveLinkId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'nc-review-row') { st.reviewLinkId = st.reviewLinkId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'nc-profiles-subtab') { st.profilesSubtab = el.dataset.id; render(); return; }
  if (act === 'nc-override-promote') { promoteOverrideToCandidate(el.dataset.id); render(); return; }
  if (act === 'nc-override-submit') { submitOverrideForReview(el.dataset.id); render(); return; }
  if (act === 'nc-override-approve') {
    approveOverride(el.dataset.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Ditinjau dan disetujui melalui Profil Organisasi.' });
    render(); return;
  }
  if (act === 'nc-override-reject') { rejectOverride(el.dataset.id, { approverId: 'evan', decidedAt: new Date().toISOString() }); render(); return; }
  if (act === 'nc-override-create') { handleOverrideCreate(); return; }
  if (act === 'nc-rec-to-override') {
    st.override.overrideType = el.dataset.patternType;
    st.override.key = el.dataset.value;
    st.override.action = isOverlayType(el.dataset.patternType) ? OVERRIDE_ACTION.PIN : OVERRIDE_ACTION.DEFINE;
    st.profilesSubtab = 'overrides';
    render(); return;
  }
}

function onInput(e) {
  if (e.target && e.target.id === 'ncGenerateInput') {
    st.generateText = e.target.value;
    const btn = host.querySelector('[data-act="nc-generate-submit"]');
    if (btn) btn.disabled = !st.generateText.trim();
    return;
  }
  const overrideField = e.target.closest && e.target.closest('[data-act="nc-override-field"]');
  if (overrideField) {
    st.override[overrideField.dataset.field] = overrideField.value;
    if (overrideField.dataset.field === 'overrideType') {
      st.override.action = isOverlayType(overrideField.value) ? OVERRIDE_ACTION.PIN : OVERRIDE_ACTION.DEFINE;
    }
    return;
  }
  importController.onInput(e, render);
}

function onChange(e) {
  importController.onChange(e, render);
}

function onDrop(e) {
  if (importController.onDrop(e, render)) e.preventDefault();
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

/** Archive <-> Knowledge cross-link — reuses the SAME deterministic id
 *  scheme knowledge-contribution-engine.js already established. */
function renderArchiveLinkPanel(recordId) {
  const record = getNorArchiveRecords().find((r) => r.id === recordId);
  if (!record) return '';
  const contributed = checkKnowledgeContribution(record);
  let knowledgeSummary = 'Belum ada Knowledge yang terhubung ke dokumen ini.';
  if (contributed) {
    const knowledgeId = generateKnowledgeId({ domainType: record.sourceDomainType, sourceType: record.sourceDomainType, sourceRef: record.sourceId });
    const knowledgeResult = knowledgeGetById(knowledgeId);
    knowledgeSummary = knowledgeResult.ok ? `${knowledgeResult.data.kind} — status ${knowledgeResult.data.lifecycleState}` : 'Belum ada Knowledge yang terhubung ke dokumen ini.';
  }
  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Knowledge Terkait — ${esc(record.documentNumber)}</div>
      ${renderEmptyState(knowledgeSummary)}
    </div>`;
}

/* ── Dashboard ─────────────────────────────────────────────────────── */

function renderDashboardSection() {
  const archives = getNorArchiveRecords().slice(-5).reverse();
  const knowledgeStatus = getNorKnowledgeStatus();
  const drafts = getComposerTimeline('nor');
  const profileReport = buildAllProfiles('nor');
  const computedProfiles = Object.values(profileReport.profiles).filter((r) => r.ok);
  const norDatasets = listDatasets({ domainType: 'nor' });

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">NOR CENTER</div>
        <h1 class="wlk-page-title">NOR Center</h1>
        <p class="wlk-page-lede">Ruang kerja terpadu untuk Nota Organisasi — draf, arsip, dan pengetahuan organisasi dalam satu tempat.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Draft Terbaru</div>
        ${drafts.length ? renderDraftRows(drafts.slice(-5).reverse()) : renderEmptyState('Belum ada draft tersimpan.', 'Draft yang Anda mulai melalui Composer akan muncul di sini.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Arsip Terbaru</div>
        ${archives.length ? renderArchiveRows(archives) : renderEmptyState('Belum ada dokumen yang diarsipkan.', 'NOR resmi yang diarsipkan akan muncul di sini.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Status Pengetahuan</div>
        ${renderStatCards(knowledgeStatus.map((s) => ({ count: s.count, label: s.label })))}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Organizational Profile — NOR</div>
        ${computedProfiles.length ? renderRowList(computedProfiles, (r) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(r.profile.profileType)}</span>
            <span class="wlk-row-secondary">${r.profile.sampleCount} sampel</span>
          </li>`) : renderEmptyState('Belum ada Profile yang terbangun untuk domain NOR.', 'Lihat tab "Profil Organisasi" untuk detail dan override.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Dataset Terkait — NOR</div>
        ${norDatasets.length ? renderRowList(norDatasets, (d) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(d.name)}</span>
            <span class="wlk-row-secondary">${esc(d.datasetType)}</span>
          </li>`) : renderEmptyState('Belum ada dataset terdaftar untuk domain NOR.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Aksi Cepat</div>
        <div class="nc-quick-actions">
          <button class="nc-quick-btn" data-act="wlk-tab" data-id="generate" type="button">Generate NOR</button>
          <button class="nc-quick-btn" data-act="wlk-tab" data-id="drafts" type="button">Lihat Draft</button>
          <button class="nc-quick-btn" data-act="wlk-tab" data-id="archive" type="button">Buka Arsip</button>
          <button class="nc-quick-btn" data-act="wlk-tab" data-id="profiles" type="button">Profil Organisasi</button>
          <button class="nc-quick-btn" data-act="wlk-tab" data-id="review" type="button">Antrean Review</button>
        </div>
      </div>
    </div>`;
}

/* ── Generate NOR ──────────────────────────────────────────────────── */

function renderGenerateSection() {
  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">NOR CENTER · GENERATE</div>
        <h1 class="wlk-page-title">Apa yang ingin Anda buat hari ini?</h1>
        <p class="wlk-page-lede">Sarpras Intelligence akan menyusun draf berdasarkan pengetahuan organisasi yang telah disetujui — Anda tetap meninjau dan menyetujui setiap draf sebelum diterbitkan.</p>
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
      title: 'Belum ada Knowledge Approved untuk didraf',
      message: 'Generator NOR menyusun draf dari Knowledge domain "nor" yang berstatus Approved — saat ini belum ada. Unggah dan setujui dokumen melalui tab Archive untuk mulai membangun Knowledge.',
      detail: (result.error && result.error.message) || null,
    };
  }
  render();
}

/* ── Drafts ────────────────────────────────────────────────────────── */

function renderDraftsSection() {
  const drafts = getComposerTimeline('nor');

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">NOR CENTER · DRAFTS</div>
        <h1 class="wlk-page-title">Draft Repository</h1>
        <p class="wlk-page-lede">Draf yang sedang disusun melalui Composer — setiap perubahan tercatat sebagai revisi dengan perbedaan (diff) yang nyata, bukan simulasi.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Draft Tersimpan</div>
        ${drafts.length ? renderDraftRows(drafts) : renderEmptyState('Belum ada draft tersimpan.', 'Draft yang Anda mulai melalui Composer akan muncul di sini.')}
      </div>

      ${st.draftsSelectedId ? renderDraftDetail(st.draftsSelectedId) : ''}
    </div>`;
}

function renderDraftRows(drafts) {
  return renderRowList(drafts, (d) => `
    <li class="wlk-row" data-act="nc-draft-row" data-id="${esc(d.documentId)}" data-clickable="1">
      <span class="wlk-row-primary">${esc(d.documentId)}</span>
      <span class="wlk-row-secondary">v${d.version} · ${esc(d.updatedAt)}</span>
    </li>`);
}

function renderArchiveRows(records) {
  return renderRowList(records, (r) => `
    <li class="wlk-row" data-act="nc-archive-row" data-id="${esc(r.id)}" data-clickable="1">
      <span class="wlk-row-primary">${esc(r.documentNumber)}</span>
      <span class="wlk-row-secondary">${esc(r.documentDate || r.archivedAt || '—')}</span>
    </li>`);
}

/** Composer History — every revision of one draft, oldest first, each with
 *  its own precomputed Diff against the immediate predecessor (composer-store.js
 *  already computes this at edit time — never recomputed here). */
function renderDraftDetail(documentId) {
  const revisions = getRevisionHistory(documentId);
  if (!revisions.length) return '';

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Riwayat Revisi — ${esc(documentId)}</div>
      ${revisions.map((rev) => `
        <div class="wlk-sec">
          <div class="wlk-sec-title">Versi ${rev.version}${rev.editedBy ? ` · oleh ${esc(rev.editedBy)}` : ''}</div>
          ${rev.diff ? renderDiffTable(rev.diff) : renderEmptyState('Revisi awal — belum ada perbedaan.')}
        </div>`).join('')}
    </div>`;
}

/* ── Archive ───────────────────────────────────────────────────────── */

function renderArchiveSection() {
  const records = getNorArchiveRecords();
  const timeline = getArchiveTimeline('nor');
  const health = computeArchiveHealth('nor');

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">NOR CENTER · ARCHIVE</div>
        <h1 class="wlk-page-title">Digital Archive</h1>
        <p class="wlk-page-lede">Arsip terstruktur untuk setiap NOR resmi — status, linimasa, dan kesehatan arsip dalam satu tempat.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Unggah Dokumen</div>
        ${importController.render()}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Daftar Arsip</div>
        ${records.length ? renderArchiveRows(records) : renderEmptyState('Belum ada dokumen yang diarsipkan.', 'NOR resmi yang diarsipkan akan muncul di sini.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Linimasa Arsip</div>
        ${timeline.length ? renderTimelineRows(timeline) : renderEmptyState('Belum ada entri pada linimasa arsip.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Kesehatan Arsip</div>
        ${renderStatCards([
          { count: health.healthScore, label: 'Skor Kesehatan' },
          { count: health.totalArchived, label: 'Total Terarsip' },
          { count: health.openGapCount, label: 'Gap Terbuka' },
          { count: `${health.knowledgeContributionPct}%`, label: 'Kontribusi Pengetahuan' },
        ])}
      </div>

      ${st.archiveLinkId ? renderArchiveLinkPanel(st.archiveLinkId) : ''}
    </div>`;
}

/** Archive Timeline dot-indicator rows — kept as a local nor-center.js
 *  renderer; workspace-list-kit.js has no timeline-with-status-dot
 *  equivalent (its consumers don't need one). CSS (.nc-timeline*) stays
 *  local for the same reason. */
function renderTimelineRows(entries) {
  return `
    <ul class="nc-timeline">
      ${entries.map((e) => `
        <li class="nc-timeline-row">
          <span class="nc-timeline-dot ${e.hasContributedKnowledge ? 'nc-timeline-dot--done' : ''}"></span>
          <span class="wlk-row-primary">${esc(e.documentNumber)}</span>
          <span class="wlk-row-secondary">${esc(e.documentDate || e.archivedAt || '—')}</span>
        </li>`).join('')}
    </ul>`;
}

/* ── Profil Organisasi (V2.1) ─────────────────────────────────────── */

function renderProfilesSection() {
  const nav = renderFilterBar(PROFILE_SUBTABS, st.profilesSubtab, { act: 'nc-profiles-subtab' });
  const body = {
    computed: renderProfilesComputed,
    overrides: renderProfilesOverrides,
    recommendations: renderProfilesRecommendations,
  }[st.profilesSubtab] || renderProfilesComputed;

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">NOR CENTER · PROFIL ORGANISASI</div>
        <h1 class="wlk-page-title">Profil Organisasi</h1>
        <p class="wlk-page-lede">Profil dihitung otomatis dari Knowledge Approved. Override tetap manual dan hanya berlaku setelah disetujui manusia — tidak ada perubahan otomatis.</p>
      </div>
      <div class="wlk-sec">${nav}</div>
      ${body()}
    </div>`;
}

function renderProfilesComputed() {
  const sections = listProfileTypes().map((profileType) => {
    const effective = getEffectiveProfile('nor', profileType);
    const body = effective.ok && effective.profile.entries.length
      ? renderRowList(effective.profile.entries, (entry) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(entry.value)}${entry.pinnedByOverride ? ' · dipin' : ''}</span>
            <span class="wlk-row-secondary">${entry.sampleCount} sampel · confidence ${entry.confidence}</span>
          </li>`)
      : renderEmptyState('Belum ada populasi untuk profil ini.', 'Profil terbangun dari Knowledge Approved domain "nor".');
    const title = `${profileType}${effective.overridesApplied ? ` (${effective.overridesApplied} override diterapkan)` : ''}`;
    return renderDetailSection(title, body);
  });
  return `<div class="wlk-sec">${renderDetail(sections)}</div>`;
}

function overrideTypeOptions() {
  return Object.values(PROFILE_OVERRIDE_TYPE).map((t) => `<option value="${esc(t)}" ${st.override.overrideType === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

function overrideActionOptions() {
  const actions = isOverlayType(st.override.overrideType)
    ? [OVERRIDE_ACTION.PIN, OVERRIDE_ACTION.SUPPRESS, OVERRIDE_ACTION.RENAME]
    : [OVERRIDE_ACTION.DEFINE];
  return actions.map((a) => `<option value="${esc(a)}" ${st.override.action === a ? 'selected' : ''}>${esc(a)}</option>`).join('');
}

function overrideNextAction(o) {
  if (o.lifecycleState === LIFECYCLE_STATE.DRAFT) return { act: 'nc-override-promote', label: 'Promosikan ke Candidate' };
  if (o.lifecycleState === LIFECYCLE_STATE.CANDIDATE) return { act: 'nc-override-submit', label: 'Ajukan untuk Review' };
  if (o.lifecycleState === LIFECYCLE_STATE.PENDING_REVIEW) return { act: 'nc-override-approve', label: 'Setujui' };
  return null;
}

function renderProfilesOverrides() {
  const shapeHint = isStandaloneType(st.override.overrideType) ? JSON.stringify(OVERRIDE_PAYLOAD_SHAPE[st.override.overrideType] || []) : '["rationale"] atau ["renameTo"]';
  const existing = listOverrides({ domainType: 'nor' });
  const overrides = existing.ok ? existing.data : [];

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Buat Override Baru</div>
      <div class="wlk-form-row"><label>Tipe Override</label><select data-act="nc-override-field" data-field="overrideType" class="wlk-select">${overrideTypeOptions()}</select></div>
      <div class="wlk-form-row"><label>Key</label><input data-act="nc-override-field" data-field="key" class="wlk-input" type="text" value="${esc(st.override.key)}" placeholder="Nilai yang ditimpa, mis. nama penerima"/></div>
      <div class="wlk-form-row"><label>Aksi</label><select data-act="nc-override-field" data-field="action" class="wlk-select">${overrideActionOptions()}</select></div>
      <div class="wlk-form-row"><label>Payload (JSON) — field yang diharapkan: ${esc(shapeHint)}</label><input data-act="nc-override-field" data-field="payloadText" class="wlk-input" type="text" value="${esc(st.override.payloadText)}"/></div>
      ${st.override.payloadError ? renderKvList([['Error Payload', st.override.payloadError]]) : ''}
      <button class="wlk-btn" data-act="nc-override-create" type="button">Buat Draft Override</button>
    </div>

    <div class="wlk-sec">
      <div class="wlk-sec-title">Override (${overrides.length})</div>
      ${overrides.length ? renderRowList(overrides, (o) => {
        const next = overrideNextAction(o);
        const rejectBtn = o.lifecycleState === LIFECYCLE_STATE.PENDING_REVIEW ? `<button class="wlk-btn wlk-btn--ghost" data-act="nc-override-reject" data-id="${esc(o.id)}" type="button">Tolak</button>` : '';
        return `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(o.overrideType)} — ${esc(o.key)} (${esc(o.action)})</span>
            <span class="wlk-row-secondary">${esc(o.lifecycleState)}</span>
            ${next ? `<button class="wlk-btn" data-act="${next.act}" data-id="${esc(o.id)}" type="button">${esc(next.label)}</button>` : ''}
            ${rejectBtn}
          </li>`;
      }) : renderEmptyState('Belum ada override.', 'Override yang dibuat di sini tidak pernah berlaku otomatis — harus melalui review dan persetujuan.')}
    </div>`;
}

function handleOverrideCreate() {
  const o = st.override;
  let payload;
  try {
    payload = JSON.parse(o.payloadText);
    st.override.payloadError = null;
  } catch (err) {
    st.override.payloadError = err && err.message ? err.message : 'JSON tidak valid.';
    render();
    return;
  }
  createOverrideDraft({ domainType: 'nor', overrideType: o.overrideType, key: o.key, action: o.action, payload, authoredBy: 'evan' });
  render();
}

function renderProfilesRecommendations() {
  const recommendations = computePatternRecommendations('nor');
  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Candidate Recommendations (${recommendations.length})</div>
      <p class="wlk-page-lede">Statistik deterministik dari Knowledge Approved — bukan AI. Setiap rekomendasi hanya menjadi Override setelah Anda memilih untuk membuatnya, dan tetap memerlukan persetujuan manusia.</p>
      ${recommendations.length ? renderRowList(recommendations, (r) => `
        <li class="wlk-row">
          <span class="wlk-row-primary">${esc(r.patternType)} — ${esc(r.value)}</span>
          <span class="wlk-row-secondary">support ${r.evidence.supportCount} · confidence ${r.evidence.confidence}</span>
          <button class="wlk-btn" data-act="nc-rec-to-override" data-pattern-type="${esc(r.patternType)}" data-value="${esc(r.value)}" type="button">Buat Draft Override</button>
        </li>`) : renderEmptyState('Belum ada rekomendasi.', 'Rekomendasi muncul setelah ada Knowledge Approved di domain "nor".')}
    </div>`;
}

/* ── Review ────────────────────────────────────────────────────────── */

function renderReviewSection() {
  const pending = safeKnowledgeList({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.PENDING_REVIEW });
  const candidate = safeKnowledgeList({ domainType: 'nor', lifecycleState: LIFECYCLE_STATE.CANDIDATE });

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">NOR CENTER · REVIEW</div>
        <h1 class="wlk-page-title">Review Queue</h1>
        <p class="wlk-page-lede">Pengetahuan yang diusulkan sistem menunggu tinjauan manusia sebelum berstatus Approved.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Pending Review</div>
        ${pending.length ? renderReviewRows(pending) : renderEmptyState('Tidak ada item dalam antrean Pending Review.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Candidate</div>
        ${candidate.length ? renderReviewRows(candidate) : renderEmptyState('Tidak ada item berstatus Candidate.')}
      </div>

      ${st.reviewLinkId ? renderReviewLinkPanel(st.reviewLinkId) : ''}
    </div>`;
}

function renderReviewRows(items) {
  return renderRowList(items, (it) => `
    <li class="wlk-row" data-act="nc-review-row" data-id="${esc(it.id)}" data-clickable="1">
      <span class="wlk-row-primary">${esc(it.kind || it.id)}</span>
      <span class="wlk-row-secondary">${esc(String(it.updatedAt || '').slice(0, 10))}</span>
    </li>`);
}

/** Knowledge <-> Archive cross-link, the reverse direction of
 *  renderArchiveLinkPanel — same deterministic id scheme, no new lookup
 *  mechanism. */
function renderReviewLinkPanel(itemId) {
  const record = getNorArchiveRecords().find((r) => generateKnowledgeId({ domainType: r.sourceDomainType, sourceType: r.sourceDomainType, sourceRef: r.sourceId }) === itemId);
  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Arsip Terkait</div>
      ${renderEmptyState(record ? `${record.documentNumber} — diarsipkan ${record.archivedAt}` : 'Belum ada dokumen arsip yang terhubung ke Knowledge ini.')}
    </div>`;
}

/* ── Settings (read-only reference — never a parallel configuration) ── */

function renderSettingsSection() {
  const settings = getPettyCashSettings();
  const sampleNumber = norNumberFromSequence('XXX', todayISO());
  const topCount = (settings.signatories || []).length;
  const recapCount = (settings.recapSignatories || []).length;

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">NOR CENTER · SETTINGS</div>
        <h1 class="wlk-page-title">Pengaturan</h1>
        <p class="wlk-page-lede">NOR Center menggunakan konfigurasi NOR yang sama dengan Petty Cash Center — tidak ada konfigurasi terpisah.</p>
      </div>

      <div class="wlk-sec">
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

/** Phase 1 (Operational Engine Hardening) — cross-tab realtime sync. The
 *  underlying RTDB sync itself is already started once, unconditionally,
 *  by sarpras-intelligence-center.js's mount; this only registers the
 *  re-render hook so a change made in another browser tab is reflected
 *  here without a manual refresh. Guarded so it only ever runs once. */
function ensureImportPipelineLive() {
  if (importPipelineLiveStarted) return;
  importPipelineLiveStarted = true;
  const onRemoteChange = () => { if (st.section === 'archive') render(); };
  registerImportSessionChangeListener(onRemoteChange);
  registerImportBatchChangeListener(onRemoteChange);
  registerFileStorageChangeListener(onRemoteChange);
}
