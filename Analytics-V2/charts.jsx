/* ============================================================
   charts.jsx — SVG charts + UI icons + count-up hook
   Exposes to window: Icon, useCountUp, Sparkline, AreaChart,
   Donut, RingGauge, Funnel
   ============================================================ */

const { useState, useEffect, useRef, useMemo } = React;

/* ---------------- ICONS (simple stroke set) ---------------- */
const PATHS = {
  clipboard: 'M9 3h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a1 1 0 0 1 1-1Zm0 2v1h6V5H9Z',
  check: 'M20 6 9 17l-5-5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  truck: 'M3 6h11v9H3zM14 9h4l3 3v3h-7zM7.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  route: 'M6 19a3 3 0 0 0 3-3V8a3 3 0 0 1 6 0v8M6 19a3 3 0 0 1-3-3M18 5l2 2-2 2M6 19h.01M18 16v.01',
  gauge: 'M12 14l4-4M21 12a9 9 0 1 0-18 0M12 21a9 9 0 0 0 9-9',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z',
  building: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M7.5 8h.5M7.5 12h.5M7.5 16h.5M11 8h.5M11 12h.5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  arrowL: 'M15 18l-6-6 6-6', arrowR: 'M9 6l6 6-6 6',
  chevron: 'M6 9l6 6 6-6',
  download: 'M12 3v12M7 11l5 5 5-5M5 21h14',
  plus: 'M12 5v14M5 12h14',
  reset: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  x: 'M6 6l12 12M18 6 6 18',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layout: 'M4 4h16v4H4zM4 11h7v9H4zM13 11h7v9h-7z',
  workspace: 'M4 5h16v4H4zM4 13h6v6H4zM14 13h6v6h-6z',
  spark: 'M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6',
  trend: 'M3 17l6-6 4 4 7-7M14 8h6v6',
  wrench: 'M14.5 6.5a3.5 3.5 0 0 0-4.6 4.6l-6.2 6.2a1.5 1.5 0 0 0 2.1 2.1l6.2-6.2a3.5 3.5 0 0 0 4.6-4.6l-2.1 2.1-2-2 2-2z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 1.4-2.5 1.5-2.5 2.5M14.5 14.5a2.5 2 0 0 1-5 0',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  sparkle: 'M12 3l1.6 4.8L18 9.4l-4.4 1.6L12 16l-1.6-5L6 9.4l4.4-1.6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  filter: 'M3 5h18l-7 8v5l-4 2v-7z',
  alert: 'M12 9v4M12 17h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6z',
  flag: 'M5 21V4M5 4h11l-2 3 2 3H5',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  pulse: 'M3 12h4l2-6 4 12 2-6h6',
  arrowUR: 'M7 17 17 7M8 7h9v9',
  chevR: 'M9 6l6 6-6 6',
  ruler: 'M3 9.5 9.5 3 21 14.5 14.5 21 3 9.5ZM7 8l1.5 1.5M10 11l1.5 1.5M13 8l1.5 1.5',
  layers: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 16.5l9 5 9-5',
  car: 'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14m-14 0a2 2 0 0 0-2 2v3h2m14-5a2 2 0 0 1 2 2v3h-2m-12 0h10m-10 0v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1m12 0v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1M7.5 14h.01M16.5 14h.01',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z',
};
function Icon({ name, size = 16, stroke = 2, fill = false, style, className }) {
  const d = PATHS[name] || '';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round"
      strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ---------------- count-up hook ---------------- */
function useCountUp(target, { duration = 1100, decimals = 0, enabled = true } = {}) {
  const [val, setVal] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) { setVal(target); return; }
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const steps = Math.max(1, Math.round(duration / 16));
    let i = 0, timer;
    const tick = () => {
      i++;
      const p = Math.min(1, i / steps);
      setVal(target * ease(p));
      if (p < 1) timer = setTimeout(tick, 16);
    };
    timer = setTimeout(tick, 16);
    return () => clearTimeout(timer);
  }, [target, duration, enabled]);
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

