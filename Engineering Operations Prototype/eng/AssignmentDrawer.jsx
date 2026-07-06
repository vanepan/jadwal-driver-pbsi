/* ============================================================
   AssignmentDrawer — Executive detail drawer for one assignment.
   Information · Workers · Timeline · Notes · Attachments (future)
   · Actual working time · Verification. Actions are role-aware.
   ============================================================ */
const ADK = window.SarprasOperationsDesignSystem_d29aee;

function ActionZone({ a, role, me }) {
  const { Button } = ADK;
  const act = window.EngStore.actions;
  const big = { height: 52, fontSize: 15, borderRadius: 13, flex: 1, minWidth: 150 };
  const mine = a.workers.filter((w) => w.name === me)[0];

  if (a.status === 'done') {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 13, background: 'var(--c-green-weak)', color: 'var(--c-green)', fontWeight: 700, fontSize: 13.5 }}>
      <window.EngIcon name="check-circle" size={18} /> Terverifikasi dan ditutup
    </div>;
  }

  // Member actions
  if (role === 'member') {
    if (mine && mine.state === 'active') {
      return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button onClick={() => act.pauseTomorrow(a.id, me)} icon={<window.EngIcon name="moon" size={17} />} style={{ ...big, background: 'var(--c-violet-weak)', color: 'var(--c-violet)', border: 'none' }}>Lanjutkan Besok</Button>
        <Button variant="primary" onClick={() => act.complete(a.id, me)} icon={<window.EngIcon name="check-circle" size={17} />} style={big}>Selesaikan</Button>
      </div>;
    }
    if (mine && mine.state === 'paused') {
      return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={() => act.resume(a.id, me)} icon={<window.EngIcon name="play" size={16} />} style={big}>Lanjutkan Pekerjaan</Button>
        <Button onClick={() => act.complete(a.id, me)} icon={<window.EngIcon name="check-circle" size={17} />} style={big}>Selesaikan</Button>
      </div>;
    }
    if (mine && mine.state === 'done') {
      return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 13, background: 'var(--c-amber-weak)', color: 'var(--c-amber)', fontWeight: 700, fontSize: 13.5 }}>
        <window.EngIcon name="clock" size={18} /> Pekerjaan Anda selesai · menunggu verifikasi
      </div>;
    }
    if (a.status === 'postponed') {
      return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 13, background: 'var(--surface-2)', color: 'var(--text-faint)', fontWeight: 700, fontSize: 13.5 }}>Penugasan ditunda oleh admin</div>;
    }
    return <Button variant="primary" onClick={() => act.join(a.id, me)} icon={<window.EngIcon name="play" size={17} />} style={{ ...big, width: '100%', flex: 'none' }}>Mulai Mengerjakan</Button>;
  }

  // Coordinator / Admin actions
  const btns = [];
  if (a.status === 'verify') btns.push(<Button key="v" variant="primary" onClick={() => act.verify(a.id, window.EngStore.COORDINATOR.name)} icon={<window.EngIcon name="check-circle" size={17} />} style={big}>Verifikasi Pekerjaan</Button>);
  if (role === 'coordinator' && (a.status === 'available' || a.status === 'in_progress' || a.status === 'paused')) {
    const joined = a.workers.some((w) => w.name === window.EngStore.COORDINATOR.name && w.state !== 'done');
    if (!joined) btns.push(<Button key="j" onClick={() => act.join(a.id, window.EngStore.COORDINATOR.name)} icon={<window.EngIcon name="hand" size={16} />} style={big}>Gabung</Button>);
  }
  if (a.status === 'postponed') btns.push(<Button key="r" variant="primary" onClick={() => act.reopen(a.id, window.EngStore.ADMIN.name)} icon={<window.EngIcon name="reset" size={16} />} style={big}>Buka Kembali</Button>);
  else if (a.status !== 'done') btns.push(<Button key="p" onClick={() => act.postpone(a.id, role === 'admin' ? window.EngStore.ADMIN.name : window.EngStore.COORDINATOR.name)} icon={<window.EngIcon name="x-circle" size={16} />} style={{ ...big, color: 'var(--text-dim)' }}>Tunda Penugasan</Button>);
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{btns}</div>;
}

