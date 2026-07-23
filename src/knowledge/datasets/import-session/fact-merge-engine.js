/* ============================================================
   FACT-MERGE-ENGINE.JS — Intelligent Ingestion (V2, Part A2)

   PURPOSE: the ONE conflict-resolution policy for merging a re-analysis
   run's fresh content-fact-extraction-engine.js result into a session's
   EXISTING facts — the one genuinely new piece of business logic Part A2
   adds (everything else it does is reuse: learning/services/
   learning-service.js for audit, knowledge/learning/
   correction-pipeline-engine.js for the safe Knowledge-side merge,
   pipeline-scheduler.js's event-driven sweep pattern for the trigger).

   THE RULE (mirrors learning-service.js#record()'s own "identical fact is
   a true no-op" philosophy, extended one step): a field only changes when
   there is genuinely BETTER evidence for it than what's there now —

     - the existing value is empty                    -> always fill it
     - the field was set by a HUMAN (factsProvenance.source === 'human')
                                                        -> NEVER overwritten,
                                                           no matter how
                                                           confident the new
                                                           extraction is —
                                                           this is the one
                                                           hard rule
     - the new extraction's confidence for that field is STRICTLY greater
       than the confidence recorded when the current value was set
                                                        -> overwrite
     - otherwise (equal or lower confidence, or the field is still empty
       in the new extraction too)                      -> no-op

   RESPONSIBILITY: mergeExtractedFacts(existingFacts, existingProvenance,
   newExtraction).

   NON-GOALS: never merges `notes` — that field is exclusively human free-
   annotation, no extractor has ever produced or will ever produce a value
   for it (see content-fact-extraction-engine.js's own NON-GOALS). Never
   decides WHETHER to run a re-analysis (see import-session-engine.js#
   isFactsStale/listReanalysisCandidates) or what to DO with a merge
   result (see dataset-import-center.js#runReanalysis, the orchestration
   layer — this file is pure, no repository/session/Firebase access).

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

const MERGEABLE_FIELDS = Object.freeze(['value', 'documentNumber', 'senderOrigin']);

/**
 * @param {{value?: string, documentNumber?: string, senderOrigin?: string, notes?: string}} existingFacts
 * @param {{source: string, confidencePerField: Object|null}|null} existingProvenance
 * @param {{value: string, documentNumber: string, senderOrigin: string, confidencePerField: Object}} newExtraction
 * @returns {{
 *   merged: {value: string, documentNumber: string, senderOrigin: string, notes: string},
 *   confidencePerField: Object,
 *   changed: boolean,
 *   changedFields: string[],
 * }}
 */
export function mergeExtractedFacts(existingFacts, existingProvenance, newExtraction) {
  const facts = existingFacts || {};
  const existingConfidence = (existingProvenance && existingProvenance.confidencePerField) || {};
  const merged = { ...facts };
  const confidencePerField = { ...existingConfidence };
  const changedFields = [];

  for (const field of MERGEABLE_FIELDS) {
    const currentValue = facts[field];
    const currentConfidence = typeof existingConfidence[field] === 'number' ? existingConfidence[field] : 0;
    const newValue = newExtraction[field];
    const newConfidence = newExtraction.confidencePerField ? (newExtraction.confidencePerField[field] || 0) : 0;

    if (!newValue) continue; // nothing new to offer for this field
    const isEmpty = !currentValue || !String(currentValue).trim();
    const isHumanSet = existingProvenance && existingProvenance.source === 'human' && !isEmpty;

    if (isEmpty || (!isHumanSet && newConfidence > currentConfidence)) {
      merged[field] = newValue;
      confidencePerField[field] = newConfidence;
      changedFields.push(field);
    }
  }

  return {
    merged: { value: merged.value || '', documentNumber: merged.documentNumber || '', senderOrigin: merged.senderOrigin || '', notes: facts.notes || '' },
    confidencePerField,
    changed: changedFields.length > 0,
    changedFields,
  };
}
