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
import { initFileStorageSync } from '../file-storage/file-storage-registry.js';
// Phase 10, Sprint 10.1 — the Review Workspace's foundation: a
// ComposerDocument (a composed NOR draft) must survive a refresh for a
// human reviewer to come back to it, same "activate once, at Sarpras
// Intelligence's own mount" idiom as every init*Sync() call in this block.
import { initComposerDocumentSync, registerChangeListener as registerComposerChangeListener } from '../document-intelligence/composer/composer-document-repository.js';
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
import { rehydrateLearningFromDocuments } from '../document-intelligence/composer/reviewer-edit-rehydration-engine.js';

// Phase 2, Stage 1 (Prompt -> Generate Foundation) dead-code verification —
// the old Executive Briefing data sources this comment used to introduce
// (archiveList, getGapsWithWorkflowState, GAP_STATUS, getReviewQueue,
// getCandidateQueue, listOverrides, LIFECYCLE_STATE, listDatasets,
// manualFileSource, computePatternRecommendations, listLearningEvents,
// LEARNING_KIND, computeOrganizationalMemory, computeCoverageReport,
// countResolvedGaps, knowledgeList) are removed: repo-wide grep confirmed
// zero remaining callers anywhere once computeTodaySummary/
// computeRunningCount/computeAttention/computeLearnedSummary/
// computeExecutiveLearning/computeNextAction were deleted below — see
// that deletion's own comment for the verification evidence. Technical
// Diagnostics (Developer Mode) still needs a few of the SAME source
// imports below (effectiveStage, listImportSessions, isTerminalImport-
// SessionState, isOffRampStage, listDomainTypes) — those are kept.
import { effectiveStage, runReanalysisSweep } from './dataset-import-center.js';
import { listImportSessions } from '../knowledge/datasets/import-session/import-session-engine.js';
import {
  IMPORT_SESSION_STATE, PIPELINE_STAGE_ORDER, PIPELINE_OFF_RAMP_STAGES,
  isTerminalImportSessionState, isOffRampStage,
} from '../knowledge/datasets/import-session/contracts/import-session-contract.js';
import { listDomainTypes } from '../knowledge/registry/domain-type-registry.js';
import { listKinds } from '../knowledge/registry/kind-registry.js';
import { discoverAndRecordPatterns } from '../knowledge/services/pattern-discovery-service.js';
// Part 5 (Search-first): one aggregator over three already-real services —
// see global-search-service.js's own header for why it invents nothing.
import { globalSearch } from './services/global-search-service.js';
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
} from '../intake/services/problem-solving-service.js';
import { WORKFLOW_ROUTE } from '../intake/contracts/workflow-route-contract.js';
import { HYPOTHESIS_STATUS } from '../reasoning/contracts/hypothesis-contract.js';
// Sprint 11.1, Workstream 3 — the one legal ui/ -> V1 edge for date
// formatting (js/v2/README.md's dependency graph; nor-center.js already
// uses this exact same edge, same functions).
import { fmtLong, todayISO } from '../../js/petty-cash/petty-cash-config.js';
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
// Phase 2, Stage 1 (Prompt -> Generate Foundation) — `conversation` and
// `missingFactAnswers` are gone: a CREATE_NOR-mapped Conversation no longer
// pauses on a missing-facts form (see attemptGenerateDraft() below) —
// generation is attempted immediately, and whatever is still genuinely
// unknown is left honestly blank for the Workspace to complete, never
// interviewed for first. `searchResult` stays (the prompt box itself can
// still route to Search — see WORKFLOW_ROUTE.SEARCH below); the old
// standalone search input is gone.
const homeState = {
  searchInput: '', searchResult: null,
  conversationInput: '', conversationError: null,
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

/** Phase 2, Stage 1 — the prompt itself can still route to Search
 *  (WORKFLOW_ROUTE.SEARCH, handled in handleProblemSubmit()); this renders
 *  ONLY the results, reused verbatim from the old standalone search bar's
 *  own results markup — the dedicated input/button are gone (one prompt
 *  field, not two entry points). */
function renderSearchResults() {
  const r = homeState.searchResult;
  if (!r) return '';
  const sections2 = [
    r.documents.length ? { title: 'Dokumen', items: r.documents.map((d) => `${d.filename} — ${stageLabelForSearch(d)}`) } : null,
    r.archive.length ? { title: 'Arsip', items: r.archive.map((a) => `${a.documentNumber || a.id}`) } : null,
    r.knowledge.length ? { title: 'Pengetahuan', items: r.knowledge.map((k) => `${k.kind} — ${k.id}`) } : null,
  ].filter(Boolean);
  return r.total > 0 ? `
    <div class="sic-search-results">
      ${sections2.map((s) => `
        <div class="sic-brief-sub">${esc(s.title)}</div>
        <ul class="sic-brief-list">${s.items.map((t) => `<li><span class="sic-brief-label">${esc(t)}</span></li>`).join('')}</ul>`).join('')}
    </div>` : `<p class="sic-next-action">Tidak ada hasil untuk "${esc(r.query)}".</p>`;
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
 *
 *  Phase 2, Stage 1 (Prompt -> Generate Foundation) — promoted from the 4th
 *  element on a stats-heavy dashboard to the single primary element on Home.
 *  Heading follows the brief's own literal wording ("What would you like to
 *  create?") while keeping the box's existing, broader dual purpose (it
 *  also carries diagnostic/facility utterances that create nothing) — see
 *  the placeholder text, unchanged. */
function renderConversationEntry() {
  return `
    <div class="sic-card sic-card--conversation">
      <div class="sic-card-head"><div class="sic-card-h-title">Apa yang ingin Anda buat?</div></div>
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
 *  Part 2 forbids; the Problem Router already decided, once).
 *
 *  Phase 2, Stage 1 (Prompt -> Generate Foundation) — a CREATE_NOR-mapped
 *  Conversation is no longer a state rendered here at all: attemptGenerateDraft()
 *  (called straight from handleProblemSubmit()) already resolved it to
 *  either a Workspace navigation (success) or homeState.conversationError
 *  (a genuine "cannot reasonably be generated" case, e.g. no Approved
 *  Knowledge yet for this document type) before this function ever runs.
 *  What's left to route here is exactly the brief's own narrower definition
 *  of "questions": an unclassifiable utterance (clarification) or a
 *  non-document diagnostic/fact-gathering turn (problemConversationTurn) —
 *  both already one-at-a-time, natural language, never a form. */
function renderRoutedResult() {
  if (homeState.clarification) return renderClarificationResult();
  if (homeState.problemConversationTurn) return renderProblemConversationTurn();
  return renderSearchResults();
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
  homeState.problemConversationTurn = null;
  homeState.answeredFacts = {};
  homeState.askedFields = [];
  homeState.problemAnswerInput = '';
  homeState.clarification = null;
  homeState.activeProblem = null;
  homeState.activeRoute = null;
  homeState.activeCategory = null;
  homeState.searchResult = null;
}

/** Phase 10.5, Part 1/2 — the Home Entry Point. Never rejects an utterance
 *  before Problem Classification: beginProblemSolving() itself only ever
 *  fails on a genuinely empty/invalid input (a real input error, checked
 *  below the same way it always was), never on "not recognized" — an
 *  unclassifiable PROBLEM routes to Clarification instead (see
 *  problem-router.js).
 *
 *  Phase 2, Stage 1 (Prompt -> Generate Foundation), Performance — the
 *  Workspace's own module (and its transitive doc-engine.js/pdfmake
 *  dependencies) starts loading HERE, in parallel with classification and
 *  composition below, instead of only starting after composition succeeds.
 *  Dynamic import() is cached by specifier — attemptGenerateDraft() below
 *  reuses this exact same promise, so this is never a double fetch, only an
 *  earlier one. Nothing here blocks Workspace opening except generation
 *  itself, per the brief's own Performance section. */
function handleProblemSubmit() {
  const utterance = homeState.conversationInput.trim();
  if (!utterance) { homeState.conversationError = 'Ketik dulu apa yang ingin Anda lakukan.'; sections.dashboard.innerHTML = renderDashboard(); return; }

  const workspaceModulePrefetch = import('./review-workspace.js');

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
      // Part 2 — reuses the EXISTING, real search results renderer, never a
      // second search implementation.
      homeState.searchInput = data.searchQuery || utterance;
      homeState.searchResult = globalSearch(homeState.searchInput);
      break;
    case WORKFLOW_ROUTE.KNOWLEDGE_ACQUISITION:
      // Part 2 — reuses the EXISTING Archive Center navigation, the same
      // destination the old "Unggah Dokumen" quick action used to.
      setSarprasIntelligenceScreen('archive');
      return; // setSarprasIntelligenceScreen already re-renders via showScreen
    case WORKFLOW_ROUTE.CONVERSATION:
      // Phase 2, Stage 1 — Draft Generation begins immediately: a real
      // Conversation (intent confirmed) is always already at least ACTIVE
      // the moment it exists (conversation-service.js#advance() never
      // returns anything earlier) — composeApprovedNor(allowIncomplete:true)
      // already tolerates arbitrarily incomplete gatheredFacts, so there is
      // nothing left to interview for first. No form, no manual click.
      if (data.conversation) { attemptGenerateDraft(data.conversation.id, workspaceModulePrefetch); return; }
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

/** Phase 2, Stage 1 (Prompt -> Generate Foundation) — Draft Generation.
 *  Replaces the old two-step "show a form, wait for a click" flow: fires
 *  the instant a real Conversation exists, using the SAME allowIncomplete
 *  semantics Sprint 11.10 already built and proved safe (nor-composer.js
 *  already tolerates arbitrarily incomplete gatheredFacts — every
 *  unresolved pattern slot becomes an honest UNRESOLVED_MARKER, never a
 *  fabricated guess; review-workspace.js already renders that as a "Klik
 *  untuk mengisi…" placeholder). This is a deliberate reversal of Sprint
 *  11.10 / Phase 12.8.x Sprint 1's considered opt-in-by-default decision
 *  (both explicitly weighed "a mostly-blank document with no guidance" as
 *  a real risk) — Phase 2, Stage 1's own brief is explicit ("Generation
 *  begins immediately"), and the Workspace is now the place that guidance
 *  lives instead of a pre-generation form.
 *
 *  Only genuinely fails when a draft truly cannot be generated (e.g. no
 *  Approved Knowledge exists yet for this document type) — an honest
 *  message, never a fabricated draft, never a question with nothing real
 *  to ask. */
function attemptGenerateDraft(conversationId, workspaceModulePrefetch) {
  const composed = composeApprovedNor(conversationId, {
    formattingFacts: { tanggalPanjang: fmtLong(todayISO()) },
    allowIncomplete: true,
  });
  if (!composed.ok) {
    homeState.conversationError = composed.error.message;
    sections.dashboard.innerHTML = renderDashboard();
    return;
  }
  homeState.lastPipelineTrace = { stage: 'compose', ...composed.data };
  const documentId = composed.data.composerDocument.documentId;
  (workspaceModulePrefetch || import('./review-workspace.js')).then((mod) => {
    mod.openReviewDocument(documentId);
    setSarprasIntelligenceScreen('review');
  });
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
  if (el.dataset.act === 'sic-conv-start') { handleProblemSubmit(); return; }
  if (el.dataset.act === 'sic-pc-answer-submit') { handleProblemAnswerSubmit(); return; }
}

/** Keystrokes update state only — never a re-render (see
 *  renderConversationEntry's own comment). Submission (click/Enter) is the
 *  only thing that redraws. */
function onDashboardInput(e) {
  if (e.target.dataset.act === 'sic-conv-input') homeState.conversationInput = e.target.value;
  if (e.target.dataset.act === 'sic-pc-answer-input') homeState.problemAnswerInput = e.target.value;
}

function onDashboardKeydown(e) {
  if (e.key !== 'Enter') return;
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
  // Home's own interactive elements (the prompt/Conversation entry, the
  // secondary nav row) — one delegated listener set on the persistent
  // screen container, same idiom every nested workspace already uses on
  // its own host.
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

/** Shared by Technical Diagnostics (Developer Mode, below) — a defensive
 *  read that never throws the render if an engine call fails. */
function safeList(fn, filter) {
  const result = fn(filter);
  return result.ok ? result.data : [];
}

/** Phase 2, Stage 1 (Prompt -> Generate Foundation) dead-code verification
 *  — this is the second, final pass over the five-card Executive Briefing
 *  (today/running/attention/learned/executive learning) this stage's own
 *  Home rewrite stopped calling. computeTodaySummary/computeRunningCount/
 *  computeAttention/computeLearnedSummary/computeExecutiveLearning/
 *  computeNextAction (and the now-solely-theirs helper todayISODate) were
 *  first kept-but-uncalled, per this stage's own "do not delete living
 *  code" rule, until their production-caller status could be verified
 *  directly rather than assumed. That verification: a repo-wide grep for
 *  each function's name found matches in exactly ONE file (this one), and
 *  within this file each name appeared on exactly its own definition
 *  line — no call site anywhere, including from each other (computeAttention
 *  was never called, so even computeNextAction's own dependency chain was
 *  already fully dead). None are exported. They served no other screen or
 *  runtime flow — the Executive Briefing card they computed for was Home's
 *  only caller, and Home no longer has one. Deleted here, along with every
 *  import that only these six functions kept alive (see the import
 *  section's own matching comment above for that list) — safeList is the
 *  one helper from this old section kept, because Technical Diagnostics
 *  (below) still calls it. */
function renderDashboard() {
  return `
    <div class="sic-content">
      ${renderConversationEntry()}
      ${renderSecondaryNav()}
      ${isDeveloperMode() ? renderPipelineTrace() : ''}
      ${isDeveloperMode() ? renderTechnicalDiagnostics() : ''}
    </div>`;
}

/** The one deliberately quiet remainder of navigation — plain text links,
 *  not buttons, not cards, so Archive/Knowledge/Learning/Settings stay
 *  reachable without Home becoming a second dashboard. */
function renderSecondaryNav() {
  const links = [
    { id: 'archive', label: 'Arsip' },
    { id: 'knowledge', label: 'Pengetahuan' },
    { id: 'learning', label: 'Pembelajaran' },
    { id: 'settings', label: 'Pengaturan' },
  ];
  return `
    <div class="sic-secondary-nav">
      ${links.map((l) => `<button class="sic-secondary-nav-link" data-act="sic-nav" data-id="${esc(l.id)}" type="button">${esc(l.label)}</button>`).join('')}
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
