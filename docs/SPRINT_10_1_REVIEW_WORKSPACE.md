# Sarpras Intelligence V2 — Phase 10, Sprint 10.1: Review Workspace

> Scope: Sprint 9.8's own #1 Phase 10 backlog item — "Build a real human-
> review surface for a ComposerDocument." Method: direct code reading and
> extension (`composer-store.js`, `sarpras-intelligence-center.js`,
> `nor-center.js`, `workspace-list-kit.js`), a new persistence layer
> (`composer-document-repository.js`), a new workspace
> (`review-workspace.js`), plus real, executed verification: the existing
> `composer-foundation-check.mjs` extended in place (not duplicated), the
> full existing regression suite re-run, and a new real-browser render
> check (`review-workspace-render-check.mjs`) proving the actual DOM a
> reviewer sees, not a mock of it.

---

## Headline finding

**The gap Sprint 9.8 named was literal and specific — "ComposerDocument
{id} (19 sections)", a bare count, never the content — and this sprint
replaces every instance of it with the real field/value content.** Two
call sites carried this exact defect: `sarpras-intelligence-center.js`'s
Developer Pipeline Viewer, and (in a different but equally incomplete
form — a revision *diff*, never the document's *current* content)
`nor-center.js`'s Drafts tab. Both now point to, or directly render, real
section content. A third, deeper gap was found during implementation, not
assumed from the spec: `composer-store.js` was **in-memory only** — a
Review Workspace built directly on it would have lost every draft on
reload, unworkable for a real multi-day pilot review process. This sprint
closes that too, not just the rendering gap.

---

## 1. Persistence — composer-document-repository.js

New file, mirroring `knowledge/datasets/import-session/repository/
import-session-repository.js`'s exact proven shape: a `Map` cache backed
by Firebase RTDB (`v2_sarpras/composer_documents`), lazy-imported only
inside `initComposerDocumentSync()` so no Node check script ever touches
Firebase, debounced remote-snapshot rehydration, and RTDB-null/empty-array
normalization at the one boundary a remote record enters the cache.

`composer-store.js`'s two module-level Maps (`_documents`/`_revisions`)
are retired in favor of this repository's single `{document, revisions}`
record per id. Every existing export (`createDocument`, `getDocument`,
`editSection`, `getRevisionHistory`, `getComposerTimeline`) keeps its
**exact** prior signature and return shape — verified by re-running the
pre-existing `composer-foundation-check.mjs` unchanged before touching
anything else (25/25 passed against the untouched file, confirming a
baseline; 32/32 after the refactor and new checks were added, confirming
zero regression). `nor-composer.js` and `problem-solving-service.js`
needed zero changes.

One deliberate deviation from the mirrored precedent, documented inline:
`import-session-repository.js`'s local writes do NOT fire change
listeners (its one writer already re-renders itself). This repository's
writer (Home dashboard composing a NOR) and its reader (the persistently-
mounted Review Workspace screen) are different controllers, so local
writes DO notify — otherwise a document composed on Home would never
appear in an already-open Review Workspace tab.

`initComposerDocumentSync()` is registered in `sarpras-intelligence-
center.js`'s mount, in the same block as `initImportSessionSync`/
`initImportBatchSync`/`initFileStorageSync`.

`composer-document-contract.js` gains a `status` field, defaulted to
`'draft'` (`COMPOSER_DOCUMENT_STATUS_DRAFT`) — added now, inert, so
Sprint 10.4's real transition graph is additive rather than a breaking
shape change mid-phase.

---

## 2. Review Workspace — js/v2/ui/review-workspace.js

New sibling workspace, registered as `sarpras-intelligence-center.js`'s
6th screen (`SCREEN_IDS`/`WORKSPACES`), reachable via Settings' Power View
(`Buka Review Workspace`) — same deliberately-quiet entry point Knowledge
Center already uses, not a 6th primary nav button (the nav panel's own
header comment states "5 items, user mental models not engineering
domains" as an explicit prior design decision; not reversed here).

Deliberately **no tab bar** — the spec asks for "a single clean review
screen... minimal visual noise," and this workspace has exactly one job
(list a document, show its detail), so every other workspace's
multi-section `renderTabShell()` would be noise with no destination behind
it. Deliberately **no status/domain filter** — every document today is
`domainType:'nor'`, `status:'draft'`; filtering a single-valued dimension
is speculative UI for a Sprint 10.4 problem that doesn't exist yet.

Renders, reusing `workspace-list-kit.js` primitives exclusively (no new
list/detail markup invented):

- **Draft Preview** — every section's real `field → value`, the literal
  fix for the named gap.
- **Metadata** — document id (Developer only), domain, version, status,
  created/updated timestamps.
- **Status** — the friendly label (`Draf`), never the raw enum, in Normal
  Mode.
- **Version Information** — reuses `renderDiffTable()`, the same diff
  renderer `nor-center.js`'s own Drafts tab already established; not
  re-implemented.
- **Detail Internal** (Developer Mode only) — per-section override flag
  and citation count; hidden from Normal Mode by construction, per the
  spec's "do not expose internal implementation details by default."

`nor-center.js`'s Drafts tab gains a "Tinjau di Review Workspace" button
(cross-screen jump via `setSarprasIntelligenceScreen('review')`, the same
primitive `sarpras-settings.js`'s Power View links already use) rather
than duplicating full section-content rendering a second time in a second
file.

---

## 3. Verified

**Data layer (Node, no browser)** — `composer-foundation-check.mjs`,
extended in place: 32/32 (was 25/25 before this sprint; 7 new checks for
`status` default, `listAllDocuments()` cross-domain ordering, and the
repository's cache round-trip, including a JSON-stringify round-trip
simulating RTDB's own null/empty-array stripping).

**Full regression, unrelated subsystems untouched** —
`north-star-acceptance-check.mjs` 34/34, `problem-solving-integration-
check.mjs` 30/30, `nor-composition-check.mjs` 17/17. All green, unchanged
counts where no new behavior was added.

**Real browser, no login gate** — `smoke-boot.mjs` (unrelated app.js
edits didn't break the real bootstrap): PASS, `app-ready` reached, zero
fatal errors. A direct real-Chromium import of every touched UI module
(`sarpras-intelligence-center.js`, `nor-center.js`, `review-workspace.js`,
`sarpras-settings.js`, `knowledge-center.js`) — including the two
circular-looking cross-imports (`nor-center.js` ↔ `sarpras-intelligence-
center.js`, `sarpras-settings.js` ↔ `sarpras-intelligence-center.js`) —
loaded with zero syntax/import errors.

**New: `review-workspace-render-check.mjs`** — real headless Chromium,
real DOM, no Firebase, no login gate (Review Workspace behind
`js/app.js`'s real login gate could not be driven end-to-end in this
environment — no production credentials exist here, a known, previously-
documented limitation). Bypasses `app.js`'s bootstrap entirely and
`import()`s `composer-store.js` + `review-workspace.js` directly, creates
a real test document, edits one section, mounts, clicks the row, and
asserts on real rendered text: 11/11, including "Draft Preview shows the
REAL, human-edited subject value" (the literal Sprint 9.8 gap, proven live
rather than assumed from the code) and "Normal Mode hides the raw
documentId" (the spec's own "no internal details by default"
requirement, proven against `innerText`, not just markup).

**Not verified, and said so rather than assumed**: the live RTDB sync path
(`initComposerDocumentSync`) itself, and the actual Settings → Power View
click path a real signed-in user would take — both require production
Firebase credentials this environment does not have. Recommended: verify
these two specifically once a credentialed session is available, before
treating the persistence layer as pilot-proven end to end.

---

## 4. Phase 10 backlog (unstarted, per the approved plan)

Sprint 10.2 (Explainability Workspace) is next. Its own precondition was
found during this sprint, not assumed: `reasoningConsidered` is currently
attached only to `composeApprovedNor()`'s one-shot return value (visible
in `sarpras-intelligence-center.js`'s `homeState.lastPipelineTrace`,
overwritten by the next composition) — Sprint 10.2 must first persist it
alongside the document (extending `createDocument()`'s already-repository-
backed storage from this sprint) before Explainability can show reasoning
for any document under review, not only the most recently composed one.
