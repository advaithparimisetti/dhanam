import concurrent.futures
import yfinance as yf
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from services.valuation import run_playbook
from services.risk import get_risk_profile
from core.security import generate_session_token, validate_token

router = APIRouter()

# Define the exact shape of the data the frontend expects
class AnalysisResponse(BaseModel):
    ticker: str
    company_name: str
    price: Optional[float]
    currency: str
    market_cap: Optional[float]
    sector: str
    scores: Dict[str, Any]
    intrinsic_value: Optional[float] = None
    valuation: Optional[Dict[str, Any]] = None   # full DCF / Monte Carlo / CCA stack
    history: List[Dict[str, Any]] = []

@router.get("/auth/token")
def get_token():
    """Generates a JWT session token for frontend clients."""
    return {"access_token": generate_session_token(), "token_type": "bearer"}

@router.get("/analyze/{ticker}", response_model=AnalysisResponse)
def analyze_stock(
    ticker: str, 
    country_code: str = "US", 
    api_key: Optional[str] = None,
    # user_id: str = Depends(validate_token) # Uncomment to protect route in production
):
    """
    Executes the fundamental playbook, runs DCF, fetches OHLC history, 
    and returns a clean JSON payload for the frontend dashboard.
    """
    try:
        res = run_playbook(ticker, country_code, api_key)
        
        return AnalysisResponse(
            ticker=res["ticker_used"],
            company_name=res["company"],
            price=res["price"],
            currency=res["currency"],
            market_cap=res["market_cap"],
            sector=res["sector"],
            intrinsic_value=res.get("intrinsic_value"),
            valuation=res.get("valuation"),
            history=res.get("history", []),
            scores={
                "undervalued_score": res["undervalued_score"],
                "multibagger_score": res["multibagger_score"],
                "details": res["undervalued_details"]
            }
        )
    except ValueError as e:
        # Catch explicit missing data errors (e.g., ticker not found)
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        # Catch unexpected mathematical or processing errors
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/risk/{ticker}")
def analyze_risk(ticker: str):
    """
    Returns the VaR, Beta, Sharpe ratio, and Drawdown for the Risk Tab.
    """
    data = get_risk_profile(ticker)
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    return data
import yfinance as yf

@router.get("/fundamentals/{ticker}")
def get_fundamentals(ticker: str):
    """
    Fetches the deep-dive profile, financial statements, analyst ratings, and news.
    """
    try:
        stock = yf.Ticker(ticker)
        info = stock.info or {}
        
        # Helper to clean Pandas DataFrames for JSON serialization
        def clean_df(df):
            if df is None or df.empty: return []
            df = df.fillna(0).reset_index()
            # Clean datetime column headers (e.g., '2023-12-31 00:00:00' -> '2023-12-31')
            df.columns = [str(c).split(" ")[0] for c in df.columns]
            return df.to_dict(orient="records")

        # Fallback news if stock.news is empty
        raw_news = stock.news if stock.news else []
        clean_news = []
        for n in raw_news[:5]:
            # Handle different yfinance news payload structures safely
            content = n.get("content", n)
            title = content.get("title", n.get("title", "No Title"))
            link = (content.get("canonicalUrl", {}) or {}).get("url") or content.get("url", n.get("link", "#"))
            publisher = content.get("provider", {}).get("displayName") if isinstance(content.get("provider"), dict) else "Yahoo Finance"
            
            clean_news.append({
                "title": title,
                "link": link,
                "publisher": publisher,
                "date": "Recent"
            })

        return {
            "profile": {
                "longBusinessSummary": info.get("longBusinessSummary", "No business summary available."),
                "fullTimeEmployees": info.get("fullTimeEmployees", "N/A"),
                "website": info.get("website", "N/A"),
                "sector": info.get("sector", "N/A"),
                "industry": info.get("industry", "N/A"),
            },
            "analyst": {
                "recommendationMean": info.get("recommendationMean"),
                "recommendationKey": info.get("recommendationKey", "N/A").replace("_", " ").title(),
                "numberOfAnalystOpinions": info.get("numberOfAnalystOpinions", "N/A"),
                "targetMeanPrice": info.get("targetMeanPrice"),
            },
            "financials": {
                "income": clean_df(stock.financials),
                "balance": clean_df(stock.balance_sheet),
                "cashflow": clean_df(stock.cashflow)
            },
            "news": clean_news
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch fundamentals: {str(e)}")


@router.get("/compare")
def compare_peers(
    base_ticker: str,
    peers: str, # Comma-separated string
):
    """
    Fetches comparative fundamental data for a base ticker and a list of peers.
    """
    try:
        # Clean and prepare the list of tickers
        peer_list = [p.strip().upper() for p in peers.split(",") if p.strip()]
        if base_ticker.upper() not in peer_list:
            peer_list.insert(0, base_ticker.upper())

        def fetch_peer_data(t_symbol):
            try:
                stock = yf.Ticker(t_symbol)
                info = stock.info or {}
                
                # Only return if we actually got valid price data
                if info.get('regularMarketPrice') or info.get('currentPrice'):
                    price = info.get('regularMarketPrice') or info.get('currentPrice')
                    return {
                        "ticker": t_symbol,
                        "company_name": info.get('shortName', t_symbol),
                        "price": price,
                        "currency": info.get('currency', 'USD'),
                        "market_cap": info.get('marketCap'),
                        "enterprise_value": info.get('enterpriseValue'),
                        "pe_ratio": info.get('trailingPE'),
                        "forward_pe": info.get('forwardPE'),
                        "pb_ratio": info.get('priceToBook'),
                        # EV multiples come straight from Yahoo's computed fields —
                        # avoids N×3 statement fetches and keeps rate-limit pressure low.
                        "ev_ebitda_ltm": info.get('enterpriseToEbitda'),
                        "ev_revenue_ltm": info.get('enterpriseToRevenue'),
                        "roe": info.get('returnOnEquity'),
                        "rev_growth": info.get('revenueGrowth'),
                        "div_yield": info.get('dividendYield', 0)
                    }
                return None
            except Exception:
                return None

        # Fetch concurrently for speed
        comparison_data = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(fetch_peer_data, peer_list))
        
        # Filter out any failed fetches
        comparison_data = [r for r in results if r is not None]

        if not comparison_data:
            raise ValueError("No valid data found for the provided tickers.")

        # Regression-based peer scoring: regress EV/EBITDA on growth & ROE across
        # the set; names below their quality-implied multiple score as "cheap".
        from services.valuation import peer_regression_score
        comparison_data = peer_regression_score(comparison_data)

        return {"peers": comparison_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")