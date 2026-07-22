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

   SCOPE: NOR Center (V2.0.11), Archive Center, Knowledge Center and
   Learning Dashboard (all V2.0.18) are real nested workspaces — see
   ./nor-center.js, ./archive-center.js, ./knowledge-center.js,
   ./learning-dashboard.js.

   Sprint 0 (Presentation Truth) — the Dashboard screen used to be a
   100%-static roadmap ("Foundation Ready" for every module, regardless of
   whether real data existed). It is now an Executive Briefing — five
   real questions (today / running / attention / learned / next),
   answered entirely from engines every other workspace here already
   imports (no new engine). This file is also the ONE place the
   platform-wide Normal/Developer toggle lives (see the mode bar built in
   buildShell()) — every workspace reads the SAME shared flag
   (js/v2/ui/shared/workspace-list-kit.js#isDeveloperMode), so flipping it
   once here affects all five screens.

   Sprint 1 (Autonomy Closure) — the old static roadmap (kept as a
   Developer Mode subsection in Sprint 0) is REMOVED entirely: it was
   still a second, duplicated "which module is done" identity sitting
   alongside the Executive Briefing, exactly the thing Sprint 0 already
   diagnosed as the problem. Developer Mode's subsection is now genuinely
   ADDITIVE — real technical diagnostics (session counts by raw pipeline
   stage, registered domain/kind counts, a live count of stalled
   knowledge-import cascades) — see renderTechnicalDiagnostics() below.
   This file also now registers its own live listeners (the same
   100ms-debounced scheduleRender() idiom knowledge-center.js/
   learning-dashboard.js already use) so the Executive Briefing updates
   without the user navigating away and back.

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

import {
  setKnowledgeBackend as setActiveRepository,
  listKnowledge as knowledgeList,
  registerKnowledgeListener as registerRepositoryListener,
} from '../knowledge/services/knowledge-service.js';
// North-Star Gap Closure — the real, already-Approved NOR bootstrap
// content (docs/KNOWLEDGE_POPULATION_REPORT.md) previously only existed
// inside the one-off `scripts/nor-knowledge-bootstrap-seed.mjs` process;
// nothing loaded it into a live session, so reasoning-engine.js/
// nor-composer.js always retrieved against an empty repository. Safe to
// import statically (pure in-memory ingest/promote calls, no Firebase —
// same "safe to import, backend touched lazily" contract this file's own
// header already documents for every other import here).
import { seedNorBootstrapKnowledge } from '../knowledge/bootstrap/nor-reverse-engineering-knowledge.js';
// Phase 9, Sprint 9.3 (Knowledge Authoring) — the second real Knowledge-
// authoring event (Perjalanan Dinas + Pengadaan, evidenced from 13 real
// documents; see docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md). Same "safe to
// import, pure in-memory ingest/promote" contract as the seed above.
import { seedPerjalananDinasPengadaanKnowledge } from '../knowledge/bootstrap/nor-perjalanan-dinas-pengadaan-knowledge.js';
import {
  initImportSessionSync, initImportBatchSync,
  registerImportSessionChangeListener, registerImportBatchChangeListener,
  sweepPipeline,
} from '../knowledge/services/import-session-service.js';
// Phase 6.5 (Pipeline Observability Hardening, Part 8) — Worker Health
// observes the ONE real, event-driven sweepPipeline() call site below; it
// never calls sweepPipeline() itself and never changes what it decides.
import { recordSweepTick, getWorkerHealth } from '../knowledge/datasets/import-session/performance-collector.js';
import { initFileStorageSync } from '../../../src/file-storage/file-storage-registry.js';
// Phase 10, Sprint 10.1 — the Review Workspace's foundation: a
// ComposerDocument (a composed NOR draft) must survive a refresh for a
// human reviewer to come back to it, same "activate once, at Sarpras
// Intelligence's own mount" idiom as every init*Sync() call in this block.
import { initComposerDocumentSync, registerChangeListener as registerComposerChangeListener } from '../../../src/document-intelligence/composer/composer-document-repository.js';
// Phase 2.5 Part 3 — make the in-memory knowledge repo a deterministic
// projection of the persisted Import Sessions, so imported Knowledge
// survives a refresh (and picks up another tab's RTDB-hydrated sessions).
import { rehydrateKnowledgeFromSessions } from '../knowledge/datasets/import-session/knowledge-rehydration-engine.js';
// Phase 11, Sprint 11.9 (Persistent Organizational Learning) — the EXACT
// same "durable source -> projection on load" pattern as
// rehydrateKnowledgeFromSessions above, applied to the persisted
// ComposerDocument revisions: a reviewer's reusable wording edits become
// persistent, governed, promotable Candidate learning that survives refresh/
// restart/deployment. See that engine's header for the full rationale.
import { rehydrateLearningFromDocuments } from '../../../src/document-intelligence/composer/reviewer-edit-rehydration-engine.js';

// Executive Briefing data sources — every one of these is already imported
// and used by an existing workspace file (see each import's origin below);
// this file only COMPOSES them into five plain-language questions, it
// never recomputes what an engine already computes.
import { reviewReasons, effectiveStage, runReanalysisSweep } from './dataset-import-center.js';
import { listImportSessions } from '../knowledge/datasets/import-session/import-session-engine.js';
import {
  IMPORT_SESSION_STATE, PIPELINE_STAGE_ORDER, PIPELINE_OFF_RAMP_STAGES,
  isTerminalImportSessionState, isOffRampStage,
} from '../knowledge/datasets/import-session/contracts/import-session-contract.js';
import { listArchive as archiveList, getGapsWithWorkflowState, GAP_STATUS } from '../../../src/organizational-memory/index.js';
import { listDomainTypes } from '../knowledge/registry/domain-type-registry.js';
import { listKinds } from '../knowledge/registry/kind-registry.js';
import { getReviewQueue, getCandidateQueue } from '../knowledge/review/review-queue-engine.js';
import { listOverrides } from '../knowledge/services/profile-override-service.js';
import { LIFECYCLE_STATE } from '../knowledge/contracts/lifecycle-contract.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import { manualFileSource } from '../knowledge/connectors/manual-file-connector.js';
import { computePatternRecommendations, discoverAndRecordPatterns } from '../knowledge/services/pattern-discovery-service.js';
// Phase 5, Part 8 — "Executive Learning": every number in the new card below
// comes from the Learning Service, the Organization Memory engine, or the
// Coverage engine — real, persisted, dated facts, never a fabricated metric.
// buildLearningMetrics/listCorrectionLog (the OLD, still-dormant correction
// mechanism — see dormant-subsystems.js) are no longer imported here: the
// broader "Correction Log" concept the mission asks for is now genuinely
// live via Learning Events, fed by three real producers (metadata/knowledge/
// pattern corrections — see dataset-import-center.js, knowledge-center.js,
// nor-center.js).
import { listLearningEvents, LEARNING_KIND } from '../learning/services/learning-service.js';
import { computeOrganizationalMemory } from '../../../src/organizational-memory/organizational-memory-engine.js';
import { computeCoverageReport } from '../../../src/organizational-memory/coverage-engine.js';
import { countResolvedGaps } from '../../../src/organizational-memory/gap-workflow-engine.js';
// Experience Architecture phase — Part 6 (Action-first Home): "Continue
// Previous Batch" is real only when a real unfinished batch exists.
import { listBatches, BATCH_STATUS } from '../knowledge/datasets/import-session/import-batch-engine.js';
// Part 5 (Search-first): one aggregator over three already-real services —
// see global-search-service.js's own header for why it invents nothing.
import { globalSearch } from '../services/global-search-service.js';
// Part 9 (Conversation-first): the REAL, deterministic Conversation Service
// (Phase 6) — this file only renders what it returns, never reinterprets
// an utterance itself and never adds a new intent.
import { INTENT, getRequiredFacts } from '../../../src/conversation/contracts/intent-contract.js';
// Sprint 11.1 (production feedback) — PREVIOUSLY UNCALLED anywhere in
// this file (verified by grep before writing this): renderConversationResult()
// below has only ever rendered `missingFacts` as static text, with no way
// to answer them — a real, pre-existing gap confirmed via a live browser
// run (submitting the same utterance again just restarts classification
// via resetRoutedState(), never continues). js/v2/README.md's dependency
// graph already documents `ui/ -> conversation/` as legal ("not exercised
// in Phase 6 — no UI caller exists yet") — this is that edge's first real
// exercise, not a new architectural decision. See nor-center.js's twin fix
// for the identical pattern applied there first.
import { continueConversation } from '../../../src/conversation/services/conversation-service.js';
// Phase 10.5 (Home Entry Point Migration, Problem-First Architecture) —
// EVERY free-text request now enters through beginProblemSolving() first
// (Problem Classification -> Diagnostic Planning -> Routing Decision).
// startConversation() (which internally runs the legacy Intent Engine) is
// no longer imported/called directly by this file at all — it is reached
// only INSIDE problem-solving-service.js, strictly downstream of routing,
// exactly Part 1's own migration order. See that file's own header for
// why this is a graceful-degradation, not a replacement.
import {
  beginProblemSolving, continueProblemConversation, composeApprovedNor,
} from '../problem-solving/services/problem-solving-service.js';
import { WORKFLOW_ROUTE } from '../problem-solving/contracts/workflow-route-contract.js';
import { HYPOTHESIS_STATUS } from '../reasoning/contracts/hypothesis-contract.js';
// Sprint 11.1, Workstream 3 — the one legal ui/ -> V1 edge for date
// formatting (js/v2/README.md's dependency graph; nor-center.js already
// uses this exact same edge, same functions).
import { fmtLong, todayISO } from '../../petty-cash/petty-cash-config.js';
// Phase 3, Part 8 — see js/v2/dormant-subsystems.js. This briefing used to
// count the OLD correction log's always-zero value.
import { dormantNote } from '../dormant-subsystems.js';
import { esc, isDeveloperMode, setPresentationMode } from './shared/workspace-list-kit.js';

// Experience Architecture phase — 'knowledge' keeps its screen id (still a
// real, mountable, fully-working screen) even though it lost its primary
// nav button (see js/app.js's nav panel); 'settings' is the one genuinely
// new screen id this phase adds. Screen ids are internal routing, not user-
// facing labels — the labels users actually see live in js/app.js's
// SIC_MENU_TITLES and nav buttons, and in each workspace's own render.
// Phase 10, Sprint 10.1 — 'review' joins 'knowledge' as a screen with no
// primary nav button (see js/app.js's nav panel header comment: "5 items,
// user mental models not engineering domains"). Reachable via Settings'
// Power View, same as Knowledge Center — a real, mountable, fully-working
// screen with a deliberately quiet entry point.
const SCREEN_IDS = ['dashboard', 'nor', 'archive', 'knowledge', 'learning', 'settings', 'review'];

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
  settings: { modulePath: './sarpras-settings.js', mountName: 'mountSarprasSettings', closeName: 'closeSarprasSettings' },
  review: { modulePath: './review-workspace.js', mountName: 'mountReviewWorkspace', closeName: 'closeReviewWorkspace' },
};

