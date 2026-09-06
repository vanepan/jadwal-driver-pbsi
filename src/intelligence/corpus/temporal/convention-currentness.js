/* ============================================================
   CONVENTION-CURRENTNESS.JS — Historical vs Current Convention
   (V2, Phase 5.x.3)

   PURPOSE: the pure, transparent classifier that turns one convention's
   MULTI-DOCUMENT evidence (convention-evidence.js) into:
     • conventionEra    — TEMPORAL_CLASSIFICATION.* — where the evidence sits
     • conventionStatus — CONVENTION_STATUS.* — does it look current, and
       how does it relate to an approved rule if one exists

   THE HARD RULES (§9, §13, §15):
     • currentness is EVIDENCE-BASED. Frequency alone is never enough:
       `current_evidence` requires at least `minCurrentDocuments` DISTINCT
       documents dated in the current window. Historical frequency alone
       is insufficient. There is no model-confidence input at all.
     • every result carries a human-readable `basis` — no black-box score.
     • `unknown` / `insufficient_evidence` are returned honestly when the
       windows are unconfigured, there is no dated evidence, or there is
       too little of it — never a forced guess.
     • conflicting recent evidence is reported as `conflicting`, never
       resolved to a single "best" value (§8).

   APPROVED-RULE INTERACTION (§10, §11): an approved rule, when supplied,
   is READ-ONLY. This module never creates, modifies, or approves
   anything. It only reports `aligned` / `possible_drift` relative to
   what a human already approved.

   RESPONSIBILITY: classifyConventionEra(group), classifyConventionStatus(
   group, slotSiblings, config, approvedRule?).

   DEPENDENCIES: ./contracts/temporal-contract.js. PURE.
   ============================================================ */

'use strict';

import { TEMPORAL_CLASSIFICATION, CONVENTION_STATUS } from './contracts/temporal-contract.js';

function normValue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * "When does the EVIDENCE for this convention sit?" — from the buckets of
 * the documents it was observed in. Never uses "now".
 * @param {import('./convention-evidence.js').ConventionEvidenceGroup} g
 * @param {import('./temporal-windows.js').ResolvedWindows} windows
 * @returns {string} TEMPORAL_CLASSIFICATION.*
 */
export function classifyConventionEra(g, windows) {
  if (!windows || !windows.configured || !g || g.datedDocumentCount === 0) return TEMPORAL_CLASSIFICATION.UNKNOWN;
  const h = g.historicalDocumentCount;
  const c = g.currentDocumentCount;
  const tr = g.transitionalDocumentCount;
  if (c > 0 && h === 0 && tr === 0) return TEMPORAL_CLASSIFICATION.CURRENT;
  if (h > 0 && c === 0 && tr === 0) return TEMPORAL_CLASSIFICATION.HISTORICAL;
  if (h === 0 && c === 0 && tr > 0) return TEMPORAL_CLASSIFICATION.TRANSITIONAL;
  return TEMPORAL_CLASSIFICATION.TRANSITIONAL; // spans buckets
}

/**
 * Slot-level currentness classification.
 * @param {import('./convention-evidence.js').ConventionEvidenceGroup} g   the group being classified
 * @param {import('./convention-evidence.js').ConventionEvidenceGroup[]} slotSiblings  ALL groups in the same category|key slot (includes `g`)
 * @param {object} config   corpus-analysis-config `temporal` block (+ resolved windows via `windows`)
 * @param {import('./temporal-windows.js').ResolvedWindows} windows
 * @param {{category:string,key:string,value:string}|null} [approvedRule]  READ-ONLY, for this slot only
 * @returns {{ conventionStatus: string, basis: string, evidence: object }}
 */
