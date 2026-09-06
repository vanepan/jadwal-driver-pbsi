/* ============================================================
   CORPUS-WORKSPACE-CONTROLLER.JS — Sarpras Intelligence (V2, Phase C3)

   The PURE state machine behind the Corpus & Authority operator
   workspace. NO DOM, NO Firebase, NO OpenAI — it talks ONLY to an
   injected `port` (js/intelligence-backend-wiring.js
   #createWiredIntelligenceCorpusPort) whose every method returns the
   server's `{ ok, data, error }` envelope.

   OPERATOR FLOW (linear, each step explicit — nothing auto-fires):

     selectSource(file)          local: record the chosen synthetic source
        ↓
     ingest()                    → intelligenceCorpus op:ingest
        ↓                          (server owns ownerId + documentId)
     analyze()                   → intelligenceCorpus op:analyze
        ↓                          (deterministic pipeline; OBSERVED-only)
     loadObservations()          → intelligenceCorpus op:observations
        ↓
     buildWritingMemory()        → intelligenceCorpus op:writingMemory
        ↓                          (entries are observed / candidate — NEVER approved)
     proposeStyleRule(id)        → intelligenceStyleGuide op:proposeFromMemory
     proposeVisualTemplate(id)   → intelligenceVisualTemplate op:proposeFromEvidence
                                   (both create a PROPOSED, non-authoritative
                                    record; approval is a SEPARATE human step
                                    in the Curation workspace — there is NO
                                    approve action here)

   AUTHORITY: this controller never sends an authorityState, an approvedBy,
   a version, an ownerId, a documentId, a certification, or a lifecycle
   state. The server owns all of them. It never approves / rejects /
   deprecates / supersedes / publishes anything.
   ============================================================ */

'use strict';

export const CORPUS_PHASE = Object.freeze({
  IDLE: 'idle',
  SOURCE_READY: 'source_ready',
  INGESTED: 'ingested',
  ANALYZED: 'analyzed',
});

const CURATED_ERROR = {
  NO_BACKEND_CONFIGURED: 'Layanan Corpus belum aktif di server ini.',
  CALL_FAILED: 'Panggilan ke server gagal. Coba lagi.',
  MALFORMED_RESPONSE: 'Respons server tidak dikenali.',
  PIPELINE_UNAVAILABLE: 'Pipeline analisis tidak tersedia di server ini.',
  WRITING_MEMORY_UNAVAILABLE: 'Pembangun Writing Memory tidak tersedia di server ini.',
  VISUAL_ANALYSIS_UNAVAILABLE: 'Agregator bukti visual tidak tersedia di server ini.',
  ANALYSIS_FAILED: 'Analisis tidak menghasilkan hasil yang dapat dipakai.',
  MEMORY_NOT_FOUND: 'Entri Writing Memory itu tidak ditemukan di corpus Anda.',
  PATTERN_NOT_FOUND: 'Pola visual itu tidak ditemukan di corpus Anda.',
  FORBIDDEN: 'Dokumen corpus ini milik pengguna lain.',
  INVALID_RECORD: 'Data yang dikirim tidak lengkap.',
};

function curate(err) {
  if (!err) return 'Terjadi kesalahan.';
  const code = typeof err === 'object' ? err.code : String(err);
  return CURATED_ERROR[code] || 'Terjadi kesalahan pada layanan Corpus.';
}

/** Pull the CorpusDocument out of whatever envelope shape the server used. */
function pickDocument(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.document && typeof data.document === 'object') return data.document;
  if (data.schema === 'corpus-document@1') return data;
  return null;
}

/**
 * @param {Object} opts
 * @param {Object} opts.port      the wired corpus port (see module doc)
 * @param {{ userId?:string|null, role?:string|null, adminEquivalent?:boolean }} [opts.actor]
 * @param {Function} [opts.onChange]
 */
