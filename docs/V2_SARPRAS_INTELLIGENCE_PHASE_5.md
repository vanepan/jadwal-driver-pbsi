# V2 — Sarpras Intelligence Phase 5: Canonical NOR Registry & Human Publication

**Status:** implemented, tested, **final hardening pass applied**, **not
committed / not deployed**. Production feature flag
`/feature_flags/intelligence/enabled` remains **absent → OFF**. Zero real
OpenAI calls. No V1 change. No data migration.

Follows Phase 4 (NOR Draft & Review). Built on `1.30.13.0` / prior V2 phases.

**Final hardening pass:** (A) the official NOR number is now **fully
server-authoritative** — every `officialNumber` / `publishedNumber` input was
removed from the publish op / callable / store / service / facade / backend;
`norNumber` IS the atomic server-reserved sequence and no caller can choose
it. (B) `makeNorRecord()` normalises `publishedVersion` to a genuine `null`
at the contract level (no `Number(null) → 0`), so no downstream correction is
relied upon.

---

## 1. Objective

Give the AI-produced NOR a **canonical lifecycle record** and make **human
approval + publication mandatory and explicit**:

```
requires_review ── register ──▶ in_review   (a canonical NorRecord, NO number)
in_review ── human edit + save ──▶ in_review (v+1, immutable version snapshot)
in_review ── Setujui ──▶ approved            (HUMAN, effective-admin, NO number)
approved  ── Terbitkan ──▶ published          (HUMAN, reserves ONE official number,
                                              atomic + idempotent, server-side)
published ── (retry) ──▶ published            (idempotent — no second number)
published ── edit/approve/publish ──▶ REJECTED (immutable)
```

The Phase 4 draft stays the **editable working copy**; the new canonical
`NorRecord` is the **lifecycle authority**. An AI-generated NOR is never
automatically official.

---

## 2. Architecture

Two server-owned RTDB nodes, linked by a deterministic id:

| Node | Owner | Role |
|---|---|---|
| `/intelligence_nor_drafts/{draftId}` | Phase 4 `intelligenceNorDraft` callable | editable working copy — **UNCHANGED** |
| `/intelligence_nor_registry/{norId}` | Phase 5 `intelligenceNorRegistry` callable | canonical `NorRecord` + lifecycle + versions + number |
| `/intelligence_nor_registry_counters/{scopeKey}` | Phase 5 `norNumberingCounter` | atomic official-number sequence (server-only, no rule → root deny) |

`norId = nor_<conversationId>` mirrors Phase 4's `draft_<conversationId>` —
get-or-create, so a re-run / a reload finds the same record.

**Zero-trust content:** the `register` and `sync` ops send **only the id**.
The server re-reads the linked Phase 4 draft (`norDraftStore`) and snapshots
it. The browser cannot inject NOR content, an owner, a version, or a number.

**Single-composition-root invariant preserved:** the only `js/` module that
imports `src/intelligence/` is still `js/intelligence-backend-wiring.js`
(`intelligence-foundation-check.mjs` still passes).

