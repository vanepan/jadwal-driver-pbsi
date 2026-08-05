/* ============================================================
   SELECTION-ENGINE.JS — Warehouse Selection Foundation (v1.29.3)

   PURE. No DOM, no Firebase, no window, no localStorage — same
   discipline as filters/filter-engine.js. Owns exactly one thing:
   which item ids are currently selected, and the small set of
   operations every future Warehouse bulk feature (Bulk Goods Out,
   Bulk Archive, Bulk Edit, Bulk Export, Bulk Print, and later Bulk
   Barcode/QR) will need to read or mutate. This release does NOT
   implement any bulk action — only the reusable foundation those
   actions will consume (Do Not Modify: Inventory/Search/Filter/
   Drawer Engines, Goods In/Out, Analytics — none of them are
   touched by this file or need to be to use it later).

   LIFECYCLE: the caller (gudang-center.js) owns ONE instance,
   created once at st.selection — a sibling of st.detail/st.modal,
   never nested inside a screen-specific field — so it survives
   search, filter, sort, and drawer-open/close for free, exactly
   the way those siblings already do (see filter-engine.js's own
   header for why that placement, not this file, is what makes
   persistence automatic). The only two things that ever remove an
   id are an explicit clearSelection() and pruneSelection() (called
   once per catalog reload, for the case an item was archived/
   removed and its id must stop being selectable) — never a
   re-render, a filter change, or a drawer open/close.

   STATE SHAPE: { ids: Set<string>, lastId: string|null }. There is
   no separate "selection mode" flag — hasSelection(sel) (ids.size
   > 0) IS the mode, on purpose ("Selection begins naturally," no
   explicit Enter Selection Mode button anywhere in the brief).
   `lastId` is the Shift+Click range-select anchor, not necessarily
   "the most recently selected id" — selectAll/pruneSelection move
   it without pretending to establish a meaningful anchor for a
   subsequent range-select across an unrelated jump.

   EXTENSION POINTS for v1.29.4 Bulk Operations: selectedIds(sel) is
   the one function a bulk action needs, to find out what to act
   on; clearSelection(sel) is what it calls once the action
   completes. Nothing about what a bulk action DOES belongs in this
   file — this only ever answers "what is selected," never "what
   should happen to it."
   ============================================================ */

'use strict';

/** Fresh, empty selection state. */
export function createSelectionState() {
  return { ids: new Set(), lastId: null };
}

export function isSelected(sel, id) {
  return sel.ids.has(id);
}

/** True the instant one or more items are selected — every UI surface that
 *  needs to know whether "Selection Mode" is active reads this, never a
 *  separate mode flag that could drift out of sync with the ids themselves. */
export function hasSelection(sel) {
  return sel.ids.size > 0;
}

export function selectionCount(sel) {
  return sel.ids.size;
}

export function selectedIds(sel) {
  return Array.from(sel.ids);
}

export function selectOne(sel, id) {
  sel.ids.add(id);
  sel.lastId = id;
}

export function unselectOne(sel, id) {
  sel.ids.delete(id);
  if (sel.lastId === id) sel.lastId = null;
}

export function toggleSelect(sel, id) {
  if (sel.ids.has(id)) unselectOne(sel, id);
  else selectOne(sel, id);
}

/** Clears every selected id AND the range-select anchor — one of the only
 *  two ways selection is meant to end (the other is an item leaving the
 *  inventory — see pruneSelection). */
export function clearSelection(sel) {
  sel.ids.clear();
  sel.lastId = null;
}

/** Select every id in `ids` — additive, does not clear whatever was already
 *  selected (matches Finder/Photos' own Select All when some items were
 *  already individually selected beforehand). Callers MUST pass the
 *  currently filtered id list, never the whole inventory — "Select All
 *  applies only to the currently filtered results," never silently
 *  selecting hidden items. */
export function selectAll(sel, ids) {
  ids.forEach((id) => sel.ids.add(id));
  if (ids.length) sel.lastId = ids[ids.length - 1];
}

/** Range-select: every id between the current anchor (sel.lastId) and
 *  `targetId`, inclusive, ordered by the caller-supplied `orderedIds` (this
 *  file never re-derives visible/filtered order itself). Falls back to a
 *  plain toggle when there is no anchor yet, or the anchor no longer
 *  appears in `orderedIds` (e.g. filtered out since) — a range needs two
 *  real endpoints in the same list or it isn't a range. */
export function selectRange(sel, orderedIds, targetId) {
  const a = sel.lastId == null ? -1 : orderedIds.indexOf(sel.lastId);
  const b = orderedIds.indexOf(targetId);
  if (a === -1 || b === -1) { toggleSelect(sel, targetId); return; }
  const from = Math.min(a, b), to = Math.max(a, b);
  for (let i = from; i <= to; i++) sel.ids.add(orderedIds[i]);
  sel.lastId = targetId;
}

/** Count of selected ids NOT present in `visibleIds` — "N hidden by
 *  current filter," so a filter narrowing the grid never looks like it
 *  silently dropped a selection. */
export function hiddenSelectionCount(sel, visibleIds) {
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  let hidden = 0;
  sel.ids.forEach((id) => { if (!visible.has(id)) hidden++; });
  return hidden;
}

/** Drops any selected id that no longer exists in the inventory — the ONLY
 *  implicit (non-explicit-Clear) way selection may shrink, per the brief
 *  ("Only removing an item from inventory or explicit Clear Selection may
 *  remove it"). Call once per catalog reload. */
export function pruneSelection(sel, existingIds) {
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds);
  sel.ids.forEach((id) => { if (!existing.has(id)) sel.ids.delete(id); });
  if (sel.lastId != null && !existing.has(sel.lastId)) sel.lastId = null;
}
