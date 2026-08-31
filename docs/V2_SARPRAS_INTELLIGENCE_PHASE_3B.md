# V2 — Sarpras Intelligence — Phase 3B: Minimal Console UI

**Status:** implemented, tested, **not committed / not deployed**. Production feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.

Phase 3B adds the first user-facing Sarpras Intelligence surface. It is intentionally small: it proves one browser round-trip and nothing more.

```
user input → Intelligence Service (createIntelligenceService)
           → server-owned conversation (intelligenceConversation callable)
           → needs_input  → user answers → continueSession()
           → requires_review  → read-only draft summary
```

No editable preview, no publish, no NOR Registry, no official numbering, no knowledge ingestion, no autonomous action, no navigation/auth redesign.

---

## 1. Starting state

- Phases 0–3A shipped/committed: `src/intelligence/` layer (contracts, provider registry, `createIntelligenceService()`, callable conversation backend, OpenAI server boundary, client bootstrap, fail-closed feature-flag sync). HEAD `125d18b`.
- `js/intelligence-backend-wiring.js` is the single sanctioned `js/ → src/intelligence/` composition root (Phase 2F); `js/app.js#startAuthenticatedSession()` calls `wireIntelligenceBackend(appFlags)` once, post-auth, behind `isV2Enabled` (pilot = `admin` + `evan`).
- A large **dormant** platform already exists at `src/ui/sarpras-intelligence-center.js` (a separate, older lineage: `src/intake/`, `src/reasoning/`, `src/knowledge/`). It is **not** touched by Phase 3B.
- The Sarpras Intelligence rail item + workspace host `#v2SarprasIntelWorkspace` already exist, gated by `isV2Enabled` + `canAccessModule('sarprasIntelligence')`.
- No Intelligence UI consumed `createIntelligenceService()` yet.

---

## 2. UI architecture chosen

**Reuse the existing entry point; branch on the synced flag.**

`navSarprasIntelligence()` (the existing rail handler, already pilot-gated) gains one branch: when the **synced** Intelligence flag is ON (`intelligenceFeatureActive`, captured from the Phase 3A wiring status), it mounts the Phase 3B console into the **existing** `#v2SarprasIntelWorkspace` host. When the flag is OFF (production default), the branch is dead and the dormant platform mounts exactly as before. No new rail item, no new workspace, no new nav architecture.

Three layers, matching the codebase's DI style:

| Layer | File | Role | Testable in Node |
|---|---|---|---|
| Pure state machine | `src/intelligence/console/intelligence-console-controller.js` | idle→loading→needs_input→review→error; maps `service.handle` / `service.continueSession` envelopes; error-code → curated Indonesian text; double-submit guard; never throws | ✅ |
| Composition bridge | `js/intelligence-backend-wiring.js` → `createWiredIntelligenceConsoleController()` | builds ONE `createIntelligenceService({ ports: buildDefaultPorts(), provider: getActiveProvider(), authz: <client pre-check>, config, idgen })` and wraps it in the controller | static only (imports `js/firebase.js`) |
| DOM view | `js/intelligence-console.js` | builds the shell once, patches regions on each controller change (input node never replaced → focus/caret survive); scoped `.sic-console` stylesheet; imports **only** the bridge + `js/auth.js` | via puppeteer harness |

The view imports the bridge, never `src/intelligence/` directly, never `js/firebase.js`, never a callable — the single-composition-root invariant is preserved (`intelligence-foundation-check.mjs` still passes).

---

## 3. Files changed

**New (6):**
| File | Lines | Purpose |
|---|---|---|
| `src/intelligence/console/intelligence-console-controller.js` | 258 | pure console state machine |
| `js/intelligence-console.js` | 275 | DOM view + mount/unmount |
| `scripts/intelligence-console-check.mjs` | 272 | Node test — controller + static bridge/app.js assertions |
| `scripts/intelligence-console-harness.html` | 94 | offline puppeteer harness (import-map data: stubs + fake service) |
| `scripts/intelligence-console-ui-check.mjs` | 201 | puppeteer responsive + flow + safety test (7 viewports) |
| `docs/V2_SARPRAS_INTELLIGENCE_PHASE_3B.md` | — | this report |

