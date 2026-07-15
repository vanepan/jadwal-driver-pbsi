# Knowledge-Repository-Adaptation.md — Repository Compatibility & Change Plan

> Phase 3 of Sarpras Intelligence's Knowledge Acquisition track. Assessment
> and plan only — **no repository code was written or modified** to produce
> this report, per this track's explicit constraint ("your Architecture
> Assessment concluded that the repository already exists; do not redesign
> it").
>
> Grounded in direct reading of: `js/v2/knowledge/repository/contracts/repository-contract.js`,
> `js/v2/knowledge/repository/implementations/memory-repository.js`,
> `js/v2/knowledge/contracts/knowledge-item-contract.js`,
> `js/v2/knowledge/registry/kind-registry.js`,
> `js/v2/knowledge/registry/domain-type-registry.js`,
> `js/v2/knowledge/lifecycle/lifecycle-engine.js`,
> `js/v2/knowledge/contracts/review-contract.js`, and
> `js/v2/ui/knowledge-center.js`. Every claim below cites the specific file
> and behavior it rests on.

---

## Executive Summary

**The existing repository requires zero code changes to store every
Knowledge Asset shape proposed in `Knowledge-Asset-Specification.md`.** This
is not an optimistic estimate — it is a structural fact, verified by reading
`memory-repository.js` directly: `payload` is never inspected, validated, or
branched on by any repository method. The repository's only two points of
contact with "what kind of knowledge is this" are (1) `isKnowledgeItem()`'s
check that `kind` is a *registered* string (not that its payload matches any
particular shape), and (2) `list()`'s optional `filter.kind` equality check
(also shape-blind). Both already work, unmodified, for any `kind` value that
exists in `kind-registry.js` — including the five new ones this track
proposes.

