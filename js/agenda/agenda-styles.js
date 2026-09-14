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
.cal-btn:focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
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

.cal-empty { text-align:center; padding:40px 16px; color:var(--muted); }
.cal-empty-title { font-size:.9rem; font-weight:600; color:var(--text); margin-bottom:4px; }
.cal-empty-sub { font-size:.8rem; margin-bottom:16px; }
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

/* ── Calendar grid view ───────────────────────────────────────────── */
.cal-grid-head { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:6px; }
.cal-grid-head span { font-size:.68rem; font-weight:700; text-align:center; color:var(--label); text-transform:uppercase; }
.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.cal-cell { min-height:74px; border:1px solid var(--border); border-radius:10px; padding:6px; background:var(--card); cursor:pointer; display:flex; flex-direction:column; gap:4px; }
.cal-cell:hover { border-color:var(--primary); }
.cal-cell--out { opacity:.4; }
.cal-cell--today .cal-cell-num { background:var(--primary); color:var(--primary-fg); border-radius:999px; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; }
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
.cal-week-row .cal-cell { min-height:120px; align-items:stretch; }
.cal-week-event { font-size:.68rem; background:var(--blue-tint); color:var(--blue); border-radius:6px; padding:2px 5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cal-week-event--task { background:var(--amber-tint); color:var(--amber); }

/* ── To-do view ───────────────────────────────────────────────────── */
.cal-todo-row { display:flex; gap:10px; align-items:flex-start; padding:11px 12px; border-radius:12px; }
.cal-todo-row:hover { background:var(--card2); }
.cal-checkbox { flex:0 0 20px; width:20px; height:20px; border-radius:6px; border:1.5px solid var(--border-bd, var(--border)); display:flex; align-items:center; justify-content:center; cursor:pointer; margin-top:1px; background:var(--card); }
.cal-checkbox[aria-checked="true"] { background:var(--green); border-color:var(--green); color:#fff; }

/* ── Drawer form (content INSIDE js/components/drawer.js's own chrome) ── */
.cal-form-field { margin-bottom:16px; }
.cal-form-label { display:block; font-size:.78rem; font-weight:650; color:var(--muted); margin-bottom:6px; }
.cal-form-label--req::after { content:' *'; color:var(--red); }
.cal-form-input, .cal-form-textarea, .cal-form-select {
  width:100%; border:1px solid var(--input-bd); background:var(--input); color:var(--text);
  border-radius:10px; padding:10px 12px; font-size:16px; font-family:inherit; box-sizing:border-box;
}
.cal-form-input:focus, .cal-form-textarea:focus, .cal-form-select:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-tint); }
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