**Numbering (PART F) — fully server-authoritative:** `reserveNorNumber()`
allocates a **unique, atomic, idempotent SEQUENCE INTEGER**
(precedent: `functions/src/reimbursement/counter.js`). At publication the
official `norNumber` **IS that server-reserved sequence** — there is **no
number input on any op**. The browser (and every caller) can never choose,
override, replace, or inject the official number; any number-shaped field on
`request.data` is ignored. The atomic `numberAllocation`
(sequence + scopeKey + reservationKey + allocatedAt + basis) is recorded for
audit. Human review controls **approval and publication**; the Registry
server controls **number reservation**. The decorated organizational
NOR-number *string format* is **not invented** — whether Sarpras Intelligence
NORs share the V1 Petty Cash format
(`{seq}/Nota Organisasi/Sarpras/{RomanMonth}/{year}`) and whether the sequence
is org-wide or per-module are **unresolved organizational rules**
(`docs/NOR-Specification.md` §D.7 open question #4). Until PBSI decides, the
sequence itself is the canonical number.

---

## 3. Files

### New — client (browser ESM, pure)
| File | LOC | Purpose |
|---|---|---|
| `src/intelligence/nor-registry/nor-registry-record.js` | 250 | pure helpers: `norIdFromConversation`, `registryContentFromDraft`, `registryContentChanged`, `makeNorRecordFromDraft`, `appendRegistryVersion`, `markApproved`, `markPublished`, `REGISTRY_AUDIT_EVENTS` |
| `src/intelligence/nor-registry/backends/memory-nor-registry-backend.js` | 170 | in-process backend w/ real lifecycle + fake atomic+idempotent allocator — tests / DISABLED client |
| `src/intelligence/nor-registry/backends/callable-nor-registry-backend.js` | 130 | delegates to the `intelligenceNorRegistry` callable; id-only payloads |

### New — server (CJS, self-contained, NO secret)
| File | LOC | Purpose |
|---|---|---|
| `functions/src/intelligence/norRegistryContract.js` | 300 | CJS mirror (schema, fields, lifecycle graph, error codes, `isNorRecord`, all pure lifecycle helpers) — drift-guarded |
| `functions/src/intelligence/norNumberingCounter.js` | 110 | `reserveNorNumber({db,reservationKey,scopeKey})` — `db.ref(...).transaction()` on `/intelligence_nor_registry_counters/{scopeKey}` with a per-`reservationKey` memo (idempotent replay) |
| `functions/src/intelligence/norRegistryStore.js` | 260 | Admin SDK persistence for `/intelligence_nor_registry/{norId}` (only writer); `registerFromDraft` / `syncFromDraft` / `approveRecord` / `publishRecord` / `getRecord` / `listByOwner` / `getHistory`; re-reads the linked draft |
| `functions/src/intelligence/intelligenceNorRegistry.js` | 175 | HTTPS callable v2, region-pinned, **NO secret**; `op ∈ register\|get\|list\|sync\|approve\|publish\|history`; authz = `canUseIntelligence(auth.token)`; actor = `auth.uid`; cross-owner → FORBIDDEN envelope; metadata-only `logger.info` |

### New — tests
| File | Purpose |
|---|---|
| `scripts/intelligence-nor-registry-check.cjs` | CJS server matrix + CJS⇄ESM drift + counter atomicity/idempotency + rules block + no-secret + no-V1-coupling (~110 checks) |
| `scripts/intelligence-nor-registry-service-check.mjs` | full lifecycle through the Intelligence Service (memory backends) — register → sync → approve → publish → idempotent retry → immutability → ownership → recoverable failure → silent-unwired (~45 checks) |

### Modified
| File | Change |
|---|---|
| `src/intelligence/nor-registry/contracts/registry-contract.js` | `+approve` in `NOR_REGISTRY_CONTRACT.methods`; `+FORBIDDEN, VERSION_CONFLICT, ALREADY_PUBLISHED, NUMBER_RESERVATION_FAILED` error codes |
| `src/intelligence/nor-registry/contracts/nor-numbering-contract.js` | doc-comment: points `reserveNumber` at the server counter; **no behaviour change** (client stays `NOT_IMPLEMENTED` — no client-side authoritative numbering) |
| `src/intelligence/nor-registry/backends/null-nor-registry-backend.js` | `+approve: () => NOT_IMPLEMENTED` |
| `src/intelligence/nor-registry/nor-registry.js` | `+approve(norId, ctx)` facade fn + `REGISTRY_EVENT.APPROVED`; `+useCallableNorRegistryBackend`; `appendVersion` signature `(norId, input)`; re-exports the new helpers |
| `src/intelligence/service/intelligence-service.js` | at `requires_review` → `registerNorRecord` (get-or-create, recoverable `registryError`, silent when unwired); `+getNorRecord / syncNorRecord / approveNor / publishNor` (same authz gate + defence-in-depth owner check); inject `registryStore` (default = facade fns) |
| `src/intelligence/console/intelligence-console-controller.js` | `NOR_LIFECYCLE`; lifecycle state (`norId / norLifecycle / norVersion / norNumber / …`); `+approve() / publish()` (explicit, lifecycle-gated, idempotent no-op when goal already met); `saveDraft()` also syncs the canonical version; `editField / saveDraft` refused once not `in_review`; `resumeDraft` restores the stage |
| `src/intelligence/client-bootstrap.js` | `+callRegistry` port → `useCallableNorRegistryBackend`; `+norRegistryBackend` in the status |
| `src/intelligence/index.js` | export the new registry surfaces |
| `js/intelligence-backend-wiring.js` | pass `callIntelligenceNorRegistry` |
| `js/firebase.js` | `+callIntelligenceNorRegistry(payload)` httpsCallable wrapper (no key) |
| `js/intelligence-console.js` | lifecycle-aware status pill + official-number callout + the "AI membuat draft · Manusia meninjau · …" ladder; `Setujui` (in_review) / `Terbitkan` (approved) buttons; fields read-only once approved; workspace signature includes the lifecycle stage |
| `functions/index.js` | `require` + `exports.intelligenceNorRegistry` (24 → **25** functions) |
| `database.rules.json` | **one** additive node `intelligence_nor_registry` — byte-mirror of `intelligence_nor_drafts` (`.write:false`, owner-scoped `.read`, `.indexOn ["ownerId"]`). Counter node gets **no** rule (root deny, like `/reimbursement_counters`). |
| `scripts/intelligence-foundation-check.mjs` | the one `NOR_REGISTRY_CONTRACT.methods` assertion now includes `approve` (legitimate contract growth — `in_review→approved` was always in `NOR_STATUS_GRAPH`) |
| `scripts/intelligence-service-check.mjs` | knowledge-write guard: `appendVersion` moved from a bare token to a knowledge-scoped method (it is now a legit NOR-Registry symbol); `+2` assertions that `finishReady` never calls `registryStore.approve/.publish` and that `approve/publish` are reached only via `approveNor/publishNor` |
| `scripts/intelligence-console-check.mjs` / `-ui-check.mjs` / `-harness.html` | the Phase 3B/4 "no publish/approve surface" assertions replaced with the Phase 5 lifecycle: `approve()/publish()` exist, are HUMAN-gated, never auto-fire; a full Setujui→approved→Terbitkan→published→reload walk |

### Intentionally untouched
`js/petty-cash/**` (esp. `petty-cash-service.js#generateNor()` and its
numbering formatters), all V1 NOR code + data, `verifyPin.js`,
`serverPermissions.js`, `permission-registry.js` / `role-permissions.js` /
`permission-service.js` (no new permission id), `functions/src/reimbursement/counter.js`,
`src/intelligence/contracts/audit-contract.js`, `database.rules.json` beyond
the one added node, `/feature_flags/intelligence`.

---

## 4. RTDB schema

```
/intelligence_nor_registry/{norId}                    norId = nor_<conversationId>
  schema:"nor-record@1"  norId  norNumber(""→official on publish)
  sourceModule:"intelligence"  sourceFeature  documentType:"nor"
  title  subject  recipient  createdAt  createdBy(=ownerId)
  status:  in_review → approved → published  (→ superseded, future)
  currentVersion  publishedVersion(null → N on publish)
  numberSource:  system_suggested → reserved (on publish)
  ownerId(=auth.uid, .indexOn)
  content:{ jenis, subject, recipient, recipientStatus, date, body, bodySource,
            facts:{item,quantity,unit,purpose,budget}, draftVersion }
  metadata:{ draftId, conversationId, sourceFeature,
             suggestedNumber, suggestionBasis, suggestionConfidence,
             numberAllocation: null | {sequence, scopeKey, reservationKey, allocatedAt, basis} }
  versions:[ {version, at, actorId, changeType, content, published?} ]   append-only; published entry immutable
  auditHistory:[ {type, at, actorId, fromVersion, version, detail} ]     append-only
                type ∈ AI_DRAFT_CREATED | AI_DRAFT_EDITED | AI_DRAFT_APPROVED | NOR_NUMBER_RESERVED | NOR_PUBLISHED

/intelligence_nor_registry_counters/{scopeKey}        server-only (no rule → root deny)
  seq:<int>   reservations:{ <reservationKey>: <int> }   idempotency memo
```

`scopeKey` defaults to `intelligence_nor` (module-local) — see §2 numbering note.

---

## 5. Authorization (unchanged model)

Same as Phase 3C, every Intelligence callable: `canUseIntelligence(auth.token)`
→ `role === 'admin' || adminEquivalent === true`, sync, token-only,
fail-closed. **No new permission id, no per-user grant, no second permission
system.** Actor / owner is **always** `request.auth.uid`; a client `ownerId`
is overwritten. Cross-owner `get/sync/approve/publish/history` → a `FORBIDDEN`
envelope (not a throw). The service adds a defence-in-depth owner check for the
memory/test path; the server callable is authoritative in production.

RTDB rules diff (structural, before/after): **3 leaves added, 0 removed, 0
modified**, all under the new `/intelligence_nor_registry` node. Total leaves
140 → 143.

---

## 6. Lifecycle & concurrency

`norRegistryContract.js` (server) + `nor-registry-record.js` (client) are the
one lifecycle authority; the CJS mirror is drift-guarded. Every mutating op
takes an optional `expectedVersion` and rejects a stale value with
`VERSION_CONFLICT`. `sync`/edit is legal only from `in_review`; `approve` only
from `in_review`; `publish` only from `approved`. Editing / approving / publishing
a `published` record → `ALREADY_PUBLISHED`. `publish` on an already-`published`
record → the record as-is (idempotent, no second number). The published
`versions[]` entry is flagged and never rewritten.

---

## 7. Numbering

Real, server-side, atomic (`db.ref().transaction()`), idempotent (per-
`reservationKey = norId` memo). **`norNumber === String(server sequence)`,
always** — `publish` (op / callable / store / service / facade / backend)
takes **no** number input from any caller; there is no `officialNumber` /
`publishedNumber` / `humanConfirmedNumber` field anywhere on the publish path,
and any such field on `request.data` is ignored. A `publish` retry after a
lost response re-reads → still `approved` → re-reserves with the same key →
**same sequence**, and the counter does NOT advance. Client-side
`reserveNumber()` stays `NOT_IMPLEMENTED` — the browser never allocates. The
decorated organizational string format is **not invented** (§2).

---

## 8. Audit

On-record append-only `auditHistory` array (the Phase 4 pattern extended to
`NorRecord`): `AI_DRAFT_CREATED` (register), `AI_DRAFT_EDITED` (sync),
`AI_DRAFT_APPROVED` (approve), `NOR_NUMBER_RESERVED` + `NOR_PUBLISHED`
(publish). Each entry carries `actorId` + `fromVersion` + `version`. No third
audit framework; `audit-contract.js` untouched (`NOR_NUMBER_RESERVED` is a
Phase-5 lifecycle-detail entry type — the array is not vocabulary-validated).
`logger.info` is **metadata only** — never a secret, token, header, or body.

---

## 9. UI (extends the Phase 4 workspace)

- **in_review** — editable fields, `Simpan Draf` + `Batalkan perubahan` +
  **`Setujui`**. Save also syncs the canonical version. Status pill "Menunggu
  review". If registration failed there is no `Setujui` (save-only bar + a
  persist warning).
