# Sprint 7D — Analytics Governance & UX Polish (v1.10.4)

Two changes, no analytics math touched (parity/trend/insights/recommendations harnesses all green).

## Part 1 — Export PDF is a utility action, not a banner
The production app carried **two** export surfaces: a compact header button **and** a full-width
§06 "Export Center" section (description + three large `.btn` tiles). The section read as a
banner/strip — the thing Sprint 7D Part 1 calls out.

- **Removed** the §06 Export Center section entirely (`renderExportCenter` call + its markup in
  `refreshAnalyticsDisplay()`, the import, and the section's eyebrow block). Analytics is now 5
  sections; Export is no longer a "purpose" slot.
- **Kept + polished** the single Export PDF control as a quiet utility button in the filter/action
  row: `[ Rentang ] [ Driver ] [ Kendaraan ] [ Bidang ] [ Reset ] [ Export PDF ]`
  (`#v2AnalyticsExportPdf`, `.btn-reimbursement`). Added an inline download icon (icon + label),
  width-fits-content, semantic surface/border/text tokens → distinct in light vs dark, no gradient,
  no full-width. Handler unchanged (`exportAnalyticsReport()`).

## Part 2 — Assignment Review (the Analytics Governance Layer's first UI)
Data Quality Center previously governed only **names** (duplicate detection, alias management,
destination review). Test/demo records made with *real* users/bidang/destinations slip through
user/destination filtering, so governance has to be **record-level**.

- **Two entry points** in the DQ actions row: `[ Tinjau Tujuan ]` and the new `[ Tinjau Assignment ]`.
- **Assignment Review modal** (`#modalAsgReview`, mirrors the destination-review pattern): a compact
  governance table — **ID · Tanggal · Driver · Kendaraan · Bidang · Tujuan · Status · Klasifikasi ·
  Tata Kelola** — filterable by **Date Range / Driver / Kendaraan / Bidang** and by eligibility
  (Semua / Disertakan / Dikecualikan), plus an ID/destination search. Bidang is resolved exactly as
  the engine does (assignment → `requestId` → `request.requesterName`).
- **Four record-level actions:** Tandai Data **Produksi** · Tandai Data **Uji** · **Keluarkan** Dari
  Analytics · **Pulihkan** Ke Analytics. Each writes an audited
  `assignment.governance = { classification, analyticsEligible, classifiedBy, classifiedAt }` block
  via the existing surgical single-record path (`saveAssignments` + `saveOneAssignment`) and logs
  `assignment_classified`.

### Why this needs no engine change
The governance gate shipped in **Sprint 0**: `analytics-engine.js` already calls
`filterEligible(ctx.assignments)` at its boundary, and `isAnalyticsEligible()` treats **absence of a
governance block as production**. Sprint 7D is the *write* side — the moment a record is marked
test/excluded it drops out of KPIs, Trends, Insights, Recommendations, Health Score, and Export, yet
stays in the database, visible and editable operationally. Fully reversible (Pulihkan).

## Data model (unchanged from GOVERNANCE_RECOMMENDATION.md)
```
assignment.governance = {
  classification: 'production' | 'testing' | 'training' | 'demo',
  analyticsEligible: boolean,
  classifiedBy, classifiedAt        // provenance/audit
}
isAnalyticsEligible = governance == null            // legacy ⇒ production
  || (analyticsEligible !== false && classification === 'production')
```

## Files
- `js/app.js` — header Export PDF icon; §06 Export Center removed (markup + `exportContent` +
  `renderExportCenter` import); `classificationOf` import; `assignment-review` delegated action +
  `initAssignmentReviewModal()`; the Assignment Review module (`_setAssignmentGovernance`,
  `initAssignmentReviewModal`, `_populateAsgReviewFilters`, `openAssignmentReviewModal`,
  `_renderAssignmentReviewList`, helpers); DQ actions row → two buttons.
- `platform.css` — `.v2-asg-review-*` modal/table/chip/action styles (global tokens, light+dark,
  responsive); `.v2-dq-actions-row` now wraps.
- `js/config.js` → v1.10.4 (+ `service-worker.js` / `version.json` via `sync-version.mjs`).

## Verification
- `node scripts/sync-version.mjs` · `node --check js/app.js` · `node --check js/config.js` ·
  `node --check --input-type=module < js/analytics/analytics-shell.js` — PASS.
- `node Analytics-V2/parity-check.mjs · trend-check.mjs · insights-check.mjs ·
  recommendations-check.mjs` — all PASS (analytics values unchanged).
- Manual (Admin → Analytics): Export PDF reads as a small filter-row utility (light + dark), no
  banner; Data Quality Center shows Tinjau Tujuan + Tinjau Assignment; the review table filters,
  classifies, and excludes/restores records; an excluded record disappears from KPIs/trends/health
  on the live screen but remains in the table and operationally.

---

# Sprint 7D follow-up — Export hub restore + Request governance (v1.10.5)

Corrects two misreads of the original brief and extends governance to the second record kind.

## Part 1 — Export PDF stays a compact utility button
`#v2AnalyticsExportPdf` (`.btn-reimbursement`) keeps its place at the end of the filter/action row
(`Rentang · Driver · Kendaraan · Bidang · Reset · Export PDF`) — content-width, icon + label,
semantic tokens, no full-width strip. (The toolbar is `flex; flex-wrap` with no grow on the button.)

## Part 2 — Export Center restored as the reporting hub (not a banner)
The §06 section is **back**, but redesigned: `renderExportCenter` now emits a calm, secondary,
future-ready **format list** (`.an-export-list` → `.an-export-item` rows: icon · name + one-line sub ·
right-aligned control). **Laporan PDF** carries an "Unduh PDF" action (`data-action="export-pdf"`,
same `exportAnalyticsReport()` path as the header button); **Excel** / **Cetak** are calm "Segera
hadir" chips. No gradients, no large surfaces — it does not compete with the keynote hero. The old
`.an-export-row` / `.an-export-btn` / scoped `.btn`/`.btn-primary` styles were removed (no other
in-scope consumer).

## Part 3 — Governance also covers `driver_requests`
- **Engine:** `computeAnalyticsModel` now routes **both** kinds through the gate —
  `const requests = filterEligible(ctx.requests)` next to the existing
  `const assignments = filterEligible(ctx.assignments)`. Identity for ungoverned data ⇒ parity holds.
- **Data Quality Center:** third entry `[ Tinjau Request ]` (after Tinjau Tujuan / Tinjau Assignment).
- **Request Review modal** (`#modalReqReview`, reuses the `.v2-asg-review-*` styles): columns
  **ID · Tanggal · Pemohon · Bidang · Driver · Kendaraan · Tujuan · Status**; filters Date Range /
  Driver / Kendaraan / Bidang / **Status** / eligibility; search over ID / destination(`purpose`) /
  requester. Destination falls back `r.destination || r.purpose`; date uses the engine's `_reqDate`
  rule (`startDate || createdAt[:10]`).
- **Same four actions** write `request.governance` via `_setRequestGovernance` → `saveRequests`
  (the established whole-collection request write) + `request_classified` audit log.

### Files (follow-up)
- `js/analytics/analytics-engine.js` — `filterEligible(ctx.requests)`.
- `js/analytics/analytics-shell.js` — `renderExportCenter` redesigned to the hub list.
- `js/app.js` — header button kept; Export Center section + `exportContent` re-added; DQ third
  button + `request-review` action + `initRequestReviewModal`; the Request Review module
  (`_setRequestGovernance`, modal init/open/populate/render, `_REQ_STATUS_META`, helpers).
- `platform.css` — `.an-export-list`/`.an-export-item`/`.an-export-go`/`.an-export-chip` (replacing
  the old button-strip styles); request modal reuses the assignment-review styles.
- `js/config.js` → v1.10.5 (+ `service-worker.js` / `version.json`).

### Verification (follow-up)
- `node --check` app/config + `--input-type=module` shell/engine — PASS.
- All four harnesses (parity/trend/insights/recommendations) — PASS (request gate is identity for
  ungoverned fixtures ⇒ no value change).
- Manual: Export PDF compact in the row; Export Center is a quiet 3-row hub (PDF live, Excel/Cetak
  "Segera hadir"); Tinjau Request lists driver_requests, classifies/excludes/restores them, and an
  excluded request drops out of bidang analytics on the live screen while staying in the table.

---

# Sprint 7D polish — Export PDF width fix + compact Request Review (v1.10.6)

## Export PDF was actually full-width (root cause)
The toolbar button used `.btn-reimbursement`, whose **base rule in `style.css` sets
`width: 100%; text-align:left`** (it's the reimbursement print button). The Claude-scope override
restyled colors but never reset width, so the button stretched onto its own full-width row. Fixed by
switching the button to the existing purpose-built **`.v2-analytics-export-btn`**
(`width:auto; max-width:max-content; display:inline-flex; flex:0 0 auto`) — content-width, inline
beside Reset Filter. The dead scoped `.btn-reimbursement` override was replaced with a scoped tweak
for `.v2-analytics-export-btn`.

## Request Review: compact, no horizontal scroll
Redesigned from a 10-column "database viewer" into an **operational review** that fits the viewport:
- **Primary columns only:** Tanggal · Bidang · Tujuan · Status · Klasifikasi · Tata Kelola.
- **Secondary fields** (Request ID · Pemohon · Driver · Kendaraan) move into an **expandable per-row
  detail panel** — a chevron toggle reveals a labelled detail grid (`data-req-toggle` /
  `tr[data-detail-for]`, `hidden` toggled in the existing delegated listener).
- Narrower modal (`.v2-req-review-modal-box`, 880px), tightened cell padding + column max-widths with
  ellipsis, compact action buttons. `overflow-x:auto` remains only as a small-screen safety net.

(Assignment Review keeps its wider table for now — only Request Review was flagged.)
