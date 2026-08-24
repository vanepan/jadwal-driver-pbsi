import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'scratch');
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
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) console.log('[console error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1194, height: 834 },
  mobile: { width: 402, height: 874, isMobile: true },
  mobile375: { width: 375, height: 812, isMobile: true },
  mobile390: { width: 390, height: 844, isMobile: true },
  mobile430: { width: 430, height: 932, isMobile: true },
};

const BUILD_CTX_FN = `(function buildCtx() {
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const iso = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86400000));
  return {
    user: { id: 'u1', name: 'Andi Wijaya', role: 'admin' }, role: 'admin',
    assignments: [
      { id: 'a1', date: today, status: 'completed', vehicle: 'B1001', driver: 'Budi', startTime: '08:10', endTime: '09:40' },
      { id: 'a2', date: today, status: 'scheduled', vehicle: 'B1002', driver: 'Siti', startTime: '14:00', endTime: '16:00' },
      { id: 'a3', date: today, status: 'completed', vehicle: 'B1002', driver: 'Siti', startTime: '09:00', endTime: '10:30' },
      { id: 'a4', date: tomorrow, status: 'scheduled', vehicle: 'B1003' },
      { id: 'a5', date: tomorrow, status: 'scheduled', vehicle: 'B1004' },
    ],
    requests: [
      { id: 'r1', status: 'pending', createdAt: iso(12, 30), purpose: 'Transport Pelatnas', requesterName: 'Bidang Latihan' },
    ],
    logs: [
      { id: 'l1', action: 'assignment_started', createdAt: iso(8, 10), metadata: { destination: 'Pelatnas' }, displayName: 'Budi' },
      { id: 'l2', action: 'assignment_completed', createdAt: iso(9, 40), metadata: { driver: 'Budi', destination: 'Pelatnas' } },
      { id: 'l3', action: 'request_created', createdAt: iso(12, 30), targetId: 'r1' },
    ],
    engineeringEvents: [
      { type: 'started', timestamp: iso(11, 15), assignmentTitle: 'Servis Rutin', id: 'e0' },
      { type: 'finished', timestamp: iso(13, 57), assignmentId: 'e1', assignmentTitle: 'Servis Rutin' },
    ],
    drivers: [{ id: 'd1', name: 'Budi' }, { id: 'd2', name: 'Siti' }],
    vehicles: [
      { id: 'veh1', name: 'B1001', color: '#c0392b' },
      { id: 'veh2', name: 'B1002', color: '#2980b9' },
      { id: 'veh3', name: 'B1003', color: '#27ae60' },
    ],
    actions: {},
    models: {
      exec: { driverKpis: { activeVehicles: 5, activeDrivers: 4 }, score: { value: 78, level: 'good', label: 'Baik' }, scoreBreakdown: { components: [] } },
      engineering: { overdueAssignments: { count: 1 } },
      wellness: { summary: { burnoutRisk: 0, highFatigue: 0, atRiskDrivers: 0 } },
      pettyLowBalance: { low: false },
    },
    recommendations: {
      certified: true,
      board: {
        isHealthyFleet: false,
        critical: [{ vehicleName: 'Innova B1005', categoryLabel: 'Servis Kritis', reason: 'Jadwal servis terlewat 5 hari.' }],
        upcoming: [
          { vehicleId: 'veh2', vehicleName: 'B1002', categoryLabel: 'Servis Preventif', reason: 'Mendekati jadwal servis berkala.', timeline: { label: 'Minggu Ini' } },
          { vehicleId: 'veh3', vehicleName: 'B1003', categoryLabel: 'Pemantauan', reason: 'Indikator performa mendekati ambang batas.', timeline: { label: 'Bulan Ini' } },
        ],
      },
      recs: [
        { title: 'Jadwalkan servis Innova B1005', reason: 'Servis terlewat 5 hari, risiko kerusakan meningkat.', expectedBenefit: 'Mencegah downtime mendadak.', priority: { label: 'Tinggi', tone: 'danger', rank: 0 }, category: 'maintenance', actionable: true },
      ],
    },
    vehicleFlags: { top: [
      { vehicleId: 'veh1', vehicleName: 'B1001', typeLabel: 'Mobil', statusLabel: 'Servis Terjadwal', tone: 'warn' },
      { vehicleId: 'veh2', vehicleName: 'B1002', typeLabel: 'Mobil', statusLabel: 'Baik', tone: 'good' },
    ] },
  };
})`;

async function shot(vp, theme, tag) {
  await page.setViewport(VIEWPORTS[vp]);
  await page.goto(`http://localhost:${port}/scripts/workspace-foundation-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.evaluate(async (buildCtxSrc) => {
    const router = await import('/js/workspace/home-router.js');
    const buildCtx = eval(buildCtxSrc);
    const host = document.getElementById('host');
    host.className = 'exec-ui v2-analytics-claude';
    await router.renderHome(host, buildCtx());
    await new Promise((r) => setTimeout(r, 900));
  }, BUILD_CTX_FN);
  const name = `phase7d-${vp}-${theme}${tag || ''}.png`;
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  console.log('saved', name);
}

const only = process.argv[2];
const sets = only ? [only] : ['desktop', 'tablet', 'mobile'];
for (const vp of sets) {
  await shot(vp, 'light');
  if (vp === 'desktop' || vp === 'mobile') await shot(vp, 'dark');
}

await browser.close();
server.close();
