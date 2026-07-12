/* ============================================================
   PROFILE-ENGINE.JS — Organizational Knowledge Profiles (V2.0.12.5)

   PURPOSE: "Organizational Knowledge Profiles" — computes ONE Profile
   (contracts/profile-contract.js) for a (domainType, profileType) pair by
   grouping Approved KnowledgeItems categorically by their
   `payload.value` field, the categorical counterpart to
   machine-learning/statistics-engine.js's numeric-field aggregation. One
   engine serves all ten PROFILE_TYPEs (PROFILE_KIND_MAP below) —
   deliberately NOT ten engines, per the roadmap's frozen "no duplicated
   engines, no duplicated business logic" rule.

   Configuration vs. Knowledge (the roadmap's "most important decision"):
   this engine only ever reads Approved KnowledgeItems — organizational
   EXPERIENCE the org has actually produced and a human has approved. It
   never reads a hardcoded settings/config value, and a Profile is never
   used to store one. A logo, a margin, a PDF header belongs in
   Configuration and must never flow through this file.

   RESPONSIBILITY: `buildProfile(domainType, profileType)`, pure — reuses
   the existing single-hop primitives, computes no new number beyond a
   mean/ratio/count over what a KnowledgeItem already carries
   (`confidence`, `id`, `sourceType`).

   DEPENDENCIES: extraction/index-engine.js (buildKnowledgeIndex/
   indexGroup — the same Approved-only snapshot machine-learning/
   statistics-engine.js already uses), contracts/profile-contract.js,
   contracts/evidence-contract.js.

   NON-GOALS: never writes anything (a Profile is always freshly
   recomputed, exactly like knowledge-metrics-engine.js's health report —
   no stale cache). Never invents a grouping key beyond
   `payload[PROFILE_VALUE_FIELD]` — a payload missing that field is
   silently excluded from the population (surfaced as `ineligibleCount`),
   never guessed at.

   FUTURE EVOLUTION: V2.0.14.5 (Organizational Profile Builder) will call
   `buildProfile` once per PROFILE_TYPE after each dataset import; this
   engine's contract does not need to change for that — only a caller is
   added.
   ============================================================ */

'use strict';

import { buildKnowledgeIndex, indexGroup } from '../extraction/index-engine.js';
import { PROFILE_TYPE, PROFILE_SCHEMA, PROFILE_VALUE_FIELD, isProfileEligiblePayload } from '../contracts/profile-contract.js';
import { EVIDENCE_KIND, isEvidence } from '../contracts/evidence-contract.js';

/** PROFILE_TYPE -> the registered `kind` (registry/kind-registry.js) it is
 *  computed from. Vocabulary/Paragraph/Writing Style reuse kinds that
 *  already existed before this milestone; the other seven were
 *  registered by this milestone (kind-registry.js bootstrap). */
export const PROFILE_KIND_MAP = Object.freeze({
  [PROFILE_TYPE.RECIPIENT]: 'recipient',
  [PROFILE_TYPE.SIGNATORY]: 'signatory',
  [PROFILE_TYPE.CC]: 'cc',
  [PROFILE_TYPE.VOCABULARY]: 'vocabulary',
  [PROFILE_TYPE.PARAGRAPH]: 'paragraph_pattern',
  [PROFILE_TYPE.ATTACHMENT]: 'attachment',
  [PROFILE_TYPE.APPROVAL]: 'approval_chain',
  [PROFILE_TYPE.WRITING_STYLE]: 'writing_style',
  [PROFILE_TYPE.DEPARTMENT]: 'department',
  [PROFILE_TYPE.DOCUMENT_CATEGORY]: 'document_category',
});

