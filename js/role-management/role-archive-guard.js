/* ============================================================
   ROLE-ARCHIVE-GUARD.JS — Role Assignment & Dependency, v1.30.3

   Administration Platform, Phase 4. Makes the archive flow dependency-
   aware: consults role-usage-provider.js before allowing a Custom Role to
   be archived. Today the provider is always the zero-usage default, so
   `allowed` is always true — but through a real evaluated code path, not
   a hardcoded "always true" literal, so a future User Management phase's
   real provider blocks archiving without this file (or its caller in
   role-management-center.js) changing at all.

   PURE: plain data transforms. No DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { getRoleUsage } from './role-usage-provider.js';

/**
 * Whether a role is safe to archive right now.
 * @param {string} roleId
 * @param {{getUsage?: (roleId: string) => Object}} [deps]  test-only injection point; defaults to the live role-usage-provider singleton
 * @returns {{allowed: boolean, reason: string|null, usage: Object}}
 */
export function canArchiveRole(roleId, deps = {}) {
  const getUsage = deps.getUsage || getRoleUsage;
  const usage = getUsage(roleId) || {};
  const assignedUsers = Number.isFinite(usage.assignedUsers) ? usage.assignedUsers : 0;
  const dependencies = Array.isArray(usage.dependencies) ? usage.dependencies : [];

  if (assignedUsers > 0) {
    return {
      allowed: false,
      reason: `Role ini masih digunakan oleh ${assignedUsers} user dan tidak dapat diarsipkan.`,
      usage,
    };
  }
  if (dependencies.length > 0) {
    return {
      allowed: false,
      reason: `Role ini masih memiliki ${dependencies.length} dependensi aktif dan tidak dapat diarsipkan.`,
      usage,
    };
  }
  return { allowed: true, reason: null, usage };
}
