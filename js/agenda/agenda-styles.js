/* ============================================================
   agenda-styles.js — scoped stylesheet, injected once
   (V1.31 Agenda & To-Do, Phase C3)

   JS-injected (mirrors js/workspace/workspace-styles.js's own
   injectWorkspaceStyles() idiom) rather than a new static .css file —
   deliberately sidesteps the index.html <link>/sync-version.mjs cache-
   bust wiring a new static stylesheet would need (a real, previously-
   documented gap in this codebase, see
   docs/AGENDA_TODO_DISCOVERY_REPORT_v1.31.0.0.md §13).

   `.cal-root` token set is a straight copy of `.ot-root`/`.pc-root`'s
   shape (Phase A's own recommendation) — same variable names, same
   light/dark values, so this module inherits visual consistency with
   Overtime/Petty Cash for free and never touches var(--white)/--dark*
   (the documented dark-mode trap).
   ============================================================ */

'use strict';

let _injected = false;

export function injectAgendaStyles() {
  if (_injected) return;
  _injected = true;
  const style = document.createElement('style');
  style.id = 'agenda-styles';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
.cal-root {
  --bg:#f3f2ef; --card:#ffffff; --card2:#faf9f7; --border:#e8e6e1; --border2:#efeeea;
  --text:#262320; --muted:#8b857c; --label:#a49d93;
  --primary: var(--accent); --primary-fg: var(--on-accent); --primary-tint: var(--accent-subtle);
  --primary-text: var(--accent); --primary-hover: var(--accent-hover);
  --green:#2f7d5b; --green-tint:#e6f0ea; --green-bd:#cfe3d8;
  --amber:#a9781a; --amber-tint:#f8eed4; --amber-bd:#ecdcb2;
  --blue:#4f73a8; --blue-tint:#e7edf5; --blue-bd:#cdd9ea;
  --red:#a8292f; --red-tint:#faebea; --red-bd:#f0c9c7;
  --input:#ffffff; --input-bd:#e1dfd9;
  /* SS9 R1 — person identity colors (js/agenda/agenda-identity-colors.js
     is the ONE place that decides which of these a given person gets;
     this block only supplies the actual values). --id-grace is a
     dedicated sky blue, deliberately NOT the same as --blue above (the
     existing .cal-pill--kabid scope badge already uses --blue — reusing
     it for Grace would make a Kabid-scope item with Grace as a
     participant show two different meanings in the same shade). */
  --id-grace:#3d8bc4; --id-evan:#3a3a3c; --id-leo: var(--amber); --id-kabid: var(--red);
  --id-fb1: var(--green); --id-fb2:#6b4e9e; --id-fb3:#a9742a;
  color: var(--text);
}
.cal-root[data-theme="dark"], [data-theme="dark"] .cal-root {
  --bg:#201e1b; --card:#2a2724; --card2:#2f2c28; --border:#3a3631; --border2:#332f2b;
  --text:#ece8e2; --muted:#a49d93; --label:#847d72;
  --green:#72af8f; --green-tint:#1f2c27; --green-bd:#2c3a33;
  --amber:#c7a05b; --amber-tint:#2c2719; --amber-bd:#3a331f;
  --blue:#7ea0d6; --blue-tint:#1e2733; --blue-bd:#2a3646;
  --red:#d6817c; --red-tint:#2e2120; --red-bd:#3d2b29;
  --input:#2a2724; --input-bd:#3a3631;
  --id-grace:#6fb3e0; --id-evan:#a49d93; --id-leo: var(--amber); --id-kabid: var(--red);
  --id-fb1: var(--green); --id-fb2:#8470b5; --id-fb3:#be9350;
}

/* ── Section shell (the Today sibling host) ─────────────────────── */
.cal-section { padding: 4px 0 28px; }
.cal-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
.cal-title { font-size:1.05rem; font-weight:650; letter-spacing:-0.01em; margin:0; }
.cal-subtitle { font-size:.8rem; color:var(--muted); margin-top:2px; }
.cal-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

.cal-modeswitch { display:inline-flex; background:var(--card2); border:1px solid var(--border); border-radius:10px; padding:3px; gap:2px; }
.cal-modeswitch button { border:0; background:transparent; padding:7px 14px; border-radius:8px; font-size:.82rem; font-weight:560; color:var(--muted); cursor:pointer; }
.cal-modeswitch button[aria-selected="true"] { background:var(--card); color:var(--text); box-shadow:0 1px 2px rgba(0,0,0,.06); }
.cal-modeswitch button:focus-visible { outline:2px solid var(--primary); outline-offset:1px; }

.cal-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); background:var(--card); color:var(--text); padding:8px 14px; border-radius:10px; font-size:.82rem; font-weight:600; cursor:pointer; }
.cal-btn:hover { border-color: var(--primary); }
/* V1.31.3 §13 audit finding: --primary (and every other .cal-root-scoped
   token) is a LOCAL alias defined only inside .cal-root's own rule block
   — it does not inherit into js/components/drawer.js's overlay, which is
   appended directly to document.body as a SIBLING of .cal-root, not a
   descendant. Every :focus-visible rule below that must render inside a
   drawer (.cal-btn is used in BOTH the toolbar AND drawer bodies) falls
   back to var(--accent) — the one token this alias always just re-exports
   — so the ring stays visible in both contexts instead of silently
   computing to outline-style:none (CSS's invalid-at-computed-value
   fallback for an undefined custom property with no var() fallback of
   its own). Pre-existing since Phase C3; fixed here only where a real
   focus outline was found to go invisible, not swept file-wide. */
