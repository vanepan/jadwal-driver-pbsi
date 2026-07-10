# Phase 11 — Production UX Stabilization & Navigation Consistency
### Full Report — Sub-Phases 11A–11H

Status: implemented, **not committed, not pushed**. Base app version at time of work: `1.23.0` (`js/config.js`, unchanged — this pass did not bump the version).

Files touched: `js/app.js`, `js/workspace/home-router.js`, `style.css`, `platform.css`.

This was a bug-fix/hardening pass, not a redesign — every change below traces to a concrete, file-and-line-verified root cause found via code audit, not a stylistic rewrite. Scope and root causes were established via 6 parallel code-audit passes before any code changed: theme/color system, navigation/drawer, profile menu, Executive lifecycle, mobile safe-area, and workspace isolation (11H, added mid-flight as a critical addition).

---

## 11A — Dark / Light Theme Audit

**Root cause:** `style.css`'s legacy v1 tokens (`--text-muted`, `--gray-1..4`, `--dark`, `--white`) were never remapped anywhere in `platform.css`'s `[data-theme="dark"]` block. Only one component (`#v2TimelineSurface`) had an ad hoc scoped patch. Everywhere else, dark mode silently fell back to light-mode token values — the "white-trap": legacy-token cards/badges/borders rendered as light islands inside an otherwise-dark UI. Separately, 9 hardcoded-hex badge selectors (`.role-badge[data-role=*]`, `.badge-aktif`, `.badge-selesai`, `.badge-status--*`) had no dark counterpart at all.

**Fixed:**
- Added a global `[data-theme="dark"]` remap in `platform.css` for `--gray-1/2/3/4` → `--surface-2`/`--border`/`--border-strong`/`--muted`, and `--text-muted` → `--muted`. This generalizes the one-off `#v2TimelineSurface` fix to every consumer app-wide (51 usages in `style.css`, 25 in `platform.css`).
- Added `[data-theme="dark"]` overrides for all 9 badge selectors in `style.css`, mapped onto the same info/ok/warn/danger families `platform.css` already uses elsewhere in dark mode, plus two new desaturated pairs (yellow for `pending`, purple for `completed`/`selesai`) since no existing dark token covered those hues.

**Deliberately not touched — a real dual-use conflict, not an oversight:** `--dark`, `--dark-2`, `--dark-3`, and `--white` are used for **two conflicting purposes** in `style.css`. `--dark` is both `.sidebar`'s intentionally-always-dark background (2 usages) *and* the color of ~28 separate text rules. `--white` is both "card surface" background (~30 usages) *and* "text on a colored badge/button." A blind global remap of either would fix one usage and break the other into a literal invisible-text regression — objectively worse than today's visual-inconsistency bug. This is listed under Remaining Findings, not guessed at blind, per your direction to keep this pass targeted rather than a full sweep.

**Also confirmed, not touched (per your explicit scope decision):** the 4 parallel CSS token vocabularies (root v2 in `platform.css`, `.v2-analytics-claude`, `.eng-root`, `.pc-root`) remain separate systems — merging them is an architecture-level change, out of scope for a hardening pass. Spot-checked `.v2-analytics-claude`'s dark block (`platform.css:11013-11049`) and found it complete and correctly contrasted — no fix needed there. ~700 other hardcoded hex literals app-wide were left as-is (explicitly out of scope).

---

## 11B — Profile Entry Consistency

**Root cause:** `#v2TopbarAvatar` (`js/app.js`, built inside `initV2Topbar()`) was a plain `<span>` with `aria-hidden="true"` and **zero event listeners anywhere in the codebase** — a genuinely dead element. Its CSS (`platform.css`) explicitly set `cursor: default`, confirming it was never wired to be interactive. Meanwhile a working, reusable entry point already existed: `openProfileModal()` (`js/admin.js`), already consumed by the sidebar `#btnProfile` button, the rail-footer avatar's dropdown menu (`#v2FooterMenuProfil`, which does `document.getElementById('btnProfile')?.click()`), and the mobile bottom-nav `openProfile` action.

