/* ss11-hari-ini-context-check.mjs — SS11: "Hari Ini" must always land on/near
   literal current time once nothing is active/upcoming today, never a stale
   past block.

   Root cause (SS10 documented limitation): _focusPxForDate's isToday branch
   called pickRelevantAssignment() with its full A/active B/upcoming C/nearest-
   previous ranking. When today had only an already-ended assignment and
   nothing active/upcoming, tier C won and "Hari Ini" centered on that stale
   past block — contradicting updateDateLabel's own btnToday disabled-state
   contract ("Hari Ini can always re-centre on now" — Part 16), which is
   direct, unambiguous evidence for the intended semantics.

   Fix: pickRelevantAssignment gained an opt-in-by-default `includePrevious`
   option (default true — every OTHER caller, and this function's own
   pre-existing unit tests, are unaffected); _focusPxForDate's isToday branch
   passes { includePrevious: false }, so tier C never overrides "now" for
   that ONE call site. _computeAutoFocusTarget (initial page-load auto-focus)
   is a deliberately different contract and keeps the full ranking.

   js/timeline.js transitively imports js/firebase.js (a CDN https:// URL),
   so — like every other timeline test in this suite — it can only be
   imported inside a real browser page, never via a plain Node dynamic
   import. Both parts below drive the real module inside the same
   timeline-autofocus-harness.html the other timeline suites use.

   Part A (deterministic, fixed reference "now") — pickRelevantAssignment's
   new option, cases 1/2/3/4/5/6 plus cancelled-exclusion.
   Part B (real browser, "Hari Ini" click → scroll position) — cases
   1/3/4/5/7/8/9 against the real UI at desktop width, plus case 10 (the
   regression case, 390/430) at the end. Case 2 is covered by Part A (the
   pure ranking decides it) and case 6 by Part A's multi-candidate check.
   (timeline-responsive-check.mjs covers general mobile layout/overflow at
   these widths but never actually clicks btnToday — that check belongs
   here.)

   Run: node scripts/ss11-hari-ini-context-check.mjs   (exit 0 = all pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

async function withPage(viewport, run) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|firebase|permission|network/i.test(m.text())) errors.push('console.error: ' + m.text()); });
  await page.setViewport(viewport);
  await page.goto(`http://localhost:${port}/scripts/timeline-autofocus-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate(async () => {
    const tl = await import('/js/timeline.js');
    window.__tl = tl;
    document.getElementById('v2TimelineSurface').classList.add('shown');
    const pad = (n) => String(n).padStart(2, '0');
    window.__at = (h) => { const d = new Date(); d.setHours(d.getHours() + h); return d; };
    window.__dOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    window.__tOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    window.__span = (id, startH, endH, status = 'assigned') => {
      const s = window.__at(startH), e = window.__at(endH);
      return { id, driver: 'D', vehicle: '', date: window.__dOf(s), startTime: window.__tOf(s), endTime: window.__tOf(e), fullDay: false, status, destination: 'X', purpose: id, pic: '', pax: 0 };
    };
  });
  try {
    return await run(page, errors);
  } finally {
    await browser.close();
  }
}

/* ══════════════════════════ Part A — pure function ══════════════════════ */
console.log('[A — pickRelevantAssignment: includePrevious option]');
await withPage({ width: 1280, height: 900 }, async (page, errors) => {
  const r = await page.evaluate(() => {
    const { pickRelevantAssignment } = window.__tl;
    const now = new Date('2026-09-17T22:00:00');
    const pad = (n) => String(n).padStart(2, '0');
    const at = (h) => { const d = new Date(now); d.setHours(d.getHours() + h); return d; };
    const dOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const tOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const span = (id, startH, endH, status = 'assigned') => {
      const s = at(startH), e = at(endH);
      return { id, status, driver: 'D', destination: 'X', date: dOf(s), startTime: tOf(s), endTime: tOf(e), fullDay: false };
    };

    const active = span('active', -1, 1);       // started 1h ago, ends in 1h
    const upcoming = span('upcoming', 2, 3);     // starts in 2h
    const past = span('past', -4, -2);           // ended 2h ago
    const cancelled = span('cancelled', -1, 1, 'cancelled');
    // Overnight-active: started 2h ago, ends in 6h — an 8h span guaranteed
    // to contain `now` (NOT a multiple of 24h apart, unlike the original
    // -20/+4 attempt, whose start/end clock-TIME-OF-DAY coincided exactly —
    // a 24h-apart pair always does — degenerating to a same-time,
    // zero-length span once crossesMidnight's endMin<startMin check saw
    // equal minutes). Naturally crosses midnight (spans yesterday/today or
    // today/tomorrow) whenever `now` is within ~2h of midnight.
    const overnight = span('overnight', -2, 6);

    return {
      c1a: pickRelevantAssignment([active, past], now)?.assignment.id,
      c1b: pickRelevantAssignment([active, past], now, { includePrevious: false })?.assignment.id,
      c2a: pickRelevantAssignment([upcoming, past], now)?.assignment.id,
      c2b: pickRelevantAssignment([upcoming, past], now, { includePrevious: false })?.assignment.id,
      c3default: pickRelevantAssignment([past], now)?.assignment.id,
      c3excluded: pickRelevantAssignment([past], now, { includePrevious: false }),
      c4a: pickRelevantAssignment([], now),
      c4b: pickRelevantAssignment([], now, { includePrevious: false }),
      c5: pickRelevantAssignment([overnight], now, { includePrevious: false })?.assignment.id,
      c6: pickRelevantAssignment([past, upcoming, active], now, { includePrevious: false })?.assignment.id,
      cCancelledDefault: pickRelevantAssignment([cancelled], now),
      cCancelledExcluded: pickRelevantAssignment([cancelled], now, { includePrevious: false }),
    };
  });
  check('[1] active now → returned regardless of includePrevious', r.c1a === 'active' && r.c1b === 'active', r);
  check('[2] upcoming today (no active) → returned regardless of includePrevious', r.c2a === 'upcoming' && r.c2b === 'upcoming', r);
  check('[3] past-only, includePrevious:true (default) → the past block (unchanged existing behavior)', r.c3default === 'past', r);
  check('[3] past-only, includePrevious:false → null (the SS11 fix)', r.c3excluded === null, r);
  check('[4] no candidates → null either way', r.c4a === null && r.c4b === null, r);
  check('[5] overnight active (started yesterday, running now) → active tier, unaffected', r.c5 === 'overnight', r);
  check('[6] multiple (active + upcoming + past) → deterministically the ACTIVE one', r.c6 === 'active', r);
  check('cancelled is never picked, with or without includePrevious', r.cCancelledDefault === null && r.cCancelledExcluded === null, r);
  check('[A] zero console/page errors', errors.length === 0, errors);
});

