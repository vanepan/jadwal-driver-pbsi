/* review-workspace-render-check.mjs — Phase 10, Sprint 10.1 (+ Sprint 10.2
   Explainability): a real browser render check for
   js/v2/ui/review-workspace.js.

   WHY THIS EXISTS, AND WHY IT'S NOT smoke-boot.mjs: composer-foundation-
   check.mjs (Node) proves the DATA layer is correct, but never touches the
   DOM — it cannot catch a wrong CSS class, a broken data-act wire-up, or a
   render function throwing. smoke-boot.mjs proves the app boots, but
   Review Workspace sits behind js/app.js's real Firebase login gate (see
   docs/... project memory: "no *-store/*-service.js is Node-testable or
   safely browser-loginable without real admin creds") — this environment
   has no production credentials, so driving the actual Settings -> Power
   View -> Review Workspace click path is not possible here.

   What IS possible, and what this script does: serve the app statically
   (same idiom as smoke-boot.mjs), load a blank page in real headless
   Chromium, and `import()` composer-store.js + review-workspace.js
   DIRECTLY — bypassing js/app.js's bootstrap and its Firebase gate
   entirely. Neither module touches Firebase unless
   initComposerDocumentSync() is explicitly called (never is, here), so
   this is a legitimate, credential-free way to prove the real render
   function produces the real DOM a reviewer would see, using an in-memory
   test document — not a mock of the render function, the actual function.

   Run: node scripts/review-workspace-render-check.mjs   (exit 0 = pass) */
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
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

// A blank same-origin page (NOT index.html — no app.js bootstrap, no
// Firebase gate) so relative ES module imports below resolve against the
// static server's origin.
await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  const { createDocument, editSection } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  // A real signed-in session — this scenario now also asserts the single
  // "Terbitkan NOR" button renders, which requires real publish authority
  // (Sprint 10.5's role gate is exercised on its own in scenario 5; this
  // scenario is not testing permission denial).
  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

  // A real ComposerDocument, same shape nor-composer.js#composeNorDocument
  // produces — human-supplied test values, nothing fabricated by the
  // render layer itself.
  const doc = createDocument('nor', {
    subject: 'Pengadaan ATK Kantor',
    purpose: 'Kebutuhan operasional bulan Juli',
    total: 750000,
  });
  editSection(doc.documentId, 'subject', 'Pengadaan ATK Kantor (revisi)', 'evan');

  const root = document.createElement('div');
  root.id = 'test-root';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);

  // Select the document (same click a reviewer would make on the row).
  const row = root.querySelector('[data-act="rw-doc-row"]');
  row?.click();

  const html = root.innerHTML;
  // The raw documentId legitimately appears in `data-id="..."` wiring
  // attributes regardless of mode (every workspace in this codebase does
  // this — it is not user-visible text). What Normal Mode must hide is the
  // raw id as a VISIBLE LABEL — so check rendered text content, not markup.
  // textContent (not innerText): innerText requires a completed layout
  // pass and was observed to flake intermittently in this session's own
  // headless runs; textContent reads the DOM synchronously and proves the
  // same thing (no hidden elements exist in this subtree to distinguish).
  const visibleText = root.textContent;
  return {
    documentId: doc.documentId,
    hasRootClass: document.body.querySelector('.wlk-root') !== null,
    listedRow: html.includes('v1') || html.includes('v2'),
    // Phase 11 Course Correction, Workstream 1/6 — Normal Mode's default
    // is now renderLiveDocument(), not the old field-list Draft Preview:
    // the same real values must still surface, as real document prose/
    // detail-list text, not a raw field/value row.
    showsSubjectValue: html.includes('Pengadaan ATK Kantor (revisi)'),
    showsPurposeValue: html.includes('Kebutuhan operasional bulan Juli'),
    showsTotalValue: html.includes('750000'),
    showsMetadataLabel: html.includes('Metadata'),
    showsStatusLabel: html.includes('Draf'),
    // Riwayat Versi (the diff table) is now Developer-Mode-only — see the
    // dedicated Developer Mode scenario (page1b) below, not asserted here.
    noRawDocumentIdInNormalMode: !visibleText.includes(doc.documentId),
    // Workstream 7 — Normal Mode shows the single "Terbitkan NOR" action,
    // never the old multi-button governance panel.
    showsSinglePublishAction: html.includes('Terbitkan NOR'),
    noOldGovernancePanel: !html.includes('data-act="rw-gov-submit"'),
  };
});

