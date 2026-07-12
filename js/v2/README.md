# js/v2 — Sarpras Intelligence (RC1, V2.0.18–V2.0.20)

> Status: **dormant to everyone except one pilot user**. `js/config/feature-gates.js#isV2Enabled`
> gates the single entry point (`sarprasIntelligence`) to `role:'admin'` AND
> `username:'evan'`. Nothing under `js/v2/` is statically imported by any
> file outside this tree; the outer shell (`ui/sarpras-intelligence-center.js`)
> is reached only through a dynamic `import()` in
> `js/config/module-loader-registry.js`, itself only ever called after the
> gate passes. No AI/LLM/OCR/NLP code exists anywhere in this tree.

## What this is

Sarpras Intelligence is an Organizational Learning Platform: Knowledge is
extracted from real organizational documents, curated through an explicit
human review workflow, and organized into reusable Profiles and Datasets —
never invented, never auto-approved. As of RC1 the platform itself
(engines + presentation) is complete; what's deliberately still empty is
**content** — no real Organizational Knowledge, Bootstrap Dataset, or
Official NOR Archive has been authored yet. That is the next phase, and it
is out of scope for this tree's engineering.

## Layout

```
js/v2/
  ai-foundation/          ADAPTER LAYER ONLY. May depend on knowledge/, never the reverse.
    adapters/               claude / openai / local-model — all NOT_IMPLEMENTED stubs
    registry/               adapter registry (real)

  document-intelligence/  first CONSUMER of knowledge/. See its own README.
    nor/                    the NOR pilot — 5 real pipeline steps (analyze/draft/validate/explain/recommend)
    composer/               Live Editable Composer (V2.0.15) — composer-store.js is real; a
                            ComposerDocument's write side (editSection) has no authoring UI yet
    session-store.js       real DocumentSession store
    registry/               analyzer/step registries, populated by nor/

  knowledge/              THE PLATFORM CORE. Domain-agnostic. See its own README.
    contracts/              typedefs + frozen shape constants — vocabulary, no logic
    registry/               domainType / kind / connector registries
    repository/             real: MemoryRepository (default-active) + NullRepository
    lifecycle/              the 5-state transition graph (draft→candidate→pending_review→approved→deprecated)
                            — there is deliberately NO "rejected" state; reject() returns an
                            item to candidate (see review/review-workflow-engine.js)
    acquisition/            Connector -> Repository orchestration (real)
    connectors/             1 real connector (nor) + 11 inactive placeholders
    extraction/             pattern/vocabulary/relationship extraction + the Approved-item index
    review/                 real: workflow, queue, session, conflict detection
    learning/               real: Correction Pipeline, shared Diff Model (diff-engine.js),
                            Diff Learning (submits a Composer edit as a Correction),
                            Similarity Detection, Knowledge Evolution, LearningMetrics aggregator
    machine-learning/       real: clustering, pattern mining, statistics, outlier detection, confidence
    metrics/                real: computeHealthReport() (coverage, confidence distribution, health score)
    explainability/         real: explain(item) — the 5 fixed explainability questions
    dependency-graph/       real: single-hop getDependencies() + multi-hop KnowledgeGraph (BFS)
    profiles/                real: buildProfile/buildAllProfiles — Organizational Knowledge Profiles
    datasets/                real registries/contracts for Dataset & DatasetPack classification
                            (OFFICIAL/HISTORICAL/SYNTHETIC/TRAINING/CORRECTION) — deliberately a
                            SEPARATE table from ArchiveRecord, never a field on it
    services/                the intended single import surface — namespaced facades
                            (review/metrics/explainability/dependencyGraph/knowledgeGraph/
                            confidence/statistics/profiles/...) over the engines above

  organizational-memory/  Archive/Timeline/Gap/Duplicate/Upload-recommendation engines,
                          downstream of knowledge/ (reads it, never the reverse). See its own README.
    repository/              real, append-only ArchiveRecord store
    sources/                 real 'nor' archive source + 3 inactive placeholders (excluded from
                            the barrel — importing sources/index.js is what registers 'nor')

  ui/                     the ONLY presentation layer. Four real nested workspaces, mounted
                          lazily (dynamic import) by sarpras-intelligence-center.js:
    sarpras-intelligence-center.js   outer shell — Dashboard (static roadmap) + 4 workspace mounts
    nor-center.js                    NOR Center — Dashboard/Generate/Drafts/Archive/Review/Settings,
                                     scoped to domainType:'nor'
    archive-center.js                Archive Center — cross-domain generalization of the SAME
                                     Organizational Memory engines nor-center.js's own Archive tab
                                     uses, plus a Dataset-classification browser (Official/
                                     Bootstrap/Synthetic Archive)
    knowledge-center.js               Knowledge Center — cross-domain Knowledge browser with a
                                     Detail drawer cross-linking Profile/Dataset/Archive
    learning-dashboard.js             Learning Dashboard — composes existing metrics/learning
                                     engines into one dashboard; invents no new number
    shared/workspace-list-kit.js      presentational-only rendering kit (tab shell, row list,
                                     filter bar, detail drawer, diff table) shared by the three
                                     newer workspaces; nor-center.js keeps its own local
                                     equivalents for now (a planned, not-yet-done, hardening dedupe)

  index.js                dormant barrel — a structural no-op proving nothing auto-runs
```

