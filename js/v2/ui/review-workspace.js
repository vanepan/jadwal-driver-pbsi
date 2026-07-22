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

   PHASE 11 COURSE CORRECTION — Human-Centered Review Experience. A real
   product-direction reversal, not a bugfix: this workspace was a
   "Knowledge Inspector" (raw field/value lists, ids, numeric confidence,
   diff tables, ALL visible in Normal Mode by default) when it needed to
   be an "AI-assisted Document Editor" — the rendered NOR document itself
   as the interface, every edit direct/inline, every human edit
   automatically becoming structured learning, confidence shown visually
   never numerically, and every one of the above implementation details
   moved behind Developer Mode. `renderLiveDocument()` is the new
   Normal-Mode default (Workstream 1/2/4/5); `renderPublishAction()`
   collapses the review lifecycle into one "Terbitkan NOR" button for
   Normal Mode (Workstream 7) while `renderGovernancePanel` — the EXACT
   same state machine, unmodified — stays available, unchanged, in
   Developer Mode (so the multi-step workflow stays fully inspectable/
   operable there). `renderDraftPreview`/`renderSectionInternals`/
   `renderExplainabilitySections` all move to Developer-Mode-only
   (Workstream 6) — none are deleted, Developer Mode must stay fully
   functional per this correction's own deliverables list.
   ============================================================ */

'use strict';

import {
  getDocument, getRevisionHistory, listAllDocuments, registerChangeListener, editSection, addSection,
  transitionStatus, getReviewHistory,
} from '../document-intelligence/composer/composer-store.js';
// Phase 11 Course Correction, Workstream 4/5 — render-time-only confidence
// (never persisted; a pattern's own confidence can change as it gains
// corroboration). See that file's own header for the full documented
// hierarchy and why every number reuses an existing engine.
import { computeSectionConfidence, confidenceHighlightTone } from '../document-intelligence/composer/section-confidence-engine.js';
// Workstream 3 — the ONE place a section edit becomes structured
// learning, automatically. Reviving diff-learning-engine.js's own
// dormant bridge, not a second one.
import { recordSectionEdit } from '../document-intelligence/composer/section-learning-bridge.js';
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
import { buildHtml, buildDocumentStructure } from '../../docs/templates/composer-document.js';
// Phase 12 Sprint 12.2 — the pdfmake template and the layout version an
// exported/published document uses are now resolved from the governed
// Document Layout Binding (domainType → template + design version), not a
// hardcoded 'composer-document' string. Same resolved template today; the
// export is now also STAMPED with its layout version so it renders
// reproducibly under that version later (Layout Versioning).
import { resolveLayout } from '../../docs/design-system/document-layout-binding.js';
// Phase 12.8.x, Sprint 1 — Developer-Mode-only layout provenance (see
// renderLayoutProvenance()'s own header for why this stays a read-only
// traceability line rather than converting pdfmake's point-based page
// geometry into on-screen CSS).
import {
  getDesignSystem, designProvenance,
  // Phase 12.8.x — the layout-knob feature. registerDesignSystemVersion/
  // latestVersion are the ALREADY-BUILT "sanctioned, validated, append-
  // only path a future Settings / Live Editor UI writes through" (see
  // that file's own header on the Template Manager) — this is the first
  // real caller. Applies immediately (per the repository owner's own
  // decision): a new version becomes the LATEST the moment it's
  // registered, so every subsequent getDesignSystem('composer') call
  // (including this very page's own next render) picks it up.
  registerDesignSystemVersion, latestVersion,
} from '../../docs/design-system/document-design-system.js';
// Phase 12.8.x (Live Workspace Experience Completion) — the real,
// already-embedded PBSI mark (base64, no network fetch), the SAME
// constant doc-theme.js#orgLogo() uses for the PDF export. review-
// workspace.js is plain browser-rendered HTML, so an <img> tag is safe
// here even though buildHtml()'s docx-export path deliberately still
// avoids one (html-docx-js's base64-image support stays unverified).
import { PBSI_LOGO_DATA_URI } from '../../docs/templates/reimbursement-logo.js';
import { exportHtmlToDocx } from '../../docs/docx-exporter.js';
import { archiveDocument } from '../../../src/organizational-memory/services/archive-service.js';
import { computeDocumentHash } from '../../../src/organizational-memory/document-hash.js';
import { recordSatisfactionRating } from '../document-intelligence/composer/satisfaction-log.js';
// Phase 12.8.4 — Live Word Workspace's first real UI caller. Gated behind
// WORKSPACE_LIVE_SUGGESTIONS_ENABLED (workspace-flags.js) — merging this
// import does not itself change what a reviewer sees; the flag does. See
// refreshLiveSuggestions()'s own header for the full cadence/ownership story.
import { WORKSPACE_LIVE_SUGGESTIONS_ENABLED } from '../workspace/workspace-flags.js';
import { workspace as workspaceService, explainability as workspaceExplainability } from '../workspace/services/index.js';
import { SUGGESTION_TYPE_LABELS } from '../workspace/explainability/workspace-explainability-service.js';

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
  // Phase 11 Course Correction, Workstream 1/7
  addingField: null, // field name currently being typed into a not-yet-existing meta row
  publishConfirming: null, // documentId currently showing the "Terbitkan NOR" rationale confirmation
  publishRationale: '',
  liveDocError: null,
  // Sprint 11.6 (Reviewer Experience) — the field just committed by
  // onFocusOut, shown as a transient "Tersimpan" confirmation (Google
  // Docs-style), auto-cleared a couple seconds later. Every edit already
  // commits immediately (Sprint 11.3's commit-on-focusout) — this adds no
  // new save path, only the missing positive confirmation of one that was
  // already happening silently.
  liveDocSavedField: null,
  // Phase 12.8.4 — Live Word Workspace suggestion panel. liveSuggestions
  // is a computation-time CACHE (see refreshLiveSuggestions()'s header),
  // never re-derived inline during render — workspace-suggestion-engine.js
  // mints a fresh suggestionId on every call, so the Accept/Reject click
  // handler (a separate event from the render that showed the button)
  // needs the EXACT array that render produced, not a recomputation.
  liveWorkspaceId: null,
  liveSuggestions: [],
  liveSuggestionError: null,
  liveSuggestionWhyOpenId: null,
  // Phase 12.8.x, Sprint 2 — collapsed by default, see renderSuggestionPanel()'s own header.
  liveSuggestionPanelExpanded: false,
  // Phase 12.8.x (Live Workspace Experience Completion) — the layout-knob
  // panel. null when collapsed/not editing; an object {logoWidth,
  // marginX, marginY} (all pt, as typed, not yet saved) while open — see
  // renderLayoutPanel()'s own header for why this is number-input+button
  // rather than a live-drag slider.
  layoutPanelOpen: false,
  layoutDraft: null,
  layoutError: null,
  // Phase 12.8.x, Sprint 1 — which field Enter was pressed on, so the
  // post-commit render (below) knows whether to advance focus to the
  // next block. See advanceFocusAfterEnter()'s own header.
  liveDocAdvanceFromField: null,
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
    // Phase 12.8.2 — workspace/repository/repository-registry.js defaults
    // to NullRepository, deliberately (same "don't silently pretend to
    // persist" reasoning body/'s own registry documents) — a real backend
    // is always an explicit opt-in by a domain's first real caller, the
    // same shape composer-document-repository.js's own
    // initComposerDocumentSync() takes. This IS that opt-in: a Workspace
    // is non-durable across a reload for this pilot (it is a thin
    // orchestration handle, not a system of record — the ComposerDocument
    // it wraps already persists via RTDB) — getOrCreateWorkspaceForDocument
    // reconciles a lost Workspace by creating a fresh one, never a crash.
    workspaceService.setWorkspaceBackend('memory');
    host.addEventListener('click', onClick);
    host.addEventListener('input', onInput);
    // Workstream 2 — inline contenteditable commit fires on blur.
    // 'focusout' (not 'blur') because it bubbles, so ONE delegated
    // listener on `host` catches every editable span, the same
    // delegation idiom this file's click/input handlers already use.
    host.addEventListener('focusout', onFocusOut);
    // Sprint 11.6 — Enter-to-commit / Escape-to-cancel, same delegation idiom.
    host.addEventListener('keydown', onLiveDocKeydown);
    registerChangeListener(scheduleRender);
  }
  render();
}

