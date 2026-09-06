/* ============================================================
   nor-preview-render-check.mjs — V2 Phase 6C (§27)

   REAL PDF render of a Sarpras Intelligence NOR DRAFT PREVIEW, through the
   EXACT production pipeline:

     NorDraftRecord
       → src/intelligence/generation/nor-preview-view-model.js
           #buildIntelligenceNorViewModel
       → js/docs/templates/composer-document.js #build   (UNCHANGED renderer)
       → pdfmake 0.2.10 from cdnjs (headless Chromium)    (the ONE PDF engine)
       → real application/pdf bytes

   Two layers of evidence:

     A. THE BUILT DocumentDefinition (deterministic, always runs) — the
        preview marker, the preview-honest disclaimer, Perihal, the
        recipient WITH its "(diusulkan …)" disclosure, and body text are all
        present; the "…telah disetujui" disclaimer and any "Nomor:" /
        NOR-number node are absent.

     B. THE REAL RENDERED BYTES (headless Chromium + cdnjs pdfmake 0.2.10) —
        valid %PDF- structure + a page tree; deterministic-fallback render ⇒
        the real, unchanged composer A4 /MediaBox; an APPROVED-template
        renderingVisualModel ⇒ a /MediaBox that matches the model's page
        size EXACTLY (byte-verified); a defensively-malformed model still
        renders (no pdfmake hang) at the default A4 size; a long
        multi-paragraph body ⇒ a genuine multi-page PDF (Pages /Count ≥ 2).

   Rendered-byte TEXT is not asserted: production uses an embedded-subset
   Roboto whose content-stream glyph ids are not regex-recoverable to
   Unicode without the font cmap, and no PDF text/raster library is present
   in this environment (same constraint nor-visual-rendering-check.mjs
   documents — it verifies geometry only). Text is therefore verified at the
   DocumentDefinition layer (A). See §14 of
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_6C_NOR_PREVIEW.md.

   Run:  node scripts/nor-preview-render-check.mjs   (exit 0 = pass)
   ============================================================ */

import puppeteer from 'puppeteer';
import { getTemplate } from '../js/docs/template-registry.js';
import '../js/docs/templates/composer-document.js'; // self-registers 'composer-document'
import { buildIntelligenceNorViewModel } from '../src/intelligence/generation/nor-preview-view-model.js';

let pass = 0; let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};
const section = (t) => console.log(`\n── ${t} ──`);

const composer = getTemplate('composer-document');

function makeRecord(over = {}) {
  return {
    schema: 'intelligence-nor-draft@1', draftId: 'draft_preview_1', conversationId: 'c1', ownerId: 'u1',
    version: 2, status: 'requires_review', jenis: 'Pengadaan',
    subject: 'Pengadaan Kursi Rapat Lipat',
    recipient: 'Bendahara', recipientStatus: 'proposed',
    date: '2026-09-06',
    facts: { item: 'Kursi rapat lipat', quantity: '24', unit: 'unit', purpose: 'ruang rapat', budget: 'Rp 18.000.000' },
    body: 'Dengan hormat, bersama ini diajukan pengadaan kursi rapat lipat sebanyak 24 unit.',
    numbering: { suggestedNumber: '', publishedNumber: null, source: 'system_suggested', basis: null, confidence: 0 },
    provenance: { bodySource: 'template' }, humanEdited: false,
    auditTrail: [{ type: 'AI_DRAFT_CREATED', at: 't', actorId: 'u1', changedFields: [] }],
    createdAt: 't', updatedAt: 't', ...over,
  };
}

const APPROVED_RVM = {
  schema: 'nor-visual-rendering-model@1', source: 'approved_template', fidelity: 'full',
  templateId: 'vtpl_real', templateVersion: 1,
  page: { width: 500, height: 760 }, margins: [44, 56, 44, 40], logo: { x: 400, y: 16, width: 52 },
  unsupportedRegions: [], unsupportedFields: [], warnings: [],
};

const legacyVm = buildIntelligenceNorViewModel(makeRecord(), { renderingVisualModel: null });
const templatedVm = buildIntelligenceNorViewModel(makeRecord(), { renderingVisualModel: APPROVED_RVM });
const malformedVm = buildIntelligenceNorViewModel(makeRecord(), { renderingVisualModel: { page: { width: NaN, height: NaN }, margins: [1, 2], logo: { x: NaN } } });
const longBody = Array.from({ length: 14 }, (_, i) => `Alinea ${i + 1}. Isi paragraf pengadaan yang cukup panjang untuk mendorong dokumen melewati satu halaman A4 dengan margin komposer.`).join('\n\n');
const multiPageVm = buildIntelligenceNorViewModel(makeRecord({ body: longBody }), { renderingVisualModel: null });

