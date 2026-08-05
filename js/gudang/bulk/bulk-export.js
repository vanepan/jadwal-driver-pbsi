/* ============================================================
   BULK-EXPORT.JS — Warehouse Bulk Operations, Phase 4 (v1.29.4)

   Gudang has never had ANY export capability before this (confirmed by
   investigation — js/exports/export-registry.js is exclusively analytics-
   report-shaped, pre-computed per-domain models with no Gudang entry, and
   js/docs/ has no Gudang template; neither pipeline fits "export N raw
   selected catalog rows"). Rather than force this into either of those,
   this file mirrors the ONE precedent that DOES match the shape this
   needs — Overtime/Petty Cash's own Excel exporters, which each hand-
   build a workbook directly via xlsx-js-style, no shared builder to
   import — and reuses js/docs/pdf-exporter.js's PdfmakeBackend (+ a
   handful of js/docs/doc-theme.js's shared node builders) for PDF, since
   that IS a genuinely reusable primitive (Blob-out, backend-agnostic)
   that doesn't require registering a whole new TemplateRegistry entry
   for what is fundamentally a data-table dump, not a formal document.

   Routed through bulk-executor.js like every other bulk operation
   (Phase 9) even though "build one row" is synchronous, pure, and can
   never really fail for an item that still exists — consistency with
   the framework matters more here than the (negligible) overhead.
   ============================================================ */

'use strict';

import { categoryLabel } from '../config/gudang-categories.js';
import { getExporter } from '../../docs/pdf-exporter.js';
import { docHeader, headerRule, tableLayout, docFooter, TOKENS } from '../../docs/doc-theme.js';

const XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
let _xlsxPromise = null;
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(s);
  });
}
function loadXLSX() {
  if (window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = _loadScript(XLSX_SRC).then(() => {
    if (!window.XLSX) throw new Error('XLSX tidak tersedia setelah dimuat.');
    return window.XLSX;
  });
  return _xlsxPromise;
}

const COLUMNS = ['Nama', 'Tipe', 'Kategori', 'Lokasi', 'Alias', 'Status'];

function buildRow(item, st) {
  const loc = item.defaultLocationId ? st.data.locations.find((l) => l.locationId === item.defaultLocationId) : null;
  return {
    Nama: item.name,
    Tipe: item.itemType === 'asset' ? 'Asset' : 'Consumable',
    Kategori: item.category ? categoryLabel(item.category) : '',
    Lokasi: loc ? loc.name : '',
    Alias: (item.aliases || []).join(', '),
    Status: item.active ? 'Aktif' : 'Diarsipkan',
  };
}

/** @param {{data:{items:object[], locations:object[]}}} st
 *  @param {object[]} rows - mutated in place; one row pushed per successful id */
export function createBulkExportOperation(st, rows) {
  const itemsById = new Map(st.data.items.map((i) => [i.itemId, i]));
  return {
    async execute(itemId) {
      const item = itemsById.get(itemId);
      if (!item) return { ok: false, reason: 'Item tidak ditemukan (mungkin sudah dihapus).' };
      rows.push(buildRow(item, st));
      return { ok: true };
    },
  };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBulkExportCsv(rows, filename = 'gudang-export.csv') {
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => esc(r[c])).join(','))];
  // BOM so Excel opens UTF-8 (Indonesian diacritics/aliases) without mangling it.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  triggerBlobDownload(blob, filename);
}

export async function downloadBulkExportExcel(rows, filename = 'gudang-export.xlsx') {
  const XLSX = await loadXLSX();
  const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '9A1B2D' } } };
  const aoa = [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  COLUMNS.forEach((_, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) cell.s = headerStyle;
  });
  ws['!cols'] = COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gudang');
  XLSX.writeFile(wb, filename);
}

export async function downloadBulkExportPdf(rows, filename = 'gudang-export.pdf') {
  const body = [
    COLUMNS.map((c) => ({ text: c, style: 'th' })),
    ...rows.map((r) => COLUMNS.map((c) => ({ text: String(r[c] ?? ''), fontSize: 8.5 }))),
  ];
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [34, 34, 34, 40],
    content: [
      docHeader({ org: 'Bidang Sarana dan Prasarana', reference: 'Ekspor Katalog Gudang' }),
      headerRule(),
      { text: 'Ekspor Item Gudang', fontSize: 14, bold: true, margin: [0, 0, 0, 2] },
      { text: `${rows.length} item dipilih`, fontSize: 9, color: TOKENS.color.dim, margin: [0, 0, 0, 10] },
      { table: { headerRows: 1, widths: ['*', 60, 70, 70, '*', 55], body }, layout: tableLayout() },
    ],
    footer: docFooter({ label: 'Ekspor Gudang' }),
    defaultStyle: { fontSize: 9 },
    styles: { th: { bold: true, fontSize: 8.5, fillColor: '#F3F2EF' } },
  };
  const blob = await getExporter('pdfmake').exportToPdf(docDefinition);
  triggerBlobDownload(blob, filename);
}
