/* ============================================================
   DATASET-IMPORT-SERVICE.JS — Dataset Import Foundation (V2.0.14)

   PURPOSE: wire a registered DatasetSpec (V2.0.13) to the EXISTING
   Knowledge Acquisition pipeline (acquisition/acquisition-engine.js,
   Phase 9/9.1) — a thin composition layer, deliberately NOT a second
   import pipeline. Every roadmap-named capability for this milestone
   already exists and is reused unchanged:

     Import Session   -> acquisition/contracts/session-contract.js
     Import Pipeline   -> acquisition-engine.js#runAcquisition
     Validation        -> knowledge-item-contract.js#isKnowledgeItem (via repository.create)
     Normalization     -> acquisition/contracts/normalization-contract.js
     Registration      -> registry/dataset-registry.js#registerDataset (V2.0.13)
     Rollback          -> repository/knowledge-repository.js#rollback (re-exported below)
     Import Events     -> acquisition-engine.js's `onEvent` callback
     Import History    -> acquisition-engine.js#listImportReports
     Provider Registry -> registry/connector-registry.js
     Import Reports    -> acquisition/contracts/import-report-contract.js

   The ONLY new thing this file adds: resolving a DatasetSpec's
   `sourceId` to the registered connector that reads it, and stamping the
   resulting KnowledgeImportReport with the dataset's classification
   (V2.0.13's dataset-classification-contract.js) so a caller can see
   WHICH dataset an import belongs to and how much its type is trusted —
   without altering what acquisition-engine.js itself computes.

   RESPONSIBILITY: `importDataset(datasetId, opts)`,
   `listDatasetImportReports(datasetId)`.

   DEPENDENCIES: registry/dataset-registry.js, registry/connector-registry.js,
   acquisition/acquisition-engine.js, contracts/dataset-classification-contract.js.

   NON-GOALS: never writes anything itself — every write still happens
   inside acquisition-engine.js's own create()/appendVersion() calls. Does
   not implement a second rollback mechanism — an imported item is a
   normal KnowledgeItem; the repository's own rollback already handles it.
   ============================================================ */

'use strict';

import { getDataset } from './registry/dataset-registry.js';
import { getDatasetTypeWeight, isBootstrapType } from './contracts/dataset-classification-contract.js';
import { listConnectors, getConnector } from '../registry/connector-registry.js';
import { runAcquisition, listImportReports } from '../acquisition/acquisition-engine.js';
import { rollback } from '../repository/knowledge-repository.js';

export const DATASET_IMPORT_ERRORS = Object.freeze({
  DATASET_NOT_FOUND: 'DATASET_NOT_FOUND',
  NO_SOURCE_WIRED: 'NO_SOURCE_WIRED',
  CONNECTOR_NOT_FOUND: 'CONNECTOR_NOT_FOUND',
});

/** Finds the registered connector whose own KnowledgeSource.id matches. No
 *  new Provider Registry — this only reads connector-registry.js's
 *  existing entries. */
function resolveConnectorForSource(sourceId) {
  for (const summary of listConnectors()) {
    const connector = getConnector(summary.id);
    if (connector && connector.source && connector.source.id === sourceId) return connector;
  }
  return null;
}

function enrichReport(report, spec) {
  return Object.freeze({
    ...report,
    datasetId: spec.datasetId,
    datasetType: spec.datasetType,
    datasetWeight: getDatasetTypeWeight(spec.datasetType),
    isBootstrap: isBootstrapType(spec.datasetType),
  });
}

/**
 * @param {string} datasetId
 * @param {{since?: string|null, onEvent?: Function}} [opts]
 * @returns {{ok: boolean, datasetId: string, report: object|null, error: object|null}}
 */
export function importDataset(datasetId, opts = {}) {
  const spec = getDataset(datasetId);
  if (!spec) {
    return { ok: false, datasetId, report: null, error: { code: DATASET_IMPORT_ERRORS.DATASET_NOT_FOUND, message: `No DatasetSpec registered under "${datasetId}".` } };
  }
  if (!spec.sourceId) {
    return { ok: false, datasetId, report: null, error: { code: DATASET_IMPORT_ERRORS.NO_SOURCE_WIRED, message: `DatasetSpec "${datasetId}" has no sourceId wired to a connector yet.` } };
  }
  const connector = resolveConnectorForSource(spec.sourceId);
  if (!connector) {
    return { ok: false, datasetId, report: null, error: { code: DATASET_IMPORT_ERRORS.CONNECTOR_NOT_FOUND, message: `No registered connector reads KnowledgeSource "${spec.sourceId}".` } };
  }

  const { result, report } = runAcquisition(connector.id, opts);
  return { ok: result.ok, datasetId, report: enrichReport(report, spec), error: null };
}

/** Import History, scoped to one Dataset — filters acquisition-engine.js's
 *  own report log by the dataset's connector; no second log is kept. */
export function listDatasetImportReports(datasetId) {
  const spec = getDataset(datasetId);
  if (!spec || !spec.sourceId) return [];
  const connector = resolveConnectorForSource(spec.sourceId);
  if (!connector) return [];
  return listImportReports(connector.id).map((r) => enrichReport(r, spec));
}

/** Rollback, re-exported for API discoverability under the datasets
 *  namespace — no new mechanism, see this file's header. */
export { rollback };
