import axios from 'axios';

// Configure Axios to point to our FastAPI backend
const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const analyzeStock = async (ticker, region = 'US', apiKey = '') => {
  const response = await apiClient.get(`/analyze/${ticker}`, {
    params: { country_code: region, api_key: apiKey }
  });
  return response.data;
};

export const getRiskProfile = async (ticker) => {
  const response = await apiClient.get(`/risk/${ticker}`);
  return response.data;
};
// Add this below your existing functions in src/api/client.js
export const getFundamentals = async (ticker) => {
  const response = await apiClient.get(`/fundamentals/${ticker}`);
  return response.data;
};
// Add this below your existing functions
export const comparePeers = async (baseTicker, peers) => {
  const response = await apiClient.get(`/compare`, {
    params: { base_ticker: baseTicker, peers: peers }
  });
  return response.data;
};
export default apiClient;