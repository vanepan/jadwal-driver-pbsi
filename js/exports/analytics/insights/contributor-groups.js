/* ============================================================
   CONTRIBUTOR-GROUPS.JS — full contributor sections (Complete P4)

   Produces the three grouped contributor sections (Pengemudi /
   Kendaraan / Bidang) with a prose description and a km metric per
   entity. It REUSES the existing footer contributor selectors for the
   selection ORDER (single source of truth), then enriches each entry
   with a model-grounded description + km metric. No new analytics; all
   stats come from the existing AnalyticsModel (+ per-bidang km).

   Output: ContributorGroup[] =
     { label, items:[{ name, description, metricValue, metricLabel }] }
   ============================================================ */

'use strict';

import { selectDriverContributors } from './driver-contributors.js';
import { selectVehicleContributors } from './vehicle-contributors.js';
import { selectBidangContributors } from './bidang-contributors.js';
import { formatInt } from '../format/numbers.js';

function _kmMetric(km) {
  return { metricValue: km > 0 ? formatInt(km) : '—', metricLabel: 'km' };
}

function _driverGroup(model) {
  const r = model.render || {};
  const k = model.kpis || {};
  const order = selectDriverContributors(model).contributors; // [{name,role}] in P4 order
  const countByName = new Map((r.driversWithTrips || []).map((d) => [d.displayName.toLowerCase(), d.count]));
  const kmByName = new Map((r.driverOdoList || []).map((d) => [d.name.toLowerCase(), d.km]));
  const volumeLeader = (r.driversWithTrips || [])[0];
  const kmLeader = (r.driverOdoList || [])[0];
  const total = k.total || 0;
  const totalKm = k.totalKm || 0;

  const items = order.map(({ name }) => {
    const key = name.toLowerCase();
    const count = countByName.get(key) || 0;
    const km = kmByName.get(key) || 0;
    const share = total > 0 ? Math.round((count / total) * 100) : 0;
    const kmPct = totalKm > 0 ? Math.round((km / totalKm) * 100) : 0;
    const isVol = volumeLeader && volumeLeader.displayName.toLowerCase() === key;
    const isKm = kmLeader && kmLeader.name.toLowerCase() === key;
    let description;
    if (isVol && isKm) {
      description = `Mengelola volume dan jarak tertinggi dalam tim — mencakup ${share}% dari seluruh penugasan dan ${kmPct}% dari total jarak tempuh armada pada periode ini.`;
    } else {
      description = `Menyelesaikan ${formatInt(count)} penugasan (${share}% dari total)${km > 0 ? ` dengan ${formatInt(km)} km tercatat` : ''} pada periode ini.`;
    }
    return { name, description, ..._kmMetric(km) };
  });
  return { label: 'Pengemudi', items };
}

function _vehicleGroup(model) {
  const r = model.render || {};
  const k = model.kpis || {};
  const order = selectVehicleContributors(model).contributors;
  const countByName = new Map((r.vehiclesWithTrips || []).map((v) => [v.displayName.toLowerCase(), v.count]));
  const kmByName = new Map((r.vehicleOdoList || []).map((v) => [v.name.toLowerCase(), v.km]));
  const volumeLeader = (r.vehiclesWithTrips || [])[0];
  const reserve = (r.vehiclesWithTrips || [])[(r.vehiclesWithTrips || []).length - 1];
  // km-per-trip leader
  const perTrip = (r.vehiclesWithTrips || [])
    .map((v) => ({ name: v.displayName, avg: v.count > 0 ? (kmByName.get(v.displayName.toLowerCase()) || 0) / v.count : 0 }))
    .filter((v) => v.avg > 0)
    .sort((a, b) => b.avg - a.avg);
  const kmTripLeader = perTrip[0];
  const total = k.total || 0;

  const items = order.map(({ name }) => {
    const key = name.toLowerCase();
    const count = countByName.get(key) || 0;
    const km = kmByName.get(key) || 0;
    const share = total > 0 ? Math.round((count / total) * 100) : 0;
    let description;
    if (volumeLeader && volumeLeader.displayName.toLowerCase() === key) {
      description = 'Kendaraan dengan volume penugasan tertinggi — menjadi tulang punggung operasional armada pada periode ini.';
    } else if (kmTripLeader && kmTripLeader.name.toLowerCase() === key) {
      description = `Mendukung rute jarak jauh dengan rata-rata ${formatInt(Math.round(kmTripLeader.avg))} km per trip — tertinggi di antara seluruh kendaraan aktif.`;
    } else if (reserve && reserve.displayName.toLowerCase() === key) {
      description = 'Beroperasi sebagai cadangan aktif, siap mendukung kapasitas tambahan saat diperlukan.';
    } else {
      description = `Utilisasi konsisten sepanjang periode, mendukung ${share}% dari total penugasan armada.`;
    }
    return { name, description, ..._kmMetric(km) };
  });
  return { label: 'Kendaraan', items };
}

function _bidangGroup(model, bidangKm) {
  const r = model.render || {};
  const order = selectBidangContributors(model, bidangKm).contributors;
  const byName = new Map((r.bidangEnhanced || []).map((b) => [b.name, b]));

  const items = order.map(({ name }) => {
    const b = byName.get(name) || { reqCount: 0, asgCount: 0 };
    const km = bidangKm[name] || 0;
    const fulfilled = (b.reqCount || 0) > 0 && (b.asgCount || 0) >= (b.reqCount || 0);
    const description = fulfilled
      ? `Mengajukan dan menyelesaikan permintaan layanan pada periode ini.${km > 0 ? ` Seluruh ${formatInt(km)} km jarak tercatat berasal dari penugasan bidang ini.` : ''}`
      : 'Mengajukan permintaan layanan yang menunggu penugasan. Permintaan akan diproses pada periode selanjutnya.';
    return { name, description, ..._kmMetric(km) };
  });
  return { label: 'Bidang', items };
}

/**
 * @param {import('../../../analytics/analytics-types.js').AnalyticsModel} model
 * @param {Object.<string, number>} [bidangKm]
 * @returns {Array<{label:string, items:Array<{name:string, description:string, metricValue:string, metricLabel:string}>}>}
 */
export function selectContributorGroups(model, bidangKm = {}) {
  const groups = [];
  const d = _driverGroup(model);
  const v = _vehicleGroup(model);
  const b = _bidangGroup(model, bidangKm);
  if (d.items.length) groups.push(d);
  if (v.items.length) groups.push(v);
  if (b.items.length) groups.push(b);
  return groups;
}
