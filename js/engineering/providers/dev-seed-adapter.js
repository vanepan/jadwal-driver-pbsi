/* ============================================================
   DEV-SEED-ADAPTER.JS — Engineering Development Seed Provider (v1.20.1)

   The Development implementation of the data-source adapter the Engineering
   Provider consumes. It presents the exact interface the provider already
   expects — { isConfigured, fetchData } — backed by the Development Seed
   dataset instead of Firebase. The module ALWAYS loads through the provider;
   in development the provider is handed THIS adapter.

   Swapping to production is a one-line change next sprint: hand the provider a
   Firebase adapter instead of this one. The Store, Engines, UI and business
   logic are untouched — there is no separate demo code path.

   PURE: no DOM, no `window`. Builds the seed lazily on first fetch (anchored
   to real now so live durations read correctly).
   ============================================================ */

'use strict';

import { ENGINEERING_PATHS, ENGINEERING_ROOT } from './engineering-provider.js';
import { buildDevSeedAssignments } from './dev-seed-data.js';

/**
 * Create a Development Seed adapter for the Engineering Provider.
 * @param {Object} [options]
 * @param {Date|number} [options.now]  anchor time (default: real now)
 * @returns {{isConfigured:Function, fetchData:Function}}
 */
export function createDevSeedAdapter(options = {}) {
  let cache = null;
  const build = () => {
    if (!cache) {
      const assignments = buildDevSeedAssignments(options.now);
      cache = {
        [ENGINEERING_PATHS.assignments]: assignments,
        [ENGINEERING_PATHS.notifications]: [],
        [ENGINEERING_ROOT]: { assignments, notifications: [] },
      };
    }
    return cache;
  };

  return {
    isConfigured: () => true,
    // Mirrors an RTDB read: return the node at `path` (or null when absent).
    fetchData: async (path) => {
      const db = build();
      return Object.prototype.hasOwnProperty.call(db, path) ? db[path] : null;
    },
  };
}
