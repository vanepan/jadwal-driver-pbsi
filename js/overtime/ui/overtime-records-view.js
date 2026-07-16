/* ============================================================
   OVERTIME-RECORDS-VIEW.JS — Penyesuaian Data: browse/edit/delete/restore

   Full-CRUD UI over overtimeRecords — filterable table, inline Edit modal
   (same form-modal pattern as overtime-center.js's existing unitModal/
   holidayModal), Delete via the app's existing click-again-to-confirm
   idiom. Locked-month rows render Edit/Delete disabled with a lock icon.

   Final UX Refinement additions:
   - deleteRecordClick now SOFT-deletes (svc.deleteRecord already changed
     shape, not this file) — deleted rows stay visible behind a "Tampilkan
     terhapus" filter, with a Restore action instead of Edit/Hapus.
   - Edit/Delete/Restore all carry `expectedUpdatedAt` (captured when the
     row's action was first clicked) so the service's optimistic-
     concurrency check (§12) can catch two admins editing the same record.
   - §8 Level 3: a duplicate warning banner over whatever's currently
     filtered into view, reusing the SAME findDuplicateRecords() primitive
     Closing's own validator and the Dashboard both call — never a third
     implementation of "what counts as a duplicate."
   ============================================================ */

'use strict';

import * as svc from '../overtime-service.js';
import { esc, fmtDate, fmtDateTime, rp, todayISO } from './overtime-atoms.js';
import { findDuplicateRecords } from '../overtime-closing-engine.js';

/** One getClosingStatus() lookup per DISTINCT month among the rows being
    rendered, not one per row (Sprint 10 audit: avoid duplicated queries
    when many records share the same month). */
function buildLockedMonthsMap(records) {
  const months = new Set(records.map(r => r.date.slice(0, 7)));
  const map = new Map();
  months.forEach(m => map.set(m, svc.getClosingStatus(m).status === 'closed'));
  return map;
}

