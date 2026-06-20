import React, { useState, useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Activity } from 'lucide-react';
import { EmptyState, plotlyConfig } from '../common/ui';

/* ===========================================================================
   Technical indicator math (Wilder-smoothed RSI, MACD, SMA, EMA, Bollinger).
   Pure functions over a close-price array; null-padded to align with dates.
   =========================================================================== */
const calculateSMA = (d, w) => {
  const r = new Array(d.length).fill(null);
  for (let i = w - 1; i < d.length; i++) {
    let s = 0;
    for (let j = i - w + 1; j <= i; j++) s += d[j];
    r[i] = s / w;
  }
  return r;
};

const calculateBollinger = (d, w = 20, k = 2) => {
  const sma = calculateSMA(d, w);
  const upper = new Array(d.length).fill(null);
  const lower = new Array(d.length).fill(null);
  for (let i = w - 1; i < d.length; i++) {
    const mean = sma[i];
    let v = 0;
    for (let j = i - w + 1; j <= i; j++) v += (d[j] - mean) ** 2;
    const sd = Math.sqrt(v / w);
    upper[i] = mean + k * sd;
    lower[i] = mean - k * sd;
  }
  return { upper, lower, sma };
};

const calculateRSI = (d, w = 14) => {
  const r = new Array(d.length).fill(null);
  if (d.length <= w) return r;
  let gains = 0, losses = 0;
  for (let i = 1; i <= w; i++) {
    const diff = d[i] - d[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / w, avgLoss = losses / w;
  r[w] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
  for (let i = w + 1; i < d.length; i++) {
    const diff = d[i] - d[i - 1];
    avgGain = (avgGain * (w - 1) + (diff > 0 ? diff : 0)) / w;
    avgLoss = (avgLoss * (w - 1) + (diff < 0 ? -diff : 0)) / w;
    r[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
  }
  return r;
};

const calculateEMA = (d, w) => {
  const k = 2 / (w + 1);
  const e = new Array(d.length).fill(null);
  if (d.length < w) return e;
  let seed = 0;
  for (let i = 0; i < w; i++) seed += d[i];
  e[w - 1] = seed / w;
  for (let i = w; i < d.length; i++) e[i] = d[i] * k + e[i - 1] * (1 - k);
  return e;
};

const calculateMACD = (d, fast = 12, slow = 26, signal = 9) => {
  const ef = calculateEMA(d, fast), es = calculateEMA(d, slow);
  const macdLine = d.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const valid = macdLine.filter((x) => x != null);
  const sigEma = calculateEMA(valid, signal);
  const signalLine = new Array(d.length).fill(null);
  const histogram = new Array(d.length).fill(null);
  const offset = d.length - valid.length;
  for (let i = 0; i < valid.length; i++) {
    signalLine[i + offset] = sigEma[i];
    if (macdLine[i + offset] != null && signalLine[i + offset] != null)
      histogram[i + offset] = macdLine[i + offset] - signalLine[i + offset];
  }
  return { macdLine, signalLine, histogram };
};

/* ===========================================================================
   TechnicalCharts — TradingView-style synchronized multi-pane terminal.
   One shared x-axis drives three stacked panes (Price · MACD · RSI) so a single
   crosshair spike spans the full height and hover is unified across indicators.
   =========================================================================== */
const TechnicalCharts = ({ data }) => {
  const [period, setPeriod] = useState('1y');
  const [overlays, setOverlays] = useState(['SMA 50']);
  const [showVolume, setShowVolume] = useState(true);

  const chart = useMemo(() => {
    if (!data?.history?.length) return null;
    const cutoff = new Date();
    const map = { '6m': () => cutoff.setMonth(cutoff.getMonth() - 6), '1y': () => cutoff.setFullYear(cutoff.getFullYear() - 1), '2y': () => cutoff.setFullYear(cutoff.getFullYear() - 2), '5y': () => cutoff.setFullYear(cutoff.getFullYear() - 5) };
    (map[period] || map['1y'])();

    const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

    // Plotly candlesticks render BLANK if any OHLC element is null/undefined/NaN,
    // or if a derived axis range goes NaN. So: keep only rows with a finite close
    // and a parseable date, then coerce every field to a finite number. Dates are
    // normalized to strict YYYY-MM-DD strings (categorical-safe for candlesticks).
    const clean = data.history
      .filter((it) => it && it.date && new Date(it.date) >= cutoff && num(it.close) !== null)
      .map((d) => {
        const close = num(d.close);
        const open = num(d.open) ?? close;
        const high = num(d.high) ?? Math.max(open, close);
        const low = num(d.low) ?? Math.min(open, close);
        const volume = num(d.volume) ?? 0;
        return { date: String(d.date).slice(0, 10), open, high, low, close, volume };
      });
    if (clean.length < 2) return null;

    return {
      dates: clean.map((d) => d.date),
      opens: clean.map((d) => d.open),
      highs: clean.map((d) => d.high),
      lows: clean.map((d) => d.low),
      closes: clean.map((d) => d.close),
      volumes: clean.map((d) => d.volume),
    };
  }, [data.history, period]);

  if (!chart) {
    return (
      <EmptyState
        icon={<Activity className="h-12 w-12 text-dhanam-text-lo" />}
        title="Technical Data Unavailable"
        message="OHLCV price history is required to render the synchronized technical panes."
      />
    );
  }

  const { dates, opens, highs, lows, closes, volumes } = chart;
  const up = '#36C46F', down = '#F0616D';
  const traces = [];

  // ---- Pane 1: Price (candles + overlays) on yaxis 'y' ----
  traces.push({
    type: 'candlestick', x: dates, open: opens, high: highs, low: lows, close: closes,
    increasing: { line: { color: up }, fillcolor: up }, decreasing: { line: { color: down }, fillcolor: down },
    name: 'Price', xaxis: 'x', yaxis: 'y',
  });
  if (overlays.includes('SMA 50'))
    traces.push({ x: dates, y: calculateSMA(closes, 50), type: 'scatter', mode: 'lines', line: { color: '#F5A623', width: 1.4 }, name: 'SMA 50', yaxis: 'y' });
  if (overlays.includes('SMA 200'))
    traces.push({ x: dates, y: calculateSMA(closes, 200), type: 'scatter', mode: 'lines', line: { color: '#4F9FFF', width: 1.4 }, name: 'SMA 200', yaxis: 'y' });
  if (overlays.includes('Bollinger')) {
    const bb = calculateBollinger(closes);
    traces.push({ x: dates, y: bb.upper, type: 'scatter', mode: 'lines', line: { color: 'rgba(174,231,177,0.4)', width: 1, dash: 'dot' }, name: 'BB Upper', yaxis: 'y', showlegend: false });
    traces.push({ x: dates, y: bb.lower, type: 'scatter', mode: 'lines', fill: 'tonexty', fillcolor: 'rgba(45,122,62,0.07)', line: { color: 'rgba(174,231,177,0.4)', width: 1, dash: 'dot' }, name: 'Bollinger', yaxis: 'y' });
  }
  // Volume as a faint overlay pinned to the bottom of the price pane (yvol overlays y).
  if (showVolume) {
    traces.push({
      x: dates, y: volumes, type: 'bar', name: 'Volume', yaxis: 'yvol',
      marker: { color: closes.map((c, i) => (c >= opens[i] ? 'rgba(54,196,111,0.25)' : 'rgba(240,97,109,0.25)')) },
      hoverinfo: 'skip', showlegend: false,
    });
  }

  // ---- Pane 2: MACD on yaxis 'y2' ----
  const macd = calculateMACD(closes);
  traces.push({ x: dates, y: macd.histogram, type: 'bar', name: 'Hist', yaxis: 'y2', opacity: 0.55, marker: { color: macd.histogram.map((v) => (v >= 0 ? up : down)) } });
  traces.push({ x: dates, y: macd.macdLine, type: 'scatter', mode: 'lines', line: { color: '#4F9FFF', width: 1.3 }, name: 'MACD', yaxis: 'y2' });
  traces.push({ x: dates, y: macd.signalLine, type: 'scatter', mode: 'lines', line: { color: '#F5A623', width: 1.3 }, name: 'Signal', yaxis: 'y2' });

  // ---- Pane 3: RSI on yaxis 'y3' ----
  traces.push({ x: dates, y: calculateRSI(closes), type: 'scatter', mode: 'lines', line: { color: '#CE93D8', width: 1.6 }, name: 'RSI', yaxis: 'y3' });

  const maxVol = Math.max(...volumes, 1) || 1; // guard: never let the volume axis range go NaN
  const spike = { showspikes: true, spikemode: 'across', spikesnap: 'cursor', spikecolor: 'rgba(174,231,177,0.5)', spikethickness: 1, spikedash: 'solid' };
  const axisBase = { gridcolor: 'rgba(255,255,255,0.05)', zerolinecolor: 'rgba(255,255,255,0.08)', tickfont: { color: '#9AA7A0', size: 11 } };

  const layout = {
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, sans-serif', color: '#9AA7A0' },
    margin: { t: 24, b: 28, l: 56, r: 56 },
    showlegend: true,
    legend: { orientation: 'h', y: 1.04, x: 0, font: { color: '#E6F0EA', size: 11 }, bgcolor: 'rgba(0,0,0,0)' },
    dragmode: 'zoom',
    hovermode: 'x unified',
    hoverlabel: { bgcolor: '#0E1813', bordercolor: '#2D7A3E', font: { family: 'Roboto Mono', color: '#E6F0EA', size: 11 } },
    // Single shared x-axis → one crosshair spans all three panes (synchronized).
    xaxis: { ...axisBase, ...spike, domain: [0, 1], rangeslider: { visible: false }, anchor: 'y3' },
    // Pane domains: Price 50-100%, MACD 27-45%, RSI 0-20%.
    yaxis: { ...axisBase, ...spike, domain: [0.50, 1.0], tickprefix: data.currency === 'USD' ? '$' : '', title: { text: 'Price', font: { color: '#5F6C66', size: 10 } } },
    yvol: { overlaying: 'y', range: [0, maxVol * 4.5], showgrid: false, showticklabels: false, zeroline: false, fixedrange: true },
    yaxis2: { ...axisBase, domain: [0.27, 0.45], title: { text: 'MACD', font: { color: '#5F6C66', size: 10 } } },
    yaxis3: { ...axisBase, domain: [0.0, 0.20], range: [0, 100], title: { text: 'RSI', font: { color: '#5F6C66', size: 10 } }, tickvals: [30, 50, 70] },
    shapes: [
      { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y3', y0: 70, y1: 70, line: { color: 'rgba(240,97,109,0.5)', width: 1, dash: 'dash' } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y3', y0: 30, y1: 30, line: { color: 'rgba(54,196,111,0.5)', width: 1, dash: 'dash' } },
      { type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y3', y0: 30, y1: 70, fillcolor: 'rgba(255,255,255,0.015)', line: { width: 0 } },
      { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y2', y0: 0, y1: 0, line: { color: 'rgba(255,255,255,0.12)', width: 1 } },
    ],
  };

  const Btn = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-dhanam-primary text-white' : 'text-dhanam-text-mid hover:text-dhanam-text-hi'}`}>{children}</button>
  );

  return (
    <div className="flex w-full flex-col gap-6 animate-in fade-in duration-500">
      {/* Controls */}
      <div className="bento flex flex-col items-start justify-between gap-4 p-4 md:flex-row md:items-center md:p-5">
        <div className="flex items-center gap-1">
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-widest text-dhanam-text-lo">Period</span>
          {['6m', '1y', '2y', '5y'].map((p) => (
            <Btn key={p} active={period === p} onClick={() => setPeriod(p)}>{p.toUpperCase()}</Btn>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-2 hidden text-[11px] font-semibold uppercase tracking-widest text-dhanam-text-lo md:block">Overlays</span>
          <div className="flex rounded-lg bg-white/5 p-1">
            {['SMA 50', 'SMA 200', 'Bollinger'].map((o) => (
              <Btn key={o} active={overlays.includes(o)} onClick={() => setOverlays((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))}>{o}</Btn>
            ))}
            <Btn active={showVolume} onClick={() => setShowVolume((v) => !v)}>Volume</Btn>
          </div>
        </div>
      </div>

      {/* Synchronized terminal */}
      <div className="bento h-[640px] w-full p-3 md:p-4">
        <Plot data={traces} layout={layout} useResizeHandler style={{ width: '100%', height: '100%' }} config={plotlyConfig} />
      </div>
      <p className="-mt-2 px-1 text-xs text-dhanam-text-lo">
        Drag to zoom · double-click to reset · unified crosshair synchronizes Price, MACD & RSI across the shared time axis.
      </p>
    </div>
  );
};

export default TechnicalCharts;
