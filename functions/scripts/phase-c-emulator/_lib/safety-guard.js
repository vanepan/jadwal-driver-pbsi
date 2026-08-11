'use strict';

/* ============================================================
   _lib/safety-guard.js — RTDB Authorization Validation Suite (v1.30.7.6,
   Phase C: Cloud Function & Server-Side Authorization Validation)

   THE critical precondition for every Phase C test file. Cloud Functions
   use the real firebase-admin Admin SDK, which BYPASSES every RTDB rule
   Phases A/B tested entirely (Admin SDK access is not subject to
   database.rules.json by design). A mistake here means a REAL,
   unprotected write path against production. This is why this ONE file
   is shared (a justified, deliberate exception to this program's
   established "no shared lib, every check file self-contained"
   convention) — a copy-paste drift in a safety GATE is categorically
   higher-stakes than a drift in an ordinary test assertion.

   assertSafeEmulatorOrExit() MUST be the literal first executable
   statement of every test file's main(), and every require() of anything
   under functions/src/** MUST happen INSIDE main(), strictly AFTER that
   await — a top-level require() runs synchronously before any await in
   an async function can matter, so requiring functions/src/config/admin
   (which calls admin.initializeApp() at module load) before this guard
   resolves would defeat the whole point of having a guard at all.

   Four checks, in order, each a hard process.exit(1) (never a bare throw
   a wrapping try/catch could swallow):
     1. FIREBASE_DATABASE_EMULATOR_HOST is set at all.
     2. It matches the bare "host:port" shape the Admin SDK actually reads
        (confirmed against the installed firebase-admin source this
        session — NOT a URL with a scheme) AND the host is loopback.
     3. The port matches firebase.json's emulators.database.port, read
        fresh from disk — a stale/typo'd port fails loudly instead of
        silently talking to some other local service.
     4. A raw node:http canary PUT/GET/DELETE round-trips through the
        emulator's REST endpoint — proves something is actually listening
        and a write actually lands, rather than merely that the address
        string looks local on paper. Uses node:http directly, never the
        Admin SDK, so the guard never depends on the thing it verifies.

   Run: required by every functions/scripts/phase-c-emulator/*.js file —
   never invoked directly. */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CANARY_PATH = '__phase_c_safety_canary__';

function fail(message) {
  console.error(`\n[safety-guard] REFUSING TO PROCEED: ${message}\n`);
  process.exit(1);
}

function readConfiguredEmulatorPort() {
  const firebaseJsonPath = path.join(REPO_ROOT, 'firebase.json');
  let firebaseJson;
  try {
    firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
  } catch (err) {
    fail(`could not read/parse firebase.json at ${firebaseJsonPath}: ${err.message}`);
  }
  const port = firebaseJson?.emulators?.database?.port;
  if (!Number.isInteger(port)) {
    fail(`firebase.json has no emulators.database.port — cannot verify FIREBASE_DATABASE_EMULATOR_HOST against it`);
  }
  return port;
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function runCanary(host, port) {
  const nonce = `phase-c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = JSON.stringify(nonce);

  const putResult = await httpRequest(
    { host, port, path: `/${CANARY_PATH}.json`, method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
    payload,
  ).catch((err) => fail(`canary PUT failed — is the RTDB emulator actually running at ${host}:${port}? (${err.message})`));

  if (putResult.statusCode < 200 || putResult.statusCode >= 300) {
    fail(`canary PUT returned HTTP ${putResult.statusCode} from ${host}:${port} — this does not look like a healthy RTDB emulator`);
  }

  const getResult = await httpRequest({ host, port, path: `/${CANARY_PATH}.json`, method: 'GET' })
    .catch((err) => fail(`canary GET failed: ${err.message}`));

  let roundTripped;
  try { roundTripped = JSON.parse(getResult.body); } catch { roundTripped = undefined; }
  if (roundTripped !== nonce) {
    fail(`canary round-trip mismatch — wrote ${JSON.stringify(nonce)}, read back ${JSON.stringify(roundTripped)} from ${host}:${port}. Refusing to proceed against an environment that doesn't behave like the RTDB emulator.`);
  }

  await httpRequest({ host, port, path: `/${CANARY_PATH}.json`, method: 'DELETE' })
    .catch((err) => fail(`canary cleanup DELETE failed: ${err.message}`));
}

/**
 * Verifies it is safe to let any functions/src module load (which
 * triggers admin.initializeApp()) and perform real Admin SDK RTDB calls.
 * Exits the process with code 1 on ANY failure — never returns false.
 * @returns {Promise<void>} resolves only when it is genuinely safe to proceed.
 */
async function assertSafeEmulatorOrExit() {
  const raw = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!raw) {
    fail('FIREBASE_DATABASE_EMULATOR_HOST is not set. This test suite must run inside `firebase emulators:exec --only database ...` (see run-with-emulator.mjs) — never invoke a phase-c-emulator test file directly with plain `node`.');
  }

  const match = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?$/.exec(raw);
  if (!match) {
    fail(`FIREBASE_DATABASE_EMULATOR_HOST="${raw}" does not look like a loopback "host:port" address. Refusing to let any functions/src module (which calls admin.initializeApp()) load against an address that isn't verifiably local.`);
  }
  const host = match[1] === '[::1]' ? '::1' : match[1];
  const port = Number(match[2]);
  if (!Number.isInteger(port)) {
    fail(`FIREBASE_DATABASE_EMULATOR_HOST="${raw}" has no port component.`);
  }

  const configuredPort = readConfiguredEmulatorPort();
  if (port !== configuredPort) {
    fail(`FIREBASE_DATABASE_EMULATOR_HOST points at port ${port}, but firebase.json's emulators.database.port is ${configuredPort}. Refusing to proceed against a mismatched port.`);
  }

  await runCanary(host, port);

  console.log(`[safety-guard] Verified: FIREBASE_DATABASE_EMULATOR_HOST=${raw} is a real, reachable, loopback RTDB emulator. Safe to proceed.`);
}

module.exports = { assertSafeEmulatorOrExit };
