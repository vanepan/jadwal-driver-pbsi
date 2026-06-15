/* ============================================================
   VEHICLE-CONTRIBUTORS.JS — "Kontributor Utama" for the Vehicle report

   A deterministic SELECTOR over values the Analytics Engine already
   computed (render.vehiclesWithTrips + render.vehicleOdoList). No new
   analytics, no AI (IMPLEMENTATION_ARCHITECTURE §6.2). Produces up to
   four vehicles, each with a model-grounded role — mirroring the
   approved prototype (Vehicle tab):

     • volume leader      → "Volume penugasan tertinggi"
     • km/trip leader     → "Rute jarak jauh, N km per trip"
     • a consistent unit  → "Utilisasi konsisten sepanjang periode"
     • lowest-volume unit → "Cadangan aktif"

   Output: { contributors: [{ name, role }] }
   ============================================================ */

'use strict';

import { formatInt } from '../format/numbers.js';

/**
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {{ contributors: Array<{name:string, role:string}> }}
 */
export function selectVehicleContributors(model) {
  const r = (model && model.render) || {};
  const byVolume = Array.isArray(r.vehiclesWithTrips) ? r.vehiclesWithTrips : []; // [{displayName,count}] desc
  const odo = Array.isArray(r.vehicleOdoList) ? r.vehicleOdoList : [];            // [{name,km}] desc

  if (byVolume.length === 0) return { contributors: [] };

  const kmByName = new Map(odo.map((v) => [String(v.name).toLowerCase(), v.km]));
  const picked = new Set();
  const contributors = [];
  const add = (name, role) => {
    const key = String(name).toLowerCase();
    if (!name || picked.has(key)) return;
    picked.add(key);
    contributors.push({ name, role });
  };

  // 1) Volume leader.
  add(byVolume[0].displayName, 'Volume penugasan tertinggi');

  // 2) Highest km-per-trip (distinct from the volume leader).
  const perTrip = byVolume
    .map((v) => {
      const km = kmByName.get(String(v.displayName).toLowerCase()) || 0;
      return { name: v.displayName, avg: v.count > 0 ? km / v.count : 0 };
    })
    .filter((v) => v.avg > 0)
    .sort((a, b) => b.avg - a.avg);
  if (perTrip.length > 0 && !picked.has(String(perTrip[0].name).toLowerCase())) {
    add(perTrip[0].name, `Rute jarak jauh, ${formatInt(Math.round(perTrip[0].avg))} km per trip`);
  }

  // 3) Consistent — next unpicked in volume order.
  for (const v of byVolume) {
    if (contributors.length >= 3) break;
    if (!picked.has(String(v.displayName).toLowerCase())) {
      add(v.displayName, 'Utilisasi konsisten sepanjang periode');
      break;
    }
  }

  // 4) Reserve — lowest-volume unpicked unit.
  if (byVolume.length > 1) {
    for (let i = byVolume.length - 1; i >= 0; i--) {
      const v = byVolume[i];
      if (!picked.has(String(v.displayName).toLowerCase())) {
        add(v.displayName, 'Cadangan aktif');
        break;
      }
    }
  }

  return { contributors: contributors.slice(0, 4) };
}
