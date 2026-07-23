/* live-document-workspace-check.mjs — Phase 11 Course Correction, real
   browser checks for the two flows the plan's own Verification section
   calls out as needing an actual click-driven proof, not just a Node
   unit test of the underlying functions (composer-foundation-check.mjs,
   section-learning-bridge-check.mjs, section-confidence-engine-check.mjs
   already cover those in isolation):

     1. Inline edit -> Correction/LearningEvent -> confidence color
        update, end to end, via a REAL contenteditable `focusout` commit
        (Workstream 2/3/4/5) — proves review-workspace.js#onFocusOut
        really calls editSection()/recordSectionEdit() and that the very
        next render reflects both the new text and the new confidence
        color, not just that the underlying functions work in isolation.
     2. The single "Terbitkan NOR" button (Workstream 7) across a
        reviewer-only role and an approver role, proving the existing
        governance state machine's rules (no auto-approval, rationale
        required) still hold exactly as before underneath the collapsed
        UI — this is the one place a regression would be most damaging.

   Same credential-free approach as review-workspace-render-check.mjs:
   serve the app statically, `import()` the real modules directly in a
   blank page, never touch js/app.js's Firebase-gated bootstrap.
   Run: node scripts/live-document-workspace-check.mjs   (exit 0 = pass) */
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
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
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

/* ══════════════════════════════════════════════════════════════════════
   Scenario 1 — Inline edit of a pattern-sourced section -> real
   Correction/LearningEvent -> real confidence color change, via an
   actual `focusout` commit (Workstream 2/3/4/5).
   ══════════════════════════════════════════════════════════════════════ */
const page1 = await browser.newPage();
page1.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page1.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page1.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

const inlineEditResult = await page1.evaluate(async () => {
  const { LIFECYCLE_STATE } = await import('/src/knowledge/contracts/lifecycle-contract.js');
  const { generateKnowledgeId } = await import('/src/knowledge/contracts/identity-contract.js');
  const { setActiveRepository, create: repoCreate, getById } = await import('/src/knowledge/repository/knowledge-repository.js');
  const { promoteToCandidate } = await import('/src/knowledge/promotion/promotion-engine.js');
  const { submitForReview, approve } = await import('/src/knowledge/review/review-workflow-engine.js');
  const { listKnowledge } = await import('/src/knowledge/services/knowledge-service.js');
  const { listLearningEvents, LEARNING_KIND } = await import('/src/learning/services/learning-service.js');
  const { createDocument } = await import('/src/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');

  setActiveRepository('memory');

  const now = new Date().toISOString();
  const sourceRef = 'live-doc-inline-1';
  const patternItem = Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'ldwtest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'ldwtest', kind: 'sentence_pattern',
    payload: { template: 'Bersama ini kami sampaikan permohonan pengadaan {{quantity}} {{item}}.', granularity: 'sentence', slots: ['quantity', 'item'] },
    confidence: 0.8, lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: { connectorId: 'ldwtest', sourceRef, capturedAt: now },
    approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
  });
  repoCreate(patternItem);
  promoteToCandidate(patternItem.id);
  submitForReview(patternItem.id);
  approve(patternItem.id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'Seed pattern for live-document-workspace check.' });

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

  const resolvedBefore = 'Bersama ini kami sampaikan permohonan pengadaan 20 kursi.';
  const resolvedAfter = 'Bersama ini kami sampaikan permohonan pengadaan 24 kursi.';
  const field = `pattern:${patternItem.id}`;
  const doc = createDocument('nor', { [field]: resolvedBefore });

  const root = document.createElement('div');
  root.id = 'test-root-inline-edit';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const span = root.querySelector(`[data-field="${CSS.escape(field)}"]`);
  const foundBeforeEdit = !!span;
  const isContentEditable = span?.getAttribute('contenteditable') === 'true';
  const classesBeforeEdit = span ? Array.from(span.classList) : [];

  const correctionsBefore = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  const knowledgeCountBefore = listKnowledge({ domainType: 'nor' }).data.length;

  // A real inline edit: change the rendered text, then let it lose focus
  // (the ONE commit event review-workspace.js#onFocusOut listens for —
  // 'focusout', not 'blur', because it bubbles to the delegated host
  // listener, exactly like a real contenteditable edit in a browser).
  span.textContent = resolvedAfter;
  span.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

  const afterHtml = root.innerHTML;
  const spanAfter = root.querySelector(`[data-field="${CSS.escape(field)}"]`);
  const classesAfterEdit = spanAfter ? Array.from(spanAfter.classList) : [];

  const correctionsAfter = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  const correctionEvent = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.find((e) => e.targetKey === `${doc.documentId}:${field}`);
  const knowledgeAfter = listKnowledge({ domainType: 'nor' }).data;
  const mintedCandidate = knowledgeAfter.find((i) => i.lifecycleState === LIFECYCLE_STATE.CANDIDATE && i.payload?.template === resolvedAfter);
  const originalPatternUntouched = getById(patternItem.id).data.payload.template === patternItem.payload.template;

  return {
    foundBeforeEdit,
    isContentEditable,
    classesBeforeEdit,
    classesAfterEdit,
    showsEditedText: afterHtml.includes(resolvedAfter),
    noLongerShowsOldText: !afterHtml.includes(resolvedBefore),
    correctionRecorded: correctionsAfter === correctionsBefore + 1,
    correctionEventFound: !!correctionEvent,
    correctionAfterFact: correctionEvent ? correctionEvent.after[field] : null,
    knowledgeGrew: knowledgeAfter.length > knowledgeCountBefore,
    mintedCandidateFound: !!mintedCandidate,
    mintedCandidatePreservesSlots: !!mintedCandidate && Array.isArray(mintedCandidate.payload.slots) && mintedCandidate.payload.slots.includes('quantity'),
    originalPatternUntouched,
  };
});

