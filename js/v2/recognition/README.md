# recognition/ — Recognition (V2, Phase 12.7 "Apple Photos Learning")

## What this is

Every existing V2 domain accumulates real, structured facts —
KnowledgeItems, ArchiveRecords, Entities, LearningEvents — but nothing in
this platform yet notices that many of them look alike, repeat, or belong
together. `recognition/` is the layer that does: it derives comparable
**Signatures** from documents/entities already living in `knowledge/`,
`organizational-memory/`, and `body/`, compares them, groups what matches
into **Clusters**, discovers cross-domain **Relationships**, and suggests
**Classifications** — all as its own durable, versioned, evidence-backed
**RecognitionRecord**s, never as a silent rewrite of any upstream domain's
own data.

## §1 — Recognition is editorial, but cross-domain

Every existing V2 domain is either purely editorial and single-owner
(Knowledge, Organizational Memory, Learning — a fact is *born* here and
doesn't exist until approved) or a pure, zero-write read model (Body — an
Entity is never born here, only re-described). `recognition/` is neither
in isolation: its outputs are durable, versioned, evidence-carrying facts
exactly like Knowledge's (editorial), but producing them requires reading
across five domains it does not own — the same shape `problem-solving/`
already solved for reasoning ("the ONE layer allowed to see all… same role
`js/v2/README.md` already reserves for `ui/`").

Consequence: `recognition/` depends on `knowledge/`, `organizational-
memory/`, `body/`, and `document-intelligence/` (all read-only, services-
only — never a repository, never an engine that itself owns writes), and
may both read AND write into `learning/` (calling
`learning/services/learning-signal-service.js#emitLearningSignal()` as a
normal producer — the same legal status `knowledge/` and
`organizational-memory/` already have, no bridge domain required, because
`recognition/` carries none of `body/`'s "must stay a pure zero-write
peer" constraint that made `learning-bridge/` necessary there). Nothing
those five domains own may ever depend back on `recognition/` — the same
posture `problem-solving/` and `ui/` already hold toward what they read.

A Recognition finding is never a Decision. It answers "these things
*appear* related" — never "therefore do X." Promoting a finding into
something the platform treats as current, actionable truth (a `kind:
'rule'` KnowledgeItem, a corrected classification, a confirmed
relationship) still goes through Knowledge's EXISTING human-gated review
workflow. `recognition/` has no `lifecycle/` directory and invents no
second human-gate — the same restraint `body/` already established for
Entities, applied here for the same reason: this platform's human-owns-
final-authority rule is structural, not a convention any one domain gets
to relax for its own convenience.

## Layout

```
recognition/
  contracts/               vocabulary, no logic
    recognition-scope-contract.js         "what is this about" — mirrors
                                           learning/'s LearningScope in
                                           spirit and field-naming, kept a
                                           separate contract on purpose
                                           (see its own header)
    recognition-record-contract.js        the ONE envelope every finding
                                           is stored as (RECORD_TYPE:
                                           signature/cluster/relationship/
                                           classification/recommendation)
                                           — mirrors knowledge-item-
                                           contract.js's role
    recognition-signature-contract.js     RecognitionSignaturePayload —
                                           WRAPS this platform's existing,
                                           unrelated "fingerprint"
                                           mechanisms, replaces none
    recognition-confidence-contract.js    RecognitionConfidence — third
                                           instance of the Knowledge ->
                                           Learning -> Recognition
                                           confidence-formula-reuse pattern
    recognition-cluster-contract.js       RecognitionClusterPayload —
                                           membership as bare scopeKey()
                                           strings, never resolved records
    recognition-relationship-contract.js  RecognitionRelationshipPayload —
                                           the FOURTH disambiguated
                                           "relationship" vocabulary in
                                           this platform, on purpose
    recognition-classification-contract.js RecognitionClassificationPayload
                                           — draws only from ALREADY
                                           registered domainType/kind/
                                           NOR-Type vocabulary, invents no
                                           new category

  registry/                 Map-based, register/has/get/list/reset — same
                            shape as knowledge/registry/kind-registry.js
    recognition-signature-type-registry.js
    recognition-relationship-type-registry.js
    recognition-recommendation-type-registry.js

  repository/                Memory + Null + registry, Knowledge/Body-style
                            — Recognition IS a plausible future swappable-
                            backend candidate, same reasoning body/'s
                            Entity repository gives for itself
    contracts/repository-contract.js
    implementations/{memory,null}-repository.js
    repository-registry.js
    recognition-repository.js   the ONE facade every module calls through

  classification/            Sprint 12.7.2 — Autonomous Classification, the
                            one genuinely NEW capability this phase adds
                            (confirmed absent elsewhere by direct audit)
    classification-suggestion-engine.js   pure, cite-or-abstain — suggests
                                          domainType/kind/NOR-Type from
                                          ALREADY-registered vocabulary only

  similarity/                Sprint 12.7.3 — generalizes 3 pre-existing
                            single-domain similarity/duplicate primitives
                            into one dispatchable registry, duplicating
                            none of them
    similarity-strategy-registry.js   'exact-hash' / 'field-overlap'
                                      (delegates to knowledge/services/
                                      similarity-service.js, added this
                                      sprint) / 'structural-shape' /
                                      'metadata-shape' (both a shared pure
                                      Jaccard-over-sets primitive)

  clustering/                Sprint 12.7.4 — "Structural Clustering"
                            (renamed from the brief's "Semantic
                            Clustering" — no NLP anywhere in this tree)
    structural-clustering-engine.js   single-linkage over similarity/'s
                                      dispatch, mirrors (does not import)
                                      knowledge/machine-learning/
                                      clustering-engine.js's algorithm shape

  graph/                     Sprint 12.7.5 — Relationship Discovery
    relationship-discovery-engine.js  discovers ONLY the honest
                                      'CO_CLUSTERED' relationship from real
                                      cluster co-membership — never a
                                      richer, unverified label
    recognition-graph-engine.js       getNeighbors/getSubgraph/getGraphStats
                                      — a THIRD occurrence of this exact
                                      shape, built genuinely node-type-
                                      agnostic (the trigger to generalize,
                                      per this platform's own "3rd copy
                                      forces promotion" discipline) — reads
                                      Recognition's OWN relationship
                                      records, simpler than this phase's
                                      original "callback-injected edge
                                      source" sketch (a disclosed, small
                                      deviation — see the phase report)

  registry/                 Map-based, register/has/get/list/reset — same
                            shape as knowledge/registry/kind-registry.js
    recognition-signature-type-registry.js
    recognition-relationship-type-registry.js       (6 entries: 5 original
                            + Phase 12.7.5's additive 'CO_CLUSTERED')
    recognition-recommendation-type-registry.js

  repository/                Memory + Null + registry, Knowledge/Body-style
                            — Recognition IS a plausible future swappable-
                            backend candidate, same reasoning body/'s
                            Entity repository gives for itself
    contracts/repository-contract.js
    implementations/{memory,null}-repository.js
    repository-registry.js
    recognition-repository.js   the ONE facade every module calls through

  services/
    recognition-service.js       the ONE write owner — recordObservation()
                                 (create-or-append reconciliation, mirrors
                                 entity-service.js#observeEntity()),
                                 read passthroughs, explainRecognition()
                                 ("Recognition Explanation" — cite-or-abstain)
    classification-service.js    thin: suggestClassification() -> persist
    similarity-service.js        pure delegation to similarity/
    clustering-service.js        thin: clusterScopes() -> persist (first
                                 real producer of Evidence's STATISTIC kind)
    graph-service.js             thin: discoverRelationshipsFromClusters()
                                 -> persist (first real producer of
                                 Evidence's RELATIONSHIP kind), plus a pure
                                 re-export of graph traversal
    learning-emission-service.js  Sprint 12.7.6 — emitRecognitionLearningSignal()
                                 activates 2 Phase-12.6-dormant signal
                                 categories (document_structure_recurrence /
                                 entity_relationship_recurrence); real,
                                 tested, NOT auto-invoked from clustering-
                                 /graph-service.js (a deliberate, separate
                                 decision — see Open Question 2)
    index.js                     namespaced barrel — records / classification
                                 / similarity / clustering / graph / learning

  index.js                  dormant barrel — imports nothing yet
```

## Dependency direction (binding, extends `js/v2/README.md`'s graph)

```
recognition/            ──depends on──>  knowledge/, organizational-memory/,
                        body/, document-intelligence/ (ALL read-only,
                        services-only)
recognition/            ──depends on──>  learning/ (read AND call
                        emitLearningSignal() as a normal producer — no
                        bridge needed, unlike body/)
knowledge/ & organizational-memory/ & body/ & learning/ &
                        document-intelligence/  ──never depend on──>
                        recognition/ (purely downstream, same posture
                        problem-solving/ and ui/ already hold)
conversation/ & reasoning/ & problem-intelligence/  ──may depend on──>
                        recognition/ (read-only, services-only, optional
                        — NOT exercised this phase, same "structurally
                        complete, zero live callers" precedent body/ and
                        learning-bridge/ both shipped under)
ui/                     ──may depend on──>  recognition/ (not exercised
                        this phase — no Recognition Center/UI panel ships
                        in Phase 12.7)
```

## What this is NOT (honest scope, end of Phase 12.7)

- **No cross-domain read into `organizational-memory/` or `body/` has
  actually happened yet.** The dependency edge is legal and real
  (Part 2 of `scripts/recognition-ownership-check.mjs` proves no
  unlisted cross-domain import exists), but every sprint this phase
  shipped exercised it only against synthetic fixtures — no real
  KnowledgeItem, ArchiveRecord, or Entity has ever actually been fed
  through `classification-suggestion-engine.js`, `similarity-strategy-
  registry.js`, `structural-clustering-engine.js`, or `recognition-
  graph-engine.js`. Assembling real signals/signatures from real upstream
  data (e.g., wiring `metadata-inference-engine.js`'s real filename
  tokens into a `ClassificationSignal`) is a real, concrete, named future
  extension point in every sprint's own engine header — deliberately not
  attempted here, the same "structurally complete, wiring deferred"
  precedent every phase since Body has shipped under.
- **No UI, no live caller, anywhere.** `recognition/index.js` re-exports
  nothing; `services/index.js` is reachable only from this domain's own
  check scripts (verified behaviourally, not just claimed — see
  `scripts/recognition-ownership-check.mjs` Part 3/4).
  `emitRecognitionLearningSignal()` (Sprint 12.7.6) is real and tested
  but is NOT auto-invoked from `clustering-service.js`/`graph-service.js`
  — whether it should be is Open Question 2 in this phase's own report,
  not decided by default.
- **No LLM/AI/NLP anywhere in this tree**, now or ever — "Structural
  Clustering" (Sprint 12.7.4, renamed from the original brief's "Semantic
  Clustering") compares registered, structured signatures, never natural-
  language meaning.
- **Relationship Discovery only ever assigns the honest `CO_CLUSTERED`
  label**, never one of the five richer, semantically-named types
  (`SAME_VENDOR`/`SAME_TEMPLATE`/`SAME_DEPARTMENT`/`SAME_WORKFLOW`/
  `RECURRING_PARTICIPANT`) — those remain registered vocabulary for a
  future, more-evidenced producer (or a human's confirmation) to assign,
  never guessed automatically. See `graph/relationship-discovery-
  engine.js`'s own header for why.
- **The two pre-existing, node-type-specific graph engines
  (`knowledge/dependency-graph/knowledge-graph-engine.js` and
  `body/graph/entity-relationship-graph-engine.js`) were NOT migrated
  onto `recognition/graph/recognition-graph-engine.js`.** Building the
  third occurrence genuinely node-type-agnostic was this phase's own
  scope; retiring the first two onto it is a real, separate,
  separately-approved future opportunity, not attempted here.
- **A known, pre-existing, disclosed (not fixed) finding**:
  `learning/services/learning-service.js#record()`'s synchronous return
  value is stale on `supersedesId` immediately after a supersession (the
  correct value is written to the repository a moment later, and is
  correct on any subsequent read) — discovered by Sprint 12.7.6's own
  tests, affecting all 15 producers now calling `emitLearningSignal`/
  `recordLearningEvent`, not fixed here per this phase's own standing
  "zero edits to `learning-service.js`" discipline (mirrored from Phase
  12.6). See `scripts/recognition-learning-emission-check.mjs`.
