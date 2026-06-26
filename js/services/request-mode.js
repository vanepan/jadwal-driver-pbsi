/* ============================================================
   REQUEST-MODE.JS — Request "Mode Penugasan" helpers
   (v1.17.4 — Part B · Request Experience Polish)

   The PURE mapping behind the premium request mode selector (two Apple-style
   option cards: "Tanpa Driver" and "Ambulance"). It does NOT decide dispatch —
   the Dispatch Policy Engine still owns every eligibility rule. This module only:

     • maps the two toggles → the Policy Engine CONTEXT shape (the same
       { medicalMode, driverOptional } requests.js already feeds applyDispatchPolicy),
       so that mapping lives in ONE tested place (no duplicated dispatch logic);
     • labels the four toggle combinations (Feature 8 mode matrix) for the UI hint;
     • declares the confirmation-sheet copy (Feature 9);
     • declares card visibility by requester role (Feature 7).

   PURE: plain data + functions. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/** The two request modes. */
export const REQUEST_MODE = Object.freeze({ AMBULANCE: 'ambulance', NO_DRIVER: 'noDriver' });

/** Apple-style confirmation sheet copy, keyed by mode (Feature 9). */
export const REQUEST_MODE_SHEET = Object.freeze({
  [REQUEST_MODE.AMBULANCE]: Object.freeze({
    title: 'Gunakan Ambulance',
    body: 'Ambulance akan diprioritaskan untuk request ini.',
    confirm: 'Gunakan',
    cancel: 'Batal',
  }),
  [REQUEST_MODE.NO_DRIVER]: Object.freeze({
    title: 'Tanpa Driver',
    body: 'Driver tidak akan ditugaskan untuk request ini.',
    confirm: 'Aktifkan',
    cancel: 'Batal',
  }),
});

/** Subtle info row shown when BOTH modes are active (Feature 10). */
export const REQUEST_CONTEXT_HINT = 'Ambulance akan digunakan tanpa penugasan driver.';

/**
 * Card visibility by requester role (Feature 7). "Tanpa Driver" is available to
 * everyone; "Ambulance" is offered only to a Medical Pelatnas requester.
 * @param {boolean} isMedical
 * @returns {{ambulance:boolean, noDriver:boolean}}
 */
export function requestModeVisibility(isMedical) {
  return { ambulance: !!isMedical, noDriver: true };
}

/**
 * Map the two toggles → the Dispatch Policy Engine context shape. This is the
 * SAME shape requests.js feeds applyDispatchPolicy, centralized so the field
 * names live in one place — the dispatch decision itself stays in the engine.
 * @param {{useAmbulance?:boolean, noDriver?:boolean}} toggles
 * @returns {{medicalMode:boolean, driverOptional:boolean}}
 */
export function buildRequestPolicyContext({ useAmbulance, noDriver } = {}) {
  return { medicalMode: !!useAmbulance, driverOptional: !!noDriver };
}

/**
 * The Feature 8 mode matrix — labels the four combinations for the UI + tests.
 * The actual dispatch RESULT is produced by the Policy Engine from
 * buildRequestPolicyContext(); this only names the outcome.
 *
 *   Ambulance | Tanpa Driver | result               | label
 *   OFF         OFF            driver_vehicle         Driver + Kendaraan
 *   ON          OFF            ambulance_driver       Ambulance + Driver
 *   OFF         ON             vehicle_only           Kendaraan Saja
 *   ON          ON             ambulance_no_driver    Ambulance Tanpa Driver
 *
 * @param {{useAmbulance?:boolean, noDriver?:boolean}} toggles
 * @returns {{result:string, label:string, showContextHint:boolean}}
 */
export function resolveRequestMode({ useAmbulance, noDriver } = {}) {
  const amb = !!useAmbulance;
  const nod = !!noDriver;
  let result, label;
  if (!amb && !nod) { result = 'driver_vehicle'; label = 'Driver + Kendaraan'; }
  else if (amb && !nod) { result = 'ambulance_driver'; label = 'Ambulance + Driver'; }
  else if (!amb && nod) { result = 'vehicle_only'; label = 'Kendaraan Saja'; }
  else { result = 'ambulance_no_driver'; label = 'Ambulance Tanpa Driver'; }
  return { result, label, showContextHint: amb && nod };
}
