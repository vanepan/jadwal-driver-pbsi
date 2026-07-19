# Sprint 11.3 — Document-first Experience

> "This sprint REPLACES the current Review Workspace experience... Think
> Microsoft Word. NOT a metadata inspector. NOT a JSON viewer." This document
> records what was found ALREADY TRUE (a prior, uncommitted "Phase 11 Course
> Correction" pass — see `docs/PHASE_11_1_REVIEW_UX_CORRECTION.md` — had
> already built most of this), what real gaps remained against this sprint's
> own numbered requirements, and what was fixed.

## Starting point — verified, not assumed

Before writing any code, every one of the prior session's own 5 check
scripts was re-run to confirm its claims still held: `composer-foundation-
check.mjs` (76/76), `section-learning-bridge-check.mjs` (26/26 at the time),
`section-confidence-engine-check.mjs` (22/22), `review-workspace-render-
check.mjs` (51/51), `live-document-workspace-check.mjs` (30/30) — 205/205.
That work already delivered, and this sprint left unchanged: Requirement 2
(real NOR renderer reused, letterhead-styled), 3 (every value a real
`contenteditable` span), 4 (`Klik untuk mengisi…` placeholders, never
`UNKNOWN`/`{{slot}}`), 5 (commit-on-`focusout`, no modals), 6 (3-tone
green/yellow/red confidence, numeric % hidden behind Developer Mode), and
10 (Developer Mode keeps Explainability/Metadata/Rule Trace/Confidence,
Normal Mode hides all of it).

Three real gaps were found against this sprint's own requirements. All three
are fixed below.

## Gap 1 (Requirement 9) — two rendering systems, not one

