/* ============================================================
   NOR-DRAFT-ASSEMBLER.JS — Sarpras Intelligence (V2, Phase 1)

   PURPOSE: assemble a STRUCTURED NOR draft (PART 5) from resolved facts +
   (optionally) model-generated body prose + retrieved context. Every field
   carries a provenance tag. The draft is NEVER the official document:
     • it sets NO official number — numbering is a separate SUGGESTION
       block (PART 9, PART 12)
     • it never invents a recipient — recipient comes in already resolved
       ('known' or 'proposed'); a 'proposed' value is flagged as such
       (PART 8, PART 15)
     • it is handed to a human review/preview step downstream, unchanged
       (PART 1: "jangan menghapus human review")

   RESPONSIBILITY: assembleNorDraft({ norType, collectedFields, recipient,
   modelBody, numberingSuggestion, knowledgeRefs, memoryRefs }) →
   an IntelligenceDraft (intelligence-response-contract.js shape) +
   a parallel NumberAllocation-shaped `numbering` object.

   DEPENDENCIES: none. Pure.

   NON-GOALS: does not render (points at the EXISTING buildNorViewModel),
   does not call a model, does not persist, does not publish.
   ============================================================ */

'use strict';

const RENDERS_VIA = 'js/petty-cash/nor-document-engine.js#buildNorViewModel';

/** A short, deterministic subject line from the known facts — a starting
 *  point a human edits, never a locked value. */
function deriveSubject(norType, f) {
  if (norType === 'Pengadaan' && f.item) return `Pengadaan ${f.item}${f.quantity ? ` (${f.quantity})` : ''}`;
  if (norType === 'Perjalanan Dinas' && f.destination) return `Perjalanan Dinas ke ${f.destination}`;
  if (norType === 'Realisasi Petty Cash' && f.tanggal) return `Realisasi Petty Cash Pertanggal ${f.tanggal}`;
  return norType ? `NOR ${norType}` : 'NOR';
}

/** A plain templated body used when no model prose is available (disabled
 *  mode, or the model call failed). Deterministic, obviously a skeleton. */
function templateBody(norType, f) {
  const lines = [`Nota dinas ini dibuat untuk keperluan ${norType || 'organisasi'}.`];
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === '' || k === 'type' || k === 'recipient') continue;
    lines.push(`- ${k}: ${v}`);
  }
  lines.push('(Isi surat disusun otomatis dari data yang tersedia; mohon tinjau dan sunting sebelum diterbitkan.)');
  return lines.join('\n');
}

/**
 * @param {Object} args
 * @param {string|null} args.norType
 * @param {Object} args.collectedFields
 * @param {{ status:string, value:string|null, source:string }} args.recipient
 * @param {string|null} [args.modelBody]        - prose from the provider (enabled mode); null otherwise
 * @param {{ suggestedNumber:string, basis:string|null, confidence:number }|null} [args.numberingSuggestion]
 * @param {string[]} [args.knowledgeRefs]
 * @param {string[]} [args.memoryRefs]
 * @returns {{ draft: object, numbering: object }}
 */
export function assembleNorDraft({
  norType = null,
  collectedFields = {},
  recipient = { status: 'ask', value: null, source: 'none' },
  modelBody = null,
  numberingSuggestion = null,
  knowledgeRefs = [],
  memoryRefs = [],
}) {
  const f = collectedFields && typeof collectedFields === 'object' ? collectedFields : {};
  const subject = deriveSubject(norType, f);
  const bodySource = typeof modelBody === 'string' && modelBody.trim() ? 'model' : 'template';
  const body = bodySource === 'model' ? modelBody.trim() : templateBody(norType, f);
  const today = new Date().toISOString().slice(0, 10);

  const fieldProvenance = {
    subject: 'derived',
    body: bodySource,
    date: f.date ? 'human_answer' : 'system_derived',
    recipient: recipient.source,
  };
  for (const k of Object.keys(f)) if (k !== 'type') fieldProvenance[k] = 'human_answer';

  const draft = Object.freeze({
    documentType: 'nor',
    fields: Object.freeze({
      documentType: 'nor',
      norType: norType || null,
      subject,
      recipient: recipient.value || null,
      recipientStatus: recipient.status,     // 'known' | 'proposed' — a human confirms a 'proposed'
      date: f.date || today,
      body,
      // structured, per-occasion facts pass straight through for the editor
      details: Object.freeze({ ...Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'type' && k !== 'recipient')) }),
      attachments: Object.freeze([]),
      metadata: Object.freeze({
        generatedBy: 'sarpras-intelligence@phase1',
        bodySource,
        fieldProvenance: Object.freeze(fieldProvenance),
        knowledgeRefs: Object.freeze([...knowledgeRefs]),
        memoryRefs: Object.freeze([...memoryRefs]),
      }),
    }),
    rendersVia: RENDERS_VIA,
    summary: `Draf NOR ${norType || ''} — ${subject}. Nomor & penerbitan menunggu peninjauan manusia.`.trim(),
  });

  const numbering = Object.freeze({
    suggestedNumber: numberingSuggestion && typeof numberingSuggestion.suggestedNumber === 'string' ? numberingSuggestion.suggestedNumber : '',
    publishedNumber: null,                 // never set by the AI layer (PART 9)
    source: 'system_suggested',
    basis: numberingSuggestion ? (numberingSuggestion.basis || null) : null,
    confidence: numberingSuggestion && Number.isFinite(Number(numberingSuggestion.confidence)) ? Number(numberingSuggestion.confidence) : 0,
  });

  return { draft, numbering };
}
