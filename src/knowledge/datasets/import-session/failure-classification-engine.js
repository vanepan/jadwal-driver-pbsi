/* ============================================================
   FAILURE-CLASSIFICATION-ENGINE.JS — Pipeline Observability Hardening (Phase 6.5)

   PURPOSE: "FAILED" alone is not explainable. This gives every real failure
   a real, stable CODE — never a fabricated specific cause. It is a PURE
   read-only classifier over fields the pipeline already writes today
   (ImportSessionRecord.failureReason, .validationErrors) — no engine
   changes, no schema changes, no new persisted field.

   Every branch below matches ONE of the small, closed set of real message
   templates pipeline-scheduler.js / import-validation-engine.js / dataset-
   import-service.js actually produce (verified by reading every
   failImportSession()/validateImportSession() call site, Phase 6.5 audit
   Part 9). A message that matches none of them returns UNKNOWN — this
   engine never guesses a specific cause it cannot actually attribute.

   RESPONSIBILITY: classifyFailure(session), classifyUploadError(message),
   FAILURE_CLASS, FAILURE_CLASS_LABEL.

   DEPENDENCIES: none (structural — reads plain ImportSessionRecord fields).

   NON-GOALS: does not change failureReason, does not write anything, does
   not participate in the Import Session lifecycle.
   ============================================================ */

'use strict';

export const FAILURE_CLASS = Object.freeze({
  NETWORK_ERROR: 'NETWORK_ERROR',
  FIREBASE_STORAGE: 'FIREBASE_STORAGE',
  RTDB_WRITE: 'RTDB_WRITE',
  DUPLICATE: 'DUPLICATE',
  INVALID_METADATA: 'INVALID_METADATA',
  POLICY_REJECTED: 'POLICY_REJECTED',
  KNOWLEDGE_ERROR: 'KNOWLEDGE_ERROR',
  UNKNOWN: 'UNKNOWN',
});

export const FAILURE_CLASS_LABEL = Object.freeze({
  [FAILURE_CLASS.NETWORK_ERROR]: 'Kegagalan Jaringan',
  [FAILURE_CLASS.FIREBASE_STORAGE]: 'Firebase Storage',
  [FAILURE_CLASS.RTDB_WRITE]: 'Gagal Menulis Data',
  [FAILURE_CLASS.DUPLICATE]: 'Duplikat',
  [FAILURE_CLASS.INVALID_METADATA]: 'Metadata/Bukti Tidak Lengkap',
  [FAILURE_CLASS.POLICY_REJECTED]: 'Ditolak Validasi Kebijakan',
  [FAILURE_CLASS.KNOWLEDGE_ERROR]: 'Gagal di Knowledge Pipeline',
  [FAILURE_CLASS.UNKNOWN]: 'Tidak Diketahui',
});

function pack(code) {
  return Object.freeze({ code, label: FAILURE_CLASS_LABEL[code] });
}

/**
 * @param {import('./contracts/import-session-contract.js').ImportSessionRecord|null} session
 * @returns {{code: string, label: string}}
 */
export function classifyFailure(session) {
  if (!session || !session.failureReason) return pack(FAILURE_CLASS.UNKNOWN);
  const reason = session.failureReason;
  const errorCodes = (session.validationErrors || []).map((e) => e.code);

  // pipeline-scheduler.js:258/272 — UNSUPPORTED_FORMAT, a real Dataset
  // Validation rule (import-validation-engine.js#checkFormat).
  if (errorCodes.includes('UNSUPPORTED_FORMAT') || /tidak didukung|not a supported upload format/i.test(reason)) {
    return pack(FAILURE_CLASS.POLICY_REJECTED);
  }
  // checkDomainMismatch — a real, deterministic policy rejection.
  if (errorCodes.includes('DOMAIN_MISMATCH') || /is not a registered domainType|scoped to domainType/i.test(reason)) {
    return pack(FAILURE_CLASS.POLICY_REJECTED);
  }
  // checkMetadata / markKnowledgeImported's MISSING_CONTENT_FACTS gate.
  if (errorCodes.includes('MISSING_METADATA') || /has no human-verified content|MISSING_CONTENT_FACTS/i.test(reason)) {
    return pack(FAILURE_CLASS.INVALID_METADATA);
  }
  // dataset-import-service.js's own real error codes, surfaced through
  // import-session-engine.js#markKnowledgeImported's IMPORT_FAILED message.
  if (/No DatasetSpec registered|NO_SOURCE_WIRED|CONNECTOR_NOT_FOUND|Knowledge Import gagal/i.test(reason)) {
    return pack(FAILURE_CLASS.KNOWLEDGE_ERROR);
  }
  // pipeline-scheduler.js's archive step (KNOWLEDGE_IMPORTED -> ARCHIVED) —
  // a write that did not land (the injected archiver, or markArchived()).
  if (/ArchiveRecord tidak dapat ditulis|Archive gagal/i.test(reason)) {
    return pack(FAILURE_CLASS.RTDB_WRITE);
  }
  // import-validation-engine.js's duplicate warnings, if ever escalated.
  if (/duplikat|duplicate/i.test(reason)) return pack(FAILURE_CLASS.DUPLICATE);
  // retry-with-backoff.js#withTimeout's real timeout code.
  if (/STORAGE_UPLOAD_TIMEOUT|timeout|jaringan/i.test(reason)) return pack(FAILURE_CLASS.NETWORK_ERROR);
  if (/storage|firebase/i.test(reason)) return pack(FAILURE_CLASS.FIREBASE_STORAGE);
  return pack(FAILURE_CLASS.UNKNOWN);
}

/**
 * Same taxonomy applied to a real Storage-upload failure observed directly
 * by the Performance Collector (see performance-collector.js#recordFileTiming)
 * — a failure that today never blocks the pipeline (see dataset-import-
 * center.js#processOneFile's own header) but must never be silently
 * swallowed to the console only either.
 * @param {string|null} message — the real uploadResult.error / caught err.message
 */
export function classifyUploadError(message) {
  if (!message) return null;
  if (/STORAGE_UPLOAD_TIMEOUT|timeout/i.test(message)) return pack(FAILURE_CLASS.NETWORK_ERROR);
  if (/permission|unauthorized|403/i.test(message)) return pack(FAILURE_CLASS.FIREBASE_STORAGE);
  return pack(FAILURE_CLASS.FIREBASE_STORAGE);
}
