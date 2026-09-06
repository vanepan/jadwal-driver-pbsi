# V2 Sarpras Intelligence — Phase 5.x.8
## Human Curation Workspace

> Humans create organizational authority.
> The system presents evidence and enforces lifecycle.
> The system does not decide what the organization should believe.

Status: **implemented, NOT deployed, NOT committed.** Feature flag
`/feature_flags/intelligence/enabled` remains **OFF**. The two authority
callables the workspace reads (`intelligenceStyleGuide`,
`intelligenceVisualTemplate`) remain **STAGED** — authored, not wired into
`functions/index.js`, not deployed — so in production today the workspace
renders every domain as `unavailable` and no store call reaches Firebase.

---

### 1. Purpose

Phase 5.x.8 is the **governance UI** for the two authority layers built in
5.x.5 (PBSI NOR Style Guide) and 5.x.6 (PBSI Visual Template System). It
gives an authorized operator **one controlled place** to:

- inspect **proposed** Style Guide rules and Visual Templates,
- see their **evidence**, **temporal context**, **provenance**,
  **conflicts** and **supersession candidates**, all drawn from canonical
  data only,
- and then **explicitly** `approve` / `reject` / `supersede` / `deprecate`
  them.

It is **not** an AI decision engine, **not** a generator, **not** RAG. It
adds **no storage**, **no new authority model** and **no new resolution
logic** — the 5.x.5 / 5.x.6 contracts remain the one authority on
lifecycle and authority state.

Non-goals (explicit): no auto-approve, no auto-reject, no auto-resolve of a
conflict, no auto-selection of a winner, no auto-promotion of Writing
Memory or corpus observations, no OpenAI, no NOR generation, no NOR
Registry / Petty Cash / V1 change, no feature-flag change, no deployment.

---

### 2. Operator workflow

```
Overview ──▶ Style Rules / Visual Templates ──▶ select a proposal
                                                     │
              inspect: evidence · temporal · provenance · predecessor · slot conflict
                                                     │
                              ┌──────────────────────┼───────────────────────┐
                          Approve                 Reject                 Supersede / Approve
                              │                      │                       │  (only when the proposal
                        confirm dialog         confirm dialog                │   already links a predecessor)
                              │                      │                       │
              ┌───────────────┴───────────────┐      │                       │
   non-empty rationale required        server VERSION_CONFLICT / already-decided
              │                              → "reload before deciding" (no silent overwrite)
        server owns actor / timestamp /
        authorityState / version / scope
              │
        success → toast + the detail + dashboard + conflicts refresh
```

The `Conflicts` tab shows every unresolved same-slot disagreement with
**both sides side by side**, each with its own evidence and temporal
context, and **no recommended winner** — resolution is an explicit human
action from the proposal tabs. The `History` tab shows the selected
proposal's append-only audit trail and its full supersession lineage.

---

### 3. Style Guide review

For a selected `StyleRule` the workspace surfaces (`buildStyleRuleReview`):

- **Proposed rule** — category, key, verbatim value, normalized value,
  document type, scope, version, and an explicit **Authority: Proposed**
  label. Authority is **never** shown as a percentage.
- **Evidence** — occurrence count, source-document count, per-document-type
  distribution (never collapsed), extraction methods, and the **evidence
  confidence** as a separate, clearly-labelled `0.xx` number.
- **Temporal context** — `temporalStatus`, `conventionEra` mapped to a
  label (Historical / Current / Transitional evidence — *evidence, not
  authority*), the dated range, and the recent / historical / conflicting
  document counts.
- **Provenance** — the source Writing Memory ids, observation ids and
  document ids, as a compact reference list (never the corpus body).
- **Existing authority** — when the proposal carries `supersedesRuleId`,
  the predecessor rule's value, version, approval metadata and approval
  history.
- **Slot conflict** — when a live same-slot conflict exists, the competing
  ids, with `recommendedWinner: null`.
- **Decision** — `Approve` + `Reject` for a plain proposal; `Supersede /
  Approve` (a distinct button, never an ambiguous generic one) when a
  predecessor is linked; `Deprecate` when the record is already `approved`.

