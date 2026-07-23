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

// Phase 3 — Knowledge Center is the ONE place a human governs organizational
// knowledge, and it reaches the domain through its owner. Note what is imported
// here: the GOVERNANCE verbs (promote/requestChanges/reject/archive), never a
// raw lifecycle mutator. The audit found this workspace had exactly one
// interactive action — selecting a row — which meant every Draft the autonomous
// pipeline produced stayed Draft forever, invisible to Pattern Discovery,
// Coverage and the knowledge index (all of which filter on APPROVED). The gate
// existed in the engines and was tested; nothing was wired to it. That is what
// these imports fix.
import {
  listKnowledge as knowledgeList,
  getKnowledge as knowledgeGetById,
  getKnowledgeHistory as knowledgeGetHistory,
  registerKnowledgeListener as registerRepositoryListener,
  promoteKnowledge, requestChanges, rejectKnowledge, archiveKnowledge,
  explainKnowledge,
} from '../knowledge/services/knowledge-service.js';
// The UI is the one layer permitted to see both domains, so it — not the
// Knowledge Service — resolves an item's `importSessionId` back to the real
// uploaded document (see knowledge-service.js#explainKnowledge on why the
// Service deliberately returns a bare reference instead of importing this).
import { getImportSession } from '../knowledge/datasets/import-session/import-session-engine.js';
// Phase 5, Part 3 — "Request Changes" is a real, already-firing human
// correction: a person declaring existing Knowledge needs rework.
import { recordCorrection, CORRECTION_TYPE } from '../learning/services/learning-service.js';
import { LIFECYCLE_STATE, LIFECYCLE_STATE_DEFS } from '../knowledge/contracts/lifecycle-contract.js';
import { listDomainTypes, getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { listKinds, getKind } from '../knowledge/registry/kind-registry.js';
import { computeHealthReport } from '../knowledge/metrics/knowledge-metrics-engine.js';
import {
  confidence, dependencyGraph, knowledgeGraph, explainability, profiles,
} from '../knowledge/services/index.js';
import { getReviewQueue, getCandidateQueue } from '../knowledge/review/review-queue-engine.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
// Phase 4 — the UI is the one layer allowed to see both domains, so it is the
// one place that can close the loop between them: when a human REJECTS
// knowledge, the archived document that produced it is no longer a source of
// live organizational knowledge, and the Archive should say so. Neither domain
// can reach across to the other (knowledge/ may not import
// organizational-memory/ at all), so this composition happens here — exactly as
// dataset-import-center.js#doArchive already composes the other direction.
import {
  listArchive as archiveList, checkKnowledgeContribution,
  archiveRejectedKnowledge,
} from '../organizational-memory/index.js';

import {
  esc, renderEmptyState, renderTabShell, renderRowList, renderStatCards,
  renderFilterBar, renderDetailSection, renderKvList, renderDetail,
  deriveRejectedFromCandidateQueue, isDeveloperMode,
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
  // Phase 3 — governance. `govNote` is the reviewer's rationale; approving
  // organizational knowledge without one is refused by the contract
  // (review-contract.js#isValidReviewDecision), and rightly so: "approved by
  // evan, reason: (blank)" is not an audit trail.
  govNote: '',
  govError: null,
};

const ACTOR_ID = 'evan';

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
    host.addEventListener('input', onInput);
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
  if (act === 'kc-item-row') { st.selectedId = st.selectedId === el.dataset.id ? null : el.dataset.id; st.govNote = ''; st.govError = null; render(); return; }
  if (act === 'kc-review-filter') { st.reviewFilter = el.dataset.id; render(); return; }

  /* ── Phase 3, Part 4 — HUMAN GOVERNANCE. Every one of these goes through the
     Knowledge Service. This workspace does not import, and cannot reach, a raw
     lifecycle mutator — enforced by scripts/knowledge-ownership-check.mjs. ── */
  if (act === 'kc-gov-approve' || act === 'kc-gov-reject' || act === 'kc-gov-changes' || act === 'kc-gov-archive') {
    const id = el.dataset.id;
    const note = st.govNote.trim();
    const decidedAt = new Date().toISOString();
    let result;

    if (act === 'kc-gov-approve') {
      // The contract demands a real rationale for APPROVED and refuses a blank
      // one. Rather than fabricate a default to satisfy it, ask for the reason —
      // approving knowledge on behalf of an organization without saying why is
      // not governance, it is a rubber stamp with an audit trail that lies.
      if (!note) { st.govError = 'Tuliskan alasan persetujuan — keputusan organisasi harus dapat dipertanggungjawabkan.'; render(); return; }
      result = promoteKnowledge(id, { approverId: ACTOR_ID, decidedAt, preferenceRationale: note });
    } else if (act === 'kc-gov-changes') {
      const before = knowledgeGetById(id);
      result = requestChanges(id, { approverId: ACTOR_ID, decidedAt });
      // Phase 5, Part 3 — a human declaring existing Knowledge needs rework IS
      // a knowledge correction: "this is not right yet, fix it." Recorded
      // best-effort; the lifecycle transition above already committed.
      if (result.ok && before.ok) {
        recordCorrection({
          domainType: before.data.domainType,
          correctionType: CORRECTION_TYPE.KNOWLEDGE,
          targetKey: id,
          actorId: ACTOR_ID,
          reason: note || 'Diminta perubahan melalui Knowledge Center.',
          before: { lifecycleState: before.data.lifecycleState },
          after: { lifecycleState: 'candidate', requestedChangeAt: decidedAt },
          affectedKnowledgeId: id,
        });
      }
    } else if (act === 'kc-gov-reject') {
      result = rejectKnowledge(id, { actorId: ACTOR_ID, reason: note || null });
      // Phase 4 — close the loop into the Archive. The DOCUMENT stays archived
      // (a rejected fact does not unmake the paper it was written on) but it is
      // no longer a live source of organizational knowledge. Best-effort and
      // non-fatal: if no archive record cites this item, there is simply nothing
      // to retire, and the knowledge rejection still stands on its own.
      if (result.ok) {
        const source = archiveList({}).data.find((r) => r.knowledgeItemId === id);
        if (source) archiveRejectedKnowledge(source.id, { actorId: ACTOR_ID, reason: note || null });
      }
    } else {
      result = archiveKnowledge(id, { actorId: ACTOR_ID, reason: note || null });
    }

    // Report the engine's REAL error, never a silent no-op. A governance button
    // that fails quietly is the exact defect Phase 2.6 spent itself removing.
    st.govError = result.ok ? null : (result.error ? result.error.message : 'Tindakan gagal.');
    if (result.ok) st.govNote = '';
    render();
  }
}

