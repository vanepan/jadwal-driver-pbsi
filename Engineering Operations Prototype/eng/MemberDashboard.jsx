/* ============================================================
   MemberDashboard — the Engineering field worker's home.
   Opens straight to work: Sedang Saya Kerjakan · Task Tersedia
   · Dilanjutkan Besok · Timeline Hari Ini · Riwayat Terakhir.
   Large tap targets, minimal scrolling, mobile-first.
   ============================================================ */
const MDK = window.SarprasOperationsDesignSystem_d29aee;

// Prioritas Hari Ini — the worker should never wonder what to work on.
// Surfaces: critical assignments, tasks without workers, tasks nearing
// deadline, and tasks this member should resume today — in one glance.
function PriorityRow({ item, me, onOpen }) {
  const { Button } = MDK;
  const S = window.EngStore;
  const act = S.actions;
  const { a, tag, tone, icon } = item;
  const mine = a.workers.filter((w) => w.name === me)[0];
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  let cta;
  if (mine && mine.state === 'paused') cta = <Button size="sm" variant="primary" onClick={stop(() => act.resume(a.id, me))} icon={<window.EngIcon name="play" size={13} />}>Lanjutkan</Button>;
  else if (mine && mine.state === 'active') cta = <Button size="sm" variant="ghost" onClick={stop(() => onOpen(a.id))} icon={<window.EngIcon name="arrow-right" size={13} />}>Detail</Button>;
  else cta = <Button size="sm" variant="primary" onClick={stop(() => act.join(a.id, me))} icon={<window.EngIcon name="play" size={13} />}>Mulai</Button>;
  return (
    <div onClick={() => onOpen(a.id)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'center', padding: '14px 4px', borderTop: '1px solid var(--border-faint)', cursor: 'pointer' }}>
      <window.CatTile cat={a.category} size={38} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: `var(--${tone})`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <window.EngIcon name={icon} size={12} /> {tag}
          </span>
          <span style={{ color: 'var(--text-ghost)' }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>{a.location.split(' · ')[0]}</span>
        </div>
      </div>
      {cta}
    </div>
  );
}

function MyWorkHero({ a, me, onOpen }) {
  const { Button } = MDK;
  const S = window.EngStore;
  const act = S.actions;
  const mine = a.workers.filter((w) => w.name === me)[0];
  const active = mine && mine.state === 'active';
  return (
    <div style={{ borderRadius: 18, border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow-md)', padding: 24, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: active ? 'var(--c-blue)' : 'var(--c-violet)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <window.CatTile cat={a.category} size={48} radius={14} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: active ? 'var(--c-blue)' : 'var(--c-violet)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {active && <span className="eng-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-blue)' }} />}
            {active ? 'Sedang Anda kerjakan' : 'Dilanjut besok'}
          </div>
          <div onClick={() => onOpen(a.id)} style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', marginTop: 4, lineHeight: 1.15, cursor: 'pointer' }}>{a.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 600, marginTop: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
            <window.EngIcon name="pin" size={14} /> {a.location}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{S.fmtDuration(S.workerElapsed(mine))}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>waktu kerja Anda</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        {active
          ? <React.Fragment>
              <Button onClick={() => act.pauseTomorrow(a.id, me)} icon={<window.EngIcon name="moon" size={17} />} style={{ height: 52, fontSize: 14.5, borderRadius: 13, flex: 1, minWidth: 150, background: 'var(--c-violet-weak)', color: 'var(--c-violet)', border: 'none' }}>Lanjut Besok</Button>
              <Button variant="primary" onClick={() => act.complete(a.id, me)} icon={<window.EngIcon name="check-circle" size={17} />} style={{ height: 52, fontSize: 14.5, borderRadius: 13, flex: 1, minWidth: 150 }}>Selesai</Button>
            </React.Fragment>
          : <React.Fragment>
              <Button variant="primary" onClick={() => act.resume(a.id, me)} icon={<window.EngIcon name="play" size={16} />} style={{ height: 52, fontSize: 14.5, borderRadius: 13, flex: 1, minWidth: 150 }}>Lanjutkan</Button>
              <Button onClick={() => act.complete(a.id, me)} icon={<window.EngIcon name="check-circle" size={17} />} style={{ height: 52, fontSize: 14.5, borderRadius: 13, flex: 1, minWidth: 150 }}>Selesai</Button>
            </React.Fragment>}
      </div>
    </div>
  );
}

