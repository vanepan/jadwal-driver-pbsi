# workspace/ — Live Word Workspace (V2, Phase 12.8)

## What this is

Phase 12.8's brief asked for an "Organizational Workspace" where documents
continuously understand Knowledge/Memory/Recognition/Body/Relationships/
Policies/History/Context/Learning while a user writes, without explicit
commands. The architecture review that preceded this code (see the
Phase 12.8 conversation record) found something important first: a real
**Live Document Workspace already existed** —
`js/v2/ui/review-workspace.js#renderLiveDocument()`, shipped in the Sprint
11.3 "Document-first Experience" course-correction — a contenteditable,
section-by-section, confidence-colored editor over a `ComposerDocument`,
already wired to Knowledge citations and a Learning bridge
(`document-intelligence/composer/section-learning-bridge.js`).

**`workspace/` is not a second document system.** It is the ONE new
orchestration-tier domain this platform was structurally missing: nothing
before Phase 12.8 was allowed to compose `document-intelligence/` +
`knowledge/` + `organizational-memory/` + `body/` + `recognition/` +
`learning/` in one place (see js/v2/README.md's dependency graph — `ui/`
never depends on `body/`; `document-intelligence/` never depends on
`recognition/`; even `problem-solving/` does not read `body/` or
`recognition/` directly). `workspace/` exists to be exactly that
composition seam, narrowly and explicitly, the same way `learning-bridge/`
was granted a narrow bridge between `body/` and `learning/` in Phase 12.6
— not a general precedent, a specific, approved exception for a specific,
named cross-cutting need.

## §1 — A Workspace wraps a document, it does not replace one

A `Workspace` (`contracts/workspace-contract.js`) is a thin, 1:1 wrapper
around an EXISTING `ComposerDocument`
(`document-intelligence/composer/contracts/composer-document-contract.js`).
It never stores sections/content itself — `context/workspace-context-builder.js`
reads the live document fresh on every call, via
`document-intelligence/composer/composer-store.js#getDocument`. A `Live
Block` (`contracts/live-block-contract.js`) is a strict, lossless superset
of `EditableSection`, converted losslessly both ways by
`adapters/block-adapter.js` — living INSIDE `workspace/`, not
`document-intelligence/`, because the dependency graph is one-way
(`workspace/` depends on `document-intelligence/`, never the reverse); an
adapter importing both contracts has to live on the downstream side, the
same way `knowledge/learning/diff-learning-engine.js` lives with the
domain that CONSUMES a diff, not the one that produces the raw values.
`document-intelligence/` itself is never modified — no new field, no new
write path — this phase's entire "document model" decision was: **keep
documents as structured organizational objects in RTDB (already true),
never files (already true), and extend the section model additively.**

## Layout

```
workspace/
  contracts/          Workspace, WorkspaceSession, LiveBlock, LiveSuggestion,
                       WorkspaceTimelineEntry — vocabulary, no logic.
  adapters/            block-adapter.js — the lossless EditableSection[] <->
                       LiveBlock[] conversion. Lives here (not
                       document-intelligence/) because the graph is
                       one-way — see §1.
  registry/            suggestion-type-registry.js — suggestionType vocabulary
                       + per-type confidenceFloor (the tunable mitigation
                       for false-positive suggestion noise).
  repository/          workspace-repository.js (Memory+Null+registry,
                       Knowledge/Body-style) + workspace-timeline-repository.js
                       (direct-function, Learning/BodyEvent-style — a
                       timeline entry is an immutable log row, not a
                       versioned record).
  context/             workspace-context-builder.js — buildWorkspaceContext():
                       the ONE function in this platform allowed to compose
                       Body + Organizational Memory + Recognition + Learning
                       + Reasoning read-only, for one open Workspace. Ships
                       real, not a stub — see §2. Also enriches each Live
                       Block's own liveEntityRefs via entity-text-matcher.js
                       (Phase 12.8.x, Sprint 2 — deterministic, non-NLP).
  suggestion/           workspace-suggestion-engine.js — computeSuggestions():
                       pure, stateless, cite-or-abstain, turns a
                       WorkspaceContext into LiveSuggestion[]. Mirrors
                       learning/learning-recommendation-engine.js's own
                       "never writes, never auto-applies" discipline.
  explainability/       workspace-explainability-service.js —
                       explainSuggestion(): this platform's 7th
                       disambiguated explain() surface, MERGING (never
                       reinventing) the underlying domain's own explain
                       output where one exists (Recognition, Learning).
  snapshot/             workspace-snapshot-cache.js — a narrow, same-process
                       cache of the last built context, honestly aged
                       (never disguised as live). NOT yet wired into
                       js/pwa.js/service-worker.js — see §4.
  services/             workspace-service.js (the ONE owner of both
                       repositories), index.js (namespaced barrel).
  workspace-flags.js    WORKSPACE_LIVE_SUGGESTIONS_ENABLED — the kill
                       switch gating ui/review-workspace.js's suggestion
                       panel, independent of isV2Enabled().
  index.js              dormant barrel — mirrors js/v2/index.js exactly.
```

