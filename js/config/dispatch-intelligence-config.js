/* ============================================================
   DISPATCH-INTELLIGENCE-CONFIG.JS — Dispatch Intelligence Hardening
   (v1.16.4.11-alpha.1.1)

   The single source of truth for every tunable in the Dispatch Intelligence
   subsystem: the monthly capacity reference, the four status bands, and how
   long historical snapshots are retained. Before this file these values lived
   as literals inside driver-capacity-engine.js; centralizing them here makes
   capacity genuinely CONFIGURABLE and removes every hardcoded capacity value
   from the engine.

   SHAPE — a frozen DEFAULT plus a mutable ACTIVE layer:
     DEFAULT_DISPATCH_INTELLIGENCE_CONFIG is immutable (the canonical baseline
     a future settings override merges onto). getDispatchConfig() returns the
     live ACTIVE config the engine reads on every call, so setDispatchConfig()
     takes effect immediately without an API change anywhere downstream. This
     mirrors the DEFAULTS + override pattern in js/settings-store.js.

   recoveryBufferMinutes (v1.25.x — Recovery Buffer): the ONLY place the
   Driver Recommendation Engine's post-assignment recovery buffer is defined
   as a LITERAL (the fallback/initial value). The actual runtime value is
   PUSHED in from js/settings-store.js's live-synced 'dispatch.
   recoveryBufferMinutes' (Final Hardening, Part 3 — editable from the
   Settings screen, js/app.js) via setDispatchConfig() — see
   js/app.js#wireDispatchRecoveryBufferFromSettings, called once at startup
   and again on every live settings change. Never hardcode the 60-minute
   default anywhere else.

   Deliberately does NOT import js/settings-store.js directly (that would
   drag in js/firebase.js's browser-only CDN import, breaking this file's
   use from plain Node — scripts/recommendation-check.mjs requires it
   transitively via driver-recommendation-engine.js). Push, not pull, is
   what keeps this file genuinely PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

/** Immutable canonical baseline. Every literal capacity value lives HERE. */
export const DEFAULT_DISPATCH_INTELLIGENCE_CONFIG = Object.freeze({
  monthlyCapacity: 50,
  statusBands: Object.freeze({
    LOW: Object.freeze([0, 40]),
    NORMAL: Object.freeze([41, 75]),
    HIGH: Object.freeze([76, 90]),
    OVERLOADED: Object.freeze([91, 100]),
  }),
  snapshotRetentionDays: 90,
  recoveryBufferMinutes: 60,
});

/** Convenience re-export of the default monthly capacity (no literal elsewhere). */
export const DEFAULT_MONTHLY_CAPACITY = DEFAULT_DISPATCH_INTELLIGENCE_CONFIG.monthlyCapacity;

/** Convenience re-export of the default recovery buffer (no literal elsewhere). */
export const DEFAULT_RECOVERY_BUFFER_MINUTES = DEFAULT_DISPATCH_INTELLIGENCE_CONFIG.recoveryBufferMinutes;

/** Deep-ish clone of the config (bands arrays copied) so the active layer never
 *  shares frozen references with the default. */
function cloneConfig(cfg) {
  return {
    monthlyCapacity: cfg.monthlyCapacity,
    statusBands: Object.fromEntries(
      Object.entries(cfg.statusBands).map(([k, range]) => [k, [range[0], range[1]]]),
    ),
    snapshotRetentionDays: cfg.snapshotRetentionDays,
    recoveryBufferMinutes: cfg.recoveryBufferMinutes,
  };
}

let activeConfig = cloneConfig(DEFAULT_DISPATCH_INTELLIGENCE_CONFIG);

/** The live config the engine reads. Treat as read-only; mutate via
 *  setDispatchConfig (recoveryBufferMinutes: prefer the Settings-screen
 *  path — js/settings-store.js's updateSetting('dispatch.recoveryBufferMinutes', …)
 *  — since that PERSISTS and live-syncs; setDispatchConfig alone is
 *  in-memory-only and reverts on reload). */
export function getDispatchConfig() {
  return activeConfig;
}

/**
 * Merge a partial override onto the active config. Only valid values are
 * applied (positive monthlyCapacity, positive snapshotRetentionDays, and
 * well-formed [min,max] band pairs); anything else is ignored so a bad write
 * can never corrupt capacity math.
 * @param {Object} partial
 * @returns {Object} the updated active config
 */
export function setDispatchConfig(partial = {}) {
  const next = cloneConfig(activeConfig);
  if (Number(partial.monthlyCapacity) > 0) next.monthlyCapacity = Number(partial.monthlyCapacity);
  if (Number(partial.snapshotRetentionDays) > 0) next.snapshotRetentionDays = Number(partial.snapshotRetentionDays);
  if (Number.isFinite(Number(partial.recoveryBufferMinutes)) && Number(partial.recoveryBufferMinutes) >= 0) {
    next.recoveryBufferMinutes = Number(partial.recoveryBufferMinutes);
  }
  if (partial.statusBands && typeof partial.statusBands === 'object') {
    for (const [k, range] of Object.entries(partial.statusBands)) {
      if (Array.isArray(range) && range.length === 2 && Number.isFinite(Number(range[0])) && Number.isFinite(Number(range[1]))) {
        next.statusBands[k] = [Number(range[0]), Number(range[1])];
      }
    }
  }
  activeConfig = next;
  return activeConfig;
}

/** Reset the active config back to the immutable default (test/teardown helper). */
export function resetDispatchConfig() {
  activeConfig = cloneConfig(DEFAULT_DISPATCH_INTELLIGENCE_CONFIG);
  return activeConfig;
}
