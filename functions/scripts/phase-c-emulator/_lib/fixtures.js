'use strict';

/* ============================================================
   _lib/fixtures.js — RTDB Authorization Validation Suite (v1.30.7.6,
   Phase C: Cloud Function & Server-Side Authorization Validation)

   Shared fixture builders for invoking the REAL functions/src handlers
   directly (no HTTP layer, no Functions emulator — see this session's
   plan for why `.run()` is the correct, verified invocation point).
   Shared for ordinary DRY reasons, plus a real safety benefit: these
   shapes were verified against the actually-installed firebase-functions/
   cors package source this session (not assumed) — centralizing them
   means that verification only has to be right once, not independently
   re-derived (and possibly silently mis-shaped) in 8 different files.

   onCall handlers are invoked as `theExport.run(makeCallableRequest(...))`
   — `.run` is the literal unwrapped handler each functions/src/**.js file
   passes to onCall() (confirmed: functions/node_modules/firebase-functions/
   lib/v2/providers/https.js sets `func.run = withInit(handler)`, and no
   function in this codebase registers an init hook, so withInit is a
   pass-through here).

   RTDB trigger handlers (onValueWritten/onValueCreated) are invoked the
   same way: `theExport.run(makeChangeEvent(...))` / `.run(makeCreatedEvent(...))`.

   onSchedule handlers take no meaningful argument — call `.run()` with
   nothing; every scheduled function in this codebase's async body ignores
   its parameter entirely.

   onRequest handlers have no `.run` shortcut — the export itself IS the
   (req, res) handler. Call `theExport(req, res)` with makeReqRes()'s pair.
   ============================================================ */

/**
 * Builds a CallableRequest<T>-shaped object for invoking an onCall
 * handler's .run() directly. Every onCall handler in this codebase only
 * ever reads request.data, request.auth.uid, and request.auth.token.<claim>
 * (confirmed by reading all 9 onCall source files this session) — no
 * handler reads aud/iss/exp/firebase, so those are safely omitted.
 * @param {{data?: object, uid?: string|null, claims?: object}} opts
 */
function makeCallableRequest({ data = {}, uid = null, claims = {} } = {}) {
  return {
    data,
    auth: uid ? { uid, token: { uid, sub: uid, ...claims }, rawToken: 'phase-c-fake-raw-token' } : undefined,
    rawRequest: { headers: {} },
    acceptsStreaming: false,
  };
}

/**
 * Builds a DatabaseEvent<Change<DataSnapshot>>-shaped object for an
 * onValueWritten trigger's .run(). `before`/`after` are the plain JS
 * values .val() should return — pass null for a create/delete edge.
 * @param {{params?: object, before?: any, after?: any, time?: string}} opts
 */
function makeChangeEvent({ params = {}, before = null, after = null, time } = {}) {
  return {
    params,
    data: { before: { val: () => before }, after: { val: () => after } },
    time: time || new Date().toISOString(),
  };
}

/**
 * Builds a DatabaseEvent<DataSnapshot>-shaped object for an
 * onValueCreated trigger's .run().
 * @param {{params?: object, value?: any, time?: string}} opts
 */
function makeCreatedEvent({ params = {}, value = null, time } = {}) {
  return { params, data: { val: () => value }, time: time || new Date().toISOString() };
}

/**
 * Minimal Express-compatible (req, res) double for invoking an onRequest
 * handler directly. Verified sufficient against the installed `cors`
 * package's actual middleware code (it only reads req.headers and calls
 * res.setHeader/getHeader, then next() — never res.end() off the happy
 * path) and against every req/res access site in the two onRequest
 * handlers this suite tests.
 * @param {{method?: string, headers?: object, body?: object}} opts
 */
function makeReqRes({ method = 'POST', headers = {}, body = {} } = {}) {
  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;

  const req = {
    method,
    headers: lowerHeaders,
    body,
    get(name) { return lowerHeaders[String(name).toLowerCase()]; },
  };

  const res = {
    statusCode: 200,
    headers: {},
    _body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    end() {},
    on() {},
    status(code) { this.statusCode = code; return this; },
    json(o) { this._body = o; return this; },
    send(x) { this._body = x; return this; },
  };

  return { req, res };
}

module.exports = { makeCallableRequest, makeChangeEvent, makeCreatedEvent, makeReqRes };
