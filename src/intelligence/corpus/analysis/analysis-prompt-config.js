/* ============================================================
   ANALYSIS-PROMPT-CONFIG.JS — Corpus Ingestion & Document Analysis
   (V2, Phase 5.x.2)

   PURPOSE: the VERSIONED, PURE-DATA prompt/config a future server-side
   model analyzer would use (§15). No key, no endpoint, no network, no
   call — this file is a specification, not an integration.

   The model, if ever used, is instructed to:
     • identify only evidence PRESENT in the source
     • distinguish an OBSERVATION from an INFERENCE
     • never invent a missing date / number / name
     • preserve exact wording when relevant
     • identify page + region when possible, with a coordinate space
     • return uncertainty explicitly
     • NEVER declare organizational policy
     • NEVER mark an observation approved
   Its output maps 1:1 into the CorpusObservation contract, always
   `lifecycleState: 'observed'`, always with provenance.

   RESPONSIBILITY: ANALYSIS_PROMPT_VERSION, ANALYSIS_SYSTEM_INSTRUCTIONS,
   ANALYSIS_OUTPUT_SCHEMA, mapModelObservationToContract().

   DEPENDENCIES: ../contracts/corpus-observation-contract.js (category /
   modality vocab), ../contracts/corpus-provenance-contract.js. Pure.
   ============================================================ */

'use strict';

import {
  OBSERVATION_CATEGORY, OBSERVATION_MODALITY, makeCorpusObservation,
} from '../contracts/corpus-observation-contract.js';
import { EXTRACTION_METHOD, makeCorpusProvenance } from '../contracts/corpus-provenance-contract.js';
import { observationIdFrom } from '../corpus-observation-record.js';

/** Bump on any change to the instructions or the output schema. A
 *  GenerationProvenance-style stamp records which version produced an
 *  observation (mirrors src/knowledge/datasets/import-session/parser-registry.js). */
export const ANALYSIS_PROMPT_VERSION = 'corpus-analysis-prompt@1';

export const ANALYSIS_SYSTEM_INSTRUCTIONS = [
  'You analyse ONE historical PBSI organizational document (a NOR, a Nota Organisasi, or a Memorandum).',
  'You describe what the document DOES — its wording and its layout. You never decide what the organization SHOULD do.',
  'Rules:',
  '1. Report ONLY things present in the supplied text/page. If it is not there, say nothing about it.',
  '2. Separate OBSERVATION ("the document contains X") from INFERENCE ("X might mean Y"). Only observations are output.',
  '3. Never invent or complete a missing date, number, name, or amount. Missing = null.',
  '4. Preserve exact wording for any phrase you report (verbatim, no paraphrase, no normalisation).',
  '5. For a layout fact, give the page number and a region {x,y,width,height} with a coordinateSpace, or say the region is unknown.',
  '6. State your confidence (0..1) for each observation. Confidence is about extraction certainty, NOT about organizational authority.',
  '7. Never output an "approved", "required", "official", or "policy" judgement. Every observation is evidence for a human to review.',
].join('\n');

/** The JSON shape the model must return; each entry becomes a CorpusObservation. */
export const ANALYSIS_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    observations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'modality', 'key', 'confidence', 'evidence'],
        properties: {
          category: { type: 'string', enum: Object.values(OBSERVATION_CATEGORY) },
          modality: { type: 'string', enum: Object.values(OBSERVATION_MODALITY) },
          key: { type: 'string' },
          observedValue: { type: ['string', 'null'] },
          observation: { type: ['object', 'null'] },
          pageNumber: { type: ['integer', 'null'] },
          region: { type: ['object', 'null'] },
          coordinateSpace: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: { type: 'string' },
        },
      },
    },
  },
});

/**
 * Map ONE model-returned observation into a contract CorpusObservation.
 * The mapper HARD-FORCES `lifecycleState: 'observed'` and never accepts an
 * approval field from a model (§15, §21).
 * @param {object} raw          one item from the model's `observations`
 * @param {{ documentId: string, sourceFileId?: string|null, at?: string }} ctx
 * @returns {import('../contracts/corpus-observation-contract.js').CorpusObservation|null}
 */
export function mapModelObservationToContract(raw, { documentId, sourceFileId = null, at } = {}) {
  if (!raw || typeof raw !== 'object' || !documentId) return null;
  const when = at || new Date().toISOString();
  const category = Object.values(OBSERVATION_CATEGORY).includes(raw.category) ? raw.category : null;
  if (!category) return null;
  const provenance = [makeCorpusProvenance({
    sourceDocumentId: documentId,
    sourceFileId,
    pageNumber: Number.isInteger(raw.pageNumber) ? raw.pageNumber : null,
    region: raw.region && typeof raw.region === 'object'
      ? { ...raw.region, coordinateSpace: raw.coordinateSpace || (raw.region && raw.region.coordinateSpace) }
      : null,
    extractionMethod: EXTRACTION_METHOD.VISUAL_ANALYSIS,
    extractedAt: when,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
  })];
  const key = String(raw.key || '').slice(0, 120) || 'model_observation';
  return makeCorpusObservation({
    observationId: `${observationIdFrom(documentId, category, key)}__vm`,
    documentId,
    category,
    modality: Object.values(OBSERVATION_MODALITY).includes(raw.modality) ? raw.modality : OBSERVATION_MODALITY.VISUAL,
    key,
    observedValue: raw.observedValue == null ? null : String(raw.observedValue).slice(0, 400),
    observation: raw.observation && typeof raw.observation === 'object' && !Array.isArray(raw.observation) ? raw.observation : null,
    provenance,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
    occurrenceCount: 1,
    // HARD — a model NEVER produces anything but 'observed'.
    lifecycleState: 'observed',
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: when,
    updatedAt: when,
  });
}
