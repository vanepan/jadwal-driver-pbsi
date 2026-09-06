/* ============================================================
   intelligence-console-ui-check.mjs — Sarpras Intelligence (V2, Phase 5)

   REAL-browser (puppeteer) check of the Intelligence console VIEW
   (js/intelligence-console.js) against the scripted, OFFLINE harness
   (scripts/intelligence-console-harness.html — no Firebase, no OpenAI, a
   fake createIntelligenceService() with getDraft / updateDraft AND the
   Phase 5 getNorRecord / syncNorRecord / approveNor / publishNor).

   Proves:
     • responsive at 320 / 375 / 390 / 430 / 768 / 1024 / 1440 — no horizontal
       overflow; the input, submit, and the review WORKSPACE stay inside the
       viewport and are not clipped, at every width, including in review
     • flow: idle → type → submit → needs_input → answer → needs_input →
       answer → requires_review → the NOR DRAFT & REVIEW WORKSPACE
     • the workspace is EDITABLE (real labelled field inputs + a body
       textarea), shows the pill "Menunggu review", offers Simpan Draf +
       Setujui — and NO "Terbitkan" / numbering control while in_review
     • edit a field → "Simpan Draf" → exactly ONE service.updateDraft call,
       the persisted record changes, the save-state reads "tersimpan"
     • Phase 5 HUMAN lifecycle: Setujui → approved (fields read-only, one
       approveNor call, "Terbitkan" appears, still no number) → Terbitkan →
       published (one publishNor call, the official number is shown, no
       destructive control remains) → RELOAD → published read-only comes back
     • RELOAD mid-review → the workspace + the saved edit come back
       (resumeDraft via a sessionStorage pointer — reload-safe)
     • double-submit protection; a11y; mount makes 0 service calls and 0
       requests to OpenAI / Firebase / Cloud Functions / googleapis

   Run:  node scripts/intelligence-console-ui-check.mjs   (exit 0 = pass)
   ============================================================ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};
const section = (t) => console.log(`\n── ${t} ──`);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scripts/intelligence-console-harness.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1440];
const BLOCKED_HOSTS = /openai\.com|firebaseio\.com|cloudfunctions\.net|googleapis\.com|gstatic\.com/i;
const FORBIDDEN_ACTION = /terbitkan|publish|approve|setuj|\bnomor\b|\bnumber\b|alokasi|allocate/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function walkToReview(page, generationScenario) {
  await page.evaluate('window.__harness.reset()');
  // reset() clears any scenario back to null — (re)apply it AFTER reset,
  // before the conversation walk produces the requires_review turn.
  if (generationScenario) {
    await page.evaluate((s) => window.__harness.setGenerationScenario(s), generationScenario);
  }
  await sleep(20);
  await page.evaluate(() => {
    const i = document.querySelector('.sic-console__input');
    i.value = 'Buatkan NOR pembelian mesin potong rumput.'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.sic-console__btn[type="submit"]').click();
  });
  await page.waitForFunction("window.__harness.getState().phase === 'needs_input'", { timeout: 4000 });
  await page.evaluate(() => {
    const i = document.querySelector('.sic-console__input');
    i.value = '2 unit'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.sic-console__btn[type="submit"]').click();
  });
  await page.waitForFunction('window.__harness.continueCalls.length === 1', { timeout: 4000 });
  await page.evaluate(() => {
    const i = document.querySelector('.sic-console__input');
    i.value = 'Bendahara'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.sic-console__btn[type="submit"]').click();
  });
  await page.waitForFunction("window.__harness.getState().phase === 'review'", { timeout: 4000 });
}

async function main() {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  const offNetwork = [];
  page.on('request', (r) => { if (BLOCKED_HOSTS.test(r.url())) offNetwork.push(r.url()); });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`${base}/scripts/intelligence-console-harness.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });

  section('Mount safety — 0 service calls, 0 blocked-host requests, no page error');
  check('mount made 0 service.handle calls (no auto-submit on load)',
    (await page.evaluate('window.__harness.handleCalls.length')) === 0);
  check('mount made 0 service.continueSession calls',
    (await page.evaluate('window.__harness.continueCalls.length')) === 0);
  check('mount made 0 service.updateDraft calls',
    (await page.evaluate('window.__harness.updateDraftCalls.length')) === 0);
  check('no request to OpenAI / Firebase / Cloud Functions / googleapis / gstatic', offNetwork.length === 0, offNetwork);
  check('no uncaught page error', pageErrors.length === 0, pageErrors);
  check('console root is present', (await page.$('.sic-console')) !== null);

  section('Accessibility');
  const a11y = await page.evaluate(() => {
    const input = document.querySelector('.sic-console__input');
    const btn = document.querySelector('.sic-console__btn[type="submit"]');
    const label = document.querySelector('label[for="sicConsoleInput"]');
    const name = input.getAttribute('aria-label') || (label && label.textContent.trim()) || '';
    return { hasName: !!name, btnTag: btn && btn.tagName, btnText: btn && btn.textContent.trim(), inputTag: input && input.tagName };
  });
  check('the input has an accessible name (aria-label or <label for>)', a11y.hasName, a11y);
  check('submit is a real <button> with text', a11y.btnTag === 'BUTTON' && /\S/.test(a11y.btnText || ''), a11y);

  section('Enter submits');
  await page.evaluate('window.__harness.reset()');
  await page.click('.sic-console__input');
  await page.type('.sic-console__input', 'buat NOR pengadaan mesin potong rumput');
  await page.keyboard.press('Enter');
  await page.waitForFunction('window.__harness.handleCalls.length === 1', { timeout: 4000 });
  check('pressing Enter in the input triggered exactly one service.handle call', true);

  section('Double-submit protection');
  await page.evaluate('window.__harness.reset()');
  await page.evaluate(() => {
    const i = document.querySelector('.sic-console__input');
    i.value = 'permintaan cepat'; i.dispatchEvent(new Event('input', { bubbles: true }));
    const b = document.querySelector('.sic-console__btn[type="submit"]');
    b.click(); b.click(); b.click();
  });
  await sleep(200);
  check('three fast clicks → exactly ONE service.handle call',
    (await page.evaluate('window.__harness.handleCalls.length')) === 1);
  check('exactly ONE user turn in the stack',
    (await page.evaluate(() => document.querySelectorAll('.sic-console__msg--user').length)) === 1);

  for (const w of VIEWPORTS) {
    section(`Viewport ${w}px — idle → needs_input → review workspace, no overflow`);
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await walkToReview(page);

    const rv = await page.evaluate(() => {
      const ws = document.querySelector('.sic-ws');
      const pill = document.querySelector('.sic-ws__pill');
      const fields = [...document.querySelectorAll('[data-wsfield]')].map((n) => ({ id: n.getAttribute('data-wsfield'), tag: n.tagName, val: n.value }));
      const buttons = [...document.querySelectorAll('.sic-console button')].map((b) => b.textContent.trim());
      const r = ws ? ws.getBoundingClientRect() : null;
      return {
        hasWs: !!ws,
        pillText: pill ? pill.textContent.trim() : '',
        wsText: ws ? ws.textContent.replace(/\s+/g, ' ').trim() : '',
        fields,
        buttons,
        wsRight: r ? r.right : 0,
        wsScroll: ws ? ws.scrollWidth : 0,
        wsClient: ws ? ws.clientWidth : 0,
        docScroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        formHidden: document.querySelector('[data-region="form"]').hidden,
      };
    });
    check(`${w}: the NOR draft & review workspace rendered`, rv.hasWs);
    check(`${w}: the status pill reads "Menunggu review"`, /Menunggu review/i.test(rv.pillText), rv.pillText);
    check(`${w}: editable field inputs present (item, quantity, purpose, budget, recipient, subject, body)`,
      ['item', 'quantity', 'purpose', 'budget', 'recipient', 'subject', 'body'].every((id) => rv.fields.some((f) => f.id === id)), rv.fields.map((f) => f.id));
    check(`${w}: the body field is a <textarea>`, rv.fields.some((f) => f.id === 'body' && f.tag === 'TEXTAREA'), rv.fields);
    check(`${w}: the recipient field carries the collected value "Bendahara"`, rv.fields.some((f) => f.id === 'recipient' && /Bendahara/.test(f.val)), rv.fields);
    check(`${w}: a "Simpan Draf" action exists`, rv.buttons.some((t) => /simpan draf/i.test(t)), rv.buttons);
    check(`${w}: a "Setujui" action exists while in_review (the canonical NorRecord is registered)`,
      rv.buttons.some((t) => /^setujui$/i.test(t)), rv.buttons);
    check(`${w}: NO "Terbitkan" / numbering / allocate control while in_review (publish is a later, separate stage)`,
      !rv.buttons.some((t) => /terbitkan|publish|\bnomor\b|\bnumber\b|alokasi|allocate|reserve/i.test(t)), rv.buttons);
    check(`${w}: only expected controls (Pratinjau PDF / Simpan Draf / Batalkan / Setujui / Mulai permintaan baru / the hidden chat Kirim)`,
      rv.buttons.every((t) => /pratinjau pdf|menyiapkan|simpan draf|batalkan|^setujui$|mulai permintaan baru|memproses|^kirim$/i.test(t)), rv.buttons);
    check(`${w}: the "Pratinjau PDF" (read-only preview) control is present in the review workspace`,
      rv.buttons.some((t) => /pratinjau pdf/i.test(t)), rv.buttons);
    check(`${w}: the chat intake form is hidden while the workspace shows`, rv.formHidden === true);
    check(`${w}: no horizontal page overflow (review)`, rv.docScroll <= rv.inner + 1, { docScroll: rv.docScroll, inner: rv.inner });
    check(`${w}: the workspace is not clipped horizontally + inside the viewport`,
      rv.wsRight <= rv.inner + 1 && rv.wsScroll <= rv.wsClient + 1, rv);
  }

  section('Edit a field → Simpan Draf → persisted, save-state confirms');
  await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
  await walkToReview(page);
  await page.evaluate(() => {
    const b = document.querySelector('[data-wsfield="budget"]');
    b.value = 'Rp10.000.000'; b.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('after editing, the controller marks the draft dirty',
    (await page.evaluate('window.__harness.getState().draftDirty')) === true);
  check('no updateDraft call fired on the keystroke',
    (await page.evaluate('window.__harness.updateDraftCalls.length')) === 0);
  await page.evaluate(() => [...document.querySelectorAll('.sic-console button')].find((b) => /simpan draf/i.test(b.textContent)).click());
  await page.waitForFunction("window.__harness.getState().saveState === 'saved'", { timeout: 4000 });
  check('exactly ONE service.updateDraft call', (await page.evaluate('window.__harness.updateDraftCalls.length')) === 1);
  check('the staged edit was the payload', (await page.evaluate('window.__harness.updateDraftCalls[0].edits.budget')) === 'Rp10.000.000');
  check('the persisted record changed (facts.budget) and bumped its version',
    (await page.evaluate('window.__harness.record().facts.budget')) === 'Rp10.000.000'
    && (await page.evaluate('window.__harness.record().version')) === 2);
  check('the record stays status "requires_review" (no publish / number happened)',
    (await page.evaluate('window.__harness.record().status')) === 'requires_review'
    && (await page.evaluate('window.__harness.record().numbering.publishedNumber')) === null);
  const savedText = await page.evaluate(() => document.querySelector('.sic-ws__savestate').textContent);
  check('the save-state line confirms "tersimpan"', /tersimpan/i.test(savedText), savedText);

  section('RELOAD the page → the workspace + the saved edit come back');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });
  await page.waitForFunction("window.__harness.getState().phase === 'review'", { timeout: 4000 });
  check('after reload the console resumed straight into the review workspace',
    (await page.$('.sic-ws')) !== null);
  check('it did so via service.getDraft (the sessionStorage reload pointer)',
    (await page.evaluate('window.__harness.getDraftCalls.length')) >= 1);
  const reloadedBudget = await page.evaluate(() => {
    const el = document.querySelector('[data-wsfield="budget"]');
    return el ? el.value : null;
  });
  check('the previously-saved edit is shown after reload', reloadedBudget === 'Rp10.000.000', reloadedBudget);
  check('reload made 0 service.handle / continueSession calls',
    (await page.evaluate('window.__harness.handleCalls.length')) === 0
    && (await page.evaluate('window.__harness.continueCalls.length')) === 0);

  section('Phase 5 — HUMAN lifecycle: Setujui → approved (read-only) → Terbitkan → published (official number)');
  await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
  await walkToReview(page);
  check('at the review workspace the canonical record is in_review',
    (await page.evaluate("window.__harness.getState().norLifecycle")) === 'in_review');

  // Setujui
  await page.evaluate(() => [...document.querySelectorAll('.sic-console button')].find((b) => /^setujui$/i.test(b.textContent.trim())).click());
  await page.waitForFunction("window.__harness.getState().norLifecycle === 'approved'", { timeout: 4000 });
  const approved = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.sic-console button')].map((b) => b.textContent.trim());
    const fieldsRO = [...document.querySelectorAll('[data-wsfield]')].every((n) => n.disabled || n.readOnly);
    return {
      buttons,
      pill: document.querySelector('.sic-ws__pill') ? document.querySelector('.sic-ws__pill').textContent.trim() : '',
      fieldsRO,
      officialShown: !document.querySelector('[data-ws-official]').hidden,
      norNumber: window.__harness.getState().norNumber,
      approveCalls: window.__harness.approveNorCalls.length,
    };
  });
  check('approved: exactly ONE service.approveNor call', approved.approveCalls === 1, approved);
  check('approved: the status pill reads "Disetujui…"', /disetujui/i.test(approved.pill), approved.pill);
  check('approved: the draft fields are now read-only (no editing after approval)', approved.fieldsRO, approved);
  check('approved: a "Terbitkan" action appears, "Setujui" is gone',
    approved.buttons.some((t) => /^terbitkan$/i.test(t)) && !approved.buttons.some((t) => /^setujui$/i.test(t)), approved.buttons);
  check('approved: STILL no official number', !approved.officialShown && !approved.norNumber, approved);

  // Terbitkan
  await page.evaluate(() => [...document.querySelectorAll('.sic-console button')].find((b) => /^terbitkan$/i.test(b.textContent.trim())).click());
  await page.waitForFunction("window.__harness.getState().norLifecycle === 'published'", { timeout: 4000 });
  const published = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.sic-console button')].map((b) => b.textContent.trim());
    const off = document.querySelector('[data-ws-official]');
    return {
      buttons,
      pill: document.querySelector('.sic-ws__pill').textContent.trim(),
      officialShown: !off.hidden,
      officialText: off.textContent.replace(/\s+/g, ' ').trim(),
      norNumber: window.__harness.getState().norNumber,
      publishCalls: window.__harness.publishNorCalls.length,
      fieldsRO: [...document.querySelectorAll('[data-wsfield]')].every((n) => n.disabled || n.readOnly),
    };
  });
  check('published: exactly ONE service.publishNor call', published.publishCalls === 1, published);
  check('published: the status pill reads "Diterbitkan"', /diterbitkan/i.test(published.pill), published.pill);
  check('published: the official number is shown', published.officialShown && /nomor resmi/i.test(published.officialText) && !!published.norNumber, published);
  check('published: no "Setujui" / "Terbitkan" / "Simpan Draf" destructive control remains',
    !published.buttons.some((t) => /^setujui$|^terbitkan$|simpan draf|batalkan/i.test(t)), published.buttons);
  check('published: fields stay read-only', published.fieldsRO, published);

  // reload → the published, read-only state comes back
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });
  await page.waitForFunction("window.__harness.getState().phase === 'review'", { timeout: 4000 });
  const afterReload = await page.evaluate(() => ({
    lifecycle: window.__harness.getState().norLifecycle,
    norNumber: window.__harness.getState().norNumber,
    pill: document.querySelector('.sic-ws__pill') ? document.querySelector('.sic-ws__pill').textContent.trim() : '',
    getNorRecordCalls: window.__harness.getNorRecordCalls.length,
  }));
  check('after reload: the published NOR comes back read-only, via service.getNorRecord',
    afterReload.lifecycle === 'published' && !!afterReload.norNumber && /diterbitkan/i.test(afterReload.pill) && afterReload.getNorRecordCalls >= 1, afterReload);

  section('Phase 6A — generation provenance panel (certified / fallback / blocked)');
  await walkToReview(page, 'certified');
  const certifiedUi = await page.evaluate(() => {
    const ws = document.querySelector('[data-ws]');
    return {
      hasBlockedBanner: !!ws.querySelector('.sic-ws__blocked'),
      genSection: ws.querySelector('.sic-ws__section--gen') ? ws.querySelector('.sic-ws__section--gen').textContent : '',
      fieldsPresent: ws.querySelectorAll('[data-wsfield]').length > 0,
    };
  });
  check('certified: NO blocked banner is shown', !certifiedUi.hasBlockedBanner, certifiedUi);
  check('certified: the generation section names the PBSI Style Guide', /PBSI Style Guide/.test(certifiedUi.genSection), certifiedUi.genSection);
  check('certified: the generation section names the PBSI Visual Template', /PBSI Visual Template/.test(certifiedUi.genSection), certifiedUi.genSection);
  check('certified: the draft fields still render normally', certifiedUi.fieldsPresent, certifiedUi);

  await walkToReview(page, 'fallback');
  const fallbackUi = await page.evaluate(() => {
    const ws = document.querySelector('[data-ws]');
    return {
      hasBlockedBanner: !!ws.querySelector('.sic-ws__blocked'),
      hasFallbackWarn: !!ws.querySelector('.sic-ws__warn--gen'),
      warnText: ws.querySelector('.sic-ws__warn--gen') ? ws.querySelector('.sic-ws__warn--gen').textContent : '',
      genSection: ws.querySelector('.sic-ws__section--gen') ? ws.querySelector('.sic-ws__section--gen').textContent : '',
    };
  });
  check('fallback: NO blocked banner is shown (generation is still ALLOWED)', !fallbackUi.hasBlockedBanner, fallbackUi);
  check('fallback: a visible fallback warning is shown', fallbackUi.hasFallbackWarn && /fallback/i.test(fallbackUi.warnText), fallbackUi);
  check('fallback: the panel does NOT claim the PBSI Style Guide for the fallen-back slot', !/PBSI Style Guide/.test(fallbackUi.genSection), fallbackUi.genSection);

  await walkToReview(page, 'blocked');
  const blockedUi = await page.evaluate(() => {
    const ws = document.querySelector('[data-ws]');
    const banner = ws.querySelector('.sic-ws__blocked');
    return {
      hasBanner: !!banner,
      bannerIsFirst: ws.firstElementChild === banner,
      bannerText: banner ? banner.textContent : '',
      hasNormalGenSection: !!ws.querySelector('.sic-ws__section--gen'),
      fieldsStillPresent: ws.querySelectorAll('[data-wsfield]').length > 0,
      pillText: ws.querySelector('.sic-ws__pill') ? ws.querySelector('.sic-ws__pill').textContent : '',
    };
  });
  check('blocked: the UNMISSABLE blocked banner is shown', blockedUi.hasBanner, blockedUi);
  check('blocked: the banner is the FIRST thing in the workspace (§22 — not a tiny warning under a normal draft)', blockedUi.bannerIsFirst, blockedUi);
  check('blocked: the banner names "Diblokir" / blocked, never looks like an ordinary success', /diblokir/i.test(blockedUi.bannerText), blockedUi.bannerText);
  check('blocked: the normal certified/fallback generation section is NOT also shown', !blockedUi.hasNormalGenSection, blockedUi);
  check('blocked: the human can still review/complete the draft fields below the banner', blockedUi.fieldsStillPresent, blockedUi);

  section('Phase 6C — draft PDF preview control (review workspace)');
  await walkToReview(page);
  const previewBase = await page.evaluate(() => {
    const ws = document.querySelector('[data-ws]');
    const btn = ws.querySelector('[data-ws-preview]');
    return {
      present: !!btn,
      label: btn ? btn.textContent.trim() : '',
      enabledWhenClean: btn ? !btn.disabled : false,
      forbiddenControls: /terbitkan|publish|approve|setuj|\bnomor\b|allocate/i.test(btn ? btn.textContent : ''),
    };
  });
  check('a "Pratinjau PDF" control is present in the review workspace', previewBase.present && /pratinjau/i.test(previewBase.label), previewBase);
  check('it is enabled while the draft is clean (no unsaved edits)', previewBase.enabledWhenClean, previewBase);
  check('the preview control carries no publish / approve / numbering wording', !previewBase.forbiddenControls, previewBase);

  // click → applied-template scenario
  await page.evaluate(() => document.querySelector('[data-ws-preview]').click());
  await page.waitForFunction('window.__harness.openDocCalls.length === 1', { timeout: 4000 });
  const applied = await page.evaluate(() => {
    const ws = document.querySelector('[data-ws]');
    const ps = ws.querySelector('[data-ws-previewstate]');
    return {
      previewCalls: window.__harness.previewCalls.length,
      openDocCalls: window.__harness.openDocCalls.length,
      calledWithDraftId: (window.__harness.previewCalls[0] || {}).draftId,
      composerIsPreview: !!(window.__harness.openDocCalls[0] || {}).composerData && window.__harness.openDocCalls[0].composerData.isPreview === true,
      composerHasNoNumber: !((window.__harness.openDocCalls[0] || {}).composerData.sections || []).some((s) => s.field === 'norNumber'),
      stateText: ps ? ps.textContent : '',
      stateClass: ps ? ps.className : '',
      pill: ws.querySelector('.sic-ws__pill') ? ws.querySelector('.sic-ws__pill').textContent : '',
      approveCalls: window.__harness.approveNorCalls.length,
      publishCalls: window.__harness.publishNorCalls.length,
      updateCalls: window.__harness.updateDraftCalls.length,
    };
  });
  check('one preview request went to the server-authoritative builder with the draftId', applied.previewCalls === 1 && !!applied.calledWithDraftId, applied);
  check('exactly one document was opened in the in-app viewer (no auto-download path)', applied.openDocCalls === 1, applied);
  check('the composer data is flagged isPreview and carries NO NOR number (§12, §13)', applied.composerIsPreview && applied.composerHasNoNumber, applied);
  check('an APPLIED verdict discloses "PBSI Visual Template … diterapkan" (§11, §31)', /PBSI Visual Template/.test(applied.stateText) && /diterapkan/i.test(applied.stateText) && /--ok/.test(applied.stateClass), applied);
  check('preview did NOT approve / publish / mutate the draft (§14, §29)', applied.approveCalls === 0 && applied.publishCalls === 0 && applied.updateCalls === 0 && /menunggu review/i.test(applied.pill), applied);

  // unsaved edits → preview disabled (§17)
  await page.evaluate(() => {
    const t = document.querySelector('[data-wsfield="subject"]');
    t.value = 'Perihal diubah tanpa disimpan'; t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(30);
  const dirty = await page.evaluate(() => {
    const ws = document.querySelector('[data-ws]');
    const btn = ws.querySelector('[data-ws-preview]');
    const ps = ws.querySelector('[data-ws-previewstate]');
    return { disabled: btn.disabled, hint: ps && !ps.hidden ? ps.textContent : '' };
  });
  check('with unsaved edits the preview control is DISABLED and hints "Simpan draf…" (§17 — never mixes saved + unsaved)',
    dirty.disabled && /simpan draf/i.test(dirty.hint), dirty);

  // stale-context scenario → falls back visibly, never silently applies an obsolete template (§32)
  await walkToReview(page);
  await page.evaluate(() => window.__harness.setPreviewScenario('stale'));
  await page.evaluate(() => document.querySelector('[data-ws-preview]').click());
  await page.waitForFunction('window.__harness.openDocCalls.length === 1', { timeout: 4000 });
  const stale = await page.evaluate(() => {
    const ps = document.querySelector('[data-ws-previewstate]');
    return { text: ps.textContent, cls: ps.className, rvmNull: window.__harness.openDocCalls[0].composerData.renderingVisualModel === null };
  });
  check('a STALE verdict is surfaced as a warning ("usang") and renders WITHOUT the template geometry (§32)',
    /usang/i.test(stale.text) && /--warn/.test(stale.cls) && stale.rvmNull, stale);

  // render-failure scenario → explicit error, no silent fallback (§18)
  await walkToReview(page);
  await page.evaluate(() => window.__harness.setPreviewScenario('error'));
  await page.evaluate(() => document.querySelector('[data-ws-preview]').click());
  await page.waitForFunction("/render failed/i.test((document.querySelector('[data-ws-previewstate]')||{}).textContent||'')", { timeout: 4000 });
  const errUi = await page.evaluate(() => {
    const ps = document.querySelector('[data-ws-previewstate]');
    return { text: ps.textContent, cls: ps.className, openDocCalls: window.__harness.openDocCalls.length };
  });
  check('a render failure shows the SPECIFIC server error and opens no document (§18 — no silent fallback / stale PDF)',
    /render failed/i.test(errUi.text) && /--error/.test(errUi.cls) && errUi.openDocCalls === 0, errUi);

  section('Post-run safety re-check');
  check('still 0 requests to blocked hosts after the full run', offNetwork.length === 0, offNetwork);
  check('no uncaught page errors during the run', pageErrors.length === 0, pageErrors);

  await browser.close();
  server.close();

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); try { server.close(); } catch {} process.exit(1); });