export function classifyConventionStatus(g, slotSiblings, config, windows, approvedRule = null) {
  const t = (config && typeof config.temporal === 'object' && config.temporal) || {};
  const minCurrent = Number.isInteger(t.minCurrentDocuments) && t.minCurrentDocuments >= 1 ? t.minCurrentDocuments : 2;
  const minHistorical = Number.isInteger(t.minHistoricalDocuments) && t.minHistoricalDocuments >= 1 ? t.minHistoricalDocuments : 1;
  const conflictRatio = Number.isFinite(t.conflictMinorityRatio) && t.conflictMinorityRatio > 0 && t.conflictMinorityRatio <= 1 ? t.conflictMinorityRatio : 0.34;

  const siblings = Array.isArray(slotSiblings) ? slotSiblings : [g];
  const approvedRulePresent = !!(approvedRule && approvedRule.category === g.category && approvedRule.key === g.observationKey);
  const approvedRuleMatches = approvedRulePresent && normValue(approvedRule.value) === normValue(g.observedValue);

  const evidence = {
    documentCount: g.documentCount,
    datedDocumentCount: g.datedDocumentCount,
    undatedDocumentCount: g.undatedDocumentCount,
    historicalDocumentCount: g.historicalDocumentCount,
    currentDocumentCount: g.currentDocumentCount,
    transitionalDocumentCount: g.transitionalDocumentCount,
    oldestSourceDate: g.oldestSourceDate,
    latestSourceDate: g.latestSourceDate,
    temporalSpreadDays: g.temporalSpreadDays,
    recentDocumentCount: g.currentDocumentCount,
    conflictingDocumentCount: 0,
    approvedRulePresent,
    approvedRuleMatches,
  };

  if (!windows || !windows.configured) {
    return { conventionStatus: CONVENTION_STATUS.INSUFFICIENT_EVIDENCE, basis: 'no temporal windows are configured — the historical/current distinction cannot be made (§6, §15).', evidence };
  }
  if (g.datedDocumentCount === 0) {
    return { conventionStatus: CONVENTION_STATUS.INSUFFICIENT_EVIDENCE, basis: `observed in ${g.documentCount} document(s), none with a canonical sourceDate — temporal placement is unknown (§14, §15).`, evidence };
  }

  // ── slot conflict: >= 2 distinct VALUES present in the current window ──
  const currentBearing = siblings.filter((s) => s.currentDocumentCount >= 1);
  const slotCurrentTotal = currentBearing.reduce((a, s) => a + s.currentDocumentCount, 0);
  const distinctCurrentValues = new Set(currentBearing.map((s) => normValue(s.observedValue))).size;
  const competing = currentBearing.filter((s) => normValue(s.observedValue) !== normValue(g.observedValue));
  evidence.conflictingDocumentCount = competing.reduce((a, s) => a + s.currentDocumentCount, 0);

  if (distinctCurrentValues >= 2 && slotCurrentTotal >= minCurrent) {
    const minShare = Math.min(...currentBearing.map((s) => s.currentDocumentCount / slotCurrentTotal));
    if (minShare >= conflictRatio && g.currentDocumentCount >= 1) {
      return {
        conventionStatus: CONVENTION_STATUS.CONFLICTING,
        basis: `${distinctCurrentValues} different values are used in the current window (${slotCurrentTotal} recent document(s), smallest share ${(minShare * 100).toFixed(0)}%). Recent usage disagrees — a human decides (§8).`,
        evidence,
      };
    }
  }
  if (distinctCurrentValues >= 2 && slotCurrentTotal < minCurrent && g.currentDocumentCount >= 1) {
    return {
      conventionStatus: CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
      basis: `a competing value is also used recently, but only ${slotCurrentTotal} current document(s) in total — below the minimum of ${minCurrent}. Not enough recent evidence to call either (§9, §15).`,
      evidence,
    };
  }

  // ── this value alone has current evidence ──
  if (g.currentDocumentCount >= minCurrent) {
    if (approvedRuleMatches) {
      return { conventionStatus: CONVENTION_STATUS.ALIGNED, basis: `${g.currentDocumentCount} recent document(s) use this value, and it matches the approved rule — aligned (§10).`, evidence };
    }
    return { conventionStatus: CONVENTION_STATUS.CURRENT_EVIDENCE, basis: `${g.currentDocumentCount} distinct document(s) dated in the current window use this value (>= the minimum ${minCurrent}). Still evidence, not an approved rule (§9, §17).`, evidence };
  }

  // ── an approved rule for THIS value, but recent corpus favours another ──
  if (approvedRuleMatches && competing.some((s) => s.currentDocumentCount >= minCurrent)) {
    return {
      conventionStatus: CONVENTION_STATUS.POSSIBLE_DRIFT,
      basis: `this value is the approved rule, but ${evidence.conflictingDocumentCount} recent document(s) use a different value while this one has ${g.currentDocumentCount}. Possible drift — the approved rule is NOT changed (§11).`,
      evidence,
    };
  }

  // ── historical only ──
  if (g.currentDocumentCount === 0 && g.historicalDocumentCount >= minHistorical) {
    const supersededBy = competing.filter((s) => s.currentDocumentCount >= minCurrent).map((s) => s.observedValue);
    const note = supersededBy.length
      ? ` A different value has current evidence in this slot (${supersededBy.map((v) => JSON.stringify(String(v).slice(0, 40))).join(', ')}) — possible replacement, for a human to confirm.`
      : '';
    return {
      conventionStatus: CONVENTION_STATUS.HISTORICAL_ONLY,
      basis: `${g.historicalDocumentCount} historical document(s), 0 in the current window. Observed historically — NOT currently required (§1).${note}`,
      evidence,
    };
  }

  return {
    conventionStatus: CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
    basis: `${g.currentDocumentCount} current + ${g.historicalDocumentCount} historical + ${g.transitionalDocumentCount} transitional document(s) — not enough dated evidence to place this convention (§15).`,
    evidence,
  };
}