The only required change anywhere in the platform is **five one-line,
additive entries in `kind-registry.js`'s `bootstrap()` function** — the
exact extension path that file's own header comment already documents
("Phase 4+ may add a payload-shape typedef per kind once real connectors
exist; the registry itself does not need to change"). No other file needs
to be touched to make storage, retrieval, filtering, search, versioning,
lifecycle transitions, review workflow, or the Knowledge Center UI work with
the new Knowledge Asset kinds.

---

## 1. Compatibility Assessment

Verified capability-by-capability against `repository-contract.js`'s eleven
named methods, using the real `memory-repository.js` implementation as the
concrete evidence (it is the platform's only real, non-stub backend today):

| Capability | Method | Shape-aware? | Compatible with new kinds as-is? |
|---|---|---|---|
| Read / Identity lookup | `getById` | No — looks up by `id` only | ✅ Yes |
| Snapshot | `getVersion` | No | ✅ Yes |
| Read (list) | `list(filter)` | Only `domainType`/`kind`/`lifecycleState` equality — never inspects `payload` | ✅ Yes |
| Search | `search(query)` | `JSON.stringify(item.payload).toLowerCase().includes(q)` — a generic serialize-and-substring-match that works on **any** payload shape, new or old, with zero modification | ✅ Yes, for free |
| Write (create) | `create(item)` | Validates via `isKnowledgeItem()` — checks `id`/`version`/`domainType`(registered)/`sourceType`/`kind`(registered)/`confidence`(0–1)/`lifecycleState`(valid enum). **Never validates `payload` contents.** | ✅ Yes, provided `kind` is registered |
| Version / Write | `appendVersion(id, patch)` | Same `isKnowledgeItem()` re-check on the merged result, plus a `canTransition()` lifecycle-legality check — both shape-blind on `payload` | ✅ Yes |
| History | `getHistory` | No | ✅ Yes |
| Rollback | `rollback` | Validates a `ReviewDecision` (`isValidReviewDecision`) — shape-blind on `payload` | ✅ Yes |
| Dependency lookup | `getDependencies` | Filters by `kind === 'relationship'` and a `RelationshipPayload` shape check — unrelated to the five new kinds, untouched | ✅ Yes (no interaction) |
| Metrics | `getMetrics` | Tallies by `domainType`/`lifecycleState` only — generic `{}` accumulator, no kind-specific logic | ✅ Yes |
| Review lookup | `getPendingReview` | Filters by `lifecycleState` only | ✅ Yes |

**Conclusion**: 11/11 methods are compatible with zero code changes. This is
not a coincidence — it is the direct, intended consequence of Decision 1
("no core module ever hardcodes `if kind === 'vocabulary'`") having actually
been enforced throughout `knowledge/repository/`, confirmed by reading the
implementation rather than assuming the architecture doc's promise held.

### 1.1 The one real dependency: the `kind` registry check

`isKnowledgeItem()` (`knowledge-item-contract.js:75`) calls `hasKind(item.kind)`
— an item whose `kind` is not registered fails structural validation and
`create()`/`appendVersion()` reject it (`REPOSITORY_ERRORS.INVALID_ITEM`).
This is the **only** gate standing between "the repository accepts a
`rendering_rule`/`workflow`/`ontology`/`organizational_reasoning`/
`question_tree` asset today" and "it doesn't" — and it is a data
registration, not a code change to the gate itself.

### 1.2 The UI is also already compatible

`js/v2/ui/knowledge-center.js:52,294` calls `listKinds()`/`getKind()` from
the registry directly — it does not hardcode a switch statement or a fixed
list of known kinds. Once the five new kinds are registered, Knowledge
Center's kind filter dropdown will list them automatically, with no UI code
change. (Verified by direct read, not assumed.)

---

## 2. Required Changes

Exactly one file requires an edit; five files are new; zero files require
removal or restructuring.

| # | Change | File | Nature |
|---|---|---|---|
| 1 | Register 5 new `kind` ids | `js/v2/knowledge/registry/kind-registry.js` (inside `bootstrap()`) | **Additive edit** — 5 new `registerKind(id, label)` calls, same pattern as the 18 already there; zero existing lines touched |
| 2 | Define `RenderingRuleEntry` payload shape + `isRenderingRuleEntry()` | New file, e.g. `js/v2/knowledge/language/contracts/rendering-rule-contract.js` | **New file** |
| 3 | Define `WorkflowEntry` payload shape + `isWorkflowEntry()` | New file, e.g. `.../workflow-contract.js` | **New file** |
| 4 | Define `OntologyEntry` payload shape + `isOntologyEntry()` | New file, e.g. `.../ontology-contract.js` | **New file** |
| 5 | Define `OrganizationalReasoningEntry` payload shape + `isOrganizationalReasoningEntry()` | New file, e.g. `.../organizational-reasoning-contract.js` | **New file** |
| 6 | Define `QuestionTreeEntry` payload shape + `isQuestionTreeEntry()` | New file, e.g. `.../question-tree-contract.js` | **New file** |

No change to: `repository-contract.js`, `memory-repository.js`,
`null-repository.js`, `knowledge-item-contract.js`, `identity-contract.js`,
`lifecycle-contract.js`, `lifecycle-engine.js`, `review-contract.js`,
`review-workflow-engine.js`, `domain-type-registry.js` (both `nor` and
`memorandum` are already registered — see
`Knowledge-Asset-Specification.md` §11), `knowledge-center.js`, or any
`services/*` facade.

---

## 3. Schema Extensions

**None, to `KnowledgeItem` itself.** The envelope
(`id/version/domainType/sourceType/kind/payload/confidence/lifecycleState/
provenance/approvedBy/approvedAt/preferenceRationale/createdAt/updatedAt`)
is unchanged, field-for-field. The five new payload shapes (§2, rows 2–6)
are extensions **within** the existing, deliberately-opaque `payload` field
— exactly the extension point `knowledge-item-contract.js`'s own header
promises ("this contract should not need to change to accommodate a new
domainType or kind — only the registries do"). This track's evidence
(`Knowledge-Asset-Specification.md`) is the first real test of that promise
against genuinely new shapes, and it holds.

---

## 4. Migration Strategy

**No data migration is required or possible in the classical sense**,
because there is no durable existing data to migrate: `memory-repository.js`'s
own header states plainly that it is "non-durable" and "data does not
survive a process restart" — it exists as a reference implementation for
Phase 6+ services to compose against, never as a production backend. There
is no populated Knowledge repository anywhere in this system today whose
schema needs an ALTER-TABLE-style change.

The only "migration" that actually applies is **registry bootstrap
sequencing**, and it is inherently safe:

- `kind-registry.js#bootstrap()` runs once at module load, populating a
  process-wide `Map`. Adding five entries is purely additive — no existing
  key is renamed, removed, or reassigned a different label, so any code
  already holding a reference to an existing `kind` value (e.g. `'rule'`,
  `'template_pattern'`) is entirely unaffected.
- Should a future durable backend (the README's own long-anticipated
  Firebase-backed repository) be built, the same additive principle should
  hold by construction: `payload` is stored as an opaque value under
  whatever the backend's persistence mechanism is (a JSON blob, a
  sub-document, etc.) precisely because the repository contract never
  requires the backend to understand `payload`'s internal shape. **This
  report recommends that constraint be an explicit, binding requirement on
  any future real backend** — the moment a backend needs to know a
  `kind`'s payload shape to store it correctly, this compatibility
  guarantee breaks, and every future new `kind` becomes a real backend
  migration again.

---

## 5. Backward Compatibility Analysis

| Concern | Finding | Evidence |
|---|---|---|
| Existing `KnowledgeItem`s of pre-existing kinds | Entirely unaffected — no existing `kind` is renamed or reinterpreted | `kind-registry.js` bootstrap is purely additive |
| Existing callers of `isKnowledgeItem()` | Unaffected — the function's logic is unchanged; it simply now also accepts 5 more `kind` strings | Direct read of `knowledge-item-contract.js:71-81` |
| Existing callers of `list({kind: ...})` | Unaffected — filtering logic unchanged, generic equality check | `memory-repository.js:89-95` |
| Knowledge Center UI | Unaffected in the breaking sense; **additive** in effect — new kinds appear in filters automatically | `knowledge-center.js:52,294` |
| `nor-connector.js`, `nor-generator.js`, and the rest of the real NOR pilot | Unaffected — none of these files enumerate `kind-registry.js`'s contents; they reference specific kinds by name (`'structure'`, etc.), which still exist unchanged | Confirmed by architecture: no file inspects `listKinds()` output as a completeness check |
| `dormant-subsystems.js` governance register | Unaffected — this track adds no new dormant subsystem (no engine is being built, only shapes); if a future `reasoning/` engine is built per this track's own prior Architecture Assessment §7, *that* work would need a dormant-subsystems entry until it has a real caller, but that is out of this track's scope | `js/v2/dormant-subsystems.js` header |
| Ownership-check scripts (`scripts/knowledge-ownership-check.mjs`, etc.) | Not run or modified by this track; should be re-run once the registry edit (§2, row 1) actually lands, as a verification step, per this platform's own established discipline | `SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md` §3.5 |

**No breaking change of any kind is introduced by this plan.**

---

## 6. Repository Impact

Zero. Restated precisely because it is the single most load-bearing claim
in this document: not one of the repository's 11 contract methods, and not
the one real backend implementing them, requires a code change to support
any of the five new Knowledge Asset kinds. The entire required change
surface is a registry data addition (§2, row 1) plus new, additive contract
files (§2, rows 2–6) that live beside — never inside — the repository.

This is a direct consequence of a design choice already made and enforced
before this track began (`payload` as opaque `*`, `kind`/`domainType` as
registry-backed vocabulary rather than a hardcoded switch) — this report's
contribution is confirming, by reading the actual implementation rather
than trusting the documented intent, that the promise holds under a real,
concrete test (five genuinely new shapes, not a hypothetical).

---

## 7. Implementation Plan

Ordered smallest-and-safest-first, consistent with this project's
"incremental, isolated, backward-compatible, feature-gated" development
rule. **This track's STOP CONDITION means none of the following is executed
now** — it is the plan for whoever picks this up after architectural review.

| Step | Action | Risk |
|---|---|---|
| 1 | Add 5 `registerKind()` calls to `kind-registry.js#bootstrap()` | None — additive, mirrors 18 existing lines |
| 2 | Add the 5 new payload-shape contract files (§2, rows 2–6), each with its typedef + `isXEntry()` validator only — no logic, no repository/connector wiring | None — new files, zero existing-file edits, matches `knowledge/language/contracts/*`'s established convention exactly |
| 3 | Re-run `scripts/knowledge-ownership-check.mjs` (and any other `*-ownership-check.mjs` that enumerates kinds) to confirm the addition doesn't trip an existing invariant assertion | None — verification only |
| 4 | **Decision required before any real asset is created** (not resolved by this track, see Open Questions): what `provenance.connectorId`/`sourceType` a manually-authored, reverse-engineering-sourced asset should carry, since "this specification document" is not itself a registered `Connector` (`connector-contract.js`). Two honest options: (a) author a minimal, explicit `sourceType: 'manual-analysis'` convention for human-authored seed knowledge (no new connector, no new repository capability — just an agreed string), or (b) treat it as out of scope until a real Documents/Memorandum connector exists and re-derive these same findings through that connector's normal acquisition path instead of seeding them directly. This report takes no position beyond naming the decision. |
| 5 | *(Explicitly NOT this track's work, listed only for completeness)* Populate real Draft-lifecycle assets from `NOR-Specification.md`'s findings, route them through the real, existing review workflow, and let a human Approve or reject each one — this is content authoring, already correctly scoped as "next phase, not engineering" by this platform's own `js/v2/README.md`. |

---

## Open Questions

1. Where should the five new contract files physically live —
   `knowledge/language/contracts/` (extending the existing "internal
   vocabulary" family) or a new `knowledge/reasoning/contracts/` grouping
   anticipating the `reasoning/` domain this track's prior Architecture
   Assessment Report proposed? (Repeated from `Knowledge-Asset-Specification.md`
   §10 — a placement choice, not a compatibility question; either location
   is equally compatible with the repository per this document's findings.)
2. What `sourceType`/`connectorId` convention should human-authored,
   document-reverse-engineering-sourced Knowledge Assets use, given no
   connector produced them? (§7, step 4 — genuinely unresolved, needs an
   explicit decision before any real asset from this track's findings can
   be `create()`d.)
3. Should the binding "payload must remain opaque to any future backend"
   principle this report recommends (§4) be written down as an explicit,
   tenth-plus architectural decision in `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md`,
   or is it adequately implied already by Decision 1? This report recommends
   making it explicit, since it is the actual mechanism (not just Decision 1's
   spirit) that makes this whole adaptation a zero-repository-change exercise.