console.log('\n[Review Workspace — Normal Mode, real browser: Live Document Workspace is the default (Phase 11 Course Correction)]');
check('mounted host gains .wlk-root (workspace-list-kit CSS scope)', result.hasRootClass);
check('the document row renders', result.listedRow);
check('the Live Document view shows the REAL, human-edited subject value (the Sprint 9.8 gap fix, still true under the new UX)', result.showsSubjectValue);
check('the Live Document view shows the purpose field value', result.showsPurposeValue);
check('the Live Document view shows the total field value', result.showsTotalValue);
check('Metadata panel renders', result.showsMetadataLabel);
check('Status indicator shows the friendly label ("Draf"), not the raw enum', result.showsStatusLabel);
check('Normal Mode hides the raw documentId (no internal id leak)', result.noRawDocumentIdInNormalMode);
check('Normal Mode shows the single "Terbitkan NOR" publish action (Workstream 7)', result.showsSinglePublishAction);
check('Normal Mode never renders the old multi-button governance panel', result.noOldGovernancePanel);

// Phase 11 Course Correction, Workstream 6/7 — Developer Mode keeps the
// OLD field-list Draft Preview, Riwayat Versi diff table, and the full
// multi-button governance panel fully functional (deliverable 7: "Keep
// Developer Mode fully functional"). A FRESH page/module registry, same
// reason scenario 2 (Explainability) already documents below: review-
// workspace.js's `host`/`mounted`/`st` are module-level singletons — a
// second mount reusing the FIRST page's already-mounted registry raced
// against that page's own pending change-notification re-renders in
// practice (an intermittent flake actually observed in this session's
// own full regression run), not just a theoretical risk.
const page1b = await browser.newPage();
page1b.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page1b.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const devModeResult = await page1b.evaluate(async () => {
  const { createDocument, editSection } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));
  localStorage.setItem('sarpras.presentationMode', 'developer');

  const doc = createDocument('nor', {
    subject: 'Pengadaan ATK Kantor',
    purpose: 'Kebutuhan operasional bulan Juli',
    total: 750000,
  });
  editSection(doc.documentId, 'subject', 'Pengadaan ATK Kantor (revisi)', 'evan');

  const root = document.createElement('div');
  root.id = 'test-root-dev-mode';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const html = root.innerHTML;
  return {
    showsRawDocumentId: root.textContent.includes(doc.documentId), // textContent, not innerText — see page1's own comment on why
    showsDraftPreviewFieldRow: html.includes('data-act="rw-edit-start"') && html.includes('>subject<'),
    showsVersionHistory: html.includes('Riwayat Versi') && html.includes('Versi 1') && html.includes('Versi 2'),
    showsEditedBy: html.includes('oleh evan'),
    showsFullGovernancePanel: html.includes('data-act="rw-gov-submit"'),
  };
});

console.log('\n[Review Workspace — Developer Mode, real browser: old surfaces stay fully functional (deliverable 7)]');
check('Developer Mode shows the raw documentId', devModeResult.showsRawDocumentId);
check('Developer Mode still renders the old field-list Draft Preview row', devModeResult.showsDraftPreviewFieldRow);
check('Developer Mode still shows Version History (both revisions)', devModeResult.showsVersionHistory);
check('Developer Mode still attributes a human edit to its real editor', devModeResult.showsEditedBy);
check('Developer Mode still shows the full multi-button governance panel', devModeResult.showsFullGovernancePanel);

