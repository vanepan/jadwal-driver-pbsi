# Sarpras Intelligence V2 — Phase 9, Sprint 9.2: Evidence Onboarding

> Scope: catalog real evidence per the NOR Onboarding Playbook. No Knowledge
> authored yet (that is Sprint 9.3). Method: direct reading of 13 real,
> filled Nota Organisasi PDFs the repository owner provided, cross-checked
> against the Sprint 9.1 NOR Type decisions
> (`docs/SPRINT_9_1_ORGANIZATIONAL_DECISION.md`) and the existing evidence
> base (`docs/CORE_NOR_KNOWLEDGE_PACK.md`, `docs/NOR-Specification.md`).

---

## Headline finding

**Two of Sprint 9.1's decided-but-unevidenced NOR Types now clear the
"2+ independent real documents" production-readiness bar** — Perjalanan
Dinas (2 documents) and Pengadaan (4 documents). One real, cross-cutting
fact resolves a question the Petty Cash evidence base left open for two
iterations: **the NOR numbering sequence (`No.XXX/Nota Organisasi/Sarpras/
{bulan romawi}/{tahun}`) is shared across every NOR subject matter from
this department, not scoped per NOR Type** — proven by the same
monotonically-increasing counter (005 → 029 → 032 → 054 → 055 → 056 → 068
→ 075 → 077 → 084 → 085 → 089 → 103) running across payroll, leave,
procurement, and travel documents alike, Jan–Apr 2026.

**A second finding this document does not resolve on its own:** 5 of the
13 documents (payroll/allowance payments, a leave notification) describe
real, recurring NOR usage that matches **none** of the four currently
registered/candidate NOR Types. This is a genuine organizational-decision
question, not an evidence gap — see §5.

---

## 1. Evidence Inventory

