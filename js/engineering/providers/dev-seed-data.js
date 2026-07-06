/* ============================================================
   DEV-SEED-DATA.JS — Engineering Development Seed (v1.20.1)

   Builds a realistic PBSI Engineering dataset by composing the REAL engines
   (assignment-engine + verification-engine) over the REAL model — the same
   code path production uses. There is NO hand-authored assignment shape and
   NO demo layer inside the UI or business logic: every record here is produced
   by createAssignment → publish → markAvailable → join → start → finish →
   verify/postpone/continueTomorrow, exactly as a live operator would.

   Because it is generated through the engines, the seed carries authentic
   timelines, participant durations and lifecycle state. It is anchored to the
   REAL current time so live "in progress" durations read correctly (active
   workers' startedTime is offset back from now), mirroring how the module will
   behave on real data. Swapping the Development Seed adapter for the Firebase
   adapter next sprint changes nothing here.

   Scenarios cover every required case: multi-worker assignment, waiting
   verification, continue-tomorrow, postponed, completed/verified, and
   Critical / High / Normal / Low priorities.

   PURE builder: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

import { PRIORITY, STATUS, SOURCE } from '../config/engineering-config.js';
import {
  createAssignment, publishAssignment, markAvailable, joinAssignment,
  startAssignment, finishAssignment, continueTomorrowAssignment,
  postponeAssignment,
} from '../engines/assignment-engine.js';
import { verifyAssignment, completeAssignment } from '../engines/verification-engine.js';
import { serializeAssignment } from '../models/engineering-assignment.js';

const ADMIN = { id: 'sri', name: 'Sri Wahyuni' };
const COORD = { id: 'tono', name: 'Tono Sugianto' };

/** Roster used by the seed; the UI derives avatar colour/initials from name. */
export const SEED_MEMBERS = Object.freeze([
  'Isep Saepudin', 'Suhendra', 'Dodi Kurnia', 'Bagus Priyanto',
  'Rahmat Hidayat', 'Wawan Setiawan', 'Engkos Kosasih',
]);

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const workerId = (name) => name.toLowerCase().replace(/[^a-z]+/g, '-');

/**
 * The scenario table — mapped from the approved prototype seed onto the real
 * category/priority/status vocabulary. `workers` list active/finished duration
 * in minutes; `scenario` selects the lifecycle path.
 */
