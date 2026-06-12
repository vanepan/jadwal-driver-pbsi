/* ============================================================
   shell.jsx — preserved Sidebar + Topbar, interactive FilterBar
   Exposes: Sidebar, Topbar, FilterBar
   ============================================================ */

function Sidebar({ onClose }) {
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">PB</div>
        <div>
          <div className="t1">Administration</div>
          <div className="t2">Manajemen Platform</div>
        </div>
      </div>
      <button className="sb-add"><Icon name="plus" size={16} /><span>Tambah Jadwal</span></button>
      <div className="sb-label">Administrasi</div>
      <nav className="sb-nav">
        <div className="sb-item active">
          <Icon name="workspace" size={16} className="ico" />
          <span className="txt">Administration Workspace</span>
        </div>
      </nav>
      <div className="sb-spacer" />
      <div className="sb-user">
        <div className="sb-ava">E</div>
        <div className="meta">
          <div className="nm">Evan</div>
          <div className="rl">Administrator</div>
          <div className="vr">v1.8.3</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ onMenu, theme, onToggleTheme }) {
  return (
    <header className="topbar">
      <button className="hamb" onClick={onMenu} aria-label="Menu"><Icon name="layout" size={17} /></button>
      <div className="tb-brand">
        <span className="a">Driver Ops</span>
        <span className="b">Administration</span>
      </div>
      <div className="tb-search">
        <Icon name="search" size={15} />
        <input placeholder="Cari driver, tujuan..." />
      </div>
      <div className="tb-spacer" />
      <div className="tb-date">
        <span className="pill">Hari Ini</span>
        <button aria-label="Sebelumnya"><Icon name="arrowL" size={14} /></button>
        <Icon name="calendar" size={13} style={{ opacity: .6 }} />
        <span>Sel, 9 Jun 2026</span>
        <button aria-label="Berikutnya"><Icon name="arrowR" size={14} /></button>
      </div>
      <button className="tb-icon" aria-label="Tema" onClick={onToggleTheme} title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      <button className="tb-icon" aria-label="Notifikasi"><Icon name="bell" size={16} /><span className="dot" /></button>
      <button className="tb-user">
        <span className="sb-ava" style={{ width: 28, height: 28, borderRadius: 7 }}>E</span>
        <span className="meta2">
          <span className="nm" style={{ display: 'block' }}>Evan</span>
          <span className="rl" style={{ display: 'block' }}>Administrator</span>
        </span>
        <Icon name="chevron" size={14} style={{ opacity: .5 }} />
      </button>
    </header>
  );
}

/* ---------------- Select dropdown ---------------- */
function Select({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const cur = options.find((o) => o.v === value) || options[0];
  return (
    <div className="fb-select" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}>
        <span className="lab">{label}</span>
        <span>{cur.l}</span>
        <Icon name="chevron" size={14} className="chev" />
      </button>
      {open && (
        <div className="fb-menu">
          {options.map((o) => (
            <div key={o.v} className={`fb-opt ${o.v === value ? 'sel' : ''}`}
              onClick={() => { onChange(o.v); setOpen(false); }}>
              {o.l}{o.v === value && <Icon name="check" size={13} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({ state, setState, activeDrill, clearDrill, onExport }) {
  const ref = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(e.intersectionRatio < 1), { threshold: [1], rootMargin: '-57px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const ranges = [
    { v: '7', l: '7 Hari Terakhir' }, { v: '30', l: '30 Hari Terakhir' },
    { v: '90', l: '90 Hari Terakhir' }, { v: 'ytd', l: 'Tahun Berjalan' },
  ];
  const drivers = [{ v: 'all', l: 'Semua Driver' }, ...window.DATA.drivers.slice(0, 8).map((d) => ({ v: d.name, l: d.name }))];
  const vehicles = [{ v: 'all', l: 'Semua Kendaraan' }, ...window.DATA.vehicles.map((d) => ({ v: d.name, l: d.name }))];
  const bidang = [{ v: 'all', l: 'Semua Bidang' }, ...window.DATA.bidang.map((d) => ({ v: d.short, l: d.short }))];
  const hasFilters = state.range !== '30' || state.driver !== 'all' || state.vehicle !== 'all' || state.bidang !== 'all' || activeDrill;

  return (
    <div className={`filterbar ${stuck ? 'stuck' : ''}`} ref={ref}>
      <Icon name="filter" size={15} style={{ color: 'var(--text-faint)', marginLeft: 4 }} />
      <Select label="Rentang" value={state.range} options={ranges} onChange={(v) => setState({ ...state, range: v })} />
      <Select label="Driver" value={state.driver} options={drivers} onChange={(v) => setState({ ...state, driver: v })} />
      <Select label="Kendaraan" value={state.vehicle} options={vehicles} onChange={(v) => setState({ ...state, vehicle: v })} />
      <Select label="Bidang" value={state.bidang} options={bidang} onChange={(v) => setState({ ...state, bidang: v })} />
      {hasFilters && (
        <button className="fb-reset" onClick={() => { setState({ range: '30', driver: 'all', vehicle: 'all', bidang: 'all' }); clearDrill && clearDrill(); }}>
          Reset Semua Filter
        </button>
      )}
      <div className="fb-spacer" />
      {activeDrill && (
        <span className="fb-chip">
          <Icon name="bolt" size={12} fill /> {activeDrill}
          <button onClick={clearDrill} aria-label="Hapus"><Icon name="x" size={12} /></button>
        </span>
      )}
      <span className="fb-chip" style={{ background: 'var(--accent-weak)' }}>{ranges.find((r) => r.v === state.range).l.replace(' Terakhir', '')}</span>
      <button className="btn" onClick={onExport}><Icon name="download" size={15} /><span className="hide-sm">Ekspor</span></button>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, FilterBar, Select });
