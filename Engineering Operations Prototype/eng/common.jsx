/* ============================================================
   Engineering Operations — shared React helpers.
   - useStore(): subscribe to EngStore, re-render on change,
     plus a 30s ticker so live working-time stays fresh.
   - EngIcon: extends the DS icon set with a few SF-style
     facility glyphs (AC, plumbing, door…) not in the base set.
   - Small presentational atoms reused across screens.
   ============================================================ */
const DSK = window.SarprasOperationsDesignSystem_d29aee;
const S = window.EngStore;

/* ---- extra facility glyphs (stroke, SF-Symbols feel) --------- */
const ENG_ICONS = {
  fan:     { d: 'M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h10a3 3 0 1 1-3 3' },
  bolt:    { d: 'M13 2 5 13h6l-1 9 9-12h-6l0-8z' },
  droplet: { d: 'M12 3s6 6.4 6 10.5A6 6 0 0 1 6 13.5C6 9.4 12 3 12 3z' },
  gauge:   { d: 'M5 18a8 8 0 1 1 14 0M12 12l3.5-2.5M12 12.5a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2z' },
  flame:   { d: 'M12 3c.6 3.4 4 4.2 4 8a4 4 0 0 1-8 0c0-1.6.7-2.6 1.6-3.6.6 1.2 1.4 1.6 2.4 1.6-.4-2.4-1-4-.4-6z' },
  chair:   { d: 'M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M5 10h14v3H5zM7 13v7M17 13v7' },
  door:    { d: 'M6 21V3h11v18M5 21h13M14 12h.6' },
  box:     { d: 'M4 4h16v16H4zM12 4v16M9 9v3M15 9v3' },
  play:    { d: 'M8 5.5v13l10-6.5z', fill: true },
  moon:    { d: 'M20.5 14.5A8 8 0 1 1 10 4a6.2 6.2 0 0 0 10.5 10.5z' },
  sun:     { d: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7' },
  phone:   { d: 'M7 2.5h10v19H7zM10.5 18h3' },
  gear:    { d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 12c0-.5 0-.9-.1-1.3l1.7-1.3-1.7-3-2 .8a6.7 6.7 0 0 0-2.2-1.3L14.5 4h-5l-.6 2.6a6.7 6.7 0 0 0-2.2 1.3l-2-.8-1.7 3L4.7 10.7c0 .4-.1.8-.1 1.3s0 .9.1 1.3L3 14.6l1.7 3 2-.8a6.7 6.7 0 0 0 2.2 1.3L9.5 20h5l.6-2.6a6.7 6.7 0 0 0 2.2-1.3l2 .8 1.7-3-1.7-1.3c.1-.4.1-.8.1-1.3z' },
  history: { d: 'M3.5 12a8.5 8.5 0 1 0 2.8-6.3M6 5.5V9h3.5M12 8v4.2l3 1.8' },
  note:    { d: 'M6 3h9l3 3v15H6zM9 9.5h6M9 13.5h6M9 17.5h3.5' },
  'arrow-left':  { d: 'M15 19l-7-7 7-7' },
  'arrow-right': { d: 'M9 5l7 7-7 7' },
  layers:  { d: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5' },
  hand:    { d: 'M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-3.6-1.6L4 16.5s-1-1.3.2-2.2 2 .4 2 .4L8 16' },
};

function EngIcon({ name, size = 18, tone = 'currentColor', style = {}, strokeWidth, ...rest }) {
  const g = ENG_ICONS[name];
  if (!g) return React.createElement(DSK.Icon, { name, size, tone, style, strokeWidth, ...rest });
  const color = tone === 'currentColor' ? 'currentColor'
    : (String(tone).startsWith('var(') || String(tone).startsWith('#') || String(tone).startsWith('rgb')) ? tone
    : `var(--${String(tone).replace(/^--/, '')})`;
  const filled = !!g.fill;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? color : 'none'} stroke={filled ? 'none' : color}
      strokeWidth={filled ? 0 : (strokeWidth || 1.6)} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }} aria-hidden="true" {...rest}>
      <path d={g.d} />
    </svg>
  );
}

/* ---- store hook --------------------------------------------- */
function useStore() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    const unsub = S.subscribe(() => force());
    const t = setInterval(() => force(), 30000); // keep live durations fresh
    return () => { unsub(); clearInterval(t); };
  }, []);
  return S;
}