console.log('\n[Live Document Workspace — real inline edit (contenteditable focusout), real browser]');
check('the pattern-sourced section renders as a real .rw-editable span with data-field', inlineEditResult.foundBeforeEdit);
check('the span is genuinely contenteditable (a reviewer with sic.review.act can type into it directly)', inlineEditResult.isContentEditable);
check('BEFORE the edit, the section is confidence-highlighted red (unregistered sourceType, no corroboration — a real, low suggestConfidence())', inlineEditResult.classesBeforeEdit.includes('rw-conf-red'));
check('the visible text updates to the reviewer\'s real edited text', inlineEditResult.showsEditedText);
check('the old resolved text is gone (no stale duplicate rendering)', inlineEditResult.noLongerShowsOldText);
check('AFTER the edit, the SAME section is now confidence-highlighted green (isOverridden -> the human-trust ceiling)', inlineEditResult.classesAfterEdit.includes('rw-conf-green'));
check('a real Correction/LearningEvent audit entry was recorded for this exact edit', inlineEditResult.correctionRecorded && inlineEditResult.correctionEventFound);
check('the recorded Correction carries the real edited fact', inlineEditResult.correctionAfterFact === 'Bersama ini kami sampaikan permohonan pengadaan 24 kursi.');
check('a new Candidate KnowledgeItem was minted from the edit (Workstream 3, signal 2 — a genuine pattern text edit)', inlineEditResult.knowledgeGrew && inlineEditResult.mintedCandidateFound);
check('the minted Candidate preserves the pattern\'s OTHER payload keys (slots) — the section-learning-bridge regression guard, proven end-to-end through the real UI', inlineEditResult.mintedCandidatePreservesSlots);
check('the ORIGINAL Approved pattern is never mutated in place (submitCorrection safety property, proven through the real UI click path)', inlineEditResult.originalPatternUntouched);

/* ══════════════════════════════════════════════════════════════════════
   Scenario 2 — the single "Terbitkan NOR" button, reviewer-only role:
   immediately submits for review, never attempts an approval its role
   cannot legally perform (Workstream 7).
   ══════════════════════════════════════════════════════════════════════ */
