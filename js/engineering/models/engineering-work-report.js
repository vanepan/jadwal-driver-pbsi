/* ============================================================
   ENGINEERING-WORK-REPORT.JS — Operational Work Report ("Catat Pekerjaan")
   (v1.20.6, Objective 3)

   The model for an OPERATIONAL WORK REPORT — real engineering work performed
   OUTSIDE a formal assignment, captured for the long-term operational dataset
   (future ML). A report is explicitly NOT an assignment: it has no lifecycle,
   no self-join, no verification — it is a completed record of work that already
   happened. It is persisted in its OWN node (engineering/workReports) and unified
   with assignments only inside analytics / timeline / search.

   Fields mirror the Create Assignment shape (title/category/priority/location)
   plus the operational capture fields (work date, times, root cause, action
   taken, recommendation, materials, cost) and the personnel who performed it
   (assignedUsers — UID references into User Management, never denormalized names).

   Everything is plain-JSON serializable. PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import {
  cleanString, deepClone, isPlainObject, num, nowISO,
  generateId, generateAssignmentNumber,
} from '../utils/engineering-utils.js';
import {
  PRIORITY, DEFAULT_PRIORITY, isKnownPriority,
} from '../config/engineering-config.js';
import { normalizeActor, normalizeAssignedUsers } from './engineering-assignment.js';

/** Report kind marker — lets unified consumers (analytics/search) tell the two apart. */
export const WORK_REPORT_KIND = 'work_report';

/** Keep a YYYY-MM-DD string, else ''. */
function cleanDate(v) {
  const s = cleanString(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** Keep an HH:MM (24h) string, else ''. */
function cleanTime(v) {
  const s = cleanString(v);
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

/**
 * Build a normalized Operational Work Report.
 * @param {Object} input
 * @param {Object} [options]
 * @param {string} [options.id]
 * @param {string} [options.reportNumber]
 * @param {number} [options.sequence]
 * @param {Date|number|string} [options.now]
 * @returns {Object}
 */
export function createWorkReportModel(input = {}, options = {}) {
  const now = options.now;
  const created = nowISO(now);
  const priority = isKnownPriority(input.priority) ? input.priority : DEFAULT_PRIORITY;
  const id = cleanString(options.id || input.id) || generateId('engrpt', now);
  const reportNumber = cleanString(options.reportNumber || input.reportNumber)
    || generateAssignmentNumber({ prefix: 'ENGR', sequence: options.sequence, now });

  return {
    id,
    reportNumber,
    kind: WORK_REPORT_KIND,
    title: cleanString(input.title),
    category: cleanString(input.category),
    priority,
    building: cleanString(input.building),
    room: cleanString(input.room),
    location: cleanString(input.location),
    requester: cleanString(input.requester),
    // operational capture
    workDate: cleanDate(input.workDate),
    startTime: cleanTime(input.startTime),
    finishTime: cleanTime(input.finishTime),
    assignedUsers: normalizeAssignedUsers(input.assignedUsers),   // { uid: true } — who performed it
    rootCause: cleanString(input.rootCause),
    actionTaken: cleanString(input.actionTaken),
    recommendation: cleanString(input.recommendation),
    materialsUsed: cleanString(input.materialsUsed),              // optional
    estimatedCost: num(input.estimatedCost),                      // optional (0 = unset)
    // future-ready attachments (reserved — captured but inert this sprint)
    photoBefore: cleanString(input.photoBefore) || null,
    photoAfter: cleanString(input.photoAfter) || null,
    notes: cleanString(input.notes),
    creator: normalizeActor(input.creator),
    createdTime: input.createdTime ? nowISO(input.createdTime) : created,
    updatedTime: input.updatedTime ? nowISO(input.updatedTime) : created,
  };
}

/** Round-trip a persisted report node into a clean model (safe on partials). */
export function normalizeWorkReport(raw) {
  if (!isPlainObject(raw)) return null;
  return createWorkReportModel(raw, {
    id: raw.id, reportNumber: raw.reportNumber, now: raw.createdTime,
  });
}

/** Serialize to a plain JSON object (deep clone — never leaks a live reference). */
export function serializeWorkReport(report) {
  return deepClone(report);
}

/**
 * Worked duration (ms) derived from workDate + start/finish times. Handles a
 * finish past midnight by rolling to the next day. Null when times are missing.
 * @param {Object} report
 * @returns {?number}
 */
export function workReportDurationMs(report) {
  if (!report || !report.startTime || !report.finishTime) return null;
  const [sh, sm] = report.startTime.split(':').map(Number);
  const [fh, fm] = report.finishTime.split(':').map(Number);
  let mins = (fh * 60 + fm) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;   // crossed midnight
  return mins * 60000;
}
