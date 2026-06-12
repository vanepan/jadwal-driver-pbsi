# Reimbursement Template Standard

> The current reimbursement template, documented as the **approved production
> baseline**. This is the official reference for any future reimbursement change
> and the **first official implementation** of the
> [Document Design System](DOCUMENT_DESIGN_SYSTEM.md).

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | Approved Baseline |
| **Template** | `FORM REIMBURSEMENT KENDARAAN OPERASIONAL DAN DRIVER` |
| **Template id** | `reimbursement` |
| **Source** | [js/docs/templates/reimbursement.js](js/docs/templates/reimbursement.js) |
| **Logo asset** | [js/docs/templates/reimbursement-logo.js](js/docs/templates/reimbursement-logo.js) (embedded base64, downscaled from [assets/Logo-PBSI.png](assets/Logo-PBSI.png)) |
| **Conforms to** | [DOCUMENT_DESIGN_SYSTEM.md](DOCUMENT_DESIGN_SYSTEM.md) |

This template is a pure presentation layer: it receives a prepared view model and
returns a pdfmake document definition. All domain logic (overtime calculation,
plate lookup, sequential document number, date formatting) lives in
[js/reimbursement.js](js/reimbursement.js).

> **Consistency note (Design System v1 → presentation methods).** The Document
> Design System now explicitly supports chart-first presentation for operational
> *reports*. Reimbursement is an operational *form*, so it correctly continues to
> **prioritise a structured-form layout over charts** — this remains fully
> compliant and is unchanged. Reimbursement stays the **approved baseline
> implementation**; the chart-first approach is demonstrated separately by the
> [Analytics Template Standard](ANALYTICS_TEMPLATE_STANDARD.md).

---

## Layout Overview

A single-page A4 portrait form, top to bottom:

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER   org identity      [PBSI logo]      document metadata  │
│ ───────────────────────────────────────────────────────────── │
│              TITLE  (centered, uppercase)                      │
│              subtitle (centered, dim)                          │
│                                                                │
│ A. Informasi Perjalanan        (4-column key/value grid)      │
│ B. Data Odometer & Status Lembur (2-row grid)                 │
│ C. Pengajuan Reimbursement                                    │
│    ┌───────────────┬──────────────────────────────────────┐  │
│    │ TANDA TANGAN  │ RINCIAN BIAYA (cost table)            │  │
│    │ signature box │  BBM · Tol · Parkir · Lain · TOTAL    │  │
│    └───────────────┴──────────────────────────────────────┘  │
│ D. Lampiran Bukti Pengeluaran                                 │
│    ┌──────────────────────────────────────────────────────┐  │
│    │            (large dashed receipt area)                │  │
│    └──────────────────────────────────────────────────────┘  │
│ ───────────────────────────────────────────────────────────── │
│ FOOTER  doc name / platform version              Hal. X / Y   │
└──────────────────────────────────────────────────────────────┘
```

**Page geometry** (from [js/docs/doc-theme.js](js/docs/doc-theme.js)):
A4 portrait, margins `[48, 37, 48, 31]` pt (17 mm L/R · 13 mm top · 11 mm bottom),
content width `499` pt, usable content height `773.89` pt.

---

## Header

Implements the mandatory three-column header from the Design System.

### Left — organisational identity
- `Bidang Sarana dan Prasarana` (bold, 11 pt)
- `PBSI — Persatuan Bulu Tangkis Seluruh Indonesia` (dim, 7.5 pt)

### Center — PBSI logo
- Official PBSI asset, embedded as base64 so pdfmake renders it deterministically with no network fetch.
- **Proportional size:** displayed at `31` pt wide → ≈ `34` pt tall (source 180 × 197 px). Sized by width so it never dominates.
- **Slightly elevated vertically** (`margin-top: -4 pt`) so it aligns with the first identity line, not the block centre.
- **Centered between identity and metadata** — the left and right columns are equal-width (`*`), so the fixed-width logo sits in the middle.

### Right — metadata (right-aligned)
- `No. Dokumen: {docNumber}`
- `Referensi: {assignmentRef}`
- `Tanggal Cetak: {printDate}`

A heavy `1.5` pt rule closes the header.

---

## Title

| | |
|---|---|
| **Title** | `FORM REIMBURSEMENT KENDARAAN OPERASIONAL DAN DRIVER` (13 pt, bold, centered, uppercase) |
| **Subtitle** | `Formulir Pengajuan Penggantian Biaya Operasional Kendaraan` (8 pt, dim, centered) |

---

## Section A — Informasi Perjalanan

**Purpose:** operational trip information.

**Layout:** a 4-column key/value grid (`[80, *, 80, *]`) — label / value / label / value.

**Fields:**

| | | | |
|---|---|---|---|
| Nama Driver | _value_ | PIC / Requester | _value_ |
| Keperluan | _value (spans, with optional destination)_ | | |
| Tanggal | _value_ | Unit Kendaraan | _value_ |
| Jam Berangkat | _value (+ "Penuh Hari")_ | Nomor Polisi | _value_ |
| Jam Kembali | _value_ | Jumlah Penumpang | _N pax_ |

Rendered with the dense minimalist table layout (hairline borders, 2 pt vertical cell padding).

---

## Section B — Data Odometer & Status Lembur

**Purpose:** distance accounting and overtime status.

**Layout:** a compact 2-row, 4-column grid.

| | | | |
|---|---|---|---|
| KM Awal | _value_ | KM Akhir | _value_ |
| Total Jarak | _value_ | Status Lembur | **{label}** + description |

**Status presentation:** the overtime status is the only place accent color is
used in the body — **red** (`--accent`) when overtime, **green** (`#2F7D62`) when
normal — with a small dim descriptive line beneath. Grayscale-safe (the label text
carries the meaning, not the color alone).

