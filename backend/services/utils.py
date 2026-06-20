import numpy as np

SECTOR_PE_MAP = {
    "Technology": 25, "Financial Services": 12, "Healthcare": 20,
    "Consumer Cyclical": 18, "Industrials": 18, "Energy": 10,
    "Utilities": 15, "Real Estate": 35, "Basic Materials": 15,
    "Communication Services": 20
}

# Institutional sector-median proxies used by the Playbook quant filters. Free
# APIs don't expose live sector medians, so these are documented standing values
# (Damodaran-style sector aggregates) — defensible and adjustable.
SECTOR_EV_EBITDA_MAP = {
    "Technology": 18, "Financial Services": 10, "Healthcare": 14,
    "Consumer Cyclical": 11, "Industrials": 12, "Energy": 6,
    "Utilities": 11, "Real Estate": 18, "Basic Materials": 8,
    "Communication Services": 9,
}

SECTOR_GROSS_MARGIN_MAP = {
    "Technology": 0.55, "Financial Services": 0.50, "Healthcare": 0.45,
    "Consumer Cyclical": 0.35, "Industrials": 0.30, "Energy": 0.30,
    "Utilities": 0.40, "Real Estate": 0.50, "Basic Materials": 0.25,
    "Communication Services": 0.45,
}

COUNTRY_SUFFIX_MAP = {
    "IN": [".NS", ".BO"], "US": [""], "GB": [".L"], "DE": [".DE"],
    "FR": [".PA"], "CA": [".TO"], "AU": [".AX"], "HK": [".HK"],
    "JP": [".T"], "SG": [".SI"], "CH": [".SW"], "NL": [".AS"],
    "SE": [".ST"], "IT": [".MI"],
}

def safe_numeric(x):
    if x is None: return None
    try:
        if isinstance(x, str):
            s = x.strip().replace(",", "")
            if s.endswith("%"): return float(s.rstrip("%"))/100.0
            return float(s)
        if isinstance(x, (int, float, np.floating, np.integer)): return float(x)
    except: return None
    return None