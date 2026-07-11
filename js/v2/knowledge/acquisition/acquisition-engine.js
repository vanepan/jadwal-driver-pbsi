/* ============================================================
   ACQUISITION-ENGINE.JS — Knowledge Acquisition (V2, Phase 9)

   PURPOSE: the generic orchestration between a Connector and the
   Repository — "call this connector, wrap its output into a session, write
   every Draft item to the repository, report what happened." This is the
   "Knowledge Acquisition" node of the V2.0.2 brief's pipeline (Connector ->
   Source -> Acquisition -> Builder -> Repository), and the ONLY module
   that both calls a connector's fetch() and writes to the repository.

   RESPONSIBILITY: `runAcquisition(connectorId, { since })` — resolve the
   connector from connector-registry.js, call `fetch(since)`, write every
   returned item to the repository (create, or appendVersion on a
   DUPLICATE_ID collision — the deterministic id scheme from
   identity-contract.js is what makes that collision meaningful instead of
   accidental), and return a KnowledgeAcquisitionResult + KnowledgeImportReport.

   DEPENDENCIES: knowledge/registry/connector-registry.js,
   knowledge/repository/knowledge-repository.js, every acquisition/contracts/*.js.

   NON-GOALS: does not decide which connectors are "active" — every
   registered connector can be acquired from; it is builder/stages/* that
   decides which connectors actually get wired into a Builder run. Never
   writes a non-Draft item — a connector returning anything else is a
   contract violation the repository's isKnowledgeItem check will reject.
   Domain-agnostic: knows nothing about NOR or any other specific source.
   ============================================================ */

'use strict';

import { getConnector } from '../registry/connector-registry.js';
import { create, appendVersion } from '../repository/knowledge-repository.js';
import { REPOSITORY_ERRORS } from '../repository/contracts/repository-contract.js';
import { makeSource, SOURCE_REPRESENTATION } from './contracts/source-contract.js';
import { makeBatch } from './contracts/batch-contract.js';
import { makeExtractionContext, makeExtractionError, EXTRACTION_ERRORS } from './contracts/extraction-contract.js';
import { startSession, completeSession, SESSION_STATUS, makeAcquisitionResult } from './contracts/session-contract.js';
import { buildImportReport } from './contracts/import-report-contract.js';

const DEFAULT_SOURCE = (connectorId) => makeSource({
  id: `${connectorId}.default`,
  connectorId,
  description: `Default source for connector "${connectorId}" (no explicit source supplied).`,
  representation: SOURCE_REPRESENTATION.STORE_RECORD,
});

/**
 * @param {string} connectorId
 * @param {{since?: string|null}} [opts]
 * @returns {{result: import('./contracts/session-contract.js').KnowledgeAcquisitionResult, report: import('./contracts/import-report-contract.js').KnowledgeImportReport}}
 */
export function runAcquisition(connectorId, opts = {}) {
  const since = opts.since ?? null;
  const connector = getConnector(connectorId);
  const source = (connector && connector.source) || DEFAULT_SOURCE(connectorId);

  const session0 = startSession({ connectorId, sourceId: source.id, since });

  if (!connector) {
    const session = completeSession(session0, SESSION_STATUS.FAILED);
    const error = makeExtractionError(EXTRACTION_ERRORS.RECORD_EXTRACTION_FAILED, `No connector registered under "${connectorId}".`, { connectorId });
    const result = makeAcquisitionResult({ ok: false, session, errors: [error] });
    return { result, report: buildImportReport(result) };
  }

  makeExtractionContext({ connectorId, sourceId: source.id, since }); // built for parity with the contract; the session already carries the same fields

  const fetchResult = connector.fetch(since);

  if (!fetchResult || !fetchResult.ok) {
    const session = completeSession(session0, SESSION_STATUS.FAILED);
    const error = makeExtractionError(
      (fetchResult && fetchResult.error && fetchResult.error.code) || EXTRACTION_ERRORS.RECORD_EXTRACTION_FAILED,
      (fetchResult && fetchResult.error && fetchResult.error.message) || 'Connector fetch failed.',
      { connectorId },
    );
    const result = makeAcquisitionResult({ ok: false, session, errors: [error] });
    return { result, report: buildImportReport(result) };
  }

  const batch = makeBatch(connectorId, source.id, fetchResult.items);

  let itemsCreated = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;
  const errors = [];

  for (const item of batch.items) {
    const createResult = create(item);
    if (createResult.ok) {
      itemsCreated += 1;
      continue;
    }
    if (createResult.error && createResult.error.code === REPOSITORY_ERRORS.DUPLICATE_ID) {
      const appendResult = appendVersion(item.id, item);
      if (appendResult.ok) {
        itemsUpdated += 1;
      } else {
        itemsSkipped += 1;
        errors.push(makeExtractionError(EXTRACTION_ERRORS.NORMALIZATION_FAILED, appendResult.error.message, { connectorId, sourceRef: item.id }));
      }
      continue;
    }
    itemsSkipped += 1;
    errors.push(makeExtractionError(EXTRACTION_ERRORS.NORMALIZATION_FAILED, createResult.error ? createResult.error.message : 'create() failed.', { connectorId, sourceRef: item.id }));
  }

  const session = completeSession(session0, SESSION_STATUS.COMPLETED);
  const result = makeAcquisitionResult({
    ok: true,
    session,
    itemsExtracted: batch.items.length,
    itemsWritten: itemsCreated + itemsUpdated,
    itemsSkipped,
    errors,
  });
  const report = buildImportReport(result, { itemsCreated, itemsUpdated });
  return { result, report };
}
