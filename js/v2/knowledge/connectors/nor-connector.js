/* ============================================================
   NOR-CONNECTOR.JS — Knowledge Connector (V2, Phase 9)

   PURPOSE: the ONE real connector for V2.0.2 — acquires Draft Knowledge
   from generated NOR (Nota Organisasi — the registered label,
   see knowledge/registry/domain-type-registry.js) records. Reads the
   highest-level pre-render representation available
   (js/petty-cash/nor-document-engine.js#buildNorViewModel — "pure data, no
   layout decisions, no DOM" per that file's own doc comment), never the
   pdfmake template (js/docs/templates/nor.js) or any rendered output.

   RESPONSIBILITY: enumerate eligible NOR records (official, non-archived),
   map each to a Draft KnowledgeItem whose payload is a STRUCTURAL
   fingerprint of the ViewModel (counts/presence flags), never the literal
   transaction content (amounts, descriptions) — "the renderer is
   presentation, knowledge must learn business structure" (V2.0.2 brief).

   DEPENDENCIES: js/petty-cash/petty-cash-store.js (read-only, getNors()),
   js/petty-cash/nor-document-engine.js (read-only, buildNorViewModel()),
   contracts/connector-contract.js, contracts/identity-contract.js,
   contracts/lifecycle-contract.js, acquisition/contracts/{source,
   normalization}-contract.js, observability/contracts/warning-contract.js,
   registry/connector-registry.js (self-
   registers at the bottom of this file — NOT bootstrapped by the registry
   itself, see connector-registry.js's own NON-GOALS: this module
   transitively loads the real Firebase SDK via petty-cash-store.js ->
   js/firebase.js, so it must only load when something deliberately
   imports it, never as a side effect of loading the platform core).

   NON-GOALS: never writes back to V1. Never emits anything but
   Draft-lifecycle items (Decision 6 — nothing is auto-approved). Never
   imports js/docs/templates/nor.js or js/docs/doc-engine.js directly
   itself (only transitively, through nor-document-engine.js's own
   existing import — V1 is not modified to avoid that).
   ============================================================ */

'use strict';

import { getNors } from '../../../petty-cash/petty-cash-store.js';
import { buildNorViewModel } from '../../../petty-cash/nor-document-engine.js';
import { connectorSuccess, connectorFailure, CONNECTOR_ERRORS } from '../contracts/connector-contract.js';
import { generateKnowledgeId } from '../contracts/identity-contract.js';
import { LIFECYCLE_STATE } from '../contracts/lifecycle-contract.js';
import { makeSource, SOURCE_REPRESENTATION } from '../acquisition/contracts/source-contract.js';
import { makeNormalization } from '../acquisition/contracts/normalization-contract.js';
import { registerConnector } from '../registry/connector-registry.js';
import { makeWarning, WARNING_SEVERITY } from '../observability/contracts/warning-contract.js';

export const NOR_CONNECTOR_ID = 'nor';
export const NOR_CONNECTOR_VERSION = 'nor-connector@1';

const NORMALIZATION = makeNormalization({
  normalizerId: 'nor-structure-normalizer',
  normalizerVersion: '1',
  sourceRepresentation: SOURCE_REPRESENTATION.VIEW_MODEL,
  notes: 'Derives a structural fingerprint from buildNorViewModel(); amounts and free-text content are never carried into the payload.',
});

export const norSource = makeSource({
  id: 'petty_cash.nors',
  connectorId: NOR_CONNECTOR_ID,
  description: "Generated NOR records in the Petty Cash store, read via buildNorViewModel() — pure data, no rendering.",
  representation: SOURCE_REPRESENTATION.VIEW_MODEL,
});

/** Official, non-archived NORs only — test/rehearsal documents never become Knowledge. */
function isEligible(nor) {
  return !!nor && nor.type !== 'test' && nor.archived !== true;
}

function isNewerThan(nor, since) {
  if (!since) return true;
  const generatedIso = new Date(nor.generatedAt || 0).toISOString();
  return generatedIso > since;
}

/** Structural fingerprint only — counts and presence flags, never the
 *  literal rupiah amounts or line-item descriptions the ViewModel carries. */
function buildStructurePayload(vm) {
  return {
    isTest: !!vm.isTest,
    hasSubject: !!vm.subject,
    hasRecipients: vm.recipients.length > 0,
    hasCc: vm.cc.length > 0,
    itemCount: vm.items.length,
    reimburseLineCount: vm.items.reduce((n, it) => n + (it.reimburse ? it.reimburse.length : 0), 0),
    signatoryTopCount: vm.letterTop.length,
    signatoryBottomCount: vm.letterBottom.length,
    recapSignatoryCount: vm.recap.length,
    hasOpeningBalance: !!vm.openingDoc,
    hasRealizedAmount: !!vm.realizedDoc,
    hasRemainingBalance: !!vm.remainingDoc,
    normalization: NORMALIZATION,
  };
}

function toKnowledgeItem(nor) {
  const vm = buildNorViewModel(nor);
  const now = new Date().toISOString();
  return Object.freeze({
    id: generateKnowledgeId({ domainType: 'nor', sourceType: NOR_CONNECTOR_ID, sourceRef: nor.id }),
    version: 1,
    domainType: 'nor',
    sourceType: NOR_CONNECTOR_ID,
    kind: 'structure',
    payload: buildStructurePayload(vm),
    confidence: 1,
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    provenance: Object.freeze({ connectorId: NOR_CONNECTOR_ID, sourceRef: nor.id, capturedAt: now }),
    approvedBy: null,
    approvedAt: null,
    preferenceRationale: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** One malformed NOR record must never sink the whole fetch — every
 *  eligible record is mapped independently, and a record that throws
 *  (e.g. a corrupt line item) is skipped with a Warning instead of failing
 *  the entire connector run (Phase 9.1 — Warning Reporting). */
function fetch(since = null) {
  try {
    const eligible = getNors().filter(isEligible).filter((nor) => isNewerThan(nor, since));
    const items = [];
    const warnings = [];
    for (const nor of eligible) {
      try {
        items.push(toKnowledgeItem(nor));
      } catch (e) {
        warnings.push(makeWarning(
          'RECORD_MAPPING_FAILED',
          e && e.message ? e.message : `Failed to build a ViewModel for NOR "${nor.id}".`,
          { connectorId: NOR_CONNECTOR_ID, sourceRef: nor.id, severity: WARNING_SEVERITY.MEDIUM },
        ));
      }
    }
    return connectorSuccess(items, { connectorId: NOR_CONNECTOR_ID, warnings });
  } catch (e) {
    return connectorFailure(
      CONNECTOR_ERRORS.FETCH_FAILED,
      e && e.message ? e.message : 'NOR connector fetch failed.',
      { connectorId: NOR_CONNECTOR_ID },
    );
  }
}

export const norConnector = Object.freeze({
  id: NOR_CONNECTOR_ID,
  version: NOR_CONNECTOR_VERSION,
  description: "Acquires Draft Knowledge from generated NOR records' structural ViewModel (js/petty-cash/nor-document-engine.js#buildNorViewModel). Official, non-archived NORs only.",
  source: norSource,
  fetch,
});

registerConnector(norConnector);

export default norConnector;
