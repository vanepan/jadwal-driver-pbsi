/* ============================================================
   intelligence-nor-preview-view-model-check.mjs — V2 Phase 6C

   PURE node test (no browser, no Firebase, no network, no pdfmake) of
   src/intelligence/generation/nor-preview-view-model.js
   `buildIntelligenceNorViewModel(record, opts)` — the ONE translation from
   a persisted NorDraftRecord into the EXISTING `composer-document` renderer
   input.

   Fixtures (Phase 6C §26): A minimal · B complete procurement · C proposed
   recipient · D confirmed recipient · E empty signature · F long body ·
   G multi-page body · H saved human edits · I approved Visual Template ·
   J deterministic fallback · K unsupported Visual Template fields ·
   L malformed visual binding · M conflicting visual template.
   (N cross-owner · O stale context · P Intelligence OFF are server /
   callable / gating concerns — see scripts/intelligence-nor-draft-check.cjs
   and scripts/intelligence-console-ui-check.mjs.)

   Also: never emits a NOR number (§13); never a signer (§8); a proposed
   recipient is disclosed IN the printed text (§6); deterministic (§10 of
   the Phase 6B discipline); frozen output; pure (no eval / Function /
   network / DOM / clock / generic spread of the record).

   Run:  node scripts/intelligence-nor-preview-view-model-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIntelligenceNorViewModel } from '../src/intelligence/generation/nor-preview-view-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};
const section = (t) => console.log(`\n── ${t} ──`);

/** A realistic persisted NorDraftRecord (norDraftStore.js#rehydrate shape). */
function makeRecord(over = {}) {
  return {
    schema: 'intelligence-nor-draft@1',
    draftId: 'draft_abc', conversationId: 'conv_abc', ownerId: 'user_1',
    version: 1, status: 'requires_review',
    jenis: 'Pengadaan',
    subject: 'Pengadaan mesin potong rumput (2 unit)',
    recipient: 'Bendahara', recipientStatus: 'known',
    date: '2026-09-06',
    facts: { item: 'mesin potong rumput Honda GX35', quantity: '2', unit: 'unit', purpose: 'perawatan lapangan PBSI', budget: 'Rp4.000.000 per unit' },
    body: 'Dengan hormat,\n\nBersama ini diajukan pengadaan mesin potong rumput sebanyak 2 unit untuk keperluan perawatan lapangan PBSI.\n\nAtas perhatiannya, kami ucapkan terima kasih.',
    numbering: { suggestedNumber: '', publishedNumber: null, source: 'system_suggested', basis: null, confidence: 0 },
    provenance: { bodySource: 'template' },
    humanEdited: false,
    auditTrail: [{ type: 'AI_DRAFT_CREATED', at: 't', actorId: 'user_1', changedFields: [] }],
    createdAt: 't', updatedAt: 't',
    ...over,
  };
}
const fieldsOf = (vm) => vm.sections.map((s) => s.field);
const sectionVal = (vm, field) => { const s = vm.sections.find((x) => x.field === field); return s ? s.value : undefined; };
const hasNumberSection = (vm) => vm.sections.some((s) => s.field === 'norNumber' || /nomor|number/i.test(String(s.field)));

/* ════════ A — minimal valid NorDraftRecord ════════ */
section('A — minimal record: only the fields actually present are emitted');
{
  const vm = buildIntelligenceNorViewModel(makeRecord({
    jenis: null, subject: '', recipient: null, recipientStatus: null, facts: {}, body: '',
  }));
  check('sections is exactly the dateline (no perihal/recipient/body/facts invented — §5)',
    JSON.stringify(fieldsOf(vm)) === JSON.stringify(['dateline']), fieldsOf(vm));
  check('dateline is the Indonesian long form', sectionVal(vm, 'dateline') === 'Jakarta, 6 September 2026', sectionVal(vm, 'dateline'));
  check('domainType falls back to "NOR" when jenis is null', vm.domainType === 'NOR', vm.domainType);
  check('isPreview is true, approvedAt is null, statusLabel is the draft status', vm.isPreview === true && vm.approvedAt === null && /menunggu peninjauan/i.test(vm.statusLabel), vm);
  check('output is frozen', Object.isFrozen(vm) && Object.isFrozen(vm.sections), null);
}

