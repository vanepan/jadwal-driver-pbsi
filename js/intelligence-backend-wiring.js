/* ============================================================
   INTELLIGENCE-BACKEND-WIRING.JS — V2 Phase 2F (client backend wiring)

   The browser adapter that hands the DEPLOYED Firebase callables to the
   ESM Sarpras Intelligence layer. This is the ONE js/ module allowed to
   import src/intelligence/ (see scripts/intelligence-foundation-check.mjs);
   everything else stays isolated. All real logic lives in the pure,
   Node-testable src/intelligence/client-bootstrap.js — this file only maps
   js/firebase.js#callIntelligenceConversation / callGenerateCompletion onto
   its two injected ports.

   WHAT IT DOES: registers the server-owned RTDB conversation backend, the
   Phase 4 NOR-draft backend, the Phase 5 canonical NOR-Registry backend,
   and the OpenAI provider adapter. Registration only. Phase 3A: it also
   forwards the already-fetched `/feature_flags` node so the bootstrap can
   sync `/feature_flags/intelligence/enabled` into the Intelligence config
   and pick the provider from it (fail-closed — only the boolean `true`
   activates the OpenAI provider). Phase 3B: it also assembles the
   createIntelligenceService() instance the console UI drives (ports = the
   real existing V2 domains, provider = the ACTIVE one — Null while the flag
   is OFF). Phase 5: `approve` / `publish` remain explicit HUMAN operations —
   this wiring never calls them.

   WHAT IT NEVER DOES: WRITE the feature flag (it only reads what
   loadFeatureFlags() already fetched), activate the OpenAI provider while
   the flag is OFF (the Null Provider stays active → deterministic path,
   zero OpenAI risk), call OpenAI, create a conversation, mount UI, touch V1.

   CALLED FROM: js/app.js#startAuthenticatedSession() — once, after Firebase
   auth is ready AND after the post-auth loadFeatureFlags() re-read, behind
   isV2Enabled(getCurrentUser()), lazy-loaded via module-loader-registry.js
   so a normal V1 session never fetches it or src/intelligence/. Errors are
   swallowed — a failure leaves Intelligence inert and never disturbs V1 boot.
   The Phase 3B console factory is reached only from js/intelligence-console.js
   (itself only mounted for the pilot with the synced flag ON).
   ============================================================ */

'use strict';

import {
  callGenerateCompletion, callIntelligenceConversation, callIntelligenceNorDraft, callIntelligenceNorRegistry,
  callIntelligenceStyleGuide, callIntelligenceVisualTemplate, callIntelligenceNorGeneration, callIntelligenceCorpus,
} from './firebase.js';
import { bootstrapIntelligenceClient } from '../src/intelligence/client-bootstrap.js';
import { createIntelligenceService } from '../src/intelligence/service/intelligence-service.js';
import { buildDefaultPorts } from '../src/intelligence/service/default-ports.js';
import { getActiveProvider } from '../src/intelligence/provider-registry.js';
import { getIntelligenceConfig, isIntelligenceEnabled } from '../src/intelligence/config/intelligence-config.js';
import { createIntelligenceConsoleController } from '../src/intelligence/console/intelligence-console-controller.js';
import { createCurationWorkspaceController } from '../src/intelligence/console/curation-workspace-controller.js';
import { createCorpusWorkspaceController } from '../src/intelligence/console/corpus-workspace-controller.js';
import {
  listStyleRules, getStyleRule, approveStyleRule, rejectStyleRule, deprecateStyleRule, getStyleRuleHistory,
} from '../src/intelligence/corpus/style-guide/style-guide-store.js';
import {
  listVisualTemplates, getVisualTemplate, approveVisualTemplate, rejectVisualTemplate,
  deprecateVisualTemplate, getVisualTemplateHistoryChain,
} from '../src/intelligence/corpus/visual-template/visual-template-store.js';
import {
  makeGenerationContext, isGenerationContext, GENERATION_GATE_OUTCOME, GENERATION_MODE,
  RETRIEVAL_CERTIFICATION_STATUS, RETRIEVAL_DOMAIN_STATUS,
} from '../src/intelligence/generation/contracts/generation-context-contract.js';
import { resolveRenderingVisualModel } from '../src/intelligence/generation/visual-rendering-model.js';
import { buildIntelligenceNorViewModel } from '../src/intelligence/generation/nor-preview-view-model.js';

