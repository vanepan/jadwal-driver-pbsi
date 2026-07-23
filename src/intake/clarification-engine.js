/* ============================================================
   CLARIFICATION-ENGINE.JS — Problem Solving Pipeline Integration
   (V2, Phase 10.5, Part 3)

   PURPOSE: "The platform should never respond with 'Request not
   recognized.' Unknown Problems are acceptable. Rejected Problems are
   not." PURE — generateClarification() never returns a rejection; it
   always returns a genuine, honest question inviting more detail, plus
   the real, registered category labels the platform DOES understand
   today (never a fabricated list — read straight from
   problem-category-contract.js's own registry, so it grows automatically
   as new categories are registered, same "Extensible Problem Types"
   discipline every other file in this domain follows).

   RESPONSIBILITY: generateClarification(problem, matchedKeywords).

   DEPENDENCIES: problem-intelligence/contracts/problem-category-contract.js
   (read-only — category labels only, never a parser re-run).
   ============================================================ */

'use strict';

import { listProblemCategories } from './contracts/problem-category-contract.js';

/** A short, fixed set of honest clarifying prompts — rotated deterministically
 *  (by utterance length, never random) so the same short/ambiguous input
 *  does not always read as a canned reply, without pretending to be an AI
 *  that "understands" anything more than "this needs more detail". */
const CLARIFICATION_PROMPTS = Object.freeze([
  'Saya memahami Anda sedang menjelaskan sebuah masalah, tetapi saya memerlukan sedikit informasi lagi untuk mengklasifikasikannya.',
  'Bisa dijelaskan sedikit lebih lanjut apa yang terjadi?',
  'Boleh diperjelas — ini tentang fasilitas, perjalanan dinas, pengadaan barang, atau hal administratif lainnya?',
]);

function exampleCategoryLabels() {
  return listProblemCategories()
    .map((c) => c.label)
    .filter((label) => label !== 'Unknown');
}

/**
 * @param {import('../reasoning/contracts/problem-contract.js').Problem} problem
 * @param {string[]} [matchedKeywords] - whatever Problem Classification honestly matched, even if not enough to route (may be empty)
 * @returns {{message: string, examples: string[]}}
 */
export function generateClarification(problem, matchedKeywords = []) {
  const promptIndex = (problem.description || '').length % CLARIFICATION_PROMPTS.length;
  const message = CLARIFICATION_PROMPTS[promptIndex];
  const examples = exampleCategoryLabels();

  return Object.freeze({
    message,
    // Honest, not decorative: if Problem Classification DID partially match
    // something, say so, rather than acting as if nothing was understood at
    // all — this is the same "never fabricate, never fully discard" spirit
    // question-optimizer.js already practices.
    partialSignal: matchedKeywords.length
      ? `Saya menangkap kata "${matchedKeywords.join(', ')}" tapi belum cukup yakin untuk mengenali jenis masalahnya.`
      : null,
    examples: Object.freeze(examples),
  });
}