.cal-btn:focus-visible { outline:2px solid var(--primary, var(--accent)); outline-offset:2px; }
.cal-btn--primary { background:var(--primary); border-color:var(--primary); color:var(--primary-fg); }
.cal-btn--primary:hover { background:var(--primary-hover); }
.cal-btn--sm { padding:6px 10px; font-size:.76rem; }
.cal-btn--ghost { border-color:transparent; background:transparent; }

/* ── Card shell reused everywhere ─────────────────────────────────── */
.cal-card { background:var(--card); border:1px solid var(--border); border-radius:14px; }

/* ── Filter chips ──────────────────────────────────────────────────── */
.cal-filters { display:flex; gap:6px; overflow-x:auto; padding:2px 0 10px; -webkit-overflow-scrolling:touch; }
.cal-filters::-webkit-scrollbar { display:none; }
/* Phase C4 export drawer: the drawer panel (≤440px) is narrower than the
   workspace section this base .cal-filters idiom was designed for — a
   horizontally-SCROLLING row of 7 preset chips (or 5 status chips) hides
   options like "Custom"/"Terlewat" off-screen with no visible affordance
   that more exist. Found by actually screenshotting the drawer, not
   theorized. Wrapping is strictly additive (only applied where opted in),
   never changes the To-Do view's own wider, correctly-scrolling chips. */
.cal-filters--wrap { flex-wrap:wrap; overflow-x:visible; padding-bottom:2px; }
.cal-chip { flex:0 0 auto; border:1px solid var(--border); background:var(--card); color:var(--muted); padding:6px 12px; border-radius:999px; font-size:.78rem; font-weight:560; cursor:pointer; white-space:nowrap; }
.cal-chip[aria-pressed="true"] { background:var(--primary-tint); border-color:var(--primary); color:var(--primary-text); }

/* ── Agenda (default list) view ──────────────────────────────────── */
.cal-daygroup { margin-bottom:22px; }
.cal-daylabel { font-size:.72rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--label); margin:0 0 8px 2px; }
.cal-row { display:flex; gap:12px; padding:11px 12px; border-radius:12px; align-items:flex-start; cursor:pointer; }
.cal-row:hover { background:var(--card2); }
.cal-row:focus-visible { outline:2px solid var(--primary); outline-offset:-2px; }
.cal-row-time { flex:0 0 56px; font-size:.78rem; font-weight:650; color:var(--muted); padding-top:1px; }
.cal-row-dot { flex:0 0 8px; width:8px; height:8px; border-radius:999px; margin-top:6px; background:var(--blue); }
.cal-row-dot--task { background:var(--amber); border-radius:3px; }
.cal-row-body { flex:1; min-width:0; }
.cal-row-title { font-size:.9rem; font-weight:600; margin:0 0 2px; overflow-wrap:anywhere; }
.cal-row-title--done { text-decoration:line-through; color:var(--muted); }
.cal-row-meta { font-size:.76rem; color:var(--muted); display:flex; flex-wrap:wrap; gap:8px; }
.cal-row-meta span { display:inline-flex; align-items:center; gap:4px; }

.cal-empty-hint { text-align:center; padding:14px 12px 2px; color:var(--muted); font-size:.78rem; }
.cal-empty { text-align:center; padding:40px 16px; color:var(--muted); }
.cal-empty-title { font-size:.9rem; font-weight:600; color:var(--text); margin-bottom:4px; }
.cal-empty-sub { font-size:.8rem; margin-bottom:16px; }

