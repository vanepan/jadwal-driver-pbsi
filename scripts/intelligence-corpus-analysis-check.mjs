/* ============================================================
   intelligence-corpus-analysis-check.mjs — Corpus Ingestion & Document
   Analysis (V2, Phase 5.x.2)

   PURE node test — the ANALYSIS half: observers + layout + candidate
   grouping + the model-analyzer contract + the config.

     • structure-observer  — NOR/Memo anatomy → CorpusObservations, each
       'observed', each with provenance back to the source (§10, §16)
     • terminology-observer — recurring wording → observations;
       occurrenceCount is EVIDENCE, not authority; wording verbatim,
       normalizedValue null (§11, §12)
     • deterministic-layout-analyzer — page geometry → layout observations;
       NO geometry → NOTHING (no fabricated margins — §13, §16)
     • candidate-grouping  — cross-document frequency → 'candidate'
       (NEVER 'approved'; no approvedBy / rationale — §11, §21)
     • analysis-prompt-config — mapModelObservationToContract forces
       'observed' and strips any approval field a model might return (§15)
     • corpus-analysis-config — enabled default false; eraCutoverDate
       default null (no chronology assumed)

   Run:  node scripts/intelligence-corpus-analysis-check.mjs   (exit 0 = pass)
   ============================================================ */

import { observeStructure } from '../src/intelligence/corpus/analysis/structure-observer.js';
import { observeTerminology } from '../src/intelligence/corpus/analysis/terminology-observer.js';
import { analyzeLayoutDeterministically } from '../src/intelligence/corpus/analysis/visual/deterministic-layout-analyzer.js';
import { groupObservations, promoteGroupsToCandidates } from '../src/intelligence/corpus/analysis/candidate-grouping.js';
import {
  ANALYSIS_PROMPT_VERSION, ANALYSIS_SYSTEM_INSTRUCTIONS, ANALYSIS_OUTPUT_SCHEMA, mapModelObservationToContract,
} from '../src/intelligence/corpus/analysis/analysis-prompt-config.js';
import { nullPageRenderPort, PAGE_RENDER_ERRORS, isPageRenderPort } from '../src/intelligence/corpus/analysis/visual/page-render-port.js';
import { nullVisualAnalyzer, VISUAL_ANALYZER_ERRORS, isVisualAnalyzerPort } from '../src/intelligence/corpus/analysis/visual/visual-analyzer-port.js';
import {
  DEFAULT_CORPUS_ANALYSIS_CONFIG, getCorpusAnalysisConfig, setCorpusAnalysisConfig,
  resetCorpusAnalysisConfig, isCorpusAnalysisEnabled,
} from '../src/intelligence/corpus/corpus-analysis-config.js';
import { makeExtractionResult, makeExtractedPage, makeTextBlock } from '../src/intelligence/corpus/ingestion/contracts/extraction-result-contract.js';
import { isCorpusObservation } from '../src/intelligence/corpus/contracts/corpus-observation-contract.js';
import { OBSERVATION_LIFECYCLE } from '../src/intelligence/corpus/contracts/observation-lifecycle-contract.js';

let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

const AT = '2026-09-03T00:00:00.000Z';
const DOC_A = 'corpus_' + 'a'.repeat(64);
const DOC_B = 'corpus_' + 'b'.repeat(64);

const NOR_TEXT = [
  'NOTA ORGANISASI',
  'Jakarta, 18 Mei 2026',
  'No.113/Nota Organisasi/Sarpras/V/2026',
  'Kepada Yth. : 1. Wakil Ketua Umum III',
  'Dari : Plt. Kabid Sarana dan Prasarana',
  'Tembusan Yth. : 1. Ketua Umum sebagai laporan',
  'Perihal : Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana',
  'Lampiran : 1 (satu) berkas',
  'Dengan hormat,',
  'Sehubungan dengan kegiatan operasional bidang sarana dan prasarana, bersama ini kami sampaikan laporan.',
  'Terbilang: Sembilan Belas Ribu Rupiah',
  'Demikian kami sampaikan, atas perhatiannya diucapkan terima kasih.',
  'Plt. Kabid Sarana dan Prasarana',
].join('\n');

