# Phase 11 Course Correction — Human-Centered Review Experience

> Companion to `docs/PHASE_11_EXECUTIVE_INTELLIGENCE.md` (the original
> Phase 11 vision doc — this work directly implements that doc's Sprint
> 11.3 "Human Learning Loop": *"Every reviewer edit becomes a Candidate
> Knowledge proposal. Never auto-promote."*). Not a bugfix sprint — a
> product-direction reversal of Phase 10's Review Workspace, requested and
> approved before any code was written. Every claim below is backed by a
> real, run check script (file names given throughout) — nothing here is
> asserted from reading the code alone.

## Why

Phase 10's Review Workspace (`js/v2/ui/review-workspace.js`) was
technically complete but shaped like a **Knowledge Inspector**: raw
field/value lists, `ComposerDocument`/`KnowledgeItem` ids, numeric
confidence, diff tables — all visible in Normal Mode by default. The
product direction: this had to become an **AI-assisted Document Editor**
— the rendered NOR document itself is the interface, every edit is
direct/inline (no dialogs), every human edit becomes structured learning
automatically, confidence is shown visually (never numerically), and
every implementation detail above moves behind Developer Mode.

## What changed

### Workstream 1/2 — Live Document Workspace, inline editing

`renderLiveDocument(doc)` (`js/v2/ui/review-workspace.js`) is now Normal
Mode's default view: a letterhead-styled render (title, dateline/number
line, `Kepada Yth./Dari/Tembusan Yth./Perihal/Lampiran` meta rows, body
paragraphs, a "Rincian" appendix for plain facts) built from the SAME
`doc.sections` the old Draft Preview read — no new data source, no
fabricated content. Every value renders as a real `contenteditable` span
(`.rw-editable`); a reviewer clicks in and types, exactly like Word — no
"Ubah → dialog → Simpan" round-trip.

The commit path is a single delegated `focusout` listener
(`onFocusOut()`) — bubbles, unlike `blur`, so one listener on the host
covers every editable span. An edit to an existing field calls
`composer-store.js#editSection()` (unchanged); typing into a
not-yet-existing letterhead row calls the new
`composer-store.js#addSection(documentId, field, value, addedBy)`, which
mints a real `EditableSection` (`isOverridden: true`, a real `Diff` via
the existing `computeDiff`, a new `ComposerRevision`) — the field starts
genuinely blank, so nothing is fabricated by offering the row.

### Workstream 3 — Human edits become structured learning, automatically

New module `js/v2/document-intelligence/composer/section-learning-bridge.js`
(`recordSectionEdit`), called from `onFocusOut()` immediately after a
successful `editSection`/`addSection`. Two signals, per the approved
design:

1. **Always** — `learning/services/learning-service.js#recordCorrection()`
   records the raw fact change (`before`/`after`, `targetKey:
   "<documentId>:<field>"`) as the universal audit trail, even for a
   plain fact with no single `KnowledgeItem` behind it (the user's own
   example: "20 kursi → 24 kursi" recorded as a quantity fact change).
2. **Only for a genuine text edit to a pattern-sourced section**
   (`field.startsWith('pattern:')`, never a deletion) — additionally
   calls `knowledge/learning/diff-learning-engine.js#submitDraftEditAsCorrection()`,
   reviving that function's first real caller (it had zero callers
   anywhere in the codebase before this phase). A **deletion** of a
   pattern-sourced section only records the audit entry — per the
   approved design, "this document doesn't need this sentence" is not
   the same claim as "the shared pattern's wording is wrong for
   everyone."

**A real bug was found and fixed while building the verification script**
for this bridge (`scripts/section-learning-bridge-check.mjs`): the first
draft diffed/corrected under the `ComposerDocument`'s own field id
(`pattern:<knowledgeId>`) instead of the cited `KnowledgeItem`'s real
payload key (`template`, see
`knowledge/language/contracts/pattern-contract.js#isPatternEntry`). Had
this ever been approved, `correction-pipeline-engine.js#submitCorrection`'s
in-place-update path would have replaced the item's ENTIRE payload with
`{ "pattern:<id>": "<text>" }`, silently destroying its `slots`/
`granularity` structure. Fixed: the Correction's `before` is the item's
real current payload; `after` preserves every other key and only
replaces `template`. `submitCorrection`'s own safety property (never
mutates an Approved item in place — always mints a linked Candidate
instead) means the live, Approved pattern is never at risk regardless —
a human must explicitly approve the proposed Candidate via the existing
review queue before it can ever affect a future composition. See that
script's "REGRESSION GUARD" checks.

### Workstream 4/5 — Confidence weighting and highlighting

