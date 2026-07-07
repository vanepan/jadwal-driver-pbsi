/* ============================================================
   DEV-SEED-ADAPTER.JS — Engineering Development storage adapter (v1.20.3 RC1)

   The Development implementation of the Engineering data-source adapter. It is
   an in-memory store that conforms to the full adapter interface the provider
   expects (initialize / fetchData / saveAssignment / updateAssignment /
   deleteAssignment / subscribe / dispose), so the future FirebaseAdapter is a
   drop-in replacement with no consumer changes.

   CRITICAL (v1.20.3 RC1): it STARTS EMPTY. Constructing this adapter does NOT
   create any assignment. There is no automatic seeding path — data only ever
   appears when the developer explicitly uses the Seed Manager, which calls the
   development-only `__dev_loadSeed` hook below. In staging/production this
   adapter is never registered (see provider-registry), so those hooks cannot be
   reached at all.

   PURE: no DOM, no `window`, no Firebase. Resolved ONLY in Development.
   ============================================================ */

'use strict';

import { ENGINEERING_PATHS, ENGINEERING_ROOT } from './engineering-provider.js';
import { buildDevSeedAssignments } from './dev-seed-data.js';

/**
 * Create an EMPTY in-memory Development adapter.
 * @param {Object} [options]
 * @param {Date|number} [options.now]  seed anchor time (used only if the
 *                                      developer later loads the demo seed)
 * @returns {object} adapter conforming to the Engineering adapter interface
 */
export function createDevSeedAdapter(options = {}) {
  // Storage — deliberately EMPTY at construction. Nothing is seeded here.
  let assignments = {};        // id → serialized assignment
  let workReports = {};        // id → serialized work report ("Catat Pekerjaan")
  let notifications = [];      // serialized notifications
  let subscribers = [];        // live change callbacks
  let initialized = false;

  const nodeFor = (path) => {
    if (path === ENGINEERING_PATHS.assignments) return assignments;
    if (path === ENGINEERING_PATHS.workReports) return workReports;
    if (path === ENGINEERING_PATHS.notifications) return notifications;
    if (path === ENGINEERING_ROOT) return { assignments, workReports, notifications };
    return null;
  };
  // Deliver the same root shape a Firebase snapshot would ({assignments,
  // workReports, notifications}) so one realtime handler serves both adapters.
  const emit = () => {
    const root = { assignments, workReports, notifications };
    for (const cb of subscribers) { try { cb(root); } catch (_) { /* isolate listeners */ } }
  };
  const count = () => Object.keys(assignments).length;

  return {
    /** Adapter identity (for logging / introspection). */
    kind: 'dev-seed',

    /** Async lifecycle. No external storage, so it is immediately ready & EMPTY. */
    async initialize() {
      initialized = true;
      return { ready: true, storageExists: true, empty: count() === 0 };
    },

    /** Mirrors an RTDB one-shot read of `path` (null for unknown paths). */
    async fetchData(path) {
      return nodeFor(path);
    },

    /** Create/replace an assignment in storage. */
    async saveAssignment(a) {
      if (a && a.id) { assignments = { ...assignments, [a.id]: a }; emit(); }
      return a;
    },

    /** Update an assignment (same semantics as save for the in-memory store). */
    async updateAssignment(a) {
      return this.saveAssignment(a);
    },

    /** Delete an assignment by id. Returns whether it existed. */
    async deleteAssignment(id) {
      if (!assignments[id]) return false;
      const next = { ...assignments }; delete next[id]; assignments = next; emit();
      return true;
    },

    /** Create/replace a work report in storage. */
    async saveWorkReport(r) {
      if (r && r.id) { workReports = { ...workReports, [r.id]: r }; emit(); }
      return r;
    },

    /** Delete a work report by id. Returns whether it existed. */
    async deleteWorkReport(id) {
      if (!workReports[id]) return false;
      const next = { ...workReports }; delete next[id]; workReports = next; emit();
      return true;
    },

    /**
     * Atomic transform of one assignment — the in-memory mirror of the Firebase
     * adapter's transaction, so the transactional commit path is identical in
     * Development. `transform(currentRaw)` returns the next record, or
     * `undefined` to abort (no write). Single-threaded JS makes the read-modify-
     * write inherently atomic here.
     */
    async transactAssignment(id, transform) {
      if (!id || typeof transform !== 'function') return { committed: false, value: null };
      let next;
      try { next = transform(assignments[id] ?? null); }
      catch (_) { next = undefined; }
      if (next === undefined || next === null) return { committed: false, value: assignments[id] ?? null };
      assignments = { ...assignments, [id]: next };
      emit();
      return { committed: true, value: next };
    },

    /** Subscribe to storage changes. Returns an unsubscribe function. */
    subscribe(callback) {
      if (typeof callback !== 'function') return () => {};
      subscribers.push(callback);
      return () => { subscribers = subscribers.filter((cb) => cb !== callback); };
    },

    /** Tear down subscriptions. */
    dispose() {
      subscribers = [];
      initialized = false;
    },

    /* ── Development-only Seed Manager hooks ─────────────────────────────────
       These are NOT part of the storage interface — the FirebaseAdapter will
       never expose them. They exist solely so the Development Seed Manager can
       populate/clear this in-memory store on explicit developer action. */

    /** Populate storage with the demo seed. Returns the number of assignments. */
    __dev_loadSeed(now) {
      const list = buildDevSeedAssignments(now ?? options.now);
      const map = {};
      for (const a of list) if (a && a.id) map[a.id] = a;
      assignments = map;
      notifications = [];
      emit();
      return list.length;
    },

    /** Empty storage completely. */
    __dev_clear() {
      assignments = {};
      workReports = {};
      notifications = [];
      emit();
    },
  };
}