const docxExtraction = makeExtractionResult({
  ok: true, method: 'structure_parse', pageCount: null, pages: [], text: NOR_TEXT,
  structure: [{ type: 'heading', level: 1, text: 'NOTA ORGANISASI' }, { type: 'paragraph', text: 'Dengan hormat,' }],
  confidence: 0.9,
});

/* ════════════════════════════════════════════════════════════════════════ */

section('structure-observer — NOR/Memo anatomy → traceable observations (§10, §16)');
const structObs = observeStructure({ documentId: DOC_A, extraction: docxExtraction, sourceFileId: 'file:' + '0'.repeat(64), at: AT });
check(structObs.length >= 8 && structObs.every(isCorpusObservation), `${structObs.length} valid structure observations`);
check(structObs.every((o) => o.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED), 'every structure observation is lifecycleState "observed" — evidence, not a rule');
check(structObs.every((o) => o.provenance.length >= 1 && o.provenance[0].sourceDocumentId === DOC_A), 'every observation traces to the source document (§16)');
check(structObs.every((o) => o.provenance[0].sourceFileId === 'file:' + '0'.repeat(64)), 'the preserved-original sourceFileId is carried on provenance');
const keys = structObs.map((o) => o.key);
for (const k of ['document_title', 'dateline', 'reference_number', 'recipient_label', 'subject_label', 'attachment_label', 'copy_label', 'opening_salutation']) {
  check(keys.includes(k), `recognised structural element: ${k}`);
}
check(structObs.every((o) => o.normalizedValue === null), 'normalizedValue stays null (§12 — raw evidence recoverable)');

section('structure-observer — a PDF with only page geometry → geometry observations, nothing invented');
const pdfGeomExtraction = makeExtractionResult({
  ok: false, method: 'unknown', pageCount: 5, text: '',
  pages: [1, 2, 3, 4, 5].map((n) => makeExtractedPage({ pageNumber: n, width: 596, height: 842, coordinateSpace: 'pdf_points' })),
  error: { code: 'NO_TEXT_LAYER', message: 'no text' },
});
const pdfStruct = observeStructure({ documentId: DOC_B, extraction: pdfGeomExtraction, at: AT });
check(pdfStruct.some((o) => o.key === 'page_count' && o.observedValue === '5'), 'a page_count observation from real /Type/Page geometry');
check(!pdfStruct.some((o) => ['recipient_label', 'opening_salutation', 'closing_courtesy'].includes(o.key)), 'NO text-anatomy observations are emitted when there is no text (nothing fabricated — §17)');

section('terminology-observer — occurrenceCount is evidence, NOT authority (§11)');
const termObs = observeTerminology({ documentId: DOC_A, extraction: docxExtraction, at: AT });
check(termObs.length >= 5 && termObs.every(isCorpusObservation), `${termObs.length} valid terminology observations`);
check(termObs.every((o) => o.lifecycleState === OBSERVATION_LIFECYCLE.OBSERVED), 'every terminology observation is "observed" — a repeated phrase is STILL just an observation (§11)');
check(termObs.every((o) => o.approvedBy === null && o.approvedAt === null && o.preferenceRationale === null), 'no terminology observation carries an approval field');
check(termObs.every((o) => o.normalizedValue === null), 'observed wording is verbatim; normalizedValue null (§12)');
const kepada = termObs.find((o) => o.key === 'phrase_kepada_yth');
check(kepada && /Kepada Yth\.?/.test(kepada.observedValue), 'the exact wording "Kepada Yth." is captured verbatim');
const term = termObs.find((o) => o.category === 'organizational_term' && o.occurrenceCount >= 1);
check(term && Number.isInteger(term.occurrenceCount) && term.occurrenceCount >= 1, 'an organizational term records occurrenceCount (evidence weight) without changing its lifecycle');

