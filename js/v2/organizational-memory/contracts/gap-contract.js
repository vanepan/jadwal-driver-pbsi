/* ============================================================
   GAP-CONTRACT.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: fix the shape of a detected gap in a document numbering
   sequence ("Missing NOR Detection", "Gap Detection") and its workflow
   state ("Upload Missing NOR" — a status marker, not a file-upload
   mechanism; no file upload exists anywhere in this codebase, see
   archive-record-contract.js's header).

   RESPONSIBILITY: define ArchiveGap, GAP_STATUS, and a constructor.

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

export const GAP_SCHEMA = 'archive-gap@1';

export const GAP_STATUS = Object.freeze({
  OPEN: 'open',
  FLAGGED_FOR_UPLOAD: 'flagged_for_upload',
  RESOLVED: 'resolved',
});

/**
 * @typedef {Object} ArchiveGap
 * @property {string} gapId
 * @property {string} domainType
 * @property {string} expectedNumber      - the number missing from the sequence
 * @property {string|null} precedingNumber
 * @property {string|null} followingNumber
 * @property {string} status              - one of GAP_STATUS
 * @property {string} detectedAt          - ISO 8601
 */

let _counter = 0;

export function makeGap({ domainType, expectedNumber, precedingNumber = null, followingNumber = null }) {
  _counter += 1;
  return Object.freeze({
    gapId: `gap:${domainType}:${Date.now()}:${_counter}`,
    domainType, expectedNumber, precedingNumber, followingNumber,
    status: GAP_STATUS.OPEN,
    detectedAt: new Date().toISOString(),
  });
}
