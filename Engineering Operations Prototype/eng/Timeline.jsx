/* ============================================================
   Timeline — operational history (NOT a calendar).
   A vertical rail: time · connector node · actor · what happened.
   Reused inside the assignment drawer and the mobile field view.
   ============================================================ */
const TLK = window.SarprasOperationsDesignSystem_d29aee;

const EVENT_META = {
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

// Current status implied by each event kind — makes the timeline read as
// a complete story (who · did what · current status) rather than a raw log.
const STATUS_LABEL = {
  publish: 'Menunggu Engineering', start: 'Sedang Berjalan', join: 'Sedang Berjalan',
  resume: 'Sedang Berjalan', pause: 'Dilanjutkan Besok', complete: 'Menunggu Verifikasi',
  await: 'Menunggu Verifikasi', verify: 'Terverifikasi', postpone: 'Ditunda', reopen: 'Sedang Berjalan',
};

function Timeline({ events, dense = false }) {
  const { memberByName } = window.EngStore;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((e, i) => {
        const m = EVENT_META[e.kind] || EVENT_META.publish;
        const isPerson = e.actor && e.actor !== 'Sistem';
        const person = isPerson ? memberByName(e.actor) : null;
        const last = i === events.length - 1;
        const parts = String(e.label).split(' · ');
        const mainLabel = parts[0];
        const reason = parts[1];
        const status = STATUS_LABEL[e.kind];
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: dense ? '58px 26px 1fr' : '76px 30px 1fr', gap: dense ? 10 : 14, alignItems: 'start' }}>
            {/* time */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: dense ? 11 : 12, color: 'var(--text-faint)', fontWeight: 600, textAlign: 'right', paddingTop: dense ? 3 : 5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {e.time}
            </div>
            {/* node + connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
              <span style={{
                width: dense ? 22 : 26, height: dense ? 22 : 26, borderRadius: '50%', flex: 'none',
                display: 'grid', placeItems: 'center', background: `var(--${m.tone}-weak, var(--surface-2))`,
                color: `var(--${m.tone})`, boxShadow: 'inset 0 0 0 1px var(--border)',
              }}>
                <window.EngIcon name={m.icon} size={dense ? 12 : 14} />
              </span>
              {!last && <span style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 3, minHeight: dense ? 14 : 18, borderRadius: 2 }} />}
            </div>
            {/* content */}
            <div style={{ paddingBottom: last ? 0 : (dense ? 14 : 18), paddingTop: dense ? 1 : 3 }}>
              <div style={{ fontSize: dense ? 13 : 13.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.006em' }}>{mainLabel}</div>
              {reason && <div style={{ fontSize: dense ? 11 : 11.5, color: 'var(--text-faint)', fontWeight: 600, marginTop: 2 }}>{reason.charAt(0).toUpperCase() + reason.slice(1)}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                {person && (
                  <span style={{ width: 17, height: 17, borderRadius: '50%', background: person.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800, flex: 'none' }}>{person.ini}</span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>{e.actor}</span>
                {status && (
                  <React.Fragment>
                    <span style={{ color: 'var(--text-ghost)' }}>·</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: `var(--${m.tone})` }}>{status}</span>
                  </React.Fragment>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.Timeline = Timeline;
