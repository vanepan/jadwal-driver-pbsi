# Sarpras Intelligence V2 — Phase 9, Sprint 9.3: Knowledge Authoring

> Scope: Perjalanan Dinas and Pengadaan only, per the repository owner's
> explicit Sprint 9.2 decision (Administration and the payroll/leave
> cluster deferred). Method: real code — a new bootstrap file
> (`js/v2/knowledge/bootstrap/nor-perjalanan-dinas-pengadaan-knowledge.js`)
> authoring KnowledgeItems from the 13 real documents cataloged in
> `docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md`, following the identical
> ingest()/promoteKnowledge() pipeline `nor-reverse-engineering-
> knowledge.js` established for Realisasi Petty Cash. Wired into the real
> app mount (`sarpras-intelligence-center.js`) and the acceptance harness.
> Every number below is measured by running
> `scripts/north-star-acceptance-check.mjs`, not estimated.

---

## Headline finding

**96 new real KnowledgeItems authored (78 content items + 9 relationships
+ 9 open questions), zero fabricated.** Perjalanan Dinas goes from 0 tagged
facts to 22; Pengadaan from 0 to 23 — both now carry a real Ontology,
Workflow, Rules, Rendering rules, Patterns, Vocabulary, Approval Chain, and
Signatories, at confidence levels that honestly reflect their thinner
evidence base (2 and 4 samples respectively) against Petty Cash's original
2. **A genuine, measured correction to existing Knowledge also happened**:
`rule.numbering-format` and `pattern.document-number-line` were tagged
petty-cash-specific in Iteration 2 because no other NOR Type had ever been
evidenced; this sprint's cross-type evidence proves both are Generic
(Sarpras-department-wide), and the platform's own real correction pipeline
(`learning/correction-pipeline-engine.js#submitCorrection`) was used to
supersede them — not a hand-edit. Realisasi Petty Cash's own tagged-item
count measurably dropped (54 → 52) as a direct, correct consequence.

---

## 1. Knowledge Packs Summary

| | Perjalanan Dinas | Pengadaan |
|---|---|---|
| Real documents | 2 (NOR 055, NOR 077) | 4 (NOR 005, 029, 032, 089) |
| Ontology | 1 (confidence 0.75) | 1 (confidence 0.85) |
| Workflow | 1 (confidence 0.65) | 1 (confidence 0.85) |
| Rules | 4 (0.55–0.85) | 4 (0.5–0.9) |
| Rendering rules | 2 (0.85) | 2 (0.85) |
| Patterns | 2 (0.7–0.75) | 3 (0.4–0.8) |
| Vocabulary | 1 (0.85) | 1 (0.85) |
| Approval chain | 1 (0.75) | 1 (0.85) |
| Signatories | 6 (0.8) | 6 (0.85) |
| Organizational reasoning | 1 (0.5, inferred) | 1 (0.65, inferred) |
| Open questions logged | 3 | 3 |
| **Total tagged items** | **22** | **23** |

Both packs deliberately leave `budget`/quantity/schedule mechanics out of
Knowledge (that lives in `nor-type-registry.js`'s fieldSchema, unchanged
this sprint — see §5) and instead capture what a document alone can prove:
who signs what, in what order, with what real names, and what the
document's own real wording looks like.

---

## 2. Knowledge Summary — confidence discipline

No fact exceeds 0.9. Every multi-sample rule states its sample count in
its own `reviewRationale`. Three items are explicitly marked
`status: 'inferred'` rather than asserted as settled fact, mirroring
`organizational-reasoning.float-ceiling-calibrated`'s own precedent
exactly:
- `rule.bpd-multi-destination-aggregation` (0.55) — evidenced once, not
  cross-checked against a second multi-destination sample.
- `pattern.pengadaan-perihal-pencetakan` (0.4) — the "Pencetakan" Perihal
  variant is evidenced exactly once (NOR 005); kept as its own low-
  confidence sibling pattern rather than merged into the majority
  "Pembelian" template.
- `rule.pengadaan-running-total-reference` (0.5) — evidenced once (NOR
  089); could be a one-off courtesy note, not a required convention.

