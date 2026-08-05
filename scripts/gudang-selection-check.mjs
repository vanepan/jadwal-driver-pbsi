/* gudang-selection-check.mjs — Gudang v1.29.3, Warehouse Selection Engine.

   Same check()/read() harness as scripts/gudang-filter-check.mjs. Parts:
     A. State                — createSelectionState defaults; isSelected/
                                hasSelection/selectionCount/selectedIds.
     B. Select/Unselect/Toggle — selectOne/unselectOne/toggleSelect mutate
                                in place, same object identity; lastId
                                tracks the most recent explicit selection
                                (the Shift+Click anchor).
     C. Clear                 — clearSelection empties ids AND the anchor.
     D. Select All             — additive (does not clear a pre-existing
                                selection), never touches ids outside what
                                the caller passed in.
     E. Range select           — selectRange walks the caller-supplied
                                order inclusively in EITHER direction from
                                the anchor; falls back to a plain toggle
                                when there is no anchor, or the anchor no
                                longer appears in the supplied order.
     F. Hidden count            — hiddenSelectionCount against a visible-id
                                set (the "N hidden by current filter" line).
     G. Prune                  — pruneSelection drops ids no longer in the
                                inventory, and only those; clears the
                                anchor too if it was the one pruned.
     H. Architecture             — selection-engine.js is genuinely PURE
                                (no DOM/Firebase/repository imports);
                                gudang-center.js/gudang-home.js wire it
                                correctly; the brief's full DO NOT MODIFY
                                surface (Inventory/Goods In/Goods Out/
                                Forecast/Analytics/Search/Filter/Drawer
                                Engines, Vehicle Module, Firebase Schema,
                                Authentication) shows no trace of it.

   Deterministic. No live Firebase, no AI.
   Run: node scripts/gudang-selection-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSelectionState, isSelected, hasSelection, selectionCount, selectedIds,
  selectOne, unselectOne, toggleSelect, clearSelection, selectAll, selectRange,
  hiddenSelectionCount, pruneSelection,
} from '../js/gudang/selection/selection-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Part A — State ──────────────────────────────────────────────────── */
console.log('\n[Part A — State: a fresh selection is empty]');
{
  const sel = createSelectionState();
  check('ids is an empty Set', sel.ids instanceof Set && sel.ids.size === 0);
  check('lastId is null', sel.lastId === null);
  check('hasSelection() is false', !hasSelection(sel));
  check('selectionCount() is 0', selectionCount(sel) === 0);
  check('selectedIds() is an empty array', Array.isArray(selectedIds(sel)) && selectedIds(sel).length === 0);
  check('isSelected() is false for anything', !isSelected(sel, 'item-1'));
}

/* ── Part B — Select/Unselect/Toggle ─────────────────────────────────── */
console.log('\n[Part B — selectOne/unselectOne/toggleSelect: in-place mutation, lastId anchor]');
{
  const sel = createSelectionState();
  selectOne(sel, 'a');
  check('selectOne() adds the id', isSelected(sel, 'a') && selectionCount(sel) === 1);
  check('selectOne() sets lastId to the selected id', sel.lastId === 'a');

  selectOne(sel, 'b');
  check('hasSelection() is true once at least one id is selected', hasSelection(sel));
  check('selectionCount() reflects both selections', selectionCount(sel) === 2);
  check('lastId advances to the most recent selectOne()', sel.lastId === 'b');

  unselectOne(sel, 'a');
  check('unselectOne() removes exactly that id', !isSelected(sel, 'a') && isSelected(sel, 'b') && selectionCount(sel) === 1);
  check('unselectOne() leaves lastId alone when a DIFFERENT id was unselected', sel.lastId === 'b');
  unselectOne(sel, 'b');
  check('unselectOne() clears lastId when the unselected id WAS the anchor', sel.lastId === null);

  toggleSelect(sel, 'c');
  check('toggleSelect() selects an unselected id', isSelected(sel, 'c'));
  toggleSelect(sel, 'c');
  check('toggleSelect() unselects an already-selected id (true toggle, not select-only)', !isSelected(sel, 'c') && selectionCount(sel) === 0);

  const before = sel;
  toggleSelect(sel, 'd');
  check('every mutator operates on the SAME object identity (no clone), matching filter-engine.js\'s own in-place discipline', sel === before);
}