---

## Section C — Pengajuan Reimbursement

A two-column layout rendered as a **single bordered table row** so both columns
share the same height.

### Left — Driver Signature Area
Contains, top to bottom:
- `TANDA TANGAN` (caption)
- signing space (empty room to sign)
- signature line
- **Driver name**
- `Driver Operasional` label

Intentional design decisions:
- **Driver declaration paragraph was intentionally removed** — the long "Dengan ini saya menyatakan…" statement is gone.
- **"Jakarta, [date]" text was intentionally removed.**
- **The signature area remains** for operational validation/authorisation.

### Right — Rincian Biaya (cost table)
A minimalist cost breakdown:
- BBM / Bensin
- Tol
- Parkir
- Lain-lain
- **TOTAL** (subtle fill)

The amount column is left blank for manual or downstream entry.

### Visual alignment requirement
> **The signature area and the cost table must maintain a balanced visual
> height** — both columns align at the **top** and at the **bottom**.

This is achieved structurally by rendering Section C as one table row (both cells
take the shared row height). The empty signing space is tuned so the signature
cluster (line · name · role) sits roughly centered while the cost table still
governs the row height — so there is never an empty gap beneath `TOTAL`.

---

## Section D — Lampiran Bukti Pengeluaran

**Purpose:** the receipt attachment area.

**Rules:**
- **The largest visual area in the document.**
- **Dashed border** (rounded rectangle).
- **Centered placeholder text:** `Lampirkan Bukti Pengeluaran di Area Ini`.
- Dedicated to operational receipts (fuel, toll, parking).

**Rationale:** for a reimbursement form, the **physical receipt evidence is more
important than explanatory text** — so the layout maximises this area and removes
narrative prose elsewhere (see Section C).

---

## Footer

Implements the mandatory Design System footer.

### Left (two lines)
- **Line 1:** `Form Reimbursement Kendaraan Operasional dan Driver`
- **Line 2:** `PBSI Operations Platform v{APP_VERSION}`

### Right
- `Hal. X / Y`

Rendered at 6.5 pt in faint neutral type, in the bottom page margin.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **Centered PBSI logo** | Reinforces institutional identity at the optical centre of the header while staying small enough not to dominate; balances the left identity block and right metadata block. |
| **Removed declaration paragraph** | The long legal-style statement consumed vertical space and added little operational value; removing it frees room for the receipt evidence and produces a cleaner signature box. |
| **Retained signature area** | A physical signature is still operationally required to authorise the reimbursement, so the box stays — just without the surrounding prose. |
| **Enlarged receipt area** | Receipt evidence is the document's real payload; Section D is deliberately the largest region on the page. |
| **Minimalist table design** | Hairline borders and restrained fills keep the form executive-friendly and grayscale-safe, per the Design System color policy. |
| **Single-page philosophy** | The form must be one A4 page for filing, scanning, and printing consistency; every spacing decision is measured against that hard constraint. |

