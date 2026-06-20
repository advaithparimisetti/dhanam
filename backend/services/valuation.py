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
    resolve_currency,
    get_fx_rate,
)
from services.utils import (
    safe_numeric, SECTOR_PE_MAP, SECTOR_EV_EBITDA_MAP, SECTOR_GROSS_MARGIN_MAP,
)

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


# ===========================================================================
# Quantitative Playbook — unified 40-point score (8 pillars × 5)
# ===========================================================================
# Each pillar scores 0–5: meeting the rubric threshold awards full points, and
# scores degrade smoothly below it (so Pro mode sees meaningful decimals). Every
# pillar is independently guarded — missing data → score=None (counted 0, flagged
# unavailable) rather than crashing. All pillar outputs are dimensionless ratios,
# so FX normalization never touches them.
def _clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(x, hi))


def _at(df, names, col=0):
    """Value of the first matching row at column index `col` (0 = most recent)."""
    if df is None or getattr(df, "empty", True):
        return None
    index_map = {str(i).lower(): i for i in df.index}
    for name in names:
        key = name.lower()
        m = index_map.get(key) or next((index_map[k] for k in index_map if key in k), None)
        if m is not None:
            vals = [safe_numeric(v) for v in df.loc[m].values]
            if col < len(vals):
                v = vals[col]
                if v is not None and math.isfinite(v):
                    return v
    return None


def _roic(statements, col=0):
    """Return on invested capital = NOPAT / (debt + equity) for a given year col."""
    inc, bal = statements.get("income"), statements.get("balance")
    ebit = _at(inc, ["Operating Income", "EBIT"], col)
    if ebit is None:
        return None
    nopat = ebit * (1 - _effective_tax_rate(inc))
    debt = _at(bal, ["Total Debt"], col)
    if debt is None:
        debt = (_at(bal, ["Long Term Debt"], col) or 0.0) + (_at(bal, ["Current Debt", "Short Term Debt"], col) or 0.0)
    equity = _at(bal, ["Stockholders Equity", "Total Stockholder Equity", "Common Stock Equity"], col)
    if equity is None:
        return None
    invested = (debt or 0.0) + equity
    return (nopat / invested) if invested > 0 else None


# ---- Pillar 1: Intrinsic Value (Damodaran & Graham) ----
def _pillar_intrinsic(price, intrinsic):
    if not price or not intrinsic or intrinsic <= 0:
        return None, {"available": False}
    ratio = price / intrinsic
    pts = 5.0 * _clamp((1.2 - ratio) / 0.4)          # <=0.80 → 5, >=1.20 → 0
    return round(pts, 1), {"available": True, "price_to_fair_value": round(ratio, 3),
                           "margin_of_safety_pct": round((1 - ratio) * 100, 1),
                           "threshold": "price < 80% of DCF fair value"}


# ---- Pillar 2: Balance Sheet Health ----
def _pillar_balance(statements):
    balance, income, cf = statements.get("balance"), statements.get("income"), statements.get("cashflow")
    net_debt = (_total_debt(balance) or 0.0) - _cash(balance)
    ebit = _latest(income, "Operating Income", "EBIT")
    da = _latest(cf, "Depreciation And Amortization", "Depreciation") or 0.0
    ebitda = _latest(income, "EBITDA") or ((ebit + da) if ebit is not None else None)
    cur_assets = _latest(balance, "Current Assets", "Total Current Assets")
    cur_liab = _latest(balance, "Current Liabilities", "Total Current Liabilities")

    detail, have, lev, liq = {}, False, 0.0, 0.0
    if ebitda and ebitda > 0:
        nde = net_debt / ebitda
        detail["net_debt_to_ebitda"] = round(nde, 2)
        lev = 2.5 if (nde <= 3.0 or nde < 0) else 2.5 * _clamp((6.0 - nde) / 3.0)
        have = True
    if cur_assets and cur_liab and cur_liab > 0:
        cr = cur_assets / cur_liab
        detail["current_ratio"] = round(cr, 2)
        liq = 2.5 if cr >= 1.5 else 2.5 * _clamp((cr - 1.0) / 0.5)
        have = True
    if not have:
        return None, {"available": False}
    detail["available"] = True
    detail["threshold"] = "Net Debt/EBITDA < 3.0x and Current Ratio > 1.5"
    return round(lev + liq, 1), detail


