# NOR-Specification.md — Nota Organisasi Reverse-Engineering Report

> Phase 1 of Sarpras Intelligence's Knowledge Acquisition track. Written as
> organizational-analyst research, not software engineering — no production
> code was written or modified to produce this report.
>
> **Evidence base** (every claim below cites which of these it rests on):
> 1. Two real, filled, organizationally-issued NOR documents:
>    `Petty Cash Center/uploads/Nota Organisasi Sarpras 113 - Realisasi Petty Cash Pertanggal 12 Mei 2026 Bidang Sarana dan Prasarana.pdf` (issued 18 Mei 2026)
>    `Petty Cash Center/uploads/Nota Organisasi Sarpras 120 - Realisasi Petty Cash_260603_184903.pdf` (issued 02 Juni 2026)
> 2. One filed document of a differently-named type, content unread (binary
>    `.docx`, no tool available in this session to parse it):
>    `Petty Cash Center/uploads/Memo Sarpras 362 - Realisasi Petty Cash Pertanggal 18 September 2025 Bidang Sarana dan Prasarana.docx`
> 3. Two screenshots of the live production UI (`Petty Cash Center/screenshots/nor-detail.png`, `nor-sign.png`), confirming NOR No.112 renders identically in-app to the PDF structure below.
> 4. The actual generation code: `js/petty-cash/nor-document-engine.js`, `js/docs/templates/nor.js` (pdfmake/PDF), `js/petty-cash/nor-paper.js` (on-screen HTML), `js/petty-cash/nor-excel-exporter.js` (XLSX), `js/petty-cash/petty-cash-config.js` (settings/enums/formatters), `js/petty-cash/petty-cash-service.js#generateNor()` (validation + assembly).
>
> **A correction to this project's own prior assumption**: `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` §2.1 and §4.4, and this session's own `docs/SARPRAS_INTELLIGENCE_ARCHITECTURE_ASSESSMENT.md` §3.2, both state or imply "there is no historical filled-document corpus to mine." That is **not entirely true** — two real, signed NOR instances and one differently-named predecessor document exist in this repository, filed under `Petty Cash Center/uploads/` (a design-reference bundle, not a repository-integrated archive). This is a thin corpus — two filled instances, not a population — but it is not zero, and it is the evidence base this report is built on. This finding does not invalidate the prior "content gap" finding; a Knowledge Platform cannot generalize confidently from n=2. It does mean this report can be evidence-grounded rather than purely code-inferred.

---

## Executive Summary

A NOR (Nota Organisasi) is PBSI's internal accountability instrument for
petty-cash replenishment: a `Plt. Kabid Sarana dan Prasarana` (currently
Raras Ayu Pratama) formally reports to three named organizational authorities
that a fixed operating float (`Rp 15.000.000`) has been spent down to near-zero
over roughly a one-month cycle, itemizes every expenditure to the Rupiah, and
requests the float be topped back up. It is simultaneously a **report** (what
was spent), a **request** (please replenish), and a **compliance artifact**
(three copies for internal audit/archive). Every observed field, boilerplate
sentence, and structural rule below is either directly evidenced in the two
real documents or in the code that generates them — nothing here is invented.
Two areas are honestly **not knowable from available evidence** and are
marked so throughout: (1) the deeper organizational trigger/history behind
*why* this instrument exists in this exact form (no prior institutional
memory, meeting minutes, or founding decision document was available to this
report), and (2) the tacit follow-up questions an experienced Sarpras staff
member would actually ask (§F) — this requires human interview, not document
mining, and is flagged rather than fabricated.

---

## A. Document Anatomy

Confirmed identical across both real instances (No.113, No.120) and the
in-app screenshot (No.112) — this is a fixed, invariant structure, not a
per-document choice.

### A.1 Page 1 — "NOTA ORGANISASI" (cover letter)

