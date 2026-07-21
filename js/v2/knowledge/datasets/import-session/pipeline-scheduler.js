/* ============================================================
   PIPELINE-SCHEDULER.JS — Pipeline State Machine & Autonomous Completion
   Hardening (Phase 2.6)

   PURPOSE: the ONE place that decides what happens to an Import Session
   next. Before this file existed, that decision was spread across three
   places that did not agree with each other:

     - processOneFile() in the UI drove a file forward, but ONLY while the
       tab that uploaded it stayed open. A refresh mid-batch orphaned every
       in-flight session permanently: nothing else in the system ever looked
       at a session again.
     - cascadeFromApproved() in the UI drove Approved -> Archived, but only
       when someone clicked something.
     - Advanced Metadata's Save wrote the missing fact and then... stopped.
       The evidence the pipeline had been waiting for arrived, and no engine
       was listening.

   That is why documents got stuck: not because a stage was computed wrong,
   but because NOTHING OWNED THE SESSION once the uploading tab moved on. A
   state machine with no driver is just a diagram.

   THE TERMINAL-STATE GUARANTEE. Every session, on every sweep, is driven as
   far as its REAL evidence allows, and comes to rest in exactly one of four
   places — there are no others, and none of them is "in progress":

     Completed            (Archived — the happy path)
     Cancelled            (its batch was cancelled)
     Failed               (a deterministic, non-recoverable condition, with a
                           real reason — including exhausting MAX_PIPELINE_ATTEMPTS)
     Pending Human Evidence (AWAITING_EVIDENCE — a fact only a human can
                           supply is genuinely missing)

   WHY IT TERMINATES. advanceSession() is a loop, so a single call walks a
   session as far as it can go in one pass — but every iteration either
   performs a strictly-forward transition along a finite ladder, or returns.
   Terminal states are absorbing (the graph gives them no out-edges), and a
   failing automatic step increments a PERSISTED attempt counter that is
   bounded. So the loop cannot cycle, and repeated sweeps converge: once
   every session rests, a sweep performs zero writes.

   NO POLLING. sweepPipeline() is called on real events only — the mount, and
   the Import Session repository's own change notification (which fires on
   RTDB-originated snapshots: initial hydration, and other tabs). A sweep
   that has nothing to do writes nothing, so the event loop settles instead
   of oscillating.

   O(N). One pass over the sessions; each advanceSession() is bounded by the
   ladder's length, which is a constant. No nested scans.

   THE ARCHIVER IS INJECTED, ON PURPOSE. The final step of the pipeline
   (Knowledge Imported -> Archived) has to write an ArchiveRecord, which
   lives in organizational-memory/ — and js/v2/README.md's dependency rule is
   explicit: `knowledge/ ──never depends on──> organizational-memory/`. The
   UI layer is the one layer allowed to see both, which is exactly why
   doArchive() already lives there. So this engine does not import the
   archive; it accepts one (registerArchiver), and dataset-import-center.js
   supplies the real doArchive() at module load. The layering rule is
   preserved, and the scheduler stays independently testable with a stub.

   RESPONSIBILITY: registerArchiver, advanceSession, sweepPipeline,
   cancelImportBatch, PIPELINE_OUTCOME.

   NAMING, Phase 12.7.0 — sweepPipeline()'s tick counters are surfaced by
   performance-collector.js#getWorkerHealth() as "Worker Health". This is
   NOT a Worker thread (see file-storage/worker-runtime.js) and NOT the
   concurrent upload pool (see ui/dataset-import-center.js's `worker()`) —
   it is this file's own event-driven scheduler sweep, named "worker" only
   in that one dashboard label. Three unrelated things, one English word;
   see worker-runtime.js's header for the full disambiguation.

   DEPENDENCIES: ./import-session-engine.js, ./import-batch-engine.js,
   ./contracts/import-session-contract.js, ./metadata-inference-engine.js
   (the AUTO_POPULATE threshold, read — never re-derived).

   NON-GOALS: never fabricates evidence. If a PDF has no human-typed fact,
   this engine does not invent one — it parks the session at AWAITING_EVIDENCE
   and says so. Never approves KNOWLEDGE: every KnowledgeItem it causes still
   lands as DRAFT for a human to promote in Knowledge Center (the real
   organizational gate — see ./contracts/import-session-contract.js's header
   on where the human gate actually lives).
   ============================================================ */

