'use strict';

/* ============================================================
   Shared constants for the Cloud Functions backend.
   ============================================================ */

/** Logical service name surfaced by the health endpoint. */
const SERVICE_NAME = 'sarpras-operations';

/**
 * Backend scaffold version. Tracked independently of the frontend
 * APP_VERSION (js/config.js) so deploying the backend never triggers
 * the PWA "Versi baru tersedia" update banner.
 */
const SERVICE_VERSION = '1.11.1.2';

/**
 * Deploy region. Must match the RTDB region (asia-southeast1) so that
 * future database-triggered functions run with the lowest latency.
 */
const REGION = 'asia-southeast1';

module.exports = { SERVICE_NAME, SERVICE_VERSION, REGION };
