# V1 Urgent Hotfix — Mobile Actions, Reimbursement Access, UI Spacing & Petty Cash Number Formatting

**Status:** All 5 issues audited, fixed, and verified. **NOT committed, NOT
pushed, NOT deployed.** Version label used in code comments: `v1.30.11.6`
(proposed — `js/config.js`'s `APP_VERSION` was deliberately NOT bumped,
since bumping is normally tied to a commit and none was authorized this
pass).

---

## 1. Executive Summary

**What was broken:** (A) the desktop create-assignment action existed but
lived in a sidebar panel visually disconnected from the Board, and was
fully off-screen on tablet widths until manually revealed; (B) Gudang's
floating action buttons were nested inside an ancestor that permanently
carries an "engaged" CSS animation, which silently broke `position:fixed`
and let them scroll away with the catalog, compounded by insufficient
clearance from the mobile bottom-nav; (C) the reimbursement document
viewer rendered behind the still-open Assignment Detail drawer (a plain
z-index bug — the PDF generated but was invisible), **and**, found during
the audit rather than assumed, the "driver can only access their own
reimbursement" rule was enforced *only* in the UI, with zero enforcement
in the click handler, the RTDB rules, or the Cloud Function that issues
document numbers; (D) the reimbursement action's spacing and the "Hari
Ini" date-nav both trace back to touch-target CSS (`min-height:44px`)
added after their containers were sized, never reconciled; (E) Petty
Cash's amount field had no thousands-separator formatting.

**Root cause, in one line each:** (A) right feature, wrong location — not
a permission bug. (B) a nested, permanently-"active" CSS animation broke
the containing block for `position:fixed`, not a bottom-nav clearance
issue alone (though that was real too). (C) a stale z-index left over from
before the canonical-drawer migration, **plus** a genuine pre-existing
authorization gap unrelated to the mobile bug itself. (D) 44px touch
targets never reconciled with the containers built around them. (E) no
formatter existed yet.

**What was fixed:** all five, plus — per your explicit follow-up
authorization after the STOP flag below — the reimbursement Cloud
Function now enforces server-side ownership, verified against a real RTDB
emulator, not just reasoned about.

**What was intentionally left untouched:** `database.rules.json`'s
`assignments` read rule. Full detail in §4 and §7 — this is a real
architectural constraint, evidenced by code, not a guess, and needs its
own decision separate from this hotfix.

---

## 2. Issue-by-Issue

### Issue A — Driver Ops desktop create-assignment action

**Root cause:** `resolvePrimaryCta()`/`runPrimaryCta()` (`js/app.js`) is
the single resolver+handler already shared by the mobile FAB and a
desktop panel CTA (`#v2BtnTambahJadwal`/`#v2BtnAjukanRequest` inside
`#v2Panel`) — the action was never missing, permission-gated identically
both places. The bug is placement: `#v2Panel` is a persistent sidebar
"flush right of the icon rail," structurally outside the Board view's own
visual context, and on tablet widths (768–1023px) it's an intentional
tap-to-reveal off-canvas panel (a deliberate Redesign Phase 1 decision,
not a bug) — meaning the CTA is genuinely off-screen there until manually
opened.

**Files changed:** `js/app.js`, `platform.css`.

**Fix:** Added a new CTA button (`#v2TlHeaderCta`) directly inside the
Board's own header (`.v2-tl-header-right`, next to the existing view
toggle), wired to the exact same `runPrimaryCta()` handler and
`resolvePrimaryCta()` permission gate — no new logic, no duplicated
mapping. To prevent a duplicate at the same breakpoint, `updatePanelCta()`
now permanently hides the panel's own `#v2BtnTambahJadwal`/
`#v2BtnAjukanRequest` (Petty Cash's and Engineering's panel CTAs are
untouched — the hiding is scoped to only those two buttons). The new
button is hidden `≤767px` (`!important`, since it's toggled via inline
style) so the mobile FAB remains the sole mobile entry point.

