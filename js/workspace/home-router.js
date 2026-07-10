/* ============================================================
   HOME-ROUTER.JS — v1.19.9 Executive Command Center

   The Home entry point. Turns the login flow into:

       Resolve Role → Resolve Workspace → Load Widget Registry → Render

   Home is a Workspace Loader, not a module. It holds NO business logic and
   NO data — the host of the app builds a ctx (user, role, data snapshots,
   and an `actions` map of existing nav/modal functions) and hands it here.

   Exposes renderHome (skeleton-first, full render) and refreshHome (in-place
   re-render on live data changes without a skeleton flash).
   ============================================================ */

'use strict';

import { resolveWorkspaceForRole } from './workspace-registry.js';
import { loadWorkspaceWidgets } from './workspace-loader.js';
import { renderShell, mountWidgets, wireDelegation } from './workspace-renderer.js';
import { injectWorkspaceStyles } from './workspace-styles.js';

export { resolveWorkspaceForRole } from './workspace-registry.js';

/**
 * Render the workspace for ctx.role into `host`.
 * @param {HTMLElement} host  a container carrying `exec-ui v2-analytics-claude`
 * @param {Object} ctx        { user, role, actions, ...data }
 * @param {{skeleton?:boolean}} [opts]
 * @returns {Promise<Object>} the resolved workspace profile
 */
export async function renderHome(host, ctx, { skeleton = true } = {}) {
  if (!host) return null;
  injectWorkspaceStyles();
  const workspace = resolveWorkspaceForRole(ctx.role);

  // Publish the live ctx + a render token so a superseding render/refresh wins.
  host.__wspCtx = ctx;
  const token = Symbol('wsp-render');
  host.__wspToken = token;

  // Draw the skeleton when forced, or when the workspace identity changes
  // (first render, or a role switch). A same-workspace refresh keeps the DOM.
  if (skeleton || host.__wspWorkspaceId !== workspace.id) {
    renderShell(host, workspace);
  }
  wireDelegation(host);

  const resolved = await loadWorkspaceWidgets(workspace);
  if (host.__wspToken !== token) return workspace; // a newer render took over
  // Phase 11D/11H: the host was hidden (workspace switched away) while the
  // widget import/load above was in flight — app.js's setWorkspace() also
  // invalidates the token on nav-away, but this display check is a second,
  // independent guard against writing into an inactive workspace container.
  if (host.style.display === 'none') return workspace;

  // Ensure the shell exists (e.g. refresh path before any shell was drawn).
  if (host.__wspWorkspaceId !== workspace.id) renderShell(host, workspace);

  mountWidgets(host, resolved, ctx);
  return workspace;
}

/**
 * Re-render the current workspace in place with fresh ctx (no skeleton flash).
 * Called from the app's live data-change listeners while Home is active.
 */
export async function refreshHome(host, ctx) {
  return renderHome(host, ctx, { skeleton: false });
}
