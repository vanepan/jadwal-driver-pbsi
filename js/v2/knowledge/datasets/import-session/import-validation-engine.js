/* ============================================================
   IMPORT-VALIDATION-ENGINE.JS — Knowledge Acquisition Operational Readiness (V2.1)

   PURPOSE: "Dataset Validation" — a real, deterministic check over one
   Import Session before it may leave Uploaded, covering the five rules
   named in the roadmap: unsupported format, missing metadata, domain
   mismatch, duplicate filename, duplicate metadata (content hash). Never
   fabricates success — an Import Session with zero problems still runs
   through every rule, it simply produces zero warnings/errors.

   V2.1 addition: a sixth, NON-BLOCKING check (checkContentFacts) flags a
   session with no human-verified content yet as a warning, never an
   error — see checkMetadata()'s own comment for why: requiring content
   before Pending Review would make zero-config bulk upload impossible.
   The actual gate moved to import-session-engine.js#markKnowledgeImported.

   Stays knowledge-layer-pure: never imports organizational-memory (the
   one-way dependency rule — see js/v2/README.md). Duplicate-against-the-
   Archive is therefore deliberately NOT checked here; that composition
   happens in the UI layer (js/v2/ui/dataset-import-center.js), the one
   place both knowledge/ and organizational-memory/ are visible, exactly
   how archive-center.js already composes cross-layer checks today.

   RESPONSIBILITY: validateImportSession(session).

   DEPENDENCIES: ./repository/import-session-repository.js (duplicate
   checks among sessions), registry/domain-type-registry.js
   (hasDomainType, reused), observability/contracts/warning-contract.js
   (makeWarning/WARNING_SEVERITY, reused — same shape nor-connector.js
   already uses), ./contracts/import-session-contract.js.
   ============================================================ */

'use strict';

import { list as listSessions } from './repository/import-session-repository.js';
import { hasDomainType } from '../../registry/domain-type-registry.js';
import { makeWarning, WARNING_SEVERITY } from '../../observability/contracts/warning-contract.js';
import { IMPORT_SESSION_KIND } from './contracts/import-session-contract.js';

export const IMPORT_VALIDATION_ERRORS = Object.freeze({
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  MISSING_METADATA: 'MISSING_METADATA',
  DOMAIN_MISMATCH: 'DOMAIN_MISMATCH',
});

export const IMPORT_VALIDATION_WARNINGS = Object.freeze({
  DUPLICATE_FILENAME: 'DUPLICATE_FILENAME',
  DUPLICATE_METADATA: 'DUPLICATE_METADATA',
  NO_CONTENT_FACTS: 'NO_CONTENT_FACTS',
});

/** MIME types this milestone genuinely supports, keyed by the upload
 *  format they map to (IMPORT_SESSION_KIND). Synthetic datasets have no
 *  single MIME type (they're built through Synthetic Dataset Builder, not
 *  uploaded), so they're validated by `kind` alone, not mimeType. */
export const SUPPORTED_IMPORT_FORMATS = Object.freeze({
  'application/pdf': IMPORT_SESSION_KIND.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': IMPORT_SESSION_KIND.DOCX,
  'application/json': IMPORT_SESSION_KIND.JSON,
});

function makeError(code, message) {
  return Object.freeze({ code, message });
}

function checkFormat(session, errors) {
  if (session.kind === IMPORT_SESSION_KIND.SYNTHETIC) return;
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_IMPORT_FORMATS, session.mimeType)) {
    errors.push(makeError(IMPORT_VALIDATION_ERRORS.UNSUPPORTED_FORMAT, `MIME type "${session.mimeType}" is not a supported upload format (pdf/docx/json).`));
  }
}

/** V2.1 — administrative metadata ONLY (filename/domainType/datasetType,
 *  all deterministically auto-derivable per metadata-inference-engine.js).
 *  Content-fact completeness is NO LONGER checked here — see this file's
 *  header decision and checkContentFacts() below: requiring a human-typed
 *  fact before Pending Review would make zero-config bulk upload
 *  impossible (nothing can auto-derive real document content without
 *  OCR/AI, which stays forbidden). That requirement now blocks only the
 *  later Approved -> Knowledge Imported step
 *  (import-session-engine.js#markKnowledgeImported), matching the
 *  product's own "Review (only if necessary), right before the Knowledge
 *  pipeline" workflow. */
