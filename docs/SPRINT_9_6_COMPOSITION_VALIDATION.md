# Sarpras Intelligence V2 — Phase 9, Sprint 9.6: Composition Validation

> Scope: compare `composeApprovedNor`'s real, live-composed output (post
> Sprint 9.5) against the real organizational NOR documents Sprint 9.2
> cataloged, for both types with production-ready evidence (Perjalanan
> Dinas, Pengadaan). Method: direct field-by-field comparison of
> `scripts/north-star-acceptance-check.mjs`'s real composed sections
> against NOR 077/055 (BPD) and NOR 005/029/032/089 (Pengadaan)'s literal
> text.

---

## Headline finding

**Two real bugs found by direct comparison, both fixed; one systemic gap
found and explicitly not fixed (a schema/authoring-scope question, not a
Composition defect).** `nor-composer.js#resolvePattern` resolves a
pattern's `{{slot}}` by looking up `gatheredFacts[slot]` — literally,
by name. Two of Sprint 9.3's own authored patterns used slot names
(`lokasi`, `nama`) that don't exist anywhere in a real Conversation's
gathered facts (the registered fieldSchema calls them `destination` and
`traveler`) — so they rendered as permanently unresolved placeholders no
matter what a human answered, for every future occasion, silently. Fixed
by renaming the slots to the real field names; both patterns now resolve
correctly, verified with 2 new permanent regression checks.

---

## 1. Composition Comparison Report — Perjalanan Dinas (composed vs. NOR 077)