const page2 = await browser.newPage();
page2.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page2.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const reviewerOnlyResult = await page2.evaluate(async () => {
  const { createDocument } = await import('/src/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');

  // 'bidang' holds sic.review.act only, not sic.approve.act (role-registry.js).
  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'siti', role: 'bidang' }));

  const doc = createDocument('nor', { subject: 'Pengadaan Proyektor Ruang Rapat (Terbitkan NOR check)' });
  const root = document.createElement('div');
  root.id = 'test-root-publish-reviewer';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const beforeHtml = root.innerHTML;
  const showsButton = beforeHtml.includes('Terbitkan NOR');
  const showsNoRationalePromptYet = !beforeHtml.includes('rw-publish-rationale');

  // Click "Terbitkan NOR" — a reviewer-only user has no approval step to
  // confirm; this must immediately submit for review and stop.
  root.querySelector('[data-act="rw-publish-start"]')?.click();
  const afterFirstClickHtml = root.innerHTML;
  const noRationaleDialogShown = !afterFirstClickHtml.includes('data-act="rw-publish-confirm"');
  const showsAwaitingApprovalHint = afterFirstClickHtml.includes('Sedang menunggu persetujuan');

  // Clicking again must be a genuine no-op (never attempts the approval
  // transition this role cannot legally perform).
  root.querySelector('[data-act="rw-publish-start"]')?.click();
  const afterSecondClickHtml = root.innerHTML;

  const { getDocument } = await import('/src/document-intelligence/composer/composer-store.js');
  return {
    showsButton,
    showsNoRationalePromptYet,
    noRationaleDialogShown,
    showsAwaitingApprovalHint,
    statusAfterFirstClick: getDocument(doc.documentId).status,
    stillNoErrorAfterSecondClick: !afterSecondClickHtml.includes('Anda tidak memiliki izin'),
    documentId: doc.documentId,
  };
});

console.log('\n[Live Document Workspace — "Terbitkan NOR", reviewer-only role, real browser]');
check('a DRAFT document shows the single "Terbitkan NOR" button', reviewerOnlyResult.showsButton);
check('no rationale confirmation is shown before any click', reviewerOnlyResult.showsNoRationalePromptYet);
check('clicking it as a reviewer-only user shows NO rationale confirmation dialog (no approval step to confirm)', reviewerOnlyResult.noRationaleDialogShown);
check('the document is genuinely moved to in_review (real transitionStatus call, not faked)', reviewerOnlyResult.statusAfterFirstClick === 'in_review');
check('the button now explains it is awaiting an approver', reviewerOnlyResult.showsAwaitingApprovalHint);
check('clicking again is a real no-op — never attempts the approval transition this role cannot perform', reviewerOnlyResult.stillNoErrorAfterSecondClick);

/* ══════════════════════════════════════════════════════════════════════
   Scenario 3 — the single "Terbitkan NOR" button, approver role: shows
   ONE rationale confirmation, refuses an empty rationale live (the
   existing RATIONALE_REQUIRED rule still holds, unbypassed), then walks
   draft -> in_review -> approved -> published transparently and archives
   on publish (Workstream 7).
   ══════════════════════════════════════════════════════════════════════ */
