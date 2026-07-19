# Phase 11, Sprint 11.9 — Persistent Organizational Learning

> The one architectural gap left open at Phase 11's edge: reviewer learning
> was session-scoped. This sprint closes it as an **integration**, not an
> engine — reusing the codebase's own already-proven persistence pattern,
> adding no new repository, no new promotion workflow, no new learning
> engine, and no governance bypass. Nothing committed or pushed.

## The decisive investigation finding

Before writing any code, the linchpin question was answered: **is the
knowledge repository persistent?** It is not — `repository-registry.js`
registers only `null` (default) and `memory`; there is no Firebase-backed
knowledge repository. So on the surface, the whole Candidate/Review/Approval
lifecycle looks non-durable.

But the codebase already solved exactly this problem for imported Knowledge,
and the solution is a **projection**, not a second store:

```
knowledge-rehydration-engine.js#rehydrateKnowledgeFromSessions():
  Import Sessions (RTDB-persistent)  ──project on load──>  Draft Knowledge
```

> "make the in-memory knowledge repository a deterministic PROJECTION of the
> persisted Import Sessions, so imported Knowledge survives a browser refresh
> … WITHOUT a second persisted store." — that engine's own header.

And the second decisive fact: **reviewer edits are already durably
persisted.** `composer-document-repository.js` is RTDB-backed, and every
`editSection()` appends a `ComposerRevision` carrying the real per-field Diff
(before/after) and `editedBy`. The durable source of truth for reviewer
learning already exists — what was missing was the *projection* of it.

## Architecture decision — mirror the existing projection, don't invent

`js/v2/document-intelligence/composer/reviewer-edit-rehydration-engine.js` is
the exact analogue of `rehydrateKnowledgeFromSessions`, applied to the other
already-persistent source:

```
Composer Revisions (RTDB-persistent) ──project on load / on edit──> Candidate Learning
```

- **No new repository.** The persisted `ComposerDocument` is the single
  source of truth (requirement 6); the Candidate `KnowledgeItem` is
  re-derived from it, never independently persisted.
- **No new engine.** The semantic classification reuses Sprint 11.4's
  `semantic-diff-engine.js` verbatim. The candidate lands through the
  existing `knowledge-service.js` write door (`ingest`/`updateDraft`).
- **No new promotion workflow.** The projected item is an ordinary
  `CANDIDATE`; it advances to Approved only through the existing
  human-gated `promoteKnowledge()` — unchanged.
- **Placement:** the engine lives under `document-intelligence/` (not
  `knowledge/`) because it reads `composer-store.js` and `knowledge/` may
  never depend on `document-intelligence/` — the same layering reason
  `review-metrics-service.js` already lives there.

### Why this belongs to Phase 11, not Phase 12

Phase 11's own North Star is "Teach Once, Learn Forever," and its stated exit
criterion is that every reviewer correction becomes part of the
organization's memory. The UAT gap-closure explicitly named session-scoped
learning as *the only remaining architectural gap preventing Phase 11
closure*. Deferring it to Phase 12 would ship Phase 11 with its central
promise unmet. Crucially, closing it required **no new architecture** — only
the integration of two systems Phase 11 had already built (the Sprint 11.4
semantic diff and the Phase 10 persisted composer documents), through a
pattern Phase 2.5 already established. It is a Phase 11 finish, not a Phase 12
expansion.

## Persistence strategy (durable source → idempotent projection)

| Concern | Mechanism |
|---|---|
| **Where the durable data lives** | The RTDB-backed `ComposerDocument` + its `ComposerRevision` history (unchanged, Phase 10) |
| **How learning is reconstructed** | `rehydrateLearningFromDocuments()` re-projects reusable-wording reviewer edits into `CANDIDATE` `writing_style` KnowledgeItems |
| **When it runs (live)** | Registered on `composer-document-repository`'s change listener — `putRecord() → notifyChange()` fires it on every local edit |
| **When it runs (refresh/restart/deploy)** | The SAME listener fires on `applyRemoteSnapshot() → notifyChange()` when RTDB rehydrates the documents; plus one explicit call after `initComposerDocumentSync()` resolves |
| **Idempotence** | Deterministic id per `(documentId, field)` (`generateKnowledgeId`); a re-run skips a byte-identical Candidate, updates a still-mutable one whose wording moved on, and NEVER touches an Approved/Deprecated item |
| **Source of truth** | The persistent document. The in-memory Candidate is disposable and reconstructed — session cache for responsiveness, persistent document for truth (requirement 6) |

### The Session vs. Organizational learning split (requirement's LEARNING MODEL)

