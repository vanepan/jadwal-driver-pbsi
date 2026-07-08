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

/* Hero — v1.22.2 redesign: the briefing's single dominant surface. Health
   Score is promoted to its OWN standalone hero metric (Objective 2) — number
   first, status second, category caption last/smallest — stacked ABOVE the
   secondary stat row, not squeezed beside it. Whitespace (not dividers)
   separates every block (Objective 3/10). */
.wsp-hero { display: flex; flex-direction: column; gap: 0; padding: 6px 2px 4px; }
.wsp-hero__top { display: flex; flex-direction: column; gap: 12px; }
.wsp-hero__eyebrow { font-size: .74rem; font-weight: 600; color: var(--text-faint); }
.wsp-hero__headline { font-family: var(--font-display); font-weight: 800; font-size: clamp(1.8rem, 4.2vw, 2.75rem);
  line-height: 1.1; letter-spacing: -0.025em; margin: 0; color: var(--text); }
.wsp-hero__hl--good { color: var(--wsp-good); }
.wsp-hero__hl--warn { color: var(--wsp-warn); }
.wsp-hero__hl--danger { color: var(--wsp-danger); }
.wsp-hero__hl--info { color: var(--wsp-info); }
.wsp-hero__hl--neutral { color: var(--text-faint); }
.wsp-hero__insight { font-size: .96rem; font-weight: 400; color: var(--text-faint); line-height: 1.45; margin: 0; max-width: 56ch; }

/* Health metric — standalone, full width, ABOVE the stat row. */
.wsp-hero__metrics { display: flex; flex-direction: column; gap: 36px; margin-top: 36px; }
.wsp-hero__health { display: flex; align-items: center; gap: 22px; }
.wsp-hero__gwrap { position: relative; flex: none; display: flex; }
.wsp-hero__scorewrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.wsp-hero__scoreval { font-family: var(--font-display); font-weight: 800; font-size: 2.6rem; line-height: 1; letter-spacing: -0.03em; color: var(--text); font-variant-numeric: tabular-nums; }
.wsp-hero__scoreval--muted { color: var(--text-ghost); }
.wsp-hero__scoreunit { font-size: .68rem; color: var(--text-faint); font-weight: 600; }
.wsp-hero__healthmeta { display: flex; flex-direction: column; gap: 7px; align-items: flex-start; }
.wsp-hero__panel-label { font-size: .7rem; font-weight: 600; color: var(--text-faint); }

/* Secondary stat row — quiet, whitespace-separated, no column rules. */
.wsp-hero__stats { display: flex; flex-wrap: wrap; gap: 36px; }
.wsp-hero__stat { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.wsp-hero__stat-lbl { font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); }
.wsp-hero__stat-big { font-family: var(--font-display); font-weight: 700; font-size: 1.3rem; letter-spacing: -0.015em; color: var(--text-dim); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

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

/* Decision Center — a call-to-action, not a flat list (v1.22.2 Objective 6):
   whitespace-separated (no row divider), with a real size hierarchy — the
   first (highest-impact) decision is visibly bigger than the 2nd/3rd. */
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

/* Recommendation Center — same whitespace-separated list language (spacing
   comes from the parent .wsp-card__body gap, same as every other card). */
.wsp-reco { display: flex; flex-direction: column; gap: 4px; }
.wsp-reco__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wsp-reco__benefit { font-size: .72rem; color: var(--text-faint); }
.wsp-reco__title { font-size: .88rem; font-weight: 700; color: var(--text); }
.wsp-reco__reason { font-size: .8rem; color: var(--text-dim); line-height: 1.45; }

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

/* Operational Snapshot — Today/Week/Month period sections (v1.21.0) */
.wsp-snapshot-period + .wsp-snapshot-period { margin-top: 16px; }
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

/* ════════ v1.22.2 Objectives 10/11 — Adaptive Layout ════════
   Health-metric-above-stats is now the Hero's layout at EVERY breakpoint (no
   longer a tablet-only override), so these tiers only need to handle true
   layout differences: grid density and the stat row's wrap behavior. Mobile
   is a genuine redesign, not a shrunk desktop (Objective 11) — no area is
   ever forced to scroll horizontally; the stat row wraps like everything
   else instead of the v1.22.1 horizontal-scroll strip. */

/* Tablet (≤1024px) — still 2 columns, medium density. */
@media (max-width: 1024px) {
  .wsp-root { padding: 4px 0 32px; gap: 36px; }
}

/* Mobile (≤600px) — single column; Hero is the true first screen: score +
   status immediately visible, stats wrap into a natural 2-column grid (never
   a forced horizontal strip), the score-breakdown disclosure stays collapsed
   below the fold. */
@media (max-width: 600px) {
  .wsp-root { gap: 32px; }
  .wsp-grid { grid-template-columns: 1fr; }
  .wsp-card--span2 { grid-column: span 1; }
  .wsp-hero__headline { font-size: clamp(1.5rem, 7vw, 1.9rem); }
  .wsp-hero__gwrap svg { width: 116px; height: 116px; }
  .wsp-hero__health { gap: 16px; }
  .wsp-hero__stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
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