export function createCorpusWorkspaceController({ port, actor, onChange } = {}) {
  if (!port || typeof port !== 'object') throw new Error('createCorpusWorkspaceController: a `port` is required.');

  const state = {
    phase: CORPUS_PHASE.IDLE,
    actor: {
      userId: (actor && actor.userId) || null,
      role: (actor && actor.role) || null,
      adminEquivalent: !!(actor && actor.adminEquivalent),
    },
    source: null,          // { name, type, size, checksum, format, bytes:number[] }
    document: null,        // server-owned CorpusDocument
    analysis: null,        // { observationsRecorded, observationsMerged, statusPath, stages }
    observations: [],      // OBSERVED CorpusObservation[]
    writingMemory: null,   // { entries:[], drift:[], summary? }
    styleProposal: null,   // the PROPOSED style rule (non-authoritative)
    visualProposal: null,  // the PROPOSED visual template (non-authoritative)
    busy: false,
    error: null,
    notice: null,
  };

  let _cb = typeof onChange === 'function' ? onChange : null;
  const emit = () => { if (_cb) { try { _cb(getState()); } catch { /* view owns its errors */ } } };

  function getState() {
    return {
      phase: state.phase,
      actor: { ...state.actor },
      source: state.source ? { name: state.source.name, type: state.source.type, size: state.source.size, checksum: state.source.checksum, format: state.source.format } : null,
      document: state.document,
      analysis: state.analysis,
      observations: state.observations.slice(),
      writingMemory: state.writingMemory,
      styleProposal: state.styleProposal,
      visualProposal: state.visualProposal,
      busy: state.busy,
      error: state.error,
      notice: state.notice,
      documentId: state.document && state.document.documentId ? state.document.documentId : null,
    };
  }

  /** Serialised, double-call-guarded runner. */
  async function run(fn) {
    if (state.busy) return getState();
    state.busy = true;
    state.error = null;
    state.notice = null;
    emit();
    try {
      await fn();
    } catch (e) {
      state.error = curate(e && e.message ? { code: 'CALL_FAILED' } : e);
    } finally {
      state.busy = false;
      emit();
    }
    return getState();
  }

  /** Local only — record the chosen synthetic source. `bytes` is a plain
   *  number[] (0..255); `checksum` is its SHA-256 hex (computed by the
   *  view via crypto.subtle — this layer never hashes). */
  function selectSource({ name, type, size, checksum, format, bytes } = {}) {
    if (!Array.isArray(bytes) || !bytes.length || typeof checksum !== 'string' || checksum.length !== 64) {
      state.error = curate({ code: 'INVALID_RECORD' });
      emit();
      return getState();
    }
    state.source = {
      name: String(name || 'fixture'),
      type: String(type || ''),
      size: Number(size) || bytes.length,
      checksum,
      format: format === 'pdf' || format === 'docx' ? format : 'unknown',
      bytes,
    };
    state.document = null;
    state.analysis = null;
    state.observations = [];
    state.writingMemory = null;
    state.styleProposal = null;
    state.visualProposal = null;
    state.phase = CORPUS_PHASE.SOURCE_READY;
    state.error = null;
    state.notice = null;
    emit();
    return getState();
  }

  function ingest({ title, era, language } = {}) {
    return run(async () => {
      if (!state.source) { state.error = curate({ code: 'INVALID_RECORD' }); return; }
      // classification metadata ONLY — the server forces ownerId + documentId
      const seed = {
        checksum: state.source.checksum,
        type: state.source.format === 'pdf' ? 'PDF' : (state.source.format === 'docx' ? 'DOCX' : 'UNKNOWN'),
        title: String(title || state.source.name),
        filename: state.source.name,
        language: language ? String(language) : 'id',
        pageCount: null,
        sourcePath: null,
      };
      if (era) seed.era = String(era);
      const res = await port.ingest(seed);
      if (!res.ok) { state.error = curate(res.error); return; }
      const doc = pickDocument(res.data);
      if (!doc) { state.error = curate({ code: 'MALFORMED_RESPONSE' }); return; }
      state.document = doc;
      state.phase = CORPUS_PHASE.INGESTED;
      state.notice = res.data && res.data.duplicate ? 'Dokumen ini sudah ada di corpus (deduplikasi berdasarkan checksum).' : 'Dokumen berhasil dicatat.';
    });
  }

  function analyze() {
    return run(async () => {
      if (!state.document || !state.source) { state.error = curate({ code: 'INVALID_RECORD' }); return; }
      const source = {
        schema: 'corpus-source@1',
        checksum: state.source.checksum,
        format: state.source.format,
        originalFilename: state.source.name,
        mimeType: state.source.type,
        bytes: state.source.bytes,
      };
      const res = await port.analyze(state.document.documentId, source);
      if (!res.ok) { state.error = curate(res.error); return; }
      state.analysis = (res.data && res.data.analysis) || null;
      const doc = pickDocument(res.data);
      if (doc) state.document = doc;
      state.observations = [];
      state.phase = CORPUS_PHASE.ANALYZED;
      state.notice = state.analysis
        ? `Analisis selesai — ${state.analysis.observationsRecorded || 0} observasi dicatat.`
        : 'Analisis selesai.';
    });
  }

  function loadObservations() {
    return run(async () => {
      if (!state.document) { state.error = curate({ code: 'INVALID_RECORD' }); return; }
      const res = await port.observations(state.document.documentId);
      if (!res.ok) { state.error = curate(res.error); return; }
      state.observations = Array.isArray(res.data) ? res.data : (Array.isArray(res.data && res.data.observations) ? res.data.observations : []);
    });
  }

  function buildWritingMemory(config) {
    return run(async () => {
      const res = await port.writingMemory(config || {});
      if (!res.ok) { state.error = curate(res.error); return; }
      const d = res.data || {};
      const entries = Array.isArray(d.entries) ? d.entries : [];
      // defence in depth — the server strips non-observed/candidate, mirror it
      state.writingMemory = { ...d, entries: entries.filter((e) => e && (e.authorityState === 'observed' || e.authorityState === 'candidate')) };
      state.notice = `Writing Memory: ${state.writingMemory.entries.length} entri (observed / candidate).`;
    });
  }

  function proposeStyleRule(memoryId, config) {
    return run(async () => {
      if (!memoryId) { state.error = curate({ code: 'INVALID_RECORD' }); return; }
      const res = await port.proposeStyleRule(memoryId, config || {});
      if (!res.ok) { state.error = curate(res.error); return; }
      const rule = (res.data && (res.data.rule || res.data)) || null;
      state.styleProposal = rule;
      state.notice = 'Proposal aturan gaya dibuat — status: PROPOSED (belum otoritatif). Persetujuan dilakukan di Curation.';
    });
  }

  function proposeVisualTemplate(patternId, config) {
    return run(async () => {
      if (!patternId) { state.error = curate({ code: 'INVALID_RECORD' }); return; }
      const res = await port.proposeVisualTemplate(patternId, config || {});
      if (!res.ok) { state.error = curate(res.error); return; }
      const tpl = (res.data && (res.data.template || res.data)) || null;
      state.visualProposal = tpl;
      state.notice = 'Proposal template visual dibuat — status: PROPOSED (belum otoritatif). Persetujuan dilakukan di Curation.';
    });
  }

  function reset() {
    state.phase = CORPUS_PHASE.IDLE;
    state.source = null;
    state.document = null;
    state.analysis = null;
    state.observations = [];
    state.writingMemory = null;
    state.styleProposal = null;
    state.visualProposal = null;
    state.busy = false;
    state.error = null;
    state.notice = null;
    emit();
    return getState();
  }

  function setOnChange(fn) { _cb = typeof fn === 'function' ? fn : null; }
  function destroy() { _cb = null; }

  return {
    getState,
    selectSource,
    ingest,
    analyze,
    loadObservations,
    buildWritingMemory,
    proposeStyleRule,
    proposeVisualTemplate,
    reset,
    setOnChange,
    destroy,
  };
}
