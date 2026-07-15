# Knowledge-Asset-Specification.md — The Canonical Knowledge Asset Model

> Phase 2 of Sarpras Intelligence's Knowledge Acquisition track. Design only —
> no production code was written or modified to produce this report.
>
> **Grounded in**: `NOR-Specification.md` (Part 1 of this same track — every
> example asset below is a real finding from that report, not an invented
> illustration) and the existing, real `js/v2/knowledge/` contracts
> (`knowledge-item-contract.js`, `identity-contract.js`, `evidence-contract.js`,
> `explainability-contract.js`, `lifecycle-contract.js`, `review-contract.js`,
> `dependency-graph-contract.js`, `registry/kind-registry.js`,
> `registry/domain-type-registry.js`). Per this track's explicit constraint,
> this document **does not redesign, replace, or duplicate** any of the above
> — it names, precisely, what already covers the Knowledge Asset concept and
> what narrow, additive extension is required.

---

## 0. The central finding of this document

**The canonical Knowledge Asset model already exists.** It is called
`KnowledgeItem` in the code (`js/v2/knowledge/contracts/knowledge-item-contract.js`),
and its shape — `{id, version, domainType, sourceType, kind, payload,
confidence, lifecycleState, provenance, approvedBy, approvedAt,
preferenceRationale, createdAt, updatedAt}` — is **already capable of
representing every category CLAUDE.md and this track's Part 2 brief name**:
Business Rules (`kind: 'rule'`, already registered), Vocabulary
(`kind: 'vocabulary'`, already registered), Templates
(`kind: 'template_pattern'`, already registered), and so on. What this
document actually contributes is:

1. **The term "Knowledge Asset"** as the platform's external/product
   vocabulary for a `KnowledgeItem` instance — a naming decision, addressed
   explicitly in §7, not a schema change.
