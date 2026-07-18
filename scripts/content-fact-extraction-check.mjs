/* content-fact-extraction-check.mjs — Node check for the V2, Part A1
   (Intelligent Ingestion Hotfix) content-fact extractor
   (js/v2/knowledge/datasets/import-session/content-fact-extraction-engine.js
   + docx-text-extractor.js's underlying text). Proves the regex/keyword
   extraction is correct against REAL PBSI documents already in this repo
   (not synthetic fixtures — this project's own standing rule, see
   docs/SPRINT_9_8_PRODUCTION_READINESS.md: "grounded against real PBSI
   documents"), and that it degrades honestly (empty + confidence 0, never
   a guess) on text that doesn't match the known memo convention.
   Run: node scripts/content-fact-extraction-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import mammoth from 'mammoth';
import { extractContentFacts } from '../js/v2/knowledge/datasets/import-session/content-fact-extraction-engine.js';
import { CURRENT_CONTENT_PARSER_VERSION } from '../js/v2/knowledge/datasets/import-session/parser-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[real sample 1 — Memo Sarpras 362 (older "MEMORANDUM" convention)]');
{
  const buffer = fs.readFileSync('Petty Cash Center/uploads/Memo Sarpras 362 - Realisasi Petty Cash Pertanggal 18 September 2025 Bidang Sarana dan Prasarana.docx');
  const { value: text } = await mammoth.extractRawText({ buffer });
  const facts = extractContentFacts(text);
  check('documentNumber extracted exactly as printed', facts.documentNumber === '362/Memo/Sarpras/IX/2025');
  check('senderOrigin extracted exactly as printed', facts.senderOrigin === 'Kabid Sarana dan Prasarana');
  check('value (Perihal) extracted INCLUDING the line-wrapped continuation ("...dan Prasarana")', facts.value === 'Realisasi Petty Cash Pertanggal 18 September 2025 Bidang Sarana dan Prasarana');
  check('all three fields report confidence 1 (clean regex match)', Object.values(facts.confidencePerField).every((c) => c === 1));
  check('overallConfidence is 1 (3/3 fields found)', facts.overallConfidence === 1);
  check('every field has a non-empty basis string', Object.values(facts.basisPerField).every((b) => typeof b === 'string' && b.length > 0));
  check('parserVersion is stamped from the registry (single source of truth)', facts.parserVersion === CURRENT_CONTENT_PARSER_VERSION);
}

console.log('\n[real sample 2 — Nota Organisasi Sarpras 113 (newer "NOTA ORGANISASI" convention)]');
{
  const buffer = fs.readFileSync('Petty Cash Center/uploads/Nota Organisasi Sarpras 113 - Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana.docx');
  const { value: text } = await mammoth.extractRawText({ buffer });
  const facts = extractContentFacts(text);
  check('documentNumber extracted exactly as printed (no space after "No.")', facts.documentNumber === '113/Nota Organisasi/Sarpras/V/2026');
  check('senderOrigin extracted exactly as printed (incl. "Plt." prefix)', facts.senderOrigin === 'Plt. Kabid Sarana dan Prasarana');
  check('value (Perihal) extracted correctly (single-line, no wrap in this sample)', facts.value === 'Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana');
  check('overallConfidence is 1 (3/3 fields found)', facts.overallConfidence === 1);
}

console.log('\n[determinism]');
{
  const buffer = fs.readFileSync('Petty Cash Center/uploads/Memo Sarpras 362 - Realisasi Petty Cash Pertanggal 18 September 2025 Bidang Sarana dan Prasarana.docx');
  const { value: text } = await mammoth.extractRawText({ buffer });
  const a = extractContentFacts(text);
  const b = extractContentFacts(text);
  check('same input text -> identical result', JSON.stringify(a) === JSON.stringify(b));
}

console.log('\n[honest degradation — never guesses]');
{
  const noise = extractContentFacts('Ini adalah dokumen acak tanpa format memo apa pun. Tidak ada label yang dikenali di sini.');
  check('text with no recognizable labels -> every field empty', noise.documentNumber === '' && noise.senderOrigin === '' && noise.value === '');
  check('text with no recognizable labels -> every confidence is 0 (never fabricated)', Object.values(noise.confidencePerField).every((c) => c === 0));
  check('text with no recognizable labels -> overallConfidence is 0', noise.overallConfidence === 0);
  check('empty string input does not throw and reports all-empty', (() => { const r = extractContentFacts(''); return r.overallConfidence === 0 && r.documentNumber === ''; })());
}

console.log('\n[does not cross-match an unrelated "No." elsewhere in a document]');
{
  const decoy = extractContentFacts('Halaman ini membahas No. 5 alasan kenapa rapat penting.\nDari sinilah kita mulai.\nPerihal lain yang tidak relevan tanpa titik dua.');
  // "No. 5 alasan..." has no trailing /dddd, so must NOT match documentNumber.
  check('a "No. 5 ..." with no "/dddd" tail is correctly NOT extracted as a document number', decoy.documentNumber === '');
}

console.log('\n[continuation-line guard — does not swallow the NEXT field]');
{
  const noSwallow = extractContentFacts('Perihal\t:\tPengajuan sesuatu\n\nLampiran\t: 1 (satu) berkas');
  check('a continuation candidate that is itself a known label ("Lampiran:") is NOT appended to value', noSwallow.value === 'Pengajuan sesuatu');
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
