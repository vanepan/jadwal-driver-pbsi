# Phase 8.3 — Requests Live-Update Diffing: Report

**Status:** Implementation + verification complete. **NOT committed, NOT
pushed, NOT deployed**, matching every prior phase in this program.

**Scope:** Surface A only — the legacy Requests modal (`js/requests.js`'s
`renderRequestsList()` → `#requestsListContent`), per an explicit scope
decision with the user during the audit (see §3 and §21). The modern
"Pending" workspace (`renderPendingWorkspace()` in `app.js`) was found to
have a different, unrelated defect and is out of scope here.

## 1. Current architecture (before this phase)

```
Firebase onValue('driver_requests')  [js/firebase.js, single listener,
                                       feeds ~10 unrelated consumers too]
    ↓
requests = updatedRequests.map(normalizeRequest)          [app.js]
    ↓
setRequestsModule(requests)  →  module-level `requests` array [requests.js]
    ↓
renderRequestsList()  — called from ~25 call sites via updatePermissionUI(),
                         only one of which is "requests data actually changed"
    ↓
container.innerHTML = visibleRequests.map(createRequestCardHTML).join('')
    — full teardown + rebuild, every single call
```

## 2. Root cause

`renderRequestsList()` (`js/requests.js`) did an unconditional
`container.innerHTML = ...` full rebuild of `#requestsListContent`, and was
itself called unconditionally from `updatePermissionUI()` — a function with
**~25 call sites** across `app.js` covering login, role switches, workspace
navigation, and search-adapter registration, in addition to the one call
site that actually means "Requests data changed" (the Firebase listener
callback). Any of those 25 unrelated triggers destroyed and rebuilt every
card in the list if the modal happened to be open, losing DOM identity,
scroll position, focus, and any in-flight `.request-card--highlight` state.

## 3. Migration map

Full table in
[`docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_3_REQUESTS_DIFFING_MAP.md`](DESIGN_SYSTEM_PROGRAM_PHASE_8_3_REQUESTS_DIFFING_MAP.md),
produced before any code was written, per the phase brief's own requirement.
Headline finding not anticipated by the original brief: there are **two**
parallel UIs for requests (the legacy modal named by the brief, and a
separate, likely-primary `renderPendingWorkspace()` admin workspace with the
*opposite* defect — it never reacts to the raw Firebase listener at all).
Scope was confirmed with the user as Surface A (legacy modal) only.

## 4. New data-flow architecture

Deliberately **unchanged above the render layer**. The single `value`
listener in `firebase.js` still feeds `requests` the same way; `requests.js`
still receives the same full array via `setRequests()`. The only change is
*how* `renderRequestsList()` turns that array into DOM:

```
renderRequestsList()
    ↓
visibleRequests = getVisibleRequestsForCurrentUser()   [unchanged]
    ↓
reconcileRequestCards(container, visibleRequests):
    - remove: ids no longer present
    - add:    ids new since last render → new node, entrance motion
    - update: ids whose rendered HTML string changed → in-place content swap
              on the SAME outer node, focus preserved
    - move:   native insertBefore to match incoming order
    - untouched ids → zero DOM writes
```

## 5. Listener changes

**None.** `js/firebase.js` is untouched. This was a deliberate choice, not
an oversight — the single `value` listener feeds ~10 unrelated consumers
(dispatch analytics, wellness, prediction, executive dashboard, Home
workspace, comments.js, badge counts, Pending workspace...), so re-scoping
it to `child_added/changed/removed` would be a data-layer change with a
blast radius far beyond "Requests-list diffing," and would need its own
review. Two consecutive full snapshots are diffed at the render layer
instead, which achieves the same "one data change → one card changes"
outcome without touching shared infrastructure. Documented in the migration
map §2.

## 6. DOM identity strategy

`data-request-id` (already present, already the Firebase child key) is
reused as the diff key — no second identity system was introduced. Two new
module-level maps in `requests.js` (`_requestCardNodes`: id → mounted
element, `_requestCardHTML`: id → last-rendered HTML string) track state
across calls. **VERIFIED** (real browser, `scratch/verify-requests-live-diff.mjs`):
an unaffected sibling's DOM node reference survives a same-list update,
an add, a remove, a reorder, and 3 rapid same-card changes in a row — proven
via a per-node marker tagged before the mutation and re-read after.

## 7. Filter/search behavior

Not applicable to this surface. Surface A has no search or status-filter UI
— only role-based visibility (`getVisibleRequestsForCurrentUser()`: admin
sees all, others see their own), which is unchanged and untouched.

