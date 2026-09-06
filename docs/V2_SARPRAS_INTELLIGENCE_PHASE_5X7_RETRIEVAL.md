# V2 — Sarpras Intelligence Phase 5.x.7: Certified Retrieval Integration

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
Zero OpenAI calls. Zero model use. Zero RAG / vector DB / embeddings. Zero
external HTTP. Zero production mutations. No V1 change. No NOR generator /
NOR draft / NOR Registry / publication / Petty Cash / Style Guide-writer /
Visual Template-writer / corpus / KnowledgeItem change. **No
`database.rules.json` change** (0 rule keys). No `functions/index.js`
change.

Builds on Phase 5.x.1–5.x.6.

> **Retrieval may certify approved organizational context.
> Retrieval must never manufacture authority.**

---

## 1. Purpose

ONE certified, **read-only** retrieval gateway — the final safety boundary
before a FUTURE NOR generator:

```
Corpus → Writing Memory → Style Guide ─┐
                                       ├─▶  CERTIFIED RETRIEVAL  ─▶  (future) NOR generator
                       Visual Templates ┘
```

A downstream consumer asks **one** function — `retrieveNorContext(...)` —
and receives a structured, deterministic result telling it exactly what
approved organizational rules it is allowed to trust, and — just as
importantly — when it is **not** allowed to proceed (a conflict, a gap, or
an un-queryable subsystem).

Certification is a **statement about the state of approved organizational
knowledge**, never a prediction, never a best-effort guess.

---

## 2. Architecture position

### 2.1 ESM gateway — `src/intelligence/retrieval/` (pure, dormant)

| File | Role |
|---|---|
| `contracts/nor-retrieval-contract.js` | `nor-retrieval-context@1` + `nor-retrieval-request@1`. `RETRIEVAL_CERTIFICATION_STATUS` (`certified` / `incomplete` / `conflict` / `unavailable`), `RETRIEVAL_DOMAIN_STATUS` (`resolved` / `conflict` / `missing` / `unavailable`), `RETRIEVAL_DOCUMENT_TYPES` (reused from the corpus types), `makeNorRetrievalRequest` (server-shapes the request — **scope is forced `organization`**), `makeNorRetrievalContext` / `isNorRetrievalContext` |
| `nor-context-retrieval.js` | `retrieveNorContext({ styleRules, visualTemplates }, request, { at })` — the ONE composer. It adds **no** resolution logic: it reuses `resolveEffectiveRule` / `findStyleGuideConflicts` / `queryStyleGuide` (Phase 5.x.5) and `resolveEffectiveTemplate` / `findVisualTemplateConflicts` / `queryVisualTemplates` (Phase 5.x.6). PURE, deterministic, read-only. |

Re-exported from `src/intelligence/index.js` (Phase 5.x.7 block). Sibling of
the existing Phase-1 `retrieval/knowledge-retrieval.js` /
`retrieval/memory-retrieval.js` (untouched).

### 2.2 Server — `functions/src/intelligence/` (CJS, STAGED, undeployed)

| File | Role |
|---|---|
| `norRetrievalContract.js` | the CJS **drift mirror** of the ESM contract + composer — dependency-free of `src/`; it `require`s the sibling `styleGuideContract.js` / `visualTemplateContract.js` and composes them, adding no resolution logic. |
| `intelligenceRetrieval.js` | HTTPS callable v2, region `asia-southeast1`, **no secrets**. `canUseIntelligence` gate. Gathers ALL Style Guide rules + ALL Visual Templates (organization-wide) from their stores, hands them to the PURE composer. A store that cannot be queried ⇒ `null` for that domain ⇒ that domain is `unavailable`. **Read-only** — no `.set` / `.update` / `.push` / `.transaction` anywhere. **NOT** wired into `functions/index.js`; the CJS check exercises it via `.run()`. |

### 2.3 Storage

