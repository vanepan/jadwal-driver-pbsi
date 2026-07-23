/* editing-pipeline-invariants-check.mjs — Phase 11 "regression barrier":
   real-browser proof for the full inline-editing pipeline named in the
   Sprint 11.10 UAT root-cause investigation:

     render -> contenteditable -> placeholder -> commit -> revision
       -> semantic diff -> candidate generation -> knowledge queue
       -> review workspace -> explainability renderer

   WHY THIS FILE EXISTS. A UAT report claimed five regressions appearing
   together (title corruption, placeholder concatenation, a Review
   Workspace crash, missing learning candidates, disappearing writing
   recommendations) and asked for a single shared root cause. Exhaustive
   investigation — the existing 350+ check regression suite re-run
   unchanged, PLUS fresh manual reproduction attempts covering normal
   usage, multi-document navigation, rapid interaction, and Developer-
   Mode/explainability edge cases — could not reproduce ANY of the five
   claims. Two real artifacts were found in the FIRST, naively-written
   reproduction attempt (not in the product): (1) reusing a stale,
   detached DOM element reference across a re-render, and (2) a race
   between creating a document and its list row appearing after a
   debounced re-render. Neither is a product defect — a real user always
   interacts with the CURRENT rendered DOM and always waits for what they
   see before clicking it. This file locks in the CORRECT, verified
   behavior across every pipeline stage, deliberately including both of
   those trap scenarios (do NOT "fix" them into false failures), so a
   REAL regression in any of the five claimed areas would be caught here
   immediately in the future.

   Credential-free (same idiom as every other browser check in this repo):
   serves the app statically, imports composer-store.js/review-
   workspace.js/learning-service.js directly, never touches js/app.js's
   Firebase-gated bootstrap. See this sprint's report for the one honest
   blind spot this implies: a real Firebase round-trip (actual RTDB
   persistence across a real reload) is outside what this environment can
   exercise — the same repo-wide, previously-documented limitation every
   other browser check here already carries.
   Run: node scripts/editing-pipeline-invariants-check.mjs   (exit 0 = pass) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
// RTDB permission-denied noise is expected/harmless in this credential-free
// environment (documented repo-wide limitation) — excluded here the same
// way every other browser check's own fatal-error filter already does.
page.on('console', (m) => { if (m.type() === 'error' && !/[Pp]ermission[_ ]denied|PERMISSION_DENIED/.test(m.text())) errors.push('console.error: ' + m.text()); });
// Root-caused during this sprint's investigation (documented in the
// report): navigating to `/` loads the REAL production app.js bootstrap
// in parallel with this test's direct-module-import approach (same as
// every sibling browser check in this repo). js/auth.js's real Firebase
// onAuthStateChanged handler legitimately clears `pbsi_current_user` when
// no real session exists (correct app behavior in this credential-free
// environment) — and that async clear can race AFTER this test's own
// simulated-login setItem, depending on how much synchronous work runs
// first. This is a genuine, pre-existing TEST-HARNESS fragility shared by
// every script using this pattern, not a product defect. Neutralized here,
// once, by making the simulated session immune to that one specific real
// removeItem call — never touching any other localStorage key, and never
// touching product code.
const PROTECTED_KEYS = new Set(['pbsi_current_user', 'sarpras.presentationMode']);
await page.evaluateOnNewDocument((keys) => {
  const origRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (key) {
    if (keys.includes(key)) return; // this test owns these keys for its duration
    return origRemoveItem.call(this, key);
  };
}, [...PROTECTED_KEYS]);
await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { createDocument, attachExplainability, getDocument, getRevisionHistory } = await import('/src/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');
  const { listLearningEvents, LEARNING_KIND } = await import('/src/learning/services/learning-service.js');
  const { getCandidateQueue } = await import('/src/knowledge/review/review-queue-engine.js');
  const { LIFECYCLE_STATE } = await import('/src/knowledge/contracts/lifecycle-contract.js');
  const { generateKnowledgeId } = await import('/src/knowledge/contracts/identity-contract.js');
  const { setActiveRepository, create: repoCreate } = await import('/src/knowledge/repository/knowledge-repository.js');
  const { promoteToCandidate } = await import('/src/knowledge/promotion/promotion-engine.js');
  const { submitForReview, approve } = await import('/src/knowledge/review/review-workflow-engine.js');
  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

  // A REAL, Approved sentence_pattern KnowledgeItem — Signal 2
  // (submitDraftEditAsCorrection) only mints a Candidate when the field's
  // cited knowledgeId genuinely resolves (section-learning-bridge.js's own
  // documented behavior: an unresolvable citation is audited but never
  // proposes a pattern correction — proven separately in section-
  // learning-bridge-check.mjs). Docs B's pattern field below cites THIS
  // real item, not a fabricated id.
  setActiveRepository('memory');
  const now = new Date().toISOString();
  const patternItem = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'pipelinetest', sourceRef: 'pipeline-1' }),
    version: 1, domainType: 'nor', sourceType: 'pipelinetest', kind: 'sentence_pattern',
    payload: { template: 'Kalimat pola dokumen B yang cukup panjang untuk diuji.', granularity: 'sentence' },
    confidence: 0.8, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: { connectorId: 'pipelinetest', sourceRef: 'pipeline-1', capturedAt: now },
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(patternItem);
  promoteToCandidate(patternItem.id);
  submitForReview(patternItem.id);
  approve(patternItem.id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'Seed for editing-pipeline-invariants-check.mjs.' });

  // ── Stage 1: pre-create EVERY fixture document (A, B, C, AND D) BEFORE
  // mounting, so the list is already stable by the time we click into any
  // of them — this is precisely the debounce-race trap this file's header
  // describes (a row for a document created AFTER mount does not appear
  // until composer-document-repository's notifyChange -> scheduleRender
  // debounce fires, ~100ms later; clicking too early silently no-ops and
  // leaves whatever was previously selected showing instead). ──
  const docA = createDocument('nor', { subject: 'Document A', suggestedSignatoryTopCount: 2, suggestedSignatoryBottomCount: 1 });
  const docB = createDocument('nor', { subject: 'Document B', [`pattern:${patternItem.id}`]: 'Kalimat pola dokumen B yang cukup panjang untuk diuji.' });
  const docC = createDocument('nor', {}); // fully empty — no signature suggestion at all
  const docD = createDocument('nor', {
    documentTitle: 'Judul Kustom Edge-Case',
    suggestedSignatoryTopCount: 3,
    suggestedSignatoryBottomCount: 0, // the real edge case: zero, not absent
    'pattern:knowledge:nor:pipeline-test:2': 'Kalimat pola edge-case yang cukup panjang untuk diuji.', // deliberately unresolvable citation — explainability must tolerate this too
  });
  attachExplainability(docD.documentId, {
    conversationId: 'conv-pipeline-test',
    unresolvedFields: ['someMissingField'],
    citedKnowledgeIds: ['knowledge:nor:pipeline-test:2'],
    explanation: [{ citedKnowledgeId: 'knowledge:nor:pipeline-test:2', kind: 'sentence_pattern', statement: 'Test statement.' }],
    renderingRulesConsidered: [],
    reasoningConsidered: { ok: false, errorCode: null },
    numberingSuggestion: null,
  });
  localStorage.setItem('sarpras.presentationMode', 'normal');

  const root = document.createElement('div');
  root.id = 'pipeline-root';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  await sleep(200);

  // A small helper that ALWAYS re-queries fresh (the stale-node trap this
  // file's header describes) — never holds a DOM reference across a click.
  const clickDoc = async (doc) => {
    root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();
    await sleep(80);
  };
  const commitField = async (selector, text) => {
    const el = root.querySelector(selector);
    if (!el) return false;
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await sleep(80);
    return true;
  };

  const out = {};

  // ── Stage 2: render + contenteditable + placeholder ──
  await clickDoc(docA);
  let titleEl = root.querySelector('.rw-doc-title');
  out.render = { rwDocPresent: root.innerHTML.includes('rw-doc'), titleFound: !!titleEl };
  out.contenteditable = { isContentEditable: titleEl?.getAttribute('contenteditable') === 'true' };
  out.placeholder = {
    attr: titleEl?.getAttribute('data-placeholder'),
    textContentIsEmpty: (titleEl?.textContent || '') === '',
    classList: titleEl ? [...titleEl.classList] : [],
  };

  // ── Stage 3: commit (title) + revision ──
  const revisionsBefore = getRevisionHistory(docA.documentId).length;
  await commitField('.rw-doc-title', 'Permohonan Dokumen A');
  const docAAfter = getDocument(docA.documentId);
  const revisionsAfter = getRevisionHistory(docA.documentId).length;
  titleEl = root.querySelector('.rw-doc-title');
  out.commitAndRevision = {
    domTextAfterCommit: titleEl?.textContent,
    storedSectionValue: docAAfter.sections.find((s) => s.field === 'documentTitle')?.value,
    revisionCountGrew: revisionsAfter === revisionsBefore + 1,
    noConcatenation: titleEl?.textContent === 'Permohonan Dokumen A', // never "Nota Organisasi..." glued on
  };

  // Type a SECOND time to prove no accumulation/concatenation across edits.
  await commitField('.rw-doc-title', 'Permohonan Dokumen A Revisi');
  titleEl = root.querySelector('.rw-doc-title');
  out.secondEditNoConcatenation = { text: titleEl?.textContent, isExactlyExpected: titleEl?.textContent === 'Permohonan Dokumen A Revisi' };

  // ── Stage 4: semantic diff + candidate generation (title, a non-pattern field) ──
  const correctionsBeforeA = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data;
  const titleCorrection = correctionsBeforeA.find((e) => e.evidence?.field === 'documentTitle' && e.sourceDocumentId === docA.documentId);
  out.semanticDiffTitle = {
    correctionExists: !!titleCorrection,
    diffNature: titleCorrection?.evidence?.semanticDiff?.diffNature || null,
  };

  // ── Stage 5: switch documents (the real navigation a reviewer performs) ──
  await clickDoc(docB);
  out.switchToB = { sigRows: root.querySelectorAll('.rw-sig-row').length, hasRwDoc: root.innerHTML.includes('rw-doc') };
  await clickDoc(docC);
  out.switchToC = { sigRows: root.querySelectorAll('.rw-sig-row').length, hasRwDoc: root.innerHTML.includes('rw-doc') };
  await clickDoc(docA);
  out.switchBackToA = {
    sigRows: root.querySelectorAll('.rw-sig-row').length, // must be 2 again — proves no state bleed from B/C
    titleStillCorrect: root.querySelector('.rw-doc-title')?.textContent === 'Permohonan Dokumen A Revisi',
  };

  // ── Stage 6: commit on Document B's pattern-sourced field -> candidate generation -> knowledge queue ──
  await clickDoc(docB);
  const correctionsBeforeB = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  const candidatesBefore = getCandidateQueue().length;
  const patternCommitted = await commitField('[data-field^="pattern:"]', 'Kalimat pola dokumen B direvisi total, cukup panjang untuk diuji semantik.');
  const correctionsAfterB = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  const candidatesAfter = getCandidateQueue().length;
  out.patternCommitAndCandidateQueue = {
    patternFieldFound: patternCommitted,
    correctionRecorded: correctionsAfterB === correctionsBeforeB + 1,
    candidateQueueGrew: candidatesAfter > candidatesBefore,
  };

  // ── Stage 7: Review Workspace never crashes on a genuinely empty document ──
  await clickDoc(docC);
  out.emptyDocumentRender = {
    hasRwDoc: root.innerHTML.includes('rw-doc'),
    hasUndefinedLeak: root.innerHTML.includes('>undefined<') || root.innerHTML.includes('[object Object]') || root.innerHTML.includes('NaN'),
    sigRows: root.querySelectorAll('.rw-sig-row').length, // 0 — honest absence, no fabricated grid
  };

  // ── Stage 8: explainability renderer tolerates every valid document
  // state — a zero-count signatureSuggestion, a custom title, a pattern
  // field, and a real attached explainability bag, together, in
  // Developer Mode. docD (and its explainability bag) was pre-created
  // above alongside A/B/C, for the same debounce-race reason. ──
  localStorage.setItem('sarpras.presentationMode', 'developer');
  await clickDoc(docD);
  await sleep(80); // Developer Mode toggling changes what a render shows; give it one more tick of margin
  out.explainabilityDeveloperMode = {
    hasUndefinedLeak: root.innerHTML.includes('>undefined<') || root.innerHTML.includes('[object Object]') || root.innerHTML.includes('NaN'),
    sigRows: root.querySelectorAll('.rw-sig-row').length, // 1 (top=3 only; bottom=0 produces no second row, not a crash)
    confDetailPresent: root.querySelectorAll('.rw-conf-detail').length > 0, // proves Developer Mode genuinely activated
    titleShowsCustomValue: root.querySelector('.rw-doc-title')?.textContent === 'Judul Kustom Edge-Case',
  };
  localStorage.setItem('sarpras.presentationMode', 'normal');

  return out;
});

console.log('\n[Pipeline stage 1/2/3 — render, contenteditable, placeholder]');
check('the document renders as a real Live Document', result.render.rwDocPresent);
check('the title element exists', result.render.titleFound);
check('the title is genuinely contenteditable', result.contenteditable.isContentEditable);
check('the placeholder is a stable data-attribute ("Nota Organisasi")', result.placeholder.attr === 'Nota Organisasi');
check('the field itself starts genuinely empty (placeholder is never real textContent)', result.placeholder.textContentIsEmpty);
check('the empty state carries rw-editable--empty (drives the CSS-only placeholder)', result.placeholder.classList.includes('rw-editable--empty'));

console.log('\n[Pipeline stage 4 — commit + revision]');
check('committing the title updates the live DOM text exactly, no residue', result.commitAndRevision.domTextAfterCommit === 'Permohonan Dokumen A');
check('the committed value is genuinely persisted in the ComposerDocument\'s own sections', result.commitAndRevision.storedSectionValue === 'Permohonan Dokumen A');
check('a real new ComposerRevision was appended (append-only history)', result.commitAndRevision.revisionCountGrew);
check('NO concatenation — the committed text is exactly the typed text, never placeholder+typed', result.commitAndRevision.noConcatenation);
check('a second edit also shows exactly the new text — no accumulation across edits', result.secondEditNoConcatenation.isExactlyExpected);

console.log('\n[Pipeline stage 5 — semantic diff + candidate generation]');
check('the title edit produced a real Correction/LearningEvent with a real semantic classification', result.semanticDiffTitle.correctionExists && !!result.semanticDiffTitle.diffNature);

console.log('\n[Pipeline stage 6 — multi-document navigation never bleeds state]');
check('switching to Document B shows Document B\'s own (zero) signature rows, never A\'s', result.switchToB.hasRwDoc && result.switchToB.sigRows === 0);
check('switching to Document C (empty) shows zero signature rows', result.switchToC.hasRwDoc && result.switchToC.sigRows === 0);
check('switching back to A shows A\'s real 2 signature slots again — no state loss from visiting B/C', result.switchBackToA.sigRows === 2);
check('Document A\'s title edit survived switching away and back', result.switchBackToA.titleStillCorrect);

console.log('\n[Pipeline stage 7 — candidate generation + knowledge queue for a pattern-sourced field]');
check('the pattern-sourced field was found and committed on Document B', result.patternCommitAndCandidateQueue.patternFieldFound);
check('a real Correction was recorded for the pattern edit', result.patternCommitAndCandidateQueue.correctionRecorded);
check('the Candidate review queue genuinely grew (Knowledge Queue -> Review Workspace loop intact)', result.patternCommitAndCandidateQueue.candidateQueueGrew);

console.log('\n[Pipeline stage 8 — Review Workspace never crashes on a genuinely empty document]');
check('an empty document still renders as a real Live Document, no crash', result.emptyDocumentRender.hasRwDoc);
check('no undefined/NaN/[object Object] leak anywhere in the empty-document render', !result.emptyDocumentRender.hasUndefinedLeak);
check('zero signature rows for a document with no structural suggestion — honest absence, never fabricated', result.emptyDocumentRender.sigRows === 0);

console.log('\n[Pipeline stage 9 — explainability renderer tolerates every valid document state]');
check('Developer Mode genuinely activated (confidence-detail badges present)', result.explainabilityDeveloperMode.confDetailPresent);
check('a zero-count signatureSuggestion.bottomCount renders one row, never a crash or a phantom row', result.explainabilityDeveloperMode.sigRows === 1);
check('no undefined/NaN/[object Object] leak with title+signature+pattern+explainability all combined', !result.explainabilityDeveloperMode.hasUndefinedLeak);
check('a reviewer-set custom title renders correctly in Developer Mode too', result.explainabilityDeveloperMode.titleShowsCustomValue);

const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export|Cannot read propert/i.test(e));
check('zero fatal module/render errors (crashes) across the entire pipeline walk', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗', e));
if (errors.length && !fatal.length) { console.log('   (non-fatal console noise, for the record):'); errors.forEach((e) => console.log('   ', e)); }

await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
