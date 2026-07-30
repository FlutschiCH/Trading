import { API_BASE_URL } from '../api';

const safeJsonParse = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { status: 'error', message: text || `HTTP ${response.status} ${response.statusText}` };
  }
  const text = await response.text();
  if (!text || !text.trim()) {
    return { status: 'error', message: 'Empty response body' };
  }
  try {
    return JSON.parse(text);
  } catch (err: any) {
    return { status: 'error', message: `Invalid JSON response: ${err.message}` };
  }
};

export const fetchLiveStrategies = async () => {
  const response = await fetch(`${API_BASE_URL}/api/live/strategies`);
  return safeJsonParse(response);
};

export const fetchMetadataSymbols = async (sourcePath: string) => {
  const response = await fetch(`${API_BASE_URL}/api/${sourcePath}/symbols`);
  return safeJsonParse(response);
};

export const fetchMetadataTimeframes = async (sourcePath: string) => {
  const response = await fetch(`${API_BASE_URL}/api/${sourcePath}/timeframes`);
  return safeJsonParse(response);
};

export const cancelBacktest = async (backtestId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/backtest/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backtestId })
  });
  return safeJsonParse(response);
};

export const deployLiveStrategy = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/live/strategy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return safeJsonParse(response);
};

export const fetchLiveStrategyCache = async (strategyId: string, limit?: number) => {
  const url = limit 
    ? `${API_BASE_URL}/api/live/strategy/cache/${strategyId}?limit=${limit}`
    : `${API_BASE_URL}/api/live/strategy/cache/${strategyId}`;
  const response = await fetch(url);
  return safeJsonParse(response);
};

export const fetchTradeCandles = async (payload: any) => {
  const url = `${API_BASE_URL}/api/trade/candles`;
  console.log(`[apiService] Executing POST request to ${url} with payload:`, payload);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`[apiService] Received response object for ${url}, status: ${response.status}`);
    const data = await safeJsonParse(response);
    console.log(`[apiService] Parsed JSON data for ${url}:`, data);
    return data;
  } catch (err: any) {
    console.error(`[apiService] fetchTradeCandles network exception for ${url}:`, err);
    return { status: 'error', message: err.message || 'Network exception' };
  }
};

export const fetchFavouritesList = async () => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/list`);
  return safeJsonParse(response);
};

export const saveFavourite = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return safeJsonParse(response);
};

export const deleteFavourite = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return safeJsonParse(response);
};

export const updateFavouriteNotes = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/update-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return safeJsonParse(response);
};
