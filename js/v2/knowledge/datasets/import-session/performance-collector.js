/* ============================================================
   PERFORMANCE-COLLECTOR.JS — Pipeline Observability & Performance
   Hardening (Phase 6.5)

   PURPOSE: the ONE place that turns real, already-happening pipeline work
   into real numbers — progress, throughput, ETA, per-file timing, batch
   metrics, worker health. Before this file existed, dataset-import-
   center.js#renderBatchProgress computed ETA/speed itself, from its own
   transient `st.batchProgress` object (see that file's Part J) — a SECOND,
   UI-owned calculation running alongside the persisted ImportSessionRecord/
   ImportBatchRecord truth, exactly the "duplicate counters, UI-owned
   calculation" pattern this hardening phase audits for.

   THE RULE THIS FILE ENFORCES ON ITSELF: never invent a number. Every
   figure below is either read straight off a PERSISTED record (Import
   Session / Import Batch, both RTDB-backed) or derived from a REAL
   timestamp this module itself recorded at the moment real work started/
   finished (see recordFileTiming/recordSweepTick). A figure with no real
   input returns `null` — callers must render that as "—", never a
   fabricated placeholder (0, 999, a frozen old value).

   TWO KINDS OF DATA HERE, ON PURPOSE:

     1. TAB-LOCAL, real per-file timing (recordFileTiming/getFileTiming/
        computeFileTimingBreakdown, recordSweepTick/getWorkerHealth's sweep
        counters). A browser File object cannot survive a refresh, so only
        the tab that actually ran processOneFile() ever has these real
        timestamps — same architectural fact dataset-import-center.js's own
        `st.batchProgress` already lives with (see its header). This is NOT
        a second source of truth for progress/counts (those stay exactly
        where Phase 2.5/2.6 already put them: the persisted session/batch
        records) — it is real telemetry that only ever existed in this one
        tab's memory, openly presented as such (getBatchPerformanceSnapshot
        returns `null` for any figure that needs it and isn't available).

     2. CROSS-TAB, derived from persisted history (getSessionStageTimeline,
        getBatchPerformanceSnapshot's non-timing fields). Works in any tab,
        any time, because it is a pure read over the same RTDB-backed
        version history import-session-repository.js/import-batch-
        repository.js already keep for every appendVersion() call — no new
        write, no new persistence mechanism.

   RESPONSIBILITY: recordFileTiming, getFileTiming, computeFileTimingBreakdown,
   getSessionStageTimeline, getBatchPerformanceSnapshot, recordSweepTick,
   getWorkerHealth.

   DEPENDENCIES: ./import-session-engine.js, ./import-batch-engine.js,
   ./contracts/import-session-contract.js (reads only — this file writes
   nothing to either repository).

   NON-GOALS: does not drive the pipeline (see pipeline-scheduler.js), does
   not decide anything — pure observation over what already happened.
   ============================================================ */

'use strict';

import { getImportSessionHistory, listImportSessions, getImportSession } from './import-session-engine.js';
import {
  getBatch, getBatchHistory, listBatches, BATCH_STATUS,
} from './import-batch-engine.js';
import { isTerminalImportSessionState, isOffRampStage, PIPELINE_STAGE } from './contracts/import-session-contract.js';

/* ── Part 6 — real per-file timing (tab-local; see header) ──────────── */

/** @type {Map<string, object>} sessionId -> real captured marks */
const _fileTimings = new Map();

/**
 * Records the REAL timestamps one call to processOneFile() actually
 * measured. Every field here is either a real `Date.now()` this session's
 * own upload took, or null when that phase genuinely did not happen (e.g. a
 * blocked file never uploads, so uploadStartMs/uploadEndMs stay null — never
 * zero, which would falsely claim an instant upload).
 * @param {string} sessionId
 * @param {{batchId: string|null, sizeBytes: number, fileStartMs: number,
 *   sessionCreatedMs: number|null, uploadStartMs: number|null,
 *   uploadEndMs: number|null, pipelineStartMs: number|null,
 *   pipelineDoneMs: number|null, uploadFailed?: boolean, uploadError?: string|null}} timing
 */
export function recordFileTiming(sessionId, timing) {
  if (!sessionId || typeof timing !== 'object') return;
  _fileTimings.set(sessionId, Object.freeze({ ...timing }));
}

