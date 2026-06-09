/* ============================================================
   data.jsx — representative operational dataset
   Real entities preserved (Igo, Innova, Bidang Perencanaan
   Strategis); volumes scaled to a believable 30-day window so
   the dashboard reads enterprise-grade.
   Exposed on window.DATA
   ============================================================ */

(function () {
  // ---- Assignment status distribution (30d) ----
  const status = [
    { key: 'done',   label: 'Selesai',         value: 218, color: 'var(--st-done)' },
    { key: 'active', label: 'Berlangsung',     value: 14,  color: 'var(--st-active)' },
    { key: 'sched',  label: 'Dijadwalkan',     value: 11,  color: 'var(--st-sched)' },
    { key: 'cancel', label: 'Dibatalkan',      value: 4,   color: 'var(--st-cancel)' },
  ];
  const totalAssign = status.reduce((a, b) => a + b.value, 0); // 247

  // ---- 30-day assignment trend ----
  const trend = (() => {
    const base = [5,6,4,7,9,8,6,10,9,11,8,7,9,12,10,8,11,13,10,9,12,11,9,13,12,10,11,9,8,10];
    const today = new Date(2026, 5, 9); // 9 Jun 2026
    return base.map((v, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (base.length - 1 - i));
      return {
        date: d,
        label: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        value: v,
        completed: Math.max(0, v - (i % 7 === 0 ? 2 : i % 5 === 0 ? 1 : 0)),
      };
    });
  })();

  // ---- Lifecycle funnel ----
  const lifecycle = [
    { key: 'created',   label: 'Dibuat',      value: 247 },
    { key: 'approved',  label: 'Disetujui',   value: 241 },
    { key: 'started',   label: 'Dimulai',     value: 232 },
    { key: 'completed', label: 'Selesai',     value: 218 },
  ];

  // ---- Drivers (workload + distance) ----
  const drivers = [
    { name: 'Igo',       assignments: 28, distance: 2410, util: 0.92 },
    { name: 'Bayu',      assignments: 24, distance: 2180, util: 0.84 },
    { name: 'Rendi',     assignments: 22, distance: 1960, util: 0.80 },
    { name: 'Hasan',     assignments: 20, distance: 1740, util: 0.74 },
    { name: 'Dewi',      assignments: 18, distance: 1520, util: 0.69 },
    { name: 'Surya',     assignments: 16, distance: 1380, util: 0.63 },
    { name: 'Anwar',     assignments: 14, distance: 1190, util: 0.57 },
    { name: 'Putra',     assignments: 12, distance: 980,  util: 0.49 },
    { name: 'Fajar',     assignments: 9,  distance: 760,  util: 0.41 },
    { name: 'Eko',       assignments: 7,  distance: 540,  util: 0.34 },
    { name: 'Lukman',    assignments: 5,  distance: 420,  util: 0.27 },
    { name: 'Yusuf',     assignments: 3,  distance: 260,  util: 0.18 },
  ];

  // ---- Vehicles (utilization + distance) ----
  const vehicles = [
    { name: 'Innova',      plate: 'B 1432 PBS', assignments: 31, distance: 3120, util: 0.94 },
    { name: 'Fortuner',    plate: 'B 1180 PBS', assignments: 26, distance: 2680, util: 0.86 },
    { name: 'Hiace',       plate: 'B 7721 PBS', assignments: 22, distance: 2410, util: 0.78 },
    { name: 'Avanza',      plate: 'B 2290 PBS', assignments: 20, distance: 1980, util: 0.71 },
    { name: 'Pajero',      plate: 'B 1567 PBS', assignments: 17, distance: 1760, util: 0.64 },
    { name: 'Xenia',       plate: 'B 3398 PBS', assignments: 14, distance: 1340, util: 0.55 },
    { name: 'Elf',         plate: 'B 9043 PBS', assignments: 11, distance: 1120, util: 0.46 },
    { name: 'CR-V',        plate: 'B 2671 PBS', assignments: 8,  distance: 720,  util: 0.33 },
  ];

  // ---- Bidang (departments) ----
  const bidang = [
    { name: 'Bidang Perencanaan Strategis', short: 'Perencanaan Strategis', requests: 46, distance: 4120 },
    { name: 'Bidang Pembinaan Prestasi',    short: 'Pembinaan Prestasi',    requests: 41, distance: 3680 },
    { name: 'Bidang Umum & Logistik',       short: 'Umum & Logistik',       requests: 34, distance: 2940 },
    { name: 'Bidang Hubungan Internasional',short: 'Hub. Internasional',    requests: 28, distance: 2510 },
    { name: 'Bidang Hukum & Organisasi',    short: 'Hukum & Organisasi',    requests: 22, distance: 1760 },
    { name: 'Bidang Media & Humas',         short: 'Media & Humas',         requests: 19, distance: 1480 },
    { name: 'Bidang Keuangan',              short: 'Keuangan',              requests: 16, distance: 1120 },
    { name: 'Bidang SDM',                   short: 'SDM',                   requests: 14, distance: 920 },
  ];

  // ---- Top destinations ----
  const destinations = [
    { name: 'Pelatnas Cipayung',          trips: 62, distance: 3840 },
    { name: 'Bandara Soekarno-Hatta',     trips: 38, distance: 4210 },
    { name: 'Kantor PBSI Senayan',        trips: 34, distance: 1280 },
    { name: 'GOR Asia Afrika, Bandung',   trips: 21, distance: 3060 },
    { name: 'Istora Senayan',             trips: 18, distance: 640 },
    { name: 'Hotel Sultan, Jakarta',      trips: 14, distance: 520 },
  ];

  // ---- KPIs (executive overview) ----
  const totalDistance = vehicles.reduce((a, v) => a + v.distance, 0);
  const kpis = [
    { id: 'total',  label: 'Total Penugasan',      value: totalAssign, fmt: 'int',  trend: +12.4, sub: 'vs 30 hari lalu', icon: 'clipboard' },
    { id: 'compl',  label: 'Tingkat Penyelesaian', value: 94.3, fmt: 'pct1',        trend: +2.1,  sub: '218 dari 247 selesai', icon: 'check' },
    { id: 'drv',    label: 'Driver Bertugas',      value: 12, fmt: 'int',           trend: 0,     sub: 'dari 14 driver aktif', icon: 'user' },
    { id: 'util',   label: 'Utilisasi Kendaraan',  value: 78, fmt: 'pct0',          trend: +6.3,  sub: 'rata-rata armada', icon: 'truck' },
    { id: 'dist',   label: 'Total Jarak Tempuh',   value: totalDistance, fmt: 'km', trend: +9.8,  sub: 'akumulasi odometer', icon: 'route' },
    { id: 'avg',    label: 'Rata-rata Jarak / Tugas', value: +(totalDistance/totalAssign).toFixed(1), fmt: 'km1', trend: -1.6, sub: 'per penugasan', icon: 'gauge' },
    { id: 'topd',   label: 'Driver Paling Aktif',  entity: 'Igo',  entityVal: '28 penugasan', icon: 'star' },
    { id: 'topb',   label: 'Bidang Permintaan Tertinggi', entity: 'Perencanaan Strategis', entityVal: '46 permintaan', icon: 'building' },
  ];

  // ---- Operational health score ----
  const health = {
    score: 86,
    grade: 'Sehat',
    metrics: [
      { nm: 'Keseimbangan beban driver', vv: '72%', tone: 'warn' },
      { nm: 'Penyelesaian tepat waktu',  vv: '94%', tone: 'good' },
      { nm: 'Utilisasi armada',          vv: '78%', tone: 'good' },
      { nm: 'Tingkat pembatalan',        vv: '1.6%', tone: 'good' },
    ],
  };

  // ---- Auto insights ----
  const insights = [
    { sev: 'crit',  ib: 'crit', title: 'Ketimpangan beban driver', sevLabel: 'Kritis',
      desc: 'Igo menangani 28 penugasan — 3.4× lebih banyak dari rata-rata 5 driver terbawah. Pertimbangkan redistribusi.' },
    { sev: 'warn',  ib: 'warn', title: 'Kendaraan over-utilisasi', sevLabel: 'Perhatian',
      desc: 'Innova berada di 94% utilisasi (3.120 km). Risiko jadwal perawatan terlewat dalam ~2 minggu.' },
    { sev: 'info',  ib: 'info', title: 'Bidang permintaan tinggi', sevLabel: 'Info',
      desc: 'Perencanaan Strategis & Pembinaan Prestasi menyumbang 35% total permintaan bulan ini.' },
    { sev: 'warn',  ib: 'warn', title: 'Konsentrasi jarak', sevLabel: 'Perhatian',
      desc: '3 tujuan teratas menyerap 56% total jarak tempuh. Peluang konsolidasi rute ke Cipayung.' },
    { sev: 'good',  ib: 'good', title: 'Tren konsumsi sumber daya', sevLabel: 'Positif',
      desc: 'Rata-rata jarak per tugas turun 1.6% — efisiensi rute membaik dibanding periode sebelumnya.' },
  ];

  // ---- Future roadmap modules ----
  const roadmap = [
    { title: 'Analitik Prediktif',     desc: 'Prakiraan permintaan & beban driver 7–30 hari ke depan.', badge: 'Q3 2026', icon: 'trend' },
    { title: 'Prediksi Perawatan',     desc: 'Estimasi servis kendaraan berbasis odometer & utilisasi.', badge: 'Q3 2026', icon: 'wrench' },
    { title: 'Analitik Biaya',         desc: 'Biaya operasional per tugas, bidang, dan kendaraan.',     badge: 'Q4 2026', icon: 'coin' },
    { title: 'Demand Forecasting',     desc: 'Pola musiman permintaan transportasi antar-bidang.',      badge: 'Q4 2026', icon: 'chart' },
  ];

  window.DATA = {
    status, totalAssign, trend, lifecycle, drivers, vehicles, bidang,
    destinations, kpis, health, insights, roadmap, totalDistance,
  };
})();
