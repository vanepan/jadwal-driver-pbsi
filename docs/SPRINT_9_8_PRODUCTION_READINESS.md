# Sarpras Intelligence V2 — Phase 9, Sprint 9.8: Production Readiness

> Scope: determine whether Sarpras Intelligence is ready for organizational
> deployment, per this sprint's own 8 review dimensions. Method:
> synthesizes every measured fact from Sprints 9.1-9.7 (each independently
> reproducible via `scripts/north-star-acceptance-check.mjs`, 34/34
> passing) — no new measurement invented here, only integrated.

---

## Go / No-Go Recommendation

**GO — for a scoped, human-supervised pilot covering 3 NOR Types
(Realisasi Petty Cash, Perjalanan Dinas, Pengadaan). NO-GO for
unsupervised, organization-wide deployment.**

Every composed document today is a **Composer draft, not a final
artifact** — by this platform's own deliberate architecture (no PDF/HTML
rendering exists for any NOR Type except the pre-existing V1 Petty Cash
renderer, and `nor-composer.js`'s own header forbids building a second
rendering universe). A human must review, complete the recipient/cc block,
add the itemized cost/purchase table, and format the final document by
hand, every time, for every NOR Type — including Petty Cash. This was true
before Phase 9 and remains true after it. What changed is that 2 more NOR
Types now have a real, evidenced, bug-checked path to that draft stage,
instead of composing wrong-domain content or nothing at all.

---

## 1. Review — the 8 named dimensions

**Knowledge.** 150 Approved nor-domain KnowledgeItems (was 116). 3 of 4
originally-named candidate NOR Types now evidenced or explicitly resolved
(Petty Cash: full; Perjalanan Dinas + Pengadaan: production-bar evidence,
Sprint 9.2; Reimbursement: correctly excluded, Sprint 9.1). Administration
remains registered-but-empty by explicit decision, not oversight.

**Conversation.** Functionally unchanged by this phase (Sprint 9.4) —
still asks every schema field, every time, for any occasion that isn't an
exact repeat. Root cause is structural (`question-optimizer.js`'s
Knowledge-resolution requires payload keys matching field names
literally), named precisely, not fixed.

**Reasoning.** Live on the CREATE_NOR path for the first time ever
(Sprint 9.5), correctly NOR-Type-scoped (a real contamination bug found
and fixed the same sprint), surfaced as dev-only metadata never shown to
an end user without review.

**Composition.** Validated directly against real organizational documents
for the first time for Perjalanan Dinas and Pengadaan (Sprint 9.6); 2 real
defects found and fixed. Still missing: recipient/cc/sender knowledge for
both new types; any Conversation path to a real itemized/multi-line
table for either type.

**Validation.** The acceptance harness (`scripts/north-star-acceptance-
check.mjs`) is real, run and re-run at every step this phase took (not
only at the end), and grew from 16 to 34 checks — every new check added
because a real behavior needed proving, never as padding.

**Evidence.** 13 real, filled, signed organizational documents reviewed
this phase, cited by NOR number in every authored fact's own
`reviewRationale` — zero fabricated content, confirmed by direct
inspection at every authoring step (Sprint 9.3).

**Review.** **Unimproved, and the single largest gap this phase did not
touch.** No real human-review surface exists for a composed
ComposerDocument beyond a dev-mode section-count viewer (`NORTH_STAR_
READINESS_AUDIT.md` Stage 8, re-confirmed unchanged). A pilot user today
would see raw composed fields, not a formatted document to approve.

**Operational Process.** The evidence-onboarding process itself (Sprint
9.1 decision gate → Sprint 9.2 evidence catalog → Sprint 9.3 authoring →
Sprint 9.5/9.6 validation) is now proven repeatable twice in one phase —
this is the process `docs/NOR_ONBOARDING_PLAYBOOK.md` described; Phase 9
is the first time it ran for real, on evidence a human actually supplied
mid-session, and produced a measured result.

---

## 2. Measured Metrics

