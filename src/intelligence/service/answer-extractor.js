/* ============================================================
   ANSWER-EXTRACTOR.JS — Sarpras Intelligence (V2)

   PURPOSE: turn ONE free-text conversation message into the structured
   {field: value} facts it actually answers — so a user can reply with one
   fact, several facts, an earlier field, or a later field in a single
   sentence, and each is merged into the conversation's canonical state by
   SEMANTIC MEANING, never by "whichever question is first in the queue".

   Deterministic sibling of src/intake/problem-parser.js, held to the same
   discipline: small word-boundary regexes, honest omission (a field it
   cannot reliably read is simply ABSENT — never a fabricated value), no AI,
   no Firebase, no DOM. It never invents a value and never overwrites a
   KNOWN non-empty fact.

   CONTEXT-AWARE, NOT CONTEXT-BLIND:
     • ONE open field  → the reply answers that question. A typed field
       (budget/quantity/date) only accepts a reply that looks like its type
       ("Bendahara" is NOT a budget); an open-text field takes the reply.
     • SEVERAL open fields → pull every fact the message states, keyed by
       meaning: recipient clause, budget clause, purpose clause,
       quantity+unit, then the leftover noun phrase as the item.

   RESPONSIBILITY: extractAnswerFacts(text, { pendingFields, knownFacts,
   norType }) → { field: value }.

   DEPENDENCIES: none. PURE.
   ============================================================ */

'use strict';

const QTY_UNITS = [
  'unit', 'buah', 'pcs', 'pasang', 'set', 'lembar', 'rim', 'kotak', 'box', 'dus',
  'paket', 'pack', 'roll', 'rol', 'batang', 'keping', 'lusin', 'pak', 'karton',
];
const QTY_RE = new RegExp(`(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(${QTY_UNITS.join('|')})?\\b`, 'i');

/** budget clause: "anggaran/estimasi/biaya/dana/nilai … <number> [juta|ribu|…]"
 *  or a bare "Rp <number> …". */
const BUDGET_KW_RE = /\b(?:anggaran(?:nya)?|estimasi(?:\s+anggaran)?|biaya(?:nya)?|dana|budget|nilai)\b[\s:]*(?:sekitar\s+|kurang\s+lebih\s+|kira[\- ]?kira\s+|±\s*|kl\.?\s+)?(?:rp\.?\s*)?[\d][\d.,]*\s*(?:juta|jt|ribu|rb|miliar|milyar|rupiah|jutaan)?/i;
const BUDGET_RP_RE = /\brp\.?\s*[\d][\d.,]*\s*(?:juta|jt|ribu|rb|miliar|milyar|rupiah|jutaan)?/i;
const BUDGET_LEAD_RE = /^\s*(anggaran(?:nya)?|estimasi(?:\s+anggaran)?|biaya(?:nya)?|dana|budget|nilai)\b[\s:]*/i;

/** purpose clause: "untuk/guna/keperluan/tujuan(nya) …", stopping before a
 *  budget clause so "…untuk rapat, anggaran 10 juta" splits cleanly. */
const PURPOSE_RE = /\b(?:untuk|guna|keperluan|tujuan(?:nya)?(?:\s+(?:adalah|yaitu))?)\b[\s:]+(.+?)(?=\s*[,;]?\s*(?:anggaran|estimasi|biaya|dana|budget|rp\b)|\s*$)/i;
const PURPOSE_LEAD_RE = /^\s*(untuk|guna|keperluan|tujuan)/i;

/** recipient clause: "kepada/ditujukan ke(pada)/ke bagian/kpd/u.p. …", or
 *  a leading "Untuk <Capitalised name/role>" when recipient is being asked. */
const RECIPIENT_RE = /\b(?:kepada|ditujukan\s+ke(?:pada)?|ke\s+bagian|kpd\.?|u\.?p\.?)\b[\s:]+(.+?)\s*$/i;
const RECIPIENT_UNTUK_RE = /^\s*untuk\s+(.+)$/i;
const RECIPIENT_STRIP_LEAD_RE = /^\s*(?:kepada|ditujukan\s+ke(?:pada)?|ke\s+bagian|kpd\.?|u\.?p\.?|untuk)\s+/i;
const CLAUSE_SPLIT_RE = /\s*[,.;]\s*|\s+(?:anggaran|estimasi|biaya|dana|budget|dengan|untuk)\b/i;
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** leading words to strip before treating the remainder as an item phrase. */
const ITEM_LEAD_RE = /^\s*(?:beli|membeli|pembelian|pengadaan|buat(?:kan)?|bikin|susun|tolong|mohon|minta(?:kan)?|pengajuan|permohonan|saya|kami|kita|ingin|mau|pengen|perlu|butuh|nor|adalah|yaitu|itu|ada(?:lah)?|:)\s*/i;

/** fields whose answer must "look like" their type before a bare reply is
 *  accepted for them. */
