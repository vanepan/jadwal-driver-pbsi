/* pin-hash-check.mjs — Emergency Credential Security Patch (v1.30.6.2)
   PURE node test, REAL code (not a mirror) — functions/src/auth/pinHash.js
   has no firebase-admin import, so it's directly requireable outside the
   Functions runtime, unlike verifyPin.js/credentialService.js.
   Run: node scripts/pin-hash-check.mjs (exit 0 = pass) */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { hashPin, verifyHash, verifyLegacyPlaintext, parseStoredHash } = require('../functions/src/auth/pinHash.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

console.log('\n1. hashPin() — shape and self-description');
const { hash: hashA } = hashPin('1234');
check('hash is a non-empty string', typeof hashA === 'string' && hashA.length > 0);
check('hash is colon-delimited with 6 parts (algo:N:r:p:salt:hash)', hashA.split(':').length === 6);
check("hash starts with 'scrypt:'", hashA.startsWith('scrypt:'));
const parsed = parseStoredHash(hashA);
check('parseStoredHash() recovers valid params', !!parsed && parsed.N > 0 && parsed.r > 0 && parsed.p > 0);
check('parseStoredHash() recovers a 64-byte derived key', parsed.hash.length === 64);
check('parseStoredHash() recovers a 16-byte salt', parsed.salt.length === 16);

console.log('\n2. hashPin() — no salt reuse');
const { hash: hashB } = hashPin('1234');
check('hashing the same PIN twice produces different hashes (random salt)', hashA !== hashB);
const saltA = parseStoredHash(hashA).salt.toString('hex');
const saltB = parseStoredHash(hashB).salt.toString('hex');
check('the two salts themselves differ', saltA !== saltB);

console.log('\n3. verifyHash() — round-trip correctness');
check('correct PIN verifies against its own hash', verifyHash('1234', hashA));
check('wrong PIN is rejected', !verifyHash('9999', hashA));
check('correct PIN does NOT verify against a hash of a DIFFERENT PIN', !verifyHash('1234', hashPin('5678').hash));
check('empty string PIN is rejected against a real hash', !verifyHash('', hashA));

console.log('\n4. verifyHash() — malformed/foreign input fails closed');
check('verifyHash() against a plain plaintext string (not a real hash) returns false, not a throw', verifyHash('1234', '1234') === false);
check('verifyHash() against garbage returns false', verifyHash('1234', 'not-a-hash-at-all') === false);
check('verifyHash() against empty string returns false', verifyHash('1234', '') === false);
check('verifyHash() against null returns false, not a throw', verifyHash('1234', null) === false);
check('parseStoredHash() rejects non-hex salt/hash segments', parseStoredHash('scrypt:16384:8:1:zzzz:zzzz') === null);
check('parseStoredHash() rejects wrong segment count', parseStoredHash('scrypt:16384:8:1:abcd') === null);
check('parseStoredHash() rejects a foreign algo tag', parseStoredHash('bcrypt:16384:8:1:abcd:abcd') === null);

console.log('\n5. verifyHash() honors the hash\'s OWN stored parameters, not today\'s constants');
// Simulate a hash minted under different (hypothetical future-tuned) cost
// parameters — verifyHash must use what's embedded in the string, not the
// module's current SCRYPT_N/R/P constants, so a future retune never breaks
// existing hashes.
const [, , , , saltHex] = hashA.split(':');
check('a hash string with different N still parses its own N correctly', parseStoredHash(`scrypt:8192:8:1:${saltHex}:${'00'.repeat(64)}`).N === 8192);

console.log('\n6. verifyLegacyPlaintext() — the isolated old check');
check('correct legacy plaintext PIN matches', verifyLegacyPlaintext('1234', '1234'));
check('wrong legacy plaintext PIN does not match', !verifyLegacyPlaintext('1234', '9999'));
check('legacy check against a non-string stored value returns false, not a throw', verifyLegacyPlaintext('1234', undefined) === false);
check('legacy check never accidentally matches a scrypt-format hash string', !verifyLegacyPlaintext('1234', hashA));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
