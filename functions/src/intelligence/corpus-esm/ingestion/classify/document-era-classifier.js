/* ============================================================
   DOCUMENT-ERA-CLASSIFIER.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: classify a document's ERA — historical | current |
   transitional | unknown — with a confidence (§7).

   THE HARD RULE (§7): era is a property of the DOCUMENT / the convention
   it follows, NOT of the ingestion timestamp. This classifier NEVER
   receives, and NEVER uses, "now". Its only inputs are:
     • a `sourceDate` already extracted FROM THE DOCUMENT CONTENT
       (source-date-extractor.js)
     • an OPTIONAL, operator-configured `eraCutoverDate` — the date on/
       after which PBSI's *current* NOR convention is considered in force.
       When it is null (the default — no chronology is assumed), era is
       decided only by weak textual markers, and otherwise `unknown`.
     • weak textual markers of superseded terminology (e.g. a document
       that calls itself a "MEMO" for a job the current NOR does)

   If nothing decides: `documentEra = 'unknown'`, `eraConfidence < 1`.
   Chronology is never invented.

   RESPONSIBILITY: classifyDocumentEra({ sourceDate, documentType, text },
   { eraCutoverDate, transitionalWindowDays }) ->
   { documentEra, eraConfidence, eraSignals }.

   DEPENDENCIES: ../contracts/classification-result-contract.js,
   ../../contracts/corpus-document-contract.js. Pure.
   ============================================================ */

'use strict';

import { CORPUS_DOCUMENT_ERA, CORPUS_DOCUMENT_TYPE } from '../../contracts/corpus-document-contract.js';
import {
  SIGNAL_SOURCE, makeClassificationSignal,
} from '../contracts/classification-result-contract.js';

function daysBetween(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * @param {{ sourceDate?: string|null, documentType?: string, text?: string }} input
 * @param {{ eraCutoverDate?: string|null, transitionalWindowDays?: number }} [config]
 * @returns {{ documentEra: string, eraConfidence: number, eraSignals: import('../contracts/classification-result-contract.js').ClassificationSignal[] }}
 */
export function classifyDocumentEra({ sourceDate = null, documentType = CORPUS_DOCUMENT_TYPE.UNKNOWN, text = '' } = {}, config = {}) {
  const eraCutoverDate = config.eraCutoverDate || null;
  const transitionalWindowDays = Number.isFinite(config.transitionalWindowDays) ? config.transitionalWindowDays : 120;
  const signals = [];

  // ── weak textual marker: the document uses a predecessor instrument name ──
  if (documentType === CORPUS_DOCUMENT_TYPE.LEGACY) {
    signals.push(makeClassificationSignal({
      source: SIGNAL_SOURCE.TERMINOLOGY, name: 'predecessor_instrument', weight: 0.5,
      evidence: 'classified as a LEGACY / predecessor instrument — its convention is not the current one',
    }));
  }
  if (/\bmemo(randum)?\b/i.test(text) && /realisasi\s+petty\s+cash/i.test(text) && documentType !== CORPUS_DOCUMENT_TYPE.NOR) {
    signals.push(makeClassificationSignal({
      source: SIGNAL_SOURCE.TERMINOLOGY, name: 'memo_terminology_for_nor_job', weight: 0.3,
      evidence: 'uses "MEMO/MEMORANDUM" terminology for a petty-cash realisation (the job the current NOR does)',
    }));
  }

  // ── cutover comparison — ONLY if the operator configured a real cutover
  //    AND the document itself stated a date ──
  if (eraCutoverDate && sourceDate) {
    const delta = daysBetween(sourceDate, eraCutoverDate);
    if (delta != null) {
      if (delta < -transitionalWindowDays) {
        signals.push(makeClassificationSignal({
          source: SIGNAL_SOURCE.ERA_CUTOVER, name: 'before_cutover', weight: 0.85,
          evidence: `document date ${sourceDate} is ${Math.abs(delta)} days before the configured era cutover ${eraCutoverDate}`,
        }));
        const strong = signals.reduce((a, s) => a + s.weight, 0);
        return { documentEra: CORPUS_DOCUMENT_ERA.HISTORICAL, eraConfidence: Math.min(0.9, strong), eraSignals: signals };
      }
      if (delta > transitionalWindowDays) {
        signals.push(makeClassificationSignal({
          source: SIGNAL_SOURCE.ERA_CUTOVER, name: 'after_cutover', weight: 0.8,
          evidence: `document date ${sourceDate} is ${delta} days after the configured era cutover ${eraCutoverDate}`,
        }));
        return { documentEra: CORPUS_DOCUMENT_ERA.CURRENT, eraConfidence: 0.8, eraSignals: signals };
      }
      signals.push(makeClassificationSignal({
        source: SIGNAL_SOURCE.ERA_CUTOVER, name: 'near_cutover', weight: 0.6,
        evidence: `document date ${sourceDate} is within ±${transitionalWindowDays} days of the era cutover ${eraCutoverDate}`,
      }));
      return { documentEra: CORPUS_DOCUMENT_ERA.TRANSITIONAL, eraConfidence: 0.6, eraSignals: signals };
    }
  }

  // ── no cutover configured (or no document date): decide only on weak
  //    textual markers, else UNKNOWN (no chronology invented — §7) ──
  const markerStrength = signals.reduce((a, s) => a + s.weight, 0);
  if (markerStrength >= 0.5) {
    return { documentEra: CORPUS_DOCUMENT_ERA.HISTORICAL, eraConfidence: Math.min(0.7, markerStrength), eraSignals: signals };
  }
  return { documentEra: CORPUS_DOCUMENT_ERA.UNKNOWN, eraConfidence: Math.min(0.4, markerStrength), eraSignals: signals };
}
