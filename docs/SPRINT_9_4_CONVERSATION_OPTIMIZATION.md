# Sarpras Intelligence V2 — Phase 9, Sprint 9.4: Conversation Optimization

> Scope: verify whether Conversation benefits from Sprint 9.3's newly
> authored Knowledge. Method: `scripts/north-star-acceptance-check.mjs`,
> run at the pre-Sprint-9.3 commit (`68c24c7`, via a temporary git
> worktree) and at the current commit, same 6 scenarios, same ANSWER_BOOK
> — every number below is a real before/after diff, not an estimate.

---

## Headline finding

**Conversation asks exactly the same questions, in the same order, at the
same count, before and after Sprint 9.3 — for a specific, traceable
structural reason, not an oversight.** `question-optimizer.js#
resolveFromKnowledge` only resolves a field when an Approved KnowledgeItem's
`payload` contains a key that is the literal Conversation field name
itself (e.g. `payload.traveler`, `payload.item`) — see
`question-optimizer.js:120-130`. Every fact Sprint 9.3 authored is
process-level Knowledge (Ontology/Workflow/Rule/Pattern/Signatory shaped),
none of which carries a payload key matching `destination`, `traveler`,
`item`, `quantity`, `purpose`, or `budget`. This is not a defect in Sprint
9.3's authoring — Ontology/Workflow/Rule facts are supposed to answer "how
does this process work," not "what is this occasion's destination." It is
a real, now-precisely-located limitation for a future sprint to close
(see §5), not something this sprint can or should paper over.

**A real, separate, positive finding**: Knowledge Gap Detection did
measurably improve for both types — Perjalanan Dinas and Pengadaan's
former CRITICAL "no Approved Ontology exists" gap is fully resolved,
replaced by a single, much smaller, honestly-labeled `normal`-priority
`missing_evidence` gap (the deliberately low-confidence organizational
reasoning fact each pack carries). This belongs more to Sprint 9.5's
territory (Reasoning) but is the clearest evidence Sprint 9.3's Knowledge
is doing real work somewhere in the pipeline, even though not in
Conversation.

---

## 1. Question Count — before vs. after, all 6 scenarios

| Scenario | Questions asked (before) | Questions asked (after) | Changed? |
|---|---|---|---|
| Business Trip | 5 (destination, traveler, departureDate, returnDate, budget) | 5 (identical) | No |
| Procurement | 4 (item, quantity, purpose, budget) | 4 (identical) | No |
| Reimbursement | 6 (type, destination, traveler, departureDate, returnDate, budget) | 6 (identical) | No |
| Administration | 6 (identical) | 6 (identical) | No |
| Procurement (routing fix) | 4 (identical) | 4 (identical) | No |
| Administration (routing fix) | 6 (identical) | 6 (identical) | No |

**Never asks unrelated or duplicated questions** — unchanged from Phase
8.5 (verified by the same existing assertions: Procurement never asks
trip-shaped fields and vice versa). **Infers more information** — no,
`questionsSkippedCount` and `knowledgeUsedCount` are `0` in every scenario,
both before and after.

---

## 2. Completion Rate

6 of 6 scenarios reach `READY`, unchanged. Business Trip and Procurement
additionally reach `composeOk: true`, unchanged.

---

## 3. Confidence Progression

| Scenario | `confidenceAtCompletion` before | after |
|---|---|---|
| Business Trip | 0.8571428571428571 | 0.8571428571428571 |
| Procurement | 0.8333333333333334 | 0.8333333333333334 |
| Reimbursement | 0.8571428571428571 | 0.8571428571428571 |
| Administration | 0.8571428571428571 | 0.8571428571428571 |

**Byte-identical.** One nuance surfaced and fixed during this
measurement, not silently corrected after the fact: a first pass showed
Business Trip's confidence drop to 0.75, caused by a real self-consistency
bug in Sprint 9.3's own authored data (`signatory.bpd-traveler`'s role
string read "Staf bidang Sarpras (traveler)" while
`ontology.perjalanan-dinas`'s stakeholder entry read "Staf bidang
Sarpras" — `knowledge-gap-engine.js`'s `missing_entity` check is a strict
string match, so the mismatch spuriously fired a gap that shouldn't exist).
Fixed in a follow-up commit by aligning the two strings; confidence
returned to its exact pre-Sprint-9.3 value, confirming the bug, not a real
Conversation regression, was the cause.

---

## 4. Conversation Quality / Regression

Zero regressions. North Star acceptance harness: 27/27 (unchanged count
and content from Sprint 9.3's own 27/27). Full regression sweep re-run:
`problem-solving-integration-check` (30/30), `knowledge-gap-check`
(20/20), `nor-composition-check` (17/17), `dynamic-conversation-check`
(27/27), `reasoning-engine-check` (19/19) — all green.

---

## 5. Conversation Improvement Report — the honest answer

**No improvement this sprint, and a precisely located reason why not.**
`question-optimizer.js`'s Knowledge-resolution path is keyed to exact
field-name matches in `payload` — a mechanism designed for "does an
Approved fact directly answer this occasion's `traveler`/`item`/etc.,"
not "does the platform understand this process." Sprint 9.3 authored the
second kind of Knowledge, correctly (an Ontology cannot honestly claim to
know a specific occasion's destination), but that means it structurally
cannot feed Conversation through the mechanism that exists today.

**What WOULD close this gap, named but not built this sprint (per Sprint
9.3's own explicit scope — Conversation-engine changes are out of
Knowledge-authoring's scope):**
- A `payload.default:<field>`-shaped fact (the same convention
  `resolveFromProfileOverride` already uses) could let a genuinely
  recurring per-occasion fact (e.g. the one traveler who has done every
  observed Sirnas venue survey) be proposed, not asked — but authoring one
  from only 1 real traveler across 2 documents would itself be an
  over-generalization Sprint 9.2's own evidence checklist would flag.
- Pengadaan's and Perjalanan Dinas's fieldSchema mismatch with real
  evidence (§5 of `docs/SPRINT_9_3_KNOWLEDGE_AUTHORING.md`) is the more
  consequential, structural gap — closing it would change WHAT
  Conversation asks, which today's mechanism cannot do regardless of how
  much more Knowledge is authored.

**Recommendation for whoever picks up Conversation-engine work next:**
before authoring more per-field Knowledge, decide whether
`resolveFromKnowledge` should also accept an Ontology's own `stakeholders`
entries in a `traveler`/`item`-shaped question (a real, small extension) —
that is the one existing mechanism placed to use exactly the Ontology
Knowledge this sprint already authored, and doing so was not attempted
here because it is a Conversation-engine code change, not a Knowledge-
authoring one, and Phase 9's own discipline keeps those two separate
until a human decides otherwise.
