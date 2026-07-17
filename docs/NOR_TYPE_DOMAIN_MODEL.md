# Sarpras Intelligence V2 — NOR Type Domain Model (Design Recommendation)

> Scope: answers the four questions raised before implementing
> [`NORTH_STAR_READINESS_AUDIT.md`](NORTH_STAR_READINESS_AUDIT.md)'s Critical
> items 1–3. Method: direct code reading only (`js/v2/problem-intelligence/`,
> `js/v2/conversation/`, `js/v2/knowledge/`, `js/v2/reasoning/`,
> `js/v2/document-intelligence/`). No code was changed to produce this
> document. **No implementation should start from this document alone** — it
> ends with a recommendation, not a merged design.

---

## Headline finding

The abstraction this phase needs is not missing. It already exists, twice,
under the name **`type`** — and it already dies on arrival.

- `problem-parser.js:183-187` extracts `facts.type = 'Perjalanan Dinas'` for
  the `business_trip` category.
- `intent-engine.js:98-102` independently extracts the *same kind of fact*
  for `CREATE_NOR` via `NOR_TYPE_KEYWORDS`, with three values: `'Perjalanan
  Dinas'`, `'Reimbursement'`, `'Pengadaan'`.
- `intent-contract.js:72` already lists `type` as CREATE_NOR's first
  required fact, labelled **"Jenis NOR"** (literally "NOR Type" in
  Indonesian) — this is the platform's own name for the concept, not
  something this document is inventing.

Two independent, hand-maintained keyword tables computing the same fact is
itself a small pre-existing bug: `problem-parser.js`'s table only recognizes
`dinas`/`perjalanan` (never `pengadaan`/`pembelian`/`reimbursement`), while
`intent-engine.js`'s table recognizes all three. They have already drifted.

Nothing downstream ever reads `gatheredFacts.type` again after it's asked
for. It is not used to select a field schema, not used to scope a Knowledge
query, not used to filter Gap Detection, not used by Reasoning. That is the
entire mechanism of every Critical finding in the audit — not five separate
bugs, one missing wire.

**Recommendation: the abstraction is NOR Type — an existing, already-named
fact that needs to become a registered vocabulary value and an actual
scoping key, not a new concept.**

---

## Q1 — What is the correct abstraction?

Candidates considered, each checked against what's *already* claimed by
another concept in this codebase (reusing a word that already means
something else is a real cost here — see `problem-category-contract.js`'s
own header, which goes out of its way to explain why Problem Category and
Intent are "related, never conflated, never merged into one enum"):

| Candidate | Verdict | Why |
|---|---|---|
| **Context** | Rejected — name collision | `conversation/context/context-builder.js#buildContext` already returns a `Context` object (conversation history + pattern matches). Reusing the word for a second, unrelated concept would make both harder to explain. |
| **Scenario** | Rejected — name collision | The audit's own Sprint 8.5 names its four end-to-end tests "Acceptance Scenarios." Reusing it for a data-model concept invites confusion between "a test scenario" and "a NOR's scenario field." |
| **Workflow** | Rejected — double collision | Already a registered `kind` (`kind-registry.js:81`, describes an approval-chain KnowledgeItem) **and** a distinct `WORKFLOW_ROUTE` enum (`workflow-route-contract.js`, a routing target: CONVERSATION/SEARCH/etc.). A third meaning would be actively misleading. |
| **Document Class** | Viable but unnecessary | Clean, unclaimed name — but it introduces a brand-new noun into an already-dense taxonomy (Problem Category, Intent, domainType, kind) when a narrower, already-named concept covers the actual gap. |
| **NOR Type** | **Recommended** | Already the platform's own name (`"Jenis NOR"`, `intent-contract.js:72`). Already computed in two places. Only missing: registration and propagation. |

**Why not something broader that also covers non-NOR intents** (UPLOAD_KNOWLEDGE, ARCHIVE_DOCUMENT, etc.)? Those five intents already have their own scoping field — `domainType` itself is the fact they gather (`intent-contract.js:80,84,89,93,96`, field `domainType`, e.g. "Dokumen ini termasuk domain apa?"). They don't need a second scoping layer today. NOR Type is specifically the missing subdivision **within** `domainType: 'nor'`. Generalizing now would be building for a hypothetical Phase 9 need, which CLAUDE.md's incremental-only directive and the Phase 8 plan's "do not redesign architecture" both rule out.

---

## Q2 — Propagation trace through the 9-stage pipeline

Each stage cites the real file/line where the change would land — this is a trace, not a diff.

**1. Prompt → 2. Classification** (`problem-parser.js`)
NOR Type extraction moves out of `problem-parser.js`'s private
`business_trip` branch (`:183-187`) and out of `intent-engine.js`'s private
`NOR_TYPE_KEYWORDS` (`:98-102`) into one shared, registered vocabulary (see
Q3). Both call sites read the same table — no more drift between what each
recognizes. This also directly informs the audit's Critical #1: once
`Pengadaan`/`pembelian` is a real, named signal instead of invisible to
`problem-parser.js`, category-scoring can prefer the more specific
`procurement` signal over the generic `NOR_CREATE_PHRASE` match instead of
`business_trip` winning by default.

