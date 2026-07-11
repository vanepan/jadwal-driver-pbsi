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

   RESPONSIBILITY: `flagGapForUpload`/`resolveGap`/`getGapsWithWorkflowState`
   — a process-wide Map overlaying gap-detection-engine.js's fresh-computed
   gaps with persisted workflow state, since `detectGaps()` itself is
   stateless (recomputed from the archive on every call).

   DEPENDENCIES: gap-detection-engine.js, contracts/gap-contract.js.
   ============================================================ */

'use strict';

import { detectGaps } from './gap-detection-engine.js';
import { GAP_STATUS } from './contracts/gap-contract.js';

/** @type {Map<string, string>} `${domainType}:${expectedNumber}` -> GAP_STATUS */
const _workflowState = new Map();

function key(domainType, expectedNumber) {
  return `${domainType}:${expectedNumber}`;
}

export function flagGapForUpload(domainType, expectedNumber) {
  _workflowState.set(key(domainType, expectedNumber), GAP_STATUS.FLAGGED_FOR_UPLOAD);
}

export function resolveGap(domainType, expectedNumber) {
  _workflowState.set(key(domainType, expectedNumber), GAP_STATUS.RESOLVED);
}

/** Detected gaps with any persisted workflow state overlaid; gaps marked
 *  RESOLVED are dropped from the list — they've been dealt with. */
export function getGapsWithWorkflowState(domainType) {
  return detectGaps(domainType)
    .filter((g) => _workflowState.get(key(domainType, g.expectedNumber)) !== GAP_STATUS.RESOLVED)
    .map((g) => Object.freeze({ ...g, status: _workflowState.get(key(domainType, g.expectedNumber)) || g.status }));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetGapWorkflowState() {
  _workflowState.clear();
}
