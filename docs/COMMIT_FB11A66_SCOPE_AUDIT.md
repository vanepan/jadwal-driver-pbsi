# Scope Audit — Commit `fb11a66` ("feat: complete phase 10 canonical drawer migration")

**Purpose of this document:** `fb11a66` was an intentional **checkpoint
commit**, created to capture several days of accumulated, previously
uncommitted working-tree changes in one save point. Its commit message
names only Phase 10, but the commit itself contains substantially more.
This document records the commit's true scope so future `git blame`,
`git bisect`, and changelog work aren't misled by the message alone.

**This is a documentation-only follow-up.** No history was rewritten, no
commit was amended, no code was reverted, and nothing in `fb11a66` was
changed. Every phase's own work (code, docs, regression evidence) is
preserved exactly as committed — see §6.

---

## 1. What `fb11a66` actually contains

`fb11a66` is a single commit, 251 files changed (+21,530/‑934), on top of
`e7d6b70` (v1.30.11.5). It bundles four distinct bodies of work that had
accumulated in the working tree over roughly four days:

### A. Phase 10 — Canonical Drawer Migration (the commit's namesake)

The actual scoped Phase 10 work, matching
`docs/DESIGN_SYSTEM_PROGRAM_PHASE_10_CANONICAL_DRAWER_MIGRATION_REPORT.md`
§15 "Files Changed":

- **Gudang** item/asset detail drawer → canonical shell
  (`js/gudang/ui/gudang-item-detail.js`, `js/gudang/ui/gudang-center.js`,
  `gudang.css`).
- **Engineering** assignment detail drawer → canonical shell
  (`js/engineering/ui/engineering-drawer.js`,
  `js/engineering/ui/engineering-center.js`, `engineering.css`).
- **Petty Cash** expense detail drawer → canonical shell
  (`js/petty-cash/petty-cash-center.js`).
- Regression coverage: `scripts/gudang-ui-check.mjs` (Part F rewritten),
  `scripts/engineering-ui-dom-check.mjs`.
- **Overtime**: audited, classified READY, **deliberately deferred** —
  not migrated. See
  `docs/DESIGN_SYSTEM_PROGRAM_PHASE_10_OVERTIME_DRAWER_AUDIT.md`.
- `docs/DESIGN_SYSTEM_PROGRAM_PHASE_10_CANONICAL_DRAWER_MIGRATION_REPORT.md`
  itself.

One file is **inseparably mixed** with Phase 8.2 (below):
`scripts/drawer-consolidation-check.mjs` was committed for the first time
in `fb11a66` and contains both the original Phase 8.2 suite (Decision
Replay / Driver Wellness) and the 3 static blocks Phase 10 added on top of
it. There is no earlier committed version of this file to diff against, so
its Phase 8.2 and Phase 10 contributions cannot be attributed hunk-by-hunk.

### B. Previously uncommitted Design System Program work (Phases 4, 8.x, 9)

This work predates Phase 10, was already complete, and was sitting
uncommitted per this project's own memory record ("Phase 8.x sub-series
… UNCOMMITTED"). It rode along in the same checkpoint commit:

| Sub-phase | What it is | Representative files |
|---|---|---|
| **Phase 8.2** — Drawer Consolidation | Decision Replay + Driver Wellness drawers migrated onto the canonical shell; canonical shell itself gained body-scroll-lock + a close-race guard | `js/components/drawer.js`, `js/components/decision-replay-drawer.js`, `js/components/driver-wellness-drawer.js`, `scripts/decision-replay-dom-check.mjs`, `scripts/driver-wellness-dom-check.mjs` |
| **Phase 8.3** — Requests Live Diffing | `js/requests.js` |
| **Phase 8.4** — Pending Workspace Realtime | part of `js/app.js` (`renderPendingWorkspace`) |
| **Phase 8.5** — Navigation Crossfade | `js/shell/command-palette.js`, part of `js/app.js` (`setWorkspace`), `js/workspace/*` |
| **Phase 8.6 / 8.7** — Motion Continuity / Performance | `js/widgets/executive/index.js` (self-commented `Phase 8.7`), `js/widgets/executive/motion-profiles.js` |
| **Phase 9** — Mobile-First | `js/engineering/ui/engineering-views.js` (`data-label` table reflow), `petty-cash.css` (self-commented *"Phase 9 mobile-first audit"*), `overtime.css` + all `js/overtime/ui/*.js` |
| **Phase 4 doc catch-up** | Write-up for already-shipped Phase 4 (Icon Consolidation, commit `3fc2aa7`) whose report doc had never been committed | `docs/DESIGN_SYSTEM_PROGRAM_PHASE_4_REPORT_v1.30.11.3.md` |

Each sub-phase above has its own paired report doc, already present in
`fb11a66` under `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_*` /
`DESIGN_SYSTEM_PROGRAM_PHASE_9_*`.

**Note on Overtime:** Phase 10's own report (§16) correctly states Overtime
was "deliberately untouched" **by Phase 10's own work** — that claim is
still accurate. The Overtime file changes present in this commit belong to
Phase 9 (mobile table/form reflow), not Phase 10.