/* ---- category tile (rounded glyph chip) --------------------- */
function CatTile({ cat, size = 40, radius = 12 }) {
  const meta = S.CATEGORIES[cat] || S.CATEGORIES.umum;
  const glyph = { fontSize: Math.round(size * 0.5) };
  return (
    <span style={{
      width: size, height: size, flex: `0 0 ${size}px`, borderRadius: radius,
      display: 'grid', placeItems: 'center',
      background: `var(--${meta.tone}-weak, var(--surface-2))`, color: `var(--${meta.tone})`,
    }}>
      <EngIcon name={meta.icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/* ---- priority label with dot -------------------------------- */
function PriorityTag({ priority, mono = true }) {
  const p = S.PRIORITIES[priority] || S.PRIORITIES.sedang;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: `var(--${p.tone})`, fontFamily: mono ? 'var(--font-mono)' : 'inherit', letterSpacing: mono ? '0.02em' : 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${p.tone})`, flex: '0 0 7px' }} />
      {p.label}
    </span>
  );
}

/* ---- stacked worker avatars --------------------------------- */
function WorkerStack({ workers, size = 26, max = 4 }) {
  const shown = workers.slice(0, max);
  const extra = workers.length - shown.length;
  if (!workers.length) return <span style={{ fontSize: 12.5, color: 'var(--text-ghost)', fontWeight: 600 }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {shown.map((w, i) => (
        <span key={w.name} title={w.name} style={{
          width: size, height: size, borderRadius: '50%', background: w.color, color: '#fff',
          display: 'grid', placeItems: 'center', fontSize: size * 0.4, fontWeight: 800,
          border: '2px solid var(--surface)', marginLeft: i ? -size * 0.34 : 0,
          fontFamily: 'var(--font-sans)', position: 'relative',
          boxShadow: w.state === 'active' ? '0 0 0 2px var(--surface), 0 0 0 3.5px var(--c-blue)' : 'none',
        }}>{w.ini}</span>
      ))}
      {extra > 0 && (
        <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--surface-3)', color: 'var(--text-dim)', display: 'grid', placeItems: 'center', fontSize: size * 0.36, fontWeight: 800, border: '2px solid var(--surface)', marginLeft: -size * 0.34 }}>+{extra}</span>
      )}
    </span>
  );
}

/* ---- "time ago"-ish target chip ----------------------------- */
function targetTone(a) {
  if (a.status === 'done') return 'c-green';
  if (a.priority === 'kritis') return 'crit';
  if (a.target && a.target.indexOf('Ditunda') === 0) return 'text-faint';
  return 'text-dim';
}

/* ---- event ranking (rough chronology) ----------------------- */
function eventRank(time) {
  if (time === 'Baru saja') return 100000;
  const m = String(time).match(/(\d\d):(\d\d)/);
  const mins = m ? (+m[1] * 60 + +m[2]) : 0;
  return (String(time).indexOf('Kemarin') === 0 ? 0 : 10000) + mins;
}

// Flatten timeline events across assignments, scoped by role.
// role 'member' → only events where `me` is the actor.
function flattenEvents(role, me) {
  const list = [];
  window.EngStore.getState().assignments.forEach((a) => {
    a.timeline.forEach((e, i) => {
      if (role === 'member' && e.actor !== me) return;
      list.push({ a, e, rank: eventRank(e.time) + i * 0.01 });
    });
  });
  return list.sort((x, y) => y.rank - x.rank);
}

/* ---- compact activity feed (reused on dashboards) ----------- */
function ActivityFeed({ role, me, limit = 6, onOpen }) {
  const EVENT_META = {
    publish: { icon: 'bell', tone: 'c-neutral' }, start: { icon: 'play', tone: 'c-blue' },
    join: { icon: 'hand', tone: 'c-green' }, pause: { icon: 'moon', tone: 'c-violet' },
    resume: { icon: 'play', tone: 'c-blue' }, complete: { icon: 'check-circle', tone: 'c-green' },
    await: { icon: 'clock', tone: 'c-amber' }, verify: { icon: 'check-circle', tone: 'accent' },
    postpone: { icon: 'x-circle', tone: 'text-faint' }, reopen: { icon: 'reset', tone: 'c-blue' },
  };
  const rows = flattenEvents(role, me).slice(0, limit);
  if (!rows.length) return <div style={{ padding: '20px 4px', color: 'var(--text-faint)', fontSize: 13 }}>Belum ada aktivitas.</div>;
  return (
    <div>
      {rows.map(({ a, e }, i) => {
        const m = EVENT_META[e.kind] || EVENT_META.publish;
        return (
          <div key={a.id + i} onClick={() => onOpen && onOpen(a.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 4px', borderTop: i ? '1px solid var(--border-faint)' : 'none', cursor: 'pointer' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, flex: 'none', display: 'grid', placeItems: 'center', background: `var(--${m.tone}-weak, var(--surface-2))`, color: `var(--${m.tone})` }}>
              <EngIcon name={m.icon} size={14} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: e.actor === 'Sistem' ? 'var(--text-dim)' : 'var(--text)' }}>{e.actor}</span> · {e.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.time}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---- operational context line (collaborative signal) -------- */
function opsContextLine(a) {
  if (a.status === 'done' || a.status === 'postponed') return null;
  const active = a.workers.filter((w) => w.state === 'active').length;
  const paused = a.workers.filter((w) => w.state === 'paused').length;
  if (active === 0 && paused === 0) return { text: 'Belum ada Engineering', tone: 'text-faint', icon: 'wrench' };
  if (active > 0) return { text: `${active} Engineering sedang bekerja`, tone: 'c-blue', icon: 'play' };
  return { text: `${paused} Engineering menunggu lanjut`, tone: 'c-violet', icon: 'moon' };
}

// Whether this assignment is still open for another Engineering to join —
// used so cards/drawer never read as "locked" to a collaborative task.
function canJoinTask(a) {
  return a.status === 'available' || a.status === 'in_progress' || a.status === 'paused';
}

// Urgency badges surfaced on cards — Critical / Prioritas Tinggi / Deadline Hari Ini.
function urgencyBadges(a) {
  const b = [];
  if (a.status === 'done' || a.status === 'postponed') return b;
  if (a.priority === 'kritis') b.push({ label: 'Critical', tone: 'crit' });
  else if (a.priority === 'tinggi') b.push({ label: 'Prioritas Tinggi', tone: 'c-amber' });
  if (String(a.target).indexOf('Hari ini') === 0) b.push({ label: 'Deadline Hari Ini', tone: 'c-amber' });
  return b;
}

Object.assign(window, { EngIcon, useStore, CatTile, PriorityTag, WorkerStack, targetTone, ENG_ICONS, eventRank, flattenEvents, ActivityFeed, opsContextLine, canJoinTask, urgencyBadges });
