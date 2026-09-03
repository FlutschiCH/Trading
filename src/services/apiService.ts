import { API_BASE_URL } from '../api';
import { createManagedAbortSignal } from './requestManager';

let lastRequestTime = 0;
const MIN_REQUEST_GAP_MS = 250; // Minimum 250ms gap between outgoing requests to protect backend from overload

const throttledFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { signal: managedSignal, cleanup } = createManagedAbortSignal();
  const callerSignal = init?.signal;
  
  if (callerSignal?.aborted || managedSignal.aborted) {
    cleanup();
    throw new DOMException('Aborted', 'AbortError');
  }

  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_GAP_MS) {
    const delay = MIN_REQUEST_GAP_MS - timeSinceLast;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (callerSignal) callerSignal.addEventListener('abort', onAbort, { once: true });
      managedSignal.addEventListener('abort', onAbort, { once: true });
    });
  }
  lastRequestTime = Date.now();

  try {
    const combinedSignal = callerSignal || managedSignal;
    return await fetch(input, { ...init, signal: combinedSignal });
  } finally {
    cleanup();
  }
};

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
  const response = await throttledFetch(`${API_BASE_URL}/api/live/strategies`);
  return safeJsonParse(response);
};

export const fetchMetadataSymbols = async (sourcePath: string, accountId?: string) => {
  const savedId = accountId || localStorage.getItem('broker_account') || localStorage.getItem('wyckoff_active_account_id');
  let accId = (savedId && !['none', 'null', 'undefined'].includes(String(savedId).trim().toLowerCase())) ? savedId : null;
  if (!accId) {
    try {
      const saved = localStorage.getItem('wyckoff_active_account');
      if (saved) {
        const parsed = JSON.parse(saved);
        accId = parsed?.account_id || parsed?.id;
      }
    } catch { }
  }
  const queryParam = accId ? `?account_id=${encodeURIComponent(accId)}` : '';
  const response = await throttledFetch(`${API_BASE_URL}/api/${sourcePath}/symbols${queryParam}`);
  return safeJsonParse(response);
};

export const fetchMetadataTimeframes = async (sourcePath: string) => {
  const response = await throttledFetch(`${API_BASE_URL}/api/${sourcePath}/timeframes`);
  return safeJsonParse(response);
};

export const cancelBacktest = async (backtestId: string) => {
  const response = await throttledFetch(`${API_BASE_URL}/api/backtest/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backtestId })
  });
  return safeJsonParse(response);
};

export const deployLiveStrategy = async (payload: any) => {
  const response = await throttledFetch(`${API_BASE_URL}/api/live/strategy`, {
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
  const response = await throttledFetch(url);
  return safeJsonParse(response);
};

export const fetchTradeCandles = async (payload: any) => {
  const url = `${API_BASE_URL}/api/broker/candles`;
  try {
    const response = await throttledFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await safeJsonParse(response);
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

let symbolMappingsCache: any = null;
let symbolMappingsPromise: Promise<any> | null = null;
let connectedBrokersCache: any = null;
let connectedBrokersPromise: Promise<any> | null = null;

export const fetchSymbolMappings = async (force: boolean = false) => {
  if (symbolMappingsCache && !force) return symbolMappingsCache;
  if (symbolMappingsPromise && !force) return symbolMappingsPromise;
  
  symbolMappingsPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings`);
      const data = await safeJsonParse(res);
      if (data && data.status === 'success') {
        symbolMappingsCache = data;
      }
      return data;
    } finally {
      symbolMappingsPromise = null;
    }
  })();
  return symbolMappingsPromise;
};

export const fetchConnectedBrokers = async (force: boolean = false) => {
  if (connectedBrokersCache && !force) return connectedBrokersCache;
  if (connectedBrokersPromise && !force) return connectedBrokersPromise;
  
  connectedBrokersPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/symbol-mappings/connected-brokers`);
      const data = await safeJsonParse(res);
      if (data && data.status === 'success') {
        connectedBrokersCache = data;
      }
      return data;
    } finally {
      connectedBrokersPromise = null;
    }
  })();
  return connectedBrokersPromise;
};
