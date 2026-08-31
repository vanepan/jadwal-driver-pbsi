/* overnight-assignment-check.mjs — V1 ADDITION, Phase 1
   (Overnight Assignment + datetime foundation).

   Scope of Phase 1 (what this verifies):
     • js/utils.js gains ONE source of truth for an assignment's full
       datetime span — assignmentSpan() — deriving endDate from
       endTime < startTime (Part B / Part Q). No schema change, no
       migration: existing records carry only date/startTime/endTime and
       endDate is derived; a record that already stores endDate wins.
     • deriveEndDate / crossesMidnight / scheduledTimeState convenience
       wrappers over that one helper.
     • validateTimeRange + the two createAssignmentDirect/updateAssignmentDirect
       guards accept an overnight window (only end === start is rejected).
     • checkConflict / checkVehicleConflict compare the FULL datetime span
       (correct across midnight) instead of minutes-of-day pinned to one date.
     • computeWorkTime.scheduledHours is overnight-aware (23:30→01:30 = 2h).
     • The assignment form shows a read-only "+1 hari · <date>" cue next to
       Jam Selesai (Part A) — NO editable Tanggal Selesai field.
     • The board renders an overnight assignment as ONE block, ONE id, on the
       CONTINUOUS multi-day canvas (Phase 2/3) — spanning the midnight seam,
       clipped only at the window edge (Part I). Section D covers the shape of
       that; the real render is scripts/timeline-multiday-render-check.mjs.

   Section A runs the PURE js/utils.js for real (zero imports — safe in
   plain Node). Sections B–E are static source-pattern checks for the
   Firebase-coupled files (js/assignments.js, js/validation.js, js/timeline.js
   all transitively import js/firebase.js, whose `https://` SDK specifiers
   Node's ESM loader cannot resolve — this repo's established convention, see
   scripts/self-drive-assignment-check.mjs). The real runtime behaviour of
   the conflict rewrite + the form cue is covered by
   scripts/overnight-conflict-dom-check.mjs (browser).

   Run: node scripts/overnight-assignment-check.mjs   (exit 0 = all pass)
*/

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
}
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const ymd  = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ════════════════════════════════════════════════════════════════════════
   A) REAL runtime — js/utils.js (pure, no imports)
   ════════════════════════════════════════════════════════════════════════ */
const {
  assignmentSpan, deriveEndDate, crossesMidnight, scheduledTimeState, computeWorkTime,
} = await imp('js/utils.js');

