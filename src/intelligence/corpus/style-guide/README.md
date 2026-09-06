# src/intelligence/corpus/style-guide — PBSI NOR Style Guide (V2, Phase 5.x.5)

> Status: **dormant, feature-flagged off, no UI, not deployed.** The Null
> backend is active by default, so every store call returns
> `NOT_IMPLEMENTED` until a real backend is registered. No OpenAI call, no
> RAG, no NOR-generator wiring, no NOR Registry / Petty Cash / knowledge
> mutation. See `docs/V2_SARPRAS_INTELLIGENCE_PHASE_5X_STYLE_GUIDE.md`.

## What this is

The **first authority layer** in the corpus chain. Everything below it is
evidence:

```
HISTORICAL CORPUS  →  CorpusObservation  →  Temporal Interpretation
      (evidence)         (evidence)              (evidence)
                                                    │
                                                    ▼
                              ORGANIZATIONAL WRITING MEMORY   (evidence)
                                                    │
                              ── human proposal + explicit approval ──
                                                    ▼
                              PBSI NOR STYLE GUIDE            (AUTHORITY)
                                                    │
                                                    ▼
                              (future) NOR generation / retrieval
```

> **Corpus evidence is not policy. Writing Memory is not authority. Only
> explicit human approval creates Style Guide authority.**

## The rule lifecycle

```
proposed ──▶ approved ──▶ deprecated
    │
    └──────▶ rejected
```

- `proposed` — a candidate built **only** from a Writing Memory entry
  (`makeStyleGuideProposalFromMemory`). `rationale` is `null`; nothing is
  approved.
- `approved` — a human with an authenticated actor id supplied a **non-empty
  written rationale**. `authorityState` (derived from `status`) becomes
  `authoritative`. This is the only state the future NOR generator reads.
- `rejected` / `deprecated` — retained terminal states. Nothing is deleted.
- Changing an approved rule = a **new** superseding proposal
  (`supersedesRuleId`); approving it auto-deprecates the predecessor, which
  stays queryable via `supersededByRuleId` and `getStyleRuleHistory`.

No code path reaches `approved` automatically. Frequency, confidence,
`documentEra`, `temporalStatus`, Writing Memory `candidate` status,
cross-type evidence and AI output can justify a **proposal** — never an
**approval** (§22).

## Layout

```
style-guide/
  contracts/
    style-guide-contract.js        pbsi-nor-style-guide@1: STYLE_RULE_STATUS (+ graph + human-gated),
                                   STYLE_AUTHORITY_STATE (DERIVED from status), STYLE_RULE_CATEGORIES
                                   (= Writing Memory language vocab, reused), DOCUMENT_TYPE_SCOPE (reused),
                                   STYLE_GUIDE_AUDIT_EVENTS, styleRuleIdFrom, makeStyleRule / isStyleRule
    style-guide-store-contract.js  the backend interface + StyleGuideResult envelope + STYLE_GUIDE_ERRORS
  style-guide-proposal.js          makeStyleGuideProposalFromMemory (never approved, never fabricates
                                   a rationale), buildStyleGuideProposals (+ preserves conflicts),
                                   makeSupersedingProposal
  style-guide-authority.js         markApproved (actor + non-empty rationale REQUIRED), markRejected,
                                   markDeprecated — pure { next } | { error }
  style-guide-query.js             getEffectiveStyleGuide (APPROVED only), resolveEffectiveRule
                                   (resolved | conflict | missing — never picks by frequency),
                                   findStyleGuideConflicts, getSupersessionChain
  backends/
    null-style-guide-backend.js    the inert default — NOT_IMPLEMENTED
    memory-style-guide-backend.js  in-process; real lifecycle, conflict gate, resolver; tests + DISABLED mode
    callable-style-guide-backend.js thin adapter over the (staged) intelligenceStyleGuide function
  style-guide-store.js             THE facade — backend registry + events + 8 delegating methods
```

## Storage / server boundary

| RTDB node | Writer | Reader |
|---|---|---|
| `/intelligence_style_guide/{ruleId}` | `intelligenceStyleGuide` Cloud Function (Admin SDK) — `.write: false` | effective admin (`role === 'admin' \|\| 'developer' \|\| adminEquivalent`) — organization-wide, **not** owner-scoped |

The Style Guide is **organization-wide** (§16): there is no per-user style
rule. Reads are the admin tier only (these are authoritative organizational
rules and Intelligence is admin-only anyway). The browser **cannot** write.

**STAGED, not live (Phase 5.x.5 §28):** `intelligenceStyleGuide.js` is
authored but **not** wired into `functions/index.js`; the rule block is in
`database.rules.json` but **not** deployed. The CJS check exercises the
callable via `.run()`, exactly like `intelligenceCorpus`.

## The one allowed integration (§26)

`Writing Memory → Style Guide proposal`, and `Style Guide → read-only
retrieval`. Nothing downstream consumes it yet. The NOR generator, NOR
draft/registry, publication, Petty Cash `generateNor`, the OpenAI provider,
RAG and KnowledgeItem promotion are all untouched.

## Verification

- `node scripts/intelligence-corpus-style-guide-check.mjs` — contract, proposal, authority, state machine, conflicts, versioning, retrieval, effective-rule resolution, no-automatic-authority, determinism, fixtures A–H
- `node scripts/intelligence-corpus-style-guide-check.cjs` — CJS ⇄ ESM drift parity; the STAGED `intelligenceStyleGuide` callable auth/authz/op matrix; `proposeFromMemory` fail-safe + owner isolation; server strips client authority fields; approve requires rationale + server actor; supersession auto-deprecates; resolve returns conflict not a frequency pick; static scan; `functions/index.js` staging assertion
