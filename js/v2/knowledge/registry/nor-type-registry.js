/* ============================================================
   NOR-TYPE-REGISTRY.JS — Knowledge Platform (V2, North Star Gap Closure)

   PURPOSE: make NOR Type ("Jenis NOR" — Perjalanan Dinas / Reimbursement /
   Pengadaan / ...) a registered vocabulary value, exactly like domainType
   (domain-type-registry.js) and kind (kind-registry.js) already are — the
   same Map-backed register/has/get/list shape, for the same reason
   (Decision 1: a new value is a data call, never a hardcoded switch).

   WHY THIS REGISTRY EXISTS — see docs/NOR_TYPE_DOMAIN_MODEL.md (the
   approved design this file implements). Short version: `type`/"Jenis NOR"
   already existed as a fact extracted independently by BOTH
   problem-intelligence/problem-parser.js and conversation/intent/
   intent-engine.js, and had already drifted (the two literal tables no
   longer agreed on which values exist). This registry is the one place
   the vocabulary is spelled; both files now import `NOR_TYPE` (the id
   constants below) instead of hand-writing string literals a second time.

   WHY A NOR TYPE ALSO CARRIES A fieldSchema — mirrors problem-intelligence/
   contracts/problem-category-contract.js's own precedent exactly (that
   registry bundles a `fieldSchema` alongside `id`/`label` because Problem
   Category directly drives a Conversation's question flow). NOR Type plays
   the identical role for conversation/contracts/intent-contract.js's
   CREATE_NOR intent — see that file's `getRequiredFacts(intent, norType)`.

   WHY parentId EXISTS EVEN THOUGH EVERY REGISTERED VALUE TODAY IS ROOT-LEVEL
   (parentId: null). NOR Types are not guaranteed to stay a flat, one-level
   list forever (e.g. a future "Pengadaan Barang" / "Pengadaan Jasa" split
   under one "Pengadaan" parent). Nothing downstream should have to change
   shape to support that later — the field is real infrastructure now, an
   unused capability for as long as the real vocabulary stays flat. Every
   function below already accepts and returns whatever depth is registered;
   `listNorTypes()` defaults to every value (flat, today's true shape) but
   `listNorTypes({ parentId })` already lets a caller walk one level of a
   real hierarchy the moment one is registered.

   WHY NO KEYWORDS/EXTRACTION LOGIC LIVE HERE. Same NON-GOALS discipline
   problem-category-contract.js's own header states: "no parsing logic...
   vocabulary, not logic." Recognizing a NOR Type from free text stays in
   problem-parser.js and intent-engine.js, each with its own local keyword
   table — this registry only fixes which VALUES those tables are allowed
   to produce.

   WHY norType ITSELF IS NOT A NEW KnowledgeItem CONTRACT FIELD. A
   KnowledgeItem that wants to scope itself to one NOR Type does so via the
   existing, precedented `payload` convention (the same "opaque to the
   core, a plain field a consumer reads by agreement" pattern
   rule-applicability-engine.js's own `appliesWhen` and question-optimizer.js's
   `default:<field>` Profile Override key already use) — `payload.norType`,
   optional, absent meaning "generic, applies to every NOR Type". This
   keeps knowledge-item-contract.js's own `isKnowledgeItem()` structural
   check, and every existing seeded KnowledgeItem, completely untouched.

   RESPONSIBILITY: register/has/get/list NOR Type ids + labels + fieldSchema,
   NOR_TYPE (the id constants problem-parser.js and intent-engine.js both
   import).

   DEPENDENCIES: none.
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string, parentId: string|null, fieldSchema: object[]}>} */
const _norTypes = new Map();

/**
 * @param {string} id
 * @param {string} label
 * @param {{field: string, label: string, prompt: string, optimizable: boolean}[]} [fieldSchema]
 * @param {{parentId?: string|null}} [opts] - parentId must already be a registered NOR Type id (register parents before children); null (the default) means root-level.
 */
export function registerNorType(id, label, fieldSchema = [], { parentId = null } = {}) {
  if (typeof id !== 'string' || !id) throw new Error('registerNorType: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerNorType: label must be a non-empty string');
  if (!Array.isArray(fieldSchema)) throw new Error('registerNorType: fieldSchema must be an array');
  if (parentId !== null && !_norTypes.has(parentId)) {
    throw new Error(`registerNorType: parentId "${parentId}" is not a registered NOR Type — register parents before children.`);
  }
  _norTypes.set(id, Object.freeze({
    id, label, parentId, fieldSchema: Object.freeze(fieldSchema.map((f) => Object.freeze({ ...f }))),
  }));
}

export function hasNorType(id) {
  return _norTypes.has(id);
}

export function getNorType(id) {
  return _norTypes.get(id) || null;
}

/**
 * Flat by default — every registered NOR Type, in registration order (today's
 * real vocabulary is one level deep). Pass `{ parentId }` (including `null`
 * for root-level only) to query one level of a real hierarchy once a NOR
 * Type is registered with a parent — never assumes the vocabulary stays a
 * flat list. Omitting `parentId` entirely (not even `undefined`) is the
 * "give me everything" query the caller almost always wants today.
 * @param {{parentId?: string|null}} [filter]
 */
export function listNorTypes(filter = {}) {
  const all = [..._norTypes.values()];
  if (!('parentId' in filter)) return Object.freeze(all);
  return Object.freeze(all.filter((t) => t.parentId === filter.parentId));
}

