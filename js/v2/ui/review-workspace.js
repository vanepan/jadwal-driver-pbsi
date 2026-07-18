/* ============================================================
   REVIEW-WORKSPACE.JS — Review Workspace (Phase 10, Sprint 10.1)

   PURPOSE: the real human-review surface Sprint 9.8 named as the single
   largest gap left after Phase 9 ("no real human-review surface exists for
   a composed ComposerDocument beyond a dev-mode section-count viewer").
   Sibling of NOR Center / Archive Center / Knowledge Center under Sarpras
   Intelligence — mounted by ./sarpras-intelligence-center.js when its
   "review" screen is shown.

   SCOPE, Sprint 10.1: a real Draft Preview (every section's actual
   field/value, not a count), a Metadata panel, a Status indicator, and
   Version Information (reusing nor-center.js's own revision/diff
   rendering). Deliberately NOT in that sprint — editing (Sprint 10.3),
   real status transitions (Sprint 10.4), reviewer/approver identity
   (Sprint 10.5), export/publish (Sprint 10.6).

   SCOPE, Sprint 10.2 ADDITION — Explainability, Developer/Reviewer Mode
   only, never shown to an ordinary user (spec: "Never expose this to
   ordinary users"). Retrieved Knowledge / Applied Rules / Confidence /
   Missing Evidence / Unknown Facts come from nor-explainability-
   service.js#explainDocument() (document-intelligence/ — merges the
   persisted Reasoning+Composition bundle with per-item provenance).
   Conversation History is resolved HERE, not in that service: this file
   (ui/) is the one layer allowed to depend on conversation/ (js/v2/
   README.md's dependency graph) — explainDocument() only ever hands back
   a bare `conversationId` string, the same "cross-domain reference is an
   id, the UI resolves it" idiom knowledge-center.js already uses for
   importSessionId. NOTE: `isDeveloperMode()` is a platform-wide flag, not
   a true Reviewer-role gate — real reviewer-only gating arrives with
   Sprint 10.5's role work and should be applied here too once it exists.

   DELIBERATELY NO TAB BAR: the spec asks for "a single clean review
   screen... minimal visual noise" — every other Sarpras Intelligence
   workspace uses workspace-list-kit.js's renderTabShell() for multi-
   section navigation, but this workspace has exactly one job (list a
   document, show its detail), so adding tabs here would be visual noise
   with no real destination behind it. Reuses the SAME `.wlk-*` CSS classes
   directly (workspace-list-kit.css does not require the tab shell).

   SCOPE, Sprint 10.3 ADDITION — Document Editor. Draft Preview rows
   (Sprint 10.1) become inline-editable, the first real UI caller
   composer-store.js#editSection ever had (previously zero callers —
   see js/v2/dormant-subsystems.js's now-RETIRED 'composer-timeline'
   entry). AI-output vs human-edit attribution needs no new contract
   field: editSection()'s existing ComposerRevision.editedBy (null for
   the initial AI-composed revision, non-null for a human edit) already
   carries it — lastEditorOfField() below just finds the most recent
   revision whose Diff touched a given field. "Final approved version"
   tracking is deliberately NOT built here — that is Sprint 10.4/10.5's
   job (a `status` transition + a real ReviewDecision), not this one.
   Actor identity is the SAME placeholder knowledge-center.js's own
   governance panel already uses (`ACTOR_ID = 'evan'`) — Sprint 10.5 is
   what replaces it with a real signed-in identity across this workspace.

   SCOPE, Sprint 10.4 ADDITION — Review Workflow. Real status transitions
   via composer-store.js#transitionStatus (contracts/composer-review-
   contract.js's OWN graph — draft -> in_review -> {approved,
   needs_revision, rejected}; needs_revision -> in_review — deliberately
   NOT a reuse of knowledge/'s lifecycle graph, see that contract's own
   header). The governance panel mirrors knowledge-center.js#
   renderGovernancePanel's exact pattern (a rationale note field + buttons
   that change with current status) — driven by the new composer lifecycle
   instead of Knowledge's. "No automatic approval": transitionStatus()
   itself refuses APPROVED without a real rationale, not just the UI.
   Approved -> Published has NO button here — see composer-review-
   contract.js's own scope note: publishing is Sprint 10.6's job (export +
   archive), not a bare status flip faked here.

   SCOPE, Sprint 10.5 ADDITION — Approval Workflow. Real signed-in
   identity replaces the `ACTOR_ID = 'evan'` placeholder everywhere
   (Document Editor's edits, the governance panel's transitions) — read
   from the SAME localStorage session key `js/auth.js#getCurrentUser()`
   reads, but WITHOUT importing that file: auth.js statically imports
   `js/firebase.js` (real `https://` CDN imports — eager Firebase SDK
   load the instant the module graph touches it), and every v2 module in
   this tree stays Firebase-free except through an explicit init*Sync()
   opt-in (composer-document-repository.js, import-session-repository.js,
   etc.). A one-line, read-only duplication of ONE stable private constant
   (`SESSION_KEY`) is the deliberately smaller cost, not an oversight.

   Reviewer/Approver capabilities are real now too:
   `js/config/role-registry.js` gains `sic.review.act` (admin+bidang —
   edit a draft, submit/request-revision/reject) and `sic.approve.act`
   (admin only — the actual approval authority), the same asymmetry
   `eng.verify`/`eng.postpone` already establish between Coordinator and
   Admin. A user lacking a capability simply never sees the button —
   same "hide, don't disable" convention every other role-gated surface
   in this app already uses. NOTE: today's single-pilot gate
   (`isV2Enabled()` requires role:'admin' AND username:'evan') means this
   is the real, forward architecture, not a no-op formality — every real
   user who can open this screen at all already satisfies both.

   SCOPE, Sprint 10.6 ADDITION — Export & Publishing. Once APPROVED, three
   real actions: "Unduh PDF" (js/docs/doc-engine.js's existing, already-
   proven pdfmake pipeline — templates/composer-document.js is a NEW,
   deliberately GENERIC template, not an attempt to reuse templates/nor.js,
   which needs structured recipients/cc/balance-recap fields the Composer's
   flat sections do not carry), "Unduh Word (.docx)" (../../docs/
   docx-exporter.js — html-docx-js, CDN-loaded exactly like pdfmake,
   verified live in this environment before committing to the approach),
   and "Terbitkan" (transitionStatus to PUBLISHED + archiveDocument() —
   composed HERE, in ui/, the one layer allowed to see both
   document-intelligence/ and organizational-memory/, mirroring
   knowledge-center.js's own kc-gov-reject -> archiveRejectedKnowledge
   composition). PDF and Word render the SAME content model
   (composer-document.js#buildContentModel) — one source of truth, two
   thin format renderers. Reasoning-metadata scrubbing is enforced by
   construction: the export data object is built from `doc.sections`
   directly, never from getExplainability() — there is no code path for
   it to leak in. No binary file storage exists in this codebase (see
   archive-record-contract.js's own header) — Terbitkan records an
   ArchiveRecord for provenance; the PDF/Word artifact stays a local
   download, same as V1's existing NOR export.

   NO DOMAIN FILTER YET: every ComposerDocument today is domainType:'nor'.
   A filter bar over a single-valued dimension is speculative UI for a
   case that does not exist yet.

   REUSE, NEVER DUPLICATE: no new list/detail rendering primitives — every
   markup fragment below is workspace-list-kit.js's shared kit, exactly as
   knowledge-center.js/archive-center.js already use it. Diff rendering
   reuses renderDiffTable(), the one diff view nor-center.js's own Drafts
   tab already established — not re-implemented here.
   ============================================================ */

