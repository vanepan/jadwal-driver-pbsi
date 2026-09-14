'use strict';

/* ============================================================
   verifyPin() — custom-authentication entry (v1.11.1.2; Custom-Role-aware
   since v1.30.6 — Permission Runtime Migration, Sub-phase B; credential
   verification delegated to the Credential Service since v1.30.6.2 —
   Emergency Credential Security Patch)

   ACTIVE. Wired into the login flow (js/auth.js → callVerifyPin).

   Flow:
     1. Validate username + PIN format.
     2. Normalize the username exactly like the client (trim →
        lowercase → spaces to dashes) so uid === the /users key.
     3. Read /users/{username} via the Admin SDK.
     4. Reject unknown / inactive / archived users and a failed
        credential check with a GENERIC unauthenticated error
        (no account enumeration). Credential verification —
        hash-path, legacy-plaintext-path, and lazy migration on a
        successful legacy check — is entirely owned by
        credentialService.js; this function no longer touches
        `.pin`/`.pinHash` directly at all.
     5. Resolve the role claim (resolveRoleClaims — see below) and mint a
        custom token: createCustomToken(username, { role, ...extraClaims }).
        The role developer-claim becomes the authoritative role,
        surfaced as request.auth.token.role for RTDB rules.
     6. Return { token, profile } so the client can
        signInWithCustomToken() and hydrate its session cache.

   The submitted PIN is NEVER logged. Neither is any stored hash.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { REGION, SERVICE_VERSION } = require('../config/constants');
const { auth, db } = require('../config/admin');
const { verifyCredential } = require('./credentialService');

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const PIN_RE = /^\d{4}$/;
// Authoritative role vocabulary minted into the token claim (request.auth.token.role).
// MUST stay in sync with js/config/role-registry.js ROLES. Engineering roles are
// first-class here so an Engineering account is NEVER downgraded to 'viewer' at
// token-mint time (which would break workspace routing, sidebar, RTDB role rules
// and every eng.* capability check for that user).
const VALID_ROLES = [
  'admin', 'bidang', 'driver', 'viewer',
  'engineering_coordinator', 'engineering_member',
];

/** Mirror of users.js#normalizeUsername — must stay in sync. */
function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * PURE: given an effective permissions array (from a Custom Role, from
 * Individual Permission Overrides, or the two concatenated — the caller
 * decides), decide which extra claims it earns. Extracted from
 * resolveRoleClaims() specifically so this decision — the security-relevant
 * part — is unit-testable without a live RTDB read (see
 * functions/scripts/agenda-kabid-claim-check.js). Never accepts a role id,
 * a username, or any client-supplied value — only a permissions array
 * already fetched server-side.
 * @param {Array<string>|null|undefined} permissions
 * @returns {{adminEquivalent?: true, agendaKabid?: true}}
 */
function deriveExtraClaims(permissions) {
  const list = Array.isArray(permissions) ? permissions : [];
  const extraClaims = {};
  if (list.includes('system.admin')) extraClaims.adminEquivalent = true;
  if (list.includes('agenda.kabid.view') || list.includes('agenda.kabid.manage')) {
    extraClaims.agendaKabid = true;
  }
  return extraClaims;
}

/**
 * Server-side read of /userPermissionOverrides/{username} (Admin SDK —
 * bypasses Rules, exactly like the Custom Role read below) — the existing,
 * already-deployed Individual Permission Assignment mechanism
 * (js/permission-management/user-permission-overrides-*.js, v1.30.9.1/.5).
 * That mechanism's own rules.js independently forbids 'system.admin' from
 * ever being a legal override (FORBIDDEN_PERMISSION_IDS), so folding this
 * array into deriveExtraClaims() below can never manufacture
 * `adminEquivalent` — only a real Custom Role's own persisted permissions
 * can (and that path has its own, separate, equally-enforced prohibition on
 * ever persisting 'system.admin' — see custom-roles-rules.js). Fails
 * closed: any read error or malformed record resolves to no grants, never
 * an elevated one.
 * @param {string} username
 * @returns {Promise<string[]>}
 */
async function readUserPermissionOverrides(username) {
  try {
    const snap = await db.ref(`userPermissionOverrides/${username}`).once('value');
    const record = snap.val();
    if (!record || typeof record !== 'object') return [];
    return Array.isArray(record.permissions) ? record.permissions : Object.values(record.permissions || {});
  } catch (err) {
    logger.error('[verifyPin] user permission overrides read failed', { username, error: err.message });
    return [];
  }
}

