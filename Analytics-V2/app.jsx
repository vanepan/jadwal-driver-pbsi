/* ============================================================
   app.jsx — dashboard composition, layouts, tweaks, mount
   ============================================================ */

const D = window.DATA;

/* accent palettes for the tweak */
const ACCENTS = {
  merah:  { a: '#db4f48', a2: '#ef6259', weak: 'rgba(219,79,72,0.14)', line: 'rgba(219,79,72,0.34)' },
  indigo: { a: '#5b6ef0', a2: '#7d8cf6', weak: 'rgba(91,110,240,0.15)', line: 'rgba(91,110,240,0.36)' },
  teal:   { a: '#2bb3aa', a2: '#41c8bf', weak: 'rgba(43,179,170,0.15)', line: 'rgba(43,179,170,0.36)' },
  amber:  { a: '#cf9233', a2: '#e3a948', weak: 'rgba(207,146,51,0.15)', line: 'rgba(207,146,51,0.36)' },
};

function applyAccent(key) {
  const p = ACCENTS[key] || ACCENTS.merah;
  const r = document.documentElement.style;
  r.setProperty('--accent', p.a);
  r.setProperty('--accent-2', p.a2);
  r.setProperty('--accent-weak', p.weak);
  r.setProperty('--accent-line', p.line);
}

/* ---------------- toast ---------------- */
function Toast({ msg, onDone }) {
  useEffect(() => { if (!msg) return; const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
      background: 'var(--panel-3)', border: '1px solid var(--border-strong)', borderRadius: 11,
      padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600,
      boxShadow: '0 18px 50px -16px rgba(0,0,0,0.85)',
    }} className="fade-up">
      <span style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(63,178,127,0.15)', color: 'var(--st-done)', display: 'grid', placeItems: 'center' }}>
        <Icon name="check" size={14} />
      </span>
      {msg}
    </div>
  );
}

/* ============================================================
   CARD CONTENT BUILDERS (shared by both layouts)
   ============================================================ */
function useFiltered(state, drill) {
  return useMemo(() => {
    let drivers = D.drivers, vehicles = D.vehicles, bidang = D.bidang, dest = D.destinations;
    if (state.driver !== 'all') drivers = drivers.filter((d) => d.name === state.driver);
    if (state.vehicle !== 'all') vehicles = vehicles.filter((v) => v.name === state.vehicle);
    if (state.bidang !== 'all') bidang = bidang.filter((b) => b.short === state.bidang);
    return { drivers, vehicles, bidang, dest };
  }, [state]);
}

function TrendCard({ anim }) {
  const peak = Math.max(...D.trend.map((t) => t.value));
  return (
    <Card title="Tren Penugasan" sub="Volume harian · 30 hari"
      tools={<span className="legend" style={{ marginRight: 4 }}>
        <span className="li" style={{ fontSize: 11 }}><span className="sw" style={{ background: 'var(--accent)' }} />Penugasan</span>
        <span className="li" style={{ fontSize: 11 }}><span className="sw" style={{ background: 'var(--text-faint)' }} />Selesai</span>
      </span>}>
      <AreaChart data={D.trend} height={250} anim={anim} />
      <div style={{ display: 'flex', gap: 22, marginTop: 6, flexWrap: 'wrap' }}>
        <Stat label="Total periode" value={`${D.totalAssign}`} />
        <Stat label="Puncak harian" value={`${peak}`} />
        <Stat label="Rata-rata / hari" value={(D.totalAssign / 30).toFixed(1)} />
        <Stat label="Tren" value="+12.4%" tone="up" />
      </div>
    </Card>
  );
}
function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, marginTop: 3, color: tone === 'up' ? 'var(--st-done)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

function StatusCard({ onSlice }) {
  return (
    <Card title="Distribusi Status Penugasan" sub="Periode 30 hari">
      <Donut data={D.status} centerLabel="Total" onSlice={onSlice} />
    </Card>
  );
}

function LifecycleCard() {
  return (
    <Card title="Siklus Hidup Penugasan" sub="Dibuat → Selesai">
      <Funnel data={D.lifecycle} />
    </Card>
  );
}

