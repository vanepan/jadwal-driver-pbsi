# Sarpras Intelligence V2.1 — Knowledge Acquisition Operational Readiness / GA Completion

Consolidated report for the milestone covering: Operational Readiness Audit, NOR Center completion, Archive Center's new Dataset Import Center, the Knowledge Acquisition workflow (Import Session lifecycle + manual-verification bridge), Learning Workflow polish, Organizational Profiles (editable overrides), and the new Pattern Discovery Foundation.

**Status: implementation complete, fully verified, NOT committed.** Pilot gate (`js/config/feature-gates.js`) is unchanged — this milestone is feature-complete GA behind the existing `role:'admin' AND username:'evan'` gate, not a rollout-gate change.

---

## Part 1 — Operational Readiness Audit

Audited every Sarpras Intelligence module for unfinished workflows, disabled features, "Coming Soon" screens, and placeholders.

**Findings (before this milestone):**
1. `nor-center.js:481` — a real, unconditional "Unggah Dokumen — Coming Soon" static block in the Archive tab. **This directly contradicts the prior RC1 report's claim ("zero literal Coming Soon strings remain under js/v2/ui/")** — that claim was false and is corrected by this report.
2. `nor-center.js:401` — `'Generation engine coming soon.'` — a genuine, honest conditional outcome of a real pipeline call (not fake), but worded like a dummy placeholder.
3. `sarpras-intelligence-center.js:42` — `soon: 'Coming Soon'` — dead code; no `ROADMAP` row has used tier `'soon'` since V2.0.18.
4. No file-upload/Storage mechanism existed anywhere in `js/v2/` (confirmed by `js/v2/README.md`'s own prior text).
5. No write path existed anywhere in the live UI — `archive-center.js`/`knowledge-center.js` were 100% read-only, and the Knowledge repository defaulted to `NullRepository` in production (only test scripts activated `MemoryRepository`).
6. No dedicated "Organizational Profiles" tab existed (only a small read-only Dashboard card).
7. No "Learning Queue"/"Correction Queue"/"Candidate Generator" concept existed by name, though the underlying engines (`getCandidateQueue`, `getReviewQueue`, `listCorrectionLog`) did.

**Resolved in this milestone:** items 1–7 above are all fixed (see Parts 2–6). `knowledge-center.js` was audited and confirmed to have **no placeholders** — no changes were made there.

---

## Part 2 — NOR Center Completion

`js/v2/ui/nor-center.js` (modified, full rewrite of render internals):
- Removed the real "Unggah Dokumen — Coming Soon" block; replaced with a real, working upload surface — the same `dataset-import-center.js` controller Archive Center embeds, scoped to `domainType:'nor'` (`lockDomainType:true`), so an upload started here can never be misfiled under another domain.
- Reworded `'Generation engine coming soon.'` to name its real blocking condition (no Approved `nor` Knowledge exists yet). Zero logic change — the same pipeline call, the same `NO_KNOWLEDGE` outcome.
- Added a 7th tab, **"Profil Organisasi"**: read-only computed profiles (10 types, `profile-engine.js`, unchanged), the new editable Profile Override layer, and Pattern Discovery's Candidate Recommendations with a one-click "create override draft from this" action.
- **Migrated onto `js/v2/ui/shared/workspace-list-kit.js`** — the deferred V2.0.19 hardening task. Verified markup-identical before migrating (`nor-center.css`'s `.nc-shell/.nc-tabbar/.nc-tab/.nc-page*/.nc-sec*/.nc-empty*/.nc-row*/.nc-status*` rules are byte-identical in CSS property values to `workspace-list-kit.css`'s `.wlk-*` counterparts). Genuinely NOR-specific markup with no shared-kit equivalent (Quick Actions, Generate NOR card + outcome panel, Timeline dot-rows, Settings card) kept its own local `nc-*` styles.
- Activated `setActiveRepository('memory')` once at mount — the first write-capable path in this workspace needed a real backend; this is session-scoped (in-memory, resets on reload) and only takes effect for the pilot-gated user.

## Part 3 — Knowledge Center Completion

Audited: `js/v2/ui/knowledge-center.js` already has Dashboard / Knowledge List / Review, all real, no placeholders. **No changes made** — confirmed complete in the audit, not invented work.

## Part 4 — Archive Center Completion (Dataset Import Center)

New: `js/v2/ui/dataset-import-center.js` — exported as a factory (`createDatasetImportController`), not a singleton, since both Archive Center (unscoped) and NOR Center (scoped) embed it simultaneously and must not share render state.

Implements:
- **Upload** — the first real `<input type="file">` in this codebase. PDF/DOCX/JSON supported (`SUPPORTED_IMPORT_FORMATS`). JSON is genuinely parsed (`JSON.parse`, deterministic, not inference); PDF/DOCX capture metadata + a human-typed facts form (documentNumber, senderOrigin, value, notes).
- **Import Queue** — every session's current state with the next legal action button, driven directly by `IMPORT_SESSION_GRAPH`.
- **Dataset Browser** — real read over `DatasetSpec`s auto-registered by uploads (filtered to `sourceId === manualFileSource.id`).
- **Import Report** — real `KnowledgeImportReport` numbers (items created/updated/skipped, warnings) plus version history and a diff view.
- **Validation** — all five named rules: duplicate filename, duplicate metadata (content hash, both within sessions and against the Archive), unsupported format, missing metadata, domain mismatch.

Modified `js/v2/ui/archive-center.js`: added a 7th tab ("Impor Dataset"), wired click/input/**change** event forwarding (file inputs need `change`, which the workspace previously never listened for).

## Part 5 — Knowledge Acquisition Workflow (backend)

New Import Session lifecycle (`js/v2/knowledge/datasets/import-session/`): **Uploaded → Pending Review → Approved → Knowledge Imported → Archived**, plus one reject edge (Pending Review → Uploaded, mirroring the Knowledge lifecycle's own reject-to-Candidate precedent) — confirmed by the user as a deliberate, documented deviation from the literal 5-state chain.

- `contracts/import-session-contract.js` — sibling graph to `lifecycle-contract.js` (justified: tracks an uploaded artifact's journey, not a fact's truth-value — the same reasoning that already makes ArchiveRecord a sibling of KnowledgeItem, not a reuse).
- `repository/import-session-repository.js` — Map-backed, append-only, mirrors `archive-repository.js`'s proven shape exactly.
- `import-validation-engine.js` — the five Dataset Validation rules (see Part 4). Deliberately stays `knowledge/`-layer-pure (no `organizational-memory/` import) — the Archive-duplicate check lives in the UI layer instead, the one place both layers are visible, per the codebase's strict one-way dependency rule.
- `import-session-engine.js` — the guarded-transition-only mutator. `markKnowledgeImported()` reuses `dataset-import-service.js#importDataset()` **completely unchanged**.

**Manual-verification bridge** (the user's confirmed product decision — every format genuinely reaches Knowledge Imported via human-sourced content, never fabricated):
- New `manual-file` connector (`knowledge/connectors/manual-file-connector.js`) — matches the exact `{id, version, description, source, fetch}` shape every connector satisfies.
- New `acquisition/manual-import-queue-store.js` — a session-scoped hand-off (not a time-cursor) between "a human just finished the manual-entry form" and the connector's next `fetch()`. This was a deliberate design correction made after reading `acquisition-engine.js`'s real `fetch(since)` signature: a time-cursor could race between two concurrently in-flight sessions; session-scoping cannot.
- `manual-file` registered at source weight **0.95** (`source-weight-contract.js`) — trusted nearly as highly as an explicit correction (1.0), one notch below because the human is transcribing/confirming an external document rather than directly correcting existing Knowledge.
- JSON uploads flow their real parsed content directly into the Knowledge payload (confirmed product decision); PDF/DOCX only ever carry human-typed facts — no OCR, no content parsing of those formats anywhere.

The `Knowledge Imported → Archived` edge is composed in the UI layer (`dataset-import-center.js`): it constructs and writes the real `ArchiveRecord` itself, then calls `markArchived()` (a pure reference write) — `import-session-engine.js` never imports `organizational-memory/` (verified by a static-source check in the test suite).

## Part 6 — Learning Workflow Completion

`js/v2/ui/learning-dashboard.js` — added a 5th tab, **"Antrean"**, giving three already-real data sources their own explicitly-named views (resolves the previously-unnamed "Learning Queue"/"Correction Queue"/"Candidate Generator" concepts):
- **Learning Queue** — `getCandidateQueue()` + `getReviewQueue()` (both already used elsewhere in the tree).
- **Correction Queue** — `listCorrectionLog()`, previously only ever fed into an aggregate metric, now shown as its own literal list.
- **Candidate Recommendations** — Pattern Discovery's output across every registered domain.

No new engine was needed — pure composition over existing imports.

## Part 7 — Organizational Profiles (editable layer) + Pattern Discovery Foundation

**Confirmed product decision:** build a real, persisted, editable Profile Override entity, reusing (not reinventing) the unmodified Knowledge lifecycle for its own draft → review → approve gate.

New `js/v2/knowledge/profiles/overrides/`:
- `contracts/profile-override-contract.js` — `PROFILE_OVERRIDE_TYPE` = the 10 existing computed `PROFILE_TYPE`s (overlay-only: PIN/SUPPRESS/RENAME an already-computed entry) plus 4 genuinely new standalone types (**Business Rules, Document Templates, Section Requirements, Priority Rules** — DEFINE-only, no computed baseline). **Reuses `LIFECYCLE_STATE`/`canTransition`/`isHumanGated` from `knowledge/contracts/lifecycle-contract.js` completely unchanged** — Draft → Candidate → Pending Review → Approved already means exactly what it needs to mean here; no sibling graph was needed for this entity (unlike Import Session).
- `repository/profile-override-repository.js`, `profile-override-engine.js` (createOverrideDraft/promote/submit/approve/reject/rollback, reusing `isValidReviewDecision` from `review-contract.js` unchanged), `profile-override-merge-engine.js` (`getEffectiveProfile()` — merges a computed `buildProfile()` baseline with Approved overrides **only at render time, never persisted** — `profile-engine.js` itself is completely unchanged).

**Pattern Discovery Foundation** (added mid-session per an explicit new architectural requirement): deterministic statistical evidence over Approved Knowledge — recipient/signatory/CC/attachment/approval-chain/vocabulary/paragraph frequency (7 categories reframed **directly from `buildProfile()`'s own already-computed output — zero new statistics**), plus 2 genuinely new small aggregations: rule confidence (reuses `confidence-engine.js#suggestConfidence()` unchanged) and relationship confidence (groups `kind:'relationship'` items by type, averages `confidence`). Every recommendation carries `{supportCount, confidence, affectedDocumentIds}`. **Never writes anywhere, never modifies a Profile automatically** — a human explicitly converts a recommendation into an Override draft, which still requires full review + approval before it affects `getEffectiveProfile()`'s output. No AI, no machine learning model — verified by a static-source check that the engine never calls `create(`/`appendVersion(`.

---

## New files (24)

```
js/v2/knowledge/datasets/import-session/contracts/import-session-contract.js
js/v2/knowledge/datasets/import-session/repository/import-session-repository.js
js/v2/knowledge/datasets/import-session/import-validation-engine.js
js/v2/knowledge/datasets/import-session/import-session-engine.js
js/v2/knowledge/connectors/manual-file-connector.js
js/v2/knowledge/acquisition/manual-import-queue-store.js
js/v2/knowledge/profiles/overrides/contracts/profile-override-contract.js
js/v2/knowledge/profiles/overrides/repository/profile-override-repository.js
js/v2/knowledge/profiles/overrides/profile-override-engine.js
js/v2/knowledge/profiles/overrides/profile-override-merge-engine.js
js/v2/knowledge/contracts/pattern-recommendation-contract.js
js/v2/knowledge/profiles/pattern-discovery-engine.js
js/v2/knowledge/services/import-session-service.js
js/v2/knowledge/services/profile-override-service.js
js/v2/knowledge/services/pattern-discovery-service.js
js/v2/ui/dataset-import-center.js
scripts/import-session-check.mjs
scripts/profile-override-check.mjs
scripts/pattern-discovery-check.mjs
```
(plus this report; `js/v2/ui/{archive-center,knowledge-center,learning-dashboard}.js`, `js/v2/ui/shared/`, `workspace-list-kit.css`, and the `sarpras-workspace-*` scripts were already untracked from the prior, uncommitted V2.0.18–20 session and are carried forward unchanged except where listed below.)

## Modified files

```
js/v2/knowledge/registry/connector-registry.js   — bootstrap manual-file alongside the 11 placeholders
js/v2/knowledge/registry/kind-registry.js        — + 'document_fact' generic kind
js/v2/knowledge/contracts/source-weight-contract.js — + manual-file weight 0.95
js/v2/knowledge/services/index.js                — + importSession, profileOverrides, patternDiscovery namespaces
js/v2/ui/nor-center.js                           — full rewrite (Part 2)
js/v2/ui/archive-center.js                       — + Dataset Import Center tab + change-event forwarding
js/v2/ui/learning-dashboard.js                   — + Antrean tab
js/v2/ui/sarpras-intelligence-center.js          — removed dead 'soon' tier label
workspace-list-kit.css                           — + .wlk-btn/.wlk-form-row/.wlk-select/.wlk-input/.wlk-file-input (first write-capable workspace needed these)
scripts/sarpras-workspace-completion-check.mjs   — +8 checks (Part 8 below)
```

`js/v2/knowledge/connectors/nor-connector.js`, `js/v2/knowledge/language/examples.js`, `js/v2/knowledge/services/review-service.js`, `js/v2/README.md`, `index.html` were already modified from the prior uncommitted session — untouched by this milestone.

---

## Part 8 — Verification

**Node-based regression (22 scripts, zero test-framework, the repo's own `check(name,cond)` convention): 477/477 passed, zero failures.** Includes 3 new scripts (`import-session-check.mjs` 28/28, `profile-override-check.mjs` 18/18, `pattern-discovery-check.mjs` 13/13) and every pre-existing script re-run unchanged (organizational-memory, bootstrap-dataset, machine-learning, knowledge-review-workflow, etc.) — **zero regressions**.

`sarpras-workspace-completion-check.mjs` extended from 25 → **33/33** checks: added no-placeholder coverage for `nor-center.js` and `dataset-import-center.js`, reuse-discipline assertions (Dataset Import Center imports both layers correctly, both workspaces embed the same controller instance rather than a second upload mechanism), a `nor-center.js` "profiles" tab existence check, and a circular-dependency guard extension.

**Real-browser DOM check (`sarpras-workspace-dom-check.mjs`, puppeteer): 76/76 passed.** Every screen and every tab across all 5 workspaces (including the new "Impor Dataset" and "Profil Organisasi" tabs) renders with zero fatal JavaScript errors; the "nor" screen was explicitly re-verified to contain **zero** literal "Coming Soon" text.

**Grand total: 553/553 checks passing.**

**Manual Node-level flow simulation** (since `nor-center.js` transitively loads Firebase and can't be `import()`ed directly under Node — a pre-existing constraint, not introduced by this milestone): simulated the full Dataset Import Center click-through — file selection → facts entry → session creation → submit → approve → import → archive — confirming the visible state label advances at every step and the final `ImportSessionRecord` carries the correct deterministic `knowledgeItemId` and `archiveRecordId`.

**Dormancy verification:** `js/config/feature-gates.js`'s `isV2Enabled` truth table is unchanged and re-verified (5/5 checks). No `js/v2/` file is statically imported by anything outside the tree. `setActiveRepository('memory')` (the one new production-facing behavior change) only executes inside `mountNorCenter()`, itself only reachable after the pilot gate passes.

**Dependency verification:** re-confirmed the one-way layering (`knowledge/` never imports `organizational-memory/`) holds for every new file via static-source checks in `import-session-check.mjs` and `pattern-discovery-check.mjs`.

---

## Honest limitations / not built

- **PDF/DOCX content is never read by code** — only by the human filling the manual-entry form. This is by design (no OCR/AI), not a shortfall.
- **The puppeteer DOM check does not simulate an actual file upload** (CDP file-input automation was judged higher-risk/lower-value than the Node-level flow simulation already covering the identical logic path end-to-end); the DOM check does confirm every tab renders and is clickable with zero fatal errors.
- **`js/v2/knowledge/language/examples.js`, `nor-connector.js`, `review-service.js`, `js/v2/README.md`** carry pre-existing uncommitted changes from before this session — not reviewed or altered by this milestone.
- Two prior architectural gaps remain exactly as documented before this milestone (out of scope): the 11 inactive placeholder connectors, and `nor-center.js`'s Generate NOR pipeline still honestly halts at `NO_KNOWLEDGE` (no Approved `nor` Knowledge exists yet — that's the intended next step for a pilot administrator, not a bug).

## Next step for the pilot administrator

Upload a real document (PDF, DOCX, or JSON) through either Archive Center's "Impor Dataset" tab or NOR Center's Archive tab, walk it through review and approval, and watch Knowledge, Organizational Profiles, and Candidate Recommendations begin to populate from real, human-verified content — no fabricated data anywhere in the pipeline.

**Not committed. Waiting for review before any commit or further work.**