export function closeReviewWorkspace() { /* shell hides the host; state is retained */ }

/** Sprint 11.3 (Document-first Experience), Requirement 1 — "Generate
 *  Draft immediately opens Live Preview, not metadata" — before this, a
 *  successful composeApprovedNor() left the caller on its OWN conversation
 *  screen; a human had to separately navigate to Drafts/Review and click
 *  the new document to ever see it. Pure state seed, same "one primitive
 *  per concern" shape sarpras-intelligence-center.js#seedConversationEntry()
 *  already uses — does not itself switch screens; every real caller (nor-
 *  center.js, sarpras-intelligence-center.js) dynamically imports this
 *  module (the SAME lazy-load path SCREENS['review'] already uses, so
 *  calling this never eagerly pulls in doc-engine.js/pdfmake a screen that
 *  is not yet visible would not otherwise load) and calls
 *  setSarprasIntelligenceScreen('review') immediately after. Only
 *  re-renders here if this workspace was already mounted once before (host
 *  truthy) — on a genuinely first visit, mountReviewWorkspace()'s own
 *  initial render() runs after this and already reads the now-set
 *  `st.selectedId`, so a second render here would be redundant. */
export function openReviewDocument(documentId) {
  st.selectedId = documentId;
  if (host) render();
}

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
  // Phase 12 Sprint 12.2 — resolve (and stamp) the governed layout for this
  // document's domainType. Guarded so a user-triggered export can never crash
  // on an unexpected/unbound domainType: it then falls back to the historical
  // generic template with no version pin (today's exact behavior). The real
  // 'nor' documents resolve the 'composer-document' template and are stamped
  // with the current layout version, so a later re-render reproduces this
  // exact layout (Layout Versioning).
  let templateId = 'composer-document';
  let layoutVersion = null;
  try {
    const layout = resolveLayout(doc.domainType);
    templateId = layout.templateId;
    layoutVersion = layout.designVersion;
  } catch { /* unbound domainType — keep the generic default, unpinned */ }
  return {
    documentId: doc.documentId,
    domainType: doc.domainType,
    version: doc.version,
    statusLabel: composerReviewStateLabel(doc.status),
    approvedAt: doc.status === COMPOSER_REVIEW_STATE.APPROVED || doc.status === COMPOSER_REVIEW_STATE.PUBLISHED ? doc.updatedAt : null,
    sections: doc.sections.map((s) => ({ field: s.field, value: s.value })),
    templateId,
    layoutVersion,
  };
}

/** Phase 12.8.x, Sprint 1 ("Live Styles") — Developer-Mode-only
 *  traceability: which governed Document Design System layout will
 *  render this document on export, so a reviewer can confirm the
 *  on-screen editor and the exported PDF/Word are drawing from the SAME
 *  registered layout rather than two silently-diverging sources.
 *
 *  DELIBERATELY DOES NOT convert document-design-system.js's page
 *  geometry (pdfmake point units — page size, margins, table line
 *  widths) into on-screen CSS. Doing so would require new unit-
 *  conversion logic with no existing visual-regression test to catch a
 *  mistake, against this file's own heavily-tested, currently-correct
 *  `.rw-doc` appearance — exactly the kind of risk "don't break what
 *  already works" rules out for a cosmetic, hard-to-verify gain. This
 *  read-only provenance line is the safe subset of that gap that's
 *  worth closing now; true WYSIWYG pixel parity is a separate, real
 *  future task (see the Sprint 12.8.x report's own risk note). */
function renderLayoutProvenance(doc) {
  try {
    const layout = resolveLayout(doc.domainType);
    const ds = getDesignSystem(layout.templateId, layout.designVersion);
    return `<p class="wlk-row-secondary">${esc(designProvenance(ds))}</p>`;
  } catch {
    return `<p class="wlk-row-secondary">Domain "${esc(doc.domainType)}" belum terikat ke tata letak baku manapun.</p>`;
  }
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
    st.addingField = null; st.publishConfirming = null; st.publishRationale = ''; st.liveDocError = null;
    st.liveSuggestionWhyOpenId = null; st.liveSuggestionError = null;
    refreshLiveSuggestions(st.selectedId);
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
  // ── Phase 12.8.x — recipients/cc role-list add/remove. Same "read
  //    current array, patch it, write the whole field back through the
  //    existing editSection()" shape commitRoleListEntry() uses. ───────
  if (act === 'rw-role-add' || act === 'rw-role-remove') {
    if (!canReview()) { st.liveDocError = 'Anda tidak memiliki izin untuk mengedit draf ini.'; render(); return; }
    const documentId = el.dataset.docId;
    const field = el.dataset.roleField;
    const doc = getDocument(documentId);
    if (!doc) return;
    const section = doc.sections.find((s) => s.field === field);
    const list = section && Array.isArray(section.value) ? [...section.value] : [];
    if (act === 'rw-role-add') list.push('');
    else list.splice(Number(el.dataset.roleIndex), 1);
    const result = editSection(documentId, field, list, currentActorId());
    st.liveDocError = result.ok ? null : result.error.message;
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
      ? generateAndOpen(data.templateId, data, { viewer: { title: data.documentId } })
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
    archiveOnPublish(result.document);
    st.govError = null;
    st.showSatisfactionPrompt = documentId;
    render();
    return;
  }
  if (act === 'rw-rate-satisfaction') {
    recordSatisfactionRating({ documentId: el.dataset.id, rating: Number(el.dataset.rating), actorId: currentActorId() });
    st.showSatisfactionPrompt = null;
    render();
    return;
  }
  // ── Phase 11 Course Correction, Workstream 7 — the single "Terbitkan
  //    NOR" action. The state machine underneath (composer-review-
  //    contract.js, transitionStatus's own RATIONALE_REQUIRED check) is
  //    completely unchanged — this only sequences the SAME transitions
  //    the Developer-Mode governance panel above already calls one at a
  //    time, and only ever for a user who genuinely holds the capability
  //    each individual transition already requires. ──────────────────
  if (act === 'rw-publish-start') { handlePublishStart(el.dataset.id); return; }
  if (act === 'rw-publish-confirm') { handlePublishConfirm(el.dataset.id); return; }
  if (act === 'rw-publish-cancel') { st.publishConfirming = null; st.publishRationale = ''; st.govError = null; render(); return; }
  // ── Phase 12.8.4/12.8.5 — Live Suggestion accept/reject and the
  //    Phase 12.8.6 "why" panel. Looks up the suggestion by id in
  //    st.liveSuggestions (the array render() just displayed), never
  //    recomputes — see refreshLiveSuggestions()'s header. ────────────
  if (act === 'rw-suggestion-accept' || act === 'rw-suggestion-reject') {
    if (!canReview()) { st.liveSuggestionError = 'Anda tidak memiliki izin untuk menindaklanjuti saran ini.'; render(); return; }
    const suggestion = st.liveSuggestions.find((s) => s.suggestionId === el.dataset.suggestionId);
    if (!suggestion || !st.liveWorkspaceId) return;
    const decision = act === 'rw-suggestion-accept' ? 'accepted' : 'rejected';
    const result = workspaceService.decideSuggestion(st.liveWorkspaceId, suggestion, decision, { actorId: currentActorId() });
    st.liveSuggestionError = result.ok ? null : result.error.message;
    if (result.ok) { st.liveSuggestionWhyOpenId = null; refreshLiveSuggestions(st.selectedId, { justDecidedSuggestionId: suggestion.suggestionId }); }
    render();
    return;
  }
  if (act === 'rw-suggestion-why') {
    st.liveSuggestionWhyOpenId = st.liveSuggestionWhyOpenId === el.dataset.suggestionId ? null : el.dataset.suggestionId;
    render();
    return;
  }
  if (act === 'rw-suggestion-panel-toggle') {
    st.liveSuggestionPanelExpanded = !st.liveSuggestionPanelExpanded;
    render();
    return;
  }
  // ── Phase 12.8.x — layout-knob panel. ─────────────────────────────
  if (act === 'rw-layout-toggle') {
    st.layoutPanelOpen = !st.layoutPanelOpen;
    // Seed the draft from the CURRENT resolved design system every time
    // the panel opens — never stale, never carries over a value from a
    // previous document's own (possibly different) resolved layout.
    const ds = getDesignSystem('composer');
    st.layoutDraft = st.layoutPanelOpen ? { logoWidth: ds.logo.width, marginX: ds.page.margins[0], marginY: ds.page.margins[1] } : null;
    st.layoutError = null;
    render();
    return;
  }
  if (act === 'rw-layout-save') {
    if (!canReview()) { st.layoutError = 'Anda tidak memiliki izin untuk mengubah tata letak.'; render(); return; }
    const draft = st.layoutDraft;
    if (!draft || !Number.isFinite(draft.logoWidth) || !Number.isFinite(draft.marginX) || !Number.isFinite(draft.marginY)) {
      st.layoutError = 'Nilai tata letak tidak valid.'; render(); return;
    }
    try {
      const current = getDesignSystem('composer');
      registerDesignSystemVersion('composer', {
        ...current,
        version: latestVersion('composer') + 1,
        provenance: `Diatur manual oleh ${currentActorId()} pada ${new Date().toISOString()} melalui Live Workspace.`,
        page: { ...current.page, margins: [draft.marginX, draft.marginY, draft.marginX, draft.marginY] },
        logo: { ...current.logo, width: draft.logoWidth },
      });
      st.layoutError = null;
      st.layoutPanelOpen = false;
      st.layoutDraft = null;
    } catch (err) {
      st.layoutError = (err && err.message) || 'Gagal menyimpan tata letak.';
    }
    render();
    return;
  }
}

