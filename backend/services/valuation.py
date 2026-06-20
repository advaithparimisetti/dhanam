"""
Dhanaṁ — Institutional Valuation Engine
=======================================

Wall-Street-grade intrinsic valuation built exclusively on free data
(yfinance / Yahoo). Every block degrades gracefully: a missing line item
narrows the model, it never crashes the request.

Pipeline
--------
1. Dynamic WACC via CAPM
     Cost of equity = rf + β·ERP            (rf live from ^TNX, β from 2y weekly OLS)
     Cost of debt   = interest / total debt (after-tax), credit-spread fallback
     WACC           = E/V·Re + D/V·Rd(1-t)
2. Explicit Unlevered Free Cash Flow (UFCF)
     UFCF = EBIT·(1-t) + D&A − CapEx − ΔNWC
3. 3-Stage DCF
     Stage 1 (Y1-5)  : explicit high growth
     Stage 2 (Y6-10) : linear fade to terminal growth
     Stage 3         : Gordon terminal value
4. Monte Carlo (10,000 iters, vectorised numpy)
     joint shocks on growth, UFCF margin, WACC and terminal growth →
     a probability-weighted intrinsic-value distribution.
5. Comparable Company Analysis (CCA)
     LTM/NTM EV/EBITDA, EV/Revenue, P/E + a regression-based peer cheapness score.

Author: Dhanaṁ Quant Core
"""

import math
from datetime import datetime, timezone

import numpy as np
import yfinance as yf

from services.data_client import (
    fetch_info_with_variants,
    get_macro_inputs,
    get_financial_statements,
    get_price_history,
    compute_beta,
)
from services.utils import safe_numeric, SECTOR_PE_MAP

# Projection horizon: two explicit 5-year stages then a perpetuity.
STAGE1_YEARS = 5
STAGE2_YEARS = 5
HORIZON = STAGE1_YEARS + STAGE2_YEARS
MC_ITERATIONS = 10_000


# ---------------------------------------------------------------------------
# Statement helpers
# ---------------------------------------------------------------------------
def _latest(df, *names):
    """Return the most-recent value of the first matching row (case-insensitive,
    substring-tolerant). yfinance orders columns most-recent-first."""
    if df is None or getattr(df, "empty", True):
        return None
    index_map = {str(i).lower(): i for i in df.index}
    for name in names:
        key = name.lower()
        match = index_map.get(key)
        if match is None:
            match = next((index_map[k] for k in index_map if key in k), None)
        if match is None:
            continue
        for v in df.loc[match].values:           # walk newest → oldest, skip NaNs
            fv = safe_numeric(v)
            if fv is not None and math.isfinite(fv):
                return fv
    return None


def _series(df, *names):
    """Full historical row (newest→oldest) as a clean float list — used for CAGRs."""
    if df is None or getattr(df, "empty", True):
        return []
    index_map = {str(i).lower(): i for i in df.index}
    for name in names:
        key = name.lower()
        match = index_map.get(key) or next((index_map[k] for k in index_map if key in k), None)
        if match is not None:
            vals = [safe_numeric(v) for v in df.loc[match].values]
            return [v for v in vals if v is not None and math.isfinite(v)]
    return []


def _effective_tax_rate(income, default=0.21):
    tax = _latest(income, "Tax Provision", "Income Tax Expense")
    pretax = _latest(income, "Pretax Income", "Income Before Tax")
    if tax and pretax and pretax > 0:
        t = tax / pretax
        if 0.0 <= t <= 0.45:
            return t
    return default


def _total_debt(balance):
    td = _latest(balance, "Total Debt")
    if td is not None:
        return td
    ltd = _latest(balance, "Long Term Debt", "Long Term Debt And Capital Lease") or 0.0
    std = _latest(balance, "Current Debt", "Short Term Debt", "Current Debt And Capital Lease") or 0.0
    return ltd + std