function DriverWorkloadCard({ data, onPick }) {
  return (
    <Card title="Distribusi Beban Driver" sub={`${data.length} driver · penugasan`}>
      <HBarList items={data} valueKey="assignments" color="var(--accent)" onPick={onPick} />
    </Card>
  );
}
function VehicleUtilCard({ data, onPick }) {
  return (
    <Card title="Utilisasi Kendaraan" sub="% utilisasi armada">
      <HBarList items={data} valueKey="util" max={1} color="var(--c-blue)" onPick={onPick}
        fmt={(v) => Math.round(v * 100)} unit="%" />
    </Card>
  );
}
function DriverDistCard({ data, onPick }) {
  return (
    <Card title="Peringkat Jarak Driver" sub="km · 30 hari">
      <HBarList items={data} valueKey="distance" color="var(--c-violet)" onPick={onPick} unit=" km" />
    </Card>
  );
}
function VehicleDistCard({ data, onPick }) {
  return (
    <Card title="Peringkat Jarak Kendaraan" sub="km · odometer">
      <HBarList items={data} valueKey="distance" color="var(--c-teal)" onPick={onPick} unit=" km" />
    </Card>
  );
}

function BidangConsumptionCard({ data, onPick }) {
  return (
    <Card title="Konsumsi Jarak per Bidang" sub="Permintaan & jarak tempuh">
      <RankTable
        cols={[
          { label: '#', render: (r, i) => <span className="mono muted">{i + 1}</span> },
          { label: 'Bidang', key: 'short', primary: true },
          { label: '', key: 'distance', bar: true, color: 'var(--accent-line)' },
          { label: 'Permintaan', key: 'requests', num: true },
          { label: 'Jarak', key: 'distance', num: true, fmt: (v) => fmtKm(v) + ' km' },
          { label: 'Rata-rata', num: true, render: (r) => <span>{Math.round(r.distance / r.requests)} km</span> },
        ]}
        rows={data} onPick={onPick} />
    </Card>
  );
}

