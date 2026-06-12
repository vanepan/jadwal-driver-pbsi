/* ============================================================
   ANALYTICS-MODEL.JS — Normalized AnalyticsModel assembler

   Defines the normalized structure produced by the Analytics Engine and
   consumed by the dashboard, the export pipeline (PDF/Excel/Print), and
   the future AI Operations Assistant.

   buildAnalyticsModel() is a thin, deterministic assembler — it does no
   computation. The engine computes; this guarantees the model always has
   a stable shape (every bucket present).

   `render` and `exportSnapshot` are transitional, parity-preserving
   projections used while the renderer + PDF template are migrated onto
   the structured buckets in later sprints.
   ============================================================ */

'use strict';

import { ANALYTICS_SCHEMA_VERSION } from './analytics-types.js';

/**
 * Assemble a normalized AnalyticsModel from pre-computed parts.
 * @param {Object} parts
 * @param {Object} [parts.metadata]
 * @param {Object} [parts.kpis]
 * @param {Object} [parts.charts]
 * @param {Array}  [parts.insights]
 * @param {Object} [parts.diagnostics]
 * @param {Object} [parts.render]
 * @param {Object} [parts.exportSnapshot]
 * @returns {import('./analytics-types.js').AnalyticsModel}
 */
export function buildAnalyticsModel(parts = {}) {
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    metadata:       parts.metadata       || {},
    kpis:           parts.kpis           || {},
    charts:         parts.charts         || {},
    insights:       parts.insights       || [],
    recommendations: parts.recommendations || [],
    diagnostics:    parts.diagnostics    || {},
    // Transitional projections (removed once components/exports render
    // from the structured buckets above).
    render:         parts.render         || {},
    exportSnapshot: parts.exportSnapshot || null,
  };
}

/** An empty, shape-stable model (used for loading/error fallbacks). */
export function createEmptyModel() {
  return buildAnalyticsModel({});
}
