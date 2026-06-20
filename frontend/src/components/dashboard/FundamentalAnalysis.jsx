import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { Building2, FileSpreadsheet, Target, Newspaper, ExternalLink } from 'lucide-react';
import { getFundamentals } from '../../api/client';
import { useMode } from '../../context/ModeContext';

// Derive a Beginner "Financial Health" traffic-light set from the Playbook +
// DCF data already on the analyze payload (no raw-statement parsing needed).
function healthLights(data) {
  const find = (k) => (data.playbook?.pillars || []).find((p) => p.key === k) || {};
  const bs = find('balance_sheet').detail || {};
  const es = find('earnings_stability');
  const qv = find('quant_value').detail || {};
  const netDebt = data.valuation?.dcf?.net_debt;
  const L = (ok, warn) => (ok ? { c: '#36C46F', t: 'Healthy' } : warn ? { c: '#F5A623', t: 'Caution' } : { c: '#F0616D', t: 'Risk' });

  const lights = [];
  if (netDebt != null)
    lights.push({ title: 'Cash vs Debt', ...L(netDebt < 0, (bs.net_debt_to_ebitda ?? 9) < 3),
      desc: netDebt < 0 ? 'The company holds more cash than debt — a strong position.' : 'The company carries net debt; manageable if earnings are steady.' });
  if (bs.net_debt_to_ebitda != null)
    lights.push({ title: 'Debt Load', ...L(bs.net_debt_to_ebitda < 3, bs.net_debt_to_ebitda < 5),
      desc: `Debt is about ${bs.net_debt_to_ebitda.toFixed(1)}× yearly earnings (under 3× is comfortable).` });
  if (bs.current_ratio != null)
    lights.push({ title: 'Liquidity', ...L(bs.current_ratio >= 1.5, bs.current_ratio >= 1),
      desc: `It has ${bs.current_ratio.toFixed(1)}× the short-term cash it needs for short-term bills.` });
  if (es.available)
    lights.push({ title: 'Profitability', ...L(es.score >= 4, es.score >= 2),
      desc: `Earnings have been ${es.score >= 4 ? 'consistently positive' : es.score >= 2 ? 'mostly positive' : 'unstable'} over recent years.` });
  if (qv.fcf_yield_pct != null)
    lights.push({ title: 'Cash Generation', ...L(qv.fcf_yield_pct >= 3, qv.fcf_yield_pct > 0),
      desc: `It generates ${qv.fcf_yield_pct >= 3 ? 'healthy' : qv.fcf_yield_pct > 0 ? 'some' : 'little'} free cash relative to its size.` });
  return lights;
}

