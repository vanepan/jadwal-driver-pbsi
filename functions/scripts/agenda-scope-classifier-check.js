'use strict';

/* agenda-scope-classifier-check.js — pure unit test for
   functions/src/agenda/scopeClassifier.js#classifyCustomRole()
   (V1.31 Agenda & To-Do, Phase C2). No Firebase — classifyCustomRole()
   takes an already-fetched Custom Role record, no I/O of its own.
   resolveUserScope() (the DB-touching wrapper) is covered by the
   Functions-emulator integration test instead — see
   functions/scripts/phase-c-emulator/agenda-triggers-check.js.
   Requires a dummy FIREBASE_CONFIG only because requiring
   scopeClassifier.js pulls in config/admin.js for resolveUserScope()'s
   `db` (classifyCustomRole() itself never touches it) — see that file.
   Run: node functions/scripts/agenda-scope-classifier-check.js
   (exit 0 = pass) */

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"databaseURL":"https://demo-agenda-scope-classifier-check.firebaseio.com"}';

const { classifyCustomRole } = require('../src/agenda/scopeClassifier');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== [A — Kabid classification] ===');
check("a Custom Role with agenda.kabid.view -> 'kabid'",
  classifyCustomRole({ permissions: ['agenda.kabid.view'] }) === 'kabid');
check("a Custom Role with agenda.kabid.manage -> 'kabid'",
  classifyCustomRole({ permissions: ['agenda.kabid.manage'] }) === 'kabid');

console.log('\n=== [B — everything else classifies to null (not an error — just "no Agenda scope")] ===');
check('a Custom Role with unrelated permissions -> null',
  classifyCustomRole({ permissions: ['overtime.manage'] }) === null);
check('a Custom Role with NO permissions array -> null, no throw',
  classifyCustomRole({}) === null);
check('null record (nonexistent role) -> null', classifyCustomRole(null) === null);

console.log('\n=== [C — archived is a hard fail-closed, even if permissions would otherwise qualify] ===');
check('archived: true with agenda.kabid.view still present -> null (archived always wins)',
  classifyCustomRole({ archived: true, permissions: ['agenda.kabid.view'] }) === null);
check('archived: false with agenda.kabid.view -> kabid (archived must be exactly true to deny, not merely truthy-ish)',
  classifyCustomRole({ archived: false, permissions: ['agenda.kabid.view'] }) === 'kabid');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
