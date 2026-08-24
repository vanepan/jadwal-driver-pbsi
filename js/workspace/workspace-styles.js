/* ============================================================
   WORKSPACE-STYLES.JS — v1.19.9 Executive Command Center

   Injects the scoped `.wsp-*` stylesheet ONCE. Every rule lives under
   `.wsp-root`, which is nested inside the Home host's `exec-ui
   v2-analytics-claude` scope — so ALL colors resolve from the existing
   Executive design tokens (light + dark) and dark mode is automatic. No
   :root mutation, no hardcoded colors, no new design language.
   ============================================================ */

'use strict';

// Phase 8 (Motion Polish) — every timing/easing constant this stylesheet
// uses now comes from motion-profiles.js, the single source of truth:
// MACRO_STAGGER drives the page-level reveal order (replacing a
// disconnected, position-based nth-child rule), MEASURED drives every
// progressive-disclosure transition (Attention/Recommendation/Story, one
// definition instead of three), and RESPONSIVE drives every hover/focus
// micro-transition (previously four different hand-rolled durations).
import { EASE, MACRO_STAGGER, MEASURED, RESPONSIVE } from '../widgets/executive/motion-profiles.js';

/* Phase 7G.1 (Command Panel Refinement) — the exact set of Executive
 * surfaces that should cross-fade instead of snap on a light<->dark theme
 * switch. Enumerated explicitly (no `*` wildcard) so this can never win a
 * specificity fight against an existing per-component `transition` rule
 * (.wsp-fleet-card, .wsp-launcher__*, tooltips, disclosures) elsewhere in
 * this file — those keep their own transform/opacity transitions
 * untouched. `.wsp-eyebrow`/`.wsp-title`/`.wsp-subtitle` are shared class
 * names (every workspace's header uses them), so those three are guarded
 * by `:has(.wsp-dashboard-grid)` — that wrapper is emitted ONLY by
 * renderZonedGrid(), which workspace-renderer.js uses ONLY for the
 * `executive` workspace (the only one with `zones` defined) — everything
 * else below (.wsp-hero*, .wsp-pulse, .wsp-attn--panel, .wsp-inbox--tinted)
 * is already Executive-only by construction, no guard needed.
 *
 * .wsp-hero / .wsp-attn--panel / .wsp-inbox--tinted are DELIBERATELY NOT
 * in this list — their background is a gradient (background-image), which
 * needs its own registered-custom-property transition (see the
 * @property block below), and CSS `transition` does not merge across two
 * separate rules matching the same selector at equal specificity — the
 * later rule wins outright. Giving them a second, competing `transition`
 * declaration here would silently discard that one. Each gets its own
 * single combined rule instead, right where its bg1/bg2 properties are
 * registered. */
const THEME_FADE_TARGETS = [
  '.wsp-root:has(.wsp-dashboard-grid) .wsp-eyebrow',
  '.wsp-root:has(.wsp-dashboard-grid) .wsp-title',
  '.wsp-root:has(.wsp-dashboard-grid) .wsp-subtitle',
  '.wsp-hero__headline',
  '.wsp-hero__insight',
  '.wsp-hero__stat',
  '.wsp-hero__stat-lbl',
  '.wsp-hero__stat-big',
  '.wsp-hero__domain-track',
  '.wsp-hero__domain-fill',
  '.wsp-hero__domain-label',
  '.wsp-hero__domain-val',
  '.wsp-pulse',
  '.wsp-zone[data-zone-id="situation"] .wsp-block--section',
];

let _injected = false;

export function injectWorkspaceStyles() {
  if (_injected || document.getElementById('wsp-styles')) { _injected = true; return; }
  const style = document.createElement('style');
  style.id = 'wsp-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
  _injected = true;
}