Approval → `styleGuide.approve(ruleId, { rationale, expectedVersion,
acknowledgeConflict? })`. The client sends **only** the id, action, human
rationale, captured `expectedVersion` and an optional explicit
`acknowledgeConflict`. Rejected / deprecated records are retained and stay
queryable; approved records are immutable (a changed value is a new
superseding proposal).

---

### 4. Visual Template review

For a selected `VisualTemplate` the workspace surfaces
(`buildVisualTemplateReview`):

- **Template** — document type, variant, scope, version, Authority label.
- **Page model** — via `describeGeometry`: when a page dimension cannot be
  read the answer is **"Geometry unavailable"** with the coordinate space,
  **never a fabricated A4 / 595×842**. A known geometry shows the real
  width/height, unit, explicit coordinate space and orientation.
- **Regions** — each region's kind, honest per-region geometry, page
  recurrence, occurrence/document counts.
- **Visual evidence** — source document / observation ids, page count,
  coordinate spaces, `geometryKnown`, and confidence as a separate number.
- **Temporal context**, **predecessor**, **slot conflict** — as above.
- **Decision** — same four explicit actions, same rules.

Coordinate spaces are shown verbatim and never silently converted. No
renderer is introduced; there is no fake document preview.

---

### 5. Evidence inspection

Evidence is a **compact reference summary with drill-down ids**, never a
copy of a document body. Every displayed conclusion comes from a canonical
`StyleRule` / `VisualTemplate` field — the projection layer
(`src/intelligence/curation/curation-view.js`) is pure and deterministic
and never guesses.

---

### 6. Conflict handling

`buildConflictView` composes `findStyleGuideConflicts` +
`findVisualTemplateConflicts`. Each conflict:

- shows **both sides** with their own evidence + temporal context,
- carries `recommendedWinner: null` and `resolutionRequiresHuman: true`,
- is **never** decided by frequency, confidence, recency, document count or
  temporal status.

Approving a value that would create a **second** authoritative value for a
slot **fails closed** (`CONFLICT_UNRESOLVED`). The workspace surfaces this
honestly and offers the human two explicit choices: supersede the
incumbent, or tick "deliberately keep both" (which forwards
`acknowledgeConflict: true`, after which the resolver reports the conflict
until a human supersedes one).

---

### 7. Approval

Approval is consequential and uses an explicit confirmation dialog
(`role="dialog"`, labelled) that shows **exactly what becomes
authoritative** — the proposal id, a one-line summary, and the expected
version — plus a required rationale textarea. The final action requires:

- an authenticated effective admin (server-enforced — see §12),
- a **non-empty, non-whitespace** rationale (controller-enforced before any
  store call; server-enforced as `RATIONALE_REQUIRED`).

It is not a one-click list-row action.

---

### 8. Rejection

Rejection uses the same dialog and requires a written reason
(`REASON_REQUIRED`). Rejected proposals are set to `status: rejected` and
**retained** — nothing is deleted; the audit trail preserves the reason
and the server-derived actor.

---

### 9. Supersession

Supersession is the `Supersede / Approve` action on a proposal that
**already links a predecessor** (`supersedesRuleId` /
`supersedesTemplateId`, built upstream). The workspace never fabricates a
superseding proposal. The dialog shows the current authoritative version
and the proposed replacement; on approval the predecessor is
**auto-deprecated** and linked forward, and the old version stays
immutable and queryable.

---

### 10. Deprecation

Deprecation (`approved → deprecated`) is offered only for an already
`approved` record, as a deliberate `Deprecate` action (styled distinctly),
through the same confirmation dialog with a required reason. History is
preserved; the record is never deleted.

---

### 11. Concurrency

Every decision carries the `expectedVersion` captured when the proposal was
opened (`select()` re-reads the record). A stale version — or any
"already decided" code (`VERSION_CONFLICT`, `ILLEGAL_TRANSITION`,
`RULE_EXISTS`, `TEMPLATE_EXISTS`, `NOT_FOUND`) — is surfaced as **"This
proposal changed since you opened it. Reload before deciding."** with a
Reload button. There is **no silent-overwrite path**: the controller never
retries a mutation without a fresh `expectedVersion`.