def _cash(balance):
    return (
        _latest(balance, "Cash And Cash Equivalents",
                "Cash Cash Equivalents And Short Term Investments",
                "Cash Financial") or 0.0
    )


# ---------------------------------------------------------------------------
# 1. WACC (CAPM)
# ---------------------------------------------------------------------------
def compute_wacc(info, statements, macro, beta):
    rf = macro["risk_free_rate"]
    erp = macro["equity_risk_premium"]

    raw_beta = beta if beta is not None else safe_numeric(info.get("beta"))
    raw_beta = raw_beta if raw_beta is not None else 1.0
    beta_used = max(0.30, min(raw_beta, 2.50))      # clamp pathological/illiquid betas
    cost_equity = rf + beta_used * erp

    income, balance = statements.get("income"), statements.get("balance")
    tax = _effective_tax_rate(income, macro["default_tax_rate"])

    total_debt = _total_debt(balance) or 0.0
    interest = abs(_latest(income, "Interest Expense", "Interest Expense Non Operating") or 0.0)
    if total_debt > 0 and interest > 0:
        pretax_cost_debt = interest / total_debt
    else:
        # Credit-spread proxy: rf + spread scaled by leverage when we lack interest data.
        pretax_cost_debt = rf + 0.015
    pretax_cost_debt = max(rf, min(pretax_cost_debt, 0.15))
    after_tax_cost_debt = pretax_cost_debt * (1 - tax)

    equity_val = safe_numeric(info.get("marketCap")) or 0.0
    V = equity_val + total_debt
    if V <= 0:
        wacc = cost_equity
        we, wd = 1.0, 0.0
    else:
        we, wd = equity_val / V, total_debt / V
        wacc = we * cost_equity + wd * after_tax_cost_debt

    wacc = max(0.05, min(wacc, 0.20))               # institutional sanity band
    return wacc, {
        "wacc": round(wacc, 4),
        "cost_of_equity": round(cost_equity, 4),
        "cost_of_debt_after_tax": round(after_tax_cost_debt, 4),
        "risk_free_rate": round(rf, 4),
        "equity_risk_premium": round(erp, 4),
        "beta_raw": round(raw_beta, 3),
        "beta_used": round(beta_used, 3),
        "tax_rate": round(tax, 4),
        "weight_equity": round(we, 3),
        "weight_debt": round(wd, 3),
    }


# ---------------------------------------------------------------------------
# 2. Unlevered Free Cash Flow
# ---------------------------------------------------------------------------
def compute_base_ufcf(statements, tax):
    """Explicit UFCF for the latest fiscal year, with layered fallbacks.
    Returns (ufcf, revenue, components_dict)."""
    income, cf = statements.get("income"), statements.get("cashflow")

    revenue = _latest(income, "Total Revenue", "Operating Revenue")
    ebit = _latest(income, "Operating Income", "EBIT")
    da = _latest(cf, "Depreciation And Amortization",
                 "Depreciation Amortization Depletion", "Depreciation") or 0.0
    capex = _latest(cf, "Capital Expenditure", "Capital Expenditures") or 0.0       # already negative
    d_nwc = _latest(cf, "Change In Working Capital", "Changes In Working Capital") or 0.0  # cash-effect sign

    components = {"revenue": revenue, "ebit": ebit, "d_and_a": da,
                  "capex": capex, "change_in_nwc": d_nwc, "tax_rate": tax}

    if ebit is not None:
        nopat = ebit * (1 - tax)
        # capex stored negative, d_nwc already a cash effect → straight addition.
        ufcf = nopat + da - abs(capex) + d_nwc
        components["method"] = "ebit_buildup"
        return ufcf, revenue, components

    # Fallback A: operating cash flow − capex (FCFF approximation, ignores interest tax shield)
    ocf = _latest(cf, "Operating Cash Flow", "Total Cash From Operating Activities", "Cash Flow From Operations")
    if ocf is not None:
        ufcf = ocf - abs(capex)
        components["method"] = "ocf_less_capex"
        return ufcf, revenue, components

    # Fallback B: free cash flow line if present
    fcf = _latest(cf, "Free Cash Flow")
    if fcf is not None:
        components["method"] = "reported_fcf"
        return fcf, revenue, components

    components["method"] = "unavailable"
    return None, revenue, components


