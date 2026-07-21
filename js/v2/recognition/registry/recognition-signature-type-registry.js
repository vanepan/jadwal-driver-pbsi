/* ============================================================
   RECOGNITION-SIGNATURE-TYPE-REGISTRY.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: register the vocabulary of `signatureType` values a
   RecognitionSignaturePayload may carry — mirrors knowledge/registry/
   kind-registry.js's exact shape (Map + register/has/get/list/reset).
   Registering a signatureType here is VOCABULARY ONLY — it never implies
   a real extractor exists yet, the same "registering vocabulary never
   implies a real sensor" discipline body/registry/entity-type-registry.js
   already established for its 19 entity types (only 3 ever got a real
   sensor).

   The four bootstrapped values below are not four new fingerprinting
   algorithms — three of them NAME existing, unrelated mechanisms this
   codebase already has (see recognition-signature-contract.js's header
   for the full disambiguation), so that Sprint 12.7.3's Similarity
   Strategy Registry can dispatch by signatureType without inventing a
   parallel classification for what already exists:

     'exact-hash'        — file-storage/file-hash.js SHA-256, or
                            organizational-memory/document-hash.js's
                            FNV-1a — WRAPPED, never reimplemented.
     'structural-shape'   — a field-presence-rate signature, the genuinely
                            new extractor this phase adds (Sprint 12.7.2).
     'field-overlap'      — the KnowledgeItem payload-key-overlap shape
                            knowledge/learning/similarity-detection-
                            engine.js#computeSimilarity already compares —
                            named here as a signature TYPE so Sprint
                            12.7.3 can dispatch to that existing engine by
                            signatureType, not reimplement its formula.
     'metadata-shape'      — filename/folder-token vocabulary already
                            matched by knowledge/datasets/import-session/
                            metadata-inference-engine.js — same reuse
                            intent as the above.

   RESPONSIBILITY: register/list/check signatureType ids and their labels.

   DEPENDENCIES: none.

   NON-GOALS: does not implement any extractor. Does not decide which
   signatureType applies to which domainType/entityType.
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string}>} */
const _signatureTypes = new Map();

export function registerSignatureType(id, label) {
  if (typeof id !== 'string' || !id) throw new Error('registerSignatureType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerSignatureType: label must be a non-empty string');
  _signatureTypes.set(id, Object.freeze({ id, label }));
}

export function hasSignatureType(id) {
  return _signatureTypes.has(id);
}

export function getSignatureType(id) {
  return _signatureTypes.get(id) || null;
}

export function listSignatureTypes() {
  return Object.freeze([..._signatureTypes.values()]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetSignatureTypeRegistry() {
  _signatureTypes.clear();
  bootstrap();
}

function bootstrap() {
  registerSignatureType('exact-hash', 'Exact Hash (byte- or field-identical)');
  registerSignatureType('structural-shape', 'Structural Shape (field-presence signature)');
  registerSignatureType('field-overlap', 'Field Overlap (payload key/value Jaccard)');
  registerSignatureType('metadata-shape', 'Metadata Shape (filename/folder vocabulary)');
}

bootstrap();