**Modified (4):**
| File | Change |
|---|---|
| `js/intelligence-backend-wiring.js` | + `createWiredIntelligenceConsoleController({ actor, onChange })`; + imports of `createIntelligenceService`, `buildDefaultPorts`, `getActiveProvider`, config, controller; + `makeConversationId()` (RTDB-safe id for the service's `idgen`) |
| `js/config/module-loader-registry.js` | + `loadIntelligenceConsole` (memoized lazy `import('../intelligence-console.js')`) |
| `js/app.js` | + module vars `intelligenceFeatureActive` / `intelligenceConsoleMounted`; capture `wiringStatus.featureEnabled` in the Phase 3A block; + flag-gated one-shot console mount branch in `navSarprasIntelligence()`; + `loadIntelligenceConsole` import |
| `src/intelligence/index.js` | + re-export `createIntelligenceConsoleController`, `CONSOLE_PHASE` |

`database.rules.json`, `functions/**`, `src/ui/sarpras-intelligence-center.js` — **untouched**.

---

## 4. Service integration

- **First turn:** `service.handle(makeIntelligenceRequest({ requestId, actor: { userId, role, sourceModule: 'intelligence' }, task: REQUEST_TASK.NOR_GENERATE, domainType: 'nor', input: { text } }))`.
- **Later turns:** `service.continueSession(conversationId, { [questions[0].id]: answerText }, { userId, role })`. A single free-text field maps onto the current question's `id`; the service re-asks any still-missing fact on the next turn (the deterministic multi-turn loop — the "mesin potong rumput" walkthrough).
- The controller consumes the existing `{ response, conversationId, modelError }` envelope and the existing `RESPONSE_STATUS` / `RESPONSE_ERRORS` vocabularies. No new response shape.
- The bridge builds the service with `buildDefaultPorts()` (the real existing V2 domains — conversation-service, knowledge-service read, archive read, nor-registry suggestion) and `getActiveProvider()`. **No second Intelligence service, no second conversation implementation.**
- The UI never calls `callIntelligenceConversation()`, `callGenerateCompletion()`, Firebase RTDB, or OpenAI. It talks to the controller; the controller talks to the service.

---

## 5. Session lifecycle

- `conversationId` comes **only** from `response.conversationId` (the service's own `idgen`, echoed back). The UI never fabricates an id and never sends `actorId` as trusted input — the `intelligenceConversation` Cloud Function derives ownership from the verified Firebase context (Phase 2C).
- One controller per mount. `reset()` returns the view to idle **locally**; it does not cancel or delete the server-owned conversation.
- Re-entering the workspace in the same session re-shows the already-mounted console (one-shot `intelligenceConsoleMounted` guard) — it does **not** silently create a new conversation.
- No conversation state in `localStorage` / `sessionStorage`. The server-owned conversation is the source of truth.
- A flag flip mid-session takes effect on the next reload (same model as every other flag in `loadFeatureFlags()`).

---

## 6. Feature-flag behaviour

- Gate = `isV2Enabled(currentUser)` **AND** `intelligenceFeatureActive`.
- `intelligenceFeatureActive` is set from `wireIntelligenceBackend(appFlags).featureEnabled` — the Phase 3A **fail-closed** resolve of `/feature_flags/intelligence/enabled` (only the boolean `true` ⇒ ON; missing node / `"true"` / `1` / `null` / read failure ⇒ OFF).
- **Production:** the flag node is absent ⇒ `intelligenceFeatureActive === false` ⇒ `navSarprasIntelligence()` never takes the console branch, `loadIntelligenceConsole()` is never fetched, the console module never loads. The dormant platform behaves exactly as before.
- No hardcoded `enabled: true`, no local override, no RTDB write. The client flag is **not** authorization — `generateCompletion` and `intelligenceConversation` independently re-check the flag and enforce role authz server-side.

---

## 7. OpenAI safety

Verified (puppeteer + Node):

| Event | OpenAI calls |
|---|---|
| page load / module init | **0** (no request to `openai.com` / `firebaseio.com` / `cloudfunctions.net` / `googleapis.com`; 0 `service.handle` calls) |
| opening the console | **0** |
| typing | **0** (keystrokes update a local draft var only — no controller call, no re-render) |
| explicit submit | reaches the service; with the flag **OFF** the active provider is the Null Provider ⇒ deterministic **template** body, still **0** OpenAI calls |
| flag ON (test only) | body prose goes through the OpenAI provider adapter → `callGenerateCompletion` → the Cloud Function (secret stays server-side) |

The production flag was **not** turned on to test this. The UI test uses a scripted fake `createIntelligenceService()`; the controller test uses a scripted fake service; the OpenAI-provider path is covered by the existing `intelligence-e2e-multiturn-check.mjs` with a stubbed `callModel`. No `OPENAI_API_KEY` / `api.openai.com` in any client file (`intelligence-security-scan-check.mjs` passes).

---

## 8. Error handling

Every service error **code** maps to one concise Indonesian sentence in the controller; the raw `error.message` (which can carry a raw Firebase string from the callable transport) is **never** displayed.

| Code(s) | User-facing text |
|---|---|
| `FORBIDDEN` | Anda tidak memiliki akses ke Sarpras Intelligence. |
| `AUTH` | Sesi Anda perlu diperbarui. Silakan masuk kembali. |
| `INVALID_REQUEST` | Permintaan tidak dapat diproses. Coba jelaskan kembali secara singkat dan spesifik. |
| `UNKNOWN_INTENT` | Permintaan ini belum dapat dipahami. Jelaskan lebih spesifik … |
| `NOT_FOUND` | Sesi percakapan tidak ditemukan. Mulai permintaan baru. |
| `LIMIT` | Percakapan sudah terlalu panjang. Mulai permintaan baru. |
| `DISABLED` / `NOT_IMPLEMENTED` | Layanan Intelligence sedang tidak aktif. |
| `NETWORK` / `TIMEOUT` / `PROVIDER_ERROR` | Layanan Intelligence sedang tidak tersedia. Coba lagi sebentar lagi. |
| `QUOTA` | Layanan Intelligence sedang sibuk. Coba lagi nanti. |
| `INVALID_OUTPUT` | Layanan Intelligence memberi hasil yang tidak dapat dibaca. Coba lagi. |
| `DATA_NOT_SENDABLE` | Permintaan memuat data yang tidak dapat diproses secara otomatis. |
| unmapped / malformed envelope / thrown service | Intelligence tidak dapat memproses permintaan saat ini. |

A thrown/rejected service call is caught → `error` phase, controller stays alive, `busy` released. On failure the input text is **restored** and retry resumes the same conversation. No API keys, provider credentials, stack traces, raw Firebase objects, or raw OpenAI responses are ever rendered.

---

## 9. Responsive verification

`scripts/intelligence-console-ui-check.mjs` (puppeteer, real Chrome) drives the full flow at **320 / 375 / 390 / 430 / 768 / 1024 / 1440 px** and asserts at each width, in both `needs_input` and `review` states:

- `document.documentElement.scrollWidth <= innerWidth + 1` — **no horizontal page overflow**
- input + submit visible and `getBoundingClientRect().right <= innerWidth` — primary controls usable, not clipped
- review panel `right <= innerWidth` and `scrollWidth <= clientWidth` — summary not clipped, readable
- the input row wraps (`flex-wrap`), the review `<dl>` collapses to one column ≤ 520 px

Result: **82/82 checks pass.**

---

## 10. Tests

| Suite | Type | Result |
|---|---|---|
| `intelligence-console-check.mjs` | Node — pure controller + static bridge/app.js | **PASS** (≈70 checks) |
| `intelligence-console-ui-check.mjs` | puppeteer — responsive + flow + safety | **PASS** 82/0 |

Coverage: initial idle; `submit()` → one well-formed `IntelligenceRequest`; `conversationId` retained from the response; `answer()` → `continueSession(SAME id, { field: text }, actor)`; `requires_review` → read-only review state; **no publish/approve/number method on the controller**; double-submit dropped (1 `handle` call, 1 user turn); all 12 error codes + malformed + thrown; raw Firebase text never surfaced; error recoverable (input restored, retry succeeds); `answer()` before a conversation falls back to `submit()`; blank input ignored; `reset()` → idle without a cancel/delete; controller is pure (no fetch/firebase/DOM/storage); bridge builds ONE `createIntelligenceService` from `buildDefaultPorts` + `getActiveProvider`; `js/app.js` gates on `isV2Enabled` + synced flag, one-shot, mounts into the existing host, `mountIntelligenceConsole` called from exactly one place.

Existing Intelligence regression — all **PASS, 0 failing**:
`intelligence-foundation-check.mjs`, `intelligence-security-scan-check.mjs`, `intelligence-service-check.mjs`, `intelligence-provider-openai-check.mjs`, `intelligence-functions-check.cjs`, `intelligence-conversation-backend-check.cjs`, `intelligence-e2e-multiturn-check.mjs`, `intelligence-client-wiring-check.mjs`, `intelligence-feature-flag-sync-check.mjs`.

---

## 11. V1 regression

All **PASS**:

| Suite | Result |
|---|---|
| smoke-boot | exit 0 |
| startup-stability-check | 8 / 0 |
| permission-service-check | 70 / 0 |
| permission-runtime-invariant-check | 43 / 0 |
| pettycash-intelligence-check | 29 / 0 |
| official-nor-archive-check | 11 / 11 |
| organizational-memory-check | 28 / 28 |
| gudang-foundation-check | 64 / 0 |
| engineering-foundation-check | 116 / 0 |
| timeline-multiday-render-check | 33 / 0 |
| assignment-start-flow-check | 9 / 0 |
| drawer-overlay-pointer-safety-check | 35 / 0 |

**Pre-existing unrelated failure (NOT fixed):** `scripts/rtdb-hardening-phases-2to7-check.mjs` — raw `JSON.parse(database.rules.json)` chokes on that file's `//` comments; fails identically at clean HEAD (predates all V2 work). Only reads `database.rules.json`, which Phase 3B does not touch. Its comment-aware sibling `rtdb-hardening-functions-check.mjs` passes 34/34.

---

## 12. Known limitations

- One free-text field per turn: a multi-fact `needs_input` (Item/Jumlah/Tujuan/Anggaran) is answered one field at a time across turns. Deliberate for Phase 3B ("a normal text input is sufficient").
- The review summary is display-only and terminal for this phase — reaching `requires_review` is the success criterion; there is no next action.
- `createWiredIntelligenceConsoleController()` cannot run in bare Node (it imports `js/firebase.js`). It is covered structurally (static assertions) and by its constituent parts; the end-to-end UI test substitutes a fake service, so it exercises view↔controller but not the bridge's live service assembly.
- Client-side knowledge repository is empty (the console does not seed it, unlike the dormant platform) → with the flag ON the drafted body is a template unless/until knowledge is seeded elsewhere. Acceptable for a round-trip proof.
- A flag flip mid-session is picked up on the next reload, not live.

---

## 13. Explicit confirmations

- **No deployment.** `firebase deploy` was not run.
- **No production flag change.** `/feature_flags/intelligence` was not created or written (true or false).
- **No real OpenAI call.** 0 real provider calls; tests use stubs/fakes.
- **No secret changes.** Secret Manager untouched; no key in any client file.
- **No database rule changes.** `database.rules.json` untouched.
- **No commit / no push.** Awaiting explicit instruction for the checkpoint commit.
