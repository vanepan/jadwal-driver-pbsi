'use strict';

/* ============================================================
   functions/src/intelligence/serverPermissions.js
   — Phase 1 → 3C-PREP → 3C-access-model

   Server-side authorization for the Sarpras Intelligence boundary (the WHO).
   The Functions runtime has NO permission-service and the verified token
   carries only { role, adminEquivalent? } (minted by verifyPin.js) — never a
   permission list, never anything from the request body. So an "admin base
   grant" is expressed here the ONLY way the server can verify it: a role
   check.

   ACCESS MODEL (current product decision): Sarpras Intelligence is a
   capability of the ADMIN role.

     role === 'admin'            → authorized
     adminEquivalent === true    → authorized (see below)
     anything else               → DENIED

   This is byte-for-byte the shape every admin-tier rule in
   database.rules.json already uses
   (`auth.token.role === 'admin' || auth.token.adminEquivalent === true`),
   so Intelligence follows the project's canonical admin authorization
   pattern rather than inventing a second one.

   adminEquivalent: minted by verifyPin.js#resolveRoleClaims() ONLY for a
   Custom Role whose permissions include 'system.admin', and already treated
   as admin-tier by every admin RTDB rule. Authorizing it here keeps
   Intelligence consistent with that existing model — an effective admin is
   an admin everywhere, Intelligence included.

   NOT required: an Individual Permission Assignment / per-user grant. The
   Phase 3C-PREP `/userPermissionOverrides` grant read is REMOVED — the
   product is no longer a single-pilot surface. `INTELLIGENCE_PERMISSION_ID`
   is retained as the capability's NAME (for cross-file consistency and as
   the seam if a future phase makes it grantable to non-admin roles), but it
   is enforced as the admin-role check above.

   WHAT vs WHO: the feature flag /feature_flags/intelligence/enabled is the
   WHAT/WHEN switch (checked separately by generateCompletion). This file is
   the WHO. They are independent — the flag OFF still blocks model execution
   for an authorized admin.

   FAIL-CLOSED: a missing / malformed token → denied.

   'AI sudah tahu permission' is never assumed — this file, on the server,
   is the authority (PART 11).
   ============================================================ */

/** The capability's canonical name. Enforced below as an admin-role check
 *  (the server has no permission list to look it up in); kept as a named
 *  constant for docs + as the seam for future non-admin granularity. */
const INTELLIGENCE_PERMISSION_ID = 'intelligence.use';

/**
 * Whether the verified token is an EFFECTIVE ADMIN — `role === 'admin'` OR
 * `adminEquivalent === true`. Exported so the callables and the regression
 * tests can assert it in isolation.
 * @param {object|undefined} authToken  request.auth.token (verified claims)
 * @returns {boolean}
 */
function isEffectiveAdmin(authToken) {
  const role = authToken && typeof authToken.role === 'string' ? authToken.role : null;
  const adminEquivalent = !!(authToken && authToken.adminEquivalent === true);
  return role === 'admin' || adminEquivalent;
}

/**
 * The Sarpras Intelligence server authorization gate. Synchronous — the
 * decision is made entirely from the verified token claims, no I/O.
 *
 * @param {object|undefined} authToken   request.auth.token (verified claims)
 * @returns {{ ok: boolean, reason: string|null, role: string|null }}
 */
function canUseIntelligence(authToken) {
  const role = authToken && typeof authToken.role === 'string' ? authToken.role : null;
  if (isEffectiveAdmin(authToken)) {
    return { ok: true, reason: null, role: role || 'admin-equivalent' };
  }
  return {
    ok: false,
    reason: 'Sarpras Intelligence is limited to administrators.',
    role,
  };
}

module.exports = {
  canUseIntelligence,
  isEffectiveAdmin,
  INTELLIGENCE_PERMISSION_ID,
};
