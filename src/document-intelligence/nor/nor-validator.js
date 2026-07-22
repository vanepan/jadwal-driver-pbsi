/* ============================================================
   NOR-VALIDATOR.JS — NOR Intelligence Runtime (V2.0.6, Phase 9.5)

   PURPOSE: the VALIDATE step — a read-only, advisory precheck against the
   SAME two guard clauses js/petty-cash/petty-cash-service.js#generateNor()
   already enforces ("Nomor NOR wajib diisi.", "Pilih minimal satu nota
   untuk direalisasikan."). Mirrored, not called — generateNor() is not
   exported as a pure validator and V1 is not modified to extract one
   (mission constraint). This is the SAME "client-advisory only" pattern
   already established for validateOdometer (v1.11.5 Tier-1 integrity) —
   a preview check a human sees before the real, authoritative V1 engine
   runs; the real enforcement point is still generateNor() itself,
   unchanged.

   RESPONSIBILITY: `validateNorInput(input)` satisfying
   DocumentDraftValidation; registered as the VALIDATE step.

   DEPENDENCIES: contracts/document-draft-contract.js (isDocumentDraftValidation),
   registry/step-registry.js, contracts/document-pipeline-contract.js.

   NON-GOALS: does not import or call petty-cash-service.js. Not the
   authoritative check — generateNor() still enforces these rules for real
   at write time regardless of what this step reports.
   ============================================================ */

'use strict';

import { isDocumentDraftValidation } from '../contracts/document-draft-contract.js';
import { registerStep } from '../registry/step-registry.js';
import { DOCUMENT_PIPELINE_STEP } from '../contracts/document-pipeline-contract.js';

/**
 * @param {{norNumber?: string, expenseIds?: string[]}} input
 * @returns {import('../contracts/document-draft-contract.js').DocumentDraftValidation}
 */
export function validateNorInput(input) {
  const issues = [];
  const norNumber = (input && input.norNumber || '').trim();
  if (!norNumber) issues.push({ field: 'norNumber', message: 'Nomor NOR wajib diisi.' });

  const expenseIds = (input && input.expenseIds) || [];
  if (!expenseIds.length) issues.push({ field: 'expenseIds', message: 'Pilih minimal satu nota untuk direalisasikan.' });

  const validation = Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
  if (!isDocumentDraftValidation(validation)) throw new Error('validateNorInput: constructed an invalid DocumentDraftValidation.');
  return validation;
}

registerStep('nor', DOCUMENT_PIPELINE_STEP.VALIDATE, (context) => {
  const validation = validateNorInput(context.input || {});
  return { ok: true, output: validation }; // the STEP always succeeds; `validation.ok` carries the actual verdict
});
