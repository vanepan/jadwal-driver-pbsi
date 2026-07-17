# Sarpras Intelligence V2 — Phase 9, Sprint 9.1: Organizational Decision

> Scope: resolve every remaining business ambiguity about which candidate
> NOR Types are real, before any further Knowledge is authored — per this
> sprint's own brief ("Engineering must not make organizational decisions").
> The evidence-compilation and decision-recording work (§1-§3) involved no
> code. The repository owner then explicitly asked for §4's backlog — the
> mechanical, registration/routing-only consequence of those decisions — to
> be applied immediately rather than deferred; §4 records exactly what was
> changed and the regression evidence for it. No Knowledge was authored.
> Method: direct code reading
> (`js/v2/knowledge/registry/nor-type-registry.js`,
> `js/v2/problem-intelligence/contracts/problem-category-contract.js`,
> `js/v2/problem-solving/services/problem-solving-service.js`,
> `js/v2/conversation/intent/intent-engine.js`) plus every prior Phase 8.5
> iteration's own evidence (`CORE_NOR_KNOWLEDGE_PACK.md`,
> `NOR_TYPE_DOMAIN_MODEL.md`, `NORTH_STAR_VALIDATION_REPORT.md`). Every
> decision recorded below was made by a human (the repository owner), not
> inferred by Claude — this document records evidence and the decision that
> followed it, never the other way around.

---

## Headline finding

All four evidence gaps this repository had been carrying since Phase 8.5
Iteration 3 — Reimbursement's framing, Pengadaan's contradictory routing,
Administration's non-existence, and Perjalanan Dinas's unevidenced schema —
have now been resolved by an explicit human decision, recorded in §1. This
sprint authored **zero** new Knowledge; it turns four open questions into
four authoritative answers, and applies their direct, mechanical,
registration/routing-only code consequence (§4) at the repository owner's
explicit request.

---

## 1. Organizational Decision Report

For each candidate, the evidence Claude presented, the decision the
repository owner made, and its concrete implication for the codebase (not
yet applied — see §4).

### Decision 1 — Reimbursement

**Evidence presented:** the registered NOR Type `Reimbursement`
(`nor-type-registry.js:122`, keywords `reimbursement`/`penggantian` in
`intent-engine.js:114`) has zero real document evidence of its own. A real,
separately-approved document family *does* exist under the same English
word — `docs/REIMBURSEMENT_TEMPLATE_STANDARD.md`, a driver/vehicle
operational-cost claim form (`js/reimbursement.js`,
`js/docs/templates/reimbursement.js`) — but it is never called "Nota
Organisasi," uses a distinct template id (`reimbursement`, not `nor`), and
has no evidenced connection to the `nor` domainType.

**Decision: Reimbursement is NOT a NOR Type.** It does not belong in this
system as a NOR at all.

**Implication:** `NOR_TYPE.REIMBURSEMENT` and its `registerNorType()` call
should be removed from `nor-type-registry.js`; the `reimbursement`/
`penggantian` keyword entry should be removed from `intent-engine.js`'s
`NOR_TYPE_KEYWORDS`. The real driver/vehicle reimbursement form is
unaffected — it was never part of the `nor` domain and stays exactly where
it is (`js/reimbursement.js`). No Knowledge should ever be authored under
`payload.norType: 'Reimbursement'`.

### Decision 2 — Pengadaan (Procurement)

**Evidence presented:** two taxonomies disagreed. `nor-type-registry.js`
registers `Pengadaan` as a NOR Type with a plausible field schema
(item/quantity/purpose/budget). Separately, the Problem Category
`procurement` (`problem-category-contract.js:109-114`) is registered with
`defaultDomainType: 'request'`, not `'nor'`, and is absent from
`CATEGORY_TO_INTENT` (`problem-solving-service.js:68-70`) — meaning a real
procurement utterance today never reaches `CREATE_NOR` or NOR composition
at all.

**Decision: Pengadaan IS a NOR Type.** The NOR Type registry side is
correct; the Problem Category routing is the thing that's wrong.

