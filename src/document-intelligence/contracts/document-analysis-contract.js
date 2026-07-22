/* ============================================================
   DOCUMENT-ANALYSIS-CONTRACT.JS — Document Intelligence Foundation (V2, Phase 7)

   PURPOSE: fix the shapes Document Intelligence uses to describe an
   EXISTING document (never to generate one) — Analyzer, Classifier,
   Intent, Structure. This is the read side: "what is this document",
   feeding Knowledge as a source (via the Documents connector,
   knowledge/connectors/README.md) and, later, informing a draft (Phase
   7's Draft contract, document-draft-contract.js).

   RESPONSIBILITY: define DocumentAnalyzer (mirrors the Stage/Connector/
   Provider contract family: `{ id, version, analyze(input) }`),
   DocumentClassification, DocumentIntent, and DocumentStructure typedefs.

   DEPENDENCIES: none. A real Analyzer (Phase 7+) will read Knowledge
   Platform read-only (via knowledge/services/) for structure/pattern
   context, and existing V1 document view-models
   (js/docs/template-registry.js's `templateId` vocabulary,
   js/exports/analytics/model/report-types.js's typedefs) for reuse — this
   contract file imports neither, since it defines shape only.

   NON-GOALS: no analyzer is implemented. No document is read. No
   NOR-specific (or any domain-specific) analysis exists here — that is
   Phase 8's NOR pilot, scoped under document-intelligence/nor/.

   FUTURE EVOLUTION: Phase 7+ implements a real Analyzer that reads an
   existing rendered view-model (reusing the domain module → view-model →
   template pipeline already proven in js/reimbursement.js, per the
   architecture audit §2.1) and produces a DocumentStructure fact —
   candidate KnowledgeItem payload, ultimately.
   ============================================================ */

'use strict';

export const DOCUMENT_ANALYSIS_SCHEMA = 'document-analysis@1';

export const DOCUMENT_ANALYZER_ERRORS = Object.freeze({
  ANALYZE_FAILED: 'ANALYZE_FAILED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});

/**
 * @typedef {Object} DocumentAnalyzer
 * @property {string} id
 * @property {string} version
 * @property {string} description
 * @property {(input: object) => DocumentAnalysisResult} analyze
 */

/**
 * @typedef {Object} DocumentAnalysisResult
 * @property {boolean} ok
 * @property {DocumentClassification|null} classification
 * @property {DocumentIntent|null} intent
 * @property {DocumentStructure|null} structure
 * @property {{code: string, message: string}|null} error
 */

/**
 * @typedef {Object} DocumentClassification
 * @property {string} domainType   - a registered knowledge domainType, e.g. 'nor'
 * @property {number} confidence   - 0-1
 */

/**
 * @typedef {Object} DocumentIntent
 * @property {string} label        - e.g. 'request_reimbursement' | 'record_maintenance'
 * @property {number} confidence
 */

/**
 * @typedef {Object} DocumentStructure
 * @property {string[]} sectionLabels  - ordered, e.g. ['header', 'body', 'signature']
 * @property {import('../../../js/v2/knowledge/language/contracts/pattern-contract.js').PatternSlot[]} [slots]
 */

export function analysisSuccess({ classification = null, intent = null, structure = null } = {}) {
  return Object.freeze({ ok: true, classification, intent, structure, error: null });
}

export function analysisFailure(code, message) {
  return Object.freeze({ ok: false, classification: null, intent: null, structure: null, error: Object.freeze({ code, message }) });
}

export function isDocumentAnalyzer(a) {
  return !!a && typeof a === 'object'
    && typeof a.id === 'string' && a.id.length > 0
    && typeof a.version === 'string' && a.version.length > 0
    && typeof a.analyze === 'function';
}
