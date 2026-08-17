# ASSIGNMENT BOARD REDESIGN — "Papan Jadwal"
**Audited at:** APP_VERSION v1.30.9.12 · 2026-08-14
**Part of the Claude Design handoff package** — see `DESIGN_BRIEF_v1.30.9.12.md`.
**Grounded in:** live code (`js/assignments.js`, `js/timeline.js`, `js/timeline-interactions.js`, `js/timeline-clipboard.js`, `js/modal.js`) AND a real screenshot of the current production rendering supplied by the product owner (desktop, light mode, Sat 15 Aug 2026, 3 drivers). No part of this document is speculative UI guessing.

This is the flagship screen of the redesign per the brief. It **must remain part of the product** with its operational meaning intact: viewing driver assignments, duration, driver schedules, vehicle allocation, schedule conflicts, date navigation, operational workload.

---

## 1. What the current implementation actually is

**Live UI name**: the screen title in production is **"Papan Jadwal"** (confirmed both in the supplied screenshot and in `js/app.js:3654` where the title string is injected). Note: several historical `docs/` reports call this "Timeline Board" — that term is stale documentation, not the live app. Use **"Papan Jadwal"**.

**Rendering model**: not a `<table>`, not CSS grid — absolutely-positioned blocks inside flex rows, scaled by a CSS custom property (`--hour-width`, 80px desktop / 58px mobile). One `.driver-row` per active driver (`getActiveDrivers()`), plus a synthesized row for any assignment whose driver no longer matches an active driver (so historical data for a deactivated driver still renders). Each block's `left`/`width` is computed from `startMin`/`durMin` × hourWidth; a live vs. scheduled window swap happens once a trip is started/completed (block position reflects actual `startedAt`/`completedAt`, but **the underlying scheduled fields are never mutated** — presentation-only). A red "now" line renders only when viewing today, repositioned every 60s.

**Date navigation**: single-date view only (no week/month view). Prev/Today/Next controls + a native date input. An **auto-focus scroll** on date change is already a thoughtful touch — it scrolls to the most relevant time window (nearest assignment to now / current time / earliest assignment / 08:00 default, with a 1.5h lead-in for context) rather than always resetting to hour 0.

**Filters & search**: **no dedicated driver/vehicle/status filter exists today** — only one global adaptive search box (placeholder "Cari driver, kendaraan, tujuan, plat…") matching across driver/destination/purpose/vehicle/pic. Cancelled assignments are unconditionally hidden from the board regardless of search (retained in data for audit, never shown operationally). Important technical detail to preserve: **search narrows what's displayed but never narrows what the conflict-checker validates against** — the create/edit form and detail modal always see the full unfiltered assignment set. A redesign adding real filter chips must preserve this separation.

**Vehicle allocation display**: the board is **driver-centric — there is no vehicle lane/row**. Vehicle identity today is color-only: each block gets an inline `background` from `getVehicleColor()` (dynamically looked up from `/vehicles`), cross-referenced against a **static, hardcoded 4-item legend** (Innova/Luxio/Polytron/Hiace) below the grid. This legend — confirmed both in code and in the supplied screenshot — **never regenerates from the live vehicle list**; a 5th vehicle added in Vehicle Management gets a correct block color but never appears in the legend. The manual create/edit form's vehicle `<select>` has the identical hardcoding bug.

**Conflict detection**: purely preventive, at write time — not a passive "flag what's already overlapping" scan. Hard block on submit, a live advisory preview while filling the form (disables Save on overlap before you even try to submit), and drag/resize operations run the exact same guard functions with green/red drag-validity outlining. "Tanpa Driver"/"Tanpa Kendaraan" sentinel values deliberately skip their respective check (no real resource to double-book). **There is no standing visual conflict badge on the rendered grid** — if an overlap already exists in stored data, both blocks render side-by-side with no warning.

