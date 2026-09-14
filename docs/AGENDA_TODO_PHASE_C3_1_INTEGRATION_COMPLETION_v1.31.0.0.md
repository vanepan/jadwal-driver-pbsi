# V1.31 C3.1 COMPLETION REPORT
## Agenda & To-Do — Integration Completion: RSVP + Live E2E + Listener Verification

## 1. Execution summary

All three named C3 blockers are closed:

1. **RSVP UI** — built, backed by a new minimal Rules grant, unit-tested (15 new Rules cases) and proven end-to-end through a real authenticated browser.
2. **Live E2E** — a genuinely new capability: the Firebase **Auth emulator** was added to `firebase.json` (previously absent from this repo entirely) and a real headless-Chromium session now signs in against it, loads the REAL `index.html`/`js/app.js`, and drives Create Event → Create Task → Edit → RSVP through the actual C3 UI, with every write landing in and read back from the real RTDB emulator under real Rules enforcement.
3. **Listener lifecycle** — directly instrumented and proven bounded, not just architecturally argued.

Three real, pre-existing bugs were found and root-caused along the way (not papered over) — one fixed (participant entries missing `invitedBy`/`invitedAt`), one worked around in the test with the underlying app-code race left documented (picker doesn't re-render on late directory data), one left as a research note that no fix was needed (an RTDB-emulator namespace mismatch in the *test's own* Admin SDK wiring, not in any product code). Full details in §2–§7.

---

## 2. RSVP

**UI**: `js/agenda/agenda-event-drawer.js` — a "Kehadiran Saya" block (with a PIC badge when applicable) renders above the form whenever editing an event the current user participates in. Three chips — Hadir / Tidak hadir / Tentatif — call a dedicated store function directly, bypassing the whole-form save path entirely. The active state uses distinct green/red/amber tokens (`agenda-styles.js`), matching this module's existing priority-pill idiom. When the viewer cannot write the event (not organizer/PIC/scope-manager), the rest of the form renders `disabled` and the footer collapses to a single "Tutup" action — added because C3's drawer had no such gating at all (a real, adjacent, minimal fix; not scope creep, since RSVP is meaningless to offer next to a form that silently fails to save).

**Data field**: `agendaEvents/$id/participants/$uid/status` — reused the field the C1 schema already reserved (`invited|accepted|declined|tentative`); no schema change.

**Authorization**: no participant could write *anything* before this phase (only PIC/organizer/scope-managers could). A new nested Rules grant at `agendaEvents/$eventId/participants/$uid` allows `auth.uid === $uid` to change only `status`, restricted to the 3 RSVP outcomes, with `isPic`/`invitedBy`/`invitedAt` equality-locked (the same "equality-lock the rest" idiom this file already uses for `users/$username`). Verified (empirically, against the real emulator) that RTDB's cascade grants this even for a narrower leaf-only write (`.../status` alone), because the ancestor rule's `newData`/`data` still reflect the correctly-merged whole-participant object.

**Rules changes**: `database.rules.json` — one new nested block (~25 lines incl. comments) under the existing `agendaEvents/$eventId` node. Nothing else in that file touched.

