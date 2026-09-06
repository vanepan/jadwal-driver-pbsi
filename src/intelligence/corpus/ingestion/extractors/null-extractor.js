/* ============================================================
   NULL-EXTRACTOR.JS — Corpus Ingestion & Document Analysis (V2, Phase 5.x.2)

   The inert default extractor. Always returns an honest failure — no
   text, no pages, method 'unknown'. Registered as the fallback so an
   unsupported / unconfigured format degrades safely (§14) instead of
   throwing or fabricating an empty "success".
   ============================================================ */

'use strict';

import { ADAPTER_KIND } from '../contracts/corpus-adapter-contract.js';
import { EXTRACTION_ERRORS, EXTRACTION_METHOD, extractionFailure } from '../contracts/extraction-result-contract.js';

export const NULL_EXTRACTOR_ID = 'null';

export const nullExtractor = Object.freeze({
  id: NULL_EXTRACTOR_ID,
  version: 'corpus-null-extractor@1',
  kind: ADAPTER_KIND.EXTRACTOR,
  async run() {
    return extractionFailure(EXTRACTION_ERRORS.NOT_IMPLEMENTED, 'No extractor is configured for this document format.', {
      method: EXTRACTION_METHOD.UNKNOWN,
    });
  },
});
