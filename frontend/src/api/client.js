import axios from 'axios';
import { auth } from '../firebase';

// Base URL from env so dev (localhost) and prod (Render) differ only by config.
// Resilient: the API is always mounted under /api/v1, so we auto-append that
// segment if the configured base omits it. This makes the app work whether
// VITE_API_BASE_URL is set to the bare host (https://dhanam.onrender.com) or the
// full path (https://dhanam.onrender.com/api/v1) — removing a common deploy footgun.
function resolveBaseURL() {
  let base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').trim();
  base = base.replace(/\/+$/, '');            // strip trailing slash(es)
  if (!/\/api\/v\d+$/.test(base)) {           // append /api/v1 only if not already present
    base += '/api/v1';
  }
  return base;
}

const apiClient = axios.create({
  baseURL: resolveBaseURL(),
  headers: { 'Content-Type': 'application/json' },
});

// Attach the current user's Firebase ID token to every request. The backend
// (get_current_user) verifies it; unauthenticated calls simply omit the header.
apiClient.interceptors.request.use(async (config) => {
  const user = auth?.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (e) { /* no token → request proceeds unauthenticated */ }
  }
  return config;
});

// ---- Public research endpoints ----
export const analyzeStock = async (ticker, region = 'US', apiKey = '', targetCurrency = 'USD') => {
  const response = await apiClient.get(`/analyze/${ticker}`, {
    params: { country_code: region, api_key: apiKey, target_currency: targetCurrency },
  });
  return response.data;
};

export const getRiskProfile = async (ticker) => (await apiClient.get(`/risk/${ticker}`)).data;
export const getFundamentals = async (ticker) => (await apiClient.get(`/fundamentals/${ticker}`)).data;
export const comparePeers = async (baseTicker, peers, targetCurrency = 'USD') =>
  (await apiClient.get(`/compare`, { params: { base_ticker: baseTicker, peers, target_currency: targetCurrency } })).data;

// ---- Authenticated endpoints (ID token attached automatically) ----
export const syncUser = async () => (await apiClient.post('/auth/sync')).data;
export const getWatchlist = async () => (await apiClient.get('/watchlist')).data;
export const addToWatchlist = async (payload) => (await apiClient.post('/watchlist', payload)).data;
export const removeFromWatchlist = async (ticker) => (await apiClient.delete(`/watchlist/${ticker}`)).data;

export default apiClient;