### C. Separate initiative — Executive Command Center / Phase 7G

Not part of the Design System Program at all. Twelve new docs
(`docs/EXECUTIVE_COMMAND_CENTER_7G1..7G5_*`, `..._DASHBOARD_COMPOSITION_*`,
`..._PREMIUM_PASS_*`, `..._PREMIUM_VISUAL_EXPERIENCE_*`,
`..._REDESIGN_MAP.md`, `..._V2_RICH_REPORT_v1.30.11.6.md`,
`..._VISUAL_EXPANSION_*`), plus login-card changes in `index.html`
(subtitle + "remember me" toggle removed, self-commented `Phase 7G.3` /
`Phase 7G.4`), `js/firebase.js` / `js/auth.js` (auth-persistence),  and
`scripts/executive-outlook-verification-check.mjs`.

`docs/EXECUTIVE_COMMAND_CENTER_V2_RICH_REPORT_v1.30.11.6.md` names a
version (`v1.30.11.6`) that was **never actually cut** — `APP_VERSION` in
`js/config.js`, `version.json`, and `index.html`'s CSS query strings all
still read `1.30.11.5` as of this commit. The doc describes work staged
ahead of a version bump that hadn't happened yet.

### D. Verification evidence

The remaining bulk of the diff (~130 files) is regenerated screenshots and
harness/verification scripts under `scratch/` and
`scripts/__gudang-ui-screenshots/`, tied to the phases in B and C above.
No functional code; no risk.

---

## 2. Why this happened

`fb11a66` was staged from a working tree that had accumulated four days
(2026‑08‑20 → 2026‑08‑24) of separate, already-finished-but-uncommitted
work across multiple phases and at least one unrelated initiative. It was
committed as a single checkpoint rather than as separate per-phase
commits. This document exists to make that fact explicit and durable.

---

## 3. Known documentation discrepancy (not fixed here)

`scripts/gudang-ui-check.mjs`'s Part F header comment (added in `fb11a66`)
claims Gudang's drawer migration was verified end-to-end by, among other
things, a script named `gudang-drawer-migration-check.mjs`. **That file
does not exist anywhere in the repository**, tracked or untracked. This
appears to be a naming slip in the report/comment — the actual coverage
described is provided by `scripts/drawer-consolidation-check.mjs` (the
generic canonical-shell suite) and `scripts/gudang-ui-check.mjs` itself.

No functional or test code was changed to address this — it's a comment
inaccuracy with no coverage gap behind it, since the suites that do exist
already cover the claim. Left as a known note; not in scope for a
documentation-only commit.

---

## 4. What this commit does NOT do

- Nothing here reverts, reorders, or removes any code from `fb11a66` or
  any earlier commit.
- Nothing here amends or rebases history. `fb11a66` remains byte-for-byte
  as originally committed and pushed.
- No functionality was changed "for historical purity" — none of the work
  bundled into `fb11a66` (Phase 10, the Phase 8.x/9 backlog, or the
  Executive Command Center thread) is being unwound or split out.
- This commit does not start Phase 11 or make any other forward-looking
  change.

---

## 5. Where to look for the real detail

This document is an index, not a replacement for the underlying reports.
For full detail on any bucket above, read the paired report doc directly:

- Phase 10: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_10_CANONICAL_DRAWER_MIGRATION_REPORT.md`, `docs/DESIGN_SYSTEM_PROGRAM_PHASE_10_OVERTIME_DRAWER_AUDIT.md`
- Phase 8.2: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_2_DRAWER_CONSOLIDATION_REPORT.md`, `..._DRAWER_MIGRATION_MAP.md`
- Phase 8.3: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_3_REQUESTS_LIVE_DIFFING_REPORT.md`, `..._DIFFING_MAP.md`
- Phase 8.4: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_4_PENDING_WORKSPACE_REALTIME_REPORT.md`, `..._MAP.md`
- Phase 8.5: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_5_NAVIGATION_CROSSFADE_REPORT.md`, `..._MAP.md`
- Phase 8.6: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_6_MOTION_CONTINUITY_REPORT.md`
- Phase 8.7: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_7_MOTION_PERFORMANCE_REPORT.md`
- Phase 8 (base): `docs/DESIGN_SYSTEM_PROGRAM_PHASE_8_MOTION_REPORT.md`
- Phase 9: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_9_CHECKPOINT_REPORT.md`, `..._MOBILE_AUDIT.md`, `..._MOBILE_FIRST_REPORT.md`
- Phase 4: `docs/DESIGN_SYSTEM_PROGRAM_PHASE_4_REPORT_v1.30.11.3.md`
- Executive Command Center / Phase 7G: `docs/EXECUTIVE_COMMAND_CENTER_*.md` (12 files)

---

## 6. Preservation statement

All work represented in `fb11a66` — Phase 10's drawer migrations, the
Phase 8.x/9 backlog, and the Executive Command Center / Phase 7G thread —
is intact in the repository exactly as committed. This audit changes
nothing about it; it only records, in one place, which part of the commit
belongs to which body of work.
