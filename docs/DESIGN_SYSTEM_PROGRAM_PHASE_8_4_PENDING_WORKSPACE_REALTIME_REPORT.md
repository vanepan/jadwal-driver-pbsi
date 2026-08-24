# Phase 8.4 — Pending Workspace Realtime & Intelligent Diffing: Report

**Status:** Implementation + verification complete. **NOT committed, NOT
pushed, NOT deployed**, matching every prior phase in this program.

**Scope:** Surface B only — the modern Pending workspace
(`renderPendingWorkspace()` in `js/app.js` → `#v2PendingWorkspace`),
explicitly deferred at the end of Phase 8.3. Surface A (legacy Requests
modal, `js/requests.js`) is untouched.

## 1. Root cause (confirmed by source read, matched the Phase 8.3 prediction)

`registerRequestsChangeListener`'s callback (`js/app.js`, inside the main
`DOMContentLoaded` handler) already refreshed `requests` correctly on every
remote change, but never called `renderPendingWorkspace()` or checked
`currentWorkspace === 'pending'` — unlike the other three places that
mutate the same data (`commitApproval()`, `handleRequestReject()`, the
`driverops` search adapter), which all already had that exact guard. Data
was always fresh; only the repaint trigger was missing.

## 2. Why the fix couldn't be "just add the missing guard"

