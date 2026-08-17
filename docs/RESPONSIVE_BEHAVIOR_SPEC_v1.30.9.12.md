# RESPONSIVE BEHAVIOR SPEC — Current State + Proposed Rules
**Audited at:** APP_VERSION v1.30.9.12 · 2026-08-14
**Part of the Claude Design handoff package** — see `DESIGN_BRIEF_v1.30.9.12.md`.

---

## 1. Current navigation structure (verified)

`index.html:97-244`: `<aside class="sidebar">` has three nav groups. Two (`sidebar-nav-desktop-only`) vanish entirely below 768px (`style.css:294-298`); only the tertiary/admin group remains in the mobile drawer. Mobile is a **hybrid of four coexisting, complementary patterns** — preserve all four mechanisms in the redesign, restyle only:

1. **Hamburger → drawer**: `.sidebar-toggle` slides a 240px panel over a backdrop.
2. **FAB**: `#fabAdd`, fixed bottom-right, replaces the desktop sidebar's primary CTA, hidden ≥768px.
3. **Role-keyed bottom tab bar**: `#bottomNav`, populated at runtime from `js/config/bottom-nav-registry.js` — 4 registries (driver/engineering/request/executive), each role gets its own 4-5 tabs. Hidden ≥768px.
4. **"Lainnya" overflow bottom sheet**: secondary sheet for the executive role's overflow actions.

Desktop (≥768px): fixed 240px sidebar column, all four mobile mechanisms hidden. This is an already-hardened, single-relocated-nav-renderer pattern (the desktop rail physically moves into the mobile drawer — not a second nav tree) — a prior audit explicitly reaffirmed this decision; **don't propose a separate mobile nav tree**.

---

## 2. Current breakpoints — the actual numbers, and where they disagree

Extracted from every `@media` across `style.css`, `platform.css`, `engineering.css`, `gudang.css`, `nor-center.css`, `overtime.css`, `petty-cash.css`, `sarpras-intelligence.css`, `workspace-list-kit.css`, `Analytics-V2/*`:

| Value | Occurrences | Role it plays |
|---|---|---|
| 600px | 31 | Dominant "compact mobile" tier (2-row header, denser timeline, bottom-sheet modals) |
| 768/767px | 38 | Core app-shell mobile/desktop boundary |
| 480px | 10 | Very-small-phone tier |
| 760px | 8 | Engineering/Gudang's OWN "mobile" boundary — 8px off from 768 |
| 720px | 8 | Scattered secondary tier |
| 400px / 380px | 12 / 12 | Two competing "smallest phone" tiers, no clear rule for which a component uses |
| 1024/1023px | 10 | Tablet/desktop for the V2 rail+panel shell (consistent min/max pairing) |
| 640px | 5 | `.exec-drawer`'s OWN bottom-sheet threshold — 40px off from `.modal-box`'s 600px |
| 560px | 4 | `.req-sheet`'s OWN bottom-sheet threshold — a 3rd value for the same "sheet slides up" behavior |
| 900 / 920 / 960 / 1080 / 1180px | 2-3 each | 5 different values doing roughly the same "tablet" job in different files |
| 1279/1280, 1440 | 4 / 1 | Wide-desktop tier |

**Concrete conflicts to resolve, not just note:**
- **8px shell mismatch**: core shell flips at 767/768; Engineering/Gudang flip at 760. A viewport in 761-767px gets desktop shell chrome but Engineering/Gudang's own mobile layout.
- **Bottom-sheet threshold triple mismatch**: `.modal-box` (600px), `.exec-drawer` (640px), `.req-sheet` (560px) each pick their own value for visually the same transformation. In the 561-640px band, different overlays open on the same screen can be in different modes simultaneously — a real, user-visible inconsistency, not cosmetic.
- **Small-phone tier split 380 vs 400**: no rule for which a given component uses.
- Also established as **prior product decisions to keep**, not problems: 600px must stay the small-phone deep-adaptation tier and must **not** be merged with the 767/768 nav-shell breakpoint (explicit prior finding — they serve different purposes: nav collapse vs. density/font/bottom-sheet adaptation). 380px was added later specifically as a defensive gutter-trim tier for grid spacing, not a nav or sheet threshold — don't conflate it with 400px's role either without checking each call site.

## 3. Proposed canonical breakpoint scale

No file today defines breakpoints as tokens — fix this structurally, not just by picking new numbers:

