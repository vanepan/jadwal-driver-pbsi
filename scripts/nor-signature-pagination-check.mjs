/* nor-signature-pagination-check.mjs — v1.30.13.1 V1 hotfix regression

   Proves the NOR Petty Cash attachment can NEVER print a signature block
   split across a page boundary (SS3/SS4 defect): the labels / positions on
   one page and the signer names on the next.

   The fix (js/docs/templates/nor.js) marks every signature `columns` node
   `unbreakable: true` — pdfmake 0.2.10's keep-together primitive (the same
   one js/docs/templates/analytics-report.js already relies on). A block
   that no longer fits in the space left on the page moves WHOLE to the
   next page instead of being divided.

   Two layers of verification:

   1. STRUCTURAL (pure Node, always runs) — the built pdfmake
      DocumentDefinition carries `unbreakable: true` on all three signature
      rows (page-1 top grid, page-1 payer row, page-2 recap), and NOTHING
      ELSE about the document changed (logo, headings, hard page break,
      item-table geometry, signer content).

   2. REAL RENDER (headless Chromium + the exact production pdfmake 0.2.10
      from cdnjs) — render NORs whose item table spans 1 → many pages and,
      via pdfmake's own `pageBreakBefore` introspection hook, assert every
      signature row occupies exactly ONE page (`pageNumbers.length === 1`).
      A control run with `unbreakable` stripped proves the scenario really
      does split without the fix, so this test bites on a regression.

   Run: node scripts/nor-signature-pagination-check.mjs   (exit 0 = pass)
*/

import puppeteer from 'puppeteer';
import { getTemplate } from '../js/docs/template-registry.js';
import '../js/docs/templates/nor.js'; // self-registers 'nor'
import { getDesignSystem, tableGridLayout } from '../js/docs/design-system/document-design-system.js';
import { PBSI_LOGO_DATA_URI } from '../js/docs/templates/reimbursement-logo.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
};

/* ── View-model factory (mirrors nor-document-engine.js's output shape) ── */
function makeVm(itemCount, { bottom = true } = {}) {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    no: i + 1,
    dateFmt: `${String((i % 28) + 1).padStart(2, '0')} Sep 2026`,
    description: `Pengeluaran operasional baris ${i + 1} — perbaikan / pemeliharaan sarana`,
    keterangan: 'Suhendra',
    amountFmt: 'Rp 205.000',
    reimburse: [],
  }));
  return {
    norNumber: '207/Nota Organisasi/Sarpras/IX/2026',
    isTest: false,
    dateLong: '1 September 2026',
    subject: 'Realisasi Petty Cash Pertanggal 01 September 2026 Bidang Sarana dan Prasarana',
    senderTitle: 'Plt. Kabid Sarana dan Prasarana',
    recipients: ['Wakil Ketua Umum III', 'Sekretaris Jenderal', 'Bendahara'],
    cc: ['Ketua Umum sebagai laporan', 'Audit Internal', 'Arsip'],
    danaAwalDate: '7 Agustus 2026',
    openingDoc: '15.000.000,-', realizedDoc: '14.975.386,-', remainingDoc: '24.614,-',
    totalTable: 'Rp 14.975.386',
    terbilang: 'Dua Puluh Empat Ribu Enam Ratus Empat Belas Rupiah',
    items,
    letterTop: [
      { label: 'Diajukan oleh', position: 'Plt. Kabid Sarpras', name: 'Raras Ayu Pratama' },
      { label: 'Mengetahui dan Menyetujui', position: 'Wakil Ketua Umum III', name: 'Armand Darmadji' },
      { label: 'Mengetahui/Menyetujui', position: 'Sekretaris Jenderal', name: 'Ricky Soebagdja' },
    ],
    letterBottom: bottom ? [{ label: 'Dibayarkan oleh', position: 'Wakil Bendahara', name: 'Eddy Prayitno' }] : [],
    recap: [
      { label: 'Dibuat Oleh', position: 'Staf Sarana dan Prasarana', name: 'Grace Widelia' },
      { label: 'Disetujui Oleh', position: 'Plt. Kabid Sarana dan Prasarana', name: 'Raras Ayu Pratama' },
    ],
  };
}

