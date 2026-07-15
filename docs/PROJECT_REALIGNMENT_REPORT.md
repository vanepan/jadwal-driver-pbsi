# Project Realignment Report — Return to the NOR-Generation North Star

> Prepared against the Project Realignment Directive (2026-07-15), which
> supersedes CLAUDE.md's "Organizational Learning Platform" framing wherever
> the two conflict. Grounded in direct reading of: `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md`,
> `docs/SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md`, `docs/NOR-Specification.md`,
> `docs/Knowledge-Asset-Specification.md`, `docs/Knowledge-Repository-Adaptation.md`,
> `docs/ORGANIZATIONAL_REASONING_IMPLEMENTATION_REPORT.md`,
> `docs/PROBLEM_SOLVING_PIPELINE_IMPLEMENTATION_REPORT.md`,
> `docs/PHASE_10.5_IMPLEMENTATION_REPORT.md` + `MIGRATION_NOTES.md`,
> `js/v2/README.md`, `js/v2/dormant-subsystems.js`, and direct reading of
> `js/v2/knowledge/connectors/nor-connector.js`. No production code was
> written or modified to produce this report, per the directive's own "do
> not implement yet" instruction.

---

## 0. Scope note

"Sarpras Intelligence" is entirely `js/v2/` (320 files, 18 domains) — a
namespace gated to a single pilot user (`role:'admin' && username:'evan'`),
statically imported by nothing outside itself. Every V1 production feature
referenced in this project's other memory (Executive Command Center,
Dispatch Intelligence, Prediction/Recommendation/Simulation engines,
Petty Cash, Engineering Operations) is **Sarpras Operations**, not Sarpras
Intelligence — already shipped, already load-bearing, explicitly untouched
by every phase of this track, and out of scope for this realignment. This
report only reclassifies what is inside `js/v2/`.

---

## 1. Executive Summary

The directive's diagnosis is correct, but the mechanism of drift is not
what it looks like from the outside. This is not a case of engineering
building flashy adjacent features instead of the core pipeline. **The core
NOR-generation pipeline is, in fact, code-complete, end-to-end, today**:
Conversation asks only for missing facts, Reasoning retrieves applicable
knowledge and detects gaps, NOR Composition resolves template slots against
genuinely known facts, and a human-gated review workflow sits in front of
every promotion to Approved. Twelve-plus phases of disciplined, tested,
contract-first engineering built almost exactly the "TRUE PIPELINE" the
directive describes.

Two things did drift, and both are named precisely below:

1. **Two real domains — `problem-intelligence/` and `problem-solving/` —
   generalized the entry point into a multi-category problem router**
   (facility maintenance, procurement, administration/lost-ID-card, in
   addition to the one category that produces a NOR, `business_trip`).
   This is the one unambiguous match to the directive's own OUT-OF-SCOPE
   list ("Case Management," "Operational Workspace," general "Task
   Management") and is the clearest thing to freeze in place. See §5.
2. **Zero real Knowledge content exists.** Every phase report in this
   track ends with "content authoring is next phase, not engineering" —
   and the next phase, every time, was another architecture-assessment
   document instead of actually authoring content. Twelve phases in, the
   platform has never Approved a single real `organizational_reasoning`,
   `ontology`, `workflow`, `rendering_rule`, or `sentence_pattern`
   KnowledgeItem. The one real, wired connector (`nor-connector.js`)
   deliberately produces only structural fingerprints (item counts,
   presence flags — never business content), so even the "real" data path
   yields nothing a NOR could be composed from. **This is the actual
   bottleneck**, and it is a content gap, not an architecture gap. See §4.

Neither finding argues for ripping anything out. Everything below "keeps
it, but reclassifies it" per the directive's own instruction — nothing is
deleted, only labeled.

---

## 2. The True Pipeline vs. what was actually built

| Pipeline stage | Real home in `js/v2/` | Status |
|---|---|---|
| Historical NOR | `knowledge/connectors/nor-connector.js` | **Real, but thin** — reads only *already-generated* V1 NORs' structural ViewModel (item/signatory counts, presence flags); never amounts, descriptions, or the 2 real historical filled PDFs `docs/NOR-Specification.md` found in `Petty Cash Center/uploads/`. Those two real documents have been analyzed by hand (that markdown report) but never ingested as KnowledgeItems by any connector. |
| Reverse Engineering | `docs/NOR-Specification.md` (a manual analyst pass, not code) | **Real as a one-off report**, not a repeatable engine. This is the single richest source of real evidence in the whole track and it is sitting in a markdown file, un-ingested. |
| Knowledge Extraction | `knowledge/extraction/*` (pattern/vocabulary/relationship engines) | **Real, tested, has nothing to extract from** — no Approved content exists for it to run against yet. |
| Knowledge Repository | `knowledge/repository/`, `lifecycle/`, `review/` | **Real.** `MemoryRepository` (non-durable), 5-state lifecycle, human-gated review workflow — verified compatible with every proposed content shape at zero code cost (`Knowledge-Repository-Adaptation.md`). |
| Knowledge Retrieval | `reasoning/reasoning-engine.js` (rule applicability + conflict detection) | **Real, cite-or-abstain** — returns `NO_APPLICABLE_KNOWLEDGE` honestly when nothing is Approved (which is always, today). |
| Knowledge Gap Detection | `reasoning/knowledge-gap-engine.js` (domain-wide, Ontology-checklist-based) | **Real** — with no Ontology recorded for `nor`, it correctly reports exactly one gap (`missing_context`, critical) rather than guessing. |
| Conversation (only if missing) | `conversation/dynamic-conversation-engine.js` | **Real, and genuinely matches the directive's own spec** — one question at a time, priority-ranked, confidence = `known / (known + outstanding)`, dedups against history. This is the best-aligned piece in the whole tree. |
| NOR Generation | `document-intelligence/nor/nor-composer.js` | **Real, narrow, honest** — resolves `{{slot}}` patterns against known facts only; an unresolved slot renders a literal `UNKNOWN` marker, never invented content. Produces nothing today because no pattern/rendering-rule Knowledge is Approved yet. |
| Human Review | `knowledge/review/review-workflow-engine.js` (Knowledge) real; `document-intelligence/composer/composer-store.js#editSection` (composed-NOR editing) **dormant, zero callers** | **Half real.** Approving a KnowledgeItem is fully real; a human revising a *composed NOR draft* has no UI yet — registered honestly in `dormant-subsystems.js`. |
| Knowledge Evolution | `learning/services/learning-service.js` | **Real** — 3 real correction paths wired (metadata confirmation, Knowledge "Request Changes," Profile Override approval); the narrower payload-level correction editor is separately, honestly dormant. |

**Reading this table straight**: nine of ten stages have real, tested code.
The chain breaks only where it needs *content*, not more engine.

---

## 3. Component Classification

Per the directive's instruction, nothing below is removed — every row is a
classification only.

### 3.1 MVP-Critical (directly on the NOR-generation path, keep investing here)

| Component | Why it's MVP |
|---|---|
| `knowledge/repository`, `lifecycle`, `review`, `registry`, `contracts`, `acquisition`, `extraction`, `services` | The Knowledge Repository + Retrieval + Extraction stages, verbatim. |
| `knowledge/connectors/nor-connector.js` + `manual-file-connector.js` | The only real Historical-NOR ingestion path today. |
| `reasoning/reasoning-engine.js`, `rule-applicability-engine.js`, `conflict-detection-engine.js` | Knowledge Retrieval — cite-or-abstain rule application. |
| `reasoning/knowledge-gap-engine.js` | Knowledge Gap Detection (domain-wide, Ontology-driven). |
| `conversation/intent`, `questionnaire`, `dynamic-conversation-engine`, `dynamic-conversation-service`, `task-executor` | Conversation — the "only ask what's missing" stage, already matches the directive's spec closely. |
| `conversation/contracts` — specifically the `business_trip → CREATE_NOR` intent mapping | The one real end-to-end trigger for NOR generation. |
| `document-intelligence/nor/*` (`nor-analyzer`, `nor-recommender`, `nor-validator`, `nor-generator-contract`, `nor-composer`) | NOR Generation itself — the literal product. |
| `document-intelligence/composer/composer-store.js#createDocument` | Real writer for a composed NOR draft. |
| `document-intelligence/composer/composer-store.js#editSection` (dormant) | Human Review of the *composed NOR* — currently the biggest real gap in the on-mission path; see §6. |
| `knowledge/review/review-workflow-engine.js` | Human Review of Knowledge itself. |
| `learning/services/learning-service.js` (the 3 wired correction paths) | Knowledge Evolution — learning from human correction, directive priority #6. |
| `file-storage/` (SHA-256 dedup + real Firebase Storage upload) | Ingestion path for future real historical-document uploads (feeds Historical NOR / Knowledge Extraction). |
| `ui/nor-center.js`, `ui/knowledge-center.js`, `ui/dataset-import-center.js` | Presentation for Knowledge Repository + NOR Center + document upload — the three on-mission UI surfaces. |

### 3.2 Future Architecture (correctly built, correctly deferred — no further investment until MVP proves out)

| Component | Why it's not urgent |
|---|---|
| `ai-foundation/*` (3 adapter stubs) | Deliberately `NOT_IMPLEMENTED` — "AI is replaceable," building a real adapter now would be premature per the platform's own prior architecture decision. Nothing to change; correctly dormant. |
| `knowledge/machine-learning/*` (clustering, pattern mining, outlier detection) | Real, tested, but not on the critical path to producing one NOR — this is knowledge-platform tooling for a much larger corpus than exists today. |
| `knowledge/metrics/` (`KnowledgeHealthReport`), `knowledge/profiles/`, `knowledge/datasets/` classification | Meta-analytics *about* the knowledge platform. Useful once real content exists at volume; premature with zero Approved items. |
| `knowledge/dependency-graph/` (multi-hop BFS) | Real, unused at current content volume (a graph over zero-to-few nodes has nothing to traverse). |
| `organizational-memory/*` (Archive, Timeline, Duplicate Detection, Coverage/Health) | This is the platform's own general-purpose "organizational memory browser" — closer to the directive's explicitly out-of-scope "Timeline Management" than to NOR generation. The one exception is the Archive's `nor` source, which is genuinely part of the Historical-NOR ingestion story. |
| `learning/` LearningEvent taxonomy beyond the 3 wired correction paths | Real infrastructure, platform-wide by design (not NOR-specific) — correctly built once, not worth narrowing, but not where the next sprint's effort should go either. |
| `reasoning/hypothesis-engine.js`, `diagnostic-planning-engine.js` | Built specifically to support **general** Problem diagnosis (facility issues, etc.) — see §3.3. Not reached by the `business_trip → NOR` path at all. |
| `ui/sarpras-intelligence-center.js`'s Executive Briefing card | Presentation-only "Executive Intelligence" — explicitly named out-of-scope by the directive. Cheap to leave as-is (it invents no new number), not worth extending. |
| `ui/archive-center.js`, `ui/learning-dashboard.js` | Real, presentation-only browsers over Future-Architecture engines above. No harm in existing; no case for expanding either. |

### 3.3 Dormant Capability — genuinely out of scope now, freeze in place

| Component | Why |
|---|---|
| `problem-intelligence/` (Problem Category taxonomy: `facility`, `procurement`, `administration`, `knowledge_search`, `document_upload`, alongside `business_trip`) | This is a general-purpose "what kind of organizational problem is this" classifier reaching into facility maintenance and lost-ID-card administration — territory the directive names explicitly (Case Management, Operational Workspace, Task Management). Only `business_trip` is NOR-relevant. |
| `problem-solving/problem-router.js` routes for `facility → diagnostic_conversation`, `procurement`/`administration → conversation` (with no NOR-producing intent behind them) | Same reasoning — these routes exist and are tested, but every one of them terminates in "a working conversation," never a NOR. That is precisely "Conversation is not a chatbot/assistant" territory the directive rules out. |
| `problem-solving/problem-conversation-engine.js`, `clarification-engine.js` (the generic, non-NOR conversation loop) | The mechanism that makes facility/procurement/administration "problem solving" feel like a real assistant — this is the Operational Workspace the directive defers. |
| `reasoning/hypothesis-engine.js` + `diagnostic-planning-engine.js` (repeated from §3.2 for completeness) | Exist to support the diagnostic conversation for non-NOR categories above. If `problem-solving/` beyond `business_trip` is frozen, these two engines currently have no MVP consumer at all. |

**One explicit non-action this report recommends**, because it was left as
an open question by the phase that built it: `PHASE_10.5`'s own "Known
Limitations" flagged that a future phase "may want to resolve" the
facility-category UX gap by giving it a real `FACILITY_ISSUE` Intent and a
downstream workflow. **Per this directive, the answer is no** — that is
exactly the kind of horizontal expansion the North Star rules out. Leave
`facility`/`procurement`/`administration` exactly as dormant, tested,
truthful dead ends they are today (they already fail honestly rather than
faking a NOR — no correction needed, just no further investment).

---

## 4. The real root cause: 100% architecture, 0% content

Every one of the five prior implementation reports in this track ends
with an identical shape: a STOP CONDITION, a clean regression sweep, and a
line reading "content authoring is the next phase, not engineering."
`SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md` named this explicitly at
RC1 (§3.2, "Content gap... this is correctly scoped as out of engineering,
but it means the platform currently preserves nothing yet"). That framing
was correct then and is still correct now — but "next phase" has, in
practice, meant "another design document" four times running
(`Knowledge-Asset-Specification.md`, `Knowledge-Repository-Adaptation.md`,
the Reasoning report, the Problem-Solving report), each of which
explicitly declines to seed real content and defers it again.

This is the directive's own diagnosis, just aimed one level deeper than
"too many features": **the platform has spent its last several increments
proving the architecture can hold new shapes, not testing whether the
shapes produce a usable NOR.** The Success Metric in the directive
("engine retrieves knowledge, generates NOR, user edits little, edits
become knowledge") cannot be evaluated even once today, because there is
nothing Approved for `reasoning-engine.js` to retrieve or `nor-composer.js`
to compose from. This is the single fact that should drive the next
sprint.

---

## 5. Where scope genuinely crept (concrete, not hypothetical)

`problem-intelligence/` + `problem-solving/` (Phase 8-10, extended in
Phase 10.5) are real engineering effort — new contracts, new engines, a
new router, 68+150 passing assertions, a real DOM-verified UI path —
spent making the Home entry point smart about **five** problem categories
when the mission needs exactly **one** (`business_trip`, the only category
wired to `CREATE_NOR`). `facility`, `procurement`, `administration`,
`knowledge_search`, and `document_upload` all currently terminate in "a
better conversation," never a NOR. Two of the reports produced by this
track use almost the directive's own words to flag this as an open
question rather than a decision ("Should Reasoning be built now, or is
content the actual bottleneck?" — Architecture Assessment §10, Q7; "a
future phase may want to resolve" the facility gap — Phase 10.5 Migration
Notes). The directive answers both questions now: **no further
generalization of Problem Solving beyond `business_trip`; the content gap
is the bottleneck.**

This is not wasted work — the engine quality is real and the code stays,
per the directive's "do not remove" instruction. It is simply not where
the next increment of effort belongs.

---

## 6. Revised MVP Roadmap

Ordered smallest-and-safest-first, matching this track's own established
convention (contracts-first where new code is unavoidable, otherwise
content-only, always re-running the existing `*-check.mjs` regression
suite).

| Sprint | Scope | New engineering? |
|---|---|---|
| **R1 — Seed real Knowledge content** | Convert `docs/NOR-Specification.md`'s already-cited findings into real Draft KnowledgeItems (1 `ontology`, 1 `workflow`, 2-3 `rendering_rule`, 2-3 `sentence_pattern`/`template_pattern`) via the existing manual-authoring path, using `sourceType:'manual-file'` (already a registered weight, per `Knowledge-Repository-Adaptation.md`'s Open Question 2 — this resolves that question by using the mechanism that already exists rather than building a new connector). | **None** — pure content, existing `create()`/`ingest()` APIs only. |
| **R2 — Run the real review workflow once** | Route R1's Draft items through the existing `review-workflow-engine.js` to Approved, by a real human decision (not a test fixture). | None. |
| **R3 — Drive one real Conversation → NOR Composition end-to-end** | Submit a real `"Buatkan NOR perjalanan dinas."`-style utterance through the live pilot UI (not a check script), observe: how many questions Conversation actually asks now that real Knowledge exists, what `nor-composer.js` actually produces, which slots remain `UNKNOWN`. This is the first real measurement against every one of the directive's six priorities. | None — observation only. |
| **R4 — Close the Human-Review gap on composed NOR drafts** | Build the smallest possible `editSection` caller (a real authoring surface, even minimal) so a human can revise what R3 composed — the one dormant piece that sits squarely on the MVP path (`dormant-subsystems.js`'s `composer-timeline` entry). | Yes — smallest scoped item, one new UI surface over an already-real engine. |
| **R5 — Second connector, thin domain** | Activate one more real connector (Memorandum — already registered, a real unread candidate document exists per `NOR-Specification.md`'s evidence base) to prove the domain-agnostic shape generalizes before adding more NOR-specific content — carried over from the Architecture Assessment's own Sprint C, now sequenced after real content exists for `nor`, so the "is this domain-agnostic or NOR-shaped" question is asked with actual data instead of zero data on both sides. | Minimal — a connector implementation, no new core-platform shape. |
| **R6 — Freeze problem-solving generalization; document the boundary** | Add one paragraph to `problem-solving/README.md` stating, explicitly, that `facility`/`procurement`/`administration`/`knowledge_search`/`document_upload` are frozen dead ends by product decision, not an oversight — so a future contributor doesn't "fix" the Known Limitation these reports flagged. | Docs only. |

Explicitly **not** in this roadmap, per the directive: real AI/LLM adapter
work, unifying the three explainability surfaces, Composer generalization
beyond NOR, expanding the pilot allowlist, or any further Problem
Intelligence category.

---

## 7. Recommended Next Sprint

**R1 + R2 + R3, run together as one sprint.** This is deliberately not a
coding sprint — it is the first sprint in this track's entire history that
produces zero new files and instead spends its effort making the existing,
already-built pipeline observe real data for the first time. Concretely:

1. Author 6-8 real KnowledgeItems from `NOR-Specification.md`'s own
   findings (its worked `organizational_reasoning` and `rendering_rule`
   examples in `Knowledge-Asset-Specification.md` §3 are already
   ready-to-use payloads — literally copy them in, no invention required).
2. Approve them through the real review workflow.
3. Submit one real NOR-triggering utterance through the pilot UI and record
   what actually happens: question count, composed output, unresolved
   slots, and every citation shown.

This directly serves five of the directive's six named priorities at once
(#1 Extraction, #2 Retrieval, #3 Gap Detection, #4 fewer clarifications,
#5 NOR quality) with the lowest possible risk (no new engine code to
regress), and produces the first real number the next sprint can actually
try to improve. Right now, every "how good is generation" question in this
project is unanswerable because n=0. After this sprint, n=1, and it is a
real one.

---

## 8. Open Questions carried forward

1. `sourceType: 'manual-file'` for reverse-engineered seed knowledge — this
   report treats `Knowledge-Repository-Adaptation.md`'s Open Question 2 as
   resolved by using the already-registered `'manual-file'` weight (0.95)
   rather than building a new connector. Confirm before R1.
2. Who has approver authority over a Knowledge review decision — still
   unresolved from `knowledge/services/README.md`'s own note, inherited by
   every phase since. Needed before R2 can happen with a real (not
   single-developer) reviewer.
3. Should `facility`'s dormant diagnostic path ever be revisited — this
   report's answer is "not until real NOR generation is proven," but the
   code is intentionally left in place (not deleted) in case a future,
   separate product decision reopens it.
