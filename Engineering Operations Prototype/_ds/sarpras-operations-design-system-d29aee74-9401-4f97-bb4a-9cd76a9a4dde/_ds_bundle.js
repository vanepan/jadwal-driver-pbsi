/* @ds-bundle: {"format":4,"namespace":"SarprasOperationsDesignSystem_d29aee","components":[{"name":"BarList","sourcePath":"components/data/BarList.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"KPICard","sourcePath":"components/data/KPICard.jsx"},{"name":"RingGauge","sourcePath":"components/data/RingGauge.jsx"},{"name":"Sparkline","sourcePath":"components/data/Sparkline.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"InsightRow","sourcePath":"components/feedback/InsightRow.jsx"},{"name":"Card","sourcePath":"components/layout/Card.jsx"},{"name":"PageHeader","sourcePath":"components/layout/PageHeader.jsx"},{"name":"SectionHeader","sourcePath":"components/layout/SectionHeader.jsx"},{"name":"Badge","sourcePath":"components/primitives/Badge.jsx"},{"name":"Button","sourcePath":"components/primitives/Button.jsx"},{"name":"ICON_PATHS","sourcePath":"components/primitives/Icon.jsx"},{"name":"Icon","sourcePath":"components/primitives/Icon.jsx"},{"name":"SearchInput","sourcePath":"components/primitives/SearchInput.jsx"},{"name":"Segmented","sourcePath":"components/primitives/Segmented.jsx"},{"name":"StatusPill","sourcePath":"components/primitives/StatusPill.jsx"}],"sourceHashes":{"components/data/BarList.jsx":"e2aee044380e","components/data/DataTable.jsx":"84745fd09c8b","components/data/KPICard.jsx":"d73628177ab6","components/data/RingGauge.jsx":"8ab396767ab5","components/data/Sparkline.jsx":"1b2a5ef61b1f","components/feedback/EmptyState.jsx":"aa1aa26908fd","components/feedback/InsightRow.jsx":"c75117a0b50d","components/layout/Card.jsx":"d14fe5e7d629","components/layout/PageHeader.jsx":"b7ec140fde8f","components/layout/SectionHeader.jsx":"2fb01ed81ca0","components/primitives/Badge.jsx":"1b61cda64b48","components/primitives/Button.jsx":"c261be66c0ba","components/primitives/Icon.jsx":"405d59726998","components/primitives/SearchInput.jsx":"1e22803cbaf9","components/primitives/Segmented.jsx":"9d064cbe3755","components/primitives/StatusPill.jsx":"eda04ad0e64d","ui_kits/sarpras/DriverOperations.jsx":"62fdc5377bab","ui_kits/sarpras/ExecutiveAnalytics.jsx":"b5a9143e92e4","ui_kits/sarpras/Shell.jsx":"ba059b7f173f","ui_kits/sarpras/VehicleManagement.jsx":"c3310bd37892"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SarprasOperationsDesignSystem_d29aee = window.SarprasOperationsDesignSystem_d29aee || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/BarList.jsx
try { (() => {
/**
 * BarList — a ranked horizontal bar list (top drivers, utilisation, etc).
 * Each row: optional rank chip + name, a track/fill bar, a mono value.
 * Mirrors the analytics `.hbars`.
 */
