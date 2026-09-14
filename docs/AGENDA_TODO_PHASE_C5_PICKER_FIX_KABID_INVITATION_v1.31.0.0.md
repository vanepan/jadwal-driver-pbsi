# V1.31 Agenda & To-Do — Phase C5: Participant Picker Fix + Kabid Invitation UX

Reported symptom: the participant picker showed only Evan and Grace — Leo was missing. This phase root-caused that report against real data (not a guess), fixed the actual defect, built the Sarpras/Kabid invitation UX, and proved Kabid calendar visibility, RSVP, and security boundaries end-to-end against real Firebase Auth + RTDB emulators. A second, more consequential defect was discovered during that E2E work — a real Kabid user could never see the Agenda section at all — and is fixed in this same phase.

---

## 1. Root cause of "Leo missing"

Traced the full candidate pipeline: `/userProfiles` + `/customRoles` (Firebase) → `js/agenda/agenda-directory.js#getAgendaCandidates()` (classification) → `agenda-event-drawer.js` / `agenda-task-drawer.js` (picker render).

**Finding:** `getAgendaCandidates()`'s classification logic has no defect — given the same directory snapshot, it always returns every active, non-archived `role==='admin'` user (Sarpras) and every user whose role holds `agenda.kabid.view`/`agenda.kabid.manage` (Kabid). The defect is a **render race**: `agenda-directory.js` already exposes `registerDirectoryChangeListener()`/`unregisterDirectoryChangeListener()`, fired whenever a fresh `/userProfiles` or `/customRoles` snapshot arrives — but neither drawer ever subscribed to it. If the picker was opened before Leo's own profile record (or a slow `/userProfiles` snapshot) had arrived, the picker rendered once, correctly, from an **incomplete** directory, and then never re-rendered when the rest of the data streamed in. Closing and reopening the picker "fixed" it (a fresh `getAgendaCandidates()` call), which is exactly the intermittent, hard-to-pin-down symptom reported.

I cannot access real production `/userProfiles` data, so I cannot certify that *this specific* incident was this exact race rather than, say, a genuinely missing/deactivated record for Leo that day — but this is the only defect the code contains, it exactly reproduces the reported symptom (present-but-late data silently dropped from view), and it is now fixed and covered by both a DOM-harness regression test and a real emulator-backed E2E test (below).

## 2. Fix — exact files/behavior