---

### 12. Security

- **Authorization** reuses `canUseIntelligence` (the existing
  effective-admin gate: `role === 'admin' || adminEquivalent === true`).
  **No new permission id.** The staged `intelligenceStyleGuide` /
  `intelligenceVisualTemplate` callables enforce this from the verified
  Firebase context: unauthenticated → `unauthenticated`; non-admin →
  `permission-denied`; unknown op → `invalid-argument`.
- **Server owns authority metadata.** The client sends only
  `{ id, action, rationale, expectedVersion, acknowledgeConflict? }`. A
  client-supplied `approvedBy` / `approvedAt` / `authorityState` / `status`
  / `version` / `createdBy` is ignored; `approvedBy` is the verified
  `auth.uid`, `approvedAt` is the server clock, `authorityState` is
  re-derived from `status`, and `scope` is server-fixed
  (`organization`-wide).
- **No UI-only gating.** The workspace mounts behind the same
  `isV2Enabled` + synced-flag + effective-admin checks as the intake
  console, and the server re-verifies every call.
- **No direct browser writes.** The DOM view imports **only**
  `js/intelligence-backend-wiring.js` (the sanctioned js → src boundary) —
  never `src/intelligence/` directly, never `js/firebase.js`, and
  references no Firebase / RTDB / Firestore API.

---

### 13. Audit

`approve` / `reject` / `deprecate` / supersede each append one immutable
`STYLE_RULE_*` / `VISUAL_TEMPLATE_*` audit entry recording the
**server-derived actor**, timestamp, `from → to` status, version and a
metadata-only detail bag (rationale / reason / supersedes ids — never a
secret or corpus body). The `History` tab renders this trail plus the full
supersession lineage (`buildHistoryEntries` + the store `history` op).

---

### 14. Responsive behaviour

The workspace is verified with the repository's puppeteer harness at
**320 / 375 / 390 / 430 / 768 / 1024 / 1440** px:

- **desktop / laptop** — a two-column list ↔ review grid, side-by-side
  conflict comparison, dense evidence-aware cards.
- **tablet (≤ 860 px)** — the grid and the conflict comparison stack.
- **mobile (≤ 560 px)** — stacked cards, full-width tab buttons, full-width
  actions and dialog buttons, single-column definition lists.
- **no horizontal page overflow** and no clipped workspace at any width;
  wide content scrolls inside its own container.

---

### 15. Explicit non-goals

- No auto-curation of any kind (§26 of the phase brief).
- No NOR generation / NOR Registry / Petty Cash / V1 changes.
- No OpenAI, RAG, embeddings, external HTTP or secret access.
- No `KnowledgeItem` promotion.
- No feature-flag change; no deployment; no `functions/index.js` change; no
  new `database.rules.json` node.

---

## Implementation

### New files

| File | Role |
| --- | --- |
| `src/intelligence/curation/contracts/curation-contract.js` | tab / decision / domain-state / authority-label vocab; deterministic error-code → sentence map; stale / unavailable code sets. PURE. |
| `src/intelligence/curation/curation-view.js` | pure, deterministic projections: dashboard, proposal rows, filters, style review, visual review, `describeGeometry` (honest), conflict view (no winner), history. Composes the 5.x.5 / 5.x.6 query layers; adds no resolution logic. PURE. |
| `src/intelligence/console/curation-workspace-controller.js` | the pure state machine: `load` / `reload` / `setTab` / `setFilter` / `select` / `beginDecision` / `setRationale` / `setAcknowledgeConflict` / `confirmDecision` / …. Mutates only via `confirmDecision` with a non-empty rationale; sends only `{ id, action, rationale, expectedVersion, acknowledgeConflict? }`; surfaces stale versions as "reload". PURE. |
| `js/intelligence-curation-console.js` | the DOM view. Builds the shell once, re-renders the content region per paint, builds the decision dialog once per decision signature so the rationale textarea never loses focus. Imports **only** the wiring bridge. |
| `scripts/intelligence-curation-check.mjs` | pure node test of the view + controller against the real Memory backends. |
| `scripts/intelligence-curation-check.cjs` | CJS test of the security boundary, the staged callables' auth/authz, server-owned authority, staging, database safety and the static safety scan of every new file. |
| `scripts/intelligence-curation-harness.html` + `scripts/intelligence-curation-ui-check.mjs` | offline puppeteer harness + real-browser check (responsive, mount safety, tabs, list, style/visual review, conflicts, approval, rejection). |
| `docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X8_HUMAN_CURATION.md` | this document. |

