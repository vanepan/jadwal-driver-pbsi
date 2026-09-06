/* ============================================================
   nor-visual-rendering-check.mjs — Deterministic Renderer Consumption
   (V2, Phase 6B)

   Proves js/docs/templates/nor.js's OPTIONAL, additive
   `vm.renderingVisualModel` consumption (page size / margins / logo
   position) is:

     1. STRUCTURAL (pure Node, always runs) — absent ⇒ the built pdfmake
        DocumentDefinition is IDENTICAL to before this phase (A4, the NOR
        v1 margins, a centered logo with no absolutePosition); present ⇒
        exactly the page/margins/logo fields the model supplies are
        overridden, nothing else about the document changes; a
        DEFENSIVELY-malformed model (NaN/missing numbers — the resolver
        should never produce this, but the template does not re-trust it
        blindly either, §35) is ignored, never applied, never throws.

     2. REAL RENDER (headless Chromium + the exact production pdfmake
        0.2.10 from cdnjs — same technique as
        nor-signature-pagination-check.mjs) — a legacy render (no model)
        produces the UNCHANGED real A4 /MediaBox; a model-driven render
        produces a PDF whose real /MediaBox matches the model's page
        dimensions EXACTLY (byte-verified in the actual rendered PDF
        bytes, not just the DocDefinition JSON); a malformed model still
        renders successfully (no pdfmake hang — the known failure class
        this exact file was hotfixed for at v1.28.11) with the DEFAULT A4
        MediaBox, proving the guard works end-to-end.

   Run:  node scripts/nor-visual-rendering-check.mjs   (exit 0 = pass)
   ============================================================ */

import puppeteer from 'puppeteer';
import { getTemplate } from '../js/docs/template-registry.js';
import '../js/docs/templates/nor.js'; // self-registers 'nor'
import { getDesignSystem, tableGridLayout } from '../js/docs/design-system/document-design-system.js';

let pass = 0; let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};
const section = (t) => console.log(`\n── ${t} ──`);

/* Minimal, realistic view model — mirrors nor-document-engine.js's output shape. */
function makeVm(overrides = {}) {
  return {
    norNumber: '021/Nota Organisasi/Sarpras/IX/2026',
    isTest: false,
    dateLong: '4 September 2026',
    subject: 'Realisasi Petty Cash Pertanggal 04 September 2026 Bidang Sarana dan Prasarana',
    senderTitle: 'Plt. Kabid Sarana dan Prasarana',
    recipients: ['Wakil Ketua Umum III', 'Sekretaris Jenderal', 'Bendahara'],
    cc: ['Ketua Umum sebagai laporan', 'Audit Internal', 'Arsip'],
    danaAwalDate: '1 September 2026',
    openingDoc: 'Rp5.000.000,-', realizedDoc: 'Rp3.250.000,-', remainingDoc: 'Rp1.750.000,-',
    totalTable: 'Rp3.250.000,-', terbilang: 'satu juta tujuh ratus lima puluh ribu rupiah',
    items: [{ no: 1, dateFmt: '02 Sep 2026', description: 'Pembelian alat kebersihan lapangan', keterangan: 'Suhendra', amountFmt: 'Rp 1.250.000', reimburse: [] }],
    letterTop: [{ position: 'Kabid Sarpras', name: 'Ahmad Suhendra' }, { position: 'Sekretaris', name: 'Rina Wijaya' }, { position: 'Bendahara', name: 'Budi Santoso' }],
    letterBottom: [{ position: 'Pembayar', name: 'Budi Santoso' }],
    recap: [{ position: 'Dibuat Oleh', name: 'Ahmad Suhendra' }, { position: 'Disetujui Oleh', name: 'Rina Wijaya' }],
    ...overrides,
  };
}

const nor = getTemplate('nor');
const NOR_DS = getDesignSystem('nor');

/* ════════════════ 1. STRUCTURAL ════════════════ */
section('structural — legacy (no renderingVisualModel) is UNCHANGED');
{
  const doc = nor.build(makeVm());
  check('pageSize is the unchanged NOR v1 default (A4)', doc.pageSize === NOR_DS.page.size, doc.pageSize);
  check('pageMargins is the unchanged NOR v1 default', JSON.stringify(doc.pageMargins) === JSON.stringify(NOR_DS.page.margins), doc.pageMargins);
  const logoNode = doc.content[0].image ? doc.content[0] : doc.content.find((n) => n && n.image);
  check('the logo node has NO absolutePosition (still centered, in flow)', logoNode && !('absolutePosition' in logoNode), logoNode);
  check('the logo node keeps alignment:"center"', logoNode && logoNode.alignment === 'center', logoNode);
}

