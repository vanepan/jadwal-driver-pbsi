'use strict';

/* ============================================================
   REPORT-STYLES.JS — Approved Analytics Export stylesheet

   The visual source of truth is "Analytics Export/Pratinjau
   Laporan Analitik.html". This module exports that prototype's
   <style> block VERBATIM for the report body, with only the
   screen-only chrome removed and print/page rules added so the
   markup renders as true A4 pages under headless Chrome:

     • removed  — .vn* nav, .ra stage, the resize/scale script,
                  and the prototype @media print block (Puppeteer
                  prints the document directly; we drive paging
                  with @page + .a4 page-break rules instead).
     • added    — @page { size:A4; margin:0 }, white paper body,
                  per-page break, and print-color preservation.

   Every report class from the prototype is preserved unchanged
   so Phase B+ components map 1:1. Do NOT redesign here.

   The @font-face rules for Inter are injected separately by
   assets/fonts/inter-fonts.js and prepended to this string.
   ============================================================ */

const REPORT_STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* PDF paging — each .a4 is exactly one A4 page (210×297mm @96dpi = 794×1123px). */
@page{size:A4;margin:0}
html,body{background:#fff}
body{font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
.a4{page-break-after:always;break-after:page}
.a4:last-child{page-break-after:auto;break-after:auto}

/* A4 PAGE */
.a4{width:794px;height:1123px;background:#fff;overflow:hidden}
.pi{width:100%;height:100%;padding:72px 76px 64px;display:flex;flex-direction:column}
.zr{flex-shrink:0;height:1px;background:#D4D4D4;margin:0 -1px}

/* ZONE A — HEADER */
.za{flex:0 0 auto;padding-bottom:12px;display:flex;flex-direction:column;justify-content:flex-end}
/* 3-column header: LEFT (PBSI) · CENTER (Sarpras Operations) · RIGHT (period).
   1fr/auto/1fr keeps the centre column optically centred while the side
   columns stay balanced; align-items:center vertically aligns logo + text. */
.htop{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px}
.hid{display:flex;align-items:center;gap:10px;justify-self:start}
.pm{background:#0F0F0F;color:#fff;font-size:8px;font-weight:700;letter-spacing:.08em;padding:4px 6px;line-height:1;flex-shrink:0}
.hot{display:flex;flex-direction:column;gap:1px}
.on1{font-size:11px;font-weight:600;color:#0F0F0F;letter-spacing:-.01em}
.on2{font-size:9px;font-weight:400;color:#9A9A9A}
.hctr{display:flex;flex-direction:column;align-items:center;gap:4px;justify-self:center;text-align:center}
.hlogo{height:38px;width:auto;display:block;object-fit:contain}
.hcl{font-size:10px;font-weight:600;color:#0F0F0F;letter-spacing:.01em}
.hcl-fallback{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.hrt{text-align:right;justify-self:end}
.hpe{font-size:9px;font-weight:500;color:#6B6B6B}
.hda{font-size:9px;font-weight:400;color:#9A9A9A;margin-top:2px}
.htt{margin-top:10px;font-size:8px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#0F0F0F}

/* ZONE B — HERO */
.zb{flex:0 0 auto;display:flex;flex-direction:column;justify-content:center;padding:16px 0}
.hs{display:flex;align-items:baseline;gap:0;line-height:1}
.hn{font-size:92px;font-weight:100;letter-spacing:-.03em;color:#0F0F0F;font-variant-numeric:tabular-nums}
.hpu{font-size:42px;font-weight:300;letter-spacing:-.02em;color:#0F0F0F;margin-left:2px}
.hl{font-size:9px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#9A9A9A;margin-top:6px}
/* KPI ROW */
.kr{display:flex;border-top:1px solid #D4D4D4;margin-top:16px;padding-top:14px}
.kc{flex:1;display:flex;flex-direction:column;gap:5px;padding-right:14px;border-right:1px solid #D4D4D4}
.kc:last-child{border-right:none;padding-right:0}
.kv{font-size:27px;font-weight:300;color:#0F0F0F;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1}
.kv .ku{font-size:13px;font-weight:400;letter-spacing:0}
.kl{font-size:7px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#9A9A9A;line-height:1.35}

/* ZONE C — DISTRIBUTION */
.zc{flex:0 0 auto;display:flex;flex-direction:column;padding:10px 0}
.sl{font-size:7.5px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#9A9A9A;margin-bottom:10px}
/* strips */
.dr{display:flex;flex-direction:column;gap:12px}
.drow{display:flex;align-items:center;gap:10px}
.dn{width:84px;flex-shrink:0;font-size:11px;font-weight:600;color:#0F0F0F}
.dt{flex:1;height:6px;background:#EBEBEB;border-radius:1px;position:relative;overflow:hidden}
.df{position:absolute;inset:0 auto 0 0;background:#1A1A1A;border-radius:1px}
.dp{width:34px;flex-shrink:0;text-align:right;font-size:10px;font-weight:400;color:#6B6B6B;font-variant-numeric:tabular-nums}
.dk{width:60px;flex-shrink:0;text-align:right;font-size:10px;font-weight:400;color:#9A9A9A;font-variant-numeric:tabular-nums}
.dnote{font-size:8.5px;color:#9A9A9A;margin-top:10px}
/* bidang status strips */
.be{display:flex;flex-direction:column;gap:2px}
.bdn{font-size:11px;font-weight:600;color:#0F0F0F}
.bdd{font-size:9px;color:#6B6B6B}
.bsw{display:flex;align-items:center;gap:10px;margin-top:8px}
.bs{flex:1;height:8px;border-radius:2px}
.bs.ok{background:#1A7A4A}
.bs.wt{background:#EBEBEB;border:1px solid #D4D4D4}
.bsl{font-size:7.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;width:72px;flex-shrink:0;text-align:right}
.bsl.ok{color:#1A7A4A}
.bsl.wt{color:#9A9A9A}

/* ZONE D — HIGHLIGHTS */
.zd{flex:1;display:flex;flex-direction:column;padding:10px 0;min-height:0}
.hl-list{display:flex;flex-direction:column;gap:14px;margin-top:2px}
.hi{display:flex;gap:20px}
.hcat{flex:0 0 100px;font-size:7.5px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#9A9A9A;padding-top:1px;line-height:1.3}
.hcat.g{color:#1A7A4A}
.hcat.r{color:#C0392B}
.hbd{flex:1}
.hst{font-size:11px;font-weight:500;color:#0F0F0F;line-height:1.45}
.hct{font-size:9.5px;color:#6B6B6B;margin-top:2px;line-height:1.4}

/* ZONE E — FOOTER */
.ze{flex:0 0 auto;display:flex;flex-direction:column;justify-content:space-between;padding-top:8px;min-height:58px}
.cm{font-size:10px;color:#6B6B6B;margin-top:5px;line-height:1.55}
.cm b{font-weight:600;color:#0F0F0F}
.fb{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #D4D4D4;padding-top:8px;margin-top:8px}
.fm{font-size:7.5px;color:#9A9A9A}
.cnote{font-size:8px;color:#9A9A9A;font-style:italic;margin-bottom:4px}

/* HEALTH SCORE — Complete P1 */
.zb.ctr{align-items:center;justify-content:center;text-align:center}
.hsc{display:flex;align-items:baseline;justify-content:center;line-height:1;gap:0}
.hscn{font-size:100px;font-weight:100;letter-spacing:-.03em;color:#0F0F0F;font-variant-numeric:tabular-nums}
.hscd{font-size:36px;font-weight:300;color:#9A9A9A;letter-spacing:-.01em}
.hsbadge{display:inline-block;background:#E8F5EF;color:#1A7A4A;font-size:10px;font-weight:600;letter-spacing:.04em;padding:4px 12px;border-radius:4px;margin-top:10px}
.hslbl{font-size:8px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#9A9A9A;margin-top:8px}

/* TWO-COLUMN — Complete P2 */
.tcol{display:flex;flex:1;gap:0;min-height:0}
.cl{flex:1;padding-right:24px;display:flex;flex-direction:column}
.cr{flex:1;padding-left:24px;display:flex;flex-direction:column}
.crule{width:1px;background:#D4D4D4;flex-shrink:0}
.ch{font-size:8px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#9A9A9A;margin-bottom:10px}
.cs{font-size:9.5px;color:#6B6B6B;line-height:1.5;margin-bottom:12px}
.dr.sm .dn{width:60px;font-size:10px}
.dr.sm .dp{width:28px;font-size:9px}
.dr.sm .dk{width:48px;font-size:9px}
.dr.sm{gap:9px}
.chl{margin-top:12px;display:flex;flex-direction:column;gap:9px}
.chi{display:flex;gap:10px}
.chcat{flex:0 0 70px;font-size:7px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#9A9A9A;padding-top:1px}
.chcat.g{color:#1A7A4A}
.chst{font-size:10px;font-weight:500;color:#0F0F0F;line-height:1.4}
.chct{font-size:9px;color:#6B6B6B;margin-top:1px;line-height:1.35}
.cdim{border-top:1px solid #EBEBEB;padding-top:10px;margin-top:auto}
.cdlbl{font-size:7px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#9A9A9A;margin-bottom:4px}
.cdtxt{font-size:10px;color:#6B6B6B;font-style:italic}

/* DESTINATIONS — P3 */
.dlist{display:flex;flex-direction:column}
.ditem{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid #F0F0F0}
.ditem:last-child{border-bottom:none}
.dname{font-size:10.5px;color:#0F0F0F}
.dfreq{font-size:10.5px;font-weight:300;color:#6B6B6B;font-variant-numeric:tabular-nums}

/* CONTRIBUTORS FULL — P4 */
.cfs{margin-bottom:14px}
.cfsl{font-size:7.5px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#9A9A9A;padding-bottom:8px;border-bottom:1px solid #E8E8E8;margin-bottom:12px}
.cfi{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid #F4F4F4}
.cfi:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
.cfl{flex:1}
.cfn{font-size:13px;font-weight:600;color:#0F0F0F;margin-bottom:3px}
.cfd{font-size:10px;color:#6B6B6B;line-height:1.5;max-width:430px}
.cfr{text-align:right;padding-left:20px;flex-shrink:0}
.cfp{font-size:22px;font-weight:300;color:#0F0F0F;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
.cfpl{font-size:7px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#9A9A9A;margin-top:3px}

/* LAMPIRAN — P5 */
.lgrid{display:grid;grid-template-columns:1fr 1fr;gap:20px 48px}
.lkey{font-size:7.5px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:#9A9A9A;margin-bottom:4px}
.lval{font-size:11px;color:#0F0F0F;line-height:1.5}
.lsub{font-size:10px;color:#6B6B6B}
.lnote{border-top:1px solid #D4D4D4;padding-top:16px;margin-top:20px;font-size:10px;color:#6B6B6B;line-height:1.65}
`;

module.exports = { REPORT_STYLES };
