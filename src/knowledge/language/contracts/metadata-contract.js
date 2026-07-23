/* ============================================================
   METADATA-CONTRACT.JS — Knowledge Language Foundation (V2, Phase 3.5)

   PURPOSE: fix the shape of (a) generic descriptive Metadata attachable to
   any KnowledgeItem, and (b) the Policy `kind` payload — a business-rule
   fact learned FROM an existing V1 policy engine, never a re-implementation
   of one.

   RESPONSIBILITY: typedefs + structural validators for Metadata and
   PolicyEntry.

   DEPENDENCIES: none. A real Policies connector (Phase 4+, per
   knowledge/connectors/README.md) will read
   js/services/dispatch-policy-engine.js / dispatch-policy-config.js
   read-only to populate PolicyEntry payloads — this contract file does not
   import them, since it defines shape only.

   NON-GOALS: does NOT duplicate the existing Policy Engine
   (js/services/dispatch-policy-engine.js). A PolicyEntry is a LEARNED FACT
   ABOUT a policy rule (for citation/explainability), never the executable
   rule itself — enforcement always stays in the real Policy Engine.

   FUTURE EVOLUTION: Phase 4+'s Policies connector populates PolicyEntry
   items citing existing config keys read-only.
   ============================================================ */

'use strict';

/**
 * Generic key/value descriptive metadata. Deliberately untyped beyond
 * string keys — this is NOT where `kind`-specific payload shape lives
 * (that's each payload's own contract file); it is auxiliary description
 * (e.g. author notes, ingestion batch id) that applies uniformly.
 * @typedef {Object.<string, string|number|boolean>} Metadata
 */

/**
 * Payload shape for `kind: 'policy'`. A citation of an existing V1
 * business rule, not an implementation of one.
 * @typedef {Object} PolicyEntry
 * @property {string} policyId        - a stable id, ideally matching an existing config key
 * @property {string} description     - human-readable statement of the rule
 * @property {string} [configRef]     - e.g. 'js/config/dispatch-policy-config.js#ambulanceDetection' — opaque, documentation-only
 */

export function isMetadata(m) {
  if (!m || typeof m !== 'object') return false;
  return Object.values(m).every((v) => ['string', 'number', 'boolean'].includes(typeof v));
}

export function isPolicyEntry(p) {
  return !!p && typeof p === 'object'
    && typeof p.policyId === 'string' && p.policyId.length > 0
    && typeof p.description === 'string' && p.description.length > 0;
}
