/* ============================================================
   DATA-CLASSIFICATION-CONTRACT.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: fix a MINIMAL sensitivity vocabulary so no future AI integration
   can assume "all application data may be sent to an external provider"
   (PART 20). Three classes, one rule: RESTRICTED never leaves the platform.

   RESPONSIBILITY: define DATA_CLASS, an ordering, `isSendableToProvider`,
   `assertSendable` (a guard a future outbound path calls before it hands
   anything to a provider), `maxClass`, and `makeClassifiedField`.

   DEPENDENCIES: none.

   NON-GOALS: this is NOT a DLP engine. There is deliberately no `classify()`
   — deciding a field's class from its content is later work. Phase 0 only
   guarantees the shape exists so the outbound boundary has something to
   check, rather than defaulting to "send everything".

   FUTURE EVOLUTION: a real classifier assigns DATA_CLASS to request/context
   fields; the provider boundary (server-side, see
   docs/V2_SARPRAS_INTELLIGENCE_ARCHITECTURE.md §12) rejects any payload
   whose max class is RESTRICTED, and masks INTERNAL fields per policy.
   ============================================================ */

'use strict';

export const DATA_CLASSIFICATION_SCHEMA = 'intelligence-data-classification@1';

/** The three classes. PUBLIC ⊂ INTERNAL ⊂ RESTRICTED by sensitivity. */
export const DATA_CLASS = Object.freeze({
  PUBLIC: 'public',
  INTERNAL: 'internal',
  RESTRICTED: 'restricted',
});

export const DATA_CLASS_DEFS = Object.freeze([
  Object.freeze({ id: DATA_CLASS.PUBLIC, rank: 0, label: 'Public', sendable: true }),
  Object.freeze({ id: DATA_CLASS.INTERNAL, rank: 1, label: 'Internal', sendable: true }),
  Object.freeze({ id: DATA_CLASS.RESTRICTED, rank: 2, label: 'Restricted', sendable: false }),
]);

const _rank = Object.freeze({ [DATA_CLASS.PUBLIC]: 0, [DATA_CLASS.INTERNAL]: 1, [DATA_CLASS.RESTRICTED]: 2 });

/** Classes that MAY be included in an outbound provider request. RESTRICTED
 *  is never here, and never will be — that is the whole point of PART 20. */
export const SENDABLE_TO_PROVIDER = Object.freeze([DATA_CLASS.PUBLIC, DATA_CLASS.INTERNAL]);

/** Whether `cls` is a known class. */
export function isDataClass(cls) {
  return typeof cls === 'string' && Object.prototype.hasOwnProperty.call(_rank, cls);
}

/** Whether data of class `cls` may be sent to an external AI provider. An
 *  unknown class fails closed (not sendable). */
export function isSendableToProvider(cls) {
  return SENDABLE_TO_PROVIDER.includes(cls);
}

/** The more sensitive of two classes (unknown inputs are treated as RESTRICTED). */
export function maxClass(a, b) {
  const ra = isDataClass(a) ? _rank[a] : _rank[DATA_CLASS.RESTRICTED];
  const rb = isDataClass(b) ? _rank[b] : _rank[DATA_CLASS.RESTRICTED];
  return ra >= rb ? (isDataClass(a) ? a : DATA_CLASS.RESTRICTED) : (isDataClass(b) ? b : DATA_CLASS.RESTRICTED);
}

/**
 * Guard for a future outbound path: throws unless `cls` is sendable. The
 * error carries a stable `code` so the provider boundary can map it to a
 * predictable IntelligenceResponse ERROR, never a stack trace to the user.
 * @param {string} cls
 */
export function assertSendable(cls) {
  if (!isSendableToProvider(cls)) {
    const err = new Error(`Data classified "${cls}" must never be sent to an external AI provider.`);
    err.code = 'DATA_NOT_SENDABLE';
    throw err;
  }
}

/**
 * @typedef {Object} ClassifiedField
 * @property {*} value
 * @property {string} classification  - one of DATA_CLASS
 */

/** Tag a value with a sensitivity class. Unknown classes normalise to
 *  RESTRICTED (fail closed), so a missing/typo'd class can never widen access. */
export function makeClassifiedField({ value, classification } = {}) {
  return Object.freeze({
    value: value ?? null,
    classification: isDataClass(classification) ? classification : DATA_CLASS.RESTRICTED,
  });
}
