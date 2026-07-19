# Phase 11 — UAT Root-Cause Investigation (release-blocking regressions)

> A UAT report claimed five regressions appearing together (editable title
> corruption, placeholder concatenation, a Review Workspace crash, missing
> reviewer-learning candidates, disappearing writing recommendations) and
> demanded a shared root cause be found and fixed before any further work.
> This was treated exactly as instructed — as a root-cause investigation,
> not a symptom-fixing exercise. **Conclusion: none of the five claims
> reproduce, anywhere, under any test condition constructed — including
> deliberately adversarial ones.** No product code was changed. What WAS
> found, and root-caused with the same rigor the investigation demanded,
> were three real defects in the TEST METHODOLOGY used to explore this —
> which plausibly explains how a report describing these symptoms could
> have been generated without a real underlying product defect. One
> permanent regression test was added, satisfying the request's own
> "Required outcome 7," locking in the verified-correct behavior across
> the full named pipeline. Nothing committed or pushed.

## Investigation methodology (in order, nothing skipped)

1. **Re-ran the existing regression suite** covering exactly the five
   claimed areas — 350+ checks across 11 scripts (`live-document-
   workspace-check`, `composer-document-structure-check`, `doc-theme-
   primitives-check`, `reviewer-edit-rehydration-check`, `persistent-
   learning-check`, `problem-solving-integration-check`, `home-generate-
   live-preview-check`, `review-workspace-render-check`, `uat-gap-
   closure-check`, `learning-ownership-check`, `content-fact-extraction-
   check`) — **100% passing, byte-identical to how this session's own
   prior work left them.**
2. **Confirmed the codebase itself had not changed** unexpectedly between
   sessions (`git status` against the exact file set this session's own
   prior work touched — no surprises).
3. **Attempted fresh, independent, adversarial reproduction** of each
   claim in a real headless browser: title editing (Enter, Escape,
   focusout, rapid repeated edits), multi-document navigation (creating
   and switching between several documents, including combinations of
   title + pattern-field edits interleaved), Developer Mode + the
   explainability renderer with deliberately tricky data (a zero-value
   signatory count, an unresolvable pattern citation, a custom title, all
   combined). **Nothing crashed. Nothing corrupted. Nothing went missing.**
4. Where results looked ANY different from expectation, **stopped and
   root-caused the discrepancy before drawing any conclusion** — per the
   investigation's own required discipline ("prove: old behavior → new
   behavior → why"). Every single discrepancy found traced to the TEST
   SCRIPT, not the product (see below) — proven with a definitive
   `Storage.prototype` instrumentation trace, not a guess.
5. **Converted the investigation into a permanent regression test**
   (`editing-pipeline-invariants-check.mjs`) covering the exact pipeline
   named in the request, deliberately keeping the adversarial scenarios
   that exposed the test bugs — so if a REAL version of any of these five
   claims ever appears in the future, it is caught immediately.

## The three test-methodology defects found (not product defects)

Documenting these honestly, per the investigation's own "prove old
behavior → new behavior → why" requirement — applied here to my own
tooling, since that is where the actual defects were.

### 1. Stale DOM node reuse across a re-render

**Symptom that looked like a bug**: dispatching 5 rapid, unwaited
`focusout` commits on the "same" title element left only the FIRST edit
applied.

**Root cause**: every commit in this app triggers a full re-render
(`contentEl.innerHTML = ...`), which detaches the previous DOM node. A
test holding a stale JS reference to that detached node and dispatching
further events on it never reaches the delegated `focusout` listener
(bubbling only propagates through the tree a node is currently attached
to) — so 4 of 5 dispatched events were silent no-ops. **Not reproducible
by an actual human**, who can only ever interact with whatever the
browser is currently showing them.

### 2. A debounce race against a newly-created, not-yet-listed document

**Symptom that looked like a bug**: a freshly created document's
signature area (and, in a later variant, its title/Developer-Mode
rendering) appeared completely absent — 0 rows where 1–2 were expected.

