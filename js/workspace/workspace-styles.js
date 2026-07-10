/* ============================================================
   WORKSPACE-STYLES.JS — v1.19.9 Executive Command Center

   Injects the scoped `.wsp-*` stylesheet ONCE. Every rule lives under
   `.wsp-root`, which is nested inside the Home host's `exec-ui
   v2-analytics-claude` scope — so ALL colors resolve from the existing
   Executive design tokens (light + dark) and dark mode is automatic. No
   :root mutation, no hardcoded colors, no new design language.
   ============================================================ */

'use strict';

// Phase 2 (Executive Attention) — reuse the ONE motion constant (Motion
// Language's "Measured" rhythm curve) rather than re-deriving the bezier
// here; keeps the disclosure transition on the same easing vocabulary as
// the rest of the Executive motion system (motion-profiles.js).
import { EASE } from '../widgets/executive/motion-profiles.js';

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
.wsp-root { --wsp-good: var(--c-green); --wsp-warn: var(--c-amber); --wsp-danger: var(--crit); --wsp-info: var(--c-blue); --wsp-neutral: var(--c-neutral);
  display: flex; flex-direction: column; gap: 44px; padding: 4px 2px 40px; }

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
.wsp-row--click { cursor: pointer; border-radius: 8px; transition: background-color .12s ease; }
.wsp-row--click:hover { background: var(--border-faint); }
.wsp-row--click:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wsp-row__dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--wsp-neutral); }
.wsp-row__dot--good { background: var(--wsp-good); } .wsp-row__dot--warn { background: var(--wsp-warn); }
.wsp-row__dot--danger { background: var(--wsp-danger); } .wsp-row__dot--info { background: var(--wsp-info); }
.wsp-row__main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.wsp-row__title { font-size: .86rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wsp-row__meta { font-size: .74rem; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wsp-row__trailing { font-size: .74rem; font-weight: 600; color: var(--text-dim); flex: none; }

/* Buttons / actions */
.wsp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.wsp-btn { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; font-weight: 600; font-family: inherit;
  padding: 8px 13px; border-radius: var(--radius-sm); cursor: pointer; transition: background-color .12s ease, border-color .12s ease; border: 1px solid var(--border); }
.wsp-btn--ghost { background: var(--surface); color: var(--text); }
.wsp-btn--ghost:hover { background: var(--border-faint); border-color: var(--border-strong); }
.wsp-btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.wsp-btn--primary:hover { filter: brightness(1.05); }
.wsp-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
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
.wsp-hero {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas: "eyebrow" "health" "verdict" "stats" "details";
  gap: 28px;
  padding: 6px 2px 4px;
  text-align: center;
}
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
.wsp-hero__gwrap { position: relative; flex: none; display: flex; }
.wsp-hero__scorewrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.wsp-hero__scoreval { font-family: var(--font-display); font-weight: 800; font-size: 2.6rem; line-height: 1; letter-spacing: -0.03em; color: var(--text); font-variant-numeric: tabular-nums; }
.wsp-hero__scoreval--muted { color: var(--text-ghost); }
.wsp-hero__scoreunit { font-size: .68rem; color: var(--text-faint); font-weight: 600; }
.wsp-hero__healthmeta { display: flex; flex-direction: column; gap: 7px; align-items: center; }
.wsp-hero__panel-label { font-size: .7rem; font-weight: 600; color: var(--text-faint); }

/* Operational Pulse — communicates NOW (not Snapshot's Today/Week/Month).
   Mobile: a horizontal swipe shelf of boxed tiles, per the approved mobile
   board. tabindex+role make the shelf itself keyboard-scrollable, since its
   children are plain text (not focusable) — addresses the accessibility
   concern a purely visual swipe shelf would otherwise raise. */
.wsp-hero__stats { grid-area: stats; display: flex; gap: 12px; overflow-x: auto; padding: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.wsp-hero__stats::-webkit-scrollbar { display: none; }
.wsp-hero__stat {
  flex: 0 0 132px; min-width: 0; display: flex; flex-direction: column; gap: 6px; text-align: left;
  padding: var(--pad); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm);
}
.wsp-hero__stat-lbl { font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); }
.wsp-hero__stat-big { font-family: var(--font-display); font-weight: 700; font-size: 1.3rem; letter-spacing: -0.015em; color: var(--text-dim); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
/* Panel label — only meaningful once the stats become their own boxed
   panel (desktop); orphaned/redundant on mobile+tablet, so hidden there. */
.wsp-hero__stats-label { display: none; font-size: .7rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); }

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
   restored (verdict before health), ring+status and the Operational Pulse
   trio share one divided row — matches the approved Tablet Landscape board;
   Tablet Portrait inherits the same rules (no separate board was approved
   for portrait — see Phase 1 deliverables). */
@media (min-width: 768px) {
  .wsp-hero {
    grid-template-columns: auto 1fr;
    grid-template-areas: "eyebrow eyebrow" "verdict verdict" "health stats";
    text-align: left;
  }
  .wsp-hero__insight { margin: 0; }
  .wsp-hero__health {
    flex-direction: row; align-items: center; text-align: left;
    padding-top: 28px; padding-right: 28px; border-top: 1px solid var(--border-faint); border-right: 1px solid var(--border-faint);
  }
  .wsp-hero__healthmeta { align-items: flex-start; }
  .wsp-hero__stats { flex-wrap: wrap; overflow-x: visible; align-items: center; padding-top: 28px; padding-left: 28px; border-top: 1px solid var(--border-faint); }
  .wsp-hero__stat { flex: 1 1 110px; padding: 0; background: none; border: none; box-shadow: none; }
}

/* Desktop + Laptop (≥1280px) — two-column: text+ring ~64% left, a boxed
   "Denyut Operasional" panel ~36% right (spanning the verdict+health rows)
   — matches the approved Desktop board exactly, including the one
   deliberate exception to the platform's general de-boxed philosophy at
   this specific spot. */
@media (min-width: 1280px) {
  .wsp-hero {
    grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr);
    grid-template-areas: "eyebrow eyebrow" "verdict stats" "health stats";
    column-gap: 40px;
  }
  .wsp-hero__health { border-right: none; padding-right: 0; }
  .wsp-hero__stats {
    flex-direction: column; align-items: stretch; align-self: start; gap: 22px; overflow-x: visible; padding: var(--pad);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius);
  }
  .wsp-hero__stat { flex: none; padding: 0; background: none; border: none; box-shadow: none; }
  .wsp-hero__stats-label { display: block; }
}

