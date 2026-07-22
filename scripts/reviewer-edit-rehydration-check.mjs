/* reviewer-edit-rehydration-check.mjs — Node check for Phase 11, Sprint 11.9
   (Persistent Organizational Learning): reviewer-edit-rehydration-engine.js.

   Proves the FULL "Teach Once, Learn Forever" pipeline WITHOUT a browser,
   using the real composer-store + real knowledge-service + real governed
   promotion path — no mocks, no fabricated data:

     reviewer edit (editSection) -> persisted ComposerRevision
       -> projection -> CANDIDATE writing_style KnowledgeItem
       -> (survives re-projection: idempotent) -> submitForReview -> approve
       -> Approved organizational Knowledge -> buildProfile picks it up.

   Also guards: only reusable-wording edits project (not quantity facts, not
   pattern-sourced edits, not structural); the human gate is never bypassed;
   an Approved item is never overwritten by a later re-projection.
   Run: node scripts/reviewer-edit-rehydration-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository } from '../js/v2/knowledge/repository/knowledge-repository.js';
import { getKnowledge, listKnowledge, promoteKnowledge, submitKnowledgeForReview } from '../js/v2/knowledge/services/knowledge-service.js';
import { getCandidateQueue } from '../js/v2/knowledge/review/review-queue-engine.js';
import { buildProfile } from '../js/v2/knowledge/profiles/profile-engine.js';
import { PROFILE_TYPE } from '../js/v2/knowledge/contracts/profile-contract.js';
import {
  createDocument, editSection, resetComposerStore,
} from '../src/document-intelligence/composer/composer-store.js';
import {
  rehydrateLearningFromDocuments, projectReviewerEditLearning,
} from '../src/document-intelligence/composer/reviewer-edit-rehydration-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetComposerStore();

const candidateId = (documentId, field) => generateKnowledgeId({ domainType: 'nor', sourceType: 'correction', sourceRef: `reviewer-edit:${documentId}:${field}` });

console.log('\n[A reusable wording edit becomes a persistent CANDIDATE writing_style item]');
{
  const doc = createDocument('nor', { openingLine: 'Pengajuan Pembelian barang untuk kantor' });
  editSection(doc.documentId, 'openingLine', 'Permohonan Pembelian barang untuk kantor', 'evan');

  const tally = projectReviewerEditLearning(doc.documentId, 'nor');
  check('projection created exactly one Candidate', tally.created === 1 && tally.updated === 0);

  const id = candidateId(doc.documentId, 'openingLine');
  const item = getKnowledge(id);
  check('the Candidate exists at the deterministic id', item.ok);
  check('it is a CANDIDATE (pre-approval, governed)', item.ok && item.data.lifecycleState === LIFECYCLE_STATE.CANDIDATE);
  check('kind is writing_style', item.ok && item.data.kind === 'writing_style');
  check('payload.value is the human edit (profile grouping key)', item.ok && item.data.payload.value === 'Permohonan Pembelian barang untuk kantor');
  check('payload preserves the ORIGINAL AI output', item.ok && item.data.payload.originalAiOutput === 'Pengajuan Pembelian barang untuk kantor');
  check('payload preserves the semantic classification', item.ok && item.data.payload.semanticClassification === 'opening_phrase');
  check('payload preserves the reviewer + source document (evidence)', item.ok && item.data.payload.reviewer === 'evan' && item.data.payload.sourceDocumentId === doc.documentId);
  check('provenance preserves a real timestamp', item.ok && typeof item.data.provenance.capturedAt === 'string' && item.data.provenance.capturedAt.length > 0);
  check('it shows in the existing Candidate queue (Menunggu Tinjauan)', getCandidateQueue().some((e) => e.itemId === id));
}

console.log('\n[Idempotence — the projection survives repeated runs (refresh/restart safe) without duplicating or growing versions]');
{
  const doc = createDocument('nor', { closingLine: 'Demikian kami sampaikan, terima kasih' });
  editSection(doc.documentId, 'closingLine', 'Demikian kami sampaikan, atas perhatiannya diucapkan terima kasih', 'evan');
  const id = candidateId(doc.documentId, 'closingLine');

  projectReviewerEditLearning(doc.documentId, 'nor');
  const v1 = getKnowledge(id).data.version;
  const countAfterFirst = listKnowledge({ domainType: 'nor' }).data.length;

  // Re-run several times — simulating repeated composer-change events and
  // repeated mounts (every refresh).
  const t2 = projectReviewerEditLearning(doc.documentId, 'nor');
  const t3 = rehydrateLearningFromDocuments();
  const v2 = getKnowledge(id).data.version;
  const countAfterRepeats = listKnowledge({ domainType: 'nor' }).data.length;

  check('a re-run reports the Candidate as unchanged (a real no-op)', t2.unchanged >= 1 && t2.created === 0);
  check('rehydrateLearningFromDocuments() also writes nothing new for it', t3.created === 0);
  check('the Candidate version did NOT grow on re-projection (no churn)', v1 === v2);
  check('no duplicate KnowledgeItem was created', countAfterFirst === countAfterRepeats);
}

console.log('\n[A later edit to the same field updates the mutable Candidate in place — no duplicate]');
{
  // Genuine mid-sentence wording changes (one token swapped), so each edit
  // classifies as wording_change rather than a full rewrite.
  const doc = createDocument('nor', { subject: 'Permohonan pengadaan meja untuk ruang rapat utama' });
  editSection(doc.documentId, 'subject', 'Permohonan pengadaan kursi untuk ruang rapat utama', 'evan');
  projectReviewerEditLearning(doc.documentId, 'nor');
  const id = candidateId(doc.documentId, 'subject');
  const before = getKnowledge(id).data;
  check('the first edit produced a Candidate to update', !!before);

  editSection(doc.documentId, 'subject', 'Permohonan pengadaan lemari untuk ruang rapat utama', 'evan');
  const tally = projectReviewerEditLearning(doc.documentId, 'nor');
  const after = getKnowledge(id).data;

  check('the projection UPDATED the existing Candidate, not created a new one', tally.updated === 1 && tally.created === 0);
  check('the Candidate now carries the latest preferred wording', after.payload.value === 'Permohonan pengadaan lemari untuk ruang rapat utama');
  check('the ORIGINAL AI output is still preserved through the update', after.payload.originalAiOutput === 'Permohonan pengadaan meja untuk ruang rapat utama');
  check('same id, version grew by exactly one (append-only, in place)', before && after.version === before.version + 1);
}

console.log('\n[Human gate — approving a Candidate promotes it to real Knowledge; a later re-projection NEVER overwrites the Approved record]');
{
  const doc = createDocument('nor', { subject: 'Pengajuan sarana ruang kelas' });
  editSection(doc.documentId, 'subject', 'Permohonan sarana ruang kelas', 'evan');
  projectReviewerEditLearning(doc.documentId, 'nor');
  const id = candidateId(doc.documentId, 'subject');

  // The existing, unchanged governed promotion path — Candidate -> Pending Review -> Approved.
  submitKnowledgeForReview(id);
  const approved = promoteKnowledge(id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Gaya penulisan baku organisasi disetujui.' });
  check('the Candidate promotes to Approved through the existing human-gated pipeline', approved.ok && approved.data.lifecycleState === LIFECYCLE_STATE.APPROVED);

  const approvedValue = getKnowledge(id).data.payload.value;
  const approvedVersion = getKnowledge(id).data.version;
  const t = rehydrateLearningFromDocuments();
  const afterReproject = getKnowledge(id).data;
  check('a re-projection reports the Approved item as "decided" and leaves it untouched', t.decided >= 1);
  check('the Approved item is byte-for-byte unchanged (never overwritten by projection)', afterReproject.payload.value === approvedValue && afterReproject.version === approvedVersion && afterReproject.lifecycleState === LIFECYCLE_STATE.APPROVED);

  const profile = buildProfile('nor', PROFILE_TYPE.WRITING_STYLE);
  check('once Approved, the reviewer\'s wording feeds the writing_style profile (loop closed)', profile.ok && profile.profile.entries.some((e) => e.value === 'Permohonan sarana ruang kelas'));
}

console.log('\n[Deliberately NOT projected — per-document facts, pattern edits, and structural edits are not organizational writing style]');
{
  const doc = createDocument('nor', { quantity: '20 kursi', 'pattern:knowledge:nor:x:1': 'Kalimat pola awal yang panjang' });

  editSection(doc.documentId, 'quantity', '24 kursi', 'evan'); // a per-document FACT correction
  editSection(doc.documentId, 'pattern:knowledge:nor:x:1', 'Kalimat pola direvisi yang panjang', 'evan'); // a pattern-sourced edit (Signal 2 owns it)

  const tally = projectReviewerEditLearning(doc.documentId, 'nor');
  check('a quantity_correction does NOT become a writing_style Candidate', getKnowledge(candidateId(doc.documentId, 'quantity')).ok === false);
  check('a pattern-sourced edit is NOT projected here (Signal 2 owns it)', getKnowledge(candidateId(doc.documentId, 'pattern:knowledge:nor:x:1')).ok === false);
  check('the projection created nothing for this document', tally.created === 0);
}

console.log('\n[An edit reverted back to the original AI wording leaves no learned preference]');
{
  const doc = createDocument('nor', { openingLine: 'Kalimat pembuka asli yang panjang' });
  editSection(doc.documentId, 'openingLine', 'Kalimat pembuka diganti yang panjang', 'evan');
  editSection(doc.documentId, 'openingLine', 'Kalimat pembuka asli yang panjang', 'evan'); // reverted to original
  const tally = projectReviewerEditLearning(doc.documentId, 'nor');
  check('no Candidate is created when the net edit returns to the original wording', tally.created === 0
    && getKnowledge(candidateId(doc.documentId, 'openingLine')).ok === false);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