/** Phase 12.8.4 — computes (never persists) a fresh Live Suggestion list
 *  for one document. Idle-triggered: called on document selection and on
 *  a successful edit commit (onFocusOut, below) — the SAME cadence
 *  composer-store.js#editSection already commits on, never per-keystroke
 *  (the architecture review's own performance requirement). Cached onto
 *  st.liveSuggestions so a later Accept/Reject click (a separate DOM
 *  event from the render that showed the button) resolves the EXACT
 *  suggestion object shown — workspace-suggestion-engine.js is pure and
 *  stateless, so re-running it between render and click would mint a
 *  different suggestionId for what is conceptually the same suggestion.
 *  Fails silent-and-honest: flag off, no document, or no review
 *  capability all leave the panel empty, never a fabricated placeholder
 *  (dormant-subsystems.js's own discipline — this is not a REGISTERED
 *  dormant subsystem, because it has no asymmetric reader/writer: the
 *  panel that reads st.liveSuggestions is the same code path that
 *  writes it, right here). */
/** Phase 12.8.x, Sprint 5 — a stable identity for "the same conceptual
 *  suggestion" across two DIFFERENT computeSuggestionsFor() calls, since
 *  workspace-suggestion-engine.js mints a fresh suggestionId every time
 *  (it is pure/stateless — see that file's own header). Never includes
 *  confidence/evidence: those may legitimately drift call to call without
 *  it being a genuinely different suggestion. */
function suggestionKey(s) {
  return `${s.suggestionType}:${s.sourceDomain}:${s.sourceRecordId}:${s.blockId}`;
}

/** @param {string} documentId
 *  @param {{justDecidedSuggestionId?: string|null}} [opts] - Sprint 5:
 *  the suggestionId a caller JUST explicitly accepted/rejected, moments
 *  before calling this — excluded from the ignored-diff below so an
 *  explicit decision is never ALSO counted as "ignored" in the same
 *  refresh (see decideSuggestion()'s own header for why these must stay
 *  three distinct, non-overlapping outcomes). */
function refreshLiveSuggestions(documentId, { justDecidedSuggestionId = null } = {}) {
  const previous = st.liveSuggestions;
  const previousWorkspaceId = st.liveWorkspaceId;
  st.liveSuggestions = [];
  st.liveWorkspaceId = null;
  if (!WORKSPACE_LIVE_SUGGESTIONS_ENABLED || !documentId || !canReview()) return;
  try {
    const ws = workspaceService.getOrCreateWorkspaceForDocument(documentId, { ownerId: currentActorId() });
    if (!ws.ok) return;
    st.liveWorkspaceId = ws.data.workspaceId;
    st.liveSuggestions = workspaceService.computeSuggestionsFor(ws.data.workspaceId);

    // Phase 12.8.x, Sprint 5 — "every ignored suggestion" (the brief's own
    // words). Only compares against the SAME workspace's own immediately
    // preceding cycle — a genuinely different document/workspace has
    // nothing meaningful to diff against.
    if (previousWorkspaceId && previousWorkspaceId === st.liveWorkspaceId) {
      const currentKeys = new Set(st.liveSuggestions.map(suggestionKey));
      for (const old of previous) {
        if (old.suggestionId === justDecidedSuggestionId) continue;
        if (!currentKeys.has(suggestionKey(old))) {
          workspaceService.decideSuggestion(st.liveWorkspaceId, old, 'ignored', { actorId: currentActorId() });
        }
      }
    }
  } catch (err) {
    st.liveSuggestionError = (err && err.message) || 'Gagal memuat saran organisasi.';
  }
}

/** Composed HERE (ui/), the one layer allowed to see both document-
 *  intelligence/ and organizational-memory/ — same composition knowledge-
 *  center.js's own kc-gov-reject click handler already does. Extracted
 *  from the (unmodified) rw-gov-publish handler above so Workstream 7's
 *  new "Terbitkan NOR" path can reuse the exact same archival write,
 *  never a second implementation of it. */
function archiveOnPublish(doc) {
  const fieldMap = Object.fromEntries(doc.sections.map((s) => [s.field, s.value]));
  const documentNumber = fieldMap.norNumber || doc.documentId;
  archiveDocument({
    id: `composer-archive:${doc.documentId}`,
    sourceDomainType: doc.domainType,
    sourceId: doc.documentId,
    sourceType: 'composer',
    documentNumber,
    documentHash: computeDocumentHash(fieldMap),
    sourceSnapshot: fieldMap,
    archivedBy: currentActorId(),
  });
}

/** Click "Terbitkan NOR": a user who holds publish authority sees one
 *  rationale confirmation (rationale is only ever required for the
 *  APPROVED transition — never faked away, transitionStatus() itself
 *  still enforces RATIONALE_REQUIRED). A user who only holds review
 *  authority has no approval step to confirm — this immediately submits
 *  the document into the existing review queue and stops; it never
 *  attempts a transition their role cannot legally make anyway. */
