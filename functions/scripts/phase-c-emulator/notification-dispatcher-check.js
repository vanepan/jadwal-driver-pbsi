'use strict';

/* ============================================================
   notification-dispatcher-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   Built and run FIRST, alone, before any other Phase C file — mirroring
   the v1.30.7.4 precedent exactly. Investigation (reading
   functions/src/notifications/notifyAdminsOfNewRequest.js in full) found
   that this callable checked ONLY that a caller was authenticated
   (callRequest.auth.uid present) — it never checked the caller's role,
   and never checked that the caller actually owned (created) the
   driver_request whose id they supplied. CONFIRMED against the real
   emulator, then fixed in two iterations:

     iteration 1 (uid-only ownership check) — closed the exploit but
     caused a real regression (admin acting on a request they didn't
     personally create was denied) — STOPPED and reported per protocol,
     not silently patched further.

     iteration 2 (this one) — ALLOW when authenticated AND (role==='admin'
     OR adminEquivalent===true OR the caller IS the request's own
     requesterId). Matches the exact convention every RTDB rule in this
     program already uses (database.rules.json's own
     "auth.token.role === 'admin' || auth.token.adminEquivalent === true"
     idiom) — no canonical shared helper exists in functions/src for this
     (grepped; only verifyPin.js references adminEquivalent, and only to
     MINT it, not check it), so the condition is written inline, matching
     the rules-file idiom rather than inventing a new one.

   Safety design: every DENY-path check deliberately targets a
   driver_request with ZERO admin recipients seeded, so the function's own
   admin fan-out loop has zero iterations even on an (unexpected) ALLOW —
   no network call to Telegram can happen for those checks regardless of
   outcome. Two dedicated "positive pipeline" checks (one legitimate
   requester, one privileged admin) exercise the full send path with
   global.fetch temporarily stubbed (user-approved: stub the third-party
   edge only, never the security logic) — restored in a finally block.

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/notification-dispatcher-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function expectAllow(fn, label) {
  await checkAsync(label, async () => {
    const result = await fn();
    if (!result.ok) throw new Error(`expected {ok:true}, got ${JSON.stringify(result)}`);
  });
}

async function expectDeny(fn, label) {
  await checkAsync(label, async () => {
    try {
      const result = await fn();
      throw new Error(`expected DENY (permission-denied), but the call SUCCEEDED: ${JSON.stringify(result)}`);
    } catch (err) {
      if (err.code !== 'permission-denied') throw new Error(`expected code 'permission-denied', got '${err.code}': ${err.message}`);
    }
  });
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeCallableRequest } = require('./_lib/fixtures');
  const { notifyAdminsOfNewRequest } = require('../../src/notifications/notifyAdminsOfNewRequest');
  const { db } = require('../../src/config/admin');
  const call = (opts) => notifyAdminsOfNewRequest.run(makeCallableRequest(opts));

  const TEST_PREFIX = '__phase_c_test__';
  const reqOwnedByBidang1  = `${TEST_PREFIX}reqOwnedByBidang1`;   // zero admin recipients — safe for every DENY/foreign-ALLOW check
  const reqOwnedByViewer   = `${TEST_PREFIX}reqOwnedByViewer`;    // requesterId === 'viewer-self-uid'
  const reqOwnedByAdmin    = `${TEST_PREFIX}reqOwnedByAdmin`;     // requesterId === 'id-admin'
  const reqOwnedByEquiv    = `${TEST_PREFIX}reqOwnedByEquiv`;     // requesterId === 'id-custom-super'
  const reqForPositivePath = `${TEST_PREFIX}reqForPositivePath`;  // WITH a real (stubbed) admin recipient
  const seededRequestIds = [reqOwnedByBidang1, reqOwnedByViewer, reqOwnedByAdmin, reqOwnedByEquiv, reqForPositivePath];

  try {
    for (const [id, requesterId] of [
      [reqOwnedByBidang1, 'bidang1'],
      [reqOwnedByViewer, 'viewer-self-uid'],
      [reqOwnedByAdmin, 'id-admin'],
      [reqOwnedByEquiv, 'id-custom-super'],
      [reqForPositivePath, 'bidang1'],
    ]) {
      await db.ref(`driver_requests/${id}`).set({
        requesterId, requesterName: `Phase C fixture (${requesterId})`, status: 'pending',
        startDate: '2026-08-10', purpose: 'Phase C notifyAdminsOfNewRequest authorization matrix fixture',
      });
    }

    console.log('\n=== #1 Anonymous — DENY ===');
    await checkAsync('#1: anonymous + any request DENIED (unauthenticated, not permission-denied)', async () => {
      try {
        const result = await call({ data: { requestId: reqOwnedByBidang1 }, uid: null });
        throw new Error(`expected DENY, but SUCCEEDED: ${JSON.stringify(result)}`);
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected code 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });

    console.log('\n=== #2/#3 Viewer — own ALLOW, foreign DENY ===');
    await expectAllow(() => call({ data: { requestId: reqOwnedByViewer }, uid: 'viewer-self-uid', claims: { role: 'viewer' } }),
      '#2: viewer + own request ALLOWED');
    await expectDeny(() => call({ data: { requestId: reqOwnedByBidang1 }, uid: 'a-different-viewer', claims: { role: 'viewer' } }),
      '#3: viewer + foreign request DENIED');

    console.log('\n=== #4/#5 Bidang — own ALLOW, foreign DENY ===');
    await expectAllow(() => call({ data: { requestId: reqOwnedByBidang1 }, uid: 'bidang1', claims: { role: 'bidang' } }),
      '#4: bidang + own request ALLOWED');
    await expectDeny(() => call({ data: { requestId: reqOwnedByViewer }, uid: 'bidang2', claims: { role: 'bidang' } }),
      '#5: bidang + foreign request DENIED (a different bidang, not the owner)');

    console.log('\n=== #6/#7 Admin — own ALLOW, foreign ALLOW (role===\'admin\' bypasses ownership entirely) ===');
    await expectAllow(() => call({ data: { requestId: reqOwnedByAdmin }, uid: 'id-admin', claims: { role: 'admin' } }),
      '#6: admin + own request ALLOWED');
    await expectAllow(() => call({ data: { requestId: reqOwnedByBidang1 }, uid: 'id-admin', claims: { role: 'admin' } }),
      '#7: admin + foreign request ALLOWED (the previously-regressed case, now fixed)');

    console.log('\n=== #8/#9 adminEquivalent Custom Role — own ALLOW, foreign ALLOW — TESTED SEPARATELY FROM role===\'admin\' ===');
    await expectAllow(() => call({ data: { requestId: reqOwnedByEquiv }, uid: 'id-custom-super', claims: { role: 'fasilitas_super', adminEquivalent: true } }),
      "#8: adminEquivalent Custom Role + own request ALLOWED (claims: role='fasilitas_super', adminEquivalent:true — NOT role:'admin')");
    await expectAllow(() => call({ data: { requestId: reqOwnedByBidang1 }, uid: 'id-custom-super', claims: { role: 'fasilitas_super', adminEquivalent: true } }),
      "#9: adminEquivalent Custom Role + foreign request ALLOWED (same claim shape, proves the adminEquivalent branch works independently of role==='admin')");

    console.log('\n=== #10 Unknown/invalid role — foreign DENY ===');
    await expectDeny(() => call({ data: { requestId: reqOwnedByBidang1 }, uid: 'id-custom-basic', claims: { role: 'fasilitas_basic' } }),
      "#10: Custom Role WITHOUT adminEquivalent + foreign request DENIED (an unrecognized role string from this function's point of view, same as Phase A/B's collapsing-principle treatment of a non-equivalent Custom Role)");

    console.log('\n=== #11/#12 Input validation — preserved exactly as before the fix ===');
    await checkAsync('#11: missing requestId REJECTED (invalid-argument, unchanged)', async () => {
      try {
        await call({ data: {}, uid: 'someone' });
        throw new Error('expected rejection, but the call succeeded');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected code 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('#12: non-existent requestId REJECTED (not-found, unchanged)', async () => {
      try {
        await call({ data: { requestId: `${TEST_PREFIX}doesNotExist` }, uid: 'someone' });
        throw new Error('expected rejection, but the call succeeded');
      } catch (err) {
        if (err.code !== 'not-found') throw new Error(`expected code 'not-found', got '${err.code}': ${err.message}`);
      }
    });

    console.log('\n=== Positive pipeline — real send path, network stubbed (user-approved) ===');
    await db.ref(`users/${TEST_PREFIX}admin1`).set({
      role: 'admin', active: true, notificationsEnabled: true,
      telegramChatIds: { primary: '999999' },
    });

    const realFetch = global.fetch;
    const realToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = 'phase-c-fake-token'; // SecretParam.value() reads process.env at runtime
    let fetchCallCount = 0;
    global.fetch = async () => {
      fetchCallCount += 1;
      return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
    };
    try {
      await checkAsync(
        'POSITIVE: legitimate requester (bidang1) reaches the real send path exactly once',
        async () => {
          fetchCallCount = 0;
          const result = await call({ data: { requestId: reqForPositivePath }, uid: 'bidang1', claims: { role: 'bidang' } });
          if (!result.ok || result.sent !== 1) throw new Error(`expected {ok:true, sent:1}, got ${JSON.stringify(result)}`);
          if (fetchCallCount !== 1) throw new Error(`expected exactly 1 stubbed Telegram send call, got ${fetchCallCount}`);
        },
      );
      await checkAsync(
        "POSITIVE: privileged admin (foreign request) reaches the real send path exactly once — adminCount:1, sent:1",
        async () => {
          fetchCallCount = 0;
          const result = await call({ data: { requestId: reqForPositivePath }, uid: 'id-admin', claims: { role: 'admin' } });
          if (!result.ok || result.sent !== 1) throw new Error(`expected {ok:true, sent:1}, got ${JSON.stringify(result)}`);
          if (fetchCallCount !== 1) throw new Error(`expected exactly 1 stubbed Telegram send call, got ${fetchCallCount}`);
        },
      );
    } finally {
      global.fetch = realFetch;
      if (realToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = realToken;
    }
  } finally {
    for (const id of seededRequestIds) await db.ref(`driver_requests/${id}`).remove();
    await db.ref(`users/${TEST_PREFIX}admin1`).remove();
  }
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[notification-dispatcher-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
