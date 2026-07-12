/* ============================================================
   PROFILE-OVERRIDE-MERGE-ENGINE.JS — Organizational Profiles, Editable Layer (V2.1)

   PURPOSE: "Organizational Profiles are updated only after human approval"
   — the one place a computed Profile (profiles/profile-engine.js#
   buildProfile, UNCHANGED, still never writes) and its Approved overrides
   are combined, and ONLY at render time. Never persists a merged result —
   same "no stale cache" discipline profile-engine.js's own header already
   states, extended to the override layer.

   RESPONSIBILITY: getEffectiveProfile(domainType, profileType) — merge for
   the ten overlay types; listApprovedOverrides(domainType, overrideType) —
   plain CRUD list for the four standalone types (no baseline to merge).

   DEPENDENCIES: profiles/profile-engine.js (buildProfile, unchanged),
   ./repository/profile-override-repository.js (list, reused),
   ./contracts/profile-override-contract.js (OVERRIDE_ACTION, type guards).
   ============================================================ */

'use strict';

import { buildProfile } from '../profile-engine.js';
import { list as repoList } from './repository/profile-override-repository.js';
import { LIFECYCLE_STATE } from '../../contracts/lifecycle-contract.js';
import { OVERRIDE_ACTION, isOverlayType, isStandaloneType } from './contracts/profile-override-contract.js';

function approvedOverrides(domainType, overrideType) {
  const result = repoList({ domainType, overrideType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  return result.ok ? result.data : [];
}

/**
 * Merges buildProfile()'s computed entries with Approved overrides:
 * SUPPRESS removes an entry by value; RENAME relabels an entry's `value`;
 * PIN force-includes an entry (with the override's own sampleCount/
 * confidence if the value has no computed baseline, or boosts an existing
 * entry to the top otherwise).
 * @param {string} domainType
 * @param {string} profileType - one of contracts/profile-contract.js#PROFILE_TYPE
 */
export function getEffectiveProfile(domainType, profileType) {
  if (!isOverlayType(profileType)) {
    return { ok: false, profile: null, overridesApplied: 0, error: { code: 'NOT_OVERLAY_TYPE', message: `"${profileType}" has no computed baseline to overlay — see listApprovedOverrides() instead.` } };
  }

  const base = buildProfile(domainType, profileType);
  const overrides = approvedOverrides(domainType, profileType);
  if (overrides.length === 0) {
    return { ...base, overridesApplied: 0 };
  }

  const baseEntries = base.ok && base.profile ? [...base.profile.entries] : [];
  let entries = baseEntries;

  const suppressed = new Set(overrides.filter((o) => o.action === OVERRIDE_ACTION.SUPPRESS).map((o) => o.key));
  entries = entries.filter((e) => !suppressed.has(e.value));

  for (const o of overrides.filter((ov) => ov.action === OVERRIDE_ACTION.RENAME)) {
    entries = entries.map((e) => (e.value === o.key ? { ...e, value: o.payload.renameTo || e.value } : e));
  }

  for (const o of overrides.filter((ov) => ov.action === OVERRIDE_ACTION.PIN)) {
    const existing = entries.find((e) => e.value === o.key);
    if (existing) {
      entries = [existing, ...entries.filter((e) => e.value !== o.key)];
    } else {
      entries = [{
        value: o.key, sampleCount: 0, frequency: 0, confidence: 1,
        evidence: [], pinnedByOverride: true,
      }, ...entries];
    }
  }

  const mergedProfile = base.profile
    ? Object.freeze({ ...base.profile, entries: Object.freeze(entries) })
    : Object.freeze({ profileType, domainType, entries: Object.freeze(entries), sampleCount: 0, confidence: 0, frequency: 0, provenance: Object.freeze([]), computedAt: new Date().toISOString() });

  return { ok: true, profile: mergedProfile, itemsConsidered: base.itemsConsidered || 0, ineligibleCount: base.ineligibleCount || 0, overridesApplied: overrides.length, error: null };
}

/** CRUD-only read for the four standalone types (Business Rule / Document
 *  Template / Section Requirement / Priority Rule) — no computed baseline. */
export function listApprovedOverrides(domainType, overrideType) {
  if (!isStandaloneType(overrideType)) {
    return { ok: false, overrides: [], error: { code: 'NOT_STANDALONE_TYPE', message: `"${overrideType}" overlays a computed profile — see getEffectiveProfile() instead.` } };
  }
  return { ok: true, overrides: approvedOverrides(domainType, overrideType), error: null };
}