const page3 = await browser.newPage();
page3.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page3.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const approverResult = await page3.evaluate(async () => {
  const { createDocument, getDocument } = await import('/src/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');
  const { findArchiveRecord } = await import('/src/organizational-memory/services/archive-service.js');

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

  const doc = createDocument('nor', { subject: 'Pengadaan Kamera Dokumentasi (Terbitkan NOR check)' });
  const root = document.createElement('div');
  root.id = 'test-root-publish-approver';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  // Click "Terbitkan NOR" — an approver sees ONE rationale confirmation.
  root.querySelector('[data-act="rw-publish-start"]')?.click();
  const showsRationaleInput = !!root.querySelector('[data-act="rw-publish-rationale"]');
  const showsConfirmButton = !!root.querySelector('[data-act="rw-publish-confirm"]');

  // Confirm with an EMPTY rationale — must be refused live, exactly as
  // the existing RATIONALE_REQUIRED rule already enforces for the old
  // multi-button panel; this handler must not bypass it.
  root.querySelector('[data-act="rw-publish-confirm"]')?.click();
  const afterEmptyConfirmHtml = root.innerHTML;
  const blockedByEmptyRationale = afterEmptyConfirmHtml.includes('Alasan/rasional diperlukan')
    && getDocument(doc.documentId).status === 'draft'; // no transition happened at all yet

  // Type a real rationale, then confirm for real.
  const rationaleInput = root.querySelector('[data-act="rw-publish-rationale"]');
  rationaleInput.value = 'Sesuai kebutuhan dokumentasi kegiatan, disetujui untuk diterbitkan.';
  rationaleInput.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector('[data-act="rw-publish-confirm"]')?.click();

  const afterPublishHtml = root.innerHTML;
  const archiveRecord = findArchiveRecord(`composer-archive:${doc.documentId}`);
  const { getReviewHistory } = await import('/src/document-intelligence/composer/composer-store.js');
  const history = getReviewHistory(doc.documentId);

  return {
    showsRationaleInput,
    showsConfirmButton,
    blockedByEmptyRationale,
    finalStatus: getDocument(doc.documentId).status,
    showsPublishedStatus: afterPublishHtml.includes('Sudah diterbitkan'),
    showsSatisfactionPrompt: afterPublishHtml.includes('Seberapa puas Anda'),
    archiveRecordCreated: archiveRecord.ok === true,
    archiveRecordSourceId: archiveRecord.ok ? archiveRecord.data.sourceId : null,
    documentId: doc.documentId,
    // The existing state machine underneath must have taken EVERY real
    // intermediate step (draft -> in_review -> approved -> published),
    // never a shortcut straight to published.
    fullTransitionHistory: history.map((r) => `${r.fromState}->${r.toState}`),
    approvalCarriesTheRealRationale: history.some((r) => r.toState === 'approved' && r.preferenceRationale === 'Sesuai kebutuhan dokumentasi kegiatan, disetujui untuk diterbitkan.'),
  };
});

console.log('\n[Live Document Workspace — "Terbitkan NOR", approver role, real browser]');
check('clicking "Terbitkan NOR" as an approver shows a rationale input and a confirm button', approverResult.showsRationaleInput && approverResult.showsConfirmButton);
check('confirming with an EMPTY rationale is refused live, and NO transition happens at all (RATIONALE_REQUIRED, unbypassed)', approverResult.blockedByEmptyRationale);
check('after a real rationale, the document reaches "published" (the full sequence completed)', approverResult.finalStatus === 'published');
check('the UI reflects the published state', approverResult.showsPublishedStatus);
check('the satisfaction prompt appears right after a real publish (Sprint 10.7, unchanged)', approverResult.showsSatisfactionPrompt);
check('a real ArchiveRecord was created on publish (archiveOnPublish, the same write the old "Terbitkan" button made)', approverResult.archiveRecordCreated);
check('the ArchiveRecord references the real ComposerDocument', approverResult.archiveRecordSourceId === approverResult.documentId);
check('the underlying state machine took EVERY real intermediate step — draft->in_review->approved->published, never a shortcut', approverResult.fullTransitionHistory.includes('draft->in_review')
  && approverResult.fullTransitionHistory.includes('in_review->approved') && approverResult.fullTransitionHistory.includes('approved->published'));
check('the approval transition genuinely carries the reviewer\'s typed rationale (not a null/faked one)', approverResult.approvalCarriesTheRealRationale);

/* ══════════════════════════════════════════════════════════════════════
   Scenario 4 — NEEDS_REVISION relabels the button "Ajukan Ulang" and
   reuses the existing needs_revision -> in_review transition.
   ══════════════════════════════════════════════════════════════════════ */
