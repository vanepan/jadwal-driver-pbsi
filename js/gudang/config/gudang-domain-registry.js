/* ============================================================
   GUDANG-DOMAIN-REGISTRY.JS — Gudang Foundation (Phase 1, Part 2)

   Authorized by: Doc 3 Ch.03 (Primary Domains) · Doc 4 Art.II/IV
   (authority hierarchy; engine ownership)

   PURPOSE: the single authoritative list of the domains Document 3's Ch.03
   table ratifies — exactly these, not one more. This file makes no product
   or architecture decision of its own; it only gives Document 3's own domain
   table a shape scripts/gudang-ownership-check.mjs (Part 9) and any future
   module can read and verify against, instead of every file re-typing domain
   names by hand and silently drifting apart from the ratified list.

   NOTE ON A DISCREPANCY IN THE RATIFIED DOCUMENT ITSELF: Doc 3 Ch.03's prose
   says "Fourteen domains," but its own table enumerates fifteen rows (Item,
   Movement, Stock, Asset, Consumable, Analytics, Forecast, Recommendation,
   Audit, Search, Location, Department, Supplier, NOR, QR/Barcode/NFC). This
   file follows the table — the more specific of the two — since Doc 4 Art.II
   forbids implementation from reinterpreting a ratified Document, and
   omitting one of the fifteen listed rows would itself be an omission the
   Phase 1 brief explicitly forbids ("Do NOT omit any ratified domain").
   Flagged verbatim in the Phase 1 completion report for the record to amend.

   `status` mirrors Document 3 Ch.03's "Status" column literally:
     core             — an owned domain with real data (Item, Movement, Stock,
                         Asset, Consumable, Analytics, Search, Location,
                         Department).
     computed_output  — not an engine; a value Analytics Engine produces
                         (Forecast, Recommendation). No repository, no
                         contract of its own — see Doc 3 Ch.03's closing note.
     byproduct        — not a store; a guaranteed read-only view over other
                         domains (Audit — Doc 3 Ch.11).
     seam             — ratified but deliberately unbuilt until a future
                         document activates it (Supplier, NOR, QR/Barcode/NFC
                         — Doc 3 Ch.12, Doc 4 Art.VI: seams remain dormant).

   `hasFoundation` says whether Phase 1 gave the domain a contract/repository
   yet. Consumable is `core` per Document 3, but its only real content —
   Receiving/Issuing (Doc 3 Ch.07) — is exactly the operational workflow this
   phase is FORBIDDEN from building (see the Phase 1 brief's STRICTLY
   FORBIDDEN list), so it has no contract or repository yet. That is not an
   omission; it is Phase 1 obeying its own scope.

   PURE: plain frozen data + lookups. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}

export const DOMAIN_STATUS = Object.freeze({
  CORE: 'core',
  COMPUTED_OUTPUT: 'computed_output',
  BYPRODUCT: 'byproduct',
  SEAM: 'seam',
});

/** @typedef {Object} GudangDomain
 * @property {string} id
 * @property {string} label
 * @property {string} owns          - one-line ownership statement (Doc 3 Ch.03 "Owns" column)
 * @property {'core'|'computed_output'|'byproduct'|'seam'} status
 * @property {boolean} hasFoundation - whether Phase 1 built a contract/repository for it
 * @property {string} authority     - the Document/Chapter/Article that ratifies it
 */

/** The fifteen domains Document 3, Chapter 03's table ratifies. Exactly these
 *  (see the discrepancy note above re: the chapter's own "fourteen" prose). */