| Metric | Value |
|---|---|
| Supported NOR Types (real evidence, 2+ documents) | 3 of 4 originally named (Petty Cash, Perjalanan Dinas, Pengadaan); Reimbursement correctly excluded |
| Knowledge coverage (tagged Approved facts) | Petty Cash 52, Pengadaan 23, Perjalanan Dinas 22, Administration 0 (by decision) |
| Acceptance success rate | 34/34 (100%) on the permanent harness; 15+ independent check scripts green |
| Human editing required per composed draft | Recipient/cc block: 100% manual, both new types. Itemized table: 100% manual, both new types. Date/numbering formatting: 100% manual, all types (pre-existing). Perihal/context paragraph: 0% manual for the evidenced venue-survey/recurring-procurement cases (Sprint 9.6 fix), still manual for any other purpose (unevidenced) |
| Average questions per Conversation | 4-6, unchanged from pre-Phase-9 (Sprint 9.4) |
| Reasoning accuracy (citation correctness) | 100% NOR-Type-scoped, verified live for all 3 real types, zero cross-domain contamination (post Sprint 9.5 fix) |
| Production risk | **Medium** for the 3 evidenced types in a supervised pilot (real content, real citations, human always reviews before anything leaves the platform); **High** for Administration or any unevidenced NOR Type (would require fabricating content this phase explicitly refused to invent) |

---

## 3. Production Readiness Report — by NOR Type

| NOR Type | Ready for supervised pilot? | Not ready for unsupervised production because |
|---|---|---|
| Realisasi Petty Cash | Yes | No PDF rendering (by design); 12 open questions still logged; Reasoning/Composition never formally validated against real text the way Sprint 9.6 did for the other two (a gap this phase did not close for Petty Cash specifically — recommend as first Phase 10 item) |
| Perjalanan Dinas | Yes, for venue-survey requests specifically | Evidenced only for one sub-purpose; no recipient/cc; no itemized-table Conversation path; only 2 real documents (the minimum bar, not a deep bench) |
| Pengadaan | Yes | Same gaps as above; additionally, Critical #1 (an utterance mentioning "NOR" biases classification toward `business_trip`) is still unfixed — today's real Conversation happens to recover anyway (intent-engine.js's own extraction is category-independent), but this is fragile, not designed-in safety |
| Administration | No | Zero authored content, by explicit decision; only 2 ambiguous candidate documents whose fit was deliberately left unconfirmed |
| Reimbursement | N/A | Correctly excluded — not a gap |

---

## 4. Phase 10 Backlog (priority order, not started)

1. **Build a real human-review surface for a ComposerDocument** — the
   single largest, most consequential gap: today, "human always reviews"
   is a design principle with no real UI behind it for any NOR Type.
2. **Recipient/cc/sender Knowledge for Perjalanan Dinas and Pengadaan** —
   real evidence already exists (both documented in every one of the 13
   real NOR headers); a pure authoring task, no new evidence needed.
3. **Resolve the itemized-table/repeating-field Conversation gap** — the
   single change that would let both new types' real content (cost
   breakdowns, purchase lists) actually reach Composition, named in
   Sprint 9.3 §5 and re-confirmed in Sprint 9.6.
4. **Decide the Conversation-Reasoning field-resolution question** (Sprint
   9.4 §5) — whether `question-optimizer.js` should read an Ontology's
   `stakeholders` for a matching field, the one change that would let
   Sprint 9.3's Knowledge actually reduce question count.
5. **Obtain a second, third+ Perjalanan Dinas document, and a non-survey
   purpose example** — the current pack is honestly scoped to one sub-case
   only.
6. **Fix Critical #1** (classification bias toward `business_trip` for any
   "NOR"-mentioning utterance) — pre-existing, unrelated to this phase's
   own work, still real.
7. **Revisit Administration and the payroll/leave cluster** — explicitly
   deferred this phase pending more evidence or a human decision on
   taxonomy, not abandoned.
8. **Validate Petty Cash's own Reasoning/Composition against real text**
   the way Sprint 9.6 did for the two new types — never formally done for
   the platform's original, most-evidenced NOR Type.
