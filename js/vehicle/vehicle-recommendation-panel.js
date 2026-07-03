/* ============================================================
   VEHICLE-RECOMMENDATION-PANEL.JS — Fleet Recommendation Engine (v1.19.7)

   The Recommendation half of the vehicle Explainability drawer. Given a certified
   per-vehicle projection, it derives that vehicle's single recommendation (via the
   PURE Fleet Recommendation Engine) and renders it as EXECUTIVE DRAWER SECTIONS
   that EXTEND — never replace — the existing Prediction / Explainability drawer.

   PRESENTATION ONLY — it computes no prediction and no recommendation logic of its
   own; it asks the Fleet Recommendation Engine (which consumes ONLY the certified
   model + Explainability layer) for the recommendation and ARRANGES it into the
   Executive Drawer's slots (ExecutiveDrawerSection / ExecutiveDrawerMetrics /
   ExecutiveStatusPill / NotesList). No new CSS: it reuses the kit + the shared
   `.pex-*` list styles the drawer already injects. Everything escaped.

   Answers, without technical knowledge: WHAT should be done, WHY, HOW urgent,
   the EXPECTED benefit, the PREDICTION it references, and WHERE it came from
   (Recommendation Source) — without exposing any implementation detail.

   API:
     recommendationDrawerSections(projection) → string (concatenated sections)
   ============================================================ */

'use strict';

import {
  ExecutiveDrawerSection as drawerSection,
  ExecutiveDrawerMetrics as drawerMetrics,
  ExecutiveStatusPill,
  escHtml as esc,
} from '../analytics/executive-ui-kit.js';
import { NotesList } from '../analytics/prediction-explainability-panel.js';
import { buildVehicleRecommendation } from '../recommendation/fleet-recommendation-engine.js';

const TONES = new Set(['ok', 'warn', 'danger', 'info']);
function tone3(t, fallback = 'info') { return TONES.has(t) ? t : fallback; }

function badgeRow(pills) {
  const valid = pills.filter(Boolean);
  if (!valid.length) return '';
  return `<div class="exec-vad-badges" style="justify-content:flex-start">${valid.join('')}</div>`;
}

function para(text) {
  return text ? `<p style="font-size:13px;color:var(--muted);line-height:1.55">${esc(text)}</p>` : '';
}

/**
 * Build the Recommendation drawer sections for a certified projection. Returns
 * several ExecutiveDrawerSections concatenated (the caller joins them into the
 * drawer body, after the Prediction / Explainability sections). Returns '' when
 * no projection is supplied, so the plain inventory drawer is unaffected.
 * @param {Object} projection  a certified `model.vehicles[i]`
 * @returns {string}
 */
export function recommendationDrawerSections(projection) {
  if (!projection || typeof projection !== 'object') return '';
  const rec = buildVehicleRecommendation(projection);
  if (!rec) return '';

  const pr = rec.priority || {};
  const cf = rec.confidence || {};
  const ref = rec.predictionRef || {};
  const impact = rec.estimatedImpact || {};
  const tl = rec.timeline || {};

  // 1) Recommendation Summary — category, action, priority + confidence at a glance.
  const summary = drawerSection({
    title: 'Recommendation Summary',
    content:
      badgeRow([
        ExecutiveStatusPill(esc(rec.categoryLabel || 'Rekomendasi'), tone3(pr.tone, 'info')),
        ExecutiveStatusPill(`Prioritas ${esc(pr.label || '—')}`, tone3(pr.tone, 'info')),
        ExecutiveStatusPill(`Keyakinan ${esc(cf.levelWord || 'Rendah')}`, tone3(cf.tone, 'warn')),
      ]) +
      para(rec.title),
  });

  // 2) Operational Reason — why this action (+ operational notes).
  const reason = drawerSection({
    title: 'Operational Reason',
    content: para(rec.reason) + NotesList(rec.operationalNotes, 'ok'),
  });

  // 3) Prediction Reference — the certified prediction this recommendation cites.
  const reference = drawerSection({
    title: 'Prediction Reference',
    content: drawerMetrics([
      { label: 'Jenis Prediksi', value: ref.kindLabel || '—', tone: tone3(ref.tone, 'info') },
      { label: 'Tingkat Risiko', value: ref.levelLabel || '—', tone: tone3(ref.tone, 'info') },
      { label: 'Jendela Prediksi', value: ref.window || '—' },
      { label: 'Metodologi', value: ref.methodology || '—' },
    ]),
  });

  // 4) Expected Operational Benefit.
  const benefit = drawerSection({
    title: 'Expected Operational Benefit',
    content: para(rec.expectedBenefit),
  });

  // 5) Priority + Suggested Timeline + Estimated Impact.
  const priority = drawerSection({
    title: 'Priority & Timeline',
    content:
      badgeRow([ExecutiveStatusPill(`Prioritas ${esc(pr.label || '—')}`, tone3(pr.tone, 'info'))]) +
      drawerMetrics([
        { label: 'Estimasi Dampak', value: impact.label || '—', tone: tone3(impact.tone, 'info') },
        { label: 'Jendela Eksekusi', value: tl.label || '—' },
        { label: 'Catatan Waktu', value: tl.note || '—' },
      ]),
  });

  // 6) Confidence — the certified confidence behind the recommendation.
  const confidence = drawerSection({
    title: 'Confidence',
    content: drawerMetrics([
      { label: 'Keyakinan', value: `${cf.score != null ? cf.score : 0}%`, tone: tone3(cf.tone, 'warn') },
      { label: 'Tingkat Keyakinan', value: cf.levelWord || 'Rendah' },
    ]),
  });

  // 7) Dependencies — the operational prerequisites (may be empty).
  const deps = (rec.dependencies && rec.dependencies.length)
    ? drawerSection({ title: 'Dependencies', content: NotesList(rec.dependencies) })
    : '';

  // 8) Recommendation Source — WHERE the recommendation originates, without
  //    exposing implementation detail (Recommendation Explainability).
  const source = drawerSection({
    title: 'Recommendation Source',
    content: NotesList(rec.source),
  });

  return [summary, reason, reference, benefit, priority, confidence, deps, source].join('');
}

export default { recommendationDrawerSections };
