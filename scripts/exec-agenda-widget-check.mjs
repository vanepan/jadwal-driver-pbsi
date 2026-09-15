/* exec-agenda-widget-check.mjs — V1.31.2 §8
   Pure unit test for js/widgets/executive/index.js#agendaBriefingItems() —
   the Executive Command Center's Agenda/Kalender/To-Do integration
   (previously deferred, now implemented).

   Proves: chronological merge/sort across all three entities, exclusion
   of cancelled/selesai/done (a briefing has nothing useful to say about
   something over or called off), the correct action key per entity type
   (so each row opens its OWN canonical drawer, never a generic one), and
   the 6-item cap. Deleted items are NOT tested here — they're already
   excluded upstream by agenda-store.js's own central filter, before this
   function ever sees them (see agenda-workspace-render-check.mjs's own
   coverage of that).

   Run: node scripts/exec-agenda-widget-check.mjs (exit 0 = pass) */

import { agendaBriefingItems } from '../js/widgets/executive/index.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = new Date('2026-09-15T08:00:00+07:00').getTime();
const HOUR = 3600000;

function baseCtx(overrides = {}) {
  return { agendaEvents: [], agendaTasks: [], agendaCalendarItems: [], ...overrides };
}

console.log('\n=== [A — each entity type gets its OWN action key (the actual point of this widget)] ===');
{
  const ctx = baseCtx({
    agendaEvents: [{ id: 'e1', title: 'Rapat', status: 'scheduled', startAt: NOW + HOUR, allDay: false, location: 'Ruang A' }],
    agendaTasks: [{ id: 't1', title: 'Tugas', status: 'in_progress', dueAt: NOW + 2 * HOUR, dueTime: '10:00' }],
    agendaCalendarItems: [{ id: 'c1', title: 'Kalender', status: 'scheduled', startDate: '2026-09-15', endDate: '2026-09-15', startAt: NOW + 3 * HOUR, endAt: NOW + 4 * HOUR, allDay: false }],
  });
  const items = agendaBriefingItems(ctx, NOW);
  check('exactly 3 items returned', items.length === 3);
  check("agenda event -> action 'openAgendaEvent'", items.find((i) => i.id === 'e1')?.action === 'openAgendaEvent');
  check("task -> action 'openAgendaTask'", items.find((i) => i.id === 't1')?.action === 'openAgendaTask');
  check("calendar item -> action 'openAgendaCalendarItem'", items.find((i) => i.id === 'c1')?.action === 'openAgendaCalendarItem');
  check("agenda event carries typeLabel 'Agenda'", items.find((i) => i.id === 'e1')?.typeLabel === 'Agenda');
  check("calendar item carries typeLabel 'Kalender'", items.find((i) => i.id === 'c1')?.typeLabel === 'Kalender');
  check("task carries typeLabel 'To-Do'", items.find((i) => i.id === 't1')?.typeLabel === 'To-Do');
}

console.log('\n=== [B — chronological sort across all three entity types together] ===');
{
  const ctx = baseCtx({
    agendaEvents: [{ id: 'later', title: 'Later Event', status: 'scheduled', startAt: NOW + 5 * HOUR, allDay: false }],
    agendaTasks: [{ id: 'earliest', title: 'Earliest Task', status: 'not_started', dueAt: NOW + HOUR, dueTime: '09:00' }],
    agendaCalendarItems: [{ id: 'middle', title: 'Middle Calendar', status: 'scheduled', startDate: '2026-09-15', endDate: '2026-09-15', startAt: NOW + 3 * HOUR, endAt: NOW + 4 * HOUR, allDay: false }],
  });
  const items = agendaBriefingItems(ctx, NOW);
  check('sorted earliest-first regardless of entity type', items.map((i) => i.id).join(',') === 'earliest,middle,later');
}