/* ══════════ A. DocumentDefinition-level text evidence ══════════ */
function allText(node, acc = []) {
  if (node == null) return acc;
  if (Array.isArray(node)) { node.forEach((n) => allText(n, acc)); return acc; }
  if (typeof node === 'object') {
    if (typeof node.text === 'string') acc.push(node.text);
    else if (Array.isArray(node.text)) allText(node.text, acc);
    for (const k of ['content', 'stack', 'columns', 'ul', 'ol', 'table']) if (node[k]) allText(node[k], acc);
    if (node.body) allText(node.body, acc);
    return acc;
  }
  if (typeof node === 'string') acc.push(node);
  return acc;
}
section('A — the built DocumentDefinition carries the right text (deterministic)');
{
  const def = composer.build(legacyVm);
  const text = allText(def.content).join(' ‖ ');
  check('the "PRATINJAU — BUKAN DOKUMEN RESMI" marker node is present (§12)', /PRATINJAU\s*[—-]\s*BUKAN DOKUMEN RESMI/i.test(text), text.slice(0, 200));
  check('the preview-honest disclaimer ("MASIH DALAM PENINJAUAN") is present', /MASIH DALAM PENINJAUAN/i.test(text));
  check('the "…draf … yang telah disetujui" disclaimer is NOT present (§12)', !/yang telah disetujui/i.test(text));
  check('Perihal (subject) is present', /Kursi Rapat Lipat/i.test(text));
  check('the recipient is present WITH the proposed-recipient disclosure (§6)', /Bendahara/.test(text) && /diusulkan/i.test(text) && /belum dikonfirmasi/i.test(text));
  check('body text is present', /diajukan pengadaan kursi rapat lipat/i.test(text));
  check('NO "Nomor:" node and NO NOR-number-shaped string (§13)',
    !/Nomor\s*:/i.test(text) && !/\d{1,4}\s*\/\s*[A-Za-z.]+\s*\/.*\/\s*20\d\d/.test(text), text);
  check('the dateline reads "Jakarta, 6 September 2026"', /Jakarta,\s*6 September 2026/.test(text));
}

/* ══════════ B. real rendered bytes ══════════ */
function prep(vm) {
  const doc = composer.build(vm);
  doc.content.forEach((n) => { if (n && n.table && n.layout && typeof n.layout === 'object') n.layout = 'g'; });
  delete doc.footer; delete doc.header;
  return JSON.parse(JSON.stringify(doc));
}
function mediaBox(b64) {
  const s = Buffer.from(b64, 'base64').toString('latin1');
  const m = s.match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/);
  return m ? { x1: +m[3], y1: +m[4] } : null;
}
function pageCount(b64) {
  const s = Buffer.from(b64, 'base64').toString('latin1');
  const c = s.match(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/) || s.match(/\/Count\s+(\d+)/);
  const objs = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  return c ? Math.max(+c[1], objs) : objs;
}

const PDFMAKE_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js';
const PDFMAKE_VFS = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.setContent('<!doctype html><meta charset="utf-8"><title>nor preview render probe</title>', { waitUntil: 'load' });
  await page.addScriptTag({ url: PDFMAKE_JS });
  await page.addScriptTag({ url: PDFMAKE_VFS });
  await page.waitForFunction('window.pdfMake && (window.pdfMake.vfs || (window.pdfFonts && window.pdfFonts.pdfMake && window.pdfFonts.pdfMake.vfs))', { timeout: 30000 });

  const results = await page.evaluate(async (defs) => {
    if (!window.pdfMake.vfs && window.pdfFonts && window.pdfFonts.pdfMake) window.pdfMake.vfs = window.pdfFonts.pdfMake.vfs;
    const layouts = { g: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#ccc', vLineColor: () => '#ccc', paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 3, paddingBottom: () => 3 } };
    const toB64 = (dd) => new Promise((resolve) => {
      try { window.pdfMake.createPdf(dd, layouts).getBase64((b64) => resolve({ ok: true, b64 })); }
      catch (e) { resolve({ ok: false, error: String((e && e.message) || e) }); }
    });
    const out = {};
    for (const [k, dd] of Object.entries(defs)) out[k] = await toB64(dd); // eslint-disable-line no-await-in-loop
    return out;
  }, { legacy: prep(legacyVm), templated: prep(templatedVm), malformed: prep(malformedVm), multiPage: prep(multiPageVm) });

  section('B — every variant renders a real PDF (no throw, no pdfmake hang)');
  check('deterministic-fallback render succeeds', results.legacy.ok, results.legacy.error);
  check('approved-template render succeeds', results.templated.ok, results.templated.error);
  check('malformed-model render STILL succeeds (the Number.isFinite guard prevents a hang)', results.malformed.ok, results.malformed.error);
  check('multi-page render succeeds', results.multiPage.ok, results.multiPage.error);
  check('0 uncaught page errors', pageErrors.length === 0, pageErrors);

  section('B — valid PDF structure');
  for (const [k, r] of Object.entries(results)) {
    if (!r.ok) continue;
    check(`${k}: starts with %PDF-`, Buffer.from(r.b64, 'base64').slice(0, 5).toString('latin1') === '%PDF-');
    check(`${k}: has a /MediaBox + a page tree`, !!mediaBox(r.b64) && pageCount(r.b64) >= 1);
  }

  section('B — geometry: deterministic fallback vs approved template (byte-verified /MediaBox)');
  const legacyBox = mediaBox(results.legacy.b64);
  const tplBox = mediaBox(results.templated.b64);
  const malBox = mediaBox(results.malformed.b64);
  check('deterministic-fallback /MediaBox is the real, unchanged composer A4 (595.28 × 841.89)',
    legacyBox && Math.abs(legacyBox.x1 - 595.28) < 0.1 && Math.abs(legacyBox.y1 - 841.89) < 0.1, legacyBox);
  check('approved-template /MediaBox matches the model EXACTLY (500 × 760)',
    tplBox && Math.abs(tplBox.x1 - 500) < 0.01 && Math.abs(tplBox.y1 - 760) < 0.01, tplBox);
  check('malformed-model /MediaBox falls back to the real A4 size (no fabricated geometry)',
    malBox && Math.abs(malBox.x1 - 595.28) < 0.1 && Math.abs(malBox.y1 - 841.89) < 0.1, malBox);

  section('B — multi-page: a long body produces a genuine multi-page PDF (§27)');
  check('the multi-paragraph render has ≥ 2 pages', pageCount(results.multiPage.b64) >= 2, { pages: pageCount(results.multiPage.b64) });
  check('the short single-paragraph render is 1 page', pageCount(results.legacy.b64) === 1, { pages: pageCount(results.legacy.b64) });
} finally {
  await browser.close();
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
