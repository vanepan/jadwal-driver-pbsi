/* ============================================================
   NOR-PAPER.JS — on-screen NOR renderer (Arial, A4 look)

   Produces the exact on-screen "paper" used by BOTH the Generate
   NOR preview and the NOR Detail screen. It consumes the SAME view
   model as the pdfmake 'nor' template (buildNorViewModel), so the
   on-screen document and the generated PDF stay in lock-step —
   satisfying "Generated PDF must match on-screen NOR".

   Pure string builder. Caller supplies the asset path for the logo.
   ============================================================ */

'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function recipientLines(list) {
  return (list || []).map((v, i) => `<div>${i + 1}. ${esc(v)}</div>`).join('');
}

function signBlock(s) {
  return `<div><div>${esc(s.label)},</div><div style="font-weight:700;text-transform:uppercase">${esc(s.position)}</div><div style="height:46px"></div><div style="font-weight:700;text-decoration:underline">${esc(s.name)}</div></div>`;
}
function recapBlock(s) {
  return `<div><div>${esc(s.label)},</div><div style="font-weight:700">${esc(s.position)}</div><div style="height:44px"></div><div style="font-weight:700;text-decoration:underline">${esc(s.name)}</div></div>`;
}

/**
 * @param {object} vm  view model from buildNorViewModel()
 * @param {string} logoSrc  path/URL to the PBSI mark
 * @param {string} paperId  optional id for the outer paper element
 */
