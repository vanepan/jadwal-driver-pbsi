/* ============================================================
   PDF-STRUCTURE-EXTRACTOR.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: a DEPENDENCY-FREE, deterministic PDF reader that extracts what
   can be established WITHOUT a full font/CMap/glyph engine:

     • page count            — /Type /Page objects and /Count
     • per-page geometry      — /MediaBox → width/height in pdf_points
     • producer / creator     — /Producer, /Creator (adapter metadata)
     • creation date (raw)    — /CreationDate (adapter METADATA, never a
                                document fact — §2, §7)
     • best-effort text layer — literal `(...)`/`<hex>` show operators in
                                content streams (works for pdfmake /
                                LibreOffice / wkhtmltopdf output; FAILS
                                HONESTLY for Skia/PDFium/scanned PDFs)

   §17 — a PDF whose text could not be read does NOT claim `text_layer`.
   It returns `ok: false` + `NO_TEXT_LAYER`, but still carries the page
   count and page geometry it DID establish, so the pipeline can record an
   honest `pageCount` and run geometry-only layout analysis. A real
   pdfjs-backed extractor can be injected later without any contract
   change.

   INFLATE PORT: FlateDecode streams are inflated via an injected
   `inflatePort(bytes) -> Uint8Array|null`. Default resolver = a dynamic
   `import('node:zlib')`. When neither is available, only uncompressed
   content is scanned — still correct, just less complete.

   RESPONSIBILITY: createPdfStructureExtractor({ inflatePort? }) -> a
   corpus EXTRACTOR adapter.

   NON-GOALS: no OCR, no glyph decoding, no rendering. No AI.
   ============================================================ */

'use strict';

import { ADAPTER_KIND } from '../contracts/corpus-adapter-contract.js';
import {
  EXTRACTION_ERRORS, EXTRACTION_METHOD, COORDINATE_SPACE,
  extractionSuccess, extractionFailure, makeExtractedPage,
} from '../contracts/extraction-result-contract.js';

export const PDF_STRUCTURE_EXTRACTOR_ID = 'pdf-structure';

let _cachedZlib;
async function defaultInflatePort(bytes) {
  if (_cachedZlib === undefined) {
    try { _cachedZlib = (await import('node:zlib')); } catch { _cachedZlib = null; }
  }
  if (!_cachedZlib) return null;
  try { return new Uint8Array(_cachedZlib.inflateSync(Buffer.from(bytes))); }
  catch {
    try { return new Uint8Array(_cachedZlib.inflateRawSync(Buffer.from(bytes))); }
    catch { return null; }
  }
}

function toLatin1(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes
    : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
      : ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : typeof bytes === 'string' ? null
          : Uint8Array.from(bytes || []);
  if (u8 == null) return String(bytes);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return s;
}

function decodePdfString(inner) {
  // resolve \n \r \t \( \) \\ and \ddd octal; drop line continuations
  return String(inner)
    .replace(/\\\r?\n/g, '')
    .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c]))
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8) & 0xff));
}

function decodeHexString(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  const even = clean.length % 2 ? `${clean}0` : clean;
  let out = '';
  for (let i = 0; i < even.length; i += 2) out += String.fromCharCode(parseInt(even.substr(i, 2), 16));
  // UTF-16BE BOM handling (common in modern PDF text)
  if (out.charCodeAt(0) === 0xfe && out.charCodeAt(1) === 0xff) {
    let u = '';
    for (let i = 2; i + 1 < out.length; i += 2) u += String.fromCharCode((out.charCodeAt(i) << 8) | out.charCodeAt(i + 1));
    return u;
  }
  return out;
}

/** Does an inflated stream plausibly carry a PDF TEXT-drawing program?
 *  (font set + text show operators inside BT/ET). Filters out font and
 *  image streams, whose bytes otherwise produce `(..)Tj`-shaped noise. */
