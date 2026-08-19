// Design System Program Phase 5 — static verification for the canonical
// toast + firebase error-curation + retired local-toast mechanisms.
// Mirrors scratch/verify-icon-consolidation-names.mjs's pattern: import
// real source where possible (Node-importable, no Firebase SDK URL
// specifiers), fall back to source-pattern checks for firebase.js itself
// (documented, established convention — see scripts/self-drive-assignment-
// check.mjs's own header for why: Firebase SDK https:// imports can't
// resolve under Node's ESM loader, and the config is the real prod project).

import { showToast } from '../js/components/toast.js';
import { anIcon } from '../js/analytics/analytics-shell.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let fail = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) fail++; };

console.log('[toast.js — icon resolution]');
check("anIcon('alert') resolves", /<path d="[^"]+"/.test(anIcon('alert', { size: 14 })));
check("anIcon('check') resolves", /<path d="[^"]+"/.test(anIcon('check', { size: 14 })));
check("anIcon('info') resolves", /<path d="[^"]+"/.test(anIcon('info', { size: 14 })));

console.log('\n[toast.js — severity + emoji-prefix auto-detection, in a fake DOM]');
{
  // Minimal fake #toast element — enough surface for showToast() to run
  // without a real browser (jsdom is not a project dependency; this mirrors
  // the app's own no-framework, hand-rolled-DOM style).
  const fakeEl = {
    _html: '', _class: '', _display: 'none', _attrs: {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set className(v) { this._class = v; },
    setAttribute(k, v) { this._attrs[k] = v; },
    style: { set animation(v) { this._anim = v; } },
  };
  global.document = { getElementById: (id) => (id === 'toast' ? fakeEl : null), documentElement: { getAttribute: () => null } };
  global.window = { matchMedia: () => ({ matches: false }) };

  showToast('✅ Tersimpan');
  check('emoji ✅ auto-detected as success, stripped from text', fakeEl._class === 'toast toast--success' && fakeEl._html.includes('Tersimpan') && !fakeEl._html.includes('✅'));

  showToast('❌ Gagal menyimpan');
  check('emoji ❌ auto-detected as error, stripped from text', fakeEl._class === 'toast toast--error' && !fakeEl._html.includes('❌'));
  check('error severity sets role="alert" + aria-live="assertive"', fakeEl._attrs.role === 'alert' && fakeEl._attrs['aria-live'] === 'assertive');

  showToast('Plain message, no severity');
  check('no severity/no emoji falls back to plain rendering (backward-compatible default)', fakeEl._class === 'toast' && fakeEl._attrs.role === 'status' && fakeEl._attrs['aria-live'] === 'polite');

  showToast('Explicit warning', { severity: 'warning' });
  check('explicit opts.severity wins over auto-detection', fakeEl._class === 'toast toast--warning');
}

console.log('\n[js/firebase.js — error curation, source-pattern (see header for why not imported)]');
{
  const fb = src('js/firebase.js');
  check('_curateFirebaseError helper exists', fb.includes('function _curateFirebaseError('));
  check('curated message never hardcodes a raw Firebase term', !/curated\.message\s*=.*permission_denied/i.test(fb));
  // Anchor on "function saveOneAssignment(" (the declaration), not the bare
  // name — an earlier, unrelated comment elsewhere in the file also
  // mentions "saveOneAssignment()" in prose, which threw off a naive search.
  const fnBody = (name, len) => {
    const i = fb.indexOf(`function ${name}(`);
    return i === -1 ? '' : fb.slice(i, i + len);
  };
  check('saveOneAssignment returns the curated error, not the raw err', fnBody('saveOneAssignment', 900).includes('return { ok: false, error: curated }'));
  check('saveManyAssignments returns the curated error, not the raw err', fnBody('saveManyAssignments', 900).includes('return { ok: false, error: curated }'));
  check('removeOneAssignment returns the curated error, not the raw err (parity fix)', fnBody('removeOneAssignment', 900).includes('return { ok: false, error: curated }'));
  check('removeOneAssignment now resolves {ok:true} on success (previously undefined)', fnBody('removeOneAssignment', 900).includes('.then(() => ({ ok: true }))'));
  check('opts.silent gating present on all 3 write functions (no regression for the 6 fire-and-forget callers)',
    ['saveOneAssignment', 'saveManyAssignments', 'removeOneAssignment'].every((name) => fnBody(name, 900).includes('if (!opts.silent)')));
}

console.log('\n[js/components/save-feedback.js — error icon]');
{
  const sf = src('js/components/save-feedback.js');
  check("showError() renders anIcon('alert')", /anIcon\('alert'/.test(sf));
}

console.log('\n[4 retired local-toast mechanisms — no leftover render-state plumbing]');
{
  const files = [
    ['js/petty-cash/petty-cash-center.js', ['toastEl(', 'st.toast', '_toastT']],
    ['js/overtime/overtime-center.js', ['toastEl(', 'st.toast', '_toastT']],
    ['js/role-management/role-management-center.js', ['toastMsg', 'toastTimer']],
    ['js/gudang/ui/gudang-center.js', ['st.toast']],
  ];
  for (const [file, patterns] of files) {
    const text = src(file);
    for (const p of patterns) {
      check(`${file} no longer contains "${p}"`, !text.includes(p));
    }
    check(`${file} imports the canonical toast`, text.includes("from '../components/toast.js'") || text.includes("from '../../components/toast.js'"));
  }
}

console.log('\n[js/assignments.js — flagship field validation wiring]');
{
  const a = src('js/assignments.js');
  check('imports validation.js primitives', /import \{ validateRequired, validateTimeFormat, validateTimeRange, validateDateRange \} from '\.\/validation\.js';/.test(a));
  check('runFieldChecks() covers all 8 flagship fields', ['fieldDriver', 'fieldVehicle', 'fieldDate', 'fieldEndDate', 'assignmentTimeStart', 'assignmentTimeEnd', 'fieldDestination', 'fieldPurpose'].every((id) => a.includes(`'${id}'`)));
  check('old all-or-nothing toast call is gone', !a.includes("showToast('⚠️ Lengkapi semua field wajib"));
  check('focuses first invalid field on submit', a.includes('_fieldErrorInputs(failedChecks[0][0])[0]?.focus()'));
  check('redundant onError toast removed (inline errorRegion is now sole error surface)', !a.includes("showToast('❌ Gagal menyimpan jadwal"));
  check('blur listener wired in capture phase', /addEventListener\('blur', \(ev\) => \{[\s\S]{0,400}\}, true\)/.test(a));
}

console.log('\n[index.html — 8 field-error nodes + accessible toast]');
{
  const html = src('index.html');
  const fields = ['fieldDriver', 'fieldVehicle', 'fieldDate', 'fieldEndDate', 'assignmentTimeStart', 'assignmentTimeEnd', 'fieldDestination', 'fieldPurpose'];
  for (const id of fields) check(`err-${id} node present`, html.includes(`id="err-${id}"`));
  check('#toast has aria-live', /id="toast"[^>]*aria-live="polite"/.test(html));
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nAll error-UX foundation checks passed.');
process.exit(fail ? 1 : 0);
