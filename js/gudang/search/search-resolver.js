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

   Explicitly NOT implemented, per the Phase 1 brief: fuzzy ranking (matching
   is plain case-insensitive substring, first-match order only), QR/Barcode/
   NFC entry, conversational search. All three are named seams, not silent
   omissions (Doc 3 Ch.03/12, Doc 4 Art.VI).

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
import { listDepartments } from '../repository/department-repository.js';
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
 * Pure predicate: does this Item match `query`, by name OR by any alias
 * (Doc 1 Art.III — see the header note above). Exported so the rule is
 * unit-testable without a live Firebase connection.
 * @param {import('../contracts/item-contract.js').Item} item
 * @param {string} query
 * @returns {boolean}
 */
export function itemMatchesQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return false;
  if (matches(item.name, q)) return true;
  return (item.aliases || []).some((alias) => matches(alias, q));
}

/**
 * Find raw candidates across every domain Search Engine currently indexes.
 * No ranking — candidates are returned in first-match, domain-listed order.
 * @param {string} query
 * @returns {Promise<{ok:boolean, data:Array<{domain:string, record:object}>, error:*}>}
 */
export async function search(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return success([]);

  const [itemsRes, locationsRes, departmentsRes] = await Promise.all([
    listItems(), listLocations(), listDepartments(),
  ]);
  if (!itemsRes.ok) return itemsRes;
  if (!locationsRes.ok) return locationsRes;
  if (!departmentsRes.ok) return departmentsRes;

  const candidates = [
    ...itemsRes.data.filter((i) => itemMatchesQuery(i, q)).map((record) => ({ domain: 'item', record })),
    ...locationsRes.data.filter((l) => matches(l.name, q)).map((record) => ({ domain: 'location', record })),
    ...departmentsRes.data.filter((d) => matches(d.name, q)).map((record) => ({ domain: 'department', record })),
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
export async function searchAndResolve(query) {
  const res = await search(query);
  if (!res.ok) return res;
  return success(res.data.map(resolve));
}