function handlePublishStart(documentId) {
  const doc = getDocument(documentId);
  if (!doc) return;
  if (canApprove()) {
    st.publishConfirming = documentId;
    st.publishRationale = '';
    st.govError = null;
    render();
    return;
  }
  if (!canReview()) { st.govError = 'Anda tidak memiliki izin untuk tindakan ini.'; render(); return; }
  if (doc.status === COMPOSER_REVIEW_STATE.DRAFT || doc.status === COMPOSER_REVIEW_STATE.NEEDS_REVISION) {
    const result = transitionStatus(documentId, COMPOSER_REVIEW_STATE.IN_REVIEW, { actorId: currentActorId(), rationale: null });
    st.govError = result.ok ? null : result.error.message;
  }
  render();
}

/** The rationale confirmation's own "Konfirmasi Terbitkan" — walks
 *  whichever of draft -> in_review -> approved -> published transitions
 *  the document's CURRENT status still needs, using the real, unmodified
 *  transitionStatus() for each step (never a shortcut around
 *  canTransitionComposerReview/RATIONALE_REQUIRED). Stops and surfaces
 *  the real error the moment any step fails, rather than silently
 *  swallowing it. */
function handlePublishConfirm(documentId) {
  const rationale = st.publishRationale.trim();
  if (!rationale) { st.govError = 'Alasan/rasional diperlukan untuk menerbitkan.'; render(); return; }
  let doc = getDocument(documentId);
  if (!doc) return;

  if (doc.status === COMPOSER_REVIEW_STATE.DRAFT || doc.status === COMPOSER_REVIEW_STATE.NEEDS_REVISION) {
    const submitResult = transitionStatus(documentId, COMPOSER_REVIEW_STATE.IN_REVIEW, { actorId: currentActorId(), rationale: null });
    if (!submitResult.ok) { st.govError = submitResult.error.message; render(); return; }
    doc = submitResult.document;
  }
  if (doc.status === COMPOSER_REVIEW_STATE.IN_REVIEW) {
    const approveResult = transitionStatus(documentId, COMPOSER_REVIEW_STATE.APPROVED, { actorId: currentActorId(), rationale });
    if (!approveResult.ok) { st.govError = approveResult.error.message; render(); return; }
    doc = approveResult.document;
  }
  if (doc.status === COMPOSER_REVIEW_STATE.APPROVED) {
    const publishResult = transitionStatus(documentId, COMPOSER_REVIEW_STATE.PUBLISHED, { actorId: currentActorId(), rationale: null });
    if (!publishResult.ok) { st.govError = publishResult.error.message; render(); return; }
    archiveOnPublish(publishResult.document);
    doc = publishResult.document;
  }

  st.publishConfirming = null;
  st.publishRationale = '';
  st.govError = null;
  st.showSatisfactionPrompt = doc.status === COMPOSER_REVIEW_STATE.PUBLISHED ? documentId : null;
  render();
}

/** Workstream 2 — the actual inline-edit commit. Fires on losing focus
 *  from any `.rw-editable` span (existing section -> editSection; a
 *  blank meta row a human just typed into for the first time ->
 *  addSection — Workstream 1). Immediately followed by Workstream 3's
 *  automatic learning bridge on any real, non-empty-to-non-empty change.
 *  Deletion (cleared to empty) still calls editSection (recording the
 *  removal as a real Diff) but is routed to the bridge as
 *  editKind:'delete', never a pattern Correction — see that file's own
 *  header. */
function onFocusOut(e) {
  const el = e.target.closest && e.target.closest('.rw-editable');
  if (!el) return;

  // Phase 12.8.x — recipients/cc role-list entries and signatory grid
  // slots each carry their OWN dataset keys (never data-field/data-new-
  // field), so they never reach the generic per-scalar-field path below
  // at all — routed here, first, to their own array-aware commit logic.
  if (el.dataset.roleField) { commitRoleListEntry(el); return; }
  if (el.dataset.sigRow) { commitSignatorySlot(el); return; }

  const documentId = el.dataset.docId;
  const field = el.dataset.field || el.dataset.newField;
  if (!documentId || !field) return;

  const before = el.dataset.originalValue || '';
  const after = (el.textContent || '').trim();
  if (after === before) return; // nothing actually changed — no-op, no write

  if (!canReview()) { st.liveDocError = 'Anda tidak memiliki izin untuk mengedit draf ini.'; el.textContent = before; render(); return; }

  const doc = getDocument(documentId);
  if (!doc) return;

  const isNewField = !el.dataset.field;
  const result = isNewField
    ? (after ? addSection(documentId, field, after, currentActorId()) : { ok: true, document: doc, error: null }) // typing nothing into a blank row is a no-op, not an error
    : editSection(documentId, field, after, currentActorId());

  if (!result.ok) { st.liveDocError = result.error.message; render(); return; }
  st.liveDocError = null;

  if (!isNewField || after) {
    recordSectionEdit({ documentId, domainType: doc.domainType, field, before, after, actorId: currentActorId() });
    // Sprint 11.6 — the "Tersimpan" confirmation, cleared a couple seconds
    // later via the same debounced-render idiom scheduleRender() already
    // establishes elsewhere in this file (a one-shot timer, not a poll).
    st.liveDocSavedField = field;
    const savedField = field;
    setTimeout(() => { if (st.liveDocSavedField === savedField) { st.liveDocSavedField = null; render(); } }, 2200);
    // Phase 12.8.4 — refresh Live Suggestions on the SAME idle cadence a
    // content edit already commits on (blur), never per-keystroke.
    refreshLiveSuggestions(documentId);
  }
  render();
  // Phase 12.8.x, Sprint 1 — see advanceFocusAfterEnter()'s own header.
  // Placed AFTER render() deliberately: the old DOM (including `el`) was
  // just destroyed by host.innerHTML's reassignment above, so the next
  // editable element must be looked up fresh, in the newly rendered DOM.
  advanceFocusAfterEnter(field);
}

/** Phase 12.8.x — commits ONE role-list entry (recipients/cc). Reads the
 *  field's CURRENT array value fresh from the document (never from stale
 *  render-time state), replaces exactly the one edited index, and writes
 *  the WHOLE array back via the existing, unmodified editSection() —
 *  computeDiff()'s own shallowEqual (JSON.stringify comparison) already
 *  handles array/object values correctly, so no change to composer-store.js
 *  was needed for this. Clearing an entry to empty REMOVES it (splice),
 *  matching the "+ Tambah" affordance's own expectation that a human who
 *  changes their mind just empties the row rather than leaving a stray
 *  numbered blank. Deliberately does NOT call recordSectionEdit() — that
 *  bridge is specifically for PATTERN TEXT correction learning (semantic
 *  diff classification of sentence-pattern edits); a recipient/cc role is
 *  a different kind of fact entirely, not a language pattern. */
function commitRoleListEntry(el) {
  const documentId = el.dataset.docId;
  const field = el.dataset.roleField;
  const index = Number(el.dataset.roleIndex);
  const before = el.dataset.originalValue || '';
  const after = (el.textContent || '').trim();
  if (after === before) return;
  if (!canReview()) { st.liveDocError = 'Anda tidak memiliki izin untuk mengedit draf ini.'; el.textContent = before; render(); return; }
  const doc = getDocument(documentId);
  if (!doc) return;
  const section = doc.sections.find((s) => s.field === field);
  const list = section && Array.isArray(section.value) ? [...section.value] : [];
  if (after) list[index] = after; else list.splice(index, 1);
  const result = editSection(documentId, field, list, currentActorId());
  if (!result.ok) { st.liveDocError = result.error.message; render(); return; }
  st.liveDocError = null;
  render();
}

