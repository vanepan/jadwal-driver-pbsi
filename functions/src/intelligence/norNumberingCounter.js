'use strict';

/* ============================================================
   functions/src/intelligence/norNumberingCounter.js — Phase 5

   The REAL server-side official-NOR-number allocator (PART F). Atomic,
   idempotent, server-only. Precedent + idiom:
   functions/src/reimbursement/counter.js#acquireReimbursementNumber — a
   `db.ref(...).transaction()` on a counter node the client cannot touch
   (/intelligence_nor_registry_counters/{scopeKey} inherits the root
   deny-by-default rule, exactly like /reimbursement_counters).

   WHAT IT ALLOCATES: a unique, monotonically increasing SEQUENCE INTEGER
   per scope. It does NOT compose a decorated organizational NOR-number
   string — whether Sarpras Intelligence NORs share the V1 Petty Cash format
   ("{seq}/Nota Organisasi/Sarpras/{RomanMonth}/{year}") and whether the
   sequence is org-wide or per-module are UNRESOLVED organizational rules
   (docs/NOR-Specification.md §D.7). The caller stores whatever authoritative
   string a human confirms, defaulting to the bare sequence.

   IDEMPOTENCY: each allocation is memoised under a caller-supplied
   `reservationKey` (the norId). Re-calling with the same key returns the
   SAME sequence and never increments — so a publish retry after a lost
   response cannot mint a second official number (PART G).

   PURE over an injected `db` (an Admin SDK database handle, or a fake in a
   test). No auth here — the `intelligenceNorRegistry` callable authorizes
   and only invokes this from its `publish` op.
   ============================================================ */

const COUNTERS_PATH = 'intelligence_nor_registry_counters';

/** The stable allocation scope. Deliberately module-local
 *  ('intelligence_nor') pending PBSI's org-wide-vs-per-module decision. */
const DEFAULT_SCOPE_KEY = 'intelligence_nor';

/** RTDB keys may not contain . $ # [ ] / or control chars. */
function isSafeCounterKey(k) {
  if (typeof k !== 'string' || k.length === 0 || k.length > 200) return false;
  for (let i = 0; i < k.length; i += 1) {
    const c = k.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
    const ch = k[i];
    if (ch === '.' || ch === '$' || ch === '#' || ch === '[' || ch === ']' || ch === '/' || ch === ' ') return false;
  }
  return true;
}

function ok(data) {
  return Object.freeze({ ok: true, data, error: null });
}
function fail(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}

/**
 * Reserve (or idempotently replay) an official NOR sequence.
 *
 * @param {object}  args
 * @param {object}  args.db               Admin SDK database handle
 * @param {string}  args.reservationKey   stable per-NOR key (the norId) — memoises the allocation
 * @param {string} [args.scopeKey]        allocation scope (default 'intelligence_nor')
 * @param {string} [args.now]             ISO timestamp (test seam)
 * @returns {Promise<{ok:boolean, data:{sequence:number, scopeKey:string, reservationKey:string, allocatedAt:string, basis:string, replayed:boolean}|null, error:{code:string,message:string}|null}>}
 */
async function reserveNorNumber({ db, reservationKey, scopeKey = DEFAULT_SCOPE_KEY, now } = {}) {
  if (!db || typeof db.ref !== 'function') return fail('NUMBER_RESERVATION_FAILED', 'no database handle');
  if (!isSafeCounterKey(scopeKey)) return fail('NUMBER_RESERVATION_FAILED', 'scopeKey is not an RTDB-safe key');
  if (!isSafeCounterKey(reservationKey)) return fail('NUMBER_RESERVATION_FAILED', 'reservationKey is not an RTDB-safe key');
  const at = now || new Date().toISOString();
  const ref = db.ref(`${COUNTERS_PATH}/${scopeKey}`);

  let res;
  try {
    res = await ref.transaction((cur) => {
      const c = (cur && typeof cur === 'object') ? cur : { seq: 0, reservations: {} };
      const reservations = (c.reservations && typeof c.reservations === 'object') ? c.reservations : {};
      if (reservations[reservationKey] != null) {
        // already allocated for this key — abort the transaction, keep the
        // committed value; we read the memoised sequence from the snapshot.
        return undefined;
      }
      const seq = (typeof c.seq === 'number' && Number.isFinite(c.seq) ? c.seq : 0) + 1;
      const nextReservations = Object.assign({}, reservations);
      nextReservations[reservationKey] = seq;
      return { seq, reservations: nextReservations };
    });
  } catch (err) {
    return fail('NUMBER_RESERVATION_FAILED', (err && err.message) || 'counter transaction failed');
  }

  const snapVal = res && res.snapshot && typeof res.snapshot.val === 'function' ? res.snapshot.val() : null;
  const reservations = (snapVal && snapVal.reservations && typeof snapVal.reservations === 'object') ? snapVal.reservations : {};
  const sequence = reservations[reservationKey];
  if (typeof sequence !== 'number' || !Number.isFinite(sequence)) {
    return fail('NUMBER_RESERVATION_FAILED', 'the reservation did not yield a sequence');
  }
  const replayed = !!(res && res.committed === false);
  return ok(Object.freeze({
    sequence,
    scopeKey,
    reservationKey,
    allocatedAt: at,
    basis: replayed
      ? `Idempotent replay of an earlier reservation in scope "${scopeKey}".`
      : `Atomic allocation ${sequence} in scope "${scopeKey}".`,
    replayed,
  }));
}

module.exports = {
  COUNTERS_PATH,
  DEFAULT_SCOPE_KEY,
  isSafeCounterKey,
  reserveNorNumber,
};