# ---- Pillar 3: Earnings Stability (Fahlén Quality) ----
def _pillar_earnings_stability(statements):
    income, cf = statements.get("income"), statements.get("cashflow")
    ni = _series(income, "Net Income", "Net Income Common Stockholders")
    ocf = _series(cf, "Operating Cash Flow", "Total Cash From Operating Activities", "Cash Flow From Operations")
    capex = _series(cf, "Capital Expenditure", "Capital Expenditures")
    if not ni:
        return None, {"available": False}
    years = min(len(ni), 5)
    good = 0
    for i in range(years):
        ni_pos = ni[i] is not None and ni[i] > 0
        f = (ocf[i] - (abs(capex[i]) if i < len(capex) else 0.0)) if i < len(ocf) else None
        if ni_pos and (f is not None and f > 0):
            good += 1
    pts = 5.0 * (good / years) if years else 0.0
    return round(pts, 1), {"available": True, "years_checked": years,
                           "quality_years": good,
                           "threshold": "positive NI & FCF, 5 consecutive years"}


# ---- Pillar 4: Growth Catalysts (Lynch GARP) ----
def _pillar_growth(info, statements):
    rev_g = safe_numeric(info.get("revenueGrowth"))
    eps_g = safe_numeric(info.get("earningsGrowth")) or safe_numeric(info.get("earningsQuarterlyGrowth"))
    growths = [g for g in (rev_g, eps_g) if g is not None]
    g = max(growths) if growths else None

    detail, growth_pts, roic_pts = {}, 0.0, 0.0
    if g is not None:
        growth_pts = 2.5 if g >= 0.15 else 2.5 * _clamp(g / 0.15)
        detail["best_growth_pct"] = round(g * 100, 1)

    roic_now, roic_prev = _roic(statements, 0), _roic(statements, 1)
    if roic_now is not None:
        detail["roic_now_pct"] = round(roic_now * 100, 1)
        expanding = roic_prev is not None and roic_now > roic_prev
        detail["roic_expanding"] = expanding
        if roic_prev is not None:
            detail["roic_prev_pct"] = round(roic_prev * 100, 1)
        level = 1.0 if roic_now > 0.10 else _clamp(roic_now / 0.10)
        roic_pts = min(2.5, 2.5 * (1.0 if expanding else 0.5) * (0.5 + 0.5 * level))

    if g is None and roic_now is None:
        return None, {"available": False}
    detail["available"] = True
    detail["threshold"] = "Rev/EPS growth > 15% and ROIC expanding"
    return round(growth_pts + roic_pts, 1), detail


# ---- Pillar 5: Quant Value Filters (Gray & Carlisle) ----
def _pillar_quant_value(info, statements):
    cf = statements.get("cashflow")
    mcap = safe_numeric(info.get("marketCap"))
    fcf = _latest(cf, "Free Cash Flow")
    if fcf is None:
        ocf = _latest(cf, "Operating Cash Flow", "Total Cash From Operating Activities")
        capex = _latest(cf, "Capital Expenditure", "Capital Expenditures") or 0.0
        fcf = (ocf - abs(capex)) if ocf is not None else None
    sector = info.get("sector", "Unknown")
    ev_ebitda = safe_numeric(info.get("enterpriseToEbitda"))
    median_ev = SECTOR_EV_EBITDA_MAP.get(sector, 12.0)

    detail, have, fcf_pts, val_pts = {}, False, 0.0, 0.0
    if fcf is not None and mcap and mcap > 0:
        fy = fcf / mcap
        detail["fcf_yield_pct"] = round(fy * 100, 2)
        fcf_pts = 2.5 if fy >= 0.06 else 2.5 * _clamp(fy / 0.06)
        have = True
    if ev_ebitda is not None and ev_ebitda > 0:
        detail["ev_ebitda"] = round(ev_ebitda, 2)
        detail["sector_median_ev_ebitda"] = median_ev
        val_pts = 2.5 if ev_ebitda <= median_ev else 2.5 * _clamp((1.5 * median_ev - ev_ebitda) / (0.5 * median_ev))
        have = True
    if not have:
        return None, {"available": False}
    detail["available"] = True
    detail["threshold"] = "FCF yield > 6% and EV/EBITDA < sector median"
    return round(fcf_pts + val_pts, 1), detail