function TopBidangCard({ data, onPick }) {
  const mx = Math.max(...data.map((b) => b.requests));
  return (
    <Card title="Peringkat Bidang Teratas" sub="Berdasarkan permintaan">
      <div className="hbars">
        {data.slice(0, 6).map((b, i) => (
          <div className="hbar" key={i} style={{ gridTemplateColumns: '1fr auto' }} onClick={() => onPick && onPick(b)}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600, display: 'flex', gap: 8 }}>
                  <span className="rank">{i + 1}</span>{b.short}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.requests}</span>
              </div>
              <div className="track" style={{ height: 8 }}>
                <div className="fill" style={{ width: `${(b.requests / mx) * 100}%`, height: '100%',
                  background: `linear-gradient(90deg, var(--accent), color-mix(in oklch, var(--accent) 65%, #000))` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DestCard({ data, onPick }) {
  return (
    <Card title="Tujuan Teratas" sub="Berdasarkan jarak tempuh">
      <DestList items={data} onPick={onPick} />
    </Card>
  );
}

function UtilOverviewCard({ data }) {
  return (
    <Card title="Ikhtisar Utilisasi Sumber Daya" sub="Armada kendaraan · % utilisasi">
      <UtilGrid items={data} />
    </Card>
  );
}

function InsightsCard() {
  return (
    <Card title="Wawasan Operasional" sub="Dihasilkan otomatis dari data"
      tools={<span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 700, display: 'inline-flex', gap: 5, alignItems: 'center', marginRight: 4 }}><Icon name="sparkle" size={12} fill /> Auto</span>}>
      <InsightList items={D.insights} />
    </Card>
  );
}

/* ============================================================
   LAYOUT: SECTIONS
   ============================================================ */
function SectionsView({ state, anim, onPick, onSlice }) {
  const f = useFiltered(state);
  return (
    <>
      <section className="sec">
        <SectionHead n="01" title="Ikhtisar Eksekutif" sub="Indikator kinerja utama" />
        <div className="grid g-kpi">
          {D.kpis.map((k) => <KpiCard key={k.id} kpi={k} anim={anim} />)}
        </div>
      </section>

      <section className="sec">
        <SectionHead n="02" title="Visualisasi Eksekutif" sub="Tren & komposisi" />
        <div className="grid g-2" style={{ marginBottom: 'var(--gap)' }}>
          <TrendCard anim={anim} />
          <StatusCard onSlice={onSlice} />
        </div>
        <div className="grid g-2e">
          <HealthCard health={D.health} anim={anim} />
          <LifecycleCard />
        </div>
      </section>

      <section className="sec">
        <SectionHead n="03" title="Analitik Sumber Daya Operasional" sub="Beban & utilisasi" />
        <div className="grid g-2e" style={{ marginBottom: 'var(--gap)' }}>
          <DriverWorkloadCard data={f.drivers} onPick={(d) => onPick('driver', d.name)} />
          <VehicleUtilCard data={f.vehicles} onPick={(d) => onPick('vehicle', d.name)} />
        </div>
        <UtilOverviewCard data={f.vehicles} />
      </section>

      <section className="sec">
        <SectionHead n="04" title="Analitik Jarak & Odometer" sub="Jarak tempuh & konsumsi" />
        <div className="grid g-2e" style={{ marginBottom: 'var(--gap)' }}>
          <DriverDistCard data={f.drivers} onPick={(d) => onPick('driver', d.name)} />
          <VehicleDistCard data={f.vehicles} onPick={(d) => onPick('vehicle', d.name)} />
        </div>
        <BidangConsumptionCard data={f.bidang} onPick={(b) => onPick('bidang', b.short)} />
      </section>

      <section className="sec">
        <SectionHead n="05" title="Intelijen Operasional" sub="Peringkat & wawasan" />
        <div className="grid g-3">
          <TopBidangCard data={f.bidang} onPick={(b) => onPick('bidang', b.short)} />
          <InsightsCard />
          <DestCard data={f.dest} onPick={(d) => onPick('destination', d.name)} />
        </div>
      </section>

      <section className="sec">
        <SectionHead n="06" title="Zona Ekspansi · Roadmap" sub="Modul analitik mendatang" />
        <div style={{ marginBottom: 'var(--gap)' }}><AiCard /></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {D.roadmap.map((r, i) => <FutureCard key={i} item={r} />)}
        </div>
      </section>
    </>
  );
}

/* ============================================================
   LAYOUT: BENTO
   ============================================================ */
function BentoView({ state, anim, onPick, onSlice }) {
  const f = useFiltered(state);
  return (
    <>
      <SectionHead n="01" title="Ikhtisar Eksekutif" sub="Bento · operasional menyeluruh" />
      <div className="bento">
        {D.kpis.map((k) => <div className="b b3" key={k.id}><KpiCard kpi={k} anim={anim} /></div>)}

        <div className="b b8"><TrendCard anim={anim} /></div>
        <div className="b b4"><StatusCard onSlice={onSlice} /></div>

        <div className="b b4"><HealthCard health={D.health} anim={anim} /></div>
        <div className="b b4"><DriverWorkloadCard data={f.drivers.slice(0, 8)} onPick={(d) => onPick('driver', d.name)} /></div>
        <div className="b b4"><VehicleUtilCard data={f.vehicles} onPick={(d) => onPick('vehicle', d.name)} /></div>

        <div className="b b6"><DriverDistCard data={f.drivers.slice(0, 8)} onPick={(d) => onPick('driver', d.name)} /></div>
        <div className="b b6"><VehicleDistCard data={f.vehicles} onPick={(d) => onPick('vehicle', d.name)} /></div>

        <div className="b b8"><BidangConsumptionCard data={f.bidang} onPick={(b) => onPick('bidang', b.short)} /></div>
        <div className="b b4"><LifecycleCard /></div>

        <div className="b b8"><InsightsCard /></div>
        <div className="b b4"><DestCard data={f.dest} onPick={(d) => onPick('destination', d.name)} /></div>

        <div className="b b4"><TopBidangCard data={f.bidang} onPick={(b) => onPick('bidang', b.short)} /></div>
        <div className="b b8"><UtilOverviewCard data={f.vehicles} /></div>

        <div className="b b12"><AiCard /></div>
        {D.roadmap.map((r, i) => <div className="b b3" key={i}><FutureCard item={r} /></div>)}
      </div>
    </>
  );
}

/* ============================================================
   APP ROOT
   ============================================================ */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "sections",
  "accent": "merah",
  "density": "regular",
  "cardstyle": "bordered",
  "anim": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [navOpen, setNavOpen] = useState(false);
  const [state, setState] = useState({ range: '30', driver: 'all', vehicle: 'all', bidang: 'all' });
  const [drill, setDrill] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => { applyAccent(t.accent); }, [t.accent]);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.density = t.density;
    r.dataset.cardstyle = t.cardstyle;
    r.dataset.anim = t.anim ? 'on' : 'off';
  }, [t.density, t.cardstyle, t.anim]);

  const onPick = (type, name) => {
    const labels = { driver: 'Driver', vehicle: 'Kendaraan', bidang: 'Bidang', destination: 'Tujuan' };
    setDrill(`${labels[type]}: ${name}`);
    if (type === 'driver') setState((s) => ({ ...s, driver: name }));
    if (type === 'vehicle') setState((s) => ({ ...s, vehicle: name }));
    if (type === 'bidang') setState((s) => ({ ...s, bidang: name }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const onSlice = (s) => setDrill(`Status: ${s.label}`);

  const tabs = ['Manajemen User', 'Manajemen Driver', 'Manajemen Kendaraan', 'Audit Center', 'Konfigurasi', 'Analytics'];

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <div className="sb-backdrop" onClick={() => setNavOpen(false)} />
      <Sidebar />
      <div className="main">
        <Topbar onMenu={() => setNavOpen((o) => !o)} />
        <div className="content">
          <div className="page-head">
            <div>
              <div className="crumb">Administration · Analytics</div>
              <h1>Analytics Operasional</h1>
              <p>Visibilitas operasional menyeluruh — penugasan, driver, kendaraan, jarak, dan bidang dalam satu pandangan.</p>
            </div>
            <div className="head-actions">
              <button className="btn btn-ghost" onClick={() => setToast('Memuat ulang data analitik...')}><Icon name="reset" size={15} /> Segarkan</button>
            </div>
          </div>

          <div className="tabs">
            {tabs.map((tb) => <div key={tb} className={`tab ${tb === 'Analytics' ? 'active' : ''}`}>{tb}</div>)}
          </div>

          <FilterBar state={state} setState={setState} activeDrill={drill}
            clearDrill={() => { setDrill(null); setState({ range: '30', driver: 'all', vehicle: 'all', bidang: 'all' }); }}
            onExport={() => setToast('Laporan analitik diekspor (PDF)')} />

          {t.layout === 'bento'
            ? <BentoView state={state} anim={t.anim} onPick={onPick} onSlice={onSlice} />
            : <SectionsView state={state} anim={t.anim} onPick={onPick} onSlice={onSlice} />}
        </div>
      </div>

      <Toast msg={toast} onDone={() => setToast('')} />

      <TweaksPanel>
        <TweakSection label="Tata Letak" />
        <TweakRadio label="Layout" value={t.layout} options={['sections', 'bento']}
          onChange={(v) => setTweak('layout', v)} />
        <TweakRadio label="Kepadatan" value={t.density} options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)} />
        <TweakRadio label="Gaya kartu" value={t.cardstyle} options={['bordered', 'elevated']}
          onChange={(v) => setTweak('cardstyle', v)} />
        <TweakSection label="Tampilan" />
        <TweakColor label="Aksen" value={ACCENTS[t.accent].a}
          options={[ACCENTS.merah.a, ACCENTS.indigo.a, ACCENTS.teal.a, ACCENTS.amber.a]}
          onChange={(hex) => {
            const key = Object.keys(ACCENTS).find((k) => ACCENTS[k].a === hex) || 'merah';
            setTweak('accent', key);
          }} />
        <TweakToggle label="Animasi" value={t.anim} onChange={(v) => setTweak('anim', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
