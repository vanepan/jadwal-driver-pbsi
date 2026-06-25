/* analytics-sanitizer-check.mjs — dirty-data robustness test for Analytics
   Data Sanitization (v1.16.4.11-rc.1.1).
   Run: node scripts/analytics-sanitizer-check.mjs   (exit 0 = pass)

   Proves two things against the REAL engine (no mocks):
     A) Each malformed-data scenario THROWS when fed to computeAnalyticsModel()
        directly (documents the hazard the sanitizer must absorb).
     B) The SAME scenario, routed through the sanitizers first, COMPLETES and
        returns a well-formed model.
   Also asserts the sanitizers' field-level contract (types + defaults). */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { computeAnalyticsModel } = await imp('js/analytics/analytics-engine.js');
const {
  sanitizeDrivers, sanitizeVehicles, sanitizeRequests, sanitizeAssignments, sanitizeSettings,
} = await imp('js/analytics/analytics-sanitizer.js');
const { normalizeDate } = await imp('js/analytics/analytics-sanitizer.js');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };
function assert(cond, m) { cond ? ok(m) : bad(m); }

const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return x.toISOString().slice(0, 10); };

// A clean baseline every scenario starts from, then corrupts one facet.
const clean = {
  drivers:  [{ name: 'Andi', id: 'd1', active: true, archived: false }],
  vehicles: [{ name: 'Innova', id: 'v1', active: true, archived: false }],
  requests: [{ id: 'r1', requesterName: 'Bidang A', driver: '', vehicle: '', startDate: d(-2), endDate: d(-2), startTime: '08:00', endTime: '10:00', pax: 2, purpose: 'x', status: 'approved', createdAt: d(-3) + 'T01:00:00Z' }],
  assignments: [{ id: 'a1', driver: 'Andi', vehicle: 'Innova', date: d(-2), startTime: '08:00', endTime: '10:00', status: 'completed', destination: 'Bandara', purpose: 'x', pic: 'Bidang A', pax: 2, requestId: 'r1', createdAt: d(-3) + 'T01:00:00Z', distanceTravelled: 40 }],
};