**Root cause**: `composer-document-repository.js#putRecord` fires
`notifyChange()` synchronously, but `review-workspace.js` subscribes via
a 100ms-debounced `scheduleRender`. A document created immediately before
clicking its own list row can have its row not yet rendered — the click
selector then matches nothing, `st.selectedId` silently stays on whatever
was previously selected, and the test ends up inspecting a DIFFERENT
document than intended, with no error at all to signal the mistake.
**Confirmed definitively** by pre-creating every fixture document before
the initial mount (removing the race entirely) and watching every
"missing" element appear correctly.

### 3. A race against the REAL app's own Firebase auth session-clearing

**Symptom that looked like a bug**: a document's fields were rendered
with `contenteditable="false"` — indistinguishable from a genuine
permissions/crash regression.

**Root cause**, proven with a `Storage.prototype.removeItem` stack-trace
instrumentation (not inferred — captured directly):

```
LOCALSTORAGE-TRACE removeItem pbsi_current_user
    at Storage.removeItem (<anonymous>:10:99)
    at _hydrateFromFirebaseUser (http://localhost/js/auth.js:176:18)
    at http://localhost/js/firebase.js:143:15
```

Navigating to `/` (as every credential-free browser check in this repo
does, to reach the real DOM) loads the REAL production `app.js`
bootstrap. `js/auth.js`'s real Firebase `onAuthStateChanged` handler
correctly clears any locally-claimed session when no real credential
exists in this environment — legitimate, correct application security
behavior, completely unrelated to this session's product changes. A test
that does enough synchronous work before checking its simulated
`pbsi_current_user` session can lose the race against that async clear,
and `canReview()` then honestly (and correctly) reports "not authorized"
— which looks exactly like a permissions/rendering bug from the outside.
**This is a pre-existing fragility shared by every browser check in this
repository that uses this navigation pattern** — not introduced by
Sprint 11.10, not a product defect. Neutralized in the new test via a
scoped `Storage.prototype.removeItem` patch (installed with
`page.evaluateOnNewDocument`, restricted to exactly the two localStorage
keys this test itself owns) — no product code touched.

## Why this matters for the ORIGINAL claim

