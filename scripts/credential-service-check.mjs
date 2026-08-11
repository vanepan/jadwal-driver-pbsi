/* credential-service-check.mjs — Emergency Credential Security Patch (v1.30.6.2)

   PURE node test. functions/src/auth/credentialService.js imports
   ../config/admin (firebase-admin, which calls admin.initializeApp() at
   module load) and cannot be required outside the Functions runtime — the
   same constraint documented for verifyPin.js. This mirrors
   credentialService.js's exact orchestration logic (persistCredential /
   verifyCredential / createCredential / resetCredential / changeCredential)
   against an injected in-memory "database" so writes can be asserted on
   directly, while reusing the REAL functions/src/auth/pinHash.js for every
   crypto operation (that file has no Firebase import, so it IS directly
   requireable — the hashing/verification behavior under test here is the
   actual implementation, not a re-derived copy).

   Run: node scripts/credential-service-check.mjs (exit 0 = pass) */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { hashPin, verifyHash, verifyLegacyPlaintext } = require('../functions/src/auth/pinHash.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/* ── Injected in-memory "database" + write log, standing in for the
   Admin SDK's db.ref(...).update(...)/.once('value'). ────────────────── */
function makeFakeDb(initialUsers = {}) {
  const users = structuredClone(initialUsers);
  const writes = [];
  return {
    users,
    writes,
    async read(username) { return users[username] || null; },
    async update(username, patch) {
      writes.push({ username, patch: { ...patch } });
      users[username] = { ...(users[username] || {}), ...patch };
    },
  };
}

/* ── Mirror of credentialService.js's orchestration, parameterized by a
   fake db instead of the real Admin SDK. ────────────────────────────── */
async function persistCredential(db, username, hash) {
  await db.update(username, { pinHash: hash, pin: null });
}

async function verifyCredentialAs(db, username, userRecord, submittedPin) {
  if (!userRecord) return { ok: false, needsMigration: false };
  if (typeof userRecord.pinHash === 'string' && userRecord.pinHash) {
    return { ok: verifyHash(submittedPin, userRecord.pinHash), needsMigration: false };
  }
  if (typeof userRecord.pin === 'string' && userRecord.pin) {
    const ok = verifyLegacyPlaintext(submittedPin, userRecord.pin);
    if (ok) {
      const { hash } = hashPin(submittedPin);
      await persistCredential(db, username, hash);
    }
    return { ok, needsMigration: ok };
  }
  return { ok: false, needsMigration: false };
}

async function createCredentialAs(db, username, pin) {
  const { hash } = hashPin(pin);
  await persistCredential(db, username, hash);
}

async function resetCredentialAs(db, username, pin = null) {
  const nextPin = pin || String(1000 + Math.floor(Math.random() * 9000)); // mirror's own RNG stand-in; real code uses crypto.randomInt
  const { hash } = hashPin(nextPin);
  await persistCredential(db, username, hash);
  return { pin: nextPin };
}

async function changeCredentialAs(db, username, currentPin, newPin) {
  const userRecord = await db.read(username);
  const { ok } = await verifyCredentialAs(db, username, userRecord, currentPin);
  if (!ok) return { ok: false };
  const { hash } = hashPin(newPin);
  await persistCredential(db, username, hash);
  return { ok: true };
}

/* ── Shared invariant assertion ── */
function everyWritePairsCorrectly(writes) {
  return writes.every((w) => typeof w.patch.pinHash === 'string' && w.patch.pinHash.length > 0 && w.patch.pin === null);
}

console.log('\n1. verifyCredential() — hash path');
{
  const { hash } = hashPin('1234');
  const db = makeFakeDb({ alice: { pinHash: hash } });
  const good = await verifyCredentialAs(db, 'alice', db.users.alice, '1234');
  check('correct PIN verifies against the hash path', good.ok === true);
  check('hash-path success never reports needsMigration', good.needsMigration === false);
  check('hash-path verify writes nothing (no migration needed)', db.writes.length === 0);
  const bad = await verifyCredentialAs(db, 'alice', db.users.alice, '9999');
  check('wrong PIN fails on the hash path', bad.ok === false);
}

console.log('\n2. verifyCredential() — legacy plaintext path + lazy migration');
{
  const db = makeFakeDb({ bob: { pin: '5678' } });
  const result = await verifyCredentialAs(db, 'bob', db.users.bob, '5678');
  check('correct legacy PIN verifies', result.ok === true);
  check('legacy-path success reports needsMigration', result.needsMigration === true);
  check('exactly one migration write happened', db.writes.length === 1);
  check('the migration write targets the right username', db.writes[0].username === 'bob');
  check('post-migration record has pinHash set', typeof db.users.bob.pinHash === 'string' && db.users.bob.pinHash.length > 0);
  check('post-migration record has pin cleared (null)', db.users.bob.pin === null);
  check('the migrated hash actually verifies the same PIN', verifyHash('5678', db.users.bob.pinHash));

  const db2 = makeFakeDb({ carol: { pin: '1111' } });
  const wrong = await verifyCredentialAs(db2, 'carol', db2.users.carol, '2222');
  check('wrong legacy PIN fails', wrong.ok === false);
  check('a FAILED legacy check triggers NO migration write', db2.writes.length === 0);
  check('a failed legacy check never reports needsMigration', wrong.needsMigration === false);
}

console.log('\n3. verifyCredential() — no credential field at all, or no record');
{
  const db = makeFakeDb({ dave: { displayName: 'Dave' } });
  const noCred = await verifyCredentialAs(db, 'dave', db.users.dave, '1234');
  check('a record with neither pin nor pinHash fails closed', noCred.ok === false);
  const noRecord = await verifyCredentialAs(db, 'ghost', null, '1234');
  check('a null record (unknown user) fails closed, not a throw', noRecord.ok === false);
}

console.log('\n4. createCredential() — brand-new user, hash-only from the first write');
{
  const db = makeFakeDb({});
  await createCredentialAs(db, 'erin', '3333');
  check('exactly one write happened', db.writes.length === 1);
  check('the new record has pinHash set', typeof db.users.erin.pinHash === 'string');
  check('the new record has pin explicitly null, never simply absent-but-writable-later', db.users.erin.pin === null);
  check('the hash verifies the PIN that was set', verifyHash('3333', db.users.erin.pinHash));
}

console.log('\n5. resetCredential() — admin authority, explicit or generated PIN');
{
  const db = makeFakeDb({ frank: { pinHash: hashPin('0000').hash } });
  const explicit = await resetCredentialAs(db, 'frank', '4444');
  check('an explicit reset PIN is honored and returned', explicit.pin === '4444');
  check('the old hash no longer verifies after reset', !verifyHash('0000', db.users.frank.pinHash));
  check('the new hash verifies the explicit reset PIN', verifyHash('4444', db.users.frank.pinHash));

  const db2 = makeFakeDb({ grace: { pin: '9999' } }); // legacy plaintext user, never logged in since migration
  const generated = await resetCredentialAs(db2, 'grace');
  check('an omitted PIN generates a 4-digit numeric PIN', /^\d{4}$/.test(generated.pin));
  check('reset on a legacy-plaintext user clears the old plaintext field too', db2.users.grace.pin === null);
  check('reset on a legacy-plaintext user leaves a working hash', verifyHash(generated.pin, db2.users.grace.pinHash));
}

console.log('\n6. changeCredential() — self-service, proof of current PIN required');
{
  const db = makeFakeDb({ heidi: { pinHash: hashPin('1212').hash } });
  const wrongProof = await changeCredentialAs(db, 'heidi', '0000', '3434');
  check('changeCredential rejects when currentPin is wrong', wrongProof.ok === false);
  check('a rejected change writes nothing', db.writes.length === 0);
  check('the original credential is untouched after a rejected change', verifyHash('1212', db.users.heidi.pinHash));

  const rightProof = await changeCredentialAs(db, 'heidi', '1212', '3434');
  check('changeCredential succeeds with the correct current PIN', rightProof.ok === true);
  check('the new PIN verifies after a successful change', verifyHash('3434', db.users.heidi.pinHash));
  check('the old PIN no longer verifies after a successful change', !verifyHash('1212', db.users.heidi.pinHash));

  const db2 = makeFakeDb({ ivan: { pin: '6767' } }); // legacy user changing their own PIN
  const legacyChange = await changeCredentialAs(db2, 'ivan', '6767', '8989');
  check('changeCredential works starting from a legacy plaintext record', legacyChange.ok === true);
  check('the record ends up hash-only (no plaintext pin survives a self-service change)', db2.users.ivan.pin === null);
  check('the final hash matches the NEW pin, not a stale migration of the old one', verifyHash('8989', db2.users.ivan.pinHash) && !verifyHash('6767', db2.users.ivan.pinHash));
}

console.log('\n7. STANDING INVARIANT — every persisted write, across all four operations and the migration path, is a paired {pinHash, pin: null}. Never both fields populated, never pinHash alone.');
{
  const allWrites = [];

  const dbA = makeFakeDb({ a1: { pin: '1111' } });
  await verifyCredentialAs(dbA, 'a1', dbA.users.a1, '1111'); // migration write
  allWrites.push(...dbA.writes);

  const dbB = makeFakeDb({});
  await createCredentialAs(dbB, 'b1', '2222');
  allWrites.push(...dbB.writes);

  const dbC = makeFakeDb({ c1: {} });
  await resetCredentialAs(dbC, 'c1', '3333');
  allWrites.push(...dbC.writes);

  const dbD = makeFakeDb({ d1: { pinHash: hashPin('4444').hash } });
  await changeCredentialAs(dbD, 'd1', '4444', '5555');
  allWrites.push(...dbD.writes);

  check(`collected ${allWrites.length} writes across all four operations for inspection`, allWrites.length === 4);
  check('every single write pairs pinHash (truthy) with pin (exactly null) — the standing invariant', everyWritePairsCorrectly(allWrites));
  check('no write ever sets pinHash without also nulling pin', allWrites.every((w) => !('pinHash' in w.patch) || w.patch.pin === null));
  check('no write ever leaves pin as anything other than null when pinHash is set', allWrites.every((w) => w.patch.pin === null));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
