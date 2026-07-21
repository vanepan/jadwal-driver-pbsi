/* ============================================================
   RECOGNITION-SIGNATURE-CONTRACT.JS — Recognition Foundation (Phase 12.7.1)

   PURPOSE: fix the payload shape for RECORD_TYPE.SIGNATURE — "Recognition
   Signature / Fingerprint" from the brief. Deliberately a WRAPPER, not a
   new fingerprinting algorithm: this codebase already has three unrelated
   things informally called a "fingerprint" —
     1. file-storage/file-hash.js's real SHA-256 (exact-byte).
     2. organizational-memory/document-hash.js's FNV-1a over 7 NOR
        snapshot fields (exact-field-match).
     3. document-intelligence/nor/nor-analyzer.js's "structural fingerprint"
        (the NOR ViewModel's fixed, hardcoded section-name list).
   and the pipeline's own PIPELINE_STAGE.FINGERPRINTING (the SHA-256 step)
   is a FOURTH, unrelated prior use of the word. None of them is a general,
   pluggable "derive a comparable signature from any domainType/entityType"
   concept. This contract fixes that shape; ./registry/recognition-
   signature-type-registry.js registers the extractor ids each
   `signatureType` names — the three existing hashes each become one
   registered signatureType (see that registry's own header), never
   replaced or reimplemented.

   RESPONSIBILITY: define RecognitionSignaturePayload.

   DEPENDENCIES: none (signatureType is checked against the registry by
   the ENGINE that produces one, per this platform's "registry-backed,
   never a hardcoded switch, never gated at the contract layer" precedent
   — see knowledge-item-contract.js, which checks domainType/kind against
   the registry in its own validator; this file follows the SAME
   discipline non-negotiably, see below).

   NON-GOALS: does not compute a signature. Does not decide which
   signatureType applies to which domainType/entityType — that is
   recognition-signature-type-registry.js's registered vocabulary plus
   whichever extractor (Sprint 12.7.2+) actually runs.
   ============================================================ */

'use strict';

export const RECOGNITION_SIGNATURE_SCHEMA = 'recognition-signature@1';

/**
 * @typedef {Object} RecognitionSignaturePayload
 * @property {string} signatureType    - registry-backed, see registry/recognition-signature-type-registry.js
 * @property {string} value            - the derived, comparable signature value (a hash, a sorted field-name list joined by a delimiter, etc. — opaque to this contract)
 * @property {string} extractorId      - which extractor produced this value (e.g. 'file-hash', 'document-hash', 'field-presence')
 * @property {string} computedAt       - ISO 8601
 */

export function isRecognitionSignaturePayload(p) {
  return !!p && typeof p === 'object'
    && typeof p.signatureType === 'string' && p.signatureType.length > 0
    && typeof p.value === 'string' && p.value.length > 0
    && typeof p.extractorId === 'string' && p.extractorId.length > 0
    && typeof p.computedAt === 'string' && p.computedAt.length > 0;
}
