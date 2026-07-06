/* ============================================================
   AssignmentQueue — card-based board sorted by operational
   urgency. Also exports AssignmentCard, reused on dashboards.
   ============================================================ */
const AQK = window.SarprasOperationsDesignSystem_d29aee;

function urgencyScore(a) {
  const S = window.EngStore;
  return (S.STATUSES[a.status].rank * 10) + S.PRIORITIES[a.priority].rank;
}

function CardAction({ a, role, me, onOpen }) {
  const { Button } = AQK;
  const act = window.EngStore.actions;
  const mine = a.workers.filter((w) => w.name === me)[0];
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  if (role === 'member') {
    if (a.status === 'done' || a.status === 'postponed') return null;
    if (mine && mine.state === 'active')
      return <Button size="sm" onClick={stop(() => act.pauseTomorrow(a.id, me))} icon={<window.EngIcon name="moon" size={14} />} style={{ background: 'var(--c-violet-weak)', color: 'var(--c-violet)', border: 'none' }}>Lanjut Besok</Button>;
    if (mine && mine.state === 'paused')
      return <Button size="sm" variant="primary" onClick={stop(() => act.resume(a.id, me))} icon={<window.EngIcon name="play" size={13} />}>Lanjutkan</Button>;
    if (mine && mine.state === 'done')
      return <span style={{ fontSize: 12, color: 'var(--c-amber)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><window.EngIcon name="clock" size={14} /> Menunggu verifikasi</span>;
    return <Button size="sm" variant="primary" onClick={stop(() => act.join(a.id, me))} icon={<window.EngIcon name="play" size={13} />}>Mulai Mengerjakan</Button>;
  }
  // coordinator / admin
  if (a.status === 'verify')
    return <Button size="sm" variant="primary" onClick={stop(() => act.verify(a.id, window.EngStore.COORDINATOR.name))} icon={<window.EngIcon name="check-circle" size={14} />}>Verifikasi</Button>;
  return <Button size="sm" variant="ghost" onClick={stop(onOpen)} icon={<window.EngIcon name="arrow-right" size={14} />}>Detail</Button>;
}

function AssignmentCard({ a, role, me, onOpen }) {
  const { Card, StatusPill } = AQK;
  const S = window.EngStore;
  const st = S.STATUSES[a.status] || {};
  const cat = S.CATEGORIES[a.category] || S.CATEGORIES.umum;
  const critAccent = a.priority === 'kritis' && a.status !== 'done';
  return (
    <Card hoverable onClick={onOpen} style={{ cursor: 'pointer', padding: 20, position: 'relative', overflow: 'hidden' }}>
      {critAccent && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--crit)' }} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <window.CatTile cat={a.category} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <window.PriorityTag priority={a.priority} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-ghost)' }}>{a.id}</span>
            <span style={{ flex: 1 }} />
            <StatusPill status={st.pill}>{st.label}</StatusPill>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--text)' }}>{a.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, color: 'var(--text-faint)', fontSize: 12.5, fontWeight: 600 }}>
            <window.EngIcon name="pin" size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.location}</span>
          </div>
          {(() => { const badges = window.urgencyBadges(a); return badges.length ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
              {badges.map((b) => (
                <span key={b.label} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: `var(--${b.tone}-weak, var(--surface-2))`, color: `var(--${b.tone})` }}>{b.label}</span>
              ))}
            </div>
          ) : null; })()}
          {(() => { const ctx = window.opsContextLine(a); return ctx ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, fontWeight: 600, color: `var(--${ctx.tone})` }}>
              <window.EngIcon name={ctx.icon} size={13} /> {ctx.text}
              {window.canJoinTask(a) && (
                <React.Fragment><span style={{ color: 'var(--text-ghost)' }}>·</span><span style={{ color: 'var(--text-faint)' }}>Masih bisa bergabung</span></React.Fragment>
              )}
            </div>
          ) : null; })()}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-faint)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <window.WorkerStack workers={a.workers} size={26} />
          {a.workers.length > 0 && a.status === 'in_progress' && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>{S.fmtDuration(S.actualMinutes(a))}</span>
          )}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: `var(--${window.targetTone(a)})`, fontWeight: 600, whiteSpace: 'nowrap' }}>
          <window.EngIcon name="clock" size={13} /> {a.target}
        </span>
        <CardAction a={a} role={role} me={me} onOpen={onOpen} />
      </div>
    </Card>
  );
}

function AssignmentQueue({ role, me, onOpen }) {
  const { PageHeader, SectionHeader, Segmented, SearchInput, Button } = AQK;
  const S = useStore();
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const [view, setView] = React.useState('urgent');

  let rows = S.getState().assignments.filter((a) => a.status !== 'done');
  if (cat !== 'all') rows = rows.filter((a) => a.category === cat);
  if (q) rows = rows.filter((a) => (a.title + a.location + a.id + a.requester).toLowerCase().includes(q.toLowerCase()));

  const groups = view === 'urgent'
    ? [{ tag: 'ANTREAN', title: 'Urutan Operasional', sub: `${rows.length} penugasan aktif`, items: rows.slice().sort((x, y) => urgencyScore(x) - urgencyScore(y)) }]
    : ['in_progress', 'available', 'paused', 'verify', 'postponed'].map((s) => ({
        tag: (S.STATUSES[s].label || s).toUpperCase(), title: S.STATUSES[s].label, sub: '',
        items: rows.filter((a) => a.status === s).sort((x, y) => urgencyScore(x) - urgencyScore(y)),
      })).filter((g) => g.items.length);

  const CATS = [['all', 'Semua']].concat(Object.keys(S.CATEGORIES).map((k) => [k, S.CATEGORIES[k].label]));

  return (
    <div>
      <PageHeader crumb="ENGINEERING OPERATIONS" title="Antrean Penugasan"
        lede="Semua penugasan terbuka diurutkan otomatis menurut urgensi operasional — yang paling mendesak di atas."
        actions={<Segmented value={view} onChange={setView} options={[{ value: 'urgent', label: 'Urgensi' }, { value: 'status', label: 'Status' }]} />} />

      <div className="filterbar" style={{ marginTop: 8 }}>
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari penugasan, lokasi, ID…" width={300} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {CATS.slice(0, 6).map(([k, l]) => (
            <button key={k} onClick={() => setCat(k)} className="eng-chip" data-on={cat === k}>{l}</button>
          ))}
        </div>
      </div>

      {groups.map((g) => (
        <div className="level" key={g.tag} style={{ marginTop: 40 }}>
          <SectionHeader tag={g.tag} title={g.title} subtitle={g.sub || `${g.items.length}`} />
          <div className="eng-card-grid">
            {g.items.map((a) => <AssignmentCard key={a.id} a={a} role={role} me={me} onOpen={() => onOpen(a.id)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

window.AssignmentQueue = AssignmentQueue;
window.AssignmentCard = AssignmentCard;