**Fixed:** attached a click handler to `#v2TopbarAvatar` that calls the exact same `document.getElementById('btnProfile')?.click()` pattern the footer menu already uses — no new modal, no new code path. Also added keyboard support (`Enter`/`Space`) and swapped `aria-hidden="true"` for `role="button"` / `tabindex="0"` / `aria-label="Buka menu profil"`, and CSS `cursor: default` → `cursor: pointer` plus a `:focus-visible` outline, since the element is now genuinely interactive.

---

## 11C — Drawer Gesture Polish

**Correction to the original brief:** the alleged `translateX(-20%)`/`-40%` partial-visibility bug **does not exist** in the current code — the drawer already rests fully off-screen at `translateX(-240px)` (`style.css`), equivalent to -100% of its own width.

**Real bug found:** the `touchend` handler (`js/app.js`) cleared the inline drag `transform`/`transition` **in the same synchronous tick as** the `sidebar-open` class toggle. Clearing the inline transform before/alongside the class change removes the CSS transition's "from" paint frame (the actual drag position), which can make the drawer snap to rest instead of animating continuously from where the user's finger released it.

**Fixed:** reordered so the class toggle (open/close commit, or leaving the class as-is for a spring-back) happens first — while the inline drag styles are still fully in control, so the class change is invisible at that instant — then the inline `transform`/`transition` overrides are released one `requestAnimationFrame` later. This guarantees the browser has a real painted "before" frame (the drag position) to interpolate from via the CSS class's transition. Verified by tracing all four cases (fast swipe, slow drag, cancel/spring-back, open vs. close) through the new logic — actual gesture *feel* could not be verified live (no browser in this environment).

---

## 11D — Executive Operational Header Persistence

**Symptom:** the Operational KPI strip above Executive Briefing appeared after a hard refresh but disappeared after navigating away and back.

**Investigation:** traced the full render pipeline — `renderHomeWorkspace()` → `renderHome()` (`js/workspace/home-router.js`) → `renderShell()` → `loadWorkspaceWidgets()` (lazy ES module imports) → `mountWidgets()`. This pipeline was found structurally sound under static analysis; no single deterministic "skipped container" line could be confirmed as the trigger. The most plausible mechanism identified: `renderHome()`'s completion path had **no visibility/staleness guard** — unlike its sibling `refreshHomeWorkspace()`, which explicitly checks `liveHost.style.display === 'none'` before writing. A resolved-but-superseded widget load could, in principle, write into a hidden or no-longer-active host.

**Fixed (defensive hardening, not a guessed patch):**
- `renderHome()`'s completion path (`js/workspace/home-router.js`) now checks `host.style.display === 'none'` before mounting, mirroring the guard `refreshHomeWorkspace()` already had.
- `setWorkspace()` (`js/app.js`) now invalidates the Home host's render token (`homeWs.__wspToken`) whenever the user navigates away from Home, guaranteeing any in-flight widget-load promise resolves to a no-op rather than writing into an inactive host.

This is reported honestly as defensive hardening of a confirmed gap, not a 100%-confirmed fix of the exact original trigger — see 11H below for a **second, independently-discovered and confirmed** cause of strip-related symptoms found in a follow-up investigation.

---

## 11E — Bottom Navigation Safe Area

**Root cause:** `style.css`, inside a `@media (max-width: 600px)` block, set `.main-content { padding: 10px 8px 32px; }` — a 3-value shorthand that silently overwrote the safe-area-aware `padding-bottom: var(--mobile-safe-bottom)` rule set one breakpoint block above it (`--mobile-safe-bottom` resolves to `calc(136px + env(safe-area-inset-bottom))`). Both media queries match on phones ≤600px; source order made the flat `32px` win, so nearly every workspace (Driver, Engineering, Petty Cash, Executive, Settings) under-cleared the bottom nav + FAB + home indicator on small phones.

