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
  // v1.30.14.4 — onAssignmentOdometerSync: the trigger's own Admin-SDK
  // vehicles/{id}/odometer transaction stays leaf-scoped, monotonic,
  // idempotent, and fail-closed on an unresolvable vehicle name.
  'vehicle-odometer-sync-check.js',
  'http-functions-check.js',
  // V1.31 Agenda & To-Do, Phase C2 — server-side operational foundation
  // (audit/lifecycle-event triggers, derived-index sync, /reminders
  // timer-queue extension). See docs/AGENDA_TODO_PHASE_C2_*.md.
  'agenda-triggers-check.js',
  // V1.31 Agenda & To-Do, Phase C5.3.2 — existed on disk but was never
  // added here (found during V1.31.1's own test-inventory audit; this
  // suite's own suite-registry-meta-check.mjs was silently failing this
  // exact gap on every run until now). Registering it, not fixing the
  // test itself — it was already complete and correct.
  'agenda-kabid-claim-override-check.js',
  // V1.31.1 "Agenda, Kalender & To-Do" — the Calendar entity's own trigger
  // triple (audit/lifecycle-event, derived-index sync, /reminders
  // timer-queue), mirroring agenda-triggers-check.js's coverage.
  'agenda-calendar-triggers-check.js',
]);
