'use strict';

/* assignment-notify-recipients-templates-check.js — validates the v1.25.x
   Driver Notification V2 recipient resolution + per-recipient message
   perspective for assignment.reassigned / assignment.updated.
   Run: node functions/scripts/assignment-notify-recipients-templates-check.js
   (exit 0 = all pass)

   resolveRecipients()/render() take their data (users[], event) as plain
   arguments — no live Firebase read happens in either function — so this
   is genuine pure-logic verification, not a mock. Requires a dummy
   FIREBASE_CONFIG env var only because requiring recipients.js pulls in
   config/admin.js, which eagerly constructs (never calls) a database
   handle — see the task report's "technical debt" note about this.
*/

const { resolveRecipients } = require('../src/notifications/recipients');
const { render } = require('../src/notifications/templates');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

const users = [
  { username: 'dedi', displayName: 'Dedi', role: 'driver', active: true, notificationsEnabled: true, telegramChatId: '111' },
  { username: 'igo', displayName: 'Igo', role: 'driver', active: true, notificationsEnabled: true, telegramChatId: '222' },
  { username: 'evan', displayName: 'Evan', role: 'admin', active: true, notificationsEnabled: true, telegramChatId: '333' },
];

console.log('\n[recipients — assignment.created includes admins (Part 4 bell-parity fix)]');
const createdEvent = {
  type: 'assignment.created',
  actor: { uid: 'evan', role: 'admin', displayName: 'Evan' },
  entity: { kind: 'assignment', id: 'ASG-0' },
  payload: { driver: 'Dedi', driverUsername: 'dedi', vehicle: 'Innova', destination: 'Bandara', date: '2026-07-01', startTime: '09:00', endTime: '11:00' },
};
const createdRec = resolveRecipients(createdEvent, users);
check('driver (dedi) is a recipient', createdRec.users.includes('dedi'));
check('admin (evan) is ALSO a recipient — was missing before Final Hardening Part 4, ' +
  'which would have silently dropped admin bell visibility once the bell stopped reading /logs for this type',
  createdRec.users.includes('evan'));

const reassignedEvent = {
  type: 'assignment.reassigned',
  actor: { uid: 'evan', role: 'admin', displayName: 'Evan' },
  entity: { kind: 'assignment', id: 'ASG-1' },
  payload: {
    driver: 'Igo', driverUsername: 'igo',
    previousDriver: 'Dedi', previousDriverUsername: 'dedi',
    vehicle: 'Innova', destination: 'Bandara',
    date: '2026-07-01', startTime: '10:00', endTime: '12:00',
    previousDate: '2026-07-01', previousStartTime: '09:00', previousEndTime: '11:00',
    previousDestination: 'Bandara', previousVehicle: 'Innova',
  },
};

console.log('\n[recipients — assignment.reassigned reaches BOTH drivers]');
const rec = resolveRecipients(reassignedEvent, users);
check('previous driver (dedi) is a recipient', rec.users.includes('dedi'));
check('new driver (igo) is a recipient', rec.users.includes('igo'));
check('no requesterId in payload → no 3rd recipient added', rec.users.length === 2);

console.log('\n[templates — assignment.reassigned renders the RIGHT message per recipient]');
const dediRecipient = users.find(u => u.username === 'dedi');
const igoRecipient = users.find(u => u.username === 'igo');

const dediCopy = render('assignment.reassigned', reassignedEvent, dediRecipient, 'inApp');
const igoCopy = render('assignment.reassigned', reassignedEvent, igoRecipient, 'inApp');

check('previous driver (Dedi) title is "Assignment Dialihkan"', dediCopy.title === 'Assignment Dialihkan');
check('previous driver (Dedi) body says it was reassigned away', /dialihkan/i.test(dediCopy.body));
check('new driver (Igo) title is "Penugasan Baru"', igoCopy.title === 'Penugasan Baru');
check('new driver (Igo) body says they received a new assignment', /penugasan baru/i.test(igoCopy.body));
check('Dedi and Igo get DIFFERENT titles for the SAME event', dediCopy.title !== igoCopy.title);

const dediTelegram = render('assignment.reassigned', reassignedEvent, dediRecipient, 'telegram');
const igoTelegram = render('assignment.reassigned', reassignedEvent, igoRecipient, 'telegram');
check('Dedi\'s Telegram text shows the OLD (09:00–11:00) time, not the new one',
  dediTelegram.text.includes('09:00') && dediTelegram.text.includes('11:00') && !dediTelegram.text.includes('10:00 – 12:00'));
check('Igo\'s Telegram text shows the NEW (10:00–12:00) time',
  igoTelegram.text.includes('10:00') && igoTelegram.text.includes('12:00'));

console.log('\n[templates — assignment.updated shows before → after deltas]');
const updatedEvent = {
  type: 'assignment.updated',
  actor: { uid: 'evan', role: 'admin', displayName: 'Evan' },
  entity: { kind: 'assignment', id: 'ASG-2' },
  payload: {
    driver: 'Dedi', driverUsername: 'dedi', vehicle: 'Avanza', destination: 'Stasiun',
    date: '2026-07-01', startTime: '14:00', endTime: '16:00',
    previousVehicle: 'Innova', previousDestination: 'Bandara',
    previousDate: '2026-07-01', previousStartTime: '09:00', previousEndTime: '11:00',
  },
};
const updatedTelegram = render('assignment.updated', updatedEvent, dediRecipient, 'telegram');
check('shows the new destination', updatedTelegram.text.includes('Stasiun'));
check('shows the previous destination in parentheses', updatedTelegram.text.includes('sebelumnya Bandara'));
check('shows the new vehicle', updatedTelegram.text.includes('Avanza'));
check('shows the previous vehicle in parentheses', updatedTelegram.text.includes('sebelumnya Innova'));
const dediUpdatedCopy = render('assignment.updated', updatedEvent, dediRecipient, 'inApp');
check('driver-perspective body reads as "your schedule was updated"', /jadwal penugasan anda/i.test(dediUpdatedCopy.body));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
