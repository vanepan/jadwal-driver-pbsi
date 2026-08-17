# V1 True Redesign — Program Report (Phases 1–12)

**Versions covered:** v1.30.9.13 → v1.30.9.23
**Date:** 2026-08-16
**Source of truth for the target:** sixteen Claude Design mockups, project `fd17d833-e427-4e47-9d89-2808c75c2bbe`
("Design system UI mockups") on claude.ai/design, read via the design MCP — not the prose implementation map
earlier passes were built from.

---

## 1. Executive summary

Twelve phases were run against the actual Claude Design mockups, in the order the gap analysis proposed. The
single biggest finding of the whole program isn't any one visual change — it's that **the gap analysis this
program was approved against was unreliable**, in both directions:

- **Overstated gaps** (App Shell, Admin Home role variants, Warehouse, Overtime, Analytics): claimed missing
  structure that direct code inspection found already correctly built — usually because the gap analysis's
  grep-based investigation checked for an in-content horizontal tab bar and missed that the App Shell's
  persistent left panel (built in Phase 1, but live in the app since v1.14.0) already serves as the
  tab-equivalent for every embedded module.
- **Understated a gap** (Engineering): described as "already implements a kanban-style lifecycle" when the
  actual Work Queue screen was a single flowing card grid with zero column/kanban concept — the prior
  description was conflating the join→start→finish/postpone→verify *state machine* with a literal *board
  layout*.
