/* ============================================================
   FIREBASE-ADAPTER.JS — Engineering production storage adapter (v1.20.3)

   The PRODUCTION data-source adapter for Engineering Operations. It implements
   the exact same interface as the DevSeedAdapter (initialize / fetchData /
   saveAssignment / updateAssignment / deleteAssignment / subscribe / dispose),
   so the store, engines and UI are byte-identical whether data comes from
   Firebase or the in-memory dev seed — the ProviderRegistry decides which by env.

   It REUSES the platform Firebase infrastructure (js/firebase.js) — the same
   RTDB connection, auth session and helpers the rest of the app uses. There is
   NO parallel Firebase implementation:
     • readNode           → one-shot reads (fetchData / initialize)
     • storeFirebaseData  → surgical per-assignment writes + deletes (set null)
     • subscribeNode      → the single realtime listener (returns unsubscribe)

   Writes are surgical (engineering/assignments/{id}) so one assignment never
   overwrites another. Realtime is a single subscription on the engineering root
   that pushes {assignments, notifications} to the store, so every device — and
   a browser refresh — reflects the same persisted state.

   firebase.js is imported LAZILY (dynamic import) so this module stays free of
   the gstatic browser-only imports until a method actually runs — it never
   loads in Development (dev-seed) or in a Node test that only inspects shape.
   ============================================================ */

'use strict';

import { ENGINEERING_ROOT, ENGINEERING_PATHS } from './engineering-provider.js';

/** Lazily resolve the shared Firebase module (browser-only URLs). */
let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/**
 * Create the production Firebase adapter for Engineering.
 * @returns {object} adapter conforming to the Engineering adapter interface
 */
export function createFirebaseAdapter() {
  let unsubscribe = null;

  return {
    kind: 'firebase',

    /** Verify the shared Firebase is configured and probe whether storage exists. */
    async initialize() {
      const { isFirebaseConfigured, readNode } = await fb();
      const ready = isFirebaseConfigured();
      if (!ready) return { ready: false, storageExists: false, empty: true };
      const res = await readNode(ENGINEERING_PATHS.assignments);
      const value = res && res.status === 'ok' ? res.value : null;
      return {
        ready: true,
        storageExists: res && res.status === 'ok',
        empty: !value || Object.keys(value).length === 0,
      };
    },

    /** One-shot RTDB read of `path` (null on miss/denied/error). */
    async fetchData(path) {
      const { readNode } = await fb();
      const res = await readNode(path);
      return res && res.status === 'ok' ? res.value : null;
    },

    /** Surgical create: engineering/assignments/{id} = assignment. */
    async saveAssignment(assignment) {
      if (assignment && assignment.id) {
        const { storeFirebaseData } = await fb();
        await storeFirebaseData(`${ENGINEERING_PATHS.assignments}/${assignment.id}`, assignment);
      }
      return assignment;
    },

    /** Update = surgical set of the same per-id node (full record replace). */
    async updateAssignment(assignment) {
      return this.saveAssignment(assignment);
    },

    /** Delete: set engineering/assignments/{id} to null (RTDB removal). */
    async deleteAssignment(id) {
      if (!id) return false;
      const { storeFirebaseData } = await fb();
      await storeFirebaseData(`${ENGINEERING_PATHS.assignments}/${id}`, null);
      return true;
    },

    /** Surgical create/replace: engineering/workReports/{id} = report. */
    async saveWorkReport(report) {
      if (report && report.id) {
        const { storeFirebaseData } = await fb();
        await storeFirebaseData(`${ENGINEERING_PATHS.workReports}/${report.id}`, report);
      }
      return report;
    },

    /** Delete: set engineering/workReports/{id} to null (RTDB removal). */
    async deleteWorkReport(id) {
      if (!id) return false;
      const { storeFirebaseData } = await fb();
      await storeFirebaseData(`${ENGINEERING_PATHS.workReports}/${id}`, null);
      return true;
    },

    /**
     * ATOMIC ownership-sensitive write. Applies `transform(currentRaw)` to the
     * assignment node inside a Firebase transaction, so concurrent writers each
     * see the latest committed value — preventing duplicate joins, lost updates
     * and last-write-wins races. `transform` returns the next record, or
     * `undefined` to abort (illegal/already-applied transition → clean no-op).
     * @param {string} id
     * @param {(currentRaw:*) => *} transform
     * @returns {Promise<{committed:boolean, value:*}>}
     */
    async transactAssignment(id, transform) {
      if (!id || typeof transform !== 'function') return { committed: false, value: null };
      const { runNodeTransaction } = await fb();
      return runNodeTransaction(`${ENGINEERING_PATHS.assignments}/${id}`, transform);
    },

    /**
     * The single realtime subscription. Delivers the engineering root value
     * ({assignments, notifications} | null) to `callback` on every change.
     * Returns an unsubscribe function.
     */
    subscribe(callback) {
      let disposed = false;
      fb().then(({ subscribeNode }) => {
        if (disposed) return;
        unsubscribe = subscribeNode(ENGINEERING_ROOT, (snapshot) => {
          const value = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
          try { if (typeof callback === 'function') callback(value); } catch (_) { /* isolate */ }
        }, { onError: () => {}, onDenied: () => {} });
      }).catch((err) => console.warn('[EngineeringFirebaseAdapter] subscribe failed:', err));
      return () => { disposed = true; if (unsubscribe) { unsubscribe(); unsubscribe = null; } };
    },

    /** Detach the realtime listener. */
    dispose() {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    },
  };
}
