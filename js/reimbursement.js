/* ============================================================
   REIMBURSEMENT.JS — Form Reimbursement Generator  (v1.2.5)

   Generates a professional A4 reimbursement form from
   assignment data. Supports browser Print and Save as PDF.

   Architecture note: this module is intentionally self-
   contained. It produces a full HTML string that is injected
   into a new window — no external PDF library required.

   v1.2.5 changes:
   - Sequential PBSI/RMB/YYYY/MM/NNNN document numbering
     stored atomically in Firebase (resets monthly)
   - No. Assignment reference displayed in header
   - Section C redesigned: 35/65 driver statement + breakdown
   - Section D simplified: blank dashed area for physical receipts
   ============================================================ */

'use strict';

import { getVehicles }    from './vehicles-store.js';
import { parseLocalDate }  from './utils.js';
import { acquireReimbursementDocNumber } from './firebase.js';

/* ── Overtime Boundaries ── */
const WORK_START_MINS = 9  * 60;   // 09:00
const WORK_END_MINS   = 17 * 60;   // 17:00

/* ────────────────────────────────────────────────────────────
   HELPERS
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

/**
 * Format assignment ID as a human-readable reference.
 * Shows as: ASG-YYYYMMDD-XXXXXX
 */
function formatAssignmentRef(a) {
  const dateStr = (a.date || '').replace(/-/g, '');
  const suffix  = String(a.id || '').slice(-6).toUpperCase();
  return dateStr ? `ASG-${dateStr}-${suffix}` : (a.id || '—');
}

/** HTML-escape a value. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ────────────────────────────────────────────────────────────
   HTML GENERATOR
   ──────────────────────────────────────────────────────────── */

/**
 * Build a self-contained A4 HTML document for the reimbursement
 * form.  Write the result into window.document to enable
 * browser Print / Save as PDF.
 *
 * @param   {Object} a          — Assignment object
 * @param   {string} docNumber  — Sequential doc number (PBSI/RMB/YYYY/MM/NNNN)
 * @returns {string}            — Complete HTML string
 */