section('deterministic-layout-analyzer — geometry → layout obs; no geometry → nothing (§13, §16)');
const layoutFromGeom = analyzeLayoutDeterministically({ documentId: DOC_B, extraction: pdfGeomExtraction, at: AT });
check(layoutFromGeom.length === 5 && layoutFromGeom.every((o) => o.category === 'layout' && o.modality === 'visual'), 'one page_geometry layout observation per page');
check(layoutFromGeom.every((o) => o.observation && o.observation.coordinateSpace === 'pdf_points' && o.observation.orientation === 'portrait' && o.observation.paper === 'A4'),
  'each carries width/height + coordinateSpace + orientation + nearest paper name — all from /MediaBox, none invented');
check(layoutFromGeom.every((o) => o.provenance[0].pageNumber >= 1 && o.provenance[0].extractionMethod === 'structure_parse'), 'provenance names the page and marks the method deterministic (not a visual model)');
const layoutFromDocx = analyzeLayoutDeterministically({ documentId: DOC_A, extraction: docxExtraction, at: AT });
check(layoutFromDocx.length === 0, 'a DOCX (no page geometry) → ZERO layout observations (no fabricated margins — §13)');
const withBlocks = analyzeLayoutDeterministically({
  documentId: DOC_B, at: AT,
  extraction: makeExtractionResult({ ok: true, method: 'text_layer', pageCount: 1, text: 'x', pages: [makeExtractedPage({
    pageNumber: 1, width: 595, height: 842, coordinateSpace: 'pdf_points',
    blocks: [makeTextBlock({ text: 'NOTA ORGANISASI', role: 'title', order: 0, region: { x: 72, y: 60, width: 200, height: 24, coordinateSpace: 'pdf_points' } })],
  })] }),
});
check(withBlocks.some((o) => o.key === 'content_bounds') && withBlocks.some((o) => o.key === 'block_title'),
  'when positioned blocks exist → content_bounds + per-block region observations, each with a real region + coordinateSpace');

section('candidate-grouping — cross-document frequency → "candidate", NEVER "approved" (§11, §21)');
const obsA = observeTerminology({ documentId: DOC_A, extraction: docxExtraction, at: AT });
const obsB = observeTerminology({ documentId: DOC_B, extraction: makeExtractionResult({ ok: true, method: 'structure_parse', text: NOR_TEXT.replace('No.113', 'No.120'), pageCount: null }), at: AT });
const DOC_C = 'corpus_' + 'c'.repeat(64);
const obsC = observeTerminology({ documentId: DOC_C, extraction: makeExtractionResult({ ok: true, method: 'structure_parse', text: NOR_TEXT.replace('No.113', 'No.121'), pageCount: null }), at: AT });
const groups = groupObservations([...obsA, ...obsB, ...obsC]);
check(groups.length >= 1 && groups.some((g) => g.documentIds.length === 3), 'a phrase seen in 3 distinct documents forms one group with 3 documentIds');
const cands = promoteGroupsToCandidates(groups, { minDocuments: 3, at: AT });
check(cands.length >= 1 && cands.every(isCorpusObservation), `${cands.length} candidate observation(s) emitted`);
check(cands.every((o) => o.lifecycleState === OBSERVATION_LIFECYCLE.CANDIDATE), 'every emitted observation is "candidate" — a proposal, NOT authoritative');
check(cands.every((o) => o.approvedBy === null && o.approvedAt === null && o.preferenceRationale === null), 'a candidate carries NO approvedBy / approvedAt / preferenceRationale (§21)');
check(cands.every((o) => o.provenance.length >= 3), 'a candidate merges provenance from every corroborating document (§16)');
check(cands.every((o) => o.observation && Array.isArray(o.observation.corroboratingDocumentIds) && o.observation.documentCount === 3), 'a candidate records which documents corroborate it');
const fewer = promoteGroupsToCandidates(groups, { minDocuments: 5, at: AT });
check(fewer.length === 0, 'raising minDocuments above the evidence count → NO candidates (a single anomaly never wins — §11)');
check(!cands.some((o) => o.lifecycleState === 'approved'), 'candidate-grouping can NEVER produce "approved" — there is no such code path (§21)');