- **Correctly identified real gaps** (Assignment Board's shape identity/convoy/side-drawer, Vehicle Fleet's tab
  labels, Petty Cash's draft-numbering question, Warehouse's Stock Opname note rule, Overtime's missing
  close-confirmation, Settings' scattered state) — these held up and were the phases' real work.

Every phase re-verified its assigned module against actual code before trusting the gap analysis's rating for
it. That discipline is what surfaced both the overstated and understated cases above.

---

## 2. Phase-by-phase results

### Phase 1 — App Shell (v1.30.9.13)
Gap analysis claimed no icon rail existed anywhere. False: a two-tier rail+panel shell (`initV2Rail()`/
`initV2Panel()`) has been live since v1.14.0, including a mobile mechanism where the same DOM nodes physically
relocate into the drawer — not a second nav tree. Presented the user a choice (reconcile vs. full rebuild); the
user chose full rebuild. Delivered: theme-aware rail (was permanently dark), `accent-subtle` active states
replacing a translucent-tint+bar treatment, and the one genuinely new piece — a 768–1024px tablet tap-to-reveal
panel overlay that did not exist in any form before.

### Phase 2 — Admin Home + role variants (v1.30.9.14)
Partly overstated, partly real. `exec-attention` and `exec-snapshot` already had per-item action buttons and a
5-tile stats strip; genuinely missing were a driver-status list and a vehicle-flags list. Added both as new
widgets (`exec-drivers`, `exec-vehicle-flags`), reusing the certified Vehicle Core reminder pipeline end-to-end
for the latter. Added a net-new `js/utils/vehicle-identity.js` (shape half of vehicle identity — color already
existed per-vehicle). Gave `exec-recommendation` a real session-local Dismiss instead of a fabricated
data-mutating Accept. Bidang/driver Home variants were confirmed already distinct, purpose-built workspaces
(not scaled-down admin views); Engineering's Home widgets were confirmed 100% "coming soon" placeholders and
explicitly scoped out later (see Phase 8).

### Phase 3 — Assignment Board (v1.30.9.15)
Mobile List-view reachability, the passive conflict badge, and the Timeline/List toggle were already shipped —
not built fresh. Added: vehicle shape identity on timeline blocks/legend/List cards (fixing a real defect along
the way — List view's vehicle chip was a hardcoded 4-name CSS map that gave any 5th+ vehicle no color at all); a
supplementary passive corner conflict dot; convoy detection using the safer of two options the mockup itself
named as an open product decision (time+location heuristic, no data-model change); and a genuine side drawer
for assignment detail (reusing the app's existing `.exec-drawer` width convention), scoped to `#modalDetail`
only. Deliberately deferred the mobile "compact timeline" agenda view — the mockup's own build-order notes rank
it last.

### Phase 4 — Vehicle/Fleet (v1.30.9.16)
Confirmed the gap analysis's Class B rating: closest-already-matching module in the app. The existing 5-tab
drawer's tab *set* (Ringkasan/Operasional/Legal & Asuransi/Perawatan/Riwayat + a 6th conditional Prediksi tab)
was inferred from the prose map, not the real mockup. Corrected to the exact required set
(Health/Compliance/Maintenance/Reminders/Timeline) and moved prediction/simulation to always-visible content
below the tabs instead of a 6th tab. Every section-content function is byte-for-byte unchanged.

### Phase 5 — Warehouse (v1.30.9.17)
Gap analysis's "hub-and-drilldown, not a 7-tab shell" claim did not survive inspection: Gudang is one
persistent workspace with all screens reachable via the App Shell's left panel; `gudang-home.js` has no
drilldown-gating navigation, only per-item quick actions. Building a second in-content tab bar would have
reintroduced the "second nav tree" problem Phase 1 eliminated. One real fix: relabeled "Home" → "Catalog"
(display-only; every screen key/id/call site unchanged) to match both the mockup and what the screen actually
is. Found and fixed a stale, unrelated pre-existing regression-check regex (`gudang-foundation-check.mjs`) that
had been silently failing. One real gap confirmed and deferred: Stock Opname's "variance requires a note before
submit" rule does not exist at any layer today, contrary to the mockup's assumption that it already did.

### Phase 6 — Petty Cash (v1.30.9.18)
Cycle-balance-first layout confirmed already correct. The one substantive gap — a true pre-numbering draft
state — was investigated in real depth (traced `generateNor()`'s existing number-allocation structure) but
deliberately **not implemented**: the NOR record shape has locking/cascade semantics built around every
generated NOR always having a real number, and auditing every downstream consumer (PDF/Excel export, history
sort, display) for null-`norNumber` safety was more than this phase's remaining time allowed. This is an
official, audited financial-document numbering system; a wrong move here is worse than a deferred one.

### Phase 7 — Overtime (v1.30.9.19)
Same structural finding as Warehouse: already one workspace, ten destinations via the persistent panel,
matching the mockup's own prose count. No rebuild needed. Investigation surfaced a more consequential gap than
the tab-bar claim: "Tutup Bulan" (Close Month) — a one-way, irreversible action — had **zero** confirmation
step, closing the period on the first click. Fixed with a proper guarded modal stating the concrete consequence,
mirroring the file's own existing Unlock-modal pattern. The underlying `svc.closeMonth()` logic is unchanged.

### Phase 8 — Engineering (v1.30.9.20)
The one phase where the gap analysis *understated* the gap. Built the actual 5-column kanban
(Open/Joined/In progress/Postponed/Verify) — pure read-only grouping of existing status/participant fields, no
new Firebase field. Built the numbered lifecycle stepper in the work-order drawer (confirmed to not exist
anywhere before). Mobile kanban uses horizontal-scroll rather than the mockup's pill-filtered list — a
disclosed simplification. The Phase-2-deferred `eng-tasks` Home widget is scoped out **permanently**: that
role's primary experience is the dedicated Engineering module, not Home.

### Phase 9 — Analytics (v1.30.9.21)
Zero code changes. The panel already has 8 real, working destinations (Driver/Dispatch/Recommendation
Accuracy/Wellness/Prediction/Petty/Executive/Engineering) — a superset of the mockup's 7. "Scenario" and
"Export" aren't separate panel items but are confirmed embedded elsewhere (Scenario inside Prediction by
original design; Export Center as a section within Driver Analytics).

### Phases 10–11 — User/Role Management + Notifications (v1.30.9.22)
Fast spot-check rather than a full re-investigation, since the gap analysis explicitly flagged these two as
"confirmed by direct comparison, not assumption" — a higher-confidence signal than its other verdicts. Spot
checks corroborated both findings. Zero changes made.

### Phase 12 — Settings (v1.30.9.23)
Confirmed the real gap: Konfigurasi lands on User Management with Global Config as one section inside it;
Engineering and Petty Cash each keep separate settings screens; `/feature_flags` is still read-only from the
client. Deliberately **not built** this phase: consolidating three independently-built settings screens is a
cross-module refactor with real regression risk under time pressure, and a feature-flag toggle UI is a
security-scoped decision (these flags gate real production behavior, including the flag this entire redesign
runs behind) that deserves its own deliberately-scoped phase.

---

## 3. What shipped vs. what's deferred

### Shipped (code + verified)
- App Shell: theme-aware rail/panel, tablet overlay (Phase 1)
- Admin Home: driver-status + vehicle-flags widgets, recommendation Dismiss (Phase 2)
- `js/utils/vehicle-identity.js` — new shared vehicle shape-identity utility (Phases 2–3)
- Assignment Board: shape identity, convoy detection, conflict dot, side drawer (Phase 3)
- Vehicle Fleet: corrected 5-tab set, always-visible prediction (Phase 4)
- Warehouse: Home→Catalog relabel + a stale test fix (Phase 5)
- Overtime: guarded period-close confirmation (Phase 7)
- Engineering: 5-column kanban + numbered lifecycle stepper (Phase 8)

### Explicitly deferred (documented, not dropped)
1. **Petty Cash — true pre-numbering NOR draft state.** Needs a dedicated pass that audits every `norNumber`
   consumer (PDF export, Excel export, history sort/display) for null-safety before any record can legitimately
   have `norNumber: null`.
2. **Warehouse — Stock Opname "variance requires a note before submit."** Needs the existing three-state
   (not-yet-counted → counting → done) card interaction model understood in depth first.
3. **Settings — unified shell + feature-flag toggle UI.** The shell is a cross-module refactor; the toggle UI
   is a security-scoped decision needing an explicit answer to "which flags are admin-exposed, what
   confirmation/audit trail does a flip get, who can reach it" before any code is written.
4. **Assignment Board — mobile "compact timeline" agenda view.** Lowest priority per the mockup's own stated
   build order; the existing List view already gives mobile a non-cramped, touch-friendly path.
5. **Engineering — `eng-tasks` Home widget.** Scoped out permanently (not "next phase") — genuinely lower
   priority than every phase that was still ahead when this call was made.

---

## 4. Functional safety

No Firebase RTDB path, permission check, business-logic rule, or data contract was changed anywhere in this
program. Every phase's changes were presentation-layer or additive-navigation only, with two exceptions that
are still purely UI-layer: Overtime's close-confirmation gate (wraps the existing `closeMonth()` call, doesn't
change it) and Engineering's kanban/stepper (pure grouping of existing fields, no new status or transition).

## 5. Verification performed

- `node --check` clean on every touched JS file (final sweep re-run at the end of the program, not just per-phase).
- CSS brace-balance clean on `platform.css`/`style.css`/`engineering.css`.
- Existing regression suites re-run and passing: `workspace-foundation-check.mjs` (24/24),
  `executive-attention-verification-check.mjs` (84/84), `executive-decision-verification-check.mjs` (89/89),
  `gudang-foundation-check.mjs` (64/64, after fixing one pre-existing stale assertion),
  `overtime-closing-engine-check.mjs` (27/27), `engineering-ui-check.mjs` (61/61),
  `engineering-ui-dom-check.mjs` (50/50), `engineering-runtime-check.mjs` (53/53).
- New verification harnesses added this program: `scratch/verify-app-shell-rebuild.js`,
  `scratch/verify-home-phase2-widgets.js`, `scratch/verify-vehicle-identity.mjs`,
  `scratch/verify-timeline-phase3-smoke.js` — Puppeteer/Node checks exercising real render functions with
  synthetic data (this environment has no real Firebase Auth credentials; consistent with this repo's
  established disclosure convention).
- **Not independently verified by this environment:** a live-authenticated, real-browser click-through across
  all twelve phases. That remains the standing limitation this repo's convention requires disclosing rather
  than claiming.

## 6. Recommended next steps

1. A live-authenticated pass (the user's own device, or Claude in Chrome) across the shell, Home, Assignment
   Board, and Engineering kanban — the four phases with the most structural change.
2. A dedicated, scoped pass for each of the five deferred items in §3, in roughly that priority order.
3. A final cross-application visual consistency sweep once the deferred items are resolved, per the original
   gap analysis's own §11 "Final" phase.
