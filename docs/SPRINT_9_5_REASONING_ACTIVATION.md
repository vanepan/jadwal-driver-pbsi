# Sarpras Intelligence V2 — Phase 9, Sprint 9.5: Reasoning Activation

> Scope: per this sprint's own brief ("do NOT invent reasoning... every
> conclusion must explain which Knowledge, why selected, why rejected").
> Method: direct code reading (`js/v2/reasoning/rule-applicability-
> engine.js`, `reasoning-engine.js`) plus real, executed measurement via
> `scripts/north-star-acceptance-check.mjs`'s existing diagnostic
> `reason()` probe and a standalone Node script constructing a real
> `Problem` for each NOR Type.

---

## Headline finding

**A real, confirmed cross-domain contamination bug in `reason()`'s rule
selection was found and fixed — the exact failure mode Composition was
already fixed for in Iteration 2, now confirmed present in Reasoning too,
and now closed the same way.** `rule-applicability-engine.js`'s
`isApplicable()` only ever checked `payload.appliesWhen` — a separate,
pre-existing convention — and had no awareness of `payload.norType` at
all. Before Sprint 9.3, this was invisible: 0 rules carried a `norType`
tag other than Petty Cash's own. Once Sprint 9.3 gave Perjalanan Dinas and
Pengadaan their own real, tagged rules, this became directly observable:
a Business Trip Problem's hypothetical reasoning cited Pengadaan-specific
rules (`rule.pengadaan-itemized-list-required`,
`rule.pengadaan-kabid-approval-required`, and 2 others) as if they applied
to a trip. **This is not new authoring's fault — it is a real, pre-
existing gap in the reasoning engine, first flagged (not fixed) in
`CORE_NOR_KNOWLEDGE_PACK.md` §8, now closed.**

---

## 1. Reasoning Validation

**Fix**: `rule-applicability-engine.js#isApplicable` now also checks
`payload.norType` against `problem.facts.type` — the identical "absent
means generic" convention `knowledge-gap-engine.js#matchesNorType`
already established, applied to a second consumer of the same tag. No
signature change (the function already received the full `problem`
object). No new field invented — `problem.facts.type` already flows
through every Problem, confirmed by `NOR_TYPE_DOMAIN_MODEL.md`'s own Q2
trace.

**Verified, live, for all 3 real NOR Types** (constructed real `Problem`
objects, called the real `reason()`, not a mock):

| Problem's `facts.type` | Rules cited | Rules correctly excluded |
|---|---|---|
| Realisasi Petty Cash | All 10 Petty-Cash-tagged rules + 2 Generic + corrected numbering-format | 0 Perjalanan Dinas rules, 0 Pengadaan rules |
| Perjalanan Dinas (Business Trip scenario) | 4 BPD-tagged rules + 2 Generic + corrected numbering-format | 0 Petty-Cash rules, 0 Pengadaan rules |
| Pengadaan (Procurement scenario) | 4 Pengadaan-tagged rules + 2 Generic + corrected numbering-format | 0 Petty-Cash rules, 0 BPD rules |
| Unresolved/unregistered (Reimbursement, Administration scenarios) | 2 Generic + corrected numbering-format only | 0 rules from any of the 3 real types |

**Every citation explains which Knowledge, why selected, why rejected** —
`isApplicable()`'s own `rationale` string states, per rule, either "no
appliesWhen condition, applies domain-wide" or the exact norType mismatch
that excluded it. Nothing here was invented: every cited rule already
existed as a real, human-approved KnowledgeItem (Sprint 9.3 or Iteration
2); this sprint only fixed which of them a given Problem is honestly
allowed to select.

---

## 2. Reasoning Coverage

| NOR Type | Rules available | Rules that would be cited (post-fix) |
|---|---|---|
| Realisasi Petty Cash | 12 (10 tagged + 2 Generic) | 12 |
| Perjalanan Dinas | 6 (4 tagged + 2 Generic) | 6 |
| Pengadaan | 6 (4 tagged + 2 Generic) | 6 |
| Administration | 2 (Generic only — none authored, per Sprint 9.2/9.3 scope decision) | 2 |

---

## 3. Reasoning Trace Report

Full regression sweep after the fix, all green: `reasoning-engine-check`
(19/19), `policy-engine-check` (73/73), `policy-engine-dom-check`
(14/14), `recommendation-check` (37/37), `recommendation-accuracy-check`
(81/81), `problem-solving-integration-check` (30/30),
`nor-composition-check` (17/17), `knowledge-gap-check` (20/20),
`dynamic-conversation-check` (27/27). North Star acceptance harness:
27/27, unchanged count (this fix improves citation correctness, not
question flow — no new checks needed, the existing `hypotheticalReasoning
WouldCite` field already surfaces the (now-correct) citations for
inspection).

---

## 4. What this sprint did NOT do — a real decision point, not an oversight

**`reason()` is still never called anywhere on the real CREATE_NOR path.**
This sprint fixed reasoning's citation correctness (a prerequisite,
confirmed necessary the moment Sprint 9.3 gave a second and third NOR Type
real rules) but did not wire `reason()` into `conversation-service.js` or
`nor-composer.js`'s live call path. That is a materially different, larger
change — it touches the main production Conversation/Composition flow for
every real NOR creation, and requires a design decision this document does
not make unilaterally: HOW should a cited rule's reasoning surface in a
composed document (a new section? a citation footnote? dev-only metadata,
the same "informational, never applied" treatment
`renderingRulesConsidered` already gets)? Activating it without deciding
that risks the exact "opaque recommendation" CLAUDE.md's Explainability
section forbids. This is the next real decision point before Sprint 9.6
(Composition Validation) can honestly measure anything about live
Reasoning's effect on Composition — flagged for the repository owner, not
decided here.
