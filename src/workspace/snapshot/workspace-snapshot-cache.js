/* ============================================================
   WORKSPACE-SNAPSHOT-CACHE.JS — Live Word Workspace (V2, Phase 12.8.6)

   PURPOSE: a lightweight, in-memory cache of the LAST successfully built
   WorkspaceContext per workspaceId, so a reviewer reopening a Workspace
   (or a transient context-build failure) can see the most recent known
   state instead of a hard failure — "Workspace Snapshot" from the Phase
   12.8 architecture review.

   HONESTY OVER FRESHNESS: getSnapshot() ALWAYS reports how old the cached
   value is (`ageMs`, `stale`) — mirrors Body's own `observedAt`/`since`
   discipline (body/contracts/entity-contract.js's header: "never a
   fabricated passthrough... never silently OBSERVABILITY_ONLY"). A
   snapshot is never handed to a caller disguised as a live read.

   SCOPE, DELIBERATELY NARROW: this is an in-memory Map, NOT yet wired
   into js/pwa.js / service-worker.js's actual offline cache — the Phase
   12.8 architecture review flagged integrating with the app's real PWA
   caching strategy as a pre-sprint spike, not an assumption. Building a
   SECOND, uncoordinated offline-storage mechanism here would risk
   exactly the kind of storage-quota/regression risk that review named;
   this file intentionally stays a same-process, same-tab convenience
   cache until that spike happens. See workspace/README.md's "What Phase
   12.8 does NOT do."

   RESPONSIBILITY: cacheSnapshot(workspaceId, context), getSnapshot(workspaceId).

   DEPENDENCIES: none.

   NON-GOALS: no LRU eviction, no size cap yet — flagged as a known
   follow-up (the architecture review's own Sprint 12.8.6 risk note), not
   a real problem at this platform's current, pre-any-real-load volumes.
   ============================================================ */

'use strict';

/** One snapshot per workspaceId is enough — a caller who wants history
 *  already has Workspace Timeline (Sprint 12.8.5). */
const _cache = new Map();

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

/** @param {string} workspaceId @param {object} context - a WorkspaceContext, as built by workspace-context-builder.js */
export function cacheSnapshot(workspaceId, context) {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('cacheSnapshot: workspaceId is required.');
  _cache.set(workspaceId, { context, cachedAt: Date.now() });
}

/**
 * @param {string} workspaceId
 * @param {{staleAfterMs?: number}} [opts]
 * @returns {{context: object, cachedAt: string, ageMs: number, stale: boolean}|null}
 */
export function getSnapshot(workspaceId, { staleAfterMs = DEFAULT_STALE_AFTER_MS } = {}) {
  const entry = _cache.get(workspaceId);
  if (!entry) return null;
  const ageMs = Date.now() - entry.cachedAt;
  return Object.freeze({
    context: entry.context,
    cachedAt: new Date(entry.cachedAt).toISOString(),
    ageMs,
    stale: ageMs > staleAfterMs,
  });
}

export function clearSnapshot(workspaceId) {
  _cache.delete(workspaceId);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetWorkspaceSnapshotCache() {
  _cache.clear();
}