**Fixed:** changed the ≤600px rule to longhand `padding-top`/`padding-left`/`padding-right` only, leaving `padding-bottom` owned entirely by the safe-area-aware rule.

**Also checked, left unchanged:**
- `.modal-box` has no explicit bottom safe-area padding (unlike `.modal-body`, which does) — confirmed its action row doesn't currently sit flush with the viewport edge, so left as-is rather than changed blind; listed under Remaining Findings.
- `--workspace-pad-bottom` (34–44px), a second content-geometry token used by Engineering/Petty Cash content, adds modest extra whitespace on top of the now-correct `.main-content` padding. This is additive spacing, not a hidden-content bug — left alone without live verification.

---

## 11F — Navigation State Synchronization

**Root cause:** `setBottomNavActive()` (`js/app.js`) had exactly two call sites — the bottom nav's own click handler and a login/logout reset — never any of the ~10 sidebar/rail route functions (`navHome`, `navDriverTimeline`, `navEngDashboard`, etc.). Navigating via sidebar/drawer/deep-link correctly updated the rail highlight and header title but left the bottom-nav tab stale.

**Fixed (centralized, per your decision):** added `syncBottomNavAction(action, fallbackAction)`, a single helper that resolves "what should be highlighted" from the current role's `BOTTOM_NAV_ITEMS` registry (the same join key `renderBottomNav()` already uses), falling back to a secondary action (typically the "Lainnya" sheet) for destinations with no dedicated tab, and clearing rather than leaving a wrong tab lit when neither matches. Wired in at two levels:
- **Module level**, inside `setRailModule()` — the single chokepoint every rail click, `restoreNavState()`, and each module's `def.land()` chain already funnels through — via a small `RAIL_MODULE_BOTTOM_NAV_ACTION` lookup.
- **Screen level**, inside the route functions that bypass `setRailModule()` for sub-navigation within an already-active module: `navHome`, `navJadwalDriver`, `navPending`, `navJadwalSaya`, `navDriverHistory`, `navEngineering` (screen-aware), and `setDashboardView` (view-aware — this also means the in-page Timeline/List toggle now keeps the bottom nav in sync as a side benefit).

**Not touched:** the two-parallel-title-source situation (`MODULE_DEFS` vs. `WORKSPACES` both independently defining title/subtitle for the same modules) — structural, out of scope; listed under Remaining Findings.

---

## 11G — General UX Consistency Audit

Scoped as a light-touch, opportunistic pass rather than an exhaustive sweep, per the explicit restriction against unbounded scope creep in a stabilization phase.

**Fixed:** `.modal-overlay`'s entrance animation (`style.css`) used a hardcoded `0.15s ease` instead of the app's shared motion tokens (`--motion-fast`, `--ease-standard`) introduced later in the project's history — found incidentally while working in the same file area. Updated to `animation: fadeIn var(--motion-fast, 0.15s) var(--ease-standard, ease);` for consistency with every other animated surface.

No exhaustive sweep of charts/tables/forms/every workspace was performed — anything beyond the above is listed under Remaining Findings for a future triage pass.

---

## 11H — Workspace Isolation Audit (Critical)

Added mid-sprint at your direction as a critical addition, reframing 11D's investigation around a broader question: can one workspace's UI leak into another's?

### Finding 1 — structural isolation gaps (fixed defensively)

`setWorkspace()` (`js/app.js`) was found to be **pure `style.display` toggling** across 10 sibling workspace containers — nothing is ever truly unmounted, and there is no shared `mount()/unmount()` lifecycle contract across workspaces (each implements its own bespoke show/hide pattern, or none at all). Two concrete gaps were fixed:
- **Home's render lifecycle** — see 11D above (visibility guard + token invalidation on nav-away).
- **Modal leakage** — all 8+ modals in this app are permanent `document.body` nodes (built once at init, toggled via inline `style.display`), never scoped to any workspace container, and `setWorkspace()` never swept them. A modal opened in workspace A could remain attached/visible after switching to B. Fixed by adding `sweepOpenModalsOnWorkspaceChange()`, called at the top of every `setWorkspace()` invocation — it finds every `.modal-overlay` currently not `display:none` and hides it, reusing the exact same display-toggle every modal's own `close*Modal()` function already performs (no new modal system, no business-logic side effects).

