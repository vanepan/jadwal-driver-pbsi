# V2 — Sarpras Intelligence Phase 6: Certified Retrieval → NOR Generation

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
Phase-6 sub-flag `config.generation.certifiedRetrieval` defaults **false**.
Zero OpenAI calls. Zero model use. Zero RAG / vector / embeddings. Zero
external HTTP. Zero production mutations. **No `database.rules.json`
change** (0 rule keys). **No `functions/index.js` change** —
`intelligenceNorGeneration` is authored but **NOT wired** (§45, reported
below). No V1 change. No Petty Cash / `generateNor()` / `js/docs`
renderer / NOR Registry numbering / publication change.

Builds on Phase 0–5 and Phase 5.x.1–5.x.8.

> Certified Retrieval is the **authority boundary**.
> NOR Generation is the **consumer**.
> The renderer is the **deterministic physical output layer**.
> Human review is the **final content gate**. The Registry is the
> **official lifecycle authority**. No component quietly assumes another's.

---

## 1. Architecture discovery

### 1.1 The V2 Intelligence generation pipeline (the consumer extended here)

| Concern | Location |
|---|---|
| Canonical entrypoint | `src/intelligence/service/intelligence-service.js` — `createIntelligenceService().handle()` / `.continueSession()` (task `nor.generate` only) |
| Draft build step | `buildDraftResponse()` — knowledge retrieval + archive + numbering suggestion + `modelBodyFor()` + `assembleNorDraft()`. **Did not** call the Phase 5.x.7 `retrieveNorContext`. |
| Structured assembler | `src/intelligence/service/nor-draft-assembler.js` `assembleNorDraft()` — PURE, per-field `fieldProvenance`, `numbering.publishedNumber` always `null`, `rendersVia` is a **string constant** pointing at `js/petty-cash/nor-document-engine.js#buildNorViewModel` (never an import). |
| Persistent draft | `nor-draft-record-contract.js` (`intelligence-nor-draft@1`) + `nor-draft-store.js` + deployed callable `functions/src/intelligence/intelligenceNorDraft.js` → RTDB `/intelligence_nor_drafts`. `provenance` is a **free-form object bag**. |
| Canonical registry | `nor-registry.js` + deployed `intelligenceNorRegistry.js`; `in_review → approved → published`; official number reserved **server-side at publish only**; `approveNor`/`publishNor` are HUMAN-only. |
| Console (UI state) | `src/intelligence/console/intelligence-console-controller.js` — pure state machine, mounted only for the pilot behind the OFF flag. |

### 1.2 Certified Retrieval — reused verbatim (Phase 5.x.7)

`src/intelligence/retrieval/contracts/nor-retrieval-contract.js`
(`nor-retrieval-context@1`) + `nor-context-retrieval.js`
(`retrieveNorContext({styleRules, visualTemplates}, request, {at})`). PURE.
`null` domain ⇒ `unavailable`; `[]` ⇒ `missing`. Precedence
`unavailable > conflict > certified(iff both resolved) > incomplete`.
Every returned rule carries `authorityState:'authoritative'`
(`isNorRetrievalContext` enforces it). Staged callable
`intelligenceRetrieval.js` (not wired).

### 1.3 The deterministic renderer — PROTECTED, untouched

```
js/petty-cash/petty-cash-center.js
  → svc.generateNor({expenseIds, norNumber, norDate, type})   (human types norNumber)
  → RTDB /pettyCashNor record
  → buildNorViewModel(nor)                 js/petty-cash/nor-document-engine.js
  → DocumentEngine.generate('nor', vm)     js/docs/doc-engine.js
  → template 'nor'                         js/docs/templates/nor.js  (pdfmake DocDefinition)
       geometry from js/docs/design-system/document-design-system.js  (`nor` v1)
  → js/docs/pdf-exporter.js → Blob
```

