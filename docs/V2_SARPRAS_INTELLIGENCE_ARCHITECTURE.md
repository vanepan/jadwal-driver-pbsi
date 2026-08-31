# V2 — Sarpras Intelligence Architecture (Phase 0: Foundation)

> Status: **foundation only**. Dormant, feature-flagged **off** by default, wired
> into no UI, calling no AI provider. This document is the authoritative
> reference for how the AI-assisted layer will be built incrementally on top of
> the existing V2 platform without another rewrite.
>
> Grounded in the actual repository: `src/` (the V2 Knowledge Platform,
> ~351 files, pilot-gated), `js/prediction/prediction-provider.js` (the
> provider-abstraction precedent), `functions/` (the existing server-side
> execution environment), `js/config/permission-registry.js` +
> `js/permission-service.js` (the permission architecture), and
> `js/config/dispatch-intelligence-config.js` (the config precedent).
> Binding prior decisions: `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` §4
> and `docs/SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md`.

---

## 1. V2 purpose

Sarpras Intelligence is the layer that will orchestrate AI-assisted
organizational work — first NOR generation, later document analysis and
knowledge-grounded answers — while keeping the platform's usefulness
**independent of any specific AI provider**. Knowledge belongs to PBSI and is
durable; providers are adapters and are disposable (CLAUDE.md; V2 audit §4.0).

Phase 0 delivers the boundary and the contracts. It does **not** deliver a
generation workflow.

## 2. Intelligence boundary

A dedicated domain: `src/intelligence/`. It is **not** a generic "AI utility".
It sits downstream of the existing V2 domains and composes them:

```
src/knowledge/               (Approved Knowledge — read-only)      ┐
src/organizational-memory/   (Archive, numbering suggestion — RO)  ├─▶ src/intelligence/ ─▶ AI provider (server-backed, future)
src/document-intelligence/   (NOR draft/preview contracts — RO)    ┘
```

Responsibilities it will own over subsequent phases: AI orchestration,
knowledge retrieval for context, structured request/response handling,
missing-information handling, prompt/model/knowledge versioning, the AI audit
trail, and the NOR Registry. Phase 0 establishes only the contracts for these.

## 3. Provider abstraction

Modelled byte-for-byte on `js/prediction/prediction-provider.js` (registry +
never-throws + explicit success/failure result + `NOT_IMPLEMENTED` stub).

- `contracts/provider-contract.js` — a provider is a frozen
  `{ id, version, kind, description, generate(request) }`. `generate()` returns
  a `ProviderResult` `{ ok, response, error, providerId, modelVersion }` and
  **never throws**. `response` (on `ok`) is an `IntelligenceResponse`.
- `provider-registry.js` — `registerProvider` / `getProvider` / `listProviders`
  / `setActiveProvider` / `getActiveProvider` / `resetRegistry`. The active
  provider is read per request, so switching is global and instant.
- `providers/null-provider.js` — the default. Inert, pure, always returns
  `providerFailure(NOT_IMPLEMENTED)`. It is the safe fallback and the reset
  target; it is never deleted.

Swapping OpenAI for another model — or a rule engine for a local model — is one
new provider file plus one `setActiveProvider()` call. Nothing else changes.
Providers own exactly one step (`generate`); the future Intelligence Service
owns validation/audit/classification uniformly for every provider.

## 4. Server-side security boundary

**The browser never receives the provider credential.** (PART 5, CRITICAL.)

The existing server-side execution environment is Firebase Cloud Functions
(`functions/`, Node 20, `firebase-admin` + `firebase-functions` v6). It already
demonstrates the exact pattern needed:

- `functions/src/telegram/proxyEndpoint.js` — HTTP ingress → token from
  **Google Secret Manager** → external API call → retry/delivery tracking. The
  browser holds no Telegram token.
- `functions/src/reimbursement/counter.js#acquireReimbursementNumber` — a
  callable that performs a server-side atomic increment the client is not
  allowed to do directly.

The future AI boundary is **one new callable** (working name
`intelligenceGenerate`) under `functions/src/intelligence/`:

```
Browser (authenticated)
   │  IntelligenceRequest  (domain shape, NO provider params, NO key)
   ▼
functions/src/intelligence/intelligenceGenerate  (callable)
   │  • verifies the caller (Firebase Auth context, same as verifyPin/credential callables)
   │  • checks the permission (see §11) and data classification (see §12)
   │  • reads the provider key from Secret Manager
   │  • calls the provider API
   │  • records a UsageRecord (§10) and audit events (§9)
   ▼
IntelligenceResponse  (completed | needs_input | draft | requires_review | error)
   ▼
Browser
```

**Phase 0 does not build this function.** No `functions/` file is added or
modified. This section is the spec the Phase 1 implementation follows.

## 5. How provider secrets remain server-side

- The key is a Secret Manager secret, injected into the Cloud Function's
  runtime only (same mechanism as `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`).
- `src/intelligence/config/intelligence-config.js` holds **no** secret — only a
  master flag, a provider id, a provider-neutral default model id, and timeouts.
  It is safe to ship to the browser.
- `IntelligenceRequest` (`contracts/intelligence-request-contract.js`) has **no**
  field for a key, an endpoint, or a provider parameter name. Its `modelConfig`
  is abstract (`{ model, maxOutputTokens }`); the server adapter maps it.
- Enforcement: `scripts/intelligence-security-scan-check.mjs` scans the shipped
  client surface for `OPENAI_API_KEY`, `api.openai.com`, `sk-`-style keys, and
  browser-side provider SDK/`fetch` calls. Phase 0 baseline: **clean**.

## 6. Knowledge architecture

Unchanged and reused. The Knowledge Platform (`src/knowledge/`) already provides
a `KnowledgeItem` shape, a registry-backed `domainType`/`kind`, a five-state
append-only lifecycle, connector-mediated read-only acquisition, and a
`KnowledgeRepository` interface with swappable backends
(`src/knowledge/repository/`).

Sarpras Intelligence is a **read-only consumer** of Approved Knowledge for
context. It never writes knowledge and never bypasses the human review gate.
An `IntelligenceRequest.context.knowledgeRefs[]` carries `KnowledgeItem` ids —
never inline payloads — and the server boundary resolves them.

Retrieval strategy (structured query vs. embeddings vs. hybrid) is **not**
decided here. The `KnowledgeRepository` interface is the seam; a future
vector-backed implementation registers behind it without changing callers.

## 7. NOR Registry

`src/intelligence/nor-registry/` is **the canonical, module-independent**
registry of official NOR documents (PART 9). Every NOR — Petty Cash today,
Sarpras Intelligence tomorrow, any future module — is meant to register here.

- `contracts/nor-record-contract.js` — canonical identity `NorRecord` (PART 10):
  `norId`, `norNumber`, `sourceModule` (registry-backed via
  `registerNorSourceModule` — **not** a hardcoded switch), `sourceFeature`,
  `documentType`, `title`, `subject`, `recipient` (**contextual, never a fixed
  constant** — PART 15), `status`, `currentVersion`, `publishedVersion`,
  `numberSource`, `content`, `metadata`, `auditHistory`.
- `contracts/registry-contract.js` — the backend interface + `RegistryResult`
  envelope, mirroring `src/knowledge/repository/contracts/repository-contract.js`.
- `nor-registry.js` — the facade: `register` / `getById` / `list` /
  `appendVersion` / `publish` / `getHistory`, plus a listener registry for
  Registry Events. Delegates to the active backend.
- `backends/null-nor-registry-backend.js` — the only backend in Phase 0.
  Every write returns `NOT_IMPLEMENTED`.

The registry is **independent of the module that generated the NOR**. Phase 0
does **not** rewire `js/petty-cash/petty-cash-service.js#generateNor()` — that
migration is a later, deliberate phase (PART 11).

## 8. NOR numbering ownership

One source of truth (PART 11). Two distinct concepts (PART 12):

| Concept | Owner | Phase 0 |
|---|---|---|
| **Suggested number** — advisory, autofilled, editable | `src/organizational-memory/numbering-engine.js#suggestNextNumber(domainType)`, re-exported by `nor-registry/contracts/nor-numbering-contract.js` and `nor-registry.js` | Real (pattern inference; confidence 0 when no pattern) |
| **Published number** — reserved + validated at issuance | `nor-numbering-contract.js#reserveNumber()` → future server-side (precedent: `functions/src/reimbursement/counter.js`) | `NOT_IMPLEMENTED` stub |

