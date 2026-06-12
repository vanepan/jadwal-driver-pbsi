/* ============================================================
   app.jsx — Analytics composition (3-level executive IA)
   Levels: Executive Overview · Highlights · Deep Analytics
   ============================================================ */

const D = window.DATA;

/* tweakable accent palettes (decoupled from critical/alert red) */
const ACCENTS = {
  merah:  { a: '#d24a43', a2: '#dd5a52', weak: 'rgba(210,74,67,0.12)',  line: 'rgba(210,74,67,0.26)' },
  biru:   { a: '#3f72d6', a2: '#5285e0', weak: 'rgba(63,114,214,0.12)', line: 'rgba(63,114,214,0.26)' },
  grafit: { a: '#5f6470', a2: '#737886', weak: 'rgba(95,100,112,0.13)', line: 'rgba(95,100,112,0.28)' },
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
      background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600,
      boxShadow: 'var(--shadow-lg)', color: 'var(--text)',
    }} className="fade-up">
      <span style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(47,158,107,0.15)', color: 'var(--c-green)', display: 'grid', placeItems: 'center' }}>
        <Icon name="check" size={14} />
      </span>
      {msg}
    </div>
  );
}

/* ---------------- filtered dataset ---------------- */
function useFiltered(state) {
  return useMemo(() => {
    let drivers = D.drivers, vehicles = D.vehicles, bidang = D.bidang;
    if (state.driver !== 'all') drivers = drivers.filter((d) => d.name === state.driver);
    if (state.vehicle !== 'all') vehicles = vehicles.filter((v) => v.name === state.vehicle);
    if (state.bidang !== 'all') bidang = bidang.filter((b) => b.short === state.bidang);
    return { drivers, vehicles, bidang };
  }, [state]);
}

/* ============================================================
   APP ROOT
   ============================================================ */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "merah",
  "density": "comfortable",
  "anim": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [navOpen, setNavOpen] = useState(false);
  const [state, setState] = useState({ range: '30', driver: 'all', vehicle: 'all', bidang: 'all' });
  const [drill, setDrill] = useState(null);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('trends');

  const f = useFiltered(state);

  useEffect(() => { applyAccent(t.accent); }, [t.accent]);
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = t.theme;
    r.dataset.density = t.density;
    r.dataset.anim = t.anim ? 'on' : 'off';
  }, [t.theme, t.density, t.anim]);

  const scrollToDeep = () => {
    requestAnimationFrame(() => {
      const el = document.getElementById('deep');
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' });
    });
  };

  const onPick = (type, name) => {
    const tabFor = { driver: 'driver', vehicle: 'vehicle', bidang: 'bidang', destination: 'bidang', trend: 'trends' };
    const labels = { driver: 'Driver', vehicle: 'Kendaraan', bidang: 'Bidang', destination: 'Tujuan' };
    if (type === 'driver') setState((s) => ({ ...s, driver: name }));
    if (type === 'vehicle') setState((s) => ({ ...s, vehicle: name }));
    if (type === 'bidang') setState((s) => ({ ...s, bidang: name }));
    if (labels[type]) setDrill(`${labels[type]}: ${name}`);
    setTab(tabFor[type] || 'trends');
    scrollToDeep();
  };
  const onSlice = (s) => setDrill(`Status: ${s.label}`);
  const onAlert = () => { setTab('intelligence'); scrollToDeep(); };

  const pageTabs = ['Manajemen User', 'Manajemen Driver', 'Manajemen Kendaraan', 'Audit Center', 'Konfigurasi', 'Analytics'];

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <div className="sb-backdrop" onClick={() => setNavOpen(false)} />
      <Sidebar />
      <div className="main">
        <Topbar onMenu={() => setNavOpen((o) => !o)} theme={t.theme}
          onToggleTheme={() => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark')} />
        <div className="content">
          <div className="page-head">
            <div>
              <div className="crumb">Administration · Analytics</div>
              <h1>Analytics Operasional</h1>
              <p>Pandangan eksekutif atas operasi armada — ringkas dulu, terperinci saat dibutuhkan.</p>
            </div>
            <div className="head-actions">
              <button className="btn btn-ghost" onClick={() => setToast('Memuat ulang data analitik...')}><Icon name="reset" size={15} /> <span>Segarkan</span></button>
              <button className="btn btn-primary" onClick={() => setToast('Laporan analitik diekspor (PDF)')}><Icon name="download" size={15} /> <span>Ekspor Laporan</span></button>
            </div>
          </div>

          <div className="tabs">
            {pageTabs.map((tb) => <div key={tb} className={`tab ${tb === 'Analytics' ? 'active' : ''}`}>{tb}</div>)}
          </div>

          <FilterBar state={state} setState={setState} activeDrill={drill}
            clearDrill={() => { setDrill(null); setState({ range: '30', driver: 'all', vehicle: 'all', bidang: 'all' }); }}
            onExport={() => setToast('Data analitik diekspor (CSV)')} />

          {/* LEVEL 1 */}
          <ExecutiveOverview data={D} anim={t.anim} onAlert={onAlert} />

          {/* LEVEL 2 */}
          <Highlights data={D} onPick={onPick} />

          {/* LEVEL 3 */}
          <DeepAnalytics data={D} f={f} anim={t.anim} tab={tab} setTab={setTab} onPick={onPick} onSlice={onSlice} />
        </div>
      </div>

      <Toast msg={toast} onDone={() => setToast('')} />

      <TweaksPanel>
        <TweakSection label="Tampilan" />
        <TweakRadio label="Tema" value={t.theme}
          options={[{ value: 'light', label: 'Terang' }, { value: 'dark', label: 'Gelap' }]}
          onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="Aksen" value={ACCENTS[t.accent].a}
          options={[ACCENTS.merah.a, ACCENTS.biru.a, ACCENTS.grafit.a]}
          onChange={(hex) => {
            const key = Object.keys(ACCENTS).find((k) => ACCENTS[k].a === hex) || 'merah';
            setTweak('accent', key);
          }} />
        <TweakSection label="Tata Letak" />
        <TweakRadio label="Kepadatan" value={t.density}
          options={[{ value: 'comfortable', label: 'Nyaman' }, { value: 'spacious', label: 'Lapang' }]}
          onChange={(v) => setTweak('density', v)} />
        <TweakToggle label="Animasi" value={t.anim} onChange={(v) => setTweak('anim', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
