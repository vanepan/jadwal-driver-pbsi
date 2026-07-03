/* ============================================================
   SIMULATION-PANEL.JS — Scenario Simulation Engine (v1.19.8)

   The Executive Simulation Panel: the interactive surface where an administrator
   picks a scenario (quick-start Executive Scenario Cards), runs it, and reads the
   Current-vs-Simulation comparison, impact summary, recommendation changes and
   timeline — all WITHOUT touching production data.

   ── SAFE + EPHEMERAL ─────────────────────────────────────────────────────────
   The panel drives the PURE simulation pipeline (scenario-engine → comparison)
   and reuses the simulation-summary presentation. It holds an in-memory
   scenario-history session in a closure; when the panel is re-rendered or removed
   (the dashboard replaces its innerHTML on every data refresh) the session — and
   therefore every simulated change — is discarded automatically. Nothing is ever
   written to Firebase or any store.

   ── DECOUPLING ───────────────────────────────────────────────────────────────
   Forecasting happens ONLY through the Prediction Service (inside scenario-engine).
   This file imports no prediction engine/validator/provider. It exposes the active
   simulation so the vehicle drawer can present it, but the drawer only READS it.

   API:
     injectSimulationStyles()
     renderSimulationMount()            → string (placed inside the dashboard shell)
     mountSimulationPanel(mountEl, baseInput)
     getActiveSimulation()              → { run, comparison } | null
     clearActiveSimulation()
   ============================================================ */

'use strict';

import { anIcon, escHtml as esc } from './executive-ui-kit.js';
import { listScenarios } from '../simulation/scenario-types.js';
import { runSimulation } from '../simulation/scenario-engine.js';
import { buildComparison } from '../simulation/scenario-comparison.js';
import { createScenarioSession } from '../simulation/scenario-history.js';
import {
  injectSimulationSummaryStyles,
  ComparisonTable,
  ImpactSummaryCard,
  RecommendationComparison,
  SimulationTimeline,
  ConfidenceRow,
} from './simulation-summary.js';

const STYLE_ID = 'sim-panel-styles';

/* The active simulation, exposed for the vehicle drawer (read-only). Reset on
   every fresh mount so a stale simulation never leaks across a data refresh. */
let _active = null;
export function getActiveSimulation() { return _active; }
export function clearActiveSimulation() { _active = null; }

const CSS = `
.sim-panel{display:flex;flex-direction:column;gap:1rem;}
.sim-panel__intro{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.sim-panel__lead{font-size:.82rem;color:var(--muted);line-height:1.5;max-width:60ch;margin:0;}
.sim-badge{display:inline-flex;align-items:center;gap:.4rem;font-size:.62rem;font-weight:800;text-transform:uppercase;
  letter-spacing:.05em;padding:.3rem .58rem;border-radius:999px;border:1px solid var(--ok);color:var(--ok);white-space:nowrap;}

/* Executive Scenario Cards (quick-start) */
.sim-scn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));gap:.65rem;}
.sim-scn{appearance:none;text-align:left;cursor:pointer;border:1px solid var(--border);border-left-width:3px;
  border-radius:12px;background:var(--surface-2);padding:.7rem .8rem;display:flex;flex-direction:column;gap:.28rem;
  color:inherit;font:inherit;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease;min-width:0;}
.sim-scn:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px);}
.sim-scn:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.sim-scn--ok{border-left-color:var(--ok);}
.sim-scn--info{border-left-color:var(--info);}
.sim-scn--warn{border-left-color:var(--warn);}
.sim-scn--danger{border-left-color:var(--danger);}
.sim-scn__ico{display:inline-flex;color:var(--muted);}
.sim-scn--ok .sim-scn__ico{color:var(--ok);}
.sim-scn--info .sim-scn__ico{color:var(--info);}
.sim-scn--warn .sim-scn__ico{color:var(--warn);}
.sim-scn--danger .sim-scn__ico{color:var(--danger);}
.sim-scn__label{font-size:.84rem;font-weight:800;color:var(--text);letter-spacing:-.01em;}
.sim-scn__desc{font-size:.7rem;color:var(--muted);line-height:1.4;}

/* Toolbar + history */
.sim-toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;}
.sim-btn{appearance:none;cursor:pointer;font:inherit;font-size:.76rem;font-weight:700;color:var(--text);
  background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:.34rem .8rem;
  display:inline-flex;align-items:center;gap:.35rem;transition:border-color .15s ease,background .15s ease;}
.sim-btn:hover{border-color:var(--text-dim,var(--muted));}
.sim-btn:focus-visible{outline:2px solid var(--info);outline-offset:2px;}
.sim-btn--danger{color:var(--danger);border-color:var(--danger);}
.sim-hist{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;}
.sim-hist__l{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
.sim-hist__chip{display:inline-flex;align-items:center;gap:.35rem;font-size:.72rem;color:var(--text);
  background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:.2rem .55rem;}
.sim-hist__dup{appearance:none;cursor:pointer;border:0;background:transparent;color:var(--info);font:inherit;
  font-size:.68rem;font-weight:700;padding:0;display:inline-flex;align-items:center;}
.sim-hist__dup:focus-visible{outline:2px solid var(--info);outline-offset:2px;border-radius:4px;}

/* Result */
.sim-result{display:block;}
.sim-result-inner{display:flex;flex-direction:column;gap:1rem;border:1px solid var(--border);border-radius:16px;
  background:var(--surface);padding:1.05rem 1.15rem;}
.sim-result__head{display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;}
.sim-result__titles{display:flex;flex-direction:column;gap:.15rem;}
.sim-result__eye{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
.sim-result__scn{font-size:1.05rem;font-weight:800;color:var(--text);letter-spacing:-.01em;}
.sim-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr));gap:1rem;}
.sim-sub{font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
  margin:0 0 .5rem;display:block;}
.sim-note{font-size:.74rem;color:var(--muted);line-height:1.5;border:1px dashed var(--border);border-radius:10px;
  padding:.55rem .75rem;background:var(--surface-2);}

@media (prefers-reduced-motion: reduce){ .sim-scn{transition:none;} }
`;