function looksLikeContentStream(str) {
  return /\bBT\b/.test(str) && /\bTf\b/.test(str) && /\b(Tj|TJ)\b/.test(str);
}

/** Is `s` recognisably human text rather than decoded binary noise?
 *  §17 — we only claim a text layer when the bytes really are text. */
function looksLikeText(s) {
  if (!s || s.length < 24) return false;
  const total = s.length;
  let printable = 0;
  let letters = 0;
  for (let i = 0; i < total; i += 1) {
    const c = s.charCodeAt(i);
    const isPrintable = (c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a || c === 0x0d
      || (c >= 0xa0 && c <= 0x24f) || (c >= 0x2018 && c <= 0x201f);
    if (isPrintable) printable += 1;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x17f)) letters += 1;
  }
  const wordRuns = (s.match(/[A-Za-zÀ-ſ]{3,}/g) || []).length;
  return (printable / total) > 0.85 && (letters / total) > 0.4 && wordRuns >= 5;
}

/** Pull show-operator strings out of one content-stream chunk. */
function scanShownText(chunk) {
  const parts = [];
  // (literal) Tj|TJ|'|"
  const litRe = /\(((?:[^()\\]|\\.)*)\)\s*(Tj|TJ|'|")/g;
  let m;
  while ((m = litRe.exec(chunk)) !== null) parts.push(decodePdfString(m[1]));
  // [ (a) -10 (b) ] TJ
  const arrRe = /\[((?:[^\[\]])*)\]\s*TJ/g;
  while ((m = arrRe.exec(chunk)) !== null) {
    const seg = m[1].replace(/\(((?:[^()\\]|\\.)*)\)/g, (_, s) => decodePdfString(s)).replace(/-?\d+(\.\d+)?/g, '');
    if (seg.trim()) parts.push(seg);
  }
  // <hex> Tj
  const hexRe = /<([0-9a-fA-F\s]+)>\s*(Tj|TJ)/g;
  while ((m = hexRe.exec(chunk)) !== null) {
    const d = decodeHexString(m[1]);
    if (/[ -~ -￿]/.test(d) && !/[\x00-\x08\x0e-\x1f]/.test(d.replace(/[\r\n\t]/g, ''))) parts.push(d);
  }
  return parts.join(' ');
}

function parseMediaBoxes(s) {
  const boxes = [];
  const re = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const w = Math.abs(parseFloat(m[3]) - parseFloat(m[1]));
    const h = Math.abs(parseFloat(m[4]) - parseFloat(m[2]));
    if (w > 0 && h > 0) boxes.push({ w: Math.round(w), h: Math.round(h) });
  }
  return boxes;
}

function countPages(s) {
  const pageObjs = (s.match(/\/Type\s*\/Page(?![sA-Za-z])/g) || []).length;
  if (pageObjs > 0) return pageObjs;
  const counts = (s.match(/\/Count\s+(\d+)/g) || []).map((x) => parseInt(x.replace(/\D/g, ''), 10)).filter(Boolean);
  return counts.length ? Math.max(...counts) : null;
}

/**
 * @param {{ inflatePort?: (bytes: Uint8Array) => Promise<Uint8Array|null>|Uint8Array|null }} [opts]
 */
