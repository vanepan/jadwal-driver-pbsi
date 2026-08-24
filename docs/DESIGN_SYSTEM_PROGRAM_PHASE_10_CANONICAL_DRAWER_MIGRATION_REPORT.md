# Design System Program — Phase 10: Canonical Drawer Migration Report

**Status:** Gudang, Engineering, and Petty Cash detail drawers migrated
onto `js/components/drawer.js`. Overtime audited and deliberately
**deferred** (see its own audit doc). **NOT committed, NOT pushed, NOT
deployed.**

---

## 1. Executive Summary

Three of the four non-canonical drawers identified in the Phase 9
checkpoint are now migrated: **Gudang** (item/asset detail), **Engineering**
(assignment detail), **Petty Cash** (expense detail) — in that order, as
recommended, lowest-risk-and-highest-usage first. Each migration was
audited before touching code, implemented one module at a time, verified
against real regression suites, and hostile-reviewed before moving to the
next. **Overtime's drawer was audited and found technically READY, but
deliberately deferred** — not migrated this phase — per the phase's own
instruction to treat a fourth migration as a scope decision, not an
assumption.

Every migrated drawer gained, for free, from the canonical shell: real
focus trap, initial focus, focus restoration, body-scroll lock, safe-area
padding, swipe-to-dismiss, and (for Gudang and Petty Cash) a genuine mobile
bottom-sheet instead of a fixed-width panel that never adapted. None of
this existed in any of the three modules before.

**Total regression: 1,865 automated checks + 2 real-boot PASS results,
zero failures caused by this phase.** One pre-existing, unrelated failure
(`gudang-security-check.mjs`, a `database.rules.json` JSON-parse issue)
was found during this pass's own regression running, traced, and confirmed
via `git diff` to predate this session entirely — documented, not fixed
(Firebase/RTDB rules are explicitly out of scope).

---

## 2. Scope

**In scope, completed:**
- Gudang item/asset detail drawer → canonical shell.
- Engineering assignment detail drawer → canonical shell.
- Petty Cash expense detail drawer → canonical shell.
- New/updated static + real-browser regression coverage for all three.
- Overtime drawer: full behavior audit + READY/NOT READY/STOP
  classification (READY) + explicit deferral reasoning.

**Explicitly out of scope, untouched:**
- The two competing mobile navigation systems (Phase 9 checkpoint §4A).
- Executive Command Center (frozen).
- Firebase, permissions, RTDB rules, business/engine logic.
- `js/components/drawer.js`'s own public API — no new capability was added
  to it; every migration used only what it already exposed
  (`openDrawer`/`closeDrawer`/`refreshDrawerBody`, `title`/`subtitle`/
  `icon`/`body`/`footer`/`onAction`/`onClose`).
- Overtime's drawer implementation (audited, not migrated).

---

## 3. Pre-migration architecture (confirmed by direct behavior mapping, not assumption)

Before any code was touched, all four target drawers were mapped in full
detail (open/close triggers, focus/scroll/safe-area/swipe behavior,
delegation pattern, async behavior, state surface, Firebase coupling) —
see the Phase 9 checkpoint's §4B for the summary table and this report's
own module sections below for the specifics that shaped each migration.

**The one finding that shaped every migration's design:** `openDrawer()`
appends its overlay to `document.body`, outside each module's own `host`
container. Every module's single delegated `click`/`input` listener is
bound to `host`, so none of them would ever see events from content
rendered inside the canonical drawer without a deliberate wiring decision.
Two different, deliberate strategies were used depending on each drawer's
shape:

- **Gudang** (many in-body interactive elements: quick actions, edit,
  asset rows, timeline filters) — reused its EXISTING `data-act` dispatch
  verbatim by binding the same `onClick`/`onInput`/drag/paste handlers
  directly onto the new drawer overlay, and widening the host-containment
  guard to also accept elements inside it.