export const GUDANG_DOMAINS = deepFreeze([
  { id: 'item', label: 'Item', owns: 'Identity only — whether it is a Consumable or an Asset, nothing else', status: DOMAIN_STATUS.CORE, hasFoundation: true, authority: 'Doc 3 Ch.03' },
  { id: 'movement', label: 'Movement', owns: 'Attributed quantity events for Consumables — the source of truth', status: DOMAIN_STATUS.CORE, hasFoundation: true, authority: 'Doc 1 Art.IV · Doc 3 Ch.04' },
  { id: 'stock', label: 'Stock', owns: 'Current on-hand quantity — a computed projection, never a truth of its own', status: DOMAIN_STATUS.CORE, hasFoundation: true, authority: 'Doc 1 Art.IV · Doc 3 Ch.05' },
  { id: 'asset', label: 'Asset', owns: 'Identity, status, and lifecycle for uniquely-tracked things', status: DOMAIN_STATUS.CORE, hasFoundation: true, authority: 'Doc 1 Art.V · Doc 3 Ch.06' },
  { id: 'consumable', label: 'Consumable', owns: 'The receive/issue/adjust/opname workflow that produces Movements', status: DOMAIN_STATUS.CORE, hasFoundation: false, authority: 'Doc 3 Ch.03/07' },
  { id: 'analytics', label: 'Analytics', owns: 'Deterministic computation over Movement, Stock, and Asset History', status: DOMAIN_STATUS.CORE, hasFoundation: false, authority: 'Doc 1 Art.VII · Doc 3 Ch.09' },
  { id: 'forecast', label: 'Forecast', owns: 'A computed Analytics output — not an engine of its own', status: DOMAIN_STATUS.COMPUTED_OUTPUT, hasFoundation: false, authority: 'Doc 3 Ch.03/09' },
  { id: 'recommendation', label: 'Recommendation', owns: 'A computed Analytics output — not a suggestion engine', status: DOMAIN_STATUS.COMPUTED_OUTPUT, hasFoundation: false, authority: 'Doc 3 Ch.03/09' },
  { id: 'audit', label: 'Audit', owns: 'The guaranteed read-only view of Movement + Asset History', status: DOMAIN_STATUS.BYPRODUCT, hasFoundation: true, authority: 'Doc 1 Art.VI · Doc 3 Ch.11' },
  { id: 'search', label: 'Search', owns: 'Universal entry and action-resolution — owns no domain data', status: DOMAIN_STATUS.CORE, hasFoundation: true, authority: 'Doc 1 Art.III · Doc 2 §05 · Doc 3 Ch.08' },
  { id: 'location', label: 'Location', owns: 'Where a thing is — referenced by Movement and Asset', status: DOMAIN_STATUS.CORE, hasFoundation: true, authority: 'Doc 3 Ch.03' },
  { id: 'department', label: 'Department', owns: 'Who consumed or holds something — referenced by Movement and Analytics', status: DOMAIN_STATUS.CORE, hasFoundation: true, authority: 'Doc 3 Ch.03' },
  { id: 'supplier', label: 'Supplier', owns: 'Not designed — reserved for a future Goods In reason', status: DOMAIN_STATUS.SEAM, hasFoundation: false, authority: 'Doc 3 Ch.03/12' },
  { id: 'nor', label: 'NOR', owns: 'Not designed — a future backlink target only', status: DOMAIN_STATUS.SEAM, hasFoundation: false, authority: 'Doc 3 Ch.03/12' },
  { id: 'qrBarcodeNfc', label: 'QR / Barcode / NFC', owns: 'Not a domain — a future resolution path into Search', status: DOMAIN_STATUS.SEAM, hasFoundation: false, authority: 'Doc 1 Art.X · Doc 3 Ch.03/12' },
]);

const _byId = new Map(GUDANG_DOMAINS.map((d) => [d.id, d]));

/** The domain record, or null when `id` is not a ratified domain. */
export function getDomain(id) {
  return _byId.get(id) || null;
}

/** Every domain with the given status. */
export function domainsByStatus(status) {
  return GUDANG_DOMAINS.filter((d) => d.status === status);
}

/** Every domain Phase 1 actually gave a contract/repository to. */
export function domainsWithFoundation() {
  return GUDANG_DOMAINS.filter((d) => d.hasFoundation);
}

/** Whether `id` is one of the fourteen ratified domains. */
export function isRatifiedDomain(id) {
  return _byId.has(id);
}
