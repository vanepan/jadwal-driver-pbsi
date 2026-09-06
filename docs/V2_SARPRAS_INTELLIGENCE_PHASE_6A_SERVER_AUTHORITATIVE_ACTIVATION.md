# V2 — Sarpras Intelligence Phase 6A: Server-Authoritative Activation

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
Phase-6 sub-flag `config.generation.certifiedRetrieval` remains **false**
(default). Zero OpenAI calls. Zero model use. Zero production mutations.
No V1 change. No Petty Cash change. No renderer change. No NOR Registry
numbering/publication change. **No `database.rules.json` change** (0 rule
keys). **One intentional exception**: `functions/index.js` now wires
`intelligenceNorGeneration` — this is the phase's single sanctioned
production-surface code change (§25/§36), and it is **not deployed**.

Builds on Phase 6.

> The client requests generation.
> The server determines organizational authority.
> The generator consumes certified context.
> The draft records the generation snapshot.
> The human remains the final approval gate.

---

## 1. Architecture Discovery

Phase 6 already built the pure boundary (`src/intelligence/generation/*` +
the CJS mirror + the STAGED `intelligenceNorGeneration` callable). Phase 6A
inspected the two remaining trust gaps before writing anything:

1. **The client-side ESM service composed its own `generationContext`.**
   `default-ports.js`'s `retrieval` port ran `retrieveNorContext` locally
   over the browser's Style Guide / Visual Template store facades (Null
   backends by default) — technically pure and safe (Null ⇒ `unavailable`
   ⇒ blocked), but not what a production deployment should rely on: the
   real, server-gathered approved records never entered the picture unless
   a future phase wired them in.
2. **`intelligenceNorDraft.create` persisted `record.provenance` verbatim.**
   `provenance.generationContext` — including anything claiming
   `certified_style_rule` / `approved_template` — flowed from
   `data.record` straight into `store.createDraft(db, record)` with **no
   verification whatsoever**. A caller that reached the callable directly
   (bypassing the honest console/service code) could persist a draft
   claiming full certification while citing rule/template ids that were
   never approved, or that used to be approved and no longer are.

Everything else — the gate (`certification-gate.js`), the projections
(`style-slot-resolver.js`, `visual-template-binding.js`), the composer
(`build-generation-context.js`), the contract (`generation-context-contract.js`
+ its CJS mirror), the Phase 4 draft schema, the Phase 5 Registry lifecycle,
`js/intelligence-console.js`'s review workspace, `js/intelligence-backend-wiring.js`'s
composition pattern, `canUseIntelligence` — was reused exactly as Phase 6
left it. No second retrieval implementation, no second gate, no new
storage.

---

## 2. Callable Activation

`functions/index.js` now:

```js
const { intelligenceNorGeneration } = require('./src/intelligence/intelligenceNorGeneration');
...
exports.intelligenceNorGeneration = intelligenceNorGeneration;
```

Nothing else changed in `functions/index.js`. Per §25/§36, no OTHER staged
callable (`intelligenceCorpus`, `intelligenceStyleGuide`,
`intelligenceVisualTemplate`, `intelligenceRetrieval`) was wired alongside
it — a static check asserts they still are not exported. This is the
phase's **one** architectural exception to "no production-surface code
change"; the export exists in source only — **no `firebase deploy` has run**.

---

## 3. Server Retrieval (§2, §3, §26)

The browser never composes certification/gate/authority itself. The new
client-side port:

```
js/intelligence-backend-wiring.js#serverAuthoritativeRetrievalPort()
        │  ports.retrieval.buildGenerationContext({documentType})
        ▼
callIntelligenceNorGeneration({op:'generationContext', documentType})   js/firebase.js
        ▼
functions/src/intelligence/intelligenceNorGeneration.js   (unchanged since Phase 6 — already server-authoritative)
        │  gathers approved Style Guide + Visual Template records itself
        │  retrieveNorContext(...) → evaluateGenerationContext(...) → buildGenerationContext(...)
        ▼
intelligence-generation-context@1   (returned UNMODIFIED to the browser)
```

`createWiredIntelligenceConsoleController` now overrides
`buildDefaultPorts().retrieval` with this port. **Fail-closed**: if the
callable cannot be reached (unwired/undeployed today, a network failure, or
a malformed reply), the port constructs an honest
`GENERATION_BLOCKED_UNAVAILABLE` context locally via the existing
`makeGenerationContext` — the **only** place the browser ever builds a
GenerationContext itself, and it only ever builds the unavailable one. No
duplicate retrieval implementation was created (§3); `default-ports.js`'s
original ESM-composed port remains the pure/offline fallback for tests.