/* Score breakdown / explainability — secondary, behind a native disclosure */
.wsp-hero__details { margin-top: 28px; }
.wsp-hero__details summary { font-size: .78rem; font-weight: 700; color: var(--text-dim); cursor: pointer; list-style: none; width: fit-content; }
.wsp-hero__details summary::-webkit-details-marker { display: none; }
.wsp-hero__details summary::before { content: "▸"; display: inline-block; margin-right: 6px; color: var(--text-faint); transition: transform .15s ease; }
.wsp-hero__details[open] summary::before { transform: rotate(90deg); }
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

/* Operational Priority / Attention — v1.22.2 Objective 5: a quiet bulleted
   briefing list ("• 2 kendaraan membutuhkan perhatian."), whitespace-separated
   (no row divider) with a small round bullet instead of a colored bar. */
.wsp-sevlist { display: flex; flex-direction: column; gap: 18px; }
.wsp-sevrow { display: flex; align-items: flex-start; gap: 14px; }
.wsp-sevrow__bar { flex: none; width: 6px; height: 6px; border-radius: 50%; margin-top: 7px; background: var(--wsp-neutral); }
.wsp-sevrow--critical .wsp-sevrow__bar { background: var(--wsp-danger); }
.wsp-sevrow--warn .wsp-sevrow__bar { background: var(--wsp-warn); }
.wsp-sevrow__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.wsp-sevrow__title { font-size: .92rem; font-weight: 700; color: var(--text); }
.wsp-sevrow__sev { font-size: .64rem; font-weight: 700; letter-spacing: .04em; color: var(--text-faint); margin-right: 8px; }
.wsp-sevrow--critical .wsp-sevrow__sev { color: var(--wsp-danger); }
.wsp-sevrow--warn .wsp-sevrow__sev { color: var(--wsp-warn); }
.wsp-sevrow__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }
.wsp-sevrow .wsp-btn { flex: none; align-self: center; }
@media (max-width: 600px) { .wsp-sevrow { flex-wrap: wrap; } .wsp-sevrow .wsp-btn { margin-left: 20px; } }

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
.wsp-attn__summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wsp-attn__count { font-size: .8rem; font-weight: 600; color: var(--text-dim); }
.wsp-attn__dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.wsp-attn__dot--critical { background: var(--wsp-danger); }
.wsp-attn__dot--warn { background: var(--wsp-warn); }
/* Motion Language §04 "Attention pulse" — the platform's one sanctioned
   persistent motion; amplitude/period come from motion-profiles.js's
   per-mood MOTION_PROFILES (critical: 1600ms scale, warning: 2400ms low). */
