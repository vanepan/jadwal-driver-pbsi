/* ============================================================
   CONVENTION-TEMPORAL-ANALYZER.JS — Historical vs Current Convention
   (V2, Phase 5.x.3)

   PURPOSE: THE orchestrator of the temporal interpretation layer. Given
   the owner's corpus observations + documents + (optionally) a list of
   ALREADY-APPROVED rules, it produces a deterministic, read-only
   ConventionTemporalReport:

     • one ConventionTemporalEntry per convention group — its
       `conventionEra`, its `conventionStatus`, its TRANSPARENT evidence
       bag, and its links back to observationIds / documentIds (§12, §13)
     • `conflicts` — every (category,key) slot where >= 2 distinct values
       have recent evidence, with BOTH sides kept in full (§8)
     • `drift` — one DriftFinding per supplied approved rule: its status
       relative to recent corpus evidence, with `ruleUnchanged: true`
       ALWAYS (§10, §11)

   IT NEVER:
     • rewrites, merges, deletes, or re-lifecycles an observation (§3, §16)
     • creates approvedBy / approvedAt / preferenceRationale (§16)
     • writes a KnowledgeItem / a rule / a template / the Registry (§17)
     • calls a model (§18) or reads a date other than the canonical
       `sourceDate` (§14)
     • forces a guess — `unknown` / `insufficient_evidence` stand (§15)

   SAME CORPUS + SAME CONFIG ⇒ SAME REPORT (deterministic ordering by
   groupKey; no clock read except the `generatedAt` stamp, which a caller
   may pin).

   RESPONSIBILITY: analyzeConventionTemporal({ observations, documents,
   approvedRules }, config, { at }).

   DEPENDENCIES: ./convention-evidence.js, ./convention-currentness.js,
   ./temporal-windows.js, ./contracts/temporal-contract.js,
   ../corpus-analysis-config.js (DEFAULT_CORPUS_ANALYSIS_CONFIG). PURE.
   ============================================================ */

'use strict';

import { DEFAULT_CORPUS_ANALYSIS_CONFIG } from '../corpus-analysis-config.js';
import { resolveTemporalWindows } from './temporal-windows.js';
import { buildConventionEvidence, indexBySlot } from './convention-evidence.js';
import { classifyConventionEra, classifyConventionStatus } from './convention-currentness.js';
import { sanitizeApprovedRules } from './temporal-input.js';
import {
  CONVENTION_STATUS,
  makeConventionTemporalEntry, makeConventionConflict, makeDriftFinding, makeConventionTemporalReport,
} from './contracts/temporal-contract.js';

function normValue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}

function toEntry(group, status, era) {
  return makeConventionTemporalEntry({
    groupKey: group.groupKey,
    category: group.category,
    observationKey: group.observationKey,
    observedValue: group.observedValue,
    conventionEra: era,
    conventionStatus: status.conventionStatus,
    evidence: status.evidence,
    basis: status.basis,
    observationIds: group.observationIds,
    documentIds: group.documentIds,
  });
}

/**
 * @param {{ observations: object[], documents: object[], approvedRules?: object[] }} input
 * @param {object} [config]   a corpus-analysis-config shape (defaults applied)
 * @param {{ at?: string }} [opts]
 * @returns {import('./contracts/temporal-contract.js').ConventionTemporalReport}
 */
