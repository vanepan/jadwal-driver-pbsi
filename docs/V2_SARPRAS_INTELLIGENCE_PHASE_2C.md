# V2 — Sarpras Intelligence Phase 2B-3 → 2D (Live boundary + server-owned conversation state)

> Status: **implemented + tested, uncommitted.** Feature flag still **OFF**.
> `generateCompletion` is **deployed**; `intelligenceConversation` is **wired but NOT
> deployed**. `database.rules.json` is **unchanged** (the Phase 1 staged
> `intelligence_conversations` block already satisfies the rule requirement and is
> **not deployed**). No UI. No OpenAI production call.
>
> Builds on Phase 2A (`cb15816`).

---

## 1. Phase 2B-3 — live deployed-function smoke test

**Target:** the deployed `generateCompletion` (Cloud Function v2, `asia-southeast1`,
nodejs20, `OPENAI_API_KEY` v1 bound — confirmed via `firebase functions:list` +
`functions:log`).

Unauthenticated `POST` to
`https://asia-southeast1-schedule-driver-pbsi.cloudfunctions.net/generateCompletion`:

```
HTTP 401
{"error":{"message":"Login diperlukan.","status":"UNAUTHENTICATED"}}
```

| Acceptance item | Result | How |
|---|---|---|
| callable endpoint reachable | **PASS** | HTTP 401 from the function's own handler |
| authentication enforced | **PASS** | no auth → `UNAUTHENTICATED` ("Login diperlukan." = `generateCompletion.js`'s own line) |
| secret binding no startup/runtime failure | **PASS** | deployed with `OPENAI_API_KEY` v1 bound; `functions:log` shows `Default STARTUP TCP probe succeeded`, `state: ACTIVE`, no cold-start error |
| no OpenAI call | **PASS** | rejected at the auth gate (before the flag check / key read / OpenAI call); log shows no OpenAI/network activity |
| authorization (admin gate) — deployed | **BLOCKED** | needs an authenticated **admin ID token**; unobtainable without real credentials or a security bypass (both forbidden), and no emulator (no JVM in this environment) |
| feature-flag → typed `DISABLED` — deployed | **BLOCKED** | same reason |

The BLOCKED items are covered against the **identical deployed source** by
`scripts/intelligence-functions-check.cjs`'s `generateCompletion.run()` matrix
(the deployed function == the source at `cb15816`; no source change since):

| `generateCompletion.run(...)` | Result |
|---|---|
| no auth | `HttpsError('unauthenticated')` — **PASS** |
| authenticated non-admin | `HttpsError('permission-denied')` — **PASS** |
| admin + malformed envelope | `HttpsError('invalid-argument')` — **PASS** |
| admin + flag OFF (RTDB flag node absent → defaults) | `{ ok:false, error:{ code:'DISABLED' } }` **returned, not thrown** — **PASS** |
| global `fetch` trapped throughout | never invoked — **PASS (no OpenAI call)** |

## 2. Phase 2C — server-owned conversation state architecture

**Extends** Phase 1 (`src/intelligence/conversation/` — contract, store facade,
`null`/`memory` backends). Adds the persistence backend + its server boundary.

```
browser / future UI
   │  createIntelligenceService(...).handle() / .continueSession()
   ▼
Intelligence Service (ESM)  ──── store facade (async since Phase 2C) ────┐
                                                                        ▼
                                          'callable' IcBackend (ESM, new)
                                          src/intelligence/conversation/backends/
                                            callable-intelligence-conversation-backend.js
                                                                        │  callConversation({op,convId,record})
                                                                        ▼
                          intelligenceConversation  (Cloud Function v2, CJS, new)
                          functions/src/intelligence/intelligenceConversation.js
                            • auth: request.auth.uid required
                            • authz: canUseIntelligence(token)  (admin pilot — reused)
                            • owner = request.auth.uid  ALWAYS (client actorId overwritten)
                            • op ∈ create | get | append | list
                                                                        │
                                                                        ▼
                          conversationStore.js  (CJS, new — Admin SDK)
                            RTDB  /intelligence_conversations/{convId}
                            (rule ".write": false — this is the SOLE writer;
                             sanitize→set, once→rehydrate around RTDB's
                             empty-object/array drop)
```

- **No second architecture.** The `callable` backend implements the SAME
  `IcBackend` (`get`/`save`/`list`) interface as `null`/`memory`.
  `conversationContract.js` (CJS) mirrors ONLY the server-relevant parts of the
  Phase 1 contract; a drift test keeps them equal.
- **Async store.** `src/intelligence/conversation/intelligence-conversation-store.js`'s
  `getConversation`/`createConversation`/`appendConversation`/`listConversations`
  now `await` the backend and return a `Promise` of the **unchanged**
  `{ ok, data, error }` envelope. `intelligence-service.js` `await`s its store
  calls; `getSession`/`cancelSession` became `async`. The sync memory/null
  backends are unaffected (`await` passes a non-Promise through). Phase 1 test
  updated: 3 `getSession` calls gained `await`.

### Schema — `IntelligenceConversation` (unchanged from Phase 1)

`convId`, `version` (append-only, +1 per turn), `actorId` (the only reader/writer),
`actorRole`, `sourceModule`/`sourceFeature`, `task`, `domainType`,
`openingUtterance`, `collectedFields`, `missingFields`, `status`
(`needs_input`/`ready`/`drafted`/`error`/`cancelled`), `draft`, `numbering`,
`turnCount`, `turns[]` (per-turn: `turn`,`at`,`answers`,`status`,`missingFields`,`requestId`),
`knowledgeRefs`, `memoryRefs`, `createdAt`, `updatedAt`.

## 3. RTDB path

`/intelligence_conversations/{convId}` — the convention **staged in Phase 1**
(`database.rules.json`, commit `a861ab5`). Reused verbatim; no new path invented.

## 4. RTDB security rules

**Unchanged this phase.** The Phase 1 staged block already implements the minimum:

```jsonc
"intelligence_conversations": {
  ".write": "false",                        // server-only (Admin SDK bypasses); no client write, ever
  ".indexOn": ["actorId"],                  // for listByActor
  "$convId": {
    ".read": "auth != null && (data.child('actorId').val() === auth.uid
              || auth.token.role === 'admin' || auth.token.role === 'developer'
              || auth.token.adminEquivalent === true)"
  }
}
```

- **authenticated access** — the root is deny-by-default; `$convId/.read` requires `auth != null`.
- **ownership** — a viewer may `.read` only a node whose `actorId` is their own uid (admins/dev excepted, matching every other admin-readable node).
- **permitted mutation** — none from clients; the `intelligenceConversation` function (Admin SDK) is the sole writer and derives ownership from the verified context.
- **no arbitrary cross-user access** — enforced by both the `.read` rule and, for writes, the function's `actorId === uid` check.
- **no V1 rule weakened, no unrelated path touched.**

Validation: `firebase deploy --only database --dry-run` → *"rules syntax … is
valid" / "Dry run complete!"* — **not deployed.** Deploying the rule is an
explicit later step, alongside deploying `intelligenceConversation`.

Emulator-based rules tests (`@firebase/rules-unit-testing`) **could not run** —
no JVM in this environment. Ownership/isolation is instead proven by
`scripts/intelligence-conversation-backend-check.cjs` (the function + store
against a faithful in-memory RTDB fake) and `scripts/intelligence-e2e-multiturn-check.mjs`.

## 5. Conversation ownership (PART D)

- The owner is **`request.auth.uid`, always** — `intelligenceConversation.js`
  does `const record = { ...incoming, actorId: uid }` on every `create`/`append`,
  overwriting whatever the client sent. `get`/`append` on a stored record whose
  `actorId !== uid` → `FORBIDDEN`.
- No client-supplied owner id / role / permission is trusted.
- Reuses the existing authorization surface: the `role` claim from the verified
  token + `serverPermissions.canUseIntelligence` (admin pilot). **No second auth
  system, no new permission id.**

## 6. Multi-turn contract (PART G) — `scripts/intelligence-e2e-multiturn-check.mjs`

Every turn's state crosses the server boundary (`op:create`/`get`/`append` →
`conversationStore` → fake RTDB); nothing is held in the ESM process between turns.

