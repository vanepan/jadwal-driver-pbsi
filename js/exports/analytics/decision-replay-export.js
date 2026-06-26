/* ============================================================
   DECISION-REPLAY-EXPORT.JS — Decision Replay & Explainable AI (v1.17.5)

   PDF + Excel export for a single Decision Replay. It REUSES the platform's
   existing export libraries — the pdfmake backend from js/docs/pdf-exporter.js
   and xlsx-js-style (the same loader the analytics + Petty Cash exporters use) —
   so no new exporter TYPE is introduced. It only PROJECTS the replay model the
   decision-replay-service produced into a pdfmake docDefinition and an XLSX
   workbook; it computes nothing.

   The document BUILDERS (buildDecisionReplayDocDefinition /
   buildDecisionReplaySheets) are PURE and node-testable (no DOM, no network).
   The *Blob functions wrap them with the lazy library loaders; the window.* hooks
   read the model the drawer publishes (window._lastDecisionReplayModel).

   No CSV (per spec).
   ============================================================ */

'use strict';

import { getExporter } from '../../docs/pdf-exporter.js';

/* ── xlsx-js-style lazy loader (mirrors dispatch-analytics-export) ─────────── */

const XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
let _xlsxPromise = null;
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
function loadXLSX() {
  if (typeof window !== 'undefined' && window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = _loadScript(XLSX_SRC).then(() => {
    if (!window.XLSX) throw new Error('XLSX global missing after load');
    return window.XLSX;
  });
  return _xlsxPromise;
}

/* ── formatting helpers (pure) ────────────────────────────────────────────── */

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return `${dd} ${mo} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function safeFilename(base, id) {
  const stamp = new Date().toISOString().slice(0, 10);
  const tail = id ? `-${String(id).replace(/[^a-z0-9]/gi, '').slice(0, 12)}` : '';
  return `${base}${tail}-${stamp}`;
}
function sign(n) { const x = Math.round(Number(n) || 0); return `${x >= 0 ? '+' : ''}${x}`; }

/* ── PDF docDefinition (pure) ─────────────────────────────────────────────── */

const ACCENT = '#A8292F';

function sectionHeader(text) { return { text, style: 'h2', margin: [0, 13, 0, 5] }; }

function simpleTable(headers, rows, widths) {
  return {
    table: {
      headerRows: headers ? 1 : 0,
      widths: widths || (headers || rows[0] || ['*']).map(() => '*'),
      body: [
        ...(headers ? [headers.map((h) => ({ text: h, style: 'th' }))] : []),
        ...(rows.length ? rows : [[{ text: '—', style: 'td' }]]).map((r) => r.map((c) => (typeof c === 'object' ? c : { text: String(c), style: 'td' }))),
      ],
    },
    layout: {
      hLineWidth: (i) => (i === (headers ? 1 : 0) ? 1 : 0.5),
      hLineColor: () => '#d9d9de',
      vLineWidth: () => 0,
      paddingTop: () => 3, paddingBottom: () => 3,
    },
  };
}

/**
 * Build the pdfmake docDefinition for a Decision Replay.
 * @param {Object} model  buildDecisionReplay() result
 * @param {Object} [meta] { generatedBy, appVersion }
 * @returns {Object} pdfmake docDefinition
 */
export function buildDecisionReplayDocDefinition(model, meta = {}) {
  const m = model || {};
  const rec = m.recommendation || {};
  const conf = m.confidence || {};
  const content = [];

  content.push({ text: 'Decision Replay — Explainable AI', style: 'h1' });
  content.push({
    text: [
      m.requestId ? `Request ${m.requestId} · ` : '',
      `${rec.driver || '—'} + ${rec.vehicle || '—'} · `,
      `Skor ${rec.dispatchScore || 0} · ${conf.label || ''} (${conf.stars || 0}★)`,
      meta.generatedBy ? ` · oleh ${meta.generatedBy}` : '',
    ].join(''),
    style: 'meta', margin: [0, 2, 0, 4],
  });

  // Feature 1 — Decision Replay
  content.push(sectionHeader('Decision Replay'));
  content.push(simpleTable(['Tahap', 'Detail'],
    (m.replayStages || []).map((s) => [s.label, s.detail || '—']), ['38%', '*']));

  // Feature 2 — Why Driver
  if (m.whyDriver) {
    content.push(sectionHeader(`Mengapa Driver: ${m.whyDriver.name} (${m.whyDriver.score})`));
    content.push(simpleTable(null,
      (m.whyDriver.reasons || []).map((r) => [`${r.ok ? '✓' : '✕'} ${r.text}`]), ['*']));
    content.push({ text: (m.whyDriver.subScores || []).map((s) => `${s.label}: ${s.score}`).join('  ·  '), style: 'meta', margin: [0, 3, 0, 0] });
  }

  // Feature 3 — Why Not Other Drivers
  const wnd = m.whyNotDrivers || {};
  if (wnd.recommended && (wnd.others || []).length) {
    content.push(sectionHeader('Mengapa Bukan Driver Lain?'));
    content.push(simpleTable(['Kandidat', 'Skor', 'Selisih', 'Rincian'],
      wnd.others.map((o) => [o.name, String(o.score), sign(o.finalDifference),
        o.differences.map((d) => `${d.label} ${sign(d.delta)}`).join(', ')]), ['*', 35, 45, '45%']));
  }

  // Feature 4 — Why Vehicle
  if (m.whyVehicle) {
    content.push(sectionHeader(`Mengapa Kendaraan: ${m.whyVehicle.name} (${m.whyVehicle.score})`));
    content.push(simpleTable(null,
      (m.whyVehicle.reasons || []).map((r) => [`${r.ok ? '✓' : '✕'} ${r.text}`]), ['*']));
    content.push({ text: (m.whyVehicle.subScores || []).map((s) => `${s.label}: ${s.score}`).join('  ·  '), style: 'meta', margin: [0, 3, 0, 0] });
  }
  const wnv = m.whyNotVehicles || {};
  if (wnv.recommended && (wnv.others || []).length) {
    content.push(sectionHeader('Mengapa Bukan Kendaraan Lain?'));
    content.push(simpleTable(['Kandidat', 'Skor', 'Selisih', 'Rincian'],
      wnv.others.map((o) => [o.name, String(o.score), sign(o.finalDifference),
        o.differences.map((d) => `${d.label} ${sign(d.delta)}`).join(', ')]), ['*', 35, 45, '45%']));
  }

  // Feature 5 — Score Breakdown
  const bd = m.scoreBreakdown;
  if (bd) {
    content.push(sectionHeader('Komposisi Skor'));
    content.push(simpleTable(['Komponen', 'Skor', 'Bobot', 'Kontribusi'],
      bd.rows.map((r) => [r.label, String(r.score), `${r.weightPct}%`, `+${r.points}`]).concat([[{ text: 'Total', style: 'th' }, '', '', { text: String(bd.total), style: 'th' }]]),
      ['*', 50, 50, 60]));
  }

  // Feature 6 — Policy Evaluation
  const p = m.policy || {};
  content.push(sectionHeader('Evaluasi Policy'));
  content.push(simpleTable(['Aspek', 'Nilai'], [
    ['Mode Medis', p.medicalMode ? 'Ya' : 'Tidak'],
    ['Driver Diperlukan', p.driverRequired ? 'Ya' : 'Tidak (Tanpa Driver)'],
    ['Driver Eligible', String(p.driverEligible || 0)],
    ['Kendaraan Eligible', String(p.vehicleEligible || 0)],
    ...((p.filteredReasons || []).map((r) => [r.label, `Dikecualikan ×${r.count}`])),
  ], ['*', 140]));

  // Feature 9 — Candidate Ranking
  content.push(sectionHeader('Peringkat Kandidat'));
  content.push(simpleTable(['#', 'Driver', 'Kendaraan', 'Driver', 'Kend.', 'Dispatch', 'Status'],
    (m.ranking || []).map((r) => [String(r.rank), r.driverName || '—', r.vehicleName || '—',
      String(r.driverScore), String(r.vehicleScore), String(r.score),
      r.recommended ? 'Rekomendasi' : (r.valid ? 'Valid' : 'Tidak Valid')]),
    [18, '*', '*', 38, 35, 48, 60]));

  // Feature 8 — Override Analysis
  const ov = m.override || {};
  if (ov.decided || ov.overridden) {
    content.push(sectionHeader('Analisis Override Admin'));
    content.push(simpleTable(['Aspek', 'Nilai'], [
      ['Rekomendasi AI', `${ov.recommended.driver || '—'} · ${ov.recommended.vehicle || '—'}`],
      ['Pilihan Admin', `${ov.selected.driver || '—'} · ${ov.selected.vehicle || '—'}`],
      ['Hasil', ov.severityLabel || '—'],
      ['Severity', ov.severityLabel || '—'],
      ['Selisih Skor', sign(ov.scoreDifference)],
      ['Alasan', ov.reason || '—'],
      ['Dicatat', fmtTime(ov.timestamp)],
    ], ['*', 160]));
  }

  // Feature 11 — Timeline
  content.push(sectionHeader('Linimasa'));
  content.push(simpleTable(['Waktu', 'Peristiwa', 'Status'],
    (m.timeline || []).map((e) => [e.time || '—', e.label, e.done ? '✓' : '…']), [60, '*', 45]));

  return {
    pageSize: 'A4',
    pageMargins: [34, 36, 34, 40],
    info: { title: 'Decision Replay' },
    content,
    styles: {
      h1: { fontSize: 16, bold: true, color: ACCENT },
      h2: { fontSize: 11, bold: true, color: '#222' },
      meta: { fontSize: 8, color: '#666' },
      th: { fontSize: 8, bold: true, color: '#444', fillColor: '#f4f4f6' },
      td: { fontSize: 8, color: '#222' },
    },
    defaultStyle: { fontSize: 9 },
    footer: (current, total) => ({ text: `Decision Replay · ${meta.appVersion || ''} · ${current}/${total}`, style: 'meta', alignment: 'center', margin: [0, 8, 0, 0] }),
  };
}

/* ── Excel workbook (pure sheet builder) ──────────────────────────────────── */

/**
 * Build the Decision Replay workbook as an array of { name, aoa } sheets.
 * Pure (no XLSX dependency) → node-testable.
 * @param {Object} model
 * @returns {Array<{name:string, aoa:Array<Array<string|number>>}>}
 */
export function buildDecisionReplaySheets(model) {
  const m = model || {};
  const rec = m.recommendation || {};
  const conf = m.confidence || {};
  const p = m.policy || {};
  const ov = m.override || {};
  const sheets = [];

  sheets.push({ name: 'Ringkasan', aoa: [
    ['Decision Replay — Explainable AI'],
    ['Request', m.requestId || ''],
    ['Driver', rec.driver || ''],
    ['Kendaraan', rec.vehicle || ''],
    ['Skor Dispatch', rec.dispatchScore || 0],
    ['Confidence', `${conf.label || ''} (${conf.stars || 0}★)`],
    ['Dibuat', fmtTime(m.generatedAt)],
  ] });

  sheets.push({ name: 'Replay', aoa: [
    ['Tahap', 'Detail', 'Selesai'],
    ...(m.replayStages || []).map((s) => [s.label, s.detail || '', s.done ? 'Ya' : 'Tidak']),
  ] });

  const whyRows = [['Sisi', 'Pemeriksaan', 'OK']];
  (m.whyDriver ? m.whyDriver.reasons : []).forEach((r) => whyRows.push(['Driver', r.text, r.ok ? 'Ya' : 'Tidak']));
  (m.whyVehicle ? m.whyVehicle.reasons : []).forEach((r) => whyRows.push(['Kendaraan', r.text, r.ok ? 'Ya' : 'Tidak']));
  sheets.push({ name: 'Mengapa', aoa: whyRows });

  if (m.scoreBreakdown) {
    sheets.push({ name: 'Komposisi Skor', aoa: [
      ['Komponen', 'Skor', 'Bobot (%)', 'Kontribusi'],
      ...m.scoreBreakdown.rows.map((r) => [r.label, r.score, r.weightPct, r.points]),
      ['Total', '', '', m.scoreBreakdown.total],
    ] });
  }

  // Why-not comparisons (drivers + vehicles)
  const cmpRows = [['Sisi', 'Pemenang', 'Kandidat', 'Selisih Akhir', 'Rincian']];
  const wnd = m.whyNotDrivers || {};
  (wnd.others || []).forEach((o) => cmpRows.push(['Driver', wnd.recommended ? wnd.recommended.name : '', o.name, o.finalDifference, o.differences.map((d) => `${d.label} ${sign(d.delta)}`).join('; ')]));
  const wnv = m.whyNotVehicles || {};
  (wnv.others || []).forEach((o) => cmpRows.push(['Kendaraan', wnv.recommended ? wnv.recommended.name : '', o.name, o.finalDifference, o.differences.map((d) => `${d.label} ${sign(d.delta)}`).join('; ')]));
  sheets.push({ name: 'Perbandingan', aoa: cmpRows });

  sheets.push({ name: 'Policy', aoa: [
    ['Aspek', 'Nilai'],
    ['Mode Medis', p.medicalMode ? 'Ya' : 'Tidak'],
    ['Driver Diperlukan', p.driverRequired ? 'Ya' : 'Tidak'],
    ['Driver Eligible', p.driverEligible || 0],
    ['Kendaraan Eligible', p.vehicleEligible || 0],
    [],
    ['Dikecualikan', 'Jumlah'],
    ...((p.filteredReasons || []).map((r) => [r.label, r.count])),
  ] });

  sheets.push({ name: 'Peringkat', aoa: [
    ['#', 'Driver', 'Kendaraan', 'Skor Driver', 'Skor Kendaraan', 'Skor Dispatch', 'Valid', 'Rekomendasi'],
    ...(m.ranking || []).map((r) => [r.rank, r.driverName, r.vehicleName, r.driverScore, r.vehicleScore, r.score, r.valid ? 'Ya' : 'Tidak', r.recommended ? 'Ya' : '']),
  ] });

  sheets.push({ name: 'Override', aoa: [
    ['Aspek', 'Nilai'],
    ['Diputuskan', ov.decided ? 'Ya' : 'Tidak'],
    ['Override', ov.overridden ? 'Ya' : 'Tidak'],
    ['Rekomendasi AI', `${ov.recommended ? (ov.recommended.driver || '') : ''} · ${ov.recommended ? (ov.recommended.vehicle || '') : ''}`],
    ['Pilihan Admin', `${ov.selected ? (ov.selected.driver || '') : ''} · ${ov.selected ? (ov.selected.vehicle || '') : ''}`],
    ['Hasil / Severity', ov.severityLabel || ''],
    ['Selisih Skor', ov.scoreDifference || 0],
    ['Alasan', ov.reason || ''],
    ['Dicatat', fmtTime(ov.timestamp)],
  ] });

  sheets.push({ name: 'Linimasa', aoa: [
    ['Waktu', 'Peristiwa', 'Selesai'],
    ...(m.timeline || []).map((e) => [e.time || '', e.label, e.done ? 'Ya' : 'Tidak']),
  ] });

  return sheets;
}

/* ── Blob wrappers (browser only) ─────────────────────────────────────────── */

export async function exportDecisionReplayPdf(model, meta = {}) {
  const docDef = buildDecisionReplayDocDefinition(model, meta);
  const blob = await getExporter('pdfmake').exportToPdf(docDef);
  return { blob, filename: `${safeFilename('decision-replay', model && model.requestId)}.pdf` };
}

export async function exportDecisionReplayExcel(model, meta = {}) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const sheet of buildDecisionReplaySheets(model)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, filename: `${safeFilename('decision-replay', model && model.requestId)}.xlsx` };
}

/* ── window hooks (read the model the drawer publishes) ────────────────────── */

if (typeof window !== 'undefined') {
  window.exportDecisionReplayPdf = (meta = {}) => {
    const m = window._lastDecisionReplayModel;
    if (!m) throw new Error('Buka Decision Replay dulu agar model tersedia.');
    return exportDecisionReplayPdf(m, { ...(window._decisionReplayMeta || {}), ...meta });
  };
  window.exportDecisionReplayExcel = (meta = {}) => {
    const m = window._lastDecisionReplayModel;
    if (!m) throw new Error('Buka Decision Replay dulu agar model tersedia.');
    return exportDecisionReplayExcel(m, { ...(window._decisionReplayMeta || {}), ...meta });
  };
}