function BarList({
  items = [],
  tone = 'accent',
  showRank = true,
  valueFormat = v => v,
  style = {}
}) {
  const max = Math.max(1, ...items.map(i => Number(i.value) || 0));
  const fillColor = {
    accent: 'var(--accent)',
    green: 'var(--c-green)',
    blue: 'var(--c-blue)',
    amber: 'var(--c-amber)',
    violet: 'var(--c-violet)',
    teal: 'var(--c-teal)'
  }[tone] || 'var(--accent)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      ...style
    }
  }, items.map((it, i) => {
    const pct = (Number(it.value) || 0) / max * 100;
    return /*#__PURE__*/React.createElement("div", {
      key: it.name + i,
      style: {
        display: 'grid',
        gridTemplateColumns: '132px 1fr auto',
        alignItems: 'center',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: 'var(--text-dim)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'flex',
        alignItems: 'center',
        gap: 9
      }
    }, showRank && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 19,
        height: 19,
        borderRadius: 6,
        background: 'var(--surface-2)',
        color: 'var(--text-faint)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: 600,
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 19px'
      }
    }, i + 1), it.name), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 10,
        borderRadius: 6,
        background: 'var(--surface-2)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: '100%',
        borderRadius: 6,
        width: `${pct}%`,
        background: it.color || fillColor,
        transition: 'width 1s cubic-bezier(.2,.7,.2,1)'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        fontWeight: 500,
        color: 'var(--text)',
        textAlign: 'right',
        minWidth: 52,
        fontVariantNumeric: 'tabular-nums'
      }
    }, valueFormat(it.value)));
  }));
}
Object.assign(__ds_scope, { BarList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/BarList.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
/**
 * DataTable — the minimalist Executive table. Uppercase ghost headers, hairline
 * row rules, hover highlight, numeric columns right-aligned in mono.
 * Columns: [{ key, label, align?, render?, mono? }]. Mirrors ExecutiveTable.
 */
function DataTable({
  columns = [],
  rows = [],
  onRowClick,
  minWidth = 540,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      margin: '0 -6px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      minWidth
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(col => /*#__PURE__*/React.createElement("th", {
    key: col.key,
    style: {
      textAlign: col.align === 'right' ? 'right' : 'left',
      fontSize: 10.5,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: 'var(--text-ghost)',
      fontWeight: 700,
      padding: '0 12px 11px',
      fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : 'normal'
    }
  }, col.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((row, ri) => /*#__PURE__*/React.createElement("tr", {
    key: ri,
    onClick: onRowClick ? () => onRowClick(row, ri) : undefined,
    style: {
      transition: 'background .12s',
      cursor: onRowClick ? 'pointer' : 'default'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--hover)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    }
  }, columns.map((col, ci) => {
    const isName = ci === 0;
    return /*#__PURE__*/React.createElement("td", {
      key: col.key,
      style: {
        padding: 12,
        borderTop: '1px solid var(--border-faint)',
        fontSize: 13,
        color: isName ? 'var(--text)' : 'var(--text-dim)',
        fontWeight: isName ? 600 : 400,
        textAlign: col.align === 'right' ? 'right' : 'left',
        fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
        fontVariantNumeric: col.align === 'right' || col.mono ? 'tabular-nums' : 'normal',
        whiteSpace: 'nowrap'
      }
    }, col.render ? col.render(row[col.key], row) : row[col.key]);
  }))))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/data/RingGauge.jsx
try { (() => {
/**
 * RingGauge — a circular progress gauge (health score, utilisation). SVG,
 * currentColor track + tone arc, with a centered value/suffix slot.
 */
function RingGauge({
  value = 0,
  max = 100,
  size = 132,
  thickness = 10,
  tone = 'green',
  label = '',
  suffix = '',
  style = {}
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const toneColor = {
    green: 'var(--c-green)',
    blue: 'var(--c-blue)',
    amber: 'var(--c-amber)',
    accent: 'var(--accent)',
    violet: 'var(--c-violet)',
    crit: 'var(--crit)'
  }[tone] || 'var(--c-green)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size,
      flex: `0 0 ${size}px`,
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--surface-2)",
    strokeWidth: thickness
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: toneColor,
    strokeWidth: thickness,
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: c * (1 - pct),
    transform: `rotate(-90 ${size / 2} ${size / 2})`
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: size * 0.32,
      lineHeight: 1,
      letterSpacing: '-0.04em',
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), (suffix || label) && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-faint)',
      fontWeight: 500,
      marginTop: 3
    }
  }, suffix || label)));
}
Object.assign(__ds_scope, { RingGauge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/RingGauge.jsx", error: String((e && e.message) || e) }); }

// components/data/Sparkline.jsx
try { (() => {
/**
 * Sparkline — a single SVG polyline trend, currentColor, no axes.
 * Deterministic (drawn from data, always fully rendered — print/PDF safe).
 */
function Sparkline({
  values = [],
  width = 120,
  height = 36,
  tone = 'neutral',
  strokeWidth = 2,
  style = {}
}) {
  const data = (Array.isArray(values) ? values : []).map(v => Number(v) || 0);
  const toneColor = {
    neutral: 'var(--text-faint)',
    accent: 'var(--accent)',
    green: 'var(--c-green)',
    blue: 'var(--c-blue)',
    amber: 'var(--c-amber)',
    violet: 'var(--c-violet)'
  }[tone] || 'currentColor';
  if (data.length < 2) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width,
        height,
        ...style
      },
      "aria-hidden": "true"
    });
  }
  const max = Math.max(...data),
    min = Math.min(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = (i * stepX).toFixed(1);
    const y = (height - (v - min) / span * height).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  return /*#__PURE__*/React.createElement("svg", {
    width: width,
    height: height,
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    fill: "none",
    "aria-hidden": "true",
    style: {
      color: toneColor,
      display: 'block',
      ...style
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: pts,
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
Object.assign(__ds_scope, { Sparkline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Sparkline.jsx", error: String((e && e.message) || e) }); }

// components/data/KPICard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * KPICard — the ONE KPI grammar. Eyebrow label, big display value with optional
 * unit, a trend delta, and an optional mini-sparkline. De-boxed by default
 * (sits on whitespace); pass boxed for a bordered surface.
 */
function KPICard({
  label,
  value,
  unit = '',
  delta = null,
  deltaDir = 'up',
  caption = '',
  spark = null,
  sparkTone = 'neutral',
  tone = 'default',
  boxed = false,
  style = {},
  ...rest
}) {
  const deltaColor = deltaDir === 'down' ? 'var(--crit)' : 'var(--c-green)';
  const valColor = tone === 'alert' ? 'var(--crit)' : 'var(--text)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      padding: boxed ? 'var(--pad)' : 0,
      background: boxed ? 'var(--surface)' : 'transparent',
      border: boxed ? '1px solid var(--border)' : 'none',
      borderRadius: boxed ? 'var(--radius)' : 0,
      boxShadow: boxed ? 'var(--shadow-sm)' : 'none',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: 'var(--text-faint)',
      fontWeight: 700
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'clamp(32px, 3.3vw, 46px)',
      lineHeight: 1,
      letterSpacing: '-0.032em',
      marginTop: 16,
      color: valColor,
      fontVariantNumeric: 'tabular-nums'
    }
  }, value, unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.44em',
      color: 'var(--text-faint)',
      fontWeight: 700,
      marginLeft: 2
    }
  }, unit) : null), delta != null && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 13,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 12.5,
      fontWeight: 700,
      color: deltaColor
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, deltaDir === 'down' ? '▾' : '▴'), delta, caption ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      fontWeight: 600
    }
  }, caption) : null), delta == null && caption ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 13,
      fontSize: 12.5,
      color: 'var(--text-faint)',
      fontWeight: 600
    }
  }, caption) : null, Array.isArray(spark) && spark.length > 1 ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Sparkline, {
    values: spark,
    tone: sparkTone,
    width: 160,
    height: 34
  })) : null);
}
Object.assign(__ds_scope, { KPICard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/KPICard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/**
 * EmptyState — the calm empty/permission/offline placeholder: a soft glyph
 * tile, a message, and an optional hint + action. Mirrors the analytics states.
 */
function EmptyState({
  icon = null,
  title,
  hint = '',
  action = null,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '46px 24px',
      gap: 4,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 13,
      background: 'var(--surface-2)',
      color: 'var(--text-faint)',
      display: 'grid',
      placeItems: 'center',
      marginBottom: 12
    }
  }, icon || /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "5",
    width: "16",
    height: "14",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 10h16M9 15h6"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 15,
      color: 'var(--text)',
      letterSpacing: '-0.012em'
    }
  }, title), hint && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-faint)',
      maxWidth: 320,
      lineHeight: 1.5
    }
  }, hint), action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, action) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/InsightRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * InsightRow — an AI/analytics insight line in a divider list (no nested box):
 * a tinted glyph tile, a bold title with optional severity chip, and a
 * description. Mirrors the analytics `.insight`.
 */
