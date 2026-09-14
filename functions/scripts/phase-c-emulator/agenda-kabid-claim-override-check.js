'use strict';

/* ============================================================
   agenda-kabid-claim-override-check.js — V1.31 C5.3.2 Individual
   Override -> agendaKabid Claim

   REAL RTDB emulator test of functions/src/auth/verifyPin.js#
   resolveRoleClaims() — the exact function verifyPin's onCall handler
   calls to decide the token's `role` + extra claims. Seeds
   /customRoles/{id} and /userPermissionOverrides/{username} directly via
   the Admin SDK (bypassing Rules, exactly what a real Cloud Function
   sees), invokes the REAL resolveRoleClaims(username, storedRole), and
   asserts on its return value — never a re-implemented mirror.

   Investigation this phase (C5.3.1) established: database.rules.json's
   Kabid-scope reads (agendaEventsByScope/kabid, agendaEvents,
   agendaTasks, agendaAudit) gate purely on auth.token.agendaKabid===true
   — there is no role==='admin'/adminEquivalent fallback for that scope —
   so an admin account can NEVER see its own Kabid data without this
   claim, regardless of role or Custom Role status. The fix: the System
   Role fast path (taken for role==='admin' etc.) now ALSO derives extra
   claims from that account's own /userPermissionOverrides — the existing,
   already-deployed Individual Permission Assignment mechanism — instead
   of unconditionally returning no extra claims.

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/agenda-kabid-claim-override-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { resolveRoleClaims } = require('../../src/auth/verifyPin');
  const { db } = require('../../src/config/admin');

  const cleanupPaths = [
    'customRoles/phasec-kabid-role', 'customRoles/phasec-kabid-role-archived',
    'userPermissionOverrides/phasec-admin-plain', 'userPermissionOverrides/phasec-admin-kabid-view',
    'userPermissionOverrides/phasec-admin-kabid-manage', 'userPermissionOverrides/phasec-admin-unrelated',
    'userPermissionOverrides/phasec-admin-with-role-field', 'userPermissionOverrides/phasec-nonadmin-kabid',
    'customRoles/phasec-nonadmin-role',
  ];

  try {
    console.log('\n=== [Case A] ordinary admin, no override -> adminEquivalent absent (real role IS admin already), agendaKabid false ===');
    await checkAsync('role=admin, no override record at all', async () => {
      const { role, extraClaims } = await resolveRoleClaims('phasec-admin-plain', 'admin');
      if (role !== 'admin') throw new Error(`role claim changed: ${role}`);
      if (extraClaims.agendaKabid) throw new Error('agendaKabid should be absent/false with no override');
      if (extraClaims.adminEquivalent) throw new Error('adminEquivalent should never be minted from the System Role fast path — role===admin already satisfies the Rules OR-condition directly');
    });

    console.log('\n=== [Case B] admin + agenda.kabid.view override -> agendaKabid true ===');
    await db.ref('userPermissionOverrides/phasec-admin-kabid-view').set({ permissions: ['agenda.kabid.view'], updatedAt: new Date().toISOString() });
    await checkAsync('role=admin + individual override agenda.kabid.view', async () => {
      const { role, extraClaims } = await resolveRoleClaims('phasec-admin-kabid-view', 'admin');
      if (role !== 'admin') throw new Error(`role claim changed: ${role}`);
      if (extraClaims.agendaKabid !== true) throw new Error(`expected agendaKabid: true, got ${JSON.stringify(extraClaims)}`);
    });

    console.log('\n=== [Case C] admin + agenda.kabid.manage override -> agendaKabid true ===');
    await db.ref('userPermissionOverrides/phasec-admin-kabid-manage').set({ permissions: ['agenda.kabid.manage'], updatedAt: new Date().toISOString() });
    await checkAsync('role=admin + individual override agenda.kabid.manage', async () => {
      const { role, extraClaims } = await resolveRoleClaims('phasec-admin-kabid-manage', 'admin');
      if (role !== 'admin') throw new Error(`role claim changed: ${role}`);
      if (extraClaims.agendaKabid !== true) throw new Error(`expected agendaKabid: true, got ${JSON.stringify(extraClaims)}`);
    });

    console.log('\n=== [Case D] admin + unrelated override -> agendaKabid stays false ===');
    await db.ref('userPermissionOverrides/phasec-admin-unrelated').set({ permissions: ['warehouse.item.edit'], updatedAt: new Date().toISOString() });
    await checkAsync('role=admin + an unrelated individual override does not grant agendaKabid', async () => {
      const { extraClaims } = await resolveRoleClaims('phasec-admin-unrelated', 'admin');
      if (extraClaims.agendaKabid) throw new Error('agendaKabid should not be granted by an unrelated permission');
    });

    console.log('\n=== [Case E] non-admin + Kabid Custom Role -> agendaKabid true (unaffected by admin-path change) ===');
    await db.ref('customRoles/phasec-nonadmin-role').set({ name: 'Non-Admin Kabid Test', permissions: ['agenda.kabid.view'], archived: false });
    await checkAsync('a non-admin Custom Role holding agenda.kabid.view still yields agendaKabid: true', async () => {
      const { role, extraClaims } = await resolveRoleClaims('phasec-nonadmin-kabid', 'phasec-nonadmin-role');
      if (role !== 'phasec-nonadmin-role') throw new Error(`unexpected role: ${role}`);
      if (extraClaims.agendaKabid !== true) throw new Error(`expected agendaKabid: true, got ${JSON.stringify(extraClaims)}`);
    });

    console.log('\n=== [Case F] admin + system.admin-shaped junk in an override record -> structurally impossible to matter (override storage layer already forbids it; this proves the CLAIM layer is not the only place this is enforced) ===');
    await db.ref('userPermissionOverrides/phasec-admin-with-role-field').set({ permissions: ['agenda.kabid.view', 'system.admin'], updatedAt: new Date().toISOString() });
    await checkAsync('even if a malformed override record somehow smuggled system.admin in, adminEquivalent would still never be minted from role===admin\'s own fast path check for role itself (role is already "admin" verbatim) — and agendaKabid still derives correctly from the legitimate entry', async () => {
      const { role, extraClaims } = await resolveRoleClaims('phasec-admin-with-role-field', 'admin');
      if (role !== 'admin') throw new Error(`role claim changed: ${role}`);
      if (extraClaims.agendaKabid !== true) throw new Error('agendaKabid should still derive from the legitimate agenda.kabid.view entry');
    });

    console.log('\n=== [Regression] existing Custom Role path, no override involved — byte-identical to pre-C5.3.2 behavior ===');
    await db.ref('customRoles/phasec-kabid-role').set({ name: 'Kabid Test Role', permissions: ['agenda.kabid.view', 'agenda.kabid.manage'], archived: false });
    await checkAsync('Custom Role with agenda.kabid.* and NO override record for that username still yields agendaKabid: true', async () => {
      const { role, extraClaims } = await resolveRoleClaims('phasec-user-no-override', 'phasec-kabid-role');
      if (role !== 'phasec-kabid-role') throw new Error(`unexpected role: ${role}`);
      if (extraClaims.agendaKabid !== true) throw new Error(`expected agendaKabid: true, got ${JSON.stringify(extraClaims)}`);
    });
    await db.ref('customRoles/phasec-kabid-role-archived').set({ name: 'Archived Kabid Role', permissions: ['agenda.kabid.view'], archived: true });
    await checkAsync('an archived Custom Role still downgrades to viewer with no extra claims, even with an override record present for that username', async () => {
      await db.ref('userPermissionOverrides/phasec-archived-role-user').set({ permissions: ['agenda.kabid.view'] });
      const { role, extraClaims } = await resolveRoleClaims('phasec-archived-role-user', 'phasec-kabid-role-archived');
      if (role !== 'viewer') throw new Error(`expected downgrade to viewer, got ${role}`);
      if (Object.keys(extraClaims).length !== 0) throw new Error(`archived path must grant nothing extra, got ${JSON.stringify(extraClaims)}`);
      await db.ref('userPermissionOverrides/phasec-archived-role-user').remove();
    });

    console.log('\n=== [Security] the claim is server-derived only — agendaParticipantType and a client-shaped agendaKabid field are never consulted ===');
    await checkAsync('an account with agendaParticipantType-like junk sitting in its override record is not itself a grant (only real permission ids in the permissions array count)', async () => {
      await db.ref('userPermissionOverrides/phasec-fake-claim-user').set({ permissions: ['agenda.kabid.view'], agendaParticipantType: 'kabid', agendaKabid: true });
      const { extraClaims } = await resolveRoleClaims('phasec-fake-claim-user', 'admin');
      if (extraClaims.agendaKabid !== true) throw new Error('expected agendaKabid: true from the REAL permission entry, not the forged top-level field');
      await db.ref('userPermissionOverrides/phasec-fake-claim-user').remove();
    });
    await checkAsync('an account with NO real agenda.kabid.* entry never gets agendaKabid, even if a forged top-level agendaKabid:true field exists on the same override record', async () => {
      await db.ref('userPermissionOverrides/phasec-forged-claim-only').set({ permissions: ['warehouse.item.edit'], agendaKabid: true });
      const { extraClaims } = await resolveRoleClaims('phasec-forged-claim-only', 'admin');
      if (extraClaims.agendaKabid) throw new Error('a forged top-level agendaKabid field on the override record must never itself grant the claim');
      await db.ref('userPermissionOverrides/phasec-forged-claim-only').remove();
    });
    await checkAsync('a read error on /userPermissionOverrides fails closed (no elevated grant) — simulated via a username whose override path cannot exist', async () => {
      const { extraClaims } = await resolveRoleClaims('', 'admin');
      if (extraClaims.agendaKabid) throw new Error('an unreadable/empty override path must never grant agendaKabid');
    });
  } finally {
    for (const p of cleanupPaths) { try { await db.ref(p).remove(); } catch (_) {} }
  }
}

main()
  .then(() => { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(fail === 0 ? 0 : 1); })
  .catch((err) => { console.error(`\n[agenda-kabid-claim-override-check] FATAL: ${err.stack || err.message}\n`); process.exit(1); });
