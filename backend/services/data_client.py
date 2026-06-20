import requests
import time
import random
import threading
from collections import deque
import pandas as pd
import yfinance as yf
from bs4 import BeautifulSoup
from functools import lru_cache
from datetime import datetime
from services.utils import safe_numeric, COUNTRY_SUFFIX_MAP

SECURE_REQUEST_HEADERS = {
    "User-Agent": "DhanamEngine/1.0 (Institutional Research Tool)",
    "Accept": "application/json, text/html, */*",
}

_YF_SEMAPHORE = threading.Semaphore(2)
_YF_GLOBAL_LOCK = threading.Lock()
_YF_CALL_TIMES = deque(maxlen=60)
_YF_MAX_CALLS_PER_MINUTE = 10

def secure_get(url: str, timeout: int = 10, max_retries: int = 3, **kwargs) -> requests.Response:
    headers = {**SECURE_REQUEST_HEADERS, **kwargs.pop("headers", {})}
    last_exc = None
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=headers, timeout=timeout, **kwargs)
            if resp.status_code == 429:
                time.sleep(int(resp.headers.get("Retry-After", (2 ** attempt))))
                continue
            return resp
        except Exception as exc:
            last_exc = exc
            time.sleep((2 ** attempt) + random.uniform(0, 1))
    raise last_exc

def _yf_global_throttle():
    with _YF_GLOBAL_LOCK:
        now = time.monotonic()
        while _YF_CALL_TIMES and now - _YF_CALL_TIMES[0] > 60:
            _YF_CALL_TIMES.popleft()
        if len(_YF_CALL_TIMES) >= _YF_MAX_CALLS_PER_MINUTE:
            sleep_for = 60 - (now - _YF_CALL_TIMES[0]) + 0.1
            time.sleep(max(sleep_for, 0))
        _YF_CALL_TIMES.append(time.monotonic())

def _yf_with_backoff(fn, *args, max_retries: int = 4, **kwargs):
    last_exc = None
    for attempt in range(max_retries):
        _yf_global_throttle()
        with _YF_SEMAPHORE:
            time.sleep(random.uniform(0.4, 1.2) * (attempt + 1))
            try:
                return fn(*args, **kwargs)
            except Exception as exc:
                last_exc = exc
                if attempt < max_retries - 1:
                    time.sleep((2 ** attempt) + random.uniform(0, 1.5))
                    continue
                break
    raise last_exc

@lru_cache(maxsize=128)
def fetch_info_with_variants(base_ticker: str, country_code: str, api_key: str):
    variants = []
    if "." in base_ticker: variants.append(base_ticker)
    suffixes = COUNTRY_SUFFIX_MAP.get(country_code, [])
    for s in suffixes: variants.append(f"{base_ticker}{s}")
    variants.append(base_ticker)
    if base_ticker.upper() not in variants: variants.append(base_ticker.upper())

    if not api_key:
        for vt in variants:
            try:
                obj = yf.Ticker(vt)
                raw = _yf_with_backoff(lambda: obj.info or {})
                if raw and raw.get("regularMarketPrice"):
                    return raw, vt
            except: continue
        raise ValueError("No usable data found on yfinance fallback.")

    for variant in variants:
        try:
            prof_url = f"https://financialmodelingprep.com/api/v3/profile/{variant}?apikey={api_key}"
            prof_res = secure_get(prof_url).json()
            if isinstance(prof_res, dict) and "Error Message" in prof_res:
                raise ValueError(f"FMP API Error: {prof_res['Error Message']}")
            if prof_res and isinstance(prof_res, list):
                prof = prof_res[0]
                km_res = secure_get(f"https://financialmodelingprep.com/api/v3/key-metrics-ttm/{variant}?apikey={api_key}").json()
                km = km_res[0] if km_res and isinstance(km_res, list) else {}
                
                info = {
                    "regularMarketPrice": prof.get("price"),
                    "marketCap": prof.get("mktCap"),
                    "currency": prof.get("currency"),
                    "symbol": prof.get("symbol"),
                    "shortName": prof.get("companyName"),
                    "sector": prof.get("sector"),
                    "industry": prof.get("industry"),
                    "beta": prof.get("beta"),
                    "trailingPE": km.get("peRatioTTM"),
                    "priceToBook": km.get("pbRatioTTM"),
                    "returnOnEquity": km.get("roeTTM"),
                    "returnOnAssets": km.get("roaTTM"),
                    "returnOnInvestment": km.get("roicTTM"),
                    "debtToEquity": km.get("debtToEquityTTM"),
                    "revenueGrowth": km.get("revenuePerShareTTM"),
                    "payoutRatio": km.get("payoutRatioTTM"),
                }
                return info, variant
        except: continue
    raise ValueError(f"No usable data found. Tried variants: {variants}")

