/* ============================================================
   WORKSPACE-STYLES.JS — v1.19.9 Executive Command Center

   Injects the scoped `.wsp-*` stylesheet ONCE. Every rule lives under
   `.wsp-root`, which is nested inside the Home host's `exec-ui
   v2-analytics-claude` scope — so ALL colors resolve from the existing
   Executive design tokens (light + dark) and dark mode is automatic. No
   :root mutation, no hardcoded colors, no new design language.
   ============================================================ */

'use strict';

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
  display: flex; flex-direction: column; gap: 24px; padding: 4px 2px 40px; }

/* Header */
.wsp-header { display: flex; flex-direction: column; gap: 4px; }
.wsp-eyebrow { font-size: .68rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--text-faint); }
.wsp-title { font-family: var(--font-display); font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 700; color: var(--text); margin: 0; letter-spacing: -0.02em; }
.wsp-subtitle { font-size: .95rem; color: var(--text-dim); margin: 0; max-width: 62ch; }

/* Grid */
.wsp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; align-items: start; }
.wsp-card--span2 { grid-column: span 2; }
@media (max-width: 720px) { .wsp-grid { grid-template-columns: 1fr; } .wsp-card--span2 { grid-column: span 1; } }

/* Card */
.wsp-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm);
  padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 12px; min-height: 96px; }
.wsp-card__head { display: flex; align-items: center; justify-content: space-between; }
.wsp-card__title { font-size: .82rem; font-weight: 700; letter-spacing: .02em; color: var(--text); margin: 0; }
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
.wsp-block { display: flex; flex-direction: column; gap: 14px; }
.wsp-block__head { display: flex; align-items: baseline; }
.wsp-block__title { font-family: var(--font-display); font-size: 1.05rem; font-weight: 700; color: var(--text); margin: 0; letter-spacing: -0.01em; }
.wsp-block__body { display: flex; flex-direction: column; gap: 12px; }
.wsp-block--loading .wsp-block__body { min-height: 60px; }

/* Hero — greeting · readiness · narrative · today's summary */
.wsp-hero { display: grid; grid-template-columns: 1.5fr auto; grid-template-areas: "lead panel" "summary panel"; gap: 18px 28px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: 26px 28px; }
.wsp-hero__lead { grid-area: lead; display: flex; flex-direction: column; gap: 4px; }
.wsp-hero__greeting { font-family: var(--font-display); font-size: clamp(1.4rem, 3vw, 1.9rem); font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
.wsp-hero__date { font-size: .82rem; color: var(--text-faint); font-weight: 600; }
.wsp-hero__narrative { font-size: .96rem; color: var(--text-dim); line-height: 1.55; margin: 8px 0 0; max-width: 60ch; }
.wsp-hero__panel { grid-area: panel; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 6px; text-align: right;
  padding-left: 24px; border-left: 1px solid var(--border-faint); min-width: 150px; }
.wsp-hero__panel-label { font-size: .68rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); }
.wsp-hero__score { display: flex; align-items: baseline; gap: 2px; }
.wsp-hero__scoreval { font-family: var(--font-display); font-size: 3.4rem; font-weight: 800; line-height: 1; color: var(--text); letter-spacing: -0.03em; }
.wsp-hero__scoreval--muted { color: var(--text-ghost); }
.wsp-hero__scoreunit { font-size: 1rem; color: var(--text-faint); font-weight: 600; }
.wsp-hero__score--good .wsp-hero__scoreval { color: var(--wsp-good); }
.wsp-hero__score--warn .wsp-hero__scoreval { color: var(--wsp-warn); }
.wsp-hero__score--danger .wsp-hero__scoreval { color: var(--wsp-danger); }
.wsp-hero__score--info .wsp-hero__scoreval { color: var(--wsp-info); }
/* Explainability breakdown (v1.21.0 Objective 9) — the 5 Health Score domains */
.wsp-hero__breakdown { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; width: 100%; }
.wsp-hero__bd-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: .74rem; }
.wsp-hero__bd-label { color: var(--text-faint); }
.wsp-hero__bd-weight { color: var(--text-ghost); }
.wsp-hero__bd-value { font-weight: 700; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.wsp-hero__summary { grid-area: summary; align-self: end; }
.wsp-hero__summary-title { font-size: .7rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 6px; }
.wsp-hero__list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 4px 18px; }
.wsp-hero__list li { position: relative; padding-left: 14px; font-size: .86rem; color: var(--text-dim); }
.wsp-hero__list li::before { content: ""; position: absolute; left: 0; top: .5em; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }

/* Operational Priority cards */
.wsp-prio-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.wsp-prio { display: flex; flex-direction: column; gap: 6px; padding: 15px 16px; background: var(--surface); border: 1px solid var(--border);
  border-left: 3px solid var(--wsp-neutral); border-radius: var(--radius-sm); box-shadow: var(--shadow-sm); }