**None.** The gateway is composition over the existing
`/intelligence_style_guide` and `/intelligence_visual_templates` nodes,
read through their Phase 5.x.5 / 5.x.6 stores. **No new RTDB node, no
`database.rules.json` change** (deep-compared: 0 rule keys added, 0
changed).

---

## 3. Source hierarchy

| Level | Contents | In the certified context? |
|---|---|---|
| **1 — Authoritative** | Approved Style Guide rules · Approved Visual Templates | **Yes** — the only thing in the authoritative sections |
| **2 — Supporting evidence** | Temporal evidence · Writing Memory ids · corpus observation / document ids · rationale · approval metadata | Only as `supportingEvidence` refs (§12) — never as an effective rule |
| **3 — Non-authoritative** | Proposed / rejected / deprecated Style rules · proposed / rejected / deprecated Visual Templates · unapproved historical evidence | **Never** — filtered out before resolution |

`getEffectiveStyleGuide` / `getEffectiveVisualTemplates` return APPROVED
only; the gateway calls `queryStyleGuide({status:'approved'})` /
`queryVisualTemplates({status:'approved'})` before any resolution and
**never** reconstructs a rule from Writing Memory, promotes a candidate,
infers approval, or majority-votes.

---

## 4. Certified retrieval contract

### Request — `nor-retrieval-request@1`

```
{
  schema, documentType (mandatory — RETRIEVAL_DOCUMENT_TYPES.* — §16),
  scope: 'organization',              // SERVER-FORCED; a client value is normalised away (§20/§21)
  categories: 'all' | string[],       // §17 — validated to STYLE_RULE_CATEGORIES, sorted
  slots: [{category, key}],           // §17 — explicit (category,key) targets
  regionKinds: 'all' | string[],      // §18 — validated to VISUAL_REGION_KIND, sorted
  includeSupportingEvidence: boolean  // default true
}
```

### Response — `nor-retrieval-context@1`

```
{
  schema, generatedAt, request,
  certification: {
    status: certified | incomplete | conflict | unavailable,   // §7
    styleGuide:     { status: resolved | conflict | missing | unavailable },   // §10
    visualTemplate: { status: resolved | conflict | missing | unavailable },
    reasons: string[]                                            // human-readable why
  },
  styleGuide: {
    status,
    rules: [ {
      scope, category, key, documentType,
      outcome: resolved | conflict | missing,
      viaCrossType: boolean,                                     // §16
      rule: { ruleId, value, normalizedValue, version, authorityState: 'authoritative', approvedAt, approvedBy, rationale } | null,
      competingRuleIds: string[],                                // when conflict
      supportingEvidence: { sourceMemoryIds, sourceObservationIds, sourceDocumentIds, temporalEvidence, evidence:{...,confidence} } | null
    } ]
  },
  visualTemplate: {
    status, outcome, viaCrossType,
    template: { templateId, variant, templateVersion, authorityState:'authoritative', approvedAt, approvedBy, rationale, documentType, pageModel, regions (projected to regionKinds — §18), structuralRules, typography, spacing } | null,
    competingTemplateIds: string[],
    supportingEvidence: { sourceObservationIds, sourceDocumentIds, temporalEvidence, evidence:{...,confidence} } | null
  },
  supportingEvidence: {
    styleGuide:     { ruleIds, sourceMemoryIds, sourceObservationIds, sourceDocumentIds },
    visualTemplate: { templateIds, sourceObservationIds, sourceDocumentIds }
  },
  conflicts: {
    styleGuide:     [ { scope, category, key, documentType, competingRuleIds, competing:[{ruleId,value,version,evidence,temporalEvidence}] } ],
    visualTemplate: [ { scope, documentType, competingTemplateIds, competing:[{templateId,variant,templateVersion,pageModel,evidence,temporalEvidence}] } ]
  },
  provenance: { styleGuideSchema, visualTemplateSchema, styleRuleCount, approvedStyleRuleCount, visualTemplateCount, approvedVisualTemplateCount, note }
}
```

