import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Candle } from '../types/trading';
import * as apiService from './apiService';
import { API_BASE_URL } from '../api';
import { isPollingPaused } from './pollingStore';

interface CandleContextType {
  candles: Candle[];
  loading: boolean;
  symbol: string;
  timeframe: string;
  candleSource: 'ctrader' | 'metatrader';
  candleLimit: number;
  activeStrategyId: string | null;
  setSymbol: (sym: string) => void;
  setTimeframe: (tf: string) => void;
  setCandleSource: (source: 'ctrader' | 'metatrader') => void;
  setCandleLimit: (limit: number) => void;
  setActiveStrategyId: (strategyId: string | null) => void;
  fetchCandles: (forceFullRefresh?: boolean, isBackground?: boolean) => Promise<void>;
}

const CandleContext = createContext<CandleContextType | undefined>(undefined);

export const CandleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [symbol, setSymbolState] = useState<string>(() => localStorage.getItem('wyckoff_symbol') || 'EURUSD');
  const [timeframe, setTimeframeState] = useState<string>(() => localStorage.getItem('wyckoff_timeframe') || '15m');
  const [candleSource, setCandleSourceState] = useState<'ctrader' | 'metatrader'>(
    () => (localStorage.getItem('wyckoff_candle_source') as 'ctrader' | 'metatrader') || 'metatrader'
  );
  const [candleLimit, setCandleLimitState] = useState<number>(
    () => parseInt(localStorage.getItem('wyckoff_candle_limit') || '5000', 10)
  );
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const candlesRef = useRef<Candle[]>([]);
  const activeStrategyIdRef = useRef<string | null>(null);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    activeStrategyIdRef.current = activeStrategyId;
  }, [activeStrategyId]);

  const setSymbol = (sym: string) => {
    if (!sym) return;
    localStorage.setItem('wyckoff_symbol', sym);
    if (sym !== symbol) {
      setSymbolState(sym);
      const cacheKey = `wyckoff_candles_${sym}_${timeframe}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCandles(parsed);
          } else {
            setCandles([]);
          }
        } else {
          setCandles([]);
        }
      } catch {
        setCandles([]);
      }
    }
  };

  const setTimeframe = (tf: string) => {
    if (!tf) return;
    localStorage.setItem('wyckoff_timeframe', tf);
    if (tf !== timeframe) {
      setTimeframeState(tf);
      const cacheKey = `wyckoff_candles_${symbol}_${tf}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCandles(parsed);
          } else {
            setCandles([]);
          }
        } else {
          setCandles([]);
        }
      } catch {
        setCandles([]);
      }
    }
  };

  const setCandleSource = (source: 'ctrader' | 'metatrader') => {
    localStorage.setItem('wyckoff_candle_source', source);
    setCandleSourceState(source);
  };

  const setCandleLimit = (limit: number) => {
    localStorage.setItem('wyckoff_candle_limit', limit.toString());
    setCandleLimitState(limit);
  };

  const isFetchingRef = useRef<boolean>(false);

  const hasFetchedFullLiveRef = useRef<Set<string>>(new Set());

  const saveCandlesToCache = (sym: string, tf: string, candleList: Candle[]) => {
    if (!sym || !tf || !candleList || candleList.length === 0) return;
    const cacheKey = `wyckoff_candles_${sym}_${tf}`;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(candleList.slice(-5000)));
    } catch (e) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(candleList.slice(-2000)));
      } catch (e2) {}
    }
  };

  const fetchCandles = async (forceFullRefresh: boolean = false, isBackground: boolean = false) => {
    if (!symbol) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;

    if (!isBackground) {
      setLoading(true);
    }

    const currentStrategyId = activeStrategyIdRef.current;
    
    // For live strategy: require a full fetch (5000 candles) at least once per strategy
    let isIncremental = false;
    if (currentStrategyId) {
      const hasFull = hasFetchedFullLiveRef.current.has(currentStrategyId);
      isIncremental = !forceFullRefresh && hasFull && candlesRef.current.length >= 50;
    } else {
      isIncremental = !forceFullRefresh && candlesRef.current.length >= 50;
    }

    if (isIncremental && isPollingPaused()) return;

    const reqLimit = isIncremental ? 50 : Math.min(candleLimit, 5000);

    try {
      let rawCandles: Candle[] = [];

      if (currentStrategyId) {
        // Fetch Wyckoff-annotated live strategy candles
        const res = await fetch(`${API_BASE_URL}/api/live/strategy/cache/${currentStrategyId}?limit=${reqLimit}`);
        const data = await res.json();
        if (data && data.status === 'success' && Array.isArray(data.candles)) {
          rawCandles = data.candles.sort((a: Candle, b: Candle) => a.time - b.time);
          if (!isIncremental && rawCandles.length > 0) {
            hasFetchedFullLiveRef.current.add(currentStrategyId);
          }
        }
      } else {
        // Fetch standard market candles
        let activeAccId: string | undefined = undefined;
        try {
          const savedAcc = localStorage.getItem('wyckoff_active_account');
          if (savedAcc) {
            const parsed = JSON.parse(savedAcc);
            activeAccId = parsed?.account_id || parsed?.id;
          }
        } catch (e) {}
        if (!activeAccId) {
          activeAccId = localStorage.getItem('wyckoff_active_account_id') || localStorage.getItem('active_account_id') || undefined;
        }

        if (activeAccId && ['none', 'null', 'undefined'].includes(String(activeAccId).trim().toLowerCase())) {
          activeAccId = undefined;
        }

        const payload = {
          broker: candleSource,
          symbol: symbol,
          interval: timeframe,
          limit: reqLimit,
          account_id: activeAccId
        };

        const marketResult = await apiService.fetchTradeCandles(payload);
        if (marketResult && marketResult.status === 'success' && Array.isArray(marketResult.candles)) {
          rawCandles = marketResult.candles.sort((a: Candle, b: Candle) => a.time - b.time);
        } else if (marketResult && Array.isArray(marketResult.data)) {
          rawCandles = marketResult.data.sort((a: Candle, b: Candle) => a.time - b.time);
        } else if (Array.isArray(marketResult)) {
          rawCandles = marketResult.sort((a: Candle, b: Candle) => a.time - b.time);
        }
      }

      if (rawCandles.length > 0) {
        setCandles(prev => {
          let updated: Candle[] = [];
          if (isIncremental && prev.length > 0) {
            const map = new Map<number, Candle>();
            prev.forEach(c => map.set(c.time, c));
            rawCandles.forEach(c => {
              const existing = map.get(c.time);
              map.set(c.time, existing ? { ...existing, ...c } : c);
            });
            updated = Array.from(map.values()).sort((a, b) => a.time - b.time);
          } else {
            const map = new Map<number, Candle>();
            prev.forEach(c => map.set(c.time, c));
            rawCandles.forEach(c => {
              const existing = map.get(c.time);
              map.set(c.time, existing ? { ...existing, ...c } : c);
            });
            updated = Array.from(map.values()).sort((a, b) => a.time - b.time);
          }

          // Check if data actually changed to prevent redundant chart re-renders when market is closed (e.g. weekends)
          if (prev.length === updated.length && prev.length > 0) {
            const prevLast = prev[prev.length - 1];
            const updatedLast = updated[updated.length - 1];
            if (
              prevLast.time === updatedLast.time &&
              prevLast.open === updatedLast.open &&
              prevLast.high === updatedLast.high &&
              prevLast.low === updatedLast.low &&
              prevLast.close === updatedLast.close &&
              prevLast.volume === updatedLast.volume
            ) {
              return prev;
            }
          }

          saveCandlesToCache(symbol, timeframe, updated);
          return updated;
        });
      }
    } catch (err) {
      console.error('[CandleStore] Error fetching candles:', err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  // Load cached candles on mount or parameter change + 15s background polling loop
  useEffect(() => {
    let isCancelled = false;

    const cacheKey = `wyckoff_candles_${symbol}_${timeframe}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCandles(parsed);
        } else {
          setCandles([]);
        }
      } else {
        setCandles([]);
      }
    } catch {
      setCandles([]);
    }

    const isLive = Boolean(activeStrategyId);
    const forceRefresh = isLive && !hasFetchedFullLiveRef.current.has(activeStrategyId!);
    fetchCandles(forceRefresh, false);

    const interval = setInterval(() => {
      if (!isCancelled) {
        fetchCandles(false, true);
      }
    }, 15000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [symbol, timeframe, candleLimit, candleSource, activeStrategyId]);

  return (
    <CandleContext.Provider
      value={{
        candles,
        loading,
        symbol,
        timeframe,
        candleSource,
        candleLimit,
        activeStrategyId,
        setSymbol,
        setTimeframe,
        setCandleSource,
        setCandleLimit,
        setActiveStrategyId,
        fetchCandles,
      }}
    >
      {children}
    </CandleContext.Provider>
  );
};

export const useCandleStore = () => {
  const context = useContext(CandleContext);
  if (!context) {
    throw new Error('useCandleStore must be used within a CandleProvider');
  }
  return context;
};

