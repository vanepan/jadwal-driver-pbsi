/* ============================================================
   PATTERN-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 3.5)

   PURPOSE: fix the payload shapes for the four structural `kind`s a
   KnowledgeItem can carry — Sentence Pattern, Paragraph Pattern, Template
   Pattern, Structure Pattern (`kind: 'sentence_pattern'` |
   'paragraph_pattern' | 'template_pattern' | 'structure', all registered
   in registry/kind-registry.js). These are the shapes a future Document
   Intelligence layer (Phase 7+) will read to explain "how PBSI writes",
   never document CONTENT itself.

   RESPONSIBILITY: typedefs + structural validators. All four share one
   PatternEntry shape (a template string + its slot list) because they
   differ only in granularity (a sentence vs. a paragraph vs. a whole
   document skeleton vs. an abstract structure), not in shape.

   DEPENDENCIES: none.

   NON-GOALS: no NOR-specific pattern is defined or seeded here. No parser
   that would derive a pattern from real text — that is explicitly Phase
   4+/7+ connector work, out of scope for a language contract.

   FUTURE EVOLUTION: the Documents connector (still unimplemented, see
   knowledge/connectors/README.md) will emit PatternEntry payloads mined
   from existing template CODE (per architecture doc §4.4 — there is no
   historical filled-document corpus), at whichever granularity is useful.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} PatternSlot
 * @property {string} name        - e.g. 'recipientName', 'amount', 'date'
 * @property {string} [type]      - free-form hint, e.g. 'string' | 'currency' | 'date'
 */

/**
 * Shared payload shape for kind: 'sentence_pattern' | 'paragraph_pattern' |
 * 'template_pattern' | 'structure'.
 * @typedef {Object} PatternEntry
 * @property {string} template    - the pattern text with {{slot}} placeholders
 * @property {PatternSlot[]} [slots]
 * @property {string} [granularity] - 'sentence' | 'paragraph' | 'template' | 'structure' (mirrors the KnowledgeItem's own `kind`, kept here too for payload-only consumers)
 */

export function isPatternEntry(p) {
  return !!p && typeof p === 'object' && typeof p.template === 'string' && p.template.length > 0;
}