| Real NOR 077 element | Composed section | Match? |
|---|---|---|
| `Jakarta, 25 Maret 2026` | `pattern.place-date-line` → `Jakarta, {{tanggalPanjang: UNKNOWN}}` | Structurally correct, value unresolved — **pre-existing, platform-wide gap** (no date-formatting logic exists anywhere in this platform for any NOR type, including Petty Cash; `NORTH_STAR_READINESS_AUDIT.md` Stage 7 already named this "100% human work"). Not new to this sprint. |
| `No.077/Nota Organisasi/Sarpras/II/2026` | corrected `pattern.document-number-line` → `No.{{urutan}}/Nota Organisasi/Sarpras/{{bulanRomawi}}/{{tahun}}` | Structurally correct template (and now Generic, per Sprint 9.3's own correction); values unresolved for the same pre-existing reason — a human enters the sequence number by design (`rule.no-numbering-validation`). |
| `Kepada Yth. / Dari / Tembusan Yth.` | **absent** | **Real gap, not fixed this sprint.** No `recipient`/`cc` KnowledgeItem was authored for Perjalanan Dinas in Sprint 9.3 — only Petty Cash has `rule.recipients-fixed`/`rule.cc-fixed`/`rule.sender-fixed`. Composition has nothing to cite here at all. Flagged for a Sprint 9.3 follow-up, not authored here (Sprint 9.6 validates, it does not author). |
| `Perihal: Pengajuan Biaya Perjalanan Dinas (BPD) Survei Lokasi Sirnas B Bali 2026` | `pattern.bpd-perihal-subject-line` → **before fix**: permanently `{{lokasi: UNKNOWN}}` — **after fix**: `Pengajuan Biaya Perjalanan Dinas (BPD) Survei Lokasi Bandung` | **Bug found and fixed.** Template shape exactly matches real evidence; slot now correctly resolves the human-answered destination. |
| `Sehubungan dengan rencana pelaksanaan Sirkuit Nasional (Sirnas)... kami mengajukan biaya perjalanan dinas [nama] ([jabatan])...` | `pattern.bpd-context-paragraph` → **before fix**: `nama` permanently unresolved — **after fix**: resolves to `Unit Sarpras`; `tahun`/`jabatan`/`kegiatan` remain honestly unresolved | **Partially fixed.** `traveler` now flows through. `tahun` needs date-derivation (a code change, out of scope); `jabatan` (traveler's role) and `kegiatan` (named activity) have no evidenced source in the registered fieldSchema at all — Perjalanan Dinas's Conversation never asks either, so authoring a resolution for them would be inventing a fact source, not fixing a bug. |
| `Dengan hormat,` / closing sentence | `pattern.salutation` / `pattern.closing-sentence` | **Exact match**, both Generic, both fully resolved — unchanged from Petty Cash's own baseline. |
| Rincian BPD (itemized cost table) | **absent from Conversation-gathered facts entirely** | Real, already-flagged gap (`docs/SPRINT_9_3_KNOWLEDGE_AUTHORING.md` §5): the registered fieldSchema asks one lump `budget`, never the 5-category breakdown real evidence shows. A Conversation answer of "5000000" has no path into the real document's actual cost-table shape. Not a Composition bug — a Conversation-engine/fieldSchema limitation, named, not fixed. |

## 2. Composition Comparison Report — Pengadaan (composed vs. NOR 089)

| Real NOR 089 element | Composed section | Match? |
|---|---|---|
| `Perihal: Pengajuan Pembelian Kebutuhan Engineering Tambahan Periode Bulan April 2026` | `pattern.pengadaan-perihal-pembelian` → `Pengajuan Pembelian Kebutuhan {{kebutuhan}}` | **Found, not fixed.** Unlike BPD's `lokasi`, "kebutuhan" (a procurement *category* — "Engineering", "Cleaning Service") has no clean 1:1 registered fieldSchema field. `purpose` is the nearest candidate but is evidenced as a per-occasion justification, not a category — renaming on that guess would fabricate an equivalence this platform's own discipline forbids. Left unresolved, documented. |
| (item name, e.g. "meja") | `pattern.pengadaan-perihal-pencetakan` → `Pengajuan Pencetakan Meja` | **Already correct, no fix needed** — this pattern's sole slot (`item`) happened to already match the real fieldSchema field name. |
| `Sehubungan dengan menunjang operasional kebutuhan [bidang]... periode bulan [bulan] [tahun]...` | `pattern.pengadaan-context-paragraph` | Same "kebutuhan"-shaped gap as above (`bidang`/`bulan`/`tahun`); documented, not fixed. |
| `Kepada Yth. ... Dari ... Tembusan Yth.` | **absent** | Same real gap as Perjalanan Dinas — no recipient/cc Knowledge authored for Pengadaan either. |
| Itemized purchase list (Nama Item / Harga Satuan / Permintaan / Satuan / Total Harga) | **absent from Conversation-gathered facts** | Same known limitation as BPD's cost breakdown — `docs/SPRINT_9_3_KNOWLEDGE_AUTHORING.md` §5 already named this (single-item fieldSchema vs. real multi-item reality). |

---

## 3. Correct Numbering, Rendering, Terminology, Approval Chain

- **Numbering**: template structurally correct for both types (and now
  correctly Generic post-correction); values are a pre-existing,
  platform-wide human-entry point, unchanged by this sprint.
- **Rendering rules considered**: both types' rendering rules
  (`rendering.bpd-rincian-table-columns`, `rendering.pengadaan-itemlist-
  table-columns`, and the signature-layout rules) are correctly surfaced
  as `renderingRulesConsidered` — informational only, never applied to
  any actual layout (unchanged design from Iteration 2 — this platform
  produces no PDF/HTML rendering at all, by documented, deliberate
  architectural choice, `nor-composer.js`'s own header).
- **Terminology**: `vocabulary.bpd-abbreviation` (BPD) and
  `vocabulary.pengadaan-diadakan-oleh` are real, evidenced, and correctly
  scoped — no cross-terminology contamination observed.
- **Approval chain**: both `approval-chain.bpd-signers` and
  `approval-chain.pengadaan-signers` are correctly cited, with real
  individual names, and — since Sprint 9.5 — Reasoning's own live
  citation of `rule.bpd-no-pengadaan-involvement` /
  `rule.pengadaan-kabid-approval-required` confirms each type's approval
  chain is being reasoned about, not merely listed.

---

## 4. Human Editing Report

| | Perjalanan Dinas (Business Trip scenario) | Pengadaan (Procurement scenario) |
|---|---|---|
| Total composed sections | 17 | 17 |
| Unresolved fields, before Sprint 9.6's fix | 9 | 8 |
| Unresolved fields, after fix | **7** | 8 (unchanged — no safe fix available) |
| Of those, pre-existing platform-wide gaps (date/numbering formatting — affects every NOR type, including Petty Cash) | 4 (`tanggalPanjang`, `terbilangValue`, `urutan`, `bulanRomawi`) | 4 (identical 4) |
| Of those, genuinely NOR-Type-specific gaps (no evidenced source field) | 3 (`tahun`, `jabatan`, `kegiatan`) | 4 (`kebutuhan`, `bidang`, `bulan`, `tahun`) |
| Recipient/cc/sender block | Absent entirely (not authored) | Absent entirely (not authored) |
| Itemized cost/purchase table | Absent from Conversation (fieldSchema limitation) | Absent from Conversation (fieldSchema limitation) |

**Reading this honestly**: composition is measurably more useful after
Sprint 9.6's fix (2 fewer permanently-broken placeholders, verified with
real evidence), but both NOR Types still require substantial human
completion — the recipient/cc block and the real itemized
breakdown/purchase-list table, which a human must add by hand today. This
is not a regression from Petty Cash's own baseline (Petty Cash has the
identical class of limitation for anything not captured by its own
fieldSchema) — it is the same, now-quantified limitation for two more
real NOR Types.

---

## 5. Updated Readiness

No change to the overall North Star readiness estimate from prior
iterations (still gated by the same platform-wide blockers:
Reasoning-into-Conversation's field-resolution mechanism per Sprint 9.4,
no PDF rendering by design, no itemized/repeating-field Conversation
support). What changed: Perjalanan Dinas and Pengadaan now have a REAL,
evidence-validated composition path with 2 fewer defects than when
authored, instead of an unvalidated one. Acceptance harness: 34/34 (was
32/32 — 2 new permanent regression checks for the fixed patterns). Full
regression sweep re-verified green across 9 check scripts.