/* ── Part C — Clear ───────────────────────────────────────────────────── */
console.log('\n[Part C — clearSelection: empties ids AND the anchor]');
{
  const sel = createSelectionState();
  selectAll(sel, ['x', 'y', 'z']);
  clearSelection(sel);
  check('clearSelection() empties ids', selectionCount(sel) === 0 && !hasSelection(sel));
  check('clearSelection() also resets lastId (no stale anchor survives a Clear)', sel.lastId === null);
}

/* ── Part D — Select All ──────────────────────────────────────────────── */
console.log('\n[Part D — selectAll: additive, scoped strictly to the ids the caller passed in]');
{
  const sel = createSelectionState();
  selectOne(sel, 'pre-existing');
  selectAll(sel, ['f1', 'f2', 'f3']);
  check('selectAll() is additive — a pre-existing selection survives', isSelected(sel, 'pre-existing'));
  check('selectAll() selects every id passed in', isSelected(sel, 'f1') && isSelected(sel, 'f2') && isSelected(sel, 'f3'));
  check('selectAll() never selects anything the caller did not pass (never "the whole inventory unless every item is visible")', selectionCount(sel) === 4);
  check('selectAll() moves the anchor to the last id in the list passed in', sel.lastId === 'f3');

  const empty = createSelectionState();
  selectAll(empty, []);
  check('selectAll([]) is a safe no-op (an empty filtered result never touches lastId)', selectionCount(empty) === 0 && empty.lastId === null);
}

/* ── Part E — Range select ────────────────────────────────────────────── */
console.log('\n[Part E — selectRange: inclusive, either direction, anchored at lastId]');
{
  const order = ['i1', 'i2', 'i3', 'i4', 'i5'];

  const sel = createSelectionState();
  selectOne(sel, 'i2'); // anchor
  selectRange(sel, order, 'i4');
  check('selectRange() forward from the anchor selects the inclusive range', ['i2', 'i3', 'i4'].every((id) => isSelected(sel, id)) && !isSelected(sel, 'i1') && !isSelected(sel, 'i5'));
  check('selectRange() moves the anchor to the new target (a subsequent Shift+Click ranges from HERE)', sel.lastId === 'i4');

  const sel2 = createSelectionState();
  selectOne(sel2, 'i4');
  selectRange(sel2, order, 'i2');
  check('selectRange() backward from the anchor still selects the inclusive range (order-independent)', ['i2', 'i3', 'i4'].every((id) => isSelected(sel2, id)));

  const sel3 = createSelectionState();
  selectRange(sel3, order, 'i3');
  check('selectRange() with NO anchor yet falls back to a plain toggle of the target only', isSelected(sel3, 'i3') && selectionCount(sel3) === 1);

  const sel4 = createSelectionState();
  selectOne(sel4, 'gone'); // anchor id not present in the supplied order (e.g. filtered out since)
  selectRange(sel4, order, 'i3');
  check('selectRange() falls back to a toggle when the anchor no longer appears in the supplied order', isSelected(sel4, 'i3') && isSelected(sel4, 'gone'));
}

/* ── Part F — Hidden count ────────────────────────────────────────────── */
console.log('\n[Part F — hiddenSelectionCount: "N hidden by current filter"]');
{
  const sel = createSelectionState();
  selectAll(sel, ['a', 'b', 'c', 'd']);
  check('0 hidden when every selected id is currently visible', hiddenSelectionCount(sel, ['a', 'b', 'c', 'd']) === 0);
  check('counts exactly the selected ids missing from the visible set', hiddenSelectionCount(sel, ['a', 'b']) === 2);
  check('accepts a Set directly (not just an array) for the visible-id argument', hiddenSelectionCount(sel, new Set(['a'])) === 3);
}

