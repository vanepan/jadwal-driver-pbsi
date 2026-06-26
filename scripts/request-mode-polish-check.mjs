/* request-mode-polish-check.mjs — validates the request "Mode Penugasan"
   helpers (v1.17.4 — Part B). Run: node scripts/request-mode-polish-check.mjs

   PURE assertions: the Feature 8 mode matrix, the toggle → Dispatch Policy
   Engine context mapping (no dispatch logic duplicated), role-based card
   visibility (Feature 7), the confirmation-sheet copy (Feature 9), and the
   context-hint rule + text (Feature 10). */

import {
  REQUEST_MODE, REQUEST_MODE_SHEET, REQUEST_CONTEXT_HINT,
  requestModeVisibility, buildRequestPolicyContext, resolveRequestMode,
} from '../js/services/request-mode.js';
import { applyDispatchPolicy } from '../js/services/dispatch-policy-engine.js';
import { resetPolicyConfig } from '../js/config/dispatch-policy-config.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

resetPolicyConfig();

/* ── Mode matrix (Feature 8) ──────────────────────────────────────────── */
console.log('\n[Mode matrix]');
check('OFF/OFF → Driver + Kendaraan',
  resolveRequestMode({ useAmbulance: false, noDriver: false }).result === 'driver_vehicle');
check('ON/OFF  → Ambulance + Driver',
  resolveRequestMode({ useAmbulance: true, noDriver: false }).result === 'ambulance_driver');
check('OFF/ON  → Kendaraan Saja (vehicle only)',
  resolveRequestMode({ useAmbulance: false, noDriver: true }).result === 'vehicle_only');
check('ON/ON   → Ambulance Tanpa Driver',
  resolveRequestMode({ useAmbulance: true, noDriver: true }).result === 'ambulance_no_driver');
check('matrix labels (id-ID) present',
  resolveRequestMode({ useAmbulance: true, noDriver: true }).label === 'Ambulance Tanpa Driver'
  && resolveRequestMode({}).label === 'Driver + Kendaraan');

/* ── Context hint rule (Feature 10) ───────────────────────────────────── */
console.log('\n[Context hint]');
check('hint only when BOTH active', resolveRequestMode({ useAmbulance: true, noDriver: true }).showContextHint === true);
check('hint OFF when only ambulance', resolveRequestMode({ useAmbulance: true, noDriver: false }).showContextHint === false);
check('hint OFF when only no-driver', resolveRequestMode({ useAmbulance: false, noDriver: true }).showContextHint === false);
check('hint OFF when neither', resolveRequestMode({}).showContextHint === false);
check('hint copy is correct', REQUEST_CONTEXT_HINT === 'Ambulance akan digunakan tanpa penugasan driver.');

/* ── Card visibility (Feature 7) ──────────────────────────────────────── */
console.log('\n[Card visibility]');
check('medical → both cards visible', JSON.stringify(requestModeVisibility(true)) === JSON.stringify({ ambulance: true, noDriver: true }));
check('normal → Tanpa Driver only', JSON.stringify(requestModeVisibility(false)) === JSON.stringify({ ambulance: false, noDriver: true }));

/* ── Policy context mapping (no dispatch logic duplicated) ────────────── */
console.log('\n[Policy context mapping]');
check('toggles → { medicalMode, driverOptional }',
  JSON.stringify(buildRequestPolicyContext({ useAmbulance: true, noDriver: true })) === JSON.stringify({ medicalMode: true, driverOptional: true }));
check('defaults to all-false', JSON.stringify(buildRequestPolicyContext()) === JSON.stringify({ medicalMode: false, driverOptional: false }));

// The mapping must produce the SAME dispatch the Policy Engine yields — i.e. the
// matrix is real, computed by the engine (this module only labels it).
const drivers = [{ id: 'd1', name: 'Andi', status: 'Aktif', active: true }];
const vehicles = [
  { id: 'v1', name: 'Innova', active: true },
  { id: 'vamb', name: 'Ambulance PBSI', active: true },
];
function dispatch(useAmbulance, noDriver) {
  const ctx = buildRequestPolicyContext({ useAmbulance, noDriver });
  const out = applyDispatchPolicy({ drivers, vehicles, context: ctx });
  return { vehicles: out.vehicles.map((v) => v.id), driverSkipped: out.driverSkipped };
}
console.log('\n[Matrix → real Policy Engine dispatch]');
check('OFF/OFF → normal fleet, driver kept', JSON.stringify(dispatch(false, false)) === JSON.stringify({ vehicles: ['v1'], driverSkipped: false }));
check('ON/OFF  → ambulance pool, driver kept', JSON.stringify(dispatch(true, false)) === JSON.stringify({ vehicles: ['vamb'], driverSkipped: false }));
check('OFF/ON  → normal fleet, driver skipped', JSON.stringify(dispatch(false, true)) === JSON.stringify({ vehicles: ['v1'], driverSkipped: true }));
check('ON/ON   → ambulance pool, driver skipped', JSON.stringify(dispatch(true, true)) === JSON.stringify({ vehicles: ['vamb'], driverSkipped: true }));

/* ── Confirmation sheet copy (Feature 9) ──────────────────────────────── */
console.log('\n[Confirmation sheets]');
const nd = REQUEST_MODE_SHEET[REQUEST_MODE.NO_DRIVER];
check('Tanpa Driver sheet title', nd.title === 'Tanpa Driver');
check('Tanpa Driver sheet body', nd.body === 'Driver tidak akan ditugaskan untuk request ini.');
check('Tanpa Driver buttons (Batal / Aktifkan)', nd.cancel === 'Batal' && nd.confirm === 'Aktifkan');
const amb = REQUEST_MODE_SHEET[REQUEST_MODE.AMBULANCE];
check('Ambulance sheet title', amb.title === 'Gunakan Ambulance');
check('Ambulance sheet body', amb.body === 'Ambulance akan diprioritaskan untuk request ini.');
check('Ambulance buttons (Batal / Gunakan)', amb.cancel === 'Batal' && amb.confirm === 'Gunakan');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
