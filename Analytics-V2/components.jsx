/* ============================================================
   components.jsx — shared analytics widgets (refined, calm)
   Exposes: Eyebrow, Card, Stat, HBarList, RankTable, InsightList,
   DestList, UtilGrid, HealthDetail, Funnel, AiCard, FutureCard
   ============================================================ */

const fmtNum = (n) => Math.round(n).toLocaleString('id-ID');
const fmtKm = (n) => Math.round(n).toLocaleString('id-ID');

/* ---------------- Eyebrow / section header ---------------- */
function Eyebrow({ tag, title, sub, act, onAct }) {
  return (
    <div className="eyebrow">
      {tag && <span className="tag">{tag}</span>}
      <h2>{title}</h2>
      {sub && <span className="sub">{sub}</span>}
      <span className="line" />
      {act && <span className="act" onClick={onAct}>{act} <Icon name="chevR" size={13} /></span>}
    </div>
  );
}

/* ---------------- Card ---------------- */
function Card({ title, sub, tools, children, className = '', hoverable = true, exportable = true, lead = false, style }) {
  return (
    <div className={`card fade-up ${hoverable ? 'hoverable' : ''} ${lead ? 'lead' : ''} ${className}`} style={style}>
      {(title || tools) && (
        <div className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="ch-sub">{sub}</div>}
          </div>
          <div className="card-tools">
            {tools}
            {exportable && (
              <button className="icon-btn" title="Ekspor kartu" aria-label="Ekspor kartu">
                <Icon name="download" size={14} />
              </button>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------------- Inline stat ---------------- */
function Stat({ label, value, tone }) {
  return (
    <div className="st">
      <div className="l">{label}</div>
      <div className={`v ${tone === 'up' ? 'up' : ''}`}>{value}</div>
    </div>
  );
}

/* ---------------- Horizontal bar list ---------------- */
function HBarList({ items, valueKey, labelKey = 'name', unit = '', color = 'var(--accent)', max, onPick, fmt }) {
  const mx = max || Math.max(...items.map((d) => d[valueKey]));
  return (
    <div className="hbars">
      {items.map((d, i) => {
        const pct = (d[valueKey] / mx) * 100;
        return (
          <div className="hbar" key={i} onClick={() => onPick && onPick(d)}>
            <span className="nm" title={d[labelKey]}>
              <span className="rank">{i + 1}</span>{d[labelKey]}
            </span>
            <div className="track">
              <div className="fill" style={{ width: `${pct}%`, background: color, opacity: i === 0 ? 1 : 0.78 }} />
            </div>
            <span className="val">{fmt ? fmt(d[valueKey]) : fmtNum(d[valueKey])}{unit}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Ranking table ---------------- */
function RankTable({ cols, rows, onPick }) {
  const barCol = cols.find((c) => c.bar);
  const mx = barCol ? Math.max(...rows.map((r) => r[barCol.key])) : 1;
  return (
    <div className="rtable-wrap">
      <table className="rtable">
        <thead>
          <tr>{cols.map((c, i) => <th key={i} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} onClick={() => onPick && onPick(r)}>
              {cols.map((c, ci) => {
                if (c.bar) {
                  return (
                    <td key={ci} className="barcell">
                      <div className="minibar"><i style={{ width: `${(r[c.key] / mx) * 100}%`, background: c.color || 'var(--accent-line)' }} /></div>
                    </td>
                  );
                }
                return (
                  <td key={ci} className={`${c.num ? 'num mono' : ''} ${c.primary ? 'nm' : ''}`}>
                    {c.render ? c.render(r, ri) : (c.fmt ? c.fmt(r[c.key]) : r[c.key])}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Insight list ---------------- */
function InsightList({ items }) {
  const icoFor = { crit: 'alert', warn: 'bolt', info: 'spark', good: 'check' };
  return (
    <div className="insights">
      {items.map((s, i) => (
        <div className="insight" key={i}>
          <div className={`ib ib-${s.ib}`}><Icon name={icoFor[s.ib] || 'spark'} size={16} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="it">{s.title}<span className={`sev sev-${s.sev}`}>{s.sevLabel}</span></div>
            <div className="id">{s.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Destination list ---------------- */
function DestList({ items, onPick }) {
  const mx = Math.max(...items.map((d) => d.distance));
  return (
    <div className="dest">
      {items.map((d, i) => (
        <div className="row" key={i} onClick={() => onPick && onPick(d)}>
          <div className="nm"><span className="pin"><Icon name="pin" size={13} /></span>{d.name}</div>
          <div className="vv">{fmtKm(d.distance)} km · {d.trips}×</div>
          <div className="bar"><i style={{ width: `${(d.distance / mx) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Utilization grid ---------------- */
function UtilGrid({ items }) {
  return (
    <div className="util-grid">
      {items.map((u, i) => {
        const tone = u.util >= 0.85 ? 'var(--accent)' : u.util >= 0.6 ? 'var(--c-green)' : 'var(--c-amber)';
        return (
          <div className="util-cell" key={i}>
            <div className="uh"><span>{u.name}</span>
              <span className="pl">{u.plate || ''}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div className="uv" style={{ color: tone }}>{Math.round(u.util * 100)}%</div>
              <RingGauge value={u.util} size={44} thickness={5} color={tone} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Health detail (deep tab) ---------------- */
function HealthDetail({ health }) {
  const toneColor = { good: 'var(--c-green)', warn: 'var(--c-amber)', crit: 'var(--accent)' };
  const toneVal = { good: 'var(--c-green)', warn: 'var(--c-amber)', crit: 'var(--accent)' };
  return (
    <div className="health-detail">
      {health.metrics.map((m, i) => {
        const num = parseFloat(m.vv);
        const pct = m.vv.includes('%') ? Math.min(100, num) : Math.min(100, num * 10);
        return (
          <div className="metric" key={i}>
            <span className="nm">{m.nm}</span>
            <span className="bar"><i style={{ width: `${pct}%`, background: toneColor[m.tone] }} /></span>
            <span className="vv" style={{ color: toneVal[m.tone] }}>{m.vv}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Funnel ---------------- */
function Funnel({ data }) {
  const mx = data[0].value;
  const colors = ['var(--c-neutral)', 'var(--c-blue)', 'var(--c-violet)', 'var(--c-green)'];
  return (
    <div className="funnel">
      {data.map((d, i) => {
        const pct = (d.value / mx) * 100;
        const drop = i > 0 ? (((data[i - 1].value - d.value) / data[i - 1].value) * 100).toFixed(1) : null;
        return (
          <div className="frow" key={i}>
            <span className="fl">{d.label}</span>
            <div className="ftrack">
              <div className="ffill" style={{ width: `${pct}%`, background: colors[i] }}>{d.value}</div>
            </div>
            <span className="fdrop" style={{ color: drop ? 'var(--accent)' : 'var(--text-faint)' }}>
              {drop ? `−${drop}%` : '100%'}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- AI assistant (quiet strip — enhancement layer) ---------------- */
function AiCard() {
  const [q, setQ] = useState('');
  return (
    <div className="ai-strip">
      <span className="ai-glyph"><Icon name="sparkle" size={15} fill /></span>
      <div className="ai-text">
        <span className="ai-title">AI Operations Assistant</span>
        <span className="ai-desc">Tanya apa saja tentang data operasional Anda</span>
      </div>
      <div className="ai-q">
        <input placeholder="Driver mana dengan beban tertinggi bulan ini?" value={q} onChange={(e) => setQ(e.target.value)} disabled />
        <button aria-label="Kirim" disabled><Icon name="arrowR" size={15} /></button>
      </div>
      <span className="ai-badge">Segera Hadir</span>
    </div>
  );
}

/* ---------------- Future roadmap card ---------------- */
function FutureCard({ item }) {
  return (
    <div className="future fade-up">
      <div className="fi"><Icon name={item.icon} size={17} /></div>
      <div className="ft">{item.title}</div>
      <div className="fd">{item.desc}</div>
      <span className="fbadge">Roadmap · {item.badge}</span>
    </div>
  );
}

Object.assign(window, {
  Eyebrow, Card, Stat, HBarList, RankTable, InsightList,
  DestList, UtilGrid, HealthDetail, Funnel, AiCard, FutureCard, fmtNum, fmtKm,
});