/** Phase 12.8.x — commits ONE signatory slot's ONE field (label/position/
 *  name). Same "read current value, patch one slot, write the whole
 *  structured field back through the existing editSection()" shape as
 *  commitRoleListEntry above — no composer-store.js change needed. Never
 *  calls recordSectionEdit(): a signatory identity is not a language
 *  pattern either. */
function commitSignatorySlot(el) {
  const documentId = el.dataset.docId;
  const rowKey = el.dataset.sigRow;
  const index = Number(el.dataset.sigIndex);
  const slotField = el.dataset.sigField;
  const before = el.dataset.originalValue || '';
  const after = (el.textContent || '').trim();
  if (after === before) return;
  if (!canReview()) { st.liveDocError = 'Anda tidak memiliki izin untuk mengedit draf ini.'; el.textContent = before; render(); return; }
  const doc = getDocument(documentId);
  if (!doc) return;
  const section = doc.sections.find((s) => s.field === 'signatories');
  if (!section || !section.value) return;
  const signatories = { top: [...section.value.top], bottom: [...section.value.bottom] };
  const row = [...signatories[rowKey]];
  row[index] = { ...row[index], [slotField]: after || null };
  signatories[rowKey] = row;
  const result = editSection(documentId, 'signatories', signatories, currentActorId());
  if (!result.ok) { st.liveDocError = result.error.message; render(); return; }
  st.liveDocError = null;
  render();
}

/** Sprint 11.6 (Reviewer Experience) — "faster editing, minimal clicks."
 *  Enter commits the field immediately (same effect as clicking away) so a
 *  reviewer can move through several short fields without ever reaching
 *  for the mouse; Shift+Enter still inserts a real line break for the rare
 *  section that genuinely needs one. Escape discards the in-progress edit
 *  by restoring the original text before blurring, so onFocusOut's own
 *  before===after guard turns it into a real no-op — never a written
 *  "revert" correction, just nothing having happened. */
function onLiveDocKeydown(e) {
  const el = e.target.closest && e.target.closest('.rw-editable');
  if (!el) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    // Phase 12.8.x, Sprint 1 — "continuous flow" without a rewrite: Enter
    // already committed the field (Sprint 11.6); recording which field
    // here lets advanceFocusAfterEnter() (called from onFocusOut, after
    // the DOM is re-rendered) move focus to the next block, the same way
    // Tab moves between fields in a real document editor.
    st.liveDocAdvanceFromField = el.dataset.field || el.dataset.newField;
    el.blur();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    el.textContent = el.dataset.originalValue || '';
    el.blur();
  }
}

/** Phase 12.8.x, Sprint 1 — moves focus to the next `.rw-editable` block
 *  after a real, Enter-committed edit, the one piece of "feels like
 *  Word" achievable without rewriting this file's per-field
 *  contenteditable commit/diff model into a single continuous surface
 *  (judged too high-risk against this file's own extensive existing
 *  test coverage — see review-workspace-render-check.mjs /
 *  editing-pipeline-invariants-check.mjs). Only fires for the EXACT
 *  field Enter was pressed on (never a plain blur/click-away commit, and
 *  never when onFocusOut's own before===after guard already no-op'd the
 *  keystroke) — a stale flag from a no-op Enter simply fails the
 *  equality check below and is cleared, never causing a wrong jump. */
function advanceFocusAfterEnter(committedField) {
  const wantsAdvance = st.liveDocAdvanceFromField === committedField;
  st.liveDocAdvanceFromField = null;
  if (!wantsAdvance || !host) return;
  const editables = [...host.querySelectorAll('.rw-editable[contenteditable="true"]')];
  const idx = editables.findIndex((el) => (el.dataset.field || el.dataset.newField) === committedField);
  const next = idx >= 0 ? editables[idx + 1] : null;
  if (next) next.focus();
}

/** State only — never re-render on a keystroke, or the focused <input> is
 *  destroyed mid-word (the same lesson dataset-import-center.js already
 *  documents, and knowledge-center.js's own onInput follows). */