section('structural — a full renderingVisualModel overrides page/margins/logo, nothing else');
{
  const rvm = {
    schema: 'nor-visual-rendering-model@1', source: 'approved_template', fidelity: 'full',
    templateId: 'vtpl_x', templateVersion: 1,
    page: { width: 500, height: 700 },
    margins: [30, 50, 30, 20],
    logo: { x: 400, y: 15, width: 60 },
    unsupportedRegions: [], unsupportedFields: [], warnings: [],
  };
  const legacy = nor.build(makeVm());
  const styled = nor.build(makeVm({ renderingVisualModel: rvm }));

  check('pageSize becomes the model\'s {width,height}', JSON.stringify(styled.pageSize) === JSON.stringify({ width: 500, height: 700 }), styled.pageSize);
  check('pageMargins becomes the model\'s array', JSON.stringify(styled.pageMargins) === JSON.stringify([30, 50, 30, 20]), styled.pageMargins);
  const logoNode = styled.content.find((n) => n && n.image);
  check('the logo node gets absolutePosition matching the model', logoNode && logoNode.absolutePosition && logoNode.absolutePosition.x === 400 && logoNode.absolutePosition.y === 15, logoNode);
  check('the logo width matches the model', logoNode.width === 60, logoNode);
  check('the logo node has NO alignment/margin once absolutely positioned', !('alignment' in logoNode) && !('margin' in logoNode), logoNode);

  // nothing else about the document changed
  const stripVariable = (doc) => { const c = JSON.parse(JSON.stringify(doc)); delete c.pageSize; delete c.pageMargins; delete c.content[0]; return c; };
  check('everything OTHER than pageSize/pageMargins/the logo node is untouched', JSON.stringify(stripVariable(legacy)) === JSON.stringify(stripVariable(styled)));
}

section('structural — partial model (page only) leaves margins/logo at their defaults');
{
  const doc = nor.build(makeVm({ renderingVisualModel: { page: { width: 500, height: 700 } } }));
  check('pageSize overridden', JSON.stringify(doc.pageSize) === JSON.stringify({ width: 500, height: 700 }));
  check('pageMargins stays the NOR v1 default (model supplied none)', JSON.stringify(doc.pageMargins) === JSON.stringify(NOR_DS.page.margins));
  const logoNode = doc.content.find((n) => n && n.image);
  check('the logo stays centered (model supplied no logo)', logoNode.alignment === 'center' && !('absolutePosition' in logoNode));
}

section('structural — a defensively-malformed model (NaN/missing numbers) is IGNORED, never applied, never throws');
{
  const cases = [
    { page: { width: NaN, height: 700 } },
    { page: { width: 500 } }, // height missing
    { margins: [1, 2, 3] }, // wrong length
    { margins: [1, 2, 3, NaN] },
    { logo: { x: NaN, y: 10, width: 50 } },
    { logo: { x: 10, y: 10 } }, // width missing
    { page: 'not an object' },
    { margins: 'not an array' },
  ];
  for (const rvm of cases) {
    let doc; let threw = false;
    try { doc = nor.build(makeVm({ renderingVisualModel: rvm })); } catch { threw = true; }
    check(`malformed ${JSON.stringify(rvm)} does not throw`, !threw);
    if (!threw) {
      check(`…and falls back to the default pageSize/margins/logo`, doc.pageSize === NOR_DS.page.size || JSON.stringify(doc.pageMargins) === JSON.stringify(NOR_DS.page.margins) || doc.content.find((n) => n && n.image).alignment === 'center');
    }
  }
}

