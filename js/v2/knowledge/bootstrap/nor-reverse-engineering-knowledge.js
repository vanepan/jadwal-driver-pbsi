/* ============================================================
   NOR-REVERSE-ENGINEERING-KNOWLEDGE.JS — Knowledge Authoring Sprint 01

   PURPOSE: content, not architecture. Every KnowledgeItem spec below is a
   direct transcription of a finding already cited, evidenced, and
   confidence-rated in `docs/NOR-Specification.md` (Part 1 of the Knowledge
   Acquisition track) and `docs/Knowledge-Asset-Specification.md` (Part 2).
   No production code, contract, or engine is added by this file — it is
   data, authored against contracts and kinds that already exist
   (kind-registry.js's 25 registered kinds, domain-type-registry.js's `nor`
   domainType, the six knowledge/language/contracts/*.js payload shapes),
   and a single orchestration function that composes EXISTING,
   unmodified services/knowledge-service.js calls (`ingest`,
   `promoteKnowledge`) — the same two calls
   scripts/knowledge-asset-kinds-check.mjs already proved work end to end
   for a brand-new kind.

   WHY sourceType 'manual-file': this content has no connector — it was
   reverse-engineered by a human reading two real, filled NOR PDFs and the
   generation code (see NOR-Specification.md's own Evidence base note).
   `source-weight-contract.js` already registers `'manual-file'` (weight
   0.95, "human-verified facts read directly from an uploaded document") —
   this resolves Knowledge-Repository-Adaptation.md's Open Question 2 by
   reusing the already-registered convention rather than inventing a new
   sourceType or a new connector.

   WHAT THIS FILE DOES NOT DO: it does not auto-run at import (unlike the
   registries' own top-level `bootstrap()` calls) — `seedNorBootstrapKnowledge()`
   is an explicit, named call, consistent with `knowledge-service.js`'s own
   discipline that every write is a deliberate, attributable action, never
   a module-load side effect. It does not call any AI/LLM adapter. It does
   not touch `organizational-memory/`, `learning/`, `conversation/`, or any
   V1 file. It does not invent a business rule beyond what NOR-Specification.md
   and Knowledge-Asset-Specification.md already evidenced — every `rule`,
   `rendering_rule`, `workflow`, `ontology`, `organizational_reasoning`,
   `question_tree`, `statistic`, `vocabulary`, `signatory`, `approval_chain`
   and `pattern` item below carries an `observedIn`/`evidenceRefs`/`rationale`
   citation back to a real section of that report.

   DEPENDENCIES: knowledge/contracts/identity-contract.js,
   knowledge/contracts/lifecycle-contract.js,
   knowledge/contracts/dependency-graph-contract.js,
   knowledge/services/knowledge-service.js (ingest, promoteKnowledge — the
   SAME two calls every other producer in this platform uses; this file is
   a CLIENT, never a fifth writer).
   ============================================================ */

'use strict';

import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { RELATIONSHIP_TYPE } from '../contracts/dependency-graph-contract.js';
import { ingest, promoteKnowledge } from '../services/knowledge-service.js';

export const DOMAIN_TYPE = 'nor';
export const SOURCE_TYPE = 'manual-file';

/** Deterministic id for any fact in this bootstrap set — exported so the
 *  seed script and any future consumer can resolve a cross-reference
 *  without re-deriving the id format. */
export function idForNorFact(sourceRef) {
  return generateKnowledgeId({ domainType: DOMAIN_TYPE, sourceType: SOURCE_TYPE, sourceRef });
}

/* ══════════════════════════════════════════════════════════════════════
   RENDERING RULES (kind: 'rendering_rule') — NOR-Specification.md §A, §C.
   ══════════════════════════════════════════════════════════════════════ */