/* ══════════════════════ Part B — real browser, "Hari Ini" ═══════════════ */

/** click "Hari Ini" and report where the viewport landed relative to literal "now". */
async function clickTodayAndMeasure(page) {
  return page.evaluate(async () => {
    const tl = window.__tl;
    if (!window.__wired) { tl.initDateControls(); window.__wired = true; }
    tl.renderTimeline();
    await new Promise((r) => setTimeout(r, 1200)); // settle auto-focus first
    const btn = document.getElementById('btnToday');
    btn.click();
    await new Promise((r) => setTimeout(r, 1200)); // settle the smooth-scroll tween
    const body = document.getElementById('timelineBody');
    const hw = tl.getHourWidth();
    const todayIdx = tl.dateToDayIndex(tl.getCurrentDate());
    const now = new Date();
    const nowPx = todayIdx * 24 * hw + (now.getHours() * 60 + now.getMinutes()) / 60 * hw;
    const sl = body.scrollLeft, cw = body.clientWidth;
    const nowInView = nowPx >= sl - 6 && nowPx <= sl + cw + 6;
    return { nowInView, nowPx, sl, cw };
  });
}

console.log('\n[B — real browser: "Hari Ini" lands on/near "now" per scenario]');

// Case 3 (the actual SS10/SS11 regression): today has ONLY a stale past assignment.
await withPage({ width: 1280, height: 900 }, async (page, errors) => {
  await page.evaluate(() => window.__tl.setAssignments([window.__span('past', -6, -4)]));
  const r = await clickTodayAndMeasure(page);
  check('[3] past-only today → "Hari Ini" lands on literal NOW (the regression this phase fixes)', r.nowInView, r);
  check('[3] zero console/page errors', errors.length === 0, errors);
});

// Case 4: no assignments TODAY. The harness has no real drivers-store feed
// (no live Firebase data in this synthetic page), so with a truly EMPTY
// assignment list the canvas renders zero driver rows and has nothing to
// scroll at all (a browser can't move scrollLeft on a non-overflowing
// container) — a harness artifact, not a real production state (this is a
// driver-scheduling app; the roster is never actually empty). A filler
// assignment on a day far from today keeps a driver row (hence real
// scrollable width) in play while today itself genuinely has none.
await withPage({ width: 1280, height: 900 }, async (page, errors) => {
  await page.evaluate(() => window.__tl.setAssignments([window.__span('filler-elsewhere', 24 * 10, 24 * 10 + 2)]));
  const r = await clickTodayAndMeasure(page);
  check('[4] no assignments today → "Hari Ini" lands on literal NOW, no crash, nothing fabricated', r.nowInView, r);
  check('[4] zero console/page errors', errors.length === 0, errors);
});

