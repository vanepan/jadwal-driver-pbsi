# Phase 12 — Sprint 12.5: Body Intelligence

**Status:** Implemented, regression-tested, NOT committed.
**Version:** unchanged (`1.27.1`).
**Builds on:** the full `js/v2/` platform (Knowledge, Organizational Memory,
Learning, Conversation, Reasoning, Problem Intelligence/Solving) as a
**peer**, not a downstream consumer — see "Architecture decisions" below.
**Scope:** one new, fully dormant sibling domain, `js/v2/body/`. Zero
changes to any existing file's *behavior* (one doc-only edit to
`js/v2/README.md`). No V1 changes. No UI. No live wiring into
conversation/reasoning. No LLM/AI calls anywhere in this tree.

---

## Why this sprint

Every domain in `js/v2/` built so far reasons from **documents and facts
about documents** — a KnowledgeItem, an ArchiveRecord, a LearningEvent. None
of it has any notion of the organization's actual operational state: a
specific Vehicle, Driver, or Assignment, right now. The brief for this phase
asked for a "body" — every operational object represented as a living
entity (identity, state, relationships, events, health, history) instead of
an isolated database record, so AI reasoning can eventually draw on "what
exists and what state it's in," not just "what documents say."

An architectural review (produced and approved before any code was written
— see the approved plan) reverse-engineered the existing platform first:
its repeated contract/registry/repository/services DNA, the real V1 data
model behind Vehicle/Driver/Assignment, the current context/reasoning
pipeline, and prior architecture-assessment docs. Two honesty corrections
came out of that review and are worth restating here: "Phase 11 Executive
Intelligence" and "Phase 12.4 Organizational Composition Engine," as named
in the original brief, are not distinct subsystems — they were retrospective
labels on work that already has its own real names (Sprints 11.1–11.12, and
the Document Design System, Sprints 12.1–12.3). Phase 12.5 extends the real
Phase 12 numbering cleanly; the codebase already has precedent for
fractional sub-phases (4-7, 8-10, 10.5, 11.1, 11.4-11.8).

---

## The one load-bearing design decision

Every existing V2 domain is **editorial** — a KnowledgeItem, an
ArchiveRecord, a LearningEvent are all *born* inside V2 and don't fully
exist until a human approves them (`LIFECYCLE_STATE`, `HUMAN_GATED_STATES`,
`ReviewDecision`). An `Entity` is different in kind: a Vehicle, Driver, or
Assignment already has its own identity, its own store, and its own
authority in V1 (`js/vehicles-store.js` stays the only writer of a vehicle,
forever). **Body never originates truth — it only re-describes truth that
already exists elsewhere, refreshed by reading it.**

Consequence, applied everywhere in this tree: `body/` has **no
`lifecycle/` directory and no transition-gating machinery**. An Entity's
`observedState` is *derived* from a pure per-sensor lookup table, never
platform-gated — there is no `canTransition`, no `HUMAN_GATED_STATES`
equivalent, no `ReviewDecision`. The only "transition" that exists is a
sensor re-reading V1 and appending a new observed snapshot — an ordinary
repository append, never a gated request. See
`js/v2/body/contracts/entity-state-contract.js`'s header for the full
value-by-value argument (which of the brief's 11 requested states ship now
vs. are deliberately deferred, and why).

---

## What was built, by sprint

### 12.5.1 — Contracts + Registries

The vocabulary layer, zero V1 imports (grep-verified). `Entity`,
`EntityState` (5-value MVP enum: active/inactive/pending/archived/unknown —
deferred: deprecated/current/past/future/predicted/desired/emergency, each
with a documented reason), `Sensor`, `EntityRelationship`, `BodyEvent`,
`EntityHealthReport` contracts — each with a `SCHEMA` const, a frozen
fields/enum list, and a pure `is<Thing>()` structural validator, matching
`knowledge/contracts/knowledge-item-contract.js`'s exact style.
`entity-type-registry.js` registers all 19 entity types named in the brief
(Vehicle, Driver, Assignment, Building, Room, Equipment, Budget, NOR, Petty
Cash, Employee, Vendor, Inventory, Maintenance, Knowledge, Policy, Workflow,
Approval, Meeting, Organization Unit) as vocabulary — registering vocabulary
never implies a real sensor exists. `sensor-registry.js` bootstraps the 16
placeholder sensors (mirrors `knowledge/registry/connector-registry.js`
exactly, including its dormancy split); the 3 pilot sensors are deliberately
excluded until Sprint 12.5.3. `body/index.js` is a dormant barrel, byte-for-
byte in spirit with `js/v2/index.js` — imports nothing.

