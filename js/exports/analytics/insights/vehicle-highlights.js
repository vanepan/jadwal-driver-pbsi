/* ============================================================
   VEHICLE-HIGHLIGHTS.JS — Zone-D highlights for the Vehicle report

   REUSES the existing Insight Engine (js/analytics/analytics-insights.js)
   for the idle-fleet finding, and PROJECTS the remaining two highlights
   from values the Analytics Engine ALREADY computed (render.vehicleOdoList,
   render.vehiclesWithTrips, charts.vehicleUtil) — selections, not new
   analytics (IMPLEMENTATION_ARCHITECTURE §6.3). It does NOT compute
   analytics or create an engine.

   Mirrors the approved prototype (Vehicle tab) — three categories:
     • Utilisasi  — full fleet utilisation (0 idle) ↔ idle-fleet insight
     • Jarak      — highest km-per-trip vehicle
     • Distribusi — top-2 vehicles' share of total assignments

   Output: Highlight[] = { category, tone, statement, context }
   ============================================================ */

'use strict';

import { generateInsights } from '../../../analytics/analytics-insights.js';
import { formatInt } from '../format/numbers.js';

const CATEGORY_ORDER = ['Utilisasi', 'Jarak', 'Distribusi'];

/**
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {Array<{category:string, tone:string, statement:string, context:string}>}
 */
export function selectVehicleHighlights(model) {
  const r = (model && model.render) || {};
  const k = (model && model.kpis) || {};
  const charts = (model && model.charts) || {};
  const out = [];

  const vWith = Array.isArray(r.vehiclesWithTrips) ? r.vehiclesWithTrips : []; // [{displayName,count}] desc count
  const odo = Array.isArray(r.vehicleOdoList) ? r.vehicleOdoList : [];          // [{name,km}] desc km
  const idle = Array.isArray(r.inactiveVehicles) ? r.inactiveVehicles.length : 0;
  const total = k.total || 0;

  // ── 1. Utilisasi ──────────────────────────────────────────────
  if (vWith.length > 0 && idle === 0) {
    out.push({
      category: 'Utilisasi', tone: 'good',
      statement: 'Seluruh armada aktif beroperasi. Tidak ada kendaraan yang tidak ditugaskan.',
      context: 'Kapasitas armada dimanfaatkan sepenuhnya selama periode ini.',
    });
  } else if (idle > 0) {
    // Reuse the engine's idle-fleet finding verbatim.
    const ins = generateInsights(model).find(
      (i) => i.source === 'Inactive Resources' && /kendaraan/i.test(i.title)
    );
    if (ins) {
      out.push({ category: 'Utilisasi', tone: 'attention', statement: ins.title, context: ins.description || '' });
    }
  }

  // ── 2. Jarak — highest km per trip ────────────────────────────
  if (odo.length > 0) {
    const countByName = new Map(vWith.map((v) => [String(v.displayName).toLowerCase(), v.count]));
    const perTrip = odo
      .map((v) => {
        const c = countByName.get(String(v.name).toLowerCase()) || 0;
        return { name: v.name, avg: c > 0 ? v.km / c : 0 };
      })
      .filter((v) => v.avg > 0)
      .sort((a, b) => b.avg - a.avg);
    if (perTrip.length > 0) {
      const top = perTrip[0];
      out.push({
        category: 'Jarak', tone: 'neutral',
        statement: `${top.name} mencatat rata-rata ${formatInt(Math.round(top.avg))} km per trip — tertinggi di antara seluruh armada.`,
        context: 'Konsisten mendukung rute jarak jauh pada periode ini.',
      });
    }
  }

  // ── 3. Distribusi — top-2 vehicles' share of total ────────────
  const vu = (Array.isArray(charts.vehicleUtil) && charts.vehicleUtil.length) ? charts.vehicleUtil : vWith;
  if (vu.length >= 2 && total > 0) {
    const share = Math.round(((vu[0].count + vu[1].count) / total) * 100);
    out.push({
      category: 'Distribusi', tone: 'neutral',
      statement: `${vu[0].displayName} dan ${vu[1].displayName} menyumbang ${share}% dari total penugasan armada periode ini.`,
      context: 'Kedua kendaraan ini menjadi tulang punggung operasional pada periode ini.',
    });
  }

  return out.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.category);
    const ib = CATEGORY_ORDER.indexOf(b.category);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}
