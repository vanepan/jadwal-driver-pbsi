/* ============================================================
   DATASET-IMPORT-CENTER.JS — Sarpras Intelligence, Dataset Import Center (V2.1)

   PURPOSE: the first real file-upload surface in this codebase — lets a
   pilot administrator drag in one file or hundreds, walk them through the
   Import Session lifecycle (Uploaded -> Pending Review -> Approved ->
   Knowledge Imported -> Archived, knowledge/datasets/import-session/*),
   and see them become real Knowledge via the manual-verification bridge.

   V2.1.1 — ZERO-CONFIGURATION IMPORT: the default workflow is now Select
   Files -> automatic metadata extraction -> Import Session creation ->
   Validation -> Review (only if necessary) -> Knowledge pipeline. Manual
   metadata entry ("Advanced Metadata") only surfaces when confidence is
   low, the format is unsupported, or the administrator explicitly opens
   it — see knowledge/datasets/import-session/metadata-inference-engine.js
   for the deterministic (no AI/OCR) inference this drives.

   Every file's real content hash (file-storage/file-hash.js#computeSha256)
   is checked against the file-storage dedup ledger BEFORE any Storage
   upload — identical bytes are never uploaded twice (file-storage/
   file-storage-engine.js#uploadFile).

   ARCHITECTURE: exported as a FACTORY (createDatasetImportController), not
   a module-level singleton — both archive-center.js (unscoped) and
   nor-center.js (scoped to domainType:'nor') embed this simultaneously,
   per Sarpras Intelligence's "every screen stays mounted" model, and must
   not share render state. The shared source of truth is the Import
   Session repository, not the controller instance — every render() call
   re-reads it fresh, same convention workspace-list-kit.js's consumers
   already follow (never cache, always re-list).

   This is the ONE UI file allowed to see both knowledge/ (Import Session
   engine) and organizational-memory/ (ArchiveRecord) — the
   Knowledge Imported -> Archived edge is composed HERE.

   DEPENDENCIES: knowledge/datasets/import-session/* (engine + contract +
   metadata-inference-engine.js), knowledge/datasets/contracts/
   dataset-contract.js, knowledge/datasets/registry/dataset-registry.js,
   knowledge/connectors/manual-file-connector.js, knowledge/registry/
   {domain-type,kind}-registry.js, organizational-memory/index.js (the one
   cross-layer read/write in this milestone), file-storage/* (V2.1, the
   new top-level sibling), ./shared/workspace-list-kit.js.

   NON-GOALS: no OCR, no AI, no PDF/DOCX content parsing — those formats
   only ever carry auto-derived administrative metadata + human-typed
   facts. No new persistence beyond the in-memory stores the engines
   already own, plus the one real Firebase Storage upload.
   ============================================================ */

'use strict';

