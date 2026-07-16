/* ============================================================
   OVERTIME-CLOSING-VIEW.JS — Monthly Closing screen (Sprint 9)

   Flow: Open -> validate (warn-only, non-blocking) -> Close (freezes
   an archive snapshot + generates the Closing report) -> Locked ->
   Unlock (reason required) -> Open again. Closing History is folded
   into this same screen (no separate nav item, per the plan).
   ============================================================ */

'use strict';

import * as svc from '../overtime-service.js';
import { esc, fmtDateTime, fmtMonth, todayISO, emptyState } from './overtime-atoms.js';
import { WARNING_LABEL } from '../overtime-closing-engine.js';
import { runOvertimeExport } from './overtime-export-runner.js';
import { APP_VERSION } from '../../config.js';

function monthPicker(state) {
  const month = state.closingSelectedMonth || todayISO().slice(0, 7);
  return `<input data-act="input:closingSelectedMonth" type="month" value="${esc(month)}"
    style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">`;
}

function statusBadge(status) {
  const closed = status.status === 'closed';
  return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${closed ? 'var(--card2)' : 'var(--primary-tint)'};color:${closed ? 'var(--muted)' : 'var(--primary-text)'}">
    ${closed ? 'Ditutup' : 'Terbuka'}
  </span>`;
}

function warningsList(validation) {
  if (!validation.warningCount) {
    return `<div style="font-size:12.5px;color:var(--green);padding:8px 0">Tidak ada peringatan — data bersih.</div>`;
  }
  return `
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
      ${validation.warnings.slice(0, 20).map(w => `
        <div style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;background:var(--card2);border:1px solid var(--border);border-radius:9px">
          <span style="font-size:11px;font-weight:700;color:var(--primary);white-space:nowrap">${esc(WARNING_LABEL[w.code] || w.code)}</span>
          <span style="font-size:12px;color:var(--text)">${esc(w.message)}</span>
        </div>`).join('')}
      ${validation.warnings.length > 20 ? `<div style="font-size:11px;color:var(--muted)">+${validation.warnings.length - 20} peringatan lainnya</div>` : ''}
    </div>`;
}

function historyTimeline(status) {
  const events = status.history || [];
  if (!events.length) return `<div style="font-size:12px;color:var(--muted);padding:6px 0">Belum ada riwayat untuk periode ini.</div>`;
  return `
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
      ${events.slice().reverse().map(e => `
        <div style="display:flex;gap:8px;align-items:baseline;font-size:12px">
          <span style="font-weight:700;color:${e.event === 'closed' ? 'var(--green)' : 'var(--primary)'}">${e.event === 'closed' ? 'Ditutup' : 'Dibuka Kembali'}</span>
          <span style="color:var(--muted)">${esc(fmtDateTime(e.at))} · ${esc(e.by || '—')}</span>
          ${e.note || e.reason ? `<span style="color:var(--text)">— ${esc(e.note || e.reason)}</span>` : ''}
        </div>`).join('')}
    </div>`;
}

function allClosingsTable() {
  const closings = svc.listClosings();
  if (!closings.length) return emptyState('Belum ada Closing yang pernah dijalankan');
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${['Periode', 'Status', 'Ditutup Pada', 'Oleh', 'Dibuka Ulang'].map(h => `<th style="padding:8px 10px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;text-align:left">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${closings.map(c => `
          <tr>
            <td style="padding:8px 10px;border-top:1px solid var(--border);font-size:12.5px;font-weight:700">${esc(fmtMonth(c.yyyyMM))}</td>
            <td style="padding:8px 10px;border-top:1px solid var(--border)">${statusBadge(c)}</td>
            <td style="padding:8px 10px;border-top:1px solid var(--border);font-size:12px">${esc(fmtDateTime(c.closedAt))}</td>
            <td style="padding:8px 10px;border-top:1px solid var(--border);font-size:12px">${esc(c.closedBy || '—')}</td>
            <td style="padding:8px 10px;border-top:1px solid var(--border);font-size:12px">${c.reopenCount || 0}×</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

export function renderClosingScreen(state) {
  const month = state.closingSelectedMonth || todayISO().slice(0, 7);
  const status = svc.getClosingStatus(month);
  const validation = svc.runClosingValidation(month);
  const closed = status.status === 'closed';

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Tutup Periode</h2>
      <div style="font-size:13px;color:var(--muted)">Tutup periode untuk membekukan ringkasan bulan tersebut — dapat dibuka kembali dengan alasan.</div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      ${monthPicker(state)}
      ${statusBadge(status)}
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px">
      <div style="font-size:13px;font-weight:800;color:var(--text)">Validasi Pra-Closing</div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Peringatan bersifat informatif — tidak memblokir Closing. Admin memegang keputusan akhir.</div>
      ${warningsList(validation)}
    </div>

    ${closed ? `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-top:14px">
      <div style="font-size:13px;font-weight:800;color:var(--text)">Periode Ditutup</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">Ditutup ${esc(fmtDateTime(status.closedAt))} oleh ${esc(status.closedBy || '—')}${status.closeNote ? ` — "${esc(status.closeNote)}"` : ''}</div>
      <button data-act="openUnlockModal" type="button" style="margin-top:12px;border:1px solid var(--border);background:var(--card2);color:var(--text);border-radius:9px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer">Buka Kunci (Unlock)</button>
    </div>` : `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-top:14px">
      <label style="font-size:12px;font-weight:700;color:var(--muted)">Catatan Closing (opsional)
        <input data-act="statefield:closingNote" type="text" value="${esc(state.closingNote || '')}" style="width:100%;margin-top:4px;padding:9px 10px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;box-sizing:border-box">
      </label>
      <button data-act="closeMonthClick" type="button" style="margin-top:12px;background:var(--primary);color:var(--primary-fg);border:none;border-radius:9px;padding:10px 18px;font-size:13.5px;font-weight:700;cursor:pointer">Tutup Bulan</button>
    </div>`}

    <div style="margin-top:18px">
      <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:8px">Riwayat Periode Ini</div>
      ${historyTimeline(status)}
    </div>

    <div style="margin-top:22px">
      <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:8px">Closing History — Semua Periode</div>
      ${allClosingsTable()}
    </div>`;
}

export function renderUnlockModal(state) {
  return `
    <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
      <div data-act="closeUnlockModal" style="position:absolute;inset:0"></div>
      <div style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:420px;padding:22px">
        <div style="font-size:15px;font-weight:800;margin-bottom:6px">Buka Kunci Periode</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px">Alasan wajib diisi — akan tercatat pada Audit Trail dan riwayat periode ini.</div>
        <textarea data-focus="unlockReasonField" data-act="statefield:unlockReason" autofocus rows="3" placeholder="Contoh: koreksi entri karyawan X tanggal 12."
          style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;box-sizing:border-box;resize:vertical">${esc(state.unlockReason || '')}</textarea>
        ${state.unlockReasonErr ? `<div style="color:var(--primary);font-size:12px;margin-top:6px">${esc(state.unlockReasonErr)}</div>` : ''}
        <div style="display:flex;gap:8px;margin-top:14px">
          <button data-act="submitUnlock" type="button" style="flex:1;background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:11px;font-size:13.5px;font-weight:700;cursor:pointer">Buka Kunci</button>
          <button data-act="closeUnlockModal" type="button" style="flex:1;border:1px solid var(--border);background:var(--card2);color:var(--text);border-radius:10px;padding:11px;font-size:13.5px;font-weight:600;cursor:pointer">Batal</button>
        </div>
      </div>
    </div>`;
}

export const closingActions = {
  async closeMonthClick({ state, setState, toast }) {
    const month = state.closingSelectedMonth || todayISO().slice(0, 7);
    try {
      await svc.closeMonth(month, { note: state.closingNote || '' });
      setState({ closingNote: '' });
      toast(`Periode ${month} ditutup.`);

      // Generate the Closing report — DOM-dependent, orchestrated here
      // (not inside svc.closeMonth(), which is a pure atomic data write).
      const snapshot = svc.getReportSnapshot({ period: 'month', refDate: `${month}-01` });
      try {
        await runOvertimeExport('pdf', snapshot, { appVersion: APP_VERSION });
        const entry = await svc.logReportGenerated({
          format: 'pdf', period: snapshot.period, periodLabel: snapshot.periodLabel,
          dateRangeStart: snapshot.dateRangeStart, dateRangeEnd: snapshot.dateRangeEnd,
          scope: snapshot.scope, status: 'success', source: 'closing', appVersion: APP_VERSION,
        });
        await svc.attachClosingReportRef(month, entry.id);
      } catch (reportErr) {
        // Closing itself already succeeded — a failed report generation
        // is surfaced but must never look like Closing failed, and it's
        // still logged (never a silent error), just like every other
        // export path in this module.
        await svc.logReportGenerated({
          format: 'pdf', period: snapshot.period, periodLabel: snapshot.periodLabel,
          dateRangeStart: snapshot.dateRangeStart, dateRangeEnd: snapshot.dateRangeEnd,
          scope: snapshot.scope, status: 'failed', source: 'closing', appVersion: APP_VERSION,
          error: reportErr.message || String(reportErr),
        });
        toast(`Periode ditutup, namun laporan gagal dibuat: ${reportErr.message || reportErr}`);
      }
    } catch (err) {
      toast(err.message || 'Gagal menutup periode.');
    }
  },

  openUnlockModal({ setState }) { setState({ unlockModalOpen: true, unlockReason: '', unlockReasonErr: '' }); },
  closeUnlockModal({ setState }) { setState({ unlockModalOpen: false }); },

  async submitUnlock({ state, setState, toast }) {
    const month = state.closingSelectedMonth || todayISO().slice(0, 7);
    try {
      await svc.unlockMonth(month, { reason: state.unlockReason });
      setState({ unlockModalOpen: false, unlockReason: '' });
      toast(`Periode ${month} dibuka kembali.`);
    } catch (err) {
      setState({ unlockReasonErr: err.message || 'Gagal membuka kunci.' });
    }
  },
};