One PDF engine, one `nor` template. Fully deterministic — no AI anywhere.
The official Indonesian wording (`"Dengan hormat,"`, the two body
paragraphs, `"Demikian nota organisasi ini disampaikan…"`, `"Kepada
Yth."`, `"Lampiran: 1 (satu) berkas"`, `"Terbilang:"`) is hardcoded there.

### 1.4 V1 / V2 intersection

**None in code.** V2 references the renderer only through the `RENDERS_VIA`
string constant — never an import or a call. Phase 6 keeps it that way.

---

## 2. Integration boundary

```
                   ┌────────────────── server-owned, ONE snapshot ──────────────────┐
 request(documentType = NOR)                                                          │
        │                                                                             │
        ▼                                                                             ▼
  retrieveNorContext({ styleRules, visualTemplates }, { documentType })   ← Phase 5.x.7, ONE retrieval, no shadow retrieval (§27)
        │  nor-retrieval-context@1
        ▼
  evaluateGenerationContext(ctx)          src/intelligence/generation/certification-gate.js
        │  GENERATION_ALLOWED | _WITH_FALLBACK | _BLOCKED_CONFLICT
        │  | _BLOCKED_UNAVAILABLE | _BLOCKED_INCOMPLETE            (deterministic, confidence-blind)
        ▼
  buildGenerationContext(ctx, { mode })   src/intelligence/generation/build-generation-context.js
        ├─ resolveStyleSlots(ctx, gate)   style-slot-resolver.js   → { slot → {source, ruleId?, version?, value?} }
        └─ bindVisualTemplate(ctx, gate)  visual-template-binding.js → approved directive OR deterministic-fallback marker
        ▼
  intelligence-generation-context@1       generation-context-contract.js
        ▼
  assembleNorDraft({ …, generationStyleContext, visualBinding, generationContext })
        ▼
  NOR draft  (generationContext rides inside draft.provenance — NO schema change)
        ▼
  requires_review  →  human edits / approves (Phase 4/5 unchanged)  →  Registry publishes (unchanged)
        ▼
  renderer  (js/docs `nor` template — DETERMINISTIC, unchanged; a FUTURE phase
             teaches it to consume `visualBinding`)
```

**New files (ESM, pure):** `src/intelligence/generation/`
`contracts/generation-context-contract.js`, `certification-gate.js`,
`style-slot-resolver.js`, `visual-template-binding.js`,
`build-generation-context.js`, `generation-fallbacks.js`, `README.md`.

**New files (CJS, staged):**
`functions/src/intelligence/generationContextContract.js` (drift mirror),
`functions/src/intelligence/intelligenceNorGeneration.js` (staged callable).

**Edited (additive, flag-gated):** `config/intelligence-config.js`
(`generation.certifiedRetrieval:false` + `isCertifiedRetrievalGenerationEnabled()`),
`service/default-ports.js` (a `retrieval` port), `service/intelligence-service.js`
(the `generationMode` switch in `buildDraftResponse` + `generationContext` on
the envelope + persisted into `draft.provenance`), `service/nor-draft-assembler.js`
(3 optional params, backward-compatible), `src/intelligence/index.js` (one export block).

**New checks:** `scripts/intelligence-nor-generation-check.{mjs,cjs}`.

---

## 3. Generation modes (§4)

Explicit, never implicitly detected:

| Mode | When | Behaviour |
|---|---|---|
| `legacy` | the default; the **only** reachable mode while `/feature_flags/intelligence/enabled` is not `true`, or while `config.generation.certifiedRetrieval` is not `true` | `buildDraftResponse` runs exactly as in Phase 1–5. `assembleNorDraft` is called with no Phase 6 args ⇒ **byte-identical** draft. |
| `intelligence` | `isIntelligenceEnabled() && config.generation.certifiedRetrieval === true` | one certified retrieval snapshot + the Phase 6 gate + style/visual binding + provenance. |

