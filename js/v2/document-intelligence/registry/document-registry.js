/* ============================================================
   DOCUMENT-REGISTRY.JS — Document Intelligence Foundation (V2, Phase 7)

   PURPOSE: the process-wide directory of DocumentAnalyzers, mirroring
   every other registry in this codebase (provider/connector/stage/
   repository/adapter).

   RESPONSIBILITY: register/get/list analyzers against
   contracts/document-analysis-contract.js's DocumentAnalyzer shape.

   DEPENDENCIES: contracts/document-analysis-contract.js.

   NON-GOALS: zero analyzers are registered in Phase 7.

   FUTURE EVOLUTION: Phase 8's NOR pilot registers the first real analyzer.
   ============================================================ */

'use strict';

import { isDocumentAnalyzer } from '../contracts/document-analysis-contract.js';

export const DOCUMENT_REGISTRY_ERRORS = Object.freeze({
  INVALID_ANALYZER: 'INVALID_ANALYZER',
});

const _analyzers = new Map();

export function registerAnalyzer(analyzer) {
  if (!isDocumentAnalyzer(analyzer)) {
    const err = new Error('registerAnalyzer: analyzer must satisfy { id, version, description, analyze(input) }.');
    err.code = DOCUMENT_REGISTRY_ERRORS.INVALID_ANALYZER;
    throw err;
  }
  _analyzers.set(analyzer.id, analyzer);
  return analyzer;
}

export function getAnalyzer(id) {
  return _analyzers.get(id) || null;
}

export function listAnalyzers() {
  return Object.freeze([..._analyzers.values()].map((a) => Object.freeze({
    id: a.id, version: a.version, description: a.description || null,
  })));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetDocumentRegistry() {
  _analyzers.clear();
}