- **approved** — fields read-only, `Batalkan/Simpan` gone, **`Terbitkan`**
  shown, pill "Disetujui — menunggu penerbitan", still no number.
- **published** — fields read-only, no destructive control, the **official
  number** in a callout, pill "Diterbitkan".
- Always shown: *"AI membuat draft · Manusia meninjau · Manusia menyetujui ·
  Registry menetapkan nomor resmi saat diterbitkan."*
- A reload restores the exact stage (draft + `getNorRecord`).

---

## 10. Tests

| Suite | Result |
|---|---|
| `intelligence-nor-registry-check.cjs` (new) | **PASS** — server matrix, counter atomicity/idempotency, CJS⇄ESM drift, rules, no-secret |
| `intelligence-nor-registry-service-check.mjs` (new) | **PASS** — full lifecycle through the service |
| `intelligence-console-check.mjs` | **PASS** — Phase 5 lifecycle sections added |
| `intelligence-console-ui-check.mjs` (puppeteer, 7 viewports) | **PASS 120/0** — Setujui→approved→Terbitkan→published→reload |
| `intelligence-foundation / security-scan / service / functions / authz / conversation-backend / e2e-multiturn / client-wiring / feature-flag-sync / answer-extraction / provider-openai / nor-draft / nor-draft-service` | **PASS, 0 failing** (Phase 4 + prior all green) |
| `vercel-intelligence-module-serving-check.mjs` | **PASS** |
| V1: `smoke-boot, startup-stability (8/0), permission-service (70/0), permission-runtime-invariant (43/0), role-management (38/0), individual-permission-runtime (38/0), pettycash-intelligence (29/0), official-nor-archive (11/11), organizational-memory (28/28), gudang-foundation (64/0), engineering-foundation (116/0), timeline-multiday-render (33/0), assignment-start-flow (9/0), drawer-overlay-pointer-safety (35/0), rtdb-hardening-functions (34/0)` | **PASS** |

