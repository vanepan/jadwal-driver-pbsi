/* ============================================================
   SCENARIO-HISTORY.JS — Scenario Simulation Engine (v1.19.8)

   The in-memory, single-session scenario history. It exists ONLY for the current
   simulation session and is DISCARDED when the session closes — it never persists
   to Firebase, localStorage, or any store. Supports Undo, Reset and Duplicate.

   ── PURE + EPHEMERAL ─────────────────────────────────────────────────────────
   A plain factory over an in-memory array. No DOM, no storage, no timers, no
   randomness (ids are a monotonic counter, not a clock). Each session is
   independent, so closing the panel (which drops the session object) discards the
   entire history automatically.

   API:
     createScenarioSession() → {
       push(entry) · undo() · reset() · duplicate(id) · list() · current() · size()
     }
   ============================================================ */

'use strict';

/**
 * Create an isolated, in-memory scenario session.
 * @returns {Object} a session controller (see API above)
 */
export function createScenarioSession() {
  const entries = [];
  let seq = 0;

  return Object.freeze({
    /** Record a scenario run. Returns the stored entry (with an assigned id). */
    push(entry) {
      const stored = { id: ++seq, scenarioKey: entry && entry.scenarioKey, params: entry && entry.params ? { ...entry.params } : {}, title: entry && entry.title ? String(entry.title) : '', meta: entry && entry.meta ? entry.meta : null };
      entries.push(stored);
      return stored;
    },
    /** Remove and return the most recent entry (or null when empty). */
    undo() { return entries.length ? entries.pop() : null; },
    /** Clear the whole session history. */
    reset() { entries.length = 0; },
    /** A re-runnable copy of a prior entry's scenario + params (does not record). */
    duplicate(id) {
      const found = entries.find((e) => e.id === id);
      if (!found) return null;
      return { scenarioKey: found.scenarioKey, params: { ...found.params } };
    },
    /** A shallow copy of the history, oldest → newest. */
    list() { return entries.map((e) => ({ ...e, params: { ...e.params } })); },
    /** The most recent entry (or null). */
    current() { return entries.length ? { ...entries[entries.length - 1] } : null; },
    /** Number of recorded scenarios. */
    size() { return entries.length; },
  });
}

export default { createScenarioSession };