# ---- Pillar 6: Technical Confirmation (O'Neil) ----
def _pillar_technical(hist_df):
    if hist_df is None or getattr(hist_df, "empty", True) or "Close" not in hist_df:
        return None, {"available": False}
    closes = hist_df["Close"].dropna()
    if len(closes) < 50:
        return None, {"available": False}
    price = float(closes.iloc[-1])
    sma200 = float(closes.tail(200).mean())
    detail = {"available": True,
              "price_vs_sma200_pct": round((price / sma200 - 1) * 100, 1) if sma200 else None,
              "threshold": "Price > 200-day SMA and rising relative volume"}
    trend_pts = 3.0 if (sma200 and price > sma200) else (_clamp(1 + (price / sma200 - 1) / 0.05) * 3.0 if sma200 else 0.0)
    trend_pts = _clamp(trend_pts, 0, 3.0)
    vol_pts = 0.0
    if "Volume" in hist_df:
        vol = hist_df["Volume"].dropna()
        if len(vol) >= 50:
            recent, base = float(vol.tail(20).mean()), float(vol.tail(60).mean())
            if base > 0:
                rv = recent / base
                detail["relative_volume"] = round(rv, 2)
                vol_pts = 2.0 if rv >= 1.0 else 2.0 * _clamp(rv)
    return round(trend_pts + vol_pts, 1), detail


# ---- Pillar 7: Behavioral / Psychology Proxy ----
def _pillar_behavioral(info):
    short = safe_numeric(info.get("shortPercentOfFloat"))
    if short is None:
        return None, {"available": False}
    pts = 5.0 * _clamp((0.10 - short) / (0.10 - 0.02))   # <2% → 5, >10% → 0
    return round(pts, 1), {"available": True, "short_pct_float": round(short * 100, 2),
                           "threshold": "short interest < 5% of float"}


# ---- Pillar 8: Moat / Scuttlebutt (Fisher Proxy) ----
def _pillar_moat(info, statements):
    income = statements.get("income")
    gm = safe_numeric(info.get("grossMargins"))
    gp = _series(income, "Gross Profit")
    rev = _series(income, "Total Revenue", "Operating Revenue")
    sector = info.get("sector", "Unknown")
    median_gm = SECTOR_GROSS_MARGIN_MAP.get(sector, 0.35)

    margins = [gp[i] / rev[i] for i in range(min(len(gp), len(rev))) if rev[i]]
    if gm is None and margins:
        gm = margins[0]
    if gm is None:
        return None, {"available": False}

    level_pts = 2.5 if gm >= 0.40 else 2.5 * _clamp((gm - 0.20) / 0.20)
    detail = {"available": True, "gross_margin_pct": round(gm * 100, 1),
              "sector_median_pct": round(median_gm * 100, 1),
              "threshold": "Gross margin > 40% and stable above sector median"}
    if len(margins) >= 2:
        mean_m = sum(margins) / len(margins)
        cov = ((sum((m - mean_m) ** 2 for m in margins) / len(margins)) ** 0.5 / mean_m) if mean_m else 1.0
        detail["margin_stability_cov"] = round(cov, 3)
        stability = _clamp(1 - cov / 0.15)
        above = 1.0 if gm >= median_gm else _clamp(gm / median_gm)
        stab_pts = min(2.5, 2.5 * stability * (0.5 + 0.5 * above))
    else:
        stab_pts = 1.25 if gm >= median_gm else 0.0
    return round(level_pts + stab_pts, 1), detail


_PILLAR_META = [
    ("intrinsic_value", "Intrinsic Value", "Damodaran & Graham"),
    ("balance_sheet", "Balance Sheet Health", "Liquidity & Leverage"),
    ("earnings_stability", "Earnings Stability", "Fahlén Quality"),
    ("growth", "Growth Catalysts", "Lynch GARP"),
    ("quant_value", "Quant Value", "Gray & Carlisle"),
    ("technical", "Technical Confirmation", "O'Neil"),
    ("behavioral", "Behavioral Edge", "Institutional Confidence"),
    ("moat", "Economic Moat", "Fisher Scuttlebutt"),
]


