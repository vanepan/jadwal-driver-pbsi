# Sarpras Intelligence V2 — Phase 8.5 North Star Validation & Readiness

> **Updated through Iteration 4 (NOR Onboarding Playbook).** First produced
> after Iteration 1 (pure validation, zero Knowledge authored), updated
> after Iteration 2 (Knowledge authoring — see
> `docs/CORE_NOR_KNOWLEDGE_PACK.md`), Iteration 3 (acquisition process
> design — see `docs/ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md`),
> and Iteration 4 (the process turned into concrete, step-by-step
> checklists — see `docs/NOR_ONBOARDING_PLAYBOOK.md`, which also carries
> this iteration's own Phase 8 completeness determination and Phase 9
> first-sprint definition, §9-§10 of that document). Iteration 4 changed no
> code and authored no Knowledge — every number below is unchanged from
> Iteration 3. Every number is either **measured** (printed by
> `scripts/north-star-acceptance-check.mjs`, reproducible by running it) or
> **traced** (a direct code citation). Prior iterations' findings are
> preserved where still true; superseded numbers are shown with their prior
> value struck through.

---

## Headline finding

Iteration 1 found that Composition cites the same 9 real, petty-cash-worded
patterns into every NOR type's document — including a table-purchase
request — because zero KnowledgeItems had ever been tagged with
`payload.norType`.

Iteration 2 fixed the *cause*, not just re-confirmed the symptom: every
genuinely petty-cash-specific fact in the platform's one real evidence base
(two real, filled NOR PDFs) is now tagged `payload.norType: "Realisasi
Petty Cash"` — a NOR Type that did not previously exist in the registry,
registered specifically because that is what the evidence actually
supports (not "Perjalanan Dinas", which has zero real document evidence
behind it — see `CORE_NOR_KNOWLEDGE_PACK.md` §3).