/* ---------------- Sparkline ---------------- */
function Sparkline({ data, color = 'var(--accent)', w = 120, h = 28, fillArea = true }) {
  const { d, area } = useMemo(() => {
    const max = Math.max(...data), min = Math.min(...data);
    const rng = max - min || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => [i * step, h - 3 - ((v - min) / rng) * (h - 6)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const ar = `${line} L${w},${h} L0,${h} Z`;
    return { d: line, area: ar };
  }, [data, w, h]);
  const id = useMemo(() => 'sg' + Math.random().toString(36).slice(2, 7), []);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fillArea && <path d={area} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- AreaChart (trend) ---------------- */
function AreaChart({ data, height = 260, anim = true }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(680);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const padL = 34, padR = 12, padT = 14, padB = 26;
  const H = height;
  const vals = data.map((d) => d.value);
  const maxV = Math.ceil(Math.max(...vals) / 2) * 2 + 2;
  const innerW = w - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (innerW * i) / (data.length - 1);
  const y = (v) => padT + innerH - (v / maxV) * innerH;
  const line = (key) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const areaPath = `${line('value')} L${x(data.length - 1)},${padT + innerH} L${padL},${padT + innerH} Z`;
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((g) => padT + innerH - g * innerH);
  const ticks = data.filter((_, i) => i % 5 === 0 || i === data.length - 1);

  return (
    <div ref={wrapRef} className="chart-wrap" style={{ position: 'relative' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${w} ${H}`} style={{ display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * w;
          let i = Math.round(((px - padL) / innerW) * (data.length - 1));
          i = Math.max(0, Math.min(data.length - 1, i));
          setHover(i);
        }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridY.map((gy, i) => (
          <line key={i} x1={padL} x2={w - padR} y1={gy} y2={gy} stroke="var(--border-faint)" strokeWidth="1" />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <text key={i} x={padL - 8} y={padT + innerH - g * innerH + 3} textAnchor="end"
            fontSize="9.5" fill="var(--text-ghost)" fontFamily="var(--font-mono)">{Math.round(g * maxV)}</text>
        ))}
        <path d={areaPath} fill="url(#areaFill)" className={anim ? 'area-draw' : ''} />
        <path d={line('value')} fill="none" stroke="var(--accent)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className={anim ? 'line-draw' : ''}
          style={{ strokeDasharray: anim ? 2400 : 'none', strokeDashoffset: 0 }} />
        <path d={line('completed')} fill="none" stroke="var(--text-faint)" strokeWidth="1.4"
          strokeDasharray="3 5" opacity="0.65" />
        {ticks.map((d) => {
          const i = data.indexOf(d);
          return <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9.5"
            fill="var(--text-ghost)" fontFamily="var(--font-mono)">{d.label}</text>;
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hover != null && (() => {
        const cw = wrapRef.current?.clientWidth || w;
        const px = (x(hover) / w) * cw;
        const left = Math.min(Math.max(8, px - 60), cw - 132);
        return (
        <div style={{
          position: 'absolute', top: 6, left,
          background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 11, padding: '9px 12px',
          pointerEvents: 'none', minWidth: 118, boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{data[hover].label} 2026</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--accent)' }} />
            {data[hover].value} penugasan
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--text-faint)' }} />
            {data[hover].completed} selesai
          </div>
        </div>
        );
      })()}
    </div>
  );
}

/* ---------------- Donut ---------------- */
function Donut({ data, size = 188, thickness = 24, anim = true, centerLabel, centerValue, onSlice }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const [active, setActive] = useState(null);
  let acc = 0;
  const segs = data.map((d) => {
    const frac = d.value / total;
    const seg = { ...d, frac, offset: acc };
    acc += frac;
    return seg;
  });
  return (
    <div className="donut-wrap">
      <div style={{ position: 'relative', width: size, height: size, flex: `0 0 ${size}px` }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          {segs.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
              strokeWidth={active === i ? thickness + 4 : thickness}
              strokeDasharray={`${(s.frac * circ).toFixed(2)} ${circ.toFixed(2)}`}
              strokeDashoffset={anim ? 0 : -(s.offset * circ)}
              style={{
                strokeDashoffset: -(s.offset * circ),
                transition: 'stroke-width .15s, opacity .15s',
                opacity: active == null || active === i ? 1 : 0.4,
                cursor: 'pointer',
              }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
              onClick={() => onSlice && onSlice(s)} />
          ))}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div className="donut-center">
            <div className="big" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {active != null ? segs[active].value : (centerValue ?? total)}
            </div>
            <div className="lab">{active != null ? segs[active].label : (centerLabel || 'Total')}</div>
          </div>
        </div>
      </div>
      <div className="legend" style={{ flexDirection: 'column', gap: 9 }}>
        {segs.map((s, i) => (
          <div key={i} className="li" style={{ cursor: 'pointer', opacity: active == null || active === i ? 1 : 0.5 }}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => onSlice && onSlice(s)}>
            <span className="sw" style={{ background: s.color }} />
            <span style={{ minWidth: 96 }}>{s.label}</span>
            <span className="vv">{s.value}</span>
            <span className="vv muted">{(s.frac * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- RingGauge ---------------- */
function RingGauge({ value, size = 38, thickness = 5, color = 'var(--accent)', track = 'var(--surface-2)', label }) {
  const r = (size - thickness) / 2;
  const cx = size / 2, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={track} strokeWidth={thickness} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={thickness}
        strokeLinecap="round" strokeDasharray={`${(value * circ).toFixed(1)} ${circ.toFixed(1)}`}
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dasharray .9s cubic-bezier(.2,.7,.2,1)' }} />
      {label && <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.26} fontWeight="800" fill="var(--text)" fontFamily="var(--font-display)">{label}</text>}
    </svg>
  );
}

/* ---------------- Semi gauge (health) ---------------- */
function SemiGauge({ value, max = 100, size = 168, color = 'var(--st-done)' }) {
  const r = size / 2 - 12;
  const cx = size / 2, cy = size / 2;
  const circ = Math.PI * r;
  const frac = value / max;
  return (
    <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none"
        stroke="var(--surface-2)" strokeWidth="12" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none"
        stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(frac * circ).toFixed(1)} ${circ.toFixed(1)}`}
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)' }} />
    </svg>
  );
}

Object.assign(window, { Icon, useCountUp, Sparkline, AreaChart, Donut, RingGauge, SemiGauge });