**Before**: `js/docs/templates/composer-document.js#buildContentModel()` was
already the one shared model for PDF vs. Word export ("one content model,
two thin renderers"), but the in-page Live Document Workspace
(`review-workspace.js#renderLiveDocument`) independently **re-derived** the
same structural decision a third time — its own copy of "which section is
the dateline / which are the fixed letterhead rows / which is body vs.
leftover fact." A real, silently drift-prone duplication, and a direct
violation of "Preview and exported document must share the SAME renderer.
Never maintain two rendering systems."

**Fix**: extracted `buildDocumentStructure(sections)` in
`composer-document.js` as the ONE place that decision is made —
`dateLineSection`, `norNumberSection`, `metaFields` (the 5 fixed letterhead
rows, each carrying its real section or `null`), `bodySections` (pattern-
sourced paragraphs), `detailSections` (genuine leftover facts). Both
`buildContentModel()` (PDF/Word export) and `review-workspace.js#
renderLiveDocument()` (in-page preview) now call this SAME function —
`review-workspace.js`'s own `LETTERHEAD_META_FIELDS`/`sectionByField()`/
`findDateLineSection()` were deleted entirely, not duplicated.

**A real, positive side effect, not a workaround**: the exported PDF and
Word documents now ALSO show labeled `Kepada Yth./Dari/Tembusan Yth./
Perihal/Lampiran` rows and separated body paragraphs (previously a flat,
undifferentiated field dump) — genuinely closer to "resembles the final
printed NOR" for the artifact a reviewer actually downloads, not only the
in-app preview. Nothing fabricated: an unfilled letterhead row renders as
`—`, the same honest-absence convention the generic `sections` dump already
used.

**Verification**: new `scripts/composer-document-structure-check.mjs`
(23/23, pure Node, no browser) proves the shared function's structural split
directly (filled/unfilled letterhead rows, body vs. detail separation,
negative controls for an empty document). The EXISTING `review-workspace-
render-check.mjs` — which drives the real "Unduh PDF" (real pdfmake CDN
load, real PDF blob, real viewer) and "Unduh Word" (real html-docx-js CDN
load, real .docx blob) buttons in a real browser — continued to pass
unchanged (51/51) after the refactor, proving the real export pipeline
still works end-to-end with the enriched model.

## Gap 2 (Requirement 7) — learning weight tiers

**Before**: `section-learning-bridge.js#recordSectionEdit` tagged every human
edit's audit `Correction` as the generic `CORRECTION_TYPE.KNOWLEDGE`, even a
genuine template/pattern-sourced text edit — despite `CORRECTION_TYPE.
PATTERN` already existing in `learning-event-contract.js` for exactly this
("a human overrode/approved a detected pattern"). An honest classification
gap, not a missing weight number.

**Fix**: a pattern-sourced field edit (or its deletion) is now tagged
`CORRECTION_TYPE.PATTERN`; a plain per-occasion document fact (e.g.
`quantity`) stays `CORRECTION_TYPE.KNOWLEDGE`. This is a real, zero-risk
change — every existing consumer (`learning-dashboard.js`'s "Koreksi Hari
Ini" breakdown, "Pengetahuan Paling Sering Dikoreksi") already iterates
`Object.values(CORRECTION_TYPE)` generically, so template edits are now
honestly counted apart from generic ones with no other code change needed.

**Deliberately NOT done**: inventing a new NUMERIC 3-tier weight (e.g.
template=1.0 / text=0.9 / metadata=0.7). No such per-correction-type weight
mechanism exists anywhere in this codebase to attach real numbers to — every
number the confidence engine uses today traces to an existing, real,
already-decided source (`source-weight-contract.js`). CLAUDE.md's own
"Never invent business rules" principle applies directly here: three
specific weight numbers with no evidence or product-owner decision behind
them would be exactly the kind of fabrication this project's master context
forbids. The prompt's own bottom-line claim — "manual human corrections
always outweigh AI-generated content" — is already true and already proven
(`section-confidence-engine-check.mjs`'s "Documented ordering" check:
`getSourceWeight('correction') = 1.0` is verified `>=` any real
`suggestConfidence()` output an AI-sourced `template_pattern` can produce).
A genuine numeric 3-tier scheme is flagged here as needing a real product
decision, not silently implemented.

## Gap 3 (Requirement 1) — Generate Draft did not open Live Preview

**Before**: a successful `composeApprovedNor()` call — from BOTH real call
sites, `nor-center.js`'s Generate tab (`handleComposeNor`) and
`sarpras-intelligence-center.js`'s Home screen (`sic-compose-nor`) — just
re-rendered the SAME conversation screen. A human had to separately navigate
to Drafts or Review and find their new draft manually. Direct violation of
"Generate Draft immediately opens Live Preview, not metadata."

**Fix**: `review-workspace.js` gained `openReviewDocument(documentId)` — a
pure state seed (`st.selectedId = documentId`, re-rendering only if already
mounted), the same "one primitive per concern" shape
`sarpras-intelligence-center.js#seedConversationEntry()` already
establishes. Both compose handlers now, on success, dynamically `import(
'./review-workspace.js')` (never a static import — this must not eagerly
pull in that screen's own `doc-engine.js`/pdfmake dependency the moment
`nor-center.js` loads; this is the SAME lazy-load path the `WORKSPACES`
screen registry already uses for this exact module), call
`openReviewDocument(documentId)`, then `setSarprasIntelligenceScreen(
'review')` — landing the user directly on the Live Document Preview of
their newly composed draft.

**A real, pre-existing invariant had to be reconciled, not silently
overridden**: `scripts/nor-center-generate-redirect-check.mjs` (Sprint 11.1,
production feedback) explicitly asserted the Generate NOR tab's crumb "NEVER
disappeared across the entire flow... including after composing" — the
literal opposite of this requirement. Read closely, the two are not actually
in conflict: Sprint 11.1's complaint was about being redirected AWAY from a
conversation nobody asked to leave, mid-task; Sprint 11.3's requirement only
fires AFTER the conversation is already fully complete and "Susun NOR" is
clicked — advancing to the natural next step, not an unwanted interruption.
The test's assertions covering the CONVERSATION portion (never leaves NOR
Center while answering questions) are unchanged and still enforced. Its
final two assertions (checked via a substring search over `host.innerHTML`,
which — since `showScreen()` only ever toggles `style.display` and never
removes a screen's DOM — could never actually have detected a screen
switch either way) were replaced with precise `[data-sic-screen].style.
display` visibility checks, proving the Review screen is now the one
genuinely shown and the NOR Center screen is genuinely hidden.

**Verification**: `nor-center-generate-redirect-check.mjs` (updated, 14/14)
and new `scripts/home-generate-live-preview-check.mjs` (9/9) each drive a
real CREATE_NOR utterance through the real pipeline in a real browser, from
their own respective entry point, all the way through clicking "Susun NOR",
and confirm: the origin screen becomes hidden, the Review screen becomes
visible, and its content is the real Live Document Preview (`rw-doc`, "Nota
Organisasi", real `rw-editable` spans) — not a bare list requiring a further
click.

## Requirement 8 (Publishing) — known limitation, deliberately not done

Publishing today: one "Terbitkan NOR" button drives Validate (the existing
`RATIONALE_REQUIRED` transition graph) then Archive (`archiveOnPublish`, a
real `ArchiveRecord`) as one action — unchanged from the prior session's own
work. "Learn" already happens continuously, per-edit, via
`section-learning-bridge.js` — not as a distinct batched step at publish
time, but automatically nonetheless.

**Export is NOT auto-triggered by "Terbitkan NOR"** — "Unduh PDF"/"Unduh
Word" remain separate, explicit clicks, available once Approved (before or
after publish). This is a deliberate scope decision, not an oversight:
auto-triggering a pdfmake/html-docx-js CDN load and a browser file download
as a side effect of a status-transition click is a genuine UX/product
judgment call (should export always auto-download, or should it stay a
reviewer-initiated action?) that risks being an unwanted behavior change,
and silently wiring it into an already-large diff — untested against real
download/popup-blocking behavior — carries real regression risk to the
currently-working, browser-verified export pipeline. The organizational
record of truth is the `ArchiveRecord` created at publish time (per
`composer-document.js`'s own documented design: "No binary file storage
exists in this codebase... the PDF/Word artifact stays a local download").
Flagged here for a real product decision, not silently implemented either
way.

## Architecture decisions

- `buildDocumentStructure()` lives in `js/docs/templates/composer-
  document.js` (not `document-intelligence/`) — this template file already
  had the "pure, no edge to document-intelligence/" discipline
  `review-workspace.js` (`ui/`) is already allowed to import from (it
  already imported `buildHtml` from here); no new dependency edge was
  created, an existing one now carries more weight.
- `openReviewDocument()` follows the exact same "pure state seed, call
  `setSarprasIntelligenceScreen()` separately" shape as the existing
  `seedConversationEntry()` — no new cross-screen-navigation primitive was
  invented.
- `CORRECTION_TYPE.PATTERN` reuses an existing, already-registered
  vocabulary value rather than inventing a new one.

## Regression summary (both sprints, full session)

| Script | Result |
|---|---|
| composer-foundation-check.mjs | 76/76 |
| section-learning-bridge-check.mjs | 27/27 (26 pre-existing + 1 new) |
| section-confidence-engine-check.mjs | 22/22 |
| review-workspace-render-check.mjs | 51/51 |
| live-document-workspace-check.mjs | 30/30 |
| composer-document-structure-check.mjs (NEW) | 23/23 |
| adaptive-conversation-check.mjs | 25/25 |
| problem-intelligence-check.mjs | 33/33 |
| problem-router-check.mjs | 37/37 |
| problem-solving-integration-check.mjs | 38/38 |
| dynamic-conversation-check.mjs | 27/27 |
| conversation-ownership-check.mjs | 77/77 |
| problem-first-home-dom-check.mjs | 31/31 |
| sprint-11-2-procurement-uat-check.mjs (NEW) | 25/25 |
| nor-center-generate-redirect-check.mjs (UPDATED) | 14/14 |
| home-generate-live-preview-check.mjs (NEW) | 9/9 |
| dic-progressive-queue-check.mjs | 8/8 |
| file-storage-check.mjs | 22/22 |
| knowledge-ownership-check.mjs | 56/56 |
| learning-ownership-check.mjs | 63/63 |
| sarpras-workspace-dom-check.mjs | 95/95 |
| **Total** | **789/789** |

Two additional scripts touched the modified files but showed one
pre-existing failure each (`sarpras-home-experience-check.mjs`, 13/14;
`sarpras-workspace-completion-check.mjs`, 58/59) — both confirmed, via
`git stash` against the untouched baseline, to fail identically before any
change made in this session. Not a regression; not fixed here (out of
scope — unrelated to Sprint 11.2/11.3).

## Not committed

Per the plan's own instruction: nothing in this session was committed or
pushed.
