/* ============================================================
   TimelinePage — Operational Activity Timeline (task-centric).
   NOT a schedule. This answers "what happened to this task over
   time?" — GitHub / Jira / Linear activity style, never a Gantt
   of people's hours (that lives on the Dashboard now).

   Each assignment is an expandable timeline card telling the
   lifecycle STORY of the task: created → notified → workers join
   → started → paused (continue tomorrow) → resumed → completed →
   verified. Multiple engineers appear as natural "join" events,
   not parallel schedule bars.

   Filters (newest first): Semua · Hari Ini · Sedang Berjalan ·
   Menunggu Verifikasi · Dilanjutkan Besok · Postponed · Selesai
   · Critical. Role-scoped: Admin & Koordinator see all; an
   Engineering member sees only tasks they took part in.
   ============================================================ */
const TPK = window.SarprasOperationsDesignSystem_d29aee;

/* event glyph + tone — mirrors the drawer/feed vocabulary */
const TL_EVENT = {
  publish:  { icon: 'bell',         tone: 'c-neutral' },
  start:    { icon: 'play',         tone: 'c-blue' },
  join:     { icon: 'hand',         tone: 'c-green' },
  pause:    { icon: 'moon',         tone: 'c-violet' },
  resume:   { icon: 'play',         tone: 'c-blue' },
  complete: { icon: 'check-circle', tone: 'c-green' },
  await:    { icon: 'clock',        tone: 'c-amber' },
  verify:   { icon: 'check-circle', tone: 'accent' },
  postpone: { icon: 'x-circle',     tone: 'text-faint' },
  reopen:   { icon: 'reset',        tone: 'c-blue' },
};

/* ---- day grouping ------------------------------------------- */
const DAY_LABEL = { kemarin: 'Kemarin', hari_ini: 'Hari Ini' };
function dayOf(time) { return String(time).indexOf('Kemarin') === 0 ? 'kemarin' : 'hari_ini'; }
function dispTime(time) { return String(time).replace(/^Kemarin\s*/, '').trim() || 'baru'; }
function groupByDay(events) {
  const groups = []; let cur = null;
  events.forEach((e) => {
    const d = dayOf(e.time);
    if (!cur || cur.day !== d) { cur = { day: d, events: [] }; groups.push(cur); }
    cur.events.push(e);
  });
  return groups;
}

/* ---- chevron ------------------------------------------------ */
function Chevron({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform .18s cubic-bezier(.2,.7,.2,1)', transform: open ? 'rotate(180deg)' : 'none' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/* ---- one event row inside a card timeline ------------------- */
function EventRow({ e, last }) {
  const { memberByName } = window.EngStore;
  const m = TL_EVENT[e.kind] || TL_EVENT.publish;
  const isPerson = e.actor && e.actor !== 'Sistem';
  const person = isPerson ? memberByName(e.actor) : null;
  const parts = String(e.label).split(' · ');
  const main = parts[0];
  const reason = parts.length > 1 ? parts.slice(1).join(' · ') : null;
  const reasonKinds = e.kind === 'pause' || e.kind === 'postpone' || e.kind === 'await';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '58px 26px 1fr', columnGap: 12, alignItems: 'start' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, textAlign: 'right', paddingTop: 4, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {dispTime(e.time)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: `var(--${m.tone}-weak, var(--surface-2))`, color: `var(--${m.tone})`, boxShadow: 'inset 0 0 0 1px var(--border)' }}>
          <window.EngIcon name={m.icon} size={13} />
        </span>
        {!last && <span style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 3, minHeight: 16, borderRadius: 2 }} />}
      </div>
      <div style={{ paddingBottom: last ? 2 : 18, paddingTop: 2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.006em' }}>{main}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
          {person && <span style={{ width: 17, height: 17, borderRadius: '50%', background: person.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800, flex: 'none' }}>{person.ini}</span>}
          <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>{e.actor}</span>
        </div>
        {reason && (
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 11px', borderRadius: 9, background: reasonKinds ? 'var(--c-amber-weak)' : 'var(--surface-2)', color: reasonKinds ? 'var(--c-amber)' : 'var(--text-dim)' }}>
            {reasonKinds && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.85 }}>Alasan</span>}
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{reason}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- day divider inside a card ------------------------------ */
function DayDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 16px' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-ghost)', flex: 'none' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-faint)' }} />
    </div>
  );
}