export function getFileTiming(sessionId) {
  return _fileTimings.get(sessionId) || null;
}

function durationMs(startMs, endMs) {
  return (typeof startMs === 'number' && typeof endMs === 'number' && endMs >= startMs)
    ? Math.round(endMs - startMs) : null;
}

/**
 * The real per-file phase breakdown (Part 6 "Per File Timeline"), computed
 * ONLY from timestamps this tab actually captured. A phase this file never
 * went through (e.g. Upload for a blocked file) is `null`, never 0ms.
 * @param {string} sessionId
 */
export function computeFileTimingBreakdown(sessionId) {
  const t = _fileTimings.get(sessionId);
  if (!t) return null;
  return Object.freeze({
    sessionId,
    batchId: t.batchId || null,
    sizeBytes: typeof t.sizeBytes === 'number' ? t.sizeBytes : null,
    // Preparing/Fingerprint/Classification collapse into one real span —
    // this is the honest granularity available: computeSha256() + JSON
    // parse + inferMetadata() + createImportSession() all run back-to-back
    // with no separate resting point between them (see import-session-
    // contract.js's own PIPELINE_STAGE header on why those stages are
    // pre-session and instantaneous). Splitting it further would be
    // fabricating precision this codebase does not actually measure.
    prepareMs: durationMs(t.fileStartMs, t.sessionCreatedMs),
    uploadMs: durationMs(t.uploadStartMs, t.uploadEndMs),
    // Policy Validation -> Knowledge Extraction -> Archive: also one real
    // span — advanceSession() runs them synchronously in a single call with
    // no await between them, so no sub-timestamp exists to split on either.
    pipelineMs: durationMs(t.pipelineStartMs, t.pipelineDoneMs),
    totalMs: durationMs(t.fileStartMs, t.pipelineDoneMs),
    uploadFailed: !!t.uploadFailed,
    uploadError: t.uploadError || null,
  });
}

/* ── Part 6 — real STAGE timeline from persisted version history ────── */

/**
 * The real time this session spent in each pipelineStage it actually
 * occupied — derived from getImportSessionHistory()'s existing, RTDB-backed
 * version array (every appendVersion() already stamps `updatedAt`; nothing
 * new is written here). Works in ANY tab, unlike the per-file timing above.
 * The final entry's `durationMs` is null — it is still resting there (or
 * terminal), not a completed span.
 * @param {string} sessionId
 * @returns {{stage: string, enteredAt: string, durationMs: number|null}[]}
 */
export function getSessionStageTimeline(sessionId) {
  const result = getImportSessionHistory(sessionId);
  if (!result.ok) return [];
  const versions = result.data;
  const timeline = [];
  let lastStage = null;
  let lastAt = null;
  for (const v of versions) {
    if (v.pipelineStage !== lastStage) {
      if (lastStage !== null) {
        timeline.push({
          stage: lastStage,
          enteredAt: lastAt,
          durationMs: durationMs(new Date(lastAt).getTime(), new Date(v.updatedAt).getTime()),
        });
      }
      lastStage = v.pipelineStage;
      lastAt = v.updatedAt;
    }
  }
  if (lastStage !== null) timeline.push({ stage: lastStage, enteredAt: lastAt, durationMs: null });
  return timeline;
}

/* ── Part 5/7 — batch performance snapshot (THE single ETA/speed source) ─ */

/**
 * Real elapsed wall time for a batch, with PAUSED intervals excluded —
 * derived from the batch's own persisted version history (pauseBatch()/
 * resumeBatch() already stamp `updatedAt` on every status change; nothing
 * new is written here). Fixes a real bug in the calculation this replaces
 * (dataset-import-center.js's old Part J): that version measured
 * `Date.now() - startedAtMs` unconditionally, so a paused batch's ETA
 * inflated for as long as it stayed paused, because pause time was never
 * excluded from "elapsed".
 */
function realBatchElapsedMs(batch, history) {
  const now = Date.now();
  const start = new Date(batch.startedAt).getTime();
  const end = batch.finishedAt ? new Date(batch.finishedAt).getTime() : now;
  let pausedMs = 0;
  let pauseStartedAt = null;
  for (const v of history) {
    if (v.status === BATCH_STATUS.PAUSED && pauseStartedAt === null) {
      pauseStartedAt = new Date(v.updatedAt).getTime();
    } else if (v.status !== BATCH_STATUS.PAUSED && pauseStartedAt !== null) {
      pausedMs += new Date(v.updatedAt).getTime() - pauseStartedAt;
      pauseStartedAt = null;
    }
  }
  if (pauseStartedAt !== null) pausedMs += end - pauseStartedAt; // still paused right now
  return Math.max(0, (end - start) - pausedMs);
}

