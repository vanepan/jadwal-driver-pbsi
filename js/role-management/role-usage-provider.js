/* ============================================================
   ROLE-USAGE-PROVIDER.JS — Role Assignment & Dependency, v1.30.3

   Administration Platform, Phase 4. The pluggable extension point a future
   User Management phase registers against. No user can be assigned a role
   yet, so the default (and today's only) provider always returns zero
   usage — but every caller reaches that zero through this real, swappable
   indirection rather than a hardcoded literal scattered across the UI.

   When User Management ships, it calls registerRoleUsageProvider({
   getUsage }) once at its own boot time — no other Role Management file
   changes. getRoleUsage() normalizes whatever a provider returns (missing/
   malformed fields coerce to 0/[]) and never lets a throwing provider take
   the Role Management UI down with it.

   PURE: plain data transforms + one module-level swap slot. No DOM, no
   Firebase, no `window`.
   ============================================================ */

'use strict';

function zeroUsage() {
  return { assignedUsers: 0, assignments: [], dependencies: [], consumers: [] };
}

function zeroProvider() {
  return { getUsage: () => zeroUsage() };
}

let activeProvider = zeroProvider();

/**
 * Swap in a real usage provider. `provider.getUsage(roleId)` must return
 * (or resolve to, if this API is ever made async by a future phase — not
 * needed today) a {assignedUsers, assignments, dependencies, consumers}
 * shape; malformed fields are coerced by getRoleUsage(), not here.
 * @param {{getUsage: (roleId: string) => Object}} provider
 */
export function registerRoleUsageProvider(provider) {
  if (!provider || typeof provider.getUsage !== 'function') {
    throw new Error('Role usage provider harus menyediakan fungsi getUsage(roleId).');
  }
  activeProvider = provider;
}

/** Restores the default zero-usage provider. Test/teardown helper. */
export function resetRoleUsageProvider() {
  activeProvider = zeroProvider();
}

function normalizeUsage(raw) {
  const usage = raw || {};
  return {
    assignedUsers: Number.isFinite(usage.assignedUsers) ? usage.assignedUsers : 0,
    assignments: Array.isArray(usage.assignments) ? usage.assignments : [],
    dependencies: Array.isArray(usage.dependencies) ? usage.dependencies : [],
    consumers: Array.isArray(usage.consumers) ? usage.consumers : [],
  };
}

/**
 * A role's current usage, via whichever provider is active. Never throws —
 * a broken provider silently degrades to zero usage.
 * @param {string} roleId
 * @returns {{assignedUsers:number, assignments:Array, dependencies:Array, consumers:Array}}
 */
export function getRoleUsage(roleId) {
  try {
    return normalizeUsage(activeProvider.getUsage(roleId));
  } catch (err) {
    console.warn('[RoleUsageProvider] getUsage threw, falling back to zero usage', err);
    return zeroUsage();
  }
}
