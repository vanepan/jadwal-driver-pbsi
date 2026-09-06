/* ============================================================
   ANALYSIS-PIPELINE.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: the ONE orchestrator that runs a corpus document through the
   ordered analysis stages and returns a PipelineResult (DATA ONLY — it
   NEVER persists, never promotes, never calls a model directly; §19,
   §21, §22).

       CorpusSource + CorpusDocument
         → text_extraction        (extractor adapter)
         → structure_extraction   (DOCX tree / PDF page geometry)
         → page_render            (Null unless a renderer is injected)
         → visual_analysis        (deterministic layout always; model
                                   analyzer only if configured + rendered)
         → classification         (type + era + sourceDate, CONTENT only)
         → observations           (structure + terminology + layout,
                                   every one lifecycleState 'observed')
         → PipelineResult { classification, observations[], analysisStatus,
                            statusPath[], stages[] }

   HONEST STATUS (§17): analysisStatus is the furthest rung actually
   reached. A DOCX (no pages to render) → 'completed' via
   structure_extracted, NEVER via a fabricated 'visual_analyzed'. A PDF
   with no readable text → 'visual_analyzed'/'structure_extracted' via
   page geometry, NEVER 'text_extracted'. A document that could not be
   extracted at all → 'failed'.

   FAILURE ISOLATION (§19): a stage failure is recorded and the pipeline
   continues with whatever earlier stages produced. One bad document can
   never corrupt another — this function holds no shared state.

   IDEMPOTENCY (§18): every observation id is deterministic
   (observationIdFrom). Re-running against the same source yields the same
   ids; the caller merges via mergeObservationOccurrence.

   DEPENDENCIES: the ingestion + analysis modules (all pure) + the
   pipeline contract. NO Firebase, NO network, NO model call.
   ============================================================ */

'use strict';

import { CORPUS_ANALYSIS_STATUS, canAnalysisTransition } from '../contracts/corpus-document-contract.js';
import { EXTRACTION_METHOD } from '../contracts/corpus-provenance-contract.js';
import { isCorpusObservation, makeCorpusObservation } from '../contracts/corpus-observation-contract.js';
import { OBSERVATION_LIFECYCLE } from '../contracts/observation-lifecycle-contract.js';
import {
  PIPELINE_STAGE, STAGE_OUTCOME, makeStageResult, makePipelineResult, computeStatusPath,
} from './pipeline-contract.js';
import { defaultExtractorRegistry } from '../ingestion/extractors/extractor-registry.js';
import { classifyDocumentType } from '../ingestion/classify/document-type-classifier.js';
import { classifyDocumentEra } from '../ingestion/classify/document-era-classifier.js';
import { extractSourceDate } from '../ingestion/classify/source-date-extractor.js';
import { observeStructure } from '../analysis/structure-observer.js';
import { observeTerminology } from '../analysis/terminology-observer.js';
import { analyzeLayoutDeterministically } from '../analysis/visual/deterministic-layout-analyzer.js';
import { nullPageRenderPort } from '../analysis/visual/page-render-port.js';
import { nullVisualAnalyzer } from '../analysis/visual/visual-analyzer-port.js';
import { mapModelObservationToContract, ANALYSIS_PROMPT_VERSION } from '../analysis/analysis-prompt-config.js';
import { DEFAULT_CORPUS_ANALYSIS_CONFIG } from '../corpus-analysis-config.js';

function dedupeById(observations) {
  const seen = new Map();
  for (const o of observations) {
    if (!isCorpusObservation(o)) continue;
    if (!seen.has(o.observationId)) seen.set(o.observationId, o);
  }
  return [...seen.values()];
}

/**
 * @param {Object} args
 * @param {import('../ingestion/contracts/corpus-source-contract.js').CorpusSource} args.source
 * @param {import('../contracts/corpus-document-contract.js').CorpusDocument} args.document
 * @param {{ extractorRegistry?, pageRenderPort?, visualAnalyzer? }} [args.ports]
 * @param {object} [args.config]  a corpus-analysis-config shape
 * @param {string} [args.at]
 * @returns {Promise<import('./pipeline-contract.js').PipelineResult>}
 */