`isCertifiedRetrievalGenerationEnabled()` in `intelligence-config.js` is the
single fail-closed predicate. A non-boolean sub-flag value is ignored.

---

## 4. Retrieval boundary (§5, §27)

The generator consumes **only** the canonical Phase 5.x.7 result. It calls
`retrieveNorContext` **once** per generation and never independently queries
the Style Guide store, the Visual Template store, Writing Memory, or the
corpus. Enforced by a static check (`intelligence-nor-generation-check.mjs`:
no `*-store` / `/corpus/` import in any `generation/*.js`).

The `retrieval` port:

- **default** (`default-ports.js`) — composes `retrieveNorContext` over the
  Style Guide + Visual Template store facades (read-only). With the Null
  backends active (the default) each domain is `unavailable` ⇒ the gate
  **blocks**. The only safe default.
- **server-authoritative** — the staged `intelligenceNorGeneration` callable
  gathers the approved records org-wide and runs the same PURE composer.
  Prefer this in production (§28); wiring it is the recommended next step.

`domainType` → retrieval `documentType`: `'nor' → 'NOR'`; anything else →
`'UNKNOWN'` (which the gate treats as `incomplete` and **blocks**). No
silent cross-type (§16); a `cross_type` rule/template fallback is handled
*inside* `retrieveNorContext` and tagged `viaCrossType` in provenance.

---

## 5. Certification gate (§6) — `evaluateGenerationContext(retrievalContext)`

Deterministic. Reads **only** `certification.status` and the two per-domain
statuses — **never** a confidence, frequency, document count, or recency
(verified: a 0.01-confidence and a 0.99-confidence approved rule reach the
same outcome). Fail-closed on a malformed context.

Outcomes and the **Phase 6 hybrid incomplete policy** (product decision,
§8):

| Retrieval state | Gate outcome | `generationStatus` |
|---|---|---|
| both domains `resolved` (⇒ `certified`) | `GENERATION_ALLOWED` | `generated` |
| Style Guide `missing`, Visual Template `resolved` | `GENERATION_ALLOWED_WITH_FALLBACK` | `generated_with_fallback` |
| Visual Template `missing` (Style `resolved` or `missing`) | **`GENERATION_BLOCKED_INCOMPLETE`** | `blocked_incomplete` |
| any domain `conflict` | `GENERATION_BLOCKED_CONFLICT` | `blocked_conflict` |
| any domain `unavailable` | `GENERATION_BLOCKED_UNAVAILABLE` | `blocked_unavailable` |
| domains `resolved` but overall certification ≠ `certified` | `GENERATION_BLOCKED_INCOMPLETE` (defensive) | `blocked_incomplete` |
| `documentType` not a `RETRIEVAL_DOCUMENT_TYPE` | `GENERATION_BLOCKED_INCOMPLETE` | `blocked_incomplete` |

**Rationale for hybrid (§8):**
*style-missing ⇒ fallback* — the deterministic wording defaults already
exist (`js/docs/templates/nor.js` literals) and are already what today's V2
draft uses; falling back is the documented status quo, tagged
`deterministic_fallback`, and raises a visible review warning; the output is
**never** labelled certified.
*visual-missing ⇒ block* — the official document's physical layout is its
legal appearance; it is never guessed. A human must approve a Visual
Template first.

A **blocked** gate applies **no authority** (§9): style slots resolve to
`deterministic_fallback`, `visual` to the fallback marker, `certifiedRuleIds`
is empty, `isGenerationContext` enforces `blocked ⇒ no certified_style_rule`
and `blocked ⇒ no approved_template`.

---

## 6. Style Guide consumption (§12) — exact slot mapping

`resolveStyleSlots(retrievalContext, gate)` projects
`retrievalContext.styleGuide.rules[]` (already APPROVED + resolved by
5.x.7) onto **named** generation slots. `STYLE_SLOT_CATEGORY_MAP` is the
deterministic, build-time-validated map. A rule only applies if its
category maps to a slot — no rule is applied globally.

