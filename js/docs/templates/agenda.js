/* ============================================================
   AGENDA.JS (template) — Agenda & To-Do operational PDF report
   (V1.31 Agenda & To-Do, Phase C4)

   Registers as 'agenda' in the shared template-registry.js — consumed
   through the SAME DocumentEngine/pdf-exporter/document-viewer pipeline
   every other document in this app uses (NOR, Analytics, Reimbursement).
   No second PDF engine, per this phase's own explicit instruction.

   Pure `build(vm)` — takes agenda-pdf-view-model.js#buildAgendaPdfViewModel()'s
   output verbatim. By the time this function runs, the SARPRAS identity
   transform has ALREADY happened (individual Sarpras-staff names do not
   exist in `vm` at all) — this file only ever renders what it's handed,
   it never re-derives or second-guesses an identity decision.
   ============================================================ */

'use strict';

import { register } from '../template-registry.js';
import { docHeader, headerRule, docFooter, tableLayout, A4_MARGINS, TOKENS } from '../doc-theme.js';

const STATUS_STYLE = {
  scheduled: { label: 'Terjadwal', color: TOKENS.color.ink },
  overdue: { label: 'Terlewat', color: '#A8292F', bold: true },
  cancelled: { label: 'Dibatalkan', color: TOKENS.color.dim, italics: true },
  in_progress: { label: 'Dalam Proses', color: TOKENS.color.ink },
  done: { label: 'Selesai', color: '#2F7D5B', bold: true },
};

function statusCell(status) {
  const s = STATUS_STYLE[status] || { label: status, color: TOKENS.color.ink };
  return { text: s.label, fontSize: 8, color: s.color, bold: !!s.bold, italics: !!s.italics };
}

/** "Tim Sarpras; Drs. Suryanto (Kabid); Sekjen PBSI" — the ONE place this
 *  template turns a transformed people-list back into readable prose. */
function peopleLine(item) {
  const parts = [];
  if (item.hasSarprasTeam) parts.push('Tim Sarpras');
  for (const p of item.people || []) {
    const picTag = p.isPic ? ' (PIC)' : '';
    const kabidTag = p.isKabid ? ' (Kabid)' : '';
    parts.push(`${p.name}${picTag}${kabidTag}`);
  }
  return parts.length ? parts.join('; ') : '—';
}

function emptyState(msg) {
  return { text: msg, italics: true, color: TOKENS.color.dim, fontSize: 8.5, margin: [0, 4, 0, 8] };
}

function sectionTitle(text) {
  return { text, style: 'secLabel' };
}

function summaryCards(summary) {
  const cell = (value, label) => ({
    table: { widths: ['*'], body: [
      [{ text: String(value), fontSize: 16, bold: true, alignment: 'center', color: TOKENS.color.accent, margin: [0, 4, 0, 0] }],
      [{ text: label, fontSize: 7, color: TOKENS.color.dim, alignment: 'center', margin: [0, 1, 0, 4] }],
    ] },
    layout: CARD_LAYOUT,
  });
  return {
    columns: [
      cell(summary.totalEvents, 'Total Agenda'),
      cell(summary.totalTasks, 'Total Tugas'),
      cell(summary.overdueTasks, 'Tugas Terlambat'),
      cell(summary.doneTasks, 'Tugas Selesai'),
    ],
    columnGap: 7,
    margin: [0, 4, 0, 8],
  };
}

function agendaTable(items) {
  if (!items.length) return emptyState('Tidak ada agenda pada rentang ini.');
  const head = [[
    { text: 'Tanggal', style: 'th' }, { text: 'Waktu', style: 'th' }, { text: 'Judul', style: 'th' },
    { text: 'Lokasi', style: 'th' }, { text: 'Penanggung Jawab', style: 'th' }, { text: 'Status', style: 'th' },
  ]];
  const rows = items.map((it) => ([
    { text: it.dateLabel, fontSize: 8 },
    { text: it.timeLabel, fontSize: 8 },
    { text: it.title, fontSize: 8.5, bold: true },
    { text: it.location, fontSize: 8 },
    { text: peopleLine(it), fontSize: 8 },
    statusCell(it.status),
  ]));
  return {
    table: { widths: [55, 68, '*', 68, 95, 52], headerRows: 1, body: [...head, ...rows] },
    layout: tableLayout(),
    margin: [0, 2, 0, 10],
  };
}

