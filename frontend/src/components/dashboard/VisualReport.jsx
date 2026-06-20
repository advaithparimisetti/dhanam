import React, { useRef } from 'react';
import Plot from 'react-plotly.js';
import { Check, X, Download } from 'lucide-react';
import html2canvas from 'html2canvas';

const VisualReport = ({ data }) => {
  const reportRef = useRef(null);
  const details = data.scores.details || {};
  
  // Scoring
  const uScore = data.scores.undervalued_score || 0;
  const mScore = data.scores.multibagger_score || 0;
  const uPct = Math.max(0, Math.min(1, uScore / 40.0));
  const mPct = Math.max(0, Math.min(1, mScore / 50.0));

  // Radar Components
  const peVal = details.pe || 0;
  const roeVal = details.roe || 0;
  const revgVal = details.revenueGrowth || 0;
  const dteVal = details.debtToEquity || 0;
  const gmVal = details.grossMargins || 0;

  const valuationComp = (peVal > 0) ? Math.max(0, Math.min(1, (40 - peVal) / 40)) : 0;
  const profitabilityComp = roeVal ? Math.max(0, Math.min(1, roeVal / 0.25)) : 0;
  const growthComp = revgVal ? Math.max(0, Math.min(1, revgVal / 0.25)) : 0;
  const balanceComp = dteVal ? Math.max(0, Math.min(1, 1 - (dteVal / 2.0))) : 0;
  const moatComp = gmVal ? Math.max(0, Math.min(1, gmVal / 0.60)) : 0;

  // Checklist
  const checklist = [
    { label: "Price below Intrinsic DCF Value", passed: data.intrinsic_value && data.price < data.intrinsic_value },
    { label: "Debt/Equity < 0.5", passed: dteVal !== null && dteVal < 0.5 },
    { label: "ROE > 15%", passed: roeVal !== null && roeVal > 0.15 },
    { label: "Revenue growth > 5%", passed: revgVal !== null && revgVal > 0.05 },
    { label: "Small-cap < $2B", passed: data.market_cap !== null && data.market_cap < 2e9 },
    { label: "EPS qtr accel > 20%", passed: details.eps_growth !== null && details.eps_growth > 0.2 },
  ];

  // Chart Data Extraction
  const dates = data.history ? data.history.map(item => item.date) : [];
  const prices = data.history ? data.history.map(item => item.close) : [];

  const formatPct = (val) => val != null ? `${(val * 100).toFixed(1)}%` : 'n/a';
  const formatPrice = (val) => val != null ? `${data.currency === 'USD' ? '$' : data.currency + ' '}${val.toLocaleString(undefined, {minimumFractionDigits: 2})}` : 'n/a';
  const formatMcap = (val) => val != null ? `${data.currency === 'USD' ? '$' : ''}${(val / 1e9).toFixed(2)}B` : 'n/a';

  // --- Live valuation-engine summary (DCF + Monte Carlo) for the overview band ---
  const valuation = data.valuation || {};
  const dcf = valuation.dcf || {};
  const mc = valuation.monte_carlo || {};
  const mcP = mc.percentiles || {};
  const fairValue = dcf.intrinsic_value_per_share ?? data.intrinsic_value;
  const upsidePct = dcf.upside_pct != null
    ? dcf.upside_pct
    : (fairValue && data.price ? ((fairValue - data.price) / data.price) * 100 : null);
  const isUnder = upsidePct != null && upsidePct > 0;

  const handleDownload = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { backgroundColor: '#0A120E', scale: 2 });
    const link = document.createElement('a');
    link.download = `${data.ticker}_playbook_report.png`;
    link.href = canvas.toDataURL("image/png", 1.0);
    link.click();
  };

  return (
    <div className="w-full flex flex-col items-end gap-4 animate-in fade-in duration-500">
      <button onClick={handleDownload} className="flex items-center gap-2 bg-[#2D7A3E] hover:bg-[#1B4D2B] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg">
        <Download className="w-4 h-4" /> Download Report
      </button>

      <div ref={reportRef} className="w-full bg-[#0A120E] border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl relative">
        {/* Decorative glow — excluded from html2canvas capture (it rasterizes
            heavy blur() as a hard circle, producing the watermark artifact). */}
        <div data-html2canvas-ignore="true" className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#2D7A3E]/5 rounded-full blur-[100px] pointer-events-none"></div>

        {/* 1. Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-white/10 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{data.company_name}</h1>
            <div className="text-gray-400 text-sm mt-1">
              <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white mr-2">{data.ticker}</span>
              Sector: {data.sector}
            </div>
            <div className="text-gray-500 text-xs mt-3">
              Price: <span className="text-gray-300 font-medium">{formatPrice(data.price)}</span> &nbsp;|&nbsp; 
              Market Cap: <span className="text-gray-300 font-medium">{formatMcap(data.market_cap)}</span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-w-[200px]">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2 text-center">Core Snapshot</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="text-gray-400">P/E:</div><div className="text-white font-medium text-right">{peVal ? peVal.toFixed(2) : 'n/a'}</div>
              <div className="text-gray-400">P/B:</div><div className="text-white font-medium text-right">{details.pb ? details.pb.toFixed(2) : 'n/a'}</div>
              <div className="text-gray-400">ROE:</div><div className="text-white font-medium text-right">{formatPct(roeVal)}</div>
              <div className="text-gray-400">Rev Gr:</div><div className="text-white font-medium text-right">{formatPct(revgVal)}</div>
            </div>
          </div>
        </div>

        {/* 1b. Live Valuation Engine Band (3-stage DCF + 10k Monte Carlo) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 w-full">
          <div className="bg-black/20 border border-white/5 rounded-xl p-4">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">DCF Fair Value</div>
            <div className="text-xl md:text-2xl font-bold text-[#AEE7B1] font-mono tabular">{formatPrice(fairValue)}</div>
            <div className="text-[11px] text-gray-600 mt-1">{dcf.status === 'ok' ? '3-stage unlevered DCF' : 'Graham proxy'}</div>
          </div>
          <div className="bg-black/20 border border-white/5 rounded-xl p-4">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Upside / Downside</div>
            <div className={`text-xl md:text-2xl font-bold font-mono tabular ${upsidePct == null ? 'text-gray-400' : isUnder ? 'text-[#36C46F]' : 'text-[#F0616D]'}`}>
              {upsidePct == null ? 'n/a' : `${upsidePct > 0 ? '+' : ''}${upsidePct.toFixed(1)}%`}
            </div>
            <div className="text-[11px] text-gray-600 mt-1">vs. current price</div>
          </div>
          <div className="bg-black/20 border border-white/5 rounded-xl p-4">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">WACC (CAPM)</div>
            <div className="text-xl md:text-2xl font-bold text-white font-mono tabular">{dcf.wacc != null ? `${(dcf.wacc * 100).toFixed(2)}%` : 'n/a'}</div>
            <div className="text-[11px] text-gray-600 mt-1">{dcf.wacc_detail?.beta_used != null ? `β ${dcf.wacc_detail.beta_used.toFixed(2)}` : 'discount rate'}</div>
          </div>
          <div className="bg-black/20 border border-white/5 rounded-xl p-4">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Monte Carlo 90% CI</div>
            <div className="text-base md:text-lg font-bold text-white font-mono tabular leading-tight">
              {mcP.p5 != null ? `${formatPrice(mcP.p5)} – ${formatPrice(mcP.p95)}` : 'n/a'}
            </div>
            <div className="text-[11px] text-gray-600 mt-1">{mc.prob_above_price != null ? `${(mc.prob_above_price * 100).toFixed(0)}% prob. upside` : `${(mc.iterations || 0).toLocaleString()} paths`}</div>
          </div>
        </div>

        {/* 2. Middle Row: Gauges, Radar, Checklist */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10 w-full">
          <div className="flex flex-col justify-center space-y-8 bg-black/20 rounded-xl p-6 border border-white/5">
            <div>
              <div className="flex justify-between text-sm mb-2"><span className="text-gray-400 font-medium">Value Score</span><span className="text-white font-bold">{uScore}/40</span></div>
              <div className="w-full bg-white/5 h-6 rounded-md overflow-hidden relative border border-white/10"><div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" style={{ width: `${uPct * 100}%` }}/></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2"><span className="text-gray-400 font-medium">Growth Score</span><span className="text-white font-bold">{mScore}/50</span></div>
              <div className="w-full bg-white/5 h-6 rounded-md overflow-hidden relative border border-white/10"><div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" style={{ width: `${mPct * 100}%` }}/></div>
            </div>
          </div>

          <div className="bg-black/20 rounded-xl p-4 border border-white/5 flex items-center justify-center min-h-[350px]">
            <Plot
              data={[{ type: 'scatterpolar', r: [valuationComp, profitabilityComp, growthComp, balanceComp, moatComp, valuationComp], theta: ['Valuation', 'Profitability', 'Growth', 'Balance', 'Moat', 'Valuation'], fill: 'toself', fillcolor: 'rgba(45, 122, 62, 0.4)', line: { color: '#AEE7B1', width: 2 }, hoverinfo: 'none' }]}
              layout={{ autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', margin: { t: 30, b: 30, l: 40, r: 40 }, polar: { radialaxis: { visible: true, range: [0, 1], showticklabels: false, gridcolor: 'rgba(255,255,255,0.1)' }, angularaxis: { tickfont: { color: '#E6F0EA', size: 12, family: 'Inter' }, gridcolor: 'rgba(255,255,255,0.1)' }, bgcolor: 'rgba(0,0,0,0)' }, showlegend: false }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
            />
          </div>

          <div className="bg-black/20 rounded-xl p-6 border border-white/5 flex flex-col justify-center">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Institutional Checklist</h3>
            <div className="space-y-3">
              {checklist.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${item.passed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{item.passed ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}</div>
                  <span className="text-sm text-gray-300">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Bottom Row: Interactive Price History Chart */}
        <div className="w-full bg-black/20 border border-white/5 rounded-xl p-4 md:p-6 min-h-[300px]">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Price History (5Y) — {data.ticker}</h3>
          {dates.length > 0 ? (
            <Plot
              data={[
                { x: dates, y: prices, type: 'scatter', mode: 'lines', fill: 'tozeroy', fillcolor: 'rgba(45, 122, 62, 0.1)', line: { color: '#AEE7B1', width: 2 }, name: 'Price' }
              ]}
              layout={{
                autosize: true,
                height: 250,
                margin: { t: 10, b: 40, l: 50, r: 10 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                xaxis: { showgrid: false, tickfont: { color: '#888' }, linecolor: 'rgba(255,255,255,0.1)' },
                yaxis: { showgrid: true, gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#888' }, tickprefix: data.currency === 'USD' ? '$' : '' }
              }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
              config={{ displayModeBar: false }}
            />
          ) : (
            <div className="w-full h-[250px] flex items-center justify-center text-gray-500 text-sm">Historical data currently unavailable for this ticker.</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default VisualReport;