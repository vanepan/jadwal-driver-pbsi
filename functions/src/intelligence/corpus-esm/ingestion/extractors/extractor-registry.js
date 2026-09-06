/* ============================================================
   EXTRACTOR-REGISTRY.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: pick the right extractor for a CorpusSource's format, with the
   Null extractor as the always-present fallback for unsupported /
   unconfigured formats (§14 — fail safe, never throw).

   Default wiring:
     pdf   → pdf-structure-extractor (deterministic, dependency-free)
     docx  → docx-extractor (Mammoth port; PARSER_UNAVAILABLE if absent)
     *     → null-extractor (NOT_IMPLEMENTED)

   A caller may override any slot (e.g. inject a pdfjs-backed PDF
   extractor, or a stub for tests) via createExtractorRegistry({ pdf, docx }).
   ============================================================ */

'use strict';

import { CORPUS_FORMAT } from '../contracts/corpus-source-contract.js';
import { nullExtractor } from './null-extractor.js';
import { createDocxExtractor } from './docx-extractor.js';
import { createPdfStructureExtractor } from './pdf-structure-extractor.js';

/**
 * @param {{ pdf?: object, docx?: object, mammothPort?: object, inflatePort?: Function }} [opts]
 */
export function createExtractorRegistry({ pdf, docx, mammothPort, inflatePort } = {}) {
  const byFormat = new Map();
  byFormat.set(CORPUS_FORMAT.PDF, pdf || createPdfStructureExtractor({ inflatePort }));
  byFormat.set(CORPUS_FORMAT.DOCX, docx || createDocxExtractor({ mammothPort }));

  return Object.freeze({
    /** @returns {object} an extractor adapter — never null (Null fallback). */
    forFormat(format) {
      return byFormat.get(format) || nullExtractor;
    },
    forSource(source) {
      return (source && byFormat.get(source.format)) || nullExtractor;
    },
    list() {
      return Object.freeze([...byFormat.entries()].map(([format, a]) => Object.freeze({ format, id: a.id, version: a.version })));
    },
  });
}

/** The default registry (deterministic PDF + Mammoth-port DOCX). */
export const defaultExtractorRegistry = createExtractorRegistry();
