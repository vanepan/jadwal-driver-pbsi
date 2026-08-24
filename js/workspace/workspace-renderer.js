/* ============================================================
   WORKSPACE-RENDERER.JS — v1.19.9 Executive Command Center

   Renders a workspace into a host element using the shared Executive UI
   grammar (the host carries `exec-ui v2-analytics-claude`, so tokens +
   dark mode inherit — no new design language, no :root mutation).

   Pipeline: draw a labelled skeleton grid immediately (titles from the
   Widget Registry) → mount each resolved widget's body → wire ONE set of
   delegated handlers that route declarative deep links to the LIVE ctx.

   The renderer owns all a11y chrome (region roles, aria-busy, focusable
   action controls) so individual widgets never re-implement it.
   ============================================================ */

'use strict';

import { getWidgetDef } from './widget-registry.js';

/** Grid-span class shared by every widget variant. */
function spanClass(def) {
  return def.span === 'full' ? 'wsp-span-full' : `wsp-card--span${def.span || 1}`;
}

/**
 * Skeleton for a widget def (shown until its body mounts). Three chrome
 * variants, ONE pipeline:
 *   • card    (default)  — titled card; used by every non-executive widget.
 *   • section            — titled full-width block (executive summary sections).
 *   • hero               — untitled full-width block (the widget owns its heading).
 * Backward compatible: a def without `variant` renders exactly as before.
 */
function skeletonWidget(def) {
  if (!def) return '';
  const variant = def.variant || 'card';
  const skel = '<div class="wsp-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>';
  // v1.22.1 Objective 12 — Premium Motion: a quiet reveal on workspace
  // mount/switch. `fade-up`/`anFadeUp` already exists globally under
  // `.v2-analytics-claude` (platform.css) and already respects
  // prefers-reduced-motion, so this needs zero new CSS. renderShell() only
  // redraws the skeleton on mount/role-switch (never on a data-only refresh —
  // see home-router.js), so the reveal never replays on live data updates.

  if (variant === 'card') {
    return `
    <section class="wsp-card ${spanClass(def)} wsp-card--loading fade-up"
             data-widget-id="${def.id}" role="listitem" aria-label="${def.title}" aria-busy="true">
      <header class="wsp-card__head"><h3 class="wsp-card__title">${def.title}</h3></header>
      <div class="wsp-card__body">${skel}</div>
    </section>`;
  }

  const head = variant === 'section'
    ? `<header class="wsp-block__head"><h2 class="wsp-block__title">${def.title}</h2></header>`
    : '';
  return `
    <section class="wsp-block wsp-block--${variant} ${spanClass(def)} wsp-block--loading fade-up"
             data-widget-id="${def.id}" role="listitem" aria-label="${def.title}" aria-busy="true">
      ${head}
      <div class="wsp-block__body">${skel}</div>
    </section>`;
}

/** Error body when a widget's render() throws — never blanks the workspace. */
function errorBody() {
  return '<div class="wsp-empty wsp-empty--error">Gagal memuat widget ini.</div>';
}

/** Flat grid — every workspace's original, unchanged behavior. */
function renderFlatGrid(widgetIds) {
  const cards = (widgetIds || []).map(id => skeletonWidget(getWidgetDef(id))).join('');
  return `<div class="wsp-grid" role="list">${cards}</div>`;
}

/**
 * Phase 7 — group cards into `.wsp-zone` bands instead of one flat grid
 * (Masthead -> NOW -> DECISIONS -> SITUATION -> OUTLOOK -> Deep Dive for the
 * Executive workspace). Every zone gets the same stable `data-zone-id`
 * wrapper (a reliable DOM anchor for CSS/tests regardless of whether it's
 * labeled); a zone with no `label` (Masthead, Explore) just omits the
 * eyebrow/heading `<header>` — no icon, no box, typography-only banding per
 * the brief's "typography-driven hierarchy" direction. `.wsp-zone` is a
 * plain flex column around its own single `.wsp-grid`, so an unlabeled zone
 * is visually identical to the old unwrapped flat-grid case.
 */
