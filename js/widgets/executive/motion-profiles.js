/* ============================================================
   WIDGETS/EXECUTIVE/MOTION-PROFILES.JS — Phase 0 Motion Architecture

   Defines WHAT each mood's motion should be (durations / easing /
   stagger), per Sarpras Motion Language v1.0 §02/§03/§05/§06/§07 and
   the approved Conflict Resolution.

   PHASE 0 SCOPE: architecture only. Nothing in this file is wired into
   rendering or animation yet — js/widgets/executive/index.js does not
   import it. The Hero (Phase 1) is the first consumer.

   Two independent timelines (Conflict Resolution #1 — Macro vs Micro
   motion are separated because they answer different questions and
   were separately authoritative in different source documents):

   - MACRO_STAGGER   — page-level section reveal. Owned by the page.
                       Authoritative source: Executive Command Center
                       .dc.html's own inline animation-delay values,
                       corroborated verbatim by the Design Review's
                       caption table. Motion Language §03's alternate
                       340/420/600ms walkthrough beats are documentation
                       drift from an earlier, simplified illustrative
                       composition (it has no Snapshot/Story beats at
                       all) and are NOT used for section-level timing.

   - MICRO_STAGGER   — Hero-internal choreography (Greeting / Headline /
                       Ring / Operational pulse), relative to the Hero's
                       OWN mount (i.e. measured from the moment the
                       macro cascade reveals the Hero, not from page
                       load). Source: Motion Language §03 beats
                       0/80/180/240ms — these do not conflict with macro
                       timing; they describe sub-parts of the same Hero
                       block at finer resolution. The Hero owns this
                       timeline; the page never reaches into it.
   ============================================================ */

'use strict';

export const EASE = 'cubic-bezier(.2,.7,.2,1)';
export const EASE_URGENT = 'cubic-bezier(.4,0,.2,1)';

/** Macro Motion — page-level section reveal (ms, relative to page mount). */
export const MACRO_STAGGER = {
  pageHeader: 0,
  hero: 80,
  attention: 160,
  recommendation: 220,
  snapshot: 280,
  story: 340,
};

/** Micro Motion — Hero-internal choreography (ms, relative to the
 *  Hero's own mount). Identical across moods; only duration/ease of
 *  each beat varies by mood (see MOTION_PROFILES below). */
const MICRO_STAGGER = {
  greeting: 0,
  headline: 80,
  ring: 180,
  pulse: 240,
};

/** Per-mood tempo, per Motion Language §05 ("Emotional rhythm") and §06
 *  ("Operational mood motion"). Replaces the flat 650ms (Executive
 *  Command Center.dc.html prototype's tweenScore) / 900ms (current
 *  production animateHeroMotion) per the approved Conflict Resolution —
 *  score/ring reveal duration and easing now vary by mood instead of
 *  being constant. `pulse` is the attention heartbeat spec (null when
 *  the mood has no persistent motion, per Motion Language's "stillness
 *  is the reward of a healthy operation").
 */
export const MOTION_PROFILES = {
  healthy:  { entranceDuration: 560, ringDuration: 720, ease: EASE,         pulse: null,                                tempo: 'Calm',      micro: MICRO_STAGGER },
  good:     { entranceDuration: 540, ringDuration: 660, ease: EASE,         pulse: null,                                tempo: 'Calm',      micro: MICRO_STAGGER },
  warning:  { entranceDuration: 420, ringDuration: 520, ease: EASE,         pulse: { periodMs: 2400, amplitude: 'low' }, tempo: 'Measured',  micro: MICRO_STAGGER },
  critical: { entranceDuration: 300, ringDuration: 360, ease: EASE_URGENT,  pulse: { periodMs: 1600, amplitude: 'scale' }, tempo: 'Urgent',  micro: MICRO_STAGGER },
  noData:   { entranceDuration: 600, ringDuration: 600, ease: EASE,         pulse: null,                                tempo: 'Calm',      micro: MICRO_STAGGER },
};

/** Realtime (data-arrives-live) score correction: Motion Language §07
 *  specifies ONE continuity-transition timing for this, not a per-mood
 *  table (unlike the first-paint reveal above, which is per-mood) —
 *  the arc eases directly to the new sweep and is never reset to zero. */
export const REALTIME_TWEEN = { duration: 560, ease: EASE };

/** Maps the app's real, exported state vocabulary onto a Motion Profile
 *  key. narrative-builder.js's classifyState() is private — the only
 *  thing the Hero actually has is buildHeroNarrative()'s `headline.tone`
 *  ('danger'|'warn'|'info'|'good'|'neutral'), which is a 1:1 image of
 *  classifyState()'s five states (HEADLINE_BY_STATE never reuses a tone
 *  across two states), so this mapping is exact, not a guess.
 *  Presentation-only: does not read from or alter narrative-builder.js. */
const TONE_TO_PROFILE = {
  danger: 'critical',
  warn: 'warning',
  info: 'good',
  good: 'healthy',
  neutral: 'noData',
};

export function resolveMotionProfile(tone) {
  const key = TONE_TO_PROFILE[tone] || 'healthy';
  return MOTION_PROFILES[key];
}

/** Evaluates a `cubic-bezier(x1,y1,x2,y2)` string as a JS easing function
 *  (Newton-Raphson on the parametric curve). Lets the JS-driven score
 *  count-up use the EXACT same curve as the CSS-driven ring transition
 *  for the same mood, so they visibly settle together (Motion Language:
 *  "arc and numeral tween together"). Falls back to linear if the string
 *  cannot be parsed (e.g. a plain 'ease'/'linear' keyword). */
export function cssEaseToFn(easeStr) {
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(easeStr || '');
  if (!m) return (t) => t;
  const [p1x, p1y, p2x, p2y] = m.slice(1, 5).map(Number);
  const sampleX = (t) => 3 * p1x * (1 - t) ** 2 * t + 3 * p2x * (1 - t) * t ** 2 + t ** 3;
  const sampleY = (t) => 3 * p1y * (1 - t) ** 2 * t + 3 * p2y * (1 - t) * t ** 2 + t ** 3;
  const solveT = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-4) return t;
      const d = 3 * (1 - t) ** 2 * p1x + 6 * (1 - t) * t * (p2x - p1x) + 3 * t ** 2 * (1 - p2x);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    return t;
  };
  return (x) => sampleY(solveT(Math.max(0, Math.min(1, x))));
}
