import React, { useRef, useMemo } from 'react';
import Plot from 'react-plotly.js';
import html2canvas from 'html2canvas';
import { Download, ShieldCheck, AlertOctagon, Sparkles, Gauge } from 'lucide-react';
import { useMode } from '../../context/ModeContext';
import {
  Panel, StatTile, Badge, EmptyState, DataTable,
  fmtMoney, fmtPct, fmtBig, fmtNum, plotlyDark, plotlyConfig,
} from '../common/ui';

/* ===========================================================================
   VisualReport — dual-mode overview driven by the 40-point Playbook.
   Beginner: colour-graded scorecard gauge + traffic-light pillars + a plain-
   language (NLG) verdict. Pro: exact decimal pillar breakdown + DCF targets +
   the ROIC−WACC value-creation spread.
   =========================================================================== */

// Plain-language phrasing for the NLG verdict.
const STRONG = {
  intrinsic_value: 'is trading at a deep discount to its fair value',
  balance_sheet: 'rests on a fortress balance sheet',
  earnings_stability: 'has remarkably steady, consistent earnings',
  growth: 'is growing fast with improving returns on capital',
  quant_value: 'screens statistically cheap',
  technical: 'has strong upward price momentum',
  behavioral: 'enjoys strong institutional confidence',
  moat: 'commands a wide competitive moat and real pricing power',
};
const WEAK = {
  intrinsic_value: 'looks expensive versus its intrinsic value',
  balance_sheet: 'carries some balance-sheet risk',
  earnings_stability: 'has uneven, inconsistent earnings',
  growth: 'is growing only slowly',
  quant_value: 'screens expensive on value metrics',
  technical: 'is in a weak price trend',
  behavioral: 'faces elevated short interest',
  moat: 'has a relatively thin competitive moat',
};
const VERDICT = {
  A: 'an exceptional, high-conviction profile',
  B: 'a strong, attractive profile',
  C: 'a mixed, middle-of-the-road profile',
  D: 'a weak profile with notable risks',
  F: 'a poor profile that fails most quality checks',
};

const gradeColor = (g) => (g === 'A' || g === 'B' ? '#36C46F' : g === 'C' ? '#F5A623' : '#F0616D');
const lightFor = (score, available) => {
  if (!available) return { color: '#5F6C66', bg: 'rgba(255,255,255,0.04)', label: 'No data' };
  const r = score / 5;
  if (r >= 0.7) return { color: '#36C46F', bg: 'rgba(54,196,111,0.12)', label: 'Strong' };
  if (r >= 0.4) return { color: '#F5A623', bg: 'rgba(245,166,35,0.12)', label: 'Fair' };
  return { color: '#F0616D', bg: 'rgba(240,97,109,0.12)', label: 'Weak' };
};