'use strict';

import {
  getDocument, getRevisionHistory, listAllDocuments, registerChangeListener, editSection,
  transitionStatus, getReviewHistory,
} from '../document-intelligence/composer/composer-store.js';
import { COMPOSER_REVIEW_STATE, composerReviewStateLabel } from '../document-intelligence/composer/contracts/composer-review-contract.js';
import { explainDocument } from '../document-intelligence/nor/nor-explainability-service.js';
import { getConversationHistory } from '../conversation/services/conversation-service.js';
import {
  esc, renderEmptyState, renderRowList, renderDetail, renderDetailSection,
  renderKvList, renderDiffTable, isDeveloperMode,
} from './shared/workspace-list-kit.js';
import { getDomainType } from '../knowledge/registry/domain-type-registry.js';
import { can } from '../../config/role-registry.js';
// Phase 10, Sprint 10.6 — export/publish. generateAndOpen also imports
// pdf-exporter.js's lazy-loaded pdfmake; the side-effect import below
// self-registers the 'composer-document' template (template-registry.js's
// own documented "templates self-register on import" convention).
import { generateAndOpen } from '../../docs/doc-engine.js';
import { buildHtml } from '../../docs/templates/composer-document.js';
import { exportHtmlToDocx } from '../../docs/docx-exporter.js';
import { archiveDocument } from '../organizational-memory/services/archive-service.js';
import { computeDocumentHash } from '../organizational-memory/document-hash.js';
import { recordSatisfactionRating } from '../document-intelligence/composer/satisfaction-log.js';