| Turn | Input | Result |
|---|---|---|
| **1** | "Buatkan NOR pembelian mesin potong rumput." | `needs_input`; asks `item, quantity, purpose, budget`; `type` (Pengadaan, from "pembelian") **not** asked. **Persisted** v1, owner `evan`. **PASS** |
| **2** | `{ quantity, item, budget }` ("2 unit, Honda GX35, ~Rp4jt/unit") | `needs_input`; `item`/`quantity`/`budget` **not re-asked**. **Persisted** v2 with accumulated fields. **PASS** |
| **3** | `{ purpose }` ("perawatan lapangan PBSI") | every field-schema fact known → the one remaining item is the **recipient** (`needs_input` `[recipient]` — PART L, asked never invented). **Persisted** v3. **PASS** |
| **4** | `{ recipient: 'Bendahara' }` | `requires_review` + **structured draft** (`documentType:'nor'`, `fields.{subject,recipient,date,body,…}`); `review.blocking === true`; `numbering.suggestedNumber` present, `publishedNumber === null`; no `norNumber`. **Persisted** `status:'drafted'` v4. **PASS** |

Variant (consistent recipient history injected): TURN 3 reaches the draft
directly, `recipient` **proposed** from history (`recipientStatus:'proposed'`,
a human still confirms) — different NOR, different recipient, no fixed constant.
**PASS**