export function injectSimulationStyles() {
  injectSimulationSummaryStyles();
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ── static markup ─────────────────────────────────────────────────────────── */

const TONES = new Set(['ok', 'warn', 'danger', 'info']);
function tone(t, fallback = 'info') { return TONES.has(t) ? t : fallback; }

function scenarioCards() {
  return listScenarios().map((s) =>
    `<button type="button" class="sim-scn sim-scn--${tone(s.tone)}" data-scn="${esc(s.key)}" aria-label="Simulasikan: ${esc(s.label)}">
        <span class="sim-scn__ico">${anIcon(s.icon || 'analytics', { size: 15 })}</span>
        <span class="sim-scn__label">${esc(s.shortLabel)}</span>
        <span class="sim-scn__desc">${esc(s.description)}</span>
      </button>`).join('');
}

/** The mount markup the dashboard drops inside its Simulation section shell. */
export function renderSimulationMount() {
  return `<div class="sim-panel" data-sim-root>
      <div class="sim-panel__intro">
        <p class="sim-panel__lead">Uji dampak sebuah keputusan operasional sebelum menerapkannya. Simulasi bersifat sementara, hanya di memori, dan tidak pernah mengubah data produksi.</p>
        <span class="sim-badge">${anIcon('doc-shield', { size: 12 })} Tanpa Perubahan Data</span>
      </div>
      <div class="sim-scn-grid">${scenarioCards()}</div>
      <div class="sim-toolbar" data-sim-toolbar hidden>
        <button type="button" class="sim-btn" data-sim-action="another">${anIcon('pulse', { size: 13 })} Skenario Lain</button>
        <button type="button" class="sim-btn sim-btn--danger" data-sim-action="reset">${anIcon('x', { size: 13 })} Reset Simulasi</button>
        <span class="sim-hist" data-sim-history></span>
      </div>
      <div class="sim-result" data-sim-result role="region" aria-live="polite" aria-label="Hasil simulasi"></div>
    </div>`;
}

function renderResult(run, comparison) {
  if (!comparison.ok) {
    return `<div class="sim-result-inner">
        <div class="sim-result__head"><div class="sim-result__titles"><span class="sim-result__eye">Hasil Simulasi</span><span class="sim-result__scn">${esc(run.scenario ? run.scenario.label : 'Simulasi')}</span></div></div>
        ${ImpactSummaryCard(comparison.impact)}
        <div class="sim-note">Simulasi tidak menghasilkan proyeksi yang tersertifikasi untuk skenario ini. Data produksi tidak berubah.</div>
      </div>`;
  }
  return `<div class="sim-result-inner">
      <div class="sim-result__head">
        <div class="sim-result__titles">
          <span class="sim-result__eye">Hasil Simulasi · ${esc(run.scenario.label)}</span>
          <span class="sim-result__scn">${esc(run.targetName)}</span>
        </div>
        ${ConfidenceRow(comparison.confidence)}
      </div>
      <div class="sim-grid2">
        <section><span class="sim-sub">Ringkasan Dampak Eksekutif</span>${ImpactSummaryCard(comparison.impact)}</section>
        <section><span class="sim-sub">Saat Ini vs Simulasi</span>${ComparisonTable(comparison.metrics)}</section>
      </div>
      <section><span class="sim-sub">Perubahan Rekomendasi</span>${RecommendationComparison(comparison.recommendationChanges)}</section>
      <section><span class="sim-sub">Linimasa Simulasi</span>${SimulationTimeline(comparison.timeline)}</section>
      <div class="sim-note">${anIcon('doc-shield', { size: 12 })} Simulasi bersifat sementara dan otomatis dibuang saat panel ditutup. Tidak ada transaksi, catatan kendaraan, atau data Firebase yang diubah.</div>
    </div>`;
}

/* ── controller ────────────────────────────────────────────────────────────── */

/**
 * Mount + bind the Simulation Panel inside `mountEl`. Idempotent per node.
 * @param {HTMLElement} mountEl  the container (dashboard shell content)
 * @param {Object} baseInput     the production prediction-service input (never mutated)
 */
export function mountSimulationPanel(mountEl, baseInput) {
  if (!mountEl || typeof mountEl !== 'object') return;
  injectSimulationStyles();
  clearActiveSimulation();

  // Bind to the server-rendered markup when present (the dashboard renders it so
  // the scenario cards exist without JS); only render when the container is empty.
  let root = mountEl.querySelector('[data-sim-root]');
  if (!root) { mountEl.innerHTML = renderSimulationMount(); root = mountEl.querySelector('[data-sim-root]'); }
  if (!root) return;
  if (root.__simBound) return;   // idempotent: never stack listeners on re-mount
  root.__simBound = true;
  const resultEl = root.querySelector('[data-sim-result]');
  const toolbarEl = root.querySelector('[data-sim-toolbar]');
  const historyEl = root.querySelector('[data-sim-history]');
  const session = createScenarioSession();

  const renderHistory = () => {
    const list = session.list();
    if (!list.length) { historyEl.innerHTML = ''; return; }
    historyEl.innerHTML = `<span class="sim-hist__l">Sesi</span>` + list.map((e) =>
      `<span class="sim-hist__chip">${esc(e.title || e.scenarioKey)} <button type="button" class="sim-hist__dup" data-sim-dup="${e.id}" aria-label="Jalankan ulang skenario">↻</button></span>`).join('');
  };

  const runAndRender = (key, params) => {
    const run = runSimulation(baseInput, key, params || {});
    const comparison = buildComparison(run);
    _active = comparison.ok ? { run, comparison } : null;
    session.push({ scenarioKey: key, params: run.params, title: comparison.impact && comparison.impact.title });
    resultEl.innerHTML = renderResult(run, comparison);
    toolbarEl.hidden = false;
    renderHistory();
  };

  root.addEventListener('click', (e) => {
    const card = e.target.closest('[data-scn]');
    if (card) { runAndRender(card.getAttribute('data-scn')); return; }
    const dup = e.target.closest('[data-sim-dup]');
    if (dup) {
      const spec = session.duplicate(Number(dup.getAttribute('data-sim-dup')));
      if (spec) runAndRender(spec.scenarioKey, spec.params);
      return;
    }
    const act = e.target.closest('[data-sim-action]');
    if (!act) return;
    const action = act.getAttribute('data-sim-action');
    if (action === 'reset') {
      session.reset(); clearActiveSimulation();
      resultEl.innerHTML = ''; toolbarEl.hidden = true; renderHistory();
      const first = root.querySelector('[data-scn]'); if (first) first.focus();
    } else if (action === 'another') {
      resultEl.innerHTML = '';
      const first = root.querySelector('[data-scn]'); if (first) first.focus();
    }
  });
}

export default {
  injectSimulationStyles,
  renderSimulationMount,
  mountSimulationPanel,
  getActiveSimulation,
  clearActiveSimulation,
};
