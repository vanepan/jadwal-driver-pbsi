/* ============================================================
   INTELLIGENCE-CONSOLE.JS — Sarpras Intelligence (V2, Phase 3B)

   The minimal user-facing surface for Sarpras Intelligence. It proves ONE
   browser flow end-to-end and nothing more:

     input → Intelligence Service → server-owned conversation → needs_input
           → user answers → continueSession() → requires_review (read-only draft)

   SCOPE (deliberately small): NO editable preview, NO publish / "Terbitkan",
   NO NOR Registry, NO official numbering, NO knowledge ingestion, NO
   autonomous action. The review panel is DISPLAY ONLY.

   ARCHITECTURE:
     • all conversation/orchestration logic → the PURE
       src/intelligence/console/intelligence-console-controller.js
     • the real service is assembled by js/intelligence-backend-wiring.js
       (this file imports ONLY that bridge — never src/intelligence/ directly,
       never js/firebase.js, never a callable)
     • this file owns ONLY the DOM: build the shell once, patch regions on
       each controller onChange (so the text input never loses focus/caret)

   GATING: mounted by js/app.js#navSarprasIntelligence() ONLY when
   isV2Enabled(currentUser) AND the synced Intelligence feature flag is ON.
   With the flag OFF (production default) this module is never fetched and
   never mounted. Even mounted, it makes ZERO service calls until the user
   explicitly submits.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { createWiredIntelligenceConsoleController } from './intelligence-backend-wiring.js';

const STYLE_ID = 'sic-console-style';
const CSS = `
.sic-console{width:100%;max-width:720px;margin:0 auto;padding:16px;box-sizing:border-box;
  font:14px/1.5 var(--font-sans,system-ui,-apple-system,Segoe UI,Roboto,sans-serif);
  color:var(--text,#1b1b1f);overflow-x:hidden}
.sic-console *{box-sizing:border-box}
.sic-console__head{margin:0 0 4px}
.sic-console__title{margin:0;font-size:18px;font-weight:700}
.sic-console__sub{margin:2px 0 14px;color:var(--text-muted,#5b5b66);font-size:13px}
.sic-console__stack{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
.sic-console__msg{max-width:100%;padding:10px 12px;border-radius:12px;white-space:pre-wrap;
  overflow-wrap:anywhere;word-break:break-word}
.sic-console__msg--user{align-self:flex-end;background:var(--accent-soft,#e7efff);
  border:1px solid var(--accent-border,#c7dbff)}
.sic-console__msg--intelligence{align-self:flex-start;background:var(--surface-2,#f4f4f6);
  border:1px solid var(--border,#e2e2e8)}
.sic-console__role{display:block;font-size:11px;font-weight:700;letter-spacing:.02em;
  text-transform:uppercase;color:var(--text-muted,#6b6b76);margin-bottom:2px}
.sic-console__form{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}
.sic-console__label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sic-console__input{flex:1 1 220px;min-width:0;padding:10px 12px;border-radius:10px;
  border:1px solid var(--border,#c9c9d2);background:var(--surface,#fff);color:inherit;font:inherit}
.sic-console__input:disabled{opacity:.6}
.sic-console__btn{flex:0 0 auto;padding:10px 18px;border-radius:10px;border:1px solid transparent;
  background:var(--accent,#2f6fed);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.sic-console__btn:disabled{opacity:.6;cursor:default}
.sic-console__btn--ghost{background:transparent;color:var(--accent,#2f6fed);
  border-color:var(--accent,#2f6fed);margin-top:10px}
.sic-console__hint{margin:8px 0 0;font-size:12px;color:var(--text-muted,#6b6b76)}
.sic-console__error{margin:10px 0 0;padding:10px 12px;border-radius:10px;
  background:var(--danger-soft,#fdecec);border:1px solid var(--danger-border,#f5c2c2);
  color:var(--danger-text,#8a1f1f);overflow-wrap:anywhere}
.sic-console__review{margin-top:16px;padding:14px;border:1px solid var(--border,#e2e2e8);
  border-radius:12px;background:var(--surface,#fff)}
.sic-console__review h3{margin:0 0 10px;font-size:15px}
.sic-console__dl{margin:0;display:grid;grid-template-columns:minmax(0,140px) minmax(0,1fr);
  gap:6px 12px}
.sic-console__dl dt{font-weight:600;color:var(--text-muted,#5b5b66)}
.sic-console__dl dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
.sic-console__note{margin:10px 0 0;font-size:12px;color:var(--text-muted,#6b6b76)}
@media (max-width:520px){
  .sic-console{padding:12px}
  .sic-console__btn{flex:1 1 100%}
  .sic-console__dl{grid-template-columns:1fr}
  .sic-console__dl dt{margin-top:6px}
}`;

function injectStyleOnce() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const PHASE_HINT = {
  idle: 'Mulailah dengan menjelaskan kebutuhan Anda, mis. "buat NOR pengadaan kursi rapat".',
  needs_input: 'Jawab pertanyaan di atas dengan singkat, lalu tekan Kirim.',
  loading: 'Memproses…',
  review: 'Ini ringkasan draf — hanya untuk ditinjau. Belum ada penerbitan atau penomoran.',
  error: '',
};

let _mounted = false;
let _host = null;
let _controller = null;
let _els = null;
let _draftInput = '';   // live keystrokes — NEVER pushed into controller state (keeps focus)

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Build the shell ONCE. Regions are patched afterwards; the <input> node is
 *  never replaced, so focus + caret survive every state change. */
