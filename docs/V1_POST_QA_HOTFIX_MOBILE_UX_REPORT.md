# V1 POST-QA HOTFIX — Mobile UX, Drawer, Focus & Navigation

**Status:** Implementation complete. Hostile review + targeted regression done.
**NOT committed, NOT pushed, NOT deployed.** `js/config.js` / `APP_VERSION`,
`version.json`, `service-worker.js`, `index.html`, `database.rules.json`, Cloud
Functions, `js/components/drawer.js`, `js/shell/domain-shell.js`, the permission
engine, and the navigation architecture were **not touched**.

**Base:** clean `main` @ `7f22a82` (v1.30.12.0 — Design System Program V1 Final).

---

## 1. Executive Summary

All six issues investigated against the real implementation in headless
Chromium (real render pipeline, real `getBoundingClientRect()` / computed
style / focus assertions). Result:

| Issue | Verdict | Fix |
|---|---|---|
| **A** — mobile console/warning flood | **EXTERNAL / NOT AN APP BUG** | none (classified; genuine app output is one-time boot logs + one expected pre-auth Firebase line) |
| **B** — "Hari Ini" header overlap on mobile | **FIXED** | `platform.css` — raise the header two-row breakpoint `380px → 430px` |
| **C** — mobile side menu doesn't close after module nav | **FIXED** | `js/app.js` — add `.domshell-rail-item, .domshell-tab` to the delegated mobile close handler |
| **D** — Assignment Detail drawer clipped on mobile | **PARTIAL — superseded.** `dvh` fix kept, but a follow-up pass found the dominant causes were the accordion's `max-height: 700px` cap and flex-shrink squeezing every `.drawer__body` child. See `docs/V1_HOTFIX_ASSIGNMENT_DETAIL_MOBILE_SCROLL_REPORT.md` (fully real-browser verified). | `platform.css` — canonical drawer mobile bottom-sheet uses `dvh` not `vh` (this report) **+ `style.css` accordion grid animation, `platform.css` `.drawer__body > * { flex-shrink: 0 }`** (follow-up report) |
| **E** — Petty Cash Add Expense keyboard/tab order | **FIXED** | `js/petty-cash/petty-cash-center.js` — add openDrawer()-style focus lifecycle (initial focus → `Tanggal`, trap, Escape, restore) |
| **F** — side-menu label reveal feels abrupt | **FIXED** | `platform.css` — coordinate the rail label fade with the width expansion (same duration + 100 ms dwell) |

Three production files changed (`js/app.js`, `js/petty-cash/petty-cash-center.js`,
`platform.css`) — **147 insertions, 13 deletions**, every hunk small and
matching an established in-file pattern. One new test harness
(`scratch/hotfix-mobile-ux-verify.mjs`). No new production files, no HTML, no
version bump, no security-boundary change.

Regression: **28 existing suites re-run, ~1,150 individual checks, all green**
(list in §6). New consolidated harness: **43/43**.

---

## 2. Issue-by-Issue Findings

