/* ============================================================
   DECISION-REPLAY-DRAWER.JS — Decision Replay & Explainable AI (v1.17.5)

   The Apple-style side drawer that makes a Dispatch Intelligence recommendation
   fully explainable: it replays the decision step by step and exposes why each
   driver/vehicle was chosen, why the others were not, the transparent score
   composition, the policy evaluation, the candidate ranking, the admin override
   analysis, and the lifecycle timeline.

   It RENDERS ONLY. Every value comes from the decision-replay-service model
   (which itself only re-expresses what the engines already produced). The drawer
   recomputes nothing.

   DESIGN: built entirely on the platform CSS custom properties (var(--surface),
   --border, --text, --muted, --ok/--warn/--info/--danger pairs) so it adapts to
   dark mode automatically (no hard-coded #fff — the dark-mode --white trap).
   Scoped `.drx-*` class names; a glass overlay + right-anchored sheet that
   slides in (translateX) with a spring-like ease. Everything is written with
   textContent (never innerHTML), so a driver/vehicle name can never inject
   markup. Fully responsive (full-width sheet on mobile). ESC / overlay click /
   Close button dismiss it.
   ============================================================ */

'use strict';

import { buildDecisionReplay } from '../services/decision-replay-service.js';

const STYLE_ID = 'drx-drawer-styles';
const ROOT_ID = 'decisionReplayDrawer';

