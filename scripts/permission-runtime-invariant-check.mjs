/* permission-runtime-invariant-check.mjs — Permission Runtime Migration,
   Sub-phase A (v1.30.5)

   DOM test, real wired code (not a mirror) — follows the
   role-management-edit-dom-check.mjs convention: serves the static app,
   drives headless Chromium against scripts/role-management-harness.html (no
   app.js boot), seeds a fake session in localStorage (never real Firebase
   auth — js/firebase.js always targets the real production database, even
   from local scripts).

   THE INVARIANT this guards, permanently: the effective permission set
   js/permission-service.js#listPermissions() returns for the CURRENT
   session must exactly match the set js/role-management/role-catalog.js
   #resolveGrantedSet() reports for that same role — the same computation
   Role Management's own Role Summary panel shows an admin. If these two
   ever silently fork, an admin could look at Role Management and see one
   answer while the runtime enforces another — precisely the "UI shows
   permissions it doesn't enforce" failure mode this whole migration exists
   to close (docs/USER_MANAGEMENT_INTEGRATION_REPORT_v1.30.4.md §9).

   Covers every System Role (config/role-registry.js ROLES) plus a seeded
   Custom Role (__seedCustomRolesForTest — bypasses Firebase, same
   test-only convention role-management-edit-dom-check.mjs already uses).
   No Firebase write is attempted anywhere in this script — can()/
   listPermissions()/resolveGrantedSet() are all pure reads.

   One KNOWN, INTENTIONAL exception is asserted explicitly rather than
   silently skipped: an ARCHIVED Custom Role's runtime access must be empty
   (fail-closed — permission-service.js's security contract), even though
   role-catalog.js#resolveGrantedSet() itself does not check archived status
   (it answers "what does this role definition list", an informational/
   historical question Role Management may reasonably ask about an archived
   role; it is never consulted for live enforcement). See permission-
   service.js's permissionSetFor() doc comment.

   Run: node scripts/permission-runtime-invariant-check.mjs (exit 0 = pass) */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const consoleErrors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/scripts/role-management-harness.html`, { waitUntil: 'networkidle0', timeout: 45000 });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const result = await page.evaluate(async () => {
  const svc = await import('/js/permission-service.js');
  const catalog = await import('/js/role-management/role-catalog.js');
  const store = await import('/js/role-management/custom-roles-store.js');
  const registry = await import('/js/config/role-registry.js');

  const setLoggedInAs = (role) => {
    localStorage.setItem('pbsi_current_user', JSON.stringify({
      id: 'invariant-test', username: 'invariant-test', name: 'Invariant Test', role, active: true,
    }));
  };
  const setsEqual = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

  const out = { systemRoleResults: [] };

  // ── Every System Role: runtime resolution must equal Role Summary's own
  //    computation, exactly. ──────────────────────────────────────────
  for (const role of registry.ROLES) {
    setLoggedInAs(role.id);
    const runtimeSet = new Set(svc.listPermissions());
    const summarySet = catalog.resolveGrantedSet({ id: role.id, type: 'system' });
    out.systemRoleResults.push({ roleId: role.id, ok: setsEqual(runtimeSet, summarySet), runtimeSize: runtimeSet.size, summarySize: summarySet.size });
  }

  // ── Seed one active Custom Role, log in as it, compare the same way. ──
  store.__seedCustomRolesForTest([
    { id: 'invariant-custom-active', name: 'Invariant Custom Role', permissions: ['warehouse.view', 'warehouse.item.edit', 'overtime.view'], archived: false },
    { id: 'invariant-custom-archived', name: 'Invariant Archived Role', permissions: ['system.admin'], archived: true },
  ]);

  setLoggedInAs('invariant-custom-active');
  const activeRuntimeSet = new Set(svc.listPermissions());
  const activeSummarySet = catalog.resolveGrantedSet({ id: 'invariant-custom-active', type: 'custom' });
  out.customActiveOk = setsEqual(activeRuntimeSet, activeSummarySet) && activeRuntimeSet.size === 3;

  // ── Archived Custom Role: runtime must fail closed regardless of what
  //    resolveGrantedSet() (an informational/historical lookup) reports. ──
  setLoggedInAs('invariant-custom-archived');
  const archivedRuntimeSet = new Set(svc.listPermissions());
  const archivedSummarySet = catalog.resolveGrantedSet({ id: 'invariant-custom-archived', type: 'custom' });
  out.archivedRuntimeFailsClosed = archivedRuntimeSet.size === 0;
  out.archivedSummaryStillShowsHistoricalGrant = archivedSummarySet.size === 1; // documents the intentional divergence

  // ── Unresolvable role id (never assigned to a real role) also fails closed. ──
  setLoggedInAs('totally-unknown-role-id');
  out.unknownRoleFailsClosed = svc.listPermissions().length === 0;

  return out;
});

for (const r of result.systemRoleResults) {
  check(`${r.roleId}: runtime permission set (${r.runtimeSize}) matches Role Summary (${r.summarySize}) exactly`, r.ok);
}
check('active Custom Role: runtime matches Role Summary exactly (3 permissions)', result.customActiveOk);
check('archived Custom Role: runtime enforcement fails closed (0 permissions)', result.archivedRuntimeFailsClosed);
check('archived Custom Role: Role Summary still reports its historical grant (1) — intentional, documented divergence, not a bug', result.archivedSummaryStillShowsHistoricalGrant);
check('an unresolvable role id fails closed at runtime', result.unknownRoleFailsClosed);

/* ══════════════════════════════════════════════════════════════════════
   PHASE 2 (v1.30.9.5) — Individual Permission Assignment, Runtime
   Resolution. Drives the REAL wired chain: permission-service.js#can()/
   listPermissions()/hasAny()/hasAll()/cannot() ->
   individual-permission-provider.js -> user-permission-overrides-
   store.js's live per-username cache — not a mirror. Uses the store's
   new __seedUserPermissionOverridesForTest()/
   __resetUserPermissionOverridesLiveForTest() test-only hooks, same
   convention as custom-roles-store.js#__seedCustomRolesForTest().
   ══════════════════════════════════════════════════════════════════════ */
const phase2 = await page.evaluate(async () => {
  const svc = await import('/js/permission-service.js');
  const store = await import('/js/permission-management/user-permission-overrides-store.js');
  const individualProvider = await import('/js/permission-management/individual-permission-provider.js');
  const customRolesStore = await import('/js/role-management/custom-roles-store.js');
  const rolePerm = await import('/js/config/role-permissions.js');

  const setLoggedInAs = (role, username) => {
    localStorage.setItem('pbsi_current_user', JSON.stringify({
      id: username, username, name: username, role, active: true,
    }));
  };
  const setsEqual = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

  // Mirror of app.js#MODULE_PERMISSIONS + #canAccessModule() — app.js itself
  // is DOM-booting and not importable in this harness (same constraint
  // canAccessModule-check.mjs already documents); canAccessModule() has no
  // logic beyond this lookup + can(), so exercising it through the REAL
  // svc.can() below is equivalent to exercising canAccessModule() itself.
  const MODULE_PERMISSIONS = {
    engineering: 'eng.view', driverops: 'driver.schedule.view', pettycash: 'pettycash.view',
    overtime: 'overtime.view', analytics: 'analytics.view', konfigurasi: 'konfigurasi.view',
    roleManagement: 'system.admin', gudang: 'warehouse.view',
  };
  const canAccessModuleAs = (name) => { const p = MODULE_PERMISSIONS[name]; return p ? svc.can(p) : false; };

  const out = {};

  // ── System Role + override: real can()/listPermissions()/hasAny()/hasAll()/cannot()/canAccessModule() ──
  setLoggedInAs('viewer', 'phase2-user-a');
  store.__resetUserPermissionOverridesLiveForTest();
  out.viewerNoOverrideMatchesBase = setsEqual(new Set(svc.listPermissions()), new Set(rolePerm.ROLE_PERMISSIONS.viewer));
  out.viewerNoOverrideCannotAccessPettycash = !canAccessModuleAs('pettycash');

  store.__seedUserPermissionOverridesForTest('phase2-user-a', ['pettycash.view']);
  out.viewerOverrideCan = svc.can('pettycash.view');
  out.viewerOverrideListIncludes = svc.listPermissions().includes('pettycash.view');
  out.viewerOverrideHasAny = svc.hasAny(['pettycash.view', 'nonexistent.permission']);
  out.viewerOverrideHasAll = svc.hasAll(['driver.schedule.view', 'pettycash.view']);
  out.viewerOverrideCannotIsFalseForGranted = !svc.cannot('pettycash.view');
  out.viewerOverrideCanAccessModule = canAccessModuleAs('pettycash');
  out.viewerBaseStillCannotWarehouse = svc.cannot('warehouse.view');

  // ── system.admin can NEVER become effective through an override ──
  store.__seedUserPermissionOverridesForTest('phase2-user-a', ['system.admin', 'pettycash.view']);
  out.systemAdminAloneNeverEffective = !svc.can('system.admin');
  out.systemAdminMixedStillGrantsValidOne = svc.can('pettycash.view');
  out.systemAdminNotInListPermissions = !svc.listPermissions().includes('system.admin');
  out.roleManagementModuleStillInaccessible = !canAccessModuleAs('roleManagement');

  // ── Custom Role + override (active) ──
  customRolesStore.__seedCustomRolesForTest([
    { id: 'phase2-custom-active', name: 'Phase2 Custom Active', permissions: ['warehouse.view'], archived: false },
    { id: 'phase2-custom-archived', name: 'Phase2 Custom Archived', permissions: ['warehouse.view', 'warehouse.item.edit'], archived: true },
    // v1.30.9.10 — Custom Role Protected Permission Security Hardening:
    // this fixture (and its consuming assertions below) used to be named
    // "AdminEquiv" and asserted svc.can('system.admin') === TRUE for it —
    // NOT because 'adminEquivalent' is a real concept a Custom Role's
    // permission list controls (it isn't; that claim is minted exclusively
    // by verifyPin.js), but because this test was, in effect, encoding the
    // pre-hardening VULNERABILITY as if it were intended behavior: a
    // Custom Role holding 'system.admin' in its own persisted permissions
    // really did grant real system.admin to every user assigned it. Kept
    // as __seedCustomRolesForTest() test-only data (bypasses the new
    // write-time validation entirely, same as it always has) specifically
    // BECAUSE that lets this exact legacy-invalid shape be proven fail-safe
    // at the READ/runtime layer below, independent of write-time
    // prevention — see permission-service.js#NEVER_EFFECTIVE_IN_CUSTOM_ROLE_BASE.
    { id: 'phase2-custom-legacy-god-mode', name: 'Phase2 Legacy God Mode', permissions: ['system.admin'], archived: false },
  ]);
  setLoggedInAs('phase2-custom-active', 'phase2-user-b');
  store.__seedUserPermissionOverridesForTest('phase2-user-b', ['pettycash.view']);
  out.customRoleOverrideUnion = setsEqual(new Set(svc.listPermissions()), new Set(['warehouse.view', 'pettycash.view']));

  // ── Archived Custom Role + override — v1.30.9.5 decision: base collapses
  //    to EMPTY_SET, override survives independently, base is NOT resurrected ──
  setLoggedInAs('phase2-custom-archived', 'phase2-user-c');
  store.__seedUserPermissionOverridesForTest('phase2-user-c', ['pettycash.view']);
  out.archivedCustomRoleOverrideSurvives = setsEqual(new Set(svc.listPermissions()), new Set(['pettycash.view']));
  out.archivedCustomRoleOwnGrantsNotResurrected = !svc.can('warehouse.view');

  // ── admin / adminEquivalent semantics: overrides never alter them ──
  setLoggedInAs('admin', 'phase2-admin');
  store.__seedUserPermissionOverridesForTest('phase2-admin', ['pettycash.view']);
  out.adminUnaffectedByOverride = setsEqual(new Set(svc.listPermissions()), new Set(rolePerm.ROLE_PERMISSIONS.admin));

  setLoggedInAs('phase2-custom-legacy-god-mode', 'phase2-user-d');
  store.__resetUserPermissionOverridesLiveForTest();
  // v1.30.9.10 SECURITY: this used to assert TRUE — the exact vulnerability
  // this hardening task closes. A Custom Role's own persisted permissions
  // (legacy-invalid data, or a rules bypass) can no longer make
  // system.admin effective, full stop, independent of any override.
  out.legacyCustomRoleNeverHasSystemAdminEvenWithNoOverride = !svc.can('system.admin');
  store.__seedUserPermissionOverridesForTest('phase2-user-d', ['pettycash.view']);
  out.legacyCustomRoleStillNeverHasSystemAdminWithUnrelatedOverride = !svc.can('system.admin');
  out.legacyCustomRoleUnrelatedOverrideStillLands = svc.can('pettycash.view'); // filtering, not a blanket deny

  setLoggedInAs('phase2-custom-active', 'phase2-user-e'); // Custom Role WITHOUT system.admin
  store.__seedUserPermissionOverridesForTest('phase2-user-e', ['pettycash.view']);
  out.customRoleWithoutSystemAdminStaysNonAdmin = !svc.can('system.admin');

  // ── Identity isolation: user A's override must never leak into user B ──
  setLoggedInAs('viewer', 'phase2-identity-a');
  store.__seedUserPermissionOverridesForTest('phase2-identity-a', ['pettycash.view']);
  out.identityAHasX = svc.can('pettycash.view');

  store.__resetUserPermissionOverridesLiveForTest(); // simulates the logout/reload boundary
  setLoggedInAs('viewer', 'phase2-identity-b');
  out.identityBDoesNotInheritX = !svc.can('pettycash.view');

  store.__seedUserPermissionOverridesForTest('phase2-identity-b', ['overtime.view']);
  out.identityBHasY = svc.can('overtime.view');
  out.identityBStillDoesNotHaveX = !svc.can('pettycash.view');
  // Defense-in-depth: the store's fail-closed identity guard must refuse to
  // answer for user A while the live cache is scoped to user B, even though
  // user A's grant was real and seeded earlier in this same session.
  out.identityGuardBlocksStaleLookup = individualProvider.getIndividualPermissionOverrides('phase2-identity-a').size === 0;

  // ── Unavailable / unauthenticated ──
  out.getIndividualGrantsForUnseededUsernameIsEmpty = individualProvider.getIndividualPermissionOverrides('never-seeded-user').size === 0;
  localStorage.removeItem('pbsi_current_user');
  out.unauthenticatedCanIsFalse = !svc.can('driver.schedule.view');
  out.unauthenticatedListIsEmpty = svc.listPermissions().length === 0;

  return out;
});

check('System Role, no override: listPermissions() matches base exactly (backward compat)', phase2.viewerNoOverrideMatchesBase);
check('System Role, no override: canAccessModule cluster unaffected (viewer cannot reach pettycash)', phase2.viewerNoOverrideCannotAccessPettycash);
check('can(): viewer + override sees the individually granted permission', phase2.viewerOverrideCan);
check('listPermissions(): includes the individually granted permission', phase2.viewerOverrideListIncludes);
check('hasAny(): true when the override satisfies one of the asked permissions', phase2.viewerOverrideHasAny);
check('hasAll(): true when base + override together satisfy every asked permission', phase2.viewerOverrideHasAll);
check('cannot(): false (i.e. can) for an individually granted permission', phase2.viewerOverrideCannotIsFalseForGranted);
check('canAccessModule(): an override can open a module the base role could not reach', phase2.viewerOverrideCanAccessModule);
check('canAccessModule(): an unrelated module remains inaccessible after an unrelated override', phase2.viewerBaseStillCannotWarehouse);
check('SECURITY: system.admin alone in an override is NEVER effective', phase2.systemAdminAloneNeverEffective);
check('SECURITY: system.admin mixed with a valid permission — the valid one still lands, system.admin does not', phase2.systemAdminMixedStillGrantsValidOne);
check('SECURITY: system.admin never appears in listPermissions() via override', phase2.systemAdminNotInListPermissions);
check('SECURITY: an admin-only module (system.admin-gated) stays inaccessible despite the override attempt', phase2.roleManagementModuleStillInaccessible);
check('Custom Role (active) + override: effective = Custom Role grant UNION override', phase2.customRoleOverrideUnion);
check('Archived Custom Role + override: individual grant survives independently (v1.30.9.5 decision)', phase2.archivedCustomRoleOverrideSurvives);
check('Archived Custom Role + override: the archived role\'s OWN former grants are not resurrected', phase2.archivedCustomRoleOwnGrantsNotResurrected);
check('admin + override: admin\'s own permission set is unaffected (already a superset)', phase2.adminUnaffectedByOverride);
check('SECURITY (v1.30.9.10): a Custom Role holding system.admin in its OWN persisted permissions never has it effective, even with no override at all', phase2.legacyCustomRoleNeverHasSystemAdminEvenWithNoOverride);
check('SECURITY (v1.30.9.10): same Custom Role + an unrelated override — system.admin still never effective', phase2.legacyCustomRoleStillNeverHasSystemAdminWithUnrelatedOverride);
check('same Custom Role\'s unrelated override permission still lands (filtering, not a blanket deny)', phase2.legacyCustomRoleUnrelatedOverrideStillLands);
check('Custom Role WITHOUT system.admin + ordinary override: does NOT gain system.admin', phase2.customRoleWithoutSystemAdminStaysNonAdmin);
check('IDENTITY: user A\'s override is visible in user A\'s own session', phase2.identityAHasX);
check('IDENTITY: after the logout boundary, user B does NOT inherit user A\'s override', phase2.identityBDoesNotInheritX);
check('IDENTITY: user B\'s own override is visible in user B\'s session', phase2.identityBHasY);
check('IDENTITY: user B still does not have user A\'s override', phase2.identityBStillDoesNotHaveX);
check('IDENTITY: the store fails closed for a stale/mismatched username lookup, even with real prior data', phase2.identityGuardBlocksStaleLookup);
check('FAIL-CLOSED: an unseeded/unknown username has zero individual grants', phase2.getIndividualGrantsForUnseededUsernameIsEmpty);
check('FAIL-CLOSED: an unauthenticated session — can() is false', phase2.unauthenticatedCanIsFalse);
check('FAIL-CLOSED: an unauthenticated session — listPermissions() is empty', phase2.unauthenticatedListIsEmpty);

const fatal = consoleErrors.filter((e) =>
  /SyntaxError|ReferenceError|TypeError|is not a function|Failed to (load|fetch) module|Cannot use import|Unexpected token|does not provide an export/i.test(e)
);
check('zero fatal console errors (Firebase permission-denied noise is expected/informational)', fatal.length === 0);
if (fatal.length) fatal.forEach((e) => console.log('   ✗ fatal:', e));

console.log(`\n${pass} passed, ${fail} failed\n`);

await browser.close();
server.close();
process.exit(fail === 0 ? 0 : 1);