- **Session Learning** (fast, disposable): the memory-only `LearningEvent`
  audit + the dashboard's "Perubahan Terbaru" feed — unchanged, still
  session-scoped, now honestly labelled as a fast feed.
- **Organizational Learning** (persistent, governed, promotable): the
  projected `writing_style` Candidates in "Menunggu Tinjauan" — survive
  refresh, carry the full provenance record, promote only by human approval.

### What is projected, and what is deliberately not

- **Projected:** a reviewer edit to a **non-pattern** field whose Sprint 11.4
  classification is a reusable wording/phrasing preference
  (`opening_phrase` / `closing_phrase` / `wording_change`). Landed as
  `kind:'writing_style'` so an approval feeds
  `buildProfile(domainType, WRITING_STYLE)` → Pattern Discovery
  recommendations — the loop closes with zero new plumbing.
- **NOT projected — per-document facts** (`quantity_correction`: "20 → 24
  kursi" for one document is not reusable knowledge; it already lives durably
  in that document's own revision) and **structural edits** (a section
  added/removed). Fabricating reusable Knowledge from a one-off document value
  would violate CLAUDE.md's "Knowledge is structured organizational
  understanding" / "Never invent business rules."
- **NOT projected here — pattern-sourced (`pattern:<id>`) edits.** Those are
  already handled by `section-learning-bridge.js` Signal 2 (a Candidate
  correcting the cited pattern). Persisting *those* across refresh is the
  natural same-mechanism extension point (see Known Limitations), left out to
  keep this diff bounded and to avoid double-generating a Candidate per edit.

## The organizational-memory record (requirement: preserve all eight facts)

Every persistent learning Candidate preserves the full chain **through
existing structures** — no new record type:

| Required | Where it lives |
|---|---|
| Original AI output | `payload.originalAiOutput` (the `before` of the first modification) |
| Human edit | `payload.value` (also the profile grouping key) |
| Semantic classification | `payload.semanticClassification` (Sprint 11.4 diffNature) |
| Reviewer | `payload.reviewer` (revision `editedBy`) |
| Timestamp | `provenance.capturedAt` (revision `createdAt`) |
| Evidence | `payload.sourceDocumentId` |
| Approval status | `KnowledgeItem.lifecycleState` |
| Promotion history | the item's append-only version history / review-history |

## Governance (requirements 3 & 4 — the non-negotiables)

- **Knowledge is never updated directly.** Reviewer edits become
  `CANDIDATE`s. `updateDraft` (used for the "wording moved on" case) refuses
  Approved/Deprecated items by contract, so the projection *cannot* mutate
  organizational record even if asked.
- **Nothing becomes Knowledge until approved.** The projection never calls
  `submitForReview`/`approve`. Promotion is the existing, human-only
  `promoteKnowledge()` with a required rationale.
- **Verified, not asserted:** the checks below approve a projected Candidate
  through the real pipeline, then re-project and confirm the Approved item is
  byte-for-byte untouched.

## Migration notes

No data migration is required, and this is a property of the design, not an
omission:

- The mechanism is **projection**, so there is no new stored schema to
  backfill. Every ComposerDocument that already exists in RTDB (from any
  prior session) is projected on the next load automatically — historical
  reviewer edits become Candidates the first time the workspace mounts after
  this ships, with no migration script.
- Idempotence means re-projection is always safe; there is no "one-time
  migration" step that could half-run.
- Roll-back is trivial: the projected Candidates are disposable derivations;
  removing the engine simply stops projecting. No organizational record is
  lost (the durable documents are untouched), and any Candidate a human had
  already approved is, by then, ordinary Approved Knowledge that stands on its
  own.

## Regression summary

Changed: **new** `reviewer-edit-rehydration-engine.js`;
`sarpras-intelligence-center.js` (wiring — register on composer change
listener + call after sync); `learning-dashboard.js` (copy);
`sarpras-workspace-harness.html` (additive test hooks); **new**
`reviewer-edit-rehydration-check.mjs` and `persistent-learning-check.mjs`;
one assertion in `uat-gap-closure-check.mjs` updated to the reworded copy.
`section-learning-bridge.js` and `review-workspace.js` were **not touched**.