'use strict';

import {
  IMPORT_SESSION_STATE, IMPORT_SESSION_KIND, PIPELINE_STAGE, isTerminalImportSessionState,
} from './contracts/import-session-contract.js';
import {
  listImportSessions, getImportSession, submitImportSessionForReview, approveImportSession,
  markKnowledgeImported, markAutoImported, markAwaitingEvidence, cancelImportSession,
  failImportSession, recordPipelineAttempt, hasContentFacts, markArchived, markUploading,
} from './import-session-engine.js';
import { getBatch, cancelBatch, BATCH_STATUS } from './import-batch-engine.js';
import { AUTO_POPULATE_CONFIDENCE_THRESHOLD } from './metadata-inference-engine.js';

/** The four honest resting places — see this file's header. */
export const PIPELINE_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  AWAITING_EVIDENCE: 'awaiting_evidence',
});

/** How many times an AUTOMATIC advance may fail before the session is moved
 *  to FAILED with the last real error message. Bounded because "retry
 *  forever" is not a terminal state — it is the stuck-forever bug wearing a
 *  different hat. A human may still retry a FAILED session by hand as often
 *  as they like; only the engine gives up. */
export const MAX_PIPELINE_ATTEMPTS = 3;

/** The upload formats this pipeline can actually process. Anything else is a
 *  deterministic, permanent failure — not something to keep retrying, and
 *  emphatically not something to leave sitting under an "Uploading" badge. */
const SUPPORTED_KINDS = Object.freeze([
  IMPORT_SESSION_KIND.PDF, IMPORT_SESSION_KIND.DOCX, IMPORT_SESSION_KIND.JSON, IMPORT_SESSION_KIND.SYNTHETIC,
]);

/* ── the injected archiver (see header) ──────────────────────────────── */

let _archiver = null;

/**
 * The UI layer (the ONE layer allowed to see both knowledge/ and
 * organizational-memory/) supplies the real archive step here.
 *
 * Phase 2.6 HARDENING — the archiver's contract is now deliberately NARROW:
 * it CONSTRUCTS AND WRITES the ArchiveRecord and returns its id. It does not,
 * and must not, touch the Import Session. Previously it also called
 * markArchived() itself, which meant the very last lifecycle transition in the
 * pipeline was still being written by UI code — a real hole in the "the
 * scheduler is the only driver" claim, even though it happened to be reachable
 * only through this callback. The scheduler now performs markArchived() below,
 * from the id the archiver hands back, so EVERY state transition without
 * exception is written here.
 *
 * @param {(session: object) => string|null} fn — writes the ArchiveRecord, returns its id (or null on failure).
 */
export function registerArchiver(fn) {
  if (typeof fn === 'function') _archiver = fn;
}

/* ── the deterministic decision ──────────────────────────────────────── */

/**
 * Whether this session's ADMINISTRATIVE metadata is trustworthy enough to
 * proceed without a human. Two independent ways to satisfy it, and a human's
 * word beats the machine's:
 *   - the inference itself cleared AUTO_POPULATE_CONFIDENCE_THRESHOLD, or
 *   - a human confirmed/corrected the metadata in Advanced Metadata
 *     (metadataConfirmedBy) — at which point the ORIGINAL inference score is
 *     simply no longer the relevant fact.
 * A session with no confidence recorded at all (created directly by an engine
 * or a check script, never through inference) is trusted: there is no
 * low-confidence signal to act on, and inventing one would be fabrication.
 */
function hasTrustedMetadata(session) {
  if (session.metadataConfirmedBy) return true;
  if (typeof session.confidence !== 'number') return true;
  return session.confidence >= AUTO_POPULATE_CONFIDENCE_THRESHOLD;
}