.wsp-attn-pulse--low { animation-name: wspAttnPulseLow; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
.wsp-attn-pulse--scale { animation-name: wspAttnPulseScale; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
@keyframes wspAttnPulseLow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes wspAttnPulseScale { 0%, 100% { opacity: .6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.35); } }
@media (prefers-reduced-motion: reduce) { .wsp-attn-pulse--low, .wsp-attn-pulse--scale { animation: none; } }
[data-anim="off"] .wsp-attn-pulse--low, [data-anim="off"] .wsp-attn-pulse--scale { animation: none; }
.wsp-attn__more { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 340ms ${EASE}, opacity 240ms ${EASE}; }
.wsp-attn__more--open { max-height: 2000px; opacity: 1; }
.wsp-attn__toggle { align-self: flex-start; font: inherit; font-size: .8rem; font-weight: 700; color: var(--accent);
  background: none; border: none; cursor: pointer; padding: 8px 2px; }
.wsp-attn__toggle:hover { text-decoration: underline; }
.wsp-attn__toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .wsp-attn__more { transition: none; } }
[data-anim="off"] .wsp-attn__more { transition: none; }

/* Decision Center — a call-to-action, not a flat list (v1.22.2 Objective 6):
   whitespace-separated (no row divider), with a real size hierarchy — the
   first (highest-impact/priority) item is visibly bigger than the rest.
   Phase 3 (Executive Decision Center) — this is now the ONE explainable-
   action vocabulary shared by exec-decision AND exec-recommendation (the
   Recommendation section, redesigned per the approved Design Review to
   communicate "Recommended Actions" the same way) — no second card
   language was introduced for the latter. */
.wsp-inbox { display: flex; flex-direction: column; gap: 20px; }
.wsp-inbox__item { display: flex; flex-direction: column; gap: 5px; }
.wsp-inbox__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wsp-inbox__impact { font-size: .72rem; color: var(--text-faint); text-align: right; }
.wsp-inbox__title { font-size: .9rem; font-weight: 700; color: var(--text); }
.wsp-inbox__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }
.wsp-inbox__item .wsp-btn { align-self: flex-start; margin-top: 2px; }
.wsp-inbox__item--primary .wsp-inbox__title { font-size: 1.15rem; letter-spacing: -0.01em; }
.wsp-inbox__item--primary .wsp-inbox__reason { font-size: .86rem; }
.wsp-inbox__item--secondary .wsp-inbox__title { font-size: .84rem; }
.wsp-inbox__item--secondary .wsp-inbox__reason { font-size: .76rem; }

/* Recommended Actions explainability (Phase 3, exec-recommendation only) —
   Reason and Impact as two distinct labeled lines (not merged into one
   sentence like the pre-Phase-3 card), so both are independently readable
   within the "under 10 seconds" contract. Additive only: exec-decision's
   existing .wsp-inbox__reason/.wsp-inbox__impact usage is untouched. */
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
  max-height: 0; opacity: 0; overflow: hidden; transition: max-height 340ms ${EASE}, opacity 240ms ${EASE}; }