export function generateReimbursementHTML(a, docNumber) {
  const dateObj  = parseLocalDate(a.date);
  const dateStr  = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const overtimeStatus = calculateOvertimeStatus(a.startTime, a.endTime, a.fullDay);
  const requester      = getRequesterInfo(a);
  const vehiclePlate   = getVehiclePlate(a.vehicle);
  const assignmentRef  = formatAssignmentRef(a);
  const printDate      = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const fmtOdo = v => (v != null ? `${Number(v).toLocaleString('id-ID')} km` : '—');
  const startOdo = fmtOdo(a.startOdometer);
  const endOdo   = fmtOdo(a.endOdometer);
  const distance = fmtOdo(a.distanceTravelled);

  const isOT    = overtimeStatus === 'OVERTIME';
  const otLabel = isOT ? 'LEMBUR'  : 'NORMAL';
  const otDesc  = isOT
    ? 'Di luar jam operasional (09:00 – 17:00)'
    : 'Dalam jam operasional (09:00 – 17:00)';
  const otBadge = `<span class="badge badge--${isOT ? 'ot' : 'ok'}">${otLabel}</span>`;

  const startT      = a.fullDay ? '00:00' : (a.startTime || '—');
  const endT        = a.fullDay ? '23:59' : (a.endTime   || '—');
  const fullDayNote = a.fullDay
    ? ' <span style="color:#5B5953;font-weight:400;">(Penuh Hari)</span>'
    : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Form Reimbursement – ${esc(a.driver)} – ${esc(a.date)}</title>
<style>
/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Base ── */
body {
  font-family: 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
  font-size: 9.5pt;
  color: #1A1917;
  background: #fff;
  line-height: 1.5;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Screen wrapper ── */
@media screen {
  body { background: #E0DDD9; }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 28px auto 40px;
    padding: 13mm 17mm 10mm;
    background: #fff;
    box-shadow: 0 6px 32px rgba(0,0,0,.16);
  }
}

/* ── Print — single-page guarantee ── */
@media print {
  body { background: #fff; }
  @page { size: A4 portrait; margin: 13mm 17mm 11mm; }
  .page {
    width: 100%; padding: 0; margin: 0; box-shadow: none;
    /* Explicit usable height = 297mm - 13mm top - 11mm bottom = 273mm.
       flex:1 on .attach-section fills the exact remainder.
       overflow:hidden is the hard safeguard: nothing bleeds to page 2. */
    height: 273mm;
    overflow: hidden;
  }
  .no-print { display: none !important; }
}

/* ── Page layout ── */
.page {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Doc header ── */
.doc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 2.5px solid #1A1917;
  margin-bottom: 10px;
}
.org-name {
  font-size: 11.5pt;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.org-sub {
  font-size: 8pt;
  color: #5B5953;
  margin-top: 1px;
}
.doc-meta {
  text-align: right;
  font-size: 7.5pt;
  color: #5B5953;
  line-height: 1.8;
  white-space: nowrap;
  flex-shrink: 0;
}
.doc-meta strong { font-weight: 600; color: #1A1917; }

/* ── Form title ── */
.form-title-block {
  text-align: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #E8E6E2;
}
.form-title {
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: 1.2;
}
.form-subtitle {
  font-size: 8pt;
  color: #5B5953;
  margin-top: 2px;
}

/* ── Section label ── */
.sec-label {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #5B5953;
  margin: 9px 0 5px;
  padding-bottom: 3px;
  border-bottom: 1px solid #E8E6E2;
}

/* ── Data table ── */
.data-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #C9C6C0;
  border-radius: 4px;
  overflow: hidden;
  font-size: 9pt;
}
.data-table td {
  padding: 5px 10px;
  border: 1px solid #E2DFD9;
  vertical-align: top;
}
.td-lbl {
  width: 18%;
  background: #F7F6F3;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #5B5953;
  white-space: nowrap;
}
.td-val {
  font-size: 9.5pt;
  font-weight: 600;
  color: #1A1917;
  min-width: 80px;
}
.td-val--muted { font-weight: 400; color: #5B5953; }

/* ── Badges ── */
.badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 3px;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.07em;
  vertical-align: middle;
}
.badge--ok  { background: #E7F2EC; color: #2F7D62; border: 1px solid #B3D9C9; }
.badge--ot  { background: #FAEBEB; color: #A8292F; border: 1px solid #F0BDBD; }
.badge-desc {
  display: block;
  font-size: 7.5pt;
  font-weight: 400;
  color: #5B5953;
  margin-top: 2px;
}

/* ── Section C: Pengajuan Reimbursement ── */
.rmb-section {
  display: grid;
  grid-template-columns: 35fr 65fr;
  gap: 8px;
  margin-top: 5px;
}

/* Left: Driver Statement */
.driver-stmt-col {
  border: 1px solid #C9C6C0;
  border-radius: 4px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
}
.driver-stmt-label {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5B5953;
  margin-bottom: 5px;
}
.driver-stmt-text {
  font-size: 7.5pt;
  color: #3A3835;
  line-height: 1.6;
  flex: 1;
}
.driver-sig-area {
  margin-top: 14px;
}
.driver-sig-date {
  font-size: 7pt;
  color: #5B5953;
  margin-bottom: 16px;
}
.driver-sig-line {
  border-top: 1px solid #1A1917;
  padding-top: 4px;
  text-align: center;
}
.driver-sig-name {
  font-size: 8.5pt;
  font-weight: 600;
  color: #1A1917;
}
.driver-sig-role {
  font-size: 7pt;
  color: #5B5953;
  margin-top: 1px;
}

/* Right: Reimbursement Breakdown */
.rmb-breakdown-col {
  border: 1px solid #C9C6C0;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.rmb-breakdown-title {
  background: #F7F6F3;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5B5953;
  padding: 5px 10px;
  border-bottom: 1px solid #E2DFD9;
}
.rmb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
  flex: 1;
}
.rmb-table th {
  background: #F7F6F3;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #5B5953;
  padding: 4px 10px;
  border-bottom: 1px solid #E2DFD9;
  text-align: left;
}
.rmb-table th.col-amt { text-align: right; }
.rmb-table td {
  padding: 5px 10px;
  border-bottom: 1px solid #F0EDE8;
  vertical-align: middle;
  color: #1A1917;
}
.rmb-table tr:last-child td { border-bottom: none; }
.col-cat { width: 60%; }
.col-amt { width: 40%; text-align: right; }
.rmb-table td.col-amt {
  color: #C9C6C0;
  font-size: 7pt;
  letter-spacing: 0.03em;
}
.row-total td {
  background: #F7F6F3;
  font-weight: 700;
  font-size: 9pt;
  border-top: 1.5px solid #C9C6C0;
  border-bottom: none;
}
.row-total td.col-amt {
  color: #5B5953;
  font-size: 8pt;
}

/* ── Attachment section — flex:1 claims all remaining vertical space ── */
.attach-section {
  margin-top: 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 70mm;
}
.attach-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 5px;
}
.attach-title {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #1A1917;
}
.attach-subtitle { font-size: 7pt; color: #5B5953; }
.attach-area {
  flex: 1;
  min-height: 60mm;
  border: 1.5px dashed #C9C6C0;
  border-radius: 6px;
  background: #fff;
}

/* ── Footer ── */
.doc-footer {
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px solid #E8E6E2;
  display: flex;
  justify-content: space-between;
  font-size: 6.5pt;
  color: #94918B;
  flex-shrink: 0;
}

/* ── Print toolbar (screen only) ── */
.print-bar {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  gap: 10px;
  z-index: 99;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,.18));
}
@media print { .print-bar { display: none; } }
.btn-p {
  border: none;
  padding: 11px 22px;
  border-radius: 6px;
  font-size: 10pt;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 0.01em;
}
.btn-p--dark  { background: #1A1917; color: #fff; }
.btn-p--dark:hover  { background: #333; }
.btn-p--light { background: #fff; color: #1A1917; border: 1.5px solid #C9C6C0; }
.btn-p--light:hover { background: #F5F4F1; }
</style>
</head>
<body>
<div class="page">

  <!-- ── Doc Header ── -->
  <div class="doc-header">
    <div>
      <div class="org-name">Bidang Sarana dan Prasarana</div>
      <div class="org-sub">PBSI &mdash; Persatuan Bulu Tangkis Seluruh Indonesia</div>
    </div>
    <div class="doc-meta">
      <div>No. Dokumen: <strong>${esc(docNumber)}</strong></div>
      <div>No. Assignment: <strong>${esc(assignmentRef)}</strong></div>
      <div>Tanggal Cetak: <strong>${esc(printDate)}</strong></div>
    </div>
  </div>

  <!-- ── Form Title ── -->
  <div class="form-title-block">
    <div class="form-title">Form Reimbursement Perjalanan Dinas</div>
    <div class="form-subtitle">Formulir Pengajuan Penggantian Biaya Operasional Kendaraan</div>
  </div>

  <!-- ── A. Informasi Perjalanan ── -->
  <div class="sec-label">A. Informasi Perjalanan</div>
  <table class="data-table">
    <tbody>
      <tr>
        <td class="td-lbl">Nama Driver</td>
        <td class="td-val">${esc(a.driver || '—')}</td>
        <td class="td-lbl">${esc(requester.label)}</td>
        <td class="td-val">${esc(requester.value)}</td>
      </tr>
      <tr>
        <td class="td-lbl">Keperluan</td>
        <td class="td-val" colspan="3">${esc(a.purpose || '—')}${a.destination ? ` &mdash; <span class="td-val--muted">${esc(a.destination)}</span>` : ''}</td>
      </tr>
      <tr>
        <td class="td-lbl">Tanggal</td>
        <td class="td-val">${esc(dateStr)}</td>
        <td class="td-lbl">Unit Kendaraan</td>
        <td class="td-val">${esc(a.vehicle || '—')}</td>
      </tr>
      <tr>
        <td class="td-lbl">Jam Berangkat</td>
        <td class="td-val">${esc(startT)}${fullDayNote}</td>
        <td class="td-lbl">Nomor Polisi</td>
        <td class="td-val">${esc(vehiclePlate)}</td>
      </tr>
      <tr>
        <td class="td-lbl">Jam Kembali</td>
        <td class="td-val">${esc(endT)}${fullDayNote}</td>
        <td class="td-lbl">Jumlah Penumpang</td>
        <td class="td-val">${esc(String(a.pax ?? 0))} pax</td>
      </tr>
    </tbody>
  </table>

  <!-- ── B. Data Odometer ── -->
  <div class="sec-label">B. Data Odometer &amp; Status Lembur</div>
  <table class="data-table">
    <tbody>
      <tr>
        <td class="td-lbl">KM Awal</td>
        <td class="td-val">${esc(startOdo)}</td>
        <td class="td-lbl">KM Akhir</td>
        <td class="td-val">${esc(endOdo)}</td>
      </tr>
      <tr>
        <td class="td-lbl">Total Jarak</td>
        <td class="td-val">${esc(distance)}</td>
        <td class="td-lbl">Status Lembur</td>
        <td class="td-val">
          ${otBadge}
          <span class="badge-desc">${esc(otDesc)}</span>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ── C. Pengajuan Reimbursement ── -->
  <div class="sec-label">C. Pengajuan Reimbursement</div>
  <div class="rmb-section">

    <!-- LEFT 35%: Driver Statement + Signature -->
    <div class="driver-stmt-col">
      <div class="driver-stmt-label">Pernyataan Driver</div>
      <p class="driver-stmt-text">
        Dengan ini saya menyatakan bahwa data perjalanan dinas yang
        tercantum di atas adalah benar dan biaya yang diajukan sesuai
        dengan bukti pengeluaran yang disertakan.
      </p>
      <div class="driver-sig-area">
        <div class="driver-sig-date">Jakarta, ${esc(printDate)}</div>
        <div class="driver-sig-line">
          <div class="driver-sig-name">${esc(a.driver || '—')}</div>
          <div class="driver-sig-role">Driver Operasional</div>
        </div>
      </div>
    </div>

    <!-- RIGHT 65%: Reimbursement Breakdown -->
    <div class="rmb-breakdown-col">
      <div class="rmb-breakdown-title">Rincian Biaya</div>
      <table class="rmb-table">
        <thead>
          <tr>
            <th class="col-cat">Keterangan</th>
            <th class="col-amt">Jumlah (Rp)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="col-cat">BBM / Bensin</td>
            <td class="col-amt">_______________</td>
          </tr>
          <tr>
            <td class="col-cat">Tol</td>
            <td class="col-amt">_______________</td>
          </tr>
          <tr>
            <td class="col-cat">Parkir</td>
            <td class="col-amt">_______________</td>
          </tr>
          <tr>
            <td class="col-cat">Lain-lain</td>
            <td class="col-amt">_______________</td>
          </tr>
          <tr class="row-total">
            <td class="col-cat">TOTAL</td>
            <td class="col-amt">_______________</td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>

  <!-- ── D. Lampiran Bukti Pengeluaran ── -->
  <div class="attach-section">
    <div class="attach-header">
      <div class="attach-title">D. Lampiran Bukti Pengeluaran</div>
      <div class="attach-subtitle">Tempel bukti fisik pada area di bawah ini</div>
    </div>
    <div class="attach-area"></div>
  </div>

  <!-- ── Footer ── -->
  <div class="doc-footer">
    <span>PBSI Operations Platform v1.3.0 &mdash; Form Reimbursement Perjalanan Dinas</span>
    <span>${esc(docNumber)}</span>
  </div>

</div>

<!-- ── Print toolbar (screen only) ── -->
<div class="print-bar no-print">
  <button class="btn-p btn-p--light" onclick="window.close()">Tutup</button>
  <button class="btn-p btn-p--dark" onclick="window.print()">🖸&nbsp; Cetak / Simpan PDF</button>
</div>

</body>
</html>`;
}

/* ────────────────────────────────────────────────────────────
   PDF VIEWER MODAL  (v1.3.0)
   Replaces window.open() — works on iOS Safari, Android Chrome,
   and all desktop browsers without popup permission requirements.
   ──────────────────────────────────────────────────────────── */

/** Session cache: assignment.id → { htmlUrl, pdfUrl, filename } */
const _cache = new Map();

/** Guards one-time event-listener setup. */
let _viewerInitialized = false;

/**
 * Open the PDF Viewer Modal for the given assignment.
 * Exported as `printReimbursementForm` to keep callers unchanged.
 *
 * @param {Object} assignment — Assignment object
 * @returns {Promise<void>}
 */
export async function printReimbursementForm(assignment) {
  _initViewerOnce();

  const cacheKey = String(assignment.id);

  // Show modal in loading state immediately — no waiting
  _openViewerModal(assignment);

  // Cache hit: reuse previously generated blob URLs
  if (_cache.has(cacheKey)) {
    const { htmlUrl, pdfUrl, filename } = _cache.get(cacheKey);
    _showIframePreview(htmlUrl);
    _enableActions(pdfUrl, filename, assignment);
    return;
  }

  try {
    // 1. Acquire sequential doc number + generate HTML
    _setLoadingText('Mempersiapkan Form Reimbursement...');
    const docNumber = await acquireReimbursementDocNumber(assignment.date);
    const html      = generateReimbursementHTML(assignment, docNumber);

    // 2. HTML blob → iframe preview (appears immediately, no PDF lib needed)
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const htmlUrl  = URL.createObjectURL(htmlBlob);
    _showIframePreview(htmlUrl);

    // 3. Generate PDF blob in the background (enables Download + Share)
    _setLoadingText('Membuat PDF...');
    const filename = _buildFilename(assignment, docNumber);

    let pdfUrl = null;
    try {
      const pdfBlob = await _generatePdfBlob(html);
      pdfUrl = URL.createObjectURL(pdfBlob);
    } catch (pdfErr) {
      // PDF generation failure is non-fatal — preview + print still work
      console.warn('[PDFViewer] PDF generation failed; download unavailable:', pdfErr);
    }

    // 4. Cache result so re-opening the same form is instant
    _cache.set(cacheKey, { htmlUrl, pdfUrl, filename });

    // 5. Wire up action buttons
    _enableActions(pdfUrl, filename, assignment);

  } catch (err) {
    console.error('[PDFViewer] Fatal error:', err);
    _showViewerError();
  }
}

/**
 * Close the PDF viewer and release transient DOM state.
 * Cached blob URLs survive closure for session-level reuse.
 */
export function closePdfViewer() {
  const overlay = document.getElementById('modalPdfViewer');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';

  // Blank the iframe to stop running content and free memory
  const iframe = document.getElementById('pdfViewerIframe');
  if (iframe) {
    iframe.src = 'about:blank';
    _hideEl('pdfViewerIframe');
  }
}

/* ── Private helpers ──────────────────────────────────────── */

/** Show modal immediately in loading state; populate meta header. */
function _openViewerModal(assignment) {
  const meta = document.getElementById('pdfViewerMeta');
  if (meta) {
    const driver = assignment.driver || '—';
    const date   = assignment.date
      ? new Date(assignment.date + 'T00:00:00')
          .toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    meta.textContent = `${driver} · ${date}`;
  }

  // Reset to loading state
  _showEl('pdfViewerLoading', 'flex');
  _hideEl('pdfViewerIframe');
  _hideEl('pdfViewerError');

  // Disable all action buttons until ready
  ['btnPdfDownload', 'btnPdfPrint', 'btnPdfShare'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = true;
  });
  const shareBtn = document.getElementById('btnPdfShare');
  if (shareBtn) shareBtn.style.display = 'none';

  const overlay = document.getElementById('modalPdfViewer');
  if (overlay) {
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  // Move focus into modal for accessibility / keyboard users
  requestAnimationFrame(() => document.getElementById('btnClosePdfViewer')?.focus());
}

/**
 * Load HTML blob URL into the iframe.
 * Hides loading state once iframe content is ready.
 */
function _showIframePreview(htmlUrl) {
  const iframe = document.getElementById('pdfViewerIframe');
  if (!iframe) return;

  iframe.onload = () => {
    _applyFitScale(iframe);
    _hideEl('pdfViewerLoading');
    _showEl('pdfViewerIframe', 'block');
    // Print is available as soon as the iframe is loaded
    const printBtn = document.getElementById('btnPdfPrint');
    if (printBtn) {
      printBtn.disabled = false;
      printBtn.onclick  = _printFromIframe;
    }
  };
  iframe.onerror = () => _showViewerError();
  iframe.src = htmlUrl;
}

/** Wire Download, Print, and (if supported) Share buttons. */
function _enableActions(pdfUrl, filename, assignment) {
  const dlBtn = document.getElementById('btnPdfDownload');
  if (dlBtn && pdfUrl) {
    dlBtn.disabled = false;
    dlBtn.onclick  = () => _downloadPdf(pdfUrl, filename);
  }

  // Print button may already be live; set handler defensively
  const printBtn = document.getElementById('btnPdfPrint');
  if (printBtn) {
    printBtn.disabled = false;
    printBtn.onclick  = _printFromIframe;
  }

  // Error-panel fallback download
  const fbBtn = document.getElementById('btnPdfDownloadFallback');
  if (fbBtn && pdfUrl) {
    fbBtn.style.display = '';
    fbBtn.onclick = () => _downloadPdf(pdfUrl, filename);
  }

  // Web Share API — only when file sharing is supported
  if (pdfUrl && _canShareFiles()) {
    const shareBtn = document.getElementById('btnPdfShare');
    if (shareBtn) {
      shareBtn.style.display = '';
      shareBtn.disabled = false;
      shareBtn.onclick  = () => _sharePdf(pdfUrl, filename, assignment);
    }
  }
}

function _buildFilename(assignment, docNumber) {
  const safe = s => String(s || '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
  const date = (assignment.date || '').replace(/-/g, '');
  return `Form-Reimbursement-${safe(assignment.driver)}-${date}.pdf`;
}

function _setLoadingText(text) {
  const el = document.getElementById('pdfViewerLoadingText');
  if (el) el.textContent = text;
}

function _showViewerError() {
  _hideEl('pdfViewerLoading');
  _hideEl('pdfViewerIframe');
  _showEl('pdfViewerError', 'flex');
}

/** Trigger browser download using a temporary <a> element. */
function _downloadPdf(pdfUrl, filename) {
  const a = document.createElement('a');
  a.href     = pdfUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Print via iframe.contentWindow.print(); falls back to new-tab. */
function _printFromIframe() {
  const iframe = document.getElementById('pdfViewerIframe');
  try {
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  } catch {
    if (iframe?.src) window.open(iframe.src, '_blank', 'noopener');
  }
}

/** True when navigator.share supports file attachments. */
function _canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([''], 'probe.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/** Share PDF via Web Share API (iOS/Android); swallows user cancellation. */
async function _sharePdf(pdfUrl, filename, assignment) {
  try {
    const res  = await fetch(pdfUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: 'application/pdf' });
    await navigator.share({
      title: 'Form Reimbursement',
      text:  `Form Reimbursement – ${assignment.driver || ''} – ${assignment.date || ''}`,
      files: [file],
    });
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('[PDFViewer] Share error:', e);
  }
}

/**
 * Inject a CSS zoom override into the iframe content so the A4 page
 * fits the container width on narrow screens (iPhone, Android).
 *
 * Why zoom not transform:scale — zoom collapses the layout box so no
 * phantom whitespace appears below the scaled element.
 *
 * No-op when the container is already wide enough to show A4 naturally
 * (desktop), or when same-origin iframe access is unavailable.
 *
 * @param {HTMLIFrameElement} iframe
 */
function _applyFitScale(iframe) {
  try {
    const doc       = iframe.contentDocument;
    if (!doc) return;

    const containerW = iframe.clientWidth;
    if (!containerW) return;

    const A4_PX = 794; // A4 at 96 dpi ≈ 210 mm
    if (containerW >= A4_PX) return; // wide enough — no scaling needed

    const scale = containerW / A4_PX;

    const s = doc.createElement('style');
    s.textContent =
      /* Prevent horizontal scrollbar inside iframe */
      'html,body{overflow-x:hidden!important}' +
      /* Scale the A4 page to fit exactly */
      '.page{zoom:' + scale + '!important;' +
            'margin:0 auto!important}' +
      /* Hide the screen-only toolbar that lives inside the HTML */
      '.no-print,.print-bar{display:none!important}';
    doc.head.appendChild(s);

  } catch {
    /* blob: URLs are always same-origin; guard exists only for safety */
  }
}

/**
 * Generate a PDF Blob from the reimbursement HTML string.
 * Dynamically loads html2pdf.js (CDN) on first use; result is cached
 * at the call-site so the library is only downloaded once per session.
 *
 * Screen-only elements (.no-print, .print-bar) are hidden via an
 * injected <style> so they don't appear in the rendered PDF.
 * Body background and page margins are normalised for clean output.
 */
async function _generatePdfBlob(htmlString) {
  const html2pdf = await _loadHtml2Pdf();

  // Hide screen-only toolbar; normalise page background & margins
  const cleanHtml = htmlString.replace(
    '</head>',
    '<style>' +
      '.no-print,.print-bar{display:none!important}' +
      'body{background:#fff!important}' +
      '.page{margin:0!important;box-shadow:none!important}' +
    '</style></head>'
  );

  // Parse and rebuild in a hidden off-screen container so html2canvas
  // can access the fully-styled DOM without affecting the visible page
  const parser    = new DOMParser();
  const doc       = parser.parseFromString(cleanHtml, 'text/html');
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText =
    'position:fixed;top:-99999px;left:-99999px;width:794px;' +
    'background:#fff;overflow:visible;pointer-events:none;';

  doc.querySelectorAll('style').forEach(s => container.appendChild(s.cloneNode(true)));
  const bodyWrap = document.createElement('div');
  bodyWrap.innerHTML = doc.body.innerHTML;
  container.appendChild(bodyWrap);
  document.body.appendChild(container);

  try {
    return await html2pdf()
      .set({
        margin:      0,
        filename:    'form-reimbursement.pdf',
        image:       { type: 'jpeg', quality: 0.97 },
        html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:   { mode: ['avoid-all', 'css'] },
      })
      .from(container)
      .output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

/** Dynamically load html2pdf.js from CDN; resolves instantly on repeat calls. */
function _loadHtml2Pdf() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  return new Promise((resolve, reject) => {
    const s   = document.createElement('script');
    s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.async   = true;
    s.onload  = () => resolve(window.html2pdf);
    s.onerror = () => reject(new Error('html2pdf.js failed to load'));
    document.head.appendChild(s);
  });
}

/**
 * Attach close / backdrop / ESC event listeners on the PDF viewer modal.
 * Runs exactly once — subsequent calls are no-ops.
 */
function _initViewerOnce() {
  if (_viewerInitialized) return;
  _viewerInitialized = true;

  document.getElementById('btnClosePdfViewer')
    ?.addEventListener('click', closePdfViewer);

  document.getElementById('btnPdfClose')
    ?.addEventListener('click', closePdfViewer);

  document.getElementById('modalPdfViewer')
    ?.addEventListener('click', e => {
      if (e.target === document.getElementById('modalPdfViewer')) closePdfViewer();
    });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('modalPdfViewer');
    if (overlay && overlay.style.display !== 'none') {
      e.preventDefault();
      closePdfViewer();
    }
  });
}

/* ── Tiny DOM helpers ── */
function _showEl(id, display = 'block') {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}
function _hideEl(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

console.info('Reimbursement module loaded (v1.3.0)');