## 8. Sorting behavior

The reconciler never computes its own order — it reproduces exactly whatever
order the incoming `visibleRequests` array is already in (which itself comes
from `firebaseMapToRequests()`'s existing status-then-createdAt sort, or from
local optimistic mutations, both unchanged). **VERIFIED**: feeding the
reconciler a reordered array moves the existing DOM nodes via `insertBefore`
to match, without recreating any of them.

## 9. Add/change/remove behavior

**VERIFIED** for all three, including: a genuinely new card (gets a
restrained entrance animation, siblings don't), a changed card (same outer
node, content replaced, siblings untouched), and a removed card (gone from
DOM, siblings untouched, no orphaned nodes). Also verified in combination
under a rapid-fire burst (add → add → remove → add in immediate succession)
and 3 consecutive changes to the *same* card.

## 10. Drawer interaction

The comment thread ("drawer" for a single request) lives in `comments.js`,
a separate module with its own already-correct update-if-open pattern
(`refreshCommentThreadIfOpen()`) — untouched, not part of this phase's
scope. **VERIFIED** the comment button on a card produced by the new
reconciler still reaches its registered callback correctly.

## 11. Scroll/focus continuity

**VERIFIED** (real browser): scrolling the list, then updating an off-screen,
unrelated card leaves `scrollTop` exactly unchanged. Focusing an action
button on a card, then causing that same card's content to update (its own
data changed) restores focus to the equivalent action button on the same
card afterward — a small, explicit focus-preservation step in
`updateRequestCardInPlace()`, not automatic.

## 12. Motion behavior