| Order | Element | Mandatory? | Evidence |
|---|---|---|---|
| 1 | PBSI crest (centered) | Mandatory | Both PDFs, `templates/nor.js:165` |
| 2 | Title "NOTA ORGANISASI" (centered, bold, no underline) | Mandatory | Both PDFs, `templates/nor.js:166` |
| 3 | Place + date line: `Jakarta, {tanggal panjang}` | Mandatory | Both PDFs |
| 4 | Document number: `No.{urutan}/Nota Organisasi/Sarpras/{bulan Romawi}/{tahun}` | Mandatory | Both PDFs; format enforced in code (`petty-cash-config.js` NOR number auto-formatter) |
| 5 | `Kepada Yth.` — numbered recipient list (3 fixed roles) | Mandatory | Both PDFs identical: Wakil Ketua Umum III, Sekretaris Jenderal, Bendahara |
| 6 | `Dari` — single sender role | Mandatory | Both PDFs identical: `Plt. Kabid Sarana dan Prasarana` |
| 7 | `Tembusan Yth.` — numbered cc list (3 fixed roles) | Mandatory | Both PDFs identical: Ketua Umum sebagai laporan, Audit Internal, Arsip |
| 8 | `Perihal` — bold subject line | Mandatory | Auto-generated, never hand-typed (see §B, §D) |
| 9 | `Lampiran` — attachment count | Mandatory, constant | Both PDFs: `1 (satu) berkas` — code hardcodes this literal, never computed |
| 10 | Opening salutation: `Dengan hormat,` | Mandatory, fixed | Both PDFs verbatim |
| 11 | Context paragraph (justified prose, fixed template with slots) | Mandatory | Both PDFs verbatim except date |
| 12 | Balance recap block (`Dana Awal` / `Dana Terealisasi` / `Sisa Dana`) | Mandatory | Both PDFs |
| 13 | `Terbilang:` — the remaining balance spelled out in words, italicized | Mandatory | Both PDFs (see §E.4 — an observed **inconsistency**, not a template bug) |
| 14 | Request paragraph (justified prose, fixed template, no slots) | Mandatory, fixed | Both PDFs verbatim |
| 15 | Closing paragraph: `Demikian nota organisasi ini disampaikan, atas perhatiannya kami ucapkan terima kasih.` | Mandatory, fixed | Both PDFs verbatim |
| 16 | Signature grid — 3-up top row + 1 solo row beneath | Mandatory | Both PDFs, same 4 names/roles/order in both |
| 17 | Page footer | **Absent on page 1 by deliberate rule** | `templates/nor.js:150` — explicit `currentPage === 1 ? undefined : …` |

### A.2 Page 2+ — "RINCIAN PENGGUNAAN PETTY CASH" (itemized ledger)

| Order | Element | Mandatory? | Evidence |
|---|---|---|---|
| 1 | Title, 2 lines, centered: `RINCIAN PENGGUNAAN PETTY CASH` / `BIDANG SARANA DAN PRASARANA` | Mandatory | Both PDFs |
| 2 | Bordered ledger table, 5 columns: `No · Tanggal · Rincian · Biaya · Keterangan` | Mandatory | Both PDFs — full 1pt black grid |
| 3 | One row per expense; multiple expenses on the same date are visually grouped under one merged date cell | Mandatory | Both PDFs (e.g. NOR 113 rows 2–9 all under "Friday, 10 April 2026" onward) |
| 4 | Optional sub-breakdown inside a `Rincian` cell (indented, smaller, dim) for reimbursement-type entries | Conditional | Confirmed in code (`reimburseLines()`); not present in either real sample (both are direct petty-cash lines, not reimbursements) — **Unknown in the wild**, code-only evidence |
| 5 | `Total Pengeluaran` row, bold, right-aligned, spans 3 columns + total | Mandatory | Both PDFs |
| 6 | Balance recap block, repeated (same three lines as page 1) | Mandatory | Both PDFs |
| 7 | `Terbilang:` line, repeated | Mandatory | Both PDFs |
| 8 | Signature grid — 2-up (`Dibuat Oleh` / `Disetujui Oleh`) | Mandatory | Both PDFs |
| 9 | Page footer: app name/version + `Hal. X / Y` | Mandatory on page 2+ only | `templates/nor.js:150-157` |

### A.3 Anatomy invariants worth naming explicitly

