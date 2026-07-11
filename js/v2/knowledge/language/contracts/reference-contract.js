/* ============================================================
   REFERENCE-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 3.5)

   PURPOSE: fix the shape of a citable "Reference" and a "Source" — distinct
   from, and building on, contracts/explainability-contract.js's Provenance.
   Provenance answers "which connector, which opaque source ref" for ONE
   item. A Reference is the reusable, human-facing pointer (a Reference can
   be cited by many items); a Source is the named entity behind a
   `sourceType` (so "the NOR template code" or "the 2026 SOP revision" has a
   label and identity distinct from the connector mechanism that read it).

   RESPONSIBILITY: typedefs + structural validators for Reference and
   KnowledgeSource.

   DEPENDENCIES: none. Deliberately does not import
   contracts/connector-contract.js — `sourceType` here is a plain string
   matching a connector id by convention, not a hard type dependency.

   NON-GOALS: no real source is registered. No document is referenced.

   FUTURE EVOLUTION: Phase 4+ connectors construct a KnowledgeSource once
   per distinct origin they read from (not once per item), and every
   KnowledgeItem's Provenance.sourceRef becomes a Reference.targetId into
   that source's items.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} KnowledgeSource
 * @property {string} id          - stable id for this named source, e.g. 'nor-template-v3'
 * @property {string} sourceType  - matches a connector id (contracts/connector-contract.js)
 * @property {string} label       - human-readable name, e.g. "NOR Template (js/docs/templates/nor.js)"
 * @property {string} [uri]       - a file path, config key, or other locator — opaque to the core
 */

/**
 * A citable pointer FROM a KnowledgeItem TO whatever it references (another
 * KnowledgeItem, a KnowledgeSource, or an external locator).
 * @typedef {Object} Reference
 * @property {string} targetId
 * @property {'knowledge_item'|'knowledge_source'|'external'} targetKind
 * @property {string} [note]
 */

export function isKnowledgeSource(s) {
  return !!s && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length > 0
    && typeof s.sourceType === 'string' && s.sourceType.length > 0
    && typeof s.label === 'string' && s.label.length > 0;
}

export function isReference(r) {
  return !!r && typeof r === 'object'
    && typeof r.targetId === 'string' && r.targetId.length > 0
    && ['knowledge_item', 'knowledge_source', 'external'].includes(r.targetKind);
}
