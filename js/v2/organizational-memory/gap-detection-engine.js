/* ============================================================
   GAP-DETECTION-ENGINE.JS — Organizational Memory Foundation (V2.0.7, Phase 10)

   PURPOSE: "Missing NOR Detection" / "Gap Detection" — walks the majority
   numbering pattern numbering-engine.js already infers and reports every
   missing numeral between the lowest and highest archived number sharing
   it. Reuses `majorityTemplateGroup()` rather than re-deriving the
   pattern a second time.

   RESPONSIBILITY: `detectGaps(domainType)`.

   DEPENDENCIES: repository/archive-repository.js, numbering-engine.js,
   contracts/gap-contract.js.

   NON-GOALS: does not touch numbers outside the majority template group —
   a minority-pattern number is not evidence of a gap in the majority
   sequence.
   ============================================================ */

'use strict';

import { listArchive as list } from './services/archive-service.js';
import { majorityTemplateGroup } from './numbering-engine.js';
import { makeGap } from './contracts/gap-contract.js';

/**
 * @param {string} domainType
 * @returns {import('./contracts/gap-contract.js').ArchiveGap[]}
 */
export function detectGaps(domainType) {
  const result = list({ sourceDomainType: domainType });
  const numbers = result.ok ? result.data.map((r) => r.documentNumber) : [];
  const grouping = majorityTemplateGroup(numbers);
  if (!grouping || grouping.group.length < 2) return [];

  const { template, group } = grouping;
  const sorted = [...group].sort((a, b) => a.numeric - b.numeric);
  const gaps = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    for (let missing = current.numeric + 1; missing < next.numeric; missing += 1) {
      gaps.push(makeGap({
        domainType,
        expectedNumber: template.replace('{}', String(missing).padStart(current.width, '0')),
        precedingNumber: current.original,
        followingNumber: next.original,
      }));
    }
  }

  return gaps;
}
