/* ============================================================
   UNIT-AUTOCOMPLETE-ENGINE.JS — Petty Cash "Nama Unit" intelligence
   (v1.17.4 — Part A · Petty Cash Intelligence)

   The PURE ranking + learning core behind the Apple-style "Nama Unit"
   autocomplete shown when an expense Unit is "Others". It turns the bidang
   roster (+ recently-used custom units) into a relevance-ranked suggestion
   list, exposes IDE-style tab completion, and maintains a most-recently-used
   list — all without DOM, Firebase, or `window`, so it is node-testable.

   Ranking (most relevant first):
     1. exact match              (tier 0)
     2. startsWith match         (tier 1)
     3. contains match           (tier 2)
     4. recently used            (tie-breaker within a tier — newest first)
     5. alphabetical             (final tie-breaker, id-ID collation)

   Akuntes policy (Feature 5): Akuntes is NEVER recommended. The exclusion
   REUSES the Dispatch Policy Engine (excludeAkuntesFromSuggestions) — the rule
   is not duplicated here. A manually-typed Akuntes is never blocked (the engine
   only ranks SUGGESTIONS; it never touches the typed value).

   PURE: plain data + the policy engine. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { excludeAkuntesFromSuggestions } from './dispatch-policy-engine.js';

/** How many recently-used custom units to remember locally. */
export const MRU_LIMIT = 8;

/** Match tiers — lower is more relevant. */
export const MATCH_TIER = Object.freeze({ EXACT: 0, STARTS: 1, CONTAINS: 2, NONE: 3 });

function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

/**
 * Relevance tier of `name` for `query` (case-insensitive).
 * @returns {number} one of MATCH_TIER
 */
export function matchTier(query, name) {
  const q = norm(query);
  const n = norm(name);
  if (!n) return MATCH_TIER.NONE;
  if (!q) return MATCH_TIER.STARTS;     // empty query → browse mode (all qualify)
  if (n === q) return MATCH_TIER.EXACT;
  if (n.startsWith(q)) return MATCH_TIER.STARTS;
  if (n.includes(q)) return MATCH_TIER.CONTAINS;
  return MATCH_TIER.NONE;
}

/** Pull a display name out of a candidate (string or roster object). */
function candidateName(c) {
  if (typeof c === 'string') return c.trim();
  if (c && typeof c === 'object') return String(c.name || c.unit || c.requesterName || '').trim();
  return '';
}

/**
 * Rank the suggestion list for a query.
 *   - de-duplicates candidates case-insensitively (first display form wins),
 *   - drops Akuntes via the Policy Engine (rule not duplicated),
 *   - keeps only tiered matches (NONE excluded) when a query is present,
 *   - orders by tier → MRU recency → alphabetical.
 *
 * @param {string} query        the text typed so far ('' → browse mode)
 * @param {Array<string|Object>} candidates  bidang roster names (+ MRU names)
 * @param {Array<string>} [mru]  recently-used names, newest first
 * @param {Object} [cfg]         policy config (defaults to the active one)
 * @returns {Array<{name:string, tier:number, mru:boolean}>}
 */
export function rankUnitSuggestions(query, candidates, mru = [], cfg) {
  const seen = new Set();
  let names = [];
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const display = candidateName(c);
    if (!display) continue;
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(display);
  }

  // Feature 5 — Akuntes is never recommended. REUSE the policy engine.
  names = excludeAkuntesFromSuggestions(names, cfg);

  // MRU recency map (0 = most recent).
  const mruRank = new Map();
  (Array.isArray(mru) ? mru : []).forEach((m) => {
    const k = norm(m);
    if (k && !mruRank.has(k)) mruRank.set(k, mruRank.size);
  });

  const q = norm(query);
  const scored = [];
  for (const name of names) {
    const tier = matchTier(q, name);
    if (tier === MATCH_TIER.NONE) continue;
    const r = mruRank.has(norm(name)) ? mruRank.get(norm(name)) : Infinity;
    scored.push({ name, tier, mruRank: r });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;            // exact > startsWith > contains
    if (a.mruRank !== b.mruRank) return a.mruRank - b.mruRank; // recently used first
    return a.name.localeCompare(b.name, 'id');                // alphabetical
  });

  return scored.map(({ name, tier, mruRank: r }) => ({ name, tier, mru: r !== Infinity }));
}

/**
 * IDE-style tab completion: when exactly ONE suggestion remains, return the
 * value to fill (unless it already equals the query). null otherwise.
 * @param {string} query
 * @param {Array<{name:string}>} ranked  the rankUnitSuggestions result
 * @returns {string|null}
 */
export function soleCompletion(query, ranked) {
  if (!Array.isArray(ranked) || ranked.length !== 1) return null;
  const only = ranked[0] && ranked[0].name;
  if (!only) return null;
  if (norm(only) === norm(query)) return null;   // already complete
  return only;
}

/**
 * Push a used value onto the front of the MRU list (dedup case-insensitively,
 * newest first, capped at `limit`). Pure — returns a NEW array.
 * @param {Array<string>} mru
 * @param {string} value
 * @param {number} [limit]
 * @returns {Array<string>}
 */
export function pushMru(mru, value, limit = MRU_LIMIT) {
  const list = Array.isArray(mru) ? mru.filter((x) => typeof x === 'string' && x.trim()) : [];
  const v = String(value == null ? '' : value).trim();
  if (!v) return list.slice(0, limit);
  const filtered = list.filter((x) => norm(x) !== norm(v));
  filtered.unshift(v);
  return filtered.slice(0, Math.max(0, limit));
}