console.log('\n=== [C — cancelled/selesai/done are excluded (a briefing has nothing to say about them)] ===');
{
  const ctx = baseCtx({
    agendaEvents: [{ id: 'cancelled-e', title: 'Cancelled', status: 'cancelled', startAt: NOW + HOUR, allDay: false }],
    agendaTasks: [{ id: 'done-t', title: 'Done', status: 'done', dueAt: NOW + HOUR }],
    agendaCalendarItems: [
      { id: 'cancelled-c', title: 'Cancelled Cal', status: 'cancelled', startDate: '2026-09-15', endDate: '2026-09-15', startAt: NOW + HOUR, endAt: NOW + 2 * HOUR },
      { id: 'ended-c', title: 'Ended Cal', status: 'scheduled', startDate: '2026-09-01', endDate: '2026-09-02', startAt: NOW - 20 * HOUR, endAt: NOW - 10 * HOUR },
    ],
  });
  const items = agendaBriefingItems(ctx, NOW);
  check('cancelled event excluded', !items.some((i) => i.id === 'cancelled-e'));
  check('done task excluded', !items.some((i) => i.id === 'done-t'));
  check('cancelled calendar item excluded', !items.some((i) => i.id === 'cancelled-c'));
  check("a calendar item whose range already ENDED ('selesai') is excluded", !items.some((i) => i.id === 'ended-c'));
  check('nothing survives -> empty list', items.length === 0);
}

console.log('\n=== [D — an active (Berlangsung) calendar item is visually distinguished, and gets a range label] ===');
{
  const ctx = baseCtx({
    agendaCalendarItems: [{ id: 'sirnas', title: 'Evan - Sirnas C Piala Raja', status: 'scheduled', startDate: '2026-09-15', endDate: '2026-09-20', allDay: true, startAt: NOW - HOUR, endAt: NOW + 5 * 24 * HOUR }],
  });
  const items = agendaBriefingItems(ctx, NOW);
  check('exactly one item (the active multi-day range)', items.length === 1);
  check("tone is 'good' (distinct from a merely-scheduled 'info')", items[0].tone === 'good');
  check("meta mentions 'Berlangsung', never an overdue/Terlewat framing", items[0].meta.includes('Berlangsung') && !/terlewat/i.test(items[0].meta));
}

console.log('\n=== [E — an overdue task is flagged, a merely-upcoming one is not] ===');
{
  const ctx = baseCtx({
    agendaTasks: [
      { id: 'overdue', title: 'Overdue Task', status: 'in_progress', dueAt: NOW - HOUR, dueTime: '00:00' },
      { id: 'upcoming', title: 'Upcoming Task', status: 'not_started', dueAt: NOW + HOUR, dueTime: '09:00' },
    ],
  });
  const items = agendaBriefingItems(ctx, NOW);
  const overdue = items.find((i) => i.id === 'overdue');
  const upcoming = items.find((i) => i.id === 'upcoming');
  check("overdue task: meta === 'Terlewat', tone 'warn'", overdue.meta === 'Terlewat' && overdue.tone === 'warn');
  check("upcoming task: no 'Terlewat' label, tone 'neutral'", upcoming.meta !== 'Terlewat' && upcoming.tone === 'neutral');
}

console.log('\n=== [F — caps at 6 items even when more qualify] ===');
{
  const events = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, title: `Event ${i}`, status: 'scheduled', startAt: NOW + i * HOUR, allDay: false }));
  const items = agendaBriefingItems(baseCtx({ agendaEvents: events }), NOW);
  check('exactly 6 items returned, not 10', items.length === 6);
  check('the 6 kept are the EARLIEST 6, not an arbitrary slice', items.map((i) => i.id).join(',') === 'e0,e1,e2,e3,e4,e5');
}

console.log('\n=== [G — defensive: missing/malformed inputs never throw] ===');
{
  let threw = false;
  try {
    agendaBriefingItems({}, NOW);
    agendaBriefingItems({ agendaEvents: [null], agendaTasks: [null], agendaCalendarItems: [null] }, NOW);
  } catch { threw = true; }
  check('empty ctx and null entries never throw', !threw);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
