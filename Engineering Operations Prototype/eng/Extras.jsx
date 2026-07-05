/* ============================================================
   Extra screens — Analytics & Pengaturan (Admin Sarpras only)
   plus shared History (Riwayat).
   Analytics stays operational (throughput, categories, rooms,
   most-active Engineering, verification queue) — not vanity
   charts. Settings prepares future architecture without
   exposing unfinished features.
   ============================================================ */
const EXK = window.SarprasOperationsDesignSystem_d29aee;

function Donut({ segments, size = 150, thickness = 22, centerLabel }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r; let off = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: `0 0 ${size}px` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map((s, i) => { const dash = c * (s.value / total); const el = <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={-off} />; off += dash; return el; })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{total}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginTop: 2 }}>{centerLabel}</div>
      </div>
    </div>
  );
}

function EngAnalytics({ onOpen }) {
  const { PageHeader, SectionHeader, Card, KPICard, BarList, InsightRow, Segmented, Button, StatusPill } = EXK;
  const S = useStore();
  const [period, setPeriod] = React.useState('bulan');
  const all = S.getState().assignments;

  const byCat = {};
  all.forEach((a) => { byCat[a.category] = (byCat[a.category] || 0) + 1; });
  const catSeg = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).slice(0, 5).map((k) => ({ label: S.CATEGORIES[k].label, value: byCat[k], color: `var(--${S.CATEGORIES[k].tone})` }));

  const byRoom = {};
  all.forEach((a) => { const room = a.location.split(' · ')[0]; byRoom[room] = (byRoom[room] || 0) + 1; });
  const roomItems = Object.keys(byRoom).map((n) => ({ name: n, value: byRoom[n] })).sort((a, b) => b.value - a.value).slice(0, 6);

  const byTech = {};
  all.forEach((a) => a.workers.forEach((w) => { byTech[w.name] = (byTech[w.name] || 0) + S.workerElapsed(w); }));
  const techItems = Object.keys(byTech).map((n) => ({ name: n, value: Math.round(byTech[n] / 60 * 10) / 10 })).sort((a, b) => b.value - a.value).slice(0, 6);

  const done = all.filter((a) => a.status === 'done');
  const verify = all.filter((a) => a.status === 'verify');
  const overdue = all.filter((a) => a.priority === 'kritis' && (a.status === 'in_progress' || a.status === 'paused'));

  return (
    <div>
      <PageHeader crumb="ANALITIK ENGINEERING" title="Analytics"
        lede="Ringkasan operasional Engineering — throughput, distribusi, dan beban tim. Khusus Admin Sarpras."
        actions={<React.Fragment>
          <Segmented value={period} onChange={setPeriod} options={[{ value: 'minggu', label: 'Minggu' }, { value: 'bulan', label: 'Bulan' }]} />
          <Button variant="primary" icon={<window.EngIcon name="download" size={15} />}>Ekspor PDF</Button>
        </React.Fragment>} />

      <div className="hm-stats" style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 24, marginBottom: 8, gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="hm-stat"><KPICard label="Task Selesai Bulan Ini" value={String(done.length + 22)} delta="+8" caption="vs lalu" /></div>
        <div className="hm-stat"><KPICard label="Overdue" value={String(overdue.length)} tone="alert" caption="lewat target" /></div>
        <div className="hm-stat"><KPICard label="Rata Penyelesaian" value="3.4" unit="jam" caption="per task" /></div>
        <div className="hm-stat"><KPICard label="Antrean Verifikasi" value={String(verify.length)} caption="menunggu" /></div>
      </div>

      <div className="level" style={{ marginTop: 54 }}>
        <SectionHeader tag="DISTRIBUSI" title="Analitik Mendalam" subtitle="Kategori, ruangan & beban tim" />
        <div className="grid g-lead">
          <Card title="Beban Engineering" subtitle="Jam kerja aktual" hoverable>
            <BarList tone="blue" items={techItems} valueFormat={(v) => `${v} jam`} />
          </Card>
          <Card title="Task per Kategori" subtitle={`${all.length} total`} hoverable>
            <div className="donut-wrap">
              <Donut segments={catSeg} centerLabel="Total" />
              <div className="legend" style={{ flex: 1 }}>
                {catSeg.map((s) => (<div className="li" key={s.label}><span className="sw" style={{ background: s.color }} />{s.label}<span className="vv">{s.value}</span></div>))}
              </div>
            </div>
          </Card>
        </div>
        <div className="grid g-2" style={{ marginTop: 'var(--gap)' }}>
          <Card title="Task per Ruangan / Gedung" subtitle="Lokasi paling sering" hoverable>
            <BarList tone="amber" items={roomItems} valueFormat={(v) => `${v} task`} />
          </Card>
          <Card title="Antrean Verifikasi" subtitle={`${verify.length} menunggu`} hoverable>
            {verify.length === 0
              ? <div style={{ padding: '20px 4px', color: 'var(--text-faint)', fontSize: 13 }}>Tidak ada antrean verifikasi.</div>
              : verify.concat(done.slice(0, 3)).map((a, i) => (
                <div key={a.id} onClick={() => onOpen(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderTop: i ? '1px solid var(--border-faint)' : 'none', cursor: 'pointer' }}>
                  <window.CatTile cat={a.category} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.title}</div><div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{S.fmtDuration(S.actualMinutes(a))} kerja</div></div>
                  <StatusPill status={a.status === 'verify' ? 'sched' : 'done'}>{a.status === 'verify' ? 'Menunggu' : 'Selesai'}</StatusPill>
                </div>
              ))}
          </Card>
        </div>
        <div style={{ marginTop: 'var(--gap)' }}>
          <Card title="Wawasan Operasional" subtitle="Dihasilkan dari data Engineering">
            <InsightRow severity="crit" title="1 penugasan kritis melewati target" description="Perbaikan pompa air Gedung Asrama melewati target 12:00 — suplai air asrama masih terganggu." />
            <InsightRow severity="warn" title="Kategori Kelistrikan meningkat" description="Beban kelistrikan naik bulan ini — pertimbangkan stok lampu untuk permintaan berulang." />
            <InsightRow severity="good" title="Waktu verifikasi membaik" description="Rata-rata dari penyelesaian ke verifikasi turun ke 1.8 jam dari 2.4 jam periode lalu." />
            <InsightRow severity="info" title="Prediksi pemeliharaan (segera)" description="Model preventive maintenance akan memperkirakan servis AC & hydrant berikutnya — placeholder arsitektur." />
          </Card>
        </div>
      </div>
    </div>
  );
}