function AssignmentDrawer({ id, role, me, onClose }) {
  const { Badge, StatusPill } = ADK;
  const S = window.EngStore;
  const a = id ? S.find(id) : null;
  const cat = a ? (S.CATEGORIES[a.category] || S.CATEGORIES.umum) : null;
  const st = a ? (S.STATUSES[a.status] || {}) : {};

  return (
    <div className={'scrim' + (a ? ' open' : '')} onClick={onClose}>
      <div className="drawer" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        {a && (
          <React.Fragment>
            <div className="drawer-head">
              <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
                <window.CatTile cat={a.category} size={46} radius={13} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <Badge tone="neutral">{a.id}</Badge>
                    <StatusPill status={st.pill}>{st.label}</StatusPill>
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, letterSpacing: '-0.022em', margin: 0, lineHeight: 1.18 }}>{a.title}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 600 }}>
                    <window.EngIcon name="pin" size={14} /> {a.location}
                  </div>
                </div>
              </div>
              <button className="tb-icon" onClick={onClose} style={{ flex: 'none' }}><window.EngIcon name="close" size={18} /></button>
            </div>

            <div className="drawer-body">
              {/* Key facts — Assignment Summary */}
              <div className="drawer-sec">
                <div className="st">Informasi</div>
                <div className="kv"><span className="k">Kategori</span><span className="v" style={{ fontFamily: 'var(--font-sans)', color: `var(--${cat.tone})` }}>{cat.label}</span></div>
                <div className="kv"><span className="k">Prioritas</span><span className="v" style={{ fontFamily: 'var(--font-sans)' }}><window.PriorityTag priority={a.priority} mono={false} /></span></div>
                <div className="kv"><span className="k">Pemohon</span><span className="v" style={{ fontFamily: 'var(--font-sans)' }}>{a.requester}</span></div>
                <div className="kv"><span className="k">Dibuat</span><span className="v">{a.created}</span></div>
                <div className="kv"><span className="k">Target selesai</span><span className="v" style={{ color: a.priority === 'kritis' ? 'var(--crit)' : 'var(--text)' }}>{a.target}</span></div>
              </div>

              {/* Engineering Members — joined workers, working duration, current state */}
              <div className="drawer-sec">
                <div className="st">Engineering ({a.workers.length})</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: a.workers.length ? 14 : 10 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{S.fmtDuration(S.actualMinutes(a))}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>waktu kerja total lintas {a.workers.length || 0} teknisi</span>
                </div>
                {a.workers.length === 0
                  ? <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '4px 0' }}>Belum ada Engineering. Terbuka untuk semua teknisi.</div>
                  : a.workers.map((w) => {
                    const wt = { active: { l: 'Sedang bekerja', c: 'c-blue' }, paused: { l: 'Dilanjut besok', c: 'c-violet' }, done: { l: 'Selesai', c: 'c-green' } }[w.state];
                    return (
                      <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--border-faint)' }}>
                        <span style={{ width: 34, height: 34, borderRadius: '50%', background: w.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flex: 'none' }}>{w.ini}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{w.name}{w.name === me && <span style={{ color: 'var(--text-faint)', fontWeight: 600 }}> · Anda</span>}</div>
                          <div style={{ fontSize: 12, color: `var(--${wt.c})`, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {w.state === 'active' && <span className="eng-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-blue)' }} />}
                            {wt.l}
                          </div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>{S.fmtDuration(S.workerElapsed(w))}</span>
                      </div>
                    );
                  })}
                {window.canJoinTask(a) && (
                  <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--c-green)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <window.EngIcon name="hand" size={13} /> Masih bisa bergabung
                  </div>
                )}
              </div>

              {/* Operational Timeline */}
              <div className="drawer-sec">
                <div className="st">Timeline Operasional</div>
                <window.Timeline events={a.timeline} />
              </div>

              {/* Attachments — future-ready */}
              <div className="drawer-sec">
                <div className="st">Lampiran</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 12, border: '1px dashed var(--border-strong)', color: 'var(--text-faint)' }}>
                  <window.EngIcon name="camera" size={18} />
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>Foto sebelum / sesudah<div style={{ fontWeight: 500, color: 'var(--text-ghost)', marginTop: 2 }}>Tersedia pada versi mendatang</div></div>
                </div>
              </div>

              {/* Notes */}
              <div className="drawer-sec">
                <div className="st">Catatan</div>
                <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>{a.note}</p>
              </div>
            </div>

            {/* Actions — sticky footer, the operational command bar */}
            <div className="drawer-foot"><ActionZone a={a} role={role} me={me} /></div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

window.AssignmentDrawer = AssignmentDrawer;
