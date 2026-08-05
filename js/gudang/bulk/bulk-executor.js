/* ============================================================
   BULK-EXECUTOR.JS — Warehouse Bulk Operations Framework (v1.29.4)

   THE reusable execution pipeline every bulk feature (Bulk Goods Out,
   Bulk Archive, Bulk Edit, Bulk Export, and future Bulk Barcode/QR/Label
   Printing) consumes. This file has ZERO knowledge of Goods Out, Archive,
   Edit, or Export — it only knows "a list of ids" and four callbacks a
   caller supplies (prepare/validate/execute), exactly the way filter-
   engine.js/selection-engine.js stay ignorant of Home/catalog specifics.
   Business logic for what an operation DOES lives one layer up, in
   bulk-goods-out.js/bulk-archive.js/bulk-edit.js/bulk-export.js — never
   here.

   PIPELINE (brief's own words): prepare -> validate -> execute ->
   collectResults -> showSummary. The last two are this module's return
   value and the caller's own render, not separate functions here —
   "collect" is simply accumulating into `results` as execute() settles,
   and "show summary" is the UI layer's job (gudang-bulk-ui.js).

   PARTIAL SUCCESS, ON PURPOSE: unlike every existing Gudang batch engine
   (goods-out-engine.js/goods-in-engine.js/stock-opname-engine.js), which
   is sequential and FAILS FAST at the first error (documented in each of
   those files' own headers as "the closest this layer can get to
   atomicity without a real multi-path RTDB transaction"), this executor
   deliberately keeps going past a failure and collects every outcome —
   the brief is explicit ("100 Items -> 98 Success -> 2 Failed. No
   rollback. No global cancellation."). This is a genuinely NEW tolerance
   for this codebase, not a deviation from an established convention (no
   "collect every failure" convention exists yet to deviate from) — stated
   here plainly, the same way every other engine states its own tradeoffs.

   CONCURRENCY: a small worker pool, not `Promise.all(ids.map(...))`
   (which is unbounded and could fire hundreds of simultaneous Firebase
   writes/reads) and not a fully sequential loop either (which every
   existing engine already uses and which the brief explicitly wants
   improved on for large batches — Phase 8: "never process hundreds of
   requests simultaneously," implying more than one at a time is fine and
   expected). Default concurrency is deliberately low (see
   DEFAULT_CONCURRENCY below) because several existing single-item
   repository calls this executor drives (archiveItem/updateItem) each
   already do their OWN full-catalog read for identity-collision checking
   — a handful in flight balances throughput against not hammering
   Firebase with parallel full-catalog reads.

   REPLACEABLE, PER THE BRIEF (Phase 8/9): `concurrency` is a plain
   parameter, not a hardcoded constant baked into the loop, and the worker
   pool is the ONLY place concurrency is decided — a future swap to a
   real batched multi-path write (js/firebase.js#updateFirebaseData, see
   the v1.29.4 Architecture Report in js/config.js for why that primitive
   was NOT reached for this release) would only ever change what `execute`
   does per id, never this file.
   ============================================================ */

'use strict';

/** Conservative default — see header. Callers may override per operation
 *  (e.g. Bulk Export's per-item "build one row" work is pure/synchronous
 *  and could safely run higher; Bulk Archive/Edit's repository calls stay
 *  at this default). */
export const DEFAULT_CONCURRENCY = 3;

/** Never surface a raw exception (brief: "Never display raw exceptions").
 *  Repository failures already carry a human-readable `.message`
 *  (repository-result.js's `failure(code, message)`) — prefer that over
 *  a JS Error's own stack-trace-flavored `.message` when both exist. */
