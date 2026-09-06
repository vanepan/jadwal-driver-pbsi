# V2 — Sarpras Intelligence Phase 5.x.5: PBSI NOR Style Guide

**Status:** implemented + tested, **NOT committed, NOT pushed, NOT deployed.**
Feature flag `/feature_flags/intelligence/enabled` remains **absent → OFF**.
Zero OpenAI calls. Zero RAG. Zero production Style Guide mutations. No V1
change. No NOR generator / NOR Registry / NOR draft / publication / Petty
Cash change. No KnowledgeItem promotion. No `functions/index.js` change.
One **additive, undeployed** `database.rules.json` block.

Builds on Phase 5.x.1 (Corpus Acquisition Foundation), 5.x.2 (Ingestion &
Document Analysis), 5.x.3 (Historical vs Current Convention), and 5.x.4
(Organizational Writing Memory).

> **Corpus evidence is not policy.
> Writing Memory is not authority.
> Only explicit human approval creates Style Guide authority.**

---

## 1. Purpose

The **first authority layer** in the corpus chain:

```
Historical Corpus → CorpusObservation → Temporal Interpretation →
Organizational Writing Memory (EVIDENCE) →
[THIS PHASE] PBSI NOR Style Guide (AUTHORITY) →
(future) NOR generation / retrieval
```

A `StyleRule` is an **explicit human-approved organizational writing rule** —
approved terminology, opening/closing wording, recipient/subject/date/
attachment/copy conventions, signature wording, body structure, formal
tone, preferred phrases. It is **not** a template system (no logo
coordinates, margins, font geometry, PDF positions — that is the future
Phase 5.x.6 Visual Template System, §3/§15).

Everything below Layer 5 is evidence. Layer 5 is the only layer that
represents organizational authority, and it is reached **only** by a human
who supplies a written rationale.

---

## 2. Architecture position

### 2.1 ESM Style Guide layer — `src/intelligence/corpus/style-guide/` (pure, dormant)

| File | Role |
|---|---|
| `contracts/style-guide-contract.js` | `pbsi-nor-style-guide@1`. `STYLE_GUIDE_SCOPE` (`organization` — the only value, §16), `STYLE_RULE_STATUS` + `STYLE_RULE_STATUS_GRAPH` + `STYLE_RULE_HUMAN_GATED_STATES`, `STYLE_AUTHORITY_STATE` + `authorityStateForStatus` (**derived from status**, §4/§9), `STYLE_RULE_CATEGORIES` (`= WRITING_MEMORY_CATEGORIES`, reused verbatim — §5), `DOCUMENT_TYPE_SCOPE` (reused — §6), `STYLE_RULE_EVIDENCE_FIELDS`, `STYLE_RULE_TEMPORAL_FIELDS`, `STYLE_GUIDE_AUDIT_EVENTS`, `styleRuleIdFrom`, `makeStyleRule` / `isStyleRule` |
| `contracts/style-guide-store-contract.js` | the backend interface (`list`, `get`, `proposeFromMemory`, `approve`, `reject`, `deprecate`, `resolve`, `history`) + `StyleGuideResult` envelope + `STYLE_GUIDE_ERRORS` |
| `style-guide-proposal.js` | `makeStyleGuideProposalFromMemory(memory, ctx)` — the ONE transformation; `buildStyleGuideProposals` (+ preserves conflicts as `proposalConflicts`); `makeSupersedingProposal` |
| `style-guide-authority.js` | `markApproved` (authenticated actor + **non-empty** human rationale REQUIRED), `markRejected`, `markDeprecated` — pure `{ next }` \| `{ error }` |
| `style-guide-query.js` | `getEffectiveStyleGuide` (APPROVED only), `queryStyleGuide`, `getProposedStyleRules`, `getEffectiveRulesForType`, `resolveEffectiveRule` (`resolved` \| `conflict` \| `missing`), `findStyleGuideConflicts`, `getSupersessionChain` |
| `backends/{null,memory,callable}-style-guide-backend.js` | Null (inert default), Memory (real lifecycle for tests / DISABLED mode), Callable (thin adapter over the staged function) |
| `style-guide-store.js` | THE facade — backend registry + events + 8 delegating methods (mirrors `corpus-store.js`) |

Re-exported from `src/intelligence/index.js` (Phase 5.x.5 block).

