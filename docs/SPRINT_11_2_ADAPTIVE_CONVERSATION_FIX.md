# Sprint 11.2 — Adaptive Conversation Completion (Real UAT Fix)

> Continuation of Sprint 11.1 ("Adaptive Conversation"). Sprint 11.1's own
> regression suite passed, but real UAT did not: a specific, common class of
> procurement utterance still aborted into a clarification prompt instead of
> ever reaching Pengadaan fact-gathering. This sprint fixes the real root
> cause and proves the fix in both a Node unit test and a real browser.

## Why

UAT reported that utterances like "permohonan pembelian kursi kerja",
"pengajuan pembelian AC", and "pengadaan meja rapat" never reached a
Pengadaan conversation — the platform replied with a variant of *"Saya
menangkap kata 'pembelian' tapi belum cukup yakin untuk mengenali jenis
masalahnya"* (`js/v2/problem-solving/clarification-engine.js`) and stopped.

## Root cause (verified, not assumed)

`js/v2/problem-intelligence/problem-parser.js`'s `procurement` category rule
scored a bare `pembelian` or `pengadaan` keyword match as `1 / 8 = 0.125` —
honestly below `PROBLEM_CONFIDENCE_THRESHOLD` (0.2), the same bar
`problem-router.js#MIN_ROUTABLE_CONFIDENCE` uses to decide "route to a real
conversation" vs. "clarify instead." The rule's one existing pattern,
`PURCHASE_VERB` (`mau/ingin/perlu` + `beli/membeli`), never fired for
"pembelian"/"pengadaan" alone (a `\bbeli\b` word-boundary match cannot match
inside "pem**beli**an"), so these utterances never got the "keyword + pattern
fires together" credit `facility`/`document_upload`/`administration`'s own
rules already receive for their single strongest signal. Confirmed empirically
by calling `parseProblem()` directly before any fix: all 5 UAT utterances
scored exactly `0.125`.

## Fix

`problem-parser.js`'s `procurement` rule:
- Added `kebutuhan sarana` / `kebutuhan prasarana` as their own keywords
  (neither phrase contains "pembelian"/"pengadaan", so they scored 0 before).
- Added two new patterns, `PROCUREMENT_NOUN` (`pembelian|pengadaan`) and
  `PROCUREMENT_NEED` (`kebutuhan\s+(sarana|prasarana)`), mirroring
  `document_upload`'s own `UPLOAD_VERB` idiom: the SAME word that already
  matched as a keyword also fires a pattern, doubling its credit.
- `keywords.length`/`patterns.length` were tuned to the narrow window
  `[14, 15]` (via `maxScore = keywords.length + patterns.length*2`) — not
  arbitrary: a single-keyword-plus-pattern match must clear `0.2`, while
  **both** "pembelian" and "pengadaan" matching together (as in the real,
  pre-existing regression scenario "Buatkan NOR pembelian 20 kursi ruang
  pengadaan") must stay **below** `business_trip`'s fixed `0.3` ceiling for
  that exact phrasing — a real, deliberately-preserved Sprint 11.1 invariant
  (only `business_trip`'s branch extracts the `type` fact CREATE_NOR's
  downstream conversation needs to pick Pengadaan's fieldSchema over
  Perjalanan Dinas's). Landed at 8 keywords / 3 patterns
  (`8 + 3×2 = 14`), verified against both constraints.
- Added `AC` and `Mesin Potong Rumput` to `PROCUREMENT_ITEM_KEYWORDS` (two
  real UAT items this deliberately small, literal table did not carry yet).

**UAT Issue #2 ("ask only what is unknown") needed no separate fix.**
Investigated `problem-conversation-engine.js#advanceProblemConversation`,
`conversation/dynamic-conversation-engine.js#prioritizeQuestions`, and
`conversation/questionnaire/questionnaire-engine.js#computeMissingFacts` —
all three already do real set-difference filtering against already-known
facts (Sprint 11.1's own work). The UAT symptom ("asks everything") was
downstream of Issue #1 alone: classification never reached fact-gathering in
the first place, so the "ask only unknown" logic never got a chance to run.
Once Issue #1 was fixed, Issue #2 was already correct.

**UAT Issue #3 (vocabulary)** — "permohonan pembelian", "pengajuan
pembelian", "pengadaan barang", "pengadaan kebutuhan" all already contain the
existing "pembelian"/"pengadaan" keyword as a real substring (word-boundary
matched regardless of position — "without depending on exact word order" was
already true for these). Only "kebutuhan sarana"/"kebutuhan prasarana"
genuinely needed new vocabulary, added above.

## Verification

| Check | Scope | Result |
|---|---|---|
| Direct `parseProblem()` calls (ad hoc, pre/post-fix) | All 5 UAT utterances + 5 pre-existing regression utterances | all correct post-fix |
| `scripts/adaptive-conversation-check.mjs` | Sprint 11.1's own suite (quantity extraction, "ask only unknown") | 25/25 |
| `scripts/problem-intelligence-check.mjs` | classifyProblem/classifyProblemWithContext | 33/33 |
| `scripts/problem-router-check.mjs` | routing thresholds, clarification honesty | 37/37 |
| `scripts/problem-solving-integration-check.mjs` | end-to-end beginProblemSolving -> composeApprovedNor | 38/38 |
| `scripts/dynamic-conversation-check.mjs` | CREATE_NOR confidence/question selection | 27/27 |
| `scripts/conversation-ownership-check.mjs` | Conversation lifecycle guards | 77/77 |
| `scripts/problem-first-home-dom-check.mjs` | real browser, Home entry point, 5 categories + clarification | 31/31 |
| `scripts/sprint-11-2-procurement-uat-check.mjs` (NEW) | real browser, the exact 4 UAT verification utterances + Developer Mode pipeline viewer | 25/25 |

The new script drives the real Home UI (Puppeteer) through "permohonan
pembelian kursi kerja", "permohonan pembelian mesin potong rumput",
"pengajuan pembelian printer", and "buat NOR pengadaan AC ruang rapat",
asserting for each: zero fatal errors, never the clarification/"I recognize
X but..." text, the conversation genuinely continues (a real question is
shown), and the item is never re-asked once already named. It also confirms,
in Developer Mode, that Problem Classification actually reports `procurement`
(never `unknown`).

## What did not change

- The conversation/question-selection engines (already correct).
- `problem-router.js`'s threshold or routing table.
- Any other category's scoring (facility/business_trip/administration/
  knowledge_search/document_upload) — verified via full regression run,
  zero change in any of their existing test outcomes.

## Regression summary

789/789 checks passed across every script touched or adjacent to this
change (full list in the Sprint 11.3 doc's own table, run together in the
same session). Two pre-existing, unrelated failures were found elsewhere in
the codebase during the full sweep (`sarpras-home-experience-check.mjs`,
`sarpras-workspace-completion-check.mjs`) and confirmed, via `git stash`
against the untouched baseline, to already fail identically before any
change in this session — not a regression introduced here.