def calculate_playbook_score(info, statements, hist_df, price, intrinsic):
    """Unified 40-point quantitative grade across the 8 pillars. Fully guarded:
    any pillar lacking data scores 0 and is flagged `available: false`."""
    results = [
        _pillar_intrinsic(price, intrinsic),
        _pillar_balance(statements),
        _pillar_earnings_stability(statements),
        _pillar_growth(info, statements),
        _pillar_quant_value(info, statements),
        _pillar_technical(hist_df),
        _pillar_behavioral(info),
        _pillar_moat(info, statements),
    ]
    pillars, total, avail = [], 0.0, 0
    for (key, name, school), (score, detail) in zip(_PILLAR_META, results):
        available = score is not None
        pts = float(score) if available else 0.0
        if available:
            total += pts
            avail += 1
        pillars.append({"key": key, "name": name, "school": school,
                        "score": round(pts, 1), "max": 5,
                        "available": available, "detail": detail})

    total = round(total, 1)
    grade = ("A" if total >= 34 else "B" if total >= 27 else
             "C" if total >= 20 else "D" if total >= 13 else "F")
    return {
        "total": int(round(total)),
        "total_precise": total,
        "max": 40,
        "grade": grade,
        "pillars_available": avail,
        "pillars": pillars,
    }


# ---------------------------------------------------------------------------
# FX normalization
# ---------------------------------------------------------------------------
def _scale(v, factor):
    return v * factor if (v is not None and factor != 1.0) else v


def _mul(d, key, rate, dp=4):
    v = d.get(key)
    if v is not None:
        try:
            d[key] = round(float(v) * rate, dp)
        except (TypeError, ValueError):
            pass


def _apply_fx(res, rate, display_ccy):
    """Convert every MONETARY field in the result by `rate` and stamp the display
    currency. Ratios, percentages, growth, beta, WACC and counts are dimensionless
    and deliberately left untouched."""
    if rate is None:
        rate = 1.0
    res["currency"] = display_ccy
    for k in ("price", "market_cap", "intrinsic_value"):
        _mul(res, k, rate, dp=2)

    val = res.get("valuation") or {}
    dcf = val.get("dcf")
    if isinstance(dcf, dict):
        for k in ("intrinsic_value_per_share", "current_price", "base_ufcf", "net_debt"):
            _mul(dcf, k, rate, dp=2)
        comp = dcf.get("ufcf_components")
        if isinstance(comp, dict):
            for k in ("revenue", "ebit", "d_and_a", "capex", "change_in_nwc"):
                _mul(comp, k, rate, dp=0)
    mc = val.get("monte_carlo")
    if isinstance(mc, dict):
        for k in ("mean", "median", "std_dev"):
            _mul(mc, k, rate, dp=2)
        pct = mc.get("percentiles")
        if isinstance(pct, dict):
            for k in list(pct.keys()):
                _mul(pct, k, rate, dp=2)
        ci = mc.get("confidence_interval_90")
        if isinstance(ci, list):
            mc["confidence_interval_90"] = [round(float(x) * rate, 2) if x is not None else x for x in ci]
    mult = val.get("multiples")
    if isinstance(mult, dict):
        _mul(mult, "enterprise_value", rate, dp=0)

    for row in res.get("history", []):
        for k in ("open", "high", "low", "close"):
            _mul(row, k, rate, dp=4)
    return res