All 13 documents are real, signed, PBSI Sarpras "Nota Organisasi," Jan–Apr
2026, obtained directly from the repository owner (no upload/OCR pipeline
involved — hand-provided, per this platform's own by-design boundary).

| # | Date | Perihal | Best-fit NOR Type |
|---|---|---|---|
| 005 | 5 Jan 2026 | Pencetakan Billboard Galeri Pemenang PBSI 2024 | **Pengadaan** |
| 029 | 27 Jan 2026 | Pembelian Kebutuhan Engineering (Feb 2026) | **Pengadaan** |
| 032 | 29 Jan 2026 | Pembelian Kebutuhan Peralatan Cleaning Service | **Pengadaan** |
| 054 | 26 Feb 2026 | Penerbitan Surat Tugas & Surat Pemberitahuan (Survei Sirnas) | Administration (candidate fit — see §5) |
| 055 | 26 Feb 2026 | Biaya Perjalanan Dinas (BPD) — Survei Sirnas A Kudus/B Medan/B Bengkulu | **Perjalanan Dinas** |
| 056 | 26 Feb 2026 | Pembayaran Upah Prorata (karyawan pensiun) | Unmapped — see §5 |
| 068 | 10 Mar 2026 | Pembayaran THR Laundry Harian | Unmapped — see §5 |
| 075 | 13 Mar 2026 | Informasi Pengajuan Cuti Lebaran (Tim Sarpras) | Unmapped — see §5 |
| 077 | 25 Mar 2026 | Biaya Perjalanan Dinas (BPD) — Survei Sirnas B Bali | **Perjalanan Dinas** |
| 084 | 7 Apr 2026 | Pembayaran Lembur (Feb 2026) | Unmapped — see §5 |
| 085 | 7 Apr 2026 | Pembayaran Lembur (Mar 2026) | Unmapped — see §5 |
| 089 | 15 Apr 2026 | Pembelian Kebutuhan Engineering Tambahan (Apr 2026) | **Pengadaan** |
| 103 | 28 Apr 2026 | Pembuatan Surat Booking Venue (Indonesia Open 2027) | Administration (candidate fit — see §5) |

**Realisasi Petty Cash and Reimbursement:** zero of these 13 documents
concern either — no new evidence, no change to their existing status.

---

## 2. Evidence Quality Report, per NOR Type

### Pengadaan — 4 real, independent documents (005, 029, 032, 089)

**Meets the 2+ document production-readiness bar. Highest-quality evidence
of the three candidates.**

Consistent, real structure across all 4, byte-identical in shape:
- **Requester:** Kabid (or Plt. Kabid) Sarana dan Prasarana, addressed to
  Wakil Ketua Umum III / Sekretaris Jenderal / **Kabid Pengadaan** /
  Bendahara.
- **Itemized attachment**, consistent columns across all 4: Nama Item,
  Harga Satuan, Permintaan (qty), Satuan (unit), Total Harga — prepared by
  "Staf Sarana dan Prasarana" (Grace Widelia, all 4), approved by Kabid/Plt.
  Kabid Sarpras.
- **Real price documentation attached** in 2 of 4 (029, 089) —
  screenshots of the actual Tokopedia listings used to justify each unit
  price. This is a genuinely new evidence category — Petty Cash's evidence
  base has no equivalent "how was this price justified" artifact.
- **Approval chain, consistent across all 4:** Diajukan oleh (Kabid/Plt.
  Kabid Sarpras) → Mengetahui dan Menyetujui (Wakil Ketua Umum III) →
  Mengetahui/Menyetujui (Sekretaris Jenderal) → **Diadakan oleh (Kabid
  Pengadaan, Yenny Agustine — identical name, all 4)** → Dibayarkan oleh
  (Wakil Bendahara, Eddy Prayitno — identical name, all 4). Kabid Pengadaan
  is a real, evidenced **approval-chain participant** (procures/confirms
  the purchase), not merely a department name as Phase 8.5 could only
  confirm before.
- **089 additionally evidences a running-total convention**: it states the
  cumulative FY budget spent on Engineering purchases to date, a real
  business-rule candidate ("each Pengadaan NOR references the running
  period total, not just this occasion's amount").

Registered field schema today (`item`/`quantity`/`purpose`/`budget`) is
**not what the real evidence shows** — real Pengadaan NORs carry a full
itemized list (multiple items, unit price, quantity, line total) with no
single "purpose" field, and no per-occasion "budget" ceiling field at all
(instead: an informational running-total). This is flagged for a Sprint
9.3 authoring decision, not silently changed here.

### Perjalanan Dinas — 2 real, independent documents (055, 077)

**Meets the 2+ document bar, exactly at the minimum.**

Consistent structure:
- **Both** are titled "Pengajuan Biaya Perjalanan Dinas (BPD)" — real
  vocabulary, not "Perjalanan Dinas" bare (worth noting: the registered
  NOR Type label may not be the real Perihal wording used).
  - **Wait** — this NOR's own Perihal wording pattern should be verified
    against a real render before authoring `pattern.perihal-subject-line`
    for this type (mirrors exactly how Petty Cash's was captured verbatim).
- **Both** concern the same real event class: a Sarpras staff member (both
  name **Nanang Saepulloh/Saefulloh — identical person, both documents,
  spelling itself inconsistent even within the same organization**)
  traveling to survey a Sirnas tournament venue ahead of the event.
- **Both** carry an identical itemized cost table: Tiket Pesawat, Hotel,
  Uang Saku, Uang Makan, Transport Lokal — with 055 repeating this table
  once per destination (3 destinations, 3 sub-totals, 1 grand total) and
  077 carrying it once (1 destination). This is real, evidenced structure
  for a **multi-destination** trip request, not hypothesized.
- **Approval chain, consistent across both:** Diajukan oleh (Kabid
  Sarpras) → Wakil Ketua Umum III → Sekretaris Jenderal → Wakil Bendahara.
  No Kabid Pengadaan involvement (correctly — this is travel cost, not a
  goods purchase).
- **Rincian preparer, consistent across both:** "Staf Sarana dan Prasarana"
  Grace Widelia signs the cost breakdown; Kabid Sarpras (Monika Yunita, in
  both) signs approval of the breakdown itself, separate from her signature
  on the NOR cover page.

Registered field schema today (`destination`/`traveler`/`departureDate`/
`returnDate`/`budget`) is **directionally right but incomplete** — real
evidence shows the actual per-occasion facts are: traveler name, one-or-more
destinations each with its own date range, and a real cost breakdown by
category (not one lump budget figure). Flagged for Sprint 9.3.

### Administration — 2 candidate documents (054, 103), fit unconfirmed

The currently registered Administration NOR Type (Sprint 9.1 Decision 3)
carries **no field schema** and was originally hypothesized (Phase 10.5)
from a single example: "Atlet kehilangan ID Card" — a lost-item report.
**Neither 054 nor 103 is a lost-item report.** Both are instead requests
for the **Sekretariat to issue a different, separate piece of formal
correspondence** on Sarpras's behalf:
- 054: requests issuance of a Surat Tugas (assignment letter) + Surat
  Pemberitahuan (notification letter) for a survey trip.
- 103: requests issuance of a Surat Booking Venue for a tournament.

Both share: no money changes hands (no Bendahara in the approval chain),
the "output" of the request is itself another document, and the audience
is narrower (Wakil Ketua Umum III + Sekretaris Jenderal only, no Kabid
Pengadaan, no Bendahara). This is a **real, consistent, evidenced pattern**
— but it is a different pattern than the one Administration was originally
named for. **Whether this correspondence-issuance pattern IS what
"Administration" should mean, or is a distinct third thing, is an
organizational decision — see §5, not decided here.**

### Realisasi Petty Cash — unchanged (0 new documents)

No new evidence. Existing 54-fact Knowledge Pack (Iteration 2) stands as-is.

### Reimbursement — N/A (excluded, Sprint 9.1 Decision 1)

No new evidence would change this; Reimbursement is not a NOR Type.

---

## 3. Repository Coverage — updated

| NOR Type | Phase 8.5 status | Post-Sprint-9.2 status |
|---|---|---|
| Realisasi Petty Cash | Evidenced (2 docs, 54 facts) | Unchanged |
| Perjalanan Dinas | 0 documents | **2 documents — clears production bar** |
| Pengadaan | 0 documents (only a confirmed role name) | **4 documents — clears production bar, highest-quality evidence of the three** |
| Administration | 0 documents (registered Sprint 9.1, empty schema) | 2 documents, but **pattern-fit unconfirmed** (see §5) |
| Reimbursement | Excluded (Sprint 9.1 Decision 1) | N/A |

---

## 4. Cross-Cutting Generic Findings (apply to every NOR Type, not one)

These resolve or refine existing Generic Knowledge, evidenced across all
13 documents regardless of subject matter:

1. **Numbering scope, resolved.** `rule.numbering-format`'s "/Sarpras/"
   component was flagged in `CORE_NOR_KNOWLEDGE_PACK.md` §2 as
   "Level 2 (department-scoped), not proven Generic." It is now **proven
   Generic-to-the-department-across-types**: the same sequential counter
   (005…029…032…054…055…056…068…075…077…084…089…103) runs across payroll,
   leave, procurement, and travel documents alike — one Sarpras-wide
   sequence, never per-NOR-Type. This closes one of Petty Cash's own 12
   logged open questions ("numbering scope: organization-wide vs.
   department-only" → **answer: department-wide, cross-type**).
2. **One real numbering anomaly, flagged not silently corrected.** NOR 077
   is dated 25 Maret 2026 but numbered `.../II/2026` (February) — every
   other document's roman-numeral month matches its date exactly. This is
   either a clerical error in the real document or evidence that numbering
   is assigned at drafting time, not signing time. Not resolved here —
   flagged as an open question for whoever can ask the real preparer.
3. **A second closing-sentence variant found.** 12 of 13 documents close
   with "Demikian nota organisasi ini disampaikan..." (matches the
   existing Generic `sentence_pattern`). NOR 084 closes with "Demikian
   **Memorandum** ini disampaikan..." despite its own header reading
   "NOTA ORGANISASI" — a real, evidenced internal inconsistency in how
   this platform's own source documents refer to themselves. Not
   corrected; recorded as a real observed variant, exactly as this
   platform's own discipline requires (an inconsistency IS the evidence).
4. **A real personnel transition, evidenced.** Kabid Sarana dan Prasarana
   is Monika Yunita in every document dated Jan–Mar 2026 (005, 029, 032,
   054, 055, 056, 068, 075, 077); every document from Apr 2026 onward
   (084, 085, 089, 103) instead shows **Plt. (Acting) Kabid Sarana dan
   Prasarana Raras Ayu Pratama**. This matches the existing evidence
   base's own caveat (`NOR_ONBOARDING_PLAYBOOK.md`'s evidence checklist:
   "the CURRENT NAME may need independent confirmation, since people
   change roles") — not assumed, directly observed from the dated
   evidence itself. Other signatories are stable across all 13 documents:
   Wakil Ketua Umum III = Armand Darmadji; Sekretaris Jenderal = Ricky
   Soebagdja; Wakil Bendahara = Eddy Prayitno; Kabid Pengadaan = Yenny
   Agustine; the Sarpras staff preparer of supporting schedules = Grace
   Widelia (7 of 13 documents).

---

## 5. Open Decisions — needed before Sprint 9.3 authoring

Per Sprint 9.1's own rule ("Engineering must not make organizational
decisions") and this sprint's, these are evidence findings, not verdicts:

**Decision A — does the correspondence-issuance pattern (054, 103) count
as "Administration"?** The registered Administration NOR Type has no
schema yet specifically so a human could decide this once real evidence
arrived. Two readings are equally consistent with the evidence:
- Same type: Administration = "an internal request whose output is
  another document/action, not money or goods" — 054/103 fit this framing
  fine, and the original "lost ID card" example fits too (it's also a
  request that produces a downstream administrative action, no money).
- Different type: the "lost ID card" hypothesis and the
  "request-Sekretariat-to-issue-a-letter" pattern may be different enough
  organizational processes to deserve separate NOR Types.

**Decision B — should the payroll/allowance/leave pattern (056, 068, 075,
084, 085 — 5 real documents, the single largest unmapped cluster) become
its own registered NOR Type?** This is real, recurring, evidenced NOR
usage with no home in the current registry at all. It splits into two
sub-patterns on the evidence itself:
- Payment requests (056 prorated salary, 068 THR, 084/085 monthly
  overtime) — 4 documents, consistent structure (amount, terbilang,
  Bendahara in the approval chain).
- A leave notification (075) — 1 document, structurally different (no
  money, no Bendahara, a schedule table instead).

Sprint 9.3 (Knowledge Authoring) cannot proceed for Administration,
payroll/allowance, or leave until these are decided. **Sprint 9.3 CAN
proceed immediately for Perjalanan Dinas and Pengadaan** — both are
already-decided NOR Types (Sprint 9.1) now carrying real, evidenced,
above-the-production-bar documentation, with no open framing question
blocking authoring.
