/* ============================================================
   INTELLIGENCE-CORPUS-CONSOLE.JS — Corpus & Authority Workspace
   (V2, Phase C3)

   The operator surface for BUILDING historical organizational writing
   evidence and DRAFTING authority proposals from it:

     Source → Ingest → Analyse → Observations → Writing Memory
            → Style Guide / Visual Template PROPOSALS

   It is NOT an automatic ingestion engine, NOT a generator, NOT RAG.
   Every step is an explicit operator click. Nothing is auto-approved:
   proposals land as PROPOSED / non-authoritative — approval happens in
   the Human Curation workspace (js/intelligence-curation-console.js).

   ARCHITECTURE (mirrors js/intelligence-console.js / -curation-console.js):
     • ALL workspace state → the PURE
       src/intelligence/console/corpus-workspace-controller.js
     • the real corpus + proposal callables are assembled by
       js/intelligence-backend-wiring.js#createWiredIntelligenceCorpusPort —
       this file imports ONLY that bridge, never src/intelligence/ stores
       directly, never js/firebase.js
     • this file owns ONLY the DOM: build the shell once, re-render the
       active tab per paint; the file picker hashes bytes with
       crypto.subtle (SHA-256) — the controller never hashes

   GATING: mounted only for the V2 pilot with the synced Intelligence
   feature flag ON (see js/app.js#navSarprasIntelligence). The server
   callable independently enforces effective-admin authorization
   (role === 'admin' || adminEquivalent === true) from the verified
   Firebase context — the client is NOT the security boundary. No OpenAI.
   ============================================================ */

'use strict';

import { getCurrentUser } from './auth.js';
import { createWiredIntelligenceCorpusController } from './intelligence-backend-wiring.js';

const STYLE_ID = 'sic-corpus-style';
const MAX_SOURCE_BYTES = 512 * 1024; // fixture-scale only — the payload rides in the callable request

const TABS = [
  { id: 'source', label: 'Source' },
  { id: 'observations', label: 'Observations' },
  { id: 'memory', label: 'Writing Memory' },
  { id: 'proposals', label: 'Proposals' },
];

let _host = null;
let _controller = null;
let _els = null;
let _mounted = false;
let _tab = 'source';

const CSS = `
.sic-corpus{display:flex;flex-direction:column;gap:16px;max-width:920px;margin:0 auto;padding:4px}
.sic-corpus h2{font-size:1.05rem;margin:0}
.sic-corpus .sc-sub{color:var(--text-muted,#6b6b76);font-size:.85rem;margin:2px 0 0}
.sic-corpus .sc-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border,#e3e3e8)}
.sic-corpus .sc-tab{appearance:none;border:0;background:none;padding:8px 12px;font:inherit;color:var(--text-muted,#6b6b76);border-bottom:2px solid transparent;cursor:pointer}
.sic-corpus .sc-tab[aria-selected="true"]{color:var(--text,#1c1c22);border-bottom-color:var(--accent,#3a6df0)}
.sic-corpus .sc-card{border:1px solid var(--border,#e3e3e8);border-radius:12px;padding:14px;background:var(--surface,#fff);display:flex;flex-direction:column;gap:10px}
.sic-corpus .sc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sic-corpus .sc-btn{appearance:none;border:1px solid var(--accent,#3a6df0);background:var(--accent,#3a6df0);color:#fff;border-radius:8px;padding:7px 14px;font:inherit;cursor:pointer}
.sic-corpus .sc-btn--ghost{background:none;color:var(--accent,#3a6df0)}
.sic-corpus .sc-btn:disabled{opacity:.5;cursor:not-allowed}
.sic-corpus .sc-chip{display:inline-block;border:1px solid var(--border,#e3e3e8);border-radius:999px;padding:1px 9px;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}
.sic-corpus .sc-chip--observed{background:var(--surface-2,#f0f0f4);color:var(--text-muted,#6b6b76)}
.sic-corpus .sc-chip--candidate{background:var(--warning-soft,#fff3d6);border-color:var(--warning-border,#f0d089);color:var(--warning-text,#7a5300)}
.sic-corpus .sc-chip--proposed{background:var(--warning-soft,#fff3d6);border-color:var(--warning-border,#f0d089);color:var(--warning-text,#7a5300)}
.sic-corpus .sc-chip--authoritative{background:var(--success-soft,#e4f6e9);border-color:var(--success-border,#a9dcb9);color:var(--success-text,#1f7a3d)}
.sic-corpus .sc-kv{display:grid;grid-template-columns:150px 1fr;gap:4px 12px;font-size:.85rem}
.sic-corpus .sc-kv dt{color:var(--text-muted,#6b6b76)}
.sic-corpus .sc-kv dd{margin:0}
.sic-corpus .sc-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.sic-corpus .sc-li{border:1px solid var(--border,#e3e3e8);border-radius:8px;padding:9px 11px;font-size:.85rem}
.sic-corpus .sc-note{font-size:.82rem;color:var(--text-muted,#6b6b76)}
.sic-corpus .sc-err{color:var(--danger-text,#b3261e);font-size:.85rem}
.sic-corpus .sc-ok{color:var(--success-text,#1f7a3d);font-size:.85rem}
.sic-corpus input[type="text"],.sic-corpus select{font:inherit;padding:6px 8px;border:1px solid var(--border,#e3e3e8);border-radius:8px;min-width:220px;max-width:100%}
@media (max-width:640px){.sic-corpus .sc-kv{grid-template-columns:1fr}.sic-corpus{padding:2px}}
`;

