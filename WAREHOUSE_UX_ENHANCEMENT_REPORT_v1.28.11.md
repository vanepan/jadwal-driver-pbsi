# Warehouse (Gudang) UX Enhancement — Full Report

Status: implemented, live-verified against production data, **not committed, not pushed**. Base app version at time of work: `1.28.10` (`js/config.js`, unchanged — this pass did not bump the version).

Files touched: `gudang.css`, `js/gudang/ui/gudang-atoms.js`, `js/gudang/ui/gudang-center.js`, `js/gudang/ui/gudang-item-detail.js`.

Scope, per the brief: Adaptive Image Frame, Delete Item, and ESC keyboard priority — UX only, no changes to Firebase, data model, auth, Analytics, OCR, Search, or the Stock/Movement engines.

---

## 1 — Adaptive Image Frame

**Starting state (corrected from the brief's premise):** the brief described photos as "cropped." They were not — all three existing image surfaces (`gudang.css`: `.gud-catalog-card-img img`, `.gud-detail-img img`, `.gud-photo-preview`) already used `object-fit: contain`, never `cover`. The actual gap was shape and whitespace: the catalog card frame was a `4:3` band (not square), bled edge-to-edge via negative margins with zero internal padding, and the detail-drawer frame was a `16:10` band, also unpadded.

**Fixed:**
- `.gud-catalog-card-img` (`gudang.css`) — `aspect-ratio: 4/3` → `1/1` (fixed square), added `padding: 16px; box-sizing: border-box`. Background was already `var(--surface-2)`, which resolves to `#F5F5F7` in light mode (confirmed against `:root` token block) — no change needed there.
- `.gud-detail-img` — `aspect-ratio: 16/10` → fixed `height: 240px` (`220px` on the existing `≤480px` mobile query), `padding: 18px`, `box-sizing: border-box`. Matches the spec's 220–260px range.
- Both frames keep `overflow: hidden`, existing rounded corners, and `object-fit: contain` on the `<img>` — no cropping, no stretching, unchanged from before.
- Add/Edit Item's own photo preview (`.gud-photo-preview`) was left untouched — it wasn't named in the brief (only the catalog grid and Detail Drawer were), and it already used `contain`.

**Live-measured** (logged in, real catalog): catalog card frame `187×187px`, `16px` padding, `rgb(245,245,247)` background. Detail drawer frame `431×240px`, `18px` padding, same background. Both exactly as specified.

---

## 2 — Delete Item

### The architecture conflict, and how it was resolved

`js/gudang/repository/item-repository.js`'s own header explicitly forbids a hard delete, by design: *"FORBIDDEN, on purpose, no exports exist for them: deleteItem (identity is never removed, only deactivated — archiveItem sets active:false)"* — because `Movement`/`AssetHistory` records reference `itemId` permanently, and RTDB rules enforce Movements as append-only (`!data.exists()` on `gudang/movements/{movementId}`, `database.rules.json`), which independently makes a true movement-record delete impossible without a rules change.

The brief's confirmation copy ("permanently removed... cannot be undone") reads like a hard delete. I flagged this conflict rather than silently picking a side. Your decision: **keep the integrity model — the user-facing Delete button archives (soft-deletes), never hard-deletes** — plus a request for a separate, developer-only hard-delete path scoped to records explicitly flagged as test data (see "Outstanding" below).

### What was built

- **`deleteItemButtonBlock(item)`** (`gudang-item-detail.js`) — a "Hapus Item" button in its own `.gud-sec.gud-sec-danger` section (top divider + destructive tint), appended after Edit Item in `renderItemDetail`'s body — visually separated per spec, never adjacent to a normal action.
- **`renderDeleteItemConfirm(st)`** (`gudang-item-detail.js`) — a confirm modal (`st.modal.kind === 'confirmDeleteItem'`) matching the existing `.gud-modal-box` shell family: title "Hapus Item?", body interpolates the real item name into the permanent-removal copy, Cancel + destructive "Hapus Item" buttons, inline error slot.
- **`confirmDeleteItem()`** (`gudang-item-detail.js`) — calls the existing `archiveItem(itemId)` (sets `active: false`). On success: closes both the modal and the drawer, fires a success toast, and calls `refreshCatalog()` — since `gudang-home.js#filteredItems` already excludes `!i.active` items, the item disappears from the grid immediately, with no restore affordance anywhere in Gudang (functionally permanent from this UI). On failure: keeps the modal open with `m.error` shown inline, per spec ("keep drawer open, show proper error message").
- **Wiring** (`gudang-center.js`): a new `gud-item-delete-` action prefix routed alongside the existing `gud-asset-action-` prefix to `detailHandlers.onClick`, now also passed a `showToast` callback; `render()` dispatches `renderDeleteItemConfirm` vs. the existing `renderCatalogModal` based on `st.modal.kind`.
- **Toast infrastructure** (`gudang-center.js`) — Gudang had no toast mechanism at all before this. Added a scoped `st.toast` + `showToast(msg)` (mirrors `petty-cash-center.js`'s own local-toast idiom, the closest architectural twin), rendered via a new `.gud-toast` CSS block (`gudang.css`), self-dismissing after 2.6s.
- **New icon**: `trash` added to the icon set in `gudang-atoms.js`.
- **New button styles** (`gudang.css`): `.gud-btn.-danger` (solid, for the modal's confirm button) and `.gud-btn.-danger-ghost` (for the drawer's trigger button), plus `.gud-sec-danger` (top-divider separator).

**Live-verified**: modal renders "Hapus Item?" with the real item name ("Glue Stick Kenko 25g (Edited)") correctly interpolated into the permanent-deletion copy; Cancel dismisses only the modal, leaving the drawer open (confirmed via DOM state after cancel). The actual confirm button was never clicked against production data — see Verification section.

---

## 3 — ESC Keyboard Priority

**Starting state:** `gudang-center.js#onGlobalKeydown` handled Escape only for `st.modal` (closes it) and for the Spotlight search dropdown's own two-stage clear-then-close reducer (`st.search.status === 'open'`). Pressing Escape while the Item Detail/Asset Detail drawer was open, with no dropdown active, did **nothing** — a confirmed gap, not a guess.

**Fixed** — inserted between the existing modal-check and the existing Ctrl+Enter block, gated to `st.search.status !== 'open'` (so the Spotlight's own already-correct two-stage handling, further down in the same function, is completely untouched):
1. If `document.activeElement === #v2SearchInput` → blur it, `preventDefault`/`stopPropagation`, return.
2. Else if `st.detail` is open → close it (`st.detail = null; render()`), `preventDefault`/`stopPropagation`, return.
3. Else → falls through, no-op.

This preserves "only one UI layer dismissed per press": modal (existing, highest priority) → active Spotlight session (existing, untouched) → focused-but-idle search input (new: blur) → open drawer (new: close) → no-op. Scoped entirely inside Gudang's own `document`-level capture listener (`host.offsetParent === null` early-return guard, unchanged) — nothing in `js/app.js`'s shared search-input Escape listener or any other module was touched, so this cannot affect any other module's keyboard behavior.

**Live-verified** (see Verification section for *how*, given a real environment limitation encountered): search-focused Escape correctly blurred `#v2SearchInput` (`activeElement` went from `v2SearchInput` to empty); drawer-open Escape correctly closed the drawer (`.gud-drawer` gone from DOM afterward).

---

## Verification

Static checks: `node --check` on all three edited JS files (clean), a brace-balance check on `gudang.css` (balanced), and a full manual trace of every new code path (button → handler → state → repository call → toast/refresh) before any live testing.

Live testing required a real login, because Gudang is admin-gated and **this app's Firebase RTDB is real production, even from local dev** — there is no emulator or test project. You provided credentials (`evan` / `1234`) for this purpose. Logged in via Puppeteer against the project's own `temp_server.js` static server, navigated into Gudang, and drove the real catalog (4 real items). At no point was the delete-confirm button actually clicked — every delete-flow check stopped at "modal renders correctly" and then hit Cancel, specifically to avoid writing to production data.

**One real bug was caught and ruled out by this live pass, worth recording:** the first Escape test showed the drawer staying open, which looked like a bug in the new code. Diagnosis: `page.keyboard.press()` was not delivering *any* key event to the page's `document` listeners in this specific headless sandbox — confirmed by testing a plain `'a'` keypress, which also never arrived (`0` listeners fired). This is an environment limitation, not an app bug. Dispatching a directly-constructed `KeyboardEvent('keydown', {key:'Escape'})` via `document.dispatchEvent()` — which exercises the identical application code path a real trusted keydown would, just bypassing Puppeteer's CDP input simulation — closed the drawer correctly on the first attempt, and did so again cleanly in the final full pass. Recorded here so a future session doesn't re-diagnose the same false alarm.

All screenshots and the verification script were written to `scratch/` (this project's existing convention for such artifacts) and deleted afterward; the temporary `console.log` used for the above diagnosis was reverted before the final run. Working tree now contains only the four intended source files.

---

## Outstanding — not built this pass

**Developer-only test-data cleanup workflow.** You asked for items explicitly flagged as test data (e.g. `metadata.isTestData: true` — no such flag exists anywhere in the codebase today, would be new) to be permanently removable, together with their associated Movements, via a separate developer-only surface — explicitly **not** the end-user Delete button, which stays archive-only.

This needs a scoping conversation before implementation, because of one hard technical blocker found during research: **Movements cannot be hard-deleted at all under the current Firebase rules.** `database.rules.json` enforces `!data.exists()` as the `.write` condition on `gudang/movements/{movementId}` — this blocks both overwrite *and* delete of any existing movement record, not just duplicate-id creation. Making test-movement deletion possible would require changing `database.rules.json` itself, which is both a security-relevant change and something the brief explicitly lists as off-limits ("Do NOT modify: Firebase"). Everything else needed is either straightforward (a `deleteItem` hard-delete export would need to be added to `item-repository.js`, cascading to `asset-repository.js` records for Asset-type items) or requires a design decision (where the "developer-only" surface itself lives — this codebase already has two precedents: `js/config.js#isDevelopment()` + a hidden `Ctrl+Shift+D` panel, as `engineering-diagnostics.js` uses, or the Seed Manager's adapter-gated pattern in `engineering/providers/seed-manager.js` — both currently resolve to fully inert in this app since `APP_ENV` ships hardcoded to `'production'`).

Recommend deciding, before any code is written: (a) whether Movement deletion is actually required for this workflow or whether leaving orphaned-but-harmless Movement rows is acceptable (Movement History rows don't display item names at all — confirmed via `movement-history-view.js`/`gudang-movement-history.js` — so an archived/hard-deleted item's history entries would still render correctly, just without a working "click through to item" link), and (b) which of the two existing dev-gating patterns to reuse.
