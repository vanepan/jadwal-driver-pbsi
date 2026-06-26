/* ============================================================
   DRIVER-WELLNESS-DRAWER.JS — Driver Wellness Intelligence (v1.17.6)

   The Apple-style detail drawer for ONE driver's wellbeing. It mirrors the
   Decision Replay drawer pattern (glass overlay + right-anchored spring sheet,
   ESC / overlay / Close dismiss, full-width on mobile) and renders the driver's
   complete wellness object: Overview, Health Score, Fatigue, Burnout, Capacity,
   Recovery, Working Time, Timeline, and Recommendations — plus the expandable
   Explainability breakdown (every component's contribution sums to the score).

   It RENDERS ONLY from the driver-wellness-service model (which itself only
   interprets what the engines produced). It recomputes nothing.

   DESIGN: scoped `.dwd-*` on the platform CSS custom properties (dark-mode safe,
   no hard-coded #fff); textContent-only so a driver name can never inject markup.
   ============================================================ */

'use strict';

const STYLE_ID = 'dwd-drawer-styles';
const ROOT_ID = 'driverWellnessDrawer';

const CSS = `
.dwd-overlay{position:fixed;inset:0;z-index:6000;display:flex;justify-content:flex-end;
  background:rgba(15,17,21,.42);opacity:0;transition:opacity .28s ease;
  -webkit-backdrop-filter:saturate(140%) blur(3px);backdrop-filter:saturate(140%) blur(3px);}
.dwd-overlay[data-open="true"]{opacity:1;}
.dwd-sheet{position:relative;width:min(560px,100%);height:100%;display:flex;flex-direction:column;
  background:var(--surface);border-left:1px solid var(--border);box-shadow:-24px 0 60px rgba(0,0,0,.28);
  transform:translateX(100%);transition:transform .32s cubic-bezier(.32,.72,0,1);color:var(--text);
  font-family:var(--font-sans, inherit);min-width:0;}
.dwd-overlay[data-open="true"] .dwd-sheet{transform:translateX(0);}

.dwd-head{flex:0 0 auto;display:flex;flex-direction:column;gap:.85rem;padding:1.05rem 1.15rem .95rem;
  border-bottom:1px solid var(--border);background:linear-gradient(180deg,var(--info-bg),var(--surface));}
.dwd-head__top{display:flex;align-items:center;gap:.5rem;}
.dwd-head__brand{display:flex;align-items:center;gap:.45rem;font-size:.78rem;font-weight:800;letter-spacing:.01em;}
.dwd-head__tag{margin-left:auto;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:.14rem .55rem;}
.dwd-x{appearance:none;border:1px solid var(--border);background:var(--surface);color:var(--text);
  width:2rem;height:2rem;border-radius:999px;cursor:pointer;font-size:1.1rem;line-height:1;display:flex;
  align-items:center;justify-content:center;transition:background .15s ease;}
.dwd-x:hover{background:var(--surface-2);}
.dwd-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.dwd-hero__name{font-size:1.15rem;font-weight:800;letter-spacing:-.01em;min-width:0;overflow:hidden;text-overflow:ellipsis;}
.dwd-hero__metric{display:flex;flex-direction:column;align-items:flex-end;gap:.1rem;line-height:1.05;}
.dwd-hero__num{font-size:1.95rem;font-weight:800;letter-spacing:-.02em;}
.dwd-hero__lbl{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
.dwd-num--ok{color:var(--ok);} .dwd-num--info{color:var(--info);} .dwd-num--warn{color:var(--warn);} .dwd-num--danger{color:var(--danger);}

.dwd-body{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:1rem 1.15rem 1.4rem;
  display:flex;flex-direction:column;gap:.85rem;-webkit-overflow-scrolling:touch;}
.dwd-sec{border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:.8rem .9rem;display:flex;flex-direction:column;gap:.6rem;}
.dwd-sec__title{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);display:flex;align-items:center;gap:.4rem;}
.dwd-sec__title b{color:var(--text);}

.dwd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:.6rem;}
.dwd-stat{border:1px solid var(--border);border-radius:11px;background:var(--surface-2);padding:.6rem .7rem;display:flex;flex-direction:column;gap:.15rem;}
.dwd-stat__lbl{font-size:.6rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;}
.dwd-stat__num{font-size:1.35rem;font-weight:800;}
.dwd-stat__sub{font-size:.64rem;color:var(--muted);}

.dwd-risk{display:flex;align-items:center;gap:.6rem;}
.dwd-risk__bar{flex:1 1 auto;height:.55rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;}
.dwd-risk__fill{height:100%;border-radius:999px;}
.dwd-fill--ok{background:var(--ok);} .dwd-fill--info{background:var(--info);} .dwd-fill--warn{background:var(--warn);} .dwd-fill--danger{background:var(--danger);}
.dwd-pill{flex:0 0 auto;font-size:.66rem;font-weight:800;border-radius:999px;padding:.12rem .55rem;border:1px solid var(--border);}
.dwd-pill--ok{color:var(--ok);border-color:var(--ok);} .dwd-pill--info{color:var(--info);border-color:var(--info);}
.dwd-pill--warn{color:var(--warn);border-color:var(--warn);} .dwd-pill--danger{color:var(--danger);border-color:var(--danger);}

/* Explainability bars */
.dwd-bd{display:flex;flex-direction:column;gap:.4rem;}
.dwd-bd__row{display:flex;align-items:center;gap:.6rem;}
.dwd-bd__k{flex:0 0 8.5rem;font-size:.78rem;font-weight:600;}
.dwd-bd__bar{flex:1 1 auto;height:.5rem;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;min-width:2rem;}
.dwd-bd__fill{height:100%;border-radius:999px;background:var(--info);}
.dwd-bd__sub{flex:0 0 auto;font-size:.64rem;color:var(--muted);}
.dwd-bd__pts{flex:0 0 2.4rem;text-align:right;font-size:.82rem;font-weight:700;}
.dwd-bd__total{display:flex;align-items:center;justify-content:space-between;border-top:1px dashed var(--border);padding-top:.45rem;margin-top:.1rem;font-weight:800;font-size:.86rem;}
.dwd-bd__total span:last-child{font-size:1.05rem;}
.dwd-na{font-size:.66rem;color:var(--muted);font-weight:700;}

/* component chips */
.dwd-comps{display:flex;flex-direction:column;gap:.3rem;}
.dwd-comp{display:flex;align-items:center;justify-content:space-between;gap:.5rem;font-size:.8rem;}
.dwd-comp__k{color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dwd-comp__v{flex:0 0 auto;font-weight:700;}
.dwd-comp__v--ok{color:var(--ok);} .dwd-comp__v--info{color:var(--info);} .dwd-comp__v--warn{color:var(--warn);} .dwd-comp__v--danger{color:var(--danger);} .dwd-comp__v--muted{color:var(--muted);}

/* timeline */
.dwd-tl{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none;}
.dwd-tl li{display:flex;gap:.7rem;position:relative;padding:.12rem 0 .7rem;}
.dwd-tl li:last-child{padding-bottom:0;}
.dwd-tl__dot{flex:0 0 .72rem;width:.72rem;height:.72rem;border-radius:50%;margin-top:.18rem;background:var(--info);border:2px solid var(--surface);box-shadow:0 0 0 1px var(--border);}
.dwd-dot--ok{background:var(--ok);} .dwd-dot--info{background:var(--info);} .dwd-dot--warn{background:var(--warn);} .dwd-dot--danger{background:var(--danger);}
.dwd-tl li:not(:last-child) .dwd-tl__dot::after{content:"";position:absolute;left:.32rem;top:1rem;width:1px;height:calc(100% - .92rem);background:var(--border);}
.dwd-tl__body{display:flex;flex-direction:column;gap:.08rem;min-width:0;}
.dwd-tl__label{font-size:.85rem;font-weight:600;color:var(--text);}
.dwd-tl__detail{font-size:.72rem;color:var(--muted);}

/* recommendations */
.dwd-recs{display:flex;flex-direction:column;gap:.45rem;}
.dwd-rec{border:1px solid var(--border);border-radius:11px;padding:.55rem .65rem;background:var(--surface-2);display:flex;flex-direction:column;gap:.15rem;}
.dwd-rec__top{display:flex;align-items:center;gap:.5rem;}
.dwd-rec__sev{flex:0 0 auto;font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;border-radius:999px;padding:.1rem .45rem;border:1px solid var(--border);color:var(--muted);}
.dwd-sev--high{color:var(--danger);border-color:var(--danger);} .dwd-sev--medium{color:var(--warn);border-color:var(--warn);} .dwd-sev--low{color:var(--ok);border-color:var(--ok);}
.dwd-rec__label{font-size:.85rem;font-weight:700;}
.dwd-rec__detail{font-size:.72rem;color:var(--muted);}

.dwd-foot{flex:0 0 auto;display:flex;gap:.6rem;padding:.85rem 1.15rem;border-top:1px solid var(--border);background:var(--surface);}
.dwd-btn{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;cursor:pointer;font-size:.86rem;font-weight:700;border-radius:11px;padding:.62rem .9rem;transition:filter .15s ease;}
.dwd-btn--ghost{background:var(--surface);border:1px solid var(--border);color:var(--text);}
.dwd-btn--ghost:hover{background:var(--surface-2);}

@media (max-width:560px){ .dwd-sheet{width:100%;border-left:0;} }
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
function section(title, emphasis) {
  const sec = el('div', 'dwd-sec');
  const t = el('div', 'dwd-sec__title');
  t.append(el('span', null, title));
  if (emphasis) t.append(el('b', null, emphasis));
  sec.append(t);
  return sec;
}
function stat(label, value, sub) {
  const s = el('div', 'dwd-stat');
  s.append(el('div', 'dwd-stat__lbl', label), el('div', 'dwd-stat__num', value));
  if (sub) s.append(el('div', 'dwd-stat__sub', sub));
  return s;
}

/* ── risk meter (fatigue / burnout) ───────────────────────────────────────── */

function riskMeter(risk) {
  const wrap = el('div', 'dwd-risk');
  const bar = el('div', 'dwd-risk__bar');
  const fill = el('div', `dwd-risk__fill dwd-fill--${risk.tone}`);
  fill.style.width = `${Math.max(0, Math.min(100, risk.index))}%`;
  bar.append(fill);
  const pill = el('span', `dwd-pill dwd-pill--${risk.tone}`, risk.label);
  wrap.append(bar, pill);
  return wrap;
}

/* ── explainability (Feature 10) ──────────────────────────────────────────── */

const COMP_LABEL = {
  recovery: 'Waktu Pemulihan', workingHours: 'Jam Kerja', workloadBalance: 'Keseimbangan Beban',
  assignmentDensity: 'Kepadatan Tugas', consecutiveDays: 'Hari Beruntun',
  weekendFrequency: 'Frekuensi Akhir Pekan', nightFrequency: 'Frekuensi Malam',
};

function renderExplain(driver) {
  const wrap = el('div', 'dwd-bd');
  for (const c of driver.explainability) {
    const row = el('div', 'dwd-bd__row');
    row.append(el('span', 'dwd-bd__k', COMP_LABEL[c.key] || c.key));
    const bar = el('div', 'dwd-bd__bar');
    const fill = el('div', 'dwd-bd__fill');
    fill.style.width = `${Math.max(0, Math.min(100, c.score))}%`;
    bar.append(fill);
    row.append(bar);
    row.append(el('span', 'dwd-bd__sub', `${c.score} · bobot ${c.weightPct}%`));
    row.append(el('span', 'dwd-bd__pts', `+${c.points}`));
    wrap.append(row);
  }
  const total = el('div', 'dwd-bd__total');
  total.append(el('span', null, 'Skor Kesehatan'), el('span', null, String(driver.health.score)));
  wrap.append(total);
  return wrap;
}

function renderComponents(driver) {
  const wrap = el('div', 'dwd-comps');
  for (const c of driver.components) {
    const row = el('div', 'dwd-comp');
    row.append(el('span', 'dwd-comp__k', c.label));
    if (c.available) row.append(el('span', `dwd-comp__v dwd-comp__v--${c.tone}`, String(c.score)));
    else row.append(el('span', 'dwd-na', 'N/A'));
    wrap.append(row);
  }
  return wrap;
}

function renderTimeline(events) {
  const ul = el('ul', 'dwd-tl');
  if (!events.length) { return el('div', 'dwd-tl__detail', 'Belum ada peristiwa wellness.'); }
  for (const ev of events) {
    const li = el('li');
    li.append(el('span', `dwd-tl__dot dwd-dot--${ev.tone || 'info'}`));
    const body = el('div', 'dwd-tl__body');
    body.append(el('span', 'dwd-tl__label', ev.label));
    if (ev.detail) body.append(el('span', 'dwd-tl__detail', ev.detail));
    li.append(body);
    ul.append(li);
  }
  return ul;
}

function renderRecommendations(recs) {
  const wrap = el('div', 'dwd-recs');
  for (const r of recs) {
    const card = el('div', 'dwd-rec');
    const top = el('div', 'dwd-rec__top');
    top.append(el('span', `dwd-rec__sev dwd-sev--${r.severity}`, r.severity), el('span', 'dwd-rec__label', r.label));
    card.append(top);
    if (r.detail) card.append(el('div', 'dwd-rec__detail', r.detail));
    wrap.append(card);
  }
  return wrap;
}

/* ── sheet assembly ───────────────────────────────────────────────────────── */

let _keyHandler = null;

function buildSheet(driver) {
  const sheet = el('aside', 'dwd-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', `Wellness ${driver.driverName}`);

  // Header
  const head = el('div', 'dwd-head');
  const top = el('div', 'dwd-head__top');
  const brand = el('div', 'dwd-head__brand');
  brand.append(el('span', null, '🫀'), el('span', null, 'Driver Wellness'));
  top.append(brand);
  top.append(el('span', 'dwd-head__tag', 'Sustainability'));
  const x = el('button', 'dwd-x', '×');
  x.type = 'button'; x.id = 'dwdClose'; x.setAttribute('aria-label', 'Tutup');
  top.append(x);
  head.append(top);

  const hero = el('div', 'dwd-hero');
  hero.append(el('div', 'dwd-hero__name', driver.driverName));
  const metric = el('div', 'dwd-hero__metric');
  metric.append(el('span', `dwd-hero__num dwd-num--${driver.health.tone}`, String(driver.health.score)));
  metric.append(el('span', 'dwd-hero__lbl', `${driver.health.labelId} · Skor / 100`));
  hero.append(metric);
  head.append(hero);
  sheet.append(head);

  // Body
  const body = el('div', 'dwd-body');

  // Overview
  const sOv = section('Ringkasan');
  const grid = el('div', 'dwd-grid');
  grid.append(stat('Kesehatan', String(driver.health.score), driver.health.labelId));
  grid.append(stat('Capacity Health', String(driver.capacityHealth.score), `utilisasi ${driver.capacityHealth.utilization}%`));
  grid.append(stat('Pemulihan', String(driver.recovery.score), `${driver.recovery.avgRestDays} hari rata-rata`));
  grid.append(stat('Jam Kerja', `${driver.workingTime.hours} j`, `${driver.workingTime.last30} tugas / 30h`));
  sOv.append(grid);
  body.append(sOv);

  // Health Score — Explainability (Feature 10)
  const sHealth = section('Skor Kesehatan', `${driver.health.score} · ${driver.health.label}`);
  sHealth.append(renderExplain(driver));
  body.append(sHealth);

  // Components (Feature 2)
  const sComp = section('Komponen Wellness');
  sComp.append(renderComponents(driver));
  body.append(sComp);

  // Fatigue (Feature 3)
  const sFat = section('Risiko Kelelahan', `${driver.fatigue.label}`);
  sFat.append(riskMeter(driver.fatigue));
  sFat.append(el('div', 'dwd-tl__detail', 'Indikator jangka pendek: pemulihan, hari beruntun, dan kepadatan tugas. Tidak memengaruhi rekomendasi.'));
  body.append(sFat);

  // Burnout (Feature 4)
  const sBurn = section('Risiko Burnout', `${driver.burnout.label}`);
  sBurn.append(riskMeter(driver.burnout));
  sBurn.append(el('div', 'dwd-tl__detail', 'Indikator jangka panjang: tren beban, utilisasi berkelanjutan, akhir pekan, dan pemulihan.'));
  body.append(sBurn);

  // Capacity (Feature 5)
  const sCap = section('Capacity Health', String(driver.capacityHealth.score));
  const capGrid = el('div', 'dwd-grid');
  capGrid.append(stat('Capacity Health', String(driver.capacityHealth.score), '100 = paling lengang'));
  capGrid.append(stat('Utilisasi', `${driver.capacityHealth.utilization}%`, 'beban 30 hari'));
  capGrid.append(stat('Status', driver.capacityHealth.status, 'band kapasitas'));
  sCap.append(capGrid);
  body.append(sCap);

  // Recovery + Working Time
  const sRec = section('Pemulihan & Waktu Kerja');
  const recGrid = el('div', 'dwd-grid');
  recGrid.append(stat('Skor Pemulihan', String(driver.recovery.score), `${driver.recovery.avgRestDays} hari istirahat`));
  recGrid.append(stat('Hari Beruntun', String(driver.recovery.maxStreak), 'maksimum berturut'));
  recGrid.append(stat('Jam Kerja', `${driver.workingTime.hours} j`, 'dalam jendela'));
  recGrid.append(stat('Tugas 7 Hari', String(driver.workingTime.last7), 'kepadatan terbaru'));
  sRec.append(recGrid);
  body.append(sRec);

  // Timeline (Feature 8)
  const sTl = section('Linimasa Wellness');
  sTl.append(renderTimeline(driver.timeline));
  body.append(sTl);

  // Recommendations (Feature 9)
  const sRecs = section('Rekomendasi');
  sRecs.append(renderRecommendations(driver.recommendations));
  body.append(sRecs);

  sheet.append(body);

  // Footer
  const foot = el('div', 'dwd-foot');
  const closeBtn = el('button', 'dwd-btn dwd-btn--ghost', 'Tutup');
  closeBtn.type = 'button'; closeBtn.id = 'dwdCloseBtn';
  foot.append(closeBtn);
  sheet.append(foot);

  const close = () => closeDriverWellnessDrawer();
  x.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  return sheet;
}

/**
 * Open (or replace) the Driver Wellness detail drawer for one driver's wellness
 * object (an element of computeDriverWellnessModel().drivers).
 * @param {Object} driver  a per-driver wellness object
 * @returns {HTMLElement} the drawer root
 */
export function openDriverWellnessDrawer(driver) {
  if (!driver) return null;
  ensureStyles();
  closeDriverWellnessDrawer();

  const overlay = el('div', 'dwd-overlay');
  overlay.id = ROOT_ID;
  overlay.setAttribute('data-open', 'false');
  overlay.append(buildSheet(driver));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDriverWellnessDrawer(); });
  document.body.appendChild(overlay);

  _keyHandler = (e) => { if (e.key === 'Escape') closeDriverWellnessDrawer(); };
  document.addEventListener('keydown', _keyHandler);

  requestAnimationFrame(() => { overlay.setAttribute('data-open', 'true'); });
  return overlay;
}

/** Close + remove the drawer (with a short fade) and unbind the ESC handler. */
export function closeDriverWellnessDrawer() {
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  const existing = document.getElementById(ROOT_ID);
  if (!existing) return;
  existing.setAttribute('data-open', 'false');
  const remove = () => { if (existing.parentNode) existing.parentNode.removeChild(existing); };
  setTimeout(remove, 320);
}
