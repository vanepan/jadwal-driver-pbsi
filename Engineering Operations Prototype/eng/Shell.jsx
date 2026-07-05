/* ============================================================
   Shell — module rail + section panel + topbar. The topbar role
   switcher is a dropdown that names each role in full and shows
   the Sarpras → Koordinator → Engineering hierarchy. Plus a
   dark-mode toggle on the rail.
   ============================================================ */
const SHK = window.SarprasOperationsDesignSystem_d29aee;

const ENG_MODULES = [
  { id: 'analytics', icon: 'chart', label: 'Analitik' },
  { id: 'drivers', icon: 'vehicle-car', label: 'Operasi Driver' },
  { id: 'vehicles', icon: 'shield', label: 'Manajemen Kendaraan' },
  { id: 'engineering', icon: 'wrench', label: 'Engineering Operations' },
  { id: 'admin', icon: 'users', label: 'Administrasi' },
];

// Hierarchy order: Admin Sarpras → Koordinator Engineering → Engineering
const ROLE_DEFS = [
  { id: 'admin', label: 'Admin Sarpras', sub: 'Membuat & memverifikasi penugasan', icon: 'shield' },
  { id: 'coordinator', label: 'Koordinator Engineering', sub: 'Koordinasi lapangan & verifikasi', icon: 'users' },
  { id: 'member', label: 'Engineering', sub: 'Eksekusi pekerjaan di lapangan', icon: 'wrench' },
];

function RoleMenu({ role, onRole }) {
  const [open, setOpen] = React.useState(false);
  const cur = ROLE_DEFS.filter((r) => r.id === role)[0];
  return (
    <div style={{ position: 'relative' }}>
      <button className="role-btn" onClick={() => setOpen(!open)}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--accent-weak)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none' }}><window.EngIcon name={cur.icon} size={14} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span style={{ fontSize: 9.5, color: 'var(--text-faint)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Peran</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{cur.label}</span>
        </span>
        <window.EngIcon name="chevron-down" size={14} tone="text-faint" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && <React.Fragment>
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 48 }} />
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 296, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', padding: 8, zIndex: 49 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-ghost)', padding: '8px 10px 6px' }}>Lihat sebagai (demo)</div>
          {ROLE_DEFS.map((r, i) => (
            <button key={r.id} onClick={() => { onRole(r.id); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 10px', border: 'none', borderRadius: 11, background: r.id === role ? 'var(--accent-weak)' : 'transparent', cursor: 'pointer', position: 'relative' }}>
              {i > 0 && <span style={{ position: 'absolute', left: 21, top: -1, width: 2, height: 10, background: 'var(--border)' }} />}
              <span style={{ width: 26, height: 26, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', background: r.id === role ? 'var(--accent)' : 'var(--surface-2)', color: r.id === role ? '#fff' : 'var(--text-faint)' }}><window.EngIcon name={r.icon} size={14} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: r.id === role ? 'var(--accent)' : 'var(--text)' }}>{r.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-faint)', marginTop: 1 }}>{r.sub}</span>
              </span>
              {r.id === role && <window.EngIcon name="check-circle" size={16} tone="accent" />}
            </button>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '10px 10px 6px', borderTop: '1px solid var(--border-faint)', margin: '6px 4px 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-dim)' }}>Alur:</span>
            Admin Sarpras <window.EngIcon name="arrow-right" size={11} tone="text-ghost" /> Koordinator <window.EngIcon name="arrow-right" size={11} tone="text-ghost" /> Engineering
          </div>
        </div>
      </React.Fragment>}
    </div>
  );
}

function EngShell({ panelItems, activePanel, onPanel, crumb, role, onRole, theme, onTheme, user, cta, onCta, extraTopbar, children }) {
  return (
    <div className="app">
      <nav className="rail">
        <div className="rail-crest"><img src="assets/pbsi-logo.png" alt="PBSI" /></div>
        {ENG_MODULES.map((m) => (
          <button key={m.id} className={'rail-mod' + (m.id === 'engineering' ? ' active' : '')} title={m.label}>
            <window.EngIcon name={m.icon} size={20} />
          </button>
        ))}
        <div className="rail-spacer" />
        <button className="rail-mod" title="Tema" onClick={onTheme}><window.EngIcon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></button>
        <div className="rail-ava">{user.ini}</div>
      </nav>

      <aside className="panel">
        <div className="panel-title">Engineering</div>
        <div className="panel-sub">Unit Eksekusi · Bidang Sarpras</div>
        {cta && <button className="panel-cta" onClick={onCta}><window.EngIcon name="plus" size={15} />{cta}</button>}
        <div className="panel-label">Menu</div>
        <div className="panel-nav">
          {panelItems.map((it) => (
            <button key={it.id} className={'panel-item' + (it.id === activePanel ? ' active' : '')} onClick={() => onPanel(it.id)}>
              <window.EngIcon name={it.icon} size={16} />
              <span>{it.label}</span>
              {it.badge ? <span className="badge" data-tone={it.future ? 'future' : undefined}>{it.badge}</span> : null}
            </button>
          ))}
        </div>
        <div className="panel-spacer" />
        <div className="panel-user">
          <div className="ava">{user.ini}</div>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{user.name}</div>
            <div className="rl">{user.role}</div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="tb-crumb">
            {crumb.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="sep"><window.EngIcon name="chevron-right" size={14} /></span>}
                <span className={i === crumb.length - 1 ? 'cur' : ''}>{c}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="tb-spacer" />
          {extraTopbar}
          <div className="tb-icon"><window.EngIcon name="bell" size={18} /><span className="dot" /></div>
          <RoleMenu role={role} onRole={onRole} />
        </header>
        <main className="content fade-up" key={role + activePanel}>{children}</main>
      </div>
    </div>
  );
}

window.EngShell = EngShell;
