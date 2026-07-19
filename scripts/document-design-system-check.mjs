/* document-design-system-check.mjs — Phase 12, Sprint 12.1
   (Document Design System foundation).

   The Phase 12 directive ("DOCUMENT DESIGN SYSTEM") requires that the
   visual appearance of every document NEVER be hardcoded — layout must
   come from one governed, versioned, explainable source of truth, and
   introducing it must change ZERO pixels of any document shipping today.

   This harness proves exactly that:

     1. REGISTRY / RESOLVER — ids resolve, the latest version is the
        default, a pinned version resolves, and an unknown id/version
        THROWS (never a silent fallback — "Nothing changes silently").
     2. IMMUTABILITY — descriptors are deep-frozen; a template can never
        mutate the shared source of truth.
     3. PROVENANCE — every descriptor is explainable back to where its
        values came from.
     4. BYTE-IDENTICAL SEED — the design systems reproduce, value-for-
        value, the exact numbers the code hardcoded before this sprint.
     5. PURE BUILDERS — pageGeometry()/tableGridLayout() emit the right
        pdfmake fragments.
     6. doc-theme.js is now DERIVED from the design system (same object,
        not a copy) yet every exported constant is still byte-identical.
     7. The real production templates (nor / composer-document) render
        their geometry/colours/grid/widths straight from the design
        system, unchanged from the historical literals.

   Run: node scripts/document-design-system-check.mjs   (exit 0 = pass) */

import {
  getDesignSystem, listDesignSystems, latestVersion, listVersions,
  designProvenance, pageGeometry, tableGridLayout,
} from '../js/docs/design-system/document-design-system.js';
import * as docTheme from '../js/docs/doc-theme.js';
import '../js/docs/templates/nor.js';               // self-registers 'nor'
import '../js/docs/templates/composer-document.js'; // self-registers 'composer-document'
import { getTemplate } from '../js/docs/template-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function threw(fn) { try { fn(); return false; } catch { return true; } }

console.log('\n[1] Registry / resolver — versioned, explicit, never a silent fallback');
{
  check('all three seed design systems are registered', eq(listDesignSystems().sort(), ['composer', 'nor', 'operational']));
  check('getDesignSystem(id) returns the latest version', getDesignSystem('nor').version === latestVersion('nor'));
  check('latestVersion("nor") is 1', latestVersion('nor') === 1);
  check('listVersions("operational") is [1]', eq(listVersions('operational'), [1]));
  check('a pinned version resolves to the same descriptor as the default', getDesignSystem('nor', 1) === getDesignSystem('nor'));
  check('an unknown id THROWS (not undefined)', threw(() => getDesignSystem('does-not-exist')));
  check('an unknown VERSION THROWS — archived docs never inherit a redesign silently', threw(() => getDesignSystem('nor', 99)));
  check('latestVersion of an unknown id throws', threw(() => latestVersion('nope')));
}

console.log('\n[2] Immutability — the shared source of truth cannot be mutated by a consumer');
{
  const nor = getDesignSystem('nor');
  check('descriptor is deep-frozen', Object.isFrozen(nor) && Object.isFrozen(nor.page) && Object.isFrozen(nor.page.margins));
  check('mutating a nested layout value throws (frozen)', threw(() => { nor.page.margins[0] = 0; }));
  check('mutating a colour throws (frozen)', threw(() => { nor.color.ink = '#fff'; }));
}

console.log('\n[3] Provenance — every layout decision is explainable');
{
  for (const id of listDesignSystems()) {
    const ds = getDesignSystem(id);
    check(`"${id}" carries a non-empty label, provenance and version`,
      !!ds.label && typeof ds.provenance === 'string' && ds.provenance.length > 20 && ds.version === 1);
  }
  const line = designProvenance(getDesignSystem('nor'));
  check('designProvenance() explains the resolved layout (label + "layout v1")', /layout v1/.test(line) && line.includes('PBSI NOR'));
}

