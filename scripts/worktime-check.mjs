/* worktime-check.mjs — validates computeWorkTime() overtime matrix (v1.16.4.7).
   Run: node scripts/worktime-check.mjs  (exit 0 = all pass) */
import { computeWorkTime } from '../js/utils.js';

const OFFICE = { workStartMins: 540, workEndMins: 1020 }; // 09:00–17:00
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Mon 2026-06-22 = weekday. Sat 2026-06-20 / Sun 2026-06-21 = weekend.
const iso = (date, h, m) => new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`).toISOString();

// 1. Weekday inside office hours → Normal
let r = computeWorkTime({ startedAt: iso('2026-06-22', 10, 0), completedAt: iso('2026-06-22', 14, 0), startTime: '10:00', endTime: '14:00' }, OFFICE);
check('weekday in-office → not overtime', r.isOvertime === false);
check('weekday in-office actualHours = 4', approx(r.actualHours, 4));
check('weekday in-office overtimeHours = 0', approx(r.overtimeHours, 0));
check('weekday in-office variance = 0', approx(r.varianceHours, 0));

// 2. Weekday ending after office close (17:00) → Lembur (outside_office)
r = computeWorkTime({ startedAt: iso('2026-06-22', 15, 0), completedAt: iso('2026-06-22', 19, 0), startTime: '15:00', endTime: '17:00' }, OFFICE);
check('weekday late → overtime', r.isOvertime === true);
check('weekday late → reason outside_office', r.overtimeReason === 'outside_office');
check('weekday late overtimeHours = 2 (17:00–19:00)', approx(r.overtimeHours, 2));

// 3. Weekday starting before office open (09:00) → Lembur
r = computeWorkTime({ startedAt: iso('2026-06-22', 7, 0), completedAt: iso('2026-06-22', 11, 0), startTime: '07:00', endTime: '11:00' }, OFFICE);
check('weekday early → overtime', r.isOvertime === true);
check('weekday early overtimeHours = 2 (07:00–09:00)', approx(r.overtimeHours, 2));

// 4. Saturday any time → Lembur (weekend), full duration counts
r = computeWorkTime({ startedAt: iso('2026-06-20', 10, 0), completedAt: iso('2026-06-20', 13, 0), startTime: '10:00', endTime: '13:00' }, OFFICE);
check('saturday → overtime', r.isOvertime === true);
check('saturday → reason weekend', r.overtimeReason === 'weekend');
check('saturday overtimeHours = full 3h', approx(r.overtimeHours, 3));

// 5. Sunday → Lembur weekend
r = computeWorkTime({ startedAt: iso('2026-06-21', 12, 0), completedAt: iso('2026-06-21', 12, 30), startTime: '12:00', endTime: '12:30' }, OFFICE);
check('sunday → overtime weekend', r.isOvertime === true && r.overtimeReason === 'weekend');

// 6. No-vehicle assignment still computes working hours
r = computeWorkTime({ vehicle: '', startedAt: iso('2026-06-22', 9, 30), completedAt: iso('2026-06-22', 12, 30), startTime: '09:30', endTime: '12:30' }, OFFICE);
check('no-vehicle actualHours = 3', approx(r.actualHours, 3));
check('no-vehicle in-office → not overtime', r.isOvertime === false);

// 7. Started but not completed → in-progress (null overtime, null actualHours)
r = computeWorkTime({ startedAt: iso('2026-06-22', 9, 0), completedAt: null, startTime: '09:00', endTime: '12:00' }, OFFICE);
check('in-progress → actualHours null', r.actualHours === null);
check('in-progress → isOvertime null', r.isOvertime === null);
check('in-progress → hasStarted true', r.hasStarted === true && r.hasCompleted === false);

// 8. Not started → all null/false, scheduledHours still derived
r = computeWorkTime({ startedAt: null, completedAt: null, startTime: '09:00', endTime: '17:00' }, OFFICE);
check('scheduled-only scheduledHours = 8', approx(r.scheduledHours, 8));
check('scheduled-only isOvertime null', r.isOvertime === null);

// ── Overtime Administration (v1.16.4.9) — detection vs final + override matrix ──

// 9. Auto Normal: detection + final NORMAL, source AUTO (weekday in-office)
r = computeWorkTime({ startedAt: iso('2026-06-22', 10, 0), completedAt: iso('2026-06-22', 14, 0) }, OFFICE);
check('auto normal → detectionStatus AUTO_NORMAL', r.detectionStatus === 'AUTO_NORMAL');
check('auto normal → finalStatus NORMAL', r.finalStatus === 'NORMAL');
check('auto normal → source AUTO', r.overtimeSource === 'AUTO');

// 10. Auto Lembur: detection + final LEMBUR, source AUTO (weekday late)
r = computeWorkTime({ startedAt: iso('2026-06-22', 15, 0), completedAt: iso('2026-06-22', 19, 0) }, OFFICE);
check('auto lembur → detectionStatus AUTO_LEMBUR', r.detectionStatus === 'AUTO_LEMBUR');
check('auto lembur → finalStatus LEMBUR', r.finalStatus === 'LEMBUR');

// 11. Auto Normal → Manual Lembur: final LEMBUR, isOvertime true, hours = full engaged
r = computeWorkTime({ startedAt: iso('2026-06-22', 10, 0), completedAt: iso('2026-06-22', 14, 0), overtimeOverride: 'LEMBUR', overtimeOverrideReason: 'Pendampingan Event Nasional' }, OFFICE);
check('override→lembur: detection still AUTO_NORMAL', r.detectionStatus === 'AUTO_NORMAL');
check('override→lembur: finalStatus LEMBUR', r.finalStatus === 'LEMBUR');
check('override→lembur: isOvertime true (analytics follows final)', r.isOvertime === true);
check('override→lembur: source MANUAL', r.overtimeSource === 'MANUAL');
check('override→lembur: overtimeHours = actualHours (4)', approx(r.overtimeHours, 4));
check('override→lembur: reason passed through', r.overtimeOverrideReason === 'Pendampingan Event Nasional');

// 12. Auto Lembur → Manual Normal: final NORMAL, isOvertime false, hours = 0
r = computeWorkTime({ startedAt: iso('2026-06-20', 10, 0), completedAt: iso('2026-06-20', 13, 0), overtimeOverride: 'NORMAL', overtimeOverrideReason: 'Bukan lembur resmi' }, OFFICE);
check('override→normal: detection still AUTO_LEMBUR', r.detectionStatus === 'AUTO_LEMBUR');
check('override→normal: finalStatus NORMAL', r.finalStatus === 'NORMAL');
check('override→normal: isOvertime false (analytics follows final)', r.isOvertime === false);
check('override→normal: overtimeHours = 0 (no Jam Lembur)', approx(r.overtimeHours, 0));

// 13. Override ignored before completion (no actuals → no final status)
r = computeWorkTime({ startedAt: iso('2026-06-22', 9, 0), completedAt: null, overtimeOverride: 'LEMBUR' }, OFFICE);
check('override pre-completion: finalStatus null', r.finalStatus === null);
check('override pre-completion: source AUTO (not applied)', r.overtimeSource === 'AUTO');

// 14. Legacy assignment (no override field) → backward compatible, source AUTO
r = computeWorkTime({ startedAt: iso('2026-06-22', 10, 0), completedAt: iso('2026-06-22', 14, 0) }, OFFICE);
check('legacy: no crash, source AUTO', r.overtimeSource === 'AUTO' && r.overtimeOverrideReason === null);

// 15. Invalid override value is ignored (treated as no override)
r = computeWorkTime({ startedAt: iso('2026-06-22', 10, 0), completedAt: iso('2026-06-22', 14, 0), overtimeOverride: 'GARBAGE' }, OFFICE);
check('invalid override ignored → source AUTO', r.overtimeSource === 'AUTO');
check('invalid override ignored → finalStatus NORMAL', r.finalStatus === 'NORMAL');

console.log(`\nworktime-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
