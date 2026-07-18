/* ============================================================
   NOR-PERJALANAN-DINAS-PENGADAAN-KNOWLEDGE.JS — Phase 9, Sprint 9.3
   (Knowledge Authoring)

   PURPOSE: the second real Knowledge-authoring event this platform has
   ever produced (the first was
   knowledge/bootstrap/nor-reverse-engineering-knowledge.js, for Realisasi
   Petty Cash). Every fact below is evidenced from 13 real, filled Nota
   Organisasi PDFs the repository owner provided directly (Jan-Apr 2026,
   PBSI Sarpras) — see docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md for the full
   Evidence Inventory and Quality Report this file's payloads cite back to.

   SCOPE, PER SPRINT 9.1's OWN DECISION (docs/SPRINT_9_1_ORGANIZATIONAL_
   DECISION.md): only Perjalanan Dinas (2 independent real documents: NOR
   055, NOR 077) and Pengadaan (4 independent real documents: NOR 005, NOR
   029, NOR 032, NOR 089) are authored here — both already-decided,
   real NOR Types that now clear the 2+-document production-readiness bar
   (docs/NOR_ONBOARDING_PLAYBOOK.md §6). Administration and the
   payroll/leave document cluster found in the same evidence batch are
   NOT authored here — the repository owner explicitly deferred both
   (see docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md §5): Administration because
   2 documents is not enough to safely redefine an already-registered type,
   the payroll/leave cluster because Phase 9's approved scope is the four
   named types only, not incremental taxonomy growth from a small sample.

   Same discipline as the Petty Cash pack: every fact is either
   **evidenced** (cites a specific real document by NOR number) or
   explicitly **inferred** / low-confidence (2-4 samples is real evidence,
   not proof of an organization-wide rule — see confidence values below,
   never above 0.9, and several deliberately at 0.5-0.65). No fact
   generalizes beyond its own NOR Type — `payload.norType` is set on every
   type-specific item; nothing here is left untagged as "Generic" unless
   it is independently corroborated by 3+ NOR Types' worth of evidence
   (see the two corrections to the EXISTING Petty Cash pack below).

   ALSO IN THIS FILE: two corrections to nor-reverse-engineering-
   knowledge.js's existing Petty Cash facts. `rule.numbering-format` and
   `pattern.document-number-line` were tagged `norType: PETTY_CASH` because
   Iteration 2 had only ever seen the numbering convention in petty-cash
   documents. These 13 new documents span 4 different NOR subject matters
   and 12 of 13 (excluding NOR 077's own anomaly — see
   docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md §4) all follow the identical
   "No.{seq}/Nota Organisasi/Sarpras/{bulan romawi}/{tahun}" convention.
   This is a real, evidenced GENERALIZATION of an existing fact, not new
   authoring — this is the exact "measurably learns" capability Sprint 9.7
   is asked to prove. Applied via `correctNumberingFormatToGeneric()`
   below, called once by this file's own seed function, never mutating the
   original file. Uses the SAME real correction path Knowledge Center's
   "Request Changes" UI uses (learning/correction-pipeline-engine.js#
   submitCorrection) — an Approved item is never edited in place; a new
   Candidate is generated, linked back via a DERIVED_FROM relationship, and
   promoted to Approved, then the superseded original is explicitly
   archived (`archiveKnowledge`) so it stops being double-counted by every
   real `listKnowledge({..., lifecycleState: APPROVED})` consumer
   (knowledge-gap-engine.js, nor-composer.js, question-optimizer.js,
   reasoning-engine.js) — nothing in this platform does that archival step
   automatically, by design (a human/this script decides, always).

   DEPENDENCIES: contracts/identity-contract.js, contracts/
   lifecycle-contract.js, contracts/dependency-graph-contract.js,
   services/knowledge-service.js (ingest, promoteKnowledge, getKnowledge,
   archiveKnowledge — the same real verbs every other producer/corrector
   uses), learning/correction-pipeline-engine.js (submitCorrection — the
   same real path Knowledge Center's UI uses), registry/
   nor-type-registry.js.
   ============================================================ */

'use strict';

import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { RELATIONSHIP_TYPE } from '../contracts/dependency-graph-contract.js';
import { ingest, promoteKnowledge, getKnowledge, archiveKnowledge } from '../services/knowledge-service.js';
import {
  startCorrectionSession, submitCorrection, finishCorrectionSession,
} from '../learning/correction-pipeline-engine.js';
import { NOR_TYPE } from '../registry/nor-type-registry.js';

const PERJALANAN_DINAS = NOR_TYPE.PERJALANAN_DINAS;
const PENGADAAN = NOR_TYPE.PENGADAAN;

export const DOMAIN_TYPE = 'nor';
export const SOURCE_TYPE = 'manual-file';

export function idForNorFact(sourceRef) {
  return generateKnowledgeId({ domainType: DOMAIN_TYPE, sourceType: SOURCE_TYPE, sourceRef });
}

/* ══════════════════════════════════════════════════════════════════════
   PERJALANAN DINAS — evidenced from NOR 055, NOR 077 (both real, both
   "Pengajuan Biaya Perjalanan Dinas (BPD)" for a Sirnas venue survey).
   Only 2 independent samples exist — every confidence value below
   reflects that (never above 0.85; several at 0.5-0.6, explicitly marked
   low/inferred where the sample size genuinely cannot support more).
   ══════════════════════════════════════════════════════════════════════ */

