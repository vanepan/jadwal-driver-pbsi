# Sarpras Intelligence V2 — Phase 10, Sprint 10.3: Document Editor

> Scope: let a reviewer correct a composed section before approval, and
> track AI output vs human edit. Method: pure UI wiring against an
> already-complete, already-tested engine (`composer-store.js#editSection`,
> zero real callers before this sprint) — confirmed by real, executed
> verification: a real click-to-edit flow driven in headless Chromium (not
> a direct function call), plus the full existing regression suite
> updated everywhere it encoded "editSection has no caller" as a fact.

---

## Headline finding

**This was genuinely the "purely a UI wiring task, zero engine work
needed" sprint the plan predicted — `editSection()` required no changes
at all — but retiring the `composer-timeline` dormant entry touched more
files than the feature itself.** Three separate check scripts
(`north-star-acceptance-check.mjs`, `nor-composition-check.mjs`,
`knowledge-ownership-check.mjs`) each had hard assertions that
`composer-timeline` stays dormant and that `nor-center.js` still shows
`dormantNote('composer-timeline')` — because those assertions were
correct THEN, and this sprint is precisely the one that makes them wrong.
All three were found by grepping for `composer-timeline` before writing
any code, not discovered by a later test failure.

---

## 1. Document Editor — review-workspace.js

Draft Preview rows (Sprint 10.1) are now inline-editable: each row shows
its current value, who last touched it, and an "Ubah" (Edit) button.
Clicking it swaps the row for a real `<input>` + Simpan/Batal, wired
through the exact `data-act` delegated-click idiom every workspace in this
tree already uses. Saving calls `composer-store.js#editSection(documentId,
field, value, actorId)` — unchanged, first real caller.

**AI-output vs human-edit attribution needed no new contract field.**
`ComposerRevision.editedBy` (Sprint 10.1's own data, `null` for the
initial AI-composed revision, non-null for a human edit) already carries
this per revision — the new `lastEditorOfField(revisions, field)` just
walks the revision history backwards for the most recent Diff that
touched a given field. A section never edited by a human honestly shows
"Disusun AI"; one that has shows "Diedit oleh {editor}" — real data, not
inferred from `isOverridden` alone (which only says THAT a section
changed, not WHO changed it).

**Actor identity** is the SAME intentional placeholder
`knowledge-center.js`'s own governance panel already uses
(`ACTOR_ID = 'evan'`) — not a new shortcut invented for this sprint.
Sprint 10.5 replaces it with a real signed-in identity across this
workspace.

**Deliberately not built here** (scope discipline, not an oversight):
"final approved version" tracking — that's Sprint 10.4/10.5's `status` +
`ReviewDecision` work. Editing-as-Learning-Correction — recording a human
edit as an organizational Correction (the way Knowledge Center's "Request
Changes" already does via `recordCorrection`) is a real, separate,
still-open question, explicitly left open rather than silently assumed
either way (see `north-star-acceptance-check.mjs`'s updated assertion,
§3).

A small CSS addition (`workspace-list-kit.css`): `.wlk-kv-row` gains
`flex-wrap`/`align-items:center` so the new attribution text + Edit button
don't get cramped against 4+ existing flex children, and
`.wlk-kv-row--editing` stacks the input/Save/Cancel row vertically instead
of squeezing them into the same flex row as the (now-hidden) key/value.

---

## 2. composer-timeline — retired, not just edited

`js/v2/dormant-subsystems.js`'s `composer-timeline` entry is removed
(mirroring the file's own established `gap-workflow` precedent — an
activated subsystem must NOT appear in the register, and must have a real
caller outside its own module). A new "PHASE 10, SPRINT 10.3 DISPOSITION"
paragraph is added in its place, following the file's own convention of
keeping the historical narrative (see `correction-log`'s own multi-phase
history in the same file) rather than deleting the record of what changed
and why.

Every `dormantNote('composer-timeline')` call site is removed:
`nor-center.js`'s Dashboard "Draft Terbaru" and Drafts tab empty states
now show an honest, real subtitle ("Draf akan muncul di sini setelah
Generate NOR menghasilkan draf...") instead of a dormancy note that would
now be actively wrong. The now-unused `dormantNote` import is removed
along with the stale "the Composer is officially DORMANT" header comment
it sat under.

`js/v2/README.md` — the layout section's `composer/` line and the "What
this tree still does NOT do" bullet naming `editSection` as caller-less
are both updated/removed; they were the two places this fact was recorded
outside the dormant register itself.

---

## 3. Check scripts updated to match the new reality

Three scripts had hard assertions of the OLD truth; all three now assert
the NEW one, with the reasoning for the flip left in the code, not just
the assertion:

- **`north-star-acceptance-check.mjs`** — `composer-timeline is NO LONGER
  declared dormant` (was: still dormant). The adjacent "zero Learning
  Events" assertion is KEPT (still true — this script never calls
  `editSection`), but its own comment is corrected: the reason is no
  longer "editSection has no caller" (false now), it's "editing-as-
  Correction is a separate, still-unwired mechanism" — an honest,
  narrower claim, not a claim the sprint's own work would otherwise
  contradict.
- **`nor-composition-check.mjs`** Part 2 — rewritten from "still dormant,
  writers list honestly names editSection as dormant" to "no longer in
  the register at all, `getDormant()` returns null."
  17→16 checks (one merged, not fewer things actually verified).
- **`knowledge-ownership-check.mjs`** — mirrors its own existing
  `gap-workflow` ACTIVATED precedent exactly: asserts `editSection` now
  has a real caller under `js/v2/ui/`, asserts the entry is absent from
  `DORMANT`, and asserts `nor-center.js` no longer contains the retired
  `dormantNote()` call.

---

## 4. Verified

**Data layer (Node)** — `composer-foundation-check.mjs`: 44/44, unchanged
(this sprint added no new engine behavior to test — `editSection` itself
was already fully covered before this sprint).

**Registry/architecture (Node)** — all three updated scripts green:
`north-star-acceptance-check.mjs` 38/38, `nor-composition-check.mjs`
16/16, `knowledge-ownership-check.mjs` 56/56.

**Full regression, unrelated subsystems untouched** —
`problem-solving-integration-check.mjs` 30/30,
`conversation-ownership-check.mjs` 77/77, `smoke-boot.mjs` PASS.

**Real browser, no login gate** — `review-workspace-render-check.mjs`
extended: 19/19 (was 14/14). The new scenario is the strongest kind of
proof available in this environment: not a call to `editSection()`
directly, but a real DOM click on "Ubah", typing into the real `<input>`
(a real `input` event, exercising `review-workspace.js#onInput`), and a
real click on "Simpan" — asserting the editor opens, the pre-edit state is
honestly "Disusun AI", the post-save Draft Preview shows the exact
human-typed text, and the attribution flips to "Diedit oleh evan". This is
`editSection`'s first real UI caller, proven live, not asserted from
reading the code.

**Not verified, same limitation as Sprints 10.1–10.2**: the real Settings
→ Power View → Review Workspace click path with a real signed-in user —
still requires production Firebase credentials unavailable in this
environment.

---

## 5. Phase 10 backlog

Sprint 10.4 (Review Workflow) is next. This sprint leaves one explicit,
real open question for it to inherit (not to solve): should editing a
section during review record a Learning Correction, and if so, at what
point — every edit, or only the diff between AI-composed and
human-approved-final at Approval time? Deliberately not decided here.
