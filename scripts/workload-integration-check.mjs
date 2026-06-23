/* workload-integration-check.mjs — end-to-end check of Driver Workload
   Intelligence (v1.16.4.8) through the REAL analytics engine and the Driver
   PDF report-model projection. Run: node scripts/workload-integration-check.mjs */
import { computeAnalyticsModel } from '../js/analytics/analytics-engine.js';
import { buildDriverReportModel } from '../js/exports/analytics/model/driver-report-model.js';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}`); } };

const iso = (date, h, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();

// Mon 2026-06-22 (weekday), Sat 2026-06-20 (weekend).
function asg(id, driver, date, sh, eh, km, vehicle = 'Innova') {
  return {
    id, driver, vehicle, date, status: 'completed',
    startTime: `${String(sh).padStart(2, '0')}:00`, endTime: `${String(eh).padStart(2, '0')}:00`,
    startedAt: iso(date, sh), completedAt: iso(date, eh),
    distanceTravelled: km, destination: 'Kantor',
  };
}

const assignments = [
  // Driver A — many short, low-distance trips (3 × 2h, 50km).
  asg('a1', 'Andi', '2026-06-22', 9, 11, 50),
  asg('a2', 'Andi', '2026-06-23', 9, 11, 50),
  asg('a3', 'Andi', '2026-06-24', 9, 11, 50),
  // Driver B — fewer but long, high-distance trips (2 × 8h, 500km).
  asg('b1', 'Budi', '2026-06-22', 8, 16, 500),
  asg('b2', 'Budi', '2026-06-23', 8, 16, 500),
  // Driver C — one no-vehicle assignment (distance 0) on a weekend (Sat).
  { ...asg('c1', 'Cici', '2026-06-20', 10, 14, 0, ''), distanceTravelled: null },
];

const drivers = [
  { name: 'Andi', active: true }, { name: 'Budi', active: true }, { name: 'Cici', active: true },
];
const ctx = {
  assignments, requests: [], drivers, vehicles: [{ name: 'Innova' }],
  office: { workStartMins: 540, workEndMins: 1020 },
  filters: { dateRange: 'all', driver: '', vehicle: '', bidang: '' },
  aliases: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
  dismissed: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
  normalizeAssignmentStatus: (a) => a,
};

const model = computeAnalyticsModel(ctx);
const wl = model.diagnostics.workload;

console.log('Engine — workload diagnostics:');
check('workload block present', !!wl);
check('3 drivers scored', wl.drivers.length === 3);
check('Budi (long hours + high km) is paling aktif', wl.palingAktif.name === 'Budi');
// Budi maxes hours+distance (index 100/100) but Andi has more trips, so Budi's
// assignmentIndex = 2/3 → score = 0.45·100 + 0.30·100 + 0.25·67 ≈ 92. No single
// driver hits 100 here — exactly the point of a composite (count alone ≠ winner).
check('Budi score ≈ 92 (composite, not a perfect 100)', wl.palingAktif.score === 92);
check('Andi scores below Budi despite more trips', byScore('Andi') < byScore('Budi'));
check('weekendAssignments KPI = 1 (Cici Sat)', model.kpis.weekendAssignments === 1);
check('totalActualHours = 3·2 + 2·8 + 1·4 = 26', Math.abs(model.kpis.totalActualHours - 26) < 1e-6);

// No-vehicle driver (Cici) — distance 0 but still scored via hours + assignments.
const cici = wl.drivers.find(d => d.name === 'Cici');
check('no-vehicle Cici is scored', !!cici && cici.score > 0);
check('no-vehicle Cici distance contribution = 0%', cici.contribution.distance === 0);
check('no-vehicle Cici weekend tally = 1', cici.weekend === 1);

console.log('\nParity — render + exportSnapshot untouched by workload:');
check('render has NO workload key (parity-locked)', model.render.workload === undefined);
check('exportSnapshot has NO workload key', model.exportSnapshot.workload === undefined);

console.log('\nDriver PDF report-model projection:');
const rep = buildDriverReportModel(model, { periodLabel: 'Semua Data', appVersion: 'test' });
check('distribution label is workload-based', /Beban Kerja/.test(rep.distribution.label));
check('distribution rows sorted by score (Budi first)', rep.distribution.rows[0].name === 'Budi');
check('distribution note carries the formula weights', /Jam 45%/.test(rep.distribution.note) && /Jarak 30%/.test(rep.distribution.note));
check('distribution note names the most-active driver', /Paling aktif: Budi/.test(rep.distribution.note));
check('KPI grid includes Jam Kerja Aktual', rep.kpis.some(c => c.label === 'Jam Kerja Aktual'));

function byScore(name) { return wl.drivers.find(d => d.name === name).score; }

console.log(`\nworkload-integration-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