/* SS9 R2 — Day Detail (the selected date's own Agenda + To-Do contents,
   rendered below the grid; reuses .cal-daylabel/.cal-row/.cal-todo-row
   verbatim, so this needs no new row styling of its own). */
.cal-daydetail { margin-top:16px; padding-top:16px; border-top:1px solid var(--border); }
.cal-daydetail-heading { font-size:.85rem; font-weight:700; color:var(--text); margin:0 0 12px; }
.cal-daydetail-empty { text-align:center; padding:24px 16px; color:var(--muted); font-size:.82rem; line-height:1.5; }

/* SS9 R1 — a small, reusable person-identity marker. Background color is
   set per-instance via inline style (the resolved var(--id-...) from
   js/agenda/agenda-identity-colors.js) rather than one CSS class per
   person, so a newly-added staff member never needs a CSS change here. */
.cal-identity-dot { display:inline-block; width:8px; height:8px; border-radius:999px; flex:0 0 auto; }
.cal-identity-dot--sm { width:6px; height:6px; }
.cal-identity-dots { display:inline-flex; align-items:center; gap:3px; }
.cal-skeleton { border-radius:12px; background:linear-gradient(90deg, var(--card2) 25%, var(--border2) 37%, var(--card2) 63%); background-size:400% 100%; animation:cal-shimmer 1.4s ease infinite; height:52px; margin-bottom:8px; }
@keyframes cal-shimmer { 0%{background-position:100% 50%} 100%{background-position:0 50%} }
.cal-error { padding:20px; text-align:center; color:var(--muted); font-size:.85rem; }

/* ── Priority / status pills ─────────────────────────────────────── */
.cal-pill { display:inline-flex; align-items:center; gap:4px; font-size:.7rem; font-weight:650; padding:2px 8px; border-radius:999px; border:1px solid transparent; }
.cal-pill--normal { background:var(--card2); color:var(--muted); border-color:var(--border); }
.cal-pill--penting { background:var(--amber-tint); color:var(--amber); border-color:var(--amber-bd); }
.cal-pill--urgent { background:var(--red-tint); color:var(--red); border-color:var(--red-bd); font-weight:700; }
.cal-pill--done { background:var(--green-tint); color:var(--green); border-color:var(--green-bd); }
.cal-pill--overdue { background:var(--red-tint); color:var(--red); border-color:var(--red-bd); }
.cal-pill--kabid { background:var(--blue-tint); color:var(--blue); border-color:var(--blue-bd); }
.cal-pill--pic { background:var(--primary-tint); color:var(--primary-text); border-color:var(--primary); }
/* V1.31.1 Calendar lifecycle badge — Terjadwal/Berlangsung/Selesai/
   Dibatalkan, DERIVED (agenda-calendar-lifecycle.js), never "Terlewat". */
.cal-pill--scheduled { background:var(--card2); color:var(--muted); border-color:var(--border); }
.cal-pill--active { background:var(--green-tint); color:var(--green); border-color:var(--green-bd); font-weight:700; }
.cal-pill--cancelled { background:var(--red-tint); color:var(--red); border-color:var(--red-bd); }

/* ── V1.31.2 §4 — Month<->Week transition. Scoped to ONLY this region via
   view-transition-name (agenda-workspace-view.js sets the class;
   agenda-workspace.js#doRenderWithViewTransition() is the one call site
   that ever triggers a transition capture here — every other re-render
   uses the plain, unanimated path). A restrained cross-fade + the
   faintest scale — "fast, subtle, Apple-like", never a slide/bounce that
   would read as a bigger move than a view toggle actually is. */
/* v1.31.4 R5 — view-transition-name must NOT be unconditional. A named
   view-transition group is captured by ANY document.startViewTransition()
   call anywhere in the app, not just the Month<->Week one this scale
   animation is meant for — including the global theme toggle's own
   transition (js/app.js#applyTheme()), which never touches this region's
   content at all. An always-on name meant this card popped/scaled on its
   own 140-180ms schedule during a THEME switch too, visibly out of step
   with the rest of the page's shared crossfade. The name is now active
   ONLY while agenda-workspace.js#doRenderWithViewTransition() has tagged
   <html> for the duration of its own transition; any other transition
   (theme included) sees no name here at all and this region simply
   participates in that transition's default root crossfade instead. */