const BPD_ONTOLOGIES = [
  {
    sourceRef: 'ontology.perjalanan-dinas', confidence: 0.75,
    reviewRationale: 'Evidenced identically in both real samples (NOR 055, NOR 077) — same event class (Sirnas venue survey) both times; the trigger and stakeholders are consistent, but 2 samples of one specific travel purpose cannot support a broader claim than what was observed.',
    payload: {
      norType: PERJALANAN_DINAS,
      intent: 'Request approval and disbursement of official travel cost (Biaya Perjalanan Dinas/BPD) for a Sarpras staff member to travel and survey a PBSI tournament venue ahead of the event.',
      trigger: 'An upcoming PBSI tournament (both real samples: Sirkuit Nasional/Sirnas) requires a Sarpras representative to travel and verify venue/facility readiness before the event.',
      stakeholders: [
        { role: 'Staf bidang Sarpras', function: 'the traveler who conducts the survey (both samples: Nanang Saepulloh/Saefulloh — name spelled two different ways across real documents, see docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md §4)' },
        { role: 'Staf Sarana dan Prasarana', function: 'compiles the itemized cost breakdown (both samples: Grace Widelia) — a distinct role from the traveler' },
        { role: 'Kabid/Plt. Kabid Sarana dan Prasarana', function: 'reviews and submits the NOR, approves the cost breakdown' },
        { role: 'Wakil Ketua Umum III', function: 'approves' },
        { role: 'Sekretaris Jenderal', function: 'acknowledges/approves' },
        { role: 'Wakil Bendahara', function: 'acknowledges/approves — see workflow.bpd-approval-sequence for why this is NOT labeled as disbursement, unlike Petty Cash and payroll NORs' },
      ],
      approvalChainRef: idForNorFact('approval-chain.bpd-signers'),
      observedIn: ['NOR 055 (26 Feb 2026)', 'NOR 077 (25 Mar 2026)'],
    },
  },
];