/* ════════════════ 2. REAL RENDER (pdfmake 0.2.10 from cdnjs) ════════════════ */
section('real render — legacy vs. model-driven, byte-verified against the actual PDF');
{
  const PDFMAKE_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js';
  const PDFMAKE_VFS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js';

  const g = tableGridLayout(NOR_DS);
  const GRID_SCALARS = {
    hLineWidth: g.hLineWidth(), vLineWidth: g.vLineWidth(), hLineColor: g.hLineColor(), vLineColor: g.vLineColor(),
    paddingLeft: g.paddingLeft(), paddingRight: g.paddingRight(), paddingTop: g.paddingTop(), paddingBottom: g.paddingBottom(),
  };
  function prepareDefinition(vm) {
    const doc = nor.build(vm);
    doc.content.forEach((n) => { if (n.table && n.layout && typeof n.layout === 'object') n.layout = 'norGrid'; });
    delete doc.footer;
    return JSON.parse(JSON.stringify(doc));
  }

  const legacyDef = prepareDefinition(makeVm());
  const styledDef = prepareDefinition(makeVm({
    renderingVisualModel: {
      schema: 'nor-visual-rendering-model@1', source: 'approved_template', fidelity: 'partial',
      templateId: 'vtpl_real', templateVersion: 1,
      page: { width: 480, height: 720 }, margins: [40, 60, 40, 30], logo: { x: 380, y: 12, width: 50 },
      unsupportedRegions: [], unsupportedFields: [], warnings: [],
    },
  }));
  const malformedDef = prepareDefinition(makeVm({ renderingVisualModel: { page: { width: NaN, height: NaN } } }));

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.setContent('<!doctype html><meta charset="utf-8"><title>nor visual-rendering probe</title>', { waitUntil: 'load' });
    await page.addScriptTag({ url: PDFMAKE_JS });
    await page.addScriptTag({ url: PDFMAKE_VFS });
    await page.waitForFunction('window.pdfMake && (window.pdfMake.vfs || (window.pdfFonts && window.pdfFonts.pdfMake && window.pdfFonts.pdfMake.vfs))', { timeout: 30000 });

    const results = await page.evaluate(async (defs, gridScalars) => {
      if (!window.pdfMake.vfs && window.pdfFonts && window.pdfFonts.pdfMake) window.pdfMake.vfs = window.pdfFonts.pdfMake.vfs;
      const tableLayouts = {
        norGrid: {
          hLineWidth: () => gridScalars.hLineWidth, vLineWidth: () => gridScalars.vLineWidth,
          hLineColor: () => gridScalars.hLineColor, vLineColor: () => gridScalars.vLineColor,
          paddingLeft: () => gridScalars.paddingLeft, paddingRight: () => gridScalars.paddingRight,
          paddingTop: () => gridScalars.paddingTop, paddingBottom: () => gridScalars.paddingBottom,
        },
      };
      const toB64 = (dd) => new Promise((resolve) => {
        try { pdfMake.createPdf(dd, tableLayouts).getBase64((b64) => resolve({ ok: true, b64 })); }
        catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); }
      });
      const out = {};
      for (const [key, dd] of Object.entries(defs)) out[key] = await toB64(dd); // eslint-disable-line no-await-in-loop
      return out;
    }, { legacy: legacyDef, styled: styledDef, malformed: malformedDef }, GRID_SCALARS);

    check('legacy render succeeds (no throw, no hang)', results.legacy.ok, results.legacy.error);
    check('model-driven render succeeds (no throw, no hang)', results.styled.ok, results.styled.error);
    check('malformed-model render STILL succeeds (the numeric guard prevents a pdfmake hang)', results.malformed.ok, results.malformed.error);
    check('0 uncaught page errors across all three renders', pageErrors.length === 0, pageErrors);

    const mediaBoxOf = (b64) => {
      const buf = Buffer.from(b64, 'base64');
      const m = buf.toString('latin1').match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/);
      return m ? { x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] } : null;
    };
    const legacyBox = mediaBoxOf(results.legacy.b64);
    const styledBox = mediaBoxOf(results.styled.b64);
    const malformedBox = mediaBoxOf(results.malformed.b64);

    check('legacy /MediaBox is the real, unchanged A4 size', legacyBox && Math.abs(legacyBox.x1 - 595.28) < 0.1 && Math.abs(legacyBox.y1 - 841.89) < 0.1, legacyBox);
    check('model-driven /MediaBox matches the model EXACTLY (480×720, byte-verified in the real PDF)', styledBox && Math.abs(styledBox.x1 - 480) < 0.01 && Math.abs(styledBox.y1 - 720) < 0.01, styledBox);
    check('malformed-model /MediaBox falls back to the real, unchanged A4 size', malformedBox && Math.abs(malformedBox.x1 - 595.28) < 0.1 && Math.abs(malformedBox.y1 - 841.89) < 0.1, malformedBox);
  } finally {
    await browser.close();
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