function checkMetadata(session, errors) {
  if (!session.filename || !session.domainType || !session.datasetType) {
    errors.push(makeError(IMPORT_VALIDATION_ERRORS.MISSING_METADATA, 'filename, domainType, and datasetType are all required.'));
  }
}

/** Non-blocking heads-up: this session has no human-verified content YET.
 *  A real, honest signal in the queue — never blocks Pending Review,
 *  never fabricates the missing content, never silently drops the
 *  requirement (see import-session-engine.js#markKnowledgeImported for
 *  the actual gate). */
function checkContentFacts(session, warnings) {
  const isJson = session.kind === IMPORT_SESSION_KIND.JSON;
  const hasFacts = isJson
    ? !!session.parsedContent && typeof session.parsedContent === 'object' && Object.keys(session.parsedContent).length > 0
    : !!session.manualEntryFacts && typeof session.manualEntryFacts === 'object' && Object.keys(session.manualEntryFacts).length > 0;
  if (!hasFacts) {
    warnings.push(makeWarning(
      IMPORT_VALIDATION_WARNINGS.NO_CONTENT_FACTS,
      isJson
        ? 'No parsed JSON content attached yet — this session cannot reach Knowledge Imported until it does.'
        : 'No manual-entry facts attached yet — a human will need to type the real facts read from this document before it can reach Knowledge Imported.',
      { connectorId: 'manual-file', sourceRef: session.id, severity: WARNING_SEVERITY.LOW },
    ));
  }
}

function checkDomainMismatch(session, errors, opts) {
  if (!hasDomainType(session.domainType)) {
    errors.push(makeError(IMPORT_VALIDATION_ERRORS.DOMAIN_MISMATCH, `"${session.domainType}" is not a registered domainType.`));
    return;
  }
  if (opts.expectedDomainType && session.domainType !== opts.expectedDomainType) {
    errors.push(makeError(IMPORT_VALIDATION_ERRORS.DOMAIN_MISMATCH, `This upload was started under "${opts.expectedDomainType}" but is scoped to domainType "${session.domainType}".`));
  }
}

function checkDuplicates(session, warnings) {
  const siblings = listSessions({ domainType: session.domainType });
  if (!siblings.ok) return;
  const others = siblings.data.filter((s) => s.id !== session.id);

  const sameFilename = others.filter((s) => s.filename === session.filename);
  if (sameFilename.length > 0) {
    warnings.push(makeWarning(
      IMPORT_VALIDATION_WARNINGS.DUPLICATE_FILENAME,
      `${sameFilename.length} other import session(s) already use the filename "${session.filename}".`,
      { connectorId: 'manual-file', sourceRef: session.id, severity: WARNING_SEVERITY.LOW },
    ));
  }

  if (session.documentHash) {
    const sameHash = others.filter((s) => s.documentHash === session.documentHash);
    if (sameHash.length > 0) {
      warnings.push(makeWarning(
        IMPORT_VALIDATION_WARNINGS.DUPLICATE_METADATA,
        `${sameHash.length} other import session(s) share the same content hash — likely the same document uploaded more than once.`,
        { connectorId: 'manual-file', sourceRef: session.id, severity: WARNING_SEVERITY.MEDIUM },
      ));
    }
  }
}

/**
 * @param {import('./contracts/import-session-contract.js').ImportSessionRecord} session
 * @param {{expectedDomainType?: string}} [opts]
 * @returns {{ok: boolean, errors: Object[], warnings: import('../../observability/contracts/warning-contract.js').KnowledgeWarning[]}}
 */
export function validateImportSession(session, opts = {}) {
  const errors = [];
  const warnings = [];
  checkFormat(session, errors);
  checkMetadata(session, errors);
  checkDomainMismatch(session, errors, opts);
  checkDuplicates(session, warnings);
  checkContentFacts(session, warnings);
  return { ok: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) };
}
