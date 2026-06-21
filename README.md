# Dhanaṁ

**Your equity research rabbit hole.**

A full-stack automated equity research and valuation platform. Enter any publicly traded ticker and get an institutional-grade dossier — DCF valuation, risk profiling, technical analysis, peer benchmarking, and a 40-point quality score — entirely from free data sources.

🌐 **Live:** [dhanam-three.vercel.app](https://dhanam-three.vercel.app)

---

## What it does

| Feature | Description |
|---|---|
| **40-Point Playbook Score** | Composite quality score across 8 institutional pillars (DCF value, balance sheet safety, earnings stability, growth, quant value, technicals, behavioural, moat) |
| **3-Stage DCF Valuation** | Unlevered free cash flow model with CAPM WACC and 10,000-path Monte Carlo simulation |
| **Risk Engine** | Beta, Sharpe, Sortino, Treynor, Calmar, VaR, CVaR, max drawdown |
| **Technical Analysis** | Price vs SMA50/SMA200 trend, MACD, RSI, candlestick charts |
| **Peer Comparison** | EV/EBITDA · PEG regression matrix with z-scored cheapness ranking |
| **FX Normalization** | All monetary values converted to USD / EUR / INR / GBP in real time |
| **Dual-Mode UI** | Toggle between plain-English **Beginner** view and institutional **Pro** view |
| **Watchlist** | Save tickers with valuation snapshots (Firebase Auth + Firestore) |

---

## Tech Stack

**Backend** · Python / FastAPI / uvicorn · yfinance · NumPy · Firebase Admin SDK · slowapi  
**Frontend** · React 18 / Vite / Tailwind CSS · Plotly.js · Axios · Firebase JS SDK  
**Database / Auth** · Firebase Authentication (email + Google OAuth) · Firestore  
**Deployment** · Render (backend) · Vercel (frontend)

---
## Data Sources

All data is **100% free** — no paid API keys required.

- **Yahoo Finance** via `yfinance` — price history, financials, FX rates, macro data
- **FRED** — 10-year US Treasury yield (risk-free rate) via `^TNX`

---

## Disclaimer

⚠️ **Educational use only.** Dhanaṁ generates valuations using automated quantitative models for informational and educational purposes. This is not certified financial advice. Always conduct independent due diligence before making investment decisions.