console.log('\n[4] Byte-identical seed — reproduces the exact pre-sprint hardcoded values');
{
  const op = getDesignSystem('operational');
  check('operational page margins == the historical A4_MARGINS [48,37,48,31]', eq(op.page.margins, [48, 37, 48, 31]));
  check('operational contentWidth == 499, mmToPt == 2.834645', op.page.contentWidth === 499 && op.unit.mmToPt === 2.834645);
  check('operational palette == the historical TOKENS.color', eq(op.color, {
    ink: '#1A1917', dim: '#5B5953', faint: '#94918B', ghost: '#C0C0C0',
    line: '#C9C6C0', lineSoft: '#E2DFD9', fill: '#F7F6F3', accent: '#A8292F',
  }));
  check('operational default type == the historical DEFAULT_STYLE', eq(op.typography.default, { fontSize: 8.5, color: '#1A1917', lineHeight: 1.2 }));
  check('operational title/subtitle/secLabel/th == the historical BASE_STYLES', eq({
    title: op.typography.title, subtitle: op.typography.subtitle, secLabel: op.typography.secLabel, th: op.typography.th,
  }, {
    title: { fontSize: 15, bold: true, alignment: 'center' },
    subtitle: { fontSize: 8, color: '#5B5953', alignment: 'center' },
    secLabel: { fontSize: 7.5, bold: true, color: '#5B5953', margin: [0, 8, 0, 4] },
    th: { fontSize: 7, bold: true, color: '#5B5953', fillColor: '#F7F6F3' },
  }));

  const nor = getDesignSystem('nor');
  check('nor page margins == the historical [56,40,56,40]', eq(nor.page.margins, [56, 40, 56, 40]));
  check('nor colours == the historical INK/DIM', nor.color.ink === '#000000' && nor.color.dim === '#3a3a3a');
  check('nor default type == the historical {10,#000000,1.3}', eq(nor.typography.default, { fontSize: 10, color: '#000000', lineHeight: 1.3 }));
  check('nor rincian grid == the historical 1pt ink borders / 4·2 padding', eq(nor.table, {
    hLineWidth: 1, vLineWidth: 1, lineColor: '#000000', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2,
  }));
  check('nor column widths == the historical literals', eq(nor.layout, {
    metaWidths: [96, 10, '*'],
    balanceWidthsPage1: [206, 30, 104],
    balanceWidthsPage2: [216, 30, 104],
    itemTableWidths: [26, 70, '*', 92, 86],
  }));
  check('nor heading sizes == the historical 13 / 11', nor.typography.documentTitle.fontSize === 13 && nor.typography.sectionHeading.fontSize === 11);

  const comp = getDesignSystem('composer');
  check('composer page margins == the historical [48,37,48,48]', eq(comp.page.margins, [48, 37, 48, 48]));
  check('composer logo width == the historical 48', comp.logo.width === 48);
}

console.log('\n[5] Pure builders emit the right pdfmake fragments');
{
  check('pageGeometry(nor) == {A4, portrait, [56,40,56,40]}', eq(pageGeometry(getDesignSystem('nor')), {
    pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [56, 40, 56, 40],
  }));
  const norGrid = tableGridLayout(getDesignSystem('nor'));
  check('tableGridLayout(nor) borders are 1pt ink', norGrid.hLineWidth() === 1 && norGrid.vLineWidth() === 1 && norGrid.hLineColor() === '#000000' && norGrid.vLineColor() === '#000000');
  check('tableGridLayout(nor) padding is 4·4·2·2', norGrid.paddingLeft() === 4 && norGrid.paddingRight() === 4 && norGrid.paddingTop() === 2 && norGrid.paddingBottom() === 2);
  const opGrid = tableGridLayout(getDesignSystem('operational'));
  check('tableGridLayout(operational) is 0.5pt lineSoft / 6·3 padding', opGrid.hLineWidth() === 0.5 && opGrid.hLineColor() === '#E2DFD9' && opGrid.paddingLeft() === 6 && opGrid.paddingTop() === 3);
}

