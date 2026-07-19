/* composer-document-structure-check.mjs — Sprint 11.3 (Document-first
   Experience), Requirement 9: "Preview and exported document must share
   the SAME renderer. Never maintain two rendering systems."

   Before this sprint, js/docs/templates/composer-document.js decided
   dateline/norNumber/letterhead-row/body-paragraph/leftover-fact structure
   ONCE for PDF+Word export; js/v2/ui/review-workspace.js#renderLiveDocument
   independently re-derived the exact same structure a SECOND time for the
   in-page preview. buildDocumentStructure() is now the one place either
   reads. This script proves the shared function itself is correct, and
   that PDF/Word export (buildContentModel/build/buildHtml) now surfaces
   the SAME labeled letterhead rows + separated body paragraphs + "Rincian"
   appendix the in-page Live Document Workspace already showed — a real
   fidelity improvement to the exported artifact, not just the preview.

   Pure, Node-testable — no Firebase, no browser (see
   js/v2/README.md-adjacent testing note: this template has zero live
   dependencies).

   Run: node scripts/composer-document-structure-check.mjs   (exit 0 = pass) */
import { buildDocumentStructure, buildContentModel, buildHtml, LETTERHEAD_META_FIELDS } from '../js/docs/templates/composer-document.js';
import { getTemplate } from '../js/docs/template-registry.js';
import { PBSI_LOGO_DATA_URI } from '../js/docs/templates/reimbursement-logo.js';

let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const SECTIONS = [
  { field: 'norNumber', value: '001/SARPRAS/I/2026' },
  { field: 'pattern:dateline-1', value: 'Jakarta, 19 Januari 2026' },
  { field: 'kepadaYth', value: 'Kepala Bidang Sarana dan Prasarana' },
  { field: 'perihal', value: 'Permohonan Pengadaan Kursi Kerja' },
  // dari/tembusanYth/lampiran deliberately left unfilled — must still
  // appear as their own row (honest "—"), never silently dropped.
  { field: 'pattern:body-1', value: 'Dengan ini kami mengajukan permohonan pengadaan kursi kerja sejumlah 20 unit.' },
  { field: 'item', value: 'Kursi' },
  { field: 'quantity', value: 20 },
];

console.log('\n[buildDocumentStructure — pure structural split]');
{
  const s = buildDocumentStructure(SECTIONS);
  check('dateLineSection resolves to the real "Jakarta," pattern section', s.dateLineSection && s.dateLineSection.field === 'pattern:dateline-1');
  check('norNumberSection resolves to the real norNumber section', s.norNumberSection && s.norNumberSection.value === '001/SARPRAS/I/2026');
  check('metaFields carries all 5 fixed letterhead rows, in order', s.metaFields.length === 5 && s.metaFields.map((m) => m.field).join(',') === LETTERHEAD_META_FIELDS.map((m) => m.field).join(','));
  check('a filled letterhead row resolves its real section', s.metaFields.find((m) => m.field === 'kepadaYth').section?.value === 'Kepala Bidang Sarana dan Prasarana');
  check('an unfilled letterhead row honestly has no section (never fabricated)', s.metaFields.find((m) => m.field === 'dari').section === null);
  check('bodySections is the one pattern-sourced paragraph, excluding the dateline pattern', s.bodySections.length === 1 && s.bodySections[0].field === 'pattern:body-1');
  check('detailSections is exactly the two leftover plain facts (item, quantity)', s.detailSections.length === 2 && s.detailSections.every((d) => ['item', 'quantity'].includes(d.field)));
}

console.log('\n[buildDocumentStructure — negative control: no dateline/norNumber/letterhead at all]');
{
  const s = buildDocumentStructure([{ field: 'item', value: 'Meja' }]);
  check('dateLineSection is honestly null', s.dateLineSection === null);
  check('norNumberSection is honestly null', s.norNumberSection === null);
  check('every letterhead row is honestly unfilled', s.metaFields.every((m) => m.section === null));
  check('the one real fact still lands in detailSections', s.detailSections.length === 1 && s.detailSections[0].field === 'item');
}

console.log('\n[buildContentModel — export now carries the SAME structure the in-page preview reads]');
{
  const model = buildContentModel({
    documentId: 'doc-1', domainType: 'nor', version: 1, statusLabel: 'Disetujui', approvedAt: null, sections: SECTIONS,
  });
  check('dateLine is the real pattern value, not the composer field id', model.dateLine === 'Jakarta, 19 Januari 2026');
  check('metaFields shows the filled row\'s real value', model.metaFields.find((m) => m.label === 'Kepada Yth.').value === 'Kepala Bidang Sarana dan Prasarana');
  check('metaFields shows "—" for an unfilled row (same honest-absence convention as `sections`), never blank/UNKNOWN', model.metaFields.find((m) => m.label === 'Dari').value === '—');
  check('bodyParagraphs carries the real letter body, separated from the generic fact dump', model.bodyParagraphs.length === 1 && model.bodyParagraphs[0].includes('pengadaan kursi kerja'));
  check('sections (the Rincian appendix) no longer includes the letterhead/body fields, only genuine leftovers', model.sections.every((s) => !['Kepada Yth.', 'Dari', 'Tembusan Yth.', 'Perihal', 'Lampiran'].includes(s.label)) && model.sections.length === 2);
}

console.log('\n[buildContentModel — negative control: an empty letter honestly says so, never fabricates a paragraph]');
{
  const model = buildContentModel({ documentId: 'doc-2', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: [{ field: 'item', value: 'Meja' }] });
  check('bodyParagraphs is honestly empty', model.bodyParagraphs.length === 0);
}