It is **structured machine-readable context** — never a `contextText`, never
a giant prompt string (§26).

---

## 5. Style Guide integration

`retrieveNorContext` builds a **plan** of `(category, key)` slots:

- explicit `request.slots` win;
- else, for `request.categories !== 'all'`, every distinct key that has an
  approved rule in each requested category — plus a **synthetic `missing`
  slot** for any requested category with no approved key (so a real gap is
  reflected);
- else (`categories: 'all'`), every distinct `(category, key)` among the
  approved rules for the document type.

Each slot is resolved with `resolveEffectiveRule` (Phase 5.x.5). **§16
cross-type fallback:** the exact document type is tried first; only when it
is `missing` is `cross_type` consulted, and the result is tagged
`viaCrossType: true`. An exact-type conflict is **never** hidden by a clean
`cross_type` resolution.

**No hidden ranking (§25):** the gateway only ever calls the fail-closed
resolvers; ≥ 2 incompatible approved rules for a slot → `conflict`, no
`value`, both `competingRuleIds`. Nothing is chosen by confidence,
frequency or recency.

---

## 6. Visual Template integration

`resolveEffectiveTemplate({ scope, documentType })` (Phase 5.x.6), with the
same exact-then-`cross_type` fallback (§16). If no approved template exists
→ `outcome: 'missing'`, `template: null` — **never** fabricated, never
defaulted to A4, never a legacy or unapproved candidate (§6, §22).

`request.regionKinds` projects `template.regions` to the requested kinds
(§18) — a pure projection that **does not** change certification. The
gateway is a composition layer, not another geometry engine.

---

## 7. Temporal + provenance

- **Temporal evidence (§15)** — every approved rule / template carries its
  `temporalEvidence` bag (`temporalStatus`, `conventionEra`, dated counts,
  drift signals) into `supportingEvidence`. It is **context**, not a
  decision input: the gateway **never** rejects an approved rule because
  its evidence is old, and **never** promotes a recent candidate.
  Human-approved authority remains authority until explicitly superseded /
  deprecated.
- **Provenance (§12, §13)** — for each authoritative result:
  `ruleId` / `templateId`, `version`, `sourceMemoryIds`,
  `sourceObservationIds`, `sourceDocumentIds`, `temporalEvidence`,
  `rationale`, `approvedAt` / `approvedBy`. Compact ID-first references —
  **no full corpus document, no private body text** (there is none in
  these records). The aggregate `supportingEvidence` rollup lists every
  rule / template id actually used, so a consumer can trace
  `Style Rule → Writing Memory → Corpus Observation → Historical Document`.
- **Authority ≠ confidence (§14)** — a rule that reaches the context always
  carries `authorityState: 'authoritative'` and **no** `confidence` field.
  Confidence lives only in `supportingEvidence.evidence.confidence`,
  clearly separated. A high-confidence proposed rule remains
  non-authoritative — it never appears.

---

## 8. Conflict semantics

Fail closed. Domain and certification statuses are never silently collapsed
(§22).

| Situation | `styleGuide.status` / `visualTemplate.status` | `certification.status` |
|---|---|---|
| every requested authoritative component resolved, no conflict | `resolved` / `resolved` | **`certified`** |
| a requested authoritative component does not exist | at least one `missing` | **`incomplete`** |
| ≥ 2 incompatible approved rules **or** templates | at least one `conflict` | **`conflict`** |
| a required subsystem could not be queried | at least one `unavailable` | **`unavailable`** |

Precedence: `unavailable` > `conflict` > (`certified` iff both `resolved`) >
`incomplete`.

**Cross-domain (§10):** a Style Guide conflict is **not** hidden because
the Visual Template resolves, and vice-versa — both `certification.styleGuide.status`
and `certification.visualTemplate.status` are reported, and
`conflicts.styleGuide[]` / `conflicts.visualTemplate[]` are **both**
exposed when both domains conflict (Fixture F). Every competing side
carries its ids, versions, variants, page models and evidence — **no
automatic winner** (§8, §9, §25).

