/* ============================================================
   VEHICLE-SIMULATION-PANEL.JS — Scenario Simulation Engine (v1.19.8)

   The Simulation half of the vehicle Explainability drawer. When a simulation is
   active, this renders its result as EXECUTIVE DRAWER SECTIONS that EXTEND — never
   replace — the existing Prediction / Explainability / Recommendation drawer:
   Simulation Result, Current vs Simulation, Recommendation Changes, Impact
   Summary, Simulation Notes.

   PRESENTATION ONLY — it computes nothing. It is handed the active simulation
   (run + comparison, already built by the PURE simulation pipeline) and only
   ARRANGES it into the Executive Drawer's slots, reusing the simulation-summary
   presentation. It writes nothing: a simulation is temporary and never modifies
   production. Backward compatible: with no active simulation it returns '' and the
   drawer is unchanged.

   API:
     simulationDrawerSections(active, vehicleId) → string (concatenated sections)
   ============================================================ */

'use strict';

import {
  ExecutiveDrawerSection as drawerSection,
  ExecutiveStatusPill,
  escHtml as esc,
} from '../analytics/executive-ui-kit.js';
import {
  injectSimulationSummaryStyles,
  ComparisonTable,
  ImpactSummaryCard,
  RecommendationComparison,
} from '../analytics/simulation-summary.js';

function para(text) {
  return text ? `<p style="font-size:13px;color:var(--muted);line-height:1.55">${esc(text)}</p>` : '';
}

const TONES = new Set(['ok', 'warn', 'danger', 'info']);
function tone3(t, fallback = 'info') { return TONES.has(t) ? t : fallback; }

/**
 * Build the Simulation drawer sections for the active simulation, focused on one
 * vehicle. Returns '' when no simulation is active (drawer unchanged).
 * @param {Object|null} active   { run, comparison } from the Simulation Panel
 * @param {string} vehicleId
 * @returns {string}
 */
export function simulationDrawerSections(active, vehicleId) {
  if (!active || typeof active !== 'object' || !active.comparison || !active.run) return '';
  injectSimulationSummaryStyles();
  const { run, comparison } = active;
  if (!comparison.ok) return '';

  const id = String(vehicleId);
  const change = comparison.byId && comparison.byId[id] ? comparison.byId[id] : null;
  const scenario = run.scenario;

  // 1) Simulation Result — which scenario is being simulated.
  const head = drawerSection({
    title: 'Simulation Result',
    content:
      `<div class="exec-vad-badges" style="justify-content:flex-start">${[
        ExecutiveStatusPill(scenario ? esc(scenario.label) : 'Simulasi', tone3(scenario && scenario.tone, 'info')),
        ExecutiveStatusPill(`Target: ${esc(run.targetName)}`, 'info'),
      ].join('')}</div>` +
      para(comparison.impact && comparison.impact.title),
  });

  // 2) Current vs Simulation — the fleet comparison table.
  const cmp = drawerSection({ title: 'Current vs Simulation', content: ComparisonTable(comparison.metrics) });

  // 3) Recommendation Changes — this vehicle's change, or a note when unaffected.
  const recs = drawerSection({
    title: 'Recommendation Changes',
    content: change
      ? RecommendationComparison([change])
      : para('Rekomendasi untuk kendaraan ini tidak berubah pada skenario ini.'),
  });

  // 4) Impact Summary.
  const impact = drawerSection({ title: 'Impact Summary', content: ImpactSummaryCard(comparison.impact) });

  // 5) Simulation Notes — the ephemeral, no-side-effect guarantee.
  const notes = drawerSection({
    title: 'Simulation Notes',
    content: para('Simulasi bersifat sementara dan hanya berada di memori. Menutup simulasi otomatis membuang seluruh perubahan. Tidak ada data produksi, catatan kendaraan, atau data Firebase yang diubah.'),
  });

  return [head, cmp, recs, impact, notes].join('');
}

export default { simulationDrawerSections };