**Deliberately left as-is:** Engineering/Petty Cash's existing "hide but retain state behind `display:none`" pattern (`closeEngineering()` is a documented no-op; `closePettyCashCenter()` pauses live refresh but keeps state) — this is not a *visible* leak, and changing it would touch state-retention/business logic, out of scope. Also left alone: a dead `analyticsExecMounted` flag/branch in `app.js` (never set `true` anywhere in the codebase — the workspace it guards was retired in v1.18.8); harmless dead code, not a bug.

Retrofitting a full shared `mount()/unmount()` contract across all 10 workspace containers was explicitly out of scope (an architecture change) — the fixes above close the two concrete, confirmed gaps without it.

### Finding 2 — the actual "strip leaking into Executive" bug (confirmed and fixed)

After the initial 11A–11H pass, you reported: **the Operational strip that belongs to Driver Operations was still appearing on Executive Command Center.** This is a distinct bug from 11D's Home-strip-disappearing symptom, and traced to a clean, confirmed root cause:

`renderKPIStrip()` (`js/app.js`) — which paints the Driver Operations KPI/Operational strip (`#v2KpiStrip`) — unconditionally set `strip.style.display = 'grid'` on every call, with **no check for which workspace was currently active**. It is called correctly from `setWorkspace()` when landing on the `'dashboard'` (Driver Ops) workspace, but it is *also* called from:
- `updateAllModules()` — fires on **every live Firebase data change**, regardless of which workspace is currently on screen;
- `updatePermissionUI()` — fires on login/permission refresh.

Neither caller checked the active workspace before invoking it. Net effect: an admin/executive viewing Executive Command Center would see the Driver Ops strip silently re-appear the moment any background data update occurred (e.g. an assignment status change), because `renderKPIStrip()` force-showed it regardless of context — a textbook cross-workspace leak, exactly the class of bug this audit was designed to catch.

**Fixed:** added a `currentWorkspace !== 'dashboard'` condition to `renderKPIStrip()`'s existing hide-guard (it already had `!currentUser || isDriver() || !canAccessModule('driverops')`), so the strip only ever renders visible when Driver Operations is genuinely the active workspace — regardless of which caller triggered the render. Verified `setWorkspace()` already sets `currentWorkspace` *before* calling `renderKPIStrip()` on the legitimate landing path, so normal Driver Ops navigation is unaffected.

**Known residual, not fixed:** at login, `updatePermissionUI()` can call `renderKPIStrip()` before the landing navigation has set `currentWorkspace` to the role's actual destination (module-level default is `'dashboard'`), causing a brief flash for non-driver-ops landing roles. This self-corrects the instant the subsequent `navHome()`/`setRailModule()` call runs and is not a persistent leak — left alone rather than adding extra sequencing complexity for a sub-frame flash that couldn't be verified live either way.

---

## Files Modified

- **`js/app.js`** — topbar avatar click handler (11B); drawer touchend reorder (11C); bottom-nav sync helper + 7 call sites (11F); modal sweep + Home token invalidation (11D/11H); `renderKPIStrip()` workspace guard (11H).
- **`js/workspace/home-router.js`** — visibility guard on `renderHome()`'s completion path (11D).
- **`style.css`** — dark-mode badge overrides (11A); safe-area padding fix (11E); motion-token fix on modal fade-in (11G).
- **`platform.css`** — legacy v1 token bridge in `[data-theme="dark"]` (11A); topbar avatar cursor/focus styling (11B).

## Verification Performed

