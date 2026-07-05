/* ============================================================
   Engineering Operations — shared operational state store.
   Plain JS (loaded before Babel). Exposes window.EngStore:
   a tiny pub/sub store + domain actions, persisted to
   localStorage. Every screen subscribes to the same state so
   join / continue-tomorrow / resume / complete / verify
   mutate the whole module live.
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'sarpras.eng.state.v3';

  /* ---- static reference data ---------------------------------- */

  // Category meta — id → label, tone token, icon glyph.
  var CATEGORIES = {
    ac:       { label: 'AC / Pendingin',    tone: 'c-blue',   icon: 'fan' },
    listrik:  { label: 'Kelistrikan',       tone: 'c-amber',  icon: 'bolt' },
    plumbing: { label: 'Plumbing',          tone: 'c-teal',   icon: 'droplet' },
    pompa:    { label: 'Pompa Air',         tone: 'c-teal',   icon: 'gauge' },
    hydrant:  { label: 'Hydrant',           tone: 'crit',     icon: 'flame' },
    furnitur: { label: 'Furnitur',          tone: 'c-violet', icon: 'chair' },
    pintu:    { label: 'Pintu & Kunci',     tone: 'c-green',  icon: 'door' },
    kabinet:  { label: 'Kabinet & Engsel',  tone: 'c-violet', icon: 'box' },
    umum:     { label: 'Perbaikan Umum',    tone: 'c-neutral', icon: 'wrench' },
  };

  // Priority meta — ordered urgent → low. `rank` drives operational sort.
  var PRIORITIES = {
    kritis: { label: 'Kritis', tone: 'crit',      rank: 0 },
    tinggi: { label: 'Tinggi', tone: 'c-amber',   rank: 1 },
    sedang: { label: 'Sedang', tone: 'c-blue',    rank: 2 },
    rendah: { label: 'Rendah', tone: 'c-neutral', rank: 3 },
  };

  // Assignment lifecycle status meta.
  var STATUSES = {
    available: { label: 'Tersedia',            pill: 'sched',  rank: 1 },
    in_progress:{ label: 'Dikerjakan',         pill: 'active', rank: 0 },
    paused:    { label: 'Dilanjut Besok',      pill: 'neutral',rank: 2 },
    verify:    { label: 'Menunggu Verifikasi', pill: 'sched',  rank: 3 },
    done:      { label: 'Terverifikasi',       pill: 'done',   rank: 5 },
    postponed: { label: 'Ditunda',             pill: 'cancel', rank: 4 },
  };

  // Roster. Each member gets a stable swatch color from the data series.
  var MEMBERS = [
    { name: 'Isep Saepudin',  ini: 'IS', color: 'var(--c-blue)' },
    { name: 'Suhendra',       ini: 'SH', color: 'var(--c-green)' },
    { name: 'Dodi Kurnia',    ini: 'DK', color: 'var(--c-amber)' },
    { name: 'Bagus Priyanto', ini: 'BP', color: 'var(--c-violet)' },
    { name: 'Rahmat Hidayat', ini: 'RH', color: 'var(--c-teal)' },
    { name: 'Wawan Setiawan', ini: 'WS', color: 'var(--c-blue)' },
    { name: 'Engkos Kosasih', ini: 'EK', color: 'var(--c-green)' },
  ];

  var COORDINATOR = { name: 'Tono Sugianto', ini: 'TS', role: 'Koordinator Engineering' };
  var ADMIN = { name: 'Sri Wahyuni', ini: 'SW', role: 'Admin · Bidang Sarana' };

  function memberByName(n) {
    for (var i = 0; i < MEMBERS.length; i++) if (MEMBERS[i].name === n) return MEMBERS[i];
    return { name: n, ini: n.slice(0, 2).toUpperCase(), color: 'var(--c-neutral)' };
  }

  /* ---- time helpers ------------------------------------------- */
  function nowHHMM() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---- seed data ---------------------------------------------- */
  // Times are simulated around "Jumat, 4 Juli 2026 · 09:45".
  // worked = accumulated minutes; live=true means a session is running
  // (its start pins to load time so the working-time clock ticks).
  function seed() {
    var LOAD = Date.now();
    var mkWorker = function (name, worked, state) {
      var m = memberByName(name);
      return {
        name: m.name, ini: m.ini, color: m.color,
        worked: worked, state: state, // 'active' | 'paused' | 'done'
        startMs: state === 'active' ? LOAD : null,
      };
    };
    return {
      assignments: [
        {
          id: 'A-2041', title: 'Ganti pintu Departemen Pertandingan',
          category: 'pintu', priority: 'tinggi', status: 'in_progress',
          location: 'Gd. Pelatnas · Lt. 1 · R. Pertandingan',
          requester: 'Bidang Pertandingan', created: 'Hari ini · 09:00', target: 'Hari ini · 17:00',
          note: 'Daun pintu lepas dari engsel atas, kusen retak. Perlu penggantian daun pintu dan penyetelan ulang engsel.',
          workers: [ mkWorker('Isep Saepudin', 41, 'active'), mkWorker('Suhendra', 33, 'active') ],
          timeline: [
            { time: '09:00', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
            { time: '09:12', kind: 'start', actor: 'Isep Saepudin', label: 'Mulai mengerjakan' },
            { time: '09:20', kind: 'join', actor: 'Suhendra', label: 'Bergabung ke penugasan' },
          ],
        },
        {
          id: 'A-2038', title: 'Perbaikan pompa air Gedung Asrama',
          category: 'pompa', priority: 'kritis', status: 'in_progress',
          location: 'Gd. Asrama Atlet · Ruang Pompa B1',
          requester: 'Bidang Umum', created: 'Hari ini · 07:40', target: 'Hari ini · 12:00',
          note: 'Pompa utama mati, suplai air lantai 2–4 terhenti. Prioritas kritis — asrama terisi penuh.',
          workers: [ mkWorker('Dodi Kurnia', 88, 'active') ],
          timeline: [
            { time: '07:40', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
            { time: '07:52', kind: 'start', actor: 'Dodi Kurnia', label: 'Mulai mengerjakan' },
          ],
        },
        {
          id: 'A-2043', title: 'Pembersihan AC Ruang Rapat Utama',
          category: 'ac', priority: 'sedang', status: 'available',
          location: 'Gd. Sekretariat · Lt. 3 · R. Rapat Utama',
          requester: 'Sekretariat', created: 'Hari ini · 08:30', target: 'Hari ini · 16:00',
          note: '2 unit AC split perlu pembersihan filter dan pengecekan freon sebelum rapat pleno besok.',
          workers: [], timeline: [
            { time: '08:30', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
          ],
        },
        {
          id: 'A-2044', title: 'Ganti lampu Hall Utama',
          category: 'listrik', priority: 'tinggi', status: 'available',
          location: 'Gd. Serbaguna · Hall Utama',
          requester: 'Bidang Umum', created: 'Hari ini · 08:55', target: 'Hari ini · 15:00',
          note: '6 titik lampu high-bay mati. Perlu tangga hidrolik — koordinasikan dua orang.',
          workers: [], timeline: [
            { time: '08:55', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
          ],
        },
        {
          id: 'A-2039', title: 'Servis hydrant Lantai 2',
          category: 'hydrant', priority: 'kritis', status: 'paused',
          location: 'Gd. Pelatnas · Lt. 2 · Koridor Timur',
          requester: 'Bidang Keselamatan', created: 'Kemarin · 14:10', target: 'Hari ini · 12:00',
          note: 'Tekanan hydrant di bawah standar. Perlu penggantian selang dan uji tekanan ulang.',
          workers: [ mkWorker('Bagus Priyanto', 156, 'paused') ],
          timeline: [
            { time: 'Kemarin 14:10', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
            { time: 'Kemarin 14:35', kind: 'start', actor: 'Bagus Priyanto', label: 'Mulai mengerjakan' },
            { time: 'Kemarin 16:45', kind: 'pause', actor: 'Bagus Priyanto', label: 'Lanjutkan besok · menunggu suku cadang' },
          ],
        },
        {
          id: 'A-2035', title: 'Perbaikan engsel kabinet Sekretariat',
          category: 'kabinet', priority: 'rendah', status: 'verify',
          location: 'Gd. Sekretariat · Lt. 2 · R. Arsip',
          requester: 'Sekretariat', created: 'Hari ini · 08:05', target: 'Hari ini · 11:00',
          note: 'Engsel 3 pintu kabinet arsip kendur. Sudah dikencangkan dan diberi pelumas.',
          workers: [ mkWorker('Rahmat Hidayat', 38, 'done') ],
          timeline: [
            { time: '08:05', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
            { time: '08:18', kind: 'start', actor: 'Rahmat Hidayat', label: 'Mulai mengerjakan' },
            { time: '08:56', kind: 'complete', actor: 'Rahmat Hidayat', label: 'Menyelesaikan pekerjaan · menunggu verifikasi' },
          ],
        },
        {
          id: 'A-2046', title: 'Perbaikan meja rusak Ruang Ofisial',
          category: 'furnitur', priority: 'sedang', status: 'available',
          location: 'Gd. Pelatnas · Lt. 1 · R. Ofisial',
          requester: 'Bidang Pembinaan', created: 'Hari ini · 09:25', target: 'Besok · 12:00',
          note: 'Kaki meja rapat patah, permukaan tergores. Perlu penggantian kaki dan finishing ulang.',
          workers: [], timeline: [
            { time: '09:25', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
          ],
        },
        {
          id: 'A-2028', title: 'Perbaikan keran bocor Toilet Lobby',
          category: 'plumbing', priority: 'sedang', status: 'done',
          location: 'Gd. Utama · Lt. 1 · Toilet Lobby',
          requester: 'Bidang Umum', created: 'Hari ini · 07:10', target: 'Hari ini · 10:00',
          note: 'Keran wastafel bocor pada sambungan. Seal diganti, tidak ada rembesan.',
          workers: [ mkWorker('Wawan Setiawan', 32, 'done') ],
          timeline: [
            { time: '07:10', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
            { time: '07:22', kind: 'start', actor: 'Wawan Setiawan', label: 'Mulai mengerjakan' },
            { time: '07:54', kind: 'complete', actor: 'Wawan Setiawan', label: 'Menyelesaikan pekerjaan' },
            { time: '08:20', kind: 'verify', actor: 'Tono Sugianto', label: 'Pekerjaan diverifikasi · ditutup' },
          ],
        },
        {
          id: 'A-2021', title: 'Ganti lampu koridor Lantai 3',
          category: 'listrik', priority: 'rendah', status: 'done',
          location: 'Gd. Sekretariat · Lt. 3 · Koridor',
          requester: 'Sekretariat', created: 'Kemarin · 10:00', target: 'Kemarin · 15:00',
          note: '8 titik lampu TL diganti LED. Selesai dan terverifikasi.',
          workers: [ mkWorker('Engkos Kosasih', 46, 'done') ],
          timeline: [
            { time: 'Kemarin 10:00', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
            { time: 'Kemarin 10:24', kind: 'start', actor: 'Engkos Kosasih', label: 'Mulai mengerjakan' },
            { time: 'Kemarin 11:10', kind: 'complete', actor: 'Engkos Kosasih', label: 'Menyelesaikan pekerjaan' },
            { time: 'Kemarin 13:30', kind: 'verify', actor: 'Tono Sugianto', label: 'Pekerjaan diverifikasi · ditutup' },
          ],
        },
        {
          id: 'A-2019', title: 'Perbaikan pintu gudang peralatan',
          category: 'pintu', priority: 'rendah', status: 'postponed',
          location: 'Gd. Serbaguna · Gudang Peralatan',
          requester: 'Bidang Umum', created: 'Kemarin · 09:15', target: 'Ditunda',
          note: 'Ditunda oleh admin — menunggu pengadaan handle pintu baru.',
          workers: [], timeline: [
            { time: 'Kemarin 09:15', kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' },
            { time: 'Kemarin 09:40', kind: 'postpone', actor: 'Sri Wahyuni', label: 'Penugasan ditunda · menunggu suku cadang' },
          ],
        },
      ],
      seededAt: LOAD,
    };
  }

  /* ---- persistence + pub/sub ---------------------------------- */
  var state = load();
  var listeners = [];

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Re-pin live sessions to this load so the clock stays sane.
        var now = Date.now();
        parsed.assignments.forEach(function (a) {
          a.workers.forEach(function (w) { if (w.state === 'active') w.startMs = now; });
        });
        return parsed;
      }
    } catch (e) { /* fall through to seed */ }
    return seed();
  }

  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function emit() { persist(); listeners.forEach(function (fn) { fn(state); }); }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function getState() { return state; }

  function find(id) {
    for (var i = 0; i < state.assignments.length; i++)
      if (state.assignments[i].id === id) return state.assignments[i];
    return null;
  }

  /* ---- derived helpers ---------------------------------------- */
  function workerElapsed(w) {
    var live = w.state === 'active' && w.startMs ? (Date.now() - w.startMs) / 60000 : 0;
    return Math.round(w.worked + live);
  }
  function actualMinutes(a) {
    return a.workers.reduce(function (s, w) { return s + workerElapsed(w); }, 0);
  }
  function fmtDuration(min) {
    if (min <= 0) return '0m';
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + 'j ' : '') + m + 'm';
  }
  function recomputeStatus(a) {
    if (a.status === 'postponed' || a.status === 'done' || a.status === 'verify') return;
    var active = a.workers.filter(function (w) { return w.state === 'active'; }).length;
    var paused = a.workers.filter(function (w) { return w.state === 'paused'; }).length;
    if (active > 0) a.status = 'in_progress';
    else if (paused > 0) a.status = 'paused';
    else a.status = 'available';
  }

  /* ---- actions ------------------------------------------------ */
  function log(a, kind, actor, label) {
    a.timeline.push({ time: nowHHMM(), kind: kind, actor: actor, label: label });
  }

  var actions = {
    join: function (id, name) {
      var a = find(id); if (!a) return;
      var w = a.workers.filter(function (x) { return x.name === name; })[0];
      if (w) { w.state = 'active'; w.startMs = Date.now(); }
      else {
        var m = memberByName(name);
        a.workers.push({ name: m.name, ini: m.ini, color: m.color, worked: 0, state: 'active', startMs: Date.now() });
      }
      var first = a.workers.length === 1 || a.timeline.every(function (e) { return e.kind !== 'start'; });
      log(a, first ? 'start' : 'join', name, first ? 'Mulai mengerjakan' : 'Bergabung ke penugasan');
      recomputeStatus(a); emit();
    },
    pauseTomorrow: function (id, name) {
      var a = find(id); if (!a) return;
      var w = a.workers.filter(function (x) { return x.name === name; })[0];
      if (w && w.state === 'active') { w.worked = workerElapsed(w); w.state = 'paused'; w.startMs = null; }
      log(a, 'pause', name, 'Lanjutkan besok');
      recomputeStatus(a); emit();
    },
    resume: function (id, name) {
      var a = find(id); if (!a) return;
      var w = a.workers.filter(function (x) { return x.name === name; })[0];
      if (w) { w.state = 'active'; w.startMs = Date.now(); }
      log(a, 'resume', name, 'Melanjutkan pekerjaan');
      recomputeStatus(a); emit();
    },
    complete: function (id, name) {
      var a = find(id); if (!a) return;
      var w = a.workers.filter(function (x) { return x.name === name; })[0];
      if (w) { w.worked = workerElapsed(w); w.state = 'done'; w.startMs = null; }
      log(a, 'complete', name, 'Menyelesaikan pekerjaan');
      var allDone = a.workers.length > 0 && a.workers.every(function (x) { return x.state === 'done'; });
      if (allDone) { a.status = 'verify'; log(a, 'await', 'Sistem', 'Menunggu verifikasi koordinator'); }
      else recomputeStatus(a);
      emit();
    },
    verify: function (id, byName) {
      var a = find(id); if (!a) return;
      a.status = 'done';
      log(a, 'verify', byName, 'Pekerjaan diverifikasi · ditutup');
      emit();
    },
    postpone: function (id, byName) {
      var a = find(id); if (!a) return;
      a.status = 'postponed';
      a.workers.forEach(function (w) { if (w.state === 'active') { w.worked = workerElapsed(w); w.state = 'paused'; w.startMs = null; } });
      log(a, 'postpone', byName || 'Admin', 'Penugasan ditunda');
      emit();
    },
    reopen: function (id, byName) {
      var a = find(id); if (!a) return;
      a.status = a.workers.length ? (a.workers.some(function (w) { return w.state === 'active'; }) ? 'in_progress' : 'paused') : 'available';
      log(a, 'reopen', byName || 'Admin', 'Penugasan dibuka kembali');
      emit();
    },
    create: function (data) {
      var num = 2047 + state.assignments.filter(function (a) { return a.id.indexOf('A-20') === 0; }).length;
      var a = {
        id: 'A-' + num, title: data.title, category: data.category, priority: data.priority,
        status: 'available', location: data.location, requester: data.requester || 'Bidang Sarana',
        created: 'Baru saja', target: data.target || 'Hari ini', note: data.note || '',
        workers: [], timeline: [{ time: nowHHMM(), kind: 'publish', actor: 'Sistem', label: 'Penugasan dipublikasikan · notifikasi terkirim' }],
      };
      state.assignments.unshift(a); emit(); return a;
    },
    reset: function () { state = seed(); emit(); },
  };

  window.EngStore = {
    subscribe: subscribe, getState: getState, find: find, actions: actions,
    workerElapsed: workerElapsed, actualMinutes: actualMinutes, fmtDuration: fmtDuration,
    CATEGORIES: CATEGORIES, PRIORITIES: PRIORITIES, STATUSES: STATUSES,
    MEMBERS: MEMBERS, COORDINATOR: COORDINATOR, ADMIN: ADMIN, memberByName: memberByName,
  };
})();