Pengadaan's evidence base (4 independent samples, identical individual
names throughout — Yenny Agustine as Kabid Pengadaan in all 4, Eddy
Prayitno as Wakil Bendahara in all 4) is genuinely the strongest this
platform has authored outside Realisasi Petty Cash itself. Perjalanan
Dinas's is thinner (2 samples, same event class both times — Sirnas venue
survey) — its Ontology and paragraph pattern are explicitly scoped to
"venue survey trips," never generalized to Perjalanan Dinas broadly, per
`docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md`'s own open question on this.

---

## 3. Coverage Improvement — measured, before → after

| Metric | Before Sprint 9.3 | After Sprint 9.3 |
|---|---|---|
| Perjalanan Dinas tagged Approved items | 0 | **22** |
| Pengadaan tagged Approved items | 0 | **23** |
| Administration tagged Approved items | 0 | 0 (unchanged — deferred, per decision) |
| Realisasi Petty Cash tagged Approved items | 54 | **52** (2 superseded to Generic — see §4) |
| Generic items applying to every NOR Type | 42 | **53** |
| Total Approved nor-domain KnowledgeItems | 116 | **150** |
| Business Trip scenario: patterns cited in Composition | 4 | **5** (new: `pattern.bpd-perihal-subject-line`, and the corrected `pattern.document-number-line` now applies generically) |
| Business Trip scenario: KnowledgeItems cited overall | — | **22** |
| Procurement scenario: patterns cited | 4 | **8** |

---

## 4. Confidence Report — the correction, measured

`scripts/north-star-acceptance-check.mjs` now asserts this directly:
`Sprint 9.3 correction superseded exactly 2 Petty-Cash-tagged facts to
Generic (got 2)` — passing. Mechanism used, in order: `submitCorrection()`
generated a new Candidate carrying the corrected (untagged) payload plus a
`DERIVED_FROM` relationship back to the original; `promoteKnowledge()`
walked it to Approved; `archiveKnowledge()` explicitly superseded
(Deprecated) the original so it stops being double-counted by every real
`listKnowledge({..., lifecycleState: APPROVED})` reader
(`knowledge-gap-engine.js`, `nor-composer.js`, `question-optimizer.js`,
`reasoning-engine.js`) — nothing in this platform does that archival step
automatically, by design, so the correction script does it explicitly,
exactly as a human using Knowledge Center's "Request Changes" UI would.
This is the same real path, not a new one invented for this sprint.

**Full regression sweep, unchanged/still-green:**
`problem-solving-integration-check` (30/30), `problem-router-check`
(37/37), `problem-intelligence-check` (28/28), `reasoning-engine-check`
(19/19), `knowledge-gap-check` (20/20), `nor-composition-check` (17/17),
`dynamic-conversation-check` (27/27), `knowledge-promotion-check`
(21/21), `knowledge-review-workflow-check` (20/20),
`knowledge-learning-check` (23/23). North Star acceptance harness: 27/27
(was 25/25 before this sprint — 2 new setup-stage checks added for the
new seed and the correction, none removed).

---

## 5. Known limitation, flagged not fixed (out of scope for authoring)

Real evidence shows both Conversation field schemas are approximations
that don't match the real documents' shape:
- **Pengadaan's registered fieldSchema** (`item`/`quantity`/`purpose`/
  `budget`) assumes a single item; all 4 real samples request multiple
  line items (6–10 per NOR). The Conversation engine has no mechanism for
  a repeating item list — fixing this would be a Conversation-engine
  change, not Knowledge authoring, and is out of this sprint's scope.
- **Perjalanan Dinas's registered fieldSchema** assumes one lump-sum
  `budget`; real evidence shows a 5-category cost breakdown
  (`rule.bpd-cost-breakdown-categories`) prepared as a separate staff
  attachment, not gathered turn-by-turn in a Conversation.

Neither was touched this sprint — flagged here so Sprint 9.4
(Conversation Optimization) inherits an honest starting point rather than
a silent gap.
