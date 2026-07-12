/* composer-foundation-check.mjs — Node check for V2.0.15 "Live Editable
   Composer Foundation": the shared Diff Model (computeDiff, reused by
   V2.0.16), ComposerDocument/EditableSection/FieldOverride/
   SuggestionPlaceholder/ComposerRevision/ComposerSession contracts, and
   composer-store.js's real in-memory store (createDocument/editSection/
   getRevisionHistory/getComposerTimeline). Nothing is generated — every
   value here is human-supplied. No AI, no LLM, no production writes.
   Run: node scripts/composer-foundation-check.mjs   (exit 0 = pass) */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CHANGE_TYPE, isDiff } from '../js/v2/knowledge/learning/contracts/diff-contract.js';
import { computeDiff } from '../js/v2/knowledge/learning/diff-engine.js';

import { isEditableSection } from '../js/v2/document-intelligence/composer/contracts/editable-section-contract.js';
import { isComposerDocument } from '../js/v2/document-intelligence/composer/contracts/composer-document-contract.js';
import { isComposerRevision } from '../js/v2/document-intelligence/composer/contracts/composer-revision-contract.js';
import { isFieldOverride } from '../js/v2/document-intelligence/composer/contracts/field-override-contract.js';
import { SUGGESTION_STATUS, makeSuggestionPlaceholder, isSuggestionPlaceholder } from '../js/v2/document-intelligence/composer/contracts/suggestion-placeholder-contract.js';
import { startComposerSession, DOCUMENT_SESSION_STATE, canTransitionDocumentSession } from '../js/v2/document-intelligence/composer/contracts/composer-session-contract.js';
import {
  createDocument, getDocument, editSection, getRevisionHistory, getComposerTimeline, resetComposerStore, COMPOSER_STORE_ERRORS,
} from '../js/v2/document-intelligence/composer/composer-store.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetComposerStore();

console.log('\n[Diff Model — shared computeDiff, reused by V2.0.16]');
const diff1 = computeDiff({ subject: 'A', total: 100 }, { subject: 'B', total: 100 });
check('computeDiff detects one MODIFIED field only', diff1.fieldsChanged === 1 && diff1.entries[0].field === 'subject' && diff1.entries[0].changeType === CHANGE_TYPE.MODIFIED);
const diff2 = computeDiff({ subject: 'A' }, { subject: 'A', note: 'new' });
check('computeDiff detects an ADDED field', diff2.entries.some((e) => e.field === 'note' && e.changeType === CHANGE_TYPE.ADDED));
const diff3 = computeDiff({ subject: 'A', note: 'old' }, { subject: 'A' });
check('computeDiff detects a REMOVED field', diff3.entries.some((e) => e.field === 'note' && e.changeType === CHANGE_TYPE.REMOVED));
const diffNone = computeDiff({ a: 1 }, { a: 1 });
check('computeDiff reports zero entries when nothing changed', diffNone.fieldsChanged === 0);
check('every computed Diff satisfies isDiff()', [diff1, diff2, diff3, diffNone].every(isDiff));

console.log('\n[Suggestion Placeholder — always EMPTY this milestone]');
const placeholder = makeSuggestionPlaceholder('subject');
check('makeSuggestionPlaceholder always produces status EMPTY', placeholder.status === SUGGESTION_STATUS.EMPTY);
check('a placeholder carries no fabricated suggestion (suggestedValue null, citedEvidence [])', placeholder.suggestedValue === null && placeholder.citedEvidence.length === 0);
check('isSuggestionPlaceholder accepts a well-formed placeholder', isSuggestionPlaceholder(placeholder));

console.log('\n[Composer Session — reuses DOCUMENT_SESSION_STATE unchanged]');
const session = startComposerSession('doc-1');
check('a new ComposerSession starts in DRAFTING (matches DocumentSession reuse)', session.state === DOCUMENT_SESSION_STATE.DRAFTING);
check('canTransitionDocumentSession(DRAFTING, REVIEWING) is legal, reused unchanged', canTransitionDocumentSession(DOCUMENT_SESSION_STATE.DRAFTING, DOCUMENT_SESSION_STATE.REVIEWING));