| Script | Result |
|---|---|
| reviewer-edit-rehydration-check.mjs (NEW, Node) | 27/27 |
| persistent-learning-check.mjs (NEW, browser) | 10/10 |
| uat-gap-closure-check.mjs (1 assertion updated) | 12/12 |
| knowledge-ownership-check.mjs | 56/56 |
| composer-foundation-check.mjs | 76/76 |
| section-learning-bridge-check.mjs | 30/30 |
| section-confidence-engine-check.mjs | 22/22 |
| semantic-diff-engine-check.mjs | 18/18 |
| knowledge-drift-engine-check.mjs | 15/15 |
| learning-ownership-check.mjs | 66/66 |
| pattern-discovery-check.mjs | 13/13 |
| conversation-ownership-check.mjs | 80/80 |
| sarpras-workspace-dom-check.mjs | 95/95 |
| review-workspace-render-check.mjs | 51/51 |
| live-document-workspace-check.mjs | 36/36 |
| home-generate-live-preview-check.mjs | 9/9 |

**Three scripts still fail — all confirmed pre-existing and unrelated:**
`sarpras-home-experience-check` (13/14), `sarpras-workspace-completion-check`
(58/59), and `learning-dashboard-today-check` (4/6). The last was
`git stash`-isolated **this sprint**: with the Sprint 11.9 source changes
reverted it fails the identical 2 assertions (both about "today"
knowledge-fact counting, unrelated to reviewer-edit projection). **Zero new
regressions.**

## Browser verification — the required flow

`persistent-learning-check.mjs` drives the real mounted shell:
Create doc → reviewer edit (real `editSection`) → **composer change listener
projects a persistent Candidate with no manual call** → Learning Dashboard
renders it in "Menunggu Tinjauan" (persistent organizational memory) →
re-projection (the refresh mechanism) creates nothing new and keeps it →
human approval promotes it to Approved Knowledge → a later re-projection
never overwrites the Approved record. `reviewer-edit-rehydration-check.mjs`
additionally proves the closed loop into the `writing_style` profile and all
the negative controls (facts/patterns/structural/reverted edits not
projected).

## Known limitations

1. **Cross-reload durability depends on RTDB, which the test environment
   cannot exercise.** Every browser check here is Firebase-free by
   construction (no credentials in this environment — the documented,
   repo-wide limitation). What is proven is the exact *mechanism* that makes
   durability work (idempotent re-projection from the persisted document);
   the actual RTDB rehydration round-trip is unchanged, already-shipped Phase
   10 infrastructure that a real credentialed session exercises.
2. **Pattern-sourced (`pattern:<id>`) reviewer edits are not yet persistent.**
   They still generate a session-scoped Candidate via Signal 2. Persisting
   them is the same-mechanism extension point below — deliberately out of
   scope to keep this a bounded integration and avoid double-generating a
   Candidate per edit.
3. **Projection cost scales with (documents × revisions) per composer
   change.** For pilot scale this is negligible; at large scale the projection
   could be scoped to the changed document (the `projectReviewerEditLearning`
   single-document entry point already exists for exactly this).
4. **One Candidate per (document, field).** A reviewer making the same wording
   change across many documents produces one Candidate each — intentional
   (each is distinct evidence, and Sprint 11.5's recommendation layer
   aggregates them), but a busy reviewer will see several Candidates to
   review. They are governed and rejectable.

## Remaining production blockers

None newly introduced. The standing posture is unchanged: **supervised pilot
only** — a real credentialed browser session against production Firebase
still has not been human-witnessed in this environment, and the persistent
learning path is brand new with no real-world usage evidence yet. With this
sprint, the pilot-blocking *architectural* gap (session-scoped learning) is
closed; what remains is real-world validation, not architecture.

## Future extension points

- **Persist pattern-sourced edits** through the identical projection (extend
  the engine to `pattern:<id>` fields, reconciling with Signal 2 so exactly
  one Candidate is generated per edit).
- **Scope the projection to the changed document** on live edits (call
  `projectReviewerEditLearning(documentId, domainType)` from the change event
  with the changed id, instead of re-scanning the whole corpus) once corpus
  size warrants it.
- **A real Firebase-backed knowledge repository** (the registry's own
  documented `FUTURE EVOLUTION` seam) would make the projection unnecessary —
  but the projection is the smaller, lower-risk step, and is the right one for
  now.

## Phase 11 exit criteria — met

> Teach Once. Learn Forever. Every reviewer correction becomes part of the
> organization's memory. Not immediately. Not automatically. But permanently,
> through the existing governed learning pipeline.

A reviewer's reusable wording edit now becomes a persistent, governed,
promotable `CANDIDATE` — reconstructed from the durable ComposerDocument on
every load, surviving refresh/restart/deployment — and becomes organizational
Knowledge only when a human approves it, through the unchanged existing
pipeline. Phase 11 closes. Phase 12 is not begun.

## Not committed

Per the sprint's own instruction: nothing was committed or pushed.