function InsightRow({
  icon = null,
  title,
  description,
  severity = 'info',
  style = {},
  ...rest
}) {
  const sev = {
    info: {
      c: 'var(--c-blue)',
      b: 'var(--c-blue-weak)',
      label: 'INFO'
    },
    good: {
      c: 'var(--c-green)',
      b: 'var(--c-green-weak)',
      label: 'BAIK'
    },
    warn: {
      c: 'var(--c-amber)',
      b: 'var(--c-amber-weak)',
      label: 'PERHATIAN'
    },
    crit: {
      c: 'var(--crit)',
      b: 'var(--crit-weak)',
      label: 'KRITIS'
    }
  }[severity] || {};
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      gap: 14,
      padding: '17px 10px',
      borderTop: '1px solid var(--border-faint)',
      alignItems: 'flex-start',
      borderRadius: 11,
      transition: 'background .14s',
      ...style
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--hover)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 9,
      display: 'grid',
      placeItems: 'center',
      flex: '0 0 32px',
      background: sev.b,
      color: sev.c
    }
  }, icon || /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 8h.01M11 12h1v4h1"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13.5,
      color: 'var(--text)',
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      flexWrap: 'wrap'
    }
  }, title, sev.label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 800,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      padding: '2px 7px',
      borderRadius: 6,
      color: sev.c,
      background: sev.b
    }
  }, sev.label)), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)',
      marginTop: 4,
      lineHeight: 1.5
    }
  }, description)));
}
Object.assign(__ds_scope, { InsightRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/InsightRow.jsx", error: String((e && e.message) || e) }); }

// components/layout/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the premium content surface. Hairline border, soft shadow, generous
 * padding. Optional header (title + subtitle + tools) and hover lift.
 */
function Card({
  children,
  title,
  subtitle,
  tools = null,
  hoverable = false,
  lead = false,
  pad = true,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => hoverable && setHover(true),
    onMouseLeave: () => hoverable && setHover(false),
    style: {
      background: 'var(--surface)',
      border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: pad ? lead ? 'calc(var(--pad) + 4px)' : 'var(--pad)' : 0,
      boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
      transition: 'border-color .16s, box-shadow .16s, transform .16s',
      ...style
    }
  }, rest), (title || tools) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 15.5,
      margin: 0,
      letterSpacing: '-0.012em'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-faint)',
      fontSize: 12.5,
      marginTop: 3
    }
  }, subtitle)), tools ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5,
      alignItems: 'center'
    }
  }, tools) : null), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Card.jsx", error: String((e && e.message) || e) }); }

// components/layout/PageHeader.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * PageHeader — the top-of-view header: uppercase crumb + large display title +
 * lede paragraph, with an optional right-aligned actions cluster.
 * Mirrors the analytics `.page-head`.
 */
function PageHeader({
  crumb,
  title,
  lede,
  actions = null,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap',
      marginBottom: 22,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, crumb && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: '0.13em',
      textTransform: 'uppercase',
      color: 'var(--text-faint)',
      fontWeight: 700,
      marginBottom: 9
    }
  }, crumb), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 32,
      margin: 0,
      letterSpacing: '-0.025em'
    }
  }, title), lede && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      color: 'var(--text-dim)',
      fontSize: 14,
      maxWidth: 540
    }
  }, lede)), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { PageHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/PageHeader.jsx", error: String((e && e.message) || e) }); }

// components/layout/SectionHeader.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SectionHeader — the "eyebrow" section divider: mono tag + display heading +
 * optional subtitle, closed by a hairline rule and an optional action link.
 * Mirrors the analytics `.eyebrow`.
 */
function SectionHeader({
  tag,
  title,
  subtitle,
  action = null,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 18,
      ...style
    }
  }, rest), tag && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      letterSpacing: '0.04em',
      color: 'var(--accent)',
      background: 'var(--accent-weak)',
      border: '1px solid var(--accent-line)',
      padding: '3px 8px',
      borderRadius: 7,
      fontWeight: 600,
      whiteSpace: 'nowrap'
    }
  }, tag), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19,
      margin: 0,
      letterSpacing: '-0.018em',
      whiteSpace: 'nowrap'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      fontSize: 13,
      whiteSpace: 'nowrap'
    }
  }, subtitle), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 1,
      background: 'var(--border-faint)'
    }
  }), action ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-faint)',
      fontSize: 12.5,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      whiteSpace: 'nowrap',
      cursor: 'pointer'
    }
  }, action) : null);
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — a small mono eyebrow chip used for tags/kinds. Tinted by tone.
 * Mirrors the analytics `.eyebrow .tag` and `.exec-badge` grammar.
 */
