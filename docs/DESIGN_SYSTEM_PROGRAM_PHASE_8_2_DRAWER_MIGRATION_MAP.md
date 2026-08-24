# Phase 8.2 — Canonical Drawer Migration Map

Written before implementation began, per the phase brief's requirement. Confirmed
against actual source (not assumed from prose) during audit.

| Module | Current implementation | Canonical target | Risk | Special behavior | Migration strategy | Verification |
|---|---|---|---|---|---|---|
| **Assignment Detail** (`js/modal.js`) | Already on `js/components/drawer.js` (Phase 2) | — | — | Hand-wired `_wireDetailHandlers` per-button listeners instead of `footer`/`onAction`; own `sourceEl` row-highlight usage | Already migrated — **not touched this phase** | Re-ran existing `scratch/verify-modal-drawer.js` as a regression guard |
| **Vehicle Detail** (`js/components/vehicle-detail-drawer.js`) | Already on `js/components/drawer.js` via `js/analytics/executive-ui-kit.js` re-export chain (Phase 2) | — | — | Real `footer`/`onAction` usage with a `KEEP_OPEN_ACTIONS` set; own `ensureStyles()` content-CSS pattern | Already migrated — **not touched this phase** | Re-ran existing `scratch/verify-vehicle-drawer-tabs.js` as a regression guard |
| **Decision Replay** (`js/components/decision-replay-drawer.js`) | Hand-rolled `.drx-overlay`/`.drx-sheet`, own `ensureStyles()`/`STYLE_ID`/`_keyHandler`, no focus trap/initial-focus/restoration, `z-index:6000`, `.32s cubic-bezier(.32,.72,0,1)` transform | `openDrawer`/`closeDrawer` | **Low** — pure-render over an already-computed model (zero Firebase, zero business logic inside the drawer file itself); migrating is a strict accessibility upgrade (gains focus-trap/initial-focus/restoration it lacked) and fixes a latent stale-overlay-id race the canonical primitive already guards against for its existing consumers | Nested export popover (PDF/Excel) — genuinely stateful, kept as hand-wired content appended into `.drawer__foot`. Expandable candidate-ranking rows — self-contained, unchanged. Opens from within the legacy `.modal-overlay` Approve Request flow (z-index 200); canonical drawer's `z-index:10000` still layers above it, and decision-replay now shares the canonical single-instance slot with Assignment/Vehicle Detail (verified: never opened concurrently with either in any real path) | **Migrated this phase** — content DOM/business logic (all section renderers, `decision-replay-service.js`) unchanged; only the shell (overlay/backdrop/header/footer/focus/Escape) now comes from `drawer.js` | `scripts/decision-replay-dom-check.mjs` (updated selectors, 30/30 pass) + `scripts/drawer-consolidation-check.mjs` (52/52 pass) |
| **Driver Wellness** (`js/components/driver-wellness-drawer.js`) | Same hand-rolled pattern as Decision Replay, CSS byte-identical to it apart from a `drx-`/`dwd-` class prefix (confirmed independently authored, not shared code) | `openDrawer`/`closeDrawer` | **Low** — same profile as Decision Replay | No export widget — Close-only footer today; migration does **not** force a uniform Close+Export contract onto it just because Decision Replay has one. Dual risk-meter widget (Fatigue/Burnout, same component two domain meanings) kept as content, unchanged | **Migrated this phase** — content DOM/business logic (`driver-wellness-service.js`) unchanged; shell now canonical | `scripts/driver-wellness-dom-check.mjs` (updated selectors, 48/48 pass) + `scripts/drawer-consolidation-check.mjs` |
| **Engineering Detail** (`js/engineering/ui/engineering-drawer.js`) | `renderDrawer(a, ctx)` — a **pure string-template function**, zero internal DOM/state/listeners of its own. Every `data-act="eng-*"` button (verify/join/finish/postpone/reopen/delete) is caught only because `engineering-center.js` renders the whole screen (content + drawer + modal) into one `host.innerHTML=` blob per `render()`, with exactly one delegated `click`/`input`/`submit` listener set mounted once on `host` (a `mounted` guard). No focus trap, no initial focus, no Escape handling, no `role="dialog"`/`aria-modal` today | `openDrawer`/`closeDrawer` | **High** | Firebase writes (verify/join/finish/postpone/reopen) and native `confirm()` delete/cancel dialogs all live in the caller (`engineering-center.js`), triggered via `data-act` attributes the drawer renders — advisory-render/authoritative-caller split must survive any future migration untouched | **DEFERRED, not migrated this phase** — see reasoning below | `git diff --quiet` on `engineering-drawer.js` and `engineering-center.js` confirms zero change (mechanical proof, in `drawer-consolidation-check.mjs`) |
| **Gudang Item/Asset Detail** (`js/gudang/ui/gudang-item-detail.js`'s `drawerShell`) | Same `host.innerHTML=` + single-mounted-delegated-listener architecture as Engineering (`gudang-center.js` binds click/input/submit/keydown/drag\*/paste/touch\* once on `host`). Unlike Engineering, **not** pure-render: owns 3 async data-loaders (`ensureDetailImage`, `ensureConsumableData`, `ensureAssetHistory`) and 2 Firebase-backed mutating actions (`confirmAssetAction`→`applyAssetTransition`, `confirmDeleteItem`→`archiveItem`) directly. Already has `role="dialog" aria-modal="true"` + initial-focus-on-open (`focusDrawerOnOpen()`, v1.29.9) — ahead of Engineering on accessibility | `openDrawer`/`closeDrawer` | **High** | Photo-upload progress/error/dragover CSS (`.gud-photo-overlay`, `.gud-progress-ring`, `gudRingSpin`, `gudDropPulse`) is shared with the Gudang catalog card and Add/Edit Item dialog — not drawer-owned, must never be pulled into a drawer-specific CSS consolidation. Existing inconsistent dirty-state handling (Escape cancels an in-flight photo upload explicitly; scrim-click does not) — a pre-existing gap, not this migration's to silently fix or worsen | **DEFERRED, not migrated this phase** — see reasoning below | `git diff --quiet` on `gudang-item-detail.js` and `gudang-center.js` confirms zero change |

## What was deleted / retained / adapted (Decision Replay + Driver Wellness)

**Deleted**: `.drx-overlay`/`.drx-sheet`/`.drx-head*`/`.drx-x` shell CSS and their
`.dwd-*` equivalents; both files' own `ensureStyles()`-injected shell rules; both
files' own `_keyHandler`/Escape-listener plumbing; the `ROOT_ID` constant and
`document.getElementById(ROOT_ID)` lookups; both `close*Drawer()` exports (callers
now use the canonical `closeDrawer()` directly).

**Retained unchanged**: every section-renderer function (`renderTimeline`,
`renderWhy`, `renderScoreBreakdown`, `renderWhyNot`, `renderPolicy`,
`renderOverride`, `renderRanking` for Decision Replay; `riskMeter`,
`renderExplain`, `renderComponents`, `renderTimeline`, `renderRecommendations`
for Driver Wellness) — zero content or business-logic changes; both underlying
service modules (`decision-replay-service.js`, `driver-wellness-service.js`)
untouched; the decision-replay export popover's stateful toggle logic; the
ranking-row expand/collapse logic (with one small addition, `aria-expanded`,
bundled since the code was already open).

**Adapted**: `buildSheet()` split into a content-fragment builder
(`buildBodyContent()`) appended into the canonical `[data-drawer-body]`, plus a
thin `open*Drawer()` wrapper calling `openDrawer({...})`; the recommendation/hero
identity block relocated to be the first body item (the canonical header only
takes plain title/subtitle strings, which can't reproduce the confidence-star
glyph / big-numeral treatment); 🧠/🫀 emoji brand marks replaced with `anIcon('bulb')`/`anIcon('wellness')` (forced by the canonical header's icon slot, and a
direct continuation of Phase 4's icon consolidation); each file's content
`<style>` block slimmed to drop shell rules while keeping every content-specific
selector unchanged.

## Why Engineering + Gudang are deferred, not force-migrated

Both are built on a fundamentally different architecture from Decision
Replay/Driver Wellness: the whole screen (content + drawer + modal) renders into
one `host.innerHTML=` blob per `render()`, with a **single delegated
click/input/submit listener set mounted once on `host`**. The canonical drawer
appends its own separate DOM subtree to `document.body`, with its own listener,
entirely outside `host`. Moving either drawer onto `openDrawer()` as-is would
silently strand every action button outside the delegation that currently catches
it — verify/join/finish/postpone/reopen/delete (Engineering) and asset actions
plus item delete (Gudang) would all break with no thrown error. Gudang
additionally owns live Firebase-write logic and async data-loaders directly
inside the drawer file, which the canonical primitive's create-once-per-open
model doesn't accommodate without a new capability. This was verified directly in
code (exact line numbers, exact listener-mounting calls), not assumed — see the
full reasoning and a concrete recommended prerequisite (a `drawer.js`
"externally-delegated events" mode + a documented refresh-on-render pattern) in
the consolidation report's Deferred Items section.