```
--bp-xs:  380px   /* smallest supported phone gutter trim */
--bp-sm:  600px   /* compact-mobile deep adaptation: 2-row header, bottom sheets, denser grids */
--bp-md:  768px   /* THE nav-shell boundary — sidebar/drawer/bottom-nav/FAB switch here, and ONLY here */
--bp-lg:  1024px  /* tablet → desktop, V2 rail+panel full layout */
--bp-xl:  1280px  /* wide desktop */
```
Collapse 760/767/768 → 768 everywhere (Engineering/Gudang must adopt the shell boundary, not invent their own). Collapse 560/600/640 → 600 for every bottom-sheet transformation (modal, drawer, request-sheet) so the whole app changes overlay mode at one consistent width. Retire the 900/920/960/1080/1180 cluster in favor of picking one of {900, 1024} per actual layout need. Express every value as a CSS custom property so there is finally one place to change "what counts as mobile."

## 4. Touch targets

Confirmed good precedent to keep: `.sidebar-nav-item` (48px, "v1.20.8 — 48dp touch target"), `.btn-icon` date-nav arrows (44px), `.bottom-sheet-item` (48px), `.bottom-nav-item` (56px), `.fab-add` (54px) — all explicitly engineered to the HIG minimum.

**Gap to fix**: `.btn-primary`/`.btn-secondary`/`.btn-danger`/`.btn-success` have no `min-height` at all (effective ≈34px from `padding:8px 14px; font-size:13px`), and `.btn-today` shrinks to ~30px on mobile (`padding:3px 7px; font-size:11px` at ≤600px). **Rule for the redesign: every interactive element ≥44×44px on touch surfaces, no exceptions for "small" secondary buttons** — extend the discipline already applied to nav chrome to every button in every form and modal.

## 5. Tables / dense-data overflow

Current, consistent pattern: **horizontal-scroll wrapper**, not a card-reflow. Every table (`js/analytics/executive-table.js`, `js/engineering/ui/engineering-views.js`, `js/overtime/ui/overtime-records-view.js`) wraps in a `.{module}-table-wrap { overflow-x:auto }` container; cells use `white-space:nowrap`; the timeline grid uses the identical idiom outside `<table>` (`.timeline-body { overflow-x:auto }`). Nothing found broken (no un-wrapped table). **Decision for the redesign**: horizontal scroll for genuinely tabular/comparison data is an acceptable, already-functional pattern to keep — but any newly-designed dense list (not a true table) should prefer a card-per-row reflow on narrow viewports instead of extending the scroll idiom further, per the brief's "never solve mobile by shrinking the desktop UI" instruction.

## 6. Modal / drawer responsive behavior

Two systems, same overall shape (centered dialog desktop → bottom sheet mobile), different current thresholds (see §2 — unify to 600px):
- `.modal-box`: desktop centered, `max-width:560px`; mobile → bottom sheet, `max-height:95vh`, slides from bottom. One deliberate exception: `#modalOdometer` stays centered even on mobile — preserve this exception (documented, not an oversight).
- `.exec-drawer`: side panel desktop → bottom sheet mobile at `height:min(86vh,100%)`.
- `.req-sheet`: its own bottom-sheet variant.

Redesign action: keep the centered-desktop/bottom-sheet-mobile shape (it's correct and already well-executed with real slide animations), unify the threshold, and preserve the odometer-modal exception explicitly rather than "fixing" it into consistency — it was a deliberate call.

## 7. PWA — keep as-is, redesign is visual only here

Current architecture is sound and shouldn't be touched by a visual redesign: manifest (`standalone`, portrait-primary, `#A8292F` theme), smart install flow (Android `beforeinstallprompt` capture + custom banner; iOS instructional modal since no native prompt exists), a deliberately silent auto-update (no banner/button — the router only reloads within a 60s startup window while idle, guarded against loops), network-first app code (specifically reversed from cache-first after a past stale-ES-module bug), cache-first static assets, and a real offline fallback page. **None of this needs redesign** beyond re-skinning `offline.html` and any install-onboarding modal to match the new visual language.

## 8. Minimum viewport coverage checklist (for QA against the redesign)

320 · 360 · 375 · 390 · 412 · 430 (phones) · 768 · 834 (tablets) · 1024 · 1280 · 1366 · 1440 · 1536 · 1920 (desktop) · both orientations at each tablet size. A prior audit (`docs/uat/v1.15.4/`) already has screenshot evidence at a similar matrix, including foldable-phone fold-open/fold-closed states — reuse that matrix as precedent rather than inventing a new one.
