/* ============================================================
   intelligence-corpus-pipeline-check.mjs — Corpus Ingestion & Document
   Analysis (V2, Phase 5.x.2)

   PURE node test for the ORCHESTRATOR (runAnalysisPipeline). No browser,
   no Firebase, no network, no model.

   Proves:
     • HONEST analysisStatus (§17) — a DOCX reaches 'completed' via
       structure_extracted and NEVER a fabricated 'visual_analyzed'; a PDF
       with no readable text reaches 'visual_analyzed'/'structure_extracted'
       via page geometry and NEVER 'text_extracted'; a document that
       cannot be extracted at all → 'failed'
     • statusPath is a chain of INDIVIDUALLY-LEGAL analysis-status moves
       from 'pending' (a caller applies them one at a time)
     • every emitted observation is lifecycleState 'observed' — the
       pipeline has NO path to 'candidate' or 'approved' (§11, §21)
     • FAILURE ISOLATION (§19) — a stage failure is recorded; later stages
       still run; the pipeline holds no shared state (two docs in a row
       do not interfere)
     • IDEMPOTENCY (§18) — re-running against the same source yields the
       SAME observation ids
     • config toggles genuinely SKIP a stage (not silently run it)
     • the pipeline NEVER persists, promotes, or calls a model

   Uses the real `Petty Cash Center/uploads/` fixtures when present.

   Run:  node scripts/intelligence-corpus-pipeline-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAnalysisPipeline } from '../src/intelligence/corpus/pipeline/analysis-pipeline.js';
import { isPipelineResult, PIPELINE_STAGE, STAGE_OUTCOME, computeStatusPath } from '../src/intelligence/corpus/pipeline/pipeline-contract.js';
import { makeCorpusSource } from '../src/intelligence/corpus/ingestion/contracts/corpus-source-contract.js';
import { computeCorpusChecksum } from '../src/intelligence/corpus/ingestion/corpus-checksum.js';
import { makeCorpusDocument, canAnalysisTransition, CORPUS_ANALYSIS_STATUS } from '../src/intelligence/corpus/contracts/corpus-document-contract.js';
import { isCorpusObservation } from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);
const note = (m) => console.log(`  · ${m}`);

const AT = '2026-09-03T00:00:00.000Z';
const UPLOADS = path.join(ROOT, 'Petty Cash Center', 'uploads');
const realBytes = (name) => (fs.existsSync(path.join(UPLOADS, name)) ? new Uint8Array(fs.readFileSync(path.join(UPLOADS, name))) : null);

async function pipelineFor(bytes, filename, config = {}) {
  const checksum = await computeCorpusChecksum(bytes);
  const source = makeCorpusSource({ checksum, bytes, originalFilename: filename });
  const document = makeCorpusDocument({ checksum, documentId: `corpus_${checksum}`, ownerId: 'evan', createdAt: AT });
  return runAnalysisPipeline({ source, document, config, at: AT });
}

function legalChain(statusPath) {
  let cur = CORPUS_ANALYSIS_STATUS.PENDING;
  for (const s of statusPath) { if (!canAnalysisTransition(cur, s)) return false; cur = s; }
  return true;
}

/* synthetic fixtures -------------------------------------------------- */
const SYNTH_PDF_TEXT = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>endobj\n'
  + '4 0 obj<</Length 210>>\nstream\nBT /F1 12 Tf 72 780 Td (NOTA ORGANISASI) Tj 0 -18 Td (Jakarta, 18 Mei 2026) Tj '
  + '0 -18 Td (No.113/Nota Organisasi/Sarpras/V/2026) Tj 0 -18 Td (Kepada Yth. Bendahara) Tj '
  + '0 -18 Td (Perihal: Realisasi Petty Cash Bidang Sarana dan Prasarana) Tj 0 -18 Td (Dengan hormat bersama ini kami sampaikan) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>',
);
const GARBAGE = new Uint8Array(64).map((_, i) => (i * 37) % 256);
const fakeDocxMammoth = {
  extractRawText: async () => ({ value: 'MEMORANDUM\nJakarta, 25 September 2025\nNo. 362/Memo/Sarpras/IX/2025\nKepada Yth. : Waketum III\nPerihal : Realisasi Petty Cash\nLampiran : 1 berkas\nDengan hormat,\nDemikian disampaikan, atas perhatiannya terima kasih.' }),
  convertToHtml: async () => ({ value: '<h1>MEMORANDUM</h1><p>Kepada Yth.</p>' }),
};

/* ════════════════════════════════════════════════════════════════════════ */

