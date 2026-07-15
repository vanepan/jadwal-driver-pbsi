/* ============================================================
   RENDERING-RULE-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 4-7)

   PURPOSE: fix the payload shape for `kind: 'rendering_rule'` — a
   visual/layout rule a text-substitution PatternEntry (pattern-contract.js)
   cannot express: font, emphasis, spacing, conditional page breaks,
   signature layout. Evidenced by NOR-Specification.md §C (Rendering
   Specification) — see Knowledge-Asset-Specification.md §3.1 for the
   worked example this shape was designed against.

   RESPONSIBILITY: typedef + structural validator only.

   DEPENDENCIES: none.

   NON-GOALS: no rendering engine reads this yet — no document renderer
   (js/docs/templates/*, js/petty-cash/nor-paper.js,
   js/petty-cash/nor-excel-exporter.js) is modified or consulted by this
   file. This is vocabulary, not a renderer.

   FUTURE EVOLUTION: a future Documents/Templates connector emits real
   RenderingRuleEntry payloads mined from template code (mirroring how
   nor-generator.js mines structural stats today); this shape should not
   need to change to accommodate that.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} RenderingRuleEntry
 * @property {string} property     - e.g. 'font' | 'emphasis' | 'spacing' | 'pageBreak' | 'signatureLayout'
 * @property {string} scope        - what this rule applies to, e.g. 'documentTitle' | 'terbilangLine' | 'signatureGrid'
 * @property {string} rule         - human-readable statement of the rule
 * @property {*} [value]           - the concrete value/parameter, when applicable (e.g. {fontSize: 13, bold: true})
 * @property {string[]} [observedIn] - which real samples/renderers this was evidenced against
 */

export function isRenderingRuleEntry(p) {
  return !!p && typeof p === 'object'
    && typeof p.property === 'string' && p.property.length > 0
    && typeof p.scope === 'string' && p.scope.length > 0
    && typeof p.rule === 'string' && p.rule.length > 0;
}
