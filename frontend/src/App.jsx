import React, { useState } from 'react';
import { Search, TrendingUp, AlertTriangle, Activity, BarChart2, Shield, Layers, Users, Database, LogIn, LogOut, Star, Check, Bookmark, ArrowLeftRight } from 'lucide-react';
import { analyzeStock, addToWatchlist } from './api/client';
import { sym } from './components/common/ui';
import { useAuth } from './context/AuthContext';
import { useMode } from './context/ModeContext';

const CURRENCIES = ['USD', 'EUR', 'INR', 'GBP'];
import AuthModal from './components/auth/AuthModal';
import Watchlist from './components/dashboard/Watchlist';
import MetricCard from './components/common/MetricCard';
import VisualReport from './components/dashboard/VisualReport';
import ValuationModels from './components/dashboard/ValuationModels';
import RiskMetrics from './components/dashboard/RiskMetrics';
import TechnicalCharts from './components/dashboard/TechnicalCharts';
import FundamentalAnalysis from './components/dashboard/FundamentalAnalysis';
import PeerComparison from './components/dashboard/PeerComparison';

function App() {
  const [ticker, setTicker] = useState('');
  const [status, setStatus] = useState('idle');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [currency, setCurrency] = useState('USD');   // FX target for all monetary figures
  const [shakeBar, setShakeBar] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const { pro, setPro } = useMode();   // global Beginner/Pro display mode

  // ---- Auth + watchlist UI state ----
  const { user, loading: authLoading, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved

  const openAuth = (mode = 'login') => { setAuthMode(mode); setAuthOpen(true); };

  const handleAnalyze = async (searchTicker, ccyOverride) => {
    const targetTicker = searchTicker || ticker;
    if (!targetTicker.trim()) return;
    const ccy = ccyOverride || currency;
    const prevStatus = status;
    const prevData = data;
    setStatus('loading');
    setError(null);
    setSaveState('idle');
    setShowTip(false);
    try {
      const result = await analyzeStock(targetTicker.toUpperCase(), 'US', '', ccy);
      setData(result);
      setStatus('success');
    } catch {
      setShakeBar(true);
      setShowTip(true);
      setTimeout(() => setShakeBar(false), 600);
      // Restore previous view instead of showing an ugly error state
      if (prevStatus === 'idle' || !prevData) {
        setStatus('idle');
      } else {
        setData(prevData);
        setStatus(prevStatus);
      }
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAnalyze(ticker); };

  // Re-run analysis for a saved ticker selected from the watchlist drawer.
  const handleWatchlistSelect = (t) => { setTicker(t); handleAnalyze(t); };

  // Switch FX currency — re-run the current analysis in the new currency immediately.
  const changeCurrency = (c) => {
    if (c === currency) return;
    setCurrency(c);
    if (status === 'success' && data) handleAnalyze(data.ticker, c);
  };

  const CurrencySelector = () => (
    <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5" title="Display currency (FX-normalized)">
      {CURRENCIES.map((c) => (
        <button key={c} onClick={() => changeCurrency(c)}
          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
            currency === c ? 'bg-dhanam-primary text-white' : 'text-dhanam-text-mid hover:text-dhanam-text-hi'
          }`}>
          {c}
        </button>
      ))}
    </div>
  );

  // Beginner ⟷ Pro mode toggle — translates the advanced data for laymen.
  const ModeToggle = () => (
    <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5" title="Switch between plain-language and institutional views">
      {[['Beginner', false], ['Pro', true]].map(([label, val]) => (
        <button key={label} onClick={() => setPro(val)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
            pro === val ? 'bg-dhanam-accent text-[#0A120E]' : 'text-dhanam-text-mid hover:text-dhanam-text-hi'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );

  // Save the current analysis (ticker + frozen valuation snapshot) to Firestore.
  const handleSave = async () => {
    if (!user) { openAuth('login'); return; }
    if (!data) return;
    setSaveState('saving');
    try {
      const dcf = data.valuation?.dcf || {};
      const mc = data.valuation?.monte_carlo || {};
      const pct = mc.percentiles || {};
      await addToWatchlist({
        ticker: data.ticker,
        currency: data.currency,
        snapshot: {
          price: data.price ?? null,
          intrinsicValue: data.intrinsic_value ?? dcf.intrinsic_value_per_share ?? null,
          upsidePct: dcf.upside_pct ?? null,
          wacc: dcf.wacc ?? null,
          mc: pct.p50 != null ? { p5: pct.p5, p50: pct.p50, p95: pct.p95, probUpside: mc.prob_above_price } : null,
          asOf: new Date().toISOString(),
        },
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      setSaveState('idle');
    }
  };

  // Reusable auth + watchlist controls (used on landing and in the navbar).
  const AuthControls = () => (
    <div className="flex items-center gap-2">
      {user && (
        <button onClick={() => setWatchlistOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-dhanam-text-mid transition-colors hover:text-dhanam-text-hi">
          <Star className="h-4 w-4" /> <span className="hidden sm:inline">Watchlist</span>
        </button>
      )}
      {authLoading ? (
        <div className="h-8 w-8 rounded-full bg-white/5" />
      ) : user ? (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-dhanam-primary/30 text-sm font-semibold text-dhanam-accent" title={user.email || ''}>
            {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
          </div>
          <button onClick={logout} title="Sign out"
            className="rounded-lg p-2 text-dhanam-text-mid transition-colors hover:bg-white/5 hover:text-dhanam-text-hi">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button onClick={() => openAuth('login')}
          className="flex items-center gap-2 rounded-lg bg-dhanam-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1B4D2B]">
          <LogIn className="h-4 w-4" /> Sign In
        </button>
      )}
    </div>
  );

  // ---- VIEW 1: LANDING ----
  let view;
  if (status === 'idle') {
    view = (
      <div className="min-h-screen bg-[#050B08] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-4 right-4 z-20 flex flex-wrap items-center justify-end gap-2"><ModeToggle /><CurrencySelector /><AuthControls /></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] md:w-[800px] h-[600px] md:h-[800px] bg-green-900/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="z-10 w-full max-w-2xl text-center flex flex-col items-center px-4">
          <h1 className="font-serif text-5xl md:text-8xl font-semibold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 tracking-tight mb-4">
            Dhanaṁ
          </h1>
          <p className="text-gray-400 text-base md:text-xl mb-8 md:mb-12 max-w-lg font-light">
            Your equity research rabbit hole
          </p>

          <div className="relative w-full max-w-xl group">
            <div className="absolute inset-0 bg-gradient-to-r from-[#2D7A3E] to-[#1B4D2B] rounded-2xl blur-lg opacity-30 group-hover:opacity-50 transition duration-500"></div>
            <div className={`relative flex flex-col md:flex-row items-center bg-[#0A120E] rounded-2xl p-2 shadow-2xl transition-colors border ${shakeBar ? 'animate-shake border-red-500/60' : 'border-white/10 focus-within:border-[#2D7A3E]/50'}`}>
              <div className="flex items-center w-full">
                <Search className="w-5 h-5 text-gray-500 ml-3 md:ml-4" />
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent border-none px-3 md:px-4 py-3 md:py-4 text-white text-lg md:text-xl focus:outline-none focus:ring-0 uppercase placeholder:normal-case font-medium tracking-wide"
                  placeholder="Enter ticker (e.g., AAPL)..."
                  autoFocus
                />
              </div>
              <button
                onClick={() => handleAnalyze(ticker)}
                className="w-full md:w-auto mt-2 md:mt-0 bg-[#1B4D2B] hover:bg-[#2D7A3E] text-white px-8 py-3 md:py-4 rounded-xl font-semibold transition-colors duration-300"
              >
                Analyze
              </button>
            </div>
            {showTip && (
              <p className="mt-3 text-center text-xs text-dhanam-text-lo animate-in fade-in duration-300">
                <span className="font-medium text-dhanam-warn">Tip:</span>{' '}
                For international stocks, add the exchange suffix — e.g.,{' '}
                <span className="font-mono text-dhanam-text-mid">RELIANCE.NS</span>,{' '}
                <span className="font-mono text-dhanam-text-mid">TSCO.L</span>,{' '}
                <span className="font-mono text-dhanam-text-mid">SAP.DE</span>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  } else if (status === 'loading') {
    // ---- VIEW 2: LOADING ----
    view = (
      <div className="min-h-screen bg-[#050B08] text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-[#1B4D2B] border-t-[#AEE7B1] rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-200 text-center">Processing Models...</h2>
        <p className="text-gray-500 mt-2 text-center text-sm md:text-base">Fetching fundamental data and executing quant algorithms.</p>
      </div>
    );
  } else {
    // ---- VIEW 3: DASHBOARD (success / error) ----
    view = (
      <div className="min-h-screen bg-[#050B08] text-white font-sans selection:bg-[#2D7A3E]/30 w-full overflow-x-hidden">
        <nav className="sticky top-0 z-50 bg-[#0A120E]/90 backdrop-blur-xl border-b border-white/5 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setStatus('idle'); setTicker(''); setData(null); }}>
            <h1 className="font-serif text-xl md:text-2xl font-semibold text-white tracking-tight">Dhanaṁ</h1>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-3 top-2.5 md:top-3 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`w-full bg-white/5 rounded-lg pl-9 md:pl-10 pr-4 py-2 text-sm text-white focus:outline-none transition-colors uppercase placeholder:normal-case border ${shakeBar ? 'animate-shake border-red-500/60' : 'border-white/10 focus:border-[#2D7A3E]'}`}
                placeholder="Search another ticker..."
              />
              {showTip && (
                <p className="absolute top-full left-0 z-50 mt-1.5 whitespace-nowrap text-[11px] text-dhanam-text-lo animate-in fade-in duration-300">
                  <span className="font-medium text-dhanam-warn">Tip:</span>{' '}
                  Try{' '}
                  <span className="font-mono">RELIANCE.NS</span>,{' '}
                  <span className="font-mono">TSCO.L</span>,{' '}
                  <span className="font-mono">SAP.DE</span>{' '}
                  for international stocks.
                </p>
              )}
            </div>
            <ModeToggle />
            <CurrencySelector />
            <AuthControls />
          </div>
        </nav>

        <main className="w-full mx-auto px-4 md:px-12 py-6 md:py-8">

          {status === 'success' && data && (
            <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Header Identity */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 mb-8 md:mb-10">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2 py-1 bg-white/10 text-white rounded font-mono text-xs md:text-sm tracking-widest">{data.ticker}</span>
                    <span className="text-gray-500 text-xs md:text-sm truncate max-w-[200px] md:max-w-none">{data.sector}</span>
                  </div>
                  <h2 className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300 tracking-tight leading-tight">
                    {data.company_name}
                  </h2>
                </div>
                <div className="flex items-end gap-4">
                  <div className="md:text-right">
                    <div className="text-xs md:text-sm text-gray-400 mb-1">Current Price</div>
                    <div className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                      {sym(data.currency)}{data.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    {data.fx?.converted && (
                      <div className="mt-1 flex items-center justify-start gap-1 text-[11px] text-dhanam-text-lo md:justify-end" title="Live FX normalization">
                        <ArrowLeftRight className="h-3 w-3" />
                        FX {data.fx.base_currency}→{data.fx.display_currency} @ {Number(data.fx.rate).toFixed(4)}
                      </div>
                    )}
                    {data.fx?.note && (
                      <div className="mt-1 text-[11px] text-dhanam-warn md:text-right" title={data.fx.note}>
                        Shown in {data.fx.display_currency} (live FX unavailable)
                      </div>
                    )}
                  </div>
                  {/* Save to Watchlist */}
                  <button
                    onClick={handleSave}
                    disabled={saveState === 'saving'}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      saveState === 'saved'
                        ? 'border-emerald-600/40 bg-emerald-900/20 text-dhanam-accent'
                        : 'border-white/10 bg-white/5 text-dhanam-text-mid hover:text-dhanam-text-hi'
                    }`}
                  >
                    {saveState === 'saved'
                      ? <><Check className="h-4 w-4" /> Saved</>
                      : <><Bookmark className="h-4 w-4" /> {user ? 'Save' : 'Save'}</>}
                  </button>
                </div>
              </div>

              {/* Core Snapshot Bento Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 md:mb-10 w-full">
                <MetricCard title="Market Cap" value={`${sym(data.currency)}${(data.market_cap / 1e9).toFixed(2)}B`} icon={<BarChart2 className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />} />
                <MetricCard title="Playbook Score" value={`${data.playbook?.total ?? '—'}/40`} highlight icon={<Shield className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />} />
                <MetricCard title="Grade" value={data.playbook?.grade ?? '—'} highlight icon={<TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />} />
                <MetricCard title="P/E Ratio" value={data.scores?.details?.pe ? data.scores.details.pe.toFixed(2) : 'N/A'} icon={<Activity className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />} />
              </div>

              {/* Tabs */}
              <div className="border-b border-white/10 mb-6 md:mb-8 w-full overflow-hidden">
                <nav className="flex space-x-6 md:space-x-8 overflow-x-auto pb-px hide-scrollbar w-full">
                  {[
                    { id: 'overview', label: 'Visual Report', icon: <Layers className="w-4 h-4" /> },
                    { id: 'dcf', label: 'Valuation Models', icon: <TrendingUp className="w-4 h-4" /> },
                    { id: 'risk', label: 'Risk Metrics', icon: <Shield className="w-4 h-4" /> },
                    { id: 'technicals', label: 'Technicals', icon: <Activity className="w-4 h-4" /> },
                    { id: 'fundamentals', label: 'Deep Dive Analysis', icon: <Database className="w-4 h-4" /> },
                    { id: 'peers', label: 'Peer Comp', icon: <Users className="w-4 h-4" /> },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm whitespace-nowrap transition-colors ${
                        activeTab === tab.id ? 'border-[#2D7A3E] text-[#AEE7B1]' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
                      }`}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Content */}
              <div className="w-full">
                {activeTab === 'overview' && <VisualReport data={data} />}
                {activeTab === 'dcf' && <ValuationModels data={data} />}
                {activeTab === 'risk' && <RiskMetrics data={data} />}
                {activeTab === 'technicals' && <TechnicalCharts data={data} />}
                {activeTab === 'fundamentals' && <FundamentalAnalysis data={data} />}
                {activeTab === 'peers' && <PeerComparison data={data} />}
              </div>
            </div>
          )}
        </main>

        {/* Disclaimer footer */}
        <footer className="w-full border-t border-white/[0.06] bg-black/30 py-3 px-4 text-center text-[11px] text-dhanam-text-lo">
          ⚠️ <span className="font-semibold text-yellow-500/80">EDUCATIONAL USE ONLY</span>
          {' — '}This tool is a valuation simulation and does not constitute financial advice.
        </footer>
      </div>
    );
  }

  // Single shell: view content + global overlays (rendered in every state).
  return (
    <>
      {view}
      <AuthModal open={authOpen} initial={authMode} onClose={() => setAuthOpen(false)} />
      <Watchlist open={watchlistOpen} onClose={() => setWatchlistOpen(false)} onSelect={handleWatchlistSelect} />
    </>
  );
}

export default App;
