/* ============================================================
   FEATURE-GATES.JS — V2 Pilot Access (V2.0.10)

   Single decision point for "who can reach the V2 platform (js/v2/) through
   the live application". Today that surface is exactly one workspace —
   Sarpras Intelligence — but any future V2-backed module reuses this same
   resolver instead of re-deriving the rule.

   Callers ask isV2Enabled(user); they never inspect role/username directly.
   That indirection is the whole point: the CURRENT rule (role === 'admin' &&
   username === 'evan', mirroring the v1.11.3 Push Pilot allowlist idiom) can
   later become a config-driven allowlist, a /feature_flags/v2 Firebase flag
   (see loadFeatureFlags() in app.js for the existing pattern), or a plain GA
   rollout (return true) — every caller keeps working unchanged.
   ============================================================ */

'use strict';

/** Exact, case-sensitive usernames piloting V2 while it is not GA. */
const V2_PILOT_ALLOWLIST = ['evan'];

/**
 * Whether `user` may reach the V2 platform surface (Sarpras Intelligence and
 * any future V2-backed workspace). Never throws; a missing/malformed user
 * simply has no access.
 * @param {?{role?:string, username?:string}} user
 * @returns {boolean}
 */
export function isV2Enabled(user) {
  if (!user || user.role !== 'admin') return false;
  const username = String(user.username || '').trim();
  return V2_PILOT_ALLOWLIST.includes(username);
}