function buildShell(host) {
  host.innerHTML = `
    <div class="sic-console" data-sic-console>
      <div class="sic-console__head">
        <h2 class="sic-console__title">Sarpras Intelligence</h2>
        <p class="sic-console__sub">Apa yang ingin Anda kerjakan?</p>
      </div>
      <div class="sic-console__stack" data-region="stack" aria-live="polite"></div>
      <form class="sic-console__form" data-region="form" novalidate>
        <label class="sic-console__label" for="sicConsoleInput" data-region="label">Tulis permintaan</label>
        <input class="sic-console__input" id="sicConsoleInput" type="text" autocomplete="off"
               placeholder="Tulis permintaan…" data-region="input" />
        <button class="sic-console__btn" type="submit" data-region="btn">Kirim</button>
      </form>
      <p class="sic-console__hint" data-region="hint"></p>
      <div class="sic-console__error" data-region="error" role="alert" hidden></div>
      <div data-region="review"></div>
      <button class="sic-console__btn sic-console__btn--ghost" type="button" data-region="reset" hidden>
        Mulai permintaan baru
      </button>
    </div>`;

  const q = (sel) => host.querySelector(sel);
  _els = {
    root: q('[data-sic-console]'),
    stack: q('[data-region="stack"]'),
    form: q('[data-region="form"]'),
    label: q('[data-region="label"]'),
    input: q('[data-region="input"]'),
    btn: q('[data-region="btn"]'),
    hint: q('[data-region="hint"]'),
    error: q('[data-region="error"]'),
    review: q('[data-region="review"]'),
    reset: q('[data-region="reset"]'),
  };

  // Keystrokes update ONLY the local draft — no re-render, no controller call.
  _els.input.addEventListener('input', (e) => { _draftInput = e.target.value; });
  _els.form.addEventListener('submit', (e) => { e.preventDefault(); submitCurrent(); });
  _els.reset.addEventListener('click', () => { _draftInput = ''; _controller && _controller.reset(); });
}

function submitCurrent() {
  if (!_controller) return;
  const st = _controller.getState();
  if (st.busy) return;
  const text = (_draftInput || '').trim();
  if (!text) { _els.input.focus(); return; }
  // needs_input / an errored live conversation → answer(); otherwise submit().
  if (st.conversationId && st.phase !== 'idle') _controller.answer(text);
  else _controller.submit(text);
}

function renderStack(messages) {
  _els.stack.innerHTML = messages.map((m) => {
    const who = m.role === 'user' ? 'user' : 'intelligence';
    const label = m.role === 'user' ? 'Anda' : 'Intelligence';
    return `<div class="sic-console__msg sic-console__msg--${who}">
      <span class="sic-console__role">${label}</span>${esc(m.text)}</div>`;
  }).join('');
}