### 2.2 Server — `functions/src/intelligence/` (CJS, STAGED, undeployed)

| File | Role |
|---|---|
| `styleGuideContract.js` | the CJS **drift mirror** of the ESM contract + proposal + authority + query — dependency-free (the Functions runtime never imports `src/`) |
| `styleGuideStore.js` | server-owned persistence over `/intelligence_style_guide/{ruleId}` (Admin SDK). Zero-trust: `proposeFromMemory` takes only the Writing Memory entry the callable itself rebuilt; server forces `status`, `createdBy`, timestamps, and re-derives `authorityState`. Conflict gate on `approve`. Auto-deprecates a predecessor on approval of a superseding rule. |
| `intelligenceStyleGuide.js` | HTTPS callable v2, region `asia-southeast1`, **no secrets**. `canUseIntelligence` gate. `proposeFromMemory` rebuilds Writing Memory server-side from the caller's own corpus (`gatherOwnerCorpus` + an **injected** builder → fail-safe `WRITING_MEMORY_UNAVAILABLE`). **NOT** wired into `functions/index.js`; the CJS check exercises it via `.run()`. |

### 2.3 Storage

`/intelligence_style_guide/{ruleId}` — **STAGED, undeployed**. One additive
`database.rules.json` block; deep-compare confirms **0 changed existing
keys**. `.write: false` (Admin SDK is the only writer). `.read` is the
effective-admin tier (`role === 'admin' \|\| 'developer' \|\|
adminEquivalent`) — **organization-wide, not owner-scoped** (§16): every
effective admin reads the whole guide. `.indexOn: ["status", "category",
"documentType"]`.

---

## 3. Distinction between evidence and authority

| | Layer 4 — Writing Memory | Layer 5 — Style Guide |
|---|---|---|
| what it is | derived, evidence-backed summary of a recurring pattern | an explicit organizational rule |
| authority | never — `authorityState` is `observed` / `candidate` only | `authoritative` **iff** a human approved it |
| who decides | nobody — it is a deterministic synthesis | a human, with a written rationale |
| `current` evidence means | "recent documents show this" | nothing about approval (§7) |
| `candidate` status means | "worth a human's review" | it can seed a `proposed` rule — nothing more |

A `proposed` StyleRule copies the Writing Memory entry's value, evidence
ids, document-type distribution and temporal evidence — but its
`authorityState` is `proposed` and its `rationale` is `null`. The
transition to `authoritative` happens **only** through `approve`.

---

## 4. Canonical contract — `pbsi-nor-style-guide@1`

```
StyleRule {
  schema:              'style-guide-rule@1'
  styleGuideSchema:    'pbsi-nor-style-guide@1'
  ruleId:              'sgr_<scope>__<category>__<keySlug>__<docTypeSlug>__<fnv1a(normValue)>'  // deterministic — §13
  scope:               'organization'                       // §16 — the only value; a per-user rule is impossible
  category:            STYLE_RULE_CATEGORIES.*               // = WRITING_MEMORY_CATEGORIES (language only — §5)
  key:                 string
  value:               string                               // the VERBATIM approved wording (non-empty — §11)
  normalizedValue:     string|null
  documentType:        DOCUMENT_TYPE_SCOPE.*                 // a real type or 'cross_type' — §6
  status:              'proposed' | 'approved' | 'rejected' | 'deprecated'   // §8
  authorityState:      'proposed' | 'authoritative' | 'not_authoritative'    // DERIVED from status — §4/§9
  rationale:           string|null                          // human-written; REQUIRED non-empty when approved — §10
  sourceMemoryIds:     string[]  (>= 1 — §11)
  sourceObservationIds: string[] (>= 1 — §11)
  sourceDocumentIds:   string[]  (>= 1 — §11)
  evidence: {                                                // §11 — reference/summary, NOT a corpus copy
    occurrenceCount, documentCount,
    documentTypeDistribution: { NOR: n, MEMORANDUM: n, ... }, // NEVER collapsed — §13/§24.H
    pageNumbers: number[], extractionMethods: string[]        // where available; [] when the evidence layer has none
  }
  temporalEvidence: {                                        // §7 — EVIDENCE, not authority
    temporalStatus, conventionEra, oldestSourceDate, latestSourceDate,
    recentDocumentCount, historicalDocumentCount, conflictingDocumentCount,
    approvedRulePresent, approvedRuleMatches
  }
  confidence:          0..1                                  // carried through — NOT authority — §22
  version:             integer >= 1                          // supersession-chain position
  supersedesRuleId:    string|null                           // §15 — v2 → v1
  supersededByRuleId:  string|null                           // §15 — set on v1 when v2 is approved
  createdAt, createdBy                                       // createdBy = server actor (the proposer)
  approvedAt, approvedBy                                     // server-derived; retained on `deprecated` too
  rejectedAt, rejectedBy                                     // §10
  deprecatedAt, deprecatedBy                                 // §10 (§4 baseline)
  auditTrail:          AuditEntry[]                          // append-only; first entry is STYLE_RULE_PROPOSED
}
```