const SCENARIOS = [
  {
    id: 'a-2041', number: 'A-2041', scenario: 'in_progress',
    title: 'Ganti pintu Departemen Pertandingan', category: 'general-repair', priority: PRIORITY.HIGH,
    building: 'Gd. Pelatnas', room: 'R. Pertandingan', location: 'Gd. Pelatnas · Lt. 1 · R. Pertandingan',
    requester: 'Bidang Pertandingan', dueDate: 'Hari ini · 17:00', createdAgoMin: 45,
    description: 'Daun pintu lepas dari engsel atas, kusen retak. Perlu penggantian daun pintu dan penyetelan ulang engsel.',
    workers: [{ name: 'Isep Saepudin', mins: 41, active: true }, { name: 'Suhendra', mins: 33, active: true }],
  },
  {
    id: 'a-2038', number: 'A-2038', scenario: 'in_progress',
    title: 'Perbaikan pompa air Gedung Asrama', category: 'pompa', priority: PRIORITY.CRITICAL,
    building: 'Gd. Asrama Atlet', room: 'Ruang Pompa B1', location: 'Gd. Asrama Atlet · Ruang Pompa B1',
    requester: 'Bidang Umum', dueDate: 'Hari ini · 12:00', createdAgoMin: 125,
    description: 'Pompa utama mati, suplai air lantai 2–4 terhenti. Prioritas kritis — asrama terisi penuh.',
    workers: [{ name: 'Dodi Kurnia', mins: 88, active: true }],
  },
  {
    id: 'a-2043', number: 'A-2043', scenario: 'available',
    title: 'Pembersihan AC Ruang Rapat Utama', category: 'ac-maintenance', priority: PRIORITY.NORMAL,
    building: 'Gd. Sekretariat', room: 'R. Rapat Utama', location: 'Gd. Sekretariat · Lt. 3 · R. Rapat Utama',
    requester: 'Sekretariat', dueDate: 'Hari ini · 16:00', createdAgoMin: 75,
    description: '2 unit AC split perlu pembersihan filter dan pengecekan freon sebelum rapat pleno besok.',
    workers: [],
  },
  {
    id: 'a-2044', number: 'A-2044', scenario: 'available',
    title: 'Ganti lampu Hall Utama', category: 'kelistrikan', priority: PRIORITY.HIGH,
    building: 'Gd. Serbaguna', room: 'Hall Utama', location: 'Gd. Serbaguna · Hall Utama',
    requester: 'Bidang Umum', dueDate: 'Hari ini · 15:00', createdAgoMin: 50,
    description: '6 titik lampu high-bay mati. Perlu tangga hidrolik — koordinasikan dua orang.',
    workers: [],
  },
  {
    id: 'a-2039', number: 'A-2039', scenario: 'continue_tomorrow',
    title: 'Servis hydrant Lantai 2', category: 'hydrant', priority: PRIORITY.CRITICAL,
    building: 'Gd. Pelatnas', room: 'Koridor Timur', location: 'Gd. Pelatnas · Lt. 2 · Koridor Timur',
    requester: 'Bidang Keselamatan', dueDate: 'Besok · 12:00', createdAgoMin: 190,
    description: 'Tekanan hydrant di bawah standar. Perlu penggantian selang dan uji tekanan ulang.',
    reason: 'menunggu suku cadang',
    workers: [{ name: 'Bagus Priyanto', mins: 156 }],
  },
  {
    id: 'a-2035', number: 'A-2035', scenario: 'waiting_verification',
    title: 'Perbaikan engsel kabinet Sekretariat', category: 'furniture', priority: PRIORITY.LOW,
    building: 'Gd. Sekretariat', room: 'R. Arsip', location: 'Gd. Sekretariat · Lt. 2 · R. Arsip',
    requester: 'Sekretariat', dueDate: 'Hari ini · 11:00', createdAgoMin: 100,
    description: 'Engsel 3 pintu kabinet arsip kendur. Sudah dikencangkan dan diberi pelumas.',
    workers: [{ name: 'Rahmat Hidayat', mins: 38 }],
  },
  {
    id: 'a-2046', number: 'A-2046', scenario: 'available',
    title: 'Perbaikan meja rusak Ruang Ofisial', category: 'furniture', priority: PRIORITY.NORMAL,
    building: 'Gd. Pelatnas', room: 'R. Ofisial', location: 'Gd. Pelatnas · Lt. 1 · R. Ofisial',
    requester: 'Bidang Pembinaan', dueDate: 'Besok · 12:00', createdAgoMin: 20,
    description: 'Kaki meja rapat patah, permukaan tergores. Perlu penggantian kaki dan finishing ulang.',
    workers: [],
  },
  {
    id: 'a-2028', number: 'A-2028', scenario: 'verified',
    title: 'Perbaikan keran bocor Toilet Lobby', category: 'plumbing', priority: PRIORITY.NORMAL,
    building: 'Gd. Utama', room: 'Toilet Lobby', location: 'Gd. Utama · Lt. 1 · Toilet Lobby',
    requester: 'Bidang Umum', dueDate: 'Hari ini · 10:00', createdAgoMin: 155,
    description: 'Keran wastafel bocor pada sambungan. Seal diganti, tidak ada rembesan.',
    workers: [{ name: 'Wawan Setiawan', mins: 32 }],
  },
  {
    id: 'a-2021', number: 'A-2021', scenario: 'completed', yesterday: true,
    title: 'Ganti lampu koridor Lantai 3', category: 'kelistrikan', priority: PRIORITY.LOW,
    building: 'Gd. Sekretariat', room: 'Koridor', location: 'Gd. Sekretariat · Lt. 3 · Koridor',
    requester: 'Sekretariat', dueDate: 'Kemarin · 15:00',
    description: '8 titik lampu TL diganti LED. Selesai dan terverifikasi.',
    workers: [{ name: 'Engkos Kosasih', mins: 46 }],
  },
  {
    id: 'a-2019', number: 'A-2019', scenario: 'postponed', yesterday: true,
    title: 'Perbaikan pintu gudang peralatan', category: 'general-repair', priority: PRIORITY.LOW,
    building: 'Gd. Serbaguna', room: 'Gudang Peralatan', location: 'Gd. Serbaguna · Gudang Peralatan',
    requester: 'Bidang Umum', dueDate: 'Ditunda',
    description: 'Ditunda oleh admin — menunggu pengadaan handle pintu baru.',
    reason: 'menunggu pengadaan handle pintu',
    workers: [],
  },
];

