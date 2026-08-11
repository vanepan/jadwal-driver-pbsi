'use strict';

/* ============================================================
   credential-service-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation, Tier 1 — highest priority, the actual login mechanism)

   Investigation summary (functions/src/auth/verifyPin.js,
   credentialCallables.js, credentialService.js read in full):

     verifyPin — NO auth required (IS the login mechanism). Validates
     username/PIN format, reads /users/{username} via Admin SDK, delegates
     the credential check to credentialService.verifyCredential(), and on
     success mints a custom token via auth.createCustomToken(username,
     {role, ...extraClaims}). Generic rejection for both unknown user and
     wrong PIN (no account enumeration). Role resolution: a stored role in
     VALID_ROLES mints verbatim; anything else triggers a Custom Role
     lookup (resolveRoleClaims) — archived/missing downgrades to 'viewer',
     an active record with 'system.admin' in its permissions mints
     adminEquivalent:true.

     createUserCredential / resetUserCredential — assertAdmin(): literal
     role==='admin' ONLY, NOT adminEquivalent (confirmed: same asymmetry
     Phase B already found on customRoles.write). Never return pin/hash
     except resetUserCredential's one legitimate plaintext-once case.

     changeMyCredential — self-only BY CONSTRUCTION (target is always
     request.auth.uid, never a payload field, so there is no "wrong
     target" case to test — the function has no parameter that could name
     another account).

   External-boundary stubbing: verifyPin's SUCCESS path calls the REAL
   Firebase Auth Admin SDK (auth.createCustomToken) — FIREBASE_DATABASE_
   EMULATOR_HOST does not redirect Auth SDK calls, and the Auth emulator
   was explicitly not added to this program (user decision). Every
   success-path check stubs auth.createCustomToken for that one assertion
   only, restored in a finally block, exactly like the fetch-stubbing
   already established for Telegram — this exercises the REAL credential-
   verification and role-resolution logic end-to-end; only the final
   token-minting call to Firebase's real Auth service is stubbed.

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/credential-service-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

function stubCreateCustomToken(auth) {
  const real = auth.createCustomToken;
  const calls = [];
  auth.createCustomToken = async (uid, claims) => {
    calls.push({ uid, claims });
    return `phase-c-fake-custom-token-for-${uid}`;
  };
  return { calls, restore: () => { auth.createCustomToken = real; } };
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeCallableRequest } = require('./_lib/fixtures');
  const { verifyPin } = require('../../src/auth/verifyPin');
  const { createUserCredential, resetUserCredential, changeMyCredential } = require('../../src/auth/credentialCallables');
  const { db, auth } = require('../../src/config/admin');
  const { hashPin } = require('../../src/auth/pinHash');

  const TEST_PREFIX = 'phasec';
  const activeUser = `${TEST_PREFIX}-active-user`;
  const inactiveUser = `${TEST_PREFIX}-inactive-user`;
  const archivedUser = `${TEST_PREFIX}-archived-user`;
  const customRoleActiveAdminUser = `${TEST_PREFIX}-customrole-admin-user`;
  const customRoleArchivedUser = `${TEST_PREFIX}-cr-archived-user`;
  const customRoleNoPermUser = `${TEST_PREFIX}-customrole-noperm-user`;
  const changePinUser = `${TEST_PREFIX}-changepin-user`;
  const seededUsers = [activeUser, inactiveUser, archivedUser, customRoleActiveAdminUser, customRoleArchivedUser, customRoleNoPermUser, changePinUser];
  const customRoleActiveAdminId = `${TEST_PREFIX}CustomRoleActiveAdmin`;
  const customRoleArchivedId = `${TEST_PREFIX}CustomRoleArchived`;
  const customRoleNoPermId = `${TEST_PREFIX}CustomRoleNoPerm`;

  try {
    const { hash: activeHash } = hashPin('1234');
    await db.ref(`users/${activeUser}`).set({ pinHash: activeHash, role: 'driver', active: true, displayName: 'Active Driver' });
    await db.ref(`users/${inactiveUser}`).set({ pinHash: activeHash, role: 'driver', active: false, displayName: 'Inactive Driver' });
    await db.ref(`users/${archivedUser}`).set({ pinHash: activeHash, role: 'driver', archived: true, displayName: 'Archived Driver' });

    await db.ref(`customRoles/${customRoleActiveAdminId}`).set({ archived: false, permissions: ['system.admin'] });
    await db.ref(`customRoles/${customRoleArchivedId}`).set({ archived: true, permissions: ['system.admin'] });
    await db.ref(`customRoles/${customRoleNoPermId}`).set({ archived: false, permissions: ['some.other.permission'] });
    await db.ref(`users/${customRoleActiveAdminUser}`).set({ pinHash: activeHash, role: customRoleActiveAdminId, active: true, displayName: 'Custom Admin' });
    await db.ref(`users/${customRoleArchivedUser}`).set({ pinHash: activeHash, role: customRoleArchivedId, active: true, displayName: 'Custom Archived' });
    await db.ref(`users/${customRoleNoPermUser}`).set({ pinHash: activeHash, role: customRoleNoPermId, active: true, displayName: 'Custom No Perm' });

    await db.ref(`users/${changePinUser}`).set({ pinHash: activeHash, role: 'driver', active: true, displayName: 'Change Pin User' });

    console.log('\n=== verifyPin — input validation (no auth required; this IS the login mechanism) ===');
    await checkAsync('malformed username REJECTED', async () => {
      try {
        await verifyPin.run(makeCallableRequest({ data: { username: '$$', pin: '1234' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('malformed PIN (not 4 digits) REJECTED', async () => {
      try {
        await verifyPin.run(makeCallableRequest({ data: { username: activeUser, pin: '12' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });

    console.log('\n=== verifyPin — generic rejection (no account enumeration) ===');
    await checkAsync('unknown username REJECTED with the SAME generic message as a wrong PIN', async () => {
      try {
        await verifyPin.run(makeCallableRequest({ data: { username: `${TEST_PREFIX}-does-not-exist`, pin: '1234' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('correct username, wrong PIN REJECTED', async () => {
      try {
        await verifyPin.run(makeCallableRequest({ data: { username: activeUser, pin: '9999' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('inactive account REJECTED even with the correct PIN', async () => {
      try {
        await verifyPin.run(makeCallableRequest({ data: { username: inactiveUser, pin: '1234' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('archived account REJECTED even with the correct PIN', async () => {
      try {
        await verifyPin.run(makeCallableRequest({ data: { username: archivedUser, pin: '1234' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });

    console.log('\n=== verifyPin — success path + role resolution (auth.createCustomToken stubbed, user-approved) ===');
    {
      const stub = stubCreateCustomToken(auth);
      try {
        await checkAsync('correct credentials on a VALID_ROLES account mints role verbatim, no extra claims', async () => {
          const result = await verifyPin.run(makeCallableRequest({ data: { username: activeUser, pin: '1234' } }));
          if (result.profile.role !== 'driver') throw new Error(`expected profile.role 'driver', got '${result.profile.role}'`);
          const call = stub.calls[stub.calls.length - 1];
          if (call.claims.role !== 'driver') throw new Error(`expected minted role 'driver', got '${call.claims.role}'`);
          if (call.claims.adminEquivalent !== undefined) throw new Error(`expected no adminEquivalent claim, got ${call.claims.adminEquivalent}`);
        });
        await checkAsync('Custom Role, active, system.admin permission → mints adminEquivalent:true', async () => {
          const result = await verifyPin.run(makeCallableRequest({ data: { username: customRoleActiveAdminUser, pin: '1234' } }));
          if (result.profile.role !== customRoleActiveAdminId) throw new Error(`expected profile.role '${customRoleActiveAdminId}', got '${result.profile.role}'`);
          const call = stub.calls[stub.calls.length - 1];
          if (call.claims.adminEquivalent !== true) throw new Error(`expected adminEquivalent:true, got ${call.claims.adminEquivalent}`);
        });
        await checkAsync('Custom Role, ARCHIVED → downgrades to viewer, no adminEquivalent', async () => {
          const result = await verifyPin.run(makeCallableRequest({ data: { username: customRoleArchivedUser, pin: '1234' } }));
          if (result.profile.role !== 'viewer') throw new Error(`expected profile.role 'viewer' (downgrade), got '${result.profile.role}'`);
          const call = stub.calls[stub.calls.length - 1];
          if (call.claims.adminEquivalent !== undefined) throw new Error(`expected no adminEquivalent claim after downgrade, got ${call.claims.adminEquivalent}`);
        });
        await checkAsync("Custom Role, active but WITHOUT system.admin permission → mints role verbatim, no adminEquivalent", async () => {
          const result = await verifyPin.run(makeCallableRequest({ data: { username: customRoleNoPermUser, pin: '1234' } }));
          if (result.profile.role !== customRoleNoPermId) throw new Error(`expected profile.role '${customRoleNoPermId}', got '${result.profile.role}'`);
          const call = stub.calls[stub.calls.length - 1];
          if (call.claims.adminEquivalent !== undefined) throw new Error(`expected no adminEquivalent claim, got ${call.claims.adminEquivalent}`);
        });
      } finally {
        stub.restore();
      }
    }

    console.log('\n=== createUserCredential / resetUserCredential — literal admin ONLY, not adminEquivalent ===');
    await checkAsync('unauthenticated caller REJECTED (createUserCredential)', async () => {
      try {
        await createUserCredential.run(makeCallableRequest({ data: { username: `${TEST_PREFIX}-newuser1`, pin: '1234' }, uid: null }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('adminEquivalent Custom Role REJECTED (createUserCredential — literal admin only, same asymmetry as customRoles.write in Phase B)', async () => {
      try {
        await createUserCredential.run(makeCallableRequest({ data: { username: `${TEST_PREFIX}-newuser2`, pin: '1234' }, uid: 'id-custom-super', claims: { role: 'fasilitas_super', adminEquivalent: true } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'permission-denied') throw new Error(`expected 'permission-denied', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('literal admin ALLOWED to create a credential; the response never contains pin or pinHash', async () => {
      const newUsername = `${TEST_PREFIX}-created-by-admin`;
      const result = await createUserCredential.run(makeCallableRequest({ data: { username: newUsername, pin: '4321' }, uid: 'id-admin', claims: { role: 'admin' } }));
      if (!result.ok) throw new Error(`expected {ok:true}, got ${JSON.stringify(result)}`);
      if ('pin' in result || 'pinHash' in result) throw new Error(`response leaked a credential field: ${JSON.stringify(result)}`);
      const stored = (await db.ref(`users/${newUsername}`).once('value')).val();
      if (typeof stored.pinHash !== 'string' || stored.pinHash.length === 0) throw new Error('expected a real pinHash to be persisted');
      if (stored.pin !== null && stored.pin !== undefined) throw new Error(`expected pin to be null/absent, got ${JSON.stringify(stored.pin)}`);
      await db.ref(`users/${newUsername}`).remove();
    });
    await checkAsync('resetUserCredential (admin, no explicit pin) returns a generated PIN ONCE — the one legitimate plaintext-in-response case', async () => {
      const result = await resetUserCredential.run(makeCallableRequest({ data: { username: activeUser }, uid: 'id-admin', claims: { role: 'admin' } }));
      if (!/^\d{4}$/.test(String(result.pin))) throw new Error(`expected a 4-digit generated pin in the response, got ${JSON.stringify(result)}`);
      const stored = (await db.ref(`users/${activeUser}`).once('value')).val();
      if (stored.pin !== null && stored.pin !== undefined) throw new Error(`expected pin to be null/absent after reset, got ${JSON.stringify(stored.pin)}`);
    });

    console.log('\n=== changeMyCredential — self-only BY CONSTRUCTION (no username parameter exists to target another account) ===');
    await checkAsync('unauthenticated caller REJECTED', async () => {
      try {
        await changeMyCredential.run(makeCallableRequest({ data: { currentPin: '1234', newPin: '5678' }, uid: null }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('wrong currentPin REJECTED, credential unchanged', async () => {
      try {
        await changeMyCredential.run(makeCallableRequest({ data: { currentPin: '0000', newPin: '5678' }, uid: changePinUser }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('correct currentPin ALLOWED, pinHash actually changes in the emulator', async () => {
      const before = (await db.ref(`users/${changePinUser}`).once('value')).val();
      const result = await changeMyCredential.run(makeCallableRequest({ data: { currentPin: '1234', newPin: '5678' }, uid: changePinUser }));
      if (!result.ok) throw new Error(`expected {ok:true}, got ${JSON.stringify(result)}`);
      const after = (await db.ref(`users/${changePinUser}`).once('value')).val();
      if (after.pinHash === before.pinHash) throw new Error('expected pinHash to change after a successful credential change');
    });
  } finally {
    for (const u of seededUsers) await db.ref(`users/${u}`).remove();
    await db.ref(`users/${TEST_PREFIX}-created-by-admin`).remove();
    await db.ref(`customRoles/${customRoleActiveAdminId}`).remove();
    await db.ref(`customRoles/${customRoleArchivedId}`).remove();
    await db.ref(`customRoles/${customRoleNoPermId}`).remove();
  }
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[credential-service-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