`renderPendingWorkspace()` did an unconditional `container.innerHTML = …`
full rebuild, same as Surface A before Phase 8.3. Wiring the Firebase
listener to call it directly would have made that rebuild reachable from
**any other device's change, at any moment** — including while this admin
has "Setujui Sesuai Rekomendasi" in flight on a card in the same list.
Traced the concrete hazard through `handleRequestApproveDirect()` →
`runSaveFeedback()`: the save-feedback state machine holds a live reference
to the actual button DOM node (`dataset.sfBusy` duplicate-submission guard,
spinner/checkmark, the inline error region). A naive rebuild landing
mid-operation would detach that node — the rebuilt card shows a normal,
enabled button, so the admin could double-click "Setujui" and trigger a
second `commitApproval()` for the same request, and a failed save's error
message would be written into a now-detached node the admin never sees.
Full analysis: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_4_PENDING_WORKSPACE_REALTIME_MAP.md` §3.

**Conclusion:** the reactivity fix and a diff-based reconciler had to ship
together — confirmed with the user before implementation (see the map's §9,
both open decisions resolved: add the entrance-motion polish, proceed with
the busy-skip rule below).

## 3. What changed

- **`registerRequestsChangeListener` callback** (`js/app.js`) gained the
  same one-line guard the other three mutation paths already had:
  `if (currentWorkspace === 'pending') renderPendingWorkspace();`.
- **`renderPendingWorkspace()`** is now a diff-based reconciler, same
  architecture family as Phase 8.3's `reconcileRequestCards` in
  `js/requests.js`, adapted for `.v2-pending-card`:
  - Persistent header (title once, subtitle text updates only) + a
    persistent list/empty-state body, instead of rebuilding the whole
    container (including the header) every call.
  - `reconcilePendingCards()`: per-id add/update/remove/reorder, reusing
    the existing `data-request-id` as the diff key. Untouched cards get
    zero DOM writes.
  - New CSS entrance animation (`.v2-pending-card--enter`, `platform.css`)
    for genuinely new cards, gated for free by the app's existing
    `[data-anim="off"]` and `prefers-reduced-motion` blanket rules.
- **New invariant beyond Phase 8.3's playbook — busy-skip:**
  `isPendingCardBusy(node)` (`!!node.querySelector('[data-sf-busy="1"]')`)
  makes the reconciler skip content-updating or removing a card while its
  own action button has a `runSaveFeedback()` operation in flight. This is
  new because Surface A's approve/reject actions open a separate modal,
  while Surface B's direct-approve button runs `runSaveFeedback` in place,
  inside the diffed container — the one structural difference from Phase
  8.3's original assumptions (map §6). Reordering a busy card is still
  allowed (a plain `insertBefore` move never recreates the node, so it
  can't disturb the in-flight operation).
- **`handleRequestApproveDirect()`** gained one flush call after
  `await runSaveFeedback(...)` settles: because `commitApproval()` itself
  already calls `renderPendingWorkspace()` internally *while* the button is
  still busy, that internal render correctly leaves the card alone (busy-
  skip) — this flush call is what actually removes/updates it once the
  busy flag clears. **Behavior note:** this is a small, deliberate
  improvement over the prior full-rebuild behavior — previously the
  approved card's DOM was destroyed the instant `commitApproval()` resolved
  (mid-spinner, before the success checkmark could ever be seen, which is
  why the design already routed visible success feedback to the
  `requestCountBadge` pulse instead). Now the card survives through the
  success/error beat and only updates once `runSaveFeedback` finishes.

## 4. What stays untouched

- `js/firebase.js` — zero changes (same reasoning as Phase 8.3: the
  shared `value` listener feeds too many unrelated consumers to re-scope).
- `js/requests.js` / Surface A — zero changes, re-verified unmodified
  (§6 below).
- `commitApproval()`, `handleRequestApproveEdit()`, `handleRequestReject()`
  business logic — unchanged.
- `getVisibleRequestsForCurrentUser()` — Surface A-only, not introduced
  into Surface B (which reads `requests` + `isAdmin()` directly, as before).

## 5. Files changed

- `js/app.js` — `registerRequestsChangeListener` callback (+1 line);
  `renderPendingWorkspace()` split into `buildPendingCardHTML()`,
  `pendingCardHtmlToElement()`, `bindPendingCardActions()`,
  `applyPendingCardEnterMotion()`, `isPendingCardBusy()`,
  `updatePendingCardInPlace()`, `reconcilePendingCards()`, and a thin
  `renderPendingWorkspace()` wrapper, plus 2 new module-level tracking maps
  (`_pendingCardNodes`, `_pendingCardHTML`); `handleRequestApproveDirect()`
  gained the post-settle flush render.
- `platform.css` — new `.v2-pending-card--enter` rule + `@keyframes
  v2PendingCardEnter`, additive, placed next to `.v2-pending-card`.
- New: `scratch/pending-workspace-reconciler-harness.html`,
  `scratch/verify-pending-workspace-reconciler.mjs` (verification only).

## 6. Verification

**Why a harness that copies the algorithm instead of importing `js/app.js`
directly:** `js/app.js` has zero `export` statements — it is the
application's monolithic bootstrap entrypoint, not an importable module.
Loading it in a browser harness would execute its real
`document.addEventListener('DOMContentLoaded', …)` bootstrap, which calls
`initFirebaseSync()` and performs real reads/writes against the
**production** Firebase RTDB — a hard constraint already established in
this project (`js/firebase.js` always hits real production data, even in
local/headless scripts). So `scratch/pending-workspace-reconciler-harness.html`
contains a byte-for-byte copy of the new functions, clearly labeled as
such, and `scratch/verify-pending-workspace-reconciler.mjs` (Puppeteer,
same pattern as Phase 8.3's own harness) drives it:

- Initial bulk render — 3 cards, correct order, no entrance animation, correct subtitle. **PASS**
- Remote add while nothing busy — new card + entrance motion, siblings' node identity preserved. **PASS**
- **The new invariant** — a card with `data-sf-busy="1"` survives being
  omitted or changed by a concurrent remote render (content untouched,
  identity preserved, busy flag itself untouched); once busy clears, the
  next render flushes the deferred change. **PASS**
- A busy card can still be reordered (moved, not recreated) while busy. **PASS**
- Non-busy removal — card gone, siblings untouched. **PASS**
- Search-filter integration — a remote-arrived request that doesn't match
  the active search term is correctly excluded from the diffed list. **PASS**
- Focus continuity, scroll continuity (30-item list, off-screen update). **PASS**
- Empty-state transitions (1→0, idempotent repeat while empty, 0→1). **PASS**
- 5 redundant re-renders never double-bind a click handler. **PASS**
- `[data-anim="off"]` and `prefers-reduced-motion` both collapse the new
  entrance animation. **PASS**
- Dark theme + mobile viewports (375/390/430/1440px) — no horizontal
  overflow after a diff-based update. **PASS**
- Hostile rapid burst — a busy card survives being dropped from three
  consecutive incoming lists mid-burst, then correctly resolves to the true
  final state once busy clears. **PASS**

**Result: 57 passed, 0 failed.**

Existing suites, re-run unmodified to confirm no regression:

- `scratch/verify-requests-live-diff.mjs` (Phase 8.3, Surface A) — **68/68 passed.**
- `scripts/request-workflow-check.mjs` — **11/11 passed.**
- `scripts/request-mode-polish-dom-check.mjs` — **27/27 passed.**
- `scripts/request-intelligence-check.mjs` — **53/53 passed.**
- `scripts/request-mode-polish-check.mjs` — **24/24 passed.**
- `scripts/executive-motion-polish-check.mjs` (frozen-surface regression guard) — **16/16 passed.**

**Total across this session: 256 checks, 0 failures.** `node --check js/app.js` also passes.

## 7. Remaining limitations

- **NOT TESTABLE this session:** the real, wired `renderPendingWorkspace()`
  inside the actual running app (real login, real `#v2PendingWorkspace`,
  real multi-device Firebase round-trip) — same documented constraint as
  every prior real-browser pass in this program, sharpened here by
  `js/app.js` having no exports and no safe way to import it without
  triggering production Firebase calls. Mitigated as described in §6: the
  real, unmodified algorithm (copied, not reimplemented-from-scratch) was
  exercised directly, and the actual `js/app.js` edit was independently
  re-read end-to-end for wiring correctness (container ids, call sites,
  the busy-skip/flush interaction with `commitApproval()`).
- Concurrent edits to the exact same request from two different admins
  (e.g., both approve request X at once) are a pre-existing conflict-
  resolution gap this phase does not attempt to solve — the reconciler
  reflects whatever `requests` says, last-render-wins, the same as every
  other surface in the app today. Not part of this phase's brief
  (realtime *reflection*, not concurrent-edit *resolution*).

---

Nothing committed, pushed, or deployed.
