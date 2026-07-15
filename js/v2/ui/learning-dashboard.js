/* ============================================================
   LEARNING-DASHBOARD.JS — Learning Dashboard workspace (V2.0.18)

   Sibling of NOR Center / Archive Center / Knowledge Center under Sarpras
   Intelligence — mounted by ./sarpras-intelligence-center.js when its
   "learning" screen is shown.

   REUSE, NEVER DUPLICATE: every metric here is either a DIRECT read of an
   existing engine's output (Learning Overview, Confidence Distribution,
   Learning Health, Knowledge Distribution) or a thin COMPOSITION over
   already-real data the caller joins together (Knowledge Growth, Approval/
   Correction Rate, Profile/Dataset Coverage, Top Corrections, Most Active
   Domains) — no new number is invented, and nothing here computes what an
   existing engine already computes.

   The single clearest "connect, don't invent" case in this whole sprint:
   `buildLearningMetrics()` (knowledge/learning/contracts/
   learning-metrics-contract.js) was already correct and already had a
   matching-shape data source (correction-pipeline-engine.js#listCorrectionLog),
   but nothing in the codebase ever called the two together before this file.

   NON-GOALS: no historical snapshot store exists, so "Knowledge Growth" is
   a day-bucketed derivation from each item's `createdAt`, not a true
   time-series computed from periodic snapshots — documented, not hidden.
   ============================================================ */

'use strict';

import { buildLearningMetrics } from '../knowledge/learning/contracts/learning-metrics-contract.js';
import { listCorrectionLog } from '../knowledge/learning/correction-pipeline-engine.js';
// Phase 3, Part 8 — the Correction Log is officially DORMANT (its writer has no
// caller yet). It must SAY so rather than render a confident, permanent zero.
import { dormantNote } from '../dormant-subsystems.js';
import { computeHealthReport } from '../knowledge/metrics/knowledge-metrics-engine.js';
import {
  listKnowledge as knowledgeList,
  getKnowledge as knowledgeGetById,
  getKnowledgeHistory as knowledgeGetHistory,
  getKnowledgeMetrics as knowledgeGetMetrics,
  registerKnowledgeListener as registerRepositoryListener,
} from '../knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE, LIFECYCLE_STATE_DEFS } from '../knowledge/contracts/lifecycle-contract.js';
import { listDomainTypes, getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { getCandidateQueue, getReviewQueue } from '../knowledge/review/review-queue-engine.js';
import { profiles } from '../knowledge/services/index.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import { getComposerTimeline } from '../document-intelligence/composer/composer-store.js';
import { computePatternRecommendations } from '../knowledge/services/pattern-discovery-service.js';
import { manualFileSource } from '../knowledge/connectors/manual-file-connector.js';
import { listOverrides } from '../knowledge/services/profile-override-service.js';
import { getKind } from '../knowledge/registry/kind-registry.js';
// Phase 5 — the six explainable Coverage dimensions (Part 7) and the
// eight-fact Organization Memory report (Part 5), replacing the old
// three-different-percentages-called-"Coverage" and giving Organization
// Memory a real, reachable reader.
import { computeCoverageReport } from '../organizational-memory/coverage-engine.js';
import { computeOrganizationalMemory } from '../organizational-memory/organizational-memory-engine.js';
import { listLearningEvents, LEARNING_KIND, CORRECTION_TYPE } from '../learning/services/learning-service.js';
// Autonomous Experience (Part 10) — "Today the platform learned..." reads
// real batch-level duplicate tallies (ImportBatchRecord.duplicate), the one
// piece of today's real activity Learning Events don't themselves carry.
import { listBatches } from '../knowledge/datasets/import-session/import-batch-engine.js';

import {
  esc, renderEmptyState, renderTabShell, renderRowList, renderStatCards, renderKvList, renderFilterBar,
  deriveRejectedFromCandidateQueue, isDeveloperMode,
} from './shared/workspace-list-kit.js';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rates', label: 'Approval &amp; Coverage' },
  { id: 'activity', label: 'Aktivitas' },
  { id: 'distribution', label: 'Distribusi' },
  { id: 'queues', label: 'Antrean' },
  // Phase 5, Part 5 — Organization Memory is a first-class domain now, so it
  // gets a real, reachable tab — not a number computed and never displayed
  // (exactly the "writer > 0, reader = 0" defect this whole mission exists
  // to eliminate, applied to the engine THIS phase itself just built).
  { id: 'organization', label: 'Memori Organisasi' },
];