const CSS = `
/* Phase 7D — one new semantic category ("Intelligence": Teknik/prediction-
   adjacent signals — the Operational Pulse's Teknik dots, the Launcher's
   Intelijen group, Outlook's forward-looking accents), a muted indigo that
   doesn't exist elsewhere in the platform palette. Defined locally (not
   promoted to platform.css) since it's Executive-specific; light/dark
   tuned by hand the same way platform.css tunes --accent per theme. */
.wsp-root { --wsp-good: var(--c-green); --wsp-warn: var(--c-amber); --wsp-danger: var(--crit); --wsp-info: var(--c-blue); --wsp-neutral: var(--c-neutral);
  --wsp-intel: #5D5A9E;
  display: flex; flex-direction: column; gap: 44px; padding: 4px 2px 40px; }
:root[data-theme="dark"] .wsp-root { --wsp-intel: #8D89D6; }

/* Header — v1.22.2 Objective 1: this is page chrome, not the briefing. Shrunk
   to a small label so the Hero's own headline (the largest text on the page)
   is the unambiguous entry point — "Executive Command Center" no longer reads
   as a competing section title. */
.wsp-header { display: flex; flex-direction: column; gap: 2px; margin-bottom: -12px; }
.wsp-eyebrow { font-size: .68rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--text-faint); }
.wsp-title { font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: var(--text-dim); margin: 0; letter-spacing: -0.01em; }
.wsp-subtitle { font-size: .82rem; color: var(--text-faint); margin: 0; max-width: 62ch; }

/* Grid — collapse to 1 column only at the mobile tier (see the Adaptive
   Layout breakpoints at the end of this file); tablet keeps 2 columns. */
.wsp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
.wsp-card--span2 { grid-column: span 2; }

/* Dashboard composition grid (Phase 7E — Dashboard Composition Rebuild).
   Zones are grid ITEMS of one shared 12-column grid (workspace-renderer.js's
   .wsp-dashboard-grid wrapper) instead of a vertical flex stack — this is
   what lets NOW and DECISIONS share a row instead of each forcing a
   full-width band with a vertical gap between them. Only ever present when
   a workspace defines zones (Executive today) — Request/Driver/Engineering
   never render a .wsp-zone at all, so this is provably inert for them. */
.wsp-dashboard-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px 20px; align-items: start; }
.wsp-zone { grid-column: span 12; min-width: 0; }
/* NOW + DECISIONS: the brief's own "Attention and Decision should be
   capable of occupying the same visual band" — different visual identity
   (urgency vs. action, already established by exec-attention's plain
   severity list vs. exec-recommendation's tinted card), same row. */
.wsp-zone[data-zone-id="now"], .wsp-zone[data-zone-id="decisions"] { grid-column: span 6; }
@media (max-width: 600px) {
  /* Mobile composition (Section 12) — every zone stacks full-width again;
     DOM/zone order was never changed by the grid-placement rules above, so
     the mobile reading order is already Health(+Pulse, inside Hero) ->
     Attention -> Decision -> Snapshot -> Activity -> Driver -> Fleet ->
     Outlook -> Launcher, exactly the brief's requested priority, with zero
     additional reordering logic needed.
     Both grid-template-columns on the parent AND grid-column on EVERY
     zone (not just now/decisions) must be restated here — root-caused via
     CDP (CSS.getMatchedStylesForNode) + getComputedStyle, not guessed: the
     parent's explicit template genuinely was "1fr" at this width, but
     masthead/situation/outlook/explore still carried the default
     grid-column: span 12 (no media override at all, since span 12 IS
     their default) — a span-12+ child on a 1-column explicit grid forces
     CSS Grid to auto-generate IMPLICIT columns to satisfy it, and THOSE
     implicit tracks are what getComputedStyle's grid-template-columns
     reported, independent of the explicit "1fr" declaration still being
     correct and unbeaten. A plain .wsp-zone { grid-column: span 1; }
     here fixes every OTHER zone but NOT now/decisions specifically — the
     unconditional .wsp-zone[data-zone-id="now"] rule above (an
     attribute selector, specificity (0,2,0)) still outranks this generic
     class selector (0,1,0) regardless of source order, so it still wins
     even inside this later media query. The attribute-selector form has
     to be repeated here too, matching (not just exceeding) that
     specificity, to actually override it. */
  .wsp-dashboard-grid { grid-template-columns: 1fr; }
  .wsp-zone { grid-column: span 1; }
  .wsp-zone[data-zone-id="now"], .wsp-zone[data-zone-id="decisions"] { grid-column: span 1; }
}
.wsp-zone { display: flex; flex-direction: column; gap: 16px; }
.wsp-zone__head { display: flex; flex-direction: column; gap: 2px; }
.wsp-zone__eyebrow { font-size: .68rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--text-faint); }
.wsp-zone__heading { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: var(--text); margin: 0; letter-spacing: -0.01em; }

/* Phase 7B — Executive Experience Refinement: a subtle 1px hover lift on
   de-boxed clickable rows/cards, the tactile affordance that replaces the
   border/box they no longer have. Scoped under .wsp-zone (Executive-only —
   this ancestor never exists in Request/Driver/Engineering) rather than
   editing the shared .wsp-row--click/.wsp-inbox__item rules those other
   workspaces also use. */
.wsp-zone .wsp-row--click:hover { transform: translateY(-1px); }
.wsp-zone .wsp-inbox__item { transition: transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-zone .wsp-inbox__item:hover { transform: translateY(-1px); }
/* Phase 7C — ONE interaction language across every clickable surface in
   the briefing: hover lifts ~1px (above), active settles with a brief
   scale. Buttons (.wsp-btn, shared with Request/Driver/Engineering via
   _widget-base.js's actionBtn()) get the :active rule ONLY here, scoped
   under .wsp-zone, for the same reason the hover-lift rules above are
   scoped rather than edited at the source. */
.wsp-zone .wsp-btn {
  transition: background-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, border-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease},
    outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease};
}
.wsp-zone .wsp-btn:active, .wsp-zone .wsp-row--click:active, .wsp-zone .wsp-inbox__item:active { transform: scale(.995); }
@media (prefers-reduced-motion: reduce) {
  .wsp-zone .wsp-row--click:hover, .wsp-zone .wsp-inbox__item:hover,
  .wsp-zone .wsp-btn:active, .wsp-zone .wsp-row--click:active, .wsp-zone .wsp-inbox__item:active { transform: none; }
}
[data-anim="off"] .wsp-zone .wsp-row--click:hover, [data-anim="off"] .wsp-zone .wsp-inbox__item:hover,
[data-anim="off"] .wsp-zone .wsp-btn:active, [data-anim="off"] .wsp-zone .wsp-row--click:active, [data-anim="off"] .wsp-zone .wsp-inbox__item:active { transform: none; }

/* Card — v1.22.1 Objective 3: de-boxed. A hairline border only (no shadow, no
   heavy background separation) — enough boundary for panels that sit side by
   side in the grid, without reading as a "card wall". */
.wsp-card { background: var(--surface); border: 1px solid var(--border-faint); border-radius: var(--radius-sm); box-shadow: none;
  padding: 20px 20px 18px; display: flex; flex-direction: column; gap: 12px; min-height: 96px; min-width: 0; }
.wsp-card__head { display: flex; align-items: center; justify-content: space-between; }
.wsp-card__title { font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); margin: 0; }
.wsp-card__body { display: flex; flex-direction: column; gap: 12px; }
.wsp-card--error { border-color: var(--crit-line); }

/* Skeleton */
.wsp-skeleton { display: flex; flex-direction: column; gap: 8px; }
.wsp-skeleton span { height: 12px; border-radius: 6px; background: var(--border-faint);
  animation: wsp-pulse 1.3s ease-in-out infinite; }
.wsp-skeleton span:nth-child(1) { width: 80%; } .wsp-skeleton span:nth-child(2) { width: 55%; } .wsp-skeleton span:nth-child(3) { width: 68%; }
@keyframes wsp-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .wsp-skeleton span { animation: none; } }
/* Phase 8 — this guard was missing; the loading skeleton previously kept
   pulsing indefinitely even with the app's manual data-anim="off" switch
   engaged, until the OS-level preference also happened to be set. */
[data-anim="off"] .wsp-skeleton span { animation: none; }

/* Empty / placeholder */
.wsp-empty { font-size: .88rem; color: var(--text-faint); padding: 6px 0; }
.wsp-empty--error { color: var(--crit); }
.wsp-placeholder { display: flex; align-items: center; gap: 10px; color: var(--text-faint); font-size: .88rem; padding: 4px 0; }
.wsp-placeholder svg { color: var(--text-ghost); flex: none; }
.wsp-lead { font-size: .92rem; color: var(--text-dim); margin: 0; line-height: 1.5; }

/* Metrics */
.wsp-metric-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 12px; }
.wsp-metric { display: flex; flex-direction: column; gap: 2px; }
.wsp-metric__value { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--text); letter-spacing: -0.02em; line-height: 1.1; }
.wsp-metric__label { font-size: .72rem; color: var(--text-dim); font-weight: 600; }
.wsp-metric__sub { font-size: .68rem; color: var(--text-faint); }
.wsp-metric--good .wsp-metric__value { color: var(--wsp-good); }
.wsp-metric--warn .wsp-metric__value { color: var(--wsp-warn); }
.wsp-metric--danger .wsp-metric__value { color: var(--wsp-danger); }
.wsp-metric--info .wsp-metric__value { color: var(--wsp-info); }
/* Phase 7D — optional comparative bar (metric()'s barPct, caller-computed
   relative to the other values shown alongside it — never a percentage of
   an invented total). Inert/absent unless a caller opts in. */
.wsp-metric__bar-track { height: 4px; border-radius: 2px; background: var(--border-faint); margin-top: 8px; overflow: hidden; }
.wsp-metric__bar-fill { height: 100%; border-radius: 2px; background: currentColor; }
.wsp-metric--good .wsp-metric__bar-fill { background: var(--wsp-good); }
.wsp-metric--warn .wsp-metric__bar-fill { background: var(--wsp-warn); }
.wsp-metric--danger .wsp-metric__bar-fill { background: var(--wsp-danger); }
.wsp-metric--info .wsp-metric__bar-fill { background: var(--wsp-info); }
.wsp-metric--brand .wsp-metric__bar-fill { background: var(--accent); }
.wsp-metric--intel .wsp-metric__bar-fill { background: var(--wsp-intel); }
/* Premium Pass — bar-fill reveal/morph is fully JS-driven now (index.js's
   mountBarReveal): the element starts at width:0% (see metric()'s render
   in _widget-base.js) and is tweened to its data-bar-target% on mount,
   either 0->target (first mount / no tracked key) or last-shown->target (a
   live refresh) — the SAME element persisting a "from" value across
   renders is exactly what a CSS keyframe cannot express, only a JS tween
   with a stored last-value can. reduced-motion / data-anim="off" are
   handled inside mountBarReveal itself (jumps straight to target, no
   rAF loop), so no CSS animation/guard is needed here. */

/* Pill */
.wsp-pill { display: inline-flex; align-items: center; font-size: .72rem; font-weight: 700; padding: 3px 10px; border-radius: 999px;
  background: var(--accent-weak); color: var(--accent); width: fit-content; }
.wsp-pill--good { background: color-mix(in srgb, var(--wsp-good) 14%, transparent); color: var(--wsp-good); }
.wsp-pill--warn { background: color-mix(in srgb, var(--wsp-warn) 16%, transparent); color: var(--wsp-warn); }
.wsp-pill--danger { background: color-mix(in srgb, var(--wsp-danger) 14%, transparent); color: var(--wsp-danger); }
.wsp-pill--info { background: color-mix(in srgb, var(--wsp-info) 14%, transparent); color: var(--wsp-info); }
.wsp-pill--neutral { background: var(--border-faint); color: var(--text-dim); }

/* List rows */
.wsp-list { display: flex; flex-direction: column; }
.wsp-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border-faint);
  width: 100%; text-align: left; background: none; border-left: 0; border-right: 0; border-top: 0; font: inherit; color: inherit; }
.wsp-list .wsp-row:last-child { border-bottom: 0; }
.wsp-row--click { cursor: pointer; border-radius: 8px; outline: 2px solid transparent; outline-offset: 2px;
  transition: background-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-row--click:hover { background: var(--border-faint); }
.wsp-row--click:focus-visible { outline-color: var(--accent); }
.wsp-row__dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--wsp-neutral); }
.wsp-row__dot--good { background: var(--wsp-good); } .wsp-row__dot--warn { background: var(--wsp-warn); }
.wsp-row__dot--danger { background: var(--wsp-danger); } .wsp-row__dot--info { background: var(--wsp-info); }
.wsp-row__main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.wsp-row__title { font-size: .86rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wsp-row__meta { font-size: .74rem; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wsp-row__trailing { font-size: .74rem; font-weight: 600; color: var(--text-dim); flex: none; }

/* Phase 7D — Driver trip-count bars (exec-drivers, index.js): a bespoke
   4-column row (dot / name / comparative bar / status) rather than
   .wsp-row's title+trailing shape — reuses .wsp-row__dot (identical status
   dot) but is otherwise its own layout, since no other list in the
   briefing needs an inline comparison bar. Bar length is honest: each
   driver's real trip count today, relative to the busiest driver shown —
   never a fabricated workload/fatigue percentage. */
.wsp-driver-list { display: flex; flex-direction: column; }
.wsp-driver-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border-faint); }
.wsp-driver-list .wsp-driver-row:first-child { border-top: none; }
.wsp-driver-row__name { font-size: .86rem; font-weight: 700; color: var(--text); width: 64px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wsp-driver-row__bar-track { flex: 1; height: 6px; border-radius: 3px; background: var(--border-faint); overflow: hidden; }
.wsp-driver-row__bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--wsp-neutral); }
.wsp-driver-row__bar-fill--good { background: var(--wsp-good); }
.wsp-driver-row__bar-fill--info { background: var(--wsp-info); }
.wsp-driver-row__status { font-size: .72rem; font-weight: 600; color: var(--text-faint); width: 92px; flex: none; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Phase 7D — Fleet vehicle cards (exec-vehicle-flags): "cards are earned"
   for a real operational entity, replacing the plain list-row treatment.
   Same certified reminder data (statusLabel/tone/reason), just given a
   distinct visual object per vehicle instead of one flat list. */
.wsp-fleet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
/* Premium Visual Experience Pass — a resting shadow-sm + a status-tone
   left accent (3px, color-mix'd, restrained — reinforces the SAME tone
   the status pill below already states, never a new/independent signal)
   so the card reads as a genuinely elevated object at rest, not just on
   hover. Hover upgrades to shadow-md (existing token, --shadow-md,
   previously unused anywhere in this file) for real lift, not just the
   1-2px shadow-sm it shared with every other resting surface. */
.wsp-fleet-card {
  display: flex; flex-direction: column; gap: 8px; padding: 14px; text-align: left; font: inherit; color: inherit;
  background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--wsp-neutral);
  border-radius: var(--radius-sm); box-shadow: var(--shadow-sm); cursor: pointer;
  transition: transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, box-shadow ${RESPONSIVE.duration}ms ${RESPONSIVE.ease};
}
.wsp-fleet-card--good { border-left-color: var(--wsp-good); }
.wsp-fleet-card--warn { border-left-color: var(--wsp-warn); }
.wsp-fleet-card--danger { border-left-color: var(--wsp-danger); }
.wsp-fleet-card--info { border-left-color: var(--wsp-info); }
div.wsp-fleet-card { cursor: default; }
.wsp-fleet-card:is(button):hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.wsp-fleet-card:is(button):focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.wsp-fleet-card__top { display: flex; align-items: center; justify-content: space-between; }
.wsp-fleet-card__icon { display: inline-flex; color: var(--text-faint); }
.wsp-fleet-card__dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--wsp-neutral); }
.wsp-fleet-card__name { font-family: var(--font-display); font-size: .82rem; font-weight: 700; color: var(--text); }
.wsp-fleet-card__status { display: inline-flex; align-items: center; font-size: .68rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; width: fit-content; }
.wsp-fleet-card__status--good { background: color-mix(in srgb, var(--wsp-good) 14%, transparent); color: var(--wsp-good); }
.wsp-fleet-card__status--warn { background: color-mix(in srgb, var(--wsp-warn) 16%, transparent); color: var(--wsp-warn); }
.wsp-fleet-card__status--danger { background: color-mix(in srgb, var(--wsp-danger) 14%, transparent); color: var(--wsp-danger); }
.wsp-fleet-card__status--info { background: color-mix(in srgb, var(--wsp-info) 14%, transparent); color: var(--wsp-info); }
.wsp-fleet-card__status--neutral { background: var(--border-faint); color: var(--text-dim); }
.wsp-fleet-card__reason { font-size: .7rem; color: var(--text-faint); line-height: 1.4; }
@media (prefers-reduced-motion: reduce) { .wsp-fleet-card { transition: none; } .wsp-fleet-card:is(button):hover { transform: none; } }
[data-anim="off"] .wsp-fleet-card { transition: none; }
[data-anim="off"] .wsp-fleet-card:is(button):hover { transform: none; }

/* Buttons / actions */
.wsp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.wsp-btn { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; font-weight: 600; font-family: inherit;
  padding: 8px 13px; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid var(--border);
  outline: 2px solid transparent; outline-offset: 2px;
  transition: background-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, border-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-btn--ghost { background: var(--surface); color: var(--text); }
.wsp-btn--ghost:hover { background: var(--border-faint); border-color: var(--border-strong); }
.wsp-btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.wsp-btn--primary:hover { filter: brightness(1.05); }
/* v1.30.10.x — text-link CTA (Attention Center rows): no box, accent color,
   trailing arrow — an alternate treatment to --ghost/--primary, not a
   replacement; every existing caller keeps its own variant untouched. */
.wsp-btn--link { padding: 4px 0; border: none; background: none; color: var(--accent); font-weight: 700; }
.wsp-btn--link:hover { text-decoration: underline; }
.wsp-btn--link .wsp-btn__icon { display: none; }
.wsp-btn--link span:last-child::after { content: '→'; margin-left: 5px; }
.wsp-btn:focus-visible { outline-color: var(--accent); }
.wsp-btn__icon { display: inline-flex; }
/* A lone button placed directly in a card body should hug its content, not
   stretch to the flex-column width. Buttons inside .wsp-actions are exempt. */
.wsp-card__body > .wsp-btn { align-self: flex-start; }

/* Readiness (score) */
.wsp-readiness { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.wsp-score { display: flex; align-items: baseline; gap: 2px; flex: none; }
.wsp-score__val { font-family: var(--font-display); font-size: 3.2rem; font-weight: 800; line-height: 1; color: var(--text); letter-spacing: -0.03em; }
.wsp-score__unit { font-size: 1rem; color: var(--text-faint); font-weight: 600; }
.wsp-score--good .wsp-score__val { color: var(--wsp-good); }
.wsp-score--warn .wsp-score__val { color: var(--wsp-warn); }
.wsp-score--danger .wsp-score__val { color: var(--wsp-danger); }
.wsp-score--info .wsp-score__val { color: var(--wsp-info); }
.wsp-readiness__body { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 220px; }

/* Assignment highlight */
.wsp-assign { display: flex; flex-direction: column; gap: 3px; }
.wsp-assign__value { font-family: var(--font-display); font-size: 1.35rem; font-weight: 700; color: var(--text); }
.wsp-assign__meta { font-size: .78rem; color: var(--text-dim); }

/* ════════ v1.19.10 Executive Briefing ════════ */

/* Full-width span + block variants (hero / section) */
.wsp-span-full { grid-column: 1 / -1; }
.wsp-block { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
/* v1.22.2 Objective 3 — whitespace carries the separation now, not even a
   hairline divider under section titles (v1.22.1 used one). */
.wsp-block__head { display: flex; align-items: baseline; }
.wsp-block__title { font-family: var(--font-display); font-size: .92rem; font-weight: 700; color: var(--text-dim); margin: 0; letter-spacing: -0.005em; }
.wsp-block__body { display: flex; flex-direction: column; gap: 12px; }
.wsp-block--loading .wsp-block__body { min-height: 60px; }
/* Command Panel Pass (7G) — SITUATION's four quadrants (Snapshot/Activity/
   Driver/Fleet) become real tonal panels, matching the approved design's
   "operational control board." Scoped to the situation zone specifically
   (reusing the .wsp-zone[data-zone-id] pattern already established
   throughout this program) — every OTHER de-boxed .wsp-block--section
   elsewhere on the page (Attention/Decision/Outlook/Launcher, which have
   their own distinct treatments) is untouched by this rule, and this rule
   never touches Request/Driver/Engineering (they never render
   .wsp-zone at all). Zero JS/markup change — the renderer already wraps
   every widget in .wsp-block, this only adds a background/border/shadow
   to the ones inside this one zone. */
.wsp-zone[data-zone-id="situation"] .wsp-block--section {
  background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow-sm); padding: 20px 22px;
}

/* ════════ Hero — Phase 1 (Executive Hero) ════════
   The Hero is ONE composite object (Greeting/Headline/Narrative/Health
   Score/Operational Pulse) per the approved Hero Composite decision — no
   sibling widget may exist for any of these, and nothing outside this
   block schedules Hero animation. Layout is a single CSS Grid whose
   grid-template-areas is reassigned per breakpoint below; the DOM never
   changes shape, only the area map — so the Hero stays "one composed
   object" at every size instead of becoming a stack of swapped-out
   fragments. Base rules here are the Mobile layout (ring-first, centered)
   per the approved Design Review mobile board; ≥768px and ≥1280px
   overrides restore the Tablet and Desktop boards respectively. */
/* Command Panel Pass (7G) — the Hero becomes an elevated "control surface"
   per the approved reference design, not a de-boxed section like the rest
   of the page. Tonal gradient (surface-2 -> surface, both real tokens,
   never a new color), a real shadow-lg (already an existing token, unused
   here before this pass), generous radius-lg + padding. Everything INSIDE
   still uses the app's own tokens exclusively. */
/* Phase 7G.1 — --wsp-hero-bg1/2 registered as <color> (see the
   @property block further down, grouped with the glow's own registration)
   so this gradient's two stops can cross-fade on a theme switch. A plain
   linear-gradient(var(--surface-2), var(--surface)) background cannot
   transition at all -- background-image (which is what a gradient sets)
   has no interpolable value in CSS, so it would otherwise snap instantly
   even with a transition: background-color rule applied to this element
   (background-color and background-image are different properties).
   Visually identical to the previous rule; only now animatable. */
.wsp-hero {
  --wsp-hero-bg1: var(--surface-2);
  --wsp-hero-bg2: var(--surface);
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas: "eyebrow" "verdict" "health" "stats" "domains" "pulse" "details";
  gap: 24px;
  padding: 28px 20px 26px;
  text-align: center;
  position: relative;
  z-index: 0;
  background: linear-gradient(180deg, var(--wsp-hero-bg1) 0%, var(--wsp-hero-bg2) 60%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
/* Phase 7G.1 (Command Panel Refinement) — the ambient glow moved from a
   Hero-corner-anchored pseudo-element to a gauge-wrapper-anchored one.
   Root cause of the "dirty/muddy patch" + "worse on mobile" reports: the
   old .wsp-hero::before was a FIXED 620x620px circle pinned to the Hero's
   own top-right corner (top:-140px; right:-100px), with only its WIDTH
   (not height) capped at max-width:90% on narrow viewports. Measured in a
   real browser: at 375px the box became a 306x620 ELLIPSE (width clamped,
   height untouched) sweeping straight down through the headline; on
   tablet, where the gauge sits at the Hero's LEFT edge (not top-right),
   the glow's center measured ~750px away from the gauge's actual center —
   floating disconnected over empty space. Anchoring to .wsp-hero__gwrap
   instead (the element that tightly wraps the gauge SVG, confirmed
   identical box size to the SVG at every breakpoint) fixes all three at
   once: percentage width/height on an absolutely-positioned descendant
   resolve against ITS OWN positioned ancestor's padding-box, so the glow
   auto-scales with the gauge (156px mobile/base, 128px tablet+) with zero
   per-breakpoint position math, and is centered on it by construction.
   .wsp-hero keeps overflow:hidden as a safety clamp so nothing can bleed
   past the panel's own edges. */
/* Registers --wsp-mood-glow as an interpolable <color> (default: an
   unregistered custom property is a discrete, non-animatable token; the
   browser cannot cross-fade "transparent" -> "a color" without this). This
   is what lets the transition two rules down actually interpolate the
   glow's color through the theme switch, instead of it popping instantly
   while every other Command Panel surface glides — the one gap in the
   app's existing site-wide .theme-anim crossfade (platform.css), which
   only lists background-color/border-color/color/box-shadow and has no
   entry for a gradient-driven background-image like this one. */
@property --wsp-mood-glow {
  syntax: '<color>';
  inherits: true;
  initial-value: transparent;
}
/* Phase 7G.1 — the same registration for every other gradient-stop custom
   property this pass introduced (.wsp-hero / .wsp-attn--panel /
   .wsp-inbox--tinted), grouped here rather than split next to each rule
   so the "why @property" reasoning above only has to be written once. */
@property --wsp-hero-bg1 { syntax: '<color>'; inherits: true; initial-value: transparent; }
@property --wsp-hero-bg2 { syntax: '<color>'; inherits: true; initial-value: transparent; }
@property --wsp-attn-bg1 { syntax: '<color>'; inherits: true; initial-value: transparent; }
@property --wsp-attn-bg2 { syntax: '<color>'; inherits: true; initial-value: transparent; }
@property --wsp-inbox-bg1 { syntax: '<color>'; inherits: true; initial-value: transparent; }
@property --wsp-inbox-bg2 { syntax: '<color>'; inherits: true; initial-value: transparent; }
/* One combined rule per surface (gradient stops + border-color/box-shadow/
   color together) -- not split across two rules, so nothing here can lose
   a cascade fight against THEME_FADE_TARGETS's own rule further down. */
.wsp-hero {
  transition: --wsp-hero-bg1 ${MEASURED.duration}ms ${MEASURED.ease}, --wsp-hero-bg2 ${MEASURED.duration}ms ${MEASURED.ease},
    border-color ${MEASURED.duration}ms ${MEASURED.ease}, box-shadow ${MEASURED.duration}ms ${MEASURED.ease}, color ${MEASURED.duration}ms ${MEASURED.ease};
}
.wsp-attn--panel {
  transition: --wsp-attn-bg1 ${MEASURED.duration}ms ${MEASURED.ease}, --wsp-attn-bg2 ${MEASURED.duration}ms ${MEASURED.ease},
    border-color ${MEASURED.duration}ms ${MEASURED.ease}, box-shadow ${MEASURED.duration}ms ${MEASURED.ease}, color ${MEASURED.duration}ms ${MEASURED.ease};
}
.wsp-inbox--tinted {
  transition: --wsp-inbox-bg1 ${MEASURED.duration}ms ${MEASURED.ease}, --wsp-inbox-bg2 ${MEASURED.duration}ms ${MEASURED.ease},
    border-color ${MEASURED.duration}ms ${MEASURED.ease}, box-shadow ${MEASURED.duration}ms ${MEASURED.ease}, color ${MEASURED.duration}ms ${MEASURED.ease};
}
@media (prefers-reduced-motion: reduce) { .wsp-hero, .wsp-attn--panel, .wsp-inbox--tinted { transition: none; } }
[data-anim="off"] .wsp-hero, [data-anim="off"] .wsp-attn--panel, [data-anim="off"] .wsp-inbox--tinted { transition: none; }
.wsp-hero__gwrap::before {
  content: ''; position: absolute; z-index: -1; pointer-events: none;
  top: 50%; left: 50%; width: 230%; height: 230%; transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, var(--wsp-mood-glow, transparent) 0%, transparent 60%);
  transition: --wsp-mood-glow ${MEASURED.duration}ms ${MEASURED.ease};
}
@media (prefers-reduced-motion: reduce) { .wsp-hero__gwrap::before { transition: none; } }
[data-anim="off"] .wsp-hero__gwrap::before { transition: none; }
/* Light mode — alpha trimmed from the previous 30/28/26/28/22% (which,
   spread across the old 620px field, read as a "haze"); now smaller and
   tightly contained around the gauge, so a lower alpha still reads as a
   clear, deliberate glow rather than competing with the headline. */
.wsp-hero--good .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, var(--wsp-good) 22%, transparent); }
.wsp-hero--warn .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, var(--wsp-warn) 20%, transparent); }
.wsp-hero--danger .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, var(--wsp-danger) 18%, transparent); }
.wsp-hero--info .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, var(--wsp-info) 20%, transparent); }
.wsp-hero--neutral .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, var(--wsp-neutral) 16%, transparent); }
/* Dark mode — a flat opacity bump alone would either stay imperceptible
   against the near-black Command Panel surface or, pushed further,
   collapse into a "bright blob" (both explicitly rejected). Instead the
   tone is first lightened toward white (still clearly the same hue, just
   higher luminance so it registers as LIGHT rather than a dim tinted
   patch), then given a moderate alpha — the gauge's own stroke stays the
   strongest, most saturated color signal; the glow only supports it. */
:root[data-theme="dark"] .wsp-hero--good .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, color-mix(in srgb, var(--wsp-good) 65%, white) 34%, transparent); }
:root[data-theme="dark"] .wsp-hero--warn .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, color-mix(in srgb, var(--wsp-warn) 65%, white) 32%, transparent); }
:root[data-theme="dark"] .wsp-hero--danger .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, color-mix(in srgb, var(--wsp-danger) 65%, white) 30%, transparent); }
:root[data-theme="dark"] .wsp-hero--info .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, color-mix(in srgb, var(--wsp-info) 65%, white) 32%, transparent); }
:root[data-theme="dark"] .wsp-hero--neutral .wsp-hero__gwrap::before { --wsp-mood-glow: color-mix(in srgb, color-mix(in srgb, var(--wsp-neutral) 65%, white) 26%, transparent); }
/* Mobile — the gauge itself stays full-size (156px, same as the base/
   desktop rule; only the 768px tablet tier shrinks it), but the Hero card
   it sits in is only ~340-400px wide, so the same 230% proportion reads
   as much larger relative to the card than it does on a 1400px desktop
   Hero. Shrunk further and dimmed, per Section 5's explicit allowance for
   a different mobile radius/opacity — this is the ONE breakpoint-specific
   override the glow needs; every other breakpoint inherits the gauge's
   own size for free via the percentage sizing above. */
@media (max-width: 767px) {
  .wsp-hero__gwrap::before { width: 175%; height: 175%; opacity: .78; }
}

/* Phase 7G.1 — smooth light<->dark cross-fade for the Command Panel and
   its sibling surfaces (see THEME_FADE_TARGETS above for the exact list
   and why each entry is Executive-scoped-safe). Reuses MEASURED (340ms,
   EASE) — "long enough to follow, short enough to trust" — rather than
   inventing a new, undocumented timing tier. Property list is restrained
   to Motion Language's own "safe to animate broadly" set (background-
   color/border-color/box-shadow/color); never layout/transform/filter.
   The app already arms a site-wide crossfade for real theme-toggle clicks
   (platform.css's html.theme-anim wildcard rule, added via
   applyTheme(theme, true) for ~650ms) — this rule is a deliberately
   narrow, permanent complement
   to it, not a replacement: it (a) still applies outside that 650ms
   window if data-theme ever changes some other way, and (b) is the only
   one of the two that respects prefers-reduced-motion/data-anim="off" for
   these elements — platform.css's version has no such guard. */
${THEME_FADE_TARGETS.join(',\n')} {
  transition: background-color ${MEASURED.duration}ms ${MEASURED.ease}, border-color ${MEASURED.duration}ms ${MEASURED.ease}, box-shadow ${MEASURED.duration}ms ${MEASURED.ease}, color ${MEASURED.duration}ms ${MEASURED.ease};
}
@media (prefers-reduced-motion: reduce) {
  ${THEME_FADE_TARGETS.join(',\n')} { transition: none; }
}
${THEME_FADE_TARGETS.map((s) => `[data-anim="off"] ${s}`).join(',\n')} { transition: none; }
.wsp-hero__eyebrow { grid-area: eyebrow; font-size: .74rem; font-weight: 600; color: var(--text-faint); }
.wsp-hero__verdict { grid-area: verdict; display: flex; flex-direction: column; gap: 12px; }
.wsp-hero__headline { font-family: var(--font-display); font-weight: 800; font-size: clamp(1.8rem, 4.2vw, 2.75rem);
  line-height: 1.1; letter-spacing: -0.025em; margin: 0; color: var(--text); }
.wsp-hero__hl--good { color: var(--wsp-good); }
.wsp-hero__hl--warn { color: var(--wsp-warn); }
.wsp-hero__hl--danger { color: var(--wsp-danger); }
.wsp-hero__hl--info { color: var(--wsp-info); }
.wsp-hero__hl--neutral { color: var(--text-faint); }
.wsp-hero__insight { font-size: .96rem; font-weight: 400; color: var(--text-faint); line-height: 1.45; margin: 0 auto; max-width: 56ch; }

/* Health Score — the dominant visual element (mobile: centered, ring first). */
.wsp-hero__health { grid-area: health; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.wsp-hero__gwrap { position: relative; z-index: 0; flex: none; display: flex; }
.wsp-hero__scorewrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
/* Phase 7B — scaled down with the ring (152->108px): a supporting signal
   beside the narrative, not a second hero number competing with it. */
.wsp-hero__scoreval { font-family: var(--font-display); font-weight: 800; font-size: 1.85rem; line-height: 1; letter-spacing: -0.03em; color: var(--text); font-variant-numeric: tabular-nums; }
.wsp-hero__scoreval--muted { color: var(--text-ghost); }
.wsp-hero__scoreunit { font-size: .68rem; color: var(--text-faint); font-weight: 600; }
.wsp-hero__healthmeta { display: flex; flex-direction: column; gap: 7px; align-items: center; }
.wsp-hero__panel-label { font-size: .7rem; font-weight: 600; color: var(--text-faint); }

/* Command Panel Pass (7G) — status pills. Was a vertical stat "card"
   (icon over number over label); now icon+number+label sit inline inside
   a pill-shaped chip (rounded-full, real surface + shadow-sm), matching
   the approved design's status-pill treatment. Wraps onto its own lines
   at every breakpoint including mobile — now that the pills are compact,
   2 comfortably fit per row down to 375px, so the brief's explicit "prefer
   wrapping [over horizontal scroll]" instruction is followed everywhere,
   not just tablet/desktop as in the previous card-shaped version. */
.wsp-hero__stats { grid-area: stats; display: flex; flex-wrap: wrap; gap: 10px; padding: 2px; }
.wsp-hero__stat {
  flex: 0 0 auto; min-width: 0; display: flex; align-items: center; gap: 9px; text-align: left;
  padding: 8px 16px 8px 9px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; box-shadow: var(--shadow-sm);
}
.wsp-hero__stat-lbl { font-size: .66rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--text-faint); white-space: nowrap; }
.wsp-hero__stat-big { font-family: var(--font-display); font-weight: 800; font-size: 1rem; letter-spacing: -0.01em; color: var(--text); font-variant-numeric: tabular-nums; }
/* Phase 7D — a colored icon badge per fact (was plain text): the same
   restrained-semantic-color language used everywhere else in the
   briefing, applied here for the first time. */
.wsp-hero__stat-icon { width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex: none; }
.wsp-hero__stat-icon--brand { background: color-mix(in srgb, var(--accent) 13%, transparent); color: var(--accent); }
.wsp-hero__stat-icon--info { background: color-mix(in srgb, var(--wsp-info) 13%, transparent); color: var(--wsp-info); }
.wsp-hero__stat-icon--warn { background: color-mix(in srgb, var(--wsp-warn) 15%, transparent); color: var(--wsp-warn); }
.wsp-hero__stat-icon--good { background: color-mix(in srgb, var(--wsp-good) 13%, transparent); color: var(--wsp-good); }
/* Panel label — only meaningful once the stats become their own boxed
   panel (desktop); orphaned/redundant on mobile+tablet, so hidden there. */
.wsp-hero__stats-label { display: none; font-size: .7rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }

/* Command Panel Pass (7G) — domain health strip. Was a vertical dot-
   strength list nested under the ring; now a full-width horizontal
   bar-meter strip (5 columns desktop, reflowing at narrower widths — see
   the mobile/tablet overrides below), matching the approved design.
   Same source data (breakdown.components' real score/label), same
   good/warn tone rule (EXPLAIN_ISSUE) as the dot version it replaces. */
.wsp-hero__domains { grid-area: domains; display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px;
  padding-top: 22px; border-top: 1px solid var(--border-faint); text-align: left; }
.wsp-hero__domain { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.wsp-hero__domain-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.wsp-hero__domain-label { font-size: .72rem; font-weight: 700; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wsp-hero__domain-val { font-family: var(--font-mono); font-size: .68rem; font-weight: 600; color: var(--text-faint); flex: none; }
.wsp-hero__domain-track { height: 5px; border-radius: 3px; background: var(--surface-3, var(--border-faint)); overflow: hidden; }
.wsp-hero__domain-fill { height: 100%; border-radius: 3px; }
.wsp-hero__domain-fill--good { background: var(--wsp-good); }
.wsp-hero__domain-fill--warn { background: var(--wsp-warn); }
@media (max-width: 767px) { .wsp-hero__domains { grid-template-columns: repeat(2, 1fr); gap: 16px 20px; } }

/* Phase 7D — Operational Pulse: a truthful time-distribution strip. Every
   dot is a REAL event (buildPulseMarks, js/widgets/executive/index.js) at
   its real timestamp on a fixed 07:00-19:00 axis — never a fabricated
   trend or forecast line. Lives inside the Hero, right below the pulse
   stats, so "what is happening" (headline) and "when did it happen today"
   (this) read as one continuous instrument. */
/* Phase 7D fix — explicit grid-area (was an unnamed grid item, silently
   auto-placed by the browser into whatever implicit cell was left over at
   each breakpoint — harmless when that leftover cell happened to be empty,
   but produced an unpredictable, sometimes very large, gap elsewhere in the
   Hero whenever real content made the leftover cell non-obvious). Spans the
   full Hero width below verdict/health/stats at every breakpoint — the
   axis+legend read better full-width than squeezed into one column anyway. */
/* Command Panel Pass (7G) — the rail gets its own elevated surface (real
   surface + border + shadow-sm) sitting ON the Command Panel's own tonal
   background, plus a "live" eyebrow dot, matching the approved design's
   "live signal rail" treatment. */
.wsp-pulse { grid-area: pulse; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow-sm); padding: 20px 22px; text-align: left; }
.wsp-pulse__label { font-size: .68rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint);
  margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.wsp-pulse__label::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--wsp-good);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wsp-good) 24%, transparent); flex: none; }
.wsp-pulse__axis { position: relative; height: 30px; }
/* A gradient track (was a 1px hairline) — brand-tinted toward the right
   edge (later in the day), giving the rail visual weight even before any
   dot renders. Purely decorative gradient direction, encodes nothing. */
.wsp-pulse__line { position: absolute; left: 0; right: 0; top: 14px; height: 3px; border-radius: 3px;
  background: linear-gradient(90deg, var(--border-faint) 0%, color-mix(in srgb, var(--accent) 8%, var(--border-faint)) 60%, color-mix(in srgb, var(--accent) 14%, var(--border-faint)) 100%); }
/* Premium Pass — dots are real <button> elements now (keyboard-focusable,
   see wirePulseTooltip in index.js), so the browser's default button chrome
   (padding/background/border) needs resetting before the visual ring below
   applies. Command Panel Pass — grown (13px -> 16px) with a soft glow halo
   (::after) so each real event reads as a small beacon, not a plain dot. */
.wsp-pulse__dot { position: absolute; top: 7px; width: 16px; height: 16px; border-radius: 50%; border: 3px solid var(--surface);
  padding: 0; appearance: none; -webkit-appearance: none; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.12); }
.wsp-pulse__dot::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; opacity: .16; background: inherit; pointer-events: none; }
.wsp-pulse__dot:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* Pop-in per dot, staggered via an inline animation-delay set per-index at
   render time (js/widgets/executive/index.js's buildPulseMarks/render) — a
   real event per dot, so the count/positions are real; only the reveal is
   decorative. Suppressed alongside the rest of Hero's entrance on refresh
   (mountHeroMotion's suppression querySelectorAll includes .wsp-pulse__dot). */
@keyframes wspPulseDotIn { from { transform: translateX(-50%) scale(0); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }
.wsp-pulse__dot { animation: wspPulseDotIn 380ms ${EASE} both; }
@media (prefers-reduced-motion: reduce) { .wsp-pulse__dot { animation: none; transform: translateX(-50%); } }
[data-anim="off"] .wsp-pulse__dot { animation: none; transform: translateX(-50%); }
.wsp-pulse__dot--brand { background: var(--accent); }
.wsp-pulse__dot--intel { background: var(--wsp-intel); }
.wsp-pulse__dot--warn { background: var(--wsp-warn); }
/* Phase 7G.4 — active-state pulse for driver-assignment-start events ONLY
   (index.js's buildPulseMarks: the active flag is true iff the log action
   is exactly 'assignment_started'). A second, independent pseudo-element
   (::before — ::after above already owns the dot's static halo, untouched)
   so this never competes with the existing entrance animation or halo.
   transform+opacity only (compositor-friendly, no layout/paint cost);
   background:inherit reads the SAME tone color the dot itself already
   resolves (brand/intel/warn, whichever this mark's domain is), so the
   ring is never a new/arbitrary color and stays correct in both themes for
   free. Slow (2.6s) and low-opacity by design — reads as "this happened,
   activity" rather than a notification alarm. */
.wsp-pulse__dot--active::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: inherit;
  opacity: 0;
  transform: scale(.6);
  pointer-events: none;
  animation: wspAssignmentPulse 2.6s ease-out infinite;
}
@keyframes wspAssignmentPulse {
  0%   { transform: scale(.6); opacity: .5; }
  70%  { transform: scale(1.9); opacity: 0; }
  100% { transform: scale(1.9); opacity: 0; }
}
/* Reduced motion / data-anim="off" — no animation, but the active state
   stays visible as a fixed, non-pulsing ring rather than disappearing. */
@media (prefers-reduced-motion: reduce) {
  .wsp-pulse__dot--active::before { animation: none; opacity: .32; transform: scale(1.3); }
}
[data-anim="off"] .wsp-pulse__dot--active::before { animation: none; opacity: .32; transform: scale(1.3); }
/* Visual Expansion Pass (Section 4/17) — the "now" marker: a real current
   time, same clamp-to-window math the event dots use. Deliberately the
   ONLY element in the Pulse that animates continuously (a slow breathing
   glow) — every event dot's own animation is a one-time pop-in that
   finishes and stops, per the brief's own "communicate this is live, not
   'this website wants your attention'" distinction. Reuses --accent (the
   same "this is NOW" color the Outlook horizon's own now-marker already
   uses), not --wsp-danger — this marks a position in time, not a severity. */
.wsp-pulse__now { position: absolute; top: -5px; bottom: -5px; width: 1px; background: color-mix(in srgb, var(--accent) 45%, transparent); transform: translateX(-50%); }
.wsp-pulse__now-dot { position: absolute; top: -3px; left: 50%; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); transform: translateX(-50%); }
@keyframes wspNowBreathe { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent); } 50% { box-shadow: 0 0 0 6px transparent; } }
.wsp-pulse__now-dot { animation: wspNowBreathe 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .wsp-pulse__now-dot { animation: none; } }
[data-anim="off"] .wsp-pulse__now-dot { animation: none; }
.wsp-pulse__ticks { display: flex; justify-content: space-between; font-size: .64rem; color: var(--text-ghost); font-variant-numeric: tabular-nums; margin-top: 6px; }
.wsp-pulse__legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 12px; }
.wsp-pulse__legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: .74rem; color: var(--text-dim); font-weight: 600; }
.wsp-pulse__legend-dot { width: 7px; height: 7px; border-radius: 50%; }

/* Premium Pass — the Pulse's hover/focus tooltip (Section 4's "signature
   visualization" requirement): one shared, event-delegated element per
   Pulse instance (wirePulseTooltip, index.js), positioned above whichever
   dot is hovered/focused. Content is real (time/domain/sentence from the
   same certified event, never invented) — the tooltip only reveals detail
   already implied by the dot, it doesn't add new facts. */
.wsp-pulse__tooltip {
  position: absolute; bottom: 100%; margin-bottom: 10px; transform: translateX(calc(-50% + var(--wsp-tooltip-shift, 0px))) translateY(4px);
  display: flex; flex-direction: column; gap: 2px; text-align: left;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-sm);
  padding: 9px 11px; min-width: 168px; max-width: min(240px, calc(100vw - 24px));
  opacity: 0; pointer-events: none; z-index: 5;
  transition: opacity ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease};
}
/* Command Panel Pass (7G) — --wsp-tooltip-shift (clampTooltipToViewport,
   index.js) nudges the tooltip back inside the viewport when centering on
   an edge dot/marker would push it off-screen; 0px (the default) leaves
   the original centered position untouched. */
.wsp-pulse__tooltip--visible { opacity: 1; transform: translateX(calc(-50% + var(--wsp-tooltip-shift, 0px))) translateY(0); }
.wsp-pulse__tooltip-time { font-size: .68rem; font-weight: 700; color: var(--text-faint); font-variant-numeric: tabular-nums; }
.wsp-pulse__tooltip-domain { font-size: .62rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--accent); }
.wsp-pulse__tooltip-sentence { font-size: .78rem; color: var(--text); line-height: 1.35; }
@media (prefers-reduced-motion: reduce) { .wsp-pulse__tooltip { transition: none; } }
[data-anim="off"] .wsp-pulse__tooltip { transition: none; }

/* Hero Micro Motion — the Hero's OWN entrance choreography, wired from
   motion-profiles.js (js/widgets/executive/motion-profiles.js). Deliberately
   a NEW, Hero-scoped keyframe rather than reusing platform.css's shared
   anFadeUp/.fade-up (that rule is DO-NOT-TOUCH and shared with the
   Analytics module) — this is what keeps Macro Motion (the page's fade-up,
   applied externally by workspace-renderer.js) and Micro Motion (this)
   completely independent, per the approved Conflict Resolution. Duration/
   easing/delay arrive as inline custom properties from render() (mood- and
   beat-specific); onMount sets animation:none inline on every refresh
   after the first, so the entrance never replays on a realtime update. */
@keyframes wspHeroReveal { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
@keyframes wspHeroRevealReduced { from { opacity: 0; } to { opacity: 1; } }
.wsp-hero-anim {
  animation-name: wspHeroReveal;
  animation-duration: var(--wsp-hero-dur, 500ms);
  animation-timing-function: var(--wsp-hero-ease, cubic-bezier(.2,.7,.2,1));
  animation-delay: var(--wsp-hero-delay, 0ms);
  animation-fill-mode: both;
}
@media (prefers-reduced-motion: reduce) {
  .wsp-hero-anim { animation-name: wspHeroRevealReduced !important; animation-duration: 200ms !important; animation-delay: 0ms !important; }
}
[data-anim="off"] .wsp-hero-anim { animation-name: wspHeroRevealReduced !important; animation-duration: 200ms !important; animation-delay: 0ms !important; }

/* Tablet (Landscape + Portrait, 768–1279px) — single column, reading order
   restored (verdict before health), ring+status share one row, status
   pills wrap onto their own line as needed. Command Panel Pass — added the
   "domains" row (full width, below health/stats); gauge shrinks from its
   desktop size via an explicit width/height override (the SVG's viewBox
   scales proportionally, so this is a clean resize, not a crop). */
@media (min-width: 768px) {
  .wsp-hero {
    grid-template-columns: auto 1fr;
    grid-template-areas: "eyebrow eyebrow" "verdict verdict" "health stats" "domains domains" "pulse pulse" "details details";
    text-align: left;
    padding: 30px 30px 28px;
  }
  .wsp-hero__insight { margin: 0; }
  .wsp-hero__health {
    flex-direction: row; align-items: center; text-align: left;
    padding-top: 16px; padding-right: 28px;
  }
  .wsp-hero__gwrap svg { width: 128px; height: 128px; }
  .wsp-hero__healthmeta { align-items: flex-start; }
  /* Phase 7B — the hairline border-top/border-right between verdict and
     health/stats (a "box seam") is dropped in favor of whitespace alone,
     matching the rest of the page's de-boxed language. */
  .wsp-hero__stats { flex-wrap: wrap; overflow-x: visible; align-items: center; padding-top: 20px; padding-left: 28px; }
}

/* Desktop + Laptop (≥1280px) — Command Panel Pass (7G): headline + status
   pills occupy the left column; the readiness gauge spans BOTH the
   verdict and stats rows on the right, so it sits beside the whole left
   content block (headline+insight+pills together), matching the approved
   design's "gauge beside the control surface" composition — a real
   restructuring from the previous "stats own the right column" layout,
   not just a resize. Domain meters and Pulse stay full-width rows below,
   unchanged in spirit from before this pass. */
@media (min-width: 1280px) {
  .wsp-hero {
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    grid-template-areas: "eyebrow eyebrow" "verdict health" "stats health" "domains domains" "pulse pulse" "details details";
    column-gap: 48px;
    padding: 40px 44px 36px;
  }
  .wsp-hero__health {
    grid-area: health; flex-direction: column; align-items: center; text-align: center;
    justify-content: center; padding: 0; border-right: none;
  }
  .wsp-hero__healthmeta { align-items: center; }
  .wsp-hero__stats {
    flex-direction: row; flex-wrap: wrap; align-items: center; align-self: start; overflow-x: visible; padding-top: 4px;
  }
  .wsp-hero__stats-label { display: block; }
}

/* Score breakdown / explainability — secondary, behind a native disclosure.
   Same auto-placement fix as .wsp-pulse above — explicit grid-area, full
   width below everything else, at every breakpoint. */
.wsp-hero__details { grid-area: details; }
.wsp-hero__details summary { font-size: .78rem; font-weight: 700; color: var(--text-dim); cursor: pointer; list-style: none; width: fit-content; }
.wsp-hero__details summary::-webkit-details-marker { display: none; }
.wsp-hero__details summary::before { content: "▸"; display: inline-block; margin-right: 6px; color: var(--text-faint); transition: transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-hero__details[open] summary::before { transform: rotate(90deg); }
/* Phase 8 — this was the one remaining transform-based transition with no
   reduced-motion guard anywhere in the briefing; closes that gap. */
@media (prefers-reduced-motion: reduce) { .wsp-hero__details summary::before { transition: none; } }
[data-anim="off"] .wsp-hero__details summary::before { transition: none; }
.wsp-hero__details-body { padding-top: 14px; display: flex; flex-direction: column; gap: 4px; max-width: 420px; }
.wsp-hero__breakdown { display: flex; flex-direction: column; gap: 3px; }
.wsp-hero__bd-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: .74rem; }
.wsp-hero__bd-label { color: var(--text-faint); }
.wsp-hero__bd-weight { color: var(--text-ghost); }
.wsp-hero__bd-value { font-weight: 700; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.wsp-hero__explain { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-faint); }
.wsp-hero__explain-row { display: flex; align-items: baseline; gap: 6px; font-size: .78rem; color: var(--text-dim); text-align: left; }
.wsp-hero__explain-sign { font-weight: 800; width: 12px; flex: none; }
.wsp-hero__explain-row--good .wsp-hero__explain-sign { color: var(--wsp-good); }
.wsp-hero__explain-row--bad .wsp-hero__explain-sign { color: var(--wsp-danger); }

/* Executive Attention — v1.22.2 Objective 5: a quiet bulleted briefing list
   ("• 2 kendaraan membutuhkan perhatian."), whitespace-separated (no row
   divider) with a small round bullet instead of a colored bar. (Phase 7C
   Executive Consolidation removed the standalone exec-priority widget that
   originally shared this .wsp-sevlist shape; Attention is now its only
   consumer.) */
.wsp-sevlist { display: flex; flex-direction: column; gap: 18px; }
.wsp-sevrow { display: flex; align-items: flex-start; gap: 14px; }
.wsp-sevrow__bar { flex: none; width: 6px; height: 6px; border-radius: 50%; margin-top: 7px; background: var(--wsp-neutral); }
.wsp-sevrow--critical .wsp-sevrow__bar { background: var(--wsp-danger); }
.wsp-sevrow--warn .wsp-sevrow__bar { background: var(--wsp-warn); }
/* Phase 7D — a colored domain-icon badge (ui-kit.js rankedItem()) replaces
   the plain dot for the common case (every real row carries a domain):
   richer color, still restrained (a tinted badge, not a boxed alert). */
.wsp-sevrow__icon { flex: none; width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; }
.wsp-sevrow--critical .wsp-sevrow__icon { background: color-mix(in srgb, var(--wsp-danger) 14%, transparent); color: var(--wsp-danger); }
.wsp-sevrow--warn .wsp-sevrow__icon { background: color-mix(in srgb, var(--wsp-warn) 16%, transparent); color: var(--wsp-warn); }
.wsp-sevrow__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
/* v1.30.10.x — domain eyebrow (only rendered when the row carries i.domain,
   see ui-kit.js's rankedItem()); replaces the inline "Kritis"/"Perlu
   Perhatian" severity label for rows that opt in, since the colored bar
   dot already communicates severity. */
.wsp-sevrow__domain { font-size: .64rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); }
.wsp-sevrow__title { font-size: .92rem; font-weight: 700; color: var(--text); }
.wsp-sevrow__sev { font-size: .64rem; font-weight: 700; letter-spacing: .04em; color: var(--text-faint); margin-right: 8px; }
.wsp-sevrow--critical .wsp-sevrow__sev { color: var(--wsp-danger); }
.wsp-sevrow--warn .wsp-sevrow__sev { color: var(--wsp-warn); }
.wsp-sevrow__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }
.wsp-sevrow .wsp-btn { flex: none; align-self: center; }
@media (max-width: 600px) { .wsp-sevrow { flex-wrap: wrap; } .wsp-sevrow .wsp-btn { margin-left: 20px; } }

/* Phase 7C — per-row entrance cascade on first mount, reusing the exact
   fade-up/anFadeUp mechanism (platform.css) the same way .insight:nth-child
   already does elsewhere in this app — not a new keyframe. Suppressed on a
   live refresh by exec-attention's onMount (mirrors mountHeroMotion's
   already-mounted contract: same body node survives a refresh, only its
   innerHTML is rebuilt, so a bare CSS class would otherwise replay every
   Firebase update). */
.wsp-sevlist > .wsp-sevrow:nth-child(1) { animation-delay: .02s; }
.wsp-sevlist > .wsp-sevrow:nth-child(2) { animation-delay: .09s; }
.wsp-sevlist > .wsp-sevrow:nth-child(n+3) { animation-delay: .16s; }

/* Compact success state — a single quiet line, not a card, when there is
   nothing to brief on (Objective 6). */
.wsp-compact-ok { display: flex; align-items: center; gap: 10px; font-size: .88rem; color: var(--text-dim); padding: 6px 0; }
.wsp-compact-ok__dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--wsp-good); }

/* Attention Center — Phase 2 (Executive Attention). Severity summary (pulsing
   dot + area count) sits above the ranked findings (.wsp-sevlist, unchanged);
   .wsp-attn__more / __toggle add progressive disclosure for anything beyond
   ATTENTION_VISIBLE_CAP, same "reveal in place, never remove" shape already
   established for Today's Story's own disclosure. */
.wsp-attn { display: flex; flex-direction: column; gap: 16px; }
/* Command Panel Pass (7G) — a warm amber-tinted elevated panel, the same
   "genuinely distinct executive surface" tier Decision already has, given
   a different tone so the two read as different KINDS of object (urgency
   vs. action) rather than a matched pair. Gradient wash, real border +
   shadow-md (existing tokens) — never a flat box. */
.wsp-attn--panel {
  /* Phase 7G.1 — same --wsp-*-bg1/2 <color> registration pattern as
     .wsp-hero, for the same reason: a gradient's background-image can't
     transition on its own. */
  --wsp-attn-bg1: color-mix(in srgb, var(--wsp-warn) 7%, var(--surface));
  --wsp-attn-bg2: var(--surface);
  background: linear-gradient(160deg, var(--wsp-attn-bg1) 0%, var(--wsp-attn-bg2) 55%);
  border: 1px solid color-mix(in srgb, var(--wsp-warn) 20%, var(--border)); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: 26px 28px; }
.wsp-attn__summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wsp-attn__count { font-size: .8rem; font-weight: 600; color: var(--text-dim); }
.wsp-attn__dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.wsp-attn__dot--critical { background: var(--wsp-danger); }
.wsp-attn__dot--warn { background: var(--wsp-warn); }
/* Motion Language §04 "Attention pulse" — the platform's one sanctioned
   persistent motion; amplitude/period come from motion-profiles.js's
   per-mood MOTION_PROFILES (critical: 1600ms scale, warning: 2400ms low).
   Phase 8 (Motion Polish) reviewed this and deliberately left the timing
   function as the plain 'ease-in-out' keyword rather than switching it to
   EASE/EASE_URGENT: those are one-shot "settle" curves for a reveal that
   runs once and stops, and would look wrong on a symmetric infinite
   breathing loop that must accelerate away from AND back to the same
   resting state — 'ease-in-out' is the correct primitive for that, not an
   overlooked duplicate. */
.wsp-attn-pulse--low { animation-name: wspAttnPulseLow; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
.wsp-attn-pulse--scale { animation-name: wspAttnPulseScale; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
@keyframes wspAttnPulseLow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes wspAttnPulseScale { 0%, 100% { opacity: .6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.35); } }
@media (prefers-reduced-motion: reduce) { .wsp-attn-pulse--low, .wsp-attn-pulse--scale { animation: none; } }
[data-anim="off"] .wsp-attn-pulse--low, [data-anim="off"] .wsp-attn-pulse--scale { animation: none; }
.wsp-attn__more { max-height: 0; opacity: 0; overflow: hidden; transition: max-height ${MEASURED.duration}ms ${MEASURED.ease}, opacity ${MEASURED.opacityDuration}ms ${MEASURED.ease}; }
.wsp-attn__more--open { max-height: 2000px; opacity: 1; }
.wsp-attn__toggle { align-self: flex-start; font: inherit; font-size: .8rem; font-weight: 700; color: var(--accent);
  background: none; border: none; cursor: pointer; padding: 8px 2px; outline: 2px solid transparent; outline-offset: 2px;
  transition: outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-attn__toggle:hover { text-decoration: underline; }
.wsp-attn__toggle:focus-visible { outline-color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .wsp-attn__more { transition: none; } }
[data-anim="off"] .wsp-attn__more { transition: none; }

/* Recommended Actions — a call-to-action, not a flat list (v1.22.2
   Objective 6): whitespace-separated (no row divider), with a real size
   hierarchy — the first (highest-impact/priority) item is visibly bigger
   than the rest. Phase 3 (Executive Decision Center) established this
   explainable-action vocabulary jointly with the (now-removed, Phase 7C)
   exec-decision widget; exec-recommendation is its only consumer today. */
.wsp-inbox { display: flex; flex-direction: column; gap: 20px; }
/* Phase 7D — the Decision surface is a considered exception to de-boxing
   (a card wall for meaningful objects, not for everything): a soft
   accent-tinted wash + hairline border, not a heavy shadowed card.
   Command Panel Pass — deepened into a gradient wash + shadow-md (was a
   flat 5% tint + no shadow) to match Attention's own panel weight, so the
   two sit at the same visual tier while staying distinguishable by hue
   (oxblood here vs. amber for Attention). */
.wsp-inbox--tinted {
  /* Phase 7G.1 — same --wsp-*-bg1/2 <color> registration pattern as
     .wsp-hero/.wsp-attn--panel. */
  --wsp-inbox-bg1: color-mix(in srgb, var(--accent) 7%, var(--surface));
  --wsp-inbox-bg2: var(--surface);
  background: linear-gradient(160deg, var(--wsp-inbox-bg1) 0%, var(--wsp-inbox-bg2) 55%);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border)); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md); padding: 26px 28px; }
.wsp-inbox__item { display: flex; flex-direction: column; gap: 5px; }
.wsp-inbox__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wsp-inbox__impact { font-size: .72rem; color: var(--text-faint); text-align: right; }
.wsp-inbox__title { font-size: .9rem; font-weight: 700; color: var(--text); }
.wsp-inbox__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }
.wsp-inbox__item .wsp-btn { align-self: flex-start; margin-top: 2px; }
/* v1.30.9.14 — Accept/Dismiss pair (mockup parity); .wsp-inbox__item .wsp-btn
   above still applies to buttons inside this wrapper (descendant selector),
   the wrapper only adds the side-by-side layout. */
.wsp-inbox__row-actions { display: flex; gap: 8px; margin-top: 2px; }
.wsp-inbox__row-actions .wsp-btn { margin-top: 0; }
.wsp-inbox__item--primary .wsp-inbox__title { font-size: 1.15rem; letter-spacing: -0.01em; }
.wsp-inbox__item--primary .wsp-inbox__reason { font-size: .86rem; }
.wsp-inbox__item--secondary .wsp-inbox__title { font-size: .84rem; }
.wsp-inbox__item--secondary .wsp-inbox__reason { font-size: .76rem; }

/* Premium Pass (Section 6) — Decisions' calm empty state. Deliberately NOT
   wrapped in .wsp-inbox--tinted (that accent wash means "a decision is
   waiting"; this state means the opposite) — a quiet neutral surface with
   an icon instead of a wall of white space. */
.wsp-inbox__calm { display: flex; align-items: flex-start; gap: 14px; padding: 22px 4px; }
.wsp-inbox__calm-icon { flex: none; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.wsp-inbox__calm-icon--good { background: color-mix(in srgb, var(--wsp-good) 12%, transparent); color: var(--wsp-good); }
.wsp-inbox__calm-icon--neutral { background: color-mix(in srgb, var(--wsp-neutral) 12%, transparent); color: var(--text-dim); }
.wsp-inbox__calm-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding-top: 2px; }
.wsp-inbox__calm-title { font-size: .92rem; font-weight: 700; color: var(--text); }
.wsp-inbox__calm-sub { font-size: .82rem; color: var(--text-dim); line-height: 1.45; }
.wsp-inbox__calm .wsp-btn--link { align-self: center; flex: none; padding: 4px 0; }

/* Phase 7C — same per-item entrance cascade as Attention's .wsp-sevrow,
   same fade-up mechanism, same reasoning (suppressed on refresh by
   exec-recommendation's onMount). */
.wsp-inbox > .wsp-inbox__item:nth-child(1) { animation-delay: .04s; }
.wsp-inbox > .wsp-inbox__item:nth-child(2) { animation-delay: .12s; }
.wsp-inbox > .wsp-inbox__item:nth-child(n+3) { animation-delay: .2s; }

/* Recommended Actions explainability (Phase 3, exec-recommendation only) —
   Reason and Impact as two distinct labeled lines (not merged into one
   sentence like the pre-Phase-3 card), so both are independently readable
   within the "under 10 seconds" contract. */
.wsp-inbox__explain { display: flex; flex-direction: column; gap: 4px; }
.wsp-inbox__explain-row { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }
.wsp-inbox__explain-label { font-size: .64rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); margin-right: 7px; }
.wsp-inbox__item--secondary .wsp-inbox__explain-row { font-size: .76rem; }

/* Recommended Actions disclosure (Phase 3) — anything beyond
   RECOMMENDATION_VISIBLE_CAP reveals in place, same "never remove/recreate,
   only reveal" continuity rule and the same EASE/timing already established
   for the Attention Center's own disclosure (.wsp-attn__more), kept as a
   dedicated rule set rather than reused directly since Attention is
   out of scope for this phase. */
.wsp-reco__more { display: flex; flex-direction: column; gap: 20px;
  max-height: 0; opacity: 0; overflow: hidden; transition: max-height ${MEASURED.duration}ms ${MEASURED.ease}, opacity ${MEASURED.opacityDuration}ms ${MEASURED.ease}; }
.wsp-reco__more--open { max-height: 3000px; opacity: 1; }
.wsp-reco__toggle { align-self: flex-start; font: inherit; font-size: .8rem; font-weight: 700; color: var(--accent);
  background: none; border: none; cursor: pointer; padding: 8px 2px; outline: 2px solid transparent; outline-offset: 2px;
  transition: outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-reco__toggle:hover { text-decoration: underline; }
.wsp-reco__toggle:focus-visible { outline-color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .wsp-reco__more { transition: none; } }
[data-anim="off"] .wsp-reco__more { transition: none; }

/* Operational Snapshot — v1.22.1: hairline tiles, no shadow (Objective 3);
   bigger numerals / smaller uppercase labels (Objective 2). */
.wsp-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
.wsp-summary { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 14px 16px; background: var(--surface);
  border: 1px solid var(--border-faint); border-radius: var(--radius-sm); box-shadow: none; cursor: pointer; font: inherit; color: inherit;
  outline: 2px solid transparent; outline-offset: 2px;
  transition: border-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-summary:hover { border-color: var(--border-strong); }
.wsp-summary:focus-visible { outline-color: var(--accent); }
.wsp-summary__title { font-size: .68rem; color: var(--text-faint); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.wsp-summary__value { font-family: var(--font-display); font-size: 2.1rem; font-weight: 800; color: var(--text); letter-spacing: -0.02em; line-height: 1.05; font-variant-numeric: tabular-nums; }
.wsp-summary__status { font-size: .7rem; font-weight: 700; width: fit-content; padding: 2px 8px; border-radius: 999px; background: var(--border-faint); color: var(--text-dim); }
.wsp-summary__status--good { background: color-mix(in srgb, var(--wsp-good) 14%, transparent); color: var(--wsp-good); }
.wsp-summary__status--warn { background: color-mix(in srgb, var(--wsp-warn) 16%, transparent); color: var(--wsp-warn); }
.wsp-summary__status--danger { background: color-mix(in srgb, var(--wsp-danger) 14%, transparent); color: var(--wsp-danger); }
.wsp-summary--static { cursor: default; }
.wsp-summary--static:hover { border-color: var(--border-faint); }

/* Operational Snapshot — Phase 4: Segmented period control (Hari/Minggu/
   Bulan) + one active summary-card panel, replacing the old always-all-
   three-visible period stack (v1.21.0). Visual spec matches the approved
   Design Review's Segmented primitive exactly (pill track, boxed active
   pill). Panels share one grid cell so switching crossfades in place
   instead of recreating the section (Motion Language) — every period
   renders the identical 5-tile grid shape, so there is no layout shift to
   animate around; only opacity moves (GPU-friendly). */
.wsp-segmented { display: inline-flex; gap: 3px; padding: 4px; background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 13px; align-self: flex-start; }
.wsp-segmented__btn { appearance: none; border: none; background: transparent; color: var(--text-dim); cursor: pointer; font: inherit;
  font-weight: 600; font-size: .82rem; padding: 7px 15px; border-radius: 9px; white-space: nowrap;
  outline: 2px solid transparent; outline-offset: 2px;
  transition: color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, background-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, box-shadow ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-segmented__btn:hover { color: var(--text); }
.wsp-segmented__btn:focus-visible { outline-color: var(--accent); }
.wsp-segmented__btn--active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
.wsp-snapshot__panels { display: grid; }
.wsp-snapshot__panel { grid-area: 1 / 1; transition: opacity 180ms ${EASE}; }
.wsp-snapshot__panel[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) { .wsp-snapshot__panel { transition: none; } }
[data-anim="off"] .wsp-snapshot__panel { transition: none; }
.wsp-summary__desc { font-size: .72rem; color: var(--text-faint); line-height: 1.35; }
.wsp-snapshot-period__label { font-size: .68rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); margin: 0 0 8px; }
/* Executive Insight — v1.22.2 Objective 8: exactly ONE Apple-Health-style
   sentence, not a bulleted list. */
.wsp-insight { margin: 0; font-size: 1rem; font-weight: 500; color: var(--text-dim); line-height: 1.4; }

/* Outlook horizon line — Phase 7D. A "today -> tomorrow" wayfinding strip,
   not a chart: the fill and marker positions are fixed layout (see index.js
   comment), so nothing here encodes a metric value. */
.wsp-horizon { position: relative; height: 4px; border-radius: 2px; background: var(--border-faint); margin: 2px 0 8px; }
.wsp-horizon__fill { position: absolute; inset: 0; border-radius: 2px; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 25%, transparent)); }
.wsp-horizon__marker { position: absolute; top: 50%; width: 10px; height: 10px; border-radius: 50%; background: var(--surface);
  border: 2px solid var(--wsp-neutral); transform: translate(-50%, -50%); }
.wsp-horizon__marker--now { border-color: var(--accent); }
/* Visual Expansion Pass (Section 11) — one marker per real scheduled trip
   for tomorrow (was a single fixed decorative dot). Smaller and info-toned
   (matching the "Trip Terjadwal Besok" tile's own tone) so it reads as a
   secondary, plural signal beside the one "now" reference point.
   Premium Visual Experience Pass — a real <button> now (was a <div>), so
   it's keyboard-focusable; padding/appearance reset before the visual
   ring above applies, same pattern as .wsp-pulse__dot. */
.wsp-horizon__marker--trip { width: 7px; height: 7px; border-color: var(--wsp-info); background: var(--wsp-info);
  padding: 0; appearance: none; -webkit-appearance: none; cursor: pointer; }
.wsp-horizon__marker--trip:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* Hover/focus tooltip (wireHorizonTooltip, index.js) — same shared-element,
   show-on-hover-or-focus pattern as .wsp-pulse__tooltip. */
/* Command Panel Pass (7G) — same --wsp-tooltip-shift viewport clamp as
   .wsp-pulse__tooltip (clampTooltipToViewport, index.js). */
.wsp-horizon__tooltip {
  position: absolute; bottom: 100%; margin-bottom: 10px; transform: translateX(calc(-50% + var(--wsp-tooltip-shift, 0px))) translateY(4px);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-sm);
  padding: 7px 10px; font-size: .74rem; font-weight: 600; color: var(--text); white-space: nowrap;
  opacity: 0; pointer-events: none; z-index: 5;
  transition: opacity ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease};
}
.wsp-horizon__tooltip--visible { opacity: 1; transform: translateX(calc(-50% + var(--wsp-tooltip-shift, 0px))) translateY(0); }
@media (prefers-reduced-motion: reduce) { .wsp-horizon__tooltip { transition: none; } }
[data-anim="off"] .wsp-horizon__tooltip { transition: none; }
.wsp-horizon__labels { display: flex; justify-content: space-between; font-size: .68rem; font-weight: 700; color: var(--text-faint); margin: 0 0 14px; }

/* Operational Story — v1.22.3 Executive Presence: a highlight reel, not an
   audit log. Apple-Reminders-style hierarchy: time small/quiet, the sentence
   is the heaviest text in the row, a light secondary meta line only when it
   adds information. Icon carries the category; its background tint carries
   the accent color (Objective 6/7/8). */
.wsp-feed { display: flex; flex-direction: column; }
.wsp-feed__list, .wsp-feed__more, .wsp-feed__sublist { list-style: none; margin: 0; padding: 0; }
.wsp-feed__row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; }
.wsp-feed__icon { flex: none; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: var(--wsp-neutral); background: color-mix(in srgb, var(--wsp-neutral) 14%, transparent); margin-top: 1px; position: relative; }
/* Phase 7C — a quiet vertical rail connecting consecutive entries, so the
   feed reads as one continuous stream rather than isolated rows (applies
   uniformly to both plain rows and narrative-group headers, since both
   share this same .wsp-feed__icon marker). */
.wsp-feed__list > li:not(:last-child) .wsp-feed__icon::after,
.wsp-feed__more > li:not(:last-child) .wsp-feed__icon::after {
  content: ''; position: absolute; left: 50%; top: 100%; width: 1px; height: 20px;
  background: var(--border); transform: translateX(-.5px);
}
.wsp-feed__icon--good { color: var(--wsp-good); background: color-mix(in srgb, var(--wsp-good) 14%, transparent); }
.wsp-feed__icon--warn { color: var(--wsp-warn); background: color-mix(in srgb, var(--wsp-warn) 16%, transparent); }
.wsp-feed__icon--danger { color: var(--wsp-danger); background: color-mix(in srgb, var(--wsp-danger) 14%, transparent); }
.wsp-feed__icon--info { color: var(--wsp-info); background: color-mix(in srgb, var(--wsp-info) 14%, transparent); }
.wsp-feed__icon--neutral { color: var(--text-faint); background: var(--border-faint); }
.wsp-feed__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.wsp-feed__sentence { font-size: .92rem; font-weight: 600; color: var(--text); line-height: 1.4; }
.wsp-feed__meta { font-size: .74rem; font-weight: 400; color: var(--text-faint); }
.wsp-feed__time { flex: none; font-size: .72rem; font-weight: 500; color: var(--text-faint); font-variant-numeric: tabular-nums; margin-top: 3px; }

/* Phase 5 — Narrative group ("small story" for a run of 2+ distinct actions
   in the same operational context). Same row grammar as .wsp-feed__row
   (icon + label + time) for the header; sub-rows drop the icon (already
   carried once by the header) and read one size down — visual hierarchy is
   "section header -> narrative group -> chronological flow" per the Design
   Review, not a flat list of equally-weighted rows. */
.wsp-feed__block { padding: 10px 0; }
.wsp-feed__block-head { display: flex; align-items: center; gap: 12px; }
.wsp-feed__block-label { flex: 1; min-width: 0; font-size: .92rem; font-weight: 700; color: var(--text); }
.wsp-feed__sublist { margin-top: 6px; padding-left: 38px; display: flex; flex-direction: column; gap: 5px; }
.wsp-feed__subrow { display: flex; align-items: baseline; gap: 10px; }
.wsp-feed__subrow-sentence { flex: 1; min-width: 0; font-size: .84rem; font-weight: 500; color: var(--text-dim); line-height: 1.4; }
.wsp-feed__subrow-time { flex: none; font-size: .7rem; font-weight: 500; color: var(--text-faint); font-variant-numeric: tabular-nums; }

/* Expand/Collapse (Objectives 3/10) — CSS-only smooth reveal; a generous
   fixed max-height is enough for a "motion ringan" feel without measuring
   real content height in JS. Phase 8 (Motion Polish) — was independently
   hand-rolled at 350ms/250ms with the plain 'ease' keyword; now shares
   MEASURED with Attention's and Recommendation's own disclosure, so all
   three progressive-disclosure controls in the briefing move identically. */
.wsp-feed__more { max-height: 0; opacity: 0; overflow: hidden; transition: max-height ${MEASURED.duration}ms ${MEASURED.ease}, opacity ${MEASURED.opacityDuration}ms ${MEASURED.ease}; }
.wsp-feed__more--open { max-height: 2000px; opacity: 1; }
.wsp-feed__toggle { margin-top: 8px; font: inherit; font-size: .8rem; font-weight: 700; color: var(--accent);
  background: none; border: 0; padding: 0; cursor: pointer; outline: 2px solid transparent; outline-offset: 2px;
  transition: outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-feed__toggle:hover { text-decoration: underline; }
.wsp-feed__toggle:focus-visible { outline-color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .wsp-feed__more { transition: none; } }
/* Phase 8 — this guard was missing; Story's disclosure previously respected
   only the OS-level reduced-motion preference, not the app's own manual
   data-anim="off" switch (Attention's/Recommendation's disclosure already
   had both). */
[data-anim="off"] .wsp-feed__more { transition: none; }

/* Executive Launcher chips (mobile: horizontal scroll) */
.wsp-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.wsp-chip { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: .82rem; font-weight: 600; white-space: nowrap;
  padding: 9px 15px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer;
  outline: 2px solid transparent; outline-offset: 2px;
  transition: border-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, background-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-chip:hover { border-color: var(--border-strong); background: var(--border-faint); }
.wsp-chip:focus-visible { outline-color: var(--accent); }
.wsp-chip__icon { display: inline-flex; }

/* v1.30.10.6 — Executive Launcher destination grid: replaces .wsp-chips for
   exec-quick specifically (that rule stays above, untouched, as a shared
   primitive other callers may still use). Icon-over-label tiles, no border/
   fill at rest — the reference spec explicitly names "a giant pill
   collection" as the anti-pattern this avoids; only a quiet background tint
   on hover/focus marks each tile as interactive. */
/* Phase 7B — capped to a max-width so 10 tiles read as one considered,
   grouped block (left-aligned) instead of spreading edge-to-edge across the
   full page width, which read as a toolbar rather than a "go deeper"
   surface. */
.wsp-launcher { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 4px; max-width: 640px; }
.wsp-launcher__item { display: flex; flex-direction: column; align-items: center; gap: 8px; font: inherit; text-align: center;
  padding: 14px 8px 12px; border: none; border-radius: var(--radius-sm); background: none; color: var(--text); cursor: pointer;
  outline: 2px solid transparent; outline-offset: -2px;
  transition: background-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, outline-color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-launcher__item:hover { background: var(--border-faint); }
/* Phase 7C — "an application switcher, not a footer icon list": the icon
   itself lifts on hover/focus (not the whole tile) and the label picks up
   full text color, echoed by :active settling back with a brief scale —
   one interaction language, applied here and to every de-boxed clickable
   row via the shared .wsp-tactile rules below. */
.wsp-launcher__item:hover .wsp-launcher__icon, .wsp-launcher__item:focus-visible .wsp-launcher__icon { transform: translateY(-2px); color: var(--accent); }
.wsp-launcher__item:hover .wsp-launcher__label, .wsp-launcher__item:focus-visible .wsp-launcher__label { color: var(--text); }
.wsp-launcher__item:active { transform: scale(.99); }
.wsp-launcher__item:focus-visible { outline-color: var(--accent); }
.wsp-launcher__icon { display: inline-flex; color: var(--text-dim); transition: transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}, color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }
.wsp-launcher__label { font-size: .78rem; font-weight: 600; color: var(--text-dim); line-height: 1.25; transition: color ${RESPONSIVE.duration}ms ${RESPONSIVE.ease}; }

/* Phase 7D — "app switcher" grouping + tinted icon badges (Operasional /
   Intelijen), reversing Phase 7B's flat icon-only treatment: a persistent
   color badge per group, not just a hover state, so the Launcher reads as
   a grid of distinct apps rather than a monochrome icon row. */
.wsp-launcher-group { display: flex; flex-direction: column; gap: 12px; }
.wsp-launcher-group__label { font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }
.wsp-launcher__icon--op, .wsp-launcher__icon--intel {
  width: 34px; height: 34px; border-radius: 10px; align-items: center; justify-content: center;
  transition: transform ${RESPONSIVE.duration}ms ${RESPONSIVE.ease};
}
.wsp-launcher__icon--op { background: color-mix(in srgb, var(--wsp-info) 12%, transparent); color: var(--wsp-info); }
.wsp-launcher__icon--intel { background: color-mix(in srgb, var(--wsp-intel) 12%, transparent); color: var(--wsp-intel); }
.wsp-launcher__item:hover .wsp-launcher__icon--op, .wsp-launcher__item:hover .wsp-launcher__icon--intel { color: inherit; }
@media (prefers-reduced-motion: reduce) {
  .wsp-launcher__icon, .wsp-launcher__item { transition: none; }
  .wsp-launcher__item:hover .wsp-launcher__icon { transform: none; }
  .wsp-launcher__item:active { transform: none; }
}
[data-anim="off"] .wsp-launcher__icon, [data-anim="off"] .wsp-launcher__item { transition: none; }
[data-anim="off"] .wsp-launcher__item:hover .wsp-launcher__icon { transform: none; }
[data-anim="off"] .wsp-launcher__item:active { transform: none; }

/* ════════ v1.22.2 Objectives 10/11 — Adaptive Layout (non-Hero) ════════
   Hero's own responsive tiers (mobile/tablet/desktop) now live entirely
   with the rest of the Hero CSS, above (Phase 1) — the Hero is one grid
   whose grid-template-areas is reassigned per breakpoint there, not
   handled by these page-level rules. What remains here is the PAGE'S own
   adaptive layout (the .wsp-grid card grid for every other section). */

/* Tablet (≤1024px) — still 2 columns, medium density. */
@media (max-width: 1024px) {
  .wsp-root { padding: 4px 0 32px; gap: 36px; }
}

/* Mobile (≤600px) — single column. Hero-specific rules now live with the
   rest of the Hero's own responsive tiers, above (Phase 1); this block is
   unrelated non-Hero sections only (untouched this phase). */
@media (max-width: 600px) {
  .wsp-root { gap: 32px; }
  .wsp-grid { grid-template-columns: 1fr; }
  .wsp-card--span2 { grid-column: span 1; }
  .wsp-chips { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .wsp-chips::-webkit-scrollbar { display: none; }
  .wsp-chip { flex: 0 0 auto; }
  /* v1.30.10.6 — a fixed 3-column grid reads calmer than auto-fill at this
     width and needs no horizontal scroll, unlike the old chip row. */
  .wsp-launcher { grid-template-columns: repeat(3, 1fr); }
}

/* Phase 11J — defensive pass: no reproducible overflow/clip bug was found in
   this grid (min-width:0 + collapse-to-1-column already make it safe), but
   no breakpoint below 600px existed to trim gutters on the narrowest real
   phones (320-375px). Mirrors the same tightening already proven for
   Analytics' .hm-stats (platform.css, @media max-width:380px). */
@media (max-width: 380px) {
  .wsp-grid { gap: 12px; }
  .wsp-card { padding: 16px 14px 14px; }
}

/* ════════ Apple-style staggered reveal — Macro Motion ════════
   fade-up/anFadeUp is unchanged (still global in platform.css, still
   reduced-motion-safe); this cascades each of the six Executive Briefing
   sections in its own named beat instead of all at once. Phase 8 (Motion
   Polish) replaces the previous generic, identity-blind
   .wsp-grid > *:nth-child position rule with MACRO_STAGGER's own
   per-section values (motion-profiles.js) — the actual source of truth
   this page always claimed to follow but never imported. One rule per
   section, in briefing order, so the delay travels with the SECTION, not
   with whatever position it happens to render in. */
.wsp-grid > [data-widget-id="exec-hero"] { animation-delay: ${MACRO_STAGGER.hero}ms; }
.wsp-grid > [data-widget-id="exec-attention"] { animation-delay: ${MACRO_STAGGER.attention}ms; }
.wsp-grid > [data-widget-id="exec-recommendation"] { animation-delay: ${MACRO_STAGGER.recommendation}ms; }
.wsp-grid > [data-widget-id="exec-snapshot"] { animation-delay: ${MACRO_STAGGER.snapshot}ms; }
.wsp-grid > [data-widget-id="exec-activity"] { animation-delay: ${MACRO_STAGGER.story}ms; }
/* v1.30.10.6 — these two were previously missing from this block entirely
   (see MACRO_STAGGER's own comment), so they faded in with zero delay
   instead of their place in the briefing sequence. */
.wsp-grid > [data-widget-id="exec-drivers"] { animation-delay: ${MACRO_STAGGER.drivers}ms; }
.wsp-grid > [data-widget-id="exec-vehicle-flags"] { animation-delay: ${MACRO_STAGGER.vehicleFlags}ms; }
.wsp-grid > [data-widget-id="exec-outlook"] { animation-delay: ${MACRO_STAGGER.outlook}ms; }
.wsp-grid > [data-widget-id="exec-quick"] { animation-delay: ${MACRO_STAGGER.launcher}ms; }

/* Zone header fade — reuses the exact same fade-up class + keyframe every
   widget card already carries (only animation-delay is ever overridden per
   selector, same convention as the widget rules just above) so a zone's
   eyebrow/heading appears in step with the FIRST widget inside it, instead
   of popping in ahead of its own content. */
.wsp-zone[data-zone-id="now"] .wsp-zone__head { animation-delay: ${MACRO_STAGGER.attention}ms; }
.wsp-zone[data-zone-id="decisions"] .wsp-zone__head { animation-delay: ${MACRO_STAGGER.recommendation}ms; }
.wsp-zone[data-zone-id="situation"] .wsp-zone__head { animation-delay: ${MACRO_STAGGER.snapshot}ms; }
.wsp-zone[data-zone-id="outlook"] .wsp-zone__head { animation-delay: ${MACRO_STAGGER.outlook}ms; }
`;
