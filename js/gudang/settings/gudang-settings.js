/* ============================================================
   GUDANG-SETTINGS.JS — Gudang Foundation (Phase 1, Part 8)

   Authorized by: Doc 3 Ch.12 (Future Foundations — seams only) · Doc 4
   Art.VI (future seams remain dormant until officially activated)

   PURPOSE: minimal configuration only — a default location a future Goods
   In/Out screen can pre-fill, plus two seam flags. Neither `scan` nor
   `analytics` enables anything: they exist so a future phase has somewhere
   to flip a switch, without this phase guessing at their shape.

   Phase 1.1 Foundation Hardening (Review 6) removed a fourth field that was
   here, `defaultWarehouseId`. No "Warehouse" domain exists anywhere in
   Document 3 Ch.03's fifteen-row table — Gudang itself IS the warehouse,
   singular. Keeping that field would have silently invented a multi-
   warehouse architecture no ratified document describes (Doc 4 Art.II:
   implementation never invents architecture; Art.VI: no premature
   abstraction). `defaultLocationId` survives the same review because
   Location IS a ratified domain (Doc 3 Ch.03) with a real repository behind
   it — this is inert configuration over an already-owned domain, not a new
   concept.

   NO Settings UI — this is in-memory configuration state only, exactly as
   the Phase 1 brief specifies.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

const DEFAULT_SETTINGS = Object.freeze({
  defaultLocationId: null,
  // Doc 1 Art.X / Doc 3 Ch.12 — QR/Barcode/NFC are future capabilities only.
  scan: Object.freeze({ enabled: false }),
  // Doc 3 Ch.09 — Analytics Engine is a later phase; the flag exists, the engine doesn't.
  analytics: Object.freeze({ enabled: false }),
});

let _settings = DEFAULT_SETTINGS;

/** The current settings snapshot. */
export function getGudangSettings() {
  return _settings;
}

/** Shallow-merge a patch into the current settings. Returns the new snapshot. */
export function setGudangSettings(patch = {}) {
  _settings = Object.freeze({ ..._settings, ...patch });
  return _settings;
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetGudangSettings() {
  _settings = DEFAULT_SETTINGS;
  return _settings;
}
