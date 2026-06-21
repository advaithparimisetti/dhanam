# Dhanaṁ — Complete Technical Documentation

> Your equity research rabbit hole.  
> Live: https://dhanam-three.vercel.app  
> Backend API: https://dhanam.onrender.com/api/v1

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [Backend](#5-backend)
   - 5.1 [Application Entry Point — main.py](#51-application-entry-point--mainpy)
   - 5.2 [API Routes](#52-api-routes)
   - 5.3 [Authentication & Security](#53-authentication--security)
   - 5.4 [Rate Limiting](#54-rate-limiting)
   - 5.5 [Data Pipeline — data_client.py](#55-data-pipeline--data_clientpy)
   - 5.6 [Valuation Engine — valuation.py](#56-valuation-engine--valuationpy)
   - 5.7 [Risk Engine — risk.py](#57-risk-engine--riskpy)
   - 5.8 [FX Normalization Engine](#58-fx-normalization-engine)
   - 5.9 [40-Point Playbook Engine](#59-40-point-playbook-engine)
   - 5.10 [Watchlist Service](#510-watchlist-service)
   - 5.11 [Firebase Client](#511-firebase-client)
6. [Frontend](#6-frontend)
   - 6.1 [App Shell — App.jsx](#61-app-shell--appjsx)
   - 6.2 [Authentication System](#62-authentication-system)
   - 6.3 [Beginner / Pro Mode System](#63-beginner--pro-mode-system)
   - 6.4 [Multi-Currency FX System](#64-multi-currency-fx-system)
   - 6.5 [API Client — client.js](#65-api-client--clientjs)
   - 6.6 [Shared Component Library — ui.jsx](#66-shared-component-library--uijsx)
   - 6.7 [Visual Report Tab](#67-visual-report-tab)
   - 6.8 [Valuation Models Tab](#68-valuation-models-tab)
   - 6.9 [Risk Metrics Tab](#69-risk-metrics-tab)
   - 6.10 [Technical Charts Tab](#610-technical-charts-tab)
   - 6.11 [Peer Comparison Tab](#611-peer-comparison-tab)
   - 6.12 [Fundamental Analysis Tab](#612-fundamental-analysis-tab)
   - 6.13 [Watchlist Drawer](#613-watchlist-drawer)
7. [Firebase Architecture](#7-firebase-architecture)
8. [Deployment & Infrastructure](#8-deployment--infrastructure)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Data Sources & Constraints](#10-data-sources--constraints)
11. [Key Algorithms — Deep Dive](#11-key-algorithms--deep-dive)
12. [Security Architecture](#12-security-architecture)
13. [Design Decisions & Trade-offs](#13-design-decisions--trade-offs)
14. [Known Limitations](#14-known-limitations)

---

## 1. Project Overview

Dhanaṁ (Sanskrit: धनम्, meaning *wealth*) is a full-stack, institutional-grade automated equity research and valuation platform. It takes any publicly traded stock ticker and produces a complete investment research dossier — DCF valuation, quantitative risk profiling, technical trend analysis, peer benchmarking, fundamental statement breakdown, and a composite 40-point Playbook quality score — entirely from free, publicly available data sources.

**Core philosophy:**
- **100% free data** — yfinance/Yahoo Finance, SEC EDGAR, FRED. No paid data keys required.
- **Zero-fail architecture** — every computation degrades gracefully. Missing data returns `None`, never an exception.
- **Dual-mode presentation** — a single toggle switches between a plain-language Beginner view and an institutional Pro view across every tab.
- **FX-normalized** — all monetary values are converted to the user's requested currency in real time; ratios are always left invariant.

**Target users:** Finance students, retail investors, and early-career professionals who want institutional-quality analysis without Bloomberg terminal access.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     USER BROWSER                        │
│   React 18 + Vite + Tailwind CSS + Plotly.js            │
│   Hosted on Vercel  (https://dhanam-three.vercel.app)   │
└────────────────────┬───────────────┬────────────────────┘
                     │ HTTPS         │ Firebase SDK
                     │ /api/v1/*     │ (Auth + Firestore)
                     ▼               ▼
┌──────────────────────────┐  ┌─────────────────────────┐
│  FastAPI Backend          │  │  Firebase (Google)       │
│  Python 3.12 / uvicorn   │  │  ─ Authentication        │
│  Hosted on Render (free)  │  │  ─ Firestore (database)  │
│                           │  │  ─ Security Rules        │
│  ┌──────────────────────┐ │  └─────────────────────────┘
│  │ /api/v1/analyze      │ │
│  │ /api/v1/compare      │ │         ┌──────────────────┐
│  │ /api/v1/watchlist    │ │         │  External Data   │
│  │ /api/v1/auth/sync    │ │◄────────│  yfinance/Yahoo  │
│  └──────────────────────┘ │         │  FRED (^TNX)     │
│                           │         │  SEC EDGAR       │
│  ┌──────────────────────┐ │         └──────────────────┘
│  │ Valuation Engine     │ │
│  │ Risk Engine          │ │
│  │ FX Engine            │ │
│  │ Playbook Engine      │ │
│  └──────────────────────┘ │
└──────────────────────────┘
```

**Request flow for a stock analysis:**
1. User types ticker in browser → `analyzeStock('AAPL', 'US', '', 'USD')` called in `client.js`
2. Axios POST to `https://dhanam.onrender.com/api/v1/analyze/AAPL?target_currency=USD`
3. Firebase ID token attached as `Authorization: Bearer <token>` (if logged in)
4. Render backend: rate-limit check → data fetch (yfinance, TTL-cached) → valuation → risk → playbook → FX conversion → JSON response
5. Frontend renders dashboard with dual-mode tabs

---

## 3. Technology Stack

### Backend
| Layer | Technology |
|---|---|
| Web framework | FastAPI 0.100+ |
| ASGI server | uvicorn |
| Language | Python 3.12.7 |
| Data fetching | yfinance (Yahoo Finance API wrapper) |
| Numerical computing | NumPy, pandas |
| Authentication | Firebase Admin SDK 6.5+ |
| Rate limiting | slowapi 0.1.9+ |
| Caching | functools `lru_cache` (TTL via wrapper) |
| Deployment | Render (free tier, auto-sleep) |

### Frontend
| Layer | Technology |
|---|---|
| UI framework | React 18 |
| Build tool | Vite |
| Styling | Tailwind CSS (dark mode, custom tokens) |
| Charts | Plotly.js (react-plotly.js) |
| HTTP client | Axios |
| Authentication | Firebase JS SDK v9 (modular) |
| Export | html2canvas |
| Icons | Lucide React |
| Fonts | Inter (UI), Roboto Mono (numbers), Playfair Display (brand) |
| Deployment | Vercel |

### Database / Auth
| Layer | Technology |
|---|---|
| Authentication | Firebase Auth (email/password + Google OAuth) |
| Database | Firestore (NoSQL document store) |
| Security | Firebase Security Rules (row-level ownership) |

---

## 4. Repository Structure

```
dhanam/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, rate limiting, exception handler
│   ├── requirements.txt         # Python dependencies
│   ├── render.yaml              # Render Blueprint deployment config (root level)
│   ├── api/
│   │   └── routes.py            # All API endpoints (/analyze, /compare, /watchlist, /auth)
│   ├── core/
│   │   ├── security.py          # Firebase JWT verification dependency
│   │   └── rate_limit.py        # slowapi limiter with no-op fallback
│   └── services/
│       ├── valuation.py         # DCF, WACC, Monte Carlo, Playbook, FX conversion
│       ├── data_client.py       # yfinance data fetching, caching, FX rates
│       ├── risk.py              # Beta, Sharpe, Sortino, Treynor, CVaR, Calmar, VaR
│       ├── firebase_client.py   # Firebase Admin SDK init + token verification
│       ├── watchlist.py         # Firestore watchlist CRUD operations
│       └── utils.py             # Sector benchmark maps (EV/EBITDA, gross margin)
│
├── frontend/
│   ├── index.html               # App shell HTML, Google Fonts, favicon ref
│   ├── vite.config.js           # Vite configuration
│   ├── tailwind.config.js       # Tailwind design tokens, animations, dark mode
│   ├── postcss.config.js        # PostCSS / Tailwind pipeline
│   ├── vercel.json              # Vercel SPA rewrites config
│   ├── .env                     # Local env vars (git-ignored)
│   ├── .env.example             # Template (no real values)
│   ├── public/
│   │   ├── favicon.svg          # Custom D-mark logo with trend line
│   │   └── icons.svg            # App icon set
│   └── src/
│       ├── main.jsx             # React root — wraps AuthProvider + ModeProvider
│       ├── App.jsx              # Main app shell, routing between views, nav
│       ├── firebase.js          # Firebase JS SDK initialisation (resilient)
│       ├── api/
│       │   └── client.js        # Axios instance, resolveBaseURL, all API calls
│       ├── context/
│       │   ├── AuthContext.jsx  # onAuthStateChanged, login, logout, Google OAuth
│       │   └── ModeContext.jsx  # Global Beginner/Pro toggle state
│       └── components/
│           ├── common/
│           │   ├── ui.jsx       # Panel, StatTile, DataTable, Badge, formatters
│           │   └── MetricCard.jsx
│           ├── auth/
│           │   ├── LoginPage.jsx
│           │   ├── SignupPage.jsx
│           │   ├── GoogleButton.jsx
│           │   └── AuthModal.jsx
│           └── dashboard/
│               ├── VisualReport.jsx       # 40-pt gauge, NLG, traffic lights
│               ├── ValuationModels.jsx    # DCF, WACC bridge, Monte Carlo
│               ├── RiskMetrics.jsx        # Beta, CVaR, Safety Weather
│               ├── TechnicalCharts.jsx    # Candlestick / MACD / RSI / line chart
│               ├── PeerComparison.jsx     # Peer podium + EV matrix
│               ├── FundamentalAnalysis.jsx # Statements + health lights
│               └── Watchlist.jsx          # Saved tickers drawer
│
├── docs/
│   └── DOCUMENTATION.md         # This file
├── firestore.rules              # Firestore security rules (deploy via Firebase Console)
├── render.yaml                  # Render Blueprint config (backend)
├── .gitignore                   # Blocks .env, service account JSONs
└── README.md
```

---

## 5. Backend

### 5.1 Application Entry Point — main.py

The FastAPI application is configured with three critical concerns at startup:

#### CORS Policy
```python
_env_origins = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
allowed_origins = _env_origins if _env_origins else ["http://localhost:5173", "http://localhost:3000"]
```
In production, `ALLOWED_ORIGINS=https://dhanam-three.vercel.app` is set in the Render dashboard. This means only the exact Vercel URL is allowed — no wildcards. Locally (when `ALLOWED_ORIGINS` is unset), only localhost ports 5173 and 3000 are allowed.

Methods: `GET, POST, DELETE, OPTIONS`  
Headers: `Authorization, Content-Type`  
Credentials: `True` (required for Firebase token forwarding)

#### CORS-Preserving Exception Handler
Starlette's `ServerErrorMiddleware` sits *outside* `CORSMiddleware` in the middleware stack. This means unhandled 500 errors strip CORS headers before they reach the browser, causing a misleading "CORS error" in DevTools when the real issue is a backend crash. The global exception handler re-attaches CORS headers manually:

```python
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    origin = request.headers.get("origin")
    headers = {}
    if origin and origin.rstrip("/") in allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    return JSONResponse(status_code=500,
        content={"detail": "A transient backend error occurred. Please retry."},
        headers=headers)
```

#### Startup
Firebase Admin SDK is initialised eagerly on startup (non-fatal — the server starts even if Firebase credentials are missing). The PORT environment variable is consumed for Render compatibility.

---

### 5.2 API Routes

All routes are registered under the `/api/v1` prefix.

#### `POST /api/v1/analyze/{ticker}`
The primary analysis endpoint. Rate limited to **20 requests/minute** per client IP.

**Query parameters:**
- `exchange` (str, default `"US"`) — exchange suffix hint
- `industry` (str, default `""`) — optional industry override
- `target_currency` (str, default `"USD"`) — FX target: USD, EUR, INR, GBP

**What it does (sequential):**
1. Fetches price history, financial statements, macro inputs via `data_client`
2. Runs `run_playbook()` → executes full valuation (DCF + WACC + Monte Carlo + CCA) + risk metrics + 40-pt Playbook, applies FX conversion
3. Returns `AnalysisResponse` JSON

**`AnalysisResponse` shape:**
```python
class AnalysisResponse(BaseModel):
    ticker: str
    company_name: str
    sector: str
    price: Optional[float]
    currency: str                    # display currency after FX
    intrinsic_value: Optional[float]
    scores: Optional[Dict]           # legacy scores (backward compat)
    history: Optional[List[Dict]]    # OHLCV for charts
    income_statement: Optional[Dict]
    balance_sheet: Optional[Dict]
    cash_flow: Optional[Dict]
    analyst_data: Optional[Dict]
    valuation: Optional[Dict]        # DCF, WACC, Monte Carlo, CCA
    risk: Optional[Dict]             # Beta, Sharpe, Sortino, Treynor, CVaR, etc.
    playbook: Optional[Dict]         # 40-pt score, 8 pillars, grade
    fx: Optional[Dict]               # FX metadata (base, display, rate, converted)
```

#### `POST /api/v1/compare`
Peer comparison endpoint. Rate limited to **10 requests/minute**.

**Body:** `{ "ticker": "AAPL", "peers": "MSFT,GOOGL,META", "target_currency": "USD" }`

Fetches headline metrics for each peer ticker concurrently using `concurrent.futures.ThreadPoolExecutor`, then calls `normalize_peer_currency()` on each result.

#### `GET /api/v1/watchlist`
Returns all watchlist items for the authenticated user (requires valid Firebase ID token).

#### `POST /api/v1/watchlist`
Saves a ticker + valuation snapshot to the user's Firestore watchlist.

#### `DELETE /api/v1/watchlist/{ticker}`
Removes a ticker from the user's Firestore watchlist.

#### `POST /api/v1/auth/sync`
Called automatically after login/signup. Creates or updates the user's Firestore profile document (`users/{uid}`) with display name and email.

---

### 5.3 Authentication & Security

**`core/security.py` — `get_current_user` FastAPI dependency**

Every protected endpoint (`/watchlist`, `/auth/sync`) uses `Depends(get_current_user)`. The dependency:

1. Extracts the `Authorization: Bearer <token>` header
2. Calls `firebase_client.verify_id_token(token, clock_skew_seconds=10)`
3. Returns the decoded token dict on success
4. Returns `401 Unauthorized` on invalid/expired token
5. Returns `503 Service Unavailable` if Firebase certificate fetch fails (e.g., network outage)

The `clock_skew_seconds=10` tolerance handles the ~seconds of clock drift between Render's servers and Firebase's token issuance servers.

The `/analyze` and `/compare` endpoints do **not** require authentication — the platform is read-only usable without login. Auth is only required for watchlist write operations.

---

### 5.4 Rate Limiting

**`core/rate_limit.py`**

Uses `slowapi` (a FastAPI-compatible wrapper around `limits`). Key design decisions:

**Client key function:**
```python
def _client_key(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()   # first hop = real client IP behind Render proxy
    return request.client.host
```
This correctly identifies real client IPs even though Render proxies all requests (without this, all clients would share the same rate limit bucket).

**`headers_enabled=False`** — Critical. When `True`, slowapi attempts to inject `X-RateLimit-*` headers by mutating the response object. Routes that return Pydantic models (not a `starlette.responses.Response`) don't have this method and crash with a 500. Header injection is disabled; the rate limiting itself still works correctly.

**Fault-tolerant fallback:** If `slowapi` is not installed, a `_NoopLimiter` class is used that passes all requests through silently. The server never crashes due to a missing rate-limiting dependency.

**Limits:**
- `/analyze`: 20 requests/minute/IP
- `/compare`: 10 requests/minute/IP

---

### 5.5 Data Pipeline — data_client.py

All data fetching goes through `data_client.py`. Every function uses `lru_cache` with a TTL wrapper to avoid redundant API calls during a single analysis session.

#### `get_price_history(ticker, period="5y", interval="1d")`
Fetches OHLCV data via `yfinance.Ticker.history()`. Uses `_yf_with_backoff()` — an exponential-backoff retry wrapper that handles transient Yahoo Finance rate limits. Returns a list of `{date, open, high, low, close, volume}` dicts.

#### `get_financial_statements(ticker)`
Returns a tuple of three pandas DataFrames: `(income_statement, balance_sheet, cash_flow_statement)`. Each column represents one fiscal year (most recent = column 0). Fetches from `yfinance.Ticker.financials`, `.balance_sheet`, `.cashflow`.

Key fields extracted:
- **Income statement:** Total Revenue, Net Income, EBITDA, Operating Income, Gross Profit
- **Balance sheet:** Total Assets, Total Debt, Cash and Short Term Investments, Total Stockholder Equity, Current Assets, Current Liabilities
- **Cash flow:** Free Cash Flow, Operating Cash Flow, Capital Expenditures

#### `compute_beta(ticker, benchmark="^GSPC", period="2y", interval="1wk")`
OLS regression of 2-year weekly log-returns of the stock against the S&P 500. Uses NumPy's `polyfit` for the slope (beta). Falls back to `yfinance.Ticker.info['beta']` if the regression fails.

#### `get_macro_inputs()`
Fetches the current 10-year US Treasury yield (`^TNX`) from yfinance to use as the risk-free rate. Falls back to a hardcoded `0.045` (4.5%) if the live fetch fails. The Equity Risk Premium (ERP) is a Damodaran-style constant of `0.055` (5.5%).

#### `resolve_currency(ccy)`
Handles minor currency unit mapping — critical for London Stock Exchange stocks which quote in **GBp (pence)** rather than **GBP (pounds)**. Without this, the stock price appears 100× too large relative to financial statement figures (which are in pounds), completely destroying DCF accuracy.

```python
MINOR_UNITS = {
    "GBp": ("GBP", 0.01),   # pence → pounds
    "ZAc": ("ZAR", 0.01),   # South African cents
    "ILA": ("ILS", 0.01),   # Israeli agora
}
```

#### `get_fx_rate(from_ccy, to_ccy)`
Fetches live FX rates via yfinance currency pairs. Lookup order:
1. **Direct pair** — e.g., `EURUSD=X` for EUR→USD
2. **Inverse pair** — e.g., fetch `USDEUR=X` and invert (1/rate)
3. **USD triangulation** — convert from_ccy→USD, then USD→to_ccy using two pairs
4. **None** — if all fail, returns `None` (FX unavailable, display in native currency with a warning note)

A depth guard prevents infinite recursion in the triangulation path.

---

### 5.6 Valuation Engine — valuation.py

The valuation engine is the computational heart of Dhanaṁ. The primary entry point is `run_playbook()`.

#### `run_playbook(ticker, exchange, industry, target_currency)`

Orchestrates the full analysis:

1. Fetches all data (price history, statements, macro inputs)
2. Resolves minor currency units at ingestion (e.g., 450 GBp → 4.50 GBP)
3. Runs DCF valuation
4. Runs WACC calculation
5. Runs Monte Carlo simulation
6. Runs CCA (Comparable Company Analysis) multiples
7. Runs `calculate_playbook_score()`
8. Fetches live FX rate and applies `_apply_fx()` for currency conversion
9. Returns the complete result dict

#### 3-Stage DCF Model

The DCF model uses three growth phases to capture the typical lifecycle of a public company:

```
Stage 1: High growth  (years 1-5)   — extrapolated from historical FCF
Stage 2: Fade growth  (years 6-10)  — linear interpolation to terminal rate
Stage 3: Terminal     (year 10+)    — Gordon Growth Model with perpetuity
```

**Base UFCF (Unlevered Free Cash Flow):** Calculated as the average of the 3 most recent fiscal years' Operating Cash Flow minus CapEx. This is more robust than using only the most recent year.

**Stage-1 growth rate:** Derived from historical revenue CAGR, capped and floored to prevent explosive assumptions.

**Terminal growth rate:** Fixed at 2.5% (slightly above long-run US nominal GDP growth). A company that grows faster than the economy forever would eventually become the economy.

**Intrinsic value per share:**
```
PV = Σ(UFCF_t / (1+WACC)^t)  for t=1..10
   + Terminal Value / (1+WACC)^10
Terminal Value = UFCF_10 × (1+g) / (WACC - g)
Equity Value = PV - Net Debt
Intrinsic Value per Share = Equity Value / Shares Outstanding
```

#### CAPM WACC

```
WACC = Ke × (E/V) + Kd × (1-t) × (D/V)

where:
  Ke = rf + β × ERP             (CAPM cost of equity)
  Kd = Interest Expense / Total Debt  (cost of debt)
  t  = effective tax rate
  E  = market cap
  D  = total debt
  V  = E + D

  rf = 10-year US Treasury yield (live from ^TNX)
  ERP = 5.5% (Damodaran implied ERP constant)
  β  = 2-year weekly OLS regression vs S&P 500
```

Beta is floored at 0.5 and capped at 3.0 to prevent DCF blow-up from extreme values.

#### Monte Carlo Simulation (10,000 paths)

A fully vectorized NumPy simulation. All 10,000 paths are computed simultaneously (no Python loop).

**Perturbed parameters per path:**
```python
growth_samples  = stage1_growth  + np.random.normal(0, 0.03, N)
wacc_samples    = wacc           + np.random.normal(0, 0.01, N)
margin_samples  = ufcf_margin    + np.random.normal(0, 0.02, N)
```

Each path discounts 10 years of UFCF plus a terminal value, producing a distribution of intrinsic values. Output: P5, P25, P50, P75, P95 percentiles + `prob_above_price` (probability the stock is undervalued).

#### CCA — Comparable Company Analysis

Uses sector-specific EV/EBITDA multiples from `utils.py` (`SECTOR_EV_EBITDA_MAP`) to produce a market-implied intrinsic value estimate:

```
CCA Value = EBITDA × Sector_Multiple
```

For the `/compare` peer endpoint, a regression-based **cheapness score** is computed: EV/EBITDA is regressed on revenue growth and ROE across the peer set, and the z-scored residual indicates whether a stock trades cheap or rich for its quality characteristics.

---

### 5.7 Risk Engine — risk.py

`compute_risk_metrics(ticker, hist_df)` computes a comprehensive risk profile from the price history.

#### Metrics Computed

| Metric | Formula | Interpretation |
|---|---|---|
| **Beta** | OLS slope of weekly returns vs S&P 500 | Market sensitivity |
| **Sharpe Ratio** | (Rp - Rf) / σp | Risk-adjusted return |
| **Sortino Ratio** | (Rp - Rf) / σ_downside | Penalises only downside vol |
| **Treynor Ratio** | (Rp - Rf) / β | Return per unit of market risk |
| **Calmar Ratio** | Annualised Return / Max Drawdown | Return per unit of drawdown |
| **VaR 95%** | 5th percentile of daily returns | 1-day loss at 95% confidence |
| **CVaR 95%** | Mean of returns below VaR | Expected loss in worst 5% |
| **Max Drawdown** | (Peak - Trough) / Peak | Worst historical peak-to-trough |
| **Volatility** | Annualised σ of daily log-returns | Total price risk |

All metrics are computed from daily price returns over the available history (up to 5 years). Annualisation factor: √252 for daily returns.

---

### 5.8 FX Normalization Engine

The FX engine ensures all monetary values are presented in the user's requested currency while keeping ratios invariant.

#### Monetary vs. Ratio Fields

Only explicitly listed monetary fields are converted. Ratios are left untouched regardless of currency:

**Converted (monetary):**
- `price`, `market_cap`, `intrinsic_value`
- `valuation.dcf.intrinsic_value_per_share`, `valuation.dcf.base_ufcf`, `valuation.dcf.net_debt`
- `valuation.monte_carlo.percentiles` (P5, P25, P50, P75, P95)
- `valuation.cca_value`
- `history` OHLC prices

**Never converted (ratios / percentages):**
- `valuation.dcf.wacc`, `valuation.dcf.upside_pct`, `valuation.dcf.stage1_growth`
- `scores` (PE, ROE, growth rates)
- `risk` metrics (Beta, Sharpe, Sortino, CVaR as % returns)
- `playbook.pillars` scores (dimensionless 0-5)

#### FX Metadata in Response

```json
{
  "fx": {
    "base_currency": "GBP",
    "requested_currency": "USD",
    "display_currency": "USD",
    "rate": 1.2734,
    "converted": true,
    "note": null
  }
}
```

If live FX is unavailable, `converted: false` and `note: "Live FX unavailable — showing in native currency"`.

---

### 5.9 40-Point Playbook Engine

`calculate_playbook_score(info, statements, hist_df, price, intrinsic)` produces a composite quality score across 8 institutional pillars, each scored 0–5 for a maximum of 40 points.

#### Scoring Philosophy

Each pillar uses smooth threshold decay (via `_clamp(x, lo, hi)`), not hard binary cutoffs. A stock that just misses a threshold gets a proportionally reduced score rather than zero — this prevents cliff-edge behaviour and makes the score more informative.

```python
def _clamp(x, lo, hi):
    """Smooth decay: 5.0 at x≤lo, 0.0 at x≥hi, linear between."""
    if x is None: return None
    if x <= lo: return 5.0
    if x >= hi: return 0.0
    return 5.0 * (1 - (x - lo) / (hi - lo))
```

#### The 8 Pillars

| Pillar | Key | School | What it measures |
|---|---|---|---|
| Intrinsic Value | `intrinsic_value` | Value | DCF margin of safety (price vs fair value) |
| Balance Sheet | `balance_sheet` | Safety | Net Debt/EBITDA + Current Ratio |
| Earnings Stability | `earnings_stability` | Quality | Years of positive net income + FCF |
| Growth | `growth` | Growth | Revenue/earnings growth + ROIC expansion |
| Quant Value | `quant_value` | Quant | FCF yield + EV/EBITDA vs sector benchmark |
| Technical | `technical` | Technical | Price vs SMA200 + relative volume |
| Behavioral | `behavioral` | Behavioral | Short interest (< 5% = institutional confidence) |
| Moat | `moat` | Quality | Gross margin vs sector + margin stability |

#### Grading Scale

| Grade | Score Range | Interpretation |
|---|---|---|
| A | 34 – 40 | Exceptional, high-conviction |
| B | 27 – 33 | Strong, attractive |
| C | 20 – 26 | Mixed, middle-of-the-road |
| D | 13 – 19 | Weak, notable risks |
| F | 0 – 12 | Poor, fails most quality checks |

#### Pillar Detail Objects

Each pillar returns a `detail` dict with the key metric used, enabling the Pro table to show exactly what drove the score:

```json
{
  "key": "balance_sheet",
  "name": "Balance Sheet",
  "school": "Safety",
  "score": 3.8,
  "max": 5,
  "available": true,
  "detail": {
    "net_debt_to_ebitda": 1.2,
    "current_ratio": 1.8,
    "threshold": "ND/EBITDA < 2× and CR > 1.5"
  }
}
```

---

### 5.10 Watchlist Service

**`services/watchlist.py`** provides Firestore CRUD for user watchlists.

**Firestore schema:**
```
users/{uid}                        — user profile document
watchlists/{uid}/                  — watchlist collection
  items/{TICKER}                   — one document per saved ticker
    ticker: "AAPL"
    currency: "USD"
    savedAt: Timestamp
    snapshot: {
      price: 182.50,
      intrinsicValue: 198.30,
      upsidePct: 8.7,
      wacc: 0.0975,
      mc: { p5, p50, p95, probUpside },
      asOf: ISO timestamp
    }
```

**Operations:**
- `get_watchlist(uid)` — returns all items sorted by `savedAt` desc
- `add_to_watchlist(uid, item)` — upserts by ticker (overwrites existing snapshot)
- `remove_from_watchlist(uid, ticker)` — deletes the item document

---

### 5.11 Firebase Client

**`services/firebase_client.py`** handles Firebase Admin SDK initialisation with three credential resolution strategies (in order):

1. `FIREBASE_SERVICE_ACCOUNT_B64` env var — base64-encoded service account JSON (production, set in Render dashboard)
2. `GOOGLE_APPLICATION_CREDENTIALS` env var — path to a service account file (CI/CD)
3. `backend/firebase-adminsdk.json` file — local development fallback

Initialisation is lazy and idempotent (guarded by `firebase_admin._apps`).

`verify_id_token(id_token, clock_skew_seconds=10)`:
- Calls `firebase_admin.auth.verify_id_token()` with clock skew tolerance
- Returns the decoded token dict on success
- Raises `ValueError` for invalid tokens (→ 401)
- Raises `firebase_admin.auth.CertificateFetchError` for network failures (→ 503)

---

## 6. Frontend

### 6.1 App Shell — App.jsx

`App.jsx` is the single top-level component. It manages three distinct views via a `status` state machine:

```
'idle'     → Landing page (search bar, tagline)
'loading'  → Full-screen spinner
'success'  → Dashboard (6-tab analysis view)
```

On error, the app **restores the previous view** rather than showing a separate error state:
- If coming from `idle`: stays on landing, shakes the search bar, shows the exchange-suffix tip
- If coming from `success`: keeps the previous dashboard data visible, shakes the navbar search bar

This prevents the user from losing their current analysis due to a mis-typed re-search.

**State managed in App.jsx:**
```javascript
ticker        // current input value
status        // 'idle' | 'loading' | 'success'
data          // AnalysisResponse from backend
currency      // 'USD' | 'EUR' | 'INR' | 'GBP'
activeTab     // which dashboard tab is visible
shakeBar      // triggers shake animation on error
showTip       // shows exchange-suffix helper text
saveState     // 'idle' | 'saving' | 'saved'
authOpen      // auth modal visibility
watchlistOpen // watchlist drawer visibility
```

**Sub-components defined in App.jsx:**
- `ModeToggle` — `[Beginner | Pro]` segmented control
- `CurrencySelector` — `[USD | EUR | INR | GBP]` segmented control
- `AuthControls` — login button or user avatar + logout

---

### 6.2 Authentication System

#### `frontend/src/firebase.js`
Resilient Firebase app initialisation. If any `VITE_FIREBASE_*` env var is missing, Firebase is disabled gracefully (exports `isFirebaseConfigured: false`). The app never crashes — it simply runs without auth features.

#### `frontend/src/context/AuthContext.jsx`
React context wrapping all Firebase Auth operations. Provided at the root level (`main.jsx`).

**Exposed via `useAuth()`:**
```javascript
{
  user,           // Firebase User object or null
  loading,        // true while onAuthStateChanged hasn't fired yet
  login,          // (email, password) → Promise
  signup,         // (email, password, displayName) → Promise
  loginWithGoogle,// () → signInWithPopup(googleProvider)
  logout,         // () → signOut()
  error,          // friendly error message string
}
```

**Auto-sync on login:** Every successful authentication calls `POST /api/v1/auth/sync` with the Firebase ID token. This ensures the user's Firestore profile (`users/{uid}`) is created/updated.

**Error mapping:** Raw Firebase error codes are translated to friendly messages:
```
auth/user-not-found     → "No account found with this email."
auth/wrong-password     → "Incorrect password."
auth/email-already-in-use → "An account with this email already exists."
auth/weak-password      → "Password must be at least 6 characters."
auth/popup-closed-by-user → "Sign-in popup was closed."
```

---

### 6.3 Beginner / Pro Mode System

#### `frontend/src/context/ModeContext.jsx`
A single global boolean (`pro`) controls the display mode for every dashboard tab simultaneously.

```javascript
// Consumed in every dashboard component:
const { pro } = useMode();

return pro ? <ProView data={data} /> : <BeginnerView data={data} />;
```

**Default: Beginner mode.** Switching to Pro mode persists for the session but resets on page reload (not saved to Firestore — it's a display preference, not user data).

**What changes per mode:**

| Tab | Beginner | Pro |
|---|---|---|
| Visual Report | 40-pt gauge + NLG text + traffic lights | Decimal pillar table + DCF/ROIC/WACC stats |
| Valuation | "Value Meter" speedometer dial | DCF bridge + WACC details + Monte Carlo football field |
| Risk | "Safety Weather Forecast" (Sun/Cloud/Storm) | Beta/Sharpe/Sortino/Treynor/CVaR tables |
| Peers | Podium leaderboard (gold/silver/bronze) | EV/EBITDA · PEG regression matrix |
| Fundamentals | Financial health traffic lights | Raw income statement / balance sheet / cash flow |
| Technicals | Clean area chart + "Trend: Bullish/Bearish" | Candlestick + MACD + RSI synchronized panes |

---

### 6.4 Multi-Currency FX System

Users select a display currency (USD, EUR, INR, GBP) from the navbar. The selected currency is passed as `target_currency` to every API call. The backend handles all conversion server-side and returns converted monetary values plus FX metadata.

**Currency change flow:**
```javascript
const changeCurrency = (c) => {
  if (c === currency) return;
  setCurrency(c);
  // Re-run analysis with explicit override to avoid stale state
  if (status === 'success' && data) handleAnalyze(data.ticker, c);
};
```

The override pattern prevents a race condition where `currency` state might not have updated before `handleAnalyze` reads it.

**FX badge in UI:** If conversion occurred, a subtle `→` badge shows `GBP → USD @ 1.2734`. If FX was unavailable, a warning note shows instead.

---

### 6.5 API Client — client.js

#### `resolveBaseURL()`
A defensive URL resolver that ensures the API base URL always includes `/api/v1`:

```javascript
function resolveBaseURL() {
  let base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').trim();
  base = base.replace(/\/+$/, '');                       // strip trailing slashes
  if (!/\/api\/v\d+$/.test(base)) base += '/api/v1';    // append if missing
  return base;
}
```

This prevents the most common deployment mistake (setting `VITE_API_BASE_URL` to just the Render host URL without the `/api/v1` suffix), which caused repeated 404s on the initial deployment.

#### Axios Interceptor — Firebase Token
An axios request interceptor automatically attaches the Firebase ID token to every API call:

```javascript
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

Tokens expire after 1 hour; `getIdToken()` auto-refreshes them transparently.

#### Exported Functions
```javascript
analyzeStock(ticker, exchange, industry, targetCurrency)
comparePeers(ticker, peers, targetCurrency)
getWatchlist()
addToWatchlist({ ticker, currency, snapshot })
removeFromWatchlist(ticker)
syncAuth()
```

---

### 6.6 Shared Component Library — ui.jsx

A set of design-system primitives used across all dashboard tabs.

#### `Panel`
A bento-box container with optional glow shadow, title, subtitle, and right-slot:
```jsx
<Panel title="DCF Valuation" subtitle="3-stage unlevered model" right={<Badge>Live</Badge>} glow="rgba(45,122,62,0.16)">
  {children}
</Panel>
```

#### `StatTile`
A compact metric card with label, value, sub-text, tone colouring, and optional hint tooltip:
```jsx
<StatTile label="WACC" value="9.75%" sub="Discount rate" tone="neutral" />
```
Tones: `pos` (green), `neg` (red), `warn` (amber), `accent` (brand green), `neutral` (muted)

#### `DataTable`
A sortable, sticky-header table with conditional cell formatting:
- Column-level `sortValue` and `render` functions
- `initialSort` for default sort column/direction
- `highlightKey` to accent one row (e.g., the base ticker in peer comparison)
- `maxHeight` for scroll containment

#### `Badge`
Small pill badge: `<Badge tone="pos">Grade A</Badge>`

#### Formatters
```javascript
fmtMoney(value, currency)  // "$182.50" or "€168.30" with currency symbol
fmtBig(value, currency)    // "$2.94T" / "$482B" — abbreviated large numbers
fmtPct(value)              // "14.3%" — percentage
fmtNum(value, decimals)    // "9.75" — generic number
fmtX(value)                // "12.4×" — multiples
sym(currency)              // "$" / "€" / "₹" / "£"
```

#### `plotlyDark`
A Plotly layout preset that applies the Dhanaṁ dark theme: transparent background, `#0A120E` panel background, muted gridlines, `E6F0EA` text.

#### `plotlyConfig`
Standard Plotly config: `{ displayModeBar: false, responsive: true }` — removes the Plotly toolbar for a cleaner look.

---

### 6.7 Visual Report Tab

**`VisualReport.jsx`** — the overview tab, fully driven by `data.playbook`.

#### Beginner Mode
- **Gauge chart** (Plotly indicator) — 0 to 40, colour bands: red (0–13), amber (13–27), green (27–40). Displays `pb.total` with `/40` suffix.
- **NLG Verdict** — auto-generated paragraph using STRONG/WEAK/VERDICT phrase maps. Picks top-2 strengths (score ≥ 4) and top-2 weaknesses (score ≤ 2):
  ```
  "Apple scored 28/40 (Grade B) — a strong, attractive profile. Its standout
  strengths: it commands a wide competitive moat and real pricing power, and it
  screens statistically cheap. Key watch-outs: it is growing only slowly."
  ```
- **8 traffic-light pillar chips** — colour-coded: green (score ≥ 70%), amber (40–70%), red (<40%), grey (no data). Each shows a mini progress bar.
- **5-year price history** line chart.

#### Pro Mode
- **5 StatTiles** — DCF Fair Value, Upside %, WACC, ROIC, ROIC−WACC spread
- **Playbook Breakdown DataTable** — exact decimal scores, key metric per pillar, target threshold text
- **DCF Assumptions grid** — Stage-1 growth, terminal growth, UFCF margin, base UFCF, net debt, beta used

#### Playbook Score Tooltip
A pure-CSS `group`/`group-hover` tooltip (no JavaScript) appears on the `?` icon next to the Playbook Score label in both modes.

#### Download Scorecard
`html2canvas` captures the `reportRef` container at `scale: 2` (2× resolution for retina quality). Before capture, a legal disclaimer div (normally `display: none`) is made visible via a direct DOM ref mutation. After capture, it's hidden again. The PNG downloads as `{TICKER}_playbook_scorecard.png`.

---

### 6.8 Valuation Models Tab

**`ValuationModels.jsx`**

#### Beginner Mode — "Value Meter"
A Plotly gauge with the current price on the dial:
- Green zone: below fair value (undervalued)
- Red zone: above fair value (overvalued)
- Accent threshold line at the DCF fair value
- Plain-language verdict: *"Our models suggest a fair value of $198.30. The stock appears to be trading at a discount."*

#### Pro Mode
- **DCF waterfall / bridge** — Stage-1 PV, Stage-2 PV, Terminal Value PV, minus Net Debt = Equity Value
- **WACC decomposition** — Ke (cost of equity), Kd (cost of debt), weights
- **Monte Carlo football field** — horizontal box plot showing P5, P25, P50, P75, P95 intrinsic value distribution vs current price

---

### 6.9 Risk Metrics Tab

**`RiskMetrics.jsx`**

#### Beginner Mode — "Safety Weather Forecast"
A composite `rScore` derived from beta, annualised volatility, and max drawdown determines the weather icon:
- **Sun** (rScore ≥ 7) — Low risk
- **Cloud + Sun** (rScore ≥ 4) — Moderate risk
- **Cloud + Lightning** (rScore < 4) — High risk

Four plain-language cards:
- **Crash Sensitivity** — *"If the market drops 10%, this stock typically drops ~14%"* (from beta)
- **Worst Drop** — max drawdown as a percentage
- **Bumpiness** — annualised volatility in plain terms
- **Reward for Risk** — Sharpe ratio translated to *"earns X per unit of risk taken"*

#### Pro Mode
Full risk table: Beta, Sharpe, Sortino, Treynor, Calmar, VaR 95%, CVaR 95%, Max Drawdown, Annualised Volatility. Accompanied by a returns distribution histogram.

---

### 6.10 Technical Charts Tab

**`TechnicalCharts.jsx`**

#### Beginner Mode
- Clean area chart (green fill if price > SMA200, red fill if below)
- **Trend verdict** computed from price vs SMA50 vs SMA200:
  - `price > SMA50 > SMA200` → **"Strongly Bullish"**
  - `price > SMA200` (but below SMA50) → **"Bullish"**
  - else → **"Bearish"**
- Period selector: 6m / 1y / 2y / 5y

#### Pro Mode
Three synchronised panes sharing a single x-axis:
1. **Candlestick** + volume overlay (TradingView-style)
2. **MACD** — fast=12, slow=26, signal=9
3. **RSI** — 14-period, with overbought (70) and oversold (30) reference lines

Full crosshair spike lines across all three panes on hover.

---

### 6.11 Peer Comparison Tab

**`PeerComparison.jsx`**

#### Input
User enters up to 5 peer tickers (comma-separated). The comparison runs in the same display currency as the main analysis.

#### Beginner Mode — "Playbook Podium"
A client-side `quickScore(peer)` function scores each peer out of 40 without making additional backend Playbook API calls (which would be N additional full analysis runs — too slow for a free tier server):

```javascript
function quickScore(p) {
  // Blends: EV/EBITDA, P/E, ROE, Revenue Growth, P/B, Dividend Yield
  // Each metric mapped to a 0–10 sub-score with threshold bands
  // Total capped at 40
}
```

Top-3 peers displayed on a visual podium with gold/silver/bronze pedestals and medal colours. Full ranking list below with progress bars.

#### Pro Mode
Full DataTable matrix:
- Columns: Ticker, Price, Market Cap, EV/EBITDA, EV/Revenue, P/E, Forward P/E, ROE, Revenue Growth, Cheapness Score
- **Cheapness Score**: z-scored residual from OLS regression of EV/EBITDA on growth + ROE across the peer set. Positive = cheap for its quality. Negative = expensive.
- Horizontal bar chart ranking peers by cheapness score

---

### 6.12 Fundamental Analysis Tab

**`FundamentalAnalysis.jsx`**

Four sub-tabs: **Financials** / **Company Profile** / **Analyst Ratings** / **News**

#### Beginner Mode — Financial Health
`healthLights(data)` derives traffic-light cards from `data.playbook.pillars` and `data.valuation.dcf.net_debt`, requiring no additional API calls:

| Card | Source | Green Threshold |
|---|---|---|
| Cash vs Debt | balance_sheet pillar + net_debt | Net debt < 2× EBITDA |
| Debt Load | balance_sheet pillar detail | ND/EBITDA < 2× |
| Liquidity | balance_sheet current_ratio | Current ratio > 1.5 |
| Profitability | earnings_stability pillar | > 3/5 quality years |
| Cash Generation | quant_value fcf_yield | FCF yield > 3% |

Each card shows a colour-coded indicator and a plain-language sentence: *"The company has 2.3× more short-term assets than short-term liabilities — comfortable."*

#### Pro Mode
Raw financial statements in DataTable format:
- Income Statement (revenue, gross profit, EBITDA, operating income, net income)
- Balance Sheet (assets, liabilities, equity, debt, cash)
- Cash Flow Statement (operating CF, CapEx, FCF)

All figures formatted with `fmtBig()` abbreviated notation.

---

### 6.13 Watchlist Drawer

**`Watchlist.jsx`** — a slide-in drawer (right side) listing all saved tickers.

Each item shows:
- Ticker + saved-at timestamp
- Snapshot metrics from the time of save: price, intrinsic value, upside %, WACC
- Currency at time of save

Clicking a ticker calls `handleWatchlistSelect(ticker)` in `App.jsx`, which re-runs a fresh analysis (updates the snapshot to current data). The delete button calls `removeFromWatchlist()`.

---

## 7. Firebase Architecture

### Auth Configuration
- **Providers:** Email/password + Google OAuth (popup)
- **Authorized domains:** `dhanam-three.vercel.app` + `localhost` (must be added in Firebase Console → Authentication → Settings → Authorized domains)
- **Session:** Firebase handles session persistence automatically (IndexedDB). Tokens expire after 1 hour and are auto-refreshed by `getIdToken()`.

### Firestore Schema
```
/users/{uid}
  displayName: string
  email: string
  createdAt: Timestamp
  updatedAt: Timestamp

/watchlists/{uid}/items/{TICKER}
  ticker: string
  currency: string
  savedAt: Timestamp
  snapshot: {
    price: number | null
    intrinsicValue: number | null
    upsidePct: number | null
    wacc: number | null
    mc: { p5, p50, p95, probUpside } | null
    asOf: ISO string
  }
```

### Security Rules (firestore.rules)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    // Users can only read/write their own profile
    match /users/{uid} {
      allow read: if isOwner(uid);
      allow write: if isOwner(uid) && request.resource.data.uid == uid;
    }
    // Users can only read/write their own watchlist
    match /watchlists/{uid} {
      allow read, write: if isOwner(uid);
      match /items/{ticker} { allow read, write: if isOwner(uid); }
      match /{document=**} { allow read, write: if isOwner(uid); }
    }
  }
}
```

**Default-deny:** Any path not explicitly matched is denied. There are no public-read collections.

> **Deploy rules via:** Firebase Console → Firestore → Rules → Paste → Publish  
> (or `firebase deploy --only firestore:rules` via Firebase CLI)

---

## 8. Deployment & Infrastructure

### Backend — Render (Free Tier)

**Service type:** Web Service  
**Runtime:** Python  
**Root directory:** `backend/`  
**Build command:** `pip install -r requirements.txt`  
**Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`  
**Health check path:** `/`

**Important:** The free Render tier spins down after 15 minutes of inactivity. The first request after sleep takes ~30 seconds (cold start). This is a known trade-off of using the free tier.

**Deployment flow:**
1. Push to `main` branch on GitHub
2. Render detects the push and auto-redeploys
3. Build installs requirements; start command launches uvicorn
4. Health check passes → traffic switches to new deployment

### Frontend — Vercel

**Framework:** Vite  
**Root directory:** `frontend/`  
**Build command:** `vite build` (auto-detected)  
**Output directory:** `dist/`

**SPA rewrites (`vercel.json`):** All routes rewrite to `index.html` so React Router (if added) and direct URL loads work correctly.

**Deployment flow:**
1. Push to `main` branch
2. Vercel detects push and auto-redeploys
3. Vite builds, inlining all `VITE_*` env vars into the JS bundle
4. CDN distributes globally

---

## 9. Environment Variables Reference

### Backend (set in Render Dashboard)

| Variable | Required | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | Yes (prod) | Comma-separated exact Vercel URLs, e.g. `https://dhanam-three.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Yes (prod) | Base64-encoded Firebase service account JSON. Generate: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("firebase-adminsdk.json"))` |
| `PORT` | Auto | Set by Render automatically |
| `PYTHON_VERSION` | Optional | Set to `3.12.7` to pin the Python version |

### Frontend (set in Vercel Dashboard + local `.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Backend base URL including `/api/v1`, e.g. `https://dhanam.onrender.com/api/v1` |
| `VITE_FIREBASE_API_KEY` | Yes | Firebase web API key (publishable) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | `your_project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | `your_project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | GCM sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase app ID |

---

## 10. Data Sources & Constraints

### Data Sources

| Source | What it provides | Access method |
|---|---|---|
| Yahoo Finance | Price history, financials, info dict, FX rates, macro (^TNX) | `yfinance` Python library |
| SEC EDGAR | (Fallback, not yet implemented) | Direct HTTP |
| Damodaran (static) | Equity Risk Premium constant (5.5%) | Hardcoded constant |

### Free-Data Constraints

1. **Yahoo Finance rate limits** — yfinance has undocumented rate limits. The `_yf_with_backoff()` wrapper retries up to 3 times with exponential backoff. Aggressive concurrent fetching (e.g., 5 peers simultaneously) can still hit limits intermittently.
2. **Data quality** — Financial statement data from yfinance is sourced from Yahoo's data provider and may lag by 1-2 quarters or have occasional missing fields. All computations degrade gracefully (`None`) rather than crash.
3. **FX rates** — Live FX from yfinance pairs (e.g., `EURUSD=X`). If a pair fails, the engine falls back through inverse pair → USD triangulation → `None`. Non-standard currency pairs may not have data.
4. **Historical depth** — Maximum 5 years of daily OHLCV. Some recently-listed tickers have shorter history.

---

## 11. Key Algorithms — Deep Dive

### 11.1 Beta Calculation

```python
# 2-year weekly OLS regression vs S&P 500
stock_returns = np.diff(np.log(stock_prices))   # log returns
market_returns = np.diff(np.log(spy_prices))
beta = np.polyfit(market_returns, stock_returns, 1)[0]
beta = max(0.5, min(3.0, beta))                  # clamp to [0.5, 3.0]
```

Weekly frequency (vs daily) reduces microstructure noise. 2-year window captures recent systematic risk without over-weighting historical regimes.

### 11.2 WACC

```python
rf = get_macro_inputs()['risk_free_rate']        # ^TNX 10-yr yield
erp = 0.055                                       # Damodaran implied ERP
beta = compute_beta(ticker)

ke = rf + beta * erp                              # CAPM cost of equity

kd_gross = interest_expense / total_debt
tax_rate = 1 - (net_income / pretax_income)
kd = kd_gross * (1 - tax_rate)                   # after-tax cost of debt

market_cap = price * shares_outstanding
V = market_cap + total_debt
wacc = ke * (market_cap / V) + kd * (total_debt / V)
```

### 11.3 3-Stage DCF

```python
# Stage 1: explicit years 1-5
pv1 = sum(ufcf * (1+g1)**t / (1+wacc)**t  for t in 1..5)

# Stage 2: years 6-10 with linearly fading growth
for t in 6..10:
    growth = g1 + (g_terminal - g1) * (t-5)/5
    ufcf *= (1 + growth)
    pv2 += ufcf / (1+wacc)**t

# Terminal value (Gordon Growth)
tv = ufcf_10 * (1 + g_terminal) / (wacc - g_terminal)
pv_tv = tv / (1+wacc)**10

equity_value = pv1 + pv2 + pv_tv - net_debt
intrinsic_value_per_share = equity_value / shares_outstanding
upside_pct = (intrinsic_value - price) / price * 100
```

### 11.4 Monte Carlo (10,000 paths, vectorized)

```python
N = 10_000
rng = np.random.default_rng()

g_samples  = g1    + rng.normal(0, 0.03, N)
w_samples  = wacc  + rng.normal(0, 0.01, N)
m_samples  = margin + rng.normal(0, 0.02, N)

# Vectorized: all N paths computed simultaneously
ufcf_base = revenue * np.clip(m_samples, 0.01, 0.50)
pv = np.zeros(N)
for t in range(1, 11):
    ufcf_t = ufcf_base * (1 + np.clip(g_samples, -0.20, 0.50))**t
    pv += ufcf_t / (1 + w_samples)**t
tv = ufcf_t * (1 + g_terminal) / (w_samples - g_terminal)
pv += tv / (1 + w_samples)**10

fair_values = (pv - net_debt) / shares
percentiles = np.percentile(fair_values, [5, 25, 50, 75, 95])
prob_above_price = np.mean(fair_values > price)
```

### 11.5 Playbook — Intrinsic Value Pillar

```python
def _pillar_intrinsic(price, intrinsic):
    if intrinsic is None or price is None: return None
    mos = (intrinsic - price) / intrinsic   # margin of safety
    # Full marks at 20% discount, zero at 20% premium
    score = _clamp(-mos, -0.20, 0.20)       # _clamp inverted for mos
    return score
```

### 11.6 Playbook — Moat Pillar

```python
def _pillar_moat(info, statements):
    sector = info.get('sector', '')
    benchmark_gm = SECTOR_GROSS_MARGIN_MAP.get(sector, 0.35)
    gross_margin = gross_profit / revenue

    # Score: how much does the company beat its sector's typical margin?
    outperformance = gross_margin - benchmark_gm
    gm_score = _clamp(-outperformance, -0.15, 0.10)   # full at +15% beat

    # Stability: is the margin consistent over 3 years?
    margins = [gp/rev for last 3 years]
    stability = 1 - np.std(margins) / np.mean(margins)  # coefficient of variation
    stability_score = 5.0 if stability > 0.85 else 5.0 * stability / 0.85

    return (gm_score + stability_score) / 2
```

---

## 12. Security Architecture

### Defence-in-Depth Model

```
Layer 1 — Network:   Render HTTPS termination
Layer 2 — CORS:      Strict origin whitelist (ALLOWED_ORIGINS env var)
Layer 3 — Rate Limit: slowapi 20/min (analyze), 10/min (compare)
Layer 4 — Auth:      Firebase JWT verification on all write endpoints
Layer 5 — Database:  Firestore row-level security rules (owner-only)
Layer 6 — Secrets:   Service account never on disk in production (B64 env var)
```

### What is and isn't protected

| Endpoint | Auth Required | Rate Limited | Notes |
|---|---|---|---|
| `POST /analyze` | No | Yes (20/min) | Read-only, no user data |
| `POST /compare` | No | Yes (10/min) | Read-only, no user data |
| `GET /watchlist` | Yes | No | Returns only the authenticated user's data |
| `POST /watchlist` | Yes | No | Writes only to the authenticated user's collection |
| `DELETE /watchlist/{ticker}` | Yes | No | Deletes only from the authenticated user's collection |
| `POST /auth/sync` | Yes | No | Updates only the authenticated user's profile |

### Secret Management

| Secret | Where stored | Never in |
|---|---|---|
| Firebase service account | Render env var (`FIREBASE_SERVICE_ACCOUNT_B64`, base64) | Git, disk in prod |
| Firebase web config | Vercel env vars + local `.env` | Git (`.env.example` has placeholders only) |
| Database passwords | N/A (Firestore uses IAM) | — |

---

## 13. Design Decisions & Trade-offs

### Free-tier backend (Render)
**Decision:** Run on Render's free tier.  
**Trade-off:** 30-second cold start after 15 minutes idle. Acceptable for a side project / demo; would upgrade to paid for production use.

### No database for analysis results
**Decision:** Analysis results are not stored server-side. Each request re-fetches from Yahoo Finance.  
**Trade-off:** Slower than cached results, but avoids a database requirement and always returns fresh data.

### `headers_enabled=False` in slowapi
**Decision:** Disable `X-RateLimit-*` response headers.  
**Trade-off:** Clients can't see their remaining quota, but this was required because `_inject_headers` crashes on Pydantic model-returning routes.

### Client-side `quickScore` for peer podium
**Decision:** Compute the peer Podium score client-side from existing `/compare` payload fields rather than making N full Playbook API calls.  
**Trade-off:** Less precise than the full 40-pt Playbook, but avoids N × 30-second backend calls. The quick score blends 6 headline metrics from the already-fetched peer data.

### FX conversion server-side
**Decision:** All FX conversion happens in the backend, not the frontend.  
**Trade-off:** Requires a re-API-call on currency change, but ensures ratio/monetary invariance is enforced correctly in one place.

### Beginner/Pro mode as a session state (not persisted)
**Decision:** Mode preference is React state, not saved to Firestore.  
**Trade-off:** Resets on page reload. Acceptable since the default (Beginner) is safe for new visitors.

### `lru_cache` for financial data
**Decision:** yfinance calls are cached for the duration of a single analysis request.  
**Trade-off:** Stale data if the same ticker is re-requested within the cache lifetime. Cache is cleared between different tickers.

---

## 14. Known Limitations

1. **US-centric WACC**: The risk-free rate is always the US 10-year Treasury (`^TNX`). For non-US stocks (e.g., SAP.DE, RELIANCE.NS), a local risk-free rate would be more appropriate but isn't available from free sources without currency-specific lookups.

2. **Single-analyst ERP**: The 5.5% equity risk premium is a constant. Damodaran updates this monthly; the platform uses a fixed approximation.

3. **No real-time prices**: yfinance prices lag by ~15 minutes (Yahoo Finance's standard delay). The platform is for fundamental research, not intraday trading.

4. **Render cold starts**: The free tier backend sleeps after 15 minutes. First-user-of-the-day experiences a ~30-second wait.

5. **GBp coverage**: The pence-to-pounds conversion handles the GBp→GBP case for London-listed stocks. Other exchanges with minor unit conventions may not be covered.

6. **Earnings estimates**: Analyst consensus (forward PE, price targets) comes from yfinance's `Ticker.info` dict. This data is not always available for smaller or non-US tickers.

7. **FX triangulation depth**: The FX engine has a depth-1 triangulation guard. Exotic currency pairs that require multi-hop conversion will fall back to native-currency display.

8. **Monte Carlo normality assumption**: Growth, WACC, and margin perturbations are modelled as normally distributed. In reality, these parameters have fat tails and may be correlated.

9. **No options/derivatives data**: The platform covers equity fundamentals only. No options flow, put/call ratios, or derivatives pricing.

10. **Firebase free tier (Spark plan) limits**: Firestore has 50,000 reads/day and 20,000 writes/day on the free plan. Sufficient for a side project; would require upgrading to Blaze for scale.

---

*Documentation generated June 2026 — Dhanaṁ v1.0*  
*Built by Advaitha Parimisetti, incoming MSc Finance candidate, UCD Smurfit School of Business*