## §2 — Dependency direction (binding, extends js/v2/README.md's graph)

```
workspace/               ──depends on──>  document-intelligence/ (read-only,
                          composer-store.js#getDocument only — never
                          composer-document-repository.js directly),
                          knowledge/, organizational-memory/, learning/,
                          body/ (services-only, via body/services/index.js#context),
                          recognition/ (services-only, via
                          recognition/services/index.js#records),
                          reasoning/ (services-only, via reasoning/services/
                          reasoning-service.js#reasonWithGaps — Phase 12.8.x
                          Sprint 3's SECOND narrow grant, added after body/;
                          same reason()-stays-cite-or-abstain-over-Approved-
                          Knowledge-only rule, unchanged)
workspace/                ──never depends on──>  ui/, ai-foundation/,
                          conversation/, problem-intelligence/,
                          problem-solving/
document-intelligence/, knowledge/, organizational-memory/, learning/,
body/, recognition/, reasoning/  ──never depend on──>  workspace/ (workspace/
                          is purely downstream — the same posture
                          problem-solving/ and recognition/ already hold
                          toward what they read)
ui/                        ──depends on──>  workspace/ (Phase 12.8.4 —
                          ui/review-workspace.js is the one real caller)
```

This is the ONE new edge this phase adds to the platform's dependency
graph — narrower than it might look: `workspace/` reads `body/` and
`recognition/` directly (unlike `ui/`, which is still forbidden from
reading `body/` at all, and unlike `document-intelligence/`, which is
still forbidden from reading `recognition/` — both rules from Phase 12.5
and 12.7 stay exactly as they were). The grant is scoped to this one new
domain, for this one documented reason, following the exact governance
mechanism `learning-bridge/` already established: a narrow, explicit,
reviewed exception — never a general loosening.

## §3 — Body facts stay descriptive, here too

`workspace-context-builder.js` reuses `body/services/index.js#context.buildBodyContext()`
**verbatim** — it does not reshape or reinterpret what comes back. A live
`observedState` surfaced through a Live Suggestion (`suggestionType:
'related_entity'`) is framed as informational payload
(`{entityId, entityType, observedState}`), never a directive — the same
descriptive-only constraint `body/README.md` §1 places on
`reasoning/reasoning-engine.js#reason()` applies here for the identical
reason: an *is* must never silently become an *ought* without a human
approving that inference as a real `kind:'rule'` KnowledgeItem first.

## §4 — What Phase 12.8 does NOT do

- No LLM/AI wiring anywhere — `ai-foundation/` stays untouched,
  `NOT_IMPLEMENTED`.
- No auto-insert of a suggestion into document text — every
  `LiveSuggestion` is human-gated (`decideSuggestion()`); accepting one
  never mutates the `ComposerDocument`'s own `EditableSection.value`.
- No write path from `workspace/` into
  `document-intelligence/composer-document-repository.js` — "Live
  Citation" is realized as Workspace Timeline entries
  (`ENTRY_TYPE.CITATION_BOUND`), folded by
  `workspace-service.js#getBlockCitations()`, never written onto
  `EditableSection.knowledgeReferences` itself. `suggestion-placeholder-
  contract.js`'s long-reserved `SUGGESTED`/`ACCEPTED`/`REJECTED` states
  are the natural future destination for that bridge — named here as a
  real future-expansion opportunity, not built now (would require
  `composer-store.js` to grow a new write path, out of scope this phase).
- No unification of this platform's now-7 disambiguated `explain()`
  surfaces, and no unification of its 3 separate graph engines
  (`knowledge/`, `body/`, `recognition/`) — both disclosed, deliberate
  future consolidations, not this phase's job.
- No new offline/PWA infrastructure — `workspace-snapshot-cache.js` is a
  same-process convenience cache only; integrating with the app's real
  `js/pwa.js`/`service-worker.js` caching strategy is flagged as a
  pre-work spike for whichever future sprint takes it on.
- `Live Table` ships as a registered `BLOCK_TYPE` value only — no
  table-specific rendering or editing behavior exists yet.

## §5 — Feature gating

Two independent gates, stacked: `js/config/feature-gates.js#isV2Enabled()`
(the whole V2 pilot, unchanged) and, one level inside that,
`workspace-flags.js#WORKSPACE_LIVE_SUGGESTIONS_ENABLED` (default `false`)
— Sprint 12.8.4's first live cross-domain wiring (Body + Recognition +
Learning composed together, for the first time anywhere in this platform)
ships completely dark, switched on deliberately and independently of any
other V2 pilot-access decision.

## §6 — Verification

`scripts/workspace-ownership-check.mjs` — static (single-writer
enforcement per repository, dependency-direction enforcement, dormancy)
+ behavioural (a real end-to-end `createWorkspace → buildContext →
computeSuggestionsFor → decideSuggestion → getWorkspaceTimeline →
getBlockCitations → explainSuggestion` flow, run in plain Node). Run:
`node scripts/workspace-ownership-check.mjs`.