# ---------------------------------------------------------------------------
# Macro & market-data layer (100% free sources)
# ---------------------------------------------------------------------------
# Executive call: the entire WACC/CAPM stack needs three macro inputs — a
# risk-free rate, an equity-risk premium (ERP), and an effective tax rate.
# We source the risk-free rate live from the CBOE 10Y Treasury yield index
# (^TNX on Yahoo, free, no key). ERP is held as a Damodaran-style mature-market
# constant with a light country add-on (his implied ERP datasets are not a
# free *API*, so a documented constant is the institutionally-defensible proxy).
# Results are cached with a TTL so a burst of requests hits Yahoo once.

import math as _math

_MACRO_TTL_SECONDS = 60 * 60 * 6          # refresh macro inputs every 6h
_HIST_TTL_SECONDS = 60 * 30               # price history cache 30m
_macro_cache = {}                         # key -> (expiry_ts, payload)
_hist_cache = {}                          # key -> (expiry_ts, DataFrame)
_cache_lock = threading.Lock()

# Damodaran-style country equity risk premium add-on over a mature (US) base.
# Base mature-market ERP ~5.0%; emerging markets carry a sovereign-spread add-on.
_BASE_ERP = 0.050
_COUNTRY_ERP_ADDON = {
    "US": 0.000, "GB": 0.006, "DE": 0.005, "FR": 0.008, "CA": 0.005,
    "AU": 0.006, "HK": 0.008, "JP": 0.008, "SG": 0.006, "CH": 0.000,
    "NL": 0.005, "SE": 0.005, "IT": 0.020, "IN": 0.029,
}


def get_price_history(ticker: str, period: str = "2y", interval: str = "1d") -> pd.DataFrame:
    """Cached, back-off-protected OHLCV fetch. Returns an empty frame on failure
    rather than raising — callers degrade gracefully."""
    key = f"{ticker}|{period}|{interval}"
    now = time.monotonic()
    with _cache_lock:
        cached = _hist_cache.get(key)
        if cached and cached[0] > now:
            return cached[1]
    try:
        obj = yf.Ticker(ticker)
        df = _yf_with_backoff(lambda: obj.history(period=period, interval=interval))
        if df is None:
            df = pd.DataFrame()
    except Exception:
        df = pd.DataFrame()
    with _cache_lock:
        _hist_cache[key] = (now + _HIST_TTL_SECONDS, df)
    return df


def get_risk_free_rate(default: float = 0.042) -> float:
    """Live 10Y US Treasury yield via ^TNX. Falls back to a sane default if the
    feed is down. ^TNX is quoted as the yield itself (e.g. 4.25 => 4.25%)."""
    try:
        df = get_price_history("^TNX", period="5d", interval="1d")
        if df is not None and not df.empty and "Close" in df:
            val = float(df["Close"].dropna().iloc[-1])
            if val > 20:           # guard against the legacy ×10 quoting convention
                val /= 10.0
            rf = val / 100.0
            if 0.0 < rf < 0.15:
                return rf
    except Exception:
        pass
    return default


def get_equity_risk_premium(country_code: str = "US") -> float:
    return _BASE_ERP + _COUNTRY_ERP_ADDON.get((country_code or "US").upper(), 0.015)


def get_macro_inputs(country_code: str = "US") -> dict:
    """Bundles the macro stack (rf, ERP, default tax) with TTL caching."""
    key = (country_code or "US").upper()
    now = time.monotonic()
    with _cache_lock:
        cached = _macro_cache.get(key)
        if cached and cached[0] > now:
            return cached[1]
    payload = {
        "risk_free_rate": get_risk_free_rate(),
        "equity_risk_premium": get_equity_risk_premium(key),
        "default_tax_rate": 0.21,          # US statutory federal rate as neutral prior
        "country_code": key,
    }
    with _cache_lock:
        _macro_cache[key] = (now + _MACRO_TTL_SECONDS, payload)
    return payload


