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

## Local Development

### Prerequisites
- Python 3.12+
- Node.js 18+
- A Firebase project (free Spark plan is sufficient)

### 1. Clone the repo
```bash
git clone https://github.com/advaithparimisetti/dhanam.git
cd dhanam
```

### 2. Backend setup
```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:
```
ALLOWED_ORIGINS=http://localhost:5173
# Optional — only needed for watchlist / auth features:
# FIREBASE_SERVICE_ACCOUNT_B64=<base64 of your service account JSON>
```

Start the server:
```bash
uvicorn main:app --reload --port 8000
```

API available at `http://localhost:8000/api/v1`

### 3. Frontend setup
```bash
cd frontend
npm install
```

Copy the env template and fill in your Firebase web config:
```bash
cp .env.example .env
```

Edit `frontend/.env`:
```
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Start the dev server:
```bash
npm run dev
```

App available at `http://localhost:5173`

---

## Deployment

### Backend → Render
1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo, set **Root Directory** to `backend/`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Set environment variables in the Render dashboard:

| Variable | Value |
|---|---|
| `ALLOWED_ORIGINS` | Your Vercel URL, e.g. `https://dhanam-three.vercel.app` |
| `FIREBASE_SERVICE_ACCOUNT_B64` | `base64` of your Firebase service account JSON |

### Frontend → Vercel
1. Import the repo on [vercel.com](https://vercel.com), set **Root Directory** to `frontend/`
2. Add all `VITE_*` environment variables from your `.env` file
3. Set `VITE_API_BASE_URL` to your Render service URL + `/api/v1`
4. Deploy

### Firestore Security Rules
Paste the contents of `firestore.rules` into **Firebase Console → Firestore → Rules → Publish**.

---

## Environment Variables

See [`frontend/.env.example`](frontend/.env.example) for the frontend template.  
See [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) for the full environment variable reference.

---

## Project Structure

```
dhanam/
├── backend/          # FastAPI app, valuation engine, risk engine, FX engine
│   ├── api/          # Route handlers
│   ├── core/         # Auth, rate limiting
│   └── services/     # Valuation, risk, data fetching, watchlist, Firebase
├── frontend/         # React / Vite / Tailwind
│   └── src/
│       ├── components/dashboard/   # 6 analysis tabs
│       ├── context/                # Auth + Mode (Beginner/Pro) contexts
│       └── api/                    # Axios client
├── docs/
│   └── DOCUMENTATION.md  # Full technical documentation
└── firestore.rules       # Firestore security rules
```

---

## Data Sources

All data is **100% free** — no paid API keys required.

- **Yahoo Finance** via `yfinance` — price history, financials, FX rates, macro data
- **FRED** — 10-year US Treasury yield (risk-free rate) via `^TNX`
- **Damodaran** — Equity Risk Premium constant (5.5%, updated periodically)

---

## Disclaimer

⚠️ **Educational use only.** Dhanaṁ generates valuations using automated quantitative models for informational and educational purposes. This is not certified financial advice. Always conduct independent due diligence before making investment decisions.

---

## Author

**Advaitha Parimisetti**  
Incoming MSc Finance candidate · UCD Michael Smurfit Graduate Business School
