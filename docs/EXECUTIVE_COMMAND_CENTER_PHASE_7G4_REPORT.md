# Phase 7G.4 — Session Reliability, Timeline Micro-Interaction, Theme Transition & Performance Report

**Scope:** Investigate and fix unexpected-logout reports (root cause, not a
band-aid), remove the "Ingat saya" control entirely, add a driver-
assignment-start pulse to the operational timeline, and perform a deeper,
evidence-driven theme-transition performance audit. No redesign, no IA
change, no removed functionality beyond the explicitly-requested toggle.

**Status:** Complete, verified with real Chrome traces, a real running
browser, and a controlled code-level simulation of the auth fix,
**NOT committed, NOT pushed, NOT deployed**.

---

## 1. Root cause of unexpected logout

Investigated the complete lifecycle before writing any code, per the
brief's explicit priority. Searched the **entire** codebase (not just
`js/auth.js`) for every `signOut()`/`logout()`/`SESSION_KEY` reference —
`firebaseSignOut()` has exactly one caller (`auth.js`'s own `logout()`),
and `logout()` itself has exactly two callers, both inside the legacy
`AUTH_DIRECT_PIN` break-glass path (`restoreSession()`, default-off, not
the production flow). No rogue sign-out call exists anywhere else in the
app — this rules out failure mode **I** (another code path calling
`signOut()`).

Also checked the Cloud Functions side (`functions/src/auth/verifyPin.js`)
for `revokeRefreshTokens`/`setCustomUserClaims` — neither exists anywhere
in `functions/`. The role claim is baked directly into the custom token at
mint time (`auth.createCustomToken(username, { role, ...extraClaims })`),
not applied via a separate claims-set call. This rules out server-side
forced session revocation.

**The actual finding**: `onAuthStateChanged` in `js/firebase.js` is a
**live listener for the entire page lifetime**, not a one-shot boot check
— it keeps firing on every subsequent Firebase Auth state change. Before
this pass, `_hydrateFromFirebaseUser(null)` in `auth.js` reacted to
**every** null emission identically: wipe the session cache and fire
`onAuthLost` immediately — which `app.js` wires to
`resetUsersSync()`/`resetLogsSync()`/`resetExportHistorySync()`, a full
RTDB listener teardown, not just a UI flicker. A null emission that
follows a real, working session (a transient hiccup during silent token
refresh, a momentary storage-access issue, or the well-documented iOS
Safari PWA storage-eviction behavior — the codebase's own existing
`onAuthAvailable`/`onAuthLost` comment already references "the iOS-PWA
cold-launch fix," confirming this class of issue was already known) was
treated identically to an explicit, deliberate sign-out. This matches
failure category **D** ("an intermediate/transient state incorrectly
treated as logged-out"), specifically at the **ongoing listener** level,
not just at boot.

A genuine, explicit `logout()` never depends on this listener's timing at
all — it calls `firebaseSignOut()` and then unconditionally
`window.location.reload()`s, so this finding does not implicate the
explicit logout button.

## 2. Authentication lifecycle findings

- Flow: `verifyPin` (server callable) → custom token →
  `signInWithCustomToken` → `onAuthStateChanged` hydrates `localStorage`'s
  `pbsi_current_user` write-through cache. `getCurrentUser()` stays
  synchronous, reading that cache.
- `authReady()`'s 8-second timeout race in `initAuthUI()` (a deliberate
  SS1-hotfix safety valve preventing the boot splash from hanging forever)
  was reviewed and left untouched — it already degrades gracefully (shows
  the cached session if the real callback is slow, and the real callback
  still updates the UI correctly whenever it eventually resolves). It is a
  boot-time concern, not the "sometimes get logged out mid-use" pattern
  reported; touching it risked reintroducing the freeze it was built to
  prevent, for no benefit to the actual reported problem.

## 3. Firebase persistence findings

`js/firebase.js` had **no `setPersistence()` call anywhere**. The Firebase
JS SDK's own default for web apps (unset) is already
`browserLocalPersistence` — the app was already implicitly persisting
sessions across browser restarts before Phase 7G.3 added an explicit
toggle for it. This confirms the Phase 7G.3 hypothesis ("maybe persistence
mode was the problem") was **not** the actual cause of intermittent
logouts — persistence mode was never the gap; the ongoing-listener
overreaction described in §1 was.

## 4. Exact fix implemented

`js/firebase.js`'s `initFirebaseAuthLayer()`: a `_hasBeenAuthenticated`
flag tracks whether a real (non-null) user has ever been observed this
page-load. When `onAuthStateChanged` fires `null` **after** that flag is
already true, the handler now:

1. Logs a diagnostic (`[auth-diag] null-after-authenticated: rechecking
   before acting`).
2. Waits 1200ms.
3. Re-checks `firebaseAuth.currentUser` directly (the SDK's own
   synchronous, authoritative live value).
4. If it's non-null again, logs `transient null ignored — session
   reconfirmed` and **returns immediately** — the cache is never touched,
   `onAuthLost` never fires, no RTDB listener teardown happens.
5. If it's still null after the wait, logs `session genuinely lost after
   being authenticated` and proceeds through the normal hydration/teardown
   path exactly as before.

The **very first** emission on a fresh page load is explicitly exempt from
this delay (`_hasBeenAuthenticated` starts `false`), so a genuine "not
logged in yet" state on first visit still shows the login screen
immediately — no regression to first-load behavior.

No PII is logged anywhere in this diagnostic layer — only event names,
booleans, and ISO timestamps; never usernames, PINs, tokens, or
credentials. Kept permanent (not gated behind a dev-only flag) rather than
temporary: this is a genuinely intermittent, hard-to-reproduce production
issue, and the next real occurrence needs a console trail, not more
guessing. `auth.js`'s `logout()` also gained one diagnostic line marking
itself as the **explicit** sign-out path, so the console trail can always
distinguish a real user-triggered logout from a passive session loss.

**Verified — MEASURED, not inferred.** Real Firebase credentials aren't
available in this session (documented constraint, consistent with every
prior real-browser pass in this program), so an actual production
end-to-end test wasn't possible. Instead, the **real, unmodified**
`js/firebase.js` code was exercised directly: the Firebase Auth SDK's
three CDN module imports were served from local stub files (not network
interception — the sandboxed browser here has no external network
reachability, confirmed when interception itself failed with
`net::ERR_FAILED` before ever reaching the request handler) implementing
the same `onAuthStateChanged`/`getAuth`/`currentUser` contract, then a
Puppeteer script imported the actual `firebase.js` and drove three real
scenarios through its actual, shipped logic:

| Scenario | Result |
|---|---|
| A. First-ever emission is a real user | Hydrates immediately, no delay |
| B. Transient null that self-heals within 1200ms | `[auth-diag]` shows the recheck firing, then `transient null ignored — session reconfirmed` — **cache/session never touched** |
| C. Null that does NOT self-heal | Recheck fires, waits the full 1200ms, then correctly proceeds as a real logout |

This is a genuine execution of the real code (not a reimplementation),
proving the control flow behaves as designed for all three cases.

## 5. Remember Me removal

Removed completely, per the explicit instruction — not replaced with
another control:
- `index.html`: the `.pbsi-form-toggle`/`#loginRememberMe` markup deleted.
- `js/auth.js`: `rememberMe` parameter removed from `login()`/
  `loginViaFirebase()`; `handleLoginSubmit()` no longer reads or disables
  a remember-me input.
- `js/firebase.js`: `signInWithToken(token)` dropped the `remember`
  parameter — kept an **unconditional** `setPersistence(auth,
  browserLocalPersistence)` call rather than deleting it outright (per the
  brief's own "if explicit persistence is useful for clarity, keep it"
  allowance) — self-documenting, costs nothing, removes any dependence on
  the SDK's implicit default staying what it is today. The now-unused
  `browserSessionPersistence` import was removed.
- `platform.css`: the `.login-remember` spacing rule (added in 7G.3
  specifically for this control) removed.

## 6. Login UX changes

- Removed the explanatory subtitle ("Gunakan username dan PIN Anda.
  Navigasi menyesuaikan peran secara otomatis.") entirely, per the
  explicit instruction to prefer removal over another paragraph.
- **Typography re-audited after removal**, per the brief's own
  instruction: `.login-card h2`'s bottom margin was `5px`, which had
  assumed the (now-removed) subtitle would immediately follow and
  contribute the real spacing via its own `22px` margin. Grown to `24px`
  so the heading now owns that gap directly — verified via a real render
  that the space between "Masuk ke Platform" and "USERNAME" reads
  intentional, not cramped or excessive (screenshotted at 375px/1440px,
  light/dark).
- `.login-lead`'s CSS rule was left defined but unused (a generic "lead
  paragraph under a heading" utility, not Remember-Me-specific or
  screen-specific enough to justify deleting outright) rather than forcing
  an unrelated cleanup into this pass.
- Login copy audit: "Masuk ke Platform" reviewed and kept — already
  concise and natural, no genuine problem found.

## 7. Timeline pulse implementation

Added an active-state pulse to `.wsp-pulse__dot` for the **one** event
type specified: a driver assignment starting. `buildPulseMarks()` in
`js/widgets/executive/index.js` now flags `active: it.groupKey ===
'assignment_started'` — `groupKey` is the raw audit-log action string
already computed by `todaysStoryItems()`/`AUDIT_TIMELINE_ALLOW`, so this
reuses existing data with zero new queries or engines. No other event type
(completed, cancelled, requests, technical events) receives the
treatment — verified with a fixture containing both an
`assignment_started` and an `assignment_completed` event: only the former
got the `wsp-pulse__dot--active` class.

**Implementation**: a new `::before` pseudo-element (the existing
`::after` — the dot's static halo — and the dot's own one-time entrance
animation are both untouched, avoiding any risk of interfering with
already-working behavior). `transform`/`opacity` only (compositor-
friendly; no `filter`/`blur`/`box-shadow` animation, per the explicit
instruction). `background: inherit` reads the dot's own already-resolved
tone color (`--accent`/`--wsp-intel`/`--wsp-warn`, whichever domain the
mark belongs to) — the pulse is never a new or arbitrary color, and is
automatically correct in both themes for free, since it's the same color
value the dot itself already resolves per theme. 2.6s cycle, low peak
opacity (0.5, fading to 0) — slow and subtle, not alarm-like.

**Accessibility**: the dot's `aria-label` gains a plain-language "(dimulai)"
suffix for active events, so the state is conveyed to screen readers, not
just visually.

**Reduced motion**: verified via `getComputedStyle` under
`prefers-reduced-motion: reduce` emulation — `animation-name` resolves to
`none` and a static, non-animating ring remains visible (`opacity: .32`,
fixed `scale(1.3)`) rather than disappearing entirely, matching "retain a
static active-state indicator." Same guard duplicated for `[data-anim="off"]`.

**Multiple simultaneous active dots**: each pulse is an independent,
small, GPU-composited layer (transform+opacity only) — several pulsing
dots on the same day's timeline cost very little relative to one, since
none of them trigger layout or paint-heavy recalculation.

## 8. Theme-transition root cause (deep audit)

Phase 7G.3 had already established, via real tracing, that style
recalculation (not layout, paint, compositing, or JS) was the dominant
cost, driven by `html.theme-anim *` — a universal selector. This phase's
job was to determine whether narrowing that selector would help, per the
brief's explicit instruction to investigate deeper rather than shorten
the duration again.

Measured the real app's DOM composition (`document.querySelectorAll('*')`
on the live page): **1978 total elements**, of which:
- 95 (4.8%) are SVG shape/container internals (`path`, `circle`, `rect`,
  `g`, `use`, etc.) — none of `background-color`/`border-color`/`color`/
  `box-shadow` apply to how these paint; icon recoloring already works via
  `fill="currentColor"` tracking an ancestor's `color` live, needing no
  transition of its own.
- 195 `<option>` elements (date pickers, vehicle/driver/status selects
  across every workspace) — only rendered by native OS/browser dropdown
  chrome while open, invisible the rest of the time.
- 26 `<link>`/`<meta>` elements — never have a visual box at all.

Combined, ~16% (316/1978) of everything `*` matches falls into element
types that are structurally incapable of needing this transition,
regardless of what content the app has — not a guess about which
*components* matter, a fact about these *tag types*.

## 9. Theme-transition fix — tried, measured, and the honest result

Implemented `html.theme-anim *:not(path, circle, rect, ..., option, link,
meta, title, script, style)` in place of the bare `*`, applied
consistently across the transition rule, the reduced-motion override, and
the `[data-anim="off"]` override.

**Then ran a controlled A/B comparison — same session, same machine, same
interaction, 3 real Chrome traces (`page.tracing`) per side:**

| | Style recalc | Long tasks |
|---|---|---|
| Narrowed selector (3 runs) | 290–305ms / 13–14 events | 2 tasks, ~170ms + ~55–65ms |
| Reverted to plain `*` (3 runs, same session) | 297–308ms / 14–15 events | 2–3 tasks, ~160–180ms + ~55–65ms |

**No reproducible difference.** The two sets of numbers are
indistinguishable within normal run-to-run noise. The hypothesis that
narrowing the selector would meaningfully reduce recalculation cost did
**not** hold up under measurement — Chrome's recalculation cost here
appears to be driven by walking the invalidation scope triggered by
toggling the `.theme-anim` class on `<html>` (an ancestor of literally
everything), not by how many elements the transition-property selector
itself ends up matching.

**Decision, per the brief's own explicit condition** ("if profiling
confirms it... replace it... only if safe"): profiling did **not**
confirm a benefit, so the selector was **reverted to the original, simpler
`html.theme-anim *`** rather than keep the added `:not(...)` complexity
for a measured non-improvement. The finding itself is documented in
`platform.css`'s own comment at the rule, so this specific hypothesis
isn't silently re-attempted in a future pass without new evidence. This is
exactly the brief's own "MEASURED vs INFERRED" discipline applied to an
optimization attempt, not just to a claim: it was inferred (theoretically
sound reasoning) → tried → measured → found ineffective → reverted, rather
than kept on the strength of the reasoning alone.

No further duration change was made this round (already trimmed in
7G.3), per the explicit "do NOT simply shorten the animation again"
instruction — the deep audit was the actual ask, and it was performed
and its result reported honestly, including the negative one.

## 10. Before/after performance metrics

Phase 7G.3 baseline (measured previously, different session):
**52 events / 420ms** (before 7G.3's own duration fix) →
**14 events / 300ms** (after 7G.3).

Phase 7G.4, measured fresh in this session (both sides, same session):
**13–15 events / 290–308ms**, materially unchanged from the 7G.3
end-state — consistent with the fact that this round's net CSS change to
the transition rule is zero (tried a narrower selector, measured it,
reverted it). The dominant remaining cost (the 2–3 long tasks per toggle,
~55–180ms each) is understood to be inherent to the `.theme-anim`
class-toggle's invalidation walk over the DOM subtree, not to selector
breadth — see §9's negative result for the evidence.

## 11. Responsive verification

375 / 390 / 402 / 430 / 1194 / 1440, light and dark — **12 combinations,
zero horizontal overflow** in every one (`document.documentElement.
scrollWidth <= clientWidth` asserted programmatically), zero console/page
errors. Login screen additionally screenshotted at 375px and 1440px,
both themes — the simplified card (no subtitle, no toggle) reads clean
and correctly spaced at every size checked.

## 12. Authentication regression verification

- **Explicit logout**: code path re-read in full; unaffected by this
  round's changes other than the added diagnostic line.
- **Remember Me removal**: confirmed via real render that
  `#loginRememberMe` no longer exists in the DOM, login submits correctly
  without it, and the form's `alsoDisable`/`operation` calls no longer
  reference it (`node --check` + a real page load, zero console errors).
- **The core recheck fix**: measured via the real-code simulation in §4
  (scenarios A/B/C) — this is the primary auth-behavior verification for
  this round.
- **What remains genuinely INFERRED, not measured**: an actual
  authenticated login against production Firebase, followed by a real
  page reload / browser restart, confirming the session survives exactly
  as `browserLocalPersistence` promises. This requires real credentials
  this session does not have — the same documented constraint as every
  prior real-browser pass in this program. The SDK contract itself
  (`setPersistence` + default `browserLocalPersistence` behavior) is
  Firebase's own well-documented behavior, not this app's own code, which
  is why the fix's own control-flow logic (§4) rather than the SDK's
  internal behavior was what needed direct verification here.

## 13. Full test-suite result

All 11 existing verification scripts re-run after every batch of changes
this round: **605/605 passed, 0 failed**, with zero assertions weakened,
loosened, or deleted.

## 14. Files changed

- `index.html` — removed the Remember Me toggle markup and the login
  subtitle paragraph.
- `js/auth.js` — removed `rememberMe` threading through `login()`/
  `loginViaFirebase()`/`handleLoginSubmit()`; added one diagnostic log
  line to `logout()`.
- `js/firebase.js` — `signInWithToken()` simplified to always use
  `browserLocalPersistence`; `initFirebaseAuthLayer()` gained the
  null-after-authenticated recheck logic and `[auth-diag]` logging;
  removed the now-unused `browserSessionPersistence` import.
- `platform.css` — removed `.login-remember`; grew `.login-card h2`'s
  bottom margin from 5px to 24px; theme-transition selector experiment
  attempted and reverted (documented in place, net change is the comment
  only).
- `js/widgets/executive/index.js` — `buildPulseMarks()` now flags
  `active` marks; the dot-rendering template adds the
  `wsp-pulse__dot--active` class and an aria-label suffix for those marks.
- `js/workspace/workspace-styles.js` — new `.wsp-pulse__dot--active::before`
  rule (the pulse ring), `@keyframes wspAssignmentPulse`, and matching
  reduced-motion/`data-anim="off"` guards.
- `js/app.js` — unchanged this round (7G.3's duration-matching timeout
  value was already correct; no further change needed since the CSS
  duration itself didn't change).

## 15. Remaining limitations

- The auth fix's control-flow was verified by executing the real,
  unmodified code against a faithful local stand-in for the Firebase Auth
  SDK's `onAuthStateChanged` contract — not against production Firebase
  itself. If the real intermittent logout the user reported has a root
  cause OUTSIDE the pattern this fix targets (e.g., a genuine server-side
  session revocation, or a Firebase project-level configuration issue),
  this fix would not address it — the `[auth-diag]` logging is specifically
  there to capture that evidence on the next real occurrence.
- The 8-second `authReady()` boot-time race (§2) was reviewed but not
  modified — no evidence tied it to the reported issue, and it already
  degrades gracefully.

## 16. Deferred work

- Any further theme-transition optimization beyond the duration change
  (7G.3) and the now-reverted, measured-ineffective selector narrowing
  (7G.4, §9) is deferred pending a different hypothesis — the two most
  accessible levers have both been tried and measured. A next step, if
  pursued later, would need to profile what specifically happens during
  Chrome's invalidation walk (e.g., via the Performance panel's "Recalculate
  Style" event detail, not just aggregate duration) rather than guess at
  another selector change.
- No further work was deferred on the auth fix, Remember Me removal, login
  copy, or timeline pulse — each was completed and verified to the extent
  possible without production credentials.

---

Nothing committed, pushed, or deployed. All Phase 7 (7A–7G.4) work remains
uncommitted working-tree changes, awaiting explicit review.