New pure module `js/v2/document-intelligence/composer/section-confidence-engine.js`
(`computeSectionConfidence`, render-time only — never persisted, since a
cited pattern's own confidence can change as it gains corroboration).
**No number is invented** — every tier reuses an existing, already-real
engine:

| Tier | Source | Real mechanism reused |
|---|---|---|
| 1. Official Approved Template | `pattern:<id>` citing a `kind:'template_pattern'` item | `knowledge/machine-learning/confidence-engine.js#suggestConfidence()` on that item |
| 2. Real Approved pattern / NOR Archive number | `pattern:<id>` citing any other Approved pattern, or `norNumber` with a real attached numbering confidence | same `suggestConfidence()`, or `organizational-memory/numbering-engine.js#suggestNextNumber()`'s own confidence (see below) |
| 3. Human Review correction / human answer | `isOverridden: true`, or a plain Conversation-answered field | `knowledge/contracts/source-weight-contract.js#getSourceWeight('correction')` = **1.0** — the platform's pre-existing highest-trust weight, not a new number |
| 4. AI-generated structural draft | signatory-count/typical-count suggestions, or `norNumber` with no attached confidence | `getSourceWeight('extraction')` = **0.7** |
| Unresolved | `UNKNOWN` marker still present, or an empty non-pattern value | confidence 0 — already knowable without computation |

Tier 3's weight (1.0) is deliberately at or above tier 1/2's typical
`suggestConfidence()` output (`sourceWeight×0.6 + corroboration×0.4`,
which cannot exceed 1.0 either) — this is the concrete mechanism behind
"human corrections carry higher authority," using a weighting decision
(`correction: 1.0`) that already existed in this codebase before this
phase, not a new invention.

`confidenceHighlightTone()` collapses `unified-scoring.js`'s existing
4-tone system (`ok/info/warn/danger`) to the requested 3-state
Grammarly-style palette: `ok`+`info` → **green**, `warn` → **yellow**,
`danger` (incl. unresolved) → **red** — rendered as a left-border/underline
color using the existing `var(--ok)/--warn/--danger)` tokens
(`workspace-list-kit.css`'s new `.rw-conf-*` classes). Normal Mode shows
color only; Developer Mode also shows the real percentage + rationale
on hover (`.rw-conf-detail`).

`problem-solving-service.js#composeApprovedNor` now threads its
already-computed `numberingSuggestion.confidence`/`.basis` into the
document's explainability bag (`attachExplainability`), so tier 2's
`norNumber` case has real data to read instead of always falling back to
the tier-4 default.

### Workstream 6 — Hide implementation details in Normal Mode

`renderDocDetail()` now gates behind `isDeveloperMode()`: the old
field-list Draft Preview (`renderDraftPreview`), the full multi-button
governance panel (`renderGovernancePanel`), raw `documentId`/`version`,
the `EditableSection` internals panel, and the Version History diff
table. **Nothing was deleted** — Developer Mode still renders every one
of these, unchanged, per deliverable 7 ("Keep Developer Mode fully
functional"). "Riwayat Keputusan" (decision history) stays visible in
Normal Mode deliberately: it is human-readable governance record (who
decided what, and why), not an implementation detail — "the engine
becomes invisible, the governance remains intact."

### Workstream 7 — Review becomes Publish

New `renderPublishAction(doc)` — Normal Mode's single **"Terbitkan NOR"**
button, replacing the multi-button governance panel there (Developer
Mode keeps the original panel, byte-for-byte unchanged). The governance
state machine underneath is **not modified in any way** —
`composer-review-contract.js`'s transition graph, `transitionStatus()`'s
own `RATIONALE_REQUIRED` enforcement, and `review-history.js`'s audit
trail are all reused exactly as Phase 10 built them:

- A user with **approve authority** sees one rationale confirmation,
  then the SAME `draft → in_review → approved → published` sequence the
  old panel called one click at a time, stopping and surfacing any real
  error at each step.
- A user with **review-only authority** has no approval step to confirm
  — the button immediately submits `draft/needs_revision → in_review`
  and stops; it never attempts a transition the role cannot legally
  make.
- `needs_revision` relabels the button "Ajukan Ulang"; `published`/
  `rejected` render as terminal states (the Sprint 10.7 satisfaction
  prompt is unchanged).

## Verification

Every check below was actually run in this session (not merely written):

| Script | Scope | Result |
|---|---|---|
| `scripts/composer-foundation-check.mjs` | extended with `addSection()` cases | 76/76 |
| `scripts/section-learning-bridge-check.mjs` | new — both learning signals, the deletion/edit distinction, the payload-shape regression guard | 26/26 |
| `scripts/section-confidence-engine-check.mjs` | new — every tier, the documented ordering, render-time purity | 22/22 |
| `scripts/review-workspace-render-check.mjs` | patched — old Sprint 10.x surfaces now proven Developer-Mode-only; Normal Mode proven to show the new Live Document + Terbitkan NOR | 51/51 |
| `scripts/live-document-workspace-check.mjs` | new — real contenteditable `focusout` edit → Correction/LearningEvent → confidence color change; "Terbitkan NOR" across reviewer-only and approver roles; `needs_revision` relabeling | 30/30 |

The `live-document-workspace-check.mjs` inline-edit scenario is the
single strongest proof in this phase: it drives a real
`contenteditable` span from red (a real, low `suggestConfidence()`
output) to green (`isOverridden` → the human-trust ceiling) through an
actual DOM `focusout` event, and confirms — through the real UI, not a
direct function call — that the edited pattern mints a linked Candidate
that preserves the original pattern's `slots`, while the Approved
pattern itself is never mutated.

## What did not change

- The Knowledge lifecycle (`DRAFT → CANDIDATE → PENDING_REVIEW →
  APPROVED → DEPRECATED`) and `submitCorrection`'s never-mutate-Approved
  safety property.
- The `ComposerDocument` review lifecycle and its `RATIONALE_REQUIRED`
  gate.
- The `EditableSection` contract shape (`knowledgeReferences` stays
  populated only at render time via `explainConfidenceAsEvidence`, never
  persisted).
- Export (`js/docs/templates/composer-document.js`) received a light
  letterhead touch-up only (centered "NOTA ORGANISASI" title, a
  date/number line pulled to the top) — no new fabricated content; the
  existing "never invent recipients/cc/balance data" constraint is
  unchanged.

## Deliberately not done in this phase

Per the approved plan's own deliverable 10: **not committed.**