function taskTable(items) {
  if (!items.length) return emptyState('Tidak ada tugas pada rentang ini.');
  const head = [[
    { text: 'Tenggat', style: 'th' }, { text: 'Judul', style: 'th' }, { text: 'Prioritas', style: 'th' },
    { text: 'Penanggung Jawab', style: 'th' }, { text: 'Checklist', style: 'th' }, { text: 'Status', style: 'th' },
  ]];
  const rows = items.map((it) => ([
    { text: it.dueLabel, fontSize: 8 },
    { text: it.title, fontSize: 8.5, bold: true },
    { text: it.priority, fontSize: 8 },
    { text: peopleLine(it), fontSize: 8 },
    { text: it.checklistLabel || '—', fontSize: 8 },
    statusCell(it.status),
  ]));
  return {
    table: { widths: [55, '*', 48, 95, 45, 50], headerRows: 1, body: [...head, ...rows] },
    layout: tableLayout(),
    margin: [0, 2, 0, 10],
  };
}

function build(vm, ctx = {}) {
  const d = vm || {};
  const summary = d.summary || { totalEvents: 0, totalTasks: 0, overdueTasks: 0, doneTasks: 0 };
  const showAgenda = d.mode !== 'todo';
  const showTasks = d.mode !== 'agenda';

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: A4_MARGINS,
    info: { title: d.reportTitle || 'Laporan Agenda & To-Do', author: 'Sarpras Operations' },
    defaultStyle: { fontSize: 8.5, color: TOKENS.color.ink, lineHeight: 1.2 },
    styles: {
      secLabel: { fontSize: 10, bold: true, color: TOKENS.color.ink, margin: [0, 8, 0, 2] },
      th: { fontSize: 7.5, bold: true, color: TOKENS.color.dim, fillColor: TOKENS.color.fill },
    },
    footer: docFooter({ label: d.reportTitle || 'Laporan Agenda & To-Do' }),
    content: [
      docHeader({ org: d.org, printDate: d.generatedAtLabel }),
      headerRule(),
      { text: (d.reportTitle || 'LAPORAN AGENDA & TO-DO').toUpperCase(), fontSize: 14, bold: true, alignment: 'center', characterSpacing: 0.4 },
      { text: d.dateRangeLabel || '', fontSize: 9, color: TOKENS.color.dim, alignment: 'center', margin: [0, 2, 0, 2] },
      { text: `Digenerate pada: ${d.generatedAtLabel || '—'}`, fontSize: 7.5, color: TOKENS.color.faint, alignment: 'center', margin: [0, 0, 0, 4] },

      summaryCards(summary),

      ...(showAgenda ? [sectionTitle('Agenda'), agendaTable(d.agendaItems || [])] : []),
      ...(showTasks ? [sectionTitle('To-Do'), taskTable(d.taskItems || [])] : []),
    ],
  };
}

const CARD_LAYOUT = {
  hLineWidth: () => 1, vLineWidth: () => 1,
  hLineColor: () => TOKENS.color.line, vLineColor: () => TOKENS.color.line,
  paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 2, paddingBottom: () => 2,
};

register('agenda', {
  build,
  filename: (d) => {
    const safe = (s) => String(s || '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    return `Laporan-Agenda-${safe(d?.dateRangeLabel) || 'periode'}-${stamp}.pdf`;
  },
  meta: { title: 'Laporan Agenda & To-Do', label: 'Laporan Agenda & To-Do' },
});