**Pre-existing unrelated failure (NOT fixed, NOT caused by Phase 5):**
`scripts/rtdb-hardening-phases-2to7-check.mjs` — raw `JSON.parse(database.rules.json)`
chokes on that file's `//` comments; fails identically at clean HEAD (the
byte offset just shifted by the one comment block Phase 5 added). Its
comment-aware sibling `rtdb-hardening-functions-check.mjs` passes 34/34.

---

## 11. Security

- `intelligence-security-scan-check.mjs` **PASS** — no provider secret /
  endpoint / SDK anywhere in the shipped client surface; `src/intelligence/**`
  stays secret-free and I/O-free.
- Full-changeset grep for `sk-…` / `OPENAI_API_KEY` / `api.openai.com` /
  `Bearer …` / `process.env.<X>` — only pre-existing doc-comments and test
  regex strings match; **no real secret introduced**.
- The Phase 5 server files contain no `OPENAI_API_KEY` / `api.openai.com` /
  `process.env` (also enforced by `intelligence-functions-check.cjs`, which
  iterates every `functions/src/intelligence/*.js`).
- `norRegistryStore` only ever `db.ref`s the `intelligence_nor_registry` node;
  `norNumberingCounter` only the counter node. No V1 Petty Cash import/call.

---

## 12. Deployment (NOT DONE — gated)

