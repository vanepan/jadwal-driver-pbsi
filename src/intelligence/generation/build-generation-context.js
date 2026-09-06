/* ============================================================
   BUILD-GENERATION-CONTEXT.JS — Certified Retrieval → NOR Generation
   (V2, Phase 6)

   PURPOSE: the ONE composer a NOR generator calls. Given a Phase 5.x.7
   `nor-retrieval-context@1` snapshot + the generation mode, it returns the
   single `intelligence-generation-context@1` object that says whether — and
   how — to generate (§26).

     retrieveNorContext(...)            ← Phase 5.x.7 (the ONE retrieval)
            │  nor-retrieval-context@1
            ▼
     buildGenerationContext(ctx, {mode})   ← THIS module
            │  intelligence-generation-context@1
            ▼
     assembleNorDraft({ …, generationStyleContext, visualBinding, generationContext })

   It runs the deterministic gate, then the deterministic style-slot and
   visual-template projections, then folds in the conflict refs and the
   snapshot ids retained for audit (§18, §22). It adds NO retrieval, NO
   resolution, NO ranking, NO storage, NO model call. Same input ⇒
   byte-identical output (§23, §24).

   RESPONSIBILITY: buildGenerationContext(retrievalContext, { mode, at }) →
   GenerationContext.

   DEPENDENCIES: ./contracts/generation-context-contract.js,
   ./certification-gate.js, ./style-slot-resolver.js,
   ./visual-template-binding.js. PURE.
   ============================================================ */

'use strict';

import {
  GENERATION_MODE, isGenerationMode, isBlockedGateOutcome, makeGenerationContext,
} from './contracts/generation-context-contract.js';
import { isNorRetrievalContext } from '../retrieval/contracts/nor-retrieval-contract.js';
import { evaluateGenerationContext } from './certification-gate.js';
import { resolveStyleSlots } from './style-slot-resolver.js';
import { bindVisualTemplate } from './visual-template-binding.js';

function retrievalSummary(ctx) {
  const cert = (ctx && ctx.certification) || {};
  return {
    certification: cert.status || null,
    styleGuideStatus: (cert.styleGuide && cert.styleGuide.status) || null,
    visualTemplateStatus: (cert.visualTemplate && cert.visualTemplate.status) || null,
    documentType: (ctx && ctx.request && ctx.request.documentType) || null,
    retrievedAt: (ctx && ctx.generatedAt) || null,
  };
}

/** Conflict refs — IDs only, never rule/template bodies (§18, §33). */
function conflictRefs(ctx) {
  const cf = (ctx && ctx.conflicts) || {};
  return {
    styleGuide: (Array.isArray(cf.styleGuide) ? cf.styleGuide : []).map((x) => ({
      category: x.category, key: x.key == null ? null : x.key,
      documentType: x.documentType, competingRuleIds: x.competingRuleIds || [],
    })),
    visualTemplate: (Array.isArray(cf.visualTemplate) ? cf.visualTemplate : []).map((x) => ({
      documentType: x.documentType, competingTemplateIds: x.competingTemplateIds || [],
    })),
  };
}

/**
 * @param {import('../retrieval/contracts/nor-retrieval-contract.js').NorRetrievalContext} retrievalContext
 * @param {{ mode?: string, at?: string }} [opts]
 * @returns {import('./contracts/generation-context-contract.js').GenerationContext}
 */
export function buildGenerationContext(retrievalContext, opts = {}) {
  const at = opts.at || new Date().toISOString();
  const mode = isGenerationMode(opts.mode) ? opts.mode : GENERATION_MODE.INTELLIGENCE;

  const gate = evaluateGenerationContext(retrievalContext);
  const valid = isNorRetrievalContext(retrievalContext);
  const blocked = isBlockedGateOutcome(gate.outcome);

  // On a blocked gate NO authority is applied (§9): style + visual resolve
  // to their non-authoritative forms (every wording slot marked
  // `deterministic_fallback` — "not certified") so a context consumer can
  // never read a certified rule out of a blocked generation.
  const style = resolveStyleSlots(valid ? retrievalContext : {}, blocked
    ? { styleAuthorityUsable: false, styleFallback: true }
    : gate);
  const visual = bindVisualTemplate(valid ? retrievalContext : {}, blocked
    ? { visualAuthorityUsable: false }
    : gate);

  // The top-level `fallbacks[]` lists what an ASSEMBLED draft actually fell
  // back to. A blocked generation assembled nothing authoritative, so it
  // stays empty — the `reasons[]` + `blocked` flag carry the "why".
  const fallbacks = [];
  if (!blocked) {
    for (const f of style.fallbacks) fallbacks.push({ area: 'style', slot: f.slot, reason: f.reason });
    if (gate.visualFallback && visual.reason) fallbacks.push({ area: 'visual', slot: null, reason: visual.reason });
  }

  const snapshotIds = valid && retrievalContext.supportingEvidence
    ? {
      styleRuleIds: (retrievalContext.supportingEvidence.styleGuide
        && retrievalContext.supportingEvidence.styleGuide.ruleIds) || [],
      visualTemplateIds: (retrievalContext.supportingEvidence.visualTemplate
        && retrievalContext.supportingEvidence.visualTemplate.templateIds) || [],
    }
    : { styleRuleIds: [], visualTemplateIds: [] };

  return makeGenerationContext({
    mode,
    gate: gate.outcome,
    status: gate.status,
    reasons: gate.reasons,
    generatedAt: at,
    retrieval: retrievalSummary(valid ? retrievalContext : {}),
    style,
    visual,
    fallbacks,
    conflicts: conflictRefs(valid ? retrievalContext : {}),
    snapshot: snapshotIds,
  });
}