export function renderNorPaper(vm, logoSrc, paperId) {
  const d = vm || {};
  const itemRows = (d.items || []).map(it => (
    `<tr><td style="border:1px solid #000;padding:3px 5px;text-align:center">${it.no}</td>` +
    `<td style="border:1px solid #000;padding:3px 5px;text-align:center">${esc(it.dateFmt)}</td>` +
    `<td style="border:1px solid #000;padding:3px 5px">${esc(it.description)}</td>` +
    `<td style="border:1px solid #000;padding:3px 5px;text-align:right">${esc(it.amountFmt)}</td>` +
    `<td style="border:1px solid #000;padding:3px 5px">${esc(it.keterangan)}</td></tr>`
  )).join('');

  const balanceTable = (awalW) => (
    `<table style="border-collapse:collapse;margin:0 0 6px"><tbody>` +
    `<tr><td style="padding:0;width:${awalW}px">Dana Awal (${esc(d.danaAwalDate)})</td><td style="padding:0;width:30px">: Rp</td><td style="padding:0;text-align:right;width:104px">${esc(d.openingDoc)}</td></tr>` +
    `<tr><td style="padding:0">Dana Terealisasi</td><td style="padding:0">: Rp</td><td style="padding:0;text-align:right">${esc(d.realizedDoc)}</td></tr>` +
    `<tr><td style="padding:0">Sisa Dana</td><td style="padding:0">: Rp</td><td style="padding:0;text-align:right">${esc(d.remainingDoc)}</td></tr>` +
    `</tbody></table>`
  );

  return `
  <div ${paperId ? `id="${paperId}"` : ''} class="pc-nor-paper" style="background:#fff;color:#000;max-width:820px;margin:0 auto;border-radius:2px;box-shadow:var(--shadow-lg);overflow:hidden;font-family:Arial,Helvetica,sans-serif">
    <div class="pc-nor-pad" style="padding:40px 52px 30px;font-size:10pt;line-height:1.3">
      ${d.isTest ? `<div style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:9pt;letter-spacing:2px;color:#9a1b2d;border:1.5px dashed #9a1b2d;border-radius:6px;padding:6px;margin-bottom:14px">TEST ONLY — DOKUMEN TIDAK SAH</div>` : ''}
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:2px">
        <img src="${esc(logoSrc)}" alt="PBSI" style="width:75px;height:auto;margin-bottom:6px"/>
        <div style="font-weight:700;font-size:13pt">NOTA ORGANISASI</div>
      </div>
      <div style="margin:14px 0 12px">
        <div>Jakarta, ${esc(d.dateLong)}</div>
        <div>No.${esc(d.norNumber)}</div>
      </div>
      <table style="border-collapse:collapse;margin-bottom:9px"><tbody>
        <tr><td style="vertical-align:top;width:96px;padding:0">Kepada Yth.</td><td style="width:10px;vertical-align:top;padding:0">:</td><td style="padding:0">${recipientLines(d.recipients)}</td></tr>
        <tr><td style="vertical-align:top;padding:0">Dari</td><td style="vertical-align:top;padding:0">:</td><td style="padding:0">${esc(d.senderTitle)}</td></tr>
        <tr><td style="vertical-align:top;padding:0">Tembusan Yth.</td><td style="vertical-align:top;padding:0">:</td><td style="padding:0">${recipientLines(d.cc)}</td></tr>
        <tr><td style="vertical-align:top;padding:0">Perihal</td><td style="vertical-align:top;padding:0">:</td><td style="padding:0;font-weight:700">${esc(d.subject)}</td></tr>
        <tr><td style="vertical-align:top;padding:0">Lampiran</td><td style="vertical-align:top;padding:0">:</td><td style="padding:0">1 (satu) berkas</td></tr>
      </tbody></table>
      <p style="margin:0 0 6px">Dengan hormat,</p>
      <p style="margin:0 0 6px;text-align:justify">Sehubungan dengan kegiatan operasional bidang sarana dan prasarana, kami melaporkan realisasi petty cash bidang sarana dan prasarana dengan rincian sebagai berikut:</p>
      ${balanceTable(206)}
      <p style="margin:0 0 6px">Terbilang: ${esc(d.terbilang)}</p>
      <p style="margin:0 0 6px;text-align:justify">Sehubungan dengan telah direalisasikannya petty cash tersebut, kami memohon agar dana petty cash dapat ditambahkan kembali untuk memastikan kelancaran operasional di bidang Sarana dan Prasarana. Sebagai dasar perhitungan, kami lampirkan laporan realisasi penggunaan dana.</p>
      <p style="margin:0 0 16px;text-align:justify">Demikian nota organisasi ini disampaikan, atas perhatiannya kami ucapkan terima kasih.</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;text-align:left">
        ${(d.letterTop || []).map(signBlock).join('')}
      </div>
      ${(d.letterBottom && d.letterBottom.length) ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;text-align:left;margin-top:8px">${d.letterBottom.map(signBlock).join('')}</div>` : ''}
    </div>
    <div class="pc-nor-pad" style="border-top:1px dashed #c8c8c8;padding:30px 52px 38px;font-size:10pt;line-height:1.25">
      <div style="text-align:center;font-weight:700;font-size:11pt">RINCIAN PENGGUNAAN PETTY CASH</div>
      <div style="text-align:center;margin-bottom:9px">BIDANG SARANA DAN PRASARANA</div>
      <div class="pc-nor-table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:9pt;min-width:460px">
        <thead><tr>
          <th style="border:1px solid #000;padding:3px 5px;width:26px">No</th>
          <th style="border:1px solid #000;padding:3px 5px;width:76px">Tanggal</th>
          <th style="border:1px solid #000;padding:3px 5px;text-align:left">Rincian</th>
          <th style="border:1px solid #000;padding:3px 5px;width:94px;text-align:right">Biaya</th>
          <th style="border:1px solid #000;padding:3px 5px;width:88px">Keterangan</th>
        </tr></thead>
        <tbody>
          ${itemRows}
          <tr style="font-weight:700"><td colspan="3" style="border:1px solid #000;padding:3px 5px;text-align:right">Total Pengeluaran</td><td style="border:1px solid #000;padding:3px 5px;text-align:right">${esc(d.totalTable)}</td><td style="border:1px solid #000"></td></tr>
        </tbody>
      </table>
      </div>
      ${balanceTable(216)}
      <p style="margin:0 0 14px">Terbilang: ${esc(d.terbilang)}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;text-align:left;max-width:440px">
        ${(d.recap || []).map(recapBlock).join('')}
      </div>
    </div>
  </div>`;
}
