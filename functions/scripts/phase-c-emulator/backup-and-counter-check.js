'use strict';

/* ============================================================
   backup-and-counter-check.js — RTDB Authorization Validation Suite
   (v1.30.7.x, Phase C: Cloud Function & Server-Side Authorization
   Validation)

   Investigation summary (functions/src/maintenance/backupTick.js,
   functions/src/reimbursement/counter.js read in full):

     backupTick — onSchedule, ZERO client input (the handler ignores its
     event argument entirely; no caller to authorize at all). Value here
     is confirming its OWN Admin SDK writes stay correctly scoped: reads
     /assignments and /settings/system/backupRetentionDays, writes ONLY
     under /backups/assignments/*, deletes ONLY entries older than the
     retention cutoff. The retention-cutoff MATH itself is already
     pure-logic tested by scripts/rtdb-hardening-functions-check.mjs —
     not duplicated here; this file's job is confirming the REAL function
     does the right thing against REAL (emulated) data, not re-deriving
     the boundary-case arithmetic.

     acquireReimbursementNumber — v1.30.11.6 hotfix: this Phase C finding
     turned out to be WRONG. It reasoned "no data exposure, no spam/
     enumeration vector" from reading counter.js in isolation, but never
     traced the actual client call chain: js/modal.js's reimbursement
     button DOES have a real cross-driver abuse path (its `assignments`
     array is the full unfiltered collection, not the driver-scoped one
     the dashboard renders), and this callable was the ONLY server-side
     stop that could have caught a client that bypassed/lacked the
     client-side ownership check. It now requires assignmentId, resolves
     the assignment via Admin SDK (never trusts the client's dateStr), and
     enforces the same admin-bypass/driver-owns-it model already used for
     Start/Complete/Cancel (js/modal.js#canActOnAssignment) — mirroring
     notifyAdminsOfNewRequest's own resolve-then-authorize pattern, which
     this file's own comment above already held up as the harder standard
     this function wasn't meeting.

   Run standalone during development:
     firebase emulators:exec --only database "node functions/scripts/phase-c-emulator/backup-and-counter-check.js"
   Normally run via: npm run test:functions-emulator (exit 0 = pass) */

const { assertSafeEmulatorOrExit } = require('./_lib/safety-guard');

let pass = 0, fail = 0;
async function checkAsync(name, run) {
  try { await run(); pass++; console.log(`  ✓ ${name}`); }
  catch (err) { fail++; console.log(`  ✗ ${name} — ${err.message}`); }
}