.cal-calview-region { view-transition-name: none; }
html.cal-viewtransition-active .cal-calview-region { view-transition-name: cal-calview-region; }
@media (prefers-reduced-motion: reduce) {
  html.cal-viewtransition-active .cal-calview-region { view-transition-name: none; }
}
::view-transition-old(cal-calview-region) {
  animation: cal-calview-out 140ms cubic-bezier(0.4, 0, 1, 1) both;
}
::view-transition-new(cal-calview-region) {
  animation: cal-calview-in 180ms cubic-bezier(0, 0, 0.2, 1) both;
}
@keyframes cal-calview-out { to { opacity: 0; transform: scale(0.99); } }
@keyframes cal-calview-in { from { opacity: 0; transform: scale(1.01); } }

/* ── Calendar grid view ───────────────────────────────────────────── */
.cal-grid-head { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:6px; }
.cal-grid-head span { font-size:.68rem; font-weight:700; text-align:center; color:var(--label); text-transform:uppercase; }
.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.cal-cell { min-height:74px; border:1px solid var(--border); border-radius:10px; padding:6px; background:var(--card); cursor:pointer; display:flex; flex-direction:column; gap:4px; }
.cal-cell:hover { border-color:var(--primary); }
/* V1.31.3 §18 — visible keyboard focus on every interactive Calendar
   surface (day cells, range bars, Week timed rows); outline-offset:-2px
   keeps the ring INSIDE the cell's own box so it is never clipped by an
   ancestor's overflow, matching .cal-row's own established convention. */
.cal-cell:focus-visible { outline:2px solid var(--primary); outline-offset:-2px; }
.cal-cell--out { opacity:.4; }
.cal-cell--today .cal-cell-num { background:var(--primary); color:var(--primary-fg); border-radius:999px; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; }
/* SS9 R2 — an inset ring around the WHOLE cell, deliberately a different
   visual channel than .cal-cell--today's filled date-number circle, so a
   date that is both today AND selected shows both treatments at once
   (box-shadow:inset never shifts layout/reflows the cell, unlike a
   border-width change would). */
