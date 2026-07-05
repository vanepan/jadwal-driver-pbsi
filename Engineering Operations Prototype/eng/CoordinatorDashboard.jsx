/* ============================================================
   OpsDashboard — the landing Dashboard for Admin Sarpras and
   Koordinator Engineering. NOT an analytics page: it answers
   "apa yang harus dikerjakan / perlu perhatian / siapa yang
   bekerja / apa yang menunggu verifikasi" at a glance.
   Widgets differ by role. Admin adds mini-analytics, upcoming
   maintenance, quick-create and a future Bidang Request slot.
   ============================================================ */
const CDK = window.SarprasOperationsDesignSystem_d29aee;

function LiveWorkerRow({ a, w, onOpen }) {
  const S = window.EngStore;
  return (
    <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 4px', borderTop: '1px solid var(--border-faint)', cursor: 'pointer' }}>
      <span style={{ position: 'relative', width: 34, height: 34, flex: 'none' }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: w.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>{w.ini}</span>
        <span className="eng-pulse" style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: 'var(--c-blue)', border: '2px solid var(--surface)' }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{w.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--c-blue)' }}>{S.fmtDuration(S.workerElapsed(w))}</span>
    </div>
  );
}

function AttnRow({ a, kind, role, onOpen }) {
  const { Button } = CDK;
  const S = window.EngStore;
  const act = S.actions;
  const cfg = {
    verify: { tone: 'c-amber', label: 'Menunggu verifikasi', icon: 'clock' },
    crit: { tone: 'crit', label: 'Kritis · sedang berjalan', icon: 'flame' },
    paused: { tone: 'c-violet', label: 'Dilanjut besok', icon: 'moon' },
  }[kind];
  const verifier = role === 'admin' ? S.ADMIN.name : S.COORDINATOR.name;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'center', padding: '15px 4px', borderTop: '1px solid var(--border-faint)' }}>
      <window.CatTile cat={a.category} size={38} />
      <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <span style={{ color: `var(--${cfg.tone})`, display: 'inline-flex', alignItems: 'center', gap: 5 }}><window.EngIcon name={cfg.icon} size={13} /> {cfg.label}</span>
          <span style={{ color: 'var(--text-ghost)' }}>·</span> {a.location.split(' · ')[0]}
        </div>
      </div>
      {kind === 'verify'
        ? <Button size="sm" variant="primary" onClick={() => act.verify(a.id, verifier)} icon={<window.EngIcon name="check-circle" size={14} />}>Verifikasi</Button>
        : <Button size="sm" variant="ghost" onClick={onOpen} icon={<window.EngIcon name="arrow-right" size={14} />}>Detail</Button>}
    </div>
  );
}

function MiniDonut({ segments, size = 104, thickness = 16 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2, c = 2 * Math.PI * r; let off = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: `0 0 ${size}px` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map((s, i) => { const dash = c * (s.value / total); const el = <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={-off} />; off += dash; return el; })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>{total}</div>
      </div>
    </div>
  );
}

// Highly visible "waiting on you" banner — coordinator's workflow should
// never leave verification buried inside a general attention list.
function VerifyBanner({ items, role, onOpen }) {
  const { Button } = CDK;
  const act = window.EngStore.actions;
  const verifier = role === 'admin' ? window.EngStore.ADMIN.name : window.EngStore.COORDINATOR.name;
  if (!items.length) return null;
  return (
    <div className="level" style={{ marginTop: 40 }}>
      <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--c-amber-weak)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <span style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--surface)', color: 'var(--c-amber)', display: 'grid', placeItems: 'center', flex: 'none' }}><window.EngIcon name="clock" size={20} /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em', color: 'var(--text)' }}>{items.length} pekerjaan menunggu verifikasi</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 3, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {items.slice(0, 2).map((a) => a.title).join(' · ')}{items.length > 2 ? ` +${items.length - 2} lainnya` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {items.slice(0, 2).map((a) => (
            <Button key={a.id} size="sm" variant="primary" onClick={() => act.verify(a.id, verifier)} icon={<window.EngIcon name="check-circle" size={14} />}>Verifikasi {a.id}</Button>
          ))}
          {items.length > 2 && <Button size="sm" variant="ghost" onClick={() => onOpen(items[2].id)}>Lihat Semua</Button>}
        </div>
      </div>
    </div>
  );
}