let host = null;
let screen = 'dashboard';
let sections = null;   // {screenId: HTMLElement}
let modeBarEl = null;
const mountedState = {};   // {screenId: {mounted: boolean, mount: Function, close: Function}}

let _persistenceStarted = false;

/** Sprint 1 (Autonomy Closure) — same coalesced-render idiom
 *  knowledge-center.js/learning-dashboard.js already use (module-level
 *  timer, 100ms debounce) so a burst of events collapses to one render.
 *  Gated to `screen === 'dashboard'` — the Executive Briefing is the only
 *  thing this file itself renders; the four nested workspaces manage
 *  their own live-render wiring. */
let _renderTimer = null;
function scheduleRender() {
  if (_renderTimer) return;
  _renderTimer = setTimeout(() => {
    _renderTimer = null;
    if (screen === 'dashboard' && sections) sections.dashboard.innerHTML = renderDashboard();
  }, 100);
}

/* ── Home — Part 5 (Search) / Part 6 (Action-first) / Part 9 (Conversation)
   Module-scope, mirroring dataset-import-center.js's own `st` idiom, just
   without a controller factory (this file has always been a singleton —
   only one Sarpras Intelligence shell ever mounts). Real, plain interaction
   state only — no cached query results duplicated anywhere else. ────────── */
const homeState = {
  searchInput: '', searchResult: null,
  conversationInput: '', conversation: null, conversationError: null,
  // Sprint 11.1 (production feedback) — in-progress typed answers for the
  // legacy CREATE_NOR conversation's missingFacts form (see
  // renderConversationResult()'s own header for why this exists now).
  missingFactAnswers: {},
  // Phase 10.5 — Problem-First Architecture. `activeProblem`/`activeRoute`
  // persist across turns of a generic Problem Conversation (Diagnostic or
  // plain); `problemConversationTurn` is the LATEST advanceProblemConversation()
  // output; `answeredFacts`/`askedFields` accumulate turn over turn so
  // continueProblemConversation() never re-asks the same field twice.
  // `lastPipelineTrace` is Developer Mode's own read of the most recent
  // beginProblemSolving()/continueProblemConversation() call — display
  // only, never a second computation of anything it shows.
  activeProblem: null, activeRoute: null, activeCategory: null,
  problemConversationTurn: null, answeredFacts: {}, askedFields: [],
  problemAnswerInput: '', clarification: null,
  lastPipelineTrace: null,
};

const INTENT_LABEL = Object.freeze({
  [INTENT.CREATE_NOR]: 'Membuat NOR',
  [INTENT.UPLOAD_KNOWLEDGE]: 'Mengunggah Dokumen',
  [INTENT.CORRECT_METADATA]: 'Mengoreksi Metadata',
  [INTENT.ARCHIVE_DOCUMENT]: 'Mengarsipkan Dokumen',
  [INTENT.REVIEW_KNOWLEDGE]: 'Meninjau Pengetahuan',
  [INTENT.GENERATE_EXECUTIVE_BRIEFING]: 'Membuat Ringkasan Eksekutif',
  [INTENT.UNKNOWN]: 'Tidak Dikenali',
});

/** Part 6 — real, conditional quick actions. "Lanjutkan Batch Sebelumnya"
 *  and "Tinjau Pengecualian" only appear when a real reason to show them
 *  exists (an unfinished batch; a nonzero attention count) — Part 7's "do
 *  not show actions that cannot currently happen", applied to Home itself. */
function computeQuickActions(attention) {
  const actions = [
    { id: 'upload', label: 'Unggah Dokumen', screen: 'archive' },
    { id: 'generate-nor', label: 'Buat NOR', screen: 'nor' },
  ];
  const batches = safeList(listBatches, {});
  const unfinished = batches.filter((b) => b.status === BATCH_STATUS.PROCESSING || b.status === BATCH_STATUS.PAUSED);
  if (unfinished.length) {
    actions.push({ id: 'continue-batch', label: `Lanjutkan Batch Sebelumnya (${unfinished.length})`, screen: 'archive' });
  }
  if (attention.total > 0) {
    actions.push({ id: 'review', label: `Tinjau Pengecualian (${attention.total})`, screen: 'archive' });
  }
  return actions;
}

function renderQuickActions(actions) {
  return `
    <div class="sic-quick-actions">
      ${actions.map((a) => `<button class="sic-quick-action" data-act="sic-nav" data-id="${esc(a.screen)}" type="button">${esc(a.label)}</button>`).join('')}
    </div>`;
}

/** Part 5 — search-first. Submits on Enter/click only, never on keystroke
 *  (same discipline dataset-import-center.js's Advanced Metadata form
 *  already established — a keystroke must never cost a re-render, or the
 *  caret/focus is lost mid-type). */
function renderSearchBar() {
  const r = homeState.searchResult;
  const sections2 = r ? [
    r.documents.length ? { title: 'Dokumen', items: r.documents.map((d) => `${d.filename} — ${stageLabelForSearch(d)}`) } : null,
    r.archive.length ? { title: 'Arsip', items: r.archive.map((a) => `${a.documentNumber || a.id}`) } : null,
    r.knowledge.length ? { title: 'Pengetahuan', items: r.knowledge.map((k) => `${k.kind} — ${k.id}`) } : null,
  ].filter(Boolean) : [];
  return `
    <div class="sic-search">
      <div class="sic-search-row">
        <input class="sic-search-input" data-act="sic-search-input" type="text" placeholder="Cari dokumen, arsip, atau pengetahuan…" value="${esc(homeState.searchInput)}" />
        <button class="wlk-btn" data-act="sic-search-submit" type="button">Cari</button>
      </div>
      ${r ? (r.total > 0 ? `
        <div class="sic-search-results">
          ${sections2.map((s) => `
            <div class="sic-brief-sub">${esc(s.title)}</div>
            <ul class="sic-brief-list">${s.items.map((t) => `<li><span class="sic-brief-label">${esc(t)}</span></li>`).join('')}</ul>`).join('')}
        </div>` : `<p class="sic-next-action">Tidak ada hasil untuk "${esc(r.query)}".</p>`) : ''}
    </div>`;
}

function stageLabelForSearch(session) {
  return isTerminalImportSessionState(session.state) ? session.state : effectiveStage(session);
}

/** Phase 10.5, Part 1/4 — the Home Entry Point. EVERY free-text request
 *  now enters through beginProblemSolving() (Problem Classification ->
 *  Diagnostic Planning -> Routing Decision) BEFORE anything resembling the
 *  legacy Intent Engine is ever reached — "never reject user input before
 *  Problem Classification". Renders EXACTLY what the pipeline returns, no
 *  second interpretation of the utterance, no fabricated confirmation.
 *  Card title/copy softened per Part 4 ("should feel like speaking with an
 *  experienced Sarpras staff member, not a command launcher"). */
function renderConversationEntry() {
  return `
    <div class="sic-card sic-card--conversation">
      <div class="sic-card-head"><div class="sic-card-h-title">Ceritakan apa yang terjadi atau apa yang Anda butuhkan</div></div>
      <div class="sic-search-row">
        <input class="sic-search-input" data-act="sic-conv-input" type="text" placeholder='Contoh: "AC kamar atlet rusak" atau "mau perjalanan dinas"' value="${esc(homeState.conversationInput)}" />
        <button class="wlk-btn" data-act="sic-conv-start" type="button">Kirim</button>
      </div>
      ${homeState.conversationError ? `<p class="sic-next-action">${esc(homeState.conversationError)}</p>` : ''}
      ${renderRoutedResult()}
    </div>`;
}

/** Part 2 — dispatches purely on the LAST routingDecision this file itself
 *  received from beginProblemSolving() — never re-derives a route from the
 *  utterance itself (that would be exactly the "keyword matching alone"
 *  Part 2 forbids; the Problem Router already decided, once). */
function renderRoutedResult() {
  if (homeState.clarification) return renderClarificationResult();
  if (homeState.conversation) return renderConversationResult(homeState.conversation);
  if (homeState.problemConversationTurn) return renderProblemConversationTurn();
  return '';
}