function MemberDashboard({ role, me, onOpen }) {
  const { PageHeader, SectionHeader, Card, KPICard, Button } = MDK;
  const S = useStore();
  const all = S.getState().assignments;
  const myActive = all.filter((a) => a.workers.some((w) => w.name === me && w.state === 'active'));
  const myPaused = all.filter((a) => a.workers.some((w) => w.name === me && w.state === 'paused') && a.status !== 'done');
  const available = all.filter((a) => a.status === 'available');
  const myDone = all.filter((a) => a.workers.some((w) => w.name === me && w.state === 'done'));
  const first = me.split(' ')[0];

  // Prioritas Hari Ini — dedup, ranked: resume-today first, then critical, deadline, unstaffed.
  const priorityItems = [];
  const seen = new Set();
  const push = (a, tag, tone, icon) => { if (!seen.has(a.id)) { seen.add(a.id); priorityItems.push({ a, tag, tone, icon }); } };
  myPaused.forEach((a) => push(a, 'Dilanjutkan Besok', 'c-violet', 'moon'));
  all.filter((a) => a.priority === 'kritis' && a.status !== 'done' && a.status !== 'postponed').forEach((a) => push(a, 'Critical', 'crit', 'flame'));
  all.filter((a) => a.status !== 'done' && a.status !== 'postponed' && String(a.target).indexOf('Hari ini') === 0).forEach((a) => push(a, 'Deadline Hari Ini', 'c-amber', 'clock'));
  available.filter((a) => a.workers.length === 0).forEach((a) => push(a, 'Butuh Engineering', 'c-amber', 'wrench'));
  const priorityTop = priorityItems.slice(0, 5);

  return (
    <div>
      <PageHeader crumb="ENGINEERING OPERATIONS" title={`Halo, ${first}`}
        lede={myActive.length ? `Anda punya ${myActive.length} pekerjaan berjalan. ${available.length} penugasan baru tersedia.` : `${available.length} penugasan tersedia untuk dikerjakan sekarang.`}
        actions={<Button icon={<window.EngIcon name="phone" size={15} />} onClick={() => onOpen('__mobile')}>Tampilan Ponsel</Button>} />

      <div className="hm-stats" style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 24, marginBottom: 8, gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="hm-stat"><KPICard label="Sedang Saya Kerjakan" value={String(myActive.length)} caption="berjalan" /></div>
        <div className="hm-stat"><KPICard label="Task Tersedia" value={String(available.length)} caption="bisa diambil" /></div>
        <div className="hm-stat"><KPICard label="Dilanjut Besok" value={String(myPaused.length)} caption="menunggu Anda" /></div>
      </div>

      {priorityTop.length > 0 && (
        <div className="level" style={{ marginTop: 40 }}>
          <SectionHeader tag="PRIORITAS" title="Prioritas Hari Ini" subtitle={`${priorityTop.length}`} />
          <Card style={{ padding: 24 }}>
            {priorityTop.map((item) => <PriorityRow key={item.a.id} item={item} me={me} onOpen={onOpen} />)}
          </Card>
        </div>
      )}

      {myActive.length > 0 && (
        <div className="level" style={{ marginTop: 46 }}>
          <SectionHeader tag="PEKERJAAN SAYA" title="Sedang Saya Kerjakan" subtitle={`${myActive.length}`} />
          <div className="stack">{myActive.map((a) => <MyWorkHero key={a.id} a={a} me={me} onOpen={onOpen} />)}</div>
        </div>
      )}

      <div className="level" style={{ marginTop: myActive.length ? undefined : 46 }}>
        <SectionHeader tag="TERSEDIA" title="Task Tersedia" subtitle="Ketuk untuk mulai" />
        {available.length === 0
          ? <Card><div style={{ padding: '24px 4px', color: 'var(--text-faint)', fontSize: 13 }}>Tidak ada penugasan tersedia. Anda akan menerima notifikasi saat ada yang baru.</div></Card>
          : <div className="eng-card-grid">{available.map((a) => <window.AssignmentCard key={a.id} a={a} role={role} me={me} onOpen={() => onOpen(a.id)} />)}</div>}
      </div>

      {myPaused.length > 0 && (
        <div className="level">
          <SectionHeader tag="DILANJUT BESOK" title="Menunggu Dilanjutkan" subtitle={`${myPaused.length}`} />
          <div className="stack">{myPaused.map((a) => <MyWorkHero key={a.id} a={a} me={me} onOpen={onOpen} />)}</div>
        </div>
      )}

      <div className="level">
        <div className="grid g-2">
          <Card style={{ padding: 24 }}>
            <SectionHeader tag="TIMELINE" title="Timeline Hari Ini" subtitle="Aktivitas Anda" style={{ marginBottom: 6 }} action={<span onClick={() => onOpen('__timeline')}>Buka →</span>} />
            <window.ActivityFeed role="member" me={me} limit={5} onOpen={onOpen} />
          </Card>
          <Card style={{ padding: 24 }}>
            <SectionHeader tag="RIWAYAT" title="Riwayat Terakhir" subtitle={`${myDone.length}`} style={{ marginBottom: 6 }} />
            {myDone.length === 0
              ? <div style={{ padding: '20px 4px', color: 'var(--text-faint)', fontSize: 13 }}>Belum ada pekerjaan selesai hari ini.</div>
              : myDone.map((a, i) => (
                <div key={a.id} onClick={() => onOpen(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 4px', borderTop: i ? '1px solid var(--border-faint)' : 'none', cursor: 'pointer' }}>
                  <window.CatTile cat={a.category} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, marginTop: 2 }}>{a.location.split(' · ')[0]}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: a.status === 'done' ? 'var(--c-green)' : 'var(--c-amber)', fontSize: 12, fontWeight: 700 }}>
                    <window.EngIcon name={a.status === 'done' ? 'check-circle' : 'clock'} size={14} /> {a.status === 'done' ? 'Terverifikasi' : 'Menunggu'}
                  </span>
                </div>
              ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

window.MemberDashboard = MemberDashboard;
