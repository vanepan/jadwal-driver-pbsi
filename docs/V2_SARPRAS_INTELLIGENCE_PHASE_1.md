# V2 — Sarpras Intelligence Phase 1 (Service + OpenAI Server Boundary)

> Status: **built, tested, uncommitted.** Feature-flagged **off**. The OpenAI
> Cloud Function is **staged, not wired into `functions/index.js`** and not
> deployed. The `/intelligence_conversations` RTDB rule is **written but not
> deployed** — it gets its own security review. Nothing in V1 changed.
>
> Builds directly on Phase 0 (`src/intelligence/`, commit `1cab524`).

---

## 1. What Phase 1 delivers

The end-to-end path for *"Buatkan NOR pembelian mesin potong rumput."*:

```
IntelligenceRequest ──▶ Intelligence Service (src/intelligence/service/)
   │  authz gate (admin pilot — PART 11)
   ▼
src/conversation/conversation-service   (REUSED wholesale — deterministic
   │  intent + questionnaire + knowledge-informed Question Optimizer)
   ▼
 ACTIVE  ─▶  needs_input  { questions: [ "Spesifikasi mesin?", "Jumlah?", … ] }
 READY   ─▶  recipient gate (contextual — ASK, never invent — PART 8/15)
   │            ├─ ambiguous / no history ─▶ needs_input { "Kepada siapa?" }
   │            └─ answered / consistent history ─▶
   ▼
 retrieve Approved Knowledge + Organizational Memory (read-only — PART 7)
 numbering SUGGESTION from the Phase 0 Registry (never authority — PART 9)
 provider.complete()  — OpenAI writes the letter BODY; any failure degrades
   │                    to a deterministic template, never a crash (PART 13)
   ▼
 assembleNorDraft ─▶ requires_review  (BLOCKING human approval — PART 1)
```

Multi-turn state is **server-owned** (`IntelligenceConversation`), not
browser-only (PART 10).

## 2. Architecture — the split (per the approved decision)

| Piece | Runtime | Location | Reuses |
|---|---|---|---|
| Intelligence Service (orchestrator) | ESM, runs anywhere | `src/intelligence/service/intelligence-service.js` | Phase 0 contracts; `src/conversation`, `src/knowledge`, `src/organizational-memory` via injected ports (`default-ports.js`) |
| Clarification mapping + recipient gate | ESM, pure | `src/intelligence/service/clarification.js` | conversation `missingFacts`, archive recipient patterns |
| NOR draft assembler | ESM, pure | `src/intelligence/service/nor-draft-assembler.js` | Phase 0 `IntelligenceDraft` shape; points at existing `buildNorViewModel` |
| Retrieval | ESM, read-only | `src/intelligence/retrieval/{knowledge,memory}-retrieval.js` | `knowledge-service#listKnowledge`, `archive-service#listArchive` |
| Durable conversation state | ESM facade + backends | `src/intelligence/conversation/` | Phase 0 facade+backend-registry pattern; Null default, Memory backend, RTDB backend later |
| OpenAI provider (client-safe) | ESM | `src/intelligence/providers/openai-provider.js` | Phase 0 `provider-contract`; **no key/endpoint** — delegates to an injected `callModel` port |
| Model completion envelope | ESM + **one** CJS mirror | `src/intelligence/providers/model-completion-contract.js` + `functions/src/intelligence/model-completion-contract.js` | — (drift-guarded by `intelligence-functions-check.cjs`) |
| **OpenAI server boundary** | **CJS Cloud Function** | `functions/src/intelligence/generateCompletion.js` | `onCall` v2 pattern, `defineSecret`, `REGION` — all existing `functions/` idioms |
| OpenAI HTTP client | CJS | `functions/src/intelligence/openaiClient.js` | raw `fetch` (Node 20), `AbortController` — mirrors `telegram/proxyEndpoint.js` |

**Why the split:** `functions/` is a self-contained CJS package that deploys
only its own directory; it cannot import the browser-ESM `src/intelligence/`
tree. So orchestration/retrieval/clarification/state — everything reusable —
stays ESM and is reused verbatim; the Cloud Function is a **thin, dumb,
secure "call the model" boundary** that knows nothing about NOR, knowledge,
or conversation. The only duplication is the ~90-line `ModelCompletionRequest`
/ `ModelCompletionResult` envelope, kept byte-equivalent by a drift test.

