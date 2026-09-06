/* ============================================================
   VISUAL-TEMPLATE-QUERY.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: the pure, read-only retrieval + effective-template resolution
   layer over a set of VisualTemplate records (§21, §22). Deterministic,
   scope-aware, provenance-preserving. NOT connected to any renderer (§27).
   Direct sibling of src/intelligence/corpus/style-guide/style-guide-query.js.

   THE TWO CRITICAL GUARANTEES:

     1. `getEffectiveVisualTemplates` returns APPROVED authoritative
        templates ONLY. `proposed` / `rejected` / `deprecated` are NEVER in
        the default effective set (§22).

     2. `resolveEffectiveTemplate` returns `resolved` | `conflict` |
        `missing`. When two approved templates disagree it returns
        `conflict` with the competing ids + evidence — it NEVER picks one
        by frequency, confidence or recency (§21). Fail closed.

   RESPONSIBILITY: queryVisualTemplates(templates, filter),
   getEffectiveVisualTemplates(templates, filter), getProposedVisualTemplates,
   resolveEffectiveTemplate(templates, target), findVisualTemplateConflicts,
   getVisualTemplateHistory.

   DEPENDENCIES: ./contracts/visual-template-contract.js. PURE.
   ============================================================ */

'use strict';

import {
  VISUAL_TEMPLATE_STATUS, VISUAL_TEMPLATE_SCOPE, isVisualTemplate,
} from './contracts/visual-template-contract.js';

function templateList(templates) {
  return Array.isArray(templates) ? templates.filter((t) => t && typeof t === 'object' && t.templateId) : [];
}
function inSet(v, spec) {
  if (spec == null) return true;
  const list = Array.isArray(spec) ? spec : [spec];
  if (list.includes('ANY')) return true;
  return list.includes(v);
}
function byTemplateId(a, b) { return a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0; }

/**
 * General query. NO status filter by default — this is the one place a
 * caller CAN ask for `proposed` (the review queue) or `deprecated`
 * (history).
 *
 * @param {object[]} templates
 * @param {object} [filter]  { status, documentType, scope, variant, includeSuperseded }
 * @returns {object[]}  a NEW sorted array; entries are the frozen originals
 */
export function queryVisualTemplates(templates, filter = {}) {
  const f = filter && typeof filter === 'object' ? filter : {};
  let out = templateList(templates).filter((t) =>
    inSet(t.status, f.status)
    && inSet(t.documentType, f.documentType)
    && inSet(t.scope, f.scope)
    && (f.variant == null || t.variant === f.variant));
  if (f.includeSuperseded === false) out = out.filter((t) => !t.supersededByTemplateId);
  return [...out].sort(byTemplateId);
}

/** The DEFAULT effective Visual Template set — APPROVED authoritative
 *  templates only (§22). */
export function getEffectiveVisualTemplates(templates, filter = {}) {
  const f = filter && typeof filter === 'object' ? filter : {};
  return queryVisualTemplates(templates, {
    status: VISUAL_TEMPLATE_STATUS.APPROVED,
    documentType: f.documentType,
    scope: f.scope,
    variant: f.variant,
  });
}

/** The human review queue — every `proposed` template (§22). */
export function getProposedVisualTemplates(templates, filter = {}) {
  return queryVisualTemplates(templates, { ...filter, status: VISUAL_TEMPLATE_STATUS.PROPOSED });
}

/**
 * Deterministic effective-template resolution for an EXACT
 * (scope, documentType) slot (§21).
 *
 * @param {object[]} templates
 * @param {object} target  { scope?, documentType }
 * @returns {{ outcome: 'resolved'|'conflict'|'missing', scope, documentType,
 *            template: object|null, competingTemplateIds: string[], competing: object[] }}
 */