// Phase 10, Sprint 10.2 — Explainability, Developer Mode only. A FRESH
// page/module registry (review-workspace.js's `host`/`mounted`/`st` are
// module-level singletons, correctly designed for "one real mount per app
// session" — reusing the first page here would clash with scenario 1's
// already-mounted state, an artifact of THIS test script, not a real
// product bug). Attaches a real explainability bundle (same shape
// problem-solving-service.js#composeApprovedNor produces) and flips the
// SAME localStorage flag sarpras-intelligence-center.js's own mode-bar
// toggle writes.
const page2 = await browser.newPage();
page2.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page2.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const explainResult = await page2.evaluate(async () => {
  const { createDocument, attachExplainability } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  const doc = createDocument('nor', { subject: 'Pengadaan Meja Ruang Binpres' });
  attachExplainability(doc.documentId, {
    conversationId: 'conversation:test:explainability',
    unresolvedFields: ['traveler'],
    citedKnowledgeIds: [],
    explanation: [],
    renderingRulesConsidered: [],
    reasoningConsidered: { ok: true, claim: 'Pengadaan requires itemized justification.', citedRuleIds: [], confidence: 0.75, confidenceBasis: 'rule-match', conflicts: [] },
  });

  localStorage.setItem('sarpras.presentationMode', 'developer');

  const root = document.createElement('div');
  root.id = 'test-root-explainability';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  // Multiple documents exist by this point (module state persists across
  // this script's two page.evaluate() calls, same page) — select THIS
  // scenario's document specifically, not just "the first row".
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const html = root.innerHTML;
  return {
    showsUnknownFacts: html.includes('Unknown Facts') && html.includes('traveler'),
    showsConfidence: html.includes('Confidence') && html.includes('75%') && html.includes('Pengadaan requires itemized justification.'),
    showsReasoningBasis: html.includes('rule-match'),
  };
});

console.log('\n[Review Workspace — Explainability (Sprint 10.2), Developer Mode, real browser]');
check('Unknown Facts section shows the real unresolvedFields entry', explainResult.showsUnknownFacts);
check('Confidence section shows the real reasoningConsidered claim + confidence %', explainResult.showsConfidence);
check('Confidence section shows the real confidenceBasis', explainResult.showsReasoningBasis);

// Phase 10, Sprint 10.3 — Document Editor. Drives the ACTUAL click-to-edit
// UI flow (click "Ubah" -> type into the real <input> -> click "Simpan"),
// not a direct editSection() call — this is the first real caller
// composer-store.js#editSection ever had, and this is the test that
// proves the CLICK PATH works, not just the underlying store function
// (composer-foundation-check.mjs already covers that in isolation).
const page3 = await browser.newPage();
page3.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page3.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const editResult = await page3.evaluate(async () => {
  const { createDocument } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  // Phase 10, Sprint 10.5 — the "Ubah" button now requires sic.review.act,
  // real capability-gated, not just rendered unconditionally.
  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));
  // Phase 11 Course Correction, Workstream 6 — this old field-list "Ubah"
  // click-to-edit flow is now Developer-Mode-only (Normal Mode's own
  // inline-edit flow is covered by live-document-workspace-check.mjs).
  // Set here to prove Developer Mode keeps this real, unmodified.
  localStorage.setItem('sarpras.presentationMode', 'developer');

  const doc = createDocument('nor', { subject: 'Pengadaan Kursi Rapat' });

  const root = document.createElement('div');
  root.id = 'test-root-editor';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  const beforeEditHtml = root.innerHTML;
  const beforeAttribution = beforeEditHtml.includes('Disusun AI');

  // Click "Ubah" on the 'subject' row.
  root.querySelector('[data-act="rw-edit-start"][data-field="subject"]')?.click();
  const editingInputExists = !!root.querySelector('[data-act="rw-edit-value"]');

  // Type a real human correction into the real <input>, firing a real
  // 'input' event (review-workspace.js's onInput reads el.value from it).
  const input = root.querySelector('[data-act="rw-edit-value"]');
  input.value = 'Pengadaan Kursi Rapat (direvisi reviewer)';
  input.dispatchEvent(new Event('input', { bubbles: true }));

  // Click "Simpan".
  root.querySelector('[data-act="rw-edit-save"]')?.click();

  const afterHtml = root.innerHTML;
  return {
    editingInputExists,
    editorClosedAfterSave: !root.querySelector('[data-act="rw-edit-value"]'),
    showsEditedValue: afterHtml.includes('Pengadaan Kursi Rapat (direvisi reviewer)'),
    showsRealAttribution: afterHtml.includes('Diedit oleh evan'),
    beforeAttribution,
  };
});

