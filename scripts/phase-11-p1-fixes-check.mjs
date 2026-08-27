/* phase-11-p1-fixes-check.mjs — Design System Program Phase 11 (Administration)

   Static source-verification for the three P1 fixes from the Phase 11
   Administration audit (docs/DESIGN_SYSTEM_PROGRAM_PHASE_11_ADMINISTRATION_AUDIT.md):

     - Roles D-1: the real role-usage provider must be registered at
       session boot (startAuthenticatedSession), not lazily on first visit
       to the Users screen — otherwise an admin who goes straight to
       Control -> Roles gets the always-zero default provider and the
       archive-safety guard silently no-ops.
     - Users U-2: the V2 quick Deactivate/Activate/Archive actions must
       confirm before mutating.
     - Users U-3: the V2 quick Deactivate/Activate toggle must audit-log
       on success, matching every sibling user-mutating action.

   Method: static source inspection of js/app.js (js/app.js has zero
   exports and would fire a real Firebase read against PRODUCTION if
   imported directly for a live DOM/behavioral test — see
   [[design-system-program]] / [[firebase-prod-in-local-testing]] memory —
   so this checks the real function bodies textually, the same "static
   architecture check" class of verification this program's own audit
   brief explicitly lists as a legitimate, strong method).

   Run: node scripts/phase-11-p1-fixes-check.mjs (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     • ' + String(detail).slice(0, 300)); }
};

// A brace-depth function-body extractor is unreliable against this file:
// several functions contain template-literal HTML with unbalanced-looking
// `{`/`}` (e.g. inline style attributes, ${...} expressions) that a naive
// counter misreads, overshooting by thousands of lines. Both functions
// checked below are small, so a bounded slice (signature -> next N chars,
// capped short of the next sibling declaration) is simpler and reliable.
function sliceAfter(src, signatureText, maxChars) {
  const idx = src.indexOf(signatureText);
  if (idx === -1) return null;
  return src.slice(idx, idx + signatureText.length + maxChars);
}

console.log('[Phase 11] P1 fixes — static source verification\n');

/* ── Roles D-1: role-usage provider registered at session boot ── */
console.log('[1] Roles D-1 — real role-usage provider registered at session boot, not lazily');

const sessionBootBody = sliceAfter(appJs, 'async function startAuthenticatedSession()', 3800);
check('startAuthenticatedSession() found', !!sessionBootBody);
check('startAuthenticatedSession() registers the REAL role-usage provider (registerRoleUsageProvider({ getUsage: getRoleUsageFromUsers }))',
  !!sessionBootBody && /registerRoleUsageProvider\(\s*\{\s*getUsage:\s*getRoleUsageFromUsers\s*\}\s*\)/.test(sessionBootBody));

const navUsersBody = sliceAfter(appJs, 'async function navManajemenUser() {', 1500);
check('navManajemenUser() found', !!navUsersBody);
check('navManajemenUser() ends before the next sibling function (slice window did not overrun)',
  !!navUsersBody && /\nfunction navKonfigurasiGlobal/.test(navUsersBody));
check('navManajemenUser() no longer independently CALLS the role-usage provider registration (moved to boot; the function may still mention it in a comment)',
  !!navUsersBody && !/registerRoleUsageProvider\(\s*\{/.test(navUsersBody.slice(0, navUsersBody.indexOf('\nfunction navKonfigurasiGlobal'))));
check('navManajemenUser() still initializes the Custom Roles store (unrelated to D-1, must not have been removed)',
  !!navUsersBody && /initCustomRolesStore\(\)/.test(navUsersBody));

/* ── Users U-2 / U-3: confirm + audit log on quick actions ── */
console.log('\n[2] Users U-2/U-3 — confirmation + audit log on Deactivate/Activate/Archive');

const toggleBlockMatch = /list\.querySelectorAll\('\[data-user-toggle\]'\)\.forEach\(btn => \{([\s\S]*?)\n  \}\);/.exec(appJs);
const toggleBody = toggleBlockMatch ? toggleBlockMatch[1] : null;
check('data-user-toggle handler found', !!toggleBody);
check('U-2: toggle handler calls confirm() before mutating', !!toggleBody && /if\s*\(!confirm\(/.test(toggleBody));
check('U-3: toggle handler logs \'user_deactivated\' on the deactivate path', !!toggleBody && /action:\s*'user_deactivated'/.test(toggleBody));
check('U-3: toggle handler logs \'user_reactivated\' on the activate path', !!toggleBody && /action:\s*'user_reactivated'/.test(toggleBody));
check('U-3: toggle handler shows a success toast on both paths', !!toggleBody && (toggleBody.match(/showToast\('User berhasil/g) || []).length >= 2);

const archiveBlockMatch = /list\.querySelectorAll\('\[data-user-archive\]'\)\.forEach\(btn => \{([\s\S]*?)\n  \}\);/.exec(appJs);
const archiveBody = archiveBlockMatch ? archiveBlockMatch[1] : null;
check('data-user-archive handler found', !!archiveBody);
check('U-2: archive handler calls confirm() before mutating', !!archiveBody && /if\s*\(!confirm\(/.test(archiveBody));
check('archive handler still logs user_archived (must not have regressed)', !!archiveBody && /action:\s*'user_archived'/.test(archiveBody));

/* ── Audit trail plumbing: labels + detail-view cases exist for the new actions ── */
console.log('\n[3] Audit Center plumbing for the two new action types');
check('AUDIT_ACTION_LABELS has user_deactivated', /user_deactivated:\s*'User Dinonaktifkan'/.test(appJs));
check('AUDIT_ACTION_LABELS has user_reactivated', /user_reactivated:\s*'User Diaktifkan'/.test(appJs));
check("detail-view switch has a case 'user_deactivated'", /case 'user_deactivated':/.test(appJs));
check("detail-view switch has a case 'user_reactivated'", /case 'user_reactivated':/.test(appJs));

/* ── Roles D-4: nav-visibility reacts to a live Custom Roles change ── */
console.log('\n[4] Roles D-4 — updatePermissionUI() re-runs on a live Custom Roles change');
check('startAuthenticatedSession() registers a Custom-Roles change listener that calls updatePermissionUI()',
  !!sessionBootBody && /registerCustomRolesChangeListener\(\(\) => updatePermissionUI\(\)\);/.test(sessionBootBody));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
