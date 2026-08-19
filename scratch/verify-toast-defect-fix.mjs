// Design System Program Phase 5 — targeted verification for the hostile-
// review fixes (Defect A: string-form severity normalization; Defect B:
// Petty Cash classification gaps). Static + a fake-DOM runtime check,
// mirroring scratch/verify-error-ux-names.mjs's own pattern.

import { showToast } from '../js/components/toast.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let fail = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) fail++; };

function fakeToastEnv() {
  const el = {
    _html: '', _class: '', _attrs: {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set className(v) { this._class = v; }, get className() { return this._class; },
    setAttribute(k, v) { this._attrs[k] = v; },
    style: {},
  };
  global.document = { getElementById: (id) => (id === 'toast' ? el : null), documentElement: { getAttribute: () => null } };
  global.window = { matchMedia: () => ({ matches: false }) };
  return el;
}

console.log('[Defect A — string-form severity, the exact js/app.js call pattern]');
{
  const el = fakeToastEnv();
  showToast('Gagal mengubah status.', 'error');
  check("showToast(msg, 'error') applies error class", el.className === 'toast toast--error');
  check("showToast(msg, 'error') sets role=alert/aria-live=assertive", el._attrs.role === 'alert' && el._attrs['aria-live'] === 'assertive');
  check("showToast(msg, 'error') renders the alert icon", el._html.includes('<svg'));

  showToast('Instalasi dibatalkan.', 'info');
  check("showToast(msg, 'info') applies info class", el.className === 'toast toast--info');
  check("showToast(msg, 'info') sets role=status/aria-live=polite (non-error)", el._attrs.role === 'status' && el._attrs['aria-live'] === 'polite');

  showToast('x', 'warning');
  check("showToast(msg, 'warning') applies warning class", el.className === 'toast toast--warning');

  showToast('x', 'success');
  check("showToast(msg, 'success') applies success class", el.className === 'toast toast--success');

  showToast('x', 'not-a-real-severity');
  check('an invalid string severity falls back to plain (no crash, no bogus class)', el.className === 'toast');
}

console.log('\n[Object-form callers remain unaffected — regression guard]');
{
  const el = fakeToastEnv();
  showToast('Test', { severity: 'error' });
  check("showToast(msg, {severity:'error'}) still applies error class", el.className === 'toast toast--error');
  showToast('Test');
  check('showToast(msg) with no 2nd arg still renders plain', el.className === 'toast');
  showToast('✅ Tersimpan');
  check('emoji auto-detection still works (unaffected by the string-form change)', el.className === 'toast toast--success' && !el._html.includes('✅'));
}

console.log('\n[All 12 identified js/app.js call sites — source-level confirmation they use the now-supported string form]');
{
  const app = src('js/app.js');
  const expected = [
    [5912, "err.message || 'Gagal mengubah status.', 'error'"],
    [5926, "err.message || 'Gagal mengarsipkan user.', 'error'"],
    [5940, "err.message || 'Gagal memulihkan user.', 'error'"],
    [6374, "err.message || 'Gagal mengarsipkan driver.', 'error'"],
    [6388, "err.message || 'Gagal memulihkan driver.', 'error'"],
    [8274, "'Instalasi dibatalkan.', 'info'"],
    [8746, "err.message || 'Gagal mengarsipkan kendaraan.', 'error'"],
    [8753, "err.message || 'Gagal memulihkan kendaraan.', 'error'"],
    [10447, "'Pilih nilai kanonik terlebih dahulu.', 'error'"],
    [10457, "v.reason, 'error'"],
    [10470, "'Gagal menyimpan alias.', 'error'"],
    [11536, "err.message || 'Gagal menghapus.', 'error'"],
  ];
  for (const [line, snippet] of expected) {
    check(`app.js:${line} call pattern present, unmodified (fix is in the API, not the call site)`, app.includes(snippet));
  }
}

console.log('\n[Defect B — Petty Cash classification gaps]');
{
  const pc = src('js/petty-cash/petty-cash-center.js');
  check("'Transaksi telah direalisasikan...' now tagged 'warning'", pc.includes("toast('Transaksi telah direalisasikan dalam NOR dan tidak dapat diubah.', 'warning')"));
  check("'Menyiapkan Excel…' (doExportNor) now tagged 'info'", /doExportNor[\s\S]{0,150}toast\('Menyiapkan Excel…', 'info'\)/.test(pc));
  check("'Menyiapkan Excel…' (doExportExpenses) now tagged 'info'", /doExportExpenses[\s\S]{0,150}toast\('Menyiapkan Excel…', 'info'\)/.test(pc));
  check("'Menyiapkan PDF…' now tagged 'info'", /doPrintNor[\s\S]{0,150}toast\('Menyiapkan PDF…', 'info'\)/.test(pc));
  // Wording/business-logic guard: only the severity argument should differ —
  // confirm the message strings themselves are byte-identical to before.
  check('message wording unchanged (no accidental text edits)', pc.includes("'Transaksi telah direalisasikan dalam NOR dan tidak dapat diubah.'") && pc.includes("'Menyiapkan Excel…'") && pc.includes("'Menyiapkan PDF…'"));
}

console.log('\n[Defect C — confirmed NOT touched, as instructed]');
{
  const ti = src('js/timeline-interactions.js');
  check('timeline-interactions.js untouched: still has the bare U+26A0 glyphs (deferred, not fixed)', ti.includes('⚠ Tidak ada driver') && ti.includes('⚠ Tidak dapat memindahkan') && ti.includes('⚠ Tidak dapat mengubah durasi'));
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nAll targeted defect-fix checks passed.');
process.exit(fail ? 1 : 0);
