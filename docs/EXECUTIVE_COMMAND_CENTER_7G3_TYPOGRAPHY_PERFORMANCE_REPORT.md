# Phase 7G.3 — Typography, Numeric Formatting, Performance & Persistent Login Report

**Scope:** Fix the broken raw-float KPI value, audit typography across the
Executive Command Center and login screen, measure and reduce real
theme-toggle performance cost, classify (not rewrite) historical CSS, and
— added mid-turn — implement an explicit "Remember me" session-persistence
control on login. No redesign, no IA change, no removed functionality.

**Status:** Complete, verified with real Chrome traces and a real running
browser, **NOT committed, NOT pushed, NOT deployed**.

---

## A. Numeric formatting

**Root cause of `98.57142857142858`**: `executive-score-engine.js` has five
sub-score functions feeding the domain-health strip. Three
(`driverOpsScore`, `engineeringOpsScore`, `pettyCashHealthScore`) already
`Math.round()` their result; two (`vehicleUtilScore`, `requestScore`) return
a raw `clamp100(ratio * 100)` with no rounding — an inconsistency within the
engine itself, not a deliberate design choice (confirmed by comparing all
five functions side by side: same shape, same 0–100 contract, same
consumer, three round and two don't). `69/70*100 = 98.57142857142858` is
exactly the "Permintaan" (request) domain's shape: 69 of 70 requests
resolved.

**Fix — presentation layer only**, per the brief's explicit instruction not
to touch the calculation unless it's an actual bug: `js/widgets/executive/
index.js` gained one 4-line helper, `fmtScore(score)` (`null → '—'`,
otherwise `Math.round(score)`), applied at both places a domain score is
displayed as text — the domain-meter strip (`.wsp-hero__domain-val`) and
the "Lihat rincian skor" breakdown disclosure (`.wsp-hero__bd-value`). The
engine (`vehicleUtilScore`/`requestScore`) was deliberately left untouched:
`calculateScore()`'s own blended result is already `Math.round()`'d
regardless of whether its inputs arrive pre-rounded, so fixing only the
display layer carries zero risk to the top-level Health Score and zero risk
to any other consumer of the raw engine (PDF exports, other Analytics
views) that might rely on the existing unrounded value.

**Verified** with a fixture reproducing the exact bug (`score: 69/70*100`
and the literal reported `98.57142857142858`): both now render `"99"` —
the brief's own suggested example — at both display sites.

**Other numeric values audited** across the whole Executive widget
(`index.js`): Pulse dot positions, day-over-day insight percentages,
driver-capacity bar widths, Outlook horizon marker positions, Snapshot
tile counts, status pill counts. All were already correctly
`Math.round()`/`.toFixed()`'d or are plain integer counts
(`.length`/`.size`) with no unrounded-float exposure. The day-over-day
insight lines (`buildInsight()`) already guard every division against a
zero denominator before computing a percentage — no NaN/Infinity risk
found anywhere in this file. `c.weightPct` (shown next to each score in the
breakdown disclosure) was checked separately and traced to a hardcoded
integer metadata table (`executive-analytics.js`'s `COMPONENTS` array,
25/25/20/15/15) — never a computed value, not a source of this bug.

## B. Typography

**Terminology**: `"Denyut Operasional — Hari Ini"` (the Pulse timeline's
label) replaced with `"Timeline Operasional — Hari Ini"`. Not a arbitrary
translation choice — cross-checked against the app's own existing
vocabulary first: the Engineering nav literally uses `"Timeline"` as a
label (`js/app.js`, `#v2NavEngTimelineLabel`), and the Driver workspace's
own trip-timeline widget is titled `"Linimasa Perjalanan"` — so the app
already treats "timeline" (in one language or the other) as its
established term for a chronological event axis, and "Denyut" (pulse/
heartbeat) was the outlier. "Timeline Operasional" also matches its
immediate sibling in the same zone, "Snapshot Operasional" (same
"[English noun] Operasional" shape). Every other zone/widget label in the
Executive Command Center ("Sekarang", "Keputusan", "Situasi Operasional",
"Pusat Perhatian", "Tindakan Direkomendasikan", "Ringkasan Eksekutif",
"Proyeksi", "Peluncur Eksekutif") was reviewed and found to already be
clear, professional, non-metaphorical business Indonesian — left
unchanged, per the brief's own instruction not to rewrite terminology
without a genuine problem. No test asserts on the literal string "Denyut
Operasional", so no test update was needed.

**Login screen** — audited independently, then verified against a real
render (not just CSS numbers read in isolation):
- `.login-brand-name` ("Sarpras Operations") and `.login-card h2` ("Masuk
  ke Platform") were both computing to the body sans face (Manrope) —
  confirmed via `getComputedStyle` — while every other confident-heading-
  level text in the product (Hero headline, workspace title) explicitly
  sets `font-family: var(--font-display)` (Archivo). Added the same
  declaration to both, so the login screen's strongest text now uses the
  same face as the rest of the product instead of quietly falling back to
  the body font.
- `.login-foot-text` ("Bidang Sarana dan Prasarana Operations Platform")
  was set in JetBrains Mono — confirmed via computed style, this renders a
  full descriptive sentence in the app's monospace face. The app's own
  established convention (Pulse's domain values, PIN digits, version
  numbers) reserves monospace for short numeric/technical tokens, never
  full sentences — switched to the standard sans face.
- Everything else audited (brand-sub, lead paragraph, field labels, input
  sizing, submit button, spacing) was already proportionate and consistent
  with its role; not changed, to avoid manufacturing work where none was
  needed.

**Login copy** (§7 of the brief): reviewed "Masuk ke Platform" and "Gunakan
username dan PIN Anda. Navigasi menyesuaikan peran secara otomatis." —
both already read as clear, natural, professional Indonesian. Not changed.

**Mobile typography** (375/390/402/430): reviewed via the same real-browser
screenshots used for the header/login work in this pass and the prior
7G/7G.1/7G.2 rounds — no wrapping, clipping, or forced-tiny-text issues
found at any of the four widths; the domain-meter strip's newly-shortened
score text ("99" vs the old 18-character raw float) if anything now fits
more comfortably in its label-value row than before.

## C. Performance

**Investigated before touching anything**, per the brief's explicit
instruction — captured a real Chrome DevTools trace (`page.tracing`, not
inferred) of an actual click on the real theme-toggle button, before
changing any code:

| Metric | Before (measured) |
|---|---|
| Layout (reflow) | 1 event, 0.17ms |
| Style recalculation | 52 events, **420ms total** |
| Paint | 266 events, 43.8ms |
| Compositing | 0 events, 0ms |
| Script execution | 5 events, 0.33ms |
| Long tasks (>50ms) | 1 task, 147.1ms |

**Root cause**: style recalculation, by nearly 10×, over everything else
combined. Layout, paint, compositing, and JS were all negligible — this
directly answers the brief's "A vs B vs C vs D..." question: **A (too much
CSS transition work)**, specifically from `html.theme-anim *` — a
universal selector matching every node in the DOM, forcing the browser to
recompute an interpolated value for up to 4 properties on every matched
element, every animation frame, for the full duration the class is
present. No JS re-render, no expensive blur/filter, no compositing cost,
and no DOM mutation were found to be contributing — `applyTheme()`'s own
synchronous work is 0.5ms, confirmed by direct measurement.

**Optimization made — the least invasive lever available**: trimmed the
universal rule's four transition durations (`.55s/.55s/.40s/.55s` →
`.32s/.32s/.26s/.32s`) and the matching JS `theme-anim` class hold
(`700ms` → `420ms`). This changes **only how long** the existing crossfade
runs — not which elements transition, not which properties, not the
visual outcome (still a full smooth crossfade, still covers every element
it covered before). Since the selector matches the whole DOM, the number
of frames the browser must recalculate scales with duration; shortening it
proportionally cuts total recalc work without removing any coverage.
Chosen over narrowing the `*` selector itself (the deeper fix) because
narrowing risks silently un-fading some element currently covered only by
the universal fallback — a real regression risk that the brief's own
priority order (§12, "prefer... 8. optimize expensive effects only if
profiling shows they matter... 10. only then deeper architectural
changes") argues against taking in this pass. Documented as a deferred
option below instead of attempted.

**Re-measured after the change** (same trace method, same interaction):

| Metric | Before | After |
|---|---|---|
| Style recalculation | 52 events / 420ms | **14 events / 300ms** |
| Long task | 1 × 147.1ms | 1 × 142.3ms |
| Layout | 0.17ms | 0.68ms (still negligible) |
| Paint | 43.8ms | 21.9ms |

**~28% less total style-recalculation time, ~73% fewer recalculated
frames** — a real, measured improvement, not inferred. The one long task
is essentially unchanged (147→142ms): this is most likely the fixed cost
of the *initial* invalidation pass the browser must do across every DOM
node the instant `.theme-anim` is added (arming the transition for
potential animation), which duration alone cannot remove — that cost is
tied to the selector's breadth, not its speed. This is the deeper,
higher-risk fix deferred to §F below.

**Re-verified live** after the change: a real click on the toggle button
still shows the logo/header/rail transitioning in perfect frame-by-frame
sync (unchanged from 7G.2's fix, now converging faster, ~292ms instead of
~340ms); `prefers-reduced-motion` still correctly disables the transition
entirely with the final color applied within 2 frames.

**CSS audit (§13 of the brief)** — classified rather than rewrote, per the
explicit instruction. `platform.css` has roughly a dozen historical
`.v2-topbar`-related rule blocks accumulated across "VSM"/"Phase 11"
passes (already flagged in the 7G.2 report). This pass did not re-verify
every single one byte-for-byte (that would be a multi-hour full audit on
its own); what's confirmed, from both 7G.2's tracing and this pass's own
work:
- **Active**: the `@media (max-width:600px/380px)` grid blocks (~line
  5585+), the Part D curated transition list (~line 5427+, extended in
  7G.2), the base `.v2-topbar`/`.date-nav`/`.btn-today` rules.
- **Inactive but harmless**: the older flex-`order`-based rules from
  before the CSS Grid rewrite (~lines 2063–2178) — for viewport widths
  where the newer Grid rules apply, `order` has no effect once a grid item
  has an explicit `grid-area` (confirmed in 7G.2's own investigation), so
  these are dead weight for those ranges but cause no visible bug.
- **Unclassified this round**: the several remaining `body.v2-shell-active
  .v2-topbar { ... }` blocks between ~601–767px and the ≥768px tablet/
  desktop tiers were not individually re-traced this pass. No evidence of
  a live bug was found there (the tablet/desktop screenshots in this round
  and 7G.2 both looked correct), so they're left alone rather than guessed
  at — consolidating them safely would need the same kind of computed-
  style tracing done for the ≤600px tier, which is a bounded but separate
  task, not attempted here to avoid turning this into "another endless CSS
  tweaking cycle" the brief explicitly warned against.

**Visual-effect performance (§14)**: the 7G.1 ambient glow, Pulse glow,
Command Panel shadow, and navigation shadows were not modified — the trace
showed compositing and paint were never the bottleneck (0ms and 43.8ms
respectively, both negligible next to the 420ms recalc cost), so per the
brief's own instruction ("only optimize if profiling shows they matter"),
none of them needed touching.

## Persistent login ("Ingat saya di perangkat ini") — added mid-turn

**Investigated the existing auth architecture before writing any code**,
per that instruction's own §8A. Read `js/auth.js` and `js/firebase.js` in
full. Findings:
- Firebase custom-auth flow: `verifyPin` (server callable) → custom token
  → `signInWithCustomToken`. `localStorage`'s `pbsi_current_user` is a
  write-through **cache** of the session, re-hydrated by
  `onAuthStateChanged` — the actual authenticated session lives in Firebase
  Auth itself, not in that cache.
- **No `setPersistence()` call existed anywhere.** The Firebase JS SDK's
  own default (unset) is already `browserLocalPersistence` for web apps —
  meaning the app was already implicitly persisting sessions across
  browser restarts, with no explicit control and no way for a user to opt
  into the shorter-lived, session-only alternative.

**Implementation** — extends the existing architecture, adds nothing
parallel:
- `js/firebase.js`: `signInWithToken(token, remember = true)` now calls
  `await setPersistence(auth, remember ? browserLocalPersistence :
  browserSessionPersistence)` — both are Firebase's own real SDK exports,
  imported alongside the existing `getAuth`/`signInWithCustomToken` import
  — **before** `signInWithCustomToken()`, per Firebase's own documented
  contract that persistence must be set before the sign-in call it should
  apply to. Default `true` preserves today's exact existing behavior for
  any caller that doesn't pass the argument.
- `js/auth.js`: `login()`/`loginViaFirebase()` thread a `rememberMe`
  parameter through to `signInWithToken`. The legacy break-glass PIN path
  (`AUTH_DIRECT_PIN`) is untouched — it has no Firebase session to set
  persistence on, so the parameter is accepted but has no effect there,
  correctly out of scope.
- `handleLoginSubmit()` reads the new checkbox's `.checked` state at
  submit time and passes it through; the checkbox is added to the
  `alsoDisable` list during the save-feedback saving state, same as the
  username/PIN fields.
- **No credential storage of any kind was added** — the checkbox controls
  only which Firebase Auth persistence mode is armed for that sign-in; the
  PIN is still only ever sent to `verifyPin` and never written to any
  client-side storage, exactly as before this change.

**UI**: reused the existing `.pbsi-form-toggle`/`.pbsi-toggle-input`
switch component verbatim (the same one User Management's "Aktif" field
already uses) rather than introducing a new checkbox style, per the
brief's explicit "reuse the existing component" instruction. Label:
"Ingat saya di perangkat ini". Defaults checked (matches today's existing
implicit behavior). `role="switch"` (already part of the reused
component), fully keyboard accessible.

**Verified in a real browser**: checkbox renders, defaults checked, tab
order is username → PIN → remember-toggle → submit button (logical, no
dead ends), Space key toggles it, toggling causes no layout shift, zero
console/page errors (confirming the new Firebase SDK imports resolved
correctly), correct appearance in light and dark at both desktop and
mobile widths.

**What could not be verified end-to-end**: an actual login round-trip
against production Firebase (no test credentials available in this
session — the same documented constraint as every prior real-browser pass
in this program) — specifically, an actual `setPersistence()` +
`signInWithCustomToken()` call completing, then a real page
reload/browser-restart confirming the session survives or doesn't per the
checkbox's choice. What **was** verified: the code compiles and imports
cleanly, the exact Firebase SDK constants exist and load without error,
the call sequencing matches Firebase's documented contract, and the UI
behaves correctly. This is a **MEASURED-vs-INFERRED** distinction worth
being explicit about: the UI and wiring are measured; the actual
persisted-session behavior against real Firebase Auth is inferred from
reading Firebase's own documented `setPersistence` contract, not observed
first-hand in this session.

## D. Regression verification

- **Automated suite**: full existing suite re-run after every batch of
  changes this round, **605/605 passed, 0 failed**, multiple times, with
  zero assertions weakened or deleted.
- **Responsive**: 375/390/402/430/tablet(1194)/1440, light+dark, header +
  login screenshotted and reviewed directly in a real browser (not just
  computed-style assertions) — no overflow, no clipping, no broken
  controls found at any combination.
- **Theme tests**: real click on the real toggle button, both directions,
  before and after the duration change, confirmed via live frame sampling
  and reduced-motion emulation.
- **Login tests**: visual review in light/dark/desktop/mobile; keyboard
  and toggle-interaction checks on the new remember-me control.
- **Console/page errors**: zero introduced by this pass across every check
  run. The one recurring "Permission denied" message during unauthenticated
  real-browser testing is pre-existing, expected behavior for an
  unauthenticated session hitting auth-gated RTDB reads — not related to
  this pass, not new.

## E. Files changed

- `js/widgets/executive/index.js` — `fmtScore()` helper + two display
  sites fixed; Pulse label terminology.
- `js/analytics/engines/executive-score-engine.js` — **not changed**
  (investigated, deliberately left as-is; see §A).
- `platform.css` — login typography (`.login-brand-name`, `.login-card
  h2`, `.login-foot-text`); `.login-remember` spacing; `html.theme-anim`
  transition durations.
- `js/app.js` — `applyTheme()`'s `theme-anim` class-removal timeout,
  matched to the new CSS duration.
- `js/auth.js` — `rememberMe` threaded through `login()`/
  `loginViaFirebase()`/`handleLoginSubmit()`.
- `js/firebase.js` — `signInWithToken()` now sets Firebase Auth
  persistence explicitly before sign-in.
- `index.html` — the remember-me toggle markup in the login form.

## F. Deferred items

- **Narrowing the `html.theme-anim *` selector itself** (or replacing it
  with an explicit, curated element list) would likely eliminate most of
  the remaining ~142ms long task, on top of the duration win already
  measured. Not attempted this pass: real regression risk (some
  currently-smooth element could silently stop fading) that needs its own
  careful audit and verification pass, matching the brief's own priority
  order that this class of change comes last, only once the safer options
  are exhausted.
- **Full classification of every historical `.v2-topbar` CSS block**
  between ~601–767px and ≥768px — not completed this round (see §C); no
  live bug found there, so left alone rather than guessed at.
- **A real, authenticated end-to-end login/reload/restart test of the
  persistence toggle** — blocked by the lack of test credentials against
  production Firebase in this session, consistent with the same
  constraint noted in every real-browser pass this program (7G.2's own
  report has the identical caveat for the header work). Code-level and UI
  verification were both done in full; the live Firebase round-trip was
  not.

---

Nothing committed, pushed, or deployed. All Phase 7 (7A–7G.3) work remains
uncommitted working-tree changes, awaiting explicit review.
