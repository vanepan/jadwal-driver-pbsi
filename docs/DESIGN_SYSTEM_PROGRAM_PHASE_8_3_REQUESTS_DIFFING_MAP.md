# Phase 8.3 — Requests Live-Update Diffing: Migration Map

**Status:** Audit + migration map, pre-implementation. No code changed yet.

## 0. Scope decision

The audit found **two separate, parallel UIs** both driven by the same
`/driver_requests` Firebase listener, with two different (near-opposite)
problems:

- **Surface A — the legacy modal.** `js/requests.js`'s `renderRequestsList()`
  → `#requestsListContent`, opened via the sidebar "Requests"/"Pending"
  button (`#btnRequests`). This is what the Phase 8.3 brief and the Phase 8.1
  report both name. Admin sees every request regardless of status; Bidang
  sees only their own. No search/filter UI exists in this surface at all.
- **Surface B — the modern Pending workspace.** `renderPendingWorkspace()` in
  `js/app.js` → `#v2PendingWorkspace`, a dedicated workspace tab (admin-only
  actionable), richer cards with dispatch recommendations, real
  search-as-you-type. This is the surface admins likely use day-to-day, and
  it has the *opposite* defect: the raw Firebase listener callback never
  calls it, so a remote device's change doesn't appear at all while an admin
  is sitting on that tab, until they switch away/back or type a search
  character.

**Decision (confirmed with the user): this phase targets Surface A only.**
Surface B's staleness gap is real but is a different kind of bug (missing
reactivity, not over-rendering) requiring new realtime wiring, not just
diffing — out of scope here, named as deferred work in §12 below, same
convention Phase 8.1 used for its own §21 roadmap.

## 1. Audit table

