/* ============================================================
   OVERTIME-RATE-ENGINE.JS — pure rate-tier config + version resolution

   Mirrors js/petty-cash/bidang-matcher.js's shape: a small pure domain
   file, separate from store/service, that other modules (Holiday Engine
   in Sprint 4, Daily Entry in Sprint 5) call into without ever touching
   Firebase directly.

   Rate Versioning contract: rates are APPEND-ONLY. "Changing a rate"
   always means "create a new version with a new effectiveFrom" — never
   mutate an existing version's amount/tierKey/effectiveFrom in place.
   This is what lets Daily Entry snapshot the rate that was active on the
   record's date, permanently, even after the master rate later changes.

   PURE: no DOM, no Firebase, no side effects. Callers (overtime-service.js)
   fetch versions from the store and pass them in.
   ============================================================ */

'use strict';

/** The 3 known rate tiers (spec-illustrative). Not a hardcoded AMOUNT list —
    only the tier identity/label is fixed; amounts live in versioned records. */
export const RATE_TIERS = [
  { key: 'normal', label: 'Normal' },
  { key: 'nationalHoliday', label: 'National Holiday' },
  { key: 'specialEvent', label: 'Special Event' },
];

export function isValidTierKey(key) {
  return RATE_TIERS.some(t => t.key === key);
}

export function tierLabel(key) {
  const t = RATE_TIERS.find(t => t.key === key);
  return t ? t.label : key;
}

/**
 * The rate version active for `tierKey` on `atDateISO` — the non-deleted
 * version with the latest effectiveFrom <= atDateISO (ties broken by the
 * most recently created). Returns null when no version qualifies (e.g. a
 * fresh install before any version has been seeded, or a date before the
 * tier's first version).
 * @param {Array<Object>} versions - all overtimeRateVersions records
 * @param {string} tierKey
 * @param {string} atDateISO - yyyy-mm-dd
 */
export function resolveActiveRateVersion(versions, tierKey, atDateISO) {
  const candidates = (versions || [])
    .filter(v => v && v.tierKey === tierKey && v.isActive !== false && v.effectiveFrom <= atDateISO);
  if (!candidates.length) return null;
  return candidates.reduce((best, v) => {
    if (!best) return v;
    if (v.effectiveFrom !== best.effectiveFrom) return v.effectiveFrom > best.effectiveFrom ? v : best;
    return (v.createdAt || 0) > (best.createdAt || 0) ? v : best;
  }, null);
}

/** All non-deleted versions for a tier, newest effectiveFrom first. */
export function versionsForTier(versions, tierKey) {
  return (versions || [])
    .filter(v => v && v.tierKey === tierKey)
    .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '') || (b.createdAt || 0) - (a.createdAt || 0));
}