function onInput(e) {
  const el = e.target.closest('[data-act="kc-gov-note"]');
  if (!el) return;
  // State only — never re-render on a keystroke, or the focused <input> is
  // destroyed mid-word (the same lesson dataset-import-center.js already learned).
  st.govNote = el.value;
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

/** Sprint 0 (Presentation Truth) — friendly label for a Knowledge `kind`
 *  id, same registry-lookup pattern domainLabel() above already uses. */
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

/* ── Dashboard ─────────────────────────────────────────────────────── */

/** Part 5 — DRAFT VISIBILITY. The real population of every lifecycle state,
 *  counted from the repository, Drafts first.
 *
 *  Drafts were not merely un-promotable before this phase — they were
 *  effectively unmentioned. Coverage and health metrics count Approved
 *  knowledge only (knowledge-metrics-engine.js:45), so a platform holding
 *  hundreds of Drafts and zero Approved items reported itself as holding
 *  nothing at all. A Draft is not noise waiting to be filtered out; it is
 *  organizational work-in-progress, and hiding it made the pipeline's entire
 *  output invisible to the person who was supposed to act on it. */
function renderLifecycleDistribution() {
  const all = safeList(knowledgeList, {});
  const cards = LIFECYCLE_STATE_DEFS.map((d) => ({
    count: all.filter((i) => i.lifecycleState === d.id).length,
    label: isDeveloperMode() ? d.id : d.label,
  }));
  const drafts = all.filter((i) => i.lifecycleState === LIFECYCLE_STATE.DRAFT).length;
  const note = drafts > 0
    ? `<p class="wlk-page-lede">${drafts} pengetahuan berstatus Draft menunggu keputusan Anda. Draft belum dihitung dalam cakupan (Coverage) dan belum dipakai Pattern Discovery — keduanya hanya membaca pengetahuan yang sudah Disetujui.</p>`
    : '';
  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Distribusi Siklus Hidup (${all.length} item)</div>
      ${renderStatCards(cards)}
      ${note}
    </div>`;
}

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

      ${renderLifecycleDistribution()}

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
        ${items.length ? renderRowList(items, (i) => {
          const devMode = isDeveloperMode();
          const kindText = devMode ? i.kind : kindLabel(i.kind);
          const statusText = devMode ? i.lifecycleState : lifecycleLabel(i.lifecycleState);
          const confText = devMode ? `conf ${Math.round((i.confidence || 0) * 100)}%` : `keyakinan ${Math.round((i.confidence || 0) * 100)}%`;
          return `
          <li class="wlk-row" data-act="kc-item-row" data-id="${esc(i.id)}" data-clickable="1">
            <span class="wlk-row-primary">${esc(kindText)} — ${esc(domainLabel(i.domainType))}</span>
            <span class="wlk-row-secondary">${esc(statusText)} · ${esc(confText)}</span>
          </li>`;
        }) : renderEmptyState('Tidak ada item yang cocok dengan filter ini.')}
      </div>

      ${st.selectedId ? renderItemDetail(st.selectedId) : ''}
    </div>`;
}

function renderItemDetail(id) {
  const result = knowledgeGetById(id);
  if (!result.ok) return '';
  const item = result.data;
  const devMode = isDeveloperMode();

  // Sprint 0 (Presentation Truth) — internal ID, raw Kind/Source Type/
  // Status enum values, and the raw Confidence percentage are Developer
  // Mode only; Normal Mode gets the friendly kind/status labels instead.
  const metadataPairs = [
    ['Domain', domainLabel(item.domainType)],
    ['Jenis Pengetahuan', kindLabel(item.kind)],
    ['Status', lifecycleLabel(item.lifecycleState)],
    ['Dibuat', item.createdAt],
    ['Diperbarui', item.updatedAt],
  ];
  if (devMode) {
    metadataPairs.splice(0, 0, ['ID', item.id]);
    metadataPairs.splice(3, 0, ['Kind', item.kind], ['Source Type', item.sourceType], ['Status (raw)', item.lifecycleState]);
    metadataPairs.push(['Confidence', `${Math.round((item.confidence || 0) * 100)}%`]);
  }
  const metadata = renderKvList(metadataPairs);

  // Confidence Score explainability, Dependency Graph, Knowledge Graph,
  // and Explainability are all engine-named/internal — Developer only.
  const confidenceExplain = confidence.explainConfidenceAsEvidence(item);
  const evidence = devMode && confidenceExplain.ok && confidenceExplain.data.length
    ? renderKvList(confidenceExplain.data.map((e) => [e.kind, e.rationale]))
    : null;

  const depsResult = dependencyGraph.getDependencies(item.id);
  const relationships = devMode && depsResult.ok && depsResult.data.length
    ? renderKvList(depsResult.data.map((d) => [d.payload && d.payload.type, `${d.payload && d.payload.fromId} → ${d.payload && d.payload.toId}`]))
    : null;

  const neighborsResult = knowledgeGraph.getNeighbors(item.id);
  const dependencies = devMode && neighborsResult.ok && neighborsResult.data.length
    ? renderKvList(neighborsResult.data.map((n) => [n.neighborId, `${n.direction} · ${n.neighbor ? kindLabel(n.neighbor.kind) : 'tidak ditemukan'}`]))
    : null;

  const historyResult = knowledgeGetHistory(item.id);
  const versions = historyResult.ok ? historyResult.data : [];
  const versionHistory = versions.length ? renderKvList(versions.map((v) => [`Versi ${v.version}`, `${devMode ? v.lifecycleState : lifecycleLabel(v.lifecycleState)} · ${v.updatedAt}`])) : null;
  const approvalHistory = versions.filter((v) => v.lifecycleState === LIFECYCLE_STATE.APPROVED).length
    ? renderKvList(versions.filter((v) => v.lifecycleState === LIFECYCLE_STATE.APPROVED).map((v) => [`Versi ${v.version}`, `oleh ${v.approvedBy || '—'} pada ${v.approvedAt || '—'}`]))
    : null;

  const explainResult = explainability.explain(item);
  const explainHtml = !devMode ? null : (explainResult.ok
    ? renderKvList([
      ['Dipelajari Dari', explainResult.data.whereLearned && explainResult.data.whereLearned.connectorId],
      ['Jumlah Korroborasi', explainResult.data.corroborationCount],
      ['Disetujui Oleh', explainResult.data.approvedBy],
      ['Alasan Preferensi', explainResult.data.whyPreferred],
    ])
    : renderEmptyState('Explainability tersedia hanya untuk item dengan provenance yang valid.'));

  const profileTypes = profiles.listProfileTypes();
  const profileLinks = profileTypes
    .map((pt) => ({ pt, r: profiles.buildProfile(item.domainType, pt) }))
    .filter((x) => x.r.ok);
  const profileLink = profileLinks.length
    ? renderKvList(profileLinks.map((x) => [x.pt, `${x.r.profile.sampleCount} sampel`]))
    : renderEmptyState('Belum ada Profile yang terbangun untuk domain ini.');

  // Dataset Link — the raw Dataset Type value is Developer-only.
  const datasetLink = (() => {
    const ds = listDatasets({ domainType: item.domainType });
    if (!ds.length) return renderEmptyState('Belum ada dataset terdaftar untuk domain ini.');
    return renderKvList(ds.map((d) => [d.name, devMode ? d.datasetType : '—']));
  })();

  const archiveLink = (() => {
    const records = safeList(archiveList, { sourceDomainType: item.domainType }).filter(checkKnowledgeContribution);
    return records.length ? renderKvList(records.map((r) => [r.documentNumber, r.archivedAt])) : renderEmptyState('Belum ada Archive Record yang tertaut ke domain ini.');
  })();

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Detail — ${esc(devMode ? item.id : kindLabel(item.kind))}</div>
      ${renderGovernancePanel(item)}
      ${renderDetail([
        renderDetailSection('Metadata', metadata),
        renderDetailSection('Asal & Alasan (Mengapa pengetahuan ini ada?)', renderProvenance(item)),
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

/** Part 4 — HUMAN GOVERNANCE. The only place in the platform where a human
 *  decides that knowledge is true of the organization.
 *
 *  The operational pipeline stays fully autonomous: it produces Drafts without
 *  asking anyone. What it may NOT do — and what the Knowledge Service now
 *  refuses at the door (knowledge-service.js#INGESTABLE_STATES) — is call that
 *  knowledge approved. That is this panel's job, and nothing else's.
 *
 *  Which buttons appear is decided by the item's real state, not by taste:
 *    Draft / Candidate / Pending Review  → Approve · Request Changes · Reject
 *    Approved                            → Archive (supersede)
 *    Deprecated                          → nothing; it is retired.
 */
function renderGovernancePanel(item) {
  const state = item.lifecycleState;
  const noteField = `
    <div class="wlk-form-row">
      <label>Alasan / Rasional Keputusan</label>
      <input data-act="kc-gov-note" class="wlk-input" type="text" value="${esc(st.govNote)}"
             placeholder="Mengapa Anda menyetujui atau menolak pengetahuan ini?"/>
    </div>`;
  const errorLine = st.govError
    ? `<div class="wlk-row-secondary" style="color:var(--danger,#c0392b);">${esc(st.govError)}</div>` : '';

  if (state === LIFECYCLE_STATE.DEPRECATED) {
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Tata Kelola</div>
        ${renderEmptyState('Pengetahuan ini sudah tidak berlaku.', 'Tidak ada tindakan tata kelola yang tersisa.')}
      </div>`;
  }

  if (state === LIFECYCLE_STATE.APPROVED) {
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Tata Kelola</div>
        <p class="wlk-page-lede">Pengetahuan ini sudah disetujui dan berlaku bagi organisasi. Mengarsipkannya berarti menyatakan pengetahuan ini tidak lagi berlaku (supersession) — riwayatnya tetap utuh.</p>
        ${noteField}
        ${errorLine}
        <button class="wlk-btn wlk-btn--ghost" data-act="kc-gov-archive" data-id="${esc(item.id)}" type="button">Arsipkan (Tidak Berlaku Lagi)</button>
      </div>`;
  }

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Tata Kelola</div>
      <p class="wlk-page-lede">Pipeline sudah menghasilkan pengetahuan ini secara otomatis. Yang tersisa adalah satu keputusan yang hanya bisa diambil manusia: apakah ini benar bagi organisasi?</p>
      ${noteField}
      ${errorLine}
      <button class="wlk-btn" data-act="kc-gov-approve" data-id="${esc(item.id)}" type="button">Setujui</button>
      <button class="wlk-btn wlk-btn--ghost" data-act="kc-gov-changes" data-id="${esc(item.id)}" type="button">Minta Perubahan</button>
      <button class="wlk-btn wlk-btn--ghost" data-act="kc-gov-reject" data-id="${esc(item.id)}" type="button">Tolak</button>
    </div>`;
}

/** Part 6 — EXPLAINABILITY. "Why does this knowledge exist?", answered from
 *  data the item and its history already carry. Every field is real or null —
 *  a missing origin is reported as missing, never filled with a plausible
 *  guess. Deliberately NOT Developer-gated: a person being asked to approve
 *  knowledge on behalf of the organization is exactly the person who needs to
 *  see where it came from. */
function renderProvenance(item) {
  const result = explainKnowledge(item.id);
  if (!result.ok) return null;
  const x = result.data;

  // The Service hands back a bare importSessionId; the UI resolves it, because
  // the UI is the layer allowed to see both domains.
  let originDoc = '—';
  let originDetail = null;
  if (x.importSessionId) {
    const session = getImportSession(x.importSessionId);
    if (session.ok) {
      const s = session.data;
      originDoc = s.filename;
      originDetail = `${s.kind} · ${s.state}${typeof s.confidence === 'number' ? ` · confidence unggahan ${s.confidence}` : ''}`;
    } else {
      originDoc = `Sesi impor ${x.importSessionId} tidak ditemukan lagi`;
    }
  }

  const pairs = [
    ['Dokumen Asal', originDoc],
    ...(originDetail ? [['Detail Dokumen', originDetail]] : []),
    ['Sumber', x.origin.connectorId || x.origin.sourceType || '—'],
    ['Direkam Pada', x.origin.capturedAt || '—'],
    ['Alasan Ekstraksi', x.extractionRationale ? (x.extractionRationale.notes || x.extractionRationale.normalizerId || '—') : 'Tidak ada catatan normalisasi'],
    ['Keyakinan', x.confidence === null ? '—' : `${Math.round(x.confidence * 100)}%`],
    ['Suntingan Manual', x.manualEdits.length ? `${x.manualEdits.length} kali (versi ${x.manualEdits.map((e) => e.version).join(', ')})` : 'Belum pernah disunting'],
    ['Riwayat Keputusan', x.approvalHistory.length
      ? x.approvalHistory.map((a) => `v${a.version}: ${a.fromState || 'baru'} → ${a.toState}${a.by ? ` oleh ${a.by}` : ''}${a.rationale ? ` (${a.rationale})` : ''}`).join(' · ')
      : 'Belum ada keputusan'],
    ['Jumlah Versi', String(x.versionHistory.length)],
  ];
  return renderKvList(pairs);
}

/* ── Review (Review Queue / Candidate Queue / Rejected) ────────────── */

function renderReviewSection() {
  const filters = [
    { id: 'pending', label: 'Review Queue' },
    { id: 'candidate', label: 'Candidate Queue' },
    { id: 'rejected', label: 'Rejected' },
  ];

  // Sprint 0 (Presentation Truth) — the row used to show the bare
  // Knowledge Item Id always; Normal Mode now shows the item's kind label
  // instead (Developer Mode keeps the raw id).
  const kindLabelFor = (itemId) => {
    const r = knowledgeGetById(itemId);
    return r.ok ? kindLabel(r.data.kind) : itemId;
  };

  let rows = [];
  if (st.reviewFilter === 'pending') {
    rows = getReviewQueue().map((e) => ({ id: e.itemId, primary: kindLabelFor(e.itemId), meta: e.hasConflict ? 'Konflik terdeteksi' : 'Menunggu review' }));
  } else if (st.reviewFilter === 'candidate') {
    rows = getCandidateQueue().map((e) => ({ id: e.itemId, primary: kindLabelFor(e.itemId), meta: e.hasConflict ? 'Konflik terdeteksi' : 'Menunggu pengajuan' }));
  } else {
    rows = deriveRejectedFromCandidateQueue(getCandidateQueue(), knowledgeGetHistory).map((e) => ({ id: e.itemId, primary: kindLabelFor(e.itemId), meta: `Ditolak pada versi ${e.rejectedAtVersion}` }));
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
          <li class="wlk-row" data-act="kc-item-row" data-id="${esc(row.id)}" data-clickable="1">
            <span class="wlk-row-primary">${esc(isDeveloperMode() ? row.id : row.primary)}</span>
            <span class="wlk-row-secondary">${esc(row.meta)}</span>
          </li>`) : renderEmptyState(`Tidak ada item pada "${filters.find((f) => f.id === st.reviewFilter).label}".`)}
      </div>

      ${st.selectedId ? renderItemDetail(st.selectedId) : ''}
    </div>`;
}
