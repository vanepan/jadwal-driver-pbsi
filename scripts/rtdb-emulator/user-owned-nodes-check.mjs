/* user-owned-nodes-check.mjs — RTDB Authorization Validation Suite
   (v1.30.7.5, Phase B: Full RTDB Authorization Matrix)

   REAL Firebase Realtime Database emulator test of the "User-owned,
   uid-scoped" node class (migration plan §4): `notifications/$recipientId`,
   `push_subscriptions/$userId` (both read: self-or-admin-family, write:
   fully closed — Cloud-Function-mediated only), and `notification_state/$uid`
   (read AND write: self ONLY — the one node in the whole tree with zero
   admin bypass at all, worth its own explicit labeled check rather than a
   generic cross-user assertion).

   Anonymous is tested explicitly on all three: uid-scoped rules make
   `auth == null` a genuinely distinct branch outcome, unlike a plain
   admin-gated rule where anon and a non-privileged authenticated role
   already evaluate to the identical `false` (proven once in Phase A's
   auth-identity-check.mjs — not re-proven here).

   Run: npm run test:rtdb-emulator (exit 0 = pass; requires the emulator —
   do not run this file directly with plain `node`) */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rulesSource = readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
const firebaseJson = JSON.parse(readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const DB_PORT = firebaseJson.emulators?.database?.port ?? 9000;

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-sarpras-phaseb-userowned',
  database: { rules: rulesSource, host: '127.0.0.1', port: DB_PORT },
});

const asAlice = () => testEnv.authenticatedContext('alice', { role: 'driver' }).database();
const asBob = () => testEnv.authenticatedContext('bob', { role: 'driver' }).database();
const asAdmin = () => testEnv.authenticatedContext('id-admin', { role: 'admin' }).database();
const asAnon = () => testEnv.unauthenticatedContext().database();

try {
  await testEnv.clearDatabase();

  console.log('\n=== notifications/$recipientId  (.read: self || admin/dev/adminEquivalent, .write: false — Cloud-Function-mediated only) ===');
  await checkAsync('alice -> reads her own notifications/alice ALLOWED', () => assertSucceeds(asAlice().ref('notifications/alice').once('value')));
  await checkAsync("alice -> reads bob's notifications/bob DENIED (cross-user)", () => assertFails(asAlice().ref('notifications/bob').once('value')));
  await checkAsync('admin -> reads any notifications/$recipientId ALLOWED', () => assertSucceeds(asAdmin().ref('notifications/bob').once('value')));
  await checkAsync('unauthenticated -> reads notifications/alice DENIED', () => assertFails(asAnon().ref('notifications/alice').once('value')));
  await checkAsync('alice -> writes her OWN notifications/alice DENIED (write is false for everyone, including the recipient themselves)', () => assertFails(asAlice().ref('notifications/alice/someKey').set(true)));
  await checkAsync('admin -> writes notifications/bob DENIED (write is false for everyone, including admin)', () => assertFails(asAdmin().ref('notifications/bob/someKey').set(true)));

  console.log('\n=== push_subscriptions/$userId  (identical shape to notifications — confirms the pattern generalizes) ===');
  await checkAsync('alice -> reads her own push_subscriptions/alice ALLOWED', () => assertSucceeds(asAlice().ref('push_subscriptions/alice').once('value')));
  await checkAsync("alice -> reads bob's push_subscriptions/bob DENIED (cross-user)", () => assertFails(asAlice().ref('push_subscriptions/bob').once('value')));
  await checkAsync('admin -> reads any push_subscriptions/$userId ALLOWED', () => assertSucceeds(asAdmin().ref('push_subscriptions/bob').once('value')));
  await checkAsync('unauthenticated -> reads push_subscriptions/alice DENIED', () => assertFails(asAnon().ref('push_subscriptions/alice').once('value')));
  await checkAsync('admin -> writes push_subscriptions/bob DENIED (registerPushSubscription/unregisterPushSubscription callables are the only write path)', () => assertFails(asAdmin().ref('push_subscriptions/bob/someKey').set(true)));

  console.log('\n=== notification_state/$uid  (.read AND .write: auth.uid === $uid ONLY — zero admin bypass anywhere in this tree) ===');
  await checkAsync('alice -> reads her own notification_state/alice ALLOWED', () => assertSucceeds(asAlice().ref('notification_state/alice').once('value')));
  await checkAsync('alice -> writes her own notification_state/alice ALLOWED', () => assertSucceeds(asAlice().ref('notification_state/alice').set({ lastSeen: 123 })));
  await checkAsync("alice -> reads bob's notification_state/bob DENIED (cross-user)", () => assertFails(asAlice().ref('notification_state/bob').once('value')));
  await checkAsync("alice -> writes bob's notification_state/bob DENIED (cross-user)", () => assertFails(asAlice().ref('notification_state/bob').set({ lastSeen: 123 })));
  await checkAsync("ADMIN CANNOT READ another user's notification_state — the one node in the whole tree with NO admin-family bypass at all", () => assertFails(asAdmin().ref('notification_state/bob').once('value')));
  await checkAsync("ADMIN CANNOT WRITE another user's notification_state — same zero-bypass fact, write side", () => assertFails(asAdmin().ref('notification_state/bob').set({ lastSeen: 123 })));
  await checkAsync('unauthenticated -> reads notification_state/alice DENIED', () => assertFails(asAnon().ref('notification_state/alice').once('value')));
} finally {
  await testEnv.cleanup();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
