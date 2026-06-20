import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { Activity, ShieldAlert, TrendingDown, AlertTriangle, Gauge, Waves, Info, Crosshair, Sun, CloudSun, CloudLightning, ShieldCheck } from 'lucide-react';
import { getRiskProfile } from '../../api/client';
import { StatTile, Panel, SkeletonGrid, Skeleton, fmtNum, fmtPct, plotlyDark, plotlyConfig } from '../common/ui';
import { useMode } from '../../context/ModeContext';

/* ===========================================================================
   RiskMetrics — advanced risk analytics surface.
   Renders the backend risk engine: Beta, Sharpe, Sortino, Treynor, Calmar,
   historical VaR-95 and Conditional VaR (Expected Shortfall), plus drawdown.
   Charts are computed in-browser from the OHLC history for instant feedback.
   =========================================================================== */
const RiskMetrics = ({ data }) => {
  const { pro } = useMode();
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getRiskProfile(data.ticker);
        if (mounted) { setRisk(res); setError(res?.error || null); }
      } catch {
        if (mounted) setError('Failed to load benchmark risk metrics.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [data.ticker]);

  // ---- In-browser return & drawdown series from OHLC history ----
  const history = data.history || [];
  const returns = [], returnDates = [], drawdowns = [], ddDates = [];
  let peak = -Infinity;
  for (let i = 0; i < history.length; i++) {
    const c = history[i].close;
    if (c == null) continue;
    if (c > peak) peak = c;
    drawdowns.push(((c - peak) / peak) * 100);
    ddDates.push(history[i].date);
    if (i > 0 && history[i - 1].close) {
      returns.push(((c - history[i - 1].close) / history[i - 1].close) * 100);
      returnDates.push(history[i].date);
    }
  }

  // Decimal → percent for tail metrics; backend sends decimals.
  const var95 = risk?.var_95 != null ? risk.var_95 * 100 : null;
  const cvar95 = risk?.cvar_95 != null ? risk.cvar_95 * 100 : null;
  const maxDd = risk?.max_drawdown != null ? risk.max_drawdown * 100 : (drawdowns.length ? Math.min(...drawdowns) : null);

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-6">
        <SkeletonGrid rows={4} />
        <SkeletonGrid rows={4} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="bento p-6"><Skeleton className="h-[300px] w-full" /></div>
          <div className="bento p-6"><Skeleton className="h-[300px] w-full" /></div>
        </div>
      </div>
    );
  }

  const beta = risk?.beta;
  const sharpe = risk?.sharpe_ratio;
  const sortino = risk?.sortino_ratio;
  const treynor = risk?.treynor_ratio;
  const calmar = risk?.calmar_ratio;

  const betaTone = beta == null ? 'neutral' : beta > 1.2 ? 'neg' : beta < 0.8 ? 'pos' : 'neutral';
  const ratioTone = (x, good = 1) => (x == null ? 'neutral' : x >= good ? 'pos' : x < 0 ? 'neg' : 'warn');

  // ===================== BEGINNER: "Safety Weather Forecast" =====================
  if (!pro) {
    const vol = risk?.annualized_volatility;                 // decimal
    const betaDelta = beta != null ? Math.round((beta - 1) * 100) : null;
    const rScore =
      (beta != null ? (beta > 1.3 ? 2 : beta > 0.9 ? 1 : 0) : 1) +
      (vol != null ? (vol > 0.4 ? 2 : vol > 0.25 ? 1 : 0) : 1) +
      (maxDd != null ? (maxDd < -40 ? 2 : maxDd < -25 ? 1 : 0) : 0);
    const weather = rScore <= 1
      ? { Icon: Sun, label: 'Calm & Sunny', color: '#36C46F', desc: 'Low risk — this stock has stayed relatively steady.' }
      : rScore <= 3
      ? { Icon: CloudSun, label: 'Partly Cloudy', color: '#F5A623', desc: 'Moderate risk — expect some ups and downs along the way.' }
      : { Icon: CloudLightning, label: 'Stormy', color: '#F0616D', desc: 'High risk — this stock can swing sharply in both directions.' };
    const crash = beta == null
      ? 'Not enough data to gauge crash sensitivity.'
      : beta >= 1
      ? `In a market crash, ${data.ticker} usually drops about ${betaDelta}% more than the overall market.`
      : `In a market crash, ${data.ticker} usually drops about ${Math.abs(betaDelta)}% less than the market — relatively defensive.`;
    const volLabel = vol == null ? '—' : vol > 0.4 ? 'High' : vol > 0.25 ? 'Medium' : 'Low';
    const reward = sharpe == null ? '—' : sharpe > 1 ? 'Excellent' : sharpe > 0 ? 'Decent' : 'Poor';
    const Icon = weather.Icon;
    const cards = [
      { t: 'Crash Sensitivity', v: crash, icon: <TrendingDown className="h-4 w-4" /> },
      { t: 'Worst Drop (1Y)', v: maxDd != null ? `Its biggest fall this year was about ${Math.abs(maxDd).toFixed(0)}%.` : 'Not enough data.', icon: <Activity className="h-4 w-4" /> },
      { t: 'Bumpiness', v: `${volLabel} day-to-day price swings.`, icon: <Waves className="h-4 w-4" /> },
      { t: 'Reward for the Risk', v: reward === '—' ? 'Not enough data.' : `${reward} — ${reward === 'Excellent' ? 'strong' : reward === 'Decent' ? 'fair' : 'weak'} returns for the risk taken.`, icon: <ShieldCheck className="h-4 w-4" /> },
    ];
    return (
      <div className="flex w-full flex-col gap-6 animate-in fade-in duration-500">
        {error && <div className="rounded-xl border border-rose-900/30 bg-rose-900/10 p-3 text-sm text-dhanam-neg">{error}</div>}
        <Panel title="Safety Weather Forecast" subtitle="How risky has this stock been?">
          <div className="flex flex-col items-center gap-4 py-2 text-center sm:flex-row sm:text-left">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl" style={{ background: weather.color + '22' }}>
              <Icon className="h-12 w-12" style={{ color: weather.color }} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: weather.color }}>{weather.label}</div>
              <p className="mt-1 text-sm text-dhanam-text-mid">{weather.desc}</p>
            </div>
          </div>
        </Panel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.t} className="bento p-5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-dhanam-text-hi">{c.icon}{c.t}</div>
              <p className="text-sm leading-relaxed text-dhanam-text-mid">{c.v}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-dhanam-text-lo">Switch to <b>Pro</b> for Beta, Sortino, Treynor, VaR and Conditional VaR (CVaR).</p>
      </div>
    );
  }

  // ===================== PRO: advanced risk analytics =====================
  return (
    <div className="flex w-full flex-col gap-6 animate-in fade-in duration-500">
      {error && (
        <div className="rounded-xl border border-rose-900/30 bg-rose-900/10 p-3 text-sm text-dhanam-neg">{error}</div>
      )}

      {/* ---- Risk-adjusted return ratios ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Beta (vs S&P 500)" tone={betaTone} icon={<Activity className="h-4 w-4" />}
          value={fmtNum(beta, 2)}
          sub={beta == null ? '—' : beta > 1.2 ? 'High systematic volatility' : beta < 0.8 ? 'Defensive / low-beta' : 'Market-correlated'}
          hint="Systematic risk: weekly OLS of stock vs benchmark returns." />
        <StatTile label="Sharpe (annualised)" tone={ratioTone(sharpe, 1)} icon={<ShieldAlert className="h-4 w-4" />}
          value={fmtNum(sharpe, 2)} sub="Excess return per unit of total volatility" />
        <StatTile label="Sortino (annualised)" tone={ratioTone(sortino, 1)} icon={<Waves className="h-4 w-4" />}
          value={fmtNum(sortino, 2)} sub="Excess return per unit of downside risk"
          hint="Penalises only downside deviation, not upside swings." />
        <StatTile label="Treynor" tone={ratioTone(treynor, 0.05)} icon={<Gauge className="h-4 w-4" />}
          value={fmtNum(treynor, 3)} sub="Excess return per unit of systematic (β) risk" />
      </div>

      {/* ---- Tail & drawdown risk ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Value at Risk (95%)" tone="warn" icon={<AlertTriangle className="h-4 w-4" />}
          value={var95 != null ? `${var95.toFixed(2)}%` : '—'} sub="Max expected daily loss, 95% confidence" />
        <StatTile label="Conditional VaR (95%)" tone="neg" icon={<Crosshair className="h-4 w-4" />}
          value={cvar95 != null ? `${cvar95.toFixed(2)}%` : '—'} sub="Expected shortfall — mean loss in the tail"
          hint="Average loss on the worst 5% of days. Captures tail severity beyond VaR." />
        <StatTile label="Max Drawdown" tone="neg" icon={<TrendingDown className="h-4 w-4" />}
          value={maxDd != null ? `${maxDd.toFixed(2)}%` : '—'} sub="Worst peak-to-trough decline" />
        <StatTile label="Calmar Ratio" tone={ratioTone(calmar, 0.5)} icon={<Gauge className="h-4 w-4" />}
          value={fmtNum(calmar, 2)} sub="Annual return per unit of max drawdown" />
      </div>

      {/* Annualised context strip */}
      {risk && !error && (
        <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-3 text-xs text-dhanam-text-mid">
          <span>Ann. Return: <b className="tabular text-dhanam-text-hi">{fmtPct(risk.annualized_return)}</b></span>
          <span>Ann. Volatility: <b className="tabular text-dhanam-text-hi">{fmtPct(risk.annualized_volatility)}</b></span>
          <span>Downside Dev: <b className="tabular text-dhanam-text-hi">{fmtPct(risk.downside_deviation)}</b></span>
          <span>Risk-Free: <b className="tabular text-dhanam-text-hi">{fmtPct(risk.risk_free_rate)}</b></span>
          <span>Observations: <b className="tabular text-dhanam-text-hi">{risk.observations ?? '—'}</b></span>
        </div>
      )}

      {/* ---- Charts ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Return Distribution" subtitle="Daily returns — VaR & CVaR thresholds marked">
          <div className="h-[300px] w-full">
            {returns.length > 0 ? (
              <Plot
                data={[{ x: returns, type: 'histogram', nbinsx: 60, marker: { color: '#F5A623', opacity: 0.8 }, name: 'Daily Returns' }]}
                layout={plotlyDark({
                  height: 300,
                  bargap: 0.02,
                  xaxis: { title: { text: 'Daily Return (%)', font: { color: '#5F6C66', size: 11 } }, gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' } },
                  yaxis: { title: { text: 'Frequency', font: { color: '#5F6C66', size: 11 } }, gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' } },
                  shapes: [
                    var95 != null && { type: 'line', x0: var95, x1: var95, y0: 0, y1: 1, yref: 'paper', line: { color: '#F0616D', width: 2, dash: 'dash' } },
                    cvar95 != null && { type: 'line', x0: cvar95, x1: cvar95, y0: 0, y1: 1, yref: 'paper', line: { color: '#B91C1C', width: 2, dash: 'dot' } },
                  ].filter(Boolean),
                  annotations: [
                    var95 != null && { x: var95, y: 1, yref: 'paper', text: 'VaR', showarrow: false, xanchor: 'right', xshift: -3, font: { color: '#F0616D', size: 11 } },
                    cvar95 != null && { x: cvar95, y: 0.9, yref: 'paper', text: 'CVaR', showarrow: false, xanchor: 'right', xshift: -3, font: { color: '#B91C1C', size: 11 } },
                  ].filter(Boolean),
                })}
                useResizeHandler style={{ width: '100%', height: '100%' }} config={plotlyConfig}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-dhanam-text-lo">Not enough data to render histogram.</div>
            )}
          </div>
        </Panel>

        <Panel title="Drawdown Profile" subtitle="Rolling decline from the absolute peak">
          <div className="h-[300px] w-full">
            {drawdowns.length > 0 ? (
              <Plot
                data={[{ x: ddDates, y: drawdowns, type: 'scatter', mode: 'lines', fill: 'tozeroy', fillcolor: 'rgba(240,97,109,0.12)', line: { color: '#F0616D', width: 1.5 }, name: 'Drawdown %' }]}
                layout={plotlyDark({ height: 300, yaxis: { ticksuffix: '%', gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' } }, xaxis: { gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' } } })}
                useResizeHandler style={{ width: '100%', height: '100%' }} config={plotlyConfig}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-dhanam-text-lo">Not enough data to render drawdowns.</div>
            )}
          </div>
        </Panel>
      </div>

      {/* Interpretation */}
      <div className="flex gap-4 rounded-xl border border-blue-900/30 bg-blue-900/10 p-5">
        <Info className="h-5 w-5 shrink-0 text-dhanam-info" />
        <div>
          <h4 className="mb-2 text-sm font-semibold text-blue-300">Reading the Risk Profile</h4>
          <ul className="list-inside list-disc space-y-1.5 text-sm text-dhanam-text-mid">
            <li><strong className="text-dhanam-text-hi">Sortino &gt; Sharpe</strong> means most volatility is upside — a favourable asymmetry.</li>
            <li><strong className="text-dhanam-text-hi">CVaR</strong> (dotted line) sits left of <strong className="text-dhanam-text-hi">VaR</strong> (dashed): it measures how bad the worst 5% of days actually are, not just where they begin.</li>
            <li><strong className="text-dhanam-text-hi">Treynor &amp; Calmar</strong> reward return earned per unit of systematic risk and per unit of historical pain, respectively.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RiskMetrics;