- **Engineering and Petty Cash** (a small, enumerable action set) — moved
  entirely onto the canonical drawer's own `onAction`/`data-drawer-action`
  mechanism instead, writing one small dispatcher function per module that
  mirrors the old `data-act` switch cases exactly, with the current
  record's id captured via closure instead of a `data-id` read.

---

## 4. Gudang Migration

**Files:** `js/gudang/ui/gudang-item-detail.js`, `js/gudang/ui/gudang-center.js`, `gudang.css`.

**Before → After:**
- `renderItemDetail()`/`renderAssetDetail()` used to return a full HTML
  shell string (`drawerShell()`: `.gud-scrim`/`.gud-drawer`, its own close
  button, `role="dialog"` hand-rolled). They now return `{ title, body }`;
  `drawerShell()` is deleted.
- The badge/back-link that used to sit in the shell's own header now
  renders as the first block of the body (`.gud-drawer-badges`, reused
  verbatim) — the canonical `subtitle` slot is plain escaped text, not
  markup, so it can't host a clickable back-link or a colored pill.
- `gudang-center.js`'s `render()` no longer concatenates the drawer into
  `host.innerHTML`; a new `syncGudangDetailDrawer()` decides `openDrawer()`
  (new record) vs. `refreshDrawerBody()` (same record re-rendering — an
  async fetch resolving, an asset-action state change) vs. `closeDrawer()`.
- `onClick`'s host-containment guard widened to also accept elements
  inside the currently-open drawer overlay (`_gudDrawerOverlay`); the SAME
  delegated handlers (`onClick`, `onInput`, `onDragOver`/`onDragLeave`/
  `onDrop`, `onPaste`) are additionally bound directly to each fresh
  overlay — preserving drag-and-drop/paste photo-replace, which the
  behavior map found was a real, easy-to-miss requirement (the drawer's
  own header comment documents it as a v1.29.5 feature).
- `focusDrawerOnOpen()` (manual `.focus()` on a custom close button)
  deleted — the canonical shell's own close-button auto-focus replaces it.
- The delete-confirm/edit-item/add-asset-unit modals (still `.gud-scrim
  -center`, unmigrated) can open while the detail drawer is open behind
  them (confirmed: none of their trigger paths clear `st.detail`) — their
  shared z-index bumped from 420 to 10050, above the canonical drawer's
  10001, so they no longer render unreachably underneath it.
- Dead CSS the migration orphaned removed: `.gud-drawer`, `.gud-drawer-head`,
  `.gud-drawer-head-txt` (kept `-head-main`/`-badges`, still used),
  `.gud-drawer-body`, `.gud-drawer-foot`, `.gud-drawer-title`, and the
  ≤760px width override — confirmed zero remaining references before
  removal.

