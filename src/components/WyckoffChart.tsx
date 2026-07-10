import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Square, PenTool, Trash2, XCircle, RefreshCw } from 'lucide-react';

// ── Imports ───────────────────────────────────────────────────────────────


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

interface WyckoffChartProps {
  symbol: string;
  candles: Candle[];
  loading: boolean;
  onRefresh: () => void;
  entryPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  trades?: any[];
  selectedTrade?: any;
  onSelectTrade?: (trade: any) => void;
}

export default function WyckoffChart({ 
  symbol, 
  candles, 
  loading, 
  onRefresh, 
  entryPrice, 
  slPrice, 
  tpPrice,
  trades = [],
  selectedTrade = null,
  onSelectTrade
}: WyckoffChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const weisContainerRef = useRef<HTMLDivElement>(null);
  
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
    onSelectTradeRef.current = onSelectTrade;
  }, [onSelectTrade]);

  const [selectedTradeCoords, setSelectedTradeCoords] = useState<{ x1: number; x2: number; type: 'BUY' | 'SELL'; pnl: number } | null>(null);
  const selectedTradeRef = useRef(selectedTrade);

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
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      timeScale: {
        fixRightEdge: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 760,
    });

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Create the markers plugin for the candlestick series
    const markersPlugin = createSeriesMarkers(candlestickSeries);

    // Reference channels for Wyckoff TR high and TR low
    const trHighSeries = mainChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1.5,
      lineStyle: 1, // Dashed
      title: 'TR High',
    });

    const trLowSeries = mainChart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1.5,
      lineStyle: 1, // Dashed
      title: 'TR Low',
    });

    // Initialize Weis Wave sub-panel
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
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      timeScale: {
        fixRightEdge: false,
      },
      width: weisContainerRef.current.clientWidth,
      height: 140,
    });

    const weisSeries = weisChart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
    });

    // Synced scrolling and zooming via Logical Range
    let isSyncing = false;
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      try {
        weisChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) {
        // Ignored: handles internal null-value conversion when charts are loading/empty
      }
      updateDrawingCoordinates();
      isSyncing = false;
    });


    weisChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isSyncing || !range) return;
      isSyncing = true;
      try {
        mainChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) {
        // Ignored: handles internal null-value conversion when charts are loading/empty
      }
      isSyncing = false;
    });

    // Track state in refs
    chartRef.current = mainChart;
    weisChartRef.current = weisChart;
    candlestickSeriesRef.current = candlestickSeries;
    markersPluginRef.current = markersPlugin;
    weisSeriesRef.current = weisSeries;
    trHighSeriesRef.current = trHighSeries;
    trLowSeriesRef.current = trLowSeries;

    // Initialize selected trade path LineSeries
    const selectedTradePathSeries = mainChart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 2,
      lineStyle: 2, // Dotted
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    selectedTradePathSeriesRef.current = selectedTradePathSeries;

    // Click Subscription to select trades/signals
    mainChart.subscribeClick((param) => {
      if (!param.time || !onSelectTradeRef.current || !tradesRef.current || tradesRef.current.length === 0) return;
      const clickTime = param.time as number;
      const foundTrade = tradesRef.current.find(t => 
        t.entryTimestamp === clickTime || 
        t.exitTimestamp === clickTime || 
        t.timestamp === clickTime
      );
      if (foundTrade) {
        onSelectTradeRef.current(foundTrade);
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && mainChart) {
        mainChart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
      if (weisContainerRef.current && weisChart) {
        weisChart.applyOptions({ width: weisContainerRef.current.clientWidth });
      }
      updateDrawingCoordinates();
    };

    window.addEventListener('resize', handleResize);

    return () => {
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

      // Signal markers (Entries)
      const entryMarkers = candles
        .map((c) => {
          if (c.backtest_signal) {
            const isBullish = c.backtest_signal === 'BUY';
            return {
              time: c.time,
              position: (isBullish ? 'belowBar' : 'aboveBar') as any,
              color: isBullish ? '#10b981' : '#ef4444',
              shape: (isBullish ? 'arrowUp' : 'arrowDown') as any,
              text: isBullish ? 'BUY' : 'SELL',
            };
          }
          return null;
        })
        .filter((m) => m !== null);

      // Exit markers from backtested trades
      const exitMarkers = (trades || [])
        .map((trade) => {
          if (!trade.exitTimestamp) return null;
          // Skip "Position still open" or same-candle entry/exit (no real exit yet)
          if (trade.exitReason === 'Position still open') return null;
          if (trade.exitTimestamp === trade.entryTimestamp) return null;
          const isProfit = trade.pnl >= 0;
          return {
            time: trade.exitTimestamp,
            // Flip position vs entry marker so they don't overlap
            position: (trade.type === 'BUY' ? 'aboveBar' : 'belowBar') as any,
            color: isProfit ? '#10b981' : '#ef4444',
            shape: 'circle' as any,
            text: `EXIT (${isProfit ? '+' : ''}${trade.pnl.toFixed(2)})`,
          };
        })
        .filter((m) => m !== null);

      // Merge and sort all markers by timestamp
      const allMarkers = [...entryMarkers, ...exitMarkers].sort((a, b) => {
        const timeA = typeof a.time === 'number' ? a.time : new Date(a.time).getTime();
        const timeB = typeof b.time === 'number' ? b.time : new Date(b.time).getTime();
        return timeA - timeB;
      });

      if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers(allMarkers);
      }
    }

    // Set TR High & Low channels
    if (trHighSeriesRef.current && trLowSeriesRef.current) {
      const highData = candles.map(c => ({ time: c.time, value: c.tr_high || c.high }));
      const lowData = candles.map(c => ({ time: c.time, value: c.tr_low || c.low }));
      trHighSeriesRef.current.setData(highData);
      trLowSeriesRef.current.setData(lowData);
    }

    // Set Weis Wave volume data
    if (weisSeriesRef.current) {
      const weisData = candles.map((c) => {
        const val = c.weis_wave_volume || 0;
        return {
          time: c.time,
          value: Math.abs(val),
          color: val >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)',
        };
      });
      weisSeriesRef.current.setData(weisData);
    }

    // Dynamic LineSeries creation for 3-bar trade entry/SL/TP levels
    if (chartRef.current && candles.length > 0) {
      // 1. Remove old trade level lines
      dynamicLineSeriesRef.current.forEach((series) => {
        try {
          chartRef.current.removeSeries(series);
        } catch (e) {
          // Series might already be destroyed
        }
      });
      dynamicLineSeriesRef.current = [];

      // 2. Filter valid historical trades
      const realTrades = (trades || []).filter(
        (t) => t.entryTimestamp && t.entryPrice && t.slPrice && t.tpPrice && t.exitReason !== 'Position still open'
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

        // Configurations for clean indicator segments
        const entryData = points.map((p) => ({ time: p, value: trade.entryPrice }));
        const slData = points.map((p) => ({ time: p, value: trade.slPrice }));
        const tpData = points.map((p) => ({ time: p, value: trade.tpPrice }));

        const addTradeLine = (data: any[], color: string) => {
          const lineSeries = chartRef.current.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            lineStyle: 0, // Solid
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          lineSeries.setData(data);
          dynamicLineSeriesRef.current.push(lineSeries);
        };

        addTradeLine(entryData, '#3b82f6'); // blue
        addTradeLine(slData, '#ef4444');    // red
        addTradeLine(tpData, '#10b981');    // green
      });
    }

    updateDrawingCoordinates();
  }, [candles, trades]);

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

      if (entryPrice) {
        entryLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: entryPrice,
          color: '#3b82f6',
          lineWidth: 2,
          lineStyle: 2, // Dotted
          axisLabelVisible: true,
          title: 'Entry',
        });
      }
      if (slPrice) {
        slLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: slPrice,
          color: '#ef4444',
          lineWidth: 2,
          lineStyle: 1, // Dashed
          axisLabelVisible: true,
          title: 'SL',
        });
      }
      if (tpPrice) {
        tpLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: tpPrice,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: 1, // Dashed
          axisLabelVisible: true,
          title: 'TP',
        });
      }
    }
  }, [entryPrice, slPrice, tpPrice, candles]);

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

  // Vanilla CSS styles matching the original trading.tsx theme
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
    <div style={styles.container}>
      {/* Chart controls toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolsGroup}>
          <span style={styles.symbolBadge}>{symbol}</span>
          <button 
            style={styles.btn(activeTool === 'rectangle')}
            onClick={() => setActiveTool(activeTool === 'rectangle' ? 'none' : 'rectangle')}
          >
            <Square size={14} /> Draw Rectangle
          </button>
          <button 
            style={styles.btn(activeTool === 'trendline')}
            onClick={() => setActiveTool(activeTool === 'trendline' ? 'none' : 'trendline')}
          >
            <PenTool size={14} /> Draw Trendline
          </button>
          <button 
            style={styles.btn(activeTool === 'delete', true)}
            onClick={() => setActiveTool(activeTool === 'delete' ? 'none' : 'delete')}
          >
            <Trash2 size={14} /> Delete Selected
          </button>
          {drawings.length > 0 && (
            <button 
              style={styles.clearBtn}
              onClick={() => setDrawings([])}
            >
              <XCircle size={14} /> Clear Canvas
            </button>
          )}
        </div>

        <button 
          onClick={onRefresh}
          style={styles.refreshBtn}
          title="Refresh chart data"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Charts Panels wrapper */}
      <div style={styles.chartWrapper}>
        {loading && (
          <div style={styles.loadingOverlay}>
            Fetching analyzed Wyckoff & Weis Wave data...
          </div>
        )}

        {/* Main price panel */}
        <div style={{ position: 'relative', height: 760 }}>
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* SVG overlays */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: activeTool !== 'none' ? 10 : 1,
              pointerEvents: activeTool !== 'none' ? 'auto' : 'none',
              cursor: activeTool === 'delete' ? 'crosshair' : activeTool !== 'none' ? 'cell' : 'default',
            }}
            onMouseDown={handleSVGMouseDown}
            onMouseMove={handleSVGMouseMove}
            onMouseUp={handleSVGMouseUp}
          >

            {/* Shaded Area for selected trade range */}
            {selectedTradeCoords && (
              <rect
                x={Math.min(selectedTradeCoords.x1, selectedTradeCoords.x2)}
                y={0}
                width={Math.max(1, Math.abs(selectedTradeCoords.x1 - selectedTradeCoords.x2))}
                height={760}
                fill={selectedTradeCoords.pnl >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'}
                stroke={selectedTradeCoords.pnl >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}
                strokeWidth={1}
                strokeDasharray="4 4"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Draw active lines/rectangles */}
            {pixelDrawings.map((d) => {
              if (d.type === 'trendline') {
                return (
                  <line
                    key={d.index}
                    x1={d.x1}
                    y1={d.y1}
                    x2={d.x2}
                    y2={d.y2}
                    stroke={activeTool === 'delete' ? '#ef4444' : '#3b82f6'}
                    strokeWidth={3}
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool === 'delete') {
                        setDrawings(drawings.filter((_, idx) => idx !== d.index));
                      }
                    }}
                  />
                );
              } else if (d.type === 'rectangle') {
                const x = Math.min(d.x1, d.x2);
                const y = Math.min(d.y1, d.y2);
                const width = Math.abs(d.x1 - d.x2);
                const height = Math.abs(d.y1 - d.y2);
                return (
                  <rect
                    key={d.index}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill="rgba(59, 130, 246, 0.15)"
                    stroke={activeTool === 'delete' ? '#ef4444' : '#3b82f6'}
                    strokeWidth={2}
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTool === 'delete') {
                        setDrawings(drawings.filter((_, idx) => idx !== d.index));
                      }
                    }}
                  />
                );
              }
              return null;
            })}

            {/* Live drawing preview */}
            {pixelPreview && (
              <>
                {pixelPreview.type === 'trendline' && (
                  <line
                    x1={pixelPreview.x1}
                    y1={pixelPreview.y1}
                    x2={pixelPreview.x2}
                    y2={pixelPreview.y2}
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="4"
                  />
                )}
                {pixelPreview.type === 'rectangle' && (
                  <rect
                    x={Math.min(pixelPreview.x1, pixelPreview.x2)}
                    y={Math.min(pixelPreview.y1, pixelPreview.y2)}
                    width={Math.abs(pixelPreview.x1 - pixelPreview.x2)}
                    height={Math.abs(pixelPreview.y1 - pixelPreview.y2)}
                    fill="rgba(16, 185, 129, 0.1)"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="4"
                  />
                )}
              </>
            )}
          </svg>
        </div>

        {/* Weis Wave Synced panel */}
        <div ref={weisContainerRef} style={{ width: '100%', height: 140 }} />
      </div>
    </div>
  );
}