console.log('\n[A1 — assignmentSpan: Part R edge cases]');
{
  // same-day 09:00→17:00
  const s = assignmentSpan({ date: '2026-09-01', startTime: '09:00', endTime: '17:00' });
  check('same-day: endDate === date', s.endDate === '2026-09-01', s);
  check('same-day: not crossesMidnight', s.crossesMidnight === false, s);
  check('same-day: 8h span', (s.endDateTime - s.startDateTime) / 3600000 === 8, s);
}
{
  // overnight 23:30→01:30 = +1 day
  const s = assignmentSpan({ date: '2026-08-31', startTime: '23:30', endTime: '01:30' });
  check('overnight 23:30→01:30: endDate = date + 1', s.endDate === '2026-09-01', s);
  check('overnight 23:30→01:30: crossesMidnight', s.crossesMidnight === true, s);
  check('overnight 23:30→01:30: 2h real span', (s.endDateTime - s.startDateTime) / 3600000 === 2, s);
  check('overnight: startDateTime is on the start date', ymd(s.startDateTime) === '2026-08-31' && hhmm(s.startDateTime) === '23:30', { d: ymd(s.startDateTime), t: hhmm(s.startDateTime) });
  check('overnight: endDateTime is on the NEXT date', ymd(s.endDateTime) === '2026-09-01' && hhmm(s.endDateTime) === '01:30', { d: ymd(s.endDateTime), t: hhmm(s.endDateTime) });
}
{
  // almost-midnight 23:59→00:01 = +1 day
  const s = assignmentSpan({ date: '2026-09-01', startTime: '23:59', endTime: '00:01' });
  check('almost-midnight 23:59→00:01: crossesMidnight, endDate + 1', s.crossesMidnight === true && s.endDate === '2026-09-02', s);
  check('almost-midnight: 2-minute span', Math.round((s.endDateTime - s.startDateTime) / 60000) === 2, s);
}
{
  // early-morning SAME day 00:30→01:30
  const s = assignmentSpan({ date: '2026-09-01', startTime: '00:30', endTime: '01:30' });
  check('early-morning 00:30→01:30: SAME day (end after start), not crossesMidnight', s.crossesMidnight === false && s.endDate === '2026-09-01', s);
}
{
  // long overnight 22:00→05:00 = +1 day
  const s = assignmentSpan({ date: '2026-09-01', startTime: '22:00', endTime: '05:00' });
  check('long overnight 22:00→05:00: crossesMidnight, +1 day, 7h', s.crossesMidnight === true && s.endDate === '2026-09-02' && (s.endDateTime - s.startDateTime) / 3600000 === 7, s);
}
{
  // fullDay
  const s = assignmentSpan({ date: '2026-09-01', fullDay: true });
  check('fullDay: same-day 00:00→23:59, not crossesMidnight', s.crossesMidnight === false && s.endDate === '2026-09-01' && s.startMin === 0 && s.endMin === 1439, s);
}
{
  // explicitly-stored endDate wins (forward-compat with a future multi-day write)
  const s = assignmentSpan({ date: '2026-09-01', startTime: '09:00', endTime: '17:00', endDate: '2026-09-03' });
  check('stored endDate is respected as-is (not overwritten by derivation)', s.endDate === '2026-09-03', s);
}
{
  check('malformed (no date) → null', assignmentSpan({ startTime: '09:00', endTime: '17:00' }) === null);
  check('malformed (bad time) → null', assignmentSpan({ date: '2026-09-01', startTime: 'xx', endTime: '17:00' }) === null);
  check('null input → null', assignmentSpan(null) === null);
}

console.log('\n[A2 — deriveEndDate / crossesMidnight wrappers]');
check('deriveEndDate overnight → +1', deriveEndDate('2026-08-31', '23:30', '01:30') === '2026-09-01');
check('deriveEndDate same-day → same', deriveEndDate('2026-08-31', '09:00', '17:00') === '2026-08-31');
check('deriveEndDate fullDay → same', deriveEndDate('2026-08-31', '00:00', '23:59', true) === '2026-08-31');
check('deriveEndDate malformed → falls back to the input date', deriveEndDate('2026-08-31', '', '') === '2026-08-31');
check('crossesMidnight(22:00→05:00) === true', crossesMidnight({ date: '2026-09-01', startTime: '22:00', endTime: '05:00' }) === true);
check('crossesMidnight(09:00→17:00) === false', crossesMidnight({ date: '2026-09-01', startTime: '09:00', endTime: '17:00' }) === false);

console.log('\n[A3 — scheduledTimeState: overnight assignment still ACTIVE after midnight (Part G/H)]');
{
  const a = { date: '2026-08-31', startTime: '23:30', endTime: '01:30' };
  check('at 2026-08-31 23:00 → upcoming', scheduledTimeState(a, new Date(2026, 7, 31, 23, 0)) === 'upcoming');
  check('at 2026-09-01 00:30 (start date != current date) → ACTIVE', scheduledTimeState(a, new Date(2026, 8, 1, 0, 30)) === 'active');
  check('at 2026-09-01 01:30 (== endDateTime) → past (Part C: completed only when now >= endDateTime)', scheduledTimeState(a, new Date(2026, 8, 1, 1, 30)) === 'past');
  check('at 2026-09-01 02:00 → past', scheduledTimeState(a, new Date(2026, 8, 1, 2, 0)) === 'past');
}
{
  const a = { date: '2026-09-01', startTime: '09:00', endTime: '17:00' };
  check('same-day at 12:00 → active', scheduledTimeState(a, new Date(2026, 8, 1, 12, 0)) === 'active');
  check('same-day at 17:00 → past', scheduledTimeState(a, new Date(2026, 8, 1, 17, 0)) === 'past');
}

