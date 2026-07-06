/* ============================================================
   WORKSPACE-LOADER.JS — v1.19.9 Executive Command Center

   Given a workspace profile, resolve its ordered widget ids into
   [{ def, impl }] pairs, lazily importing each widget's implementation via
   the Widget Registry. Unknown / unavailable widgets are skipped (never
   throw) so one broken widget can never blank the whole workspace.
   ============================================================ */

'use strict';

import { getWidgetDef, loadWidgetImpl } from './widget-registry.js';

/**
 * @typedef {{ def: {id:string,title:string,span:number,group:string}, impl: {render:Function, onMount?:Function} }} ResolvedWidget
 */

/**
 * Resolve every widget of a workspace, in order.
 * @param {{widgets:string[]}} workspace
 * @returns {Promise<ResolvedWidget[]>}
 */
export async function loadWorkspaceWidgets(workspace) {
  const ids = (workspace && Array.isArray(workspace.widgets)) ? workspace.widgets : [];

  const resolved = await Promise.all(ids.map(async (id) => {
    const def = getWidgetDef(id);
    if (!def) return null;
    let impl = null;
    try {
      impl = await loadWidgetImpl(id);
    } catch (err) {
      console.warn(`[Workspace] widget "${id}" failed to load`, err);
      impl = null;
    }
    if (!impl || typeof impl.render !== 'function') return null;
    return { def, impl };
  }));

  return resolved.filter(Boolean);
}