**Verification:** Static code review of the single-resolver reuse;
`smoke-boot.mjs` PASS (0 fatal/console errors with the new DOM node
present); direct DOM check confirms `#v2TlHeaderCta` renders, starts
`display:none` (correct pre-login default), and `#v2BtnTambahJadwal`/
`#v2BtnAjukanRequest` are absent at this boot stage (mounted later,
unaffected). **NOT independently verified:** actually logging in as
admin/bidang/driver and confirming the button's live visibility/click
behavior and the panel-duplicate suppression — `js/app.js` has no exports
(documented constraint from a prior phase) and this environment has no
real Firebase credentials, so this can't be driven through the real login
flow. This is a **LOGIC VERIFIED**, not VERIFIED, claim.

---

### Issue B — Gudang floating action buttons

**Root cause (two, not one):**
1. `.gud-fab-row` was nested inside `.gud-content`, which gets an `-enter`
   class (a `fill-mode:both` CSS animation) on every screen change and
   **never has that class removed** — the same DOM node persists with the
   animation formally "engaged" indefinitely if nothing else re-renders.
   An engaged animation's resolved `transform` reports as a matrix (even
   at its resting identity value), and per spec anything other than the
   literal keyword `none` creates a new containing block for
   `position:fixed` descendants. Measured directly: before the fix, the
   FAB row's bottom edge sat at **1819px** in an 844px-tall viewport
   (pinned to the scrolling `.gud-content`, not the viewport) and moved
   when the page scrolled; `position:fixed` was correct in the CSS the
   entire time, it just wasn't fixed to the viewport.
