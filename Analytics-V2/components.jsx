/* ============================================================
   components.jsx — analytics widgets
   Exposes: SectionHead, Card, KpiCard, HBarList, RankTable,
   InsightList, DestList, UtilGrid, HealthCard, AiCard,
   FutureCard, Funnel
   ============================================================ */

const fmtNum = (n) => Math.round(n).toLocaleString('id-ID');
const fmtKm = (n) => Math.round(n).toLocaleString('id-ID');

function SectionHead({ n, title, sub, right }) {
  return (
    <div className="sec-head">
      {n && <span className="n">{n}</span>}
      <h2>{title}</h2>
      {sub && <span className="sub">· {sub}</span>}
      <span className="line" />
      {right}
    </div>
  );
}

function Card({ title, sub, tools, children, className = '', hoverable = true, exportable = true, style }) {
  return (
    <div className={`card fade-up ${hoverable ? 'hoverable' : ''} ${className}`} style={style}>
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

/* ---------------- KPI card ---------------- */
function KpiCard({ kpi, anim }) {
  const isEntity = !!kpi.entity;
  const decimals = kpi.fmt === 'pct1' || kpi.fmt === 'km1' ? 1 : 0;
  const counted = useCountUp(isEntity ? 0 : kpi.value, { decimals, enabled: anim });
  const display = () => {
    const v = counted;
    switch (kpi.fmt) {
      case 'pct1': return [v.toFixed(1), '%'];
      case 'pct0': return [Math.round(v), '%'];
      case 'km': return [fmtKm(v), ' km'];
      case 'km1': return [v.toFixed(1), ' km'];
      default: return [fmtNum(v), ''];
    }
  };
  const [val, unit] = display();
  const trendCls = kpi.trend > 0 ? 'up' : kpi.trend < 0 ? 'down' : 'flat';
  const trendArrow = kpi.trend > 0 ? '↑' : kpi.trend < 0 ? '↓' : '→';
  const spark = useMemo(() => Array.from({ length: 14 }, (_, i) =>
    50 + Math.sin(i * 0.7 + (kpi.id || '').length) * 14 + (i / 14) * (kpi.trend || 0)), [kpi.id]);

  return (
    <div className="card kpi fade-up hoverable">
      <div className="kh">
        <span className="klabel">{kpi.label}</span>
        <span className="kico"><Icon name={kpi.icon} size={15} /></span>
      </div>
      {isEntity ? (
        <div className="kentity">
          <span className="av">{kpi.entity[0]}</span>
          <div>
            <div className="nm">{kpi.entity}</div>
            <div className="ksub">{kpi.entityVal}</div>
          </div>
        </div>
      ) : (
        <div className="kval">{val}<span className="unit">{unit}</span></div>
      )}
      <div className="kfoot">
        {!isEntity && kpi.trend != null && (
          <span className={`trend ${trendCls}`}>{trendArrow} {Math.abs(kpi.trend).toFixed(1)}%</span>
        )}
        {!isEntity && <span className="ksub">{kpi.sub}</span>}
        {isEntity && <span className="trend up" style={{ background: 'var(--accent-weak)', color: 'var(--accent-2)' }}>Top 1</span>}
      </div>
      {!isEntity && <div className="spark"><Sparkline data={spark} color={kpi.trend >= 0 ? 'var(--st-done)' : 'var(--accent)'} /></div>}
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
        const grad = `linear-gradient(90deg, ${color}, color-mix(in oklch, ${color} 70%, #000))`;
        return (
          <div className="hbar" key={i} onClick={() => onPick && onPick(d)}>
            <span className="nm" title={d[labelKey]}>
              <span className="rank">{i + 1}</span>{d[labelKey]}
            </span>
            <div className="track">
              <div className="fill" style={{ width: `${pct}%`, background: grad,
                boxShadow: i === 0 ? `0 0 0 1px ${color} inset` : 'none' }} />
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
    <div style={{ overflowX: 'auto', margin: '0 -4px' }}>
    <table className="rtable" style={{ minWidth: 520 }}>
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

/* ---------------- Utilization overview grid ---------------- */
function UtilGrid({ items }) {
  return (
    <div className="util-grid">
      {items.map((u, i) => {
        const tone = u.util >= 0.85 ? 'var(--accent)' : u.util >= 0.6 ? 'var(--st-done)' : 'var(--st-sched)';
        return (
          <div className="util-cell" key={i}>
            <div className="uh"><span>{u.name}</span>
              <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 10.5 }}>{u.plate || ''}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div className="uv" style={{ color: tone }}>{Math.round(u.util * 100)}%</div>
              <RingGauge value={u.util} size={42} thickness={5} color={tone} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Health card ---------------- */
function HealthCard({ health, anim }) {
  const score = useCountUp(health.score, { enabled: anim });
  const toneColor = { good: 'var(--st-done)', warn: 'var(--st-sched)', crit: 'var(--accent-2)' };
  return (
    <div className="card health fade-up hoverable">
      <div className="card-head">
        <div><h3>Skor Kesehatan Operasional</h3><div className="ch-sub">Komposit periode 30 hari</div></div>
        <button className="icon-btn" title="Ekspor"><Icon name="download" size={14} /></button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ position: 'relative' }}>
          <SemiGauge value={health.score} color="var(--st-done)" size={150} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 6, textAlign: 'center' }}>
            <div className="score">{Math.round(score)}</div>
          </div>
        </div>
        <div>
          <span className="grade" style={{ background: 'rgba(63,178,127,0.13)', color: 'var(--st-done)' }}>
            <Icon name="check" size={13} /> {health.grade}
          </span>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8, maxWidth: 150, lineHeight: 1.45 }}>
            Operasi berjalan stabil. 1 area perlu perhatian.
          </div>
        </div>
      </div>
      <div style={{ marginTop: 4 }}>
        {health.metrics.map((m, i) => (
          <div className="metric" key={i}>
            <span className="nm">{m.nm}</span>
            <span className="vv" style={{ color: toneColor[m.tone] }}>{m.vv}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Funnel (lifecycle) ---------------- */
function Funnel({ data }) {
  const mx = data[0].value;
  const colors = ['var(--c-neutral)', 'var(--st-active)', 'var(--c-violet)', 'var(--st-done)'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => {
        const pct = (d.value / mx) * 100;
        const drop = i > 0 ? (((data[i - 1].value - d.value) / data[i - 1].value) * 100).toFixed(1) : null;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600 }}>{d.label}</span>
            <div style={{ height: 26, borderRadius: 7, background: 'var(--panel-3)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 7,
                background: `linear-gradient(90deg, ${colors[i]}, color-mix(in oklch, ${colors[i]} 65%, #000))`,
                transition: 'width .9s cubic-bezier(.2,.7,.2,1)', display: 'flex', alignItems: 'center',
                justifyContent: 'flex-end', paddingRight: 9, color: '#fff', fontSize: 11.5, fontWeight: 700,
                fontFamily: 'var(--font-mono)' }}>{d.value}</div>
            </div>
            <span style={{ fontSize: 11, color: drop ? 'var(--accent-2)' : 'var(--text-faint)', fontFamily: 'var(--font-mono)', minWidth: 42, textAlign: 'right' }}>
              {drop ? `−${drop}%` : '100%'}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- AI Operations Assistant placeholder ---------------- */
function AiCard() {
  const [q, setQ] = useState('');
  const chips = [
    'Driver mana yang overload minggu ini?',
    'Prediksi permintaan bidang 7 hari',
    'Kendaraan yang perlu perawatan',
    'Ringkas tren jarak tempuh',
  ];
  return (
    <div className="ai-card fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-weak)', border: '1px solid var(--accent-line)', display: 'grid', placeItems: 'center', color: 'var(--accent-2)' }}>
            <Icon name="sparkle" size={18} fill />
          </div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, margin: 0 }}>AI Operations Assistant</h3>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Tanya apa saja tentang data operasional Anda</div>
          </div>
        </div>
        <span className="ai-badge"><Icon name="bolt" size={11} fill /> Segera Hadir</span>
      </div>
      <div className="ai-q">
        <input placeholder="Contoh: Driver mana dengan beban kerja tertinggi bulan ini?" value={q} onChange={(e) => setQ(e.target.value)} disabled />
        <button className="btn btn-primary" style={{ height: 42 }} disabled><Icon name="arrowR" size={16} /></button>
      </div>
      <div className="ai-chips">
        {chips.map((c, i) => <button className="ai-chip" key={i} onClick={() => setQ(c)}>{c}</button>)}
      </div>
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
  SectionHead, Card, KpiCard, HBarList, RankTable, InsightList,
  DestList, UtilGrid, HealthCard, Funnel, AiCard, FutureCard, fmtNum, fmtKm,
});