/**
 * THE single snapshot dataset-import-center.js must read for ETA/speed/
 * batch metrics (Parts 1, 2, 3, 5, 7) — never recomputed in the UI. Fields
 * that depend on this tab's own real per-file timing (averageUploadMs,
 * fastestFile, slowestFile) are `null` when this tab never ran the upload
 * (e.g. viewing Batch History for a batch another tab processed) — the
 * caller must render "—", not guess.
 * @param {string|null} batchId
 */
export function getBatchPerformanceSnapshot(batchId) {
  if (!batchId) return null;
  const batchResult = getBatch(batchId);
  if (!batchResult.ok) return null;
  const batch = batchResult.data;
  const historyResult = getBatchHistory(batchId);
  const history = historyResult.ok ? historyResult.data : [batch];

  const sessions = (batch.sessionIds || [])
    .map((id) => getImportSession(id))
    .filter((r) => r.ok)
    .map((r) => r.data);

  const completed = sessions.filter((s) => s.state === 'archived').length;
  const cancelled = sessions.filter((s) => s.state === 'cancelled').length;
  const failedSessions = sessions.filter((s) => s.state === 'failed').length;
  // The batch's own persisted `error` tally also counts files that never got
  // a session at all (blocked — no domain selected, see import-batch-
  // engine.js#recordBatchItem's comment) — real, larger-or-equal figure.
  const failed = Math.max(failedSessions, batch.error);
  // "Resolved" = left the active ladder one way or another (including
  // parked at Awaiting Evidence, which needs a human, not more pipeline
  // time) — the honest denominator for "how many of totalFiles are done
  // being autonomously processed". NOTE (documented limitation): a
  // 'blocked' file (no session created at all) is invisible to this count,
  // which is why `resolved` can under-count by the batch's blocked-file
  // total — see this milestone's report.
  const resolved = sessions.filter((s) => isTerminalImportSessionState(s.state) || isOffRampStage(s.pipelineStage)).length;
  const remaining = Math.max(0, batch.totalFiles - resolved);

  const elapsedMs = realBatchElapsedMs(batch, history);
  const avgMsPerFile = resolved > 0 ? elapsedMs / resolved : null;
  const etaMs = remaining === 0 ? 0 : (avgMsPerFile !== null ? Math.round(avgMsPerFile * remaining) : null);

  // Average throughput SINCE BATCH START, paused time excluded — the best
  // real proxy for "current speed" this architecture can produce. It is NOT
  // instantaneous/live: js/firebase.js#uploadFileToStorage uses Storage's
  // atomic uploadBytes(), not uploadBytesResumable(), so there is no
  // mid-file byte-progress event anywhere in this codebase to measure a
  // true live rate from (see this milestone's report, Part 10/Limitations).
  const bytesPerSecond = (batch.storageUsedBytes > 0 && elapsedMs > 0)
    ? (batch.storageUsedBytes / (elapsedMs / 1000)) : null;

  // Phase 7 (Runtime Hardening, Part 7) — same real ingredients as
  // avgMsPerFile above (resolved count, real elapsed time), just expressed
  // as a rate instead of a duration. null under the same conditions
  // avgMsPerFile is null — no files resolved yet, nothing to divide by.
  const filesPerMinute = avgMsPerFile !== null && avgMsPerFile > 0 ? (60000 / avgMsPerFile) : null;

  const localTimings = sessions.map((s) => computeFileTimingBreakdown(s.id)).filter(Boolean);
  const uploadMsList = localTimings.map((t) => t.uploadMs).filter((n) => typeof n === 'number');
  const totalMsList = localTimings.map((t) => t.totalMs).filter((n) => typeof n === 'number');
  const pipelineMsList = localTimings.map((t) => t.pipelineMs).filter((n) => typeof n === 'number');
  const mean = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const bySpeed = localTimings.filter((t) => typeof t.totalMs === 'number');
  const fastestFile = bySpeed.length ? bySpeed.reduce((a, b) => (a.totalMs < b.totalMs ? a : b)) : null;
  const slowestFile = bySpeed.length ? bySpeed.reduce((a, b) => (a.totalMs > b.totalMs ? a : b)) : null;

  return Object.freeze({
    batchId,
    status: batch.status,
    totalFiles: batch.totalFiles,
    resolved,
    remaining,
    completed,
    failed,
    cancelled,
    elapsedMs,
    etaMs, // null = unknown; 0 = done; render '—' only for null
    bytesUploaded: batch.storageUsedBytes,
    bytesPerSecond, // average since start, paused time excluded — see header
    filesPerMinute, // same real ingredients as etaMs, expressed as a rate
    averageUploadMs: mean(uploadMsList),
    averageKnowledgeMs: mean(pipelineMsList),
    averageTotalMs: mean(totalMsList),
    fastestFile,
    slowestFile,
    sampledFileCount: localTimings.length, // how many files THIS TAB actually timed
  });
}

