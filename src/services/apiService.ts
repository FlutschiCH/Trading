import { API_BASE_URL } from '../api';

export const fetchLiveStrategies = async () => {
  const response = await fetch(`${API_BASE_URL}/api/live/strategies`);
  return response.json();
};

export const fetchMetadataSymbols = async (sourcePath: string) => {
  const response = await fetch(`${API_BASE_URL}/api/${sourcePath}/symbols`);
  return response.json();
};

export const fetchMetadataTimeframes = async (sourcePath: string) => {
  const response = await fetch(`${API_BASE_URL}/api/${sourcePath}/timeframes`);
  return response.json();
};

export const cancelBacktest = async (backtestId: string) => {
  const response = await fetch(`${API_BASE_URL}/api/backtest/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backtestId })
  });
  return response.json();
};

export const deployLiveStrategy = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/live/strategy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
};

export const fetchLiveStrategyCache = async (strategyId: string, limit?: number) => {
  const url = limit 
    ? `${API_BASE_URL}/api/live/strategy/cache/${strategyId}?limit=${limit}`
    : `${API_BASE_URL}/api/live/strategy/cache/${strategyId}`;
  const response = await fetch(url);
  return response.json();
};

export const fetchTradeCandles = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/trade/candles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
};

export const fetchFavouritesList = async () => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/list`);
  return response.json();
};

export const saveFavourite = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
};

export const deleteFavourite = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
};

export const updateFavouriteNotes = async (payload: any) => {
  const response = await fetch(`${API_BASE_URL}/api/favourites/update-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
};
