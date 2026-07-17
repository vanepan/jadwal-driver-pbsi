# Sarpras Intelligence V2 — Phase 8.5 (Iteration 2): Core NOR Knowledge Pack

> Scope: knowledge authoring only, per this sprint's own brief — no new
> engines, no UI, no architecture. Method: full re-read of the existing
> evidence base (`js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js`,
> `docs/NOR-Specification.md`, `docs/Knowledge-Asset-Specification.md`),
> plus a fresh repository-wide search for any real evidence of Pengadaan,
> Reimbursement, or Administration NOR content. Every claim below is either
> **evidenced** (cites a real document/PDF/template/config already in this
> repository) or explicitly marked **not evidenced — gap**.

---

## Headline finding

**Every real KnowledgeItem in this platform — all ~73 facts, from two real, independently-generated PDFs (NOR 113, NOR 120) — is evidence for exactly one NOR Type: Petty Cash Realization ("Realisasi Petty Cash"), not "Perjalanan Dinas."**

`Perjalanan Dinas` (business trip) has been a registered NOR Type since last session, with a real, working Conversation schema — but that schema (destination/traveler/departureDate/returnDate/budget) is the *mission brief's own hypothetical worked example*, not something evidenced by any real document in this repository. Until now, every one of the 96 seeded Approved KnowledgeItems was **untagged** — meaning it silently applied to "Perjalanan Dinas," "Pengadaan," "Reimbursement," and any other NOR Type equally, including content that is 100% petty-cash-worded (e.g. the literal sentence *"kami melaporkan realisasi petty cash..."* was being cited into a table-purchase document, per `docs/NORTH_STAR_VALIDATION_REPORT.md`'s own headline finding).

This sprint's core action: **register the NOR Type the evidence actually supports** (`Realisasi Petty Cash`, string lifted verbatim from the single most-confidently-evidenced fact in the whole report — the Perihal line), and **tag every genuinely petty-cash-specific fact with it**, leaving genuinely generic conventions untagged. No new content was invented for Pengadaan, Reimbursement, or Administration — because none exists in this repository to author from.

---

## 1. Core NOR Knowledge Pack Summary

| | Count |
|---|---|
| Real KnowledgeItems re-classified | 73 content items + 22 relationships = 95 |
| Tagged `payload.norType = "Realisasi Petty Cash"` (Level 2 — genuinely type-specific) | 54 |
| Left untagged (Level 1 — Generic) | 19 content items + 22 relationships + (vocabulary items not individually kind-tracked) |
| New NOR Type registered | 1 (`Realisasi Petty Cash`, real evidence) |
| New NOR Type field schema authored | 1 field (`tanggal`) — deliberately minimal, see §3 |
| New content invented for Pengadaan/Reimbursement/Administration | **0** — none is evidenced |

Files touched: `js/v2/knowledge/registry/nor-type-registry.js` (new registration), `js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js` (54 `norType` tags added to existing payloads — no evidenced fact, confidence, or text was altered).

---

## 2. Generic NOR Knowledge Summary (Level 1 — stays unscoped)

Kept untagged because the fact's own content has no petty-cash-specific business meaning — it is a document-mechanics or Indonesian-formal-letter convention that would plausibly apply to any NOR:

| Kind | Item | Why Generic |
|---|---|---|
| rendering_rule (12 of 15) | footer placement, pagination, typography sizes, font substitution, bold/italic/underline conventions, page margins, meta-block layout, cover-page signature 3-then-1 split, signature block structure | Pure document-rendering mechanics — no petty-cash content referenced |
| vocabulary (2 of 3) | "Nota Organisasi"/"NOR" term, "Terbilang" convention | The TERM itself and the number-spelling convention are used by any formal Indonesian financial document, not uniquely petty cash |
| sentence_pattern (4 of 9 pattern-kind items) | salutation ("Dengan hormat,"), closing sentence, place-date line ("Jakarta, {{tanggalPanjang}}"), Terbilang line | Zero petty-cash-specific wording |
| rule (2 of 12) | "signatories are Settings, never hardcoded" (a platform-architecture fact, not petty-cash content); "no numbering-validation exists anywhere in the platform" (a platform-wide governance fact, evidenced by code reading across the whole codebase) | Both describe the PLATFORM's mechanism, not petty cash's business content |
| relationship (22 of 22) | every dependency-graph edge between the above facts | Not individually re-classified this sprint — see §11 |

**Nuance flagged, not resolved:** `rendering.balance-recap-layout` / `rendering.ledger-table-columns` / `rendering.signature-layout-ledger` and `pattern.document-number-line` / `rule.numbering-format` reference "the ledger" and "/Sarpras/" respectively — these were judged Level 2 (petty-cash/Sarpras-specific) rather than Generic, because the evidence only shows them in that one context and generalizing further would be guessing. A future NOR Type with its own ledger-shaped second section might reuse the *layout* convention, but that reuse is not evidenced today.