// Phase 10, Sprint 10.5 — see this file's own header for why this reads
// the same session key js/auth.js#getCurrentUser() reads WITHOUT
// importing that file (auth.js statically imports js/firebase.js).
const SESSION_KEY = 'pbsi_current_user';

function currentSessionUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Falls back to the pre-Sprint-10.5 placeholder only when no real
 *  session exists (e.g. a bare test mount) — every real user reaching
 *  this screen in production already has a session. */
function currentActorId() {
  const user = currentSessionUser();
  return (user && user.username) || 'evan';
}

function currentActorRole() {
  const user = currentSessionUser();
  return user ? user.role : null;
}

function canReview() { return can('sic.review.act', currentActorRole()); }
function canApprove() { return can('sic.approve.act', currentActorRole()); }

const st = {
  selectedId: null,
  editingField: null,
  editValue: '',
  editError: null,
  govNote: '',
  govError: null,
  exportError: null,
  exportBusy: false,
  showSatisfactionPrompt: null,
};

let host = null;
let mounted = false;

/* ── Phase 2.5-style event-driven sync — same 100ms-debounced idiom every
   sibling workspace uses, subscribed to the new composer-document-
   repository.js's change notifications (fires on a local compose/edit from
   ANY screen, and on a remote echo from another tab — see that file's own
   putRecord() comment for why local writes notify here, unlike most other
   repositories in this tree). ── */
let _renderTimer = null;
function scheduleRender() {
  if (_renderTimer) return;
  _renderTimer = setTimeout(() => { _renderTimer = null; render(); }, 100);
}

/* ── mount / teardown ─────────────────────────────────────────────── */

export async function mountReviewWorkspace(hostEl) {
  if (!hostEl) return;
  host = hostEl;
  host.classList.add('wlk-root');
  if (!mounted) {
    mounted = true;
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    registerChangeListener(scheduleRender);
  }
  render();
}

export function closeReviewWorkspace() { /* shell hides the host; state is retained */ }

/* ── render ────────────────────────────────────────────────────────── */

function render() {
  if (!host) return;
  host.innerHTML = renderPage();
}

/** Phase 10, Sprint 10.6 — the ONE place a ComposerDocument becomes export
 *  input. Reads ONLY doc.sections/domainType/version/status — never
 *  getExplainability() — so reasoning metadata has no code path into an
 *  exported artifact (spec: "Published document must never contain
 *  reasoning metadata"). */
