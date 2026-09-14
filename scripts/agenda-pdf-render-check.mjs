/* agenda-pdf-render-check.mjs — REAL render + visual QA for the Agenda
   PDF export (V1.31 Agenda & To-Do, Phase C4)

   Real headless Chromium, the REAL js/docs pipeline (doc-engine,
   template-registry, pdf-exporter — which lazy-loads the REAL pdfmake
   from cdnjs, exactly like production), the REAL js/docs/templates/
   agenda.js template, and the REAL pure buildAgendaPdfViewModel(). Not a
   mock, not a fake blob. Every generated PDF is saved to scratch/ AND
   screenshotted via Chromium's own built-in PDF viewer (navigate to the
   file, screenshot what renders) so the output is actually inspected,
   not just asserted to exist.

   Run: node scripts/agenda-pdf-render-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRATCH = path.join(ROOT, 'scratch');
if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.stack || err.message}`); }
}

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>agenda pdf render harness</title></head><body>
<script type="module">
  import { buildAgendaPdfViewModel } from '/js/agenda/agenda-pdf-view-model.js';
  import * as DocumentEngine from '/js/docs/doc-engine.js';
  import '/js/docs/templates/agenda.js';

  function bufToBase64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  window.__buildAndGenerate = async (input) => {
    const vm = buildAgendaPdfViewModel(input);
    const doc = await DocumentEngine.generate('agenda', vm, { cache: false });
    const buf = await doc.blob.arrayBuffer();
    return { base64: bufToBase64(buf), filename: doc.filename, byteLength: buf.byteLength, vm, definition: doc.definition };
  };
  window.__harnessReady = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/__harness.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HARNESS);
    return;
  }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const DIRECTORY = {
  evan: { displayName: 'Evan Pratama', class: 'sarpras' },
  leo: { displayName: 'Leo Saputra', class: 'sarpras' },
  grace: { displayName: 'Grace Wijaya', class: 'sarpras' },
  kabid: { displayName: 'Drs. Suryanto, M.T.', class: 'kabid' },
};

const NOW = new Date('2026-09-11T08:00:00+07:00').getTime();

function evt(overrides = {}) {
  return {
    id: 'e' + Math.random(), title: 'Rapat Koordinasi Sarana dan Prasarana Triwulan', type: 'rapat',
    date: '2026-09-09', allDay: false, startAt: NOW, endAt: NOW + 3600000, location: 'Ruang Rapat Utama Lt. 2',
    status: 'scheduled',
    participants: { evan: { isPic: true, status: 'accepted' }, leo: { isPic: false, status: 'invited' }, kabid: { isPic: false, status: 'accepted' } },
    ...overrides,
  };
}
function task(overrides = {}) {
  return {
    id: 't' + Math.random(), title: 'Siapkan Dokumen Serah Terima Kendaraan Dinas', priority: 'urgent', status: 'in_progress',
    dueDate: '2026-09-10', dueTime: '17:00', dueAt: NOW - 3600000,
    responsible: { grace: true, kabid: true },
    checklist: [{ id: 'c1', label: 'Draf', done: true }, { id: 'c2', label: 'Review', done: false }],
    ...overrides,
  };
}

const RANGE_WEEK = { start: '2026-09-07', end: '2026-09-13', label: 'Minggu ini' };
const RANGE_MONTH = { start: '2026-09-01', end: '2026-09-30', label: 'Bulan ini' };
const RANGE_CUSTOM = { start: '2026-01-01', end: '2026-01-31', label: 'Custom' };

const VARIANTS = [
  { name: 'week-combined', input: { events: [evt(), evt({ id: 'e2', title: 'Kunjungan Kerja Bidang Sarpras', type: 'kunjungan', date: '2026-09-11', location: 'Kantor Pusat' })], tasks: [task(), task({ id: 't2', title: 'Task Selesai', status: 'done', dueDate: '2026-09-08' })], range: RANGE_WEEK, filters: { mode: 'semua' }, directory: DIRECTORY, now: NOW } },
  { name: 'month-agenda-only', input: { events: [evt()], tasks: [task()], range: RANGE_MONTH, filters: { mode: 'agenda' }, directory: DIRECTORY, now: NOW } },
  { name: 'custom-todo-only', input: { events: [evt()], tasks: [task(), task({ id: 't3', title: 'Overdue Task', dueDate: '2026-01-05', dueTime: '00:00', dueAt: new Date('2026-01-05T00:00:00+07:00').getTime(), status: 'in_progress' })], range: RANGE_CUSTOM, filters: { mode: 'todo' }, directory: DIRECTORY, now: NOW } },
  { name: 'empty-range', input: { events: [], tasks: [], range: RANGE_WEEK, filters: { mode: 'semua' }, directory: DIRECTORY, now: NOW } },
  { name: 'multi-pic-kabid-longtitle', input: { events: [evt({ id: 'e-long', title: 'Rapat Koordinasi Lintas Bidang Mengenai Penataan Ulang Aset Kendaraan Dinas dan Fasilitas Pendukung Operasional Tahun Anggaran 2026', participants: { evan: { isPic: true, status: 'accepted' }, leo: { isPic: true, status: 'accepted' }, grace: { isPic: false, status: 'declined' }, kabid: { isPic: false, status: 'tentative' } } })], tasks: [], range: RANGE_WEEK, filters: { mode: 'agenda' }, directory: DIRECTORY, now: NOW } },
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
  await page.goto(`http://localhost:${port}/__harness.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => window.__harnessReady === true, { timeout: 10000 });

  console.log('\n=== [A — real pdfmake render, each variant, saved + screenshotted] ===');
  const savedFiles = [];
  for (const variant of VARIANTS) {
    await checkAsync(`${variant.name}: generates a real, non-trivial PDF via the real pipeline`, async () => {
      const result = await page.evaluate((input) => window.__buildAndGenerate(input), variant.input);
      if (!result.byteLength || result.byteLength < 500) throw new Error(`suspiciously small PDF: ${result.byteLength} bytes`);
      const pdfPath = path.join(SCRATCH, `agenda-pdf-${variant.name}.pdf`);
      fs.writeFileSync(pdfPath, Buffer.from(result.base64, 'base64'));
      savedFiles.push({ name: variant.name, pdfPath });
      console.log(`      saved ${pdfPath} (${result.byteLength} bytes)`);
    });
  }

  console.log('\n=== [B — actually render each PDF in Chromium\'s own viewer and screenshot it] ===');
  for (const { name, pdfPath } of savedFiles) {
    await checkAsync(`${name}: screenshot captured from the real rendered PDF`, async () => {
      const pdfPage = await browser.newPage();
      await pdfPage.setViewport({ width: 900, height: 1200 });
      const fileUrl = 'file:///' + pdfPath.replace(/\\/g, '/');
      await pdfPage.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise((r) => setTimeout(r, 600));
      const pngPath = path.join(SCRATCH, `agenda-pdf-${name}.png`);
      await pdfPage.screenshot({ path: pngPath });
      await pdfPage.close();
      const stat = fs.statSync(pngPath);
      if (stat.size < 1000) throw new Error(`screenshot suspiciously small (${stat.size} bytes) — PDF viewer may not have rendered`);
      console.log(`      saved ${pngPath}`);
    });
  }

  console.log('\n=== [C — identity transform holds through the FULL real pdfmake render (not just the pure view-model)] ===');
  await checkAsync('the combined week report\'s view-model AND rendered pdfmake definition never contain a raw Sarpras-staff display name', async () => {
    const result = await page.evaluate((input) => window.__buildAndGenerate(input), VARIANTS[0].input);
    const vmJson = JSON.stringify(result.vm);
    const defJson = JSON.stringify(result.definition);
    for (const leaked of ['Evan Pratama', 'Leo Saputra', 'Grace Wijaya']) {
      if (vmJson.includes(leaked)) throw new Error(`"${leaked}" leaked into the pure view-model`);
      if (defJson.includes(leaked)) throw new Error(`"${leaked}" leaked into the actual rendered pdfmake definition`);
    }
    if (!vmJson.includes('"hasSarprasTeam":true')) throw new Error('expected hasSarprasTeam:true on the view-model item');
    if (!defJson.includes('Tim Sarpras')) throw new Error('expected the rendered PDF definition to contain the collapsed "Tim Sarpras" label');
    if (!defJson.includes('Suryanto')) throw new Error('expected the Kabid participant to be individually named in the rendered PDF');
    if (defJson.includes('Generated By') || defJson.includes('generatedBy')) throw new Error('an individual "Generated By" field leaked into the rendered PDF');
  });

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