### 12.5.2 — Repositories

`entity-repository.js` (Memory + Null + registry, Knowledge-style —
Entities are the one Body concept a future swappable backend is plausible
for) enforces append-only versioning and Entity structural validity, with
**no lifecycle-transition validation** (there is nothing to validate — see
above). Trimmed from Knowledge's repository interface: no `rollback`, no
`getPendingReview`, no `search` — Knowledge-specific human-gate concepts
Body has no equivalent of. `relationship-repository.js` and
`body-event-repository.js` are Learning-style (direct functions, no Null
variant, no swappable-backend registry) — both are derived organizational
telemetry, reconstructible by re-sensing, never the durable record of
anything themselves (the real record is the V1 row). `entity-service.js` is
the ONE owner of Entity writes (`observeEntity()` — create-or-append
reconciliation), mirroring `knowledge-service.js`'s role.

### 12.5.3 — The 3 real pilot sensors + sensing orchestration

Vehicle, Driver, Assignment — chosen because this trio is the only cluster
where each store already has a small closed status enum, a real FK
relationship exists between them (Assignment → Vehicle, Assignment →
Driver), and the read-only-V1-import pattern is already precedented
(`knowledge/connectors/nor-connector.js`). Every other entity type stays an
honest `NOT_IMPLEMENTED` placeholder — several have no V1 store at all
(Vendor, Inventory, standalone Meeting/Workflow/Approval/Organization Unit);
Building/Room/Equipment are only static seeded taxonomies today.

**A real, non-obvious engineering finding drove this sprint's structure:**
`js/vehicles-store.js`, `js/drivers-store.js`, and `js/assignments.js` all
transitively import `js/firebase.js`, which imports the Firebase SDK from an
`https://` CDN URL — confirmed unresolvable by Node's ESM loader
(`ERR_UNSUPPORTED_ESM_URL_SCHEME`) by direct test. This means **any file
that imports one of those stores at module scope cannot be imported by a
plain Node check script at all**, regardless of whether the Firebase-
touching function is ever called. Each sensor was therefore split in two,
mirroring the pure/impure split `js/services/vehicle-asset-service.js`
already draws for itself:
- `<type>-mapping.js` — PURE derivation logic (`deriveVehicleState`,
  `toVehicleEntity`, etc.), zero V1 dependency, fully Node-testable.
