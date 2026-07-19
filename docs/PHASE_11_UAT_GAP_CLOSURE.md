# Phase 11 — UAT Gap-Closure Report

> Independent browser UAT (Claude-in-Chrome) raised three findings against
> the live Sprint 11.4–11.8 build. Per the brief, each finding was treated
> as evidence to be *verified*, not trusted: the complete code path was
> traced to root cause and the finding classified (real bug / wrong test
> expectation / documentation mismatch / intentional design) before any
> code changed. Only confirmed bugs got code changes; intentional behavior
> got corrected reviewer-facing copy instead. Nothing committed or pushed.

## Summary table

| # | Finding | Root cause | Classification | Resolution | Status |
|---|---|---|---|---|---|
| 1 | Empty field shows literal "Klik untuk mengisi…"; Ctrl+A → "Klik untuk mengisi…a" | Placeholder is a CSS `::before` gated on the render-time `.rw-editable--empty` class; typing a contenteditable never re-renders, so the pseudo-element stayed painted over the typed text | **Bug (visual only)** — data never corrupted | CSS: clear `::before` + restore text style on `:focus` | ✅ Fixed & verified |
| 2a | First edit shows in "Perubahan Terbaru"; second edit made on another screen never appears | `showScreen()` mounted each workspace once and only toggled `display` on re-show — never re-rendered; a learning-event write does not fire the dashboard's knowledge-repo listener | **Bug (stale render)** | `showScreen()` re-invokes the workspace's idempotent mount on re-show | ✅ Fixed & verified |
| 2b | "Perubahan Terbaru" resets to zero after refresh, though documents persist | `learning-repository.js` is in-memory only **by documented design** (Phase 5) — Learning Events are *derived* memory; the facts they reference persist. Predates Sprint 11.4 | **Intentional design** | Reviewer-facing copy: honest session-scope note added | ✅ Copy corrected |
| 3 | Repeated reviewer edits did not produce "Saran Berdasarkan Pola"; app copy says recommendations come only from Approved docs | Generation is correct & wired (`computeLearningPatterns` → writing-style recs from reviewer edits, no approval needed — proven by `learning-ownership-check`). Non-appearance was the 2a staleness bug; the "only from Approved" impression came from **stale copy** predating Sprint 11.5 | **Documentation/copy mismatch** (not a generation bug) | Copy: lede + empty-state now credit repeated reviewer edits as a real recommendation source | ✅ Copy corrected (display fixed via 2a) |

## Finding 1 — inline placeholder (CONFIRMED VISUAL BUG)

**Root cause.** `js/v2/ui/review-workspace.js#renderEditableSpan` renders an
empty field as a genuinely empty element (`shownValue = ''`) carrying
`data-placeholder`, and the placeholder is drawn purely by CSS
(`.rw-editable--empty::before { content: attr(data-placeholder); }`). The
`.rw-editable--empty` class is computed **at render time**. Because typing
into a `contenteditable` never triggers a re-render (by design — `onInput`
deliberately does not re-render, to avoid destroying the caret), the class
— and therefore the `::before` placeholder — stayed visible next to the
character the user typed, producing "Klik untuk mengisi…a". Ctrl+A then
"selected" nothing real (the placeholder is a pseudo-element, not content),
so the next keystroke appended after the still-painted placeholder.

**Why the data was never at risk.** `onFocusOut` commits
`el.textContent.trim()`, and `textContent` does **not** include `::before`
pseudo-element text. The verification proves this directly: typing into the
focused empty field yields `textContent === "a"`, never
`"Klik untuk mengisi…a"`. So this was strictly a visual defect, not
corruption — correctly classified as a bug worth fixing, but a low-risk,
CSS-only one.

**Fix** (`workspace-list-kit.css`) — pure CSS, no re-render, no JS change:
```css
.rw-editable--empty:focus{color:var(--text);font-style:normal;}
.rw-editable--empty:focus::before{content:'';}
```
The placeholder now disappears the instant the field is focused and typed
text renders in normal (not faint-italic) style — exactly the expected
"click → placeholder disappears → typing replaces it naturally" behavior,
with Ctrl+A acting on a genuinely empty field.

