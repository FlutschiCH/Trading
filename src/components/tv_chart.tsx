import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Square, PenTool, Trash2, XCircle, RefreshCw, Maximize2, Minimize2, Settings } from 'lucide-react';
import { calculateDateBounds } from '../App';

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
  enabledIndicators,
  fvgs = [],
  tradeFilter = 'all',
  onTradeFilterChange,
  sessions = [],
  sessionsTimezone = 'Local'
}: TVChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const weisContainerRef = useRef<HTMLDivElement>(null);
  
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
    tradesRef.current = trades;
    updateDrawingCoordinates();
  }, [trades]);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    onSelectCandleRef.current = onSelectCandle;
  }, [onSelectCandle]);

  useEffect(() => {
    onSelectTradeRef.current = onSelectTrade;
  }, [onSelectTrade]);

  useEffect(() => {
    fvgsRef.current = fvgs;
    updateDrawingCoordinates();
  }, [fvgs]);

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
  }, [dateRangeOption, customFrom, customTo, candles, enabledIndicators, fvgs, sessions, sessionsTimezone]);

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

      setSessionCoords(activeCoords);
    } else {
      setSessionCoords([]);
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

      if (onSelectCandleRef.current && candlesRef.current) {
        const foundCandle = candlesRef.current.find(c => Number(c.time) === clickTime);
        if (foundCandle) {
          onSelectCandleRef.current(foundCandle);
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
    if (!candles || candles.length === 0) return;

    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(candles);

      const entryMarkers = chartSettings.showTrades ? candles
        .map((c) => {
          if (c.backtest_signal) {
            const isBullish = c.backtest_signal === 'BUY';
            const trade = (trades || []).find(t => Number(t.entryTimestamp) === Number(c.time));
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

      const exitMarkers = chartSettings.showTrades ? (trades || [])
        .map((trade) => {
          if (!trade.exitTimestamp) return null;
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

    const hasAnalysis = candles.some(c => c.tr_high !== undefined);

    if (trHighSeriesRef.current && trLowSeriesRef.current) {
      if (hasAnalysis && chartSettings.showTrLines) {
        const highData = candles.map(c => ({ time: c.time, value: c.tr_high || c.high }));
        const lowData = candles.map(c => ({ time: c.time, value: c.tr_low || c.low }));
        trHighSeriesRef.current.setData(highData);
        trLowSeriesRef.current.setData(lowData);
      } else {
        trHighSeriesRef.current.setData([]);
        trLowSeriesRef.current.setData([]);
      }
    }

    if (weisSeriesRef.current) {
      const volumeData = candles.map((c) => {
        const isUp = c.close >= c.open;
        return {
          time: c.time,
          value: c.volume || 0,
          color: isUp ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)',
        };
      });
      weisSeriesRef.current.setData(volumeData);
    }

    if (chartRef.current && candles.length > 0) {
      dynamicLineSeriesRef.current.forEach((series) => {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {}
      });
      dynamicLineSeriesRef.current = [];

      if (chartSettings.showTrades) {
        const realTrades = (trades || []).filter(
          (t) => t.entryTimestamp && t.entryPrice && t.slPrice && t.tpPrice
        );

        const sortedTimes = candles.map((c) => Number(c.time)).sort((a, b) => a - b);
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
  }, [candles, trades, actualFilter, chartSettings.showTrades, chartSettings.showTrLines]);

  // Update price format and precision dynamically based on candle data
  useEffect(() => {
    if (!candlestickSeriesRef.current || !candles || candles.length === 0) return;
    
    let maxDecimals = 2;
    const sampleSize = Math.min(candles.length, 20);
    for (let i = 0; i < sampleSize; i++) {
      const candle = candles[i];
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
  }, [symbol, candles]);

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
              style={styles.pairSelect}
            >
              <option value="ctrader">cTrader (Inactive)</option>
              <option value="metatrader">MetaTrader 5</option>
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
          </svg>
        </div>

        <div ref={weisContainerRef} style={{ width: '100%', height: weisHeight, touchAction: 'none' }} />
      </div>
    </div>
  );
}