console.log('\n[A4 — computeWorkTime.scheduledHours is overnight-aware]');
check('overnight 23:30→01:30 scheduledHours === 2 (was null before Phase 1)',
  computeWorkTime({ date: '2026-08-31', startTime: '23:30', endTime: '01:30' }).scheduledHours === 2);
check('long overnight 22:00→05:00 scheduledHours === 7',
  computeWorkTime({ date: '2026-08-31', startTime: '22:00', endTime: '05:00' }).scheduledHours === 7);
check('same-day 09:00→17:00 scheduledHours === 8 (unchanged)',
  computeWorkTime({ date: '2026-08-31', startTime: '09:00', endTime: '17:00' }).scheduledHours === 8);
check('fullDay scheduledHours unchanged (~23.98h)',
  Math.abs(computeWorkTime({ date: '2026-08-31', fullDay: true }).scheduledHours - (1439 / 60)) < 1e-9);

/* ════════════════════════════════════════════════════════════════════════
   B) STATIC — js/validation.js (Firebase-coupled: transitively imports
      vehicles-store/drivers-store/settings-store → firebase.js)
   ════════════════════════════════════════════════════════════════════════ */
console.log('\n[B — validation.js: validateTimeRange accepts overnight]');
const validationSrc = src('js/validation.js');
check('rejects ONLY end === start (zero-length), not end <= start',
  /_timeToMinutes\(endTime\)\s*===\s*_timeToMinutes\(startTime\)/.test(validationSrc)
  && !/_timeToMinutes\(endTime\)\s*<=\s*_timeToMinutes\(startTime\)/.test(validationSrc));
check('the old "harus lebih besar" wording is gone; message is now about EQUAL times',
  /Jam selesai tidak boleh sama dengan jam mulai/.test(validationSrc));
check('doc-comment explains the overnight rule + points at assignmentSpan',
  /Overnight Assignment/.test(validationSrc) && /assignmentSpan/.test(validationSrc));
check('the request form keeps its OWN independent same-day guard (overnight is an assignment-only feature in Phase 1)',
  /timeToMinutes\(endTime\)\s*<=\s*timeToMinutes\(startTime\)/.test(src('js/requests.js')));

/* ════════════════════════════════════════════════════════════════════════
   C) STATIC — js/assignments.js
   ════════════════════════════════════════════════════════════════════════ */
console.log('\n[C — assignments.js: overnight builder + span-aware conflicts + form cue]');
const aSrc = src('js/assignments.js');

check('imports assignmentSpan + parseLocalDate from utils.js', /import \{[^}]*\bassignmentSpan\b[^}]*\} from '\.\/utils\.js';/.test(aSrc) && /\bparseLocalDate\b/.test(aSrc));

check('createAssignmentDirect guard: rejects ONLY end === start (not <=)',
  /!fullDay && timeToMinutes\(endTime\) === timeToMinutes\(startTime\)/.test(aSrc));
check('updateAssignmentDirect guard: rejects ONLY end === start (not <=)',
  /!existing\.fullDay && timeToMinutes\(endTime\) === timeToMinutes\(startTime\)/.test(aSrc));
check('NO `timeToMinutes(endTime) <= timeToMinutes(startTime)` anywhere in assignments.js anymore',
  !/timeToMinutes\(endTime\)\s*<=\s*timeToMinutes\(startTime\)/.test(aSrc));

