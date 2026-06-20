import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import { Users, Search, Activity, AlertTriangle, TrendingUp } from 'lucide-react';
import { comparePeers } from '../../api/client';
import { Panel, DataTable, Badge, fmtMoney, fmtBig, fmtPct, fmtNum, fmtX, plotlyDark, plotlyConfig } from '../common/ui';

/* ===========================================================================
   PeerComparison — regression-scored relative-value benchmarking.
   Renders the backend /compare matrix including EV multiples and the
   regression-based cheapness score (z-scored residual of EV/EBITDA vs. the
   peer set's growth & ROE — higher = cheaper for its quality).
   =========================================================================== */
const PeerComparison = ({ data }) => {
  const [peerInput, setPeerInput] = useState('');
  const [peers, setPeers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!peerInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Keep the peer matrix in the same currency as the main analysis view.
      const res = await comparePeers(data.ticker, peerInput, data.currency || 'USD');
      setPeers(res.peers);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch peer data.');
    } finally {
      setLoading(false);
    }
  };

  const base = (data.ticker || '').toUpperCase();
  const isBase = (t) => (t || '').toUpperCase() === base;
  const hasScores = peers?.some((p) => p.cheapness_score != null);

  const tone = (v, good, bad) => (v == null ? '' : v >= good ? 'val-pos' : v < bad ? 'val-neg' : '');

  const columns = [
    {
      key: 'ticker', label: 'Company', align: 'left', mono: false,
      sortValue: (r) => r.ticker,
      render: (r) => (
        <div>
          <div className={`font-mono font-bold ${isBase(r.ticker) ? 'text-dhanam-accent' : 'text-dhanam-text-hi'}`}>{r.ticker}</div>
          <div className="max-w-[160px] truncate text-xs text-dhanam-text-lo">{r.company_name}</div>
        </div>
      ),
    },
    { key: 'price', label: 'Price', align: 'right', sortValue: (r) => r.price, render: (r) => fmtMoney(r.price, r.currency) },
    { key: 'market_cap', label: 'Mkt Cap', align: 'right', sortValue: (r) => r.market_cap, render: (r) => fmtBig(r.market_cap, r.currency) },
    { key: 'ev_ebitda_ltm', label: 'EV/EBITDA', align: 'right', sortValue: (r) => r.ev_ebitda_ltm, render: (r) => fmtX(r.ev_ebitda_ltm) },
    { key: 'ev_revenue_ltm', label: 'EV/Rev', align: 'right', sortValue: (r) => r.ev_revenue_ltm, render: (r) => fmtX(r.ev_revenue_ltm) },
    { key: 'pe_ratio', label: 'P/E', align: 'right', sortValue: (r) => r.pe_ratio, render: (r) => fmtNum(r.pe_ratio) },
    { key: 'forward_pe', label: 'Fwd P/E', align: 'right', sortValue: (r) => r.forward_pe, render: (r) => fmtNum(r.forward_pe) },
    { key: 'roe', label: 'ROE', align: 'right', sortValue: (r) => r.roe, render: (r) => <span className={tone(r.roe, 0.15, 0)}>{fmtPct(r.roe)}</span> },
    { key: 'rev_growth', label: 'Rev Growth', align: 'right', sortValue: (r) => r.rev_growth, render: (r) => <span className={tone(r.rev_growth, 0.1, 0)}>{fmtPct(r.rev_growth)}</span> },
    {
      key: 'cheapness_score', label: 'Cheapness', align: 'right', sortValue: (r) => r.cheapness_score ?? -99,
      render: (r) =>
        r.cheapness_score == null ? (
          <span className="text-dhanam-text-lo">—</span>
        ) : (
          <span className={`font-semibold ${r.cheapness_score > 0.3 ? 'val-pos' : r.cheapness_score < -0.3 ? 'val-neg' : 'val-mid'}`}>
            {r.cheapness_score > 0 ? '+' : ''}{fmtNum(r.cheapness_score, 2)}σ
          </span>
        ),
    },
  ];

  // Relative-cheapness bar chart (sorted) — quick read on who is statistically cheap.
  const scored = (peers || []).filter((p) => p.cheapness_score != null).sort((a, b) => a.cheapness_score - b.cheapness_score);

  return (
    <div className="flex w-full flex-col gap-6 animate-in fade-in duration-500">
      {/* Input */}
      <Panel glow="rgba(45,122,62,0.16)">
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-900/20">
            <Users className="h-7 w-7 text-dhanam-accent" />
          </div>
          <h3 className="mb-2 text-2xl font-bold tracking-tight text-dhanam-text-hi">Peer Benchmarking</h3>
          <p className="mb-6 max-w-xl text-sm text-dhanam-text-mid">
            Compare <span className="font-mono text-dhanam-accent">{data.ticker}</span> against direct competitors. Enter up to 5 tickers, comma-separated — the engine regresses EV/EBITDA on growth &amp; ROE to flag statistically cheap names.
          </p>
          <div className="flex w-full max-w-2xl flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-dhanam-text-lo" />
              <input
                type="text" value={peerInput}
                onChange={(e) => setPeerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && run()}
                className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-12 pr-4 font-medium uppercase tracking-wide text-dhanam-text-hi transition-colors placeholder:normal-case focus:border-dhanam-primary focus:outline-none"
                placeholder="e.g., MSFT, GOOGL, META"
              />
            </div>
            <button
              onClick={run} disabled={loading || !peerInput.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-dhanam-primary px-8 py-3 font-semibold text-white transition-colors hover:bg-[#1B4D2B] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Activity className="h-5 w-5 animate-spin" /> : 'Compare'}
            </button>
          </div>
          {error && (
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-rose-900/30 bg-rose-900/10 px-4 py-2 text-sm text-dhanam-neg">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}
        </div>
      </Panel>

      {/* Results */}
      {peers && peers.length > 0 && (
        <>
          <Panel
            title="Relative-Value Matrix"
            subtitle="Click any column to sort · base ticker highlighted"
            right={hasScores && <Badge tone="accent"><TrendingUp className="h-3 w-3" /> Regression-scored</Badge>}
          >
            <DataTable
              columns={columns}
              rows={peers.map((p) => ({ ...p, _base: isBase(p.ticker) }))}
              highlightKey="_base"
              initialSort={hasScores ? { key: 'cheapness_score', dir: 'desc' } : { key: 'market_cap', dir: 'desc' }}
              maxHeight="460px"
            />
            {hasScores && (
              <p className="mt-3 text-xs text-dhanam-text-lo">
                <b className="text-dhanam-pos">Cheapness</b> is the z-scored residual of EV/EBITDA regressed on revenue growth &amp; ROE across this set. <b className="text-dhanam-pos">+σ</b> = trading below its quality-implied multiple (cheap); <b className="text-dhanam-neg">−σ</b> = rich.
              </p>
            )}
          </Panel>

          {scored.length >= 2 && (
            <Panel title="Cheapness Ranking" subtitle="Standardized residual vs. peer-implied valuation (higher = cheaper)">
              <div className="h-[300px] w-full">
                <Plot
                  data={[{
                    type: 'bar', orientation: 'h',
                    x: scored.map((p) => p.cheapness_score),
                    y: scored.map((p) => p.ticker),
                    marker: { color: scored.map((p) => (isBase(p.ticker) ? '#AEE7B1' : p.cheapness_score >= 0 ? '#36C46F' : '#F0616D')) },
                    text: scored.map((p) => `${p.cheapness_score > 0 ? '+' : ''}${p.cheapness_score.toFixed(2)}σ`),
                    textposition: 'outside', textfont: { family: 'Roboto Mono', color: '#E6F0EA' },
                    hoverinfo: 'y+x',
                  }]}
                  layout={plotlyDark({
                    height: 300, margin: { t: 10, b: 30, l: 60, r: 30 },
                    xaxis: { zeroline: true, zerolinecolor: 'rgba(255,255,255,0.2)', gridcolor: 'rgba(255,255,255,0.05)', tickfont: { color: '#9AA7A0' } },
                    yaxis: { tickfont: { family: 'Roboto Mono', color: '#E6F0EA' }, automargin: true },
                  })}
                  useResizeHandler style={{ width: '100%', height: '100%' }} config={plotlyConfig}
                />
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
};

export default PeerComparison;