### Changed files (additive only)

| File | Change |
| --- | --- |
| `js/firebase.js` | + `callIntelligenceStyleGuide` / `callIntelligenceVisualTemplate` — `httpsCallable` wrappers for the **staged** function names, exact mirror of `callIntelligenceNorRegistry`. Inert until the callables are wired + deployed. |
| `src/intelligence/client-bootstrap.js` | + optional `callStyleGuide` / `callVisualTemplate` ports; when present, `useCallable{StyleGuide,VisualTemplate}Backend`. Absent ⇒ the Null backend stays active ⇒ the workspace shows `unavailable`. Never approves / rejects / deprecates anything. |
| `js/intelligence-backend-wiring.js` | forwards the two ports into `bootstrapIntelligenceClient`; + `createWiredIntelligenceCurationController({ actor })` building the controller over the `{ list, get, approve, reject, deprecate, history }` store facades. |
| `src/intelligence/index.js` | + the Phase 5.x.8 export block (contract + view + controller). |

### Deliberately NOT changed

- `js/app.js` — **zero V1 change.** The curation console has an identical
  mount contract to the intake console
  (`mountIntelligenceCurationConsole` / `unmount…` / the wired factory) and
  is gated by the same `isV2Enabled` + synced-flag + effective-admin
  checks. Routing which screen shows which console is a one-line decision
  deferred to the same review that flips the flag and deploys the staged
  callables — consistent with every prior 5.x phase staying dead until a
  dedicated deploy step.
- `functions/index.js` — no new Cloud Function; the two authority callables
  stay STAGED.
- `database.rules.json` — no new node. The workspace reads
  `/intelligence_style_guide` and `/intelligence_visual_templates`, whose
  server-only-writer + effective-admin-read blocks were already staged in
  5.x.5 / 5.x.6.

### Test results

| Suite | Result |
| --- | --- |
| `intelligence-curation-check.mjs` (new, pure) | PASS |
| `intelligence-curation-check.cjs` (new, server + static) | PASS |
| `intelligence-curation-ui-check.mjs` (new, puppeteer) | PASS — 71/0 |
| full Intelligence suite (37 scripts) | PASS |
| `intelligence-console-ui-check.mjs` (intake console, puppeteer) | PASS |
| Knowledge / Organizational Memory / Organizational Knowledge / Document Intelligence / NOR / Petty Cash Intelligence | PASS |
| permissions / roles / `canAccessModule` / feature-flag override | PASS |
| `vercel-intelligence-module-serving-check.mjs` | PASS |
| `rtdb-sibling-rules-check.mjs` | **pre-existing FAIL** — its naive `JSON.parse` chokes on the `//` comments that have been in `database.rules.json` since long before this phase (fails identically on committed `HEAD`). Not caused by 5.x.8; this phase does not touch `database.rules.json`. |

### Production state

- Feature flag `/feature_flags/intelligence/enabled`: **OFF**
- OpenAI calls: **0**
- RAG: **0**
- Production mutations: **0**
- Deployment: **NOT DEPLOYED**
- Git: **NOT COMMITTED, NOT PUSHED**

### Recommended next step

The 5.x corpus-learning / governance foundation (5.x.1 → 5.x.8) is now
complete: acquisition → ingestion → temporal interpretation → writing
memory → style-guide authority → visual-template authority → certified
retrieval → human curation. The next architectural decision is the
**controlled integration of certified retrieval into NOR generation**,
subject to a separate implementation plan and safety review.