/* ════════ B — complete procurement NOR ════════ */
section('B — complete procurement NOR: full letterhead + body + Rincian, in order');
{
  const vm = buildIntelligenceNorViewModel(makeRecord());
  check('section order: dateline, perihal, recipients, body para(s), then the 5 facts',
    JSON.stringify(fieldsOf(vm)) === JSON.stringify([
      'dateline', 'perihal', 'recipients', 'pattern:body-0', 'pattern:body-1', 'pattern:body-2',
      'Barang / Uraian', 'Jumlah', 'Satuan', 'Tujuan / Keperluan', 'Perkiraan Anggaran',
    ]), fieldsOf(vm));
  check('perihal carries the subject', sectionVal(vm, 'perihal') === 'Pengadaan mesin potong rumput (2 unit)');
  check('fact rows carry the real values', sectionVal(vm, 'Perkiraan Anggaran') === 'Rp4.000.000 per unit');
  check('domainType names the jenis', vm.domainType === 'NOR — Pengadaan', vm.domainType);
  check('NO NOR number section anywhere (§13)', !hasNumberSection(vm), fieldsOf(vm));
}

/* ════════ C / D — recipient disclosure (§6) ════════ */
section('C — a PROPOSED recipient is disclosed IN the printed text');
{
  const vm = buildIntelligenceNorViewModel(makeRecord({ recipient: 'Bendahara', recipientStatus: 'proposed' }));
  check('recipients value carries the "(diusulkan — belum dikonfirmasi)" suffix',
    JSON.stringify(sectionVal(vm, 'recipients')) === JSON.stringify(['Bendahara (diusulkan — belum dikonfirmasi)']), sectionVal(vm, 'recipients'));
}
section('D — a CONFIRMED recipient uses the canonical representation (no suffix)');
{
  const vm = buildIntelligenceNorViewModel(makeRecord({ recipient: 'Bendahara', recipientStatus: 'known' }));
  check('recipients value is the plain confirmed name',
    JSON.stringify(sectionVal(vm, 'recipients')) === JSON.stringify(['Bendahara']), sectionVal(vm, 'recipients'));
  const vm2 = buildIntelligenceNorViewModel(makeRecord({ recipient: 'Bendahara', recipientStatus: null }));
  check('an UNSET recipientStatus is treated as not-yet-confirmed (disclosed)',
    /diusulkan/.test(sectionVal(vm2, 'recipients')[0]), sectionVal(vm2, 'recipients'));
}

/* ════════ E — empty signature (§8) ════════ */
section('E — no signer is ever invented');
{
  const vm = buildIntelligenceNorViewModel(makeRecord());
  const sig = vm.sections.some((s) => /signator|signature|tanda tangan|suggestedSignatory/i.test(String(s.field)));
  check('no signatory / signature section is emitted (Composer\'s "nothing suggested" path applies)', !sig, fieldsOf(vm));
}

/* ════════ F — long single-paragraph body ════════ */
section('F — a long single-paragraph body stays ONE body section');
{
  const long = 'A'.repeat(4000);
  const vm = buildIntelligenceNorViewModel(makeRecord({ body: long }));
  const bodyFields = fieldsOf(vm).filter((f) => f.startsWith('pattern:body-'));
  check('exactly one pattern:body-0 section', JSON.stringify(bodyFields) === JSON.stringify(['pattern:body-0']), bodyFields);
  check('the full text is preserved', sectionVal(vm, 'pattern:body-0').length === 4000);
}

/* ════════ G — multi-page / multi-paragraph body ════════ */
section('G — a multi-paragraph body → one body section per paragraph, order preserved');
{
  const body = ['Alinea satu.', 'Alinea dua.', 'Alinea tiga.', 'Alinea empat.', 'Alinea lima.', 'Alinea enam.'].join('\n\n');
  const vm = buildIntelligenceNorViewModel(makeRecord({ body }));
  const bodyFields = fieldsOf(vm).filter((f) => f.startsWith('pattern:body-'));
  check('six ordered body sections', JSON.stringify(bodyFields) === JSON.stringify(['pattern:body-0', 'pattern:body-1', 'pattern:body-2', 'pattern:body-3', 'pattern:body-4', 'pattern:body-5']), bodyFields);
  check('first & last paragraphs land in order', sectionVal(vm, 'pattern:body-0') === 'Alinea satu.' && sectionVal(vm, 'pattern:body-5') === 'Alinea enam.');
  check('blank runs never produce an empty section', vm.sections.every((s) => String(s.value).length > 0 || Array.isArray(s.value)));
}

