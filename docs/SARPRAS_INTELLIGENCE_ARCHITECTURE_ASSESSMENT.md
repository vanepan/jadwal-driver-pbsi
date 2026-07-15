# Sarpras Intelligence — Architecture Assessment Report

> Prepared against: `CLAUDE.md` (Organizational Learning Platform master context, newly
> adopted as this repository's authoritative constitution) and
> `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` (the approved, binding V2 architecture
> that the code below was actually built against).
> Grounded in: `js/v2/` (286 files), its 18 module READMEs, `js/v2/dormant-subsystems.js`,
> `js/config/feature-gates.js`, `js/config.js#VERSION_HISTORY` (current: v1.24.0,
> 2026-07-14, plus one further uncommitted-to-changelog commit `f1fe7bcf` on 2026-07-15),
> and direct reading of representative engine/contract/service files.
> No production code was written or modified to produce this report.

---

## 1. Executive Summary

**This is not a green-field assessment.** The question CLAUDE.md poses —
"how do we build an Organizational Learning Platform that preserves reasoning,
not just documents?" — has already been substantially answered, in code, over
twelve phases (V2.0.0 → RC1) spanning `js/v2/`. What exists is unusually
disciplined: contract-first design in every subtree, a strictly one-way,
machine-checked dependency graph, an append-only versioned lifecycle for every
domain (Knowledge, Archive, Conversation, Learning), and an explicit governance
register (`dormant-subsystems.js`) that forces any built-but-unwired capability
to say so rather than silently render a confident zero. This directly and
literally implements CLAUDE.md's Principle 6 ("Knowledge must always be
explainable") at the *meta* level — the platform explains its own gaps, not
just its recommendations.

The honest news is two-sided:

- **The infrastructure CLAUDE.md asks for is ~85% built.** Knowledge
  acquisition, curation, review, versioning, explainability, dependency
  graphing, machine-learning-assisted pattern discovery, organizational
  memory, and a deterministic conversation layer all exist as real, tested
  code — not scaffolding. `ai-foundation/` (the AI adapter seam) is correctly,
  deliberately still all `NOT_IMPLEMENTED` stubs, exactly matching CLAUDE.md's
  "AI is replaceable, knowledge is permanent" principle.
- **The "reasoning" middle of CLAUDE.md's own Thinking Model is the one
  genuine structural gap.** Of the ten stages in CLAUDE.md's Problem →
  Observation → Diagnosis → Knowledge Gap Identification → Reasoning →
  Decision → Governance → Communication → Documentation → Learning chain,
  seven already have a real, working home in existing code. **Diagnosis** and
  **Communication** have no home at all, and **Reasoning** exists only in a
  deliberately narrow form (statistical rollups over Approved Knowledge — never
  a general evidence-weighted diagnostic engine). This is the correct place to
  spend the next increment of engineering effort — not a rebuild, an addition.

The third finding this report surfaces, because a principal-architect review
should not simply repeat what the codebase's own READMEs already say well: the
platform's own top-level README (`js/v2/README.md`) is **already one commit
stale** relative to `js/v2/file-storage/` — it claims "No file-upload/Storage
mechanism exists anywhere in this codebase," but `file-storage-engine.js` (V2.1)
is real, wired, and is called from `ui/dataset-import-center.js` today,
uploading to actual Firebase Storage with SHA-256 dedup. This is not a crash —
it is exactly the kind of quiet drift CLAUDE.md's Principle 6 exists to catch,
found here in the one place it hadn't yet been applied to the documentation
itself. See §3.4.

---

## 2. Current Architecture Map

```
V1 (production, untouched)                    js/v2/ (RC1, dormant to all but one pilot user)
─────────────────────────────                 ──────────────────────────────────────────────
js/app.js, js/petty-cash/*, js/analytics/*,    ai-foundation/       adapter layer only, 3 stub
js/prediction/*, js/recommendation/*, ...      providers (claude/openai/local), NOT_IMPLEMENTED
      ▲                                              │ depends on (one-way)
      │ read-only, via *-store.js getters            ▼
      └───────────────────────────────────────  knowledge/          THE PLATFORM CORE
                                                   contracts/ registry/ repository/ lifecycle/
                                                   acquisition/ connectors/ (1 real + 12 stub)
                                                   extraction/ review/ learning/ machine-learning/
                                                   metrics/ explainability/ dependency-graph/
                                                   profiles/ datasets/ services/ (15-facade layer)
                                                        │ read-only, never reverse
                                                        ▼
                                                 organizational-memory/   Archive/Timeline/Gap/
                                                   Duplicate/Upload-recommendation, downstream only
                                                        │
                                                        ▼
                                                 learning/ (top-level, Phase 5)  MOST UPSTREAM domain
                                                   LearningEvent: Observed→Validated→Accepted→
                                                   Applied→Historical; depends on nothing above it
                                                        ▲
                                                        │ read-only
                                                 conversation/ (Phase 6)  deterministic intent +
                                                   questionnaire + task-executor; NO chat UI wired
                                                        ▲
                                                        │
                                                 document-intelligence/  first CONSUMER of knowledge/
                                                   nor/ — 5 real pipeline steps (analyze/draft/
                                                   validate/explain/recommend), the only live pilot
                                                        ▲
                                                        │
                                                 ui/  the ONLY presentation layer — 6 workspaces:
                                                   sarpras-intelligence-center (shell + Executive
                                                   Briefing), nor-center, archive-center,
                                                   knowledge-center, learning-dashboard,
                                                   dataset-import-center (+ sarpras-settings)
```

**Gate:** `js/config/feature-gates.js#isV2Enabled(user)` — `role==='admin' &&
username==='evan'`, reached only via `js/config/module-loader-registry.js`'s
dynamic `import()`. Nothing under `js/v2/` is statically imported by anything
outside it. Zero V1 runtime behavior has changed across twelve phases of V2
development — the dependency-direction and dormancy rules are enforced by four
`scripts/*-ownership-check.mjs` harnesses (knowledge: 55/55, archive: 74/74,
learning: 63/63, conversation: 77/77 assertions, per the v1.24.0 changelog).

**Maturity by subtree** (real = tested, callable, produces non-fabricated
output; stub = shape-locked, honestly returns `NOT_IMPLEMENTED`; dormant =
real code with zero current callers):

| Subtree | Status | Note |
|---|---|---|
| `knowledge/repository`, `lifecycle`, `review`, `services` | **Real** | Core is complete; `MemoryRepository` is the active backend |
| `knowledge/connectors` | **1 real / 12 stub** | Only `nor-connector.js` is wired; Memorandum/SOP/Analytics/etc. all honestly `NOT_IMPLEMENTED` |
| `knowledge/machine-learning`, `explainability`, `dependency-graph`, `profiles` | **Real** | Clustering, pattern mining, `explain()`, BFS graph, Organizational Knowledge Profiles |
| `knowledge/learning` (payload-correction mechanics) | **Dormant** | `submitCorrection` has zero callers — registered in `dormant-subsystems.js`, not silently zeroed |
| `document-intelligence/nor` | **Real (1 of N possible domains)** | 5 real steps, NOR-only |
| `document-intelligence/composer` | **Dormant** | Write side (`editSection`) has no authoring UI — registered in `dormant-subsystems.js` |
| `organizational-memory/*` | **Real** | Archive, Timeline, Gap Detection, Duplicate Detection, Health — NOR-sourced only (only real V1 store) |
| `learning/` (top-level, Phase 5) | **Real** | Single owner of organizational learning events, five real correction paths wired |
| `conversation/` (Phase 6) | **Real engine, no UI caller** | Deterministic intent/questionnaire/context-builder; architecture-only by design this phase |
| `ai-foundation/*` | **Stub (by design)** | All 3 adapters `NOT_IMPLEMENTED`; correct per CLAUDE.md ("AI is replaceable") |
| `file-storage/*` | **Real, wired** | SHA-256 dedup + real Firebase Storage upload, called from Dataset Import Center — **not yet reflected in `js/v2/README.md`** |
| `ui/*` (6 workspaces) | **Real** | All presentation-only, compose existing engines, invent no new numbers |

---

## 3. Gap Analysis

### 3.1 The Thinking Model, mapped stage by stage

CLAUDE.md's binding lifecycle is Problem → Observation → Diagnosis → Knowledge
Gap Identification → Reasoning → Decision → Governance → Communication →
Documentation → Learning. Mapping it against what is actually callable today:

| Stage | Existing home | Real? |
|---|---|---|
| Problem / Observation | `conversation/intent/intent-engine.js` (utterance → intent), `document-intelligence` `analyze` step | Real |
| **Diagnosis** | *(none)* | **Missing** |
| Knowledge Gap Identification | `organizational-memory/gap-detection-engine.js` | Real, but scoped to "missing NOR" only |
| **Reasoning** | `nor-recommender.js` / `nor-generator.js` | Real, but deliberately narrow: statistical rollups (counts/averages) over Approved Knowledge only — never a general evidence-weighted diagnostic reasoning engine |
| Decision | `knowledge/review/review-workflow-engine.js` (human-gated, no auto-approve path exists) | Real |
| Governance | 5-state lifecycle + `dormant-subsystems.js` register | Real — arguably the strongest-built part of the whole platform |
| **Communication** | *(none)* | **Missing** — no bridge to V1's own channel-agnostic notification bus exists from `js/v2/` |
| Documentation | `document-intelligence/nor` pilot + `composer/` (dormant) | Partially real |
| Learning | `learning/` (Phase 5), `LearningEvent` lifecycle | Real |

**This is the headline finding.** Reasoning today is intentionally not
generative — it never proposes `norNumber`, subject, or recipients, only
statistically-supportable cardinalities. That restraint is *correct* per
CLAUDE.md Principle 7 ("Never invent business rules"). But it means there is
currently no engine anywhere in this platform that takes multiple pieces of
cited evidence and produces a structured, explainable *diagnosis* — the
step CLAUDE.md places before any recommendation is allowed to exist
(Principle 2, "Diagnosis before recommendation"). Building this well, without
regressing the discipline that makes the rest of the platform trustworthy, is
the single most consequential piece of remaining foundation work. See §6.

### 3.2 Content gap (already self-diagnosed by the team, worth restating)

`js/v2/README.md` is explicit: "the platform itself (engines + presentation)
is complete; what's deliberately still empty is **content** — no real
Organizational Knowledge, Bootstrap Dataset, or Official NOR Archive has been
authored yet." CLAUDE.md's actual mission — preserve organizational
*reasoning* — cannot be evaluated at all until this content exists. This is
correctly scoped as *out of engineering*, but it means the platform currently
preserves nothing yet; it is ready to.

### 3.3 Domain-agnosticism is architecturally true but empirically untested

`docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` §4.4 raised this as an open
question at Phase 3 and it is **still open at RC1**: "Phase 6 acceptance
should require exercising the Documents connector … against at least one
structurally different domainType … before declaring the Knowledge Platform
foundation 'done.'" Twelve phases later, exactly one connector (`nor`) is
real; Memorandum, SOP, Business Rules, Analytics, Recommendation,
Configuration, Workflow, Policies, Templates, User Corrections, and
Operational History are all still placeholder stubs. The domain-agnostic
*shape* is real and enforced (no `nor`-specific code exists in
`knowledge/repository` or `knowledge/lifecycle`), but the platform has never
been proven against a second domain in practice. Every piece of Organizational
Memory content today is, in effect, NOR-shaped.

### 3.4 Documentation drift (new finding, not previously self-diagnosed)

`js/v2/README.md`'s own "What this tree still does NOT do" section states:
*"No file-upload/Storage mechanism exists anywhere in this codebase —
Archive Center's 'Upload Queue' is a workflow status marker, never a real
upload."* This was true when written. It is no longer true:
`js/v2/file-storage/file-storage-engine.js` (V2.1) computes a real SHA-256,
checks a dedup registry, and calls the real `uploadFileToStorage` primitive
(`js/firebase.js`) — and it is genuinely wired, called from
`ui/dataset-import-center.js:2225` on every dataset import. The commit that
built this (`889fd350`/`f1fe7bcf`) predates the RC1 README label
(`V2.0.18–V2.0.20`) not updating this specific claim. This is precisely the
"a reader would see 'not dormant' and reasonably assume THAT NUMBER moves"
failure mode `dormant-subsystems.js`'s own header warns about — just applied
to prose instead of a metric. Low severity, high symbolic importance: this
platform's core discipline is "never let a claim outlive the code it
describes," and its own flagship README just did, once. Worth a fast,
mechanical fix (§7, Sprint A).

### 3.5 No CI enforcement of the ownership-check discipline

Four `scripts/*-ownership-check.mjs` harnesses (plus ~30 more V2-adjacent
`*-check.mjs` scripts under `scripts/`) are real, thorough, and — per the
changelog — genuinely run before each phase ships. There is no
`.github/workflows/` directory and no `package.json` `scripts` block; these
checks are `node scripts/x-check.mjs`, run by hand. The discipline is real
today because one person is disciplined. It is not yet a property of the
repository.

### 3.6 What is correctly *not* a gap

- `ai-foundation/`'s three stub adapters are not unfinished work — they are
  the intended, permanent shape until a real LLM integration is a deliberate,
  separate decision. Building a real adapter now would be premature, not
  overdue.
- The single-pilot-user gate is appropriate for RC1, not a defect.
- Composer being dormant is an honest, registered deferral, not an oversight.
- The two other explainability surfaces already in V1
  (`js/prediction/explainability.js`, `js/services/dispatch-presentation.js`)
  being unreconciled with `knowledge/explainability/` is explicitly,
  correctly out of scope per the platform's own README — unifying them would
  touch V1, which is not this tree's mandate.

---

## 4. Proposed Foundation Architecture

Because the foundation CLAUDE.md describes is already ~85% built, the correct
proposal is **not** a new architecture — it is the smallest addition that
completes the Thinking Model using the exact conventions already proven
twelve phases running: contracts-first, one pure engine, one repository (if
stateful), one services/ facade, dormant until a caller exists, verified by a
dedicated `*-ownership-check.mjs`.

```
js/v2/
  reasoning/                 NEW — Phase 11 candidate. Sits between
                              organizational-memory/ (Knowledge Gap
                              Identification) and conversation/task-executor.js
                              or document-intelligence/'s `recommend` step.
    contracts/                 Diagnosis shape: problem statement, evidence
                                cited (KnowledgeItem ids / ArchiveRecord ids /
                                LearningEvent ids — never free text), candidate
                                explanations (ranked, each independently
                                evidence-backed), explicitly ruled-out
                                alternatives (and why), confidence
    diagnosis-engine.js         PURE. Cites only Approved Knowledge +
                                Organization Memory + Learning Events — same
                                "never fabricates" discipline as
                                conversation/questionnaire/question-optimizer.js.
                                Never auto-decides — output is always input to
                                a human Decision (review-workflow-engine.js),
                                never a bypass of it.
    services/reasoning-service.js   the one owner, mirrors learning-service.js's
                                     "create/appendVersion have exactly one
                                     caller" pattern

  communication/              NEW — smallest possible. Does not build a new
                              notification system. Rides V1's already
                              channel-agnostic notification bus
                              (functions/src/notifications/*, per
                              docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md
                              §2.4 — new event types are an allow-list entry,
                              not new transport code). recordCommunication()
                              logs that a Diagnosis/Decision was communicated
                              and to whom/how — the record lives in
                              js/v2/, the transport is reused, not rebuilt.
```

No existing contract shape changes. `knowledge/README.md` already commits to
this: "the shapes above must not need to change to accommodate that work."
This proposal keeps that promise.

---

## 5. Recommended Repository Structure

No reorganization. The existing `contracts/ → engine → registry (if
applicable) → services/ facade → ui/ (last, presentation-only)` layering,
repeated identically in every one of the ~14 existing domains, is exactly the
structure a multi-year project wants: predictable, greppable, and already
machine-checked for dependency direction. The only structural addition is the
two new top-level siblings shown in §4 (`reasoning/`, `communication/`), added
the same way `learning/` and `conversation/` were added in Phases 5–6 — as new
domains extending the dependency graph, never revising it.

One concrete housekeeping item: `js/v2/file-storage/` has no `README.md`,
unlike every other subtree. Given it now transitively touches real Firebase
Storage, it is the one real-side-effect subtree most in need of the same
"what's real / what's a stub / dependency direction" documentation every
sibling directory already has.

---

## 6. Recommended Knowledge Architecture

Unchanged from what is already built and already correct:
`KnowledgeItem { domainType, sourceType, kind, payload, confidence,
lifecycleState, provenance, approvedBy, approvedAt, preferenceRationale }`,
registry-backed `domainType`/`kind`, five-state append-only lifecycle,
connector-mediated read-only acquisition. This is a direct, faithful
implementation of the ten binding decisions in
`docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` §4, and CLAUDE.md's Principles
1–7 map onto it exactly (durable knowledge, human-gated approval, mandatory
provenance, domain-agnostic core). The one recommended change is not to the
architecture but to its exercise: **activate one additional connector**
(Memorandum or SOP — whichever has the thinner V1 surface to read from) purely
to close the domain-agnosticism open question from §3.3, before any further
Reasoning-layer work makes NOR-shapedness harder to notice or unwind.

---

## 7. Recommended Reasoning Architecture

This is the one genuinely new concept, so it deserves its own section rather
than being folded into §4. Three non-negotiable constraints, derived directly
from CLAUDE.md and from this codebase's own strictest existing precedent
(`conversation/questionnaire/question-optimizer.js`, which "resolves what it
honestly can … in fixed priority order — never fabricates"):

1. **Cite-or-abstain.** Every candidate explanation a Diagnosis produces must
   reference a specific Approved `KnowledgeItem`, `ArchiveRecord`, or
   `LearningEvent` id. If no evidence supports a plausible explanation, the
   engine must say so explicitly — never fill the gap with a plausible-sounding
   guess. This is Principle 4 ("Evidence before recommendation") and Principle
   7 ("Never invent business rules") enforced structurally, the same way the
   lifecycle enforces "no automatic approval" structurally rather than by
   convention.
2. **Diagnosis is never a Decision.** The engine's output is always an input
   to the existing human-gated review workflow — it must not gain a new
   auto-promote path, ever, mirroring Decision 6 ("Teach Once, Learn Forever")
   from the original architecture doc.
3. **Reasoning stays deterministic until a real AI adapter is a separate,
   later decision.** `reasoning/diagnosis-engine.js` should be built assuming
   forever-rule-based operation (like `rule-provider.js` in the Prediction
   Platform), with the *option* — not the requirement — to later accept an
   `ai-foundation` adapter's output as one more piece of cited evidence,
   never as a replacement for the citation discipline itself.

This keeps Reasoning from becoming the first place this platform's discipline
erodes — which is the realistic risk of building it at all (see §8).

---

## 8. Incremental Sprint Plan

Ordered smallest-safest-first. Each item is scoped to fit this codebase's own
stated bar: small diff, isolated module, fully testable, backward compatible,
feature-gated where it touches anything live.

| Sprint | Scope | Risk | Why this order |
|---|---|---|---|
| **A** | Fix `js/v2/README.md`'s stale file-upload claim; add missing `js/v2/file-storage/README.md` | None — docs only | Closes a real, findable drift before it compounds; zero code risk |
| **B** | Add a GitHub Actions workflow running the existing `scripts/*-ownership-check.mjs` (+ other v2 `*-check.mjs`) on every push/PR | Very low | Turns an already-real discipline into a repository property instead of a personal habit |
| **C** | Activate one more real connector (Memorandum or SOP) | Low–Medium | Closes the still-open domain-agnosticism question from the original architecture doc before Reasoning work makes it harder to unwind |
| **D** | `reasoning/contracts/` + a locked `NOT_IMPLEMENTED` `diagnosis-engine.js` stub | Low | Mirrors how every existing domain began (schema-first, dormant) |
| **E** | Real `diagnosis-engine.js` — cite-or-abstain, evidence-weighted, over Approved Knowledge + Organization Memory + Learning only | Medium | The one genuinely new inferential capability; highest-value, needs the strictest review |
| **F** | `communication/recordCommunication()` riding the existing V1 notification bus for one event type | Low | Reuses proven transport; closes the last Thinking-Model gap |
| **G** | Explicit decision on Composer: wake it with a real authoring UI, or re-confirm its dormancy with a stated reason | Low (decision, not code) | The one dormant subsystem blocked purely on UI, not engineering |
| **H** | Content authoring: Bootstrap Dataset, Official NOR Archive | N/A — not an engineering sprint | Already correctly scoped by the team as "next phase, not engineering"; nothing above delivers mission value until this starts |

---

## 9. Risks

- **NOR-shaped ossification.** Every real content path, every real
  Organizational Memory fact, and every real Reasoning citation available
  today comes from one domain. Building Reasoning (§7) against NOR-only data
  risks quietly encoding NOR-specific assumptions into a "domain-agnostic"
  engine, exactly the failure mode §3.3 already flagged as open. Mitigation:
  Sprint C before Sprint E.
- **Manual-only verification.** The ownership-check discipline is excellent
  and, today, entirely dependent on one person remembering to run it (§3.5).
- **Documentation drift will recur.** §3.4 found one real instance despite
  this being the most self-documenting codebase this assessment has seen.
  Surface area is still growing (the current HEAD commit, `f1fe7bcf`, isn't
  yet reflected in `js/config.js#VERSION_HISTORY`). At 286+ files, prose
  claims will keep outrunning code faster than any one person can chase them.
- **Reasoning is the highest-discipline-risk addition.** Every other domain
  in this tree either computes nothing generative (pure lookups/rollups) or
  requires a human gate before anything becomes current truth. A diagnostic
  reasoning engine is the first component whose entire job is to produce
  *new* explanatory claims. If the cite-or-abstain discipline in §7 slips even
  once, this is the piece of the platform most likely to start "quietly
  rendering a zero" — or worse, a confident-sounding guess — that
  `dormant-subsystems.js` was built specifically to prevent elsewhere.
- **Mission-success is unmeasurable at current scope.** CLAUDE.md's own test
  ("if this system can help a new employee reason like an experienced staff
  member, the project succeeds") cannot be evaluated with a single pilot user
  and zero authored content. This is fine for RC1; it is a real ceiling on
  how much confidence any further engineering sprint can claim to add.

---

## 10. Open Questions

Carried over, still unresolved from `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md`:

1. Should domain-agnosticism be proven with a second real connector before
   further platform-core work proceeds (the doc's own §4.4 recommendation),
   or is NOR-only acceptable indefinitely?
2. Should the three explainability surfaces (prediction-side, dispatch-side,
   `knowledge/explainability/`) ever be unified — and if so, on whose
   timeline, given unifying them necessarily touches V1?
3. Who has approver authority over a Knowledge review decision — the existing
   `role-registry.js` capability model, or a Knowledge-specific role? (Still
   open per `knowledge/services/README.md`'s own "open approver-authority
   question.")

New, raised by this assessment:

4. Should `reasoning/diagnosis-engine.js`'s human reviewer be the same role
   that approves Knowledge, or does a Diagnosis need its own review surface
   given it synthesizes across domains rather than curating one item?
5. Should `communication/` reuse V1's notification bus verbatim (§4), or does
   organizational-learning communication need distinct channel semantics
   (e.g., "this is advisory, never an alert") that the existing bus's event
   taxonomy doesn't yet express?
6. What is the actual criterion or timeline for expanding the pilot allowlist
   (`V2_PILOT_ALLOWLIST = ['evan']`) beyond a single user — since no gap
   analysis, sprint plan, or risk list above can be validated against real
   usage until that happens?
7. Should Reasoning be built now (Sprint D–E), or is the content gap (§3.2,
   Sprint H) the actual bottleneck — i.e., is there enough Approved Knowledge
   and Organization Memory today, even after Sprint C, for a cite-or-abstain
   Diagnosis engine to ever produce non-abstaining output?