`isStyleRule` **rejects** a rule with zero evidence ids, no verbatim
`value`, an `authorityState` that does not match its `status`, an
`approved` rule with no rationale / `approvedBy` / `approvedAt`, or a
`proposed` / `rejected` rule that carries approval metadata. `makeStyleRule`
always re-derives `authorityState` from `status` — a client value is
silently discarded.

### Lifecycle

```
proposeFromMemory → proposed  (v1; get-or-create by deterministic ruleId)
approve           → approved   (human; non-empty rationale; fails closed on an unresolved conflict; a superseding rule auto-deprecates its predecessor)
reject            → rejected   (human; reason preserved; RETAINED)
deprecate         → deprecated (human; reason preserved; RETAINED + queryable; keeps its approval provenance)
approved / rejected / deprecated → immutable (a changed value is a NEW proposal, never an in-place edit)
```

---

## 5. Categories

Reused **verbatim** from Writing Memory (`WRITING_MEMORY_CATEGORIES`, §5):

`terminology`, `organizational_term`, `preferred_phrase`, `opening_pattern`,
`closing_pattern`, `recipient_convention`, `subject_convention`,
`date_convention`, `attachment_convention`, `copy_convention`,
`signature_wording`, `body_structure`, `formal_tone`.

`structure` / `layout` are **not** Style Guide categories — they belong to
the future Visual Template System (§3). `makeStyleGuideProposalFromMemory`
returns `null` for any non-language category.

---

## 6. Document-type scope

Reused verbatim (`DOCUMENT_TYPE_SCOPE`): `NOR`, `NOTA_ORGANISASI`,
`MEMORANDUM`, `LEGACY`, `UNKNOWN`, `cross_type`.

- A `MEMORANDUM` proposal keeps `documentType: 'MEMORANDUM'` — it never
  silently becomes a NOR rule.
- A `LEGACY` proposal keeps `documentType: 'LEGACY'` — it never
  automatically becomes current NOR authority.
- A `cross_type` proposal keeps `documentType: 'cross_type'` **and** the
  full per-type `documentTypeDistribution` (`{ NOR: 2, MEMORANDUM: 3 }` —
  never one number, §13/§24.H).
- `getEffectiveRulesForType(rules, 'NOR')` returns NOR + `cross_type` scope
  only — a `MEMORANDUM`-only rule never leaks into a NOR query.

---

## 7. Temporal semantics

`temporalEvidence` is carried onto every rule from the Writing Memory
entry (`temporalStatus`, `conventionEra`, dated counts, drift signals). It
is **evidence, not authority**:

- `conventionEra === 'current'` does **not** make `authorityState ===
  'authoritative'`.
- `conventionEra === 'historical'` does **not** make a rule `rejected`.
- `approvedRulePresent` / `approvedRuleMatches` are informational.

The human decides. A historical candidate and a current candidate both
become `proposed` and stop there (§24.F / §24.G).

---

## 8. Proposal lifecycle

```
Writing Memory candidate  ── makeStyleGuideProposalFromMemory ──▶  StyleRule { status: 'proposed' }
        │                                                                  │
        │  preserves: sourceMemoryId, sourceObservation/DocumentIds,       │
        │             documentTypeDistribution, temporalEvidence,          │
        │             confidence (never as authority), conflicts           │
        ▼                                                                  ▼
   proposalConflicts[]  (competing values — BOTH kept, §12)         human review (approve / reject)
```

The proposal builder **never** sets `approved`, **never** fabricates a
rationale, **never** assigns `approvedBy` / `approvedAt`. `createdBy` is
`null` in the pure helper — the server injects the verified `uid`.