/**
 * Resolve a stored /users/{username}.role value (plus that same account's
 * Individual Permission Overrides) into the token's `role` claim plus any
 * additional claims database.rules.json needs.
 *
 * System Role path (VALID_ROLES, e.g. 'admin'): mints that role verbatim —
 * byte-for-byte the pre-v1.30.6 behavior for `role` itself — but (V1.31
 * C5.3.2) now ALSO derives extra claims from that account's own
 * /userPermissionOverrides, so an existing System Role account (most
 * commonly an admin) can be granted a narrow, additional, individually-
 * scoped capability — e.g. agenda.kabid.view/manage — WITHOUT ever moving
 * them onto a Custom Role and WITHOUT touching their System Role authority.
 * This was the missing half of the mechanism: the override already worked
 * for the client-side permission-service.js resolution, but the *token
 * claim* (the only thing database.rules.json can ever read) never
 * incorporated it — see docs/AGENDA_TODO... C5.3.1's investigation.
 *
 * Custom Role path: a role value outside VALID_ROLES is looked up in
 * /customRoles/{role} (Admin SDK — bypasses rules, one extra read). An
 * archived or nonexistent record downgrades to 'viewer', same fail-safe as
 * before — and, deliberately, does NOT consult overrides in that downgrade
 * case either (a broken/archived role reference must fail all the way
 * closed, not partially recover via an override). A found, active record's
 * own permissions are combined with the SAME account's overrides before
 * a single derivation pass — `adminEquivalent: true` iff EITHER legitimately
 * includes 'system.admin' (only the Custom Role's own list ever can — see
 * readUserPermissionOverrides()'s header), and `agendaKabid: true` iff
 * either includes 'agenda.kabid.view'/'agenda.kabid.manage'. A capability-
 * derived claim, never a role id or name, so renaming a Custom Role in the
 * Role Management UI can never silently break database.rules.json's
 * agendaEvents/agendaTasks/agendaAudit rules (see
 * docs/AGENDA_TODO_PHASE_B1_SECURITY_CORRECTION_v1.31.0.0.md §2.1). Both
 * claims are server-derived only: nothing in `request.data` (the client's
 * callable payload) is ever consulted here, so a client cannot manufacture
 * either claim by sending it in the request body — only the verified
 * account's OWN stored role and OWN stored overrides, both looked up
 * server-side, ever decide them.
 * @param {string} username
 * @param {string} storedRole
 * @returns {Promise<{role: string, extraClaims: Object}>}
 */
async function resolveRoleClaims(username, storedRole) {
  const overridePermissions = await readUserPermissionOverrides(username);

  if (VALID_ROLES.includes(storedRole)) {
    return { role: storedRole, extraClaims: deriveExtraClaims(overridePermissions) };
  }
  let customRole = null;
  try {
    const snap = await db.ref(`customRoles/${storedRole}`).once('value');
    customRole = snap.val();
  } catch (err) {
    logger.error('[verifyPin] custom role read failed', { storedRole, error: err.message });
    // Fail-safe: a read error must never surface as an elevated grant.
    return { role: 'viewer', extraClaims: {} };
  }
  if (!customRole || customRole.archived === true) {
    return { role: 'viewer', extraClaims: {} };
  }
  const customPermissions = Array.isArray(customRole.permissions) ? customRole.permissions : [];
  return { role: storedRole, extraClaims: deriveExtraClaims([...customPermissions, ...overridePermissions]) };
}

const verifyPin = onCall({ region: REGION }, async (request) => {
  const data = request.data || {};
  const username = normalizeUsername(data.username);
  const pin = data.pin == null ? '' : String(data.pin).trim();

  /* ── Format validation ── */
  if (!USERNAME_RE.test(username)) {
    throw new HttpsError('invalid-argument', 'Username harus 3-30 karakter alfanumerik.');
  }
  if (!PIN_RE.test(pin)) {
    throw new HttpsError('invalid-argument', 'PIN harus 4 digit.');
  }

  /* ── Read user record (Admin SDK bypasses rules) ── */
  let user = null;
  try {
    const snap = await db.ref(`users/${username}`).once('value');
    user = snap.val();
  } catch (err) {
    logger.error('[verifyPin] user read failed', { username, error: err.message });
    throw new HttpsError('internal', 'Gagal memverifikasi. Coba lagi.');
  }

  /* ── Generic rejection (no enumeration). PIN never logged. Credential
     check — hash or legacy-plaintext, with lazy migration on a
     successful legacy verify — is entirely owned by credentialService.js. ── */
  const activeAccount = user && user.active !== false && user.archived !== true;
  const { ok } = activeAccount
    ? await verifyCredential(username, user, pin)
    : { ok: false };

  if (!ok) {
    logger.warn('[verifyPin] auth failed', { username, version: SERVICE_VERSION });
    throw new HttpsError('unauthenticated', 'Username atau PIN salah.');
  }

  /* ── Mint custom token with authoritative role claim (+ Custom Role
     extras, v1.30.6) ── */
  const { role, extraClaims } = await resolveRoleClaims(username, user.role);
  let token;
  try {
    token = await auth.createCustomToken(username, { role, ...extraClaims });
  } catch (err) {
    logger.error('[verifyPin] token mint failed', { username, error: err.message });
    throw new HttpsError('internal', 'Gagal membuat sesi. Coba lagi.');
  }

  logger.info('[verifyPin] auth ok', { username, role, extraClaims, version: SERVICE_VERSION });

  return {
    token,
    profile: {
      username,
      name: String(user.displayName || username),
      role,
      active: user.active !== false,
    },
  };
});

module.exports = { verifyPin, resolveRoleClaims, deriveExtraClaims, readUserPermissionOverrides };
