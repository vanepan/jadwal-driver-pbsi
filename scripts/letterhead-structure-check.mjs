/* letterhead-structure-check.mjs — Phase 12.8.x (Live Workspace Experience
   Completion): recipients[]/cc[]/signatories{top,bottom} as real,
   editable, structured fields — closing the visual gap between the
   generic V2 Composer preview and the official PBSI NOR letterhead.

   Two parts: (1) Node — composeNorDocument() genuinely populates the new
   fields, structurally, never fabricating a name/role. (2) real browser —
   the Live Document Workspace shows the real logo, lets a reviewer add a
   recipient/cc entry and fill a signatory slot by clicking/typing, and
   the change survives a re-render (real editSection() writes, not
   local-only DOM state).

   Run: node scripts/letterhead-structure-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } }

console.log('\n[Part 1 — composeNorDocument(), plain Node: real structured fields, never fabricated]');
{
  const { composeNorDocument } = await import('../src/document-intelligence/nor/nor-composer.js');
  const { setKnowledgeBackend, ingest, promoteKnowledge } = await import('../src/knowledge/services/knowledge-service.js');
  const { generateKnowledgeId } = await import('../src/knowledge/contracts/identity-contract.js');
  setKnowledgeBackend('memory');

  const now = new Date().toISOString();
  const seed = ({ kind, payload, sourceRef }) => {
    const id = generateKnowledgeId({ domainType: 'nor', sourceType: 'manual-file', sourceRef });
    ingest({
      id, version: 1, domainType: 'nor', sourceType: 'manual-file', kind, payload, confidence: 0.9,
      lifecycleState: 'draft', provenance: { connectorId: 'manual-file', sourceRef, capturedAt: now },
      approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
    });
    return promoteKnowledge(id, { approverId: 'evan', decidedAt: now, preferenceRationale: 'seed for letterhead-structure-check.mjs' }).ok;
  };
  seed({ kind: 'structure', payload: { signatoryTopCount: 3, signatoryBottomCount: 2, itemCount: 1, reimburseLineCount: 0 }, sourceRef: 'letterhead-struct-1' });
  seed({ kind: 'sentence_pattern', payload: { template: 'Permohonan pembelian kebutuhan kantin.', slots: [], granularity: 'sentence' }, sourceRef: 'letterhead-pattern-1' });

  const composed = composeNorDocument({ subject: 'Pembelian kebutuhan kantin' }, { sessionId: 'letterhead-check-session-1' });
  check('composition succeeds with the seeded Knowledge', composed.ok === true);
  const doc = composed.data.composerDocument;
  const recipients = doc.sections.find((s) => s.field === 'recipients');
  const cc = doc.sections.find((s) => s.field === 'cc');
  const signatories = doc.sections.find((s) => s.field === 'signatories');

  check('a real "recipients" section exists, an honest empty array (never a fabricated recipient)', !!recipients && Array.isArray(recipients.value) && recipients.value.length === 0);
  check('a real "cc" section exists, an honest empty array', !!cc && Array.isArray(cc.value) && cc.value.length === 0);
  check('a real "signatories" section exists', !!signatories && !!signatories.value);
  check('signatories.top has exactly the real, evidence-based suggested count (3) of slots', signatories.value.top.length === 3);
  check('signatories.bottom has exactly the real, evidence-based suggested count (2) of slots', signatories.value.bottom.length === 2);
  check('every signatory slot starts fully blank — label/position/name all null, never guessed', [...signatories.value.top, ...signatories.value.bottom].every((s) => s.label === null && s.position === null && s.name === null));
}

console.log('\n[Part 2 — real browser: logo, editable recipients/cc, editable signatory grid]');
{
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
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

  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const { createDocument } = await import('/src/document-intelligence/composer/composer-store.js');
    const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');

    localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));

    const doc = createDocument('nor', {
      subject: 'Pembelian kebutuhan kantin',
      recipients: [],
      cc: [],
      signatories: { top: [{ label: null, position: null, name: null }, { label: null, position: null, name: null }], bottom: [{ label: null, position: null, name: null }] },
    });

    const root = document.createElement('div');
    document.body.appendChild(root);
    await mountReviewWorkspace(root);
    root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

    const hasLogo = !!root.querySelector('.rw-doc-logo');

    // Add a recipient via the real "+ Tambah" click, then type into it.
    root.querySelector('[data-act="rw-role-add"][data-role-field="recipients"]')?.click();
    const recipientEntry = root.querySelector('.rw-role-entry[data-role-field="recipients"][data-role-index="0"]');
    recipientEntry.focus();
    recipientEntry.textContent = 'Wakil Ketua Umum III';
    recipientEntry.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));

    const afterRecipientHtml = root.innerHTML;
    const { getDocument } = await import('/src/document-intelligence/composer/composer-store.js');
    const realDoc = getDocument(doc.documentId);
    const recipientsSection = realDoc.sections.find((s) => s.field === 'recipients');

    // Fill one signatory slot's name.
    const nameField = root.querySelector('.rw-sig-field--name[data-sig-row="top"][data-sig-index="0"]');
    nameField.focus();
    nameField.textContent = 'MONIKA YUNITA';
    nameField.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    const realDoc2 = getDocument(doc.documentId);
    const signatoriesSection = realDoc2.sections.find((s) => s.field === 'signatories');

    // Remove the recipient we just added.
    const removeBtn = root.querySelector('[data-act="rw-role-remove"][data-role-field="recipients"][data-role-index="0"]');
    const hadRemoveButton = !!removeBtn;
    removeBtn?.click();
    await new Promise((r) => setTimeout(r, 50));
    const realDoc3 = getDocument(doc.documentId);
    const recipientsAfterRemove = realDoc3.sections.find((s) => s.field === 'recipients');

    return {
      hasLogo,
      afterRecipientHtmlHasValue: afterRecipientHtml.includes('Wakil Ketua Umum III'),
      recipientsSectionValue: recipientsSection ? recipientsSection.value : null,
      signatoryNameAfterEdit: signatoriesSection ? signatoriesSection.value.top[0].name : null,
      signatoryOtherFieldsUntouched: signatoriesSection ? (signatoriesSection.value.top[0].label === null && signatoriesSection.value.top[1].name === null) : false,
      hadRemoveButton,
      recipientsAfterRemove: recipientsAfterRemove ? recipientsAfterRemove.value : null,
    };
  });

  check('the real PBSI logo renders in the Live Document (an <img>, never absent)', result.hasLogo);
  check('typing a real recipient and blurring shows it live in the DOM', result.afterRecipientHtmlHasValue);
  check('the recipient is genuinely PERSISTED via editSection() (getDocument reflects it), not just local DOM state', Array.isArray(result.recipientsSectionValue) && result.recipientsSectionValue[0] === 'Wakil Ketua Umum III');
  check('filling one signatory slot\'s name genuinely persists via editSection()', result.signatoryNameAfterEdit === 'MONIKA YUNITA');
  check('editing ONE signatory slot never touches any other slot\'s fields (label stays null, the other slot stays fully blank)', result.signatoryOtherFieldsUntouched);
  check('a real "×" remove button exists for a recipient row', result.hadRemoveButton);
  check('clicking remove genuinely deletes the entry via editSection() (array shrinks back to empty)', Array.isArray(result.recipientsAfterRemove) && result.recipientsAfterRemove.length === 0);

  const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/i.test(e));
  check('zero fatal module/render errors', fatal.length === 0);
  if (fatal.length) fatal.forEach((e) => console.log('   ✗', e));

  await browser.close();
  server.close();
}

console.log('\n[Part 3 — layout-knob: adjust logo/margins, saves immediately into the Document Design System]');
{
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
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

  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const { createDocument } = await import('/src/document-intelligence/composer/composer-store.js');
    const { mountReviewWorkspace } = await import('/src/ui/review-workspace.js');
    const { getDesignSystem, latestVersion } = await import('/js/docs/design-system/document-design-system.js');

    localStorage.setItem('pbsi_current_user', JSON.stringify({ username: 'evan', role: 'admin' }));
    const versionBefore = latestVersion('composer');
    const logoWidthBefore = getDesignSystem('composer').logo.width;

    const doc = createDocument('nor', { subject: 'Uji tata letak' });
    const root = document.createElement('div');
    document.body.appendChild(root);
    await mountReviewWorkspace(root);
    root.querySelector(`[data-act="rw-doc-row"][data-id="${doc.documentId}"]`)?.click();

    const hadToggleButton = !!root.querySelector('[data-act="rw-layout-toggle"]');
    root.querySelector('[data-act="rw-layout-toggle"]')?.click();

    const logoInput = root.querySelector('#rw-layout-logo');
    logoInput.value = '90';
    logoInput.dispatchEvent(new Event('input', { bubbles: true }));
    const mxInput = root.querySelector('#rw-layout-mx');
    mxInput.value = '30';
    mxInput.dispatchEvent(new Event('input', { bubbles: true }));

    root.querySelector('[data-act="rw-layout-save"]')?.click();
    await new Promise((r) => setTimeout(r, 50));

    const versionAfter = latestVersion('composer');
    const dsAfter = getDesignSystem('composer');
    const logoImgWidthAfter = root.querySelector('.rw-doc-logo')?.getAttribute('width');
    const docPaddingAfter = root.querySelector('.rw-doc')?.getAttribute('style') || '';

    return {
      hadToggleButton,
      versionBefore,
      versionAfter,
      logoWidthBefore,
      logoWidthAfter: dsAfter.logo.width,
      marginXAfter: dsAfter.page.margins[0],
      logoImgWidthAfter,
      docPaddingAfter,
    };
  });

  check('the "Sesuaikan Tata Letak" toggle button exists', result.hadToggleButton);
  check('saving genuinely registers a NEW version (append-only — never overwrites v1)', result.versionAfter === result.versionBefore + 1);
  check('the new logo width (90) is genuinely the one now resolved as latest', result.logoWidthAfter === 90 && result.logoWidthAfter !== result.logoWidthBefore);
  check('the new left/right margin (30) is genuinely the one now resolved as latest', result.marginXAfter === 30);
  check('the on-screen logo <img> immediately reflects the new width (not just the stored data)', result.logoImgWidthAfter === '90');
  check('the on-screen document padding immediately reflects the new margin (WYSIWYG, not just stored data)', result.docPaddingAfter.includes(`${Math.round(30 * (96 / 72))}px`));

  const fatal = errors.filter((e) => /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|does not provide an export/i.test(e));
  check('zero fatal module/render errors', fatal.length === 0);
  if (fatal.length) fatal.forEach((e) => console.log('   ✗', e));

  await browser.close();
  server.close();
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