// Case 1: an active assignment exists — Hari Ini should focus it; "now" falls within its own span so still visible.
await withPage({ width: 1280, height: 900 }, async (page, errors) => {
  await page.evaluate(() => window.__tl.setAssignments([window.__span('active', -1, 1)]));
  const r = await clickTodayAndMeasure(page);
  check('[1] active-now assignment → "Hari Ini" still shows "now" in view (active span contains it)', r.nowInView, r);
  check('[1] zero console/page errors', errors.length === 0, errors);
});

// Case 5: overnight-active (started 2h ago, ends in 6h — naturally crosses
// midnight whenever "now" is within ~2h of it; always active by construction).
await withPage({ width: 1280, height: 900 }, async (page, errors) => {
  await page.evaluate(() => window.__tl.setAssignments([window.__span('overnight', -2, 6)]));
  const r = await clickTodayAndMeasure(page);
  check('[5] overnight active assignment → "Hari Ini" shows "now" in view', r.nowInView, r);
  check('[5] zero console/page errors', errors.length === 0, errors);
});

// Case 7/8: an assignment that belongs to YESTERDAY or TOMORROW only (does not
// overlap today at all) must not be mistaken for today's context — Hari Ini
// with no other data today must still fall through to literal "now".
await withPage({ width: 1280, height: 900 }, async (page) => {
  await page.evaluate(() => window.__tl.setAssignments([window.__span('yesterday-only', -30, -26)]));
  const r = await clickTodayAndMeasure(page);
  check('[7] a YESTERDAY-only assignment is not mistaken for today\'s context — "Hari Ini" still lands on "now"', r.nowInView, r);
});
await withPage({ width: 1280, height: 900 }, async (page) => {
  await page.evaluate(() => window.__tl.setAssignments([window.__span('tomorrow-only', 26, 30)]));
  const r = await clickTodayAndMeasure(page);
  check('[8] a TOMORROW-only assignment is not mistaken for today\'s context — "Hari Ini" still lands on "now"', r.nowInView, r);
});

// Case 9: repeated "Hari Ini" clicks — no accumulated listeners/DOM/state drift.
await withPage({ width: 1280, height: 900 }, async (page, errors) => {
  await page.evaluate(() => window.__tl.setAssignments([window.__span('past', -6, -4)]));
  const r = await page.evaluate(async () => {
    const tl = window.__tl;
    if (!window.__wired) { tl.initDateControls(); window.__wired = true; }
    tl.renderTimeline();
    await new Promise((res) => setTimeout(res, 1200));
    const btn = document.getElementById('btnToday');
    const positions = [];
    for (let i = 0; i < 5; i++) {
      btn.click();
      await new Promise((res) => setTimeout(res, 900));
      positions.push(document.getElementById('timelineBody').scrollLeft);
    }
    return {
      positions,
      drift: Math.max(...positions) - Math.min(...positions),
      btnNodeCount: document.querySelectorAll('#btnToday').length,
      bodyNodeCount: document.querySelectorAll('#timelineBody').length,
    };
  });
  check('[9] repeated "Hari Ini" clicks settle to the SAME position each time (no drift)', r.drift <= 4, r);
  check('[9] no duplicate #btnToday / #timelineBody nodes after repeated clicks', r.btnNodeCount === 1 && r.bodyNodeCount === 1, r);
  check('[9] zero console/page errors across repeated activation', errors.length === 0, errors);
});

// Case 10: mobile — the actual regression case (past-only today) at both
// required mobile widths, light + dark. timeline-responsive-check.mjs
// covers general layout/overflow at these widths but never clicks btnToday.
for (const vp of [{ w: 390, name: '390px' }, { w: 430, name: '430px' }]) {
  await withPage({ width: vp.w, height: 900 }, async (page, errors) => {
    await page.evaluate(() => window.__tl.setAssignments([window.__span('past', -4, -2)]));
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const r = await clickTodayAndMeasure(page);
      check(`[10 — ${vp.name} ${theme}] past-only today → "Hari Ini" lands on literal NOW`, r.nowInView, r);
    }
    check(`[10 — ${vp.name}] zero console/page errors`, errors.length === 0, errors);
  });
}

server.close();
console.log(`\nss11-hari-ini-context-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