export function getNorTypeFieldSchema(id) {
  const t = _norTypes.get(id);
  return t ? t.fieldSchema : Object.freeze([]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetNorTypeRegistry() {
  _norTypes.clear();
  bootstrap();
}

/** The closed set of ids problem-parser.js and intent-engine.js both import
 *  instead of hand-writing string literals — see header. */
export const NOR_TYPE = Object.freeze({
  PERJALANAN_DINAS: 'Perjalanan Dinas',
  REIMBURSEMENT: 'Reimbursement',
  PENGADAAN: 'Pengadaan',
  // Phase 8.5 Iteration 2 (Core NOR Knowledge Pack) — the ONLY NOR Type with
  // real document evidence anywhere in this repository (two real, filled
  // NOR PDFs; see js/v2/knowledge/bootstrap/nor-reverse-engineering-knowledge.js
  // and docs/NOR-Specification.md). The literal string is lifted verbatim
  // from the single most confidently evidenced fact in that evidence base
  // (pattern.perihal-subject-line, confidence 0.9): every real NOR's own
  // Perihal line reads "Realisasi Petty Cash Pertanggal {tanggal} Bidang
  // Sarana dan Prasarana" — this is not a name this session invented.
  REALISASI_PETTY_CASH: 'Realisasi Petty Cash',
});

/* ── bootstrap: Perjalanan Dinas's fieldSchema is the mission's own
   CREATE_NOR walkthrough content, unchanged, just relocated from
   intent-contract.js#INTENT_FIELD_SCHEMA (minus `type` itself, which stays
   the one field every CREATE_NOR conversation asks regardless of NOR Type
   — see intent-contract.js). Pengadaan's fieldSchema mirrors
   problem-intelligence/contracts/problem-category-contract.js's own
   `procurement` entry content — already-written, already-correct fields,
   re-authored here because CREATE_NOR's real Conversation (Question
   Optimizer, Knowledge-backed resolution) and the generic Problem
   Conversation fallback loop are two different consumers, not because the
   content itself changed. Reimbursement is registered (so it validates and
   lists like any other NOR Type) but intentionally carries NO fieldSchema
   yet — deciding its real fields is a content/business question
   docs/NOR_TYPE_DOMAIN_MODEL.md explicitly deferred, not an oversight;
   intent-contract.js#getRequiredFacts falls back to Perjalanan Dinas's
   schema for any NOR Type registered without one of its own, preserving
   exactly today's pre-existing behavior rather than asking nothing. ────── */
function bootstrap() {
  registerNorType(NOR_TYPE.PERJALANAN_DINAS, 'Perjalanan Dinas', [
    { field: 'destination', label: 'Tujuan', prompt: 'Tujuan perjalanan/kegiatan ke mana?', optimizable: false },
    { field: 'traveler', label: 'Pelaksana', prompt: 'Siapa atau unit mana yang melaksanakan?', optimizable: true },
    { field: 'departureDate', label: 'Tanggal Berangkat', prompt: 'Kapan tanggal keberangkatan?', optimizable: false },
    { field: 'returnDate', label: 'Tanggal Kembali', prompt: 'Kapan tanggal kembali?', optimizable: false },
    { field: 'budget', label: 'Estimasi Anggaran', prompt: 'Berapa estimasi anggaran yang dibutuhkan?', optimizable: false },
  ]);
  registerNorType(NOR_TYPE.PENGADAAN, 'Pengadaan', [
    { field: 'item', label: 'Barang', prompt: 'Barang atau jasa apa yang ingin dibeli?', optimizable: false },
    { field: 'quantity', label: 'Jumlah', prompt: 'Berapa jumlah yang dibutuhkan?', optimizable: true },
    { field: 'purpose', label: 'Tujuan Penggunaan', prompt: 'Untuk keperluan apa?', optimizable: true },
    { field: 'budget', label: 'Estimasi Anggaran', prompt: 'Berapa estimasi anggarannya?', optimizable: false },
  ]);
  registerNorType(NOR_TYPE.REIMBURSEMENT, 'Reimbursement', []);
  // Realisasi Petty Cash's fieldSchema is deliberately this short — real
  // evidence (NOR-Specification.md's own Business Rules §D.5-D.7) shows the
  // Perihal, recipients, cc, sender and every signatory are ALL fixed/
  // system-derived or Settings-driven (rule.recipients-fixed,
  // rule.cc-fixed, rule.sender-fixed, rule.signatories-are-settings — never
  // a per-occasion Conversation answer), and the realized ledger amount
  // itself is pulled from already-recorded, status-"available" expense
  // data (ontology.nor's own `dependencies`), never typed fresh into a
  // Conversation. The one genuinely per-occasion fact a human provides is
  // the reporting date — it alone drives the system-derived Perihal
  // ("Realisasi Petty Cash Pertanggal {tanggal}...") and the document
  // number's month/year. Authoring more fields here without real evidence
  // of what else the real workflow asks a human would be exactly the
  // fabrication this sprint's own brief forbids.
  registerNorType(NOR_TYPE.REALISASI_PETTY_CASH, 'Realisasi Petty Cash', [
    { field: 'tanggal', label: 'Tanggal Pelaporan', prompt: 'Petty cash direalisasikan pertanggal berapa?', optimizable: false },
  ]);
}

bootstrap();