function renderReview(state) {
  if (state.phase !== 'review' || !state.draft || !state.draft.fields) { _els.review.innerHTML = ''; return; }
  const f = state.draft.fields;
  const rows = [];
  const add = (k, v) => { if (v != null && v !== '') rows.push([k, v]); };
  add('Jenis', f.norType);
  add('Subjek', f.subject);
  add('Kepada', f.recipient ? `${f.recipient}${f.recipientStatus === 'proposed' ? ' (usulan — mohon dikonfirmasi)' : ''}` : null);
  add('Tanggal', f.date);
  const details = f.details && typeof f.details === 'object' ? f.details : {};
  for (const [k, v] of Object.entries(details)) add(k.charAt(0).toUpperCase() + k.slice(1), v);
  add('Status', 'Menunggu review');
  const bodySrc = f.metadata && f.metadata.bodySource;
  _els.review.innerHTML = `
    <div class="sic-console__review">
      <h3>Review</h3>
      <dl class="sic-console__dl">
        ${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
      </dl>
      ${f.body ? `<dl class="sic-console__dl"><dt>Isi</dt><dd>${esc(f.body)}</dd></dl>` : ''}
      <p class="sic-console__note">Ringkasan ini hanya untuk ditinjau — tidak ada tombol sunting,
      terbitkan, atau penomoran resmi pada tahap ini.${bodySrc ? ` (Sumber isi: ${esc(bodySrc)}.)` : ''}</p>
    </div>`;
}

/** Patch every region from a controller state snapshot. */
function paint(state) {
  if (!_els) return;
  renderStack(state.messages);
  renderReview(state);

  const busy = state.busy === true;
  _els.input.disabled = busy;
  _els.btn.disabled = busy;
  _els.btn.textContent = busy ? 'Memproses…' : 'Kirim';

  // The label + placeholder track the current question when there is one.
  const q0 = state.questions && state.questions[0];
  const labelText = q0 ? (q0.why || q0.prompt) : 'Tulis permintaan';
  _els.label.textContent = labelText;
  _els.input.setAttribute('aria-label', labelText);
  _els.input.placeholder = q0 ? 'Tulis jawaban…' : 'Tulis permintaan…';

  // Restore the field after a failed turn; clear it once a turn succeeds.
  if (state.phase === 'error') {
    if (state.pendingInput && !_draftInput) { _draftInput = state.pendingInput; _els.input.value = _draftInput; }
  } else if (!busy) {
    _draftInput = '';
    _els.input.value = '';
  }

  _els.hint.textContent = PHASE_HINT[state.phase] || '';
  if (state.error) { _els.error.hidden = false; _els.error.textContent = state.error; }
  else { _els.error.hidden = true; _els.error.textContent = ''; }

  _els.reset.hidden = !(state.phase === 'review' || state.phase === 'error');

  // Keyboard focus: return to the input whenever it is usable (not while loading).
  if (!busy && typeof _els.input.focus === 'function') {
    try { _els.input.focus({ preventScroll: true }); } catch { _els.input.focus(); }
  }
}

/**
 * Mount the console into a platform-owned host.
 * @param {HTMLElement} hostEl
 * @param {{ controller?: object }} [opts]  inject a controller for tests; production builds the real one
 */
export async function mountIntelligenceConsole(hostEl, opts = {}) {
  if (!hostEl) return;
  _host = hostEl;
  injectStyleOnce();
  buildShell(hostEl);

  if (opts && opts.controller) {
    _controller = opts.controller;
  } else {
    const user = getCurrentUser && getCurrentUser();
    _controller = await createWiredIntelligenceConsoleController({
      actor: { userId: (user && user.username) || null, role: (user && user.role) || null },
    });
  }
  if (typeof _controller.setOnChange === 'function') _controller.setOnChange(paint);

  _mounted = true;
  paint(_controller.getState());
}

export function unmountIntelligenceConsole() {
  if (_controller && typeof _controller.destroy === 'function') {
    try { _controller.destroy(); } catch { /* ignore */ }
  }
  if (_host) _host.innerHTML = '';
  _mounted = false;
  _host = null;
  _controller = null;
  _els = null;
  _draftInput = '';
}

export function isIntelligenceConsoleMounted() { return _mounted; }
