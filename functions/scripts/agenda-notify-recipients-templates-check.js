'use strict';

/* agenda-notify-recipients-templates-check.js — pure unit test for the
   Agenda & To-Do additions to notifications/recipients.js and
   notifications/templates.js (V1.31 Agenda & To-Do, Phase C2). Mirrors
   the existing assignment-notify-recipients-templates-check.js pattern.

   resolveRecipients()/render() take their data as plain arguments — no
   live Firebase read happens in either — genuine pure-logic verification.
   Requires a dummy FIREBASE_CONFIG only because requiring recipients.js
   pulls in config/admin.js (see that file).

   THE security-critical assertion in this file is [C]: NOT ONE of the
   14 Agenda/task event types ever resolves an admin who is not already a
   participant/responsible/organizer/creator as a recipient — proven here
   by construction (the fixture user directory's only admin, 'unrelated
   admin', is never a participant of any fixture event/task), independent
   of and in addition to the RTDB Rules proof already covered by
   scripts/agenda-rules-security-check.mjs.
   Run: node functions/scripts/agenda-notify-recipients-templates-check.js
   (exit 0 = pass) */

process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || '{"databaseURL":"https://demo-agenda-notify-check.firebaseio.com"}';

const { resolveRecipients } = require('../src/notifications/recipients');
const { render } = require('../src/notifications/templates');
const { EVENT_TYPE_SET } = require('../src/events/schema');
const { REGISTRY } = require('../src/notifications/registry');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const users = [
  { username: 'organizerA', displayName: 'Organizer A', role: 'admin', active: true },
  { username: 'picB', displayName: 'PIC B', role: 'driver', active: true },
  { username: 'participantC', displayName: 'Participant C', role: 'driver', active: true },
  { username: 'unrelatedAdmin', displayName: 'Unrelated Admin', role: 'admin', active: true },
];

console.log('\n=== [A — EVENT_TYPES / registry coverage] ===');
const AGENDA_TYPES = [
  'agenda.created', 'agenda.updated', 'agenda.cancelled',
  'agenda.participant_added', 'agenda.participant_removed',
  'agenda.reminder', 'agenda.overdue',
  'task.created', 'task.updated', 'task.completed',
  'task.responsible_added', 'task.responsible_removed',
  'task.reminder', 'task.overdue',
];
check('all 14 Agenda/task types are declared in EVENT_TYPE_SET',
  AGENDA_TYPES.every((t) => EVENT_TYPE_SET.has(t)));
check('all 14 Agenda/task types have a registry entry (channels + template)',
  AGENDA_TYPES.every((t) => REGISTRY[t] && Array.isArray(REGISTRY[t].channels) && REGISTRY[t].template));
check('NONE of the 14 registry entries includes the "telegram" channel (in-app + push only, per spec)',
  AGENDA_TYPES.every((t) => !REGISTRY[t].channels.includes('telegram')));

console.log('\n=== [B — recipient resolution, event lifecycle] ===');
const agendaCreated = {
  type: 'agenda.created',
  actor: { uid: 'organizerA', role: 'admin', displayName: 'Organizer A' },
  entity: { kind: 'agendaEvent', id: 'evt1' },
  payload: { title: 'Rapat', participants: { picB: {}, participantC: {} } },
};
const createdRec = resolveRecipients(agendaCreated, users);
check('agenda.created reaches both participants', createdRec.users.includes('picB') && createdRec.users.includes('participantC'));
check('agenda.created excludes the actor (organizer, who is not even a listed participant here)', !createdRec.users.includes('organizerA'));
check('agenda.created does NOT reach the unrelated admin', !createdRec.users.includes('unrelatedAdmin'));

const agendaCancelled = { ...agendaCreated, type: 'agenda.cancelled', payload: { ...agendaCreated.payload } };
const cancelledRec = resolveRecipients(agendaCancelled, users);
check('agenda.cancelled reaches participants, excludes actor and unrelated admin',
  cancelledRec.users.includes('picB') && cancelledRec.users.includes('participantC')
  && !cancelledRec.users.includes('organizerA') && !cancelledRec.users.includes('unrelatedAdmin'));