const st = { section: 'overview', omDomain: null };

let host = null;
let contentEl = null;
let mounted = false;

/* ── Phase 2.5 Part 3+7 — event-driven synchronization ──────────────
   Subscribe to the knowledge repository's Repository Events so the
   draft-aware tiles (Knowledge Created, Datasets Imported, Growth,
   Distribution) update live when an import or a rehydration creates
   knowledge — instead of showing a stale first-visit snapshot. Coalesced
   to O(1) redraws per burst; deterministic, never polling. */
let _renderTimer = null;
function scheduleRender() {
  if (_renderTimer) return;
  _renderTimer = setTimeout(() => { _renderTimer = null; render(); }, 100);
}

/* ── mount / teardown ─────────────────────────────────────────────── */

export async function mountLearningDashboard(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('wlk-root');
  if (!mounted) {
    mounted = true;
    host.innerHTML = renderTabShell(SECTIONS, st.section, { ariaLabel: 'Learning Dashboard' });
    contentEl = host.querySelector('.wlk-content');
    host.addEventListener('click', onClick);
    registerRepositoryListener(scheduleRender);
  }
  render();
}

export function closeLearningDashboard() { /* shell hides the host; state is retained */ }

/* ── render dispatch ──────────────────────────────────────────────── */

const RENDERERS = {
  overview: renderOverviewSection,
  rates: renderRatesSection,
  activity: renderActivitySection,
  distribution: renderDistributionSection,
  queues: renderQueuesSection,
  organization: renderOrganizationSection,
};

function render() {
  if (!contentEl) return;
  host.querySelectorAll('.wlk-tab').forEach((btn) => {
    btn.classList.toggle('wlk-tab--active', btn.dataset.id === st.section);
  });
  contentEl.innerHTML = (RENDERERS[st.section] || renderOverviewSection)();
}

function setSection(id) {
  st.section = SECTIONS.some((s) => s.id === id) ? id : 'overview';
  render();
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'wlk-tab') setSection(el.dataset.id);
  if (el.dataset.act === 'ld-om-domain') { st.omDomain = el.dataset.id; render(); }
}

/* ── data helpers ──────────────────────────────────────────────────── */

function safeList(fn, filter) {
  const result = fn(filter);
  return result.ok ? result.data : [];
}

function domainLabel(id) {
  const registered = getDomainType(id);
  return registered ? registered.label : id;
}

/** Sprint 0 (Presentation Truth) — a bare Knowledge Item Id is an internal
 *  ID a normal user should never see; show the item's kind label instead
 *  (Developer Mode keeps the raw id at each call site). */
function kindLabelForItem(itemId) {
  const r = knowledgeGetById(itemId);
  if (!r.ok) return itemId;
  const k = getKind(r.data.kind);
  return k ? k.label : r.data.kind;
}

function approvedItems() { return safeList(knowledgeList, { lifecycleState: LIFECYCLE_STATE.APPROVED }); }
function rejectedEntries() { return deriveRejectedFromCandidateQueue(getCandidateQueue(), knowledgeGetHistory); }

/* ── Overview (Learning Overview + Knowledge Growth + Learning Health) ── */

