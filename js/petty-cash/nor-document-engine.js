/* ============================================================
   NOR-DOCUMENT-ENGINE.JS — NOR domain → presentation view model

   Mirrors js/reimbursement.js: this module owns DOMAIN mapping
   (settings → signatories, cycle → opening date, money → terbilang)
   and builds a presentation-agnostic view model. Rendering, preview,
   print, download and share are delegated to the shared Document
   Engine (js/docs/*) — there is exactly one PDF engine on the
   platform and the NOR reuses it.
   ============================================================ */

'use strict';

import * as DocumentEngine from '../docs/doc-engine.js';
import '../docs/templates/nor.js'; // side-effect: registers 'nor'

import { getSettings, getCycles } from './petty-cash-store.js';
import {
  fmtLong, fmtShort, rpDoc, rpTable, terbilangCap, splitList,
} from './petty-cash-config.js';

/** Resolve the opening-balance date shown on the NOR ("Dana Awal (…)"). */
function danaAwalDate(nor) {
  if (nor.cycleId) {
    const c = getCycles().find(x => x.id === nor.cycleId);
    if (c && c.startDate) return fmtLong(c.startDate);
  }
  return fmtLong(nor.norDate);
}

/**
 * Build the view model consumed by the 'nor' template. Pure data —
 * no layout decisions, no DOM.
 */
export function buildNorViewModel(nor) {
  const settings = getSettings();
  const opening = nor.openingBalance || 0;
  const realized = nor.realizedAmount || 0;
  const remaining = nor.remainingBalance != null ? nor.remainingBalance : (opening - realized);

  const sigs = (settings.signatories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const recap = (settings.recapSignatories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  const items = (nor.items || []).map((it, i) => ({
    no: i + 1,
    dateFmt: fmtShort(it.expenseDate || it.date),
    description: it.description || it.desc || '',
    keterangan: it.keterangan || it.ket || '—',
    amountFmt: rpTable(it.amount || 0),
  }));

  return {
    norNumber: nor.norNumber,
    dateLong: fmtLong(nor.norDate),
    subject: nor.subject,
    senderTitle: settings.senderTitle,
    recipients: splitList(settings.recipients),
    cc: splitList(settings.ccRecipients),
    danaAwalDate: danaAwalDate(nor),
    openingDoc: rpDoc(opening),
    realizedDoc: rpDoc(realized),
    remainingDoc: rpDoc(remaining),
    totalTable: rpTable(realized),
    terbilang: terbilangCap(remaining),
    items,
    letterTop: sigs.slice(0, 3),
    letterBottom: sigs.slice(3),
    recap,
  };
}

/** Generate + open the NOR in the reusable document viewer (preview/print/PDF). */
export async function openNorDocument(nor) {
  const vm = buildNorViewModel(nor);
  return DocumentEngine.generateAndOpen('nor', vm, {
    viewer: {
      title: `Nota Organisasi — ${nor.norNumber}`,
      shareText: `NOR ${nor.norNumber} — ${nor.subject || ''}`,
    },
  });
}

/** Generate the NOR PDF blob without opening the viewer. */
export async function generateNorBlob(nor) {
  const vm = buildNorViewModel(nor);
  return DocumentEngine.generate('nor', vm);
}

export function closeNorViewer() { DocumentEngine.closeViewer(); }