**`js/agenda/agenda-event-drawer.js`, `js/agenda/agenda-task-drawer.js`** (each independently, same pattern):
- New `onDirectoryChange()`, gated on `_pickerOpen`, patches only the picker list via the already-existing, focus-safe `rerenderPickerListOnly()` — never a full-drawer re-render (this codebase's Focus-Preserving Render Pattern: a full re-render while a user might be typing destroys/recreates inputs and steals focus).
- `registerDirectoryChangeListener(onDirectoryChange)` before `openDrawer(...)`; `unregisterDirectoryChangeListener(onDirectoryChange)` in `openDrawer()`'s `onClose`.

Smallest lifecycle-safe fix: no new state machine, no store rewrite, reuses the module's own existing pub/sub and existing safe re-render helper.

## 3. Kabid invitation — exact implementation

`js/agenda/agenda-participant-picker.js#renderPickerHTML()` now groups the **same, unmodified** `candidates` array (still `getAgendaCandidates()`'s data-driven output, still tagged `scope: 'sarpras_shared'|'kabid'`) into two headed sections — **SARPRAS** and **KABID / UNDANGAN** — plus an "other" bucket for any future third scope. Search filters the flat list *before* grouping, so a match in either group still surfaces it; an empty group is omitted rather than shown blank. No new candidate source, no new Custom Role, no hardcoded role id or names — purely a rendering concern layered over data the directory already produced. New CSS: `.cal-picker-group`, `.cal-picker-group-label` in `js/agenda/agenda-styles.js`.

## 4. Calendar visibility — the mechanism

No duplication, no second event object, no client-side copy. One canonical record at `/agendaEvents/{eventId}`, `scope: 'sarpras_shared'`, Kabid represented as an ordinary entry in `participants`. `functions/src/agenda/onAgendaEventIndexSync.js#computeVisible()` **already** (pre-existing, unmodified) builds its `scopes` Set from the record's own scope **plus** `resolveUserScope()` for every organizer/participant — so a Kabid participant on a `sarpras_shared` event causes the trigger to also write `agendaEventsByScope/kabid/{eventId}` and `agendaEventsByUser/{kabidUsername}/{eventId}`, alongside the normal `sarpras_shared` index rows. `js/agenda/agenda-store.js`'s existing subscription to every scope in `readableScopes()` (already includes `'kabid'` for a Kabid session) then surfaces the event through the ordinary listener path — same code, same store, same UI, for both Sarpras and Kabid viewers. Verified empirically against the real RTDB emulator (Cloud Functions triggers invoked directly via `.run()`, this repo's established convention — see Test Plan below) and via the real UI (Kabid's own Agenda list and Calendar/Week view). **No changes were made to `onAgendaEventIndexSync.js`, `scopeClassifier.js`, or `agenda-store.js`** — the existing architecture already does this correctly.

## 5. A second, more serious defect found and fixed

Building the real Kabid-session E2E (§13/§14) surfaced a defect the picker-level fix does not touch: **a real Kabid (Custom-Role) session could never see the Agenda & To-Do section at all**, on any device, no matter how long it waited — not a race, a permanent denial.

**Root cause:** `js/role-management/custom-roles-store.js#initCustomRolesStore()` subscribes to the **entire** `/customRoles` collection. `database.rules.json`'s `.read` on that collection is `admin || developer` only (a *deliberate*, separately-tested boundary — `scripts/rtdb-emulator/custom-roles-collection-read-check.mjs` exists specifically to keep it that way, to stop RTDB's downward cascade from leaking archived Custom Role records to a wider audience). A Kabid session is neither admin nor developer, so this subscription is **permission-denied** for their own session — meaning `permission-service.js#can('agenda.kabid.view'|'agenda.kabid.manage')` can never resolve true for a Kabid user checking their *own* grant, even though the exact same check correctly returns true when an *admin* looks up a Kabid colleague (admin's collection read succeeds). This is why the picker, PDF identity transform, and every other consumer of the generic Custom Role classification already worked correctly for *other people's* view of Kabid — only the Kabid user's own session-gate was broken.

**Fix (two files, minimal, additive-only):**
- `js/auth.js#_hydrateFromFirebaseUser()`: captures `agendaKabid` from the already-fetched ID-token claims (`res.claims.agendaKabid`, minted by `functions/src/auth/verifyPin.js#deriveExtraClaims()` — unmodified, already correct) onto `getCurrentUser()`'s session object. No new network call: the token is already being fetched for the `role` claim on the very same line.
- `js/agenda/agenda-permissions.js`: `canViewKabidAgenda()` and `canManageKabidAgenda()` now OR in `getCurrentUser()?.agendaKabid === true` alongside the existing `can('agenda.kabid.*')` check. `canSeeAgendaWorkspace()` (the actual gate that shows/hides the whole section) was itself calling `can('agenda.kabid.view')` directly instead of the wrapper — changed to call `canViewKabidAgenda()` so it inherits the fix.

**Why this doesn't weaken security:** the claim is the *same* signal `database.rules.json`'s own server-side scope-bypass already uses for both read and write (`auth.token.agendaKabid === true`), and that Rule already conflates view/manage into one boolean — the client-side gate is now exactly as granular as the enforcement it gates, not looser than it. The `/customRoles` collection-read restriction itself is untouched — this fix routes around the need for it (a Kabid session never needs to read the whole collection to learn its own grant) rather than widening it.

**Known, accepted, documented limitation (not fixed, out of scope):** a Kabid session's *own* picker still cannot classify an unrelated *second* Kabid user as a candidate (only Sarpras `role==='admin'` candidates), because that classification needs the same collection-level `/customRoles` read the claim can't substitute for (the claim is a boolean, not a role roster). No required scenario in this phase depends on one Kabid inviting another Kabid.

## 6. Security — exact Rules/authorization behavior

No Rules file was changed. `database.rules.json`'s existing model was re-verified, not altered:
- Read: participant/organizer membership, OR `scope==='sarpras_shared' && (role==='admin'||adminEquivalent)`, OR `scope==='kabid' && auth.token.agendaKabid===true`.
- Write (event root): organizer-only on create; organizer/PIC/scope-bypass on update; RSVP is a narrow, separately-declared `participants/$uid` grant (self only, 3-outcome vocabulary, cannot smuggle other field changes — proven by the multi-location-update piggyback tests).
- No admin blanket bypass exists or was added for Kabid data; no broadened participant write permission; no client-side filtering of privately-loaded data — every negative case below is a server-side `permission_denied`, not a client-side hide.

## 7. E2E — exact results

**`scripts/agenda-live-e2e-check.cjs`** (real headless Chromium + real Firebase Auth emulator + real RTDB emulator + real, unmodified `database.rules.json`; zero mocks) — extended this phase with phases **[17]–[20]**, all against freshly-added real identities `e2eLeo` (Sarpras) and `e2eKabid` (Custom Role `e2eKabidRole` holding `agenda.kabid.view`+`agenda.kabid.manage`, `agendaKabid:true` claim minted the same way every other identity's claims already are in this suite):

- **[17]** Sarpras organizer → real picker shows Leo + Kabid grouped under SARPRAS / KABID·UNDANGAN → selects both (Leo as PIC) → Saves. Verified: exactly one `/agendaEvents` record, `scope` still `sarpras_shared`, Leo `isPic:true`, Kabid `isPic:false`. Real trigger run produces one audit row, `agendaEventsByUser` for **both** Leo and Kabid, `agendaEventsByScope/sarpras_shared` **and** `agendaEventsByScope/kabid`, and an H1 reminder row.
- **[18]** Fresh browser context, real `signInWithToken()` as Kabid → the section renders at all (the §5 fix) → the **same** event (same title) appears in Kabid's own real Agenda list, then in real Calendar/Week view → opens it → gets the same RSVP block any participant gets, no PIC badge (correct, not invited as PIC) → clicks Hadir → RTDB `participants.e2eKabid.status` becomes `accepted`.
- **[19]** Kabid's real session attempts `readNode()` on the original, unrelated `sarpras_shared` event they are not part of → `status: 'denied'`.
- **[20]** Kabid creates their **own** event (§6) → create-drawer auto-defaults to (and only offers) `scope:'kabid'`, no scope selector shown → lands as one record, `organizerUsername: e2eKabid`. A fresh session as `e2ePic` (unrelated Sarpras admin, not a participant) attempts `readNode()` on it → `status: 'denied'`.

Screenshot evidence: `scratch/agenda-v1.31-kabid-agenda-visible.png` (Kabid's real Agenda list showing the cross-scope event with "PIC: E2E Leo").

**Result: 40 passed, 0 failed, exit 0.**

## 8. Tests — exact counts (§12 A–L mapped)

| Suite | Result | Covers |
|---|---|---|
| `scripts/agenda-workspace-render-check.mjs` | **49/49** (39 pre-existing + 10 new `[G.2]`) | A, B, C, D, E, F, G (DOM-harness level) |
| `scripts/agenda-live-e2e-check.cjs` | **40/40** (26 pre-existing + 14 new) | A, B, C, G, H, I, J, K, L (real emulator level) |
| `scripts/agenda-rules-security-check.mjs` | **80/80** (unchanged) | L (server-side) |
| `scripts/agenda-date-range-check.mjs` | 34/34 | regression |
| `scripts/agenda-pdf-view-model-check.mjs` | 31/31 | regression |
| `scripts/agenda-pdf-render-check.mjs` | 11/11 | regression |
| `scripts/agenda-view-model-check.mjs` | 19/19 | regression |
| `scripts/agenda-lifecycle-check.mjs` | 16/16 | regression |
| `npm run test:rtdb-emulator` | 20/20 suites, 0 failed | regression (incl. the pre-existing `custom-roles-collection-read-check.mjs`, re-confirming the boundary §5's fix deliberately routes around rather than widens) |
| `npm run test:functions-emulator` | 10/10 suites, 41/41 in the Agenda trigger suite | regression |
| `scripts/workspace-foundation-check.mjs` | 24/24 | regression (Home workspace shell, all roles) |
| `scripts/executive-dashboard-dom-check.mjs` | 37/37 | regression |
| `scripts/notifications-panel-check.mjs` | 22/22 | regression |
| `scripts/permission-service-check.mjs` | 70/70 | regression (permission engine — directly touched this phase) |
| `scripts/canAccessModule-check.mjs` | 5/5 | regression (role→module gating — adjacent to the auth.js change) |
| `scripts/smoke-boot.mjs` | PASS, 0 fatal errors, `version.json: 1.30.14.6` | regression + version freeze confirmation |

No unexplained failures anywhere in this sweep.

## 9. Visual QA — exact surfaces

- Desktop grouped picker (light): `scratch/agenda-desktop-picker-grouped-kabid.png`
- Desktop grouped picker (dark): `scratch/agenda-desktop-picker-grouped-kabid-dark.png`
- Mobile 390px grouped picker: `scratch/agenda-mobile-390-picker-grouped-kabid.png`
- Real Kabid session, real Agenda list, real cross-scope event: `scratch/agenda-v1.31-kabid-agenda-visible.png`

All confirm: SARPRAS group then KABID / UNDANGAN group, no clipping, no horizontal overflow, checked/PIC state visible, Kabid pill visually distinct, search box present and functional.

## 10. Production safety

No deploy. No production writes. No Rules changes deployed (none were even made — `database.rules.json` is untouched this phase). No Functions deployed. No production feature flags touched. `js/app.js`, V2/Sarpras Intelligence, odometer, and assignment-reminder code paths were not touched. `APP_VERSION` confirmed still **1.30.14.6** via `smoke-boot.mjs`'s own version-file read.

## 11. Git

No commit. No push. Working tree changes this phase, on top of the pre-existing uncommitted V1.31 tree: `js/auth.js`, `js/agenda/agenda-permissions.js`, `js/agenda/agenda-participant-picker.js`, `js/agenda/agenda-event-drawer.js`, `js/agenda/agenda-task-drawer.js`, `js/agenda/agenda-styles.js`, `scripts/agenda-live-e2e-check.cjs`, `scripts/agenda-workspace-render-check.mjs`, plus new screenshots under `scratch/`. Awaiting review checkpoint.

## 12. Final status

**READY FOR FINAL RELEASE QA.**