/** A validation error the pipeline can never resolve on its own, no matter
 *  how many times it retries or what a human types. */
function permanentValidationError(session) {
  return (session.validationErrors || []).find((e) => e.code === 'UNSUPPORTED_FORMAT') || null;
}

/** Is the batch this session belongs to cancelled? Read from the PERSISTED
 *  batch record — never a transient in-memory flag, so a cancel made in
 *  another tab (or before a refresh) is just as authoritative as one made
 *  here, a beat ago. */
function batchIsCancelled(session) {
  if (!session.batchId) return false;
  const result = getBatch(session.batchId);
  return result.ok && result.data.status === BATCH_STATUS.CANCELLED;
}

/**
 * The domain this upload was STARTED under, for validateImportSession's
 * DOMAIN_MISMATCH check (a session whose inferred domain drifted from the one
 * the operator selected is a real error, not a warning).
 *
 * The UI used to pass this in as an option — which meant the check only
 * existed while the uploading tab was alive, and vanished on any retry or
 * resumption. It is derived here from the session's own PERSISTED batch
 * instead: same value, same guarantee, but now available to every caller, in
 * every tab, after every refresh. One source of truth, not a parameter someone
 * has to remember to thread through.
 */
function validationOptsFor(session) {
  if (!session.batchId) return {};
  const result = getBatch(session.batchId);
  return result.ok && result.data.domainType ? { expectedDomainType: result.data.domainType } : {};
}

/**
 * Handles ONE failed automatic step: counts it, and converts a persistently
 * failing session into a real FAILED terminal once the bounded retries are
 * exhausted. Returns the outcome to report.
 */
function onAutomaticFailure(session, message) {
  const attempts = (session.pipelineAttempts || 0) + 1;
  recordPipelineAttempt(session.id);
  if (attempts >= MAX_PIPELINE_ATTEMPTS) {
    failImportSession(session.id, message);
    return PIPELINE_OUTCOME.FAILED;
  }
  // Not out of attempts yet — park it honestly. The next real event (a repo
  // change, a human attaching a fact, the next mount) sweeps it again; this
  // is auto-retry without a timer, and without a poll.
  markAwaitingEvidence(session.id);
  return PIPELINE_OUTCOME.AWAITING_EVIDENCE;
}

/**
 * Drives ONE session as far as its real evidence allows, then stops.
 *
 * Deterministic: every branch is decided by a persisted fact on the session
 * (its state, its kind, its validation errors, whether it actually carries
 * content facts, whether its batch was cancelled). No heuristics, no
 * scoring, no AI, and nothing is invented — when evidence is missing, this
 * function's answer is "a human has to supply it", never a guess at what it
 * might have been.
 *
 * Idempotent: calling it on an already-resting session performs no writes.
 *
 * @param {string} sessionId
 * @returns {{ok: boolean, outcome: string|null, sessionId: string, error: string|null}}
 */