| Generation slot | Style Guide category(-ies) | Deterministic default owner |
|---|---|---|
| `opening` | `opening_pattern` | `js/docs/templates/nor.js#opening` (`"Dengan hormat,"`) |
| `closing` | `closing_pattern` | `js/docs/templates/nor.js#closing` |
| `recipient_label` | `recipient_convention` | `js/docs/templates/nor.js#metaTable` (`"Kepada Yth."`) |
| `subject_label` | `subject_convention` | `js/docs/templates/nor.js#metaTable` (`"Perihal"`) |
| `date_format` | `date_convention` | `js/docs/templates/nor.js#dateLong` (`"Jakarta, {fmtLong}"`) |
| `attachment_label` | `attachment_convention` | `js/docs/templates/nor.js#metaTable` (`"Lampiran: 1 (satu) berkas"`) |
| `copy_label` | `copy_convention` | `js/docs/templates/nor.js#metaTable` (`"Tembusan Yth."`) |
| `signature_label` | `signature_wording` | `js/docs/doc-theme.js#signatureBlock` |
| `body_structure` | `body_structure` | `nor-draft-assembler.js#templateBody` |
| `formal_tone` | `formal_tone` | `nor-draft-assembler.js#modelBody` (model instruction only) |
| `terminology` (list) | `terminology` + `organizational_term` + `preferred_phrase` | none — absence imposes no constraint |

Each single-value slot reports:

- `source: 'certified_style_rule'` + `ruleId`, `version`, `category`, `key`,
  `documentType`, `viaCrossType`, `value` — **or**
- `source: 'deterministic_default'` + `reason` — the domain is `resolved`
  but carries no rule for this slot; **nothing approved is overridden** (no
  warning), **or**
- `source: 'deterministic_fallback'` + `reason` — the Style Guide domain was
  `missing`; a visible warning is raised (§37).

Deterministic pick within a category: the lexicographically-smallest `key`
(keys are unique per category — a total order). `TERMINOLOGY` is a list —
every resolved term rule contributes an entry.

**What the assembler actually applies now:** a certified `opening` /
`closing` rule **wraps the deterministic template body** (the one place the
assembler controls text). All other slots are carried as provenance for a
**future renderer step** — Phase 6 does **not** rewrite `js/docs/templates/nor.js`
(§44).

---

## 7. Visual Template consumption (§13, §14, §32)

`bindVisualTemplate(retrievalContext, gate)` →

- `{ source: 'approved_template', templateId, templateVersion, variant,
  viaCrossType, pageModel, regions[], typography, spacing, structuralRules }`
  — a **render directive**. Geometry is passed **through untouched**: a
  `null` width / margin / coordinate / font **stays `null`**. This module
  **never** invents A4, margins, coordinates, fonts, or spacing (§14). The
  renderer decides what a `null` means (its own governed default for that
  one value).
- `{ source: 'deterministic_fallback', reason }` — the existing `nor`
  Document Design System v1 is the renderer default.

**Phase 6 does not build a renderer that consumes the directive.** It
produces + binds it onto the draft so a future renderer step can. The LLM
never positions logo / title / metadata / signature / footer / body (§13,
§32).

**Template selection order** (deterministic, in `retrieveNorContext`): exact
approved `documentType` → approved `cross_type` (tagged `viaCrossType`) →
deterministic `nor` DDS v1 → block. Never an unapproved proposal; never
historical-only as current authority.

---

## 8. Fallback matrix (§24, §25)