**Implication:** `CATEGORY_TO_INTENT` must gain a `procurement:
INTENT.CREATE_NOR` entry so a procurement utterance actually reaches the
same CREATE_NOR path Business Trip already uses. This is a real code
change (`problem-solving-service.js`), deferred to §4 — not made this
sprint. `nor-type-registry.js`'s `Pengadaan` entry is unaffected and stays.

### Decision 3 — Administration

**Evidence presented:** Administration exists only as a Problem Category
(`defaultDomainType: 'request'`, field schema authored from a single
hypothetical example — "Atlet kehilangan ID Card"), also absent from
`CATEGORY_TO_INTENT`. It was never registered in `nor-type-registry.js`.
Zero real evidence of an "Administration NOR" exists anywhere in the
repository.

**Decision: Administration SHOULD become a NOR Type.**

**Implication:** `nor-type-registry.js` needs a new `NOR_TYPE.ADMINISTRATION`
entry (registration only — no field schema authored yet, since none is
evidenced; mirrors how `Reimbursement` was previously registered with an
empty schema pending content). `CATEGORY_TO_INTENT` needs an
`administration: INTENT.CREATE_NOR` entry, matching Decision 2's treatment
of Pengadaan. **No Knowledge may be authored for Administration** until
real evidence (a document, or domain-expert input) exists — registration
is a vocabulary act, not a content-authoring act; this mirrors exactly how
Reimbursement was carried in the registry with an empty schema for a full
session before this sprint, per `nor-type-registry.js:145-151`'s own
precedent.

### Decision 4 — Perjalanan Dinas (Business Trip)

**Evidence presented:** the only candidate architecturally wired to
`CREATE_NOR` today (`business_trip` is the sole entry in
`CATEGORY_TO_INTENT`), but its field schema
(destination/traveler/departureDate/returnDate/budget) is the mission
brief's own hypothetical worked example — zero real filled Perjalanan
Dinas documents exist in this repository.

**Decision: keep it as a live candidate. Do not remove it. Do not author
any Knowledge for it until real organizational evidence exists.** It is to
be treated as awaiting onboarding through the official NOR Onboarding
Playbook (`docs/NOR_ONBOARDING_PLAYBOOK.md`), exactly like Pengadaan.

**Implication:** no code or registry change. The existing placeholder
field schema stays as-is (it is still the only thing the live Conversation
can use), but every future Knowledge-authoring sprint must continue
treating it as **unevidenced** — the same discipline already applied in
Iteration 2 (`CORE_NOR_KNOWLEDGE_PACK.md` §3) — until a real document
surfaces.

---

## 2. Supported NOR Type Matrix

The authoritative set, post-decision. "Evidence status" is unchanged by
this sprint (a documentation/vocabulary decision does not manufacture
evidence) — only the *NOR-or-not* verdict changed.

| NOR Type | Verdict (this sprint) | Evidence status | Field schema | Knowledge authored | Next step |
|---|---|---|---|---|---|
| Realisasi Petty Cash | Confirmed real (unchanged, pre-existing) | Evidenced — 2 real, independent documents | Authored, evidenced (1 field) | 54 items tagged | Maintain; answer the 12 logged open questions if a human is available |
| Perjalanan Dinas | Confirmed candidate — keep, do not author yet | Unevidenced — placeholder schema only | Placeholder (unevidenced) | 0 | Awaiting onboarding via the Playbook — needs a real document first |
| Pengadaan | Confirmed candidate — routing fixed (§4) | Unevidenced beyond a confirmed real department name | Placeholder (unevidenced) | 0 | Obtain a real Pengadaan document, then onboard via the Playbook |
| Administration | **Newly confirmed candidate** (was not a NOR Type before this sprint) — registered + routing fixed (§4) | Unevidenced — no document, no schema | None yet — do not author one without evidence | 0 | Obtain a real Administration NOR document/example before any authoring |

---

## 3. Unsupported Document Matrix

Documents/processes that are **not** NOR Types, with the decision that
excludes them and what they actually are instead.

