/* ============================================================
   DOCUMENT-VIEWER.JS — One reusable modal for every document

   Shows a real PDF blob (true WYSIWYG: the preview IS the export)
   with Print / Download / Share actions. Self-contained: injects
   its own DOM + styles once, owns the object-URL lifecycle.

   Backend-agnostic — consumes a Blob only.
   ============================================================ */

'use strict';

import { printPdfBlob } from './print-manager.js';

let _initialised = false;
let _currentUrl  = null;

const STYLE = `
.docv-overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;
  background:rgba(20,18,16,.55);backdrop-filter:blur(2px);padding:16px;}
.docv-overlay.open{display:flex;}
.docv-modal{background:#fff;border-radius:12px;width:min(900px,100%);height:min(92vh,100%);
  display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.32);}
.docv-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #ECEAE6;}
.docv-title{font:600 14px system-ui,sans-serif;color:#1A1917;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.docv-x{border:none;background:#F3F1ED;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;color:#5B5953;}
.docv-x:hover{background:#E7E4DF;}
.docv-body{flex:1;background:#E9E6E1;overflow:auto;}
.docv-body iframe{width:100%;height:100%;border:0;background:#E9E6E1;}
.docv-foot{display:flex;gap:10px;padding:12px 16px;border-top:1px solid #ECEAE6;justify-content:flex-end;flex-wrap:wrap;}
.docv-btn{border:none;border-radius:8px;padding:10px 18px;font:600 13px system-ui,sans-serif;cursor:pointer;}
.docv-btn--ghost{background:#fff;color:#1A1917;border:1.5px solid #D8D4CE;}
.docv-btn--ghost:hover{background:#F5F3EF;}
.docv-btn--dark{background:#1A1917;color:#fff;}
.docv-btn--dark:hover{background:#333;}
.docv-btn[disabled]{opacity:.5;cursor:default;}
@media print{.docv-overlay{display:none!important;}}
`;

function _ensureDom() {
  if (_initialised) return;
  _initialised = true;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'docv-overlay';
  overlay.id = 'docvOverlay';
  overlay.innerHTML = `
    <div class="docv-modal" role="dialog" aria-modal="true" aria-label="Pratinjau Dokumen">
      <div class="docv-head">
        <div class="docv-title" id="docvTitle">Dokumen</div>
        <button class="docv-x" id="docvClose" aria-label="Tutup">✕</button>
      </div>
      <div class="docv-body"><iframe id="docvFrame" title="Pratinjau PDF"></iframe></div>
      <div class="docv-foot">
        <button class="docv-btn docv-btn--ghost" id="docvShare" style="display:none;">Bagikan</button>
        <button class="docv-btn docv-btn--ghost" id="docvDownload">Unduh PDF</button>
        <button class="docv-btn docv-btn--dark"  id="docvPrint">Cetak</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeViewer(); });
  document.getElementById('docvClose').addEventListener('click', closeViewer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeViewer();
  });
}

/**
 * Show a PDF blob in the viewer with Print/Download/Share wired.
 * @param {Blob} blob — application/pdf
 * @param {string} filename
 * @param {{title?:string, shareText?:string}} [meta]
 */
export function showViewer(blob, filename, meta = {}) {
  _ensureDom();

  if (_currentUrl) URL.revokeObjectURL(_currentUrl);
  _currentUrl = URL.createObjectURL(blob);

  document.getElementById('docvTitle').textContent = meta.title || filename || 'Dokumen';
  document.getElementById('docvFrame').src = _currentUrl;

  const dlBtn = document.getElementById('docvDownload');
  dlBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = _currentUrl; a.download = filename || 'document.pdf';
    document.body.appendChild(a); a.click(); a.remove();
  };

  document.getElementById('docvPrint').onclick = () => printPdfBlob(blob);

  const shareBtn = document.getElementById('docvShare');
  if (_canShareFiles()) {
    shareBtn.style.display = '';
    shareBtn.onclick = () => _share(blob, filename, meta.shareText);
  } else {
    shareBtn.style.display = 'none';
  }

  document.getElementById('docvOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeViewer() {
  const overlay = document.getElementById('docvOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  const frame = document.getElementById('docvFrame');
  if (frame) frame.src = 'about:blank';
  if (_currentUrl) { URL.revokeObjectURL(_currentUrl); _currentUrl = null; }
}

function _canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([''], 'p.pdf', { type: 'application/pdf' })] });
  } catch { return false; }
}

async function _share(blob, filename, text) {
  try {
    const file = new File([blob], filename || 'document.pdf', { type: 'application/pdf' });
    await navigator.share({ title: filename, text: text || filename, files: [file] });
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('[DocumentViewer] share failed:', e);
  }
}
