/* ============================================================
   INSIGHT-ENGINE.JS — Insight Engine 2.0  (v1.15.0)

   Template-driven, reusable insight generator. INTERPRETS already-computed
   metrics into executive-friendly Indonesian findings — it performs NO new
   calculations. 15 templates across five categories (Efficiency, Warning,
   Trend, NOR, Forecast); each carries multiple phrasings that ROTATE
   deterministically so wording never repeats verbatim across sections.

   Used by Analytics Petty Cash and Analytics Executive (and reusable by
   future Telegram digests / weekly / monthly reports). The Driver dashboard
   keeps its own analytics-insights.js (unchanged) — this is the 2.0 engine
   for the new spending/NOR domain.

   Insight contract:
     { category:'efficiency'|'warning'|'trend'|'nor'|'forecast',
       type:'info'|'success'|'warning', title, description,
       source, priority }      priority: 1 critical · 2 important · 3 general

   Pure: no DOM, no Firebase, no Date/random → deterministic.
   ============================================================ */

'use strict';

export const INSIGHT_CATEGORY = Object.freeze({
  EFFICIENCY: 'efficiency', WARNING: 'warning', TREND: 'trend', NOR: 'nor', FORECAST: 'forecast',
});

/** Rupiah formatter (id-ID) used inside insight sentences. */
function rp(n) { return 'Rp ' + Number(Math.round(Number(n) || 0)).toLocaleString('id-ID'); }
function pct(n) { return `${Math.round(Number(n) || 0)}%`; }