# ---------------------------------------------------------------------------
# 3 & 4. DCF engine (vectorised so Monte Carlo is a single numpy pass)
# ---------------------------------------------------------------------------
def _dcf_per_share(base_ufcf, g1, g_term, wacc, net_debt, shares):
    """Vectorised 3-stage DCF. g1, g_term, wacc are arrays of shape (N,);
    returns an (N,) array of intrinsic value per share."""
    g1 = np.atleast_1d(g1).astype(float)
    g_term = np.atleast_1d(g_term).astype(float)
    wacc = np.atleast_1d(wacc).astype(float)
    n = g1.shape[0]

    # Build the (N, HORIZON) growth schedule: flat in stage 1, linear fade in stage 2.
    sched = np.empty((n, HORIZON))
    sched[:, :STAGE1_YEARS] = g1[:, None]
    for j in range(STAGE2_YEARS):
        frac = (j + 1) / STAGE2_YEARS
        sched[:, STAGE1_YEARS + j] = g1 + (g_term - g1) * frac

    growth_factor = np.cumprod(1.0 + sched, axis=1)         # (N, HORIZON)
    # base_ufcf may be scalar (deterministic) or (N,) array (Monte Carlo margin
    # shocks) — reshape to a column so it broadcasts across the horizon axis.
    base = np.atleast_1d(base_ufcf).astype(float).reshape(-1, 1)
    ufcf = base * growth_factor
    years = np.arange(1, HORIZON + 1)
    discount = (1.0 + wacc[:, None]) ** years[None, :]
    pv_explicit = np.sum(ufcf / discount, axis=1)

    # Gordon terminal value on the last explicit UFCF; guard wacc>g_term.
    spread = wacc - g_term
    safe = spread > 1e-4
    tv = np.where(safe, ufcf[:, -1] * (1.0 + g_term) / np.where(safe, spread, np.nan), 0.0)
    pv_tv = tv / (1.0 + wacc) ** HORIZON

    enterprise_value = pv_explicit + pv_tv
    equity_value = enterprise_value - net_debt
    return equity_value / shares


def run_dcf(info, statements, macro, beta):
    """Deterministic base-case 3-stage DCF. Returns a rich dict or an error stub."""
    wacc, wacc_detail = compute_wacc(info, statements, macro, beta)
    tax = wacc_detail["tax_rate"]
    base_ufcf, revenue, ufcf_components = compute_base_ufcf(statements, tax)

    shares = safe_numeric(info.get("sharesOutstanding"))
    price = safe_numeric(info.get("regularMarketPrice"))
    net_debt = (_total_debt(statements.get("balance")) or 0.0) - _cash(statements.get("balance"))

    if not base_ufcf or base_ufcf <= 0 or not shares or shares <= 0:
        return {
            "status": "degraded",
            "reason": "Non-positive or unavailable UFCF / share count — DCF not meaningful.",
            "wacc_detail": wacc_detail,
            "ufcf_components": ufcf_components,
        }

    # Stage-1 growth: blend reported revenue growth with realised revenue CAGR,
    # capped to a defensible institutional band [3%, 25%].
    rev_series = _series(statements.get("income"), "Total Revenue", "Operating Revenue")
    cagr = None
    if len(rev_series) >= 3 and rev_series[-1] and rev_series[0] and rev_series[-1] > 0:
        cagr = (rev_series[0] / rev_series[-1]) ** (1 / (len(rev_series) - 1)) - 1
    reported_g = safe_numeric(info.get("revenueGrowth"))
    candidates = [g for g in (reported_g, cagr) if g is not None]
    g1 = float(np.mean(candidates)) if candidates else 0.08
    g1 = max(0.03, min(g1, 0.25))

    # Terminal growth anchored to (but capped below) the risk-free rate — a mature
    # company cannot outgrow the economy in perpetuity.
    g_term = max(0.015, min(macro["risk_free_rate"] * 0.6, 0.03))

    intrinsic = float(_dcf_per_share(base_ufcf, [g1], [g_term], [wacc], net_debt, shares)[0])
    upside = (intrinsic / price - 1.0) if price else None

    return {
        "status": "ok",
        "intrinsic_value_per_share": round(intrinsic, 2),
        "current_price": price,
        "upside_pct": round(upside * 100, 2) if upside is not None else None,
        "base_ufcf": round(base_ufcf, 0),
        "ufcf_margin": round(base_ufcf / revenue, 4) if revenue else None,
        "stage1_growth": round(g1, 4),
        "terminal_growth": round(g_term, 4),
        "net_debt": round(net_debt, 0),
        "shares_outstanding": shares,
        "wacc": round(wacc, 4),
        "wacc_detail": wacc_detail,
        "ufcf_components": ufcf_components,
        # carry raw inputs so Monte Carlo reuses them without re-fetching
        "_mc_inputs": {"base_ufcf": base_ufcf, "g1": g1, "g_term": g_term,
                       "wacc": wacc, "net_debt": net_debt, "shares": shares, "price": price},
    }


