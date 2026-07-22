/* ============================================================
   ARCHIVE-CENTER.JS — Archive Center workspace (V2.0.18)

   Sibling of NOR Center under Sarpras Intelligence — mounted by
   ./sarpras-intelligence-center.js when its "archive" screen is shown,
   owning its own internal navigation (Dashboard / Records / Timeline /
   Datasets / Upload Queue / Review), exactly as nor-center.js already
   does for its own tabs.

   SCOPE: this is the CROSS-DOMAIN generalization of the Organizational
   Memory engines nor-center.js's own "Archive" tab already calls scoped
   to domainType:'nor' — this file calls the SAME engines with no domain
   filter (or a caller-chosen domain filter) rather than a second
   implementation. nor-center.js's Archive tab is left completely
   untouched; this file does not import from or modify it.

   REUSE, NEVER DUPLICATE: every number here traces to an existing
   Organizational Memory / Knowledge engine call — see the import list.
   The only two things genuinely NEW are (a) the "Official/Bootstrap/
   Synthetic Archive" tabs, which are Dataset-classification views (an
   existing, deliberately SEPARATE concept from ArchiveRecord — see
   dataset-contract.js's DATASET_TYPE, confirmed product decision), and
   (b) the "Rejected" view, which is a pure composition derivation (see
   workspace-list-kit.js#deriveRejectedFromCandidateQueue) since no
   `rejected` lifecycle state exists.
   ============================================================ */

'use strict';

import {
  computeArchiveHealth, getArchiveTimeline, buildUploadRecommendations,
  getGapsWithWorkflowState, flagGapForUpload, resolveGap, checkKnowledgeContribution, GAP_STATUS,
  findArchiveRecord as archiveGetById, getArchiveHistory as archiveGetHistory,
  listArchive as archiveList, searchArchive as archiveSearch,
  // Phase 4 — Archive's lifecycle, explainability and relationships, reached
  // ONLY through the Archive Service. Before this phase this workspace could
  // say nothing about a document beyond its metadata: there was no state to
  // show, no reason it was archived, and no link to anything else.
  explainArchiveRecord, getArchiveRelationships, getReplacementChain,
  restoreDocument, deprecateDocument,
  ARCHIVE_STATE, ARCHIVE_STATE_DEFS,
} from '../../../src/organizational-memory/index.js';