`NUMBERING_OWNER = 'src/intelligence/nor-registry/nor-registry.js'`. No module
computes NOR numbers independently. `makeNumberAllocation()` records
`suggestedNumber`, `publishedNumber`, and `source` (`system_suggested` /
`user_edited` / `reserved`) so an autofilled value is never mistaken for an
official issuance.

## 9. Draft → review → publish lifecycle

```
IntelligenceRequest
      │
      ▼
IntelligenceResponse
   ├─ needs_input   → user answers questions → new request
   ├─ draft         → live editable preview (recipient / subject / body / number / …)
   ├─ requires_review → human approval required before any use
   ├─ completed
   └─ error
      │  (human edits the draft — a NOR Registry appendVersion, new version, never overwrite)
      ▼
NOR Registry: approved → published   (human-gated; sets norNumber + publishedVersion)
      ▼
NOR Registry record  → (future) knowledge extraction → Approved Knowledge → future retrieval
```

The AI draft is **never** automatically the official document. `NorRecord`
lifecycle: `draft → in_review → approved → published → superseded`
(`nor-record-contract.js#NOR_STATUS_GRAPH`), with `approved` and `published`
human-gated. The editor itself is not built in Phase 0.

## 10. Model / prompt / knowledge versioning & AI audit trail

- **Provenance** (`contracts/generation-provenance-contract.js`) — attached to
  every `IntelligenceResponse` a model produced: `model`, `modelVersion`,
  `promptVersion`, `knowledgeVersion`, `generatedAt`, `requestId`, `userId`,
  `sourceModule`. Answers "which model / which prompt / which knowledge / when /
  who". Carries no secret.
- **Audit** (`contracts/audit-contract.js`) — `INTELLIGENCE_EVENT` vocabulary:
  `AI_REQUESTED`, `AI_RESPONSE_RECEIVED`, `AI_QUESTION_ASKED`, `AI_DRAFT_CREATED`,
  `AI_DRAFT_EDITED`, `AI_DRAFT_APPROVED`, `NOR_PUBLISHED`, `KNOWLEDGE_CREATED`,
  `KNOWLEDGE_APPROVED`. This is **vocabulary only** — no framework. A real
  implementation rides the existing server event outbox
  (`functions/src/events/*` — a new type is an allow-list entry) and/or the
  client action log (`js/logs.js`). No third audit system.
- **Usage** (`contracts/usage-contract.js`) — `UsageRecord` per call:
  `requestId`, `provider`, `model`, `inputTokens`, `outputTokens`,
  `estimatedCost`, `durationMs`, `success`, `errorCode`, `userId`,
  `sourceModule`, `at`. Operational observability, **not billing**; every
  quantitative field is optional and defaults to `null` so missing provider
  data never blocks the feature.

## 11. Permission model

Reuses the existing architecture exactly — **no second permission system**.

- `js/config/permission-registry.js` is the catalog (WHAT permissions exist).
  It already has a `Sarpras Intelligence` module with `sic.review.act` /
  `sic.approve.act`.
- `js/config/role-permissions.js` maps System Role → permission ids.
- `js/permission-service.js#can(id)` is the single session gate.

