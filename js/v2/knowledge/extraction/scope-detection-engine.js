/* ============================================================
   SCOPE-DETECTION-ENGINE.JS — Knowledge Learning Foundation (V2.0.8, Phase 11)

   PURPOSE: "Scope Detection" — distinguishes "this is how EVERYONE does
   it" (organization-wide) from "this is a specific exception/variant",
   using ONLY signals already inside the Knowledge Repository. Deliberately
   does NOT read js/v2/organizational-memory/ (which carries the real
   "Dari"/origin signal, `senderOrigin`) — Organizational Memory sits
   DOWNSTREAM of Knowledge Repository in the frozen architecture (Official
   Documents -> Knowledge Acquisition -> Knowledge Repository ->
   Organizational Memory -> Applications); Knowledge reading from
   Organizational Memory would invert that direction. Scope here means
   "what fraction of the population shares this exact payload" — a real,
   in-bounds proxy for "how widely adopted is this pattern", not the same
   as (but usable alongside) a future real per-document division signal.

   RESPONSIBILITY: `groupByPayload(items)` (shared with
   promotion-candidate-engine.js) and `detectScope(domainType, kind, opts)`.

   DEPENDENCIES: index-engine.js.

   NON-GOALS: no AI, no clustering beyond exact payload equality — that
   is V2.0.9's job if genuinely needed (Similarity/Clustering).
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from './index-engine.js';

export const SCOPE = Object.freeze({
  ORGANIZATION_WIDE: 'organization_wide',
  VARIANT: 'variant',
  UNDETERMINED: 'undetermined',
});

const DEFAULT_ORG_WIDE_THRESHOLD = 0.7;

function payloadKey(item) {
  try { return JSON.stringify(item.payload); } catch { return String(item.payload); }
}

/** Groups items by exact payload equality, majority group first.
 *  @returns {{key: string, items: object[]}[]} */
export function groupByPayload(items) {
  const groups = new Map();
  for (const item of items) {
    const key = payloadKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([key, groupItems]) => ({ key, items: groupItems })).sort((a, b) => b.items.length - a.items.length);
}

/**
 * @param {string} domainType
 * @param {string} kind
 * @param {{orgWideThreshold?: number}} [opts]
 * @returns {{ok: boolean, scope: string, coveragePct: number, itemsAnalyzed: number, majorityGroupSize: number, error: object|null}}
 */
export function detectScope(domainType, kind, opts = {}) {
  const threshold = opts.orgWideThreshold ?? DEFAULT_ORG_WIDE_THRESHOLD;
  const index = buildKnowledgeIndex();
  const items = indexGroup(index, domainType, kind);

  if (items.length === 0) {
    return { ok: false, scope: SCOPE.UNDETERMINED, coveragePct: 0, itemsAnalyzed: 0, majorityGroupSize: 0, error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items to detect scope from.` } };
  }

  const groups = groupByPayload(items);
  const majority = groups[0];
  const coveragePct = majority.items.length / items.length;

  return {
    ok: true,
    scope: coveragePct >= threshold ? SCOPE.ORGANIZATION_WIDE : SCOPE.VARIANT,
    coveragePct: Math.round(coveragePct * 100) / 100,
    itemsAnalyzed: items.length,
    majorityGroupSize: majority.items.length,
    error: null,
  };
}