`buildStyleGuideProposals({ report }, ctx)` maps every candidate/observed
entry to a proposal (deterministic, de-duped by `ruleId`, sorted) and
carries the report's `conflicts` through as `proposalConflicts`.

---

## 9. Human approval gate

`approve` requires **all** of:

1. an authenticated actor — `request.auth.uid`, server-derived, never a
   client value;
2. effective-admin authorization — `canUseIntelligence(auth.token)`
   (`role === 'admin' \|\| adminEquivalent`). **No new permission**
   (`styleGuide.approve` was deliberately *not* introduced — §9);
3. an explicit `ruleId` in `proposed` status;
4. a **non-empty, non-whitespace** human-written `rationale`.

The server derives and owns `approvedBy` (= `auth.uid`), `approvedAt` (=
the server clock), `authorityState` (= `authorityStateForStatus('approved')`
= `authoritative`), `version` and `status`. A client-supplied
`approvedBy` / `approvedAt` / `authorityState` / `version` / `createdBy` /
`status` / `ruleId` on any op payload is ignored — the CJS check asserts
`intelligenceStyleGuide.js` reads **none** of them.

An **AI-generated rationale is not human approval.** The system never
generates one; an empty rationale is `RATIONALE_REQUIRED`. `reject` /
`deprecate` likewise require a `reason` (`REASON_REQUIRED`).

**Nothing** causes automatic approval (§22): not `occurrenceCount >= 3`,
not `confidence >= 0.9`, not `conventionEra === 'current'`, not
`temporalStatus === 'aligned'`, not Writing Memory `candidate` status, not
cross-type evidence, not a majority vote.

---

## 10. Versioning

Approved rules are historically auditable. A change to an approved rule is
**never** an in-place edit:

1. `proposeFromMemory({ memoryId, supersedesRuleId })` builds a new
   `proposed` rule for the **same slot** (scope + category + key +
   documentType), `version = predecessor.version + 1`,
   `supersedesRuleId = predecessor.ruleId`. A slot mismatch is refused.
2. Approving that proposal **auto-deprecates** the predecessor:
   `predecessor.status → deprecated`, `predecessor.supersededByRuleId =
   new.ruleId`, an `STYLE_RULE_DEPRECATED` + `STYLE_RULE_SUPERSEDED` audit
   pair is appended.
3. The predecessor's `value`, `rationale`, `approvedBy`, `approvedAt` and
   earlier audit entries are **unchanged** — a `deprecated` rule retains
   its approval provenance.

`getStyleRuleHistory(ruleId)` / `getSupersessionChain` return the full
chain oldest → newest; every version stays queryable. A re-`proposeFromMemory`
of an already-decided slot value (without a supersede link) is
`RULE_EXISTS`.

---

## 11. Conflict handling

The Style Guide **never** becomes a hidden majority-vote engine (§12/§21/§22).

- **Proposals:** two competing values for one slot become two separate
  `proposed` rules. `buildStyleGuideProposals` also emits a
  `proposalConflicts` entry keeping **both sides in full**.
- **Approval:** approving a second value for a slot that already has a
  different approved value **fails closed** with `CONFLICT_UNRESOLVED`
  unless the caller either (a) supersedes the incumbent, or (b) passes
  `acknowledgeConflict: true` for a deliberate coexistence.
- **Resolution:** `resolveEffectiveRule({ scope, category, key,
  documentType })` returns exactly one of:
  - `resolved` — one effective approved value (a linear supersession chain
    collapses to its newest link);
  - `conflict` — ≥ 2 distinct approved values; `rule` is `null`,
    `competingRuleIds` + `competing` (with evidence) are returned;
  - `missing` — no approved rule for the slot.

  It **never** picks by frequency, confidence, recency, or document-type
  spread. `findStyleGuideConflicts` surfaces every conflicted slot
  (approved or proposed).

---

## 12. Retrieval semantics

`style-guide-query.js` — pure, read-only, deterministic (sorted by `ruleId`):