function EngHistory({ role, me, onOpen }) {
  const { PageHeader, SectionHeader, Card, SearchInput, DataTable, StatusPill } = EXK;
  const S = useStore();
  const [q, setQ] = React.useState('');
  const personal = role === 'member';
  let rows = S.getState().assignments.filter((a) => a.status === 'done' || a.status === 'postponed');
  if (personal) rows = rows.filter((a) => a.workers.some((w) => w.name === me));
  if (q) rows = rows.filter((a) => (a.title + a.location + a.id).toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader crumb="ENGINEERING OPERATIONS" title={personal ? 'Riwayat Saya' : 'Riwayat'}
        lede={personal ? 'Penugasan yang pernah Anda kerjakan dan telah ditutup.' : 'Arsip penugasan yang telah diverifikasi atau ditunda — jejak operasional lengkap.'} />
      <div className="filterbar" style={{ marginTop: 8, marginBottom: 20 }}>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari riwayat…" width={320} />
      </div>
      <Card pad={false} style={{ padding: '20px 24px' }}>
        <DataTable
          onRowClick={(r) => onOpen(r.id)}
          columns={[
            { key: 'title', label: 'Penugasan', render: (v, r) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: `var(--${S.CATEGORIES[r.category].tone})`, flex: '0 0 8px' }} />{v}
              </span>) },
            { key: 'location', label: 'Lokasi', render: (v) => v.split(' · ')[0] },
            { key: 'workers', label: 'Engineering', render: (v) => v.map((w) => w.name.split(' ')[0]).join(', ') || '—' },
            { key: 'mins', label: 'Waktu Kerja', align: 'right', mono: true, render: (v, r) => S.fmtDuration(S.actualMinutes(r)) },
            { key: 'status', label: 'Status', render: (v, r) => <StatusPill status={S.STATUSES[r.status].pill}>{S.STATUSES[r.status].label}</StatusPill> },
          ]}
          rows={rows} minWidth={720} />
      </Card>
    </div>
  );
}

