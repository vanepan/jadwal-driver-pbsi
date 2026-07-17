# Sarpras Intelligence V2 — Phase 8.5 (Iteration 4)
# NOR Onboarding Playbook

> Scope: operational documentation only — no code, no architecture, no
> fictional Knowledge. This playbook operationalizes
> `docs/ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md` (Iteration 3)
> into step-by-step checklists concrete enough that someone unfamiliar with
> this platform's internals could follow them. Every function name, file
> path, and field shape cited below was verified by direct code reading
> this session — nothing here is aspirational or a stand-in for a future
> API.

---

## Prerequisites

Before starting, confirm:

- You have **at least one real NOR document** for the type you're onboarding (a filled PDF, scan, or photo of an actual instance — not a template, not a description of one).
- You have (or can get) write access to `js/v2/knowledge/registry/nor-type-registry.js` and a new file under `js/v2/knowledge/bootstrap/`.
- You have someone who can act as **Reviewer** — may be the same person as the Author for a solo/trusted pass (this is what produced the platform's only real Knowledge Pack today), but a second person is preferred once more than one NOR Type exists, so a Reviewer isn't grading their own work.
- You can run `node scripts/north-star-acceptance-check.mjs` and `node scripts/knowledge-ownership-check.mjs` locally (Node, no build step, no Firebase).

---

## 1. The Playbook

### Step 1 — Gather evidence
Collect everything real you can find (see the Evidence Quality Matrix, §7, and the Evidence Checklist, `ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md` §3). Do not proceed to authoring with zero real documents — there is nothing to cite.

### Step 2 — Register the NOR Type (if new)
In `js/v2/knowledge/registry/nor-type-registry.js`:
1. Add one line to the `NOR_TYPE` constant: `MY_TYPE: 'Real Name From The Document'` — use the literal term the real document itself uses (e.g. "Realisasi Petty Cash" was lifted verbatim from the document's own Perihal line, not invented).
2. Add one `registerNorType(NOR_TYPE.MY_TYPE, 'Real Name', [fieldSchema], { parentId: null })` call inside `bootstrap()`. `fieldSchema` is an array of `{ field, label, prompt, optimizable }` — author only fields you have real evidence a human is actually asked for (see Guidelines, `ORGANIZATIONAL_KNOWLEDGE_ACQUISITION_FRAMEWORK.md` §5); if unsure, start with fewer fields, not more.

This is a **data change to an existing, working registry** — not a new engine, not a schema change. `hasNorType()`/`getNorType()`/`listNorTypes()`/`getNorTypeFieldSchema()` all pick it up automatically.

### Step 3 — Author the Knowledge specification
Create a new file under `js/v2/knowledge/bootstrap/` (do not add to the existing petty-cash file — a new NOR Type gets its own file, mirroring how `nor-reverse-engineering-knowledge.js` itself is scoped to one evidence base). Follow the Knowledge Author Checklist (§2) exactly. Each fact is a plain object:

```
{
  sourceRef: 'stable-id-for-this-fact',
  confidence: 0.0-1.0,               // see the Evidence Quality Matrix, §7
  reviewRationale: 'why this confidence, in your own words',
  payload: {
    ...kind-appropriate fields...,
    norType: NOR_TYPE.MY_TYPE,        // OMIT this line entirely if the fact is Generic (see §5 below)
  },
}
```

`kind` must be one already registered in `js/v2/knowledge/registry/kind-registry.js` (ontology, workflow, rule, policy, rendering_rule, sentence_pattern, paragraph_pattern, template_pattern, structure, vocabulary, signatory, recipient, cc, approval_chain, statistic, organizational_reasoning, question_tree, relationship, and others — do not invent a new one; if nothing fits, that itself is worth flagging rather than force-fitting).

### Step 4 — Ingest and promote
Write one function, mirroring `seedNorBootstrapKnowledge()`'s own body exactly: loop your specs, call `ingest(item)` (builds the object via the same shape `knowledge-item-contract.js` defines — `id`, `version: 1`, `domainType: 'nor'`, `sourceType`, `kind`, `payload`, `confidence`, `lifecycleState: 'draft'`, `provenance`, ...), then call `promoteKnowledge(item.id, { approverId, decidedAt, preferenceRationale: spec.reviewRationale })`. This single call walks Draft → Candidate → Pending Review → Approved — there is no separate "submit" step required to use this path.

**Alternative, for a real multi-person rollout:** ingest as Draft only, and have the Reviewer (a different person) approve via the real Knowledge Center UI review queue (`review-workflow-engine.js`/`review-queue-engine.js`, already wired) instead of the same person calling `promoteKnowledge` on their own work. Both paths call the identical underlying function; the difference is who presses the button.

### Step 5 — Review (see Reviewer Checklist, §3)

### Step 6 — Approve (see Approval Checklist, §4)

### Step 7 — Validate (see Validation Checklist, §5)

---

## 2. Knowledge Author Checklist

- [ ] I have at least one real document open next to me while writing each fact — I am transcribing, not recalling or assuming.
- [ ] Every `payload` field has a real value copied from the document, or is honestly left absent (never a placeholder string).
- [ ] Every fact's `confidence` reflects how many independent documents support it (§7) — not how confident I personally feel.
- [ ] Every fact's `reviewRationale` states, in plain language, WHY that confidence — "byte-identical across 2 real samples" is a rationale; "seems right" is not.
- [ ] I checked whether this fact is Generic (already covered by an untagged fact in an existing NOR Type's bootstrap file) before authoring it again — I did not duplicate.
- [ ] I tagged `payload.norType` on every fact whose own text/meaning names this specific business process, department, role, or subject — and left it OFF every fact that is a pure document-mechanics/formal-letter convention with no business content (see the worked classification in `CORE_NOR_KNOWLEDGE_PACK.md` §2 for real examples of both).
- [ ] Any claim I could not directly observe — a reason WHY something is done a certain way, rather than a description of what IS done — is marked `status: 'inferred'` in an `organizational_reasoning`-kind fact, never stated as plain fact.
- [ ] Any real open question I have (something the document alone can't answer) is recorded as a `question_tree`-kind fact, not silently dropped or silently guessed.
- [ ] I did not invent a business rule, a person's name, or a numbering scheme that isn't directly evidenced.

---

## 3. Reviewer Checklist

**What to verify:**
- Does every fact cite a real, traceable source (`observedIn`/`evidenceRefs`, or a plain reference to the document you can go check)?
- Does the `confidence` number match §7's tiers, given how many independent documents actually support it — not just what the Author wrote?
- Is `payload.norType` present only where the fact is genuinely type-specific, and absent where it's genuinely Generic? (Wrong-way tagging in either direction was the exact defect Iteration 2 fixed platform-wide — check this carefully.)
- Does anything here duplicate an existing Generic fact from another NOR Type's file? (Reject — extend the existing Generic fact's applicability instead of copying it.)

**What to reject:**
- A fact with no cited source.
- A fact whose `confidence` is high (>0.8) but is evidenced by only one document — should be capped lower or explicitly marked `inferred`, per §7.
- A fact that reads as a business RULE but is really a one-time observation.
- Anything that looks like it was generalized from a different NOR Type without independent evidence for this one.

**What requires more evidence before it can be Approved (send back, don't reject outright):**
- Any WORKFLOW or ORGANIZATIONAL_REASONING fact resting on a single document — these usually need either a second document or a real conversation with a role-holder (a document alone often can't prove *why* a step exists, or confirm an approval SLA).
- Any SIGNATORY/APPROVAL_CHAIN fact where the named individual may have changed roles since the document was produced.

**Confidence rules (from the platform's own already-proven discipline, not invented for this playbook):**
| Evidence | Confidence range | Status |
|---|---|---|
| 1 document | 0.5–0.7 | usually `inferred` unless the fact is a direct, unambiguous transcription (e.g. a literal number on the page) |
| 2+ independent documents, consistent | 0.8–0.95 | `evidenced` |
| A real config/template file directly confirming the same fact | +confidence, cite the code file too | `evidenced` |
| Conflicting facts from the same or different documents | flag via a `relationship` of type `conflicts_with` — never silently pick one | — |

**Conflict handling:** use `conflict-detection-engine.js#detectConflicts` (already real, already runs automatically both in the review queue and at every Reasoning read) — do not hand-resolve a conflict by deleting or editing one of the conflicting facts. If two facts genuinely disagree, author BOTH, honestly, and let the platform's own conflict machinery surface it (exactly how `statistic.nor113-terbilang-page1` vs. `statistic.nor113-terbilang-page2` — a genuine, real inconsistency within the same NOR — was handled: recorded as a real `conflicts_with` relationship, not hidden).

---

## 4. Approval Checklist

A Knowledge Pack (the full set of facts for one NOR Type) is ready for promotion when:

- [ ] Every fact has passed the Reviewer Checklist (§3) individually.
- [ ] At least the Ontology (`kind: 'ontology'`) and Approval Chain (`kind: 'approval_chain'`) facts exist and are `evidenced` (not merely `inferred`) — without these, Knowledge Gap Detection will (correctly) keep reporting this NOR Type as unsupported, per `knowledge-gap-engine.js`'s own logic.
- [ ] The `fieldSchema` registered in Step 2 has been checked against what the Conversation actually needs to ask — not padded with fields nobody would really answer.
- [ ] `payload.norType` tagging has been spot-checked against at least one Generic fact and one type-specific fact to confirm neither is mistagged.
- [ ] The Reviewer is a different person than the Author, OR the Author explicitly notes this was a solo/trusted pass (exactly as `nor-reverse-engineering-knowledge.js`'s own `preferenceRationale` fields already do — "seed for problem-solving-integration-check.mjs" is an honest, minimal rationale for a solo/test context; a real organizational rollout should do better).

Promotion itself is one function call, already governed: `promoteKnowledge(id, { approverId, decidedAt, preferenceRationale })`. A blank or missing `preferenceRationale` is refused by the platform itself — there is no way to approve silently.

---

## 5. Validation Checklist

Before considering a new NOR Type "onboarded," verify all six, using the existing acceptance harness — do not hand-check each one manually if the harness already covers it:

- ✓ **Retrieval** — `listKnowledge({ domainType: 'nor', lifecycleState: 'approved' })` returns your new facts; spot-check a few `payload.norType` values.
- ✓ **Conversation** — drive `beginProblemSolving()` with a real utterance naming your NOR Type; confirm `conversation.gatheredFacts.type` resolves correctly and the questions asked match your registered `fieldSchema`, not some other type's.
- ✓ **Knowledge Gap Detection** — `detectKnowledgeGaps('nor', 'Your NOR Type')` should report FEWER gaps than before (ideally none, if Ontology + Approval Chain are evidenced) — if it still reports the same "no Ontology" gap it did before you started, something didn't get tagged correctly.
- ✓ **Reasoning** — not yet part of the live CREATE_NOR path (a confirmed, unrelated, pre-existing gap — see `NORTH_STAR_VALIDATION_REPORT.md` §5); nothing to validate here today beyond confirming this hasn't silently changed.
- ✓ **Composition** — `composeApprovedNor()` on a completed Conversation for your type should now cite your new, type-specific patterns/rules, not just the 4 Generic ones every type shares (salutation, closing, date line, Terbilang).
- ✓ **Acceptance Harness** — add your new scenario's utterance to `scripts/north-star-acceptance-check.mjs`'s scenario list (the harness is explicitly designed to take more scenarios; this is a data addition, not a new script) and re-run it. All existing assertions must still pass; your new scenario's trace should show real citations where it previously showed none.

---

## 6. Repository Folder Convention (recommendation only — nothing enforces this today)

```
docs/knowledge-sources/
  Pengadaan/
    NOR-001.pdf
    NOR-002.pdf
    Workflow.pdf
    Interview.md
    Template.docx
    Notes.md
  Realisasi-Petty-Cash/
    NOR-113.pdf
    NOR-120.pdf
```

This mirrors how `docs/NOR-Specification.md` already functions as the (single, unfoldered) evidence citation target for the existing petty-cash pack — formalizing it into per-type folders would make future evidence auditable and would let a Reviewer literally open the cited source next to the Knowledge spec. **This is a recommendation, not a requirement** — no code or process depends on this exact path, and creating it is optional, low-risk, reversible work for whoever onboards the next NOR Type.

---

## 7. Evidence Quality Matrix

| Evidence | Classification | Confidence guidance | Real precedent |
|---|---|---|---|
| One document | Observation | 0.5–0.7, usually `inferred` for anything beyond a direct transcription | `statistic.cycle-span` (n=2, but still only 0.5 — "not enough to confirm a fixed monthly cadence") |
| Two independent documents, consistent | Evidence | 0.8–0.9 | `pattern.perihal-subject-line` (0.9 — "matches both real samples exactly") |
| Three or more, consistent | Candidate organizational rule | 0.85+ | Not yet reached by any real NOR Type in this platform — the honest bar for "rule," not "pattern observed twice" |
| A real, approved policy document | Authoritative organizational rule | 0.9+, can stand alone even without a filled example | Not yet available for any NOR Type in this platform (no real policy document has been used as evidence to date) |
| An interview / role-holder confirmation | Supporting evidence | Raises confidence on an existing fact; on its own, insufficient for anything beyond a `question_tree` entry being marked answered | The 12 real open questions already logged for petty cash are exactly what an interview would close |

---

## 8. Onboarding Walkthrough — "NOR Pengadaan Meja.pdf" arrives tomorrow

1. Someone hands you one real, filled PDF: a procurement NOR for office tables.
2. **Step 2**: register `PENGADAAN_MEJA`... actually, check first — is this a new NOR Type, or is it an *instance* of the already-registered `Pengadaan` type? (It's the latter — "Pengadaan Meja" is a specific procurement occasion, not a new type; `Pengadaan` is already registered from last session, just with zero evidenced facts.) No new registry entry needed — skip to Step 3.
3. **Step 3**: read the PDF directly. Transcribe its Perihal line, its recipient/cc/sender fields, its numbering format, its signatory roles and names, its approval workflow if visible, its rendering conventions (compare against the existing Generic set first — if the layout matches what's already Generic, don't re-author it). Author each as a fact, `payload.norType: NOR_TYPE.PENGADAAN` for anything procurement-specific.
4. Because this is **one document**, per §7 every fact starts at 0.5–0.7, `inferred` where it's more than a direct transcription. Do not claim `evidenced` yet — that requires a second, independent Pengadaan document.
5. **Step 4**: `ingest()` + `promoteKnowledge()` (or the Knowledge Center review-queue path if a second person is reviewing).
6. **Steps 5-6**: Reviewer checks against §3 — given this is n=1, expect the Reviewer to send back any fact claiming high confidence, and to flag Workflow/Organizational-Reasoning facts as needing either a second document or an interview with the `pengadaan` department before they can be trusted.
7. **Step 7**: run the Validation Checklist. Expect: Knowledge Gap Detection for Pengadaan now shows fewer gaps (Ontology and Approval Chain may now be evidenced, even at n=1, if the PDF is clear enough); Composition starts citing real Pengadaan patterns instead of only the 4 Generic ones.
8. **Next real Pengadaan document that arrives**: re-open the SAME Pengadaan Knowledge file, add its facts, and — critically — go back and *raise* the confidence of any Step-3 fact the second document independently confirms (from 0.6 `inferred` to 0.85 `evidenced`), exactly how the real petty-cash pack's own confidence numbers work. Never silently leave a single-document guess sitting at a confidence that implies more certainty than it has.

No code was written or needs to be written to execute this walkthrough.

---

## 9. Phase 8 Completeness Review

Reviewed against Phase 8's own original completion criteria (the plan that opened this whole phase):

| Original criterion | Status |
|---|---|
| Every stage validated | **Met** — `north-star-acceptance-check.mjs`, all 4 scenarios, all 9 stages |
| Every stage measurable | **Met** — the same harness prints real numbers per stage, every run |
| Every decision explainable | **Met** — `explainConversation`, `explainDynamicConversation`, `reason()`'s own `explanation` field, `explainKnowledge` are all real and wired |
| Remaining blockers known | **Met** — consolidated in `NORTH_STAR_VALIDATION_REPORT.md` §5/§6, re-verified fresh at every iteration |
| Acceptance scenarios exist | **Met** |
| Pipeline regression suite exists | **Met** — the harness itself, plus the 7 pre-existing check scripts it doesn't duplicate |
| North Star readiness measured | **Met** — ~28-32%, with an honest breakdown of what each point is and isn't |
| Phase 9 backlog generated | **Met** — priority lists exist in every iteration's report |

**One narrow item from Sprint 8.4's original literal text is genuinely not built, confirmed by direct search this session:** "rejected alternatives" (which Knowledge items were considered but did NOT apply to a given Problem) and "execution duration" (timing per pipeline stage) have zero implementation anywhere in `js/v2/reasoning/` or elsewhere — grepped for `duration`/timing patterns and for any "rejected/not-applicable" surfacing; found none. Everything ELSE Sprint 8.4 asked for (input/output/confidence/evidence/selected rule per stage) is real, via the `explain*()` functions already cited above.

**Determination: Phase 8 is complete in substance.** The one gap found is narrow, dev-tooling-only (never user-facing), and does not block anything on the Phase 9 priority list — it would only matter if a developer specifically needed to answer "why wasn't rule X applied" or "how long did this stage take," which no current blocker depends on. Recommend closing Phase 8 and carrying this single item onto the Phase 9 backlog as a low-priority nice-to-have, not a Phase 8 blocker.

---

## 10. Recommended First Sprint of Phase 9 (definition only — not implemented here)

**"Resolve Reimbursement's framing, then onboard Pengadaan using this playbook."**

Two sequential steps, both research/evidence tasks before any authoring:
1. A human decides whether `docs/REIMBURSEMENT_TEMPLATE_STANDARD.md`'s real, approved driver-reimbursement form is the same organizational process as "NOR Reimbursement." If yes, the authoring cost may be near-zero (Template + Rendering evidence already exists; only the Ontology/Workflow/Business-Rules layer needs authoring, using this playbook exactly).
2. In parallel or after, obtain one real Pengadaan document (§8's walkthrough) and follow this playbook end to end — Author → Reviewer → Approval → Validation — producing the platform's second real, evidenced NOR Type.

Success criterion: `scripts/north-star-acceptance-check.mjs`'s Procurement scenario shows real, type-specific citations in Composition, and Knowledge Gap Detection reports zero critical gaps for Pengadaan's Ontology/Approval Chain — mirroring exactly what Realisasi Petty Cash already demonstrates today.

---

## Validation — does this playbook cover all 4 named NOR Types without architecture change?

Yes, by construction: every step above (registerNorType, ingest, promoteKnowledge, review queue, conflict detection, the acceptance harness) is the identical, already-proven, type-agnostic mechanism used for Realisasi Petty Cash. Nothing in this playbook is specific to any one NOR Type — it is a description of a repeatable process, not a description of Pengadaan, Perjalanan Dinas, Reimbursement, or Administration individually. The only thing that differs between onboarding any of the four is which real evidence someone brings.
