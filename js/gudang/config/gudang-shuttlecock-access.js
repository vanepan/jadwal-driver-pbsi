/* ============================================================
   GUDANG-SHUTTLECOCK-ACCESS.JS — the one place Gudang asks "may THIS
   session see Shuttlecock inventory?" (V1 Shuttlecock module)

   V1 requirement §2/§7/§12: Shuttlecock visibility must be a real
   access-control decision from the EXISTING permission system, never a
   hardcoded department name, user email, or CSS-only hide.

   Same dependency-injection seam as config/gudang-bidang-source.js
   (#setGudangUsersSource) and js/engineering/personnel's
   #setEngineeringUsersSource: this module does NOT statically import
   js/permission-service.js (which pulls in js/auth.js → js/firebase.js,
   browser-only). js/app.js injects the live resolver once at startup:

       import { can } from './permission-service.js';
       setShuttlecockAccessSource(() => can('warehouse.shuttlecock.view'));

   Unset (Node harness, or before app.js boot) this fails CLOSED — resolves
   to `false`, so nothing Shuttlecock is ever shown by default.

   permission-service.js#can() already resolves the effective grant as
   base System-Role ∪ Role Additional Permissions ∪ Individual Permission
   overrides (keyed by username = the bidang's account) — so "bidang A yes,
   bidang B no, bidang C yes" is expressed entirely through the existing
   Individual Permission Assignment admin UI (js/admin.js), and Admin keeps
   global access because 'warehouse.shuttlecock.view' is in admin's
   BASE_GRANTS (config/role-permissions.js). Nothing new is invented here.

   PURE at this file's own boundary: no permission logic, only indirection.
   No DOM, no Firebase, no direct permission-service.js / auth.js import.
   ============================================================ */

'use strict';

/** Fail-closed default: no source wired ⇒ Shuttlecock is invisible. */
let _accessSource = () => false;

/**
 * Wire the live permission resolver (js/app.js calls this once at startup).
 * Ignores anything that isn't a function, so a bad call can never widen
 * access.
 * @param {() => boolean} fn
 */
export function setShuttlecockAccessSource(fn) {
  if (typeof fn === 'function') _accessSource = fn;
}

/**
 * Whether the CURRENT session may see and act on Shuttlecock inventory.
 * Never throws — any error in the injected resolver fails closed to `false`.
 * @returns {boolean}
 */
export function canAccessShuttlecock() {
  try {
    return _accessSource() === true;
  } catch (_) {
    return false;
  }
}
