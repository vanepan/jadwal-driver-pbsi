/* ============================================================
   CLARIFICATION.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: turn the deterministic conversation layer's output into
   IntelligenceResponse questions (PART 6), and own the ONE piece of
   clarification the field schemas do not cover — the NOR recipient
   ("Kepada"), which is contextual and must be ASKED, never invented
   (PART 8, PART 15).

   RESPONSIBILITY:
     factQuestions(missingFacts)          → IntelligenceQuestion[] (verbatim
                                            deterministic prompts; a model may
                                            rephrase them later, never add to them)
     resolveRecipient({ collectedFields, recipientPatterns })
                                          → { status:'known'|'proposed'|'ask',
                                              value, source, options }

   DEPENDENCIES: none. Pure.

   NON-GOALS: does not call a model, does not read repositories (the service
   passes in the already-retrieved patterns), does not fabricate. If the
   past is ambiguous, the honest output is 'ask'.
   ============================================================ */

'use strict';

/**
 * @param {{field:string,label:string,prompt:string}[]} missingFacts
 * @returns {{id:string,prompt:string,why:string|null,required:boolean}[]}
 */
export function factQuestions(missingFacts) {
  return (Array.isArray(missingFacts) ? missingFacts : []).map((f) => ({
    id: f.field,
    prompt: f.prompt || `Mohon lengkapi: ${f.label || f.field}`,
    why: f.label || null,
    required: true,
  }));
}

/**
 * Decide the NOR recipient without ever inventing one.
 * @param {Object} args
 * @param {Object} args.collectedFields
 * @param {{ distinct:string[], dominant:string|null, consistent:boolean, sampleSize:number }} args.recipientPatterns
 * @returns {{ status:'known'|'proposed'|'ask', value:string|null, source:string, options:string[] }}
 */
export function resolveRecipient({ collectedFields = {}, recipientPatterns = {} }) {
  const given = typeof collectedFields.recipient === 'string' ? collectedFields.recipient.trim() : '';
  if (given) {
    return { status: 'known', value: given, source: 'human_answer', options: [] };
  }
  const { distinct = [], dominant = null, consistent = false } = recipientPatterns;
  if (consistent && dominant) {
    // A clear historical majority — PROPOSE it (still editable, still human-reviewed).
    return { status: 'proposed', value: dominant, source: 'memory_pattern', options: distinct };
  }
  // No data, or genuinely ambiguous history → the platform must ask.
  return { status: 'ask', value: null, source: 'none', options: distinct };
}

/** The one recipient question, optionally listing what the archive has seen. */
export function recipientQuestion(options = []) {
  const seen = Array.isArray(options) && options.length
    ? ` (NOR serupa sebelumnya ditujukan ke: ${options.slice(0, 5).join('; ')})`
    : '';
  return {
    id: 'recipient',
    prompt: `NOR ini ditujukan kepada siapa?${seen}`,
    why: 'Kepada / Recipient',
    required: true,
  };
}
