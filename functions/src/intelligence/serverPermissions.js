'use strict';

/* ============================================================
   functions/src/intelligence/serverPermissions.js
   — Phase 1 (admin floor) + Phase 3C-PREP (explicit pilot grant)

   Server-side authorization for the Sarpras Intelligence boundary. The
   Functions runtime has no permission-service; a callable checks the
   VERIFIED token claim (request.auth.token.role / .adminEquivalent —
   minted by verifyPin.js) and an authoritative RTDB grant, never anything
   the client sends in the request body.

   THE GATE IS NARROWER THAN "IS AN ADMIN" (Phase 3C-PREP). A caller is
   authorized for Intelligence ONLY when BOTH hold:

     1. ADMIN FLOOR — role === 'admin' OR adminEquivalent === true.
        (Unchanged Phase 1 policy. Necessary, not sufficient.)

     2. EXPLICIT GRANT — 'intelligence.use' present in
        /userPermissionOverrides/{auth.uid}/permissions.

   #2 reuses the EXISTING per-user grant mechanism (Individual Permission
   Assignment, v1.30.9.1): that node is admin/adminEquivalent-WRITE ONLY —
   it has NO self-write branch (see database.rules.json) — so a browser
   cannot self-grant it. It is read here via the Admin SDK (rules bypassed),
   exactly as config.js already reads /feature_flags/intelligence.

   WHY (the Phase 3C blocker): the Intelligence feature flag
   /feature_flags/intelligence/enabled is a single GLOBAL boolean. Without
   #2, flipping it ON would make generateCompletion (→ real OpenAI) callable
   by EVERY admin/adminEquivalent account, not just the pilot. The flag is
   the WHAT; this file is the WHO. They are independent.

   FAIL-CLOSED: no code path returns ok:true on the admin floor alone.
   Missing uid / db, or any RTDB read error → denied.

   'AI sudah tahu permission' is never assumed — this file, on the server,
   is the authority (PART 11).
   ============================================================ */

/** The one capability id that authorizes the Intelligence/OpenAI surface.
 *  Granted per-user via /userPermissionOverrides/{uid}/permissions. */
const INTELLIGENCE_PERMISSION_ID = 'intelligence.use';

/** The existing per-user grant node (Individual Permission Assignment). */
const OVERRIDES_PATH = 'userPermissionOverrides';

/**
 * The ADMIN FLOOR — necessary, never sufficient. Kept as a small pure
 * helper so the callables and the regression tests can assert it in
 * isolation, and so a future edit that tries to reduce canUseIntelligence()
 * back to just this is a visible, testable change.
 * @param {object|undefined} authToken  request.auth.token
 * @returns {boolean}
 */
function meetsAdminFloor(authToken) {
  const role = authToken && typeof authToken.role === 'string' ? authToken.role : null;
  const adminEquivalent = !!(authToken && authToken.adminEquivalent === true);
  return role === 'admin' || adminEquivalent;
}

/**
 * Read the authoritative per-user Intelligence grant. Fail-closed: any
 * missing input or read error → { ok:false, granted:false }.
 * @param {{ ref: Function }} db   Admin SDK database() handle
 * @param {string} uid            request.auth.uid (the /users key + token sub)
 * @returns {Promise<{ ok: boolean, granted: boolean }>}
 */
async function readIntelligenceGrant(db, uid) {
  if (!db || typeof db.ref !== 'function' || !uid || typeof uid !== 'string') {
    return { ok: false, granted: false };
  }
  try {
    const snap = await db.ref(`${OVERRIDES_PATH}/${uid}/permissions`).once('value');
    const raw = snap && typeof snap.val === 'function' ? snap.val() : null;
    const list = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' ? Object.values(raw) : []);
    return { ok: true, granted: list.indexOf(INTELLIGENCE_PERMISSION_ID) !== -1 };
  } catch (err) {
    return { ok: false, granted: false };
  }
}

/**
 * The Sarpras Intelligence server authorization gate. Async — it verifies
 * an authoritative RTDB grant in addition to the token role floor.
 *
 * @param {object|undefined} authToken   request.auth.token (verified claims)
 * @param {{ uid?: string, db?: object }} [ctx]  request.auth.uid + Admin SDK db
 * @returns {Promise<{ ok: boolean, reason: string|null, role: string|null }>}
 */
async function canUseIntelligence(authToken, ctx) {
  const role = authToken && typeof authToken.role === 'string' ? authToken.role : null;
  const uid = ctx && ctx.uid;
  const db = ctx && ctx.db;

  if (!meetsAdminFloor(authToken)) {
    return { ok: false, reason: 'Sarpras Intelligence is limited to administrators in this phase.', role };
  }
  if (!uid || !db) {
    // The callables always pass these; their absence means the gate was
    // invoked without the context it needs to verify the explicit grant.
    return { ok: false, reason: 'Sarpras Intelligence authorization context is unavailable.', role };
  }
  const grant = await readIntelligenceGrant(db, uid);
  if (!grant.ok) {
    return { ok: false, reason: 'Could not verify Sarpras Intelligence authorization.', role };
  }
  if (!grant.granted) {
    return { ok: false, reason: 'This account is not authorized for Sarpras Intelligence (missing intelligence.use grant).', role };
  }
  return { ok: true, reason: null, role: role || 'admin-equivalent' };
}

module.exports = {
  canUseIntelligence,
  meetsAdminFloor,
  readIntelligenceGrant,
  INTELLIGENCE_PERMISSION_ID,
  OVERRIDES_PATH,
};