function injectStyleOnce() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function detectFormat(name, type) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.pdf') || /pdf/.test(type || '')) return 'pdf';
  if (n.endsWith('.docx') || /wordprocessingml/.test(type || '')) return 'docx';
  return 'unknown';
}

function buildShell(hostEl) {
  hostEl.innerHTML = `
    <div class="sic-corpus" data-corpus-root>
      <header>
        <h2>Corpus &amp; Authority Workspace</h2>
        <p class="sc-sub">Build historical writing evidence, then draft authority <strong>proposals</strong>.
        Approval is a separate human step in <strong>Curation</strong>. Nothing here is auto-approved.</p>
      </header>
      <nav class="sc-tabs" role="tablist" data-tabs>
        ${TABS.map((t) => `<button class="sc-tab" type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === _tab}">${esc(t.label)}</button>`).join('')}
      </nav>
      <section data-content aria-live="polite"></section>
    </div>`;
  _els = {
    root: hostEl.querySelector('[data-corpus-root]'),
    tabs: hostEl.querySelector('[data-tabs]'),
    content: hostEl.querySelector('[data-content]'),
  };
  _els.tabs.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (!b) return;
    _tab = b.getAttribute('data-tab');
    for (const t of _els.tabs.querySelectorAll('[data-tab]')) t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === _tab));
    paint(_controller.getState());
  });
  _els.content.addEventListener('click', onContentClick);
  _els.content.addEventListener('change', onContentChange);
}

function statusLine(s) {
  const bits = [];
  if (s.busy) bits.push('<span class="sc-note">Bekerja…</span>');
  if (s.error) bits.push(`<span class="sc-err">${esc(s.error)}</span>`);
  if (s.notice && !s.error) bits.push(`<span class="sc-ok">${esc(s.notice)}</span>`);
  return bits.length ? `<div class="sc-row">${bits.join('')}</div>` : '';
}

function renderSource(s) {
  const src = s.source;
  const doc = s.document;
  const dis = s.busy ? 'disabled' : '';
  return `
    <div class="sc-card">
      <div class="sc-row">
        <input type="file" accept=".pdf,.docx" data-file ${dis}/>
        <button class="sc-btn sc-btn--ghost" type="button" data-act="reset" ${dis}>Reset</button>
      </div>
      ${src ? `<dl class="sc-kv">
        <dt>File</dt><dd>${esc(src.name)} <span class="sc-note">(${src.size} B, ${esc(src.format)})</span></dd>
        <dt>Checksum</dt><dd><code>${esc(src.checksum.slice(0, 16))}…</code></dd>
      </dl>` : '<p class="sc-note">Pilih satu dokumen sintetis kecil (PDF/DOCX ≤ 512 KB). Bukan dokumen resmi PBSI.</p>'}
      <div class="sc-row">
        <button class="sc-btn" type="button" data-act="ingest" ${src && !doc && !s.busy ? '' : 'disabled'}>Ingest</button>
        <button class="sc-btn" type="button" data-act="analyze" ${doc && !s.busy ? '' : 'disabled'}>Analyse</button>
      </div>
      ${doc ? `<dl class="sc-kv">
        <dt>Document ID</dt><dd><code>${esc(doc.documentId)}</code> <span class="sc-note">(server-owned)</span></dd>
        <dt>Owner</dt><dd><code>${esc(doc.ownerId)}</code> <span class="sc-note">(= your verified uid)</span></dd>
        <dt>Ingestion</dt><dd>${esc(doc.ingestionStatus)}</dd>
        <dt>Analysis</dt><dd>${esc(doc.analysisStatus)}</dd>
        <dt>Type</dt><dd>${esc(doc.documentType || '—')} · Era ${esc(doc.documentEra || '—')}</dd>
      </dl>` : ''}
      ${s.analysis ? `<dl class="sc-kv">
        <dt>Observations</dt><dd>${s.analysis.observationsRecorded || 0} recorded · ${s.analysis.observationsMerged || 0} merged — all <span class="sc-chip sc-chip--observed">observed</span></dd>
        <dt>Pipeline</dt><dd>${esc((s.analysis.stages || []).map((x) => `${x.stage}:${x.outcome}`).join(' · ') || '—')}</dd>
        <dt>Status path</dt><dd>${esc((s.analysis.statusPath || []).join(' → ') || '—')}</dd>
      </dl>` : ''}
      ${statusLine(s)}
    </div>`;
}

function renderObservations(s) {
  if (!s.document) return `<div class="sc-card"><p class="sc-note">Ingest &amp; analyse a source first.</p></div>`;
  return `
    <div class="sc-card">
      <div class="sc-row"><button class="sc-btn" type="button" data-act="observations" ${s.busy ? 'disabled' : ''}>Load observations</button></div>
      ${statusLine(s)}
      <ul class="sc-list">
        ${s.observations.length ? s.observations.map((o) => `<li class="sc-li">
          <span class="sc-chip sc-chip--${esc(o.lifecycleState || 'observed')}">${esc(o.lifecycleState || 'observed')}</span>
          <strong>${esc(o.category)}</strong> / ${esc(o.key)} — ${esc(o.observedValue == null ? '—' : o.observedValue)}
          <div class="sc-note">confidence ${esc(o.confidence)} · seen ${esc(o.occurrenceCount)}× · provenance: ${esc((o.provenance || []).map((p) => p.extractionMethod).join(', ') || '—')}</div>
        </li>`).join('') : '<li class="sc-note">No observations loaded yet.</li>'}
      </ul>
    </div>`;
}

function renderMemory(s) {
  const wm = s.writingMemory;
  return `
    <div class="sc-card">
      <div class="sc-row"><button class="sc-btn" type="button" data-act="memory" ${s.busy ? 'disabled' : ''}>Build Writing Memory</button></div>
      <p class="sc-note">Derived from your corpus observations. Entries are <span class="sc-chip sc-chip--observed">observed</span> or
        <span class="sc-chip sc-chip--candidate">candidate</span> — <strong>never</strong> authoritative here.</p>
      ${statusLine(s)}
      <ul class="sc-list">
        ${wm && wm.entries && wm.entries.length ? wm.entries.map((e) => `<li class="sc-li">
          <span class="sc-chip sc-chip--${esc(e.authorityState)}">${esc(e.authorityState)}</span>
          <code>${esc(e.memoryId)}</code> — <strong>${esc(e.category)}</strong> / ${esc(e.key)} = ${esc(e.value)}
          <div class="sc-note">${esc(e.documentType || '—')} · docs ${esc(e.evidence && e.evidence.documentCount)} · occ ${esc(e.evidence && e.evidence.occurrenceCount)} · ${esc(e.conventionEra || e.temporalStatus || '—')}</div>
        </li>`).join('') : '<li class="sc-note">No Writing Memory built yet.</li>'}
      </ul>
    </div>`;
}

function renderProposalRecord(rec, kind) {
  if (!rec) return '';
  const st = rec.status || 'proposed';
  const auth = rec.authorityState || (st === 'approved' ? 'authoritative' : 'not_authoritative');
  return `<dl class="sc-kv">
    <dt>${kind} id</dt><dd><code>${esc(rec.ruleId || rec.templateId || '—')}</code></dd>
    <dt>Status</dt><dd><span class="sc-chip sc-chip--proposed">${esc(st)}</span></dd>
    <dt>Authority</dt><dd>${esc(auth)} <span class="sc-note">(server-derived)</span></dd>
    <dt>Version</dt><dd>${esc(rec.version == null ? rec.templateVersion : rec.version)} <span class="sc-note">(server-owned)</span></dd>
    <dt>Evidence</dt><dd>${esc((rec.sourceObservationIds || rec.evidence && rec.evidence.sourceObservationIds || []).length || 0)} observation refs</dd>
  </dl>`;
}

function renderProposals(s) {
  const entries = (s.writingMemory && s.writingMemory.entries) || [];
  return `
    <div class="sc-card">
      <h2 style="font-size:.95rem">Style Guide proposal</h2>
      <p class="sc-note">From a Writing Memory entry. Creates a <strong>PROPOSED</strong> rule. Approve it in the <strong>Curation</strong> workspace — there is no approve button here.</p>
      <div class="sc-row">
        <select data-memory-id ${s.busy || !entries.length ? 'disabled' : ''}>
          <option value="">${entries.length ? 'Choose a Writing Memory entry…' : 'Build Writing Memory first'}</option>
          ${entries.map((e) => `<option value="${esc(e.memoryId)}">${esc(e.category)}/${esc(e.key)} = ${esc(e.value)} [${esc(e.authorityState)}]</option>`).join('')}
        </select>
        <button class="sc-btn" type="button" data-act="propose-style" ${s.busy ? 'disabled' : ''}>Propose style rule</button>
      </div>
      ${renderProposalRecord(s.styleProposal, 'Rule')}
    </div>
    <div class="sc-card">
      <h2 style="font-size:.95rem">Visual Template proposal</h2>
      <p class="sc-note">From a deterministic visual-evidence pattern id. Geometry is never fabricated. Creates a <strong>PROPOSED</strong> template — approve in <strong>Curation</strong>.</p>
      <div class="sc-row">
        <input type="text" data-pattern-id placeholder="visual pattern id" ${s.busy ? 'disabled' : ''}/>
        <button class="sc-btn" type="button" data-act="propose-visual" ${s.busy ? 'disabled' : ''}>Propose visual template</button>
      </div>
      ${renderProposalRecord(s.visualProposal, 'Template')}
      ${statusLine(s)}
    </div>`;
}

function paint(s) {
  if (!_els) return;
  if (_tab === 'source') _els.content.innerHTML = renderSource(s);
  else if (_tab === 'observations') _els.content.innerHTML = renderObservations(s);
  else if (_tab === 'memory') _els.content.innerHTML = renderMemory(s);
  else _els.content.innerHTML = renderProposals(s);
}

async function onContentChange(ev) {
  const fileEl = ev.target.closest('[data-file]');
  if (!fileEl || !fileEl.files || !fileEl.files[0]) return;
  const f = fileEl.files[0];
  if (f.size > MAX_SOURCE_BYTES) {
    _els.content.querySelector('[data-content]');
    _controller.selectSource({}); // triggers the INVALID_RECORD curated error path
    return;
  }
  try {
    const buf = await f.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buf));
    const checksum = await sha256Hex(bytes);
    _controller.selectSource({
      name: f.name, type: f.type, size: f.size, checksum,
      format: detectFormat(f.name, f.type), bytes,
    });
  } catch {
    _controller.selectSource({});
  }
}

function onContentClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b || !_controller) return;
  const act = b.getAttribute('data-act');
  if (act === 'reset') return void _controller.reset();
  if (act === 'ingest') return void _controller.ingest();
  if (act === 'analyze') return void _controller.analyze();
  if (act === 'observations') return void _controller.loadObservations();
  if (act === 'memory') return void _controller.buildWritingMemory();
  if (act === 'propose-style') {
    const sel = _els.content.querySelector('[data-memory-id]');
    return void _controller.proposeStyleRule(sel ? sel.value : '');
  }
  if (act === 'propose-visual') {
    const inp = _els.content.querySelector('[data-pattern-id]');
    return void _controller.proposeVisualTemplate(inp ? inp.value.trim() : '');
  }
}

/**
 * @param {HTMLElement} hostEl
 * @param {{ controller?: object }} [opts]  inject a controller for tests
 */
export async function mountIntelligenceCorpusConsole(hostEl, opts = {}) {
  if (!hostEl) return;
  _host = hostEl;
  _tab = 'source';
  injectStyleOnce();
  buildShell(hostEl);

  if (opts && opts.controller) {
    _controller = opts.controller;
  } else {
    const user = getCurrentUser && getCurrentUser();
    _controller = await createWiredIntelligenceCorpusController({
      actor: {
        userId: (user && user.username) || null,
        role: (user && user.role) || null,
        adminEquivalent: !!(user && user.adminEquivalent),
      },
    });
  }
  if (typeof _controller.setOnChange === 'function') _controller.setOnChange(paint);
  _mounted = true;
  paint(_controller.getState());
}

export function unmountIntelligenceCorpusConsole() {
  if (_controller && typeof _controller.destroy === 'function') {
    try { _controller.destroy(); } catch { /* ignore */ }
  }
  if (_host) _host.innerHTML = '';
  _mounted = false;
  _host = null;
  _controller = null;
  _els = null;
}

export function isIntelligenceCorpusConsoleMounted() { return _mounted; }