function OpsDashboard({ role, me, onOpen }) {
  const { PageHeader, SectionHeader, Card, KPICard, RingGauge, Button, StatusPill } = CDK;
  const S = useStore();
  const all = S.getState().assignments;
  const inProg = all.filter((a) => a.status === 'in_progress');
  const verify = all.filter((a) => a.status === 'verify');
  const paused = all.filter((a) => a.status === 'paused');
  const available = all.filter((a) => a.status === 'available');
  const crit = all.filter((a) => a.priority === 'kritis' && a.status !== 'done' && a.status !== 'postponed');
  const doneToday = all.filter((a) => a.status === 'done' && a.timeline.some((e) => e.kind === 'verify' && !String(e.time).startsWith('Kemarin')));
  const todayCount = all.filter((a) => a.status !== 'postponed' && a.status !== 'done').length;

  const activeWorkers = [];
  inProg.forEach((a) => a.workers.filter((w) => w.state === 'active').forEach((w) => activeWorkers.push({ a, w })));
  const busyNames = new Set(activeWorkers.map((x) => x.w.name).filter((n) => S.MEMBERS.some((m) => m.name === n)));
  const availEngineers = S.MEMBERS.length - busyNames.size;

  const attention = crit.filter((a) => a.status === 'in_progress').map((a) => ({ a, kind: 'crit' }))
    .concat(paused.map((a) => ({ a, kind: 'paused' })));

  const health = Math.max(0, Math.round(100 - (verify.length * 6 + crit.length * 8 + paused.length * 4)));
  const isAdmin = role === 'admin';

  const byCat = {};
  all.forEach((a) => { byCat[a.category] = (byCat[a.category] || 0) + 1; });
  const catSeg = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).slice(0, 5).map((k) => ({ label: S.CATEGORIES[k].label, value: byCat[k], color: `var(--${S.CATEGORIES[k].tone})` }));

  return (
    <div>
      <PageHeader crumb="ENGINEERING OPERATIONS" title="Dashboard"
        lede={`Jumat, 4 Juli 2026 — ${inProg.length} penugasan berjalan, ${verify.length} menunggu verifikasi.`}
        actions={isAdmin ? <Button variant="primary" icon={<window.EngIcon name="plus" size={15} />} onClick={() => onOpen('__new')}>Buat Penugasan</Button> : null} />

      {/* Operational health (Admin) / operational execution strip (Koordinator) */}
      {isAdmin ? (
        <div className="hero-metrics" style={{ marginTop: 20 }}>
          <div className="hm-health">
            <RingGauge value={health} suffix="/ 100" tone={health >= 80 ? 'green' : health >= 65 ? 'amber' : 'crit'} size={128} />
            <div>
              <div className="lbl">Kesehatan Operasional</div>
              <div className="grade" style={health < 80 ? { background: 'var(--c-amber-weak)', color: 'var(--c-amber)' } : {}}>
                <window.EngIcon name="check-circle" size={14} /> {health >= 80 ? 'Terkendali' : 'Perlu perhatian'}
              </div>
            </div>
          </div>
          <div className="hm-stats" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <div className="hm-stat"><KPICard label="Assignment Hari Ini" value={String(todayCount)} caption="aktif" /></div>
            <div className="hm-stat"><KPICard label="Dikerjakan" value={String(inProg.length)} caption="berlangsung" /></div>
            <div className="hm-stat"><KPICard label="Verifikasi" value={String(verify.length)} tone="alert" caption="perlu tindakan" /></div>
            <div className="hm-stat"><KPICard label="Selesai" value={String(doneToday.length)} caption="hari ini" /></div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 20, paddingTop: 32, borderTop: '1px solid var(--border-faint)' }}>
          <div className="hm-stats" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            <div className="hm-stat"><KPICard label="Task Belum Diambil" value={String(available.length)} caption="siap dikerjakan" /></div>
            <div className="hm-stat"><KPICard label="Sedang Dikerjakan" value={String(inProg.length)} caption="berjalan" /></div>
            <div className="hm-stat"><KPICard label="Menunggu Verifikasi" value={String(verify.length)} tone="alert" caption="perlu tindakan" /></div>
            <div className="hm-stat"><KPICard label="Dilanjutkan Besok" value={String(paused.length)} caption="menunggu lanjut" /></div>
            <div className="hm-stat"><KPICard label="Engineering Tersedia" value={String(availEngineers)} caption={`dari ${S.MEMBERS.length}`} /></div>
          </div>
        </div>
      )}

      {verify.length > 0 && <VerifyBanner items={verify} role={role} onOpen={onOpen} />}

      {/* Critical strip */}
      {crit.length > 0 && (
        <div className="level" style={{ marginTop: 54 }}>
          <SectionHeader tag="KRITIS" title="Critical Assignment" subtitle={`${crit.length} penugasan`} />
          <div className="eng-card-grid">
            {crit.map((a) => <window.AssignmentCard key={a.id} a={a} role={role} me={me} onOpen={() => onOpen(a.id)} />)}
          </div>
        </div>
      )}

      {/* Attention + live workers */}
      <div className="level" style={{ marginTop: crit.length ? undefined : 54 }}>
        <div className="grid g-lead">
          <Card style={{ padding: 24 }}>
            <SectionHeader tag="PERHATIAN" title="Perlu Tindakan" subtitle={`${attention.length} item`} style={{ marginBottom: 6 }} />
            {attention.length === 0
              ? <div style={{ padding: '24px 4px', color: 'var(--text-faint)', fontSize: 13 }}>Tidak ada yang perlu tindakan. Operasi berjalan lancar.</div>
              : attention.map(({ a, kind }) => <AttnRow key={a.id + kind} a={a} kind={kind} role={role} onOpen={() => onOpen(a.id)} />)}
          </Card>
          <Card style={{ padding: 24 }}>
            <SectionHeader tag="LANGSUNG" title="Engineering Sedang Bekerja" subtitle={`${activeWorkers.length}`} style={{ marginBottom: 6 }} />
            {activeWorkers.length === 0
              ? <div style={{ padding: '24px 4px', color: 'var(--text-faint)', fontSize: 13 }}>Tidak ada teknisi yang aktif saat ini.</div>
              : activeWorkers.map(({ a, w }) => <LiveWorkerRow key={a.id + w.name} a={a} w={w} onOpen={() => onOpen(a.id)} />)}
          </Card>
        </div>
      </div>

      {/* Running assignments */}
      <div className="level">
        <SectionHeader tag={isAdmin ? 'HARI INI' : 'ANTREAN'} title={isAdmin ? 'Assignment Hari Ini' : 'Penugasan Menunggu & Berjalan'} subtitle={`${inProg.concat(available, paused).length}`} />
        <div className="eng-card-grid">
          {inProg.concat(available, paused).map((a) => <window.AssignmentCard key={a.id} a={a} role={role} me={me} onOpen={() => onOpen(a.id)} />)}
        </div>
      </div>

      {/* Recent activity + (admin) mini analytics */}
      <div className="level">
        <div className="grid g-lead">
          <Card style={{ padding: 24 }}>
            <SectionHeader tag="AKTIVITAS" title="Recent Activity" subtitle="Terbaru" style={{ marginBottom: 6 }} action={<span onClick={() => onOpen('__timeline')}>Buka Timeline →</span>} />
            <window.ActivityFeed role={role} me={me} limit={7} onOpen={onOpen} />
          </Card>
          {isAdmin
            ? <Card title="Mini Operational Analytics" subtitle="Distribusi kategori" hoverable style={{ padding: 24 }}>
                <div className="donut-wrap">
                  <MiniDonut segments={catSeg} />
                  <div className="legend" style={{ flex: 1 }}>
                    {catSeg.map((s) => (<div className="li" key={s.label}><span className="sw" style={{ background: s.color }} />{s.label}<span className="vv">{s.value}</span></div>))}
                  </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-faint)' }}>
                  <Button variant="ghost" icon={<window.EngIcon name="chart" size={15} />} onClick={() => onOpen('__analytics')}>Buka Analytics lengkap</Button>
                </div>
              </Card>
            : <Card style={{ padding: 24 }}>
                <SectionHeader tag="TERSEDIA" title="Engineering Tersedia" subtitle={`${availEngineers} siap`} style={{ marginBottom: 6 }} />
                {S.MEMBERS.map((m, i) => {
                  const busy = busyNames.has(m.name);
                  return (
                    <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: i ? '1px solid var(--border-faint)' : 'none' }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', background: m.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{m.ini}</span>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{m.name}</span>
                      <StatusPill status={busy ? 'active' : 'done'}>{busy ? 'Bekerja' : 'Tersedia'}</StatusPill>
                    </div>
                  );
                })}
              </Card>}
        </div>
      </div>

      {/* Admin-only: upcoming maintenance + future Bidang Request */}
      {isAdmin && (
        <div className="level">
          <div className="grid g-2">
            <Card style={{ padding: 24 }}>
              <SectionHeader tag="TERJADWAL" title="Upcoming Maintenance" subtitle="Arsitektur siap" style={{ marginBottom: 6 }} />
              {[
                { t: 'Servis rutin AC lantai 3', d: 'Sen, 7 Jul', cat: 'ac' },
                { t: 'Uji tekanan hydrant triwulan', d: 'Rab, 9 Jul', cat: 'hydrant' },
                { t: 'Inspeksi kelistrikan panel utama', d: 'Jum, 11 Jul', cat: 'listrik' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 4px', borderTop: i ? '1px solid var(--border-faint)' : 'none' }}>
                  <window.CatTile cat={r.cat} size={34} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.t}</div><div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, marginTop: 2, fontFamily: 'var(--font-mono)' }}>{r.d}</div></div>
                  <StatusPill status="cancel">Preventif</StatusPill>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: 'var(--text-ghost)', marginTop: 12, fontStyle: 'italic' }}>Recurring & preventive maintenance aktif pada versi mendatang.</div>
            </Card>
            <Card style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
              <SectionHeader tag="ROADMAP" title="Bidang Request" subtitle="Placeholder arsitektur" style={{ marginBottom: 6 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 12, padding: '20px 0' }}>
                <span style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--surface-2)', color: 'var(--text-faint)', display: 'grid', placeItems: 'center' }}><window.EngIcon name="note" size={20} /></span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Permintaan dari Bidang</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.6, maxWidth: 320 }}>Bidang lain akan dapat mengajukan permintaan perbaikan langsung ke Engineering. Alur notifikasi dan verifikasi sudah disiapkan — belum diaktifkan.</div>
                <StatusPill status="cancel">Segera</StatusPill>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

window.OpsDashboard = OpsDashboard;