function buildExportData(doc) {
  return {
    documentId: doc.documentId,
    domainType: doc.domainType,
    version: doc.version,
    statusLabel: composerReviewStateLabel(doc.status),
    approvedAt: doc.status === COMPOSER_REVIEW_STATE.APPROVED || doc.status === COMPOSER_REVIEW_STATE.PUBLISHED ? doc.updatedAt : null,
    sections: doc.sections.map((s) => ({ field: s.field, value: s.value })),
  };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'rw-doc-row') {
    st.selectedId = st.selectedId === el.dataset.id ? null : el.dataset.id;
    st.editingField = null; st.editError = null;
    st.govNote = ''; st.govError = null;
    st.exportError = null;
    st.showSatisfactionPrompt = null;
    render();
    return;
  }
  if (act === 'rw-edit-start') {
    st.editingField = el.dataset.field;
    st.editValue = el.dataset.value;
    st.editError = null;
    render();
    return;
  }
  if (act === 'rw-edit-cancel') {
    st.editingField = null; st.editValue = ''; st.editError = null;
    render();
    return;
  }
  if (act === 'rw-edit-save') {
    if (!canReview()) { st.editError = 'Anda tidak memiliki izin untuk mengedit draf ini.'; render(); return; }
    const result = editSection(el.dataset.id, el.dataset.field, st.editValue, currentActorId());
    if (!result.ok) { st.editError = result.error.message; render(); return; }
    st.editingField = null; st.editValue = ''; st.editError = null;
    render();
    return;
  }
  if (act === 'rw-gov-submit' || act === 'rw-gov-approve' || act === 'rw-gov-request-revision' || act === 'rw-gov-reject' || act === 'rw-gov-resubmit') {
    const toState = {
      'rw-gov-submit': COMPOSER_REVIEW_STATE.IN_REVIEW,
      'rw-gov-approve': COMPOSER_REVIEW_STATE.APPROVED,
      'rw-gov-request-revision': COMPOSER_REVIEW_STATE.NEEDS_REVISION,
      'rw-gov-reject': COMPOSER_REVIEW_STATE.REJECTED,
      'rw-gov-resubmit': COMPOSER_REVIEW_STATE.IN_REVIEW,
    }[act];
    const requiredCapability = act === 'rw-gov-approve' ? canApprove() : canReview();
    if (!requiredCapability) { st.govError = 'Anda tidak memiliki izin untuk tindakan ini.'; render(); return; }
    const note = st.govNote.trim();
    const result = transitionStatus(el.dataset.id, toState, { actorId: currentActorId(), rationale: note || null });
    st.govError = result.ok ? null : result.error.message;
    if (result.ok) st.govNote = '';
    render();
    return;
  }
  if (act === 'rw-export-pdf' || act === 'rw-export-docx') {
    if (!canReview()) { st.exportError = 'Anda tidak memiliki izin untuk mengekspor draf ini.'; render(); return; }
    const doc = getDocument(el.dataset.id);
    if (!doc) return;
    const data = buildExportData(doc);
    st.exportError = null; st.exportBusy = true; render();
    (act === 'rw-export-pdf'
      ? generateAndOpen('composer-document', data, { viewer: { title: data.documentId } })
      : exportHtmlToDocx(buildHtml(data)).then((blob) => triggerBlobDownload(blob, `draf-${data.domainType}-${data.documentId}.docx`))
    )
      .catch((err) => { st.exportError = (err && err.message) || 'Ekspor gagal.'; })
      .finally(() => { st.exportBusy = false; render(); });
    return;
  }
  if (act === 'rw-gov-publish') {
    if (!canApprove()) { st.govError = 'Anda tidak memiliki izin untuk menerbitkan draf ini.'; render(); return; }
    const documentId = el.dataset.id;
    const doc = getDocument(documentId);
    if (!doc) return;
    const result = transitionStatus(documentId, COMPOSER_REVIEW_STATE.PUBLISHED, { actorId: currentActorId(), rationale: null });
    if (!result.ok) { st.govError = result.error.message; render(); return; }
    // Archive-on-publish — composed HERE (ui/), the one layer allowed to
    // see both document-intelligence/ and organizational-memory/, same
    // composition knowledge-center.js's own kc-gov-reject click handler
    // already does for its own two-domain write.
    const fieldMap = Object.fromEntries(doc.sections.map((s) => [s.field, s.value]));
    const documentNumber = fieldMap.norNumber || doc.documentId;
    archiveDocument({
      id: `composer-archive:${documentId}`,
      sourceDomainType: doc.domainType,
      sourceId: documentId,
      sourceType: 'composer',
      documentNumber,
      documentHash: computeDocumentHash(fieldMap),
      sourceSnapshot: fieldMap,
      archivedBy: currentActorId(),
    });
    st.govError = null;
    // Phase 10, Sprint 10.7 — the one new data-capture point Pilot UX
    // Validation needs: a single 1-5 rating prompt, once, right after a
    // real publish (see satisfaction-log.js's own header for why nothing
    // else in this tree already tracks this).
    st.showSatisfactionPrompt = documentId;
    render();
    return;
  }
  if (act === 'rw-rate-satisfaction') {
    recordSatisfactionRating({ documentId: el.dataset.id, rating: Number(el.dataset.rating), actorId: currentActorId() });
    st.showSatisfactionPrompt = null;
    render();
  }
}

/** State only — never re-render on a keystroke, or the focused <input> is
 *  destroyed mid-word (the same lesson dataset-import-center.js already
 *  documents, and knowledge-center.js's own onInput follows). */