def compute_beta(ticker: str, benchmark: str = "^GSPC", period: str = "2y"):
    """Raw (levered) beta from an OLS-equivalent cov/var on *weekly* returns.
    Weekly sampling reduces microstructure noise vs daily while keeping ~100 obs
    over 2y — standard buy-side practice. Returns None if data is too thin."""
    try:
        s = get_price_history(ticker, period=period, interval="1wk")
        b = get_price_history(benchmark, period=period, interval="1wk")
        if s.empty or b.empty:
            return None
        sr = s["Close"].pct_change().dropna()
        br = b["Close"].pct_change().dropna()
        common = sr.index.intersection(br.index)
        sr, br = sr.loc[common], br.loc[common]
        if len(sr) < 30:
            return None
        var = float(np.var(br))
        if var == 0:
            return None
        beta = float(np.cov(sr, br)[0][1] / var)
        return beta if _math.isfinite(beta) else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Foreign-exchange normalization
# ---------------------------------------------------------------------------
# Some venues quote share PRICE in a minor unit (GBp = pence) while market cap
# and financial statements are in the MAJOR unit (GBP). We resolve the ISO major
# code + a minor→major factor so callers can normalize price-like fields before
# any FX conversion. FX rates come from yfinance currency pairs (e.g. EURUSD=X),
# with inverse-pair and USD-triangulation fallbacks, all guarded (None on fail).

_MINOR_UNIT = {
    "GBP": ("GBP", 1.0), "GBX": ("GBP", 0.01), "GBp": ("GBP", 0.01),
    "ZAC": ("ZAR", 0.01), "ZAc": ("ZAR", 0.01),
    "ILA": ("ILS", 0.01), "ILa": ("ILS", 0.01),
}


def resolve_currency(ccy: str):
    """Return (major_iso_code, price_minor_factor). e.g. 'GBp' -> ('GBP', 0.01)."""
    if not ccy:
        return "USD", 1.0
    c = ccy.strip()
    if c in _MINOR_UNIT:
        return _MINOR_UNIT[c]
    return c.upper(), 1.0


def _fx_pair_last(pair: str):
    df = get_price_history(pair, period="5d", interval="1d")
    if df is not None and not df.empty and "Close" in df:
        v = df["Close"].dropna()
        if not v.empty:
            val = float(v.iloc[-1])
            if _math.isfinite(val) and val > 0:
                return val
    return None


def get_fx_rate(from_ccy: str, to_ccy: str, _depth: int = 0):
    """Live FX multiplier: amount_in_from * rate = amount_in_to. Returns None if
    no reliable rate is obtainable (callers then skip conversion gracefully)."""
    f, _ = resolve_currency(from_ccy)
    t, _ = resolve_currency(to_ccy)
    if f == t:
        return 1.0

    direct = _fx_pair_last(f"{f}{t}=X")          # e.g. EURUSD=X gives EUR→USD
    if direct:
        return direct
    inverse = _fx_pair_last(f"{t}{f}=X")
    if inverse:
        return 1.0 / inverse

    # Triangulate through USD (one hop; guard against recursion).
    if _depth == 0 and f != "USD" and t != "USD":
        a = get_fx_rate(f, "USD", _depth=1)
        b = get_fx_rate("USD", t, _depth=1)
        if a and b:
            rate = a * b
            if 1e-6 < rate < 1e6:
                return rate
    return None


def get_financial_statements(ticker: str) -> dict:
    """Fetches the three annual statements as DataFrames (most-recent column
    first), each independently guarded so a single failure never aborts the set."""
    obj = yf.Ticker(ticker)
    out = {}
    for key, fn in (
        ("income", lambda: obj.financials),
        ("cashflow", lambda: obj.cashflow),
        ("balance", lambda: obj.balance_sheet),
    ):
        try:
            df = _yf_with_backoff(fn)
            out[key] = df if isinstance(df, pd.DataFrame) else pd.DataFrame()
        except Exception:
            out[key] = pd.DataFrame()
    return out


class FMP_Ticker:
    def __init__(self, ticker, api_key):
        self.ticker = ticker
        self.api_key = api_key
        
    def get_financials(self):
        if self.api_key:
            url = f"https://financialmodelingprep.com/api/v3/income-statement/{self.ticker}?limit=5&apikey={self.api_key}"
            try:
                data = secure_get(url).json()
                df = pd.DataFrame(data).set_index('date').transpose()
                df.rename(index={'revenue': 'Total Revenue', 'ebitda': 'EBITDA'}, inplace=True)
                return df
            except: pass
        obj = yf.Ticker(self.ticker)
        return _yf_with_backoff(lambda: obj.financials)