/* ---- the expandable timeline card --------------------------- */
function TimelineCard({ a, defaultOpen, onOpen }) {
  const { Card, StatusPill } = TPK;
  const S = window.EngStore;
  const [open, setOpen] = React.useState(defaultOpen);
  const st = S.STATUSES[a.status] || {};
  const cat = S.CATEGORIES[a.category] || S.CATEGORIES.umum;
  const groups = groupByDay(a.timeline);
  const latest = a.timeline[a.timeline.length - 1];
  const room = a.location.split(' · ').slice(-1)[0];

  const Meta = ({ label, children }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-ghost)' }}>{label}</span>
      {children}
    </span>
  );

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {/* header — click to expand */}
      <div onClick={() => setOpen(!open)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center', padding: '20px 24px', cursor: 'pointer' }}>
        <window.CatTile cat={a.category} size={44} radius={13} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-ghost)' }}>{a.id}</span>
            <StatusPill status={st.pill}>{st.label}</StatusPill>
            <window.PriorityTag priority={a.priority} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.018em', color: 'var(--text)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 7, flexWrap: 'wrap' }}>
            <Meta label="Ruang"><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-dim)' }}>{room}</span></Meta>
            {a.workers.length > 0
              ? <Meta label="Tim"><window.WorkerStack workers={a.workers} size={22} max={4} /></Meta>
              : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-ghost)' }}>Belum ada yang bergabung</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flex: 'none' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{latest ? latest.time : ''}</span>
          <span style={{ color: 'var(--text-faint)', display: 'grid', placeItems: 'center', width: 26, height: 26 }}><Chevron open={open} /></span>
        </div>
      </div>

      {/* collapsed summary — the most recent thing that happened */}
      {!open && latest && (
        <div onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 24px 20px', cursor: 'pointer' }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: `var(--${(TL_EVENT[latest.kind] || TL_EVENT.publish).tone}-weak, var(--surface-2))`, color: `var(--${(TL_EVENT[latest.kind] || TL_EVENT.publish).tone})` }}>
            <window.EngIcon name={(TL_EVENT[latest.kind] || TL_EVENT.publish).icon} size={11} />
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(latest.label).split(' · ')[0]}
            {latest.actor !== 'Sistem' && <span style={{ color: 'var(--text-faint)' }}> — {latest.actor}</span>}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-ghost)', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.timeline.length} aktivitas</span>
        </div>
      )}

      {/* expanded — the full lifecycle story */}
      {open && (
        <div className="fade-up" style={{ padding: '4px 24px 22px', borderTop: '1px solid var(--border-faint)', paddingTop: 20 }}>
          {groups.map((g, gi) => (
            <div key={gi}>
              <DayDivider label={DAY_LABEL[g.day] || 'Hari Ini'} />
              {g.events.map((e, ei) => (
                <EventRow key={ei} e={e} last={ei === g.events.length - 1} />
              ))}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="eng-chip" onClick={(ev) => { ev.stopPropagation(); onOpen(a.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              Buka detail <window.EngIcon name="arrow-right" size={13} />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---- filters ------------------------------------------------ */
const FILTERS = [
  { id: 'semua',     label: 'Semua',               test: () => true },
  { id: 'hari_ini',  label: 'Hari Ini',            test: (a) => a.timeline.some((e) => dayOf(e.time) === 'hari_ini') },
  { id: 'berjalan',  label: 'Sedang Berjalan',     test: (a) => a.status === 'in_progress' },
  { id: 'verifikasi',label: 'Menunggu Verifikasi', test: (a) => a.status === 'verify' },
  { id: 'besok',     label: 'Dilanjutkan Besok',   test: (a) => a.status === 'paused' },
  { id: 'postponed', label: 'Postponed',           test: (a) => a.status === 'postponed' },
  { id: 'selesai',   label: 'Selesai',             test: (a) => a.status === 'done' },
  { id: 'kritis',    label: 'Critical',            test: (a) => a.priority === 'kritis' },
];

function TimelinePage({ role, me, onOpen }) {
  const { PageHeader } = TPK;
  const S = useStore();
  const [filter, setFilter] = React.useState('semua');
  const personal = role === 'member';

  let list = S.getState().assignments.slice();
  if (personal) list = list.filter((a) => a.workers.some((w) => w.name === me));

  // newest first — by most recent event
  const rank = (a) => a.timeline.reduce((mx, e, i) => Math.max(mx, window.eventRank(e.time) + i * 0.01), 0);
  list.sort((x, y) => rank(y) - rank(x));

  const count = (f) => list.filter(f.test).length;
  const rows = list.filter((FILTERS.find((f) => f.id === filter) || FILTERS[0]).test);

  // default-open the active stories; collapse settled ones
  const openByDefault = (a) => a.status === 'in_progress' || a.status === 'verify' || a.status === 'paused';

  return (
    <div>
      <PageHeader crumb="ENGINEERING OPERATIONS" title={personal ? 'Timeline Saya' : 'Timeline'}
        lede={personal
          ? 'Riwayat pekerjaan yang Anda tangani — kisah tiap penugasan dari dibuat, dikerjakan, hingga diverifikasi.'
          : role === 'admin'
            ? 'Lini masa operasional Engineering — kisah tiap penugasan dari waktu ke waktu: siapa bergabung, apa yang terjadi, dan status terkininya.'
            : 'Lini masa operasional Engineering — apa yang terjadi pada tiap penugasan, secara kronologis. Bukan jadwal, melainkan riwayat pekerjaan.'} />

      {/* filter chips — newest first */}
      <div className="filterbar" style={{ marginTop: 10, marginBottom: 22 }}>
        {FILTERS.map((f) => {
          const c = count(f);
          return (
            <button key={f.id} className="eng-chip" data-on={filter === f.id} onClick={() => setFilter(f.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {f.label}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, opacity: filter === f.id ? 1 : 0.6 }}>{c}</span>
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>
          <window.EngIcon name="history" size={14} /> Terbaru dahulu
        </span>
      </div>

      {rows.length === 0
        ? <div style={{ paddingTop: 30 }}><TPK.EmptyState title="Tidak ada aktivitas" hint="Tidak ada penugasan pada filter ini. Coba filter lain atau lihat seluruh lini masa." /></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {rows.map((a) => <TimelineCard key={a.id} a={a} defaultOpen={openByDefault(a)} onOpen={onOpen} />)}
          </div>}
    </div>
  );
}

window.TimelinePage = TimelinePage;