export function createPdfStructureExtractor({ inflatePort } = {}) {
  const inflate = inflatePort || defaultInflatePort;
  return Object.freeze({
    id: PDF_STRUCTURE_EXTRACTOR_ID,
    version: 'corpus-pdf-structure-extractor@1',
    kind: ADAPTER_KIND.EXTRACTOR,

    async run(input) {
      const source = input && input.source;
      const bytes = source && source.bytes;
      if (!bytes) {
        return extractionFailure(EXTRACTION_ERRORS.EXTRACTION_FAILED, 'pdf-structure-extractor: no bytes on the CorpusSource.', { method: EXTRACTION_METHOD.UNKNOWN });
      }
      const s = toLatin1(bytes);
      if (!s.startsWith('%PDF-')) {
        return extractionFailure(EXTRACTION_ERRORS.MALFORMED_DOCUMENT, 'pdf-structure-extractor: not a PDF (missing %PDF- header).', { method: EXTRACTION_METHOD.UNKNOWN });
      }

      const pageCount = countPages(s);
      const boxes = parseMediaBoxes(s);
      const producer = (s.match(/\/Producer\s*\(([^)]*)\)/) || [])[1] || (s.match(/\/Producer\s*<([0-9a-fA-F\s]+)>/) || [])[1] || null;
      const creator = (s.match(/\/Creator\s*\(([^)]*)\)/) || [])[1] || null;
      const creationDateRaw = (s.match(/\/CreationDate\s*\(([^)]*)\)/) || [])[1] || null;

      // ── best-effort text ──
      //  1. any UNCOMPRESSED content stream in the raw bytes (pdfmake /
      //     LibreOffice / hand-authored PDFs);
      //  2. each inflated FlateDecode stream that looks like a text-drawing
      //     program (BT/ET + Tf + Tj|TJ) — so font/image bytes cannot pose
      //     as text.
      //  Whatever comes out is then held to looksLikeText() — decoded
      //  binary noise is NOT a text layer (§17).
      let shown = looksLikeContentStream(s) ? scanShownText(s) : '';
      let inflatedCount = 0;
      let contentStreams = 0;
      const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let sm;
      while ((sm = streamRe.exec(s)) !== null && inflatedCount < 300) {
        if (!/FlateDecode/.test(s.slice(Math.max(0, sm.index - 400), sm.index))) continue;
        let inflated = null;
        try {
          const u8 = Uint8Array.from(sm[1], (c) => c.charCodeAt(0) & 0xff);
          inflated = await inflate(u8);
        } catch { inflated = null; }
        if (!inflated || !inflated.length) continue;
        inflatedCount += 1;
        const str = toLatin1(inflated);
        if (!looksLikeContentStream(str)) continue;
        contentStreams += 1;
        shown += ` ${scanShownText(str)}`;
      }
      let text = shown.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!looksLikeText(text)) text = '';   // §17 — decoded binary noise is NOT a text layer

      const pages = [];
      const nPages = pageCount || boxes.length || 0;
      for (let i = 0; i < nPages; i += 1) {
        const box = boxes[i] || boxes[0] || null;
        pages.push(makeExtractedPage({
          pageNumber: i + 1,
          text: '',            // per-page text attribution needs positioned glyphs we do not decode
          blocks: [],
          width: box ? box.w : null,
          height: box ? box.h : null,
          coordinateSpace: box ? COORDINATE_SPACE.PDF_POINTS : COORDINATE_SPACE.UNKNOWN,
        }));
      }

      const meta = { extractor: PDF_STRUCTURE_EXTRACTOR_ID, producer, creator, creationDateRaw, streamsInflated: inflatedCount, contentStreams, structureExtracted: pages.length > 0 };

      if (text.length >= 24) {
        return extractionSuccess({
          method: EXTRACTION_METHOD.TEXT_LAYER,
          pageCount: pageCount || (pages.length || null),
          pages,
          text,
          structure: [],
          confidence: 0.55,   // deterministic text-object scan — modest, no positional attribution
          meta,
        });
      }
      // geometry established, text not — HONEST partial: ok:false, method 'unknown',
      // but pageCount + geometry carried so the pipeline can still use them (§17).
      return extractionFailure(EXTRACTION_ERRORS.NO_TEXT_LAYER,
        `pdf-structure-extractor: no extractable text layer (producer: ${producer || 'unknown'}). Page geometry established for ${pages.length} page(s).`,
        { method: EXTRACTION_METHOD.UNKNOWN, pageCount: pageCount || (pages.length || null), pages, meta });
    },
  });
}
