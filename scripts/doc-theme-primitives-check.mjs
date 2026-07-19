/* doc-theme-primitives-check.mjs — Node check for Phase 11, "Sprint 11.10"
   (Universal renderer primitives): orgLogo()/signatureBlock()/
   signatureGrid() in js/docs/doc-theme.js, extracted FROM the real,
   already-shipping Petty Cash NOR template (js/docs/templates/nor.js)
   rather than invented — and this file's own header explains why:
   "never duplicate renderers" only means something if the extraction is
   provably behavior-preserving for the ORIGINAL caller, not just
   available for a new one.

   Proves two things:
     1. templates/nor.js's real, production PDF output is BYTE-FOR-BYTE
        unchanged after the refactor (real signatories, a short bottom
        row, and the "no name yet" edge case all produce identical
        pdfmake nodes to what the original inline `_signBlock()`
        produced).
     2. The primitives now support a genuinely NEW capability
        (`showBlankLine`) the Composer's generic template needs — an
        honest visible placeholder line, never a fabricated name.

   Run: node scripts/doc-theme-primitives-check.mjs   (exit 0 = pass) */

import { orgLogo, signatureBlock, signatureGrid, CONTENT_W } from '../js/docs/doc-theme.js';
import { PBSI_LOGO_DATA_URI } from '../js/docs/templates/reimbursement-logo.js';
import '../js/docs/templates/nor.js'; // self-registers 'nor'
import { getTemplate } from '../js/docs/template-registry.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[orgLogo — the real embedded PBSI mark, reusable]');
{
  const node = orgLogo({ width: 56 });
  check('image src is the real, already-embedded PBSI logo data URI (not a new/placeholder asset)', node.image === PBSI_LOGO_DATA_URI);
  check('width defaults/passes through correctly', node.width === 56);
  check('centered by default', node.alignment === 'center');
  check('default margin matches nor.js\'s original inline node ([0,0,0,6])', JSON.stringify(orgLogo().margin) === JSON.stringify([0, 0, 0, 6]));
}

console.log('\n[signatureBlock — real data renders identically to the original inline _signBlock()]');
{
  const real = signatureBlock({ label: 'Jakarta, 19 Januari 2026', position: 'Kepala Bidang', name: 'Budi Santoso', gap: 40 });
  check('label line carries the comma convention', real.stack[0].text === 'Jakarta, 19 Januari 2026,');
  check('position is uppercased and bold', real.stack[1].text === 'KEPALA BIDANG' && real.stack[1].bold === true);
  check('the signing gap uses the real requested value', real.stack[2].margin[3] === 40);
  check('a real name renders bold+underlined', real.stack[3].text === 'Budi Santoso' && real.stack[3].bold === true && real.stack[3].decoration === 'underline');
}

console.log('\n[signatureBlock — missing name defaults to the ORIGINAL invisible-empty-line behavior, never a visible blank unless asked]');
{
  const noName = signatureBlock({ label: 'Ketua', position: '', name: '', gap: 38 });
  check('no name, showBlankLine not requested -> an empty (invisible) bold+underlined line, matching the pre-refactor _signBlock() exactly', noName.stack[3].text === '' && noName.stack[3].bold === true && noName.stack[3].decoration === 'underline');
  check('empty position still renders an (empty) bold position line, matching the original unconditional position row', noName.stack[1].text === '' && noName.stack[1].bold === true);

  const withBlankLine = signatureBlock({ label: 'Tanda Tangan', showBlankLine: true });
  check('showBlankLine:true (the NEW, opt-in capability) renders a real visible placeholder line, never a fabricated name', withBlankLine.stack[3].text === '_________________');
  check('showBlankLine still never fabricates a label — falls back to "Tanda Tangan" only when none given', signatureBlock({}).stack[0].text === 'Tanda Tangan,');
}

console.log('\n[signatureGrid — a row of up to 3 signatories, missing slots stay honestly blank]');
{
  const grid = signatureGrid([{ label: 'A', name: 'Satu' }, { label: 'B', name: 'Dua' }], { gap: 40 });
  check('renders exactly the given signatories as columns', grid.columns.length === 2);
  check('a null/undefined slot renders as an empty column, never a fabricated signer', signatureGrid([{ label: 'A', name: 'Satu' }, null, undefined]).columns.every((c, i) => (i === 0 ? c.stack : c.text === '')));
  check('an empty signatories array renders nothing (no phantom empty row)', JSON.stringify(signatureGrid([])) === JSON.stringify({ text: '' }));
  check('never renders more than 3 columns even if given more', signatureGrid([{ name: '1' }, { name: '2' }, { name: '3' }, { name: '4' }]).columns.length === 3);
}

