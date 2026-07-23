/* ============================================================
   PROBLEM-CATEGORY-CONTRACT.JS — Problem Intelligence Foundation
   (V2, Phase 8-10)

   PURPOSE: make Problem Category a REGISTERED vocabulary value — "Facility"
   vs. "Business Trip" vs. any future category — never a hardcoded switch,
   mirroring knowledge/registry/kind-registry.js's exact Map-backed
   register/has/get/list shape (Decision 1's discipline, applied to a new
   taxonomy). Explicitly answers this phase's own "Extensible Problem
   Types" requirement: adding a category is a `registerProblemCategory()`
   data call, never a code change to problem-parser.js or
   problem-classification-service.js.

   WHY THIS IS A DIFFERENT TAXONOMY FROM conversation/contracts/
   intent-contract.js#INTENT. INTENT answers "what PLATFORM ACTION does a
   human want" (create a NOR, upload knowledge, ...) — a closed, small,
   deliberately-fixed enum of operations this platform can execute.
   Problem Category answers "what KIND OF ORGANIZATIONAL PROBLEM is this" —
   a broader, growing space that exists BEFORE any platform action is
   decided (CLAUDE.md's Thinking Model: Problem is upstream of Decision).
   The two are related (a category MAY map to a downstream intent — see
   js/v2/problem-solving/services/problem-solving-service.js's own
   CATEGORY_TO_INTENT table), never conflated, never merged into one enum.

   RESPONSIBILITY: register/list/check Problem Category ids, each carrying
   a `defaultDomainType` (registry-backed, knowledge/registry/
   domain-type-registry.js — so a classified Problem always has a real,
   valid `domainType` for Knowledge Lookup) and a `fieldSchema` (shape
   identical to intent-contract.js#RequiredFact — reused, not redefined).

   DEPENDENCIES: none.

   NON-GOALS: no parsing logic (see problem-parser.js). No interpretation
   of what a field means — vocabulary, not logic.
   ============================================================ */

'use strict';

/** @type {Map<string, {id: string, label: string, defaultDomainType: string, fieldSchema: object[]}>} */
const _categories = new Map();

/**
 * @param {string} id
 * @param {string} label
 * @param {string} defaultDomainType - a domainType already registered in domain-type-registry.js
 * @param {{field: string, label: string, prompt: string, optimizable: boolean}[]} fieldSchema
 */
export function registerProblemCategory(id, label, defaultDomainType, fieldSchema) {
  if (typeof id !== 'string' || !id) throw new Error('registerProblemCategory: id must be a non-empty string');
  if (typeof label !== 'string' || !label) throw new Error('registerProblemCategory: label must be a non-empty string');
  if (typeof defaultDomainType !== 'string' || !defaultDomainType) throw new Error('registerProblemCategory: defaultDomainType must be a non-empty string');
  if (!Array.isArray(fieldSchema)) throw new Error('registerProblemCategory: fieldSchema must be an array');
  _categories.set(id, Object.freeze({
    id, label, defaultDomainType, fieldSchema: Object.freeze(fieldSchema.map((f) => Object.freeze({ ...f }))),
  }));
}

export function hasProblemCategory(id) {
  return _categories.has(id);
}

export function getProblemCategory(id) {
  return _categories.get(id) || null;
}

export function listProblemCategories() {
  return Object.freeze([..._categories.values()]);
}

