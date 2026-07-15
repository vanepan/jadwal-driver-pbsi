# Knowledge Validation Report — Authoring Sprint 01

> Prepared against, and treating as authoritative: `CLAUDE.md`,
> `docs/PROJECT_REALIGNMENT_REPORT.md`, `docs/NOR-Specification.md`,
> `docs/Knowledge-Asset-Specification.md`, `docs/Knowledge-Repository-Adaptation.md`.
> Companion: `docs/KNOWLEDGE_POPULATION_REPORT.md`. Every number below is
> from a real, just-executed run of `node scripts/nor-knowledge-bootstrap-seed.mjs`
> in this session — not a projection. No architecture, engine, or
> repository was added; this sprint is content authored against
> `js/v2/knowledge/`'s existing, unmodified contracts and services.

---

## Scope

This validation covers the 96 KnowledgeItems (74 facts + 22 relationships)
authored in `js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js`
and seeded through the real, unmodified `knowledge-service.js#ingest` /
`#promoteKnowledge` pipeline — the same two calls
`scripts/knowledge-asset-kinds-check.mjs` already proved work for a
brand-new `kind` in a prior phase. Every fact traces to a specific section
of `docs/NOR-Specification.md`; nothing here was invented to fill a gap in
the checklist below.

---

## 1. Duplicate Rules

**Result: 0 duplicates found.** Checked as exact-payload collisions within
each `kind`, across all 74 fact items (relationships excluded — they are
compared separately, see §2). No two items of the same kind carry
identical payloads.