/** The ONE real path that still reaches the legacy Intent Engine — always
 *  downstream of Problem Classification + Routing (see
 *  problem-solving-service.js's own CONVERSATION branch).
 *
 *  PRODUCTION FEEDBACK, VERIFIED LIVE — the missingFacts form below is
 *  NEW. Before this, `missingFacts` rendered as static `<li>` text with no
 *  input to answer them, and nothing in this file called
 *  continueConversation() — confirmed empirically (a real browser run)
 *  before writing this fix: resubmitting the same utterance just restarts
 *  classification from scratch via resetRoutedState(), so this
 *  conversation could never actually be advanced through this UI. See
 *  nor-center.js's twin fix (renderGenerateConversationResult) for the
 *  identical pattern, built first there. */
/** Sprint 11.2 (Adaptive Conversation) — see nor-center.js's identical
 *  twin (knownFactLabel) for the header. Resolves a gatheredFacts key to
 *  the same human-readable label missingFacts already shows. */
function knownFactLabel(intent, norType, field) {
  const entry = getRequiredFacts(intent, norType).find((f) => f.field === field);
  return entry ? entry.label : field;
}

function renderConversationResult(c) {
  if (!c.currentIntent || c.currentIntent.intent === INTENT.UNKNOWN || c.state === 'failed') {
    return `<p class="sic-next-action">Permintaan ini belum dikenali platform. Coba salah satu: "saya ingin membuat NOR", "saya ingin mengunggah dokumen", "saya ingin meninjau pengetahuan".</p>`;
  }
  const known = Object.entries(c.gatheredFacts || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return `
    <div class="sic-conv-result">
      <p class="sic-next-action">Terdeteksi: <strong>${esc(INTENT_LABEL[c.currentIntent.intent] || c.currentIntent.intent)}</strong></p>
      ${renderComposeDraftNow(c)}
      ${known.length ? `
        <div class="sic-brief-sub">Sudah diketahui</div>
        <ul class="sic-brief-list">${known.map(([k, v]) => `<li><span class="sic-brief-label">✓ ${esc(knownFactLabel(c.currentIntent.intent, c.gatheredFacts.type, k))}: ${esc(String(v))}</span></li>`).join('')}</ul>` : ''}
      ${c.missingFacts && c.missingFacts.length ? `
        <div class="sic-brief-sub">Masih diperlukan</div>
        <div class="nc-conv-form">
          ${c.missingFacts.map((q) => `
            <div class="wlk-form-row">
              <label>${esc(q.prompt)}</label>
              <input data-act="sic-conv-fact-input" data-field="${esc(q.field)}" class="wlk-input" type="text" placeholder="${esc(q.label)}" value="${esc(homeState.missingFactAnswers[q.field] || '')}" />
            </div>`).join('')}
          <button class="wlk-btn" data-act="sic-conv-continue" data-id="${esc(c.id)}" type="button">Lanjutkan</button>
        </div>`
    : '<p class="sic-next-action">Semua data yang diperlukan sudah ada.</p>'}
      ${c.state === 'ready' ? `<p class="sic-next-action">Semua data terkumpul. <button class="wlk-btn" data-act="sic-compose-nor" data-id="${esc(c.id)}" type="button">Susun NOR</button></p>` : ''}
    </div>`;
}

/** Sprint 11.10 (Product Architecture Gap Closure) — "Live Preview First" /
 *  "Automatic Missing Information Discovery": once the intent is confirmed
 *  and the conversation is genuinely under way (ACTIVE — at least one real
 *  exchange has happened, not the empty instant right after typing), a
 *  reviewer may choose to see the almost-finished document immediately
 *  instead of finishing the guided Q&A first. ADDITIVE, not a replacement
 *  of the existing "answer the remaining questions" flow (Sprint
 *  11.1/11.2's own UAT-hardened "ask only what is unknown" path is
 *  completely unchanged, still rendered below this) — a human explicitly
 *  opts in by clicking, per the architecture report's own documented
 *  tradeoff (a forced compose-first DEFAULT risks a new reviewer seeing a
 *  mostly-blank document with no guidance on what a NOR needs, which is
 *  worse UX for exactly the "help new employees learn faster" persona
 *  CLAUDE.md's mission cares about) — that reasoning is UNCHANGED and this
 *  sprint does not revisit it: the Q&A form stays the default path.
 *
 *  Phase 12.8.x, Sprint 1 (Experience Completion) — PROMOTED, not
 *  automated. The brief asked for "the document should appear
 *  immediately"; making this fire automatically would directly reverse
 *  Sprint 11.10's own considered decision above and would break
 *  home-generate-live-preview-check.mjs's real-browser assertion that the
 *  Q&A form is what a human sees first. Instead: this affordance moves
 *  from LAST (a small ghost-styled hint below the full Q&A form) to
 *  FIRST (a real, primary-styled callout immediately under intent
 *  detection) — still one deliberate click, never automatic, but now the
 *  most visually prominent thing on screen instead of the least. Never
 *  shown once already 'ready' (the "Susun NOR" button, drawing from real
 *  complete data rather than a draft, already covers that). */
function renderComposeDraftNow(c) {
  if (c.state !== 'active') return '';
  return `
    <div class="sic-draft-now-card">
      <p class="sic-draft-now-lede">Draf lengkap sudah bisa dilihat sekarang — sisanya bisa diisi langsung di dalam dokumen.</p>
      <button class="wlk-btn" data-act="sic-compose-nor-draft" data-id="${esc(c.id)}" type="button">Susun Draf Sekarang</button>
    </div>`;
}

/** Phase 10.5, Parts 2/4 — the generic, category-agnostic turn loop
 *  (Diagnostic Conversation for 'facility'; plain Conversation fallback
 *  for any category with no real Intent mapping yet). Renders leading
 *  Hypotheses ONLY when the engine actually produced any (facility only,
 *  and only once real Approved Knowledge exists to cite — cite-or-abstain,
 *  never a placeholder "we don't know" hypothesis). */
function renderProblemConversationTurn() {
  const turn = homeState.problemConversationTurn;
  const categoryLabel = homeState.activeCategory || '';

  if (!turn.isComplete && turn.nextQuestion) {
    return `
      <div class="sic-conv-result">
        <p class="sic-next-action">Baik. Saya akan membantu menyiapkan ini (${esc(categoryLabel)}).</p>
        ${renderHypotheses(turn.hypotheses)}
        <p class="sic-brief-sub">${esc(turn.nextQuestion.prompt)}</p>
        <div class="sic-search-row">
          <input class="sic-search-input" data-act="sic-pc-answer-input" type="text" placeholder="${esc(turn.nextQuestion.label)}" value="${esc(homeState.problemAnswerInput)}" />
          <button class="wlk-btn" data-act="sic-pc-answer-submit" type="button">Lanjut</button>
        </div>
      </div>`;
  }

  // Complete — Part "Reasoning -> Recommendation" of the pipeline.
  const rec = turn.recommendation;
  return `
    <div class="sic-conv-result">
      <p class="sic-next-action">Semua data yang diperlukan sudah ada. Terima kasih.</p>
      ${renderHypotheses(turn.hypotheses)}
      ${rec
    ? `<div class="sic-brief-sub">Rekomendasi</div><p class="sic-next-action">${esc(rec.claim)}</p>`
    : `<p class="sic-next-action">Belum ada aturan organisasi yang cocok untuk memberi rekomendasi otomatis — informasi ini akan diteruskan untuk tinjauan manual.</p>`}
    </div>`;
}

function renderHypotheses(hypotheses) {
  if (!hypotheses || !hypotheses.length) return '';
  const candidates = hypotheses.filter((h) => h.status !== HYPOTHESIS_STATUS.RULED_OUT);
  if (!candidates.length) return '';
  return `
    <div class="sic-brief-sub">Kemungkinan penyebab</div>
    <ul class="sic-brief-list">${candidates.map((h) => `<li><span class="sic-brief-label">${esc(h.cause)} ${h.status === HYPOTHESIS_STATUS.CONFIRMED ? '(terkonfirmasi)' : `(${Math.round(h.likelihood * 100)}%)`}</span></li>`).join('')}</ul>`;
}

/** Phase 10.5, Part 3 — Unknown Problem Handling. NEVER "Request not
 *  recognized": always a genuine clarifying question, plus the real,
 *  registered category labels this platform understands today. */
function renderClarificationResult() {
  const c = homeState.clarification;
  return `
    <div class="sic-conv-result">
      <p class="sic-next-action">${esc(c.message)}</p>
      ${c.partialSignal ? `<p class="sic-brief-sub">${esc(c.partialSignal)}</p>` : ''}
      ${c.examples.length ? `<p class="sic-brief-sub">Contoh yang sudah dipahami platform: ${c.examples.map(esc).join(', ')}.</p>` : ''}
    </div>`;
}

/** Phase 10.5, Part 1 — resets every route-specific field before a new
 *  classification, so a fresh request never shows a stale prior route's
 *  leftover state (e.g. a previous Problem Conversation's question)
 *  alongside the new one. */
function resetRoutedState() {
  homeState.conversation = null;
  homeState.problemConversationTurn = null;
  homeState.answeredFacts = {};
  homeState.askedFields = [];
  homeState.problemAnswerInput = '';
  homeState.missingFactAnswers = {};
  homeState.clarification = null;
  homeState.activeProblem = null;
  homeState.activeRoute = null;
  homeState.activeCategory = null;
}

/** Phase 10.5, Part 1/2 — the Home Entry Point. Never rejects an utterance
 *  before Problem Classification: beginProblemSolving() itself only ever
 *  fails on a genuinely empty/invalid input (a real input error, checked
 *  below the same way it always was), never on "not recognized" — an
 *  unclassifiable PROBLEM routes to Clarification instead (see
 *  problem-router.js). */
function handleProblemSubmit() {
  const utterance = homeState.conversationInput.trim();
  if (!utterance) { homeState.conversationError = 'Ketik dulu apa yang ingin Anda lakukan.'; sections.dashboard.innerHTML = renderDashboard(); return; }

  resetRoutedState();
  const result = beginProblemSolving(utterance, 'evan');
  homeState.lastPipelineTrace = result.ok ? { stage: 'begin', utterance, ...result.data } : { stage: 'begin', utterance, error: result.error };

  if (!result.ok) { homeState.conversationError = result.error.message; sections.dashboard.innerHTML = renderDashboard(); return; }
  homeState.conversationError = null;

  const { data } = result;
  homeState.activeProblem = data.problem;
  homeState.activeRoute = data.routingDecision.route;
  homeState.activeCategory = data.category;

  switch (data.routingDecision.route) {
    case WORKFLOW_ROUTE.SEARCH:
      // Part 2 — reuses the EXISTING, real search bar/globalSearch, never a
      // second search implementation.
      homeState.searchInput = data.searchQuery || utterance;
      homeState.searchResult = globalSearch(homeState.searchInput);
      break;
    case WORKFLOW_ROUTE.KNOWLEDGE_ACQUISITION:
      // Part 2 — reuses the EXISTING Archive Center navigation, the same
      // destination the "Unggah Dokumen" quick action already uses.
      setSarprasIntelligenceScreen('archive');
      return; // setSarprasIntelligenceScreen already re-renders via showScreen
    case WORKFLOW_ROUTE.CONVERSATION:
      if (data.conversation) { homeState.conversation = data.conversation; break; }
      homeState.problemConversationTurn = data.problemConversationTurn;
      break;
    case WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION:
      homeState.problemConversationTurn = data.problemConversationTurn;
      break;
    case WORKFLOW_ROUTE.CLARIFICATION_CONVERSATION:
    default:
      homeState.clarification = data.clarification;
      break;
  }
  sections.dashboard.innerHTML = renderDashboard();
}

/** Phase 10.5, Part 2/4 — advances an in-progress Problem Conversation
 *  (Diagnostic or plain) by exactly one turn, never re-asking a field
 *  already answered this session (askedFields accumulates, never resets
 *  mid-conversation). */
function handleProblemAnswerSubmit() {
  const turn = homeState.problemConversationTurn;
  if (!turn || !turn.nextQuestion) return;
  const value = homeState.problemAnswerInput.trim();
  if (!value) return;

  const field = turn.nextQuestion.field;
  homeState.answeredFacts = { ...homeState.answeredFacts, [field]: value };
  homeState.askedFields = [...homeState.askedFields, field];
  homeState.problemAnswerInput = '';

  const nextTurn = continueProblemConversation({
    problem: homeState.activeProblem,
    answeredFacts: homeState.answeredFacts,
    askedFields: homeState.askedFields,
    hypotheses: turn.hypotheses,
    includeHypotheses: turn.hypotheses.length > 0 || homeState.activeRoute === WORKFLOW_ROUTE.DIAGNOSTIC_CONVERSATION,
  });
  homeState.problemConversationTurn = nextTurn;
  homeState.activeProblem = nextTurn.problem;
  homeState.lastPipelineTrace = { stage: 'continue', ...nextTurn };
  sections.dashboard.innerHTML = renderDashboard();
}

function onDashboardClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'sic-nav') { setSarprasIntelligenceScreen(el.dataset.id); return; }
  if (el.dataset.act === 'sic-search-submit') {
    homeState.searchResult = globalSearch(homeState.searchInput);
    sections.dashboard.innerHTML = renderDashboard();
    return;
  }
  if (el.dataset.act === 'sic-conv-start') { handleProblemSubmit(); return; }
  if (el.dataset.act === 'sic-pc-answer-submit') { handleProblemAnswerSubmit(); return; }
  if (el.dataset.act === 'sic-conv-continue') { handleConversationContinue(el.dataset.id); return; }
  if (el.dataset.act === 'sic-compose-nor' || el.dataset.act === 'sic-compose-nor-draft') {
    // Sprint 11.1, Workstream 3 — tanggalPanjang is the document's real
    // composition/issuance date (a letterhead convention, not a fact
    // about the NOR's own subject matter — confirmed with the repository
    // owner: neither Pengadaan's empty date schema nor Perjalanan Dinas's
    // two ambiguous candidates, departureDate/returnDate, obviously mean
    // "the letterhead date"). Computed HERE, not in nor-composer.js/
    // problem-solving-service.js — this is the one legal edge to V1
    // (petty-cash-config.js), same edge nor-center.js already uses.
    //
    // Sprint 11.10 — the ONLY difference between the two actions is
    // allowIncomplete: true for the new "Susun Draf Sekarang" button
    // (composeApprovedNor's own header explains why this is safe: it's a
    // no-op for the already-ready case, since 'ready'/'completed' are
    // always permitted regardless of this flag).
    const composed = composeApprovedNor(el.dataset.id, {
      formattingFacts: { tanggalPanjang: fmtLong(todayISO()) },
      allowIncomplete: el.dataset.act === 'sic-compose-nor-draft',
    });
    homeState.conversationError = composed.ok ? null : composed.error.message;
    if (composed.ok) {
      homeState.lastPipelineTrace = { stage: 'compose', ...composed.data };
      // Sprint 11.3 (Document-first Experience), Requirement 1 — land
      // straight on the new draft's Live Document Preview instead of
      // leaving the human on this Home screen to go find it manually.
      // review-workspace.js is dynamically imported here (never a static
      // import — same reason WORKSPACES['review'] below already lazy-
      // loads it: this screen's own doc-engine.js/pdfmake dependency must
      // not load eagerly the moment the Home screen mounts).
      const documentId = composed.data.composerDocument.documentId;
      import('./review-workspace.js').then((mod) => {
        mod.openReviewDocument(documentId);
        setSarprasIntelligenceScreen('review');
      });
      return;
    }
    sections.dashboard.innerHTML = renderDashboard();
  }
}