export function advanceSession(sessionId) {
  const done = (outcome) => ({ ok: true, outcome, sessionId, error: null });
  const broke = (error) => ({ ok: false, outcome: null, sessionId, error });

  // Bounded by the ladder: each iteration makes exactly one forward move, so
  // this can never spin. The +2 is slack for the terminal write itself.
  for (let step = 0; step < 12; step += 1) {
    const result = getImportSession(sessionId);
    if (!result.ok) return broke(result.error.message);
    const s = result.data;

    /* ── already at rest ─────────────────────────────────────────────── */
    if (s.state === IMPORT_SESSION_STATE.ARCHIVED) return done(PIPELINE_OUTCOME.COMPLETED);
    if (s.state === IMPORT_SESSION_STATE.CANCELLED) return done(PIPELINE_OUTCOME.CANCELLED);
    if (s.state === IMPORT_SESSION_STATE.FAILED) return done(PIPELINE_OUTCOME.FAILED);

    /* ── cancellation beats everything below it ──────────────────────── */
    if (batchIsCancelled(s)) {
      // ...except work that is already done. A session that reached Knowledge
      // Imported produced REAL Knowledge; cancelling its batch must not throw
      // that away, so it is allowed to finish archiving instead (the contract
      // gives KNOWLEDGE_IMPORTED no cancel edge for exactly this reason).
      // "Partial progress is preserved" is a requirement, not a nicety.
      if (s.state !== IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED) {
        const cancelled = cancelImportSession(s.id);
        return cancelled.ok ? done(PIPELINE_OUTCOME.CANCELLED) : broke(cancelled.error.message);
      }
    }

    /* ── the ladder ──────────────────────────────────────────────────── */
    switch (s.state) {
      case IMPORT_SESSION_STATE.UPLOADED: {
        // A format this pipeline cannot process is a permanent, deterministic
        // failure — decided ONCE, here, instead of being resubmitted forever.
        if (!SUPPORTED_KINDS.includes(s.kind)) {
          failImportSession(s.id, `Format "${s.kind}" tidak didukung — dokumen ini tidak dapat diproses.`);
          return done(PIPELINE_OUTCOME.FAILED);
        }
        // Metadata the inference could not classify confidently, and no human
        // has confirmed. Genuinely needs a person: park, don't guess.
        if (!hasTrustedMetadata(s)) {
          markAwaitingEvidence(s.id);
          return done(PIPELINE_OUTCOME.AWAITING_EVIDENCE);
        }
        const submitted = submitImportSessionForReview(s.id, validationOptsFor(s));
        if (!submitted.ok) {
          const fresh = getImportSession(s.id);
          const permanent = fresh.ok ? permanentValidationError(fresh.data) : null;
          if (permanent) {
            failImportSession(s.id, permanent.message);
            return done(PIPELINE_OUTCOME.FAILED);
          }
          // Validation failed for a reason a human can still fix (bad
          // metadata, a missing required field) — that is Pending Human
          // Evidence, not a crash and not a stall.
          markAwaitingEvidence(s.id);
          return done(PIPELINE_OUTCOME.AWAITING_EVIDENCE);
        }
        break; // -> PENDING_REVIEW, keep going
      }

      case IMPORT_SESSION_STATE.PENDING_REVIEW: {
        // THE CONTENT-FACT GATE — the one honest reason this pipeline stops.
        // A PDF/DOCX cannot derive its own facts (no OCR, no AI, by design),
        // so if no human has typed one, there is genuinely nothing to import.
        // Everything else about the file may be perfect; this is still a real
        // gap, and the correct answer is to ask, not to fabricate.
        if (!hasContentFacts(s)) {
          markAwaitingEvidence(s.id);
          return done(PIPELINE_OUTCOME.AWAITING_EVIDENCE);
        }
        // Evidence is complete. Approval here is an ADMINISTRATIVE step —
        // recorded, auditable, attributed — not a request for permission.
        // Asking a human to click "Setujui" on a file whose evidence the
        // engine has already fully verified is asking them to rubber-stamp
        // the engine's own arithmetic. The real human gate is one layer down:
        // the KnowledgeItem this produces lands as DRAFT, and a person
        // promotes it in Knowledge Center. See Part 4 of this milestone.
        const approved = approveImportSession(s.id, {
          approverId: s.uploadedBy || 'pipeline',
          decidedAt: new Date().toISOString(),
          preferenceRationale: 'Diselesaikan otomatis oleh pipeline — bukti deterministik lengkap (fakta konten terverifikasi).',
        });
        if (!approved.ok) return broke(approved.error.message);
        break; // -> APPROVED, keep going
      }

      case IMPORT_SESSION_STATE.APPROVED: {
        if (!hasContentFacts(s)) {
          markAwaitingEvidence(s.id);
          return done(PIPELINE_OUTCOME.AWAITING_EVIDENCE);
        }
        const imported = markKnowledgeImported(s.id);
        if (!imported.ok) {
          return done(onAutomaticFailure(s, `Knowledge Import gagal: ${imported.error.message}`));
        }
        markAutoImported(s.id);
        break; // -> KNOWLEDGE_IMPORTED, keep going
      }

      case IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED: {
        if (!_archiver) {
          // Nobody injected an archiver. Honest failure, not a silent park —
          // this is a wiring bug, and it should look like one.
          return broke('No archiver registered — call registerArchiver() from the UI layer.');
        }
        // The injected archiver only WRITES the ArchiveRecord (it lives in
        // organizational-memory/, which this layer may not import) and hands
        // back its id. The lifecycle transition itself is written HERE — the
        // scheduler owns every state change in this system without exception.
        const archiveRecordId = _archiver(s);
        if (!archiveRecordId) {
          return done(onAutomaticFailure(s, 'Archive gagal — ArchiveRecord tidak dapat ditulis.'));
        }
        const archived = markArchived(s.id, archiveRecordId);
        if (!archived.ok) {
          return done(onAutomaticFailure(s, `Archive gagal: ${archived.error.message}`));
        }
        break; // -> ARCHIVED, loop once more and return COMPLETED
      }

      default:
        return broke(`Unknown import session state "${s.state}".`);
    }
  }
  return broke('advanceSession exceeded its bounded step budget — this indicates a cycle in IMPORT_SESSION_GRAPH.');
}