const CSS = `
.drx-overlay{position:fixed;inset:0;z-index:6000;display:flex;justify-content:flex-end;
  background:rgba(15,17,21,.42);opacity:0;transition:opacity .28s ease;
  -webkit-backdrop-filter:saturate(140%) blur(3px);backdrop-filter:saturate(140%) blur(3px);}
.drx-overlay[data-open="true"]{opacity:1;}
.drx-sheet{position:relative;width:min(560px,100%);height:100%;display:flex;flex-direction:column;
  background:var(--surface);border-left:1px solid var(--border);box-shadow:-24px 0 60px rgba(0,0,0,.28);
  transform:translateX(100%);transition:transform .32s cubic-bezier(.32,.72,0,1);color:var(--text);
  font-family:var(--font-sans, inherit);min-width:0;}
.drx-overlay[data-open="true"] .drx-sheet{transform:translateX(0);}

/* Header */
.drx-head{flex:0 0 auto;display:flex;flex-direction:column;gap:.85rem;padding:1.05rem 1.15rem .95rem;
  border-bottom:1px solid var(--border);background:linear-gradient(180deg,var(--info-bg),var(--surface));}
.drx-head__top{display:flex;align-items:center;gap:.5rem;}
.drx-head__brand{display:flex;align-items:center;gap:.45rem;font-size:.78rem;font-weight:800;letter-spacing:.01em;}
.drx-head__tag{margin-left:auto;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:.14rem .55rem;}
.drx-x{appearance:none;border:1px solid var(--border);background:var(--surface);color:var(--text);
  width:2rem;height:2rem;border-radius:999px;cursor:pointer;font-size:1.1rem;line-height:1;display:flex;
  align-items:center;justify-content:center;transition:background .15s ease;}
.drx-x:hover{background:var(--surface-2);}
.drx-rec{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.drx-rec__pair{display:flex;flex-direction:column;gap:.4rem;min-width:0;flex:1 1 12rem;}
.drx-rec__row{display:flex;align-items:baseline;gap:.5rem;min-width:0;}
.drx-rec__k{font-size:.64rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;flex:0 0 4.4rem;}
.drx-rec__v{font-weight:700;font-size:1.02rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
.drx-rec__metrics{display:flex;gap:1.1rem;flex:0 0 auto;}
.drx-metric{display:flex;flex-direction:column;align-items:flex-end;gap:.12rem;line-height:1.1;}
.drx-metric__num{font-size:1.7rem;font-weight:800;letter-spacing:-.01em;}
.drx-metric__lbl{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.drx-stars{font-size:1rem;color:var(--warn);letter-spacing:.04em;}
.drx-conf{font-size:.72rem;font-weight:700;}

/* Body (scroll) */
.drx-body{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:1rem 1.15rem 1.4rem;
  display:flex;flex-direction:column;gap:.85rem;-webkit-overflow-scrolling:touch;}
.drx-sec{border:1px solid var(--border);border-radius:14px;background:var(--surface);
  padding:.8rem .9rem;display:flex;flex-direction:column;gap:.6rem;}
.drx-sec__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;
  color:var(--muted);display:flex;align-items:center;gap:.4rem;}
.drx-sec__title b{color:var(--text);font-weight:800;}

/* Replay stages / lifecycle timeline (shared vertical rail) */
.drx-tl{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none;}
.drx-tl li{display:flex;gap:.7rem;position:relative;padding:.12rem 0 .7rem;}
.drx-tl li:last-child{padding-bottom:0;}
.drx-tl__dot{flex:0 0 .72rem;width:.72rem;height:.72rem;border-radius:50%;margin-top:.18rem;
  background:var(--ok);border:2px solid var(--surface);box-shadow:0 0 0 1px var(--ok);}
.drx-tl li[data-done="false"] .drx-tl__dot{background:var(--surface);box-shadow:0 0 0 1px var(--border);}
.drx-tl li:not(:last-child) .drx-tl__dot::after{content:"";position:absolute;left:.32rem;top:1rem;
  width:1px;height:calc(100% - .92rem);background:var(--border);}
.drx-tl__body{display:flex;flex-direction:column;gap:.08rem;min-width:0;}
.drx-tl__label{font-size:.86rem;font-weight:600;color:var(--text);}
.drx-tl li[data-done="false"] .drx-tl__label{color:var(--muted);font-weight:500;}
.drx-tl__detail{font-size:.74rem;color:var(--muted);}
.drx-tl__time{font-size:.72rem;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;
  flex:0 0 2.7rem;text-align:right;}

/* Checklist (why) */
.drx-why{display:flex;flex-direction:column;gap:.32rem;margin:0;padding:0;list-style:none;}
.drx-why li{display:flex;align-items:center;gap:.5rem;font-size:.85rem;}
.drx-why__ic{flex:0 0 1.1rem;text-align:center;font-weight:800;}
.drx-why li[data-ok="true"] .drx-why__ic{color:var(--ok);}
.drx-why li[data-ok="false"] .drx-why__ic{color:var(--danger);}
.drx-why li[data-ok="false"]{color:var(--muted);}
.drx-chips{display:flex;flex-wrap:wrap;gap:.3rem;}
.drx-chip{font-size:.68rem;font-weight:600;color:var(--muted);background:var(--surface-2);
  border:1px solid var(--border);border-radius:999px;padding:.16rem .5rem;}

/* Score breakdown */
.drx-bd{display:flex;flex-direction:column;gap:.45rem;}
.drx-bd__row{display:flex;align-items:center;gap:.6rem;}
.drx-bd__k{flex:0 0 5.4rem;font-size:.8rem;font-weight:600;}
.drx-bd__bar{flex:1 1 auto;height:.5rem;border-radius:999px;background:var(--surface-2);
  border:1px solid var(--border);overflow:hidden;min-width:2rem;}
.drx-bd__fill{height:100%;background:var(--info);border-radius:999px;}
.drx-bd__sub{flex:0 0 auto;font-size:.66rem;color:var(--muted);}
.drx-bd__pts{flex:0 0 2.3rem;text-align:right;font-size:.84rem;font-weight:700;}
.drx-bd__total{display:flex;align-items:center;justify-content:space-between;
  border-top:1px dashed var(--border);padding-top:.45rem;margin-top:.1rem;font-weight:800;font-size:.86rem;}
.drx-bd__total span:last-child{font-size:1.05rem;}

/* Comparison table (why not others) */
.drx-cmp{display:flex;flex-direction:column;gap:.55rem;}
.drx-cmp__cand{border:1px solid var(--border);border-radius:11px;padding:.55rem .65rem;
  display:flex;flex-direction:column;gap:.4rem;background:var(--surface-2);}
.drx-cmp__head{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;}
.drx-cmp__name{font-size:.86rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
.drx-cmp__vs{font-size:.7rem;color:var(--muted);font-weight:700;}
.drx-cmp__final{font-size:.78rem;font-weight:800;}
.drx-cmp__final[data-pos="true"]{color:var(--ok);}
.drx-cmp__grid{display:flex;flex-wrap:wrap;gap:.3rem;}
.drx-delta{font-size:.68rem;font-weight:600;border:1px solid var(--border);border-radius:999px;
  padding:.14rem .5rem;background:var(--surface);color:var(--muted);}
.drx-delta[data-sign="pos"]{color:var(--ok);border-color:var(--ok);}
.drx-delta[data-sign="neg"]{color:var(--danger);border-color:var(--danger);}

/* Policy */
.drx-kv{display:grid;grid-template-columns:auto 1fr;gap:.35rem .8rem;font-size:.82rem;}
.drx-kv__k{color:var(--muted);}
.drx-kv__v{font-weight:600;text-align:right;}
.drx-pill{display:inline-block;font-size:.66rem;font-weight:700;border-radius:999px;padding:.12rem .5rem;
  border:1px solid var(--border);background:var(--surface-2);color:var(--muted);}
.drx-pill[data-tone="ok"]{color:var(--ok);border-color:var(--ok);background:var(--ok-bg, var(--surface-2));}
.drx-pill[data-tone="warn"]{color:var(--warn);border-color:var(--warn);background:var(--warn-bg, var(--surface-2));}

/* Ranking */
.drx-rank{display:flex;flex-direction:column;gap:.4rem;}
.drx-rank__item{border:1px solid var(--border);border-radius:11px;overflow:hidden;background:var(--surface);}
.drx-rank__item[data-rec="true"]{border-color:var(--info);}
.drx-rank__btn{width:100%;display:flex;align-items:center;gap:.6rem;cursor:pointer;text-align:left;
  background:transparent;border:0;color:var(--text);padding:.55rem .65rem;font:inherit;}
.drx-rank__btn:hover{background:var(--surface-2);}
.drx-rank__no{flex:0 0 1.5rem;font-size:.86rem;font-weight:800;color:var(--muted);}
.drx-rank__name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.86rem;font-weight:600;}
.drx-rank__badge{flex:0 0 auto;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;
  color:var(--on-accent);background:var(--accent);border-radius:999px;padding:.1rem .45rem;}
.drx-rank__badge[data-invalid="true"]{color:var(--danger);background:transparent;border:1px solid var(--danger);}
.drx-rank__score{flex:0 0 auto;font-size:.92rem;font-weight:800;font-variant-numeric:tabular-nums;}
.drx-rank__chev{flex:0 0 auto;color:var(--muted);transition:transform .2s ease;font-size:.8rem;}
.drx-rank__item[data-expanded="true"] .drx-rank__chev{transform:rotate(90deg);}
.drx-rank__detail{display:none;padding:.1rem .65rem .6rem;border-top:1px dashed var(--border);}
.drx-rank__item[data-expanded="true"] .drx-rank__detail{display:block;}
.drx-rank__detrow{display:flex;justify-content:space-between;font-size:.78rem;padding:.18rem 0;}
.drx-rank__detrow span:first-child{color:var(--muted);}

/* Empty + footer */
.drx-empty{font-size:.86rem;color:var(--muted);}
.drx-foot{flex:0 0 auto;display:flex;gap:.6rem;padding:.85rem 1.15rem;border-top:1px solid var(--border);
  background:var(--surface);}
.drx-btn{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;cursor:pointer;
  font-size:.86rem;font-weight:700;border-radius:11px;padding:.62rem .9rem;transition:filter .15s ease;}
.drx-btn--ghost{background:var(--surface);border:1px solid var(--border);color:var(--text);}
.drx-btn--ghost:hover{background:var(--surface-2);}
.drx-btn--accent{background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);}
.drx-btn--accent:hover{filter:brightness(1.06);}
.drx-export-menu{position:relative;flex:1 1 auto;display:flex;}
.drx-export-pop{position:absolute;bottom:calc(100% + .4rem);right:0;left:0;display:none;flex-direction:column;
  gap:.25rem;background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:.35rem;
  box-shadow:0 10px 30px rgba(0,0,0,.22);}
.drx-export-menu[data-open="true"] .drx-export-pop{display:flex;}
.drx-export-pop button{appearance:none;border:0;background:transparent;color:var(--text);cursor:pointer;
  font:inherit;font-size:.82rem;font-weight:600;text-align:left;padding:.45rem .55rem;border-radius:8px;}
.drx-export-pop button:hover{background:var(--surface-2);}

@media (max-width:560px){
  .drx-sheet{width:100%;border-left:0;}
  .drx-rec__metrics{width:100%;justify-content:space-between;}
}
`;

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function section(title, titleEmphasis) {
  const sec = el('div', 'drx-sec');
  const t = el('div', 'drx-sec__title');
  t.append(el('span', null, title));
  if (titleEmphasis) t.append(el('b', null, titleEmphasis));
  sec.append(t);
  return sec;
}

