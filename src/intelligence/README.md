# src/intelligence — Sarpras Intelligence (V2, Phase 0 + Phase 1)

> Status: **feature-flagged off, not mounted in any UI.** `config/intelligence-config.js#enabled`
> defaults to **false**; with it false the layer is deterministic-only (no model
> call) and V1 boots and runs identically. Phase 1 added the Intelligence
> Service, the OpenAI provider (client-safe — no key), and durable conversation
> state; the OpenAI Cloud Function (`functions/src/intelligence/`) is **staged,
> not wired into `functions/index.js`, not deployed**. See
> `docs/V2_SARPRAS_INTELLIGENCE_PHASE_1.md`.
>
> No V1 file runtime-imports this tree; `js/firebase.js` only carries a JSDoc
> type reference + the `callGenerateCompletion` httpsCallable wrapper.

## Phase 1 layout (added on top of the Phase 0 contracts)

```
src/intelligence/
  service/
    intelligence-service.js    the orchestrator — handle() / continueSession() /
                               getSession() / cancelSession(). Composes the EXISTING
                               src/conversation + src/knowledge + src/organizational-memory
                               via injected ports; never calls a model API directly.
    default-ports.js           wires those ports to the real V2 services
    clarification.js           conversation missingFacts → questions; the recipient
                               gate (ASK, never invent — PART 8/15)
    nor-draft-assembler.js     resolved facts (+ optional model prose) → a structured
                               IntelligenceDraft; sets NO official number
  providers/
    model-completion-contract.js   the small browser↔server envelope (ONE CJS mirror)
    openai-provider.js             client-safe; complete() delegates to an injected
                                   callModel port (= the Cloud Function). No key/endpoint.
  retrieval/
    knowledge-retrieval.js     read-only Approved-Knowledge bridge (no promote path)
    memory-retrieval.js        read-only archive bridge + recipient-pattern summary
  conversation/
    contracts/intelligence-conversation-contract.js   durable IntelligenceConversation
    intelligence-conversation-store.js + backends/    facade + null/memory backends
                                                      (RTDB backend registered server-side later)
```

## What this is

The boundary and contracts for **Sarpras Intelligence** — the layer that will
eventually orchestrate AI-assisted work (NOR generation, document analysis,
knowledge-grounded answers) on top of the existing V2 Knowledge Platform
(`src/knowledge/`), Organizational Memory (`src/organizational-memory/`), and
Document Intelligence (`src/document-intelligence/`).

Phase 0 builds **only the foundation**: request/response contracts, the AI
provider abstraction, the NOR Registry + NOR numbering ownership boundary, and
the audit / usage / classification / config vocabularies. No generation
workflow is implemented — see `docs/V2_SARPRAS_INTELLIGENCE_ARCHITECTURE.md`
§16 for the explicit non-goals.

## Layout

```
src/intelligence/
  config/
    intelligence-config.js        master flag (default OFF) + tunables. NO secrets.
  contracts/
    intelligence-request-contract.js    IntelligenceRequest — the app's ask, in app terms (PART 6)
    intelligence-response-contract.js   IntelligenceResponse — completed | needs_input | draft |
                                        requires_review | error (PART 7)
    provider-contract.js                the AI provider interface — mirrors
                                        js/prediction/prediction-provider.js (PART 4)
    generation-provenance-contract.js   model / promptVersion / knowledgeVersion / … (PART 16)
    audit-contract.js                   INTELLIGENCE_EVENT vocabulary (PART 17) — no framework
    usage-contract.js                   per-request usage/cost record (PART 18) — observability, not billing
    data-classification-contract.js     PUBLIC | INTERNAL | RESTRICTED; RESTRICTED never sent (PART 20)
  providers/
    null-provider.js                    the default inert provider — always NOT_IMPLEMENTED
  provider-registry.js                  register / get / list / setActive — Null active by default
  nor-registry/                         THE canonical, module-independent NOR Registry (PART 9–13)
    contracts/
      registry-contract.js              backend interface + RegistryResult envelope
      nor-record-contract.js            canonical NOR identity + lifecycle graph + source-module registry
      nor-numbering-contract.js         the numbering OWNERSHIP boundary; re-exports the one
                                        suggestNextNumber() authority; reservation = NOT_IMPLEMENTED
    backends/
      null-nor-registry-backend.js      default inert backend
    nor-registry.js                     the cross-module facade + registry events
  index.js                              public barrel — imported by nothing yet (dormancy proof)
```

## Dependency direction (one-way, non-negotiable)

```
src/knowledge/  ─────────────────┐  (may be read, read-only)
src/organizational-memory/  ─────┼──▶  src/intelligence/   ──▶  (future) server-backed AI provider
src/document-intelligence/  ─────┘                                    └── holds the credential; browser never does
```

- `src/intelligence/` **may read** `knowledge/`, `organizational-memory/`,
  `document-intelligence/` (read-only, one-way). It exercises exactly one such
  edge today: `nor-registry/contracts/nor-numbering-contract.js` re-exports
  `organizational-memory/numbering-engine.js#suggestNextNumber` — the same edge
  `src/intake/nor-numbering-context.js` already uses.
- **None** of those trees may ever import `src/intelligence/`.
- `src/knowledge/` in particular must remain fully buildable, queryable, and
  reviewable with **zero** AI providers registered — forever.

## Security

No provider secret appears anywhere in this tree, in `js/`, in `index.html`, in
client config, or in browser storage. The OpenAI / other-provider credential
lives only server-side (Cloud Functions + Secret Manager) — see
`docs/V2_SARPRAS_INTELLIGENCE_ARCHITECTURE.md` §4–§5. A future real provider is
a thin client that calls the authenticated Sarpras backend; it never embeds a
key. `scripts/intelligence-security-scan-check.mjs` enforces this.

## Verification

- `node scripts/intelligence-foundation-check.mjs` — contracts, provider
  registry, NOR Registry, numbering boundary, config-off-by-default, dormancy.
- `node scripts/intelligence-security-scan-check.mjs` — no client-side secret,
  no browser-side provider call.