function filterBar(state, units, employees) {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px">
      <input data-act="input:recordsFilterDate" type="date" value="${esc(state.recordsFilterDate || '')}"
        style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">
      <select data-act="input:recordsFilterUnitId" style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">
        <option value="">Semua Unit</option>
        ${units.map(u => `<option value="${u.id}" ${state.recordsFilterUnitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
      </select>
      <select data-act="input:recordsFilterEmployeeId" style="padding:8px 10px;border-radius:8px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13px">
        <option value="">Semua Karyawan</option>
        ${employees.map(e => `<option value="${e.id}" ${state.recordsFilterEmployeeId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text);cursor:pointer">
        <input data-act="toggleShowDeletedRecords" type="checkbox" ${state.recordsShowDeleted ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--primary)">
        Tampilkan Terhapus
      </label>
      ${(state.recordsFilterDate || state.recordsFilterUnitId || state.recordsFilterEmployeeId)
        ? `<button data-act="clearRecordsFilter" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--muted);border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer">Reset Filter</button>`
        : ''}
    </div>`;
}

function filteredRecords(state) {
  let records = svc.listAllRecords({ includeDeleted: !!state.recordsShowDeleted });
  if (state.recordsFilterDate) records = records.filter(r => r.date === state.recordsFilterDate);
  if (state.recordsFilterUnitId) records = records.filter(r => r.unitId === state.recordsFilterUnitId);
  if (state.recordsFilterEmployeeId) records = records.filter(r => r.employeeId === state.recordsFilterEmployeeId);
  return records;
}

function recordRow(r, employeeName, unitName, lockedMonths) {
  const locked = !!lockedMonths.get(r.date.slice(0, 7));
  const deleted = r.status === 'deleted';
  const actions = deleted
    ? `<button data-act="restoreRecordClick" data-id="${r.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--green);border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer">Pulihkan</button>`
    : locked
      ? `<span title="Periode ${r.date.slice(0, 7)} telah ditutup" style="font-size:11px;color:var(--muted);display:inline-flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>Terkunci</span>`
      : `<button data-act="openEditRecord" data-id="${r.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer;margin-right:6px">Edit</button>
         <button data-act="deleteRecordClick" data-id="${r.id}" type="button" style="border:1px solid var(--border);background:var(--card);color:var(--primary);border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:600;cursor:pointer">Hapus</button>`;

  return `
    <tr style="${deleted ? 'opacity:.55' : ''}">
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12.5px;white-space:nowrap">${esc(fmtDate(r.date))}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12.5px">${esc(unitName)}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12.5px">${esc(employeeName)}${deleted ? ' <span style="font-size:9.5px;font-weight:700;color:var(--primary);border:1px solid var(--border);border-radius:999px;padding:1px 6px">Terhapus</span>' : ''}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12.5px">${esc(r.tierKey)}${r.overrideApplied ? ' · override' : ''}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);font-size:12.5px;text-align:right;font-weight:700">${esc(rp(r.rateAmount))}</td>
      <td style="padding:9px 10px;border-top:1px solid var(--border);text-align:right;white-space:nowrap">${actions}</td>
    </tr>`;
}

export function renderRecordsScreen(state) {
  const units = svc.listUnits();
  const employees = svc.listEmployees();
  const unitById = new Map(units.map(u => [u.id, u]));
  const empById = new Map(employees.map(e => [e.id, e]));
  const records = filteredRecords(state);
  const lockedMonths = buildLockedMonthsMap(records);

  // §8 Level 3: duplicates among whatever's currently in view (active
  // records only — a soft-deleted duplicate isn't actionable).
  const dupeGroups = findDuplicateRecords(records.filter(r => r.status !== 'deleted'));
  const dupeBanner = dupeGroups.length
    ? `<div style="margin-top:12px;background:var(--amber-tint,#f8eed4);border:1px solid var(--amber-bd,#ecdcb2);color:var(--amber,#a9781a);border-radius:10px;padding:10px 14px;font-size:12.5px">⚠ ${dupeGroups.length} kombinasi karyawan/unit/tanggal terekam lebih dari sekali pada tampilan ini.</div>`
    : '';

  const confirmBanner = state.deleteRecordConfirmId
    ? `<div style="margin-top:10px;padding:10px 14px;background:var(--card2);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text);display:flex;align-items:center;justify-content:space-between;gap:10px">
        <span>Hapus entri ini? Klik "Hapus" sekali lagi pada baris yang sama untuk konfirmasi. Entri yang dihapus dapat dipulihkan kembali.</span>
        <button data-act="cancelDeleteRecord" type="button" style="border:none;background:none;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer">Batal</button>
      </div>`
    : '';

  const body = records.length
    ? `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow-x:auto;margin-top:14px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>${['Tanggal', 'Unit', 'Karyawan', 'Tarif', 'Nominal', ''].map((h, i) => `<th style="padding:8px 10px;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;text-align:${i === 4 ? 'right' : 'left'}">${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${records.map(r => recordRow(r, (empById.get(r.employeeId) && empById.get(r.employeeId).name) || '—', (unitById.get(r.unitId) && unitById.get(r.unitId).name) || '—', lockedMonths)).join('')}</tbody>
        </table>
      </div>`
    : `<div style="margin-top:14px;padding:30px;text-align:center;font-size:12.5px;color:var(--muted);background:var(--card);border:1px solid var(--border);border-radius:14px">Tidak ada entri yang cocok dengan filter.</div>`;

  return `
    <div style="padding:18px 0 8px">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:800">Penyesuaian Data</h2>
      <div style="font-size:13px;color:var(--muted)">Edit, hapus, atau koreksi entri yang sudah direkap — selama periode masih terbuka.</div>
    </div>
    ${filterBar(state, units, employees)}
    ${dupeBanner}
    ${confirmBanner}
    ${body}`;
}

/* ── Edit Record modal (rendered by overtime-center.js's shell(), same
   sibling-of-content pattern as unitModal/holidayModal) ── */
export function renderEditRecordModal(state) {
  const form = state.editRecordForm || {};
  const units = svc.listUnits();
  const employees = svc.listEmployees();
  const tiers = svc.listRateTiers();
  return `
    <div data-act="stop" style="position:fixed;inset:0;background:rgba(20,16,14,.55);backdrop-filter:blur(3px);z-index:1600;display:flex;align-items:center;justify-content:center;padding:20px">
      <div data-act="closeEditRecordModal" style="position:absolute;inset:0"></div>
      <div style="position:relative;background:var(--card);border-radius:16px;box-shadow:var(--shadow-lg);width:100%;max-width:420px;max-height:90vh;overflow-y:auto;padding:22px">
        <div style="font-size:15px;font-weight:800;margin-bottom:14px">Edit Entri Lembur</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <label style="font-size:12px;font-weight:700;color:var(--muted)">Karyawan
            <select data-focus="editRecordEmployeeId" data-act="statefield:editRecordForm.employeeId" autofocus style="width:100%;margin-top:4px;padding:9px 10px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
              ${employees.map(e => `<option value="${e.id}" ${form.employeeId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px;font-weight:700;color:var(--muted)">Unit
            <select data-act="statefield:editRecordForm.unitId" style="width:100%;margin-top:4px;padding:9px 10px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
              ${units.map(u => `<option value="${u.id}" ${form.unitId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px;font-weight:700;color:var(--muted)">Tanggal
            <input data-act="statefield:editRecordForm.date" type="date" value="${esc(form.date || '')}" style="width:100%;margin-top:4px;padding:9px 10px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;box-sizing:border-box">
          </label>
          <label style="font-size:12px;font-weight:700;color:var(--muted)">Tarif
            <select data-act="statefield:editRecordForm.tierKey" style="width:100%;margin-top:4px;padding:9px 10px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px">
              ${tiers.map(t => `<option value="${t.key}" ${form.tierKey === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px;font-weight:700;color:var(--muted)">Catatan (opsional)
            <input data-act="statefield:editRecordForm.overrideNote" type="text" value="${esc(form.overrideNote || '')}" style="width:100%;margin-top:4px;padding:9px 10px;border-radius:9px;border:1px solid var(--input-bd);background:var(--input);color:var(--text);font-size:13.5px;box-sizing:border-box">
          </label>
          ${form.updatedAtSnapshot ? `<div style="font-size:11px;color:var(--muted)">Terakhir diubah: ${esc(fmtDateTime(form.updatedAtSnapshot))}</div>` : ''}
          ${state.editRecordFormErr ? `<div style="color:var(--primary);font-size:12px">${esc(state.editRecordFormErr)}</div>` : ''}
          <div style="display:flex;gap:8px;margin-top:4px">
            <button data-act="submitEditRecord" type="button" style="flex:1;background:var(--primary);color:var(--primary-fg);border:none;border-radius:10px;padding:11px;font-size:13.5px;font-weight:700;cursor:pointer">Simpan</button>
            <button data-act="closeEditRecordModal" type="button" style="flex:1;border:1px solid var(--border);background:var(--card2);color:var(--text);border-radius:10px;padding:11px;font-size:13.5px;font-weight:600;cursor:pointer">Batal</button>
          </div>
        </div>
      </div>
    </div>`;
}

export const recordsActions = {
  clearRecordsFilter({ setState }) { setState({ recordsFilterDate: '', recordsFilterUnitId: '', recordsFilterEmployeeId: '' }); },
  toggleShowDeletedRecords({ state, setState }) { setState({ recordsShowDeleted: !state.recordsShowDeleted }); },

  openEditRecord({ id, setState }) {
    const r = svc.listAllRecords().find(x => x.id === id);
    if (!r) return;
    setState({
      editRecordModalOpen: true, editRecordId: id,
      // §12 Conflict Detection: captured now, sent back at save time —
      // svc.updateRecord() rejects if the record changed in the meantime.
      editRecordForm: { employeeId: r.employeeId, unitId: r.unitId, date: r.date, tierKey: r.tierKey, overrideNote: r.overrideNote || '', updatedAtSnapshot: r.updatedAt },
      editRecordFormErr: '',
    });
  },
  closeEditRecordModal({ setState }) { setState({ editRecordModalOpen: false, editRecordId: null }); },

  async submitEditRecord({ state, setState, toast }) {
    const form = state.editRecordForm || {};
    try {
      await svc.updateRecord(state.editRecordId, {
        employeeId: form.employeeId, unitId: form.unitId, date: form.date,
        tierKey: form.tierKey, overrideNote: form.overrideNote,
        expectedUpdatedAt: form.updatedAtSnapshot,
      });
      setState({ editRecordModalOpen: false, editRecordId: null });
      toast('Entri lembur diperbarui.');
    } catch (err) {
      setState({ editRecordFormErr: err.message || 'Gagal menyimpan entri.' });
    }
  },

  async deleteRecordClick({ id, state, setState, toast }) {
    if (state.deleteRecordConfirmId !== id) { setState({ deleteRecordConfirmId: id }); return; }
    try {
      const r = svc.listAllRecords().find(x => x.id === id);
      await svc.deleteRecord(id, { expectedUpdatedAt: r ? r.updatedAt : undefined });
      setState({ deleteRecordConfirmId: null });
      toast('Entri lembur dihapus — dapat dipulihkan melalui filter "Tampilkan Terhapus".');
    } catch (err) {
      setState({ deleteRecordConfirmId: null });
      toast(err.message || 'Gagal menghapus entri.');
    }
  },
  cancelDeleteRecord({ setState }) { setState({ deleteRecordConfirmId: null }); },

  async restoreRecordClick({ id, toast }) {
    try {
      const r = svc.listAllRecords({ includeDeleted: true }).find(x => x.id === id);
      await svc.restoreRecord(id, { expectedUpdatedAt: r ? r.updatedAt : undefined });
      toast('Entri lembur dipulihkan.');
    } catch (err) {
      toast(err.message || 'Gagal memulihkan entri.');
    }
  },
};