| function | returns |
|---|---|
| `getEffectiveStyleGuide(rules, filter?)` | **APPROVED rules only** — the default effective set. Proposed / rejected / deprecated are **never** included (§20), even when a filter is applied |
| `getProposedStyleRules(rules, filter?)` | the human review queue (`proposed`) |
| `getEffectiveRulesForType(rules, docType)` | approved rules for a type + `cross_type` (scope-aware) |
| `getEffectiveRulesByCategory(rules, category)` | approved rules in a category |
| `queryStyleGuide(rules, { status, category, documentType, scope, key, includeSuperseded })` | the only place a caller can ask for `proposed` / `deprecated` (history) explicitly |
| `resolveEffectiveRule` / `findStyleGuideConflicts` / `getSupersessionChain` | as §11 / §10 |

**Not connected to the NOR generator.** No RAG, no OpenAI. This is the
interface a later phase will consume (§26).

---

## 13. Security model

- **Authorization** — `canUseIntelligence(auth.token)` (unchanged). No new
  permission, no per-user grant, no second permission system.
- **Actor** — always `request.auth.uid`. `createdBy` / `approvedBy` /
  `rejectedBy` / `deprecatedBy` are server-derived; a client value is
  never read (statically asserted).
- **Scope** — `organization`, fixed by the server. A personal user's
  approval cannot create a personal-only rule. Reads are the effective-
  admin tier, organization-wide, server-enforced.
- **Zero-trust content** — `proposeFromMemory` rebuilds Writing Memory
  **server-side** from the caller's own corpus (`listByOwner` +
  `listObservations` by the verified `uid`) and looks the entry up by
  `memoryId`. A client-supplied `memory` / `documents` / `ruleId` /
  `value` / `evidence` is ignored. Verified: `bob` cannot propose from
  `alice`'s `memoryId` (`MEMORY_NOT_FOUND`).
- **No forged authority** — `status`, `authorityState`, `version`,
  `createdBy`, `approvedBy/At`, `rejectedBy/At`, `deprecatedBy/At`,
  `auditTrail`, `scope` on any op payload are ignored; `makeStyleRule`
  re-derives `authorityState`.
- **Read-only ops** — `list` / `get` / `resolve` / `history` write nothing
  (DB byte-identical).
- **No secret / model / outbound HTTP / V1 / Petty Cash / NOR Registry /
  NOR draft / knowledge-write / feature-flag** coupling in the 3 server
  files (statically scanned). The ESM tree imports only the corpus +
  temporal + writing-memory contracts.
- **Rules** — `/intelligence_style_guide` `.write: false`; the additive
  block changes **0** existing rule keys; **not deployed**.

---

## 14. Audit model

- **On-record** — an append-only `auditTrail[]` on every rule:
  `{ event, at, actorId, fromStatus, toStatus, version, detail }`.
  Events: `STYLE_RULE_PROPOSED`, `STYLE_RULE_APPROVED`,
  `STYLE_RULE_REJECTED`, `STYLE_RULE_DEPRECATED`, `STYLE_RULE_SUPERSEDED`.
  The first entry is always `STYLE_RULE_PROPOSED`. `detail` carries the
  rationale / reason / supersedes ids — **never** a secret, a token, or
  corpus body text.
- **Callable** — a metadata-only `logger.info` (`op`, `event`, `actor`,
  `ruleId`, `ok`, `errorCode`, `status`, `authorityState`, `outcome`,
  `version`). Never the rationale text.

---

## 15. Future integration boundary

The **only** allowed integration this phase (§26):

```
Writing Memory  ──▶  Style Guide proposal        (implemented)
Style Guide      ──▶  read-only retrieval          (implemented)
Style Guide      ──▶  NOR generator                (NOT wired — a later phase)
```

Untouched: `intelligence-service` NOR generation, NOR draft generation,
NOR Registry, publication, Petty Cash `generateNor`, the OpenAI provider,
RAG, KnowledgeItem promotion.

---

## 16. Explicit non-goals

- wiring `intelligenceStyleGuide` into `functions/index.js` + `firebase
  deploy` — a later step with its own review;
- deploying the `database.rules.json` block;
- any production UI / review console;
- sending Style Guide rules to a model; wiring them into NOR generation;
- a **manual-only** rule type — every rule is provably Writing-Memory-
  derived this phase (§11);
- visual / layout / template authority — Phase 5.x.6 Visual Template
  System (§3);
- multi-tenant scope — the repo is single-organization;
- creating / modifying a KnowledgeItem, a template, a human-approved
  corpus observation, the NOR generator, the NOR Registry, or a published
  NOR.

---

## 17. Verification

