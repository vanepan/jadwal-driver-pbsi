# Sarpras Intelligence V2 — Phase 10, Sprint 10.7: Pilot UX Validation

> Scope: measure how well the review process built in Sprints 10.1-10.6
> actually works — review duration, manual edits, approval rate, common
> corrections, knowledge gaps, reviewer satisfaction. Method: five of six
> metrics are pure aggregation over data those sprints already produce (no
> new engine); the sixth (satisfaction) is this sprint's one genuinely new,
> deliberately minimal data-capture point. Verified with real, executed
> checks: a Node-level metrics correctness suite and a real-browser flow
> proving both the satisfaction prompt and the new dashboard tab render
> real, non-fabricated numbers.

---

## Headline finding

**The recurring architectural lesson from Sprint 10.2 repeated itself here,
and was caught the same way — by reading the dependency graph before
writing the file, not after.** The plan's original instruction was "New
`js/v2/knowledge/services/review-metrics-service.js`" — but this service
needs `composer-store.js`, `composer-review-contract.js`, and
`nor-explainability-service.js`, all under `document-intelligence/`, and
`knowledge/` may never depend on `document-intelligence/` (the same rule
that relocated Sprint 10.2's explainability service). Placed instead at
`document-intelligence/composer/review-metrics-service.js` — sibling to
`composer-store.js`, the same correction pattern as Sprint 10.2's
`nor-explainability-service.js`, now established twice.

---

## 1. Five metrics, zero new engines

`computeReviewMetrics()` reads only what already exists:

| Metric | Source |
|---|---|
| Review duration | `getReviewHistory()` timestamps — first entry INTO `in_review`, first `approved`/`rejected` decision (Sprint 10.4/10.5) |
| Manual edits | `getRevisionHistory().editedBy !== null` count (Sprint 10.1/10.3) |
| Approval rate | `listAllDocuments()` status distribution, `approved+published / decided` (Sprint 10.1/10.4) |
| Common corrections | `EditableSection.isOverridden`, tallied by field across every document (Sprint 10.3) |
| Knowledge gaps | `explainDocument().unknownFacts`, tallied by field (Sprint 10.2) |

None of these recompute a Recommendation, a Diff, or a promotion record —
every number is arithmetic over data another sprint's engine already
wrote. Verified directly against a real, driven-through-the-lifecycle
document in the same Node process (not a separately fabricated fixture):
`avgManualEditsPerDocument > 0` and `topCorrectedFields` naming the exact
field `editSection()` touched earlier in the SAME test run, `
avgReviewDurationMs` computed from a document genuinely transitioned
`draft → in_review → approved → published` earlier in that run.

---

## 2. Reviewer satisfaction — the one new capture point

`satisfaction-log.js`: a minimal, in-memory, append-only log
(`recordSatisfactionRating`/`listSatisfactionRatings`), the same idiom
`review-history.js` already established — real and tested, not a stub,
scoped to exactly the 1-5 rating the spec asks for and nothing more.
Refuses an out-of-range rating outright rather than silently clamping it.

Captured in `review-workspace.js` at exactly one moment: immediately after
a real, successful "Terbitkan" (publish) — a 5-button (1-5) prompt
appears in the now-Published governance panel, dismissed the instant a
rating is recorded. No other moment in the review lifecycle asks for it —
matching the spec's own framing of a single post-hoc satisfaction check,
not a running survey.

---

## 3. Tinjauan Pilot — a real, reachable dashboard tab

`learning-dashboard.js` gains a 7th tab, "Tinjauan Pilot," following the
same "a writer exists, give it a reader" discipline `dormant-subsystems.js`
has enforced since Phase 3 — every number here already had somewhere to
be computed (`computeReviewMetrics()`); it just had nowhere to be *shown*
until this sprint. Reuses `workspace-list-kit.js`'s existing
`renderStatCards`/`renderRowList`/`renderKvList`/`renderEmptyState` —
no new rendering primitives.

---

## 4. Verified

**Data layer (Node)** — `composer-foundation-check.mjs`: 69/69 (was
56/56). 13 new checks: `satisfaction-log.js`'s validation and scoping,
and `computeReviewMetrics()`'s correctness against real data already
present in the same test run (not a fabricated fixture) — status counts
sum to the total, approval rate stays within [0,1], the satisfaction
average matches the exact rating recorded, and the corrected-fields tally
names the real field an earlier `editSection()` call in the same run
touched.

**Full regression, unrelated subsystems untouched** — all 6 pre-existing
suites green and unchanged (`north-star-acceptance-check.mjs` 38/38,
`nor-composition-check.mjs` 16/16, `problem-solving-integration-check.mjs`
30/30, `conversation-ownership-check.mjs` 77/77,
`knowledge-ownership-check.mjs` 56/56, `archive-ownership-check.mjs`
74/74), `smoke-boot.mjs` PASS.

**Real browser, no login gate** — `review-workspace-render-check.mjs`
extended: 46/46 (was 38/38). Two new scenarios:

1. The satisfaction prompt appears right after a REAL publish (reusing
   Sprint 10.6's own full draft→approved→published click flow), a real
   click on "4" dismisses it, and the rating is independently confirmed
   via `listSatisfactionRatings()` — not just "the prompt disappeared,"
   the actual data landed.
2. A fresh mount of `learning-dashboard.js`, seeded with one real document
   driven through edit → submit → approve → a 5-star rating, then a real
   click on the "Tinjauan Pilot" tab — confirming the rendered numbers
   (100% approval rate, 5.0/5 satisfaction, "subject" among corrected
   fields, the real status distribution) are the actual seeded values, not
   placeholders.

**Not verified, same limitation as every prior Phase 10 sprint**: the
real Settings → Power View → Review Workspace/Learning Dashboard click
path with a real signed-in user in production, and whether these metrics
remain meaningful at real pilot volume (every check here exercises 1-2
documents — a real multi-week pilot with dozens of reviews is the only
way to know if "average review duration" or "most-corrected field" says
anything statistically useful).

---

## 5. Phase 10 backlog

Sprint 10.8 (Pilot GA Readiness) is next — documentation only, synthesizing
Sprints 10.1-10.7 into the same Go/No-Go report format Sprint 9.8 already
proved out.