.wsp-prio--critical { border-left-color: var(--wsp-danger); background: color-mix(in srgb, var(--wsp-danger) 5%, var(--surface)); }
.wsp-prio--warn { border-left-color: var(--wsp-warn); }
.wsp-prio--ok { border-left-color: var(--wsp-good); }
.wsp-prio__sev { font-size: .64rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); }
.wsp-prio--critical .wsp-prio__sev { color: var(--wsp-danger); }
.wsp-prio--warn .wsp-prio__sev { color: var(--wsp-warn); }
.wsp-prio--ok .wsp-prio__sev { color: var(--wsp-good); }
.wsp-prio__title { font-size: .92rem; font-weight: 700; color: var(--text); }
.wsp-prio__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; flex: 1; }
.wsp-prio .wsp-btn { align-self: flex-start; margin-top: 4px; }

/* Decision Center — operational inbox */
.wsp-inbox { display: flex; flex-direction: column; gap: 10px; }
.wsp-inbox__item { display: flex; flex-direction: column; gap: 5px; padding: 12px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.wsp-inbox__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wsp-inbox__impact { font-size: .72rem; color: var(--text-faint); text-align: right; }
.wsp-inbox__title { font-size: .9rem; font-weight: 700; color: var(--text); }
.wsp-inbox__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }
.wsp-inbox__item .wsp-btn { align-self: flex-start; margin-top: 2px; }

/* Recommendation Center */
.wsp-reco { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-bottom: 1px solid var(--border-faint); }
.wsp-reco:last-of-type { border-bottom: 0; }
.wsp-reco__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wsp-reco__benefit { font-size: .72rem; color: var(--text-faint); }
.wsp-reco__title { font-size: .88rem; font-weight: 700; color: var(--text); }
.wsp-reco__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }

/* Simulation Center launcher */
.wsp-sim { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.wsp-sim__examples { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.wsp-sim__examples li { position: relative; padding-left: 14px; font-size: .82rem; color: var(--text-dim); }
.wsp-sim__examples li::before { content: "→"; position: absolute; left: 0; color: var(--text-ghost); }

/* Operational Snapshot — executive summary cards */
.wsp-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
.wsp-summary { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 15px 16px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); cursor: pointer; font: inherit; color: inherit;
  transition: border-color .12s ease, box-shadow .12s ease; }
.wsp-summary:hover { border-color: var(--border-strong); box-shadow: var(--shadow-md); }
.wsp-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wsp-summary__title { font-size: .74rem; color: var(--text-dim); font-weight: 600; }
.wsp-summary__value { font-family: var(--font-display); font-size: 1.9rem; font-weight: 800; color: var(--text); letter-spacing: -0.02em; line-height: 1.05; }
.wsp-summary__status { font-size: .7rem; font-weight: 700; width: fit-content; padding: 2px 8px; border-radius: 999px; background: var(--border-faint); color: var(--text-dim); }
.wsp-summary__status--good { background: color-mix(in srgb, var(--wsp-good) 14%, transparent); color: var(--wsp-good); }
.wsp-summary__status--warn { background: color-mix(in srgb, var(--wsp-warn) 16%, transparent); color: var(--wsp-warn); }
.wsp-summary__status--danger { background: color-mix(in srgb, var(--wsp-danger) 14%, transparent); color: var(--wsp-danger); }
.wsp-summary--static { cursor: default; }
.wsp-summary--static:hover { border-color: var(--border); box-shadow: var(--shadow-sm); }

/* Operational Snapshot — Today/Week/Month period sections (v1.21.0) */
.wsp-snapshot-period + .wsp-snapshot-period { margin-top: 16px; }
.wsp-snapshot-period__label { font-size: .68rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); margin: 0 0 8px; }

/* Activity Feed — grouped */
.wsp-feed { display: flex; flex-direction: column; gap: 4px; }
.wsp-feed__group { font-size: .68rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); margin: 10px 0 2px; }
.wsp-feed__group:first-child { margin-top: 0; }

/* Executive Launcher chips (mobile: horizontal scroll) */
.wsp-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.wsp-chip { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: .82rem; font-weight: 600; white-space: nowrap;
  padding: 9px 15px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer;
  transition: border-color .12s ease, background-color .12s ease; }
.wsp-chip:hover { border-color: var(--border-strong); background: var(--border-faint); }
.wsp-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wsp-chip__icon { display: inline-flex; }

/* Mobile: hero collapses to a single column; chips scroll horizontally. */
@media (max-width: 720px) {
  .wsp-hero { grid-template-columns: 1fr; grid-template-areas: "lead" "panel" "summary"; padding: 20px; gap: 16px; }
  .wsp-hero__panel { align-items: flex-start; text-align: left; padding-left: 0; border-left: 0; border-top: 1px solid var(--border-faint); padding-top: 14px; }
  .wsp-hero__list { grid-template-columns: 1fr; }
  .wsp-chips { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .wsp-chips::-webkit-scrollbar { display: none; }
  .wsp-chip { flex: 0 0 auto; }
}
`;