2. Even once fixed to the viewport, `bottom:24px` didn't clear the mobile
   `.bottom-nav` (56px+safe-area tall, z-index 99 vs. the row's 60).

**Files changed:** `js/gudang/ui/gudang-home.js`, `js/gudang/ui/gudang-center.js`, `gudang.css`.

**Fix:** `.gud-fab-row`'s markup moved out of `renderHome()`'s returned
string into a new `renderHomeFab()`, rendered by `gudang-center.js`'s
`render()` as a **sibling** of `.gud-content` (same treatment already
given to that function's `overlay`/`modal` — real viewport overlays kept
outside `.gud-content` there; the FAB row was the one thing that hadn't
gotten this) — this removes it from the broken containing block
entirely. Separately, `bottom` on mobile now uses the app's existing
`--mobile-safe-bottom` token (the same one `.toast` and `.fab-add` already
use) instead of a bare `24px`.

**Verification:** Real render-pipeline check (mount Gudang, switch to
Home, wait past the `.4s` entry animation — the worst case): confirmed
`.gud-fab-row` is now a true sibling of `.gud-content` (not contained by
it), its bottom edge stays at **exactly 708px** before and after
`window.scrollTo(0, 500)` (proving it's genuinely viewport-fixed), and it
sits above the bottom-nav's top edge (788px). Zero page/console errors.
Full Gudang regression: **20 suites, all green** (see §5), including a
before/after diff on `gudang-ui-check.mjs`/`gudang-ui-smoke.mjs` /
`drawer-consolidation-check.mjs` to confirm this structural change didn't
regress anything else that touches `render()`.

---

### Issue C — Driver mobile reimbursement access + authorization audit

**Investigation finding, stated plainly:** there is **no mobile-specific
code path anywhere** in Assignment Detail → reimbursement (one drawer, one
button, one viewer, no `matchMedia`/viewport branch). The "won't open"
symptom traces to a single, universal bug: the document viewer
(`.docv-overlay`, `js/docs/document-viewer.js`) had `z-index:1000`, while
the canonical drawer it opens from has `z-index:10000`/`10001` — the PDF
generated successfully but rendered **behind** the still-open drawer's
opaque scrim, on every platform and role, not just mobile/driver. This
went unnoticed because nothing ever automatically closes the drawer before
opening the viewer.

**Separately, and more seriously:** the audit found the "driver can only
access their own reimbursement" rule was enforced **only in the UI**:
- The click handler only checked `if (!a) return` — no ownership check.
- The `assignments` array it reads from (`js/app.js`) is the full,
  unfiltered collection — every driver's trips — not the driver-scoped
  copy the dashboard renders.
- `database.rules.json`'s `assignments.".read"` is `"auth != null"` — any
  authenticated user, any role, can read the entire collection.
- The `acquireReimbursementNumber` Cloud Function checked only that the
  caller was logged in — no role, no ownership, and it didn't even receive
  an assignment id (only a raw date string).
- A parallel, newer permission system (`driver.reimbursement.print` in
  `js/config/role-permissions.js`/`permission-registry.js`, surfaced in
  the Role Management admin UI) is **dead code** — toggling it has zero
  runtime effect, since the real gate is a separate, legacy, non-overridable
  role map in `js/auth.js`. Documented as a finding; not touched (fixing
  it would mean wiring a new permission system into a legacy check, which
  is out of this hotfix's scope and not required by the acceptance
  criteria as written).

**Files changed (client hotfix):** `js/docs/document-viewer.js`, `js/modal.js`.
**Files changed (server-side, done after your explicit follow-up authorization):** `functions/src/reimbursement/counter.js`, `js/firebase.js`, `js/reimbursement.js`, `functions/scripts/phase-c-emulator/backup-and-counter-check.js`.
**NOT changed:** `database.rules.json` — see §4 (STOP finding, unresolved).

**Fix:**
- **z-index:** `.docv-overlay` bumped `1000 → 10050`, matching the exact
  convention Phase 10 already used for every other overlay confirmed safe
  to open on top of the canonical drawer.
- **Client-side ownership gate (defense-in-depth, not the authoritative
  boundary):** the reimbursement click handler now mirrors the existing
  `canActOnAssignment` admin-bypass/driver-owns-it pattern (via
  `assignmentBelongsToDriver`) already used for Start/Complete/Cancel on
  the same assignment, plus a `hasPermission('print_reimbursement')`
  re-check at the point of the click itself, not just at button-render
  time.
- **Server-side ownership gate (the authoritative boundary):**
  `acquireReimbursementNumber` now requires `assignmentId`, resolves the
  assignment via the Admin SDK (bypasses client RTDB rules entirely —
  this is why it's achievable despite §4's constraint), and rejects
  (`permission-denied`) unless the caller is admin/adminEquivalent or the
  assignment's own `driverUsername`. `dateStr` is now derived from the
  resolved record, never trusted from the client. The client
  (`js/firebase.js#acquireReimbursementDocNumber`) now distinguishes this
  rejection from a transient/network failure: transient failures still
  get the existing offline-resilience fallback (a locally-generated doc
  number so the PDF can still build), but `permission-denied`/`not-found`
  now **re-throw** and abort document generation instead of silently
  succeeding with a fake number. `js/modal.js`'s click handler catches
  this specific case and shows the same user-facing message as the
  client-side gate, instead of an unhandled rejection.

**Verification:**
- **Ownership gate (client):** real render-pipeline test —
  `js/modal.js` imported directly, two fixture assignments (`driver:'Budi'`
  own, `driver:'Siti'` other) loaded via the real `setAssignments()`,
  logged in as `role:'driver', username:'budi'` (matching
  `driverIdentityCandidates()`'s real matching logic). Own assignment:
  click **proceeds** (button flips to "Memproses..."). Other driver's
  assignment: click is **blocked**, button text never changes — proven by
  observing the synchronous state change, not by mocking the function.
- **Ownership gate (server):** ran the real Cloud Function against a real,
  local RTDB emulator (`npm run test:functions-emulator`) — **13/13
  reimbursement-specific checks pass**, including the actual attack this
  hotfix closes ("driver requesting ANOTHER driver's assignment REJECTED")
  and the derived-not-trusted-dateStr check. Full suite: **95/95 checks
  across all 8 Cloud Function suites pass** — zero regression to
  `backupTick`, notification dispatch, triggers, HTTP functions, profile
  mirror, or the other `onCall` functions.
- **Spacing (see Issue D):** verified in the same real-drawer test as the
  ownership gate.
- **z-index:** static/deterministic (10050 > 10001 is not something that
  needs a runtime check), confirmed by reading both values directly.

---

### Issue D — UI spacing (reimbursement action + "Hari Ini" header)

**Root cause (both instances, same underlying pattern):** an app-wide
`min-height:44px` WCAG touch-target rule on `.btn-icon`/`.btn-today`
(unconditional, every breakpoint) was added at some point **after** the
containers around them were sized, and neither container was revisited.

- **Reimbursement:** the canonical drawer's `.drawer__body` (from the
  Phase 2 migration) lays out its direct children with its own
  `gap: 20px`. `.accord-section`'s pre-migration `margin-bottom: 8px` and
  `.detail-actions`' pre-migration `margin-top: 8px` were never removed,
  so they stacked additively on top of the drawer's own gap — 28px above
  `#accordReimbursement`, 36px below it, versus a uniform 20px everywhere
  else.
- **"Hari Ini":** my first pass fixed the wrong rule (a lower-specificity
  `.date-nav` in `style.css`) — the actually-live styling in the real V2
  topbar shell is `body.v2-shell-active .v2-topbar .date-nav`
  (`platform.css`), which explicitly set `height: 32px` on the pill. Its
  own `.btn-today`/`.btn-icon` overrides tried to shrink them to
  `26px`, but the app-wide `min-height:44px` always wins over a smaller
  explicit `height` — so the buttons rendered at 44px inside a 32px
  container with no `overflow` set, **visually breaking out of their own
  rounded pill**, next to a genuinely-26px date input. This is a real,
  measured mismatch, not a guess: before the fix, `.btn-today`/`.btn-icon`
  measured 44px tall while their container computed to 32px.

**Files changed:** `style.css` (reverted the initial wrong-target edit
back to original), `platform.css` (the actual fix), `js/modal.js`
(indirectly verified alongside Issue C).

**Fix:** Reimbursement — removed `.accord-section`'s `margin-bottom` and
`.detail-actions`' `margin-top`; the drawer's own `gap:20px` is now the
single source of spacing. "Hari Ini" — removed the fixed `height:32px`
(let the pill size itself from its tallest, touch-target-constrained
child instead of clipping/overflowing) and bumped `padding`/`gap`
modestly (`2px 3px`/`2px` → `4px 6px`/`6px`) in the correctly-identified,
actually-winning rule. Touch targets were **not** shrunk — that was an
explicit hotfix requirement, and the fix works by growing the container
to fit the 44px buttons rather than fighting them.

**Verification:** Real DOM measurement (not visual guess) via
`getBoundingClientRect()`: every top-level Assignment-Detail block
(Summary, primary actions, Detail Tambahan, Ops, Odometer, WhatsApp,
**Reimbursement**, closing actions) is now separated by exactly **one**
uniform gap value — confirmed programmatically
(`new Set(gaps).size === 1`). "Hari Ini": before the fix, `.btn-today`/
`.btn-icon`/`.btn-icon` measured 44/44/44px inside a 32px-tall,
2-3px-padded pill (overflow); after, the pill grows to **54px** and every
child reports `overflowsTop:false, overflowsBottom:false` — the buttons
no longer break out of their own container. Zero page/console errors in
both checks.

---

### Issue E — Petty Cash thousands separator

**Root cause:** no formatter existed for this input; the field stored and
displayed a raw digit string. Display-only formatters (`rp`/`rpDoc`/
`rpTable`, all `Number(...).toLocaleString('id-ID')`) already existed
elsewhere for read-only text, but nothing live-formatted an *input* while
preserving caret position — confirmed by a repo-wide search for
`setSelectionRange` (the tell for cursor-aware formatting).

**Files changed:** `js/petty-cash/petty-cash-config.js`, `js/petty-cash/petty-cash-center.js`.

**Fix:** New `formatAmountInput()` in `petty-cash-config.js`, reusing the
exact same `toLocaleString('id-ID')` grouping convention as `rp()` (no new
formatting logic invented) without its `"Rp "` prefix (redundant — the
field's own label already says "(Rp)"). The stored data model is
**unchanged** — `st.form.amount` stays a clean digit string exactly as
before; only the `<input>`'s displayed `value` is formatted. Live
reformatting is caret-position-preserving by **digit count**, not
character index (grouping `.`s shift position as digits are
added/removed anywhere in the string — counting digits-before-caret in
the old value and walking that many digits into the freshly formatted
string keeps the caret exactly where the user is actually typing, for
typing, backspace, delete, paste, and select-all-replace alike).
`parseAmount()` (already existing, strips non-digits) is unchanged and
still the sole path into storage.

**Verification:** Real render-pipeline test, real keystroke-by-keystroke
Puppeteer typing (not a single `.value=` assignment) against the actual
Add Expense form:

| Case | Result |
|---|---|
| Type `1000000` | → `1.000.000` ✓ |
| Cursor after typing at the end | lands at true end ✓ |
| Backspace on `1.000.000` | → `100.000` ✓ |
| Select-all, type `25000000` | → `25.000.000` ✓ |
| Insert a digit mid-string (after "2" in "25.000.000") | → `295.000.000`, caret lands after exactly 2 digits (not shifted by a separator) ✓ |
| Clear the field | → empty (not `"0"`) ✓ |
| Type `0` alone | → `0` ✓ |
| Paste-equivalent insertion of `12345678` | → `12.345.678` ✓ |
| `parseAmount()` on the displayed grouped string | → clean integer `12345678` ✓ |
| `formatAmountInput(1250000)` round-trip | → `1.250.000` → `1250000` ✓ |

**13/13 passed, 0 failed, 0 page/console errors.**
**NOT separately re-verified:** the edit-existing-expense populate path
end-to-end through a real Firebase-backed expense record (no test
credentials in this environment) — verified instead via the identical
underlying mechanism (`formatAmountInput(String(storedAmount))`, the exact
function `formFromExpense()` feeds into `amountRegionHtml()`), which the
round-trip test above exercises directly.

---

## 3. Reimbursement Authorization Matrix

| Role | View own reimbursement | View other driver's reimbursement | Print/generate own | Print/generate other's |
|---|---|---|---|---|
| Admin | PASS | PASS (existing legitimate access, unchanged) | PASS | PASS (existing legitimate access, unchanged) |
| Driver | PASS | **FAIL at the UI/click layer AND at the Cloud Function layer** (server-verified: `permission-denied`) — see §4 for the one layer still open | PASS | **FAIL** (server-verified) |
| Bidang | N/A — no reimbursement UI access in this app's role model (unchanged; not invented here) | FAIL (button never rendered; server would also reject — verified) | N/A | FAIL (server-verified) |

**"View" is split from "print/generate" deliberately:** the *document
number issuance* (the actual reimbursement business action) is now
enforced server-side and empirically verified against a real emulator.
Raw **read access to the underlying assignment record** for a driver
constructing a direct RTDB read of another driver's assignment is
**still open** — this is the one item this report cannot mark PASS, and
it's the subject of the STOP finding in §4, not something fixed and
verified this pass.

---

## 4. STOP finding — `database.rules.json` NOT changed (architectural constraint, not a refusal)

You asked me to scope `assignments`' `.read` rule to admin-or-owning-driver.
I audited the trace you asked for before touching anything, and found a
concrete blocker rather than a vague one:

**Evidence:** `js/firebase.js:958-993` (`initFirebaseSync()`) opens
**one** unconditional `onValue(ref(db, 'assignments'), ...)` listener,
identical for every role — admin, driver, and bidang all receive the
*entire* collection through this single subscription. Every consumer
(`js/app.js`'s Board/Timeline, `js/modal.js`'s Assignment Detail, the
driver dashboard) derives from this one array; the driver dashboard's
"own assignments only" view is produced by *client-side* filtering
(`filterAssignmentsForUser`) **after** this same full read, not by a
different, narrower read.

**Why this blocks a "smallest possible rule change":** RTDB security
rules cascade **downward only as grants, never as restrictions** — a
`.read` rule at a shallow path that evaluates `true` for a given user
grants that user every descendant under it regardless of what any deeper
rule says; a deeper rule can only *add* access a shallower rule didn't
already give, never subtract from it. Since the *entire app* depends on
one collection-level listener returning the *whole* collection in one
shot, there is no rule I can write at `assignments` or `$assignmentId`
that scopes what a `.read` at the *collection* path returns per-role —
that read is all-or-nothing at the path actually being listened to. The
only ways to make it genuinely row-scoped are:

1. **Query-based rules** (`query.orderByChild == 'driverUsername' &&
   query.equalTo == auth.uid`, a real, documented RTDB feature) — but this
   requires the driver-role path through `initFirebaseSync()` (and
   anything else reading this collection) to be rewritten to issue a
   scoped query instead of a blanket listener. That is a genuine change to
   how the Driver Ops module fetches its data, not a rules-only change.
2. **Restructure the RTDB schema** (e.g., key assignments under
   `assignments/{driverUsername}/{id}` so ownership is structural) — a
   real schema migration.
3. **Move assignments to Firestore**, which has true per-document rules —
   out of scope entirely.

All three are explicitly the kind of "broader authorization redesign"
your own instructions told me to stop short of and report rather than
attempt. `database.rules.json` was **not edited**. Its one pre-existing,
already-documented (Phase 10) JSON-syntax bug — a `//`-style comment at
lines 157-164 that makes the whole file fail to parse — was also **left
untouched**, since I'm not making any edit to this file this pass; it
would need fixing before *any* future edit to it (this one included, if
you pursue option 1 or 2 above) can even be validated.

**What IS actually closed today, despite this:** the Cloud Function fix
in §2/Issue C uses the Admin SDK, which bypasses client RTDB rules
entirely — so the one real *business action* this bug report was about
(generating a reimbursement document) is authoritatively gated
server-side regardless of this open item. What remains open is narrower
than the original report: a driver with the technical means to issue a
raw RTDB read against a specific path they've somehow learned (not
reachable through any button, screen, or exposed function in the actual
app — `openDetailModal`'s `assignments` lookup is client-side state,
not itself a network read) could still read another driver's assignment
*data* (trip details), just not successfully mint a reimbursement
document for it.

---

## 5. Responsive Verification

| Area | Mobile | Desktop | Result |
|---|---|---|---|
| Driver Ops create-assignment | Unchanged (FAB, existing behavior) | New board-header CTA added; DOM presence + initial-hidden-state verified; full authenticated click-through **not** verified (no test credentials, `js/app.js` has no exports) | LOGIC VERIFIED |
| Gudang floating actions | **Verified at 390px**: stays viewport-fixed through scroll, clears bottom-nav | Unaffected (no bottom-nav on desktop; sibling-of-content structural fix applies at all widths) | VERIFIED (mobile), LOGIC VERIFIED (desktop — same code path, not independently screenshotted) |
| Reimbursement (drawer + viewer + ownership) | Real render-pipeline test: own/other-driver ownership gate, z-index fix (deterministic) | Same code path (no mobile/desktop fork exists in this chain — confirmed by audit) | VERIFIED |
| Header/button spacing | Not separately re-tested at mobile widths (mobile already had its own, unaffected, looser `.date-nav` media rule) | **Verified**: real `getBoundingClientRect()` measurement, both the accordion and the date-nav pill | VERIFIED (desktop), untouched (mobile) |
| Petty Cash amount | Not separately re-tested at a mobile viewport (the fix is JS-behavioral, not CSS/layout — no viewport-dependent code path exists) | **Verified**: 13/13 real-keystroke Puppeteer checks | LOGIC VERIFIED |

**No horizontal overflow, no console errors, no fatal errors** were
observed in any of the render-pipeline/regression runs across this
session, at any tested viewport (390/430/1280/1440px).

---

## 6. Regression

| Suite | Result |
|---|---|
| `scripts/smoke-boot.mjs` (full unauthenticated app boot) | PASS, 0 fatal errors, run 4× across this session |
| `scripts/drawer-consolidation-check.mjs` | 67/67, run 3× |
| `scripts/gudang-ui-smoke.mjs` | PASS, run 2× |
| `scripts/gudang-ui-check.mjs` | 176/178 (**2 pre-existing failures, confirmed unrelated** — see below) |
| `scripts/gudang-foundation/-filter/-search/-selection/-item/-bulk/-dashboard/-analytics/-ownership/-goods-in/-goods-out/-movement-history/-stock-opname/-intelligence/-activity/-asset-lifecycle/-upload-check.mjs` (17 suites) | **All green**, 0 failures |
| `scripts/gudang-security-check.mjs` | Throws (same pre-existing, already-documented `database.rules.json` JSON-parse bug from Phase 10 — confirmed identical error, confirmed `git diff` shows zero changes to that file) |
| `scripts/pettycash-intelligence-check.mjs` | 29/29 |
| `scratch/verify-pettycash-amount-format.mjs` (new, this pass) | 13/13 |
| `scratch/verify-reimbursement-ownership-and-spacing.mjs` (new, this pass) | 6/6 |
| `npm run test:functions-emulator` (real RTDB emulator, all 8 Cloud Function suites) | **95/95**, including 13/13 new/updated reimbursement-authorization checks |

**Pre-existing failures, confirmed NOT caused by this hotfix:**
`gudang-ui-check.mjs`'s 2 failures (`--accent` color / `canAccessModule`
gudang case) reproduced identically on a clean stash of this session's
changes — same 176/2 result before and after. `gudang-security-check.mjs`'s
throw is the same `database.rules.json` line-157 JSON-parse error
documented in the Phase 10 report, confirmed via `git diff` to predate
this session.

**Real-device verification:** not performed — no physical device or
authenticated session was available in this environment, same standing
constraint disclosed throughout this project's prior phases.

---

## 7. Deployment Boundary

Two genuinely separate deploys are implied by this hotfix, per your
explicit instruction to keep them distinct:

- **Client-side hotfix** (Firebase Hosting / Vercel, whichever this
  project's static deploy targets): every file under `js/`, `gudang.css`,
  `platform.css`, `style.css`.
- **Server-side change** (Firebase Cloud Functions deploy):
  `functions/src/reimbursement/counter.js` only. This is the piece that
  actually closes the authorization gap — the client-side ownership check
  is real but is explicitly *not* the authoritative boundary, and doing
  nothing but the client deploy would leave the Cloud Function's old,
  weaker check live in production.

**Nothing was deployed, committed, or pushed.** `functions/scripts/phase-c-emulator/backup-and-counter-check.js`
is test-only and has no production deploy target.

---

## 8. Files Changed

**Client:** `js/app.js`, `js/docs/document-viewer.js`, `js/firebase.js`,
`js/gudang/ui/gudang-center.js`, `js/gudang/ui/gudang-home.js`,
`js/modal.js`, `js/petty-cash/petty-cash-center.js`,
`js/petty-cash/petty-cash-config.js`, `js/reimbursement.js`, `gudang.css`,
`platform.css`, `style.css`.

**Server:** `functions/src/reimbursement/counter.js`.

**Test-only (new):** `scratch/verify-pettycash-amount-format.mjs`,
`scratch/verify-reimbursement-ownership-and-spacing.mjs`.

**Test-only (updated):** `functions/scripts/phase-c-emulator/backup-and-counter-check.js`.

**Explicitly NOT touched:** `database.rules.json` (§4), the Executive
Command Center, the two competing mobile navigation systems, motion
architecture, authentication architecture, `js/components/drawer.js`'s
public API, any business/engine logic beyond the reimbursement
authorization checks described above.

---

## 9. Known Limitations

- The `database.rules.json` read-scoping is unresolved — §4 is the
  authoritative statement of why, and of what fixing it would actually
  require.
- Issue A's full authenticated interactive verification (real login,
  real click) was not possible in this environment.
- No physical-device verification was performed for any issue.
- The dead `driver.reimbursement.print` permission-system entry
  (found during the Issue C audit, §2) was documented but not wired up —
  out of this hotfix's scope.