**3. Intent Classification** (`intent-engine.js`, `intent-contract.js`)
`detectIntent()` keeps returning `CREATE_NOR` (the closed Intent enum is
untouched — see Q4/Design C for why touching it is the wrong move).
`extractedFacts.type` becomes the canonical NOR Type value, sourced from the
same shared table as stage 2.

**4. Conversation** (`conversation-service.js`, `intent-contract.js`)
`INTENT_FIELD_SCHEMA[CREATE_NOR]` (`intent-contract.js:71-78`), currently one
fixed array, becomes a function of NOR Type. The `procurement`
`fieldSchema` already written in `problem-category-contract.js:109-114`
(`item`/`quantity`/`purpose`/`budget`) is the *Pengadaan* branch — content
that already exists and is already correct, just attached to the wrong
taxonomy today (Problem Category, which `advanceProblemConversation()` uses
for the generic fallback loop, never for CREATE_NOR). `conversation-service.js`'s `advance()` (`:113-138`) is otherwise unchanged — it already recomputes from scratch every turn, so a NOR-Type-branched schema costs it nothing structurally.

**5. Knowledge Retrieval** (`knowledge-service.js` consumers)
Every `listKnowledge({ domainType: 'nor', ... })` call
(`question-optimizer.js:121`, `knowledge-gap-engine.js:49`,
`reasoning-engine.js:83`, `nor-composer.js:102`) gains an optional second
filter. `domainType` stays the coarse bucket — no migration of the 96
existing items' `domainType`. NOR Type is a second, finer dimension.

**6. Knowledge Gap Detection** (`knowledge-gap-engine.js`)
`detectKnowledgeGaps(domainType)` (`:57`) becomes
`detectKnowledgeGaps(domainType, norType)`. With the filter in place, "no
Approved Ontology for Pengadaan" becomes a real, correctly-scoped
`MISSING_CONTEXT` gap instead of today's false "zero gaps" (the audit's
Stage 4 finding) — the existing petty-cash Ontology no longer silently
satisfies a query it was never written for.

**7. Reasoning** (`reasoning-engine.js`, `rule-applicability-engine.js`)
`problem.facts.type` already flows through `Problem.facts`
(`problem-contract.js:31-35` — a plain, unconstrained fact bag; no contract
change needed here at all). `applicableRulesFor()` gains one more optional
check: when a candidate rule's own `payload.norType` is present, it must
match `problem.facts.type`, mirroring the exact "generic scan over payload,
never a fabricated schema" discipline `question-optimizer.js#resolveFromKnowledge`
(`:120-130`) already uses. This is orthogonal to — and does not fix — the
audit's separate Critical #4 (`reason()` is never called from the CREATE_NOR
path at all today; that's a wiring gap, not a modeling gap).

**8. Composer** (`nor-composer.js`)
`composeNorDocument(gatheredFacts, ...)` already receives `gatheredFacts`,
which already contains `type` (`:97` currently passes it straight through to
`proposeNorFields` unused for filtering). The
`listKnowledge({ domainType: 'nor', ... })` call at `:102` gains
`norType: gatheredFacts.type`. This is the literal fix for the audit's
single most dangerous finding (Stage 7: petty-cash boilerplate rendered into
a trip NOR as if correct) — patterns/rules ranked as applicable only when
their own recorded NOR Type matches or is absent (generic).