/** Build one assignment by driving the engines, anchored to `base` (real now). */
function buildOne(spec, base, seq) {
  const dayBase = spec.yesterday ? base - DAY : base;
  const createdAt = new Date(dayBase - (spec.createdAgoMin || 120) * MIN);
  const iso = (t) => new Date(t).toISOString();

  const input = {
    id: spec.id, assignmentNumber: spec.number, title: spec.title,
    category: spec.category, priority: spec.priority, source: SOURCE.DIRECT,
    building: spec.building, room: spec.room, location: spec.location,
    requester: spec.requester, dueDate: spec.dueDate, description: spec.description,
    creator: ADMIN,
  };

  let a = createAssignment(input, { sequence: seq, now: createdAt, actor: ADMIN });
  a = publishAssignment(a, { actor: ADMIN, now: new Date(createdAt.getTime() + 5 * MIN) });
  a = markAvailable(a, { actor: ADMIN, recipientCount: SEED_MEMBERS.length + 1, now: new Date(createdAt.getTime() + 6 * MIN) });

  if (spec.scenario === 'available') return serializeAssignment(a);

  if (spec.scenario === 'postponed') {
    return serializeAssignment(postponeAssignment(a, {
      actor: ADMIN, reason: spec.reason, now: new Date(createdAt.getTime() + 25 * MIN),
    }));
  }

  // Workers join + start. Active workers keep running (startedTime offset back
  // from `base` so the live clock reads their elapsed minutes).
  spec.workers.forEach((w, i) => {
    const wid = workerId(w.name);
    const startAt = w.active ? new Date(base - w.mins * MIN) : new Date(dayBase - (w.mins + 20) * MIN);
    a = joinAssignment(a, { workerId: wid, name: w.name },
      { actor: { id: wid, name: w.name }, now: new Date(startAt.getTime() - 2 * MIN) });
    a = startAssignment(a, { workerId: wid, actor: { id: wid, name: w.name }, now: startAt });
  });

  if (spec.scenario === 'in_progress') return serializeAssignment(a);

  if (spec.scenario === 'continue_tomorrow') {
    const w = spec.workers[0];
    const wid = workerId(w.name);
    return serializeAssignment(continueTomorrowAssignment(a, {
      workerId: wid, actor: { id: wid, name: w.name }, reason: spec.reason, now: base,
    }));
  }

  // Finish every worker (banks their duration), landing in waiting_verification.
  spec.workers.forEach((w) => {
    const wid = workerId(w.name);
    const startAt = new Date(dayBase - (w.mins + 20) * MIN);
    a = finishAssignment(a, {
      workerId: wid, actor: { id: wid, name: w.name }, force: true,
      now: new Date(startAt.getTime() + w.mins * MIN),
    });
  });

  if (spec.scenario === 'waiting_verification') return serializeAssignment(a);

  // verified / completed — after the last finish (finish lands at dayBase − 20m)
  a = verifyAssignment(a, COORD, { notes: 'Pekerjaan sesuai standar.', now: new Date(dayBase - 12 * MIN) });
  if (spec.scenario === 'completed') a = completeAssignment(a, { actor: COORD, now: new Date(dayBase - 6 * MIN) });
  return serializeAssignment(a);
}

/**
 * Build the full seed assignment set (array of serialized assignments) anchored
 * to `now` (defaults to real current time). Generated fresh per mount in dev.
 * @param {Date|number} [now]
 * @returns {Array<Object>}
 */
export function buildDevSeedAssignments(now = Date.now()) {
  const base = now instanceof Date ? now.getTime() : now;
  return SCENARIOS.map((spec, i) => buildOne(spec, base, i + 1));
}