---

## 3. Perjalanan Dinas Knowledge Summary

**No real document evidence exists for this NOR Type in this repository.** Zero KnowledgeItems were tagged to it. Its existing Conversation field schema (destination/traveler/departureDate/returnDate/budget, authored in the prior session) is the mission brief's own hypothetical CREATE_NOR walkthrough example — useful as a working placeholder, but not evidenced organizational fact, and this sprint's brief forbids treating it as if it were. No Ontology, Workflow, Rules, Rendering, Vocabulary, Question Patterns, Reasoning, or Templates exist for it. See §7.

---

## 4. Pengadaan Knowledge Summary

Searched: `js/petty-cash/*`, all of `js/v2/`, `docs/*.md`, repository-wide for "pengadaan"/"procurement"/"purchase workflow". Found:

- **One real fact**: `pengadaan` is a real, configured user-role/department name (`docs/IDENTITY_SECURITY_CUTOVER_v1.11.1.2.md`'s own user list: `..., organisasi, pengadaan, perwasitan, ...`). This confirms Procurement is a real organizational function at PBSI — but tells us nothing about what a Pengadaan NOR document looks like, who approves it, or how it's numbered.
- **Zero KnowledgeItems tagged.** No Ontology, Workflow, Rules, Rendering, Templates, Terminology, or Question Patterns exist or were authored — none is evidenced. Its Conversation field schema (item/quantity/purpose/budget, authored last session) remains a reasonable inference, not evidenced fact.

No content was authored for Pengadaan this sprint, per this sprint's own "do not guess" instruction.

---

## 5. Reimbursement Knowledge Summary

**A real, approved production document called "Reimbursement" exists — but it is not a NOR, and conflating the two would be exactly the fabrication this sprint forbids.**

`docs/REIMBURSEMENT_TEMPLATE_STANDARD.md` (Version 1.0, Status: Approved Baseline) documents `FORM REIMBURSEMENT KENDARAAN OPERASIONAL DAN DRIVER` — a driver/vehicle operational-cost claim form (BBM, toll, parking), rendered by `js/docs/templates/reimbursement.js`, domain logic in `js/reimbursement.js`. This is architecturally a completely separate document family from `js/petty-cash/nor-document-engine.js` (the real NOR renderer) — different template id (`reimbursement`, not `nor`), different subject matter, no evidenced connection to the `nor` domainType, never once called a "Nota Organisasi" anywhere in its own spec.

**Finding, not a fix:** whether "NOR Reimbursement" (the registered NOR Type, keyed by keywords `reimbursement`/`penggantian`) is meant to reference this real driver-reimbursement process, or is a distinct concept, is genuinely unresolved. Zero KnowledgeItems were tagged to `Reimbursement` (the NOR Type) this sprint, because doing so would require assuming an unevidenced link. This is the single highest-value open question for a human to resolve before Phase 9 authors Reimbursement content — see §7.

---

## 6. Administration Knowledge Summary

Searched repository-wide for "penanggung jawab", "appointment", "assignment NOR", "administrasi" NOR-related content. **Zero real evidence found anywhere.** Administration is not even a registered NOR Type (confirmed in `docs/NORTH_STAR_VALIDATION_REPORT.md`'s own §4 finding, unchanged this sprint). No content was authored.

---

## 7. Missing Knowledge Inventory

| NOR Type | Ontology | Workflow | Rules | Rendering | Templates | Vocabulary | Signatories | Field Schema |
|---|---|---|---|---|---|---|---|---|
| Realisasi Petty Cash | **evidenced** (0.8 confidence) | **evidenced** (0.65) | **evidenced**, 10 rules | **evidenced**, 3 type-specific + 12 shared generic | **evidenced**, 6 patterns | **evidenced**, 1 type-specific + 2 shared generic | **evidenced**, 8 roles | **authored** (1 field, evidenced) |
| Perjalanan Dinas | absent | absent | absent | shares generic only | absent | shares generic only | absent | placeholder (unevidenced) |
| Pengadaan | absent | absent | absent | shares generic only | absent | shares generic only | absent | placeholder (unevidenced) |
| Reimbursement | absent — and see §5's unresolved framing question | absent | absent | shares generic only | absent | shares generic only | absent | absent (deliberately, per prior session) |
| Administration | absent — not even a registered NOR Type | absent | absent | shares generic only | absent | shares generic only | absent | absent |

**What would close the biggest gaps, in order of leverage:**
1. A human decision on §5's Reimbursement framing question — this alone could turn a 0% pack into a real one, reusing an already-approved, already-built template.
2. One real Pengadaan (procurement) NOR example — a filled document, or even a description of the real approval chain from someone in the `pengadaan` role — would let Phase 9 do for Procurement exactly what this sprint did for petty cash.
3. A decision on whether "Administration" should exist as a NOR Type at all, and if so, one real example.
4. Real evidence (a filled document, not a mission-brief example) for what a "Perjalanan Dinas" NOR actually contains — the currently-registered schema may or may not match organizational reality.

None of these can be produced by authoring alone — they require either a real document/example or a human decision this sprint is not positioned to make.

---

## 8. Knowledge Coverage Comparison — Before → After

Measured via `scripts/north-star-acceptance-check.mjs`, same 4 acceptance scenarios, same real bootstrap Knowledge, before and after this sprint's tagging pass:

| Metric | Before | After |
|---|---|---|
| KnowledgeItems tagged to a specific, real NOR Type | 0 | 54 (all → Realisasi Petty Cash) |
| Knowledge Gap Detection reports an honest, non-zero gap for Perjalanan Dinas | No (false "0 gaps") | **Yes** — 1 real critical gap ("No Approved Ontology... NOR Type 'Perjalanan Dinas'") |
| Knowledge Gap Detection reports an honest, non-zero gap for Pengadaan | No (false "0 gaps") | **Yes** — same, correctly named |
| Knowledge Gap Detection reports an honest, non-zero gap for Reimbursement | No (false "0 gaps") | **Yes** — same |
| Knowledge Gap Detection reports an honest, non-zero gap for the unregistered Administration answer | No (false "0 gaps") | **Yes** — same |
| Wrong-domain (petty-cash) content composed into a Procurement document | **Yes** — the literal "realisasi petty cash" sentence | **No** — that pattern no longer matches; only 4 genuinely generic sentences remain |
| Patterns cited per scenario (all 4) | 9 (all wrong-domain for 3 of 4 scenarios) | 4 (all genuinely generic — salutation, closing, date line, Terbilang) |
| Composed section count (all 4 scenarios) | 18–19 | 13–14 (the difference is exactly the wrong-domain content that no longer falsely composes) |

**Read this table as a correctness win, not a richness win.** Composition got smaller and more honest, not bigger. None of the 4 named acceptance scenarios gained real domain-specific content this sprint, because none of them resolve to Realisasi Petty Cash — the only NOR Type this repository has real evidence for. The false-confidence bug the original audit flagged (`NORTH_STAR_READINESS_AUDIT.md` Stage 4, re-confirmed still-present in `NORTH_STAR_VALIDATION_REPORT.md` §1) is now fixed, for a different reason than expected: not by adding a new engine capability, but by correcting the data that engine already reads.

**One nuance surfaced, not fixed:** the harness's own diagnostic `reason()` probe still shows all 12 petty-cash rules as hypothetically "applicable" to every scenario regardless of NOR Type. This is because `reason()` (via `rule-applicability-engine.js`) scopes rules through a *different*, pre-existing convention — `payload.appliesWhen` matched against `problem.facts` — which is separate from the `payload.norType` convention this sprint (and last session) used for Gap Detection and Composition. Since `reason()` is still never called on the real CREATE_NOR path (confirmed unchanged), this has no live effect today — but it means a future "wire Reasoning into CREATE_NOR" task (Phase 9 priority list, `NORTH_STAR_VALIDATION_REPORT.md` §7 item 5) would need to ALSO teach `rule-applicability-engine.js` about `norType`, or continue to risk the same wrong-domain-citation failure mode Composition just had fixed. Flagged for Phase 9; not touched this sprint (would be an engine change, out of scope).

---

## 11. Remaining Blockers

**Technical:** none new. Every blocker named in `NORTH_STAR_VALIDATION_REPORT.md` §5 is unchanged (Critical #1 classification regression, Reasoning never wired into CREATE_NOR, `nor-generator.js`'s unscoped structural counts, no real Review surface, `editSection` still dormant) — this sprint touched only Knowledge content, per its own scope.

**Knowledge — now the dominant blocker class:**
1. Reimbursement's real-world framing is unresolved (§5) — highest leverage, needs a human answer, not more searching.
2. Zero real evidence exists for Pengadaan, Administration, or a truly evidenced Perjalanan Dinas — Phase 9 cannot author real content for these without a real document, example, or domain-expert interview; more searching of this repository will not surface what was never recorded in it.
3. `rule-applicability-engine.js`'s `appliesWhen` scoping is not norType-aware (§8's nuance) — becomes load-bearing only once Reasoning is wired into CREATE_NOR, not urgent today.

See `docs/NORTH_STAR_VALIDATION_REPORT.md` (updated alongside this document) for the full updated readiness estimate and Go/No-Go recommendation.
