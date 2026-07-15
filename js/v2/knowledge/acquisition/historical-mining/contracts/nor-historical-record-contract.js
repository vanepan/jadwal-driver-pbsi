/* ============================================================
   NOR-HISTORICAL-RECORD-CONTRACT.JS — Autonomous Knowledge Acquisition
   (Sprint 02)

   PURPOSE: fix the shape of ONE historical NOR as this pipeline consumes
   it — a flattened, already-structured population record, never a PDF,
   never OCR output. Deliberately narrower than
   js/petty-cash/nor-document-engine.js#buildNorViewModel()'s own full
   ViewModel: only the fields this pipeline can honestly mine something
   from (recipients/cc/sender, subject text, item text, signatory roles,
   opening/realized/remaining amounts, dates). Amount VALUES are kept
   (unlike knowledge/connectors/nor-connector.js's own "structure only,
   never business content" fingerprint) because Task 4's Confidence
   Engine and Task 1's statistical/reasoning inference genuinely need
   them — this is a population-level statistical read, not a per-document
   content leak into a single KnowledgeItem.

   RESPONSIBILITY: typedef + structural validator only.

   DEPENDENCIES: none.

   NON-GOALS: does not read anything — see
   knowledge/connectors/nor-historical-population-reader.js (the ONE file
   allowed to import petty-cash-store.js / nor-document-engine.js).
   ============================================================ */

'use strict';

/**
 * @typedef {Object} NorHistoricalRecord
 * @property {string} sourceRef        - stable identifier (norNumber), never re-used across records
 * @property {string|null} norDate     - ISO date string
 * @property {string|null} generatedAt - ISO datetime, for document-age weighting
 * @property {boolean} isTest
 * @property {string} subject
 * @property {string} senderTitle
 * @property {string[]} recipients
 * @property {string[]} cc
 * @property {number} openingAmount
 * @property {number} realizedAmount
 * @property {number} remainingAmount
 * @property {number} itemCount
 * @property {string[]} itemTexts       - item description + keterangan strings (for vocabulary mining)
 * @property {string[]} signatoryRoles  - letterTop + letterBottom positions, in order
 * @property {string[]} recapSignatoryRoles
 */

export function isNorHistoricalRecord(r) {
  return !!r && typeof r === 'object'
    && typeof r.sourceRef === 'string' && r.sourceRef.length > 0
    && typeof r.isTest === 'boolean'
    && typeof r.subject === 'string'
    && typeof r.senderTitle === 'string'
    && Array.isArray(r.recipients)
    && Array.isArray(r.cc)
    && typeof r.openingAmount === 'number'
    && typeof r.realizedAmount === 'number'
    && typeof r.remainingAmount === 'number'
    && typeof r.itemCount === 'number'
    && Array.isArray(r.itemTexts)
    && Array.isArray(r.signatoryRoles)
    && Array.isArray(r.recapSignatoryRoles);
}

/** @param {*} list @returns {boolean} */
export function isNorHistoricalPopulation(list) {
  return Array.isArray(list) && list.length > 0 && list.every(isNorHistoricalRecord);
}