export function analyzeConventionTemporal(input = {}, config, opts = {}) {
  const cfg = {
    ...DEFAULT_CORPUS_ANALYSIS_CONFIG,
    ...(config || {}),
    temporal: { ...DEFAULT_CORPUS_ANALYSIS_CONFIG.temporal, ...((config && config.temporal) || {}) },
  };
  const at = opts.at || new Date().toISOString();
  const windows = resolveTemporalWindows(cfg);
  const approvedRules = sanitizeApprovedRules(input.approvedRules);

  const groups = buildConventionEvidence(
    { observations: input.observations || [], documents: input.documents || [] },
    windows,
  );

  const bySlot = indexBySlot(groups);
  // evidence-era per group, WITHOUT mutating the frozen group objects
  const eraByKey = new Map(groups.map((g) => [g.groupKey, classifyConventionEra(g, windows)]));
  const eraOf = (g) => eraByKey.get(g.groupKey) || undefined;

  const ruleForSlot = (category, key) => approvedRules.find((r) => r.category === category && r.key === key) || null;

  /* ── conventions ── */
  const conventions = groups.map((g) => {
    const siblings = bySlot.get(`${g.category}|${g.observationKey}`) || [g];
    const rule = ruleForSlot(g.category, g.observationKey);
    const status = classifyConventionStatus(g, siblings, cfg, windows, rule);
    return toEntry(g, status, eraOf(g));
  });

  /* ── conflicts: a slot with >= 2 distinct values that BOTH have recent
        evidence, or >= 2 distinct values overall when unconfigured we skip ── */
  const conflicts = [];
  for (const [slot, siblings] of bySlot.entries()) {
    if (siblings.length < 2) continue;
    const [category, observationKey] = slot.split('|');
    const currentBearing = siblings.filter((s) => s.currentDocumentCount >= 1);
    const distinctCurrentValues = new Set(currentBearing.map((s) => normValue(s.observedValue))).size;
    if (!windows.configured || distinctCurrentValues < 2) continue;
    const sides = currentBearing
      .map((s) => {
        const rule = ruleForSlot(category, observationKey);
        const st = classifyConventionStatus(s, siblings, cfg, windows, rule);
        return toEntry(s, st, eraOf(s));
      })
      .sort((a, b) => (a.observedValue < b.observedValue ? -1 : a.observedValue > b.observedValue ? 1 : 0));
    conflicts.push(makeConventionConflict({
      category, observationKey, sides,
      note: `${distinctCurrentValues} different values are in recent use for "${observationKey}". Both are kept — the corpus does not decide (§8).`,
    }));
  }

  /* ── drift: one finding per supplied approved rule ── */
  const drift = approvedRules.map((rule) => {
    const siblings = bySlot.get(`${rule.category}|${rule.key}`) || [];
    const approvedGroup = siblings.find((s) => normValue(s.observedValue) === normValue(rule.value)) || null;
    const competingCurrent = siblings
      .filter((s) => normValue(s.observedValue) !== normValue(rule.value) && s.currentDocumentCount >= 1);

    let status = CONVENTION_STATUS.INSUFFICIENT_EVIDENCE;
    let basis;
    const minCurrent = Number.isInteger(cfg.temporal.minCurrentDocuments) && cfg.temporal.minCurrentDocuments >= 1 ? cfg.temporal.minCurrentDocuments : 2;
    const anyDated = siblings.some((s) => s.datedDocumentCount > 0);

    if (!windows.configured || !anyDated) {
      basis = !windows.configured
        ? 'no temporal windows are configured — drift cannot be assessed (§6, §15).'
        : 'no document in this slot carries a canonical sourceDate — drift cannot be assessed (§14, §15).';
    } else {
      const competingStrong = competingCurrent.filter((s) => s.currentDocumentCount >= minCurrent);
      const approvedCurrent = approvedGroup ? approvedGroup.currentDocumentCount : 0;
      if (competingStrong.length > 0 && approvedCurrent < minCurrent) {
        status = CONVENTION_STATUS.POSSIBLE_DRIFT;
        basis = `${competingStrong.reduce((a, s) => a + s.currentDocumentCount, 0)} recent document(s) use a value OTHER than the approved rule, which itself has ${approvedCurrent} recent document(s). Possible drift — the approved rule is NOT modified (§10, §11).`;
      } else if (approvedGroup && approvedCurrent >= minCurrent && competingCurrent.length === 0) {
        status = CONVENTION_STATUS.ALIGNED;
        basis = `${approvedCurrent} recent document(s) use the approved value and none use a competing one — aligned (§10).`;
      } else if (approvedGroup && approvedCurrent === 0 && approvedGroup.historicalDocumentCount > 0 && competingCurrent.length === 0) {
        status = CONVENTION_STATUS.HISTORICAL_ONLY;
        basis = `the approved value appears only in historical documents and no competing value has recent evidence. Nothing to change — flagged for a human to review whether the rule is still exercised (§10).`;
      } else if (competingCurrent.length > 0 || (approvedGroup && approvedCurrent > 0)) {
        status = CONVENTION_STATUS.CONFLICTING;
        basis = `recent usage is mixed between the approved value and at least one other. Both are kept — a human decides (§8).`;
      } else {
        basis = `not enough recent dated evidence for the approved value or a competitor to assess drift (§15).`;
      }
    }

    return makeDriftFinding({
      approvedRule: rule,
      status,
      approvedConventionEvidence: approvedGroup
        ? toEntry(approvedGroup, classifyConventionStatus(approvedGroup, siblings, cfg, windows, rule), eraOf(approvedGroup))
        : null,
      competingEvidence: competingCurrent
        .sort((a, b) => (a.observedValue < b.observedValue ? -1 : a.observedValue > b.observedValue ? 1 : 0))
        .map((s) => toEntry(s, classifyConventionStatus(s, siblings, cfg, windows, ruleForSlot(rule.category, rule.key)), eraOf(s))),
      basis,
    });
  });

  return makeConventionTemporalReport({
    generatedAt: at,
    windows: {
      historicalCutoff: windows.historicalEnd,
      currentWindowStart: windows.currentStart,
      transitionalOverlapDays: windows.transitionalOverlapDays,
    },
    temporalConfigured: windows.configured,
    conventions,
    conflicts,
    drift,
  });
}
