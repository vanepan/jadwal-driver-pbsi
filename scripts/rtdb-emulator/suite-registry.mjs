/* suite-registry.mjs — RTDB Authorization Validation Suite (v1.30.7.5,
   Phase B refinement: explicit ordered suite registry)

   PURE data module, no Firebase, no execution logic. `SUITE_REGISTRY` is
   the single, explicit, ordered source of truth for every check filename
   this suite is expected to run — replacing the original filesystem-glob
   discovery in run-all-checks.mjs (`readdirSync(...).filter(f =>
   f.endsWith('-check.mjs'))`), which could silently pick up or silently
   miss a file with no record of what was actually supposed to run.

   Both `run-all-checks.mjs` (the orchestrator that executes this list) and
   `suite-registry-meta-check.mjs` (which proves this list is trustworthy —
   every entry exists on disk, and no `*-check.mjs` file on disk is missing
   from this list) import this SAME array. Adding a new check file to this
   suite means adding its name here — that edit is the suite's own record
   of what "the full suite" means, not an implicit filesystem scan.

   Order: the meta-check runs first (fail fast on a broken registry before
   spending time on anything else), then Phase A's 3 files, then Phase B's
   files in the order they were designed. */

export const SUITE_REGISTRY = Object.freeze([
  'suite-registry-meta-check.mjs',

  // Phase A (v1.30.7.1)
  'auth-identity-check.mjs',
  'role-claim-rules-check.mjs',
  'custom-role-archived-rule-check.mjs',

  // Phase B (v1.30.7.3 - v1.30.7.5)
  'assignments-driver-requests-ownership-check.mjs',
  'public-authenticated-nodes-check.mjs',
  'user-owned-nodes-check.mjs',
  'system-internal-and-append-only-check.mjs',
  'admin-owned-uniform-nodes-check.mjs',
  'gudang-nodes-check.mjs',
  'roster-nodes-full-sweep-check.mjs',
  'settings-sensitivity-check.mjs',
  'users-nodes-full-sweep-check.mjs',
  'engineering-nodes-check.mjs',

  // Individual Permission Assignment, Phase 1 (v1.30.9.1)
  'user-permission-overrides-check.mjs',

  // Production incident fix: /users collection-read defect (v1.30.9.2)
  'users-collection-read-check.mjs',

  // Role-Level Permission Assignment, Phase 4 (v1.30.9.9)
  'role-permission-overrides-check.mjs',

  // Custom Role Protected Permission Security Hardening (v1.30.9.10)
  'custom-role-protected-permission-check.mjs',

  // Dispatch Intelligence Authorization Hardening, Phase 5 (v1.30.9.11)
  'dispatch-intelligence-rule-check.mjs',

  // customRoles collection-read fix, reserved since v1.30.9.2 (v1.30.9.12)
  'custom-roles-collection-read-check.mjs',
]);
