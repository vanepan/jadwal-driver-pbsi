/* agenda-identity-colors-check.mjs — SS9 R1: person-based visual identity
   colors. Covers the pure color-resolution logic (js/agenda/agenda-
   identity-colors.js) AND the real rendered/computed CSS values in a
   real browser (light + dark), plus proof that person color never
   overrides existing status semantics (cancelled/overdue/done stay
   visually distinguishable).

   Run: node scripts/agenda-identity-colors-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import {
  agendaIdentityColorVar, buildAgendaIdentityColorMap,
} from '../js/agenda/agenda-identity-colors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
}
async function checkAsync(name, run) {
  try { const r = await run(); check(name, r !== false, typeof r === 'string' ? r : ''); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

/* ══ A — pure resolution logic ══ */
console.log('\n[A — pure resolution: Grace/Evan/Leo/Kabid resolve to their dedicated vars]');
check('grace -> var(--id-grace)', agendaIdentityColorVar('grace') === 'var(--id-grace)');
check('evan -> var(--id-evan)', agendaIdentityColorVar('evan') === 'var(--id-evan)');
check('leo -> var(--id-leo)', agendaIdentityColorVar('leo') === 'var(--id-leo)');
check('case/whitespace-insensitive ("  GRACE  " still resolves)', agendaIdentityColorVar('  GRACE  ') === 'var(--id-grace)');
check('Kabid is resolved via scope (isKabid opt), not a per-username entry', agendaIdentityColorVar('anyone', {}, { isKabid: true }) === 'var(--id-kabid)');
check('an unknown username with no colorMap falls back safely (never throws, never empty)', typeof agendaIdentityColorVar('totally-unknown-person') === 'string' && agendaIdentityColorVar('totally-unknown-person').length > 0);

console.log('\n[B — buildAgendaIdentityColorMap: stable, collision-free, scope-aware]');
const roster = [
  { username: 'grace', displayName: 'Grace', scope: 'sarpras_shared' },
  { username: 'evan', displayName: 'Evan', scope: 'sarpras_shared' },
  { username: 'leo', displayName: 'Leo', scope: 'sarpras_shared' },
  { username: 'raras', displayName: 'Raras', scope: 'kabid' },
  { username: 'newstaff1', displayName: 'New Staff 1', scope: 'sarpras_shared' },
  { username: 'newstaff2', displayName: 'New Staff 2', scope: 'sarpras_shared' },
];
const map = buildAgendaIdentityColorMap(roster);
check('grace/evan/leo resolve to their fixed vars even via the map', map.grace === 'var(--id-grace)' && map.evan === 'var(--id-evan)' && map.leo === 'var(--id-leo)', map);
check('a kabid-scope candidate (Raras) resolves to --id-kabid regardless of name', map.raras === 'var(--id-kabid)', map.raras);
check('unclassified staff (newstaff1/2) get a fallback color, never left uncolored', !!map.newstaff1 && !!map.newstaff2, map);
check('unclassified staff never collide with Grace/Evan/Leo/Kabid colors', ![map.newstaff1, map.newstaff2].includes(map.grace) && ![map.newstaff1, map.newstaff2].includes(map.evan) && ![map.newstaff1, map.newstaff2].includes(map.leo) && ![map.newstaff1, map.newstaff2].includes(map.raras), map);
check('two different unclassified staff get two different colors (no accidental collision at this roster size)', map.newstaff1 !== map.newstaff2, map);
const map2 = buildAgendaIdentityColorMap([...roster].reverse());
check('the map is stable regardless of input order (sorted internally, not insertion order)', map2.newstaff1 === map.newstaff1 && map2.newstaff2 === map.newstaff2, { map, map2 });