## 3. OpenAI boundary & security (PART 3, 5, 11)

```
Browser (authenticated, admin)
   │  { completion: ModelCompletionRequest }   ← NO key, NO endpoint, NO provider param name
   ▼
functions/src/intelligence/generateCompletion.js   (onCall, region asia-southeast1)
   │  1. request.auth.uid present?                    → else HttpsError('unauthenticated')
   │  2. serverPermissions.canUseIntelligence(token)  → admin / adminEquivalent only, else HttpsError('permission-denied')
   │  3. getIntelligenceRuntimeConfig().enabled?      → else return { ok:false, error:{code:'DISABLED'} }
   │  4. validate envelope + enforce maxPromptChars   → else HttpsError('invalid-argument') / INVALID_REQUEST
   │  5. OPENAI_API_KEY.value()  (Secret Manager)     → if empty: return { ok:false, error:{code:'NOT_CONFIGURED'} }
   │  6. openaiClient.callChatCompletion(...)         → raw fetch, one AbortController timeout, NO retry
   │  7. logger.info(metadata ONLY)                   → requestId, model, tokens, durationMs, actor — NEVER key/prompt/completion
   ▼
{ ModelCompletionResult }  →  openai-provider  →  Intelligence Service
```

- **The key never reaches the browser.** It is a Secret Manager secret
  (`defineSecret('OPENAI_API_KEY')` in `functions/src/config/secrets.js`),
  injected into the function runtime only, read via `OPENAI_API_KEY.value()`
  at call time, sent to OpenAI as a `Bearer` header, and **never** logged or
  echoed in a result. Verified by `intelligence-functions-check.cjs` +
  `intelligence-security-scan-check.mjs`.
- **No production call is made to "prove" the key exists.** If the secret is
  unset, the boundary returns a typed `NOT_CONFIGURED` and the service
  degrades to deterministic mode.