function onInput(e) {
  const editEl = e.target.closest('[data-act="rw-edit-value"]');
  if (editEl) { st.editValue = editEl.value; return; }
  const govEl = e.target.closest('[data-act="rw-gov-note"]');
  if (govEl) { st.govNote = govEl.value; }
}

function domainLabel(id) {
  const registered = getDomainType(id);
  return registered ? registered.label : id;
}

function renderPage() {
  const docs = listAllDocuments();

  return `
    <div class="wlk-page">
      <div class="wlk-page-head">
        <div class="wlk-page-crumb">REVIEW WORKSPACE</div>
        <h1 class="wlk-page-title">Review Workspace</h1>
        <p class="wlk-page-lede">Tinjau setiap draf yang disusun Sarpras Intelligence sebelum diteruskan — isi lengkap, bukan ringkasan.</p>
      </div>

      <div class="wlk-sec">
        <div class="wlk-sec-title">Draf (${docs.length})</div>
        ${docs.length ? renderDocRows(docs) : renderEmptyState('Belum ada draf tersimpan.', 'Draf akan muncul di sini setelah Susun NOR digunakan dari Home.')}
      </div>

      ${st.selectedId ? renderDocDetail(st.selectedId) : ''}
    </div>`;
}

function renderDocRows(docs) {
  const devMode = isDeveloperMode();
  return renderRowList(docs, (d) => `
    <li class="wlk-row" data-act="rw-doc-row" data-id="${esc(d.documentId)}" data-clickable="1">
      <span class="wlk-row-primary">${esc(devMode ? d.documentId : `${domainLabel(d.domainType)} — v${d.version}`)}</span>
      <span class="wlk-row-secondary">${esc(composerReviewStateLabel(d.status))} · ${esc(d.updatedAt)}</span>
    </li>`);
}

/** Finds who last changed `field`, by walking the revision history
 *  backwards for the most recent Diff that touched it — no new contract
 *  field needed, `ComposerRevision.editedBy` (Sprint 10.1) already carries
 *  this per revision. Returns null when the field has never been
 *  human-edited (still exactly as AI-composed). */
function lastEditorOfField(revisions, field) {
  for (let i = revisions.length - 1; i >= 1; i -= 1) {
    const rev = revisions[i];
    if (rev.diff && rev.diff.entries.some((e) => e.field === field)) return rev.editedBy;
  }
  return null;
}

/** Draft Preview — every section's real field/value pair, now inline-
 *  editable (Sprint 10.3). This is the literal fix for Sprint 9.8's named
 *  gap: the Developer Pipeline Viewer (sarpras-intelligence-center.js) and
 *  NOR Center's Drafts tab both used to show a section COUNT or a revision
 *  DIFF, never the content itself — and, until this sprint, never a way
 *  for a human to correct it either. */
function renderDraftPreview(doc) {
  const revisions = getRevisionHistory(doc.documentId);
  return `<ul class="wlk-kv-list">${doc.sections.map((s) => renderEditableSectionRow(doc, s, revisions)).join('')}</ul>`;
}

function renderEditableSectionRow(doc, section, revisions) {
  const editor = lastEditorOfField(revisions, section.field);
  const attribution = editor ? `Diedit oleh ${esc(editor)}` : 'Disusun AI';

  if (st.editingField === section.field) {
    return `
      <li class="wlk-kv-row wlk-kv-row--editing">
        <span class="wlk-kv-key">${esc(section.field)}</span>
        <div class="wlk-form-row">
          <input data-act="rw-edit-value" class="wlk-input" type="text" value="${esc(st.editValue)}" autocomplete="off" />
          <button class="wlk-btn" data-act="rw-edit-save" data-id="${esc(doc.documentId)}" data-field="${esc(section.field)}" type="button">Simpan</button>
          <button class="wlk-btn wlk-btn--ghost" data-act="rw-edit-cancel" type="button">Batal</button>
        </div>
        ${st.editError ? `<div class="wlk-row-secondary" style="color:var(--danger,#c0392b);">${esc(st.editError)}</div>` : ''}
      </li>`;
  }

  return `
    <li class="wlk-kv-row">
      <span class="wlk-kv-key">${esc(section.field)}</span>
      <span class="wlk-kv-val">${esc(section.value == null || section.value === '' ? '—' : section.value)}</span>
      <span class="wlk-row-secondary">${esc(attribution)}</span>
      ${canReview() ? `<button class="wlk-btn wlk-btn--ghost" data-act="rw-edit-start" data-field="${esc(section.field)}" data-value="${esc(section.value == null ? '' : section.value)}" type="button">Ubah</button>` : ''}
    </li>`;
}