const TYPED_GUARDS = Object.freeze({
  budget: /\d/,
  quantity: /\d/,
  departureDate: /\d/,
  returnDate: /\d/,
  tanggal: /\d/,
});

const isKnown = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const clean = (s) => String(s == null ? '' : s).trim().replace(/[.,;\s]+$/, '').trim();
const wordCount = (s) => clean(s).split(/\s+/).filter(Boolean).length;

function parseQuantity(text) {
  const m = String(text).match(QTY_RE);
  if (!m) return {};
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return {};
  return { quantity: n, unit: m[2] ? m[2].toLowerCase() : 'unit' };
}

function cleanBudget(text) {
  return clean(String(text).replace(BUDGET_LEAD_RE, ''));
}

/**
 * @param {string} text                       one raw user message
 * @param {Object} [ctx]
 * @param {string[]} [ctx.pendingFields]       fields the conversation is asking for now
 * @param {Object}   [ctx.knownFacts]          already-satisfied facts (never overwritten)
 * @param {string|null} [ctx.norType]          the NOR type, if known (hint only)
 * @returns {{[field:string]: (string|number)}}  facts this message answers
 */
export function extractAnswerFacts(text, { pendingFields = [], knownFacts = {}, norType = null } = {}) {
  void norType;
  const raw = String(text == null ? '' : text);
  const t = raw.trim();
  if (!t) return {};
  const known = knownFacts && typeof knownFacts === 'object' ? knownFacts : {};
  const pendingArr = Array.isArray(pendingFields) ? pendingFields : [];
  const pending = new Set(pendingArr);
  const openFields = pendingArr.filter((f) => !isKnown(known[f]));

  /* ── ONE open field: the reply answers that question ──────────────── */
  if (openFields.length === 1) {
    const f = openFields[0];
    if (f === 'quantity') return parseQuantity(t);
    if (f === 'budget') return TYPED_GUARDS.budget.test(t) ? { budget: cleanBudget(t) } : {};
    const guard = TYPED_GUARDS[f];
    if (guard && !guard.test(t)) return {};
    if (f === 'recipient') {
      const v = clean(t.replace(RECIPIENT_STRIP_LEAD_RE, ''));
      return v ? { recipient: v } : {};
    }
    return { [f]: clean(t) };
  }

  /* ── SEVERAL (or zero) open fields: pull every fact stated ────────── */
  const out = {};
  let residue = ` ${t} `;

  // budget clause (taken first, so its number is never mistaken for quantity)
  const bm = raw.match(BUDGET_KW_RE) || raw.match(BUDGET_RP_RE);
  if (bm && (pending.has('budget') || !isKnown(known.budget))) {
    out.budget = cleanBudget(bm[0]);
    residue = residue.replace(bm[0], ' ');
  }

  // recipient — an explicit "kepada/kpd/…" clause, else a leading
  // "Untuk <Capitalised name/role>" but only while recipient is being asked.
  const rc = raw.match(RECIPIENT_RE);
  if (rc && (pending.has('recipient') || !isKnown(known.recipient))) {
    out.recipient = clean(rc[1]);
    residue = residue.replace(rc[0], ' ');
  } else if (pending.has('recipient')) {
    const ru = raw.match(RECIPIENT_UNTUK_RE);
    if (ru) {
      const cand = clean(ru[1].split(CLAUSE_SPLIT_RE)[0]);
      if (cand && /^[A-Z]/.test(cand) && wordCount(cand) <= 4) {
        out.recipient = cand;
        residue = residue.replace(new RegExp(`untuk\\s+${escapeRegExp(cand)}`, 'i'), ' ');
      }
    }
  }

  // purpose — only when it is genuinely being asked (the "untuk/tujuan" cue
  // is ambiguous with a recipient clause, so needs an explicit open slot).
  if (pending.has('purpose') && out.recipient === undefined) {
    if (PURPOSE_LEAD_RE.test(t)) {
      out.purpose = clean(t);
      residue = ' ';
    } else {
      const pm = raw.match(PURPOSE_RE);
      if (pm) { out.purpose = clean(pm[1]); residue = residue.replace(pm[0], ' '); }
    }
  }

  // quantity (+ unit) from what's left
  if (!isKnown(known.quantity)) {
    const q = parseQuantity(residue);
    if (q.quantity !== undefined) {
      out.quantity = q.quantity;
      out.unit = q.unit;
      residue = residue.replace(QTY_RE, ' ');
    }
  }

  // item — the specific noun phrase left over, when item is open
  let rest = residue.replace(/\s{2,}/g, ' ').trim();
  let prev;
  do { prev = rest; rest = rest.replace(ITEM_LEAD_RE, '').trim(); } while (rest !== prev);
  rest = clean(rest);
  if (
    rest && out.item === undefined
    && pending.has('item') && !isKnown(known.item)
    && !/^\d/.test(rest) && wordCount(rest) >= 1 && wordCount(rest) <= 8
  ) {
    out.item = rest;
  }

  for (const k of Object.keys(out)) if (!isKnown(out[k])) delete out[k];
  return out;
}