**Result, measured fresh:** the wrong-domain sentence is gone from every
non-petty-cash scenario's Composition. Knowledge Gap Detection now reports
a real, honest, critical gap ("No Approved Ontology... NOR Type
'Pengadaan'") for all 4 named acceptance scenarios, instead of the false
"0 gaps" every prior report found. **This is a correctness win, not a
richness win** — none of the 4 named scenarios (Perjalanan Dinas, Pengadaan,
Reimbursement, an unregistered Administration answer) gained real
domain-specific content, because none of them resolve to Realisasi Petty
Cash, the only NOR Type this repository has real evidence for.

---

## 1. End-to-End Pipeline Validation Report

4 scenarios, driven for real, post-Iteration-2. Per-stage verdict:

| Stage | Business Trip | Procurement | Reimbursement | Administration |
|---|---|---|---|---|
| 1. Problem Classification | `business_trip` (0.80) ✓ correct | `business_trip` (0.30) — still misrouted, Critical #1 unfixed | `business_trip` (0.30) — misrouted | `business_trip` (0.30) — misrouted |
| 2. Intent Detection | `create_nor` (0.44) ✓ | `create_nor` (0.44) ✓ | `create_nor` (0.44) ✓ | `create_nor` (0.44) ✓ |
| 3. NOR Type Resolution | `Perjalanan Dinas`, from utterance ✓ | `Pengadaan`, from utterance ✓ | `Reimbursement`, from utterance ✓ | unresolved — honestly asked, not guessed ✓ |
| 4. Conversation | asks destination/traveler/departureDate/returnDate/budget — correct shape, still unevidenced content (see §3) | asks item/quantity/purpose/budget ✓ correct shape | asks trip-shaped questions — known, deliberately-deferred gap | same fallback + an extra "Jenis NOR" turn — known gap |
| 5. Knowledge Retrieval | 96 Approved items; 54 now correctly scoped to Realisasi Petty Cash, **0 of them match this scenario** | same 96; 0 match | same; 0 match | same; 0 match |
| 6. Knowledge Gap Detection | ~~0 gaps — false confidence~~ **→ 1 real critical gap** ("No Approved Ontology... NOR Type 'Perjalanan Dinas'") | ~~0 gaps~~ **→ 1 real critical gap**, correctly named `'Pengadaan'` | ~~0 gaps~~ **→ 1 real critical gap** | ~~0 gaps~~ **→ 1 real critical gap** |
| 7. Reasoning | never invoked (confirmed unchanged); hypothetical probe still shows all 12 petty-cash rules as "applicable" regardless of NOR Type — a separate, `appliesWhen`-based scoping gap, not fixed this iteration (see §6) | same | same | same |
| 8. Composition | succeeds; ~~9 patterns~~ **→ 4 patterns cited, all genuinely generic** (salutation, closing sentence, date line, Terbilang); the petty-cash sentence is **gone**; ~~19~~ **→ 14 sections** | succeeds; **same 4 generic patterns**, wrong-domain sentence **gone** from a table-purchase document | same 4 generic patterns | same 4 generic patterns |
| 9. Review Model | dev-mode section count only, no real surface (unchanged) | same | same | same |
| Learning | 0 Learning Events from any of the 4 real ComposerDocuments (unchanged) | same | same | same |

**Reading this table honestly:** Conversation-stage correctness is unchanged from Iteration 1 (2 of 4 scenarios ask the right questions). What changed is Knowledge Gap Detection (0/4 → 4/4 honest) and Composition safety (0/4 → 4/4 free of wrong-domain content) — both purely from correcting *what the existing engines read*, not from adding capability to them.

---

## 2. Conversation Quality Report

**Unchanged from Iteration 1** — Conversation's question sequence depends only on registered `fieldSchema`, which this iteration did not touch (no real evidence existed to author Reimbursement's or Administration's schema from). See Iteration 1's own table, reproduced here for completeness:

| Scenario | Questions asked | Sequence | Duplicate/irrelevant? | Completion |
|---|---|---|---|---|
| Business Trip | 5 | destination → traveler → departureDate → returnDate → budget | none | READY |
| Procurement | 4 | item → quantity → purpose → budget | none | READY |
| Reimbursement | 5 | destination → traveler → departureDate → returnDate → budget | all 5 wrong for a parking reimbursement | READY (wrong questions) |
| Administration | 6 | type → destination → traveler → departureDate → returnDate → budget | 5 of 6 wrong | READY (wrong questions) |

No new Conversation Quality defect or fix this iteration. Recommendation unchanged: this is a NOR Type content-authoring gap (now further clarified as an *evidence* gap — see `CORE_NOR_KNOWLEDGE_PACK.md` §7), not a Conversation engine defect.

---

## 3. Knowledge Coverage Report

Real counts, post-Iteration-2, per registered NOR Type:

| NOR Type | Tagged specifically to this type | Generic items that still apply |
|---|---|---|
| Perjalanan Dinas | **0** | 42 |
| Pengadaan | **0** | 42 |
| Reimbursement | **0** | 42 |
| **Realisasi Petty Cash** (new, real, evidenced) | **54** | 42 |

By kind, for Realisasi Petty Cash specifically (all Verified, direct `listKnowledge()` query): 1 ontology, 1 workflow, 10 rules, 3 rendering rules, 6 patterns, 8 signatories, 1 approval_chain, 5 statistics, 6 organizational_reasoning, 12 question_tree, 1 vocabulary. The 3 registered-but-unevidenced types (Perjalanan Dinas, Pengadaan, Reimbursement) now honestly show **zero** tagged coverage each, instead of Iteration 1's misleading "47 items, identical across all three."

Full item-by-item classification rationale (which of the ~73 real facts are Generic vs. Realisasi-Petty-Cash-specific, and why): `docs/CORE_NOR_KNOWLEDGE_PACK.md` §2.

---

## 4. Missing Knowledge Inventory

| NOR Type | Ontology | Workflow | Rules | Rendering | Templates | Field Schema |
|---|---|---|---|---|---|---|
| Realisasi Petty Cash | evidenced | evidenced | evidenced (10) | evidenced (3 type-specific + 12 generic) | evidenced (6) | authored (1 field, evidenced) |
| Perjalanan Dinas | absent | absent | absent | generic only | absent | placeholder, unevidenced |
| Pengadaan | absent | absent | absent | generic only | absent | placeholder, unevidenced |
| Reimbursement | absent — see the framing question below | absent | absent | generic only | absent | absent, deliberately |
| Administration | absent — not a registered NOR Type | — | — | — | — | absent |

**Unresolved framing question (new this iteration, highest leverage):** a real, approved, production document called "Reimbursement" exists (`docs/REIMBURSEMENT_TEMPLATE_STANDARD.md`) — but it is a driver/vehicle operational-cost claim *form*, architecturally unrelated to the `nor` domain, never once called a "Nota Organisasi." Whether the registered NOR Type "Reimbursement" is meant to reference this real process is a human decision, not something this report can resolve by more searching. See `CORE_NOR_KNOWLEDGE_PACK.md` §5.

Administration remains not even a registered NOR Type — unchanged from Iteration 1.

---

## 5. Remaining Technical Blockers

Unchanged from Iteration 1, re-verified live this iteration — none are Knowledge gaps, so Iteration 2's authoring work could not and did not touch them:

1. **Critical #1 (classification regression) — still open.**
2. **Reasoning still never runs on the real CREATE_NOR path** — and its `appliesWhen` scoping mechanism is not `norType`-aware even where Knowledge now correctly is (see §6).
3. **`nor-generator.js`'s structural-suggestion counts are still unscoped by NOR Type.**
4. **No real Review surface.**
5. **`editSection` still has zero real callers** (0 Learning Events from 4 real ComposerDocuments, confirmed fresh).

---

## 6. Remaining Knowledge Blockers

Superseded from Iteration 1 — "author Pengadaan/Reimbursement/Administration Knowledge" is no longer a to-do, it is a **finding**: this repository does not contain the evidence to do it honestly.

**Iteration 3 update:** the process for closing each of these is now formally documented — `docs/ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md` — including an evidence checklist, guidelines on what may vs. may never be inferred, and a worked step-by-step walkthrough (using Pengadaan as the example) that requires zero new code. What follows is unchanged in substance, now backed by that process:

1. **Resolve the Reimbursement framing question (§4)** — the single highest-leverage remaining item; it may turn out zero new authoring is needed at all, just a mapping decision plus reusing an already-approved template (`docs/REIMBURSEMENT_TEMPLATE_STANDARD.md`).
2. **Obtain one real Pengadaan example or interview** — no amount of further repository search will produce what was never recorded in it. Once obtained, `ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md`'s worked example is the exact process to follow.
3. **Decide whether Administration is a real NOR Type**, and if so, obtain a real example.
4. **Obtain real evidence for what a Perjalanan Dinas NOR actually contains** — its current schema is a mission-brief hypothetical, not evidenced fact; this repository has no real trip-NOR document to check it against.
5. **Teach `rule-applicability-engine.js`'s `appliesWhen` about `norType`** (§1 row 7) — not urgent while Reasoning stays unwired from CREATE_NOR, but load-bearing the moment it is wired in (Phase 9 priority list, item 5 below).
6. **New this iteration — an ownership-register gap, not a Knowledge gap:** several real, tested engines (`knowledge/extraction/*`, all of `knowledge/promotion/*`, `knowledge/builder/*`, `knowledge/machine-learning/{outlier,pattern-mining,clustering}`) have zero production callers and, per `dormant-subsystems.js`'s own stated policy ("both zero → dead code; delete it"), should either be wired up or removed — but none is entered in that register, because the register's own definition of dormant ("readers>0, writers=0") doesn't cover the "both zero" case. Worth a dedicated ownership-check-style audit in Phase 9, independent of Knowledge authoring. See `ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md` §1.

---

## 7. Priority List for Phase 9

**Highest leverage:**
1. Resolve the Reimbursement framing question (§4/§6.1) — cheapest possible win if the answer is "yes, same process."

**High:**
2. Fix Critical #1's classification-scoring regression — still open, still harmless only by accident (CREATE_NOR intent detection independently saves 3 of 4 misrouted scenarios).
3. Obtain real Pengadaan evidence (§6.2) — the only way to unlock a second genuinely-correct NOR type; authoring without it would repeat the exact mistake this iteration just fixed.
4. Decide Administration's status (§6.3).

**Medium:**
5. Wire Reasoning into the CREATE_NOR path — only after teaching `rule-applicability-engine.js` about `norType` (§6.5), or it will reproduce Composition's just-fixed wrong-domain-citation bug in a second location.
6. Obtain real Perjalanan Dinas evidence (§6.4) to validate or correct its current placeholder schema.
7. Fix `nor-generator.js`'s structural-count scoping (mirrors the `nor-composer.js` fix from two iterations ago).

**Low (unchanged, still not urgent):**
8. Real document rendering downstream of Composition.
9. A real Review surface; wire `editSection` to it.

---

## 8. Updated North Star Readiness Score

| Metric | Iteration 1 | Iteration 2 (measured fresh) | Iteration 3 |
|---|---|---|---|
| Correct NOR Type resolved directly from utterance | 3/4 (75%) | 3/4 (75%) — unchanged | unchanged |
| Conversation asks the correct field set for its resolved NOR Type | 2/4 (50%) | 2/4 (50%) — unchanged | unchanged |
| Problem Category classification accuracy | 1/4 (25%) | 1/4 (25%) — unchanged | unchanged |
| Knowledge Gap Detection reports an honest gap where one exists | 0/4 (0%) | **4/4 (100%)** | unchanged |
| Composition free of wrong-domain content | 0/4 (0%) | **4/4 (100%)** | unchanged |
| Reasoning contributes to the real path | 0/4 (0%) | 0/4 (0%) — unchanged | unchanged |
| Conversation reaches READY | 4/4 (100%) | 4/4 (100%) — unchanged | unchanged |
| Real Review surface exists | 0/4 (0%) | 0/4 (0%) — unchanged | unchanged |
| Learning closes the loop on a Composed draft | 0/4 (0%) | 0/4 (0%) — unchanged | unchanged |
| A documented, repeatable process exists to close the remaining Knowledge gaps | No | No | **Yes** — `ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md` |

**Estimated overall: ~28–32%, unchanged this iteration.** Iteration 3 authored zero code and zero Knowledge, per its own scope (documentation only) — the readiness *score* does not move. What changed is the *distance* to the next real increment: closing the Reimbursement framing question or obtaining one real Pengadaan document is no longer an open-ended research task, it is a documented process (§6 above; full detail in `ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md`) that has already been proven once, end to end, for petty cash.

**Estimated Time (Prompt → review-ready NOR):** still not measured — no human-in-the-loop timing data exists.

---

## 9. Go / No-Go Recommendation for Phase 9

**No-Go for a full Phase 9 launch. Go for a narrowly-scoped Phase 9 opening sprint: "Resolve Reimbursement's real-world framing, then source real Pengadaan evidence — using the now-documented Acquisition Framework."**

Unchanged in substance from Iteration 2's revised recommendation; Iteration 3 adds that this is no longer an open-ended research task. The corrected opening move is still a **research/decision task**, not a code task: first resolve whether the real, approved Reimbursement form (`docs/REIMBURSEMENT_TEMPLATE_STANDARD.md`) is the same process as "NOR Reimbursement" (cheap, possibly a near-zero-authoring win), then, separately, obtain one real Pengadaan document or a domain-expert interview. Once either lands, follow `docs/ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md`'s worked example directly (registry entry → structured, cited authoring → `ingest`/`promoteKnowledge` → re-run `scripts/north-star-acceptance-check.mjs` as the acceptance gate) rather than re-deriving the process from scratch. A secondary, independent, non-blocking Phase 9 item: audit and resolve the "both zero" dormant engines this iteration surfaced (§6 item 6) — not on the critical path to a second real NOR Type, but a real gap in the platform's own ownership-honesty machinery.

---

## Appendix — Iteration 1 bugs (both in the verification harness, not the platform)

1. `seedResult.items.length` is not the same count as `listKnowledge({...APPROVED}).data.length`. Fixed by querying `listKnowledge()` directly.
2. `listLearningEvents(filter)` returns `{ok, data}`, not a raw array. Fixed to read `.data`.

No platform source file was touched to produce Iteration 1 of this report. Iteration 2 touched exactly two files, both Knowledge-authoring surfaces: `js/v2/knowledge/registry/nor-type-registry.js` (one new NOR Type registration) and `js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js` (54 `payload.norType` tags added to existing, unaltered facts) — see `docs/CORE_NOR_KNOWLEDGE_PACK.md` for the full rationale.
