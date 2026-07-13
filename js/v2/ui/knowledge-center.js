/* ============================================================
   KNOWLEDGE-CENTER.JS — Knowledge Center workspace (V2.0.18)

   Sibling of NOR Center / Archive Center under Sarpras Intelligence —
   mounted by ./sarpras-intelligence-center.js when its "knowledge" screen
   is shown, owning its own internal navigation (Dashboard / Knowledge
   List / Review), exactly as nor-center.js / archive-center.js already do.

   SCOPE: cross-domain browser over the Knowledge Repository. nor-center.js's
   own "Review" tab (scoped to domainType:'nor') is untouched — this file
   calls the SAME review engines with no domain filter, never a second
   implementation.

   REUSE, NEVER DUPLICATE: every number here traces to an existing Knowledge
   Services call (knowledge/services/index.js barrel) or repository read.
   "Profile Link" / "Dataset Link" / "Archive Link" are cross-references
   inside the Knowledge Detail drawer, not separate stores. "Rejected" is
   the same composition derivation Archive Center uses (see
   workspace-list-kit.js#deriveRejectedFromCandidateQueue) — there is no
   `rejected` lifecycle state.
   ============================================================ */

'use strict';

import {
  list as knowledgeList, getById as knowledgeGetById, getHistory as knowledgeGetHistory,
  registerRepositoryListener,
} from '../knowledge/repository/knowledge-repository.js';
import { LIFECYCLE_STATE, LIFECYCLE_STATE_DEFS } from '../knowledge/contracts/lifecycle-contract.js';
import { listDomainTypes, getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { listKinds } from '../knowledge/registry/kind-registry.js';
import { computeHealthReport } from '../knowledge/metrics/knowledge-metrics-engine.js';
import {
  confidence, dependencyGraph, knowledgeGraph, explainability, profiles,
} from '../knowledge/services/index.js';
import { getReviewQueue, getCandidateQueue } from '../knowledge/review/review-queue-engine.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import {
  list as archiveList, checkKnowledgeContribution,
} from '../organizational-memory/index.js';

import {
  esc, renderEmptyState, renderTabShell, renderRowList, renderStatCards,
  renderFilterBar, renderDetailSection, renderKvList, renderDetail,
  deriveRejectedFromCandidateQueue,
} from './shared/workspace-list-kit.js';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'list', label: 'Knowledge List' },
  { id: 'review', label: 'Review' },
];

const st = {
  section: 'dashboard',
  domainFilter: null,
  statusFilter: null,
  selectedId: null,
  reviewFilter: 'pending',
};

let host = null;
let contentEl = null;
let mounted = false;

/* ── Phase 2.5 Part 3+7 — event-driven synchronization ──────────────
   Subscribe to the knowledge repository's Repository Events (fired once
   per create/appendVersion/rollback on the facade). A live import or a
   rehydration-from-sessions creates Draft KnowledgeItems -> this fires ->
   Knowledge Center re-renders, so it never shows a stale first-visit
   snapshot. Coalesced (a single scheduled render per 100ms burst) so a
   bulk import's N writes trigger O(1) redraws, not N — preserving O(N).
   Deterministic and event-triggered, never polling. */
let _renderTimer = null;
function scheduleRender() {
  if (_renderTimer) return;
  _renderTimer = setTimeout(() => { _renderTimer = null; render(); }, 100);
}

/* ── mount / teardown ─────────────────────────────────────────────── */

export async function mountKnowledgeCenter(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('wlk-root');
  if (!mounted) {
    mounted = true;
    host.innerHTML = renderTabShell(SECTIONS, st.section, { ariaLabel: 'Knowledge Center' });
    contentEl = host.querySelector('.wlk-content');
    host.addEventListener('click', onClick);
    registerRepositoryListener(scheduleRender);
  }
  render();
}

export function closeKnowledgeCenter() { /* shell hides the host; state is retained */ }

/* ── render dispatch ──────────────────────────────────────────────── */

const RENDERERS = {
  dashboard: renderDashboardSection,
  list: renderListSection,
  review: renderReviewSection,
};

