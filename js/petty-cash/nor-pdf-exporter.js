/* ============================================================
   NOR-PDF-EXPORTER.JS — public PDF surface for the NOR

   Thin orchestration over nor-document-engine.js (which itself
   reuses the shared Document Engine / pdfmake backend). Provides
   the two actions the UI needs — open-in-viewer and direct
   download — and records the export in the audit trail. No second
   PDF engine is introduced; this is a façade following the
   Analytics Export architecture.
   ============================================================ */

'use strict';

import { openNorDocument, generateNorBlob } from './nor-document-engine.js';
import { recordNorExport } from './petty-cash-service.js';

/** Open the NOR in the reusable document viewer (preview · print · share · save). */
export async function previewNorPdf(nor) {
  await openNorDocument(nor);
  try { await recordNorExport(nor.id, 'PDF'); } catch (e) { /* audit best-effort */ }
}

/** Trigger a direct browser download of the NOR PDF. */
export async function downloadNorPdf(nor) {
  const doc = await generateNorBlob(nor);
  const url = URL.createObjectURL(doc.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  try { await recordNorExport(nor.id, 'PDF'); } catch (e) { /* audit best-effort */ }
  return doc;
}