import {
  listKnowledge as knowledgeList,
  getKnowledge as knowledgeGetById,
  getKnowledgeHistory as knowledgeGetHistory,
} from '../knowledge/services/knowledge-service.js';
import { LIFECYCLE_STATE, LIFECYCLE_STATE_DEFS } from '../knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../knowledge/contracts/identity-contract.js';
import { listDomainTypes, getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { getKind } from '../knowledge/registry/kind-registry.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import { listPacks } from '../knowledge/datasets/registry/pack-registry.js';
import { DATASET_TYPE } from '../knowledge/datasets/contracts/dataset-contract.js';
import { computeDiff } from '../knowledge/learning/diff-engine.js';
import { getReviewQueue, getCandidateQueue } from '../knowledge/review/review-queue-engine.js';
import { IMPORT_SESSION_STATE } from '../knowledge/datasets/import-session/contracts/import-session-contract.js';
import { listImportSessions } from '../knowledge/datasets/import-session/import-session-engine.js';
import { listBatches, BATCH_STATUS } from '../knowledge/datasets/import-session/import-batch-engine.js';
import { listStoredFiles } from '../../../src/file-storage/file-storage-registry.js';

import {
  esc, renderEmptyState, renderTabShell, renderRowList, renderStatCards,
  renderFilterBar, renderSearchBox, renderDetailSection, renderKvList,
  renderDetail, renderDiffTable, deriveRejectedFromCandidateQueue, formatFileSize,
  isDeveloperMode,
} from './shared/workspace-list-kit.js';
import { createDatasetImportController, reviewReasons } from './dataset-import-center.js';
import {
  registerImportSessionChangeListener, registerImportBatchChangeListener,
} from '../knowledge/services/import-session-service.js';
import { registerChangeListener as registerFileStorageChangeListener } from '../../../src/file-storage/file-storage-registry.js';

// Experience Architecture phase — this screen is what a normal PBSI user
// reaches as "Documents" (see js/app.js's nav button + Part 1's audit,
// which found "Archive"/"Review" as literal, untranslated engineering
// words a first-time user would not recognize). Only `label` and tab
// ORDER changed — every `id` is byte-identical, so `RENDERERS[st.section]`
// and every existing data-id reference below is completely unaffected.
// "Unggah" (upload) moves first: Part 3/6's "Documents is the primary
// workspace, and its primary action is adding a document" — landing here
// (including from Home's "Unggah Dokumen" quick action) should not need a
// second click to find the upload zone.
const SECTIONS = [
  { id: 'dashboard', label: 'Ringkasan' },
  { id: 'import', label: 'Unggah' },
  { id: 'records', label: 'Semua Dokumen' },
  { id: 'uploadQueue', label: 'Antrean Unggah' },
  { id: 'timeline', label: 'Linimasa' },
  { id: 'datasets', label: 'Dataset Terkait' },
  { id: 'review', label: 'Tinjauan' },
];

// V2.1 — one controller instance for this workspace, unscoped (cross-
// domain), mirroring how this file already calls every Organizational
// Memory engine cross-domain rather than per-domain. See
// ./dataset-import-center.js's header for why this must be a per-
// workspace instance, not a shared module-level singleton.
const importController = createDatasetImportController({});

const DATASET_TABS = [
  { id: DATASET_TYPE.OFFICIAL, label: 'Official Archive' },
  { id: DATASET_TYPE.TRAINING, label: 'Bootstrap Archive' },
  { id: DATASET_TYPE.SYNTHETIC, label: 'Synthetic Archive' },
];

const st = {
  section: 'dashboard',
  recordDomainFilter: null,   // null = all domains
  recordSearch: '',
  recordSelectedId: null,
  timelineDomainFilter: null,
  datasetTab: DATASET_TYPE.OFFICIAL,
  reviewFilter: 'pending',    // 'pending' | 'approved' | 'rejected'
  // Phase 4 — the Archive lifecycle panel. `archiveNote` is the human's reason;
  // a document declared no-longer-valid without one is a change nobody can
  // account for later.
  archiveNote: '',
  archiveError: null,
};

let host = null;
let contentEl = null;
let mounted = false;
let importPipelineLiveStarted = false;

// Sprint 1 (Autonomy Closure, Part 3/10) — same coalesced-render idiom
// knowledge-center.js/learning-dashboard.js already use.
let _liveRenderTimer = null;
function scheduleLiveRender() {
  if (_liveRenderTimer) return;
  _liveRenderTimer = setTimeout(() => { _liveRenderTimer = null; render(); }, 100);
}

/** Phase 1 (Operational Engine Hardening) — cross-tab realtime sync,
 *  mirroring nor-center.js's ensureImportPipelineLive() exactly. The
 *  underlying RTDB sync is already started once, unconditionally, by
 *  sarpras-intelligence-center.js's mount; this only registers the
 *  re-render hook so a change made in another browser tab is reflected
 *  here without a manual refresh. Guarded so it only ever runs once.
 *  Sprint 1 — previously only re-rendered while `st.section` was
 *  'dashboard'/'import'; every other internal tab (Records/Timeline/
 *  Datasets/Upload Queue/Review) sat stale until manually clicked away
 *  and back. Now re-renders whichever tab is active, matching how
 *  knowledge-center.js/learning-dashboard.js already behave. */
function ensureImportPipelineLive() {
  if (importPipelineLiveStarted) return;
  importPipelineLiveStarted = true;
  registerImportSessionChangeListener(scheduleLiveRender);
  registerImportBatchChangeListener(scheduleLiveRender);
  registerFileStorageChangeListener(scheduleLiveRender);
}

/* ── mount / teardown ─────────────────────────────────────────────── */

export async function mountArchiveCenter(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('wlk-root');
  if (!mounted) {
    mounted = true;
    host.innerHTML = renderTabShell(SECTIONS, st.section, { ariaLabel: 'Archive Center' });
    contentEl = host.querySelector('.wlk-content');
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    host.addEventListener('change', onChange);
    // V2.1 — real drag & drop (Part F). dragover must call preventDefault()
    // or the browser's default "open file" navigation intercepts the drop.
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

export function closeArchiveCenter() { /* shell hides the host; state is retained */ }

/* ── render dispatch ──────────────────────────────────────────────── */

const RENDERERS = {
  dashboard: renderDashboardSection,
  records: renderRecordsSection,
  timeline: renderTimelineSection,
  datasets: renderDatasetsSection,
  uploadQueue: renderUploadQueueSection,
  import: () => importController.render(),
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
  if (act.startsWith('dic-')) { importController.onClick(el, render); return; }
  if (act === 'wlk-tab') { setSection(el.dataset.id); return; }
  if (act === 'ac-domain-filter') { st.recordDomainFilter = el.dataset.id === '__all' ? null : el.dataset.id; st.recordSelectedId = null; render(); return; }
  if (act === 'ac-timeline-domain') { st.timelineDomainFilter = el.dataset.id === '__all' ? null : el.dataset.id; render(); return; }
  if (act === 'ac-dataset-tab') { st.datasetTab = el.dataset.id; render(); return; }
  if (act === 'ac-review-filter') { st.reviewFilter = el.dataset.id; render(); return; }
  if (act === 'ac-record-row') { st.recordSelectedId = st.recordSelectedId === el.dataset.id ? null : el.dataset.id; st.archiveNote = ''; st.archiveError = null; render(); return; }
  // Phase 4, Part 3 — the Archive lifecycle, operated by a human. These are the
  // callers restoreDocument()/deprecateDocument() exist for; a transition verb
  // with no caller is dead code, which is exactly the defect Phase 3 removed.
  // Note there is no Delete: archive is append-only, and an organizational
  // memory that can forget on request is not a memory.
  if (act === 'ac-arch-deprecate' || act === 'ac-arch-restore') {
    const note = st.archiveNote.trim();
    const result = act === 'ac-arch-deprecate'
      ? deprecateDocument(el.dataset.id, { actorId: 'evan', reason: note || null })
      : restoreDocument(el.dataset.id, { actorId: 'evan', reason: note || null });
    // Report the engine's REAL error rather than failing silently.
    st.archiveError = result.ok ? null : (result.error ? result.error.message : 'Tindakan gagal.');
    if (result.ok) st.archiveNote = '';
    render(); return;
  }
  // Phase 3, Part 8 — the two writers gap-workflow-engine.js had been waiting
  // for since V2.0.7. Before these, its state Map could never be written, and
  // both this screen and the Executive Briefing counted a number that was
  // structurally incapable of being anything but zero.
  if (act === 'ac-gap-flag') { flagGapForUpload(el.dataset.domain, el.dataset.number); render(); return; }
  if (act === 'ac-gap-resolve') { resolveGap(el.dataset.domain, el.dataset.number); render(); return; }
}

function onInput(e) {
  // State only — never re-render on a keystroke, or the focused input is
  // destroyed mid-word (the lesson dataset-import-center.js already learned).
  const noteEl = e.target && e.target.closest ? e.target.closest('[data-act="ac-arch-note"]') : null;
  if (noteEl) { st.archiveNote = noteEl.value; return; }
  if (e.target && e.target.id === 'acRecordSearch') {
    st.recordSearch = e.target.value;
    render();
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

function safeList(fn, filter) {
  const result = fn(filter);
  return result.ok ? result.data : [];
}

function allDomainTypeIds() {
  return listDomainTypes().map((d) => d.id);
}

function domainLabel(id) {
  const registered = getDomainType(id);
  return registered ? registered.label : id;
}

/** Sprint 0 (Presentation Truth) — friendly label for a Knowledge `kind`
 *  id (e.g. "policy" -> "Policy"), same registry lookup pattern
 *  domainLabel() above already uses for domainType. */
function kindLabel(id) {
  const k = getKind(id);
  return k ? k.label : id;
}

/** Sprint 0 — the registered human label (e.g. "Pending Review") instead
 *  of the raw lowercase enum id (e.g. "pending_review") a normal user
 *  should never see. */
function lifecycleLabel(id) {
  const def = LIFECYCLE_STATE_DEFS.find((d) => d.id === id);
  return def ? def.label : id;
}

function findKnowledgeIdForRecord(record) {
  try {
    return generateKnowledgeId({ domainType: record.sourceDomainType, sourceType: record.sourceDomainType, sourceRef: record.sourceId });
  } catch {
    return null;
  }
}

/* ── Dashboard (Dashboard + Statistics) ───────────────────────────── */

/** V2.1.2 Part O — Operational Dashboard: real counts only, every number
 *  a direct tally over Import Session / Batch / Storage ledger state —
 *  never a second computation of what those engines already track. */
function computeOperationalStats() {
  const sessionsResult = listImportSessions({});
  const sessions = sessionsResult.ok ? sessionsResult.data : [];
  const batchesResult = listBatches({});
  const batches = batchesResult.ok ? batchesResult.data : [];
  const storedFiles = listStoredFiles();

  const processing = batches.filter((b) => b.status === BATCH_STATUS.PROCESSING).length;
  const paused = batches.filter((b) => b.status === BATCH_STATUS.PAUSED).length;
  const completed = batches.filter((b) => b.status === BATCH_STATUS.COMPLETED).length;
  const queued = sessions.filter((s) => s.state === IMPORT_SESSION_STATE.UPLOADED).length;
  // Phase 1 (Operational Engine Hardening) — reuses the SAME exception
  // logic the Dataset Import Center's own "Perlu Perhatian" filter uses
  // (Low Confidence / Duplicate Ambiguity / Unsupported Format / Missing
  // Content Facts), not a narrower re-derived count. Previously this only
  // counted hard validationErrors, disagreeing with the Queue's own filter.
  const needsAttention = sessions.filter((s) => reviewReasons(s).length > 0).length;
  const knowledgeProduced = sessions.filter((s) => !!s.knowledgeItemId).length;
  const storageConsumedBytes = storedFiles.reduce((n, f) => n + (f.sizeBytes || 0), 0);
  // Duplicate Savings — real bytes NOT re-uploaded thanks to dedup: every
  // extra linkedSessionIds entry beyond the first represents one upload
  // that was skipped because the content already existed.
  const duplicateSavingsBytes = storedFiles.reduce((n, f) => n + Math.max(0, f.linkedSessionIds.length - 1) * (f.sizeBytes || 0), 0);

  return { processing, queued, paused, needsAttention, completed, knowledgeProduced, storageConsumedBytes, duplicateSavingsBytes };
}

function renderDashboardSection() {
  const globalHealth = computeArchiveHealth(undefined);
  const perDomain = allDomainTypeIds().map((id) => ({ id, health: computeArchiveHealth(id) })).filter((d) => d.health.totalArchived > 0);
  const ops = computeOperationalStats();

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">ARCHIVE CENTER</div>
        <h1 class="wlk-page-title">Archive Center</h1>
        <p class="wlk-page-lede">Arsip organisasi lintas domain — status, linimasa, dataset terkait, dan antrean review dalam satu tempat.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Operational Dashboard — Impor Dataset</div>
        ${renderStatCards([
          { count: ops.processing, label: 'Processing Uploads' },
          { count: ops.queued, label: 'Queued Uploads' },
          { count: ops.paused, label: 'Paused Uploads' },
          { count: ops.needsAttention, label: 'Perlu Perhatian' },
          { count: ops.completed, label: 'Completed Uploads' },
          { count: ops.knowledgeProduced, label: 'Knowledge Produced' },
          { count: formatFileSize(ops.storageConsumedBytes), label: 'Storage Consumed' },
          { count: formatFileSize(ops.duplicateSavingsBytes), label: 'Duplicate Savings' },
        ])}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Kesehatan Arsip (Semua Domain)</div>
        ${renderStatCards([
          { count: globalHealth.healthScore, label: 'Skor Kesehatan' },
          { count: globalHealth.totalArchived, label: 'Total Terarsip' },
          { count: globalHealth.openGapCount, label: 'Gap Terbuka' },
          { count: `${globalHealth.knowledgeContributionPct}%`, label: 'Kontribusi Pengetahuan' },
        ])}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Statistik per Domain</div>
        ${perDomain.length ? renderRowList(perDomain, (d) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(domainLabel(d.id))}</span>
            <span class="wlk-row-secondary">${d.health.totalArchived} terarsip · skor ${d.health.healthScore}</span>
          </li>`) : renderEmptyState('Belum ada domain dengan arsip.', 'Statistik per domain akan muncul setelah ada dokumen terarsip.')}
      </div>
    </div>`;
}

/* ── Records (Search + Filter + List + Detail Viewer) ────────────── */

function renderRecordsSection() {
  const domains = allDomainTypeIds();
  const filterChips = [{ id: '__all', label: 'Semua Domain' }, ...domains.map((id) => ({ id, label: domainLabel(id) }))];
  const activeFilterId = st.recordDomainFilter || '__all';

  let records = st.recordSearch.trim() ? safeList(archiveSearch, st.recordSearch.trim()) : safeList(archiveList, st.recordDomainFilter ? { sourceDomainType: st.recordDomainFilter } : {});
  if (st.recordSearch.trim() && st.recordDomainFilter) records = records.filter((r) => r.sourceDomainType === st.recordDomainFilter);

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">ARCHIVE CENTER · ARSIP</div>
        <h1 class="wlk-page-title">Daftar Arsip</h1>
        <p class="wlk-page-lede">Cari dan telusuri setiap dokumen terarsip di seluruh domain organisasi.</p>
      </div>

      <div class="wlk-sec">
        ${renderSearchBox(st.recordSearch, 'Cari berdasarkan nomor dokumen…', { inputId: 'acRecordSearch' })}
      </div>

      <div class="wlk-sec">
        ${renderFilterBar(filterChips, activeFilterId, { act: 'ac-domain-filter' })}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Dokumen (${records.length})</div>
        ${records.length ? renderRowList(records, (r) => `
          <li class="wlk-row" data-act="ac-record-row" data-id="${esc(r.id)}" data-clickable="1">
            <span class="wlk-row-primary">${esc(r.documentNumber)} — ${esc(domainLabel(r.sourceDomainType))}</span>
            <span class="wlk-row-secondary">${esc(r.documentDate || r.archivedAt || '—')}</span>
          </li>`) : renderEmptyState('Tidak ada dokumen yang cocok.', 'Coba ubah kata kunci pencarian atau filter domain.')}
      </div>

      ${st.recordSelectedId ? renderRecordDetail(st.recordSelectedId) : ''}
    </div>`;
}

function renderRecordDetail(id) {
  const record = archiveGetById(id);
  if (!record.ok) return '';
  const r = record.data;
  const devMode = isDeveloperMode();
  const history = safeList(archiveGetHistory, id);
  const knowledgeId = findKnowledgeIdForRecord(r);
  const contributed = checkKnowledgeContribution(r);
  const linkedKnowledge = contributed && knowledgeId ? knowledgeGetById(knowledgeId) : null;

  // Sprint 0 (Presentation Truth) — Sumber (raw sourceType) and Hash
  // Dokumen (internal content hash) are Developer-only; Normal Mode never
  // sees them.
  const metadataPairs = [
    ['Nomor Dokumen', r.documentNumber],
    ['Domain', domainLabel(r.sourceDomainType)],
    ['Tanggal Dokumen', r.documentDate],
    ['Dari', r.senderOrigin],
    ['Diarsipkan', r.archivedAt],
    ['Diperbarui', r.updatedAt],
  ];
  if (devMode) metadataPairs.splice(4, 0, ['Sumber', r.sourceType], ['Hash Dokumen', r.documentHash]);
  const metadata = renderKvList(metadataPairs);

  const evidence = renderKvList(Object.entries(r.sourceSnapshot || {}));

  const relationships = contributed
    ? renderKvList([['Knowledge Terkait', linkedKnowledge && linkedKnowledge.ok
      ? `${kindLabel(linkedKnowledge.data.kind)} (${devMode ? linkedKnowledge.data.lifecycleState : lifecycleLabel(linkedKnowledge.data.lifecycleState)})`
      : knowledgeId]])
    : renderEmptyState('Belum ada Knowledge yang terhubung ke dokumen ini.');

  const historyList = history.length ? renderKvList(history.map((v) => [`Versi ${v.version}`, v.updatedAt])) : null;

  // Diff Viewer shows raw field/before/after JSON — internal, Developer only.
  let diffHtml = null;
  if (devMode && history.length >= 2) {
    const diff = computeDiff(history[history.length - 2], history[history.length - 1]);
    diffHtml = renderDiffTable(diff);
  }

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Detail — ${esc(r.documentNumber)}</div>
      ${renderDetail([
        renderDetailSection('Metadata', metadata),
        renderDetailSection('Asal & Alasan (Mengapa dokumen ini ada?)', renderArchiveProvenance(r)),
        renderDetailSection('Hubungan Dokumen', renderArchiveRelationships(r)),
        renderDetailSection('Rantai Penggantian', renderReplacementChain(r)),
        renderDetailSection('Evidence (Snapshot Sumber)', evidence),
        renderDetailSection('Relationships', relationships),
        renderDetailSection('History &amp; Version', historyList),
        renderDetailSection('Diff Viewer (versi terakhir vs sebelumnya)', diffHtml),
      ])}
      ${renderArchiveLifecyclePanel(r)}
    </div>`;
}

/** Phase 4, Part 4 — "Nothing should exist without provenance."
 *
 *  Every field is a REAL recorded fact on the record, or null. Before this
 *  phase an ArchiveRecord could answer none of these questions: it had no
 *  state, no reason, no actor, no link to the upload that produced it and no
 *  link to the knowledge it became. It was a row. */
function renderArchiveProvenance(r) {
  const result = explainArchiveRecord(r.id);
  if (!result.ok) return null;
  const x = result.data;
  const pairs = [
    ['Status', archiveStateLabel(x.state)],
    ['Alasan Diarsipkan', x.archiveReason || '—'],
    ['Diarsipkan Oleh', x.archivedBy || '—'],
    ['Diarsipkan Pada', x.archivedAt || '—'],
    ['Konektor Sumber', x.sourceConnector || '—'],
    ['Sesi Impor Asal', x.importSessionId || '—'],
    ['Menjadi Knowledge', x.knowledgeItemId || 'Belum'],
    ['Dataset', x.datasetId || '—'],
  ];
  if (x.duplicateOf) {
    pairs.push(['Duplikat Dari', `${x.duplicateOf.documentNumber || x.duplicateOf.id} — ${x.duplicateOf.kind || 'duplikat'}`]);
    if (x.duplicateOf.rationale) pairs.push(['Alasan Duplikat', x.duplicateOf.rationale]);
  }
  if (x.lifecycleHistory.length) {
    pairs.push(['Riwayat Siklus Hidup',
      x.lifecycleHistory.map((h) => `v${h.version}: ${h.fromState || 'baru'} → ${h.toState}${h.reason ? ` (${h.reason})` : ''}`).join(' · ')]);
  }
  return renderKvList(pairs);
}

/** Phase 4, Part 5 — Archive is no longer a flat list. Every relationship shown
 *  is deterministic: a recorded reference, or a pure function of facts already
 *  present (an identical hash, an identical document number). Nothing is
 *  scored, and nothing is guessed. */
function renderArchiveRelationships(r) {
  const result = getArchiveRelationships(r.id);
  if (!result.ok || !result.data.length) {
    return renderEmptyState('Dokumen ini belum memiliki hubungan dengan dokumen lain.', 'Hubungan muncul otomatis saat ada duplikat, revisi, atau dokumen turunan.');
  }
  return renderKvList(result.data.map((rel) => [rel.type, `${rel.targetId || '—'} — ${rel.rationale}`]));
}

function renderReplacementChain(r) {
  const result = getReplacementChain(r.id);
  if (!result.ok || result.data.length < 2) return null; // a chain of one is not a chain
  return renderRowList(result.data, (c) => `
    <li class="wlk-row"${c.id !== r.id ? ` data-act="ac-record-row" data-id="${esc(c.id)}" data-clickable="1"` : ''}>
      <span class="wlk-row-primary">${esc(c.documentNumber)}${c.id === r.id ? ' (dokumen ini)' : ''}</span>
      <span class="wlk-row-secondary">${esc(archiveStateLabel(c.state))} · ${esc(c.archivedAt)}</span>
    </li>`);
}

/** Phase 4, Part 3 — the Archive lifecycle, made operable.
 *
 *  These are the callers the Archive Service's transition verbs exist for. A
 *  verb with no caller is dead code — the exact reader-without-writer defect
 *  Phase 3 spent itself removing — so they are wired here, where a human can
 *  actually make the decision they encode.
 *
 *  Note what is NOT here: there is no Delete. Archive is append-only, and an
 *  organizational memory that can forget on request is not a memory. */
function renderArchiveLifecyclePanel(r) {
  if (r.state === ARCHIVE_STATE.DUPLICATE) {
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Siklus Hidup Arsip</div>
        ${renderEmptyState('Dokumen ini adalah duplikat.', `Isinya identik dengan dokumen ${r.duplicateOfId || 'lain'} yang sudah diarsipkan. Duplikat tidak dapat dipulihkan menjadi dokumen utama — pulihkan dokumen aslinya.`)}
      </div>`;
  }
  const noteField = `
    <div class="wlk-form-row">
      <label>Alasan</label>
      <input data-act="ac-arch-note" class="wlk-input" type="text" value="${esc(st.archiveNote)}" placeholder="Mengapa dokumen ini tidak lagi berlaku, atau mengapa dipulihkan?"/>
    </div>`;
  const errorLine = st.archiveError
    ? `<div class="wlk-row-secondary" style="color:var(--danger,#c0392b);">${esc(st.archiveError)}</div>` : '';

  const canRestore = r.state === ARCHIVE_STATE.SUPERSEDED || r.state === ARCHIVE_STATE.DEPRECATED;
  const canDeprecate = r.state === ARCHIVE_STATE.AVAILABLE || r.state === ARCHIVE_STATE.REFERENCED;

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Siklus Hidup Arsip</div>
      <p class="wlk-page-lede">Arsip bersifat append-only — dokumen tidak pernah dihapus, hanya digantikan atau dinyatakan tidak berlaku. Riwayatnya selalu utuh.</p>
      ${noteField}
      ${errorLine}
      ${canDeprecate ? `<button class="wlk-btn wlk-btn--ghost" data-act="ac-arch-deprecate" data-id="${esc(r.id)}" type="button">Nyatakan Tidak Berlaku</button>` : ''}
      ${canRestore ? `<button class="wlk-btn" data-act="ac-arch-restore" data-id="${esc(r.id)}" type="button">Pulihkan</button>` : ''}
    </div>`;
}

function archiveStateLabel(state) {
  const def = ARCHIVE_STATE_DEFS.find((d) => d.id === state);
  return def ? def.label : (state || '—');
}

/* ── Timeline ──────────────────────────────────────────────────────── */

function renderTimelineSection() {
  const domains = allDomainTypeIds();
  const filterChips = [{ id: '__all', label: 'Semua Domain' }, ...domains.map((id) => ({ id, label: domainLabel(id) }))];
  const activeFilterId = st.timelineDomainFilter || '__all';
  const entries = getArchiveTimeline(st.timelineDomainFilter || undefined);

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">ARCHIVE CENTER · LINIMASA</div>
        <h1 class="wlk-page-title">Linimasa Arsip</h1>
        <p class="wlk-page-lede">Urutan kronologis dokumen terarsip, lintas domain atau per domain.</p>
      </div>

      <div class="wlk-sec">${renderFilterBar(filterChips, activeFilterId, { act: 'ac-timeline-domain' })}</div>

      <div class="wlk-sec">
        ${entries.length ? renderRowList(entries, (e) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(e.documentNumber)}</span>
            <span class="wlk-row-secondary">${esc(e.documentDate || e.archivedAt || '—')}${e.hasContributedKnowledge ? ' · berkontribusi' : ''}</span>
          </li>`) : renderEmptyState('Belum ada entri pada linimasa arsip.')}
      </div>
    </div>`;
}

/* ── Datasets (Official / Bootstrap / Synthetic Archive) ──────────── */

function renderDatasetsSection() {
  const datasets = listDatasets({ datasetType: st.datasetTab });
  const packs = listPacks({}).filter((p) => datasets.some((d) => d.datasetId === p.datasetId));

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">ARCHIVE CENTER · DATASET TERKAIT</div>
        <h1 class="wlk-page-title">Dataset Terkait</h1>
        <p class="wlk-page-lede">Official, Bootstrap dan Synthetic Archive dilihat melalui registry Dataset &amp; Pack — sebuah tabel yang terpisah secara sengaja dari Arsip Dokumen di atas.</p>
      </div>

      <div class="wlk-sec">${renderFilterBar(DATASET_TABS, st.datasetTab, { act: 'ac-dataset-tab' })}</div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Dataset (${datasets.length})</div>
        ${datasets.length ? renderRowList(datasets, (d) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(d.name)}</span>
            <span class="wlk-row-secondary">${esc(domainLabel(d.domainType))}</span>
          </li>`) : renderEmptyState('Belum ada dataset terdaftar pada klasifikasi ini.', 'Dataset akan muncul di sini setelah didaftarkan melalui Bootstrap Dataset Foundation.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Pack (${packs.length})</div>
        ${packs.length ? renderRowList(packs, (p) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(p.packId)}</span>
            <span class="wlk-row-secondary">${esc(p.datasetId)}</span>
          </li>`) : renderEmptyState('Belum ada pack terdaftar untuk dataset ini.')}
      </div>
    </div>`;
}

/* ── Upload Queue ──────────────────────────────────────────────────── */

/** Phase 3, Part 8 — GAP WORKFLOW: ACTIVATED.
 *
 *  The ownership audit found gap-workflow-engine.js had readers but NO writers:
 *  flagGapForUpload() and resolveGap() had zero callers anywhere in the
 *  platform, so `_workflowState` could never be written — while this screen AND
 *  the Executive Briefing both counted FLAGGED_FOR_UPLOAD gaps and therefore
 *  displayed a confident, permanent 0. A number that cannot become non-zero is
 *  worse than a missing number: it is a lie that no one will question.
 *
 *  The engine's own header (written back in V2.0.7) said this outright: "gives
 *  the workflow a real, persisted place to live so a FUTURE UI can wire an
 *  actual upload button to flagGapForUpload/resolveGap without redesigning
 *  anything here." The future UI simply never arrived. It is these two buttons.
 *
 *  Note honestly what "flag" means: it is a workflow MARKER ("we know this
 *  document is missing and we are chasing it"), not a file upload. The upload
 *  itself happens in the Dataset Import Center, which is embedded on this very
 *  screen. Nothing here pretends otherwise.
 */
function renderUploadQueueSection() {
  const domains = allDomainTypeIds();
  const recommendations = domains.flatMap((id) => buildUploadRecommendations(id));
  const allGaps = domains.flatMap((id) => getGapsWithWorkflowState(id));
  const open = allGaps.filter((g) => g.status !== GAP_STATUS.FLAGGED_FOR_UPLOAD);
  const flagged = allGaps.filter((g) => g.status === GAP_STATUS.FLAGGED_FOR_UPLOAD);

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">ARCHIVE CENTER · ANTREAN UNGGAH</div>
        <h1 class="wlk-page-title">Antrean Unggah</h1>
        <p class="wlk-page-lede">Rekomendasi dokumen yang perlu diunggah, dan gap yang telah ditandai untuk diunggah.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Rekomendasi</div>
        ${recommendations.length ? renderRowList(recommendations, (r) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(r.message)}</span>
            <span class="wlk-row-secondary">${esc(domainLabel(r.domainType))}</span>
          </li>`) : renderEmptyState('Tidak ada rekomendasi unggah saat ini.', 'Rekomendasi muncul saat ditemukan gap pada urutan penomoran.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Gap Terdeteksi (${open.length})</div>
        ${open.length ? renderRowList(open, (g) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(g.expectedNumber)}</span>
            <span class="wlk-row-secondary">${esc(domainLabel(g.domainType))} · belum ditandai</span>
            <button class="wlk-btn wlk-btn--ghost" data-act="ac-gap-flag" data-domain="${esc(g.domainType)}" data-number="${esc(g.expectedNumber)}" type="button">Tandai untuk Diunggah</button>
          </li>`) : renderEmptyState('Tidak ada gap terbuka.', 'Setiap nomor dokumen dalam urutan sudah terarsip.')}
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Ditandai untuk Diunggah (${flagged.length})</div>
        ${flagged.length ? renderRowList(flagged, (g) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(g.expectedNumber)}</span>
            <span class="wlk-row-secondary">${esc(domainLabel(g.domainType))} · sedang dicari</span>
            <button class="wlk-btn wlk-btn--ghost" data-act="ac-gap-resolve" data-domain="${esc(g.domainType)}" data-number="${esc(g.expectedNumber)}" type="button">Tandai Selesai</button>
          </li>`) : renderEmptyState('Tidak ada gap yang ditandai untuk diunggah.')}
      </div>
    </div>`;
}

/* ── Review (Pending / Approved / Rejected) ───────────────────────── */

function renderReviewSection() {
  const devMode = isDeveloperMode();
  const filters = [
    { id: 'pending', label: 'Pending Review' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
  ];

  // Sprint 0 (Presentation Truth) — a bare Knowledge Item Id used to be
  // the row's primary text always; Normal Mode now shows the item's kind
  // label instead (a normal user never needs the internal id), Developer
  // Mode keeps the raw id.
  const kindLabelFor = (itemId) => {
    const r = knowledgeGetById(itemId);
    return r.ok ? kindLabel(r.data.kind) : itemId;
  };

  let rows = [];
  if (st.reviewFilter === 'pending') {
    rows = getReviewQueue().map((e) => ({ id: e.itemId, primary: kindLabelFor(e.itemId), meta: 'Pending Review' }));
  } else if (st.reviewFilter === 'approved') {
    rows = safeList(knowledgeList, { lifecycleState: LIFECYCLE_STATE.APPROVED }).map((i) => ({ id: i.id, primary: kindLabel(i.kind), meta: 'Approved' }));
  } else {
    const candidateEntries = getCandidateQueue();
    rows = deriveRejectedFromCandidateQueue(candidateEntries, knowledgeGetHistory).map((e) => ({ id: e.itemId, primary: kindLabelFor(e.itemId), meta: `Ditolak pada versi ${e.rejectedAtVersion}` }));
  }

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">ARCHIVE CENTER · REVIEW</div>
        <h1 class="wlk-page-title">Status Review Pengetahuan</h1>
        <p class="wlk-page-lede">Status review Knowledge yang berasal dari dokumen terarsip — Archive Record sendiri tidak memiliki status review; ini adalah status Knowledge yang ditautkan.</p>
      </div>

      <div class="wlk-sec">${renderFilterBar(filters, st.reviewFilter, { act: 'ac-review-filter' })}</div>

      <div class="wlk-sec">
        ${rows.length ? renderRowList(rows, (row) => `
          <li class="wlk-row">
            <span class="wlk-row-primary">${esc(devMode ? row.id : row.primary)}</span>
            <span class="wlk-row-secondary">${esc(row.meta)}</span>
          </li>`) : renderEmptyState(`Tidak ada item pada status "${filters.find((f) => f.id === st.reviewFilter).label}".`)}
      </div>
    </div>`;
}