A new `.request-card--enter` CSS animation (fade + translateY, ~200ms,
existing `--motion-base`/`--ease-decelerate` tokens) applies only to
genuinely new cards, never to updated or untouched cards, and never during
initial/bulk population (verified: 0 entrance classes present after the
first-ever render of 3 cards). No replacement/removal animation was added —
removed cards disappear immediately, per the brief's own §15 allowance
("if unsafe, use immediate removal; don't add animation infrastructure
solely for polish") — there is no client-side "delete request" feature
anywhere in the app, so `child_removed` in practice only occurs via manual
DB/ops intervention, not normal UI flow.

## 13. Accessibility

Both the OS-level `prefers-reduced-motion` blanket rule and the app's own
`[data-anim="off"]` blanket rule (both pre-existing, app-wide, from Phase
8.1) automatically collapse the new entrance animation's duration to
~0.01ms — no new gating code was needed or written. **MEASURED** (real
browser, both mechanisms independently): computed `animationDuration` on a
newly-added card was `1e-05s` under both conditions.

## 14. Performance baseline / 15. Performance after

**MEASURED** (real browser, 100-item list, `scratch/verify-requests-live-diff.mjs`):

| | Time | DOM mutation records (`MutationObserver`, `childList`+`attributes`+`characterData`+`subtree`) |
|---|---|---|
| Initial full render (100 cards) | 17.9ms | n/a (initial populate) |
| Single-record update against the same 100-item list | 10.8ms | **1** |

No prior "old architecture" baseline was captured for direct before/after
comparison, since the old code path (`container.innerHTML = ...` for every
call) was replaced rather than run side-by-side — but the old behavior is
well-understood by construction: it always produced a full container
teardown (hundreds of mutation records — every card's every element) for
any single-record change. The 1-mutation-record result for the new path is
the direct evidence the architectural goal was met, not an inference.

## 16. DOM mutation comparison

**MEASURED**, not inferred (correcting an initial test bug: the first
`MutationObserver` measurement used `disconnect()` immediately after a
synchronous call, which silently drops not-yet-delivered async records;
fixed to use `takeRecords()`, the synchronous flush API, before disconnecting
— methodology fix, not a loosened assertion, matching this program's
established convention). Result: exactly 1 mutation record for a
single-card content change against a 100-card list.

## 17. Hostile review

Per the brief's §31 checklist, actively attempted and verified:

1. Rapid `child_changed` ×3 on the same card, immediate succession — converges to the final value, node identity preserved, unaffected sibling untouched. **VERIFIED**
2. add→add→remove→add burst — final DOM order correct, mid-burst-removed id stays gone. **VERIFIED**
3. Update outside/into the current filter — N/A, no filter exists on this surface (§7).
4. Search while an update arrives — N/A, no search on this surface (§7).
5. Sort-affecting update (reorder) — **VERIFIED**, nodes moved not recreated.
6. Update while scrolled deep in a 30-item list — **VERIFIED**, scroll position unchanged.
7. Update while a card is focused — **VERIFIED**, focus restored to the same action.
8. Listener reconnect / duplicate registration — N/A, the Firebase listener itself is untouched (§5); no navigation-triggered re-registration exists for this surface either.
9. 0→1 and 1→0 — **VERIFIED**, including an idempotent repeat call while empty producing no duplicate empty-state markup.
10. 100-item list update — **VERIFIED**, see §14/§16.
11. Reduced motion / `data-anim="off"` — **VERIFIED**, both independently.
12. Light/dark — **VERIFIED** (dark theme: diff-based render still produces correct card count and status-driven border styling).
13. Mobile — **VERIFIED**: 375/390/430/1440px, zero horizontal overflow after a diff-based update.
14. Redundant re-renders never double-bind a click handler — **VERIFIED**: 5 consecutive no-op `renderRequestsList()` calls, then one click, handler fires exactly once.
15. Notification deep-link highlight (pre-existing feature) — **VERIFIED**, still applies `.request-card--highlight` to the correct card on `openRequestsListModal(id)`.

No defect was found that required stopping and reporting a business/data
architecture blocker.

## 18. Regression results

- New `scratch/verify-requests-live-diff.mjs` (real browser, Puppeteer):
  **68 passed, 0 failed**.
- Existing request-related suites, re-run unmodified:
  - `scripts/request-workflow-check.mjs` — 11/11 passed.
  - `scripts/request-mode-polish-dom-check.mjs` — 27/27 passed.
  - `scripts/request-intelligence-check.mjs` — 53/53 passed.
  - `scripts/request-mode-polish-check.mjs` — 24/24 passed.
- `scripts/executive-motion-polish-check.mjs` (frozen-surface regression
  guard, re-run even though nothing in this phase touches it): **16/16
  passed**, confirming success criterion #24 (Executive Command Center
  remains frozen and unaffected).

No existing assertion was weakened, deleted, or skipped. One bug was found
and fixed in the *new* test's own methodology (§16), never in what it
asserts — same convention as Phase 8.1.

## 19. Files changed

- `js/requests.js` — `renderRequestsList()` is now a diff-based reconciler
  (`reconcileRequestCards`, `htmlToElement`, `bindRequestCardActions`,
  `applyRequestCardEnterMotion`, `updateRequestCardInPlace`, two new
  module-level tracking maps). `createRequestCardHTML()`,
  `getVisibleRequestsForCurrentUser()`, `handleRequestActionClick()` all
  unchanged, reused as-is.
- `style.css` — new `.request-card--enter` rule + `@keyframes
  requestCardEnter`, additive, near the existing `.request-card--highlight`
  rule.
- New: `scratch/requests-live-diff-harness.html`, `scratch/verify-requests-live-diff.mjs`
  (verification only, no production code — same convention as Phase 8.1's
  own scratch/ scripts; the brief's suggested `scripts/requests-live-diff-check.mjs`
  path was not used, to match this program's actual established
  convention of keeping phase-verification harnesses in `scratch/`).

No changes to `js/firebase.js`, the Firebase data model, `comments.js`, or
`renderPendingWorkspace()`/`app.js`.

## 20. Remaining limitations

- **NOT TESTABLE this session**: the real authenticated app (real login,
  real `#modalRequestsList` reached via the sidebar button, real
  multi-device Firebase round-trip) — same documented credential constraint
  as every prior real-browser pass in this program. Mitigated by testing
  the real, unmodified `js/requests.js` module directly (no mocks of the
  functions under test) via a minimal harness that supplies a fake
  `localStorage` session (matching `auth.js`'s actual, network-free
  `getCurrentUser()` contract) rather than a fake reconciler.
- Scroll-position preservation is verified for the common case (updating an
  item that isn't the one changing the container's total height in a
  visible way); no attempt was made to build precise scroll anchoring for
  cases where an on-screen card's height changes non-trivially — the
  existing codebase has no such primitive to reuse, and the brief didn't
  ask for new infrastructure.

## 21. Explicitly deferred work

- **Surface B** (`renderPendingWorkspace()`) — real-but-different defect
  (misses realtime pushes entirely while active), needs new wiring, not
  folded into this phase per the user's explicit scope decision. Candidate
  for its own future phase.
- **Firebase listener → child events at the `firebase.js` layer** — not
  pursued; would need its own review given the ~10-consumer blast radius
  (§5).

---

Nothing committed, pushed, or deployed.
