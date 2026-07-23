/* knowledge-observability-check.mjs — Node check for V2.0.2.1 "Knowledge
   Observability": Acquisition/Repository/Lifecycle Events, Progress
   Reporting, Warning Reporting, Conflict Reporting, Import Statistics,
   Incremental Cursor Contracts.
   Run: node scripts/knowledge-observability-check.mjs   (exit 0 = pass)

   Entirely V1-free — uses a synthetic connector, exactly like
   knowledge-acquisition-check.mjs, so it runs in plain Node. */

import { registerConnector } from '../src/knowledge/registry/connector-registry.js';
import { connectorSuccess } from '../src/knowledge/contracts/connector-contract.js';
import { generateKnowledgeId } from '../src/knowledge/contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../src/knowledge/contracts/lifecycle-contract.js';
import { RELATIONSHIP_TYPE } from '../src/knowledge/contracts/dependency-graph-contract.js';
import {
  runAcquisition, runAcquisitionIncremental, listImportReports, resetImportReportLog,
} from '../src/knowledge/acquisition/acquisition-engine.js';
import { ACQUISITION_EVENT_TYPE } from '../src/knowledge/acquisition/contracts/event-contract.js';
import { getCursor, resetCursorStore } from '../src/knowledge/acquisition/cursor-store.js';
import { isKnowledgeSource, SOURCE_REPRESENTATION } from '../src/knowledge/acquisition/contracts/source-contract.js';
import { buildImportStatistics } from '../src/knowledge/observability/contracts/import-statistics-contract.js';
import { makeConflictReport, isKnowledgeConflictReport } from '../src/knowledge/observability/contracts/conflict-report-contract.js';
import { makeWarning } from '../src/knowledge/observability/contracts/warning-contract.js';
import {
  setActiveRepository, create as repoCreate,
} from '../src/knowledge/repository/knowledge-repository.js';
import {
  registerRepositoryListener, unregisterRepositoryListener,
} from '../src/knowledge/repository/knowledge-repository.js';
import { REPOSITORY_EVENT_TYPE } from '../src/knowledge/repository/contracts/event-contract.js';
import {
  registerLifecycleListener, unregisterLifecycleListener,
} from '../src/knowledge/lifecycle/lifecycle-engine.js';
import { LIFECYCLE_EVENT_TYPE } from '../src/knowledge/lifecycle/contracts/event-contract.js';
import {
  submitForReview, approve,
} from '../src/knowledge/review/review-workflow-engine.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

setActiveRepository('memory');
resetCursorStore();
resetImportReportLog();

/* ── Synthetic connector: returns 1 item + 1 warning when `since` is null,
   returns nothing when `since` is set — lets us prove the incremental
   cursor actually gets read and passed through. ─────────────────────── */
let seq = 0;
function makeTestItem(sourceRef) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: 'obstest', sourceRef }),
    version: 1, domainType: 'nor', sourceType: 'obstest', kind: 'structure',
    payload: Object.freeze({ seq: seq++ }), confidence: 1,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: 'obstest', sourceRef, capturedAt: now }),
    approvedBy: null, approvedAt: null, preferenceRationale: null,
    createdAt: now, updatedAt: now,
  });
}
const testSource = { id: 'obstest.source', connectorId: 'obstest', description: null, representation: SOURCE_REPRESENTATION.STORE_RECORD };
check('synthetic source satisfies isKnowledgeSource', isKnowledgeSource(testSource));

const testConnector = Object.freeze({
  id: 'obstest',
  version: 'obstest-connector@1',
  description: 'Synthetic connector for observability checks.',
  source: testSource,
  fetch(since) {
    if (since) return connectorSuccess([], { connectorId: 'obstest', warnings: [] });
    const warning = makeWarning('SYNTHETIC_WARNING', 'One record intentionally skipped for test coverage.', { connectorId: 'obstest', sourceRef: 'rec-skip' });
    return connectorSuccess([makeTestItem('rec-1')], { connectorId: 'obstest', warnings: [warning] });
  },
});
registerConnector(testConnector);

