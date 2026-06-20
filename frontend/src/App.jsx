import React, { useState } from 'react';
import { Search, TrendingUp, AlertTriangle, Activity, BarChart2, Shield, Layers, Users } from 'lucide-react';
import { analyzeStock } from './api/client';
import MetricCard from './components/common/MetricCard';
import VisualReport from './components/dashboard/VisualReport'; // <-- Import the new component
import ValuationModels from './components/dashboard/ValuationModels';
import RiskMetrics from './components/dashboard/RiskMetrics';
import TechnicalCharts from './components/dashboard/TechnicalCharts';
import FundamentalAnalysis from './components/dashboard/FundamentalAnalysis';
import PeerComparison from './components/dashboard/PeerComparison'; // fixes ReferenceError on the Peer Comp tab
import { Database } from 'lucide-react'; // Import a relevant icon
function App() {
  const [ticker, setTicker] = useState('');
  const [status, setStatus] = useState('idle');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const handleAnalyze = async (searchTicker) => {
    const targetTicker = searchTicker || ticker;
    if (!targetTicker.trim()) return;
    
    setStatus('loading');
    setError(null);
    try {
      const result = await analyzeStock(targetTicker.toUpperCase());
      setData(result);
      setStatus('success');
    } catch (err) {
      setError(err.response?.data?.detail || 'An error occurred fetching data from the backend.');
      setStatus('error');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAnalyze(ticker);
  };

  // --- VIEW 1: LANDING PAGE ---
  if (status === 'idle') {
    return (
      <div className="min-h-screen bg-[#050B08] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] md:w-[800px] h-[600px] md:h-[800px] bg-green-900/10 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="z-10 w-full max-w-2xl text-center flex flex-col items-center px-4">
          <div className="bg-gradient-to-br from-[#1B4D2B] to-[#0A2612] w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-3xl md:text-4xl shadow-2xl shadow-[#1B4D2B]/30 mb-6 border border-white/5">
            💹
          </div>
          <h1 className="text-4xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 tracking-tight mb-4">
            Dhanaṁ
          </h1>
          <p className="text-gray-400 text-base md:text-xl mb-8 md:mb-12 max-w-lg font-light">
            Automated institutional equity research and valuation engine.
          </p>

          <div className="relative w-full max-w-xl group">
            <div className="absolute inset-0 bg-gradient-to-r from-[#2D7A3E] to-[#1B4D2B] rounded-2xl blur-lg opacity-30 group-hover:opacity-50 transition duration-500"></div>
            <div className="relative flex flex-col md:flex-row items-center bg-[#0A120E] border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-[#2D7A3E]/50 transition-colors">
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
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: LOADING OR ERROR ---
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#050B08] text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-[#1B4D2B] border-t-[#AEE7B1] rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-200 text-center">Processing Models...</h2>
        <p className="text-gray-500 mt-2 text-center text-sm md:text-base">Fetching fundamental data and executing quant algorithms.</p>
      </div>
    );
  }

  // --- VIEW 3: THE DASHBOARD ---
  return (
    <div className="min-h-screen bg-[#050B08] text-white font-sans selection:bg-[#2D7A3E]/30 w-full overflow-x-hidden">
      
      {/* Sticky Top Navigation */}
      <nav className="sticky top-0 z-50 bg-[#0A120E]/90 backdrop-blur-xl border-b border-white/5 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => { setStatus('idle'); setTicker(''); setData(null); }}
        >
          <div className="bg-gradient-to-br from-[#1B4D2B] to-[#0A2612] w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center text-lg md:text-xl shadow-lg border border-white/5 group-hover:scale-105 transition-transform">
            💹
          </div>
          <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">Dhanaṁ</h1>
        </div>

        <div className="flex items-center w-full md:max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 md:top-3 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 md:pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#2D7A3E] transition-colors uppercase placeholder:normal-case"
              placeholder="Search another ticker..."
            />
          </div>
        </div>
      </nav>

      <main className="w-full mx-auto px-4 md:px-12 py-6 md:py-8">
        {status === 'error' && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-200 mb-8 flex items-center gap-3">
            <AlertTriangle className="text-red-500 w-6 h-6 shrink-0" />
            <p className="text-sm md:text-base">{error}</p>
            <button onClick={() => setStatus('idle')} className="ml-auto underline text-sm hover:text-white shrink-0">Return</button>
          </div>
        )}

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
              <div className="md:text-right">
                <div className="text-xs md:text-sm text-gray-400 mb-1">Current Price</div>
                <div className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                  {data.currency === 'USD' ? '$' : data.currency + ' '}{data.price?.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </div>
              </div>
            </div>

            {/* Core Snapshot Bento Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 md:mb-10 w-full">
              <MetricCard 
                title="Market Cap" 
                value={`${data.currency === 'USD' ? '$' : ''}${(data.market_cap / 1e9).toFixed(2)}B`} 
                icon={<BarChart2 className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />}
              />
              <MetricCard 
                title="Value Score" 
                value={`${data.scores.undervalued_score}/40`} 
                highlight={true}
                icon={<Shield className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />}
              />
              <MetricCard 
                title="Growth Score" 
                value={`${data.scores.multibagger_score}/50`} 
                highlight={true}
                icon={<TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />}
              />
               <MetricCard 
                title="P/E Ratio" 
                value={data.scores.details?.pe ? data.scores.details.pe.toFixed(2) : 'N/A'} 
                icon={<Activity className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />}
              />
            </div>

            {/* Interactive Tab System (Scrollable on mobile) */}
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
                      activeTab === tab.id
                        ? 'border-[#2D7A3E] text-[#AEE7B1]'
                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content Rendering Area */}
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
    </div>
  );
}

export default App;