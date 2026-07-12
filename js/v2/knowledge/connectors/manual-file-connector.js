/* ============================================================
   MANUAL-FILE-CONNECTOR.JS — Knowledge Connector (V2.1, Knowledge Acquisition Operational Readiness)

   PURPOSE: the manual-verification bridge — lets a human who has actually
   read an uploaded PDF/DOCX (or a genuinely machine-parsed JSON file)
   become a real source of Draft Knowledge, matching the
   {id, version, description, source, fetch} contract every connector
   satisfies (contracts/connector-contract.js), same shape as
   nor-connector.js. Unlike nor-connector.js, this connector has NO V1/
   Firebase dependency — it only reads
   acquisition/manual-import-queue-store.js, a pure in-memory store — so it
   is safe to bootstrap eagerly (see registry/connector-registry.js).

   RESPONSIBILITY: read the ONE currently-active queued manual entry
   (manual-import-queue-store.js#consumeActiveEntry — scoped to exactly one
   Import Session per fetch() call by import-session-engine.js#
   markKnowledgeImported(), never a batch) and map it to a single Draft
   KnowledgeItem. For PDF/DOCX, the payload is the human-typed
   manualEntryFacts object; for JSON, the payload is the parsedContent
   object returned by a real JSON.parse() — content genuinely read by a
   human or deterministically parsed, never OCR/AI-inferred.

   DEPENDENCIES: acquisition/manual-import-queue-store.js,
   contracts/connector-contract.js, contracts/identity-contract.js,
   contracts/lifecycle-contract.js, acquisition/contracts/{source,
   normalization}-contract.js.

   Registration: unlike nor-connector.js (which self-registers because it
   transitively loads Firebase and must stay lazy/opt-in), this connector
   has zero V1/Firebase dependency, so — like the 11 placeholder
   connectors — it does NOT self-register here; registry/
   connector-registry.js imports it and registers it in bootstrap(), same
   as memorandum-connector.js et al.

   NON-GOALS: never writes back to anything. Never emits anything but
   Draft-lifecycle items (Decision 6 — nothing is auto-approved). Never
   parses PDF/DOCX content itself — that content only ever reaches this
   connector already typed by a human (import-session-engine.js requires
   manualEntryFacts to be attached before Approved for those formats).
   ============================================================ */

'use strict';

import { consumeActiveEntry } from '../acquisition/manual-import-queue-store.js';
import { connectorSuccess, connectorFailure, CONNECTOR_ERRORS } from '../contracts/connector-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { makeSource, SOURCE_REPRESENTATION } from '../acquisition/contracts/source-contract.js';
import { makeNormalization } from '../acquisition/contracts/normalization-contract.js';

export const MANUAL_FILE_CONNECTOR_ID = 'manual-file';
export const MANUAL_FILE_CONNECTOR_VERSION = 'manual-file-connector@1';

const NORMALIZATION = makeNormalization({
  normalizerId: 'manual-file-normalizer',
  normalizerVersion: '1',
  sourceRepresentation: SOURCE_REPRESENTATION.HUMAN_CORRECTION,
  notes: 'Payload is either human-typed manualEntryFacts (PDF/DOCX) or a real JSON.parse() result (JSON) — never OCR/AI-inferred content.',
});

export const manualFileSource = makeSource({
  id: 'manual.file_uploads',
  connectorId: MANUAL_FILE_CONNECTOR_ID,
  description: 'Human-verified facts submitted through the Dataset Import Center manual-entry bridge.',
  representation: SOURCE_REPRESENTATION.HUMAN_CORRECTION,
});

function toKnowledgeItem(entry) {
  const now = new Date().toISOString();
  const payload = entry.parsedContent && typeof entry.parsedContent === 'object'
    ? { ...entry.parsedContent, normalization: NORMALIZATION }
    : { ...(entry.facts || {}), normalization: NORMALIZATION };
  return Object.freeze({
    id: generateKnowledgeId({ domainType: entry.domainType, sourceType: MANUAL_FILE_CONNECTOR_ID, sourceRef: entry.importSessionId }),
    version: 1,
    domainType: entry.domainType,
    sourceType: MANUAL_FILE_CONNECTOR_ID,
    kind: entry.kind,
    payload,
    confidence: 1,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: MANUAL_FILE_CONNECTOR_ID, sourceRef: entry.importSessionId, capturedAt: now }),
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** `since` is accepted for contract-shape parity with every other
 *  connector but is unused here — this connector is scoped to exactly one
 *  active Import Session per call (see header), never a time window. */
function fetch(since = null) { // eslint-disable-line no-unused-vars
  try {
    const entry = consumeActiveEntry();
    const items = entry ? [toKnowledgeItem(entry)] : [];
    return connectorSuccess(items, { connectorId: MANUAL_FILE_CONNECTOR_ID, warnings: [] });
  } catch (e) {
    return connectorFailure(
      CONNECTOR_ERRORS.FETCH_FAILED,
      e && e.message ? e.message : 'Manual file connector fetch failed.',
      { connectorId: MANUAL_FILE_CONNECTOR_ID },
    );
  }
}

export const manualFileConnector = Object.freeze({
  id: MANUAL_FILE_CONNECTOR_ID,
  version: MANUAL_FILE_CONNECTOR_VERSION,
  description: 'Acquires Draft Knowledge from human-verified facts submitted through the Dataset Import Center manual-entry bridge (PDF/DOCX/JSON uploads).',
  source: manualFileSource,
  fetch,
});

export default manualFileConnector;
