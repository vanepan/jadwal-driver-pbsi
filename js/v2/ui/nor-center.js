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

import {
  listKnowledge as knowledgeList,
  getKnowledge as knowledgeGetById,
} from '../knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE, LIFECYCLE_STATE_DEFS } from '../knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../knowledge/contracts/identity-contract.js';
import { buildAllProfiles, listProfileTypes } from '../knowledge/profiles/profile-engine.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import { getKind } from '../knowledge/registry/kind-registry.js';

import { computeArchiveHealth } from '../organizational-memory/archive-health-engine.js';
import { getArchiveTimeline } from '../organizational-memory/archive-timeline-engine.js';
import { listArchive as archiveList } from '../organizational-memory/services/archive-service.js';
import { checkKnowledgeContribution } from '../organizational-memory/knowledge-contribution-engine.js';

import { getComposerTimeline, getRevisionHistory } from '../document-intelligence/composer/composer-store.js';
// Phase 10, Sprint 10.3 — the Composer is fully awake: createDocument
// (Phase 8-10) AND editSection (this sprint, via ui/review-workspace.js)
// both now have real callers. js/v2/dormant-subsystems.js's own
// 'composer-timeline' entry — and every dormantNote() call site that used
// to read it — is retired; see that file's "PHASE 10, SPRINT 10.3
// DISPOSITION" comment for the full history.
// Phase 10, Sprint 10.1 — cross-screen jump into the new Review Workspace,
// the same setSarprasIntelligenceScreen() primitive sarpras-settings.js's
// Power View links already use (this file is dynamically imported by
// sarpras-intelligence-center.js the same way, so the circular-looking
// import is the same already-proven-safe shape).
import { setSarprasIntelligenceScreen } from './sarpras-intelligence-center.js';

import {
  initPettyCashStore, registerChangeListener as onPettyCashChange, getSettings as getPettyCashSettings,
} from '../../petty-cash/petty-cash-store.js';
import { norNumberFromSequence, todayISO, fmtLong } from '../../petty-cash/petty-cash-config.js';
// Sprint 11.1, Workstream 2 (production feedback) — the Generate NOR tab
// now hosts the REAL conversation natively (never redirects to another
// screen). Reuses the EXACT same real pipeline sarpras-intelligence-
// center.js's Home entry point calls — this is a second VIEW over the
// same engine, never a second pipeline (see that file's own Part
// 1/2/3/4 comments for what each of these does; the behavior here is
// intentionally byte-for-byte the same, only the render target and CSS
// scope differ).
import { beginProblemSolving, continueProblemConversation, composeApprovedNor } from '../problem-solving/services/problem-solving-service.js';
import { WORKFLOW_ROUTE } from '../problem-solving/contracts/workflow-route-contract.js';
import { HYPOTHESIS_STATUS } from '../reasoning/contracts/hypothesis-contract.js';
import { INTENT, getRequiredFacts } from '../conversation/contracts/intent-contract.js';
import { globalSearch } from '../services/global-search-service.js';
// Sprint 11.1, Workstream 2 (production feedback) — PREVIOUSLY UNCALLED
// anywhere in the UI layer (confirmed by grep before writing this): the
// legacy CREATE_NOR conversation had a missingFacts LIST but no way to
// answer it. js/v2/README.md's dependency graph already documents
// `ui/ -> conversation/` as legal ("not exercised in Phase 6 — no UI
// caller exists yet") — this is that edge's first real exercise, not a
// new architectural decision.
import { continueConversation } from '../conversation/services/conversation-service.js';

import {
  esc, renderEmptyState, renderTabShell, renderRowList, renderStatCards,
  renderFilterBar, renderDetailSection, renderKvList, renderDetail, renderDiffTable,
  isDeveloperMode,
} from './shared/workspace-list-kit.js';
import { createDatasetImportController, effectiveStage } from './dataset-import-center.js';
import {
  registerImportSessionChangeListener, registerImportBatchChangeListener,
} from '../knowledge/services/import-session-service.js';
import { registerChangeListener as registerFileStorageChangeListener } from '../file-storage/file-storage-registry.js';