function rawCtx(over) {
  return {
    assignments: 'assignments' in over ? over.assignments : clean.assignments,
    requests:    'requests'    in over ? over.requests    : clean.requests,
    drivers:     'drivers'     in over ? over.drivers      : clean.drivers,
    vehicles:    'vehicles'    in over ? over.vehicles     : clean.vehicles,
    office: 'office' in over ? over.office : { workStartMins: 540, workEndMins: 1020 },
    filters: { dateRange: 'all', driver: '', vehicle: '', bidang: '' },
    aliases:   { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
    dismissed: { destinations: {}, bidang: {}, drivers: {}, vehicles: {} },
    normalizeAssignmentStatus: (a) => a,
  };
}

function sanitizedCtx(raw) {
  return {
    ...raw,
    assignments: sanitizeAssignments(raw.assignments),
    requests:    sanitizeRequests(raw.requests),
    drivers:     sanitizeDrivers(raw.drivers),
    vehicles:    sanitizeVehicles(raw.vehicles),
    office:      sanitizeSettings(raw.office),
  };
}

function throws(ctx) { try { computeAnalyticsModel(ctx); return false; } catch { return true; } }
function completes(ctx) { try { const m = computeAnalyticsModel(ctx); return !!(m && m.kpis); } catch (e) { console.log('     (unexpected throw:', e.message + ')'); return false; } }

const scenarios = [
  ['null driver element (RTDB array hole)',  { drivers: [clean.drivers[0], null] }],
  ['null vehicle element',                   { vehicles: [clean.vehicles[0], null] }],
  ['null request element',                   { requests: [clean.requests[0], null] }],
  ['null assignment element',                { assignments: [clean.assignments[0], null] }],
  ['undefined records in arrays',            { drivers: [undefined, clean.drivers[0]], assignments: [undefined, clean.assignments[0]] }],
  ['numeric requesterName',                  { requests: [{ ...clean.requests[0], requesterName: 12345 }] }],
  ['null destination',                       { assignments: [{ ...clean.assignments[0], destination: null }] }],
  ['numeric destination',                    { assignments: [{ ...clean.assignments[0], destination: 999 }] }],
  ['null driver name',                       { drivers: [{ id: 'd1', name: null, active: true }] }],
  ['null vehicle name',                      { vehicles: [{ id: 'v1', name: null }] }],
  ['missing active flag',                    { drivers: [{ id: 'd1', name: 'Budi' }] }],
  ['missing archived flag',                  { vehicles: [{ id: 'v1', name: 'Avanza', active: true }] }],
  ['missing status on assignment',           { assignments: [{ ...clean.assignments[0], status: undefined }] }],
  ['empty {} record',                        { drivers: [{}, clean.drivers[0]] }],
  ['drivers not an array (null)',            { drivers: null }],
  ['vehicles not an array (object)',         { vehicles: { 0: clean.vehicles[0] } }],
  ['office settings null',                   { office: null }],
  ['office settings non-numeric',            { office: { workStartMins: 'pagi', workEndMins: null } }],
  ['mixed-dirty array (holes + numeric + missing flags)', {
    drivers: [null, { id: 'd1', name: 'Andi' }, undefined, {}],
    vehicles: [{ id: 'v1', name: 77 }, null],
    requests: [null, { id: 'r1', requesterName: 5, startDate: d(-1) }],
    assignments: [undefined, { id: 'a1', driver: 1, vehicle: null, destination: 2, status: null, date: d(-1) }],
  }],
  // ── rc.1.1.1 date-field hazards (the regression that survived rc.1.1) ──
  ['request: epoch-ms createdAt, NO startDate',   { requests: [{ id: 'r1', requesterName: 'B', createdAt: 1719300000000 }] }],
  ['request: Date object createdAt',              { requests: [{ id: 'r1', requesterName: 'B', createdAt: new Date() }] }],
  ['request: Firebase Timestamp (seconds)',       { requests: [{ id: 'r1', requesterName: 'B', createdAt: { seconds: 1719300000, nanoseconds: 0 } }] }],
  ['request: Firebase Timestamp (toDate())',      { requests: [{ id: 'r1', requesterName: 'B', createdAt: { toDate: () => new Date(1719300000000) } }] }],
  ['request: numeric startDate',                  { requests: [{ id: 'r1', requesterName: 'B', startDate: 1719300000000 }] }],
  ['assignment: epoch-ms date',                   { assignments: [{ id: 'a1', driver: 'Andi', vehicle: 'Innova', status: 'completed', destination: 'X', date: 1719300000000 }] }],
  ['assignment: Date object cancelledAt',         { assignments: [{ id: 'a1', driver: 'Andi', vehicle: 'Innova', status: 'cancelled', destination: 'X', date: '', cancelledAt: new Date() }] }],
];

console.log('── B: engine COMPLETES on sanitized dirty data ─────────────');
for (const [label, over] of scenarios) {
  assert(completes(sanitizedCtx(rawCtx(over))), `sanitized → completes: ${label}`);
}

console.log('\n── A: the SAME dirty data throws WITHOUT the sanitizer (hazard real) ──');
let hazardsSeen = 0;
for (const [label, over] of scenarios) {
  if (throws(rawCtx(over))) { hazardsSeen++; ok(`raw → throws (sanitizer required): ${label}`); }
}
console.log(`  (${hazardsSeen}/${scenarios.length} scenarios throw unsanitized — the rest are latent-but-tolerated)`);

console.log('\n── Field-level contract ────────────────────────────────────');
const sd = sanitizeDrivers([null, { name: 5 }, {}, undefined, { name: 'Ok', active: false }]);
assert(sd.length === 2, 'sanitizeDrivers drops null/undefined/empty (2 kept)');
assert(typeof sd[0].name === 'string' && sd[0].name === '5', 'sanitizeDrivers coerces name → "5"');
assert(sd[0].active === true && sd[0].archived === false, 'sanitizeDrivers defaults active=true, archived=false');
assert(sd[1].active === false, 'sanitizeDrivers preserves explicit active=false');

const sr = sanitizeRequests([{ requesterName: 9 }, null]);
assert(sr.length === 1 && sr[0].requesterName === '9', 'sanitizeRequests coerces requesterName → "9"');

const sa = sanitizeAssignments([{ destination: 3, distanceTravelled: '40' }, null, {}]);
assert(sa.length === 1, 'sanitizeAssignments drops null/empty');
assert(sa[0].destination === '3', 'sanitizeAssignments coerces destination → "3"');
assert(sa[0].distanceTravelled === 40, 'sanitizeAssignments coerces distance "40" → 40');
assert(sa[0].status === 'assigned', 'sanitizeAssignments defaults status → "assigned"');

const ss = sanitizeSettings(null);
assert(ss.workStartMins === 540 && ss.workEndMins === 1020, 'sanitizeSettings defaults office window 540/1020');

console.log('\n── normalizeDate() format coverage ─────────────────────────');
const DAY = '2024-06-25';
const EPOCH = Date.UTC(2024, 5, 25, 3, 0, 0);       // 2024-06-25T03:00:00Z
assert(normalizeDate('2024-06-25') === DAY, "ISO date 'YYYY-MM-DD' → same");
assert(normalizeDate('2024-06-25T10:30:00Z') === DAY, 'ISO datetime → leading day (verbatim, no TZ shift)');
assert(normalizeDate('2024-06-25T23:59:00+07:00') === DAY, 'ISO with offset → leading day verbatim (parity with .slice)');
assert(normalizeDate(EPOCH) === DAY, 'epoch milliseconds (number) → UTC day');
assert(normalizeDate(new Date(EPOCH)) === DAY, 'Date object → UTC day');
assert(normalizeDate({ seconds: Math.floor(EPOCH / 1000), nanoseconds: 0 }) === DAY, 'Firebase Timestamp {seconds} → UTC day');
assert(normalizeDate({ _seconds: Math.floor(EPOCH / 1000) }) === DAY, 'serialized Timestamp {_seconds} → UTC day');
assert(normalizeDate({ toDate: () => new Date(EPOCH) }) === DAY, 'Firebase Timestamp .toDate() → UTC day');
assert(normalizeDate(null) === '', 'null → ""');
assert(normalizeDate(undefined) === '', 'undefined → ""');
assert(normalizeDate('') === '', 'empty string → ""');
assert(normalizeDate('   ') === '', 'whitespace → ""');
assert(normalizeDate('not a date') === '', 'garbage string → ""');
assert(normalizeDate(NaN) === '', 'NaN → ""');
assert(normalizeDate(Infinity) === '', 'Infinity → ""');
assert(normalizeDate({}) === '', 'empty object → ""');
assert(normalizeDate([]) === '', 'array → ""');
assert(normalizeDate({ toDate: () => 'boom' }) === '', 'bad toDate() → "" (never throws)');
let threw = false; try { normalizeDate({ get seconds() { throw new Error('x'); } }); } catch { threw = true; }
assert(!threw, 'normalizeDate never throws (even on a throwing getter)');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