**Verification.** `scripts/uat-gap-closure-check.mjs` loads the real
stylesheet in a real browser, confirms the base `::before` still paints the
placeholder when unfocused, confirms the `:focus::before` fix rule is
deployed and clears `content`, and confirms typing commits exactly `"a"`.
(A live headless `:focus` repaint check was intentionally replaced with a
CSSOM rule assertion: headless Chromium cannot reliably place a caret in a
truly-empty inline `contenteditable` span, so the live repaint is flaky
there — the CSS rule the browser applies on real focus is what's asserted.)

## Finding 2a — second edit never appears (CONFIRMED STALE-RENDER BUG)

**Root cause.** `js/v2/ui/sarpras-intelligence-center.js#showScreen`:
```js
if (workspace && !mountedState[id]) { /* first time: import + mount */ }
```
mounted each workspace exactly once. Every subsequent navigation to it only
flipped `style.display` — it never re-rendered. The Learning Dashboard
auto-re-renders only on **knowledge-repository** change events
(`registerRepositoryListener`), but a reviewer inline edit writes a
**Learning Event** (and a composer revision), neither of which is a
knowledge-repo change. So a reviewer who edited in Review Workspace and
returned to an already-mounted Learning Dashboard saw the render frozen at
its previous state — the new edit "never appeared" until a manual tab click
forced `render()`.

**Fix** (`showScreen`) — re-invoke the workspace's own mount on re-show:
```js
} else if (workspace && mountedState[id] && mountedState[id].mount) {
  mountedState[id].mount(sections[id]); // idempotent re-render
}
```
Verified safe: all six workspace mounts follow the identical idempotent
pattern (`if (!mounted) { …one-time shell/listener setup… }` then always
`render()`), so re-invoking only recomputes the view against current data —
it never duplicates a listener or resets in-progress state. The `&& .mount`
guard skips the window before the first dynamic import resolves. This is a
true root-cause fix that generalizes to any workspace showing data changed
elsewhere, not a symptom patch.

**Verification.** `scripts/uat-gap-closure-check.mjs` drives the real
screen-switch path: opens the dashboard's Antrean tab, reads the
"Perubahan Terbaru" count, navigates away, records a real reviewer edit via
the same `recordSectionEdit()` path `onFocusOut` uses, navigates back, and
asserts the count incremented by exactly 1 **without any tab click**.

## Finding 2b — resets to zero after refresh (INTENTIONAL DESIGN)

**Root cause — verified, documented, predates Sprint 11.4.**
`js/v2/learning/repository/learning-repository.js` is a `Map` with no
Firebase backend, by explicit design (its own header):

> "In-memory only, like Knowledge and Archive (not RTDB-backed like Import
> Session) — Learning Events are derived organizational memory, not the
> pipeline's own durable-across-refresh state; the facts they reference…
> are what actually persists."

