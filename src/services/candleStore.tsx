import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Candle } from '../types/trading';
import * as apiService from './apiService';

interface CandleContextType {
  candles: Candle[];
  loading: boolean;
  symbol: string;
  timeframe: string;
  candleSource: 'ctrader' | 'metatrader';
  candleLimit: number;
  setSymbol: (sym: string) => void;
  setTimeframe: (tf: string) => void;
  setCandleSource: (source: 'ctrader' | 'metatrader') => void;
  setCandleLimit: (limit: number) => void;
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

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const candlesRef = useRef<Candle[]>([]);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const setSymbol = (sym: string) => {
    localStorage.setItem('wyckoff_symbol', sym);
    setSymbolState(sym);
  };

  const setTimeframe = (tf: string) => {
    localStorage.setItem('wyckoff_timeframe', tf);
    setTimeframeState(tf);
  };

  const setCandleSource = (source: 'ctrader' | 'metatrader') => {
    localStorage.setItem('wyckoff_candle_source', source);
    setCandleSourceState(source);
  };

  const setCandleLimit = (limit: number) => {
    localStorage.setItem('wyckoff_candle_limit', limit.toString());
    setCandleLimitState(limit);
  };

  const fetchCandles = async (forceFullRefresh: boolean = false, isBackground: boolean = false) => {
    if (!symbol) return;
    const fetchStartTime = performance.now();
    const startIsoTime = new Date().toISOString();

    if (!isBackground) {
      setLoading(true);
    }

    if (forceFullRefresh) {
      setCandles([]);
    }

    const isIncremental = !forceFullRefresh && candlesRef.current.length >= 100;
    const reqLimit = isIncremental ? 2 : candleLimit;

    try {
      console.log(`[${startIsoTime}] 🚀 [CandleStore] Fetching ${reqLimit} candles for ${symbol} (${timeframe}) via ${candleSource}`);
      const marketResult = await apiService.fetchTradeCandles({
        broker: candleSource,
        symbol: symbol,
        interval: timeframe,
        limit: reqLimit,
      });

      let rawCandles: Candle[] = [];
      if (marketResult && marketResult.status === 'success' && Array.isArray(marketResult.candles)) {
        rawCandles = marketResult.candles.sort((a: Candle, b: Candle) => a.time - b.time);
      } else if (Array.isArray(marketResult)) {
        rawCandles = marketResult.sort((a: Candle, b: Candle) => a.time - b.time);
      } else {
        console.warn(`[${new Date().toISOString()}] ⚠️ [CandleStore] Unexpected fetch response:`, marketResult);
      }

      const durationMs = (performance.now() - fetchStartTime).toFixed(1);
      console.log(`[${new Date().toISOString()}] ✅ [CandleStore] Received ${rawCandles.length} candles in ${durationMs}ms`);

      if (rawCandles.length > 0) {
        if (isIncremental) {
          setCandles(prev => {
            if (prev.length === 0) return rawCandles;
            const map = new Map<number, Candle>();
            prev.forEach(c => map.set(c.time, c));
            rawCandles.forEach(c => map.set(c.time, c));
            return Array.from(map.values()).sort((a, b) => a.time - b.time);
          });
        } else {
          setCandles(rawCandles);
        }
      }
    } catch (err) {
      console.error('[CandleStore] Error fetching candles:', err);
    } finally {
      setLoading(false);
    }
  };

  // Immediate fetch on mount or parameter changes + 5s background polling loop
  useEffect(() => {
    let isCancelled = false;
    fetchCandles(true, false);

    const interval = setInterval(() => {
      if (!isCancelled) {
        fetchCandles(false, true);
      }
    }, 5000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [symbol, timeframe, candleLimit, candleSource]);

  return (
    <CandleContext.Provider
      value={{
        candles,
        loading,
        symbol,
        timeframe,
        candleSource,
        candleLimit,
        setSymbol,
        setTimeframe,
        setCandleSource,
        setCandleLimit,
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