- **The document is always exactly 2 logical sections, never fewer.** Every
  observed instance has a cover letter and a ledger — none omits the ledger,
  even when the "1 (satu) berkas" attachment line implies the ledger is
  logically a separate attached file. In practice the ledger is page 2+ of
  the *same* PDF, not a separate attachment (`pageBreak: 'before'` in code,
  confirmed by both real PDFs' internal page numbering).
- **No optional top-level section was ever observed absent** in either real
  sample. Everything in the table above that this report marks "Mandatory"
  is mandatory by construction (hardcoded in the template), not by
  convention — there is no code path that omits any of them.
- **The only two elements that vary in count across the whole document are**:
  the ledger's row count (43–69 rows observed) and, in principle, the
  signature grid — code supports zero-to-many signatories per role, but both
  real samples use the exact same 4 top + 2 recap signatories.

---

## B. Language Specification

All boilerplate below is **verbatim, byte-identical** across both real PDFs
and the template source (`templates/nor.js`) — this is fixed corporate
prose, not paraphrased per-instance:

| Slot | Fixed text |
|---|---|
| Salutation | `Dengan hormat,` |
| Context paragraph | `Sehubungan dengan kegiatan operasional bidang sarana dan prasarana, kami melaporkan realisasi petty cash bidang sarana dan prasarana dengan rincian sebagai berikut:` |
| Request paragraph | `Sehubungan dengan telah direalisasikannya petty cash tersebut, kami memohon agar dana petty cash dapat ditambahkan kembali untuk memastikan kelancaran operasional di bidang Sarana dan Prasarana. Sebagai dasar perhitungan, kami lampirkan laporan realisasi penggunaan dana.` |
| Closing | `Demikian nota organisasi ini disampaikan, atas perhatiannya kami ucapkan terima kasih.` |

The **only** variable content anywhere in the cover-letter prose is: the
date, the document number, the three balance figures, and the `terbilang`
spell-out. Every sentence structure, every word choice, is otherwise
identical across both samples separated by more than two weeks and
generated at different times. This is strong, n=2-corroborated evidence
that **the cover letter's language is a fixed corporate register, not
free composition** — a human never writes new prose per NOR; they only
supply numbers.

### B.1 Vocabulary

- Consistently formal Bahasa Indonesia bureaucratic register (`Dengan
  hormat,` / `Sehubungan dengan …` / `Demikian … disampaikan, atas
  perhatiannya kami ucapkan terima kasih.` — a stock Indonesian formal-letter
  opening/closing triplet, not PBSI-specific idiom).
  standalone financial term: **Terbilang** (spell-out-in-words, a standard
  Indonesian formal-financial-document convention for fraud-resistance —
  present in both samples, present in code as a first-class field).
  Domain-specific compound: **"Nota Organisasi"** and **"petty cash"** used
  interchangeably as the subject of the report (code-block-italic in the
  template — `petty cash` is styled `italics: true` in pdfmake, confirming it
  is treated as a borrowed/foreign term, not native vocabulary).
- Line-item vocabulary (from the ledger rows, both samples) groups by
  organizational unit prefix — observed prefixes: `IT:`, `OB:`, `Engineering:`,
  `Sekretariat:`, `Keuangan:`, `Medis:`, `Turnamen:`, `Binpres Daerah:`,
  `Binpres:`, `Sarpras:`, `Comdev:`, `Cleaning Service:`, `Driver:`,
  `Kantin:`, `IT - Risbang:`, `Lain-lainnya:`/`Lainnya:`. **This is a real,
  organically-emerged taxonomy** — no code enforces or validates these
  prefixes (`description` is free text in the schema, `js/petty-cash/petty-cash-service.js`).
  It is organizational convention, not system rule — a Knowledge Asset
  candidate (§ Knowledge-Asset-Specification.md), not a business rule.

### B.2 Grammar / sentence structure

- Every label:value line in the meta block uses the same colon-aligned
  format (`Label` + tab/colon + value), never a narrative sentence — this is
  a forms-register, not prose-register, for structured facts.
- The two narrative paragraphs (context, request) are each exactly one
  long compound sentence with a `Sehubungan dengan …` (in-connection-with)
  opener — a recognizable formal-Indonesian bureaucratic sentence pattern
  reused twice in the same document.
- Numbers are **always** rendered two ways adjacent to each other: digits
  with thousands separators (`Rp 14.980.109,-`) AND spelled-out words
  (`Terbilang: …`) — never one without the other. This pairing is itself a
  language rule, not just a formatting rule.

### B.3 Tone

Formal, deferential, third-person-plural self-reference (`kami` — "we"),
addressed to superiors (`Kepada Yth.` — "to the honorable"). No
first-person-singular voice anywhere. Consistent across both samples.

### B.4 Opening / closing style

Opening is administrative header block (place, date, number, routing)
**before** any prose — the salutation `Dengan hormat,` comes only after all
routing metadata. Closing is a single fixed sentence, never a
personalized sign-off beyond the signature block itself.

---

## C. Rendering Specification

Cross-validated against **three independent renderers of the same NOR view
model** — this is itself a significant, evidenced architectural fact (the
platform's own `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md` §2.1 predicted
exactly this pattern for NOR before any of these three files existed):

| Renderer | File | Real evidence |
|---|---|---|
| PDF (print/download) | `js/docs/templates/nor.js` | Matches both real PDFs field-for-field |
| On-screen ("paper") | `js/petty-cash/nor-paper.js` | Confirmed by screenshot, explicitly documented as sharing the identical view model as the PDF ("Generated PDF must match on-screen NOR") |
| Excel export | `js/petty-cash/nor-excel-exporter.js` | 3-sheet workbook: Rincian Pengeluaran / Ringkasan NOR / Audit Trail — code-only evidence, no real .xlsx sample available in this session |

### C.1 Typography

- Body: 10pt default. Ledger table: 9pt (9pt/7.5pt for the reimbursement
  sub-breakdown, when present). Title: 13pt bold. Page-2 title: 11pt bold.
- Design intent (per `templates/nor.js` header comment) is **Arial**; the
  PDF renderer substitutes Roboto as the closest embedded-font match — a
  known, documented, accepted rendering gap between on-screen (true Arial)
  and PDF (Roboto) output. This is an intentional platform limitation, not
  an error, and is visible if the two are compared pixel-for-pixel.
- Real, hand-signed instance (No.120) shows the printed name lines
  underlined and bold with an actual ink signature stroke above the name —
  confirming a **physical wet-signature step happens after digital
  generation**, at least for the version that gets filed/archived (see §D.4
  workflow inference). No.113 shows the same underlined-name layout with no
  visible ink — consistent with either an unsigned/reference copy or a
  cleanly-scanned one; **not distinguishable from the PDF alone**.

### C.2 Bold / emphasis rules

- Bold: document title, `Perihal` value, section titles, signatory
  position labels, signatory printed names, table headers, total row.
- Italic: `Terbilang` value line; the word "petty cash" wherever it appears
  in running prose (a deliberate borrowed-term convention, confirmed
  identically in both samples).
- Underline: signatory printed names only (never position labels, never
  body text).

### C.3 Spacing / alignment / pagination

- A4 portrait, uniform margins (56pt sides, 40pt top/bottom in code).
- Meta block (Kepada/Dari/Tembusan/Perihal/Lampiran) is a fixed 3-column
  borderless table (`96pt label / 10pt colon / remaining width`) — labels
  never wrap, values may.
- Balance recap is a fixed 3-column borderless table, values right-aligned.
- Ledger table columns are fixed-width except `Rincian`, which is the only
  flexible column (`'*'` in pdfmake) — this is the column that absorbs
  variable-length descriptions and the optional sub-breakdown.
- Page break between cover letter and ledger is unconditional — the ledger
  **always** starts on a new page, even for a very short cover letter
  (confirmed: both real samples' cover letters end well above the page
  bottom, and the ledger still starts on page 2).
- No footer at all on page 1 (a deliberate formality rule — a "real" internal
  memo carries no app branding); footer appears on ledger pages only, and
  only there does the app name/version + page-of-page counter appear.

### C.4 Signature layout

- Cover page: 3 signatories in one row (equal-width columns, 8pt gap),
  then 1 signatory alone in a second row beneath — this exact 3-then-1
  layout is fixed regardless of how many total signatories are configured
  (code slices `sigs.slice(0,3)` / `sigs.slice(3)`; both real samples happen
  to have exactly 4, matching this split precisely — **untested against a
  5th or 2nd** signatory in real evidence, Unknown beyond n=4).
- Ledger page: 2 signatories side by side, no third column.
- Each signature block: role label + comma, position (bold, uppercase),
  a fixed vertical gap for the physical ink signature (38–40pt), then the
  printed name (bold, underlined).

---

## D. Business Ontology

### D.1 Intent

Report actual expenditure of a discretionary operating float, and formally
request its replenishment. Confirmed by both the request paragraph's
literal wording and by the fact every real sample's `Sisa Dana` (remaining
balance) is near-zero (Rp 19.891 and Rp 11.569 respectively, against a
Rp 15.000.000 float) — the NOR is triggered by the float running low, not
issued on a fixed calendar schedule per se (though see D.2, the actual
cadence observed is close to monthly).

