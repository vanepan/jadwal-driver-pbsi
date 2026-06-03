/* ============================================================
   REIMBURSEMENT.JS — Form Reimbursement Generator  (v1.2.4)

   Generates a professional A4 reimbursement form from
   assignment data. Supports browser Print and Save as PDF.

   Architecture note: this module is intentionally self-
   contained. It produces a full HTML string that is injected
   into a new window — no external PDF library required.

   Future expense categories (fuel, toll, parking) are wired
   as labelled attachment tags in Section D and can be
   expanded to input fields in a later version.
   ============================================================ */

'use strict';

import { VEHICLE_PLATES } from './drivers.js';
import { parseLocalDate }  from './utils.js';

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

/** License plate for a vehicle, or '—' when not yet configured. */
function getVehiclePlate(vehicleName) {
  return VEHICLE_PLATES[vehicleName] || '—';
}

/** Auto-generated document reference from assignment metadata. */
function generateDocRef(a) {
  const dateStr  = (a.date || '').replace(/-/g, '');
  const idSuffix = (a.id   || '').slice(-6).toUpperCase();
  return `PBSI/${dateStr}/${idSuffix}`;
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
 * @param   {Object} a  — Assignment object
 * @returns {string}    — Complete HTML string
 */
export function generateReimbursementHTML(a) {
  const dateObj  = parseLocalDate(a.date);
  const dateStr  = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const overtimeStatus = calculateOvertimeStatus(a.startTime, a.endTime, a.fullDay);
  const requester      = getRequesterInfo(a);
  const vehiclePlate   = getVehiclePlate(a.vehicle);
  const docRef         = generateDocRef(a);
  const printDate      = new Date().toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const fmtOdo = v => (v != null ? `${Number(v).toLocaleString('id-ID')} km` : '—');
  const startOdo = fmtOdo(a.startOdometer);
  const endOdo   = fmtOdo(a.endOdometer);
  const distance = fmtOdo(a.distanceTravelled);

  const isOT      = overtimeStatus === 'OVERTIME';
  const otLabel   = isOT ? 'LEMBUR'  : 'NORMAL';
  const otDesc    = isOT
    ? 'Di luar jam operasional (09:00 – 17:00)'
    : 'Dalam jam operasional (09:00 – 17:00)';
  const otBadge   = `<span class="badge badge--${isOT ? 'ot' : 'ok'}">${otLabel}</span>`;

  const startT = a.fullDay ? '00:00' : (a.startTime || '—');
  const endT   = a.fullDay ? '23:59' : (a.endTime   || '—');
  const fullDayNote = a.fullDay ? ' <span style="color:#5B5953;font-weight:400;">(Penuh Hari)</span>' : '';

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
    padding: 16mm 18mm 14mm;
    background: #fff;
    box-shadow: 0 6px 32px rgba(0,0,0,.16);
  }
}