2. **Five new `kind` registry entries** the real `NOR-Specification.md`
   findings proved are missing — Rendering Rule, Workflow, Ontology,
   Organizational Reasoning, Question Tree — each a one-line
   `registerKind(id, label)` data addition, per `kind-registry.js`'s own
   documented evolution path ("Phase 4+ may add a payload-shape typedef per
   kind; the registry itself does not need to change").
3. **Five new payload-shape contract files**, mirroring the exact
   convention already established by `knowledge/language/contracts/*` (a
   typedef + one structural `isXEntry()` validator, zero storage logic) —
   new files only, zero edits to any existing file.
4. **One explicit, reuse-driven design clarification**: NOR-Specification.md's
   "Unknown Patterns" (§ that report's closing table) are **not** low-confidence
   Knowledge Assets — they are **Gaps**, and this platform already has a
   first-class, real concept for exactly that
   (`js/v2/organizational-memory/gap-detection-engine.js`). Routing "we don't
   know this yet" into the existing Gap model instead of inventing a sixth
   lifecycle state or an "unknown" `kind` is itself an instance of reuse
   discipline, and is the single most important design decision in this
   document.

No field is added to `KnowledgeItem`. No new repository capability is
required (verified in `Knowledge-Repository-Adaptation.md`, Part 3 of this
track). The lifecycle, review workflow, evidence model, explainability
contract, and dependency-graph model are all reused **verbatim**.

---

## 1. Knowledge Asset Model (= KnowledgeItem, renamed at the product-vocabulary level)

```
KnowledgeAsset {
  id,                    // generateKnowledgeId({domainType, sourceType, sourceRef}) — unchanged
  version,                // append-only, starts at 1 — unchanged
  domainType,             // registry-backed: 'nor' | 'memorandum' | 'sop' | ... — unchanged
  sourceType,             // which connector/process produced it — unchanged
  kind,                   // registry-backed — EXTENDED (§3), not replaced
  payload,                // opaque to the core; shape depends on `kind` — unchanged
  confidence,             // 0–1 — unchanged
  lifecycleState,         // Draft→Candidate→Pending Review→Approved→Deprecated — unchanged
  provenance,             // {connectorId, sourceRef, capturedAt} — unchanged
  approvedBy, approvedAt, // unchanged
  preferenceRationale,    // human-written at approval, never auto-generated — unchanged
  createdAt, updatedAt,   // unchanged
}
```

Every category named in this track's brief maps onto this one envelope,
distinguished only by `kind` (structural) and `domainType` (which document
family it came from):

| Brief category | `kind` value | Status |
|---|---|---|
| Business Rules | `rule` | Already registered |
| Organizational Reasoning | `organizational_reasoning` | **New (§3)** |
| Workflow | `workflow` | **New (§3)** |
| Rendering Rules | `rendering_rule` | **New (§3)** |
| Grammar | `sentence_pattern` / `paragraph_pattern` | Already registered |
| Vocabulary | `vocabulary` / `terminology` | Already registered |
| Ontology | `ontology` | **New (§3)** |
| Question Trees | `question_tree` | **New (§3)** |
| Templates | `template_pattern` | Already registered |
| Future domains | *(any)* | No change needed — `domainType` is already registry-backed, not hardcoded |

---

## 2. Entity Model

Unchanged from the existing platform (`knowledge/contracts/*`), listed here
only to confirm completeness against the brief's required sections:

| Entity | Where it already lives |
|---|---|
| Knowledge Asset (KnowledgeItem) | `knowledge/contracts/knowledge-item-contract.js` |
| Identity / Version | `knowledge/contracts/identity-contract.js` |
| Evidence | `knowledge/contracts/evidence-contract.js` |
| Provenance | `knowledge/contracts/explainability-contract.js` |
| Relationship | `knowledge/contracts/dependency-graph-contract.js` (payload of a `kind: 'relationship'` asset) |
| Lifecycle state | `knowledge/contracts/lifecycle-contract.js` |
| Review decision | `knowledge/contracts/review-contract.js` |
| Connector (source) | `knowledge/contracts/connector-contract.js` |
| Domain type / Kind (registries) | `knowledge/registry/domain-type-registry.js`, `knowledge/registry/kind-registry.js` |

No new top-level entity is proposed. The five new payload shapes in §3 are
new **values of an existing entity** (`kind`), not new entities.

---

## 3. New Payload Shapes (the actual deliverable of this document)

Each mirrors `knowledge/language/contracts/pattern-contract.js`'s exact
convention: a typedef, a plain structural `isXEntry()` validator, zero
storage/repository logic, zero dependency on anything outside this file.
Proposed location: `js/v2/knowledge/language/contracts/` (same directory as
the existing six — these are the same "internal vocabulary" concept family,
not a new subsystem) or a sibling `reasoning-contracts/` grouping if
architectural review prefers separating "how PBSI writes" (existing
language/) from "how PBSI decides" (these five, plus the `reasoning/`
domain this track's own prior Architecture Assessment Report proposed in
its §7). **This grouping choice is left to architectural review — the
shapes themselves do not depend on which directory they live in.**

### 3.1 `kind: 'rendering_rule'`

Evidenced by NOR-Specification.md §C (Rendering Specification) — captures a
visual/layout rule that a text-substitution `PatternEntry` cannot express
(font, color, emphasis, spacing, conditional page breaks, signature layout).

```
RenderingRuleEntry {
  property,          // e.g. 'font' | 'emphasis' | 'spacing' | 'pageBreak' | 'signatureLayout'
  scope,              // what this rule applies to, e.g. 'documentTitle' | 'terbilangLine' | 'signatureGrid'
  rule,               // human-readable statement of the rule, e.g.
                      //   "Cover page (page 1) never renders a footer; ledger pages (page 2+) always do."
  value,              // the concrete value/parameter, when applicable (e.g. {fontSize: 13, bold: true})
  observedIn,         // string[] — which real samples/renderers this was evidenced against
                      //   (mirrors NOR-Specification.md's own evidence-citation discipline)
}
```
`isRenderingRuleEntry(p)`: object, non-empty `property`, non-empty `rule`.

Worked example (Draft — **not Approved**; every example in this document is
intentionally unapproved, since approval is a human act this document
cannot perform):
```
{
  domainType: 'nor', sourceType: 'document-reverse-engineering', kind: 'rendering_rule',
  payload: {
    property: 'pageBreak', scope: 'ledgerSection',
    rule: 'The itemized ledger (RINCIAN PENGGUNAAN PETTY CASH) always starts on a new page, unconditionally, regardless of how short the cover letter is.',
    observedIn: ['NOR-Specification.md §A.3', 'js/docs/templates/nor.js:194 (pageBreak: "before")'],
  },
  confidence: 0.9, lifecycleState: 'draft',
}
```

### 3.2 `kind: 'workflow'`

Evidenced by NOR-Specification.md §D.4 — the ordered human process a
document moves through, distinct from `approval_chain` (which already
exists and captures only the *static list of required signers*, not the
sequence or what each step means).

```
WorkflowEntry {
  name,               // e.g. 'nor-approval-sequence'
  steps: [{
    order,              // 1-based
    actor,              // role, not a name — e.g. 'Staf Sarana dan Prasarana'
    action,             // e.g. 'compile-ledger' | 'submit' | 'countersign' | 'disburse' | 'file-copy'
    evidenceOfCompletion, // e.g. 'ink signature' | 'printed name only' | 'unknown — no evidence observed'
                         //   (mirrors NOR-Specification.md §D.4's own honesty about which steps
                         //   are evidenced vs. inferred)
  }],
  openQuestions,       // string[] — carried verbatim from the source spec's own Unknown markers,
                       //   never silently resolved
}
```
`isWorkflowEntry(p)`: object, non-empty `name`, `steps` is a non-empty array
where every step has numeric `order` and non-empty `actor`/`action`.

### 3.3 `kind: 'ontology'`

Evidenced by NOR-Specification.md §D (Business Ontology) — the one asset
per `domainType` that answers "what kind of thing is this document, and how
does it fit the organization," so a new employee (or a future Reasoning
engine, per this track's prior Architecture Assessment §7) has one place to
start rather than reconstructing it from scattered rules.

```
OntologyEntry {
  intent,             // one sentence — what this document type accomplishes
  trigger,            // what real-world condition causes one to be created
  stakeholders: [{ role, function }],   // mirrors NOR-Specification.md §D.3's table
  approvalChainRef,   // KnowledgeItem id of the kind:'approval_chain' asset this ontology's
                       // documents actually use (a relationship, not a duplicate)
  supportingDocuments,// e.g. 'ledger (same file, page 2+)' — with any known discrepancy noted
                       //   plainly (NOR-Specification.md §D.5's "1 berkas" finding is exactly
                       //   the kind of fact that belongs here)
  budgetImpact,       // e.g. 'reports cycle-level realized spend only; never year-to-date or
                       //   against-annual-budget' (a SCOPE fact, evidenced, not invented)
  dependencies,       // KnowledgeItem ids and/or plain descriptions of upstream/downstream needs
}
```
`isOntologyEntry(p)`: object, non-empty `intent`, non-empty `trigger`,
`stakeholders` is an array.

### 3.4 `kind: 'organizational_reasoning'`

Evidenced by NOR-Specification.md §E — the single most important new shape,
because it is the payload contract for exactly the "Reasoning"/"Diagnosis"
gap this track's own prior Architecture Assessment Report (§3.1, §7) found:
no engine anywhere in this platform currently produces a structured,
cited *why*. This is that shape — a payload design, not the engine itself
(building `reasoning/diagnosis-engine.js` remains explicitly out of scope
for this track, per the STOP CONDITION).

```
OrganizationalReasoningEntry {
  claim,              // one sentence — the reasoning being recorded,
                      //   e.g. "The Rp 15.000.000 float ceiling was likely calibrated against
                      //   typical monthly spend, not chosen arbitrarily."
  evidenceRefs,       // string[] of KnowledgeItem/ArchiveRecord/LearningEvent ids —
                      //   MANDATORY, never empty for a non-Draft asset (cite-or-abstain,
                      //   this track's own prior Architecture Assessment §7 constraint #1)
  ruledOutAlternatives, // string[] — what else was considered and why it was rejected, or
                       //   [] if genuinely none were considered (never omitted silently)
  confidenceBasis,    // human-readable justification for the numeric `confidence` field —
                      //   e.g. "n=2 samples; both show realized amount within 0.1% of the
                      //   float ceiling" — makes the confidence NUMBER itself explainable,
                      //   not just present
  status,             // 'inferred' | 'evidenced' | 'confirmed-by-human' — mirrors
                      //   NOR-Specification.md's own three-tier confidence discipline
                      //   (High/Medium/Low) made machine-readable
}
```
`isOrganizationalReasoningEntry(p)`: object, non-empty `claim`,
`evidenceRefs` is a non-empty array (this validator is deliberately
**stricter** than the others — an empty `evidenceRefs` should fail structural
validation, not merely lower confidence, because an un-cited reasoning
claim is precisely the failure mode CLAUDE.md Principle 7 exists to
prevent).

Worked example, directly from NOR-Specification.md §E.1:
```
{
  domainType: 'nor', sourceType: 'document-reverse-engineering', kind: 'organizational_reasoning',
  payload: {
    claim: 'The NOR exists to convert a month of small, individually-immaterial petty-cash movements into one auditable, three-signatory instrument — a standard cash-float control pattern, not bureaucratic formality for its own sake.',
    evidenceRefs: ['nor:document:113', 'nor:document:120'],
    ruledOutAlternatives: [],
    confidenceBasis: 'Consistent with observed ~99.9% float utilization in both real samples and the fixed three-role sign-off chain; no institutional-memory document was available to confirm a specific founding incident.',
    status: 'inferred',
  },
  confidence: 0.6, lifecycleState: 'draft',
}
```

### 3.5 `kind: 'question_tree'`

Evidenced by NOR-Specification.md §F — a structured register of open
questions about a domainType, explicitly **not** a FAQ of invented staff
questions (this track's Part 1 refused to fabricate those; this shape is
designed so a future real interview's answers have somewhere real to land,
without ever having pretended to have them already).

```
QuestionTreeEntry {
  question,           // the question itself, verbatim
  raisedBy,           // 'document-structural-analysis' | 'human-interview' | ... — how this
                      //   question was discovered, never blank
  status,             // 'open' | 'answered' | 'wont-know' — 'wont-know' is a legitimate,
                      //   honest terminal state (e.g. NOR-Specification.md §F's Memo-docx
                      //   question may simply never be resolvable)
  answerRef,          // KnowledgeItem id of the asset that answers this, once status is
                      //   'answered' — null until then, never a placeholder guess
}
```
`isQuestionTreeEntry(p)`: object, non-empty `question`, non-empty `raisedBy`,
`status` is one of the closed set above.

---

## 4. Relationship Model

Unchanged. `dependency-graph-contract.js`'s existing four relationship
types (`corroborates`, `supersedes`, `conflicts_with`, `derived_from`) are
already sufficient for every relationship this track's evidence surfaced —
concretely:

- NOR-Specification.md §E.5's Terbilang scale-word inconsistency (page 1
  says "juta", page 2 recap says "ribu" for the same figure, in the same
  real document) is a textbook `conflicts_with` relationship between two
  `statistic`-kind assets extracted from the same source — proof the
  existing four types need no fifth.
- A future `ontology` asset's `approvalChainRef` (§3.3) is a
  `derived_from`-style reference, expressible today without a new type.

No change proposed to `dependency-graph-contract.js`.

## 5. Evidence Model

Unchanged. `evidence-contract.js`'s `Evidence {itemId, kind, weight,
rationale}` and its four `EVIDENCE_KIND`s (`source`, `corroboration`,
`statistic`, `relationship`) already cover every evidence citation this
document's five new payload shapes need. The one **convention** (not schema
change) this document adds: any `organizational_reasoning` or `ontology`
asset's `payload.evidenceRefs` should be resolvable to real `Evidence`
records via the existing `confidence-service.js`, so a Reasoning-layer
consumer (this track's prior Architecture Assessment §7) can walk from a
claim to its backing evidence using machinery that already exists.

## 6. Confidence Model

Unchanged. The existing 0–1 `confidence` field plus `confidence-engine.js`'s
weighted blend of source weight and corroboration count applies identically
to all five new kinds. §3.4's `confidenceBasis` field is a
**human-readable justification string inside the payload**, not a second
confidence number — it exists so a reviewer can see *why* an
`organizational_reasoning` asset's confidence is 0.6 rather than 0.9,
directly mirroring NOR-Specification.md's own "Confidence Analysis" section
convention (this document is, in effect, proposing that every
`organizational_reasoning` asset carry its own miniature confidence
analysis, not just a bare number).

## 7. Lifecycle

Unchanged: Draft → Candidate → Pending Review → Approved → Deprecated,
exactly as `lifecycle-contract.js` defines it, with no sixth state. This is
the one place this document actively **recommends against** a tempting but
wrong extension:

**Do not add an "Unknown" lifecycle state.** NOR-Specification.md's Unknown
Patterns are not low-confidence Knowledge Assets awaiting promotion — most
of them are the *absence* of evidence, not weak evidence. Two honest
options exist for each Unknown, and neither requires a new lifecycle state:

1. If it is a genuine hole in organizational knowledge relative to what the
   platform expects to have (e.g. "why is the float exactly Rp 15.000.000"),
   it belongs in the existing **Gap** model
   (`organizational-memory/gap-detection-engine.js`, real code today) —
   Gaps already have their own honest lifecycle (detected → flagged →
   resolved) and their own UI surface (Archive Center's "Upload Queue" /
   gap-workflow). Reusing this is more correct than inventing a parallel
   concept inside Knowledge Assets.
2. If it is a claim with *some* real evidence but low confidence (e.g. the
   float-ceiling control-pattern rationale, §3.4's worked example), it is a
   perfectly normal Draft/Candidate `organizational_reasoning` asset with a
   low `confidence` number and an honest `confidenceBasis` — the existing
   lifecycle and confidence model already express this without any change.

## 8. Approval Workflow

Unchanged. `review-contract.js`'s `ReviewDecision {itemId, itemVersion,
toState, approverId, decidedAt, preferenceRationale}` applies identically
to all five new kinds — a `rendering_rule` or `workflow` asset moves to
Approved through exactly the same human-gated `review-workflow-engine.js`
path any other `kind` does. The still-open "approver authority" question
this contract's own header names (reuse `role-registry.js`, or a
Knowledge-specific role?) is inherited unresolved by this document, exactly
as it was inherited unresolved by every `kind` added before it — this
document does not attempt to answer it (see Open Questions, §10).

## 9. Review Workflow

Unchanged — `knowledge/review/review-workflow-engine.js`'s real, existing
queue/session/conflict-detection machinery operates on `lifecycleState` and
is `kind`-blind by design (confirmed: nothing in `review/` branches on
`kind`). The five new kinds require zero review-workflow code changes.

## 10. Example Knowledge Assets

Beyond the two full worked examples already shown (§3.1, §3.4), for
completeness against the brief's required section, one example per
remaining new kind:

**`workflow`** (§3.2, abbreviated):
```
{
  domainType: 'nor', kind: 'workflow',
  payload: {
    name: 'nor-approval-sequence',
    steps: [
      { order: 1, actor: 'Staf Sarana dan Prasarana', action: 'compile-ledger', evidenceOfCompletion: 'printed name, "Dibuat Oleh"' },
      { order: 2, actor: 'Plt. Kabid Sarpras', action: 'submit-and-approve-recap', evidenceOfCompletion: 'printed name, both pages' },
      { order: 3, actor: 'Wakil Ketua Umum III + Sekretaris Jenderal', action: 'countersign', evidenceOfCompletion: 'ink signature (observed in NOR 120)' },
      { order: 4, actor: 'Wakil Bendahara', action: 'disburse', evidenceOfCompletion: 'unknown — no ink observed in either sample' },
      { order: 5, actor: 'Ketua Umum / Audit Internal / Arsip', action: 'receive-copy-for-record', evidenceOfCompletion: 'n/a — informational only' },
    ],
    openQuestions: ['Whether disbursement is confirmed by a separate bank record rather than this document (NOR-Specification.md §D.4)'],
  },
  confidence: 0.75, lifecycleState: 'draft',
}
```

**`ontology`** (§3.3, abbreviated): one asset per `domainType`, e.g. the
`nor` ontology bundles the intent ("report + request + compliance
artifact"), trigger ("float depleted to near-zero"), the eight stakeholder
rows from NOR-Specification.md §D.3, and the budget-impact scope note from
§D.6 — all citing that report by section rather than restating it.

**`question_tree`** (§3.5): the five structural gaps from
NOR-Specification.md §F, each as one entry, `status: 'open'`,
`raisedBy: 'document-structural-analysis'`. Explicitly **not** populated
with the CLAUDE.md-illustrative "AC dimana?"-style questions — those were
engineering-domain examples in the master prompt, not petty-cash findings,
and inventing petty-cash equivalents would violate this track's own
evidence discipline.

## 11. Future Extensions

- A new `domainType` (e.g. activating `memorandum` — already registered,
  and this track's own Part 1 evidence base includes a real, if unread,
  `Memo Sarpras 362` document that is a plausible first real instance)
  requires zero changes to any shape in this document.
- A future domain might surface a genuinely new `kind` this document didn't
  anticipate (e.g. a `checklist` or `escalation_rule` shape from an
  Engineering SOP). The extension mechanism is identical to §3's: one
  registry entry, one new contract file, zero edits elsewhere — this
  document's contribution is the *pattern*, not a claim of completeness.
- Should real Reasoning-layer engineering proceed (this track's prior
  Architecture Assessment Report §4, §7), `organizational_reasoning` (§3.4)
  is designed to be exactly the payload shape a `reasoning/diagnosis-engine.js`
  would emit — cite-or-abstain, confidence-explained, human-reviewed before
  Approved. No redesign anticipated if/when that engine is built.

---

## Open Questions

1. Should "Knowledge Asset" be a literal code rename (`KnowledgeItem` →
   `KnowledgeAsset` across ~286 files) or a product-vocabulary/documentation
   term only, with `KnowledgeItem` remaining the code identifier? This
   document recommends the latter for now (zero-risk, reversible,
   consistent with "no breaking changes") but defers the final call to
   architectural review.
2. Where should the five new payload-shape contract files live —
   alongside `knowledge/language/contracts/` (same "internal vocabulary"
   family) or under a new `knowledge/reasoning/contracts/` grouping that
   anticipates the `reasoning/` domain proposed elsewhere? Either is
   mechanically identical; this is purely an organizational-clarity choice.
3. `organizational_reasoning`'s `status: 'confirmed-by-human'` value
   implies a real human-interview or annotation workflow that does not
   exist yet anywhere in this platform — is capturing that confirmation a
   Review Workflow concern (reuse `preferenceRationale`) or does it need
   its own small, additive mechanism? Not resolved here; flagged for
   whoever scopes the actual content-authoring phase
   (`SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md`'s Sprint H).
4. This document deliberately produced payload shapes from a **single**
   domainType's evidence (`nor`, n=2 documents). Per this track's own prior
   Architecture Assessment Report (§3.3, §9), building real content against
   only one domain risks the same NOR-shaped-ossification risk already
   flagged there. Recommend the second connector (Memorandum — a real
   candidate document already sits in this evidence base, unread) prove
   these five new shapes generalize before populating many real
   `organizational_reasoning`/`ontology` assets from NOR alone.
