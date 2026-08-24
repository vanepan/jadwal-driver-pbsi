# Phase 8.4 — Pending Workspace Realtime & Intelligent Diffing: Migration Map

**Status:** Audit + migration map, pre-implementation. No code changed yet.

## 0. Scope

This phase targets **Surface B only** — the modern Pending workspace
(`renderPendingWorkspace()` in `js/app.js` → `#v2PendingWorkspace`), the
surface explicitly deferred at the end of Phase 8.3 (see
[`DESIGN_SYSTEM_PROGRAM_PHASE_8_3_REQUESTS_LIVE_DIFFING_REPORT.md`](DESIGN_SYSTEM_PROGRAM_PHASE_8_3_REQUESTS_LIVE_DIFFING_REPORT.md)
§21). Surface A (legacy Requests modal, `js/requests.js`) is untouched —
its Phase 8.3 reconciler already works correctly and is not modified here.

## 1. Traced flow (current, before this phase)

```
Firebase onValue('driver_requests')            [js/firebase.js, unchanged,
                                                 single listener, ~10 consumers]
    ↓
registerRequestsChangeListener callback         [app.js:12754-12767]
    requests = updatedRequests.map(normalizeRequest)   ← app.js's OWN
                                                          module-level array
                                                          (separate copy from
                                                          requests.js's own
                                                          internal `requests`)
    updateAllModules()  → setRequestsModule(requests)  [keeps requests.js's
                                                          copy in sync too]
    updatePermissionUI()
    (renders dispatchanalytics/wellness/prediction/executive IF that admin
     section is currently open; refreshHomeWorkspace() IF Home is open)
    refreshCommentThreadIfOpen(requests)
    ↓
    ✗ NO call to renderPendingWorkspace(), NO check of
      `currentWorkspace === 'pending'` — unlike every other mutation path.
```

**Root cause confirmed by source read:** `app.js`'s own global `requests`
array (the one `renderPendingWorkspace()` reads directly) is already fresh
by the time this callback returns — the data layer is not the problem. The
problem is narrowly that this one callback never triggers a repaint of
`#v2PendingWorkspace`, unlike the other three places that mutate the same
data and correctly guard `if (currentWorkspace === 'pending')
renderPendingWorkspace();`:

| Call site | Trigger | Has the guard? |
|---|---|---|
| `registerSearchAdapter('driverops').run()` — `app.js:1500-1509` | admin types in the global search box | ✅ |
| `commitApproval()` — `app.js:11851` | this admin's own approve action | ✅ |
| `handleRequestReject()` — `app.js:12184` | this admin's own reject action | ✅ |
| `registerRequestsChangeListener` callback — `app.js:12754-12767` | **another device's** change | ❌ — the gap |

This matches the Phase 8.3 map's prediction exactly: Surface B's defect is
**missing reactivity**, the mechanical opposite of Surface A's **over-
rendering** defect.

## 2. What `renderPendingWorkspace()` does today (`app.js:4323-4420`)

```
container.innerHTML = `
  <div class="v2-workspace-header">…title + subtitle…</div>
  <div class="v2-pending-list">${pending.map(buildCard).join('')}</div>  (or empty-state markup)
`;
container.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', …));
```

A **full rebuild of the entire container** — header, subtitle, and every
card — on every call, then a fresh `addEventListener` on every button. This
is structurally the same "unconditional `innerHTML =`" pattern Phase 8.3
fixed in `js/requests.js`, with one added wrinkle: the container also holds
static header markup (title/subtitle) that Surface A's diffed container
(`#requestsListContent`) never contained — Surface A's header lives outside
the diffed region.

## 3. Why wiring the listener alone is not safe (the reason this needs a diff, not just a call)

Today this full-rebuild function is only reachable from **this admin's own
completed actions** (post-approve, post-reject) or **this admin's own
keystrokes** (search) — all points where nothing else on the card is
concurrently in flight. Wiring the Firebase listener to also call it makes
it reachable from **any other device's change, at any moment**, including
while this admin has an approve/reject action of their own in flight on a
different card in the same list.

Traced the concrete hazard through `handleRequestApproveDirect()` →
`runSaveFeedback()` (`app.js:11665-11680`, `js/components/save-feedback.js`):

1. Admin clicks "Setujui Sesuai Rekomendasi" on card X. `runSaveFeedback`
   sets `button.dataset.sfBusy='1'`, disables the button + its siblings,
   swaps in a spinner — all live mutations on the **actual DOM node**
   `handleRequestActionClick`'s click handler closed over.
2. While `operation()` (the async `commitApproval()`) is still pending, a
   **different** device's change arrives and the listener now calls
   `renderPendingWorkspace()`.
3. A naive full `container.innerHTML = …` rebuild discards every card,
   including card X's button — the live node `runSaveFeedback` is holding
   becomes detached. The freshly rebuilt card X shows a normal, *enabled*
   button (the rebuild has no idea an operation is in flight for that id).