/** Developer Mode only — internal EditableSection bookkeeping (override
 *  flag, citation count) a reviewer does not need to approve a document,
 *  but a developer diagnosing a bad draft does. Never shown in Normal
 *  Mode, per the spec's own "do not expose internal implementation
 *  details by default" requirement. */
function renderSectionInternals(doc) {
  return renderKvList(doc.sections.map((s) => [
    s.field,
    `${s.isOverridden ? 'disunting manusia' : 'hasil AI'} · ${s.knowledgeReferences.length} rujukan pengetahuan`,
  ]));
}

/** Developer/Reviewer Mode only (Sprint 10.2) — Retrieved Knowledge,
 *  Applied Rules, Confidence, Missing Evidence, Unknown Facts,
 *  Conversation History. Returns an ARRAY of renderDetailSection() outputs
 *  (spread into renderDocDetail's own renderDetail([...]) call) rather
 *  than a second nested `.wlk-detail` card. Honest absence, never a
 *  fabricated placeholder, when no explainability was attached (a
 *  document composed before this sprint, or outside composeApprovedNor). */
function renderExplainabilitySections(documentId) {
  const result = explainDocument(documentId);
  if (!result.ok) {
    return [renderDetailSection('Explainability', renderEmptyState('Belum ada data explainability untuk draf ini.', result.error.message))];
  }
  const x = result.data;

  const retrieved = x.retrievedKnowledge.length
    ? renderKvList(x.retrievedKnowledge.map((k) => [
      k.id,
      k.available ? `${k.kind} · ${k.corroborationCount ?? 0} korroborasi · disetujui oleh ${k.approvedBy || '—'}` : 'Tidak ditemukan lagi',
    ]))
    : null;

  const citations = x.citationStatements.length
    ? renderKvList(x.citationStatements.map((c) => [c.citedKnowledgeId, c.statement]))
    : null;

  const rules = x.appliedRules.length
    ? renderKvList(x.appliedRules.map((r) => [r.id, r.label]))
    : null;

  const confidence = x.reasoningOk
    ? renderKvList([
      ['Klaim', x.reasoningClaim],
      ['Confidence', `${Math.round((x.confidence || 0) * 100)}%`],
      ['Basis Confidence', x.confidenceBasis],
    ])
    : renderKvList([['Reasoning', x.reasoningErrorCode || 'Tidak tersedia untuk draf ini']]);

  const missing = x.missingEvidence.length
    ? renderKvList(x.missingEvidence.map((c, i) => [`Konflik ${i + 1}`, JSON.stringify(c)]))
    : null;

  const unknown = x.unknownFacts.length
    ? renderKvList(x.unknownFacts.map((f) => [f, 'UNKNOWN — memerlukan masukan manusia']))
    : null;

  return [
    renderDetailSection('Retrieved Knowledge', retrieved),
    renderDetailSection('Dasar Kutipan', citations),
    renderDetailSection('Applied Rules', rules),
    renderDetailSection('Confidence', confidence),
    renderDetailSection('Missing Evidence', missing),
    renderDetailSection('Unknown Facts', unknown),
    renderDetailSection('Conversation History', renderConversationHistory(x.conversationId)),
  ];
}

/** ui/ is the one layer allowed to depend on conversation/ — see this
 *  file's header. `conversationId` is a bare id string handed back by
 *  nor-explainability-service.js, resolved here, never inside
 *  document-intelligence/ (which may not import conversation/). */
function renderConversationHistory(conversationId) {
  if (!conversationId) return null;
  const result = getConversationHistory(conversationId);
  if (!result.ok || !result.data.length) return null;
  return renderKvList(result.data.map((c) => [
    `Versi ${c.version} — ${c.state}`,
    `${Object.keys(c.gatheredFacts).length} fakta diketahui · diperbarui ${c.updatedAt}`,
  ]));
}

function renderVersionInfo(documentId) {
  const revisions = getRevisionHistory(documentId);
  if (!revisions.length) return null;
  return revisions.map((rev) => `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Versi ${rev.version}${rev.editedBy ? ` · oleh ${esc(rev.editedBy)}` : ' · disusun AI'}</div>
      ${rev.diff ? renderDiffTable(rev.diff) : renderEmptyState('Revisi awal — belum ada perbedaan.')}
    </div>`).join('');
}