section('DOCX → completed via structure_extracted, NEVER a fabricated visual_analyzed (§17)');
{
  const realDocx = realBytes('Nota Organisasi Sarpras 113 - Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana.docx');
  const r = realDocx
    ? await pipelineFor(realDocx, 'NOR-113.docx', { eraCutoverDate: '2026-01-01' })
    : await runAnalysisPipeline({
      source: makeCorpusSource({ checksum: '0'.repeat(64), bytes: new Uint8Array([0x50, 0x4b, 3, 4]), format: 'docx', originalFilename: 'x.docx' }),
      document: makeCorpusDocument({ checksum: '0'.repeat(64), documentId: 'corpus_' + '0'.repeat(64), ownerId: 'evan', createdAt: AT }),
      ports: { extractorRegistry: { forSource: () => ({ id: 'fake', kind: 'extractor', run: async () => (await import('../src/intelligence/corpus/ingestion/extractors/docx-extractor.js')).createDocxExtractor({ mammothPort: fakeDocxMammoth }).run({ source: { bytes: new Uint8Array([1]) } }) }) } },
      config: { eraCutoverDate: '2026-01-01' }, at: AT,
    });
  if (!realDocx) note('real DOCX fixture absent — using a fake mammoth port');
  check(isPipelineResult(r) && r.ok, 'pipeline result is valid + ok');
  check(r.analysisStatus === CORPUS_ANALYSIS_STATUS.COMPLETED, `analysisStatus is "completed" (got "${r.analysisStatus}")`);
  const visualStage = r.stages.find((s) => s.stage === PIPELINE_STAGE.VISUAL_ANALYSIS);
  check(visualStage && visualStage.outcome === STAGE_OUTCOME.SKIPPED, 'the visual_analysis stage is SKIPPED for a DOCX (nothing visual to analyse — §17)');
  check(!r.statusPath.includes(CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED), 'statusPath does NOT pass through visual_analyzed');
  check(JSON.stringify(r.statusPath) === JSON.stringify([CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED, CORPUS_ANALYSIS_STATUS.COMPLETED]), `statusPath is [structure_extracted, completed] (got ${JSON.stringify(r.statusPath)})`);
  check(legalChain(r.statusPath), 'every statusPath step is an individually-legal analysis-status move from pending');
  check(r.observations.length >= 8 && r.observations.every(isCorpusObservation) && r.observations.every((o) => o.lifecycleState === 'observed'), `${r.observations.length} observations, all valid, all "observed"`);
  check(['NOTA_ORGANISASI', 'NOR', 'MEMORANDUM'].includes(r.classification.documentType) && typeof r.classification.typeConfidence === 'number', `classification ran (type ${r.classification.documentType})`);
  check(typeof r.classification.sourceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.classification.sourceDate), `sourceDate ${r.classification.sourceDate} extracted from content`);
}

section('PDF with NO readable text → geometry-only, NEVER "text_extracted" (§17)');
{
  const realPdf = realBytes('Nota Organisasi Sarpras 120 - Realisasi Petty Cash_260603_184903.pdf');
  if (!realPdf) { note('real PDF fixture absent — skipping the no-text-layer case'); }
  else {
    const r = await pipelineFor(realPdf, 'NOR-120.pdf');
    check(r.ok && isPipelineResult(r), 'pipeline result is valid + ok (a degraded analysis is still a result)');
    const textStage = r.stages.find((s) => s.stage === PIPELINE_STAGE.TEXT_EXTRACTION);
    check(textStage.outcome === STAGE_OUTCOME.FAILED && textStage.error.code === 'NO_TEXT_LAYER', 'text_extraction stage FAILED with NO_TEXT_LAYER (honest)');
    check(r.analysisStatus !== CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED && r.analysisStatus !== CORPUS_ANALYSIS_STATUS.COMPLETED,
      `analysisStatus is "${r.analysisStatus}" — NOT text_extracted, NOT completed (text genuinely failed — §17)`);
    check([CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED, CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED].includes(r.analysisStatus), 'it DID reach structure_extracted / visual_analyzed via page geometry');
    check(legalChain(r.statusPath) && r.statusPath.length >= 1, 'statusPath is a legal chain');
    check(r.classification.pageCount >= 1 && r.classification.documentType === undefined, 'pageCount established; documentType NOT set (classification skipped — no text)');
    check(r.observations.length >= 1 && r.observations.every((o) => o.lifecycleState === 'observed'), 'geometry observations emitted, all "observed"');
    check(r.observations.some((o) => o.category === 'layout' && o.key === 'page_geometry'), 'a deterministic page_geometry layout observation is present');
  }
  // synthetic PDF WITH text → text_extracted ladder
  const rt = await pipelineFor(SYNTH_PDF_TEXT, 'synth.pdf', { eraCutoverDate: '2026-01-01' });
  check(rt.ok && rt.stages.find((s) => s.stage === PIPELINE_STAGE.TEXT_EXTRACTION).outcome === STAGE_OUTCOME.RAN, 'a synthetic PDF WITH a text layer → text_extraction RAN');
  check(rt.analysisStatus === CORPUS_ANALYSIS_STATUS.COMPLETED && rt.statusPath[0] !== CORPUS_ANALYSIS_STATUS.PENDING, `…and reaches "completed" (path ${JSON.stringify(rt.statusPath)})`);
  check(['NOTA_ORGANISASI', 'NOR'].includes(rt.classification.documentType), `…and classifies (${rt.classification.documentType})`);
}