- `node --check` on both modified JS files after every round of edits — no syntax errors.
- Brace-balance check on both modified CSS files — balanced.
- Manual re-read of every modified function/rule in context to confirm each change is minimal and scoped to its stated fix.
- Line-by-line trace of the Home nav-away → back sequence, and of `renderKPIStrip()`'s three call sites, through the new guards.
- Grep-verified every existing `nav*`/`setDashboardView`/`setRailModule` route function that needed a bottom-nav sync call now has one.
- **Not performed:** live/visual verification in an actual browser (light+dark, mobile+desktop, gesture feel, animation timing, the KPI-strip fix under a real live-data event). No browser is available in this environment — this should be verified before shipping, particularly the drawer feel, dark-mode contrast, and the KPI-strip fix under an actual Firebase data change while on Executive.

## Regression Analysis

Highest-risk changes, in order:
1. **Theme token remap (11A)** — mitigated by explicitly *not* touching the dual-use `--dark`/`--white` tokens after discovering the conflict; only single-purpose tokens were remapped.
2. **Modal sweep (11H)** — could theoretically close a modal a fraction of a second before an in-progress action's own close call would have anyway; no code path found where this would discard unsaved state, since every modal open re-`reset()`s its form.
3. **`renderKPIStrip()` workspace guard (11H)** — low risk; the added condition only *adds* a hide case, and the legitimate show path (`setWorkspace('dashboard')`) was verified to set `currentWorkspace` before calling it.
4. **Bottom-nav sync fallback logic (11F)** — worst case for an unmapped action is "no tab highlighted," never a wrong tab highlighted.
5. **Drawer rAF deferral (11C)** — adds one frame of latency to the inline-style cleanup, imperceptible and strictly safer than the previous same-tick clear.

## Remaining Findings (not fixed, out of scope this pass)

- `--dark`/`--dark-2`/`--dark-3`/`--white` dual-use conflict (background vs. text) — needs a token split before dark mode can be completed for the ~28+ text usages of `--dark`.
- 4 parallel CSS token vocabularies remain unmerged (architecture-level, out of scope per your direction).
- ~700 other hardcoded hex literals app-wide (out of scope per your direction).
- `MODULE_DEFS` vs `WORKSPACES` — two parallel title/subtitle sources for the same modules (structural, out of scope).
- Dead `analyticsExecMounted` flag/branch — harmless, candidate for a future cleanup pass.
- No shared `mount()/unmount()` lifecycle contract across the 10 workspace containers — the fixes here close the specific reproducible gaps without retrofitting a full contract (an architecture change).
- `.modal-box` has no explicit bottom safe-area padding — confirmed not currently causing an overlap, left unchanged.
- `--workspace-pad-bottom` on Engineering/Petty Cash adds modest extra whitespace on top of the corrected safe-area padding — cosmetic only.
- Brief login-time KPI-strip flash for non-Driver-Ops-landing roles (see 11H, Finding 2) — self-corrects within one navigation call, not a persistent leak.

## Rollback Strategy

All changes are isolated to 4 files with no schema/data/Firebase impact. `git diff` / `git checkout -- js/app.js js/workspace/home-router.js style.css platform.css` fully reverts. No feature flags were introduced since every change is a direct bug fix to existing, always-on behavior.

## Recommended Git Commit

Not committed, per instructions. Suggested message when ready:

```
fix(ux): Phase 11 production stabilization — theme, nav sync, drawer, safe-area, isolation

- Dark-mode remap for legacy v1 tokens (--gray-1..4, --text-muted) and badge colors
- Universal profile entry: wire the dead topbar avatar to the existing profile modal
- Fix drawer touchend snap/flash by deferring inline-style cleanup one frame
- Centralize bottom-nav highlight sync across all sidebar/rail route functions
- Fix safe-area padding clobbered by a mobile breakpoint shorthand
- Harden Home workspace render lifecycle + sweep leaked modals on workspace change
- Fix Driver Ops KPI strip leaking into Executive on live data refresh
```
