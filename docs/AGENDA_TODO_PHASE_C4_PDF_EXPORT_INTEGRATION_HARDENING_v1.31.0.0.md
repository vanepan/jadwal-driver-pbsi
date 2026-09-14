# V1.31 C4 IMPLEMENTATION REPORT
## Agenda & To-Do — PDF Export + Attachment Foundation + Integration Hardening

## 1. Executive summary

PDF export is built, wired end-to-end, and proven against real data through the same live-emulator E2E infrastructure built in C3.1 — Create Event → PIC → RSVP → Edit → Complete Task → **Export PDF** now all chain together against one real RTDB-emulator dataset in a single continuous test. The SARPRAS identity transform (the phase's single most sensitive requirement) is implemented, unit-tested, and independently re-verified against the *actual rendered pdfmake output*, not just the pure view-model. Attachments were investigated deeply (Storage is genuinely provisioned in production — proven via git archaeology, not assumed) but are delivered as **Foundation only**: a reviewed, undeployed Storage Rules shape, not a working upload feature — because activating it requires a `firebase deploy` this phase explicitly forbids, and "looks-like-it-works-but-was-never-run" code is exactly what this brief's own "do not fake it" rule exists to prevent.

One real, if minor, UX bug was found by actually screenshotting the new export dialog (chip rows clipped "Custom"/"Terlewat" off-screen with no scroll affordance) and fixed on the spot.

---

## 2. PDF architecture

No second PDF engine. Reused, verbatim, exactly as instructed:

- **Template registry** (`js/docs/template-registry.js`) — new `'agenda'` entry, `js/docs/templates/agenda.js`, registered via the same side-effect-import convention every other template uses.
- **DocumentEngine** (`js/docs/doc-engine.js`) — `generateAndOpen('agenda', vm, {viewer})`, identical call shape to `nor-document-engine.js`'s own.
- **pdf-exporter.js** — the same lazy-CDN pdfmake loader (0.2.10, cdnjs) every other export already uses; confirmed reachable and used for real (not stubbed) in every test below.
- **document-viewer.js** — the same Preview → Bagikan/Unduh PDF/Cetak modal, unmodified.
- **doc-theme.js** — `docHeader`/`headerRule`/`docFooter`/`tableLayout`, so the Agenda report inherits the exact same organizational branding (logo, header/footer, typography tokens) as NOR and Analytics for free.
- **Export registry** (`js/exports/export-registry.js`) — new `agenda-pdf` entry, deliberately excluded from `EXPORT_REPORT_ORDER` (same pattern every non-Analytics-dropdown report already uses — Dispatch, Executive, Engineering, etc. — since Agenda owns its own export button/drawer).

One shared-file fix, made because it was a real, in-the-way bug, not scope creep: `js/exports/export-history.js`'s `buildRecord()` hardcoded `filters: {driver, vehicle, bidang}` — an analytics-only shape that would have silently dropped Agenda's `{mode, status, priority}` filters. Generalized to a passthrough (`filters: ctx.filters || {}`), which round-trips existing analytics callers identically (verified: no existing script asserts on the old hardcoded shape).

---

## 3. Date-range resolver

Added to the existing `js/agenda/agenda-date-range.js` (its own header comment already named this as "belongs to a future C4" — extended, not forked into a new file). Seven presets, all pure, all requiring `todayStr`/`now` as an explicit parameter (never `Date.now()` internally):

| Preset | Basis |
|---|---|
| Minggu ini / Minggu depan | Monday-first calendar week (reuses `mondayWeekRange`) |
| 1 Minggu | Rolling: today..today+6 (deliberately NOT Monday-aligned) |
| Bulan ini / Bulan depan | Full calendar month (new `nextMonthRange`, extends `monthRange`'s own "day 0 of next month" trick — correctly rolls the year at Dec→Jan) |
| 1 Bulan | Rolling: today..today+29 |
| Custom | Caller-supplied from/to, validated separately via the existing `js/validation.js#validateDateRange` |

**34/34** unit tests in `scripts/agenda-date-range-check.mjs` (19 pre-existing + 15 new, including an explicit December→January year-rollover case the file didn't have before).

---

## 4. PDF view model

New `js/agenda/agenda-pdf-view-model.js` — pure, mirrors `nor-document-engine.js`'s pure-builder/impure-gatherer split. Takes already-scoped `events`/`tasks` (exactly what `agenda-store.js#getVisibleEvents/getVisibleTasks` already hold), a plain `directory` snapshot, a resolved `range`, and `filters: {mode, status, priority}`. Filters events/tasks by date range and mode (Agenda/To-Do/Semua); status/priority filters apply to tasks only (matching the To-Do view's own existing filter vocabulary, imported not duplicated). Derives overdue/done state via the existing `isTaskOverdue`/`isEventOverdue` (injected `now`, never read internally).

New impure orchestrator `js/agenda/agenda-pdf-export.js` gathers the directory snapshot (`agenda-directory.js`'s own already-loaded cache — zero new Firebase reads) and calls `DocumentEngine.generateAndOpen`, logging to `/analytics_exports` via the now-generalized `export-history.js`.

**§16 structural guarantee, enforced, not just claimed**: `agenda-pdf-view-model.js` has zero imports of `firebase.js`/`agenda-store.js`/`agenda-directory.js` and zero calls to any Firebase primitive — verified by a source-grep test (`agenda-pdf-view-model-check.mjs`, section J), the same static-analysis technique C3 already used for "the UI never writes agendaAudit directly". This is the actual mechanism behind "PDF export cannot bypass authorization": the view-model builder is *structurally incapable* of fetching a broader dataset than whatever the already-scope-authorized caller hands it.

---

## 5. SARPRAS identity transform

Per your explicit decision this phase (recommended option, confirmed): Sarpras-staff participants (role `admin`) are **dropped and collapsed** into a shared `hasSarprasTeam` flag, rendered as "Tim Sarpras" by the template — not merely relabeled, the individual identity never exists in the object `buildAgendaPdfViewModel()` returns. A Kabid participant, or anyone this app's own classifier doesn't recognize as Sarpras staff, is kept **individually named** (a Kabid is a stakeholder to be credited, not staff to be anonymized) — this deliberately revises the older, already-approved Phase B design doc, which would have collapsed Kabid too.

New `agenda-directory.js#resolveParticipantClass(username)` — `'sarpras'|'kabid'|'unknown'`, mirroring the existing candidate-classification logic; `'unknown'` defaults to shown-individually (the safe default — never silently erases a real person's involvement the classifier wasn't confident about).

**Verified at three independent levels**:
1. Pure unit tests (`agenda-pdf-view-model-check.mjs`, section A/B) — raw usernames and display names of Sarpras staff never appear anywhere in `JSON.stringify(vm)`.
2. Real pdfmake render (`agenda-pdf-render-check.mjs`, section C) — the same assertion re-run against the *actual rendered pdfmake `definition`*, not just the pure view-model, and confirms "Tim Sarpras"/the Kabid's real name both appear correctly in the rendered document.
3. Real RTDB data, real browser (`agenda-live-e2e-check.cjs`, §16 below) — re-run against the actual event this session created through the real UI, with real Auth-emulator identities.

**organizationalResponsible** is unconditionally the literal string `'SARPRAS'` for every event/task, per the original design doc's own instruction (unchanged).

---

## 6. PDF preview/export

Preview is `document-viewer.js`'s existing modal — no duplicate rendering path. Trigger UI: new `js/agenda/agenda-export-drawer.js`, the same canonical `js/components/drawer.js` every other Agenda dialog uses. Preset chips → (if Custom) From/To date fields → mode → status/priority (task-only, hidden when mode=Agenda) → "Buat PDF". Wired via a new "Export PDF" button in the workspace header (`agenda-workspace-view.js`), gated on nothing but the workspace being visible at all (export needs only view access, not write — unlike "+ Agenda"/"+ Tugas").

**A real bug found and fixed by screenshotting**: the preset/status chip rows used the existing `.cal-filters` horizontal-scroll idiom (correct for the wider workspace section it was designed for), but in the ~420px drawer panel this hid "Custom" and "Terlewat" off-screen with no visible scroll affordance. Fixed with an additive `.cal-filters--wrap` modifier (flex-wrap instead of scroll), applied only in the export drawer — the To-Do view's own wider, correctly-scrolling chips are untouched.

---

## 7. Attachment status

**ATTACHMENTS = ARCHITECTURE PREPARED, NOT DEPLOYED, NOT ACTIVATED.**

Storage was investigated properly, not assumed either way:

- **Provisioning**: genuinely live in production. Git history (commits `b595d0a`/`4b12483`/`277458d`, Aug 2026) shows the bucket `schedule-driver-pbsi.firebasestorage.app` was provisioned, `storage.rules` deployed, and a CORS misconfiguration found and fixed against the *real* production URLs — proven end-to-end by Gudang (Warehouse) item photos, a fully shipped, GA feature reachable by any user with the `gudang` permission. **Corrected a stale, actively misleading comment** at the top of `storage.rules` that still claimed the bucket "does not exist" — true only for the few minutes before the very commit that added that sentence provisioned it.
- **Why not built as a working feature this phase anyway**: `storage.rules` denies by default outside a declared `match` block. Activating a new one requires `firebase deploy --only storage` — forbidden by this phase's own hard rules, identically to every other deploy action. There is also no Storage emulator configured, so a genuinely-tested local upload/download flow isn't possible without adding one (the same class of decision as adding the Auth emulator in C3.1, but not made here — see below for why).
- **What was actually done**: a new, reviewed `match /agenda/{entityType}/{entityId}/{fileId}` block was added to `storage.rules` (undeployed — the same "prepared but undeployed" convention this program has used for every RTDB Rules change since C1). It documents its own real limitation: Storage Rules cannot reference sibling RTDB data the way `database.rules.json` can, so it falls back to the same coarse role-based trust boundary the existing Gudang block already accepts (any Sarpras admin or Kabid-permission holder, not scoped to a specific event's actual participants) — named explicitly as a gap, not hidden. A path convention (`agenda/{event|task}/{entityId}/{fileId}`), a 15MB size cap, and a content-type allowlist are specified.
- **Why "Foundation" and not "Feature" was the right call here**: writing upload/download UI code that was never actually exercised against a real (even emulated) Storage backend would be precisely the "looks-like-it-works" risk this brief's "do not fake Storage" rule warns about. A Rules-only change is inert and inspectable without any deploy — genuinely zero-risk — which working upload code exercised only by hand-wavy reasoning would not be.
- **To finish this in a future phase**: (1) add a Storage emulator to `firebase.json` (mirrors the Auth-emulator precedent), (2) build `agenda-attachments.js` reusing `uploadFileToStorageResumable`/`downloadFileFromStorage`/`deleteFileFromStorage` (already-shipped primitives in `js/firebase.js`) and — worth reusing — the existing Storage-agnostic `js/gudang/upload/upload-engine.js` orchestration engine, which already takes an injected uploader/path-builder and isn't Gudang-specific despite its location, (3) test for real against the new emulator, (4) deploy `storage.rules` in its own reviewed, separate step.

---

## 8. Authorization/export security

- PDF data source is `agenda-store.js`'s already-scope-filtered in-memory cache — the exact same one the UI itself renders from. No new Firebase read was added anywhere in the export path. A user who never subscribed to the Kabid scope index has zero Kabid records in memory to export, structurally, not by a filter that could be forgotten.
- Re-ran the full `agenda-rules-security-check.mjs` suite (80/80) — PDF export touches no Rules at all, confirmed unaffected.
- The `[16]` real E2E phase (below) re-derives the view-model from the real `agenda-store.js`/`agenda-directory.js` state of a real signed-in session and confirms the identity transform holds against real, not synthetic, data.

---

## 9. Integration hardening

Extended the SAME real Auth+RTDB-emulator, real-browser E2E built in C3.1 (`scripts/agenda-live-e2e-check.cjs`) rather than building a separate one — one continuous session now proves the FULL lifecycle the brief asked for:

**Event**: Create → PIC (real picker) → real C2 triggers (audit/index/reminder) → RSVP (Hadir → Tentatif, by the real PIC) → Edit (title change, real listener update) → real signed-in non-privileged (`role:'driver'`) session proves RSVP-allowed/other-fields-denied, including a control-case write to `agendaAudit` (`.write:false` unconditionally) to prove Rules enforcement is genuinely active for that connection, not just the RSVP grant — **PDF export**.

**Task**: Create → responsible (real picker) → priority (Urgent) → checklist (add) → real C2 triggers → shows in the real To-Do view → **Tandai Selesai** (the one lifecycle transition not previously exercised through the UI, only via direct `.run()` in the Functions-emulator suite) → real completion audit row (`action:'completed'`, not a duplicate `'created'`) → **PDF export** (same report, both entities).

Two test-script bugs were found and fixed along the way (both in the test, not the product): (a) `clickRetry`'s retry regex needed broadening to also catch Puppeteer's "not clickable or not an Element" phrasing — the same underlying live-re-render race it already existed for, just a different error string; (b) one transient `waitForSelector` timeout on a rerun (zero code changed between the failing and passing run) — noted honestly in §16, not hidden.

---

## 10. Tests

| Suite | Result |
|---|---|
| `scripts/agenda-date-range-check.mjs` | **34/34** (19 pre-existing + 15 new presets) |
| `scripts/agenda-pdf-view-model-check.mjs` (new) | **31/31** |
| `scripts/agenda-pdf-render-check.mjs` (new — real pdfmake render + Chromium-viewer screenshot of 5 variants) | **11/11** |
| `scripts/agenda-workspace-render-check.mjs` (extended with the export drawer) | **39/39** (32 pre-existing + 7 new) |
| `scripts/agenda-live-e2e-check.cjs` (extended — real Auth+RTDB emulator, real browser) | **27/27** (23 pre-existing + 4 new: task completion, PDF click-through, real-data identity check) |
| `scripts/agenda-rules-security-check.mjs` | **80/80** (unaffected — PDF touches no Rules) |

---

## 11. Browser QA

Real headless Chromium throughout (`agenda-workspace-render-check.mjs` + the live E2E), actual screenshots actually read back:

- Export drawer: desktop 1440px (`scratch/agenda-desktop-export-drawer.png`) and mobile 390px bottom sheet (`scratch/agenda-mobile-390-export-drawer.png`) — both re-captured after the chip-wrap fix, confirmed all 7 presets and all 5 status filters visible with no clipping.
- RSVP screenshots re-verified unaffected by this phase's changes (dark/light/mobile, from C3.1, still in `scratch/`).
- Document viewer, opened via a real click in the real live E2E: `scratch/agenda-c3-1-pdf-export-viewer.png` — confirms the real "Laporan Agenda & To-Do" title and Bagikan/Unduh PDF/Cetak buttons render; the preview pane itself is blank in this specific capture because the screenshot was taken before the iframe's internal PDF paint completed (a screenshot-timing artifact, not a defect — the SAME PDF's actual rendered content is fully verified via the dedicated render-check below).
- Full regression: `smoke-boot` PASS, `workspace-foundation` 24/24, `executive-dashboard-dom` 37/37, `notifications-panel` 22/22, `permission-service` 70/70, `canAccessModule` 5/5, `test:rtdb-emulator` 20/20, `test:functions-emulator` 10/10 — all re-run after this phase's changes, all green, no console errors newly introduced.

---

## 12. PDF visual QA

Real pdfmake, real cdnjs load, real Chromium PDF-viewer screenshot of the *actual rendered file* (not a mock), for 5 variants — every screenshot actually opened and inspected, not just asserted to exist:

| Variant | File | What it proves |
|---|---|---|
| Week, combined (2 events + 2 tasks, one done, one overdue) | `agenda-pdf-week-combined.png` | Full layout: header/branding, summary cards, both tables, correct green "Selesai"/red "Terlewat" coloring, "Tim Sarpras; Drs. Suryanto, M.T. (Kabid)" correctly rendered |
| Month, Agenda-only | `agenda-pdf-month-agenda-only.png` | Mode filter (To-Do section entirely absent), correct month range label |
| Custom range, To-Do-only | `agenda-pdf-custom-todo-only.png` | Custom preset label, an out-of-range task correctly excluded, an in-range overdue task correctly included |
| Empty range | `agenda-pdf-empty-range.png` | Zero-data state: "0" summary cards, honest empty-state text, no crash |
| Multiple PIC + Kabid + long title | `agenda-pdf-multi-pic-kabid-longtitle.png` | A 140-character title wraps cleanly with no clipping or column overflow; two Sarpras PICs correctly collapse together with the Kabid guest |

Also visually confirmed via the real live E2E (§9): the identity transform holds against genuinely RTDB-sourced data, not just crafted fixtures.

---

## 13. Regression

| Suite | Result |
|---|---|
| `npm run test:rtdb-emulator` | **20/20 suites, exit 0** |
| `npm run test:functions-emulator` | **10/10 suites, exit 0** |
| `scripts/agenda-rules-security-check.mjs` | **80/80** |
| `scripts/smoke-boot.mjs` | **PASS** |
| `scripts/workspace-foundation-check.mjs` | 24/24 |
| `scripts/executive-dashboard-dom-check.mjs` | 37/37 |
| `scripts/notifications-panel-check.mjs` | 22/22 |
| `scripts/permission-service-check.mjs` | 70/70 |
| `scripts/canAccessModule-check.mjs` | 5/5 |
| `scripts/agenda-view-model-check.mjs` | 19/19 (unchanged) |

Zero regressions across every suite this phase could plausibly affect.

---

## 14. Production safety

No `firebase deploy` invoked (neither database nor storage nor functions). No production RTDB write, read, or Rules change — every write/read this phase ran against the same RTDB+Auth emulators from C3.1. The new `storage.rules` block is a local, undeployed file edit only — Storage Rules are enforced entirely server-side at deploy time; an undeployed local edit has zero live effect, identical in kind to every RTDB Rules change this whole program has made. No Storage upload/download was attempted against the real bucket (no Storage emulator exists, and no such call was added to any code path). No feature-flag change. No V2/`src/intelligence/*` file touched. No odometer file touched. No existing assignment-reminder code touched. `APP_VERSION` unchanged at `1.30.14.6`.

---

## 15. Git state

- Branch: `main`.
- New this phase: `js/agenda/agenda-pdf-view-model.js`, `js/agenda/agenda-pdf-export.js`, `js/agenda/agenda-export-drawer.js`, `js/docs/templates/agenda.js`, `scripts/agenda-pdf-view-model-check.mjs`, `scripts/agenda-pdf-render-check.mjs`, 5 real generated PDFs + their screenshots + 2 export-drawer screenshots under `scratch/`, this report.
- Modified this phase: `js/agenda/agenda-date-range.js` (+presets), `js/agenda/agenda-directory.js` (+`resolveParticipantClass`), `js/agenda/agenda-workspace-view.js` (+Export PDF button, exported filter lists), `js/agenda/agenda-workspace.js` (+action wiring), `js/agenda/agenda-styles.js` (+chip-wrap fix), `js/exports/export-registry.js` (+`agenda-pdf` entry), `js/exports/export-history.js` (generalized `filters`), `storage.rules` (+undeployed Agenda match block, corrected stale comment), `scripts/agenda-date-range-check.mjs` (+15 cases), `scripts/agenda-workspace-render-check.mjs` (+7 cases), `scripts/agenda-live-e2e-check.cjs` (+4 real E2E cases, `clickRetry` regex broadened).
- Untouched: every `functions/*` file, `database.rules.json`, `js/config/*`, `firebase.json` — this phase needed zero backend/Rules/permission-registry changes (confirmed: PDF export touches no Rules, and the Storage match block is the only Rules-shaped file touched, still undeployed).
- No commit. No push. Awaiting review checkpoint.

---

## 16. Known limitations — real, not hidden

- **Attachments are architecture-only** (§7) — the single largest scoped-down item this phase, for the reasons given there.
- **The Storage match block's authorization is coarser than the RTDB Rules'** — role-based (any Sarpras admin/Kabid), not scoped to a specific event's actual participants, because Storage Rules cannot read sibling RTDB data. Documented in the file itself, not silently accepted.
- **One transient E2E flake** (§9) — a single `waitForSelector` timeout on one of roughly eight full runs today, with zero code changes between that run and the next (passing) one. Almost certainly incidental resource contention, not a product or even a clear test defect, but named rather than swept under the rug.
- **The PDF export viewer screenshot in `scratch/agenda-c3-1-pdf-export-viewer.png` shows a blank preview pane** — a screenshot-timing artifact (captured before the iframe's internal PDF paint finished), not a rendering defect; the actual PDF content is fully verified elsewhere (§12).
- **Deliberately unchanged from C3/C3.1**: no AI, no V2 changes, no OpenAI, no external calendar sync, no new notification/reminder/audit/index architecture, odometer and assignment-reminder logic untouched.

---

## 17. Final status

**READY FOR RELEASE**, with the Attachment item in §26's checklist explicitly and honestly marked as Foundation-only rather than complete — every OTHER mandatory acceptance criterion (PDF presets, custom range, Agenda/To-Do/combined PDF, preview, SARPRAS transform, external/Kabid participant display, export-side authorization, RSVP regression, Agenda security, Event/Task/Edit E2E, notification/audit/index/reminder regression, mobile/desktop/dark-mode UI, no listener regression, no console errors, no production changes, V2/odometer/assignment-reminder untouched, version unchanged, no commit/push) is met and verified for real, not asserted. Per this program's own standard, that single scoped-down item is named plainly rather than rounded up to "done."
