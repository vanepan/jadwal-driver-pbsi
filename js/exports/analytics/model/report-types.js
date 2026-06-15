/* ============================================================
   REPORT-TYPES.JS — ReportModel typedefs (Phase B: Driver subset)

   The platform is vanilla JS (no TypeScript), so the Analytics
   Export contract is expressed as JSDoc typedefs — matching
   js/analytics/analytics-types.js. The ReportModel is the
   serializable projection the CLIENT builds from the AnalyticsModel
   and ships to the render Cloud Function; the SERVER components
   consume it as plain data (no analytics logic crosses the wire).

   Phase B defines only what the Driver report needs. Vehicle /
   Bidang / Complete fields are added in their phases.
   ============================================================ */

'use strict';

/**
 * @typedef {Object} ReportMeta
 * @property {string} org                 - "Bidang Sarana dan Prasarana"
 * @property {string} orgSub
 * @property {string} title               - "Laporan Analitik Pengemudi"
 * @property {string} periodLabel         - "30 Hari Terakhir"
 * @property {string} dateLabel           - "15 Juni 2026"
 * @property {string} filterLine          - "Filter: Semua Pengemudi · …"
 * @property {string} versionLine         - "v1.11.3.3 · Evan · 15 Jun 2026"
 * @property {string} contributorsLabel   - "Kontributor Utama"
 */

/**
 * @typedef {Object} HeroMetric
 * @property {string} value   - pre-formatted, tabular ("100" | "1.342")
 * @property {string} [unit]  - "%" | "km"
 * @property {string} label   - "Tingkat Selesai"
 */

/**
 * @typedef {Object} MetricCell
 * @property {string} value
 * @property {string} [unit]
 * @property {string} label
 */

/**
 * @typedef {Object} DistributionRow
 * @property {string} name
 * @property {number} fillPct         - 0–100, bar width (count / maxCount)
 * @property {string} shareLabel      - "42%"  (count / total)
 * @property {string} secondaryLabel  - "581 km" | "—"
 */

/**
 * @typedef {Object} Distribution
 * @property {string} label           - "Distribusi Beban"
 * @property {DistributionRow[]} rows
 * @property {string} [note]          - "Rata-rata beban: 8,7 …"
 */

/**
 * @typedef {Object} Highlight
 * @property {string} category        - "Efisiensi" | "Distribusi" | "Jarak" | …
 * @property {'good'|'attention'|'neutral'} tone
 * @property {string} statement
 * @property {string} [context]
 */

/**
 * @typedef {Object} Contributor
 * @property {string} name
 * @property {string} role
 */

/**
 * The Driver Analytics report projection.
 * @typedef {Object} DriverReportModel
 * @property {ReportMeta} meta
 * @property {HeroMetric} hero
 * @property {MetricCell[]} kpis
 * @property {Distribution} distribution
 * @property {Highlight[]} highlights
 * @property {Contributor[]} contributors
 */

/**
 * The Vehicle Analytics report projection. Structurally identical to
 * DriverReportModel (same components render it) — the hero is total
 * distance, the distribution is fleet utilisation, and the footer
 * filter line is vehicle-first.
 * @typedef {Object} VehicleReportModel
 * @property {ReportMeta} meta
 * @property {HeroMetric} hero
 * @property {MetricCell[]} kpis
 * @property {Distribution} distribution
 * @property {Highlight[]} highlights
 * @property {Contributor[]} contributors
 */

/**
 * One bidang's fulfilment status row (Zone C, BidangStatusStrip).
 * @typedef {Object} BidangStatusItem
 * @property {string} name                       - "Bidang Turnamen"
 * @property {string} detail                     - "1 permintaan · 1 penugasan · 87 km"
 * @property {'fulfilled'|'waiting'} status
 * @property {string} statusLabel                - "Terpenuhi" | "Menunggu"
 */

/**
 * @typedef {Object} BidangStatus
 * @property {string} label                      - "Permintaan per Bidang"
 * @property {BidangStatusItem[]} items
 */

/**
 * The Bidang Analytics report projection. Same chrome/components as the
 * Driver/Vehicle reports, but Zone C is the fulfilled/waiting status
 * strip (`bidangStatus`) rather than proportional bars, and the footer
 * filter line is bidang-first.
 * @typedef {Object} BidangReportModel
 * @property {ReportMeta} meta
 * @property {HeroMetric} hero
 * @property {MetricCell[]} kpis
 * @property {BidangStatus} bidangStatus
 * @property {Highlight[]} highlights
 * @property {Contributor[]} contributors
 */

/**
 * @typedef {Object} HealthScore
 * @property {number} score
 * @property {number} outOf
 * @property {string} badge                      - "Sangat Baik" | …
 * @property {string} badgeTone
 * @property {string} label                      - "Kesehatan Operasional"
 * @property {number} [criticalWarnings]
 */

/**
 * @typedef {Object} ContributorGroup
 * @property {string} label                      - "Pengemudi" | "Kendaraan" | "Bidang"
 * @property {Array<{name:string, description:string, metricValue:string, metricLabel:string}>} items
 */

/**
 * @typedef {Object} AppendixEntry
 * @property {string} key
 * @property {string} value
 * @property {string} [sub]
 * @property {boolean} [muted]
 */

/**
 * The 5-page Complete Analytics report projection. Aggregates all
 * dimensions from one AnalyticsModel.
 * @typedef {Object} CompleteReportModel
 * @property {Object} meta                        - org/period/version + filterLineDefault/filterLineBidang
 * @property {HealthScore} healthScore            - P1
 * @property {MetricCell[]} execKpis              - P1 (6 cells)
 * @property {Highlight[]} execHighlights         - P1 (5 merged)
 * @property {string} baselineNote                - P1 footer cnote
 * @property {Object} twoColumn                   - P2 {left,right,crossDimension}
 * @property {BidangStatus} bidangStatus          - P3
 * @property {Object} destinations                - P3 {label,subtitle,items}
 * @property {Highlight[]} operationsHighlights   - P3
 * @property {ContributorGroup[]} contributorGroups - P4
 * @property {{entries:AppendixEntry[], note:string}} appendix - P5
 */

export const REPORT_MODEL_SCHEMA_VERSION = 1;