---

## 9. Missing vs unavailable (§23)

Four states, never conflated:

- **`missing`** — the subsystem was queried successfully; nothing approved
  exists ("no rule exists" / the "resolved-empty" case).
- **`unavailable`** — the subsystem could **not** be queried ("the rule
  system could not be asked").
- **`conflict`** — approved rules exist but disagree.
- **`resolved`** — an approved rule was found.

The callable passes `null` (not `[]`) for a domain whose store `list`
returned `!ok` or threw. The future generator needs to distinguish "there
is no approved recipient convention" from "the Style Guide store is down".

---

## 10. Determinism (§24)

Same rule sets + same request ⇒ **byte-identical** context. Verified:
reversing the rule-set order → identical; running twice → identical;
identical request from a different caller → identical `styleGuide` +
`certification`. Everything is sorted — style slots by `category|key`,
evidence id lists deduped + sorted, conflicts by
`status|scope|category|key|documentType`. No dependence on database
insertion order or JS object-iteration order.

---

## 11. Security model

- **Authorization** — `canUseIntelligence(auth.token)` (`role === 'admin'
  \|\| adminEquivalent`). **No new permission.**
- **Actor** — not needed for read-only retrieval (no on-record audit); the
  metadata-only `logger.info` still records `auth.uid`.
- **Scope** — `organization`, **forced server-side**. The callable
  **never** reads `data.scope` / `data.authorityState` / `data.approvedBy`
  / `data.approvedAt` / `data.createdBy` / `data.version` /
  `data.sourceDocumentIds` / `data.tenantId` (statically asserted). The
  client controls only `documentType`, `categories`, `slots`,
  `regionKinds`, `includeSupportingEvidence`.
- **No forged authority** — authority comes **only** from the approved
  records in storage. A forged `authorityState` / `approvedBy` / `version`
  in the request has no effect; every returned rule / template carries
  `authorityState: 'authoritative'` (`isNorRetrievalContext` enforces it).
- **Read-only (§19)** — the callable performs **no** database write of any
  kind; the DB is byte-identical after a call, even when a store read
  fails.
- **No secret / model / RAG / vector / embedding / outbound HTTP / V1 /
  NOR Generator / NOR Registry / NOR Draft / Petty Cash / knowledge-write /
  feature-flag / renderer** coupling (statically scanned).

---

## 12. Future generator boundary (§27)

The future NOR generator will consume this as:

```
const ctx = await retrieveNorContext(...);
if (ctx.certification.status === 'certified') {
  // the authoritative context may be used.
} else if (ctx.certification.status === 'conflict') {
  // MUST NOT silently proceed as if certified — surface the conflict.
} else if (ctx.certification.status === 'incomplete') {
  // may require human clarification or an explicit fallback policy (a FUTURE phase).
} else { // 'unavailable'
  // the rule system could not be queried — do not generate.
}
```

**That generator behaviour is NOT implemented now.** This phase only
establishes the boundary.

---

## 13. Explicit non-goals

- generating NOR, modifying a NOR draft, publishing, or wiring the NOR
  generator to this gateway;
- wiring `intelligenceRetrieval` into `functions/index.js` + `firebase
  deploy`;
- any new RTDB node or `database.rules.json` change;
- any production UI;
- OpenAI, RAG, vector search, embeddings, external HTTP retrieval;
- ranking approved rules by confidence / frequency / recency;
- reconstructing a Style rule from Writing Memory, promoting a candidate,
  or inferring approval;
- caching (the composer is cheap + pure; a cache is a future concern);
- multi-tenant scope — the repo is single-organization.

---

## 14. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-retrieval-check.mjs` | contract (server-shaped request, forced scope, dropped unknown categories/regionKinds); `documentType` mandatory; fixtures A–N (certified / incomplete×2 / style conflict / visual conflict / both conflict / proposed-only / historical-only / proposed+approved / superseded v1→v2 / deprecated-not-effective / unavailable / determinism / forged authority); §14 authority≠confidence; §16 cross-type fallback (exact wins, cross_type tagged); §18 region projection; §19 read-only; §25 no hidden ranking; §26 no context string |
| `node scripts/intelligence-retrieval-check.cjs` | CJS ⇄ ESM drift parity (schemas / enums; `retrieveNorContext` byte-identical on certified / style-conflict / unavailable / both-missing); callable auth/authz/op matrix + `documentType` required; A certified end-to-end through the real 5.x.5 / 5.x.6 CJS stores; D style conflict → `conflict`; L a store read failure → `unavailable` (not `[]`), 0 writes; read-only (DB byte-identical); forged `scope` / authority ignored; determinism across callers; static scan (no OpenAI/RAG/vector/embedding/HTTP/secret/V1/generator/write); `functions/index.js` staging assertion |

Both pass. **All 34** `scripts/intelligence-*` checks pass. Knowledge
(acquisition / promotion / review-workflow / ownership) + Organizational
Memory + Organizational Knowledge + Document Intelligence + NOR
(composition / signature-pagination / official-archive) + Petty Cash
Intelligence + permission-service + permission-runtime + role-management +
custom-roles + RTDB hardening functions + user/role permission-overrides-
rules + Vercel module-serving regression **green**.

**Two pre-existing, unrelated failures** — `rtdb-sibling-rules-check.mjs`
and `rtdb-hardening-phases-2to7-check.mjs`: both `JSON.parse` the
`//`-commented `database.rules.json` and fail at **position 2039 / line
68** — the Phase 1 (`d9f65ea`) comment. `git stash` of the rules file to
`HEAD` fails at the identical position. **Phase 5.x.7 makes no
`database.rules.json` change.**

---

## 15. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `HEAD` = `d7f11da` (`docs(v2): record Phase 5 deploy details`).
- `/feature_flags/intelligence/enabled` still absent → OFF.
- OpenAI calls = 0. Model use = 0. RAG / vector / embeddings = none.
  External HTTP = none. Production mutations = 0. V1 unchanged.
- `intelligenceRetrieval` **NOT** in `functions/index.js`.
  `functions/index.js` unchanged.
- `database.rules.json` — **unchanged by this phase** (0 rule keys added,
  0 changed; the `M` status is carried from 5.x.1 / 5.x.5 / 5.x.6).
- New files: `src/intelligence/retrieval/contracts/nor-retrieval-contract.js`,
  `src/intelligence/retrieval/nor-context-retrieval.js`,
  `functions/src/intelligence/{norRetrievalContract,intelligenceRetrieval}.js`,
  `scripts/intelligence-retrieval-check.{mjs,cjs}`, this doc. Modified:
  `src/intelligence/index.js` (+20 — one export block).

---

## 16. Known limitations

- **No caching** — the composer re-derives on every call. It is pure and
  cheap (two `list` reads + a resolve per slot); a cache is deferred.
- **`categories` enumeration is over EXISTING approved rules** — for
  `categories: 'all'` there can be no "missing" slot (nothing was asked
  for a specific key). A specific `slots` / `categories` request surfaces
  gaps.
- **The synthetic `missing` slot for an empty requested category** carries
  `key: null` — a caller filtering on `key` should treat `key === null` as
  "the whole category is absent".
- **`intelligenceRetrieval` needs wiring at deploy** — STAGED like every
  Phase 5.x.* callable.
- The two `rtdb-*` regression checks cannot parse the `//`-commented rules
  file (pre-existing since Phase 1).

---

## 17. Recommended next phase

**Phase 5.x.8 — Human Curation** (a review/curation workspace over the
proposed Style Guide rules + proposed Visual Templates + surfaced
conflicts, so an operator can approve / reject / supersede from one
place). Not implemented here.