console.log('\n[Acquisition Events + Progress Reporting]');
const events = [];
const first = runAcquisition('obstest', { onEvent: (e) => events.push(e) });
check('first run succeeds', first.result.ok === true);
check('events fire in order: started, fetched, item_written, completed', events.map((e) => e.type).join(',') === [
  ACQUISITION_EVENT_TYPE.STARTED, ACQUISITION_EVENT_TYPE.FETCHED, ACQUISITION_EVENT_TYPE.ITEM_WRITTEN, ACQUISITION_EVENT_TYPE.COMPLETED,
].join(','));
const writtenEvent = events.find((e) => e.type === ACQUISITION_EVENT_TYPE.ITEM_WRITTEN);
check('item_written event carries a ProgressReport with completed=1/total=1 (100%)', writtenEvent.detail.progress.completed === 1
  && writtenEvent.detail.progress.total === 1 && writtenEvent.detail.progress.percent === 100);

console.log('\n[Warning Reporting]');
check('result carries the connector warning through', first.result.warnings.length === 1 && first.result.warnings[0].code === 'SYNTHETIC_WARNING');
check('import report carries the warning through', first.report.warnings.length === 1);

console.log('\n[Incremental Cursor Contracts]');
const cursor = getCursor('obstest');
check('cursor-store persisted a cursor after the first run', cursor !== null && cursor.connectorId === 'obstest' && typeof cursor.lastIndexedAt === 'string');
const second = runAcquisitionIncremental('obstest');
check('runAcquisitionIncremental reads the cursor and passes it as since', second.result.itemsExtracted === 0);

console.log('\n[Import Statistics]');
const reports = listImportReports('obstest');
check('report log recorded both runs', reports.length === 2);
const stats = buildImportStatistics('obstest', reports);
check('statistics sum itemsCreated across runs', stats.itemsCreated === 1);
check('statistics sum totalWarnings across runs', stats.totalWarnings === 1);
check('statistics totalRuns matches report count', stats.totalRuns === 2);
check('statistics firstRunAt <= lastRunAt', stats.firstRunAt <= stats.lastRunAt);

console.log('\n[Repository Events]');
const repoEvents = [];
const onRepoEvent = (e) => repoEvents.push(e);
registerRepositoryListener(onRepoEvent);
const directItem = makeTestItem('rec-direct');
const createResult = repoCreate(directItem);
check('direct create() succeeds', createResult.ok === true);
check('repository CREATED event fired with matching id/version', repoEvents.length === 1
  && repoEvents[0].type === REPOSITORY_EVENT_TYPE.CREATED
  && repoEvents[0].id === directItem.id && repoEvents[0].version === 1);
unregisterRepositoryListener(onRepoEvent);

console.log('\n[Lifecycle Events]');
const lifecycleEvents = [];
const onLifecycleEvent = (e) => lifecycleEvents.push(e);
registerLifecycleListener(onLifecycleEvent);
// directItem is Draft; move it to Candidate first (outside review workflow, a
// plain transition) so submitForReview()'s CANDIDATE precondition holds.
const { requestTransition } = await import('../src/knowledge/lifecycle/lifecycle-engine.js');
requestTransition(directItem.id, LIFECYCLE_STATE.DRAFT, LIFECYCLE_STATE.CANDIDATE);
const submitResult = submitForReview(directItem.id);
check('submitForReview succeeds (candidate -> pending_review)', submitResult.ok === true);
const approveResult = approve(directItem.id, { approverId: 'evan', decidedAt: new Date().toISOString(), preferenceRationale: 'Observability check.' });
check('approve succeeds (pending_review -> approved)', approveResult.ok === true);
check('3 lifecycle TRANSITIONED events fired (draft->candidate, candidate->pending_review, pending_review->approved)', lifecycleEvents.length === 3
  && lifecycleEvents.every((e) => e.type === LIFECYCLE_EVENT_TYPE.TRANSITIONED));
check('final lifecycle event is viaReviewDecision and lands on approved', lifecycleEvents[2].viaReviewDecision === true && lifecycleEvents[2].toState === LIFECYCLE_STATE.APPROVED);
unregisterLifecycleListener(onLifecycleEvent);

console.log('\n[Conflict Reporting contract]');
const conflictReport = makeConflictReport({ domainType: 'nor', itemIds: [directItem.id, first.result.session.sessionId], description: 'Synthetic conflict for shape verification.' });
check('makeConflictReport produces a valid KnowledgeConflictReport', isKnowledgeConflictReport(conflictReport));
check('conflict report reuses RELATIONSHIP_TYPE.CONFLICTS_WITH (no competing vocabulary)', conflictReport.relationshipType === RELATIONSHIP_TYPE.CONFLICTS_WITH);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail > 0 ? 1 : 0);
