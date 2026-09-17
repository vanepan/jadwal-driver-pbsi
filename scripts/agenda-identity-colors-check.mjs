/* agenda-identity-colors-check.mjs — SS9 R1: person-based visual identity
   colors. Covers the pure color-resolution logic (js/agenda/agenda-
   identity-colors.js) AND the real rendered/computed CSS values in a
   real browser (light + dark), plus proof that person color never
   overrides existing status semantics (cancelled/overdue/done stay
   visually distinguishable).

   SS9.1 additions: [H] identity tint+text contrast (WCAG-correct, all 7
   slots x 2 themes), multi-day bar color propagating to every segment
   (not just the labeled one), and cancelled bars keeping identity color
   instead of a hardcoded red swap. [I] Day Detail's redundant identity
   dots are gone, PIC/responsible text (or, for Calendar items with no
   text of their own, identity-colored title text) remains the one
   signal, and a cancelled Calendar-item row keeps its muted treatment
   rather than leaking identity color onto it.

   SS9.2 additions: Evan is now teal-green, not charcoal/slate — [D] hue +
   distance-from-generic-green checks replace the old "near-black"
   assertion. Every remaining identity dot ([E]/[F]/[G]/[H] rewritten,
   [J] new) is confirmed GONE — Calendar bars, Week timed rows, Daftar
   rows, and To-Do rows all now carry zero `.cal-identity-dot` elements
   while the person's name/PIC/responsible text or bar color remains the
   one identity signal. [G] was redirected from a Daftar event's (now
   dot-less, colorless) row to a Calendar-item Month bar, since that's
   the one surface still visibly carrying identity color end-to-end.

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
  // SS9.2 R3/R9 — hue (0-360°) and Euclidean RGB distance, used to prove
  // Evan's new teal is actually teal-family (not just "not black") and
  // numerically far from generic --green, not merely a different hex.
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
    return m ? m.slice(1).map((h) => parseInt(h, 16)) : null;
  }
  function hueDegrees(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta === 0) return 0;
    let h;
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
    return h < 0 ? h + 360 : h;
  }
  function colorDistance(hexA, hexB) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    if (!a || !b) return null;
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }

  async function readTokens(theme) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await new Promise((r) => setTimeout(r, 150));
    return page.evaluate(() => {
      const el = document.querySelector('.cal-root');
      const cs = getComputedStyle(el);
      const read = (name) => cs.getPropertyValue(name).trim();
      return {
        grace: read('--id-grace'), evan: read('--id-evan'), leo: read('--id-leo'), kabid: read('--id-kabid'),
        accent: read('--accent'), blue: read('--blue'), red: read('--red'), danger: read('--danger'), green: read('--green'),
      };
    });
  }

  const light = await readTokens('light');
  const dark = await readTokens('dark');
  console.log('  [info] light tokens:', JSON.stringify(light));
  console.log('  [info] dark tokens:', JSON.stringify(dark));

  // SS9.2 R3 — Evan is now a teal-green (was charcoal/slate). Hue must
  // land in the teal family (~150-195°, between pure green ~154° and
  // cyan ~195°) in BOTH themes, and be numerically far enough from
  // generic --green that it never reads as "just the success color".
  const TEAL_HUE_MIN = 150, TEAL_HUE_MAX = 195, GREEN_DISTANCE_FLOOR = 30;
  check('LIGHT: Evan hue lands in the teal-green family, not pure black/grey (was charcoal)', (() => { const h = hueDegrees(light.evan); return h !== null && h >= TEAL_HUE_MIN && h <= TEAL_HUE_MAX; })(), { hex: light.evan, hue: hueDegrees(light.evan) });
  check('LIGHT: Evan teal is numerically distinct from generic --green (not confusable with the success/status color)', colorDistance(light.evan, light.green) >= GREEN_DISTANCE_FLOOR, { evan: light.evan, green: light.green, distance: colorDistance(light.evan, light.green) });
  check('DARK: Evan hue also lands in the teal-green family', (() => { const h = hueDegrees(dark.evan); return h !== null && h >= TEAL_HUE_MIN && h <= TEAL_HUE_MAX; })(), { hex: dark.evan, hue: hueDegrees(dark.evan) });
  check('DARK: Evan teal is numerically distinct from dark --green', colorDistance(dark.evan, dark.green) >= GREEN_DISTANCE_FLOOR, { evan: dark.evan, green: dark.green, distance: colorDistance(dark.evan, dark.green) });
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

  /* ══ E — SS9.2 R1: no identity dot renders; status semantics preserved ══ */
  console.log('\n[E — SS9.2 R1: no redundant identity dot renders; cancelled status semantics preserved]');
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
    };
  });
  check('a cancelled event STILL shows its cancelled treatment (strikethrough class)', cancelledCheck.hasCancelledClass, cancelledCheck);
  check('...and the "(Dibatalkan)" label', cancelledCheck.hasCancelledText, cancelledCheck);
  check('...and renders NO identity dot (SS9.2 R1 — removed everywhere, cancelled rows included)', !cancelledCheck.hasIdentityDot, cancelledCheck);

  console.log('\n[F — multi-person event: one row, no identity dots at all]');
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
  check('zero identity dots (SS9.2 R1) — not one-per-participant, not one-for-the-primary either', multiCheck.dotCount === 0, multiCheck);

  /* ══ G — Kabid path END TO END: real directory seed -> real
     getAgendaCandidates() -> real colorMap -> real rendered color.
     Sections A/B/E/F above all use KNOWN names (grace/evan), which
     resolve without ever consulting the roster/colorMap at all
     (agendaIdentityColorVar checks the fixed name table FIRST) — this is
     the one check that actually exercises the scope-based Kabid branch
     through the full real pipeline, not just buildAgendaIdentityColorMap()
     called directly with a hand-built array. __setDirectoryForTest()
     takes the SAME shape the real /userProfiles snapshot has (keyed by
     username, agendaParticipantType field).
     SS9.2 R1 removed the dot this used to read color from — a plain
     Daftar event row now carries no visible identity-color signal at
     all, so this redirects to a Calendar-item Month-view bar (which
     still carries --bar-c) as the real, still-visible surface to prove
     the same end-to-end resolution through. ══ */
  console.log('\n[G — Kabid scope color, end to end through the real directory -> real render pipeline]');
  await page.evaluate(() => window.__setDirectoryForTest?.({
    raras: { displayName: 'Raras', agendaParticipantType: 'kabid', active: true },
  }));
  const kabidCalendarItem = {
    id: 'kc1', title: 'Kunjungan Kabid', status: 'scheduled', scope: 'kabid', organizerUsername: 'raras',
    startDate: '2026-09-16', endDate: '2026-09-16', allDay: true,
    startAt: Date.parse('2026-09-16T00:00:00+07:00'), endAt: Date.parse('2026-09-16T23:59:00+07:00'),
    participants: { raras: { isPic: true } },
  };
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [], tasks: [], calendarItems: [kabidCalendarItem], now: Date.parse('2026-09-16T08:00:00+07:00'),
    todayStr: '2026-09-16', mode: 'calendar', calendarView: 'month', calendarAnchor: '2026-09-16', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const kabidBarCheck = await page.evaluate(() => {
    const root = document.querySelector('.cal-root');
    const probe = document.createElement('span');
    probe.style.color = 'var(--id-kabid)';
    root.appendChild(probe);
    const kabidColor = getComputedStyle(probe).color;
    probe.remove();
    const bar = document.querySelector('[data-agenda-action="open-calendar:kc1"]');
    return {
      barHasNoDot: !bar?.querySelector('.cal-identity-dot'),
      barColorMatchesKabid: bar ? getComputedStyle(bar).color === kabidColor : false,
    };
  });
  check('a REAL Kabid-scope participant (seeded via the real directory, resolved via the real getAgendaCandidates()) colors the Month bar with the real --id-kabid color', kabidBarCheck.barColorMatchesKabid, kabidBarCheck);
  check('...and the bar itself carries no identity dot', kabidBarCheck.barHasNoDot, kabidBarCheck);

  /* ══ H — SS9.1 R1: tint+text contrast, multi-day bar color propagation,
     cancelled bars keep identity (not a red swap) ══ */
  console.log('\n[H — SS9.1 R1: identity tint contrast, multi-day bar color, cancelled bars keep identity]');
  // A real WCAG relative-luminance (gamma-corrected) — deliberately NOT
  // reusing this file's own simpler luminance() above (that one is a fast
  // comparative "is A darker than B" helper for sections D/G, not a real
  // contrast-ratio input; using it here would understate every pair's
  // true contrast, including already-shipped ones).
  function wcagLuminance(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const [r, g, b] = m.slice(1).map((h) => {
      const c = parseInt(h, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastRatio(hexA, hexB) {
    const la = wcagLuminance(hexA), lb = wcagLuminance(hexB);
    if (la == null || lb == null) return null;
    const lighter = Math.max(la, lb), darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
  }
  const identitySlots = ['grace', 'evan', 'leo', 'kabid', 'fb1', 'fb2', 'fb3'];
  async function readTintTokens(theme) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await new Promise((r) => setTimeout(r, 150));
    return page.evaluate((slots) => {
      const cs = getComputedStyle(document.querySelector('.cal-root'));
      const out = {};
      for (const s of slots) { out[s] = cs.getPropertyValue(`--id-${s}`).trim(); out[`${s}Tint`] = cs.getPropertyValue(`--id-${s}-tint`).trim(); }
      return out;
    }, identitySlots);
  }
  const lightTints = await readTintTokens('light');
  const darkTints = await readTintTokens('dark');
  const CONTRAST_FLOOR = 3.0; // small bold text on a tint background — matches the existing badge/pill family's own class of treatment, not body-text AA
  for (const theme of ['light', 'dark']) {
    const tokens = theme === 'light' ? lightTints : darkTints;
    for (const slot of identitySlots) {
      const ratio = contrastRatio(tokens[slot], tokens[`${slot}Tint`]);
      check(`${theme.toUpperCase()}: --id-${slot} text on --id-${slot}-tint background clears ${CONTRAST_FLOOR}:1`, ratio != null && ratio >= CONTRAST_FLOOR, { text: tokens[slot], tint: tokens[`${slot}Tint`], ratio });
    }
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));

  await page.evaluate(() => window.__setDirectoryForTest?.([{ username: 'grace', displayName: 'Grace', scope: 'sarpras_shared' }]));
  const multiDayItem = {
    id: 'md1', title: 'Sirnas C Piala Raja', startDate: '2026-09-14', endDate: '2026-09-16', allDay: true,
    status: 'scheduled', scope: 'sarpras_shared', organizerUsername: 'grace', participants: { grace: { isPic: true } },
  };
  const cancelledMultiDayItem = {
    id: 'md2', title: 'Turnamen Dibatalkan', startDate: '2026-09-20', endDate: '2026-09-22', allDay: true,
    status: 'cancelled', scope: 'sarpras_shared', organizerUsername: 'grace', participants: { grace: { isPic: true } },
  };
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [], tasks: [], calendarItems: [multiDayItem, cancelledMultiDayItem], now: Date.parse('2026-09-15T08:00:00+07:00'),
    todayStr: '2026-09-15', mode: 'calendar', calendarView: 'month', calendarAnchor: '2026-09-15', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const barConsistency = await page.evaluate(() => {
    // A probe carrying color:var(--id-grace) resolves through the SAME
    // var() chain the bars themselves use — comparing computed `color`
    // strings needs no hex/rgb conversion and is exact.
    const root = document.querySelector('.cal-root');
    const probe = document.createElement('span');
    probe.style.color = 'var(--id-grace)';
    root.appendChild(probe);
    const graceColor = getComputedStyle(probe).color;
    const redProbe = document.createElement('span');
    redProbe.style.color = 'var(--red)';
    root.appendChild(redProbe);
    const redColor = getComputedStyle(redProbe).color;
    probe.remove(); redProbe.remove();

    const activeBars = [...document.querySelectorAll('[data-agenda-action="open-calendar:md1"]')];
    const cancelledBars = [...document.querySelectorAll('[data-agenda-action="open-calendar:md2"]')];
    return {
      graceColor, redColor,
      activeCount: activeBars.length,
      activeAllMatchGrace: activeBars.length > 0 && activeBars.every((b) => getComputedStyle(b).color === graceColor),
      activeLabeledCount: activeBars.filter((b) => b.querySelector('.cal-range-bar-label')).length,
      activeNoDots: activeBars.every((b) => !b.querySelector('.cal-identity-dot')),
      cancelledCount: cancelledBars.length,
      cancelledAllMatchGrace: cancelledBars.length > 0 && cancelledBars.every((b) => getComputedStyle(b).color === graceColor),
      cancelledAnyMatchRed: cancelledBars.some((b) => getComputedStyle(b).color === redColor),
      cancelledStrikethrough: cancelledBars.length > 0 && cancelledBars.every((b) => getComputedStyle(b).textDecorationLine.includes('line-through')),
      cancelledOpacityReduced: cancelledBars.length > 0 && cancelledBars.every((b) => parseFloat(getComputedStyle(b).opacity) < 1),
      cancelledNoDots: cancelledBars.every((b) => !b.querySelector('.cal-identity-dot')),
    };
  });
  check('a 3-day multi-day bar renders 3 segments (one per day)', barConsistency.activeCount === 3, barConsistency);
  check('only ONE segment carries the label (the others are continuation-only, per the existing cap-left/showLabel design)', barConsistency.activeLabeledCount === 1, barConsistency);
  check('EVERY segment of the multi-day bar — labeled AND non-labeled — carries the SAME identity color (Grace)', barConsistency.activeAllMatchGrace, barConsistency);
  check('SS9.2 R4: no segment (labeled or not) carries an identity dot — the bar color alone is the signal', barConsistency.activeNoDots, barConsistency);
  check('a cancelled multi-day bar ALSO keeps the identity color on every segment (no red swap)', barConsistency.cancelledAllMatchGrace, barConsistency);
  check('...and never matches --red (the old hardcoded cancelled color)', !barConsistency.cancelledAnyMatchRed, barConsistency);
  check('...cancelled bar carries strikethrough (the mechanism that now signals "cancelled" instead of red)', barConsistency.cancelledStrikethrough, barConsistency);
  check('...cancelled bar has reduced opacity too', barConsistency.cancelledOpacityReduced, barConsistency);
  check('...and the cancelled bar ALSO has no identity dot on any segment', barConsistency.cancelledNoDots, barConsistency);

  /* ══ I — SS9.1 R3: Day Detail no longer renders redundant identity
     dots; PIC/responsible text (or, for Calendar items, identity-colored
     title text) remains the ONE signal; cancelled rows keep their muted
     treatment, not an identity-color leak ══ */
  console.log('\n[I — SS9.1 R3: Day Detail redundant-dot removal, identity/PIC text preserved, cancelled stays muted]');
  // Object-keyed shape (matches the real /userProfiles snapshot, per
  // section G's own established convention above) — needed here because,
  // unlike E/F/H (which never assert on the resolved DISPLAY NAME text),
  // this section checks that "PIC: Grace" / the responsible name actually
  // renders, which requires displayNameFor() to resolve for real.
  await page.evaluate(() => window.__setDirectoryForTest?.({
    grace: { displayName: 'Grace', agendaParticipantType: 'sarpras_staff', active: true },
  }));
  const dayDetailEvent = {
    id: 'dde1', title: 'Rapat Vendor', date: '2026-09-16', startTime: '09:00', endTime: '10:00',
    startAt: Date.parse('2026-09-16T09:00:00+07:00'), endAt: Date.parse('2026-09-16T10:00:00+07:00'),
    allDay: false, status: 'scheduled', scope: 'sarpras_shared', organizerUsername: 'grace', participants: { grace: { isPic: true } },
  };
  const dayDetailTask = {
    id: 'ddt1', title: 'Periksa Genset', dueDate: '2026-09-16', status: 'not_started', priority: 'normal',
    responsible: { grace: true }, scope: 'sarpras_shared',
  };
  const dayDetailActiveCal = {
    id: 'ddc1', title: 'Sirnas C Piala Raja', startDate: '2026-09-14', endDate: '2026-09-20', allDay: true,
    status: 'scheduled', scope: 'sarpras_shared', organizerUsername: 'grace', participants: { grace: { isPic: true } },
  };
  const dayDetailCancelledCal = {
    id: 'ddc2', title: 'Turnamen Dibatalkan', startDate: '2026-09-14', endDate: '2026-09-20', allDay: true,
    status: 'cancelled', scope: 'sarpras_shared', organizerUsername: 'grace', participants: { grace: { isPic: true } },
  };
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [dayDetailEvent], tasks: [dayDetailTask], calendarItems: [dayDetailActiveCal, dayDetailCancelledCal],
    now: Date.parse('2026-09-16T08:00:00+07:00'), todayStr: '2026-09-16', mode: 'calendar', calendarView: 'month',
    calendarAnchor: '2026-09-16', selectedDate: '2026-09-16',
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const dayDetailCheck = await page.evaluate(() => {
    const panel = document.querySelector('.cal-daydetail');
    const root = document.querySelector('.cal-root');
    const probe = document.createElement('span');
    probe.style.color = 'var(--id-grace)';
    root.appendChild(probe);
    const graceColor = getComputedStyle(probe).color;
    probe.remove();

    const eventRow = panel.querySelector('[data-agenda-action="open-event:dde1"]');
    const taskRow = panel.querySelector('[data-agenda-action="toggle-task-done:ddt1"]')?.closest('.cal-todo-row') || panel.querySelector('[data-agenda-action="open-task:ddt1"]')?.closest('.cal-todo-row');
    const activeCalRow = panel.querySelector('[data-agenda-action="open-calendar:ddc1"]');
    const cancelledCalRow = panel.querySelector('[data-agenda-action="open-calendar:ddc2"]');
    return {
      totalDots: panel.querySelectorAll('.cal-identity-dot').length,
      eventHasPicText: !!eventRow && eventRow.textContent.includes('PIC:') && eventRow.textContent.includes('Grace'),
      taskHasResponsibleText: !!taskRow && taskRow.textContent.includes('Grace'),
      activeCalTitleColor: activeCalRow ? getComputedStyle(activeCalRow.querySelector('.cal-row-title')).color : null,
      activeCalHasRange: !!activeCalRow && activeCalRow.textContent.includes('14–20 September 2026'),
      cancelledCalHasDoneClass: !!cancelledCalRow?.querySelector('.cal-row-title--done'),
      cancelledCalTitleColor: cancelledCalRow ? getComputedStyle(cancelledCalRow.querySelector('.cal-row-title')).color : null,
      graceColor,
    };
  });
  check('zero .cal-identity-dot elements anywhere in Day Detail (the redundant marker is gone)', dayDetailCheck.totalDots === 0, dayDetailCheck);
  check('the event row still shows "PIC: Grace" text (the one remaining identity signal)', dayDetailCheck.eventHasPicText, dayDetailCheck);
  check('the task row still shows the responsible person\'s name', dayDetailCheck.taskHasResponsibleText, dayDetailCheck);
  check('a non-cancelled Calendar-item row title is identity-colored (its replacement signal, since it has no PIC text of its own)', dayDetailCheck.activeCalTitleColor === dayDetailCheck.graceColor, dayDetailCheck);
  check('...and shows the R2 date-range label ("14–20 September 2026")', dayDetailCheck.activeCalHasRange, dayDetailCheck);
  check('a CANCELLED Calendar-item row keeps its muted cal-row-title--done treatment', dayDetailCheck.cancelledCalHasDoneClass, dayDetailCheck);
  check('...and does NOT leak identity color onto the cancelled title (stays the plain muted color, not Grace\'s)', dayDetailCheck.cancelledCalTitleColor !== dayDetailCheck.graceColor, dayDetailCheck);

  /* ══ J — SS9.2 R1/R2: sweep the remaining surfaces (Week timed rows,
     Daftar event/calendar/task rows, To-Do rows) that SS9.1 left dotted
     — Day Detail (I) and Calendar bars (H) were already covered above. ══ */
  console.log('\n[J — SS9.2 R1/R2: Week/Daftar/To-Do rows carry no identity dot, names/PIC/range text still shown]');
  await page.evaluate(() => window.__setDirectoryForTest?.({
    grace: { displayName: 'Grace', agendaParticipantType: 'sarpras_staff', active: true },
  }));
  const sweepEvent = {
    id: 'sw-ev1', title: 'Rapat Sweep', date: '2026-09-16', startTime: '09:00', endTime: '10:00',
    startAt: Date.parse('2026-09-16T09:00:00+07:00'), endAt: Date.parse('2026-09-16T10:00:00+07:00'),
    allDay: false, status: 'scheduled', scope: 'sarpras_shared', organizerUsername: 'grace', participants: { grace: { isPic: true } },
  };
  const sweepTask = {
    id: 'sw-tk1', title: 'Tugas Sweep', dueDate: '2026-09-16', dueTime: '11:00',
    dueAt: Date.parse('2026-09-16T11:00:00+07:00'), status: 'not_started', priority: 'normal',
    responsible: { grace: true }, scope: 'sarpras_shared',
  };
  const sweepCalendarItem = {
    id: 'sw-cal1', title: 'Sweep Sirnas', status: 'scheduled', scope: 'sarpras_shared', organizerUsername: 'grace',
    startDate: '2026-09-16', endDate: '2026-09-18', allDay: true,
    startAt: Date.parse('2026-09-16T00:00:00+07:00'), endAt: Date.parse('2026-09-18T23:59:00+07:00'),
    participants: { grace: { isPic: true } },
  };

  // Week view — timed event/task/calendar rows.
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [sweepEvent], tasks: [sweepTask], calendarItems: [],
    now: Date.parse('2026-09-16T08:00:00+07:00'), todayStr: '2026-09-16', mode: 'calendar', calendarView: 'week',
    calendarAnchor: '2026-09-16', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const weekCheck = await page.evaluate(() => ({
    totalDots: document.querySelectorAll('.cal-week-event .cal-identity-dot').length,
    eventTitleShown: document.body.textContent.includes('Rapat Sweep'),
    taskTitleShown: document.body.textContent.includes('Tugas Sweep'),
  }));
  check('Week view timed rows (event + task) carry zero identity dots', weekCheck.totalDots === 0, weekCheck);
  check('...titles still render (nothing else lost by removing the dot)', weekCheck.eventTitleShown && weekCheck.taskTitleShown, weekCheck);

  // Daftar (List) view — event, task, and calendar-item rows.
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [sweepEvent], tasks: [sweepTask], calendarItems: [sweepCalendarItem],
    now: Date.parse('2026-09-16T08:00:00+07:00'), todayStr: '2026-09-16', mode: 'agenda',
    calendarView: 'month', calendarAnchor: '2026-09-16', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const daftarCheck = await page.evaluate(() => ({
    totalDots: document.querySelectorAll('.cal-row .cal-identity-dot').length,
    eventHasPicText: document.body.textContent.includes('PIC: Grace'),
    calendarHasRangeText: document.body.textContent.includes('16–18 September 2026'),
  }));
  check('Daftar rows (event/task/calendar-item) carry zero identity dots', daftarCheck.totalDots === 0, daftarCheck);
  check('...the event row still shows "PIC: Grace"', daftarCheck.eventHasPicText, daftarCheck);
  check('...the calendar-item row still shows its R2 date range', daftarCheck.calendarHasRangeText, daftarCheck);

  // To-Do view.
  await page.evaluate((ctx) => window.__render(ctx), {
    events: [], tasks: [sweepTask], calendarItems: [],
    now: Date.parse('2026-09-16T08:00:00+07:00'), todayStr: '2026-09-16', mode: 'todo',
    calendarView: 'month', calendarAnchor: '2026-09-16', selectedDate: null,
    todoFilters: { status: 'all', priority: 'all', query: '' }, canManage: true, writableScopes: ['sarpras_shared'], loading: false, error: null,
  });
  const todoCheck = await page.evaluate(() => ({
    totalDots: document.querySelectorAll('.cal-todo-row .cal-identity-dot').length,
    responsibleTextShown: document.body.textContent.includes('Grace'),
    checkboxStillPresent: !!document.querySelector('.cal-checkbox'),
  }));
  check('To-Do rows carry zero identity dots', todoCheck.totalDots === 0, todoCheck);
  check('...the responsible person\'s name is still shown', todoCheck.responsibleTextShown, todoCheck);
  check('...the checkbox (a genuinely functional, non-identity marker) is untouched', todoCheck.checkboxStillPresent, todoCheck);

  console.log('\n[Z — console cleanliness]');
  check('zero console/page errors across the whole run', errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  server.close();
}

console.log(`\nagenda-identity-colors-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
