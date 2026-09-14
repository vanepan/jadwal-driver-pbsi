/* agenda-workspace-render-check.mjs — real headless-Chromium test of the
   Agenda & To-Do workspace UI (V1.31 Agenda & To-Do, Phase C3)

   Mirrors this repo's established harness pattern (e.g.
   domain-shell-overtime-render-check.mjs / workspace-foundation-check.mjs):
   a local static file server serves the REAL repo tree; Puppeteer
   navigates to scripts/agenda-workspace-harness.html, which
   <script type="module">-imports the REAL production modules (not a
   mock) and seeds a synchronous 'admin' session in localStorage so
   permission-gated UI (writableScopes(), the create buttons) resolves
   correctly with no live Firebase/emulator connection — see the
   harness file's own comment for why that seeding is safe here
   (this harness never boots app.js's Firebase-auth listener, the thing
   that normally clears a faked session).

   Covers: buildWorkspaceHTML() across all 3 modes + loading/empty/error
   states, Kabid-scope visual distinction, drawer open/validate/picker/
   checklist interaction (via a test-only directory seed — see
   agenda-directory.js#__setDirectoryForTest, never used by production
   code), and responsive/dark-mode checks at 390/640/768/1440px with
   screenshots saved for visual QA.

   Run: node scripts/agenda-workspace-render-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8934;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

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

function baseCtx(overrides = {}) {
  return {
    events: [], tasks: [], now: Date.now(), todayStr: '2026-09-11',
    mode: 'agenda', calendarView: 'month', calendarAnchor: '2026-09-11',
    todoFilters: { status: 'all', priority: 'all', query: '' },
    canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
    ...overrides,
  };
}

const sampleEvent = (id, over = {}) => ({
  id, title: `Rapat ${id}`, date: '2026-09-11', startAt: Date.parse('2026-09-11T09:00:00+07:00'),
  endAt: Date.parse('2026-09-11T10:00:00+07:00'), allDay: false, type: 'rapat', location: 'Ruang Rapat',
  scope: 'sarpras_shared', organizerUsername: 'harness-admin', status: 'scheduled',
  participants: { picuser: { isPic: true } }, ...over,
});
const sampleTask = (id, over = {}) => ({
  id, title: `Tugas ${id}`, status: 'not_started', priority: 'urgent', scope: 'sarpras_shared',
  responsible: {}, checklist: [], dueDate: '2026-09-11', dueAt: Date.now() + 3600000, ...over,
});

async function main() {
  const server = await startServer();
  let browser;
  const consoleErrors = [];
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(`http://localhost:${PORT}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });

    console.log('\n=== [A — buildWorkspaceHTML: modes + content] ===');
    await checkAsync('agenda mode renders the section title', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.getElementById('root').textContent.includes('Agenda & To-Do');
    }, baseCtx()));
    await checkAsync('agenda mode with data shows the event title and PIC label', () => page.evaluate((ctx) => {
      window.__render(ctx);
      const html = document.getElementById('root').innerHTML;
      return html.includes('Rapat e1') && html.includes('PIC:');
    }, baseCtx({ events: [sampleEvent('e1')] })));
    await checkAsync('empty agenda shows a real empty state, not a blank screen', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.querySelector('.cal-empty') != null;
    }, baseCtx()));
    await checkAsync('calendar mode renders a 7-column grid with month/week toggle', () => page.evaluate((ctx) => {
      window.__render(ctx);
      const cells = document.querySelectorAll('.cal-grid .cal-cell').length;
      return cells > 0 && cells % 7 === 0 && document.body.textContent.includes('Bulan') && document.body.textContent.includes('Minggu');
    }, baseCtx({ mode: 'calendar' })));
    await checkAsync('todo mode renders status + priority filter chips', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.body.textContent.includes('Belum Mulai') && document.body.textContent.includes('Urgent');
    }, baseCtx({ mode: 'todo', tasks: [sampleTask('t1')] })));
    await checkAsync('todo mode task row shows the priority pill', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.querySelector('.cal-pill--urgent') != null;
    }, baseCtx({ mode: 'todo', tasks: [sampleTask('t1', { priority: 'urgent' })] })));

    console.log('\n=== [B — loading / error states] ===');
    await checkAsync('loading=true renders a skeleton, not the empty state', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.querySelector('.cal-skeleton') != null && document.querySelector('.cal-empty') == null;
    }, baseCtx({ loading: true })));
    await checkAsync('error renders a human message + retry action, never a raw Firebase error', () => page.evaluate((ctx) => {
      window.__render(ctx);
      const html = document.getElementById('root').innerHTML;
      return html.includes('Tidak ada agenda') && !html.toUpperCase().includes('PERMISSION_DENIED') && document.querySelector('[data-agenda-action="retry"]') != null;
    }, baseCtx({ error: 'Tidak ada agenda yang dapat ditampilkan.' })));

    console.log('\n=== [C — Kabid visual distinction] ===');
    await checkAsync('a Kabid-scope event carries a visible Kabid pill', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.querySelector('.cal-pill--kabid') != null;
    }, baseCtx({ events: [sampleEvent('e2', { scope: 'kabid' })] })));

    console.log('\n=== [D — no-permission state hides create actions, never shows them then fails silently] ===');
    await checkAsync('canManage=false + no writable scopes -> no create/FAB buttons rendered at all', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.querySelector('[data-agenda-action="create-event"]') == null && document.querySelector('.cal-fab') == null;
    }, baseCtx({ canManage: false, writableScopes: [] })));

    console.log('\n=== [D.2 — toolbar Export PDF control matches the Analytics export-button family and is grouped with the create actions, not stranded mid-toolbar] ===');
    await checkAsync('export button has a download icon, "Export PDF" label, and a chevron — not plain text', () => page.evaluate((ctx) => {
      window.__render(ctx);
      const btn = document.querySelector('[data-agenda-action="export-pdf"]');
      if (!btn) return 'button not found';
      const hasIcon = btn.querySelectorAll('svg').length >= 2; // download icon + chevron
      const hasLabel = btn.textContent.trim() === 'Export PDF';
      const notGhost = !btn.classList.contains('cal-btn--ghost');
      return hasIcon && hasLabel && notGhost;
    }, baseCtx()));
    await checkAsync('Export PDF shares one action group with + Agenda / + Tugas (same toolbar cluster, not a separate space-between child)', () => page.evaluate((ctx) => {
      window.__render(ctx);
      const exportBtn = document.querySelector('[data-agenda-action="export-pdf"]');
      const createBtn = document.querySelector('[data-agenda-action="create-event"]');
      if (!exportBtn || !createBtn) return 'buttons not found';
      return exportBtn.parentElement === createBtn.parentElement && exportBtn.parentElement.classList.contains('cal-header-actions');
    }, baseCtx()));
    await checkAsync('the toolbar row has exactly one action cluster (search + one .cal-header-actions), never a stranded mid-row button', () => page.evaluate((ctx) => {
      window.__render(ctx);
      const rows = document.querySelectorAll('.cal-header');
      const toolbarRow = rows[1]; // [0]=title/mode row, [1]=search+actions row
      return toolbarRow.querySelectorAll(':scope > .cal-header-actions').length === 1;
    }, baseCtx()));
    await checkAsync('canManage=false still shows Export PDF (export is not manage-gated) but hides + Agenda / + Tugas', () => page.evaluate((ctx) => {
      window.__render(ctx);
      return document.querySelector('[data-agenda-action="export-pdf"]') != null
        && document.querySelector('[data-agenda-action="create-event"]') == null;
    }, baseCtx({ canManage: false, writableScopes: [] })));
    await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ events: [sampleEvent('e1')], tasks: [sampleTask('t1')] }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-toolbar-desktop-light.png') });
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ events: [sampleEvent('e1')], tasks: [sampleTask('t1')] }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-toolbar-mobile-390.png') });
    await page.setViewport({ width: 1440, height: 900 });

    console.log('\n=== [E — responsive: no horizontal overflow at any required width] ===');
    for (const width of [390, 430, 640, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      await checkAsync(`${width}px — no horizontal overflow`, () => page.evaluate((ctx) => {
        window.__render(ctx);
        return document.documentElement.scrollWidth <= window.innerWidth + 1; // +1px rounding tolerance
      }, baseCtx({ mode: 'calendar', events: [sampleEvent('e1'), sampleEvent('e2', { scope: 'kabid' })], tasks: [sampleTask('t1')] })));
    }
    await fs.promises.mkdir(path.join(ROOT, 'scratch'), { recursive: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ events: [sampleEvent('e1')], tasks: [sampleTask('t1')] }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-mobile-390-light.png') });

    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ mode: 'calendar', calendarView: 'month', events: [sampleEvent('e1'), sampleEvent('e2', { date: '2026-09-14', scope: 'kabid' })], tasks: [sampleTask('t1')] }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-calendar-month.png') });
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({
      mode: 'todo',
      tasks: [sampleTask('t1', { priority: 'urgent' }), sampleTask('t2', { priority: 'penting', status: 'in_progress' }), sampleTask('t3', { priority: 'normal', status: 'done' }), sampleTask('t4', { scope: 'kabid' })],
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-todo.png') });

    console.log('\n=== [F — dark mode] ===');
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
    await checkAsync('dark mode never falls back to a hardcoded white background on the section card', () => page.evaluate((ctx) => {
      window.__render(ctx);
      // --card is scoped to .cal-root (agenda-styles.js) — CSS custom
      // properties cascade DOWNWARD only, so this must read the SCOPED
      // element, not document.documentElement (which would just read back
      // an empty string, an earlier version of this check's own bug).
      const cardBg = getComputedStyle(document.querySelector('.cal-root')).getPropertyValue('--card').trim();
      return cardBg !== '' && cardBg.toLowerCase() !== '#ffffff' && cardBg.toLowerCase() !== '#fff';
    }, baseCtx({ events: [sampleEvent('e1')], tasks: [sampleTask('t1')] })));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-dark.png') });
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-toolbar-dark.png') });
    await checkAsync('dark mode: export button + create actions still share one action cluster (grouping fix holds under dark theme)', () => page.evaluate(() => {
      const exportBtn = document.querySelector('[data-agenda-action="export-pdf"]');
      const createBtn = document.querySelector('[data-agenda-action="create-event"]');
      return exportBtn.parentElement === createBtn.parentElement;
    }));
    await checkAsync('dark mode export drawer: opens with theme-appropriate (non-white) surface', () => page.evaluate(() => {
      window.__openAgendaExportDrawer();
      const surface = getComputedStyle(document.querySelector('.drawer[role="dialog"]')).backgroundColor;
      return surface !== '' && surface.toLowerCase() !== 'rgb(255, 255, 255)';
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-export-drawer-dark.png') });
    await page.evaluate(() => window.__closeAgendaExportDrawer());
    await new Promise((r) => setTimeout(r, 350));
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
    await page.evaluate((ctx) => window.__render(ctx), baseCtx({ events: [sampleEvent('e1')], tasks: [sampleTask('t1')] }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-light.png') });

    console.log('\n=== [G — event drawer: open, validate, picker, dirty-guard] ===');
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => {
      window.__setDirectoryForTest(
        { evan: { displayName: 'Evan', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' }, grace: { displayName: 'Grace', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' }, kabiduser: { displayName: 'Kabid Sarpras', role: 'kabid_test_role', active: true } },
        ['kabid_test_role'],
      );
    });
    await checkAsync('openCreateEventDrawer() opens a real drawer with a title field', () => page.evaluate(() => {
      window.__openCreateEventDrawer();
      return document.querySelector('.drawer[role="dialog"]') != null && document.querySelector('[data-field="title"]') != null;
    }));
    await checkAsync('clicking Save with an empty title shows a validation error, does not crash, does not close', () => page.evaluate(() => {
      const saveBtn = [...document.querySelectorAll('[data-drawer-action="event:save"]')][0];
      saveBtn.click();
      return document.querySelector('.cal-form-error') != null && document.querySelector('.drawer[role="dialog"]') != null;
    }));
    await checkAsync('opening the participant picker shows the seeded candidates (Evan, Grace) and a Kabid pill on the Kabid candidate', () => page.evaluate(() => {
      document.querySelector('[data-drawer-action="picker:open"]').click();
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return html.includes('Evan') && html.includes('Grace') && html.includes('Kabid Sarpras') && html.includes('cal-pill--kabid');
    }));
    await checkAsync('selecting a candidate marks the row selected', () => page.evaluate(() => {
      const row = [...document.querySelectorAll('[data-drawer-action^="picker:toggle:"]')].find((el) => el.textContent.includes('Evan'));
      row.click();
      const updated = [...document.querySelectorAll('.cal-picker-row--selected')];
      return updated.some((el) => el.textContent.includes('Evan'));
    }));
    await checkAsync('marking the selected candidate as PIC toggles the PIC button state', () => page.evaluate(() => {
      // refreshDrawerBody() replaces the body's innerHTML on every toggle
      // (rerender()) — the pre-click node reference is stale afterward, so
      // this must RE-QUERY post-click, not read the old node's attribute
      // (an earlier version of this check had that bug, not the app).
      const before = [...document.querySelectorAll('[data-drawer-action^="picker:togglepic:"]')].find((el) => !el.disabled);
      before.click();
      const after = [...document.querySelectorAll('[data-drawer-action^="picker:togglepic:"]')].find((el) => el.getAttribute('data-drawer-action') === before.getAttribute('data-drawer-action'));
      return after.getAttribute('aria-pressed') === 'true';
    }));
    await checkAsync('returning to the form shows the selected person as a PIC chip', () => page.evaluate(() => {
      document.querySelector('[data-drawer-action="picker:back"]').click();
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return html.includes('cal-person-chip--pic') && html.includes('Evan');
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-event-drawer-picker.png') });
    await checkAsync('closeEventDrawer() force-closes the drawer (the exported close(), used by external callers, deliberately bypasses the isDirty confirm — that guard is internal to the X-button/backdrop click path, drawer.js\'s own documented "external caller fully tears down" contract)', () => page.evaluate(async () => {
      window.__closeEventDrawer();
      // closeDrawer()'s DOM removal is deferred behind a ~260ms CSS
      // transition (drawer.js's own setTimeout(once, 260) fallback) —
      // asserting immediately would read the mid-fade-out DOM, an earlier
      // version of this check's own timing bug, not the app's.
      await new Promise((r) => setTimeout(r, 350));
      return document.querySelector('.drawer[role="dialog"]') == null;
    }));

    console.log('\n=== [G.2 — participant picker: all Sarpras candidates appear, SARPRAS/KABID grouping, search, multi-PIC, late-directory-data race FIXED] ===');
    // Regression coverage for a real reported symptom: a picker open at
    // the same moment /userProfiles/customRoles data was still arriving
    // showed only some candidates (e.g. "Evan, Grace" but not "Leo") and
    // NEVER updated even after the missing data landed, because nothing
    // reacted to the late directory-change event while the picker was
    // already open. Reproduced here deterministically (no timing luck
    // needed) via two separate __setDirectoryForTest() calls — the first
    // simulating "not everyone has loaded yet", the second simulating the
    // rest of /userProfiles arriving a moment later.
    await page.evaluate(() => {
      window.__setDirectoryForTest(
        { evan: { displayName: 'Evan', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' }, grace: { displayName: 'Grace', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' } },
        [],
      );
    });
    await checkAsync('openCreateEventDrawer() + open picker: with a PARTIAL directory, only the loaded candidates show (Leo genuinely not loaded yet — this is the correct starting state, not itself a bug)', () => page.evaluate(() => {
      window.__openCreateEventDrawer();
      document.querySelector('[data-drawer-action="picker:open"]').click();
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return html.includes('Evan') && html.includes('Grace') && !html.includes('Leo');
    }));
    await checkAsync('THE FIX: late-arriving directory data (Leo + Kabid) — WITHOUT closing/reopening the drawer or the picker — updates the already-open picker list', () => page.evaluate(() => {
      window.__setDirectoryForTest(
        {
          evan: { displayName: 'Evan', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' },
          leo: { displayName: 'Leo', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' },
          grace: { displayName: 'Grace', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' },
          kabiduser: { displayName: 'Kabid Sarana dan Prasarana', role: 'kabid_test_role', active: true },
        },
        ['kabid_test_role'],
      );
      // No click, no reopen — the directory-change listener alone must
      // patch the list per THE FIX in agenda-event-drawer.js#onDirectoryChange().
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return html.includes('Leo') && html.includes('Kabid Sarana dan Prasarana');
    }));
    await checkAsync('all eligible Sarpras candidates appear, grouped under a "SARPRAS" section header', () => page.evaluate(() => {
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      const groupIdx = html.indexOf('cal-picker-group-label">SARPRAS<');
      return groupIdx !== -1 && html.includes('Evan') && html.includes('Leo') && html.includes('Grace');
    }));
    await checkAsync('the Kabid candidate appears under a distinct "KABID / UNDANGAN" section header (data-driven from candidate.scope, not a hardcoded name)', () => page.evaluate(() => {
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return html.includes('cal-picker-group-label">KABID / UNDANGAN<') && html.includes('Kabid Sarana dan Prasarana');
    }));
    await checkAsync('search "Leo" finds Leo (works across the SARPRAS group)', () => page.evaluate(() => {
      const search = document.querySelector('[data-field="pickerQuery"]');
      search.value = 'Leo';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const html = document.querySelector('.cal-picker-list').innerHTML;
      return html.includes('Leo') && !html.includes('Evan') && !html.includes('Grace');
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-picker-search-leo.png') });
    await checkAsync('search "Kabid" finds the Kabid candidate (works across the KABID group)', () => page.evaluate(() => {
      const search = document.querySelector('[data-field="pickerQuery"]');
      search.value = 'Kabid';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const html = document.querySelector('.cal-picker-list').innerHTML;
      return html.includes('Kabid Sarana dan Prasarana') && !html.includes('>Evan<') && !html.includes('>Leo<');
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-picker-search-kabid.png') });
    await checkAsync('clearing search restores every candidate in both groups', () => page.evaluate(() => {
      const search = document.querySelector('[data-field="pickerQuery"]');
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const html = document.querySelector('.cal-picker-list').innerHTML;
      return ['Evan', 'Leo', 'Grace', 'Kabid Sarana dan Prasarana'].every((n) => html.includes(n));
    }));
    await checkAsync('multiple PIC: selecting Evan AND Leo, marking BOTH as PIC, both stay independently marked (participant/PIC/external distinction preserved, not collapsed)', () => page.evaluate(() => {
      const rows = () => [...document.querySelectorAll('[data-drawer-action^="picker:toggle:"]')];
      rows().find((el) => el.textContent.includes('Evan')).click();
      rows().find((el) => el.textContent.includes('Leo')).click();
      const picBtn = (name) => [...document.querySelectorAll('[data-drawer-action^="picker:togglepic:"]')].find((el) => el.closest('.cal-picker-row').textContent.includes(name));
      picBtn('Evan').click();
      picBtn('Leo').click();
      const evanPic = picBtn('Evan').getAttribute('aria-pressed') === 'true';
      const leoPic = picBtn('Leo').getAttribute('aria-pressed') === 'true';
      // Grace is present in the picker but was never selected/marked PIC in
      // this scenario — her PIC toggle must stay unpressed/false, proving
      // marking Evan+Leo as PIC has no side effect on an untouched
      // candidate (participant-only vs PIC remains a real, independent
      // per-person distinction, not a global flag).
      const gracePic = picBtn('Grace') ? picBtn('Grace').getAttribute('aria-pressed') === 'true' : null;
      return evanPic && leoPic && gracePic === false;
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-picker-grouped-kabid.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-picker-grouped-kabid-dark.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.setViewport({ width: 390, height: 844 });
    await checkAsync('grouped picker at 390px has no horizontal overflow', () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-mobile-390-picker-grouped-kabid.png') });
    await page.setViewport({ width: 1440, height: 900 });
    await checkAsync('returning to the form shows Evan AND Leo both as PIC chips', () => page.evaluate(() => {
      document.querySelector('[data-drawer-action="picker:back"]').click();
      const chips = [...document.querySelectorAll('.cal-person-chip--pic')].map((el) => el.textContent);
      return chips.some((t) => t.includes('Evan')) && chips.some((t) => t.includes('Leo'));
    }));
    await page.evaluate(() => window.__closeEventDrawer());
    await new Promise((r) => setTimeout(r, 350));

    console.log('\n=== [G.2b — agendaParticipantType classification contract (V1.31 C5.2): FIELD-driven, not identity-driven] ===');
    // Synthetic, non-meaningful usernames on purpose — proves the picker
    // reads agendaParticipantType, not any hardcoded name/role check.
    // Deliberately reuses role:'admin' on ALL FOUR to prove role is no
    // longer the signal (production has role==='admin' shared by staff,
    // Kabid, and a system account — this is the exact scenario that broke).
    await page.evaluate(() => {
      window.__setDirectoryForTest(
        {
          staffUser1: { displayName: 'Staff Synthetic', role: 'admin', active: true, agendaParticipantType: 'sarpras_staff' },
          kabidUser1: { displayName: 'Kabid Synthetic', role: 'admin', active: true, agendaParticipantType: 'kabid' },
          systemUser1: { displayName: 'System Synthetic', role: 'admin', active: true, agendaParticipantType: 'system' },
          unclassifiedUser1: { displayName: 'Unclassified Synthetic', role: 'admin', active: true },
        },
        [],
      );
      window.__openCreateEventDrawer();
      document.querySelector('[data-drawer-action="picker:open"]').click();
    });
    await checkAsync('agendaParticipantType="sarpras_staff" -> shown under SARPRAS as a normal candidate', () => page.evaluate(() => {
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      const groupIdx = html.indexOf('cal-picker-group-label">SARPRAS<');
      return groupIdx !== -1 && html.includes('Staff Synthetic');
    }));
    await checkAsync('agendaParticipantType="kabid" -> shown under KABID / UNDANGAN', () => page.evaluate(() => {
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return html.includes('cal-picker-group-label">KABID / UNDANGAN<') && html.includes('Kabid Synthetic');
    }));
    await checkAsync('agendaParticipantType="system" -> excluded entirely, never a PIC/participant candidate', () => page.evaluate(() => {
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return !html.includes('System Synthetic');
    }));
    await checkAsync('missing agendaParticipantType on an admin-role account -> excluded (unclassified is NOT assumed to be staff)', () => page.evaluate(() => {
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      return !html.includes('Unclassified Synthetic');
    }));
    await checkAsync('role==="admin" alone proves nothing anymore: all four synthetic rows share the same role, only the field decides', () => page.evaluate(() => {
      const html = document.querySelector('[data-drawer-body]').innerHTML;
      const shown = ['Staff Synthetic', 'Kabid Synthetic'].every((n) => html.includes(n));
      const hidden = !html.includes('System Synthetic') && !html.includes('Unclassified Synthetic');
      return shown && hidden;
    }));
    await page.evaluate(() => window.__closeEventDrawer());
    await new Promise((r) => setTimeout(r, 350));

    console.log('\n=== [G.2c — security: agendaParticipantType is architecturally inert for authorization] ===');
    await checkAsync('agendaParticipantType is never referenced by agenda-permissions.js, database.rules.json, or verifyPin.js (classification carries zero permission meaning, by construction, not just by convention)', () => {
      const suspects = [
        path.join(ROOT, 'js', 'agenda', 'agenda-permissions.js'),
        path.join(ROOT, 'database.rules.json'),
        path.join(ROOT, 'functions', 'src', 'auth', 'verifyPin.js'),
        path.join(ROOT, 'functions', 'src', 'agenda', 'scopeClassifier.js'),
      ];
      const offenders = suspects.filter((f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('agendaParticipantType'));
      return offenders.length === 0 ? true : `field leaked into: ${offenders.join(', ')}`;
    });

    console.log('\n=== [G.1 — mobile drawer (390px) is a bottom sheet, usable, no overflow] ===');
    await page.setViewport({ width: 390, height: 844 });
    await checkAsync('event drawer opens as a bottom sheet at 390px with no horizontal overflow', () => page.evaluate(() => {
      window.__openCreateEventDrawer();
      return document.querySelector('.drawer[role="dialog"]') != null && document.documentElement.scrollWidth <= window.innerWidth + 1;
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-mobile-390-event-drawer.png') });
    await page.evaluate(() => window.__closeEventDrawer());
    await new Promise((r) => setTimeout(r, 350));
    await page.setViewport({ width: 1440, height: 900 });

    console.log('\n=== [H — task drawer: checklist + priority] ===');
    await checkAsync('openCreateTaskDrawer() opens with a title field and priority chips', () => page.evaluate(() => {
      window.__openCreateTaskDrawer();
      return document.querySelector('[data-field="title"]') != null && document.body.textContent.includes('Urgent');
    }));
    await checkAsync('selecting Urgent priority marks that chip pressed', () => page.evaluate(() => {
      // Same re-query-after-rerender discipline as the PIC-toggle check above.
      [...document.querySelectorAll('[data-drawer-action^="task:priority:"]')].find((el) => el.textContent === 'Urgent').click();
      const after = [...document.querySelectorAll('[data-drawer-action^="task:priority:"]')].find((el) => el.textContent === 'Urgent');
      return after.getAttribute('aria-pressed') === 'true';
    }));
    await checkAsync('adding a checklist item renders it in the list', () => page.evaluate(() => {
      const input = document.querySelector('[data-field="newChecklistLabel"]');
      input.value = 'Siapkan ruangan';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-drawer-action="task:additem"]').click();
      return document.querySelector('[data-drawer-body]').textContent.includes('Siapkan ruangan');
    }));
    await checkAsync('checking the item marks it done (strikethrough class applied)', () => page.evaluate(() => {
      const item = [...document.querySelectorAll('[data-drawer-action^="task:checkitem:"]')][0];
      item.click();
      return document.querySelector('.cal-checklist-label--done') != null;
    }));
    await checkAsync('removing the item removes it from the list', () => page.evaluate(() => {
      const removeBtn = [...document.querySelectorAll('[data-drawer-action^="task:removeitem:"]')][0];
      removeBtn.click();
      return !document.querySelector('[data-drawer-body]').textContent.includes('Siapkan ruangan');
    }));
    await checkAsync('clicking Save with an empty title shows a validation error, does not crash', () => page.evaluate(() => {
      document.querySelector('[data-drawer-action="task:save"]').click();
      return document.querySelector('.cal-form-error') != null;
    }));
    await page.evaluate(() => window.__closeTaskDrawer());

    console.log('\n=== [I2 — export drawer (Phase C4): presets, mode, validation — no PDF/CDN reached] ===');
    await page.setViewport({ width: 1440, height: 900 });
    await checkAsync('openAgendaExportDrawer() opens with "Minggu ini" pressed by default', () => page.evaluate(() => {
      window.__openAgendaExportDrawer();
      const pressed = [...document.querySelectorAll('[data-drawer-action^="export:preset:"]')].find((el) => el.getAttribute('aria-pressed') === 'true');
      return pressed != null && pressed.textContent === 'Minggu ini';
    }));
    await checkAsync('task filters (status/priority) are visible by default (mode=semua)', () => page.evaluate(() => {
      return document.body.textContent.includes('Status Tugas') && document.body.textContent.includes('Prioritas Tugas');
    }));
    await checkAsync('switching mode to "Agenda" hides the task-only filters', () => page.evaluate(() => {
      [...document.querySelectorAll('[data-drawer-action^="export:mode:"]')].find((el) => el.textContent === 'Agenda').click();
      return !document.body.textContent.includes('Status Tugas');
    }));
    await checkAsync('switching back to "Semua" restores the task filters', () => page.evaluate(() => {
      [...document.querySelectorAll('[data-drawer-action^="export:mode:"]')].find((el) => el.textContent === 'Semua').click();
      return document.body.textContent.includes('Status Tugas');
    }));
    await checkAsync('selecting the "Custom" preset reveals From/To date fields', () => page.evaluate(() => {
      [...document.querySelectorAll('[data-drawer-action^="export:preset:"]')].find((el) => el.textContent === 'Custom').click();
      return document.querySelector('[data-field="customFrom"]') != null && document.querySelector('[data-field="customTo"]') != null;
    }));
    await checkAsync('an invalid custom range (To before From) shows a validation error, does not crash, does not close, and never reaches the PDF/CDN pipeline', () => page.evaluate(async () => {
      const from = document.querySelector('[data-field="customFrom"]');
      const to = document.querySelector('[data-field="customTo"]');
      from.value = '2026-09-20'; from.dispatchEvent(new Event('change', { bubbles: true }));
      to.value = '2026-09-01'; to.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('[data-drawer-action="export:generate"]').click();
      await new Promise((r) => setTimeout(r, 50));
      return document.querySelector('.cal-form-error') != null && document.querySelector('.drawer[role="dialog"]') != null;
    }));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-desktop-export-drawer.png') });
    await page.setViewport({ width: 390, height: 844 });
    await checkAsync('export drawer at 390px is a usable bottom sheet with no horizontal overflow', () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(ROOT, 'scratch', 'agenda-mobile-390-export-drawer.png') });
    await page.evaluate(() => window.__closeAgendaExportDrawer());
    await new Promise((r) => setTimeout(r, 350));
    await page.setViewport({ width: 1440, height: 900 });

    console.log('\n=== [I — security sanity: the UI never attempts to write server-derived nodes directly] ===');
    await checkAsync('no source file under js/agenda/ writes to agendaAudit / *ByUser / *ByScope', () => {
      const dir = path.join(ROOT, 'js', 'agenda');
      const forbidden = /(storeFirebaseData|updateFirebaseData)\(\s*[`'"](agendaAudit|agendaEventsByUser|agendaEventsByScope|agendaTasksByUser|agendaTasksByScope)/;
      const offenders = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
        .filter((f) => forbidden.test(fs.readFileSync(path.join(dir, f), 'utf8')));
      return offenders.length === 0 ? true : `offending files: ${offenders.join(', ')}`;
    });

    console.log('\n=== [Z — zero console/page errors across the entire run] ===');
    check('no console errors or uncaught page errors were captured', consoleErrors.length === 0, consoleErrors.join(' | '));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error(`\n[agenda-workspace-render-check] FATAL: ${err.stack || err.message}\n`); process.exit(1); });