| Check | Scope |
|---|---|
| `node scripts/intelligence-corpus-style-guide-check.mjs` | contract (evidence-backed, verbatim value, derived `authorityState`, never auto-`approved`); proposal (provenance + evidence + temporal preserved, no fabricated rationale, non-language category → no proposal); fixtures A/F/G (evidence proposes, never approves), B/C (human approval, server-owned authority), D (conflict → resolver `conflict`, never a frequency pick), E (v1 auto-deprecated + immutable + queryable), H (cross-type distribution preserved); state machine (rejected/deprecated terminal, no `approved → approved`, re-propose of a decided slot refused); reject/deprecate (actor + reason preserved, retained); retrieval (effective = approved only; proposed/rejected/deprecated excluded; `missing` vs `conflict`; scope-aware); determinism |
| `node scripts/intelligence-corpus-style-guide-check.cjs` | CJS ⇄ ESM drift parity (schemas / enums / graphs / field lists; `makeStyleRule` / `makeStyleGuideProposalFromMemory` / `markApproved` / `resolveEffectiveRule` byte-identical); callable auth/authz/op matrix; `proposeFromMemory` fail-safe `WRITING_MEMORY_UNAVAILABLE` (0 writes); owner isolation (server rebuilds WM from the caller's own corpus; client corpus/entry/authority ignored); approve requires rationale + server actor/clock (Fixture C); conflict `CONFLICT_UNRESOLVED` + `acknowledgeConflict`; resolve → `conflict` (Fixture D); supersession auto-deprecates predecessor, v1 immutable + queryable (Fixture E); reject/deprecate actor+reason; read-only ops write nothing; organization-wide read; static secret/model/HTTP/V1/Petty Cash/NOR Registry/knowledge/flag scan; `functions/index.js` staging assertion |

Both pass. **All 30** `scripts/intelligence-*` checks pass. Knowledge
(acquisition / promotion / review-workflow / ownership / extraction /
learning / gap / drift / observability / rehydration / asset-kinds) +
Organizational Memory + Organizational Knowledge (+ profiles) + Document
Intelligence + NOR (composition / signature-pagination / official-archive)
+ Petty Cash Intelligence + permission-service + permission-runtime +
role-management (+ custom-roles / relationships / verify-pin) + RTDB
hardening functions + user/role permission-overrides-rules + Vercel
module-serving regression **green**.

**Two pre-existing, unrelated failures** — `rtdb-sibling-rules-check.mjs`
and `rtdb-hardening-phases-2to7-check.mjs`: both `JSON.parse` the
`//`-commented `database.rules.json` and fail at **position 2039 / line 68**
— the Phase 1 (`d9f65ea`) `// V2 Sarpras Intelligence Phase 1` comment,
long before this phase. `git stash` of `database.rules.json` back to `HEAD`
fails at the **identical** position. The Phase 5.x.5 block uses the same
comment style as the existing intelligence blocks and adds **0** changed
rule keys (deep-compared).

---

## 18. Git / deployment state at hand-off

- **NOT** committed, **NOT** pushed, **NOT** deployed.
- `HEAD` = `d7f11da` (`docs(v2): record Phase 5 deploy details`).
- `/feature_flags/intelligence/enabled` still absent → OFF.
- OpenAI calls = 0. RAG = none. Production Style Guide mutations = 0.
  Automatic approvals = 0. Knowledge promotions = 0. V1 unchanged.
- `intelligenceStyleGuide` **NOT** in `functions/index.js`.
  `functions/index.js` unchanged.
- `database.rules.json` — one **additive**, undeployed
  `intelligence_style_guide` block (`.write:false`, org-wide admin read,
  `.indexOn`). 0 changed existing keys.
- New files: `src/intelligence/corpus/style-guide/**` (10), `functions/src/
  intelligence/{styleGuideContract,styleGuideStore,intelligenceStyleGuide}.js`
  (3), `scripts/intelligence-corpus-style-guide-check.{mjs,cjs}` (2), this
  doc. Modified: `src/intelligence/index.js` (+1 export block),
  `database.rules.json` (+1 block).

---

## 19. Recommended next phase

**Phase 5.x.6 — Visual Template System** (logo/margin/font geometry, PDF
coordinates, signature-block layout — the visual authority the Style Guide
deliberately does not own). Not implemented here.