export function getProblemCategoryFieldSchema(id) {
  const c = _categories.get(id);
  return c ? c.fieldSchema : Object.freeze([]);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetProblemCategoryRegistry() {
  _categories.clear();
  bootstrap();
}

/* ── bootstrap: the two categories Phase 8-10's own worked examples name,
   plus Phase 10.5's own three worked additions (Procurement, Administration
   — Part 7's validation scenarios; Knowledge Search / Document Upload —
   Part 2's own named routes), plus an honest UNKNOWN fallback. Every field
   below cites a phase brief's own example verbatim — nothing here is
   invented taxonomy. "Extensible Problem Types" means exactly this: a data
   addition, zero changes to problem-parser.js's or problem-router.js's own
   control flow. ──────────────────────────────────────────────────────── */
function bootstrap() {
  registerProblemCategory('facility', 'Facility', 'engineering', [
    { field: 'asset', label: 'Aset', prompt: 'Aset atau peralatan apa yang bermasalah?', optimizable: false },
    { field: 'location', label: 'Lokasi', prompt: 'Di mana lokasinya?', optimizable: false },
    { field: 'symptom', label: 'Gejala', prompt: 'Apa gejala atau kerusakannya?', optimizable: false },
    { field: 'urgency', label: 'Urgensi', prompt: 'Seberapa mendesak perbaikan ini?', optimizable: true },
    { field: 'budgetImpact', label: 'Dampak Anggaran', prompt: 'Apakah ada estimasi biaya perbaikan?', optimizable: true },
    { field: 'safetyImpact', label: 'Dampak Keselamatan', prompt: 'Apakah ini berdampak pada keselamatan?', optimizable: true },
  ]);
  registerProblemCategory('business_trip', 'Business Trip', 'nor', [
    { field: 'destination', label: 'Tujuan', prompt: 'Tujuan perjalanan/kegiatan ke mana?', optimizable: false },
    { field: 'participants', label: 'Peserta', prompt: 'Siapa saja yang berangkat?', optimizable: true },
    { field: 'schedule', label: 'Jadwal', prompt: 'Kapan jadwal keberangkatan dan kembali?', optimizable: false },
    { field: 'budget', label: 'Anggaran', prompt: 'Berapa estimasi anggaran yang dibutuhkan?', optimizable: false },
  ]);
  // Phase 10.5, Part 7 Scenario 3 ("Mau beli meja"). domainType 'request' —
  // the registered-but-previously-unused generic administrative domain
  // (domain-type-registry.js) — chosen because a procurement is neither a
  // Petty Cash realization nor a NOR-shaped travel request; it is its own
  // administrative request, exactly what 'request' already names.
  registerProblemCategory('procurement', 'Procurement', 'request', [
    { field: 'item', label: 'Barang', prompt: 'Barang atau jasa apa yang ingin dibeli?', optimizable: false },
    { field: 'quantity', label: 'Jumlah', prompt: 'Berapa jumlah yang dibutuhkan?', optimizable: true },
    { field: 'purpose', label: 'Tujuan Penggunaan', prompt: 'Untuk keperluan apa?', optimizable: true },
    { field: 'budget', label: 'Anggaran', prompt: 'Berapa estimasi anggarannya?', optimizable: false },
  ]);
  // Phase 10.5, Part 7 Scenario 5 ("Atlet kehilangan ID Card").
  registerProblemCategory('administration', 'Administration', 'request', [
    { field: 'item', label: 'Perihal', prompt: 'Apa yang hilang atau perlu diurus?', optimizable: false },
    { field: 'affectedPerson', label: 'Pihak Terkait', prompt: 'Siapa yang mengalami ini?', optimizable: true },
    { field: 'urgency', label: 'Urgensi', prompt: 'Seberapa mendesak ini perlu diselesaikan?', optimizable: true },
  ]);
  // Part 2's own named routes ("Knowledge Search -> Search", "Document
  // Upload -> Knowledge Acquisition") — both route directly to an EXISTING
  // real UI action (the Home search bar; the Archive Center navigation),
  // never a Conversation, so neither needs a rich fieldSchema.
  registerProblemCategory('knowledge_search', 'Knowledge Search', 'nor', [
    { field: 'query', label: 'Kueri', prompt: 'Apa yang ingin Anda cari?', optimizable: false },
  ]);
  registerProblemCategory('document_upload', 'Document Upload', 'nor', []);
  registerProblemCategory('unknown', 'Unknown', 'nor', []);
}

bootstrap();
