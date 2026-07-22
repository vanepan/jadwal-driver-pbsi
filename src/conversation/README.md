# src/conversation — Conversation Intelligence Foundation (Phase 6)

> Status: architecture-only, same as Phase 8's NOR Generator contract before
> Phase 9.5 gave it a real implementation. Built, tested (see
> `scripts/conversation-ownership-check.mjs`), and REACHABLE, but nothing in
> `ui/` currently drives it — there is no chat surface in this phase. This is
> a deliberate scope boundary, not an oversight: the mission asks for the
> deterministic conversation layer itself, not a UI wired on top of it. See
> `js/v2/README.md`'s "what this tree still does NOT do" for how that is
> declared platform-wide.

## What this is

Conversation is the layer that lets a human describe what they want in one
sentence instead of operating repositories, datasets or metadata directly.
It is **not** chat — there is no message log anywhere in this domain's
shape. A Conversation is a deterministic task session: an intent, the facts
gathered so far, the facts still missing, and a fully explainable record of
where every fact came from.

No AI. No LLM. No probabilistic guessing anywhere in this tree. Intent
detection is keyword/pattern matching over a closed vocabulary; the
Question Optimizer only ever reuses a REAL, already-recorded fact (Approved
Knowledge, an Approved Profile Override, an Organization Memory aggregate
with real support, or the same actor's own prior answer) — it never
predicts or invents one. `ai-foundation/` remains the only place a future
LLM adapter could ever plug in, and nothing here depends on it.

## Layout

```
src/conversation/
  contracts/
    conversation-contract.js   Conversation shape + lifecycle (Started/Active/Ready/Completed/Cancelled/Failed)
    intent-contract.js         INTENT enum + INTENT_FIELD_SCHEMA (the required-fact table per intent)
    question-contract.js       Question / ResolvedFact shapes + QUESTION_SOURCE
    context-contract.js        the Explainable Context Object shape

  repository/
    conversation-repository.js real, append-only Conversation store (Map-backed, in-memory —
                                a session, not durable-across-refresh V1 state)

  intent/
    intent-engine.js           PURE — detectIntent(utterance): deterministic keyword/pattern
                                scoring, explainable (confidence/matchedRules/matchedKeywords/
                                matchedPatterns), plus literal fact extraction from the utterance itself

  questionnaire/
    questionnaire-engine.js    PURE — computeMissingFacts(): the set difference between
                                INTENT_FIELD_SCHEMA and what is already known
    question-optimizer.js      resolves what it honestly can from Knowledge / Organization Memory /
                                Approved Profile Overrides / the same actor's prior COMPLETED
                                Conversations, in that fixed priority order — never fabricates

  context/
    context-builder.js         PURE — composes Knowledge/Archive/Organization Memory/Policies/
                                Patterns/Conversation History into one Explainable Context Object

  task-executor.js             the ONLY place a Conversation's gathered facts reach a real domain
                                service (NOR Generator / Learning Service / Knowledge Service /
                                Archive Service) — never a repository, never bypassed

  services/
    conversation-service.js    Conversation's ONE owner — startConversation/continueConversation/
                                completeConversation/cancelConversation/resumeConversation/
                                listConversationHistory/explainConversation
```

## Dependency direction (binding — extends js/v2/README.md's graph)

```
conversation/  ──depends on──>  knowledge/, organizational-memory/, learning/, document-intelligence/
                                 (read-only, through their services/pure engines only — never a
                                 repository, never an engine that itself owns writes)
knowledge/ & organizational-memory/ & learning/ & document-intelligence/  ──never depend on──>  conversation/
ui/            ──may depend on──>  conversation/  (not exercised in this phase — no UI caller exists yet)
```

This is a strict extension: no edge that existed before this phase changes
direction. Conversation is the platform's newest, most downstream domain —
it may read everything upstream of it, and nothing upstream may read it
back. This is what makes Part 8 ("Conversation Memory must never
contaminate Organization Memory") a checkable property
(`scripts/conversation-ownership-check.mjs`) rather than a claim in a
comment: nothing under `learning/` or `organizational-memory/` imports
anything under `conversation/`.

## What this tree does NOT do (true as of Phase 6)

- No chat UI exists — this phase is the deterministic engine only.
- `UPLOAD_KNOWLEDGE` and (for a genuinely new document) `ARCHIVE_DOCUMENT`
  are honestly reported as `REQUIRES_ATTACHMENT` — no file-upload/Storage
  mechanism exists anywhere in this codebase (see `js/v2/README.md`), and a
  Conversation cannot originate real bytes.
- `CREATE_NOR` dispatches to the real, registered NOR Generator
  (`document-intelligence/nor/nor-generator.js#proposeNorFields`), which
  only proposes STRUCTURAL suggestions (typical signatory/item counts) —
  never business content (destination, budget, recipients). The actual NOR
  document remains the existing V1 flow, untouched.
- No new Learning Event kind was added — a Conversation's real side effects
  (a correction, a knowledge approval) are recorded by the domains that
  already own that recording (`learning-service.js`, `knowledge-service.js`),
  exactly as they already do outside any Conversation.