/* ════════ H — saved human edits are what render (§17) ════════ */
section('H — the SAVED record (its edited values + version) is what the view model reflects');
{
  const edited = makeRecord({
    version: 4, humanEdited: true,
    subject: 'Pengadaan mesin potong rumput (REVISI: 3 unit)',
    facts: { item: 'mesin potong rumput Honda GX35', quantity: '3', unit: 'unit', purpose: 'perawatan 2 lapangan', budget: 'Rp4.500.000 per unit' },
  });
  const vm = buildIntelligenceNorViewModel(edited);
  check('version 4 flows through', vm.version === 4, vm.version);
  check('the edited subject is what renders', sectionVal(vm, 'perihal') === 'Pengadaan mesin potong rumput (REVISI: 3 unit)');
  check('the edited fact is what renders', sectionVal(vm, 'Jumlah') === '3' && sectionVal(vm, 'Perkiraan Anggaran') === 'Rp4.500.000 per unit');
}

/* ════════ I / J / K / L / M — the visual model is carried, never derived ════════ */
section('I — an approved-template rendering model is carried through BYTE-IDENTICAL (never re-resolved)');
{
  const rvm = Object.freeze({
    schema: 'nor-visual-rendering-model@1', source: 'approved_template', fidelity: 'full',
    templateId: 'vtpl_x', templateVersion: 3,
    page: Object.freeze({ width: 595.28, height: 841.89 }),
    margins: Object.freeze([56, 40, 56, 40]),
    logo: Object.freeze({ x: 400, y: 40, width: 56 }),
    unsupportedRegions: Object.freeze([]), unsupportedFields: Object.freeze([]), warnings: Object.freeze([]),
  });
  const vm = buildIntelligenceNorViewModel(makeRecord(), { renderingVisualModel: rvm });
  check('vm.renderingVisualModel is the SAME object the caller supplied', vm.renderingVisualModel === rvm);
  check('the builder added no geometry of its own', JSON.stringify(vm.renderingVisualModel) === JSON.stringify(rvm));
}
section('J — deterministic fallback: no rendering model ⇒ null (the composer default layout stands)');
{
  const vm = buildIntelligenceNorViewModel(makeRecord(), { renderingVisualModel: null });
  check('vm.renderingVisualModel is null', vm.renderingVisualModel === null);
  const vm2 = buildIntelligenceNorViewModel(makeRecord());
  check('omitting opts entirely ⇒ null', vm2.renderingVisualModel === null);
}
section('K — a partial model (only unsupported fields) is carried through, never interpreted here');
{
  const rvm = { schema: 'nor-visual-rendering-model@1', source: 'approved_template', fidelity: 'fallback', page: null, margins: null, logo: null, unsupportedRegions: [{ kind: 'header', reason: 'x' }], unsupportedFields: [{ field: 'typography', reason: 'x' }], warnings: [] };
  const vm = buildIntelligenceNorViewModel(makeRecord(), { renderingVisualModel: rvm });
  check('carried through unchanged (composer-document.js + the resolver own validation, not this module)', JSON.stringify(vm.renderingVisualModel) === JSON.stringify(rvm));
}
section('L — a malformed / non-object rendering model is normalised to null, never thrown on');
{
  for (const bad of ['garbage', 42, true, [], () => {}]) {
    let threw = false; let vm;
    try { vm = buildIntelligenceNorViewModel(makeRecord(), { renderingVisualModel: bad }); } catch { threw = true; }
    check(`renderingVisualModel=${JSON.stringify(bad) || typeof bad}: no throw, normalised to null`, !threw && vm && vm.renderingVisualModel === null);
  }
}
section('M — a "conflicting" template never leaks geometry: the builder NEVER reads record.provenance');
{
  const withApprovedBinding = makeRecord({
    provenance: { bodySource: 'template', visualBinding: { source: 'approved_template', templateId: 'vtpl_conflict', templateVersion: 9, pageModel: { width: 9999, height: 9999, coordinateSpace: 'pdf_points' }, regions: [] } },
  });
  const vm = buildIntelligenceNorViewModel(withApprovedBinding, {}); // caller passed no resolved model (gate did not certify)
  check('renderingVisualModel stays null — a stored binding does NOT self-apply (§9, §11, §32)', vm.renderingVisualModel === null, vm.renderingVisualModel);
}