const nor = getTemplate('nor');

/* Classify the three signature `columns` nodes inside a built definition. */
function sigKind(n) {
  if (!n || !Array.isArray(n.columns)) return null;
  const cols = n.columns;
  if (cols.length === 3 && cols.every(c => c && c.stack)) return 'sig-top';
  if (cols.length === 3 && cols[0] && cols[0].stack && cols[1] && !cols[1].stack) return 'sig-bottom';
  if (cols.length === 2 && cols.every(c => c && c.stack)) return 'sig-recap';
  return null;
}

/* ════════════════ 1. STRUCTURAL ════════════════ */
console.log('\n[structural] every signature row is marked unbreakable, nothing else changed');
{
  const doc = nor.build(makeVm(3));
  const sigs = doc.content.map((n, i) => ({ i, kind: sigKind(n), n })).filter(x => x.kind);
  const byKind = Object.fromEntries(sigs.map(x => [x.kind, x.n]));

  check('page-1 top signatory grid present', !!byKind['sig-top']);
  check('page-1 payer (bottom) row present', !!byKind['sig-bottom']);
  check('page-2 recap signatory row present', !!byKind['sig-recap']);
  check('page-1 top grid is unbreakable', byKind['sig-top'] && byKind['sig-top'].unbreakable === true);
  check('page-1 payer row is unbreakable', byKind['sig-bottom'] && byKind['sig-bottom'].unbreakable === true);
  check('page-2 recap row is unbreakable', byKind['sig-recap'] && byKind['sig-recap'].unbreakable === true);

  // Unbreakable is the ONLY signature-node change — signer content byte-identical.
  const recap = byKind['sig-recap'];
  check('recap col 0 still "Dibuat Oleh," / UPPERCASE position / underlined name',
    recap.columns[0].stack[0].text === 'Dibuat Oleh,' &&
    recap.columns[0].stack[1].text === 'STAF SARANA DAN PRASARANA' &&
    recap.columns[0].stack[3].text === 'Grace Widelia' && recap.columns[0].stack[3].decoration === 'underline');
  check('recap signing gap unchanged (38)', recap.columns[0].stack[2].margin[3] === 38);
  check('recap columnGap + margin unchanged (8 / [0,0,0,0])',
    recap.columnGap === 8 && JSON.stringify(recap.margin) === JSON.stringify([0, 0, 0, 0]));
  const top = byKind['sig-top'];
  check('top signing gap unchanged (40)', top.columns[0].stack[2].margin[3] === 40 && top.columns.every(c => c.stack[2].margin[3] === 40));
  check('top columnGap unchanged (8)', top.columnGap === 8);
  check('payer row keeps its [0,10,0,0] top margin', JSON.stringify(byKind['sig-bottom'].margin) === JSON.stringify([0, 10, 0, 0]));

  // Case 5 — the rest of the document is untouched.
  check('A4 portrait + historical margins [56,40,56,40]',
    doc.pageSize === 'A4' && doc.pageOrientation === 'portrait' &&
    JSON.stringify(doc.pageMargins) === JSON.stringify([56, 40, 56, 40]));
  check('the real embedded PBSI mark is still the first content node',
    doc.content[0].image === PBSI_LOGO_DATA_URI && doc.content[0].width === 56);
  check('"NOTA ORGANISASI" heading unchanged', doc.content[1].text === 'NOTA ORGANISASI');
  check('page-2 heading + hard page break unchanged',
    doc.content.some(n => n.text === 'RINCIAN PENGGUNAAN PETTY CASH' && n.pageBreak === 'before'));
  const itemTable = doc.content.find(n => n.table && Array.isArray(n.table.widths) && n.table.widths.length === 5);
  check('bordered item table geometry unchanged (5 cols, historical widths)',
    JSON.stringify(itemTable && itemTable.table.widths) === JSON.stringify([26, 70, '*', 92, 86]));
  check('item table still declares headerRows:1 (header repeats on every page)',
    itemTable && itemTable.table.headerRows === 1);
  check('no `unbreakable` leaked onto any non-signature content node',
    doc.content.every(n => sigKind(n) ? n.unbreakable === true : !('unbreakable' in n)));

  // Payer-less NOR (settings with ≤3 signatories) — still only the two rows, both unbreakable.
  const docNoBottom = nor.build(makeVm(3, { bottom: false }));
  const kindsNoBottom = docNoBottom.content.map(sigKind).filter(Boolean);
  check('payer-less NOR renders top + recap (no phantom payer row), both unbreakable',
    JSON.stringify(kindsNoBottom) === JSON.stringify(['sig-top', 'sig-recap']) &&
    docNoBottom.content.filter(n => sigKind(n)).every(n => n.unbreakable === true));
}

