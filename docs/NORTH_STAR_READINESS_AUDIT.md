# Sarpras Intelligence V2 — North Star Readiness Audit

> Scope: `js/v2/` only (Sarpras Intelligence, pilot-gated to `admin`/`evan`).
> Method: direct code reading + real, executed Node scripts against the live
> pipeline (this dependency chain has zero Firebase imports — deterministic,
> no AI). Every claim below is either "verified" (I ran it and observed the
> output) or "traced" (static code reading only, no branching on
> non-deterministic behavior to worry about). No code was changed to produce
> this report except one throwaway trace script, written and deleted.

---

## Headline finding

The three fixes shipped immediately before this audit (broaden
`business_trip` classification, recognize "membuat", load real Knowledge
into live sessions) genuinely work for their target phrase. But testing the
adjacent case this audit asked for — **"Buatkan NOR pembelian meja ruang
Binpres."** — surfaces a real regression: that same classification fix now
**hijacks procurement-worded NOR requests into the trip-shaped conversation**,
producing nonsense questions ("Kapan tanggal keberangkatan?" for a table
purchase). This is layered on top of several pre-existing, deeper gaps this
audit found independently. See Critical §1 below.

---

## End-to-End Pipeline Walkthrough

### Stage 1 — Natural Language Understanding

Tested directly, 5 phrasings, real pipeline:

| Utterance | `parseProblem` category | Result |
|---|---|---|
| "Buatkan NOR pembelian meja." | `business_trip` (0.300) | **Wrong** — asked destination/traveler/departureDate/returnDate/budget for a furniture purchase |
| "Tolong buat NOR meja Binpres." | `business_trip` (0.300) | **Wrong** — same, `type` not even extracted this time |
| "Perlu NOR untuk beli meja." | `procurement` (0.375) | Correct category, but `detectIntent` → `unknown` (0.111) → falls to the generic, non-NOR-producing Problem Conversation loop (still asks a sensible question: "Berapa estimasi anggarannya?") |
| "Pengadaan meja Binpres." | `unknown` (0.125, below threshold) | Honest clarification request — reasonable |
| **"Buatkan NOR pembelian meja ruang Binpres."** (acceptance-test phrase) | `business_trip` (0.300) | **Wrong** — same trip-question failure |

**Verdict: broken for the most natural procurement phrasing (mentioning "NOR" explicitly), correct-but-dead-ended for phrasing that doesn't.** Root cause: `business_trip` is the only category wired to a real Intent (`CATEGORY_TO_INTENT = { business_trip: CREATE_NOR }`, `problem-solving-service.js:68-70`), and this session's own classification fix (adding `'nor'` + `NOR_CREATE_PHRASE` to `business_trip`, `problem-parser.js`) now outscores `procurement`'s own signal whenever "NOR" is mentioned. Before that fix, these phrases fell to `procurement`'s classification instead — not correct, but not actively misleading either.

### Stage 2 — Intent Classification

`CREATE_NOR`'s own keyword/pattern scoring works correctly in isolation — it even extracts `type: 'Pengadaan'` from "pembelian" (`NOR_TYPE_KEYWORDS`, `intent-engine.js:92-95`, verified live). The failure isn't intent detection — it's that `CREATE_NOR` is the *only* NOR-producing intent that exists, and once triggered, it always uses one fixed field schema regardless of the `type` it just correctly extracted.

### Stage 3 — Knowledge Retrieval

Real and functional as infrastructure (`reason()`, `listKnowledge()` return genuine Approved data, verified live). But two structural findings:

1. **`KnowledgeItem` has no `type` field at all** (only `domainType`/`kind`) — confirmed by reading `knowledge-item-contract.js`. Retrieval, Gap Detection, and Reasoning all key on `domainType`+`kind` only. There is no way, even in principle today, to scope a query to "Pengadaan-relevant Knowledge only."
2. **The 96 seeded items are not generically "NOR" content — they're specifically petty-cash-replenishment content**, narrower than even "business trip." Verified by reading actual payloads: the one Ontology's `trigger` is "the operating float has been spent down to near-zero"; the one Rule's `Perihal` template is hardcoded to `"Realisasi Petty Cash Pertanggal..."`; both `paragraph_pattern` items hardcode "bidang sarana dan prasarana" with zero slots. Running `reason()` against a real procurement `Problem` (`type:'Pengadaan', item:'office chairs', quantity:10`) returned **all 12 trip/petty-cash rules, cited as if applicable** — including the petty-cash `Perihal` rule and the petty-cash numbering format.