console.log('\n[Sprint 11.10 — document title is reviewer-editable, defaults unchanged for the real (nor) domain]');
{
  const structure = buildDocumentStructure(SECTIONS);
  check('buildDocumentStructure exposes documentTitleSection as null when no override was ever set', structure.documentTitleSection === null);
  check('a documentTitle field is excluded from the Rincian leftovers (usedFields), never double-shown', !structure.detailSections.some((s) => s.field === 'documentTitle'));

  const defaultModel = buildContentModel({ documentId: 'doc-1', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: SECTIONS });
  check('with no override, the title stays EXACTLY "NOTA ORGANISASI" — zero behavior change for the only real domain in use', defaultModel.title === 'NOTA ORGANISASI');

  const overriddenSections = [...SECTIONS, { field: 'documentTitle', value: 'Nota Dinas Internal' }];
  const overriddenStructure = buildDocumentStructure(overriddenSections);
  check('an explicit documentTitle section is recognized', overriddenStructure.documentTitleSection && overriddenStructure.documentTitleSection.value === 'Nota Dinas Internal');
  const overriddenModel = buildContentModel({ documentId: 'doc-1', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: overriddenSections });
  check('buildContentModel prefers the reviewer override over the default', overriddenModel.title === 'Nota Dinas Internal');
  check('an overridden title is excluded from the Rincian leftovers', overriddenModel.sections.every((s) => s.label !== 'Document Title'));
}

console.log('\n[buildHtml — the Word/HTML export renderer surfaces the same structure]');
{
  const model = { documentId: 'doc-1', domainType: 'nor', version: 1, statusLabel: 'Disetujui', approvedAt: null, sections: SECTIONS };
  const html = buildHtml(model);
  check('shows the filled letterhead row, labeled', /<strong>Kepada Yth\.:<\/strong> Kepala Bidang Sarana dan Prasarana/.test(html));
  check('shows the unfilled letterhead row as "—", never blank/UNKNOWN', /<strong>Dari:<\/strong> —/.test(html));
  check('shows the real body paragraph as its own <p>, not a labeled field row', html.includes('<p>Dengan ini kami mengajukan permohonan pengadaan kursi kerja sejumlah 20 unit.</p>'));
  check('shows the "Rincian" appendix heading for the genuine leftover facts', html.includes('<h2>Rincian</h2>'));
  check('never renders a raw "pattern:" field id anywhere (would leak an internal id to an exported document)', !html.includes('pattern:'));
}

console.log('\n[buildHtml — negative control: an empty letter shows the same honest placeholder the preview does]');
{
  const html = buildHtml({ documentId: 'doc-2', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: [{ field: 'item', value: 'Meja' }] });
  check('shows "Belum ada isi surat yang tersusun." instead of an empty gap', html.includes('Belum ada isi surat yang tersusun.'));
}

console.log('\n[Sprint 11.10 — real signature grid + real logo, driven by nor-generator.js\'s already-computed signatory counts]');
{
  const structure = buildDocumentStructure(SECTIONS);
  check('no signatory-count sections present -> signatureSuggestion is honestly {null, null}, never a fabricated default', structure.signatureSuggestion.topCount === null && structure.signatureSuggestion.bottomCount === null);

  const withCounts = [...SECTIONS, { field: 'suggestedSignatoryTopCount', value: 3 }, { field: 'suggestedSignatoryBottomCount', value: 1 }];
  const structureWithCounts = buildDocumentStructure(withCounts);
  check('real suggested counts are extracted as numbers', structureWithCounts.signatureSuggestion.topCount === 3 && structureWithCounts.signatureSuggestion.bottomCount === 1);
  check('the two count fields are excluded from the Rincian leftovers — never double-shown as raw numbers', !structureWithCounts.detailSections.some((s) => s.field === 'suggestedSignatoryTopCount' || s.field === 'suggestedSignatoryBottomCount'));

  const model = buildContentModel({ documentId: 'doc-1', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: withCounts });
  check('buildContentModel passes the real counts through unchanged', model.signatureSuggestion.topCount === 3 && model.signatureSuggestion.bottomCount === 1);

  const composerTemplate = getTemplate('composer-document');
  const pdfDoc = composerTemplate.build({ documentId: 'doc-1', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: withCounts });
  check('the PDF export now includes the real PBSI logo (composer-document.js never had ANY image node before Sprint 11.10)', pdfDoc.content[0].image === PBSI_LOGO_DATA_URI);
  const sigRows = pdfDoc.content.filter((n) => n.columns);
  check('the PDF export renders a real 3-column signature row for the top count', sigRows.some((r) => r.columns.length === 3 && r.columns.every((c) => c.stack)));
  check('the PDF export renders a real 1-column signature row for the bottom count (never padded to 3 with fabricated blanks)', sigRows.some((r) => r.columns.length === 1));
  check('every signature block is an honest visible blank line, never a fabricated name', sigRows.flatMap((r) => r.columns).every((c) => c.stack[3].text === '_________________'));

  const pdfNoCounts = composerTemplate.build({ documentId: 'doc-2', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: SECTIONS });
  check('with no Approved structural Knowledge to suggest from, the PDF renders zero signature rows — honest absence, not a fabricated default grid', !pdfNoCounts.content.some((n) => n.columns));

  const html = buildHtml({ documentId: 'doc-1', domainType: 'nor', version: 1, statusLabel: 'Draf', approvedAt: null, sections: withCounts });
  check('the Word/HTML export shows 3 blank signing lines for the top row', (html.match(/Tanda Tangan: _________________/g) || []).length === 4); // 3 top + 1 bottom
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exitCode = 1;
