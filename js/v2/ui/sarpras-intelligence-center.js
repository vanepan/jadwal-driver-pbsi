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
import {
  initImportSessionSync, initImportBatchSync,
  registerImportSessionChangeListener, registerImportBatchChangeListener,
  sweepPipeline,
} from '../knowledge/services/import-session-service.js';
import { initFileStorageSync } from '../file-storage/file-storage-registry.js';
// Phase 2.5 Part 3 — make the in-memory knowledge repo a deterministic
// projection of the persisted Import Sessions, so imported Knowledge
// survives a refresh (and picks up another tab's RTDB-hydrated sessions).
import { rehydrateKnowledgeFromSessions } from '../knowledge/datasets/import-session/knowledge-rehydration-engine.js';

// Executive Briefing data sources — every one of these is already imported
// and used by an existing workspace file (see each import's origin below);
// this file only COMPOSES them into five plain-language questions, it
// never recomputes what an engine already computes.
import { reviewReasons, effectiveStage } from './dataset-import-center.js';
import { listImportSessions } from '../knowledge/datasets/import-session/import-session-engine.js';
import {
  IMPORT_SESSION_STATE, PIPELINE_STAGE_ORDER, PIPELINE_OFF_RAMP_STAGES,
  isTerminalImportSessionState, isOffRampStage,
} from '../knowledge/datasets/import-session/contracts/import-session-contract.js';
import { listArchive as archiveList, getGapsWithWorkflowState, GAP_STATUS } from '../organizational-memory/index.js';
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
import { computeOrganizationalMemory } from '../organizational-memory/organizational-memory-engine.js';
import { computeCoverageReport } from '../organizational-memory/coverage-engine.js';
import { countResolvedGaps } from '../organizational-memory/gap-workflow-engine.js';
// Phase 3, Part 8 — see js/v2/dormant-subsystems.js. This briefing used to
// count the OLD correction log's always-zero value.
import { dormantNote } from '../dormant-subsystems.js';
import { esc, isDeveloperMode, setPresentationMode } from './shared/workspace-list-kit.js';

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
        sweepPipeline();
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
  // #nor / #archive / #knowledge / #learning are left empty — each nested
  // workspace module owns its own content once mounted (see WORKSPACES).
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

export function setSarprasIntelligenceScreen(nextScreen) {
  screen = nextScreen || 'dashboard';
  if (sections) showScreen(screen);
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
    { count: attention.needsAttentionImports, text: `${attention.needsAttentionImports} dokumen impor menunggu tinjauan Anda di Dataset Import Center.` },
    { count: attention.flaggedGaps, text: `${attention.flaggedGaps} dokumen yang hilang telah ditandai untuk diunggah di Archive Center.` },
    { count: attention.knowledgeReview, text: `${attention.knowledgeReview} pengetahuan menunggu review di Knowledge Center.` },
    { count: attention.pendingOverrides, text: `${attention.pendingOverrides} override profil menunggu persetujuan di NOR Center.` },
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

  return `
    <div class="sic-content">
      <div class="sic-page-head">
        <div>
          <div class="sic-page-crumb">SARPRAS INTELLIGENCE</div>
          <h1 class="sic-page-title">Ringkasan</h1>
          <p class="sic-page-lede">Organizational Learning Platform</p>
        </div>
      </div>

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
          ${attention.needsAttentionImports ? `<li><span class="sic-brief-count">${attention.needsAttentionImports}</span><span class="sic-brief-label">di Dataset Import Center</span></li>` : ''}
          ${attention.flaggedGaps ? `<li><span class="sic-brief-count">${attention.flaggedGaps}</span><span class="sic-brief-label">di Archive Center</span></li>` : ''}
          ${attention.knowledgeReview ? `<li><span class="sic-brief-count">${attention.knowledgeReview}</span><span class="sic-brief-label">di Knowledge Center</span></li>` : ''}
          ${attention.pendingOverrides ? `<li><span class="sic-brief-count">${attention.pendingOverrides}</span><span class="sic-brief-label">di NOR Center</span></li>` : ''}
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

      ${isDeveloperMode() ? renderTechnicalDiagnostics() : ''}
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
  };
}

function renderTechnicalDiagnostics() {
  const diag = computeTechnicalDiagnostics();
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
    </div>`;
}
