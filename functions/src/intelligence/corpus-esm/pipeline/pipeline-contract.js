/* ============================================================
   PIPELINE-CONTRACT.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: fix the shape of an analysis pipeline RUN — the ordered
   stages, and the result the orchestrator returns. The result is DATA
   only; the pipeline never persists anything (§19, §22).

   PIPELINE_STAGE (ordered):
     text_extraction → structure_extraction → page_render →
     visual_analysis → classification → observations

   Each stage records an honest outcome (§17):
     ran      — it executed and produced something
     skipped  — the config toggled it off, or it did not apply
     failed   — it executed and failed; failure is ISOLATED (§19) — later
                stages that do not depend on it still run, and the
                analysisStatus only advances as far as the stages that
                actually succeeded.

   RESPONSIBILITY: PIPELINE_STAGE, STAGE_OUTCOME, makeStageResult,
   makePipelineResult, isPipelineResult.

   DEPENDENCIES: ../contracts/corpus-document-contract.js
   (CORPUS_ANALYSIS_STATUS). Pure.
   ============================================================ */

'use strict';

import { CORPUS_ANALYSIS_STATUS } from '../contracts/corpus-document-contract.js';

export const PIPELINE_RESULT_SCHEMA = 'corpus-pipeline-result@1';

export const PIPELINE_STAGE = Object.freeze({
  TEXT_EXTRACTION: 'text_extraction',
  STRUCTURE_EXTRACTION: 'structure_extraction',
  PAGE_RENDER: 'page_render',
  VISUAL_ANALYSIS: 'visual_analysis',
  CLASSIFICATION: 'classification',
  OBSERVATIONS: 'observations',
});

export const PIPELINE_STAGE_ORDER = Object.freeze([
  PIPELINE_STAGE.TEXT_EXTRACTION,
  PIPELINE_STAGE.STRUCTURE_EXTRACTION,
  PIPELINE_STAGE.PAGE_RENDER,
  PIPELINE_STAGE.VISUAL_ANALYSIS,
  PIPELINE_STAGE.CLASSIFICATION,
  PIPELINE_STAGE.OBSERVATIONS,
]);

export const STAGE_OUTCOME = Object.freeze({
  RAN: 'ran',
  SKIPPED: 'skipped',
  FAILED: 'failed',
});

export function makeStageResult({ stage, outcome, method = null, detail = null, error = null } = {}) {
  return Object.freeze({
    stage,
    outcome: Object.values(STAGE_OUTCOME).includes(outcome) ? outcome : STAGE_OUTCOME.SKIPPED,
    method: method == null ? null : String(method),
    detail: detail && typeof detail === 'object' ? Object.freeze({ ...detail }) : (detail == null ? null : String(detail)),
    error: error == null ? null : Object.freeze({ code: String(error.code || 'STAGE_FAILED'), message: String(error.message || '') }),
  });
}

/**
 * @typedef {Object} PipelineResult
 * @property {string} schema
 * @property {boolean} ok                 - true if extraction produced usable input; false if the document could not be analysed at all
 * @property {string} documentId
 * @property {object} classification      - a partial CorpusDocument update: { documentType?, typeConfidence?, documentEra?, eraConfidence?, sourceDate?, pageCount? }
 * @property {import('../contracts/corpus-observation-contract.js').CorpusObservation[]} observations  - ALL lifecycleState 'observed' (or 'candidate' from a later grouping call)
 * @property {string} analysisStatus      - CORPUS_ANALYSIS_STATUS.* — the honest furthest point reached
 * @property {string[]} statusPath        - the ORDERED, individually-legal CORPUS_ANALYSIS_STATUS steps from 'pending' to `analysisStatus` — a caller applies them one at a time via setAnalysisStatus (§17)
 * @property {Array} stages               - one makeStageResult() per stage attempted
 * @property {{code:string,message:string}|null} error
 * @property {string} promptVersion       - which analysis config produced this (audit stamp)
 */
export function makePipelineResult({
  ok = false, documentId = '', classification = {}, observations = [],
  analysisStatus = CORPUS_ANALYSIS_STATUS.PENDING, statusPath = [], stages = [], error = null, promptVersion = null,
} = {}) {
  const status = Object.values(CORPUS_ANALYSIS_STATUS).includes(analysisStatus) ? analysisStatus : CORPUS_ANALYSIS_STATUS.PENDING;
  return Object.freeze({
    schema: PIPELINE_RESULT_SCHEMA,
    ok: ok === true,
    documentId: String(documentId || ''),
    classification: classification && typeof classification === 'object' ? Object.freeze({ ...classification }) : Object.freeze({}),
    observations: Object.freeze(Array.isArray(observations) ? [...observations] : []),
    analysisStatus: status,
    statusPath: Object.freeze((Array.isArray(statusPath) ? statusPath : []).filter((s) => Object.values(CORPUS_ANALYSIS_STATUS).includes(s))),
    stages: Object.freeze(Array.isArray(stages) ? stages.map((s) => (s && s.stage ? s : makeStageResult(s))) : []),
    error: error == null ? null : Object.freeze({ code: String(error.code || 'PIPELINE_FAILED'), message: String(error.message || '') }),
    promptVersion: promptVersion == null ? null : String(promptVersion),
  });
}

/**
 * Compute the ordered, individually-legal analysis-status steps from
 * 'pending' to `target`, given the pre-completion rung the pipeline
 * ACTUALLY reached (`furthest`). `canTransition` is
 * corpus-document-contract.js#canAnalysisTransition. Every returned step
 * is a legal single move, so a caller can apply them one at a time via
 * setAnalysisStatus without an ILLEGAL_TRANSITION.
 * @param {string} furthest  the real pre-completion rung reached (pending | text_extracted | structure_extracted | visual_analyzed | failed)
 * @param {string} target     the final analysisStatus
 * @param {(from:string,to:string)=>boolean} canTransition
 * @returns {string[]}
 */
export function computeStatusPath(furthest, target, canTransition) {
  const S = CORPUS_ANALYSIS_STATUS;
  if (!Object.values(S).includes(target) || target === S.PENDING) return [];
  if (target === S.FAILED) return [S.FAILED];
  const rungs = [S.TEXT_EXTRACTED, S.STRUCTURE_EXTRACTED, S.VISUAL_ANALYZED];
  const rung = rungs.includes(furthest) ? furthest : null;
  if (rungs.includes(target)) return canTransition(S.PENDING, target) ? [target] : [];
  if (target === S.COMPLETED) {
    if (rung && canTransition(S.PENDING, rung) && canTransition(rung, S.COMPLETED)) return [rung, S.COMPLETED];
    // fall back to the earliest legal rung so the path is still valid
    for (const r of rungs) {
      if (canTransition(S.PENDING, r) && canTransition(r, S.COMPLETED)) return [r, S.COMPLETED];
    }
  }
  return [];
}

export function isPipelineResult(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== PIPELINE_RESULT_SCHEMA) return false;
  if (typeof r.ok !== 'boolean') return false;
  if (typeof r.documentId !== 'string') return false;
  if (!r.classification || typeof r.classification !== 'object') return false;
  if (!Array.isArray(r.observations)) return false;
  if (!Object.values(CORPUS_ANALYSIS_STATUS).includes(r.analysisStatus)) return false;
  if (!Array.isArray(r.stages)) return false;
  return true;
}