### Stage 4 — Knowledge Gap Detection

Real function, correctly scoped to `domainType` — but because there's no `type` scoping, running `detectKnowledgeGaps('nor')` for a procurement request returns **zero gaps**, not the correct "no Ontology for Pengadaan" finding. It silently assumes the one trip/petty-cash Ontology covers everything in the `nor` domain. This is a **false-confidence failure mode**, worse than an honest "I don't know" — verified live.

### Stage 5 — Conversation

More real than expected, but narrower than the North Star implies. Traced and reasoned from real code: `optimizeQuestions()` tries a same-actor exact-repeat match (`resolveFromPreviousConversations`) for every field unconditionally — genuinely skips re-asking if the identical actor makes the identical request twice. But for any *new* occasion (the normal case), only **1 of 6 CREATE_NOR fields** (`traveler`, the sole `optimizable: true` field) can ever be pre-filled from Knowledge/Profile-Override/Archive/Org-Memory. `destination`/`departureDate`/`returnDate`/`budget` are `optimizable: false` **by design** (they're genuinely per-occasion facts — this part is architecturally correct, not a bug) — but it means "ask only what's missing" mostly reduces to "ask everything, every time" for real, non-repeat requests.

### Stage 6 — Reasoning

**Critical, previously-unflagged finding: `reason()` is never called anywhere in the CREATE_NOR path.** `conversation-service.js` imports only the Questionnaire Engine and Question Optimizer — no `reasoning/` import at all. `nor-composer.js` imports Knowledge/pattern/rendering-rule services — also no `reasoning-engine` import. `reason()` is called exactly once platform-wide, inside `problem-conversation-engine.js`'s generic fallback loop (facility/procurement/administration), which CREATE_NOR never uses. **Reasoning contributes zero value to the one real, working NOR-creation path today**, contrary to the Realignment Report's characterization of it as wired in.

### Stage 7 — NOR Composition

Real compose executed end-to-end (trip scenario, real seeded Knowledge, all facts answered). Result: **19 sections — 6 genuinely correct (raw human answers), 4 silently wrong (structural-suggestion counts render as `0` instead of honest `UNKNOWN`, because `nor-generator.js` reads payload keys — `signatoryTopCount` etc. — that don't exist on the seeded `structure` item's actual shape), 5 "resolved" but containing wrong-domain petty-cash boilerplate presented as if correct for a business trip, and 4 honest `{{UNKNOWN}}` markers.** The wrong-domain sections are the most dangerous outcome in this whole audit — they don't look broken, so nothing would stop a reviewer from approving factually wrong prose.

No logic exists anywhere for: document numbering, letterhead/signatory grid layout, Indonesian long-date formatting, Rupiah/terbilang currency formatting, or pagination — all 100% human work even for the one working NOR type. **PDF export is confirmed completely disconnected**: `nor-composer.js`'s own header states it deliberately never imports V1's real PDF generator, and a full-tree grep for `pdfmake`/`nor-paper`/`buildNorViewModel` inside `js/v2/` returns zero hits. Composition output is pure structured data with no renderer downstream.

Procurement is not "harder" here — it's **structurally disconnected**: `procurement`'s field schema uses `domainType: 'request'`, never `'nor'`, so a procurement conversation's facts never reach `nor`-typed Knowledge or `composeApprovedNor` at all.

### Stage 8 — Human Review

**Trip NOR: ~85-95% of the final document is still human work**, and worse, some of the auto-filled ~68% is confidently wrong rather than honestly missing (Stage 7). No real review surface exists at all — the only visibility into a composed document today is a dev-mode-only "Developer Pipeline Viewer" showing a bare section count (`ComposerDocument {id} (19 sections)`), never the actual text. **Procurement NOR: not a percentage — the path doesn't functionally connect today.**

### Stage 9 — Learning

Of the platform's 3 "correction paths," only **Profile Override approval** actually closes the loop into a future Conversation asking fewer questions — and only for `traveler`, the one field gated to accept it. Metadata confirmation and Knowledge "Request Changes" write real Learning Events, but nothing in `question-optimizer.js` or `nor-composer.js` ever reads them — they're audit trail only. Composition-level learning (a human's edit to a *draft NOR* becoming a correction) is fully dormant: `composer-store.js#editSection` has zero real callers, confirmed by `dormant-subsystems.js` and independently by `PROJECT_REALIGNMENT_REPORT.md`.

---

## Gap Analysis Summary

| Stage | Status | One-line verdict |
|---|---|---|
| 1. NLU | **Incorrect** for the exact acceptance-test phrase | "NOR" mention now wrongly outscores procurement's own signal |
| 2. Intent Classification | Partially complete | Works, but only one intent (`CREATE_NOR`) exists for all NOR types |
| 3. Knowledge Retrieval | Partially complete | Real, but zero `type` scoping; content is petty-cash-only, not generic |
| 4. Gap Detection | Incorrect (silent) | Reports zero gaps for a domain it has no real coverage for |
| 5. Conversation | Partially complete | Skips only exact same-actor repeats; 5/6 fields always asked otherwise (by design, mostly correct) |
| 6. Reasoning | **Missing from this path entirely** | Never called in Conversation or Composition for CREATE_NOR |
| 7. Composition | Partially complete, quality poor | 32% real, ~26% silently wrong, ~26% wrong-domain, 21% honest unknown |
| 8. Human Review | Missing (no surface) | 85-95% manual for the one working type; zero for the others |
| 9. Learning | Mostly missing | 1 of 3 paths closes the loop, for 1 of 6 fields |

---

## Missing Knowledge Inventory

| Knowledge Type | Trip/Petty-Cash | Procurement | Reimbursement | Confidence |
|---|---|---|---|---|
| Ontology | Exists (1) | Absent | Absent | Verified |
| Workflow / Approval chain | Exists (1 each) | Absent | Absent | Verified |
| Signatory roles | Exists (8, petty-cash-specific) | Absent | Absent | Verified |
| Numbering rule | Exists (1, petty-cash format) | Absent | Absent | Verified |
| Sentence/paragraph/template patterns | Exists (9) | Absent — no item/quantity/cost slots anywhere | Absent | Verified |
| Rendering rules | Exists (15, layout/typography) | Partially reusable (generic form) | Partially reusable | Inferred |
| Business rules | Exists (12, petty-cash-specific) | Absent | Absent | Verified |
| Organizational reasoning | Exists (6) | Absent | Absent | Verified |
| Statistics / Vocabulary / Question tree | Exists (5/3/12) | Absent | Absent | Verified |
| **Type-scoping infrastructure itself** | N/A | **Absent for all types** — no `type` field on `KnowledgeItem`, no engine filters by it | same | Verified |

---

## Missing Capability Inventory

Ranked by whether they block the North Star for the *one* nominally-working type (trip) vs. only for the other two:

**Blocks the working type too:**
- Type-scoped Knowledge retrieval/gap-detection/reasoning (§3-4, §6)
- Reasoning wired into the CREATE_NOR path at all
- Document numbering, date/currency formatting, letterhead/signatory layout
- Real PDF/document rendering downstream of Composition
- A real human review/editing surface (not dev-mode-only)
- `editSection` wired to something real, so Learning can apply to draft edits
- Fix for `nor-generator.js`'s silent-zero bug (structural counts should be honest `UNKNOWN`, not `0`)

**Blocks only the other two types:**
- `type`-branched `INTENT_FIELD_SCHEMA` for `CREATE_NOR` (currently one fixed, trip-shaped list)
- `CATEGORY_TO_INTENT` mapping for `procurement`/`administration` (currently `business_trip` only)
- Real procurement-authored Knowledge (all 14 kinds, currently zero coverage)
- A `domainType`/routing fix so `procurement`'s facts actually reach `nor`-typed Knowledge

---

## Priority Roadmap

**Critical**
1. **Fix the classification regression from this session's own earlier fix.** A bare "NOR" mention must not let `business_trip` outscore a clear procurement/reimbursement signal. (Likely fix: require the trip-specific pattern, not just the bare `'nor'` keyword, to contribute to `business_trip`'s score — or make category selection prefer a more specific-type signal when one exists.)
2. **Branch `CREATE_NOR`'s required-facts schema by `type`.** This is the single most load-bearing fix — without it, no non-trip NOR can ever be asked sensible questions, regardless of any other fix.
3. **Add `type` scoping to Knowledge** (contract + retrieval + gap-detection + reasoning). Without this, even authoring procurement Knowledge tomorrow wouldn't stop it from being drowned out by trip content, or vice versa.
4. **Wire `reason()` into the CREATE_NOR path.** Currently contributes nothing to the only working flow.
5. **Fix `nor-generator.js`'s silent-zero bug.** Confidently-wrong output is worse than honestly-missing output.

**High**
6. Author real, minimal procurement-type Knowledge (ontology, workflow, approval chain, signatories, item/quantity/cost-slotted sentence patterns, numbering rule) — mirroring the shape of the existing trip bootstrap.
7. Build a minimal real review surface so a human can see and edit an actual composed NOR draft (not a dev-mode section count).
8. Wire `editSection` to that surface so Learning can finally apply to Composition output.
9. Implement the 4 currently-unresolved formatting rules (document number, long-form date, Roman month, terbilang) — needed even for the one working type.

**Medium**
10. Connect Composition output to a real document renderer — without this, "receive a completed NOR" cannot literally happen even when everything upstream works.
11. Extend Profile-Override-style reuse to more fields where organizationally sound, once more types exist (destination/dates should likely stay per-occasion by design).
12. Route metadata-confirmation / Knowledge-Request-Changes Learning Events somewhere that actually reduces future friction, not just an audit trail.

**Low**
13. Reimbursement-type Knowledge authoring — do after procurement is proven end-to-end.
14. Broader Learning taxonomy work — not useful until the two inert correction paths have somewhere real to feed.

---

## Estimated Completion Toward North Star

**~15%**, blended across the three named NOR types, weighted toward what a real user would actually type. Breaking down why it isn't higher: even the *one* type with any real Knowledge (trip/petty-cash) fails 6 of 9 pipeline stages at meaningful quality (Reasoning unwired, Composition ~32% real content with actively-wrong sections, no rendering, no review surface, Learning mostly inert) — engineering infrastructure is comprehensive, but almost none of it currently converges into "type a request, get a usable NOR." The other two named types (procurement, reimbursement) are at effectively 0%: no field schema, no Knowledge, and — as of this session's classification fix — a real risk of being silently misrouted into the trip flow instead of failing honestly.

---

## Concrete Next Milestone

Fix Critical items 1–3 (stop the misrouting, branch the field schema by type, add type-scoping to Knowledge), then author the minimal procurement Knowledge set from High item 6, then re-run the exact acceptance-test phrase — **"Buatkan NOR pembelian meja ruang Binpres."** — end-to-end. Success criterion: the Conversation asks about the item/quantity/room/estimated cost, not travel dates, and Composition cites procurement-specific rules, not petty-cash ones. That single scenario, done honestly, is a better proof point than any further audit.

---

## Acceptance Test

**Prompt: "Buatkan NOR pembelian meja ruang Binpres."**

**Verdict: E — No.**

Not "high effort" — genuinely broken today, verified by running the real code, not inferred:
- Misclassified as `business_trip` (confidence 0.300, beating `procurement`'s 0.125) — a direct, confirmed side effect of this session's own earlier classification fix.
- The resulting Conversation asks for `destination`/`traveler`/`departureDate`/`returnDate`/`budget` — none of which are the right questions for buying a table for Ruang Binpres.
- Even if a user answered those nonsense questions, Knowledge Retrieval has zero real procurement content, Gap Detection would falsely report no gaps, Reasoning never runs in this path at all, and Composition has no `domainType`/schema path connecting a procurement request to a real NOR.
- Even the *one* working (trip) path this same prompt would be mistaken for produces a document that is roughly a third real content, a third silently wrong, and a third either honestly-unknown or actively wrong-domain prose — with no rendering, no review surface, and no way to turn a human's fix into future improvement.