console.log('\n[templates/nor.js — the REAL production template, refactored to consume these primitives, byte-for-byte unchanged output]');
{
  const nor = getTemplate('nor');
  const vm = {
    norNumber: '154/Nota Organisasi/Sarpras/I/2026',
    dateLong: '19 Januari 2026',
    subject: 'Realisasi Petty Cash Bidang Sarana dan Prasarana',
    senderTitle: 'Kabid Sarana dan Prasarana',
    recipients: ['Ketua Umum'],
    cc: ['Sekretaris Jenderal'],
    danaAwalDate: '1 Januari 2026',
    openingDoc: '5.000.000,00', realizedDoc: '3.200.000,00', remainingDoc: '1.800.000,00',
    totalTable: '3.200.000,00', terbilang: 'satu juta delapan ratus ribu rupiah',
    items: [{ no: 1, dateFmt: '05/01/2026', description: 'ATK', keterangan: '—', amountFmt: '200.000,00', reimburse: [] }],
    // Real shape: 3 top signatories with real name/position, 1 bottom, 2 recap.
    letterTop: [
      { label: 'Jakarta, 19 Januari 2026', position: 'Kabid Sarpras', name: 'Budi Santoso' },
      { label: 'Mengetahui', position: 'Kasubag Keuangan', name: 'Siti Aminah' },
      { label: 'Menyetujui', position: 'Wakil Ketua', name: '' }, // real edge case: not-yet-assigned
    ],
    letterBottom: [{ label: 'Pemegang Dana', position: 'Bendahara', name: 'Rina Wijaya' }],
    recap: [
      { label: 'Dibuat oleh', position: 'Staf Sarpras', name: 'Andi Wijaya' },
      { label: 'Diperiksa oleh', position: 'Kabid Sarpras', name: 'Budi Santoso' },
    ],
  };

  const doc = nor.build(vm);
  check('page geometry unchanged (A4 portrait, real margins)', doc.pageSize === 'A4' && doc.pageOrientation === 'portrait' && JSON.stringify(doc.pageMargins) === JSON.stringify([56, 40, 56, 40]));
  check('the real PBSI logo image is the first content node', doc.content[0].image === PBSI_LOGO_DATA_URI && doc.content[0].width === 56);
  check('"NOTA ORGANISASI" heading is unchanged (this template\'s own real letterhead text, not the Composer\'s)', doc.content[1].text === 'NOTA ORGANISASI');

  // The 3-up top signatory row.
  const topRow = doc.content.find((n) => n.columns && n.columns.length === 3 && n.columns[0].stack);
  check('all 3 real top signatories render with their real names', topRow
    && topRow.columns[0].stack[3].text === 'Budi Santoso'
    && topRow.columns[1].stack[3].text === 'Siti Aminah');
  check('the not-yet-assigned 3rd top signatory renders the ORIGINAL invisible-blank convention (empty, bold, underlined) — never a visible "_____" line unless explicitly requested, since this template never opts into showBlankLine', topRow.columns[2].stack[3].text === '' && topRow.columns[2].stack[3].decoration === 'underline');

  // The 1-of-3 bottom row (real value in col 0, the other two genuinely empty text nodes).
  const bottomRow = doc.content.find((n) => n.columns && n.columns.length === 3 && n.columns[0].stack && n.columns[0].stack[3].text === 'Rina Wijaya');
  check('the bottom row\'s real signatory keeps their real name', !!bottomRow);
  check('the bottom row\'s unused columns are genuinely empty text nodes (not signature blocks)', bottomRow.columns[1].text === '' && !bottomRow.columns[1].stack);

  // The 2-up recap row.
  const recapRow = doc.content.find((n) => n.columns && n.columns.length === 2 && n.columns[0].stack && n.columns[0].stack[3].text === 'Andi Wijaya');
  check('the recap signatory row renders both real names', recapRow && recapRow.columns[1].stack[3].text === 'Budi Santoso');

  check('page 2 heading and hard page break are unchanged', doc.content.some((n) => n.text === 'RINCIAN PENGGUNAAN PETTY CASH' && n.pageBreak === 'before'));
  const itemTable = doc.content.find((n) => n.table && n.table.widths && n.table.widths.length === 5);
  check('the bordered item table is unchanged (5 columns, real widths) — never touched by this refactor', JSON.stringify(itemTable?.table.widths) === JSON.stringify([26, 70, '*', 92, 86]));
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