- `<type>-sensor.js` — thin orchestration: imports the real V1 store +
  the mapping file, assembles `sense()`, self-registers (dormancy-by-
  omission, outside `sensor-registry.js`'s bootstrap, mirroring
  `nor-connector.js`'s precedent exactly).

Relationship derivation lives on the *referencing* entity's sensor
(`assignment-mapping.js`), never a separate cross-cutting engine — the
Assignment sensor already resolves `driver`/`vehicle` name strings to real
entity ids (via the existing `findDriverByLegacyName`/`getVehicleByName`
V1 helpers, no new resolution logic invented) while building its own
attributes, and already knows the FK field name `EntityRelationship`'s
`derivedFrom` needs.

`body-sensing-service.js` orchestrates Sensor → Entity/Relationship/Event.
It deliberately imports **no sensor file** — it looks a sensor up by id via
the registry at call time, so the orchestrator itself has zero V1/Firebase
dependency and is fully Node-tested against a fake sensor. It records
`ENTITY_OBSERVED` on first observation, `STATE_CHANGED` only when
`observedState` actually differs from the prior version, and nothing for a
genuine no-op re-observation (idempotent-when-unchanged, the same discipline
`learning-service.js#recordCorrection` established for this platform).
Relationship ids are deterministic per (from, to, type), so re-deriving a
still-true edge is a no-op via `DUPLICATE_ID`, never an error. A sensor's
honest `NOT_IMPLEMENTED` failure (any placeholder) becomes a real,
observable `SENSE_FAILED` `BodyEvent` — never silently dropped.

### 12.5.4 — Entity Relationship Graph

`entity-relationship-graph-engine.js` — a functional lift of
`knowledge/dependency-graph/knowledge-graph-engine.js`'s exact shape
(`getNeighbors`/`getSubgraph`/`getGraphStats`), disambiguated by both name
and data source from that engine: Knowledge's graph is over *facts*
(hand-curated, human-reviewable `kind:'relationship'` KnowledgeItems);
Body's is over *operational objects*, and every edge is **derived
automatically** from a sensor-read V1 FK field, never hand-authored. No
unscoped/whole-graph traversal entry point exists — `getSubgraph` always
requires a starting entity and a bounded `maxHops` (default 2).

### 12.5.5 — Entity Health

`entity-health-engine.js` passes through a real V1-computed score wherever
one exists, and only ever computes a generic observability (freshness +
completeness) score otherwise — the one score Body is allowed to invent,
because it's about data quality, never business meaning.
`health-source-registry.js` registers Vehicle as `SOURCE_PASSTHROUGH`,
wired to `js/services/vehicle-asset-service.js#normalizeVehicleAsset()`
(confirmed genuinely Firebase-free — it takes a vehicle object as a
parameter rather than reading the store — so, unlike a sensor, this
registration needed no dormancy split). Driver and Assignment are
deliberately **not** registered: `js/services/unified-scoring.js` /
`driver-recommendation-engine.js` compute a driver/dispatch score *at
recommendation time, over a specific dispatch decision* — not a standing,
retrievable per-driver number — so passing it through as "driver health"
would misrepresent a context-dependent recommendation as a stored fact.
They stay on the honest `OBSERVABILITY_ONLY` default. `EntityHealthReport`
is explicitly the *third* disambiguated "health" concept in this platform,
after `KnowledgeHealthReport` and `ArchiveHealthReport`.

The engine takes an optional `rawSourceRecord` as a parameter rather than
resolving it itself — the same Firebase-coupling constraint from Sprint
12.5.3 applies here too. This sprint ships `computeEntityHealth()`
structurally complete and fully tested against synthetic fixtures, with a
documented, deferred seam for a future sprint to supply real raw records.

### 12.5.6 — AI Body Context

`body-context-builder.js#buildBodyContext({entityType, entityIds})` — pure
composition over Body's own repositories/engines only, with the same
domain-less graceful degradation `conversation/context/context-builder.js`
already establishes (an unscoped call returns an honest empty context,
never a guess). **Ships with zero callers outside its own test suite** —
the same bar `js/v2/index.js` sets for the whole platform, and the same
precedent `ai-foundation`'s adapters and `reasoning/`'s Phase 4-7 additions
both shipped under.

Two invariants are asserted, not just claimed: every returned entity field
is strictly descriptive (`id`/`entityType`/`observedState`/`attributes`/
`confidence` — no generated prose, no recommendation), and nothing in this
tree is reachable from `reasoning/reasoning-engine.js#reason()`. A live
`observedState` is descriptive ("this vehicle is currently in
maintenance"), never normative ("this vehicle may not be dispatched") —
letting `reason()` cite a raw Body fact would let the platform convert an
*is* into an *ought* without a human ever approving that inference. If a
rule like that should exist, the existing path is unchanged: someone
authors it as a `kind:'rule'` KnowledgeItem, it goes through review,
`reason()` cites *that* — never the live fact directly.

`services/index.js` is the namespaced barrel (mirrors
`knowledge/services/index.js`) exposing `entities` / `sensing` / `graph` /
`health` / `context`. It deliberately re-exports no sensor — `sensing` is
`body-sensing-service.js`, which itself has zero sensor dependency — so
importing the whole barrel stays exactly as Firebase-free as importing
`body-sensing-service.js` alone (proven, not just claimed — see the
regression table).

---

## Architecture decisions (binding, extends `js/v2/README.md`'s graph)

```
body/  ──depends on──>  V1, read-only, through *-store.js getters (same
       rule as knowledge/), plus 2 precedented pure-leaf contract reuses
       (knowledge/contracts/identity-contract.js#nextVersion,
       knowledge/observability/contracts/warning-contract.js)
body/  ──never depends on──>  any ENGINE or SERVICE in knowledge/,
       organizational-memory/, learning/, conversation/, reasoning/,
       problem-intelligence/, problem-solving/, document-intelligence/,
       ui/, ai-foundation/ — body/ is a PEER of knowledge/, not downstream
conversation/, reasoning/, problem-intelligence/  ──may depend on──>  body/
       (read-only, services-only, optional — same relationship they
       already have to knowledge/ — NOT exercised in this sprint)
```

Two of the brief's requested entity types are **Knowledge and Policy**.
Sensing `knowledge/`'s own KnowledgeItems as Body Entities would break the
peer/no-engine-dependency boundary above and create two parallel
representations of the same object. Both stay registered vocabulary with an
inactive placeholder sensor indefinitely, pending a dedicated future
decision — not resolved by default in this sprint.

`js/v2/README.md` was updated (structure only, no behavior change) to add
`body/`'s layout entry and dependency-graph lines, since it's the
platform's one authoritative domain map.

---

## Regression

| Check | Result |
| --- | --- |
| `scripts/body-foundation-check.mjs` (new — Sprint 12.5.1: contracts, entity-type-registry, sensor-registry, dormant barrel, zero-V1-import invariant) | **42/42 pass** |
| `scripts/body-repository-check.mjs` (new — Sprint 12.5.2: Entity/Relationship/Event repositories, entity-service reconciliation) | **25/25 pass** |
| `scripts/body-sensors-check.mjs` (new — Sprint 12.5.3: every real V1 status-enum value for all 3 pilot sensors, relationship derivation, Firebase-coupling boundary probes, fake-sensor orchestration) | **50/50 pass** |
| `scripts/body-ownership-check.mjs` (new — Sprint 12.5.3: static ownership/dependency-graph analysis + behavioural dormancy proof) | **15/15 pass** |
| `scripts/body-graph-check.mjs` (new — Sprint 12.5.4: getNeighbors/getSubgraph/getGraphStats) | **15/15 pass** |
| `scripts/body-health-check.mjs` (new — Sprint 12.5.5: real Vehicle passthrough cross-checked against calling vehicle-asset-service.js directly, honest fallbacks, freshness/completeness formula) | **19/19 pass** |
| `scripts/body-context-check.mjs` (new — Sprint 12.5.6: buildBodyContext composition, services/index.js barrel) | **18/18 pass** |
| **New total** | **184/184 pass** |
| `scripts/knowledge-ownership-check.mjs` (pre-existing, regression spot-check) | **56/56 pass, unchanged** |
| `scripts/conversation-ownership-check.mjs` (pre-existing, regression spot-check) | **80/80 pass, unchanged** |
| `scripts/archive-ownership-check.mjs` (pre-existing, regression spot-check) | **74/74 pass, unchanged** |

Two of the most load-bearing proofs are *behavioural*, not just grep-based:
`body-ownership-check.mjs` Part 6 actually imports `body/index.js`,
`sensor-registry.js`, `entity-service.js`, and `body-sensing-service.js` in
plain Node and asserts they load cleanly (zero transitive Firebase
dependency) — then imports the 3 real `*-sensor.js` files and asserts they
genuinely **cannot** load (proving the Firebase-coupling boundary is
exactly where designed, not just where documented).
`body-health-check.mjs` cross-checks Vehicle's passthrough score against
calling `js/services/vehicle-asset-service.js#normalizeVehicleAsset()`
directly — an exact-value assertion, not a shape assertion, so a future
drift between Body's passthrough and V1's own number would fail loudly.

---

## What this is NOT (honest scope)

- **No V1 changes, of any kind, anywhere.**
- **No new RTDB writes or schema.** `body/` never becomes a system of
  record — every write path terminates inside `js/v2/body/`'s own
  in-memory repositories.
- **No UI.** No Body/Entity browser workspace exists yet.
- **No live wiring into `conversation/` or `reasoning/`.**
  `body-context-builder.js` is structurally complete and fully tested, with
  zero callers outside its own test suite — wiring it into
  `context-builder.js` (as an additive field) or `reasoning-engine.js` is
  explicitly deferred to a later, separately-approved sprint. Whether a
  live operational fact should ever be able to influence NOR composition is
  a real governance decision, not a side effect of this sprint shipping.
- **No LLM/AI calls anywhere in this tree.**
- **Only 3 of the 19 registered entity types have a real sensor.** The
  other 16 are honest `NOT_IMPLEMENTED` placeholders. Several (Vendor,
  Inventory, standalone Meeting/Workflow/Approval/Organization Unit) have no
  V1 store to sense at all yet — that's V1 work, not Body's. Building/Room/
  Equipment are static seeded taxonomies (`js/engineering/master-data/`),
  not yet Firebase-backed; sensing a config file as if it were live data
  would misrepresent liveness, so they stay placeholders too.
- **No real Entity Health passthrough for Driver or Assignment.** Both are
  honestly `OBSERVABILITY_ONLY` until V1 exposes a real standing per-entity
  score (today's driver/dispatch scores are recommendation-time-only).
- **No real raw-V1-record wiring into `computeEntityHealth()`.** The
  function accepts one as an optional parameter (Firebase-coupling
  constraint, see Sprint 12.5.3/12.5.5) but nothing supplies one yet —
  every health report produced in this sprint's own tests is either a
  cross-checked passthrough against a synthetic fixture, or honestly
  `OBSERVABILITY_ONLY`.
- **The Knowledge/Policy entity-sensor question is deliberately left
  open**, not resolved by default — see "Architecture decisions" above.
- **`js/v2/README.md`'s per-domain narrative sections (below the Layout
  block) were not rewritten** — they were already stale past ~Phase 10
  before this sprint, and bringing them current is a documentation-hygiene
  task orthogonal to Body Intelligence's own scope.

---

## Files

**New domain — `js/v2/body/`** (36 files, ~2,790 lines):
- `contracts/{entity,entity-state,entity-vocabulary,identity,sensor,entity-relationship,body-event,entity-health}-contract.js`
- `registry/{entity-type,sensor}-registry.js`
- `sensors/placeholder-sensor.js`, `sensors/{vehicle,driver,assignment}-mapping.js` (pure), `sensors/{vehicle,driver,assignment}-sensor.js` (V1-coupled), `sensors/index.js` (opt-in barrel)
- `repository/contracts/repository-contract.js`, `repository/implementations/{memory,null}-repository.js`, `repository/repository-registry.js`, `repository/entity-repository.js`, `repository/relationship-repository.js`, `repository/body-event-repository.js`
- `services/entity-service.js`, `services/body-sensing-service.js`, `services/entity-graph-service.js`, `services/entity-health-service.js`, `services/index.js`
- `graph/entity-relationship-graph-engine.js`
- `health/entity-health-engine.js`, `health/registry/health-source-registry.js`
- `context/body-context-builder.js`
- `index.js` (dormant barrel), `README.md` (domain doc)

**Modified:**
- `js/v2/README.md` — added `body/`'s layout entry + dependency-graph lines (structure only, no behavior change)

**New — check scripts (7 files, ~1,020 lines, 184 assertions):**
- `scripts/body-foundation-check.mjs`, `scripts/body-repository-check.mjs`, `scripts/body-sensors-check.mjs`, `scripts/body-ownership-check.mjs`, `scripts/body-graph-check.mjs`, `scripts/body-health-check.mjs`, `scripts/body-context-check.mjs`

**New — this document:**
- `docs/PHASE_12_SPRINT_12_5_BODY_INTELLIGENCE.md`
