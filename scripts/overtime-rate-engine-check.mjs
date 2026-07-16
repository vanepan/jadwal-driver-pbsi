/* overtime-rate-engine-check.mjs — pins js/overtime/overtime-rate-engine.js,
   including the new resolveDefaultRateVersion() backdated-entry fallback
   (UX Refinement bug fix — "Belum tersedia" must never show for a
   non-holiday date as long as a Default Rate exists somewhere).
   Run: node scripts/overtime-rate-engine-check.mjs (exit 0 = pass) */

import {
  RATE_TIERS, DEFAULT_TIER_KEY, isValidTierKey, tierLabel,
  resolveActiveRateVersion, versionsForTier, resolveDefaultRateVersion,
} from '../js/overtime/overtime-rate-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('[baseline sanity — pre-existing functions]');
check('RATE_TIERS has the 3 known tiers', RATE_TIERS.length === 3 && RATE_TIERS.some(t => t.key === 'normal'));
check('DEFAULT_TIER_KEY is normal', DEFAULT_TIER_KEY === 'normal');
check('isValidTierKey true for a real tier', isValidTierKey('normal') === true);
check('isValidTierKey false for junk', isValidTierKey('nonsense') === false);
check('tierLabel falls back to the raw key for an unknown tier', tierLabel('nonsense') === 'nonsense');

const versions = [
  { id: 'v1', tierKey: 'normal', amount: 100000, effectiveFrom: '2026-07-01', isActive: true, createdAt: 1 },
  { id: 'v2', tierKey: 'normal', amount: 120000, effectiveFrom: '2026-08-01', isActive: true, createdAt: 2 },
  { id: 'v3', tierKey: 'nationalHoliday', amount: 200000, effectiveFrom: '2026-07-01', isActive: true, createdAt: 3 },
];

console.log('[resolveActiveRateVersion — unchanged strict behavior]');
check('resolves the latest qualifying version for a date within range', resolveActiveRateVersion(versions, 'normal', '2026-07-15').id === 'v1');
check('resolves the newer version once its effectiveFrom is reached', resolveActiveRateVersion(versions, 'normal', '2026-08-15').id === 'v2');
check('returns null for a date BEFORE any version exists (strict, no fallback)', resolveActiveRateVersion(versions, 'normal', '2026-01-01') === null);
check('returns null for a tier with zero versions', resolveActiveRateVersion(versions, 'specialEvent', '2026-07-15') === null);

console.log('[resolveDefaultRateVersion — the bug fix]');
check('matches strict resolution when a version genuinely qualifies (no fallback needed)', resolveDefaultRateVersion(versions, 'normal', '2026-07-15').id === 'v1');
check('matches strict resolution after a newer version takes effect', resolveDefaultRateVersion(versions, 'normal', '2026-08-15').id === 'v2');
check('BACKDATED entry (before the earliest effectiveFrom) falls back to the earliest version, never null', resolveDefaultRateVersion(versions, 'normal', '2026-01-01').id === 'v1');
check('a tier with zero versions at all still returns null (no rate exists to fall back to)', resolveDefaultRateVersion(versions, 'specialEvent', '2026-01-01') === null);
check('fallback picks the EARLIEST by effectiveFrom, not just the first array entry', (() => {
  const shuffled = [
    { id: 'later', tierKey: 'normal', amount: 999, effectiveFrom: '2026-09-01', isActive: true, createdAt: 9 },
    { id: 'earliest', tierKey: 'normal', amount: 1, effectiveFrom: '2026-05-01', isActive: true, createdAt: 1 },
  ];
  return resolveDefaultRateVersion(shuffled, 'normal', '2026-01-01').id === 'earliest';
})());
check('holiday tiers are unaffected — resolveActiveRateVersion (called directly) stays strict for them', resolveActiveRateVersion(versions, 'nationalHoliday', '2026-01-01') === null);

console.log('\n' + '─'.repeat(50));
console.log(`Overtime Rate Engine: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