console.log('\n[Review Workspace — Document Editor (Sprint 10.3), real click-to-edit flow, real browser]');
check('clicking "Ubah" opens a real editable <input> for that field', editResult.editingInputExists);
check('before any edit, the section is honestly attributed "Disusun AI"', editResult.beforeAttribution);
check('clicking "Simpan" closes the editor', editResult.editorClosedAfterSave);
check('the Draft Preview now shows the REAL human-typed value (editSection\'s first real UI caller)', editResult.showsEditedValue);
check('the section is now attributed to its real human editor, not "Disusun AI"', editResult.showsRealAttribution);

// Phase 10, Sprint 10.4 — Review Workflow. Drives the ACTUAL governance
// click flow: submit for review, attempt to approve with a BLANK
// rationale (must be refused, "No automatic approval" enforced live, not
// just asserted from reading transitionStatus()), then approve for real
// with a typed rationale, and confirm the status label + Riwayat
// Keputusan both reflect it.
const page4 = await browser.newPage();
page4.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page4.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const govResult = await page4.evaluate(async () => {
  const { createDocument } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  // Phase 10, Sprint 10.5 — a DIFFERENT username than every other scenario
  // in this file ('budi', not the old hardcoded 'evan') — proves real
  // session identity flows through to transitionStatus()/Riwayat
  // Keputusan, not a coincidental match against a leftover constant.
  // 'admin' role satisfies BOTH sic.review.act and sic.approve.act, so
  // this scenario still exercises the full submit -> approve flow.
  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'budi', role: 'admin' }));
  // Phase 11 Course Correction, Workstream 6/7 — the old multi-button
  // governance panel is now Developer-Mode-only (Normal Mode's single
  // "Terbitkan NOR" flow is covered by live-document-workspace-check.mjs).
  localStorage.setItem('sarpras.presentationMode', 'developer');

  const doc = createDocument('nor', { subject: 'Pengadaan Papan Tulis' });

  const root = document.createElement('div');
  root.id = 'test-root-governance';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  const selectRow = () => root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();
  selectRow();

  const draftShowsSubmitButton = !!root.querySelector('[data-act="rw-gov-submit"]');

  root.querySelector('[data-act="rw-gov-submit"]')?.click();
  const inReviewShowsApproveButton = !!root.querySelector('[data-act="rw-gov-approve"]');

  // Click "Setujui" with a BLANK rationale — must be refused.
  root.querySelector('[data-act="rw-gov-approve"]')?.click();
  const blockedByBlankRationale = root.innerHTML.includes('alasan/rasional keputusan')
    && root.querySelector('[data-act="rw-gov-approve"]') !== null; // still in_review, button still offered

  // Type a real rationale into the real <input>, then approve for real.
  const noteInput = root.querySelector('[data-act="rw-gov-note"]');
  noteInput.value = 'Sesuai anggaran dan kebutuhan operasional.';
  noteInput.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector('[data-act="rw-gov-approve"]')?.click();

  const afterHtml = root.innerHTML;
  return {
    draftShowsSubmitButton,
    inReviewShowsApproveButton,
    blockedByBlankRationale,
    nowShowsApprovedStatus: afterHtml.includes('Disetujui'),
    noApprovalButtonsLeft: !root.querySelector('[data-act="rw-gov-approve"]'),
    showsDecisionHistory: afterHtml.includes('Riwayat Keputusan') && afterHtml.includes('Sesuai anggaran dan kebutuhan operasional.'),
    showsRealApproverIdentity: afterHtml.includes('oleh budi'),
  };
});