/** Keystrokes update state only — never a re-render (see renderSearchBar's
 *  own comment). Submission (click/Enter) is the only thing that redraws. */
function onDashboardInput(e) {
  if (e.target.dataset.act === 'sic-search-input') homeState.searchInput = e.target.value;
  if (e.target.dataset.act === 'sic-conv-input') homeState.conversationInput = e.target.value;
  if (e.target.dataset.act === 'sic-pc-answer-input') homeState.problemAnswerInput = e.target.value;
  if (e.target.dataset.act === 'sic-conv-fact-input') {
    homeState.missingFactAnswers = { ...homeState.missingFactAnswers, [e.target.dataset.field]: e.target.value };
  }
}

/** Sprint 11.1 (production feedback) — the real fix for the previously-
 *  nonexistent CREATE_NOR answer path (see renderConversationResult()'s
 *  header). Submits every currently-typed answer in one call — matches
 *  missingFacts's own "list shown all at once" shape. */
function handleConversationContinue(conversationId) {
  const answers = { ...homeState.missingFactAnswers };
  const result = continueConversation(conversationId, answers);
  if (!result.ok) { homeState.conversationError = result.error.message; sections.dashboard.innerHTML = renderDashboard(); return; }
  homeState.conversationError = null;
  homeState.conversation = result.data;
  const stillMissing = new Set((result.data.missingFacts || []).map((q) => q.field));
  homeState.missingFactAnswers = Object.fromEntries(Object.entries(homeState.missingFactAnswers).filter(([f]) => stillMissing.has(f)));
  sections.dashboard.innerHTML = renderDashboard();
}

