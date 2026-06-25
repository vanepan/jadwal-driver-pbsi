/* request-workflow-check.mjs — DOM integration test for the Request Workflow
   Separation (v1.16.4.11-beta.3).
   Run: node scripts/request-workflow-check.mjs   (exit 0 = pass)

   Part A — loads the REAL index.html (unauthenticated, like the boot smoke) and
   asserts the structural separation: requesters can no longer pick driver/vehicle
   or see any dispatch internals, while the admin approval/override modal and the
   admin direct-assignment hint slots exist.
   Part B — loads the REAL requestToAssignment via a tiny harness and asserts the
   admin decision resolves the effective driver/vehicle (recommendation vs override). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

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

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

/* ── Part A: structural separation in the REAL app shell ─────────────── */
console.log('\n[A: requester / admin workflow separation]');
const bootErrors = [];
const pageA = await browser.newPage();
pageA.on('pageerror', (e) => bootErrors.push('pageerror: ' + e.message));
pageA.on('console', (m) => { if (m.type() === 'error') bootErrors.push('console.error: ' + m.text()); });
await pageA.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));

const dom = await pageA.evaluate(() => {
  const has = (id) => !!document.getElementById(id);
  const requestForm = document.getElementById('requestForm');
  return {
    reqDriver: has('requestFieldDriver'),
    reqVehicle: has('requestFieldVehicle'),
    reqPanel: has('requestIntelligencePanel'),
    reqPax: has('requestFieldPax'),
    reqPurpose: has('requestFieldPurpose'),
    reqHasSelect: !!(requestForm && requestForm.querySelector('select')),
    approveModal: has('modalApproveRequest'),
    approveDriver: has('approveDriverSelect'),
    approveVehicle: has('approveVehicleSelect'),
    approveReason: has('approveReason'),
    confirmLabel: (document.getElementById('btnConfirmApprove') || {}).textContent || '',
    driverHint: has('assignmentDriverHint'),
    vehicleHint: has('assignmentVehicleHint'),
  };
});

check('requesters CANNOT select driver (#requestFieldDriver removed)', dom.reqDriver === false);
check('requesters CANNOT select vehicle (#requestFieldVehicle removed)', dom.reqVehicle === false);
check('no dispatch panel in requester form (#requestIntelligencePanel removed)', dom.reqPanel === false);
check('request form has NO <select> at all (no dispatch internals)', dom.reqHasSelect === false);
check('requester still provides passenger count + purpose', dom.reqPax === true && dom.reqPurpose === true);
check('admin approval/override modal present with driver+vehicle+reason',
  dom.approveModal && dom.approveDriver && dom.approveVehicle && dom.approveReason);
check('approval modal confirm button = "Simpan & Setujui" (beta.3.1)', /Simpan & Setujui/.test(dom.confirmLabel));
check('admin direct-assignment hint slots present', dom.driverHint && dom.vehicleHint);

const fatal = bootErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e));
check('no fatal boot errors after the refactor', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('     ✗', e.slice(0, 200)));

/* ── Part B: requestToAssignment resolves the admin decision (real code) ─ */
console.log('\n[B: effective driver/vehicle resolution]');
const pageB = await browser.newPage();
await pageB.goto(`http://localhost:${port}/scripts/request-workflow-harness.html`, { waitUntil: 'networkidle2', timeout: 45000 });
await pageB.waitForFunction('window.__ready === true', { timeout: 20000 });
const model = await pageB.evaluate(() => {
  const base = { id: 'r', startDate: '2026-06-24', startTime: '08:00', endTime: '12:00', pax: 4, purpose: 'Jemput', recommendedDriver: 'Andi', recommendedVehicle: 'Toyota Innova' };
  const accepted = window.__requestToAssignment(base, { name: 'Admin' }, '2026-06-24');
  const overridden = window.__requestToAssignment(base, { name: 'Admin' }, '2026-06-24', { driver: 'Budi', vehicle: 'Daihatsu Luxio' });
  return { accDriver: accepted.driver, accVehicle: accepted.vehicle, ovrDriver: overridden.driver, ovrVehicle: overridden.vehicle };
});
check('approve (no decision) → uses recommended driver + vehicle', model.accDriver === 'Andi' && model.accVehicle === 'Toyota Innova');
check('override decision → replaces driver + vehicle', model.ovrDriver === 'Budi' && model.ovrVehicle === 'Daihatsu Luxio');

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
