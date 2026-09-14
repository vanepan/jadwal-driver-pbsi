'use strict';

/* agenda-kabid-claim-check.js — pure unit test for
   functions/src/auth/verifyPin.js#deriveExtraClaims() (V1.31 Agenda &
   To-Do, Phase C2). No Firebase, no emulator — deriveExtraClaims() has
   zero I/O, taking only an already-fetched permissions array.

   This is the SECURITY-CRITICAL gate for the agendaKabid claim: proves
   the claim is a pure function of the Custom Role's permissions array
   only — nothing resembling client input (a role id string, a display
   name, a request body field) can reach it, because this function's
   signature doesn't accept any of those.

   Requires a dummy FIREBASE_CONFIG (requiring verifyPin.js pulls in
   config/admin.js, which needs a resolvable databaseURL just to
   construct the handle — see config/admin.js; deriveExtraClaims() itself
   never touches it).
   Run: node functions/scripts/agenda-kabid-claim-check.js (exit 0 = pass) */

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"databaseURL":"https://demo-agenda-kabid-claim-check.firebaseio.com"}';

const { deriveExtraClaims } = require('../src/auth/verifyPin');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== [A — Kabid (agenda.kabid.view / agenda.kabid.manage)] ===');
check("permissions includes 'agenda.kabid.view' -> agendaKabid: true",
  deriveExtraClaims(['agenda.kabid.view']).agendaKabid === true);
check("permissions includes 'agenda.kabid.manage' -> agendaKabid: true",
  deriveExtraClaims(['agenda.kabid.manage']).agendaKabid === true);
check('both agenda.kabid.* present -> still just agendaKabid: true, no double-grant artifact',
  JSON.stringify(deriveExtraClaims(['agenda.kabid.view', 'agenda.kabid.manage'])) === JSON.stringify({ agendaKabid: true }));

console.log('\n=== [B — non-Kabid roles never get the claim] ===');
check('empty permissions array -> no agendaKabid', !deriveExtraClaims([]).agendaKabid);
check('unrelated permissions (e.g. overtime.manage) -> no agendaKabid',
  !deriveExtraClaims(['overtime.manage', 'pettycash.view']).agendaKabid);
check('null permissions (archived/missing-record fail-safe path) -> no agendaKabid, no throw',
  !deriveExtraClaims(null).agendaKabid);
check('undefined permissions -> no agendaKabid, no throw', !deriveExtraClaims(undefined).agendaKabid);
check('a non-array permissions value (defensive) -> no agendaKabid, no throw', !deriveExtraClaims('not-an-array').agendaKabid);

console.log('\n=== [C — system.admin and agendaKabid are independent, not mutually exclusive or implying each other] ===');
check("system.admin alone -> adminEquivalent: true, agendaKabid ABSENT (not merely false)",
  deriveExtraClaims(['system.admin']).adminEquivalent === true && !('agendaKabid' in deriveExtraClaims(['system.admin'])));
check('agenda.kabid.view alone -> agendaKabid: true, adminEquivalent ABSENT (Kabid is never admin-equivalent merely by holding this)',
  deriveExtraClaims(['agenda.kabid.view']).agendaKabid === true && !('adminEquivalent' in deriveExtraClaims(['agenda.kabid.view'])));
check('a role holding BOTH system.admin and agenda.kabid.view gets BOTH claims (not a conflict — a hypothetical "super admin who is also Kabid" is representable, even if the product never creates one)',
  (() => {
    const c = deriveExtraClaims(['system.admin', 'agenda.kabid.view']);
    return c.adminEquivalent === true && c.agendaKabid === true;
  })());

console.log('\n=== [D — signature proves no client-controllable input can reach this] ===');
check('deriveExtraClaims takes exactly one parameter (a permissions array) — no role id, no uid, no request object',
  require('../src/auth/verifyPin').deriveExtraClaims.length === 1);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