console.log('\n[Composer store — createDocument, real EditableSections, initial revision]');
const doc = createDocument('nor', { subject: 'Pengadaan ATK', total: 500000 });
check('createDocument produces a valid ComposerDocument', isComposerDocument(doc));
check('the document has one EditableSection per field', doc.sections.length === 2 && doc.sections.every(isEditableSection));
check('no section starts overridden', doc.sections.every((s) => s.isOverridden === false));
const initialHistory = getRevisionHistory(doc.documentId);
check('the initial revision exists, version 1, with a null diff (nothing to compare against yet)', initialHistory.length === 1
  && initialHistory[0].version === 1 && initialHistory[0].diff === null && isComposerRevision(initialHistory[0]));

console.log('\n[Composer store — editSection produces a Field Override + a new traceable Revision]');
const editResult = editSection(doc.documentId, 'subject', 'Pengadaan ATK Kantor', 'evan');
check('editSection succeeds', editResult.ok === true);
check('the returned FieldOverride is valid and records before/after', isFieldOverride(editResult.override)
  && editResult.override.originalValue === 'Pengadaan ATK' && editResult.override.overrideValue === 'Pengadaan ATK Kantor');
check('the updated document bumps version to 2 and marks the section overridden', editResult.document.version === 2
  && editResult.document.sections.find((s) => s.field === 'subject').isOverridden === true);
check('the new revision carries a real Diff with exactly 1 changed field', isComposerRevision(editResult.revision)
  && editResult.revision.diff.fieldsChanged === 1 && editResult.revision.diff.entries[0].field === 'subject');
const historyAfterEdit = getRevisionHistory(doc.documentId);
check('Composer History now has 2 append-only revisions (never overwritten)', historyAfterEdit.length === 2
  && historyAfterEdit[0].version === 1 && historyAfterEdit[1].version === 2);
check('getDocument reflects the edit', getDocument(doc.documentId).version === 2);

console.log('\n[Composer store — error paths]');
const notFound = editSection('never-created', 'subject', 'x', 'evan');
check('editSection on an unknown documentId returns NOT_FOUND', notFound.ok === false && notFound.error.code === COMPOSER_STORE_ERRORS.NOT_FOUND);
const unknownField = editSection(doc.documentId, 'not-a-real-field', 'x', 'evan');
check('editSection on an unknown field returns UNKNOWN_FIELD', unknownField.ok === false && unknownField.error.code === COMPOSER_STORE_ERRORS.UNKNOWN_FIELD);

console.log('\n[Composer Timeline — chronological, scoped by domainType]');
createDocument('nor', { subject: 'Second Doc' });
const timeline = getComposerTimeline('nor');
check('getComposerTimeline lists both nor documents, oldest first', timeline.length === 2 && timeline[0].documentId === doc.documentId);
check('getComposerTimeline scoped to an unrelated domainType is empty', getComposerTimeline('petty_cash').length === 0);

console.log('\n[Dormancy — Composer is document-intelligence-only, never imported by knowledge/]');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const knowledgeRoot = path.join(repoRoot, 'js', 'v2', 'knowledge');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}
function importSpecifiers(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const specifiers = [];
  const re = /(?:import|export)\s+(?:[^'"]*?\bfrom\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) specifiers.push(m[1]);
  return specifiers;
}
const violations = [];
for (const file of walk(knowledgeRoot)) {
  for (const spec of importSpecifiers(file)) {
    if (spec.includes('document-intelligence')) violations.push(file);
  }
}
check('no file under js/v2/knowledge/ imports document-intelligence/ (one-way dependency preserved)', violations.length === 0);

resetComposerStore();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
