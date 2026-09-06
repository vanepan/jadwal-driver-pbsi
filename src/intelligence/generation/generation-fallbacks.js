/* ============================================================
   GENERATION-FALLBACKS.JS — Certified Retrieval → NOR Generation
   (V2, Phase 6)

   PURPOSE: name the DETERMINISTIC default that a generation slot / the
   visual layout falls back to when no approved organizational authority
   exists for it — and the reason string a reviewer sees (§8, §14, §37).

   IMPORTANT: this module holds NO document wording and NO geometry. The
   literal Indonesian NOR phrases ("Dengan hormat,", "Kepada Yth.",
   "Terbilang:", …) live ONLY in the existing deterministic renderer /
   assembler:
     • js/docs/templates/nor.js               (pdfmake DocDefinition)
     • js/docs/design-system/document-design-system.js  (page geometry — `nor` v1)
     • src/intelligence/service/nor-draft-assembler.js  (template body)
   Phase 6 does NOT copy or re-declare them. It only records, per slot,
   THAT a deterministic default was used and WHY, so the draft's
   provenance and the review UI can disclose it honestly ("AI guessed the
   missing convention" is never an acceptable phrasing — §8).

   Every fallback here is an ESTABLISHED, non-AI generator convention that
   is already what the current V2 draft produces today. Falling back to it
   is the documented status quo, never a guess.

   RESPONSIBILITY: STYLE_SLOT_FALLBACK_REASON (per-slot reason strings for
   `deterministic_default` vs `deterministic_fallback`), VISUAL_FALLBACK_REASON,
   styleFallbackReason(slot, kind), visualFallbackReason().

   DEPENDENCIES: ./contracts/generation-context-contract.js
   (GENERATION_STYLE_SLOT, STYLE_SLOT_SOURCE). PURE.
   ============================================================ */

'use strict';

import {
  GENERATION_STYLE_SLOT, GENERATION_STYLE_SLOT_LIST, STYLE_SLOT_SOURCE,
} from './contracts/generation-context-contract.js';

/** The renderer / assembler component that OWNS the literal default for
 *  each slot — a pointer for an auditor, never the text itself. */
export const STYLE_SLOT_RENDERER_SOURCE = Object.freeze({
  [GENERATION_STYLE_SLOT.OPENING]: 'js/docs/templates/nor.js#opening',
  [GENERATION_STYLE_SLOT.CLOSING]: 'js/docs/templates/nor.js#closing',
  [GENERATION_STYLE_SLOT.RECIPIENT_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.SUBJECT_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.DATE_FORMAT]: 'js/docs/templates/nor.js#dateLong',
  [GENERATION_STYLE_SLOT.ATTACHMENT_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.COPY_LABEL]: 'js/docs/templates/nor.js#metaTable',
  [GENERATION_STYLE_SLOT.SIGNATURE_LABEL]: 'js/docs/doc-theme.js#signatureBlock',
  [GENERATION_STYLE_SLOT.BODY_STRUCTURE]: 'src/intelligence/service/nor-draft-assembler.js#templateBody',
  [GENERATION_STYLE_SLOT.FORMAL_TONE]: 'src/intelligence/service/nor-draft-assembler.js#modelBody',
  [GENERATION_STYLE_SLOT.TERMINOLOGY]: '(none — absence of a term rule imposes no constraint)',
});

/** Short, human-readable slot names for the reason strings. */
const SLOT_LABEL = Object.freeze({
  [GENERATION_STYLE_SLOT.OPENING]: 'opening salutation',
  [GENERATION_STYLE_SLOT.CLOSING]: 'closing sentence',
  [GENERATION_STYLE_SLOT.RECIPIENT_LABEL]: 'recipient label',
  [GENERATION_STYLE_SLOT.SUBJECT_LABEL]: 'subject label',
  [GENERATION_STYLE_SLOT.DATE_FORMAT]: 'date convention',
  [GENERATION_STYLE_SLOT.ATTACHMENT_LABEL]: 'attachment label',
  [GENERATION_STYLE_SLOT.COPY_LABEL]: 'copy / tembusan label',
  [GENERATION_STYLE_SLOT.SIGNATURE_LABEL]: 'signature wording',
  [GENERATION_STYLE_SLOT.BODY_STRUCTURE]: 'body structure',
  [GENERATION_STYLE_SLOT.FORMAL_TONE]: 'formal tone',
  [GENERATION_STYLE_SLOT.TERMINOLOGY]: 'organizational terminology',
});

/**
 * The reason string for a slot filled by a deterministic value.
 * @param {string} slot  GENERATION_STYLE_SLOT.*
 * @param {'deterministic_default'|'deterministic_fallback'} kind
 * @returns {string}
 */
export function styleFallbackReason(slot, kind) {
  const label = SLOT_LABEL[slot] || String(slot || 'slot');
  const owner = STYLE_SLOT_RENDERER_SOURCE[slot] || 'the deterministic renderer';
  if (kind === STYLE_SLOT_SOURCE.DETERMINISTIC_DEFAULT) {
    // certification === certified, simply no approved rule for this slot.
    return `No approved Style Guide rule for the ${label}; used the established `
      + `deterministic NOR convention (${owner}). Certified organizational context `
      + `carries no rule that this overrides.`;
  }
  // certification NOT certified for the Style Guide domain (a `missing`).
  return `The Style Guide could not certify a ${label} rule; fell back to the `
    + `established deterministic NOR convention (${owner}). This output is not `
    + `certified for the ${label}.`;
}

/** Precomputed maps (deterministic, frozen) for the two kinds. */
export const STYLE_SLOT_DEFAULT_REASON = Object.freeze(
  Object.fromEntries(GENERATION_STYLE_SLOT_LIST.map(
    (s) => [s, styleFallbackReason(s, STYLE_SLOT_SOURCE.DETERMINISTIC_DEFAULT)],
  )),
);
export const STYLE_SLOT_FALLBACK_REASON = Object.freeze(
  Object.fromEntries(GENERATION_STYLE_SLOT_LIST.map(
    (s) => [s, styleFallbackReason(s, STYLE_SLOT_SOURCE.DETERMINISTIC_FALLBACK)],
  )),
);

/** The one deterministic visual default — the existing governed `nor` v1
 *  layout in the Document Design System. Phase 6's hybrid policy BLOCKS a
 *  NOR generation whose visual template is `missing` rather than emitting
 *  this; the reason is still recorded for cross-type / non-NOR paths the
 *  renderer already supports and for the blocked-status disclosure. */
export const VISUAL_RENDERER_SOURCE = 'js/docs/design-system/document-design-system.js#nor@v1';

export function visualFallbackReason() {
  return `No approved Visual Template for this document type; the established `
    + `deterministic NOR layout (${VISUAL_RENDERER_SOURCE}) is the only safe `
    + `renderer. The official document's physical layout is not certified.`;
}
export const VISUAL_FALLBACK_REASON = visualFallbackReason();
