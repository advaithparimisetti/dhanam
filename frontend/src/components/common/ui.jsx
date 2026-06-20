import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/* ===========================================================================
   Dhanaṁ shared UI primitives
   Terminal-grade, dependency-light building blocks reused across every tab.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   Institutional formatters
   --------------------------------------------------------------------------- */
const CUR = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' };

export const sym = (cur) => CUR[cur] || (cur ? cur + ' ' : '');

export const fmtMoney = (v, cur = 'USD', dp = 2) =>
  v == null || isNaN(v)
    ? '—'
    : `${sym(cur)}${Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

// Compact large-number scaler (B / M / K) — standard for market cap & EV.
export const fmtBig = (v, cur = 'USD') => {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  const s = sym(cur);
  if (a >= 1e12) return `${s}${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(v / 1e3).toFixed(2)}K`;
  return `${s}${Number(v).toFixed(2)}`;
};

export const fmtPct = (v, dp = 2, alreadyPct = false) =>
  v == null || isNaN(v) ? '—' : `${(alreadyPct ? v : v * 100).toFixed(dp)}%`;

export const fmtNum = (v, dp = 2) =>
  v == null || isNaN(v) ? '—' : Number(v).toFixed(dp);

export const fmtX = (v, dp = 1) => (v == null || isNaN(v) ? '—' : `${Number(v).toFixed(dp)}x`);

/* ---------------------------------------------------------------------------
   Panel — the canonical bento container with optional accent glow
   --------------------------------------------------------------------------- */
export const Panel = ({ title, subtitle, right, glow, className = '', children }) => (
  <div className={`bento relative overflow-hidden p-5 md:p-6 ${className}`}>
    {glow && (
      <div className="glow-accent" style={{ top: '-2rem', right: '-2rem', background: glow }} />
    )}
    {(title || right) && (
      <div className="relative z-10 mb-4 flex items-start justify-between gap-3">
        <div>
          {title && <h3 className="text-base font-semibold tracking-tight text-dhanam-text-hi">{title}</h3>}
          {subtitle && <p className="mt-1 text-xs text-dhanam-text-lo">{subtitle}</p>}
        </div>
        {right}
      </div>
    )}
    <div className="relative z-10">{children}</div>
  </div>
);

/* ---------------------------------------------------------------------------
   StatTile — a single KPI with semantic tone + sign-aware coloring
   --------------------------------------------------------------------------- */
const TONE = {
  neutral: { glow: 'rgba(79,159,255,0.12)', text: 'text-dhanam-text-hi' },
  pos: { glow: 'rgba(54,196,111,0.14)', text: 'text-dhanam-pos' },
  neg: { glow: 'rgba(240,97,109,0.14)', text: 'text-dhanam-neg' },
  warn: { glow: 'rgba(245,166,35,0.14)', text: 'text-dhanam-warn' },
  accent: { glow: 'rgba(45,122,62,0.16)', text: 'text-dhanam-accent' },
};

export const StatTile = ({ label, value, sub, tone = 'neutral', icon, hint }) => {
  const t = TONE[tone] || TONE.neutral;
  return (
    <div className="bento group relative overflow-hidden p-5" title={hint}>
      <div className="glow-accent" style={{ top: '-1.5rem', right: '-1.5rem', background: t.glow }} />
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-dhanam-text-mid">
          {icon}
          {label}
        </div>
        <div className={`tabular text-2xl font-bold tracking-tight md:text-3xl ${t.text}`}>{value}</div>
        {sub && <div className="mt-1.5 text-xs text-dhanam-text-lo">{sub}</div>}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   Skeleton — fixed-height shimmer to prevent layout shift on async loads
   --------------------------------------------------------------------------- */
export const Skeleton = ({ className = 'h-6 w-full' }) => <div className={`skeleton ${className}`} />;

export const SkeletonGrid = ({ rows = 4 }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bento p-5">
        <Skeleton className="mb-3 h-3 w-1/2" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    ))}
  </div>
);

/* ---------------------------------------------------------------------------
   Badge — compact status pill
   --------------------------------------------------------------------------- */
export const Badge = ({ children, tone = 'neutral' }) => {
  const map = {
    neutral: 'bg-white/5 text-dhanam-text-mid border-white/10',
    pos: 'bg-emerald-500/10 text-dhanam-pos border-emerald-500/20',
    neg: 'bg-rose-500/10 text-dhanam-neg border-rose-500/20',
    warn: 'bg-amber-500/10 text-dhanam-warn border-amber-500/20',
    accent: 'bg-emerald-900/30 text-dhanam-accent border-emerald-700/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide ${map[tone] || map.neutral}`}>
      {children}
    </span>
  );
};

/* ---------------------------------------------------------------------------
   DataTable — high-performance grid: sticky header, sortable columns,
   per-cell conditional formatting. Columns spec:
     { key, label, align, render?(row), sortValue?(row), mono? }
   --------------------------------------------------------------------------- */
export const DataTable = ({ columns, rows, initialSort, highlightKey, maxHeight = '420px' }) => {
  const [sort, setSort] = useState(initialSort || { key: null, dir: 'desc' });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number')
        return sort.dir === 'asc' ? av - bv : bv - av;
      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rows, sort, columns]);

  const toggle = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <div className="overflow-auto rounded-xl border border-white/5" style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-dhanam-elev/95 backdrop-blur">
          <tr className="border-b border-white/10">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => c.sortable !== false && toggle(c.key)}
                className={`select-none whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-dhanam-text-lo ${
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                } ${c.sortable !== false ? 'cursor-pointer hover:text-dhanam-text-hi' : ''}`}
              >
                <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                  {c.label}
                  {c.sortable !== false &&
                    (sort.key === c.key ? (
                      sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    ))}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const hl = highlightKey && row[highlightKey];
            return (
              <tr
                key={row.id ?? row.ticker ?? i}
                className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${
                  hl ? 'bg-emerald-900/15' : ''
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap px-3 py-2.5 ${c.mono !== false ? 'tabular' : ''} ${
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* ---------------------------------------------------------------------------
   EmptyState — graceful degradation surface
   --------------------------------------------------------------------------- */
export const EmptyState = ({ icon, title, message }) => (
  <div className="bento flex flex-col items-center justify-center p-10 text-center">
    {icon}
    <h3 className="mt-3 text-lg font-bold text-dhanam-text-hi">{title}</h3>
    <p className="mt-2 max-w-md text-sm text-dhanam-text-mid">{message}</p>
  </div>
);

/* Shared Plotly dark layout defaults — keeps every chart visually consistent. */
export const plotlyDark = (overrides = {}) => ({
  autosize: true,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', color: '#9AA7A0', size: 12 },
  margin: { t: 10, b: 40, l: 50, r: 16 },
  hoverlabel: { bgcolor: '#0E1813', bordercolor: '#2D7A3E', font: { family: 'Roboto Mono', color: '#E6F0EA' } },
  xaxis: { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.1)', tickfont: { color: '#9AA7A0' } },
  yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.1)', tickfont: { color: '#9AA7A0' } },
  ...overrides,
});

export const plotlyConfig = { displayModeBar: false, responsive: true };