function onDashboardKeydown(e) {
  if (e.key !== 'Enter') return;
  if (e.target.dataset.act === 'sic-search-input') { homeState.searchResult = globalSearch(homeState.searchInput); sections.dashboard.innerHTML = renderDashboard(); }
  if (e.target.dataset.act === 'sic-conv-input') { document.querySelector('[data-act="sic-conv-start"]')?.click(); }
  if (e.target.dataset.act === 'sic-pc-answer-input') { document.querySelector('[data-act="sic-pc-answer-submit"]')?.click(); }
}

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
    // setActiveRepository('memory') MUST run before any import can create
    // Knowledge (otherwise a create no-ops against NullRepository while the
    // session still flips to Knowledge Imported). It runs here, at the
    // single mount, strictly before any import UI is reachable — the
    // defensive ordering guarantee.
    setActiveRepository('memory');
    // North-Star Gap Closure — seed the real, already-authored NOR
    // bootstrap Knowledge (96 Approved facts/relationships) into THIS
    // session's repository, right here, right after activation and
    // strictly before any screen or Conversation can read from it. Errors
    // are logged, not thrown — seedNorBootstrapKnowledge() already returns
    // an honest per-item error list rather than a boolean, and a partial
    // seed should never block the rest of the workspace from mounting.
    try {
      const seedResult = seedNorBootstrapKnowledge();
      if (seedResult.errors.length) {
        console.warn('[sarpras-intelligence-center] NOR bootstrap knowledge seed had errors:', seedResult.errors);
      }
    } catch (err) {
      console.error('[sarpras-intelligence-center] NOR bootstrap knowledge seed failed:', err);
    }
    // Phase 9, Sprint 9.3 — seeded strictly after the Petty Cash bootstrap
    // above, since this file's own correction step (numbering-format ->
    // Generic) reads and supersedes an Approved item that seed just
    // created.
    try {
      const perjalananDinasPengadaanResult = seedPerjalananDinasPengadaanKnowledge();
      if (perjalananDinasPengadaanResult.errors.length) {
        console.warn('[sarpras-intelligence-center] Perjalanan Dinas/Pengadaan knowledge seed had errors:', perjalananDinasPengadaanResult.errors);
      }
    } catch (err) {
      console.error('[sarpras-intelligence-center] Perjalanan Dinas/Pengadaan knowledge seed failed:', err);
    }
    // Phase 2.5 Part 3 — re-project Knowledge from the persisted sessions
    // on every remote hydration (idempotent), AND once after the initial
    // sync resolves. registerImportSessionChangeListener fires on
    // RTDB-originated snapshots (initial load + other tabs), so this keeps
    // the knowledge projection in step with the authoritative sessions
    // without polling.
    //
    // Phase 2.6 — THE RESUMPTION HOOK, and the answer to "why did documents
    // get stuck?". Nothing in this system ever looked at an Import Session
    // again once the tab that uploaded it moved on. A batch interrupted by a
    // refresh, a crash, or simply closing the tab left its sessions in flight
    // FOREVER — not because a stage was mis-computed, but because no engine
    // owned them any more.
    //
    // sweepPipeline() adopts them. It drives every non-terminal session to a
    // real terminal (Completed / Cancelled / Failed) or parks it honestly at
    // Awaiting Evidence, working entirely from the PERSISTED session — so it
    // does not care which tab uploaded the file, or whether that tab still
    // exists. It runs here on real events only, never on a timer:
    //
    //   - once the initial RTDB hydration resolves (a refresh's first breath),
    //   - and on every subsequent session change (another tab's writes).
    //
    // It is O(N), idempotent, and writes NOTHING once every session has come
    // to rest — so a converged system settles instead of oscillating, and the
    // event loop terminates rather than feeding itself.
    const rehydrateAndSweep = () => {
      try {
        // Order matters: project Knowledge from finished sessions first, then
        // sweep the unfinished ones (a sweep may finish more, which fires
        // another change event and re-projects them on the next pass).
        rehydrateKnowledgeFromSessions();
        // Phase 6.5 (Part 8) — real wall-clock time for this ONE real sweep
        // call, recorded into the Performance Collector for Worker Health.
        // Purely observational: the sweep's own decisions are unchanged.
        const sweepStartMs = Date.now();
        const summary = sweepPipeline();
        recordSweepTick(summary, Date.now() - sweepStartMs);
        // V2, Part A2 (Background Re-Analysis) — fire-and-forget, exactly
        // like initImportBatchSync() below: this is a genuinely separate,
        // async/networked concern (re-fetching bytes from Storage) from
        // sweepPipeline()'s synchronous lifecycle-advance above, and
        // nothing here needs to await its result — the next change event
        // (or the next mount) picks up wherever it left off. Auto-detect
        // AND auto-execute (confirmed): safe because runReanalysis() can
        // only ever create a new reviewable Candidate for an Approved
        // KnowledgeItem, never mutate one in place.
        runReanalysisSweep().catch((err) => console.error('[sarpras-intelligence-center] re-analysis sweep failed:', err));
      } catch (err) {
        console.error('[sarpras-intelligence-center] pipeline rehydration/sweep failed:', err);
      }
    };
    registerImportSessionChangeListener(rehydrateAndSweep);
    initImportSessionSync()
      .then(rehydrateAndSweep)
      .catch((err) => console.error('[sarpras-intelligence-center] import session sync failed:', err));
    initImportBatchSync().catch((err) => console.error('[sarpras-intelligence-center] import batch sync failed:', err));
    initFileStorageSync().catch((err) => console.error('[sarpras-intelligence-center] file storage sync failed:', err));
    // Sprint 11.9 — reviewer edits become PERSISTENT Candidate learning by
    // re-projecting them from the persisted ComposerDocument revisions, the
    // same way Knowledge is re-projected from persisted Import Sessions
    // above. Registered on the composer repository's change listener so it
    // runs on BOTH a local edit (putRecord -> notifyChange, live
    // responsiveness) AND an RTDB rehydration (applyRemoteSnapshot ->
    // notifyChange, the refresh/restart/other-tab path). Idempotent and
    // human-gate-safe by construction (see the engine's header): a converged
    // corpus writes nothing, and an Approved candidate is never overwritten.
    // Best-effort — a projection failure must never block the workspace.
    const projectReviewerLearning = () => {
      try { rehydrateLearningFromDocuments(); } catch (err) { console.error('[sarpras-intelligence-center] reviewer-edit learning projection failed:', err); }
    };
    registerComposerChangeListener(projectReviewerLearning);
    initComposerDocumentSync()
      .then(projectReviewerLearning)
      .catch((err) => console.error('[sarpras-intelligence-center] composer document sync failed:', err));
    // Sprint 1 (Autonomy Closure, Part 3/10) — the Executive Briefing
    // previously had zero live listeners; a change made anywhere in the
    // platform never reflected here without navigating away and back.
    registerImportSessionChangeListener(scheduleRender);
    registerImportBatchChangeListener(scheduleRender);
    registerRepositoryListener(scheduleRender);

    // Phase 5, Part 6/9 — Pattern Discovery as a LEARNING PRODUCER, driven
    // on real events, never a timer. A Knowledge change (a new Approval) or
    // an Import Session change (a metadata correction) is exactly when a
    // pattern's support could have moved. discoverAndRecordPatterns() is
    // idempotent-when-unchanged (see pattern-discovery-service.js's header),
    // so calling it on every such event is safe: a converged pattern set
    // performs zero writes, and only a real change produces one new,
    // explainable Learning Event.
    const discoverPatterns = () => {
      try {
        for (const d of listDomainTypes()) discoverAndRecordPatterns(d.id);
      } catch (err) {
        console.error('[sarpras-intelligence-center] pattern discovery failed:', err);
      }
    };
    registerRepositoryListener(discoverPatterns);
    registerImportSessionChangeListener(discoverPatterns);
  }
  if (!sections) buildShell();
  showScreen(screen);
}

/** Build the mode-toggle bar plus the five persistent screen containers
 *  once; never rebuilt after. Sprint 0 — ONE Normal/Developer toggle for
 *  the whole platform, visible above every screen (not one button per
 *  workspace — "no redundant buttons", "teach once"). */
function buildShell() {
  host.innerHTML = `<div class="sic-mode-bar" data-sic-mode-bar></div>${SCREEN_IDS
    .map((id) => `<div class="sic-screen" data-sic-screen="${id}" style="display:none;"></div>`)
    .join('')}`;
  modeBarEl = host.querySelector('[data-sic-mode-bar]');
  modeBarEl.addEventListener('click', onModeBarClick);
  renderModeBar();
  sections = {};
  host.querySelectorAll('[data-sic-screen]').forEach((el) => { sections[el.dataset.sicScreen] = el; });
  sections.dashboard.innerHTML = renderDashboard();
  // Home's own interactive elements (quick actions, search, Conversation
  // entry) — one delegated listener set on the persistent screen container,
  // same idiom every nested workspace already uses on its own host.
  sections.dashboard.addEventListener('click', onDashboardClick);
  sections.dashboard.addEventListener('input', onDashboardInput);
  sections.dashboard.addEventListener('keydown', onDashboardKeydown);
  // #nor / #archive / #knowledge / #learning / #settings are left empty —
  // each nested workspace module owns its own content once mounted (see
  // WORKSPACES).
}

function renderModeBar() {
  const dev = isDeveloperMode();
  modeBarEl.innerHTML = `
    <div class="sic-mode-toggle" role="group" aria-label="Mode tampilan Sarpras Intelligence">
      <button class="sic-mode-btn${!dev ? ' sic-mode-btn--active' : ''}" data-act="sic-mode" data-id="normal" type="button">Normal</button>
      <button class="sic-mode-btn${dev ? ' sic-mode-btn--active' : ''}" data-act="sic-mode" data-id="developer" type="button">Developer</button>
    </div>`;
}

/** Flipping the ONE shared flag, then refreshing whichever screen is
 *  currently visible. Every workspace's own `mount*()` already ends with
 *  an unconditional render() call even when already mounted (see e.g.
 *  archive-center.js#mountArchiveCenter), so re-invoking it is a free,
 *  idempotent way to pick up the new mode with no new exports needed. */
function onModeBarClick(e) {
  const el = e.target.closest('[data-act="sic-mode"]');
  if (!el) return;
  setPresentationMode(el.dataset.id);
  renderModeBar();
  if (screen === 'dashboard') {
    sections.dashboard.innerHTML = renderDashboard();
  } else {
    const entry = mountedState[screen];
    if (entry && entry.mount) entry.mount(sections[screen]);
  }
}

// Experience Architecture phase — internal navigation (Home's quick
// actions, Settings' Power View links) can now switch screens without
// going through js/app.js's own nav-button click handler, which is the
// ONLY place that used to keep the outer nav highlight in sync. Same
// registerChangeListener idiom already used everywhere else in this
// codebase (repositories, knowledge service) rather than a new mechanism:
// v2 stays fully decoupled from app.js (it has no idea what a nav button
// id is), and app.js registers one listener to resync its own highlight.
const _screenChangeListeners = [];
export function registerScreenChangeListener(cb) { if (typeof cb === 'function') _screenChangeListeners.push(cb); }
function notifyScreenChange() { _screenChangeListeners.forEach((cb) => { try { cb(screen); } catch (e) { console.error('[sarpras-intelligence-center] screen change listener error', e); } }); }

export function setSarprasIntelligenceScreen(nextScreen) {
  screen = nextScreen || 'dashboard';
  if (sections) showScreen(screen);
  notifyScreenChange();
}

/** Sprint 11.1, Workstream 2 — lets a caller (nor-center.js's retired
 *  "Generate NOR" dead end) hand text a user already typed elsewhere into
 *  the REAL conversational entry point, instead of that text being lost
 *  on redirect. Pure state seed — does not itself change the screen or
 *  start a Conversation; call setSarprasIntelligenceScreen('dashboard')
 *  separately, same "one primitive per concern" shape every other
 *  cross-screen jump in this codebase already uses. */