| certification | styleGuide | visualTemplate | outcome | style | visual | disclosure |
|---|---|---|---|---|---|---|
| certified | resolved (rule for slot) | resolved | `ALLOWED` | `certified_style_rule` | `approved_template` | `styleSource: certified` |
| certified | resolved (no rule for slot) | resolved | `ALLOWED` | `deterministic_default` (no warning) | `approved_template` | — |
| incomplete | missing | resolved | `ALLOWED_WITH_FALLBACK` | `deterministic_fallback` + **warning** | `approved_template` | `styleSource: deterministic_fallback` |
| incomplete | resolved | missing | **`BLOCKED_INCOMPLETE`** | none | fallback marker | "no approved Visual Template" warning |
| incomplete | missing | missing | **`BLOCKED_INCOMPLETE`** | none | fallback marker | as above |
| conflict | conflict | * | `BLOCKED_CONFLICT` | none | none | conflict refs surfaced |
| conflict | * | conflict | `BLOCKED_CONFLICT` | none | none | conflict refs surfaced |
| unavailable | unavailable | * | `BLOCKED_UNAVAILABLE` | none | none | "certified context unavailable" |
| unavailable | resolved | unavailable | `BLOCKED_UNAVAILABLE` | none | none | as above |
| — | invalid `documentType` | — | `BLOCKED_INCOMPLETE` | none | none | — |

Every fallback is explicitly tagged and (for style-fallback) a visible
review warning. A **partially** certified output is **never** called fully
certified.

---

## 9. Conflict behaviour (§9)

The generator **never** selects a winner — not by confidence, frequency,
document count, recency, historical prevalence, or model preference. A
`conflict` in either domain → `GENERATION_BLOCKED_CONFLICT`, `blocked:true`,
`certifiedRuleIds: []`, and `conflicts.styleGuide[]` / `conflicts.visualTemplate[]`
carry **IDs only** (`competingRuleIds` / `competingTemplateIds`) — no rule
bodies, no rationale text. The service still returns a `requires_review`
response with a **plain deterministic draft** and a blocking-disclosure
`reason`; the persisted `generationContext.status` is `blocked_conflict` so
the review UI shows a prominent warning, not ordinary metadata (§37). No
"apparently normal" NOR is ever produced that secretly used one side.

---

## 10. Unavailable behaviour (§10)

A required authoritative subsystem that could not be queried →
`GENERATION_BLOCKED_UNAVAILABLE`. No OpenAI, no guessed style, no guessed
visual template, no external fallback. The result explicitly identifies that
certified organizational context was unavailable. The output is never
silently labelled organization-aware.

---

## 11. Temporal safety (§17)

Historical evidence is evidence, not current authority. The generator
consumes the **approved** Style Guide + Visual Template only — never raw
corpus observations. A `historical`-era approved rule **still binds** as
authority (verified). `temporalEvidence` never reaches the generation
context as a decision input; the gate never rejects an approved rule
because its evidence is old and never promotes a recent candidate.

---

## 12. Provenance (§18, §19, §33)

The generation context (`intelligence-generation-context@1`) retains, per
generation:

```
{ schema, mode, gate, status, blocked, reasons[], generatedAt,
  retrieval: { certification, styleGuideStatus, visualTemplateStatus, documentType, retrievedAt },
  style:  { slots: { slot → {source, ruleId?, version?, category?, key?, documentType?, viaCrossType, value?, reason?} },
           terminology: [ …same shape… ], certifiedRuleIds: [], fallbacks: [{slot,reason}] },
  visual: { source, templateId?, templateVersion?, variant?, viaCrossType, pageModel?, regions[], typography?, spacing?, structuralRules?, reason? },
  fallbacks: [ { area:'style'|'visual', slot?, reason } ],
  conflicts: { styleGuide: [{category,key,documentType,competingRuleIds}], visualTemplate: [{documentType,competingTemplateIds}] },   // refs only
  snapshot: { styleRuleIds: [], visualTemplateIds: [], styleGuideSchema, visualTemplateSchema, retrievalSchema } }
```

- **Compact refs only** — no corpus documents, no rule/template bodies, no
  rationale text (a static check asserts `rationale` never appears in the
  persisted context).
