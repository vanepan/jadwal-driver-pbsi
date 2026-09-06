/* ============================================================
   DOCX-EXTRACTOR.JS — Corpus Ingestion & Document Analysis (V2, Phase 5.x.2)

   PURPOSE: turn a `.docx` (a zip of XML) into deterministic text +
   structure. `.docx` extraction is a real, non-AI, non-OCR operation —
   Mammoth walks `word/document.xml`. This mirrors the intent of the
   existing src/knowledge/datasets/import-session/docx-text-extractor.js
   but (a) preserves STRUCTURE (paragraphs / headings / tables), which the
   knowledge one deliberately does not, and (b) takes Mammoth as an
   INJECTED port so the pure pipeline stays testable and fails safe when
   Mammoth is absent (§8, §14).

   THE MAMMOTH PORT: `{ extractRawText({buffer|arrayBuffer}), convertToHtml(...) }`.
   Default resolver = a dynamic `import('mammoth')` (works under Node,
   where `mammoth` is a devDependency; the browser build exposes the same
   surface). If it cannot be resolved, the extractor returns an honest
   PARSER_UNAVAILABLE failure — it never throws into the pipeline.

   RESPONSIBILITY: createDocxExtractor({ mammothPort? }) -> a corpus
   EXTRACTOR adapter. `method: 'structure_parse'` on success.

   NON-GOALS: no OCR, no layout geometry (a .docx has no fixed pages —
   `pageCount` stays null, `pages` stays []). No AI.
   ============================================================ */

'use strict';

import { ADAPTER_KIND } from '../contracts/corpus-adapter-contract.js';
import {
  EXTRACTION_ERRORS, EXTRACTION_METHOD, extractionSuccess, extractionFailure, makeStructNode,
} from '../contracts/extraction-result-contract.js';

export const DOCX_EXTRACTOR_ID = 'docx-mammoth';

let _cachedMammoth;
async function defaultMammothPort() {
  if (_cachedMammoth !== undefined) return _cachedMammoth;
  try {
    const mod = await import('mammoth');
    _cachedMammoth = mod && mod.default ? mod.default : mod;
  } catch {
    _cachedMammoth = null;
  }
  return _cachedMammoth;
}

function toArrayBuffer(bytes) {
  if (bytes == null) return null;
  if (bytes instanceof ArrayBuffer) return bytes;
  if (ArrayBuffer.isView(bytes)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (Array.isArray(bytes)) return Uint8Array.from(bytes).buffer;
  return null;
}

function toBuffer(bytes) {
  if (bytes == null) return null;
  if (typeof Buffer !== 'undefined') {
    if (Buffer.isBuffer(bytes)) return bytes;
    if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
    if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (Array.isArray(bytes)) return Buffer.from(bytes);
  }
  return null;
}

/** Very small, deterministic HTML → StructNode[] reader (no DOM). */
function htmlToStructure(html) {
  if (typeof html !== 'string' || !html) return [];
  const nodes = [];
  const tagRe = /<(h[1-6]|p|table|tr|li|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (!inner && tag !== 'table') continue;
    if (/^h[1-6]$/.test(tag)) nodes.push(makeStructNode({ type: 'heading', level: Number(tag[1]), text: inner }));
    else if (tag === 'table' || tag === 'tr') nodes.push(makeStructNode({ type: 'table', level: 0, text: inner }));
    else if (tag === 'li') nodes.push(makeStructNode({ type: 'list', level: 0, text: inner }));
    else nodes.push(makeStructNode({ type: 'paragraph', level: 0, text: inner }));
  }
  return nodes;
}

/**
 * @param {{ mammothPort?: object }} [opts]
 * @returns {object} a corpus EXTRACTOR adapter
 */
export function createDocxExtractor({ mammothPort } = {}) {
  return Object.freeze({
    id: DOCX_EXTRACTOR_ID,
    version: 'corpus-docx-extractor@1',
    kind: ADAPTER_KIND.EXTRACTOR,

    /**
     * @param {{ source: import('../contracts/corpus-source-contract.js').CorpusSource }} input
     */
    async run(input) {
      const source = input && input.source;
      const bytes = source && source.bytes;
      if (!bytes) {
        return extractionFailure(EXTRACTION_ERRORS.EXTRACTION_FAILED, 'docx-extractor: no bytes on the CorpusSource.', { method: EXTRACTION_METHOD.UNKNOWN });
      }
      const mammoth = mammothPort || await defaultMammothPort();
      if (!mammoth || typeof mammoth.extractRawText !== 'function') {
        return extractionFailure(EXTRACTION_ERRORS.PARSER_UNAVAILABLE, 'docx-extractor: mammoth is not available in this runtime.', { method: EXTRACTION_METHOD.UNKNOWN });
      }

      const buffer = toBuffer(bytes);
      const arrayBuffer = toArrayBuffer(bytes);
      const arg = buffer ? { buffer } : { arrayBuffer };

      let rawText = '';
      let html = '';
      try {
        const t = await mammoth.extractRawText(arg);
        rawText = t && typeof t.value === 'string' ? t.value : '';
      } catch (err) {
        return extractionFailure(EXTRACTION_ERRORS.MALFORMED_DOCUMENT, `docx-extractor: ${err && err.message ? err.message : String(err)}`, { method: EXTRACTION_METHOD.UNKNOWN });
      }
      if (typeof mammoth.convertToHtml === 'function') {
        try {
          const h = await mammoth.convertToHtml(arg);
          html = h && typeof h.value === 'string' ? h.value : '';
        } catch {
          html = ''; // structure is best-effort; text already succeeded
        }
      }

      const text = rawText.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
      if (!text) {
        return extractionFailure(EXTRACTION_ERRORS.NO_TEXT_LAYER, 'docx-extractor: the document produced no text.', { method: EXTRACTION_METHOD.UNKNOWN });
      }
      const structure = htmlToStructure(html);
      return extractionSuccess({
        method: EXTRACTION_METHOD.STRUCTURE_PARSE,
        pageCount: null,   // a .docx has no fixed pages — never fabricate one
        pages: [],
        text,
        structure,
        confidence: 0.9,
        meta: { extractor: DOCX_EXTRACTOR_ID, structureNodes: structure.length },
      });
    },
  });
}