See the [Rationale Behind Current Layout](#rationale-behind-current-layout)
section for the measured reasoning.

---

## Known Constraints

These are **measured** limitations (validated by rendering the production pdfmake
pipeline headlessly and counting pages), not estimates.

- **Single-page A4 requirement.** Usable content height is `773.89` pt. With
  worst-case field values (long purpose + destination + driver + requester), the
  largest the receipt area can be while everything stays on one page is the
  measured **threshold of `356` pt**; beyond that the document spills to page 2.
- **Receipt area is set to `346` pt** (≈ 45% of usable height) — the measured
  maximum minus a 10 pt safety buffer for unusually long field values.
- **A literal "50% of page height" (~387 pt) receipt area is not achievable**
  single-page while Sections A, B, and the full cost table are present.
- **Density was optimised, not redesigned.** Section margins, table cell padding
  (3→2 pt), bordered-box padding (6→4 pt) and the signing gap were tightened to
  reclaim ≈ 58 pt of vertical space, all of which was allocated to Section D.
- **The header and footer are currently implemented inline** in the template,
  because the shared `docHeader` does not support a center logo and `docFooter`
  is single-line. A future refactor should extract a logo-capable
  `document-header.js` and a two-line `document-footer.js` shared component (see
  [DOCUMENT_DESIGN_SYSTEM.md › Shared Components](DOCUMENT_DESIGN_SYSTEM.md#shared-components))
  so this template can inherit them instead of redefining them.

### Why the current layout was chosen
The form balances three competing goals: (1) **single-page** for filing and print
consistency, (2) a **large receipt area** because receipts are the real evidence,
and (3) **complete operational data** (Sections A–C). The current layout is the
measured optimum across those three — maximum receipt area without sacrificing any
data field or spilling to a second page.

---

## Modification Policy

### Allowed (no formal review)
- Field additions
- Field removals
- Table refinements
- Receipt area tuning (within the measured single-page threshold)

### Requires review
- Header redesign
- Footer redesign
- Logo relocation
- Multi-page conversion
- Removal of the signature area

> Any change in the "requires review" list affects either the institutional
> branding mandated by the [Document Design System](DOCUMENT_DESIGN_SYSTEM.md) or
> the single-page guarantee, and must be evaluated against both before being
> approved.

---

## Rationale Behind Current Layout

The reimbursement form is the **first document built on the Document Generation
Foundation**, and its layout was derived empirically rather than by guesswork:

1. **Branding first.** The standard three-column header (identity · logo ·
   metadata) was adopted so the form is unmistakably a PBSI Sarpras document — and
   so that every future report can reuse the same header.
2. **Evidence over prose.** A reimbursement is approved on the strength of its
   receipts. The declaration paragraph and the "Jakarta, [date]" line were removed
   to make room, and Section D was enlarged to be the dominant region.
3. **Validation preserved.** The signature block stays, because a human
   authorisation mark is still required — but it was simplified into a clean,
   balanced signature box that matches the cost table's height.
4. **Single page, measured.** Rather than assume what fits, the receipt height was
   tuned against the real pdfmake output: the page-break threshold was measured at
   `356` pt under worst-case data, and the receipt area was set to `346` pt to keep
   a safe single-page margin.
5. **Density, not redesign.** When more receipt space was wanted, the structure was
   kept and only whitespace/padding was compressed — reclaiming ≈ 58 pt and giving
   all of it to the receipt area, without touching the document engine.

This makes Reimbursement the reference implementation: future Audit, Asset,
Engineering, and AI report templates should inherit its header, footer, and visual
language while defining their own internal bodies, exactly as described in the
[Document Design System](DOCUMENT_DESIGN_SYSTEM.md#future-guidance).

---

## Related Documents

- [DOCUMENT_DESIGN_SYSTEM.md](DOCUMENT_DESIGN_SYSTEM.md) — the global design system
  this template implements.
- [ANALYTICS_TEMPLATE_STANDARD.md](ANALYTICS_TEMPLATE_STANDARD.md) — the second
  official implementation (chart-first operational report), a sibling baseline.