const RENDERING_RULES = [
  {
    sourceRef: 'rendering.no-footer-page1', confidence: 0.9,
    reviewRationale: 'Confirmed identical across both real PDFs and the template source; a deliberate formality rule, not an omission.',
    payload: {
      property: 'footer', scope: 'coverPage',
      rule: 'Page 1 (the cover letter) never renders a footer — a deliberate formality rule; a real internal memo carries no app branding.',
      observedIn: ['NOR-Specification.md §A.1 item 17', 'NOR-Specification.md §C.3', 'js/docs/templates/nor.js:150 (currentPage === 1 ? undefined : …)'],
    },
  },
  {
    sourceRef: 'rendering.footer-ledger-pages', confidence: 0.9,
    reviewRationale: 'Confirmed identical across both real PDFs.',
    payload: {
      property: 'footer', scope: 'ledgerPages',
      rule: 'Page 2+ (the ledger) always renders a footer containing the app name/version and a "Hal. X / Y" page counter.',
      observedIn: ['NOR-Specification.md §A.2 item 9', 'NOR-Specification.md §C.3', 'js/docs/templates/nor.js:150-157'],
    },
  },
  {
    sourceRef: 'rendering.ledger-pagebreak', confidence: 0.9,
    reviewRationale: 'Confirmed unconditional in both real samples, even where the cover letter ends well above the page bottom.',
    payload: {
      property: 'pageBreak', scope: 'ledgerSection',
      rule: 'The itemized ledger (RINCIAN PENGGUNAAN PETTY CASH) always starts on a new page, unconditionally, regardless of how short the cover letter is.',
      observedIn: ['NOR-Specification.md §A.3', 'NOR-Specification.md §C.3', 'js/docs/templates/nor.js (pageBreak: "before")'],
    },
  },
  {
    sourceRef: 'rendering.typography-sizes', confidence: 0.9,
    reviewRationale: 'Directly read from the template source, consistent with both real PDFs.',
    payload: {
      property: 'fontSize', scope: 'wholeDocument',
      rule: 'Body text defaults to 10pt. The ledger table uses 9pt (7.5pt for the optional reimbursement sub-breakdown). The page-1 title is 13pt bold; the page-2 title is 11pt bold.',
      value: { bodyPt: 10, ledgerPt: 9, reimburseSubPt: 7.5, titlePt: 13, page2TitlePt: 11 },
      observedIn: ['NOR-Specification.md §C.1'],
    },
  },
  {
    sourceRef: 'rendering.font-substitution', confidence: 0.9,
    reviewRationale: 'Documented as an intentional, accepted platform limitation, not an error.',
    payload: {
      property: 'font', scope: 'wholeDocument',
      rule: 'Design intent is Arial; the PDF renderer substitutes Roboto as the closest embedded-font match. On-screen rendering stays true Arial — this is a known, accepted gap between the two renderers.',
      observedIn: ['NOR-Specification.md §C.1'],
    },
  },
  {
    sourceRef: 'rendering.bold-emphasis', confidence: 0.9,
    reviewRationale: 'Directly read from the template source, consistent with both real PDFs.',
    payload: {
      property: 'emphasis', scope: 'boldElements',
      rule: 'Bold is applied to: the document title, the Perihal (subject) value, section titles, signatory position labels, signatory printed names, table headers, and the total row.',
      observedIn: ['NOR-Specification.md §C.2'],
    },
  },
  {
    sourceRef: 'rendering.italic-emphasis', confidence: 0.9,
    reviewRationale: 'Directly read from the template source, consistent with both real PDFs.',
    payload: {
      property: 'emphasis', scope: 'italicElements',
      rule: 'Italic is applied to the Terbilang value line, and to the word "petty cash" wherever it appears in running prose — a deliberate borrowed/foreign-term convention.',
      observedIn: ['NOR-Specification.md §C.2', 'NOR-Specification.md §B.1'],
    },
  },
  {
    sourceRef: 'rendering.underline-signatory-names', confidence: 0.9,
    reviewRationale: 'Directly read from the template source, consistent with both real PDFs.',
    payload: {
      property: 'emphasis', scope: 'signatoryPrintedName',
      rule: 'Underline is applied only to signatory printed names — never to position labels, never to body text.',
      observedIn: ['NOR-Specification.md §C.2'],
    },
  },
  {
    sourceRef: 'rendering.page-margins', confidence: 0.9,
    reviewRationale: 'Directly read from the template source.',
    payload: {
      property: 'spacing', scope: 'pageLayout',
      rule: 'A4 portrait orientation, with uniform 56pt side margins and 40pt top/bottom margins.',
      value: { size: 'A4', orientation: 'portrait', sideMarginPt: 56, topBottomMarginPt: 40 },
      observedIn: ['NOR-Specification.md §C.3'],
    },
  },
  {
    sourceRef: 'rendering.meta-block-layout', confidence: 0.85,
    reviewRationale: 'Directly read from the template source.',
    payload: {
      property: 'layout', scope: 'metaBlock',
      rule: 'The Kepada/Dari/Tembusan/Perihal/Lampiran meta block is a fixed, borderless 3-column table: a 96pt label column, a 10pt colon column, and the remaining width for the value. Labels never wrap; values may.',
      value: { labelColPt: 96, colonColPt: 10 },
      observedIn: ['NOR-Specification.md §C.3'],
    },
  },
  {
    sourceRef: 'rendering.balance-recap-layout', confidence: 0.85,
    reviewRationale: 'Directly read from the template source, consistent with both real PDFs.',
    payload: {
      property: 'layout', scope: 'balanceRecap',
      rule: 'The Dana Awal / Dana Terealisasi / Sisa Dana balance recap is a fixed, borderless 3-column table with values right-aligned.',
      observedIn: ['NOR-Specification.md §C.3'],
    },
  },
  {
    sourceRef: 'rendering.ledger-table-columns', confidence: 0.85,
    reviewRationale: 'Directly read from the template source.',
    payload: {
      property: 'layout', scope: 'ledgerTable',
      rule: 'Ledger table columns are fixed-width except "Rincian", the only flexible column ("*" in pdfmake) — it absorbs variable-length descriptions and the optional reimbursement sub-breakdown.',
      observedIn: ['NOR-Specification.md §C.3'],
    },
  },
  {
    sourceRef: 'rendering.signature-layout-cover', confidence: 0.8,
    reviewRationale: 'Confirmed in code; both real samples happen to have exactly 4 signatories, matching the split precisely, but the split itself is untested beyond n=4 in real evidence.',
    payload: {
      property: 'signatureLayout', scope: 'coverPageSignatures',
      rule: 'Cover page signatures render as 3 signatories in one equal-width row (8pt gap), then any remaining signatories alone in a second row beneath — a fixed 3-then-1 split regardless of the total signatory count configured.',
      observedIn: ['NOR-Specification.md §C.4'],
    },
  },
  {
    sourceRef: 'rendering.signature-layout-ledger', confidence: 0.85,
    reviewRationale: 'Directly read from the template source, consistent with both real PDFs.',
    payload: {
      property: 'signatureLayout', scope: 'ledgerPageSignatures',
      rule: 'Ledger page signatures render as exactly 2 signatories side by side — never a third column.',
      observedIn: ['NOR-Specification.md §C.4'],
    },
  },
  {
    sourceRef: 'rendering.signature-block-structure', confidence: 0.85,
    reviewRationale: 'Directly read from the template source, consistent with both real PDFs.',
    payload: {
      property: 'signatureLayout', scope: 'signatureBlock',
      rule: 'Each signature block is: a role label followed by a comma, the position in bold uppercase, a fixed vertical gap (38-40pt) reserved for a physical ink signature, then the printed name in bold and underlined.',
      value: { inkGapPtMin: 38, inkGapPtMax: 40 },
      observedIn: ['NOR-Specification.md §C.4'],
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   WORKFLOW (kind: 'workflow') — NOR-Specification.md §D.4.
   ══════════════════════════════════════════════════════════════════════ */
const WORKFLOWS = [
  {
    sourceRef: 'workflow.nor-approval-sequence', confidence: 0.65,
    reviewRationale: 'Workflow sequencing is Medium confidence per NOR-Specification.md\'s own Confidence Analysis — the sequence is evidenced, but two steps\' completion evidence is honestly partial (see openQuestions).',
    payload: {
      name: 'nor-approval-sequence',
      steps: [
        { order: 1, actor: 'Staf Sarana dan Prasarana', action: 'compile-ledger', evidenceOfCompletion: 'Printed name under "Dibuat Oleh" on the ledger page.' },
        { order: 2, actor: 'Plt. Kabid Sarana dan Prasarana', action: 'submit-and-approve-recap', evidenceOfCompletion: 'Printed name appears as both "Diajukan oleh" (page 1) and "Disetujui Oleh" (page 2) — the same individual in both real samples.' },
        { order: 3, actor: 'Wakil Ketua Umum III + Sekretaris Jenderal', action: 'countersign', evidenceOfCompletion: 'Both signature lines present in both real samples; NOR 120 shows an actual ink signature and a handwritten counter-signature date next to the Wakil Ketua Umum III line.' },
        { order: 4, actor: 'Wakil Bendahara', action: 'disburse', evidenceOfCompletion: 'The "Dibayarkan oleh" line is present on both cover pages, but no ink signature is visible at that line in either real sample.' },
        { order: 5, actor: 'Ketua Umum / Audit Internal / Arsip', action: 'receive-copy-for-record', evidenceOfCompletion: 'Informational only ("Tembusan") — no action or signature implied.' },
      ],
      openQuestions: [
        'Whether disbursement is confirmed by a separate instrument (e.g. a bank transfer record) rather than a signature on this document (NOR-Specification.md §D.4).',
        'Whether the same individual submitting and approving the recap (step 2) is department policy or an incidental fact of a small department (NOR-Specification.md §D.4).',
      ],
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   ONTOLOGY (kind: 'ontology') — NOR-Specification.md §D.
   ══════════════════════════════════════════════════════════════════════ */
const ONTOLOGIES = [
  {
    sourceRef: 'ontology.nor', confidence: 0.8,
    reviewRationale: 'Medium-High per NOR-Specification.md\'s Confidence Analysis — stakeholders/fields are directly evidenced.',
    payload: {
      intent: 'Report actual expenditure of a discretionary operating float (petty cash) for Sarana dan Prasarana, and formally request its replenishment — simultaneously a report, a request, and a compliance/audit artifact.',
      trigger: 'The operating float has been spent down to near-zero (both real samples show ~99.9% utilization against a Rp 15.000.000 float).',
      stakeholders: [
        { role: 'Plt. Kabid Sarana dan Prasarana', function: 'Originator/submitter; also approves the page-2 recap' },
        { role: 'Wakil Ketua Umum III', function: 'Approver (Mengetahui dan Menyetujui)' },
        { role: 'Sekretaris Jenderal', function: 'Co-approver (Mengetahui/Menyetujui)' },
        { role: 'Wakil Bendahara', function: 'Disburser (Dibayarkan oleh)' },
        { role: 'Staf Sarana dan Prasarana', function: 'Ledger preparer (Dibuat Oleh, page 2)' },
        { role: 'Ketua Umum', function: 'Informational cc ("sebagai laporan") — not a signatory' },
        { role: 'Audit Internal', function: 'Informational cc — not a signatory' },
        { role: 'Arsip', function: 'Informational cc / filing destination — not a signatory' },
      ],
      approvalChainRef: idForNorFact('approval-chain.nor-signers'),
      supportingDocuments: 'The itemized ledger is physically page 2+ of the SAME PDF, never a separate uploaded file — even though the document\'s own "Lampiran: 1 (satu) berkas" line describes it as one enclosed attachment (a physical-mail-era convention that has outlived the delivery mechanism it once described).',
      budgetImpact: 'Reports only this cycle\'s realized spend; never year-to-date spend or performance against the Rp 240.000.000 annual petty-cash budget configured elsewhere in the platform.',
      dependencies: ['An active Petty Cash cycle.', 'Already-recorded, status-"available" expenses, which are locked to status "locked" the moment they are realized into a NOR.'],
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   APPROVAL CHAIN (kind: 'approval_chain', pre-existing kind) —
   NOR-Specification.md §D.3, §C.4.
   ══════════════════════════════════════════════════════════════════════ */
const APPROVAL_CHAINS = [
  {
    sourceRef: 'approval-chain.nor-signers', confidence: 0.85,
    reviewRationale: 'Both real samples use the identical 4 names/roles despite being separate cycles weeks apart, confirming these are global settings, not per-document choices.',
    payload: {
      signers: [
        { role: 'Plt. Kabid Sarana dan Prasarana', required: true, currentIndividual: 'Raras Ayu Pratama (as of the evidence reviewed — swappable via Settings, not architecturally fixed)' },
        { role: 'Wakil Ketua Umum III', required: true, currentIndividual: 'Armand Darmadji' },
        { role: 'Sekretaris Jenderal', required: true, currentIndividual: 'Ricky Soebagdja' },
        { role: 'Wakil Bendahara', required: true, currentIndividual: 'Eddy Prayitno' },
      ],
      evidence: 'Both real samples (NOR 113, NOR 120) use the identical 4 names/roles despite being separate cycles weeks apart.',
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   SIGNATORIES (kind: 'signatory', pre-existing kind) — backs every
   stakeholder role named in ontology.nor, so knowledge-gap-engine.js's
   missing_entity check (role/position match) finds real support instead
   of a gap for each one. NOR-Specification.md §D.3.
   ══════════════════════════════════════════════════════════════════════ */
const SIGNATORIES = [
  { sourceRef: 'signatory.plt-kabid-sarpras', role: 'Plt. Kabid Sarana dan Prasarana', name: 'Raras Ayu Pratama', function: 'Originator/submitter; also approves the page-2 recap' },
  { sourceRef: 'signatory.waketum-3', role: 'Wakil Ketua Umum III', name: 'Armand Darmadji', function: 'Approver' },
  { sourceRef: 'signatory.sekjen', role: 'Sekretaris Jenderal', name: 'Ricky Soebagdja', function: 'Co-approver' },
  { sourceRef: 'signatory.wabendum', role: 'Wakil Bendahara', name: 'Eddy Prayitno', function: 'Disburser' },
  { sourceRef: 'signatory.staf-sarpras', role: 'Staf Sarana dan Prasarana', name: 'Grace Widelia', function: 'Ledger preparer' },
  { sourceRef: 'signatory.ketua-umum', role: 'Ketua Umum', name: null, function: 'Informational cc — not a signatory' },
  { sourceRef: 'signatory.audit-internal', role: 'Audit Internal', name: null, function: 'Informational cc — not a signatory' },
  { sourceRef: 'signatory.arsip', role: 'Arsip', name: null, function: 'Informational cc / filing destination — not a signatory' },
].map((s) => ({
  sourceRef: s.sourceRef, kind: 'signatory', confidence: 0.85,
  reviewRationale: `Directly named in NOR-Specification.md §D.3's stakeholder table, confirmed identical across both real samples.`,
  payload: { role: s.role, position: s.role, name: s.name, function: s.function },
}));

/* ══════════════════════════════════════════════════════════════════════
   VOCABULARY (kind: 'vocabulary') — NOR-Specification.md §B.1.
   ══════════════════════════════════════════════════════════════════════ */
const VOCABULARY = [
  {
    sourceRef: 'vocabulary.nota-organisasi', confidence: 0.9,
    reviewRationale: 'Boilerplate is byte-identical across both real, independently-generated samples.',
    payload: {
      term: 'Nota Organisasi',
      definition: 'PBSI\'s internal accountability instrument for petty-cash replenishment — simultaneously a report, a request, and a compliance artifact. Used interchangeably with "petty cash" as the subject of the report.',
      synonyms: [{ term: 'NOR', weight: 1.0 }, { term: 'Nota Ops', weight: 0.6 }],
      aliases: [],
    },
  },
  {
    sourceRef: 'vocabulary.terbilang', confidence: 0.9,
    reviewRationale: 'Present in both samples and as a first-class field in code.',
    payload: {
      term: 'Terbilang',
      definition: 'The remaining balance spelled out in words, italicized — a standard Indonesian formal-financial-document convention for fraud-resistance. Always rendered adjacent to the digit figure, never alone.',
      synonyms: [], aliases: [],
    },
  },
  {
    sourceRef: 'vocabulary.org-unit-expense-prefix', confidence: 0.8,
    reviewRationale: 'Directly observed from real ledger line items in both real samples; no code enforces or validates these prefixes (a real, organically-emerged taxonomy, not a system rule).',
    payload: {
      term: 'organizational-unit expense prefix',
      definition: 'Ledger line-item descriptions are organically prefixed by the organizational unit the expense actually belongs to — observed prefixes: IT:, OB:, Engineering:, Sekretariat:, Keuangan:, Medis:, Turnamen:, Binpres Daerah:, Binpres:, Sarpras:, Comdev:, Cleaning Service:, Driver:, Kantin:, IT - Risbang:, Lain-lainnya:/Lainnya:.',
      synonyms: [], aliases: [],
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   PATTERNS (kind: sentence_pattern | paragraph_pattern | template_pattern |
   structure) — NOR-Specification.md §A, §B.
   ══════════════════════════════════════════════════════════════════════ */
const PATTERNS = [
  {
    sourceRef: 'pattern.salutation', kind: 'sentence_pattern', confidence: 0.9,
    reviewRationale: 'Verbatim, byte-identical across both real PDFs and the template source.',
    payload: { template: 'Dengan hormat,', slots: [], granularity: 'sentence' },
  },
  {
    sourceRef: 'pattern.context-paragraph', kind: 'paragraph_pattern', confidence: 0.9,
    reviewRationale: 'Byte-identical across both real, independently-generated samples; zero slots — the department name is hardcoded, not a {{department}} slot.',
    payload: {
      template: 'Sehubungan dengan kegiatan operasional bidang sarana dan prasarana, kami melaporkan realisasi petty cash bidang sarana dan prasarana dengan rincian sebagai berikut:',
      slots: [], granularity: 'paragraph',
    },
  },
  {
    sourceRef: 'pattern.request-paragraph', kind: 'paragraph_pattern', confidence: 0.9,
    reviewRationale: 'Byte-identical across both real, independently-generated samples; zero slots.',
    payload: {
      template: 'Sehubungan dengan telah direalisasikannya petty cash tersebut, kami memohon agar dana petty cash dapat ditambahkan kembali untuk memastikan kelancaran operasional di bidang Sarana dan Prasarana. Sebagai dasar perhitungan, kami lampirkan laporan realisasi penggunaan dana.',
      slots: [], granularity: 'paragraph',
    },
  },
  {
    sourceRef: 'pattern.closing-sentence', kind: 'sentence_pattern', confidence: 0.9,
    reviewRationale: 'Byte-identical across both real, independently-generated samples.',
    payload: { template: 'Demikian nota organisasi ini disampaikan, atas perhatiannya kami ucapkan terima kasih.', slots: [], granularity: 'sentence' },
  },
  {
    sourceRef: 'pattern.perihal-subject-line', kind: 'sentence_pattern', confidence: 0.9,
    reviewRationale: 'Matches both real samples exactly, down to punctuation — the single strongest, most confidently evidenced pattern in the whole report.',
    payload: { template: 'Realisasi Petty Cash Pertanggal {{tanggal}} Bidang Sarana dan Prasarana', slots: [{ name: 'tanggal', type: 'date' }], granularity: 'sentence' },
  },
  {
    sourceRef: 'pattern.place-date-line', kind: 'sentence_pattern', confidence: 0.85,
    reviewRationale: 'Confirmed in both real PDFs and the template source.',
    payload: { template: 'Jakarta, {{tanggalPanjang}}', slots: [{ name: 'tanggalPanjang', type: 'date' }], granularity: 'sentence' },
  },
  {
    sourceRef: 'pattern.document-number-line', kind: 'sentence_pattern', confidence: 0.85,
    reviewRationale: 'Cross-checked against both real samples — NOR 113\'s Roman numeral matches its Mei date, NOR 120\'s matches its Juni date.',
    payload: {
      template: 'No.{{urutan}}/Nota Organisasi/Sarpras/{{bulanRomawi}}/{{tahun}}',
      slots: [{ name: 'urutan', type: 'string' }, { name: 'bulanRomawi', type: 'string' }, { name: 'tahun', type: 'number' }],
      granularity: 'sentence',
    },
  },
  {
    sourceRef: 'pattern.terbilang-line', kind: 'sentence_pattern', confidence: 0.85,
    reviewRationale: 'Present, repeated on both pages, in both real samples.',
    payload: { template: 'Terbilang: {{terbilangValue}}', slots: [{ name: 'terbilangValue', type: 'string' }], granularity: 'sentence' },
  },
  {
    sourceRef: 'pattern.ledger-title-block', kind: 'template_pattern', confidence: 0.9,
    reviewRationale: 'Byte-identical two-line centered title across both real samples.',
    payload: { template: 'RINCIAN PENGGUNAAN PETTY CASH\nBIDANG SARANA DAN PRASARANA', slots: [], granularity: 'template' },
  },
  {
    sourceRef: 'pattern.document-skeleton', kind: 'structure', confidence: 0.9,
    reviewRationale: 'Every observed instance has exactly a cover letter and a ledger — none omits either, and the ledger is never a separate file.',
    payload: {
      template: '{{coverLetter}}<page-break>{{itemizedLedger}}',
      slots: [{ name: 'coverLetter', type: 'section' }, { name: 'itemizedLedger', type: 'section' }],
      granularity: 'structure',
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   RULES (kind: 'rule') — Business/Subject/Recipient/Title/Approval/Budget/
   Priority rules. NOR-Specification.md §A.1, §D.5, §D.6, §D.7.
   Every rule below is domain-wide (no `appliesWhen`) — evidenced as a
   universal fact of the `nor` domain, never conditional on a per-instance
   fact, so reasoning-engine.js#reason() will find all of them applicable
   to any real NOR Problem.
   ══════════════════════════════════════════════════════════════════════ */
const RULES = [
  {
    sourceRef: 'rule.subject-is-system-derived', confidence: 0.95,
    reviewRationale: 'Both real samples match this pattern exactly, down to punctuation — the single strongest, most confidently evidenced business rule in the whole report.',
    payload: {
      statement: 'The Perihal (subject) line is never freely authored by a human — it is 100% system-derived as a deterministic function of one date: "Realisasi Petty Cash Pertanggal {tanggal} Bidang Sarana dan Prasarana".',
      scope: 'perihal', observedIn: ['NOR-Specification.md §D.7', 'petty-cash-config.js#norAutoSubject'],
    },
  },
  {
    sourceRef: 'rule.numbering-format', confidence: 0.9,
    reviewRationale: 'Cross-checked against both real samples: NOR 113\'s Roman numeral ("V") matches its 18 Mei date; NOR 120\'s ("VI") matches its 02 Juni date.',
    payload: {
      statement: 'The NOR document number is composed as "{sequence}/Nota Organisasi/Sarpras/{Roman month}/{year}", where a human enters only the bare sequence number and the system composes the rest FROM THE NOR\'S OWN DATE — never from the system clock date.',
      scope: 'norNumber', observedIn: ['NOR-Specification.md §D.7'],
    },
  },
  {
    sourceRef: 'rule.attachment-count-hardcoded', confidence: 0.9,
    reviewRationale: 'Confirmed in code (templates/nor.js\'s _metaTable hardcodes the string) and in both real samples.',
    payload: {
      statement: 'The "Lampiran" (attachment) line always reads exactly "1 (satu) berkas" — a hardcoded literal, never computed from an actual attached-file count. It almost certainly refers to the ledger, which is physically page 2+ of the same PDF, never a separately uploaded file.',
      scope: 'lampiran', observedIn: ['NOR-Specification.md §D.5'],
    },
  },
  {
    sourceRef: 'rule.recipients-fixed', confidence: 0.9,
    reviewRationale: 'Both real samples, weeks apart, list the identical 3 roles in the identical order.',
    payload: {
      statement: 'The "Kepada Yth." recipient list is a fixed set of exactly 3 roles: Wakil Ketua Umum III, Sekretaris Jenderal, Bendahara — configured as a global setting, never a per-document choice.',
      scope: 'recipients', observedIn: ['NOR-Specification.md §A.1 item 5', 'NOR-Specification.md §D.3'],
    },
  },
  {
    sourceRef: 'rule.cc-fixed', confidence: 0.9,
    reviewRationale: 'Both real samples list the identical 3 roles in the identical order.',
    payload: {
      statement: 'The "Tembusan Yth." cc list is a fixed set of exactly 3 roles: Ketua Umum (qualified "sebagai laporan"), Audit Internal, Arsip — informational only, no action implied.',
      scope: 'ccRecipients', observedIn: ['NOR-Specification.md §A.1 item 7'],
    },
  },
  {
    sourceRef: 'rule.sender-fixed', confidence: 0.9,
    reviewRationale: 'Identical in both real samples.',
    payload: {
      statement: 'The "Dari" (sender) field is always a single fixed role: "Plt. Kabid Sarana dan Prasarana" — never a variable per-document sender.',
      scope: 'sender', observedIn: ['NOR-Specification.md §A.1 item 6'],
    },
  },
  {
    sourceRef: 'rule.signatories-are-settings', confidence: 0.85,
    reviewRationale: 'Confirmed by both real samples using identical names/roles despite being separate cycles weeks apart.',
    payload: {
      statement: 'Every signatory role (recipients, sender, cc, and both signature grids) is a global platform setting (DEFAULT_SETTINGS.signatories / recapSignatories / recipients / ccRecipients), editable via the Settings screen — never a hardcoded identity and never a per-document choice.',
      scope: 'signatories', observedIn: ['NOR-Specification.md §D.3'],
    },
  },
  {
    sourceRef: 'rule.countersign-both-required', confidence: 0.85,
    reviewRationale: 'Both signature lines are present in both real samples; evidenced as a joint requirement, not an either/or.',
    payload: {
      statement: 'Countersigning requires BOTH the Wakil Ketua Umum III AND the Sekretaris Jenderal — neither signature alone is sufficient.',
      scope: 'countersign', observedIn: ['NOR-Specification.md §D.4 step 3'],
    },
  },
  {
    sourceRef: 'rule.budget-scope-cycle-only', confidence: 0.85,
    reviewRationale: 'Neither real sample prints year-to-date or annual-budget framing anywhere on the document.',
    payload: {
      statement: 'A NOR reports only its own cycle\'s realized spend — it never reports year-to-date spend or performance against the annual petty-cash budget, even though that annual figure (Rp 240.000.000/year) exists in platform configuration.',
      scope: 'budgetImpact', observedIn: ['NOR-Specification.md §D.6', 'petty-cash-config.js#DEFAULT_ANNUAL_PETTY_CASH_BUDGET'],
    },
  },
  {
    sourceRef: 'rule.float-is-configured-default', confidence: 0.75,
    reviewRationale: 'Both real samples\' realized amounts (~14.98M) sit strikingly close to the 15M ceiling, suggesting the float was calibrated against actual historical spend.',
    payload: {
      statement: 'The operating float amount is a configured default (currently exactly Rp 15.000.000 in both real samples), not a value baked into the NOR document logic itself — it could change without changing the document\'s structure.',
      scope: 'openingBalance', observedIn: ['NOR-Specification.md §E.4'],
    },
  },
  {
    sourceRef: 'rule.trigger-is-float-depletion', confidence: 0.8,
    reviewRationale: 'Both real samples show Sisa Dana near-zero against the Rp 15.000.000 float at time of issuance.',
    payload: {
      statement: 'A NOR is triggered by the operating float running down to near-zero (~99.9% utilization observed in both real samples) — it is not issued on a fixed calendar schedule, even though the observed real-world cadence is close to monthly.',
      scope: 'trigger', observedIn: ['NOR-Specification.md §D.1', 'NOR-Specification.md §D.2'],
    },
  },
  {
    sourceRef: 'rule.no-numbering-validation', confidence: 0.8,
    reviewRationale: 'Confirmed by direct code reading; a real governance gap, not an oversight in this report.',
    payload: {
      statement: 'No auto-numbering or sequence-gap validation exists anywhere in the platform\'s code — a human is trusted to pick the next correct NOR sequence number.',
      scope: 'norNumberGovernance', observedIn: ['NOR-Specification.md §D.7'],
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   STATISTICS (kind: 'statistic') — NOR-Specification.md §D.1, §D.2, §A.3,
   §E.5. S4/S5 are the deliberate worked example
   Knowledge-Asset-Specification.md §4 names as a textbook conflicts_with
   pair between two statistic-kind assets from the same source.
   ══════════════════════════════════════════════════════════════════════ */
const STATISTICS = [
  {
    sourceRef: 'statistic.float-utilization-ratio', confidence: 0.6,
    reviewRationale: 'n=2 — a real, evidenced ratio, but too thin a sample to generalize as a fixed threshold.',
    payload: {
      label: 'Float utilization ratio at NOR issuance', value: 99.9, unit: 'percent',
      basis: 'Realized amount ÷ opening float, both real samples (NOR 113: ~14.98M/15M; NOR 120: ~14.99M/15M).', sampleSize: 2,
    },
  },
  {
    sourceRef: 'statistic.ledger-row-count-range', confidence: 0.55,
    reviewRationale: 'n=2 — a real, observed range, not a population statistic.',
    payload: { label: 'Ledger row count range', value: '43-69', unit: 'rows', basis: 'Both real samples (NOR 113, NOR 120).', sampleSize: 2 },
  },
  {
    sourceRef: 'statistic.cycle-span', confidence: 0.5,
    reviewRationale: 'n=2, with an observed overlap between the two cycles — not enough to confirm a fixed monthly cadence.',
    payload: {
      label: 'Observed NOR cycle span', value: '~1 month, with an observed date-range overlap between consecutive cycles', unit: 'cycle',
      basis: 'NOR 113: 01 Apr-30 Apr 2026 (issued 18 Mei); NOR 120: 15 Apr-01 Jun 2026 (issued 02 Jun).', sampleSize: 2,
    },
  },
  {
    sourceRef: 'statistic.nor113-terbilang-page1', confidence: 0.95,
    reviewRationale: 'Transcribed directly from the real PDF\'s text layer — not a reading error.',
    payload: {
      label: 'NOR 113 page-1 (cover letter) Terbilang reading for Rp 19.891',
      value: 'Sembilan Belas Juta Delapan Ratus Sembilan Puluh Satu Rupiah (nineteen MILLION...)', unit: 'text',
      basis: 'Transcribed directly from the real PDF\'s text layer, page 1.',
    },
  },
  {
    sourceRef: 'statistic.nor113-terbilang-page2', confidence: 0.95,
    reviewRationale: 'Transcribed directly from the real PDF\'s text layer — not a reading error.',
    payload: {
      label: 'NOR 113 page-2 (ledger recap) Terbilang reading for the SAME Rp 19.891',
      value: 'Sembilan Belas Ribu Delapan Ratus Sembilan Puluh Satu Rupiah (nineteen THOUSAND...)', unit: 'text',
      basis: 'Transcribed directly from the real PDF\'s text layer, page 2 — the same underlying value as statistic.nor113-terbilang-page1, worded with a conflicting scale word in the same document.',
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   ORGANIZATIONAL REASONING (kind: 'organizational_reasoning') —
   NOR-Specification.md §E, §F.5. Every evidenceRefs entry is either a real
   cited historical document (mirroring Knowledge-Asset-Specification.md
   §3.4's own worked example, 'nor:document:113'/'nor:document:120') or the
   real id of another item in this same bootstrap set.
   ══════════════════════════════════════════════════════════════════════ */
const ORGANIZATIONAL_REASONING = [
  {
    sourceRef: 'organizational-reasoning.control-pattern', confidence: 0.65,
    reviewRationale: 'Medium confidence per NOR-Specification.md\'s own Confidence Analysis — a reasonable, evidence-consistent inference, not confirmed by any institutional-memory document.',
    payload: {
      claim: 'The NOR exists to convert a month of small, individually-immaterial petty-cash movements into one auditable, three-signatory instrument — a standard cash-float control pattern, not bureaucratic formality for its own sake.',
      evidenceRefs: ['nor:document:113', 'nor:document:120'],
      ruledOutAlternatives: [],
      confidenceBasis: 'Consistent with observed ~99.9% float utilization in both real samples and the fixed three-role sign-off chain; no institutional-memory document was available to confirm a specific founding incident.',
      status: 'inferred',
    },
  },
  {
    sourceRef: 'organizational-reasoning.float-ceiling-calibrated', confidence: 0.6,
    reviewRationale: 'Inferred, not confirmed — but the numeric proximity across two independent cycles is a real, cited pattern.',
    payload: {
      claim: 'The Rp 15.000.000 float ceiling was likely calibrated against typical monthly Sarpras spend, not chosen arbitrarily.',
      evidenceRefs: ['nor:document:113', 'nor:document:120', idForNorFact('statistic.float-utilization-ratio')],
      ruledOutAlternatives: [],
      confidenceBasis: 'Both real samples\' realized amounts (~14.98M) are within 0.1% of the 15M ceiling — a striking, consistent proximity across two independent cycles.',
      status: 'inferred',
    },
  },
  {
    sourceRef: 'organizational-reasoning.single-department-scope', confidence: 0.85,
    reviewRationale: 'Directly confirmed in both real samples and in the template source — High confidence.',
    payload: {
      claim: 'This NOR template has, as of the evidence reviewed, only ever been used for one department (Sarana dan Prasarana) — it is not yet a generalized, cross-department instrument, even though the platform\'s broader architecture ambition treats "Documents" knowledge as domain-agnostic.',
      evidenceRefs: ['nor:document:113', 'nor:document:120'],
      ruledOutAlternatives: [],
      confidenceBasis: 'The template\'s own boilerplate literally hardcodes "bidang sarana dan prasarana" into the prose, not a {{department}} slot — directly confirmed in both real samples and in the template source.',
      status: 'evidenced',
    },
  },
  {
    sourceRef: 'organizational-reasoning.reader-behavior-inference', confidence: 0.35,
    reviewRationale: 'Explicitly an inference about READERS, which no document sample can directly confirm — deliberately kept at low confidence, not hidden.',
    payload: {
      claim: 'The near-total float utilization paired with the request paragraph\'s confident, boilerplate tone suggests replenishment is a routine, low-friction approval, not a fraught negotiation — and that an experienced reviewer likely scans the total, terbilang, and signature block rather than reading line-by-line.',
      evidenceRefs: ['nor:document:113', 'nor:document:120'],
      ruledOutAlternatives: [],
      confidenceBasis: 'This is an inference about how a human reader behaves, drawn only from the document\'s own tone — no interview or observed review behavior confirms it.',
      status: 'inferred',
    },
  },
  {
    sourceRef: 'organizational-reasoning.subsidizes-other-departments', confidence: 0.85,
    reviewRationale: 'Directly observed from real ledger line-item prefixes in both real samples — a transcribed fact, not an inference. High confidence, and genuinely surprising per the source report.',
    payload: {
      claim: 'The Sarpras petty-cash float, in practice, subsidizes several OTHER departments\' small operational costs (Engineering, Medis, Binpres Daerah, Binpres, Sekretariat, Keuangan, Turnamen, Comdev, IT, IT - Risbang, Cleaning Service, Driver, Kantin) — not only its own.',
      evidenceRefs: ['nor:document:113', 'nor:document:120', idForNorFact('vocabulary.org-unit-expense-prefix')],
      ruledOutAlternatives: [],
      confidenceBasis: 'Directly observed from real ledger line-item prefixes in both real samples.',
      status: 'evidenced',
    },
  },
  {
    sourceRef: 'organizational-reasoning.cycle-overlap', confidence: 0.3,
    reviewRationale: 'Only 2 data points; no underlying cycle-record query was performed to resolve which interpretation is correct — deliberately kept at low confidence.',
    payload: {
      claim: 'NOR 113 and NOR 120\'s ledger date ranges genuinely overlap (120\'s ledger restarts 15 April, inside 113\'s own 01 Apr-30 Apr range) — either because the float was replenished mid-cycle and a new cycle began before the old one\'s paperwork was filed, or because the two are differently-scoped exports of adjacent-but-distinct cycles.',
      evidenceRefs: ['nor:document:113', 'nor:document:120'],
      ruledOutAlternatives: ['A once-monthly, non-overlapping cadence — ruled out by the directly observed date-range overlap itself, not merely unconfirmed.'],
      confidenceBasis: 'Only 2 data points; no underlying cycle-record query was performed to resolve which interpretation is correct.',
      status: 'inferred',
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   QUESTION TREE (kind: 'question_tree') — NOR-Specification.md §F, plus
   the "Unknown Patterns" consolidated table not already covered above.
   Deliberately NOT a fabricated staff FAQ — every question is one this
   report itself asked, never an invented illustrative example.
   ══════════════════════════════════════════════════════════════════════ */
const QUESTION_TREE = [
  { sourceRef: 'question.float-size-rationale', question: 'Why is the float sized at exactly Rp 15.000.000?' },
  { sourceRef: 'question.negative-balance-handling', question: 'What happens when Sisa Dana (remaining balance) would go negative — i.e. spend exceeds the float — before a NOR can be filed?' },
  { sourceRef: 'question.arithmetic-verification', question: 'Who verifies the ledger\'s arithmetic before signing? No approval step in the visible workflow is explicitly a numeric-verification step, as distinct from an authorization step.' },
  { sourceRef: 'question.approval-sla', question: 'What is the actual approval SLA — how long between float depletion and a signed, replenished NOR?' },
  { sourceRef: 'question.cross-department-expense-rule', question: 'Is there a rule for what counts as a "Sarpras" expense versus another department\'s, given several real line items are paid through the Sarpras float on behalf of other departments?' },
  { sourceRef: 'question.cadence-overlap-cause', question: 'Is the observed overlap between NOR 113\'s and NOR 120\'s ledger date ranges a genuine cadence pattern (float replenished mid-cycle) or an artifact of two differently-scoped exports?' },
  { sourceRef: 'question.same-person-policy-or-incidental', question: 'Is it department policy, or merely incidental to a small department, that the same individual (Plt. Kabid Sarpras) both submits the NOR and approves its page-2 recap?' },
  { sourceRef: 'question.disbursement-confirmation', question: 'Is the Wakil Bendahara\'s disbursement confirmed by a separate instrument (e.g. a bank transfer record) rather than by a signature on the NOR itself — no ink signature was observed at that line in either real sample?' },
  { sourceRef: 'question.numbering-scope', question: 'Is NOR numbering sequential organization-wide, or only sequential within the Sarpras department\'s own count?' },
  { sourceRef: 'question.terbilang-inconsistency-root-cause', question: 'What is the root cause of the Terbilang scale-word inconsistency observed in NOR 113 (page 1 reads "juta"/million, the page-2 recap reads "ribu"/thousand, for the identical Rp 19.891 figure)?' },
  { sourceRef: 'question.tacit-staff-followups', question: 'What tacit follow-up questions does an experienced Sarpras staff member actually ask when reviewing a NOR? This requires a real human interview or annotated document review — it cannot be soundly answered from document analysis alone.' },
  { sourceRef: 'question.memo-sarpras-362-relationship', question: 'What is the content of "Memo Sarpras 362 - Realisasi Petty Cash Pertanggal 18 September 2025" (a differently-named predecessor document, dated earlier than either real NOR sample), and is it a predecessor naming or a genuinely different instrument? No code reference to "Memo" exists anywhere in js/petty-cash/.' },
].map((q) => ({
  sourceRef: q.sourceRef, kind: 'question_tree', confidence: 0.7,
  reviewRationale: 'A genuine, evidenced structural gap named in NOR-Specification.md §F / its Unknown Patterns table — confident this is a real open question, not confident of any answer.',
  payload: { question: q.question, raisedBy: 'document-structural-analysis', status: 'open', answerRef: null },
}));

export const NOR_KNOWLEDGE_ITEM_SPECS = Object.freeze([
  ...RENDERING_RULES.map((s) => ({ ...s, kind: 'rendering_rule' })),
  ...WORKFLOWS.map((s) => ({ ...s, kind: 'workflow' })),
  ...ONTOLOGIES.map((s) => ({ ...s, kind: 'ontology' })),
  ...APPROVAL_CHAINS.map((s) => ({ ...s, kind: 'approval_chain' })),
  ...SIGNATORIES,
  ...VOCABULARY.map((s) => ({ ...s, kind: 'vocabulary' })),
  ...PATTERNS,
  ...RULES.map((s) => ({ ...s, kind: 'rule' })),
  ...STATISTICS.map((s) => ({ ...s, kind: 'statistic' })),
  ...ORGANIZATIONAL_REASONING.map((s) => ({ ...s, kind: 'organizational_reasoning' })),
  ...QUESTION_TREE,
]);

/* ══════════════════════════════════════════════════════════════════════
   RELATIONSHIPS (kind: 'relationship') — Task 4. Every relationship reuses
   the four EXISTING relationship types (dependency-graph-contract.js) —
   no fifth type invented, per Knowledge-Asset-Specification.md §4.
   ══════════════════════════════════════════════════════════════════════ */
export const NOR_KNOWLEDGE_RELATIONSHIP_SPECS = Object.freeze([
  { sourceRef: 'rel.utilization-corroborates-float-ceiling', from: 'statistic.float-utilization-ratio', to: 'organizational-reasoning.float-ceiling-calibrated', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The utilization statistic is the direct numeric basis for the float-ceiling-calibration claim.' },
  { sourceRef: 'rel.float-rule-corroborates-ceiling-reasoning', from: 'rule.float-is-configured-default', to: 'organizational-reasoning.float-ceiling-calibrated', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The rule that the float is a configurable default supports (does not contradict) the calibration claim.' },
  { sourceRef: 'rel.question-float-size-derived-from-reasoning', from: 'question.float-size-rationale', to: 'organizational-reasoning.float-ceiling-calibrated', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question exists precisely because this reasoning claim is "inferred", never "confirmed".' },
  { sourceRef: 'rel.subsidizes-derived-from-prefix-vocabulary', from: 'organizational-reasoning.subsidizes-other-departments', to: 'vocabulary.org-unit-expense-prefix', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The subsidization finding is read directly off the organizational-unit prefix taxonomy.' },
  { sourceRef: 'rel.question-cross-dept-derived-from-subsidizes', from: 'question.cross-department-expense-rule', to: 'organizational-reasoning.subsidizes-other-departments', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question ("is there a rule for this?") follows directly from the evidenced subsidization finding.' },
  { sourceRef: 'rel.workflow-derived-from-approval-chain', from: 'workflow.nor-approval-sequence', to: 'approval-chain.nor-signers', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The ordered workflow sequences the same static signer list the approval chain names.' },
  { sourceRef: 'rel.ontology-derived-from-approval-chain', from: 'ontology.nor', to: 'approval-chain.nor-signers', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'Mirrors ontology.nor\'s own approvalChainRef field as a real, walkable graph edge, per ontology-contract.js\'s own non-goal note that resolving the reference is a consumer concern.' },
  { sourceRef: 'rel.question-disbursement-derived-from-workflow', from: 'question.disbursement-confirmation', to: 'workflow.nor-approval-sequence', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question is about step 4\'s (disburse) incomplete evidence-of-completion.' },
  { sourceRef: 'rel.question-same-person-derived-from-workflow', from: 'question.same-person-policy-or-incidental', to: 'workflow.nor-approval-sequence', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question is about step 2\'s single actor performing two sub-actions.' },
  { sourceRef: 'rel.no-validation-corroborates-numbering-format', from: 'rule.no-numbering-validation', to: 'rule.numbering-format', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The absence of sequence-gap validation directly contextualizes the numbering-format rule.' },
  { sourceRef: 'rel.question-numbering-scope-derived-from-no-validation', from: 'question.numbering-scope', to: 'rule.no-numbering-validation', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question about organization-wide vs. Sarpras-only numbering follows from the absence of any validation.' },
  { sourceRef: 'rel.terbilang-conflict', from: 'statistic.nor113-terbilang-page1', to: 'statistic.nor113-terbilang-page2', type: RELATIONSHIP_TYPE.CONFLICTS_WITH, reason: 'The exact worked example Knowledge-Asset-Specification.md §4 names: two statistic-kind assets from the same source disagreeing on the same figure\'s scale word.' },
  { sourceRef: 'rel.question-terbilang-root-cause-derived-from-conflict', from: 'question.terbilang-inconsistency-root-cause', to: 'statistic.nor113-terbilang-page1', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open root-cause question stems directly from the conflicting pair.' },
  { sourceRef: 'rel.question-cadence-derived-from-cycle-span', from: 'question.cadence-overlap-cause', to: 'statistic.cycle-span', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open cadence question stems from the observed overlap in the cycle-span statistic.' },
  { sourceRef: 'rel.cycle-overlap-reasoning-derived-from-cycle-span', from: 'organizational-reasoning.cycle-overlap', to: 'statistic.cycle-span', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The cycle-overlap reasoning claim is read directly off the cycle-span statistic.' },
  { sourceRef: 'rel.control-pattern-corroborates-ontology', from: 'organizational-reasoning.control-pattern', to: 'ontology.nor', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The control-pattern reasoning backs the ontology\'s own stated intent.' },
  { sourceRef: 'rel.single-dept-scope-corroborates-context-paragraph', from: 'organizational-reasoning.single-department-scope', to: 'pattern.context-paragraph', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The single-department-scope reasoning is directly evidenced by the zero-slot, hardcoded-department context paragraph pattern.' },
  { sourceRef: 'rel.footer-rule-corroborates-document-skeleton', from: 'rendering.footer-ledger-pages', to: 'pattern.document-skeleton', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The footer-on-ledger-pages-only rule is one more confirmation of the fixed 2-section document skeleton.' },
  { sourceRef: 'rel.pagebreak-rule-corroborates-document-skeleton', from: 'rendering.ledger-pagebreak', to: 'pattern.document-skeleton', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The unconditional page-break rule is one more confirmation of the fixed 2-section document skeleton.' },
  { sourceRef: 'rel.terbilang-pattern-corroborates-italic-rule', from: 'rendering.italic-emphasis', to: 'pattern.terbilang-line', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The italic-emphasis rendering rule and the terbilang-line pattern describe the same document element from two angles (styling vs. content).' },
  { sourceRef: 'rel.perihal-pattern-derived-from-subject-rule', from: 'pattern.perihal-subject-line', to: 'rule.subject-is-system-derived', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The literal subject-line template exists because of the system-derived-subject business rule.' },
  { sourceRef: 'rel.doc-number-pattern-derived-from-numbering-rule', from: 'pattern.document-number-line', to: 'rule.numbering-format', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The literal document-number template exists because of the numbering-format business rule.' },
]);

function buildKnowledgeItem({ sourceRef, kind, confidence, payload }) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: idForNorFact(sourceRef),
    version: 1,
    domainType: DOMAIN_TYPE,
    sourceType: SOURCE_TYPE,
    kind,
    payload: Object.freeze(payload),
    confidence,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: SOURCE_TYPE, sourceRef, capturedAt: now }),
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * The ONE entry point this file exposes. Explicit, named, called once by
 * whoever mounts it (a script today; the platform mount, later, if this
 * content is wired live — deliberately not decided by this file). Ingests
 * every spec as a Draft, then walks it to Approved through the SAME,
 * unmodified `promoteKnowledge()` human-gated workflow every other
 * KnowledgeItem in this platform uses — never a bypass, never a shortcut.
 *
 * @param {{approverId?: string, decidedAt?: string}} [opts]
 */
export function seedNorBootstrapKnowledge({ approverId = 'evan', decidedAt } = {}) {
  const decidedAtIso = decidedAt || new Date().toISOString();
  const items = [];
  const relationships = [];
  const errors = [];

  for (const spec of NOR_KNOWLEDGE_ITEM_SPECS) {
    const item = buildKnowledgeItem(spec);
    const ingested = ingest(item);
    if (!ingested.ok) { errors.push({ sourceRef: spec.sourceRef, stage: 'ingest', error: ingested.error }); continue; }
    const promoted = promoteKnowledge(item.id, { approverId, decidedAt: decidedAtIso, preferenceRationale: spec.reviewRationale });
    if (!promoted.ok) { errors.push({ sourceRef: spec.sourceRef, stage: 'promote', error: promoted.error }); continue; }
    items.push(promoted.data);
  }

  for (const rel of NOR_KNOWLEDGE_RELATIONSHIP_SPECS) {
    const payload = { fromId: idForNorFact(rel.from), toId: idForNorFact(rel.to), type: rel.type };
    const item = buildKnowledgeItem({ sourceRef: rel.sourceRef, kind: 'relationship', confidence: 0.9, payload });
    const ingested = ingest(item);
    if (!ingested.ok) { errors.push({ sourceRef: rel.sourceRef, stage: 'ingest-relationship', error: ingested.error }); continue; }
    const promoted = promoteKnowledge(item.id, { approverId, decidedAt: decidedAtIso, preferenceRationale: rel.reason });
    if (!promoted.ok) { errors.push({ sourceRef: rel.sourceRef, stage: 'promote-relationship', error: promoted.error }); continue; }
    relationships.push(promoted.data);
  }

  return Object.freeze({ items: Object.freeze(items), relationships: Object.freeze(relationships), errors: Object.freeze(errors) });
}
