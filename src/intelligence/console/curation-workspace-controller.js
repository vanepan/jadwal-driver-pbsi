/* ============================================================
   CURATION-WORKSPACE-CONTROLLER.JS — Human Curation Workspace
   (V2, Phase 5.x.8)

   PURPOSE: the PURE state machine behind the Human Curation Workspace —
   the ONE controlled place an authorized operator inspects proposed
   Style Guide rules (5.x.5) + Visual Templates (5.x.6), their evidence,
   temporal context, provenance, conflicts and supersession candidates,
   and then explicitly approves / rejects / supersedes / deprecates them.

   IT IS A GOVERNANCE UI CONTROLLER. It is NOT an AI decision engine, NOT
   a generation engine, NOT RAG.

   BOUNDARIES (Phase 5.x.8):
     • Read ops (load / select / reload) NEVER mutate.
     • The ONLY mutating call is confirmDecision(), and it runs ONLY from
       an explicit operator gesture after an explicit confirmation with a
       NON-EMPTY written rationale. The controller never auto-approves,
       auto-rejects, auto-resolves a conflict, or auto-selects a winner.
     • The client sends ONLY { id, action, rationale, expectedVersion,
       acknowledgeConflict? }. The SERVER owns actor / timestamp /
       authority state / status / version / scope. A client authority
       field is neither sent nor trusted.
     • Optimistic concurrency: every decision carries the expectedVersion
       captured when the proposal was opened. A VERSION_CONFLICT (or any
       "already decided" code) surfaces as "reload before deciding" — the
       controller never offers a silent overwrite.
     • A conflict is a `conflict`; a gap is `empty`; an un-queryable
       subsystem is `unavailable`. These are never collapsed to each other
       or to "zero proposals".

   It is a thin adapter over TWO injected store facades, each satisfying
   the { list, get, approve, reject, deprecate, history } method subset of
   the Style Guide / Visual Template store contracts (the Memory backend
   in tests / DISABLED mode; the staged server callable in production).
   It never talks to Firebase, OpenAI, RTDB, the DOM or storage.

   RESPONSIBILITY: createCurationWorkspaceController({ styleGuide,
   visualTemplate, actor, onChange? }) → { getState, setOnChange, load,
   reload, setTab, setFilter, resetFilters, select, clearSelection,
   beginDecision, setRationale, setAcknowledgeConflict, cancelDecision,
   confirmDecision, dismissOutcome, destroy }.

   DEPENDENCIES: ../curation/contracts/curation-contract.js,
   ../curation/curation-view.js. PURE.
   ============================================================ */

'use strict';

import {
  CURATION_WORKSPACE_SCHEMA, CURATION_TAB, CURATION_DECISION, CURATION_DECISION_METHOD,
  CURATION_PROPOSAL_KIND, CURATION_DOMAIN_STATE, isCurationTab, isCurationDecision,
  curationErrorText, isStaleCode, isUnavailableCode,
} from '../curation/contracts/curation-contract.js';
import {
  buildCurationDashboard, buildStyleProposalRows, buildVisualProposalRows,
  filterCurationRows, availableFilterValues, buildStyleRuleReview, buildVisualTemplateReview,
  buildConflictView,
} from '../curation/curation-view.js';

const EMPTY_FILTERS = Object.freeze({
  status: null, documentType: null, category: null,
  temporalStatus: null, conventionEra: null, variant: null, conflictOnly: false,
});

/** Resolve a store result whether it came back sync (Memory backend) or
 *  as a Promise (callable backend). Never throws — a rejection becomes a
 *  typed NETWORK failure. */
async function settle(fnResult) {
  try {
    const r = await fnResult;
    if (r && typeof r === 'object' && 'ok' in r) return r;
    return { ok: false, data: null, error: { code: 'INVALID_RECORD', message: 'unrecognised store result' } };
  } catch (err) {
    const code = err && typeof err.code === 'string' && /permission-denied/.test(err.code) ? 'FORBIDDEN' : 'NETWORK';
    return { ok: false, data: null, error: { code, message: err && err.message ? err.message : 'transport error' } };
  }
}

function domainStateFor(result) {
  if (!result || result.ok !== true) {
    const code = result && result.error && result.error.code;
    if (code === 'FORBIDDEN' || code === 'PERMISSION_DENIED') return CURATION_DOMAIN_STATE.UNAVAILABLE;
    if (isUnavailableCode(code)) return CURATION_DOMAIN_STATE.UNAVAILABLE;
    return CURATION_DOMAIN_STATE.UNAVAILABLE;
  }
  const arr = Array.isArray(result.data) ? result.data : [];
  return arr.length === 0 ? CURATION_DOMAIN_STATE.EMPTY : CURATION_DOMAIN_STATE.READY;
}