| ID | Issue | Root Cause | Severity | Fix | Verification | Status |
|---|---|---|---|---|---|---|
| **A** | Mobile DevTools shows `MaxListenersExceededWarning`, MetaMask connection errors, repeated stream-reset messages, plus app init logs. | `MaxListenersExceededWarning` is a **Node.js `events` module** warning — it cannot originate from this app: `grep -rn "EventEmitter\|require('events')\|from 'events'\|setMaxListeners" js/` → **0 hits**; `grep -rn "metamask\|ethereum\|web3\|inpage" js/ index.html` → **0 hits**. The app is vanilla-DOM + Firebase, no `events` polyfill anywhere. MetaMask's `inpage.js` bundles the `events` npm polyfill and calls `setMaxListeners`; the warning + the "stream reset" / "Lost connection to MetaMask" lines are the extension's provider retrying against its own service worker. A **clean headless boot (no extensions)** shows **zero** of those lines (see §3). The remaining screenshot noise is (a) the app's own one-time `X module loaded` / `[VSM-*] …` breadcrumbs — informational `console.info`/`console.log`, not errors, not a growing flood; (b) one `console.error` "Fetch Firebase data gagal: Permission denied" that is **expected** on the pre-auth window (RTDB deny-by-default rejects the first read before login; `smoke-boot.mjs` documents this as expected). | P3 (perception) | **None.** Modifying app code to suppress an extension's warning is explicitly out of scope, and the real app output is legitimate diagnostic logging (removing it = unrelated cleanup, also out of scope). | **STATIC + real-browser (clean vs. normal) VERIFIED** — code grep + headless clean-boot console capture. | **EXTERNAL / NOT AN APP BUG** |
| **B** | On phones the `Hari Ini` button collides with the hamburger and the date arrows collide with the profile avatar (reported at 390 px). | The mobile topbar grid has a single-row template `"ham \| dnav \| avatar"` for ≤ 600 px and a non-stranding two-row fallback (`"ham avatar" / "dnav dnav"`) only for **≤ 380 px**. A real-browser geometry sweep (measuring the actual `.pbsi-datepicker` trigger, not the hidden `#filterDate`) shows `.date-nav`'s intrinsic content is ~293 px, but in the single-row grid its track is squeezed to **274 px @ 381 px … 293 px @ 400 px**. `.date-nav` is `flex-shrink:0` with all children already at min-width, so the content overflows the pill: `firstKidPokeLeft` / `lastKidPokeRight` measured **+9 px @ 381 px, +5 px @ 390 px** — "Hari Ini" pokes left into the 6 px gap to the hamburger, the next-arrow pokes right into the 6 px gap to the avatar → visible collision. The 381–~410 px band is un-covered by either template. | **P2** | `platform.css` — change the two-row grid media query from `@media (max-width: 380px)` to `@media (max-width: 430px)`. Every tested phone width then uses the already-existing, already-QA'd non-stranding two-row layout where `.date-nav` gets its own full-width row (content-overflow **0**, ≥ 5 px slack down to 320 px). 431–600 px keeps the compact single row, where the sweep measured **15–100 px** of slack. No new layout, no negative margins, nothing hidden. | **VERIFIED** — headless sweep at 320/360/375/380/381/390/400/414/430/431/436/440/450/460/475/480/540/600/768/1024/1440: zero control-pair bounding-box intersection, zero horizontal overflow, `btnToday` ≥ 40 px wide, both arrows ≥ 40 px, at every width; desktop/tablet byte-identical (rule inert > 430 px). | **FIXED** |
| **C** | Opening the mobile hamburger drawer, picking a module (Operations, Warehouse, …) navigates correctly but the drawer stays open (with its scroll-lock and backdrop). | Under the default `domainShellV1` shell, `initV2Rail()` / `initV2Panel()` are **never called** (`app.js` line ~12714: mutually exclusive with `initDomainShellV1()`), so the old `.v2-rail-item` / `.v2-panel-nav-item` classes the delegated `#sidebar` close-on-nav handler matched **never render**. The live mobile-drawer nav is `domain-shell.js`'s rail (`.domshell-rail-item`) + screen-tab strip (`.domshell-tab`), reparented into `#sidebar .sidebar-nav` by `syncResponsive()`. Neither class was in the handler's selector → no handler closed the drawer on a domain-shell nav click. (`.sidebar-nav-item` is the V1 legacy nav, hidden under this shell.) | **P2** | `js/app.js` — one hunk: add `.domshell-rail-item, .domshell-tab` to the existing delegated `sidebar.addEventListener('click', …)` selector (already guarded by `window.innerWidth >= 768` and already the pattern for the old shell's equivalents). Delegated, so it survives the rail/tab-strip's per-nav `innerHTML` re-render; `e.target.closest()` still resolves against the synchronously-detached node, and the click still bubbles to `#sidebar` (event path fixed at dispatch). Unconditional close matches the established `.sidebar-nav-item` behaviour — every *rendered* rail/tab item is a reachable destination (`renderRail()` only emits visible domains; `enterDomain` can't early-return for one), so a "failed nav" can't produce a clickable item. | **VERIFIED** — headless @ 390 px: open drawer → rail reparented into `#sidebar` confirmed → click `.domshell-rail-item` → `sidebar-open` removed, `sidebar-is-open` body-lock removed, `#sidebarOverlay` `overlay-visible` removed, navigation completed (not interrupted — it runs synchronously in the item's own handler, before this bubbles). Desktop (1280 px): rail is not in `#sidebar`, handler's width guard also blocks — no state to leak. Multi-destination path is identical code (LOGIC VERIFIED: only `today` renders pre-auth). | **FIXED** |
| **D** | Mobile Assignment Detail drawer: content below the fold clipped; Ringkasan WhatsApp / reimbursement section + action not reachable even by scrolling. | Canonical drawer mobile bottom-sheet (`platform.css`, `@media (max-width: 640px)`): `.drawer-overlay` is `position:fixed; inset:0` and `.drawer` is `height: min(86vh, 100%)`, `align-items:flex-end`. `vh` = the **large** viewport (URL bar collapsed). On a real phone with the URL/nav bar showing, `86vh` ≈ or > the *visible* height, and the sheet is anchored to the large-viewport bottom, which sits **behind the browser chrome** — so the bottom of `.drawer__body` (and everything in it: Assignment Detail renders all its actions inside the scroll body, no `.drawer__foot`) is physically below the screen edge and cannot be scrolled up, because the scroll *container's* own bottom is off-screen. | **P2** | `platform.css` — in the same `@media (max-width: 640px)` block: `.drawer-overlay { … height: 100vh; height: 100dvh; }` and `.drawer { … height: 86vh; height: min(86dvh, 100%); }`. `dvh` tracks the *visible* (dynamic) viewport, so the `flex-end` anchor becomes the real bottom edge and `86dvh` is 86 % of what's actually on screen. `100vh` / `86vh` stay as the fallback for engines without `dvh` — the exact `100vh; 100dvh` fallback idiom already used elsewhere in this file (app shell, login). Canonical-shell fix → benefits every mobile drawer consumer (Assignment Detail, Petty Cash expense detail, Engineering, Vehicle, Gudang, all admin drawers). No Assignment-specific drawer created. | **VERIFIED (no-regression, real headless)** at 320×690 / 375×667 / 390×844 / 430×932: sheet bottom within viewport, header stays visible, `.drawer__body` scrollable, an injected 50-row + LAST-action body scrolls fully into view; desktop drawer still right-docked & full-height. **LOGIC VERIFIED (the clip itself):** headless has no URL bar so `dvh == vh` — the off-screen clip only reproduces with dynamic browser chrome (no physical device in this environment, the standing constraint of every phase). CSS change is the documented standard remedy and matches the codebase's own `dvh` convention. **STATIC VERIFIED:** `dvh` + `vh` fallback both present in the mobile-sheet block. | **FIXED** (canonical shell) |
| **E** | Opening the Petty Cash "Tambah Pengeluaran" form, keyboard focus is still on the page behind — the user tabs through the whole Petty Cash screen/menu before reaching `Tanggal`; page behind stays keyboard-reachable; Escape doesn't close it. | `addModal()` is a **hand-rolled** overlay string concatenated into `shell()`'s `innerHTML` — it was **not** migrated onto `openDrawer()` in Phase 10 (only the *detail* drawer was). So it has none of the canonical drawer's focus management: no initial focus into the panel, no focus trap (the page behind's controls stay in the Tab order — headless: Tab presses 1–4 land on page buttons, only #5 reaches `Tanggal`), no Escape-to-close, no focus restore. | **P2** | `js/petty-cash/petty-cash-center.js` — add an openDrawer()-style focus lifecycle **without** migrating the modal (a separate, larger task): (1) `syncAddModalFocus()` called at the end of `render()`, purely **edge-driven** — on the closed→open edge it moves focus to `input[name="expenseDate"]`; on the open→closed edge it restores focus to the trigger (captured in `setState()` *before* the render destroys it); a re-render while open is a no-op so it never steals the caret from a field being edited. (2) `onAddModalKeydown()` bound on `document` — `Tab` / `Shift+Tab` wrap within `.pc-add-box` (natural DOM order, **no positive tabindex**) and pull focus back in if it ever escapes; `Escape` closes. Bound after `onUnitAcKeydown` so an open "Nama Unit" suggestion list consumes its own Escape/Tab first. (3) `data-focus="expenseDate"` on the date input so the existing `focusGuard` also preserves it across store-echo re-renders. | **VERIFIED** — real headless via `scratch/petty-cash-harness.html` (mounts the real module): open → `document.activeElement` **is** the `Tanggal` input; 22× Tab and 25× Shift+Tab never leave `.pc-add-box`; Escape closes and restores focus to the opener; backdrop click closes + restores; 4× repeated open/close focuses `Tanggal` every time; zero non-Firebase console errors. | **FIXED** |
| **F** | The rail's text labels "flash in" during hover-expand rather than revealing as part of the expansion. | `platform.css`: `.domshell-rail-label` (and `-brandtext`, `-usertext`) fade `opacity 0→1` on `.domshell-rail:hover` with `transition: opacity var(--motion-fast, 120ms) linear` and **no delay**, while the rail `width: 72px→220px` transition has `var(--motion-normal, 200ms)` **+ a 100 ms dwell** (Phase 8.1 hover-intent debounce). So the label is fully opaque at ~120 ms while the width transition hasn't even started (starts at 100 ms) — text appears (partly clipped by the rail's `overflow:hidden`) before the panel visibly opens. | **P3** (polish) | `platform.css` — on the `:hover` / `:focus-within` reveal rules only, override to `transition: opacity var(--motion-normal, 200ms) linear 100ms` — the **exact** duration + dwell of the width transition, so label opacity and rail width animate in lockstep. The un-hover (collapse) path keeps the base rule's quick `--motion-fast` fade ("leaving feels immediate"). `100 ms` is copied verbatim from the adjacent, pre-existing `.domshell-rail:hover { transition: width … 100ms }` — no new token, no new motion system. Applied to all three rail text elements for consistency. | **VERIFIED (rule + reduced-motion)** — computed `:hover` reveal rule = `opacity var(--motion-normal, 200ms) linear 100ms`; collapse stays `opacity 0.12s linear` (0 delay); `prefers-reduced-motion` collapses the duration to `1e-05s` (label instantly usable; the 100 ms dwell then equals the width transition's own, already-shipped reduced-motion dwell). **`verify-rail-hover-debounce.mjs` 4/4** — Phase 8.1 debounce intact (rail 72 px @ 50 ms, 220 px @ 250 ms), pointer-graze protection unchanged. Live hover *ramp* not sampled (headless `:hover` did not engage even via CDP `Input.dispatchMouseEvent`; the width/debounce suite that does engage it is unaffected by this opacity-only change). | **FIXED** |

---

## 3. Console Investigation (Issue A)

**Method:** static server + headless Chromium (Puppeteer), **no browser
extensions**, unauthenticated load, capture every `console` message + every
`pageerror`. Compared against the user's screenshot (normal dev browser, with
MetaMask).

Clean-browser capture (390 px, full boot): `info: 29, log: 21, verbose: 4,
error: 1`.

| Console message (screenshot) | Source | Application bug? | Action |
|---|---|---:|---|
| `MaxListenersExceededWarning: Possible EventEmitter memory leak detected` | **Browser extension (MetaMask `inpage.js`)** — Node `events` polyfill it bundles. App has **0** `EventEmitter`/`events`/`setMaxListeners` references (`grep`). **Absent** in the clean headless boot. | **No** | External — do not modify app code to suppress. |
| MetaMask connection errors / "Lost connection to MetaMask" | **Browser extension (MetaMask)** — provider ↔ service-worker. App has **0** `ethereum`/`web3`/`metamask`/`inpage` references. Absent clean. | **No** | External. |
| Repeated "stream reset" messages | **Browser extension (MetaMask)** — `LocalMessageDuplexStream` reconnect. Absent clean. | **No** | External. |
| `X module loaded` (×29, `console.info`) | **Application** (`js/*` module-load breadcrumbs, e.g. `Firebase module loaded`, `Form-guard module loaded`). | **No** — informational, one-time at boot, does not grow. | None — legitimate diagnostics; removing = unrelated cleanup (out of scope). |
| `[VSM-3] V2 topbar initialised …`, `[VSM-4] KPI strip injected`, … `✅ App initialized successfully` (×21, `console.log`) | **Application** — bootstrap breadcrumbs. | **No** — informational, one-time. | None (as above). |
| `[DOM] Password field is not contained in a form` / `Input elements should have autocomplete attributes` (×4, `console.verbose`) | **Browser DevTools advisory** (Chrome Issues panel). `verbose` level — hidden unless Verbose is enabled. Login form is intentionally form-less (single-field PIN flow); `verify-error-ux-names` covers its a11y. | **No** — tooling advisory, not an error. | None — pre-existing, not in scope. |
| `Fetch Firebase data gagal: Error: Permission denied` (×1, `console.error`) | **Application** — the RTDB read that fires in the pre-auth window before a session exists; deny-by-default rejects it. `smoke-boot.mjs` explicitly classifies this as expected. | **Not a defect** — transient/expected. A *persistent* post-auth permission-denied would be real; this one clears on login. | None — pre-existing, not one of the six issues; changing its log level is out of scope. |
| "Timeline-related error entries" (screenshot, exact text not legible) | Not reproduced in the clean unauthenticated boot (zero timeline errors). Most likely the same pre-auth Firebase read timing, or extension noise. | Indeterminate from the screenshot; **no app-side timeline error exists in a clean boot**. | None — provide the exact string for a targeted look if it recurs in a clean profile. |

**Conclusion:** the alarming items are 100 % browser-extension injected
(proven by code + a clean-browser capture). There is **no application
listener leak** — the canonical drawer's own `hostile-review-drawer-listener-audit.mjs`
(8/8, 10 open/close cycles → 0 net keydown listeners) and this pass's
regression run confirm it. No app code change is warranted or made.

---

## 4. Mobile Verification Matrix

Real headless Chromium. `Header` = no control-pair bounding-box intersection +
`btnToday`/arrows ≥ 40 px. `Overflow` = `documentElement.scrollWidth −
clientWidth`. Side Menu / Petty Cash / Motion measured once (viewport-independent
logic) and marked ✓ where the mechanism passed.

| Width | Header | Side Menu (Issue C) | Assignment Drawer (Issue D) | Petty Cash (Issue E) | Motion (Issue F) | Overflow |
|---|---|---|---|---|---|---|
| 320 | ✓ no collision, today 60 w, arrows 44 w | ✓ closes on nav | ✓ 320×690: bottom in-vp, body scrolls, last action reachable | ✓ focus→Tanggal, trap, Esc, restore | ✓ reveal = width timing; reduced-motion instant | 0 |
| 360 | ✓ | ✓ | — | ✓ | ✓ | 0 |
| 375 | ✓ | ✓ | ✓ 375×667: bottom in-vp, body scrolls | ✓ | ✓ | 0 |
| 390 | ✓ (was: "Hari Ini" ∩ hamburger) | ✓ (verified @ 390) | ✓ 390×844 | ✓ | ✓ | 0 |
| 414 | ✓ | ✓ | — | ✓ | ✓ | 0 |
| 430 | ✓ | ✓ | ✓ 430×932 | ✓ | ✓ | 0 |
| 431 / 436 / 440 / 450 / 475 (single-row band above the new breakpoint) | ✓ no collision, ≥ 15 px `.date-nav` slack | ✓ | — | ✓ | ✓ | 0 |
| 768 / 1024 / 1440 (tablet/desktop regression) | ✓ unchanged (rule inert > 430) | ✓ rail not in `#sidebar`, no state to leak | ✓ desktop drawer right-docked, full-height | ✓ | ✓ debounce 4/4 | 0 |

Viewport matrix suite `verify-motion-8-1-viewport-matrix.mjs`: **72/72** —
320/375/390/430/768/1024/1280/1440 × light/dark × normal / `prefers-reduced-motion` /
`data-anim=off`, zero horizontal overflow and zero fatal errors at every
combination.

---

## 5. Keyboard / Accessibility

| Aspect | Assignment / canonical drawer (Issue D) | Petty Cash Add Expense modal (Issue E) | Domain-shell rail (Issue F) |
|---|---|---|---|
| Initial focus | `.drawer__close` (`js/components/drawer.js`, unchanged) — `drawer-consolidation-check` 67/67 | **`Tanggal` input** (new) — verified, and every repeated open | n/a (nav rail) |
| Focus trap | `_trapTab()` in `drawer.js`, unchanged — `drawer-consolidation-check` 67/67, listener audit 8/8 | **New** — Tab / Shift+Tab wrap within `.pc-add-box`; 22× Tab + 25× Shift+Tab never leave the modal; escaped focus pulled back in | n/a |
| Underlying page keyboard-reachable while open? | No (trap) | **No** (trap) — was **yes** before this fix | n/a |
| Focus restoration on close | `_lastFocus` in `drawer.js`, unchanged | **New** — restored to the trigger captured before render; verified for Escape and backdrop close; `document.contains()` guard + try/catch if the trigger is gone | n/a |
| Escape | `drawer.js` `requestClose()`, unchanged | **New** — `document`-level handler; yields to an open "Nama Unit" suggestion list (which `stopPropagation`s / `preventDefault`s first) | Escape on `#sidebar` closes the hamburger drawer (`app.js`, unchanged) |
| Tab order | DOM order, unchanged | **DOM order** — Tanggal → Unit → Kategori → Jumlah → Deskripsi → Catatan → Foto → Batal → Simpan; **no positive tabindex** added; the readonly auto-total keeps its existing `tabindex="-1"` | rail buttons, unchanged |
| Reduced motion | `@media (prefers-reduced-motion){ .drawer,.drawer-overlay { transition:none } }`, unchanged | n/a | **Verified** — `style.css`'s global `transition-duration: 0.01ms !important` collapses the reveal fade to instant; the 100 ms dwell then equals the width transition's own already-shipped reduced-motion dwell. `data-anim="off"` identical. `verify-reduced-motion-gap-closure` 15/15. |
| `[data-anim="off"]` | unchanged | n/a | **Verified** — same global rule; viewport matrix `data-anim=off` column 24/24 green |

No new WCAG defect introduced. No `role="dialog"` / `aria-modal` change (the
Petty Cash modal already lacked them; adding ARIA is a larger a11y pass and out
of this hotfix's narrow scope — the functional trap + Escape + restore are the
reported gap and are fixed).

---

## 6. Regression Results

Every suite below was **actually executed** this pass (Node v24.16.0, headless
Chromium). "Firebase permission-denied noise on unauthenticated load" is
expected and excluded from fatals by each suite's own filter.

### Shell / navigation / drawer / mobile / motion
| Suite | Result |
|---|---|
| `smoke-boot.mjs` | **PASS**, 0 fatal (1 expected pre-auth `Permission denied`) |
| `mobile-first-verification-check.mjs` | **42/42** |
| `drawer-consolidation-check.mjs` | **67/67** (incl. mobile bottom-sheet @ 375/390/402/430 — 0 overflow, grabber visible, panel ≤ viewport) |
| `navigation-crossfade-check.mjs` | **53/53** |
| `bottom-nav-notif-check.mjs` | **42/42** (incl. every item non-zero width / label visible @ 430) |
| `workspace-foundation-check.mjs` | **24/24** |
| `scratch/verify-motion-8-1-viewport-matrix.mjs` | **72/72** (8 widths × 2 themes × 3 motion modes) |
| `scratch/verify-nav-crossfade-8-5.mjs` | all pass |
| `scratch/verify-command-palette-motion.mjs` | **15/15** |
| `scratch/verify-reduced-motion-gap-closure.mjs` | **15/15** |
| `scratch/verify-rail-hover-debounce.mjs` | **4/4** (Phase 8.1 hover-intent debounce intact) |
| `scratch/hostile-review-drawer-listener-audit.mjs` | **8/8** (0 net keydown listeners over 10 cycles) |
| `executive-motion-polish-check.mjs` | **16/16** |
| `motion-continuity-orchestration-check.mjs` | **28/28** |
| `motion-performance-hardening-check.mjs` | **16/16** |

### Canonical-drawer consumers (Issue D shared CSS)
| Suite | Result |
|---|---|
| `delete-confirm-drawer-check.mjs` | **16/16** |
| `admin-pin-reset-dom-check.mjs` | **39/39** |
| `role-management-edit-dom-check.mjs` | **25/25** |
| `permissions-matrix-dom-check.mjs` | **30/30** |
| `driver-wellness-dom-check.mjs` | **48/48** |
| `engineering-ui-dom-check.mjs` | **51/51** |
| `gudang-ui-check.mjs` | **178/178** |

### Petty Cash (Issue E)
| Suite | Result |
|---|---|
| `pettycash-intelligence-check.mjs` | **29/29** |
| `scratch/verify-pettycash-amount-format.mjs` | **13/13** |
| `scratch/verify-error-ux-names.mjs` | PASS |

### Operations / analytics / home (touch shared shell CSS + app.js)
| Suite | Result |
|---|---|
| `problem-first-home-dom-check.mjs` | **32/32** |
| `analytics-navigation-check.mjs` | **56/56** |
| `request-mode-polish-dom-check.mjs` | **27/27** |
| `self-drive-assignment-check.mjs` | **42/42** |
| `driver-wellness-check.mjs` | **66/66** |

### New this pass
| Suite | Result |
|---|---|
| `scratch/hotfix-mobile-ux-verify.mjs` (all six issues, one run) | **43/43** |

**Tally:** 28 existing suites + 1 new, **~1,150 individual checks, 0 failures,
0 regressions.** No assertion was weakened. No test was rewritten.

### Not re-run this pass
| Suite | Reason | Last known |
|---|---|---|
| `npm run test:rtdb-emulator` / `test:functions-emulator` | No JDK on `PATH` this session; **also not relevant** — no `database.rules.json` / `functions/` change | 20/20 · 95/95 (byte-unchanged since) |

---

## 7. Real Browser Verification

Clearly separated per evidence type:

- **VERIFIED (real headless Chromium — real render, real geometry, real
  focus/keyboard):**
  - Issue B — the header geometry sweep (21 widths), zero collisions / zero
    overflow after the fix, before-state collision reproduced at 381–390 px.
  - Issue C — open drawer → click `.domshell-rail-item` → drawer closes,
    scroll-lock + backdrop cleared, nav completed; desktop unaffected. Before-state
    reproduced (`closedAfterNav: false`).
  - Issue D — **no-regression** at 320×690 / 375×667 / 390×844 / 430×932
    (sheet within viewport, body scrolls, injected long body's last action
    reachable, header visible) + desktop drawer unchanged.
  - Issue E — via `scratch/petty-cash-harness.html` (real module mount):
    initial focus on `Tanggal`, 22×/25× Tab trap, Escape close + restore,
    backdrop close + restore, 4× repeat. Before-state reproduced (focus on
    `<body>`, 4 page controls tabbed before `Tanggal`, Escape did nothing).
  - Issue F — computed `:hover` reveal rule = `opacity 200ms linear 100ms`;
    reduced-motion collapses it to instant; `verify-rail-hover-debounce` 4/4.

- **LOGIC VERIFIED (reasoned from code + adjacent green suites, no dedicated
  device run):**
  - Issue D — the *off-screen clip itself*: headless has no URL bar so
    `dvh == vh`; the clip only reproduces with dynamic browser chrome. The
    fix is the documented standard remedy and matches this file's own
    `100vh; 100dvh` convention; no-regression + `dvh` application are verified.
  - Issue C — module destinations beyond `today` (only `today` renders
    pre-auth): identical code path.
  - Issue F — the live hover *feel* (headless `:hover` did not engage even via
    CDP synthetic mouse events); the rule change is declarative and the
    width/debounce suite that does engage `:hover` is untouched by this
    opacity-only change.

- **STATIC VERIFIED:** the git scope review (§9); `dvh` + `vh` fallback both
  present in the mobile-sheet block; `node --check` clean on both modified
  `.js` files.

- **NOT VERIFIED:** real physical device — real touch/gesture feel, real
  on-screen-keyboard viewport resize, real notched-device safe-area insets,
  authenticated cross-product click-through. The standing constraint disclosed
  in every phase of this program (no device, no Firebase credentials in this
  environment).

- **BLOCKED:** none.

---

## 8. Files Changed

### Production (3)
| File | Hunks | Lines | What |
|---|---|---|---|
| `js/app.js` | 1 (delegated `#sidebar` close handler) | +16 / −1 | Issue C — add `.domshell-rail-item, .domshell-tab` to the mobile close-on-nav selector + comment. |
| `js/petty-cash/petty-cash-center.js` | 5 (module var · `setState` · `render` + 2 new fns · `addModal()` date input · `bindDelegation`) | +84 / −3 | Issue E — Add/Edit Expense modal focus lifecycle: `syncAddModalFocus()` (edge-driven in / restore out), `onAddModalKeydown()` (Tab-trap + Escape, `document`-bound), `data-focus="expenseDate"`. |
| `platform.css` | 4 (header breakpoint · drawer mobile sheet · 3× rail label reveal) | +49 / −7 | Issue B — `@media (max-width: 380px)` → `430px` for the header two-row grid. Issue D — `.drawer-overlay` / `.drawer` mobile bottom-sheet use `dvh` with `vh` fallback. Issue F — `.domshell-rail{-label,-brandtext,-usertext}` reveal transition coordinated with the width expansion. |

**Total: 147 insertions, 13 deletions.**

### Test / tooling (1, new)
| File | What |
|---|---|
| `scratch/hotfix-mobile-ux-verify.mjs` | Consolidated headless-Chromium harness covering all six issues (43 checks). Reusable regression artifact. |

### Not changed (asserted by `git diff --stat`)
`js/config.js` / `APP_VERSION`, `version.json`, `service-worker.js`,
`index.html`, `manifest.json`, `database.rules.json`, `firebase-rules.json`,
`functions/**`, `js/components/drawer.js`, `js/shell/domain-shell.js`,
`js/firebase.js`, `js/auth.js`, `style.css`, `js/permission-service.js`,
`config/*`, any business-logic module.

---

## 9. Scope Review

- **Files touched by this pass:** exactly the 3 production files + 1 new
  scratch harness listed in §8. `git status` shows nothing else.
- **No navigation-architecture change.** The two mobile navigation systems
  (Phase 9 §4A, Phase 12 F2) were **not** merged or redesigned — Issue C only
  makes the *existing* delegated close handler aware of the shell that is
  actually live. This is a state-cleanup, not an IA change.
- **No canonical drawer rewrite.** Issue D changes two length values in one
  media block; the drawer's JS (`js/components/drawer.js`) is untouched.
- **No new motion system / token.** Issue F reuses `--motion-normal` and a
  `100 ms` value copied verbatim from the adjacent width-transition rule.
- **No business-logic change.** Issue E adds only focus/keyboard handling;
  `submitAdd`, validation, `createExpense`/`updateExpense`, the form model —
  all unchanged.
- **No security-boundary change.** `database.rules.json`, Cloud Functions,
  `permission-service.js`, `verifyPin.js`, `canAccessModule()`, reimbursement
  authorization — none opened. `smoke-boot` + `delete-confirm-drawer-check` +
  the admin DOM suites confirm no permission behaviour moved.
- **No V2 / Sarpras Intelligence work.** `js/v2/**`, `js/sarpras-*` untouched.
- **No unrelated cleanup** (e.g. the boot `console.info` breadcrumbs, the
  pre-auth Firebase `console.error`, the missing `role="dialog"` on the Petty
  Cash modal) — flagged here, deliberately left (§10).

---

## 10. Deferred Items

| Item | Why deferred | Recommended disposition |
|---|---|---|
| **Petty Cash Add Expense modal → canonical `openDrawer()` migration** | Issue E is fully fixed by adding the focus lifecycle to the existing modal. A full migration (like Phase 10's detail-drawer migration) also has to re-home the modal's live-updating regions (`unitExtraHtml` / `amountRegionHtml` patched in place) and its inline-error mechanism — a separate, larger task with real regression surface, exactly the kind Phase 12 §8 says not to take on opportunistically. | Its own follow-up pass, alongside the already-deferred Overtime drawer migration (Phase 12 §5). |
| **`role="dialog"` / `aria-modal` / `aria-labelledby` on the Petty Cash Add/Edit modal** | Out of this hotfix's narrow scope — the *reported* gap (focus lands on the page, page stays keyboard-reachable, Escape dead) is the functional trap + Escape + restore, all now fixed. Adding the ARIA semantics is a broader a11y pass. | Bundle with the canonical-drawer migration above (which brings `role="dialog"` / `aria-modal` for free). |
| **Issue D real-device confirmation** | No physical device / dynamic browser chrome in this environment (standing constraint). The `vh`→`dvh` change is the standard remedy, matches the codebase's own convention, and is no-regression-verified headless. | Confirm on a real iOS Safari + Android Chrome with the URL bar visible during the separate review step. |
| **App boot `console.info` / `console.log` breadcrumbs** (`X module loaded`, `[VSM-*] …`) | Legitimate one-time diagnostic logging present for many versions; trimming it is unrelated cleanup (§13 of the brief forbids). Not an error, does not grow, invisible at default DevTools level for `verbose`. | Optional future "reduce boot log verbosity" task — not a bug. |
| **Pre-auth `Fetch Firebase data gagal: Permission denied` logged at `error` level** | Expected transient condition (RTDB read before the session exists); `smoke-boot.mjs` treats it as expected. Downgrading it to `warn` is a judgment call outside the six issues, and a *persistent* post-auth permission-denied should still be loud. | Optional: gate the log level on "session not yet resolved" in a future pass. |
| **The two competing mobile navigation systems** (Phase 9 §4A / Phase 12 F2) | Unchanged here by design — an IA/product decision, explicitly a STOP condition. Issue C works within whichever system is live. | Its own IA phase, per the Phase 9 checkpoint. |

---

## 11. Hostile Review

**Issue A** — Could a real app listener leak hide behind the extension noise?
No: `grep` proves zero `EventEmitter`/`events` usage; the canonical drawer's
listener audit is 8/8; the clean-browser boot has zero `MaxListenersExceededWarning`.
The warning is structurally impossible to originate from this codebase.

**Issue B** — Cascade check: at ≤ 430 px the later `@media (max-width: 600px)`
block still sets `display:grid` + `height:auto`; my block only sets
`grid-template-*` + `row-gap`, so the effective layout is grid + auto-height +
two-row template — identical to the old ≤ 380 behaviour, just a wider range.
The `"search"` grid-area exists in both templates, so the "Cari Cepat" trigger
stays centred on its own row (Phase 7G.2 fix preserved). Above 431 px the
single-row band was swept (431/436/440/450/460/475): `content-overflow 0`,
`.date-nav` slack 15–38 px — no new squeeze introduced at the seam. Desktop
(> 430) is byte-identical.

**Issue C** — Bubbling-after-detach: `renderRail()` / `renderTabBar()` replace
the clicked node's parent `innerHTML` synchronously inside the item's own click
handler, *before* the event bubbles to `#sidebar`. Verified headlessly that the
delegated handler still fires and `e.target.closest('.domshell-rail-item')`
still matches the detached subtree (event path is fixed at dispatch;
`.closest()` walks detached trees). Navigation is not interrupted — it runs in
the item's own (earlier) handler; `closeSidebar()` runs after. No stale
overlay: `#sidebarOverlay` `overlay-visible` and `body.sidebar-is-open` both
cleared (verified). Desktop: the width guard *and* the fact that the
domain-shell rail is not a `#sidebar` descendant on desktop both prevent any
effect. A "failed nav" cannot yield a clickable item (rail only renders visible
domains; `enterDomain` can't early-return for one).

**Issue D** — `position:fixed; inset:0` + `height:100dvh` is over-constrained
(top + bottom + height): per spec `height` wins, `bottom` is dropped → overlay
is exactly `100dvh` from `top:0` = the visible viewport. `min(86dvh, 100%)`:
`100%` is now `100dvh`, so `86dvh` always wins — never taller than before, only
shorter (by the URL-bar height) so the footer stays on-screen. Old-engine
fallback: `height: 86vh` (first decl) applies, `min(86dvh, …)` is dropped as
invalid — the exact `100vh; 100dvh` idiom already in this file. Desktop
(≥ 641 px) is outside the media block. `.drawer__foot` safe-area padding and
`.drawer:not(:has(.drawer__foot))` safe-area padding both preserved. Swipe-to-
dismiss (translateY on touch) unaffected by height. 7 canonical-drawer-consumer
suites (delete-confirm, pin-reset, role-edit, matrix, wellness, engineering,
gudang) + `drawer-consolidation-check` 67/67 all green.

**Issue E** — `document`-bound `onAddModalKeydown` never unbinds: matches the
module's existing "permanent delegated listeners" style (`onUnitAcKeydown` on
`root` is also permanent); single listener, `st.addOpen` short-circuits when
closed → negligible. Escape precedence: `onUnitAcKeydown` is on `root` (closer
to target) and `stopPropagation()`s when it consumes an open suggestion list's
Escape, so `onAddModalKeydown` on `document` never fires in that case — modal
stays open, list closes (verified). When the list is closed, `onUnitAcKeydown`
does nothing and the event reaches `document` → modal closes. The `<input
type="date">` internal-segment Tab navigation is untouched (my handler only
acts at the true first/last of the modal). `focusGuard.restore()`'s
`setSelectionRange` on the date input throws → already caught by
focus-preserving-render.js's own try/catch (and `pending.start` is `null` for
date inputs → skipped). Edge-driven only, so a re-render while open never
steals the caret (the v1.25.3-class bug). `_addModalReturnFocus` restore is
`document.contains()`-guarded + try/catch. No positive tabindex. Backdrop
click, X, Batal, Simpan-success, sub-screen `nav` — all route through
`setState({addOpen:false…})` → restore fires (verified for backdrop + Escape).

**Issue F** — Shorthand `transition:` on the `:hover` rule fully replaces the
base (property `opacity`, timing `linear` — both same; delay `100ms` — new).
Un-hover un-matches the rule → base `--motion-fast`/0-delay fade returns
(quick collapse; verified). `:focus-within` gets the same treatment and the
width transition rule also covers `:focus-within` with the same `100ms` dwell,
so keyboard focus stays coordinated. `prefers-reduced-motion` / `data-anim=off`
zero the *duration* (global `!important` in style.css) but not the `100ms`
*delay* — which is fine and consistent: the rail-*width* transition already
carries an unneutralised `100ms` delay under those modes (shipped through
Phases 8–12), so label + width still appear together, ~instantly. `(hover:none)`
touch-tablet block forces `opacity:1` statically → my change is inert there.
No new token. `verify-rail-hover-debounce` 4/4 → Phase 8.1 pointer-graze
protection intact.

**Console (final check):** `smoke-boot` PASS 0 fatal; viewport matrix 0 fatal
across 72 combos; no promise left unhandled; no `console` filtering or
suppression added anywhere.

---

## 12. Git / Deployment

Per the brief: **nothing committed, pushed, or deployed. No history rewrite.**
Working tree = 3 modified production files + 1 new `scratch/` harness, ready for
review → commit → push. `platform.css` (Vercel auto-deploys on push) and
`js/app.js` / `js/petty-cash/petty-cash-center.js` are all Vercel-served static
assets; there is no Firebase Hosting / Functions / rules component to this
change, so a normal push is the only deploy action needed once approved.
`APP_VERSION` / `version.json` were intentionally not bumped — the reviewer
decides the version stamp at commit time (and must keep the Hosting/Vercel
version oracle in sync, per the deployment dual-surface note).

---

## 13. Definition of Done — checklist

- [x] Issue A classified (EXTERNAL); genuine app output documented, nothing suppressed.
- [x] Issue B — no control overlap across 320/360/375/390/414/430 (+ the 431–475 seam) and desktop unchanged.
- [x] Issue C — mobile side menu closes after a successful module nav; scroll-lock + backdrop cleared; nav not interrupted; desktop unaffected.
- [x] Issue D — canonical drawer no longer measures height against the large viewport on mobile; no-regression verified; clip fix logic-verified pending a device.
- [x] Issue E — `Tanggal` focused on open; focus trapped; page-behind not keyboard-reachable; Escape closes; focus restored.
- [x] Issue F — label reveal coordinated with the width expansion; reduced-motion + `data-anim=off` keep labels instantly usable; Phase 8.1 hover debounce intact.
- [x] No new horizontal overflow (viewport matrix 72/72, 8 widths × 3 motion × 2 themes).
- [x] No new console errors (`smoke-boot` PASS 0 fatal).
- [x] Existing drawer focus behaviour unchanged (`drawer-consolidation-check` 67/67, listener audit 8/8).
- [x] Existing navigation behaviour unchanged (`navigation-crossfade-check` 53/53, `bottom-nav-notif-check` 42/42).
- [x] Desktop behaviour unchanged (header rule inert > 430; drawer rule inert ≥ 641; matrix desktop columns green).
- [x] Reduced-motion + `[data-anim="off"]` correct (`verify-reduced-motion-gap-closure` 15/15; matrix columns green).
- [x] Existing regression suites green — 28 suites, ~1,150 checks, 0 failures.
- [x] Real-browser verification documented honestly (§7).
- [x] No V2 work. No Firebase / security-boundary change. Nothing committed, pushed, or deployed.

*End of report.*