def normalize_peer_currency(peer: dict, target_ccy: str) -> dict:
    """FX-normalize a single /compare peer row so the matrix is apples-to-apples.
    Converts price / market_cap / enterprise_value; leaves the multiples (which
    are ratios) untouched. Handles minor price units (pence) before FX."""
    base_major, factor = resolve_currency(peer.get("currency") or "USD")
    target = (target_ccy or "USD").upper()

    price = safe_numeric(peer.get("price"))
    if price is not None and factor != 1.0:
        price = price * factor          # pence → pounds before FX

    rate, disp = 1.0, base_major
    if target != base_major:
        r = get_fx_rate(base_major, target)
        if r:
            rate, disp = r, target

    if price is not None:
        peer["price"] = round(price * rate, 4)
    for k in ("market_cap", "enterprise_value"):
        v = safe_numeric(peer.get(k))
        if v is not None:
            peer[k] = round(v * rate, 2)
    peer["currency"] = disp
    peer["fx_rate"] = round(rate, 6)
    return peer


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def run_playbook(ticker_input: str, country_code: str, api_key: str, target_currency: str = "USD"):
    info_raw, used_variant = fetch_info_with_variants(ticker_input, country_code, api_key)
    # fetch_info_with_variants is lru_cached → copy before mutating, never corrupt the cache.
    info = dict(info_raw)

    # Resolve minor price units (e.g. GBp pence) to the major ISO currency so ALL
    # internal math is consistent — statement-derived intrinsic value is in major
    # units, so the comparison price must be too (fixes a latent GBp DCF bug).
    base_major, minor_factor = resolve_currency(info.get("currency") or "USD")
    if minor_factor != 1.0:
        p = safe_numeric(info.get("regularMarketPrice"))
        if p is not None:
            info["regularMarketPrice"] = p * minor_factor
    info["currency"] = base_major

    u_score, u_details = score_undervalued(info)
    m_score, m_details = score_multibagger(info)

    # --- Price history (5y); apply the minor-unit factor so charts match price ---
    hist_df = get_price_history(used_variant, period="5y", interval="1d")
    history_data = []
    if hist_df is not None and not hist_df.empty:
        tmp = hist_df.copy()
        tmp.index = tmp.index.strftime("%Y-%m-%d")
        for date, row in tmp.iterrows():
            history_data.append({
                "date": date,
                "open": _scale(safe_numeric(row.get("Open")), minor_factor),
                "high": _scale(safe_numeric(row.get("High")), minor_factor),
                "low": _scale(safe_numeric(row.get("Low")), minor_factor),
                "close": _scale(safe_numeric(row.get("Close")), minor_factor),
                "volume": safe_numeric(row.get("Volume")),
            })

    # Fetch the three statements ONCE (uncached upstream) — reused by both the
    # valuation stack and the Playbook scorer. Internally guarded → empty frames.
    statements = get_financial_statements(used_variant)

    # --- Institutional valuation stack (fully guarded), all in MAJOR base ccy ---
    valuation = {}
    intrinsic_val = None
    try:
        macro = get_macro_inputs(country_code)
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

    # --- Quantitative Playbook (40-pt, 8 pillars) — guarded & FX-invariant ---
    try:
        playbook = calculate_playbook_score(
            info, statements, hist_df,
            safe_numeric(info.get("regularMarketPrice")), intrinsic_val,
        )
    except Exception as exc:
        playbook = {"status": "error", "reason": str(exc), "total": 0, "max": 40, "pillars": []}

    res = {
        "ticker_requested": ticker_input,
        "ticker_used": used_variant,
        "company": info.get("shortName") or used_variant,
        "price": safe_numeric(info.get("regularMarketPrice")),
        "currency": base_major,
        "market_cap": safe_numeric(info.get("marketCap")),
        "sector": info.get("sector", "Unknown"),
        "undervalued_score": u_score,
        "undervalued_details": u_details,
        "multibagger_score": m_score,
        "multibagger_details": m_details,
        "intrinsic_value": intrinsic_val,
        "valuation": valuation,
        "playbook": playbook,
        "history": history_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # --- FX: normalize all monetary outputs from major base ccy → requested target.
    requested = (target_currency or "USD").upper()
    if requested == base_major:
        rate, disp = 1.0, base_major
    else:
        r = get_fx_rate(base_major, requested)
        rate, disp = (r, requested) if r else (1.0, base_major)   # FX down → show native, flag it
    res = _apply_fx(res, rate, disp)
    res["fx"] = {
        "base_currency": base_major,
        "requested_currency": requested,
        "display_currency": disp,
        "rate": round(rate, 6),
        "converted": disp == requested and requested != base_major,
        "note": None if disp == requested else
                f"Live FX {base_major}->{requested} unavailable; values shown in {base_major}.",
    }
    return res