import {
  PROFILE_OVERRIDE_TYPE, OVERRIDE_ACTION, OVERRIDE_PAYLOAD_SHAPE, isOverlayType, isStandaloneType,
  createOverrideDraft, promoteOverrideToCandidate, submitOverrideForReview, approveOverride, rejectOverride,
  getEffectiveProfile, listOverrides, getOverride,
} from '../knowledge/services/profile-override-service.js';
import { computePatternRecommendations } from '../knowledge/services/pattern-discovery-service.js';
// Phase 5, Part 3 — approving a Profile Override is a real, already-firing
// pattern correction: a human overriding what the deterministic pattern
// engine inferred.
import { recordCorrection, CORRECTION_TYPE } from '../learning/services/learning-service.js';

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

// Sprint 11.1, Workstream 2 (production feedback) — mirrors sarpras-
// intelligence-center.js's own homeState conversation fields exactly
// (same names, same shapes) so the SAME real engine calls
// (beginProblemSolving/continueProblemConversation/composeApprovedNor)
// slot in unchanged; only WHERE this state lives (here, not homeState)
// and how it renders (nc-* tab, not the Home dashboard) differ.
const NOR_INTENT_LABEL = Object.freeze({
  [INTENT.CREATE_NOR]: 'Membuat NOR',
  [INTENT.UPLOAD_KNOWLEDGE]: 'Mengunggah Dokumen',
  [INTENT.CORRECT_METADATA]: 'Mengoreksi Metadata',
  [INTENT.ARCHIVE_DOCUMENT]: 'Mengarsipkan Dokumen',
  [INTENT.REVIEW_KNOWLEDGE]: 'Meninjau Pengetahuan',
  [INTENT.GENERATE_EXECUTIVE_BRIEFING]: 'Membuat Ringkasan Eksekutif',
  [INTENT.UNKNOWN]: 'Tidak Dikenali',
});

