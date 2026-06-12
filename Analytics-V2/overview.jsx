/* ============================================================
   overview.jsx — Level 1 (Executive Overview) + Level 2 (Highlights)
   The "3-5 second understanding" layer. Calm, Keynote-grade.
   Exposes: ExecutiveOverview, Highlights
   ============================================================ */

/* ---------------- LEVEL 1 — Executive Hero (keynote) ---------------- */
function ExecutiveOverview({ data, anim, onAlert }) {
  const D = data;
  const score = useCountUp(D.health.score, { enabled: anim });
  const total = useCountUp(D.totalAssign, { enabled: anim });
  const compl = useCountUp(94.3, { decimals: 1, enabled: anim });
  const critCount = D.insights.filter((i) => i.sev === 'crit').length;

  return (
    <section className="level hero" id="overview">
      {/* keynote headline — one idea, big */}
      <div className="hero-head fade-up">
        <h1 className="hero-title">Operasi berjalan <span className="hl">sehat</span>.</h1>
        <p className="hero-sub">
          {D.totalAssign} penugasan · <span className="up">94,3% penyelesaian</span> · naik 12,4% dari periode sebelumnya.
        </p>
        {critCount > 0 && (
          <button className="hero-attn" onClick={onAlert}>
            <span className="dot" /> {critCount} area memerlukan perhatian
            <Icon name="chevR" size={13} />
          </button>
        )}
      </div>

      {/* primary anchor: health score + supporting metrics, on whitespace */}
      <div className="hero-metrics fade-up">
        <div className="hm-health">
          <div className="gwrap">
            <RingGauge value={D.health.score / 100} size={172} thickness={13} color="var(--c-green)" />
            <div className="score">
              <span className="v">{Math.round(score)}</span>
              <span className="s">/ 100</span>
            </div>
          </div>
          <div className="meta">
            <div className="lbl">Kesehatan Operasional</div>
            <span className="grade"><Icon name="check" size={13} /> {D.health.grade}</span>
          </div>
        </div>

        <div className="hm-stats">
          <div className="hm-stat">
            <div className="lbl">Total Penugasan</div>
            <div className="big">{fmtNum(total)}</div>
            <div className="delta up"><Icon name="arrowUR" size={13} /> 12,4% <span>vs 30 hari lalu</span></div>
          </div>

          <div className="hm-stat">
            <div className="lbl">Tingkat Penyelesaian</div>
            <div className="big">{compl.toFixed(1)}<span className="u">%</span></div>
            <div className="delta up"><Icon name="arrowUR" size={13} /> 2,1% <span>218 dari 247</span></div>
          </div>

          <div className="hm-stat alert">
            <div className="lbl">Peringatan Kritis</div>
            <div className="big">{critCount}</div>
            <button className="alertbtn" onClick={onAlert}>Tinjau sekarang <Icon name="chevR" size={12} /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- LEVEL 2 — Operational Highlights (editorial trio) ---------------- */
function Highlights({ data, onPick }) {
  const D = data;
  const topDriver = D.drivers[0];
  const topVeh = D.vehicles[0];

  return (
    <section className="level" id="highlights">
      <Eyebrow tag="02" title="Sorotan Operasional" sub="Tiga temuan paling menentukan" />
      <div className="highlights">
        <button className="hl-item" onClick={() => onPick('driver', topDriver.name)}>
          <span className="hl-eye">Driver Paling Aktif</span>
          <div className="hl-val">
            <span className="hl-ava">{topDriver.name[0]}</span>
            <span className="hl-name">{topDriver.name}</span>
          </div>
          <span className="hl-ctx">{topDriver.assignments} penugasan · {fmtKm(topDriver.distance)} km</span>
          <span className="hl-tag up">3,4× rata-rata bawah</span>
        </button>

        <button className="hl-item" onClick={() => onPick('vehicle', topVeh.name)}>
          <span className="hl-eye">Kendaraan Terutilisasi</span>
          <div className="hl-num">{Math.round(topVeh.util * 100)}<span className="u">%</span></div>
          <span className="hl-ctx">{topVeh.name} · {topVeh.plate}</span>
          <span className="hl-tag crit">risiko jadwal perawatan</span>
        </button>

        <button className="hl-item" onClick={() => onPick('trend')}>
          <span className="hl-eye">Perubahan Operasional Utama</span>
          <div className="hl-num up">+12,4<span className="u">%</span></div>
          <span className="hl-ctx">Volume penugasan · 30 hari terakhir</span>
          <span className="hl-tag up">tren menguat</span>
        </button>
      </div>
    </section>
  );
}

Object.assign(window, { ExecutiveOverview, Highlights });
