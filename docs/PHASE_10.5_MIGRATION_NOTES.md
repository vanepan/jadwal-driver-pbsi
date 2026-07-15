# Phase 10.5 — Home Entry Point Migration Notes

> Companion to `docs/PHASE_10.5_IMPLEMENTATION_REPORT.md`. This document is
> for whoever next touches `js/v2/ui/sarpras-intelligence-center.js` or
> `js/v2/problem-solving/` — what actually changed, why, and what to watch
> for.

## What "the Home page" turned out to mean

Before writing any code, this phase verified — by reading the real code,
not assuming — which "Home page" the brief meant. There are two
candidates in this codebase: the real, live V1 Home (`js/workspace/
home-router.js`, seen by every employee) and `js/v2/ui/
sarpras-intelligence-center.js`'s own internal Dashboard (dormant,
gated to a single pilot user). Every element the brief referenced — the
free-text box, "Buat NOR"/"Unggah Dokumen" buttons, the "Tinjau
Pengecualian" exception-review action — exists only inside the second one.
**No V1 file was touched by this phase.** The blast radius is identical to
every prior phase in this engagement: one pilot user, behind
`isV2Enabled()`.

## The one thing that actually changed at the entry point

Before this phase, clicking "Mulai" on the Home free-text box called
`conversation-service.js#startConversation()` directly — the legacy Intent
Engine was the FIRST thing to see the utterance, and an utterance it
didn't recognize (which included nearly everything outside the six
pre-defined intents) rendered as "belum dikenali" with no path forward.

Now, that same click calls `problem-solving-service.js#beginProblemSolving()`
first. The legacy Intent Engine is still there — for the one category
(`business_trip`) that has a real Intent mapping, it is tried, and if it
succeeds, its output renders exactly as it always did. It is simply no
longer the first or only thing that can happen.

## Two real bugs found by actually running the new code, not by inspection

1. **"Kolam renang bocor" didn't classify as facility.** The original
   `facility` category rule scored on a fixed enum of asset nouns
   (ac/listrik/pipa/atap/…) that "kolam" (pool) wasn't in, diluting the
   one real signal word ("bocor") below the confidence threshold. Fixed by
   generalizing the pattern to "some word(s), then a symptom" instead of
   enumerating every possible asset — see `problem-parser.js`'s own
   comment at the `facility` rule for the full before/after reasoning.
   **If you add a new facility-adjacent keyword, prefer strengthening the
   symptom-word list or the generic pattern over adding another asset
   noun — the enum approach is exactly what broke this the first time.**

2. **Diagnostic Conversation asked end users an admin-level question.**
   `planDiagnosis()`'s `recommendedNextQuestion` freely mixes
   category-schema questions ("how urgent is this?") with domain-wide
   Knowledge Gap questions ("no Ontology is recorded for this domain
   yet") — and a critical-priority Gap always wins. Driving the end-user
   conversation loop directly off it meant a person reporting "AC rusak"
   got asked to supply the platform's own missing Ontology. Fixed in
   `problem-conversation-engine.js`: the end-user-facing `nextQuestion` is
   now sourced ONLY from the category's own schema fields;
   `planDiagnosis()`'s gaps are still computed and shown (Developer Mode,
   `missingInformation`), just never put in front of the reporting human.
   **If you extend this engine, keep that separation — schema fields are
   for the user, Knowledge Gaps are for an admin/curator.**

## The graceful-degradation pattern, and why it exists

`problem-solving-service.js#beginProblemSolving()`'s `CONVERSATION` branch
tries the real `startConversation()` first (when a category has a real
Intent mapping) and falls back to the generic Problem Conversation loop
only if the real Intent Engine's independent, narrower keyword vocabulary
didn't recognize the SAME utterance Problem Classification already
understood (e.g. "Mau perjalanan dinas" has no literal "NOR" in it, so
`intent-engine.js`'s `CREATE_NOR` pattern never fires). This is
deliberate: it means "Buatkan NOR perjalanan dinas." still gets the full,
richer real-Conversation path (with eventual NOR Composition), while "Mau
perjalanan dinas." still gets a working conversation instead of a dead
end — without editing `conversation/contracts/intent-contract.js`'s closed
Intent enum, which remains exactly as it was.

**This is a real, load-bearing seam, not a workaround to remove.** The two
taxonomies (Problem Category vs. Conversation Intent) are intentionally
separate (see `problem-intelligence/README.md`). If a future phase wants
every business_trip utterance to reach the real Conversation path, the
correct fix is broadening `intent-engine.js`'s own `CREATE_NOR` pattern (a
previous-phase file, deliberately not touched here) — not deleting this
fallback.

## Where the new code lives

- `js/v2/problem-solving/problem-router.js`, `clarification-engine.js`,
  `problem-conversation-engine.js`, `contracts/workflow-route-contract.js`
  — all new.
- `js/v2/problem-solving/services/problem-solving-service.js` — extended
  additively (`composeApprovedNor` is byte-for-byte unchanged from Phase
  8-10; `beginProblemSolving` now routes; `continueProblemConversation` is
  new).
- `js/v2/problem-intelligence/contracts/problem-category-contract.js` +
  `problem-parser.js` — four new categories, one scoring bug fix.
- `js/v2/ui/sarpras-intelligence-center.js` — the Home entry point
  (`renderConversationEntry`/`onDashboardClick`'s `sic-conv-start` handler)
  now calls the pipeline above; a new `renderPipelineTrace()` section
  (Developer Mode only) was added; **every other function in this
  859+-line file is untouched** — Executive Briefing, quick actions,
  search bar, mode bar, technical diagnostics, all four nested workspace
  mounts.

## What was NOT done (by design)

- `conversation/contracts/intent-contract.js`'s `INTENT` enum was not
  extended. No `FACILITY_ISSUE`/`PROCUREMENT`/`ADMINISTRATION` intent
  exists — those categories are served entirely by the new generic
  Problem Conversation loop, never by the legacy engine.
- No Learning Loop wiring — a completed Problem Conversation's
  Recommendation is not recorded as a `LearningEvent`.
- No V1 file was read for write access, let alone modified.
