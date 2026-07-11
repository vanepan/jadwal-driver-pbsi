# Sarpras Operations V2.0 — Architecture Audit & Proposal

> Phase 1 (Repository Audit) + Phase 2 (Architecture Proposal) of the V2.0.0 master plan.
> Status: **awaiting approval.** No V2 code exists yet. Nothing in this document has been implemented.
> Source of truth for release history: `VERSION_HISTORY` in `js/config.js` (currently v1.23.0), not `docs/ROADMAP.md`.
>
> **Revision 2** (this version): §1–§3 (audit + reuse findings) are approved as-is. §4–§5 (the architecture proposal itself) have been rewritten to incorporate ten binding architectural decisions on the Knowledge Platform — domain-agnosticism, multi-source knowledge, a five-stage lifecycle, measurable health metrics, mandatory explainability, a strict "teach once, learn forever" governance gate, LLM-as-optional-adapter, engine collaboration (never replacement), and incremental indexing. These decisions are now part of the official V2 architecture and constrain everything below.

---

## 0. A note on conflicting roadmaps

`docs/ROADMAP.md` describes production as **v1.2.5**, "Driver Operations" as the only live module, and Analytics/Engineering/AI Assistant as "design or planning state only." That document is stale — it was frozen at a much earlier snapshot and was not updated as the project progressed.

The actual `VERSION_HISTORY` in `js/config.js` shows production at **v1.23.0**, with Analytics, Recommendation, Prediction, Simulation, Engineering Operations, Petty Cash/NOR document generation, a full server-side notification/reminder bus, and an Executive Command Center already shipped and stable. Per the master prompt's rule, `VERSION_HISTORY` wins. This audit is grounded in the real, current code — not the roadmap doc. (I have not modified `docs/ROADMAP.md`, per the safety contract; flagging the drift is as far as I've gone.)

---

## 1. Executive summary

