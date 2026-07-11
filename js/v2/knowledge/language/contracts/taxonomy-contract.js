/* ============================================================
   TAXONOMY-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 3.5)

   PURPOSE: fix the classification axes every KnowledgeItem can be
   organized by beyond its own `domainType`/`kind` — Tag (free-form),
   Category (a curated grouping), and Domain (a broader subject-matter
   label, e.g. "Legal", "Finance" — distinct from `domainType`, which
   classifies WHICH business module the item belongs to, e.g. 'nor').

   RESPONSIBILITY: typedefs + structural validators for Tag and Category.
   Domain is deliberately NOT re-registered here — the architecture doc's
   Decision 1 already made `domainType` the one registered classification
   axis (registry/domain-type-registry.js); this module documents that
   reuse rather than duplicating it with a second registry.

   DEPENDENCIES: none (Domain reuse is documented, not imported — no
   runtime coupling needed for a naming convention).

   NON-GOALS: no tag/category values are seeded — unlike domainType/kind,
   tags and categories are expected to be free-form/curated by connectors
   and reviewers, not a closed registered vocabulary.

   FUTURE EVOLUTION: if Category later needs a closed vocabulary (mirroring
   domainType), a category-registry.js can be added without changing this
   file's typedef shape.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} Tag
 * @property {string} label     - free-form, lowercase-normalized by convention
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} label
 * @property {string} [parentId] - for a shallow hierarchy; null/absent = top-level
 */

/**
 * Domain is NOT a new concept — it is the same registered `domainType`
 * value already defined in registry/domain-type-registry.js. This function
 * exists only so language-layer code has a `isDomain`-shaped check to call
 * without reaching past this module into the registry directly.
 * @param {*} domainTypeId
 * @param {(id: string) => boolean} hasDomainTypeFn - inject to avoid a hard import cycle
 * @returns {boolean}
 */
export function isDomain(domainTypeId, hasDomainTypeFn) {
  if (typeof domainTypeId !== 'string' || !domainTypeId) return false;
  if (typeof hasDomainTypeFn !== 'function') return true;
  return hasDomainTypeFn(domainTypeId);
}

export function isTag(t) {
  return !!t && typeof t === 'object' && typeof t.label === 'string' && t.label.length > 0;
}

export function isCategory(c) {
  return !!c && typeof c === 'object' && typeof c.id === 'string' && c.id.length > 0
    && typeof c.label === 'string' && c.label.length > 0;
}
