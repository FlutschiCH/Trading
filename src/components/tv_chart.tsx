import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Square, PenTool, Trash2, XCircle, RefreshCw, Maximize2, Minimize2, Settings, Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { calculateDateBounds } from '../App';

const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' || 
   window.location.hostname.startsWith('192.168.') ||
   window.location.hostname.startsWith('10.') ||
   window.location.hostname.startsWith('172.'));

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vsa_patterns?: string[];
  weis_wave_volume?: number;
  tr_high?: number;
  tr_low?: number;
  backtest_signal?: 'BUY' | 'SELL';
}

interface TVChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  candleSource: 'ctrader' | 'metatrader' | 'yfinance';
  onCandleSourceChange: (source: 'ctrader' | 'metatrader' | 'yfinance') => void;
  availableSymbols: string[];
  availableTimeframes: string[];
  candles: Candle[];
  loading: boolean;
  loadingStrategy?: boolean;
  onRefresh: () => void;
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
  sessionsTimezone?: 'UTC' | 'Local';
}

export default function TVChart({ 
  symbol, 
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
  sessionsTimezone = 'Local'
}: TVChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const weisContainerRef = useRef<HTMLDivElement>(null);
  
  const [replayTime, setReplayTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [replayToolActive, setReplayToolActive] = useState(false);

  const replayToolActiveRef = useRef(replayToolActive);
  useEffect(() => {
    replayToolActiveRef.current = replayToolActive;
  }, [replayToolActive]);

  const activeCandles = replayTime !== null 
    ? candles.filter(c => Number(c.time) <= replayTime) 
    : candles;

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

  const filteredSymbols = availableSymbols.filter(s => s.toLowerCase().includes(symbolSearch.toLowerCase()));

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
  const selectedTradePathSeriesRef = useRef<any>(null);

  useEffect(() => {
    tradesRef.current = visibleTrades;
    updateDrawingCoordinates();
  }, [visibleTrades]);

  useEffect(() => {
    candlesRef.current = activeCandles;
  }, [activeCandles]);

  const fullCandlesRef = useRef(candles);
  useEffect(() => {
    fullCandlesRef.current = candles;
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
  const [supportLineSegments, setSupportLineSegments] = useState<any[]>([]);
  const [resistanceLineSegments, setResistanceLineSegments] = useState<any[]>([]);
  const [oversoldCoords, setOversoldCoords] = useState<any[]>([]);
  const [overboughtCoords, setOverboughtCoords] = useState<any[]>([]);
  const [trendLineSegments, setTrendLineSegments] = useState<any[]>([]);
  const selectedTradeRef = useRef(selectedTrade);

  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [chartSettings, setChartSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('tv_chart_settings');
      return saved ? JSON.parse(saved) : {
        showFvg: true,
        showSessions: true,
        showTrades: true,
        showTrLines: true,
      };
    } catch {
      return {
        showFvg: true,
        showSessions: true,
        showTrades: true,
        showTrLines: true,
      };
    }
  });

  useEffect(() => {
    localStorage.setItem('tv_chart_settings', JSON.stringify(chartSettings));
  }, [chartSettings]);
  const [chartHeight, setChartHeight] = useState(window.innerWidth < 768 ? 380 : 680);
  const [weisHeight, setWeisHeight] = useState(window.innerWidth < 768 ? 100 : 140);
  const chartHeightRef = useRef(chartHeight);
  const weisHeightRef = useRef(weisHeight);

  useEffect(() => {
    chartHeightRef.current = chartHeight;
    weisHeightRef.current = weisHeight;
  }, [chartHeight, weisHeight]);

  const [isFullscreen, setIsFullscreen] = useState(false);

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
    updateDrawingCoordinates();
  }, [dateRangeOption, customFrom, customTo, activeCandles, enabledIndicators, visibleFvgs, sessions, sessionsTimezone]);

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

    const currentFvgs = fvgsRef.current;
    if (currentFvgs && currentFvgs.length > 0 && candlesRef.current) {
      const getCoordinateForTime = (time: number) => {
        const idx = candlesRef.current.findIndex(c => Number(c.time) === Number(time));
        if (idx !== -1) {
          return timeScale.logicalToCoordinate(idx as any);
        }
        return timeScale.timeToCoordinate(time as any);
      };

      const coords = currentFvgs.map(fvg => {
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

    const currentSessions = sessionsRef.current;
    console.log("Sessions Debug: currentSessions =", currentSessions, "candles count =", candlesRef.current?.length);
    if (currentSessions && currentSessions.length > 0 && candlesRef.current && candlesRef.current.length > 0) {
      const activeCoords: any[] = [];

      currentSessions.forEach(session => {
        const [startH, startM] = session.start.split(':').map(Number);
        const [endH, endM] = session.end.split(':').map(Number);
        const startVal = startH * 60 + startM;
        const endVal = endH * 60 + endM;

        let sessionActiveStartIdx: number | null = null;
        let sessionHigh = -Infinity;
        let sessionLow = Infinity;

        const getSessionMinutes = (date: Date) => {
          if (sessionsTimezone === 'UTC') {
            return date.getUTCHours() * 60 + date.getUTCMinutes();
          } else {
            return date.getHours() * 60 + date.getMinutes();
          }
        };

        const getSessionWeekday = (date: Date) => {
          // JS day: 0=Sunday, 1=Monday... 6=Saturday
          // Session weekdays: 1=Monday... 7=Sunday
          let day = date.getDay();
          if (sessionsTimezone === 'UTC') {
            day = date.getUTCDay();
          }
          return day === 0 ? 7 : day;
        };

        for (let i = 0; i < candlesRef.current.length; i++) {
          const candle = candlesRef.current[i];
          const date = new Date(Number(candle.time) * 1000);
          const minutes = getSessionMinutes(date);
          const weekday = getSessionWeekday(date);

          const isWeekdayMatching = session.weekdays ? session.weekdays.includes(weekday) : true;
          let isInSession = false;
          if (isWeekdayMatching) {
            if (startVal <= endVal) {
              isInSession = minutes >= startVal && minutes < endVal;
            } else {
              // Over-night sessions (e.g. 22:00 to 02:00)
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

          const isLastCandle = i === candlesRef.current.length - 1;
          const willCloseSession = !isInSession || isLastCandle;

          if (willCloseSession && sessionActiveStartIdx !== null) {
            const endIdx = isInSession ? i : i - 1;
            const t1 = candlesRef.current[sessionActiveStartIdx].time;
            const t2 = candlesRef.current[endIdx].time;

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

      console.log("Sessions Debug: activeCoords =", activeCoords);
      setSessionCoords(activeCoords);
    } else {
      setSessionCoords([]);
    }

    const currentCandles = candlesRef.current;
    if (currentCandles && currentCandles.length > 0) {
      const zones: any[] = [];
      let currentZone: any = null;

      for (let i = 0; i < currentCandles.length; i++) {
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
        const x1 = timeScale.timeToCoordinate(currentCandles[z.startIdx].time);
        const x2 = timeScale.timeToCoordinate(currentCandles[z.endIdx].time);
        return { ...z, x1, x2 };
      }).filter(z => z.x1 !== null && z.x2 !== null);

      setWyckoffZones(zoneCoords);

      const supSegs: any[] = [];
      const resSegs: any[] = [];

      for (let i = 1; i < currentCandles.length; i++) {
        const cPrev = currentCandles[i - 1];
        const cCurr = currentCandles[i];

        if (cPrev.support_level !== undefined && cCurr.support_level !== undefined) {
          const x1 = timeScale.timeToCoordinate(cPrev.time);
          const x2 = timeScale.timeToCoordinate(cCurr.time);
          const y1 = series.priceToCoordinate(cPrev.support_level);
          const y2 = series.priceToCoordinate(cCurr.support_level);

          if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
            supSegs.push({ x1, x2, y1, y2, stage: cCurr.wyckoff_stage });
          }
        }

        if (cPrev.resistance_level !== undefined && cCurr.resistance_level !== undefined) {
          const x1 = timeScale.timeToCoordinate(cPrev.time);
          const x2 = timeScale.timeToCoordinate(cCurr.time);
          const y1 = series.priceToCoordinate(cPrev.resistance_level);
          const y2 = series.priceToCoordinate(cCurr.resistance_level);

          if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
            resSegs.push({ x1, x2, y1, y2, stage: cCurr.wyckoff_stage });
          }
        }
      }

      setSupportLineSegments(supSegs);
      setResistanceLineSegments(resSegs);

      const oversold: any[] = [];
      const overbought: any[] = [];

      for (let i = 0; i < currentCandles.length; i++) {
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

      // Compute SMA trend line segments
      const smaPeriod = 20;
      const smaValues: number[] = [];
      for (let i = 0; i < currentCandles.length; i++) {
        if (i < smaPeriod - 1) {
          let sum = 0;
          for (let j = 0; j <= i; j++) {
            sum += currentCandles[j].close;
          }
          smaValues.push(sum / (i + 1));
        } else {
          let sum = 0;
          for (let j = 0; j < smaPeriod; j++) {
            sum += currentCandles[i - j].close;
          }
          smaValues.push(sum / smaPeriod);
        }
      }

      const trendSegs: any[] = [];
      for (let i = 1; i < currentCandles.length; i++) {
        const cPrev = currentCandles[i - 1];
        const cCurr = currentCandles[i];
        
        const x1 = timeScale.timeToCoordinate(cPrev.time);
        const x2 = timeScale.timeToCoordinate(cCurr.time);
        const y1 = series.priceToCoordinate(smaValues[i - 1]);
        const y2 = series.priceToCoordinate(smaValues[i]);

        if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
          trendSegs.push({
            x1,
            x2,
            y1,
            y2,
            stage: cCurr.wyckoff_stage || 'TRANSITION'
          });
        }
      }
      setTrendLineSegments(trendSegs);
    } else {
      setWyckoffZones([]);
      setSupportLineSegments([]);
      setResistanceLineSegments([]);
      setOversoldCoords([]);
      setOverboughtCoords([]);
      setTrendLineSegments([]);
    }
  };

  // Sync Charts & Render Data
  useEffect(() => {
    if (!chartContainerRef.current || !weisContainerRef.current) return;

    // Initialize Main Chart
    const mainChart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
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
      title: 'TR High',
    });

    const trLowSeries = mainChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: 1, // Dashed
      title: 'TR Low',
    });

    const weisChart = createChart(weisContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
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
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      try {
        weisChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) {}
      updateDrawingCoordinates();
      isSyncing = false;
    });

    weisChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      try {
        mainChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) {}
      isSyncing = false;
    });

    chartRef.current = mainChart;
    weisChartRef.current = weisChart;
    candlestickSeriesRef.current = candlestickSeries;
    markersPluginRef.current = markersPlugin;
    weisSeriesRef.current = weisSeries;
    trHighSeriesRef.current = trHighSeries;
    trLowSeriesRef.current = trLowSeries;

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
      
      if (onSelectTradeRef.current && tradesRef.current && tradesRef.current.length > 0) {
        const foundTrade = tradesRef.current.find(t => 
          t.entryTimestamp === clickTime || 
          t.exitTimestamp === clickTime || 
          t.timestamp === clickTime
        );
        if (foundTrade) {
          onSelectTradeRef.current(foundTrade);
        }
      }

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

    // Watch for card/container resizes via ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      if (!chartContainerRef.current || !mainChart) return;
      const width = chartContainerRef.current.clientWidth;
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
        } catch (e) {}
      });
      dynamicLineSeriesRef.current = [];
      if (selectedTradePathSeriesRef.current) {
        try {
          mainChart.removeSeries(selectedTradePathSeriesRef.current);
        } catch (e) {}
        selectedTradePathSeriesRef.current = null;
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

      const entryMarkers = chartSettings.showTrades ? activeCandles
        .map((c) => {
          if (c.backtest_signal) {
            const isBullish = c.backtest_signal === 'BUY';
            const trade = (visibleTrades || []).find(t => Number(t.entryTimestamp) === Number(c.time));
            const isProfit = trade ? trade.pnl >= 0 : true;

            if (trade) {
              if (actualFilter === 'wins' && !isProfit) return null;
              if (actualFilter === 'losses' && isProfit) return null;
            }

            const baseColor = isBullish ? '#10b981' : '#ef4444';

            let markerText = isBullish ? 'BUY' : 'SELL';
            if (trade) {
              const pnlStr = trade.pnl >= 0 ? `+${trade.pnl.toFixed(2)}` : `${trade.pnl.toFixed(2)}`;
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
        .filter((m) => m !== null) : [];

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

          return {
            time: trade.exitTimestamp,
            position: (trade.type === 'BUY' ? 'aboveBar' : 'belowBar') as any,
            color: baseColor,
            shape: 'circle' as any,
            text: `EXIT (${isProfit ? '+' : ''}${trade.pnl.toFixed(2)})`,
            size: 1,
          };
        })
        .filter((m) => m !== null) : [];

      const allMarkers = [...entryMarkers, ...exitMarkers].sort((a, b) => {
        const timeA = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
        const timeB = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
        return timeA - timeB;
      });

      if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers(allMarkers);
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
        } catch (e) {}
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
    const sampleSize = Math.min(activeCandles.length, 20);
    for (let i = 0; i < sampleSize; i++) {
      const candle = activeCandles[i];
      const prices = [candle.open, candle.high, candle.low, candle.close];
      for (const price of prices) {
        if (price !== undefined && price !== null) {
          const parts = price.toString().split('.');
          if (parts.length === 2) {
            const decimals = parts[1].length;
            if (decimals > maxDecimals) {
              maxDecimals = decimals;
            }
          }
        }
      }
    }

    const precision = Math.max(2, Math.min(maxDecimals, 8));
    const minMove = Math.pow(10, -precision);

    const priceFormat = {
      type: 'price' as const,
      precision,
      minMove,
    };

    candlestickSeriesRef.current.applyOptions({ priceFormat });
    if (trHighSeriesRef.current) trHighSeriesRef.current.applyOptions({ priceFormat });
    if (trLowSeriesRef.current) trLowSeriesRef.current.applyOptions({ priceFormat });
  }, [symbol, activeCandles]);

  // Update Wyckoff Support & Resistance Price Lines on the Chart
  useEffect(() => {
    if (!candlestickSeriesRef.current) return;

    // Clean up previous lines
    if (wyckoffSupportLineRef.current) {
      try {
        candlestickSeriesRef.current.removePriceLine(wyckoffSupportLineRef.current);
      } catch (e) {}
      wyckoffSupportLineRef.current = null;
    }
    if (wyckoffResistanceLineRef.current) {
      try {
        candlestickSeriesRef.current.removePriceLine(wyckoffResistanceLineRef.current);
      } catch (e) {}
      wyckoffResistanceLineRef.current = null;
    }

    const activeCandle = selectedCandle || (activeCandles && activeCandles.length > 0 ? activeCandles[activeCandles.length - 1] : null);
    if (activeCandle) {
      if (activeCandle.support_level) {
        try {
          wyckoffSupportLineRef.current = candlestickSeriesRef.current.createPriceLine({
            price: activeCandle.support_level,
            color: '#ef4444',
            lineWidth: 1.5,
            lineStyle: 1, // Dashed
            axisLabelVisible: true,
            title: 'Wyckoff Support',
          });
        } catch (e) {}
      }
      if (activeCandle.resistance_level) {
        try {
          wyckoffResistanceLineRef.current = candlestickSeriesRef.current.createPriceLine({
            price: activeCandle.resistance_level,
            color: '#10b981',
            lineWidth: 1.5,
            lineStyle: 1, // Dashed
            axisLabelVisible: true,
            title: 'Wyckoff Resistance',
          });
        } catch (e) {}
      }
    }
  }, [selectedCandle, activeCandles]);

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

      if (chartSettings.showTrades) {
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
  }, [entryPrice, slPrice, tpPrice, candles, chartSettings.showTrades]);

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
    if (!drawingPreview) return;
    setDrawings([...drawings, drawingPreview]);
    setDrawingPreview(null);
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      backgroundColor: '#111827',
      border: '1px solid #1f2937',
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
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '6px',
      padding: '4px 8px',
      color: '#ffffff',
      fontWeight: 'bold',
      cursor: 'pointer',
      outline: 'none',
    },
    toolbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid #1f2937',
      paddingBottom: '12px',
    },
    toolsGroup: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },
    symbolBadge: {
      color: '#d1d5db',
      fontWeight: 'bold',
      fontSize: '14px',
      backgroundColor: '#1f2937',
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
      backgroundColor: active ? (isDelete ? '#ef4444' : '#3b82f6') : '#1f2937',
      color: active ? '#ffffff' : '#9ca3af',
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
      color: '#9ca3af',
      backgroundColor: '#1f2937',
      border: 'none',
      padding: '8px',
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
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
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
    <div id={isFullscreen ? "tv-chart-fullscreen-container" : undefined} style={{ ...styles.container, ...(isFullscreen ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, backgroundColor: '#0b0f19', display: 'flex', flexDirection: 'column', padding: '16px', boxSizing: 'border-box', overflowY: 'auto' } : {}) }}>
      <div style={styles.toolbar}>
        <div style={{ ...styles.toolsGroup, flexWrap: 'wrap', gap: '12px' }}>
          {/* Data Source */}
          <div style={styles.pairGroup}>
            <span style={{ color: '#9ca3af', fontSize: '10px' }}>Data Source</span>
            <select 
              value={candleSource} 
              onChange={(e) => onCandleSourceChange(e.target.value as 'ctrader' | 'metatrader' | 'yfinance')}
              style={{
                ...styles.pairSelect,
                opacity: isLocal ? 1 : 0.7,
                cursor: isLocal ? 'pointer' : 'not-allowed'
              }}
              disabled={!isLocal}
            >
              {isLocal && <option value="ctrader">cTrader (Inactive)</option>}
              {isLocal && <option value="metatrader">MetaTrader 5</option>}
              <option value="yfinance">Yahoo Finance</option>
            </select>
          </div>

          {/* Symbol Search Input */}
          <div style={{ ...styles.pairGroup, position: 'relative' }}>
            <span style={{ color: '#9ca3af', fontSize: '10px' }}>Symbol</span>
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
                  width: '120px'
                }}
              />
              {showSymbolDropdown && (
                <>
                  <div 
                    onClick={() => setShowSymbolDropdown(false)}
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 999
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                    minWidth: '150px'
                  }}>
                    {filteredSymbols.length > 0 ? (
                      filteredSymbols
                        .map((sym, idx) => (
                          <div 
                            key={sym}
                            onClick={() => {
                              onSymbolChange(sym);
                              setShowSymbolDropdown(false);
                            }}
                            style={{
                              padding: '6px 10px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: '#ffffff',
                              backgroundColor: idx === highlightedIndex ? '#2563eb' : (symbol === sym ? 'rgba(37, 99, 235, 0.3)' : 'transparent'),
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={() => {
                              setHighlightedIndex(idx);
                            }}
                          >
                            {sym}
                          </div>
                        ))
                    ) : (
                      <div style={{ padding: '6px 10px', fontSize: '11px', color: '#6b7280' }}>
                        No results found
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Timeframe */}
          <div style={styles.pairGroup}>
            <span style={{ color: '#9ca3af', fontSize: '10px' }}>Timeframe</span>
            <select 
              value={timeframe} 
              onChange={(e) => onTimeframeChange(e.target.value)}
              style={styles.pairSelect}
            >
              {availableTimeframes.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>

          {/* Trades Filter */}
          <div style={styles.pairGroup}>
            <span style={{ color: '#9ca3af', fontSize: '10px' }}>Trades</span>
            <select 
              value={actualFilter} 
              onChange={(e) => setActualFilter(e.target.value as 'all' | 'wins' | 'losses')}
              style={styles.pairSelect}
            >
              <option value="all">Both (Winners & Losers)</option>
              <option value="wins">Winners Only</option>
              <option value="losses">Losers Only</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loadingStrategy && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.2)'
            }}>
              <span className="animate-pulse" style={{ display: 'inline-block', width: '6px', height: '6px', backgroundColor: '#38bdf8', borderRadius: '50%' }}></span>
              Analyzing Wyckoff & Weis Wave...
            </div>
          )}
          <button 
            onClick={onRefresh}
            style={styles.refreshBtn}
            title="Refresh chart data"
          >
            <RefreshCw size={16} className={loadingStrategy ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => {
              if (replayToolActive) {
                setReplayTime(null);
                setIsPlaying(false);
                if (onSelectCandleRef.current) {
                  onSelectCandleRef.current(null);
                }
              }
              setReplayToolActive(!replayToolActive);
            }}
            style={{
              ...styles.refreshBtn,
              backgroundColor: replayToolActive ? '#2563eb' : '#1f2937',
              color: replayToolActive ? '#ffffff' : '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
            title="Toggle Replay Tool. When active, click a candle to start replay from that point."
          >
            <Play size={14} fill={replayToolActive ? "#ffffff" : "none"} />
            Replay
          </button>
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              style={styles.refreshBtn}
              title="Chart Visibility Settings"
            >
              <Settings size={16} />
            </button>
            {showSettingsDropdown && (
              <>
                <div 
                  onClick={() => setShowSettingsDropdown(false)}
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1f2937',
                  borderRadius: '8px',
                  padding: '12px',
                  zIndex: 1000,
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                  minWidth: '180px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#9ca3af', borderBottom: '1px solid #1f2937', paddingBottom: '6px', marginBottom: '4px' }}>
                    Chart Visibility
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}>
                    <input 
                      type="checkbox" 
                      checked={chartSettings.showFvg} 
                      onChange={(e) => setChartSettings({ ...chartSettings, showFvg: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    Fair Value Gaps (FVG)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}>
                    <input 
                      type="checkbox" 
                      checked={chartSettings.showSessions} 
                      onChange={(e) => setChartSettings({ ...chartSettings, showSessions: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    Trading Sessions
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}>
                    <input 
                      type="checkbox" 
                      checked={chartSettings.showTrades} 
                      onChange={(e) => setChartSettings({ ...chartSettings, showTrades: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    Trades & Order Levels
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ffffff' }}>
                    <input 
                      type="checkbox" 
                      checked={chartSettings.showTrLines} 
                      onChange={(e) => setChartSettings({ ...chartSettings, showTrLines: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    Trading Range (TR)
                  </label>
                </div>
              </>
            )}
          </div>
          <button 
            onClick={toggleFullscreen}
            style={styles.refreshBtn}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div style={styles.chartWrapper}>
        {loading && (
          <div style={styles.loadingOverlay}>
            Fetching raw candles...
          </div>
        )}

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

          {/* Wyckoff Quantitative Market Structure Overlay */}
          {(() => {
            const activeCandle = selectedCandle || (activeCandles && activeCandles.length > 0 ? activeCandles[activeCandles.length - 1] : null);
            if (!activeCandle) return null;

            return (
              <div style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                color: '#cbd5e1',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '10px', color: '#9ca3af' }}>WYCKOFF:</span>
                  <span style={{
                    fontWeight: 'extrabold',
                    color: activeCandle.wyckoff_stage === 'ACCUMULATION' ? '#3b82f6' :
                           activeCandle.wyckoff_stage === 'MARKUP' ? '#10b981' :
                           activeCandle.wyckoff_stage === 'DISTRIBUTION' ? '#f59e0b' :
                           activeCandle.wyckoff_stage === 'MARKDOWN' ? '#ef4444' : '#cbd5e1',
                  }}>
                    {activeCandle.wyckoff_stage || 'TRANSITION'}
                  </span>
                  {(replayTime !== null || selectedCandle) ? (
                    <button 
                      onClick={() => {
                        setReplayTime(null);
                        setIsPlaying(false);
                        setReplayToolActive(false);
                        if (onSelectCandle) onSelectCandle(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3b82f6',
                        fontSize: '9px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      Reset
                    </button>
                  ) : (
                    <span style={{ fontSize: '8px', color: '#10b981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ display: 'inline-block', width: '4px', height: '4px', backgroundColor: '#10b981', borderRadius: '50%' }}></span>
                      LIVE
                    </span>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '8px', color: '#9ca3af', fontSize: '10px', borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '4px' }}>
                  <span>S: <strong style={{ color: '#ffffff' }}>{activeCandle.support_level ? `$${activeCandle.support_level.toFixed(2)}` : 'N/A'}</strong></span>
                  <span>R: <strong style={{ color: '#ffffff' }}>{activeCandle.resistance_level ? `$${activeCandle.resistance_level.toFixed(2)}` : 'N/A'}</strong></span>
                </div>

                {activeCandle.wyckoff_signal && (
                  <div style={{
                    color: activeCandle.wyckoff_signal.includes('Spring') ? '#10b981' : '#ef4444',
                    fontWeight: 'bold',
                    fontSize: '9px',
                    backgroundColor: activeCandle.wyckoff_signal.includes('Spring') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid ' + (activeCandle.wyckoff_signal.includes('Spring') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                    borderRadius: '4px',
                    padding: '2px 4px',
                    textAlign: 'center',
                    marginTop: '2px',
                  }}>
                    ⚡ {activeCandle.wyckoff_signal}
                  </div>
                )}
              </div>
            );
          })()}

          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            {/* Background Wyckoff Stage Shading */}
            {wyckoffZones.map((zone, index) => {
              const xStart = Math.min(zone.x1, zone.x2);
              const xEnd = Math.max(zone.x1, zone.x2);
              const width = Math.max(1, xEnd - xStart);
              const height = chartHeight - 26;

              let fill = 'transparent';
              if (zone.stage === 'ACCUMULATION') fill = 'rgba(59, 130, 246, 0.05)';
              else if (zone.stage === 'MARKUP') fill = 'rgba(16, 185, 129, 0.05)';
              else if (zone.stage === 'DISTRIBUTION') fill = 'rgba(245, 158, 11, 0.05)';
              else if (zone.stage === 'MARKDOWN') fill = 'rgba(239, 68, 68, 0.05)';

              if (fill === 'transparent') return null;

              return (
                <rect
                  key={`wyckoff-zone-${index}`}
                  x={xStart}
                  y={0}
                  width={width}
                  height={height}
                  fill={fill}
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}

            {chartSettings.showTrLines && supportLineSegments.map((seg, idx) => {
              let color = '#cbd5e1';
              if (seg.stage === 'ACCUMULATION') color = '#3b82f6';
              else if (seg.stage === 'MARKUP') color = '#10b981';
              else if (seg.stage === 'DISTRIBUTION') color = '#f59e0b';
              else if (seg.stage === 'MARKDOWN') color = '#ef4444';
              
              return (
                <line
                  key={`sup-seg-${idx}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  style={{ pointerEvents: 'none', opacity: 0.8 }}
                />
              );
            })}

            {chartSettings.showTrLines && resistanceLineSegments.map((seg, idx) => {
              let color = '#cbd5e1';
              if (seg.stage === 'ACCUMULATION') color = '#3b82f6';
              else if (seg.stage === 'MARKUP') color = '#10b981';
              else if (seg.stage === 'DISTRIBUTION') color = '#f59e0b';
              else if (seg.stage === 'MARKDOWN') color = '#ef4444';
              
              return (
                <line
                  key={`res-seg-${idx}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  style={{ pointerEvents: 'none', opacity: 0.8 }}
                />
              );
            })}
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

            {chartSettings.showSessions && sessionCoords.map((session, index) => {
              const rightScaleWidth = chartRef.current ? chartRef.current.priceScale('right').width() : 55;
              const plotWidth = chartContainerRef.current ? chartContainerRef.current.clientWidth - rightScaleWidth : 0;
              const plotHeight = chartHeight - 26; // Subtracting bottom time axis height

              // If completely outside the plot area, don't render
              if (session.x1 > plotWidth || session.y1 > plotHeight) return null;

              // Clip dimensions to plot boundary
              const renderX1 = Math.max(0, Math.min(plotWidth, session.x1));
              const renderX2 = Math.max(0, Math.min(plotWidth, session.x2));
              const renderY1 = Math.max(0, Math.min(plotHeight, session.y1));
              const renderY2 = Math.max(0, Math.min(plotHeight, session.y2));

              const width = Math.max(1, renderX2 - renderX1);
              const height = Math.max(1, renderY2 - renderY1);

              if (width <= 0 || height <= 0) return null;

              // 8% opacity fill, 40% stroke opacity
              const colorHex = session.color || '#3b82f6';
              // Convert hex to rgba to apply opacity
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

              const fill = `rgba(${r}, ${g}, ${b}, 0.08)`;
              const stroke = `rgba(${r}, ${g}, ${b}, 0.4)`;

              return (
                <g key={`session-${index}`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={renderX1}
                    y={renderY1}
                    width={width}
                    height={height}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                  {width > 40 && (
                    <text
                      x={renderX1 + 6}
                      y={renderY1 + 14}
                      fill={colorHex}
                      fontSize="9px"
                      fontWeight="bold"
                      style={{ opacity: 0.8 }}
                    >
                      {session.label}
                    </text>
                  )}
                </g>
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
            {/* Wyckoff Colored SMA Trend Line */}
            {chartSettings.showTrLines && trendLineSegments.map((seg, idx) => {
              let color = '#cbd5e1';
              if (seg.stage === 'ACCUMULATION') color = '#3b82f6';
              else if (seg.stage === 'MARKUP') color = '#10b981';
              else if (seg.stage === 'DISTRIBUTION') color = '#f59e0b';
              else if (seg.stage === 'MARKDOWN') color = '#ef4444';

              return (
                <line
                  key={`trend-line-seg-${idx}`}
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={color}
                  strokeWidth={2.5}
                  style={{ pointerEvents: 'none', opacity: 0.95 }}
                />
              );
            })}
          </svg>
        </div>

        <div ref={weisContainerRef} style={{ width: '100%', height: weisHeight, touchAction: 'none' }} />
      </div>
    </div>
  );
}
