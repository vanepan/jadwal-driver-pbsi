/* ============================================================
   WORKER-RUNTIME.JS — Runtime Hardening (Phase 7, Part 3)

   PURPOSE: the ONE place that owns the CPU Worker's lifecycle and offers a
   plain async function per operation — callers never touch postMessage,
   never know whether a Worker actually ran or the main thread did instead.

   SCOPE, DELIBERATELY NARROW (see this milestone's report for the audit
   that decided this): only hashFile() and parseJsonText() exist here.
   Metadata inference, duplicate detection, filename similarity, and
   confidence computation all read live main-thread-only registries
   (Pattern Discovery, Profile Overrides, the file-storage dedup ledger,
   domain/kind registries) that a Worker cannot share without duplicating —
   a real drift risk — so they stay on the main thread exactly as before.

   GRACEFUL EVERYWHERE: no `Worker` global (bare Node, an old browser, a
   restrictive CSP) -> falls back to the exact same computation inline, no
   behavior change, no error. A Worker that fails to start, throws, or
   returns an error for one call -> that ONE call falls back inline; the
   Worker itself is torn down and not retried again this session (a Worker
   that failed once is unlikely to recover, and retrying it per-call would
   just add latency to every subsequent file for no benefit).

   RESPONSIBILITY: hashFile(file), parseJsonText(text).

   DEPENDENCIES: ./cpu-worker.js (the actual Worker script, only ever
   reached via `new Worker(new URL(...))`, never statically imported).

   NAMING, Phase 12.7.0 (Import Pipeline Observability Hardening) — "worker"
   means three genuinely different things across this pipeline, and none of
   them share code or a lifecycle with the other two:
     1. THIS FILE — one real browser Worker thread, offloading two pure CPU
        ops. Lifecycle: created lazily, torn down permanently on any failure.
     2. knowledge/datasets/import-session/pipeline-scheduler.js#sweepPipeline
        — not a thread at all; an event-driven state-machine sweep, whose
        tick counters performance-collector.js reports as "Worker Health".
     3. ui/dataset-import-center.js's per-batch `worker()` — a plain async
        function run N-at-once in a `Promise.all` pool (the concurrency-
        limited upload queue), not a Worker thread and not a scheduler tick.
   Documented here, once, so a future reader does not assume any of the
   three shares infrastructure with the other two — they don't, on purpose.
   ============================================================ */

'use strict';

let _worker = null;
let _workerDisabled = false;
let _requestId = 0;
const _pending = new Map();

function disableWorker(reason) {
  if (_worker) { try { _worker.terminate(); } catch { /* already gone */ } }
  _worker = null;
  _workerDisabled = true;
  if (reason) console.warn('[worker-runtime] Worker offload disabled for this session:', reason);
}

function getWorker() {
  if (_workerDisabled) return null;
  if (_worker) return _worker;
  if (typeof Worker === 'undefined') { _workerDisabled = true; return null; }
  try {
    _worker = new Worker(new URL('./cpu-worker.js', import.meta.url), { type: 'module' });
    _worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      const pending = _pending.get(id);
      if (!pending) return;
      _pending.delete(id);
      if (ok) pending.resolve(result); else pending.reject(new Error(error));
    };
    _worker.onerror = (err) => {
      // A Worker-level error (e.g. the script itself failed to load) fails
      // every still-pending request honestly, then disables the Worker for
      // the rest of this session — callers fall back inline from here on.
      _pending.forEach((p) => p.reject(err instanceof Error ? err : new Error('Worker error')));
      _pending.clear();
      disableWorker(err && err.message ? err.message : 'onerror fired');
    };
  } catch (err) {
    disableWorker(err && err.message ? err.message : String(err));
    return null;
  }
  return _worker;
}

function callWorker(type, payload) {
  const worker = getWorker();
  if (!worker) return null; // caller falls back inline
  const id = (_requestId += 1);
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...payload });
  });
}

async function hashInline(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Real SHA-256 over a file's actual bytes, off the main thread when a
 * Worker is available — identical result either way (verified: see
 * scripts/worker-runtime-check.mjs, which asserts Worker and inline paths
 * produce the SAME digest for the same bytes).
 * @param {File|Blob} file
 * @returns {Promise<string>} lowercase hex digest
 */
export async function hashFile(file) {
  const viaWorker = callWorker('sha256', { file });
  if (!viaWorker) return hashInline(file);
  try {
    return await viaWorker;
  } catch (err) {
    console.error('[worker-runtime] Worker hashing failed, falling back to main thread:', err);
    return hashInline(file);
  }
}

/**
 * JSON.parse, off the main thread when a Worker is available. Never
 * fabricates content on a parse failure — rejects exactly like a bare
 * JSON.parse() would, so an existing `try { ... } catch {}` call site keeps
 * working unchanged.
 * @param {string} text
 * @returns {Promise<*>}
 */
export async function parseJsonText(text) {
  const viaWorker = callWorker('parseJson', { text });
  if (!viaWorker) return JSON.parse(text);
  try {
    return await viaWorker;
  } catch (err) {
    // A genuine parse error must still look like a parse error to the
    // caller (never silently fall back to a different outcome) — but a
    // Worker-infrastructure failure (not a JSON syntax problem) should
    // still get one honest retry inline before giving up.
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      throw parseErr;
    }
  }
}

/** Test/teardown helper — not used by any runtime path. */
export function resetWorkerRuntime() {
  disableWorker(null);
  _workerDisabled = false;
  _pending.clear();
}