---

## 4. Generation Context — server-owned fields

| Field | Owner |
|---|---|
| `documentType` | client-requested, **server-validated** against `RETRIEVAL_DOCUMENT_TYPES` |
| `scope` | server-fixed `'organization'` (unchanged since Phase 5.x.7) |
| `certification` / `gate` / `status` / `blocked` | 100% server-derived (`evaluateGenerationContext`) |
| actor | `request.auth.uid` (unused for this read-only callable beyond audit) |
| every `certified_style_rule` / `approved_template` claim | verified against the LIVE canonical stores by [intelligenceNorDraft.js](functions/src/intelligence/intelligenceNorDraft.js) before a draft can persist (§15, below) |

A client-supplied `certification`, `gate`, `blocked`, `authorityState`,
`approvedBy`, `version`, `scope`, or rule/template id is **ignored** by
`intelligenceNorGeneration` (unchanged Phase 6 behaviour, re-verified
adversarially in this phase) and **rejected** by `intelligenceNorDraft`'s
new cross-check if it disagrees with the live records.

---

## 5. Draft Server Cross-Check (§15 — the core of this phase)

New module: [generationContextVerifier.js](functions/src/intelligence/generationContextVerifier.js).
Called from `intelligenceNorDraft`'s `create` op **before** `store.createDraft`.

**What it does NOT do**: re-run `retrieveNorContext` (no `listRules` /
`listTemplates` call anywhere in it — asserted by a static check), re-derive
a different context, or "repair" a bad one. It performs **point lookups**
(`styleGuideStore.getRule(ruleId)`, `visualTemplateStore.getTemplate(templateId)`)
and a field-level comparison, then returns a binary accept/reject.

**Verification, per claimed authority:**

1. `null` (legacy mode) → always **accept**.
2. Not a structurally valid `intelligence-generation-context@1` → **reject**, `INVALID_GENERATION_CONTEXT`.
3. `retrieval.documentType` ≠ the server-fixed `'NOR'` (V2 intake is
   NOR-only) → **reject**, `INVALID_GENERATION_CONTEXT`.
4. For every `certified_style_rule` slot (single-value + terminology list):
   the `ruleId` must resolve; `status === 'approved'`; `version` must match;
   `value` and `category` must match byte-for-byte; `documentType` must
   match (or be `cross_type`-compatible with the recorded `viaCrossType`
   flag). Any lookup failure or mismatch → **reject**
   (`INVALID_GENERATION_CONTEXT` for a non-existent/wrong-content rule,
   `STALE_GENERATION_CONTEXT` for one that existed and was approved but no
   longer is, or whose version has moved on).
5. For an `approved_template` visual binding: the same pattern against
   `getTemplate`, **plus** a byte-for-byte comparison of `pageModel`,
   `regions`, `typography`, `spacing`, `structuralRules` — a real
   `templateId` cited with **tampered geometry** is rejected exactly like a
   forged id.
