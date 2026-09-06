/* ============================================================
   intelligence-curation-ui-check.mjs — Human Curation Workspace
   (V2, Phase 5.x.8)

   REAL-browser (puppeteer) check of the Human Curation Workspace VIEW
   (js/intelligence-curation-console.js) against the scripted OFFLINE
   harness (scripts/intelligence-curation-harness.html — no Firebase, no
   OpenAI, the REAL pure controller over the REAL Style Guide + Visual
   Template MEMORY backends, seeded with proposals incl. a conflict pair
   and an UNKNOWN-geometry template).

   Proves (Phase 5.x.8 §22/§29):
     • responsive at 320 / 375 / 390 / 430 / 768 / 1024 / 1440 — no
       horizontal overflow, content never clipped, at every width
     • MOUNT SAFETY: 0 requests to OpenAI / Firebase / Cloud Functions /
       googleapis; mount performs the ONE read (load) and ZERO mutations
       (approve / reject / deprecate all still 0)
     • tabs render + switch (Overview / Style Rules / Visual Templates /
       Conflicts / History); a11y — tabs are real <button role="tab">
     • LIST: proposed style rules + visual templates appear as cards;
       authority is a LABEL ("Authority: Proposed"), NEVER a "%"; a
       conflicting proposal shows a "conflict" chip
     • STYLE REVIEW: selecting a card shows Evidence + Temporal context +
       Provenance (source ids), and Approve / Reject actions
     • VISUAL REVIEW: an UNKNOWN-geometry template shows "Geometry
       unavailable" and NO fabricated A4 / 595 / 842
     • CONFLICTS: both sides shown; the words "No recommended winner"
       appear and NO "recommended winner: <id>" is ever rendered
     • APPROVAL: Approve → a confirm dialog (role="dialog", labelled);
       confirming with an EMPTY rationale is refused ("rationale is
       required"), the store is unchanged; a real rationale → exactly ONE
       approve call, a success toast, the card flips to "approved"
     • REJECTION: works the same way through the dialog

   Run:  node scripts/intelligence-curation-ui-check.mjs   (exit 0 = pass)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/scripts/intelligence-curation-harness.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const VIEWPORTS = [320, 375, 390, 430, 768, 1024, 1440];
const BLOCKED_HOSTS = /openai\.com|firebaseio\.com|cloudfunctions\.net|googleapis\.com|gstatic\.com/i;

const clickByText = async (page, selector, re) => page.evaluate((sel, src) => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll(sel)].find((n) => rx.test(n.textContent.trim()));
  if (el) { el.click(); return true; }
  return false;
}, selector, re.source);

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

  await page.goto(`${base}/scripts/intelligence-curation-harness.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__curReady === true', { timeout: 8000 });
  await page.waitForFunction("window.__cur.getState().ready === true", { timeout: 4000 });

  section('Mount safety — ONE read (load), ZERO mutations, 0 blocked-host requests');
  let calls = await page.evaluate('window.__cur.calls');
  check('mount performed the read (list called)', calls.list >= 2, calls);
  check('mount performed ZERO approve calls', calls.approve === 0, calls);
  check('mount performed ZERO reject calls', calls.reject === 0, calls);
  check('mount performed ZERO deprecate calls', calls.deprecate === 0, calls);
  check('no request to OpenAI / Firebase / Cloud Functions / googleapis / gstatic', offNetwork.length === 0, offNetwork);
  check('no uncaught page error', pageErrors.length === 0, pageErrors);
  check('the workspace root rendered', (await page.$('.cur-console')) !== null);

  section('Tabs — render, a11y, switch');
  const tabInfo = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.cur-tab')];
    return { count: tabs.length, allButtons: tabs.every((t) => t.tagName === 'BUTTON'), allRoleTab: tabs.every((t) => t.getAttribute('role') === 'tab'), labels: tabs.map((t) => t.textContent.replace(/\d+$/, '').trim()) };
  });
  check('five tabs, all real <button role="tab">', tabInfo.count === 5 && tabInfo.allButtons && tabInfo.allRoleTab, tabInfo);
  check('tab labels present', ['Overview', 'Style Rules', 'Visual Templates', 'Conflicts', 'History'].every((l) => tabInfo.labels.includes(l)), tabInfo.labels);

  for (const w of VIEWPORTS) {
    section(`Viewport ${w}px — overview + style-rules, no horizontal overflow`);
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
    await page.evaluate("window.__cur.controller.setTab('overview')");
    await sleep(30);
    let m = await page.evaluate(() => ({
      docScroll: document.documentElement.scrollWidth, inner: window.innerWidth,
      metrics: document.querySelectorAll('.cur-metric').length,
    }));
    check(`${w}: overview metrics rendered`, m.metrics >= 3, m);
    check(`${w}: no horizontal page overflow (overview)`, m.docScroll <= m.inner + 1, m);

    await page.evaluate("window.__cur.controller.setTab('style_rules')");
    await sleep(30);
    m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.cur-card')];
      const con = document.querySelector('.cur-console');
      return {
        docScroll: document.documentElement.scrollWidth, inner: window.innerWidth,
        cards: cards.length, conRight: con ? con.getBoundingClientRect().right : 0,
        conScroll: con ? con.scrollWidth : 0, conClient: con ? con.clientWidth : 0,
      };
    });
    check(`${w}: style-rule proposal cards rendered`, m.cards >= 2, m);
    check(`${w}: no horizontal page overflow (style rules)`, m.docScroll <= m.inner + 1, m);
    check(`${w}: the workspace is not clipped horizontally`, m.conRight <= m.inner + 1 && m.conScroll <= m.conClient + 1, m);
  }

  await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });

  section('LIST — authority is a LABEL, never a "%"; a conflicting proposal is flagged');
  await page.evaluate("window.__cur.controller.setTab('style_rules')");
  await sleep(30);
  const listInfo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.cur-card')];
    return {
      authorityLabels: cards.map((c) => (c.querySelector('.cur-authority') || {}).textContent || ''),
      anyPercent: cards.some((c) => /\d\s*%/.test(c.textContent)),
      conflictChips: cards.filter((c) => /conflict/i.test(c.textContent)).length,
      text: document.querySelector('.cur-console').textContent,
    };
  });
  check('every card shows an explicit "Authority: <label>"', listInfo.authorityLabels.every((t) => /Authority:/.test(t)), listInfo.authorityLabels);
  check('no card renders a "%" authority claim', listInfo.anyPercent === false, listInfo);
  check('the "Yth." / "Kepada Yth." proposals are flagged as a conflict', listInfo.conflictChips >= 2, listInfo);
  check('the list distinguishes evidence confidence as a separate labelled number', /evidence confidence 0\.\d\d/.test(listInfo.text), listInfo.text.slice(0, 200));

  section('STYLE REVIEW — evidence + temporal + provenance render');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.cur-card')].find((c) => /Yth\./.test(c.textContent) && !/Kepada/.test(c.textContent));
    card.click();
  });
  await page.waitForFunction("window.__cur.getState().detail !== null", { timeout: 3000 });
  const rev = await page.evaluate(() => document.querySelector('.cur-console').textContent);
  check('review panel shows an Evidence section', /Evidence/i.test(rev));
  check('review panel shows Temporal context', /Temporal context/i.test(rev));
  check('review panel shows Provenance with source ids', /Provenance/i.test(rev) && /obs_1|corpus_a/.test(rev), rev.slice(0, 120));
  check('review panel offers Approve + Reject', /Approve/.test(rev) && /Reject/.test(rev));

  section('VISUAL REVIEW — UNKNOWN geometry is honest, no fabricated A4');
  await page.evaluate("window.__cur.controller.setTab('visual_templates')");
  await sleep(30);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.cur-card')].find((c) => /header-block-a/.test(c.textContent));
    card.click();
  });
  await page.waitForFunction("window.__cur.getState().detail !== null", { timeout: 3000 });
  const vrev = await page.evaluate(() => document.querySelector('.cur-console').textContent);
  check('the unknown-geometry template shows "Geometry unavailable"', /Geometry unavailable/i.test(vrev), vrev.slice(0, 160));
  check('no fabricated A4 / 595 / 842 dimension is shown', !/\b595\b|\b841\b|\b842\b|A4/i.test(vrev), vrev);

  section('CONFLICTS — both sides, NO recommended winner');
  await page.evaluate("window.__cur.controller.setTab('conflicts')");
  await sleep(30);
  const conf = await page.evaluate(() => {
    const sides = document.querySelectorAll('.cur-conflict__side');
    const txt = document.querySelector('.cur-console').textContent;
    return { sides: sides.length, txt };
  });
  check('at least one conflict with two sides is rendered', conf.sides >= 2, conf.sides);
  check('the words "No recommended winner" appear', /No recommended winner/i.test(conf.txt));
  check('nothing renders "recommended winner: <something>"', !/recommended winner\s*[:=]\s*\S/i.test(conf.txt));
  check('the VS separator is shown (both sides, no pick)', /\bVS\b/.test(conf.txt));

  section('APPROVAL — explicit dialog; empty rationale refused; real rationale → one approve call + toast');
  await page.evaluate("window.__cur.reset()");
  await page.evaluate("window.__cur.controller.load()");
  await sleep(40);
  await page.evaluate("window.__cur.controller.setTab('style_rules')");
  await sleep(30);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.cur-card')].find((c) => /Yth\./.test(c.textContent) && !/Kepada/.test(c.textContent));
    card.click();
  });
  await page.waitForFunction("window.__cur.getState().detail !== null", { timeout: 3000 });
  await clickByText(page, '.cur-btn', /^Approve$/);
  await page.waitForSelector('.cur-dialog', { timeout: 3000 });
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('.cur-dialog');
    return { role: d.getAttribute('role'), labelled: !!d.getAttribute('aria-labelledby'), hasTextarea: !!d.querySelector('textarea'), showsWhat: /What becomes authoritative/i.test(d.textContent) };
  });
  check('the confirm dialog is role="dialog" and labelled', dlg.role === 'dialog' && dlg.labelled, dlg);
  check('the dialog shows exactly what becomes authoritative + a rationale textarea', dlg.showsWhat && dlg.hasTextarea, dlg);

  // confirm with an EMPTY rationale → refused
  await clickByText(page, '.cur-dialog .cur-btn', /Approve rule/);
  await sleep(60);
  let st = await page.evaluate('window.__cur.getState()');
  calls = await page.evaluate('window.__cur.calls');
  check('empty-rationale confirm is REFUSED with "rationale is required"', st.decision && /rationale is required/i.test(st.decision.error), st.decision);
  check('no approve call was made', calls.approve === 0, calls);
  check('the rule is still proposed', (await page.evaluate('window.__cur.styleRules()')).find((r) => /^Yth\.$/.test(r.value)).status === 'proposed');

  // type a real rationale → confirm
  await page.type('.cur-dialog textarea', 'Disetujui: bentuk yang dipakai pada NOR periode berjalan.');
  await clickByText(page, '.cur-dialog .cur-btn', /Approve rule/);
  await page.waitForFunction("window.__cur.getState().lastOutcome !== null", { timeout: 3000 });
  calls = await page.evaluate('window.__cur.calls');
  st = await page.evaluate('window.__cur.getState()');
  const toast = await page.evaluate(() => { const t = document.querySelector('.cur-toast'); return t ? t.textContent : ''; });
  check('exactly ONE approve call', calls.approve === 1, calls);
  check('a success toast is shown', /approved/i.test(toast), toast);
  check('the rule is now approved in the store', (await page.evaluate('window.__cur.styleRules()')).find((r) => /^Yth\.$/.test(r.value)).status === 'approved');
  check('the confirm dialog closed', (await page.$('.cur-dialog')) === null);

  section('REJECTION — through the dialog');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.cur-card')].find((c) => /Hormat kami/.test(c.textContent));
    // 'Hormat kami' is approved in the seed → its only action is Deprecate; pick 'Kepada Yth.' (proposed) instead
    const kep = [...document.querySelectorAll('.cur-card')].find((c) => /Kepada Yth\./.test(c.textContent));
    (kep || card).click();
  });
  await page.waitForFunction("window.__cur.getState().detail !== null", { timeout: 3000 });
  await clickByText(page, '.cur-btn', /^Reject$/);
  await page.waitForSelector('.cur-dialog', { timeout: 3000 });
  await page.type('.cur-dialog textarea', 'Bukan bentuk yang dipakai PBSI.');
  await clickByText(page, '.cur-dialog .cur-btn', /Reject proposal/);
  await page.waitForFunction("window.__cur.calls.reject === 1", { timeout: 3000 });
  check('exactly ONE reject call', (await page.evaluate('window.__cur.calls')).reject === 1);
  check('the proposal is now rejected + retained', (await page.evaluate('window.__cur.styleRules()')).find((r) => /Kepada Yth\./.test(r.value)).status === 'rejected');

  section('Post-run safety re-check');
  check('still 0 requests to blocked hosts after the full run', offNetwork.length === 0, offNetwork);
  check('no uncaught page errors during the run', pageErrors.length === 0, pageErrors);

  await browser.close();
  server.close();
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); try { server.close(); } catch {} process.exit(1); });