## Dependency direction (binding)

```
ai-foundation/          ──depends on──>  knowledge/
knowledge/              ──never depends on──>  ai-foundation/ or any AI/LLM code
organizational-memory/  ──depends on──>  knowledge/ (read-only cross-reference)
knowledge/              ──never depends on──>  organizational-memory/
ui/                     ──depends on──>  knowledge/, organizational-memory/, document-intelligence/
knowledge/ & organizational-memory/  ──never depend on──>  ui/
knowledge/              ──depends on──>  V1, read-only, through *-store.js getters
V1 (js/app.js, any *-store.js, any engine)  ──never depends on──>  js/v2/*
```

- `knowledge/` must be fully buildable, queryable, and reviewable with
  **zero** AI providers registered, forever.
- Nothing outside `js/v2/` may statically import from `js/v2/`. The one
  reach-in is `js/config/module-loader-registry.js`'s dynamic `import()`,
  itself only ever invoked after `isV2Enabled()` passes.
- `domainType` and `kind` are registry-backed values, never a hardcoded
  switch inside repository or lifecycle code.

## What this tree still does NOT do (true as of RC1)

- No LLM/AI provider is called — every adapter under `ai-foundation/` is
  still a stub.
- No existing V1 engine, store, or `app.js` is modified; every V1 read goes
  through that module's own public getter (e.g. `petty-cash-store.js#getSettings`).
- No document is rendered, and no document is parsed beyond a structural
  ViewModel fingerprint.
- Nothing is auto-approved — every human-gated lifecycle move still
  requires an explicit `ReviewDecision`.
- The NOR generator itself (`document-intelligence/nor/nor-generator-contract.js#proposeNorFields`)
  is an intentional, honest `NOT_IMPLEMENTED` throw (Phase 8, architecture-only)
  — NOR Center reports this outcome truthfully rather than faking a draft.
- No file-upload/Storage mechanism exists anywhere in this codebase —
  Archive Center's "Upload Queue" is a workflow status marker
  (`gap-workflow-engine.js`), never a real upload.
- `js/prediction/explainability.js` and `js/services/dispatch-presentation.js`
  remain unreconciled with `knowledge/explainability/knowledge-explainability-engine.js`
  — three explainability surfaces exist; unifying them would touch V1 and is
  deliberately out of scope.

## Future evolution (next phase — NOT engineering)

Per the frozen roadmap, engineering work stops at RC1. What follows is
content authoring against the platform built here: Organizational Knowledge,
Bootstrap Dataset, Official NOR Archive, and Continuous Learning. None of
that content is created by this tree.
