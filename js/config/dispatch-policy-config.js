/* ============================================================
   DISPATCH-POLICY-CONFIG.JS — Dispatch Intelligence Policy Engine
   (v1.17.2)

   The single source of truth for the BUSINESS-POLICY tunables the Dispatch
   Policy Engine reads: which vehicles are "special" (ambulance), which
   requesters are Akuntes (analytics-excluded), which requesters are Medical
   Pelatnas (may use ambulance), and which driver statuses count as "on leave".

   These are PBSI business rules — not scoring, not analytics math. Centralizing
   them here means the Policy Engine never hard-codes a name or a status, and a
   future settings override merges onto one canonical baseline.

   SHAPE — a frozen DEFAULT plus a mutable ACTIVE layer (mirrors
   dispatch-intelligence-config.js): getPolicyConfig() returns the live config the
   engine reads on every call; setPolicyConfig() takes effect immediately.

   PURE: plain data + merge helpers. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/** Immutable canonical baseline. Every policy literal lives HERE. */
export const DEFAULT_DISPATCH_POLICY_CONFIG = Object.freeze({
  /** A vehicle whose name CONTAINS any of these tokens is a "special" vehicle
   *  (ambulance). Special vehicles are kept out of the normal fleet pool and
   *  out of vehicle analytics unless explicitly requested (Feature 1/2/5). */
  specialVehicleTokens: Object.freeze(['ambulance', 'ambulans']),

  /** A requester whose name MATCHES any of these (normalized, whole-token or
   *  substring) is Akuntes — excluded from every analytics surface but kept in
   *  history/audit/export (Feature 6/7). */
  akuntesRequesterTokens: Object.freeze(['akuntes']),

  /** A requester whose name/unit CONTAINS any of these tokens is a Medical
   *  Pelatnas requester — the only role offered the "Gunakan Ambulance" option
   *  (Feature 2). */
  medicalRequesterTokens: Object.freeze(['medical', 'medis']),

  /** Driver statuses that mean "temporarily unavailable" → filtered as ON_LEAVE
   *  (Feature 3 diagnostics). Mirrors DRIVER_LEAVE_STATUSES in drivers-store.js
   *  but kept here as plain data so the engine stays Firebase-free / pure. */
  leaveStatuses: Object.freeze(['Cuti', 'Sakit', 'Izin']),
});

function cloneConfig(cfg) {
  return {
    specialVehicleTokens: [...cfg.specialVehicleTokens],
    akuntesRequesterTokens: [...cfg.akuntesRequesterTokens],
    medicalRequesterTokens: [...cfg.medicalRequesterTokens],
    leaveStatuses: [...cfg.leaveStatuses],
  };
}

let activeConfig = cloneConfig(DEFAULT_DISPATCH_POLICY_CONFIG);

/** The live policy config the engine reads. Treat as read-only; mutate via setPolicyConfig. */
export function getPolicyConfig() {
  return activeConfig;
}

/**
 * Merge a partial override onto the active config. Only array-of-string token
 * lists are accepted (anything else is ignored) so a bad write can never
 * corrupt the policy rules.
 * @param {Object} partial
 * @returns {Object} the updated active config
 */
export function setPolicyConfig(partial = {}) {
  const next = cloneConfig(activeConfig);
  for (const key of ['specialVehicleTokens', 'akuntesRequesterTokens', 'medicalRequesterTokens', 'leaveStatuses']) {
    const v = partial[key];
    if (Array.isArray(v)) {
      const tokens = v.map((t) => String(t == null ? '' : t)).filter((t) => t !== '');
      if (tokens.length) next[key] = tokens;
    }
  }
  activeConfig = next;
  return activeConfig;
}

/** Reset the active config back to the immutable default (test/teardown helper). */
export function resetPolicyConfig() {
  activeConfig = cloneConfig(DEFAULT_DISPATCH_POLICY_CONFIG);
  return activeConfig;
}