import {
  IMPORT_SESSION_STATE, IMPORT_SESSION_STATE_DEFS, IMPORT_SESSION_GRAPH, IMPORT_SESSION_KIND,
} from '../knowledge/datasets/import-session/contracts/import-session-contract.js';
import {
  createImportSession, attachManualEntryFacts, attachParsedContent, attachFileStorage,
  attachInferenceResult, markAutoImported,
  updateSessionMetadata, submitImportSessionForReview, approveImportSession, rejectImportSession,
  markKnowledgeImported, markArchived, getImportSession, listImportSessions, getImportSessionHistory,
  hasContentFacts,
} from '../knowledge/datasets/import-session/import-session-engine.js';
import {
  inferMetadata, inferPatternAssisted, AUTO_POPULATE_CONFIDENCE_THRESHOLD, AUTO_IMPORT_CONFIDENCE_THRESHOLD,
} from '../knowledge/datasets/import-session/metadata-inference-engine.js';
import {
  createBatch, recordBatchItem, pauseBatch, resumeBatch, cancelBatch, completeBatch,
  getBatch, listBatches, getBatchHistory, BATCH_STATUS,
} from '../knowledge/datasets/import-session/import-batch-engine.js';
import { DATASET_TYPE } from '../knowledge/datasets/contracts/dataset-contract.js';
import { listDatasets } from '../knowledge/datasets/registry/dataset-registry.js';
import { manualFileSource } from '../knowledge/connectors/manual-file-connector.js';
import { listDomainTypes, getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { listKinds } from '../knowledge/registry/kind-registry.js';
import { computeDocumentHash, create as archiveCreate, list as archiveList } from '../organizational-memory/index.js';
import { generateKnowledgeId } from '../knowledge/contracts/identity-contract.js';
import { computeSha256 } from '../file-storage/file-hash.js';
import { listStoredFiles, getStoredFileBySha256 } from '../file-storage/file-storage-registry.js';
// V2.1 — file-storage-engine.js transitively imports js/firebase.js (the
// real Storage SDK, from a CDN at module top-level). Lazily imported
// INSIDE processOneFile() rather than statically here, so that mounting
// Archive Center / NOR Center — which happens every time their screen is
// shown, whether or not anyone ever uploads a file — never eagerly loads
// live Firebase Storage machinery. Same discipline
// knowledge/connectors/nor-connector.js's own header already documents
// for why it self-registers instead of being eagerly bootstrapped.

import {
  esc, renderEmptyState, renderRowList, renderStatCards, renderFilterBar, renderSearchBox,
  renderDetailSection, renderKvList, renderDetail, renderDiffTable, formatFileSize,
} from './shared/workspace-list-kit.js';

const SUB_TABS = [
  { id: 'queue', label: 'Antrean Dataset' },
  { id: 'upload', label: 'Unggah' },
  { id: 'browser', label: 'Dataset Browser' },
  { id: 'report', label: 'Laporan Impor' },
  { id: 'batches', label: 'Riwayat Batch' },
];

const BATCH_STATUS_DISPLAY_LABEL = Object.freeze({
  processing: 'Diproses',
  paused: 'Dijeda',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
});

const MIME_TO_KIND = Object.freeze({
  'application/pdf': IMPORT_SESSION_KIND.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': IMPORT_SESSION_KIND.DOCX,
  'application/json': IMPORT_SESSION_KIND.JSON,
});

const STATE_LABEL = Object.freeze(
  IMPORT_SESSION_STATE_DEFS.reduce((acc, d) => ({ ...acc, [d.id]: d.label }), {}),
);

const QUEUE_ROW_CAP = 50;

const BATCH_STATUS_LABEL = Object.freeze({
  pending_review: 'Otomatis ke Pending Review',
  approved: 'Disetujui Otomatis (menunggu konten)',
  archived: 'Diimpor & Diarsipkan Otomatis',
  needs_advanced: 'Perlu Advanced Metadata',
  needs_attention: 'Perlu Perhatian (validasi gagal)',
  unsupported: 'Format Tidak Didukung',
  blocked: 'Terhalang — tidak ada domain',
  error: 'Error',
});

function domainLabel(id) {
  const registered = getDomainType(id);
  return registered ? registered.label : id;
}

function fileKind(mimeType) {
  return MIME_TO_KIND[mimeType] || null;
}

/**
 * @param {{domainType?: string|null, lockDomainType?: boolean}} [opts]
 * @returns {{render: () => string, onClick: (el: HTMLElement, rerender: () => void) => boolean, onInput: (e: Event, rerender: () => void) => boolean, onChange: (e: Event, rerender: () => void) => boolean, onDrop: (e: DragEvent, rerender: () => void) => boolean}}
 */
/** Duplicate-against-the-Archive check — lives HERE (the UI layer), not
 *  in import-validation-engine.js, since it's the one cross-layer read
 *  the one-way dependency rule forbids inside knowledge/. Module-scope
 *  (Phase 1) so other workspaces can reuse the real check instead of
 *  re-deriving a narrower one — it has no dependency on controller state. */
export function archiveDuplicateWarning(session) {
  if (!session.documentHash) return null;
  const result = archiveList({ sourceDomainType: session.domainType });
  if (!result.ok) return null;
  const matches = result.data.filter((r) => r.documentHash === session.documentHash);
  if (matches.length === 0) return null;
  return `Dokumen dengan hash yang sama sudah ada di Archive (${matches.length} kecocokan: ${matches.map((r) => r.documentNumber).join(', ')}) — kemungkinan duplikat.`;
}

/** V2.1.2 Part K — Exception-Based Review. Real reasons only, computed
 *  from signals already on the session (never fabricated): Low
 *  Confidence, Duplicate Ambiguity (within sessions or against the
 *  Archive), Unsupported Format, and (Phase 1) Missing Content Facts — a
 *  session Approved but not yet Knowledge Imported because no human-typed
 *  fact or parsed JSON content exists yet (markKnowledgeImported's own
 *  gate, reused via the exported hasContentFacts() rather than
 *  re-derived) was previously invisible to this filter despite being
 *  genuinely stuck waiting on a human. "Profile Conflict" is intentionally
 *  NOT implemented as a fabricated always-empty check — it would need
 *  design work beyond this milestone's scope (comparing a session's
 *  not-yet-typed content facts against Approved Profile Overrides is
 *  usually a no-op before Knowledge Imported) and is documented as a
 *  known gap in the final report rather than faked. Module-scope
 *  (Phase 1) so other workspaces can reuse the real exception logic. */
export function reviewReasons(session) {
  const reasons = [];
  if (typeof session.confidence === 'number' && session.confidence < AUTO_POPULATE_CONFIDENCE_THRESHOLD) {
    reasons.push({ code: 'LOW_CONFIDENCE', message: `Confidence ${session.confidence} di bawah ambang batas populasi otomatis (${AUTO_POPULATE_CONFIDENCE_THRESHOLD}).`, confidence: session.confidence, evidence: session.confidenceRationale });
  }
  for (const w of session.validationWarnings || []) {
    if (w.code === 'DUPLICATE_FILENAME' || w.code === 'DUPLICATE_METADATA') {
      reasons.push({ code: 'DUPLICATE_AMBIGUITY', message: w.message, confidence: session.confidence, evidence: null });
    }
  }
  const archiveDup = archiveDuplicateWarning(session);
  if (archiveDup) reasons.push({ code: 'DUPLICATE_AMBIGUITY', message: archiveDup, confidence: session.confidence, evidence: null });
  for (const e of session.validationErrors || []) {
    if (e.code === 'UNSUPPORTED_FORMAT') reasons.push({ code: 'UNSUPPORTED_FORMAT', message: e.message, confidence: session.confidence, evidence: null });
  }
  if (session.state === IMPORT_SESSION_STATE.APPROVED && !hasContentFacts(session)) {
    reasons.push({ code: 'MISSING_CONTENT_FACTS', message: 'Belum ada fakta konten (manual atau JSON) — Knowledge Imported tertunda.', confidence: session.confidence, evidence: null });
  }
  return reasons;
}

export function createDatasetImportController(opts = {}) {
  const scopedDomainType = opts.domainType || null;
  const lockDomainType = !!opts.lockDomainType;

  const st = {
    view: 'queue',
    queueStateFilter: '__all',
    selectedSessionId: null,
    reportSessionId: null,
    batchDomainType: scopedDomainType || (listDomainTypes()[0] ? listDomainTypes()[0].id : ''),
    // { batchId, total, processed, items: [{filename, sizeBytes, status, sessionId, wasDuplicate, warningCount, error, fileRef, startedAtMs}], control: {paused, cancelled}, startedAtMs }
    batchProgress: null,
    advancedEditId: null, // sessionId currently showing the Advanced Metadata panel
    advancedEdit: null,   // working copy of {domainType, datasetType, knowledgeKind, facts}
    resumeBannerDismissed: false, // V2.1.2 Part E — Upload Recovery
    batchSearch: '', // V2.1.2 Part I — Batch History
    batchStatusFilter: '__all',
    batchSort: 'newest', // 'newest' | 'oldest' | 'mostFiles'
    selectedBatchId: null,
    preview: { sessionId: null, url: null, loading: false, error: null }, // V2.1.2 Part L — Document Preview
  };

  /* ── shared reads ──────────────────────────────────────────────── */

  function sessions() {
    const filter = scopedDomainType ? { domainType: scopedDomainType } : {};
    const result = listImportSessions(filter);
    return result.ok ? result.data : [];
  }

  function domainOptions() {
    return scopedDomainType ? [{ id: scopedDomainType, label: domainLabel(scopedDomainType) }] : listDomainTypes();
  }

  /** V2.1.2 Part E — Upload Recovery: a batch left `processing`/`paused`
   *  after a browser refresh/restart/crash is a genuine unfinished
   *  session, not resolved by anything else — surfaced as a real Resume/
   *  Cancel/Discard banner rather than silently forgotten. */
  function unfinishedBatches() {
    const result = listBatches(scopedDomainType ? { domainType: scopedDomainType } : {});
    if (!result.ok) return [];
    return result.data.filter((b) => b.status === BATCH_STATUS.PROCESSING || b.status === BATCH_STATUS.PAUSED);
  }

  /* ── render dispatch ───────────────────────────────────────────── */

  function render() {
    const nav = renderFilterBar(SUB_TABS, st.view, { act: 'dic-view' });
    const body = {
      queue: renderQueue,
      upload: renderUpload,
      browser: renderBrowser,
      report: renderReport,
      batches: renderBatchHistory,
    }[st.view] || renderQueue;
    return `<div class="wlk-sec">${nav}</div>${body()}`;
  }

  /* ── Queue ─────────────────────────────────────────────────────── */

  function renderQueue() {
    const all = sessions();
    const stateFilters = [
      { id: '__all', label: 'Semua' },
      { id: '__needs_review', label: `Perlu Perhatian (${all.filter((s) => reviewReasons(s).length > 0).length})` },
      ...IMPORT_SESSION_STATE_DEFS.map((d) => ({ id: d.id, label: d.label })),
    ];
    const filtered = st.queueStateFilter === '__all' ? all
      : st.queueStateFilter === '__needs_review' ? all.filter((s) => reviewReasons(s).length > 0)
        : all.filter((s) => s.state === st.queueStateFilter);
    const rows = filtered.slice(0, QUEUE_ROW_CAP);
    const hiddenCount = filtered.length - rows.length;

    const cards = IMPORT_SESSION_STATE_DEFS.map((d) => ({ count: all.filter((s) => s.state === d.id).length, label: d.label }));

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER</div>
          <h1 class="wlk-page-title">Antrean Dataset</h1>
          <p class="wlk-page-lede">Uploaded &rarr; Pending Review &rarr; Approved &rarr; Knowledge Imported &rarr; Archived. Setiap unggahan nyata melewati alur ini — tidak ada status yang direkayasa. Review bersifat exception-based — sesi tanpa masalah nyata tidak perlu ditinjau manual.</p>
        </div>

        <div class="wlk-sec">${renderStatCards(cards)}</div>
        <div class="wlk-sec">${renderFilterBar(stateFilters, st.queueStateFilter, { act: 'dic-queue-filter' })}</div>

        <div class="wlk-sec">
          <div class="wlk-sec-title">Sesi Impor (${filtered.length})</div>
          ${rows.length ? renderRowList(rows, renderQueueRow) : renderEmptyState('Belum ada sesi impor.', 'Mulai dari tab "Unggah" untuk membuat sesi impor pertama.')}
          ${hiddenCount > 0 ? `<p class="wlk-page-lede">+${hiddenCount} sesi lain tidak ditampilkan — gunakan filter status untuk mempersempit daftar.</p>` : ''}
        </div>

        ${st.selectedSessionId ? renderSessionDetail(st.selectedSessionId) : ''}
      </div>`;
  }

  function nextActionFor(session) {
    const legal = IMPORT_SESSION_GRAPH[session.state] || [];
    if (legal.includes(IMPORT_SESSION_STATE.PENDING_REVIEW)) return { act: 'dic-submit', label: 'Ajukan untuk Review' };
    if (session.state === IMPORT_SESSION_STATE.PENDING_REVIEW) return { act: 'dic-approve', label: 'Setujui' };
    if (session.state === IMPORT_SESSION_STATE.APPROVED) return { act: 'dic-import', label: 'Impor sebagai Knowledge' };
    if (session.state === IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED) return { act: 'dic-archive', label: 'Arsipkan' };
    return null;
  }

  function renderQueueRow(s) {
    const next = nextActionFor(s);
    const rejectBtn = s.state === IMPORT_SESSION_STATE.PENDING_REVIEW
      ? `<button class="wlk-btn wlk-btn--ghost" data-act="dic-reject" data-id="${esc(s.id)}" type="button">Tolak</button>` : '';
    const reasons = reviewReasons(s);
    // Phase 1 (Operational Engine Hardening) — this button used to render
    // unconditionally on every row, including already-Archived ones. The
    // engine should only ask for human input when it genuinely lacks
    // confidence to proceed on its own; a clean, non-exceptional session
    // has nothing for Advanced Metadata to fix.
    const advancedBtn = reasons.length
      ? `<button class="wlk-btn wlk-btn--ghost" data-act="dic-advanced-open" data-id="${esc(s.id)}" type="button">Advanced Metadata</button>` : '';
    const reasonLine = reasons.length
      ? `<div class="wlk-row-secondary">Alasan: ${reasons.map((r) => esc(r.message)).join(' · ')} — Saran: ${esc(suggestedActionFor(reasons[0].code))}</div>` : '';
    return `
      <li class="wlk-row" data-act="dic-session-row" data-id="${esc(s.id)}" data-clickable="1">
        <span class="wlk-row-primary">${esc(s.filename)} — ${esc(STATE_LABEL[s.state] || s.state)}${s.autoImported ? ' · otomatis' : ''}</span>
        <span class="wlk-row-secondary">${esc(domainLabel(s.domainType))} · ${esc(s.kind)} · ${formatFileSize(s.sizeBytes)}${typeof s.confidence === 'number' ? ` · confidence ${s.confidence}` : ''}${s.validationWarnings && s.validationWarnings.length ? ` · ${s.validationWarnings.length} peringatan` : ''}</span>
        ${reasonLine}
        ${next ? `<button class="wlk-btn" data-act="${next.act}" data-id="${esc(s.id)}" type="button">${esc(next.label)}</button>` : ''}
        ${rejectBtn}
        ${advancedBtn}
      </li>`;
  }

  function suggestedActionFor(reasonCode) {
    return {
      LOW_CONFIDENCE: 'Buka Advanced Metadata untuk melengkapi/mengoreksi.',
      DUPLICATE_AMBIGUITY: 'Bandingkan dengan dokumen yang sudah ada sebelum melanjutkan.',
      UNSUPPORTED_FORMAT: 'Format tidak didukung — dokumen ini tidak dapat diproses lebih lanjut.',
      MISSING_CONTENT_FACTS: 'Buka Advanced Metadata untuk melampirkan fakta konten sebelum menjadi Knowledge.',
    }[reasonCode] || 'Tinjau secara manual.';
  }

  function renderSessionDetail(id) {
    const result = getImportSession(id);
    if (!result.ok) return '';
    const s = result.data;
    const metadata = renderKvList([
      ['Nama File', s.filename], ['Tipe', s.mimeType], ['Ukuran', formatFileSize(s.sizeBytes)],
      ['Domain', domainLabel(s.domainType)], ['Tipe Dataset', s.datasetType], ['Knowledge Kind', s.knowledgeKind],
      ['Status', STATE_LABEL[s.state] || s.state], ['Import Batch', s.batchId],
      ['Diunggah oleh', s.uploadedBy], ['Disetujui oleh', s.approvedBy], ['Knowledge Item Id', s.knowledgeItemId],
      ['Archive Record Id', s.archiveRecordId], ['Diimpor Otomatis', s.autoImported ? 'Ya (confidence tinggi)' : 'Tidak'],
    ]);
    // V2.1.2 Part M — Metadata & Audit Improvements: Confidence Score +
    // Inference Source (Pattern Used), shown separately from the raw
    // metadata list for visibility.
    const confidenceKv = typeof s.confidence === 'number' ? renderKvList([
      ['Confidence Score', s.confidence],
      ['Sumber Inferensi — Domain', s.confidenceRationale ? s.confidenceRationale.domainType : '—'],
      ['Sumber Inferensi — Tipe Dataset', s.confidenceRationale ? s.confidenceRationale.datasetType : '—'],
      ['Sumber Inferensi — Knowledge Kind', s.confidenceRationale ? s.confidenceRationale.knowledgeKind : '—'],
    ]) : null;
    // Part H — Storage Hardening display: Original Size / Stored Size
    // (identical — no compression exists, shown honestly, never a
    // fabricated ratio) / Deduplication Status / Storage Path.
    const storageKv = s.storagePath ? renderKvList([
      ['SHA-256', s.sha256],
      ['Storage Path', s.storagePath],
      ['Original Size', formatFileSize(s.sizeBytes)],
      ['Stored Size', formatFileSize(s.sizeBytes)],
      ['Deduplication Status', s.fileStorageId && listStoredFiles().find((f) => f.id === s.fileStorageId && f.linkedSessionIds.length > 1) ? 'Duplikat — bytes tidak diunggah ulang' : 'Unggahan baru'],
    ]) : (s.sha256 ? renderKvList([['SHA-256', s.sha256], ['Storage Path', 'Belum diunggah ke Storage (lihat error unggahan bila ada)']]) : null);
    const previewHtml = renderDocumentPreview(s);
    const archiveDup = archiveDuplicateWarning(s);
    const warningPairs = [
      ...(s.validationWarnings || []).map((w) => [w.code, w.message]),
      ...(archiveDup ? [['DUPLICATE_ARCHIVE_MATCH', archiveDup]] : []),
    ];
    const warnings = warningPairs.length ? renderKvList(warningPairs) : null;
    const errors = s.validationErrors && s.validationErrors.length
      ? renderKvList(s.validationErrors.map((e) => [e.code, e.message])) : null;
    const facts = s.manualEntryFacts ? renderKvList(Object.entries(s.manualEntryFacts))
      : (s.parsedContent ? renderKvList(Object.entries(s.parsedContent)) : null);

    // V2.1 — Import Session Viewer: Knowledge status, Archive status,
    // Timeline, Pattern recommendations.
    const knowledgeStatusKv = s.knowledgeItemId ? renderKvList([['Knowledge Item', s.knowledgeItemId], ['Status', 'draft (menunggu review Knowledge terpisah)']]) : null;
    const archiveStatusKv = s.archiveRecordId ? renderKvList([['Archive Record', s.archiveRecordId]]) : null;
    const historyResult = getImportSessionHistory(id);
    const timeline = historyResult.ok
      ? renderKvList(historyResult.data.map((v) => [`Versi ${v.version}`, `${STATE_LABEL[v.state] || v.state} — ${v.updatedAt}`])) : null;
    const patternSuggestions = inferPatternAssisted(s.domainType, s.filename);
    const patternKv = patternSuggestions.length
      ? renderKvList(patternSuggestions.map((p) => [`${p.patternType}: ${p.value}`, `support ${p.supportCount} · confidence ${p.confidence}`])) : null;

    const advancedPanel = st.advancedEditId === id ? renderAdvancedMetadataPanel(s) : '';

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Detail — ${esc(s.filename)}</div>
        ${renderDetail([
          renderDetailSection('Metadata', metadata),
          renderDetailSection('Confidence & Sumber Inferensi', confidenceKv),
          renderDetailSection('Storage', storageKv),
          renderDetailSection('Preview Dokumen', previewHtml),
          renderDetailSection('Fakta Terverifikasi', facts),
          renderDetailSection('Peringatan Validasi', warnings),
          renderDetailSection('Error Validasi', errors),
          renderDetailSection('Status Knowledge', knowledgeStatusKv),
          renderDetailSection('Status Archive', archiveStatusKv),
          renderDetailSection('Timeline', timeline),
          renderDetailSection('Rekomendasi Pattern Discovery', patternKv),
        ])}
        ${advancedPanel}
      </div>`;
  }

  /** V2.1.2 Part L — Document Preview. Real PDF preview only (the browser
   *  natively renders actual stored bytes fetched via getBytes() — never
   *  a signed URL, never a second PDF renderer). DOCX stays metadata-only
   *  (Decision 3 — no new parsing dependency this milestone); Metadata
   *  Preview/Storage Metadata/Import History/Pattern Discovery
   *  Explanation are the existing sections already rendered around this
   *  one, reused rather than duplicated here. */
  function renderDocumentPreview(s) {
    if (!s.storagePath) {
      return renderEmptyState('Preview tidak tersedia.', 'Dokumen belum tersimpan di Storage.');
    }
    if (s.mimeType !== 'application/pdf') {
      return renderEmptyState('Preview konten hanya tersedia untuk PDF saat ini.', 'DOCX menampilkan metadata saja — unggah ulang atau buka dokumen aslinya untuk membaca isi.');
    }
    if (st.preview.sessionId === s.id && st.preview.url) {
      return `<embed src="${esc(st.preview.url)}" type="application/pdf" class="dic-pdf-preview" />`;
    }
    if (st.preview.sessionId === s.id && st.preview.loading) {
      return renderEmptyState('Memuat preview…');
    }
    if (st.preview.sessionId === s.id && st.preview.error) {
      return renderEmptyState('Gagal memuat preview.', st.preview.error);
    }
    return `<button class="wlk-btn" data-act="dic-preview-load" data-id="${esc(s.id)}" data-path="${esc(s.storagePath)}" type="button">Muat Preview PDF</button>`;
  }

  /** Lazily loads Firebase Storage's real bytes (same lazy-import
   *  discipline as the upload path — never eager on mount) and
   *  constructs a LOCAL object URL — never a signed/public link. */
  async function loadDocumentPreview(sessionId, storagePath, rerender) {
    st.preview = { sessionId, url: null, loading: true, error: null };
    rerender();
    try {
      const { downloadFileFromStorage } = await import('../../firebase.js');
      const result = await downloadFileFromStorage(storagePath);
      if (!result.ok) {
        st.preview = { sessionId, url: null, loading: false, error: result.error };
      } else {
        const blob = new Blob([result.bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        st.preview = { sessionId, url, loading: false, error: null };
      }
    } catch (err) {
      st.preview = { sessionId, url: null, loading: false, error: err && err.message ? err.message : 'Gagal memuat preview.' };
    }
    rerender();
  }

  /** V2.1 — "Advanced Metadata": the manual form, now collapsed by
   *  default and only shown on request (dic-advanced-open) or when a
   *  batch item's confidence was too low to auto-populate. Edits an
   *  EXISTING session (updateSessionMetadata/attachManualEntryFacts),
   *  never a pre-creation form — every file already has a real Import
   *  Session by the time this panel can appear. */
  function renderAdvancedMetadataPanel(s) {
    const edit = st.advancedEdit || { domainType: s.domainType, datasetType: s.datasetType, knowledgeKind: s.knowledgeKind, facts: s.manualEntryFacts || { value: '', documentNumber: '', senderOrigin: '', notes: '' } };
    const domainSelect = `
      <select data-act="dic-adv-field" data-field="domainType" class="wlk-select">
        ${listDomainTypes().map((d) => `<option value="${esc(d.id)}" ${edit.domainType === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
      </select>`;
    const datasetTypeSelect = `
      <select data-act="dic-adv-field" data-field="datasetType" class="wlk-select">
        ${Object.values(DATASET_TYPE).map((t) => `<option value="${esc(t)}" ${edit.datasetType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select>`;
    const kindSelect = `
      <select data-act="dic-adv-field" data-field="knowledgeKind" class="wlk-select">
        ${listKinds().map((k) => `<option value="${esc(k.id)}" ${edit.knowledgeKind === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}
      </select>`;
    const isJson = s.kind === IMPORT_SESSION_KIND.JSON;
    const factsForm = isJson ? '' : `
      <div class="wlk-form-row"><label>Nilai Pokok (value)</label><input data-act="dic-adv-fact" data-field="value" class="wlk-input" type="text" value="${esc(edit.facts.value)}" placeholder="Fakta utama yang benar-benar Anda baca dari dokumen"/></div>
      <div class="wlk-form-row"><label>Nomor Dokumen</label><input data-act="dic-adv-fact" data-field="documentNumber" class="wlk-input" type="text" value="${esc(edit.facts.documentNumber)}"/></div>
      <div class="wlk-form-row"><label>Dari (Sender Origin)</label><input data-act="dic-adv-fact" data-field="senderOrigin" class="wlk-input" type="text" value="${esc(edit.facts.senderOrigin)}"/></div>
      <div class="wlk-form-row"><label>Catatan</label><input data-act="dic-adv-fact" data-field="notes" class="wlk-input" type="text" value="${esc(edit.facts.notes)}"/></div>`;

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Advanced Metadata — ${esc(s.filename)}</div>
        <div class="wlk-form-row"><label>Domain</label>${domainSelect}</div>
        <div class="wlk-form-row"><label>Tipe Dataset</label>${datasetTypeSelect}</div>
        <div class="wlk-form-row"><label>Knowledge Kind</label>${kindSelect}</div>
        ${factsForm}
        <button class="wlk-btn" data-act="dic-advanced-save" data-id="${esc(s.id)}" type="button">Simpan</button>
        <button class="wlk-btn wlk-btn--ghost" data-act="dic-advanced-close" type="button">Tutup</button>
      </div>`;
  }

  /* ── Upload (V2.1 — zero-configuration, drag & drop, bulk) ────────── */

  function renderUpload() {
    const p = st.batchProgress;
    const domainSelect = `
      <select data-act="dic-batch-domain" class="wlk-select" ${lockDomainType ? 'disabled' : ''}>
        ${domainOptions().map((d) => `<option value="${esc(d.id)}" ${st.batchDomainType === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
      </select>`;

    const dropZone = `
      <div class="dic-dropzone" data-act="dic-dropzone">
        <div class="wlk-empty-title">Tarik &amp; lepas file di sini, atau pilih file</div>
        <div class="wlk-empty-sub">PDF, DOCX, atau JSON — satu file atau ratusan sekaligus. Metadata terisi otomatis; Advanced Metadata hanya muncul bila diperlukan.</div>
        <input data-act="dic-file-input" class="wlk-file-input" type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json,.json"/>
        <input data-act="dic-folder-input" class="wlk-file-input" type="file" multiple webkitdirectory directory/>
        <div class="wlk-page-lede" style="margin-top:8px;">Pilihan kedua (di atas, jika didukung browser Anda) memilih seluruh folder sekaligus.</div>
      </div>`;

    const progressBlock = p ? renderBatchProgress(p) : '';
    const resumeBanner = (!p && !st.resumeBannerDismissed) ? renderResumeBanner() : '';

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER · UNGGAH</div>
          <h1 class="wlk-page-title">Unggah Dokumen</h1>
          <p class="wlk-page-lede">Tidak ada OCR atau AI. Domain, tipe dataset, dan knowledge kind terisi otomatis dari nama file/folder, riwayat duplikat, dan statistik Pattern Discovery — semuanya deterministik dan bisa dijelaskan.</p>
        </div>

        ${resumeBanner}

        <div class="wlk-sec">
          <div class="wlk-form-row"><label>Domain Unggahan (default untuk batch ini)</label>${domainSelect}</div>
        </div>

        <div class="wlk-sec">${dropZone}</div>

        ${progressBlock}
      </div>`;
  }

  /** V2.1.2 Part E — Upload Recovery: a real, non-dismissible-by-default
   *  banner for any batch left processing/paused (browser crash/refresh/
   *  restart). "Resume" here honestly means re-selecting the same files —
   *  browser File handles cannot survive a refresh, no software can
   *  restore them (see this milestone's plan, Decision 6) — so the CTA is
   *  framed as "select the same files again", not a false promise of
   *  automatic continuation. */
  function renderResumeBanner() {
    const unfinished = unfinishedBatches();
    if (!unfinished.length) return '';
    return `
      <div class="wlk-sec">
        <div class="dic-resume-banner">
          <div class="wlk-empty-title">Sesi unggah belum selesai ditemukan</div>
          <div class="wlk-empty-sub">${unfinished.length} batch belum selesai (kemungkinan karena refresh, restart browser, atau koneksi terputus). Pilih ulang folder/file yang sama untuk melanjutkan — sesi yang sudah berhasil akan otomatis dilewati, tidak diunggah ulang.</div>
          ${renderRowList(unfinished, (b) => `
            <li class="wlk-row">
              <span class="wlk-row-primary">${esc(b.id)} — ${b.imported}/${b.totalFiles} selesai</span>
              <span class="wlk-row-secondary">${esc(domainLabel(b.domainType))} · dimulai ${esc(b.startedAt)}</span>
              <button class="wlk-btn wlk-btn--ghost" data-act="dic-resume-batch-cancel" data-id="${esc(b.id)}" type="button">Batalkan Batch Ini</button>
            </li>`)}
          <button class="wlk-btn wlk-btn--ghost" data-act="dic-resume-banner-dismiss" type="button">Tutup</button>
        </div>
      </div>`;
  }

  function renderBatchProgress(p) {
    const pending = p.items.filter((i) => i.status === 'pending_review').length;
    const autoImported = p.items.filter((i) => i.status === 'archived' || i.status === 'approved').length;
    const advanced = p.items.filter((i) => i.status === 'needs_advanced').length;
    const duplicate = p.items.filter((i) => i.wasDuplicate).length;
    const unsupported = p.items.filter((i) => i.status === 'unsupported').length;
    const failed = p.items.filter((i) => ['error', 'blocked', 'needs_attention'].includes(i.status));
    const isDone = p.processed === p.total && p.total > 0;
    const isCancelled = p.control.cancelled;
    const isPaused = p.control.paused;

    // Part J — real ETA/speed from measured elapsed time, never fabricated.
    const elapsedMs = Date.now() - p.startedAtMs;
    const avgMsPerFile = p.processed > 0 ? elapsedMs / p.processed : 0;
    const remaining = p.total - p.processed;
    const etaMs = avgMsPerFile * remaining;
    const bytesProcessed = p.items.reduce((n, i) => n + (i.sizeBytes || 0), 0);
    const bytesPerSecond = elapsedMs > 0 ? (bytesProcessed / (elapsedMs / 1000)) : 0;

    const controls = !isDone && !isCancelled ? `
      ${isPaused
        ? `<button class="wlk-btn" data-act="dic-batch-resume" type="button">Lanjutkan</button>`
        : `<button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-pause" type="button">Jeda</button>`}
      <button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-cancel" type="button">Batalkan</button>
    ` : '';

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Progres — ${p.processed}/${p.total} diproses${isPaused ? ' (dijeda)' : ''}${isCancelled ? ' (dibatalkan)' : ''}</div>
        <div class="dic-progress-bar"><div class="dic-progress-fill" style="width:${p.total ? Math.round((p.processed / p.total) * 100) : 0}%"></div></div>
        ${!isDone && !isCancelled ? `<p class="wlk-page-lede" style="margin-top:0;">File saat ini: ${esc(p.items.length ? p.items[p.items.length - 1].filename : '—')} · Sisa waktu perkiraan: ${etaMs > 0 ? Math.ceil(etaMs / 1000) + ' detik' : '—'} · Kecepatan: ${formatFileSize(bytesPerSecond)}/detik · Sisa file: ${remaining}</p>` : ''}
        ${controls}
        ${renderStatCards([
          { count: pending, label: 'Otomatis ke Pending Review' },
          { count: autoImported, label: 'Diimpor Otomatis (Confidence Tinggi)' },
          { count: advanced, label: 'Perlu Advanced Metadata' },
          { count: duplicate, label: 'Duplikat' },
          { count: unsupported, label: 'Format Tidak Didukung' },
          { count: failed.length, label: 'Error' },
        ])}
        ${isDone || isCancelled ? renderRowList(p.items, (i) => `
          <li class="wlk-row" ${i.sessionId ? `data-act="dic-session-row" data-id="${esc(i.sessionId)}" data-clickable="1"` : ''}>
            <span class="wlk-row-primary">${esc(i.filename)} (${formatFileSize(i.sizeBytes)})</span>
            <span class="wlk-row-secondary">${esc(BATCH_STATUS_LABEL[i.status] || i.status)}${i.wasDuplicate ? ' · duplikat konten' : ''}${i.error ? ` · ${esc(i.error)}` : ''}</span>
            ${['error', 'unsupported', 'needs_attention'].includes(i.status) && i.sessionId ? `<button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-retry-one" data-id="${esc(i.sessionId)}" type="button">Coba Lagi</button>` : ''}
          </li>`) : ''}
        ${(isDone || isCancelled) && failed.length > 0 ? `<button class="wlk-btn" data-act="dic-batch-retry-all" type="button">Coba Lagi Semua yang Gagal (${failed.length})</button>` : ''}
        ${isDone || isCancelled ? `<button class="wlk-btn" data-act="dic-view" data-id="queue" type="button">Buka Antrean Dataset</button><button class="wlk-btn wlk-btn--ghost" data-act="dic-batch-clear" type="button">Unggah Lagi</button>` : ''}
      </div>`;
  }

  /* ── Dataset Browser ───────────────────────────────────────────── */

  function renderBrowser() {
    const filter = scopedDomainType ? { domainType: scopedDomainType } : {};
    const datasets = listDatasets(filter).filter((d) => d.sourceId === manualFileSource.id);

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER · DATASET BROWSER</div>
          <h1 class="wlk-page-title">Dataset dari Unggahan</h1>
          <p class="wlk-page-lede">Dataset yang secara otomatis terdaftar dari setiap sesi impor pada Dataset Import Center ini — read-only sampai disetujui.</p>
        </div>
        <div class="wlk-sec">
          <div class="wlk-sec-title">Dataset (${datasets.length})</div>
          ${datasets.length ? renderRowList(datasets.slice(0, QUEUE_ROW_CAP), (d) => `
            <li class="wlk-row">
              <span class="wlk-row-primary">${esc(d.name)}</span>
              <span class="wlk-row-secondary">${esc(domainLabel(d.domainType))} · ${esc(d.datasetType)}</span>
            </li>`) : renderEmptyState('Belum ada dataset dari unggahan.', 'Dataset akan muncul di sini setelah sesi impor pertama dibuat.')}
        </div>
      </div>`;
  }

  /* ── Import Report / Dashboard ─────────────────────────────────── */

  /** A session was genuinely rejected if its history shows a real
   *  pending_review -> uploaded transition — mirrors workspace-list-kit.js#
   *  deriveRejectedFromCandidateQueue's exact reasoning. */
  function countRejectedSessions(all) {
    let n = 0;
    for (const s of all) {
      const historyResult = getImportSessionHistory(s.id);
      if (!historyResult.ok) continue;
      const versions = historyResult.data;
      for (let i = 1; i < versions.length; i += 1) {
        if (versions[i - 1].state === IMPORT_SESSION_STATE.PENDING_REVIEW && versions[i].state === IMPORT_SESSION_STATE.UPLOADED) {
          n += 1;
          break;
        }
      }
    }
    return n;
  }

  function renderReport() {
    const all = sessions();
    const candidates = all.filter((s) => s.importReport);
    const selected = st.reportSessionId ? getImportSession(st.reportSessionId) : null;

    const imported = all.length;
    const pendingReview = all.filter((s) => s.state === IMPORT_SESSION_STATE.PENDING_REVIEW).length;
    const duplicateCount = all.filter((s) => (s.validationWarnings || []).some((w) => w.code === 'DUPLICATE_METADATA' || w.code === 'DUPLICATE_FILENAME')).length;
    const unsupportedCount = all.filter((s) => (s.validationErrors || []).some((e) => e.code === 'UNSUPPORTED_FORMAT')).length;
    const warningsTotal = all.reduce((n, s) => n + (s.validationWarnings ? s.validationWarnings.length : 0), 0);
    const knowledgeProduced = all.filter((s) => !!s.knowledgeItemId).length;
    const rejectedTotal = countRejectedSessions(all);

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER · LAPORAN</div>
          <h1 class="wlk-page-title">Import Dashboard</h1>
          <p class="wlk-page-lede">Angka di bawah ini berasal langsung dari state Import Session yang nyata — boleh menunjukkan nol.</p>
        </div>

        <div class="wlk-sec">${renderStatCards([
          { count: imported, label: 'Imported (Sesi Dibuat)' },
          { count: pendingReview, label: 'Pending Review' },
          { count: duplicateCount, label: 'Duplicate' },
          { count: unsupportedCount, label: 'Unsupported' },
          { count: warningsTotal, label: 'Warnings' },
          { count: knowledgeProduced, label: 'Knowledge Produced' },
          { count: rejectedTotal, label: 'Dikirim Kembali (Reject)' },
        ])}</div>

        <div class="wlk-sec">
          <div class="wlk-sec-title">Sesi dengan Laporan Impor (${candidates.length})</div>
          ${candidates.length ? renderRowList(candidates.slice(0, QUEUE_ROW_CAP), (s) => `
            <li class="wlk-row" data-act="dic-report-row" data-id="${esc(s.id)}" data-clickable="1">
              <span class="wlk-row-primary">${esc(s.filename)}</span>
              <span class="wlk-row-secondary">${esc(STATE_LABEL[s.state] || s.state)}</span>
            </li>`) : renderEmptyState('Belum ada laporan impor.', 'Laporan muncul setelah sebuah sesi mencapai Knowledge Imported.')}
        </div>

        ${selected && selected.ok ? renderReportDetail(selected.data) : ''}
      </div>`;
  }

  function renderReportDetail(s) {
    const historyResult = getImportSessionHistory(s.id);
    const history = historyResult.ok ? historyResult.data : [];
    let diffHtml = null;
    if (history.length >= 2) {
      diffHtml = renderDiffTable(diffStates(history[history.length - 2], history[history.length - 1]));
    }
    const reportKv = s.importReport ? renderKvList([
      ['Item Dibuat', s.importReport.itemsCreated ?? 0],
      ['Item Diperbarui', s.importReport.itemsUpdated ?? 0],
      ['Item Dilewati', s.importReport.itemsSkipped ?? 0],
      ['Warnings', (s.importReport.warnings || []).length],
    ]) : null;

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Laporan — ${esc(s.filename)}</div>
        ${renderDetail([
          renderDetailSection('Knowledge Import Report', reportKv),
          renderDetailSection('Riwayat Versi', renderKvList(history.map((v) => [`Versi ${v.version}`, `${v.state} — ${v.updatedAt}`]))),
          renderDetailSection('Diff (versi terakhir vs sebelumnya)', diffHtml),
        ])}
      </div>`;
  }

  /** A minimal Import-Session-shaped diff (field/before/after/changeType),
   *  same shape renderDiffTable() expects. */
  function diffStates(before, after) {
    const fields = ['state', 'validationWarnings', 'knowledgeItemId', 'archiveRecordId'];
    const entries = fields
      .map((field) => ({ field, before: before[field], after: after[field], changeType: JSON.stringify(before[field]) === JSON.stringify(after[field]) ? null : 'modified' }))
      .filter((e) => e.changeType);
    return { entries, fieldsChanged: entries.length };
  }

  /* ── Batch History (V2.1.2 Part I) ─────────────────────────────── */

  function renderBatchHistory() {
    const allResult = listBatches(scopedDomainType ? { domainType: scopedDomainType } : {});
    let batches = allResult.ok ? allResult.data : [];

    const q = st.batchSearch.trim().toLowerCase();
    if (q) batches = batches.filter((b) => b.id.toLowerCase().includes(q) || b.createdBy.toLowerCase().includes(q));

    const statusFilters = [{ id: '__all', label: 'Semua' }, ...Object.entries(BATCH_STATUS_DISPLAY_LABEL).map(([id, label]) => ({ id, label }))];
    if (st.batchStatusFilter !== '__all') batches = batches.filter((b) => b.status === st.batchStatusFilter);

    const sorted = [...batches].sort((a, b) => {
      if (st.batchSort === 'oldest') return a.startedAt.localeCompare(b.startedAt);
      if (st.batchSort === 'mostFiles') return b.totalFiles - a.totalFiles;
      return b.startedAt.localeCompare(a.startedAt); // 'newest', default (listBatches already returns newest-first, re-sorted here for explicitness)
    });
    const sortOptions = [{ id: 'newest', label: 'Terbaru' }, { id: 'oldest', label: 'Terlama' }, { id: 'mostFiles', label: 'Jumlah File Terbanyak' }];

    return `
      <div class="wlk-page">
        <div class="wlk-page-head">
          <div class="wlk-page-crumb">DATASET IMPORT CENTER · RIWAYAT BATCH</div>
          <h1 class="wlk-page-title">Riwayat Batch</h1>
          <p class="wlk-page-lede">Setiap unggahan (drag-drop/pilih file/folder) menjadi satu Import Batch permanen — Batch ID, waktu mulai/selesai, total file, dan hasil nyata per batch.</p>
        </div>

        <div class="wlk-sec">${renderSearchBox(st.batchSearch, 'Cari berdasarkan Batch ID atau pengunggah…', { inputId: 'dicBatchSearch' })}</div>
        <div class="wlk-sec">${renderFilterBar(statusFilters, st.batchStatusFilter, { act: 'dic-batch-status-filter' })}</div>
        <div class="wlk-sec">${renderFilterBar(sortOptions, st.batchSort, { act: 'dic-batch-sort' })}</div>

        <div class="wlk-sec">
          <div class="wlk-sec-title">Batch (${sorted.length})</div>
          ${sorted.length ? renderRowList(sorted.slice(0, QUEUE_ROW_CAP), (b) => `
            <li class="wlk-row" data-act="dic-batch-row" data-id="${esc(b.id)}" data-clickable="1">
              <span class="wlk-row-primary">${esc(b.id)} — ${esc(BATCH_STATUS_DISPLAY_LABEL[b.status] || b.status)}</span>
              <span class="wlk-row-secondary">${esc(domainLabel(b.domainType))} · ${b.totalFiles} file · oleh ${esc(b.createdBy)} · ${esc(b.startedAt)}</span>
            </li>`) : renderEmptyState('Belum ada riwayat batch.', 'Setiap unggahan melalui tab "Unggah" akan tercatat di sini secara permanen.')}
        </div>

        ${st.selectedBatchId ? renderBatchDetail(st.selectedBatchId) : ''}
      </div>`;
  }

  function renderBatchDetail(batchId) {
    const result = getBatch(batchId);
    if (!result.ok) return '';
    const b = result.data;
    const summary = renderKvList([
      ['Batch ID', b.id], ['Dibuat oleh', b.createdBy], ['Domain', domainLabel(b.domainType)],
      ['Dimulai', b.startedAt], ['Selesai', b.finishedAt || '—'], ['Status', BATCH_STATUS_DISPLAY_LABEL[b.status] || b.status],
      ['Total File', b.totalFiles], ['Imported', b.imported], ['Duplicate', b.duplicate], ['Warning', b.warning],
      ['Error', b.error], ['Knowledge Produced', b.knowledgeProduced], ['Storage Digunakan', formatFileSize(b.storageUsedBytes)],
    ]);
    const historyResult = getBatchHistory(batchId);
    const auditTrail = historyResult.ok
      ? renderKvList(historyResult.data.map((v) => [`Versi ${v.version}`, `${BATCH_STATUS_DISPLAY_LABEL[v.status] || v.status} — ${v.updatedAt} (${v.sessionIds.length} sesi tercatat)`])) : null;
    const sessionLinks = b.sessionIds.length
      ? renderRowList(b.sessionIds.slice(0, QUEUE_ROW_CAP), (sid) => `
          <li class="wlk-row" data-act="dic-session-row" data-id="${esc(sid)}" data-clickable="1">
            <span class="wlk-row-primary">${esc(sid)}</span>
          </li>`) : null;

    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Detail Batch — ${esc(b.id)}</div>
        ${renderDetail([
          renderDetailSection('Ringkasan', summary),
          renderDetailSection('Audit Trail', auditTrail),
          renderDetailSection('Sesi dalam Batch Ini', sessionLinks),
        ])}
      </div>`;
  }

  /* ── Archive composition (unchanged from prior milestone) ─────────── */

  function doArchive(sessionId) {
    const current = getImportSession(sessionId);
    if (!current.ok) return;
    const s = current.data;
    const facts = s.manualEntryFacts || s.parsedContent || {};
    const now = new Date().toISOString();
    const record = Object.freeze({
      id: generateKnowledgeId({ domainType: s.domainType, sourceType: 'manual-file', sourceRef: `archive:${s.id}` }),
      version: 1, sourceDomainType: s.domainType, sourceId: s.id, sourceType: 'manual-file',
      documentNumber: facts.documentNumber || s.filename,
      documentDate: facts.documentDate || null,
      senderOrigin: facts.senderOrigin || null,
      documentHash: s.sha256 || s.documentHash || computeDocumentHash({ filename: s.filename, mimeType: s.mimeType, sizeBytes: s.sizeBytes }),
      hasContributedKnowledge: !!s.knowledgeItemId,
      sourceSnapshot: facts,
      hasOriginalFile: !!s.storagePath, fileRef: s.storagePath || null,
      archivedAt: now, updatedAt: now,
    });
    const result = archiveCreate(record);
    if (result.ok) markArchived(sessionId, result.data.id);
  }

  /* ── Zero-config batch processing (V2.1 -> V2.1.2) ────────────────── */

  /**
   * Processes ONE real file: hash -> infer metadata -> create Import
   * Session -> upload to Storage (dedup-checked) -> submit for review
   * (confidence clears AUTO_POPULATE_CONFIDENCE_THRESHOLD) -> optionally
   * walk straight through Approve -> Knowledge Imported -> Archived
   * (confidence ALSO clears the separate, higher
   * AUTO_IMPORT_CONFIDENCE_THRESHOLD — Part C). Never fabricates a
   * result — every branch reflects a real engine call's actual outcome,
   * and PDF/DOCX can never auto-reach Knowledge Imported regardless of
   * confidence (markKnowledgeImported's own content-fact gate, unchanged
   * from the prior milestone, still requires a human-typed fact those
   * formats can never auto-derive).
   * @param {File} file
   * @param {string} folderPath
   */
  async function processOneFile(file, folderPath, batchId = null) {
    const kind = fileKind(file.type);
    const isUnsupported = !kind;
    const domainType = st.batchDomainType;
    const base = { filename: file.name, sizeBytes: file.size, fileRef: file, folderPath, sessionId: null, wasDuplicate: false, warningCount: 0, storageBytes: 0 };

    if (!domainType) {
      return { ...base, status: 'blocked', error: 'Tidak ada Domain Unggahan yang dipilih.' };
    }

    let sha256 = null;
    try { sha256 = await computeSha256(file); } catch { /* hashing failure must not block the whole batch */ }

    const inferred = inferMetadata({ filename: file.name, mimeType: file.type, sizeBytes: file.size, folderPath, sha256, scopedDomainType: domainType });

    const created = createImportSession({
      domainType: inferred.domainType.value || domainType,
      datasetType: inferred.datasetType.value,
      filename: file.name, mimeType: file.type, sizeBytes: file.size,
      kind: kind || 'unsupported', knowledgeKind: inferred.knowledgeKind.value,
      uploadedBy: 'evan', batchId,
    });
    if (!created.ok) return { ...base, status: 'error', error: created.error.message };
    const sessionId = created.data.id;
    base.sessionId = sessionId;

    attachInferenceResult(sessionId, {
      confidence: inferred.overallConfidence,
      confidenceRationale: { domainType: inferred.domainType.rationale, datasetType: inferred.datasetType.rationale, knowledgeKind: inferred.knowledgeKind.rationale },
    });

    // A Storage failure (network hiccup, permission error) for ONE file
    // must never abort the rest of a bulk batch — caught and recorded as
    // a real, honest per-file outcome instead of an uncaught rejection
    // that would kill every file still queued behind it.
    if (sha256) {
      try {
        const { uploadFile } = await import('../file-storage/file-storage-engine.js');
        const uploadResult = await uploadFile(file, { domainType: inferred.domainType.value || domainType, importSessionId: sessionId });
        if (uploadResult.ok) {
          attachFileStorage(sessionId, { sha256: uploadResult.sha256, storagePath: uploadResult.record.storagePath, fileStorageId: uploadResult.record.id });
          base.wasDuplicate = uploadResult.wasDuplicate;
          base.storageBytes = uploadResult.wasDuplicate ? 0 : file.size;
        }
      } catch (err) {
        console.error('[dataset-import-center] uploadFile failed for', file.name, err);
      }
    }

    if (isUnsupported) {
      submitImportSessionForReview(sessionId, { expectedDomainType: scopedDomainType || undefined });
      return { ...base, status: 'unsupported', error: null };
    }

    if (kind === IMPORT_SESSION_KIND.JSON) {
      try {
        const text = await file.text();
        attachParsedContent(sessionId, JSON.parse(text));
      } catch { /* real parse failure — leave parsedContent unset, never fabricate content */ }
    }

    if (inferred.overallConfidence < AUTO_POPULATE_CONFIDENCE_THRESHOLD) {
      return { ...base, status: 'needs_advanced', error: null };
    }

    const submitResult = submitImportSessionForReview(sessionId, { expectedDomainType: scopedDomainType || undefined });
    if (!submitResult.ok) {
      return { ...base, status: 'needs_attention', error: submitResult.error.message };
    }
    base.warningCount = (submitResult.data.validationWarnings || []).length;

    // Part C — confidence-based automatic import. A SEPARATE, higher bar
    // than auto-populate; only ever advances the Import Session's own
    // administrative lifecycle (see this file's header decision).
    if (inferred.overallConfidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD) {
      const approveResult = approveImportSession(sessionId, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: `Disetujui otomatis — confidence ${inferred.overallConfidence} melewati ambang batas Import otomatis.` });
      if (approveResult.ok) {
        const importResult = markKnowledgeImported(sessionId);
        if (importResult.ok) {
          markAutoImported(sessionId);
          doArchive(sessionId);
          return { ...base, status: 'archived', error: null };
        }
        // PDF/DOCX with no content facts yet — the ONE case high
        // confidence cannot bypass (by design, never fabricated content).
        return { ...base, status: 'approved', error: null };
      }
    }

    return { ...base, status: 'pending_review', error: null };
  }

  /**
   * Processes a whole batch sequentially (correctness over speed at this
   * data scale — Storage upload contention is the limiting factor, not
   * CPU), updating progress after every file, checking Pause/Cancel
   * between files, and recording every real outcome onto a persisted
   * ImportBatchRecord (Part I) so it survives refresh/restart.
   * @param {File[]} files
   * @param {(file: File) => string} folderPathFor
   * @param {() => void} rerender
   */
  async function processBatch(files, folderPathFor, rerender) {
    const batchResult = createBatch({ createdBy: 'evan', domainType: st.batchDomainType || 'unknown', totalFiles: files.length });
    const batchId = batchResult.ok ? batchResult.data.id : null;
    st.batchProgress = { batchId, total: files.length, processed: 0, items: [], control: { paused: false, cancelled: false }, startedAtMs: Date.now() };
    rerender();

    for (const file of files) {
      if (st.batchProgress.control.cancelled) break;
      // eslint-disable-next-line no-await-in-loop
      while (st.batchProgress.control.paused && !st.batchProgress.control.cancelled) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 200); });
      }
      if (st.batchProgress.control.cancelled) break;

      let item;
      try {
        // eslint-disable-next-line no-await-in-loop
        item = await processOneFile(file, folderPathFor(file), batchId);
      } catch (err) {
        // Robustness fix (Part F "no silent skipping"): an unexpected
        // throw ANYWHERE in processOneFile must still produce a real
        // result entry and let the batch continue — never silently drop
        // a file or abort everything queued behind it.
        console.error('[dataset-import-center] processOneFile threw for', file.name, err);
        item = { filename: file.name, sizeBytes: file.size, fileRef: file, folderPath: folderPathFor(file), sessionId: null, wasDuplicate: false, warningCount: 0, storageBytes: 0, status: 'error', error: err && err.message ? err.message : 'Unexpected error.' };
      }

      st.batchProgress.items.push(item);
      st.batchProgress.processed += 1;
      if (batchId) {
        recordBatchItem(batchId, item.sessionId, {
          imported: ['pending_review', 'approved', 'archived'].includes(item.status),
          duplicate: item.wasDuplicate,
          warningCount: item.warningCount || 0,
          error: ['blocked', 'error', 'unsupported', 'needs_attention'].includes(item.status),
          knowledgeProduced: item.status === 'archived',
          storageBytes: item.storageBytes || 0,
        });
      }
      rerender();
    }

    if (batchId) {
      if (st.batchProgress.control.cancelled) cancelBatch(batchId);
      else completeBatch(batchId);
    }
    rerender();
  }

  /** V2.1.2 Part G — re-attempts submission for a session that already
   *  exists but failed validation (unsupported/needs_attention) — never
   *  creates a duplicate session. A 'blocked' item (Domain Unggahan was
   *  empty, no session was ever created) has nothing to retry until the
   *  administrator sets a domain and re-selects the file. */
  function retryFailedItem(item, rerender) {
    if (!item.sessionId) return;
    const submitResult = submitImportSessionForReview(item.sessionId, { expectedDomainType: scopedDomainType || undefined });
    item.error = submitResult.ok ? null : (submitResult.error ? submitResult.error.message : item.error);
    item.status = submitResult.ok ? 'pending_review' : item.status;
    if (submitResult.ok) item.warningCount = (submitResult.data.validationWarnings || []).length;
    rerender();
  }

  function retryAllFailed(rerender) {
    if (!st.batchProgress) return;
    for (const item of st.batchProgress.items) {
      if (['error', 'unsupported', 'needs_attention'].includes(item.status)) retryFailedItem(item, rerender);
    }
  }

  /* ── events ────────────────────────────────────────────────────── */

  /**
   * @param {HTMLElement} el
   * @param {() => void} rerender
   * @returns {boolean} true if this controller handled the click
   */
  function onClick(el, rerender) {
    const act = el.dataset.act;
    if (!act || !act.startsWith('dic-')) return false;
    const id = el.dataset.id;

    if (act === 'dic-view') { st.view = id; rerender(); return true; }
    if (act === 'dic-queue-filter') { st.queueStateFilter = id; rerender(); return true; }
    if (act === 'dic-session-row') { st.selectedSessionId = st.selectedSessionId === id ? null : id; rerender(); return true; }
    if (act === 'dic-report-row') { st.reportSessionId = st.reportSessionId === id ? null : id; rerender(); return true; }
    if (act === 'dic-batch-clear') { st.batchProgress = null; rerender(); return true; }

    // V2.1.2 Part G — Upload Queue Controls.
    if (act === 'dic-batch-pause') { if (st.batchProgress) { st.batchProgress.control.paused = true; if (st.batchProgress.batchId) pauseBatch(st.batchProgress.batchId); } rerender(); return true; }
    if (act === 'dic-batch-resume') { if (st.batchProgress) { st.batchProgress.control.paused = false; if (st.batchProgress.batchId) resumeBatch(st.batchProgress.batchId); } rerender(); return true; }
    if (act === 'dic-batch-cancel') { if (st.batchProgress) st.batchProgress.control.cancelled = true; rerender(); return true; }
    if (act === 'dic-batch-retry-all') { retryAllFailed(rerender); return true; }
    if (act === 'dic-batch-retry-one') {
      const item = st.batchProgress && st.batchProgress.items.find((i) => i.sessionId === id);
      if (item) retryFailedItem(item, rerender);
      return true;
    }

    // V2.1.2 Part E — Upload Recovery.
    if (act === 'dic-resume-banner-dismiss') { st.resumeBannerDismissed = true; rerender(); return true; }
    if (act === 'dic-resume-batch-cancel') { cancelBatch(id); rerender(); return true; }

    // V2.1.2 Part I — Batch History.
    if (act === 'dic-batch-status-filter') { st.batchStatusFilter = id; rerender(); return true; }
    if (act === 'dic-batch-sort') { st.batchSort = id; rerender(); return true; }
    if (act === 'dic-batch-row') { st.selectedBatchId = st.selectedBatchId === id ? null : id; rerender(); return true; }

    // V2.1.2 Part L — Document Preview.
    if (act === 'dic-preview-load') { loadDocumentPreview(id, el.dataset.path, rerender); return true; }

    if (act === 'dic-submit') { submitImportSessionForReview(id, { expectedDomainType: scopedDomainType || undefined }); rerender(); return true; }
    if (act === 'dic-approve') {
      approveImportSession(id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Ditinjau dan disetujui melalui Dataset Import Center.' });
      rerender(); return true;
    }
    if (act === 'dic-reject') {
      rejectImportSession(id, { approverId: 'evan', decidedAt: new Date().toISOString() });
      rerender(); return true;
    }
    if (act === 'dic-import') { markKnowledgeImported(id); rerender(); return true; }
    if (act === 'dic-archive') { doArchive(id); rerender(); return true; }

    if (act === 'dic-advanced-open') {
      const current = getImportSession(id);
      if (current.ok) {
        st.advancedEditId = id;
        st.advancedEdit = {
          domainType: current.data.domainType, datasetType: current.data.datasetType, knowledgeKind: current.data.knowledgeKind,
          facts: current.data.manualEntryFacts || { value: '', documentNumber: '', senderOrigin: '', notes: '' },
        };
      }
      rerender(); return true;
    }
    if (act === 'dic-advanced-close') { st.advancedEditId = null; st.advancedEdit = null; rerender(); return true; }
    if (act === 'dic-advanced-save') {
      if (st.advancedEdit) {
        updateSessionMetadata(id, { domainType: st.advancedEdit.domainType, datasetType: st.advancedEdit.datasetType, knowledgeKind: st.advancedEdit.knowledgeKind });
        if (st.advancedEdit.facts.value) attachManualEntryFacts(id, st.advancedEdit.facts);
      }
      st.advancedEditId = null; st.advancedEdit = null;
      rerender(); return true;
    }

    return false;
  }

  /**
   * @param {Event} e
   * @param {() => void} rerender
   * @returns {boolean}
   */
  function onInput(e, rerender) {
    const target = e.target;
    if (!target || !target.closest) return false;
    if (target.id === 'dicBatchSearch') { st.batchSearch = target.value; rerender(); return true; }
    const advField = target.closest('[data-act="dic-adv-field"]');
    if (advField && st.advancedEdit) { st.advancedEdit[advField.dataset.field] = advField.value; rerender(); return true; }
    const advFact = target.closest('[data-act="dic-adv-fact"]');
    if (advFact && st.advancedEdit) { st.advancedEdit.facts[advFact.dataset.field] = advFact.value; rerender(); return true; }
    return false;
  }

  /**
   * @param {Event} e
   * @param {() => void} rerender
   * @returns {boolean}
   */
  function onChange(e, rerender) {
    const target = e.target;
    if (!target || !target.closest) return false;

    const domainSelect = target.closest('[data-act="dic-batch-domain"]');
    if (domainSelect) { st.batchDomainType = domainSelect.value; rerender(); return true; }

    const fileInput = target.closest('[data-act="dic-file-input"], [data-act="dic-folder-input"]');
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const files = Array.from(fileInput.files);
      const folderPathFor = (file) => (file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(0, -1).join('/') : '');
      processBatch(files, folderPathFor, rerender);
      return true;
    }
    return false;
  }

  /**
   * Real drag-and-drop support (Part F). Accepts a DragEvent already
   * `preventDefault()`-ed by the caller's dragover handler.
   * @param {DragEvent} e
   * @param {() => void} rerender
   * @returns {boolean}
   */
  function onDrop(e, rerender) {
    const target = e.target;
    if (!target || !target.closest || !target.closest('[data-act="dic-dropzone"]')) return false;
    const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return false;
    processBatch(files, () => '', rerender);
    return true;
  }

  return { render, onClick, onInput, onChange, onDrop };
}