/** Deterministic, value-seeded variant selector (stable for the same inputs). */
function pickVariant(seedStr, variants) {
  let h = 0;
  const s = String(seedStr);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

/**
 * Template catalogue. Each: { id, category, priority, type, applies(ctx),
 * build(ctx) → { seed, variants:[{title,desc}], source } }.
 * `applies` gates the template; `build` supplies rotating phrasings.
 */
const TEMPLATES = [
  /* ── EFFICIENCY ───────────────────────────────────────────────── */
  {
    id: 'healthy-usage', category: INSIGHT_CATEGORY.EFFICIENCY, priority: 3, type: 'success',
    applies: (c) => c.realizationPct != null && c.realizationPct < 70 && c.totalSpend > 0,
    build: (c) => ({
      seed: `healthy-${c.realizationPct}`,
      source: 'Realisasi Siklus',
      variants: [
        { title: 'Penggunaan dana dalam batas sehat', desc: `Realisasi siklus berada di ${pct(c.realizationPct)} dari saldo awal — masih dalam batas aman.` },
        { title: 'Arus pengeluaran terkendali', desc: `Baru ${pct(c.realizationPct)} saldo terpakai; ruang anggaran masih lega untuk sisa siklus.` },
        { title: 'Pengeluaran proporsional', desc: `Tingkat realisasi ${pct(c.realizationPct)} menunjukkan belanja yang terukur terhadap saldo awal.` },
      ],
    }),
  },
  {
    id: 'balanced-units', category: INSIGHT_CATEGORY.EFFICIENCY, priority: 3, type: 'info',
    applies: (c) => c.topUnit && c.topUnit.pct > 0 && c.topUnit.pct < 50 && c.unitCount >= 2,
    build: (c) => ({
      seed: `balanced-${c.topUnit.pct}`,
      source: 'Distribusi Unit',
      variants: [
        { title: 'Distribusi antar unit merata', desc: `Tidak ada unit yang mendominasi — penyerap terbesar (${c.topUnit.label}) hanya ${pct(c.topUnit.pct)} dari total.` },
        { title: 'Beban anggaran tersebar', desc: `Pengeluaran tersebar cukup merata; ${c.topUnit.label} memimpin dengan ${pct(c.topUnit.pct)} saja.` },
      ],
    }),
  },

  /* ── WARNING ──────────────────────────────────────────────────── */
  {
    id: 'unit-concentration', category: INSIGHT_CATEGORY.WARNING, priority: 2, type: 'warning',
    applies: (c) => c.topUnit && c.topUnit.pct >= 50,
    build: (c) => ({
      seed: `unitconc-${c.topUnit.label}-${c.topUnit.pct}`,
      source: 'Distribusi Unit',
      variants: [
        { title: `${c.topUnit.label} menyerap mayoritas dana`, desc: `${c.topUnit.label} menyerap ${pct(c.topUnit.pct)} dana operasional periode ini — konsentrasi yang perlu diawasi.` },
        { title: `Konsentrasi dana pada ${c.topUnit.label}`, desc: `Lebih dari separuh pengeluaran (${pct(c.topUnit.pct)}) berasal dari ${c.topUnit.label}.` },
      ],
    }),
  },
  {
    id: 'low-balance', category: INSIGHT_CATEGORY.WARNING, priority: 1, type: 'warning',
    applies: (c) => c.openingBalance > 0 && c.remainingBalance != null && (c.remainingBalance / c.openingBalance) <= 0.15,
    build: (c) => ({
      seed: `lowbal-${c.remainingBalance}`,
      source: 'Saldo Tersisa',
      variants: [
        { title: 'Saldo tersisa menipis', desc: `Sisa saldo tinggal ${rp(c.remainingBalance)} (${pct((c.remainingBalance / c.openingBalance) * 100)}) — pertimbangkan penerbitan NOR untuk penggantian dana.` },
        { title: 'Saldo siklus mendekati batas', desc: `Hanya ${rp(c.remainingBalance)} tersisa dari saldo awal; arus kas siklus perlu diisi ulang.` },
      ],
    }),
  },
  {
    id: 'high-realization', category: INSIGHT_CATEGORY.WARNING, priority: 2, type: 'warning',
    applies: (c) => c.realizationPct != null && c.realizationPct >= 85,
    build: (c) => ({
      seed: `highreal-${c.realizationPct}`,
      source: 'Realisasi Siklus',
      variants: [
        { title: 'Realisasi mendekati saldo awal', desc: `Realisasi telah mencapai ${pct(c.realizationPct)} dari saldo awal — ruang anggaran tersisa terbatas.` },
        { title: 'Anggaran siklus hampir penuh terpakai', desc: `Dengan ${pct(c.realizationPct)} terealisasi, siklus mendekati ambang penggantian dana.` },
      ],
    }),
  },

  /* ── TREND ────────────────────────────────────────────────────── */
  {
    id: 'spend-up', category: INSIGHT_CATEGORY.TREND, priority: 2, type: 'warning',
    applies: (c) => c.spendTrend && c.spendTrend.direction === 'up' && c.spendTrend.percentChange != null,
    build: (c) => ({
      seed: `spendup-${c.spendTrend.percentChange}`,
      source: 'Tren Pengeluaran',
      variants: [
        { title: `Pengeluaran naik ${pct(Math.abs(c.spendTrend.percentChange))}`, desc: `Total pengeluaran naik ${pct(Math.abs(c.spendTrend.percentChange))} dibanding periode sebelumnya.` },
        { title: 'Pengeluaran meningkat', desc: `Tren belanja naik ${pct(Math.abs(c.spendTrend.percentChange))} terhadap periode sebelumnya — perhatikan pemicunya.` },
      ],
    }),
  },
  {
    id: 'spend-down', category: INSIGHT_CATEGORY.TREND, priority: 3, type: 'success',
    applies: (c) => c.spendTrend && c.spendTrend.direction === 'down' && c.spendTrend.percentChange != null,
    build: (c) => ({
      seed: `spenddown-${c.spendTrend.percentChange}`,
      source: 'Tren Pengeluaran',
      variants: [
        { title: `Pengeluaran turun ${pct(Math.abs(c.spendTrend.percentChange))}`, desc: `Total pengeluaran turun ${pct(Math.abs(c.spendTrend.percentChange))} dibanding periode sebelumnya.` },
        { title: 'Belanja lebih hemat', desc: `Pengeluaran berkurang ${pct(Math.abs(c.spendTrend.percentChange))} terhadap periode sebelumnya.` },
      ],
    }),
  },
  {
    id: 'top-category', category: INSIGHT_CATEGORY.TREND, priority: 3, type: 'info',
    applies: (c) => c.topCategory && c.topCategory.pct > 0,
    build: (c) => ({
      seed: `topcat-${c.topCategory.label}-${c.topCategory.pct}`,
      source: 'Kategori Pengeluaran',
      variants: [
        { title: `Kategori dominan: ${c.topCategory.label}`, desc: `${c.topCategory.label} menjadi kategori pengeluaran terbesar (${pct(c.topCategory.pct)} dari total).` },
        { title: `${c.topCategory.label} memimpin belanja`, desc: `Belanja paling banyak masuk kategori ${c.topCategory.label} — ${pct(c.topCategory.pct)} dari seluruh pengeluaran.` },
      ],
    }),
  },
  {
    id: 'top-bidang', category: INSIGHT_CATEGORY.TREND, priority: 3, type: 'info',
    applies: (c) => c.topBidang && c.topBidang.label && c.topBidang.pct > 0,
    build: (c) => ({
      seed: `topbid-${c.topBidang.label}-${c.topBidang.pct}`,
      source: 'Bidang Pengguna Dana',
      variants: [
        { title: `Bidang terbesar: ${c.topBidang.label}`, desc: `${c.topBidang.label} menjadi bidang pengguna dana terbesar (${pct(c.topBidang.pct)} dari total teridentifikasi).` },
        { title: `${c.topBidang.label} pengguna dana utama`, desc: `Penggunaan dana paling besar tercatat dari bidang ${c.topBidang.label}.` },
      ],
    }),
  },

  /* ── NOR ──────────────────────────────────────────────────────── */
  {
    id: 'nor-improving', category: INSIGHT_CATEGORY.NOR, priority: 3, type: 'success',
    applies: (c) => c.realizationTrend && c.realizationTrend.available && c.realizationTrend.direction === 'down',
    build: (c) => ({
      seed: `norimp-${c.realizationTrend.deltaDays}`,
      source: 'Waktu Realisasi NOR',
      variants: [
        { title: 'Waktu realisasi NOR membaik', desc: `Rata-rata waktu realisasi NOR membaik ${Math.abs(c.realizationTrend.deltaDays)} hari dibanding periode sebelumnya.` },
        { title: 'Penggantian dana lebih cepat', desc: `NOR direalisasikan ${Math.abs(c.realizationTrend.deltaDays)} hari lebih cepat dibanding sebelumnya.` },
      ],
    }),
  },
  {
    id: 'nor-slower', category: INSIGHT_CATEGORY.NOR, priority: 2, type: 'warning',
    applies: (c) => c.realizationTrend && c.realizationTrend.available && c.realizationTrend.direction === 'up',
    build: (c) => ({
      seed: `norslow-${c.realizationTrend.deltaDays}`,
      source: 'Waktu Realisasi NOR',
      variants: [
        { title: 'Waktu realisasi NOR melambat', desc: `Rata-rata waktu realisasi NOR melambat ${Math.abs(c.realizationTrend.deltaDays)} hari dibanding periode sebelumnya.` },
        { title: 'Penggantian dana lebih lama', desc: `NOR butuh ${Math.abs(c.realizationTrend.deltaDays)} hari lebih lama untuk direalisasikan dibanding sebelumnya.` },
      ],
    }),
  },
  {
    id: 'nor-volume', category: INSIGHT_CATEGORY.NOR, priority: 3, type: 'info',
    applies: (c) => c.officialNorCount > 0,
    build: (c) => ({
      seed: `norvol-${c.officialNorCount}`,
      source: 'NOR Resmi',
      variants: [
        { title: `${c.officialNorCount} NOR resmi diterbitkan`, desc: `Sebanyak ${c.officialNorCount} NOR resmi tercatat pada periode ini.` },
        { title: 'Aktivitas penerbitan NOR', desc: `${c.officialNorCount} NOR resmi diterbitkan untuk merealisasikan pengeluaran periode ini.` },
      ],
    }),
  },
  {
    id: 'nor-fast', category: INSIGHT_CATEGORY.NOR, priority: 3, type: 'success',
    applies: (c) => c.avgRealizationDays != null && c.avgRealizationDays <= 7 && c.officialNorCount > 0,
    build: (c) => ({
      seed: `norfast-${c.avgRealizationDays}`,
      source: 'Waktu Realisasi NOR',
      variants: [
        { title: 'Realisasi NOR tergolong cepat', desc: `Rata-rata dana pengganti diterima dalam ${c.avgRealizationDays} hari sejak NOR diterbitkan.` },
        { title: 'Siklus penggantian dana sehat', desc: `Waktu realisasi rata-rata ${c.avgRealizationDays} hari menandakan arus penggantian dana yang lancar.` },
      ],
    }),
  },

  /* ── FORECAST ─────────────────────────────────────────────────── */
  {
    id: 'annual-projection', category: INSIGHT_CATEGORY.FORECAST, priority: 3, type: 'info',
    applies: (c) => c.forecast && c.forecast.projected > 0,
    build: (c) => ({
      seed: `proj-${c.forecast.projected}`,
      source: 'Proyeksi Tahunan',
      variants: [
        { title: 'Proyeksi pengeluaran tahunan', desc: `Dengan laju saat ini, proyeksi pengeluaran tahunan mencapai ${rp(c.forecast.projected)}.` },
        { title: 'Estimasi belanja setahun', desc: `Bila tren berlanjut, total pengeluaran tahunan diperkirakan ${rp(c.forecast.projected)}.` },
      ],
    }),
  },
  {
    id: 'forecast-pace', category: INSIGHT_CATEGORY.FORECAST, priority: 2, type: 'warning',
    applies: (c) => c.forecast && c.annualBudget > 0 && c.forecast.projected > c.annualBudget,
    build: (c) => ({
      seed: `fpace-${c.forecast.projected}`,
      source: 'Proyeksi Tahunan',
      variants: [
        { title: 'Proyeksi melampaui anggaran', desc: `Proyeksi tahunan ${rp(c.forecast.projected)} melampaui anggaran ${rp(c.annualBudget)} — laju belanja perlu ditinjau.` },
        { title: 'Laju belanja di atas anggaran', desc: `Pada laju ini pengeluaran tahunan (${rp(c.forecast.projected)}) berada di atas anggaran yang ditetapkan.` },
      ],
    }),
  },
];

/**
 * Generate rotating insights from a metric context. Evaluates every template,
 * keeps the applicable ones, and selects one deterministic variant each.
 * @param {Object} ctx - precomputed metrics (see template `applies`/`build`)
 * @param {{limit?:number}} [opts]
 * @returns {Array<{category:string,type:string,title:string,description:string,source:string,priority:number}>}
 */
export function generateInsights(ctx = {}, { limit = 0 } = {}) {
  const out = [];
  for (const t of TEMPLATES) {
    let applicable = false;
    try { applicable = !!t.applies(ctx); } catch (_) { applicable = false; }
    if (!applicable) continue;
    let spec;
    try { spec = t.build(ctx); } catch (_) { continue; }
    if (!spec || !Array.isArray(spec.variants) || spec.variants.length === 0) continue;
    const v = pickVariant(`${t.id}|${spec.seed}`, spec.variants);
    out.push({
      category: t.category, type: t.type, title: v.title, description: v.desc,
      source: spec.source || '', priority: t.priority,
    });
  }
  out.sort((a, b) => (a.priority - b.priority));
  return limit > 0 ? out.slice(0, limit) : out;
}

/**
 * Compose a short executive narrative paragraph from the strongest insights.
 * Reuses generateInsights so wording stays consistent with the cards.
 * @param {Object} ctx
 * @param {{max?:number}} [opts]
 * @returns {string}
 */
export function generateNarrative(ctx = {}, { max = 3 } = {}) {
  const insights = generateInsights(ctx, { limit: max });
  if (insights.length === 0) return 'Belum cukup data untuk menyusun ringkasan naratif pada periode ini.';
  return insights.map(i => i.description).join(' ');
}