def run_monte_carlo(mc_inputs, iterations=MC_ITERATIONS, seed=42):
    """10,000-path probability-weighted valuation. Joint shocks on growth, WACC and
    terminal growth; UFCF margin enters via a multiplicative shock on base UFCF."""
    if not mc_inputs:
        return {"status": "degraded", "reason": "DCF base case unavailable."}

    rng = np.random.default_rng(seed)
    base_ufcf = mc_inputs["base_ufcf"]
    g1, g_term, wacc = mc_inputs["g1"], mc_inputs["g_term"], mc_inputs["wacc"]
    net_debt, shares, price = mc_inputs["net_debt"], mc_inputs["shares"], mc_inputs["price"]

    # Distribution widths reflect forecast uncertainty, not market noise.
    g1_s = rng.normal(g1, max(0.02, abs(g1) * 0.30), iterations)
    gt_s = np.clip(rng.normal(g_term, 0.004, iterations), 0.0, 0.035)
    wacc_s = np.clip(rng.normal(wacc, 0.0125, iterations), 0.05, 0.22)
    margin_shock = rng.normal(1.0, 0.12, iterations)          # ±12% on realised UFCF margin
    gt_s = np.minimum(gt_s, wacc_s - 0.005)                   # enforce convergence

    vals = _dcf_per_share(base_ufcf * margin_shock, g1_s, gt_s, wacc_s, net_debt, shares)
    vals = vals[np.isfinite(vals)]
    vals = vals[vals > 0]                                     # discard degenerate negative-equity paths
    if vals.size < 100:
        return {"status": "degraded", "reason": "Too few valid simulation paths."}

    p5, p25, p50, p75, p95 = np.percentile(vals, [5, 25, 50, 75, 95])
    return {
        "status": "ok",
        "iterations": int(vals.size),
        "mean": round(float(vals.mean()), 2),
        "median": round(float(p50), 2),
        "std_dev": round(float(vals.std()), 2),
        "percentiles": {
            "p5": round(float(p5), 2), "p25": round(float(p25), 2),
            "p50": round(float(p50), 2), "p75": round(float(p75), 2),
            "p95": round(float(p95), 2),
        },
        "prob_above_price": round(float((vals > price).mean()), 4) if price else None,
        "confidence_interval_90": [round(float(p5), 2), round(float(p95), 2)],
    }