- **One deterministic snapshot** per generation (§22): retrieval runs once;
  `snapshot.*Ids` freeze the versions into the draft; mid-generation rule
  changes cannot leak in.

---

## 13. Draft integration (§19)

The Phase 4 NOR-draft record schema, its mandatory field list, and the
deployed `intelligenceNorDraft` callable are **unchanged**. The generation
context rides inside the **existing free-form `provenance` bag**:

```
draft.provenance.generationContext   // the compact context above, or null in legacy mode
draft.provenance.visualBinding       // the render directive, or null
draft.fields.metadata.generatedBy    // 'sarpras-intelligence@phase6' when a context is present, else '@phase1'
draft.fields.metadata.fieldProvenance.body                    // 'template' | 'model' | '<src>+certified_style_rule'
draft.fields.metadata.fieldProvenance.certifiedStyleRuleIds   // present iff a certified rule bound the body
```

Legacy mode adds **no** metadata keys — `assembleNorDraft` output is
byte-identical to Phase 1–5 (verified: explicit `null` args ≡ omitted args).

**Known limitation:** the ESM `intelligence-service.js` runs client-side in
the console and the persisted `draft.provenance.generationContext` currently
travels through the existing draft-create callable, which does not re-derive
provenance. Until `intelligenceNorGeneration` is wired and `intelligenceNorDraft`
cross-checks it, the persisted copy is **advisory**; the server-authoritative
context is the callable's return value. Wiring + cross-check is the
recommended next step (§13 below).

---

## 14. Human review (§20, §21)

Unchanged. The Intelligence generator creates a **draft**
(`requires_review`) only — never `approved`, never `published`, never an
`officialNumber`. The Phase 4 Draft + Phase 5 Registry lifecycle
(`in_review → approved → published`, human-gated, optimistic concurrency)
is intact. A human edit to a style-influenced field sets `humanEdited:true`
(existing) and leaves `generationContext` as a historical record — **no**
Style-Guide write, **no** Writing-Memory promotion, **no** automatic rule
creation.

---

## 15. Numbering (§34)

Untouched. Generation creates a draft. `numbering.publishedNumber` stays
`null` (`makeNorDraftRecord` + the store both force it). No production
number is reserved because generation started. No "official-looking" number
is generated client-side.

---

## 16. Publication (§35)

Untouched. `Draft → human review → Registry → human publication`. No
automatic publication.

---

## 17. Security (§28, §29)

- **Authorization** — the existing `canUseIntelligence(auth.token)`
  (`role === 'admin' || adminEquivalent`). **No new permission id.**
- **Server owns** — the retrieval request, `documentType` (validated),
  organization scope (forced `'organization'` by `retrieveNorContext`),
  actor (`auth.uid`), the certification result, the gate outcome, the
  provenance snapshot.
- **Untrusted from the client** — `certification`, `gate`, `blocked`,
  `authorityState`, `status`, `approvedBy` / `approvedAt`, `version`,
  `scope`, approved-rule IDs, a client-supplied `generationContext`. The
  callable's `sanitizeRequest` keeps only `documentType` / `categories` /
  `slots` / `regionKinds` / `includeSupportingEvidence`. Verified: forged
  `certification:'certified'` over a real conflict → still
  `GENERATION_BLOCKED_CONFLICT`; a forged `authorityState` inside the
  context → `isNorRetrievalContext` rejects → `GENERATION_BLOCKED_INCOMPLETE`;
  forged rule ids / values / tenant strings never appear in the output.
- **Read-only** — the staged callable performs **no** database write of any
  kind (static-scanned); the DB is byte-identical after a call, even when a
  store read fails.
- **No** OpenAI secret, client-side OpenAI call, RAG / vector / embedding,
  outbound HTTP, V1 / Petty Cash / NOR Draft / NOR Registry / numbering /
  publication / renderer coupling (static-scanned in both server files).

