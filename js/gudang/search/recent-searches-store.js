/* ============================================================
   RECENT-SEARCHES-STORE.JS — Warehouse Search & Discovery (v1.29.0)

   PURPOSE: remember the last few queries a user actually searched for,
   so an empty, freshly-focused search field can offer "search again"
   shortcuts instead of a blank hint (Doc 2 §05: "feels like Spotlight").

   Explicitly LOCAL-ONLY, per the v1.29.0 brief ("Store locally. Do not
   store in Firebase.") — this is a per-device convenience, not
   organizational data, so it never touches a repository, never touches
   RTDB, and carries no business meaning Search Engine's own domain
   model (Doc 3 Ch.08) needs to know about. That also means Search owns
   no PERSISTENCE in the RTDB sense this module's siblings already
   guarantee (see search-resolver.js's own header) — localStorage is a
   browser convenience, not the "one repository per domain" contract
   gudang-ownership-check.mjs enforces for Firebase paths.

   Every localStorage access is wrapped defensively (private/incognito
   mode, storage quota, or a disabled API all throw or silently no-op in
   different browsers) — a broken recent-searches list must never break
   search itself, only degrade to "no history" gracefully. Also kept
   entirely inside function bodies (never touched at module scope) so
   this file still imports cleanly under plain Node, the same
   zero-DOM-at-load-time discipline every other Gudang file already
   follows (see gudang-ownership-check.mjs Part 2).

   PURE-ish: the only side effect is localStorage; no DOM, no Firebase.
   ============================================================ */

'use strict';

const STORAGE_KEY = 'gudang.recentSearches.v1';
const MAX_ENTRIES = 10;

function hasStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false; // some browsers throw merely accessing the global in a locked-down context
  }
}

/** Most-recent-first list of past queries (deduplicated, capped). Never throws. */
export function getRecentSearches() {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'string' && v.length > 0).slice(0, MAX_ENTRIES);
  } catch {
    return []; // corrupt/foreign value under this key — degrade to "no history," never throw into the UI
  }
}

/** Record a query as searched — most-recent-first, deduplicated
 *  case-insensitively (re-searching an existing entry moves it to the
 *  front rather than creating a second row), capped at MAX_ENTRIES. */
export function addRecentSearch(query) {
  const q = String(query || '').trim();
  if (!q || !hasStorage()) return;
  try {
    const existing = getRecentSearches();
    const deduped = existing.filter((entry) => entry.toLowerCase() !== q.toLowerCase());
    const next = [q, ...deduped].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* best-effort — a full/blocked storage must never break search itself */
  }
}

/** Clear the whole history (the overlay's "Hapus Riwayat" button). */
export function clearRecentSearches() {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort, see above */
  }
}