/* ════════════════ 2. REAL RENDER (pdfmake 0.2.10 from cdnjs) ════════════════ */
const PDFMAKE_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js';
const PDFMAKE_VFS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js';

/* GRID layout is constant-valued (see tableGridLayout) — flatten to scalars
   so the definition survives structured-clone into the page, then rebuild
   it there as a named tableLayout. */
const g = tableGridLayout(getDesignSystem('nor'));
const GRID_SCALARS = {
  hLineWidth: g.hLineWidth(), vLineWidth: g.vLineWidth(),
  hLineColor: g.hLineColor(), vLineColor: g.vLineColor(),
  paddingLeft: g.paddingLeft(), paddingRight: g.paddingRight(),
  paddingTop: g.paddingTop(), paddingBottom: g.paddingBottom(),
};

/** Build a clone-safe definition: tag signature nodes with an id, swap the
 *  table layout object for the name 'norGrid', drop the footer function. */
function prepareDefinition(vm, { str: stripUnbreakable = false } = {}) {
  const doc = nor.build(vm);
  doc.content.forEach((n) => {
    const kind = sigKind(n);
    if (kind) { n.id = kind; if (stripUnbreakable) delete n.unbreakable; }
    if (n.table && n.layout && typeof n.layout === 'object') n.layout = 'norGrid';
  });
  delete doc.footer; // renders inside the bottom page margin — irrelevant to content flow
  return JSON.parse(JSON.stringify(doc));
}

/* Sampled counts for the "with the fix" assertions (1 → 11 pages), plus a
   dense contiguous sweep for the control: a split only occurs in a narrow
   ~one-row band each time the recap block lands astride a page bottom, so
   the control must scan every integer across ~2 page cycles to land in one. */
