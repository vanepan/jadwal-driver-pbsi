'use strict';

/* ============================================================
   functions/src/intelligence/serverPermissions.js — Phase 1

   Server-side authorization for the Intelligence boundary. The Functions
   runtime has no permission-service; a callable checks the VERIFIED token
   claim (request.auth.token.role / .adminEquivalent — minted by
   verifyPin.js), never anything the client sends.

   PHASE 1 POLICY (deliberately narrow): the Intelligence surface is an
   admin pilot — exactly like js/config/feature-gates.js#isV2Enabled gates
   the whole V2 client surface to a single admin identity today. So the
   server gate is "role === 'admin' OR adminEquivalent === true". No new
   permission id is introduced (that would also change
   js/config/permission-registry.js + role-permissions.js +
   scripts/role-management-check.mjs's count assertion). Granular
   `intelligence.*` permissions arrive with the phase that widens the
   surface beyond the admin pilot — see
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_1.md.

   "AI sudah tahu permission" is never assumed — this file, on the server,
   is the authority (PART 11).
   ============================================================ */

/**
 * @param {object|undefined} authToken  request.auth.token
 * @returns {{ ok: boolean, reason: string|null, role: string|null }}
 */
function canUseIntelligence(authToken) {
  const role = authToken && typeof authToken.role === 'string' ? authToken.role : null;
  const adminEquivalent = !!(authToken && authToken.adminEquivalent === true);
  if (role === 'admin' || adminEquivalent) {
    return { ok: true, reason: null, role: role || 'admin-equivalent' };
  }
  return { ok: false, reason: 'Sarpras Intelligence is limited to administrators in this phase.', role };
}

module.exports = { canUseIntelligence };