// checkConflict / checkVehicleConflict rewrite
const conflictBlock = aSrc.slice(aSrc.indexOf('export function checkConflict'), aSrc.indexOf('export function createAssignmentDirect'));
check('checkConflict/checkVehicleConflict build a span via assignmentSpan({ date, startTime, endTime })',
  (conflictBlock.match(/assignmentSpan\(\{ date, startTime, endTime \}\)/g) || []).length === 2);
check('...and a span per candidate assignment (assignmentSpan(a))',
  (conflictBlock.match(/const aSpan = assignmentSpan\(a\)/g) || []).length === 2);
check('the old same-date early-return (a.date !== date) is REMOVED from both conflict fns',
  !/a\.date !== date/.test(conflictBlock));
check('overlap is a datetime-range test (startDateTime < aSpan.endDateTime && endDateTime > aSpan.startDateTime)',
  (conflictBlock.match(/mySpan\.startDateTime < aSpan\.endDateTime && mySpan\.endDateTime > aSpan\.startDateTime/g) || []).length === 2);
check('cancelled + identity + driver/vehicle-mismatch short-circuits are still present',
  /a\.id === excludeId/.test(conflictBlock) && /a\.status === 'cancelled'/.test(conflictBlock)
  && /a\.driver !== driverName/.test(conflictBlock) && /a\.vehicle !== vehicleName/.test(conflictBlock));

// form cue
check('syncOvernightCue() is defined', /function syncOvernightCue\(\)/.test(aSrc));
check('the cue shows ONLY when span.crossesMidnight', /if \(span && span\.crossesMidnight\)/.test(aSrc));
check('the cue text is "+1 hari · <formatted end date>"', /`\+1 hari · \$\{endLabel\}`/.test(aSrc));
check('the cue is derived (assignmentSpan) — never reads an editable end-date field',
  /assignmentSpan\(\{ date: startDate, startTime, endTime \}\)/.test(aSrc) && !/getElementById\('fieldEndDate'\)[^\n]*Overnight/i.test(aSrc));
check('syncFullDayUI() calls syncOvernightCue() (Penuh Hari toggles hide it)', /function syncFullDayUI\(\)[\s\S]*?syncOvernightCue\(\);[\s\S]*?\}/.test(aSrc));
check('openFormModal reconciles the cue after populating (edit-mode overnight shows it)',
  /reconcile the "\+1 hari" cue[\s\S]*?syncOvernightCue\(\);/.test(aSrc));
check('the conflict-preview watch list also drives the cue from ONE handler (no parallel listener set)',
  /const onWatchedChange = \(\) => \{ runConflictPreview\(\); syncOvernightCue\(\); \};/.test(aSrc));
check('an editable "Tanggal Selesai"/end-date field for overnight was NOT added (only the pre-existing Multi Hari #fieldEndDate remains)',
  (aSrc.match(/fieldEndDate/g) || []).length === (src('js/assignments.js').match(/fieldEndDate/g) || []).length && !/assignmentEndDateGroup[\s\S]{0,200}[Oo]vernight/.test(aSrc));

/* ════════════════════════════════════════════════════════════════════════
   D) STATIC — js/timeline.js: an overnight block on the CONTINUOUS multi-day
      canvas (Phase 2/3). The Phase-1 interim "clip at 24:00 on a one-day
      board" is gone: the block now spans the midnight seam continuously and
      clips only at the WINDOW edge. Real render behaviour is covered by
      scripts/timeline-multiday-render-check.mjs.
   ════════════════════════════════════════════════════════════════════════ */
console.log('\n[D — timeline.js: overnight block on the continuous multi-day canvas]');
const tSrc = src('js/timeline.js');
check('block start/end are ABSOLUTE canvas minutes (dateToDayIndex(...) * DAY_MIN + span minute)',
  /dateToDayIndex\(span\.startDate\) \* DAY_MIN \+ span\.startMin/.test(tSrc)
  && /dateToDayIndex\(span\.endDate\)\s*\* DAY_MIN \+ span\.endMin/.test(tSrc));
check('span datetime comes from assignmentSpan (the single source of truth) — no second parser',
  /const span = assignmentSpan\(assignment\);/.test(tSrc));