/**
 * @param {Object} opts
 * @param {{ list:Function, get:Function, approve:Function, reject:Function, deprecate:Function, history:Function }} opts.styleGuide
 * @param {{ list:Function, get:Function, approve:Function, reject:Function, deprecate:Function, history:Function }} opts.visualTemplate
 * @param {{ userId:string|null, role:string|null }} [opts.actor]  the signed-in identity — NOT authz (the server re-verifies)
 * @param {(state:object)=>void} [opts.onChange]
 */
export function createCurationWorkspaceController({ styleGuide, visualTemplate, actor, onChange } = {}) {
  const reqMethods = ['list', 'get', 'approve', 'reject', 'deprecate', 'history'];
  const ok = (b) => b && reqMethods.every((m) => typeof b[m] === 'function');
  if (!ok(styleGuide) || !ok(visualTemplate)) {
    throw new Error('createCurationWorkspaceController: styleGuide + visualTemplate facades with { list, get, approve, reject, deprecate, history } are required.');
  }

  const who = { userId: (actor && actor.userId) || null, role: (actor && actor.role) || null };
  let _onChange = typeof onChange === 'function' ? onChange : null;
  const notify = (snap) => { if (_onChange) { try { _onChange(snap); } catch { /* a view error must not break the controller */ } } };

  // raw canonical records held between reads so select() can build the
  // review projection without another full round-trip (select() still
  // does a fresh get() for staleness + expectedVersion).
  const _records = { styleRules: null, visualTemplates: null };

  const state = {
    schema: CURATION_WORKSPACE_SCHEMA,
    ready: false,
    loading: false,
    tab: CURATION_TAB.OVERVIEW,
    actor: { ...who },
    domains: { styleGuide: CURATION_DOMAIN_STATE.IDLE, visualTemplate: CURATION_DOMAIN_STATE.IDLE },
    loadError: null,
    dashboard: null,
    rows: { styleRules: [], visualTemplates: [] },
    conflicts: { styleGuide: [], visualTemplate: [], total: 0 },
    filters: { ...EMPTY_FILTERS },
    selection: null,     // { kind, id }
    detail: null,        // review projection
    detailError: null,
    decision: null,      // { kind, method, rationale, acknowledgeConflict, busy, error, staleError, conflictBlocked, target }
    lastOutcome: null,   // { kind, id, status } — visible success feedback (§18)
  };

  function visibleRows(kind) {
    const rows = kind === CURATION_PROPOSAL_KIND.STYLE_RULE ? state.rows.styleRules : state.rows.visualTemplates;
    return filterCurationRows(rows, state.filters);
  }

  const snapshot = () => ({
    schema: state.schema,
    ready: state.ready,
    loading: state.loading,
    tab: state.tab,
    actor: { ...state.actor },
    domains: { ...state.domains },
    loadError: state.loadError,
    dashboard: state.dashboard,
    rows: { styleRules: state.rows.styleRules.slice(), visualTemplates: state.rows.visualTemplates.slice() },
    visibleRows: {
      styleRules: visibleRows(CURATION_PROPOSAL_KIND.STYLE_RULE),
      visualTemplates: visibleRows(CURATION_PROPOSAL_KIND.VISUAL_TEMPLATE),
    },
    filterValues: {
      styleRules: availableFilterValues(state.rows.styleRules),
      visualTemplates: availableFilterValues(state.rows.visualTemplates),
    },
    conflicts: {
      styleGuide: state.conflicts.styleGuide.slice(),
      visualTemplate: state.conflicts.visualTemplate.slice(),
      total: state.conflicts.total,
    },
    filters: { ...state.filters },
    selection: state.selection ? { ...state.selection } : null,
    detail: state.detail,
    detailError: state.detailError,
    decision: state.decision ? { ...state.decision, target: state.decision.target ? { ...state.decision.target } : null } : null,
    lastOutcome: state.lastOutcome ? { ...state.lastOutcome } : null,
  });
  const emit = () => notify(snapshot());

  function setOnChange(fn) { _onChange = typeof fn === 'function' ? fn : null; }

  function backendFor(kind) {
    return kind === CURATION_PROPOSAL_KIND.STYLE_RULE ? styleGuide : visualTemplate;
  }
  function reviewFor(kind, id) {
    return kind === CURATION_PROPOSAL_KIND.STYLE_RULE
      ? buildStyleRuleReview(_records.styleRules || [], id)
      : buildVisualTemplateReview(_records.visualTemplates || [], id);
  }
  function versionOf(kind, record) {
    if (!record || typeof record !== 'object') return undefined;
    return kind === CURATION_PROPOSAL_KIND.STYLE_RULE ? record.version : record.templateVersion;
  }

  /* ── READ: the whole-workspace refresh ──────────────────────────────── */
  async function load() {
    if (state.loading) return snapshot();
    state.loading = true;
    state.loadError = null;
    emit();

    const [sgRes, vtRes] = await Promise.all([
      settle(styleGuide.list({})),
      settle(visualTemplate.list({})),
    ]);

    state.domains.styleGuide = domainStateFor(sgRes);
    state.domains.visualTemplate = domainStateFor(vtRes);

    _records.styleRules = sgRes.ok && Array.isArray(sgRes.data) ? sgRes.data.slice() : null;
    _records.visualTemplates = vtRes.ok && Array.isArray(vtRes.data) ? vtRes.data.slice() : null;

    state.rows.styleRules = _records.styleRules ? buildStyleProposalRows(_records.styleRules) : [];
    state.rows.visualTemplates = _records.visualTemplates ? buildVisualProposalRows(_records.visualTemplates) : [];

    state.dashboard = buildCurationDashboard({
      styleRules: _records.styleRules,
      visualTemplates: _records.visualTemplates,
    });

    const cv = buildConflictView({
      styleRules: _records.styleRules,
      visualTemplates: _records.visualTemplates,
    });
    state.conflicts = { styleGuide: cv.styleGuide.slice(), visualTemplate: cv.visualTemplate.slice(), total: cv.total };

    const bothDown = state.domains.styleGuide === CURATION_DOMAIN_STATE.UNAVAILABLE
      && state.domains.visualTemplate === CURATION_DOMAIN_STATE.UNAVAILABLE;
    state.loadError = bothDown
      ? curationErrorText((sgRes.error && sgRes.error.code) || (vtRes.error && vtRes.error.code) || 'NO_BACKEND_CONFIGURED')
      : null;

    // refresh an open selection against the new records (never silently drop it)
    if (state.selection) {
      const d = reviewFor(state.selection.kind, state.selection.id);
      if (d) { state.detail = d; state.detailError = null; }
      else { state.detail = null; state.detailError = curationErrorText('NOT_FOUND'); }
    }

    state.ready = true;
    state.loading = false;
    emit();
    return snapshot();
  }

  async function reload() {
    // an explicit "my copy is stale — get the truth" action (§19, §20)
    if (state.decision) state.decision = { ...state.decision, staleError: null, error: null, busy: false };
    const snap = await load();
    if (state.selection) await select(state.selection.kind, state.selection.id);
    return snap;
  }

  /* ── navigation / filtering (deterministic UI state only) ───────────── */
  function setTab(tab) {
    if (isCurationTab(tab)) { state.tab = tab; emit(); }
    return snapshot();
  }
  function setFilter(key, value) {
    if (key in state.filters) {
      state.filters = { ...state.filters, [key]: value === '' ? null : value };
      emit();
    }
    return snapshot();
  }
  function resetFilters() {
    state.filters = { ...EMPTY_FILTERS };
    emit();
    return snapshot();
  }

  /* ── READ: open one proposal ───────────────────────────────────────── */
  async function select(kind, id) {
    if (!kind || !id) return snapshot();
    const proposalKind = kind === CURATION_PROPOSAL_KIND.VISUAL_TEMPLATE
      ? CURATION_PROPOSAL_KIND.VISUAL_TEMPLATE : CURATION_PROPOSAL_KIND.STYLE_RULE;
    state.selection = { kind: proposalKind, id: String(id) };
    state.detail = null;
    state.detailError = null;
    state.decision = null;
    emit();

    const backend = backendFor(proposalKind);
    const res = await settle(backend.get(String(id)));
    if (!res.ok) {
      state.detail = null;
      state.detailError = curationErrorText(res.error && res.error.code);
      emit();
      return snapshot();
    }

    // merge the fresh record into the local set so the projection reflects it
    const fresh = res.data;
    const bucket = proposalKind === CURATION_PROPOSAL_KIND.STYLE_RULE ? 'styleRules' : 'visualTemplates';
    const idKey = proposalKind === CURATION_PROPOSAL_KIND.STYLE_RULE ? 'ruleId' : 'templateId';
    const arr = Array.isArray(_records[bucket]) ? _records[bucket].slice() : [];
    const i = arr.findIndex((r) => r && r[idKey] === fresh[idKey]);
    if (i >= 0) arr[i] = fresh; else arr.push(fresh);
    _records[bucket] = arr;

    // pull the store-side supersession chain too (§24 — the sanctioned op)
    let storeHistory = [];
    const hist = await settle(backend.history(String(id)));
    if (hist.ok && Array.isArray(hist.data)) storeHistory = hist.data;

    const detail = reviewFor(proposalKind, id);
    if (detail) {
      state.detail = Object.freeze({
        ...detail,
        expectedVersion: versionOf(proposalKind, fresh),
        storeHistory,
      });
      state.detailError = null;
    } else {
      state.detail = null;
      state.detailError = curationErrorText('NOT_FOUND');
    }
    emit();
    return snapshot();
  }

  function clearSelection() {
    state.selection = null;
    state.detail = null;
    state.detailError = null;
    state.decision = null;
    emit();
    return snapshot();
  }

  /* ── WRITE: the explicit human decision ────────────────────────────── */
  function beginDecision(kind) {
    if (!isCurationDecision(kind)) return snapshot();
    if (!state.detail || !state.selection) return snapshot();
    const cap = state.detail.decision || {};
    const allowed = (
      (kind === CURATION_DECISION.APPROVE && cap.canApprove)
      || (kind === CURATION_DECISION.SUPERSEDE && cap.canSupersede)
      || (kind === CURATION_DECISION.REJECT && cap.canReject)
      || (kind === CURATION_DECISION.DEPRECATE && cap.canDeprecate)
    );
    if (!allowed) return snapshot();

    state.decision = {
      kind,
      method: CURATION_DECISION_METHOD[kind],
      rationale: '',
      acknowledgeConflict: false,
      busy: false,
      error: null,
      staleError: null,
      conflictBlocked: false,
      target: {
        kind: state.selection.kind,
        id: state.selection.id,
        expectedVersion: state.detail.expectedVersion,
        summary: describeTarget(state.detail),
      },
    };
    emit();
    return snapshot();
  }

  function describeTarget(detail) {
    if (!detail) return '';
    if (detail.kind === CURATION_PROPOSAL_KIND.STYLE_RULE && detail.proposed) {
      const p = detail.proposed;
      return `${p.category} → ${JSON.stringify(p.value)} (${p.documentType}, v${p.version})`;
    }
    if (detail.template) {
      const t = detail.template;
      return `${t.documentType} · ${t.variant} (v${t.version})`;
    }
    return detail.id || '';
  }

  function setRationale(text) {
    if (!state.decision) return snapshot();
    state.decision = { ...state.decision, rationale: String(text == null ? '' : text) };
    emit();
    return snapshot();
  }
  function setAcknowledgeConflict(v) {
    if (!state.decision) return snapshot();
    state.decision = { ...state.decision, acknowledgeConflict: v === true };
    emit();
    return snapshot();
  }
  function cancelDecision() {
    state.decision = null;
    emit();
    return snapshot();
  }
  function dismissOutcome() {
    state.lastOutcome = null;
    emit();
    return snapshot();
  }

  async function confirmDecision() {
    const dec = state.decision;
    if (!dec || dec.busy) return snapshot();
    if (!state.selection) return snapshot();

    const rationale = String(dec.rationale || '').trim();
    if (!rationale) {
      state.decision = { ...dec, error: curationErrorText('RATIONALE_REQUIRED') };
      emit();
      return snapshot();
    }

    const kind = state.selection.kind;
    const id = state.selection.id;
    const backend = backendFor(kind);
    const method = dec.method; // 'approve' | 'reject' | 'deprecate' (supersede → approve)

    // the client sends ONLY id + action + human reason + expectedVersion
    // (+ acknowledgeConflict). NO actor authority field. The server derives
    // actor / timestamp / authorityState / version / scope.
    const ctx = { actorId: who.userId, expectedVersion: dec.target && dec.target.expectedVersion };
    if (method === 'approve') {
      ctx.rationale = rationale;
      if (dec.acknowledgeConflict === true) ctx.acknowledgeConflict = true;
    } else {
      ctx.reason = rationale;
    }

    state.decision = { ...dec, busy: true, error: null, staleError: null };
    emit();

    const res = await settle(backend[method](id, ctx));

    if (res.ok) {
      state.lastOutcome = {
        kind,
        id,
        status: (res.data && res.data.status) || null,
        action: dec.kind,
      };
      state.decision = null;
      await load();                 // refresh dashboard / rows / conflicts
      await select(kind, id);       // refresh the detail (+ predecessor now deprecated)
      emit();
      return snapshot();
    }

    const code = res.error && res.error.code;
    const next = { ...state.decision, busy: false };
    if (code === 'CONFLICT_UNRESOLVED') {
      next.conflictBlocked = true;
      next.error = curationErrorText(code);
    } else if (isStaleCode(code)) {
      next.staleError = curationErrorText(code);
    } else {
      next.error = curationErrorText(code);
    }
    state.decision = next;
    emit();
    return snapshot();
  }

  return Object.freeze({
    getState: snapshot,
    setOnChange,
    load,
    reload,
    setTab,
    setFilter,
    resetFilters,
    select,
    clearSelection,
    beginDecision,
    setRationale,
    setAcknowledgeConflict,
    cancelDecision,
    confirmDecision,
    dismissOutcome,
    destroy() { /* no timers, no listeners, no I/O */ },
  });
}