**Security result**: 15 new cases in `scripts/agenda-rules-security-check.mjs` (own-status write allowed for both ordinary participants and PICs; someone-else's-status denied; isPic/invitedBy/invitedAt-tampering denied; out-of-vocabulary and revert-to-`invited` denied; non-participant self-invite denied; cross-scope allowed; unauthenticated denied; a multi-location piggyback combining a legit RSVP leaf with a forged title change denied in full) — **80/80 passed** (65 pre-existing + 15 new). Independently re-proven through a **real signed-in, non-privileged browser session** in the live E2E (§6).

---

## 3. Real Event E2E

Browser flow, driven through the actual rendered UI, signed in as a real Auth-emulator user (`e2eOrganizer`, custom claim `role:'admin'`) via `signInWithToken()` — the exact function `js/auth.js`'s own production login path calls:

Today → Agenda & To-Do section renders → **+ Agenda** → fill Judul/Tanggal/Jam Mulai/Jam Selesai/Lokasi → open participant picker (real `/userProfiles` read via the emulator) → select `e2ePic` → mark PIC → **Simpan**.

Verified in the real RTDB emulator: `id`, `title`, `date`/`startAt`/`endAt`, `scope`, `organizerUsername`, `createdBy`/`updatedBy`/`createdAt`/`updatedAt`, `participants.e2ePic.isPic === true`. The organizer's own live Firebase listener then rendered the new event into the Agenda list with no manual refresh — **after** the real C2 trigger logic populated the scope index (§4; no Functions emulator runs in this test, matching this repo's own established `.run()`-based trigger-testing convention, so the index has to be produced the same way production's automatic trigger would, just invoked directly).

---

## 4. Real Task E2E

Same browser session: **+ Tugas** → title, due date, priority **Urgent**, responsible = `e2ePic` (real picker), Checklist/Subtugas disclosure opened → add "Siapkan materi" → **Simpan**.

Verified in RTDB: `priority: 'urgent'`, `responsible.e2ePic` present, `checklist[0].label === 'Siapkan materi'`, `scope`/`createdBy`/`updatedBy` correct. Real `onAgendaTaskWrite`/`onAgendaTaskIndexSync`/`onAgendaTaskReminderSync` invoked against the real record (one audit row, `agendaTasksByScope` populated) — then the To-Do view showed the task via the real listener, no manual seeding.

---

## 5. Edit E2E

Same event, reopened via **click the row** (`open-event:{id}`) → cleared and retyped the title → **Simpan Perubahan**. Verified: RTDB title changed, `updatedBy` correct, `updatedAt` strictly advanced, `organizerUsername`/`createdBy` unchanged (immutability held), and the UI showed the new title via the real listener with no manual refresh.

---

## 6. RSVP E2E

**As `e2ePic`** (participant/PIC, real click-through): opened the event, RSVP block showed "Belum merespons" + PIC badge → clicked **Hadir** → RTDB `participants.e2ePic.status → 'accepted'`, chip's `aria-pressed` flips, confirmed in a screenshot → clicked **Tentatif** → RTDB updates to `'tentative'`; verified title/date/location/organizer/startAt/endAt and the *other* participant's (`e2eDriver`) entire entry are byte-identical before/after, and `e2ePic`'s own `isPic` didn't change either.

**As `e2eDriver`** (role `'driver'`, ordinary non-PIC participant, added via one labeled direct Admin-SDK write as test setup — not part of any "real UI" claim): a **genuinely non-privileged** identity's real signed-in browser session called the real exported `setMyRsvpStatus()` directly (this role has no `agenda.view`, so it cannot reach the event through the rendered list — see §13) — **succeeded**, RTDB confirmed. The same session's real exported `updateEvent()` attempting a title mutation — **denied**; RTDB confirmed unchanged. A control case (this same session attempting to write `agendaAudit`, `.write:false` unconditionally for everyone) was also correctly denied, proving Rules enforcement was genuinely active for this specific connection, not just the RSVP grant.

---

## 7. Listener lifecycle

Instrumented by counting every `onValue()` subscription attempt (test-harness-only — a one-line counter inserted into the *served copy* of `js/firebase.js` at the exact `subscribeNode()` call site, never touching the committed file) directly in the served copy of `js/firebase.js` used only by this test.

- Clicking through **Agenda → Kalender → To-Do → Agenda** (real clicks): subscription count unchanged (0 new).
- 5 repeated **`closeAgendaWorkspace()` → `mountAgendaWorkspace()`** cycles (the real exported functions, called directly rather than via a rail-navigation click away from Today — see §13): subscription count unchanged (0 new), staying bounded at 15 for the whole run.

This directly confirms the documented architecture: `initAgendaStore()`'s `_initialized` guard makes remounting a true no-op, and subscriptions are intentionally session-lived — "pause" means the render-callback registration only, never an actual `unsubscribe()`. Not a leak; matches Petty Cash/Overtime/Engineering's own established pattern.

---

## 8. Visual QA

Actually captured **and read back** (not just generated) via the live E2E:

| Surface | File | Verdict |
|---|---|---|
| RSVP block, desktop, light | `scratch/agenda-c3-1-rsvp-desktop-light.png` | Clean; chips legible, PIC badge distinct, hint text correct |
| RSVP block, mobile 390px | `scratch/agenda-c3-1-rsvp-mobile-390.png` | True bottom sheet, no clipping, chips wrap cleanly |
| RSVP block, desktop, dark | `scratch/agenda-c3-1-rsvp-desktop-dark.png` | Correct — **but only after a real bug in this test itself was found and fixed**: the first dark capture showed the whole drawer still light-themed. Root cause: the screenshot was taken with zero settle time after toggling `data-theme`, racing the style recalculation. A 250ms settle fixed it; a follow-up isolated probe (computed-style check, not just a screenshot) confirmed `--surface`/`.drawer` background correctly resolves dark either way — this was a test timing bug, not a product defect. |

No new visual defect found in the actual product code.

---

## 9. Tests

| Suite | Result |
|---|---|
| `scripts/agenda-rules-security-check.mjs` | **80/80** (65 pre-existing + 15 new RSVP cases) |
| `scripts/agenda-live-e2e-check.cjs` (new, via `agenda-live-e2e-run-with-emulator.mjs`) | **23/23**, exit 0 |
| `scripts/agenda-date-range-check.mjs` | 19/19 (unchanged) |
| `scripts/agenda-view-model-check.mjs` | 19/19 (unchanged) |
| `scripts/agenda-workspace-render-check.mjs` | 32/32 (re-verified against the modified drawer) |

---

## 10. Regression

| Suite | Result |
|---|---|
| `npm run test:rtdb-emulator` | **20/20 suites, exit 0** |
| `npm run test:functions-emulator` | **10/10 suites, exit 0** |
| `scripts/smoke-boot.mjs` | **PASS** |
| `scripts/workspace-foundation-check.mjs` | 24/24 |
| `scripts/executive-dashboard-dom-check.mjs` | 37/37 |
| `scripts/notifications-panel-check.mjs` | 22/22 |
| `scripts/permission-service-check.mjs` | 70/70 |
| `scripts/canAccessModule-check.mjs` | 5/5 |

Zero regressions across every suite this phase could plausibly affect.

---

## 11. Production safety

No `firebase deploy` invoked. No production RTDB write, read, or Rules change (every write/read in this phase went through the RTDB **emulator** — the safety-guard canary this repo already established, plus a new equivalent one for the Auth emulator, refuse to proceed unless both `FIREBASE_DATABASE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` point at a real, reachable, loopback emulator). No Functions deploy (Functions emulator never even started — `--only auth,database`). No feature-flag change. No V2/`src/intelligence/*` file touched. No odometer file touched. No existing assignment-reminder code touched. `APP_VERSION` unchanged at `1.30.14.6`.

The one genuinely new capability added is the Auth emulator itself — `firebase.json`'s `emulators` block gained `"auth": {"port": 9099}`, a **local, dev-only** config addition with zero production effect (mirrors the already-existing `database`/`functions`/`ui` emulator entries).

---

## 12. Git state

- Branch: `main`.
- New this phase: `scripts/agenda-live-e2e-check.cjs`, `scripts/agenda-live-e2e-run-with-emulator.mjs`, 3 RSVP screenshots under `scratch/`.
- Modified this phase: `database.rules.json` (+1 nested Rules block), `firebase.json` (+1 line, auth emulator), `js/agenda/agenda-store.js` (+`setMyRsvpStatus`, doc update), `js/agenda/agenda-permissions.js` (+`isEventParticipant`), `js/agenda/agenda-event-drawer.js` (RSVP render/action/read-only gating, `newParticipantEntry()` fix), `js/agenda/agenda-styles.js` (RSVP + PIC-pill CSS), `scripts/agenda-rules-security-check.mjs` (+15 RSVP cases).
- Untouched: every `functions/*` file, `js/app.js`, `js/config/*` — all C1/C2/C3 work, byte-identical to before this phase (this phase needed zero backend/permission-registry changes).
- No commit. No push. Awaiting review checkpoint.

---

## 13. Remaining limitations — real, not hidden

- **The "ordinary participant, read-only-except-RSVP" UI path is real, Rules-correct code, but for a `sarpras_shared`-scope event specifically, no role in the current permission model is both list-visible (`agenda.view`) and write-denied** — every `admin`-role user automatically holds `agenda.manage` (Phase B's own "Sarpras staff = admin cohort" model), so it always wins the scope-bypass branch. The interactive RSVP click-through in §6 therefore used a PIC/admin identity for the UI path, and a genuinely non-privileged `role:'driver'` identity (which cannot see the Agenda list at all) for the direct function-call/security proof instead. The read-only rendering *would* be reachable today for a **Kabid-scope** event via a Custom Role holding `agenda.kabid.view` without `agenda.kabid.manage` — not exercised in this E2E.
- **Listener-lifecycle repeat-mount cycles used the real exported `mountAgendaWorkspace()`/`closeAgendaWorkspace()` functions called directly**, not a literal rail-navigation click away from Today and back — the code path exercised is identical either way (no intervening logic beyond a boolean check in `js/app.js`), but it is not a literal UI rehearsal of "leave Today, return."
- **Two additional real, pre-existing bugs found, one fixed, one left**: (a) **fixed** — `agenda-event-drawer.js`'s picker never set `invitedBy`/`invitedAt` on a newly-added participant (only `agenda-store.js`'s never-called `setEventParticipant()` did), which would have made every picker-added participant permanently unable to RSVP; (b) **left, documented** — `agenda-directory.js`'s Firebase listener does not re-render an already-open picker when its data arrives late (a narrow, pre-existing race, worked around in the test with an explicit wait rather than fixed in product code, since it's outside RSVP's scope and not something this phase's brief asked for).
- **A third, similar-shaped, pre-existing gap noted but not fixed**: `agenda-task-drawer.js`'s picker stores a task's `responsible` entries as a bare `true` rather than the schema's `{assignedBy, assignedAt}` shape (mirrors bug (a) above, for tasks). Nothing in C3.1 depends on this shape, so it was flagged rather than fixed, to keep this phase's diff scoped to what RSVP actually needed.
- **Search debounce race (§16)**: not re-exercised in this live E2E (never typed into search while a live update was in flight mid-session); remains exactly the documented, deliberately-deferred limitation from the C3 report, per this phase's own instruction not to redesign it absent a demonstrated defect.
- **Deliberately unchanged from C3**: no PDF export, no attachment upload, no recurrence UI, no external/non-Sarpras/Kabid participants, native date/time inputs (no `pbsi-datepicker.js`).

---

## 14. Final status

**READY FOR C4.**

Every item in §25's decision rule is met: RSVP works safely and is Rules-enforced (80 unit cases + a real signed-in browser proving both the positive RSVP grant and a negative mutation-denied control); the real authenticated-browser Event/Task/Edit/RSVP E2E all pass against a real RTDB+Auth emulator with real Rules enforcement (not mocks — confirmed genuinely enforced via a control-case write to a `.write:false` node); listener lifecycle is directly, not just architecturally, verified bounded; every regression suite this phase could plausibly affect is green; and no production system was touched. The limitations in §13 are named, scoped, and — per the same standard C3 held itself to — not rounded up to "done."
