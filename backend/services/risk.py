"""
Dhanaṁ — Advanced Risk Engine
==============================

Institutional risk analytics on free Yahoo data. All ratios are annualised
(√252 daily scaling) and individually guarded — a degenerate input yields
`None` for that single metric, never an exception.

Metrics
-------
  Beta            cov(stock, mkt) / var(mkt)              (systematic risk)
  Sharpe          excess return / total volatility         (return per unit total risk)
  Sortino         excess return / downside deviation        (penalises only downside)
  Treynor         excess return / beta                      (return per unit systematic risk)
  VaR 95%         5th-percentile daily return               (parametric-free, historical)
  CVaR 95%        mean loss beyond VaR                       (expected shortfall / tail risk)
  Max Drawdown    worst peak-to-trough decline
  Calmar          annual return / |max drawdown|
"""

import numpy as np

from services.data_client import get_price_history, get_macro_inputs, compute_beta

TRADING_DAYS = 252


def _r(x, n=4):
    """Round + JSON-safe (NaN/inf → None)."""
    if x is None:
        return None
    x = float(x)
    return round(x, n) if np.isfinite(x) else None


def get_risk_profile(ticker: str, benchmark: str = "^GSPC", period: str = "1y"):
    try:
        stock_hist = get_price_history(ticker, period=period, interval="1d")
        bench_hist = get_price_history(benchmark, period=period, interval="1d")
        if stock_hist.empty:
            return {"error": "Insufficient historical data for risk analytics."}

        stock_close = stock_hist["Close"].dropna()
        stock_returns = stock_close.pct_change().dropna()
        if stock_returns.empty:
            return {"error": "Insufficient return observations."}

        # Live risk-free rate, converted to a daily figure for excess-return math.
        macro = get_macro_inputs("US")
        rf_annual = macro["risk_free_rate"]
        rf_daily = rf_annual / TRADING_DAYS
        excess = stock_returns - rf_daily

        # --- Systematic risk (beta) — reuse the shared weekly-OLS estimator,
        #     fall back to daily covariance over the aligned window. ---
        beta = compute_beta(ticker, benchmark)
        if beta is None and not bench_hist.empty:
            bench_returns = bench_hist["Close"].pct_change().dropna()
            common = stock_returns.index.intersection(bench_returns.index)
            if len(common) > 20:
                sr, br = stock_returns.loc[common], bench_returns.loc[common]
                var = float(np.var(br))
                beta = float(np.cov(sr, br)[0][1] / var) if var > 0 else None

        # --- Volatility-based ratios ---
        ann_excess = float(excess.mean()) * TRADING_DAYS
        total_vol = float(stock_returns.std()) * np.sqrt(TRADING_DAYS)
        sharpe = ann_excess / total_vol if total_vol > 0 else None

        downside = excess[excess < 0]
        downside_dev = float(downside.std()) * np.sqrt(TRADING_DAYS) if len(downside) > 1 else None
        sortino = ann_excess / downside_dev if downside_dev and downside_dev > 0 else None

        treynor = ann_excess / beta if beta and beta != 0 else None

        # --- Tail risk: historical VaR & Conditional VaR (Expected Shortfall) ---
        var_95 = float(np.percentile(stock_returns, 5))
        tail = stock_returns[stock_returns <= var_95]
        cvar_95 = float(tail.mean()) if len(tail) > 0 else None

        # --- Drawdown & Calmar ---
        roll_max = stock_close.cummax()
        drawdowns = (stock_close - roll_max) / roll_max
        max_drawdown = float(drawdowns.min())
        ann_return = float(stock_returns.mean()) * TRADING_DAYS
        calmar = ann_return / abs(max_drawdown) if max_drawdown < 0 else None

        return {
            "ticker": ticker,
            "benchmark": benchmark,
            "period": period,
            "observations": int(len(stock_returns)),
            "risk_free_rate": _r(rf_annual),
            "annualized_return": _r(ann_return),
            "annualized_volatility": _r(total_vol),
            "downside_deviation": _r(downside_dev),
            "beta": _r(beta, 3),
            "sharpe_ratio": _r(sharpe, 2),
            "sortino_ratio": _r(sortino, 2),
            "treynor_ratio": _r(treynor, 4),
            "calmar_ratio": _r(calmar, 2),
            "var_95": _r(var_95),
            "cvar_95": _r(cvar_95),
            "max_drawdown": _r(max_drawdown),
        }
    except Exception as e:
        return {"error": str(e)}
