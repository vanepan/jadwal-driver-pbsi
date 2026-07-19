# Phase 11, Sprint 11.12 — Evidence-First Ingestion (Architecture Correction)

> Directive: stop asking a human until every real evidence source has been
> exhausted. This was treated as an architecture correction, not a
> bugfix — the audit traced the pipeline to the exact line that decided
> "ask a human," replaced the premise (one document's own text is the only
> evidence that exists) with the real one (this document's text, PLUS the
> organization's own archived history, are both real evidence), and
> re-verified every existing invariant this repository's prior eleven
> sprints already established for this pipeline. Nothing was removed;
> nothing already-honest was weakened. Nothing committed or pushed.

## The bottleneck, found and named precisely

Every "ask a human" decision in the ingestion pipeline traces to exactly
one function: `hasContentFacts(session)`
(`js/v2/knowledge/datasets/import-session/import-session-engine.js:374`).
For a PDF/DOCX, it is `true` only when `session.manualEntryFacts` is
non-empty. `manualEntryFacts` was populated by exactly ONE evidence
source: `content-fact-extraction-engine.js`'s regex read of THIS
document's own text (`dataset-import-center.js#processOneFile`), gated by
`isContentFactsComplete()` — ALL THREE fields (documentNumber,
senderOrigin, value) must be found, or none are promoted. If a single
field failed — a "Dari" line worded slightly differently, a PDF with no
reader at all, a `.docx` Mammoth couldn't fully parse — the session went
straight to `AWAITING_EVIDENCE` and the human saw "Lengkapi Metadata &
Fakta." There was no step in between. This is the literal, file:line
version of the brief's diagram: `Upload → OCR → Parser → Missing Facts →
Ask Human`.

## What the audit found already existed (reuse, not invention)

Before writing any new reasoning, the existing codebase was audited for
real infrastructure the correction could reuse — per this project's own
"prefer integration over invention" discipline, established in every
prior Phase 11 sprint report:

- **Cross-document consensus, as a pattern**: `pattern-discovery-
  engine.js#recurringCorrectionRecommendations`/`writingStyleRecommendations`
  already establish the exact idiom (`RECURRING_THRESHOLD`, `confidence =
  min(1, count/5)`) for "a value repeated enough times across real
  organizational records is trustworthy evidence." The new engine reuses
  this idiom's spirit (never its exact formula — see below for why).
- **`ArchiveRecord.senderOrigin`**: every archived document — whether its
  facts came from extraction or a human — already carries a real
  `senderOrigin` field (`organizational-memory/contracts/archive-record-
  contract.js`). This is, unmodified, the exact ledger the brief asks for
  under points 2 ("Approved Knowledge"), 3 ("Organization Memory"), 4
  ("Similar Documents"), and 7 ("Previously corrected reviewer edits") —
  a human's Advanced Metadata correction becomes part of this same ledger
  the next time that document is archived, with zero new plumbing.
- **The one-way dependency rule**: `knowledge/` may never import
  `organizational-memory/`. `dataset-import-center.js` is already the one
  UI-layer seam allowed to see both (it already does this for
  `archiveDuplicateWarning`/`doArchive`) — so the new evidence-gathering
  step was placed there, and the new pure engine stays dependency-free.

## What was investigated and deliberately NOT used (and why)

**Approved `rule`/`signatory` bootstrap Knowledge** (`knowledge/bootstrap/
nor-reverse-engineering-knowledge.js`) contains a real, human-authored,
Approved fact: `scope: 'sender'`, "the Dari field is always... Plt. Kabid
Sarana dan Prasarana." This looks, at first read, like exactly the
"Approved Knowledge" evidence source the brief names. It was traced in
detail and **deliberately rejected** as an auto-fill source for ingestion:
this fact describes who SHOULD sign a document composed TODAY — a
compose-time policy — and this codebase's own bootstrap data documents a
real leadership transition (Monika Yunita → Plt. Raras Ayu Pratama)
mid-corpus. Trusting it blindly would silently mis-fill any archived
document from before the most recent transition: a real correctness bug,
not a style nuance, and exactly the "guessing more" the brief explicitly
forbids. The empirical, archive-weighted majority vote built instead is
self-correcting: a real transition shows up as a genuine agreement split
and correctly declines to auto-resolve. This is documented at length in
`content-fact-consensus-engine.js`'s own header so a future reader does
not "fix" this by wiring the bootstrap rule back in.

**A `template_pattern`/"blueprint" engine** (kind-registry.js's
`template_pattern`, `pattern-contract.js`'s `PatternEntry`) exists as a
registered kind and typedef but has zero real, populated data and zero
connector — building it out now would be speculative machinery with
nothing to ground it against, the same violation of CLAUDE.md's "never
invent business rules" every prior sprint has refused to commit. One
genuinely real, evidenced blueprint WAS found — a bootstrap rule stating
Petty Cash's `value` (Perihal) is a deterministic date template — but its
only representation is free prose (`payload.statement`), and parsing that
prose to synthesize a fact would be exactly the "invent business rules
from a comment" anti-pattern this codebase has never done. Named here as
a real, concrete, grounded future extension point (see below), not
silently built and not silently ignored.

**`documentNumber` and `value` (Perihal) were never made consensus-able,
on principle, not by omission.** A document's own sequence number and its
own subject are irreducibly per-document facts — no number of sibling
documents agreeing with EACH OTHER can answer what THIS document's own
number or purpose is. Only `senderOrigin` — which organizational unit
typically originates a domain's documents — is a genuine, recurring
organizational fact. This asymmetry is the single most important design
decision in this sprint and is documented in the new engine's own header.

## The new evidence-resolution ladder

```
Extract from THIS document's own text     (content-fact-extraction-engine.js, UNCHANGED)
        ↓ (still unresolved)
Resolve documentNumber from the FILENAME  (metadata-inference-engine.js's floor,
                                            now extended to PDF, not just .docx —
                                            a real, small, zero-risk gap: the floor
                                            never reads file content, so restricting
                                            it to .docx was never a real safety
                                            boundary)
        ↓ (senderOrigin still unresolved)
Resolve senderOrigin from ORGANIZATIONAL MEMORY
  (content-fact-consensus-engine.js, fed this domain's real ArchiveRecord
   history — every prior document's senderOrigin, however it was
   originally obtained: extraction, filename, or a human's correction)
        ↓ (still unresolved, or the vote was genuinely split)
Human review — with an honest, specific, plain-language reason
```

`content-fact-consensus-engine.js` (new, pure, zero dependencies) requires
BOTH real corroboration (`MIN_CONSENSUS_SUPPORT = 3` prior documents —
deliberately stricter than Pattern Discovery's own `RECURRING_THRESHOLD =
2`, because this result is WRITTEN with no further human confirmation,
not merely surfaced as a reviewable suggestion) AND real agreement
(`MIN_CONSENSUS_AGREEMENT = 0.8`) before it will ever resolve a field.
Below either bar, the field stays genuinely unresolved and the engine says
exactly why (not enough history, or a real disagreement) — never a guess
dressed as a fact, per the brief's own explicit instruction.

Every consensus attempt — resolved or not — is recorded on the session
(`consensusSuggestion`, new field, mirrors `extractionSuggestion`'s
existing "always record the attempt" discipline) and
`factsProvenance.source` gains a third honest value, `'evidence-
resolution'`, distinct from `'human'` and `'auto-extraction'` — a field
resolved by consensus is never mistaken for one a person actually typed
(the one hard rule `fact-merge-engine.js` already enforces: a human's
answer is never silently overwritten).

## UI wording — the internal model is no longer the user's problem

Per the brief's explicit instruction, every Normal-Mode-visible string
that exposed an internal engine/data-model term was reworded to state the
real reason instead:

| Before | After |
|---|---|
| "Lengkapi Metadata & Fakta" (button) | "Tinjau Dokumen Ini" |
| "Advanced Metadata — {filename}" (panel title) | "Tinjau Dokumen Ini — {filename}" |
| "Metadata Belum Yakin" (exception group) | "Kategori Dokumen Belum Pasti" |
| "Fakta Dokumen Belum Diisi" (exception group) | "Perlu Konfirmasi Isi Dokumen" |
| "Kesalahan Validasi" (exception group) | "Perlu Diperbaiki" |
| "Confidence 0.4 di bawah ambang batas populasi otomatis (0.6)." | "Kami belum cukup yakin dokumen ini termasuk kategori/domain yang mana — mohon konfirmasi kategorinya." |
| "Parser konten (v3) membaca dokumen ini tetapi tidak menemukan pola..." | "Kami sudah membaca dokumen ini tetapi tidak menemukan pola..." |
| "{field} belum ditemukan." (blank hint) | The REAL reason — either the honest "not found on this document" (documentNumber/value, which are never consensus-eligible), or, for senderOrigin specifically, the actual consensus rationale ("3 dari 4 dokumen sejenis... — cukup konsisten" / "kecocokan tertinggi 60% dari 5 dokumen... — tidak cukup meyakinkan") — the brief's own "we found two different document patterns and need confirmation" example, verbatim in spirit |

The underlying diagnosis was never fabricated to produce nicer copy — the
new messages read from the exact same persisted fields
(`extractionSuggestion`, the new `consensusSuggestion`) the old messages
did; only the wording changed, and the new field's own rationale text is
reused verbatim in the UI rather than re-worded a second time (one
explanation, one source of truth).

## Why the pipeline scales to thousands of documents

The mechanism is self-reinforcing without any new plumbing: every
imported document — resolved by extraction, by consensus, or by a human —
is archived with its real `senderOrigin`, which becomes part of the next
document's evidence pool. A cold-start batch (the organization's very
first uploads for a domain) gets no consensus help for the first two
documents (honestly reported as "not enough history yet") and asks a
human for `senderOrigin` on those; the third onward, if the first two (and
it) agree, resolves automatically. By the time a real bulk historical
import reaches "document #50," the vast majority of same-domain uploads
whose own text fails to name a sender no longer need a human for that
field at all — exactly the brief's "Day 1 many questions, Day 30 fewer"
shape this repository's own `computeAutonomyTrend()` (Sprint 8) already
measures and displays, now genuinely fed by a new evidence source instead
of only by metadata-classification confidence.

## Regression summary

New: `content-fact-consensus-engine.js` (pure engine),
`content-fact-consensus-check.mjs` (25/25, unit tests of the pure engine
in isolation — determinism, the honest-floor case, the exact-threshold
boundary, a modeled real leadership-transition split-vote, messy/blank
input), `evidence-first-ingestion-check.mjs` (22/22, end-to-end: real
`ArchiveRecord`s seeded via the real `archiveImportedKnowledge()`, a
"faithful replica" of `processOneFile()`'s real evidence-resolution call
sequence — same functions, same order — proving a session with
NO human intervention reaches the REAL terminal `ARCHIVED` state with
`autoImported: true`, that a genuine disagreement correctly refuses to
resolve, that insufficient history is never mistaken for consensus, and
that the Advanced Metadata panel surfaces the real per-field consensus
rationale rather than a blank "not found").

Changed: `content-fact-extraction-engine.js` — **zero behavior change**
(only this report and the consensus engine reference it; its own
extraction regexes were re-examined against the two real grounding
documents this repository has and found to already be at the limit of
what those two real samples can honestly ground — see Known Limitations);
`import-session-contract.js` (additive `consensusSuggestion` field +
JSDoc); `import-session-engine.js` (additive `attachConsensusSuggestion`);
`dataset-import-center.js` (the resolution ladder in `processOneFile`, the
PDF documentNumber-floor extension, and the UI wording pass above).

| Script | Result |
|---|---|
| content-fact-consensus-check.mjs (NEW) | 25/25 |
| evidence-first-ingestion-check.mjs (NEW) | 22/22 |
| content-fact-extraction-check.mjs | 24/24 |
| dataset-import-center-check.mjs | 78/78 |
| import-session-check.mjs | 55/55 |
| pipeline-state-machine-check.mjs | 78/78 |

Full repository-wide sweep (all 153 `scripts/*.mjs`, the same methodology
Sprint 11.8/11.9/11.10's own closing audits used): **147/153 fully
passing, 6 with failures — every one individually triaged, not assumed**:

| Script | Result | Verdict |
|---|---|---|
| `sarpras-home-experience-check.mjs` | 13/14 | Pre-existing (documented since Sprint 11.4–11.8; identical failing assertion — an off-script utterance recognition case, unrelated to ingestion) |
| `sarpras-workspace-completion-check.mjs` | 58/59 | Pre-existing (identical failing assertion — outer shell `SCREEN_IDS`; the file only appears in this check as a static `.includes()` string-presence read, never executed/imported) |
| `learning-dashboard-today-check.mjs` | 4/6 | Pre-existing (identical 2 failing assertions — "today" knowledge-fact counting, a Learning Dashboard date-bucketing concern; `git stash`-isolated by Sprint 11.9's own report already) |
| `knowledge-acquisition-dom-check.mjs` | 11/12 | Pre-existing (a stale exact-connector-count assertion, "12 connectors registered" — unrelated to ingestion; imports none of this session's changed files, confirmed by direct dependency grep) |
| `maintenance-intelligence-check.mjs` | 34/41 | Unrelated domain (Driver Scheduling fleet maintenance / `APP_VERSION` drift; imports none of this session's changed files) |
| `unified-scoring-dom-check.mjs` | 8/10 | Unrelated domain (Driver Scheduling dispatch-dashboard capacity pills; imports none of this session's changed files) |

**Zero regressions introduced by Sprint 11.12.** Verification method: a
direct dependency grep (not an assumption) confirmed none of the 6 failing
scripts import or execute `dataset-import-center.js`,
`content-fact-extraction-engine.js`, `content-fact-consensus-engine.js`,
`import-session-engine.js`, or `import-session-contract.js` — the only two
scripts that mention `dataset-import-center.js` at all
(`learning-dashboard-today-check.mjs`, `sarpras-workspace-completion-
check.mjs`) do so as a static `fs.readFileSync(...).includes(...)`
string-presence check against import lines this sprint never removed or
altered, never by importing/executing the module. Every failing
assertion's wording is byte-identical to what Sprint 11.4–11.10's own
reports already documented as pre-existing.

## Known limitations

1. **PDF still has zero content extraction (no OCR).** This sprint did
   not change that — it is a real, separate initiative, unchanged from
   every prior sprint's own disclosure. What DID change: a PDF's
   `documentNumber` can now resolve from its filename (previously
   `.docx`-only for no real reason), and its `senderOrigin` can now
   resolve from organizational memory exactly like a `.docx`'s can — so a
   PDF is no longer unconditionally 100% manual, even though it is still
   the least autonomous format.
2. **`documentNumber` and `value` (Perihal) remain irreducibly
   per-document for every domain except the one where this codebase
   already has grounded evidence they are NOT (Petty Cash's date-derived
   Perihal template — see below).** This is a design decision, not a gap:
   see "What was investigated and deliberately NOT used" above for why
   guessing either would be fabrication, not inference.
3. **Consensus is grouped by `domainType` alone, not by NOR Type.** Import
   Sessions do not currently capture a NOR Type at upload time (that
   classification currently only happens later, during composition), so
   a corpus spanning multiple NOR Types under one `domainType` (e.g.
   `'nor'` covering Petty Cash, Perjalanan Dinas, and Pengadaan together)
   is coarser than ideal. This is a real, honestly-disclosed limitation —
   NOT a silent correctness risk, because `MIN_CONSENSUS_AGREEMENT = 0.8`
   is the actual safety net: a corpus with genuinely different senders
   per NOR Type will show reduced agreement and correctly decline to
   auto-resolve, rather than confidently blending incompatible evidence.
   A future NOR-Type-scoped consensus (once Import Sessions capture that
   dimension) would sharpen this further — a real, concrete extension
   point, not a blocker to shipping the coarser version now.
4. **The Petty Cash Perihal template rule** (`scope: 'perihal'`,
   `content-fact-extraction-engine.js`'s own grounding documents) is real,
   Approved, evidenced organizational knowledge that this sprint did NOT
   wire into auto-resolution, because its only representation today is
   free prose, and parsing prose into a fact generator is exactly the
   "invent business rules" anti-pattern this project forbids. The real
   fix — giving that rule (and others like it) a STRUCTURED
   `{template, variables}` payload a resolution engine could safely
   execute, rather than a sentence a human must read — is a genuine,
   evidenced, scoped future extension, named here rather than attempted
   as an unsafe shortcut.
5. **No live-browser, credentialed upload was exercised this session** —
   unchanged, standing limitation disclosed by every report in this
   series (`js/firebase.js`'s real `https://` CDN import cannot load
   under Node). `evidence-first-ingestion-check.mjs`'s "faithful replica"
   pattern (same idiom `import-batch-concurrency-check.mjs` already
   established) drives the real production engines in the real sequence
   `processOneFile()` uses, proving the DECISION LOGIC end to end; the
   browser-only `File → sha256 → Storage upload` prelude that precedes it
   is unchanged, already-shipping code this sprint did not touch.

## Future extension points

- NOR-Type-scoped consensus, once Import Sessions capture that dimension.
- A structured `{template, variables}` shape for evidenced-but-prose
  organizational rules (starting with the real Petty Cash Perihal rule),
  so a future resolution stage can safely execute a rule instead of only
  ever reading its `statement` for a human.
- Extending the same evidence-resolution ladder to `documentNumber`'s
  FORMAT (not its value) — the real numbering-format rule
  (`scope: 'norNumber'`) could validate a filename/extraction match
  against the organization's own documented convention, surfacing a
  format mismatch as a real reason for review, without ever inventing the
  number itself.
- A real Knowledge-Graph-backed evidence source (point 2 of the brief,
  "Existing Approved Knowledge") once a kind exists that records
  historically-accurate per-era sender/recipient facts (distinct from the
  compose-time "who signs today" bootstrap rules this sprint deliberately
  did not trust for this purpose).

## Not committed

Per this project's own standing discipline (every prior Phase 11 sprint
report): nothing in this session was committed or pushed.