**Verification:** VERIFIED — 20/20 Gudang regression suites (918 checks)
green, `drawer-consolidation-check.mjs` 67/67 (including 5 new static
checks confirming the migration's own wiring), `gudang-ui-check.mjs`'s
"Part F" rewritten (3 stale checks describing the deleted implementation
→ 10 checks describing the new one, all passing), full app `smoke-boot.mjs`
PASS.

---

## 5. Engineering Migration

**Files:** `js/engineering/ui/engineering-drawer.js`, `js/engineering/ui/engineering-center.js`, `engineering.css`.

**Before → After:**
- `renderDrawer()` used to return a full HTML shell string with a
  hand-rolled fixed footer (`actionZone()`, icon buttons with `tone`/`big`
  modifiers). It now returns `{ title, subtitle, body, footer }` — `title`
  = assignment title, `subtitle` = location (both plain text, a clean fit
  for the canonical slots). The category tile + status badges move to the
  first body block (same "can't host markup in subtitle" reasoning as
  Gudang).
- `actionZone()` split into `actionButtons()` (real button descriptors —
  `{label, action, variant}` — for genuine action states, now the
  canonical `footer`, still always-visible/sticky) and `actionNote()`
  (message-only states like "Terverifikasi dan ditutup" that don't fit a
  button-only footer slot, now a body block). **Disclosed cosmetic
  simplification:** the canonical footer only supports `primary`/`danger`
  variants, so the old `tone-violet`/`tone-muted`/icon/`big` styling is
  gone — every action still has a clear, unambiguous Indonesian label and
  fires the exact same engine call; nothing is harder to find or use.
- The dead `btn()` helper (only used by the old `actionZone()`) removed.
- The delete-zone button now uses `data-drawer-action="eng-delete"`
  instead of `data-act` — it stays in the body (its hint text and
  danger-tint divider don't fit the plain footer-button model) but still
  routes through the same `onAction` callback the real footer buttons use,
  since `js/components/drawer.js` dispatches `data-drawer-action` anywhere
  in the drawer, not just the footer.
- A new `onEngineeringDrawerAction()` dispatcher mirrors the old switch's
  `eng-begin`/`eng-resume`/`eng-finish`/`eng-continue`/`eng-verify`/
  `eng-postpone`/`eng-reopen`/`eng-delete` cases exactly, calling the same
  `commitTx`/`doBegin`/`doResume`/`doDelete` functions unchanged. The
  worker id (`ctx.me.id`) is captured via closure instead of a
  `data-worker` read — confirmed safe because the old markup always set
  `data-worker` to the current user's own id anyway, never anyone else's.
- `onClick`'s switch: `eng-close-drawer`/`eng-postpone`/`eng-reopen`/
  `eng-delete` removed (confirmed, repo-wide, reachable only from the now-
  deleted drawer markup). `eng-begin`/`eng-resume`/`eng-finish`/
  `eng-continue`/`eng-verify` **kept** — confirmed still rendered
  independently by `engineering-dashboard.js` and `engineering-queue.js`'s
  own quick-action buttons, unrelated to the drawer.
- The create/report modal (`.eng-scrim -center`, unmigrated) can open
  while the drawer is open behind it (`openEngineeringCreate()` never
  clears `st.drawerId`) — same z-index bump pattern as Gudang (120 →
  10050 for `.eng-scrim.-center` only; the base `.eng-scrim` stays 120,
  still correct for when the modal is the only thing open).
- Dead CSS removed: `.eng-drawer`, `.eng-drawer-head`, `.eng-drawer-title`,
  `.eng-drawer-loc`, `.eng-drawer-body`, `.eng-drawer-foot` (kept
  `-head-main`/`-head-txt`/`-badges`, still used in the body's first block).
- **A genuine, disclosed micro-improvement:** the "assignment vanished
  while its drawer was open" case (`getAssignment()` returns `undefined`)
  used to silently collapse the drawer with zero messaging (a gap the
  behavior map itself flagged). It now shows "Penugasan tidak ditemukan"
  with a real message — one line, a direct consequence of needing to
  return *something* for the null case, not scope creep.

**Verification:** VERIFIED — 9/9 Engineering regression suites (384
checks) green, `drawer-consolidation-check.mjs` 67/67 (5 new static
checks), `engineering-ui-dom-check.mjs`'s `[drawer actions]` and
`[escaping]` sections rewritten for the new `{title,subtitle,body,footer}`
return shape (11 checks, all passing, including a corrected escaping test
that now checks `title`/`subtitle` are passed through raw for the
canonical shell to escape, matching where escaping actually happens now),
full app `smoke-boot.mjs` PASS.

---

## 6. Petty Cash Migration

**Files:** `js/petty-cash/petty-cash-center.js` (no CSS file changes — the
old drawer was 100% inline-styled with no class name at all, confirmed by
the Phase 9 behavior map, so there was no shell CSS to orphan).

**Before → After:**
- `detailDrawer()` used to return a full HTML string for a completely
  inline-styled, unclassed overlay+panel — no focus trap, no Escape
  handling, no body-scroll-lock, no safe-area on header/body, fixed
  right-docked width with **zero** responsive behavior at any viewport
  (confirmed: no `@media` in `petty-cash.css` ever targeted it, since it
  had no class to target). It now returns `{ title, subtitle, body,
  footer }` — `title` = expense description, `subtitle` = ref number
  (loses its specific monospace styling — the canonical `subtitle` slot
  isn't monospace — a disclosed cosmetic simplification, not a functional
  one).
- All 4 mutually-exclusive footer variants preserved exactly (locked-by-
  NOR → single "Lihat NOR Terkait" button only, no Tutup; cascade-archived
  → Tutup + "Pulihkan via NOR Test"; archived → Tutup + "Pulihkan
  Pengeluaran"; available → Tutup + Edit + Arsipkan + Hapus). **One
  disclosed cosmetic loss:** "Pulihkan Pengeluaran" was green-tinted in
  the old design; the canonical footer only has `primary`/`danger`, so it
  now renders `primary` (accent-colored) instead. "Hapus" maps cleanly
  onto `danger` — a genuine semantic fit, no loss there.
- The 3 body-level "Lihat TEST NOR →"/"Lihat NOR Terkait →"/"Buka NOR
  Test →" banner links (separate from, and in addition to, the equivalent
  footer buttons in some states) now use `data-drawer-action` instead of
  `data-act` — same reasoning as Engineering's delete button.
- A new `onPettyCashDrawerAction()` dispatcher mirrors the old switch's
  `closeDetail`/`openNorFromDetail`/`restoreExpense`/`editExpense`/
  `archiveExpense`/`deleteExpense` cases exactly, calling the same
  `doRestoreExpense`/`openEdit`/`doArchiveExpense`/`doDeleteExpense`
  functions unchanged (confirmed identical signatures). `openNorFromDetail`
  recomputes the target NOR's id from the currently-open expense
  (`getExpenseById(st.detailId).norId`) via closure instead of a
  `data-id` read.
- `onClick`'s switch: all 6 of the above cases removed — confirmed,
  repo-wide, that none of these `data-act` values were ever rendered
  anywhere outside the now-deleted drawer markup. `openDetail` **kept**
  (unrelated — it's how the drawer opens, still triggered from list rows
  inside `root`).
- `notifModal()` and `cycleModal()` (both still inline `.gud`-style
  unclassed overlays, unmigrated, z-index 1500/1600) can open while the
  detail drawer is open behind them (neither's open path clears
  `st.detailId`) — both bumped to z-index 10050, above the canonical
  drawer's 10001. `addModal()` (Add/Edit Expense form) was checked and
  confirmed **not** to need this: `openEdit()` explicitly clears
  `st.detailId` before opening it, so the two can never coexist.

**Verification:** VERIFIED — `pettycash-intelligence-check.mjs` 29/29
green (unaffected — logic-level, no drawer coupling), `drawer-consolidation-
check.mjs` 67/67 (6 new static checks, including one confirming the old
dead-code cases are gone from the right function), full app `smoke-boot.mjs`
PASS. **NOT separately re-verified this pass:** the `.pc-add-*` form
classes and mobile-form fixes from Phase 9 — untouched by this migration,
confirmed by diff (only `detailDrawer()` and its surrounding wiring
changed), no reason to expect regression, not re-tested for its own sake.

---

## 7. Overtime Audit / Decision

Full behavior map + complexity comparison + classification in
`docs/DESIGN_SYSTEM_PROGRAM_PHASE_10_OVERTIME_DRAWER_AUDIT.md`. Summary:
**classified READY** — it is structurally the *simplest* of the four
drawers audited across this program (no conditional body branching, one
static action instead of a role/status matrix, no async loading state),
with the same "no existing a11y/scroll-lock/safe-area/swipe baseline" gap
Engineering and Petty Cash also had before their migrations. **Deliberately
not migrated this phase** — the audit found no technical blocker, but per
the phase's own instruction ("unless the audit proves it is trivial and
explicitly safe... DO NOT migrate... document the exact reason"), the
decision to spend a fourth migration is left to the user rather than
assumed, consistent with "the objective is not to maximize the number of
migrated files." One additional finding surfaced during the audit (not
previously documented): `st.historyEmployeeId` isn't cleared by screen
navigation or module close, so the drawer can silently reappear over a
different screen — noted as a good candidate bonus fix if/when this
drawer is migrated, not fixed now (out of this pass's scope).

---

## 8. Canonical Drawer Changes

**None.** `js/components/drawer.js`'s public API is unchanged from Phase 9
— no new parameter, no new export, no behavior change. Every migration
used only the existing `openDrawer({title, subtitle, icon, body, footer,
onAction, onClose})` / `closeDrawer()` / `refreshDrawerBody(html)`
contract. Where a module's content didn't cleanly fit a slot (Engineering's
icon/tone-styled buttons, Petty Cash's green-tinted restore button,
Gudang's back-link needing markup a plain-text `subtitle` can't carry),
the fix was always on the *consumer* side (move content to the body, drop
an unsupported cosmetic modifier) — never an API extension. This matches
the phase's own STOP-condition guidance precisely: no genuine bug was
found in the canonical component itself, so nothing there needed to
change.

**Backwards compatibility:** confirmed intact — `drawer-consolidation-
check.mjs`'s original Phase 8.2 suite (Decision Replay, Driver Wellness,
single-instance replace, rapid open/close race, focus trap, z-index
layering, reduced-motion, mobile bottom-sheet) still reports the same
counts it did before this phase touched anything, re-run clean after each
of the three migrations.

---

## 9. Accessibility Improvements

Every migrated drawer gained, for the first time:

| Capability | Gudang before | Engineering before | Petty Cash before | All three after |
|---|---|---|---|---|
| `role="dialog"`/`aria-modal` | Had it (hand-rolled) | Missing | Missing | Inherited from the canonical shell |
| Focus trap (Tab cycling) | Missing | Missing | Missing | Present |
| Initial focus on open | Had it (manual, close button) | Missing | Missing | Present (canonical shell's own close button) |
| Focus restoration on close | Missing | Missing | Missing | Present |
| Body scroll lock | Missing | Missing | Missing | Present |
| Safe-area padding | Missing | Missing | Partial (footer only, Phase 9) | Present (whole panel, footer-aware) |
| Swipe-to-dismiss | Missing | Missing | Missing | Present |
| Mobile bottom-sheet (vs. fixed right-slide) | Missing | Missing | Missing | Present |

No accessibility capability was *removed* by any migration.

---

## 10. Mobile Behavior

VERIFIED via `drawer-consolidation-check.mjs`'s real-browser suite
(re-run clean after each migration, unchanged since it tests the shared
shell generically): 375/390/402/430px — drag-handle grabber visible,
panel never exceeds viewport width, zero horizontal overflow, zero
console/page errors, at every one of those widths, for the canonical
drawer all three migrations now render through.

**NOT independently re-verified per-module this pass:** a full click-
through of each specific migrated drawer's *content* at each mobile width
(e.g., does Petty Cash's audit timeline or Engineering's lifecycle stepper
specifically reflow correctly) — the shell's own mobile behavior is
shell-generic and already covered exhaustively; each module's own content
CSS was not touched by this migration (only the shell wrapping it
changed), so no new mobile-layout risk was introduced in the body content
itself. This is a reasoned inference from the diff, not a fresh visual
verification — labeled **LOGIC VERIFIED**, not VERIFIED, for that specific
claim.

**NOT VERIFIED (real device):** same standing constraint disclosed in
every phase of this program — no physical device or authenticated session
was available.

---

## 11. Reduced Motion

No new motion was introduced by any of the three migrations — each
module's content rendering is unchanged; only the shell wrapping it is
different, and the canonical shell's own reduced-motion/`[data-anim="off"]`
gating (verified generically by `drawer-consolidation-check.mjs`,
unchanged since Phase 8) applies automatically to all consumers, including
these three new ones. No bespoke animation was added to any migrated
module.

---

## 12. Performance

No measured regression. Each migration's runtime cost profile:
- **Gudang:** the new `syncGudangDetailDrawer()` does one string key
  comparison per `render()` call (`` `${kind}:${id}` `` vs. the tracked
  key) — O(1). The additional overlay-scoped listeners (`click`/`input`/
  `dragover`/`dragleave`/`drop`/`paste`) are bound once per fresh
  `openDrawer()` call (a real record switch), not per render — no
  accumulation across `refreshDrawerBody()` calls, which reuse the same
  overlay node and its already-bound listeners.
- **Engineering:** `refreshDrawerBody()` replacing only `.drawer__body`
  markup, rather than the old architecture's full `host.innerHTML`
  replace on every store change while the drawer was open, is a **net
  reduction** in DOM churn per update (fewer nodes destroyed/recreated per
  realtime echo) — not measured with `page.metrics()` this pass (would
  require the same authenticated-content harness constraint every phase in
  this program has disclosed), but structurally strictly less work than
  before, not more.
- **Petty Cash:** identical reasoning — `detailDrawer()`'s computation is
  unchanged (same synchronous store reads), only how its output reaches
  the DOM changed, and via a narrower-scope update path (`refreshDrawerBody`
  vs. a full `shell()` re-render) than before.

No suite in the 1,865-check regression run measured or reported a
performance regression.

---

## 13. Hostile Review

Performed after each migration, before moving to the next — not deferred
to the end:

- **Stray references:** repo-wide grep for the removed close-button
  action names (`gud-detail-close`, `eng-close-drawer`) found zero
  remaining references outside this report's own explanatory comments.
- **Dead CSS:** found and removed in both Gudang (`.gud-drawer`/`-head`/
  `-head-txt`/`-body`/`-foot`, the ≤760px override) and Engineering
  (`.eng-drawer`/`-head`/`-title`/`-loc`/`-body`/`-foot`) — confirmed via
  grep that nothing still referenced them before deleting.
- **Dead JS:** Engineering's `btn()` helper (only used by the deleted
  `actionZone()`) removed after confirming zero remaining call sites.
  Gudang's `focusDrawerOnOpen()` removed after confirming zero remaining
  call sites.
- **Z-index correctness:** for each module, checked whether *every* other
  overlay/modal that CAN legitimately open while the migrated drawer is
  also open (not just the obvious ones) would render above or below it —
  found and fixed 3 previously-invisible-risk cases (Gudang's
  `.gud-scrim.-center` family, Engineering's `.eng-scrim.-center`, Petty
  Cash's `notifModal`/`cycleModal`) that would otherwise have rendered
  unreachably underneath the migrated drawer. `addModal()` in Petty Cash
  was checked and confirmed **not** to need this (its open path always
  clears `st.detailId` first).
- **Business logic:** confirmed unchanged in all three — every action
  dispatcher (`onEngineeringDrawerAction`, `onPettyCashDrawerAction`, and
  Gudang's reused `detailHandlers`) calls the exact same underlying
  engine/service functions with the exact same arguments as the code it
  replaced; no engine/service/store file was touched by this phase.
- **Listener duplication/leaks:** Gudang's overlay-scoped listeners are
  bound once per `openDrawer()` call (a genuinely new overlay node each
  time), never on `refreshDrawerBody()` (same node, already-bound
  listeners) — traced explicitly, not assumed.
- **No unrelated file changes:** `git status` reviewed against file
  modification times (established methodology from the Phase 9 checkpoint)
  — every file touched this phase maps directly to one of the three
  migrations or their regression suites; no drive-by change to navigation,
  Executive, Firebase, or business logic files.

---

## 14. Regression Results

| Suite | Result |
|---|---|
| 20 Gudang suites (`gudang-*-check.mjs` + `gudang-ui-smoke.mjs`) | 918 checks + 1 PASS, 0 failed |
| 9 Engineering suites (`engineering-*-check.mjs/.cjs`) | 384 checks, 0 failed |
| `drawer-consolidation-check.mjs` | 67/67 (52 original + 15 new static checks across all 3 migrations) |
| `pettycash-intelligence-check.mjs` | 29/29 |
| 5 Overtime engine suites | 159 checks, 0 failed (unaffected — no Overtime UI code touched) |
| `scripts/mobile-first-verification-check.mjs` | 42/42 |
| `scripts/workspace-foundation-check.mjs` | 24/24 |
| `scripts/executive-motion-polish-check.mjs` | 16/16 |
| `scripts/motion-performance-hardening-check.mjs` | 16/16 |
| `scripts/navigation-crossfade-check.mjs` | 53/53 |
| `scripts/motion-continuity-orchestration-check.mjs` | 28/28 |
| `scratch/verify-requests-live-diff.mjs` | 68/68 |
| `scratch/verify-pending-workspace-reconciler.mjs` | 61/61 |
| `scripts/smoke-boot.mjs` (real unauthenticated app boot) | PASS, 0 fatal errors |

**Total: 1,865 automated checks + 2 real-boot PASS results, 0 failures
caused by this phase.**

**One pre-existing, unrelated failure found and documented, not fixed:**
`scripts/gudang-security-check.mjs` throws on a `database.rules.json`
JSON-parse error (`Expected property name or '}' at position 6744`).
Confirmed via `git diff --stat -- database.rules.json` (zero output —
untouched this entire session) and `git status --porcelain -- database.
rules.json` (no changes at all) that this predates this session. Firebase/
RTDB rules are explicitly out of scope for this phase (§2) — not
investigated further, not fixed.

No suite was skipped. Every suite listed was actually executed during
this pass.

---

## 15. Files Changed

`js/gudang/ui/gudang-item-detail.js`, `js/gudang/ui/gudang-center.js`,
`gudang.css`, `js/engineering/ui/engineering-drawer.js`,
`js/engineering/ui/engineering-center.js`, `engineering.css`,
`js/petty-cash/petty-cash-center.js`, `scripts/gudang-ui-check.mjs`
(Part F rewritten), `scripts/engineering-ui-dom-check.mjs` (`[drawer
actions]`/`[escaping]` rewritten), `scripts/drawer-consolidation-check.mjs`
(3 new static-verification blocks, "still-deferred" list updated twice as
each migration completed), plus this report and the Overtime audit doc
(new files in `docs/`).

---

## 16. Files Deliberately Untouched

- **Overtime's drawer** (`employeeHistoryDrawer()` in `js/overtime/overtime-center.js`) — audited, classified READY, deliberately not migrated (§7).
- **Executive Command Center** (`js/widgets/executive/*`) — frozen, not referenced by this phase at all.
- **Firebase** (`js/firebase.js`), **permissions** (`canAccessModule`), **RTDB rules** (`database.rules.json`) — untouched; the one RTDB-rules issue found (§14) was investigated only far enough to confirm it's pre-existing and out of scope, not fixed.
- **Business/engine logic** — every action dispatcher added this phase calls pre-existing engine/service functions unchanged; zero engine files were opened for editing.
- **The two competing navigation systems** (Phase 9 checkpoint §4A) — not referenced by this phase.
- **`js/components/drawer.js`** itself — zero changes (§8).
- **Petty Cash's `.pc-add-*` mobile-form classes** (Phase 9) — untouched this phase; only `detailDrawer()` and its surrounding wiring changed in that file.
- **Overtime's mobile table/form fixes** (Phase 9) — untouched; the 5 Overtime engine suites were re-run only to confirm no incidental regression, not because this phase touched Overtime UI.

---

## 17. Evidence Classification

- **VERIFIED:** every regression suite result in §14; the hostile-review
  findings in §13 (all traced by direct grep/diff, not inferred); the
  accessibility-gain table in §9 (each capability's presence confirmed by
  reading `js/components/drawer.js`'s own implementation, which Phase 9's
  own work already established and this phase didn't modify).
- **LOGIC VERIFIED:** the mobile-behavior claim in §10 about each module's
  own content reflowing correctly at mobile widths (reasoned from the diff
  — content CSS unchanged — not freshly screenshotted per module this
  pass); the performance reasoning in §12 (structurally sound, not
  measured with `page.metrics()` this pass).
- **NOT VERIFIED:** real physical device behavior (§10) — same standing
  constraint as every phase in this program.
- **DEFERRED:** Overtime's migration (§7) — audited and found safe, but
  intentionally not implemented this phase, per the phase's own
  instruction to treat this as a scope decision.
- **FROZEN:** Executive Command Center, `js/components/drawer.js`'s public
  API, the two navigation systems, all business/engine logic, RTDB rules —
  none touched.

---

## 18. Known Limitations

- Overtime's drawer remains non-canonical — three of four modules
  identified in Phase 9's checkpoint are migrated, not all four.
- No real-device verification for any of the three migrations, same
  standing constraint disclosed throughout this program.
- The mobile-behavior claim for each migrated drawer's own *content*
  (as opposed to the shared shell, which is thoroughly real-browser
  tested) is LOGIC VERIFIED, not freshly VERIFIED per module this pass —
  a reasoned inference from an unchanged content diff, disclosed as such
  rather than overclaimed.
- Performance improvements from `refreshDrawerBody()`'s narrower update
  scope (§12) are structurally reasoned, not measured with real
  `page.metrics()` numbers this pass.
- The Overtime audit surfaced one pre-existing bug unrelated to this
  phase's own scope (`st.historyEmployeeId` not cleared on screen
  navigation) — documented, not fixed, since fixing it would mean editing
  Overtime UI code this phase deliberately left alone.

---

## 19. Deferred Items

- Overtime drawer migration (§7) — audited, classified READY, left for a
  future pass pending the user's decision to proceed.
- Overtime's `st.historyEmployeeId` state-leak (found during the Overtime
  audit, §7) — a good candidate bonus fix *if and when* that drawer is
  migrated, not fixed now.
- The two competing mobile navigation systems and all Executive/business-
  logic/Firebase work remain exactly as deferred/frozen as the Phase 9
  checkpoint left them — this phase didn't touch any of it.

---

## 20. Git Status

**NOT committed, NOT pushed, NOT deployed, NOT merged.** All work left in
the working tree for review, per instruction.

---

## 21. Definition of Done — checked against the phase's own criteria

**Gudang:** migrated ✓, behavior preserved ✓, focus trap ✓ (inherited),
focus restoration ✓ (inherited), safe-area ✓ (inherited), swipe ✓
(inherited), body scroll lock ✓ (inherited), mobile behavior VERIFIED
(shell) / LOGIC VERIFIED (content), regression suite green ✓ (918 + 67
checks).

**Engineering:** migrated ✓, behavior preserved ✓ (with 2 disclosed
cosmetic simplifications, §5), focus trap ✓, focus restoration ✓,
safe-area ✓, swipe ✓, body scroll lock ✓, mobile behavior VERIFIED (shell)
/ LOGIC VERIFIED (content), regression suite green ✓ (384 + 51 checks).

**Petty Cash:** migrated ✓, all content preserved ✓, all actions
preserved ✓ (1 disclosed cosmetic simplification, §6), focus trap ✓,
focus restoration ✓, safe-area ✓ (improved — was footer-only), swipe ✓,
body scroll lock ✓, mobile behavior VERIFIED (shell) / LOGIC VERIFIED
(content), regression suite green ✓ (29 checks).

**Overtime:** audited ✓, classified READY, **explicitly deferred with
documented technical reasoning** ✓ (§7 and its own audit doc).

**Global:** canonical drawer backwards-compatible ✓ (§8, zero API
changes), existing canonical consumers (Decision Replay, Driver Wellness)
remain green ✓, no navigation changes ✓, no Executive changes ✓, no
business-logic changes ✓, no Firebase/permission changes ✓, no
unexplained working-tree changes ✓ (§13), no dead CSS ✓ (removed, §13),
no listener leaks ✓ (§13), no regression ✓ (§14), no deployment ✓ (§20).

**Phase 10 is complete for its actually-scoped work (Gudang, Engineering,
Petty Cash) and correctly stops short of Overtime per its own
instructions.**