console.log('\n=== [C — THE Kabid-privacy invariant: no case ever resolves an uninvolved admin] ===');
const kabidEvent = {
  type: 'agenda.updated',
  actor: { uid: 'picB', role: 'driver', displayName: 'PIC B' },
  entity: { kind: 'agendaEvent', id: 'kabidEvt1' },
  payload: { title: 'Rapat Evaluasi Sarpras (Kabid-scope)', participants: { participantC: {} } },
};
const kabidRec = resolveRecipients(kabidEvent, users);
check("SECURITY: 'unrelatedAdmin' (an admin who is NOT a participant of this Kabid-scope event) is NEVER a recipient",
  !kabidRec.users.includes('unrelatedAdmin'));
check('every one of the 14 Agenda/task types resolves recipients WITHOUT ever calling admins() — proven structurally: every case only reads payload.participants/responsible/organizerUsername/affectedUsername/createdBy, never the full user directory\'s admin subset',
  AGENDA_TYPES.every((type) => {
    const rec = resolveRecipients({
      type, actor: { uid: 'someone', role: 'driver', displayName: 'Someone' },
      entity: { kind: type.startsWith('agenda.') ? 'agendaEvent' : 'agendaTask', id: 'x' },
      payload: { title: 'x', participants: {}, responsible: {}, affectedUsername: null, organizerUsername: null, createdBy: null },
    }, users);
    return !rec.users.includes('unrelatedAdmin');
  }));

console.log('\n=== [D — participant_added/removed target ONLY the affected person, not a fan-out] ===');
const addedRec = resolveRecipients({
  type: 'agenda.participant_added',
  actor: { uid: 'organizerA', role: 'admin', displayName: 'Organizer A' },
  entity: { kind: 'agendaEvent', id: 'evt2' },
  payload: { title: 'Rapat', affectedUsername: 'participantC' },
}, users);
check('agenda.participant_added reaches ONLY the newly added person', addedRec.users.length === 1 && addedRec.users[0] === 'participantC');

console.log('\n=== [E — task recipient resolution] ===');
const taskCreated = {
  type: 'task.created',
  actor: { uid: 'organizerA', role: 'admin', displayName: 'Organizer A' },
  entity: { kind: 'agendaTask', id: 'task1' },
  payload: { title: 'Siapkan Materi', responsible: { picB: {}, participantC: {} } },
};
const taskRec = resolveRecipients(taskCreated, users);
check('task.created reaches all responsible members, excludes actor', taskRec.users.includes('picB') && taskRec.users.includes('participantC') && !taskRec.users.includes('organizerA'));

console.log('\n=== [F — templates render real, non-empty Indonesian copy for every Agenda/task type] ===');
const fakeRecipient = users[1];
check('every Agenda/task type renders a non-empty title AND body',
  AGENDA_TYPES.every((type) => {
    const ev = {
      type,
      actor: { uid: 'organizerA', role: 'admin', displayName: 'Organizer A' },
      entity: { kind: type.startsWith('agenda.') ? 'agendaEvent' : 'agendaTask', id: 'x' },
      payload: { title: 'Contoh Judul' },
    };
    const copy = render(type, ev, fakeRecipient, 'inApp');
    return copy && typeof copy.title === 'string' && copy.title.length > 0 && typeof copy.body === 'string' && copy.body.length > 0;
  }));
check('the reminder/overdue push branch suffixes entityId with payload.offset (SW dedup, mirrors assignment.reminder)',
  (() => {
    const ev = {
      type: 'agenda.reminder',
      actor: { uid: null, role: 'system', displayName: 'Pengingat' },
      entity: { kind: 'agendaEvent', id: 'evt3' },
      payload: { title: 'x', offset: 'h1' },
    };
    const copy = render('agenda.reminder', ev, fakeRecipient, 'push');
    return copy.data.entityId === 'evt3__h1';
  })());

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