/* ── Section renderers (all read-only from the model) ─────────────────── */

function renderTimeline(events, withTime) {
  const ul = el('ul', 'drx-tl');
  for (const ev of events) {
    const li = el('li');
    li.setAttribute('data-done', ev.done ? 'true' : 'false');
    li.setAttribute('data-tl', ev.key);
    li.append(el('span', 'drx-tl__dot'));
    const body = el('div', 'drx-tl__body');
    body.append(el('span', 'drx-tl__label', ev.label));
    if (ev.detail) body.append(el('span', 'drx-tl__detail', ev.detail));
    li.append(body);
    if (withTime) li.append(el('span', 'drx-tl__time', ev.time || '—'));
    ul.append(li);
  }
  return ul;
}

function renderWhy(why, prefix) {
  if (!why) return el('div', 'drx-empty', 'Detail tidak tersedia.');
  const wrap = el('div', null);
  const ul = el('ul', 'drx-why');
  for (const r of why.reasons) {
    const li = el('li');
    li.setAttribute('data-ok', r.ok ? 'true' : 'false');
    li.append(el('span', 'drx-why__ic', r.ok ? '✓' : '✕'), el('span', null, r.text));
    ul.append(li);
  }
  wrap.append(ul);
  const chips = el('div', 'drx-chips');
  chips.style.marginTop = '.5rem';
  for (const s of why.subScores) chips.append(el('span', 'drx-chip', `${s.label} ${s.score}`));
  wrap.append(chips);
  return wrap;
}

