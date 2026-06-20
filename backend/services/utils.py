import numpy as np

SECTOR_PE_MAP = {
    "Technology": 25, "Financial Services": 12, "Healthcare": 20,
    "Consumer Cyclical": 18, "Industrials": 18, "Energy": 10,
    "Utilities": 15, "Real Estate": 35, "Basic Materials": 15,
    "Communication Services": 20
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