console.log('\n[Review Workspace — Review Workflow (Sprint 10.4), real governance click flow, real browser]');
check('a DRAFT document shows "Ajukan untuk Ditinjau"', govResult.draftShowsSubmitButton);
check('after submitting, an IN_REVIEW document shows "Setujui"', govResult.inReviewShowsApproveButton);
check('clicking "Setujui" with a blank rationale is refused live ("No automatic approval")', govResult.blockedByBlankRationale);
check('after typing a real rationale, "Setujui" succeeds and the status becomes "Disetujui"', govResult.nowShowsApprovedStatus);
check('once approved, no further in-review governance buttons remain', govResult.noApprovalButtonsLeft);
check('Riwayat Keputusan shows the real decision with its real rationale', govResult.showsDecisionHistory);
check('Riwayat Keputusan attributes the decision to the REAL signed-in session ("budi"), not a hardcoded placeholder (Sprint 10.5)', govResult.showsRealApproverIdentity);

// Phase 10, Sprint 10.5 — role gating is "hide, don't disable": a role
// with neither sic.review.act nor sic.approve.act must see NO edit/
// governance buttons at all on the SAME document an admin sees full
// controls for. Two fresh pages (module-level `st.selectedId` etc. would
// otherwise carry over) so each session is genuinely isolated.
const page5a = await browser.newPage();
page5a.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page5a.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const unprivilegedResult = await page5a.evaluate(async () => {
  const { createDocument } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  // 'driver' holds neither sic.review.act nor sic.approve.act.
  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'sopir1', role: 'driver' }));
  // Phase 11 Course Correction, Workstream 6 — "Ubah"/"Ajukan untuk
  // Ditinjau" are the old field-list/governance-panel buttons, now
  // Developer-Mode-only; role gating itself is unchanged and still real.
  localStorage.setItem('sarpras.presentationMode', 'developer');

  const doc = createDocument('nor', { subject: 'Pengadaan Spidol Whiteboard' });
  const root = document.createElement('div');
  root.id = 'test-root-unprivileged';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  return {
    noEditButton: !root.querySelector('[data-act="rw-edit-start"]'),
    noSubmitButton: !root.querySelector('[data-act="rw-gov-submit"]'),
  };
});

const page5b = await browser.newPage();
page5b.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page5b.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const privilegedResult = await page5b.evaluate(async () => {
  const { createDocument } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));
  localStorage.setItem('sarpras.presentationMode', 'developer');

  const doc = createDocument('nor', { subject: 'Pengadaan Spidol Whiteboard' });
  const root = document.createElement('div');
  root.id = 'test-root-privileged';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

  return {
    hasEditButton: !!root.querySelector('[data-act="rw-edit-start"]'),
    hasSubmitButton: !!root.querySelector('[data-act="rw-gov-submit"]'),
  };
});

console.log('\n[Review Workspace — Approval Workflow role gating (Sprint 10.5), real browser]');
check('a role with neither capability (driver) sees NO "Ubah" edit button', unprivilegedResult.noEditButton);
check('a role with neither capability (driver) sees NO "Ajukan untuk Ditinjau" button', unprivilegedResult.noSubmitButton);
check('an admin, on the SAME document shape, DOES see the "Ubah" edit button', privilegedResult.hasEditButton);
check('an admin, on the SAME document shape, DOES see "Ajukan untuk Ditinjau"', privilegedResult.hasSubmitButton);

