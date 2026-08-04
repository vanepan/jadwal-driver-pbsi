/* ============================================================
   SEARCH-RESOLVER.JS — Gudang Foundation (Phase 1, Part 7; extended Phase 3)

   Authorized by: Doc 1 Art.III (Search First) / R-13 (search resolves into
   action) · Doc 2 §05 (Search) · Doc 3 Ch.08 (Search Engine)

   PURPOSE: the permanent resolution architecture Document 3 Ch.08 requires:

       search()
         ↓
       resolver()
         ↓
       engine owner

   `search()` finds raw candidate records. `resolve()` turns one candidate
   into a SearchResult, naming which actions are valid for it — this is
   Action Resolution (Ch.08): Search DECIDES what is valid, it never
   performs it (Doc 4 Art.IV: "Search may resolve into any engine. Search
   may never become the engine it resolves into.").

   The "engine owner" step is deliberately a data table, not a dispatch call
   in this phase: ACTIONS_BY_DOMAIN only NAMES which actions a domain could
   resolve into (today: 'open' only). No Goods In/Out/Adjust engine exists
   yet to hand off to (Phase 1 forbids building them), so no action beyond
   'open' is offered — adding a real action here belongs to the phase that
   builds the engine which owns it, never to this file guessing ahead.

   Explicitly NOT implemented: QR/Barcode/NFC entry, conversational search.
   Named seams, not silent omissions (Doc 3 Ch.03/12, Doc 4 Art.VI).

   RANKING (v1.29.0, Warehouse Search & Discovery): item candidates are now
   ordered by match-tier — exact name, starts-with, alias, partial name,
   category, then everything else itemMatchesQuery() already matched (Ukuran/
   Jenis) — via matchTier() below, a NEW function. itemMatchesQuery() ITSELF
   is untouched byte-for-byte: it is also the exact predicate gudang-goods-
   out.js/gudang-goods-in.js use to filter their own item pickers, and the
   v1.29.0 brief forbids modifying Goods In/Out — ranking is a strictly
   additive ORDERING layer over the same match set, never a redefinition of
   what matches. Locations/departments keep their previous first-match order
   (out of this brief's stated scope: "Exact Name Match... Category Match"
   describes an Item's own fields).

   EXTENDED — Phase 3 (Universal Search Foundation): item matching now also
   checks Item.aliases, not only Item.name. Doc 1 Art.III is explicit that
   "every item... must be reachable through search — by name, by common
   alias" — Phase 1 only matched name, leaving that sentence unmet. Item
   already computes `aliases` (Phase 2); this reuses it as-is, no new
   identity field, no ranking, still plain substring — the same matching
   rule extended to a second, already-owned field, not a new one.

   Still explicitly NOT wired in by Phase 3: Phase 2's prepared inverted
   keyword index (under search/, see that file's own header). Its lookup is
   exact-token-only, so swapping it in as the primary matcher would stop
   "Tis" from matching "Tisu" mid-type — a live-narrowing regression against
   Doc 2 §05 ("typing narrows the result list live"). It remains a dormant
   seam for whenever catalog size actually makes substring scanning a Doc 3
   Ch.13 performance concern — not asserted today, so not activated today
   (Doc 4 Art.VI).
   ============================================================ */

'use strict';

import { listItems } from '../repository/item-repository.js';
import { listLocations } from '../repository/location-repository.js';
// Phase 10.1: "department" candidates come from the real Bidang roster in
// User Management (gudang-bidang-source.js), not department-repository.js,
// which nothing ever populated — same source Goods Out's picker now uses.
import { listBidang } from '../config/gudang-bidang-source.js';
import { makeSearchResult } from '../contracts/search-result-contract.js';
import { success } from '../repository/repository-result.js';

/** Which actions each domain may resolve into today. Data only — see header. */
const ACTIONS_BY_DOMAIN = Object.freeze({
  item: Object.freeze(['open']),
  location: Object.freeze(['open']),
  department: Object.freeze(['open']),
});

const ID_FIELD_BY_DOMAIN = Object.freeze({
  item: 'itemId',
  location: 'locationId',
  department: 'departmentId',
});

function matches(text, query) {
  return String(text || '').toLowerCase().includes(query);
}

/**
 * Pure predicate: does this Item match `query`, by name, alias, category, or
 * its freeform metadata descriptors (Doc 1 Art.III — see the header note
 * above; Phase 10.1 Part 11 — "Nama/Alias/Ukuran/Jenis/Kategori/Lokasi
 * participate in search... Item remains the identity owner," so this stays
 * the one predicate, just reading two more already-owned fields). Exported
 * so the rule is unit-testable without a live Firebase connection.
 * @param {import('../contracts/item-contract.js').Item} item
 * @param {string} query
 * @returns {boolean}
 */
