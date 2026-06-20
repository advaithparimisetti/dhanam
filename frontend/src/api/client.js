import axios from 'axios';
import { auth } from '../firebase';

// Base URL from env so dev (localhost) and prod (Render) differ only by config.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
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
