/* engineering-concurrency-check.mjs — v1.20.4 production hardening.
   Proves the ownership-sensitive write path is ATOMIC, IDEMPOTENT and
   REALTIME, using the real client commit path (dev-seed adapter transaction +
   pure engines) — the same transform the Firebase adapter runs inside a
   Firebase transaction in production.

   Verifies:
     • concurrent joins do NOT lose updates (transaction) — and the contrast
       that a last-write-wins set() DOES lose one (why the transaction exists)
     • concurrent verify → exactly ONE verification, the loser aborts cleanly
     • repeated action (double-click / retry) is idempotent — no dup participant
     • one write fans out to every subscribed client (multi-user realtime)
   Run: node scripts/engineering-concurrency-check.mjs   (exit 0 = all pass) */

import { createDevSeedAdapter } from '../js/engineering/providers/dev-seed-adapter.js';
import { normalizeAssignment } from '../js/engineering/models/engineering-assignment.js';
import {
  createAssignment, publishAssignment, markAvailable,
  joinAssignment, startAssignment, finishAssignment,
} from '../js/engineering/engines/assignment-engine.js';
import { verifyAssignment } from '../js/engineering/engines/verification-engine.js';
import { ENGINEERING_PATHS } from '../js/engineering/providers/engineering-provider.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

/** Mirror of engineering-center.js txTransform: normalize → engine → next|undefined. */
const txTransform = (fn) => (raw) => {
  if (raw == null) return undefined;
  try { return fn(normalizeAssignment(raw)) || undefined; } catch (_) { return undefined; }
};

/** Read one assignment back from the adapter's collection (dev adapter serves
 *  the map path, not per-id) — mirrors the store hydration round-trip. */
const read = async (adapter, id) => {
  const map = await adapter.fetchData(ENGINEERING_PATHS.assignments);
  return map && map[id] ? normalizeAssignment(map[id]) : null;
};

/** Build one AVAILABLE assignment and store it in the adapter. */
async function seedAvailable(adapter) {
  let a = createAssignment({ title: 'Ganti Lampu', building: 'GOR', room: 'Lt 2', category: 'kelistrikan', priority: 'high' },
    { sequence: 1, actor: { id: 'admin', name: 'Admin' } });
  a = publishAssignment(a, { actor: { id: 'admin', name: 'Admin' } });
  a = markAvailable(a, { actor: { id: 'admin', name: 'Admin' }, recipientCount: 3 });
  await adapter.saveAssignment(a);
  return a.id;
}

const beginTransform = (me) => txTransform((a) => {
  const joined = joinAssignment(a, { workerId: me.id, name: me.name }, { actor: me });
  return startAssignment(joined, { workerId: me.id, actor: me });
});
const countParticipants = (a) => (a && Array.isArray(a.participants) ? a.participants.length : 0);
const countEvents = (a, type) => (a && Array.isArray(a.timeline) ? a.timeline.filter((e) => e.type === type).length : 0);

/* ── 1. Concurrent join via TRANSACTION → no lost update ───────────────── */
console.log('\n[concurrent join — transaction keeps both members]');
{
  const adapter = createDevSeedAdapter();
  const id = await seedAvailable(adapter);
  const budi = { id: 'budi', name: 'Budi' };
  const andi = { id: 'andi', name: 'Andi' };
  // Fire both without awaiting between — they resolve sequentially on the LATEST
  // committed value (exactly the Firebase transaction guarantee).
  const [r1, r2] = await Promise.all([
    adapter.transactAssignment(id, beginTransform(budi)),
    adapter.transactAssignment(id, beginTransform(andi)),
  ]);
  const final = await read(adapter, id);
  check('both transactions committed', r1.committed && r2.committed);
  check('BOTH members present (no lost update)', countParticipants(final) === 2);
  check('assignment moved to in_progress', final.status === 'in_progress');
}

/* ── 2. Contrast: last-write-wins set() LOSES an update ────────────────── */
console.log('\n[contrast — plain set() loses one join (why we need transactions)]');
{
  const adapter = createDevSeedAdapter();
  const id = await seedAvailable(adapter);
  const base = await read(adapter, id);
  // Both compute from the SAME stale base (the race), then blindly overwrite.
  const nextBudi = startAssignment(joinAssignment(base, { workerId: 'budi', name: 'Budi' }, {}), { workerId: 'budi' });
  const nextAndi = startAssignment(joinAssignment(base, { workerId: 'andi', name: 'Andi' }, {}), { workerId: 'andi' });
  await adapter.saveAssignment(nextBudi);
  await adapter.saveAssignment(nextAndi);   // last write wins → Budi lost
  const final = await read(adapter, id);
  check('plain set() loses one member (only 1 remains)', countParticipants(final) === 1);
}

/* ── 3. Concurrent verify → exactly one VERIFIED, loser aborts ──────────── */
console.log('\n[concurrent verify — single verification]');
{
  const adapter = createDevSeedAdapter();
  const id = await seedAvailable(adapter);
  await adapter.transactAssignment(id, beginTransform({ id: 'budi', name: 'Budi' }));
  await adapter.transactAssignment(id, txTransform((a) => finishAssignment(a, { workerId: 'budi' })));
  const verifyTx = (v) => adapter.transactAssignment(id, txTransform((a) => verifyAssignment(a, v, { now: Date.now() })));
  const [c1, c2] = await Promise.all([
    verifyTx({ id: 'coord1', name: 'Coord 1' }),
    verifyTx({ id: 'coord2', name: 'Coord 2' }),
  ]);
  const final = await read(adapter, id);
  check('exactly one verify committed (other aborted)', (c1.committed ? 1 : 0) + (c2.committed ? 1 : 0) === 1);
  check('final status = verified', final.status === 'verified');
  check('exactly ONE verified timeline event (no duplicate)', countEvents(final, 'verified') === 1);
}

/* ── 4. Idempotent repeat action (double-click / retry) ────────────────── */
console.log('\n[idempotency — repeated begin does not duplicate]');
{
  const adapter = createDevSeedAdapter();
  const id = await seedAvailable(adapter);
  const budi = { id: 'budi', name: 'Budi' };
  await adapter.transactAssignment(id, beginTransform(budi));
  await adapter.transactAssignment(id, beginTransform(budi));   // retry
  const final = await read(adapter, id);
  check('same member joined once (no duplicate participant)', countParticipants(final) === 1);
}

/* ── 5. Realtime fan-out to three simultaneous clients ─────────────────── */
console.log('\n[realtime — one write reaches every client]');
{
  const adapter = createDevSeedAdapter();
  const id = await seedAvailable(adapter);
  const got = [0, 0, 0];
  const unsubs = [0, 1, 2].map((i) => adapter.subscribe(() => { got[i] += 1; }));
  await adapter.transactAssignment(id, beginTransform({ id: 'budi', name: 'Budi' }));
  check('admin client received update', got[0] >= 1);
  check('coordinator client received update', got[1] >= 1);
  check('member client received update', got[2] >= 1);
  unsubs.forEach((u) => u());
  const before = got.slice();
  await adapter.transactAssignment(id, txTransform((a) => finishAssignment(a, { workerId: 'budi' })));
  check('unsubscribe stops delivery', got[0] === before[0] && got[1] === before[1] && got[2] === before[2]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
