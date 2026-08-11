/* suite-registry.mjs — RTDB Authorization Validation Suite (v1.30.7.x,
   Phase C: Cloud Function & Server-Side Authorization Validation)

   PURE data module, no Firebase, no execution logic — mirrors
   scripts/rtdb-emulator/suite-registry.mjs's role for Phase A/B exactly.
   The single, explicit, ordered source of truth for every check filename
   Phase C is expected to run. Both run-all-checks.mjs (which executes
   this list) and suite-registry-meta-check.mjs (which proves this list
   is trustworthy — every entry exists on disk, and no *-check.js file on
   disk is missing from this list) import this SAME array.

   Order: notification-dispatcher-check.js first (it's the file this
   whole program's first Phase C finding — v1.30.7.7 — was built and
   verified against; keeping it first means a future regression in the
   highest-stakes function surfaces earliest), then the remaining tiers
   in the priority order they were investigated and built. */

export const SUITE_REGISTRY = Object.freeze([
  // Infrastructure self-check — proves the safety guard itself fails
  // loudly on a bad emulator host and succeeds against the real one,
  // BEFORE trusting any of the security assertions below it. Lives in
  // _lib/ (infrastructure, not a normal test target) but is still a
  // full member of the run — deliberately registered by hand since
  // _lib/ is not scanned by the top-level orphan-detection in
  // suite-registry-meta-check.mjs (matching Phase A/B's precedent of a
  // non-recursive directory scan).
  '_lib/safety-guard-meta-check.js',

  'notification-dispatcher-check.js',
  'credential-service-check.js',
  'backup-and-counter-check.js',
  'profile-mirror-check.js',
  'remaining-oncall-check.js',
  'remaining-triggers-check.js',
  'http-functions-check.js',
]);
