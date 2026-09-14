/* agenda-pdf-view-model-check.mjs — pure unit test for
   js/agenda/agenda-pdf-view-model.js (V1.31 Agenda & To-Do, Phase C4)
   Run: node scripts/agenda-pdf-view-model-check.mjs (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgendaPdfViewModel, ORG_NAME } from '../js/agenda/agenda-pdf-view-model.js';
import { combineDateTimeToEpoch } from '../js/agenda/agenda-forms.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-09-11T08:00:00+07:00').getTime(); // Friday 08:00 WIB
const RANGE = { start: '2026-09-07', end: '2026-09-13', label: 'Minggu ini' };

// Directory: evanUsername (Sarpras staff), kabidUsername (Kabid), ghostUsername (unclassified/external)
const DIRECTORY = {
  evanUsername: { displayName: 'Evan Pratama', class: 'sarpras' },
  leoUsername: { displayName: 'Leo Saputra', class: 'sarpras' },
  kabidUsername: { displayName: 'Drs. Suryanto', class: 'kabid' },
  ghostUsername: { displayName: 'Sekjen PBSI', class: 'unknown' },
};

function baseEvent(overrides = {}) {
  return {
    id: 'evt1', title: 'Rapat Koordinasi', type: 'rapat', date: '2026-09-11',
    allDay: false, startAt: NOW, endAt: NOW + 3600000, location: 'Ruang Rapat',
    organizerUsername: 'evanUsername', status: 'scheduled',
    participants: {
      evanUsername: { isPic: true, status: 'invited' },
      leoUsername: { isPic: false, status: 'invited' },
      kabidUsername: { isPic: false, status: 'accepted' },
    },
    ...overrides,
  };
}
function baseTask(overrides = {}) {
  const dueDate = overrides.dueDate || '2026-09-11';
  const dueTime = 'dueTime' in overrides ? overrides.dueTime : '17:00';
  return {
    id: 'task1', title: 'Siapkan Laporan', priority: 'urgent', status: 'in_progress',
    dueDate, dueTime, dueAt: combineDateTimeToEpoch(dueDate, dueTime),
    responsible: { evanUsername: true, ghostUsername: true },
    checklist: [{ id: 'c1', label: 'Draf', done: true }, { id: 'c2', label: 'Review', done: false }],
    ...overrides,
  };
}

console.log('\n=== [A — SARPRAS identity transform: the critical requirement] ===');
{
  const vm = buildAgendaPdfViewModel({ events: [baseEvent()], tasks: [], range: RANGE, filters: { mode: 'agenda' }, directory: DIRECTORY, now: NOW });
  const item = vm.agendaItems[0];
  check('organizationalResponsible is always the literal string SARPRAS', item.organizationalResponsible === 'SARPRAS');
  check('hasSarprasTeam flag set (Evan + Leo are Sarpras staff)', item.hasSarprasTeam === true);
  check('Sarpras staff (Evan, Leo) do NOT appear as individuals', !item.people.some((p) => p.name === 'Evan Pratama' || p.name === 'Leo Saputra'));
  check('Kabid participant (Drs. Suryanto) IS shown individually, per this phase\'s explicit revision', item.people.some((p) => p.name === 'Drs. Suryanto' && p.isKabid === true));
  const raw = JSON.stringify(vm);
  check('the raw username "evanUsername" never appears ANYWHERE in the returned object (dropped, not relabeled)', !raw.includes('evanUsername'));
  check('the raw username "leoUsername" never appears ANYWHERE in the returned object', !raw.includes('leoUsername'));
  check('the display name "Evan Pratama" never appears anywhere (not just the username)', !raw.includes('Evan Pratama'));
}

console.log('\n=== [B — unknown/unclassified participant defaults to shown-individually, never silently collapsed] ===');
{
  const vm = buildAgendaPdfViewModel({ events: [], tasks: [baseTask()], range: RANGE, filters: { mode: 'todo' }, directory: DIRECTORY, now: NOW });
  const item = vm.taskItems[0];
  check('unknown-classified participant (Sekjen PBSI) is shown individually', item.people.some((p) => p.name === 'Sekjen PBSI' && p.isKabid === false));
  check('Sarpras staff (Evan) on the task is dropped, hasSarprasTeam true', item.hasSarprasTeam === true && !item.people.some((p) => p.name.includes('Evan')));
}

console.log('\n=== [C — mode filter: agenda / todo / semua] ===');
{
  const evs = [baseEvent()], tks = [baseTask()];
  const agendaOnly = buildAgendaPdfViewModel({ events: evs, tasks: tks, range: RANGE, filters: { mode: 'agenda' }, directory: DIRECTORY, now: NOW });
  check('mode=agenda excludes all tasks', agendaOnly.taskItems.length === 0 && agendaOnly.agendaItems.length === 1);
  const todoOnly = buildAgendaPdfViewModel({ events: evs, tasks: tks, range: RANGE, filters: { mode: 'todo' }, directory: DIRECTORY, now: NOW });
  check('mode=todo excludes all events', todoOnly.agendaItems.length === 0 && todoOnly.taskItems.length === 1);
  const semua = buildAgendaPdfViewModel({ events: evs, tasks: tks, range: RANGE, filters: { mode: 'semua' }, directory: DIRECTORY, now: NOW });
  check('mode=semua (or omitted) includes both', semua.agendaItems.length === 1 && semua.taskItems.length === 1);
  check('reportTitle reflects the mode', agendaOnly.reportTitle === 'Laporan Agenda' && todoOnly.reportTitle === 'Laporan To-Do' && semua.reportTitle === 'Laporan Agenda & To-Do');
}

console.log('\n=== [D — date-range filtering] ===');
{
  const inRange = baseEvent({ id: 'e-in', date: '2026-09-09' });
  const outOfRange = baseEvent({ id: 'e-out', date: '2026-09-30' });
  const vm = buildAgendaPdfViewModel({ events: [inRange, outOfRange], tasks: [], range: RANGE, filters: { mode: 'agenda' }, directory: DIRECTORY, now: NOW });
  check('event inside the range is included', vm.agendaItems.some((i) => i.title === 'Rapat Koordinasi'));
  check('event outside the range is excluded', vm.agendaItems.length === 1);
}

console.log('\n=== [E — task status/priority filters] ===');
{
  const urgent = baseTask({ id: 't-urgent', title: 'Urgent Task', priority: 'urgent', dueDate: '2026-09-12' });
  const normalDone = baseTask({ id: 't-done', title: 'Done Task', priority: 'normal', status: 'done', dueDate: '2026-09-08' });
  const overdue = baseTask({ id: 't-overdue', title: 'Overdue Task', priority: 'normal', status: 'in_progress', dueDate: '2026-09-08', dueTime: '00:00' });
  const tasks = [urgent, normalDone, overdue];
  const byPriority = buildAgendaPdfViewModel({ events: [], tasks, range: RANGE, filters: { mode: 'todo', priority: 'urgent' }, directory: DIRECTORY, now: NOW });
  check('priority filter keeps only matching tasks', byPriority.taskItems.length === 1 && byPriority.taskItems[0].title === 'Urgent Task');
  const byStatusDone = buildAgendaPdfViewModel({ events: [], tasks, range: RANGE, filters: { mode: 'todo', status: 'done' }, directory: DIRECTORY, now: NOW });
  check('status=done filter keeps only done tasks', byStatusDone.taskItems.length === 1 && byStatusDone.taskItems[0].title === 'Done Task');
  const byStatusOverdue = buildAgendaPdfViewModel({ events: [], tasks, range: RANGE, filters: { mode: 'todo', status: 'overdue' }, directory: DIRECTORY, now: NOW });
  check('status=overdue filter derives overdue via the injected `now`, not a stored field', byStatusOverdue.taskItems.length === 1 && byStatusOverdue.taskItems[0].title === 'Overdue Task');
}

console.log('\n=== [F — checklist progress + status labels] ===');
{
  const vm = buildAgendaPdfViewModel({ events: [], tasks: [baseTask()], range: RANGE, filters: { mode: 'todo' }, directory: DIRECTORY, now: NOW });
  check('checklist progress renders as "done/total"', vm.taskItems[0].checklistLabel === '1/2');
  const noChecklist = buildAgendaPdfViewModel({ events: [], tasks: [baseTask({ checklist: [] })], range: RANGE, filters: { mode: 'todo' }, directory: DIRECTORY, now: NOW });
  check('a task with no checklist has a null (not "0/0") checklistLabel', noChecklist.taskItems[0].checklistLabel === null);
}

console.log('\n=== [G — sorting] ===');
{
  const e1 = baseEvent({ id: 'e1', title: 'Later', date: '2026-09-12', startAt: NOW + 1000 });
  const e2 = baseEvent({ id: 'e2', title: 'Earlier', date: '2026-09-09', startAt: NOW });
  const vm = buildAgendaPdfViewModel({ events: [e1, e2], tasks: [], range: RANGE, filters: { mode: 'agenda' }, directory: DIRECTORY, now: NOW });
  check('agenda items sort chronologically by date', vm.agendaItems[0].title === 'Earlier' && vm.agendaItems[1].title === 'Later');
  const t1 = baseTask({ id: 't1', title: 'DueLater', dueDate: '2026-09-12' });
  const t2 = baseTask({ id: 't2', title: 'DueEarlier', dueDate: '2026-09-08' });
  const vm2 = buildAgendaPdfViewModel({ events: [], tasks: [t1, t2], range: RANGE, filters: { mode: 'todo' }, directory: DIRECTORY, now: NOW });
  check('task items sort by due date, soonest first', vm2.taskItems[0].title === 'DueEarlier' && vm2.taskItems[1].title === 'DueLater');
}

console.log('\n=== [H — meta fields + purity] ===');
{
  const vm = buildAgendaPdfViewModel({ events: [baseEvent()], tasks: [baseTask()], range: RANGE, filters: {}, directory: DIRECTORY, now: NOW });
  check('org is the fixed organization name', vm.org === ORG_NAME && vm.org === 'Bidang Sarana dan Prasarana');
  check('dateRangeLabel includes the preset label', vm.dateRangeLabel.includes('Minggu ini'));
  check('summary counts are correct', vm.summary.totalEvents === 1 && vm.summary.totalTasks === 1);
  check('no individual "Generated By" identity anywhere (organizational only)', !JSON.stringify(vm).match(/generatedBy/i));
  const vmAgain = buildAgendaPdfViewModel({ events: [baseEvent()], tasks: [baseTask()], range: RANGE, filters: {}, directory: DIRECTORY, now: NOW });
  check('same inputs -> byte-identical output (no Date.now()/hidden state)', JSON.stringify(vm) === JSON.stringify(vmAgain));
}

console.log('\n=== [I — required-parameter guards] ===');
check('missing range throws rather than silently producing an unbounded report', (() => {
  try { buildAgendaPdfViewModel({ events: [], tasks: [], filters: {}, directory: {}, now: NOW }); return false; } catch { return true; }
})());
check('missing now throws rather than silently reading the real clock', (() => {
  try { buildAgendaPdfViewModel({ events: [], tasks: [], range: RANGE, filters: {}, directory: {} }); return false; } catch { return true; }
})());

console.log('\n=== [J — §16 structural guarantee: this file can NEVER fetch its own data, only ever render what the caller (agenda-store.js\'s already-scope-authorized cache) hands it] ===');
{
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'agenda', 'agenda-pdf-view-model.js'), 'utf8');
  check('no import of firebase.js, agenda-store.js, or agenda-directory.js (would allow this pure function to secretly widen its own dataset)', !/from\s+['"].*(firebase\.js|agenda-store\.js|agenda-directory\.js)['"]/.test(src));
  check('no reference to onValue/subscribeNode/storeFirebaseData/get( — no Firebase call of any kind', !/\b(onValue|subscribeNode|storeFirebaseData|updateFirebaseData|getDatabase)\s*\(/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