function renderScoreBreakdown(bd) {
  if (!bd) return el('div', 'drx-empty', 'Komposisi skor tidak tersedia.');
  const wrap = el('div', 'drx-bd');
  for (const row of bd.rows) {
    const r = el('div', 'drx-bd__row');
    r.append(el('span', 'drx-bd__k', row.label));
    const bar = el('div', 'drx-bd__bar');
    const fill = el('div', 'drx-bd__fill');
    fill.style.width = `${Math.max(0, Math.min(100, row.score))}%`;
    bar.append(fill);
    r.append(bar);
    r.append(el('span', 'drx-bd__sub', `${row.score} · bobot ${row.weightPct}%`));
    r.append(el('span', 'drx-bd__pts', `+${row.points}`));
    wrap.append(r);
  }
  const total = el('div', 'drx-bd__total');
  total.append(el('span', null, 'Total Skor Dispatch'), el('span', null, `${bd.total}`));
  wrap.append(total);
  return wrap;
}

function renderWhyNot(block, vsLabel) {
  if (!block || !block.recommended || !block.others.length) {
    return el('div', 'drx-empty', 'Tidak ada kandidat pembanding lain.');
  }
  const wrap = el('div', 'drx-cmp');
  for (const o of block.others) {
    const card = el('div', 'drx-cmp__cand');
    const head = el('div', 'drx-cmp__head');
    const name = el('div', 'drx-cmp__name');
    name.append(document.createTextNode(`${block.recommended.name} `));
    const vs = el('span', 'drx-cmp__vs', `vs ${o.name}`);
    name.append(vs);
    head.append(name);
    const fin = el('span', 'drx-cmp__final', `${o.finalDifference >= 0 ? '+' : ''}${o.finalDifference}`);
    fin.setAttribute('data-pos', o.finalDifference >= 0 ? 'true' : 'false');
    head.append(fin);
    card.append(head);
    const grid = el('div', 'drx-cmp__grid');
    for (const d of o.differences) {
      const sign = d.delta > 0 ? 'pos' : (d.delta < 0 ? 'neg' : 'zero');
      const chip = el('span', 'drx-delta', `${d.label} ${d.delta >= 0 ? '+' : ''}${d.delta}`);
      chip.setAttribute('data-sign', sign);
      grid.append(chip);
    }
    card.append(grid);
    wrap.append(card);
  }
  return wrap;
}

function kvRow(grid, k, v) {
  grid.append(el('span', 'drx-kv__k', k), el('span', 'drx-kv__v', v));
}