/** Riwayat Keputusan — every transitionStatus() call for this document,
 *  oldest first, reused verbatim from review-history.js (Sprint 10.4). */
function renderReviewHistory(documentId) {
  const records = getReviewHistory(documentId);
  if (!records.length) return null;
  return renderKvList(records.map((r) => [
    `${composerReviewStateLabel(r.fromState)} → ${composerReviewStateLabel(r.toState)}`,
    `oleh ${r.approverId} pada ${r.decidedAt}${r.preferenceRationale ? ` — "${r.preferenceRationale}"` : ''}`,
  ]));
}

/** Part 4 (mirrors knowledge-center.js#renderGovernancePanel exactly) —
 *  the only place in this workspace a human moves a document through its
 *  review lifecycle. Which buttons appear is decided by the document's
 *  REAL status, not by taste — see composer-review-contract.js's own
 *  COMPOSER_REVIEW_GRAPH for the legal moves this mirrors. */
function renderGovernancePanel(doc) {
  const noteField = `
    <div class="wlk-form-row">
      <label>Alasan / Rasional Keputusan</label>
      <input data-act="rw-gov-note" class="wlk-input" type="text" value="${esc(st.govNote)}"
             placeholder="Mengapa Anda menyetujui, meminta revisi, atau menolak draf ini?"/>
    </div>`;
  const errorLine = st.govError
    ? `<div class="wlk-row-secondary" style="color:var(--danger,#c0392b);">${esc(st.govError)}</div>` : '';

  if (doc.status === COMPOSER_REVIEW_STATE.DRAFT) {
    if (!canReview()) {
      return `<div class="wlk-sec"><div class="wlk-sec-title">Tata Kelola</div>${renderEmptyState('Draf ini belum diajukan untuk ditinjau.', 'Anda tidak memiliki izin untuk mengajukannya.')}</div>`;
    }
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Tata Kelola</div>
        <p class="wlk-page-lede">Draf ini belum diajukan untuk ditinjau.</p>
        ${errorLine}
        <button class="wlk-btn" data-act="rw-gov-submit" data-id="${esc(doc.documentId)}" type="button">Ajukan untuk Ditinjau</button>
      </div>`;
  }
  if (doc.status === COMPOSER_REVIEW_STATE.IN_REVIEW) {
    if (!canReview() && !canApprove()) {
      return `<div class="wlk-sec"><div class="wlk-sec-title">Tata Kelola</div>${renderEmptyState('Draf ini sedang ditinjau.', 'Anda tidak memiliki izin tinjauan untuk draf ini.')}</div>`;
    }
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Tata Kelola</div>
        <p class="wlk-page-lede">Draf ini sedang ditinjau. Menyetujui memerlukan alasan tertulis — persetujuan tanpa alasan ditolak sistem.</p>
        ${noteField}
        ${errorLine}
        ${canApprove() ? `<button class="wlk-btn" data-act="rw-gov-approve" data-id="${esc(doc.documentId)}" type="button">Setujui</button>` : ''}
        ${canReview() ? `<button class="wlk-btn wlk-btn--ghost" data-act="rw-gov-request-revision" data-id="${esc(doc.documentId)}" type="button">Minta Revisi</button>` : ''}
        ${canReview() ? `<button class="wlk-btn wlk-btn--ghost" data-act="rw-gov-reject" data-id="${esc(doc.documentId)}" type="button">Tolak</button>` : ''}
      </div>`;
  }
  if (doc.status === COMPOSER_REVIEW_STATE.NEEDS_REVISION) {
    if (!canReview()) {
      return `<div class="wlk-sec"><div class="wlk-sec-title">Tata Kelola</div>${renderEmptyState('Draf ini perlu direvisi.', 'Anda tidak memiliki izin untuk mengajukannya ulang.')}</div>`;
    }
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Tata Kelola</div>
        <p class="wlk-page-lede">Draf ini perlu direvisi. Ubah bagian yang diperlukan di atas, lalu ajukan ulang untuk ditinjau.</p>
        ${errorLine}
        <button class="wlk-btn" data-act="rw-gov-resubmit" data-id="${esc(doc.documentId)}" type="button">Ajukan Ulang untuk Ditinjau</button>
      </div>`;
  }
  if (doc.status === COMPOSER_REVIEW_STATE.APPROVED) {
    const exportErrorLine = st.exportError
      ? `<div class="wlk-row-secondary" style="color:var(--danger,#c0392b);">${esc(st.exportError)}</div>` : '';
    if (!canReview() && !canApprove()) {
      return `<div class="wlk-sec"><div class="wlk-sec-title">Tata Kelola</div>${renderEmptyState('Draf ini sudah disetujui.', 'Anda tidak memiliki izin untuk mengekspor atau menerbitkannya.')}</div>`;
    }
    return `
      <div class="wlk-sec">
        <div class="wlk-sec-title">Tata Kelola</div>
        <p class="wlk-page-lede">Draf ini sudah disetujui. Ekspor untuk pratinjau, atau terbitkan untuk mencatatnya di Arsip Organisasi. Blok penerima/tembusan dan tabel rincian tetap perlu disusun manual sebelum menjadi dokumen resmi.</p>
        ${exportErrorLine}
        ${canReview() ? `<button class="wlk-btn wlk-btn--ghost" data-act="rw-export-pdf" data-id="${esc(doc.documentId)}" type="button" ${st.exportBusy ? 'disabled' : ''}>Unduh PDF</button>` : ''}
        ${canReview() ? `<button class="wlk-btn wlk-btn--ghost" data-act="rw-export-docx" data-id="${esc(doc.documentId)}" type="button" ${st.exportBusy ? 'disabled' : ''}>Unduh Word (.docx)</button>` : ''}
        ${canApprove() ? `<button class="wlk-btn" data-act="rw-gov-publish" data-id="${esc(doc.documentId)}" type="button">Terbitkan</button>` : ''}
      </div>`;
  }
  if (doc.status === COMPOSER_REVIEW_STATE.PUBLISHED) {
    if (st.showSatisfactionPrompt === doc.documentId) {
      const stars = [1, 2, 3, 4, 5].map((n) => `<button class="wlk-btn wlk-btn--ghost" data-act="rw-rate-satisfaction" data-id="${esc(doc.documentId)}" data-rating="${n}" type="button">${n}</button>`).join('');
      return `
        <div class="wlk-sec">
          <div class="wlk-sec-title">Tata Kelola</div>
          ${renderEmptyState('Draf ini sudah diterbitkan.', 'Tercatat di Arsip Organisasi.')}
          <p class="wlk-page-lede">Seberapa puas Anda dengan proses tinjauan draf ini? (1 = tidak puas, 5 = sangat puas)</p>
          ${stars}
        </div>`;
    }
    return `<div class="wlk-sec"><div class="wlk-sec-title">Tata Kelola</div>${renderEmptyState('Draf ini sudah diterbitkan.', 'Tercatat di Arsip Organisasi.')}</div>`;
  }
  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Tata Kelola</div>
      ${renderEmptyState('Tidak ada tindakan tata kelola yang tersisa.', `Status saat ini: ${esc(composerReviewStateLabel(doc.status))}.`)}
    </div>`;
}

function renderDocDetail(documentId) {
  const doc = getDocument(documentId);
  if (!doc) return '';
  const devMode = isDeveloperMode();

  const metadata = renderKvList([
    ...(devMode ? [['ID Dokumen', doc.documentId]] : []),
    ['Domain', domainLabel(doc.domainType)],
    ['Versi', doc.version],
    ['Status', composerReviewStateLabel(doc.status)],
    ['Dibuat', doc.createdAt],
    ['Diperbarui', doc.updatedAt],
  ]);

  return `
    <div class="wlk-sec">
      <div class="wlk-sec-title">Detail — ${esc(devMode ? doc.documentId : `${domainLabel(doc.domainType)} v${doc.version}`)}</div>
      ${renderGovernancePanel(doc)}
      ${renderDetail([
        renderDetailSection('Pratinjau Draf', renderDraftPreview(doc)),
        renderDetailSection('Metadata', metadata),
        devMode ? renderDetailSection('Detail Internal (Developer)', renderSectionInternals(doc)) : '',
        renderDetailSection('Riwayat Versi', renderVersionInfo(documentId)),
        renderDetailSection('Riwayat Keputusan', renderReviewHistory(documentId)),
        ...(devMode ? renderExplainabilitySections(documentId) : []),
      ])}
    </div>`;
}
