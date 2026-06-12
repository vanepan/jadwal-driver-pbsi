/* ============================================================
   deep.jsx — Level 3 Deep Analytics
   Progressive disclosure via a segmented control. Each tab leads
   with one primary chart; supporting charts add context.
   Exposes: DeepAnalytics, DEEP_TABS
   ============================================================ */

const DEEP_TABS = [
  { id: 'trends',       label: 'Ikhtisar',  icon: 'pulse' },
  { id: 'driver',       label: 'Driver',    icon: 'user' },
  { id: 'vehicle',      label: 'Kendaraan', icon: 'car' },
  { id: 'bidang',       label: 'Bidang',    icon: 'building' },
  { id: 'intelligence', label: 'Intelijen', icon: 'sparkle' },
];

const trendLegend = (
  <span className="legend" style={{ marginRight: 6 }}>
    <span className="li" style={{ fontSize: 11.5 }}><span className="sw" style={{ background: 'var(--accent)' }} />Penugasan</span>
    <span className="li" style={{ fontSize: 11.5 }}><span className="sw" style={{ background: 'var(--text-faint)' }} />Selesai</span>
  </span>
);

/* ---------------- Panels ---------------- */
function TrendsPanel({ D, f, anim, onSlice }) {
  const peak = Math.max(...D.trend.map((t) => t.value));
  return (
    <div className="stack">
      <div className="grid g-lead">
        <Card lead title="Tren Penugasan" sub="Volume harian · 30 hari" tools={trendLegend}>
          <AreaChart data={D.trend} height={290} anim={anim} />
          <div className="statrow">
            <Stat label="Total periode" value={`${D.totalAssign}`} />
            <Stat label="Puncak harian" value={`${peak}`} />
            <Stat label="Rata-rata / hari" value={(D.totalAssign / 30).toFixed(1)} />
            <Stat label="Tren" value="+12,4%" tone="up" />
          </div>
        </Card>
        <Card title="Distribusi Status" sub="Penugasan · 30 hari">
          <Donut data={D.status} centerLabel="Total" onSlice={onSlice} />
        </Card>
      </div>
      <Card title="Siklus Hidup Penugasan" sub="Dibuat → Disetujui → Dimulai → Selesai">
        <Funnel data={D.lifecycle} />
      </Card>
    </div>
  );
}

function DriverPanel({ f, onPick }) {
  return (
    <div className="stack">
      <Card lead title="Distribusi Beban Driver" sub={`${f.drivers.length} driver · penugasan ditangani`}>
        <HBarList items={f.drivers} valueKey="assignments" color="var(--accent)" onPick={(d) => onPick('driver', d.name)} />
      </Card>
      <Card title="Peringkat Jarak Driver" sub="Akumulasi km · 30 hari">
        <HBarList items={f.drivers} valueKey="distance" color="var(--c-violet)" unit=" km" onPick={(d) => onPick('driver', d.name)} />
      </Card>
    </div>
  );
}

function VehiclePanel({ f, onPick }) {
  return (
    <div className="stack">
      <Card lead title="Utilisasi Armada" sub="Persentase utilisasi per kendaraan">
        <HBarList items={f.vehicles} valueKey="util" max={1} color="var(--c-blue)"
          fmt={(v) => Math.round(v * 100)} unit="%" onPick={(d) => onPick('vehicle', d.name)} />
      </Card>
      <Card title="Peringkat Jarak Kendaraan" sub="km · odometer">
        <HBarList items={f.vehicles} valueKey="distance" color="var(--c-teal)" unit=" km" onPick={(d) => onPick('vehicle', d.name)} />
      </Card>
      <Card title="Ikhtisar Utilisasi Sumber Daya" sub="Seluruh armada kendaraan">
        <UtilGrid items={f.vehicles} />
      </Card>
    </div>
  );
}

function BidangPanel({ D, f, onPick }) {
  return (
    <div className="stack">
      <Card lead title="Konsumsi Jarak per Bidang" sub="Permintaan & jarak tempuh per departemen">
        <RankTable
          cols={[
            { label: '#', render: (r, i) => <span className="mono muted">{i + 1}</span> },
            { label: 'Bidang', key: 'short', primary: true },
            { label: '', key: 'distance', bar: true, color: 'var(--accent-line)' },
            { label: 'Permintaan', key: 'requests', num: true },
            { label: 'Jarak', key: 'distance', num: true, fmt: (v) => fmtKm(v) + ' km' },
            { label: 'Rata-rata', num: true, render: (r) => <span>{Math.round(r.distance / r.requests)} km</span> },
          ]}
          rows={f.bidang} onPick={(b) => onPick('bidang', b.short)} />
      </Card>
      <div className="grid g-2">
        <Card title="Peringkat Bidang Teratas" sub="Berdasarkan jumlah permintaan">
          <HBarList items={f.bidang} valueKey="requests" labelKey="short" color="var(--accent)" onPick={(b) => onPick('bidang', b.short)} />
        </Card>
        <Card title="Tujuan Teratas" sub="Berdasarkan jarak tempuh">
          <DestList items={D.destinations} onPick={(d) => onPick('destination', d.name)} />
        </Card>
      </div>
    </div>
  );
}

function IntelligencePanel({ D, onPick }) {
  const score = useCountUp(D.health.score, { enabled: true });
  return (
    <div className="stack">
      <div className="grid g-lead">
        <Card lead title="Wawasan Operasional" sub="Dihasilkan otomatis dari data"
          tools={<span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 700, display: 'inline-flex', gap: 5, alignItems: 'center', marginRight: 4 }}><Icon name="sparkle" size={12} fill /> Auto</span>}>
          <InsightList items={D.insights} />
        </Card>
        <Card title="Skor Kesehatan" sub="Komposit · 30 hari">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{ position: 'relative' }}>
              <RingGauge value={D.health.score / 100} size={132} thickness={11} color="var(--c-green)" />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 42, letterSpacing: '-0.03em', lineHeight: 1 }}>{Math.round(score)}</span>
                <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700, marginTop: 3 }}>{D.health.grade}</span>
              </div>
            </div>
          </div>
          <HealthDetail health={D.health} />
        </Card>
      </div>

      <AiCard />
    </div>
  );
}

/* ---------------- Deep Analytics shell ---------------- */
function DeepAnalytics({ data, f, anim, tab, setTab, onPick, onSlice }) {
  const D = data;
  const ref = useRef(null);
  return (
    <section className="level" id="deep" ref={ref}>
      <div className="deep-head">
        <div className="titleblock">
          <h2>Analitik Mendalam</h2>
          <p>Pilih area untuk analisis terperinci — seluruh data tetap tersedia.</p>
        </div>
        <div className="seg" role="tablist">
          {DEEP_TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} role="tab" aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}>
              <span className="ic"><Icon name={t.icon} size={14} /></span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="deep-panel" key={tab}>
        {tab === 'trends'       && <TrendsPanel D={D} f={f} anim={anim} onSlice={onSlice} />}
        {tab === 'driver'       && <DriverPanel f={f} onPick={onPick} />}
        {tab === 'vehicle'      && <VehiclePanel f={f} onPick={onPick} />}
        {tab === 'bidang'       && <BidangPanel D={D} f={f} onPick={onPick} />}
        {tab === 'intelligence' && <IntelligencePanel D={D} onPick={onPick} />}
      </div>
    </section>
  );
}

Object.assign(window, { DeepAnalytics, DEEP_TABS });