async function main() {
  await assertSafeEmulatorOrExit();

  const { makeCallableRequest } = require('./_lib/fixtures');
  const { backupTick } = require('../../src/maintenance/backupTick');
  const { acquireReimbursementNumber } = require('../../src/reimbursement/counter');
  const { db } = require('../../src/config/admin');

  try {
    console.log('\n=== backupTick — Admin SDK write scoping (no caller to authorize; onSchedule) ===');
    await db.ref('assignments').remove();
    await db.ref('backups/assignments').remove();
    await db.ref('settings/system/backupRetentionDays').remove();

    await checkAsync('empty /assignments → no backup written, no crash', async () => {
      await backupTick.run();
      const backups = (await db.ref('backups/assignments').once('value')).val();
      if (backups) throw new Error(`expected no backups written for empty assignments, got ${JSON.stringify(backups)}`);
    });

    await db.ref('assignments/phasecAssignment1').set({ driverUsername: 'driverA', status: 'assigned' });
    await checkAsync('non-empty /assignments → a backup is written under /backups/assignments/{ts}', async () => {
      await backupTick.run();
      const backups = (await db.ref('backups/assignments').once('value')).val() || {};
      const keys = Object.keys(backups);
      if (keys.length !== 1) throw new Error(`expected exactly 1 backup entry, got ${keys.length}: ${JSON.stringify(keys)}`);
      if (!backups[keys[0]].phasecAssignment1) throw new Error('backup content does not match the seeded /assignments snapshot');
    });

    await checkAsync('a backup older than the retention window is pruned; a recent one is kept', async () => {
      await db.ref('backups/assignments').remove();
      const oldKey = '2020-01-01-000000';   // far older than any retention window
      const recentKey = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '') + '-keep';
      await db.ref(`backups/assignments/${oldKey}`).set({ phasecAssignment1: { driverUsername: 'driverA' } });
      await db.ref(`backups/assignments/${recentKey}`).set({ phasecAssignment1: { driverUsername: 'driverA' } });
      await db.ref('settings/system/backupRetentionDays').set(30);
      await backupTick.run();
      const after = (await db.ref('backups/assignments').once('value')).val() || {};
      if (after[oldKey]) throw new Error('expected the old (2020) backup to be pruned, but it still exists');
      if (!Object.keys(after).some((k) => k !== oldKey)) throw new Error('expected at least one recent backup to survive pruning');
    });

    await db.ref('assignments').remove();
    await db.ref('backups/assignments').remove();
    await db.ref('settings/system/backupRetentionDays').remove();

    console.log('\n=== acquireReimbursementNumber — authentication + per-assignment ownership required ===');
    await db.ref('assignments/rmbOwnA').set({ driverUsername: 'driverA', date: '2026-08-10', status: 'assigned' });
    await db.ref('assignments/rmbOwnB').set({ driverUsername: 'driverB', date: '2026-08-11', status: 'assigned' });

    await checkAsync('unauthenticated caller REJECTED', async () => {
      try {
        await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbOwnA' }, uid: null }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('missing assignmentId REJECTED', async () => {
      try {
        await acquireReimbursementNumber.run(makeCallableRequest({ data: {}, uid: 'driverA', claims: { role: 'driver' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('unknown assignmentId REJECTED (not-found, not silently allowed)', async () => {
      try {
        await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'doesNotExist' }, uid: 'driverA', claims: { role: 'driver' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'not-found') throw new Error(`expected 'not-found', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('driver requesting THEIR OWN assignment ALLOWED', async () => {
      const result = await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbOwnA' }, uid: 'driverA', claims: { role: 'driver' } }));
      if (!/^PBSI\/RMB\/2026\/08\/\d{4}$/.test(result.docNumber)) throw new Error(`unexpected docNumber format: ${JSON.stringify(result)}`);
    });
    await checkAsync("driver requesting ANOTHER driver's assignment REJECTED (the actual bug this hotfix closes)", async () => {
      try {
        await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbOwnB' }, uid: 'driverA', claims: { role: 'driver' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'permission-denied') throw new Error(`expected 'permission-denied', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('admin requesting ANY assignment ALLOWED (existing legitimate access preserved)', async () => {
      const result = await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbOwnB' }, uid: 'anAdmin', claims: { role: 'admin' } }));
      if (!/^PBSI\/RMB\/2026\/08\/\d{4}$/.test(result.docNumber)) throw new Error(`unexpected docNumber format: ${JSON.stringify(result)}`);
    });
    await checkAsync('adminEquivalent (non-"admin" role, permission-derived claim) ALLOWED, same as admin', async () => {
      const result = await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbOwnB' }, uid: 'anAdminEquiv', claims: { role: 'developer', adminEquivalent: true } }));
      if (!/^PBSI\/RMB\/2026\/08\/\d{4}$/.test(result.docNumber)) throw new Error(`unexpected docNumber format: ${JSON.stringify(result)}`);
    });
    await checkAsync("bidang REJECTED (no reimbursement access in this app's role model — not inventing one here)", async () => {
      try {
        await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbOwnA' }, uid: 'someBidang', claims: { role: 'bidang' } }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'permission-denied') throw new Error(`expected 'permission-denied', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync("dateStr is derived from the resolved assignment record, NOT trusted from the client (a mismatched client dateStr is ignored)", async () => {
      const result = await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbOwnA', dateStr: '2099-01-01' }, uid: 'driverA', claims: { role: 'driver' } }));
      if (!result.docNumber.startsWith('PBSI/RMB/2026/08/')) throw new Error(`expected the assignment's own 2026/08 date to win over the client-supplied 2099-01, got ${JSON.stringify(result)}`);
    });
    await checkAsync('sequential calls in the same month increment atomically (no duplicate/skipped numbers)', async () => {
      await db.ref('assignments/rmbSeq1').set({ driverUsername: 'seqDriver', date: '2026-09-01', status: 'assigned' });
      await db.ref('assignments/rmbSeq2').set({ driverUsername: 'seqDriver', date: '2026-09-15', status: 'assigned' });
      const first = await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbSeq1' }, uid: 'seqDriver', claims: { role: 'driver' } }));
      const second = await acquireReimbursementNumber.run(makeCallableRequest({ data: { assignmentId: 'rmbSeq2' }, uid: 'seqDriver', claims: { role: 'driver' } }));
      const firstN = Number(first.docNumber.split('/').pop());
      const secondN = Number(second.docNumber.split('/').pop());
      if (secondN !== firstN + 1) throw new Error(`expected sequential increment, got ${firstN} then ${secondN}`);
    });
  } finally {
    await db.ref('assignments').remove();
    await db.ref('backups/assignments').remove();
    await db.ref('settings/system/backupRetentionDays').remove();
    await db.ref('reimbursement_counters/2026_08').remove();
    await db.ref('reimbursement_counters/2026_09').remove();
  }
}

main()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\n[backup-and-counter-check] FATAL: ${err.stack || err.message}\n`);
    process.exit(1);
  });