function Badge({
  children,
  tone = 'neutral',
  style = {},
  ...rest
}) {
  const tones = {
    neutral: {
      color: 'var(--text-dim)',
      bg: 'var(--surface-2)',
      line: 'var(--border)'
    },
    accent: {
      color: 'var(--accent)',
      bg: 'var(--accent-weak)',
      line: 'var(--accent-line)'
    },
    green: {
      color: 'var(--c-green)',
      bg: 'var(--c-green-weak)',
      line: 'transparent'
    },
    blue: {
      color: 'var(--c-blue)',
      bg: 'var(--c-blue-weak)',
      line: 'transparent'
    },
    amber: {
      color: 'var(--c-amber)',
      bg: 'var(--c-amber-weak)',
      line: 'transparent'
    },
    violet: {
      color: 'var(--c-violet)',
      bg: 'var(--c-violet-weak)',
      line: 'transparent'
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      letterSpacing: '0.04em',
      color: t.color,
      background: t.bg,
      border: `1px solid ${t.line}`,
      padding: '3px 8px',
      borderRadius: 7,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Badge.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the Executive action button.
 * Variants: default (neutral surface), primary (brand-red gradient),
 * ghost (transparent). Sizes: sm | md. Optional leading icon slot.
 */
function Button({
  children,
  variant = 'default',
  size = 'md',
  icon = null,
  disabled = false,
  type = 'button',
  onClick,
  style = {},
  ...rest
}) {
  const heights = {
    sm: 32,
    md: 38
  };
  const pads = {
    sm: '0 12px',
    md: '0 15px'
  };
  const fontSizes = {
    sm: 12.5,
    md: 13
  };
  const base = {
    height: heights[size],
    padding: pads[size],
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontWeight: 600,
    fontSize: fontSizes[size],
    fontFamily: 'var(--font-sans)',
    letterSpacing: '-0.006em',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: 'var(--shadow-sm)',
    opacity: disabled ? 0.5 : 1,
    transition: 'background .12s, border-color .12s, filter .12s, transform .1s'
  };
  const variants = {
    default: {},
    primary: {
      background: 'linear-gradient(180deg, var(--accent-2), var(--accent))',
      border: 'none',
      color: 'var(--accent-fg)',
      boxShadow: '0 6px 16px -10px var(--accent), 0 1px 0 rgba(255,255,255,0.2) inset'
    },
    ghost: {
      background: 'transparent',
      borderColor: 'transparent',
      color: 'var(--text-dim)',
      boxShadow: 'none'
    },
    danger: {
      background: 'linear-gradient(180deg, var(--accent-2), var(--accent))',
      border: 'none',
      color: '#fff',
      boxShadow: '0 6px 16px -10px var(--accent)'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flexShrink: 0
    }
  }, icon) : null, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Button.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Icon set — outline, currentColor, SF-Symbols philosophy. Paths lifted from
   the production icon-system.js (plus a few chrome glyphs the platform uses).
   No PNG, no emoji: every icon is a scalable stroke/fill vector. */
const ICON_PATHS = {
  // vehicles
  'vehicle-car': {
    d: 'M4 6h16v2H4zm1 4h14v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm2-1h10v1H7zm0 8h10v1H7z',
    fill: true
  },
  'vehicle-truck': {
    d: 'M3 6h12v2H3zm0 4h12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm14-1h5v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2z',
    fill: true
  },
  'vehicle-ambulance': {
    d: 'M3 7h14v3H3zm0 4h14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm16-2h3v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-7h2z',
    fill: true
  },
  // status / health (fill)
  'check-circle': {
    d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
    fill: true
  },
  'warning': {
    d: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    fill: true
  },
  'x-circle': {
    d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z',
    fill: true
  },
  // actions
  'edit': {
    d: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z',
    stroke: 1.5
  },
  'delete': {
    d: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-9l-1 1H5v2h14V4z',
    fill: true
  },
  'archive': {
    d: 'M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 15.38L6.62 9.5H17.4L12 15.38z',
    fill: true
  },
  'search': {
    d: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    fill: true
  },
  'filter': {
    d: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
    fill: true
  },
  'download': {
    d: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
    fill: true
  },
  'plus': {
    d: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    fill: true
  },
  // documents & ops (stroke)
  'doc-tax': {
    d: 'M6 2h9l3 3v17l-2.5-1.5L13 22l-2.5-1.5L8 22l-2.5-1.5L6 22V2zm3 5h6M9 11h6M9 15h4',
    stroke: 1.5
  },
  'shield': {
    d: 'M12 3l7 3v5c0 4.4-3 8.4-7 9.5-4-1.1-7-5.1-7-9.5V6l7-3zm-1.5 9.5 4-4',
    stroke: 1.6
  },
  'wrench': {
    d: 'M14.7 6.3a4 4 0 0 0-5.1 5.1L4 17l3 3 5.6-5.6a4 4 0 0 0 5.1-5.1l-2.3 2.3-2.1-.6-.6-2.1 2.3-2.3z',
    stroke: 1.5
  },
  'clock': {
    d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3.5 2',
    stroke: 1.6
  },
  // navigation / chrome (fill)
  'chevron-right': {
    d: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z',
    fill: true
  },
  'chevron-down': {
    d: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z',
    fill: true
  },
  'close': {
    d: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z',
    fill: true
  },
  'menu': {
    d: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
    fill: true
  },
  'bell': {
    d: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z',
    fill: true
  },
  'grid': {
    d: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z',
    fill: true
  },
  'reset': {
    d: 'M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
    fill: true
  },
  'chart': {
    d: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    stroke: 1.6
  },
  'users': {
    d: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-8 1.34-8 4v2h9m-1-6c2.7 0 8 1.34 8 4v2h-7',
    stroke: 1.6
  },
  'file': {
    d: 'M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 0v5h5M8 13h8M8 17h6',
    stroke: 1.5
  },
  'pin': {
    d: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z',
    stroke: 1.5
  }
};

/**
 * Icon — inline SVG glyph from the platform icon set. `currentColor` by default;
 * pass a `tone` token name to tint. Outline or fill depending on the glyph.
 */
function Icon({
  name,
  size = 18,
  tone = 'currentColor',
  strokeWidth,
  style = {},
  ...rest
}) {
  const g = ICON_PATHS[name];
  if (!g) return null;
  const color = tone === 'currentColor' ? 'currentColor' : tone.startsWith('var(') || tone.startsWith('#') || tone.startsWith('rgb') ? tone : `var(--${tone.replace(/^--/, '')})`;
  const filled = !!g.fill;
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: filled ? color : 'none',
    stroke: filled ? 'none' : color,
    strokeWidth: filled ? 0 : strokeWidth || g.stroke || 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      flexShrink: 0,
      ...style
    },
    "aria-hidden": "true"
  }, rest), /*#__PURE__*/React.createElement("path", {
    d: g.d
  }));
}
Object.assign(__ds_scope, { ICON_PATHS, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Icon.jsx", error: String((e && e.message) || e) }); }

// components/primitives/SearchInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SearchInput — tokenized search field with a leading glyph.
 * Mirrors the `.tb-search` / `.exec-search` grammar.
 */
function SearchInput({
  value,
  onChange,
  placeholder = 'Cari…',
  width = 380,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 36,
      maxWidth: width,
      width: '100%',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      padding: '0 12px',
      color: 'var(--text-faint)',
      boxShadow: 'var(--shadow-sm)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m20 20-3.5-3.5"
  })), /*#__PURE__*/React.createElement("input", _extends({
    type: "search",
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    style: {
      background: 'none',
      border: 'none',
      outline: 'none',
      color: 'var(--text)',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      width: '100%'
    }
  }, rest)));
}
Object.assign(__ds_scope, { SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/SearchInput.jsx", error: String((e && e.message) || e) }); }

// components/primitives/Segmented.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Segmented — the Executive segmented control (period toggles, view switches).
 * Selected segment lifts onto a surface with a soft shadow. Mirrors `.seg`.
 */
function Segmented({
  options = [],
  value,
  onChange,
  style = {},
  ...rest
}) {
  const norm = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'inline-flex',
      gap: 3,
      padding: 4,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 13,
      ...style
    }
  }, rest), norm.map(o => {
    const on = o.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      type: "button",
      onClick: () => onChange && onChange(o.value),
      style: {
        appearance: 'none',
        border: 'none',
        background: on ? 'var(--surface)' : 'transparent',
        color: on ? 'var(--text)' : 'var(--text-dim)',
        boxShadow: on ? 'var(--shadow-sm)' : 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: 13,
        padding: '8px 15px',
        borderRadius: 9,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        transition: 'color .14s, background .14s, box-shadow .14s'
      }
    }, o.icon ? /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: on ? 1 : 0.7
      }
    }, o.icon) : null, o.label);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/primitives/StatusPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatusPill — lifecycle status chip with a leading color dot.
 * Encodes assignment / work-order / document states in the semantic palette.
 */
