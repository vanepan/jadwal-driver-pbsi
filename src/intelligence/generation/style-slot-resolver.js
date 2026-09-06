/* ============================================================
   STYLE-SLOT-RESOLVER.JS — Certified Retrieval → NOR Generation
   (V2, Phase 6)

   PURPOSE: map the APPROVED Style Guide rules already resolved by Phase
   5.x.7 (`retrievalContext.styleGuide.rules[]`) onto the NOR generator's
   named wording slots (§12). This is a DETERMINISTIC projection — it adds
   NO retrieval, NO resolution, NO ranking. It reads ONLY the certified
   context; it never touches the Style Guide store, Writing Memory, or the
   corpus (§27).

   Each slot resolves to exactly one of:
     • a `certified_style_rule` (an APPROVED Phase 5.x.5 rule — the only
       authority), OR
     • a `deterministic_default` — the certified context simply carries no
       rule for this slot; the established convention applies and nothing
       approved is overridden, OR
     • a `deterministic_fallback` — the Style Guide domain was `missing`
       (not certified); the established convention applies and a visible
       review warning is raised (§37).

   A slot whose retrieval outcome is `conflict` is never resolved here —
   the certification gate has already BLOCKED the whole generation (§9);
   this module is only ever called on an ALLOWED / ALLOWED_WITH_FALLBACK
   gate.

   RESPONSIBILITY: resolveStyleSlots(retrievalContext, gateDecision) →
     a GenerationStyleContext (generation-context-contract.js shape).

   DEPENDENCIES: ./contracts/generation-context-contract.js,
   ./generation-fallbacks.js. PURE — no I/O, no DOM, no Firebase, no model.
   ============================================================ */

'use strict';

import {
  GENERATION_STYLE_SLOT, SINGLE_VALUE_SLOTS, STYLE_SLOT_CATEGORY_MAP,
  STYLE_SLOT_SOURCE, makeGenerationStyleContext,
} from './contracts/generation-context-contract.js';
import { STYLE_SLOT_DEFAULT_REASON, STYLE_SLOT_FALLBACK_REASON } from './generation-fallbacks.js';

/** category → the slot it feeds (inverse of STYLE_SLOT_CATEGORY_MAP). */
const CATEGORY_TO_SLOT = Object.freeze((() => {
  const out = {};
  for (const [slot, cats] of Object.entries(STYLE_SLOT_CATEGORY_MAP)) {
    for (const c of cats) out[c] = slot;
  }
  return out;
})());

function sortByKey(a, b) {
  const ka = String(a.key == null ? '' : a.key);
  const kb = String(b.key == null ? '' : b.key);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * @param {import('../retrieval/contracts/nor-retrieval-contract.js').NorRetrievalContext} retrievalContext
 * @param {{ styleAuthorityUsable:boolean, styleFallback:boolean }} gateDecision
 * @returns {import('./contracts/generation-context-contract.js').GenerationStyleContext}
 */
export function resolveStyleSlots(retrievalContext, gateDecision = {}) {
  const usable = gateDecision.styleAuthorityUsable === true;
  const fallbackMode = gateDecision.styleFallback === true;

  // Only RESOLVED approved-rule slots from the certified context are usable.
  // `conflict` / `missing` slot entries never become authority here.
  const contextRules = (retrievalContext && retrievalContext.styleGuide && Array.isArray(retrievalContext.styleGuide.rules))
    ? retrievalContext.styleGuide.rules
    : [];
  const resolved = usable
    ? contextRules.filter((r) => r && r.outcome === 'resolved' && r.rule && r.rule.ruleId)
    : [];

  // group resolved rules by the generation slot their category feeds
  const bySlot = new Map();
  for (const r of resolved) {
    const slot = CATEGORY_TO_SLOT[r.category];
    if (!slot) continue; // a category with no generation slot imposes no constraint
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(r);
  }

  const slots = {};
  for (const slot of SINGLE_VALUE_SLOTS) {
    const hits = (bySlot.get(slot) || []).slice().sort(sortByKey);
    if (hits.length) {
      // deterministic pick: the lexicographically-smallest key in the slot's
      // category. Keys are unique per (category), so this is a total order.
      const r = hits[0];
      slots[slot] = {
        slot,
        source: STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE,
        ruleId: r.rule.ruleId,
        version: Number.isInteger(r.rule.version) ? r.rule.version : null,
        category: r.category,
        key: r.key,
        documentType: r.documentType,
        viaCrossType: r.viaCrossType === true,
        value: r.rule.value,
      };
    } else if (fallbackMode) {
      slots[slot] = {
        slot,
        source: STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK,
        reason: STYLE_SLOT_FALLBACK_REASON[slot],
      };
    } else {
      slots[slot] = {
        slot,
        source: STYLE_SLOT_SOURCE.DETERMINISTIC_DEFAULT,
        reason: STYLE_SLOT_DEFAULT_REASON[slot],
      };
    }
  }

  // TERMINOLOGY — a LIST slot: every resolved term/organizational_term/
  // preferred_phrase rule contributes one entry. When none exist, absence
  // imposes no constraint, so the list is simply empty (never a fallback
  // row — there is nothing to fall back FROM).
  const terminology = (bySlot.get(GENERATION_STYLE_SLOT.TERMINOLOGY) || [])
    .slice()
    .sort(sortByKey)
    .map((r) => ({
      slot: GENERATION_STYLE_SLOT.TERMINOLOGY,
      source: STYLE_SLOT_SOURCE.CERTIFIED_STYLE_RULE,
      ruleId: r.rule.ruleId,
      version: Number.isInteger(r.rule.version) ? r.rule.version : null,
      category: r.category,
      key: r.key,
      documentType: r.documentType,
      viaCrossType: r.viaCrossType === true,
      value: r.rule.value,
    }));

  return makeGenerationStyleContext({ slots, terminology });
}
