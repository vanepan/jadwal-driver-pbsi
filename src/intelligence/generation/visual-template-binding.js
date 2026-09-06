/* ============================================================
   VISUAL-TEMPLATE-BINDING.JS — Certified Retrieval → NOR Generation
   (V2, Phase 6)

   PURPOSE: turn the APPROVED Visual Template already resolved by Phase
   5.x.7 (`retrievalContext.visualTemplate`) into ONE deterministic render
   directive the (future) renderer step will consume — or record that the
   deterministic renderer default must be used (§13, §14, §15, §32).

   HARD RULES:
     • Geometry is passed THROUGH untouched. A `null` page width / margin /
       coordinate / font stays `null`; this module NEVER invents A4,
       margins, coordinates, fonts or spacing (§14). The renderer decides
       what a `null` means (fall back to its own governed default for that
       one value).
     • The LLM never positions anything. This module produces data, not
       layout (§13, §32).
     • It reads ONLY the certified context — never the Visual Template
       store, the corpus, or an aggregator (§27).
     • On the Phase 6 HYBRID policy the certification gate has already
       BLOCKED a NOR generation whose visual template is `missing`; this
       module is therefore only ever called with `visualAuthorityUsable`
       true (an approved template resolved) OR for the blocked-status
       disclosure, where it returns the deterministic-fallback marker.

   RESPONSIBILITY: bindVisualTemplate(retrievalContext, gateDecision) →
     a VisualBinding (generation-context-contract.js shape).

   DEPENDENCIES: ./contracts/generation-context-contract.js,
   ./generation-fallbacks.js. PURE.
   ============================================================ */

'use strict';

import { VISUAL_BINDING_SOURCE, makeVisualBinding } from './contracts/generation-context-contract.js';
import { visualFallbackReason } from './generation-fallbacks.js';

/**
 * @param {import('../retrieval/contracts/nor-retrieval-contract.js').NorRetrievalContext} retrievalContext
 * @param {{ visualAuthorityUsable:boolean }} gateDecision
 * @returns {import('./contracts/generation-context-contract.js').VisualBinding}
 */
export function bindVisualTemplate(retrievalContext, gateDecision = {}) {
  const usable = gateDecision.visualAuthorityUsable === true;
  const vt = retrievalContext && retrievalContext.visualTemplate ? retrievalContext.visualTemplate : null;
  const tpl = usable && vt && vt.outcome === 'resolved' && vt.template && vt.template.templateId
    ? vt.template
    : null;

  if (!tpl) {
    return makeVisualBinding({
      source: VISUAL_BINDING_SOURCE.DETERMINISTIC_FALLBACK,
      reason: visualFallbackReason(),
    });
  }

  return makeVisualBinding({
    source: VISUAL_BINDING_SOURCE.APPROVED_TEMPLATE,
    templateId: tpl.templateId,
    templateVersion: Number.isInteger(tpl.templateVersion) ? tpl.templateVersion : null,
    variant: tpl.variant || null,
    viaCrossType: vt.viaCrossType === true,
    // verbatim pass-through — nulls preserved (§14)
    pageModel: tpl.pageModel || null,
    regions: Array.isArray(tpl.regions) ? tpl.regions : [],
    typography: tpl.typography || null,
    spacing: tpl.spacing || null,
    structuralRules: tpl.structuralRules || null,
  });
}