/* ── Part 8 — Worker Health (real sweepPipeline() ticks, event-driven) ── */

let _sweepCount = 0;
let _lastSweepAt = null;
let _lastSweepDurationMs = null;
let _totalSweepDurationMs = 0;
let _lastSweepSummary = null;

/**
 * Called by the ONE real call site that invokes sweepPipeline() (sarpras-
 * intelligence-center.js's mount-time listener) immediately after each real
 * call, with the real summary sweepPipeline() already returns and the real
 * wall time that one call took. This module never calls sweepPipeline()
 * itself — it only observes. Since sweepPipeline() is explicitly event-
 * driven, never polled (see pipeline-scheduler.js's own header, "NO
 * POLLING"), there is no fixed tick interval to report — "Last Tick"/
 * "Average Tick" below mean "last/average real sweep", not a timer period.
 * @param {{swept: number, completed: number, cancelled: number, failed: number, awaitingEvidence: number, errors: string[]}} summary
 * @param {number} durationMs — real wall-clock time the sweep call took
 */
export function recordSweepTick(summary, elapsedDurationMs) {
  _sweepCount += 1;
  _lastSweepAt = new Date().toISOString();
  _lastSweepDurationMs = Math.round(elapsedDurationMs);
  _totalSweepDurationMs += elapsedDurationMs;
  _lastSweepSummary = summary || null;
}

/**
 * Real worker/scheduler health — Developer Mode only (Part 8). Every field
 * is a fresh read of the persisted sessions/batches, or a real sweep-tick
 * counter recorded above; nothing here is estimated.
 */
export function getWorkerHealth() {
  const sessionsResult = listImportSessions({});
  const sessions = sessionsResult.ok ? sessionsResult.data : [];
  const queueSize = sessions.filter(
    (s) => !isTerminalImportSessionState(s.state) && s.pipelineStage !== PIPELINE_STAGE.AWAITING_EVIDENCE,
  ).length;
  const awaitingEvidence = sessions.filter((s) => s.pipelineStage === PIPELINE_STAGE.AWAITING_EVIDENCE).length;
  const retryCount = sessions.reduce((n, s) => n + (s.pipelineAttempts || 0), 0);

  const batchesResult = listBatches({});
  const batches = batchesResult.ok ? batchesResult.data : [];
  const runningBatches = batches.filter((b) => b.status === BATCH_STATUS.PROCESSING).length;
  const pausedBatches = batches.filter((b) => b.status === BATCH_STATUS.PAUSED).length;
  const cancelledBatches = batches.filter((b) => b.status === BATCH_STATUS.CANCELLED).length;

  return Object.freeze({
    sweepCount: _sweepCount,
    lastSweepAt: _lastSweepAt,
    lastSweepDurationMs: _lastSweepDurationMs,
    averageSweepDurationMs: _sweepCount > 0 ? Math.round(_totalSweepDurationMs / _sweepCount) : null,
    lastSweepSummary: _lastSweepSummary,
    queueSize,
    awaitingEvidence,
    retryCount,
    runningBatches,
    pausedBatches,
    cancelledBatches,
  });
}

/** Test/teardown helper — mirrors the repositories' own resetX() idiom.
 *  Not used by any runtime path. */
export function resetPerformanceCollector() {
  _fileTimings.clear();
  _sweepCount = 0;
  _lastSweepAt = null;
  _lastSweepDurationMs = null;
  _totalSweepDurationMs = 0;
  _lastSweepSummary = null;
}