export async function runAnalysisPipeline({ source, document, ports = {}, config, at } = {}) {
  const when = at || new Date().toISOString();
  const cfg = { ...DEFAULT_CORPUS_ANALYSIS_CONFIG, ...(config || {}), stages: { ...DEFAULT_CORPUS_ANALYSIS_CONFIG.stages, ...((config && config.stages) || {}) } };
  const documentId = (document && document.documentId) || (source && source.checksum ? `corpus_${source.checksum}` : '');
  const sourceFileId = (document && document.sourceFileId) || null;
  const extractorRegistry = ports.extractorRegistry || defaultExtractorRegistry;
  const pageRenderPort = ports.pageRenderPort || nullPageRenderPort;
  const visualAnalyzer = ports.visualAnalyzer || nullVisualAnalyzer;

  const stages = [];
  const observations = [];
  const classification = {};
  let extraction = null;
  let anyFailure = false;

  if (!source || !documentId) {
    return makePipelineResult({
      ok: false, documentId, analysisStatus: CORPUS_ANALYSIS_STATUS.FAILED,
      statusPath: [CORPUS_ANALYSIS_STATUS.FAILED],
      stages: [makeStageResult({ stage: PIPELINE_STAGE.TEXT_EXTRACTION, outcome: STAGE_OUTCOME.FAILED, error: { code: 'INVALID_INPUT', message: 'a CorpusSource and a documentId are required.' } })],
      error: { code: 'INVALID_INPUT', message: 'a CorpusSource and a documentId are required.' },
      promptVersion: ANALYSIS_PROMPT_VERSION,
    });
  }

  /* ── 1. text_extraction ─────────────────────────────────────────── */
  if (cfg.stages.textExtraction === false) {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.TEXT_EXTRACTION, outcome: STAGE_OUTCOME.SKIPPED, detail: 'disabled by config' }));
  } else {
    try {
      const extractor = extractorRegistry.forSource(source);
      extraction = await extractor.run({ source });
      const hasText = !!extraction && typeof extraction.text === 'string' && extraction.text.trim().length >= 12
        && extraction.method !== EXTRACTION_METHOD.UNKNOWN;
      if (extraction && extraction.ok && hasText) {
        stages.push(makeStageResult({ stage: PIPELINE_STAGE.TEXT_EXTRACTION, outcome: STAGE_OUTCOME.RAN, method: extraction.method, detail: { chars: extraction.text.length, pageCount: extraction.pageCount } }));
      } else {
        anyFailure = true;
        stages.push(makeStageResult({
          stage: PIPELINE_STAGE.TEXT_EXTRACTION, outcome: STAGE_OUTCOME.FAILED, method: (extraction && extraction.method) || EXTRACTION_METHOD.UNKNOWN,
          detail: { pageCountEstablished: (extraction && extraction.pageCount) || null },
          error: (extraction && extraction.error) || { code: 'NO_TEXT_LAYER', message: 'no extractable text layer' },
        }));
      }
    } catch (err) {
      anyFailure = true;
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.TEXT_EXTRACTION, outcome: STAGE_OUTCOME.FAILED, error: { code: 'EXTRACTION_THREW', message: err && err.message ? err.message : String(err) } }));
    }
  }

  const hasUsableText = !!extraction && typeof extraction.text === 'string' && extraction.text.trim().length >= 12 && extraction.method !== EXTRACTION_METHOD.UNKNOWN;
  const hasStructureNodes = !!extraction && Array.isArray(extraction.structure) && extraction.structure.length > 0;
  const hasPageGeometry = !!extraction && Array.isArray(extraction.pages) && extraction.pages.some((p) => p && p.width > 0 && p.height > 0);
  const pageCount = extraction && Number.isInteger(extraction.pageCount) && extraction.pageCount >= 1 ? extraction.pageCount : null;
  if (pageCount != null) classification.pageCount = pageCount;

  if (!hasUsableText && !hasStructureNodes && !hasPageGeometry) {
    // nothing at all could be established — the document cannot be analysed
    return makePipelineResult({
      ok: false, documentId, classification,
      observations: [], analysisStatus: CORPUS_ANALYSIS_STATUS.FAILED, statusPath: [CORPUS_ANALYSIS_STATUS.FAILED],
      stages, error: { code: 'UNANALYSABLE', message: 'no text, no structure, and no page geometry could be extracted.' },
      promptVersion: ANALYSIS_PROMPT_VERSION,
    });
  }

  /* ── 2. structure_extraction ────────────────────────────────────── */
  let structureRan = false;
  if (cfg.stages.structureExtraction === false) {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.STRUCTURE_EXTRACTION, outcome: STAGE_OUTCOME.SKIPPED, detail: 'disabled by config' }));
  } else if (hasStructureNodes || hasPageGeometry || hasUsableText) {
    structureRan = true;
    stages.push(makeStageResult({
      stage: PIPELINE_STAGE.STRUCTURE_EXTRACTION, outcome: STAGE_OUTCOME.RAN,
      method: hasStructureNodes ? 'docx_tree' : (hasPageGeometry ? 'pdf_page_geometry' : 'text_lines'),
      detail: { structureNodes: hasStructureNodes ? extraction.structure.length : 0, pagesWithGeometry: hasPageGeometry ? extraction.pages.filter((p) => p.width > 0).length : 0 },
    }));
  } else {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.STRUCTURE_EXTRACTION, outcome: STAGE_OUTCOME.SKIPPED, detail: 'no structural signal' }));
  }

  /* ── 3. page_render ─────────────────────────────────────────────── */
  let renderedPages = null;
  if (!cfg.stages.pageRender || source.format !== 'pdf') {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.PAGE_RENDER, outcome: STAGE_OUTCOME.SKIPPED, detail: !cfg.stages.pageRender ? 'disabled by config' : 'not a PDF' }));
  } else {
    try {
      const rr = await pageRenderPort.renderPages({ source, pages: (extraction && extraction.pages) || [] });
      if (rr && rr.ok) {
        renderedPages = rr.pages;
        stages.push(makeStageResult({ stage: PIPELINE_STAGE.PAGE_RENDER, outcome: STAGE_OUTCOME.RAN, method: pageRenderPort.id, detail: { pages: rr.pages.length } }));
      } else {
        stages.push(makeStageResult({ stage: PIPELINE_STAGE.PAGE_RENDER, outcome: STAGE_OUTCOME.FAILED, method: pageRenderPort.id, error: (rr && rr.error) || { code: 'RENDER_UNAVAILABLE', message: 'no renderer' } }));
      }
    } catch (err) {
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.PAGE_RENDER, outcome: STAGE_OUTCOME.FAILED, error: { code: 'RENDER_THREW', message: err && err.message ? err.message : String(err) } }));
    }
  }

  /* ── 4. visual_analysis ────────────────────────────────────────────
     Deterministic layout ALWAYS runs when page geometry exists (§13 —
     "prefer deterministic"). The model analyzer runs only when
     config.stages.visualAnalysis AND a render succeeded. A DOCX (no
     geometry, no render) → SKIPPED — never a fabricated 'visual_analyzed'
     (§17). */
  let visualRan = false;
  const layoutObs = hasPageGeometry
    ? analyzeLayoutDeterministically({ documentId, extraction, sourceFileId, at: when })
    : [];
  let modelObsCount = 0;
  if (cfg.stages.visualAnalysis && renderedPages && renderedPages.length) {
    try {
      for (const rp of renderedPages) {
        const ar = await visualAnalyzer.analyzePage({ documentId, pageNumber: rp.pageNumber, renderedPage: rp, coordinateSpace: rp.coordinateSpace });
        if (ar && ar.ok && Array.isArray(ar.observations)) {
          for (const raw of ar.observations) {
            const mapped = mapModelObservationToContract(raw, { documentId, sourceFileId, at: when });
            // re-key per page so a per-page model finding stays distinct + idempotent
            if (mapped && rp.pageNumber) {
              modelObsCount += 1;
              layoutObs.push(makeCorpusObservation({ ...mapped, observationId: `${mapped.observationId}__p${rp.pageNumber}` }));
            } else if (mapped) {
              modelObsCount += 1;
              layoutObs.push(mapped);
            }
          }
        }
      }
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.VISUAL_ANALYSIS, outcome: STAGE_OUTCOME.RAN, method: `${visualAnalyzer.id}+deterministic`, detail: { deterministic: layoutObs.length - modelObsCount, model: modelObsCount } }));
      visualRan = true;
    } catch (err) {
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.VISUAL_ANALYSIS, outcome: STAGE_OUTCOME.FAILED, error: { code: 'VISUAL_THREW', message: err && err.message ? err.message : String(err) } }));
      visualRan = layoutObs.length > 0; // deterministic layout still counts
    }
  } else if (hasPageGeometry) {
    visualRan = true;
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.VISUAL_ANALYSIS, outcome: STAGE_OUTCOME.RAN, method: 'deterministic', detail: { deterministic: layoutObs.length, model: 0, note: 'model visual analysis not configured' } }));
  } else {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.VISUAL_ANALYSIS, outcome: STAGE_OUTCOME.SKIPPED, detail: 'no page geometry / no renderer — nothing visual to analyse' }));
  }

  /* ── 5. classification ─────────────────────────────────────────── */
  if (cfg.stages.classification === false) {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.CLASSIFICATION, outcome: STAGE_OUTCOME.SKIPPED, detail: 'disabled by config' }));
  } else if (hasUsableText || hasStructureNodes) {
    try {
      const dt = classifyDocumentType({ text: (extraction && extraction.text) || '', structure: (extraction && extraction.structure) || [], originalFilename: source.originalFilename || '' });
      const sd = extractSourceDate((extraction && extraction.text) || '');
      const era = classifyDocumentEra(
        { sourceDate: sd.sourceDate, documentType: dt.documentType, text: (extraction && extraction.text) || '' },
        { eraCutoverDate: cfg.eraCutoverDate, transitionalWindowDays: cfg.transitionalWindowDays },
      );
      classification.documentType = dt.documentType;
      classification.typeConfidence = dt.typeConfidence;
      classification.documentEra = era.documentEra;
      classification.eraConfidence = era.eraConfidence;
      classification.sourceDate = sd.sourceDate;
      classification.signals = { type: dt.typeSignals, era: era.eraSignals, sourceDateBasis: sd.basis };
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.CLASSIFICATION, outcome: STAGE_OUTCOME.RAN, detail: { documentType: dt.documentType, typeConfidence: dt.typeConfidence, documentEra: era.documentEra, sourceDate: sd.sourceDate } }));
    } catch (err) {
      anyFailure = true;
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.CLASSIFICATION, outcome: STAGE_OUTCOME.FAILED, error: { code: 'CLASSIFY_THREW', message: err && err.message ? err.message : String(err) } }));
    }
  } else {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.CLASSIFICATION, outcome: STAGE_OUTCOME.SKIPPED, detail: 'no text or structure to classify' }));
  }

  /* ── 6. observations ───────────────────────────────────────────── */
  let observationsRan = false;
  if (cfg.stages.observations === false) {
    stages.push(makeStageResult({ stage: PIPELINE_STAGE.OBSERVATIONS, outcome: STAGE_OUTCOME.SKIPPED, detail: 'disabled by config' }));
  } else {
    try {
      const structObs = (hasUsableText || hasStructureNodes || hasPageGeometry)
        ? observeStructure({ documentId, extraction, sourceFileId, at: when }) : [];
      const termObs = hasUsableText
        ? observeTerminology({ documentId, extraction, sourceFileId, at: when })
          .filter((o) => o.occurrenceCount >= (cfg.terminologyMinOccurrence || 1) || o.occurrenceCount === 1)
        : [];
      const all = dedupeById([...structObs, ...termObs, ...layoutObs]).slice(0, cfg.maxObservationsPerDocument || 200);
      // HARD — the pipeline only ever emits 'observed' (candidate grouping
      // is a SEPARATE, explicit, still-non-authoritative call; §11, §21).
      for (const o of all) {
        if (o.lifecycleState !== OBSERVATION_LIFECYCLE.OBSERVED) continue;
        observations.push(o);
      }
      observationsRan = true;
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.OBSERVATIONS, outcome: STAGE_OUTCOME.RAN, detail: { structure: structObs.length, terminology: termObs.length, layout: layoutObs.length, emitted: observations.length } }));
    } catch (err) {
      anyFailure = true;
      stages.push(makeStageResult({ stage: PIPELINE_STAGE.OBSERVATIONS, outcome: STAGE_OUTCOME.FAILED, error: { code: 'OBSERVE_THREW', message: err && err.message ? err.message : String(err) } }));
    }
  }

  /* ── honest analysisStatus ─────────────────────────────────────── */
  let furthest = CORPUS_ANALYSIS_STATUS.PENDING;
  if (hasUsableText) furthest = CORPUS_ANALYSIS_STATUS.TEXT_EXTRACTED;
  if (structureRan && (hasStructureNodes || hasPageGeometry || hasUsableText)) furthest = CORPUS_ANALYSIS_STATUS.STRUCTURE_EXTRACTED;
  if (visualRan) furthest = CORPUS_ANALYSIS_STATUS.VISUAL_ANALYZED;
  let analysisStatus = furthest;
  if (observationsRan && !anyFailure && furthest !== CORPUS_ANALYSIS_STATUS.PENDING) {
    analysisStatus = CORPUS_ANALYSIS_STATUS.COMPLETED;
  }
  const statusPath = computeStatusPath(furthest, analysisStatus, canAnalysisTransition);

  return makePipelineResult({
    ok: true,
    documentId,
    classification,
    observations,
    analysisStatus,
    statusPath,
    stages,
    error: null,
    promptVersion: ANALYSIS_PROMPT_VERSION,
  });
}