const st = {
  section: 'dashboard',
  generateText: '',
  conv: {
    error: null, conversation: null, problemConversationTurn: null,
    answeredFacts: {}, askedFields: [], answerInput: '', clarification: null,
    activeProblem: null, activeRoute: null, activeCategory: null,
    searchResult: null, missingFactAnswers: {},
  },
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
    host.addEventListener('keydown', onKeydown);
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
  if (act === 'nc-pc-answer-submit') { handleGenerateAnswerSubmit(); return; }
  if (act === 'nc-conv-continue') { handleConversationContinue(el.dataset.id); return; }
  if (act === 'nc-compose-nor') { handleComposeNor(el.dataset.id, { allowIncomplete: false }); return; }
  if (act === 'nc-compose-nor-draft') { handleComposeNor(el.dataset.id, { allowIncomplete: true }); return; }
  if (act === 'nc-draft-row') { st.draftsSelectedId = st.draftsSelectedId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'nc-open-review') { setSarprasIntelligenceScreen('review'); return; }
  if (act === 'nc-archive-row') { st.archiveLinkId = st.archiveLinkId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'nc-review-row') { st.reviewLinkId = st.reviewLinkId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'nc-profiles-subtab') { st.profilesSubtab = el.dataset.id; render(); return; }
  if (act === 'nc-override-promote') { promoteOverrideToCandidate(el.dataset.id); render(); return; }
  if (act === 'nc-override-submit') { submitOverrideForReview(el.dataset.id); render(); return; }
  if (act === 'nc-override-approve') {
    const before = getOverride(el.dataset.id);
    const approved = approveOverride(el.dataset.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Ditinjau dan disetujui melalui Profil Organisasi.' });
    // Phase 5, Part 3 — approving a Profile Override IS a pattern correction:
    // a human overriding/pinning what the deterministic pattern engine
    // inferred. Recorded best-effort; the override approval already committed.
    if (approved.ok && before.ok) {
      recordCorrection({
        domainType: before.data.domainType,
        correctionType: CORRECTION_TYPE.PATTERN,
        targetKey: el.dataset.id,
        actorId: 'evan',
        reason: `Override ${before.data.overrideType}:${before.data.key} disetujui.`,
        before: null,
        after: { overrideType: before.data.overrideType, key: before.data.key, action: before.data.action, payload: before.data.payload },
        evidence: { overrideId: el.dataset.id },
      });
    }
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
  // Sprint 11.1, Workstream 2 — keystroke-only, never a re-render (same
  // discipline sic-pc-answer-input's own equivalent follows) — a
  // re-render mid-keystroke would lose focus/caret position.
  if (e.target && e.target.id === 'ncPcAnswerInput') { st.conv.answerInput = e.target.value; return; }
  // Sprint 11.1, Workstream 2 (production feedback) — one input per
  // missing fact (data-field distinguishes them), keystroke-only.
  const convFactInput = e.target.closest && e.target.closest('[data-act="nc-conv-fact-input"]');
  if (convFactInput) { st.conv.missingFactAnswers = { ...st.conv.missingFactAnswers, [convFactInput.dataset.field]: convFactInput.value }; return; }
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

/** Sprint 11.1, Workstream 2 — Enter-to-submit, matching sarpras-
 *  intelligence-center.js#onDashboardKeydown's exact same UX for the
 *  identical two inputs (initial utterance, conversation-turn answer). */
function onKeydown(e) {
  if (e.key !== 'Enter') return;
  if (e.target && e.target.id === 'ncGenerateInput') { host.querySelector('[data-act="nc-generate-submit"]')?.click(); }
  if (e.target && e.target.id === 'ncPcAnswerInput') { host.querySelector('[data-act="nc-pc-answer-submit"]')?.click(); }
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

/** Sprint 0 (Presentation Truth) — friendly label for a Knowledge `kind`
 *  id, same registry-lookup pattern archive-center.js/knowledge-center.js
 *  already use. */
function kindLabel(id) {
  const k = getKind(id);
  return k ? k.label : id;
}

/** Sprint 0 — the registered human label instead of the raw lowercase
 *  lifecycleState enum id a normal user should never see. */
function lifecycleLabel(id) {
  const def = LIFECYCLE_STATE_DEFS.find((d) => d.id === id);
  return def ? def.label : id;
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
    const devMode = isDeveloperMode();
    knowledgeSummary = knowledgeResult.ok
      ? `${devMode ? knowledgeResult.data.kind : kindLabel(knowledgeResult.data.kind)} — status ${devMode ? knowledgeResult.data.lifecycleState : lifecycleLabel(knowledgeResult.data.lifecycleState)}`
      : 'Belum ada Knowledge yang terhubung ke dokumen ini.';
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
        ${drafts.length ? renderDraftRows(drafts.slice(-5).reverse()) : renderEmptyState('Belum ada draft tersimpan.', 'Draf akan muncul di sini setelah Generate NOR menghasilkan draf dari Knowledge yang Disetujui.')}
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
        <p class="wlk-page-lede">Ceritakan kebutuhan Anda — Sarpras Intelligence akan bertanya hanya untuk yang belum diketahui, lalu menyusun draf NOR lengkap berdasarkan pengetahuan organisasi yang telah disetujui. Anda tetap meninjau dan menyetujui setiap draf sebelum diterbitkan.</p>
      </div>

      <div class="nc-generate-card sic-card sic-card--conversation">
        <input id="ncGenerateInput" class="nc-generate-input" type="text"
               placeholder="Contoh: Permohonan pembelian mesin potong rumput"
               value="${esc(st.generateText)}" autocomplete="off" />
        <button class="nc-generate-submit" data-act="nc-generate-submit" type="button" ${st.generateText.trim() ? '' : 'disabled'}>Buat Draf</button>
        ${st.conv.error ? `<p class="sic-next-action">${esc(st.conv.error)}</p>` : ''}
        ${renderGenerateRoutedResult()}
      </div>
    </div>`;
}

/** Sprint 11.1, Workstream 2 (production feedback) — dispatches purely on
 *  the LAST routingDecision THIS tab received from beginProblemSolving(),
 *  identical dispatch shape to sarpras-intelligence-center.js#
 *  renderRoutedResult(). */
function renderGenerateRoutedResult() {
  if (st.conv.clarification) return renderGenerateClarificationResult();
  if (st.conv.conversation) return renderGenerateConversationResult(st.conv.conversation);
  if (st.conv.problemConversationTurn) return renderGenerateProblemConversationTurn();
  if (st.conv.searchResult) return renderGenerateSearchResult();
  return '';
}

function renderGenerateSearchResult() {
  const r = st.conv.searchResult;
  const sections2 = [
    r.documents.length ? { title: 'Dokumen', items: r.documents.map((d) => `${d.filename} — ${effectiveStage(d)}`) } : null,
    r.archive.length ? { title: 'Arsip', items: r.archive.map((a) => `${a.documentNumber || a.id}`) } : null,
    r.knowledge.length ? { title: 'Pengetahuan', items: r.knowledge.map((k) => `${k.kind} — ${k.id}`) } : null,
  ].filter(Boolean);
  if (r.total === 0) return `<p class="sic-next-action">Tidak ada hasil untuk "${esc(r.query)}".</p>`;
  return `
    <div class="sic-search-results">
      ${sections2.map((s) => `
        <div class="sic-brief-sub">${esc(s.title)}</div>
        <ul class="sic-brief-list">${s.items.map((t) => `<li><span class="sic-brief-label">${esc(t)}</span></li>`).join('')}</ul>`).join('')}
    </div>`;
}

/** The ONE real path that still reaches the legacy Intent Engine
 *  (conversation-service.js#startConversation/continueConversation) — the
 *  path CREATE_NOR (Perjalanan Dinas/Pengadaan/Administration) actually
 *  takes, per problem-solving-service.js's CATEGORY_TO_INTENT mapping.
 *
 *  PRODUCTION FEEDBACK, VERIFIED LIVE — the missingFacts form below is
 *  NEW: sarpras-intelligence-center.js#renderConversationResult() (this
 *  function's own prior model) has only ever rendered `missingFacts` as
 *  static `<li>` text, with NO input to answer them — nothing in that
 *  file calls continueConversation() at all. Confirmed empirically (a
 *  real browser run against this exact utterance) before writing this:
 *  submitting the SAME text again just restarts classification from
 *  scratch (resetRoutedState()), so the legacy CREATE_NOR conversation
 *  could never actually be advanced through either UI. This is the real
 *  fix, not a copy of a working pattern — see the Home-screen version of
 *  this same fix in sarpras-intelligence-center.js for the twin. */
/** Sprint 11.2 (Adaptive Conversation) — resolves a gatheredFacts key to
 *  the same human-readable label missingFacts already shows (getRequiredFacts
 *  is the one schema both draw from), so the known-facts summary reads
 *  "Barang: Kursi" instead of the raw camelCase field key. Falls back to
 *  the field name only for a key the schema doesn't name (never hides a
 *  fact for lack of a label). */
function knownFactLabel(intent, norType, field) {
  const entry = getRequiredFacts(intent, norType).find((f) => f.field === field);
  return entry ? entry.label : field;
}

function renderGenerateConversationResult(c) {
  if (!c.currentIntent || c.currentIntent.intent === INTENT.UNKNOWN || c.state === 'failed') {
    return `<p class="sic-next-action">Permintaan ini belum dikenali platform. Coba salah satu: "saya ingin membuat NOR", "saya ingin mengunggah dokumen", "saya ingin meninjau pengetahuan".</p>`;
  }
  const known = Object.entries(c.gatheredFacts || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return `
    <div class="sic-conv-result">
      <p class="sic-next-action">Terdeteksi: <strong>${esc(NOR_INTENT_LABEL[c.currentIntent.intent] || c.currentIntent.intent)}</strong></p>
      ${known.length ? `
        <div class="sic-brief-sub">Sudah diketahui</div>
        <ul class="sic-brief-list">${known.map(([k, v]) => `<li><span class="sic-brief-label">✓ ${esc(knownFactLabel(c.currentIntent.intent, c.gatheredFacts.type, k))}: ${esc(String(v))}</span></li>`).join('')}</ul>` : ''}
      ${c.missingFacts && c.missingFacts.length ? `
        <div class="sic-brief-sub">Masih diperlukan</div>
        <div class="nc-conv-form">
          ${c.missingFacts.map((q) => `
            <div class="wlk-form-row">
              <label>${esc(q.prompt)}</label>
              <input data-act="nc-conv-fact-input" data-field="${esc(q.field)}" class="wlk-input" type="text" placeholder="${esc(q.label)}" value="${esc(st.conv.missingFactAnswers[q.field] || '')}" />
            </div>`).join('')}
          <button class="wlk-btn" data-act="nc-conv-continue" data-id="${esc(c.id)}" type="button">Lanjutkan</button>
        </div>`
    : '<p class="sic-next-action">Semua data yang diperlukan sudah ada.</p>'}
      ${c.state === 'ready' ? `<p class="sic-next-action">Semua data terkumpul. <button class="wlk-btn" data-act="nc-compose-nor" data-id="${esc(c.id)}" type="button">Susun NOR</button></p>` : ''}
      ${c.state === 'active' ? `<p class="sic-next-action sic-draft-now-hint">Ingin lihat draf sekarang, sebelum semua pertanyaan terjawab? <button class="wlk-btn wlk-btn--ghost" data-act="nc-compose-nor-draft" data-id="${esc(c.id)}" type="button">Susun Draf Sekarang</button></p>` : ''}
    </div>`;
}

/** Generic, category-agnostic turn loop (Diagnostic or plain Problem
 *  Conversation) — identical dispatch/copy to sarpras-intelligence-
 *  center.js#renderProblemConversationTurn(). */
function renderGenerateProblemConversationTurn() {
  const turn = st.conv.problemConversationTurn;
  const categoryLabel = st.conv.activeCategory || '';

  if (!turn.isComplete && turn.nextQuestion) {
    return `
      <div class="sic-conv-result">
        <p class="sic-next-action">Baik. Saya akan membantu menyiapkan ini (${esc(categoryLabel)}).</p>
        ${renderGenerateHypotheses(turn.hypotheses)}
        <p class="sic-brief-sub">${esc(turn.nextQuestion.prompt)}</p>
        <div class="sic-search-row">
          <input id="ncPcAnswerInput" class="sic-search-input" type="text" placeholder="${esc(turn.nextQuestion.label)}" value="${esc(st.conv.answerInput)}" />
          <button class="wlk-btn" data-act="nc-pc-answer-submit" type="button">Lanjut</button>
        </div>
      </div>`;
  }

  const rec = turn.recommendation;
  return `
    <div class="sic-conv-result">
      <p class="sic-next-action">Semua data yang diperlukan sudah ada. Terima kasih.</p>
      ${renderGenerateHypotheses(turn.hypotheses)}
      ${rec
    ? `<div class="sic-brief-sub">Rekomendasi</div><p class="sic-next-action">${esc(rec.claim)}</p>`
    : `<p class="sic-next-action">Belum ada aturan organisasi yang cocok untuk memberi rekomendasi otomatis — informasi ini akan diteruskan untuk tinjauan manual.</p>`}
    </div>`;
}

function renderGenerateHypotheses(hypotheses) {
  if (!hypotheses || !hypotheses.length) return '';
  const candidates = hypotheses.filter((h) => h.status !== HYPOTHESIS_STATUS.RULED_OUT);
  if (!candidates.length) return '';
  return `
    <div class="sic-brief-sub">Kemungkinan penyebab</div>
    <ul class="sic-brief-list">${candidates.map((h) => `<li><span class="sic-brief-label">${esc(h.cause)} ${h.status === HYPOTHESIS_STATUS.CONFIRMED ? '(terkonfirmasi)' : `(${Math.round(h.likelihood * 100)}%)`}</span></li>`).join('')}</ul>`;
}

function renderGenerateClarificationResult() {
  const c = st.conv.clarification;
  return `
    <div class="sic-conv-result">
      <p class="sic-next-action">${esc(c.message)}</p>
      ${c.partialSignal ? `<p class="sic-brief-sub">${esc(c.partialSignal)}</p>` : ''}
      ${c.examples.length ? `<p class="sic-brief-sub">Contoh yang sudah dipahami platform: ${c.examples.map(esc).join(', ')}.</p>` : ''}
    </div>`;
}

function resetGenerateConversationState() {
  st.conv = {
    error: st.conv.error, conversation: null, problemConversationTurn: null,
    answeredFacts: {}, askedFields: [], answerInput: '', clarification: null,
    activeProblem: null, activeRoute: null, activeCategory: null, searchResult: null,
    missingFactAnswers: {},
  };
}

/**
 * Sprint 11.1, Workstream 2 (production feedback) — the conversation now
 * runs NATIVELY inside this tab, never redirecting to another screen. This
 * used to run a separate, dead-end pipeline call
 * (document-intelligence-engine.js's 5-step NOR pilot, never producing a
 * ComposerDocument — the literal source of the old "structural guidance"
 * message), then briefly redirected to Home's conversation entry instead —
 * both were real gaps, not this tab's own final form. This calls the exact
 * SAME real pipeline Home's entry point calls
 * (problem-solving-service.js#beginProblemSolving), rendered here, with
 * KNOWLEDGE_ACQUISITION routed to THIS tab's own internal Archive section
 * (setSection('archive')) instead of a cross-screen jump — one further
 * step toward "never leaves NOR Center" than Home's own version manages,
 * since Home has no internal Archive tab of its own to redirect to.
 */
function handleGenerateSubmit() {
  const utterance = st.generateText.trim();
  if (!utterance) return;

  resetGenerateConversationState();
  const result = beginProblemSolving(utterance, 'evan');
  if (!result.ok) { st.conv.error = result.error.message; render(); return; }
  st.conv.error = null;

  const { data } = result;
  st.conv.activeProblem = data.problem;
  st.conv.activeRoute = data.routingDecision.route;
  st.conv.activeCategory = data.category;

  switch (data.routingDecision.route) {
    case WORKFLOW_ROUTE.SEARCH:
      st.conv.searchResult = globalSearch(data.searchQuery || utterance);
      break;
    case WORKFLOW_ROUTE.KNOWLEDGE_ACQUISITION:
      setSection('archive');
      return; // setSection already re-renders
    case WORKFLOW_ROUTE.CONVERSATION:
      if (data.conversation) { st.conv.conversation = data.conversation; break; }
      st.conv.problemConversationTurn = data.problemConversationTurn;
      break;
    case WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION:
      st.conv.problemConversationTurn = data.problemConversationTurn;
      break;
    case WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION:
    default:
      st.conv.clarification = data.clarification;
      break;
  }
  render();
}

/** Advances an in-progress Problem Conversation by exactly one turn —
 *  identical logic to sarpras-intelligence-center.js#
 *  handleProblemAnswerSubmit(). */
function handleGenerateAnswerSubmit() {
  const turn = st.conv.problemConversationTurn;
  if (!turn || !turn.nextQuestion) return;
  const value = st.conv.answerInput.trim();
  if (!value) return;

  const field = turn.nextQuestion.field;
  st.conv.answeredFacts = { ...st.conv.answeredFacts, [field]: value };
  st.conv.askedFields = [...st.conv.askedFields, field];
  st.conv.answerInput = '';

  const nextTurn = continueProblemConversation({
    problem: st.conv.activeProblem,
    answeredFacts: st.conv.answeredFacts,
    askedFields: st.conv.askedFields,
    hypotheses: turn.hypotheses,
    includeHypotheses: turn.hypotheses.length > 0 || st.conv.activeRoute === WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION,
  });
  st.conv.problemConversationTurn = nextTurn;
  st.conv.activeProblem = nextTurn.problem;
  render();
}

/** Sprint 11.1, Workstream 3 — same tanggalPanjang composition-date
 *  formatting sarpras-intelligence-center.js#sic-compose-nor already
 *  applies (see that handler's own comment for why this is a letterhead
 *  convention, not a fact about the NOR's own subject matter).
 *
 *  Sprint 11.3 (Document-first Experience), Requirement 1 — a successful
 *  compose now navigates straight into the Live Document Preview instead
 *  of leaving the human on this same conversation tab to go find their new
 *  draft manually. review-workspace.js is dynamically imported here (never
 *  a static import — this file must not eagerly pull in that screen's own
 *  doc-engine.js/pdfmake dependency the moment nor-center.js loads), the
 *  SAME lazy-load path sarpras-intelligence-center.js's own SCREENS
 *  registry already uses for this exact module. */
function handleComposeNor(conversationId, { allowIncomplete = false } = {}) {
  const composed = composeApprovedNor(conversationId, { formattingFacts: { tanggalPanjang: fmtLong(todayISO()) }, allowIncomplete });
  st.conv.error = composed.ok ? null : composed.error.message;
  if (composed.ok) {
    const documentId = composed.data.composerDocument.documentId;
    import('./review-workspace.js').then((mod) => {
      mod.openReviewDocument(documentId);
      setSarprasIntelligenceScreen('review');
    });
    return;
  }
  render();
}

/** Sprint 11.1, Workstream 2 (production feedback) — the real fix: the
 *  legacy CREATE_NOR conversation's missingFacts previously had no
 *  submission path anywhere in this codebase's UI (see
 *  renderGenerateConversationResult()'s header for how this was
 *  verified). Submits every currently-typed answer in ONE call — matches
 *  the form's own "one form, multiple fields" shape (missingFacts is a
 *  list shown all at once, unlike problemConversationTurn's one-at-a-time
 *  nextQuestion) — and only clears answers for fields the Conversation no
 *  longer lists as missing, so a field a human left blank keeps its
 *  partial input rather than silently discarding it. */
function handleConversationContinue(conversationId) {
  const answers = { ...st.conv.missingFactAnswers };
  const result = continueConversation(conversationId, answers);
  if (!result.ok) { st.conv.error = result.error.message; render(); return; }
  st.conv.error = null;
  st.conv.conversation = result.data;
  const stillMissing = new Set((result.data.missingFacts || []).map((q) => q.field));
  st.conv.missingFactAnswers = Object.fromEntries(Object.entries(st.conv.missingFactAnswers).filter(([f]) => stillMissing.has(f)));
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
        ${drafts.length ? renderDraftRows(drafts) : renderEmptyState('Belum ada draft tersimpan.', 'Draf akan muncul di sini setelah Generate NOR menghasilkan draf dari Knowledge yang Disetujui.')}
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
      <p class="wlk-page-lede">Ini adalah riwayat perbedaan (diff) antar versi. Untuk meninjau isi lengkap draf ini, metadata, dan status, buka Review Workspace.</p>
      <button class="wlk-btn" data-act="nc-open-review" type="button">Tinjau di Review Workspace</button>
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
            <span class="wlk-row-secondary">${esc(isDeveloperMode() ? o.lifecycleState : lifecycleLabel(o.lifecycleState))}</span>
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
  const devMode = isDeveloperMode();
  return renderRowList(items, (it) => `
    <li class="wlk-row" data-act="nc-review-row" data-id="${esc(it.id)}" data-clickable="1">
      <span class="wlk-row-primary">${esc(devMode ? (it.kind || it.id) : kindLabel(it.kind || it.id))}</span>
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

// Sprint 1 (Autonomy Closure, Part 3/10) — same coalesced-render idiom
// knowledge-center.js/learning-dashboard.js already use.
let _liveRenderTimer = null;
function scheduleLiveRender() {
  if (_liveRenderTimer) return;
  _liveRenderTimer = setTimeout(() => { _liveRenderTimer = null; render(); }, 100);
}

/** Phase 1 (Operational Engine Hardening) — cross-tab realtime sync. The
 *  underlying RTDB sync itself is already started once, unconditionally,
 *  by sarpras-intelligence-center.js's mount; this only registers the
 *  re-render hook so a change made in another browser tab is reflected
 *  here without a manual refresh. Guarded so it only ever runs once.
 *  Sprint 1 — previously only re-rendered while `st.section === 'archive'`;
 *  every other internal tab (Dashboard/Generate/Drafts/Profiles/Review/
 *  Settings) sat stale until manually clicked away and back. Now
 *  re-renders whichever tab is active. */
function ensureImportPipelineLive() {
  if (importPipelineLiveStarted) return;
  importPipelineLiveStarted = true;
  registerImportSessionChangeListener(scheduleLiveRender);
  registerImportBatchChangeListener(scheduleLiveRender);
  registerFileStorageChangeListener(scheduleLiveRender);
}