section('analysis-prompt-config — a model NEVER produces anything but "observed" (§15)');
check(ANALYSIS_PROMPT_VERSION === 'corpus-analysis-prompt@1' && /never invent/i.test(ANALYSIS_SYSTEM_INSTRUCTIONS) && /never output an "approved"/i.test(ANALYSIS_SYSTEM_INSTRUCTIONS),
  'the versioned prompt forbids invention + policy judgements + approval');
check(ANALYSIS_OUTPUT_SCHEMA.properties.observations.items.required.includes('confidence') && ANALYSIS_OUTPUT_SCHEMA.properties.observations.items.required.includes('evidence'),
  'the model output schema requires confidence + evidence per observation');
const mapped = mapModelObservationToContract(
  { category: 'layout', modality: 'visual', key: 'signature_block', observedValue: 'bottom-right', pageNumber: 1,
    region: { x: 360, y: 40, width: 180, height: 90 }, coordinateSpace: 'pdf_points', confidence: 0.6, evidence: 'a stamped block at lower right',
    lifecycleState: 'approved', approvedBy: 'model', preferenceRationale: 'the model tried to approve itself' },
  { documentId: DOC_A, sourceFileId: null, at: AT },
);
check(mapped && isCorpusObservation(mapped) && mapped.lifecycleState === 'observed', 'a model-returned observation maps to a valid CorpusObservation, lifecycleState "observed" (the injected "approved" is IGNORED)');
check(mapped.approvedBy === null && mapped.preferenceRationale === null, 'the injected approvedBy / preferenceRationale are stripped');
check(mapped.provenance[0].extractionMethod === 'visual_analysis' && mapped.provenance[0].region && mapped.provenance[0].region.coordinateSpace === 'pdf_points', 'the mapped observation keeps a real region + coordinateSpace + method visual_analysis');
check(mapModelObservationToContract({ category: 'not_a_category', key: 'x' }, { documentId: DOC_A }) === null, 'an unknown category from a model → null (rejected, not coerced)');

section('visual boundary ports — inert by default (§14)');
check(isPageRenderPort(nullPageRenderPort) && isVisualAnalyzerPort(nullVisualAnalyzer), 'the null ports satisfy their contracts');
check((await nullPageRenderPort.renderPages({})).error.code === PAGE_RENDER_ERRORS.RENDER_UNAVAILABLE, 'nullPageRenderPort → RENDER_UNAVAILABLE (fail safe)');
check((await nullVisualAnalyzer.analyzePage({})).error.code === VISUAL_ANALYZER_ERRORS.ANALYZER_UNAVAILABLE, 'nullVisualAnalyzer → ANALYZER_UNAVAILABLE (fail safe)');

section('corpus-analysis-config — inert default, no assumed chronology');
resetCorpusAnalysisConfig();
check(DEFAULT_CORPUS_ANALYSIS_CONFIG.enabled === false && getCorpusAnalysisConfig().enabled === false, 'enabled defaults to false');
check(DEFAULT_CORPUS_ANALYSIS_CONFIG.eraCutoverDate === null, 'eraCutoverDate defaults to null — NO chronology is assumed (§7)');
check(DEFAULT_CORPUS_ANALYSIS_CONFIG.stages.pageRender === false && DEFAULT_CORPUS_ANALYSIS_CONFIG.stages.visualAnalysis === false, 'pageRender + visualAnalysis stages default OFF (need real adapters — §13, §14)');
check(isCorpusAnalysisEnabled(false, { enabled: true }) === false, 'isCorpusAnalysisEnabled ANDs the Intelligence master flag — flag OFF ⇒ pipeline inert');
setCorpusAnalysisConfig({ eraCutoverDate: 'not-a-date' });
check(getCorpusAnalysisConfig().eraCutoverDate === null, 'a malformed eraCutoverDate is ignored (never silently sets a chronology)');
setCorpusAnalysisConfig({ eraCutoverDate: '2026-01-01', candidateMinDocuments: 4 });
check(getCorpusAnalysisConfig().eraCutoverDate === '2026-01-01' && getCorpusAnalysisConfig().candidateMinDocuments === 4, 'valid overrides apply');
resetCorpusAnalysisConfig();

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