export function seedConversationEntry(text) {
  homeState.conversationInput = String(text || '');
}

function showScreen(id) {
  SCREEN_IDS.forEach((key) => { sections[key].style.display = key === id ? '' : 'none'; });
  if (id === 'dashboard') { sections.dashboard.innerHTML = renderDashboard(); }
  const workspace = WORKSPACES[id];
  if (workspace && !mountedState[id]) {
    mountedState[id] = { mounted: true, mount: null, close: null };
    import(workspace.modulePath).then((mod) => {
      mountedState[id].mount = mod[workspace.mountName];
      mountedState[id].close = mod[workspace.closeName];
      mountedState[id].mount(sections[id]);
    });
  } else if (workspace && mountedState[id] && mountedState[id].mount) {
    // Sprint 11 UAT gap-closure (Finding 2a) — re-show of an ALREADY-mounted
    // workspace previously only toggled `display`, never re-rendered. So a
    // reviewer who edited a document in Review Workspace and returned to the
    // Learning Dashboard saw STALE content ("the second edit never appears"),
    // because a learning-event write does not fire the dashboard's
    // knowledge-repository change listener. Re-invoking the workspace's own
    // mount() forces a fresh render: every workspace mount is idempotent by
    // construction — it guards its one-time shell/listener setup with an
    // internal `if (!mounted)` and always calls render() at the end — so
    // this only recomputes the view against current data, never duplicates
    // a listener or resets in-progress state. (The `&& .mount` guard skips
    // the case where the very first dynamic import has not resolved yet;
    // that pending import will mount on its own when it lands.)
    mountedState[id].mount(sections[id]);
  }
}

export function closeSarprasIntelligence() {
  Object.values(mountedState).forEach((entry) => { if (entry.close) entry.close(); });
}

/* ── Executive Briefing — real reads only, no new engine ──────────────── */

function todayISODate() { return new Date().toISOString().slice(0, 10); }

function safeList(fn, filter) {
  const result = fn(filter);
  return result.ok ? result.data : [];
}

/** "Apa yang terjadi hari ini?" — today-only tallies over Import Sessions,
 *  Archive Records and Knowledge Items (each already read elsewhere —
 *  Dataset Import Center, Archive Center, Learning Dashboard). */
function computeTodaySummary() {
  const today = todayISODate();
  const sessions = safeList(listImportSessions, {});
  const uploadedToday = sessions.filter((s) => String(s.createdAt || '').slice(0, 10) === today).length;
  const archiveRecords = safeList(archiveList, {});
  const archivedToday = archiveRecords.filter((r) => String(r.archivedAt || '').slice(0, 10) === today).length;
  const knowledgeItems = safeList(knowledgeList, {});
  const knowledgeToday = knowledgeItems.filter((i) => String(i.createdAt || '').slice(0, 10) === today).length;
  return { uploadedToday, archivedToday, knowledgeToday };
}

/** "Apa yang sedang berjalan?" — reuses the EXACT "in flight" derivation
 *  Dataset Import Center's own workspace view uses (renderWorkspace).
 *  Phase 2.6: in flight = not terminal, and not parked off the ladder. A
 *  cancelled or failed document is finished business; before those states
 *  existed, both kinds counted as "sedang diproses otomatis" forever, and
 *  this number could only ever go up. */
function computeRunningCount() {
  const sessions = safeList(listImportSessions, {});
  return sessions.filter((s) => !isTerminalImportSessionState(s.state) && !isOffRampStage(s.pipelineStage)).length;
}

/** "Apa yang butuh perhatian?" — sums the SAME exception queues Dataset
 *  Import Center (reviewReasons), Archive Center (flagged gaps), Knowledge
 *  Center (review/candidate queues) and NOR Center (pending overrides)
 *  each already surface on their own screens — one combined count here,
 *  never a second computation of any of them. */
function computeAttention() {
  const sessions = safeList(listImportSessions, {});
  const needsAttentionImports = sessions.filter((s) => reviewReasons(s).length > 0).length;
  const domains = listDomainTypes();
  const flaggedGaps = domains.reduce((n, d) => n + getGapsWithWorkflowState(d.id).filter((g) => g.status === GAP_STATUS.FLAGGED_FOR_UPLOAD).length, 0);
  const knowledgeReview = getReviewQueue().length + getCandidateQueue().length;
  const overrides = safeList(listOverrides, {});
  const pendingOverrides = overrides.filter((o) => o.lifecycleState === LIFECYCLE_STATE.PENDING_REVIEW).length;
  const total = needsAttentionImports + flaggedGaps + knowledgeReview + pendingOverrides;
  return {
    total, needsAttentionImports, flaggedGaps, knowledgeReview, pendingOverrides,
  };
}

/** "Apa yang telah dipelajari platform?" — reuses Learning Dashboard's own
 *  insight reads (computeLearningInsights' shape) plus its Learning
 *  Overview metrics — no second computation, same engine calls.
 *  Phase 5 — `totalCorrections` now counts REAL Learning Events (kind=
 *  CORRECTION), fed by the three genuine producers (Advanced Metadata
 *  confirmation, Knowledge Center's Request Changes, Profile Override
 *  approval). This is a different, larger number than the old dormant
 *  correction-pipeline-engine.js log — it counts corrections that actually
 *  happen in this platform today, not the narrower knowledge-payload-edit
 *  mechanism nothing has ever called. */
function computeLearnedSummary() {
  const domains = listDomainTypes();
  const datasetsImported = domains.reduce((n, d) => n + listDatasets({ domainType: d.id }).filter((ds) => ds.sourceId === manualFileSource.id).length, 0);
  const knowledgeCreated = safeList(knowledgeList, {}).filter((i) => i.sourceType === 'manual-file').length;
  const patternDiscoveries = domains.reduce((n, d) => n + computePatternRecommendations(d.id).length, 0);
  const correctionEvents = listLearningEvents({ kind: LEARNING_KIND.CORRECTION });
  const totalCorrections = correctionEvents.ok ? correctionEvents.data.length : 0;
  return {
    datasetsImported, knowledgeCreated, patternDiscoveries, totalCorrections,
  };
}

/** Part 8 — "Executive Learning". Every field here is a real aggregation
 *  over persisted Learning Events / Organization Memory / Coverage — no
 *  fabricated metric, no invented trend.
 *
 *  Trends are computed the same honest way learning-dashboard.js's own
 *  "Knowledge Growth" already documents its own limits: a real comparison
 *  of two real, dated buckets (the last 7 days vs the 7 days before), not a
 *  smoothed or modelled projection. */