function renderPolicy(policy) {
  if (!policy || !policy.present) {
    return el('div', 'drx-empty', 'Tidak ada kebijakan khusus untuk permintaan ini.');
  }
  const wrap = el('div', null);
  const grid = el('div', 'drx-kv');
  kvRow(grid, 'Mode Medis', policy.medicalMode ? 'Ya' : 'Tidak');
  kvRow(grid, 'Driver Diperlukan', policy.driverRequired ? 'Ya' : 'Tidak (Tanpa Driver)');
  kvRow(grid, 'Driver Eligible', String(policy.driverEligible));
  kvRow(grid, 'Kendaraan Eligible', String(policy.vehicleEligible));
  wrap.append(grid);

  if (policy.filteredReasons.length) {
    const chips = el('div', 'drx-chips');
    chips.style.marginTop = '.6rem';
    for (const r of policy.filteredReasons) {
      chips.append(el('span', 'drx-chip', `${r.label} ✕${r.count}`));
    }
    wrap.append(chips);
  }
  return wrap;
}

function renderOverride(ov) {
  const wrap = el('div', null);
  if (!ov.overridden) {
    const grid = el('div', 'drx-kv');
    kvRow(grid, 'Keputusan', 'Diterima sesuai rekomendasi');
    if (ov.decided && ov.approvedBy) kvRow(grid, 'Oleh', ov.approvedBy);
    wrap.append(grid);
    return wrap;
  }
  const grid = el('div', 'drx-kv');
  kvRow(grid, 'Rekomendasi AI', `${ov.recommended.driver || '—'} · ${ov.recommended.vehicle || '—'}`);
  kvRow(grid, 'Pilihan Admin', `${ov.selected.driver || '—'} · ${ov.selected.vehicle || '—'}`);
  kvRow(grid, 'Jenis', ov.severityLabel);
  if (ov.scoreDifference) kvRow(grid, 'Selisih Skor', `${ov.scoreDifference > 0 ? '+' : ''}${ov.scoreDifference}`);
  wrap.append(grid);

  const sevRow = el('div', null);
  sevRow.style.marginTop = '.55rem';
  const sevPill = el('span', 'drx-pill', `Severity: ${ov.severityLabel}`);
  sevPill.setAttribute('data-tone', ov.severity === 'minor' || ov.severity === 'none' ? 'ok' : 'warn');
  sevRow.append(sevPill);
  wrap.append(sevRow);

  if (ov.reason) {
    const r = el('div', 'drx-tl__detail', `Alasan: ${ov.reason}`);
    r.style.marginTop = '.5rem';
    wrap.append(r);
  }
  if (ov.timestamp) {
    const t = new Date(ov.timestamp);
    if (!Number.isNaN(t.getTime())) {
      const stamp = el('div', 'drx-tl__detail', `Dicatat: ${t.toLocaleString('id-ID')}`);
      wrap.append(stamp);
    }
  }
  return wrap;
}

function renderRanking(rows) {
  if (!rows || !rows.length) return el('div', 'drx-empty', 'Tidak ada kandidat untuk diranking.');
  const wrap = el('div', 'drx-rank');
  for (const r of rows) {
    const item = el('div', 'drx-rank__item');
    item.setAttribute('data-rec', r.recommended ? 'true' : 'false');
    item.setAttribute('data-expanded', 'false');
    const btn = el('button', 'drx-rank__btn');
    btn.type = 'button';
    btn.append(el('span', 'drx-rank__no', `#${r.rank}`));
    btn.append(el('span', 'drx-rank__name', `${r.driverName || '—'} · ${r.vehicleName || '—'}`));
    if (r.recommended) btn.append(el('span', 'drx-rank__badge', 'Rekomendasi'));
    else if (!r.valid) { const b = el('span', 'drx-rank__badge', 'Tidak Valid'); b.setAttribute('data-invalid', 'true'); btn.append(b); }
    btn.append(el('span', 'drx-rank__score', `${r.score}`));
    btn.append(el('span', 'drx-rank__chev', '›'));
    btn.addEventListener('click', () => {
      const open = item.getAttribute('data-expanded') === 'true';
      item.setAttribute('data-expanded', open ? 'false' : 'true');
    });
    item.append(btn);

    const detail = el('div', 'drx-rank__detail');
    const mk = (k, v) => { const row = el('div', 'drx-rank__detrow'); row.append(el('span', null, k), el('span', null, v)); return row; };
    detail.append(mk('Skor Driver', String(r.driverScore)));
    detail.append(mk('Skor Kendaraan', String(r.vehicleScore)));
    detail.append(mk('Skor Dispatch', String(r.score)));
    detail.append(mk('Status', r.valid ? 'Valid' : `Tidak valid (${r.reasons.join(', ') || '—'})`));
    item.append(detail);
    wrap.append(item);
  }
  return wrap;
}

