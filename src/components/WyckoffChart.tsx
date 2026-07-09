import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { Square, PenTool, Trash2, XCircle, RefreshCw } from 'lucide-react';

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
}

interface WyckoffChartProps {
  symbol: string;
  candles: Candle[];
  loading: boolean;
  onRefresh: () => void;
}

export default function WyckoffChart({ symbol, candles, loading, onRefresh }: WyckoffChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const weisContainerRef = useRef<HTMLDivElement>(null);
  
  const chartRef = useRef<any>(null);
  const weisChartRef = useRef<any>(null);
  
  const candlestickSeriesRef = useRef<any>(null);
  const weisSeriesRef = useRef<any>(null);
  const trHighSeriesRef = useRef<any>(null);
  const trLowSeriesRef = useRef<any>(null);

  // Drawing Tools State
  const [activeTool, setActiveTool] = useState<'none' | 'trendline' | 'rectangle' | 'delete'>('none');
  const [drawings, setDrawings] = useState<any[]>([]);
  const [drawingPreview, setDrawingPreview] = useState<any>(null);
  const [pixelDrawings, setPixelDrawings] = useState<any[]>([]);
  const [pixelPreview, setPixelPreview] = useState<any>(null);

  const drawingsRef = useRef(drawings);
  const drawingPreviewRef = useRef(drawingPreview);

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
      width: chartContainerRef.current.clientWidth,
      height: 380,
    });

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

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
      width: weisContainerRef.current.clientWidth,
      height: 140,
    });

    const weisSeries = weisChart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
    });

    // Synced scrolling and zooming
    let isSyncing = false;
    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (isSyncing) return;
      isSyncing = true;
      weisChart.timeScale().setVisibleTimeRange(range || null);
      updateDrawingCoordinates();
      isSyncing = false;
    });

    weisChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (isSyncing) return;
      isSyncing = true;
      mainChart.timeScale().setVisibleTimeRange(range || null);
      isSyncing = false;
    });

    // Track state in refs
    chartRef.current = mainChart;
    weisChartRef.current = weisChart;
    candlestickSeriesRef.current = candlestickSeries;
    weisSeriesRef.current = weisSeries;
    trHighSeriesRef.current = trHighSeries;
    trLowSeriesRef.current = trLowSeries;

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
      mainChart.remove();
      weisChart.remove();
    };
  }, []);

  // Update Data Series
  useEffect(() => {
    if (!candles || candles.length === 0) return;

    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(candles);

      // VSA markers
      const markers = candles
        .map((c) => {
          if (c.vsa_patterns && c.vsa_patterns.length > 0) {
            const text = c.vsa_patterns.join(', ');
            const isBullish = c.vsa_patterns.includes('Shakeout/Spring') || c.vsa_patterns.includes('Stopping Volume') || c.vsa_patterns.includes('No Supply');
            return {
              time: c.time,
              position: (isBullish ? 'belowBar' : 'aboveBar') as any,
              color: isBullish ? '#10b981' : '#ef4444',
              shape: (isBullish ? 'arrowUp' : 'arrowDown') as any,
              text: text,
            };
          }
          return null;
        })
        .filter((m) => m !== null);
      candlestickSeriesRef.current.setMarkers(markers);
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

    updateDrawingCoordinates();
  }, [candles]);

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

  return (
    <div className="flex flex-col gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
      {/* Chart controls toolbar */}
      <div className="flex justify-between items-center border-b border-gray-800 pb-3">
        <div className="flex gap-2">
          <span className="text-gray-300 font-bold text-sm bg-gray-800 px-3 py-1.5 rounded-lg">{symbol}</span>
          <button 
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition ${activeTool === 'rectangle' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTool(activeTool === 'rectangle' ? 'none' : 'rectangle')}
          >
            <Square size={14} /> Draw Rectangle
          </button>
          <button 
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition ${activeTool === 'trendline' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTool(activeTool === 'trendline' ? 'none' : 'trendline')}
          >
            <PenTool size={14} /> Draw Trendline
          </button>
          <button 
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition ${activeTool === 'delete' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTool(activeTool === 'delete' ? 'none' : 'delete')}
          >
            <Trash2 size={14} /> Delete Selected
          </button>
          {drawings.length > 0 && (
            <button 
              className="px-3 py-1.5 bg-red-950 text-red-400 hover:bg-red-900 hover:text-white rounded-lg flex items-center gap-1.5 text-xs font-bold transition"
              onClick={() => setDrawings([])}
            >
              <XCircle size={14} /> Clear Canvas
            </button>
          )}
        </div>

        <button 
          onClick={onRefresh}
          className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 p-2 rounded-lg transition"
          title="Refresh chart data"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Charts Panels wrapper */}
      <div className="relative flex flex-col gap-2 bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center text-blue-500 font-bold z-30">
            Fetching analyzed Wyckoff & Weis Wave data...
          </div>
        )}

        {/* Main price panel */}
        <div className="relative" style={{ height: 380 }}>
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* SVG overlays */}
          <svg
            className="absolute inset-0"
            style={{
              zIndex: activeTool !== 'none' ? 10 : 1,
              pointerEvents: activeTool !== 'none' ? 'auto' : 'none',
              cursor: activeTool === 'delete' ? 'crosshair' : activeTool !== 'none' ? 'cell' : 'default',
            }}
            onMouseDown={handleSVGMouseDown}
            onMouseMove={handleSVGMouseMove}
            onMouseUp={handleSVGMouseUp}
          >
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