export function toHumanReason(err) {
  if (err && typeof err === 'object' && typeof err.message === 'string' && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return 'Terjadi kesalahan yang tidak diketahui.';
}

/** Fresh, empty run-state — one instance per bulk modal invocation (never
 *  reused across a Retry; buildRunState() is called again for that). */
export function createRunState(total) {
  return { phase: 'idle', total, processed: 0, startedAtMs: 0 };
}

/**
 * Run one bulk operation end-to-end: validate every id up front (collecting
 * failures, never stopping at the first one — brief: "Never stop at first
 * error"), then execute the valid ids through a bounded worker pool,
 * continuing past per-item failures (partial success).
 *
 * @param {string[]} ids
 * @param {Object} ops
 * @param {(ids:string[]) => Promise<*>} [ops.prepare] - one-time setup, runs
 *   once before validation (e.g. Bulk Edit resolves/creates a Location ONCE
 *   for all items, not per item). Its return value is passed as `ctx` into
 *   every validate()/execute() call.
 * @param {(id:string, ctx:*) => Promise<{ok:boolean, reason?:string}>} [ops.validate]
 *   - per-id pre-check; omit to treat every id as valid.
 * @param {(id:string, ctx:*) => Promise<{ok:boolean, reason?:string}>} ops.execute
 *   - the actual per-id write/action. Rejecting (throwing) is treated the
 *   same as returning {ok:false} — never left uncaught.
 * @param {number} [ops.concurrency]
 * @param {(state:{processed:number, total:number}) => void} [ops.onProgress]
 * @returns {Promise<{success:string[], failed:{id:string,reason:string}[],
 *   skipped:{id:string,reason:string}[], total:number, durationMs:number}>}
 */
export async function runBulkOperation(ids, ops) {
  const { prepare, validate, execute, concurrency = DEFAULT_CONCURRENCY, onProgress } = ops;
  const startedAtMs = Date.now();
  const total = ids.length;

  let ctx;
  try {
    ctx = prepare ? await prepare(ids) : undefined;
  } catch (err) {
    // A prepare() failure (e.g. "couldn't resolve the shared Location")
    // blocks the whole operation — every id fails with the same reason,
    // consistent with the brief's own "group identical failures" instruction
    // rather than reporting a confusing per-id error for a shared cause.
    const reason = toHumanReason(err);
    if (onProgress) onProgress({ processed: total, total });
    return { success: [], failed: ids.map((id) => ({ id, reason })), skipped: [], total, durationMs: Date.now() - startedAtMs };
  }

  const failed = [];
  const toRun = [];
  for (const id of ids) {
    let v;
    try {
      v = validate ? await validate(id, ctx) : { ok: true };
    } catch (err) {
      v = { ok: false, reason: toHumanReason(err) };
    }
    if (v && v.ok) toRun.push(id);
    else failed.push({ id, reason: (v && v.reason) || 'Tidak valid.' });
  }

  const success = [];
  let processed = failed.length; // invalid ids already "processed" for progress purposes
  if (onProgress) onProgress({ processed, total });

  let cursor = 0;
  async function worker() {
    for (;;) {
      const my = cursor++;
      if (my >= toRun.length) return;
      const id = toRun[my];
      try {
        const r = await execute(id, ctx);
        if (r && r.ok === false) failed.push({ id, reason: r.reason || 'Gagal.' });
        else success.push(id);
      } catch (err) {
        failed.push({ id, reason: toHumanReason(err) });
      }
      processed++;
      if (onProgress) onProgress({ processed, total });
    }
  }
  const workerCount = Math.max(1, Math.min(concurrency, toRun.length || 1));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return { success, failed, skipped: [], total, durationMs: Date.now() - startedAtMs };
}

/**
 * Groups identical failure reasons together (brief: "Avoid showing 100
 * identical dialogs") — the Result screen's "View Details" renders this,
 * not a flat per-item list, so 97 "Gagal menyimpan ke server" failures
 * read as one group with a count, not 97 rows.
 * @param {{id:string,reason:string}[]} failed
 * @returns {{reason:string, ids:string[], count:number}[]} sorted by count desc
 */
export function groupFailuresByReason(failed) {
  const byReason = new Map();
  for (const f of failed) {
    if (!byReason.has(f.reason)) byReason.set(f.reason, []);
    byReason.get(f.reason).push(f.id);
  }
  return Array.from(byReason.entries())
    .map(([reason, ids]) => ({ reason, ids, count: ids.length }))
    .sort((a, b) => b.count - a.count);
}