// Phase 10, Sprint 10.6 — Export & Publishing. Real network calls to the
// SAME CDNs pdfmake/html-docx-js are already served from in production
// (this environment's own reachability to both was verified directly
// before committing to the docx-exporter.js approach — see that file's
// own header). Drives a document all the way to APPROVED, then the
// actual "Unduh PDF" / "Unduh Word" / "Terbitkan" click flow.
const page6 = await browser.newPage();
page6.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page6.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const exportResult = await page6.evaluate(async () => {
  const { createDocument } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { mountReviewWorkspace } = await import('/js/v2/ui/review-workspace.js');
  const { findArchiveRecord } = await import('/js/v2/organizational-memory/services/archive-service.js');

  localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));
  // Phase 11 Course Correction, Workstream 6/7 — "Unduh PDF"/"Unduh Word"/
  // "Terbitkan" live inside the old governance panel, now Developer-Mode-
  // only (Normal Mode's single "Terbitkan NOR" publish flow, which also
  // calls the SAME archiveOnPublish()/export machinery, is covered by
  // live-document-workspace-check.mjs).
  localStorage.setItem('sarpras.presentationMode', 'developer');

  const doc = createDocument('nor', { subject: 'Pengadaan Kabel HDMI', total: 250000 });

  const root = document.createElement('div');
  root.id = 'test-root-export';
  document.body.appendChild(root);
  await mountReviewWorkspace(root);
  const select = () => root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();
  select();

  // Draft -> In Review -> Approved (real click flow, same as Sprint 10.4's
  // own scenario).
  root.querySelector('[data-act="rw-gov-submit"]')?.click();
  const noteInput = root.querySelector('[data-act="rw-gov-note"]');
  noteInput.value = 'Disetujui untuk pengujian ekspor.';
  noteInput.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector('[data-act="rw-gov-approve"]')?.click();

  const approvedHtml = root.innerHTML;
  const showsExportButtons = approvedHtml.includes('Unduh PDF') && approvedHtml.includes('Unduh Word');

  // "Unduh PDF" — real pdfmake CDN load + real PDF blob + the real
  // document-viewer.js modal actually opening. Poll for it (async chain).
  root.querySelector('[data-act="rw-export-pdf"]')?.click();
  const viewerOpened = await new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      if (document.querySelector('.docv-overlay.open')) { resolve(true); return; }
      if (Date.now() - start > 15000) { resolve(false); return; }
      setTimeout(poll, 200);
    };
    poll();
  });
  const viewerTitle = document.querySelector('.docv-title')?.textContent || '';
  document.querySelector('.docv-x')?.click(); // close the viewer

  // "Unduh Word (.docx)" — real html-docx-js CDN load + real .docx blob.
  // No error line and the button re-enables once the async chain settles.
  root.querySelector('[data-act="rw-export-docx"]')?.click();
  await new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      const busy = root.querySelector('[data-act="rw-export-docx"]')?.disabled;
      if (!busy) { resolve(); return; }
      if (Date.now() - start > 15000) { resolve(); return; }
      setTimeout(poll, 200);
    };
    poll();
  });
  const docxHtml = root.innerHTML;
  const docxSucceededNoError = !docxHtml.includes('Ekspor gagal');

  // "Terbitkan" — real transitionStatus(PUBLISHED) + real archiveDocument().
  root.querySelector('[data-act="rw-gov-publish"]')?.click();
  const publishedHtml = root.innerHTML;
  const archiveRecord = findArchiveRecord(`composer-archive:${doc.documentId}`);

  // Phase 10, Sprint 10.7 — the satisfaction prompt appears right after a
  // real publish; clicking a rating records it AND dismisses the prompt.
  const { listSatisfactionRatings } = await import('/js/v2/document-intelligence/composer/satisfaction-log.js');
  const showsSatisfactionPrompt = publishedHtml.includes('Seberapa puas Anda');
  root.querySelector('[data-act="rw-rate-satisfaction"][data-rating="4"]')?.click();
  const afterRatingHtml = root.innerHTML;
  const promptDismissedAfterRating = !afterRatingHtml.includes('Seberapa puas Anda');
  const realRatings = listSatisfactionRatings(doc.documentId);

  return {
    showsExportButtons,
    viewerOpened,
    viewerTitleMatchesDocument: viewerTitle.includes(doc.documentId),
    docxSucceededNoError,
    nowShowsPublished: publishedHtml.includes('Diterbitkan'),
    archiveRecordCreated: archiveRecord.ok === true,
    archiveRecordSourceId: archiveRecord.ok ? archiveRecord.data.sourceId : null,
    archiveRecordArchivedBy: archiveRecord.ok ? archiveRecord.data.archivedBy : null,
    documentId: doc.documentId,
    showsSatisfactionPrompt,
    promptDismissedAfterRating,
    ratingRecorded: realRatings.length === 1 && realRatings[0].rating === 4,
  };
});