export function listProfileTypes() {
  return Object.freeze(Object.values(PROFILE_TYPE));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function mean(items) {
  return items.length ? items.reduce((s, i) => s + i.confidence, 0) / items.length : 0;
}

function totalApprovedInDomain(index, domainType) {
  let total = 0;
  for (const [key, items] of index.byDomainKind) {
    if (key.startsWith(`${domainType}:`)) total += items.length;
  }
  return total;
}

function toSourceEvidence(item, rationale) {
  return { itemId: item.id, kind: EVIDENCE_KIND.SOURCE, weight: item.confidence, rationale };
}

/**
 * @param {string} domainType   - registry-backed domainType (registry/domain-type-registry.js)
 * @param {string} profileType  - one of PROFILE_TYPE
 * @returns {{ok: boolean, profile: import('../contracts/profile-contract.js').Profile|null, itemsConsidered: number, ineligibleCount: number, error: object|null}}
 */
export function buildProfile(domainType, profileType) {
  if (!Object.values(PROFILE_TYPE).includes(profileType)) {
    return { ok: false, profile: null, itemsConsidered: 0, ineligibleCount: 0, error: { code: 'UNKNOWN_PROFILE_TYPE', message: `"${profileType}" is not a registered PROFILE_TYPE.` } };
  }

  const kind = PROFILE_KIND_MAP[profileType];
  const index = buildKnowledgeIndex();
  const candidates = indexGroup(index, domainType, kind);
  const eligible = candidates.filter((i) => isProfileEligiblePayload(i.payload));
  const ineligibleCount = candidates.length - eligible.length;

  if (eligible.length === 0) {
    return { ok: false, profile: null, itemsConsidered: candidates.length, ineligibleCount, error: { code: 'NO_POPULATION', message: `No Approved ${domainType}/${kind} items with a "${PROFILE_VALUE_FIELD}" payload field to build a ${profileType} profile from.` } };
  }

  const byValue = new Map();
  for (const item of eligible) {
    const value = item.payload[PROFILE_VALUE_FIELD];
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(item);
  }

  const entries = [...byValue.entries()]
    .map(([value, group]) => ({
      value,
      sampleCount: group.length,
      frequency: round2(group.length / eligible.length),
      confidence: round2(mean(group)),
      evidence: group.map((item) => toSourceEvidence(item, `Item "${item.id}" (sourceType "${item.sourceType}") contributes value "${value}" to the ${profileType} profile.`)).filter(isEvidence),
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount);

  const totalApproved = totalApprovedInDomain(index, domainType);
  const now = new Date().toISOString();

  const profile = Object.freeze({
    schema: PROFILE_SCHEMA,
    profileType,
    domainType,
    entries: Object.freeze(entries),
    sampleCount: eligible.length,
    confidence: round2(mean(eligible)),
    frequency: totalApproved > 0 ? round2(eligible.length / totalApproved) : 0,
    provenance: Object.freeze(eligible.map((item) => toSourceEvidence(item, `Item "${item.id}" is part of the ${profileType} profile population.`)).filter(isEvidence)),
    computedAt: now,
  });

  return { ok: true, profile, itemsConsidered: candidates.length, ineligibleCount, error: null };
}

/**
 * "Organizational Profile Builder" (V2.0.14.5) — after imported Knowledge
 * (V2.0.14's dataset-import-service.js), build every Profile for one
 * domainType in one call. Pure fan-out over buildProfile(); computes no
 * new number itself. A PROFILE_TYPE with no Approved population yet
 * (NO_POPULATION) is included in the result, not silently dropped, so a
 * caller can see what's still missing.
 * @param {string} domainType
 * @returns {{domainType: string, profiles: Object<string, ReturnType<typeof buildProfile>>, profileTypesComputed: number, profileTypesAttempted: number, computedAt: string}}
 */
export function buildAllProfiles(domainType) {
  const profiles = {};
  for (const profileType of listProfileTypes()) {
    profiles[profileType] = buildProfile(domainType, profileType);
  }
  const profileTypesAttempted = listProfileTypes().length;
  const profileTypesComputed = Object.values(profiles).filter((r) => r.ok).length;
  return Object.freeze({
    domainType,
    profiles: Object.freeze(profiles),
    profileTypesComputed,
    profileTypesAttempted,
    computedAt: new Date().toISOString(),
  });
}