4. The admin can now click "Setujui" on card X **again** — the duplicate-
   submission guard (`dataset.sfBusy`) lives on the node that just got
   discarded, not on the new one — risking a second `commitApproval()` call
   for the same request.
5. Symmetrically, if the first operation then fails, `showError()` writes
   into `errorRegion: card.querySelector('[data-request-error]')`, also
   captured before the rebuild — the error message is written into a
   detached node the admin never sees. The failure is silently swallowed
   from the admin's point of view.

This is the same class of hazard Phase 8.3's map §"DOM identity" section
exists to prevent for Surface A, just not yet built for Surface B because
Surface B was never reachable from a concurrent trigger before. **Conclusion:
the reactivity fix (wiring the listener) and the diffing fix (reconciler)
must ship together here** — shipping the one-line listener wiring alone
would convert a *stale-data* bug into an intermittent *duplicate-approval /
swallowed-error* bug, which is worse.

## 4. Audit table

| Area | Current behavior | Target behavior | Risk | Strategy |
|---|---|---|---|---|
| Firebase listener | `registerRequestsChangeListener` never checks `currentWorkspace` | Add the same one-line guard the other 3 mutation paths already use: `if (currentWorkspace === 'pending') renderPendingWorkspace();` | Low — identical pattern to 3 existing call sites | Add after `refreshCommentThreadIfOpen(requests)` in the callback |
| Render function | Full `container.innerHTML =` rebuild, every call | Diff-based reconciler, same architecture family as Phase 8.3's `reconcileRequestCards` in `js/requests.js`, adapted for `.v2-pending-card` | Medium — the actual logic change; see §3 for why it's required, not optional | New reconciler local to `app.js` (see §5) |
| Header/subtitle | Rebuilt as part of the same `innerHTML` blob as the cards | Rendered once, then only the subtitle **text** (`"N request menunggu"` / `"Tidak ada request pending"`) updates in place — the list is diffed separately | Low | Split the container into a persistent header node + a persistent list node, created once on first render |
| Card identity | `data-request-id="${esc(r.id)}"` already on the card root | Reused as-is as the diff key — same convention as Phase 8.3, no second identity system | None | Reuse directly |
| Event binding | Fresh `addEventListener` on every button, every call (safe today only because the whole container is discarded together) | New/changed cards get fresh listeners on their own buttons only; untouched cards keep theirs | Low | Scope binding to the single created/updated node, not `container.querySelectorAll` |
| Sorting | No independent sort; reproduces whatever order `requests` (filtered to `pending`) is already in | Preserve exactly — reconciler reorders via `insertBefore` to match incoming order, never computes its own sort | Low | Same as Phase 8.3 §"Sorting" |
| Search/filter | `searchQuery` (shared global, `driverops` adapter) filters `pool` before the `pending` filter is applied — **this surface, unlike Surface A, does have live search** | Unchanged filter logic; diff operates on its output. A remote update arriving while the admin has typed a search term must respect the current filter (a newly-pending request that doesn't match the active search must not appear) | Medium — this is the one piece of hostile-review surface Phase 8.3 marked N/A for Surface A but is real here | Reconciler always recomputes `pool`/`pending` from current `requests` + current `searchQuery` inside `renderPendingWorkspace()`, exactly as today — no caching of the filtered set across calls |
| Save-feedback race | Not previously reachable (see §3) | An in-flight `runSaveFeedback` on card X must survive a remote update to card Y (or an unrelated field on card X arriving *after* the admin's own click, which already reflects the optimistic/confirmed state) without losing its busy/disabled state or its error region reference | Medium — the core hazard this phase must not introduce | Reconciler must never recreate a card's outer node while `button.dataset.sfBusy === '1'` on any of its action buttons — skip/defer that card's content update until the busy flag clears (see §6) |
| Empty state | `pending.length === 0` → different `innerHTML` block entirely (no header split) | Explicit empty↔non-empty transition, matching Phase 8.3's 0↔1 handling | Low | Treat as an all-added/all-removed case for the list node; header subtitle text always updates via textContent regardless |
| Recommendation/dispatch fields | Pure data fields on the request object (`recommendedDriver`, `recommendedVehicle`, `dispatchScore`, `recommendation.availabilitySummary`) rendered inline in `buildCard()` — no separate computation call | Unchanged; diffing compares the rendered HTML string per id exactly like Phase 8.3, so a recommendation change is just a normal "content changed" case | Low | No change to `buildCard()`'s own logic |
| Comment/drawer | No comment action exists on this surface's cards (unlike Surface A) | N/A | None | No change needed |
| Motion | No entrance animation exists today for `.v2-pending-card` | Optional: reuse the `.request-card--enter` pattern's convention (restrained, token-driven, `[data-anim="off"]`/reduced-motion-safe) for genuinely new cards only | Low, additive | Mirror Phase 8.3 §"Motion behavior" if the user wants visual parity; can also be skipped as out-of-scope polish — flagging as a decision, not assuming |
| Listener lifecycle | Single `value` listener, registered once at boot, unrelated to workspace nav | Unchanged | None | No change |
| Pre-existing dead filter clause | The search filter's `(r.destination \|\| '').toLowerCase().includes(q)` (`app.js:4333`) references a field that does not exist anywhere on a request object (requests carry `purpose`, not `destination` — that field name only exists on assignments) — always empty string, silently never matches anything | Not part of this phase's brief; noted, not fixed, per this program's convention of flagging pre-existing quirks without scope-creeping into them (Phase 8.3 did the same for the locally-created-request sort-position quirk) | N/A | No change unless the user asks |

## 5. Target architecture

```
Firebase value snapshot (unchanged listener)
    ↓
requests = updatedRequests.map(normalizeRequest)   (unchanged, app.js global)
    ↓
NEW: registerRequestsChangeListener callback gains
     `if (currentWorkspace === 'pending') renderPendingWorkspace();`
     — same one-line guard the other 3 mutation paths already use
    ↓
renderPendingWorkspace()  — called from the same 4 places as today
    ↓
pool = searchQuery ? requests.filter(...) : requests      [unchanged]
pending = pool.filter(r => r.status === 'pending')         [unchanged]
    ↓
NEW: on first call, create persistent header + list DOM once;
     subsequent calls only update subtitle textContent
    ↓
NEW: reconcilePendingCards(listNode, pending):
    - skip any id whose action button currently has dataset.sfBusy==='1'
      (an admin-initiated save is in flight for that card — leave it alone
      entirely this pass; the operation's own onSuccess/error path already
      owns that card's next update)
    - remove: ids gone from `pending`
    - add:    ids new to `pending` → new node (+ optional entrance motion)
    - update: ids whose rendered HTML changed → in-place content swap,
              same outer node
    - move:   native insertBefore to match incoming order
    - untouched ids → zero DOM writes
```

## 6. The one new invariant this phase adds beyond Phase 8.3's playbook

Phase 8.3's reconciler assumed no card has async state in flight when a
remote update lands mid-render, because Surface A's approve/reject actions
open a **separate modal** (`#modalApproveRequest`) rather than running
`runSaveFeedback` on a button living inside the diffed container itself.
Surface B's "Setujui Sesuai Rekomendasi" button runs `runSaveFeedback`
**in place, inside the diffed container** — so this phase's reconciler
needs the busy-skip rule in §5 that Phase 8.3 didn't need. This is the one
genuinely new piece of reconciliation logic beyond porting the existing
pattern.

## 7. What stays untouched

- `js/firebase.js` — zero changes (same reasoning as Phase 8.3 §5: the
  `value` listener feeds too many unrelated consumers to re-scope here).
- `js/requests.js` / Surface A — zero changes.
- `getVisibleRequestsForCurrentUser()` is Surface A-only and is not used by
  Surface B today (`renderPendingWorkspace()` reads `requests` + `isAdmin()`
  directly) — not introduced here either, to avoid a behavior change.
- `commitApproval()`, `handleRequestApproveDirect()`,
  `handleRequestApproveEdit()`, `handleRequestReject()` business logic —
  unchanged; they already just mutate `requests` and call
  `renderPendingWorkspace()` conditionally, which transparently becomes
  cheap under the new reconciler.
- `comments.js`, `refreshCommentThreadIfOpen()` — not applicable to this
  surface (no comment action exists on Pending workspace cards).

## 8. Files expected to change

- `js/app.js` — `renderPendingWorkspace()` becomes a reconciler (new local
  helper functions + 2 new module-level tracking maps, mirroring
  `js/requests.js`'s Phase 8.3 shape); `registerRequestsChangeListener`
  callback gains the one-line workspace guard. `buildCard()`'s own markup/
  logic unchanged, reused as the source of truth for "what should this card
  look like."
- `style.css` — only if the optional entrance motion (§4, flagged as a
  decision) is wanted; otherwise no CSS changes.
- New: a verification script under `scratch/`, following the same
  convention as Phase 8.3's `scratch/verify-requests-live-diff.mjs`
  (real-browser Puppeteer harness — DOM-identity assertions, the busy-skip
  invariant from §6, search-then-remote-update interaction from §4, plus
  the standard add/change/remove/reorder/scroll/focus/reduced-motion matrix).

## 9. Open decisions for the user before implementation

1. **Busy-skip semantics (§5/§6):** while an admin's own approve/reject is
   in flight on card X, a remote update to a *different* field on that same
   request (e.g., someone else also touches it) will not be reflected until
   the in-flight operation's own success/error path re-renders. Confirms:
   this is the same "last local action wins the render" behavior the app
   already has everywhere else (nothing regresses), just made explicit
   instead of accidental. No objection expected, flagging for the record.
2. **Entrance motion (§4):** add the restrained `.request-card--enter`-style
   entrance treatment to newly-arrived pending cards (matches Surface A's
   Phase 8.3 polish), or skip it as out-of-scope visual polish for this
   pass? Either is a small, isolated diff either way.

---

Proceeding to implementation next, scoped exactly to the table above,
pending confirmation on §9.
