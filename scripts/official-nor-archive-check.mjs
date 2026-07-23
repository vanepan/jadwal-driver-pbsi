/* official-nor-archive-check.mjs — Node check for V2.0.17 "Official NOR
   Digital Archive Foundation". Confirms the milestone's ONE genuinely
   new requirement — grouping consecutive missing-number gaps into a
   human-readable upload recommendation ("Upload missing <domain> X and
   Y.") — while everything else the roadmap names (Archive Timeline,
   Missing NOR Detection, Upload workflow marker, Version History,
   Duplicate Detection, Knowledge Extraction Hooks) is ALREADY BUILT as
   organizational-memory/ (V2.0.7, Phase 10) and reused completely
   unmodified — see gap-detection-engine.js/gap-workflow-engine.js,
   untouched by this file. No file upload mechanism exists or is added
   (no Storage capability anywhere in this codebase, documented since
   V2.0.7). No AI, no LLM, no production writes.
   Run: node scripts/official-nor-archive-check.mjs   (exit 0 = pass) */

import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { setActiveRepository } from '../src/knowledge/repository/knowledge-repository.js';

import { registerArchiveSource, resetArchiveSourceRegistry } from '../src/organizational-memory/registry/archive-source-registry.js';
import { archiveSourceSuccess } from '../src/organizational-memory/contracts/archive-source-contract.js';
import { resetArchiveRepository } from '../src/organizational-memory/repository/archive-repository.js';
import { ingestArchive } from '../src/organizational-memory/archive-ingestion-engine.js';
import { computeDocumentHash } from '../src/organizational-memory/document-hash.js';
import { resetGapWorkflowState } from '../src/organizational-memory/gap-workflow-engine.js';
import { isUploadRecommendation } from '../src/organizational-memory/contracts/upload-recommendation-contract.js';
import { buildUploadRecommendations } from '../src/organizational-memory/upload-recommendation-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetArchiveRepository();
resetGapWorkflowState();
resetArchiveSourceRegistry();

console.log('\n[Fixture — archived numbers 1,3,5,8,9,13 under a registered domain (gaps at 2 / 4 / 6-7 / 10-12)]');
function makeSnapshot(n) { return { docNumber: `ENG-2026-${String(n).padStart(3, '0')}`, itemCount: 1 }; }
function makeRecord(sourceRef, num) {
  const now = new Date().toISOString();
  const snapshot = makeSnapshot(num);
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'engineering', sourceType: 'archive', sourceRef }),
    version: 1, sourceDomainType: 'engineering', sourceId: sourceRef, sourceType: 'archivetest',
    documentNumber: `ENG-2026-${String(num).padStart(3, '0')}`,
    documentDate: `2026-01-${String(num).padStart(2, '0')}`,
    senderOrigin: 'Test fixture',
    documentHash: computeDocumentHash(snapshot),
    hasContributedKnowledge: false,
    sourceSnapshot: snapshot,
    hasOriginalFile: false, fileRef: null,
    archivedAt: now, updatedAt: now,
  });
}

const numbers = [1, 3, 5, 8, 9, 13];
const records = numbers.map((n) => makeRecord(`rec-${n}`, n));
const testSource = Object.freeze({
  id: 'archivetest', version: 'archivetest-source@1', description: 'Test fixture.',
  fetch() { return archiveSourceSuccess(records, { sourceId: 'archivetest' }); },
});
registerArchiveSource(testSource);
const ingestResult = ingestArchive('archivetest');
check('fixture ingests cleanly (6 records)', ingestResult.ok === true && ingestResult.itemsCreated === 6);

console.log('\n[Upload recommendations — grouped by contiguous run, reusing gap-workflow-engine.js unmodified]');
const recommendations = buildUploadRecommendations('engineering');
check('exactly 4 recommendations are produced (one per contiguous gap run: [2],[4],[6,7],[10,11,12])', recommendations.length === 4);
check('every recommendation satisfies isUploadRecommendation()', recommendations.every(isUploadRecommendation));

const singleGapRecs = recommendations.filter((r) => r.expectedNumbers.length === 1);
check('the two single-gap runs (2 and 4) each produce their own recommendation with no "and"', singleGapRecs.length === 2
  && singleGapRecs.every((r) => !r.message.includes(' and ')));

const twoGapRec = recommendations.find((r) => r.expectedNumbers.length === 2);
check('the 2-gap run (6,7) produces one recommendation with both numbers', !!twoGapRec
  && twoGapRec.expectedNumbers.includes('ENG-2026-006') && twoGapRec.expectedNumbers.includes('ENG-2026-007'));
check('a 2-item message uses "X and Y" phrasing, matching the roadmap\'s literal example ("Upload missing NOR 121 and 122")', twoGapRec.message.includes(' and ')
  && !twoGapRec.message.includes(', and'));

const threeGapRec = recommendations.find((r) => r.expectedNumbers.length === 3);
check('the 3-gap run (10,11,12) produces one recommendation grouping all three', !!threeGapRec
  && ['ENG-2026-010', 'ENG-2026-011', 'ENG-2026-012'].every((n) => threeGapRec.expectedNumbers.includes(n)));
check('a 3+ item message uses Oxford-comma phrasing', threeGapRec.message.includes(', and'));

check('every recommendation message names the registered domain label ("Engineering Operations"), not a hardcoded string', recommendations.every((r) => r.message.includes('Engineering Operations')));
check('gapIds correlate 1:1 with expectedNumbers, traceable back to the underlying ArchiveGap', recommendations.every((r) => r.gapIds.length === r.expectedNumbers.length));

console.log('\n[No recommendations when the archive has no gaps]');
resetArchiveRepository();
resetGapWorkflowState();
resetArchiveSourceRegistry();
const cleanSource = Object.freeze({
  id: 'clean', version: 'clean-source@1', description: 'No gaps.',
  fetch() { return archiveSourceSuccess([makeRecord('c1', 1), makeRecord('c2', 2), makeRecord('c3', 3)], { sourceId: 'clean' }); },
});
registerArchiveSource(cleanSource);
ingestArchive('clean');
check('a gap-free archive produces zero recommendations, not fabricated ones', buildUploadRecommendations('engineering').length === 0);

resetArchiveRepository();
resetGapWorkflowState();
resetArchiveSourceRegistry();
console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