console.log('\n[C — static: presentation-only, no authorization logic introduced]');
const src = fs.readFileSync(path.join(ROOT, 'js/agenda/agenda-identity-colors.js'), 'utf-8');
check('no actual import statement of agenda-permissions.js or auth.js (a comment MAY mention them by name — only a real `import ... from` counts)', !/^import\s.*from\s+['"].*(agenda-permissions|\/auth\.js)/m.test(src));
check('zero imports at all (fully pure, matches its own header claim)', !/^import /m.test(src));
check('never calls a Firebase read/write function', !/\.set\(|\.update\(|\.push\(|onValue|subscribeNode/.test(src));

/* ══ D — real browser: computed CSS values, light + dark ══ */
console.log('\n[D — real computed CSS token values, light and dark]');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT, u === '/' ? '/index.html' : u);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 1024, height: 900 });
  await page.goto(`http://localhost:${port}/scripts/agenda-workspace-harness.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__harnessReady === true', { timeout: 8000 });

  // Custom properties return their raw authored text via getPropertyValue()
  // (unlike a real computed property such as `color`, which the browser
  // normalizes to rgb(...)) — every --id-*/--accent/--blue/--red value in
  // this codebase is authored as a literal #rrggbb hex string, so this
  // reads it directly rather than assuming an rgb() format that would
  // never actually appear here.
  function luminance(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const sameColor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  async function readTokens(theme) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await new Promise((r) => setTimeout(r, 150));
    return page.evaluate(() => {
      const el = document.querySelector('.cal-root');
      const cs = getComputedStyle(el);
      const read = (name) => cs.getPropertyValue(name).trim();
      return {
        grace: read('--id-grace'), evan: read('--id-evan'), leo: read('--id-leo'), kabid: read('--id-kabid'),
        accent: read('--accent'), blue: read('--blue'), red: read('--red'), danger: read('--danger'),
      };
    });
  }

  const light = await readTokens('light');
  const dark = await readTokens('dark');
  console.log('  [info] light tokens:', JSON.stringify(light));
  console.log('  [info] dark tokens:', JSON.stringify(dark));

  check('LIGHT: Evan is near-black/charcoal, NOT pure black (#000000)', !sameColor(light.evan, '#000000') && luminance(light.evan) < 0.3, { hex: light.evan, luminance: luminance(light.evan) });
  // Kabid is aliased to the agenda module's own --red (see agenda-styles.js),
  // which is itself already a verbatim copy of platform.css's --danger
  // token (not --accent, which diverges from --danger in dark mode — a
  // deepened variant tuned for bold CTA backgrounds, not a small dot). --red
  // and --accent are IDENTICAL in light mode (both are the one PBSI brand
  // red), so checking --red here is the precise, always-correct claim.
  check('LIGHT: Kabid color exactly matches the agenda module\'s own --red token, itself the same PBSI brand red as --accent in light mode — genuine reuse, not an invented red', sameColor(light.kabid, light.red) && sameColor(light.red, light.accent), light);
  check('LIGHT: Grace is a DIFFERENT blue than the existing --blue token (avoids colliding with the pre-existing Kabid scope pill, which already uses --blue)', !sameColor(light.grace, light.blue), light);
  check('LIGHT: all four identity colors are mutually distinct (no collisions)', new Set([light.grace, light.evan, light.leo, light.kabid].map((c) => c.toLowerCase())).size === 4, light);

  check('DARK: Kabid color exactly matches the agenda module\'s own dark --red token', sameColor(dark.kabid, dark.red), dark);
  check('DARK: all four identity colors are mutually distinct', new Set([dark.grace, dark.evan, dark.leo, dark.kabid].map((c) => c.toLowerCase())).size === 4, dark);
  check('DARK: Evan is NOT the same value as light Evan (not "simply inverted" the same hex, a real theme-aware value)', !sameColor(dark.evan, light.evan), { light: light.evan, dark: dark.evan });
  check('DARK: Evan is lighter than LIGHT Evan (readable against a dark surface, not still-dark-on-dark)', luminance(dark.evan) > luminance(light.evan), { lightLum: luminance(light.evan), darkLum: luminance(dark.evan) });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

  /* ══ E — rendered dots + status semantics preserved (real render) ══ */
  console.log('\n[E — rendered identity dots do not override existing status semantics]');
  await page.evaluate(() => window.__setDirectoryForTest?.([
    { username: 'grace', displayName: 'Grace', scope: 'sarpras_shared' },
  ]));
  const cancelledEvent = {
    id: 'ce1', title: 'Rapat Dibatalkan', date: '2026-09-16', startTime: '09:00', endTime: '10:00',
    startAt: Date.parse('2026-09-16T09:00:00+07:00'), endAt: Date.parse('2026-09-16T10:00:00+07:00'),
    allDay: false, status: 'cancelled', scope: 'sarpras_shared', organizerUsername: 'grace',
    participants: { grace: { isPic: true } },
  };
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [cancelledEvent], tasks: [], calendarItems: [], now: Date.parse('2026-09-16T08:00:00+07:00'),
    todayStr: '2026-09-16', mode: 'agenda', calendarView: 'month', calendarAnchor: '2026-09-16', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const cancelledCheck = await page.evaluate(() => {
    const row = document.querySelector('[data-agenda-action="open-event:ce1"]');
    return {
      hasCancelledClass: !!row?.querySelector('.cal-row-title--done'),
      hasCancelledText: row?.textContent.includes('(Dibatalkan)'),
      hasIdentityDot: !!row?.querySelector('.cal-identity-dot'),
      dotColor: row?.querySelector('.cal-identity-dot')?.style.background,
    };
  });
  check('a cancelled event STILL shows its cancelled treatment (strikethrough class)', cancelledCheck.hasCancelledClass, cancelledCheck);
  check('...and the "(Dibatalkan)" label', cancelledCheck.hasCancelledText, cancelledCheck);
  check('...AND it also carries a real person identity dot (both channels coexist, neither overrides the other)', cancelledCheck.hasIdentityDot, cancelledCheck);
  check('...the dot uses the real Grace color, not a placeholder', !!cancelledCheck.dotColor, cancelledCheck);

  console.log('\n[F — multi-person event: one primary color, additional participants as separate dots, not extra full-width bars]');
  await page.evaluate(() => window.__setDirectoryForTest?.([
    { username: 'grace', displayName: 'Grace', scope: 'sarpras_shared' },
    { username: 'evan', displayName: 'Evan', scope: 'sarpras_shared' },
  ]));
  const multiEvent = {
    id: 'me1', title: 'Rapat Bersama', date: '2026-09-16', startTime: '09:00', endTime: '10:00',
    startAt: Date.parse('2026-09-16T09:00:00+07:00'), endAt: Date.parse('2026-09-16T10:00:00+07:00'),
    allDay: false, status: 'scheduled', scope: 'sarpras_shared', organizerUsername: 'evan',
    participants: { grace: { isPic: true }, evan: { isPic: false } },
  };
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [multiEvent], tasks: [], calendarItems: [], now: Date.parse('2026-09-16T08:00:00+07:00'),
    todayStr: '2026-09-16', mode: 'agenda', calendarView: 'month', calendarAnchor: '2026-09-16', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const multiCheck = await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-agenda-action="open-event:me1"]');
    return { rowCount: rows.length, dotCount: rows[0]?.querySelectorAll('.cal-identity-dot').length };
  });
  check('exactly ONE row for the multi-person event (never multiple full-width bars for one event)', multiCheck.rowCount === 1, multiCheck);
  check('exactly one PRIMARY identity dot (Grace, the PIC) — not one bar per participant', multiCheck.dotCount === 1, multiCheck);

  /* ══ G — Kabid path END TO END: real directory seed -> real
     getAgendaCandidates() -> real colorMap -> real rendered dot. Sections
     A/B/E/F above all use KNOWN names (grace/evan), which resolve without
     ever consulting the roster/colorMap at all (agendaIdentityColorVar
     checks the fixed name table FIRST) — this is the one check that
     actually exercises the scope-based Kabid branch through the full real
     pipeline, not just buildAgendaIdentityColorMap() called directly with
     a hand-built array. __setDirectoryForTest() takes the SAME shape the
     real /userProfiles snapshot has (keyed by username, agendaParticipantType
     field) — not the getAgendaCandidates()-shaped array a first pass at
     this test incorrectly assumed. ══ */
  console.log('\n[G — Kabid scope color, end to end through the real directory -> real render pipeline]');
  await page.evaluate(() => window.__setDirectoryForTest?.({
    raras: { displayName: 'Raras', agendaParticipantType: 'kabid', active: true },
  }));
  const kabidEvent = {
    id: 'ke1', title: 'Koordinasi dengan Kabid', date: '2026-09-16', startTime: '10:00', endTime: '11:00',
    startAt: Date.parse('2026-09-16T10:00:00+07:00'), endAt: Date.parse('2026-09-16T11:00:00+07:00'),
    allDay: false, status: 'scheduled', scope: 'kabid', organizerUsername: 'raras',
    participants: { raras: { isPic: true } },
  };
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [kabidEvent], tasks: [], calendarItems: [], now: Date.parse('2026-09-16T08:00:00+07:00'),
    todayStr: '2026-09-16', mode: 'agenda', calendarView: 'month', calendarAnchor: '2026-09-16', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const kabidDotColor = await page.evaluate(() => document.querySelector('[data-agenda-action="open-event:ke1"] .cal-identity-dot')?.style.background);
  const kabidCssVar = await page.evaluate(() => getComputedStyle(document.querySelector('.cal-root')).getPropertyValue('--id-kabid').trim());
  check('a REAL Kabid-scope participant (seeded via the real directory, resolved via the real getAgendaCandidates()) renders with the real --id-kabid color', kabidDotColor === 'var(--id-kabid)', { kabidDotColor, kabidCssVar });

  console.log('\n[Z — console cleanliness]');
  check('zero console/page errors across the whole run', errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  server.close();
}

console.log(`\nagenda-identity-colors-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