export function itemMatchesQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return false;
  if (matches(item.name, q)) return true;
  if (matches(item.category, q)) return true;
  if (matches(item.metadata?.variant, q)) return true;
  if (matches(item.metadata?.jenis, q)) return true;
  return (item.aliases || []).some((alias) => matches(alias, q));
}

/**
 * Match-tier for an Item already known to satisfy itemMatchesQuery() — lower
 * is a stronger match. Mirrors the v1.29.0 brief's stated priority order
 * exactly: Exact Name > Starts With > Alias > Partial Name > Category >
 * (everything else — Ukuran/Jenis, the closest owned equivalent to the
 * brief's "Description," since Item has no literal description field).
 * Pure, exported for unit testing. Never called by Goods In/Out — they only
 * ever use the untouched itemMatchesQuery() boolean above.
 * @param {import('../contracts/item-contract.js').Item} item
 * @param {string} q - already trimmed + lowercased
 * @returns {number} 0 (best) .. 6 (weakest)
 */
export function matchTier(item, q) {
  const name = String(item.name || '').toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  const aliases = (item.aliases || []).map((a) => String(a).toLowerCase());
  if (aliases.some((a) => a === q || a.startsWith(q))) return 2;
  if (name.includes(q)) return 3;
  if (matches(item.category, q)) return 4;
  return 5; // Ukuran/Jenis match, or an alias matched only as a mid-string substring
}

/**
 * Find raw candidates across every domain Search Engine currently indexes.
 * Item candidates are ordered by matchTier() (v1.29.0); locations and
 * departments keep first-match, domain-listed order (out of this brief's
 * stated scope — see this file's header).
 * @param {string} query
 * @param {{items?:object[], locations?:object[]}} [preloaded] - already-
 *   loaded catalog arrays (e.g. gudang-center.js's own st.data), so a
 *   caller that re-searches on every keystroke never forces a fresh
 *   Firebase read each time (v1.29.0 Feature 8: Performance). Omit either
 *   to fall back to this file's own repository read, unchanged from before.
 * @returns {Promise<{ok:boolean, data:Array<{domain:string, record:object}>, error:*}>}
 */
export async function search(query, preloaded = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return success([]);

  const [itemsRes, locationsRes] = await Promise.all([
    Array.isArray(preloaded.items) ? Promise.resolve(success(preloaded.items)) : listItems(),
    Array.isArray(preloaded.locations) ? Promise.resolve(success(preloaded.locations)) : listLocations(),
  ]);
  if (!itemsRes.ok) return itemsRes;
  if (!locationsRes.ok) return locationsRes;
  const departments = listBidang(); // sync — an in-memory filter, not a repository read

  const itemCandidates = itemsRes.data
    .filter((i) => itemMatchesQuery(i, q))
    .map((record) => ({ domain: 'item', record, _tier: matchTier(record, q) }))
    // Stable sort (spec engines guarantee this): ties keep their original
    // relative order, so within a tier this is still "first match wins,"
    // exactly as before — ranking narrows ties, it never reshuffles them.
    .sort((a, b) => a._tier - b._tier)
    .map(({ domain, record }) => ({ domain, record })); // strip the scratch field — candidate shape stays {domain, record}

  const candidates = [
    ...itemCandidates,
    ...locationsRes.data.filter((l) => matches(l.name, q)).map((record) => ({ domain: 'location', record })),
    ...departments.filter((d) => matches(d.name, q)).map((record) => ({ domain: 'department', record })),
  ];
  return success(candidates);
}

/**
 * Resolve one raw candidate into a SearchResult. Pure — no I/O, no side effect.
 * @param {{domain:string, record:object}} candidate
 * @returns {import('../contracts/search-result-contract.js').SearchResult}
 */
export function resolve(candidate) {
  const { domain, record } = candidate;
  const idField = ID_FIELD_BY_DOMAIN[domain];
  return makeSearchResult({
    ownerDomain: domain,
    refId: record[idField],
    label: record.name,
    hint: null, // Quiet Intelligence hints are Analytics Engine's output (Ch.09/10) — none exists yet
    actions: [...(ACTIONS_BY_DOMAIN[domain] || [])],
  });
}

/** Convenience: search() then resolve() every candidate in one call. */
export async function searchAndResolve(query, preloaded = {}) {
  const res = await search(query, preloaded);
  if (!res.ok) return res;
  return success(res.data.map(resolve));
}