function render() {
  if (!contentEl) return;
  host.querySelectorAll('.wlk-tab').forEach((btn) => {
    btn.classList.toggle('wlk-tab--active', btn.dataset.id === st.section);
  });
  contentEl.innerHTML = (RENDERERS[st.section] || renderDashboardSection)();
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
  if (act === 'wlk-tab') { setSection(el.dataset.id); return; }
  if (act === 'kc-domain-filter') { st.domainFilter = el.dataset.id === '__all' ? null : el.dataset.id; st.selectedId = null; render(); return; }
  if (act === 'kc-status-filter') { st.statusFilter = el.dataset.id === '__all' ? null : el.dataset.id; st.selectedId = null; render(); return; }
  if (act === 'kc-item-row') { st.selectedId = st.selectedId === el.dataset.id ? null : el.dataset.id; render(); return; }
  if (act === 'kc-review-filter') { st.reviewFilter = el.dataset.id; render(); return; }
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

/* ── Dashboard ─────────────────────────────────────────────────────── */

function renderDashboardSection() {
  const healthResult = computeHealthReport();
  const health = healthResult.ok ? healthResult.data : null;
  const domains = listDomainTypes();
  const kinds = listKinds();

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">KNOWLEDGE CENTER</div>
        <h1 class="wlk-page-title">Knowledge Center</h1>
        <p class="wlk-page-lede">Pengetahuan organisasi lintas domain — cakupan, antrean review, dan distribusi kepercayaan dalam satu tempat.</p>
      </div>

      ${health ? `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Kesehatan Pengetahuan</div>
        ${renderStatCards([
          { count: health.healthScore, label: 'Skor Kesehatan' },
          { count: `${health.coveragePct}%`, label: 'Cakupan Domain' },
          { count: health.pendingReviewCount, label: 'Menunggu Review' },
          { count: health.learningQueueCount, label: 'Antrean Pembelajaran' },
        ])}
      </div>` : renderEmptyState('Belum ada laporan kesehatan pengetahuan.')}

      <div class="wlk-sec">
        <div class="wlk-sec-title">Domain (${domains.length}) &amp; Status</div>
        ${renderRowList(LIFECYCLE_STATE_DEFS, (s) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(s.label)}</span>
            <span class="wlk-row-secondary">${safeList(knowledgeList, { lifecycleState: s.id }).length} item</span>
          </li>`)}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Registered Kinds (${kinds.length})</div>
        ${renderEmptyState('Lihat tab Knowledge List untuk menelusuri item per kind.', 'Kind adalah bentuk pengetahuan (vocabulary, structure, rule, dst.), bukan tampilan tersendiri.')}
      </div>
    </div>`;
}

/* ── Knowledge List (List + Search + Filter + Detail) ─────────────── */

function renderListSection() {
  const domains = listDomainTypes();
  const domainChips = [{ id: '__all', label: 'Semua Domain' }, ...domains.map((d) => ({ id: d.id, label: d.label }))];
  const statusChips = [{ id: '__all', label: 'Semua Status' }, ...LIFECYCLE_STATE_DEFS.map((s) => ({ id: s.id, label: s.label }))];

  const filter = {};
  if (st.domainFilter) filter.domainType = st.domainFilter;
  if (st.statusFilter) filter.lifecycleState = st.statusFilter;
  const items = safeList(knowledgeList, filter);

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">KNOWLEDGE CENTER · LIST</div>
        <h1 class="wlk-page-title">Knowledge List</h1>
        <p class="wlk-page-lede">Telusuri setiap KnowledgeItem berdasarkan domain dan status siklus hidup.</p>
      </div>

      <div class="wlk-sec">${renderFilterBar(domainChips, st.domainFilter || '__all', { act: 'kc-domain-filter' })}</div>
      <div class="wlk-sec">${renderFilterBar(statusChips, st.statusFilter || '__all', { act: 'kc-status-filter' })}</div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Item (${items.length})</div>
        ${items.length ? renderRowList(items, (i) => `
          <li class="wlk-row" data-act="kc-item-row" data-id="${esc(i.id)}" data-clickable="1">
            <span class="wlk-row-primary">${esc(i.kind)} — ${esc(domainLabel(i.domainType))}</span>
            <span class="wlk-row-secondary">${esc(i.lifecycleState)} · conf ${Math.round((i.confidence || 0) * 100)}%</span>
          </li>`) : renderEmptyState('Tidak ada item yang cocok dengan filter ini.')}
      </div>

      ${st.selectedId ? renderItemDetail(st.selectedId) : ''}
    </div>`;
}

function renderItemDetail(id) {
  const result = knowledgeGetById(id);
  if (!result.ok) return '';
  const item = result.data;

  const metadata = renderKvList([
    ['ID', item.id],
    ['Domain', domainLabel(item.domainType)],
    ['Kind', item.kind],
    ['Source Type', item.sourceType],
    ['Status', item.lifecycleState],
    ['Confidence', `${Math.round((item.confidence || 0) * 100)}%`],
    ['Dibuat', item.createdAt],
    ['Diperbarui', item.updatedAt],
  ]);

  const confidenceExplain = confidence.explainConfidenceAsEvidence(item);
  const evidence = confidenceExplain.ok && confidenceExplain.data.length
    ? renderKvList(confidenceExplain.data.map((e) => [e.kind, e.rationale]))
    : null;

  const depsResult = dependencyGraph.getDependencies(item.id);
  const relationships = depsResult.ok && depsResult.data.length
    ? renderKvList(depsResult.data.map((d) => [d.payload && d.payload.type, `${d.payload && d.payload.fromId} → ${d.payload && d.payload.toId}`]))
    : null;

  const neighborsResult = knowledgeGraph.getNeighbors(item.id);
  const dependencies = neighborsResult.ok && neighborsResult.data.length
    ? renderKvList(neighborsResult.data.map((n) => [n.neighborId, `${n.direction} · ${n.neighbor ? n.neighbor.kind : 'tidak ditemukan'}`]))
    : null;

  const historyResult = knowledgeGetHistory(item.id);
  const versions = historyResult.ok ? historyResult.data : [];
  const versionHistory = versions.length ? renderKvList(versions.map((v) => [`Versi ${v.version}`, `${v.lifecycleState} · ${v.updatedAt}`])) : null;
  const approvalHistory = versions.filter((v) => v.lifecycleState === LIFECYCLE_STATE.APPROVED).length
    ? renderKvList(versions.filter((v) => v.lifecycleState === LIFECYCLE_STATE.APPROVED).map((v) => [`Versi ${v.version}`, `oleh ${v.approvedBy || '—'} pada ${v.approvedAt || '—'}`]))
    : null;

  const explainResult = explainability.explain(item);
  const explainHtml = explainResult.ok
    ? renderKvList([
      ['Dipelajari Dari', explainResult.data.whereLearned && explainResult.data.whereLearned.connectorId],
      ['Jumlah Korroborasi', explainResult.data.corroborationCount],
      ['Disetujui Oleh', explainResult.data.approvedBy],
      ['Alasan Preferensi', explainResult.data.whyPreferred],
    ])
    : renderEmptyState('Explainability tersedia hanya untuk item dengan provenance yang valid.');

  const profileTypes = profiles.listProfileTypes();
  const profileLinks = profileTypes
    .map((pt) => ({ pt, r: profiles.buildProfile(item.domainType, pt) }))
    .filter((x) => x.r.ok);
  const profileLink = profileLinks.length
    ? renderKvList(profileLinks.map((x) => [x.pt, `${x.r.profile.sampleCount} sampel`]))
    : renderEmptyState('Belum ada Profile yang terbangun untuk domain ini.');

  const datasetLink = (() => {
    const ds = listDatasets({ domainType: item.domainType });
    return ds.length ? renderKvList(ds.map((d) => [d.name, d.datasetType])) : renderEmptyState('Belum ada dataset terdaftar untuk domain ini.');
  })();

  const archiveLink = (() => {
    const records = safeList(archiveList, { sourceDomainType: item.domainType }).filter(checkKnowledgeContribution);
    return records.length ? renderKvList(records.map((r) => [r.documentNumber, r.archivedAt])) : renderEmptyState('Belum ada Archive Record yang tertaut ke domain ini.');
  })();

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Detail — ${esc(item.id)}</div>
      ${renderDetail([
        renderDetailSection('Metadata', metadata),
        renderDetailSection('Evidence', evidence),
        renderDetailSection('Relationships', relationships),
        renderDetailSection('Dependencies', dependencies),
        renderDetailSection('Version History', versionHistory),
        renderDetailSection('Approval History', approvalHistory),
        renderDetailSection('Explainability', explainHtml),
        renderDetailSection('Profile Link', profileLink),
        renderDetailSection('Dataset Link', datasetLink),
        renderDetailSection('Archive Link', archiveLink),
      ])}
    </div>`;
}

/* ── Review (Review Queue / Candidate Queue / Rejected) ────────────── */

function renderReviewSection() {
  const filters = [
    { id: 'pending', label: 'Review Queue' },
    { id: 'candidate', label: 'Candidate Queue' },
    { id: 'rejected', label: 'Rejected' },
  ];

  let rows = [];
  if (st.reviewFilter === 'pending') {
    rows = getReviewQueue().map((e) => ({ id: e.itemId, meta: e.hasConflict ? 'Konflik terdeteksi' : 'Menunggu review' }));
  } else if (st.reviewFilter === 'candidate') {
    rows = getCandidateQueue().map((e) => ({ id: e.itemId, meta: e.hasConflict ? 'Konflik terdeteksi' : 'Menunggu pengajuan' }));
  } else {
    rows = deriveRejectedFromCandidateQueue(getCandidateQueue(), knowledgeGetHistory).map((e) => ({ id: e.itemId, meta: `Ditolak pada versi ${e.rejectedAtVersion}` }));
  }

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">KNOWLEDGE CENTER · REVIEW</div>
        <h1 class="wlk-page-title">Review Workflow</h1>
        <p class="wlk-page-lede">Antrean Pending Review dan Candidate, serta item yang pernah dikembalikan dari Pending Review ke Candidate.</p>
      </div>

      <div class="wlk-sec">${renderFilterBar(filters, st.reviewFilter, { act: 'kc-review-filter' })}</div>

      <div class="wlk-sec">
        ${rows.length ? renderRowList(rows, (row) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(row.id)}</span>
            <span class="wlk-row-secondary">${esc(row.meta)}</span>
          </li>`) : renderEmptyState(`Tidak ada item pada "${filters.find((f) => f.id === st.reviewFilter).label}".`)}
      </div>
    </div>`;
}
