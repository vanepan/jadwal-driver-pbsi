/* organizational-memory-check.mjs — Node check for V2.0.7 "Organizational
   Memory Foundation": archive repository, ingestion, numbering, gap
   detection + workflow, duplicate detection, timeline, health, knowledge
   contribution.
   Run: node scripts/organizational-memory-check.mjs   (exit 0 = pass)

   Entirely V1-free — uses a synthetic archive source, exactly like
   knowledge-acquisition-check.mjs. The real `nor` archive source requires
   a browser (see organizational-memory-dom-check.mjs) because it
   transitively imports js/firebase.js's CDN-hosted SDK. */

import { LIFECYCLE_STATE } from '../js/v2/knowledge/contracts/lifecycle-contract.js';
import { generateKnowledgeId } from '../js/v2/knowledge/contracts/identity-contract.js';
import { setActiveRepository, create as knowledgeCreate } from '../js/v2/knowledge/repository/knowledge-repository.js';

import { registerArchiveSource, listArchiveSources, resetArchiveSourceRegistry } from '../src/organizational-memory/registry/archive-source-registry.js';
import { archiveSourceSuccess } from '../src/organizational-memory/contracts/archive-source-contract.js';
import { isArchiveRecord } from '../src/organizational-memory/contracts/archive-record-contract.js';
import { resetArchiveRepository, getById as getArchiveById, list as listArchive } from '../src/organizational-memory/repository/archive-repository.js';
import { ingestArchive } from '../src/organizational-memory/archive-ingestion-engine.js';
import { computeDocumentHash } from '../src/organizational-memory/document-hash.js';
import { suggestNextNumber } from '../src/organizational-memory/numbering-engine.js';
import { detectGaps } from '../src/organizational-memory/gap-detection-engine.js';
import { GAP_STATUS } from '../src/organizational-memory/contracts/gap-contract.js';
import { flagGapForUpload, resolveGap, getGapsWithWorkflowState, resetGapWorkflowState } from '../src/organizational-memory/gap-workflow-engine.js';
import { findDuplicateArchiveRecords } from '../src/organizational-memory/duplicate-detection-engine.js';
import { getArchiveTimeline } from '../src/organizational-memory/archive-timeline-engine.js';
import { computeArchiveHealth } from '../src/organizational-memory/archive-health-engine.js';
import { checkKnowledgeContribution } from '../src/organizational-memory/knowledge-contribution-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetArchiveRepository();
resetGapWorkflowState();

console.log('\n[Archive source registry bootstrap]');
check('all 3 placeholders registered (memorandum/sop/internal_letter)', ['memorandum', 'sop', 'internal_letter'].every((id) => listArchiveSources().some((s) => s.id === id)));
check('nor is NOT registered (never imported in this Node process)', !listArchiveSources().some((s) => s.id === 'nor'));

const memorandumSource = (await import('../src/organizational-memory/sources/memorandum-archive-source.js')).memorandumArchiveSource;
const placeholderResult = memorandumSource.fetch();
check('placeholder source fetch fails NOT_IMPLEMENTED', placeholderResult.ok === false && placeholderResult.error.code === 'NOT_IMPLEMENTED');

/* ── Synthetic test source: 3 numbered records (gap at 003), plus a
   duplicate pair. ────────────────────────────────────────────────── */
function makeSnapshot(n) { return { norNumber: `NOR-2026-${String(n).padStart(3, '0')}`, itemCount: 2 }; }
function makeRecord(sourceRef, num, { duplicateOf = null } = {}) {
  const now = new Date().toISOString();
  const snapshot = duplicateOf ? makeSnapshot(duplicateOf) : makeSnapshot(num);
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'test', sourceType: 'archive', sourceRef }),
    version: 1, sourceDomainType: 'test', sourceId: sourceRef, sourceType: 'test',
    documentNumber: `NOR-2026-${String(num).padStart(3, '0')}`,
    documentDate: `2026-01-${String(num).padStart(2, '0')}`,
    senderOrigin: 'Plt. Kabid Sarana dan Prasarana',
    documentHash: computeDocumentHash(snapshot),
    hasContributedKnowledge: false,
    sourceSnapshot: snapshot,
    hasOriginalFile: false, fileRef: null,
    archivedAt: now, updatedAt: now,
  });
}

const recA = makeRecord('rec-a', 1);
const recB = makeRecord('rec-b', 2);
const recC = makeRecord('rec-c', 4); // gap at 003
const recDup = makeRecord('rec-dup', 2, { duplicateOf: 2 }); // same content as recB -> same hash

check('synthetic records satisfy isArchiveRecord', [recA, recB, recC, recDup].every(isArchiveRecord));

const testSource = Object.freeze({
  id: 'test', version: 'test-archive-source@1', description: 'Synthetic archive source for Node checks.',
  fetch() { return archiveSourceSuccess([recA, recB, recC, recDup], { sourceId: 'test' }); },
});
registerArchiveSource(testSource);

console.log('\n[Archive Ingestion Engine]');
const first = ingestArchive('test');
check('first ingestion succeeds', first.ok === true && first.itemsFetched === 4);
check('first ingestion creates 4 new records', first.itemsCreated === 4 && first.itemsUpdated === 0);

