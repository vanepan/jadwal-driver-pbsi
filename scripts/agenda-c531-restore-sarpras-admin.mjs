/* agenda-c531-restore-sarpras-admin.mjs — V1.31 C5.3.1 Authorization Model Correction

   Restores /users/sarpras.role to 'admin' via the REAL, canonical User
   Management edit-user flow (same mechanism C5.3 used to change it away
   from 'admin' in the first place) — never a hand-written RTDB patch.

   Does NOT touch /customRoles/role_viewer-copy (left in place, unassigned,
   per instruction not to delete it yet) and does NOT touch
   agendaParticipantType, displayName, active, or credentials.

   Run: node scripts/agenda-c531-restore-sarpras-admin.mjs */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8940;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function dbGet(nodePath) {
  const tmp = path.join(os.tmpdir(), `c531-${nodePath.replace(/\//g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync('firebase', ['database:get', `/${nodePath}`, '-o', tmp], { cwd: ROOT, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`firebase database:get /${nodePath} failed: ${res.stderr || res.stdout}`);
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  fs.unlinkSync(tmp);
  return raw === 'null' || raw === '' ? null : JSON.parse(raw);
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  console.log('=== PREFLIGHT (read-only) ===');
  const sarprasBefore = dbGet('users/sarpras');
  console.log('  /users/sarpras before:', JSON.stringify(sarprasBefore));
  if (sarprasBefore?.role !== 'role_viewer-copy') {
    throw new Error(`[ABORT] expected /users/sarpras.role === 'role_viewer-copy', got "${sarprasBefore?.role}" — state has moved, re-check before proceeding`);
  }

  const server = await startServer();
  let browser, page;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('\n=== [Login] real production, as admin ===');
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('#loginForm', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
    await page.type('#loginUsername', 'admin');
    await page.type('#loginPin', '1234');
    await page.waitForSelector('.login-submit', { visible: true, timeout: 10000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.login-submit');
    await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('pbsi_current_user') || 'null')?.username === 'admin'; } catch { return false; } }, { timeout: 30000 });
    console.log('  logged in as admin');
    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => { document.getElementById('btnPushDismiss')?.click(); });
    await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });

    console.log('\n=== [Navigate] Control domain -> Users tab ===');
    await page.waitForFunction(() => !!document.querySelector('[data-domain="control"]'), { timeout: 20000 });
    let tabsReady = false;
    for (let attempt = 1; attempt <= 6 && !tabsReady; attempt++) {
      await page.click('[data-domain="control"]');
      try {
        await page.waitForFunction(() => document.querySelectorAll('[data-top]').length > 1, { timeout: 4000 });
        tabsReady = true;
      } catch {
        await page.click('[data-domain="today"]');
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!tabsReady) throw new Error('[ABORT] Control domain tab bar never became ready');
    await page.click('[data-top="users"]');
    await page.waitForSelector('[data-user-action="edit"][data-user-name="sarpras"]', { timeout: 15000 });

    const modalWasHidden = await page.evaluate(() => {
      const el = document.getElementById('modalUsersList');
      const hidden = el && getComputedStyle(el).display === 'none';
      if (hidden) el.style.display = 'flex';
      return hidden;
    });
    console.log(`  #modalUsersList required the display reveal workaround: ${modalWasHidden}`);
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => document.querySelector('[data-user-action="edit"][data-user-name="sarpras"]')?.click());
    await page.waitForSelector('#userFieldRole', { timeout: 10000 });
    const prefill = await page.evaluate(() => ({
      username: document.getElementById('userFieldUsername')?.value,
      displayName: document.getElementById('userFieldDisplayName')?.value,
      role: document.getElementById('userFieldRole')?.value,
    }));
    console.log('  edit modal prefilled with:', JSON.stringify(prefill));
    if (prefill.username !== 'sarpras' || prefill.displayName !== 'Kepala Bidang Sarana dan Prasarana' || prefill.role !== 'role_viewer-copy') {
      throw new Error(`[ABORT] edit modal did not prefill as expected: ${JSON.stringify(prefill)}`);
    }

    console.log('\n=== [Restore] set Role back to Admin (system role, not a Custom Role) ===');
    const optionFound = await page.evaluate(() => {
      const sel = document.getElementById('userFieldRole');
      const opt = [...sel.options].find((o) => o.value === 'admin');
      if (!opt) return false;
      sel.value = 'admin';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    if (!optionFound) throw new Error('[ABORT] "admin" option not present in #userFieldRole');
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-c531-restore-role-selected.png') });
    await page.evaluate(() => document.getElementById('btnSaveUserForm')?.click());
    await new Promise((r) => setTimeout(r, 1200));
    console.log('  submitted user edit form');

    console.log('\n=== [Verify via fresh RTDB read] ===');
    const sarprasAfter = dbGet('users/sarpras');
    console.log('  /users/sarpras after:', JSON.stringify(sarprasAfter));
    if (sarprasAfter.role !== 'admin') throw new Error(`[ABORT] /users/sarpras.role is "${sarprasAfter.role}", expected "admin"`);
    if (sarprasAfter.active !== true || sarprasAfter.displayName !== 'Kepala Bidang Sarana dan Prasarana') {
      throw new Error(`[ABORT] unexpected field change: ${JSON.stringify(sarprasAfter)}`);
    }
    const changedKeys = Object.keys({ ...sarprasBefore, ...sarprasAfter }).filter((k) => JSON.stringify(sarprasBefore[k]) !== JSON.stringify(sarprasAfter[k]));
    console.log(`  changed keys: [${changedKeys.join(', ')}]`);

    const profileAfter = dbGet('userProfiles/sarpras');
    console.log(`  /userProfiles/sarpras (mirror): ${JSON.stringify(profileAfter)}`);
    if (profileAfter?.role !== 'admin' || profileAfter?.agendaParticipantType !== 'kabid') {
      throw new Error(`[ABORT] mirror did not correctly restore: ${JSON.stringify(profileAfter)}`);
    }
    const credLeak = Object.keys(profileAfter).some((k) => /pin|password|secret|token/i.test(k));
    console.log(`  credential-shaped field in profile: ${credLeak}`);

    const customRoleStill = dbGet('customRoles/role_viewer-copy');
    console.log(`  /customRoles/role_viewer-copy (left untouched, now unassigned): ${JSON.stringify(customRoleStill)}`);

    console.log('\n=== DONE — sarpras restored to role: admin ===');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => { console.error('\n[agenda-c531-restore-sarpras-admin] FATAL:', err.stack || err.message); process.exit(1); });