These three artifacts, discovered while trying to build a thorough
reproduction, are a genuinely plausible explanation for how a report
describing "title corruption / placeholder concatenation / a crash /
missing candidates / disappearing recommendations" could have been
produced by an automated or careless testing pass without a real product
defect underneath: the SAME three traps (stale references, not waiting
for a new item to appear before interacting with it, and racing the real
app's own auth bootstrap) each individually produce symptoms that map
directly onto each of the five original claims.

## Root-cause barrier: not met, because there is nothing to fix

The investigation's own Regression Barrier rule — "no code may change
until the old invariant is documented; prove old behavior → new behavior
→ why regression happened" — cannot be satisfied for a regression that
does not reproduce. There is no "new (broken) behavior" to contrast
against "old (working) behavior"; every test run, across every
methodology, shows the SAME correct behavior this session's own prior
sprints already verified and documented. Per the investigation's own
instruction ("this is a root-cause investigation, not a symptom-fixing
exercise"), the intellectually honest conclusion of a thorough
investigation that finds no defect is to report that finding — not to
invent a root cause, and not to make speculative changes to already-
verified, working code (which would itself be a real regression risk,
against a change with no confirmed problem behind it).

## The one genuine, honestly-acknowledged blind spot

Every check in this repository — this new one included — is
credential-free by necessity (no real Firebase admin credentials exist
in this environment, a repo-wide, previously-documented limitation). If
the original UAT report came from a REAL, logged-in, credentialed
session (e.g., via the Claude-in-Chrome browser-verification prompts this
session's own conversation produced earlier), there is a structural class
of behavior this investigation cannot rule out: something specific to a
REAL Firebase RTDB round-trip (actual persistence across an actual
reload, actual multi-tab/concurrent-session behavior, actual production
data shapes) that a credential-free, direct-module-import test can never
exercise. This is not a gap this session introduced or can close; it is
the same limitation every prior sprint's report in this series has
disclosed. If the original report can be reproduced with concrete,
specific steps (exact click sequence, exact document state, a browser
console screenshot, or exported console/network logs from that real
session), this is investigated immediately and specifically — guessing
at a fix for an unreproducible, possibly environment-specific report
would violate the investigation's own "root cause, not symptom-patching"
mandate.

## Required outcomes — status

1. Editable title behaves identically to every other editable field —
   **already true, verified directly** (stage 1–4 of the new test).
2. Placeholder never becomes stored text, never concatenates, never
   survives commit — **already true, verified directly**, including
   across two consecutive edits with no accumulation.
3. Review Workspace never crashes; the explainability renderer tolerates
   every valid document state — **already true, verified directly**,
   including deliberately adversarial states (zero-count signature
   suggestion, an unresolvable pattern citation, combined with a real
   attached explainability bag, in Developer Mode).
4. Every committed reviewer edit produces Revision → Semantic Diff →
   Candidate (when applicable) → Recommendation (when repeated) —
   **already true, verified directly** for both a plain fact field
   (title) and a real pattern-sourced field citing a real Approved
   KnowledgeItem.
5. Repeated wording edits immediately become Writing Style candidates
   again — **already true**, re-confirmed via the pre-existing
   `learning-ownership-check.mjs` (66/66) and `reviewer-edit-rehydration-
   check.mjs` (27/27), neither of which needed any change.
6. Existing regression tests pass — **yes, 350+ checks, unchanged.**
7. New browser regression tests covering title editing, placeholder
   rendering, contenteditable, semantic diff, candidate generation, and
   Review Workspace rendering — **delivered**:
   `scripts/editing-pipeline-invariants-check.mjs`, 27/27, covering all
   nine named pipeline stages plus the three adversarial scenarios that
   exposed this investigation's own test defects (kept deliberately, so a
   real future regression in any of these five areas is caught
   immediately rather than dismissed as "probably a test artifact").

## Files changed

**Product code: none.** **New**: `scripts/editing-pipeline-invariants-check.mjs`
(the one permanent artifact of this investigation).

## Browser verification

Every claim in this report was verified via real headless Chromium
(Puppeteer), not inferred from source reading — see the methodology
section above. The final permanent test (27/27) is itself the browser
verification artifact.

## Regression verification

Full suite re-run after the new test was added and stabilized: all 401
checks across the twelve most relevant scripts pass (`editing-pipeline-
invariants-check` 27/27, `live-document-workspace-check` 45/45,
`composer-document-structure-check` 39/39, `doc-theme-primitives-check`
26/26, `reviewer-edit-rehydration-check` 27/27, `persistent-learning-check`
10/10, `problem-solving-integration-check` 42/42, `home-generate-live-
preview-check` 18/18, `review-workspace-render-check` 51/51, `uat-gap-
closure-check` 12/12, `learning-ownership-check` 66/66, `content-fact-
extraction-check` 24/24, `nor-center-generate-redirect-check` 14/14).

## Remaining risks

1. **The credential-free blind spot above** — a real-Firebase-session
   class of defect cannot be structurally ruled out by anything in this
   repository's current test suite, this new one included.
2. **The three test-harness fragilities documented here are now
   understood but not universally hardened** — only the new
   `editing-pipeline-invariants-check.mjs` carries the `pbsi_current_user`/
   `sarpras.presentationMode` protection. Every OTHER existing browser
   check in this repo that navigates to `/` shares the same theoretical
   race (in practice, they have run reliably throughout this entire
   session — dozens of runs, zero flakes observed — but the race is real
   and unbounded by anything guaranteeing it can't eventually manifest).
   Retrofitting this protection into every existing browser check is a
   real, small, mechanical follow-up worth doing, not done here to avoid
   touching files unrelated to this investigation's actual scope.
3. If the original UAT report's author can supply concrete reproduction
   steps or session artifacts, this investigation resumes immediately and
   specifically against them.

## Not committed

Per the investigation's own instruction: nothing in this session was
committed or pushed.