/**
 * THE HUMAN'S ONE REAL DECISION AT THIS LAYER: "do not import this document."
 *
 * Phase 2.6 HARDENING — this replaces the UI calling rejectImportSession()
 * directly, which was BROKEN in both cases it could actually be reached, and
 * broken in the two worst possible ways:
 *
 *   - A session parked at Pending Review: reject moved it back to Uploaded...
 *     and the very next sweep drove it straight back to Pending Review. The
 *     scheduler silently OVERRODE the human. The row never left the queue.
 *   - A session parked at Uploaded (the low-confidence case): Uploaded ->
 *     Uploaded is not a legal edge, so the call failed with
 *     INVALID_IMPORT_DECISION and the button did nothing at all — no write, no
 *     error, no feedback.
 *
 * The reject edge (Pending Review -> Uploaded) was designed for the old
 * human-review model, where "send it back for revision" meant a person would
 * pick it up again later. In an autonomous pipeline there is no such person:
 * the engine picks it up again, immediately, and finishes what the human just
 * declined. A "no" that the system overturns on the next tick is not a no.
 *
 * So a human's rejection is now what it always meant: TERMINAL. The document
 * is not imported, the session is Cancelled (absorbing — no sweep will ever
 * resurrect it), and the reason records that a person decided so, not a batch.
 *
 * @param {string} sessionId
 * @param {{actor?: string, reason?: string}} [opts]
 */
export function discardImportSession(sessionId, { actor = 'evan', reason = '' } = {}) {
  const detail = reason ? ` — ${reason}` : '';
  return cancelImportSession(sessionId, `Ditolak oleh ${actor}: dokumen ini tidak akan diimpor${detail}.`);
}

/**
 * The UI reports that it is about to push real bytes to Storage.
 *
 * Phase 2.6 HARDENING — the UI used to call markUploading() itself, which made
 * it the only place outside this file that wrote `pipelineStage` directly. The
 * write is legitimate (only the UI holds the File, and only it knows the
 * upload is starting) but the AUTHORITY should not be: routing it through the
 * scheduler keeps the rule exact and checkable — no UI module imports a single
 * lifecycle mutator from the session engine.
 *
 * @param {string} sessionId
 */
export function reportUploadStarted(sessionId) {
  return markUploading(sessionId);
}

/**
 * THE QUEUE SCHEDULER. One O(N) pass over every Import Session, driving each
 * to its terminal/resting state. Idempotent and cheap once converged: a
 * settled session performs zero writes, so the steady-state cost of a sweep
 * is a single list() plus a state read per session.
 *
 * This is what makes a refresh survivable. Sessions left in flight by a
 * closed tab, a crash, or a connection drop are no longer orphaned — the next
 * sweep adopts them and finishes the job, because the scheduler works from
 * the PERSISTED session, not from a File handle that died with the tab.
 *
 * Re-entrancy guarded: the sweep's own writes must never re-enter it (the
 * repository's change notification fires on remote echoes, and a sweep
 * triggering a sweep triggering a sweep is a loop, not a pipeline).
 *
 * @returns {{ok: boolean, swept: number, completed: number, cancelled: number, failed: number, awaitingEvidence: number, errors: string[]}}
 */
