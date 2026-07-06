/* ============================================================
   MobileMember — the field worker phone experience.
   Big targets, minimal taps: see work, start, continue,
   complete. Rendered inside a device frame on the canvas.
   ============================================================ */
const MBK = window.SarprasOperationsDesignSystem_d29aee;

function MBigBtn({ label, icon, kind, onClick }) {
  const styles = {
    primary: { background: 'linear-gradient(180deg,var(--accent-2),var(--accent))', color: '#fff', border: 'none' },
    blue: { background: 'linear-gradient(180deg,#4f7fe0,var(--c-blue))', color: '#fff', border: 'none' },
    violet: { background: 'var(--c-violet-weak)', color: 'var(--c-violet)', border: 'none' },
    plain: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
  }[kind];
  return (
    <button onClick={onClick} style={{ ...styles, height: 58, borderRadius: 16, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 15.5, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
      <window.EngIcon name={icon} size={19} />{label}
    </button>
  );
}

function MCard({ a, me, onOpen }) {
  const S = window.EngStore;
  const act = S.actions;
  const cat = S.CATEGORIES[a.category];
  const mine = a.workers.filter((w) => w.name === me)[0];
  const active = mine && mine.state === 'active';
  const paused = mine && mine.state === 'paused';
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow-sm)', padding: 16, marginBottom: 14 }}>
      <div onClick={onOpen} style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>
        <window.CatTile cat={a.category} size={44} radius={13} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <window.PriorityTag priority={a.priority} />
            {a.workers.length > 0 && <span style={{ marginLeft: 'auto' }}><window.WorkerStack workers={a.workers} size={22} /></span>}
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.25, marginTop: 6 }}>{a.title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', fontWeight: 600, marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <window.EngIcon name="pin" size={13} /> {a.location.split(' · ').slice(0, 2).join(' · ')}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        {active ? <React.Fragment>
            <MBigBtn label="Lanjut Besok" icon="moon" kind="violet" onClick={() => act.pauseTomorrow(a.id, me)} />
            <MBigBtn label="Selesai" icon="check-circle" kind="primary" onClick={() => act.complete(a.id, me)} />
          </React.Fragment>
          : paused ? <MBigBtn label="Lanjutkan Pekerjaan" icon="play" kind="blue" onClick={() => act.resume(a.id, me)} />
          : mine && mine.state === 'done' ? <div style={{ flex: 1, height: 52, borderRadius: 15, background: 'var(--c-amber-weak)', color: 'var(--c-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}><window.EngIcon name="clock" size={17} /> Menunggu verifikasi</div>
          : <MBigBtn label="Mulai Mengerjakan" icon="play" kind="blue" onClick={() => act.join(a.id, me)} />}
      </div>
    </div>
  );
}

function MobileMember({ me }) {
  const S = useStore();
  const [tab, setTab] = React.useState('kerja');
  const all = S.getState().assignments;
  const myWork = all.filter((a) => a.workers.some((w) => w.name === me && w.state !== 'done') && a.status !== 'done');
  const available = all.filter((a) => a.status === 'available');
  const first = me.split(' ')[0];

  const TABS = [{ id: 'kerja', label: 'Kerja', icon: 'wrench' }, { id: 'tersedia', label: 'Tersedia', icon: 'layers' }, { id: 'riwayat', label: 'Riwayat', icon: 'history' }];
  const myDone = all.filter((a) => a.workers.some((w) => w.name === me && w.state === 'done'));

  return (
    <div className="mobile-stage">
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="m-status"><span>09:45</span><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><window.EngIcon name="bell" size={13} /> PBSI Sarpras</span></div>
          <div className="m-scroll">
            {tab === 'kerja' && <React.Fragment>
              <div style={{ padding: '6px 2px 14px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Selamat pagi</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', marginTop: 2 }}>{first}</div>
                <div style={{ fontSize: 13.5, color: 'var(--text-dim)', marginTop: 4 }}>{myWork.length ? `${myWork.length} pekerjaan berjalan · ${available.length} baru tersedia` : `${available.length} penugasan siap dikerjakan`}</div>
              </div>
              {myWork.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-ghost)', margin: '4px 2px 10px' }}>Pekerjaan Saya</div>}
              {myWork.map((a) => <MCard key={a.id} a={a} me={me} onOpen={() => setTab('tersedia')} />)}
              {myWork.length === 0 && <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 18, padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Belum ada pekerjaan aktif.<br />Buka tab Tersedia untuk mulai.</div>}
            </React.Fragment>}

            {tab === 'tersedia' && <React.Fragment>
              <div style={{ padding: '6px 2px 14px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em' }}>Tersedia</div>
                <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 3 }}>{available.length} penugasan · ketuk untuk mulai</div>
              </div>
              {available.map((a) => <MCard key={a.id} a={a} me={me} onOpen={() => {}} />)}
              {available.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 30 }}>Tidak ada penugasan tersedia.</div>}
            </React.Fragment>}

            {tab === 'riwayat' && <React.Fragment>
              <div style={{ padding: '6px 2px 14px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em' }}>Riwayat Saya</div>
              </div>
              {myDone.map((a) => (
                <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <window.CatTile cat={a.category} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{S.fmtDuration(S.workerElapsed(a.workers.filter((w) => w.name === me)[0]))} kerja</div>
                  </div>
                  <window.EngIcon name={a.status === 'done' ? 'check-circle' : 'clock'} size={18} tone={a.status === 'done' ? 'c-green' : 'c-amber'} />
                </div>
              ))}
              {myDone.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: 30 }}>Belum ada riwayat.</div>}
            </React.Fragment>}
          </div>
          <div className="m-tabbar">
            {TABS.map((t) => (
              <button key={t.id} className="m-tab" data-on={tab === t.id} onClick={() => setTab(t.id)}>
                <window.EngIcon name={t.icon} size={21} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="phone-cap">
        <h3>Dibuat untuk lapangan</h3>
        <p>Teknisi memegang alat saat menggunakan ponsel. Tombol besar, satu aksi jelas per layar, dan langsung eksekusi — bukan administrasi. Aksi di sini mengubah state yang sama dengan tampilan desktop.</p>
      </div>
    </div>
  );
}

window.MobileMember = MobileMember;