console.log('\n[Review Workspace — Export & Publishing (Sprint 10.6), real CDN loads, real browser]');
check('an APPROVED document shows "Unduh PDF" and "Unduh Word" buttons', exportResult.showsExportButtons);
check('clicking "Unduh PDF" produces a real PDF (document-viewer.js modal actually opens)', exportResult.viewerOpened);
check('the opened viewer is titled with the real documentId', exportResult.viewerTitleMatchesDocument);
check('clicking "Unduh Word (.docx)" completes with no export error (real html-docx-js CDN load + real blob)', exportResult.docxSucceededNoError);
check('clicking "Terbitkan" flips the status to "Diterbitkan"', exportResult.nowShowsPublished);
check('"Terbitkan" creates a real ArchiveRecord (archive-on-publish)', exportResult.archiveRecordCreated);
check('the ArchiveRecord references the real ComposerDocument as its source', exportResult.archiveRecordSourceId === exportResult.documentId);
check('the ArchiveRecord is attributed to the real signed-in actor', exportResult.archiveRecordArchivedBy === 'evan');

console.log('\n[Review Workspace — Pilot UX Validation satisfaction prompt (Sprint 10.7), real browser]');
check('the satisfaction prompt appears right after a real publish', exportResult.showsSatisfactionPrompt);
check('clicking a rating dismisses the prompt', exportResult.promptDismissedAfterRating);
check('the real rating (4) was recorded for the real document', exportResult.ratingRecorded);

const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e));
check('zero fatal module/render errors', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗', e));

// Phase 10, Sprint 10.7 — Pilot UX Validation. learning-dashboard.js's new
// "Tinjauan Pilot" tab, driven with real seed data on a fresh page/module
// registry, then a real click on the tab itself.
const page7 = await browser.newPage();
page7.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page7.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
const pilotTabResult = await page7.evaluate(async () => {
  const { createDocument, editSection, transitionStatus } = await import('/js/v2/document-intelligence/composer/composer-store.js');
  const { recordSatisfactionRating } = await import('/js/v2/document-intelligence/composer/satisfaction-log.js');
  const { mountLearningDashboard } = await import('/js/v2/ui/learning-dashboard.js');

  const doc = createDocument('nor', { subject: 'Pengadaan Proyektor' });
  editSection(doc.documentId, 'subject', 'Pengadaan Proyektor (revisi)', 'evan');
  transitionStatus(doc.documentId, 'in_review', { actorId: 'evan' });
  transitionStatus(doc.documentId, 'approved', { actorId: 'evan', rationale: 'Sesuai kebutuhan.' });
  recordSatisfactionRating({ documentId: doc.documentId, rating: 5, actorId: 'evan' });

  const root = document.createElement('div');
  root.id = 'test-root-pilot-metrics';
  document.body.appendChild(root);
  await mountLearningDashboard(root);
  root.querySelector('[data-act="wlk-tab"][data-id="pilot"]')?.click();

  const html = root.innerHTML;
  return {
    showsApprovalRate: html.includes('100%') && html.includes('Tingkat Persetujuan'),
    showsManualEditsStat: html.includes('Rata-rata Suntingan Manual'),
    showsSatisfactionStat: html.includes('5.0 / 5') && html.includes('Kepuasan Peninjau'),
    showsCorrectedField: html.includes('subject'),
    showsStatusDistribution: html.includes('Disetujui') && html.includes('1 dokumen'),
  };
});

console.log('\n[Learning Dashboard — Tinjauan Pilot tab (Sprint 10.7), real browser]');
check('Tinjauan Pilot shows the real 100% approval rate (1 of 1 decided documents approved)', pilotTabResult.showsApprovalRate);
check('Tinjauan Pilot shows the manual-edits stat tile', pilotTabResult.showsManualEditsStat);
check('Tinjauan Pilot shows the real 5.0/5 satisfaction rating just recorded', pilotTabResult.showsSatisfactionStat);
check('Tinjauan Pilot shows "subject" among the most-corrected fields (the real edit made above)', pilotTabResult.showsCorrectedField);
check('Tinjauan Pilot shows the real status distribution (1 Disetujui document)', pilotTabResult.showsStatusDistribution);

await page1b.close();
await page2.close();
await page3.close();
await page4.close();
await page5a.close();
await page5b.close();
await page6.close();
await page7.close();
await browser.close();
server.close();

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
