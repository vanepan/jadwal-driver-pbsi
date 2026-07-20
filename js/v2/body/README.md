# body/ — Body Intelligence (V2, Phase 12.5)

## What this is

Every other V2 domain (`knowledge/`, `organizational-memory/`, `learning/`)
reasons from **documents and facts about documents**. `body/` gives the
platform a notion of the organization's actual operational state — a
specific Vehicle, Driver, or Assignment, right now — represented as an
`Entity`: identity, attributes, observed state, owner, capabilities,
relationships, events, health, history, confidence, observability,
visibility, and AI-context tags.

## §1 — Body is a read model, not a system of record

Every existing V2 domain is **editorial**: a KnowledgeItem, an
ArchiveRecord, a LearningEvent are all *born* inside V2 and don't fully
exist until a human approves them (`LIFECYCLE_STATE`, `HUMAN_GATED_STATES`,
`ReviewDecision`). An `Entity` is different in kind: a Vehicle, Driver, or
Assignment already has its own identity, its own store, and its own
authority in V1 (`js/vehicles-store.js` stays the only writer of a
vehicle, forever). Body **never originates truth** — it only re-describes
truth that already exists elsewhere, refreshed by reading it.

Consequence: `body/` has **no `lifecycle/` directory and no transition-
gating machinery**. Reusing Knowledge's `canTransition`/
`requestTransition`/`HUMAN_GATED_STATES` vocabulary would imply this
platform can move a Vehicle from one state to another, or that a human
review action *on this platform* is what makes a Vehicle's status real —
both false, and both a direct violation of CLAUDE.md's "AI is never the
source of truth or final decision-maker." See
`contracts/entity-state-contract.js`'s header for the full walk-through of
which of the brief's requested state values ship now vs. are deliberately
deferred.

An Entity's `observedState` is derived, never platform-gated — see
`contracts/entity-state-contract.js`. Body has no write path into V1, ever.

## Layout

```
body/
  contracts/          Entity, EntityState, Sensor, EntityRelationship,
                       BodyEvent, EntityHealthReport shapes — vocabulary,
                       no logic. identity-contract.js reuses
                       knowledge/contracts/identity-contract.js#nextVersion
                       (a precedented pure-leaf reuse, not a domain
                       dependency — allowlisted by name in
                       scripts/body-ownership-check.mjs).
  registry/            entity-type-registry.js (19 registered entityTypes)
                       + sensor-registry.js (16 placeholder sensors
                       bootstrapped; the 3 pilot sensors self-register
                       outside it — dormancy-by-omission, mirrors
                       knowledge/registry/connector-registry.js exactly).
  sensors/             placeholder-sensor.js (factory for the 16 inactive
                       types) + vehicle-sensor.js / driver-sensor.js /
                       assignment-sensor.js (Phase 12.5.3 — the 3 real,
                       V1-reading sensors) + index.js (opt-in barrel;
                       body/index.js never imports it).
  repository/          entity-repository.js (Memory+Null+registry,
                       Knowledge-style — Entities are the one Body concept
                       where a future swappable backend is plausible) +
                       relationship-repository.js + body-event-repository.js
                       (direct-function, Learning-style — see their own
                       headers for why).
  graph/               entity-relationship-graph-engine.js — getNeighbors/
                       getSubgraph/getGraphStats, a functional lift of
                       knowledge/dependency-graph/knowledge-graph-engine.js's
                       shape, disambiguated by data source (edges are
                       DERIVED from sensor-read V1 FK fields, never
                       hand-authored).
  health/              entity-health-engine.js + health/registry/
                       health-source-registry.js — passes through a real
                       V1-computed score where one exists (e.g. Vehicle ->
                       js/services/vehicle-asset-service.js), never
                       invents a new business-meaningful score.
  services/            entity-service.js (the ONE owner of Entity writes),
                       body-sensing-service.js (the orchestrator —
                       Sensor -> Entity/Relationship/Event, the one
                       legitimate writer of relationship-repository.js and
                       body-event-repository.js), entity-graph-service.js
                       and entity-health-service.js (thin delegation over
                       their engines, mirrors knowledge-graph-service.js),
                       index.js (namespaced barrel).
  context/             body-context-builder.js — ships complete, zero
                       callers outside its own tests (Phase 12.5.6).
  index.js             dormant barrel — mirrors js/v2/index.js exactly.
```

## Dependency direction (binding, extends js/v2/README.md's graph)

```
body/                    ──depends on──>  V1 (read-only, through *-store.js
                          getters — same pattern knowledge/ and
                          organizational-memory/ already use)
body/                    ──may reuse──>   pure leaf contracts already
                          precedented as fair game (knowledge/contracts/
                          identity-contract.js#nextVersion,
                          knowledge/observability/contracts/warning-contract.js)
body/                    ──never depends on──>  any ENGINE or SERVICE in
                          knowledge/, organizational-memory/, learning/,
                          conversation/, reasoning/, problem-intelligence/,
                          problem-solving/, document-intelligence/, ui/,
                          ai-foundation/
conversation/, reasoning/, problem-intelligence/  ──may depend on──>  body/
                          (read-only, services-only, optional — same
                          relationship they already have to knowledge/;
                          NOT exercised in Phase 12.5)
knowledge/, organizational-memory/, learning/, ...  ──never depend on──>  body/
```

Two of the brief's requested entity types are **Knowledge and Policy**.
Sensing `knowledge/`'s own KnowledgeItems as Body Entities is tempting but
would break the peer/no-engine-dependency boundary above and create two
parallel representations of the same object. Both stay registered
vocabulary with an inactive placeholder sensor indefinitely, pending a
dedicated future decision — not resolved by default in this phase.

## What this tree does NOT do (true as of Phase 12.5)

- No V1 changes, of any kind, anywhere.
- No new RTDB writes or schema — `body/` never becomes a system of record.
- No UI. No live wiring into `conversation/context/context-builder.js` or
  `reasoning/reasoning-engine.js` — `body-context-builder.js` ships
  structurally complete, with zero callers outside its own tests, same bar
  `js/v2/index.js` sets for the whole platform.
- No LLM/AI calls anywhere in this tree.
- Only 3 of the 19 registered entityTypes (`vehicle`, `driver`,
  `assignment`) have a real sensor. The other 16 are honest,
  `NOT_IMPLEMENTED` placeholders — several have no V1 store to sense at
  all yet; see `registry/sensor-registry.js`'s bootstrap table for exactly
  which and why.
- Body facts are never a citation source for `reasoning/reasoning-engine.js#reason()`.
  `reason()`'s cite-or-abstain machinery exists to keep a Recommendation
  traceable to a **normative** statement a human approved (`kind: rule|
  policy`, `APPROVED` only). A live `observedState` is **descriptive**
  ("this vehicle is currently in maintenance"), not normative ("this
  vehicle may not be dispatched"). Letting `reason()` cite a raw Body fact
  would let the AI convert an *is* into an *ought* without a human ever
  approving that inference — the "never invent business rules" failure
  mode. If a rule like that should exist, the existing path is unchanged:
  someone authors it as a `kind:'rule'` KnowledgeItem, it goes through
  review, `reason()` cites *that* — never the live fact directly.