section('a totally unextractable document → analysisStatus "failed" (§17, §19)');
{
  const r = await pipelineFor(GARBAGE, 'garbage.pdf');
  check(r.ok === false && r.analysisStatus === CORPUS_ANALYSIS_STATUS.FAILED, 'ok:false, analysisStatus "failed"');
  check(JSON.stringify(r.statusPath) === JSON.stringify([CORPUS_ANALYSIS_STATUS.FAILED]), 'statusPath is ["failed"]');
  check(r.observations.length === 0, 'no observations from an unanalysable document');
  check(r.error && typeof r.error.code === 'string', 'a typed error is reported');
  check(isPipelineResult(r), 'the failure is still a valid PipelineResult (no throw)');
}

section('failure isolation — one bad document does not affect the next (§19)');
{
  const bad = await pipelineFor(GARBAGE, 'a.pdf');
  const good = await pipelineFor(SYNTH_PDF_TEXT, 'b.pdf', { eraCutoverDate: '2026-01-01' });
  check(bad.analysisStatus === 'failed' && good.analysisStatus === 'completed', 'the bad document failed; the good one that ran right after still completed');
  check(good.observations.length > 0 && bad.observations.length === 0, 'the good result is unaffected by the prior failure (no shared state)');
}

section('idempotency — re-running the same source yields the SAME observation ids (§18)');
{
  const r1 = await pipelineFor(SYNTH_PDF_TEXT, 'x.pdf', { eraCutoverDate: '2026-01-01' });
  const r2 = await pipelineFor(SYNTH_PDF_TEXT, 'x.pdf', { eraCutoverDate: '2026-01-01' });
  const ids1 = r1.observations.map((o) => o.observationId).sort().join('|');
  const ids2 = r2.observations.map((o) => o.observationId).sort().join('|');
  check(ids1 === ids2 && ids1.length > 0, 'observation ids are deterministic across runs');
  check(new Set(r1.observations.map((o) => o.observationId)).size === r1.observations.length, 'no duplicate observation ids within one run');
  check(JSON.stringify(r1.classification) === JSON.stringify(r2.classification), 'classification is deterministic across runs');
}

section('config toggles genuinely SKIP a stage');
{
  const r = await pipelineFor(SYNTH_PDF_TEXT, 'x.pdf', { stages: { classification: false, observations: false } });
  const cls = r.stages.find((s) => s.stage === PIPELINE_STAGE.CLASSIFICATION);
  const obs = r.stages.find((s) => s.stage === PIPELINE_STAGE.OBSERVATIONS);
  check(cls.outcome === STAGE_OUTCOME.SKIPPED && obs.outcome === STAGE_OUTCOME.SKIPPED, 'classification + observations stages SKIPPED when toggled off');
  check(r.observations.length === 0 && r.classification.documentType === undefined, '…and nothing from those stages appears in the result');
  check(r.analysisStatus !== CORPUS_ANALYSIS_STATUS.COMPLETED, 'without the observations stage the doc does NOT reach "completed" (§17 — not rolled to completed on partial work)');
}

section('the pipeline never persists / promotes / calls a model');
{
  const r = await pipelineFor(SYNTH_PDF_TEXT, 'x.pdf');
  check(!('write' in r) && !('persisted' in r), 'the PipelineResult is pure data — no persistence handle');
  check(r.observations.every((o) => o.lifecycleState === 'observed') && !r.observations.some((o) => ['candidate', 'approved'].includes(o.lifecycleState)),
    'NOT ONE observation is "candidate" or "approved" — the pipeline has no promotion path (§11, §21)');
  check(r.promptVersion === 'corpus-analysis-prompt@1', 'the result is stamped with the analysis prompt version (audit)');
  // computeStatusPath is a pure helper
  check(JSON.stringify(computeStatusPath('structure_extracted', 'completed', canAnalysisTransition)) === JSON.stringify(['structure_extracted', 'completed']), 'computeStatusPath(structure_extracted, completed) → the legal 2-step chain');
  check(JSON.stringify(computeStatusPath('pending', 'failed', canAnalysisTransition)) === JSON.stringify(['failed']), 'computeStatusPath(*, failed) → ["failed"]');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