**9. Learning** (`learning-event-contract.js`, `composer-store.js`)
No contract change. `LearningEvent.domainType` (`:167`) stays the coarse
bucket; `evidence`/`after` are already opaque, schema-flexible fields
(`:177`) that can carry `norType` as ordinary data the moment
`composer-store.js#editSection` gets a real caller (a separate, already-known
gap — audit's High item 8, not part of this modeling question).

---

## Q3 — Minimal recommended architecture

**Register NOR Type as its own small vocabulary, but attach it to
`KnowledgeItem` as an optional payload-convention field rather than a new
required contract field.**

Concretely, two pieces:

1. **A new `nor-type-registry.js`**, Map-backed, same four-function shape
   every other vocabulary in this codebase already uses
   (`register/has/get/list`, identical to `domain-type-registry.js` and
   `kind-registry.js`). This is the ONE place `'Perjalanan Dinas'` /
   `'Reimbursement'` / `'Pengadaan'` are spelled — both `problem-parser.js`
   and `intent-engine.js` read it instead of maintaining two literal tables.
   `INTENT_FIELD_SCHEMA[CREATE_NOR]` becomes keyed by these same registered
   ids.

2. **`norType` as an optional, unvalidated field inside `KnowledgeItem`**
   (either a top-level optional field, or simply `payload.norType` by
   convention — the same convention `resolveFromProfileOverride`'s
   `key === 'default:<field>'` already establishes). Deliberately **not** a
   required, registry-validated field on `knowledge-item-contract.js` the
   way `domainType`/`kind` are. Reasons:
   - The 96 existing seeded items need zero migration — absence of
     `norType` is honestly read as "not scoped to one NOR type" (a real,
     legitimate state — a rendering rule about footer placement genuinely
     may apply to every NOR type), never a fabricated default.
   - `isKnowledgeItem()` (`knowledge-item-contract.js:71-81`) needs zero
     changes — it is explicitly documented as a structural check that
     "should not need to change to accommodate a new domainType or kind"
     (`:23-25`), and a required new field would break that promise.

Every consumer (`knowledge-gap-engine.js`, `reasoning-engine.js`,
`nor-composer.js`, `question-optimizer.js`) gains an **optional** norType
parameter that is a no-op when absent — every existing call site, test, and
fixture that doesn't pass it keeps behaving exactly as it does today.

---

## Q4 — Three alternative designs, compared

### Design A — Registered vocabulary + required KnowledgeItem field
Same as Q3's recommendation, except `norType` becomes a required,
registry-validated field on `knowledge-item-contract.js` itself (checked by
`isKnowledgeItem()` the same way `domainType`/`kind` are).

| | Assessment |
|---|---|
| Scalability | High — new NOR type is a pure registry entry, zero branching code. |
| Simplicity | Medium — touches a foundational Phase 3 contract that explicitly documents itself as not expecting to change for new domainTypes/kinds. |
| Backward compatibility | **Breaks today** — all 96 existing items fail `isKnowledgeItem()` until migrated with a real or explicit-null `norType`. |
| Future extensibility | Best of the three — fully registry-validated, listable, introspectable. |

### Design B — Payload-only convention, no registry at all
`norType` is just a string callers agree to put in `payload.norType` or a
fact key, with no central registration — each file (`problem-parser.js`,
`intent-engine.js`) keeps its own literal list of recognized values.

| | Assessment |
|---|---|
| Scalability | Medium — fine at 3 values; unwieldy and drift-prone past that (this is *literally the bug that exists today* — two unregistered literal tables already disagree). |
| Simplicity | Highest short-term — zero contract files touched. |
| Backward compatibility | Best — nothing to migrate. |
| Future extensibility | Weakest — an unregistered string can never be validated or listed the way `listDomainTypes()`/`listKinds()`/`listProblemCategories()` already let every other vocabulary in this platform do. Violates the "vocabulary must be registered, never a hardcoded switch" principle stated near-verbatim in three existing files' own headers. |

### Design C — Fold NOR Type into Intent (one Intent per NOR type)
Replace the single `CREATE_NOR` with `CREATE_NOR_TRIP` /
`CREATE_NOR_PROCUREMENT` / `CREATE_NOR_ADMIN` in `intent-contract.js`'s
closed `INTENT` enum, each carrying its own natural field schema. Make
`CATEGORY_TO_INTENT` (`problem-solving-service.js:68-70`) a total 1:1
mapping instead of today's partial one.

| | Assessment |
|---|---|
| Scalability | Poor — every new NOR type requires growing a `intent-contract.js` enum its own header calls "closed... deliberately small" (`:42-43`, "exactly the six the mission names"). |
| Simplicity | Deceptively simple (reuses an existing enum, no new concept) — but requires either duplicating `problem-category-contract.js`'s existing `procurement` fieldSchema or deleting it, and `problem-category-contract.js:14-23` explicitly documents Problem Category and Intent as taxonomies that must stay "related, never conflated, never merged into one enum." |
| Backward compatibility | Breaks any in-flight Conversation's `currentIntent.intent === 'create_nor'` check. |
| Future extensibility | Worst — this is structurally the same "one fixed shape per enum value" pattern that caused today's bug; it would just move the bug from "one CREATE_NOR schema" to "one schema per enum value," not remove the class of bug. |

### Recommendation

**Design A's registry, with Design B's non-breaking field convention** — i.e.
Q3 as written above. Design C is rejected outright: it revisits a documented
prior architectural decision (`problem-category-contract.js`'s own header),
which both this phase's brief and CLAUDE.md forbid.

---

## What this document deliberately does not decide

- The **exact registered NOR Type values** and whether the 96 seeded
  petty-cash items should be backfilled as `Reimbursement`, a new fourth
  value, or left unscoped (`norType: null`) — a content/business question,
  not an architecture question. `intent-engine.js`'s existing three values
  (`Perjalanan Dinas`/`Reimbursement`/`Pengadaan`) don't obviously include
  "petty cash realization" as its own thing; that needs a human call, not an
  invented mapping.
- Whether `norType` lives as a top-level `KnowledgeItem` field or inside
  `payload` — an implementation detail either way, not load-bearing to the
  model itself.
- The Critical #1 classification-scoring fix's exact formula — this
  document only establishes that a registered NOR Type signal is a
  prerequisite for fixing it honestly, not the fix itself.

These are implementation-phase decisions, out of scope for this document by
the request that produced it.