**Interaction model**: tap/click any block → detail modal (accordion, lifecycle actions gated by `canActOnAssignment()`/`canCancelAssignment()` — admin acts on anything, driver only their own, bidang only their own self-drive assignment). **Desktop-only** (gated by `pointer:coarse` detection, so touch devices get none of this): right-click context menu (copy/duplicate/delete/paste), drag-to-move (only `assigned`-status blocks, 5px threshold before drag activates so plain clicks still work), resize via right-edge handle (min 15 min), 5-minute magnetic snap, and a deliberately session-only in-memory clipboard (not the OS clipboard — lost on reload by design). Paste/duplicate never fabricates driver availability — it defers to the recommendation engine or warns about the Recovery Buffer.

**Mobile**: a single 767px breakpoint makes the *same* horizontal-scroll grid denser (smaller row height, driver-column width, hour-width) rather than switching layouts — the phone hides `.driver-phone` and that's essentially it. A genuine card-based **List view ("Daftar")** already exists as an alternative (`renderListView()`), same filtered/date-scoped data, sorted by start time. **But the Timeline/Daftar toggle is `display:none` at ≤767px**, and no bottom-nav substitute exists for Admin or Bidang roles — only the Driver role's bottom-nav registry has a direct List-view entry. **On a phone today, Admin and Bidang are structurally stuck with the dense horizontal-scroll grid.**

**Data model**: RTDB path `assignments` (flat, keyed). Writes are always surgical single/multi-path updates — an explicit in-code comment forbids ever `set()`-ing the root (historical-data-loss risk). Multi-day creates are one atomic multi-path update, all-or-nothing. A "Persist → Confirm → Update UI" pipeline awaits the Firebase write before any local state change, toast, or modal close.

---

## 2. What the supplied screenshot confirms, visually

Desktop, light mode, "Papan Jadwal" title, "Timeline"/"Daftar" toggle (Timeline active), date "Sabtu, 15 Agustus 2026," DRIVER column with avatar-initial circles + partially-masked phone numbers, hourly grid 04:00-18:00 with a horizontal scrollbar implying a wider range exists, 3 driver rows (Igo/Dedi/Aria), colored rounded-rect blocks with a ⋮ quick-action affordance, a bottom KENDARAAN legend with 4 color dots.

Findings unique to the visual (not derivable from code alone):
- **Assignment titles ellipsis-truncate with no visible escape hatch** — "Pengantaran Keberangkatan Ti…" and (twice) "…Tim World Champ 2026 B…" are cut off; nothing in the visible chrome offers a way to read the full text short of opening the block.
- **Two rows show what is clearly one shared trip with no visual link** — Dedi and Aria both show the identical 07:00-11:00 block/title (a convoy for the same event) but the board renders them as two coincidentally-identical entries, not a grouped/paired assignment. There is no data-model concept of "linked assignments" confirmed in code either — this is a genuine design + product question, not just a visual one (see §4).
- **Large empty canvas relative to content** — the visible 04:00-18:00 window is almost entirely blank after 11:00 for a 3-driver, 3-block day; on a wide desktop viewport this is a lot of scroll-affording chrome for very little information density.
- **Header stat area** ("8 jam • 09:00-17:00" under the title) did not visibly match either the displayed 04:00-18:00 window or the actual 05:30-11:00 event times in this one sample. This audit could not trace the exact source of that string in the time available — flag to Claude Design as "verify against the live app; may be a static operating-hours label rather than a computed summary" rather than asserting it's broken.

---

## 3. Explicit "must preserve" list (operational invariants)

These are not visual choices — changing them changes what the board *means* operationally, which is out of scope for this redesign per the brief:

1. Driver-row-per-driver structure (the org thinks about scheduling by driver, not by vehicle) — a vehicle-lane view can be **added**, not substituted.
2. The scheduled-time-never-mutated invariant when a trip's actual start/complete time differs from plan.
3. Only `assigned`-status blocks are draggable/resizable; Running/Completed/Cancelled stay immutable on the grid.
4. Cancelled assignments stay hidden from the operational view but retained in data.
5. Write-time conflict prevention as the authority — a redesign may add passive visual conflict indicators (recommended, see §4) but must not replace or weaken the hard-block-on-submit guarantee.
6. Search narrows display, never narrows what conflict-checking validates against.
7. The session-only clipboard behavior (intentionally not OS clipboard).
8. Single-date view as the primary mode — a week view may be **added** as a new capability if Claude Design proposes it, but the existing single-date auto-focus behavior is a considered, working pattern, not a limitation to silently replace.

---

## 4. Redesign opportunities (ideas, not requirements — Claude Design should judge what actually improves the product)

**Driver identification**: today, avatar circles are a single fixed brand color with an initial letter — no per-driver visual distinction beyond the name/phone text. Consider per-driver accent colors or photos if the roster is small enough to stay legible; verify against real roster size (roster size not confirmed in this audit — check `js/drivers-store.js` active count before assuming avatars scale).

**Timeline & assignment density**: the empty-canvas finding (§2) suggests an adaptive time-range or auto-zoom that frames the actual populated hours by default (the existing `autoFocusTimeline()` behavior is a good foundation — extend the *concept* to also adapt the visible *width* of the window, not just the scroll position).

**Vehicle visibility (P0, code-confirmed gap)**: replace the static legend with one generated from `getActiveVehicles()`, and put a vehicle icon/short-label directly on each block (not color-only) — color-only identity fails both new vehicles (legend gap) and colorblind users (accessibility gap named in the brief).

**Conflict visibility**: add a passive indicator (not a blocking action) for assignments that already overlap in stored data, distinct from the active drag/submit validation that already exists — e.g., a subtle warning glyph on both blocks in a genuine standing conflict, so an admin auditing a day doesn't have to re-open each block to discover it. **Design decision needed, not assumed**: overlapping/adjacent-but-not-technically-conflicting entries like the Dedi/Aria convoy pair should read as *intentionally paired*, not as a conflict warning — if a "linked assignment" concept doesn't exist in the data model, either propose a purely presentational grouping heuristic (same time+destination+purpose) or flag the need for a product decision rather than inventing new data fields silently.

**Assignment details**: since titles truncate with no escape hatch, ensure the redesigned block always affords a one-tap/one-hover path to the full text (tooltip, expand-on-hover, or a persistently visible detail affordance) — this is a low-risk, high-value fix.

**Date navigation**: current prev/today/next + auto-focus is solid; a week-glance strip (read-only mini-preview of adjacent days' load) could reduce day-hopping without adding a full week-view mode, if Claude Design judges it valuable.

**Filtering & search**: add real driver/vehicle/status filter chips alongside the existing search box (additive — see §1 preservation note on the conflict-checker's unfiltered authority).

**Mobile layout (P0, code-confirmed gap)**: make List view reachable for every role on mobile, not just Driver — either always show the toggle, or make List the mobile default with Timeline as an explicit opt-in. The card-based List view already exists and needs no new data plumbing, only exposure.

**Touch interaction**: today, desktop gets drag/resize/context-menu/paste; touch gets plain tap only. Consider whether any of the desktop power-features (at minimum: reading the full conflict-preview experience, or a long-press context menu) should have a touch-equivalent, without assuming touch users need full drag-and-drop parity — operational correctness and real device testing should decide this, not assumption.

**Smart zoom / adaptive density**: the existing `--hour-width` CSS-variable-driven scale is already the right mechanism for a "zoom" control if Claude Design wants to offer users a density toggle (compact/comfortable) — no architecture change needed, just exposing the existing lever.

**Keyboard navigation**: currently only `Escape` closes the context menu; no date-nav or block-navigation keyboard shortcuts exist. Low-risk addition if desired.
