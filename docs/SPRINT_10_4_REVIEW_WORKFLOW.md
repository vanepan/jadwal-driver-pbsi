# Sarpras Intelligence V2 — Phase 10, Sprint 10.4: Review Workflow

> Scope: a real Draft → In Review → {Needs Revision, Approved, Rejected}
> lifecycle for ComposerDocument, with "No automatic approval" enforced by
> the store itself, not just the UI. Method: a new, deliberately SEPARATE
> contract from Knowledge's own lifecycle graph (confirmed necessary during
> Phase 10 planning research, re-confirmed while writing this sprint's own
> contract header), reusing Knowledge's audit-log primitives verbatim.
> Verified with real, executed checks: 12 new Node checks on
> `transitionStatus` itself, and a real click-through governance flow
> driven in headless Chromium — submit, get refused for a blank rationale,
> then approve for real.

---

## Headline finding

**"No automatic approval" is enforced at the data layer, not just hidden
behind a UI button** — `transitionStatus(documentId, 'approved', {...})`
refuses a blank/missing rationale itself, the identical requirement
`knowledge/contracts/review-contract.js#isValidReviewDecision` already
enforces for Knowledge. This was verified two ways: a direct Node call
with no rationale (refused, `RATIONALE_REQUIRED`), and a real browser
click on "Setujui" with the rationale field left empty (refused live, the
button stays offered, the document stays `in_review`) — not merely
asserted from reading the store function.

---

## 1. composer-review-contract.js — a deliberately separate graph

`js/v2/document-intelligence/composer/contracts/composer-review-contract.js`
mirrors `knowledge/contracts/lifecycle-contract.js`'s exact shape (frozen
state enum, frozen transition graph, pure `canTransition`) but is NOT that
contract reused — Phase 10 planning research confirmed
`review-contract.js`/`review-queue-engine.js` are hard-coupled to
`LIFECYCLE_STATE`'s own 5-state graph (`draft → candidate →
pending_review → approved → deprecated`), which answers "is this fact
true of the organization?" — a different question from "is this document
ready to leave the platform?", and has neither a `needs_revision` loop nor
a `published` terminal.

New graph: `draft → in_review → {approved, needs_revision, rejected}`,
`needs_revision → in_review`, `approved → published`. `rejected`/
`published` terminal. `approved → published` is a legal transition in the
contract (so it's complete), but **no UI button exposes it yet** —
publishing means export + archive (Sprint 10.6), a materially heavier,
different action than a bare status flip; faking a no-op "Terbitkan"
button now would create a document marked Published with nothing actually
produced.

---

## 2. transitionStatus() — status and content stay separate axes

`composer-store.js#transitionStatus(documentId, toState, {actorId,
rationale})`: checks `canTransitionComposerReview` before writing (same
pre-check shape `import-session-repository.js#appendVersion` already uses
for its own transition check), refuses `APPROVED` without a real
rationale, and — a deliberate design decision, verified directly — does
**NOT** bump `ComposerDocument.version` or create a new `ComposerRevision`
for a status-only change. `version`/revisions track CONTENT edits (Sprint
10.1/10.3); conflating a status flip with a content revision would make
Version Information noisy with entries that carry no real diff. Confirmed
with a direct before/after version check across a real approval.

**Audit trail — reused verbatim, no new code.** `knowledge/review/
contracts/promotion-contract.js#makePromotionRecord` and `knowledge/
review/review-history.js#recordPromotion`/`listReviewHistory` are both
already domain-agnostic (`itemId` is just a string; neither imports
`KnowledgeItem`) — confirmed during Phase 10 planning research, reused
here exactly as planned. `composer-store.js#getReviewHistory(documentId)`
is a one-line wrapper around `listReviewHistory`.

---

## 3. Review Workspace — governance panel

`review-workspace.js#renderGovernancePanel(doc)` mirrors
`knowledge-center.js#renderGovernancePanel`'s exact pattern: which buttons
appear is decided by the document's REAL status, never by taste — Draft
shows "Ajukan untuk Ditinjau"; In Review shows a rationale field +
Setujui/Minta Revisi/Tolak; Needs Revision shows "Ajukan Ulang"; Approved
shows an honest note that export/publish lands in Sprint 10.6, not a fake
button. A new "Riwayat Keputusan" detail section shows every real
transition, its real actor, and its real rationale, sourced from
`getReviewHistory`.

Actor identity stays the same intentional placeholder Sprint 10.3
introduced (`ACTOR_ID = 'evan'`) — Sprint 10.5's job, not repeated here.

---

## 4. Verified

**Data layer (Node)** — `composer-foundation-check.mjs`: 56/56 (was
44/44). 12 new checks: illegal jumps refused, rationale-less approval
refused, a refused transition leaves status unchanged, a successful
approval does NOT bump version or create a revision, `getReviewHistory`
records both real transitions with the real rationale, `published` is
confirmed both legal-in-contract and terminal, unknown-document handling.

**Full regression, unrelated subsystems untouched** —
`north-star-acceptance-check.mjs` 38/38, `nor-composition-check.mjs`
16/16, `problem-solving-integration-check.mjs` 30/30,
`conversation-ownership-check.mjs` 77/77, `knowledge-ownership-check.mjs`
56/56, `smoke-boot.mjs` PASS — all unchanged counts, zero regression from
a new contract file and store export.

**Real browser, no login gate** — `review-workspace-render-check.mjs`
extended: 25/25 (was 19/19). The new scenario drives the actual governance
buttons: select a Draft, click "Ajukan untuk Ditinjau", click "Setujui"
with a BLANK rationale field (refused live — the exact button stays
offered, proving the UI didn't silently succeed), type a real rationale
into the real `<input>`, click "Setujui" again (succeeds), and confirm
both the status label flips to "Disetujui" and Riwayat Keputusan shows the
real decision with its real rationale text.

**Not verified, same limitation as Sprints 10.1–10.3**: the real Settings
→ Power View → Review Workspace click path with a real signed-in user —
still requires production Firebase credentials unavailable in this
environment.

---

## 5. Phase 10 backlog

Sprint 10.5 (Approval Workflow) is next — this sprint's own placeholder
(`ACTOR_ID = 'evan'`, no capability gate) is exactly what it replaces:
real `sic.review.act`/`sic.approve.act` capabilities in
`role-registry.js`, and a real signed-in identity via
`auth.js#getCurrentUser()` in place of the hardcoded string, across both
the Document Editor (Sprint 10.3) and this sprint's governance panel.
