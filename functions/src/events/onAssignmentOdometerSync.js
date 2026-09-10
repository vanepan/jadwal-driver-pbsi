'use strict';

/* ============================================================
   events/onAssignmentOdometerSync.js — authoritative vehicle-odometer sync

   ROOT CAUSE this fixes: when a driver / bidang completes an assignment the
   client (js/app.js registerCompleteCallback → js/vehicles-store.js
   updateVehicleOdometer → updateFirebaseData('vehicles/{id}', …)) tries to
   advance vehicles/{id}.odometer, but database.rules.json restricts
   /vehicles .write to admin || adminEquivalent. The write is DENIED and the
   rejection was swallowed by a console.warn, so vehicles/{id}.odometer stays
   stale and the NEXT assignment prefills (and, since f8517f1, LOCKS) that
   stale value.

   This trigger is the TRUSTED server-side writer. It runs with the Functions
   runtime's service-account credentials (Admin SDK bypasses RTDB rules), is
   NARROWLY scoped — it only ever writes the single leaf
   vehicles/{vehicleId}/odometer — and it fires on the SAME /assignments write
   the client already made, regardless of who made it.

   Guarantees:
     • MONOTONIC   — writes only when endOdometer > current vehicle.odometer;
                     a late-arriving old completion can never move it backward.
     • IDEMPOTENT  — a re-run for the same completion is a no-op (the monotonic
                     check inside a transaction makes repeated execution safe).
     • FAIL-CLOSED — an assignment whose `vehicle` name is missing or resolves
                     to 0 / >1 vehicle records is logged and NOT written.
     • NO LOOP     — it writes /vehicles only; no /vehicles trigger exists, and
                     onAssignmentWrite (the /assignments event emitter) is
                     untouched.

   It does NOT touch the assignment record, its status, endOdometer,
   distanceTravelled, driver, or vehicle — completion has already persisted
   those. It does NOT weaken any RTDB rule. It does NOT change f8517f1.

   Pure decision logic lives in ./odometerSyncLogic.js (unit-tested in plain
   Node — functions/scripts/vehicle-odometer-sync-check.js).
   ============================================================ */

const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const { REGION, DB_INSTANCE } = require('../config/constants');
const { db } = require('../config/admin');
const { shouldSyncOdometer, resolveVehicleForSync, nextOdometerValue } = require('./odometerSyncLogic');

const onAssignmentOdometerSync = onValueWritten(
  { ref: '/assignments/{assignmentId}', region: REGION, instance: DB_INSTANCE },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const assignmentId = event.params.assignmentId;

    const decision = shouldSyncOdometer(before, after);
    if (!decision.sync) return;

    let vehiclesNode;
    try {
      vehiclesNode = (await db.ref('vehicles').once('value')).val() || {};
    } catch (err) {
      logger.error('[onAssignmentOdometerSync] /vehicles read failed — NOT writing', {
        assignmentId, error: err.message,
      });
      return;
    }

    const resolved = resolveVehicleForSync(decision.vehicleName, vehiclesNode);
    if (!resolved.ok) {
      logger.error('[onAssignmentOdometerSync] vehicle resolution failed — NOT writing (fail-closed)', {
        assignmentId,
        vehicleName: decision.vehicleName,
        reason: resolved.reason,
        candidates: resolved.candidates || null,
      });
      return;
    }

    const end = decision.endOdometer;
    let result;
    try {
      result = await db.ref(`vehicles/${resolved.vehicleId}/odometer`)
        .transaction((cur) => nextOdometerValue(cur, end));
    } catch (err) {
      logger.error('[onAssignmentOdometerSync] transaction failed', {
        assignmentId, vehicleId: resolved.vehicleId, endOdometer: end, error: err.message,
      });
      return;
    }

    if (result && result.committed) {
      logger.info('[onAssignmentOdometerSync] vehicle odometer advanced', {
        assignmentId,
        vehicleId: resolved.vehicleId,
        vehicleName: decision.vehicleName,
        normalizedNameMatch: !!resolved.normalized,
        to: end,
      });
    } else {
      logger.info('[onAssignmentOdometerSync] no-op — vehicle already at/above endOdometer', {
        assignmentId, vehicleId: resolved.vehicleId, endOdometer: end,
      });
    }
  },
);

module.exports = {
  onAssignmentOdometerSync,
  // re-export the pure helpers so the emulator suite can import from one place
  shouldSyncOdometer, resolveVehicleForSync, nextOdometerValue,
};
