/* ============================================================
   ACQUISITION-ENGINE.JS — Knowledge Acquisition (V2, Phase 9 / Phase 9.1)

   PURPOSE: the generic orchestration between a Connector and the
   Repository — "call this connector, wrap its output into a session, write
   every Draft item to the repository, report what happened." This is the
   "Knowledge Acquisition" node of the V2.0.2 brief's pipeline (Connector ->
   Source -> Acquisition -> Builder -> Repository), and the ONLY module
   that both calls a connector's fetch() and writes to the repository.

   RESPONSIBILITY: `runAcquisition(connectorId, { since, onEvent })` —
   resolve the connector from connector-registry.js, call `fetch(since)`,
   write every returned item to the repository (create, or appendVersion on
   a DUPLICATE_ID collision — the deterministic id scheme from
   identity-contract.js is what makes that collision meaningful instead of
   accidental), and return a KnowledgeAcquisitionResult + KnowledgeImportReport.

   Phase 9.1 (Knowledge Observability) additions, all additive:
   - Acquisition Events via an optional `opts.onEvent` callback, mirroring
     builder-orchestrator.js's onEvent idiom exactly.
   - Progress Reporting — a ProgressReport advanced once per item, carried
     as the `detail` of every ITEM_WRITTEN/ITEM_SKIPPED event.
   - Warning Reporting — a connector's ConnectorResult.warnings flow
     through into the KnowledgeAcquisitionResult/KnowledgeImportReport.
   - Import Statistics — every report is appended to an in-memory log
     (`listImportReports`/`resetImportReportLog`) an observability
     consumer can aggregate via observability/contracts/
     import-statistics-contract.js#buildImportStatistics.
   - Incremental Cursor — a successful run advances cursor-store.js's
     cursor for that connector; `runAcquisitionIncremental()` reads it back
     automatically, without changing `runAcquisition()`'s own signature or
     behavior.

   DEPENDENCIES: knowledge/registry/connector-registry.js,
   knowledge/repository/knowledge-repository.js, every acquisition/contracts/*.js,
   acquisition/cursor-store.js, observability/contracts/progress-contract.js.

   NON-GOALS: does not decide which connectors are "active" — every
   registered connector can be acquired from; it is builder/stages/* that
   decides which connectors actually get wired into a Builder run. Never
   writes a non-Draft item — a connector returning anything else is a
   contract violation the repository's isKnowledgeItem check will reject.
   Domain-agnostic: knows nothing about NOR or any other specific source.
   ============================================================ */

'use strict';

import { getConnector } from '../registry/connector-registry.js';
// Phase 3 — a CLIENT of the Knowledge Service, no longer a writer. This engine
// used to call repository create()/appendVersion() directly, which meant an
// item arriving from a connector already stamped `lifecycleState: 'approved'`
// would have been persisted as approved, with no human ever deciding so. The
// Service refuses that at the door (knowledge-service.js#INGESTABLE_STATES) —
// the human gate is now enforced where knowledge enters, not merely described
// where it is displayed.
import { ingest } from '../services/knowledge-service.js';
import { makeSource, SOURCE_REPRESENTATION } from './contracts/source-contract.js';
import { makeBatch } from './contracts/batch-contract.js';
import { makeExtractionContext, makeExtractionError, EXTRACTION_ERRORS } from './contracts/extraction-contract.js';
import { startSession, completeSession, SESSION_STATUS, makeAcquisitionResult } from './contracts/session-contract.js';
import { buildImportReport } from './contracts/import-report-contract.js';
import { ACQUISITION_EVENT_TYPE, makeAcquisitionEvent } from './contracts/event-contract.js';
import { makeProgressReport, advanceProgress } from '../observability/contracts/progress-contract.js';
import { getCursor, setCursor } from './cursor-store.js';

const DEFAULT_SOURCE = (connectorId) => makeSource({
  id: `${connectorId}.default`,
  connectorId,
  description: `Default source for connector "${connectorId}" (no explicit source supplied).`,
  representation: SOURCE_REPRESENTATION.STORE_RECORD,
});

/** @type {import('./contracts/import-report-contract.js').KnowledgeImportReport[]} */
const _reportLog = [];

function emit(onEvent, type, sessionId, connectorId, detail) {
  if (typeof onEvent === 'function') onEvent(makeAcquisitionEvent(type, { sessionId, connectorId, detail }));
}

function logAndReturn(result, extraCounts) {
  const report = buildImportReport(result, extraCounts);
  _reportLog.push(report);
  return { result, report };
}