function onInput(e) {
  const editEl = e.target.closest('[data-act="rw-edit-value"]');
  if (editEl) { st.editValue = editEl.value; return; }
  const govEl = e.target.closest('[data-act="rw-gov-note"]');
  if (govEl) { st.govNote = govEl.value; return; }
  const publishRationaleEl = e.target.closest('[data-act="rw-publish-rationale"]');
  if (publishRationaleEl) { st.publishRationale = publishRationaleEl.value; return; }
  // Phase 12.8.x — layout-knob draft, state only (never render() here —
  // same reason every other free-text input above doesn't either: it
  // would destroy the focused control mid-keystroke).
  const layoutEl = e.target.closest('[data-act="rw-layout-input"]');
  if (layoutEl && st.layoutDraft) { st.layoutDraft[layoutEl.dataset.layoutField] = Number(layoutEl.value); }
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

/* ══════════════════════════════════════════════════════════════════════
   PHASE 11 COURSE CORRECTION — LIVE DOCUMENT WORKSPACE (Workstream 1/2/4/5)
   The Normal-Mode default view: a real, letterhead-styled NOR, every
   visible value directly contenteditable, confidence shown as a color
   underline (never a number). See this file's own header for why this
   replaces renderDraftPreview() as the primary surface (renderDraftPreview
   itself is unchanged, just moved to Developer-Mode-only — see
   renderDocDetail()).
   ══════════════════════════════════════════════════════════════════════ */

/** Sprint 11.3 (Document-first Experience) — "which section is the
 *  dateline / which are the fixed letterhead rows (Kepada Yth./Dari/
 *  Tembusan Yth./Perihal/Lampiran — Part A1's own extraction of two real
 *  archived PBSI NOR samples; not one of these is ever populated by
 *  nor-composer.js today, measured "100% manual, every NOR Type") / which
 *  are the letter's own body paragraphs / which are leftover 'Rincian'
 *  facts" is no longer decided twice: this workspace now reads the exact
 *  same structural decision js/docs/templates/composer-document.js#
 *  buildDocumentStructure() already makes for PDF/Word export — see that
 *  file's own header for why. Blank letterhead rows still render as
 *  directly-editable spans so a reviewer can fill them in Word-style;
 *  addSection() (Workstream 1) is what lets a first keystroke here
 *  actually create the field, never a pre-guessed value. */

/** One `.rw-editable` span — the ONE place both an EXISTING section
 *  (data-field) and a NOT-YET-EXISTING one (data-new-field, Workstream 1)
 *  render identically, so onFocusOut()'s commit handler needs no separate
 *  code path for "typing into a blank letterhead row" vs. "editing an
 *  existing paragraph." Confidence highlighting (Workstream 4/5) is
 *  computed fresh here, at render time — never persisted. */
function renderEditableSpan(doc, section, { field, placeholder = '', tag = 'span', extraClass = '' } = {}) {
  const editable = canReview();
  const value = section ? (section.value == null ? '' : String(section.value)) : '';
  const isEmpty = !value.trim() || (typeof section?.value === 'string' && section.value.includes('UNKNOWN'));
  const confidence = section ? computeSectionConfidence(section, doc) : { tone: 'danger' };
  const confClass = isEmpty ? '' : `rw-conf-${confidenceHighlightTone(confidence.tone)}`;
  const devMode = isDeveloperMode();
  const attrs = section
    ? `data-field="${esc(section.field)}"`
    : `data-new-field="${esc(field)}"`;
  const shownValue = isEmpty ? '' : esc(value).replace(/UNKNOWN — memerlukan masukan manusia/g, '').trim();
  return `<${tag} class="rw-editable ${isEmpty ? 'rw-editable--empty' : confClass} ${extraClass}"
    ${attrs} data-doc-id="${esc(doc.documentId)}" data-original-value="${esc(value)}"
    data-placeholder="${esc(placeholder)}" contenteditable="${editable}" spellcheck="false"
    >${shownValue}</${tag}>${devMode && section && !isEmpty ? `<span class="rw-conf-detail" title="${esc(confidence.rationale || '')}">${Math.round(confidence.confidence * 100)}%</span>` : ''}`;
}

function renderConfidenceLegend() {
  return `
    <div class="rw-conf-legend">
      <span><span class="rw-conf-legend-dot rw-conf-legend-dot--green"></span>Yakin</span>
      <span><span class="rw-conf-legend-dot rw-conf-legend-dot--yellow"></span>Perlu ditinjau</span>
      <span><span class="rw-conf-legend-dot rw-conf-legend-dot--red"></span>Belum ada/perlu masukan</span>
    </div>`;
}

/** Humanizes a non-pattern field id for the "Rincian" appendix — reuses
 *  composer-document.js's exact camelCase/snake_case -> Title Case rule
 *  (kept as a small local copy since that file's own fieldLabel() is not
 *  exported for reuse — both are one-line, deliberately identical, never
 *  meant to drift). */
function humanFieldLabel(field) {
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Phase 12.8.x — pt is what the Document Design System speaks; px is
 *  what CSS speaks. 96dpi/72pt is the standard conversion every browser
 *  already uses internally for the reverse direction. */
function ptToPx(pt) { return Math.round(pt * (96 / 72)); }

function renderLiveDocument(doc) {
  const structure = buildDocumentStructure(doc.sections);
  const dariField = structure.metaFields.find((m) => m.field === 'dari');
  const restFields = structure.metaFields.filter((m) => m.field !== 'dari');
  // Phase 12.8.x — the SAME 'composer' Document Design System the PDF/Word
  // export resolves (composer-document.js#build()) — always the LATEST
  // version, so a layout saved via renderLayoutPanel() below is reflected
  // here on the very next render, not just in future exports.
  const ds = getDesignSystem('composer');
  const [marginL, marginT, marginR, marginB] = ds.page.margins;
  const docStyle = `padding:${ptToPx(marginT)}px ${ptToPx(marginR)}px ${ptToPx(marginB)}px ${ptToPx(marginL)}px;`;

  return `
    <div class="rw-doc" style="${docStyle}">
      ${canReview() ? `
        <div class="rw-save-status${st.liveDocSavedField ? ' rw-save-status--active' : ''}" aria-live="polite">
          ${st.liveDocSavedField ? '✓ Tersimpan' : 'Tersimpan otomatis'}
        </div>` : ''}
      ${canReview() ? renderConfidenceLegend() : ''}
      <img class="rw-doc-logo" src="${PBSI_LOGO_DATA_URI}" alt="Logo PBSI" width="${ds.logo.width}" />
      ${renderEditableSpan(doc, structure.documentTitleSection, { field: 'documentTitle', placeholder: 'Nota Organisasi', tag: 'div', extraClass: 'rw-doc-title' })}
      <div class="rw-doc-dateline">
        ${renderEditableSpan(doc, structure.dateLineSection, { field: 'dateline', placeholder: 'Jakarta, [tanggal]' })}
        ${renderEditableSpan(doc, structure.norNumberSection, { field: 'norNumber', placeholder: 'No. [nomor dokumen]' })}
      </div>
      <div class="rw-doc-meta">
        <!-- Phase 12.8.x — real letterhead order: Kepada Yth., Dari,
             Tembusan Yth., then the rest. recipientsSection/ccSection are
             null for a document that predates the structured field, in
             which case the OLD kepadaYth/tembusanYth rows already appear
             among restFields (buildDocumentStructure's own fallback). -->
        ${structure.recipientsSection ? renderRoleList(doc, 'recipients', 'Kepada Yth.', structure.recipientsSection.value) : ''}
        ${dariField ? `
          <div class="rw-doc-meta-row">
            <span class="rw-doc-meta-label">${esc(dariField.label)}</span>
            <span class="rw-doc-meta-value">${renderEditableSpan(doc, dariField.section, { field: dariField.field, placeholder: 'Klik untuk mengisi…', tag: 'div' })}</span>
          </div>` : ''}
        ${structure.ccSection ? renderRoleList(doc, 'cc', 'Tembusan Yth.', structure.ccSection.value) : ''}
        ${restFields.map((m) => `
          <div class="rw-doc-meta-row">
            <span class="rw-doc-meta-label">${esc(m.label)}</span>
            <span class="rw-doc-meta-value">${renderEditableSpan(doc, m.section, { field: m.field, placeholder: 'Klik untuk mengisi…', tag: 'div' })}</span>
          </div>`).join('')}
      </div>
      <div class="rw-doc-body">
        ${structure.bodySections.length
    ? structure.bodySections.map((s) => `<p class="rw-doc-para">${renderEditableSpan(doc, s, { tag: 'span' })}</p>`).join('')
    : '<p class="rw-doc-para rw-editable--empty" style="border:none;">Belum ada isi surat yang tersusun.</p>'}
      </div>
      ${structure.detailSections.length ? `
        <div class="wlk-sec-title" style="font-family:var(--font-sans);margin-top:24px;">Rincian</div>
        <ul class="wlk-kv-list">
          ${structure.detailSections.map((s) => `
            <li class="wlk-kv-row">
              <span class="wlk-kv-key">${esc(humanFieldLabel(s.field))}</span>
              <span class="wlk-kv-val">${renderEditableSpan(doc, s, { tag: 'span' })}</span>
            </li>`).join('')}
        </ul>` : ''}
      ${renderSignatoryGrid(doc, structure.signatureSuggestion)}
      ${st.liveDocError ? `<div class="rw-edit-error">${esc(st.liveDocError)}</div>` : ''}
    </div>
    ${canReview() ? renderLayoutPanel(ds) : ''}`;
}

/** Phase 12.8.x (Live Workspace Experience Completion) — "adjust the
 *  layout, it's remembered for next time." Number-input + explicit
 *  "Simpan" button, deliberately NOT a live-drag slider: an 'input' event
 *  firing render() on every keystroke/drag tick would destroy the
 *  focused control mid-interaction — the same reason onInput() (above)
 *  already only ever writes to `st`, never calls render(), for every
 *  other free-text field in this file. Saves through
 *  registerDesignSystemVersion() — the ALREADY-BUILT, validated,
 *  append-only Template Manager write path (document-design-system.js's
 *  own header names this as built for exactly this future UI) — applying
 *  IMMEDIATELY (the repository owner's own explicit choice): the very
 *  next render (any document, not just this one) resolves the new
 *  version, and composer-document.js's PDF/Word export does too, since
 *  both always resolve the LATEST version, never a cached one.
 *
 *  HONEST LIMITATION, DISCLOSED: document-design-system.js is pure,
 *  in-memory data — "no DOM, no imports, no side effects" by its own
 *  design (so it can be unit-tested in Node with zero coupling). A
 *  version saved here lives for this browser session/tab only; a full
 *  page reload reverts to the last hardcoded version. Durable (RTDB-
 *  backed) persistence is a real, separate, larger undertaking — the
 *  panel says so below, never silently implying permanence it doesn't have. */
function renderLayoutPanel(ds) {
  if (!st.layoutPanelOpen) {
    return `<button class="rw-layout-toggle" data-act="rw-layout-toggle" type="button">⚙ Sesuaikan Tata Letak</button>`;
  }
  const draft = st.layoutDraft || { logoWidth: ds.logo.width, marginX: ds.page.margins[0], marginY: ds.page.margins[1] };
  return `
    <div class="rw-layout-panel">
      <div class="rw-layout-panel-title">
        <span>Sesuaikan Tata Letak <span class="rw-layout-panel-hint">(berlaku untuk sesi ini)</span></span>
        <button class="rw-suggestion-collapse" data-act="rw-layout-toggle" type="button" aria-label="Tutup">✕</button>
      </div>
      <div class="rw-layout-row">
        <label for="rw-layout-logo">Ukuran logo (pt)</label>
        <input id="rw-layout-logo" data-act="rw-layout-input" data-layout-field="logoWidth" type="number" min="24" max="120" value="${draft.logoWidth}" class="wlk-input" />
      </div>
      <div class="rw-layout-row">
        <label for="rw-layout-mx">Margin kiri/kanan (pt)</label>
        <input id="rw-layout-mx" data-act="rw-layout-input" data-layout-field="marginX" type="number" min="20" max="100" value="${draft.marginX}" class="wlk-input" />
      </div>
      <div class="rw-layout-row">
        <label for="rw-layout-my">Margin atas/bawah (pt)</label>
        <input id="rw-layout-my" data-act="rw-layout-input" data-layout-field="marginY" type="number" min="20" max="100" value="${draft.marginY}" class="wlk-input" />
      </div>
      ${st.layoutError ? `<div class="rw-edit-error">${esc(st.layoutError)}</div>` : ''}
      <button class="wlk-btn" data-act="rw-layout-save" type="button">Simpan Tata Letak</button>
    </div>`;
}

/** Phase 12.8.x — a real, editable numbered role list (Kepada Yth./
 *  Tembusan Yth.) — recipients/cc are real string arrays (see
 *  nor-composer.js's own header: never fabricated, a human types each one
 *  in). Reuses the SAME `.rw-editable` visual language as every other
 *  field, distinguished by data-role-field/data-role-index instead of
 *  data-field/data-new-field, so onFocusOut/onClick can route these to
 *  their own array-aware commit logic (commitRoleListEntry, below)
 *  without touching the existing per-scalar-field path at all. */
function renderRoleList(doc, field, label, list) {
  const editable = canReview();
  const items = list || [];
  return `
    <div class="rw-doc-meta-row rw-doc-meta-row--list">
      <span class="rw-doc-meta-label">${esc(label)}</span>
      <div class="rw-role-list">
        ${items.map((value, i) => `
          <div class="rw-role-row">
            <span class="rw-role-index">${i + 1}.</span>
            <span class="rw-editable rw-role-entry" data-role-field="${esc(field)}" data-role-index="${i}"
              data-doc-id="${esc(doc.documentId)}" data-original-value="${esc(value)}"
              contenteditable="${editable}" spellcheck="false">${esc(value)}</span>
            ${editable ? `<button class="rw-role-remove" data-act="rw-role-remove" data-role-field="${esc(field)}" data-role-index="${i}" data-doc-id="${esc(doc.documentId)}" type="button" aria-label="Hapus">×</button>` : ''}
          </div>`).join('')}
        ${!items.length && !editable ? '<span class="rw-editable--empty">—</span>' : ''}
        ${editable ? `<button class="rw-role-add" data-act="rw-role-add" data-role-field="${esc(field)}" data-doc-id="${esc(doc.documentId)}" type="button">+ Tambah</button>` : ''}
      </div>
    </div>`;
}

/** Phase 12.8.4/12.8.6 — the read-only, dismissible Live Suggestion
 *  panel. Renders ONLY the cached st.liveSuggestions (see
 *  refreshLiveSuggestions()) — never computes inline, so this function
 *  stays a pure view over already-decided state, matching every other
 *  render* function in this file. Hidden entirely (returns '') when the
 *  flag is off, the viewer lacks review capability, or there is simply
 *  nothing to show — never a "0 saran" placeholder implying the system
 *  checked and found none, since for most documents today it did not
 *  check anything at all (Recognition/Body still have zero real
 *  producers wired outside this pilot — see workspace/README.md). */
/** Phase 12.8.x, Sprint 2 ("Invisible Intelligence") — collapsed by
 *  default. The brief's "no popup, no clutter, AI should appear only
 *  when valuable" is honored here as a single, quiet summary line the
 *  reviewer can expand — never an always-open list competing with the
 *  document for attention. This is a presentation change only: the
 *  underlying engine/contract/accept-reject pipeline (Phase 12.8.3/12.8.5)
 *  is completely unchanged, still computing the exact same suggestions. */
function renderSuggestionPanel(doc) {
  if (!WORKSPACE_LIVE_SUGGESTIONS_ENABLED || !canReview()) return '';
  if (st.selectedId !== doc.documentId) return '';
  if (st.liveSuggestionError) {
    return `<div class="rw-suggestion-panel rw-suggestion-panel--error">${esc(st.liveSuggestionError)}</div>`;
  }
  if (!st.liveSuggestions.length) return '';
  if (!st.liveSuggestionPanelExpanded) {
    return `
      <button class="rw-suggestion-pill" data-act="rw-suggestion-panel-toggle" type="button">
        💡 ${st.liveSuggestions.length} saran organisasi
      </button>`;
  }
  return `
    <div class="rw-suggestion-panel">
      <div class="rw-suggestion-panel-title">
        <span>Saran organisasi (${st.liveSuggestions.length})</span>
        <button class="rw-suggestion-collapse" data-act="rw-suggestion-panel-toggle" type="button" aria-label="Sembunyikan">✕</button>
      </div>
      ${st.liveSuggestions.map((s) => renderSuggestionRow(s)).join('')}
    </div>`;
}

function renderSuggestionRow(suggestion) {
  const label = SUGGESTION_TYPE_LABELS[suggestion.suggestionType] || suggestion.suggestionType;
  const whyOpen = st.liveSuggestionWhyOpenId === suggestion.suggestionId;
  const explanation = whyOpen ? workspaceExplainability.explainSuggestion(suggestion) : null;
  return `
    <div class="rw-suggestion-row">
      <div class="rw-suggestion-row-main">
        <span class="rw-suggestion-label">${esc(label)}</span>
        <span class="rw-suggestion-confidence">${Math.round(suggestion.confidence * 100)}%</span>
      </div>
      <div class="rw-suggestion-actions">
        <button class="wlk-btn wlk-btn--ghost" data-act="rw-suggestion-why" data-suggestion-id="${esc(suggestion.suggestionId)}" type="button">Kenapa?</button>
        <button class="wlk-btn wlk-btn--ghost" data-act="rw-suggestion-reject" data-suggestion-id="${esc(suggestion.suggestionId)}" type="button">Abaikan</button>
        <button class="wlk-btn" data-act="rw-suggestion-accept" data-suggestion-id="${esc(suggestion.suggestionId)}" type="button">Terima</button>
      </div>
      ${whyOpen && explanation && explanation.ok ? `
        <div class="rw-suggestion-why">
          <p>${esc(explanation.data.why)} — ${Math.round(explanation.data.confidence * 100)}% keyakinan.</p>
          <ul class="wlk-kv-list">
            ${explanation.data.evidence.map((ev) => `<li class="wlk-kv-row"><span class="wlk-kv-val">${esc(ev.rationale)}</span></li>`).join('')}
          </ul>
        </div>` : ''}
    </div>`;
}

/** Sprint 11.10 — an ACTUAL visual signature area in the Live Document
 *  preview, not a raw "Suggested Signatory Top Count: 3" number a reviewer
 *  had to mentally translate. Reuses composer-document.js's own
 *  signatureSuggestion (the real, evidence-based count nor-generator.js
 *  computed) — the SAME data the PDF/Word export now renders (Sprint
 *  11.10). Non-editable: there are no real names to click-to-edit here,
 *  only a count — this is a preview of what the printed signature block
 *  will look like, matching Fix 6's "almost-finished NOR" intent (blank
 *  lines, never a fabricated name). */
/** Phase 12.8.x — a real, editable signatory grid matching the official
 *  letterhead's own visual shape (doc-theme.js#signatureBlock: label
 *  line, position line, signing gap, name line — see composer-document.js
 *  for how the SAME structured `signatories` field renders in the PDF/
 *  Word export). Every slot starts fully blank (nor-composer.js never
 *  invents a label, role, or name); a reviewer fills in exactly what the
 *  printed letter will show. Falls back to the OLD blank-line-only
 *  rendering (renderLegacySignatureArea) for a document that predates
 *  the structured `signatories` field — zero change to how an
 *  already-composed document looks. */
function renderSignatoryGrid(doc, { topCount, bottomCount, top, bottom } = {}) {
  if (!topCount && !bottomCount) return '';
  if (top === null || bottom === null) return renderLegacySignatureArea({ topCount, bottomCount });

  const editable = canReview();
  const FIELD_PLACEHOLDER = { label: 'Menandatangani', position: 'Jabatan', name: 'Nama' };
  const slot = (rowKey, i, entry) => `
    <div class="rw-sig-slot rw-sig-slot--editable">
      ${['label', 'position', 'name'].map((f) => `
        <span class="rw-editable rw-sig-field rw-sig-field--${f}${!entry[f] ? ' rw-editable--empty' : ''}"
          data-sig-row="${rowKey}" data-sig-index="${i}" data-sig-field="${f}"
          data-doc-id="${esc(doc.documentId)}" data-original-value="${esc(entry[f] || '')}"
          data-placeholder="${esc(FIELD_PLACEHOLDER[f])}"
          contenteditable="${editable}" spellcheck="false">${esc(entry[f] || '')}</span>`).join('')}
    </div>`;
  const row = (rowKey, count, entries) => (count ? `<div class="rw-sig-row">${(entries || []).map((entry, i) => slot(rowKey, i, entry)).join('')}</div>` : '');
  return `<div class="rw-sig-area">${row('top', topCount, top)}${row('bottom', bottomCount, bottom)}</div>`;
}

/** Sprint 11.10's original blank-line-only rendering, preserved verbatim
 *  as the fallback for a document composed before Phase 12.8.x's
 *  structured `signatories` field existed. */
function renderLegacySignatureArea({ topCount, bottomCount } = {}) {
  if (!topCount && !bottomCount) return '';
  const row = (count) => (count ? `
    <div class="rw-sig-row">
      ${Array.from({ length: count }, () => '<div class="rw-sig-slot"><div class="rw-sig-line"></div><div class="rw-sig-hint">Tanda tangan</div></div>').join('')}
    </div>` : '');
  return `<div class="rw-sig-area">${row(topCount)}${row(bottomCount)}</div>`;
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

/** Phase 11 Course Correction, Workstream 7 — Normal Mode's ONE governance
 *  action, replacing renderGovernancePanel's multi-button surface for
 *  everyone except Developer Mode (which keeps the full panel, unchanged
 *  — see renderDocDetail()). The state machine underneath is identical;
 *  see handlePublishStart()/handlePublishConfirm()'s own headers for
 *  exactly which existing transitions this sequences and why neither
 *  bypasses RATIONALE_REQUIRED or a role capability check. */
function renderPublishAction(doc) {
  const errorLine = st.govError ? `<div class="rw-edit-error">${esc(st.govError)}</div>` : '';

  if (doc.status === COMPOSER_REVIEW_STATE.PUBLISHED) {
    if (st.showSatisfactionPrompt === doc.documentId) {
      const stars = [1, 2, 3, 4, 5].map((n) => `<button class="wlk-btn wlk-btn--ghost" data-act="rw-rate-satisfaction" data-id="${esc(doc.documentId)}" data-rating="${n}" type="button">${n}</button>`).join('');
      return `
        <div class="rw-publish-bar">
          <span class="rw-publish-status">Sudah diterbitkan — tercatat di Arsip Organisasi.</span>
        </div>
        <p class="wlk-page-lede">Seberapa puas Anda dengan proses tinjauan draf ini? (1 = tidak puas, 5 = sangat puas)</p>
        ${stars}`;
    }
    return `<div class="rw-publish-bar"><span class="rw-publish-status">Sudah diterbitkan — tercatat di Arsip Organisasi.</span></div>`;
  }
  if (doc.status === COMPOSER_REVIEW_STATE.REJECTED) {
    return `<div class="rw-publish-bar"><span class="rw-publish-status">Draf ini ditolak — tidak ada tindakan lebih lanjut.</span></div>`;
  }
  if (!canReview() && !canApprove()) {
    return `<div class="rw-publish-bar"><span class="rw-publish-status">Anda tidak memiliki izin untuk menerbitkan draf ini.</span></div>`;
  }

  if (st.publishConfirming === doc.documentId) {
    return `
      <div class="wlk-form-row">
        <label>Alasan / Rasional Persetujuan</label>
        <input data-act="rw-publish-rationale" class="wlk-input" type="text" value="${esc(st.publishRationale)}"
               placeholder="Mengapa Anda menyetujui draf ini untuk diterbitkan?"/>
      </div>
      ${errorLine}
      <div class="rw-publish-bar">
        <button class="wlk-btn" data-act="rw-publish-confirm" data-id="${esc(doc.documentId)}" type="button">Konfirmasi Terbitkan</button>
        <button class="wlk-btn wlk-btn--ghost" data-act="rw-publish-cancel" type="button">Batal</button>
      </div>`;
  }

  const label = doc.status === COMPOSER_REVIEW_STATE.NEEDS_REVISION ? 'Ajukan Ulang' : 'Terbitkan NOR';
  const statusHint = {
    [COMPOSER_REVIEW_STATE.DRAFT]: '',
    [COMPOSER_REVIEW_STATE.IN_REVIEW]: canApprove() ? '' : 'Sedang menunggu persetujuan.',
    [COMPOSER_REVIEW_STATE.NEEDS_REVISION]: 'Perlu direvisi sebelum diterbitkan.',
  }[doc.status] || '';

  return `
    ${statusHint ? `<p class="rw-publish-status">${esc(statusHint)}</p>` : ''}
    ${errorLine}
    <div class="rw-publish-bar">
      <button class="wlk-btn" data-act="rw-publish-start" data-id="${esc(doc.documentId)}" type="button">${esc(label)}</button>
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
      ${renderLiveDocument(doc)}
      ${renderSuggestionPanel(doc)}
      ${renderPublishAction(doc)}
      ${renderDetail([
        devMode ? renderDetailSection('Pratinjau Draf (Developer — field mentah)', renderDraftPreview(doc)) : '',
        devMode ? renderDetailSection('Tata Kelola (Developer — alur lengkap)', renderGovernancePanel(doc)) : '',
        renderDetailSection('Metadata', metadata),
        devMode ? renderDetailSection('Detail Internal (Developer)', renderSectionInternals(doc)) : '',
        devMode ? renderDetailSection('Riwayat Versi', renderVersionInfo(documentId)) : '',
        devMode ? renderDetailSection('Tata Letak Dokumen', renderLayoutProvenance(doc)) : '',
        // Riwayat Keputusan stays visible in Normal Mode, unlike Riwayat
        // Versi's diff table: composerReviewStateLabel()+approverId+
        // rationale is human-readable governance record (WHO decided WHAT
        // and WHY), not an implementation detail — "governance stays
        // intact" (Workstream 6/7's own framing), only raw ids/diffs hide.
        renderDetailSection('Riwayat Keputusan', renderReviewHistory(documentId)),
        ...(devMode ? renderExplainabilitySections(documentId) : []),
      ])}
    </div>`;
}
