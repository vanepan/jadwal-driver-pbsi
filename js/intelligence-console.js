/* ============================================================
   INTELLIGENCE-CONSOLE.JS — Sarpras Intelligence (V2, Phase 5)

   The user-facing surface for Sarpras Intelligence. Two stages:

     1. INTAKE (chat)   input → Intelligence Service → server-owned
                        conversation → needs_input → … → requires_review
     2. NOR DRAFT & REVIEW WORKSPACE   the requires_review result is a
                        persistent, STRUCTURED, human-editable NOR draft
                        (server-owned RTDB) AND a canonical NorRecord
                        (Phase 5). The reviewer edits real fields, saves,
                        then walks the HUMAN-gated lifecycle:
                          in_review → Setujui → approved → Terbitkan → published
                        A page reload restores the SAME record at whatever
                        stage the user left it.

   BOUNDARY (Phase 5): approval and publication are EXPLICIT HUMAN actions,
   each from its own button, each lifecycle-gated. AI membuat draft; manusia
   meninjau; manusia menyetujui; Registry menetapkan nomor resmi saat
   diterbitkan. The AI never approves, never publishes, never mints a number.
   Once `approved` the draft is read-only; once `published` the official
   number is shown and nothing on this surface can change it.

   ARCHITECTURE:
     • all flow / edit / lifecycle state  → the PURE
       src/intelligence/console/intelligence-console-controller.js
     • the real service (getDraft/updateDraft + getNorRecord/syncNorRecord/
       approveNor/publishNor) is assembled by
       js/intelligence-backend-wiring.js — this file imports ONLY that
       bridge, never src/intelligence/ directly, never js/firebase.js
     • this file owns ONLY the DOM: build the shell once, build the review
       workspace once per draft-version + lifecycle-stage (so a field never
       loses focus/caret mid-edit), patch the light bits (action bar,
       status, official number, disabled) on each onChange
     • the reload pointer is a single draftId string in sessionStorage
       (a bookmark, not conversation state) — guarded, best-effort

   GATING: mounted by js/app.js#navSarprasIntelligence() ONLY when
   isV2Enabled(currentUser) AND the synced Intelligence feature flag is ON.
   Even mounted it makes ZERO service calls until the user submits — except
   a single getDraft() when a sessionStorage reload pointer is present.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { createWiredIntelligenceConsoleController, previewIntelligenceNorDraft } from './intelligence-backend-wiring.js';
// Phase 6C — the EXISTING generic document engine (js/docs/*), reused
// UNCHANGED, to render an in-app PDF preview of the draft under review
// (see docs/V2_SARPRAS_INTELLIGENCE_PHASE_6C_NOR_PREVIEW.md). Same static-
// import convention js/petty-cash/nor-document-engine.js already uses for
// its own renderer pairing — NOT src/intelligence/, so this does not touch
// the js/intelligence-backend-wiring.js import boundary
// (scripts/intelligence-foundation-check.mjs). The draft → composer view
// model + the server-authoritative freshness verdict come from the wiring
// (previewIntelligenceNorDraft); this file only drives the DOM + the engine.
import * as DocumentEngine from './docs/doc-engine.js';
import './docs/templates/composer-document.js'; // side-effect: registers 'composer-document'

const STYLE_ID = 'sic-console-style';
const RESUME_KEY = 'sic.p4.draftId';
const CSS = `
.sic-console{width:100%;max-width:760px;margin:0 auto;padding:16px;box-sizing:border-box;
  font:14px/1.55 var(--font-sans,system-ui,-apple-system,Segoe UI,Roboto,sans-serif);
  color:var(--text,#1b1b1f);overflow-x:hidden}
.sic-console *{box-sizing:border-box}
.sic-console__head{margin:0 0 4px}
.sic-console__title{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em}
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
.sic-console__btn:disabled{opacity:.55;cursor:default}
.sic-console__btn--ghost{background:transparent;color:var(--accent,#2f6fed);
  border-color:var(--accent,#2f6fed)}
.sic-console__btn--quiet{background:transparent;color:var(--text-muted,#5b5b66);
  border-color:var(--border,#d0d0d8);font-weight:500}
.sic-console__hint{margin:8px 0 0;font-size:12px;color:var(--text-muted,#6b6b76)}
.sic-console__error{margin:10px 0 0;padding:10px 12px;border-radius:10px;
  background:var(--danger-soft,#fdecec);border:1px solid var(--danger-border,#f5c2c2);
  color:var(--danger-text,#8a1f1f);overflow-wrap:anywhere}
.sic-console__reset{margin-top:14px}

/* ── NOR draft & review workspace ─────────────────────────────────────── */
.sic-ws{margin-top:18px;display:flex;flex-direction:column;gap:16px}
.sic-ws__section{border:1px solid var(--border,#e2e2e8);border-radius:14px;
  background:var(--surface,#fff);padding:16px}
.sic-ws__section--context{background:var(--surface-2,#f7f7f9)}
.sic-ws__kicker{margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--text-muted,#6b6b76)}
.sic-ws__statusrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sic-ws__pill{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;
  font-size:12px;font-weight:700;background:var(--warning-soft,#fff3d6);
  border:1px solid var(--warning-border,#f0d089);color:var(--warning-text,#7a5300)}
.sic-ws__pill::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.sic-ws__pill--approved{background:var(--accent-soft,#e7efff);border-color:var(--accent-border,#c7dbff);color:var(--accent,#2f6fed)}
.sic-ws__pill--published{background:var(--success-soft,#e4f6e9);border-color:var(--success-border,#a9dcb9);color:var(--success-text,#1f7a3d)}
.sic-ws__reason{margin:8px 0 0;font-size:12.5px;color:var(--text-muted,#5b5b66)}
.sic-ws__ladder{margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--text-muted,#6b6b76)}
.sic-ws__official{margin:12px 0 0;padding:12px 14px;border-radius:12px;
  background:var(--success-soft,#e4f6e9);border:1px solid var(--success-border,#a9dcb9)}
.sic-ws__official b{display:block;font-size:15px;color:var(--success-text,#1f7a3d);margin-bottom:2px;overflow-wrap:anywhere}
.sic-ws__official span{font-size:12px;color:var(--text-muted,#5b5b66)}
.sic-ws__warn{margin:10px 0 0;padding:9px 11px;border-radius:10px;font-size:12.5px;
  background:var(--danger-soft,#fdecec);border:1px solid var(--danger-border,#f5c2c2);
  color:var(--danger-text,#8a1f1f)}
.sic-ws__actionerr{margin:8px 0 0;font-size:12.5px;color:var(--danger-text,#8a1f1f);overflow-wrap:anywhere}
.sic-console__btn--approve{background:var(--accent,#2f6fed)}
.sic-console__btn--publish{background:var(--success-text,#1f7a3d)}
.sic-ws__contexttext{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text,#2a2a30)}
.sic-ws__grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
.sic-ws__field{display:flex;flex-direction:column;gap:4px;min-width:0}
.sic-ws__field--wide{grid-column:1 / -1}
.sic-ws__flabel{font-size:12px;font-weight:600;color:var(--text-muted,#5b5b66)}
.sic-ws__fin{width:100%;padding:9px 11px;border-radius:9px;border:1px solid var(--border,#c9c9d2);
  background:var(--surface,#fff);color:inherit;font:inherit;min-width:0}
.sic-ws__fin:focus{outline:2px solid var(--accent,#2f6fed);outline-offset:-1px;border-color:transparent}
textarea.sic-ws__fin{min-height:150px;resize:vertical;line-height:1.55}
.sic-ws__meta{margin:10px 0 0;font-size:11.5px;color:var(--text-muted,#7a7a84)}
.sic-ws__savebar{position:sticky;bottom:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:12px 14px;border:1px solid var(--border,#e2e2e8);border-radius:14px;
  background:var(--surface,#fff)}
.sic-ws__savestate{font-size:12.5px;min-width:0;overflow-wrap:anywhere}
.sic-ws__savestate--dirty{color:var(--warning-text,#7a5300)}
.sic-ws__savestate--saved{color:var(--success-text,#1f7a3d)}
.sic-ws__savestate--error{color:var(--danger-text,#8a1f1f)}
.sic-ws__spacer{flex:1 1 auto}

/* ── Phase 6C — draft PDF preview control ─────────────────────────────── */
.sic-ws__previewrow{margin:12px 0 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sic-ws__previewstate{margin:0;font-size:12px;min-width:0;overflow-wrap:anywhere;color:var(--text-muted,#6b6b76)}
.sic-ws__previewstate--ok{color:var(--success-text,#1f7a3d)}
.sic-ws__previewstate--warn{color:var(--warning-text,#7a5300)}
.sic-ws__previewstate--error{color:var(--danger-text,#8a1f1f)}

/* ── Phase 6A — generation provenance + blocked banner ────────────────── */
.sic-ws__section--gen{background:var(--surface-2,#f7f7f9)}
.sic-ws__genrow{display:flex;align-items:baseline;gap:8px;font-size:12.5px;padding:3px 0}
.sic-ws__genlabel{flex:0 0 88px;font-weight:600;color:var(--text-muted,#5b5b66)}
.sic-ws__warn--gen{margin-top:8px}
.sic-ws__gendetails{margin-top:8px;font-size:12px;color:var(--text-muted,#6b6b76)}
.sic-ws__gendetails summary{cursor:pointer;font-weight:600;color:var(--accent,#2f6fed)}
.sic-ws__genlist{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.sic-ws__genlist li{display:flex;gap:8px;overflow-wrap:anywhere}
.sic-ws__genlist li>span:first-child{flex:0 0 130px;font-weight:600}
.sic-ws__blocked{border:2px solid var(--danger-border,#f5c2c2);border-radius:14px;
  background:var(--danger-soft,#fdecec);padding:16px}
.sic-ws__blockedtitle{margin:0 0 6px;font-size:16px;font-weight:800;color:var(--danger-text,#8a1f1f)}
.sic-ws__blockedreason{margin:0 0 6px;font-size:13px;color:var(--danger-text,#8a1f1f)}
.sic-ws__blockedhint{margin:0;font-size:12.5px;color:var(--text-muted,#5b5b66)}
@media (max-width:560px){
  .sic-console{padding:12px}
  .sic-console__btn{flex:1 1 100%}
  .sic-ws__grid{grid-template-columns:1fr}
  .sic-ws__savebar .sic-console__btn{flex:1 1 100%}
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
  review: 'Tinjau dan sunting draf di bawah, simpan, lalu Setujui. Nomor resmi ditetapkan Registry saat Terbitkan.',
  error: '',
};

/** Lifecycle → status pill + copy (PART H). AI membuat draft; manusia
 *  meninjau; manusia menyetujui; Registry menetapkan nomor resmi. */
const LIFECYCLE_UI = {
  in_review: { pill: 'Menunggu review', mod: '', reason: 'Draf dibuat AI. Seorang manusia harus meninjau dan menyetujui sebelum diterbitkan.' },
  approved: { pill: 'Disetujui — menunggu penerbitan', mod: 'sic-ws__pill--approved', reason: 'Sudah disetujui manusia. Belum ada nomor resmi. Tekan "Terbitkan" untuk menetapkannya melalui Registry.' },
  published: { pill: 'Diterbitkan', mod: 'sic-ws__pill--published', reason: 'NOR sudah resmi. Versi terbit tidak dapat diubah lagi.' },
};

/* editable fields: id → { label, wide?, textarea?, source } — source says
   where the CURRENT value is read from on the normalised draft view. */
const WS_FIELDS = [
  { id: 'subject', label: 'Perihal', wide: true, src: 'fields' },
  { id: 'recipient', label: 'Kepada', src: 'fields' },
  { id: 'date', label: 'Tanggal', src: 'fields', placeholder: 'YYYY-MM-DD' },
  { id: 'item', label: 'Barang / uraian', src: 'details' },
  { id: 'quantity', label: 'Jumlah', src: 'details' },
  { id: 'unit', label: 'Satuan', src: 'details' },
  { id: 'purpose', label: 'Tujuan / keperluan', wide: true, src: 'details' },
  { id: 'budget', label: 'Perkiraan anggaran', wide: true, src: 'details' },
  { id: 'body', label: 'Isi Nota Dinas', wide: true, textarea: true, src: 'fields' },
];

let _mounted = false;
let _host = null;
let _controller = null;
let _els = null;
let _draftInput = '';        // chat input keystrokes — never pushed into controller state
let _wsSig = null;           // signature of the workspace currently built (draftId@version)

/* ── Phase 6C — draft PDF preview ───────────────────────────────────────
   `_previewDraft` / `_openDocument` are injectable (tests pass stubs); in
   production they are the wiring's server-authoritative preview builder and
   the EXISTING js/docs/ engine. `_previewBusy` guards re-entrancy;
   `_previewState` is the last preview outcome, rendered by patchWorkspace()
   and reset by buildWorkspace() (a new draft version ⇒ a new preview). */
let _previewDraft = previewIntelligenceNorDraft;
let _openDocument = (composerData, meta) => DocumentEngine.generateAndOpen(
  'composer-document', composerData, { cache: false, viewer: meta },
);
let _previewBusy = false;
let _previewState = null;     // null | { kind:'loading'|'ok'|'warn'|'error', message, visual? }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ── sessionStorage reload pointer (guarded, best-effort) ─────────────── */
function readResume() {
  try { return sessionStorage.getItem(RESUME_KEY) || ''; } catch { return ''; }
}
function writeResume(id) {
  try { if (id) sessionStorage.setItem(RESUME_KEY, String(id)); } catch { /* ignore */ }
}
function clearResume() {
  try { sessionStorage.removeItem(RESUME_KEY); } catch { /* ignore */ }
}

/** Build the shell ONCE. Regions are patched afterwards; the chat <input>
 *  node is never replaced, so focus + caret survive every state change. */
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
      <div data-region="workspace"></div>
      <button class="sic-console__btn sic-console__btn--ghost sic-console__reset" type="button" data-region="reset" hidden>
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
    workspace: q('[data-region="workspace"]'),
    reset: q('[data-region="reset"]'),
  };

  _els.input.addEventListener('input', (e) => { _draftInput = e.target.value; });
  _els.form.addEventListener('submit', (e) => { e.preventDefault(); submitCurrent(); });
  _els.reset.addEventListener('click', () => {
    _draftInput = ''; _wsSig = null; clearResume();
    _controller && _controller.reset();
  });
}

function submitCurrent() {
  if (!_controller) return;
  const st = _controller.getState();
  if (st.busy) return;
  const text = (_draftInput || '').trim();
  if (!text) { _els.input.focus(); return; }
  if (st.conversationId && st.phase !== 'idle') { _controller.answer(text); return; }
  // a fresh request supersedes any earlier resumable draft
  clearResume();
  _controller.submit(text);
}

function renderStack(messages) {
  _els.stack.innerHTML = messages.map((m) => {
    const who = m.role === 'user' ? 'user' : 'intelligence';
    const label = m.role === 'user' ? 'Anda' : 'Intelligence';
    return `<div class="sic-console__msg sic-console__msg--${who}">
      <span class="sic-console__role">${label}</span>${esc(m.text)}</div>`;
  }).join('');
}

/* ── review workspace ────────────────────────────────────────────────── */

function wsSignature(state) {
  const d = state.draft || {};
  // rebuild on a lifecycle-stage change too — the fields switch to read-only
  // and the action bar changes shape between (no canonical record) /
  // in_review / approved / published.
  return `${state.draftId || 'none'}@${d.version || 0}#${state.norId ? (state.norLifecycle || 'in_review') : 'noreg'}`;
}

/** Read the CURRENT (last-saved) value of an editable field off the
 *  normalised draft view — staged edits live in the DOM, not here. */
function draftFieldValue(state, field, src) {
  const d = state.draft && state.draft.fields ? state.draft.fields : {};
  if (src === 'details') {
    const det = d.details && typeof d.details === 'object' ? d.details : {};
    return det[field] == null ? '' : String(det[field]);
  }
  return d[field] == null ? '' : String(d[field]);
}

/* ── Phase 6A — generation provenance (§20-23) ─────────────────────────
   The console never calculates certification / authority / fallback /
   conflict itself (§24) — it only RENDERS whatever the server-authoritative
   `generationContext` already says (carried on `draft.fields.metadata`,
   Phase 6 §12 / Phase 6A §20). Absent entirely ⇒ legacy mode ⇒ nothing new
   is shown, byte-identical to the pre-Phase-6A workspace. */

const CERTIFICATION_LABEL = {
  certified: 'Bersertifikat',
  incomplete: 'Tidak lengkap',
  conflict: 'Konflik',
  unavailable: 'Tidak tersedia',
};

function styleSourceLabel(gc) {
  const n = (gc.style && gc.style.certifiedRuleIds && gc.style.certifiedRuleIds.length) || 0;
  if (n > 0) return `PBSI Style Guide &middot; ${n} aturan bersertifikat`;
  if (gc.status === 'generated_with_fallback') return 'Fallback deterministik';
  return 'Konvensi baku (tidak ada aturan disetujui yang berlaku)';
}
function visualSourceLabel(gc) {
  const v = gc.visual || {};
  if (v.source === 'approved_template') {
    return `PBSI Visual Template${v.templateVersion ? ` v${esc(String(v.templateVersion))}` : ''}`;
  }
  return 'Fallback deterministik';
}

/** The compact "Pembuatan Draf" section for an ALLOWED / ALLOWED_WITH_FALLBACK
 *  generation. Never shown for a blocked generation (§22 — a blocked
 *  generation gets the banner instead, never this "looks normal" panel). */
function buildGenerationSectionHtml(gc) {
  const fallbackWarn = (gc.fallbacks || []).length
    ? `<div class="sic-ws__warn sic-ws__warn--gen">Sebagian panduan organisasi bersertifikat tidak lengkap; fallback deterministik digunakan untuk: ${
      esc(gc.fallbacks.map((x) => x.slot || x.area).join(', '))}.</div>`
    : '';
  const conflictIds = [
    ...(gc.conflicts && gc.conflicts.styleGuide ? gc.conflicts.styleGuide.flatMap((c) => c.competingRuleIds) : []),
    ...(gc.conflicts && gc.conflicts.visualTemplate ? gc.conflicts.visualTemplate.flatMap((c) => c.competingTemplateIds) : []),
  ];
  const detailRows = [
    ['Retrieval', CERTIFICATION_LABEL[gc.retrieval && gc.retrieval.certification] || '—'],
    ['Tipe dokumen', (gc.retrieval && gc.retrieval.documentType) || '—'],
    ['Diambil pada', (gc.retrieval && gc.retrieval.retrievedAt) || '—'],
    ['ID aturan gaya', (gc.style && gc.style.certifiedRuleIds && gc.style.certifiedRuleIds.length) ? gc.style.certifiedRuleIds.join(', ') : '—'],
    ['ID templat visual', (gc.visual && gc.visual.templateId) || '—'],
    ['Referensi konflik', conflictIds.length ? conflictIds.join(', ') : '—'],
  ].map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('');

  return `
    <section class="sic-ws__section sic-ws__section--gen">
      <p class="sic-ws__kicker">Pembuatan Draf</p>
      <div class="sic-ws__genrow"><span class="sic-ws__genlabel">Mode</span><span>Intelligence</span></div>
      <div class="sic-ws__genrow"><span class="sic-ws__genlabel">Retrieval</span><span>${esc(CERTIFICATION_LABEL[gc.retrieval && gc.retrieval.certification] || '—')}</span></div>
      <div class="sic-ws__genrow"><span class="sic-ws__genlabel">Gaya</span><span>${styleSourceLabel(gc)}</span></div>
      <div class="sic-ws__genrow"><span class="sic-ws__genlabel">Tata letak</span><span>${visualSourceLabel(gc)}</span></div>
      ${fallbackWarn}
      <details class="sic-ws__gendetails">
        <summary>Rincian teknis</summary>
        <ul class="sic-ws__genlist">${detailRows}</ul>
      </details>
    </section>`;
}

/** The UNMISSABLE blocked banner (§22) — replaces the normal "Pembuatan
 *  Draf" panel. The editable fields below still render (a human may still
 *  complete the draft manually), but the top of the workspace must never
 *  look like an ordinary success. */
function buildBlockedBannerHtml(gc) {
  const label = {
    blocked_conflict: 'organisasi yang disetujui saat ini SALING BERTENTANGAN',
    blocked_unavailable: 'konteks organisasi bersertifikat TIDAK DAPAT DIAKSES',
    blocked_incomplete: 'templat visual resmi yang disetujui BELUM TERSEDIA',
  }[gc.status] || 'konteks organisasi bersertifikat tidak dapat digunakan';
  return `
    <section class="sic-ws__blocked" data-ws-blocked>
      <p class="sic-ws__blockedtitle">⚠ Pembuatan Draf Diblokir</p>
      <p class="sic-ws__blockedreason">Pembuatan draf terblokir karena ${esc(label)}. Tidak ada aturan atau templat yang dipilih secara otomatis.</p>
      <p class="sic-ws__blockedhint">Draf di bawah menggunakan tata bahasa &amp; tata letak baku (bukan aturan organisasi bersertifikat). Tinjau dengan saksama sebelum melanjutkan.</p>
    </section>`;
}

/** Build the workspace DOM ONCE for the current draft signature. Field
 *  inputs get their listeners here and are NOT rebuilt on later paints, so
 *  typing is never interrupted. */
function buildWorkspace(state) {
  const d = state.draft || {};
  const f = d.fields || {};
  const firstUser = (state.messages || []).find((m) => m.role === 'user');
  const bodySrc = f.metadata && f.metadata.bodySource;
  const gc = f.metadata && f.metadata.generationContext;
  const genHtml = gc ? (gc.blocked ? buildBlockedBannerHtml(gc) : buildGenerationSectionHtml(gc)) : '';

  const lc = state.norLifecycle || 'in_review';
  const ui = LIFECYCLE_UI[lc] || LIFECYCLE_UI.in_review;
  const editable = lc === 'in_review';

  const fieldHtml = WS_FIELDS.map((spec) => {
    const val = draftFieldValue(state, spec.id, spec.src);
    const ro = editable ? '' : (spec.textarea ? ' readonly' : ' disabled');
    const control = spec.textarea
      ? `<textarea class="sic-ws__fin" data-wsfield="${spec.id}" rows="7"${ro}>${esc(val)}</textarea>`
      : `<input class="sic-ws__fin" type="text" data-wsfield="${spec.id}"${ro}
           ${spec.placeholder ? `placeholder="${esc(spec.placeholder)}"` : ''} value="${esc(val)}" />`;
    return `<div class="sic-ws__field${spec.wide ? ' sic-ws__field--wide' : ''}">
      <label class="sic-ws__flabel" for="wsf_${spec.id}">${esc(spec.label)}</label>
      ${control.replace('data-wsfield', `id="wsf_${spec.id}" data-wsfield`)}
    </div>`;
  }).join('');

  const numberLine = lc === 'published'
    ? `Nomor resmi: ${esc(state.norNumber || '—')}`
    : 'Nomor resmi: belum ditetapkan (menunggu penerbitan)';

  let actionBar;
  if (lc === 'approved') {
    actionBar = `
      <span class="sic-ws__savestate">Draf terkunci untuk penyuntingan. Menunggu penerbitan.</span>
      <span class="sic-ws__spacer"></span>
      <button class="sic-console__btn sic-console__btn--publish" type="button" data-ws-publish>Terbitkan</button>`;
  } else if (lc === 'published') {
    actionBar = `
      <span class="sic-ws__savestate sic-ws__savestate--saved">NOR sudah diterbitkan.</span>
      <span class="sic-ws__spacer"></span>`;
  } else {
    // `Setujui` needs the canonical NorRecord (state.norId). If registration
    // failed at requires_review the reviewer still gets the Phase 4 save-only
    // bar plus the persist warning, and can restart.
    const approveBtn = state.norId
      ? '\n      <button class="sic-console__btn sic-console__btn--approve" type="button" data-ws-approve>Setujui</button>'
      : '';
    actionBar = `
      <span class="sic-ws__savestate" data-ws-savestate></span>
      <span class="sic-ws__spacer"></span>
      <button class="sic-console__btn sic-console__btn--quiet" type="button" data-ws-discard>Batalkan perubahan</button>
      <button class="sic-console__btn" type="button" data-ws-save>Simpan Draf</button>${approveBtn}`;
  }

  _els.workspace.innerHTML = `
    <div class="sic-ws" data-ws>
      ${gc && gc.blocked ? genHtml : ''}

      <section class="sic-ws__section sic-ws__section--context">
        <p class="sic-ws__kicker">Konteks percakapan</p>
        <p class="sic-ws__contexttext">${esc(firstUser ? firstUser.text : '(permintaan tidak tersedia)')}</p>
      </section>

      <section class="sic-ws__section">
        <p class="sic-ws__kicker">Status NOR</p>
        <div class="sic-ws__statusrow">
          <span class="sic-ws__pill ${ui.mod}">${esc(ui.pill)}</span>
          <span class="sic-ws__meta" data-ws-ver></span>
        </div>
        <p class="sic-ws__reason">${esc(lc === 'in_review' && state.review && state.review.reason ? state.review.reason : ui.reason)}</p>
        <p class="sic-ws__ladder">AI membuat draft &middot; Manusia meninjau &middot; Manusia menyetujui &middot; Registry menetapkan nomor resmi saat diterbitkan.</p>
        <div class="sic-ws__official" data-ws-official hidden></div>
        <div class="sic-ws__warn" data-ws-persistwarn hidden></div>
      </section>

      ${gc && !gc.blocked ? genHtml : ''}

      <section class="sic-ws__section">
        <p class="sic-ws__kicker">${editable ? 'Draf Nota Dinas — dapat disunting' : 'Draf Nota Dinas — hanya baca'}</p>
        <div class="sic-ws__grid">${fieldHtml}</div>
        <p class="sic-ws__meta">Jenis: ${esc(f.norType || '—')}${
          bodySrc ? ` &middot; Sumber isi: ${esc(bodySrc)}` : ''} &middot; ${numberLine}</p>
        <div class="sic-ws__previewrow">
          <button class="sic-console__btn sic-console__btn--ghost" type="button" data-ws-preview>Pratinjau PDF</button>
          <p class="sic-ws__previewstate" data-ws-previewstate hidden></p>
        </div>
      </section>

      <div class="sic-ws__savebar">${actionBar}
        <p class="sic-ws__actionerr" data-ws-actionerr hidden></p>
      </div>
    </div>`;

  // wire the editable fields — each keystroke stages a local edit in the
  // controller (no network); the value stays in the DOM node so focus/caret
  // are never disturbed by a re-render. Read-only stages carry no listener.
  if (editable) {
    _els.workspace.querySelectorAll('[data-wsfield]').forEach((node) => {
      node.addEventListener('input', (e) => {
        if (_controller) _controller.editField(node.getAttribute('data-wsfield'), e.target.value);
      });
    });
  }
  const saveBtn = _els.workspace.querySelector('[data-ws-save]');
  const discardBtn = _els.workspace.querySelector('[data-ws-discard]');
  const approveBtn = _els.workspace.querySelector('[data-ws-approve]');
  const publishBtn = _els.workspace.querySelector('[data-ws-publish]');
  if (saveBtn) saveBtn.addEventListener('click', () => { if (_controller) _controller.saveDraft(); });
  if (discardBtn) discardBtn.addEventListener('click', () => {
    if (!_controller) return;
    _wsSig = null; // force a rebuild so the field inputs revert to the last-saved values
    _controller.discardEdits();
  });
  if (approveBtn) approveBtn.addEventListener('click', () => { if (_controller) _controller.approve(); });
  if (publishBtn) publishBtn.addEventListener('click', () => { if (_controller) _controller.publish(); });

  // Phase 6C — a fresh workspace build means a fresh (saved) draft version:
  // any earlier preview outcome no longer describes what is on screen.
  _previewState = null;
  const previewBtn = _els.workspace.querySelector('[data-ws-preview]');
  if (previewBtn) previewBtn.addEventListener('click', () => { runPreview(); });

  _wsSig = wsSignature(state);
}

/* ── Phase 6C — draft PDF preview ─────────────────────────────────────── */

/** The server's freshness verdict → the one-line disclosure the reviewer
 *  sees (§11, §31 — "Template applied" vs "Deterministic fallback", never a
 *  silent obsolete template). */
function previewVisualLine(v) {
  const tv = v && v.templateVersion ? ` v${v.templateVersion}` : '';
  switch (v && v.status) {
    case 'applied':
      return { kind: 'ok', message: `Tata letak: PBSI Visual Template${tv} — diterapkan.` };
    case 'stale':
      return { kind: 'warn', message: `Konteks tata letak draf ini sudah usang (templat visual berubah sejak draf dibuat). Pratinjau memakai tata letak baku — buat ulang draf untuk memakai templat terkini.` };
    case 'invalid':
      return { kind: 'warn', message: 'Konteks tata letak draf ini tidak dapat diverifikasi. Pratinjau memakai tata letak baku.' };
    default:
      return { kind: 'ok', message: 'Tata letak: baku (tidak ada templat visual disetujui untuk draf ini).' };
  }
}

/** Render a PDF preview of the LAST-SAVED draft. Disabled while there are
 *  unsaved edits (§17) — never silently mixes saved + unsaved state. Never
 *  transitions a lifecycle, never numbers, never publishes (§29). An error
 *  is shown explicitly and never silently swallowed or retried (§18). */
async function runPreview() {
  if (!_controller || _previewBusy) return;
  const st = _controller.getState();
  if (!st.draftId || st.draftDirty || st.busy) return;
  _previewBusy = true;
  _previewState = { kind: 'loading', message: 'Menyiapkan pratinjau…' };
  patchWorkspace(_controller.getState());
  try {
    const res = await _previewDraft(st.draftId);
    if (!res || !res.ok || !res.data) {
      const msg = (res && res.error && res.error.message) || 'Pratinjau draf gagal dibuat.';
      _previewState = { kind: 'error', message: msg };
      return;
    }
    const line = previewVisualLine(res.data.previewVisual);
    await _openDocument(res.data.composerData, {
      title: `Pratinjau NOR — draf ${st.draftId}`,
      shareText: `Pratinjau draf NOR ${st.draftId}`,
    });
    _previewState = { kind: line.kind, message: line.message, visual: res.data.previewVisual };
  } catch (err) {
    _previewState = { kind: 'error', message: (err && err.message) || 'Pratinjau draf gagal dirender.' };
  } finally {
    _previewBusy = false;
    if (_controller) patchWorkspace(_controller.getState());
  }
}

/** Patch only the light bits of an already-built workspace (never the field
 *  values — the reviewer owns those while editing). */
function patchWorkspace(state) {
  const ws = _els.workspace.querySelector('[data-ws]');
  if (!ws) return;
  const d = state.draft || {};

  const ver = ws.querySelector('[data-ws-ver]');
  if (ver) {
    ver.textContent = `Versi ${d.version || 1}${d.humanEdited ? ' · sudah disunting manusia' : ''}`;
  }

  const warn = ws.querySelector('[data-ws-persistwarn]');
  if (warn) {
    const msg = state.draftPersistError
      ? `Draf belum tersimpan otomatis: ${state.draftPersistError}`
      : (state.registryPersistError ? `Catatan Registry belum dibuat: ${state.registryPersistError}` : '');
    if (msg) { warn.hidden = false; warn.textContent = msg; } else { warn.hidden = true; warn.textContent = ''; }
  }

  const official = ws.querySelector('[data-ws-official]');
  if (official) {
    if (state.norLifecycle === 'published' && state.norNumber) {
      official.hidden = false;
      official.innerHTML = `<b>Nomor resmi: ${esc(state.norNumber)}</b>`
        + `<span>Ditetapkan oleh Registry saat penerbitan${state.norPublishedVersion ? ` &middot; versi terbit ${state.norPublishedVersion}` : ''}.</span>`;
    } else { official.hidden = true; official.innerHTML = ''; }
  }

  const ss = ws.querySelector('[data-ws-savestate]');
  if (ss) {
    ss.className = 'sic-ws__savestate';
    if (state.saveState === 'saving') { ss.textContent = 'Menyimpan…'; }
    else if (state.saveState === 'saved') { ss.textContent = 'Perubahan tersimpan.'; ss.classList.add('sic-ws__savestate--saved'); }
    else if (state.saveState === 'error') { ss.textContent = state.saveError || 'Perubahan gagal disimpan.'; ss.classList.add('sic-ws__savestate--error'); }
    else if (state.draftDirty) { ss.textContent = 'Ada perubahan yang belum disimpan.'; ss.classList.add('sic-ws__savestate--dirty'); }
    else { ss.textContent = 'Belum ada perubahan.'; }
  }

  const saveBtn = ws.querySelector('[data-ws-save]');
  const discardBtn = ws.querySelector('[data-ws-discard]');
  const approveBtn = ws.querySelector('[data-ws-approve]');
  const publishBtn = ws.querySelector('[data-ws-publish]');
  if (saveBtn) { saveBtn.disabled = state.busy || !state.draftDirty; saveBtn.textContent = state.saveState === 'saving' ? 'Menyimpan…' : 'Simpan Draf'; }
  if (discardBtn) discardBtn.disabled = state.busy || !state.draftDirty;
  if (approveBtn) {
    approveBtn.disabled = state.busy || state.draftDirty || state.approveState === 'busy';
    approveBtn.textContent = state.approveState === 'busy' ? 'Menyetujui…' : 'Setujui';
  }
  if (publishBtn) {
    publishBtn.disabled = state.busy || state.publishState === 'busy';
    publishBtn.textContent = state.publishState === 'busy' ? 'Menerbitkan…' : 'Terbitkan';
  }

  const ae = ws.querySelector('[data-ws-actionerr]');
  if (ae) {
    const msg = (state.approveState === 'error' && state.approveError)
      || (state.publishState === 'error' && state.publishError)
      || (state.registrySyncError ? `Catatan: ${state.registrySyncError}` : '');
    if (msg) { ae.hidden = false; ae.textContent = msg; } else { ae.hidden = true; ae.textContent = ''; }
  }

  // Phase 6C — preview button + outcome line.
  const previewBtn = ws.querySelector('[data-ws-preview]');
  if (previewBtn) {
    const blockedByDirty = state.draftDirty === true;
    previewBtn.disabled = _previewBusy || state.busy === true || blockedByDirty;
    previewBtn.textContent = _previewBusy ? 'Menyiapkan…' : 'Pratinjau PDF';
    previewBtn.title = blockedByDirty ? 'Simpan draf untuk pratinjau versi terbaru.' : '';
  }
  const ps = ws.querySelector('[data-ws-previewstate]');
  if (ps) {
    // An earlier preview outcome no longer describes the draft once there
    // are unsaved edits — drop it so nothing stale is shown (§17, §19).
    if (state.draftDirty === true && _previewState && _previewState.kind !== 'loading') _previewState = null;
    ps.className = 'sic-ws__previewstate';
    if (state.draftDirty === true && !_previewState) {
      ps.hidden = false;
      ps.textContent = 'Simpan draf untuk pratinjau versi terbaru.';
      ps.classList.add('sic-ws__previewstate--warn');
    } else if (!_previewState) {
      ps.hidden = true;
      ps.textContent = '';
    } else {
      ps.hidden = false;
      ps.textContent = _previewState.message;
      if (_previewState.kind === 'ok') ps.classList.add('sic-ws__previewstate--ok');
      else if (_previewState.kind === 'warn') ps.classList.add('sic-ws__previewstate--warn');
      else if (_previewState.kind === 'error') ps.classList.add('sic-ws__previewstate--error');
    }
  }
}

function renderWorkspace(state) {
  if (state.phase !== 'review' || !state.draft || !state.draft.fields) {
    if (_wsSig !== null) { _els.workspace.innerHTML = ''; _wsSig = null; }
    return;
  }
  if (_wsSig !== wsSignature(state)) buildWorkspace(state);
  patchWorkspace(state);
}

/** Patch every region from a controller state snapshot. */
function paint(state) {
  if (!_els) return;
  renderStack(state.messages);
  renderWorkspace(state);

  const inReview = state.phase === 'review';
  const busy = state.busy === true;

  // the chat form belongs to intake — hide it once the workspace is showing
  _els.form.hidden = inReview;
  _els.label.hidden = inReview;

  _els.input.disabled = busy;
  _els.btn.disabled = busy;
  _els.btn.textContent = busy ? 'Memproses…' : 'Kirim';

  const q0 = state.questions && state.questions[0];
  const labelText = q0 ? (q0.why || q0.prompt) : 'Tulis permintaan';
  _els.label.textContent = labelText;
  _els.input.setAttribute('aria-label', labelText);
  _els.input.placeholder = q0 ? 'Tulis jawaban…' : 'Tulis permintaan…';

  if (state.phase === 'error') {
    if (state.pendingInput && !_draftInput) { _draftInput = state.pendingInput; _els.input.value = _draftInput; }
  } else if (!busy && !inReview) {
    _draftInput = '';
    _els.input.value = '';
  }

  _els.hint.textContent = PHASE_HINT[state.phase] || '';
  if (state.error) { _els.error.hidden = false; _els.error.textContent = state.error; }
  else { _els.error.hidden = true; _els.error.textContent = ''; }

  _els.reset.hidden = !(inReview || state.phase === 'error');

  // reload pointer — remember a persisted draft while it is on screen. It is
  // cleared explicitly on reset / on a fresh request / on a stale resume,
  // NOT here (paint runs once with phase 'idle' at mount, before the
  // resume-pointer is read).
  if (inReview && state.draftId) writeResume(state.draftId);

  // keyboard focus: only pull focus to the chat input while it is the
  // primary control (never in the review workspace — the reviewer is typing
  // in the field inputs there).
  if (!busy && !inReview && typeof _els.input.focus === 'function') {
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
  _wsSig = null;
  _previewBusy = false;
  _previewState = null;
  // Phase 6C — tests inject stubs; production uses the wiring's server-
  // authoritative preview builder + the EXISTING js/docs/ engine.
  _previewDraft = (opts && typeof opts.previewDraft === 'function') ? opts.previewDraft : previewIntelligenceNorDraft;
  _openDocument = (opts && typeof opts.openDocument === 'function')
    ? opts.openDocument
    : (composerData, meta) => DocumentEngine.generateAndOpen('composer-document', composerData, { cache: false, viewer: meta });
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

  // reload restore — a single stored draftId means "resume this review".
  // Read it BEFORE the first paint (paint never clears it, but be explicit).
  const resumeId = readResume();
  paint(_controller.getState());
  if (resumeId && typeof _controller.resumeDraft === 'function') {
    try { await _controller.resumeDraft(resumeId); } catch { /* ignore */ }
    if (_controller.getState().phase !== 'review') clearResume(); // stale pointer
  }
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
  _wsSig = null;
  _previewBusy = false;
  _previewState = null;
}

export function isIntelligenceConsoleMounted() { return _mounted; }
