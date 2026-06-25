/* ============================================================
   ASSIGNMENT-DISPATCH-HINTS.JS — Request Workflow Separation
   (v1.16.4.11-beta.3)

   COMPACT Dispatch Intelligence hints for the ADMIN direct-assignment form
   (Tambah Jadwal / #modalForm). Per the workflow-separation spec this is NOT a
   large dispatch card — just a one-line driver hint under the driver selector
   and a one-line vehicle hint under the vehicle selector, e.g.
       🧭 Rekomendasi: Andi (skor 100)
       🧭 Rekomendasi: Toyota Innova (skor 97)
   updated live as the date / time / passenger fields change. Read-only and
   advisory — it never changes the selection or writes anything.

   It reuses the Driver + Vehicle Recommendation Engines directly (top-ranked
   available candidate); no scoring logic here. The only DOM dependency is the
   assignment form; the pure engines have none.
   ============================================================ */

'use strict';

import { getCombinedTimeFromPair } from '../utils.js';
import { getActiveDrivers } from '../drivers-store.js';
import { getActiveVehicles } from '../vehicles-store.js';
import { getAssignments } from '../assignments.js';
import { recommendDrivers } from '../services/driver-recommendation-engine.js';
import { recommendVehicle } from '../services/vehicle-recommendation-engine.js';

const STYLE_ID = 'dci-hint-styles';

const CSS = `
.dispatch-hint{
  margin-top:.35rem;font-size:.76rem;line-height:1.3;color:var(--muted);
  display:flex;align-items:center;gap:.35rem;
}
.dispatch-hint[hidden]{display:none;}
.dispatch-hint__name{font-weight:700;color:var(--text);}
.dispatch-hint__score{color:var(--ok);font-weight:600;}
.dispatch-hint--none{color:var(--warn);}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Read the assignment form's request shape (full-day → 00:00–23:59). */
function readAssignmentRequest() {
  const get = (id) => document.getElementById(id);
  const fullDay = get('assignmentFullDay') ? !!get('assignmentFullDay').checked : false;
  return {
    date: get('fieldDate') ? get('fieldDate').value : '',
    startTime: fullDay ? '00:00' : getCombinedTimeFromPair('fieldStartHour', 'fieldStartMinute'),
    endTime: fullDay ? '23:59' : getCombinedTimeFromPair('fieldEndHour', 'fieldEndMinute'),
    passengers: parseInt(get('fieldPax') ? get('fieldPax').value : '0', 10) || 0,
  };
}

/** Render one hint element from a {name, score} (or null → "no candidate"). */
function paint(hintEl, best, noneLabel) {
  if (!hintEl) return;
  hintEl.classList.remove('dispatch-hint--none');
  hintEl.replaceChildren();
  if (!best) {
    hintEl.classList.add('dispatch-hint--none');
    hintEl.textContent = `🧭 ${noneLabel}`;
    hintEl.hidden = false;
    return;
  }
  const lead = document.createElement('span');
  lead.textContent = '🧭 Rekomendasi:';
  const name = document.createElement('span');
  name.className = 'dispatch-hint__name';
  name.textContent = best.name;
  const score = document.createElement('span');
  score.className = 'dispatch-hint__score';
  score.textContent = `(skor ${best.score})`;
  hintEl.append(lead, name, score);
  hintEl.hidden = false;
}

/**
 * Wire compact driver + vehicle hints to the assignment form. Read-only.
 * @returns {()=>void} manual refresh (no-op outside the DOM)
 */
export function initAssignmentDispatchHints() {
  if (typeof document === 'undefined') return () => {};
  const driverHint = document.getElementById('assignmentDriverHint');
  const vehicleHint = document.getElementById('assignmentVehicleHint');
  if (!driverHint && !vehicleHint) return () => {};

  const isFormVisible = () => {
    const modal = document.getElementById('modalForm');
    return !!modal && modal.style.display !== 'none';
  };

  function refresh() {
    if (!isFormVisible()) return;
    const request = readAssignmentRequest();
    const ready = request.date && request.startTime && request.endTime && request.passengers > 0;
    if (!ready) {
      if (driverHint) driverHint.hidden = true;
      if (vehicleHint) vehicleHint.hidden = true;
      return;
    }
    try {
      const drivers = getActiveDrivers() || [];
      const vehicles = (getActiveVehicles() || []).map((v) => (v && v.vehicleId == null && v.id != null ? { ...v, vehicleId: v.id } : v));
      const assignments = getAssignments() || [];

      const dRes = recommendDrivers(request, drivers, assignments);
      const dTop = dRes.recommendedDriver
        ? (dRes.diagnostics.find((x) => x.driverId === dRes.recommendedDriver.driverId) || null)
        : null;
      paint(driverHint, dTop ? { name: dTop.driverName, score: dRes.recommendedDriver.score } : null, 'Tidak ada driver tersedia');

      const vRes = recommendVehicle(request, vehicles, assignments);
      const vTop = vRes.recommendedVehicle
        ? (vRes.diagnostics.find((x) => x.vehicleId === vRes.recommendedVehicle.vehicleId) || null)
        : null;
      paint(vehicleHint, vTop ? { name: vTop.vehicleName, score: vRes.recommendedVehicle.score } : null, 'Tidak ada kendaraan sesuai');
    } catch (err) {
      console.warn('[AssignmentHints] recommendation failed', err);
    }
  }

  ['fieldDate', 'fieldStartHour', 'fieldStartMinute', 'fieldEndHour', 'fieldEndMinute'].forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.addEventListener('change', refresh);
    node.addEventListener('blur', refresh);
  });
  document.getElementById('assignmentFullDay')?.addEventListener('change', refresh);
  document.getElementById('paxStepper')?.addEventListener('click', () => setTimeout(refresh, 0));

  const modal = document.getElementById('modalForm');
  if (modal && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => refresh()).observe(modal, { attributes: true, attributeFilter: ['style'] });
  }

  ensureStyles();
  return refresh;
}