Enabled-provider variant: the model is called **once** for the body;
`bodySource:'model'` + `provenance.model` land in the persisted draft. **PASS**

## 7. OpenAI E2E test (PART H) — **NOT PERFORMED (BLOCKED)**

A real OpenAI request requires the feature flag ON. The flag is
`/feature_flags/intelligence/enabled` in production RTDB — a **global** switch
(read by `getIntelligenceRuntimeConfig`); there is **no** test-only / per-user /
per-request override. Enabling it would:

1. activate Sarpras Intelligence for **every admin** of the live app, and
2. require a production RTDB write to `/feature_flags/intelligence`.

Per PART H ("If the current architecture only supports a global feature flag,
STOP … Do not assume permission to enable production AI") and PART S
(production-wide feature activation is a STOP condition), **the flag was not
enabled and no OpenAI call was made.** The provider request/response/validation
path is fully covered with a stubbed `fetchImpl`
(`intelligence-functions-check.cjs`: 200-success + every typed failure mode) and
a fake `callModel` (`intelligence-provider-openai-check.mjs`,
`intelligence-e2e-multiturn-check.mjs` enabled variant).

**Required approval to proceed:** an explicit decision to write
`/feature_flags/intelligence/enabled = true` (or to build a narrower
test-scoped flag first), plus a way to issue an authenticated admin call to the
deployed function.

## 8. Structured-response validation (PART I)

The provider result is never trusted as a business object.
`openai-provider.complete()` requires a well-formed `ModelCompletionResult`
(else `INVALID_OUTPUT`); `openaiClient.callChatCompletion` maps a non-JSON body
/ empty completion / HTTP error to typed codes and **never echoes** the
provider's message. The Intelligence Service uses the model output **only** as
the letter body prose inside a deterministically-assembled `IntelligenceDraft`
— it never becomes `status`, `norNumber`, `recipient`, or an approval. A model
failure degrades to the deterministic template body; the draft and every
human-entered fact stay intact; nothing is published or persisted malformed.

## 9. Prompt-injection / context boundary (PART J)

`modelBodyFor()` builds a fixed **system** message (the drafting instruction +
"use ONLY the given facts; do not invent numbers/dates/recipients/budget"), a
separate **user** message carrying the collected facts, and a clearly-labelled
"pola/istilah dari pengetahuan yang disetujui" block for retrieved Approved
Knowledge. User content and retrieved knowledge are **data inside the user
message**, never system instructions. Authorization, the human-review
requirement, numbering authority, and knowledge permissions are all enforced in
code **before** the prompt is built and **after** the reply returns — the model
cannot change any of them. Knowledge is retrieved read-only and never
re-enters as Approved Knowledge (no promote/ingest path is imported).

## 10. Knowledge access (PART K)

`retrieveApprovedKnowledge` filters to `lifecycleState === 'approved'` for the
request's `domainType`/`norType` and calls `authz.canAccessKnowledge(actor,
domainType)` first — an unauthorized actor's request is refused **before** the
model is asked. No fake knowledge records were created; the E2E test uses the
real (empty in this environment) `knowledge-service`.

## 11. Recipient / "Kepada" (PART L)

`recipient` is **not** a field in any NOR-type schema and is **never invented**.
Resolution: supplied by a human → used verbatim; a ≥70%-consistent archive
majority → **proposed** (`recipientStatus:'proposed'`); otherwise → `needs_input`
(one recipient question). Supports known / unknown / consistent-history /
ambiguous. Tested for both "asked" and "proposed" paths.

## 12. NOR numbering (PART M)

No official number is issued. `draft.numbering.suggestedNumber` may carry the
advisory value (from `src/organizational-memory/numbering-engine.js`, via the
Phase 0 Registry re-export); `publishedNumber` is always `null`; the draft
`fields` carry no `norNumber`. Petty Cash numbering untouched.

## 13. Auditability (PART N)

Every turn is traceable: `requestId` (per `IntelligenceRequest`), `convId`,
`actorId`, `sourceModule`, and — model-backed responses — `provenance`
(`model`, `promptVersion:'nor-draft@1'`, `knowledgeVersion`, `generatedAt`,
`userId`, `sourceModule`). `IntelligenceConversation.turns[]` is itself the
per-turn audit trail. The `intelligenceConversation` function logs
**metadata only** (`op`, `actor`, `convId`, `ok`, `errorCode`, `version`,
`status`) — never the record body, never a token. `generateCompletion` logs
metadata only — never the key, prompt, or completion.

## 14. Failure tests (PART O) — all "controlled error, no crash/leak/publish"

| Scenario | Result |
|---|---|
| provider unavailable / throws | degrade to template body; `modelError` reported — **PASS** |
| invalid provider response | `INVALID_OUTPUT` typed; template body — **PASS** |
| unauthorized user | `FORBIDDEN` (service) / `permission-denied` (function) — **PASS** |
| unauthenticated request | `HttpsError('unauthenticated')` — **PASS** (live + `.run()`) |
| nonexistent conversation | `NOT_FOUND` envelope; service → controlled error — **PASS** |
| wrong conversation owner | `FORBIDDEN`; stored record not mutated — **PASS** |
| feature flag OFF | typed `DISABLED`; no OpenAI call — **PASS** |
| missing conversation state / bad key | `INVALID_RECORD` / `NOT_FOUND` — **PASS** |
| malformed request | `HttpsError('invalid-argument')` / `INVALID_REQUEST` — **PASS** |

## 15. Files changed

**New (6):** `functions/src/intelligence/{conversationContract,conversationStore,
intelligenceConversation}.js`,
`src/intelligence/conversation/backends/callable-intelligence-conversation-backend.js`,
`scripts/intelligence-conversation-backend-check.cjs`,
`scripts/intelligence-e2e-multiturn-check.mjs`.

**Modified (6):** `functions/index.js` (+`intelligenceConversation` export —
**staged, not deployed**), `js/firebase.js` (+`callIntelligenceConversation`
wrapper; corrected a stale comment on `callGenerateCompletion`),
`src/intelligence/conversation/intelligence-conversation-store.js` (async facade
+ `callable` backend registration + `useCallableIcBackend`),
`src/intelligence/service/intelligence-service.js` (`await` store calls;
`getSession`/`cancelSession` async),
`scripts/intelligence-service-check.mjs` (`await` 3 `getSession` calls),
`scripts/intelligence-functions-check.cjs` (+behavioural matrix, +2C wiring
checks, dir-scan for secrets).

**`database.rules.json`: NOT changed.**

## 16. Deployment status

Nothing deployed this phase. Pending explicit approval:
1. `firebase deploy --only functions` (or `:intelligenceConversation`) — the
   dry-run passes; the codebase packages and analyses clean.
2. `firebase deploy --only database` — deploys the staged
   `intelligence_conversations` rule (dry-run valid). **Must ship with #1.**
3. (Later / separate approval) enable the Intelligence feature flag for a real
   OpenAI E2E.

Pre-existing deploy warnings (not from this work): nodejs20 deprecation
(decommission 2026-10-30), `firebase-functions@^6.1.0` outdated.

## 17. Non-goals honoured (PART S)

No Intelligence UI, dashboard, chat, NOR editor, live editable preview, NOR
publication, NOR Registry migration, automatic Knowledge extraction/learning,
fine-tuning, vector DB, or Petty Cash migration.
