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

  body/                   Phase 12.5 — Body Intelligence. A PEER of knowledge/, not
                          downstream of it: represents V1 operational objects (Vehicle,
                          Driver, Assignment — 3 real Sensors; 16 more entity types
                          registered but placeholder-only) as read-model `Entity`
                          snapshots. NEVER a system of record — see its own README §1
                          for why it deliberately has no lifecycle/ directory. Depends
                          only on V1 (read-only, *-store.js getters) + two precedented
                          pure-leaf contract reuses from knowledge/; never on any
                          knowledge/organizational-memory/learning/conversation/
                          reasoning/... ENGINE or SERVICE. conversation/, reasoning/,
                          problem-intelligence/ MAY depend on it (read-only,
                          services-only) — not exercised yet. See its own README.
    contracts/               Entity/EntityState/Sensor/EntityRelationship/BodyEvent/
                            EntityHealthReport shapes — vocabulary, no logic
    registry/               entity-type-registry (19 types) + sensor-registry (16
                            placeholders bootstrapped; the 3 real sensors self-register
                            outside it, same dormancy-by-omission as connector-registry.js)
    sensors/                 vehicle/driver/assignment (real, V1-reading) +
                            placeholder-sensor.js (factory for the other 16)
    repository/              entity-repository (Memory+Null, Knowledge-style) +
                            relationship-repository + body-event-repository
                            (direct-function, Learning-style)
    graph/                   entity-relationship-graph-engine.js — getNeighbors/
                            getSubgraph/getGraphStats over DERIVED (never hand-authored)
                            edges; disambiguated from knowledge/'s KnowledgeGraph
    health/                  entity-health-engine.js — passes through a real
                            V1-computed score where one exists, never invents one
    services/                entity-service.js (Entity write owner) +
                            body-sensing-service.js (the orchestrator) +
                            entity-graph-service.js / entity-health-service.js
                            (thin delegation) + index.js (namespaced barrel)
    context/                 body-context-builder.js — ships complete, zero callers
                            outside its own tests (same bar this file sets for the
                            whole platform)

  document-intelligence/  first CONSUMER of knowledge/. See its own README.
    nor/                    the NOR pilot — 5 real pipeline steps (analyze/draft/validate/explain/recommend)
                            + nor-composer.js (Phase 8-10, NOT a pipeline step) — composes a fully
                            explainable draft from Approved pattern/rendering_rule Knowledge + a
                            completed Conversation's genuine facts, and hands it to composer-store.js
                            + nor-explainability-service.js (Phase 10, Sprint 10.2) — explainDocument():
                            merges the persisted Reasoning+Composition explainability bundle with
                            per-KnowledgeItem provenance for the Review Workspace's Explainability tab
    composer/               Live Editable Composer (V2.0.15) — composer-store.js#createDocument is
                            REAL (Phase 8-10, via nor-composer.js); editSection is ALSO now real
                            (Phase 10, Sprint 10.3, via ui/review-workspace.js's Document Editor —
                            js/v2/dormant-subsystems.js's 'composer-timeline' entry is retired) +
                            composer-document-repository.js (Phase 10, Sprint 10.1) — RTDB-backed
                            persistence, so a document/its revisions/its attached explainability
                            survive a refresh
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
                            Similarity Detection, Knowledge Evolution, LearningMetrics aggregator.
                            NAMING NOTE: this is `knowledge/learning/` — per-item KNOWLEDGE
                            PAYLOAD correction mechanics (correction-pipeline-engine.js, still
                            dormant — see js/v2/dormant-subsystems.js). It is NOT the same thing
                            as the top-level `learning/` domain (Phase 5) — that is the platform-
                            wide Learning Service every domain records organizational learning
                            through. Two directories, same English word, deliberately different
                            concerns; do not conflate them.
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
    services/                archive-service.js — Archive's ONE owner (Phase 4). create/appendVersion
                            have exactly one caller in the platform: this file.
    sources/                 real 'nor' archive source + 3 inactive placeholders (excluded from
                            the barrel — importing sources/index.js is what registers 'nor')
    archive-relationship-engine.js   pure — deterministic duplicate/relationship reasoning
                            (records in, facts out; no repository import)
    coverage-engine.js               Phase 5 — the six explainable Coverage dimensions
    organizational-memory-engine.js  Phase 5 — the eight-fact Organization Memory report

  learning/               Phase 5 — Learning's ONE owner, and the platform's MOST UPSTREAM
                          domain: it depends on nothing above it (see services/
                          learning-service.js's header for the full rationale). Every
                          correction/gap-resolution/pattern/coverage-snapshot/knowledge-
                          approval the platform records is a LearningEvent here. Phase
                          12.6 (Universal Learning Engine) additively extends this domain
                          with a generic signal-intake pipeline sitting ALONGSIDE the 14
                          existing recordX() call sites — none of them touched, none of
                          them required to change — see services/learning-signal-service.js.
    contracts/               LearningEvent shape + lifecycle (Observed→Validated→Accepted→
                            Applied→Historical) + the 5-category correction taxonomy +
                            (Phase 12.6) the 6th LEARNING_KIND, OBSERVATION, plus new
                            LearningScope/LearningSignal/LearningConfidence/
                            LearningRecommendation/LearningLineage shapes
    registry/                (Phase 12.6) learning-signal-type-registry.js (registered
                            signalType -> LEARNING_KIND mapping, optional metadata, never
                            a gate) + learning-source-weight-registry.js (a NEW id space,
                            deliberately not knowledge/'s own source-weight-contract.js)
    repository/              real, append-only LearningEvent store — UNCHANGED by Phase 12.6
    services/                learning-service.js — recordCorrection/recordGapResolution/
                            recordPattern/recordCoverage/recordKnowledgeEvolution/
                            recordLearningEvent (already generic) + explainLearningEvent.
                            create/appendVersion have exactly one caller in the platform:
                            this file — UNCHANGED by Phase 12.6. (Phase 12.6, new)
                            learning-signal-service.js#emitLearningSignal() — the ONE new
                            generalized entry point, threading Observe→Normalize→Validate→
                            Merge→Dedup→Conflict→Confidence→Persist (via the existing,
                            unmodified recordLearningEvent — see
                            scripts/learning-signal-ownership-check.mjs for the "exactly
                            one write" proof) + learning-outcome-service.js
                            (recordLearningOutcome — a thin wrapper over emitLearningSignal,
                            the natural future home for reasoning/'s already-deferred
                            "Recommendation → LearningEvent" wiring, NOT wired live here)
    (root)                   (Phase 12.6, flat at learning/'s root, mirroring
                            organizational-memory/'s own flat-engine style)
                            learning-confidence-engine.js (cites/extends
                            knowledge/machine-learning/confidence-engine.js's formula —
                            reimplemented, not imported: learning/ may not depend on a
                            knowledge/ ENGINE) + learning-signal-similarity-engine.js
                            (reimplements knowledge/learning/similarity-detection-engine.js's
                            ~10-line Jaccard formula, same reason) +
                            learning-conflict-detection-engine.js (fresh, scope-exact,
                            mirrors archive-relationship-engine.js's bucket-then-pairwise
                            SHAPE only) + learning-recommendation-engine.js
                            (computeRecommendations — pure, never stored, disambiguated
                            from reasoning/'s own Recommendation) +
                            learning-lineage-engine.js (traceLineage — composes
                            explainLearningEvent()'s existing chain-walk, never re-walks it)

  learning-bridge/        Phase 12.6 — the Body pull adapter. A separate, cross-cutting
                          domain (mirrors problem-solving/'s "sees everyone" precedent),
                          NOT nested inside learning/ or body/, because body/ and learning/
                          are mutually forbidden from importing each other's engines. See
                          its own README.
    adapters/                body-signal-adapter.js — pure BodyEvent -> LearningSignal
                            seed mapping
    services/                body-learning-bridge-service.js — the one impure
                            orchestrator: reads body/'s body-event-repository.js#list()
                            (read-only, never append()), calls learning/'s
                            emitLearningSignal(). No scheduler, no live caller this phase.

  ui/                     the ONLY presentation layer. Four real nested workspaces, mounted
                          lazily (dynamic import) by sarpras-intelligence-center.js:
    sarpras-intelligence-center.js   outer shell — Dashboard (Executive Briefing, incl.
                                     Phase 5's "Wawasan Pembelajaran" card) + 4 workspace mounts.
                                     Phase 10.5 — the Home free-text entry point now calls
                                     problem-solving-service.js#beginProblemSolving() FIRST on
                                     every submission (Problem Classification -> Diagnostic
                                     Planning -> Routing Decision), never the legacy Intent Engine
                                     directly — the FIRST real UI caller of any js/v2/ engine
                                     domain built since Phase 4. Developer Mode gained a full
                                     pipeline trace viewer (renderPipelineTrace()). Every existing
                                     screen/quick-action/search behavior is unchanged — re-verified
                                     by the full pre-existing 94-assertion DOM suite, still green.
    nor-center.js                    NOR Center — Dashboard/Generate/Drafts/Archive/Review/Settings,
                                     scoped to domainType:'nor'
    archive-center.js                Archive Center — cross-domain generalization of the SAME
                                     Organizational Memory engines nor-center.js's own Archive tab
                                     uses, plus a Dataset-classification browser (Official/
                                     Bootstrap/Synthetic Archive)
    knowledge-center.js               Knowledge Center — cross-domain Knowledge browser with a
                                     Detail drawer cross-linking Profile/Dataset/Archive
    learning-dashboard.js             Learning Dashboard — Overview/Approval & Coverage/Aktivitas/
                                     Distribusi/Antrean/Memori Organisasi (Phase 5) — composes
                                     existing metrics/learning/coverage/organizational-memory
                                     engines into one dashboard; invents no new number
    shared/workspace-list-kit.js      presentational-only rendering kit (tab shell, row list,
                                     filter bar, detail drawer, diff table) shared by the three
                                     newer workspaces; nor-center.js keeps its own local
                                     equivalents for now (a planned, not-yet-done, hardening dedupe)

  conversation/           Phase 6 — Conversation Intelligence Foundation. Lets a human describe
                          what they want in one sentence instead of operating repositories,
                          datasets or metadata directly. Deterministic: no AI, no LLM, no
                          probabilistic guessing anywhere in this tree. See its own README.
    contracts/               Conversation lifecycle (Started→Active→Ready→Completed/Cancelled/
                            Failed), INTENT + the required-fact schema per intent, Question/
                            ResolvedFact shapes, the Explainable Context Object shape,
                            dynamic-question-contract.js (Phase 4-7 — DynamicQuestion: priority +
                            dedup key, additive alongside Question, never a replacement for it)
    repository/              real, append-only Conversation store (in-memory — a session, not
                            durable V1 state)
    intent/                  intent-engine.js — PURE deterministic keyword/pattern detection
    questionnaire/           questionnaire-engine.js (PURE — missing-fact set difference) +
                            question-optimizer.js (resolves what it honestly can from Knowledge/
                            Organization Memory/Approved Profile Overrides/prior Conversations,
                            in that fixed order — never fabricates)
    context/                 context-builder.js — PURE composition into one Explainable Context
                            Object
    task-executor.js         the ONLY place a Conversation's facts reach a real domain service —
                            never a repository, never bypassed
    dynamic-conversation-engine.js  Phase 4-7, Part 4 — PURE. Prioritizes/dedups/confidence-scores
                            the SAME missing-Question output questionnaire-engine.js already
                            produces, enriched with reasoning/'s detected Knowledge Gaps. Zero
                            edits to questionnaire-engine.js/question-optimizer.js/
                            conversation-service.js — a strictly additive layer.
    services/                conversation-service.js — Conversation's ONE owner. create/
                            appendVersion have exactly one caller in the platform: this file.
                            dynamic-conversation-service.js (Phase 4-7) — a STATELESS enrichment
                            facade over conversation-service.js's own public API + reasoning/'s
                            Knowledge Gaps; holds no repository, creates no new Conversation state.

  reasoning/              Phase 4-7 — Organizational Reasoning Foundation. Answers the
                          "Diagnosis"/"Reasoning" gap SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md
                          (§3.1, §7) found had no home in this tree, and "Knowledge Gap Detection"
                          (a domain-wide concept, distinct from organizational-memory's ArchiveGap —
                          a missing NOR NUMBER). No AI, no LLM, deterministic. See its own README.
    contracts/               Problem, RuleApplication, Recommendation (never valid with zero
                            citations), KnowledgeGap (reuses knowledge/language/contracts/
                            question-tree-contract.js for `recommendedQuestion`)
    rule-applicability-engine.js  PURE — a rule/policy payload MAY carry `appliesWhen`; absent, it
                            is domain-wide. A convention layered on `payload`, not a schema change.
    conflict-detection-engine.js  reuses the EXISTING `conflicts_with` relationship type — no new
                            relationship type, no new storage.
    reasoning-engine.js       reason(problem) — cite-or-abstain: zero applicable Approved
                            knowledge returns NO_APPLICABLE_KNOWLEDGE, never a guess. Never writes
                            to the Knowledge Repository — a Recommendation is read-only advisory
                            output, same human-gated review workflow as any other KnowledgeItem.
    knowledge-gap-engine.js   detectKnowledgeGaps(domainType) — a domainType's own Approved
                            `kind:'ontology'` asset is the checklist; every mismatch is one Gap.
    services/                reasoning-service.js — the intended single import surface. Holds no
                            repository: a Recommendation/KnowledgeGap is computed fresh every call.
                            Phase 8-10 additive exports: planDiagnosis/generateHypotheses/
                            updateHypotheses (diagnostic-planning-engine.js/hypothesis-engine.js).

  problem-intelligence/   Phase 8-10 — Problem Intelligence Foundation. Turns one utterance into a
                          structured, canonical Problem (reuses reasoning/'s own Problem contract,
                          never redefines it). A DIFFERENT taxonomy from conversation/'s Intent — see
                          its own README's header for exactly why the two are related but never merged.
    contracts/               problem-category-contract.js — registry (mirrors kind-registry.js) of
                            Problem Categories, each with a defaultDomainType + fieldSchema
    problem-parser.js         PURE — identical scoring formula to intent-engine.js
    problem-context-builder.js  PURE — a SEPARATE composition from conversation/'s context-builder.js
                            (reusing it would create a backwards, upstream-depends-on-downstream edge)
    nor-numbering-context.js  Sprint 11.1 — getNumberingSuggestionForNor(), the one legal path from
                            NOR composition to organizational-memory/numbering-engine.js#
                            suggestNextNumber() (document-intelligence/ has no edge to
                            organizational-memory/ — see the dependency graph below). NOT part of
                            problem-context-builder.js — that function runs at classification time,
                            before any NOR Type is known; this is called lazily, only from
                            problem-solving-service.js#composeApprovedNor, only with domainType:'nor'
    services/                problem-classification-service.js — classifyProblem/classifyProblemWithContext

  problem-solving/        Phase 8-10, Part 4 — Integration. The ONE place the full pipeline (Problem
                          -> Problem Intelligence -> Diagnostic Planning -> Conversation -> Reasoning
                          -> NOR Composition) is threaded together — zero edits to any file any of
                          those five domains already owned. Honestly incomplete: only ONE of the two
                          worked problem categories ('business_trip') has a real downstream Conversation
                          Intent mapping today ('facility' does not — no FACILITY_ISSUE intent exists).
    services/                problem-solving-service.js — beginProblemSolving/composeApprovedNor

  recognition/            Phase 12.7 ("Apple Photos Learning") — Recognition. Derives
                          comparable Signatures from knowledge/, organizational-memory/,
                          and body/ records, compares them, groups matches into Clusters,
                          discovers cross-domain Relationships, and suggests
                          Classifications — as its own durable, versioned,
                          evidence-backed RecognitionRecords. A cross-cutting peer,
                          mirroring problem-solving/'s "sees everyone" precedent, NOT
                          nested inside knowledge/, organizational-memory/, or body/. See
                          its own README for the full rationale.
    contracts/               RecognitionScope (mirrors LearningScope in spirit/naming,
                            kept separate — see header) + RecognitionRecord (the ONE
                            envelope, RECORD_TYPE: signature/cluster/relationship/
                            classification/recommendation) + one contract per
                            RECORD_TYPE's payload shape. Reuses knowledge/contracts/
                            evidence-contract.js's Evidence directly (a precedented
                            pure-leaf reuse, same as identity-contract.js#nextVersion).
    registry/                recognition-signature-type-registry.js (wraps this
                            platform's existing, unrelated "fingerprint" mechanisms —
                            replaces none) + recognition-relationship-type-registry.js
                            (a FOURTH disambiguated "relationship" vocabulary, on
                            purpose — see contract header) + recognition-recommendation-
                            type-registry.js (Recognition is the first real producer of
                            knowledge/contracts/recommendation-evidence-contract.js's
                            RecommendationEvidence — a pre-built, previously-unproduced
                            shape, not a new competing contract)
    repository/              Memory + Null + registry, Knowledge/Body-style —
                            recognition-repository.js is the ONE facade
    classification/          Sprint 12.7.2 — classification-suggestion-engine.js,
                            the one genuinely NEW capability this phase adds
    similarity/               Sprint 12.7.3 — similarity-strategy-registry.js
                            generalizes 3 pre-existing single-domain
                            similarity/duplicate primitives, duplicating none
    clustering/               Sprint 12.7.4 — structural-clustering-engine.js
                            ("Structural," not "Semantic" — no NLP anywhere)
    graph/                    Sprint 12.7.5 — recognition-graph-engine.js (a
                            THIRD, now genuinely node-type-agnostic, occurrence
                            of getNeighbors/getSubgraph/getGraphStats) +
                            relationship-discovery-engine.js (emits only the
                            honest CO_CLUSTERED label, never a guessed richer one)
    services/                recognition-service.js — the ONE write owner
                            (recordObservation create-or-append reconciliation,
                            mirrors body/'s entity-service.js#observeEntity();
                            explainRecognition() — "Recognition Explanation," a
                            third, deliberately disambiguated explainability
                            surface alongside knowledge/explainability/ and
                            prediction/dispatch's own) + classification-/
                            similarity-/clustering-/graph-/learning-emission-
                            service.js (thin per-sprint delegation) + index.js
                            (namespaced barrel). Sprint 12.7.6's
                            learning-emission-service.js activates 2
                            Phase-12.6-dormant Learning Signal categories
                            (document_structure_recurrence/entity_relationship_
                            recurrence) — no bridge domain needed, unlike body/
                            (see js/v2/recognition/README.md §1)
    index.js                 dormant barrel — imports nothing yet, same as every
                            prior domain's own Foundation sprint. Verified,
                            not just claimed: scripts/recognition-ownership-
                            check.mjs confirms zero live callers and that all
                            26 files import cleanly in plain Node

  dormant-subsystems.js   the register of BUILT, TESTED, REACHABLE subsystems nothing
                          currently drives — a dormant subsystem must SAY SO wherever it is
                          displayed, never quietly render a zero (Phase 3, Part 8). reasoning/ and
                          conversation/'s Phase 4-7 additions are NOT listed here — unlike
                          correction-log/composer-timeline, no UI anywhere reads them (a misleading
                          zero requires a reader; this phase's brief was the engine, not the UI,
                          exactly conversation/'s own Phase 6 precedent, which needed no entry
                          either).

  index.js                dormant barrel — a structural no-op proving nothing auto-runs
```

## Dependency direction (binding)

```
ai-foundation/          ──depends on──>  knowledge/
knowledge/              ──never depends on──>  ai-foundation/ or any AI/LLM code
organizational-memory/  ──depends on──>  knowledge/ (read-only cross-reference)
knowledge/              ──never depends on──>  organizational-memory/
knowledge/              ──may depend on──>  learning/   (Phase 5 — Pattern Discovery,
                        Knowledge Approval; see learning/services/learning-service.js's header)
organizational-memory/  ──may depend on──>  learning/   (Phase 5 — Gap Resolution, Archive
                        supersession; same rationale)
learning/               ──never depends on──>  knowledge/ or organizational-memory/
                        (every cross-domain reference is a bare id string — sourceDocumentId,
                        affectedKnowledgeId — never an import; the UI, which may see every
                        domain, resolves them)
ui/                     ──depends on──>  knowledge/, organizational-memory/, learning/,
                        document-intelligence/
knowledge/ & organizational-memory/ & learning/  ──never depend on──>  ui/
knowledge/              ──depends on──>  V1, read-only, through *-store.js getters
V1 (js/app.js, any *-store.js, any engine)  ──never depends on──>  js/v2/*
conversation/           ──depends on──>  knowledge/, organizational-memory/, learning/,
                        document-intelligence/ (Phase 6 — read-only, through services/pure
                        engines only, never a repository)
knowledge/ & organizational-memory/ & learning/ & document-intelligence/  ──never depend
                        on──>  conversation/
reasoning/              ──depends on──>  knowledge/ (Phase 4-7, read-only, through services/
                        only — never a repository, never an engine that itself owns writes)
knowledge/ & organizational-memory/ & learning/ & document-intelligence/  ──never depend
                        on──>  reasoning/
conversation/           ──depends on──>  reasoning/ (Phase 4-7 — dynamic-conversation-
                        engine.js / dynamic-conversation-service.js is reasoning/'s one real
                        caller so far)
reasoning/              ──never depends on──>  conversation/ (reasoning/ is the more upstream
                        of the two — same one-way rule as knowledge/ never depending on
                        ai-foundation/)
ui/                     ──may depend on──>  conversation/ (not exercised in Phase 6 — no
                        UI caller exists yet, same "architecture-only" precedent as Phase 8's
                        NOR Generator contract)
problem-intelligence/   ──depends on──>  knowledge/, organizational-memory/ (read-only, services
                        only) and reasoning/'s Problem CONTRACT ONLY (Phase 8-10 — never a
                        reasoning/ engine; no reasoning/ file ever imports problem-intelligence/ back)
knowledge/ & organizational-memory/ & learning/ & document-intelligence/ & conversation/ &
                        reasoning/  ──never depend on──>  problem-intelligence/
problem-solving/        ──depends on──>  problem-intelligence/, reasoning/, conversation/,
                        document-intelligence/nor/ (Phase 8-10, Part 4 — the one layer allowed
                        to see all four, same role js/v2/README.md already reserves for ui/)
problem-intelligence/ & reasoning/ & conversation/ & document-intelligence/  ──never depend
                        on──>  problem-solving/
body/                   ──depends on──>  V1, read-only, through *-store.js getters (same
                        rule as knowledge/), plus two precedented pure-leaf contract
                        reuses (knowledge/contracts/identity-contract.js#nextVersion,
                        knowledge/observability/contracts/warning-contract.js — Phase
                        12.5, allowlisted by name in scripts/body-ownership-check.mjs,
                        same as learning/'s identical reuse)
body/                   ──never depends on──>  any ENGINE or SERVICE in knowledge/,
                        organizational-memory/, learning/, conversation/, reasoning/,
                        problem-intelligence/, problem-solving/, document-intelligence/,
                        ui/, ai-foundation/ (Phase 12.5 — body/ is a PEER of knowledge/,
                        not downstream of it)
conversation/ & reasoning/ & problem-intelligence/  ──may depend on──>  body/ (read-only,
                        services-only, optional, same relationship they already have to
                        knowledge/ — Phase 12.5, NOT exercised yet, no live caller exists)
knowledge/ & organizational-memory/ & learning/ & problem-solving/ & document-intelligence/
                        & ui/ & ai-foundation/  ──never depend on──>  body/
                        (Phase 12.6 fix — conversation/, reasoning/, problem-intelligence/
                        were previously listed in BOTH this line and the "may depend on"
                        line above, a direct self-contradiction introduced when Phase
                        12.5's graph lines were added; js/v2/body/README.md's own
                        dependency section was always the correct, more specific version
                        — this line is now consistent with it)
learning-bridge/        ──depends on──>  body/ (Phase 12.6 — read-only:
                        body/repository/body-event-repository.js's list()/getForEntity()
                        only, never append()) and learning/ (via learning/services/
                        learning-signal-service.js#emitLearningSignal() only, never
                        learning-repository.js directly) — mirrors problem-solving/'s
                        own precedent as "the ONE layer allowed to see" two domains that
                        may never see each other (body/ and learning/ are mutually
                        forbidden from importing one another's engines)
body/ & learning/       ──never depend on──>  learning-bridge/
recognition/            ──depends on──>  knowledge/, organizational-memory/, body/,
                        document-intelligence/ (Phase 12.7 — ALL read-only,
                        services-only, never a repository, never an engine that
                        itself owns writes — same rule reasoning/ already follows
                        toward knowledge/)
recognition/            ──depends on──>  learning/ (Phase 12.7 — may both read AND
                        call learning/services/learning-signal-service.js#
                        emitLearningSignal() as a normal producer, the SAME legal
                        status knowledge/ and organizational-memory/ already have
                        toward learning/ — no learning-bridge/-style intermediary
                        needed, because recognition/ carries none of body/'s "must
                        stay a pure zero-write peer" constraint that made a bridge
                        necessary there)
knowledge/ & organizational-memory/ & body/ & learning/ & document-intelligence/
                        ──never depend on──>  recognition/ (Phase 12.7 —
                        recognition/ is purely downstream, the same posture
                        problem-solving/ and ui/ already hold, never a dependency
                        of anything it reads)
conversation/ & reasoning/ & problem-intelligence/  ──may depend on──>
                        recognition/ (Phase 12.7 — read-only, services-only,
                        optional, NOT exercised yet, same "structurally complete,
                        zero live callers" precedent body/ and learning-bridge/
                        both shipped under)
ui/                     ──may depend on──>  recognition/ (Phase 12.7 — not
                        exercised this phase — no Recognition Center/UI panel
                        ships)
```

This is a STRICT EXTENSION of the graph, not a revision of it — no edge that
existed before Phase 5 changed direction. `learning/` sits below both
`knowledge/` and `organizational-memory/` precisely because a correction can
originate in either one, and making Learning depend on either would either
recreate the forbidden `knowledge/` ↔ `organizational-memory/` cycle or force
an arbitrary choice of which domain Learning "belongs" to when it genuinely
belongs to neither.

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
- No document is PARSED beyond a structural ViewModel fingerprint.
  Rendering an APPROVED ComposerDocument to PDF/Word IS now real (Phase
  10, Sprint 10.6 — `ui/review-workspace.js`'s "Unduh PDF"/"Unduh Word",
  via `js/docs/templates/composer-document.js` + `js/docs/docx-exporter.js`)
  — a generic export of the composed draft's real field/value content,
  deliberately NOT an attempt at the official PBSI NOR letterhead format
  (see that template's own header for why).
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
- `reasoning/` (Phase 4-7) has no UI caller — `conversation/dynamic-conversation-service.js`
  is its one real caller so far, and that itself has no UI mount yet either.
- A `reasoning/` Recommendation is never recorded as a `LearningEvent` — unlike Knowledge
  Approval (`learning-service.js#recordKnowledgeEvolution`), that wiring is explicitly
  deferred (Phase 4-7's own constraints: "No Learning Loop implementation").
- `conversation/` (Phase 6) has no UI caller — no chat surface exists yet.
  `UPLOAD_KNOWLEDGE` and archiving a genuinely NEW document are honestly
  reported as `REQUIRES_ATTACHMENT` (no file-upload/Storage mechanism exists
  anywhere in this codebase, see above); `CREATE_NOR` dispatches to the real
  NOR Generator's structural suggestions only, never business content. See
  `conversation/README.md`.
- `problem-intelligence/` and `problem-solving/` gained their first REAL UI
  caller in Phase 10.5 (`sarpras-intelligence-center.js`'s Home entry
  point). `reasoning/`'s Phase 8-10 additions (Diagnostic Planning,
  Hypothesis) are reached transitively through that same path now, but
  still have no UI surface of their own beyond what Home's Problem
  Conversation / Developer Pipeline Viewer render.
- A `facility`-category Problem gets a complete, real `DiagnosticPlan` but
  currently has NO downstream platform action — no `FACILITY_ISSUE` intent
  is registered in `conversation/contracts/intent-contract.js`'s closed
  enum, and extending it was judged out of scope for Phase 8-10 (see
  `problem-solving/services/problem-solving-service.js`'s own header).
  Only `business_trip` (mapped to the existing `CREATE_NOR` intent) has a
  real path all the way to NOR Composition today.
- `nor-composer.js` never calls `buildNorViewModel`, `js/docs/doc-engine.js`,
  or any renderer, and produces no PDF/HTML/Excel — see that file's own
  header for the three prior decisions this respects. "Final NOR" in this
  tree means a complete, explainable `ComposerDocument`, never an
  auto-rendered artifact a human never reviewed.

## Future evolution (next phase — NOT engineering)

Per the frozen roadmap, engineering work stops at RC1. What follows is
content authoring against the platform built here: Organizational Knowledge,
Bootstrap Dataset, Official NOR Archive, and Continuous Learning. None of
that content is created by this tree.