By contrast `composer-document-repository.js` was purpose-built (Phase 10)
*with* Firebase persistence so drafts survive refresh — which is exactly
the asymmetry the tester observed ("document versions remain… learning
resets"). This is not broken persistence; it is two deliberately different
durability tiers. Making Learning Events durable would mean adding a
Firebase backend to a repository explicitly designed without one — a major
architectural change that contradicts the documented design and the brief's
"respect the existing architecture / do not invent new behavior."

**Resolution (copy, per the brief's "if intentional, fix the expectation").**
`js/v2/ui/learning-dashboard.js` — "Perubahan Terbaru" now carries an
honest note: *"Mencerminkan suntingan reviewer pada sesi kerja ini. Dokumen
itu sendiri tetap tersimpan permanen; ringkasan pembelajaran ini adalah
memori turunan yang disusun ulang tiap sesi."*

**Known limitation (below).** Sprint 11.4's "Perubahan Terbaru" is the
first user-facing surface that reflects reviewer-edit learning without a
recompute-on-load path (unlike Pattern Discovery/Coverage, which recompute
from persistent Approved Knowledge). It is therefore genuinely
session-scoped. See Known Limitations.

## Finding 3 — recommendations "only from Approved" (COPY MISMATCH)

**Root cause — generation is correct; the copy was stale.**
`computeLearningPatterns()` (wired into the dashboard's recommendations list
in Sprint 11.5) *does* generate `writing_style` recommendations from
repeated reviewer edits, requiring no Approved Knowledge — proven by
`learning-ownership-check.mjs` (the WRITING_STYLE assertions) and by this
session's `uat-gap-closure-check`. Two things made it look otherwise:

1. **Stale copy** (predating Sprint 11.5): the Antrean lede said
   recommendations come *"dari dokumen yang sudah disetujui"* and the
   empty-state said *"Rekomendasi muncul setelah ada Knowledge Approved."*
   — the exact wording that led the tester to conclude approval was
   required. Now corrected to credit repeated reviewer edits as a real
   source, and to explain that a style recommendation needs the *same*
   change made the *same* way across enough documents (`RECURRING_THRESHOLD
   = 2`) — so a single edit, or edits to the same field on a single
   document (which supersede each other), correctly do not yet qualify.
2. **The 2a staleness bug** masked recommendations that *had* been
   generated — fixed above.

**No generation code was changed** — doing so would have been fixing a
non-bug. Classification: documentation/copy mismatch.

## Regression summary

Fixes touched: `workspace-list-kit.css`, `sarpras-intelligence-center.js`
(showScreen), `learning-dashboard.js` (copy), plus one additive test hook in
`scripts/sarpras-workspace-harness.html` and the new
`scripts/uat-gap-closure-check.mjs`.

| Script | Result |
|---|---|
| uat-gap-closure-check.mjs (NEW) | 12/12 |
| sarpras-workspace-dom-check.mjs | 95/95 |
| review-workspace-render-check.mjs | 51/51 |
| live-document-workspace-check.mjs | 36/36 |
| home-generate-live-preview-check.mjs | 9/9 |
| semantic-diff-engine-check.mjs | 18/18 |
| section-learning-bridge-check.mjs | 30/30 |
| section-confidence-engine-check.mjs | 22/22 |
| knowledge-drift-engine-check.mjs | 15/15 |
| learning-ownership-check.mjs | 66/66 |
| pattern-discovery-check.mjs | 13/13 |
| conversation-ownership-check.mjs | 80/80 |
| composer-foundation-check.mjs | 76/76 |
| knowledge-ownership-check.mjs | 56/56 |
| problem-solving-integration-check.mjs (e2e) | 38/38 |
| nor-center-generate-redirect-check.mjs (e2e) | 14/14 |

**Three scripts still fail — all confirmed pre-existing and unrelated:**
`sarpras-home-experience-check` (13/14) and `sarpras-workspace-completion-
check` (58/59) were already documented as pre-existing in the Sprint
11.4–11.8 report. `learning-dashboard-today-check` (4/6) was
`git stash`-isolated **this session**: with the `showScreen` change reverted
it fails the *identical* 2 assertions (both about "today" knowledge-fact
counting — code this session never touched), proving the fix did not cause
or worsen it. **Zero new regressions introduced.**

## End-to-end workflow verified

Conversation → Generate Draft → Live Document (Review Workspace, inline
edit) → automatic Learning → **navigate away and back (now re-renders)** →
Recommendation surfacing → Publish — exercised across
`home-generate-live-preview-check`, `live-document-workspace-check`,
`nor-center-generate-redirect-check`, `problem-solving-integration-check`,
and the new `uat-gap-closure-check`, all passing. The one gap in that chain
the UAT found — the dashboard not refreshing on return — is the 2a fix and
is now covered.

## Known limitations

1. **Reviewer-edit learning is session-scoped.** "Perubahan Terbaru" and
   writing-style recommendations built on live reviewer edits do not survive
   a page refresh, because Learning Events are in-memory derived memory by
   documented design and there is no recompute-from-document-history path
   for reviewer-edit corrections (unlike Pattern Discovery/Coverage, which
   recompute from persistent Approved Knowledge). Now disclosed honestly in
   the UI. A durable reviewer-edit learning store is a Phase 12 candidate
   (see below), not a small-diff change.
2. **Writing-style recommendations require repetition across documents.**
   By design (`RECURRING_THRESHOLD = 2`, grouped by field + preferred
   value), a single edit — or repeated edits to the same field on the same
   document, which supersede one another — will not surface a style
   recommendation. The corrected copy now states this.
3. **Headless focus of empty inline contenteditable.** The Finding 1
   verification asserts the fix via the loaded CSS rule rather than a live
   `:focus` repaint, because headless Chromium cannot reliably caret an
   empty inline `contenteditable` span. The behavioral data-integrity and
   unfocused-placeholder checks are live; the focus-repaint itself is
   asserted structurally.

## Remaining production blockers

None newly introduced by this gap-closure. The standing posture from the
Sprint 11.4–11.8 report is unchanged: **supervised pilot only**, because no
real credentialed browser session against production Firebase has been
human-witnessed in this environment, and Sprint 11.5/11.7 features still
have zero real-world usage evidence. If durable reviewer-edit learning
(limitation 1) is a pilot requirement rather than a Phase 12 nicety, it is
the one item that would need to land before a pilot that expects learning to
accumulate across sessions.

## Phase 12 candidates surfaced by this UAT

- A durable reviewer-edit learning store (or a deterministic recompute of
  reviewer-edit corrections from the persistent composer revision history on
  load), so cross-session learning accumulates — the real fix behind
  Finding 2b's limitation.
- Generalize the `showScreen` re-render into an explicit per-workspace
  "onReshow/refresh" contract, rather than relying on every mount being
  idempotent (works today, but the contract is implicit).

## Not committed

Per the brief: nothing in this session was committed or pushed.