.wsp-reco__more--open { max-height: 3000px; opacity: 1; }
.wsp-reco__toggle { align-self: flex-start; font: inherit; font-size: .8rem; font-weight: 700; color: var(--accent);
  background: none; border: none; cursor: pointer; padding: 8px 2px; }
.wsp-reco__toggle:hover { text-decoration: underline; }
.wsp-reco__toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .wsp-reco__more { transition: none; } }
[data-anim="off"] .wsp-reco__more { transition: none; }

/* Simulation Center launcher */
.wsp-sim { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.wsp-sim__examples { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.wsp-sim__examples li { position: relative; padding-left: 14px; font-size: .82rem; color: var(--text-dim); }
.wsp-sim__examples li::before { content: "→"; position: absolute; left: 0; color: var(--text-ghost); }

/* Operational Snapshot — v1.22.1: hairline tiles, no shadow (Objective 3);
   bigger numerals / smaller uppercase labels (Objective 2). */
.wsp-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
.wsp-summary { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 14px 16px; background: var(--surface);
  border: 1px solid var(--border-faint); border-radius: var(--radius-sm); box-shadow: none; cursor: pointer; font: inherit; color: inherit;
  transition: border-color .12s ease; }
.wsp-summary:hover { border-color: var(--border-strong); }
.wsp-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
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
  transition: color .14s ease, background-color .14s ease, box-shadow .14s ease; }
.wsp-segmented__btn:hover { color: var(--text); }
.wsp-segmented__btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
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

/* Operational Story — v1.22.3 Executive Presence: a highlight reel, not an
   audit log. Apple-Reminders-style hierarchy: time small/quiet, the sentence
   is the heaviest text in the row, a light secondary meta line only when it
   adds information. Icon carries the category; its background tint carries
   the accent color (Objective 6/7/8). */
.wsp-feed { display: flex; flex-direction: column; }
.wsp-feed__list, .wsp-feed__more, .wsp-feed__sublist { list-style: none; margin: 0; padding: 0; }
.wsp-feed__row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; }
.wsp-feed__icon { flex: none; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: var(--wsp-neutral); background: color-mix(in srgb, var(--wsp-neutral) 14%, transparent); margin-top: 1px; }
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
   real content height in JS. */
.wsp-feed__more { max-height: 0; opacity: 0; overflow: hidden; transition: max-height .35s ease, opacity .25s ease; }
.wsp-feed__more--open { max-height: 2000px; opacity: 1; }
.wsp-feed__toggle { margin-top: 8px; font: inherit; font-size: .8rem; font-weight: 700; color: var(--accent);
  background: none; border: 0; padding: 0; cursor: pointer; }
.wsp-feed__toggle:hover { text-decoration: underline; }
.wsp-feed__toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .wsp-feed__more { transition: none; } }

/* Executive Launcher chips (mobile: horizontal scroll) */
.wsp-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.wsp-chip { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: .82rem; font-weight: 600; white-space: nowrap;
  padding: 9px 15px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer;
  transition: border-color .12s ease, background-color .12s ease; }
.wsp-chip:hover { border-color: var(--border-strong); background: var(--border-faint); }
.wsp-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wsp-chip__icon { display: inline-flex; }

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
}

/* ════════ v1.22.2 Objective 12 — Apple-style staggered reveal ════════
   fade-up/anFadeUp is unchanged (still global in platform.css, still
   reduced-motion-safe); this just cascades each top-level section in a beat
   apart instead of all at once — quiet, short, capped at 6 steps so it never
   delays content far down the page. */
.wsp-grid > *:nth-child(1) { animation-delay: 0ms; }
.wsp-grid > *:nth-child(2) { animation-delay: 60ms; }
.wsp-grid > *:nth-child(3) { animation-delay: 100ms; }
.wsp-grid > *:nth-child(4) { animation-delay: 140ms; }
.wsp-grid > *:nth-child(5) { animation-delay: 180ms; }
.wsp-grid > *:nth-child(n+6) { animation-delay: 220ms; }
`;