- **Authorization is server-decided**, from the verified token claim — never
  "the AI knows the permission", never a client-sent field. Phase 1 policy:
  the Intelligence surface is an **admin pilot** (same posture as
  `feature-gates.js#isV2Enabled`), so **no new permission id** is introduced
  (that would also touch `permission-registry.js` / `role-permissions.js` /
  `role-management-check.mjs`'s count). Granular `intelligence.*` permissions
  arrive with the phase that widens the surface.
- The ESM service also takes `authz` as an **injected port**
  (`canUseIntelligence`, `canAccessKnowledge`) — an inaccessible-knowledge
  request is refused before the model is ever asked.

## 4. Feature flag (PART 4)

| Layer | Flag | Default | Effect when OFF |
|---|---|---|---|
| Client ESM | `src/intelligence/config/intelligence-config.js#enabled` | `false` | service uses the Null provider → `complete()` returns `DISABLED` → deterministic template body; needs_input questions are the verbatim deterministic prompts; **no model call, no failure** |
| Server | `functions/src/intelligence/config.js#INTELLIGENCE_FLAGS.enabled` + live `/feature_flags/intelligence/enabled` | `false` | `generateCompletion` returns `{ ok:false, error:{code:'DISABLED'} }` |

Enabling: register `createOpenAiProvider({ callModel: callGenerateCompletion })`,
`setActiveProvider('openai')`, `setIntelligenceConfig({ enabled:true })`
client-side; flip `/feature_flags/intelligence/enabled` server-side. No
architecture change.

## 5. Structured response (PART 5, 7)

The provider never returns a free-form blob treated as a business object. The
service composes a Phase 0 `IntelligenceResponse`:

- `needs_input` → `questions: [{ id, prompt, why, required }]`
- `requires_review` → `draft: { documentType:'nor', fields:{ norType, subject,
  recipient, recipientStatus, date, body, details, attachments, metadata },
  rendersVia, summary }` + `review:{ reason, blocking:true }` +
  `provenance:{ model, promptVersion, knowledgeVersion, … }`; a parallel
  `numbering:{ suggestedNumber, publishedNumber:null, source:'system_suggested' }`
- `error` → `{ code, message }` from a closed set (`FORBIDDEN`,
  `INVALID_REQUEST`, `UNKNOWN_INTENT`, `LIMIT`, provider codes)

`draft.fields.metadata.fieldProvenance` tags every field's source
(`human_answer` / `derived` / `system_derived` / `model` / `memory_pattern`).

## 6. NOR context (PART 8, 15) — "Kepada" is contextual

The NOR-type field schemas (`nor-type-registry.js`) do **not** contain a
`recipient` field, and the service **never invents one**:

1. `collectedFields.recipient` supplied by a human → used verbatim (`known`).
2. Else, the recent NOR archive is summarised
   (`summarizeRecipientPatterns`). A **clear historical majority** (≥70% of a
   ≥3-record sample) → the recipient is **proposed**
   (`recipientStatus:'proposed'`), still editable, still human-reviewed.
3. Else (no data / genuinely mixed history) → the service returns
   `needs_input` with one recipient question, listing what the archive has
   seen. It never fabricates a "Kepada".

Different NORs → different recipients — verified by test.

## 7. Numbering (PART 9, 12)

The AI layer only ever **reads** numbering context and surfaces a
**suggestion** (`src/organizational-memory/numbering-engine.js#suggestNextNumber`,
re-exported through the Phase 0 Registry). `draft.numbering.publishedNumber`
is always `null`; the draft `fields` carry no `norNumber`. The official
number is set only by the authoritative Registry issuance path (Phase 0
contract; server-side reservation is a later phase).

## 8. Conversation / generation state (PART 10)

`IntelligenceConversation` (`src/intelligence/conversation/contracts/`):
`convId`, `actorId` (the only user who may read/continue), `openingUtterance`
(intent is fixed from it), `collectedFields`, `missingFields`, `status`
(`needs_input`/`ready`/`drafted`/`error`/`cancelled`), `turns[]`, `draft`,
`numbering`, `knowledgeRefs`, `memoryRefs`, append-only `version`.

- **Store facade** with a backend registry (mirrors the Phase 0 NOR Registry):
  `null` (default, `NOT_IMPLEMENTED`), `memory` (tests + client disabled
  mode), **RTDB backend registered server-side later**.
- Every turn recomputes the deterministic conversation from
  `openingUtterance` + all accumulated facts (matches
  `conversation-service`'s own "converged sweep costs nothing" philosophy).
- Actor ownership is enforced on every `get`/`append` — a cross-user read or
  continue is `FORBIDDEN`.
- `maxTurns` (default 12) caps a session — continuing past it is a controlled
  `LIMIT` error, never a loop.

### RTDB node — STAGED, not deployed

`database.rules.json` gains `intelligence_conversations`:

```jsonc
"intelligence_conversations": {
  ".write": "false",                          // server-only (Admin SDK bypasses rules)
  ".indexOn": ["actorId"],
  "$convId": {
    ".read": "auth != null && (data.child('actorId').val() === auth.uid
              || auth.token.role === 'admin' || auth.token.adminEquivalent === true)"
  }
}
```

Same shape as `push_subscriptions` / `notification_state`. **This diff ships
in the repo but is NOT deployed with Phase 1** — it gets its own
`firebase deploy --only database` review, per established practice for every
rules change.

## 9. Failure & cost safety (PART 13)

- `openaiClient`: a single `AbortController` timeout (`requestTimeoutMs`,
  default 30s); **no retry** in Phase 1; every failure mode is a typed,
  non-throwing `ModelCompletionResult` (`AUTH`/`QUOTA`/`TIMEOUT`/`NETWORK`/
  `PROVIDER_ERROR`/`INVALID_OUTPUT`/`NOT_CONFIGURED`); the OpenAI error
  message is **not** echoed (generic typed message only).
- `openai-provider.complete()`: catches a throwing transport → `NETWORK`;
  rejects an oversized prompt → `INVALID_REQUEST`; validates the reply shape
  → `INVALID_OUTPUT`.
- Intelligence Service: a model failure **degrades** to the deterministic
  template body and reports `modelError` alongside — the draft and every
  human-entered fact stay intact; nothing is published, no NOR is corrupted,
  the app never crashes.

## 10. Auditability (PART 12)

- `provenance` on every model-backed response: `model`, `modelVersion`,
  `promptVersion` (`nor-draft@1`), `knowledgeVersion`, `generatedAt`,
  `requestId`, `userId`, `sourceModule` — no secret.
- `IntelligenceConversation.turns[]` is itself the per-turn audit trail
  (turn, `at`, `answers`, `status`, `missingFields`, `requestId`) plus
  `knowledgeRefs` / `memoryRefs`.
- The service emits Phase 0 `INTELLIGENCE_EVENT` audit events per turn
  (`AI_REQUESTED` / `AI_RESPONSE_RECEIVED` / `AI_QUESTION_ASKED` /
  `AI_DRAFT_CREATED`) — **vocabulary only**, returned for a future sink; no
  new framework. The Cloud Function logs metadata-only.

## 11. Tests

| Suite | Checks | Result |
|---|---|---|
| `scripts/intelligence-service-check.mjs` | 45 — authz, disabled/enabled, provider-failure degrade, full clarification loop, recipient contextual/proposed/ask, knowledge retrieve + no-promote + inaccessible-rejected, numbering suggestion≠official, conversation state turn 1→2→3 + isolation + maxTurns, unsupported task / empty / unknown intent | PASS |
| `scripts/intelligence-provider-openai-check.mjs` | 27 — provider contract + registry, `complete()` success + every failure mode (no port, boundary error, boundary throw, malformed, oversized, malformed request), `generate()` pointer, Null provider `complete()`=DISABLED, no secret in source | PASS |
| `scripts/intelligence-functions-check.cjs` | 44 — CJS⇄ESM contract drift, `serverPermissions`, `openaiClient` every typed failure + key-never-in-result + determinism→temperature, `INTELLIGENCE_FLAGS` off, callable loads + not wired, no key literal | PASS |
| `scripts/intelligence-foundation-check.mjs` (Phase 0, updated) | 90 — 2 isolation assertions updated for Phase 1 (comment-strip; runtime-import only) | PASS |
| `scripts/intelligence-security-scan-check.mjs` (Phase 0) | 17 | PASS |

## 12. V1 regression

`smoke-boot`, `startup-stability-check`, `permission-service-check` (70),
`role-management-check` (38), `permission-runtime-invariant-check` (43),
`pettycash-intelligence-check` (29), `official-nor-archive-check` (11),
`organizational-memory-check` (28), `nor-composition-check` (24),
`knowledge-ownership-check` (56), **`conversation-ownership-check` (80)**,
`north-star-acceptance-check` (38), `prediction-provider-check`,
`canAccessModule-check` (5), `feature-flags-override-check` (4),
`settings-store-check` (16) — **all green.** 451 `src/`+`functions/src/` files parse.

## 13. Known limitations / deferred

- The **Cloud Function is not wired into `functions/index.js`** and not
  deployed. Wiring + `firebase functions:secrets:set OPENAI_API_KEY` + the
  `/feature_flags/intelligence` flip + the `database.rules.json` deploy are
  explicit steps for the phase that turns this on.
- **No RTDB conversation backend yet** — the store facade has `null` +
  `memory` backends; the RTDB backend is registered server-side once the
  rule is deployed. Client disabled-mode uses the memory backend
  (single-session continuity).
- **No LLM-driven intent / retrieval ranking** — intent is the deterministic
  `src/conversation` keyword engine; retrieval is "all Approved for this
  domainType/norType". Model use is limited to the letter body prose.
- **Petty Cash NOR flow is untouched** — no migration onto the Registry
  (Phase 0 deferral stands).
- **No generation UI** — no wizard, no live editable preview, no chat
  surface (PART 16 non-goals).
- **`emulator` integration test of the callable** is deferred to when it is
  wired; Phase 1 tests its decomposed parts (`serverPermissions`,
  `openaiClient` with stub fetch, envelope validation, drift).

## 14. Recommended next phase (Phase 2)

1. Wire `generateCompletion` into `functions/index.js`; set the secret;
   deploy the `/intelligence_conversations` rule (own review); add the RTDB
   conversation backend.
2. A minimal Intelligence entry surface inside the existing Sarpras
   Intelligence workspace (`src/ui/`) — one input, the needs_input/draft
   round-trip, behind `isV2Enabled`.
3. Live editable NOR preview + the human review → NOR Registry `publish()`
   path (server-side number reservation).
