'use strict';

/* ============================================================
   remaining-oncall-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   Investigation summary (functions/src/events/publishEvent.js,
   functions/src/push/callables.js read in full):

     publishEvent — any authenticated caller; `type` restricted to
     CLIENT_PUBLISHABLE = {'comment.added'} so a client cannot forge
     authoritative assignment.* / request.* events (those come only from
     the data-node triggers). `actor` is built from the VERIFIED token
     (auth.uid/auth.token.role), never trusted from the request body —
     tested explicitly by attempting to forge a different actor in the
     payload and confirming the persisted envelope ignores it.

     registerPushSubscription / unregisterPushSubscription — any
     authenticated caller; `userId` is ALWAYS request.auth.uid (there is
     no userId parameter at all, so there is no cross-user path even to
     test — ownership is by construction, same shape as changeMyCredential).
     registerPushSubscription additionally validates deviceId format,
     subscription shape, an endpoint-origin allowlist (abuse guard against
     registering push endpoints from unrecognized services), and enforces
     a device cap (oldest-by-lastSeen pruned beyond PUSH_CONFIG.deviceCap).

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/remaining-oncall-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeCallableRequest } = require('./_lib/fixtures');
  const { publishEvent } = require('../../src/events/publishEvent');
  const { registerPushSubscription, unregisterPushSubscription } = require('../../src/push/callables');
  const { db } = require('../../src/config/admin');

  try {
    console.log('\n=== publishEvent — type allowlist prevents forging authoritative events ===');
    await checkAsync('unauthenticated caller REJECTED', async () => {
      try {
        await publishEvent.run(makeCallableRequest({ data: { type: 'comment.added', entity: { kind: 'request', id: 'r1' } }, uid: null }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync("a client CANNOT forge an authoritative type (e.g. 'assignment.created') — REJECTED", async () => {
      try {
        await publishEvent.run(makeCallableRequest({ data: { type: 'assignment.created', entity: { kind: 'assignment', id: 'a1' } }, uid: 'someone' }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'permission-denied') throw new Error(`expected 'permission-denied', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('missing entity.kind/entity.id REJECTED', async () => {
      try {
        await publishEvent.run(makeCallableRequest({ data: { type: 'comment.added', entity: {} }, uid: 'someone' }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync("actor identity comes from the VERIFIED token, NOT a forged payload field", async () => {
      const result = await publishEvent.run(makeCallableRequest({
        data: {
          type: 'comment.added', entity: { kind: 'request', id: 'phasec-req1' },
          actor: { uid: 'someone-else', role: 'admin' }, // attempted forgery — publishEvent doesn't even read this shape, but confirm the REAL actor wins regardless
        },
        uid: 'real-caller-uid', claims: { role: 'bidang' },
      }));
      const stored = (await db.ref(`events/${result.id}`).once('value')).val();
      if (stored.actor.uid !== 'real-caller-uid') throw new Error(`expected actor.uid 'real-caller-uid' (from the verified token), got '${stored.actor.uid}'`);
      if (stored.actor.role !== 'bidang') throw new Error(`expected actor.role 'bidang' (from the verified token), got '${stored.actor.role}'`);
      await db.ref(`events/${result.id}`).remove();
    });

    console.log('\n=== registerPushSubscription / unregisterPushSubscription — self-uid ONLY by construction (no userId parameter exists at all) ===');
    await checkAsync('unauthenticated caller REJECTED (register)', async () => {
      try {
        await registerPushSubscription.run(makeCallableRequest({ data: { deviceId: 'phasec-device-001', subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } }, uid: null }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('malformed deviceId REJECTED', async () => {
      try {
        await registerPushSubscription.run(makeCallableRequest({ data: { deviceId: 'x', subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } }, uid: 'someone' }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('incomplete subscription (missing keys) REJECTED', async () => {
      try {
        await registerPushSubscription.run(makeCallableRequest({ data: { deviceId: 'phasec-device-001', subscription: { endpoint: 'https://fcm.googleapis.com/x' } }, uid: 'someone' }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('disallowed endpoint origin REJECTED (abuse guard)', async () => {
      try {
        await registerPushSubscription.run(makeCallableRequest({ data: { deviceId: 'phasec-device-001', subscription: { endpoint: 'https://evil.example.com/x', keys: { p256dh: 'a', auth: 'b' } } }, uid: 'someone' }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('valid registration ALLOWED and stamped under the CALLER\'S OWN uid, never a payload-supplied one', async () => {
      const result = await registerPushSubscription.run(makeCallableRequest({
        data: { deviceId: 'phasec-device-001', subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } },
        uid: 'phasec-push-user',
      }));
      if (!result.ok) throw new Error(`expected {ok:true}, got ${JSON.stringify(result)}`);
      const stored = (await db.ref('push_subscriptions/phasec-push-user/phasec-device-001').once('value')).val();
      if (!stored || stored.endpoint !== 'https://fcm.googleapis.com/x') throw new Error(`expected the subscription stored under the caller's own uid, got ${JSON.stringify(stored)}`);
    });
    await checkAsync('unregister removes ONLY the caller\'s own device record', async () => {
      const result = await unregisterPushSubscription.run(makeCallableRequest({ data: { deviceId: 'phasec-device-001' }, uid: 'phasec-push-user' }));
      if (!result.ok) throw new Error(`expected {ok:true}, got ${JSON.stringify(result)}`);
      const stored = (await db.ref('push_subscriptions/phasec-push-user/phasec-device-001').once('value')).val();
      if (stored !== null) throw new Error(`expected the device record to be removed, got ${JSON.stringify(stored)}`);
    });
  } finally {
    await db.ref('push_subscriptions/phasec-push-user').remove();
  }
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[remaining-oncall-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