Required to deploy: `firebase deploy --only functions:intelligenceNorRegistry,database`
(functions asia-southeast1, no-secret; the `database` deploy pushes the one
added rule node). Then Vercel auto-deploys the client assets (Firebase Hosting
does not — see the deployment dual-surface note). **The feature flag stays
OFF.** Manual production E2E is a separate, explicitly-approved step (§14).

---

## 13. Known limitations

1. **Decorated NOR-number *string* format is deferred** — Phase 5 reserves a
   unique audited sequence integer and `norNumber` IS that sequence
   (server-authoritative, no caller input). The organizational string format
   + org-wide-vs-per-module scope are open PBSI questions
   (`docs/NOR-Specification.md` §D.7). When PBSI decides, only
   `markPublished()` (one line, both mirrors) composes the string from the
   already-reserved sequence — no interface change.
2. **`published → superseded` + re-enter-lifecycle is not built** — a
   published record is hard-frozen; producing a revised NOR after publication
   (supersession + a new `in_review` record) is a later phase. The transition
   guard is in place so nothing can mutate a published record meanwhile.
3. **Dual-write consistency** — the Phase 4 draft and the canonical record are
   separate nodes; the server re-reads the draft for `register`/`sync` (no
   client-content drift), and a registration/sync failure is recoverable and
   surfaced, but a draft edit that saves while the registry sync fails leaves
   the canonical `currentVersion` one behind until the next successful save
   (soft warning shown; the next save re-syncs).
4. *(resolved in the final hardening pass)* `makeNorRecord()` now normalises
   `publishedVersion` to a genuine `null` at the contract level (no
   `Number(null) → 0`); `0` and any non-positive / non-finite value also
   normalise to `null`; `1` / `"2"` still normalise to the integer. The
   downstream `makeNorRecordFromDraft` override was removed.
5. **No live prod RTDB-rules diff** — done structurally against `git show
   HEAD:database.rules.json`; a live deep-compare must run at deploy time
   (as in Phase 2E/4).

---

## 14. Manual production E2E checklist (prepare, do NOT auto-run)

Run as a signed-in effective admin, with `/feature_flags/intelligence/enabled`
temporarily `true`, ideally against a disposable conversation:

1. Generate a NOR (intake → answers) → **`Menunggu review`**; a `norId` is
   present in the console state.
2. Edit a field → **Simpan Draf** → save-state "tersimpan"; the canonical
   `currentVersion` advances.
3. **Reload** → the workspace + the saved edit come back (draft + canonical).
4. **Setujui** → status **`approved`**, fields read-only, **no** official
   number, `Terbitkan` appears.
5. **Terbitkan** → status **`published`**, exactly **one** official number
   shown, `numberSource: reserved`, `publishedVersion` set. The number is the
   server counter value — the UI has no field to type a number.
6. **Terbitkan again** (or re-call publish) → the **same** number, no second
   allocation, counter unchanged, no error.
7. **Reload** → lands read-only on the published NOR, same number.
8. Attempt to edit / re-approve → refused (`ALREADY_PUBLISHED`).
9. In RTDB: `/intelligence_nor_registry/nor_<convId>` has the append-only
   `auditHistory` (…`AI_DRAFT_APPROVED`, `NOR_NUMBER_RESERVED`, `NOR_PUBLISHED`)
   and `/intelligence_nor_registry_counters/intelligence_nor` advanced by
   exactly 1.
10. Set `/feature_flags/intelligence/enabled` back to absent/false.

Do **not** create a real organizationally-consequential NOR — use a test/
disposable conversation.

---

## 15. Git status

On `main`, working tree (uncommitted): 18 files modified (+1030 / −125), 9
new files (~2055 LOC: 4 `functions/src/intelligence/*`, 3
`src/intelligence/nor-registry/*`, 2 `scripts/*`), 1 new doc. **Not committed,
not pushed, not deployed.** APP_VERSION not bumped.
