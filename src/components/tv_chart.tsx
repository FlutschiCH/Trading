import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import type { ISeriesPrimitive, IPrimitivePaneView as SeriesPrimitivePaneView, IPrimitivePaneRenderer as SeriesPrimitivePaneRenderer } from 'lightweight-charts';
import { Square, PenTool, Trash2, XCircle, RefreshCw, Maximize2, Minimize2, Settings, Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { calculateDateBounds } from '../App';
import { API_BASE_URL } from '../api';
import type { Candle } from '../types/trading';

class SessionBoxRenderer implements SeriesPrimitivePaneRenderer {
  private _sessionCoords: any[];

  constructor(sessionCoords: any[]) {
    this._sessionCoords = sessionCoords;
  }

  draw(target: any) {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx = scope.context;
      ctx.save();
      this._sessionCoords.forEach(session => {
        const x1 = session.x1;
        const x2 = session.x2;
        const y1 = session.y1;
        const y2 = session.y2;
        const width = Math.max(1, x2 - x1);
        const height = Math.max(1, y2 - y1);

        if (width <= 0 || height <= 0) return;

        const colorHex = session.color || '#3b82f6';
        let r = 59, g = 130, b = 246;
        if (colorHex.startsWith('#')) {
          const hexVal = colorHex.replace('#', '');
          if (hexVal.length === 3) {
            r = parseInt(hexVal[0] + hexVal[0], 16);
            g = parseInt(hexVal[1] + hexVal[1], 16);
            b = parseInt(hexVal[2] + hexVal[2], 16);
          } else if (hexVal.length === 6) {
            r = parseInt(hexVal.substring(0, 2), 16);
            g = parseInt(hexVal.substring(2, 4), 16);
            b = parseInt(hexVal.substring(4, 6), 16);
          }
        }

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.08)`;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);

        ctx.fillRect(x1, y1, width, height);
        ctx.strokeRect(x1, y1, width, height);

        if (width > 40) {
          ctx.fillStyle = colorHex;
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.globalAlpha = 0.8;
          ctx.fillText(session.label || '', x1 + 6, y1 + 6);
          ctx.globalAlpha = 1.0;
        }
      });
      ctx.restore();
    });
  }
}

class SessionBoxPrimitive implements ISeriesPrimitive {
  private _sessionCoords: any[];

  private _requestUpdate?: () => void;

  constructor(sessionCoords: any[]) {
    this._sessionCoords = sessionCoords;
  }

  updateSessionCoords(sessionCoords: any[]) {
    this._sessionCoords = sessionCoords;
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  }

  update(requestUpdate: () => void) {
    this._requestUpdate = requestUpdate;
  }

  paneViews(): readonly SeriesPrimitivePaneView[] {
    return [
      {
        renderer: () => new SessionBoxRenderer(this._sessionCoords)
      }
    ];
  }
}

const findCandleTimeForTimestamp = (ts: number | string | undefined | null, candles: any[]): number | null => {
  if (!ts || !candles || candles.length === 0) return null;
  let normalizedTs = Number(ts);
  if (isNaN(normalizedTs)) return null;
  if (normalizedTs > 2000000000) normalizedTs = Math.floor(normalizedTs / 1000);

  const exact = candles.find(c => Number(c.time) === normalizedTs);
  if (exact) return Number(exact.time);

  let closest = candles[0];
  let minDiff = Math.abs(Number(closest.time) - normalizedTs);
  for (let i = 0; i < candles.length; i++) {
    const cTime = Number(candles[i].time);
    const diff = Math.abs(cTime - normalizedTs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = candles[i];
    }
  }

  return Number(closest.time);
};

const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.startsWith('172.'));

import { useCandleStore } from '../services/candleStore';

interface TVChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  candleSource: 'ctrader' | 'metatrader';
  onCandleSourceChange: (source: 'ctrader' | 'metatrader') => void;
  availableSymbols: string[];
  availableTimeframes: string[];
  candles?: Candle[];
  loading?: boolean;
  loadingStrategy?: boolean;
  onRefresh?: (overrideBroker?: string, isBackground?: boolean) => void;
  entryPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  trades?: any[];
  selectedTrade?: any;
  onSelectTrade?: (trade: any) => void;
  dateRangeOption?: string;
  customFrom?: string;
  customTo?: string;
  onSelectCandle?: (candle: any) => void;
  selectedCandle?: any;
  enabledIndicators?: { fvg: boolean };
  fvgs?: any[];
  tradeFilter?: 'all' | 'wins' | 'losses';
  onTradeFilterChange?: (filter: 'all' | 'wins' | 'losses') => void;
  sessions?: any[];
  openPositions?: any[];
  sessionsTimezone?: 'UTC' | 'Local';
  locateTimestamp?: number | null;
  hiddenStages?: string[];
  isLiveFeed?: boolean;
  onLiveFeedChange?: (active: boolean) => void;
  isMobile?: boolean;
  theme?: 'dark' | 'light';
}

export default function TVChart({
  symbol,
  openPositions = [],
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  candleSource,
  onCandleSourceChange,
  availableSymbols,
  availableTimeframes,
  candles,
  loading,
  loadingStrategy,
  onRefresh,
  entryPrice,
  slPrice,
  tpPrice,
  trades = [],
  selectedTrade = null,
  onSelectTrade,
  dateRangeOption = 'last_candles',
  customFrom = '',
  customTo = '',
  onSelectCandle,
  selectedCandle,
  enabledIndicators,
  fvgs = [],
  tradeFilter = 'all',
  onTradeFilterChange,
  sessions = [],
  sessionsTimezone = 'UTC',
  locateTimestamp = null,
  hiddenStages = [],
  isLiveFeed = false,
  onLiveFeedChange,
  isMobile = false,
  theme = 'dark'
}: TVChartProps) {
  const { candles: storeCandles, loading: storeLoading, fetchCandles: storeFetchCandles } = useCandleStore();
  const baseCandles = candles || storeCandles;
  const isChartLoading = loading !== undefined ? loading : storeLoading;
  const handleRefresh = onRefresh || (() => storeFetchCandles(true, false));

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const weisContainerRef = useRef<HTMLDivElement>(null);

  const [liveStrategyState, setLiveStrategyState] = useState<any>(null);

  const [replayTime, setReplayTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [replayToolActive, setReplayToolActive] = useState(false);

  const replayToolActiveRef = useRef(replayToolActive);

  const [executingOrder, setExecutingOrder] = useState(false);
  const [tradeOrderResult, setTradeOrderResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const [tradeVolumeInput, setTradeVolumeInput] = useState<number>(0.01);
  const [selectedOrderBroker, setSelectedOrderBroker] = useState<string>(candleSource || 'metatrader');

  useEffect(() => {
    if (selectedTrade) {
      const vol = selectedTrade.volume || selectedTrade.size || selectedTrade.qty || 0.01;
      setTradeVolumeInput(Number(vol));
      setTradeOrderResult(null);
    }
  }, [selectedTrade]);

  const handleReRunTrade = async () => {
    if (!selectedTrade) return;
    setExecutingOrder(true);
    setTradeOrderResult(null);

    const isBuy = (selectedTrade.type || selectedTrade.side || selectedTrade.direction || 'BUY').toUpperCase() === 'BUY';
    const side = isBuy ? 'buy' : 'sell';

    const slVal = selectedTrade.slPrice ?? selectedTrade.sl ?? selectedTrade.stopLoss;
    const tpVal = selectedTrade.tpPrice ?? selectedTrade.tp ?? selectedTrade.takeProfit;

    const payload: any = {
      broker: selectedOrderBroker,
      symbol: symbol,
      side: side,
      order_type: side,
      volume: tradeVolumeInput,
    };
    if (slVal && Number(slVal) > 0) payload.stop_loss = Number(slVal);
    if (tpVal && Number(tpVal) > 0) payload.take_profit = Number(tpVal);

    try {
      const res = await fetch(`${API_BASE_URL}/api/trade/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.status === 'error') {
        setTradeOrderResult({ status: 'error', message: data.message || 'Broker execution failed' });
      } else {
        setTradeOrderResult({ status: 'success', message: `Order sent! ID/Ticket: ${data.order_id || data.ticket || data.position_id || 'Success'}` });
        if (onRefresh) onRefresh();
      }
    } catch (err: any) {
      setTradeOrderResult({ status: 'error', message: err.message || 'Network error' });
    } finally {
      setExecutingOrder(false);
    }
  };

  const handleJumpToTrade = () => {
    if (!selectedTrade || !chartRef.current || !activeCandles || activeCandles.length === 0) return;
    const ts = selectedTrade.entryTimestamp || selectedTrade.timestamp || selectedTrade.time;
    if (!ts) return;
    const idx = activeCandles.findIndex(c => Number(c.time) === Number(ts));
    if (idx !== -1) {
      try {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: idx - 30,
          to: idx + 30
        });
      } catch (e) {}
    }
  };
  useEffect(() => {
    replayToolActiveRef.current = replayToolActive;
  }, [replayToolActive]);



  const lastValidCandlesRef = useRef<any[]>([]);

  // Clear cached candles when symbol or timeframe changes
  useEffect(() => {
    lastValidCandlesRef.current = [];
  }, [symbol, timeframe]);

  // Update cached candles when valid non-empty candles arrive (require >= 10 candles)
  useEffect(() => {
    if (baseCandles && baseCandles.length >= 10) {
      lastValidCandlesRef.current = baseCandles;
    }
  }, [baseCandles]);

  const currentDisplayCandles = (baseCandles && baseCandles.length >= 10)
    ? baseCandles
    : (lastValidCandlesRef.current.length > 0 ? lastValidCandlesRef.current : baseCandles);


  const activeCandles = replayTime !== null
    ? currentDisplayCandles.filter(c => Number(c.time) <= replayTime)
    : currentDisplayCandles;

  const visibleTrades = replayTime !== null
    ? (trades || []).filter(t => Number(t.entryTimestamp) <= replayTime)
    : trades;


  const visibleFvgs = replayTime !== null
    ? (fvgs || []).filter(f => Number(f.timeStart) <= replayTime)
    : fvgs;

  const stepForward = () => {
    if (replayTime === null || !candles || candles.length === 0) return;
    const currentIndex = candles.findIndex(c => Number(c.time) === replayTime);
    if (currentIndex !== -1 && currentIndex < candles.length - 1) {
      const nextCandle = candles[currentIndex + 1];
      setReplayTime(Number(nextCandle.time));
      if (onSelectCandleRef.current) {
        onSelectCandleRef.current(nextCandle);
      }
    }
  };

  const stepBackward = () => {
    if (replayTime === null || !candles || candles.length === 0) return;
    const currentIndex = candles.findIndex(c => Number(c.time) === replayTime);
    if (currentIndex > 0) {
      const prevCandle = candles[currentIndex - 1];
      setReplayTime(Number(prevCandle.time));
      if (onSelectCandleRef.current) {
        onSelectCandleRef.current(prevCandle);
      }
    }
  };

  // Playback timer for auto-play in replay mode
  useEffect(() => {
    if (!isPlaying || replayTime === null || !candles || candles.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      const currentIndex = candles.findIndex(c => Number(c.time) === replayTime);
      if (currentIndex !== -1 && currentIndex < candles.length - 1) {
        const nextCandle = candles[currentIndex + 1];
        setReplayTime(Number(nextCandle.time));
        if (onSelectCandleRef.current) {
          onSelectCandleRef.current(nextCandle);
        }
      } else {
        setIsPlaying(false);
      }
    }, playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, replayTime, candles, playbackSpeed]);

  // Keyboard shortcuts for replay mode
  useEffect(() => {
    if (replayTime === null) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepForward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [replayTime, candles, isPlaying, playbackSpeed]);

  const [symbolSearch, setSymbolSearch] = useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [localTradeFilter, setLocalTradeFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const actualFilter = onTradeFilterChange ? tradeFilter : localTradeFilter;
  const setActualFilter = onTradeFilterChange || setLocalTradeFilter;

  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_fav_symbols');
      return saved ? JSON.parse(saved) : ['BTCUSD', 'EURUSD', 'XAUUSD'];
    } catch {
      return ['BTCUSD', 'EURUSD', 'XAUUSD'];
    }
  });

  const [favoriteTimeframes, setFavoriteTimeframes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_fav_timeframes');
      return saved ? JSON.parse(saved) : ['5m', '15m', '1h', '4h'];
    } catch {
      return ['5m', '15m', '1h', '4h'];
    }
  });

  useEffect(() => {
    localStorage.setItem('wyckoff_fav_symbols', JSON.stringify(favoriteSymbols));
  }, [favoriteSymbols]);

  useEffect(() => {
    localStorage.setItem('wyckoff_fav_timeframes', JSON.stringify(favoriteTimeframes));
  }, [favoriteTimeframes]);

  const toggleFavoriteSymbol = (sym: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavoriteSymbols(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const toggleFavoriteTimeframe = (tf: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavoriteTimeframes(prev =>
      prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]
    );
  };

  const activeFavSymbols = favoriteSymbols.filter(s => availableSymbols.includes(s));
  const sortedTimeframes = [...availableTimeframes].sort((a, b) => {
    const aFav = favoriteTimeframes.includes(a);
    const bFav = favoriteTimeframes.includes(b);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);

  const filteredSymbols = [...availableSymbols]
    .filter(s => s.toLowerCase().includes(symbolSearch.toLowerCase()))
    .sort((a, b) => {
      const aFav = favoriteSymbols.includes(a);
      const bFav = favoriteSymbols.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.localeCompare(b);
    });

  useEffect(() => {
    setHighlightedIndex(0);
  }, [symbolSearch, showSymbolDropdown]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSymbolDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowSymbolDropdown(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (filteredSymbols.length > 0 ? (prev + 1) % filteredSymbols.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (filteredSymbols.length > 0 ? (prev - 1 + filteredSymbols.length) % filteredSymbols.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSymbols.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredSymbols.length) {
        onSymbolChange(filteredSymbols[highlightedIndex]);
        setShowSymbolDropdown(false);
      }
    } else if (e.key === 'Escape') {
      setShowSymbolDropdown(false);
    }
  };

  const chartRef = useRef<any>(null);
  const weisChartRef = useRef<any>(null);

  const candlestickSeriesRef = useRef<any>(null);
  const markersPluginRef = useRef<any>(null);
  const weisSeriesRef = useRef<any>(null);
  const trHighSeriesRef = useRef<any>(null);
  const trLowSeriesRef = useRef<any>(null);

  const entryLineRef = useRef<any>(null);
  const slLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);
  const beLineRef = useRef<any>(null);
  const wyckoffSupportLineRef = useRef<any>(null);
  const wyckoffResistanceLineRef = useRef<any>(null);
  const supportLineSeriesRef = useRef<any>(null);
  const resistanceLineSeriesRef = useRef<any>(null);
  const smaLineSeriesRef = useRef<any>(null);
  const sessionBoxPrimitiveRef = useRef<any>(null);

  // Drawing Tools State
  const [activeTool, setActiveTool] = useState<'none' | 'trendline' | 'rectangle' | 'delete'>('none');
  const [drawings, setDrawings] = useState<any[]>([]);
  const [drawingPreview, setDrawingPreview] = useState<any>(null);
  const [pixelDrawings, setPixelDrawings] = useState<any[]>([]);
  const [pixelPreview, setPixelPreview] = useState<any>(null);

  const drawingsRef = useRef(drawings);
  const drawingPreviewRef = useRef(drawingPreview);

  const tradesRef = useRef(trades);
  const candlesRef = useRef(candles);
  const onSelectTradeRef = useRef(onSelectTrade);
  const onSelectCandleRef = useRef(onSelectCandle);
  const fvgsRef = useRef(fvgs);
  const dateRangeOptionRef = useRef(dateRangeOption);
  const customFromRef = useRef(customFrom);
  const customToRef = useRef(customTo);
  const sessionsRef = useRef(sessions);

  // References to dynamically generated trade level LineSeries
  const dynamicLineSeriesRef = useRef<any[]>([]);
  const activePositionsRef = useRef<any[]>([]);
  const selectedTradePathSeriesRef = useRef<any>(null);

  useEffect(() => {
    tradesRef.current = visibleTrades;
    updateDrawingCoordinates();
  }, [visibleTrades]);

  useEffect(() => {
    candlesRef.current = activeCandles;
  }, [activeCandles]);

  const fullCandlesRef = useRef(currentDisplayCandles);
  useEffect(() => {
    fullCandlesRef.current = currentDisplayCandles;
  }, [currentDisplayCandles]);

  // Log Wyckoff stage swaps on data load/change
  useEffect(() => {
    if (!candles || candles.length === 0) return;

    let lastLoggedStage = "";
    candles.forEach((c) => {
      const stage = c.wyckoff_stage || 'TRANSITION';
      if (stage !== lastLoggedStage) {
        const dateStr = new Date(Number(c.time) * 1000).toLocaleString('de-CH', { timeZone: 'UTC' });
        const bias = stage === 'ACCUMULATION' || stage === 'MARKUP' ? 'Bullish' : (stage === 'DISTRIBUTION' || stage === 'MARKDOWN' ? 'Bearish' : 'Neutral');
        lastLoggedStage = stage;
      }
    });
  }, [candles]);

  useEffect(() => {
    onSelectCandleRef.current = onSelectCandle;
  }, [onSelectCandle]);

  useEffect(() => {
    onSelectTradeRef.current = onSelectTrade;
  }, [onSelectTrade]);

  useEffect(() => {
    fvgsRef.current = visibleFvgs;
    updateDrawingCoordinates();
  }, [visibleFvgs]);

  useEffect(() => {
    dateRangeOptionRef.current = dateRangeOption;
    updateDrawingCoordinates();
  }, [dateRangeOption]);

  useEffect(() => {
    customFromRef.current = customFrom;
    updateDrawingCoordinates();
  }, [customFrom]);

  useEffect(() => {
    customToRef.current = customTo;
    updateDrawingCoordinates();
  }, [customTo]);

  useEffect(() => {
    sessionsRef.current = sessions;
    updateDrawingCoordinates();
  }, [sessions]);

  const [dateRangeCoords, setDateRangeCoords] = useState<{ x1: number | null; x2: number | null } | null>(null);
  const [selectedTradeCoords, setSelectedTradeCoords] = useState<{ x1: number; x2: number; type: 'BUY' | 'SELL'; pnl: number } | null>(null);
  const [fvgCoords, setFvgCoords] = useState<any[]>([]);
  const [sessionCoords, setSessionCoords] = useState<any[]>([]);
  const [wyckoffZones, setWyckoffZones] = useState<any[]>([]);
  const [oversoldCoords, setOversoldCoords] = useState<any[]>([]);
  const [overboughtCoords, setOverboughtCoords] = useState<any[]>([]);
  const selectedTradeRef = useRef(selectedTrade);

  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [chartSettings, setChartSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('tv_chart_settings');
      const parsed = saved ? JSON.parse(saved) : {};
      return {
        showFvg: parsed.showFvg ?? true,
        showSessions: parsed.showSessions ?? true,
        showTrades: parsed.showTrades ?? true,
        showPositions: parsed.showPositions ?? true,
        showPositionsEntry: parsed.showPositionsEntry ?? true,
        showPositionsSlTp: parsed.showPositionsSlTp ?? true,
        showPositionsSvg: parsed.showPositionsSvg ?? true,
        showTrLines: parsed.showTrLines ?? true,
        autoRefreshCandles: parsed.autoRefreshCandles ?? true,
        autoRefreshSeconds: parsed.autoRefreshSeconds ?? 5,
      };
    } catch {
      return {
        showFvg: true,
        showSessions: true,
        showTrades: true,
        showPositions: true,
        showPositionsEntry: true,
        showPositionsSlTp: true,
        showPositionsSvg: true,
        showTrLines: true,
        autoRefreshCandles: true,
        autoRefreshSeconds: 5,
      };
    }
  });

  useEffect(() => {
    localStorage.setItem('tv_chart_settings', JSON.stringify(chartSettings));
  }, [chartSettings]);

  useEffect(() => {
    // Polling of live strategies endpoint disabled
    setLiveStrategyState(null);
  }, [symbol, timeframe]);

  // Candle polling handled centrally by CandleStore (15s interval)
  const [chartHeight, setChartHeight] = useState(window.innerWidth < 768 ? 380 : 680);
  const [weisHeight, setWeisHeight] = useState(window.innerWidth < 768 ? 100 : 140);
  const chartHeightRef = useRef(chartHeight);
  const weisHeightRef = useRef(weisHeight);

  // Drag state for interactive SL / TP position badges
  const [draggingBadge, setDraggingBadge] = useState<{
    position: any;
    type: 'sl' | 'tp';
    originalPrice: number;
    currentPrice: number;
  } | null>(null);
  const draggingBadgeRef = useRef(draggingBadge);
  useEffect(() => {
    draggingBadgeRef.current = draggingBadge;
  }, [draggingBadge]);

  useEffect(() => {
    chartHeightRef.current = chartHeight;
    weisHeightRef.current = weisHeight;
  }, [chartHeight, weisHeight]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const getChartTimeFormatter = (tz: 'UTC' | 'Local') => {
    return (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      if (tz === 'UTC') {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      } else {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      }
    };
  };

  const getChartTickMarkFormatter = (tz: 'UTC' | 'Local') => {
    return (time: number, tickMarkType: any, locale: string) => {
      const date = new Date(time * 1000);
      if (tz === 'UTC') {
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        if (tickMarkType === 0 || tickMarkType === 1) { // Year or Month
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        return `${hours}:${minutes}`;
      } else {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        if (tickMarkType === 0 || tickMarkType === 1) { // Year or Month
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
        return `${hours}:${minutes}`;
      }
    };
  };

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        localization: {
          timeFormatter: getChartTimeFormatter(sessionsTimezone),
        },
        timeScale: {
          tickMarkFormatter: getChartTickMarkFormatter(sessionsTimezone),
        }
      });
    }
    if (weisChartRef.current) {
      weisChartRef.current.applyOptions({
        localization: {
          timeFormatter: getChartTimeFormatter(sessionsTimezone),
        },
        timeScale: {
          tickMarkFormatter: getChartTickMarkFormatter(sessionsTimezone),
        }
      });
    }
  }, [sessionsTimezone]);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      const totalH = window.innerHeight;
      const isMobileSize = window.innerWidth < 768;
      const newWeisH = isMobileSize ? 100 : 150;
      const newChartH = totalH - (isMobileSize ? 200 : 250);
      setChartHeight(newChartH);
      setWeisHeight(newWeisH);
      setIsFullscreen(true);
    } else {
      const isMobileSize = window.innerWidth < 768;
      setChartHeight(isMobileSize ? 380 : 680);
      setWeisHeight(isMobileSize ? 100 : 140);
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.resize(chartContainerRef.current.clientWidth, chartHeight);
    }
    if (weisChartRef.current && weisContainerRef.current) {
      weisChartRef.current.resize(weisContainerRef.current.clientWidth, weisHeight);
    }
    updateDrawingCoordinates();
  }, [chartHeight, weisHeight]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateDrawingCoordinates();
    }, 50);
    return () => clearTimeout(timer);
  }, [dateRangeOption, customFrom, customTo, activeCandles, enabledIndicators, visibleFvgs, sessions, sessionsTimezone, chartSettings]);

  useEffect(() => {
    selectedTradeRef.current = selectedTrade;
    updateDrawingCoordinates();

    if (selectedTradePathSeriesRef.current && chartRef.current) {
      if (selectedTrade && selectedTrade.entryTimestamp && selectedTrade.exitTimestamp) {
        const sortedTimes = (candlesRef.current || []).map(c => Number(c.time)).sort((a, b) => a - b);
        const entryTs = Number(selectedTrade.entryTimestamp);
        const exitTs = Number(selectedTrade.exitTimestamp);

        const entryIdx = sortedTimes.indexOf(entryTs);
        const exitIdx = sortedTimes.indexOf(exitTs);

        if (entryIdx !== -1 && exitIdx !== -1) {
          const pathPoints = sortedTimes.slice(entryIdx, exitIdx + 1).map((time, idx, arr) => {
            const ratio = arr.length > 1 ? idx / (arr.length - 1) : 1;
            const val = selectedTrade.entryPrice + (selectedTrade.exitPrice - selectedTrade.entryPrice) * ratio;
            return { time, value: val };
          });

          const isProfit = selectedTrade.pnl >= 0;
          selectedTradePathSeriesRef.current.applyOptions({
            color: isProfit ? '#10b981' : '#ef4444',
          });
          selectedTradePathSeriesRef.current.setData(pathPoints);
        } else {
          selectedTradePathSeriesRef.current.setData([]);
        }
      } else {
        selectedTradePathSeriesRef.current.setData([]);
      }
    }
  }, [selectedTrade]);

  useEffect(() => {
    if (locateTimestamp && chartRef.current && activeCandles && activeCandles.length > 0) {
      const idx = activeCandles.findIndex(c => Number(c.time) === Number(locateTimestamp));
      if (idx !== -1) {
        try {
          const timeScale = chartRef.current.timeScale();
          timeScale.setVisibleLogicalRange({
            from: idx - 30,
            to: idx + 30
          });
        } catch (e) {
          console.error('Failed to locate timestamp:', e);
        }
      }
    }
  }, [locateTimestamp, activeCandles]);

  useEffect(() => {
    drawingsRef.current = drawings;
    updateDrawingCoordinates();
  }, [drawings]);

  useEffect(() => {
    drawingPreviewRef.current = drawingPreview;
    updateDrawingCoordinates();
  }, [drawingPreview]);

  const updateDrawingCoordinates = () => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const series = candlestickSeriesRef.current;

    const currentDrawings = drawingsRef.current;
    const currentPreview = drawingPreviewRef.current;
    const currentSessions = sessionsRef.current;

    const updated = currentDrawings.map((d, index) => {
      const x1 = timeScale.timeToCoordinate(d.start.time);
      const y1 = series.priceToCoordinate(d.start.price);
      const x2 = timeScale.timeToCoordinate(d.end.time);
      const y2 = series.priceToCoordinate(d.end.price);
      return { ...d, x1, y1, x2, y2, index };
    }).filter(d => d.x1 !== null && d.y1 !== null && d.x2 !== null && d.y2 !== null);

    setPixelDrawings(updated);

    if (currentPreview) {
      const x1 = timeScale.timeToCoordinate(currentPreview.start.time);
      const y1 = series.priceToCoordinate(currentPreview.start.price);
      const x2 = timeScale.timeToCoordinate(currentPreview.end.time);
      const y2 = series.priceToCoordinate(currentPreview.end.price);
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        setPixelPreview({ type: currentPreview.type, x1, y1, x2, y2 });
      } else {
        setPixelPreview(null);
      }
    } else {
      setPixelPreview(null);
    }

    if (selectedTradeRef.current && selectedTradeRef.current.entryTimestamp) {
      const xEntry = timeScale.timeToCoordinate(selectedTradeRef.current.entryTimestamp);
      const lastCandleTime = candlesRef.current && candlesRef.current.length > 0 ? candlesRef.current[candlesRef.current.length - 1].time : 0;
      const xExit = selectedTradeRef.current.exitTimestamp
        ? timeScale.timeToCoordinate(selectedTradeRef.current.exitTimestamp)
        : (lastCandleTime ? timeScale.timeToCoordinate(lastCandleTime) : null);

      if (xEntry !== null && xExit !== null) {
        setSelectedTradeCoords({
          x1: xEntry,
          x2: xExit,
          type: selectedTradeRef.current.type,
          pnl: selectedTradeRef.current.pnl
        });
      } else {
        setSelectedTradeCoords(null);
      }
    } else {
      setSelectedTradeCoords(null);
    }

    const currentDRE = dateRangeOptionRef.current;
    if (currentDRE && currentDRE !== 'last_candles') {
      const bounds = calculateDateBounds(currentDRE, customFromRef.current, customToRef.current);
      const x1 = bounds.date_from ? timeScale.timeToCoordinate(bounds.date_from) : null;
      const x2 = bounds.date_to ? timeScale.timeToCoordinate(bounds.date_to) : null;
      setDateRangeCoords({ x1, x2 });
    } else {
      setDateRangeCoords(null);
    }

    const visibleRange = timeScale.getVisibleLogicalRange();
    const currentFvgs = fvgsRef.current;
    if (currentFvgs && currentFvgs.length > 0 && candlesRef.current) {
      const candles = candlesRef.current;
      const getCoordinateForTime = (time: number) => {
        const idx = candles.findIndex(c => Number(c.time) === Number(time));
        if (idx !== -1) {
          return timeScale.logicalToCoordinate(idx as any);
        }
        return timeScale.timeToCoordinate(time as any);
      };

      const filteredFvgs = visibleRange
        ? currentFvgs.filter(fvg => {
          const idxStart = candles.findIndex(c => Number(c.time) === Number(fvg.timeStart));
          const idxEnd = candles.findIndex(c => Number(c.time) === Number(fvg.timeEnd));
          if (idxStart === -1 && idxEnd === -1) return false;
          const startLogical = idxStart !== -1 ? idxStart : idxEnd;
          const endLogical = idxEnd !== -1 ? idxEnd : idxStart;
          return startLogical <= visibleRange.to && endLogical >= visibleRange.from;
        })
        : currentFvgs;

      const coords = filteredFvgs.map(fvg => {
        const x1 = getCoordinateForTime(fvg.timeStart);
        const x2 = getCoordinateForTime(fvg.timeEnd);
        const y1 = series.priceToCoordinate(fvg.priceMax);
        const y2 = series.priceToCoordinate(fvg.priceMin);
        return { ...fvg, x1, x2, y1, y2 };
      }).filter(f => f.x1 !== null && f.x2 !== null && f.y1 !== null && f.y2 !== null);
      setFvgCoords(coords);
    } else {
      setFvgCoords([]);
    }

    if (chartSettings.showSessions && currentSessions && currentSessions.length > 0 && candlesRef.current && candlesRef.current.length > 0) {
      const activeCoords: any[] = [];
      const startIdxLimit = visibleRange ? Math.max(0, Math.floor(visibleRange.from) - 5) : 0;
      const endIdxLimit = visibleRange ? Math.min(candlesRef.current.length - 1, Math.ceil(visibleRange.to) + 5) : candlesRef.current.length - 1;

      const currentCandles = candlesRef.current;
      currentSessions.forEach(session => {
        const [startH, startM] = session.start.split(':').map(Number);
        const [endH, endM] = session.end.split(':').map(Number);
        const startVal = startH * 60 + startM;
        const endVal = endH * 60 + endM;

        let sessionActiveStartIdx: number | null = null;
        let sessionHigh = -Infinity;
        let sessionLow = Infinity;

        const getSessionMinutes = (time: number) => {
          const formatter = getChartTimeFormatter(sessionsTimezone);
          const formatted = formatter(time);
          const timePart = formatted.split(' ')[1];
          const [h, m] = timePart.split(':').map(Number);
          return h * 60 + m;
        };

        const getSessionWeekday = (time: number) => {
          const d = new Date(time * 1000);
          let day = d.getDay();
          if (sessionsTimezone === 'UTC') {
            day = d.getUTCDay();
          }
          return day === 0 ? 7 : day;
        };

        for (let i = startIdxLimit; i <= endIdxLimit; i++) {
          const candle = currentCandles[i];
          if (!candle) continue;
          const minutes = getSessionMinutes(candle.time);
          const weekday = getSessionWeekday(candle.time);

          const isWeekdayMatching = session.weekdays ? session.weekdays.includes(weekday) : true;
          let isInSession = false;
          if (isWeekdayMatching) {
            if (startVal <= endVal) {
              isInSession = minutes >= startVal && minutes < endVal;
            } else {
              isInSession = minutes >= startVal || minutes < endVal;
            }
          }

          if (isInSession) {
            if (sessionActiveStartIdx === null) {
              sessionActiveStartIdx = i;
              sessionHigh = candle.high;
              sessionLow = candle.low;
            } else {
              sessionHigh = Math.max(sessionHigh, candle.high);
              sessionLow = Math.min(sessionLow, candle.low);
            }
          }

          const isLastCandle = i === endIdxLimit;
          const willCloseSession = !isInSession || isLastCandle;

          if (willCloseSession && sessionActiveStartIdx !== null) {
            const endIdx = isInSession ? i : i - 1;
            const t1 = currentCandles[sessionActiveStartIdx]?.time;
            const t2 = currentCandles[endIdx]?.time;

            const x1 = timeScale.timeToCoordinate(t1);
            const x2 = timeScale.timeToCoordinate(t2);
            const y1 = series.priceToCoordinate(sessionHigh);
            const y2 = series.priceToCoordinate(sessionLow);

            if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
              activeCoords.push({
                x1,
                x2,
                y1,
                y2,
                color: session.color || '#3b82f6',
                label: `${session.start}-${session.end}`
              });
            }

            sessionActiveStartIdx = null;
            sessionHigh = -Infinity;
            sessionLow = Infinity;
          }
        }
      });

      if (sessionBoxPrimitiveRef.current) {
        sessionBoxPrimitiveRef.current.updateSessionCoords(activeCoords);
      }
      setSessionCoords(activeCoords);
    } else {
      if (sessionBoxPrimitiveRef.current) {
        sessionBoxPrimitiveRef.current.updateSessionCoords([]);
      }
      setSessionCoords([]);
    }

    const currentCandles = candlesRef.current;
    if (currentCandles && currentCandles.length > 0) {
      const startIdxLimit = visibleRange ? Math.max(0, Math.floor(visibleRange.from) - 5) : 0;
      const endIdxLimit = visibleRange ? Math.min(currentCandles.length - 1, Math.ceil(visibleRange.to) + 5) : currentCandles.length - 1;

      const zones: any[] = [];
      let currentZone: any = null;

      for (let i = startIdxLimit; i <= endIdxLimit; i++) {
        const c = currentCandles[i];
        const stage = c.wyckoff_stage || 'TRANSITION';

        if (!currentZone) {
          currentZone = { stage, startIdx: i, endIdx: i };
        } else if (currentZone.stage === stage) {
          currentZone.endIdx = i;
        } else {
          zones.push(currentZone);
          currentZone = { stage, startIdx: i, endIdx: i };
        }
      }
      if (currentZone) {
        zones.push(currentZone);
      }

      const zoneCoords = zones.map(z => {
        const t1 = currentCandles[z.startIdx]?.time;
        const t2 = currentCandles[z.endIdx]?.time;
        const x1 = t1 !== undefined ? timeScale.timeToCoordinate(t1) : null;
        const x2 = t2 !== undefined ? timeScale.timeToCoordinate(t2) : null;
        return { ...z, x1, x2 };
      }).filter(z => z.x1 !== null && z.x2 !== null);

      setWyckoffZones(zoneCoords);

      const oversold: any[] = [];
      const overbought: any[] = [];

      for (let i = startIdxLimit; i <= endIdxLimit; i++) {
        const c = currentCandles[i];
        if (c.support_level !== undefined && c.low < c.support_level) {
          const x = timeScale.timeToCoordinate(c.time);
          const ySupport = series.priceToCoordinate(c.support_level);
          const yLow = series.priceToCoordinate(c.low);

          if (x !== null && ySupport !== null && yLow !== null) {
            oversold.push({ x, y1: ySupport, y2: yLow });
          }
        }

        if (c.resistance_level !== undefined && c.high > c.resistance_level) {
          const x = timeScale.timeToCoordinate(c.time);
          const yResistance = series.priceToCoordinate(c.resistance_level);
          const yHigh = series.priceToCoordinate(c.high);

          if (x !== null && yResistance !== null && yHigh !== null) {
            overbought.push({ x, y1: yResistance, y2: yHigh });
          }
        }
      }
      setOversoldCoords(oversold);
      setOverboughtCoords(overbought);
    } else {
      setWyckoffZones([]);
      setOversoldCoords([]);
      setOverboughtCoords([]);
    }
  };

  // Sync Charts & Render Data
  useEffect(() => {
    if (!chartContainerRef.current || !weisContainerRef.current) return;

    const isLight = theme === 'light';
    const chartBg = isLight ? '#ffffff' : '#111827';
    const textColor = isLight ? '#0f172a' : '#d1d5db';
    const gridColor = isLight ? '#e2e8f0' : '#1f2937';

    // Initialize Main Chart
    const mainChart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: chartBg },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
      timeScale: {
        fixRightEdge: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: getChartTickMarkFormatter(sessionsTimezone),
      },
      localization: {
        timeFormatter: getChartTimeFormatter(sessionsTimezone),
      },
      width: chartContainerRef.current.clientWidth || (window.innerWidth - 32),
      height: window.innerWidth < 768 ? 380 : 680,
    });

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const markersPlugin = createSeriesMarkers(candlestickSeries);

    const trHighSeries = mainChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: 1, // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const trLowSeries = mainChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: 1, // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const supportLineSeries = mainChart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1 as any,
      lineStyle: 1, // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const resistanceLineSeries = mainChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1 as any,
      lineStyle: 1, // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const smaLineSeries = mainChart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const weisChart = createChart(weisContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: chartBg },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
      },
      timeScale: {
        fixRightEdge: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: getChartTickMarkFormatter(sessionsTimezone),
      },
      localization: {
        timeFormatter: getChartTimeFormatter(sessionsTimezone),
      },
      width: weisContainerRef.current.clientWidth || (window.innerWidth - 32),
      height: window.innerWidth < 768 ? 100 : 140,
    });

    const weisSeries = weisChart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
    });

    let isSyncing = false;
    let animationFrameId: number | null = null;
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      try {
        weisChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) { }
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        updateDrawingCoordinates();
      });
      isSyncing = false;
    });

    weisChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      try {
        mainChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) { }
      isSyncing = false;
    });

    chartRef.current = mainChart;
    weisChartRef.current = weisChart;
    candlestickSeriesRef.current = candlestickSeries;
    markersPluginRef.current = markersPlugin;
    weisSeriesRef.current = weisSeries;
    trHighSeriesRef.current = trHighSeries;
    trLowSeriesRef.current = trLowSeries;
    supportLineSeriesRef.current = supportLineSeries;
    resistanceLineSeriesRef.current = resistanceLineSeries;
    smaLineSeriesRef.current = smaLineSeries;

    const sessionBoxPrimitive = new SessionBoxPrimitive([]);
    candlestickSeries.attachPrimitive(sessionBoxPrimitive);
    sessionBoxPrimitiveRef.current = sessionBoxPrimitive;

    const selectedTradePathSeries = mainChart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      lineStyle: 2, // Dotted
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    selectedTradePathSeriesRef.current = selectedTradePathSeries;

    mainChart.subscribeClick((param) => {
      if (!param.time) return;
      const clickTime = param.time as number;

      let tradeFound = false;
      if (onSelectTradeRef.current && tradesRef.current && tradesRef.current.length > 0) {
        const foundTrade = tradesRef.current.find(t =>
          t.entryTimestamp === clickTime ||
          t.exitTimestamp === clickTime ||
          t.timestamp === clickTime
        );
        if (foundTrade) {
          onSelectTradeRef.current(foundTrade);
          tradeFound = true;
        }
      }

      if (tradeFound) return;

      if (onSelectCandleRef.current && fullCandlesRef.current) {
        const foundCandle = fullCandlesRef.current.find(c => Number(c.time) === clickTime);
        if (foundCandle) {
          onSelectCandleRef.current(foundCandle);
          if (replayToolActiveRef.current) {
            setReplayTime(clickTime);
          }
        }
      }
    });

    const handleResize = () => {
      const isMobileSize = window.innerWidth < 768;
      let newChartH = isMobileSize ? 380 : 680;
      let newWeisH = isMobileSize ? 100 : 140;

      if (document.getElementById('tv-chart-fullscreen-container')) {
        const totalH = window.innerHeight;
        newWeisH = isMobileSize ? 100 : 150;
        newChartH = totalH - (isMobileSize ? 200 : 250);
      }

      setChartHeight(newChartH);
      setWeisHeight(newWeisH);

      if (chartContainerRef.current && mainChart) {
        mainChart.resize(chartContainerRef.current.clientWidth || (window.innerWidth - 32), newChartH);
      }
      if (weisContainerRef.current && weisChart) {
        weisChart.resize(weisContainerRef.current.clientWidth || (window.innerWidth - 32), newWeisH);
      }
      updateDrawingCoordinates();
    };

    window.addEventListener('resize', handleResize);

    // Dynamic theme options update
    const updateThemeOptions = () => {
      if (!mainChart || !weisChart) return;
      const isL = theme === 'light';
      const cBg = isL ? '#ffffff' : '#111827';
      const tCol = isL ? '#0f172a' : '#d1d5db';
      const gCol = isL ? '#e2e8f0' : '#1f2937';
      
      mainChart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: cBg },
          textColor: tCol,
        },
        grid: {
          vertLines: { color: gCol },
          horzLines: { color: gCol },
        },
      });
      weisChart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: cBg },
          textColor: tCol,
        },
        grid: {
          vertLines: { color: gCol },
          horzLines: { color: gCol },
        },
      });
    };
    updateThemeOptions();

    // Watch for card/container resizes via ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      if (!chartContainerRef.current || !mainChart) return;
      const width = chartContainerRef.current.clientWidth;

      // Dynamically calculate chart and weis heights based on parent card height if defined
      const parentCard = chartContainerRef.current.closest('.no-drag')?.parentElement;
      if (parentCard) {
        const parentHeight = parentCard.clientHeight;
        if (parentHeight > 200) {
          // Total space inside card minus header desk height (~48px)
          const usableHeight = parentHeight - 55;
          // Allocate 75% to main chart and 25% to Weis Wave volume
          const newChartH = Math.max(120, Math.floor(usableHeight * 0.72));
          const newWeisH = Math.max(60, Math.floor(usableHeight * 0.24));
          setChartHeight(newChartH);
          setWeisHeight(newWeisH);
        }
      }

      if (width > 0) {
        mainChart.resize(width, chartHeightRef.current);
        if (weisContainerRef.current && weisChart) {
          weisChart.resize(weisContainerRef.current.clientWidth, weisHeightRef.current);
        }
        updateDrawingCoordinates();
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      dynamicLineSeriesRef.current.forEach((series) => {
        try {
          mainChart.removeSeries(series);
        } catch (e) { }
      });
      dynamicLineSeriesRef.current = [];
      if (selectedTradePathSeriesRef.current) {
        try {
          mainChart.removeSeries(selectedTradePathSeriesRef.current);
        } catch (e) { }
        selectedTradePathSeriesRef.current = null;
      }
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      mainChart.remove();
      weisChart.remove();
    };
  }, []);

  // Update Data Series
  useEffect(() => {
    if (!activeCandles || activeCandles.length === 0) return;

    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(activeCandles);

      const tradeEntryMap = new Map<number, any>();
      (visibleTrades || []).forEach((t) => {
        const ts = Number(t.entryTimestamp);
        if (!isNaN(ts)) {
          tradeEntryMap.set(ts, t);
        }
      });

      const entryMarkers = activeCandles
        .map((c) => {
          if (!chartSettings.showTrades) return null;
          const candleTime = Number(c.time);
          const trade = tradeEntryMap.get(candleTime);

          if (c.backtest_signal || trade) {
            const isBullish = trade ? (trade.type || trade.side || 'BUY').toUpperCase() === 'BUY' : c.backtest_signal === 'BUY';
            const isProfit = trade ? trade.pnl >= 0 : true;

            if (trade) {
              if (actualFilter === 'wins' && !isProfit) return null;
              if (actualFilter === 'losses' && isProfit) return null;
            }

            const baseColor = isBullish ? '#10b981' : '#ef4444';

            let markerText = isBullish ? 'BUY' : 'SELL';
            if (trade && trade.pnl !== undefined) {
              const pnlStr = trade.pnl >= 0 ? `+${Number(trade.pnl).toFixed(2)}` : `${Number(trade.pnl).toFixed(2)}`;
              markerText += ` (${isProfit ? 'WIN' : 'LOSS'} ${pnlStr})`;
            }

            return {
              time: c.time,
              position: (isBullish ? 'belowBar' : 'aboveBar') as any,
              color: baseColor,
              shape: (isBullish ? 'arrowUp' : 'arrowDown') as any,
              text: markerText,
              size: 1,
            };
          }
          return null;
        })
        .filter((m) => m !== null);

      const exitMarkers = chartSettings.showTrades ? (visibleTrades || [])
        .map((trade) => {
          if (!trade.exitTimestamp) return null;
          if (replayTime !== null && Number(trade.exitTimestamp) > replayTime) return null;
          if (trade.exitReason === 'Position still open') return null;
          if (trade.exitTimestamp === trade.entryTimestamp) return null;
          const isProfit = trade.pnl >= 0;

          if (actualFilter === 'wins' && !isProfit) return null;
          if (actualFilter === 'losses' && isProfit) return null;

          const baseColor = isProfit ? '#10b981' : '#ef4444';

          const exitTime = Number(trade.exitTimestamp);
          if (isNaN(exitTime)) return null;

          return {
            time: exitTime as any,
            position: (trade.type === 'BUY' ? 'aboveBar' : 'belowBar') as any,
            color: baseColor,
            shape: 'circle' as any,
            text: `EXIT (${isProfit ? '+' : ''}${trade.pnl.toFixed(2)})`,
            size: 1,
          };
        })
        .filter((m) => m !== null) : [];

      let openPositionsList: any[] = [];
      if (Array.isArray(openPositions) && openPositions.length > 0) {
        openPositionsList = openPositions;
      } else {
        try {
          const stored = localStorage.getItem('wyckoff_active_positions');
          if (stored) openPositionsList = JSON.parse(stored);
        } catch (e) {}
      }

      const currentSymbolClean = (symbol || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const matchingOpenPositions = (openPositionsList || []).filter((p) => {
        if (!p || !p.symbol) return false;
        const posSymbolClean = String(p.symbol).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        return posSymbolClean.includes(currentSymbolClean) || currentSymbolClean.includes(posSymbolClean);
      });

      const openPositionMarkers: any[] = [];
      if (chartSettings.showPositions !== false) {
        matchingOpenPositions.forEach((pos) => {
          let rawTs = pos.entry_timestamp ?? pos.entryTimestamp ?? pos.timestamp ?? pos.open_time ?? pos.openTime ?? pos.time;
          if (rawTs && Number(rawTs) > 2000000000) {
            rawTs = Math.floor(Number(rawTs) / 1000);
          }
          if (rawTs) {
            rawTs = Number(rawTs) - 10800;
          }
          const matchedTime = findCandleTimeForTimestamp(rawTs, activeCandles);

          const formatHHMM = (ts: number | string | null | undefined, isUtc = false) => {
            if (!ts) return 'N/A';
            const d = new Date(Number(ts) * 1000);
            if (isNaN(d.getTime())) return 'N/A';
            if (isUtc) {
              const h = String(d.getUTCHours()).padStart(2, '0');
              const m = String(d.getUTCMinutes()).padStart(2, '0');
              return `${h}:${m}`;
            } else {
              const h = String(d.getHours()).padStart(2, '0');
              const m = String(d.getMinutes()).padStart(2, '0');
              return `${h}:${m}`;
            }
          };

          const posDateUtc = rawTs ? new Date(Number(rawTs) * 1000).toISOString() : 'N/A';
          const posDateLocal = rawTs ? new Date(Number(rawTs) * 1000).toLocaleString() : 'N/A';
          const matchedDateUtc = matchedTime ? new Date(Number(matchedTime) * 1000).toISOString() : 'N/A';
          const matchedDateLocal = matchedTime ? new Date(Number(matchedTime) * 1000).toLocaleString() : 'N/A';

          console.log('[DEBUG Position Marker]', {
            position: pos,
            rawTimestamp: rawTs,
            positionTimeUTC: posDateUtc,
            matchedCandleTimestamp: matchedTime,
            matchedCandleUTC: matchedDateUtc,
          });

          const positionMarkerTime = rawTs ? Number(rawTs) : matchedTime;

          if (positionMarkerTime !== null) {
            const isBuy = (pos.trade_side || pos.side || pos.type || 'BUY').toUpperCase() === 'BUY';
            const baseColor = isBuy ? '#3b82f6' : '#ec4899';
            const volume = pos.volume !== undefined ? pos.volume : '';
            const entryPriceVal = parseFloat(pos.entry_price ?? pos.entryPrice ?? 0);
            const priceText = entryPriceVal > 0 ? ` @ ${entryPriceVal.toFixed(2)}` : '';

            openPositionMarkers.push({
              time: positionMarkerTime as any,
              position: (isBuy ? 'belowBar' : 'aboveBar') as any,
              color: baseColor,
              shape: (isBuy ? 'arrowUp' : 'arrowDown') as any,
              text: `ENTRY ${isBuy ? 'BUY' : 'SELL'} ${volume}${priceText}`,
              size: 2,
            });
          }
        });
      }

      const validCandleTimes = new Set(activeCandles.flatMap(c => [c.time, Number(c.time)]));
      const minCandleTime = activeCandles.length > 0 ? Number(activeCandles[0].time) : 0;
      const maxCandleTime = activeCandles.length > 0 ? Number(activeCandles[activeCandles.length - 1].time) : Infinity;

      const allMarkers = [...entryMarkers, ...exitMarkers, ...openPositionMarkers]
        .filter((m) => {
          if (!m || m.time == null || m.time === '' || m.position == null || m.color == null || m.shape == null) return false;
          const t = Number(m.time);
          return validCandleTimes.has(m.time) || validCandleTimes.has(t) || (t >= minCandleTime && t <= maxCandleTime + 86400);
        })
        .sort((a, b) => {
          const timeA = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
          const timeB = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
          return timeA - timeB;
        });

      if (markersPluginRef.current) {
        try {
          markersPluginRef.current.setMarkers(allMarkers.map(m => ({
            time: m.time,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text || '',
            size: m.size || 1
          })));
        } catch (err) {
          console.warn('Failed to set markers on chart:', err);
        }
      }
    }

    const hasAnalysis = activeCandles.some(c => c.tr_high !== undefined || c.support_level !== undefined);
    const hasDetailedWyckoff = activeCandles.some(c => c.support_level !== undefined);

    if (trHighSeriesRef.current && trLowSeriesRef.current) {
      if (hasAnalysis && chartSettings.showTrLines && !hasDetailedWyckoff) {
        const highData = activeCandles.map(c => ({ time: c.time, value: c.tr_high || c.high }));
        const lowData = activeCandles.map(c => ({ time: c.time, value: c.tr_low || c.low }));
        trHighSeriesRef.current.setData(highData);
        trLowSeriesRef.current.setData(lowData);
      } else {
        trHighSeriesRef.current.setData([]);
        trLowSeriesRef.current.setData([]);
      }
    }

    if (supportLineSeriesRef.current && resistanceLineSeriesRef.current && smaLineSeriesRef.current) {
      const supportData: any[] = [];
      const resistanceData: any[] = [];
      const smaData: any[] = [];

      activeCandles.forEach(c => {
        let stageColor = '#cbd5e1';
        if (c.wyckoff_stage === 'ACCUMULATION') stageColor = '#3b82f6';
        else if (c.wyckoff_stage === 'MARKUP') stageColor = '#10b981';
        else if (c.wyckoff_stage === 'DISTRIBUTION') stageColor = '#f59e0b';
        else if (c.wyckoff_stage === 'MARKDOWN') stageColor = '#ef4444';

        if (chartSettings.showTrLines) {
          if (c.support_level !== undefined && c.support_level !== null) {
            supportData.push({ time: c.time, value: c.support_level, color: stageColor });
          }
          if (c.resistance_level !== undefined && c.resistance_level !== null) {
            resistanceData.push({ time: c.time, value: c.resistance_level, color: stageColor });
          }
        }
        if (c.sma_20 !== undefined && c.sma_20 !== null) {
          smaData.push({ time: c.time, value: c.sma_20, color: stageColor });
        }
      });

      supportLineSeriesRef.current.setData(chartSettings.showTrLines ? supportData : []);
      resistanceLineSeriesRef.current.setData(chartSettings.showTrLines ? resistanceData : []);
      smaLineSeriesRef.current.setData(smaData);
    }

    if (weisSeriesRef.current) {
      const volumeData = activeCandles.map((c) => {
        const isUp = c.close >= c.open;
        return {
          time: c.time,
          value: c.volume || 0,
          color: isUp ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)',
        };
      });
      weisSeriesRef.current.setData(volumeData);
    }

    if (chartRef.current && activeCandles.length > 0) {
      dynamicLineSeriesRef.current.forEach((series) => {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) { }
      });
      dynamicLineSeriesRef.current = [];

      if (chartSettings.showTrades) {
        const realTrades = (visibleTrades || []).filter(
          (t) => t.entryTimestamp && t.entryPrice && t.slPrice && t.tpPrice
        );

        const sortedTimes = activeCandles.map((c) => Number(c.time)).sort((a, b) => a - b);
        const SEGMENT_BARS = 3;

        realTrades.forEach((trade) => {
          const entryTs = Number(trade.entryTimestamp);
          const entryIdx = sortedTimes.findIndex((t) => t === entryTs);
          if (entryIdx === -1) return;

          const endIdx = Math.min(entryIdx + SEGMENT_BARS, sortedTimes.length);
          const points = sortedTimes.slice(entryIdx, endIdx);
          if (points.length === 0) return;

          const isProfit = trade.pnl >= 0;
          if (actualFilter === 'wins' && !isProfit) return;
          if (actualFilter === 'losses' && isProfit) return;

          const entryData = points.map((p) => ({ time: p, value: trade.entryPrice }));
          const slData = points.map((p) => ({ time: p, value: trade.slPrice }));
          const tpData = points.map((p) => ({ time: p, value: trade.tpPrice }));

          const addTradeLine = (data: any[], color: string, lineStyle: number = 0) => {
            const lineSeries = chartRef.current.addSeries(LineSeries, {
              color,
              lineWidth: 2,
              lineStyle,
              lastValueVisible: false,
              priceLineVisible: false,
              crosshairMarkerVisible: false,
            });
            lineSeries.setData(data);
            dynamicLineSeriesRef.current.push(lineSeries);
          };

          addTradeLine(entryData, '#3b82f6');

          const hasOriginalSl = trade.originalSlPrice !== undefined && trade.originalSlPrice !== null && trade.originalSlPrice !== trade.slPrice;
          if (hasOriginalSl) {
            // Draw BE stop loss line in yellow/orange
            addTradeLine(slData, '#fbbf24');
            // Draw original stop loss line in dashed red
            const originalSlData = points.map((p) => ({ time: p, value: trade.originalSlPrice }));
            addTradeLine(originalSlData, '#ef4444', 1);
          } else {
            // Draw regular stop loss line in red
            addTradeLine(slData, '#ef4444');
          }

          addTradeLine(tpData, '#10b981');
        });
      }
    }

    updateDrawingCoordinates();
  }, [activeCandles, visibleTrades, actualFilter, chartSettings.showTrades, chartSettings.showTrLines, replayTime]);

  // Update price format and precision dynamically based on candle data
  useEffect(() => {
    if (!candlestickSeriesRef.current || !activeCandles || activeCandles.length === 0) return;

    let maxDecimals = 2;
    const sampleSize = Math.min(activeCandles.length, 50);
    for (let i = 0; i < sampleSize; i++) {
      const candle = activeCandles[i];
      const prices = [candle.open, candle.high, candle.low, candle.close];
      for (const price of prices) {
        if (price !== undefined && price !== null) {
          // Strip trailing zeroes to measure true precision
          const numStr = Number(price).toString();
          const parts = numStr.split('.');
          if (parts.length === 2) {
            const decimals = parts[1].length;
            if (decimals > maxDecimals) {
              maxDecimals = decimals;
            }
          }
        }
      }
    }

    // Cap precision at 5 (standard for forex pairs like EURUSD, 2-3 for JPY, 2 for Crypto/Indices)
    const precision = Math.max(2, Math.min(maxDecimals, 5));
    const minMove = Math.pow(10, -precision);

    const priceFormat = {
      type: 'price' as const,
      precision,
      minMove,
    };

    candlestickSeriesRef.current.applyOptions({ priceFormat });
    if (trHighSeriesRef.current) trHighSeriesRef.current.applyOptions({ priceFormat });
    if (trLowSeriesRef.current) trLowSeriesRef.current.applyOptions({ priceFormat });
    if (supportLineSeriesRef.current) supportLineSeriesRef.current.applyOptions({ priceFormat });
    if (resistanceLineSeriesRef.current) resistanceLineSeriesRef.current.applyOptions({ priceFormat });
    if (smaLineSeriesRef.current) smaLineSeriesRef.current.applyOptions({ priceFormat });
  }, [symbol, activeCandles]);



  useEffect(() => {
    if (candlestickSeriesRef.current) {
      if (entryLineRef.current) {
        candlestickSeriesRef.current.removePriceLine(entryLineRef.current);
        entryLineRef.current = null;
      }
      if (slLineRef.current) {
        candlestickSeriesRef.current.removePriceLine(slLineRef.current);
        slLineRef.current = null;
      }
      if (tpLineRef.current) {
        candlestickSeriesRef.current.removePriceLine(tpLineRef.current);
        tpLineRef.current = null;
      }
      if (beLineRef.current) {
        candlestickSeriesRef.current.removePriceLine(beLineRef.current);
        beLineRef.current = null;
      }

      const isSelectedTradeFinished = selectedTrade && (
        selectedTrade.exitTimestamp ||
        (selectedTrade.exitReason && selectedTrade.exitReason !== 'Position still open') ||
        selectedTrade.status === 'closed'
      );

      if (chartSettings.showTrades && !isSelectedTradeFinished) {
        if (entryPrice) {
          entryLineRef.current = candlestickSeriesRef.current.createPriceLine({
            price: entryPrice,
            color: '#3b82f6',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'Entry',
          });
        }
        if (slPrice) {
          slLineRef.current = candlestickSeriesRef.current.createPriceLine({
            price: slPrice,
            color: '#ef4444',
            lineWidth: 2,
            lineStyle: 1,
            axisLabelVisible: true,
            title: 'SL',
          });
        }
        if (tpPrice) {
          tpLineRef.current = candlestickSeriesRef.current.createPriceLine({
            price: tpPrice,
            color: '#10b981',
            lineWidth: 2,
            lineStyle: 1,
            axisLabelVisible: true,
            title: 'TP',
          });
        }
        if (entryPrice && slPrice) {
          const bePrice = 2 * entryPrice - slPrice;
          beLineRef.current = candlestickSeriesRef.current.createPriceLine({
            price: bePrice,
            color: '#fbbf24',
            lineWidth: 2,
            lineStyle: 1,
            axisLabelVisible: true,
            title: '1:1 BE',
          });
        }
      }
    }
  }, [entryPrice, slPrice, tpPrice, selectedTrade, candles, chartSettings.showTrades]);

  // Effect for rendering active live positions (Entry, SL, TP)
  useEffect(() => {
    let positionsList: any[] = [];
    if (Array.isArray(openPositions) && openPositions.length > 0) {
      positionsList = openPositions;
    } else {
      try {
        const stored = localStorage.getItem('wyckoff_active_positions');
        if (stored) {
          positionsList = JSON.parse(stored);
        }
      } catch (e) {}
    }

    if (!Array.isArray(positionsList) || positionsList.length === 0) {
      if (activePositionsRef.current.length > 0) {
        activePositionsRef.current.forEach((item) => {
          try {
            if (item.type === 'priceLine' && candlestickSeriesRef.current) {
              candlestickSeriesRef.current.removePriceLine(item.line);
            } else if (item.type === 'lineSeries' && chartRef.current) {
              chartRef.current.removeSeries(item.line);
            }
          } catch (e) {}
        });
        activePositionsRef.current = [];
      }
      return;
    }

    if (!candlestickSeriesRef.current || !chartRef.current || !activeCandles || activeCandles.length === 0) return;

    if (activePositionsRef.current.length > 0) {
      activePositionsRef.current.forEach((item) => {
        try {
          if (item.type === 'priceLine' && candlestickSeriesRef.current) {
            candlestickSeriesRef.current.removePriceLine(item.line);
          } else if (item.type === 'lineSeries' && chartRef.current) {
            chartRef.current.removeSeries(item.line);
          }
        } catch (e) {}
      });
      activePositionsRef.current = [];
    }

    const currentSymbolClean = (symbol || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const matchingPositions = positionsList.filter((p) => {
      if (!p || !p.symbol) return false;
      const posSymbolClean = String(p.symbol).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return posSymbolClean.includes(currentSymbolClean) || currentSymbolClean.includes(posSymbolClean);
    });

    if (matchingPositions.length === 0) return;

    const sortedTimes = activeCandles.map((c) => Number(c.time)).sort((a, b) => a - b);

    matchingPositions.forEach((pos) => {
      const side = (pos.trade_side || 'BUY').toUpperCase();
      const volume = pos.volume !== undefined ? pos.volume : '';
      const entryPriceVal = parseFloat(pos.entry_price ?? pos.entryPrice);
      const slVal = parseFloat(pos.stop_loss ?? pos.sl ?? 0);
      const tpVal = parseFloat(pos.take_profit ?? pos.tp ?? 0);
      const entryTs = pos.entry_timestamp ? Number(pos.entry_timestamp) : null;

      if (isNaN(entryPriceVal) || entryPriceVal <= 0) return;

      const isBuy = side === 'BUY';
      const entryColor = isBuy ? '#3b82f6' : '#ec4899';
      const slColor = '#ef4444';
      const tpColor = '#10b981';

      const pnlVal = parseFloat(pos.unrealized_profit ?? pos.pnl ?? pos.profit ?? pos.unrealized_pnl ?? 0);
      const pnlStr = !isNaN(pnlVal) ? ` (P&L: ${pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)})` : '';

      // Calculate Dollar SL loss / TP win estimate
      const volNum = parseFloat(volume as any) || 0;
      // standard contract multiplier approximation: forex / CFD contract size = 100,000 for 1 lot
      const isJpy = (symbol || '').toUpperCase().includes('JPY');
      const multiplier = isJpy ? 1000 : 100000;

      let slLossStr = '';
      if (slVal > 0 && volNum > 0) {
        const slDiff = isBuy ? (entryPriceVal - slVal) : (slVal - entryPriceVal);
        const estLoss = Math.abs(slDiff * volNum * multiplier);
        slLossStr = ` (-$${estLoss.toFixed(2)})`;
      }

      let tpWinStr = '';
      if (tpVal > 0 && volNum > 0) {
        const tpDiff = isBuy ? (tpVal - entryPriceVal) : (entryPriceVal - tpVal);
        const estWin = Math.abs(tpDiff * volNum * multiplier);
        tpWinStr = ` (+$${estWin.toFixed(2)})`;
      }

      // 1. Full horizontal price lines across price scale
      if (chartSettings.showPositionsEntry !== false) {
        const entryPriceLine = candlestickSeriesRef.current.createPriceLine({
          price: entryPriceVal,
          color: entryColor,
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: '',
        });
        activePositionsRef.current.push({ type: 'priceLine', line: entryPriceLine });
      }

      if (chartSettings.showPositionsSlTp !== false) {
        if (slVal > 0) {
          const slPriceLine = candlestickSeriesRef.current.createPriceLine({
            price: slVal,
            color: slColor,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '',
          });
          activePositionsRef.current.push({ type: 'priceLine', line: slPriceLine });
        }

        if (tpVal > 0) {
          const tpPriceLine = candlestickSeriesRef.current.createPriceLine({
            price: tpVal,
            color: tpColor,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '',
          });
          activePositionsRef.current.push({ type: 'priceLine', line: tpPriceLine });
        }
      }

      // 2. Line segments starting from entry timestamp to current candle
      if (entryTs) {
        let startIdx = sortedTimes.findIndex((t) => t >= entryTs);
        if (startIdx === -1) {
          startIdx = 0;
        }

        const segmentTimes = sortedTimes.slice(startIdx);
        if (segmentTimes.length > 0) {
          const createSegmentSeries = (val: number, color: string, style: number = 0) => {
            const lineSeries = chartRef.current.addSeries(LineSeries, {
              color,
              lineWidth: 2,
              lineStyle: style,
              lastValueVisible: false,
              priceLineVisible: false,
              crosshairMarkerVisible: false,
            });
            const lineData = segmentTimes.map((t) => ({ time: t, value: val }));
            lineSeries.setData(lineData);
            activePositionsRef.current.push({ type: 'lineSeries', line: lineSeries });
          };

          if (chartSettings.showPositionsEntry !== false) {
            createSegmentSeries(entryPriceVal, entryColor, 0);
          }
          if (chartSettings.showPositionsSlTp !== false) {
            if (slVal > 0) createSegmentSeries(slVal, slColor, 1);
            if (tpVal > 0) createSegmentSeries(tpVal, tpColor, 1);
          }
        }
      }
    });
  }, [openPositions, chartSettings.showPositions, chartSettings.showPositionsEntry, chartSettings.showPositionsSlTp, activeCandles, symbol]);

  const handleSVGMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'none' || activeTool === 'delete') return;
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = chartRef.current.timeScale().coordinateToTime(x);
    const price = candlestickSeriesRef.current.coordinateToPrice(y);

    if (time && price) {
      setDrawingPreview({
        type: activeTool,
        start: { time, price },
        end: { time, price }
      });
    }
  };

  const handleSVGMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingBadgeRef.current && candlestickSeriesRef.current && chartContainerRef.current) {
      const rect = chartContainerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const newPrice = candlestickSeriesRef.current.coordinateToPrice(y);
      if (newPrice && !isNaN(newPrice)) {
        setDraggingBadge({
          ...draggingBadgeRef.current,
          currentPrice: newPrice
        });
      }
      return;
    }

    if (!drawingPreview) return;
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = chartRef.current.timeScale().coordinateToTime(x);
    const price = candlestickSeriesRef.current.coordinateToPrice(y);

    if (time && price) {
      setDrawingPreview({
        ...drawingPreview,
        end: { time, price }
      });
    }
  };

  const handleSVGMouseUp = () => {
    if (draggingBadgeRef.current) {
      const active = draggingBadgeRef.current;
      setDraggingBadge(null);
      const isSl = active.type === 'sl';
      const label = isSl ? 'Stop Loss (SL)' : 'Take Profit (TP)';
      const pos = active.position;
      const confirmed = window.confirm(
        `Are you sure you want to update ${label} for position #${pos.position_id} (${pos.symbol})?\n\n` +
        `Old ${active.type.toUpperCase()}: ${active.originalPrice.toFixed(5)}\n` +
        `New ${active.type.toUpperCase()}: ${active.currentPrice.toFixed(5)}`
      );

      if (confirmed) {
        // Send position modification request to backend
        const endpoint = isLocal ? 'http://localhost:8751/api/trade/modify_position' : `${API_BASE_URL}/api/trade/modify_position`;
        const payload: any = {
          position_id: pos.position_id,
          symbol: pos.symbol
        };
        if (isSl) {
          payload.stop_loss = active.currentPrice;
          payload.take_profit = pos.tp;
        } else {
          payload.stop_loss = pos.sl;
          payload.take_profit = active.currentPrice;
        }

        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(res => res.json())
          .then(data => {
            if (data.status === 'success' || data.success) {
              onRefresh?.();
            } else {
              alert(`Failed to update ${label}: ${data.message || 'Unknown error'}`);
            }
          })
          .catch(err => {
            console.error(`Error modifying ${label}:`, err);
            alert(`Error modifying ${label}: ${err.message}`);
          });
      }
      return;
    }

    if (!drawingPreview) return;
    setDrawings([...drawings, drawingPreview]);
    setDrawingPreview(null);
  };

  // Window-level mouse listener while dragging SL/TP badge
  useEffect(() => {
    if (!draggingBadge) return;

    const onGlobalMouseMove = (e: MouseEvent) => {
      if (candlestickSeriesRef.current && chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const newPrice = candlestickSeriesRef.current.coordinateToPrice(y);
        if (newPrice && !isNaN(newPrice)) {
          setDraggingBadge(prev => prev ? { ...prev, currentPrice: newPrice } : null);
        }
      }
    };

    const onGlobalMouseUp = () => {
      handleSVGMouseUp();
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };
  }, [draggingBadge]);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      backgroundColor: 'var(--app-card-bg, #111827)',
      border: '1px solid var(--app-card-border, #1f2937)',
      borderRadius: '12px',
      padding: '16px',
    },
    pairGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
      fontSize: '12px',
    },
    pairSelect: {
      backgroundColor: 'var(--app-input-bg, #0b0f19)',
      border: '1px solid var(--app-input-border, #1f2937)',
      borderRadius: '6px',
      padding: '4px 8px',
      color: 'var(--app-text, #ffffff)',
      fontWeight: 'bold',
      cursor: 'pointer',
      outline: 'none',
    },
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid var(--app-card-border, #1f2937)',
      paddingBottom: isMobile ? '6px' : '12px',
    },
    toolsGroup: {
      display: 'flex',
      gap: isMobile ? '6px' : '8px',
      alignItems: 'center',
    },
    symbolBadge: {
      color: 'var(--app-text, #d1d5db)',
      fontWeight: 'bold',
      fontSize: '14px',
      backgroundColor: 'var(--app-panel-header-bg, #1f2937)',
      padding: '6px 12px',
      borderRadius: '8px',
    },
    btn: (active: boolean, isDelete: boolean = false) => ({
      padding: '6px 12px',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '12px',
      fontWeight: 'bold',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      backgroundColor: active ? (isDelete ? '#ef4444' : '#3b82f6') : 'var(--app-panel-header-bg, #1f2937)',
      color: active ? '#ffffff' : 'var(--app-text-muted, #9ca3af)',
    }),
    clearBtn: {
      padding: '6px 12px',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      color: '#ef4444',
      border: '1px solid rgba(239, 68, 68, 0.2)',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '12px',
      fontWeight: 'bold' as const,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    refreshBtn: {
      color: 'var(--app-text-muted, #9ca3af)',
      backgroundColor: 'var(--app-panel-header-bg, #1f2937)',
      border: 'none',
      padding: isMobile ? '6px' : '8px',
      borderRadius: '8px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s',
    },
    chartWrapper: {
      position: 'relative' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      backgroundColor: 'var(--app-bg, #0b0f19)',
      border: '1px solid var(--app-card-border, #1f2937)',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    loadingOverlay: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(11, 15, 25, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#3b82f6',
      fontWeight: 'bold',
      zIndex: 30,
    }
  };

  return (
    <div id={isFullscreen ? "tv-chart-fullscreen-container" : undefined} style={{ ...styles.container, ...(isFullscreen ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, backgroundColor: '#0b0f19', display: 'flex', flexDirection: 'column', padding: isMobile ? '8px' : '16px', boxSizing: 'border-box', overflowY: 'auto' } : {}), ...(isMobile ? { padding: '8px', gap: '8px' } : {}) }}>
      <div style={{ ...styles.toolbar, ...(isMobile ? { flexDirection: 'column', gap: '8px', alignItems: 'stretch' } : {}) }}>
        {isMobile ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search symbol..."
                  value={showSymbolDropdown ? symbolSearch : symbol}
                  onFocus={() => {
                    setSymbolSearch('');
                    setShowSymbolDropdown(true);
                  }}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    ...styles.pairSelect,
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    border: '1px solid #334155',
                    padding: '4px 8px',
                    fontSize: '12px',
                    width: '110px'
                  }}
                />
                {showSymbolDropdown && (
                  <>
                    <div onClick={() => setShowSymbolDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
                    <div style={{ position: 'absolute', top: '100%', left: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', minWidth: '160px' }}>
                      {filteredSymbols.length > 0 ? (
                        filteredSymbols.map((sym, idx) => (
                          <div key={sym} onClick={() => { onSymbolChange(sym); setShowSymbolDropdown(false); }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: '#ffffff', backgroundColor: idx === highlightedIndex ? '#2563eb' : (symbol === sym ? 'rgba(37, 99, 235, 0.3)' : 'transparent'), transition: 'background-color 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseEnter={() => setHighlightedIndex(idx)}>
                            <span>{sym}</span>
                            <span onClick={(e) => toggleFavoriteSymbol(sym, e)} style={{ color: favoriteSymbols.includes(sym) ? '#f59e0b' : '#4b5563', fontSize: '14px', padding: '2px 4px', cursor: 'pointer', transition: 'color 0.15s' }}>★</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '6px 10px', fontSize: '11px', color: '#6b7280' }}>No results found</div>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
                  style={{ ...styles.pairSelect, backgroundColor: '#1e293b', color: '#ffffff', border: '1px solid #334155', padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', cursor: 'pointer' }}
                >
                  <span>{timeframe}</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>
                </button>
                {showTimeframeDropdown && (
                  <>
                    <div onClick={() => setShowTimeframeDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
                    <div style={{ position: 'absolute', top: '100%', right: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', minWidth: '100px' }}>
                      {sortedTimeframes.map((tf) => (
                        <div key={tf} onClick={() => { onTimeframeChange(tf); setShowTimeframeDropdown(false); }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: '#ffffff', backgroundColor: timeframe === tf ? 'rgba(37, 99, 235, 0.3)' : 'transparent', transition: 'background-color 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <span>{tf}</span>
                          <span onClick={(e) => toggleFavoriteTimeframe(tf, e)} style={{ color: favoriteTimeframes.includes(tf) ? '#f59e0b' : '#4b5563', fontSize: '14px', padding: '2px 4px', cursor: 'pointer', transition: 'color 0.15s' }}>★</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <select value={actualFilter} onChange={(e) => setActualFilter(e.target.value as 'all' | 'wins' | 'losses')} style={{ ...styles.pairSelect, backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                <option value="all">Both</option>
                <option value="wins">Wins</option>
                <option value="losses">Losses</option>
              </select>
              {(() => {
                const lastCandle = activeCandles && activeCandles.length > 0 ? activeCandles[activeCandles.length - 1] : null;
                if (!lastCandle) return null;
                const d = new Date(Number(lastCandle.time) * 1000);
                if (isNaN(d.getTime())) return null;
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                const hours = String(d.getHours()).padStart(2, '0');
                const mins = String(d.getMinutes()).padStart(2, '0');
                const secs = String(d.getSeconds()).padStart(2, '0');
                const formattedTime = `${day}/${month}/${year} - ${hours}:${mins}:${secs}`;
                return (
                  <div style={{
                    fontSize: '10px',
                    color: '#94a3b8',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }} title="Last Candle Time">
                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>🕒</span> {formattedTime}
                  </div>
                );
              })()}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {onLiveFeedChange && (
                  <button
                    onClick={() => { const nextVal = !isLiveFeed; localStorage.setItem('wyckoff_is_live_feed', String(nextVal)); onLiveFeedChange(nextVal); }}
                    style={{ ...styles.refreshBtn, backgroundColor: isLiveFeed ? '#10b981' : '#1f2937', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold', boxShadow: isLiveFeed ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none' }}
                    title="Toggle Live Feed"
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isLiveFeed ? '#ffffff' : '#9ca3af', display: 'inline-block', animation: isLiveFeed ? 'pulse 1.5s infinite' : 'none' }}></span>
                    LIVE
                  </button>
                )}
                <button onClick={() => onRefresh?.()} style={styles.refreshBtn} title="Refresh chart data"><RefreshCw size={14} className={loadingStrategy ? 'animate-spin' : ''} /></button>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowSettingsDropdown(!showSettingsDropdown)} style={styles.refreshBtn} title="Chart Visibility Settings"><Settings size={14} /></button>
                  {showSettingsDropdown && (
                    <>
                      <div onClick={() => setShowSettingsDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '6px', backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#9ca3af', borderBottom: '1px solid #1f2937', paddingBottom: '6px', marginBottom: '4px' }}>Chart Visibility</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showFvg} onChange={(e) => setChartSettings({ ...chartSettings, showFvg: e.target.checked })} style={{ cursor: 'pointer' }} /> Fair Value Gaps (FVG)</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showSessions} onChange={(e) => setChartSettings({ ...chartSettings, showSessions: e.target.checked })} style={{ cursor: 'pointer' }} /> Trading Sessions</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showTrades} onChange={(e) => setChartSettings({ ...chartSettings, showTrades: e.target.checked })} style={{ cursor: 'pointer' }} /> Trades & Order Levels</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showPositions ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositions: e.target.checked })} style={{ cursor: 'pointer' }} /> Active Positions</label>
                        {chartSettings.showPositions && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '16px', borderLeft: '2px solid #334155', paddingLeft: '8px', marginBottom: '2px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}><input type="checkbox" checked={chartSettings.showPositionsEntry ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositionsEntry: e.target.checked })} style={{ cursor: 'pointer' }} /> Show Entry Line</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}><input type="checkbox" checked={chartSettings.showPositionsSlTp ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositionsSlTp: e.target.checked })} style={{ cursor: 'pointer' }} /> Show SL / TP Lines</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}><input type="checkbox" checked={chartSettings.showPositionsSvg ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositionsSvg: e.target.checked })} style={{ cursor: 'pointer' }} /> Show Clickable Badges</label>
                          </div>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showTrLines} onChange={(e) => setChartSettings({ ...chartSettings, showTrLines: e.target.checked })} style={{ cursor: 'pointer' }} /> Trading Range (TR)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #334155', paddingTop: '6px', marginTop: '4px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.autoRefreshCandles ?? true} onChange={(e) => setChartSettings({ ...chartSettings, autoRefreshCandles: e.target.checked })} style={{ cursor: 'pointer' }} /> ⚡ Auto-Refresh Candles</label>
                          {chartSettings.autoRefreshCandles && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '22px', fontSize: '11px', color: '#94a3b8' }}>
                              <span>Interval:</span>
                              <input type="number" min="1" max="3600" value={chartSettings.autoRefreshSeconds ?? 5} onChange={(e) => { const secs = Math.max(1, parseInt(e.target.value) || 1); setChartSettings({ ...chartSettings, autoRefreshSeconds: secs }); }} style={{ width: '50px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#ffffff', padding: '2px 6px', fontSize: '11px', outline: 'none' }} />
                              <span>secs</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button onClick={toggleFullscreen} style={styles.refreshBtn} title="Toggle Fullscreen">{isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ ...styles.toolsGroup, flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ ...styles.pairGroup, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ position: 'relative' }}>
                    <input type="text" placeholder="Search symbol..." value={showSymbolDropdown ? symbolSearch : symbol} onFocus={() => { setSymbolSearch(''); setShowSymbolDropdown(true); }} onChange={(e) => setSymbolSearch(e.target.value)} onKeyDown={handleKeyDown} style={{ ...styles.pairSelect, backgroundColor: '#1e293b', color: '#ffffff', border: '1px solid #334155', padding: '4px 8px', fontSize: '12px', width: '110px' }} />
                    {showSymbolDropdown && (
                      <>
                        <div onClick={() => setShowSymbolDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', minWidth: '160px' }}>
                          {filteredSymbols.length > 0 ? (
                            filteredSymbols.map((sym, idx) => (
                              <div key={sym} onClick={() => { onSymbolChange(sym); setShowSymbolDropdown(false); }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: '#ffffff', backgroundColor: idx === highlightedIndex ? '#2563eb' : (symbol === sym ? 'rgba(37, 99, 235, 0.3)' : 'transparent'), transition: 'background-color 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseEnter={() => setHighlightedIndex(idx)}>
                                <span>{sym}</span>
                                <span onClick={(e) => toggleFavoriteSymbol(sym, e)} style={{ color: favoriteSymbols.includes(sym) ? '#f59e0b' : '#4b5563', fontSize: '14px', padding: '2px 4px', cursor: 'pointer', transition: 'color 0.15s' }}>★</span>
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: '6px 10px', fontSize: '11px', color: '#6b7280' }}>No results found</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ ...styles.pairGroup, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)} style={{ ...styles.pairSelect, backgroundColor: '#1e293b', color: '#ffffff', border: '1px solid #334155', padding: '4px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', cursor: 'pointer' }}>
                      <span>{timeframe}</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>
                    </button>
                    {showTimeframeDropdown && (
                      <>
                        <div onClick={() => setShowTimeframeDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', minWidth: '100px' }}>
                          {sortedTimeframes.map((tf) => (
                            <div key={tf} onClick={() => { onTimeframeChange(tf); setShowTimeframeDropdown(false); }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: '#ffffff', backgroundColor: timeframe === tf ? 'rgba(37, 99, 235, 0.3)' : 'transparent', transition: 'background-color 0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                              <span>{tf}</span>
                              <span onClick={(e) => toggleFavoriteTimeframe(tf, e)} style={{ color: favoriteTimeframes.includes(tf) ? '#f59e0b' : '#4b5563', fontSize: '14px', padding: '2px 4px', cursor: 'pointer', transition: 'color 0.15s' }}>★</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div style={styles.pairGroup}>
                <select value={actualFilter} onChange={(e) => setActualFilter(e.target.value as 'all' | 'wins' | 'losses')} style={styles.pairSelect}>
                  <option value="all">Both (Winners & Losers)</option>
                  <option value="wins">Winners Only</option>
                  <option value="losses">Losers Only</option>
                </select>
              </div>
              {(() => {
                const lastCandle = activeCandles && activeCandles.length > 0 ? activeCandles[activeCandles.length - 1] : null;
                if (!lastCandle) return null;
                const d = new Date(Number(lastCandle.time) * 1000);
                if (isNaN(d.getTime())) return null;
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                const hours = String(d.getHours()).padStart(2, '0');
                const mins = String(d.getMinutes()).padStart(2, '0');
                const secs = String(d.getSeconds()).padStart(2, '0');
                const formattedTime = `${day}/${month}/${year} - ${hours}:${mins}:${secs}`;
                return (
                  <div style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }} title="Last Candle Time">
                    <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>🕒</span> {formattedTime}
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {onLiveFeedChange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button onClick={() => { const nextVal = !isLiveFeed; localStorage.setItem('wyckoff_is_live_feed', String(nextVal)); onLiveFeedChange(nextVal); }} style={{ ...styles.refreshBtn, backgroundColor: isLiveFeed ? '#10b981' : '#1f2937', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', boxShadow: isLiveFeed ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none' }} title="Toggle Live Feed">
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isLiveFeed ? '#ffffff' : '#9ca3af', display: 'inline-block', animation: isLiveFeed ? 'pulse 1.5s infinite' : 'none' }}></span>
                    Live Feed
                  </button>
                </div>
              )}
              <button onClick={() => onRefresh?.()} style={styles.refreshBtn} title="Refresh chart data"><RefreshCw size={14} className={loadingStrategy ? 'animate-spin' : ''} /></button>
              <button onClick={() => { if (replayToolActive) { setReplayTime(null); setIsPlaying(false); if (onSelectCandleRef.current) { onSelectCandleRef.current(null); } } setReplayToolActive(!replayToolActive); }} style={{ ...styles.refreshBtn, backgroundColor: replayToolActive ? '#2563eb' : '#1f2937', color: replayToolActive ? '#ffffff' : '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold' }} title="Toggle Replay Tool">
                <Play size={12} fill={replayToolActive ? "#ffffff" : "none"} />
                Replay
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowSettingsDropdown(!showSettingsDropdown)} style={styles.refreshBtn} title="Chart Visibility Settings"><Settings size={16} /></button>
                {showSettingsDropdown && (
                  <>
                    <div onClick={() => setShowSettingsDropdown(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '6px', backgroundColor: '#0f172a', border: '1px solid #1f2937', borderRadius: '8px', padding: '12px', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#9ca3af', borderBottom: '1px solid #1f2937', paddingBottom: '6px', marginBottom: '4px' }}>Chart Visibility</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showFvg} onChange={(e) => setChartSettings({ ...chartSettings, showFvg: e.target.checked })} style={{ cursor: 'pointer' }} /> Fair Value Gaps (FVG)</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showSessions} onChange={(e) => setChartSettings({ ...chartSettings, showSessions: e.target.checked })} style={{ cursor: 'pointer' }} /> Trading Sessions</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showTrades} onChange={(e) => setChartSettings({ ...chartSettings, showTrades: e.target.checked })} style={{ cursor: 'pointer' }} /> Trades & Order Levels</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showPositions ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositions: e.target.checked })} style={{ cursor: 'pointer' }} /> Active Positions</label>
                      {chartSettings.showPositions && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginLeft: '16px', borderLeft: '2px solid #334155', paddingLeft: '8px', marginBottom: '2px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}><input type="checkbox" checked={chartSettings.showPositionsEntry ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositionsEntry: e.target.checked })} style={{ cursor: 'pointer' }} /> Show Entry Line</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}><input type="checkbox" checked={chartSettings.showPositionsSlTp ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositionsSlTp: e.target.checked })} style={{ cursor: 'pointer' }} /> Show SL / TP Lines</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}><input type="checkbox" checked={chartSettings.showPositionsSvg ?? true} onChange={(e) => setChartSettings({ ...chartSettings, showPositionsSvg: e.target.checked })} style={{ cursor: 'pointer' }} /> Show Clickable Badges</label>
                        </div>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.showTrLines} onChange={(e) => setChartSettings({ ...chartSettings, showTrLines: e.target.checked })} style={{ cursor: 'pointer' }} /> Trading Range (TR)</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #334155', paddingTop: '6px', marginTop: '4px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}><input type="checkbox" checked={chartSettings.autoRefreshCandles ?? true} onChange={(e) => setChartSettings({ ...chartSettings, autoRefreshCandles: e.target.checked })} style={{ cursor: 'pointer' }} /> ⚡ Auto-Refresh Candles</label>
                        {chartSettings.autoRefreshCandles && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '22px', fontSize: '11px', color: '#94a3b8' }}>
                            <span>Interval:</span>
                            <input type="number" min="1" max="3600" value={chartSettings.autoRefreshSeconds ?? 5} onChange={(e) => { const secs = Math.max(1, parseInt(e.target.value) || 1); setChartSettings({ ...chartSettings, autoRefreshSeconds: secs }); }} style={{ width: '50px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#ffffff', padding: '2px 6px', fontSize: '11px', outline: 'none' }} />
                            <span>secs</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div style={styles.chartWrapper}>
        <div style={{ position: 'relative', height: chartHeight }}>
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />

          {replayTime !== null && (
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(51, 65, 85, 0.8)',
              borderRadius: '8px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'auto',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#38bdf8', marginRight: '4px' }}>
                REPLAY MODE
              </span>

              <button
                onClick={stepBackward}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                title="Step Backward (Left Arrow)"
              >
                <SkipBack size={16} />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  background: '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'transform 0.2s',
                }}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause size={14} fill="#ffffff" /> : <Play size={14} fill="#ffffff" />}
              </button>

              <button
                onClick={stepForward}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                title="Step Forward (Right Arrow)"
              >
                <SkipForward size={16} />
              </button>

              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                style={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '11px',
                  padding: '2px 4px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="2000">2.0s / bar</option>
                <option value="1000">1.0s / bar</option>
                <option value="500">0.5s / bar</option>
                <option value="200">0.2s / bar</option>
              </select>

              <div style={{ height: '16px', width: '1px', backgroundColor: '#374151' }}></div>

              <button
                onClick={() => {
                  setReplayTime(null);
                  setIsPlaying(false);
                  setReplayToolActive(false);
                  if (onSelectCandleRef.current) {
                    onSelectCandleRef.current(null);
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                title="Exit Replay"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* SVG Drawing Layer (Trendlines & Rectangles) */}
          <svg
            onMouseDown={handleSVGMouseDown}
            onMouseMove={handleSVGMouseMove}
            onMouseUp={handleSVGMouseUp}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${chartHeight}px`,
              pointerEvents: activeTool !== 'none' ? 'all' : 'none',
              zIndex: 20,
              cursor: activeTool === 'delete' ? 'pointer' : (activeTool !== 'none' ? 'crosshair' : 'default'),
            }}
          >
            {/* Clickable Active Position Badges on the right side */}
            {(chartSettings.showPositions !== false && chartSettings.showPositionsSvg !== false) && (() => {
              let positionsList: any[] = [];
              if (Array.isArray(openPositions) && openPositions.length > 0) {
                positionsList = openPositions;
              } else {
                try {
                  const stored = localStorage.getItem('wyckoff_active_positions');
                  if (stored) positionsList = JSON.parse(stored);
                } catch (e) {}
              }

              if (!Array.isArray(positionsList) || positionsList.length === 0 || !candlestickSeriesRef.current) return null;

              const currentSymbolClean = (symbol || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
              const matchingPositions = positionsList.filter((p) => {
                if (!p || !p.symbol) return false;
                const posSymbolClean = String(p.symbol).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                return posSymbolClean.includes(currentSymbolClean) || currentSymbolClean.includes(posSymbolClean);
              });

              const rightScaleWidth = chartRef.current ? chartRef.current.priceScale('right').width() : 55;
              const plotWidth = chartContainerRef.current ? chartContainerRef.current.clientWidth - rightScaleWidth : 0;

              return matchingPositions.map((pos) => {
                const isBuy = (pos.trade_side || 'BUY').toUpperCase() === 'BUY';
                const entryPrice = parseFloat(pos.entry_price ?? pos.entryPrice);
                const slPrice = parseFloat(pos.stop_loss ?? pos.sl ?? 0);
                const tpPrice = parseFloat(pos.take_profit ?? pos.tp ?? 0);
                const volume = pos.volume !== undefined ? pos.volume : '';
                const pnlVal = parseFloat(pos.unrealized_profit ?? pos.pnl ?? pos.profit ?? pos.unrealized_pnl ?? 0);
                const pnlStr = !isNaN(pnlVal) ? ` (P&L: ${pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)})` : '';

                const volNum = parseFloat(volume as any) || 0;
                const isJpy = (symbol || '').toUpperCase().includes('JPY');
                const multiplier = isJpy ? 1000 : 100000;

                let slLossStr = '';
                if (slPrice > 0 && volNum > 0) {
                  const slDiff = isBuy ? (entryPrice - slPrice) : (slPrice - entryPrice);
                  const estLoss = Math.abs(slDiff * volNum * multiplier);
                  slLossStr = ` (-$${estLoss.toFixed(2)})`;
                }

                let tpWinStr = '';
                if (tpPrice > 0 && volNum > 0) {
                  const tpDiff = isBuy ? (tpPrice - entryPrice) : (entryPrice - tpPrice);
                  const estWin = Math.abs(tpDiff * volNum * multiplier);
                  tpWinStr = ` (+$${estWin.toFixed(2)})`;
                }

                const entryY = entryPrice > 0 ? candlestickSeriesRef.current.priceToCoordinate(entryPrice) : null;
                const slY = slPrice > 0 ? candlestickSeriesRef.current.priceToCoordinate(slPrice) : null;
                const tpY = tpPrice > 0 ? candlestickSeriesRef.current.priceToCoordinate(tpPrice) : null;

                const handleEntryBadgeClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onSelectTradeRef.current) {
                    onSelectTradeRef.current(pos);
                  }
                };

                const handleSlMouseDown = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!candlestickSeriesRef.current) return;
                  setDraggingBadge({
                    position: pos,
                    type: 'sl',
                    originalPrice: slPrice,
                    currentPrice: slPrice
                  });
                };

                const handleTpMouseDown = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!candlestickSeriesRef.current) return;
                  setDraggingBadge({
                    position: pos,
                    type: 'tp',
                    originalPrice: tpPrice,
                    currentPrice: tpPrice
                  });
                };

                const activeSlPrice = (draggingBadge?.position?.position_id === pos.position_id && draggingBadge?.type === 'sl')
                  ? draggingBadge.currentPrice
                  : slPrice;

                const activeTpPrice = (draggingBadge?.position?.position_id === pos.position_id && draggingBadge?.type === 'tp')
                  ? draggingBadge.currentPrice
                  : tpPrice;

                const activeSlY = activeSlPrice > 0 && candlestickSeriesRef.current ? candlestickSeriesRef.current.priceToCoordinate(activeSlPrice) : slY;
                const activeTpY = activeTpPrice > 0 && candlestickSeriesRef.current ? candlestickSeriesRef.current.priceToCoordinate(activeTpPrice) : tpY;

                let entryTs = pos.entry_timestamp ?? pos.entryTimestamp ?? pos.timestamp ?? pos.open_time ?? pos.openTime ?? pos.time;
                if (entryTs && Number(entryTs) > 2000000000) entryTs = Math.floor(Number(entryTs) / 1000);
                if (entryTs) entryTs = Number(entryTs) - 10800;
                const matchedCandleTime = entryTs ? findCandleTimeForTimestamp(entryTs, activeCandles) : null;
                const entryX = matchedCandleTime && chartRef.current ? chartRef.current.timeScale().timeToCoordinate(matchedCandleTime) : null;

                return (
                  <g key={`svg-pos-badge-${pos.position_id}`}>
                    {/* Entry Triangle Indicator on Candle */}
                    {entryX !== null && entryX > 0 && entryX < plotWidth && entryY !== null && entryY > 0 && entryY < chartHeight - 26 && (
                      <g style={{ pointerEvents: 'none' }}>
                        <polygon
                          points={isBuy
                            ? `${entryX},${entryY - 12} ${entryX - 7},${entryY + 2} ${entryX + 7},${entryY + 2}`
                            : `${entryX},${entryY + 12} ${entryX - 7},${entryY - 2} ${entryX + 7},${entryY - 2}`}
                          fill={isBuy ? '#2563eb' : '#db2777'}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                        <circle
                          cx={entryX}
                          cy={entryY}
                          r={3}
                          fill="#ffffff"
                          stroke={isBuy ? '#2563eb' : '#db2777'}
                          strokeWidth={1.5}
                        />
                      </g>
                    )}

                    {/* Entry Badge - Opens Trade Info */}
                    {(chartSettings.showPositionsEntry !== false) && entryY !== null && entryY > 0 && entryY < chartHeight - 26 && (
                      <g
                        style={{ cursor: 'pointer', pointerEvents: 'all' }}
                        onClick={handleEntryBadgeClick}
                      >
                        <rect
                          x={plotWidth - 185}
                          y={entryY - 11}
                          width={180}
                          height={22}
                          rx={4}
                          fill={isBuy ? '#2563eb' : '#db2777'}
                          stroke="#ffffff"
                          strokeWidth={1}
                        />
                        <text
                          x={plotWidth - 95}
                          y={entryY + 4}
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {isBuy ? 'BUY' : 'SELL'} {volume} @ {entryPrice.toFixed(5)}{pnlStr}
                        </text>
                      </g>
                    )}

                    {/* SL Badge - Drag & Drop New SL */}
                    {(chartSettings.showPositionsSlTp !== false) && activeSlY !== null && activeSlY > 0 && activeSlY < chartHeight - 26 && (
                      <g
                        style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                        onMouseDown={handleSlMouseDown}
                      >
                        <rect
                          x={plotWidth - 145}
                          y={activeSlY - 11}
                          width={140}
                          height={22}
                          rx={4}
                          fill="#dc2626"
                          stroke={draggingBadge?.position?.position_id === pos.position_id && draggingBadge?.type === 'sl' ? '#fde047' : '#ffffff'}
                          strokeWidth={draggingBadge?.position?.position_id === pos.position_id && draggingBadge?.type === 'sl' ? 2 : 1}
                        />
                        <text
                          x={plotWidth - 75}
                          y={activeSlY + 4}
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          SL @ {activeSlPrice.toFixed(5)}{slLossStr}
                        </text>
                      </g>
                    )}

                    {/* TP Badge - Drag & Drop New TP */}
                    {(chartSettings.showPositionsSlTp !== false) && activeTpY !== null && activeTpY > 0 && activeTpY < chartHeight - 26 && (
                      <g
                        style={{ cursor: 'ns-resize', pointerEvents: 'all' }}
                        onMouseDown={handleTpMouseDown}
                      >
                        <rect
                          x={plotWidth - 145}
                          y={activeTpY - 11}
                          width={140}
                          height={22}
                          rx={4}
                          fill="#059669"
                          stroke={draggingBadge?.position?.position_id === pos.position_id && draggingBadge?.type === 'tp' ? '#fde047' : '#ffffff'}
                          strokeWidth={draggingBadge?.position?.position_id === pos.position_id && draggingBadge?.type === 'tp' ? 2 : 1}
                        />
                        <text
                          x={plotWidth - 75}
                          y={activeTpY + 4}
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          TP @ {activeTpPrice.toFixed(5)}{tpWinStr}
                        </text>
                      </g>
                    )}
                  </g>
                );
              });
            })()}

            {chartSettings.showTrades && selectedTradeCoords && (
              <rect
                x={Math.min(selectedTradeCoords.x1, selectedTradeCoords.x2)}
                y={0}
                width={Math.max(1, Math.abs(selectedTradeCoords.x1 - selectedTradeCoords.x2))}
                height={chartHeight}
                fill={selectedTradeCoords.pnl >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'}
                stroke={selectedTradeCoords.pnl >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}
                strokeWidth={1}
                strokeDasharray="4 4"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {dateRangeCoords && (
              <>
                {dateRangeCoords.x1 !== null && (
                  <line
                    x1={dateRangeCoords.x1}
                    y1={0}
                    x2={dateRangeCoords.x1}
                    y2={chartHeight}
                    stroke="#eab308"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                )}
                {dateRangeCoords.x2 !== null && (
                  <line
                    x1={dateRangeCoords.x2}
                    y1={0}
                    x2={dateRangeCoords.x2}
                    y2={chartHeight}
                    stroke="#eab308"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                )}
                {dateRangeCoords.x1 !== null && dateRangeCoords.x2 !== null && (
                  <rect
                    x={Math.min(dateRangeCoords.x1, dateRangeCoords.x2)}
                    y={0}
                    width={Math.max(1, Math.abs(dateRangeCoords.x1 - dateRangeCoords.x2))}
                    height={chartHeight}
                    fill="rgba(234, 179, 8, 0.04)"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </>
            )}

            {chartSettings.showFvg && (enabledIndicators?.fvg !== false) && fvgCoords.map((fvg, index) => {
              const rightScaleWidth = chartRef.current ? chartRef.current.priceScale('right').width() : 55;
              const plotWidth = chartContainerRef.current ? chartContainerRef.current.clientWidth - rightScaleWidth : 0;
              const plotHeight = chartHeight - 26; // Subtracting bottom time axis height

              // If completely outside the plot area, don't render
              if (fvg.x1 > plotWidth || fvg.y1 > plotHeight) return null;

              // Clip dimensions to plot boundary
              const renderX1 = Math.max(0, Math.min(plotWidth, fvg.x1));
              const renderX2 = Math.max(0, Math.min(plotWidth, fvg.x2));
              const renderY1 = Math.max(0, Math.min(plotHeight, fvg.y1));
              const renderY2 = Math.max(0, Math.min(plotHeight, fvg.y2));

              const width = Math.max(1, renderX2 - renderX1);
              const height = Math.max(1, renderY2 - renderY1);

              if (width <= 0 || height <= 0) return null;

              const color = fvg.type === 'bullish' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';
              const strokeColor = fvg.type === 'bullish' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
              return (
                <rect
                  key={`fvg-${index}`}
                  x={renderX1}
                  y={renderY1}
                  width={width}
                  height={height}
                  fill={color}
                  stroke={strokeColor}
                  strokeWidth={1}
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}



            {/* Wyckoff Oversold (Spring) Highlight Shading & Boundary Ticks */}
            {chartSettings.showTrLines && oversoldCoords.map((coord, idx) => {
              const rightScaleWidth = chartRef.current ? chartRef.current.priceScale('right').width() : 55;
              const plotWidth = chartContainerRef.current ? chartContainerRef.current.clientWidth - rightScaleWidth : 0;
              const plotHeight = chartHeight - 26;

              if (coord.x > plotWidth || coord.y1 > plotHeight) return null;

              const renderX = Math.max(0, Math.min(plotWidth, coord.x));
              const renderY1 = Math.max(0, Math.min(plotHeight, coord.y1));
              const renderY2 = Math.max(0, Math.min(plotHeight, coord.y2));

              return (
                <g key={`oversold-highlight-${idx}`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={renderX - 4}
                    y={Math.min(renderY1, renderY2)}
                    width={8}
                    height={Math.max(1, Math.abs(renderY1 - renderY2))}
                    fill="rgba(59, 130, 246, 0.25)"
                    stroke="rgba(59, 130, 246, 0.6)"
                    strokeWidth={1}
                  />
                  <line
                    x1={renderX - 6}
                    y1={renderY1}
                    x2={renderX + 6}
                    y2={renderY1}
                    stroke="#fbbf24"
                    strokeWidth={2}
                  />
                </g>
              );
            })}

            {/* Wyckoff Overbought (Upthrust) Highlight Shading & Boundary Ticks */}
            {chartSettings.showTrLines && overboughtCoords.map((coord, idx) => {
              const rightScaleWidth = chartRef.current ? chartRef.current.priceScale('right').width() : 55;
              const plotWidth = chartContainerRef.current ? chartContainerRef.current.clientWidth - rightScaleWidth : 0;
              const plotHeight = chartHeight - 26;

              if (coord.x > plotWidth || coord.y1 > plotHeight) return null;

              const renderX = Math.max(0, Math.min(plotWidth, coord.x));
              const renderY1 = Math.max(0, Math.min(plotHeight, coord.y1));
              const renderY2 = Math.max(0, Math.min(plotHeight, coord.y2));

              return (
                <g key={`overbought-highlight-${idx}`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={renderX - 4}
                    y={Math.min(renderY1, renderY2)}
                    width={8}
                    height={Math.max(1, Math.abs(renderY1 - renderY2))}
                    fill="rgba(59, 130, 246, 0.25)"
                    stroke="rgba(59, 130, 246, 0.6)"
                    strokeWidth={1}
                  />
                  <line
                    x1={renderX - 6}
                    y1={renderY1}
                    x2={renderX + 6}
                    y2={renderY1}
                    stroke="#fbbf24"
                    strokeWidth={2}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div ref={weisContainerRef} style={{ width: '100%', height: weisHeight, touchAction: 'none' }} />
      </div>
    </div>
  );
}