/* ── Part G — Prune ───────────────────────────────────────────────────── */
console.log('\n[Part G — pruneSelection: the only IMPLICIT way selection may shrink]');
{
  const sel = createSelectionState();
  selectAll(sel, ['keep1', 'keep2', 'archived']);
  pruneSelection(sel, ['keep1', 'keep2']);
  check('pruneSelection() drops exactly the ids no longer in the inventory', isSelected(sel, 'keep1') && isSelected(sel, 'keep2') && !isSelected(sel, 'archived'));
  check('pruneSelection() never drops an id that DOES still exist', selectionCount(sel) === 2);

  const sel2 = createSelectionState();
  selectAll(sel2, ['a', 'b']); // lastId -> 'b'
  pruneSelection(sel2, ['a']); // 'b' (the anchor) is the one removed
  check('pruneSelection() clears lastId when the pruned id WAS the anchor', sel2.lastId === null);

  const sel3 = createSelectionState();
  selectAll(sel3, ['a', 'b']); // lastId -> 'b'
  pruneSelection(sel3, ['a', 'b']); // nothing removed
  check('pruneSelection() leaves lastId alone when nothing was actually pruned', sel3.lastId === 'b');
}

/* ── Part H — Architecture: PURE, correctly wired, DO NOT MODIFY untouched ── */
console.log('\n[Part H — Architecture: selection-engine.js is PURE; DO NOT MODIFY surface shows no trace of it]');
{
  const selCode = read('js/gudang/selection/selection-engine.js');
  check('selection-engine.js imports nothing at all (zero DOM/Firebase/repository reachable even transitively)', !/^import /m.test(selCode));
  check('selection-engine.js never references firebase.js', !selCode.includes('firebase.js'));
  check('selection-engine.js never calls storeFirebaseData/runNodeTransaction', !selCode.includes('storeFirebaseData') && !selCode.includes('runNodeTransaction'));
  check('selection-engine.js never touches window/document/localStorage', !/\b(window|document|localStorage)\./.test(selCode));

  const centerCode = read('js/gudang/ui/gudang-center.js');
  check('gudang-center.js creates exactly one st.selection instance, a sibling of st.detail/st.modal', centerCode.includes('selection: createSelectionState()'));
  check('gudang-center.js prunes selection once per catalog reload (refreshCatalog)', centerCode.includes('pruneSelection(st.selection,'));
  check('gudang-center.js wires Ctrl+A to selectAll() scoped to the Home screen', /ctrlA[\s\S]{0,300}selectAll\(st\.selection/.test(centerCode));
  check('gudang-center.js wires Escape to clearSelection() when a selection is active', /hasSelection\(st\.selection\)[\s\S]{0,80}clearSelection\(st\.selection\)/.test(centerCode));

  const homeCode = read('js/gudang/ui/gudang-home.js');
  check('gudang-home.js exports visibleHomeItemIds (the Select All / range-select id source)', /export function visibleHomeItemIds\(st\)/.test(homeCode));
  check('gudang-home.js renders a per-card checkbox (gud-home-sel-toggle) and the Selection Mode bar', homeCode.includes('gud-home-sel-toggle') && homeCode.includes('gud-sel-bar'));

  for (const rel of [
    'js/gudang/repository/item-repository.js', 'js/gudang/consumable/goods-out-engine.js',
    'js/gudang/consumable/goods-in-engine.js', 'js/gudang/analytics/analytics-engine.js',
    'js/gudang/search/search-resolver.js', 'js/gudang/filters/filter-engine.js',
    'js/gudang/ui/gudang-item-detail.js', 'js/vehicles-store.js', 'database.rules.json', 'js/auth.js',
  ]) {
    const code = read(rel);
    check(`${rel} (Do Not Modify) shows no trace of the Selection Engine`, !code.includes('selection-engine') && !code.includes('st.selection'));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