const page4 = await browser.newPage();
page4.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page4.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const needsRevisionResult = await page4.evaluate(async () => {
  const { createDocument, transitionStatus, getDocument } = await import('/src/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'siti', role: 'bidang' }));

  const doc = createDocument('nor', { subject: 'Pengadaan Tinta Printer (needs_revision check)' });
  transitionStatus(doc.documentId, 'in_review', { actorId: 'evan' });
  transitionStatus(doc.documentId, 'needs_revision', { actorId: 'evan', rationale: 'Perlu detail justifikasi tambahan.' });

  const root = document.createElement('div');
  root.id = 'test-root-needs-revision';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const html = root.innerHTML;
  const showsRelabeledButton = html.includes('Ajukan Ulang');
  const showsHint = html.includes('Perlu direvisi sebelum diterbitkan');

  root.querySelector('[data-act="rw-publish-start"]')?.click();

  return {
    showsRelabeledButton,
    showsHint,
    statusAfterResubmit: getDocument(doc.documentId).status,
  };
});

console.log('\n[Live Document Workspace — NEEDS_REVISION relabeling, real browser]');
check('a NEEDS_REVISION document shows "Ajukan Ulang" instead of "Terbitkan NOR"', needsRevisionResult.showsRelabeledButton);
check('shows the "perlu direvisi" hint', needsRevisionResult.showsHint);
check('clicking it reuses the existing needs_revision -> in_review transition', needsRevisionResult.statusAfterResubmit === 'in_review');

/* ══════════════════════════════════════════════════════════════════════
   Scenario 5 — Sprint 11.6 (Reviewer Experience): Enter commits a field
   without needing to click away, Escape discards an in-progress edit, and
   a real "Tersimpan" confirmation appears after a real commit.
   ══════════════════════════════════════════════════════════════════════ */
const page5 = await browser.newPage();
page5.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page5.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const keyboardResult = await page5.evaluate(async () => {
  const { createDocument } = await import('/src/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');
  const { listLearningEvents, LEARNING_KIND } = await import('/src/learning/services/learning-service.js');

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

  const doc = createDocument('nor', { subject: 'Pengadaan Kabel HDMI (keyboard check)' });
  const root = document.createElement('div');
  root.id = 'test-root-keyboard';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const field = 'subject';
  let span = root.querySelector(`[data-field="${field}"]`);

  // No edit has happened yet — the always-on neutral status.
  const statusBeforeEdit = root.querySelector('.rw-save-status')?.textContent.trim();

  // Enter commits — the SAME onFocusOut path a real blur would take, fired
  // via a real KeyboardEvent, never a direct function call.
  span.focus();
  span.textContent = 'Pengadaan Kabel HDMI (revisi Enter)';
  const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  span.dispatchEvent(enterEvent);

  const correctionsAfterEnter = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;
  const statusAfterEnter = root.querySelector('.rw-save-status')?.textContent.trim();
  const statusIsActive = !!root.querySelector('.rw-save-status--active');
  const enterWasDefaultPrevented = enterEvent.defaultPrevented;

  // Escape discards — type something new, then Escape before ever losing focus.
  span = root.querySelector(`[data-field="${field}"]`);
  const valueBeforeEscape = span.textContent;
  span.focus();
  span.textContent = 'Teks yang seharusnya dibatalkan';
  const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  span.dispatchEvent(escapeEvent);

  const spanAfterEscape = root.querySelector(`[data-field="${field}"]`);
  const correctionsAfterEscape = listLearningEvents({ kind: LEARNING_KIND.CORRECTION }).data.length;

  return {
    statusBeforeEdit,
    correctionRecordedByEnter: correctionsAfterEnter === 1,
    statusAfterEnter,
    statusIsActive,
    enterWasDefaultPrevented,
    textRevertedByEscape: spanAfterEscape.textContent.trim() === valueBeforeEscape.trim(),
    noNewCorrectionFromEscape: correctionsAfterEscape === correctionsAfterEnter,
  };
});

console.log('\n[Live Document Workspace — Sprint 11.6 keyboard + save-status, real browser]');
check('before any edit, a neutral "Tersimpan otomatis" status is already shown (Google Docs-style, always-on)', keyboardResult.statusBeforeEdit === 'Tersimpan otomatis');
check('pressing Enter (no Shift) commits the field — a real Correction was recorded', keyboardResult.correctionRecordedByEnter);
check('Enter was preventDefault()-ed (no literal newline inserted into the field)', keyboardResult.enterWasDefaultPrevented);
check('right after the commit, the active "✓ Tersimpan" status is shown', keyboardResult.statusAfterEnter === '✓ Tersimpan' && keyboardResult.statusIsActive);
check('pressing Escape reverts the field to its original text before blurring', keyboardResult.textRevertedByEscape);
check('...so no new Correction is recorded for the discarded edit', keyboardResult.noNewCorrectionFromEscape);

/* ══════════════════════════════════════════════════════════════════════
   Scenario 6 — Sprint 11.10: the document title is genuinely click-to-edit
   (never static text), and a real visual signature area renders from
   nor-generator.js's real suggested signatory counts — real browser.
   ══════════════════════════════════════════════════════════════════════ */
const page6 = await browser.newPage();
page6.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page6.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const titleAndSignatureResult = await page6.evaluate(async () => {
  const { createDocument } = await import('/src/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');
  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

  // Real suggested signatory counts, the exact same shape nor-composer.js
  // writes when computeNorStructuralStats() has real Approved structural
  // Knowledge to average from.
  const doc = createDocument('nor', {
    subject: 'Pengadaan Proyektor (title/signature check)',
    suggestedSignatoryTopCount: 2,
    suggestedSignatoryBottomCount: 1,
  });
  const root = document.createElement('div');
  root.id = 'test-root-title-signature';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const titleSpan = root.querySelector('.rw-doc-title');
  // The placeholder is a CSS ::before (content:attr(data-placeholder)),
  // never real textContent — checking the attribute directly, the same
  // lesson this session's own UAT gap-closure already established for
  // every other empty field.
  const placeholderAttr = titleSpan ? titleSpan.getAttribute('data-placeholder') : null;
  const beforeTextIsEmpty = titleSpan ? titleSpan.textContent.trim() === '' : false;
  const isEditable = titleSpan && titleSpan.getAttribute('contenteditable') === 'true';
  const hasDataField = titleSpan && titleSpan.hasAttribute('data-new-field') && titleSpan.getAttribute('data-new-field') === 'documentTitle';

  // A real inline edit of the title, via the same focusout commit path
  // every other field already uses.
  titleSpan.textContent = 'Nota Dinas Internal';
  titleSpan.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

  const titleAfterEdit = root.querySelector('.rw-doc-title')?.textContent.trim();

  const sigRows = root.querySelectorAll('.rw-sig-row');
  const sigSlotsRow1 = sigRows[0] ? sigRows[0].querySelectorAll('.rw-sig-slot').length : 0;
  const sigSlotsRow2 = sigRows[1] ? sigRows[1].querySelectorAll('.rw-sig-slot').length : 0;
  const noRawCountLeaked = !root.innerHTML.includes('Suggested Signatory Top Count') && !root.innerHTML.includes('suggestedSignatoryTopCount');

  return {
    placeholderAttr, beforeTextIsEmpty, isEditable, hasDataField, titleAfterEdit,
    sigAreaFound: sigRows.length === 2,
    sigSlotsRow1, sigSlotsRow2, noRawCountLeaked,
  };
});

console.log('\n[Live Document Workspace — Sprint 11.10 title editing + real visual signature area, real browser]');
check('the document title shows the real default placeholder ("Nota Organisasi") before any override', titleAndSignatureResult.placeholderAttr === 'Nota Organisasi');
check('the field itself is genuinely empty (not pre-filled with the placeholder text) until a reviewer types', titleAndSignatureResult.beforeTextIsEmpty === true);
check('the title is genuinely contenteditable — not static text', titleAndSignatureResult.isEditable === true);
check('the title is wired to the real documentTitle field (same commit path as every other field)', titleAndSignatureResult.hasDataField === true);
check('editing the title and losing focus commits the real override', titleAndSignatureResult.titleAfterEdit === 'Nota Dinas Internal');
check('a real visual signature area renders (2 rows: top + bottom)', titleAndSignatureResult.sigAreaFound === true);
check('the top row shows exactly 2 signature slots (the real suggested count)', titleAndSignatureResult.sigSlotsRow1 === 2);
check('the bottom row shows exactly 1 signature slot (the real suggested count)', titleAndSignatureResult.sigSlotsRow2 === 1);
check('the raw numeric suggestedSignatoryTopCount/BottomCount never leaks as a visible field anywhere in Normal Mode', titleAndSignatureResult.noRawCountLeaked);

const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e));
check('zero fatal module/render errors across every scenario', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗', e));

await page1.close();
await page2.close();
await page3.close();
await page4.close();
await page5.close();
await page6.close();
await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