console.log('\n[6] doc-theme.js is now DERIVED from the design system — same object, byte-identical values');
{
  const op = getDesignSystem('operational');
  check('A4_MARGINS IS the design system\'s array (single source, not a copy)', docTheme.A4_MARGINS === op.page.margins);
  check('CONTENT_W / MM are derived and equal', docTheme.CONTENT_W === op.page.contentWidth && docTheme.MM === op.unit.mmToPt);
  check('TOKENS.color IS the design system\'s palette', docTheme.TOKENS.color === op.color);
  check('DEFAULT_STYLE IS the design system\'s default type', docTheme.DEFAULT_STYLE === op.typography.default);
  check('BASE_STYLES are the design system\'s named type roles', docTheme.BASE_STYLES.title === op.typography.title && docTheme.BASE_STYLES.th === op.typography.th);
  const tl = docTheme.tableLayout();
  check('tableLayout() still emits the historical 0.5pt lineSoft / 6·3 layout', tl.hLineWidth() === 0.5 && tl.hLineColor() === '#E2DFD9' && tl.paddingLeft() === 6 && tl.paddingBottom() === 3);
  // The still-hardcoded-nowhere values the primitives already lock (orgLogo/signatureBlock)
  check('orgLogo() default width/margin still come out 56 / [0,0,0,6]', docTheme.orgLogo().width === 56 && eq(docTheme.orgLogo().margin, [0, 0, 0, 6]));
}

console.log('\n[7] Real production templates render geometry/colours/grid straight from the design system');
{
  const nor = getTemplate('nor');
  const vm = {
    norNumber: '154/NO/Sarpras/I/2026', dateLong: '19 Januari 2026',
    subject: 'Realisasi Petty Cash', senderTitle: 'Kabid Sarpras',
    recipients: ['Ketua Umum'], cc: ['Sekjen'],
    danaAwalDate: '1 Januari 2026', openingDoc: '5.000.000,00', realizedDoc: '3.200.000,00', remainingDoc: '1.800.000,00',
    totalTable: '3.200.000,00', terbilang: 'satu juta delapan ratus ribu rupiah',
    items: [{ no: 1, dateFmt: '05/01/2026', description: 'ATK', keterangan: '—', amountFmt: '200.000,00', reimburse: [] }],
    letterTop: [{ label: 'Jakarta, 19 Januari 2026', position: 'Kabid', name: 'Budi' }],
    recap: [{ label: 'Dibuat', position: 'Staf', name: 'Andi' }],
  };
  const doc = nor.build(vm);
  check('nor PDF page geometry IS the design system\'s (A4/portrait/[56,40,56,40])',
    doc.pageSize === 'A4' && doc.pageOrientation === 'portrait' && doc.pageMargins === getDesignSystem('nor').page.margins);
  check('nor PDF default type IS the design system\'s default', doc.defaultStyle === getDesignSystem('nor').typography.default);
  const itemTable = doc.content.find((n) => n.table && n.table.widths && n.table.widths.length === 5);
  check('nor item-table widths ARE the design system\'s (never re-hardcoded)', itemTable.table.widths === getDesignSystem('nor').layout.itemTableWidths);
  check('nor rincian grid borders come from the design system (1pt ink)', itemTable.layout.hLineColor() === '#000000' && itemTable.layout.hLineWidth() === 1);
  const heading = doc.content.find((n) => n.text === 'NOTA ORGANISASI');
  check('nor document-title heading size comes from the design system (13)', heading.fontSize === 13);

  const composer = getTemplate('composer-document');
  const cdoc = composer.build({ documentId: 'DOC-1', domainType: 'nor', version: 1, statusLabel: 'Disetujui', approvedAt: null, sections: [] });
  check('composer-document page margins ARE the design system\'s [48,37,48,48]', cdoc.pageMargins === getDesignSystem('composer').page.margins);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
