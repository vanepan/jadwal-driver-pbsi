'use strict';

/* agenda-audit-actions-check.js — pure unit test for
   functions/src/agenda/auditActions.js (V1.31 Agenda & To-Do, Phase C2).
   No Firebase, no emulator — diffToAuditActions() has zero I/O.
   Run: node functions/scripts/agenda-audit-actions-check.js (exit 0 = pass) */

const { diffToAuditActions, diffMemberField } = require('../src/agenda/auditActions');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function actionsEqual(actual, expectedActions) {
  const actualNames = actual.map((a) => a.action).sort();
  return JSON.stringify(actualNames) === JSON.stringify([...expectedActions].sort());
}

console.log('\n=== [A — creation] ===');
check("null before, real after -> exactly one 'created' action, nothing else diffed",
  actionsEqual(diffToAuditActions(null, { status: 'scheduled', title: 'x' }), ['created']));

console.log('\n=== [B — defensive delete] ===');
check('real before, null after (Rules forbid this — defensive only) -> no actions',
  diffToAuditActions({ status: 'scheduled' }, null).length === 0);
check('both null -> no actions, no throw',
  diffToAuditActions(null, null).length === 0);

console.log('\n=== [C — status transitions, mutually exclusive with generic update] ===');
check("status -> 'cancelled' produces ONLY 'cancelled', never also 'updated'",
  actionsEqual(diffToAuditActions(
    { status: 'scheduled', title: 'x' },
    { status: 'cancelled', title: 'x', cancelReason: 'venue unavailable' },
  ), ['cancelled']));
check("cancelReason is carried on the 'cancelled' action's note",
  diffToAuditActions(
    { status: 'scheduled' },
    { status: 'cancelled', cancelReason: 'venue unavailable' },
  )[0].note === 'venue unavailable');
check("task status -> 'done' produces ONLY 'completed', never also 'updated' or 'status_changed'",
  actionsEqual(diffToAuditActions(
    { status: 'in_progress', title: 'x' },
    { status: 'done', title: 'x' },
  ), ['completed']));
check("an OTHER status transition (not_started -> in_progress) produces the generic 'status_changed'",
  actionsEqual(diffToAuditActions(
    { status: 'not_started', title: 'x' },
    { status: 'in_progress', title: 'x' },
  ), ['status_changed']));

console.log('\n=== [D — acknowledged] ===');
check("acknowledgedAt newly set -> 'acknowledged', independent of status",
  actionsEqual(diffToAuditActions(
    { status: 'scheduled', acknowledgedAt: null },
    { status: 'scheduled', acknowledgedAt: '2026-09-11T00:00:00.000Z' },
  ), ['acknowledged']));

console.log('\n=== [E — member diffing, events (participants)] ===');
check('adding one participant -> one participant_added, field auto-detected',
  (() => {
    const actions = diffToAuditActions(
      { status: 'scheduled', participants: { alice: { isPic: false } } },
      { status: 'scheduled', participants: { alice: { isPic: false }, bob: { isPic: false } } },
    );
    return actions.length === 1 && actions[0].action === 'participant_added' && actions[0].affectedUsername === 'bob';
  })());
check('removing one participant -> one participant_removed with correct affectedUsername',
  (() => {
    const actions = diffToAuditActions(
      { status: 'scheduled', participants: { alice: {}, bob: {} } },
      { status: 'scheduled', participants: { alice: {} } },
    );
    return actions.length === 1 && actions[0].action === 'participant_removed' && actions[0].affectedUsername === 'bob';
  })());
check('simultaneous add + remove (swap) -> exactly 2 actions, one of each',
  actionsEqual(diffToAuditActions(
    { status: 'scheduled', participants: { alice: {} } },
    { status: 'scheduled', participants: { bob: {} } },
  ), ['participant_added', 'participant_removed']));

console.log('\n=== [F — member diffing, tasks (responsible) — field auto-detected as responsible_*, not participant_*] ===');
check('adding one responsible member -> one responsible_added (NOT participant_added)',
  (() => {
    const actions = diffToAuditActions(
      { status: 'not_started', responsible: { alice: {} } },
      { status: 'not_started', responsible: { alice: {}, bob: {} } },
    );
    return actions.length === 1 && actions[0].action === 'responsible_added' && actions[0].affectedUsername === 'bob';
  })());
check('diffMemberField correctly reports field="responsible" for a task-shaped record',
  diffMemberField({ responsible: { a: {} } }, { responsible: { a: {}, b: {} } }).field === 'responsible');
check('diffMemberField correctly reports field="participants" for an event-shaped record',
  diffMemberField({ participants: { a: {} } }, { participants: { a: {}, b: {} } }).field === 'participants');

console.log('\n=== [G — generic update + the updatedBy/updatedAt exclusion] ===');
check("a title-only change with no other diff -> generic 'updated'",
  actionsEqual(diffToAuditActions(
    { status: 'scheduled', title: 'Old' },
    { status: 'scheduled', title: 'New' },
  ), ['updated']));
check("a write that changes ONLY updatedBy/updatedAt (every accepted write must touch these, per the C1 Rules invariant) produces NO actions at all — not a spurious 'updated'",
  diffToAuditActions(
    { status: 'scheduled', title: 'Same', updatedBy: 'alice', updatedAt: 't0' },
    { status: 'scheduled', title: 'Same', updatedBy: 'bob', updatedAt: 't1' },
  ).length === 0);
check('a real content change ALONGSIDE the required updatedBy/updatedAt bump still produces exactly one updated action (not suppressed by the exclusion, not duplicated either)',
  actionsEqual(diffToAuditActions(
    { status: 'scheduled', title: 'Old', updatedBy: 'alice', updatedAt: 't0' },
    { status: 'scheduled', title: 'New', updatedBy: 'alice', updatedAt: 't1' },
  ), ['updated']));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