const FundamentalAnalysis = ({ data }) => {
  const { pro } = useMode();
  const [funData, setFunData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('profile');
  const [finStatement, setFinStatement] = useState('income'); // 'income', 'balance', 'cashflow'

  useEffect(() => {
    let isMounted = true;
    const fetchFun = async () => {
      try {
        setLoading(true);
        const res = await getFundamentals(data.ticker);
        if (isMounted) {
          setFunData(res);
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError("Failed to load deep-dive fundamental data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchFun();
    return () => { isMounted = false; };
  }, [data.ticker]);

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-20 animate-in fade-in">
        <div className="w-10 h-10 border-4 border-[#1B4D2B] border-t-[#AEE7B1] rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400">Retrieving SEC Filings and Analyst Data...</p>
      </div>
    );
  }

  if (error || !funData) {
    return <div className="text-sm text-red-400 bg-red-900/10 p-4 rounded-lg border border-red-900/30">{error}</div>;
  }

  const { profile, analyst, financials, news } = funData;

  // --- Financial Table Renderer ---
  const renderFinancialTable = (statementData) => {
    if (!statementData || statementData.length === 0) {
      return <div className="text-gray-500 py-10 text-center">Data unavailable for this statement.</div>;
    }
    const columns = Object.keys(statementData[0]);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="text-xs text-gray-500 uppercase bg-black/40 border-b border-white/10">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="px-6 py-3 font-semibold">{col === 'index' ? 'Metric' : col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statementData.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                {columns.map((col, colIndex) => {
                  let val = row[col];
                  // Format large numbers
                  if (typeof val === 'number') {
                    if (Math.abs(val) > 1e9) val = `${(val / 1e9).toFixed(2)}B`;
                    else if (Math.abs(val) > 1e6) val = `${(val / 1e6).toFixed(2)}M`;
                    else val = val.toLocaleString();
                  }
                  return (
                    <td key={colIndex} className={`px-6 py-3 ${colIndex === 0 ? 'font-medium text-white' : ''}`}>
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in duration-500">
      
      {/* Sub-Navigation */}
      <div className="flex space-x-2 border-b border-white/10 pb-4 overflow-x-auto hide-scrollbar">
        {[
          { id: 'profile', icon: <Building2 className="w-4 h-4" />, label: 'Profile' },
          { id: 'financials', icon: <FileSpreadsheet className="w-4 h-4" />, label: 'Financials' },
          { id: 'analysts', icon: <Target className="w-4 h-4" />, label: 'Analyst Ratings' },
          { id: 'news', icon: <Newspaper className="w-4 h-4" />, label: 'News' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeSubTab === tab.id ? 'bg-[#2D7A3E] text-white' : 'bg-black/20 text-gray-400 hover:bg-white/10'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Profile Tab */}
      {activeSubTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#0A120E] border border-white/5 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Business Summary</h3>
            <p className="text-gray-400 leading-relaxed text-sm md:text-base">{profile.longBusinessSummary}</p>
          </div>
          <div className="lg:col-span-1 bg-[#0A120E] border border-white/5 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Key Details</h3>
            <div className="space-y-4">
              <div><span className="text-gray-500 text-xs uppercase tracking-wider">Sector</span><div className="text-white font-medium">{profile.sector}</div></div>
              <div><span className="text-gray-500 text-xs uppercase tracking-wider">Industry</span><div className="text-white font-medium">{profile.industry}</div></div>
              <div><span className="text-gray-500 text-xs uppercase tracking-wider">Full Time Employees</span><div className="text-white font-medium">{profile.fullTimeEmployees?.toLocaleString()}</div></div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wider">Website</span>
                <div>
                  <a href={profile.website} target="_blank" rel="noreferrer" className="text-[#AEE7B1] hover:underline flex items-center gap-1 font-medium">
                    {profile.website !== 'N/A' ? 'Visit Website' : 'N/A'} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2a. Financials — BEGINNER: Financial Health traffic lights (raw sheets hidden) */}
      {activeSubTab === 'financials' && !pro && (
        <div className="bg-[#0A120E] border border-white/5 rounded-2xl p-6 shadow-xl w-full">
          <h3 className="text-lg font-semibold text-white mb-1">Financial Health</h3>
          <p className="text-sm text-gray-500 mb-6">A simple cash-vs-debt and profitability check — green is good, red is a worry.</p>
          {(() => {
            const lights = healthLights(data);
            if (!lights.length) return <div className="text-gray-500 py-8 text-center">Not enough data for a health check.</div>;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {lights.map((l) => (
                  <div key={l.title} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{l.title}</span>
                      <span className="flex items-center gap-2 text-xs font-medium" style={{ color: l.c }}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.c }} /> {l.t}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-400 leading-relaxed">{l.desc}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          <p className="mt-4 text-[11px] text-gray-600">Switch to <b>Pro</b> to see the full income statement, balance sheet and cash-flow statements.</p>
        </div>
      )}

      {/* 2b. Financial Statements — PRO: raw 10-K sheets */}
      {activeSubTab === 'financials' && pro && (
        <div className="bg-[#0A120E] border border-white/5 rounded-2xl p-6 shadow-xl w-full">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h3 className="text-lg font-semibold text-white">Annual Statements</h3>
            <div className="flex bg-black/40 border border-white/10 rounded-lg p-1">
              {[
                { id: 'income', label: 'Income Statement' },
                { id: 'balance', label: 'Balance Sheet' },
                { id: 'cashflow', label: 'Cash Flow' }
              ].map(st => (
                <button
                  key={st.id}
                  onClick={() => setFinStatement(st.id)}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${finStatement === st.id ? 'bg-[#2D7A3E] text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
          {renderFinancialTable(financials[finStatement])}
        </div>
      )}

      {/* 3. Analyst Ratings Tab */}
      {activeSubTab === 'analysts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#0A120E] border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-center min-h-[300px]">
            <h3 className="text-lg font-semibold text-white mb-2 w-full">Consensus: {analyst.recommendationKey}</h3>
            {analyst.recommendationMean ? (
              <Plot
                data={[{
                  type: "indicator",
                  mode: "gauge+number",
                  // Yahoo scale is 1 (Strong Buy) to 5 (Sell). We invert for rendering so 5 = Green, 1 = Red
                  value: 6 - analyst.recommendationMean,
                  number: { suffix: " Score", font: { size: 30, color: 'white' } },
                  gauge: {
                    axis: { range: [1, 5], tickwidth: 1, tickcolor: "white", tickvals: [1, 2, 3, 4, 5], ticktext: ['Sell', '', 'Hold', '', 'Buy'] },
                    bar: { color: "rgba(255,255,255,0.8)", thickness: 0.1 },
                    bgcolor: "rgba(0,0,0,0)",
                    steps: [
                      { range: [1, 2.5], color: "#EF4444" }, // Red
                      { range: [2.5, 3.5], color: "#F59E0B" }, // Yellow
                      { range: [3.5, 5], color: "#10B981" } // Green
                    ],
                  }
                }]}
                layout={{ autosize: true, margin: { t: 40, b: 20, l: 30, r: 30 }, paper_bgcolor: 'rgba(0,0,0,0)', font: { color: 'white', family: 'Inter' } }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ displayModeBar: false }}
              />
            ) : (
              <div className="text-gray-500">Analyst consensus data unavailable.</div>
            )}
            <div className="text-xs text-gray-500 mt-[-20px] mb-4">Original Yahoo Score: {analyst.recommendationMean} (1=Buy, 5=Sell)</div>
          </div>

          <div className="bg-[#0A120E] border border-white/5 rounded-2xl p-6 shadow-xl flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-white mb-6">Price Targets</h3>
            <div className="space-y-6">
              <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="text-gray-400 text-sm mb-1">Mean Price Target</div>
                <div className="text-3xl font-bold text-white">
                  {analyst.targetMeanPrice ? `${data.currency === 'USD' ? '$' : data.currency + ' '}${analyst.targetMeanPrice.toLocaleString()}` : 'N/A'}
                </div>
              </div>
              <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="text-gray-400 text-sm mb-1">Number of Analysts</div>
                <div className="text-3xl font-bold text-white">{analyst.numberOfAnalystOpinions || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. News Tab */}
      {activeSubTab === 'news' && (
        <div className="bg-[#0A120E] border border-white/5 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-6">Recent Headlines</h3>
          <div className="space-y-4">
            {news.length > 0 ? (
              news.map((item, idx) => (
                <a 
                  key={idx} 
                  href={item.link} 
                  target="_blank" 
                  rel="noreferrer"
                  className="block p-5 bg-black/20 hover:bg-black/40 border border-white/5 hover:border-[#2D7A3E]/50 rounded-xl transition-all group"
                >
                  <h4 className="text-white font-medium text-base mb-2 group-hover:text-[#AEE7B1] transition-colors">{item.title}</h4>
                  <div className="flex items-center text-xs text-gray-500 gap-3">
                    <span className="bg-white/10 px-2 py-0.5 rounded text-gray-300">{item.publisher}</span>
                    <span>{item.date}</span>
                  </div>
                </a>
              ))
            ) : (
              <div className="text-gray-500 text-center py-10">No recent news available.</div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default FundamentalAnalysis;