This is not a thin app that needs a V2 built on top of it. **It already contains most of a V2 platform, built incrementally and unusually well self-documented** (every engine's header comment states its purity, inputs, and non-goals — treat these as a de-facto ADR log). The dominant risk for V2 is not "how do we build Knowledge/Analytics/Prediction/Recommendation layers" — it's **avoiding a fifth reimplementation of things that already exist four times over**.

Concretely, five things are already true today:

1. **A full scoring → policy → capacity → recommendation → prediction → explainability → simulation pipeline exists**, all pure functions, all reused rather than duplicated (`js/services/*`, `js/analytics/*`, `js/engines/*`, `js/prediction/*`, `js/recommendation/*`, `js/simulation/*`).
2. **A pluggable prediction-provider abstraction already exists and is already stubbed for a real ML/Python backend** (`js/prediction/python-provider.js`) — this is the intended seam for "AI Foundation," not something to build fresh.
3. **A channel-agnostic, event-driven notification bus exists server-side** (`functions/src/notifications/*`) that has already absorbed two independent domains (lifecycle reminders, Engineering Operations) with zero new dispatch code — new V2 event types can ride it.
4. **A generic, zero-touch extension point exists for adding new "modules" as Home-tab widgets** (`js/workspace/*` + `js/widgets/*`), already proven end-to-end by the Engineering workspace's placeholder stubs.
5. **No "Knowledge Platform" (extract-structure-from-documents) concept exists anywhere.** This is the one genuinely new capability V2 needs to build from scratch — everything else is extend/compose/reuse.

The one area with real, structural duplication — and the one most relevant to "Knowledge Platform" — is **document generation**: there are three independent rendering universes (client pdfmake, server Puppeteer/HTML, ad hoc Excel-cell builders) with no shared intermediate representation, and NOR's own layout is hand-authored three times over. This is exactly where a Knowledge Platform would want to insert a declarative "document structure as data" layer — see §5.

---

## 2. Audit findings by subsystem

### 2.1 Document / PDF / NOR generation pipeline

**Three independent rendering engines, no shared intermediate representation:**

| Engine | Shape | Used by |
|---|---|---|
| Client pdfmake (`js/docs/doc-engine.js` + `template-registry.js` + `pdf-exporter.js`'s `PdfmakeBackend`) | JS function → pdfmake `DocumentDefinition` object tree | Reimbursement (`templates/reimbursement.js`), NOR (`templates/nor.js`), a POC, two apparently-superseded analytics templates |
| Server Puppeteer/HTML (`functions/src/exports/analytics/report/*`) | JS function → HTML string, composed from 11 reusable component functions + a CSS-in-JS stylesheet | Every current-generation Analytics/Dispatch/Wellness/Executive/Engineering export, reached from the client via `PuppeteerBackend` → `callRenderAnalyticsExport` |
| Bespoke Excel (`js/petty-cash/nor-excel-exporter.js`, and each analytics module's own Excel builder) | Array-of-arrays + per-cell style objects (`xlsx-js-style`) | NOR Excel, Petty Cash Excel, and independently, ~6 more analytics modules each reimplementing their own PDF+Excel export pipeline client-side |

**Consistent, good pattern underneath all three**: domain module → pure view-model builder → template function → renderer. `js/reimbursement.js` is the clean reference implementation of this (its own header comment documents migrating away from a raster/html2canvas one-off onto the shared `DocumentEngine`).

**Concrete duplication to fix, not repeat in V2:**
- NOR's layout is hand-authored **three times** (pdfmake `templates/nor.js`, HTML `nor-paper.js`, Excel `nor-excel-exporter.js`) against the same view model, with no single declarative source — any layout change requires editing all three by hand.
- Two parallel template registries (client `Map`-based `template-registry.js`, server hardcoded object literal `report-document.js`), keyed by the same `templateId` strings but maintained independently.
- Two parallel export-audit-trail systems (`js/exports/export-history.js`'s `/analytics_exports`, vs. Petty Cash's own `recordNorExport`).
- `docs/DOCUMENT_DESIGN_SYSTEM.md` and `docs/ANALYTICS_TEMPLATE_STANDARD.md` both describe the **client pdfmake** system only and don't mention the server Puppeteer pipeline that most reports actually use today — the written standard has drifted from the shipped system.

**No existing "extract structure from a document" capability anywhere** (confirmed: zero hits for parse/extract/OCR/schema-driven concepts). Every pipeline is one-directional (data → template → PDF/Excel), and nothing persists a *filled* document anywhere queryable (`export-history.js` explicitly stores metadata only, discards content). **A Knowledge Platform mining historical NOR/Memorandum/SOP documents would find no existing corpus to start from — only generator code.** The best existing "templates as data" candidate is `js/exports/analytics/model/report-types.js`'s versioned JSDoc `@typedef`s (`REPORT_MODEL_SCHEMA_VERSION`) — real, versioned, cross-boundary, but documentation-only, not machine-validated or persisted.

### 2.2 Analytics / Recommendation / Prediction / Policy / Scoring layer

This is already a complete, named, staged pipeline — not four competing concepts:

```
raw data → sanitize → governance filter → policy (eligibility) → capacity (measurement)
→ scoring (per-entity) → fusion (dispatch pairing) → human decision → persistence
→ analytics/accuracy (descriptive) → prediction (forward-looking, certified)
→ explainability → recommendation (what to do) → simulation (what-if) → presentation
```

Key facts:
- **Every stage is a pure function**, with the sole deliberate exceptions being a persistence singleton, an LRU prediction cache, and a provider registry — all explicitly isolated, all documented as intentional.
- **A prediction-provider abstraction already exists and is already the seam for a real ML backend**: `js/prediction/prediction-provider.js` (registry) + `rule-provider.js` (today's deterministic engine, wrapped in the contract) + **`python-provider.js` — a fully-specified `NOT_IMPLEMENTED` stub whose only job is to lock the interface** so a real external model can be wired in later by implementing one `predict()` function, with no changes needed anywhere downstream (the validator/service certify whatever any provider returns identically). **This is the intended "AI Foundation" seam** — it should not be rebuilt.
- **Explainability already exists and is enforced structurally**, not by convention: `js/engines/prediction-validator.js` certifies every prediction against a contract (score/level/confidence/reasons/signals/summary all present and mutually consistent — "no prediction without evidence"); nothing uncertified ever reaches a consumer. `js/prediction/explainability.js` turns certified signals into plain-language "why" cards. This is directly the "explainability" requirement in the master prompt (§ EXPLAINABILITY) — already built once for prediction.
- **A second, independent explainability system exists for dispatch decisions** (`js/services/dispatch-presentation.js` + `decision-replay-service.js`) with compatible but not-unified vocabulary. Any V2 "one explainability contract" work should reconcile these two rather than build a third.
- **The "one fact, one function" discipline had to be retrofitted once already** — `js/recommendation/engineering-overdue.js` / `engineering-verification.js` exist purely because two widgets independently computed the same number and disagreed (the v1.23.0 hotfix). V2 should establish this discipline from day one for any new cross-cutting metric.
- **A stubbed governance/classification layer already exists** (`js/analytics/analytics-governance.js`, currently a no-op passthrough, explicitly documented as "Sprint 0 foundation only") — the natural attachment point for any future data-lineage/classification requirement.
- Weights/config are already externalized (`js/stores/dispatch-intelligence-store.js`, `js/config/dispatch-intelligence-config.js`, `dispatch-policy-config.js`) — a ready-made surface for a future tuning UI, no new config plumbing needed.

### 2.3 Engineering Operations module (`js/engineering/`) — candidate V2 module template

A genuinely well-structured, self-contained module (config/models/engines/timeline/notifications/settings/store/provider/analytics/ui, ~6,000 lines) — **but it is a convention worth copying by hand, not a reusable scaffold today**:

- The 11-state lifecycle graph (`config/engineering-config.js`) is a hardcoded, domain-specific enum + transition table, gated through one guarded mutator (`assignment-engine.js`). No generic state-machine primitive exists to lift out for a future module (Asset Management) to instantiate with its own states.
- The provider/adapter pattern (`providers/provider-registry.js` + dev-seed/Firebase adapters) is clean and proven, but it's a private per-module registry with domain-specific method names (`saveAssignment`, `transactAssignment`) — a new module needs its own copy, not a shared factory.
- The two registries that *look* like the generic "add a new module" seam — `js/workspace/workspace-registry.js` and `js/workspace/widget-registry.js` — contain only **inert placeholder stubs** for Engineering. **The real wiring is imperative, hardcoded branches inside `js/app.js`** (`canAccessModule()` switch statement, static top-level imports, a literal `MODULE_DEFS` entry, a hand-written rail-button HTML template string, a `setWorkspace()` if/else branch, a dedicated `navEngineering()` function, a manually-created DOM container). Adding a real rail-level module today means editing `app.js` in five places.
- The one piece that's already genuinely generic and reusable: `js/engineering/master-data/engineering-master-data.js`'s `makeProvider(key, label, resolve)` factory (zero Engineering-specific code) and `js/config/bottom-nav-registry.js` (properly data-driven, keyed by workspace id).
- The `registerSourceNotifier()` seam in `notifications/notification-engine.js` is the one *concrete, functioning* extension point in the whole module (a real registration API future request sources can hook without touching the engine) — a good pattern to imitate elsewhere.

**Verdict:** copy the *convention* (layer separation, guarded-transition-only mutation, adapter+registry for data sources, DEFAULT+ACTIVE config), but budget explicit generalization work — extracting a generic state-machine primitive and a generic module-registration mechanism — before calling this a scaffold other modules can literally instantiate.

### 2.4 Server-side (`functions/`)

- **The notification/reminder backend is channel-agnostic in architecture already**, contrary to the "Telegram-only" framing in prior memory/stale READMEs: `notifications/registry.js` declares per-event-type channel sets (in-app/Telegram/push) from one shared `engine.js` → `dispatcher.js` → `model.js` pipeline. In-app and Web Push are live in production; Telegram lifecycle notifications remain server-shadow (browser is still the live Telegram sender) pending a deliberate cutover. Engineering Operations was added as a second domain riding this exact bus with zero new dispatch code — proof it generalizes.
- **The event bus (`functions/src/events/*`) is a genuine, versioned, server-authoritative outbox** (not an audit log — `/logs` remains separate), derived from true RTDB state transitions via triggers, plus one narrow client-publishable event type (`comment.added`). New V2 event types (e.g. a future `prediction.alert`, `analytics.anomaly`) can be added to the `EVENT_TYPES` allow-list and ride the same bus with no new transport code.
- **Reminders are cron + event-driven, cleanly separated**: `reminders/tick.js` is a real `onSchedule` job (every 5 min) that only decides "is anything due"; everything downstream reuses the standard event pipeline.
- **RTDB rules show a real, proven "server-only node + validating callable" pattern** already in production for `push_subscriptions` — the exact pattern `docs/TIER1_OPERATIONAL_DATA_INTEGRITY_ARCHITECTURE.md` proposes for `assignment_actuals`/`vehicle_odometer`, confirmed still design-only (zero implementation). Most core paths (`assignments`, `driver_requests`, `users`, `drivers`, `vehicles`) still fall through to the generic `auth != null` rule — no field-level validation.
- Feature flags are hardcoded JS constants requiring redeploy to flip (`functions/src/config/constants.js`) — not runtime-toggleable from RTDB. Worth knowing before assuming a Knowledge Platform config surface can be live-tunable without a deploy.
- Server-side document rendering exists **only for Analytics** (`functions/src/exports/analytics/`) and duplicates the client's HTML/CSS by hand (no shared template module between runtimes) — same finding as §2.1, from the other side.

### 2.5 Composition/shell layer (`js/workspace/`, `js/config/*`, `js/app.js`, `js/widgets/*`)

Two very different extensibility tiers exist, and this is the most important finding for **where V2 can attach without touching V1**:

- **Home-tab widgets: genuinely generic, zero-touch, already proven.** `js/workspace/workspace-registry.js` + `widget-registry.js` are fully declarative (workspace = data, widget = `{render(ctx), onMount?}` in a lazy-loaded group module). The module's own header comment states the intent outright: *"Adding a future workspace is a data change here + a widget group — the render pipeline never changes."* The `engineering` workspace today is 100% placeholder stubs, proving the pipeline works end-to-end with no real data wiring. **A V2 module needing only Home-tab presence can attach with zero edits to any existing V1 file.**
- **Full rail-level modules (own icon, full-screen surface, bottom nav): not generic.** `MODULE_DEFS` inside `js/app.js` (11,537 lines) is a real manifest, but it's only one of five places requiring hand edits in lockstep (role-registry, bottom-nav-registry, `MODULE_DEFS`, and three separate imperative blocks inside `app.js` itself: rail HTML template string, `setWorkspace()` branch, dedicated `navX()` function, manual DOM container creation, manual event-listener wiring). `app.js` remains the single choke point for any module needing its own top-level surface.
- **The shared `ctx` object handed to every widget is narrow and clean**: 11 top-level keys (`user`, `role`, `assignments`, `myAssignments`, `requests`, `myRequests`, `logs`, `models`, `recommendations`, `engineeringEvents`, `actions`), with `actions` as the sole outbound call channel (declarative `data-wsp-action` hooks, never direct DOM/Firebase reach-in from widgets).
- **Firebase access is already well-centralized**: only 14 files repo-wide import `js/firebase.js` (mostly dedicated `*-store.js` modules); zero direct Firebase access from any engine, analytics module, or widget. This directly satisfies the "Core Operations must never depend on Intelligence" / "V2 may read V1" constraint — V2 can safely read V1 state via the same store getters or a `ctx`-shaped handoff, without opening parallel Firebase listeners.

---

## 3. Answering the master prompt's explicit questions

**Existing engines identified:** Validation Engine, Business Rules/Conflict Engine, Notification Engine (server, channel-agnostic), Reminder Engine (cron + event-driven), Analytics Engine (+ Dispatch-Analytics, Recommendation-Accuracy, Executive-Analytics, Maintenance-Analytics, Petty-Cash-Analytics, Vehicle-Asset-Analytics — six analytics engines, each documented as reading the layer below rather than recomputing it), Policy Engine, Capacity Engines (driver/vehicle), Recommendation Engines (driver/vehicle/fleet/dispatch-fusion), Prediction Engine (+ Validator + Provider registry + two providers), Explainability layer (prediction-side and dispatch-side, not yet unified), Simulation/Scenario Engine, Workload Engine, Wellness Engine, Alias Engine (data-quality dedup), Trend Engine (generic, reused by three domains), Ranking Engine (generic), Insight Engine (generic, template-driven), Document Generation Framework (client pdfmake) and a parallel server Puppeteer/HTML report engine, NOR Document Engine, Export Center/History, Engineering Operations' own lifecycle/assignment/verification engines.

**Existing document pipeline:** three independent renderers (pdfmake, server-HTML/Puppeteer, ad hoc Excel), described in full in §2.1.

**Existing PDF pipeline:** `js/docs/pdf-exporter.js` (client, two backends) + `functions/src/exports/analytics/render/*` (server, Puppeteer/Chromium).

**Existing analytics pipeline:** §2.2 — a six-engine, layered, mutually-referencing analytics system, already the platform's own "analytics of the recommendation engines" meta-tier (`dispatch-analytics-engine.js`, `recommendation-accuracy-engine.js`, `executive-analytics.js`).

**Existing recommendation pipeline:** `js/services/{dispatch-scoring,dispatch-policy,driver-recommendation,vehicle-recommendation}-engine.js` → `js/recommendation/*` → `js/simulation/*`, fully described in §2.2.

**Existing NOR implementation:** `js/petty-cash/nor-document-engine.js` + `js/docs/templates/nor.js` + `nor-paper.js` + `nor-excel-exporter.js` — correctly reuses the generic `DocumentEngine`, but triple-duplicates layout description (§2.1).

**Existing document generation flow:** domain module → pure view-model builder → registered template function → pluggable renderer backend → viewer/download. Consistent across Reimbursement, NOR, and (in spirit, cross-runtime) the Analytics reports.

**Opportunities to reuse (no new engine needed for):** eligibility/policy filtering, capacity measurement, scoring, prediction (rule-based today, pluggable), explainability derivation, simulation, notification dispatch (any channel, any new event type), the Home-tab module-attachment mechanism, the store/Firebase-centralization pattern, the config-driven weights pattern.

**Where reuse is impossible without prior generalization work (and why):**
- **State-machine/lifecycle**: Engineering's graph is hardcoded to its own domain shape; no generic primitive exists. A new module with its own lifecycle needs either a hand-copied convention or upfront extraction of a generic `{states, edges, canTransition, guardedTransition}` primitive.
- **Module registry for rail-level surfaces**: `MODULE_DEFS` + `app.js`'s imperative wiring is not a plug-in API; every new full-screen module still requires five hand-edits including three inside `app.js` itself. Reuse is possible in spirit (copy the Engineering pattern) but not mechanically (no single registration call).
- **Document rendering**: no shared intermediate representation between the pdfmake and HTML/Puppeteer universes exists to reuse from; building a Knowledge Platform "block" template system means choosing one (or defining a new one both can render from) rather than reusing either verbatim.

---

## 4. Revised V2 Architecture Proposal

This section incorporates ten binding architectural decisions on the Knowledge Platform. They are now part of the official V2 architecture, not suggestions.

### 4.0 Architectural goal (restated, binding)

**V2 is not an AI project. V2 is a Knowledge Platform.** AI is one replaceable client of that platform, not its foundation. Knowledge belongs to PBSI and is durable; AI providers are adapters and are disposable. Every design choice below is subordinate to this ordering — if a future decision would make the platform's usefulness depend on a specific AI provider, that decision is wrong.

### 4.1 Where V2 physically lives (revised layering)

```
js/v2/                        ← new, dormant namespace. Nothing outside js/v2/ imports from it.

  knowledge/                  ← THE PLATFORM CORE. Domain-agnostic. See §4.2.
    connectors/                 one module per knowledge SOURCE (not per domain) — §4.2.2
    repository/                 storage + versioning + rollback + history — §4.2.3
    lifecycle/                  Draft→Candidate→Pending Review→Approved→Deprecated state machine — §4.2.3
    metrics/                    KnowledgeHealthReport schema (types only, Phase 3) — §4.2.4
    explainability/              provenance/corroboration/preference-rationale contract — §4.2.5
    review/                     the human-approval workflow — §4.2.6

  analytics/                  ← thin composition over js/analytics/*, optionally Knowledge-aware
  prediction/                 ← thin composition over js/engines/prediction-engine.js + js/prediction/*
  recommendation/              ← thin composition over js/recommendation/* + js/simulation/*
  executive-intelligence/      ← cross-platform synthesis, optionally Knowledge-aware

  ai-foundation/               ← ADAPTER LAYER ONLY. See §4.2.7.
    adapters/
      claude-adapter.js          (stub — NOT_IMPLEMENTED, same contract shape as python-provider.js)
      openai-adapter.js          (stub)
      local-model-adapter.js     (stub)
```

**Dependency direction is one-way and non-negotiable**: `ai-foundation/` may depend on `knowledge/`. `knowledge/` must never depend on `ai-foundation/` or any other AI/LLM code. Analytics/Prediction/Recommendation/Executive Intelligence may each optionally read from `knowledge/`, but `knowledge/` never reads from them except through its own connectors (§4.2.2), and never writes back into V1.

V2 reads V1 exclusively through the two precedented, already-clean seams identified in §2.5: the `*-store.js` getter functions, and a `ctx`-shaped object. **No new Firebase listeners, no reaching into `app.js` internals.**

### 4.2 Knowledge Platform — full design

#### 4.2.1 Domain-agnostic by construction (Decision 1)

Knowledge Platform must never become "the NOR platform." NOR, Memorandum, SOP, Internal Letters, Engineering, Request, Petty Cash, and Executive Intelligence are all first-class, equally-weighted consumers from day one — none is architecturally privileged.

- Every stored unit is a **domain-parameterized** `KnowledgeItem`, not a domain-specific file or module:
  ```
  KnowledgeItem {
    id, version,
    domainType,        // 'nor' | 'memorandum' | 'sop' | 'internal_letter' | 'engineering'
                        // | 'request' | 'petty_cash' | 'executive_intelligence' | ...
                        // registered, never a hardcoded switch (see below)
    sourceType,         // which connector produced it (§4.2.2)
    kind,               // 'vocabulary' | 'terminology' | 'structure' | 'writing_style'
                        // | 'sentence_pattern' | 'template_pattern' | 'relationship'
                        // | 'rule' | 'correction' | 'statistic' | ...
    payload,            // the actual learned content, shape depends on `kind`
    confidence,
    lifecycleState,     // §4.2.3
    provenance,         // §4.2.5
    approvedBy, approvedAt, preferenceRationale,  // §4.2.5
    createdAt, updatedAt,
  }
  ```
- `domainType` and `kind` are **registered values** (a registry, mirroring the `SOURCE_DEFS`-with-`registerSourceNotifier` pattern already proven safe in `js/engineering/`), not a hardcoded enum baked into the repository core. Adding "Executive Intelligence" or a brand-new future document type as a `domainType` must never require touching `knowledge/repository/` or `knowledge/lifecycle/` code — only a registry entry.
- No module anywhere under `knowledge/` may be named after, or contain logic specific to, a single domain (no `nor-knowledge.js`). Domain specificity lives only in **connector implementations** and in **data**, never in the platform core.

#### 4.2.2 Multi-source (Decision 2)

Documents are one source among many, all landing in the same repository through the same contract. Each source gets its own **connector**, registered against a shared registry — this mirrors the provider-registry pattern already proven in this codebase (`js/prediction/prediction-provider.js`, `js/engineering/providers/provider-registry.js`), reused rather than reinvented:

| Connector | Reads from (existing V1 code, read-only) |
|---|---|
| Documents | Approved NOR/Memorandum/SOP/Internal Letters |
| Configuration | `js/config/*`, `js/engineering/config/*`, `dispatch-policy-config.js`, etc. |
| Business Rules | Existing validation/policy engines' rule definitions |
| Operational History | Existing analytics models, decision-replay records |
| Analytics | `js/analytics/*` outputs |
| Recommendation Engines | `js/recommendation/*` + `js/simulation/*` outputs |
| Workflow Definitions | Engineering's lifecycle graph, future modules' state machines |
| User Corrections | Explicit human corrections (§4.2.6) |
| Organizational Decisions | Approved decisions — e.g., this document itself, once approved, becomes a Knowledge item |
| Templates | `js/docs/template-registry.js` descriptors, `report-types.js` typedefs |
| Policies | Policy engine configuration |
| *(future)* | Registered the same way — no core changes required |

Every connector is **read-only over its source**. This is the same boundary already established in §2.5 (Core Operations never depends on Intelligence): connectors reach into V1 to read, never to write.

#### 4.2.3 Lifecycle (Decision 3 — replaces the original Draft→Candidate→Confirmed model)

```
Draft → Candidate → Pending Review → Approved → Deprecated
```

- **Draft** — raw connector output, unreviewed, low trust, never exposed to any consumer.
- **Candidate** — passed automated confidence/consistency checks, queued for human review. User corrections *always* enter here (§4.2.6), never higher.
- **Pending Review** — explicitly surfaced in a review queue; feeds the Pending Review Count metric (§4.2.4).
- **Approved** — authoritative, versioned, the only state exposed to consumers.
- **Deprecated** — superseded or revoked; retained (never deleted) for history/rollback/audit; never returned as current truth.
- Every transition is **appended as a new version, not an overwrite** — mirroring two append-only patterns already proven in this codebase: the Timeline Engine (`js/engineering/timeline/timeline-engine.js`) and the server event outbox (`functions/src/events/schema.js`).
- **Rollback** = approving a prior version as current, itself an auditable transition — never a silent delete-and-restore.
- No path from Draft or Candidate to Approved may be automatic. The human gate is structural, not a convention (ties directly to Decision 6).

#### 4.2.4 Knowledge Metrics (Decision 4 — architecture-level only, no implementation yet)

A `KnowledgeHealthReport` type, defined now, computed later:

| Metric | Definition |
|---|---|
| Coverage | % of registered domainTypes/sourceTypes with ≥1 Approved item |
| Confidence | Aggregate confidence distribution across Approved knowledge |
| Pattern Count | Count of Approved `structure`/`template_pattern` kind items |
| Vocabulary Size | Count of distinct Approved `vocabulary`/`terminology` items |
| Template Count | Count of Approved `template_pattern` items |
| Relationship Count | Count of Approved `relationship` items |
| Learning Queue | Count of Draft + Candidate items awaiting processing |
| Pending Review Count | Count strictly in Pending Review |
| Health Score | Composite — reuse the existing weighted-combiner-plus-banding shape from `js/analytics/engines/executive-score-engine.js` rather than inventing a new scoring convention |
| Knowledge Age | Time since last Approved update, per domainType |
| Last Updated | Timestamp, per domainType / per item |

No computation of any of these happens in Phase 3 — only the shape is fixed now so connectors/repository can be built against a stable contract later.

#### 4.2.5 Explainability (Decision 5)

Every Approved `KnowledgeItem` must be able to answer, on demand:

| Question | Field |
|---|---|
| Where did I learn this? | `provenance` (connector id + source reference) |
| How many approved sources support this? | corroboration count (derived from `provenance` + linked `relationship` items) |
| When was it approved? | `approvedAt` |
| Who approved it? | `approvedBy` |
| Why is this preferred? | `preferenceRationale` — human-written at approval time, never auto-generated |

This is deliberately a **third** explainability surface alongside the two already found in the audit (prediction-side `js/prediction/explainability.js`; dispatch-side `dispatch-presentation.js`/`decision-replay-service.js`) — but it is designed from day one to share vocabulary (`confidence`, provenance/reasons, tone) with both, so a future unification stays possible rather than being foreclosed by incompatible shapes. Knowledge must never behave as a black box: no Approved item may exist without a non-empty `provenance`.

#### 4.2.6 Teach Once, Learn Forever (Decision 6 — strict, mandatory)

- A user correction is captured by the User Corrections connector as a **Draft** item, tagged with who/when/what was corrected and what it replaces.
- It **never** auto-promotes past Candidate, regardless of how many times the same correction is submitted or how confident the automated check is.
- Only an explicit **Approved** transition changes what any consumer sees as current knowledge.
- This is the load-bearing rule of the whole platform, not a soft guideline — no code path may bypass Candidate → Pending Review → Approved for any source, including corrections.

#### 4.2.7 LLM is optional (Decision 7)

- `knowledge/repository` and everything under `knowledge/` must be fully buildable, queryable, and reviewable with **zero** AI providers registered — this must remain true forever, not just at Foundation.
- All LLM-specific code lives only under `ai-foundation/adapters/*`, each conforming to one adapter contract:
  ```
  Adapter { id, provider, query(knowledgeContext, prompt) -> { ok, answer, citedKnowledgeIds, error } }
  ```
  deliberately mirroring the already-proven `js/prediction/prediction-provider.js` shape (registry + never-throws + explicit success/failure result) — the same contract pattern that already makes swapping `rule-provider.js` for `python-provider.js` a zero-blast-radius change.
- Swapping Claude for OpenAI, Gemini, or a local model means writing one new adapter file and registering it. Zero changes to `knowledge/` code, ever. This is the literal test of Decision 7 — if replacing an adapter ever requires touching `knowledge/`, the design has failed.

#### 4.2.8 Engine collaboration (Decision 8 — never replace)

Knowledge Platform is a peer service to existing engines, never a substitute:

| Existing engine | Relationship to Knowledge Platform |
|---|---|
| Document Engine / NOR Engine / PDF Engine | Consume Approved template/structure knowledge as an *additional optional input* to their existing pure `build(data)` functions — additive, not a rewrite (see §4.4) |
| Recommendation Engine / Analytics Engine / Prediction Engine | May query Knowledge Platform read-only for approved vocabulary/business-rule/pattern context |
| Executive Intelligence | Same fusion relationship `executive-analytics.js` already has with other models — Knowledge becomes one more read-only input |
| Future modules | Same connector/read-only contract, no special-casing |

None of these existing engines are modified to *require* Knowledge Platform. Every one keeps working today, unchanged, with zero Knowledge Platform present (dormancy rule) — enrichment is opt-in and degrades gracefully to today's behavior when Knowledge Platform has no relevant Approved data yet.

#### 4.2.9 Incremental indexing (Decision 9 — architectural commitment, not Phase 3 work)

- The Knowledge Builder's default mode processes only sources changed or newly Approved since the last run — a `lastIndexedAt` watermark per connector, in the same spirit as the `fireAt` watermark already used by `functions/src/reminders/schedule.js`.
- A full repository rebuild is a separate, explicitly-invoked operation — never the default, never silent.
- This is committed to now as an architectural constraint on the future Builder; no Builder code exists yet to apply it to.

### 4.3 Analytics / Prediction / Recommendation / Executive Intelligence Platforms (revised)

Unchanged in spirit from the original proposal (thin composition over existing V1 engines, no reimplementation), with one addition: each platform may *optionally* query Knowledge Platform read-only for context (approved vocabulary, patterns, business rules) — this optional enrichment is what makes them "platforms" rather than bare re-exports, and is exactly why the master prompt's stack places Knowledge Platform beneath them. Concretely:

- **Analytics Platform**: aggregates `js/analytics/*`'s six existing engines behind a documented, versioned API; may enrich output with Approved Knowledge vocabulary/patterns.
- **Prediction Platform**: implement `js/prediction/python-provider.js`'s `predict()` for real (or an LLM-backed provider under the same contract, itself only reachable via an `ai-foundation` adapter, never directly) — still the single most concrete, low-risk Foundation-adjacent task available, entirely independent of Knowledge Platform's own build-out.
- **Recommendation Platform**: composes `js/recommendation/*` + `js/simulation/*`; reconciling the two existing separate explainability systems remains an open decision (see closing questions).
- **Executive Intelligence**: extends `executive-analytics.js`'s fusion pattern, optionally Knowledge-aware (e.g., citing which Approved source justifies a narrative claim).

Each platform must degrade gracefully to pure V1 composition if Knowledge Platform has no relevant Approved data — mirroring the `safe(label, fn)` graceful-degradation convention already used throughout `js/app.js`'s ctx-building.

### 4.4 Document Intelligence & the first pilot consumer (revised — NOR is a pilot, not the product)

Knowledge Platform is not being built "for NOR." NOR is chosen only as the **first, narrowest, best-bounded pilot consumer**, per the master prompt's own Phase 6 sequencing and because it already has one clean shared view-model (`buildNorViewModel`) across all three duplicated renderers found in §2.1.

A NOR pilot would: (a) run the Documents connector over the existing `templates/nor.js` + `nor-paper.js` + `nor-excel-exporter.js` as Draft knowledge (there is no historical filled-document corpus to mine — see §2.1 — so the source is the template *code*, not past output), (b) surface it as Candidate for review, (c) only once Approved, let the NOR Document Engine optionally consume it as additional structure/vocabulary input — with the three-times-duplicated layout collapsing toward one declarative source **over time**, not by ripping out today's renderers on day one.

To keep the platform honestly domain-agnostic rather than accidentally NOR-shaped, **Phase 6 acceptance should require exercising the Documents connector (or the Configuration/Business Rules connector) against at least one structurally different domainType in the same phase** — e.g., a lightweight pass over Petty Cash terminology or an Engineering SOP — before declaring the Knowledge Platform foundation "done." This is a recommendation, listed as an open question below, not yet a decision.

### 4.5 What V2 must NOT do at Foundation stage (revised)

- Must not touch `js/app.js`, any `*-store.js`, any existing engine in `js/analytics|services|engines|prediction|recommendation|simulation`, or `functions/src/*`.
- Must not introduce a second document-rendering universe; Knowledge Platform targets *existing* template/component functions as optional consumers, never a replacement.
- Must not persist filled documents anywhere without an explicit, reviewed retention/PII decision.
- Must not call any LLM/AI provider yet — `ai-foundation/adapters/*` stay `NOT_IMPLEMENTED` stubs, mirroring `python-provider.js`'s own current state.
- Must not hardcode any `domainType`-specific logic inside `knowledge/repository/` or `knowledge/lifecycle/` — domain specificity lives only in connectors and data (Decision 1, enforced structurally).
- Must not let any existing engine's behavior change based on Knowledge Platform's presence or absence during Foundation — every enrichment path is read-only, additive, and optional (Decision 8).

---

## 5. Recommended Phase 3 (Foundation) scope — revised, for your approval

Narrow, additive, fully dormant, schema-and-contract only:

1. Create `js/v2/` with a single `index.js` never imported by anything (a structural no-op proving dormancy) plus a `README.md` stating the dependency-direction rules from this document (§4.1, §4.2.7 in particular).
2. Design (types/shapes only, no logic) the `KnowledgeItem` schema and the five-state lifecycle as data — generic across `domainType`, with `domainType`/`kind` as registry-backed values, not hardcoded enums.
3. Design the connector registry contract (mirrors `provider-registry.js`) — interface only; zero real connectors implemented yet.
4. Design the `ai-foundation` adapter contract (mirrors `prediction-provider.js`) — interface only; stub adapters that return `NOT_IMPLEMENTED`, exactly like `python-provider.js` today.
5. Define the ten Knowledge Metrics as a typed `KnowledgeHealthReport` shape — no computation.
6. Explicitly defer to Phase 4+: any real connector implementation (including the Documents connector / NOR pilot), any review-queue UI, any LLM adapter implementation, state-machine generalization, module-registry generalization, and explainability unification.

**I am stopping here, per the master prompt's instruction to wait for approval before implementing.** Open decisions before any Phase 3 code is written:

1. Does the revised `js/v2/` layering — `knowledge/` as the domain-agnostic core, `ai-foundation/` as its only permitted dependent, never the reverse — match your intent?
2. Should Phase 6 acceptance criteria require proving domain-agnosticism with a second `domainType` alongside NOR (§4.4), or should Phase 6 stay strictly NOR-only per the master prompt's literal sequencing?
3. Should Phase 3 stop strictly at schema/contract/type design with zero storage or connector implementation (as scoped above), or do you want a minimal in-memory repository stub built now too?
4. Should the review/approval workflow (Pending Review queue, who may approve) reuse the existing `role-registry.js` capability model, or does Knowledge approval need its own, separate role concept?
5. Should reconciling the two existing explainability systems (prediction-side vs. dispatch-side) be pulled forward into Foundation, or deferred until Recommendation Platform work actually needs it?