---

## 18. Observability (§42)

Metadata-only. The staged callable's `logger.info` records: `op`, `actor`
(uid), `documentType`, `certification`, `styleGuide` / `visualTemplate`
domain status, `gate`, `status`, `blocked`, `certifiedStyleRuleCount`,
`styleFallbackCount`, `visualSource`, conflict counts. **Never** a secret,
token, credential, rationale text, or document body. The assembler's draft
`auditTrail` (`AI_DRAFT_CREATED`) is unchanged.

---

## 19. Deterministic renderer boundary (§23, §32)

Three layers, explicitly separated:

| Layer | Deterministic? | Owner |
|---|---|---|
| authority resolution (which approved rule / template binds which slot) | **yes** | `generation/*` (Phase 6) |
| layout rendering (physical page) | **yes** | `js/docs/*` `nor` template (unchanged; future phase consumes `visualBinding`) |
| content drafting (body prose) | **no** when the OpenAI provider is active; **yes** (template body) otherwise | `nor-draft-assembler.js` + the provider |

Given the same request + input data + certified retrieval snapshot, the
**structural** result (gate outcome, bound rule ids, visual directive, slot
sources) is byte-identical. Only the body prose is non-deterministic, and
only when a model provider is active — which requires the OFF feature flag.

---

## 20. Explicit non-goals

Phase 6 is **not**: a NOR-generator rewrite, a new PDF renderer, a new
template engine, a new RAG / embedding system, an OpenAI project, a
knowledge-promotion system, an automatic-approval or automatic-publication
system, a new numbering system, a V1 redesign. It does **not** wire a
renderer to consume the visual binding (that is the next phase). It does
**not** wire `intelligenceNorGeneration` into `functions/index.js` (§45).

---

## 21. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-nor-generation-check.mjs` | contract + `isGenerationContext` invariants; the full §24 matrix under the hybrid §8 policy; style-slot mapping (category→slot, certified / default / fallback); visual binding (directive vs fallback, geometry pass-through); temporal safety (historical-era rule still binds); no authority from a proposal / from confidence; provenance (snapshot ids, conflict refs are ids only, no rationale leak); determinism (reversed order + repeat ⇒ byte-identical); adversarial (forged certification / forged authorityState ignored); `assembleNorDraft` legacy byte-identical + Phase-6 wrap + blocked ⇒ no certified rule; config fail-closed; static (no shadow retrieval, no store / corpus import, no OpenAI / HTTP / secret, no numbering / publish / approve); `functions/index.js` staging assertion |
| `node scripts/intelligence-nor-generation-check.cjs` | CJS ⇄ ESM drift parity (schemas / enums / `STYLE_SLOT_CATEGORY_MAP`; `buildGenerationContext` byte-identical on allowed / style-conflict / missing-visual / unavailable / both-missing); the `intelligenceNorGeneration` callable (`.run`) auth / authz / op matrix; end-to-end through the real 5.x.5 / 5.x.6 CJS stores → `GENERATION_ALLOWED`; a MEMORANDUM request → `BLOCKED_INCOMPLETE`; a store read failure → `BLOCKED_UNAVAILABLE` + 0 writes; forged certification / authority / scope ignored + determinism across callers; static scan (no OpenAI / RAG / HTTP / secret / V1 / Petty Cash / NOR Draft / NOR Registry / numbering / publish / renderer / DB write); `functions/index.js` + `database.rules.json` staging assertions |

Both pass. **All 39** `scripts/intelligence-*` checks pass, including the
Phase 0–5 service, NOR draft, NOR registry, retrieval, curation, corpus,
style guide, visual template, feature-flag, e2e-multiturn, console,
security-scan, authz, functions and client-wiring suites (regression —
Intelligence OFF preserves every prior behaviour).