const second = ingestArchive('test');
check('second ingestion updates the same 4 records (version-safe, no duplicates)', second.itemsCreated === 0 && second.itemsUpdated === 4);

const stored = getArchiveById(recA.id);
check('archive repository stores the record with version 2 after re-ingestion', stored.ok && stored.data.version === 2);

console.log('\n[Document Hash]');
check('identical content produces identical hashes', computeDocumentHash({ a: 1, b: 2 }) === computeDocumentHash({ b: 2, a: 1 }));
check('different content produces different hashes', computeDocumentHash({ a: 1 }) !== computeDocumentHash({ a: 2 }));

console.log('\n[Numbering Engine — Automatic/Editable Numbering]');
const suggestion = suggestNextNumber('test');
check('suggests the next number after the highest archived (004 -> 005)', suggestion.suggestedNumber === 'NOR-2026-005');
check('confidence reflects the full population sharing the pattern', suggestion.confidence === 1);
const emptySuggestion = suggestNextNumber('nonexistent-domain');
check('an empty archive yields confidence 0, never a fabricated default', emptySuggestion.confidence === 0 && emptySuggestion.suggestedNumber === '');

console.log('\n[Gap Detection — Missing NOR Detection]');
const gaps = detectGaps('test');
check('detects exactly the one real gap (003, between 002 and 004)', gaps.length === 1 && gaps[0].expectedNumber === 'NOR-2026-003');
check('gap starts in OPEN status', gaps[0].status === GAP_STATUS.OPEN);

console.log('\n[Gap Workflow — "Upload Missing NOR" marker]');
flagGapForUpload('test', 'NOR-2026-003');
const flagged = getGapsWithWorkflowState('test');
check('flagging persists across calls (workflow state, not a re-detection artifact)', flagged.length === 1 && flagged[0].status === GAP_STATUS.FLAGGED_FOR_UPLOAD);
resolveGap('test', 'NOR-2026-003');
const resolved = getGapsWithWorkflowState('test');
check('resolving removes the gap from the open list', resolved.length === 0);

console.log('\n[Duplicate Detection]');
const duplicates = findDuplicateArchiveRecords('test');
check('finds the one duplicate group (recB and recDup share content)', duplicates.length === 1 && duplicates[0].recordIds.includes(recB.id) && duplicates[0].recordIds.includes(recDup.id));

console.log('\n[Archive Timeline]');
const timeline = getArchiveTimeline('test');
check('timeline is chronologically ordered oldest-first', timeline.length === 4 && timeline[0].documentDate <= timeline[timeline.length - 1].documentDate);

console.log('\n[Knowledge Contribution — live cross-reference]');
// domainType must be a REGISTERED knowledge domainType (isKnowledgeItem()
// enforces this) — 'nor' is real, unlike the synthetic 'test' domainType
// used elsewhere in this check for the archive side.
const contributingSourceId = 'rec-with-knowledge';
const now = new Date().toISOString();
const realKnowledgeItem = Object.freeze({
  id: generateKnowledgeId({ domainType: 'nor', sourceType: 'nor', sourceRef: contributingSourceId }),
  version: 1, domainType: 'nor', sourceType: 'nor', kind: 'structure', payload: {}, confidence: 1,
  lifecycleState: LIFECYCLE_STATE.DRAFT,
  provenance: Object.freeze({ connectorId: 'nor', sourceRef: contributingSourceId, capturedAt: now }),
  approvedBy: null, approvedAt: null, preferenceRationale: null, createdAt: now, updatedAt: now,
});
const knowledgeCreateResult = knowledgeCreate(realKnowledgeItem);
check('setup: real KnowledgeItem created for the cross-reference test', knowledgeCreateResult.ok === true);
const contributingRecord = { ...recA, sourceDomainType: 'nor', sourceId: contributingSourceId };
const nonContributingRecord = { ...recA, sourceDomainType: 'nor', sourceId: 'rec-with-no-knowledge' };
check('checkKnowledgeContribution is true for a record with a real corresponding KnowledgeItem', checkKnowledgeContribution(contributingRecord) === true);
check('checkKnowledgeContribution is false for a record with no corresponding KnowledgeItem', checkKnowledgeContribution(nonContributingRecord) === false);

console.log('\n[Archive Health]');
const health = computeArchiveHealth('test');
check('health totalArchived matches the ingested count', health.totalArchived === 4);
check('health openGapCount reflects the resolved gap (0 now)', health.openGapCount === 0);
check('health duplicateGroupCount reflects the one duplicate group', health.duplicateGroupCount === 1);
check('health score is a real weighted composite in [0,100]', health.healthScore >= 0 && health.healthScore <= 100);

console.log('\n[Registry reset]');
resetArchiveSourceRegistry();
check('reset re-bootstraps the 3 placeholders', ['memorandum', 'sop', 'internal_letter'].every((id) => listArchiveSources().some((s) => s.id === id)));
check('reset does NOT re-register the synthetic test source', !listArchiveSources().some((s) => s.id === 'test'));

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