const PlaybookTooltip = () => (
  <div className="group relative inline-flex items-center">
    <span className="flex h-4 w-4 cursor-default items-center justify-center rounded-full border border-white/15 bg-white/5 text-[10px] font-bold leading-none text-dhanam-text-lo transition-colors group-hover:border-dhanam-accent/50 group-hover:text-dhanam-accent">
      ?
    </span>
    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2.5 w-72 -translate-x-1/2 translate-y-1 rounded-xl border border-white/10 bg-[#0E1813] p-3.5 text-left text-xs leading-relaxed text-dhanam-text-mid opacity-0 shadow-2xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
      <p className="mb-1 font-semibold text-dhanam-text-hi">About the Playbook Score</p>
      The Playbook Score evaluates a stock across 8 institutional pillars (including DCF valuation,
      balance sheet safety, and competitive moats) to filter out value traps and identify true quality.
      <div className="absolute -bottom-[7px] left-1/2 h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-[#0E1813]" />
    </div>
  </div>
);

const VisualReport = ({ data }) => {
  const { pro } = useMode();
  const reportRef = useRef(null);
  const disclaimerRef = useRef(null);
  const cur = data.currency || 'USD';
  const pb = data.playbook || {};
  const pillars = pb.pillars || [];
  const dcf = data.valuation?.dcf || {};

  const roicPct = pillars.find((p) => p.key === 'growth')?.detail?.roic_now_pct ?? null;
  const waccPct = dcf.wacc != null ? dcf.wacc * 100 : null;
  const spread = roicPct != null && waccPct != null ? roicPct - waccPct : null;

  const narrative = useMemo(() => {
    if (!pillars.length) return '';
    const avail = pillars.filter((p) => p.available);
    const strong = avail.filter((p) => p.score >= 4).sort((a, b) => b.score - a.score);
    const weak = avail.filter((p) => p.score <= 2).sort((a, b) => a.score - b.score);
    let s = `${data.company_name} scored ${pb.total}/40 (Grade ${pb.grade}) — ${VERDICT[pb.grade] || 'a profile with mixed signals'}. `;
    if (strong.length) s += `Its standout strengths: it ${strong.slice(0, 2).map((p) => STRONG[p.key]).join(', and it ')}. `;
    if (weak.length) s += `Key watch-outs: it ${weak.slice(0, 2).map((p) => WEAK[p.key]).join(', and it ')}.`;
    else if (strong.length) s += 'We found no major red flags in the available data.';
    return s;
  }, [pillars, pb.total, pb.grade, data.company_name]);

  const download = async () => {
    if (!reportRef.current) return;
    // Reveal disclaimer only during capture, then hide it again.
    if (disclaimerRef.current) disclaimerRef.current.style.display = 'block';
    const canvas = await html2canvas(reportRef.current, { backgroundColor: '#0A120E', scale: 2 });
    if (disclaimerRef.current) disclaimerRef.current.style.display = 'none';
    const link = document.createElement('a');
    link.download = `${data.ticker}_playbook_scorecard.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  };

  if (!pillars.length) {
    return (
      <EmptyState
        icon={<AlertOctagon className="h-12 w-12 text-dhanam-text-lo" />}
        title="Playbook Score Unavailable"
        message={`The 40-point Playbook needs fundamental data we couldn't retrieve for ${data.ticker}. Try again shortly.`}
      />
    );
  }

  // Shared price-history line (both modes).
  const dates = (data.history || []).map((h) => h.date);
  const closes = (data.history || []).map((h) => h.close);

  return (
    <div className="flex w-full flex-col items-end gap-4 animate-in fade-in duration-500">
      <button onClick={download}
        className="flex items-center gap-2 rounded-lg bg-dhanam-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B4D2B]">
        <Download className="h-4 w-4" /> Download Scorecard
      </button>

      <div ref={reportRef} className="w-full bg-dhanam-panel border border-white/10 rounded-2xl p-6 md:p-8 relative">
        <div data-html2canvas-ignore="true" className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#2D7A3E]/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs tracking-widest text-white">{data.ticker}</span>
              <span className="text-xs text-dhanam-text-lo">{data.sector}</span>
            </div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-dhanam-text-hi">{data.company_name}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={pb.grade === 'A' || pb.grade === 'B' ? 'pos' : pb.grade === 'C' ? 'warn' : 'neg'}>Grade {pb.grade}</Badge>
            <Badge tone="neutral">{pb.pillars_available}/8 pillars graded</Badge>
            <Badge tone="neutral">{pro ? 'Pro view' : 'Beginner view'}</Badge>
          </div>
        </div>

        {/* ---------------- BEGINNER ---------------- */}
        {!pro && (
          <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Gauge */}
            <div className="bento flex flex-col items-center p-4">
              <div className="h-[240px] w-full">
                <Plot
                  data={[{
                    type: 'indicator', mode: 'gauge+number', value: pb.total,
                    number: { font: { size: 44, color: '#E6F0EA', family: 'Roboto Mono' }, suffix: ' /40' },
                    gauge: {
                      axis: { range: [0, 40], tickvals: [0, 13, 20, 27, 34, 40], tickcolor: '#5F6C66', tickfont: { size: 10 } },
                      bar: { color: gradeColor(pb.grade), thickness: 0.28 },
                      bgcolor: 'rgba(0,0,0,0)', borderwidth: 0,
                      steps: [
                        { range: [0, 13], color: 'rgba(240,97,109,0.22)' },
                        { range: [13, 27], color: 'rgba(245,166,35,0.20)' },
                        { range: [27, 40], color: 'rgba(54,196,111,0.20)' },
                      ],
                    },
                  }]}
                  layout={plotlyDark({ height: 240, margin: { t: 24, b: 8, l: 28, r: 28 } })}
                  useResizeHandler style={{ width: '100%', height: '100%' }} config={plotlyConfig}
                />
              </div>
              <div className="-mt-2 flex items-center justify-center gap-1.5">
                <span className="text-xs text-dhanam-text-lo">Overall Playbook Score</span>
                <PlaybookTooltip />
              </div>
            </div>

            {/* NLG verdict */}
            <Panel className="lg:col-span-2" title="What this means" subtitle="Plain-language summary"
              right={<Sparkles className="h-4 w-4 text-dhanam-accent" />}>
              <p className="text-[15px] leading-relaxed text-dhanam-text-mid">{narrative}</p>
            </Panel>

            {/* Traffic-light pillars */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {pillars.map((p) => {
                  const l = lightFor(p.score, p.available);
                  return (
                    <div key={p.key} className="bento p-4" style={{ background: l.bg }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-dhanam-text-hi">{p.name}</span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                      </div>
                      <div className="mt-2 text-xs font-semibold" style={{ color: l.color }}>{l.label}</div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${(p.score / 5) * 100}%`, background: l.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Price line */}
            <Panel className="lg:col-span-3" title="Price History" subtitle={`5-year trend (${cur})`}>
              <div className="h-[260px] w-full">
                <Plot
                  data={[{ x: dates, y: closes, type: 'scatter', mode: 'lines', fill: 'tozeroy',
                    fillcolor: 'rgba(45,122,62,0.10)', line: { color: '#AEE7B1', width: 2 } }]}
                  layout={plotlyDark({ height: 260, yaxis: { tickprefix: cur === 'USD' ? '$' : '', gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' } }, xaxis: { gridcolor: 'rgba(255,255,255,0.04)', tickfont: { color: '#9AA7A0' } } })}
                  useResizeHandler style={{ width: '100%', height: '100%' }} config={plotlyConfig}
                />
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- PRO ---------------- */}
        {pro && (
          <div className="relative z-10 flex flex-col gap-6">
            {/* DCF + value-creation tiles */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatTile label="DCF Fair Value" tone="accent" icon={<Gauge className="h-4 w-4" />}
                value={fmtMoney(dcf.intrinsic_value_per_share ?? data.intrinsic_value, cur)} sub="Per share (base case)" />
              <StatTile label="Upside" tone={(dcf.upside_pct ?? 0) >= 0 ? 'pos' : 'neg'}
                value={dcf.upside_pct != null ? `${dcf.upside_pct > 0 ? '+' : ''}${fmtNum(dcf.upside_pct, 1)}%` : '—'} sub="vs. current price" />
              <StatTile label="WACC" value={waccPct != null ? `${fmtNum(waccPct, 2)}%` : '—'} sub="Discount rate" />
              <StatTile label="ROIC" value={roicPct != null ? `${fmtNum(roicPct, 1)}%` : '—'} sub="Return on invested capital" />
              <StatTile label="ROIC − WACC Spread" tone={spread == null ? 'neutral' : spread >= 0 ? 'pos' : 'neg'}
                value={spread != null ? `${spread > 0 ? '+' : ''}${fmtNum(spread, 1)} pts` : '—'} sub="Value creation" hint="Positive = the company earns more on capital than it costs — genuine value creation." />
            </div>

            {/* Exact pillar breakdown */}
            <Panel title="Playbook Breakdown" subtitle="Exact pillar scores & the metric driving each" right={<PlaybookTooltip />}>
              <DataTable
                columns={[
                  { key: 'name', label: 'Pillar', align: 'left', mono: false, sortable: false,
                    render: (r) => (<div><div className="text-dhanam-text-hi">{r.name}</div><div className="text-[11px] text-dhanam-text-lo">{r.school}</div></div>) },
                  { key: 'score', label: 'Score', align: 'right', sortable: false,
                    render: (r) => (<span className={r.available ? (r.score >= 3.5 ? 'val-pos' : r.score >= 2 ? 'text-dhanam-warn' : 'val-neg') : 'text-dhanam-text-lo'}>{r.available ? `${fmtNum(r.score, 1)}/5` : '—'}</span>) },
                  { key: 'metric', label: 'Key Metric', align: 'right', sortable: false,
                    render: (r) => <span className="text-dhanam-text-mid">{keyMetric(r)}</span> },
                  { key: 'threshold', label: 'Target', align: 'left', mono: false, sortable: false,
                    render: (r) => <span className="text-[11px] text-dhanam-text-lo">{r.detail?.threshold || '—'}</span> },
                ]}
                rows={pillars}
                maxHeight="380px"
              />
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-dhanam-text-mid">Total</span>
                <span className="tabular font-bold text-dhanam-accent">{fmtNum(pb.total_precise, 1)} / 40 &nbsp;·&nbsp; Grade {pb.grade}</span>
              </div>
            </Panel>

            {/* DCF assumptions */}
            <Panel title="DCF Assumptions (raw)" subtitle="3-stage unlevered model inputs">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-3">
                {[
                  ['Stage-1 Growth', fmtPct(dcf.stage1_growth)],
                  ['Terminal Growth', fmtPct(dcf.terminal_growth)],
                  ['UFCF Margin', fmtPct(dcf.ufcf_margin)],
                  ['Base UFCF', fmtBig(dcf.base_ufcf, cur)],
                  ['Net Debt', fmtBig(dcf.net_debt, cur)],
                  ['Beta (used)', fmtNum(dcf.wacc_detail?.beta_used, 2)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-white/5 py-1.5">
                    <span className="text-dhanam-text-lo">{k}</span>
                    <span className="tabular text-dhanam-text-hi">{v}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {/* Export-only disclaimer — invisible in the UI, revealed for html2canvas capture */}
        <div
          ref={disclaimerRef}
          style={{ display: 'none' }}
          className="mt-6 border-t border-white/[0.08] pt-4 text-center text-[10px] leading-relaxed text-gray-500"
        >
          Disclaimer: The Dhanaṁ Playbook Score and intrinsic valuations are generated by automated
          quantitative models for informational and educational purposes only. They do not constitute
          certified financial advice. Always conduct independent due diligence.
        </div>
      </div>
    </div>
  );
};

// One representative metric per pillar for the Pro table.
function keyMetric(p) {
  const d = p.detail || {};
  switch (p.key) {
    case 'intrinsic_value': return d.margin_of_safety_pct != null ? `MoS ${fmtNum(d.margin_of_safety_pct, 0)}%` : '—';
    case 'balance_sheet': return d.net_debt_to_ebitda != null ? `ND/EBITDA ${fmtNum(d.net_debt_to_ebitda, 1)}x` : (d.current_ratio != null ? `CR ${fmtNum(d.current_ratio, 1)}` : '—');
    case 'earnings_stability': return d.quality_years != null ? `${d.quality_years}/${d.years_checked} yrs` : '—';
    case 'growth': return d.best_growth_pct != null ? `g ${fmtNum(d.best_growth_pct, 0)}%` : (d.roic_now_pct != null ? `ROIC ${fmtNum(d.roic_now_pct, 0)}%` : '—');
    case 'quant_value': return d.fcf_yield_pct != null ? `FCF yld ${fmtNum(d.fcf_yield_pct, 1)}%` : '—';
    case 'technical': return d.price_vs_sma200_pct != null ? `${d.price_vs_sma200_pct > 0 ? '+' : ''}${fmtNum(d.price_vs_sma200_pct, 0)}% vs SMA200` : '—';
    case 'behavioral': return d.short_pct_float != null ? `Short ${fmtNum(d.short_pct_float, 1)}%` : '—';
    case 'moat': return d.gross_margin_pct != null ? `GM ${fmtNum(d.gross_margin_pct, 0)}%` : '—';
    default: return '—';
  }
}

export default VisualReport;