check('clipping happens ONLY at the window edges (left<0 / left+width>canvasW)',
  /if \(left < 0\) \{ width \+= left; left = 0; clipLeft = true; \}/.test(tSrc)
  && /if \(left \+ width > canvasW\) \{ width = canvasW - left; clipRight = true; \}/.test(tSrc));
check('window-edge clips get « / » chevron classes; an in-window midnight crossing gets .spans-midnight',
  /if \(clipLeft\)\s+block\.classList\.add\('continues-prev-day'\);/.test(tSrc)
  && /if \(clipRight\) block\.classList\.add\('continues-next-day'\);/.test(tSrc)
  && /block\.classList\.add\('spans-midnight'\);/.test(tSrc));
check('the time LABEL still shows the TRUE scheduled times (span.startMin / span.endMin)',
  /minutesToTime\(labelStartMin\)\}–\$\{minutesToTime\(labelEndMin\)\}/.test(tSrc)
  && /const labelStartMin = span \? span\.startMin/.test(tSrc));
check('an overnight assignment is ONE block, ONE id — never split into two records',
  /block\.dataset\.id = assignment\.id;/.test(tSrc)
  && !/createAssignmentBlock\(.*tail|tailBlock|nextDayBlock/.test(tSrc));
check('the board renders a bounded, sliding multi-day WINDOW (not one day, not unbounded)',
  /const WINDOW_MAX_DAYS = \d+;/.test(tSrc) && /function maybeExtendWindow\(\)/.test(tSrc)
  && /function buildWindow\(anchorDate\)/.test(tSrc));
check('auto-focus ranks by ABSOLUTE datetime via assignmentSpan (overnight-started-yesterday aware)',
  /export function pickRelevantAssignment\(candidates, now = new Date\(\)\)/.test(tSrc)
  && /x\.s\.startDateTime <= now && now < x\.s\.endDateTime/.test(tSrc));
check('date-nav / auto-focus positioning uses a SMOOTH scroll tween (not an instant jump)',
  /function smoothScrollTimelineTo\(targetPx/.test(tSrc)
  && /1 - Math\.pow\(1 - p, 3\)/.test(tSrc));
check('a manual scroll (wheel / touch / pointer-down) cancels the tween — never fights the user',
  /body\.addEventListener\('touchmove', \(\) => \{ userMovedTimeline = true; cancelSmoothScroll\(\); \}/.test(tSrc)
  && /if \(userMovedTimeline\) \{ cancelSmoothScroll\(\); return; \}/.test(tSrc));

/* ════════════════════════════════════════════════════════════════════════
   E) STATIC — markup + styles for the two new affordances
   ════════════════════════════════════════════════════════════════════════ */
console.log('\n[E — index.html + CSS: the "+1 hari" cue and the clipped-block affordance]');
const htmlSrc = src('index.html');
check('index.html: #assignmentOvernightCue lives inside #assignmentTimeEnd, starts hidden',
  /id="assignmentTimeEnd"[\s\S]*?<div class="overnight-cue" id="assignmentOvernightCue" hidden><\/div>[\s\S]*?<\/div>/.test(htmlSrc));
check('index.html: no editable Tanggal Selesai field was added to the assignment form for overnight',
  !/id="fieldOvernightEndDate"|id="assignmentOvernightEndDate"/.test(htmlSrc));
const platformCss = src('platform.css');
check('platform.css: .overnight-cue style exists + hides on [hidden]',
  /\.overnight-cue \{/.test(platformCss) && /\.overnight-cue\[hidden\] \{ display: none; \}/.test(platformCss));
const styleCss = src('style.css');
check('style.css: .assignment-block.continues-next-day flattens the right edge + chevron ::after',
  /\.assignment-block\.continues-next-day \{/.test(styleCss) && /\.assignment-block\.continues-next-day::after \{/.test(styleCss));

/* ── Summary ─────────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