Phase 0 adds **no new permission id** — nothing is wired, so nothing genuinely
needs one (PART 19: "Only establish what Phase 0 genuinely needs. DO NOT blindly
add every future permission now."). Adding one would also break the deliberate
count assertions in `scripts/role-management-check.mjs` (a V1 regression).

When later phases wire real capabilities, each new id is added the same way
`sic.*` was:

| Future permission | Module | Gated surface |
|---|---|---|
| `intelligence.nor.generate` | `Sarpras Intelligence` | trigger an AI NOR draft |
| `intelligence.nor.registry.view` | `Sarpras Intelligence` | read the NOR Registry |
| `intelligence.nor.registry.manage` | `Sarpras Intelligence` | publish / supersede a NOR |
| `intelligence.knowledge.view` / `.manage` | `Sarpras Intelligence` | knowledge context surfaces |

Each: one entry in `permission-registry.js`, a grant to `admin` in
`role-permissions.js` (so admin override follows the existing pattern), and a
bump of the two count assertions in `role-management-check.mjs`. `system.admin`
does **not** auto-expand — admin holds an explicit grant list.

## 12. Data classification

`contracts/data-classification-contract.js` — three classes: `PUBLIC`,
`INTERNAL`, `RESTRICTED`. One rule: **`RESTRICTED` is never sent to an external
provider**; `PUBLIC` and `INTERNAL` are sendable (`SENDABLE_TO_PROVIDER`).
`isSendableToProvider()` fails closed on unknown input; `assertSendable()` is
the guard the future outbound path calls before handing anything to a provider;
`maxClass()` computes the ceiling of a request. `IntelligenceRequest` carries a
`classification` ceiling field.

There is deliberately **no `classify()`** — no DLP engine in Phase 0. The point
is only to stop the future integration from assuming "all application data can
be sent to OpenAI."

## 13. Failure behavior

- Master flag `intelligence.enabled` defaults **false**. Disabled ⇒ the layer
  is inert and V1 is untouched.
- The Null provider returns a typed `NOT_IMPLEMENTED` — never a throw.
- `ProviderResult` and `IntelligenceResponse` model every failure explicitly
  (`NETWORK`, `TIMEOUT`, `AUTH`, `QUOTA`, `PROVIDER_ERROR`, `INVALID_OUTPUT`,
  `DISABLED`, `DATA_NOT_SENDABLE`, `NOT_IMPLEMENTED`).
- A failed generation never publishes a NOR, never corrupts a registry record
  (writes are append-a-version), and never discards user-entered draft data —
  the draft lives in the caller/registry, not in the provider round-trip.
- No startup path imports `src/intelligence/`. Provider/backend outage cannot
  block boot.

## 14. Feature flag

`src/intelligence/config/intelligence-config.js` — frozen
`DEFAULT_INTELLIGENCE_CONFIG` + a validated mutable active layer +
`getIntelligenceConfig()` / `setIntelligenceConfig()` / `resetIntelligenceConfig()`
/ `isIntelligenceEnabled()`, mirroring `js/config/dispatch-intelligence-config.js`.
`{ enabled:false, provider:'null', defaultModel:null, request:{timeoutMs,maxOutputTokens},
numbering:{reservationEnabled:false} }`.

Connecting `enabled` to the live app (`js/config/feature-gates.js`,
`loadFeatureFlags()` in `js/app.js`, or a `/feature_flags/intelligence` RTDB
flag — all existing patterns) is a later phase. Model ids are named here and
nowhere else in application code.

## 15. Future integration points

| Phase (indicative) | Work | Touches |
|---|---|---|
| 1 | `functions/src/intelligence/intelligenceGenerate` callable + a server-backed provider file + Secret Manager secret | `functions/` (new), `src/intelligence/providers/` (new) |
| 1 | Wire `intelligence.enabled` to `feature-gates.js` / a RTDB flag | `js/config/`, `js/app.js` |
| 2 | Intelligence Service (build request → active provider → validate → audit → classify → usage) | `src/intelligence/services/` (new) |
| 2 | `intelligence.*` permissions + admin grants | `js/config/permission-registry.js`, `role-permissions.js`, `role-management-check.mjs` |
| 3 | Real NOR Registry backend (RTDB) + `publish()` + `reserveNumber()` server-side | `src/intelligence/nor-registry/backends/` (new), `functions/` |
| 3 | Migrate `js/petty-cash/petty-cash-service.js#generateNor()` onto the registry | `js/petty-cash/` |
| 4 | Conversational NOR wizard + live editable preview UI | `src/ui/` (new) |
| 5 | Knowledge extraction from published NORs → Approved Knowledge loop | `src/knowledge/`, `src/intelligence/` |

## 16. Explicit non-goals of Phase 0

Not implemented, by design: full AI NOR generation UI; conversational wizard;
automatic question generation; live editable NOR preview; any production OpenAI
generation workflow; the `functions/` AI callable; a real (non-null) provider;
automatic knowledge extraction; embeddings / vector DB / semantic search;
autonomous learning; automatic publication or approval; NOR numbering migration;
any database migration; rewiring Petty Cash's NOR flow; touching V1 behavior;
new permission ids; a V2 visual redesign.

**Phase 0 is contracts, boundaries, a dormant provider registry, a dormant NOR
Registry facade, config, docs, and tests — nothing that runs against a model.**