function computeGrowthSeries() {
  const items = safeList(knowledgeList, {});
  const byDay = new Map();
  for (const item of items) {
    const day = String(item.createdAt || '').slice(0, 10);
    if (!day) continue;
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
}

/** V2.1 — Learning Insights (Part J): real counts from repository state
 *  only — Datasets Imported (manual-file sourced), Knowledge Created
 *  (sourceType manual-file), Candidate Recommendations / Pattern
 *  Discoveries (computePatternRecommendations, UNCHANGED engine),
 *  Profile Overrides by lifecycle state. Every number here is a direct
 *  tally, never a second computation of what an existing engine already
 *  produces. */
function computeLearningInsights() {
  const domains = listDomainTypes();
  const datasetsImported = domains.reduce((n, d) => n + listDatasets({ domainType: d.id }).filter((ds) => ds.sourceId === manualFileSource.id).length, 0);
  const knowledgeCreated = safeList(knowledgeList, {}).filter((i) => i.sourceType === 'manual-file').length;
  const patternDiscoveries = domains.reduce((n, d) => n + computePatternRecommendations(d.id).length, 0);
  const overridesResult = listOverrides({});
  const overrides = overridesResult.ok ? overridesResult.data : [];
  const overridesApproved = overrides.filter((o) => o.lifecycleState === LIFECYCLE_STATE.APPROVED).length;
  return { datasetsImported, knowledgeCreated, patternDiscoveries, overridesTotal: overrides.length, overridesApproved };
}

/** Autonomous Experience (Part 10) — "Today the platform learned...".
 *  Every number here is a real, date-scoped read of already-real stored
 *  data — never a second computation, never a fabricated category:
 *
 *    - new document facts       -> KnowledgeItems whose real createdAt is
 *                                   today (a genuinely NEW fact, not a
 *                                   correction to an existing one)
 *    - corrections               -> LEARNING_KIND.CORRECTION events whose
 *                                   real observedAt is today (learning-
 *                                   service.js's own producers: Advanced
 *                                   Metadata saves, Knowledge/Pattern
 *                                   corrections — see that file's header)
 *    - patterns discovered        -> LEARNING_KIND.PATTERN events observed
 *                                   today (idempotent-when-unchanged, so a
 *                                   version here means something REALLY
 *                                   changed today, not a render artifact)
 *    - knowledge approved         -> LEARNING_KIND.KNOWLEDGE_EVOLUTION
 *                                   events observed today
 *    - gaps resolved               -> LEARNING_KIND.GAP_RESOLUTION events
 *                                   observed today
 *    - duplicate document chains  -> the real `duplicate` tally on Import
 *                                   Batches STARTED today (not a Learning
 *                                   Event — this is the one fact that lives
 *                                   on the batch record itself)
 *
 *  A category with a real zero shows a real zero — this file's own
 *  masthead already says so ("setiap angka di sini boleh jujur menunjukkan
 *  nol"), and nothing here invents a nonzero placeholder to look alive. */
function computeTodayLearning() {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = (iso) => typeof iso === 'string' && iso.slice(0, 10) === today;

  const newFactsToday = safeList(knowledgeList, {}).filter((i) => isToday(i.createdAt)).length;

  const eventsToday = safeList(listLearningEvents, {}).filter((e) => isToday(e.observedAt));
  const countKind = (kind) => eventsToday.filter((e) => e.kind === kind).length;
  const correctionsToday = countKind(LEARNING_KIND.CORRECTION);
  const correctionsByType = {};
  Object.values(CORRECTION_TYPE).forEach((t) => {
    correctionsByType[t] = eventsToday.filter((e) => e.kind === LEARNING_KIND.CORRECTION && e.correctionType === t).length;
  });
  const patternsToday = countKind(LEARNING_KIND.PATTERN);
  const knowledgeApprovedToday = countKind(LEARNING_KIND.KNOWLEDGE_EVOLUTION);
  const gapsResolvedToday = countKind(LEARNING_KIND.GAP_RESOLUTION);

  const batchesResult = listBatches({});
  const batchesToday = (batchesResult.ok ? batchesResult.data : []).filter((b) => isToday(b.startedAt));
  const duplicateChainsToday = batchesToday.reduce((n, b) => n + (b.duplicate || 0), 0);

  const totalEventsToday = newFactsToday + correctionsToday + patternsToday + knowledgeApprovedToday + gapsResolvedToday + duplicateChainsToday;

  return {
    today, newFactsToday, correctionsToday, correctionsByType, patternsToday,
    knowledgeApprovedToday, gapsResolvedToday, duplicateChainsToday, totalEventsToday,
  };
}

function renderTodayLearningCard() {
  const t = computeTodayLearning();
  const lines = [
    t.newFactsToday > 0 ? `${t.newFactsToday} fakta dokumen baru` : null,
    t.correctionsToday > 0 ? `${t.correctionsToday} koreksi tercatat (Advanced Metadata/Knowledge/Pattern)` : null,
    t.patternsToday > 0 ? `${t.patternsToday} pola berulang baru ditemukan` : null,
    t.duplicateChainsToday > 0 ? `${t.duplicateChainsToday} rantai dokumen duplikat terdeteksi` : null,
    t.knowledgeApprovedToday > 0 ? `${t.knowledgeApprovedToday} pengetahuan disetujui` : null,
    t.gapsResolvedToday > 0 ? `${t.gapsResolvedToday} celah penomoran diselesaikan` : null,
  ].filter(Boolean);

  return `
    <div class="wlk-sec ld-today-card">
      <div class="wlk-sec-title">Hari Ini Platform Mempelajari</div>
      ${lines.length ? `
        <ul class="ld-today-list">
          ${lines.map((l) => `<li>${esc(l)}</li>`).join('')}
        </ul>` : renderEmptyState('Belum ada aktivitas pembelajaran hari ini.', 'Angka ini boleh jujur menunjukkan nol — akan terisi begitu ada unggahan, koreksi, atau persetujuan baru hari ini.')}
    </div>`;
}

function renderOverviewSection() {
  const metrics = buildLearningMetrics(listCorrectionLog());
  const healthResult = computeHealthReport();
  const health = healthResult.ok ? healthResult.data : null;
  const growth = computeGrowthSeries();
  const insights = computeLearningInsights();

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">LEARNING DASHBOARD</div>
        <h1 class="wlk-page-title">Learning Dashboard</h1>
        <p class="wlk-page-lede">Ringkasan pembelajaran organisasi — setiap angka di sini boleh jujur menunjukkan nol.</p>
      </div>

      ${renderTodayLearningCard()}

      <div class="wlk-sec">
        <div class="wlk-sec-title">Learning Insights</div>
        ${renderStatCards([
          { count: insights.datasetsImported, label: 'Datasets Imported' },
          { count: insights.knowledgeCreated, label: 'Knowledge Created' },
          { count: insights.patternDiscoveries, label: 'Pattern Discoveries' },
          { count: `${insights.overridesApproved}/${insights.overridesTotal}`, label: 'Profile Overrides Disetujui' },
        ])}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Learning Overview</div>
        ${renderStatCards([
          { count: metrics.totalCorrections, label: 'Total Koreksi' },
          { count: metrics.updatesToExisting, label: 'Update Item Ada' },
          { count: metrics.candidatesGenerated, label: 'Candidate Baru' },
          { count: metrics.similarityMatches, label: 'Kecocokan Kemiripan' },
        ])}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Learning Health</div>
        ${health ? renderStatCards([{ count: health.healthScore, label: 'Skor Kesehatan Pengetahuan' }]) : renderEmptyState('Belum ada laporan kesehatan.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Knowledge Growth</div>
        <p class="wlk-page-lede" style="margin-top:0;">Turunan harian dari <code>createdAt</code> setiap item — belum ada penyimpanan snapshot historis, sehingga ini bukan seri waktu yang sebenarnya, hanya derivasi dari data yang ada saat ini.</p>
        ${growth.length ? renderRowList(growth, (g) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(g.day)}</span>
            <span class="wlk-row-secondary">${g.count} item baru</span>
          </li>`) : renderEmptyState('Belum ada item pengetahuan untuk dihitung pertumbuhannya.')}
      </div>
    </div>`;
}

/* ── Approval / Correction Rate + Profile / Dataset Coverage ──────── */

/** Phase 5, Part 7 — "Instead of Coverage 72%, expose six named dimensions,
 *  each explaining itself." This used to be FOUR percentages
 *  (Approval Rate / Correction Rate / Profile Coverage / Dataset Coverage),
 *  none named "Coverage" consistently and none carrying a stated formula —
 *  replaced by the six real dimensions coverage-engine.js computes, each
 *  with its own `explanation` string rendered right under the number. */
function renderCoverageCards(report) {
  const dims = [
    ['knowledgeCoverage', 'Knowledge Coverage'],
    ['relationshipCoverage', 'Relationship Coverage'],
    ['metadataCoverage', 'Metadata Coverage'],
    ['patternCoverage', 'Pattern Coverage'],
    ['correctionCoverage', 'Correction Coverage'],
    ['gapCoverage', 'Gap Coverage'],
  ];
  return `
    ${renderStatCards(dims.map(([key, label]) => ({
    count: report[key].pct === null ? '—' : `${report[key].pct}%`, label,
  })))}
    <ul class="wlk-brief-list" style="margin-top:8px;">
      ${dims.map(([key, label]) => `<li class="wlk-row-secondary">${esc(label)}: ${esc(report[key].explanation)}</li>`).join('')}
    </ul>`;
}

function renderRatesSection() {
  const platformCoverage = computeCoverageReport().data;
  const domains = listDomainTypes();

  const profileCoverage = domains.map((d) => ({ id: d.id, label: d.label, result: profiles.buildAllProfiles(d.id) }));
  const datasetCoverage = domains.map((d) => ({ id: d.id, label: d.label, count: listDatasets({ domainType: d.id }).length }));

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">LEARNING DASHBOARD · APPROVAL &amp; COVERAGE</div>
        <h1 class="wlk-page-title">Approval &amp; Coverage</h1>
        <p class="wlk-page-lede">Enam dimensi cakupan yang dapat dijelaskan sendiri — setiap angka menyatakan pembilang dan penyebutnya, bukan satu persentase yang tidak jelas artinya.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Cakupan (Platform)</div>
        ${renderCoverageCards(platformCoverage)}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Profile Coverage per Domain</div>
        ${domains.length ? renderRowList(profileCoverage, (d) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(d.label)}</span>
            <span class="wlk-row-secondary">${d.result.profileTypesComputed}/${d.result.profileTypesAttempted} profile</span>
          </li>`) : renderEmptyState('Belum ada domain terdaftar.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Dataset Coverage per Domain</div>
        ${domains.length ? renderRowList(datasetCoverage, (d) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(d.label)}</span>
            <span class="wlk-row-secondary">${d.count} dataset</span>
          </li>`) : renderEmptyState('Belum ada domain terdaftar.')}
      </div>
    </div>`;
}

/** Phase 5, Part 5 — Organization Memory: the eight facts, per domain (a
 *  platform-wide merge would blur "common terminology" across domains that
 *  legitimately use different vocabulary — the per-domain view is the
 *  honest one, matching how Profile/Dataset Coverage above are already
 *  shown per domain, not merged). */
function renderOrganizationSection() {
  const domains = listDomainTypes();
  if (!domains.length) {
    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">LEARNING DASHBOARD · MEMORI ORGANISASI</div>
          <h1 class="wlk-page-title">Memori Organisasi</h1>
        </div>
        ${renderEmptyState('Belum ada domain terdaftar.')}
      </div>`;
  }
  const activeDomain = st.omDomain && domains.some((d) => d.id === st.omDomain) ? st.omDomain : domains[0].id;
  const chips = domains.map((d) => ({ id: d.id, label: d.label }));
  const om = computeOrganizationalMemory(activeDomain, { limit: 8 }).data;

  const factSection = (title, items, renderItem, emptyHint) => `
    <div class="wlk-sec">
      <div class="wlk-sec-title">${esc(title)} (${items.length})</div>
      ${items.length ? renderRowList(items, renderItem) : renderEmptyState('Belum ada data.', emptyHint)}
    </div>`;

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">LEARNING DASHBOARD · MEMORI ORGANISASI</div>
        <h1 class="wlk-page-title">Memori Organisasi</h1>
        <p class="wlk-page-lede">Struktur, istilah, dan pola yang berulang dalam organisasi — disusun dari Knowledge Approved dan Learning Event yang nyata, bukan dihitung ulang.</p>
      </div>

      <div class="wlk-sec">${renderFilterBar(chips, activeDomain, { act: 'ld-om-domain' })}</div>

      ${factSection('Struktur Dokumen Umum', om.commonDocumentStructures,
    (f) => `<li class="wlk-row"><span class="wlk-row-primary">${esc(f.value)}</span><span class="wlk-row-secondary">${f.supportCount} sampel · confidence ${f.confidence}</span></li>`,
    'Muncul setelah Knowledge Approved memiliki pola paragraf yang cukup.')}

      ${factSection('Istilah Umum', om.commonTerminology,
    (f) => `<li class="wlk-row"><span class="wlk-row-primary">${esc(f.value)}</span><span class="wlk-row-secondary">${f.supportCount} sampel · confidence ${f.confidence}</span></li>`,
    'Muncul setelah Knowledge Approved memiliki data kosakata yang cukup.')}

      ${factSection('Frasa Organisasi Umum', om.commonOrganizationalPhrases,
    (f) => `<li class="wlk-row"><span class="wlk-row-primary">${esc(f.value)}</span><span class="wlk-row-secondary">${f.supportCount} sampel · confidence ${f.confidence}</span></li>`,
    'Muncul setelah Knowledge Approved memiliki data gaya penulisan yang cukup.')}

      ${factSection('Pola Persetujuan Umum', om.commonApprovalPatterns,
    (f) => `<li class="wlk-row"><span class="wlk-row-primary">${esc(f.value)}</span><span class="wlk-row-secondary">${f.supportCount} sampel · confidence ${f.confidence}</span></li>`,
    'Muncul setelah Knowledge Approved memiliki data rantai persetujuan yang cukup.')}

      ${factSection('Pengetahuan Paling Sering Digunakan Ulang', om.frequentlyReusedKnowledge,
    (f) => `<li class="wlk-row"><span class="wlk-row-primary">${esc(f.knowledgeItemId)}</span><span class="wlk-row-secondary">dikutip ${f.referencedByCount} arsip</span></li>`,
    'Muncul saat lebih dari satu Archive Record mengutip Knowledge yang sama.')}

      ${factSection('Pengetahuan Paling Sering Dikoreksi', om.frequentlyCorrectedKnowledge,
    (f) => `<li class="wlk-row"><span class="wlk-row-primary">${esc(f.key)}</span><span class="wlk-row-secondary">${f.count} kali dikoreksi (${esc(f.correctionType)}) · terakhir ${esc(f.lastAt)}</span></li>`,
    'Muncul saat sesuatu dikoreksi lebih dari sekali.')}

      <div class="wlk-sec">
        <div class="wlk-sec-title">Ringkasan</div>
        ${renderStatCards([
    { count: om.frequentlyMissingMetadataCount, label: 'Koreksi Metadata Tercatat' },
    { count: om.frequentlyMissingRelationshipsCount, label: 'Koreksi Relasi Tercatat' },
    { count: om.totalLearningEvents, label: 'Total Learning Event (Koreksi)' },
  ])}
      </div>
    </div>`;
}

/* ── Recent Learning / Timeline / Top Corrections / Most Active Domains ── */

function renderActivitySection() {
  const log = listCorrectionLog().slice().sort((a, b) => b.at.localeCompare(a.at));
  const recent = log.slice(0, 10);

  const domains = listDomainTypes();
  const composerEntries = domains.flatMap((d) => getComposerTimeline(d.id).map((c) => ({ ...c, domainType: d.id, kind: 'composer' })));
  const timeline = [...log.map((l) => ({ ...l, kind: 'correction' })), ...composerEntries]
    .sort((a, b) => (b.at || b.updatedAt || '').localeCompare(a.at || a.updatedAt || ''))
    .slice(0, 15);

  const joined = log.map((l) => ({ ...l, item: knowledgeGetById(l.itemId) }));
  const byItem = new Map();
  const byDomain = new Map();
  for (const entry of joined) {
    byItem.set(entry.itemId, (byItem.get(entry.itemId) || 0) + 1);
    const domainType = entry.item.ok ? entry.item.data.domainType : null;
    if (domainType) byDomain.set(domainType, (byDomain.get(domainType) || 0) + 1);
  }
  const topCorrections = [...byItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const mostActiveDomains = [...byDomain.entries()].sort((a, b) => b[1] - a[1]);
  const devMode = isDeveloperMode();

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">LEARNING DASHBOARD · AKTIVITAS</div>
        <h1 class="wlk-page-title">Aktivitas Pembelajaran</h1>
        <p class="wlk-page-lede">Koreksi terbaru, linimasa gabungan, item yang paling sering dikoreksi, dan domain paling aktif.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Koreksi Terbaru</div>
        ${recent.length ? renderRowList(recent, (l) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(devMode ? l.itemId : kindLabelForItem(l.itemId))}</span>
            <span class="wlk-row-secondary">${esc(l.at)}</span>
          </li>`) : renderEmptyState('Belum ada koreksi tercatat.', dormantNote('correction-log'))}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Linimasa Pembelajaran</div>
        ${timeline.length ? renderRowList(timeline, (t) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${t.kind === 'composer' ? esc(t.documentId) : esc(devMode ? t.itemId : kindLabelForItem(t.itemId))}</span>
            <span class="wlk-row-secondary">${esc(t.kind === 'composer' ? 'draft' : 'koreksi')} · ${esc(t.at || t.updatedAt || '—')}</span>
          </li>`) : renderEmptyState('Belum ada aktivitas pembelajaran.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Koreksi Terbanyak</div>
        ${topCorrections.length ? renderRowList(topCorrections, ([itemId, count]) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(devMode ? itemId : kindLabelForItem(itemId))}</span>
            <span class="wlk-row-secondary">${count} koreksi</span>
          </li>`) : renderEmptyState('Belum ada item yang dikoreksi.', dormantNote('correction-log'))}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Most Active Domains</div>
        ${mostActiveDomains.length ? renderRowList(mostActiveDomains, ([domainType, count]) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(domainLabel(domainType))}</span>
            <span class="wlk-row-secondary">${count} koreksi</span>
          </li>`) : renderEmptyState('Belum ada domain dengan aktivitas koreksi.', dormantNote('correction-log'))}
      </div>
    </div>`;
}

/* ── Knowledge Distribution + Confidence Distribution ──────────────── */

function renderDistributionSection() {
  const metricsResult = knowledgeGetMetrics();
  const metrics = metricsResult.ok ? metricsResult.data : null;
  const healthResult = computeHealthReport();
  const health = healthResult.ok ? healthResult.data : null;
  const devMode = isDeveloperMode();
  const statusLabel = (id) => {
    const def = LIFECYCLE_STATE_DEFS.find((d) => d.id === id);
    return def ? def.label : id;
  };

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">LEARNING DASHBOARD · DISTRIBUSI</div>
        <h1 class="wlk-page-title">Distribusi Pengetahuan</h1>
        <p class="wlk-page-lede">Distribusi item berdasarkan domain, status siklus hidup, dan tingkat kepercayaan.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Distribusi Pengetahuan — per Domain</div>
        ${metrics && Object.keys(metrics.byDomainType).length ? renderKvList(Object.entries(metrics.byDomainType).map(([d, c]) => [domainLabel(d), c])) : renderEmptyState('Belum ada item pengetahuan.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Distribusi Pengetahuan — per Status</div>
        ${metrics && Object.keys(metrics.byLifecycleState).length ? renderKvList(Object.entries(metrics.byLifecycleState).map(([s, c]) => [devMode ? s : statusLabel(s), c])) : renderEmptyState('Belum ada item pengetahuan.')}
      </div>

      ${devMode ? `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Confidence Distribution (item Approved)</div>
        ${health ? renderKvList(Object.entries(health.confidenceDistribution)) : renderEmptyState('Belum ada laporan distribusi kepercayaan.')}
      </div>` : ''}
    </div>`;
}

/* ── Antrean: Learning Queue / Correction Queue / Candidate Recommendations (V2.1) ──
   Pure composition over engines already imported elsewhere in this file
   (getCandidateQueue/getReviewQueue, listCorrectionLog) plus Pattern
   Discovery's read-only statistical evidence — no new engine, this
   section only gives three already-real data sources their own literal,
   explicitly-named views (the roadmap's "Candidate Generator" concept
   resolves to Pattern Discovery's Candidate Recommendations here). */

function renderQueuesSection() {
  const learningQueue = [...getCandidateQueue(), ...getReviewQueue()];
  const correctionLog = listCorrectionLog().slice().sort((a, b) => b.at.localeCompare(a.at));
  const domains = listDomainTypes();
  const recommendations = domains.flatMap((d) => computePatternRecommendations(d.id).map((r) => ({ ...r, domainLabel: d.label })));
  const devMode = isDeveloperMode();

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">LEARNING DASHBOARD · ANTREAN</div>
        <h1 class="wlk-page-title">Antrean Pembelajaran</h1>
        <p class="wlk-page-lede">${devMode
          ? 'Learning Queue (Candidate + Pending Review), Correction Queue (log koreksi), dan Candidate Recommendations (bukti statistik deterministik dari Pattern Discovery) — tidak ada yang diterapkan otomatis.'
          : 'Pengetahuan yang menunggu tinjauan, koreksi yang tercatat, dan saran berdasarkan pola dari dokumen yang sudah disetujui — tidak ada yang diterapkan otomatis.'}</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Menunggu Tinjauan (${learningQueue.length})</div>
        ${learningQueue.length ? renderRowList(learningQueue, (e) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(devMode ? e.itemId : kindLabelForItem(e.itemId))}</span>
            <span class="wlk-row-secondary">v${e.itemVersion} · masuk antrean ${esc(e.enteredQueueAt)}${e.hasConflict ? ' · konflik' : ''}</span>
          </li>`) : renderEmptyState('Antrean pembelajaran kosong.', 'Item Candidate dan Pending Review akan muncul di sini.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Riwayat Koreksi (${correctionLog.length})</div>
        ${correctionLog.length ? renderRowList(correctionLog, (l) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(devMode ? l.itemId : kindLabelForItem(l.itemId))}</span>
            <span class="wlk-row-secondary">${l.generatedNew ? 'usulan baru' : 'pembaruan item ada'}${l.similarityMatchFound ? ' · kecocokan kemiripan' : ''} · ${esc(l.at)}</span>
          </li>`) : renderEmptyState('Belum ada koreksi tercatat.', dormantNote('correction-log'))}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">${devMode ? 'Candidate Recommendations' : 'Saran Berdasarkan Pola'} (${recommendations.length})</div>
        ${recommendations.length ? renderRowList(recommendations, (r) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(r.domainLabel)} · ${esc(r.patternType)} — ${esc(r.value)}</span>
            <span class="wlk-row-secondary">${devMode ? `support ${r.evidence.supportCount} · confidence ${r.evidence.confidence}` : `didukung ${r.evidence.supportCount} dokumen serupa`}</span>
          </li>`) : renderEmptyState('Belum ada rekomendasi.', 'Rekomendasi muncul setelah ada Knowledge Approved. Lihat NOR Center → Profil Organisasi untuk mengubah rekomendasi menjadi Override.')}
      </div>
    </div>`;
}