const COUNTS_FIXED = [1, 20, 40, 60, 73, 90, 120, 200];
const SWEEP = Array.from({ length: 51 }, (_, i) => 50 + i); // 50..100 inclusive

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => { fail++; console.log('  ✗ pageerror: ' + e.message); });

  await page.setContent('<!doctype html><meta charset="utf-8"><title>nor render probe</title>', { waitUntil: 'load' });
  await page.addScriptTag({ url: PDFMAKE_JS });
  await page.addScriptTag({ url: PDFMAKE_VFS });
  await page.waitForFunction('window.pdfMake && (window.pdfMake.vfs || (window.pdfFonts && window.pdfFonts.pdfMake && window.pdfFonts.pdfMake.vfs))', { timeout: 30000 });

  const jobs = [];
  for (const c of COUNTS_FIXED) jobs.push({ count: c, mode: 'fixed', def: prepareDefinition(makeVm(c)) });
  for (const c of SWEEP) jobs.push({ count: c, mode: 'control', def: prepareDefinition(makeVm(c), { str: true }) });
  for (const c of SWEEP) jobs.push({ count: c, mode: 'sweep-fixed', def: prepareDefinition(makeVm(c)) });

  const results = await page.evaluate(async (jobs, gridScalars) => {
    if (!window.pdfMake.vfs && window.pdfFonts && window.pdfFonts.pdfMake) window.pdfMake.vfs = window.pdfFonts.pdfMake.vfs;
    const tableLayouts = {
      norGrid: {
        hLineWidth: () => gridScalars.hLineWidth, vLineWidth: () => gridScalars.vLineWidth,
        hLineColor: () => gridScalars.hLineColor, vLineColor: () => gridScalars.vLineColor,
        paddingLeft: () => gridScalars.paddingLeft, paddingRight: () => gridScalars.paddingRight,
        paddingTop: () => gridScalars.paddingTop, paddingBottom: () => gridScalars.paddingBottom,
      },
    };
    const out = [];
    for (const job of jobs) {
      const captured = {};
      let maxPage = 1;
      const dd = job.def;
      dd.pageBreakBefore = function (currentNode) {
        const pn = (currentNode && currentNode.pageNumbers) || [];
        pn.forEach(p => { if (p > maxPage) maxPage = p; });
        if (currentNode && typeof currentNode.id === 'string' && currentNode.id.indexOf('sig-') === 0) {
          captured[currentNode.id] = {
            pageNumbers: pn.slice(),
            startPage: currentNode.startPosition && currentNode.startPosition.pageNumber,
          };
        }
        return false; // observe only — never force a break
      };
      await new Promise((resolve, reject) => {
        try {
          pdfMake.createPdf(dd, tableLayouts).getBuffer(() => resolve());
        } catch (e) { reject(e); }
      });
      out.push({ count: job.count, mode: job.mode, captured, maxPage });
    }
    return out;
  }, jobs, GRID_SCALARS);

  const fixed = results.filter(r => r.mode === 'fixed');
  const control = results.filter(r => r.mode === 'control');
  const sweepFixed = new Map(results.filter(r => r.mode === 'sweep-fixed').map(r => [r.count, r]));

  console.log('\n[render] with the fix — every signature row occupies exactly one page');
  for (const r of fixed) {
    const recap = r.captured['sig-recap'];
    const top = r.captured['sig-top'];
    const bottom = r.captured['sig-bottom'];
    check(`items=${r.count} (${r.maxPage}pp): page-2 recap intact on one page (page ${recap && recap.pageNumbers.join(',')})`,
      !!recap && recap.pageNumbers.length === 1);
    check(`items=${r.count}: page-1 top grid intact on one page`, !!top && top.pageNumbers.length === 1);
    check(`items=${r.count}: page-1 payer row intact on one page`, !!bottom && bottom.pageNumbers.length === 1);
  }
  // Case 4 — the attachment really did span multiple pages in the big runs.
  const multi = fixed.filter(r => r.maxPage >= 3);
  check(`at least one rendered NOR was a genuine multi-page attachment (max pages: ${Math.max(...fixed.map(r => r.maxPage))})`,
    multi.length > 0 && multi.every(r => r.captured['sig-recap'].pageNumbers.length === 1));

  console.log('\n[render] control sweep (unbreakable stripped) — the split this fix prevents really happens');
  const controlSplits = control.filter(r => r.captured['sig-recap'] && r.captured['sig-recap'].pageNumbers.length >= 2);
  check(`without unbreakable, the recap block splits across a page boundary at item counts: ${controlSplits.map(r => r.count).join(', ') || '(none found in 50..100)'}`,
    controlSplits.length > 0);
  check('at each of those exact counts, the fix keeps the recap block whole on one page',
    controlSplits.length > 0 && controlSplits.every(r => {
      const f = sweepFixed.get(r.count);
      return f && f.captured['sig-recap'] && f.captured['sig-recap'].pageNumbers.length === 1;
    }));
  check('across the full 50..100 sweep, the fix never splits the recap block',
    [...sweepFixed.values()].every(r => r.captured['sig-recap'] && r.captured['sig-recap'].pageNumbers.length === 1));
} finally {
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