/**
 * @param {string} connectorId
 * @param {{since?: string|null, onEvent?: Function}} [opts]
 * @returns {{result: import('./contracts/session-contract.js').KnowledgeAcquisitionResult, report: import('./contracts/import-report-contract.js').KnowledgeImportReport}}
 */
export function runAcquisition(connectorId, opts = {}) {
  const since = opts.since ?? null;
  const onEvent = opts.onEvent;
  const connector = getConnector(connectorId);
  const source = (connector && connector.source) || DEFAULT_SOURCE(connectorId);

  const session0 = startSession({ connectorId, sourceId: source.id, since });
  emit(onEvent, ACQUISITION_EVENT_TYPE.STARTED, session0.sessionId, connectorId, { since });

  if (!connector) {
    const session = completeSession(session0, SESSION_STATUS.FAILED);
    const error = makeExtractionError(EXTRACTION_ERRORS.RECORD_EXTRACTION_FAILED, `No connector registered under "${connectorId}".`, { connectorId });
    const result = makeAcquisitionResult({ ok: false, session, errors: [error] });
    emit(onEvent, ACQUISITION_EVENT_TYPE.FAILED, session.sessionId, connectorId, { error });
    return logAndReturn(result);
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
    emit(onEvent, ACQUISITION_EVENT_TYPE.FAILED, session.sessionId, connectorId, { error });
    return logAndReturn(result);
  }

  emit(onEvent, ACQUISITION_EVENT_TYPE.FETCHED, session0.sessionId, connectorId, { count: fetchResult.items.length });

  const batch = makeBatch(connectorId, source.id, fetchResult.items);
  const warnings = [...(fetchResult.warnings || [])];

  let progress = makeProgressReport(connectorId, batch.items.length);
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let itemsSkipped = 0;
  const errors = [];

  for (const item of batch.items) {
    // ONE call. The create-or-append-on-DUPLICATE_ID branching this loop used
    // to carry now lives in the Service (knowledge-service.js#ingest), which
    // reports which of the two it did via `op` — so the counters below stay
    // exactly as honest as they were, without this engine knowing how the
    // repository decides.
    const result = ingest(item);
    if (result.ok) {
      if (result.op === 'create') itemsCreated += 1; else itemsUpdated += 1;
      progress = advanceProgress(progress);
      emit(onEvent, ACQUISITION_EVENT_TYPE.ITEM_WRITTEN, session0.sessionId, connectorId, { itemId: item.id, op: result.op, progress });
      continue;
    }
    itemsSkipped += 1;
    progress = advanceProgress(progress);
    errors.push(makeExtractionError(EXTRACTION_ERRORS.NORMALIZATION_FAILED, result.error ? result.error.message : 'ingest() failed.', { connectorId, sourceRef: item.id }));
    emit(onEvent, ACQUISITION_EVENT_TYPE.ITEM_SKIPPED, session0.sessionId, connectorId, { itemId: item.id, progress });
  }

  const session = completeSession(session0, SESSION_STATUS.COMPLETED);
  const result = makeAcquisitionResult({
    ok: true,
    session,
    itemsExtracted: batch.items.length,
    itemsWritten: itemsCreated + itemsUpdated,
    itemsSkipped,
    errors,
    warnings,
  });

  setCursor(connectorId, { lastIndexedAt: session.startedAt });
  emit(onEvent, ACQUISITION_EVENT_TYPE.COMPLETED, session.sessionId, connectorId, { itemsWritten: itemsCreated + itemsUpdated, progress });

  return logAndReturn(result, { itemsCreated, itemsUpdated });
}

/**
 * Convenience wrapper: reads the connector's persisted cursor
 * (acquisition/cursor-store.js) and acquires only what's changed since —
 * without changing runAcquisition()'s own signature or behavior for
 * existing callers that pass `since` explicitly.
 * @param {string} connectorId
 * @param {{onEvent?: Function}} [opts]
 */
export function runAcquisitionIncremental(connectorId, opts = {}) {
  const cursor = getCursor(connectorId);
  return runAcquisition(connectorId, { ...opts, since: cursor ? cursor.lastIndexedAt : null });
}

/** Import Statistics support — every completed or failed run's report,
 *  oldest first. Feed to observability/contracts/
 *  import-statistics-contract.js#buildImportStatistics for a rollup. */
export function listImportReports(connectorId = null) {
  return connectorId ? _reportLog.filter((r) => r.connectorId === connectorId) : [..._reportLog];
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetImportReportLog() {
  _reportLog.length = 0;
}
