// Design System Program Phase 3 — Request Approval smoke test.
//
// Disclosed, standing limitation (same one already documented for
// scratch/verify-domain-shell-phase1a-smoke.js, and re-confirmed this phase
// while building the Assignment Edit harness): js/app.js has ZERO exports —
// commitApproval()/confirmApproveRequest()/handleRequestApproveDirect() are
// not reachable for direct/mocked testing, and the real app.js bootstrap
// cannot achieve genuine admin permission state in this environment (no
// real Firebase Auth session exists here, and this app's session handling
// does not treat a bare localStorage claim as sufficient — confirmed by a
// prior attempt at exactly this pattern for Assignment Edit). Unlike
// Assignment Edit and Petty Cash (both fully verified against the real
// operation via a real injection seam / store-layer interception), Request
// Approval's verification in THIS environment is necessarily narrower:
// confirm the real app boots cleanly with the restructured commitApproval()
// (catches syntax errors, undefined references, wiring mistakes) — the
// await-before-mutate reordering and alert()-removal were verified by
// careful manual code tracing instead (documented in the phase's final
// report), the same disclosed pattern this project has used before for
// this exact class of environmental constraint.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OUT_DIR = path.join(__dirname, 'save-feedback-verify');
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Fetch Firebase data gagal/.test(msg.text())) pageErrors.push(msg.text()); });
  page.on('dialog', (d) => { pageErrors.push(`window.${d.type()} fired: ${d.message()}`); d.accept(); });

  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('pbsi_flag_visualShellV2', 'true');
    localStorage.setItem('pbsi_flag_domainShellV1', 'true');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#modalLogin, #app-splash { display: none !important; }' });
  await new Promise((r) => setTimeout(r, 1800));

  // Navigate to the Operations/Requests screen (reachable even in the
  // unauthenticated fallback state) and confirm renderPendingWorkspace()'s
  // new per-card markup (the sf-inline-error region added this phase)
  // renders without throwing.
  const state = await page.evaluate(() => {
    const railBtn = document.querySelector('[data-domain="operations"]');
    railBtn?.click();
    const reqTab = Array.from(document.querySelectorAll('.domshell-tab')).find((b) => /Requests/i.test(b.textContent));
    reqTab?.click();
    return {
      pendingWorkspaceExists: !!document.getElementById('v2PendingWorkspace'),
      bodyHTML_hasApproveModal: !!document.getElementById('modalApproveRequest'),
      approveFormErrorExists: !!document.getElementById('approveFormError'),
    };
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'approval-smoke.png') });

  await browser.close();

  console.log(JSON.stringify(state, null, 2));
  console.log('\n--- PAGE ERRORS ---');
  console.log(pageErrors.length ? pageErrors : 'none');

  const fail = [];
  if (!state.pendingWorkspaceExists) fail.push('v2PendingWorkspace never mounted');
  if (!state.bodyHTML_hasApproveModal) fail.push('#modalApproveRequest missing from DOM');
  if (!state.approveFormErrorExists) fail.push('#approveFormError (new this phase) missing from DOM');
  if (pageErrors.length) fail.push(`page errors / unexpected dialogs (including any stray alert(), which this phase specifically removes): ${pageErrors.join(' | ')}`);

  if (fail.length) {
    console.error('\nFAILURES:\n' + fail.map((f) => ' - ' + f).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\nRequest Approval smoke test passed (real app boots cleanly; see report for the disclosed scope limitation on dynamic verification).');
  }
})();
