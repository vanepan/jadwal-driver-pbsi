/* ============================================================
   intelligence-corpus-ingestion-check.mjs — Corpus Ingestion & Document
   Analysis (V2, Phase 5.x.2)

   PURE node test — no browser, no Firebase, no network, no model.
   Exercises the INGESTION half of the pipeline:

     • corpus-checksum   — SHA-256 of the ORIGINAL bytes, deterministic,
       stable across calls; identity is bytes, NOT filename, NOT text (§5)
     • detectFormat      — magic bytes win; MIME hint; filename last
     • docx-extractor    — real (Mammoth) text + structure; PARSER_UNAVAILABLE
       when the port is absent; honest failure on a malformed doc (§8)
     • pdf-structure-extractor — deterministic page count + /MediaBox
       geometry; best-effort text; a PDF with NO readable text →
       ok:false + NO_TEXT_LAYER, method 'unknown' (never a fabricated
       text layer — §17); coordinates always carry a coordinateSpace
     • classifiers       — documentType + typeConfidence (weak → UNKNOWN),
       documentEra + eraConfidence (never from "now"; unknown-era ⇒
       confidence < 1), sourceDate from CONTENT only — NEVER the filename
     • source immutability — no extractor returns / mutates the bytes

   Real PBSI fixtures under `Petty Cash Center/uploads/` are used when
   present; otherwise the checks run on synthetic in-memory fixtures and
   the real-file cases are skipped with a notice.

   Run:  node scripts/intelligence-corpus-ingestion-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeCorpusChecksum, normalizeChecksum, isChecksum } from '../src/intelligence/corpus/ingestion/corpus-checksum.js';
import {
  CORPUS_FORMAT, detectFormat, makeCorpusSource, isCorpusSource,
} from '../src/intelligence/corpus/ingestion/contracts/corpus-source-contract.js';
import {
  EXTRACTION_METHOD, isExtractionResult, isExtractedPage,
} from '../src/intelligence/corpus/ingestion/contracts/extraction-result-contract.js';
import { createDocxExtractor } from '../src/intelligence/corpus/ingestion/extractors/docx-extractor.js';
import { createPdfStructureExtractor } from '../src/intelligence/corpus/ingestion/extractors/pdf-structure-extractor.js';
import { defaultExtractorRegistry } from '../src/intelligence/corpus/ingestion/extractors/extractor-registry.js';
import { nullExtractor } from '../src/intelligence/corpus/ingestion/extractors/null-extractor.js';
import { classifyDocumentType } from '../src/intelligence/corpus/ingestion/classify/document-type-classifier.js';
import { classifyDocumentEra } from '../src/intelligence/corpus/ingestion/classify/document-era-classifier.js';
import { extractSourceDate } from '../src/intelligence/corpus/ingestion/classify/source-date-extractor.js';
import { CORPUS_DOCUMENT_TYPE, CORPUS_DOCUMENT_ERA, corpusDocumentIdFromChecksum } from '../src/intelligence/corpus/contracts/corpus-document-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);
const note = (m) => console.log(`  · ${m}`);

const UPLOADS = path.join(ROOT, 'Petty Cash Center', 'uploads');
const REAL = {
  norDocx: 'Nota Organisasi Sarpras 113 - Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana.docx',
  memoDocx: 'Memo Sarpras 362 - Realisasi Petty Cash Pertanggal 18 September 2025 Bidang Sarana dan Prasarana.docx',
  norPdf: 'Nota Organisasi Sarpras 113 - Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana.pdf',
  norPdf2: 'Nota Organisasi Sarpras 120 - Realisasi Petty Cash_260603_184903.pdf',
};
const realBytes = (name) => {
  const p = path.join(UPLOADS, name);
  return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null;
};

/* synthetic fixtures ---------------------------------------------------- */
const SYNTH_PDF_WITH_TEXT = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>endobj\n'
  + '4 0 obj<</Length 180>>\nstream\nBT /F1 12 Tf 72 780 Td (NOTA ORGANISASI) Tj 0 -20 Td '
  + '(Kepada Yth. Bendahara PBSI) Tj 0 -20 Td (Perihal: Realisasi Petty Cash Bidang Sarana dan Prasarana) Tj '
  + '0 -20 Td (Dengan hormat bersama ini kami sampaikan) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>',
);
const MALFORMED = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00]);

/* ════════════════════════════════════════════════════════════════════════ */