let _wired = false;
let _status = null;

/** Client-side UI-visibility pre-check ONLY. The deployed Cloud Functions
 *  independently enforce authz from the verified Firebase context via
 *  serverPermissions.js#canUseIntelligence — `role === 'admin' ||
 *  adminEquivalent === true` — and that is the security boundary; this
 *  never widens it. Kept in lockstep with the server so the UI shows/hides
 *  the same set the server would allow: effective admin only (the legacy
 *  `developer` role is not a server grant — see the C2/authz audits — and
 *  is not a mintable role in this app, so it is not listed here). */
const CLIENT_INTELLIGENCE_ROLES = new Set(['admin']);
/** @returns {boolean} whether the actor is an effective admin for UI purposes. */
function clientCanUseIntelligence(a) {
  return !!a && (CLIENT_INTELLIGENCE_ROLES.has(a.role) || a.adminEquivalent === true);
}

/** RTDB-safe conversation id (no `.` `$` `#` `[` `]` `/`). The server still
 *  owns ownership + persistence; this is only the local handle the service
 *  echoes back in its response. */
let _convSeq = 0;
function makeConversationId() {
  _convSeq += 1;
  return `conv_${Date.now().toString(36)}_${_convSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Register the deployed callable conversation backend + the OpenAI provider
 * adapter, and sync `/feature_flags/intelligence/enabled` into the config.
 * Idempotent, never throws.
 * @param {*} [featureFlags]  the `/feature_flags` node already fetched by
 *   js/app.js#loadFeatureFlags(). Missing / malformed ⇒ Intelligence OFF.
 * @returns {Promise<Object>} the bootstrap status
 */
export async function wireIntelligenceBackend(featureFlags) {
  if (_wired && _status) return _status;
  try {
    _status = bootstrapIntelligenceClient({
      callConversation: (payload) => callIntelligenceConversation(payload),
      callModel: (req) => callGenerateCompletion(req),
      callDraft: (payload) => callIntelligenceNorDraft(payload),
      callRegistry: (payload) => callIntelligenceNorRegistry(payload),
      // Phase 5.x.8 — the Human Curation Workspace reads + walks the
      // human-gated authority lifecycle through these two staged callables.
      // Inert in production today (not in functions/index.js) ⇒ the store
      // keeps its Null backend and the workspace shows "unavailable".
      callStyleGuide: (payload) => callIntelligenceStyleGuide(payload),
      callVisualTemplate: (payload) => callIntelligenceVisualTemplate(payload),
      featureFlags: (featureFlags && typeof featureFlags === 'object') ? featureFlags : undefined,
    });
    _wired = _status.ok === true;
    if (!_status.ok && _status.error) {
      // eslint-disable-next-line no-console
      console.warn('[intelligence] backend wiring incomplete —', _status.error);
    }
  } catch (err) {
    _status = { ok: false, error: err && err.message ? err.message : String(err) };
    // eslint-disable-next-line no-console
    console.warn('[intelligence] backend wiring skipped —', _status.error);
  }
  return _status;
}

/** Test/introspection helper. */
export function isIntelligenceBackendWired() {
  return _wired;
}

/**
 * Phase 6A §2, §3, §26 — the SERVER-AUTHORITATIVE retrieval port. The
 * browser NEVER composes a certification / gate / authority decision
 * itself: it calls the intelligenceNorGeneration callable, which
 * independently gathers the approved Style Guide + Visual Template records
 * and runs the Phase 6 deterministic gate SERVER-SIDE, then returns that
 * result completely unmodified — this port does not touch, reinterpret, or
 * re-derive it (§24 — the client only ever renders server state).
 *
 * If the callable cannot be reached (STAGED / not yet deployed today, a
 * network failure, or a malformed reply) this FAILS CLOSED to an honest
 * `GENERATION_BLOCKED_UNAVAILABLE` context — never a guess, never a
 * locally-recomputed "certified" claim (§13). This is the ONLY place the
 * browser ever constructs a GenerationContext itself, and it only ever
 * constructs the UNAVAILABLE one.
 * @returns {{ buildGenerationContext: (args:{documentType?:string, mode?:string, at?:string}) => Promise<object> }}
 */
function serverAuthoritativeRetrievalPort() {
  return {
    async buildGenerationContext({ documentType, mode, at } = {}) {
      const when = at || new Date().toISOString();
      let res;
      try {
        res = await callIntelligenceNorGeneration({ op: 'generationContext', documentType });
      } catch {
        res = null;
      }
      if (res && res.ok && isGenerationContext(res.data)) {
        return res.data;
      }
      return makeGenerationContext({
        mode: mode || GENERATION_MODE.INTELLIGENCE,
        gate: GENERATION_GATE_OUTCOME.BLOCKED_UNAVAILABLE,
        reasons: ['The server-authoritative generation service could not be reached.'],
        generatedAt: when,
        retrieval: {
          certification: RETRIEVAL_CERTIFICATION_STATUS.UNAVAILABLE,
          styleGuideStatus: RETRIEVAL_DOMAIN_STATUS.UNAVAILABLE,
          visualTemplateStatus: RETRIEVAL_DOMAIN_STATUS.UNAVAILABLE,
          documentType: documentType || null,
          retrievedAt: when,
        },
      });
    },
  };
}

/**
 * Build the minimal Phase 3B console controller over an EXISTING
 * createIntelligenceService() instance. Ensures the backend is wired first
 * (idempotent), then composes:
 *   ports    → buildDefaultPorts()  (the real existing V2 domains — reuse),
 *              with `retrieval` OVERRIDDEN by the Phase 6A server-authoritative
 *              port above (the ESM default composes locally and is only the
 *              safe fallback for pure/offline tests)
 *   provider → getActiveProvider()  (Null while the flag is OFF ⇒ template body,
 *                                    0 OpenAI calls; OpenAI only once the synced
 *                                    flag flipped it active during bootstrap)
 *   config   → the Phase 0 config module (flag + limits)
 *   authz    → a client PRE-CHECK only (server re-verifies — never widened here)
 *   idgen    → makeConversationId()
 *
 * @param {{ actor?: {userId?:string|null, role?:string|null}, onChange?:Function }} [opts]
 * @returns {Promise<import('../src/intelligence/console/intelligence-console-controller.js').*>}
 */
export async function createWiredIntelligenceConsoleController({ actor, onChange } = {}) {
  await wireIntelligenceBackend();
  const service = createIntelligenceService({
    ports: { ...buildDefaultPorts(), retrieval: serverAuthoritativeRetrievalPort() },
    provider: getActiveProvider(),
    authz: {
      canUseIntelligence: (a) => clientCanUseIntelligence(a),
      canAccessKnowledge: () => true,
    },
    config: {
      isEnabled: () => isIntelligenceEnabled(),
      get: () => getIntelligenceConfig(),
    },
    idgen: makeConversationId,
  });
  return createIntelligenceConsoleController({
    service,
    actor: { userId: (actor && actor.userId) || null, role: (actor && actor.role) || null },
    onChange,
  });
}

/**
 * Build the Phase 5.x.8 Human Curation Workspace controller over the
 * EXISTING Style Guide + Visual Template store facades (the ones the
 * bootstrap just pointed at the staged callable backends — or the inert
 * Null backends when the callables are absent, which today they are).
 *
 * The controller talks ONLY to the `{ list, get, approve, reject,
 * deprecate, history }` subset — the read side plus the human-gated
 * authority lifecycle. It NEVER proposes, never touches Writing Memory,
 * never calls the NOR generator / Registry, never OpenAI. Approval /
 * rejection / supersession / deprecation are explicit HUMAN operations
 * from the workspace — this wiring never invokes them.
 *
 * @param {{ actor?: {userId?:string|null, role?:string|null}, onChange?:Function }} [opts]
 * @returns {Promise<import('../src/intelligence/console/curation-workspace-controller.js').*>}
 */
export async function createWiredIntelligenceCurationController({ actor, onChange } = {}) {
  await wireIntelligenceBackend();
  const styleGuide = {
    list: (filter) => listStyleRules(filter),
    get: (id) => getStyleRule(id),
    approve: (id, ctx) => approveStyleRule(id, ctx),
    reject: (id, ctx) => rejectStyleRule(id, ctx),
    deprecate: (id, ctx) => deprecateStyleRule(id, ctx),
    history: (id) => getStyleRuleHistory(id),
  };
  const visualTemplate = {
    list: (filter) => listVisualTemplates(filter),
    get: (id) => getVisualTemplate(id),
    approve: (id, ctx) => approveVisualTemplate(id, ctx),
    reject: (id, ctx) => rejectVisualTemplate(id, ctx),
    deprecate: (id, ctx) => deprecateVisualTemplate(id, ctx),
    history: (id) => getVisualTemplateHistoryChain(id),
  };
  return createCurationWorkspaceController({
    styleGuide,
    visualTemplate,
    actor: { userId: (actor && actor.userId) || null, role: (actor && actor.role) || null },
    onChange,
  });
}

/**
 * Phase 6C — build a client-side PDF PREVIEW of an owned NOR draft.
 *
 * Server-authoritative from end to end: the ONLY draft/visual-authority
 * source is the `intelligenceNorDraft` callable's `preview` op, which
 * (re-using its existing auth + effective-admin authorization + owner
 * check) loads the OWNED draft and re-runs the Phase 6A point-lookup
 * verification of its STORED generation context. The browser never
 * retrieves a Visual Template, never composes a certified context, never
 * decides authority (§9, §20, §32).
 *
 * This function then does two PURE, deterministic transforms
 * (src/intelligence/generation/*):
 *   1. resolveRenderingVisualModel(binding)  — ONLY when the server verdict
 *      is `applied`; `stale` / `invalid` / `fallback` ⇒ no template
 *      geometry, the deterministic composer layout stands (§11, §32).
 *   2. buildIntelligenceNorViewModel(draft, { renderingVisualModel })
 *      — NorDraftRecord → the EXISTING `composer-document` renderer input.
 *
 * Returns the renderer input + the freshness verdict for the review UI to
 * disclose ("Template applied" vs "Deterministic fallback", §31). It does
 * NOT call pdfmake — js/intelligence-console.js pairs the returned data
 * with the EXISTING js/docs/* engine (DocumentEngine.generate), so there is
 * ONE PDF pipeline (§4, §15). No write, no number, no Registry, no publish
 * anywhere in this path (§13, §14, §29).
 *
 * @param {string} draftId
 * @returns {Promise<{ ok:boolean, data?:{ composerData:object, previewVisual:{status:string,templateId:string|null,templateVersion:number|null,reason:string|null} }, error?:{code:string,message:string} }>}
 */
export async function previewIntelligenceNorDraft(draftId) {
  let res;
  try {
    res = await callIntelligenceNorDraft({ op: 'preview', draftId: String(draftId || '') });
  } catch (err) {
    return { ok: false, error: { code: 'PREVIEW_UNAVAILABLE', message: (err && err.message) || 'Layanan pratinjau tidak dapat dihubungi.' } };
  }
  if (!res || res.ok !== true || !res.data || !res.data.draft) {
    return { ok: false, error: (res && res.error) || { code: 'PREVIEW_FAILED', message: 'Pratinjau draf gagal dibuat.' } };
  }
  const { draft, previewVisual } = res.data;
  const verdict = previewVisual && typeof previewVisual === 'object'
    ? previewVisual
    : { status: 'fallback', templateId: null, templateVersion: null, reason: null };
  const binding = draft.provenance && typeof draft.provenance === 'object' ? draft.provenance.visualBinding : null;
  const renderingVisualModel = verdict.status === 'applied' ? resolveRenderingVisualModel(binding) : null;
  const composerData = buildIntelligenceNorViewModel(draft, { renderingVisualModel });
  return { ok: true, data: { composerData, previewVisual: verdict } };
}

/**
 * Phase C3 — the Corpus & Authority operator workspace port.
 *
 * A THIN facade over the deployed `intelligenceCorpus` callable (Phase
 * C1 wired the deterministic analysis / writing-memory runners) plus the
 * two proposal callables. Every method is a passthrough that returns the
 * server's `{ ok, data, error }` envelope verbatim:
 *   • the browser never writes RTDB, never sets ownerId / documentId /
 *     ingestionStatus / analysisStatus / a lifecycle state (all stripped +
 *     server-owned)
 *   • no observation is `approved` here; `proposeFromMemory` /
 *     `proposeFromEvidence` create PROPOSED (non-authoritative) records
 *     only — approval is a separate HUMAN step in the Curation workspace
 *   • no OpenAI, no model, no external HTTP
 *
 * Returns a PURE corpus-workspace controller (state machine) built over
 * that port — the SAME architecture as createWiredIntelligenceConsole-
 * Controller / createWiredIntelligenceCurationController: js/ never imports
 * src/intelligence/ except through THIS module.
 *
 * @param {{ actor?: {userId?:string|null, role?:string|null, adminEquivalent?:boolean}, onChange?:Function }} [opts]
 * @returns {Promise<import('../src/intelligence/console/corpus-workspace-controller.js').*>}
 */
export async function createWiredIntelligenceCorpusController({ actor, onChange } = {}) {
  await wireIntelligenceBackend();
  const call = async (fn, label) => {
    try {
      const res = await fn();
      if (res && typeof res === 'object' && 'ok' in res) return res;
      return { ok: false, data: null, error: { code: 'MALFORMED_RESPONSE', message: `${label}: unexpected response shape.` } };
    } catch (err) {
      const msg = (err && err.message) || String(err);
      const code = /not-found/i.test(msg) ? 'NO_BACKEND_CONFIGURED' : 'CALL_FAILED';
      return { ok: false, data: null, error: { code, message: msg } };
    }
  };
  const port = {
    // corpus (deployed)
    ingest: (document) => call(() => callIntelligenceCorpus({ op: 'ingest', document: document || {} }), 'ingest'),
    analyze: (documentId, source) => call(() => callIntelligenceCorpus({ op: 'analyze', documentId: String(documentId || ''), source: source || null }), 'analyze'),
    listDocuments: () => call(() => callIntelligenceCorpus({ op: 'list' }), 'list'),
    observations: (documentId) => call(() => callIntelligenceCorpus({ op: 'observations', documentId: String(documentId || '') }), 'observations'),
    writingMemory: (config) => call(() => callIntelligenceCorpus({ op: 'writingMemory', config: config || {} }), 'writingMemory'),
    temporalView: (config) => call(() => callIntelligenceCorpus({ op: 'temporalView', config: config || {} }), 'temporalView'),
    // authority PROPOSALS (deployed; proposal-only, never approve)
    proposeStyleRule: (memoryId, config) => call(() => callIntelligenceStyleGuide({ op: 'proposeFromMemory', memoryId: String(memoryId || ''), config: config || {} }), 'proposeFromMemory'),
    proposeVisualTemplate: (patternId, config) => call(() => callIntelligenceVisualTemplate({ op: 'proposeFromEvidence', patternId: String(patternId || ''), config: config || {} }), 'proposeFromEvidence'),
  };
  return createCorpusWorkspaceController({
    port,
    actor: { userId: (actor && actor.userId) || null, role: (actor && actor.role) || null, adminEquivalent: !!(actor && actor.adminEquivalent) },
    onChange,
  });
}