let _sweeping = false;

export function sweepPipeline() {
  const summary = {
    ok: true, swept: 0, completed: 0, cancelled: 0, failed: 0, awaitingEvidence: 0, errors: [],
  };
  if (_sweeping) return summary;
  _sweeping = true;
  try {
    const result = listImportSessions({});
    const sessions = result.ok ? result.data : [];
    for (const s of sessions) {
      // Terminal sessions are skipped outright — the cheap path, and the
      // reason a converged sweep costs almost nothing.
      if (isTerminalImportSessionState(s.state)) continue;
      summary.swept += 1;
      const outcome = advanceSession(s.id);
      if (!outcome.ok) { summary.errors.push(`${s.id}: ${outcome.error}`); continue; }
      if (outcome.outcome === PIPELINE_OUTCOME.COMPLETED) summary.completed += 1;
      else if (outcome.outcome === PIPELINE_OUTCOME.CANCELLED) summary.cancelled += 1;
      else if (outcome.outcome === PIPELINE_OUTCOME.FAILED) summary.failed += 1;
      else if (outcome.outcome === PIPELINE_OUTCOME.AWAITING_EVIDENCE) summary.awaitingEvidence += 1;
    }
  } finally {
    _sweeping = false;
  }
  return summary;
}

/**
 * CANCEL A BATCH, PROPERLY. The old cancelBatch() only ever flipped the
 * ImportBatchRecord's own status field — it never touched the sessions that
 * batch had created. So the one thing the operator was actually watching (a
 * list of half-processed documents, still showing as in-flight) did not
 * change at all, which is precisely why the button read as "doing nothing"
 * even in the cases where its write DID land.
 *
 * Cancelling a batch means cancelling its unfinished WORK:
 *   - every queued/in-flight session becomes CANCELLED (terminal),
 *   - a session that already produced Knowledge is allowed to FINISH
 *     archiving — completed work is never destroyed,
 *   - already-terminal sessions are left exactly as they are.
 *
 * Idempotent: safe to call from the progress panel, the recovery banner, the
 * worker loop's settle, and another tab, in any order, any number of times.
 *
 * Sessions are found by the batch's own `sessionIds` AND by a scan for
 * sessions carrying this `batchId` — a straggler created a moment before the
 * cancel landed may not have been recorded onto the batch record yet, and
 * "mostly cancelled" is not cancelled.
 *
 * @param {string} batchId
 * @returns {{ok: boolean, cancelledSessions: number, preservedSessions: number, error: string|null}}
 */
export function cancelImportBatch(batchId) {
  const batchResult = cancelBatch(batchId);
  if (!batchResult.ok) {
    return {
      ok: false, cancelledSessions: 0, preservedSessions: 0, error: batchResult.error.message,
    };
  }

  const listed = listImportSessions({});
  const all = listed.ok ? listed.data : [];
  const batch = batchResult.data;
  const ids = new Set([...(batch.sessionIds || [])]);
  all.forEach((s) => { if (s.batchId === batchId) ids.add(s.id); });

  let cancelledSessions = 0;
  let preservedSessions = 0;
  for (const id of ids) {
    const current = getImportSession(id);
    if (!current.ok) continue;
    const s = current.data;
    if (isTerminalImportSessionState(s.state)) { preservedSessions += 1; continue; }
    // Already produced Knowledge — let advanceSession() finish archiving it
    // rather than cancelling real, completed work.
    if (s.state === IMPORT_SESSION_STATE.KNOWLEDGE_IMPORTED) {
      advanceSession(id);
      preservedSessions += 1;
      continue;
    }
    if (cancelImportSession(id).ok) cancelledSessions += 1;
  }
  return {
    ok: true, cancelledSessions, preservedSessions, error: null,
  };
}

export { PIPELINE_STAGE };
