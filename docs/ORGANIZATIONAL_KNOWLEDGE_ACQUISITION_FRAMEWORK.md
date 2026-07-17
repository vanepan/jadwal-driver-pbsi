# Sarpras Intelligence V2 — Phase 8.5 (Iteration 3)
# Organizational Knowledge Acquisition Framework

> Scope: documentation and process design only — no code, no architecture
> changes, per this sprint's own brief. Method: a full inventory of every
> Knowledge-acquisition-adjacent subtree under `js/v2/knowledge/`
> (extraction, acquisition, datasets/import-session, review, promotion,
> learning, machine-learning, connectors, profiles, builder), cross-checked
> against `js/v2/dormant-subsystems.js` (the platform's own official
> dormancy register) and real caller/grep evidence, plus direct re-reading
> of `js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js` — the
> one process that has ever actually produced real Knowledge in this
> platform. Every claim below is either **evidenced** (a real file, a real
> caller, a real confidence number already in the repository) or marked
> **design recommendation** (this document's own proposal, always built
> from existing components, never a new one).

---

## Headline finding

**The ideal acquisition workflow already exists. It has run exactly once, produced the platform's only real Knowledge Pack, and was never formalized into a repeatable process.**

`nor-reverse-engineering-knowledge.js` — the file behind every one of the 96 KnowledgeItems this platform has ever Approved — is not a demo or a placeholder. It is the complete, evidenced, human-reviewed, confidence-honest process this sprint asks for, already proven to work. What's missing is not a new pipeline. It's the **template, checklist, and guardrails** that would let someone repeat it correctly for a second NOR Type, plus an honest account of which of the platform's *other*, parallel-sounding "acquisition" machinery (extraction engines, a second promotion subsystem, a Builder/Stage orchestrator) is real versus fully dormant — because several pieces exist that *look* like they should be part of this workflow, and are not.

---

## 1. Organizational Knowledge Acquisition Report

### Current flow (the only one that has ever produced real Knowledge)

