/* ============================================================
   DRIVER-CONTRIBUTORS.JS — "Kontributor Utama" for the Driver report

   A deterministic SELECTOR over values the Analytics Engine already
   computed (render.driversWithTrips + render.driverOdoList). No new
   analytics, no AI (IMPLEMENTATION_ARCHITECTURE §6.2). Produces the
   footer contributor line: up to 3 drivers, each with a short,
   model-grounded role label.

   Ranking + roles use only available signals:
     • volume   — assignment count (driversWithTrips, sorted desc)
     • distance — odometer km (driverOdoList, sorted desc)
   The top driver by volume leads; the distance leader (if different)
   is recognised for long-haul; the next contributor is noted for
   consistent utilisation. Descriptions never claim signals the model
   does not hold (e.g. no per-driver destination diversity exists).

   Output: { contributors: [{ name, role }] }
   ============================================================ */

'use strict';

import { formatInt } from '../format/numbers.js';

/**
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @returns {{ contributors: Array<{name:string, role:string}> }}
 */
export function selectDriverContributors(model) {
  const r = (model && model.render) || {};
  const byVolume = Array.isArray(r.driversWithTrips) ? r.driversWithTrips : []; // [{displayName,count}] desc
  const byKm = Array.isArray(r.driverOdoList) ? r.driverOdoList : [];           // [{name,km}] desc

  if (byVolume.length === 0) return { contributors: [] };

  const kmByName = new Map(byKm.map(d => [String(d.name).toLowerCase(), d.km]));
  const kmLeader = byKm.length > 0 ? byKm[0] : null;
  const picked = new Set();
  const contributors = [];

  const add = (name, role) => {
    const key = String(name).toLowerCase();
    if (!name || picked.has(key)) return;
    picked.add(key);
    contributors.push({ name, role });
  };

  // 1) Top driver by volume — note distance too when they also lead it.
  const top = byVolume[0];
  const topKm = kmByName.get(String(top.displayName).toLowerCase()) || 0;
  const topAlsoKmLeader = kmLeader && String(kmLeader.name).toLowerCase() === String(top.displayName).toLowerCase();
  add(top.displayName, topAlsoKmLeader && topKm > 0
    ? 'Volume dan jarak penugasan tertinggi'
    : 'Volume penugasan tertinggi');

  // 2) Distance leader, when distinct from the volume leader.
  if (kmLeader && !topAlsoKmLeader && kmLeader.km > 0) {
    add(kmLeader.name, `Jarak tempuh tertinggi — ${formatInt(kmLeader.km)} km`);
  }

  // 3) Next contributor by volume — consistent utilisation.
  for (let i = 1; i < byVolume.length && contributors.length < 3; i++) {
    add(byVolume[i].displayName, 'Utilisasi konsisten sepanjang periode');
  }

  return { contributors: contributors.slice(0, 3) };
}
