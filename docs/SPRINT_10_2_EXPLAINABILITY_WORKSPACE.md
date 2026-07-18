# Sarpras Intelligence V2 — Phase 10, Sprint 10.2: Explainability Workspace

> Scope: expose Retrieved Knowledge, Applied Rules, Confidence, Missing
> Evidence, Unknown Facts, and Conversation History for reviewers in
> Developer/Reviewer Mode only. Method: direct code reading against
> `js/v2/README.md`'s binding dependency graph BEFORE writing any code (two
> real corrections to the original plan came from this, both described
> below), then real, executed verification: extended
> `composer-foundation-check.mjs`, a new real end-to-end assertion block in
> `north-star-acceptance-check.mjs` against the live pipeline, and an
> extended `review-workspace-render-check.mjs` proving actual rendered DOM.

---

## Headline finding

**The data this sprint needed to show already existed, but was thrown away
after one render — and the two-file plan drafted before this sprint began
was itself architecturally wrong twice, both caught by reading
`js/v2/README.md`'s dependency graph before writing code, not after.**
`reasoningConsidered` (Sprint 9.5's live Reasoning call) lived only in
`sarpras-intelligence-center.js`'s own `homeState.lastPipelineTrace` —
overwritten by the next composition, unreadable for any document except
the very last one composed in a session. And the original plan's "extend
`createDocument()` to accept a `reasoningTrace` argument" does not fit the
real call sequence: `createDocument()` runs inside `nor-composer.js`,
strictly BEFORE `problem-solving-service.js#composeApprovedNor` computes
Reasoning one layer above it — the data literally does not exist yet at
that call site. The original plan's second file,
`js/v2/knowledge/services/nor-explainability-service.js`, would have
violated `js/v2/README.md`'s own binding rule ("knowledge/ must be fully
buildable... with zero AI providers... forever" — operationalized as
"knowledge/ never depends on document-intelligence/", enforced by
`composer-foundation-check.mjs`'s own Dormancy check) the moment it tried
to import `composer-store.js`.

---

## 1. Persistence — attachExplainability(), not a createDocument() argument

`composer-document-repository.js`'s per-document record gains a third,
optional field: `explainability`. `putRecord()`'s 4th argument
(`explainability`) is `undefined` on every ordinary create/edit call —
which now PRESERVES whatever was already attached rather than erasing it,
verified directly (`a subsequent editSection() (putRecord without
explainability) PRESERVES the previously attached bundle`).

`composer-store.js` gains `attachExplainability(documentId, data)` /
`getExplainability(documentId)`. `problem-solving-service.js#
composeApprovedNor` — the ONE layer that has both the composed document
AND the computed Reasoning Recommendation — calls
`attachExplainability()` right after building its own return value, with
the SAME bundle it already returns (`unresolvedFields`,
`citedKnowledgeIds`, `explanation`, `renderingRulesConsidered`,
`reasoningConsidered`) plus `conversationId` (a value that function
already receives as its own parameter, previously discarded). Best-effort,
non-fatal — a storage failure here can never fail a composition that
already succeeded, the same "additive instrumentation, never a gate"
posture Sprint 9.5's own Reasoning call already established.

`problem-solving-service.js`'s header DEPENDENCIES list is updated to name
this one new direct edge, with the reasoning for why it adds no new
DOMAIN edge (composer-store.js is already a transitive dependency via
`nor-composer.js`).

---

## 2. nor-explainability-service.js — correctly placed, not where first planned

Lives at `js/v2/document-intelligence/nor/nor-explainability-service.js`
— beside `nor-composer.js`, the SAME layer, the SAME allowed dependency
direction (document-intelligence/ MAY depend on knowledge/; knowledge/ MAY
NEVER depend on document-intelligence/). `explainDocument(documentId)`
merges three real sources — the attached bundle, per-citedKnowledgeId
provenance via the SAME `explainability-service.js#explain(item)`
`nor-composer.js` and `knowledge-center.js` already call, and rule labels
resolved via the SAME `knowledge-service.js#getKnowledge` idiom
`nor-composer.js` already uses. Never recomputes a Recommendation, never
re-derives a citation — a document with nothing attached (composed before
this sprint, or outside `composeApprovedNor`) honestly returns
`NO_EXPLAINABILITY`, never a fabricated placeholder.

**Conversation History is deliberately NOT in this file.**
document-intelligence/ may never depend on conversation/ either (same
graph, enforced by `conversation-ownership-check.mjs`'s own static walk).
`explainDocument()` hands back `conversationId` as a bare id string — the
same "cross-domain reference is an id, the UI resolves it" idiom
`knowledge-center.js` already uses for `importSessionId`.
`review-workspace.js` (ui/, the one layer allowed to depend on
conversation/) resolves it directly via
`conversation-service.js#getConversationHistory`.

---

## 3. Review Workspace — Explainability, Developer/Reviewer Mode only

`review-workspace.js`'s detail view gains 7 additional
`renderDetailSection()` entries (Retrieved Knowledge, Dasar Kutipan,
Applied Rules, Confidence, Missing Evidence, Unknown Facts, Conversation
History), spread into the SAME `renderDetail([...])` array Sprint 10.1
already built — not a second nested detail card. Gated by
`isDeveloperMode()`, matching the spec's explicit "Developer / Reviewer
mode only... Never expose this to ordinary users." Noted, not silently
assumed: `isDeveloperMode()` is a platform-wide flag today, not a true
Reviewer-role gate — real reviewer-only gating is Sprint 10.5's job,
should apply here too once it exists.

---

## 4. Verified

**Data layer (Node)** — `composer-foundation-check.mjs`: 44/44 (was 32/32
before this sprint). New: `attachExplainability`/`getExplainability`
round-trip and NOT_FOUND handling, preservation across a subsequent edit,
and `explainDocument()`'s full merge — including the honest
`NO_EXPLAINABILITY` path and graceful degradation when a cited id doesn't
resolve (`available: false`, never fabricated).

**Real end-to-end, live pipeline (Node)** —
`north-star-acceptance-check.mjs`: 38/38 (was 34/34). The 4 new checks are
the strongest proof in this sprint: after a REAL `composeApprovedNor()`
call on the Business Trip scenario, `getExplainability()` returns a real
persisted bundle, `explainDocument()` succeeds, and — critically — every
real `citedKnowledgeId` the live pipeline actually cited resolves to a
real, Approved KnowledgeItem (`available: true` for all of them, not the
synthetic unresolvable ids used in the Node unit test), and the
service's own `appliedRules` exactly matches the live Reasoning
`citedRuleIds` for the same occasion.

**Architectural boundary (Node)** — `conversation-ownership-check.mjs`
re-run, still green: confirms `document-intelligence/` (including the new
`nor-explainability-service.js`) still never imports `conversation/`.

**Full regression** — `problem-solving-integration-check.mjs` 30/30,
`nor-composition-check.mjs` 17/17, `smoke-boot.mjs` PASS — all unchanged
counts, confirming zero regression from the new `attachExplainability`
call added to `composeApprovedNor`'s hot path.

**Real browser, no login gate** — `review-workspace-render-check.mjs`
extended: 14/14 (was 11/11). The new scenario attaches a real
explainability bundle, flips the exact `localStorage` flag
`sarpras-intelligence-center.js`'s own mode-bar toggle writes, mounts in a
FRESH page (module-level `host`/`mounted`/`st` singletons are correctly
designed for one real mount per app session — reusing scenario 1's page
would have clashed with its already-mounted state, an artifact of the
test script, not a product bug, caught and fixed by first observing 3
real failures, not assumed away), and asserts the Unknown Facts and
Confidence sections render the real attached values.

**Not verified, same limitation as Sprint 10.1**: the real Settings → Power
View → Review Workspace click path with a real signed-in user, and
whether a genuinely long/multi-turn Conversation's history renders
sensibly (only tested with a synthetic `conversationId` that resolves to
no real conversation — the real end-to-end north-star check does not
currently assert on the Conversation History section specifically, only
on `getExplainability`/`explainDocument`). Recommended: add that assertion
once a credentialed session is available.

---

## 5. Phase 10 backlog

Sprint 10.3 (Document Editor) is next — `composer-store.js#editSection`
already exists, fully tested, with **zero real callers**; this sprint
found no new blocker for it. One real, small addition this sprint's own
work surfaces for 10.3 to account for: `editSection()`'s existing
`putRecord()` call already correctly preserves `explainability` (verified
directly above) — 10.3 needs no new wiring on that front.