1. A human obtains a real document outside the platform (two real, filled NOR PDFs — no upload, no import UI was involved).
2. A human reads the document directly and hand-authors a structured specification: one entry per fact, each carrying a stable `sourceRef`, a `confidence` number, a human-written `reviewRationale`, a `payload` shaped to its `kind`, and a citation back to the real document (`observedIn`/`evidenceRefs`).
3. One function call, `seedNorBootstrapKnowledge()`, walks every spec through `ingest()` (creates a Draft) then `promoteKnowledge()` (Draft → Candidate → Pending Review → Approved, recording the human's own rationale as the `preferenceRationale`) — the exact two calls every other real Knowledge producer in this platform uses. No shortcut, no bypass of the lifecycle gate.

### Weaknesses

- **No document-content extraction exists anywhere in the platform.** Confirmed by direct reading of every file in the acquisition chain: no OCR, no AI/LLM call. `ui/dataset-import-center.js` only runs real `JSON.parse()` on JSON files; PDF/DOCX content never gets programmatically read. This appears to be a deliberate platform-wide design decision (stated explicitly in multiple file headers, e.g. `manual-file-connector.js`: "never OCR/AI-inferred"), not an oversight — Phase 9 should treat it as a boundary to respect, not a bug to fix, unless a human decides otherwise.
- **Several real, tested engines that look purpose-built for this workflow have zero production callers**, and are not part of the one process that actually works:
  - `knowledge/extraction/*` (`pattern-extraction-engine.js`, `vocabulary-extraction-engine.js`, `relationship-extraction-engine.js`, `scope-detection-engine.js`, `promotion-candidate-engine.js`) — real, deterministic, callable only from a test script today.
  - `knowledge/promotion/*` (`knowledge-merge-engine.js`, `conflict-resolution-engine.js`, `promotion-engine.js#promoteToCandidate`) — a **second, unused implementation** of what `knowledge-service.js#promoteKnowledge`/`mergeKnowledge` already does for real. Using this subtree instead of the real one would create two competing promotion mechanisms.
  - `knowledge/builder/*` — a fully-built, tested Builder/Stage orchestrator that is architecturally *exactly* what this sprint's example pipeline sketches (Import → Extraction → Candidate → ... → Repository) — but has zero runtime callers. `nor-reverse-engineering-knowledge.js` bypasses it entirely.
  - `knowledge/acquisition/historical-mining/candidate-extraction-engine.js` — scaffolded for exactly this kind of multi-document consensus-building, with its own header naming a planned successor (`consensus-engine.js`) that was never built.
  - `knowledge/machine-learning/outlier-detection-engine.js`, `pattern-mining-engine.js`, `clustering-engine.js` — real code, zero callers.
- **The official dormancy register (`dormant-subsystems.js`) does not track any of the above.** It documents exactly 2 subsystems (`correction-log`, `composer-timeline`) — both real by its own strict definition ("readers > 0 AND writers = 0"). Everything listed above has **zero readers and zero callers**, which the register's own stated policy calls "dead code; delete it" — yet none of it is deleted, wired, or entered in the register. This is a real, evidenced gap in the platform's own honesty mechanism, not a new finding this framework invents — it falls out of applying the register's own documented rule.

### Missing automation

- No automatic extraction of document content (see above — may be intentional).
- No wiring between the real, working `Import Session` UI pipeline and the real, working extraction engines — they have never been connected, even though both independently exist.
- No "consensus across multiple documents of the same type" step — `candidate-extraction-engine.js` was built for this and abandoned mid-way.

### Human review points that already exist and are real

- `ingest()`'s own gate: refuses any item pre-stamped Approved (`INGESTABLE_STATES`) — the human gate is enforced at the door, not trusted to a connector.
- `promoteKnowledge()` itself requires a non-empty `preferenceRationale` — an audit trail that says nothing is refused.
- `review-workflow-engine.js#submitForReview/approve/reject`, `review-queue-engine.js#getReviewQueue/getCandidateQueue` — real, with genuine UI callers across Knowledge Center, Archive Center, and Learning Dashboard.
- `conflict-detection-engine.js#detectConflicts` — real, runs both inside review and at Reasoning read-time.
- Knowledge Center's "Request Changes" — a real, wired correction path into `learning-service.js`.

### Approval points that already exist and are real

- `promoteKnowledge()` is the single, sole approval action in the platform. Every real KnowledgeItem, without exception, reaches Approved through it.
- `updateDraft` refuses to edit Approved knowledge in place — correction is always a new version via supersession, never a silent rewrite.

---

## 2. Knowledge Acquisition Workflow (design recommendation, built entirely from existing components)

Mapped against this sprint's own example skeleton. **Real** = already wired, use as-is. **Dormant, do not use** = a redundant, unused alternative to something real. **Gap** = genuinely missing, and — per this sprint's own instruction — not to be built without a human decision that the existing architecture truly cannot support the workflow otherwise.

| Stage | Mechanism | Status |
|---|---|---|
| A human has a real document | — | (precondition, not a system stage) |
| Import | A human reads the document directly; for anything already machine-readable (JSON), `dataset-import-center.js` + `manual-import-queue-store.js` are real | Real (content) / Real but administrative-only (files) |
| Extraction | For a **single new NOR Type's first 1-2 documents**: a human authors a structured specification directly, in the exact shape `nor-reverse-engineering-knowledge.js` already proved (see §5, Guidelines). For a **population of 3+ documents of the same type**: `pattern-extraction-engine.js`/`vocabulary-extraction-engine.js`/`scope-detection-engine.js` become genuinely useful — they compute what's statistically consistent, which no amount of single-document reading can honestly claim | Tier 1: human-authored (real, proven). Tier 2: real code, currently unconnected — activating it means writing the connective glue between it and a real structured-fact population, not new algorithms |
| Candidate Knowledge | `ingest()` with `lifecycleState: 'draft'` (the real path every KnowledgeItem takes) | Real |
| Deduplication | `mergeKnowledge()` — literally `ingest` itself, confirmed idempotent-by-id | Real. `knowledge/promotion/knowledge-merge-engine.js` exists in parallel — **do not use**, redundant with the real path |
| Conflict Detection | `conflict-detection-engine.js#detectConflicts` | Real |
| Human Review | `review-workflow-engine.js`, `review-queue-engine.js`, Knowledge Center UI | Real. `review-session-engine.js` exists in parallel (a session wrapper around the same real verbs) — **skip**, adds nothing not already available |
| Approval | `promoteKnowledge()` | Real. `knowledge/promotion/promotion-engine.js#promoteToCandidate` exists in parallel — **do not use**, redundant |
| Knowledge Repository | `knowledge-repository.js` | Real |
| Immediately usable by Conversation, Reasoning, Composer | Confirmed this session, live: `question-optimizer.js`, `knowledge-gap-engine.js`, `reasoning-engine.js`, `nor-composer.js` all read Approved Knowledge on every call — no cache, no rebuild step, no delay | Real |

### Worked example: "tomorrow PBSI introduces Pengadaan"

A description of the operational process, not code:

1. **Obtain evidence.** Per §4/§6's checklist: at minimum one real, filled Pengadaan NOR (or the closest real equivalent document PBSI actually uses for procurement today). Ask the `pengadaan` department directly — this platform confirms that role exists (`docs/IDENTITY_SECURITY_CUTOVER_v1.11.1.2.md`), but has no document from it.
2. **Register the vocabulary.** One data call: `registerNorType('Pengadaan', 'Pengadaan', [...evidenced fields], {...})` in `nor-type-registry.js` — already how "Realisasi Petty Cash" was added this session; no code change beyond a registry entry.
3. **Author the specification.** A human (or an AI assistant under human supervision, as happened for petty cash) reads the real document(s) and writes one structured fact per observation, in the same shape as `nor-reverse-engineering-knowledge.js`: `sourceRef`, `confidence`, `reviewRationale`, `payload` (tagged `norType: 'Pengadaan'` if the fact is genuinely procurement-specific, left untagged if it is a Generic document convention already covered — check the existing Generic set first; do not re-author what already applies).
4. **Ingest and promote.** Run the same two calls (`ingest`, `promoteKnowledge`) the petty cash bootstrap already uses. A human names the approver and writes the rationale, exactly as today.
5. **Validate.** Re-run `scripts/north-star-acceptance-check.mjs` against a real Pengadaan utterance — Knowledge Gap Detection should show fewer/no gaps for Pengadaan, and Composition should start citing real, Pengadaan-specific patterns instead of only the 4 Generic ones.
6. **If and only if** a second and third real Pengadaan document later arrive, Tier 2 (the dormant extraction engines) becomes worth activating — but not before, because a single document cannot honestly support "this is a rule" over "this is what happened once."

### End-to-end roadmap: one uploaded NOR → production-ready Knowledge Pack

`Real document` → `Human reads it directly` → `Structured, cited specification authored (§5 guidelines)` → `registerNorType() if new` → `ingest() as Draft` → `promoteKnowledge() with a real human rationale` → `conflict-detection-engine.js runs automatically at every Reasoning read` → `immediately live in Conversation/Reasoning/Composer, no further step` → *(once 2+ documents exist)* `re-review any Draft/Candidate confidence upward, or leave as inferred/low-confidence — never silently upgraded` → *(once 3+ documents exist)* `optionally activate the Tier 2 extraction engines for cross-document consensus`.

This roadmap requires **zero new code** for Tier 1 (the realistic case for onboarding any of the 4 named types today, since none has more than the theoretical 1-2 documents a human could plausibly obtain quickly). It is the same roadmap that already, empirically, produced Realisasi Petty Cash.

---

## 3. Organizational Evidence Checklist

Per NOR Type, before authoring begins:

- [ ] **Minimum**: at least 1 real, filled document (PDF, scan, or photo of an actual instance)
- [ ] **Preferred**: 2+ real documents, from independent/different occasions — this is the literal bar that separates "inferred, low confidence" from "evidenced, high confidence" throughout the one real Knowledge Pack this platform has (its own recurring justification: *"byte-identical across both real, independently-generated samples"*)
- [ ] The real rendering source/template, if one exists in code (else: rendering conventions must stay Generic/borrowed from an existing NOR Type, never invented)
- [ ] Any real, approved organizational policy or workflow documentation for this process
- [ ] Access to ask the actual role-holders about steps a document alone cannot prove (who verifies arithmetic, what the real approval SLA is — see the 12 open questions already logged for petty cash as the model for what "still needs asking" looks like)
- [ ] Confirmation of the current, real signatory/approval-chain names (the ROLE can be evidenced from a document; the CURRENT NAME may need independent confirmation, since people change roles)
- [ ] The document family's own real terminology (so it can be told apart from Generic NOR vocabulary already covered)

---

## 4. Repository Evidence Matrix

| NOR Type | Evidence available | Evidence missing | Coverage | Priority |
|---|---|---|---|---|
| Realisasi Petty Cash | 2 real, independent documents; real rendering source; real config | Workflow SLA, disbursement-confirmation instrument, numbering scope (organization-wide vs. department-only) — 12 open questions already logged | High (54 tagged facts, 0.5-0.95 confidence range) | Maintain; answer the 12 open questions if a human is available |
| Pengadaan | A confirmed real department/role name only | Everything else: document, workflow, rules, template, rendering, terminology | None (0 tagged facts) | **Highest** — see worked example, §2 |
| Perjalanan Dinas | None found | Everything — current field schema is a mission-brief hypothetical, not evidenced | None | High — needed to validate or correct the existing placeholder schema |
| Reimbursement | A real, approved, *architecturally unrelated* document (`REIMBURSEMENT_TEMPLATE_STANDARD.md` — a driver/vehicle cost-claim form, not a NOR) | Whether this is even the right process to evidence "NOR Reimbursement" from | None (framing unresolved) | **Highest, but not an authoring task** — a human decision first, see `NORTH_STAR_VALIDATION_REPORT.md` §4 |
| Administration | None found; not even a registered NOR Type | Everything, including whether it should exist at all | None | Medium — depends on a human decision, not evidence-gathering |

---

## 5. Knowledge Acquisition Guidelines

**Can be extracted automatically:** administrative metadata only (domainType/kind/dataset classification from filename/folder tokens, via the real `metadata-inference-engine.js`); machine-readable structured content (real `JSON.parse()`); cross-document statistical consensus, but only once a real population of 3+ already-structured documents of the same type exists (Tier 2, §2).

**Requires human confirmation:** everything else — every business rule, every workflow step, every name, every rendering convention not already covered by an existing Generic fact. This platform has no automatic path from a real document's content to a KnowledgeItem, by design.

**Should never be inferred:** a specific individual's name or identity beyond what is directly, repeatedly observed; a business RULE from a single occurrence (that is an *observation*, not yet a rule — author it at low confidence, explicitly marked `status: 'inferred'`, exactly as `organizational-reasoning.float-ceiling-calibrated` (confidence 0.6) already models); anything no cited evidence source actually states.

**Should never be generalized:** a fact evidenced for one NOR Type must never silently apply to another without independent evidence for that second type — this was the exact mistake corrected in Iteration 2 (`payload.norType` absence now means "generic," never "unscoped by omission").

**Should remain Generic Knowledge:** document-mechanics and formal-Indonesian-letter conventions carrying zero business-subject content — salutation, closing sentence, dateline, the Terbilang convention, typography, margins, generic emphasis rules. The working test: does removing the specific business subject/department/process from the fact's own text leave it still true? If yes, Generic.

**Should become NOR Type Knowledge:** anything whose own text or meaning names a specific business process, department, role, approval chain, or subject matter — ontology, workflow, business rules, type-specific rendering (e.g. a ledger table shape), type-specific vocabulary, type-specific patterns, statistics, and organizational reasoning about that one process.

---

## 6. Production Readiness Criteria

**Recommendation: 2 real, independent examples minimum before any fact may be authored as domain-wide "evidenced" content (no `appliesWhen` condition, presented as how the process works). 1 real example is enough to author low-confidence, individually-cited Draft/Candidate facts — never enough to assert a rule.**

Justification: this is not a new policy invented for this document — it is the bar the one real Knowledge Pack in this platform *already, consistently* applies to itself. Every one of its highest-confidence facts (0.85-0.95) cites "both real, independently-generated samples" as the reason it can be trusted; every one of its lower-confidence facts (0.5-0.65) explicitly says why a single or thin sample cannot yet support a stronger claim, and several are labeled `status: 'inferred'` rather than `'evidenced'` for exactly this reason. Recommending anything looser would contradict a discipline this platform has already proven, at real cost of authoring effort, that it holds itself to.

**"Production-ready" (safe to compose into an unreviewed document) requires:** the evidence checklist (§3) substantially filled — 2+ documents, real rendering source where one exists, and at least a partial answer to the workflow/approval-chain questions a document alone cannot prove. This is, again, not a new bar — it is a description of what Realisasi Petty Cash already has today, and every other registered NOR Type does not.

---

## Validation

Does this workflow support Pengadaan, Perjalanan Dinas, Reimbursement, and Administration without architectural change? **Yes, already proven, not merely asserted:** the mechanism this document recommends (`registerNorType`, `ingest`, `promoteKnowledge`, `payload.norType` tagging, `conflict-detection-engine.js`) contains zero code that names "Realisasi Petty Cash" or any other specific NOR Type — every one of those functions is type-agnostic by construction, and Realisasi Petty Cash became this platform's one real, working NOR Type using *only* data (a registry entry, 54 tagged payloads), never a code change beyond what Iteration 2 already made to the scoping filters themselves. The identical process — human evidence, structured authoring, the same two calls — is available today for any of the other three, the moment real evidence exists to author from.

---

## 7-9. Updates to Phase 8 Remaining Blockers, North Star Readiness, and Next-Sprint Recommendation

Carried into `docs/NORTH_STAR_VALIDATION_REPORT.md` directly (updated in place, alongside this document) rather than duplicated here — see that file's §6, §8, and §9.
