/* ============================================================
   ANALYTICS-TYPES.JS — Shared model definitions (JSDoc typedefs)

   The platform is vanilla JS (no TypeScript), so the analytics
   contracts are expressed as JSDoc typedefs. They are the single
   source of truth for the shape the Analytics Engine produces and
   that the dashboard / exports / future AI layer consume.

   Introduced in Sprint 0 (v1.10.0) — Analytics Engine Extraction.
   No runtime behavior; import for documentation/tooling only.
   ============================================================ */

'use strict';

/**
 * @typedef {'production'|'testing'|'training'|'demo'} ClassificationKind
 */

/**
 * Governance classification attached (optionally) to a record.
 * Absence of this block on a record MUST be treated as "production".
 * @typedef {Object} AnalyticsClassification
 * @property {boolean} analyticsEligible
 * @property {ClassificationKind} classification
 * @property {string} [classifiedBy]
 * @property {string} [classifiedAt]
 * @property {string} [classificationReason]
 */

/**
 * Filter selection driving an analytics computation.
 * @typedef {Object} AnalyticsFilters
 * @property {'today'|'7d'|'30d'|'90d'|'all'} dateRange
 * @property {string} driver   - '' = all
 * @property {string} vehicle  - '' = all
 * @property {string} bidang   - '' = all
 */

/**
 * Input bundle passed to computeAnalyticsModel(). The engine is pure:
 * it reads only what is in this context — never Firebase, never the DOM.
 * @typedef {Object} AnalyticsContext
 * @property {Array<Object>} assignments - raw assignment records
 * @property {Array<Object>} requests    - raw request records (/driver_requests)
 * @property {Array<Object>} drivers     - driver roster (as returned by getDrivers())
 * @property {Array<Object>} vehicles    - vehicle roster (as returned by getActiveVehicles())
 * @property {AnalyticsFilters} filters
 * @property {{destinations:Object,bidang:Object,drivers:Object,vehicles:Object}} aliases
 * @property {{destinations:Object,bidang:Object,drivers:Object,vehicles:Object}} dismissed
 * @property {(a:Object)=>Object} normalizeAssignmentStatus
 */

/**
 * A single KPI in normalized form. (Forward-looking — Sprint 0 still
 * renders from the flat `render` projection; later sprints render KPIs
 * from this structure.)
 * @typedef {Object} KPI
 * @property {string} id
 * @property {string} label
 * @property {number|string} value
 * @property {'int'|'pct'|'pct1'|'km'|'km1'|'currency'|'ratio'} [fmt]
 * @property {number} [delta]
 * @property {'up'|'down'|'flat'} [trendTone]
 * @property {string} [sub]
 * @property {'executive'|'section'} [tier]
 */

/**
 * Human-readable finding produced by the Insight Engine from existing model
 * outputs (Sprint 4). Deterministic, traceable (names a source metric),
 * explainable. No new calculations.
 * @typedef {Object} Insight
 * @property {'info'|'success'|'warning'} type
 * @property {string} title
 * @property {string} description
 * @property {string} source        - the metric this insight is derived from
 * @property {number} priority       - 1 = critical, 2 = important, 3 = general
 */

/**
 * Advisory next-step produced by the Recommendation Engine (Sprint 5) from
 * existing findings via deterministic rules. Traceable, explainable, actionable.
 * No AI, no prediction.
 * @typedef {Object} Recommendation
 * @property {'action'|'warning'|'optimization'} type
 * @property {string} title
 * @property {string} description
 * @property {string} source        - the metric/insight this is based on
 * @property {number} priority       - 1 = operational risk, 2 = optimization, 3 = informational
 */

/**
 * A single period-over-period comparison produced by the Trend Engine
 * (Sprint 6) from values the Analytics Engine already computed. No new
 * calculation — only a diff of current vs previous. `direction` reflects raw
 * movement; `tone` reflects goodness (for color), since "up" is good for some
 * metrics (completion) and bad for others (open/cancellation rate).
 * @typedef {Object} TrendMetric
 * @property {number} current
 * @property {number} previous
 * @property {number} delta              - current - previous
 * @property {number|null} percentChange - round(delta/previous*100); null when previous == 0
 * @property {'up'|'down'|'neutral'} direction
 * @property {'positive'|'negative'|'neutral'} tone
 */

/**
 * The normalized analytics output. `render` and `exportSnapshot` are
 * transitional, parity-preserving projections used while the UI and PDF
 * are migrated onto the structured buckets in later sprints.
 * @typedef {Object} AnalyticsModel
 * @property {number} schemaVersion
 * @property {Object} metadata
 * @property {Object} kpis
 * @property {Object} charts
 * @property {Insight[]} insights
 * @property {Object.<string, TrendMetric>} trends - period-over-period comparison (empty without previous period)
 * @property {Object} diagnostics
 * @property {Object} render          - flat projection consumed by the current renderer
 * @property {Object} exportSnapshot  - the legacy _lastAnalyticsModel shape (PDF parity)
 */

export const ANALYTICS_SCHEMA_VERSION = 1;