6. A `blocked:true` context must carry zero certified authority (defence in
   depth on top of `isGenerationContext`'s own structural invariant).

**Outcome:** `{ok:true}` or `{ok:false, code, message}`. On rejection, the
whole `create` fails — **nothing partially persists**.

`provenance.visualBinding` is **always server-derived** from the
just-verified `generationContext.visual` — it is never read from the
client's copy, closing the redundant "second unverified place to smuggle a
directive."

**No new storage, no new RTDB node.** The verified `generationContext`
persists exactly where Phase 6 put it: inside the existing free-form
`draft.provenance` bag.

---

## 6. Fallback Matrix — unchanged from Phase 6

The hybrid incomplete policy is **not** touched: missing approved Style
Guide → `GENERATION_ALLOWED_WITH_FALLBACK` + visible warning; missing
approved Visual Template → `GENERATION_BLOCKED_INCOMPLETE`. See
[Phase 6's doc §8](V2_SARPRAS_INTELLIGENCE_PHASE_6_CERTIFIED_RETRIEVAL_NOR_GENERATION.md#8-fallback-matrix-24-25)
for the full table — Phase 6A only makes the inputs to that matrix
server-authoritative; it does not change the matrix itself.

---

## 7. Provenance UI (§20-23)

`js/intelligence-console.js`'s review workspace gained a compact
**"Pembuatan Draf"** section (built once per draft signature, alongside the
existing status/fields sections) that renders **only** what the
server-authoritative `generationContext` says — the console calculates
nothing (§24):

- **Mode** — `Intelligence`.
- **Retrieval** — `Bersertifikat` / `Tidak lengkap` / `Konflik` / `Tidak
  tersedia` (a direct label for `certification`).
- **Gaya** (style) — `PBSI Style Guide · N aturan bersertifikat`,
  `Fallback deterministik`, or `Konvensi baku` (certified but no rule
  needed for that slot — never mislabelled as a fallback).
- **Tata letak** (visual) — `PBSI Visual Template vN` or `Fallback
  deterministik`.
- A visible **warning box** (`.sic-ws__warn--gen`) whenever `fallbacks[]` is
  non-empty, naming which slot(s) fell back.
- An expandable `<details>` ("Rincian teknis") with rule/template ids,
  versions, document type, retrieval timestamp, and conflict-id refs — no
  secrets, no full corpus bodies, no rationale text.

**Blocked generation (§22)**: an unmissable `.sic-ws__blocked` banner
(bold, red, danger-styled) renders as the **first** element in the
workspace — before "Konteks percakapan," before the status pill — instead
of the normal "Pembuatan Draf" panel. It never reads like an ordinary
success with a small warning underneath. The editable draft fields still
render below it (a human may still complete the draft manually, fully
informed that no certified authority was used).

Legacy mode (no `generationContext` on the draft) renders **nothing new** —
byte-identical to the pre-Phase-6A workspace.

A **reload** (`resumeDraft`) now also carries `generationContext` /
`visualBinding` through (`draftRecordToView`'s persisted-record branch was
missing this — fixed), so the disclosure survives a page refresh, not just
the initial generation turn.

---

## 8. Security

- **Authorization** unchanged: `canUseIntelligence(auth.token)`
  (`role==='admin' || adminEquivalent`). No new permission.
- **Zero-trust matrix** (adversarial tests A-J from §29, all passing):

| Attack | Surface | Result |
|---|---|---|
| A/C forged `certification` / forged rule | `intelligenceNorGeneration`, `intelligenceNorDraft` | ignored / rejected |
| B forged `authorityState` | both | rejected (`isGenerationContext` / `isNorRetrievalContext` invariant) |
| D forged Visual Template (id + tampered geometry) | `intelligenceNorDraft` | rejected, `INVALID_GENERATION_CONTEXT` |
| E forged actor | `intelligenceNorDraft` | `auth.uid` wins, client `ownerId` discarded |
| F forged organization/scope | `intelligenceNorGeneration` | ignored, server-fixed `'organization'` |
| G historical corpus text as authority | n/a — the generator never sees raw corpus; only approved-rule ids can appear, and each is verified | rejected if it doesn't resolve to an approved rule |
| H proposal id as certified | `intelligenceNorDraft` | rejected — a Writing-Memory / non-rule id never resolves via `getRule` |
| I numbering injection | `intelligenceNorDraft` | `numbering.publishedNumber` forced `null` (pre-existing Phase 4 invariant, re-verified) |
| J publication injection (`status:'published'`) | `intelligenceNorDraft` | rejected outright — `NOR_DRAFT_STATUS_LIST` only permits `requires_review` |

- **Read-only retrieval**: `intelligenceNorGeneration` performs no database
  write (static-scanned). The verifier performs only `getRule`/`getTemplate`
  reads (static-scanned: no `.set`/`.update`/`.push`/`.transaction`
  anywhere in the three touched server files).
- **Typed error codes** (§27): `DRAFT_STORE_ERRORS.INVALID_GENERATION_CONTEXT`
  / `.STALE_GENERATION_CONTEXT` (mirrored ESM + CJS), distinct from every
  existing code; a curated Indonesian sentence added to the console's
  `ERROR_TEXT` map for each. No stack trace ever reaches the client.

---

## 9. V1 Safety

- `legacy` generation mode is unaffected: `assembleNorDraft` with no Phase 6
  args is still byte-identical (Phase 6's own regression, unchanged).
- Petty Cash `generateNor()`, `js/docs/*`, the `nor` renderer, NOR Registry
  numbering/publication: **not read, not imported, not modified** by any
  Phase 6A file (static-scanned).
- `functions/index.js`'s only change is the one additive export; every
  other export is untouched (diff-verified).
- `database.rules.json`: unchanged (diff-verified: no `intelligence_generation`
  node, no rule-key delta attributable to this phase).
- V1-adjacent regressions re-run and green: `official-nor-archive-check.mjs`,
  `document-intelligence-check.mjs`, `pettycash-intelligence-check.mjs`,
  `nor-composition-check.mjs`, `nor-signature-pagination-check.mjs`.

---

## 10. Tests

| Check | Scope |
|---|---|
| `node scripts/intelligence-nor-generation-activation-check.cjs` (**new**) | `functions/index.js` WIRED assertion (+ the other 4 staged callables still absent); end-to-end `intelligenceNorGeneration → intelligenceNorDraft.create` persists the identical verified snapshot; legacy/null always accepted; adversarial A/C/D/E/F/G/H/I/J; STALE (deprecate after generation, before create) vs INVALID (forged id/content/geometry) distinguished; `visualBinding` server-derived; the verifier calls only point lookups, never `listRules`/`listTemplates`/the gate; static scan (no OpenAI/RAG/HTTP/secret/numbering/publish/registry/Petty Cash/V1); `database.rules.json` unchanged |
| `node scripts/intelligence-nor-generation-check.{mjs,cjs}` (updated) | Phase 6's own suite, with the now-stale "callable is STAGED / not wired" assertion replaced by a pointer to the activation check |
| `node scripts/intelligence-console-ui-check.mjs` (extended, Puppeteer) | 3 new scenarios (certified / fallback / blocked) via a lazily-evaluated harness script (fixed a latent eager-evaluation bug in the test harness itself — `SCRIPT` entries are now factories, not pre-built objects): certified shows the PBSI Style Guide + Visual Template labels; fallback shows the visible warning and never mislabels the fallen-back slot as certified; blocked shows the unmissable banner FIRST, suppresses the normal panel, and still lets the human review the fields below it |
| `node scripts/intelligence-curation-check.cjs` (bumped) | the hardcoded "exactly 5 intelligence* httpsCallable wrappers" count → 6 (deliberate growth: `callIntelligenceNorGeneration`) |

**All 40** `scripts/intelligence-*` checks pass (39 from Phase 6 + this
phase's new activation check), including the full Phase 0-5/5.x.1-5.x.8/6
regression surface, plus the V1-adjacent NOR/Petty Cash checks above.

---

## 11. Production State

```
Feature flag:            OFF   (/feature_flags/intelligence/enabled absent)
Phase 6 sub-flag:         OFF   (config.generation.certifiedRetrieval = false)
OpenAI calls:             0
Production mutations:     0
Deployment:               NOT DEPLOYED
```

## 12. Git

```
NOT COMMITTED
NOT PUSHED
```
`HEAD` = `d7f11da` (unchanged). `functions/index.js` carries the one
intentional exports-only change described in §2; it has not been deployed.

---

## 13. Known Limitations

- **No renderer consumes `visualBinding` yet** — unchanged from Phase 6;
  still out of scope (Phase 6B, explicitly deferred — §14).
- **Style slots beyond `opening`/`closing`** are still provenance-only in
  the assembler (Phase 6's limitation, unchanged).
- **The verifier trusts `getRule`/`getTemplate`'s rehydration** — it does
  not re-validate the STORED record's own internal shape beyond what those
  functions already guarantee (an existing, pre-Phase-6A guarantee of
  `styleGuideStore.js` / `visualTemplateStore.js`).
- **A stale snapshot is rejected outright, not auto-regenerated.** If the
  Style Guide/Visual Template changes between the `intelligenceNorGeneration`
  call and the `intelligenceNorDraft.create` call, the human must trigger a
  new generation (the console does not currently retry automatically). This
  is a deliberate, documented §16 policy choice — see §5 above — not an
  oversight.
- **`intelligenceNorDraft`'s `update` op was already incapable of touching
  `provenance`** (edits are restricted to `DRAFT_EDITABLE_FIELDS`, verified
  pre-existing) — Phase 6A did not need to change it, but this phase is the
  first to rely on that fact for security, so it is called out explicitly
  here rather than left implicit.

## 14. Recommended Next Step

**Phase 6B — Deterministic Renderer Consumption of the Certified Visual
Template.** Teach `js/docs/templates/nor.js` (or a new, additive rendering
path) to read the persisted `draft.provenance.visualBinding` when its
`source` is `approved_template`, and fall back to the existing `nor`
Document Design System v1 otherwise — with its own review, its own tests,
and its own deploy decision. Not implemented here, per this phase's explicit
scope limit (§10 of the Phase 6A brief).
