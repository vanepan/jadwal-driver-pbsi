/* ============================================================
   GUDANG-BIDANG-SOURCE.JS — live Bidang roster bridge (Phase 10.1)

   UAT: "Departemen diganti dengan Bidang. List nama bidang dapat ditemukan
   di manajemen user dengan role bidang kecuali user akuntes." Goods Out's
   department picker (and everywhere else Gudang shows a department name —
   Analytics, Item Detail) now reads the REAL organizational units already
   registered in User Management (role: 'bidang'), not Gudang's own
   department-repository.js, which nothing had ever populated. "akuntes" is
   excluded — a real bidang-role account that isn't an operational
   goods-consuming unit.

   Department stays a ratified Gudang domain (Doc 3 Ch.03) with its own
   repository — this file only changes what Goods Out's picker is SOURCED
   from, it does not remove or replace that domain.

   Same dependency-injection seam as engineering/personnel/engineering-
   personnel.js#setEngineeringUsersSource: this module does NOT statically
   import js/users.js (which pulls in js/firebase.js, browser-only) — app.js
   injects the live getUserList() at startup; unset, this resolves to an
   empty roster (pure + safe, Node-harness-testable).

   PURE: no DOM, no Firebase, no direct users.js import.
   ============================================================ */

'use strict';

const EXCLUDED_USERNAMES = new Set(['akuntes']);

let _usersSource = () => [];

/** Wire the live User Management source (app.js calls this once at startup). */
export function setGudangUsersSource(fn) {
  if (typeof fn === 'function') _usersSource = fn;
}

/** Every active, non-archived Bidang-role user except the excluded ones,
 *  shaped exactly like the picker already expects ({ departmentId, name })
 *  so Goods Out/Analytics/Item Detail need no changes beyond the source. */
export function listBidang() {
  let users = [];
  try { users = _usersSource() || []; } catch (_) { users = []; }
  return users
    .filter((u) => u.role === 'bidang' && u.active !== false && u.archived !== true && !EXCLUDED_USERNAMES.has(u.username))
    .map((u) => ({ departmentId: u.username, name: u.displayName || u.username }));
}