.cal-cell--selected { box-shadow: 0 0 0 2px var(--primary) inset; }
.cal-cell-num { font-size:.76rem; font-weight:650; }
.cal-cell-dots { display:flex; gap:3px; flex-wrap:wrap; }
.cal-cell-dot { width:6px; height:6px; border-radius:999px; background:var(--blue); }
.cal-cell-dot--task { background:var(--amber); border-radius:2px; }
.cal-cell-count { font-size:.66rem; color:var(--muted); }
/* Mobile month grid: dot/count only, no inline event text (Phase A/B risk R11) */
@media (max-width:600px) {
  .cal-cell { min-height:46px; padding:4px; }
  .cal-cell-label { display:none; }
}
.cal-week-row .cal-cell { min-height:120px; align-items:stretch; min-width:0; }
.cal-week-event { font-size:.68rem; background:var(--blue-tint); color:var(--blue); border-radius:6px; padding:2px 5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cal-week-event:focus-visible { outline:2px solid var(--primary); outline-offset:-2px; }
.cal-week-event--task { background:var(--amber-tint); color:var(--amber); }
/* V1.31.1 — Calendar item row in Week view. Neutral/organizational tone
   (green), deliberately distinct from Agenda's blue and To-Do's amber
   (spec §AM). --active (Berlangsung, right now) gets a filled/bold
   treatment; --ended (Selesai) is deliberately muted, never "Terlewat"
   red — a concluded period is not a failure. */
.cal-week-event--calendar { background:var(--green-tint); color:var(--green); border-left:3px solid var(--green); }
.cal-week-event--calendar-active { font-weight:700; }
.cal-week-event--calendar-ended { opacity:.55; }
.cal-week-event--calendar-cancelled { opacity:.55; text-decoration:line-through; background:var(--red-tint); color:var(--red); border-left-color:var(--red); }

/* V1.31.2 §5 — Week view enrichment: a dedicated all-day/range band
   (reuses .cal-range-bar — the exact same Month-view element, just
   narrower) above a chronologically-sorted "timed items" list, with the
   status language (cancelled/overdue/done) the Agenda list view already
   had but Week view never did. */
.cal-week-allday { display:flex; flex-direction:column; gap:2px; margin-bottom:4px; }
.cal-week-allday .cal-range-bar { margin:0; border-radius:5px; }
.cal-week-timed { display:flex; flex-direction:column; gap:2px; flex:1; }
.cal-week-event-time { font-weight:700; opacity:.7; margin-right:4px; font-variant-numeric:tabular-nums; }
.cal-week-event--cancelled { opacity:.55; text-decoration:line-through; }
.cal-week-event--overdue { background:var(--red-tint); color:var(--red); }
.cal-week-event--task-done { opacity:.55; text-decoration:line-through; }
.cal-week-event--task-overdue { background:var(--red-tint); color:var(--red); }

/* ── Multi-day Calendar range bar (Month view) — ONE continuous visual
   block per item, clipped/segmented per visible week row, never six
   unrelated dots (spec §AL/§I). Flush (no radius) on whichever side the
   range continues past the cell/row edge; rounded ONLY on the item's true
   start/end day, so the eye reads "this keeps going" vs "this is where it
   begins/ends" without any text needed on continuation days. ────────── */
.cal-range-bar { height:14px; border-radius:0; margin:0 -6px; padding:0 6px; font-size:.62rem; line-height:14px; font-weight:650; color:var(--green); background:var(--green-tint); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; cursor:pointer; }
.cal-range-bar:focus-visible { outline:2px solid var(--primary); outline-offset:-2px; }
.cal-range-bar--cap-left { margin-left:0; border-radius:7px 0 0 7px; padding-left:6px; }
.cal-range-bar--cap-right { margin-right:0; border-radius:0 7px 7px 0; }
.cal-range-bar--cap-left.cal-range-bar--cap-right { border-radius:7px; }
.cal-range-bar--berlangsung { background:var(--green); color:#fff; font-weight:700; }
.cal-range-bar--selesai { opacity:.55; }
.cal-range-bar--dibatalkan { background:var(--red-tint); color:var(--red); text-decoration:line-through; opacity:.75; }
.cal-range-bar-more { font-size:.62rem; color:var(--muted); padding:0 6px; }
@media (max-width:600px) {
  /* Mirrors the existing dot-only mobile convention (Phase A/B risk R11) —
     the bar itself (a thin colored strip) still communicates a multi-day
     block at 390px; only the truncated title label is hidden for space,
     exactly like .cal-cell-label already hides dot-count text. */
  .cal-range-bar-label { display:none; }
  .cal-range-bar { height:8px; }
}

/* ── To-do view ───────────────────────────────────────────────────── */
.cal-todo-row { display:flex; gap:10px; align-items:flex-start; padding:11px 12px; border-radius:12px; }
.cal-todo-row:hover { background:var(--card2); }
.cal-checkbox { flex:0 0 20px; width:20px; height:20px; border-radius:6px; border:1.5px solid var(--border-bd, var(--border)); display:flex; align-items:center; justify-content:center; cursor:pointer; margin-top:1px; background:var(--card); }
.cal-checkbox[aria-checked="true"] { background:var(--green); border-color:var(--green); color:#fff; }
/* .cal-checkbox is used both inside .cal-root (To-Do list row) and inside
   a drawer (task checklist item) — see the .cal-btn comment above for why
   the var(--accent) fallback is required for the drawer case. */
.cal-checkbox:focus-visible { outline:2px solid var(--primary, var(--accent)); outline-offset:2px; }

/* ── Drawer form (content INSIDE js/components/drawer.js's own chrome) ── */
.cal-form-field { margin-bottom:16px; }
.cal-form-label { display:block; font-size:.78rem; font-weight:650; color:var(--muted); margin-bottom:6px; }
.cal-form-label--req::after { content:' *'; color:var(--red); }
.cal-form-input, .cal-form-textarea, .cal-form-select {
  width:100%; border:1px solid var(--input-bd); background:var(--input); color:var(--text);
  border-radius:10px; padding:10px 12px; font-size:16px; font-family:inherit; box-sizing:border-box;
}
/* Every .cal-form-* field only ever renders inside a drawer body — the
   var(--accent)/var(--accent-subtle) fallbacks are load-bearing here, not
   defensive filler (see the .cal-btn comment above). */
.cal-form-input:focus, .cal-form-textarea:focus, .cal-form-select:focus { outline:none; border-color:var(--primary, var(--accent)); box-shadow:0 0 0 3px var(--primary-tint, var(--accent-subtle)); }
.cal-form-textarea { min-height:72px; resize:vertical; }
.cal-form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media (max-width:480px) { .cal-form-row { grid-template-columns:1fr; } }
.cal-form-hint { font-size:.72rem; color:var(--muted); margin-top:4px; }
.cal-form-error { font-size:.76rem; color:var(--red); margin-top:4px; font-weight:600; }
.cal-form-check { display:flex; align-items:center; gap:8px; font-size:.85rem; }
.cal-form-input[disabled], .cal-form-textarea[disabled], .cal-form-select[disabled] { opacity:.65; cursor:not-allowed; }

/* ── Self-RSVP (Phase C3.1) ──────────────────────────────────────── */
.cal-rsvp-buttons { display:flex; flex-wrap:wrap; gap:8px; margin-top:2px; }
.cal-rsvp-chip { padding:9px 16px; min-height:40px; }
.cal-rsvp-chip[aria-pressed="true"] { font-weight:700; }
.cal-rsvp-chip--accepted[aria-pressed="true"] { background:var(--green-tint); border-color:var(--green); color:var(--green); }
.cal-rsvp-chip--declined[aria-pressed="true"] { background:var(--red-tint); border-color:var(--red); color:var(--red); }
.cal-rsvp-chip--tentative[aria-pressed="true"] { background:var(--amber-tint); border-color:var(--amber); color:var(--amber); }
.cal-disclosure summary { cursor:pointer; font-size:.82rem; font-weight:650; color:var(--primary-text); padding:8px 0; list-style:none; display:flex; align-items:center; gap:6px; }
.cal-disclosure summary::-webkit-details-marker { display:none; }
.cal-disclosure[open] summary { margin-bottom:6px; }

/* ── Participant/PIC picker (invoked as a second-level sheet) ──────── */
.cal-picker-search { width:100%; border:1px solid var(--input-bd); background:var(--input); border-radius:10px; padding:10px 12px; font-size:16px; margin-bottom:10px; box-sizing:border-box; }
.cal-picker-bulk { display:flex; gap:8px; margin-bottom:8px; }
.cal-picker-list { display:flex; flex-direction:column; gap:2px; max-height:min(50vh, 420px); overflow-y:auto; }
.cal-picker-group + .cal-picker-group { margin-top:10px; }
.cal-picker-group-label { font-size:.68rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--label); padding:6px 8px 2px; }
.cal-picker-row { display:flex; align-items:center; gap:10px; padding:10px 8px; border-radius:10px; cursor:pointer; }
.cal-picker-row:hover { background:var(--card2); }
/* The picker only ever renders inside a drawer body-swap — the
   var(--accent) fallback is load-bearing here, not defensive filler (see
   the .cal-btn comment above). */
.cal-picker-row:focus-visible { outline:2px solid var(--primary, var(--accent)); outline-offset:-2px; }
.cal-picker-row--selected { background:var(--primary-tint); }
.cal-picker-check { flex:0 0 20px; width:20px; height:20px; border-radius:6px; border:1.5px solid var(--border); background:var(--card); display:flex; align-items:center; justify-content:center; }
.cal-picker-row--selected .cal-picker-check { background:var(--primary); border-color:var(--primary); color:var(--primary-fg); }
.cal-picker-name { flex:1; font-size:.86rem; font-weight:560; }
.cal-picker-pic-toggle { font-size:.7rem; font-weight:650; border:1px solid var(--border); background:var(--card); color:var(--muted); padding:4px 9px; border-radius:999px; cursor:pointer; }
.cal-picker-pic-toggle[aria-pressed="true"] { background:var(--primary); border-color:var(--primary); color:var(--primary-fg); }
.cal-chiprow { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.cal-person-chip { display:inline-flex; align-items:center; gap:5px; background:var(--card2); border:1px solid var(--border); border-radius:999px; padding:4px 6px 4px 10px; font-size:.76rem; }
.cal-person-chip--pic { background:var(--primary-tint); border-color:var(--primary); color:var(--primary-text); font-weight:650; }
.cal-person-chip button { border:0; background:transparent; color:inherit; cursor:pointer; padding:2px; line-height:1; opacity:.7; }
.cal-person-chip button:hover { opacity:1; }

/* ── Checklist ────────────────────────────────────────────────────── */
.cal-checklist-row { display:flex; align-items:center; gap:8px; padding:6px 0; }
.cal-checklist-label { flex:1; font-size:.85rem; }
.cal-checklist-label--done { text-decoration:line-through; color:var(--muted); }
.cal-checklist-add { display:flex; gap:8px; margin-top:6px; }

/* ── Kabid distinction ────────────────────────────────────────────── */
.cal-scope-note { display:flex; align-items:center; gap:6px; font-size:.74rem; color:var(--blue); background:var(--blue-tint); border-radius:8px; padding:6px 10px; margin-bottom:12px; }
`;