function computeExecutiveLearning() {
  const domains = listDomainTypes();

  // "Most corrected knowledge" / "Most reused knowledge" — real per-domain
  // Organization Memory reports, merged and re-ranked across every domain.
  const correctedByTarget = new Map();
  const reusedByKnowledgeId = new Map();
  for (const d of domains) {
    const om = computeOrganizationalMemory(d.id, { limit: 25 });
    if (!om.ok) continue;
    for (const c of om.data.frequentlyCorrectedKnowledge) {
      const existing = correctedByTarget.get(c.key);
      if (!existing || c.count > existing.count) correctedByTarget.set(c.key, { key: c.key, count: c.count, domainType: d.id });
    }
    for (const r of om.data.frequentlyReusedKnowledge) {
      const existing = reusedByKnowledgeId.get(r.knowledgeItemId);
      if (!existing || r.referencedByCount > existing.referencedByCount) {
        reusedByKnowledgeId.set(r.knowledgeItemId, { knowledgeItemId: r.knowledgeItemId, referencedByCount: r.referencedByCount, domainType: d.id });
      }
    }
  }
  const mostCorrectedKnowledge = [...correctedByTarget.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  const mostReusedKnowledge = [...reusedByKnowledgeId.values()].sort((a, b) => b.referencedByCount - a.referencedByCount).slice(0, 3);

  // "Most frequent gaps" — real resolved+open counts per domain, from the
  // SAME gap-workflow-engine.js reads Coverage's Gap dimension already uses.
  const gapsByDomain = domains.map((d) => ({
    domainType: d.id,
    count: countResolvedGaps(d.id) + getGapsWithWorkflowState(d.id).length,
  })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);

  // "Fastest growing domains" — real createdAt-bucketed counts, same
  // derivation style learning-dashboard.js's "Knowledge Growth" already uses
  // and documents the limits of (not a true time series, a live derivation).
  const allKnowledge = safeList(knowledgeList, {});
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const growthByDomain = new Map();
  for (const item of allKnowledge) {
    const t = new Date(item.createdAt || 0).getTime();
    if (Number.isNaN(t) || t < sevenDaysAgo) continue;
    growthByDomain.set(item.domainType, (growthByDomain.get(item.domainType) || 0) + 1);
  }
  const fastestGrowingDomains = [...growthByDomain.entries()]
    .map(([domainType, count]) => ({ domainType, count }))
    .sort((a, b) => b.count - a.count).slice(0, 3);

  // Trends — a real week-over-week comparison of dated Learning Events.
  const allEvents = listLearningEvents({});
  const events = allEvents.ok ? allEvents.data : [];
  function trendFor(kind) {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const inWindow = (e, from, to) => { const t = new Date(e.observedAt).getTime(); return t >= from && t < to; };
    const thisWeek = events.filter((e) => (!kind || e.kind === kind) && inWindow(e, now - oneWeek, now)).length;
    const lastWeek = events.filter((e) => (!kind || e.kind === kind) && inWindow(e, now - 2 * oneWeek, now - oneWeek)).length;
    const direction = thisWeek > lastWeek ? 'naik' : thisWeek < lastWeek ? 'turun' : 'stabil';
    return { thisWeek, lastWeek, direction };
  }
  const learningTrend = trendFor(null);
  const correctionTrend = trendFor(LEARNING_KIND.CORRECTION);
  const knowledgeQualityTrendReport = computeCoverageReport();

  return Object.freeze({
    mostCorrectedKnowledge, mostReusedKnowledge, gapsByDomain, fastestGrowingDomains,
    learningTrend, correctionTrend, knowledgeCoveragePct: knowledgeQualityTrendReport.data.knowledgeCoverage.pct,
  });
}

/** "Apa yang harus saya lakukan selanjutnya?" — deterministic: names the
 *  single largest real attention bucket, never a fabricated ranking or an
 *  AI suggestion. Honest zero-state when nothing needs a human. */
function computeNextAction(attention) {
  if (attention.total === 0) return 'Tidak ada yang perlu tindakan Anda saat ini — semua beres.';
  const buckets = [
    { count: attention.needsAttentionImports, text: `${attention.needsAttentionImports} dokumen menunggu tinjauan Anda di Documents.` },
    { count: attention.flaggedGaps, text: `${attention.flaggedGaps} dokumen yang hilang telah ditandai untuk diunggah di Documents.` },
    { count: attention.knowledgeReview, text: `${attention.knowledgeReview} pengetahuan menunggu review — buka Settings → Knowledge Center.` },
    { count: attention.pendingOverrides, text: `${attention.pendingOverrides} override profil menunggu persetujuan di NOR.` },
  ].filter((b) => b.count > 0).sort((a, b) => b.count - a.count);
  return buckets[0].text;
}

/** Phase 3, Part 8 — this briefing used to report "0 koreksi tercatat" as a
 *  flat fact. It was not a fact: the Correction Log has no writer with a
 *  caller, so that number was structurally incapable of ever being anything but
 *  zero. An executive reading it would conclude the organization makes no
 *  corrections. What it actually means is that corrections cannot yet be made.
 *  Those are very different sentences, and only one of them is true. */
function correctionsLabel(total) {
  return total === 0
    ? `koreksi tercatat — ${dormantNote('correction-log')}`
    : 'koreksi tercatat';
}

function renderDashboard() {
  const today = computeTodaySummary();
  const running = computeRunningCount();
  const attention = computeAttention();
  const learned = computeLearnedSummary();
  const executiveLearning = computeExecutiveLearning();
  const nextAction = computeNextAction(attention);
  const quickActions = computeQuickActions(attention);

  return `
    <div class="sic-content">
      <div class="sic-page-head">
        <div>
          <div class="sic-page-crumb">SARPRAS INTELLIGENCE</div>
          <h1 class="sic-page-title">Home</h1>
          <p class="sic-page-lede">Apa yang ingin Anda lakukan hari ini?</p>
        </div>
      </div>

      ${renderSearchBar()}
      ${renderQuickActions(quickActions)}
      ${renderConversationEntry()}

      <div class="sic-card">
        <div class="sic-card-head"><div class="sic-card-h-title">Apa yang terjadi hari ini?</div></div>
        <ul class="sic-brief-list">
          <li><span class="sic-brief-count">${today.uploadedToday}</span><span class="sic-brief-label">dokumen diunggah hari ini</span></li>
          <li><span class="sic-brief-count">${today.archivedToday}</span><span class="sic-brief-label">dokumen diarsipkan hari ini</span></li>
          <li><span class="sic-brief-count">${today.knowledgeToday}</span><span class="sic-brief-label">pengetahuan baru dipelajari hari ini</span></li>
        </ul>
      </div>

      <div class="sic-card">
        <div class="sic-card-head"><div class="sic-card-h-title">Apa yang sedang berjalan?</div></div>
        <ul class="sic-brief-list">
          <li><span class="sic-brief-count">${running}</span><span class="sic-brief-label">dokumen sedang diproses otomatis</span></li>
        </ul>
      </div>

      <div class="sic-card">
        <div class="sic-card-head"><div class="sic-card-h-title">Apa yang butuh perhatian?</div></div>
        <ul class="sic-brief-list">
          <li><span class="sic-brief-count">${attention.total}</span><span class="sic-brief-label">total memerlukan tindakan Anda</span></li>
          ${attention.needsAttentionImports ? `<li><span class="sic-brief-count">${attention.needsAttentionImports}</span><span class="sic-brief-label">dokumen di Documents</span></li>` : ''}
          ${attention.flaggedGaps ? `<li><span class="sic-brief-count">${attention.flaggedGaps}</span><span class="sic-brief-label">dokumen hilang ditandai di Documents</span></li>` : ''}
          ${attention.knowledgeReview ? `<li><span class="sic-brief-count">${attention.knowledgeReview}</span><span class="sic-brief-label">pengetahuan menunggu tinjauan (Settings → Knowledge Center)</span></li>` : ''}
          ${attention.pendingOverrides ? `<li><span class="sic-brief-count">${attention.pendingOverrides}</span><span class="sic-brief-label">override profil di NOR</span></li>` : ''}
        </ul>
      </div>

      <div class="sic-card">
        <div class="sic-card-head"><div class="sic-card-h-title">Apa yang telah dipelajari platform?</div></div>
        <ul class="sic-brief-list">
          <li><span class="sic-brief-count">${learned.datasetsImported}</span><span class="sic-brief-label">dataset diimpor</span></li>
          <li><span class="sic-brief-count">${learned.knowledgeCreated}</span><span class="sic-brief-label">pengetahuan dibuat dari dokumen</span></li>
          <li><span class="sic-brief-count">${learned.patternDiscoveries}</span><span class="sic-brief-label">pola baru ditemukan</span></li>
          <li><span class="sic-brief-count">${learned.totalCorrections}</span><span class="sic-brief-label">${esc(correctionsLabel(learned.totalCorrections))}</span></li>
        </ul>
      </div>

      <div class="sic-card">
        <div class="sic-card-head"><div class="sic-card-h-title">Wawasan Pembelajaran (Executive Learning)</div></div>
        <ul class="sic-brief-list">
          <li><span class="sic-brief-count">${executiveLearning.knowledgeCoveragePct}%</span><span class="sic-brief-label">cakupan pengetahuan (tren minggu ini: ${executiveLearning.correctionTrend.thisWeek} koreksi, ${esc(executiveLearning.correctionTrend.direction)} dari minggu lalu)</span></li>
          <li><span class="sic-brief-count">${executiveLearning.learningTrend.thisWeek}</span><span class="sic-brief-label">peristiwa pembelajaran minggu ini (${esc(executiveLearning.learningTrend.direction)} dari ${executiveLearning.learningTrend.lastWeek} minggu lalu)</span></li>
        </ul>
        ${executiveLearning.mostCorrectedKnowledge.length ? `
        <div class="sic-brief-sub">Paling sering dikoreksi</div>
        <ul class="sic-brief-list">
          ${executiveLearning.mostCorrectedKnowledge.map((x) => `<li><span class="sic-brief-count">${x.count}×</span><span class="sic-brief-label">${esc(x.key)} (${esc(x.domainType)})</span></li>`).join('')}
        </ul>` : ''}
        ${executiveLearning.mostReusedKnowledge.length ? `
        <div class="sic-brief-sub">Paling sering digunakan ulang</div>
        <ul class="sic-brief-list">
          ${executiveLearning.mostReusedKnowledge.map((x) => `<li><span class="sic-brief-count">${x.referencedByCount}×</span><span class="sic-brief-label">${esc(x.knowledgeItemId)}</span></li>`).join('')}
        </ul>` : ''}
        ${executiveLearning.gapsByDomain.length ? `
        <div class="sic-brief-sub">Domain dengan gap terbanyak</div>
        <ul class="sic-brief-list">
          ${executiveLearning.gapsByDomain.map((x) => `<li><span class="sic-brief-count">${x.count}</span><span class="sic-brief-label">${esc(x.domainType)}</span></li>`).join('')}
        </ul>` : ''}
        ${executiveLearning.fastestGrowingDomains.length ? `
        <div class="sic-brief-sub">Domain tumbuh tercepat (7 hari terakhir)</div>
        <ul class="sic-brief-list">
          ${executiveLearning.fastestGrowingDomains.map((x) => `<li><span class="sic-brief-count">${x.count}</span><span class="sic-brief-label">${esc(x.domainType)}</span></li>`).join('')}
        </ul>` : ''}
        ${!executiveLearning.mostCorrectedKnowledge.length && !executiveLearning.mostReusedKnowledge.length && !executiveLearning.gapsByDomain.length && !executiveLearning.fastestGrowingDomains.length
          ? '<p class="wlk-page-lede" style="margin-top:0;">Belum cukup aktivitas untuk menampilkan wawasan lebih lanjut — boleh jujur menunjukkan ini.</p>' : ''}
      </div>

      <div class="sic-card sic-card--next">
        <div class="sic-card-head"><div class="sic-card-h-title">Apa yang harus saya lakukan selanjutnya?</div></div>
        <p class="sic-next-action">${esc(nextAction)}</p>
      </div>

      ${isDeveloperMode() ? renderPipelineTrace() : ''}
      ${isDeveloperMode() ? renderTechnicalDiagnostics() : ''}
    </div>`;
}

/** Phase 10.5, Part 6 — Developer Pipeline Viewer. Displays the COMPLETE
 *  trace of the most recent Problem Solving pipeline call, end to end:
 *  User Input -> Problem Classification -> Extracted Entities -> Confidence
 *  -> Diagnostic Plan -> Knowledge Gap -> Conversation State -> Reasoning
 *  Chain -> Recommendation -> Current Workflow -> Final Output. Every field
 *  here is a direct read of `homeState.lastPipelineTrace` — set once, by
 *  handleProblemSubmit()/handleProblemAnswerSubmit()/the NOR-compose
 *  handler, from the REAL pipeline's own real return values. No new
 *  computation, no second interpretation — the same "genuinely ADDITIVE
 *  technical detail, never a second dashboard" discipline
 *  renderTechnicalDiagnostics() already established (Sprint 1). */
function renderPipelineTrace() {
  const t = homeState.lastPipelineTrace;
  if (!t) {
    return `
    <div class="sic-card">
      <div class="sic-card-head"><div class="sic-card-h-title">Developer Pipeline Viewer</div></div>
      <p class="sic-next-action">Belum ada permintaan yang diproses pada sesi ini.</p>
    </div>`;
  }
  if (t.error) {
    return `
    <div class="sic-card">
      <div class="sic-card-head"><div class="sic-card-h-title">Developer Pipeline Viewer</div></div>
      <p class="sic-next-action">Input: "${esc(t.utterance || '')}" — error: ${esc(t.error.code)} — ${esc(t.error.message)}</p>
    </div>`;
  }

  const rows = [];
  if (t.utterance) rows.push(['User Input', t.utterance]);
  if (t.category) rows.push(['Problem Classification', `${t.category} (confidence ${(t.categoryConfidence || 0).toFixed(2)})`]);
  if (t.problem) rows.push(['Extracted Entities', JSON.stringify(t.problem.facts)]);
  if (t.diagnosticPlan) {
    rows.push(['Diagnostic Plan — confidence', t.diagnosticPlan.confidence.toFixed(2)]);
    rows.push(['Diagnostic Plan — recommended next question', t.diagnosticPlan.recommendedNextQuestion ? t.diagnosticPlan.recommendedNextQuestion.prompt : '(none)']);
  }
  const gaps = (t.diagnosticPlan && t.diagnosticPlan.missingInformation) || (t.plan && t.plan.missingInformation) || [];
  if (gaps.length) rows.push(['Knowledge Gap', gaps.map((g) => `${g.gapType} (${g.priority})`).join(', ')]);
  if (t.conversation) rows.push(['Conversation State', `${t.conversation.state} — intent: ${t.conversation.currentIntent.intent}`]);
  const hyps = t.hypotheses || (t.plan && t.plan.hypotheses) || [];
  if (hyps.length) rows.push(['Reasoning Chain — hypotheses', hyps.map((h) => `${h.cause} [${h.status}, ${Math.round(h.likelihood * 100)}%]`).join(' | ')]);
  const rec = t.recommendation;
  if (rec) rows.push(['Recommendation', `${rec.claim} (confidence ${rec.confidence.toFixed(2)})`]);
  if (t.routingDecision) rows.push(['Current Workflow', `${t.routingDecision.route} — ${t.routingDecision.reason}`]);
  if (t.downstreamNote) rows.push(['Final Output', t.downstreamNote]);
  // Phase 10, Sprint 10.1 — this used to be a bare section COUNT
  // (`ComposerDocument {id} (19 sections)`), Sprint 9.8's own named example
  // of the platform's missing review surface. Now lists every section's
  // real field/value, and points to the Review Workspace as the actual
  // place to review, edit, and (Sprint 10.4+) approve it.
  if (t.composerDocument) {
    rows.push(['Final Output', `ComposerDocument ${t.composerDocument.documentId} (v${t.composerDocument.version}) — lihat Settings → Review Workspace untuk pratinjau lengkap.`]);
    t.composerDocument.sections.forEach((s) => rows.push([`Section — ${s.field}`, s.value]));
  }
  if (t.isComplete !== undefined) rows.push(['Conversation State', t.isComplete ? 'complete' : 'in progress']);

  return `
    <div class="sic-card">
      <div class="sic-card-head"><div class="sic-card-h-title">Developer Pipeline Viewer</div></div>
      <ul class="sic-brief-list">
        ${rows.map(([label, value]) => `<li><span class="sic-brief-label"><strong>${esc(label)}:</strong> ${esc(String(value))}</span></li>`).join('')}
      </ul>
    </div>`;
}

/** Sprint 1 (Autonomy Closure, Part 1) — replaces the old static roadmap
 *  entirely (a second, duplicated "which module is done" identity is
 *  exactly what Sprint 0 already diagnosed as wrong — gating it behind
 *  Developer Mode didn't fix that). This is genuinely ADDITIVE technical
 *  detail on top of the SAME Executive Briefing, never a second dashboard:
 *  real session counts by raw pipeline stage, registered domain/kind
 *  counts, and a live count of the exact "stuck at Approved" cascade
 *  failure Part 4 makes visible for the first time. Every number here is
 *  a direct read of data already loaded elsewhere on this page — no new
 *  engine, no estimation. */
/** Phase 2.6 — the stage histogram now covers the OFF-RAMPS too. It used to
 *  iterate PIPELINE_STAGE_ORDER only, so a cancelled, failed, or
 *  awaiting-evidence session was counted nowhere and simply vanished from the
 *  diagnostic — the very sessions an operator most needs to see. `retrying`
 *  replaces the old `stalledCascades` counter: a failing automatic step is now
 *  a bounded, visible retry that ends in a real FAILED terminal, not an
 *  unbounded stall with no name. */
const ALL_DIAGNOSTIC_STAGES = Object.freeze([...PIPELINE_STAGE_ORDER, ...PIPELINE_OFF_RAMP_STAGES]);

function computeTechnicalDiagnostics() {
  const sessions = safeList(listImportSessions, {});
  const byStage = {};
  ALL_DIAGNOSTIC_STAGES.forEach((stage) => { byStage[stage] = 0; });
  sessions.forEach((s) => {
    const stage = effectiveStage(s);
    byStage[stage] = (byStage[stage] || 0) + 1;
  });
  const retrying = sessions.filter((s) => (s.pipelineAttempts || 0) > 0 && !isTerminalImportSessionState(s.state)).length;
  const stuck = sessions.filter((s) => !isTerminalImportSessionState(s.state) && !isOffRampStage(effectiveStage(s))).length;
  return {
    totalSessions: sessions.length,
    byStage,
    retrying,
    stuck,
    domainTypeCount: listDomainTypes().length,
    kindCount: listKinds().length,
    // Phase 6.5 (Part 8) — real Worker Health, read straight off the
    // Performance Collector (never recomputed here). `sweepPipeline()` is
    // deliberately event-driven, never polled (see pipeline-scheduler.js's
    // own header) — there is no fixed tick interval, so "Sweep" replaces
    // "Tick" in the labels below to avoid implying one exists.
    workerHealth: getWorkerHealth(),
  };
}

function renderTechnicalDiagnostics() {
  const diag = computeTechnicalDiagnostics();
  const wh = diag.workerHealth;
  const stageRows = ALL_DIAGNOSTIC_STAGES.map((stage) => `
    <li><span class="sic-brief-count">${diag.byStage[stage] || 0}</span><span class="sic-brief-label">${esc(stage)}</span></li>`).join('');

  return `
    <div class="sic-card">
      <div class="sic-card-head">
        <div class="sic-card-h-title">Diagnostik Teknis (Developer Mode)</div>
        <div class="sic-card-h-sub">Total ${diag.totalSessions} Import Session · ${diag.domainTypeCount} domain terdaftar · ${diag.kindCount} kind terdaftar.</div>
      </div>
      <ul class="sic-brief-list">${stageRows}</ul>
      <ul class="sic-brief-list">
        <li><span class="sic-brief-count">${diag.retrying}</span><span class="sic-brief-label">sesi sedang dicoba ulang otomatis oleh scheduler</span></li>
        <li><span class="sic-brief-count">${diag.stuck}</span><span class="sic-brief-label">sesi masih bergerak di pipeline (bukan terminal, bukan menunggu bukti)</span></li>
      </ul>
      <div class="sic-card-h-title" style="margin-top:12px;">Worker Health (Scheduler — event-driven, tidak ada polling)</div>
      <ul class="sic-brief-list">
        <li><span class="sic-brief-count">${wh.queueSize}</span><span class="sic-brief-label">antrean aktif (belum terminal, bukan menunggu bukti)</span></li>
        <li><span class="sic-brief-count">${wh.awaitingEvidence}</span><span class="sic-brief-label">menunggu bukti manusia</span></li>
        <li><span class="sic-brief-count">${wh.runningBatches}</span><span class="sic-brief-label">batch sedang diproses</span></li>
        <li><span class="sic-brief-count">${wh.pausedBatches}</span><span class="sic-brief-label">batch dijeda</span></li>
        <li><span class="sic-brief-count">${wh.cancelledBatches}</span><span class="sic-brief-label">batch dibatalkan</span></li>
        <li><span class="sic-brief-count">${wh.retryCount}</span><span class="sic-brief-label">total automatic retry (semua sesi)</span></li>
        <li><span class="sic-brief-count">${wh.sweepCount}</span><span class="sic-brief-label">sweep nyata sejak tab ini dibuka</span></li>
        <li><span class="sic-brief-count">${wh.lastSweepDurationMs === null ? '—' : wh.lastSweepDurationMs + ' ms'}</span><span class="sic-brief-label">durasi sweep terakhir</span></li>
        <li><span class="sic-brief-count">${wh.averageSweepDurationMs === null ? '—' : wh.averageSweepDurationMs + ' ms'}</span><span class="sic-brief-label">rata-rata durasi sweep</span></li>
        <li><span class="sic-brief-count">${wh.lastSweepAt || '—'}</span><span class="sic-brief-label">waktu sweep terakhir</span></li>
      </ul>
    </div>`;
}