# ---------------------------------------------------------------------------
# 5. Comparable Company Analysis
# ---------------------------------------------------------------------------
def compute_multiples(info, statements):
    """LTM trading multiples for a single name + the building blocks CCA needs."""
    mcap = safe_numeric(info.get("marketCap")) or 0.0
    income = statements.get("income")
    net_debt = (_total_debt(statements.get("balance")) or 0.0) - _cash(statements.get("balance"))
    ev = mcap + net_debt

    ebit = _latest(income, "Operating Income", "EBIT")
    da = _latest(statements.get("cashflow"), "Depreciation And Amortization", "Depreciation") or 0.0
    ebitda = _latest(income, "EBITDA")
    if ebitda is None and ebit is not None:
        ebitda = ebit + da
    revenue = _latest(income, "Total Revenue", "Operating Revenue")

    return {
        "enterprise_value": round(ev, 0) if ev else None,
        "ev_ebitda_ltm": round(ev / ebitda, 2) if ebitda and ebitda > 0 else None,
        "ev_revenue_ltm": round(ev / revenue, 2) if revenue and revenue > 0 else None,
        "pe_ltm": safe_numeric(info.get("trailingPE")),
        "pe_ntm": safe_numeric(info.get("forwardPE")),     # forward P/E ≈ NTM proxy
        "peg": safe_numeric(info.get("pegRatio")),
        "roe": safe_numeric(info.get("returnOnEquity")),
        "rev_growth": safe_numeric(info.get("revenueGrowth")),
    }


def peer_regression_score(peers):
    """Regression-based cheapness scoring. We regress EV/EBITDA on growth and ROE
    across the peer set; a name trading *below* its quality-implied multiple
    (negative residual) is statistically cheap. Returns peers annotated with a
    z-scored cheapness score. Pure numpy (least-squares) — no scipy dependency.

    `peers`: list of dicts with keys ev_ebitda_ltm, rev_growth, roe, ticker.
    """
    rows = [p for p in peers
            if p.get("ev_ebitda_ltm") and p.get("ev_ebitda_ltm") > 0]
    if len(rows) < 4:                                   # regression needs degrees of freedom
        for p in peers:
            p["cheapness_score"] = None
        return peers

    y = np.array([p["ev_ebitda_ltm"] for p in rows], dtype=float)
    g = np.array([safe_numeric(p.get("rev_growth")) or 0.0 for p in rows], dtype=float)
    r = np.array([safe_numeric(p.get("roe")) or 0.0 for p in rows], dtype=float)
    X = np.column_stack([np.ones_like(g), g, r])        # intercept + growth + ROE

    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    predicted = X @ coef
    residual = y - predicted                            # >0 expensive, <0 cheap
    sd = residual.std()
    z = residual / sd if sd > 0 else np.zeros_like(residual)

    score_map = {p["ticker"]: round(float(-zi), 3) for p, zi in zip(rows, z)}  # invert: higher = cheaper
    for p in peers:
        p["cheapness_score"] = score_map.get(p.get("ticker"))
    return peers


# ---------------------------------------------------------------------------
# Legacy heuristic scores (retained — the frontend dashboard consumes these)
# ---------------------------------------------------------------------------
def score_undervalued(info):
    score = 0
    sector = info.get("sector", "Unknown")
    pe_benchmark = SECTOR_PE_MAP.get(sector, 20)
    pe = safe_numeric(info.get("trailingPE"))
    pb = safe_numeric(info.get("priceToBook"))
    roe = safe_numeric(info.get("returnOnEquity"))
    dte = safe_numeric(info.get("debtToEquity"))

    if pe and pe > 0:
        if pe < (pe_benchmark * 0.6): score += 8
        elif pe < (pe_benchmark * 0.9): score += 4
    if pb and pb > 0:
        if pb < 1.5: score += 6
        elif pb < 3: score += 3
    if roe is not None:
        if roe > 0.15: score += 8
        elif roe > 0.08: score += 4
    if dte is not None:
        if dte < 0.5: score += 5
        elif dte < 1.0: score += 2

    return score, {"pe": pe, "pb": pb, "roe": roe, "debtToEquity": dte,
                   "sector_pe_benchmark": pe_benchmark}


