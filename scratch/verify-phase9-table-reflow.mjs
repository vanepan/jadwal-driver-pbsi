// Phase 9 mobile-first audit — structural verification that the new
// Engineering/Overtime/Petty-Cash mobile table/form CSS actually takes
// effect on real markup shaped like what each module's render function
// produces (not the full authenticated app — same "real CSS, synthetic
// fragment" pattern as scratch/verify-pending-workspace-reconciler.mjs,
// necessary because these screens require real Firebase auth to reach).
import puppeteer from 'puppeteer';
import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p);
  try {
    const body = readFileSync(file);
    const ext = path.extname(file);
    const type = { '.css': 'text/css', '.html': 'text/html' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`OK   ${label}${extra ? ' ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' ' + extra : ''}`); }
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function renderFragment(cssFile, rootClass, bodyHtml, width = 375) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  const html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="/${cssFile}"></head><body class="${rootClass}">${bodyHtml}</body></html>`;
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' }); // establish real origin first
  await page.setContent(html, { waitUntil: 'networkidle0' });
  return page;
}

// ── Engineering: .eng-table reflow at 375px ──
{
  const page = await renderFragment('engineering.css', 'eng-root', `
    <div class="eng-table-wrap"><table class="eng-table"><thead><tr><th>Penugasan</th><th>Status</th></tr></thead>
      <tbody><tr><td data-label="Penugasan">AC Ruang A</td><td data-label="Status">Selesai</td></tr></tbody></table></div>`);
  const info = await page.evaluate(() => {
    const table = document.querySelector('.eng-table');
    const td = document.querySelector('td[data-label="Penugasan"]');
    return {
      tableDisplay: getComputedStyle(table).display,
      theadDisplay: getComputedStyle(document.querySelector('.eng-table thead')).display,
      beforeContent: td ? getComputedStyle(td, '::before').content : null,
    };
  });
  check('engineering: .eng-table becomes display:block at 375px', info.tableDisplay === 'block', JSON.stringify(info));
  check('engineering: thead hidden at 375px', info.theadDisplay === 'none', JSON.stringify(info));
  check('engineering: td[data-label]::before renders the label', info.beforeContent === '"Penugasan"', JSON.stringify(info));
  await page.close();
}

// ── Engineering: .eng-field-row collapses + .eng-input hits 16px at 375px ──
{
  const page = await renderFragment('engineering.css', 'eng-root', `
    <div class="eng-field-row"><input class="eng-input"/><input class="eng-input"/></div>`);
  const info = await page.evaluate(() => {
    const row = document.querySelector('.eng-field-row');
    const input = document.querySelector('.eng-input');
    return { cols: getComputedStyle(row).gridTemplateColumns, fontSize: getComputedStyle(input).fontSize };
  });
  const oneCol = info.cols.trim().split(/\s+/).length === 1;
  check('engineering: .eng-field-row collapses to 1 column at 375px', oneCol, JSON.stringify(info));
  check('engineering: .eng-input hits 16px at 375px (iOS zoom guard)', info.fontSize === '16px', JSON.stringify(info));
  await page.close();
}

// ── Overtime: .ot-records-table reflow at 375px + .ot-row-btn touch target ──
{
  const page = await renderFragment('overtime.css', 'ot-root', `
    <div class="ot-records-table-wrap"><table class="ot-records-table"><thead><tr><th>Tanggal</th></tr></thead>
      <tbody><tr><td data-label="Tanggal">01/01</td><td><button class="ot-row-btn">Edit</button></td></tr></tbody></table></div>`);
  const info = await page.evaluate(() => {
    const table = document.querySelector('.ot-records-table');
    const btn = document.querySelector('.ot-row-btn');
    return { tableDisplay: getComputedStyle(table).display, btnMinHeight: getComputedStyle(btn).minHeight };
  });
  check('overtime: .ot-records-table becomes display:block at 375px', info.tableDisplay === 'block', JSON.stringify(info));
  check('overtime: .ot-row-btn min-height is 44px', info.btnMinHeight === '44px', JSON.stringify(info));
  await page.close();
}

// ── Overtime: .ot-history-table / .ot-closing-table / .ot-preview-table reflow ──
for (const cls of ['ot-history-table', 'ot-closing-table', 'ot-preview-table']) {
  const page = await renderFragment('overtime.css', 'ot-root', `
    <table class="${cls}"><thead><tr><th>A</th></tr></thead><tbody><tr><td data-label="A">x</td></tr></tbody></table>`);
  const display = await page.evaluate((c) => getComputedStyle(document.querySelector('.' + c)).display, cls);
  check(`overtime: .${cls} becomes display:block at 375px`, display === 'block', display);
  await page.close();
}

// ── Petty Cash: .pc-add-grid collapses + .pc-add-input hits 16px + button target ──
{
  const page = await renderFragment('petty-cash.css', 'pc-root', `
    <div class="pc-add-box"><div class="pc-add-grid"><input class="pc-add-input"/></div>
    <div class="pc-add-foot"><button class="pc-add-btn pc-add-btn--save">Simpan</button></div></div>`);
  const info = await page.evaluate(() => {
    const grid = document.querySelector('.pc-add-grid');
    const input = document.querySelector('.pc-add-input');
    const btn = document.querySelector('.pc-add-btn--save');
    return { gridCols: getComputedStyle(grid).gridTemplateColumns, fontSize: getComputedStyle(input).fontSize, btnMinHeight: getComputedStyle(btn).minHeight };
  });
  const oneCol = info.gridCols.trim().split(/\s+/).length === 1;
  check('pettycash: .pc-add-grid collapses to 1 column at 375px', oneCol, JSON.stringify(info));
  check('pettycash: .pc-add-input hits 16px at 375px (iOS zoom guard)', info.fontSize === '16px', JSON.stringify(info));
  check('pettycash: .pc-add-btn--save min-height is 44px', info.btnMinHeight === '44px', JSON.stringify(info));
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
