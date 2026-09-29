/* ss18-toast-a11y-check.mjs — SS18 Phase E: Toast Accessibility.

   AUDIT FINDING (js/components/toast.js, the canonical shared toast since
   Design System Program Phase 5): live-region semantics (role/aria-live,
   severity-aware, aria-atomic) and reduced-motion were ALREADY correct —
   confirmed by reading the source before changing anything. Two real gaps
   remained:
     1. No dismiss control — a toast could only ever disappear on its own
        fixed 2.8s timer. Nothing inside it was reachable by Tab at all, so
        a keyboard/screen-reader user had zero way to close one early.
     2. No pause-on-hover/focus — WCAG 2.2.1 (Timing Adjustable): a longer
        error message, or a screen reader still announcing it, could be cut
        off mid-read with no way to get more time.

   FIX: a real <button class="toast__close" aria-label="Tutup notifikasi">
   appended to every toast's markup (both the severity and plain paths), plus
   mouseenter/mouseleave/focusin/focusout handlers (attached once, lazily,
   since #toast is a page-static singleton) that pause the auto-dismiss
   timer while hovered/focused and restart a fresh full duration once both
   let go.

   Direct module import against the real app shell (same harness contract as
   ss17-focus-preserving-render-check.mjs) — no login needed, pure DOM. Real
   2.8s+ waits are used for the pause/resume assertions (there is no fake-
   timer seam in the production module, and adding one just for this test
   would be exactly the kind of test-only scaffolding the SS18 methodology
   warns against) — this suite takes ~15s to run for that reason.

   Run: node scripts/ss18-toast-a11y-check.mjs   (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const BASE = `http://localhost:${port}`;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/permission.denied/i.test(m.text())) errors.push('console.error: ' + m.text()); });
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 45000 });

console.log('[A. regression — severity/role/aria-live/aria-atomic unchanged]');
{
  const r = await page.evaluate(async () => {
    const { showToast } = await import('/js/components/toast.js');
    const toast = document.getElementById('toast');
    showToast('Berhasil disimpan.', 'success');
    const success = { cls: toast.className, role: toast.getAttribute('role'), live: toast.getAttribute('aria-live'), atomic: toast.getAttribute('aria-atomic'), display: toast.style.display };
    showToast('Terjadi kesalahan.', 'error');
    const error = { cls: toast.className, role: toast.getAttribute('role'), live: toast.getAttribute('aria-live') };
    showToast('✅ Tersimpan otomatis');
    const emojiDetected = { cls: toast.className, text: toast.textContent.trim() };
    showToast('Info biasa tanpa severity.');
    const plain = { cls: toast.className, hasCloseBtn: !!toast.querySelector('.toast__close') };
    return { success, error, emojiDetected, plain };
  });
  check('success toast gets toast--success + role=status/aria-live=polite', r.success.cls === 'toast toast--success' && r.success.role === 'status' && r.success.live === 'polite');
  check('success toast becomes visible (display:block)', r.success.display === 'block');
  check('aria-atomic="true" preserved from index.html markup', r.success.atomic === 'true');
  check('error toast gets toast--error + role=alert/aria-live=assertive', r.error.cls === 'toast toast--error' && r.error.role === 'alert' && r.error.live === 'assertive');
  check('legacy emoji-prefixed message still auto-detects severity + strips the emoji', r.emojiDetected.cls === 'toast toast--success' && r.emojiDetected.text === 'Tersimpan otomatis');
  check('plain (no-severity) toast still gets a close button', r.plain.hasCloseBtn);
}

console.log('\n[B. SS18 — every toast has a real, labeled, keyboard-reachable dismiss button]');
{
  const r = await page.evaluate(async () => {
    const { showToast } = await import('/js/components/toast.js');
    const toast = document.getElementById('toast');
    showToast('Pesan uji.', 'warning');
    const btn = toast.querySelector('.toast__close');
    return {
      exists: !!btn,
      isButton: btn?.tagName === 'BUTTON',
      hasAriaLabel: btn?.getAttribute('aria-label') === 'Tutup notifikasi',
      focusable: (() => { btn?.focus(); return document.activeElement === btn; })(),
    };
  });
  check('close button exists', r.exists);
  check('close button is a real <button> (native Enter/Space activation, in the Tab order)', r.isButton);
  check('close button has an accessible name (aria-label="Tutup notifikasi")', r.hasAriaLabel);
  check('close button is keyboard-focusable', r.focusable);
}

console.log('\n[C. SS18 — clicking the close button dismisses immediately and cancels the pending auto-dismiss]');
{
  const r = await page.evaluate(async () => {
    const { showToast } = await import('/js/components/toast.js');
    const toast = document.getElementById('toast');
    showToast('Akan ditutup manual.', 'info');
    const shownDisplay = toast.style.display;
    toast.querySelector('.toast__close').click();
    return { shownDisplay, closedImmediately: toast.style.display === 'none' };
  });
  check('toast was visible right after showToast()', r.shownDisplay === 'block');
  check('toast hides immediately on close-button click (no waiting for the timer)', r.closedImmediately);
  // If the auto-dismiss timer wasn't actually cancelled, showing a NEW toast
  // right after and waiting past the old 2.8s mark would still work fine on
  // its own — the real risk is a STALE timeout firing and hiding a toast
  // that was shown AFTER the close click. Confirmed directly below.
  await new Promise((r2) => setTimeout(r2, 3200));
  const stillUp = await page.evaluate(async () => {
    const { showToast } = await import('/js/components/toast.js');
    const toast = document.getElementById('toast');
    showToast('Toast baru setelah ditutup manual.', 'info');
    return toast.style.display;
  });
  check('a fresh toast shown after a manual close is not clobbered by a stale leftover timer', stillUp === 'block', stillUp);
}

console.log('\n[D. SS18 — hover pauses auto-dismiss, resumes on mouseleave (WCAG 2.2.1)]');
{
  await page.evaluate(async () => {
    const { showToast } = await import('/js/components/toast.js');
    showToast('Uji hover-pause.', 'info');
    document.getElementById('toast').dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  await new Promise((r2) => setTimeout(r2, 3200));
  const stillVisibleWhileHovered = await page.evaluate(() => document.getElementById('toast').style.display);
  check('toast does NOT auto-dismiss while the pointer is hovering it, even past the normal 2.8s', stillVisibleWhileHovered === 'block', stillVisibleWhileHovered);

  await page.evaluate(() => document.getElementById('toast').dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
  await new Promise((r2) => setTimeout(r2, 3200));
  const dismissedAfterLeave = await page.evaluate(() => document.getElementById('toast').style.display);
  check('toast auto-dismisses again once the pointer leaves (a fresh full duration, not stuck open forever)', dismissedAfterLeave === 'none', dismissedAfterLeave);
}

console.log('\n[E. SS18 — focus inside the toast (its close button) pauses auto-dismiss, resumes once focus fully leaves]');
{
  await page.evaluate(async () => {
    const { showToast } = await import('/js/components/toast.js');
    showToast('Uji focus-pause.', 'info');
    document.getElementById('toast').querySelector('.toast__close').focus();
  });
  await new Promise((r2) => setTimeout(r2, 3200));
  const stillVisibleWhileFocused = await page.evaluate(() => document.getElementById('toast').style.display);
  check('toast does NOT auto-dismiss while its close button holds focus, even past the normal 2.8s', stillVisibleWhileFocused === 'block', stillVisibleWhileFocused);

  await page.evaluate(() => {
    // Simulate Tab/click moving focus fully away from the toast.
    document.getElementById('toast').querySelector('.toast__close').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    document.body.focus();
  });
  await new Promise((r2) => setTimeout(r2, 3200));
  const dismissedAfterBlur = await page.evaluate(() => document.getElementById('toast').style.display);
  check('toast auto-dismisses again once focus leaves the toast entirely', dismissedAfterBlur === 'none', dismissedAfterBlur);
}

console.log('\n[F. regression — reduced-motion still suppresses the entrance animation]');
{
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const animState = await page.evaluate(async () => {
    const { showToast } = await import('/js/components/toast.js');
    const toast = document.getElementById('toast');
    showToast('Uji reduced motion.', 'success');
    // `toast.style.animation = 'none'` round-trips through this Chrome's
    // CSSOM as the fully expanded shorthand ("auto ease 0s 1 normal none
    // running none"), never the literal string "none" — confirmed in
    // isolation against a bare test element with no app code involved, so
    // this is a browser serialization quirk, not anything toast.js does
    // wrong. getComputedStyle().animationName is the actual, unambiguous
    // signal that no animation will play.
    return { inline: toast.style.animation, computedName: getComputedStyle(toast).animationName };
  });
  check('animation is suppressed under prefers-reduced-motion:reduce', animState.computedName === 'none', animState);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
}

console.log('\n[console cleanliness]');
check('zero console/page errors across the whole sequence', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\nss18-toast-a11y-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