export function resolveEffectiveTemplate(templates, target = {}) {
  const scope = target.scope || VISUAL_TEMPLATE_SCOPE.ORGANIZATION;
  const documentType = target.documentType;

  const approved = templateList(templates).filter((t) =>
    t.status === VISUAL_TEMPLATE_STATUS.APPROVED
    && t.scope === scope
    && t.documentType === documentType);

  const base = { scope, documentType };

  if (approved.length === 0) {
    return Object.freeze({ ...base, outcome: 'missing', template: null, competingTemplateIds: [], competing: Object.freeze([]) });
  }

  const distinctVariants = new Set(approved.map((t) => t.variant));
  if (distinctVariants.size === 1) {
    // one effective layout — a linear supersession chain. Prefer the
    // highest `templateVersion` that was never itself superseded.
    const active = approved.filter((t) => !t.supersededByTemplateId);
    const pool = active.length ? active : approved;
    const template = [...pool].sort((a, b) => (b.templateVersion - a.templateVersion) || byTemplateId(a, b))[0];
    return Object.freeze({ ...base, outcome: 'resolved', template, competingTemplateIds: [], competing: Object.freeze([]) });
  }

  // §21 — >= 2 DISTINCT approved layouts. DO NOT choose. Fail closed.
  const competing = [...approved].sort(byTemplateId).map((t) => Object.freeze({
    templateId: t.templateId,
    variant: t.variant,
    templateVersion: t.templateVersion,
    approvedAt: t.approvedAt,
    approvedBy: t.approvedBy,
    rationale: t.rationale,
    pageModel: t.pageModel,
    regions: t.regions,
    evidence: t.evidence,
    temporalEvidence: t.temporalEvidence,
  }));
  return Object.freeze({
    ...base,
    outcome: 'conflict',
    template: null,
    competingTemplateIds: Object.freeze(competing.map((c) => c.templateId)),
    competing: Object.freeze(competing),
  });
}

/**
 * Every slot with a conflict — competing APPROVED layouts (§21) OR
 * competing PROPOSED layouts awaiting a human decision (§20).
 *
 * @param {object[]} templates
 * @returns {Array<{ scope, documentType, status, competingTemplateIds: string[], sides: object[] }>}
 */
export function findVisualTemplateConflicts(templates) {
  const list = templateList(templates);
  const out = [];
  for (const status of [VISUAL_TEMPLATE_STATUS.APPROVED, VISUAL_TEMPLATE_STATUS.PROPOSED]) {
    const groups = new Map();
    for (const t of list) {
      if (t.status !== status) continue;
      if (t.supersededByTemplateId) continue;
      const gk = `${t.scope}|${t.documentType}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(t);
    }
    for (const [, group] of groups) {
      const distinct = new Set(group.map((t) => t.variant));
      if (distinct.size < 2) continue;
      const sample = group[0];
      const sides = [...group].sort(byTemplateId).map((t) => Object.freeze({
        templateId: t.templateId, variant: t.variant, templateVersion: t.templateVersion, status: t.status,
        pageModel: t.pageModel, regions: t.regions, evidence: t.evidence, temporalEvidence: t.temporalEvidence,
      }));
      out.push(Object.freeze({
        scope: sample.scope,
        documentType: sample.documentType,
        status,
        competingTemplateIds: Object.freeze(sides.map((s) => s.templateId)),
        sides: Object.freeze(sides),
      }));
    }
  }
  return out.sort((a, b) => {
    const ka = `${a.status}|${a.scope}|${a.documentType}`;
    const kb = `${b.status}|${b.scope}|${b.documentType}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * The full supersession history for a slot, oldest → newest, following
 * `supersedesTemplateId` back and `supersededByTemplateId` forward (§12).
 * Every version (approved or deprecated) remains queryable here.
 *
 * @param {object[]} templates
 * @param {string} templateId
 * @returns {object[]}
 */
export function getVisualTemplateHistory(templates, templateId) {
  const byId = new Map(templateList(templates).map((t) => [t.templateId, t]));
  const start = byId.get(String(templateId || ''));
  if (!start) return [];
  const seen = new Set();
  const chain = [];
  let cur = start;
  while (cur && !seen.has(cur.templateId)) {
    seen.add(cur.templateId);
    chain.push(cur);
    cur = cur.supersedesTemplateId ? byId.get(cur.supersedesTemplateId) : null;
  }
  cur = start.supersededByTemplateId ? byId.get(start.supersededByTemplateId) : null;
  while (cur && !seen.has(cur.templateId)) {
    seen.add(cur.templateId);
    chain.push(cur);
    cur = cur.supersededByTemplateId ? byId.get(cur.supersededByTemplateId) : null;
  }
  return chain.sort((a, b) => (a.templateVersion - b.templateVersion) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : byTemplateId(a, b)));
}

export function isVisualTemplateSet(templates) {
  return Array.isArray(templates) && templates.every(isVisualTemplate);
}