def score_multibagger(info):
    score = 0
    market_cap = safe_numeric(info.get("marketCap"))
    roe = safe_numeric(info.get("returnOnEquity"))
    rev_growth = safe_numeric(info.get("revenueGrowth"))
    eps_growth = safe_numeric(info.get("earningsQuarterlyGrowth"))

    if market_cap is not None and market_cap < 2e9: score += 7
    if eps_growth is not None and eps_growth > 0.20: score += 10
    if roe is not None:
        if roe > 0.20: score += 7
        elif roe > 0.12: score += 3
    if rev_growth is not None:
        if rev_growth > 0.15: score += 7
        elif rev_growth > 0.07: score += 3

    return score, {"marketCap": market_cap, "roe": roe,
                   "revenueGrowth": rev_growth, "eps_growth": eps_growth}


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def run_playbook(ticker_input: str, country_code: str, api_key: str):
    info, used_variant = fetch_info_with_variants(ticker_input, country_code, api_key)
    u_score, u_details = score_undervalued(info)
    m_score, m_details = score_multibagger(info)

    # --- Price history (extended to 5y for technical subplots) ---
    hist_df = get_price_history(used_variant, period="5y", interval="1d")
    history_data = []
    if hist_df is not None and not hist_df.empty:
        tmp = hist_df.copy()
        tmp.index = tmp.index.strftime("%Y-%m-%d")
        for date, row in tmp.iterrows():
            history_data.append({
                "date": date,
                "open": safe_numeric(row.get("Open")),
                "high": safe_numeric(row.get("High")),
                "low": safe_numeric(row.get("Low")),
                "close": safe_numeric(row.get("Close")),
                "volume": safe_numeric(row.get("Volume")),
            })

    # --- Institutional valuation stack (fully guarded) ---
    valuation = {}
    intrinsic_val = None
    try:
        macro = get_macro_inputs(country_code)
        statements = get_financial_statements(used_variant)
        beta = compute_beta(used_variant)
        dcf = run_dcf(info, statements, macro, beta)
        mc = run_monte_carlo(dcf.get("_mc_inputs")) if dcf.get("status") == "ok" else \
            {"status": "degraded", "reason": dcf.get("reason")}
        multiples = compute_multiples(info, statements)

        if dcf.get("status") == "ok":
            intrinsic_val = dcf["intrinsic_value_per_share"]
        dcf.pop("_mc_inputs", None)

        valuation = {"dcf": dcf, "monte_carlo": mc, "multiples": multiples, "macro": macro}
    except Exception as exc:
        valuation = {"status": "error", "reason": f"Valuation stack failed: {exc}"}

    # Graham fallback so the UI always has *an* intrinsic anchor.
    if intrinsic_val is None:
        eps = safe_numeric(info.get("trailingEps")) or 0
        growth = min(safe_numeric(info.get("revenueGrowth")) or 0.05, 0.25)
        if eps > 0:
            future_eps = eps * ((1 + growth) ** 5)
            intrinsic_val = round((future_eps * 15) / ((1 + 0.09) ** 5), 2)
            valuation.setdefault("dcf", {})["intrinsic_fallback"] = "graham_proxy"

    return {
        "ticker_requested": ticker_input,
        "ticker_used": used_variant,
        "company": info.get("shortName") or used_variant,
        "price": safe_numeric(info.get("regularMarketPrice")),
        "currency": info.get("currency", "USD"),
        "market_cap": safe_numeric(info.get("marketCap")),
        "sector": info.get("sector", "Unknown"),
        "undervalued_score": u_score,
        "undervalued_details": u_details,
        "multibagger_score": m_score,
        "multibagger_details": m_details,
        "intrinsic_value": intrinsic_val,
        "valuation": valuation,
        "history": history_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