### D.2 Purpose / Trigger

- **Direct trigger, evidenced**: the operating float has been substantially
  spent down (~99.9% in both samples) and needs replenishing before it can
  fund further operations.
- **Cadence, inferred from two data points, not confirmed as a rule**: NOR
  113 covers 01 Apr–30 Apr 2026 (issued 18 Mei); NOR 120 covers 15 Apr–01 Jun
  2026 (issued 02 Jun) — cycles appear to be roughly monthly but with
  **overlapping date ranges** between consecutive NORs (120's ledger
  restarts at 15 April, inside 113's own April range). This is either (a) a
  genuine overlap because the float was replenished mid-cycle and a new
  cycle began before the old one's paperwork was filed, or (b) two
  differently-scoped exports of adjacent-but-distinct cycles. **Marked
  Unknown** — cannot be resolved without the underlying cycle records
  (`petty-cash-store.js#getCycles()`), which this report did not query
  live data for (out of scope: this is a document-reverse-engineering
  pass, not a data audit).

### D.3 Stakeholders (confirmed, both samples identical)

| Role | Function in this document | Named individual (as of these samples) |
|---|---|---|
| Plt. Kabid Sarana dan Prasarana | Originator/submitter | Raras Ayu Pratama |
| Wakil Ketua Umum III | Approver (Mengetahui dan Menyetujui) | Armand Darmadji |
| Sekretaris Jenderal | Co-approver (Mengetahui/Menyetujui) | Ricky Soebagdja |
| Wakil Bendahara | Disburser (Dibayarkan oleh) | Eddy Prayitno |
| Staf Sarana dan Prasarana | Ledger preparer (Dibuat Oleh, page 2) | Grace Widelia |
| Ketua Umum | Informational cc ("sebagai laporan") | — (not a signatory) |
| Audit Internal | Informational cc | — |
| Arsip | Informational cc / filing destination | — |

Every one of these roles is a **global setting**, not a per-document
choice (`DEFAULT_SETTINGS.signatories`/`recapSignatories`/`recipients`/
`ccRecipients` in `petty-cash-config.js`) — confirmed by both real samples
using the identical names/roles despite being separate cycles weeks apart.

### D.4 Approvals / Workflow (evidenced, partially inferred)

Confirmed steps, in implied sequence:
1. Staf Sarana dan Prasarana compiles the ledger (`Dibuat Oleh`).
2. Plt. Kabid Sarpras reviews/submits (`Diajukan oleh` on page 1,
   `Disetujui Oleh` on page 2 — **the same individual, Raras Ayu Pratama,
   appears to both submit and "approve" the recap in both samples** — this
   may indicate a single-person review at the departmental level before
   escalation, or may simply reflect a small-department reality where the
   department head is both preparer-supervisor and requester. **Marked
   Unknown** which interpretation is correct).
3. Wakil Ketua Umum III and Sekretaris Jenderal countersign
   ("Mengetahui dan Menyetujui" / "Mengetahui/Menyetujui") — both required,
   evidenced by both samples having both signature lines present (No.120
   shows an actual ink signature + handwritten date "03/06" next to Armand
   Darmadji's line, confirming this step happens after the document is
   printed, i.e., a real physical/scanned approval step, not merely digital).
4. Wakil Bendahara disburses (`Dibayarkan oleh`) — evidenced by the line
   being present on both cover pages; **no evidence in either sample of an
   actual signature at this line** (both show only the printed underlined
   name, no ink) — **Unknown** whether disbursement is confirmed by a
   separate instrument (e.g., a bank transfer record) rather than a
   signature on this document.
5. Three named parties (Ketua Umum, Audit Internal, Arsip) receive copies
   for information/record — no action implied by "Tembusan," evidenced by
   the "sebagai laporan" (as a report) qualifier on the first.

### D.5 Supporting documents

`Lampiran : 1 (satu) berkas` is present, fixed, and constant on both
samples — but the code that generates it hardcodes the string rather than
counting a real attached file (confirmed in `templates/nor.js`'s `_metaTable`).
**The "1 berkas" almost certainly refers to the ledger (page 2), which in
this system is physically part of the same PDF**, not a separate uploaded
file — an interesting discrepancy between the document's own self-description
("1 attachment") and its actual delivery mechanism (2 pages, 1 file, 0
separate attachments). This is worth flagging as a literal, evidenced fact:
the language of the document (a physical-mail-era convention: "here is 1
enclosed file") has outlived the delivery mechanism (a single digital PDF)
that replaced physical enclosures.

### D.6 Budget impact

Directly quantified in every instance: opening float, amount realized,
remaining balance, all in Rupiah, plus the annual budget context that
exists in code (`DEFAULT_ANNUAL_PETTY_CASH_BUDGET = 240000000`,
`petty-cash-config.js:165`) but is **not printed anywhere on the NOR
itself** in either real sample — the NOR reports only its own cycle, never
year-to-date or against-annual-budget framing. This is a real, evidenced
scope boundary: **the NOR is a cycle-level accountability document, not a
budget-performance document** — that framing exists elsewhere in the
platform (Petty Cash analytics), not in this artifact.

### D.7 Governance

- `norNumber` is **user-entered as a bare sequence** ("113", "120") and the
  system composes the rest (`{sequence}/Nota Organisasi/Sarpras/{Roman
  month}/{year}`) from the **NOR date**, never the system clock date
  (confirmed in code and cross-checked against both samples: No.113's
  number uses Roman "V" matching its 18 Mei date; No.120's uses "VI"
  matching its 02 Juni date).
- No auto-numbering/sequence-gap validation exists in code — a human is
  trusted to pick the next correct sequence number. **Not observable from
  two samples alone** whether 113 and 120 are truly sequential organization-
  wide or only sequential within this one department's own count (very
  likely the latter, since the number literally embeds "Sarpras" as a
  department code) — **marked Unknown**, plausible but unconfirmed.
- `Perihal` (subject) is **never freely authored** — it is 100%
  system-derived: `"Realisasi Petty Cash Pertanggal {tanggal} Bidang Sarana
  dan Prasarana"` (`petty-cash-config.js#norAutoSubject`). Both real samples
  match this pattern exactly, down to punctuation. This is the single
  strongest, most confidently-evidenced business rule in this whole report:
  **the subject line of a NOR is not organizational judgment — it is a
  deterministic function of one date.**

### D.8 Dependencies

- A NOR depends on an active Petty Cash cycle and a set of already-recorded,
  status-`available` expenses (locked into `status: 'locked'` the moment
  they are realized into a NOR) — evidenced directly in
  `petty-cash-service.js#generateNor()`. A NOR is therefore always
  *downstream* of routine expense logging, never a standalone document a
  human drafts from scratch.
- A NOR's own lifecycle (`generated → waiting_replenishment → replenished →
  closed`, confirmed in `petty-cash-config.js#NOR_STATUS`) is a real,
  code-enforced state machine — this is institutional workflow already
  captured as *system* knowledge, not yet captured as *organizational
  reasoning* knowledge (why each state matters to a human, what a human
  does at each state) — a concrete candidate for a Knowledge Asset of
  `kind: 'workflow'` (see Knowledge-Asset-Specification.md).

---

## E. Organizational Reasoning

This section is the most honestly limited by available evidence. Two real
filled documents and their generation code can prove **what** the
organization writes and **how** it is structured; they are a much weaker
basis for **why** in any deeper sense than "the float ran low." The
following is what can be soundly reasoned from evidence, followed by an
explicit list of what cannot.

### E.1 Why this NOR exists (evidenced)

Sarpras (Sarana dan Prasarana — Facilities & Infrastructure) runs day-to-day
operations — vehicle fuel/tolls/parking, driver incentives, minor repairs,
IT service, event logistics, medical transport for athletes, and small
procurement — through a small cash float rather than per-transaction
reimbursement requests, evidenced by the sheer volume and triviality of
individual line items (many under Rp 100.000). A NOR is the accountability
mechanism that closes the loop on that float: it converts a month of small,
individually-immaterial cash movements into one auditable, three-signatory,
archived instrument. This is a **control pattern**, not a bureaucratic
formality for its own sake — the same reasoning a petty-cash-box
reconciliation serves in any organization, adapted to PBSI's specific
routing (through the Wakil Ketua Umum III / Sekjen / Bendahara triad).

### E.2 What organizational problem triggered its existence (inferred, not confirmed)

Almost certainly: the float depletes to near-zero at fairly predictable
intervals (again, consistent with a fixed Rp 15.000.000 baseline and the
observed ~99.9% utilization in both samples) and operations cannot continue
without replenishment, so a formal, auditable request-and-approval step
exists to authorize releasing more organizational cash to one department.
**Cannot be confirmed** whether this specific instrument (vs., say, a
simpler internal reimbursement form) exists because of a **specific past
incident** (e.g., a prior control failure that mandated three-signature
approval) — no institutional memory document, meeting minute, or founding
decision record was available to this report. **Marked Unknown, not
guessed.**

### E.3 What decision preceded this document

The evidenced decision chain is: (1) someone decided Sarpras should operate
via a revolving float rather than per-transaction reimbursement (a
governance decision, undocumented here), (2) someone set the float amount
at Rp 15.000.000 (a specific number, presumably sized to roughly a month's
typical spend — both samples' realized amounts, ~14.98M, are strikingly
close to the 15M ceiling, suggesting the float size was calibrated against
actual historical spend rather than picked arbitrarily) (3) the three-role
approval chain (Wakil Ketua Umum III + Sekjen + Bendahara) was decided as
the minimum sign-off for releasing replenishment funds. None of these three
antecedent decisions is documented anywhere this report could find — they
are visible only as their *residue* in the current form, exactly the kind
of "reasoning disappears, only the document remains" problem CLAUDE.md
names as this whole project's reason for existing.

### E.4 Assumptions always true (evidenced)

- The float amount is currently always exactly Rp 15.000.000 at cycle
  start in both samples — but this is a **configured default**
  (`DEFAULT_SETTINGS.openingBalance`), not a value baked into the NOR
  document logic itself; it could change without changing this document's
  structure.
- The requesting department is always Sarana dan Prasarana in every
  observed instance — the template's own boilerplate literally hardcodes
  "bidang sarana dan prasarana" into the prose (not a `{{department}}`
  slot) — confirming, as of this evidence, **this NOR template has only
  ever been used for one department**, and is not yet a generalized
  cross-department instrument despite the platform-level ambition (per
  `docs/V2_ARCHITECTURE_AUDIT_AND_PROPOSAL.md`) of NOR being domain-agnostic
  "Documents" knowledge.

### E.5 Assumptions that depend on context

- Which individual holds each role (all five named signatories) is
  clearly swappable data, not hardcoded identity — evidenced by the
  `DEFAULT_SETTINGS` object being explicitly "Editable via the Settings
  screen."
- The **Terbilang inconsistency**: NOR 113's terbilang text reads
  "Sembilan Belas Ribu Delapan Ratus Sembilan Puluh Satu Rupiah" (nineteen
  **thousand** …) on the ledger's closing recap, but the SAME value
  (Rp 19.891) is spelled "Sembilan Belas Juta …" (nineteen **million** …)
  in the cover-letter's own terbilang line on page 1 of the *same document*
  — a real, evidenced internal inconsistency in the sample itself (not a
  reading error by this report — both strings are transcribed directly from
  the PDF text layer). This is either a one-off human/system error in that
  specific historical instance, or evidence the `terbilangCap()` function
  had a scale-word bug at the time No.113 was generated. **This is exactly
  the kind of fact a Knowledge Platform should capture as evidence with
  low confidence, not silently correct or silently repeat** — flagged here,
  not resolved (resolving it would require reading `petty-cash-config.js#terbilangCap` against the historical app version that generated No.113, which is out of this report's document-reverse-engineering scope).

### E.6 What experienced staff would recognize immediately (inferred from structure, not interviewed)

The near-total (>99%) utilization of the float in both samples, paired with
the request paragraph's confident, boilerplate tone ("kami memohon agar
dana petty cash dapat ditambahkan kembali") suggests replenishment is a
routine, expected, low-friction approval — not a fraught negotiation. An
experienced staff member likely does not read a NOR skeptically line-by-line;
they likely scan the total, the terbilang, and the signature block. This is
a reasonable inference from the document's own confident, unhedged tone,
but it is an inference about *readers*, which no document sample can
directly confirm — **marked as inferred, not evidenced.**

---

## F. Question Discovery

CLAUDE.md and this report's own task brief are explicit that this
category — the tacit questions an experienced staff member asks that never
appear in the document itself — is organizational knowledge, not document
knowledge. **This report cannot honestly produce this list from two PDF
samples and generation code alone.** No interview, no support-ticket
history, no chat log, no annotation trail was available to this session.
Fabricating example questions here (in the way CLAUDE.md's own illustrative
examples — "AC dimana?", "Apakah bisa diperbaiki?", "Vendor sudah kirim
penawaran?" — read as *engineering/maintenance* questions, not petty-cash
questions) would violate this project's own first principle: **never
guess.**

What can be soundly surfaced instead — genuine gaps *in the document*,
observable from structure, that a human reviewer would plausibly need to
ask about because the document itself does not answer them:

1. **Why is the float sized at exactly Rp 15.000.000?** Not answered
   anywhere in either sample or in visible configuration rationale.
2. **What happens when `Sisa Dana` would go negative** (spend exceeds
   float) **before a NOR can be filed?** No evidence either way.
3. **Who verifies the ledger's arithmetic before signing?** No approval
   step in the visible workflow is explicitly a numeric-verification step
   (as distinct from an authorization step).
4. **What is the actual approval SLA** (how long between float depletion
   and a signed, replenished NOR)? Both samples show generation and
   signing on different calendar dates (No.120: document dated 02 Juni,
   handwritten counter-signature dated 03/06) — a real, evidenced 1-day gap
   in this one instance, but not enough data points to generalize a typical
   SLA.
5. **Is there a rule for what counts as a "Sarpras" expense vs. another
   department's** (several line items reference other departments —
   Engineering, Medis, Binpres, Sekretariat, Keuangan, Turnamen — being paid
   *through* the Sarpras float)? This is real, evidenced, and genuinely
   surprising: **the Sarpras petty-cash float in practice subsidizes
   several other departments' small operational costs**, not just its own.
   This is exactly the kind of organizational fact a document mining pass
   surfaces that a naive schema design would miss (see
   Knowledge-Asset-Specification.md §D.3 for how this becomes a first-class
   Knowledge Asset rather than a buried line-item detail).

**This section should be revisited with real staff input** (structured
interview or annotated document review) before any Reasoning/Question-Tree
Knowledge Asset is populated with real content — populating it from this
report alone would mean inventing organizational knowledge that was never
actually observed, which is the one failure mode this whole platform is
designed to prevent.

---

## Unknown Patterns (consolidated)

| # | Pattern | Why unknown | Where it surfaced |
|---|---|---|---|
| 1 | True cadence / whether cycles literally overlap | Only 2 data points, no cycle-record query performed | §D.2 |
| 2 | Whether Raras Ayu Pratama submitting AND approving is policy or incidental | No policy document available | §D.4 |
| 3 | Whether Wakil Bendahara's disbursement is confirmed elsewhere (bank record) rather than on this document | No signature visible at that line in either sample | §D.4 |
| 4 | Whether NOR numbering is organization-wide sequential or Sarpras-only | Only 2 samples, both Sarpras | §D.7 |
| 5 | Why the float is exactly Rp 15.000.000 | No rationale document found | §E.4, §F.1 |
| 6 | Root cause of the Terbilang scale-word inconsistency in No.113 | Would require historical code-version correlation, out of scope | §E.5 |
| 7 | The tacit follow-up questions experienced staff actually ask | Requires human interview, not available this session | §F |
| 8 | Content of "Memo Sarpras 362" and its relationship to "Nota Organisasi Sarpras" (predecessor naming? different instrument?) | Binary `.docx`, unreadable by available tooling this session; dated 18 Sep 2025, earlier than either real NOR sample, and no code reference to "Memo" exists in `js/petty-cash/` | Evidence base note, top of document |

---

## Confidence Analysis

| Section | Confidence | Basis |
|---|---|---|
| A. Document Anatomy | **High** | Directly cross-validated: 2 real PDFs + live-app screenshot + 3 independent renderer source files, all in agreement |
| B. Language Specification | **High** | Boilerplate is byte-identical across both real, independently-generated samples |
| C. Rendering Specification | **High** for PDF/on-screen; **Low** for Excel (code-only, no real .xlsx sample reviewed) |
| D. Business Ontology | **Medium-High** for stakeholders/fields (directly evidenced); **Medium** for workflow sequencing (partially inferred from signature/ink evidence); **Low** for numbering-scope and disbursement-confirmation questions (explicitly flagged Unknown) |
| E. Organizational Reasoning | **Medium** for the control-pattern rationale (a reasonable, evidence-consistent inference); **Low/Unknown** for deeper historical trigger and reader behavior (explicitly not fabricated) |
| F. Question Discovery | **Low by design** — this report deliberately produced document-structural gaps rather than fabricated staff FAQ, and says so |

**Overall**: this specification is suitable as a *foundation* for designing
the Knowledge Asset model (Part 2) — the anatomy, language, and rendering
sections in particular are strongly evidenced and safe to encode as
high-confidence Knowledge Assets. The organizational-reasoning and
question-discovery sections should be treated as **placeholders with
honestly low confidence** until real human input (interviews, a larger
document sample, or annotated corrections) is available — consistent with
CLAUDE.md's Principle 7 ("Never invent business rules") and this project's
explicit instruction to mark what cannot be proven as Unknown.