| Current behavior | Problem | Target behavior | Risk | Strategy | Verification |
|---|---|---|---|---|---|
| `js/firebase.js#initFirebaseSync()` registers one `onValue(driver_requests)` **value** listener, module-level, guarded by `firebaseListening` flag. Feeds ~10 consumers (Requests modal, comments.js, dispatch analytics, recommendation accuracy, wellness, prediction, executive dashboard, Home workspace, Pending workspace, badge counts). | None by itself — the listener is fine. | Unchanged. | Switching to `child_added/changed/removed` at this layer would touch every one of those ~10 consumers — far outside "Requests-list diffing." | **Keep the `value` listener as-is.** Diff two consecutive full snapshots at the render layer instead of switching listener type. | N/A — no change here. |
| `registerRequestsChangeListener` callback (`app.js:12754`) sets `requests = updatedRequests.map(normalizeRequest)`, then `updateAllModules()` → `setRequestsModule(requests)` (module state in `requests.js`). | None — this is a clean state feed. | Unchanged. | None. | Unchanged. | Existing behavior, regression-guarded. |
| `renderRequestsList()` is called **unconditionally** from `updatePermissionUI()`, which has **~25 call sites** in `app.js` (login, role switch, workspace nav, search-adapter registration, etc.) — none of which mean "requests data changed." | Any unrelated UI action tears down and rebuilds `#requestsListContent` if the modal happens to be open; even when closed, it's wasted `innerHTML` work + listener rebinding every time. | Calling `renderRequestsList()` redundantly becomes cheap and safe — a no-op DOM-wise when the underlying visible-request set hasn't changed. | Low if the diff is correct; the alternative (auditing/gating all 25 call sites) is a much bigger, riskier diff for no extra correctness. | Make `renderRequestsList()` itself an idempotent diff-based reconciler. Do **not** touch the 25 call sites — redundant calls become harmless by construction. | New scripted check: call `renderRequestsList()` twice in a row with unchanged state, assert zero DOM mutations the second time. |
| `renderRequestsList()` body: `container.innerHTML = visibleRequests.map(createRequestCardHTML).join('')`, then re-binds a `click` listener on every `[data-request-action]` button, every call. | Full teardown/rebuild on every call — the named bug. Destroys DOM identity, scroll position, focus, in-flight `.request-card--highlight` state. | Reconcile against the previous render: update only changed cards' content, add only new cards, remove only gone cards, move only reordered cards. Untouched cards' DOM nodes and listeners are never touched. | Medium — this is the real logic change. | Snapshot-diff renderer (§2 below). | New `scripts/requests-live-diff-check.mjs` — DOM-identity assertions per plan §26. |
| Card identity: `createRequestCardHTML()` already stamps `data-request-id="${r.id}"` on the card root, where `r.id` is the Firebase child key (`generateId()` at creation, stable for the record's lifetime). | None — already canonical. | Unchanged; reused directly as the diff key. | None. | Reuse `r.id` as-is. No second identity system. | Confirmed via source read; no test needed beyond the diff tests already reusing it. |
| Event binding: one `addEventListener('click', handleRequestActionClick)` per button, attached fresh on every full render. | Under the current full-rebuild model this is fine (old nodes+listeners are discarded together). Under a diff model, re-attaching to *unchanged* nodes would silently accumulate duplicate listeners. | New/content-replaced cards get fresh listeners on their own buttons only; untouched cards keep their existing listeners (still valid — handler reads `dataset` off `currentTarget`, unaffected by sibling changes). | Low. | Scope `querySelectorAll('[data-request-action]')` + `addEventListener` to the single node just created/updated, not the whole container. | Rapid-update test (plan hostile-review #1) checks a button click still fires exactly once after several diff passes. |
| Sorting: no re-sort inside `requests.js`. Order is whatever the module-level `requests` array is in, which comes from `firebaseMapToRequests()` (status: pending<rejected<approved, then `createdAt` desc) on a Firebase echo, or from local optimistic mutations (`.map()` preserves position; `create` appends to the end until the Firebase round-trip re-sorts it). | None new — this ordering quirk (locally-created request briefly out of sorted position) already exists today and is not part of this phase's brief. | Preserve exactly. The diff must reproduce whatever order `visibleRequests` is already in — never re-sort independently. | Low if untouched. | Reorder step operates purely on the **incoming array's order**, doing native `insertBefore` moves to match it — never computes its own sort. | Existing sort-order tests (if any) stay green; new test confirms a reordered incoming array produces a matching DOM order without recreating nodes. |
| Filtering: `getVisibleRequestsForCurrentUser()` — admin sees all, others see own (by `requesterId`/`requesterName`). No search, no status filter in this surface. | N/A — much of plan §9's search/filter risk doesn't apply here (that's Surface B). | Unchanged filter logic; diff operates on its output. | Low. | No change to `getVisibleRequestsForCurrentUser()`. | N/A. |
| Empty state: `visibleRequests.length === 0` → `container.innerHTML = '<div class="empty-request-state">...'`. | Must not regress under diffing (0↔1 transitions, plan §22). | Explicit empty↔non-empty transition handling in the reconciler, clearing/rebuilding internal tracking maps at that boundary. | Low. | Treat "was empty, now has items" as an all-added case and vice versa. | New tests: 0→1, 1→0. |
| No "is the modal currently open" export exists. | Not required — see below. | N/A. | N/A. | Not needed: keeping `#requestsListContent` in sync at all times (visible or not) matches **current** behavior (today's full rebuild also runs while hidden). Diffing makes that cheap instead of adding new lazy-render machinery. | N/A — deliberately not adding scope. |
| Comment thread ("drawer" for a single request): `comments.js`'s `refreshCommentThreadIfOpen()` — separate module, separate state (`modal.dataset.requestId`), already only re-renders if the open thread's comment count actually changed. | None — already correct, already the exact "update in place only if relevant" pattern this phase wants for the list. | Untouched. | None — do not touch `comments.js`. | N/A. | Existing regression tests, unmodified. |
| Notification deep-link highlight: `openRequestsListModal(highlightId)` queries `#requestsListContent [data-request-id="..."]` **after** `renderRequestsList()`, scrolls + adds `.request-card--highlight` for 2s. | Must keep working since it depends on a card with that `data-request-id` existing post-render. | Unchanged behavior; works identically since identity is preserved and this only runs on modal *open* (== full populate path, allowed). | Low. | No change. | Existing behavior re-verified in the browser check matrix. |
| Listener lifecycle: the single `value` listener is registered once in `initFirebaseSync()` at app boot, independent of modal open/close, guarded against double-registration by `firebaseListening`. | N/A — this phase doesn't touch listener registration, so plan §24's "duplicate listener on repeated navigation" risk doesn't apply here. | Unchanged. | None. | No change. | N/A. |
| Counters: `getPendingRequestCount()` computes directly from the `requests` array (not from the DOM). | None — already decoupled from rendering. | Unchanged. | None. | No change. | N/A. |
| Request deletion: no client-side "delete request" code path exists anywhere in `js/` (`child_removed` in practice only occurs via manual DB/ops intervention). | Must still be handled correctly (hostile-review requirement), just doesn't need production-grade animated-exit infrastructure for a path normal UI can't trigger. | Immediate removal (no exit-animation state machine), per the brief's own §15 allowance. | Low. | `container.removeChild()` on the tracked node, drop it from internal maps. | New test creates N cards, removes one, asserts siblings' node identity is untouched. |
| New-item motion: `.request-card` has no entrance animation today. | N/A (no regression risk — nothing to preserve). | A small, restrained entrance (opacity + translateY, ~180ms) for genuinely new cards only, using Phase 8.1's canonical tokens (`--motion-base`, `--ease-decelerate`) and respecting the existing global `[data-anim="off"]` + `prefers-reduced-motion` blanket rules (both already app-wide since Phase 8.1 — no new gating code needed). | Low. | New CSS class, applied only to freshly-created card nodes, not to updated/untouched ones. | Viewport-matrix-style check: reduced-motion / data-anim=off both collapse the new animation, same pattern Phase 8.1's own tests used. |

## 2. Target architecture (Surface A only)

```
Firebase value snapshot (unchanged listener)
    ↓
requests = updatedRequests.map(normalizeRequest)   (unchanged, app.js)
    ↓
setRequestsModule(requests)                         (unchanged, module state)
    ↓
renderRequestsList()  — called from many places, unchanged call sites
    ↓
visibleRequests = getVisibleRequestsForCurrentUser() (unchanged)
    ↓
NEW: reconcile(visibleRequests) against the previous render:
    - compute desired HTML string per request id (reuses createRequestCardHTML, unchanged)
    - compare id-by-id against the last-rendered snapshot
    - remove: ids gone from visibleRequests
    - add: ids new to visibleRequests (entrance motion)
    - update: ids whose rendered HTML string changed (in-place content swap,
      same outer node, focus-preserving)
    - reorder: native insertBefore moves to match incoming order, only where needed
    - untouched ids: zero DOM writes
```

**Why diff two full snapshots instead of switching to `child_added/changed/
removed`:** the single `value` listener in `firebase.js` feeds ~10 unrelated
consumers. Re-scoping it to child events is a data-layer change with a blast
radius far beyond "Requests-list diffing" and would need its own review
(mirrors Phase 8.1's own reasoning for deferring exactly this kind of
cross-cutting change). Diffing consecutive full arrays at the render layer
achieves the same user-visible goal — "one data change → only the affected
request UI changes" — without touching `firebase.js`, the data model, or any
other consumer.

## 3. What stays untouched

- `js/firebase.js` — zero changes.
- Firebase data model / request schema / write paths.
- `getVisibleRequestsForCurrentUser()`, `createRequestCardHTML()`,
  `handleRequestActionClick()` signatures — reused as pure functions.
- `comments.js` (comment-thread drawer) — already correct.
- `renderPendingWorkspace()` / Surface B — explicitly deferred, see §12.
- Approve/reject/edit/create business logic in `app.js` — unchanged; they
  already just mutate the `requests` array and call `updatePermissionUI()`,
  which will transparently benefit from the new diffing renderer.

## 4. Files expected to change

- `js/requests.js` — `renderRequestsList()` becomes a reconciler; new
  internal module state (previous-render tracking maps); `createRequestCardHTML`
  unchanged (reused as the source of truth for "what should this card look
  like").
- `style.css` — new restrained entrance-animation rule for `.request-card`,
  gated by the existing global motion tokens/switches (no new gating logic).
- New: `scripts/requests-live-diff-check.mjs` (regression suite, per plan §32).

## 5. Deferred work

- **Surface B reactivity gap** (`renderPendingWorkspace()` never reacts to
  the raw Firebase listener) — needs new wiring, not just diffing. Real
  candidate for its own future phase (8.3b or similar), not folded in here
  per explicit user decision.
- **Firebase listener → child events** — not pursued (§2); would need its
  own review given the ~10-consumer blast radius.

---

Proceeding to implementation next, scoped exactly to the table above.
