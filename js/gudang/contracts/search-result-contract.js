/* ============================================================
   SEARCH-RESULT-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 1 Art.III (Search First) / R-13 (Amendment I — search
   resolves into action) · Doc 2 §05 (Search) · Doc 3 Ch.08 (Search Engine)

   PURPOSE: fix the shape of a SearchResult — the one thing Search Engine
   (Part 7) ever hands back. `actions` is the Action Resolution facet of
   Doc 3 Ch.08 made concrete: the list of action ids this result may resolve
   into (e.g. 'open', 'goodsOut') — Search only NAMES which actions are
   valid, it never performs them (Doc 4 Art.IV: Search may resolve into any
   engine, but may never become the engine it resolves into).

   `ownerDomain` must be one of the ratified domains
   (config/gudang-domain-registry.js) — enforced by callers, not this file,
   to avoid a circular import between contracts/ and config/.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const SEARCH_RESULT_SCHEMA = 'gudang.searchResult@1';

/**
 * @typedef {Object} SearchResult
 * @property {string} ownerDomain - which ratified domain owns the matched record (e.g. 'item', 'location')
 * @property {string} refId       - the matched record's id within that domain
 * @property {string} label       - what a person reads (Doc 2 §05: never only an internal identifier)
 * @property {?string} hint       - an optional Quiet Intelligence sentence (Doc 2 §15), never raw data
 * @property {string[]} actions   - action ids this result may resolve into; Search names them, never runs them
 */

/** @param {{ownerDomain:string, refId:string, label:string, hint?:?string, actions?:string[]}} seed
 *  @returns {SearchResult} */
export function makeSearchResult({ ownerDomain, refId, label, hint = null, actions = [] }) {
  if (typeof ownerDomain !== 'string' || !ownerDomain) throw new Error('makeSearchResult: ownerDomain is required.');
  if (typeof refId !== 'string' || !refId) throw new Error('makeSearchResult: refId is required.');
  if (typeof label !== 'string' || !label) throw new Error('makeSearchResult: label is required.');
  if (!Array.isArray(actions) || !actions.every((a) => typeof a === 'string' && a)) {
    throw new Error('makeSearchResult: actions must be an array of non-empty strings.');
  }
  return Object.freeze({
    ownerDomain,
    refId,
    label,
    hint: hint == null ? null : String(hint),
    actions: Object.freeze([...actions]),
  });
}

/** @param {*} result @returns {boolean} */
export function isSearchResult(result) {
  return !!result && typeof result === 'object'
    && typeof result.ownerDomain === 'string' && result.ownerDomain.length > 0
    && typeof result.refId === 'string' && result.refId.length > 0
    && typeof result.label === 'string' && result.label.length > 0
    && (result.hint === null || typeof result.hint === 'string')
    && Array.isArray(result.actions) && result.actions.every((a) => typeof a === 'string' && a.length > 0);
}
