# Sarpras Intelligence V2 — Phase 9, Sprint 9.7: Organizational Learning Validation

> Scope: prove the full cycle — real evidence in, real Knowledge authored,
> real human decisions applied, measurable platform improvement out —
> actually happened this phase, not merely that individual steps exist in
> isolation. Method: consolidates every before/after measurement already
> taken in Sprints 9.1-9.6 (each independently reproducible via
> `scripts/north-star-acceptance-check.mjs`) into one end-to-end account.
> No new Knowledge authored this sprint; this sprint measures, it does not
> add.

---

## Headline finding

**The cycle happened for real, twice, in two different ways — and both
are measurable, not asserted.** (1) *New evidence → new Knowledge*: 13
real documents (Sprint 9.2) became 96 real KnowledgeItems for 2 NOR Types
that had zero before (Sprint 9.3) — Approved nor-domain Knowledge grew
116 → 150. (2) *Existing Knowledge, corrected by new evidence*: 2 facts
Iteration 2 had tagged petty-cash-specific, now proven Generic by
cross-type evidence, were corrected through the platform's own real
correction pipeline (Candidate → Approved → original superseded), not a
hand-edit. Both are the literal definition of "the platform learns" this
sprint's brief asks to prove — not a new capability invented for this
demonstration, but the same `ingest()`/`promoteKnowledge()`/
`submitCorrection()` machinery every other real KnowledgeItem in this
platform already used, now exercised end-to-end by a human decision
process (Sprints 9.1-9.2) this document did not shortcut.

---

## 1. Learning Validation Report — Before → After, every dimension

| Dimension | Before Phase 9 (post-Sprint-9.1, commit `68c24c7`) | After Phase 9 (through Sprint 9.6) |
|---|---|---|
| **Knowledge** — Approved nor-domain items | 116 | **150** |
| Perjalanan Dinas tagged facts | 0 | **22** |
| Pengadaan tagged facts | 0 | **23** |
| Reimbursement (NOR Type) | registered, unevidenced | **removed** (Sprint 9.1 Decision 1) |
| Realisasi Petty Cash tagged facts | 54 | **52** (2 correctly superseded to Generic) |
| Generic (cross-type) facts | 42 | **53** |
| **Conversation** — question count, all 6 scenarios | unchanged | **unchanged** (honest finding, root cause traced to `question-optimizer.js`'s field-name-matching requirement — Sprint 9.4) |
| **Reasoning** — cross-domain contamination | present, undetected (0 tagged rules existed yet to expose it) | **found and fixed** (Sprint 9.5) — verified live for all 3 real NOR Types, zero cross-citation |
| **Reasoning** — live on CREATE_NOR path | never called | **called on every real composition**, dev-only metadata (Sprint 9.5) |
| **Knowledge Gap Detection** — Perjalanan Dinas | 1 gap, CRITICAL ("no Approved Ontology") | 1 gap, `normal` priority (an honestly low-confidence reasoning claim) |
| **Knowledge Gap Detection** — Pengadaan | 1 gap, CRITICAL | 1 gap, `normal` priority |
| **Composition** — permanently-broken pattern placeholders | 2 (undiscovered — the patterns didn't exist yet) | **0** (found and fixed, Sprint 9.6) |
| **Composition** — patterns cited, Business Trip | 4 (generic only) | **7** (4 generic + 3 real BPD-specific) |
| **Composition** — patterns cited, Procurement | 4 (generic only) | **8** (4 generic + 4 real Pengadaan-specific) |
| **Acceptance harness** | 16 checks (pre-Phase-9 baseline) | **34 checks**, all passing |

---

## 2. Knowledge Growth Report

| Growth mechanism | Count | Evidence |
|---|---|---|
| New KnowledgeItems authored (Sprint 9.3) | 96 (78 content + 9 relationships + 9 open questions) | 13 real documents, cited by NOR number in every fact's `reviewRationale` |
| Existing KnowledgeItems corrected (Sprint 9.3) | 2 | `rule.numbering-format`, `pattern.document-number-line` — real cross-type evidence, real correction pipeline |
| Architecture bugs found and fixed as a direct consequence of new Knowledge existing (Sprint 9.5, 9.6) | 3 | Reasoning's norType-blind rule scoping (invisible until 2 more NOR Types had tagged rules); 2 pattern slot-name mismatches (invisible until those patterns existed to be composed) |
| New NOR Types production-ready (2+ independent documents) | 2 | Perjalanan Dinas (2 docs), Pengadaan (4 docs) |

**A finding worth stating plainly**: every one of the 3 bugs above was
*invisible* before this phase — not because the code was untested, but
because there was nothing yet to expose them (0 tagged rules to
cross-contaminate, 0 authored patterns to mis-resolve). This is itself
evidence the platform's own regression discipline (a real harness, run
after every change, never skipped) is working as designed: real defects
surfaced the moment real content existed to reveal them, and were fixed
before being asserted as "done."

---

## 3. Updated Readiness

**Genuinely improved, quantified, not just asserted:**
- 2 of 4 originally-named candidate NOR Types (Perjalanan Dinas, Pengadaan)
  now have real evidence, real Knowledge, real (validated, bug-fixed)
  Composition, and real (norType-scoped, live) Reasoning — up from 1 of 4
  (only Realisasi Petty Cash) before this phase.
- Reimbursement is correctly excluded rather than silently
  mis-authored — a real decision, not a gap.
- Administration and the payroll/leave document cluster remain
  deliberately unexpanded, per the repository owner's own explicit
  "no incremental taxonomy growth from a small sample" instruction — not
  a shortfall, a boundary this phase respected.

**Still unchanged, honestly carried forward, not re-solved this phase:**
- Conversation's field-resolution mechanism cannot yet read Ontology-
  shaped Knowledge (Sprint 9.4's own named next step).
- No recipient/cc/sender Knowledge exists for either newly-evidenced NOR
  Type (Sprint 9.6).
- Neither type's fieldSchema captures its real itemized/multi-line
  structure (Sprint 9.3 §5, re-confirmed unfixed in Sprint 9.6).
- No PDF/HTML rendering exists for any NOR Type except the pre-existing
  V1 Petty Cash renderer — an architectural boundary this phase never
  attempted to cross, per `nor-composer.js`'s own documented Decision 8.

**Regression floor**: 34/34 on the permanent acceptance harness; 15+
independent check scripts spanning problem-solving, reasoning, knowledge
lifecycle, composition, and conversation all re-verified green at every
step this phase took, not only at the end.