function renderZonedGrid(zones) {
  const sections = zones.map((zone) => {
    const grid = renderFlatGrid(zone.widgets);
    const headId = `wsp-zone-eyebrow-${zone.id}`;
    const heading = zone.heading ? `<h2 class="wsp-zone__heading">${zone.heading}</h2>` : '';
    const header = zone.label ? `
        <header class="wsp-zone__head fade-up">
          <span class="wsp-zone__eyebrow" id="${headId}">${zone.label}</span>
          ${heading}
        </header>` : '';
    return `
      <section class="wsp-zone" data-zone-id="${zone.id}"${zone.label ? ` aria-labelledby="${headId}"` : ''}>
        ${header}
        ${grid}
      </section>`;
  }).join('');
  // Phase 7E (Dashboard Composition Rebuild) — zones are grid ITEMS of one
  // shared 12-column grid instead of a vertical flex stack, so a pair of
  // zones (NOW/DECISIONS, workspace-styles.js's own `grid-column: span 6`
  // rule) can share a row instead of each forcing a full-width band. This
  // wrapper only ever appears here — renderFlatGrid() (every non-zoned
  // workspace: Request/Driver/Engineering) is a completely separate
  // function this doesn't touch, so those workspaces are unaffected by
  // construction, not by convention. Zone widget ORDER (and therefore the
  // single-column mobile fallback order) is unchanged — only the grid
  // placement each zone gets above the mobile breakpoint changes.
  return `<div class="wsp-dashboard-grid">${sections}</div>`;
}

/**
 * Draw the workspace shell + a skeleton grid. Idempotent per (host, workspace):
 * re-drawing replaces the DOM. Stores the workspace id on the host so the
 * router can decide whether a refresh needs a fresh skeleton.
 *
 * Phase 7 — when `workspace.zones` is defined, cards render as labeled
 * bands (renderZonedGrid); every workspace that omits it (Request/Driver/
 * Engineering) renders the original flat grid, byte-for-byte — this is one
 * additive branch, not a second rendering pipeline.
 */
export function renderShell(host, workspace) {
  const body = Array.isArray(workspace.zones) && workspace.zones.length
    ? renderZonedGrid(workspace.zones)
    : renderFlatGrid(workspace.widgets);
  host.innerHTML = `
    <div class="wsp-root">
      <header class="wsp-header">
        <span class="wsp-eyebrow">Ruang Kerja</span>
        <h1 class="wsp-title">${workspace.title}</h1>
        <p class="wsp-subtitle">${workspace.subtitle}</p>
      </header>
      ${body}
    </div>`;
  host.__wspWorkspaceId = workspace.id;
}

/**
 * Fill each resolved widget's body via impl.render(ctx), then run impl.onMount.
 * A throwing widget degrades to an inline error card; siblings are unaffected.
 * @param {HTMLElement} host
 * @param {Array<{def:Object, impl:Object}>} resolved
 * @param {Object} ctx
 */
export function mountWidgets(host, resolved, ctx) {
  for (const { def, impl } of resolved) {
    const card = host.querySelector(`[data-widget-id="${def.id}"]`);
    if (!card) continue;
    const body = card.querySelector('.wsp-card__body, .wsp-block__body');
    if (!body) continue;

    let html;
    try {
      html = impl.render(ctx);
    } catch (err) {
      console.warn(`[Workspace] widget "${def.id}" render failed`, err);
      html = errorBody();
      card.classList.add('wsp-card--error');
    }
    body.innerHTML = html;
    card.classList.remove('wsp-card--loading', 'wsp-block--loading');
    card.removeAttribute('aria-busy');

    if (typeof impl.onMount === 'function') {
      try { impl.onMount(body, ctx); }
      catch (err) { console.warn(`[Workspace] widget "${def.id}" onMount failed`, err); }
    }
  }
}

/**
 * Wire ONE delegated click handler on the host (once). It reads the LIVE ctx
 * from host.__wspCtx each event, so refreshes that swap in fresh data keep the
 * deep links pointed at current actions. Both mouse and keyboard work because
 * the interactive elements are native <button>s.
 */
export function wireDelegation(host) {
  if (host.__wspWired) return;
  host.__wspWired = true;
  host.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-wsp-action]');
    if (actionEl && host.contains(actionEl)) {
      const fn = host.__wspCtx?.actions?.[actionEl.dataset.wspAction];
      if (typeof fn === 'function') fn(actionEl.dataset.wspArg);
      return;
    }
    const detailEl = e.target.closest('[data-wsp-detail]');
    if (detailEl && host.contains(detailEl)) {
      const openDetail = host.__wspCtx?.actions?.openDetail;
      if (typeof openDetail === 'function') openDetail(detailEl.dataset.wspDetail);
    }
  });
}
