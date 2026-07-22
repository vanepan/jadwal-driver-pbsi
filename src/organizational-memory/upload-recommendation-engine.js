/* ============================================================
   UPLOAD-RECOMMENDATION-ENGINE.JS — Official NOR Digital Archive
   Foundation (V2.0.17)

   PURPOSE: "instead of blocking, recommend" — groups gap-workflow-engine.js's
   own gaps (unmodified) into one human-readable UploadRecommendation per
   contiguous run of missing numbers between the same two archived
   documents. `gap-detection-engine.js#detectGaps` already produces every
   missing number in a run sharing one `precedingNumber`/`followingNumber`
   pair, in ascending order — grouping by that pair is enough to recover
   the exact contiguous run without re-parsing any numeral a second time.

   RESPONSIBILITY: `buildUploadRecommendations(domainType)`.

   DEPENDENCIES: gap-workflow-engine.js (getGapsWithWorkflowState,
   unmodified), knowledge/registry/domain-type-registry.js (for a human
   label — "NOR" rather than the raw id "nor" — reusing the SAME registry
   knowledge-item-contract.js already validates against, never a second
   hardcoded label table), contracts/upload-recommendation-contract.js.

   NON-GOALS: does not detect gaps itself. Does not implement upload —
   see upload-recommendation-contract.js's NON-GOALS.
   ============================================================ */

'use strict';

import { getGapsWithWorkflowState } from './gap-workflow-engine.js';
import { getDomainType } from '../../js/v2/knowledge/registry/domain-type-registry.js';
import { makeUploadRecommendation } from './contracts/upload-recommendation-contract.js';

function formatList(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function domainLabel(domainType) {
  const registered = getDomainType(domainType);
  return registered ? registered.label : domainType;
}

/**
 * @param {string} domainType
 * @returns {import('./contracts/upload-recommendation-contract.js').UploadRecommendation[]}
 */
export function buildUploadRecommendations(domainType) {
  const gaps = getGapsWithWorkflowState(domainType);
  if (gaps.length === 0) return [];

  const label = domainLabel(domainType);
  const groups = new Map();
  for (const gap of gaps) {
    const key = `${gap.precedingNumber}->${gap.followingNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(gap);
  }

  return [...groups.values()].map((groupGaps) => makeUploadRecommendation({
    domainType,
    expectedNumbers: groupGaps.map((g) => g.expectedNumber),
    gapIds: groupGaps.map((g) => g.gapId),
    message: `Upload missing ${label} ${formatList(groupGaps.map((g) => g.expectedNumber))}.`,
  }));
}
