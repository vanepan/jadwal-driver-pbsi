'use strict';

/* ============================================================
   profile-mirror-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   Investigation summary (functions/src/users/onUserWrite.js read in
   full): fires on /users/{username} (an onValueWritten trigger — not
   directly client-invokable; the underlying write is already gated by
   database.rules.json's users/$username rule). Mirrors into
   /userProfiles/{username} via extractProfile(), which copies ONLY
   PROFILE_FIELDS = ['displayName','role','active','archived','archivedAt']
   from the source record — an ALLOWLIST, not a denylist, so credential
   fields (pin/pinHash) and anything else (telegramChatIds,
   notificationsEnabled, arbitrary junk) are structurally excluded even
   if present on the source record. On deletion (after === null), removes
   the mirror instead of writing something corrupted.

   This is the single most valuable dynamic test in the whole trigger
   group: seed a /users/{u} record containing pinHash/pin/arbitrary junk
   fields directly (bypassing the RTDB rules entirely via the Admin SDK,
   exactly what a real write already gated by those rules would look
   like from this trigger's point of view), invoke the REAL trigger
   handler with a REAL DatabaseEvent shape, and assert the REAL
   Admin-SDK-written mirror contains ONLY the allowlisted fields.

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/profile-mirror-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeChangeEvent } = require('./_lib/fixtures');
  const { onUserWrite } = require('../../src/users/onUserWrite');
  const { db } = require('../../src/config/admin');

  const username = 'phasec-mirror-user';

  try {
    await db.ref(`userProfiles/${username}`).remove();

    console.log('\n=== onUserWrite — credential-field exclusion is STRUCTURAL (allowlist, not denylist) ===');
    await checkAsync('a source record containing pinHash/pin/telegramChatIds/junk mirrors ONLY the allowlisted fields', async () => {
      const sourceRecord = {
        displayName: 'Phase C Mirror User',
        role: 'driver',
        active: true,
        archived: false,
        archivedAt: '2025-01-01T00:00:00.000Z', // RTDB never persists an explicit null-valued key (null === delete), so this must be a real value to actually test the field's inclusion
        pinHash: 'scrypt:16384:8:1:deadbeef:cafebabe',
        pin: '1234', // should NEVER appear, even though it's present on the source
        telegramChatIds: { primary: '555' },
        notificationsEnabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        someTotallyUnexpectedField: 'should never leak either',
      };
      await onUserWrite.run(makeChangeEvent({ params: { username }, before: null, after: sourceRecord }));
      const mirrored = (await db.ref(`userProfiles/${username}`).once('value')).val();
      if (!mirrored) throw new Error('expected a mirrored userProfiles record, got none');
      if ('pinHash' in mirrored) throw new Error(`CREDENTIAL LEAK: pinHash present in userProfiles: ${JSON.stringify(mirrored)}`);
      if ('pin' in mirrored) throw new Error(`CREDENTIAL LEAK: pin present in userProfiles: ${JSON.stringify(mirrored)}`);
      if ('telegramChatIds' in mirrored) throw new Error(`unexpected field leaked into userProfiles: telegramChatIds`);
      if ('notificationsEnabled' in mirrored) throw new Error(`unexpected field leaked into userProfiles: notificationsEnabled`);
      if ('createdAt' in mirrored) throw new Error(`unexpected field leaked into userProfiles: createdAt`);
      if ('someTotallyUnexpectedField' in mirrored) throw new Error(`unexpected field leaked into userProfiles: someTotallyUnexpectedField`);
      const expectedKeys = ['username', 'displayName', 'role', 'active', 'archived', 'archivedAt'].sort();
      const actualKeys = Object.keys(mirrored).sort();
      if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error(`expected exactly ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`);
      }
      if (mirrored.username !== username) throw new Error(`expected username '${username}' injected into the mirror, got '${mirrored.username}'`);
      if (mirrored.displayName !== 'Phase C Mirror User') throw new Error('displayName did not mirror correctly');
      if (mirrored.role !== 'driver') throw new Error('role did not mirror correctly');
      if (mirrored.archivedAt !== '2025-01-01T00:00:00.000Z') throw new Error('archivedAt did not mirror correctly');
    });

    await checkAsync('a source record missing some allowlisted fields mirrors only what is actually present (no defaulted/fabricated values)', async () => {
      const minimalUsername = 'phasec-mirror-minimal';
      await onUserWrite.run(makeChangeEvent({ params: { username: minimalUsername }, before: null, after: { displayName: 'Minimal', role: 'viewer' } }));
      const mirrored = (await db.ref(`userProfiles/${minimalUsername}`).once('value')).val();
      if ('active' in mirrored || 'archived' in mirrored || 'archivedAt' in mirrored) {
        throw new Error(`expected absent fields to stay absent, not fabricated: ${JSON.stringify(mirrored)}`);
      }
      await db.ref(`userProfiles/${minimalUsername}`).remove();
    });

    await checkAsync('deletion (after === null) removes the mirror instead of leaving a corrupted record', async () => {
      await onUserWrite.run(makeChangeEvent({ params: { username }, before: { displayName: 'Phase C Mirror User', role: 'driver' }, after: null }));
      const mirrored = (await db.ref(`userProfiles/${username}`).once('value')).val();
      if (mirrored !== null) throw new Error(`expected the mirror to be removed on source deletion, got ${JSON.stringify(mirrored)}`);
    });
  } finally {
    await db.ref(`userProfiles/${username}`).remove();
    await db.ref('userProfiles/phasec-mirror-minimal').remove();
  }
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[profile-mirror-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