function StatusPill({
  children,
  status = 'neutral',
  style = {},
  ...rest
}) {
  const map = {
    done: {
      c: 'var(--c-green)',
      b: 'var(--c-green-weak)'
    },
    active: {
      c: 'var(--c-blue)',
      b: 'var(--c-blue-weak)'
    },
    sched: {
      c: 'var(--c-amber)',
      b: 'var(--c-amber-weak)'
    },
    cancel: {
      c: 'var(--text-faint)',
      b: 'var(--surface-2)'
    },
    crit: {
      c: 'var(--crit)',
      b: 'var(--crit-weak)'
    },
    neutral: {
      c: 'var(--text-dim)',
      b: 'var(--surface-2)'
    }
  };
  const t = map[status] || map.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: 24,
      padding: '0 10px',
      borderRadius: 'var(--radius-pill)',
      background: t.b,
      color: t.c,
      fontSize: 11.5,
      fontWeight: 700,
      fontFamily: 'var(--font-sans)',
      letterSpacing: '-0.004em',
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: t.c,
      flex: '0 0 6px'
    }
  }), children);
}
Object.assign(__ds_scope, { StatusPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/primitives/StatusPill.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sarpras/DriverOperations.jsx
try { (() => {
/* Driver Operations — daily assignment timeline + pending approvals. */
const DO = window.SarprasOperationsDesignSystem_d29aee;
const HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
const TRIPS = [{
  driver: 'Budi Santoso',
  ini: 'BS',
  rows: [{
    start: 7,
    end: 10.5,
    label: 'Antar tim → GBK',
    color: 'var(--v-innova)',
    st: 'done'
  }, {
    start: 13,
    end: 16,
    label: 'Jemput ofisial',
    color: 'var(--v-innova)',
    st: 'active'
  }]
}, {
  driver: 'Agus Wijaya',
  ini: 'AW',
  rows: [{
    start: 8,
    end: 11,
    label: 'Logistik gudang',
    color: 'var(--v-luxio)',
    st: 'done'
  }, {
    start: 15,
    end: 18.5,
    label: 'Antar peralatan',
    color: 'var(--v-luxio)',
    st: 'active'
  }]
}, {
  driver: 'Dedi Kurnia',
  ini: 'DK',
  rows: [{
    start: 9.5,
    end: 12,
    label: 'Dinas Cipayung',
    color: 'var(--v-poly)',
    st: 'done'
  }]
}, {
  driver: 'Eko Prasetyo',
  ini: 'EP',
  rows: [{
    start: 6.5,
    end: 9,
    label: 'Antar atlet',
    color: 'var(--v-luxio)',
    st: 'done'
  }, {
    start: 17,
    end: 20,
    label: 'Jemput bandara',
    color: 'var(--v-luxio)',
    st: 'sched'
  }]
}];
function DriverOperations() {
  const {
    PageHeader,
    SectionHeader,
    Card,
    StatusPill,
    Button,
    Badge,
    Icon,
    KPICard
  } = DO;
  const H0 = 6,
    H1 = 20.5,
    span = H1 - H0;
  const pos = h => `${(h - H0) / span * 100}%`;
  const wid = (a, b) => `${(b - a) / span * 100}%`;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    crumb: "OPERASI DRIVER",
    title: "Papan Penugasan",
    lede: "Jumat, 4 Juli 2026 \u2014 7 trip terjadwal lintas 4 driver.",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 15
      })
    }, "Tambah Jadwal")
  }), /*#__PURE__*/React.createElement("div", {
    className: "hm-stats",
    style: {
      borderTop: '1px solid var(--border-faint)',
      paddingTop: 24,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Trip Aktif",
    value: "2",
    caption: "berlangsung"
  })), /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Driver Tersedia",
    value: "14",
    caption: "dari 18"
  })), /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Menunggu Approval",
    value: "7",
    tone: "alert",
    caption: "perlu tindakan"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "level",
    style: {
      marginTop: 54
    }
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    tag: "TIMELINE",
    title: "Jadwal Hari Ini",
    subtitle: "06:00 \u2013 20:00"
  }), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '150px 1fr',
      gap: 16,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 18
    }
  }, HOURS.map(h => /*#__PURE__*/React.createElement("span", {
    key: h,
    style: {
      position: 'absolute',
      left: pos(h),
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-faint)',
      transform: 'translateX(-50%)'
    }
  }, String(h).padStart(2, '0'), ":00")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, TRIPS.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.driver,
    style: {
      display: 'grid',
      gridTemplateColumns: '150px 1fr',
      gap: 16,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 9,
      background: 'linear-gradient(180deg,var(--accent-2),var(--accent))',
      color: '#fff',
      display: 'grid',
      placeItems: 'center',
      fontWeight: 800,
      fontSize: 12,
      flex: '0 0 30px'
    }
  }, t.ini), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-dim)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, t.driver)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 40,
      background: 'var(--surface-2)',
      borderRadius: 10
    }
  }, t.rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    title: r.label,
    style: {
      position: 'absolute',
      top: 5,
      bottom: 5,
      left: pos(r.start),
      width: wid(r.start, r.end),
      background: r.color,
      opacity: r.st === 'sched' ? 0.5 : 1,
      borderRadius: 8,
      padding: '0 10px',
      display: 'flex',
      alignItems: 'center',
      color: '#fff',
      fontSize: 11.5,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxShadow: 'var(--shadow-sm)',
      border: r.st === 'sched' ? '1px dashed rgba(255,255,255,0.7)' : 'none'
    }
  }, r.label)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      flexWrap: 'wrap',
      marginTop: 20,
      paddingTop: 16,
      borderTop: '1px solid var(--border-faint)'
    }
  }, [['Innova', '--v-innova'], ['Luxio', '--v-luxio'], ['Poly', '--v-poly'], ['HiAce', '--v-hiace']].map(([n, c]) => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 12,
      color: 'var(--text-dim)',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 4,
      background: `var(${c})`
    }
  }), n))))), /*#__PURE__*/React.createElement("div", {
    className: "level"
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    tag: "ANTREAN",
    title: "Menunggu Persetujuan",
    subtitle: "7 permintaan",
    action: "Lihat semua \u2192"
  }), /*#__PURE__*/React.createElement("div", {
    className: "stack"
  }, [{
    who: 'Bidang Kompetisi',
    what: 'Antar wasit ke Istora',
    when: 'Besok · 06:00',
    v: 'Innova'
  }, {
    who: 'Bidang Pembinaan',
    what: 'Jemput atlet Pelatnas',
    when: 'Besok · 13:30',
    v: 'HiAce'
  }, {
    who: 'Sekretariat',
    what: 'Dinas ke Kemenpora',
    when: 'Sen · 09:00',
    v: 'Luxio'
  }].map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 16,
      alignItems: 'center',
      padding: '16px 4px',
      borderTop: i > 0 ? '1px solid var(--border-faint)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, r.v), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--text)'
    }
  }, r.what), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-faint)',
      marginTop: 2
    }
  }, r.who, " \xB7 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }, r.when))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost"
  }, "Tolak"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "check-circle",
      size: 14
    })
  }, "Setujui")))))));
}
window.DriverOperations = DriverOperations;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sarpras/DriverOperations.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sarpras/ExecutiveAnalytics.jsx
try { (() => {
/* Executive Analytics — the flagship keynote dashboard. */
const AN = window.SarprasOperationsDesignSystem_d29aee;
function Donut({
  segments,
  size = 148,
  thickness = 22
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size,
      flex: `0 0 ${size}px`
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    style: {
      transform: 'rotate(-90deg)'
    }
  }, segments.map((s, i) => {
    const frac = s.value / total;
    const dash = c * frac;
    const el = /*#__PURE__*/React.createElement("circle", {
      key: i,
      cx: size / 2,
      cy: size / 2,
      r: r,
      fill: "none",
      stroke: s.color,
      strokeWidth: thickness,
      strokeDasharray: `${dash} ${c - dash}`,
      strokeDashoffset: -offset
    });
    offset += dash;
    return el;
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 30,
      letterSpacing: '-0.025em',
      fontVariantNumeric: 'tabular-nums'
    }
  }, total), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-faint)',
      textTransform: 'uppercase',
      letterSpacing: '0.09em',
      fontWeight: 700,
      marginTop: 2
    }
  }, "Total WO")));
}
function ExecutiveAnalytics() {
  const {
    PageHeader,
    SectionHeader,
    Card,
    KPICard,
    RingGauge,
    BarList,
    InsightRow,
    Segmented,
    Button,
    Icon
  } = AN;
  const [period, setPeriod] = React.useState('minggu');
  const cat = [{
    label: 'Perbaikan',
    value: 24,
    color: 'var(--c-blue)'
  }, {
    label: 'Preventif',
    value: 18,
    color: 'var(--c-green)'
  }, {
    label: 'Kelistrikan',
    value: 11,
    color: 'var(--c-amber)'
  }, {
    label: 'Lainnya',
    value: 7,
    color: 'var(--c-violet)'
  }];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    crumb: "ANALITIK OPERASIONAL",
    title: "Ringkasan Eksekutif",
    lede: "Kesehatan operasional lintas driver, kendaraan, dan engineering minggu ini.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Segmented, {
      value: period,
      onChange: setPeriod,
      options: [{
        value: 'minggu',
        label: 'Minggu'
      }, {
        value: 'bulan',
        label: 'Bulan'
      }]
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "download",
        size: 15
      })
    }, "Ekspor PDF"))
  }), /*#__PURE__*/React.createElement("div", {
    className: "hero"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "hero-title"
  }, "Operasi berjalan ", /*#__PURE__*/React.createElement("span", {
    className: "hl"
  }, "sehat"), ", dengan 7 perhatian aktif."), /*#__PURE__*/React.createElement("p", {
    className: "hero-sub"
  }, "248 trip selesai dan 60 work order ditutup minggu ini. Utilisasi armada naik 8% \u2014 tiga kendaraan mendekati jatuh tempo pajak."), /*#__PURE__*/React.createElement("div", {
    className: "hero-metrics"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hm-health"
  }, /*#__PURE__*/React.createElement(RingGauge, {
    value: 87,
    suffix: "/ 100",
    tone: "green",
    size: 132
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Skor Kesehatan Operasional"), /*#__PURE__*/React.createElement("div", {
    className: "grade"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle",
    size: 14,
    tone: "c-green"
  }), " Sangat Baik"))), /*#__PURE__*/React.createElement("div", {
    className: "hm-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Trip Selesai",
    value: "248",
    delta: "+12%",
    caption: "vs lalu"
  })), /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Work Order",
    value: "60",
    delta: "+5%",
    caption: "ditutup"
  })), /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Menunggu",
    value: "7",
    tone: "alert",
    delta: "+3",
    deltaDir: "down",
    caption: "perlu tindakan"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "level"
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    tag: "L2 \xB7 HIGHLIGHTS",
    title: "Sorotan Operasional",
    subtitle: "Tiga hal yang menonjol minggu ini"
  }), /*#__PURE__*/React.createElement("div", {
    className: "highlights"
  }, /*#__PURE__*/React.createElement("button", {
    className: "hl-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hl-eye"
  }, "Driver Teratas"), /*#__PURE__*/React.createElement("span", {
    className: "hl-val"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hl-ava"
  }, "BS"), /*#__PURE__*/React.createElement("span", {
    className: "hl-name"
  }, "Budi S.")), /*#__PURE__*/React.createElement("span", {
    className: "hl-ctx"
  }, "42 trip \xB7 1.284 km \xB7 0 pembatalan"), /*#__PURE__*/React.createElement("span", {
    className: "hl-tag up"
  }, "Konsisten 3 minggu")), /*#__PURE__*/React.createElement("button", {
    className: "hl-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hl-eye"
  }, "Utilisasi Armada"), /*#__PURE__*/React.createElement("span", {
    className: "hl-num up"
  }, "87", /*#__PURE__*/React.createElement("span", {
    className: "u"
  }, "%")), /*#__PURE__*/React.createElement("span", {
    className: "hl-ctx"
  }, "Innova & Luxio memimpin"), /*#__PURE__*/React.createElement("span", {
    className: "hl-tag up"
  }, "Naik 8% vs minggu lalu")), /*#__PURE__*/React.createElement("button", {
    className: "hl-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hl-eye"
  }, "Perlu Perhatian"), /*#__PURE__*/React.createElement("span", {
    className: "hl-num",
    style: {
      color: 'var(--crit)'
    }
  }, "3"), /*#__PURE__*/React.createElement("span", {
    className: "hl-ctx"
  }, "Kendaraan pajak jatuh tempo \u2264 14 hari"), /*#__PURE__*/React.createElement("span", {
    className: "hl-tag crit"
  }, "Tindak lanjut segera")))), /*#__PURE__*/React.createElement("div", {
    className: "level"
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    tag: "L3 \xB7 DEEP",
    title: "Analitik Mendalam",
    subtitle: "Rincian per kategori & driver",
    action: "Lihat semua \u2192"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid g-lead"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Beban Kerja Driver",
    subtitle: "Trip per driver, 7 hari",
    hoverable: true
  }, /*#__PURE__*/React.createElement(BarList, {
    tone: "blue",
    items: [{
      name: 'Budi Santoso',
      value: 42
    }, {
      name: 'Agus Wijaya',
      value: 34
    }, {
      name: 'Dedi Kurnia',
      value: 28
    }, {
      name: 'Rudi Hartono',
      value: 21
    }, {
      name: 'Eko Prasetyo',
      value: 16
    }],
    valueFormat: v => `${v} trip`
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Work Order per Kategori",
    subtitle: "60 total",
    hoverable: true
  }, /*#__PURE__*/React.createElement("div", {
    className: "donut-wrap"
  }, /*#__PURE__*/React.createElement(Donut, {
    segments: cat
  }), /*#__PURE__*/React.createElement("div", {
    className: "legend",
    style: {
      flex: 1
    }
  }, cat.map(s => /*#__PURE__*/React.createElement("div", {
    className: "li",
    key: s.label
  }, /*#__PURE__*/React.createElement("span", {
    className: "sw",
    style: {
      background: s.color
    }
  }), s.label, /*#__PURE__*/React.createElement("span", {
    className: "vv"
  }, s.value))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--gap)'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Wawasan AI",
    subtitle: "Dihasilkan dari data operasional minggu ini"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(InsightRow, {
    severity: "crit",
    title: "3 kendaraan pajak jatuh tempo",
    description: "STNK Innova B 1234, Luxio B 5678, dan HiAce B 9012 kedaluwarsa dalam 14 hari."
  }), /*#__PURE__*/React.createElement(InsightRow, {
    severity: "good",
    title: "Utilisasi armada naik 8%",
    description: "Didorong oleh peningkatan trip Innova & Luxio; tidak ada idle > 2 hari."
  }), /*#__PURE__*/React.createElement(InsightRow, {
    severity: "warn",
    title: "2 driver mendekati batas jam",
    description: "Pertimbangkan rotasi Budi & Agus untuk mencegah kelelahan."
  }), /*#__PURE__*/React.createElement(InsightRow, {
    severity: "info",
    title: "Rata-rata approval 3.2 jam",
    description: "Turun dari 4.1 jam minggu lalu \u2014 alur persetujuan membaik."
  }))))));
}
window.ExecutiveAnalytics = ExecutiveAnalytics;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sarpras/ExecutiveAnalytics.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sarpras/Shell.jsx
try { (() => {
/* Shell — module rail + section panel + topbar. Pure presentation. */
const {
  Icon
} = window.SarprasOperationsDesignSystem_d29aee;
const MODULES = [{
  id: 'analytics',
  icon: 'chart',
  label: 'Analitik'
}, {
  id: 'drivers',
  icon: 'vehicle-car',
  label: 'Operasi Driver'
}, {
  id: 'vehicles',
  icon: 'shield',
  label: 'Manajemen Kendaraan'
}, {
  id: 'engineering',
  icon: 'wrench',
  label: 'Engineering & Sarpras'
}, {
  id: 'admin',
  icon: 'users',
  label: 'Administrasi'
}];
function Shell({
  module,
  onModule,
  panelTitle,
  panelSub,
  cta,
  panelItems,
  activePanel,
  onPanel,
  crumb,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, /*#__PURE__*/React.createElement("nav", {
    className: "rail"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rail-crest"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/pbsi-logo.png",
    alt: "PBSI"
  })), MODULES.map(m => /*#__PURE__*/React.createElement("button", {
    key: m.id,
    className: 'rail-mod' + (m.id === module ? ' active' : ''),
    title: m.label,
    onClick: () => onModule(m.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: m.icon,
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    className: "rail-spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "rail-mod",
    title: "Tema"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "grid",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    className: "rail-ava"
  }, "SW")), /*#__PURE__*/React.createElement("aside", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel-title"
  }, panelTitle), /*#__PURE__*/React.createElement("div", {
    className: "panel-sub"
  }, panelSub), cta && /*#__PURE__*/React.createElement("button", {
    className: "panel-cta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 15
  }), cta), /*#__PURE__*/React.createElement("div", {
    className: "panel-label"
  }, "Menu"), /*#__PURE__*/React.createElement("div", {
    className: "panel-nav"
  }, panelItems.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.id,
    className: 'panel-item' + (it.id === activePanel ? ' active' : ''),
    onClick: () => onPanel(it.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.icon,
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, it.label), it.badge ? /*#__PURE__*/React.createElement("span", {
    className: "badge"
  }, it.badge) : null))), /*#__PURE__*/React.createElement("div", {
    className: "panel-spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "panel-user"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ava"
  }, "SW"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "nm"
  }, "Sri Wahyuni"), /*#__PURE__*/React.createElement("div", {
    className: "rl"
  }, "Admin \xB7 Bidang Sarana")))), /*#__PURE__*/React.createElement("div", {
    className: "main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tb-crumb"
  }, crumb.map((c, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("span", {
    className: "sep"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    className: i === crumb.length - 1 ? 'cur' : ''
  }, c)))), /*#__PURE__*/React.createElement("div", {
    className: "tb-spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "tb-icon"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    className: "tb-icon"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 18
  }), /*#__PURE__*/React.createElement("span", {
    className: "dot"
  })), /*#__PURE__*/React.createElement("div", {
    className: "tb-user"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ava"
  }, "SW"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "nm"
  }, "Sri Wahyuni"), /*#__PURE__*/React.createElement("div", {
    className: "rl"
  }, "Admin")))), /*#__PURE__*/React.createElement("main", {
    className: "content fade-up",
    key: module + activePanel
  }, children)));
}
window.Shell = Shell;
window.SARPRAS_MODULES = MODULES;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sarpras/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/sarpras/VehicleManagement.jsx
try { (() => {
/* Vehicle Management — executive table with a detail drawer. */
const VM = window.SarprasOperationsDesignSystem_d29aee;
const VEHICLES = [{
  name: 'Toyota Innova',
  plate: 'B 1234 XYZ',
  type: 'Innova',
  color: 'var(--v-innova)',
  st: 'active',
  status: 'Beroperasi',
  km: '84.210',
  tax: 'crit',
  taxLabel: '12 hari',
  driver: 'Budi Santoso'
}, {
  name: 'Daihatsu Luxio',
  plate: 'B 5678 ABC',
  type: 'Luxio',
  color: 'var(--v-luxio)',
  st: 'active',
  status: 'Beroperasi',
  km: '61.540',
  tax: 'crit',
  taxLabel: '9 hari',
  driver: 'Agus Wijaya'
}, {
  name: 'Toyota HiAce',
  plate: 'B 9012 DEF',
  type: 'HiAce',
  color: 'var(--v-hiace)',
  st: 'sched',
  status: 'Servis',
  km: '112.870',
  tax: 'crit',
  taxLabel: '14 hari',
  driver: '—'
}, {
  name: 'Mitsubishi L300',
  plate: 'B 3456 GHI',
  type: 'Poly',
  color: 'var(--v-poly)',
  st: 'active',
  status: 'Beroperasi',
  km: '48.300',
  tax: 'done',
  taxLabel: 'Aktif',
  driver: 'Dedi Kurnia'
}, {
  name: 'Toyota Innova',
  plate: 'B 7788 JKL',
  type: 'Innova',
  color: 'var(--v-innova)',
  st: 'done',
  status: 'Idle',
  km: '39.120',
  tax: 'done',
  taxLabel: 'Aktif',
  driver: '—'
}, {
  name: 'Daihatsu Luxio',
  plate: 'B 2244 MNO',
  type: 'Luxio',
  color: 'var(--v-luxio)',
  st: 'active',
  status: 'Beroperasi',
  km: '72.905',
  tax: 'sched',
  taxLabel: '48 hari',
  driver: 'Eko Prasetyo'
}];
function VehicleManagement() {
  const {
    PageHeader,
    SectionHeader,
    Card,
    DataTable,
    StatusPill,
    SearchInput,
    Button,
    Badge,
    Icon,
    KPICard,
    RingGauge
  } = VM;
  const [sel, setSel] = React.useState(null);
  const [q, setQ] = React.useState('');
  const rows = VEHICLES.filter(v => (v.name + v.plate + v.driver).toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    crumb: "MANAJEMEN KENDARAAN",
    title: "Armada Operasional",
    lede: "6 kendaraan aktif. Tiga unit memerlukan perpanjangan pajak dalam 14 hari.",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "plus",
        size: 15
      })
    }, "Tambah Kendaraan")
  }), /*#__PURE__*/React.createElement("div", {
    className: "hm-stats",
    style: {
      borderTop: '1px solid var(--border-faint)',
      paddingTop: 24,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Total Armada",
    value: "6",
    caption: "unit terdaftar"
  })), /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Beroperasi",
    value: "4",
    caption: "hari ini"
  })), /*#__PURE__*/React.createElement("div", {
    className: "hm-stat"
  }, /*#__PURE__*/React.createElement(KPICard, {
    label: "Pajak Jatuh Tempo",
    value: "3",
    tone: "alert",
    caption: "\u2264 14 hari"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "level",
    style: {
      marginTop: 54
    }
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    tag: "DAFTAR",
    title: "Semua Kendaraan",
    subtitle: `${rows.length} unit`
  }), /*#__PURE__*/React.createElement("div", {
    className: "filterbar"
  }, /*#__PURE__*/React.createElement(SearchInput, {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Cari kendaraan, plat, driver\u2026",
    width: 320
  }), /*#__PURE__*/React.createElement(Button, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "filter",
      size: 15
    })
  }, "Filter"), /*#__PURE__*/React.createElement("div", {
    className: "fb-spacer"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "download",
      size: 15
    })
  }, "Ekspor")), /*#__PURE__*/React.createElement(Card, {
    pad: false,
    style: {
      padding: '20px 24px'
    }
  }, /*#__PURE__*/React.createElement(DataTable, {
    onRowClick: r => setSel(r),
    columns: [{
      key: 'name',
      label: 'Kendaraan',
      render: (v, r) => /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 8,
          height: 8,
          borderRadius: 3,
          background: r.color,
          flex: '0 0 8px'
        }
      }), v)
    }, {
      key: 'plate',
      label: 'Plat',
      mono: true
    }, {
      key: 'driver',
      label: 'Driver'
    }, {
      key: 'status',
      label: 'Status',
      render: (v, r) => /*#__PURE__*/React.createElement(StatusPill, {
        status: r.st
      }, v)
    }, {
      key: 'km',
      label: 'Odometer',
      align: 'right',
      mono: true
    }, {
      key: 'taxLabel',
      label: 'Pajak',
      align: 'right',
      render: (v, r) => /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          fontWeight: 600,
          color: r.tax === 'crit' ? 'var(--crit)' : r.tax === 'sched' ? 'var(--c-amber)' : 'var(--c-green)'
        }
      }, v)
    }],
    rows: rows,
    minWidth: 720
  }))), /*#__PURE__*/React.createElement("div", {
    className: 'scrim' + (sel ? ' open' : ''),
    onClick: () => setSel(null)
  }, /*#__PURE__*/React.createElement("div", {
    className: "drawer",
    onClick: e => e.stopPropagation()
  }, sel && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "drawer-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, sel.type), /*#__PURE__*/React.createElement(StatusPill, {
    status: sel.st
  }, sel.status)), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 24,
      letterSpacing: '-0.025em',
      margin: '12px 0 2px'
    }
  }, sel.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: 'var(--text-faint)'
    }
  }, sel.plate)), /*#__PURE__*/React.createElement("button", {
    className: "tb-icon",
    onClick: () => setSel(null)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "close",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    className: "drawer-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "drawer-sec",
    style: {
      display: 'flex',
      gap: 22,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(RingGauge, {
    value: sel.tax === 'crit' ? 24 : sel.tax === 'sched' ? 68 : 92,
    suffix: "/ 100",
    tone: sel.tax === 'crit' ? 'crit' : sel.tax === 'sched' ? 'amber' : 'green',
    size: 112
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--text-faint)',
      fontWeight: 700
    }
  }, "Skor Kesehatan Aset"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-dim)',
      marginTop: 8,
      maxWidth: 180,
      lineHeight: 1.5
    }
  }, "Berdasarkan odometer, riwayat servis, dan status legalitas."))), /*#__PURE__*/React.createElement("div", {
    className: "drawer-sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st"
  }, "Ringkasan"), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Driver ditugaskan"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      fontFamily: 'var(--font-sans)'
    }
  }, sel.driver)), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Odometer"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, sel.km, " km")), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Pajak / STNK"), /*#__PURE__*/React.createElement("span", {
    className: "v",
    style: {
      color: sel.tax === 'crit' ? 'var(--crit)' : 'var(--text)'
    }
  }, sel.taxLabel)), /*#__PURE__*/React.createElement("div", {
    className: "kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Servis berikutnya"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "2.400 km"))), /*#__PURE__*/React.createElement("div", {
    className: "drawer-sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "st"
  }, "Tindakan"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "doc-tax",
      size: 15
    })
  }, "Perpanjang Pajak"), /*#__PURE__*/React.createElement(Button, {
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "wrench",
      size: 15
    })
  }, "Jadwalkan Servis"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "edit",
      size: 15
    })
  }, "Edit"))))))));
}
window.VehicleManagement = VehicleManagement;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/sarpras/VehicleManagement.jsx", error: String((e && e.message) || e) }); }

__ds_ns.BarList = __ds_scope.BarList;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.KPICard = __ds_scope.KPICard;

__ds_ns.RingGauge = __ds_scope.RingGauge;

__ds_ns.Sparkline = __ds_scope.Sparkline;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.InsightRow = __ds_scope.InsightRow;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.PageHeader = __ds_scope.PageHeader;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.ICON_PATHS = __ds_scope.ICON_PATHS;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.StatusPill = __ds_scope.StatusPill;

})();
