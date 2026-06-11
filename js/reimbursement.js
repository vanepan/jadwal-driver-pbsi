/* ============================================================
   REIMBURSEMENT.JS — Form Reimbursement Generator  (v2.0)

   Now the first production consumer of the Document Generation
   Framework (js/docs/*). This module owns only DOMAIN LOGIC:
   overtime calculation, requester resolution, plate lookup,
   sequential doc-number acquisition, and building a presentation-
   agnostic view model. Rendering, preview, print, download, and
   share are delegated to DocumentEngine.

   The PDF is computed in pure JS (pdfmake) from a declarative
   template — deterministic across Desktop, Android, iPhone, PWA.

   Removed in v2.0 (replaced by the framework):
   - html2canvas raster path
   - jsPDF assembly path
   - iframe + window.print() path
   - viewport zoom-scaling path
   - self-contained HTML string generator
   ============================================================ */

'use strict';

import { getVehicles }                    from './vehicles-store.js';
import { parseLocalDate }                 from './utils.js';
import { acquireReimbursementDocNumber }  from './firebase.js';
import * as DocumentEngine                from './docs/doc-engine.js';
import './docs/templates/reimbursement.js';   // side-effect: registers 'reimbursement'

/* ── Overtime Boundaries ── */
const WORK_START_MINS = 9  * 60;   // 09:00
const WORK_END_MINS   = 17 * 60;   // 17:00

/* ────────────────────────────────────────────────────────────
   DOMAIN HELPERS
   ──────────────────────────────────────────────────────────── */

/**
 * Determine overtime status from assignment time fields.
 * OVERTIME when: fullDay flag set, departure before 09:00,
 * or arrival after 17:00.  Returns 'NORMAL' or 'OVERTIME'.
 */
export function calculateOvertimeStatus(startTime, endTime, fullDay) {
  if (fullDay) return 'OVERTIME';
  if (!startTime || !endTime) return 'NORMAL';

  const [sh = 0, sm = 0] = startTime.split(':').map(Number);
  const [eh = 0, em = 0] = endTime.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;

  return (startMins < WORK_START_MINS || endMins > WORK_END_MINS)
    ? 'OVERTIME'
    : 'NORMAL';
}

/** Returns { label, value } for the requester / PIC row. */
function getRequesterInfo(a) {
  if (a.requestId && a.createdBy) return { label: 'Bidang Requester', value: a.createdBy };
  if (a.pic)                      return { label: 'PIC',              value: a.pic       };
  if (a.createdBy)                return { label: 'Dibuat Oleh',      value: a.createdBy };
  return { label: 'PIC / Requester', value: '—' };
}

/** License plate for a vehicle, or '-' when not yet configured. */
function getVehiclePlate(vehicleName) {
  const v = getVehicles().find(veh => veh.name === vehicleName);
  return v?.plateNumber || '-';
}

/** Format assignment ID as a human-readable reference (ASG-YYYYMMDD-XXXXXX). */
function formatAssignmentRef(a) {
  const dateStr = (a.date || '').replace(/-/g, '');
  const suffix  = String(a.id || '').slice(-6).toUpperCase();
  return dateStr ? `ASG-${dateStr}-${suffix}` : (a.id || '—');
}

/**
 * Build the presentation-agnostic view model consumed by the
 * reimbursement template. No layout decisions here — just data.
 */
function buildViewModel(a, docNumber) {
  const dateObj = parseLocalDate(a.date);
  const dateStr = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const printDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const overtimeStatus = calculateOvertimeStatus(a.startTime, a.endTime, a.fullDay);
  const isOT = overtimeStatus === 'OVERTIME';

  const fmtOdo = v => (v != null ? `${Number(v).toLocaleString('id-ID')} km` : '—');
  const requester = getRequesterInfo(a);

  return {
    docNumber,
    assignmentRef: formatAssignmentRef(a),
    printDate,
    rawDate: a.date || '',

    driver:         a.driver || '—',
    requesterLabel: requester.label,
    requesterValue: requester.value,
    purpose:        a.purpose || '—',
    destination:    a.destination || '',
    dateStr,
    vehicle:        a.vehicle || '—',
    vehiclePlate:   getVehiclePlate(a.vehicle),

    startT:  a.fullDay ? '00:00' : (a.startTime || '—'),
    endT:    a.fullDay ? '23:59' : (a.endTime   || '—'),
    fullDay: !!a.fullDay,
    pax:     a.pax ?? 0,

    startOdo: fmtOdo(a.startOdometer),
    endOdo:   fmtOdo(a.endOdometer),
    distance: fmtOdo(a.distanceTravelled),

    isOT,
    otLabel: isOT ? 'LEMBUR' : 'NORMAL',
    otDesc:  isOT
      ? 'Di luar jam operasional (09:00 – 17:00)'
      : 'Dalam jam operasional (09:00 – 17:00)',
  };
}

/* ────────────────────────────────────────────────────────────
   PUBLIC API  (unchanged signatures)
   ──────────────────────────────────────────────────────────── */

/**
 * Generate and open the reimbursement form for an assignment.
 * Acquires a sequential document number, builds the view model,
 * then hands off to the Document Engine (preview + print + PDF).
 *
 * @param {Object} assignment
 * @returns {Promise<void>}
 */
export async function printReimbursementForm(assignment) {
  const docNumber = await acquireReimbursementDocNumber(assignment.date);
  const vm = buildViewModel(assignment, docNumber);
  await DocumentEngine.generateAndOpen('reimbursement', vm, {
    viewer: {
      title: `Form Reimbursement — ${vm.driver}`,
      shareText: `Form Reimbursement – ${vm.driver} – ${assignment.date || ''}`,
    },
  });
}

/** Close the document viewer (delegates to the framework). */
export function closePdfViewer() {
  DocumentEngine.closeViewer();
}
