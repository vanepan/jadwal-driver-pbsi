/* ============================================================
   GAP-WORKFLOW-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Upload Missing NOR" — a workflow STATE marker over a detected
   gap ("acknowledged, awaiting the original document" / "resolved —
   either genuinely filled or deliberately skipped"), NOT a file-upload
   mechanism. Research confirmed zero file-upload/Storage capability
   exists anywhere in this codebase; building real upload would mean
   introducing a brand-new persistence strategy (Firebase Storage) and
   almost certainly touching V1 (upload UI, Storage security rules) —
   outside this milestone's "V1 remains untouched" bound. This engine
   gives the workflow a real, persisted place to live so a FUTURE UI
   (V2.0.10 NOR Center) can wire an actual upload button to
   `flagGapForUpload`/`resolveGap` without redesigning anything here.

   RESPONSIBILITY: `flagGapForUpload`/`resolveGap`/`getGapsWithWorkflowState`/
   `countResolvedGaps` — a process-wide Map overlaying gap-detection-engine.js's
   fresh-computed gaps with persisted workflow state, since `detectGaps()`
   itself is stateless (recomputed from the archive on every call).

   PHASE 5, PART 4 — GAP RESOLUTION BECOMES LEARNING. Resolving a gap used to
   be pure bookkeeping (a status flip in the Map below, nothing else). The
   mission is explicit that "gap resolution itself should become Learning,"
   and that's right: whether a numbering gap was ever accounted for is
   exactly the fact Coverage (Part 7, "Gap Coverage") and the Executive
   Briefing (Part 8, "most frequent gaps") need a real HISTORY of, not a live
   flag that silently overwrites itself with no trace. `resolveGap()` now
   also calls learning-service.js#recordGapResolution() — idempotent per
   (domainType, expectedNumber), so re-resolving an already-resolved gap
   writes nothing new.

   DEPENDENCIES: gap-detection-engine.js, contracts/gap-contract.js,
   ../learning/services/learning-service.js (organizational-memory/ may
   depend on learning/ — see that file's header for the layering rationale).
   ============================================================ */

'use strict';

import { detectGaps } from './gap-detection-engine.js';
import { GAP_STATUS } from './contracts/gap-contract.js';
import { recordGapResolution } from '../../js/v2/learning/services/learning-service.js';

/** @type {Map<string, string>} `${domainType}:${expectedNumber}` -> GAP_STATUS */
const _workflowState = new Map();

function key(domainType, expectedNumber) {
  return `${domainType}:${expectedNumber}`;
}

export function flagGapForUpload(domainType, expectedNumber) {
  _workflowState.set(key(domainType, expectedNumber), GAP_STATUS.FLAGGED_FOR_UPLOAD);
}

export function resolveGap(domainType, expectedNumber, { actorId = 'evan', reason = null } = {}) {
  _workflowState.set(key(domainType, expectedNumber), GAP_STATUS.RESOLVED);
  recordGapResolution({ domainType, expectedNumber, actorId, reason });
}

/** Detected gaps with any persisted workflow state overlaid; gaps marked
 *  RESOLVED are dropped from the list — they've been dealt with. */
export function getGapsWithWorkflowState(domainType) {
  return detectGaps(domainType)
    .filter((g) => _workflowState.get(key(domainType, g.expectedNumber)) !== GAP_STATUS.RESOLVED)
    .map((g) => Object.freeze({ ...g, status: _workflowState.get(key(domainType, g.expectedNumber)) || g.status }));
}

/** Part 7 — Gap Coverage's denominator companion: how many gaps were EVER
 *  resolved for this domain (getGapsWithWorkflowState() deliberately excludes
 *  these — "they've been dealt with" — so Coverage needs its own count). */
export function countResolvedGaps(domainType) {
  let n = 0;
  const prefix = `${domainType}:`;
  for (const [k, status] of _workflowState) {
    if (k.startsWith(prefix) && status === GAP_STATUS.RESOLVED) n += 1;
  }
  return n;
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetGapWorkflowState() {
  _workflowState.clear();
}