function EngSettings() {
  const { PageHeader, SectionHeader, Card, Button, StatusPill, Badge } = EXK;
  const S = window.EngStore;
  const Toggle = ({ on }) => <span style={{ width: 42, height: 25, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--surface-3)', position: 'relative', flex: 'none' }}><span style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 19, height: 19, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)' }} /></span>;
  const Row = ({ title, sub, control }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 0', borderTop: '1px solid var(--border-faint)' }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div></div>
      {control}
    </div>
  );
  const Manage = () => <Button size="sm" variant="ghost" icon={<window.EngIcon name="arrow-right" size={14} />}>Kelola</Button>;

  const rooms = ['Gd. Pelatnas', 'Gd. Asrama Atlet', 'Gd. Sekretariat', 'Gd. Serbaguna', 'Gd. Utama'];
  const cats = Object.keys(S.CATEGORIES);
  const future = [
    { t: 'Spare Parts', d: 'Inventaris & permintaan suku cadang' },
    { t: 'SLA & Target Waktu', d: 'Batas waktu penyelesaian per severity' },
    { t: 'Bidang Request', d: 'Permintaan perbaikan lintas bidang' },
    { t: 'Preventive Maintenance', d: 'Jadwal pemeliharaan berkala otomatis' },
  ];

  return (
    <div>
      <PageHeader crumb="ENGINEERING OPERATIONS" title="Pengaturan"
        lede="Konfigurasi operasional Engineering. Khusus Admin Sarpras." />

      <div className="level" style={{ marginTop: 20 }}>
        <SectionHeader tag="MASTER DATA" title="Data Operasional" />
        <div className="grid g-3">
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 14, fontWeight: 700 }}>Daftar Ruangan</div><Manage /></div>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 14px' }}>{rooms.length} gedung terdaftar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{rooms.map((r) => <Badge key={r} tone="neutral">{r}</Badge>)}</div>
          </Card>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 14, fontWeight: 700 }}>Kategori</div><Manage /></div>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 14px' }}>{cats.length} kategori pekerjaan</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{cats.slice(0, 6).map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: `var(--${S.CATEGORIES[k].tone})` }}><window.EngIcon name={S.CATEGORIES[k].icon} size={14} />{S.CATEGORIES[k].label}</span>)}</div>
          </Card>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 14, fontWeight: 700 }}>Severity</div><Manage /></div>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 14px' }}>Tingkat prioritas penugasan</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{Object.keys(S.PRIORITIES).map((k) => <window.PriorityTag key={k} priority={k} mono={false} />)}</div>
          </Card>
        </div>
      </div>

      <div className="level">
        <SectionHeader tag="NOTIFIKASI" title="Reminder & Notification Rules" />
        <Card style={{ padding: '8px 24px' }}>
          <Row title="Notifikasi penugasan baru" sub="Kirim ke Koordinator Engineering + SELURUH Engineering saat dipublikasikan" control={<Toggle on />} />
          <Row title="Pengingat penugasan kritis" sub="Peringatan berkala untuk penugasan prioritas kritis" control={<Toggle on />} />
          <Row title="Pengingat pekerjaan tertunda" sub="Ingatkan pekerjaan ‘dilanjut besok’ pada pagi hari" control={<Toggle on />} />
          <Row title="Ringkasan harian" sub="Kirim ringkasan operasional pukul 17:00 setiap hari" control={<Toggle />} />
        </Card>
      </div>

      <div className="level">
        <SectionHeader tag="ATURAN KERJA" title="Operasional" />
        <Card style={{ padding: '8px 24px' }}>
          <Row title="Izinkan beberapa Engineering per penugasan" sub="Beberapa anggota dapat bergabung ke satu pekerjaan" control={<Toggle on />} />
          <Row title="Wajib verifikasi" sub="Penugasan hanya ditutup setelah diverifikasi Koordinator / Admin" control={<Toggle on />} />
          <Row title="Catat waktu kerja aktual" sub="Rekam durasi per sesi kerja tiap anggota" control={<Toggle on />} />
        </Card>
      </div>

      <div className="level">
        <SectionHeader tag="ROADMAP" title="Arsitektur Mendatang" subtitle="Disiapkan, belum aktif" />
        <div className="grid g-2">
          {future.map((f) => (
            <Card key={f.t} style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14, opacity: 0.92 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-2)', color: 'var(--text-faint)', display: 'grid', placeItems: 'center', flex: 'none' }}><window.EngIcon name="layers" size={18} /></span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{f.t}</div><div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{f.d}</div></div>
              <StatusPill status="cancel">Segera</StatusPill>
            </Card>
          ))}
        </div>
      </div>

      <div className="level">
        <Button variant="ghost" icon={<window.EngIcon name="reset" size={15} />} onClick={() => S.actions.reset()}>Reset data demo</Button>
      </div>
    </div>
  );
}

Object.assign(window, { EngAnalytics, EngHistory, EngSettings });