const BPD_WORKFLOWS = [
  {
    sourceRef: 'workflow.bpd-approval-sequence', confidence: 0.65,
    reviewRationale: 'Sequence and labels are identical across both real samples. Medium, not high, confidence: only 2 samples, and unlike Petty Cash/payroll NORs, neither sample labels the Wakil Bendahara line "Dibayarkan oleh" — both read "Mengetahui/Menyetujui", the same label used for Sekretaris Jenderal. Whether disbursement is confirmed by a separate instrument is a genuine open question (see question.bpd-disbursement-confirmation), not assumed here.',
    payload: {
      norType: PERJALANAN_DINAS,
      name: 'bpd-approval-sequence',
      steps: [
        { order: 1, actor: 'Staf Sarana dan Prasarana', action: 'compile-cost-breakdown', evidenceOfCompletion: 'Printed name under "Dibuat Oleh" on the Rincian BPD attachment, both samples.' },
        { order: 2, actor: 'Kabid/Plt. Kabid Sarana dan Prasarana', action: 'approve-breakdown-and-submit-nor', evidenceOfCompletion: 'Signature as "Disetujui Oleh" on the Rincian attachment AND as "Diajukan oleh" on the NOR cover, both samples.' },
        { order: 3, actor: 'Wakil Ketua Umum III', action: 'approve', evidenceOfCompletion: 'Signature under "Mengetahui dan Menyetujui", both samples.' },
        { order: 4, actor: 'Sekretaris Jenderal', action: 'acknowledge', evidenceOfCompletion: 'Signature under "Mengetahui/Menyetujui", both samples.' },
        { order: 5, actor: 'Wakil Bendahara', action: 'acknowledge', evidenceOfCompletion: 'Signature under "Mengetahui/Menyetujui" (NOT "Dibayarkan oleh") — a real, evidenced difference from Petty Cash and payroll NORs, both samples.' },
      ],
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
];

const BPD_RULES = [
  {
    sourceRef: 'rule.bpd-cost-breakdown-categories', confidence: 0.85,
    reviewRationale: 'Identical 5 categories, identical order, both real samples.',
    payload: {
      norType: PERJALANAN_DINAS,
      statement: 'A BPD cost breakdown is itemized into exactly 5 categories, always in this order: Tiket Pesawat, Hotel, Uang Saku, Uang Makan, Transport Lokal.',
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
  {
    sourceRef: 'rule.bpd-no-pengadaan-involvement', confidence: 0.85,
    reviewRationale: 'Kabid Pengadaan is absent from the approval chain in both real BPD samples, in direct contrast to every real Pengadaan sample where the same role is a required signer — a real structural negative fact, not an absence of data.',
    payload: {
      norType: PERJALANAN_DINAS,
      statement: 'Kabid Pengadaan never appears in a BPD approval chain — this is a travel-cost request, not a goods procurement.',
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
  {
    sourceRef: 'rule.bpd-multi-destination-aggregation', confidence: 0.55,
    reviewRationale: 'Evidenced only once (NOR 055 covers 3 destinations, each with its own breakdown and subtotal, plus a grand total). NOR 077 covers only 1 destination, so this rule cannot be cross-checked against a second multi-destination sample — status: inferred, not confirmed.',
    payload: {
      norType: PERJALANAN_DINAS, status: 'inferred',
      statement: 'When a single BPD covers multiple destinations, each destination gets its own full cost breakdown and subtotal, and the NOR states a grand total across all destinations.',
      observedIn: ['NOR 055'],
    },
  },
  {
    sourceRef: 'rule.bpd-traveler-role-stated', confidence: 0.8,
    reviewRationale: 'Both real samples name the traveler\'s organizational role alongside their name in the NOR body text itself (not only in the signature block).',
    payload: {
      norType: PERJALANAN_DINAS,
      statement: 'The traveler\'s organizational role (e.g. "Staf bidang Sarpras") is always stated alongside their name in the NOR\'s own body paragraph, not only in a signature block.',
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
];

const BPD_RENDERING_RULES = [
  {
    sourceRef: 'rendering.bpd-rincian-table-columns', confidence: 0.85,
    reviewRationale: 'Identical column set, both real samples.',
    payload: {
      norType: PERJALANAN_DINAS,
      property: 'layout', scope: 'bpdRincianTable',
      rule: 'The BPD Rincian (cost breakdown) attachment table columns are: No., Nama Item, Harga Satuan, Keterangan, Jumlah Pembayaran.',
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
  {
    sourceRef: 'rendering.bpd-rincian-separate-signatures', confidence: 0.85,
    reviewRationale: 'Both real samples carry a distinct signature block on the Rincian attachment, separate from the NOR cover page signatures.',
    payload: {
      norType: PERJALANAN_DINAS,
      property: 'signatureLayout', scope: 'bpdRincianAttachment',
      rule: 'The Rincian (cost breakdown) attachment carries its own signature block, separate from the NOR cover page\'s signatures: "Dibuat Oleh, Staf Sarana dan Prasarana" paired with "Disetujui Oleh, Kabid./Plt. Kabid. Sarana dan Prasarana".',
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
];

const BPD_PATTERNS = [
  {
    sourceRef: 'pattern.bpd-perihal-subject-line', kind: 'sentence_pattern', confidence: 0.7,
    reviewRationale: 'Both real samples share the "Pengajuan Biaya Perjalanan Dinas (BPD) Survei Lokasi {{destination}}" shape verbatim. Confidence capped below Petty Cash\'s 0.9-tier equivalent because both evidenced occasions are specifically venue-survey trips — this template is not proven to generalize to a non-survey Perjalanan Dinas (e.g. training, competition travel), which this repository has zero evidence for. Sprint 9.6 correction: the slot was originally named "lokasi", which no real Conversation fact is ever keyed by (nor-composer.js#resolvePattern looks up gatheredFacts BY THE SLOT\'S OWN NAME) — renamed to "destination", the actual registered fieldSchema field this same location fact already flows through, so a real, human-answered Conversation now resolves this pattern instead of it staying an inert, permanently-unresolved placeholder.',
    payload: {
      norType: PERJALANAN_DINAS, status: 'inferred',
      template: 'Pengajuan Biaya Perjalanan Dinas (BPD) Survei Lokasi {{destination}}',
      slots: [{ name: 'destination', type: 'string' }],
      granularity: 'sentence',
      observedIn: ['NOR 055: "...Survei Lokasi Sirnas A Kudus, Sirnas B Medan dan Sirnas B Bengkulu 2026"', 'NOR 077: "...Survei Lokasi Sirnas B Bali 2026"'],
    },
  },
  {
    sourceRef: 'pattern.bpd-context-paragraph', kind: 'paragraph_pattern', confidence: 0.75,
    reviewRationale: 'Near byte-identical opening and closing across both real samples; the middle clause varies with single- vs. multi-destination phrasing (NOR 077 names one date range inline; NOR 055 defers all dates to the per-destination tables) — recorded as one pattern with an honest note, not force-normalized into a single rigid template. Sprint 9.6 correction: "nama" renamed to "traveler" (the actual registered fieldSchema field for this fact) for the same reason as pattern.bpd-perihal-subject-line above. "tahun"/"jabatan"/"kegiatan" are NOT renamed — no registered Perjalanan Dinas fieldSchema field captures a year, a traveler\'s role, or a named activity/event; deriving "tahun" from departureDate would require new derivation logic in nor-composer.js (a code change, out of Knowledge-authoring scope), and "jabatan"/"kegiatan" have no evidenced source field at all (see docs/SPRINT_9_6_COMPOSITION_VALIDATION.md) — left honestly unresolved rather than mapped to a guess.',
    payload: {
      norType: PERJALANAN_DINAS,
      template: 'Sehubungan dengan rencana pelaksanaan Sirkuit Nasional (Sirnas) PBSI {{tahun}} yang dilaksanakan di beberapa daerah, maka dalam memastikan seluruh sarana dan prasarana yang digunakan memadai serta layak digunakan, kami mengajukan biaya perjalanan dinas {{traveler}} ({{jabatan}}) untuk meninjau lokasi pelaksanaan {{kegiatan}}...',
      slots: [{ name: 'tahun', type: 'number' }, { name: 'traveler', type: 'string' }, { name: 'jabatan', type: 'string' }, { name: 'kegiatan', type: 'string' }],
      granularity: 'paragraph',
      note: 'Evidenced only for the venue-survey purpose; single-destination samples name one inline date range, multi-destination samples defer dates to per-destination tables instead. "tahun"/"jabatan"/"kegiatan" have no corresponding registered fieldSchema fact and will always render unresolved from a real Conversation today — a known, documented gap (see docs/SPRINT_9_6_COMPOSITION_VALIDATION.md), not an oversight.',
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
];

const BPD_VOCABULARY = [
  {
    sourceRef: 'vocabulary.bpd-abbreviation', confidence: 0.85,
    reviewRationale: 'Used consistently as the Perihal shorthand and in running body text, both real samples.',
    payload: {
      norType: PERJALANAN_DINAS,
      term: 'BPD', definition: 'Biaya Perjalanan Dinas — the standard abbreviation used in the Perihal line and body text of every real Perjalanan Dinas NOR observed.',
      synonyms: ['Biaya Perjalanan Dinas'], aliases: [],
    },
  },
];

const BPD_APPROVAL_CHAINS = [
  {
    sourceRef: 'approval-chain.bpd-signers', confidence: 0.75,
    reviewRationale: 'Signer roles and order are identical across both real samples. Current individual names cross-checked directly against the evidence dates — see per-signer note.',
    payload: {
      norType: PERJALANAN_DINAS,
      signers: [
        { role: 'Kabid/Plt. Kabid Sarana dan Prasarana', required: true, currentIndividual: 'Monika Yunita, as of the evidence reviewed (Feb-Mar 2026) — a platform-wide transition to Plt. Raras Ayu Pratama is directly evidenced in other NOR subject matter from Apr 2026 onward (see docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md §4), but not yet confirmed for a BPD specifically, since no BPD sample postdates the transition.' },
        { role: 'Wakil Ketua Umum III', required: true, currentIndividual: 'Armand Darmadji' },
        { role: 'Sekretaris Jenderal', required: true, currentIndividual: 'Ricky Soebagdja' },
        { role: 'Wakil Bendahara', required: true, currentIndividual: 'Eddy Prayitno' },
      ],
      observedIn: ['NOR 055', 'NOR 077'],
    },
  },
];

const BPD_SIGNATORIES = [
  { sourceRef: 'signatory.bpd-wakil-ketua-umum-iii', role: 'Wakil Ketua Umum III', name: 'Armand Darmadji', function: 'approves' },
  { sourceRef: 'signatory.bpd-sekretaris-jenderal', role: 'Sekretaris Jenderal', name: 'Ricky Soebagdja', function: 'acknowledges' },
  { sourceRef: 'signatory.bpd-wakil-bendahara', role: 'Wakil Bendahara', name: 'Eddy Prayitno', function: 'acknowledges' },
  { sourceRef: 'signatory.bpd-kabid-sarpras', role: 'Kabid/Plt. Kabid Sarana dan Prasarana', name: 'Monika Yunita (as of the evidence reviewed)', function: 'submits and approves the cost breakdown' },
  { sourceRef: 'signatory.bpd-staf-preparer', role: 'Staf Sarana dan Prasarana', name: 'Grace Widelia', function: 'compiles the itemized cost breakdown' },
  { sourceRef: 'signatory.bpd-traveler', role: 'Staf bidang Sarpras', name: 'Nanang Saepulloh/Saefulloh (spelling varies across real documents)', function: 'the traveler — conducts the venue survey' },
].map((s) => ({
  sourceRef: s.sourceRef, kind: 'signatory', confidence: 0.8,
  reviewRationale: 'Directly named in both real BPD samples (traveler/preparer roles) or consistently across the broader 13-document evidence set (approval-chain roles).',
  payload: {
    role: s.role, position: s.role, name: s.name, function: s.function, norType: PERJALANAN_DINAS,
  },
}));

const BPD_ORGANIZATIONAL_REASONING = [
  {
    sourceRef: 'organizational-reasoning.bpd-lead-time', confidence: 0.5,
    reviewRationale: 'Only 2 samples with real but differing lead times (077: ~1 week; 055: 4 days to ~2 weeks across 3 legs) — real variance observed, not a confirmed policy. Explicitly marked inferred, mirroring organizational-reasoning.float-ceiling-calibrated\'s own confidence discipline for the same reason (thin sample).',
    payload: {
      norType: PERJALANAN_DINAS, status: 'inferred',
      claim: 'BPD requests for a venue survey are typically submitted 1 to roughly 4 weeks before the actual travel dates.',
      evidence: ['NOR 077: submitted 25 Mar for travel 1-2 Apr (~1 week lead)', 'NOR 055: submitted 26 Feb for travel spanning 2-13 Mar (4 days to ~2 weeks lead across 3 legs)'],
    },
  },
];

const BPD_QUESTION_TREE = [
  { sourceRef: 'question.bpd-disbursement-confirmation', question: 'Is BPD disbursement confirmed by a separate instrument, since (unlike Petty Cash and payroll NORs) no "Dibayarkan oleh" label appears at the Wakil Bendahara line in either real BPD sample — only "Mengetahui/Menyetujui"?' },
  { sourceRef: 'question.bpd-non-survey-purpose', question: 'Do Perjalanan Dinas NORs exist for purposes other than venue survey (e.g. training, competition travel, meetings)? Both real samples observed are Sirnas venue-survey trips; no other purpose is evidenced.' },
  { sourceRef: 'question.bpd-numbering-anomaly', question: 'Why does NOR 077 (dated 25 Maret 2026) carry a February ("II") month code instead of March ("III")? Every other reviewed NOR\'s Roman-numeral month code matches its date exactly — see docs/SPRINT_9_2_EVIDENCE_ONBOARDING.md §4.' },
].map((q) => ({
  sourceRef: q.sourceRef, kind: 'question_tree', confidence: 0.7,
  reviewRationale: 'A genuine, evidenced structural gap in the real BPD documents themselves — confident this is a real open question, not confident of any answer.',
  payload: {
    question: q.question, raisedBy: 'document-structural-analysis', status: 'open', answerRef: null, norType: PERJALANAN_DINAS,
  },
}));

/* ══════════════════════════════════════════════════════════════════════
   PENGADAAN — evidenced from NOR 005, NOR 029, NOR 032, NOR 089 (4
   independent real documents — the strongest evidence base of any NOR
   Type this platform has authored except Realisasi Petty Cash itself).
   ══════════════════════════════════════════════════════════════════════ */

const PENGADAAN_ONTOLOGIES = [
  {
    sourceRef: 'ontology.pengadaan', confidence: 0.85,
    reviewRationale: '4 independent real samples, identical structure, identical individual names throughout (Kabid Pengadaan = Yenny Agustine in all 4) — the strongest single-role consistency in the entire evidence base reviewed to date.',
    payload: {
      norType: PENGADAAN,
      intent: 'Request Kabid Pengadaan to procure and Wakil Bendahara to pay for a list of operational goods, equipment, or services needed by Sarpras (e.g. engineering/maintenance supplies, cleaning equipment, printed materials).',
      trigger: 'Sarpras identifies a recurring or one-off operational need for physical goods or printed materials that must be purchased or produced.',
      stakeholders: [
        { role: 'Staf Sarana dan Prasarana', function: 'compiles the itemized purchase list, often citing real marketplace prices as justification (all 4 samples: Grace Widelia)' },
        { role: 'Kabid/Plt. Kabid Sarana dan Prasarana', function: 'reviews, approves the list, and submits the NOR' },
        { role: 'Kabid Pengadaan', function: 'procures the goods ("Diadakan oleh") — all 4 samples: Yenny Agustine' },
        { role: 'Wakil Ketua Umum III', function: 'approves' },
        { role: 'Sekretaris Jenderal', function: 'acknowledges/approves' },
        { role: 'Wakil Bendahara', function: 'pays ("Dibayarkan oleh") — all 4 samples: Eddy Prayitno' },
      ],
      approvalChainRef: idForNorFact('approval-chain.pengadaan-signers'),
      observedIn: ['NOR 005 (5 Jan 2026)', 'NOR 029 (27 Jan 2026)', 'NOR 032 (29 Jan 2026)', 'NOR 089 (15 Apr 2026)'],
    },
  },
];

const PENGADAAN_WORKFLOWS = [
  {
    sourceRef: 'workflow.pengadaan-approval-sequence', confidence: 0.85,
    reviewRationale: 'Identical sequence, identical approval-chain labels ("Diadakan oleh"/"Dibayarkan oleh"), and identical individual names across all 4 real samples — a stronger evidence base than any NOR Type authored this phase besides Realisasi Petty Cash.',
    payload: {
      norType: PENGADAAN,
      name: 'pengadaan-approval-sequence',
      steps: [
        { order: 1, actor: 'Staf Sarana dan Prasarana', action: 'compile-itemized-list', evidenceOfCompletion: 'Printed name under "Dibuat Oleh" on the itemized attachment, all 4 samples.' },
        { order: 2, actor: 'Kabid/Plt. Kabid Sarana dan Prasarana', action: 'approve-list-and-submit-nor', evidenceOfCompletion: 'Signature as "Disetujui Oleh" on the attachment AND as "Diajukan oleh" on the NOR cover, all 4 samples.' },
        { order: 3, actor: 'Wakil Ketua Umum III', action: 'approve', evidenceOfCompletion: 'Signature under "Mengetahui dan Menyetujui", all 4 samples.' },
        { order: 4, actor: 'Sekretaris Jenderal', action: 'acknowledge', evidenceOfCompletion: 'Signature under "Mengetahui/Menyetujui", all 4 samples.' },
        { order: 5, actor: 'Kabid Pengadaan', action: 'procure', evidenceOfCompletion: 'Signature under "Diadakan oleh", all 4 samples, identical individual (Yenny Agustine).' },
        { order: 6, actor: 'Wakil Bendahara', action: 'disburse', evidenceOfCompletion: 'Signature under "Dibayarkan oleh", all 4 samples, identical individual (Eddy Prayitno) — unlike BPD, this IS explicitly labeled as disbursement.' },
      ],
      observedIn: ['NOR 005', 'NOR 029', 'NOR 032', 'NOR 089'],
    },
  },
];

const PENGADAAN_RULES = [
  {
    sourceRef: 'rule.pengadaan-itemized-list-required', confidence: 0.9,
    reviewRationale: '4 of 4 real samples carry a multi-line itemized attachment; zero samples request a single lump sum.',
    payload: {
      norType: PENGADAAN,
      statement: 'Every real Pengadaan NOR carries a multi-line itemized attachment (Nama Item / Harga Satuan / Permintaan / Satuan / Total Harga), never a single lump-sum request.',
      observedIn: ['NOR 005', 'NOR 029', 'NOR 032', 'NOR 089'],
    },
  },
  {
    sourceRef: 'rule.pengadaan-kabid-approval-required', confidence: 0.9,
    reviewRationale: 'The identical individual (Yenny Agustine) signs "Diadakan oleh" in all 4 real samples — the single most consistent signatory fact evidenced this sprint.',
    payload: {
      norType: PENGADAAN,
      statement: 'Kabid Pengadaan is a required approval-chain participant, labeled "Diadakan oleh".',
      observedIn: ['NOR 005', 'NOR 029', 'NOR 032', 'NOR 089'],
    },
  },
  {
    sourceRef: 'rule.pengadaan-price-justification-optional', confidence: 0.7,
    reviewRationale: 'Present in exactly 2 of 4 real samples (029, 089) — evidenced as real but genuinely optional, not universal; the other 2 samples (005, 032) carry no such attachment.',
    payload: {
      norType: PENGADAAN,
      statement: 'A Pengadaan request MAY attach real marketplace listing screenshots (evidenced: Tokopedia) as price justification for each item.',
      observedIn: ['NOR 029 (present)', 'NOR 089 (present)', 'NOR 005 (absent)', 'NOR 032 (absent)'],
    },
  },
  {
    sourceRef: 'rule.pengadaan-running-total-reference', confidence: 0.5,
    reviewRationale: 'Evidenced in exactly 1 of 4 samples (089, which states the FY-to-date Engineering spend as context). Explicitly low confidence, marked inferred — this could be a one-off courtesy note rather than a required convention.',
    payload: {
      norType: PENGADAAN, status: 'inferred',
      statement: 'A Pengadaan NOR may reference the cumulative period-to-date spend for its category as informational context, separate from the current occasion\'s total.',
      observedIn: ['NOR 089'],
    },
  },
];

const PENGADAAN_RENDERING_RULES = [
  {
    sourceRef: 'rendering.pengadaan-itemlist-table-columns', confidence: 0.85,
    reviewRationale: 'Identical column set, all 4 real samples.',
    payload: {
      norType: PENGADAAN,
      property: 'layout', scope: 'pengadaanItemListTable',
      rule: 'The Pengadaan itemized attachment table columns are: No., Nama Item, Harga Satuan, Permintaan, Satuan, Total Harga, Stock.',
      observedIn: ['NOR 005', 'NOR 029', 'NOR 032', 'NOR 089'],
    },
  },
  {
    sourceRef: 'rendering.pengadaan-attachment-signatures', confidence: 0.85,
    reviewRationale: 'All 4 real samples carry a distinct signature block on the itemized-list attachment, separate from the NOR cover page signatures.',
    payload: {
      norType: PENGADAAN,
      property: 'signatureLayout', scope: 'pengadaanItemListAttachment',
      rule: 'The itemized-list attachment carries its own signature block, separate from the NOR cover: "Dibuat Oleh, Staf Sarana dan Prasarana" paired with "Disetujui Oleh, Kabid./Plt. Kabid. Sarana dan Prasarana".',
      observedIn: ['NOR 005', 'NOR 029', 'NOR 032', 'NOR 089'],
    },
  },
];

const PENGADAAN_PATTERNS = [
  {
    sourceRef: 'pattern.pengadaan-perihal-pembelian', kind: 'sentence_pattern', confidence: 0.8,
    reviewRationale: '3 of 4 real samples (029, 032, 089) share the "Pengajuan Pembelian Kebutuhan {{kebutuhan}}" shape verbatim. Sprint 9.6 finding, NOT corrected: "kebutuhan" (a procurement CATEGORY, e.g. "Engineering", "Peralatan Cleaning Service") has no clean, unambiguous match among Pengadaan\'s registered fieldSchema fields (item/quantity/purpose/budget) the way pattern.bpd-perihal-subject-line\'s "lokasi"->"destination" rename did — "purpose" is the nearest candidate but is evidenced as a per-occasion justification (e.g. "Kebutuhan ruang Binpres"), not the same thing as a procurement category, and renaming on that guess would be exactly the fabricated-equivalence this platform\'s own discipline forbids. Left unresolved; see docs/SPRINT_9_6_COMPOSITION_VALIDATION.md.',
    payload: {
      norType: PENGADAAN,
      template: 'Pengajuan Pembelian Kebutuhan {{kebutuhan}}',
      slots: [{ name: 'kebutuhan', type: 'string' }],
      granularity: 'sentence',
      observedIn: ['NOR 029: "...Kebutuhan Engineering Periode Bulan Februari 2026"', 'NOR 032: "...Kebutuhan Peralatan Cleaning Service Pelatnas PBSI"', 'NOR 089: "...Kebutuhan Engineering Tambahan Periode Bulan April 2026"'],
    },
  },
  {
    sourceRef: 'pattern.pengadaan-perihal-pencetakan', kind: 'sentence_pattern', confidence: 0.4,
    reviewRationale: 'Evidenced exactly once (NOR 005). A real, distinct sibling variant to pattern.pengadaan-perihal-pembelian, used when the procurement is a printing/production service rather than a goods purchase — deliberately kept as its own low-confidence pattern rather than merged into the majority template, since one sample cannot establish which verb a given procurement subtype should use.',
    payload: {
      norType: PENGADAAN, status: 'inferred',
      template: 'Pengajuan Pencetakan {{item}}',
      slots: [{ name: 'item', type: 'string' }],
      granularity: 'sentence',
      observedIn: ['NOR 005: "Pengajuan Pencetakan Billboard Galeri Pemenang PBSI Tahun 2024"'],
    },
  },
  {
    sourceRef: 'pattern.pengadaan-context-paragraph', kind: 'paragraph_pattern', confidence: 0.75,
    reviewRationale: 'Byte-identical opening/closing in 2 of 4 samples (029, 089 — both recurring Engineering-category procurement). The other 2 samples (032, 005) use different framing for their own procurement subtype (cleaning-service setup; billboard printing) — scoped explicitly to the recurring-category case, not generalized to every Pengadaan occasion.',
    payload: {
      norType: PENGADAAN,
      template: 'Sehubungan dengan menunjang operasional kebutuhan {{bidang}}, kami mengajukan pembelian kebutuhan {{bidang}} periode bulan {{bulan}} {{tahun}} dengan rincian sebagai berikut:',
      slots: [{ name: 'bidang', type: 'string' }, { name: 'bulan', type: 'string' }, { name: 'tahun', type: 'number' }],
      granularity: 'paragraph',
      note: 'Evidenced only for recurring-category procurement (e.g. Engineering supplies); one-off/special-purpose procurement (cleaning-service setup, billboard printing) uses different framing not captured by this template. "bidang"/"bulan"/"tahun" have no corresponding registered Pengadaan fieldSchema fact (same gap as pattern.pengadaan-perihal-pembelian\'s "kebutuhan") and will render unresolved from a real Conversation today — a known, documented gap, not an oversight; see docs/SPRINT_9_6_COMPOSITION_VALIDATION.md.',
      observedIn: ['NOR 029', 'NOR 089'],
    },
  },
];

const PENGADAAN_VOCABULARY = [
  {
    sourceRef: 'vocabulary.pengadaan-diadakan-oleh', confidence: 0.85,
    reviewRationale: 'Used identically as the Kabid Pengadaan approval label in all 4 real samples, always distinct from "Disetujui Oleh" and "Dibayarkan oleh".',
    payload: {
      norType: PENGADAAN,
      term: 'Diadakan oleh', definition: 'The approval-chain label used specifically for Kabid Pengadaan\'s signature on a Pengadaan NOR, distinct from "Disetujui Oleh" (department-internal approval) or "Dibayarkan oleh" (Bendahara\'s payment confirmation).',
      synonyms: [], aliases: [],
    },
  },
];

const PENGADAAN_APPROVAL_CHAINS = [
  {
    sourceRef: 'approval-chain.pengadaan-signers', confidence: 0.85,
    reviewRationale: 'Signer roles, order, and (for Kabid Pengadaan and Wakil Bendahara) individual identity are identical across all 4 real samples. The Kabid Sarpras transition (Monika Yunita to Plt. Raras Ayu Pratama) is directly evidenced WITHIN this sample set (005/029/032 vs. 089), unlike the BPD evidence where the transition had to be inferred from other document types.',
    payload: {
      norType: PENGADAAN,
      signers: [
        { role: 'Kabid/Plt. Kabid Sarana dan Prasarana', required: true, currentIndividual: 'Raras Ayu Pratama (Plt., as of NOR 089, Apr 2026) — transitioned from Monika Yunita, evidenced in the same document set (NOR 005/029/032, Jan 2026).' },
        { role: 'Wakil Ketua Umum III', required: true, currentIndividual: 'Armand Darmadji' },
        { role: 'Sekretaris Jenderal', required: true, currentIndividual: 'Ricky Soebagdja' },
        { role: 'Kabid Pengadaan', required: true, currentIndividual: 'Yenny Agustine' },
        { role: 'Wakil Bendahara', required: true, currentIndividual: 'Eddy Prayitno' },
      ],
      observedIn: ['NOR 005', 'NOR 029', 'NOR 032', 'NOR 089'],
    },
  },
];

const PENGADAAN_SIGNATORIES = [
  { sourceRef: 'signatory.pengadaan-wakil-ketua-umum-iii', role: 'Wakil Ketua Umum III', name: 'Armand Darmadji', function: 'approves' },
  { sourceRef: 'signatory.pengadaan-sekretaris-jenderal', role: 'Sekretaris Jenderal', name: 'Ricky Soebagdja', function: 'acknowledges' },
  { sourceRef: 'signatory.pengadaan-wakil-bendahara', role: 'Wakil Bendahara', name: 'Eddy Prayitno', function: 'pays (Dibayarkan oleh)' },
  { sourceRef: 'signatory.pengadaan-kabid-pengadaan', role: 'Kabid Pengadaan', name: 'Yenny Agustine', function: 'procures (Diadakan oleh)' },
  { sourceRef: 'signatory.pengadaan-kabid-sarpras', role: 'Kabid/Plt. Kabid Sarana dan Prasarana', name: 'Monika Yunita (Jan 2026) / Raras Ayu Pratama, Plt. (Apr 2026 onward)', function: 'submits and approves the itemized list' },
  { sourceRef: 'signatory.pengadaan-staf-preparer', role: 'Staf Sarana dan Prasarana', name: 'Grace Widelia', function: 'compiles the itemized purchase list' },
].map((s) => ({
  sourceRef: s.sourceRef, kind: 'signatory', confidence: 0.85,
  reviewRationale: 'Directly named, identically, in all 4 real Pengadaan samples.',
  payload: {
    role: s.role, position: s.role, name: s.name, function: s.function, norType: PENGADAAN,
  },
}));

const PENGADAAN_ORGANIZATIONAL_REASONING = [
  {
    sourceRef: 'organizational-reasoning.pengadaan-recurring-monthly-cadence', confidence: 0.65,
    reviewRationale: 'NOR 029 (Feb 2026 period) and NOR 089 (Apr 2026 period, which itself references a Mar 2026 running total, implying a 3rd, unseen request existed) together evidence a real, recurring monthly rhythm for Engineering-category Pengadaan specifically — not evidenced for other procurement subtypes (Cleaning Service, billboard printing each appear only once).',
    payload: {
      norType: PENGADAAN, status: 'inferred',
      claim: 'Pengadaan requests for Engineering supplies recur on a roughly monthly cadence.',
      evidence: ['NOR 029: Feb 2026 period', 'NOR 089: Apr 2026 period, referencing a running total "hingga periode terakhir (Maret 2026)" implying a Mar 2026 request also existed'],
    },
  },
];

const PENGADAAN_QUESTION_TREE = [
  { sourceRef: 'question.pengadaan-item-count-limit', question: 'Is there a maximum line-item count or per-item budget ceiling for a single Pengadaan request? Real samples range from 6 items (NOR 032) to 10 items (NOR 089); no ceiling is stated anywhere in the evidence.' },
  { sourceRef: 'question.pengadaan-price-justification-requirement', question: 'Is a marketplace/vendor price-justification attachment (e.g. Tokopedia screenshots) a required part of the process, or an optional courtesy some preparers include? Present in exactly 2 of 4 real samples.' },
  { sourceRef: 'question.pengadaan-perihal-verb-choice', question: 'Is the choice between "Pengajuan Pembelian" (purchase) and "Pengajuan Pencetakan" (printing) a fixed convention keyed to a procurement subtype, or an ad hoc wording choice by the preparer? Only 1 of 4 real samples uses "Pencetakan".' },
].map((q) => ({
  sourceRef: q.sourceRef, kind: 'question_tree', confidence: 0.7,
  reviewRationale: 'A genuine, evidenced structural gap across the 4 real Pengadaan samples — confident this is a real open question, not confident of any answer.',
  payload: {
    question: q.question, raisedBy: 'document-structural-analysis', status: 'open', answerRef: null, norType: PENGADAAN,
  },
}));

/* ══════════════════════════════════════════════════════════════════════
   ASSEMBLY
   ══════════════════════════════════════════════════════════════════════ */
export const NOR_KNOWLEDGE_ITEM_SPECS = Object.freeze([
  ...BPD_ONTOLOGIES.map((s) => ({ ...s, kind: 'ontology' })),
  ...BPD_WORKFLOWS.map((s) => ({ ...s, kind: 'workflow' })),
  ...BPD_RULES.map((s) => ({ ...s, kind: 'rule' })),
  ...BPD_RENDERING_RULES.map((s) => ({ ...s, kind: 'rendering_rule' })),
  ...BPD_PATTERNS,
  ...BPD_VOCABULARY.map((s) => ({ ...s, kind: 'vocabulary' })),
  ...BPD_APPROVAL_CHAINS.map((s) => ({ ...s, kind: 'approval_chain' })),
  ...BPD_SIGNATORIES,
  ...BPD_ORGANIZATIONAL_REASONING.map((s) => ({ ...s, kind: 'organizational_reasoning' })),
  ...BPD_QUESTION_TREE,
  ...PENGADAAN_ONTOLOGIES.map((s) => ({ ...s, kind: 'ontology' })),
  ...PENGADAAN_WORKFLOWS.map((s) => ({ ...s, kind: 'workflow' })),
  ...PENGADAAN_RULES.map((s) => ({ ...s, kind: 'rule' })),
  ...PENGADAAN_RENDERING_RULES.map((s) => ({ ...s, kind: 'rendering_rule' })),
  ...PENGADAAN_PATTERNS,
  ...PENGADAAN_VOCABULARY.map((s) => ({ ...s, kind: 'vocabulary' })),
  ...PENGADAAN_APPROVAL_CHAINS.map((s) => ({ ...s, kind: 'approval_chain' })),
  ...PENGADAAN_SIGNATORIES,
  ...PENGADAAN_ORGANIZATIONAL_REASONING.map((s) => ({ ...s, kind: 'organizational_reasoning' })),
  ...PENGADAAN_QUESTION_TREE,
]);

export const NOR_KNOWLEDGE_RELATIONSHIP_SPECS = Object.freeze([
  { sourceRef: 'rel.bpd-ontology-derived-from-approval-chain', from: 'ontology.perjalanan-dinas', to: 'approval-chain.bpd-signers', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'Mirrors ontology.nor\'s own approvalChainRef field as a real, walkable graph edge.' },
  { sourceRef: 'rel.bpd-workflow-derived-from-approval-chain', from: 'workflow.bpd-approval-sequence', to: 'approval-chain.bpd-signers', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The ordered workflow sequences the same static signer list the approval chain names.' },
  { sourceRef: 'rel.bpd-question-disbursement-derived-from-workflow', from: 'question.bpd-disbursement-confirmation', to: 'workflow.bpd-approval-sequence', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question is about step 5\'s incomplete evidence-of-disbursement labeling.' },
  { sourceRef: 'rel.bpd-multidest-rule-corroborates-rincian-columns', from: 'rule.bpd-multi-destination-aggregation', to: 'rendering.bpd-rincian-table-columns', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The multi-destination aggregation rule is directly observed in the same rincian table structure this rendering rule describes.' },
  { sourceRef: 'rel.pengadaan-ontology-derived-from-approval-chain', from: 'ontology.pengadaan', to: 'approval-chain.pengadaan-signers', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'Mirrors ontology.nor\'s own approvalChainRef field as a real, walkable graph edge.' },
  { sourceRef: 'rel.pengadaan-workflow-derived-from-approval-chain', from: 'workflow.pengadaan-approval-sequence', to: 'approval-chain.pengadaan-signers', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The ordered workflow sequences the same static signer list the approval chain names.' },
  { sourceRef: 'rel.pengadaan-question-price-derived-from-rule', from: 'question.pengadaan-price-justification-requirement', to: 'rule.pengadaan-price-justification-optional', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question ("required, or optional courtesy?") follows directly from the rule\'s own 2-of-4 evidence split.' },
  { sourceRef: 'rel.pengadaan-question-verb-derived-from-pattern', from: 'question.pengadaan-perihal-verb-choice', to: 'pattern.pengadaan-perihal-pencetakan', type: RELATIONSHIP_TYPE.DERIVED_FROM, reason: 'The open question exists precisely because this sibling pattern is only single-sample evidenced.' },
  { sourceRef: 'rel.pengadaan-cadence-derived-from-running-total', from: 'organizational-reasoning.pengadaan-recurring-monthly-cadence', to: 'rule.pengadaan-running-total-reference', type: RELATIONSHIP_TYPE.CORROBORATES, reason: 'The running-total reference in NOR 089 is the direct textual basis for inferring a recurring monthly cadence.' },
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

/** The same deterministic id scheme nor-reverse-engineering-knowledge.js
 *  itself uses (domainType 'nor', sourceType 'manual-file') — recomputing
 *  it here resolves the ORIGINAL Petty Cash fact's real id without a
 *  cross-file import, since `generateKnowledgeId` is a pure function of
 *  its three inputs. */
function idForOriginalPettyCashFact(sourceRef) {
  return generateKnowledgeId({ domainType: DOMAIN_TYPE, sourceType: 'manual-file', sourceRef });
}

/** Corrects two EXISTING Petty Cash facts that Iteration 2 tagged
 *  `norType: PETTY_CASH` because, at the time, no other NOR Type had ever
 *  been evidenced. This sprint's 13 new documents span 4 different NOR
 *  subject matters and 12 of 13 follow the identical numbering convention
 *  — proof this fact is Generic (Sarpras-department-wide), not
 *  petty-cash-specific.
 *
 *  Both facts are Approved, so they may not be edited in place
 *  (knowledge-service.js#updateDraft's own MUTABLE_STATES rule). This uses
 *  the real correction path instead: `submitCorrection` generates a new
 *  Candidate carrying the corrected (generic) payload plus a DERIVED_FROM
 *  relationship back to the original; that Candidate is promoted to
 *  Approved; the superseded original is then explicitly archived so it
 *  stops being double-counted by every real
 *  `listKnowledge({..., lifecycleState: APPROVED})` reader. Idempotent: a
 *  second run finds the original already Deprecated (no longer Approved)
 *  and does nothing. */
export function correctNumberingFormatToGeneric({ approverId = 'evan', decidedAt } = {}) {
  const decidedAtIso = decidedAt || new Date().toISOString();
  const staleSourceRefs = ['rule.numbering-format', 'pattern.document-number-line'];
  const corrected = [];
  const errors = [];
  const rationale = 'Sprint 9.2 evidence (13 real Nota Organisasi spanning 4 NOR subject matters, 12 of 13 following the identical numbering convention) proves this fact is Generic to the Sarpras department across every NOR Type, not petty-cash-specific — correcting the Iteration 2 tag, which was accurate to the evidence available at the time but is now known incomplete.';

  let session = startCorrectionSession(approverId);

  for (const sourceRef of staleSourceRefs) {
    const originalId = idForOriginalPettyCashFact(sourceRef);
    const existing = getKnowledge(originalId);
    if (!existing.ok) { errors.push({ sourceRef, stage: 'find', error: existing.error }); continue; }
    if (existing.data.lifecycleState !== LIFECYCLE_STATE.APPROVED) { continue; }
    if (!existing.data.payload || !('norType' in existing.data.payload)) { continue; }

    const { norType: _drop, ...genericPayload } = existing.data.payload;
    const correctionResult = submitCorrection(session, {
      itemId: existing.data.id,
      domainType: existing.data.domainType,
      kind: existing.data.kind,
      correctedPayload: genericPayload,
      correctedBy: approverId,
      note: rationale,
    });
    if (!correctionResult.ok) { errors.push({ sourceRef, stage: 'correct', error: correctionResult.error }); continue; }
    session = correctionResult.session;
    if (!correctionResult.generatedItem) { errors.push({ sourceRef, stage: 'correct', error: { code: 'NO_CANDIDATE_GENERATED' } }); continue; }

    const promoted = promoteKnowledge(correctionResult.generatedItem.id, {
      approverId, decidedAt: decidedAtIso, preferenceRationale: rationale,
    });
    if (!promoted.ok) { errors.push({ sourceRef, stage: 'promote', error: promoted.error }); continue; }

    const archived = archiveKnowledge(existing.data.id, { actorId: approverId, reason: `Superseded by ${promoted.data.id} — ${rationale}` });
    if (!archived.ok) { errors.push({ sourceRef, stage: 'archive-original', error: archived.error }); continue; }

    corrected.push(promoted.data);
  }

  finishCorrectionSession(session);
  return Object.freeze({ corrected: Object.freeze(corrected), errors: Object.freeze(errors) });
}

/**
 * The ONE entry point this file exposes for new facts. Same real
 * ingest()/promoteKnowledge() pipeline every other producer in this
 * platform uses — no shortcut, no bypass of the lifecycle gate.
 * @param {{approverId?: string, decidedAt?: string}} [opts]
 */
export function seedPerjalananDinasPengadaanKnowledge({ approverId = 'evan', decidedAt } = {}) {
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
    const item = buildKnowledgeItem({
      sourceRef: rel.sourceRef, kind: 'relationship', confidence: 0.85, payload,
    });
    const ingested = ingest(item);
    if (!ingested.ok) { errors.push({ sourceRef: rel.sourceRef, stage: 'ingest-relationship', error: ingested.error }); continue; }
    const promoted = promoteKnowledge(item.id, { approverId, decidedAt: decidedAtIso, preferenceRationale: rel.reason });
    if (!promoted.ok) { errors.push({ sourceRef: rel.sourceRef, stage: 'promote-relationship', error: promoted.error }); continue; }
    relationships.push(promoted.data);
  }

  const correction = correctNumberingFormatToGeneric({ approverId, decidedAt: decidedAtIso });

  return Object.freeze({
    items: Object.freeze(items),
    relationships: Object.freeze(relationships),
    corrected: correction.corrected,
    errors: Object.freeze([...errors, ...correction.errors]),
  });
}
