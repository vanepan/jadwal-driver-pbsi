'use strict';

/* ============================================================
   http-functions-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   Investigation summary (functions/src/telegram/proxyEndpoint.js,
   webhookEndpoint.js, functions/src/health.js read in full):

     telegramProxy — DORMANT (not wired to any client). Requires a real
     Firebase ID token (Authorization: Bearer <token>, verified via
     auth.verifyIdToken()). Per explicit user decision, this file tests
     ONLY the rejection paths (wrong method, missing header, malformed
     header, structurally-invalid token). The authenticated-success path
     is a documented, out-of-scope gap — testing it would require the
     Auth emulator (not added to this program) to mint a real valid
     token. The "structurally-invalid token" case deliberately uses a
     non-JWT-shaped string so auth.verifyIdToken() fails LOCAL format
     validation and never attempts to fetch Google's public signing keys
     over the network — the one network call this specific path could
     otherwise make even for a fake token.

     telegramWebhook — authenticates via a Telegram shared-secret header
     (X-Telegram-Bot-Api-Secret-Token), NOT Firebase Auth at all — fully
     testable with no emulator dependency beyond setting the secret as an
     env var (SecretParam.value() reads process.env at runtime, confirmed
     this session). An UNKNOWN command returns 200 without ever reaching
     sendWithRetry (Telegram retry-avoidance — always 200 on an
     authenticated request) — this exercises the full auth gate with zero
     network risk. ONE additional check exercises a KNOWN command
     (/myid) with global.fetch stubbed (restored in a finally block, the
     same user-approved third-party-edge-only stubbing already
     established), proving the full reply pipeline is reached.

     health — deliberately public, no auth, no side effects, no data.
     N/A for authorization dimensions BY DESIGN, not a gap — one smoke
     check confirms it responds correctly.

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/http-functions-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeReqRes } = require('./_lib/fixtures');
  const { telegramProxy } = require('../../src/telegram/proxyEndpoint');
  const { telegramWebhook } = require('../../src/telegram/webhookEndpoint');
  const { health } = require('../../src/health');

  console.log('\n=== telegramProxy — rejection paths only (DORMANT; success path out of scope, see file header) ===');
  await checkAsync('GET (wrong method) -> 405', async () => {
    const { req, res } = makeReqRes({ method: 'GET' });
    await telegramProxy(req, res);
    if (res.statusCode !== 405) throw new Error(`expected 405, got ${res.statusCode}`);
  });
  await checkAsync('POST with no Authorization header -> 401', async () => {
    const { req, res } = makeReqRes({ method: 'POST', body: { chatId: '1', message: 'x' } });
    await telegramProxy(req, res);
    if (res.statusCode !== 401) throw new Error(`expected 401, got ${res.statusCode}`);
  });
  await checkAsync('POST with a malformed Authorization header (not "Bearer ...") -> 401', async () => {
    const { req, res } = makeReqRes({ method: 'POST', headers: { Authorization: 'Basic abc123' }, body: { chatId: '1', message: 'x' } });
    await telegramProxy(req, res);
    if (res.statusCode !== 401) throw new Error(`expected 401, got ${res.statusCode}`);
  });
  await checkAsync('POST with a structurally-invalid token (fails local JWT format validation, no network call) -> 401', async () => {
    const { req, res } = makeReqRes({ method: 'POST', headers: { Authorization: 'Bearer this-is-not-a-jwt-shaped-string' }, body: { chatId: '1', message: 'x' } });
    await telegramProxy(req, res);
    if (res.statusCode !== 401) throw new Error(`expected 401, got ${res.statusCode}`);
  });

  console.log('\n=== telegramWebhook — Telegram shared-secret header (NOT Firebase Auth) ===');
  const realWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const realBotToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'phase-c-test-webhook-secret';
  try {
    await checkAsync('GET (wrong method) -> 405', async () => {
      const { req, res } = makeReqRes({ method: 'GET' });
      await telegramWebhook(req, res);
      if (res.statusCode !== 405) throw new Error(`expected 405, got ${res.statusCode}`);
    });
    await checkAsync('POST with NO secret header -> 401', async () => {
      const { req, res } = makeReqRes({ method: 'POST', body: { message: { text: '/myid', chat: { id: 123 } } } });
      await telegramWebhook(req, res);
      if (res.statusCode !== 401) throw new Error(`expected 401, got ${res.statusCode}`);
    });
    await checkAsync('POST with the WRONG secret header value -> 401', async () => {
      const { req, res } = makeReqRes({ method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' }, body: { message: { text: '/myid', chat: { id: 123 } } } });
      await telegramWebhook(req, res);
      if (res.statusCode !== 401) throw new Error(`expected 401, got ${res.statusCode}`);
    });
    await checkAsync('POST with the CORRECT secret + an UNKNOWN command -> 200, {ok:true}, zero network calls (no reply text -> sendWithRetry never invoked)', async () => {
      const realFetch = global.fetch;
      let fetchCallCount = 0;
      global.fetch = async () => { fetchCallCount += 1; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
      try {
        const { req, res } = makeReqRes({ method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'phase-c-test-webhook-secret' }, body: { message: { text: '/notarealcommand', chat: { id: 123 } } } });
        await telegramWebhook(req, res);
        if (res.statusCode !== 200) throw new Error(`expected 200, got ${res.statusCode}`);
        if (fetchCallCount !== 0) throw new Error(`expected zero network calls for an unrecognized command, got ${fetchCallCount}`);
      } finally {
        global.fetch = realFetch;
      }
    });
    await checkAsync('POST with the CORRECT secret + the KNOWN /myid command reaches the reply pipeline exactly once (network stubbed, user-approved)', async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'phase-c-fake-token';
      const realFetch = global.fetch;
      let fetchCallCount = 0;
      global.fetch = async () => { fetchCallCount += 1; return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) }; };
      try {
        const { req, res } = makeReqRes({ method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'phase-c-test-webhook-secret' }, body: { message: { text: '/myid', chat: { id: 123 } } } });
        await telegramWebhook(req, res);
        if (res.statusCode !== 200) throw new Error(`expected 200, got ${res.statusCode}`);
        if (fetchCallCount !== 1) throw new Error(`expected exactly 1 stubbed send call for a recognized command, got ${fetchCallCount}`);
      } finally {
        global.fetch = realFetch;
        if (realBotToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = realBotToken;
      }
    });
  } finally {
    if (realWebhookSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = realWebhookSecret;
  }

  console.log('\n=== health — deliberately public, no auth, no side effects (by design, not a gap) ===');
  await checkAsync('responds 200 with a status payload, no authentication required', async () => {
    const { req, res } = makeReqRes({ method: 'GET' });
    health(req, res);
    if (res.statusCode !== 200) throw new Error(`expected 200, got ${res.statusCode}`);
    if (!res._body || res._body.status !== 'ok') throw new Error(`expected {status:'ok', ...}, got ${JSON.stringify(res._body)}`);
  });
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[http-functions-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