Two pre-existing, unrelated failures (`rtdb-sibling-rules-check.mjs`,
`rtdb-hardening-phases-2to7-check.mjs`) `JSON.parse` the `//`-commented
`database.rules.json` and fail at the Phase 1 comment — unchanged by Phase
6, which makes no `database.rules.json` change.

---

## 22. Production safety

- Feature flag: **OFF** (`/feature_flags/intelligence/enabled` absent).
- Phase-6 sub-flag `config.generation.certifiedRetrieval`: **false** (default).
- OpenAI calls: **0**. Model use: **0**. RAG / vector / embeddings: **none**.
  External HTTP: **none**. Production mutations: **0**.
- `intelligenceNorGeneration`: **NOT** in `functions/index.js`;
  `functions/index.js` **unchanged**.
- `database.rules.json`: **unchanged by Phase 6** (0 rule keys added, 0
  changed; the `M` status is carried from 5.x.1 / 5.x.5 / 5.x.6).
- V1 / Petty Cash `generateNor()` / `js/docs` renderer / NOR Registry
  numbering / publication: **unchanged**.

---

## 23. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `HEAD` = `d7f11da` (`docs(v2): record Phase 5 deploy details`).
- New files: `src/intelligence/generation/{contracts/generation-context-contract.js,
  certification-gate.js, style-slot-resolver.js, visual-template-binding.js,
  build-generation-context.js, generation-fallbacks.js, README.md}`,
  `functions/src/intelligence/{generationContextContract.js, intelligenceNorGeneration.js}`,
  `scripts/intelligence-nor-generation-check.{mjs,cjs}`, this doc.
- Modified: `src/intelligence/config/intelligence-config.js`,
  `src/intelligence/service/default-ports.js`,
  `src/intelligence/service/intelligence-service.js`,
  `src/intelligence/service/nor-draft-assembler.js`,
  `src/intelligence/index.js` (all additive, flag-gated; legacy path
  byte-identical).

---

## 24. Known limitations

- **No renderer consumes the visual binding yet.** Phase 6 produces + binds
  the directive; a future phase teaches `js/docs/templates/nor.js` to read
  it. The certified layout is currently *recorded*, not *applied*.
- **The persisted `draft.provenance.generationContext` is advisory** until
  `intelligenceNorGeneration` is wired and `intelligenceNorDraft`
  cross-checks it server-side (§13).
- **Only the `opening` / `closing` wording slots are applied** by the
  assembler today (it wraps the template body). The other 8 slots are
  carried as provenance for the future renderer step.
- `categories: 'all'` retrieval cannot surface a `missing` style slot (a
  5.x.7 limitation) — so "certified with zero approved wording rules"
  presents as `sgDomain: missing` ⇒ `ALLOWED_WITH_FALLBACK`, not a special
  "certified-empty" state.
- The two `rtdb-*` regression checks cannot parse the `//`-commented rules
  file (pre-existing since Phase 1).

---

## 25. Recommended next step

The smallest activation slice, **not** a generator rewrite:

1. **Wire `intelligenceNorGeneration` into `functions/index.js`** under its
   own security review (like every prior 5.x.* callable), and make
   `js/intelligence-backend-wiring.js` inject a `retrieval` port backed by
   that callable so the generation context is **server-authoritative**.
2. **Add a server-authority cross-check** in `intelligenceNorDraft`: when a
   draft's `provenance.generationContext` is present, re-derive it
   server-side and reject a mismatch (closes the §13 advisory gap).
3. **Add a compact provenance panel** to the Intelligence console (§36):
   *Generation mode · Retrieval certification · Style source · Visual source
   · Fallbacks · Conflicts · Rule/template versions* — with the blocked-status
   warning rendered prominently (§37), drill-down for the ids.

The renderer consuming the visual binding, and applying the remaining
wording slots, are separate later phases.

---

## Final principle

```
AI can help write.
Certified organizational rules can constrain.
Deterministic code controls layout.
Humans approve.
Registry controls publication.
```