| Candidate | Decision | What it actually is | Evidence |
|---|---|---|---|
| Reimbursement | **Excluded this sprint** — not a NOR at all | A real, separately-approved driver/vehicle operational-cost claim form, its own document family (`domainType` outside `nor`, template id `reimbursement`) | `docs/REIMBURSEMENT_TEMPLATE_STANDARD.md`, `js/reimbursement.js` |
| Facility | Never proposed as a NOR; confirmed out of scope by inspection | Problem Category only, `domainType: 'engineering'` | `problem-category-contract.js:90-97` |
| Knowledge Search | Never proposed as a NOR | Routes directly to the existing Home search bar UI action | `problem-category-contract.js:125-127` |
| Document Upload | Never proposed as a NOR | Routes directly to the existing Archive Center upload UI action | `problem-category-contract.js:128` |
| `domainType: 'petty_cash'` | Not a document type at all — a registered but unused label | Dormant registry entry, zero real callers; distinct from (and not to be confused with) the real evidence base, which lives under `domainType: 'nor'` / NOR Type `Realisasi Petty Cash` | `domain-type-registry.js:69` |

---

## 4. Implementation Backlog — applied

Per explicit instruction, the repository owner asked for this backlog to
be applied immediately rather than deferred. All 5 items are done, and the
acceptance harness confirms no regression:

1. **Done.** Removed `NOR_TYPE.REIMBURSEMENT` and its `registerNorType()`
   call from `nor-type-registry.js`; removed the `reimbursement`/
   `penggantian` keyword entry from both `intent-engine.js`'s and
   `problem-parser.js`'s independent `NOR_TYPE_KEYWORDS` tables (both had
   their own copy — see `NOR_TYPE_DOMAIN_MODEL.md`'s headline finding on
   why two tables exist).
2. **Done.** Added `procurement: INTENT.CREATE_NOR` to `CATEGORY_TO_INTENT`
   (`problem-solving-service.js`).
3. **Done.** Registered `NOR_TYPE.ADMINISTRATION` in `nor-type-registry.js`
   (vocabulary only, empty field schema — mirrors how `Reimbursement` was
   previously carried).
4. **Done.** Added `administration: INTENT.CREATE_NOR` to
   `CATEGORY_TO_INTENT`.
5. **Done.** `scripts/north-star-acceptance-check.mjs` re-run: 25/25 pass
   (was 16/16 before this sprint — 9 new checks added, none removed,
   2 rewritten to assert the new, intentional Reimbursement-exclusion
   behavior instead of the old inclusion behavior). Two new scenarios
   (`Procurement (category-routing fix)`, `Administration (category-routing
   fix)`) were added specifically to prove Decisions 2/3's routing fix
   reaches a REAL Conversation for an utterance that classifies into
   `procurement`/`administration` without also tripping the separate,
   still-unfixed Critical #1 regression (an utterance mentioning
   "buat...NOR" always biases `business_trip`'s own category score — see
   `NORTH_STAR_READINESS_AUDIT.md` Stage 1 — a pre-existing, out-of-scope
   issue this sprint does not touch). `problem-solving-integration-check.mjs`,
   `problem-router-check.mjs`, `problem-intelligence-check.mjs`,
   `reasoning-engine-check.mjs`, `knowledge-gap-check.mjs`,
   `nor-composition-check.mjs`, and `dynamic-conversation-check.mjs` all
   re-verified green.

**Still explicitly out of scope:** authoring any Ontology, Workflow, Rule,
Rendering, or Pattern Knowledge for Pengadaan or Administration. §1
Decisions 2 and 3 were registration/routing decisions only — Sprint 9.2
(Evidence Onboarding) is the earliest point real content may be authored,
and only once real evidence exists. Neither NOR Type gained any keyword-
based `type` extraction either (an utterance must still say "pengadaan"/
"pembelian" to auto-resolve Pengadaan; Administration has no such keyword
recognition at all yet) — adding one without evidence would be inventing
NLU, not registering vocabulary.

---

## Validation

Does this decision set change anything about Realisasi Petty Cash, the
one NOR Type this repository can already prove? No — every decision above
is additive/corrective to the other three candidates. Realisasi Petty
Cash's 54 tagged facts, field schema, and acceptance-harness baseline are
untouched.