/* ── Drawer assembly + lifecycle ──────────────────────────────────────── */

let _keyHandler = null;

function buildSheet(model, opts) {
  const sheet = el('aside', 'drx-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Decision Replay');

  // Header
  const head = el('div', 'drx-head');
  const top = el('div', 'drx-head__top');
  const brand = el('div', 'drx-head__brand');
  brand.append(el('span', null, '🧠'), el('span', null, 'Decision Replay'));
  top.append(brand);
  top.append(el('span', 'drx-head__tag', 'Explainable AI'));
  const x = el('button', 'drx-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Tutup');
  x.id = 'drxClose';
  top.append(x);
  head.append(top);

  const rec = el('div', 'drx-rec');
  const pair = el('div', 'drx-rec__pair');
  const dRow = el('div', 'drx-rec__row');
  dRow.append(el('span', 'drx-rec__k', 'Driver'), el('span', 'drx-rec__v', model.recommendation.driver || '—'));
  const vRow = el('div', 'drx-rec__row');
  vRow.append(el('span', 'drx-rec__k', 'Kendaraan'), el('span', 'drx-rec__v', model.recommendation.vehicle || '—'));
  pair.append(dRow, vRow);
  const metrics = el('div', 'drx-rec__metrics');
  const sM = el('div', 'drx-metric');
  sM.append(el('span', 'drx-metric__num', `${model.recommendation.dispatchScore}`), el('span', 'drx-metric__lbl', 'Skor / 100'));
  const cM = el('div', 'drx-metric');
  cM.append(el('span', 'drx-stars', model.confidence.glyph), el('span', 'drx-conf', model.confidence.label), el('span', 'drx-metric__lbl', 'Confidence'));
  metrics.append(sM, cM);
  rec.append(pair, metrics);
  head.append(rec);
  sheet.append(head);

  // Body
  const body = el('div', 'drx-body');
  if (!model.hasRecommendation) {
    body.append(el('div', 'drx-empty',
      'Tidak ada rekomendasi otomatis untuk request ini — keputusan dibuat manual oleh admin.'));
  }

  // Feature 1 — Decision Replay
  const s1 = section('Decision Replay');
  s1.append(renderTimeline(model.replayStages, false));
  body.append(s1);

  if (model.hasRecommendation) {
    // Feature 2 — Why Driver
    const s2 = section('Mengapa Driver Ini?', model.whyDriver ? `${model.whyDriver.name} · ${model.whyDriver.score}` : '');
    s2.append(renderWhy(model.whyDriver, 'D'));
    body.append(s2);

    // Feature 3 — Why Not Other Drivers
    const s3 = section('Mengapa Bukan Driver Lain?');
    s3.append(renderWhyNot(model.whyNotDrivers));
    body.append(s3);

    // Feature 4 — Why Vehicle + comparison
    const s4 = section('Mengapa Kendaraan Ini?', model.whyVehicle ? `${model.whyVehicle.name} · ${model.whyVehicle.score}` : '');
    s4.append(renderWhy(model.whyVehicle, 'K'));
    body.append(s4);
    const s4b = section('Mengapa Bukan Kendaraan Lain?');
    s4b.append(renderWhyNot(model.whyNotVehicles));
    body.append(s4b);

    // Feature 5 — Score Breakdown
    const s5 = section('Komposisi Skor');
    s5.append(renderScoreBreakdown(model.scoreBreakdown));
    if (model.scoreBreakdown) {
      const chips = el('div', 'drx-chips');
      chips.style.marginTop = '.55rem';
      model.scoreBreakdown.subScores.driver.forEach((s) => chips.append(el('span', 'drx-chip', `D·${s.label} ${s.score}`)));
      model.scoreBreakdown.subScores.vehicle.forEach((s) => chips.append(el('span', 'drx-chip', `K·${s.label} ${s.score}`)));
      s5.append(chips);
    }
    body.append(s5);
  }

  // Feature 6 — Policy Evaluation
  const s6 = section('Evaluasi Policy');
  s6.append(renderPolicy(model.policy));
  body.append(s6);

  // Feature 9 — Candidate Ranking
  const s9 = section('Peringkat Kandidat');
  s9.append(renderRanking(model.ranking));
  body.append(s9);

  // Feature 8 — Override Analysis (only when a decision/override exists)
  if (model.override && (model.override.decided || model.override.overridden)) {
    const s8 = section('Analisis Override Admin');
    s8.append(renderOverride(model.override));
    body.append(s8);
  }

  // Feature 11 — Lifecycle Timeline
  const s11 = section('Linimasa');
  s11.append(renderTimeline(model.timeline, true));
  body.append(s11);

  sheet.append(body);

  // Footer — Close + Export (Feature 12)
  const foot = el('div', 'drx-foot');
  const closeBtn = el('button', 'drx-btn drx-btn--ghost', 'Tutup');
  closeBtn.type = 'button';
  closeBtn.id = 'drxCloseBtn';
  foot.append(closeBtn);

  const exportMenu = el('div', 'drx-export-menu');
  exportMenu.setAttribute('data-open', 'false');
  const exportBtn = el('button', 'drx-btn drx-btn--accent', 'Export ▾');
  exportBtn.type = 'button';
  exportBtn.id = 'drxExportBtn';
  const pop = el('div', 'drx-export-pop');
  const pdfBtn = el('button', null, 'Export PDF');
  pdfBtn.type = 'button'; pdfBtn.id = 'drxExportPdf';
  const xlsBtn = el('button', null, 'Export Excel');
  xlsBtn.type = 'button'; xlsBtn.id = 'drxExportExcel';
  pop.append(pdfBtn, xlsBtn);
  exportMenu.append(exportBtn, pop);
  foot.append(exportMenu);
  sheet.append(foot);

  // Wire interactions
  const close = () => closeDecisionReplayDrawer();
  x.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  exportBtn.addEventListener('click', () => {
    exportMenu.setAttribute('data-open', exportMenu.getAttribute('data-open') === 'true' ? 'false' : 'true');
  });
  const runExport = (fmt) => {
    exportMenu.setAttribute('data-open', 'false');
    if (typeof opts.onExport === 'function') opts.onExport(fmt, model);
  };
  pdfBtn.addEventListener('click', () => runExport('pdf'));
  xlsBtn.addEventListener('click', () => runExport('excel'));

  return sheet;
}