One deliberate near-miss, resolved during authoring rather than left for
this check to catch: the "Lampiran hardcodes '1 (satu) berkas'" fact could
have been captured as both a `rendering_rule` (a layout fact) and a `rule`
(a business fact). It was merged into a single `kind: 'rule'` item
(`rule.attachment-count-hardcoded`) rather than duplicated across two
kinds — the Task 3 instruction ("no duplicated knowledge, merge equivalent
rules") applied before ingestion, not just checked after.

## 2. Conflicting Rules

**Result: 1 conflict found, by design, not an error.**

```
conflicts_with: statistic.nor113-terbilang-page1 ↔ statistic.nor113-terbilang-page2
```

This is the exact worked example `Knowledge-Asset-Specification.md` §4
names: NOR 113's cover-letter Terbilang line reads "Sembilan Belas **Juta**…"
(nineteen million) while its own page-2 ledger recap reads "Sembilan Belas
**Ribu**…" (nineteen thousand) — for the identical Rp 19.891 figure, in the
same real, historical document. Both readings were transcribed directly
from the PDF's text layer (not a reading error), so both are real,
high-confidence (0.95) *observations*; it is their **coexistence** that is
the conflict. Per `Knowledge-Asset-Specification.md` §7, this is
deliberately **not** resolved by this sprint (resolving it would require
correlating the historical app version that generated NOR 113 against
`petty-cash-config.js#terbilangCap`'s code history — out of a
content-authoring sprint's scope) — it is recorded as a real
`conflicts_with` relationship and surfaced to a human via
`question.terbilang-inconsistency-root-cause` (a `question_tree` item
`derived_from` the conflict).

No other conflict exists — specifically, no two `kind: 'rule'` items
disagree, which is why `reasoning-engine.js#reason()` (§5 below) applies
all 12 rules with no conflict-confidence-penalty.

## 3. Missing Evidence

**Result: 0 items with missing evidence** at the structural level — this
is enforced, not merely checked: `organizational-reasoning-contract.js#isOrganizationalReasoningEntry`
already rejects an empty `evidenceRefs` array at ingest time (the
"cite-or-abstain" discipline made literal), so a reasoning claim with zero
citations could never have reached this repository at all.

Beyond the structural floor, the 6 `organizational_reasoning` items carry
14 evidence citations between them: 12 external-document references (the
two real historical NOR PDFs, cited as `nor:document:113` /
`nor:document:120`, mirroring `Knowledge-Asset-Specification.md`'s own
worked-example citation convention) and 2 internal cross-references to
other KnowledgeItems in this same bootstrap set (a `statistic` and a
`vocabulary` item). Every citation is either a real document this project
holds or a real, resolvable id in this repository — none is a bare,
unresolvable string.

## 4. Weak Confidence

**Result: 2 items flagged, honestly, not hidden:**

| Item | Confidence | Why it's genuinely weak |
|---|---|---|
| `organizational-reasoning.cycle-overlap` | 0.30 | Only 2 data points (NOR 113, NOR 120); no underlying cycle-record query was performed to decide between "genuine mid-cycle replenishment" and "two differently-scoped exports." |
| `organizational-reasoning.reader-behavior-inference` | 0.35 | An inference about how a human READS a NOR, drawn only from the document's own confident tone — no interview or observed review behavior confirms it. |

Both match `NOR-Specification.md`'s own explicit "Low/Unknown" confidence
rating for exactly these two claims (§E.2, §E.6) — the low number is
carried through faithfully, not smoothed over. No item anywhere in this
set was assigned an artificially inflated confidence to avoid appearing on
this list.

## 5. Circular Dependency

**Result: 0 cycles found**, checked by a real depth-first search over all
22 relationship edges (`fromId → toId`), not asserted by inspection. The
relationship graph is a DAG: every `derived_from` edge points from a more
specific fact (a question, a pattern, a piece of reasoning) toward the
more foundational fact it depends on, and no foundational fact points
back.

## 6. Incomplete Ontology

**Result: 0 gaps remaining**, reported by running the real, unmodified
`reasoning/knowledge-gap-engine.js#detectKnowledgeGaps('nor')` — the exact
engine `docs/PROJECT_REALIGNMENT_REPORT.md` §2 identified as real but
"has nothing to check against" with zero content. Before this sprint, this
call would have returned exactly one gap (`missing_context`: "No Approved
Ontology exists"). After seeding:

- **0 `missing_entity` gaps** — all 8 stakeholder roles named in
  `ontology.nor` are now backed by a real Approved `signatory` item.
- **0 `missing_approval` gaps** — `ontology.nor`'s `approvalChainRef`
  resolves to a real Approved `approval_chain` item.
- **0 `missing_business_constraint` gaps** — 12 Approved `rule` items
  exist for the `nor` domain.
- **0 `missing_reasoning` gaps** — 6 Approved `organizational_reasoning`
  items exist.
- **0 `missing_evidence` gaps** — every `organizational_reasoning` item
  carries ≥2 evidence references (the engine's own threshold).

This is the single most concrete, checkable proof that Knowledge Gap
Detection — a real capability that had never run against real data in
this platform's history — now returns a genuinely different, correct
answer once real content exists, exactly as `docs/PROJECT_REALIGNMENT_REPORT.md`
predicted it would.

---

## Bugs found by actually running this content (not by inspection)

Consistent with this project's own established practice
(`PHASE_10.5_MIGRATION_NOTES.md`'s "two real bugs found by actually running
the new code"), authoring this content surfaced two real defects in the
first draft of `nor-reverse-engineering-knowledge.js`, both in the same
shape: the `SIGNATORIES` and `QUESTION_TREE` array builders each produced
a spec object without a `kind` field, so all 8 `signatory` items and all
12 `question_tree` items failed `isKnowledgeItem()`'s structural check at
`ingest()` (`create: item does not satisfy the KnowledgeItem contract`) —
caught immediately by this sprint's own `zero ingest/promote errors` check
(20 failures on the first run), not discovered later. Both were one-line
fixes (adding the missing `kind: 'signatory'` / `kind: 'question_tree'` to
each builder's output). Re-running after the fix produced 0 errors across
all 96 items.

---

## Overall Verdict

| Check | Result |
|---|---|
| Duplicate rules | 0 found |
| Conflicting rules | 1 found, evidenced, surfaced — not an error |
| Missing evidence | 0 — structurally unrepresentable |
| Weak confidence | 2 found, honestly flagged, matches source document's own rating |
| Circular dependency | 0 found |
| Incomplete ontology | 0 gaps remaining (was 1 critical gap before seeding) |
| Ingest/promote errors | 0 (after fixing 2 real bugs found by running this content) |

**This corpus passes validation.** The one conflict and two weak-confidence
items are not failures — they are exactly the kind of honestly-flagged,
low-confidence or internally-inconsistent fact this platform's Knowledge
lifecycle exists to hold without either fabricating a resolution or
hiding the problem.
