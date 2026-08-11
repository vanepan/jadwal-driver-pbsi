'use strict';

/* ============================================================
   maintenance/backupTick.js — daily /assignments backup + prune
   (RTDB Security Hardening Program, Phase 3 — v1.30.6.6)

   Moves /backups off client RTDB access entirely, mirroring the exact
   "Client -> Cloud Function -> Admin SDK -> RTDB, .write: false" pattern
   already established by the Credential Service (v1.30.6.2) and by
   registerPushSubscription/unregisterPushSubscription (v1.11.3).

   Previously: js/firebase.js#_backupAssignmentsOnce()/_pruneOldBackups()
   ran client-side, triggered opportunistically by whichever browser
   session happened to be first to load /assignments on a given day, with
   a localStorage guard (`pbsi_backup_done_${today}`) to stop every other
   client from repeating it. A real onSchedule function removes the need
   for that guard entirely — it runs exactly once, server-side, regardless
   of how many (or how few) clients are online.

   Retention reads settings/system/backupRetentionDays (Admin SDK — not
   subject to Phase 2's settings rule, same as every other Cloud Function
   read) with the same default the client used.
   ============================================================ */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { db } = require('../config/admin');
const { REGION } = require('../config/constants');

const DEFAULT_RETENTION_DAYS = 30;

const backupTick = onSchedule(
  { schedule: 'every day 02:00', timeZone: 'Asia/Jakarta', region: REGION },
  async () => {
    const assignmentsSnap = await db.ref('assignments').once('value');
    if (!assignmentsSnap.exists()) {
      logger.info('[backup] no assignments — skipping');
      return;
    }

    const ts = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '');
    try {
      await db.ref(`backups/assignments/${ts}`).set(assignmentsSnap.val());
      logger.info('[backup] created', { ts });
    } catch (err) {
      logger.error('[backup] write failed', { ts, error: err.message });
      return; // don't prune off the back of a failed backup
    }

    let retentionDays = DEFAULT_RETENTION_DAYS;
    try {
      const retentionSnap = await db.ref('settings/system/backupRetentionDays').once('value');
      const val = Number(retentionSnap.val());
      if (Number.isFinite(val) && val > 0) retentionDays = val;
    } catch (err) {
      logger.warn('[backup] retention setting read failed, using default', { error: err.message });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffPrefix = cutoff.toISOString().slice(0, 10);

    try {
      const backupsSnap = await db.ref('backups/assignments').once('value');
      if (!backupsSnap.exists()) return;
      const keys = Object.keys(backupsSnap.val());
      const toDelete = keys.filter((key) => key.slice(0, 10) < cutoffPrefix);
      for (const key of toDelete) {
        await db.ref(`backups/assignments/${key}`).remove();
      }
      if (toDelete.length) logger.info('[backup] pruned', { count: toDelete.length, retentionDays });
    } catch (err) {
      logger.warn('[backup] prune failed (non-fatal)', { error: err.message });
    }
  }
);

module.exports = { backupTick };