section('corpus-checksum — deterministic identity of the ORIGINAL bytes (§5)');
const b1 = new TextEncoder().encode('the original document bytes');
const h1 = await computeCorpusChecksum(b1);
const h1b = await computeCorpusChecksum(b1);
check(isChecksum(h1) && h1 === h1b, 'computeCorpusChecksum is deterministic (same bytes → same 64-hex digest)');
check(h1 !== await computeCorpusChecksum(new TextEncoder().encode('the original document byteS')),
  'one flipped byte → a different checksum');
check(await computeCorpusChecksum(b1) === await computeCorpusChecksum(b1.buffer)
  && await computeCorpusChecksum(b1) === await computeCorpusChecksum(Buffer.from(b1)),
  'Uint8Array / ArrayBuffer / Buffer of the same content hash identically');
check(await computeCorpusChecksum('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'string input is hashed as UTF-8 bytes → the known SHA-256 of "abc"');
check(corpusDocumentIdFromChecksum(h1) === `corpus_${h1}`, 'documentId is corpus_<checksum> — checksum-based, never filename-based (§5)');
check(normalizeChecksum(`  ${h1.toUpperCase()} `) === h1 && normalizeChecksum('not-a-hash') === '', 'normalizeChecksum lowercases/trims a real digest, rejects a non-digest');

section('detectFormat — magic bytes over MIME over filename (§6)');
check(detectFormat({ bytes: SYNTH_PDF_WITH_TEXT }) === CORPUS_FORMAT.PDF, 'a %PDF- header → pdf, regardless of filename');
check(detectFormat({ bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) === CORPUS_FORMAT.DOCX, 'a ZIP magic + wordprocessingml MIME → docx');
check(detectFormat({ mimeType: 'application/pdf' }) === CORPUS_FORMAT.PDF, 'no bytes, application/pdf MIME → pdf');
check(detectFormat({ originalFilename: 'x.docx' }) === CORPUS_FORMAT.DOCX, 'filename .docx is the last-resort hint');
check(detectFormat({ originalFilename: 'mystery.bin' }) === CORPUS_FORMAT.UNKNOWN, 'nothing decisive → unknown');
const src = makeCorpusSource({ checksum: h1, bytes: b1, originalFilename: 'x.pdf', mimeType: 'application/pdf' });
check(isCorpusSource(src) && src.format === CORPUS_FORMAT.PDF && Object.isFrozen(src), 'makeCorpusSource → a valid frozen CorpusSource with a resolved format');
check(isCorpusSource(makeCorpusSource({ checksum: 'short', bytes: b1 })) === false, 'a CorpusSource with a non-64-hex checksum is invalid');

section('docx-extractor — real text + structure; honest failure modes (§8)');
{
  const noPort = createDocxExtractor({ mammothPort: {} });
  const r = await noPort.run({ source: makeCorpusSource({ checksum: h1, bytes: b1, format: 'docx' }) });
  check(!r.ok && r.error.code === 'PARSER_UNAVAILABLE' && r.method === EXTRACTION_METHOD.UNKNOWN, 'no mammoth port → PARSER_UNAVAILABLE, method unknown (never throws)');
  const fakeMammoth = {
    extractRawText: async () => ({ value: 'NOTA ORGANISASI\nJakarta, 18 Mei 2026\nNo.113/Nota Organisasi/Sarpras/V/2026\nKepada Yth. : Bendahara\nDengan hormat,\nTerbilang: sembilan belas ribu rupiah\nDemikian disampaikan, atas perhatiannya terima kasih.' }),
    convertToHtml: async () => ({ value: '<h1>NOTA ORGANISASI</h1><p>Kepada Yth.</p><table><tr>x</tr></table>' }),
  };
  const fx = createDocxExtractor({ mammothPort: fakeMammoth });
  const fr = await fx.run({ source: makeCorpusSource({ checksum: h1, bytes: b1, format: 'docx' }) });
  check(fr.ok && isExtractionResult(fr) && fr.method === EXTRACTION_METHOD.STRUCTURE_PARSE, 'a working mammoth port → ok, method structure_parse, valid ExtractionResult');
  check(fr.pageCount === null && fr.pages.length === 0, 'a .docx has NO fixed pages — pageCount stays null, pages stays [] (never fabricated)');
  check(fr.structure.length >= 2 && fr.structure.some((n) => n.type === 'heading') && fr.structure.some((n) => n.type === 'table'), 'structure preserves headings + tables');
  check(fr.text.includes('NOTA ORGANISASI') && fr.text.includes('Kepada Yth.'), 'text is preserved verbatim');

  const realDocx = realBytes(REAL.norDocx);
  if (realDocx) {
    const rr = await defaultExtractorRegistry.forFormat('docx').run({ source: makeCorpusSource({ checksum: await computeCorpusChecksum(realDocx), bytes: realDocx, originalFilename: REAL.norDocx }) });
    check(rr.ok && rr.text.length > 500 && /NOTA ORGANISASI/i.test(rr.text), `real DOCX (${REAL.norDocx.slice(0, 30)}…) extracts ${rr.text.length} chars via the default registry`);
  } else { note('real DOCX fixture absent — skipped'); }
}

section('pdf-structure-extractor — deterministic geometry; NO fabricated text layer (§17)');
{
  const px = createPdfStructureExtractor();
  const withText = await px.run({ source: makeCorpusSource({ checksum: await computeCorpusChecksum(SYNTH_PDF_WITH_TEXT), bytes: SYNTH_PDF_WITH_TEXT, format: 'pdf' }) });
  check(withText.ok && withText.method === EXTRACTION_METHOD.TEXT_LAYER && /NOTA ORGANISASI/.test(withText.text), 'a PDF with a real uncompressed text layer → ok, method text_layer, readable text');
  check(withText.pageCount === 1 && withText.pages.every(isExtractedPage) && withText.pages[0].width === 595 && withText.pages[0].coordinateSpace === 'pdf_points', 'page count + /MediaBox geometry with an explicit coordinateSpace');

  const bad = await px.run({ source: makeCorpusSource({ checksum: await computeCorpusChecksum(MALFORMED), bytes: MALFORMED, format: 'pdf' }) });
  check(!bad.ok && bad.error.code === 'MALFORMED_DOCUMENT', 'bytes without a %PDF- header → MALFORMED_DOCUMENT, no crash');

  for (const name of [REAL.norPdf, REAL.norPdf2]) {
    const rb = realBytes(name);
    if (!rb) { note(`real PDF fixture ${name.slice(0, 24)}… absent — skipped`); continue; }
    const rr = await px.run({ source: makeCorpusSource({ checksum: await computeCorpusChecksum(rb), bytes: rb, originalFilename: name }) });
    check(!rr.ok && rr.error.code === 'NO_TEXT_LAYER' && rr.method === EXTRACTION_METHOD.UNKNOWN,
      `real PDF (${name.slice(0, 24)}…, ${rr.meta.producer || 'unknown renderer'}) has NO extractable text → ok:false, NO_TEXT_LAYER, method unknown (§17 — no fabricated text)`);
    check(rr.pageCount >= 1 && rr.pages.length === rr.pageCount && rr.pages.every((p) => p.width > 0 && p.coordinateSpace === 'pdf_points'),
      `…but page count (${rr.pageCount}) + per-page /MediaBox geometry ARE established deterministically`);
    check(isExtractionResult(rr), 'the honest partial is still a valid ExtractionResult');
  }
}

section('extractor registry — Null fallback for an unsupported format');
{
  const r = await defaultExtractorRegistry.forFormat('unknown').run({ source: makeCorpusSource({ checksum: h1, bytes: b1 }) });
  check(r === undefined ? false : (!r.ok && r.error.code === 'NOT_IMPLEMENTED'), 'an unknown format → the Null extractor, NOT_IMPLEMENTED (fail safe — §14)');
  check(nullExtractor.kind === 'extractor', 'the Null extractor is a valid adapter');
}

section('classifiers — evidence, not authority (§6, §7)');
{
  const norText = 'NOTA ORGANISASI\nJakarta, 18 Mei 2026\nNo.113/Nota Organisasi/Sarpras/V/2026\nKepada Yth. : 1. Wakil Ketua Umum III\nDari : Plt. Kabid Sarana dan Prasarana\nTembusan Yth. : Audit Internal\nPerihal : Realisasi Petty Cash Pertanggal 12 Mei 2026\nLampiran : 1 berkas\nDengan hormat,';
  const memoText = 'MEMORANDUM\nJakarta, 25 September 2025\nNo. 362/Memo/Sarpras/IX/2025\nKepada Yth. : Waketum III\nPerihal : Realisasi Petty Cash Pertanggal 18 September 2025\nDengan hormat,';
  const dtNor = classifyDocumentType({ text: norText, originalFilename: 'anything.docx' });
  check([CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, CORPUS_DOCUMENT_TYPE.NOR].includes(dtNor.documentType) && dtNor.typeConfidence >= 0.5,
    `a "NOTA ORGANISASI" doc → ${dtNor.documentType} (${dtNor.typeConfidence}), confidence-scored from named signals`);
  check(dtNor.typeSignals.length >= 2 && dtNor.typeSignals.every((s) => typeof s.name === 'string' && s.weight >= 0), 'classification is explained by a list of weighted signals, never an opaque number');
  const dtMemo = classifyDocumentType({ text: memoText, originalFilename: 'x.docx' });
  check(dtMemo.documentType === CORPUS_DOCUMENT_TYPE.MEMORANDUM, 'a "MEMORANDUM" doc → MEMORANDUM (historical distinction preserved — §17)');
  const dtWeak = classifyDocumentType({ text: 'Halaman kosong tanpa penanda apa pun.' });
  check(dtWeak.documentType === CORPUS_DOCUMENT_TYPE.UNKNOWN, 'weak / no evidence → UNKNOWN, never a guessed type');
  const dtFilenameOnly = classifyDocumentType({ text: 'x', originalFilename: 'Nota Organisasi Sarpras 999.docx' });
  check(dtFilenameOnly.documentType === CORPUS_DOCUMENT_TYPE.UNKNOWN, 'a filename token ALONE is not enough to classify (§6 — filename is a weak hint only)');
}

section('source date — from CONTENT only, NEVER the filename / upload time (§2, §7)');
{
  // dateline says 18 Mei 2026; a filename would say "12 Mei 2026"
  const sd = extractSourceDate('NOTA ORGANISASI\nJakarta, 18 Mei 2026\nNo.113/...\nPerihal: Realisasi Petty Cash Pertanggal 12 Mei 2026');
  check(sd.sourceDate === '2026-05-18' && /dateline/.test(sd.basis), 'the document DATELINE (18 Mei 2026) wins over the subject-period date (12 Mei 2026)');
  const none = extractSourceDate('Dokumen tanpa tanggal apa pun di dalam isinya.');
  check(none.sourceDate === null && none.confidence === 0, 'no date in the content → sourceDate null (never inferred)');
  const real = realBytes(REAL.norDocx);
  if (real) {
    const rr = await defaultExtractorRegistry.forFormat('docx').run({ source: makeCorpusSource({ checksum: await computeCorpusChecksum(real), bytes: real, originalFilename: REAL.norDocx }) });
    const rsd = extractSourceDate(rr.text);
    check(rsd.sourceDate && rsd.sourceDate.startsWith('2026-05-'), `real NOR DOCX sourceDate ${rsd.sourceDate} is from the dateline, not the filename "…12 Mei 2026…"`);
  } else { note('real DOCX fixture absent — sourceDate real-file check skipped'); }
}

section('era classifier — never "current" from "now"; unknown ⇒ confidence < 1 (§7)');
{
  const noCutover = classifyDocumentEra({ sourceDate: '2026-05-18', documentType: CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI, text: 'x' }, {});
  check(noCutover.documentEra === CORPUS_DOCUMENT_ERA.UNKNOWN && noCutover.eraConfidence < 1,
    'no operator-configured cutover + a bare NOR → era UNKNOWN, confidence < 1 (no chronology invented)');
  const beforeCut = classifyDocumentEra({ sourceDate: '2024-01-01', documentType: CORPUS_DOCUMENT_TYPE.MEMORANDUM, text: 'x' }, { eraCutoverDate: '2026-01-01' });
  check(beforeCut.documentEra === CORPUS_DOCUMENT_ERA.HISTORICAL, 'a document dated well before an EXPLICIT cutover → historical');
  const afterCut = classifyDocumentEra({ sourceDate: '2026-06-01', documentType: CORPUS_DOCUMENT_TYPE.NOR, text: 'x' }, { eraCutoverDate: '2026-01-01' });
  check(afterCut.documentEra === CORPUS_DOCUMENT_ERA.CURRENT, 'a document dated after an EXPLICIT cutover → current (from the DOCUMENT date vs a CONFIGURED date — not the clock)');
  const legacyMarker = classifyDocumentEra({ sourceDate: null, documentType: CORPUS_DOCUMENT_TYPE.LEGACY, text: 'MEMO ... Realisasi Petty Cash' }, {});
  check(legacyMarker.documentEra === CORPUS_DOCUMENT_ERA.HISTORICAL, 'a LEGACY/predecessor instrument → historical from a terminology marker (no date needed)');
  check(classifyDocumentEra({}, {}).eraSignals.every((s) => s.source !== 'filename'), 'no era signal is ever sourced from a filename');
}

section('source immutability — an extractor never returns / mutates the bytes (§4)');
{
  const bytes = SYNTH_PDF_WITH_TEXT.slice();
  const before = Array.from(bytes.slice(0, 16)).join(',');
  const r = await createPdfStructureExtractor().run({ source: makeCorpusSource({ checksum: await computeCorpusChecksum(bytes), bytes, format: 'pdf' }) });
  check(!('bytes' in r) && !('source' in r), 'the ExtractionResult carries NO bytes and NO source handle');
  check(Array.from(bytes.slice(0, 16)).join(',') === before, 'the original byte array is untouched after extraction');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