/* ── Print ── */
@media print {
  body { background: #fff; }
  @page { size: A4 portrait; margin: 13mm 17mm 11mm; }
  .page { width: 100%; padding: 0; margin: 0; box-shadow: none; }
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
  padding-bottom: 10px;
  border-bottom: 2.5px solid #1A1917;
  margin-bottom: 14px;
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
  margin-top: 3px;
}
.doc-meta {
  text-align: right;
  font-size: 7.5pt;
  color: #5B5953;
  line-height: 2;
  white-space: nowrap;
  flex-shrink: 0;
}
.doc-meta strong { font-weight: 600; color: #1A1917; }

/* ── Form title ── */
.form-title-block {
  text-align: center;
  margin-bottom: 14px;
  padding-bottom: 11px;
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
  margin-top: 4px;
}

/* ── Section label ── */
.sec-label {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #5B5953;
  margin: 13px 0 7px;
  padding-bottom: 4px;
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
  padding: 7px 11px;
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
  margin-top: 3px;
}

/* ── Signature row ── */
.sig-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}
.sig-block {
  border: 1px solid #C9C6C0;
  border-radius: 4px;
  padding: 9px 11px 8px;
  text-align: center;
}
.sig-title {
  font-size: 7pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #5B5953;
  margin-bottom: 40px;
}
.sig-line {
  border-top: 1px solid #1A1917;
  padding-top: 5px;
}
.sig-name {
  font-size: 8.5pt;
  font-weight: 600;
  color: #1A1917;
}
.sig-role {
  font-size: 7.5pt;
  color: #5B5953;
  margin-top: 1px;
}

/* ── Attachment section ── */
.attach-section {
  margin-top: 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 86mm;
}
.attach-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 7px;
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
  min-height: 76mm;
  border: 1.5px dashed #94918B;
  border-radius: 6px;
  background: #FBFAF8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 18px;
}
.attach-icon { font-size: 26pt; opacity: 0.28; line-height: 1; }
.attach-hint {
  font-size: 8.5pt;
  color: #94918B;
  text-align: center;
  max-width: 300px;
  line-height: 1.55;
}
.attach-tags {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}
.attach-tag {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #5B5953;
  border: 1px solid #C9C6C0;
  border-radius: 2px;
  padding: 2px 8px;
  background: #fff;
}

/* ── Footer ── */
.doc-footer {
  margin-top: 11px;
  padding-top: 8px;
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
      <div>No. Dokumen: <strong>${esc(docRef)}</strong></div>
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
        <td class="td-val">${esc(String(a.pax || 1))} pax</td>
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

  <!-- ── C. Persetujuan ── -->
  <div class="sec-label">C. Persetujuan</div>
  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-title">Driver</div>
      <div class="sig-line"></div>
      <div class="sig-name">${esc(a.driver || '—')}</div>
      <div class="sig-role">Driver Operasional</div>
    </div>
    <div class="sig-block">
      <div class="sig-title">Mengetahui</div>
      <div class="sig-line"></div>
      <div class="sig-name">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div>
      <div class="sig-role">Kabid Sarana &amp; Prasarana</div>
    </div>
    <div class="sig-block">
      <div class="sig-title">Menyetujui</div>
      <div class="sig-line"></div>
      <div class="sig-name">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div>
      <div class="sig-role">Bendahara / Keuangan</div>
    </div>
  </div>

  <!-- ── D. Lampiran Bukti Pengeluaran ── -->
  <div class="attach-section">
    <div class="attach-header">
      <div class="attach-title">D. Lampiran Bukti Pengeluaran</div>
      <div class="attach-subtitle">Tempel bukti fisik pada area di bawah ini</div>
    </div>
    <div class="attach-area">
      <div class="attach-icon">📎</div>
      <div class="attach-hint">
        Tempel Bukti BBM, Tol, Parkir, atau Pengeluaran Operasional Lain pada Area Ini
      </div>
      <div class="attach-tags">
        <span class="attach-tag">BBM / Bensin</span>
        <span class="attach-tag">Tol</span>
        <span class="attach-tag">Parkir</span>
        <span class="attach-tag">Lain-lain</span>
      </div>
    </div>
  </div>

  <!-- ── Footer ── -->
  <div class="doc-footer">
    <span>PBSI Operations Platform v1.2.4 &mdash; Form Reimbursement Perjalanan Dinas</span>
    <span>${esc(docRef)}</span>
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
   PRINT LAUNCHER
   ──────────────────────────────────────────────────────────── */

/**
 * Open the reimbursement form in a new browser window.
 * The user then prints or saves as PDF from that window.
 *
 * @param {Object} assignment — Assignment object
 */
export function printReimbursementForm(assignment) {
  const html = generateReimbursementHTML(assignment);
  const win  = window.open(
    '',
    '_blank',
    'width=920,height=720,scrollbars=yes,resizable=yes'
  );

  if (!win) {
    /* Popup blocked — guide the user. */
    alert(
      'Pop-up diblokir oleh browser.\n\n' +
      'Izinkan pop-up untuk situs ini, lalu coba lagi.'
    );
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

console.info('Reimbursement module loaded');
