/* ============================================================
   GUDANG-PATHS.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 3 Ch.03 (domain ownership needs a persistence root
   per domain) — plumbing only, no architectural decision of its own.

   PURPOSE: the single place every Gudang repository gets its RTDB path
   from, so a path never has to be retyped (and risk drifting) across seven
   repository files. Mirrors js/engineering/providers/engineering-provider.js's
   ENGINEERING_PATHS in shape.

   Phase 1.2 Security Hardening (Part 3, "Naming") renamed the Stock path
   from `gudang/stock` to `gudang/stockProjection`. `gudang/stock` sat next
   to `gudang/movements` / `gudang/assets` looking like a peer record store;
   it is not — it is a rebuildable cache (Doc 3 Ch.05), and the physical RTDB
   layout should say so as plainly as the code already does. The exported key
   stays `GUDANG_PATHS.stock` (matching the ratified "Stock" domain name,
   Doc 3 Ch.03) — only the path STRING changed, so every consumer (already
   referencing the key, never the literal string) needed no other edit.

   PURE: plain frozen data. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const GUDANG_ROOT = 'gudang';

export const GUDANG_PATHS = Object.freeze({
  items: `${GUDANG_ROOT}/items`,
  movements: `${GUDANG_ROOT}/movements`,
  assets: `${GUDANG_ROOT}/assets`,
  assetHistory: `${GUDANG_ROOT}/assetHistory`,
  locations: `${GUDANG_ROOT}/locations`,
  departments: `${GUDANG_ROOT}/departments`,
  stock: `${GUDANG_ROOT}/stockProjection`,
});

/** Phase 10.3 (Item Visual Identity) — Firebase STORAGE, not RTDB; a
 *  different service/bucket namespace entirely, but still Gudang's own
 *  prefix, so it lives here rather than being retyped as a literal in
 *  gudang-item-image.js (Part 7's "no hardcoded path literal outside this
 *  file" applies to this namespace too, even though it never touches
 *  GUDANG_PATHS' RTDB tree). */
export const GUDANG_STORAGE_PREFIX = `${GUDANG_ROOT}/item-photos`;
