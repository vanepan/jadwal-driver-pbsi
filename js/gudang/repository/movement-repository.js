/* ============================================================
   MOVEMENT-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 1 Art.IV (Movement is Truth) · Doc 3 Ch.04/Part 4

   PURPOSE: persistence for Movement — the single source of quantity truth.
   There is deliberately NO updateMovement and NO deleteMovement export in
   this file. That omission IS the enforcement of Doc 1 Art.IV ("Movement is
   created, never edited, and never deleted — a correction is itself a new
   Movement") and Doc 4's Forbidden Ledger F-09 (Movement bypass): the only
   way to change what Movement says happened is to append() another Movement.

   firebase.js is imported LAZILY — see item-repository.js's header for why.

   Phase 1.2 Security Hardening (Part 1) added a database.rules.json rule —
   `!data.exists()` on gudang/movements/{movementId} — that enforces this
   file's append-only guarantee independently, so a rejected write is now a
   real, expected outcome (e.g. a genuine race between two concurrent
   appendMovement calls for the same id), not just a theoretical one. The
   pre-check below is a courtesy for a fast, friendly error; the database
   rule is what actually guarantees the outcome, so the write is now wrapped
   to turn a rules-REJECTED write into a normal failure() instead of an
   uncaught rejection.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isMovement } from '../contracts/movement-contract.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Append a new Movement. Fails on a duplicate movementId (append-only: never overwrites). */
export async function appendMovement(movement) {
  if (!isMovement(movement)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'appendMovement: movement does not satisfy the Movement contract.');
  const { readNode, storeFirebaseData } = await fb();
  const existing = await readNode(`${GUDANG_PATHS.movements}/${movement.movementId}`);
  if (existing.status === 'ok' && existing.value != null) {
    return failure(REPOSITORY_ERROR.DUPLICATE_ID, `A movement with id "${movement.movementId}" already exists.`);
  }
  try {
    await storeFirebaseData(`${GUDANG_PATHS.movements}/${movement.movementId}`, movement);
  } catch (err) {
    return failure(REPOSITORY_ERROR.WRITE_FAILED, `appendMovement: write rejected (${err?.code || err?.message || 'unknown error'}).`);
  }
  return success(movement);
}

/** One-shot read of a single Movement by id. */
export async function getMovement(movementId) {
  if (typeof movementId !== 'string' || !movementId) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'getMovement: movementId is required.');
  const { readNode } = await fb();
  const res = await readNode(`${GUDANG_PATHS.movements}/${movementId}`);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `getMovement: read failed (${res.status}).`);
  if (res.value == null) return failure(REPOSITORY_ERROR.NOT_FOUND, `No movement with id "${movementId}".`);
  return success(res.value);
}

/**
 * Every Movement, optionally filtered by itemId, sorted oldest → newest.
 * This is the ONLY read path Stock Projection (Part 5) and Audit (Part 6)
 * are meant to use to reconstruct truth.
 * @param {{itemId?:string}} [filter]
 */
export async function listMovements(filter = {}) {
  const { readNode } = await fb();
  const res = await readNode(GUDANG_PATHS.movements);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `listMovements: read failed (${res.status}).`);
  let items = Object.values(res.value || {});
  if (filter.itemId) items = items.filter((m) => m.itemId === filter.itemId);
  items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return success(items);
}
