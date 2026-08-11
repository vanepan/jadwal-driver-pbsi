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

     acquireReimbursementNumber — onCall; requires only request.auth.uid,
     NO role check at all. Distinguished explicitly from
     notifyAdminsOfNewRequest's finding: this is a monotonic counter with
     no data exposure and no spam/enumeration vector — "any authenticated
     staff member can generate a reimbursement document number" reads as
     plausibly intentional (reimbursement is not a role-gated business
     action elsewhere in this app), unlike notifyAdminsOfNewRequest's
     unrelated-user notification-fan-out abuse path. Documented factually
     as a no-role-check fact below, NOT escalated through the STOP
     protocol — there is no plausible abuse path, only "broad by design."

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

    console.log('\n=== acquireReimbursementNumber — authentication required; NO role check (documented, not a spam/enumeration vector) ===');
    await checkAsync('unauthenticated caller REJECTED', async () => {
      try {
        await acquireReimbursementNumber.run(makeCallableRequest({ data: { dateStr: '2026-08-10' }, uid: null }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'unauthenticated') throw new Error(`expected 'unauthenticated', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync('malformed dateStr REJECTED', async () => {
      try {
        await acquireReimbursementNumber.run(makeCallableRequest({ data: { dateStr: 'not-a-date' }, uid: 'someone' }));
        throw new Error('expected rejection');
      } catch (err) {
        if (err.code !== 'invalid-argument') throw new Error(`expected 'invalid-argument', got '${err.code}': ${err.message}`);
      }
    });
    await checkAsync("FACTUAL: an authenticated 'viewer' (no reimbursement-specific role in this system) CAN mint a document number — no role gate exists", async () => {
      const result = await acquireReimbursementNumber.run(makeCallableRequest({ data: { dateStr: '2026-08-10' }, uid: 'a-viewer', claims: { role: 'viewer' } }));
      if (!/^PBSI\/RMB\/2026\/08\/\d{4}$/.test(result.docNumber)) throw new Error(`unexpected docNumber format: ${JSON.stringify(result)}`);
    });
    await checkAsync('sequential calls in the same month increment atomically (no duplicate/skipped numbers)', async () => {
      const first = await acquireReimbursementNumber.run(makeCallableRequest({ data: { dateStr: '2026-09-01' }, uid: 'someone' }));
      const second = await acquireReimbursementNumber.run(makeCallableRequest({ data: { dateStr: '2026-09-15' }, uid: 'someone-else' }));
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