/* ════════ never a number · never an official status ════════ */
section('§13 — a stray suggested / published number in the record is NEVER surfaced');
{
  const vm = buildIntelligenceNorViewModel(makeRecord({
    numbering: { suggestedNumber: '128', publishedNumber: '128/NOR/PBSI/IX/2026', source: 'x', basis: null, confidence: 1 },
  }));
  check('no norNumber section, no number-shaped field', !hasNumberSection(vm), fieldsOf(vm));
  check('the raw disclaimer never asserts approval/publication', /MASIH DALAM PENINJAUAN/i.test(vm.disclaimerOverride) && !/telah disetujui/i.test(vm.disclaimerOverride));
  check('statusLabel is never an official label', !/diterbitkan|disetujui/i.test(vm.statusLabel), vm.statusLabel);
}

/* ════════ dateline edge cases — never guesses a date ════════ */
section('dateline — non-ISO / invalid / missing dates are handled honestly');
{
  check('a null date ⇒ NO dateline section', !fieldsOf(buildIntelligenceNorViewModel(makeRecord({ date: null }))).includes('dateline'));
  check('an empty date ⇒ NO dateline section', !fieldsOf(buildIntelligenceNorViewModel(makeRecord({ date: '   ' }))).includes('dateline'));
  check('a free-text date is used verbatim after "Jakarta, "', sectionVal(buildIntelligenceNorViewModel(makeRecord({ date: '6 Sep 2026' })), 'dateline') === 'Jakarta, 6 Sep 2026');
  check('an out-of-range ISO-shaped date is NOT coerced', sectionVal(buildIntelligenceNorViewModel(makeRecord({ date: '2026-13-40' })), 'dateline') === 'Jakarta, 2026-13-40');
}

/* ════════ determinism ════════ */
section('determinism — same record + opts ⇒ byte-identical output');
{
  const r = makeRecord();
  const rvm = { schema: 'nor-visual-rendering-model@1', source: 'approved_template', page: { width: 480, height: 720 }, margins: [40, 60, 40, 30], logo: { x: 380, y: 12, width: 50 }, unsupportedRegions: [], unsupportedFields: [], warnings: [] };
  const a = JSON.stringify(buildIntelligenceNorViewModel(r, { renderingVisualModel: rvm }));
  const b = JSON.stringify(buildIntelligenceNorViewModel(r, { renderingVisualModel: rvm }));
  check('two calls are identical', a === b);
}

/* ════════ defensive inputs ════════ */
section('defensive — a non-object / partial record never throws');
{
  for (const bad of [null, undefined, 'x', 42, [], { facts: null }]) {
    let threw = false; let vm;
    try { vm = buildIntelligenceNorViewModel(bad); } catch { threw = true; }
    check(`record=${JSON.stringify(bad) || typeof bad}: no throw, still a frozen composer shape`, !threw && vm && Object.isFrozen(vm) && Array.isArray(vm.sections));
  }
}

/* ════════ static — pure, no I/O, no clock, no generic spread of the record ════════ */
section('static — PURE (no eval / Function / network / DOM / clock / generic record spread)');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/intelligence/generation/nor-preview-view-model.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check('no eval(', !/\beval\s*\(/.test(code));
  check('no dynamic Function(', !/\bnew\s+Function\s*\(|\bFunction\s*\(/.test(code));
  check('no network / fetch / XHR / WebSocket', !/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(code));
  check('no DOM / window / document', !/\bdocument\.|\bwindow\./.test(code));
  check('no firebase / storage import', !/firebase|localStorage|sessionStorage/.test(code));
  check('no clock (Date / Date.now) — deterministic', !/\bDate\s*\(|Date\.now\s*\(/.test(code));
  check('no import of any js/ file (src never imports js/)', !/from\s+['"][^'"]*\/js\//.test(code) && !/from\s+['"]\.\.\/\.\.\/js\//.test(code));
  check('no generic spread / Object.assign of the untrusted `record` (fields read explicitly)',
    !/\{\s*\.\.\.\s*record\b/.test(code) && !/Object\.assign\([^)]*\brecord\b/.test(code));
  check('does not import composer-document.js (cross-referenced by name only)', !/composer-document/.test(code));
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
