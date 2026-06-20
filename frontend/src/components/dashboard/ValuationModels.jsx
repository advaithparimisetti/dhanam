import React from 'react';
import Plot from 'react-plotly.js';
import { Target, TrendingUp, TrendingDown, AlertOctagon, Layers, Dice5, Scale, Activity } from 'lucide-react';
import {
  Panel, StatTile, Badge, EmptyState, DataTable,
  fmtMoney, fmtBig, fmtPct, fmtNum, fmtX, plotlyDark, plotlyConfig,
} from '../common/ui';

/* ===========================================================================
   ValuationModels — institutional valuation cockpit.
   Consumes the live backend stack (data.valuation): 3-stage DCF, CAPM WACC,
   10,000-path Monte Carlo, and Comparable Company Analysis. Falls back
   gracefully when the engine flags degraded data.
   =========================================================================== */
const ValuationModels = ({ data }) => {
  const cur = data.currency || 'USD';
  const price = data.price || 0;
  const v = data.valuation || {};
  const dcf = v.dcf || {};
  const mc = v.monte_carlo || {};
  const mult = v.multiples || {};
  const macro = v.macro || {};
  const wd = dcf.wacc_detail || {};

  // Fair value: prefer the full DCF, else the Graham fallback the backend stamped.
  const fairValue = dcf.intrinsic_value_per_share ?? data.intrinsic_value ?? 0;
  const isFallback = dcf.status !== 'ok';

  if (!fairValue) {
    return (
      <EmptyState
        icon={<AlertOctagon className="h-12 w-12 text-dhanam-text-lo" />}
        title="Intrinsic Valuation Unavailable"
        message={
          dcf.reason ||
          `The DCF engine requires positive unlevered free cash flow and a valid share count. ${data.ticker} did not meet the baseline criteria.`
        }
      />
    );
  }

  const upside = dcf.upside_pct != null ? dcf.upside_pct / 100 : (fairValue - price) / price;
  const undervalued = upside > 0;

  // ---- Monte Carlo "football field" (precomputed percentiles → honest box) ----
  const p = mc.percentiles || {};
  const hasMC = mc.status === 'ok' && p.p50 != null;

  const waccBridge = [
    { label: 'Risk-Free (10Y)', val: wd.risk_free_rate, tone: 'mid' },
    { label: '+ β · ERP', val: wd.beta_used != null && wd.equity_risk_premium != null ? wd.beta_used * wd.equity_risk_premium : null, tone: 'mid' },
    { label: '= Cost of Equity', val: wd.cost_of_equity, tone: 'accent' },
    { label: 'After-Tax Cost of Debt', val: wd.cost_of_debt_after_tax, tone: 'mid' },
  ];

  // ---- Comparables table (single-name LTM/NTM trading multiples) ----
  const multipleRows = [
    { id: 'evebitda', metric: 'EV / EBITDA (LTM)', value: fmtX(mult.ev_ebitda_ltm) },
    { id: 'evrev', metric: 'EV / Revenue (LTM)', value: fmtX(mult.ev_revenue_ltm) },
    { id: 'pe', metric: 'P / E (LTM)', value: fmtX(mult.pe_ltm) },
    { id: 'fpe', metric: 'P / E (NTM, fwd)', value: fmtX(mult.pe_ntm) },
    { id: 'peg', metric: 'PEG Ratio', value: fmtNum(mult.peg) },
    { id: 'ev', metric: 'Enterprise Value', value: fmtBig(mult.enterprise_value, cur) },
  ];

  return (
    <div className="flex w-full flex-col gap-6 animate-in fade-in duration-500">
      {/* Provenance banner — relative z-10 + pointer-events-auto so decorative
          glow layers below can never overlap or swallow selection/clicks.
          Explicit gap-x/gap-y prevents the badges from crowding into one run. */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-dhanam-text-lo pointer-events-auto select-text">
        <Badge tone={isFallback ? 'warn' : 'accent'}>
          {isFallback ? 'Graham Proxy (degraded)' : '3-Stage DCF · CAPM WACC'}
        </Badge>
        {!isFallback && <Badge tone="neutral">UFCF: {dcf.ufcf_components?.method || 'n/a'}</Badge>}
        {hasMC && <Badge tone="neutral">{mc.iterations?.toLocaleString()} Monte Carlo paths</Badge>}
        <Badge tone="neutral">rf {fmtPct(macro.risk_free_rate)} · ERP {fmtPct(macro.equity_risk_premium)}</Badge>
      </div>

      {/* ---- Top KPI row ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Model Fair Value"
          tone="accent"
          icon={<Target className="h-4 w-4" />}
          value={fmtMoney(fairValue, cur)}
          sub={isFallback ? 'Graham earnings proxy' : 'Per-share intrinsic (base case)'}
        />
        <StatTile
          label="Margin of Safety"
          tone={undervalued ? 'pos' : 'neg'}
          icon={undervalued ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          value={`${upside > 0 ? '+' : ''}${fmtPct(upside)}`}
          sub={undervalued ? 'Trading at a discount to fair value' : 'Trading at a premium to fair value'}
        />
        <StatTile
          label="WACC (CAPM)"
          tone="neutral"
          icon={<Scale className="h-4 w-4" />}
          value={fmtPct(dcf.wacc ?? wd.wacc)}
          sub={`β ${fmtNum(wd.beta_used, 2)} · tax ${fmtPct(wd.tax_rate, 0)}`}
        />
        <StatTile
          label="Base UFCF"
          tone="neutral"
          icon={<Activity className="h-4 w-4" />}
          value={fmtBig(dcf.base_ufcf, cur)}
          sub={dcf.ufcf_margin != null ? `${fmtPct(dcf.ufcf_margin)} of revenue` : 'Unlevered free cash flow'}
        />
      </div>

      {/* ---- Monte Carlo distribution + valuation gap ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monte Carlo football field (spans 2 cols) */}
        <Panel
          className="lg:col-span-2"
          title="Monte Carlo Valuation Distribution"
          subtitle={hasMC ? `Probability-weighted intrinsic value across ${mc.iterations?.toLocaleString()} simulated paths` : 'Simulation unavailable'}
          glow="rgba(45,122,62,0.16)"
          right={hasMC && mc.prob_above_price != null && (
            <Badge tone={mc.prob_above_price >= 0.5 ? 'pos' : 'neg'}>
              <Dice5 className="h-3 w-3" /> {fmtPct(mc.prob_above_price, 0)} prob. upside
            </Badge>
          )}
        >
          {hasMC ? (
            <div className="h-[320px] w-full">
              <Plot
                data={[
                  {
                    type: 'box',
                    orientation: 'h',
                    y: ['Intrinsic'],
                    // Precomputed quartiles — no fabricated samples, honest to the engine output.
                    q1: [p.p25],
                    median: [p.p50],
                    q3: [p.p75],
                    lowerfence: [p.p5],
                    upperfence: [p.p95],
                    mean: [mc.mean],
                    boxpoints: false,
                    marker: { color: 'rgba(45,122,62,0.45)', line: { color: '#2D7A3E', width: 1.5 } },
                    line: { color: '#AEE7B1' },
                    fillcolor: 'rgba(45,122,62,0.25)',
                    hoverinfo: 'x',
                    name: '',
                  },
                ]}
                layout={plotlyDark({
                  height: 320,
                  margin: { t: 20, b: 40, l: 20, r: 20 },
                  xaxis: {
                    title: { text: `Intrinsic Value / Share (${cur})`, font: { color: '#5F6C66', size: 11 } },
                    gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' }, tickprefix: cur === 'USD' ? '$' : '',
                  },
                  yaxis: { showticklabels: false, gridcolor: 'rgba(0,0,0,0)' },
                  shapes: [
                    { type: 'line', x0: price, x1: price, y0: -0.5, y1: 0.5, line: { color: '#F0616D', width: 2, dash: 'dot' } },
                  ],
                  annotations: [
                    { x: price, y: 0.45, text: `Price ${fmtMoney(price, cur)}`, showarrow: false, font: { color: '#F0616D', size: 11 }, yshift: 8 },
                  ],
                })}
                useResizeHandler
                style={{ width: '100%', height: '100%' }}
                config={plotlyConfig}
              />
            </div>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-dhanam-text-lo">
              {mc.reason || 'Insufficient data for simulation.'}
            </div>
          )}
          {hasMC && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[['P5', p.p5], ['P25', p.p25], ['Median', p.p50], ['P75', p.p75], ['P95', p.p95]].map(([lbl, val]) => (
                <div key={lbl} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-dhanam-text-lo">{lbl}</div>
                  <div className="tabular mt-0.5 text-sm font-semibold text-dhanam-text-hi">{fmtMoney(val, cur)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Price vs Fair Value bar */}
        <Panel title="Valuation Gap" subtitle="Market price vs. intrinsic fair value">
          <div className="h-[320px] w-full">
            <Plot
              data={[
                {
                  x: ['Price', 'Fair Value'],
                  y: [price, fairValue],
                  type: 'bar',
                  width: [0.5, 0.5],
                  marker: { color: ['#475569', undervalued ? '#2D7A3E' : '#991B1B'] },
                  text: [fmtMoney(price, cur), fmtMoney(fairValue, cur)],
                  textposition: 'outside',
                  textfont: { family: 'Roboto Mono', color: '#E6F0EA' },
                  hoverinfo: 'none',
                },
              ]}
              layout={plotlyDark({
                height: 320,
                margin: { t: 30, b: 30, l: 40, r: 10 },
                yaxis: { gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' }, tickprefix: cur === 'USD' ? '$' : '' },
                xaxis: { tickfont: { color: '#E6F0EA', size: 13, family: 'Inter' } },
              })}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              config={plotlyConfig}
            />
          </div>
        </Panel>
      </div>

      {/* ---- WACC decomposition + assumptions + comparables ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* WACC bridge */}
        <Panel title="WACC Decomposition" subtitle="CAPM cost of capital build-up">
          <div className="space-y-3">
            {waccBridge.map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b border-white/5 pb-2.5 last:border-0">
                <span className="text-sm text-dhanam-text-mid">{r.label}</span>
                <span className={`tabular text-sm font-semibold ${r.tone === 'accent' ? 'text-dhanam-accent' : 'text-dhanam-text-hi'}`}>
                  {fmtPct(r.val)}
                </span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-900/20 px-3 py-2.5">
              <span className="text-sm font-medium text-dhanam-accent">WACC</span>
              <span className="tabular text-lg font-bold text-dhanam-accent">{fmtPct(dcf.wacc ?? wd.wacc)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-dhanam-text-lo">
              <span>Equity weight: <b className="tabular text-dhanam-text-mid">{fmtPct(wd.weight_equity, 0)}</b></span>
              <span>Debt weight: <b className="tabular text-dhanam-text-mid">{fmtPct(wd.weight_debt, 0)}</b></span>
              <span>Raw β: <b className="tabular text-dhanam-text-mid">{fmtNum(wd.beta_raw, 2)}</b></span>
              <span>Tax rate: <b className="tabular text-dhanam-text-mid">{fmtPct(wd.tax_rate, 0)}</b></span>
            </div>
          </div>
        </Panel>

        {/* Base-case assumptions */}
        <Panel title="Base-Case Assumptions" subtitle="Forward operating model">
          <div className="space-y-3">
            {[
              ['Stage-1 Growth (Y1–5)', fmtPct(dcf.stage1_growth)],
              ['Terminal Growth (perpetuity)', fmtPct(dcf.terminal_growth)],
              ['UFCF Margin', fmtPct(dcf.ufcf_margin)],
              ['Net Debt', fmtBig(dcf.net_debt, cur)],
              ['Shares Outstanding', fmtBig(dcf.shares_outstanding, '')],
            ].map(([k, val]) => (
              <div key={k} className="flex items-center justify-between border-b border-white/5 pb-2.5 last:border-0">
                <span className="text-sm text-dhanam-text-mid">{k}</span>
                <span className="tabular text-sm font-semibold text-dhanam-text-hi">{val}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Trading multiples */}
        <Panel title="Trading Multiples (CCA)" subtitle="LTM / NTM comparable metrics">
          <DataTable
            columns={[
              { key: 'metric', label: 'Metric', align: 'left', mono: false, sortable: false },
              { key: 'value', label: 'Value', align: 'right', sortable: false },
            ]}
            rows={multipleRows}
            maxHeight="320px"
          />
        </Panel>
      </div>
    </div>
  );
};

export default ValuationModels;