/**
 * Open (or replace) the Decision Replay drawer for a replay model.
 * @param {Object} model  buildDecisionReplay() result
 * @param {Object} [opts]
 * @param {(format:'pdf'|'excel', model:Object)=>void} [opts.onExport]  export handler
 * @returns {HTMLElement} the drawer root
 */
export function openDecisionReplayDrawer(model, opts = {}) {
  ensureStyles();
  closeDecisionReplayDrawer();

  const overlay = el('div', 'drx-overlay');
  overlay.id = ROOT_ID;
  overlay.setAttribute('data-open', 'false');
  const sheet = buildSheet(model, opts);
  overlay.append(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDecisionReplayDrawer(); });
  document.body.appendChild(overlay);

  _keyHandler = (e) => { if (e.key === 'Escape') closeDecisionReplayDrawer(); };
  document.addEventListener('keydown', _keyHandler);

  // Next frame → trigger the slide-in transition.
  requestAnimationFrame(() => { overlay.setAttribute('data-open', 'true'); });
  return overlay;
}

/**
 * Convenience: build the replay model from a recommendation package + render it.
 * @param {Object} input    see buildDecisionReplay
 * @param {Object} [opts]    drawer options (onExport) + { now } forwarded to the service
 */
export function openDecisionReplay(input = {}, opts = {}) {
  const model = buildDecisionReplay(input, { now: opts.now });
  return openDecisionReplayDrawer(model, opts);
}

/** Close + remove the drawer (with a short fade) and unbind the ESC handler. */
export function closeDecisionReplayDrawer() {
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  const existing = document.getElementById(ROOT_ID);
  if (!existing) return;
  existing.setAttribute('data-open', 'false');
  const remove = () => { if (existing.parentNode) existing.parentNode.removeChild(existing); };
  // Allow the slide-out transition to play, then remove.
  setTimeout(remove, 320);
}

export { buildDecisionReplay };
