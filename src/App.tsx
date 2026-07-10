import React, { useEffect, useState } from 'react';
import { Activity, X, TrendingUp, TrendingDown, Clock, HelpCircle } from 'lucide-react';
import WyckoffChart from './components/WyckoffChart.tsx';
import Dashboard from './components/Dashboard.tsx';
import './App.css';

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
  sweep_high?: number;
  sweep_low?: number;
  backtest_signal?: 'BUY' | 'SELL';
}

interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  currency: string;
  account_type?: string;
  broker?: string;
}

interface Position {
  position_id: number;
  symbol: string;
  trade_side: string;
  volume: number;
  entry_price: number;
  unrealized_profit: number;
}

const formatDateTime = (timestampSec: number) => {
  const d = new Date(timestampSec * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export default function App() {
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([
    'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 
    'AUDUSD', 'USDCAD', 'XAUUSD', 'US30', 'GER40'
  ]);
  const [availableTimeframes, setAvailableTimeframes] = useState<string[]>([
    '1m', '5m', '15m', '30m', '1h', '4h', '1d'
  ]);
  const [symbol, setSymbol] = useState('BTCUSD');
  const [timeframe, setTimeframe] = useState('15m');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [price, setPrice] = useState('57450.00');
  const [amount, setAmount] = useState('0.1');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  // Connection states
  const [connectionMode, setConnectionMode] = useState<'openapi' | 'fix'>('fix');
  const [isConnectedOpenAPI] = useState(true);
  const [isConnectedFIX] = useState(true);

  // Account & Positions
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);

  // Backtester states
  const [backtestSL, setBacktestSL] = useState('1.0');
  const [backtestSLType, setBacktestSLType] = useState<'pct' | 'price'>('pct');
  const [backtestRR, setBacktestRR] = useState('2');
  const [backtestSize, setBacktestSize] = useState('1');
  const [lookbackWindow, setLookbackWindow] = useState('20');
  const [backtestBalance, setBacktestBalance] = useState('10000');
  const [backtestRiskPct, setBacktestRiskPct] = useState('1.0');
  const [useRiskSizing, setUseRiskSizing] = useState(true);
  const [backtestBE, setBacktestBE] = useState('1.0');
  const [useBreakEven, setUseBreakEven] = useState(true);
  const [backtestResults, setBacktestResults] = useState<{
    trades: any[];
    winRate: number;
    netPnl: number;
    profitFactor: number;
    totalTrades: number;
    maxDrawdown: number;
    maxDailyLoss: number;
    dailyLossBreached: boolean;
    candles?: Candle[];
    monthlyBreakdown?: { [month: string]: number };
    weeklyBreakdown?: { [week: string]: number };
  } | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [backtestTab, setBacktestTab] = useState<'trades' | 'weekly' | 'monthly'>('trades');

  const [panelOrder, setPanelOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('wyckoff_desk_panel_order');
    return saved ? JSON.parse(saved) : ['backtester', 'chart', 'order', 'dashboard'];
  });
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    const target = e.target as HTMLElement;
    // Don't drag if clicking buttons/inputs/selects
    if (
      target.tagName === 'INPUT' || 
      target.tagName === 'BUTTON' || 
      target.tagName === 'SELECT' || 
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') ||
      target.closest('.no-drag')
    ) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;

    setPanelOrder(prev => {
      const next = [...prev];
      const draggedIdx = next.indexOf(draggedId);
      const targetIdx = next.indexOf(targetId);
      if (draggedIdx !== -1 && targetIdx !== -1) {
        next.splice(draggedIdx, 1);
        next.splice(targetIdx, 0, draggedId);
      }
      localStorage.setItem('wyckoff_desk_panel_order', JSON.stringify(next));
      return next;
    });
    setDragOverId(null);
  };

  const [cardWidths, setCardWidths] = useState<{ [key: string]: number }>(() => {
    const saved = localStorage.getItem('wyckoff_desk_card_widths');
    return saved ? JSON.parse(saved) : {};
  });
  const [activeResize, setActiveResize] = useState<{
    id: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleResizeMouseDown = (e: React.MouseEvent, id: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveResize({
      id,
      startX: e.clientX,
      startWidth: currentWidth,
    });
  };

  useEffect(() => {
    if (!activeResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - activeResize.startX;
      const newWidth = Math.max(280, activeResize.startWidth + dx);
      setCardWidths(prev => {
        const next = {
          ...prev,
          [activeResize.id]: newWidth,
        };
        localStorage.setItem('wyckoff_desk_card_widths', JSON.stringify(next));
        return next;
      });
    };

    const handleMouseUp = () => {
      setActiveResize(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeResize]);

  const renderResizeHandle = (id: string) => (
    <div
      onMouseDown={(e) => {
        const rect = e.currentTarget.parentElement?.getBoundingClientRect();
        const currentWidth = rect ? rect.width : 400;
        handleResizeMouseDown(e, id, currentWidth);
      }}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '6px',
        height: '100%',
        cursor: 'col-resize',
        backgroundColor: activeResize?.id === id ? '#3b82f6' : 'transparent',
        transition: 'background-color 0.2s',
        zIndex: 100,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
      }}
      onMouseLeave={(e) => {
        if (activeResize?.id !== id) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    />
  );

  const runBacktest = async () => {
    if (!candles || candles.length === 0) return;
    
    try {
      const response = await fetch('http://localhost:8751/api/backtest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          candles,
          symbol,
          slVal: parseFloat(backtestSL) || 1.0,
          slType: backtestSLType,
          rr: parseFloat(backtestRR) || 2,
          size: parseFloat(backtestSize) || 1,
          initialBalance: parseFloat(backtestBalance) || 10000,
          useRiskSizing,
          riskPct: parseFloat(backtestRiskPct) || 1.0,
          useBreakEven,
          beTriggerR: parseFloat(backtestBE) || 1.0,
          lookbackWindow: parseInt(lookbackWindow) || 20,
        }),
      });
      const res = await response.json();
      if (res.status === 'success' && res.data) {
        setBacktestResults(res.data);
        if (res.data.trades && res.data.trades.length > 0) {
          setSelectedTrade(res.data.trades[0]);
        } else {
          setSelectedTrade(null);
        }
      }
    } catch (e) {
      console.error("Failed to run backtest on backend:", e);
    }
  };

  useEffect(() => {
    runBacktest();
  }, [candles, symbol, backtestSL, backtestSLType, backtestRR, backtestSize, lookbackWindow, backtestBalance, backtestRiskPct, useRiskSizing, backtestBE, useBreakEven]);

  // Fetch symbols and timeframes metadata on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const symRes = await fetch('http://localhost:8751/api/ctrader/symbols');
        const symData = await symRes.json();
        if (symData.status === 'success' && symData.data) {
          setAvailableSymbols(symData.data);
          if (symData.data.length > 0 && !symData.data.includes(symbol)) {
            setSymbol(symData.data[0]);
          }
        }
      } catch (e) {
        console.error('Failed to load symbols:', e);
      }

      try {
        const tfRes = await fetch('http://localhost:8751/api/ctrader/timeframes');
        const tfData = await tfRes.json();
        if (tfData.status === 'success' && tfData.data) {
          setAvailableTimeframes(tfData.data);
        }
      } catch (e) {
        console.error('Failed to load timeframes:', e);
      }
    };
    loadMetadata();
  }, []);

  // Fetch candle data and analyze on Flask backend
  const fetchCandles = async () => {
    setLoading(true);
    try {
      let rawCandles: Candle[] = [];
      try {
        const response = await fetch('http://localhost:8751/api/candles/historical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: symbol.replace('BINANCE:', ''),
            interval: timeframe,
            limit: 500,
          }),
        });
        const result = await response.json();
        if (result.status === 'success') {
          rawCandles = result.data.sort((a: Candle, b: Candle) => a.time - b.time);
        }
      } catch (err) {
        console.warn("Using local historical mock generation fallback.");
      }

      if (rawCandles.length > 0) {
        // Send to Flask analyze endpoint for VSA patterns & Weis Wave aggregation
        try {
          const analysisResponse = await fetch('http://localhost:8751/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              candles: rawCandles,
              lookback: parseInt(lookbackWindow) || 20
            }),
          });
          const analysisResult = await analysisResponse.json();
          if (analysisResult.status === 'success') {
            rawCandles = analysisResult.data;
          }
        } catch (analysisErr) {
          console.error("Failed to run Flask analyze endpoint:", analysisErr);
        }
        setCandles(rawCandles);
      }
    } catch (error) {
      console.error('Error fetching candles:', error);
    } finally {
      setLoading(false);
    }
  };

  // cTrader API endpoints
  const fetchAccountData = async () => {
    const isConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;
    if (!isConnected) return;
    try {
      const endpoint = connectionMode === 'openapi' ? 'ctrader/account' : 'localctrader/account';
      const response = await fetch(`http://localhost:8751/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setAccountInfo(result.data);
      }
    } catch (error) {
      console.error('Account data error:', error);
    }
  };

  const fetchPositionData = async () => {
    const isConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;
    if (!isConnected) return;
    try {
      const endpoint = connectionMode === 'openapi' ? 'ctrader/positions' : 'localctrader/positions';
      const response = await fetch(`http://localhost:8751/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.status === 'success') {
        setOpenPositions(result.data);
      }
    } catch (error) {
      console.error('Positions data error:', error);
    }
  };

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = connectionMode === 'openapi' ? 'ctrader/order' : 'localctrader/order';
      const response = await fetch(`http://localhost:8751/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol,
          order_type: tradeType,
          volume: parseFloat(amount),
          price: orderType === 'market' ? null : parseFloat(price),
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        fetchAccountData();
        fetchPositionData();
      } else {
        alert('Order execution failed: ' + result.message);
      }
    } catch (error) {
      console.error('Order submission error:', error);
    }
  };

  useEffect(() => {
    fetchCandles();
  }, [symbol, timeframe, lookbackWindow]);

  useEffect(() => {
    const isConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;
    if (!isConnected) return;
    fetchAccountData();
    fetchPositionData();
    const interval = setInterval(() => {
      fetchAccountData();
      fetchPositionData();
    }, 5000);
    return () => clearInterval(interval);
  }, [connectionMode]);

  const currentConnected = connectionMode === 'openapi' ? isConnectedOpenAPI : isConnectedFIX;

  // Shared Inline Styles
  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f3f4f6',
      display: 'flex',
      flexDirection: 'column' as const,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    header: {
      backgroundColor: '#111827',
      borderBottom: '1px solid #1f2937',
      padding: '16px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap' as const,
    },
    logoSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    logoText: {
      fontWeight: 'bold',
      fontSize: '20px',
      letterSpacing: '1px',
    },
    logoHighlight: {
      color: '#3b82f6',
    },
    statusBadge: {
      fontSize: '10px',
      fontWeight: 'bold',
      padding: '2px 8px',
      borderRadius: '12px',
      border: '1px solid',
      backgroundColor: currentConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      color: currentConnected ? '#10b981' : '#ef4444',
      borderColor: currentConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    },
    linkBtn: {
      fontSize: '11px',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      color: '#3b82f6',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      padding: '4px 10px',
      borderRadius: '12px',
      fontWeight: 'bold' as const,
      textDecoration: 'none',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'all 0.2s',
      marginLeft: '8px',
    },
    controlsSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    modeTabs: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '4px',
      display: 'flex',
      gap: '4px',
    },
    modeBtn: (active: boolean) => ({
      backgroundColor: active ? '#3b82f6' : 'transparent',
      color: active ? '#ffffff' : '#9ca3af',
      padding: '6px 12px',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 'bold',
      transition: 'all 0.2s',
    }),
    pairGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
      textAlign: 'right' as const,
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
    mainLayout: {
      flex: 1,
      padding: '24px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '24px',
    },
    topPane: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '24px',
    },
    chartCol: {
      gridColumn: 'span 3',
      '@media (max-width: 1024px)': {
        gridColumn: 'span 1',
      }
    },
    orderCard: {
      backgroundColor: '#111827',
      border: '1px solid #1f2937',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
    },
    cardTitle: {
      color: '#e5e7eb',
      fontWeight: 'bold',
      fontSize: '14px',
      borderBottom: '1px solid #1f2937',
      paddingBottom: '8px',
      margin: 0,
    },
    tradeTypeTabs: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
    },
    tradeTypeBtn: (active: boolean, isBuy: boolean) => ({
      padding: '8px',
      borderRadius: '6px',
      fontWeight: 'bold' as const,
      fontSize: '12px',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      backgroundColor: active ? (isBuy ? '#10b981' : '#ef4444') : '#1f2937',
      color: active ? '#ffffff' : '#9ca3af',
    }),
    walletContainer: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '10px',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    walletRow: {
      display: 'flex',
      justifyContent: 'space-between',
    },
    tradeForm: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
      fontSize: '12px',
    },
    orderTypeTabs: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '8px',
      padding: '4px',
      display: 'flex',
      gap: '4px',
    },
    orderTypeBtn: (active: boolean) => ({
      flex: 1,
      padding: '4px',
      borderRadius: '6px',
      fontSize: '10px',
      border: 'none',
      cursor: 'pointer',
      backgroundColor: active ? '#1f2937' : 'transparent',
      color: active ? '#ffffff' : '#9ca3af',
      fontWeight: 'bold',
      transition: 'all 0.2s',
    }),
    formGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    input: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '6px',
      padding: '6px 10px',
      color: '#ffffff',
      outline: 'none',
    },
    submitBtn: (isBuy: boolean) => ({
      width: '100%',
      marginTop: '8px',
      padding: '10px',
      borderRadius: '8px',
      fontWeight: 'bold' as const,
      border: 'none',
      cursor: 'pointer',
      backgroundColor: isBuy ? '#10b981' : '#ef4444',
      color: '#ffffff',
      boxShadow: `0 4px 14px ${isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
      transition: 'all 0.2s',
    }),
    positionsList: {
      marginTop: '8px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
      maxHeight: '140px',
      overflowY: 'auto' as const,
    },
    positionRow: {
      backgroundColor: '#0b0f19',
      border: '1px solid #1f2937',
      borderRadius: '6px',
      padding: '8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    posDetails: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '2px',
    },
    posSide: (isBuy: boolean) => ({
      fontWeight: 'bold' as const,
      color: isBuy ? '#10b981' : '#ef4444',
    }),
    posPnl: (isProfit: boolean) => ({
      fontWeight: 'bold' as const,
      color: isProfit ? '#10b981' : '#ef4444',
    })
  };

  return (
    <div style={styles.container}>
      
      {/* Upper Navigation Desk Bar */}
      <header style={styles.header}>
        <div style={styles.logoSection}>
          <Activity size={28} style={{ color: '#3b82f6' }} />
          <span style={styles.logoText}>WYCKOFF<span style={styles.logoHighlight}>DESK</span></span>
          <span style={styles.statusBadge}>
            cTrader {connectionMode.toUpperCase()} {currentConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
          <a href="https://openapi.ctrader.com/apps" target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
            cTrader Apps
          </a>
          <a href="https://gemini.google.com/app/71d33e33a84aa328" target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
            Wyckoff Prompt
          </a>
          <a href="https://trader.ftmo.com/accounts-overview" target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
            FTMO Overview
          </a>
        </div>

        {/* Workspace controls */}
        <div style={styles.controlsSection}>
          <div style={styles.modeTabs}>
            <button 
              style={styles.modeBtn(connectionMode === 'fix')}
              onClick={() => setConnectionMode('fix')}
            >
              FIX API
            </button>
            <button 
              style={styles.modeBtn(connectionMode === 'openapi')}
              onClick={() => setConnectionMode('openapi')}
            >
              OpenAPI
            </button>
          </div>

          <div style={styles.pairGroup}>
            <span style={{ color: '#9ca3af' }}>Symbol</span>
            <select 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value)}
              style={styles.pairSelect}
            >
              {availableSymbols.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>

          <div style={styles.pairGroup}>
            <span style={{ color: '#9ca3af' }}>Timeframe</span>
            <select 
              value={timeframe} 
              onChange={(e) => setTimeframe(e.target.value)}
              style={styles.pairSelect}
            >
              {availableTimeframes.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main style={styles.mainLayout}>
        


        {/* Dynamic Reorderable Dashboard Panels Grid */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '24px',
          width: '100%',
        }}>
          {panelOrder.map((panelId) => {
            const isDragOver = dragOverId === panelId;
            const defaultWidth = panelId === 'chart' || panelId === 'dashboard' ? 'calc(66.6% - 16px)' : 'calc(33.3% - 16px)';
            const dragStyles = {
              width: cardWidths[panelId] ? `${cardWidths[panelId]}px` : defaultWidth,
              flexGrow: cardWidths[panelId] ? 0 : 1,
              flexShrink: 1,
              minWidth: '280px',
              border: isDragOver ? '2px dashed #3b82f6' : '1px solid #1f2937',
              borderRadius: '12px',
              backgroundColor: '#0f172a',
              transition: activeResize ? 'none' : 'border 0.2s, opacity 0.2s',
              opacity: isDragOver ? 0.75 : 1,
              position: 'relative' as const,
              overflow: 'hidden',
            };

            const headerStyle = {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#1e293b',
              padding: '10px 16px',
              cursor: 'grab',
              userSelect: 'none' as const,
              borderBottom: '1px solid #111827',
              fontSize: '12px',
              fontWeight: 'bold',
              color: '#d1d5db',
            };

            const contentStyle = {
              padding: '16px',
            };

            if (panelId === 'chart') {
              return (
                <div
                  key="chart"
                  onDragOver={(e) => handleDragOver(e, 'chart')}
                  onDrop={(e) => handleDrop(e, 'chart')}
                  style={dragStyles}
                >
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'chart')}
                    style={headerStyle}
                  >
                    <span>📊 Candlestick & Weis Wave Analysis Chart</span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                  </div>
                  <div className="no-drag" style={{ padding: '0px' }}>
                    <WyckoffChart 
                      symbol={symbol} 
                      candles={backtestResults?.candles || candles} 
                      loading={loading} 
                      onRefresh={fetchCandles} 
                      entryPrice={selectedTrade?.entryPrice}
                      slPrice={selectedTrade?.slPrice}
                      tpPrice={selectedTrade?.tpPrice}
                      trades={backtestResults?.trades || []}
                      selectedTrade={selectedTrade}
                      onSelectTrade={(trade) => {
                        setSelectedTrade(trade);
                        setShowModal(true);
                      }}
                    />
                  </div>
                  {renderResizeHandle('chart')}
                </div>
              );
            }

            if (panelId === 'order') {
              return (
                <div
                  key="order"
                  onDragOver={(e) => handleDragOver(e, 'order')}
                  onDrop={(e) => handleDrop(e, 'order')}
                  style={dragStyles}
                >
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'order')}
                    style={headerStyle}
                  >
                    <span>💼 Manual Order Execution Panel</span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                  </div>
                  <div className="no-drag" style={contentStyle}>
                    <div style={styles.tradeTypeTabs}>
                      <button 
                        onClick={() => setTradeType('buy')}
                        style={styles.tradeTypeBtn(tradeType === 'buy', true)}
                      >
                        BUY
                      </button>
                      <button 
                        onClick={() => setTradeType('sell')}
                        style={styles.tradeTypeBtn(tradeType === 'sell', false)}
                      >
                        SELL
                      </button>
                    </div>

                    {accountInfo && (
                      <div style={{ ...styles.walletContainer, marginTop: '12px' }}>
                        <div style={styles.walletRow}>
                          <span style={{ color: '#9ca3af' }}>Balance:</span>
                          <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{accountInfo.balance} {accountInfo.currency}</span>
                        </div>
                        <div style={styles.walletRow}>
                          <span style={{ color: '#9ca3af' }}>Free Margin:</span>
                          <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{accountInfo.margin_free} {accountInfo.currency}</span>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleExecuteTrade} style={{ ...styles.tradeForm, marginTop: '12px' }}>
                      <div style={styles.orderTypeTabs}>
                        <button
                          type="button"
                          onClick={() => setOrderType('market')}
                          style={styles.orderTypeBtn(orderType === 'market')}
                        >
                          MARKET
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrderType('limit')}
                          style={styles.orderTypeBtn(orderType === 'limit')}
                        >
                          LIMIT
                        </button>
                      </div>

                      {orderType === 'limit' && (
                        <div style={styles.formGroup}>
                          <label style={{ color: '#9ca3af' }}>Limit Price (USDT)</label>
                          <input 
                            type="number" 
                            value={price} 
                            onChange={(e) => setPrice(e.target.value)}
                            style={styles.input}
                            step="0.01"
                            required
                          />
                        </div>
                      )}

                      <div style={styles.formGroup}>
                        <label style={{ color: '#9ca3af' }}>Order Quantity</label>
                        <input 
                          type="number" 
                          value={amount} 
                          onChange={(e) => setAmount(e.target.value)}
                          style={styles.input}
                          step="0.01"
                          min="0.01"
                          required
                        />
                      </div>

                      <button 
                        type="submit" 
                        style={styles.submitBtn(tradeType === 'buy')}
                      >
                        Submit Order
                      </button>
                    </form>

                    {/* Position Display */}
                    {openPositions.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9ca3af' }}>
                          Positions ({openPositions.length})
                        </span>
                        <div style={styles.positionsList}>
                          {openPositions.map((pos) => (
                            <div key={pos.position_id} style={styles.positionRow}>
                              <div style={styles.posDetails}>
                                <span style={styles.posSide(pos.trade_side === 'BUY')}>{pos.trade_side} {pos.volume}</span>
                                <span style={{ fontSize: '10px', color: '#6b7280' }}>{pos.symbol}</span>
                              </div>
                              <span style={styles.posPnl(pos.unrealized_profit >= 0)}>
                                ${pos.unrealized_profit.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {renderResizeHandle('order')}
                </div>
              );
            }

            if (panelId === 'backtester') {
              return (
                <div
                  key="backtester"
                  onDragOver={(e) => handleDragOver(e, 'backtester')}
                  onDrop={(e) => handleDrop(e, 'backtester')}
                  style={dragStyles}
                >
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'backtester')}
                    style={headerStyle}
                  >
                    <span>⚙️ Wyckoff Backtester Desk</span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                  </div>
                  <div className="no-drag" style={contentStyle}>
                    <div style={styles.tradeForm}>
                      <div style={styles.formGroup}>
                        <label style={{ color: '#9ca3af', fontSize: '12px' }}>Starting Balance ($)</label>
                        <input 
                          type="number" 
                          value={backtestBalance} 
                          onChange={(e) => setBacktestBalance(e.target.value)}
                          style={styles.input}
                          min="100"
                        />
                      </div>

                      <div style={styles.formGroup}>
                        <label style={{ color: '#9ca3af', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={useRiskSizing}
                            onChange={(e) => setUseRiskSizing(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                          />
                          Auto Calculate Size by Risk
                        </label>
                      </div>

                      {useRiskSizing ? (
                        <div style={styles.formGroup}>
                          <label style={{ color: '#9ca3af', fontSize: '12px' }}>Risk % per Trade</label>
                          <input 
                            type="number" 
                            value={backtestRiskPct} 
                            onChange={(e) => setBacktestRiskPct(e.target.value)}
                            style={styles.input}
                            step="0.1"
                            min="0.1"
                            max="10.0"
                          />
                        </div>
                      ) : (
                        <div style={styles.formGroup}>
                          <label style={{ color: '#9ca3af', fontSize: '12px' }}>Quantity (Size)</label>
                          <input 
                            type="number" 
                            value={backtestSize} 
                            onChange={(e) => setBacktestSize(e.target.value)}
                            style={styles.input}
                            step="0.1"
                            min="0.1"
                          />
                        </div>
                      )}

                      <div style={styles.formGroup}>
                        <label style={{ color: '#9ca3af', fontSize: '12px' }}>Stop Loss</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="number" 
                            value={backtestSL} 
                            onChange={(e) => setBacktestSL(e.target.value)}
                            style={{ ...styles.input, flexGrow: 1 }}
                            step={backtestSLType === 'pct' ? '0.1' : '1'}
                            min="0.01"
                          />
                          <select
                            value={backtestSLType}
                            onChange={(e) => {
                              const newType = e.target.value as 'pct' | 'price';
                              setBacktestSLType(newType);
                              setBacktestSL(newType === 'pct' ? '1.0' : '200');
                            }}
                            style={{
                              ...styles.input,
                              width: '70px',
                              backgroundColor: '#1f2937',
                              cursor: 'pointer',
                              padding: '0 8px',
                            }}
                          >
                            <option value="pct">%</option>
                            <option value="price">$</option>
                          </select>
                        </div>
                      </div>

                      <div style={styles.formGroup}>
                        <label style={{ color: '#9ca3af', fontSize: '12px' }}>Risk to Reward (RR Ratio)</label>
                        <input 
                          type="number" 
                          value={backtestRR} 
                          onChange={(e) => setBacktestRR(e.target.value)}
                          style={styles.input}
                          step="0.1"
                          min="0.5"
                        />
                      </div>

                      <div style={styles.formGroup}>
                        <label style={{ color: '#9ca3af', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={useBreakEven}
                            onChange={(e) => setUseBreakEven(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                          />
                          Enable Break Even (BE)
                        </label>
                      </div>

                      {useBreakEven && (
                        <div style={styles.formGroup}>
                          <label style={{ color: '#9ca3af', fontSize: '12px' }}>BE Trigger (R-Ratio)</label>
                          <input 
                            type="number" 
                            value={backtestBE} 
                            onChange={(e) => setBacktestBE(e.target.value)}
                            style={styles.input}
                            step="0.1"
                            min="0.1"
                          />
                        </div>
                      )}

                      <div style={styles.formGroup}>
                        <label style={{ color: '#9ca3af', fontSize: '12px' }}>Sweep Lookback (Bars)</label>
                        <input 
                          type="number" 
                          value={lookbackWindow} 
                          onChange={(e) => setLookbackWindow(e.target.value)}
                          style={styles.input}
                          min="5"
                          max="200"
                        />
                      </div>
                    </div>

                    {backtestResults && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                        <div style={styles.walletContainer}>
                          <div style={styles.walletRow}>
                            <span style={{ color: '#9ca3af' }}>Total Trades:</span>
                            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{backtestResults.totalTrades}</span>
                          </div>
                          <div style={styles.walletRow}>
                            <span style={{ color: '#9ca3af' }}>Win Rate:</span>
                            <span style={{ color: backtestResults.winRate >= 50 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                              {backtestResults.winRate.toFixed(1)}%
                            </span>
                          </div>
                          <div style={styles.walletRow}>
                            <span style={{ color: '#9ca3af' }}>Net Profit:</span>
                            <span style={{ color: backtestResults.netPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                              ${backtestResults.netPnl.toFixed(2)}
                            </span>
                          </div>
                          <div style={styles.walletRow}>
                            <span style={{ color: '#9ca3af' }}>Profit Factor:</span>
                            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{backtestResults.profitFactor.toFixed(2)}</span>
                          </div>
                          <div style={styles.walletRow}>
                            <span style={{ color: '#9ca3af' }}>Max Drawdown:</span>
                            <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{(backtestResults.maxDrawdown ?? 0).toFixed(2)}%</span>
                          </div>
                          <div style={styles.walletRow}>
                            <span style={{ color: '#9ca3af' }}>Max Daily Loss:</span>
                            <span style={{ color: (backtestResults.maxDailyLoss ?? 0) >= 5.0 ? '#ef4444' : '#ffffff', fontWeight: 'bold' }}>
                              {(backtestResults.maxDailyLoss ?? 0).toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {backtestResults.dailyLossBreached && (
                          <div style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            borderRadius: '8px',
                            padding: '8px',
                            color: '#ef4444',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            marginTop: '4px'
                          }}>
                            ⚠️ FTMO 5% Daily Loss Rule Breached!
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '4px', marginTop: '8px' }}>
                          <button 
                            onClick={() => setBacktestTab('trades')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: backtestTab === 'trades' ? '#3b82f6' : '#9ca3af',
                              fontWeight: 'bold',
                              fontSize: '11px',
                              cursor: 'pointer',
                              borderBottom: backtestTab === 'trades' ? '2px solid #3b82f6' : 'none',
                              paddingBottom: '2px'
                            }}
                          >
                            Trades ({backtestResults.trades.length})
                          </button>
                          <button 
                            onClick={() => setBacktestTab('weekly')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: backtestTab === 'weekly' ? '#3b82f6' : '#9ca3af',
                              fontWeight: 'bold',
                              fontSize: '11px',
                              cursor: 'pointer',
                              borderBottom: backtestTab === 'weekly' ? '2px solid #3b82f6' : 'none',
                              paddingBottom: '2px'
                            }}
                          >
                            Weekly
                          </button>
                          <button 
                            onClick={() => setBacktestTab('monthly')}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: backtestTab === 'monthly' ? '#3b82f6' : '#9ca3af',
                              fontWeight: 'bold',
                              fontSize: '11px',
                              cursor: 'pointer',
                              borderBottom: backtestTab === 'monthly' ? '2px solid #3b82f6' : 'none',
                              paddingBottom: '2px'
                            }}
                          >
                            Monthly
                          </button>
                        </div>

                        <div style={styles.positionsList}>
                          {backtestTab === 'trades' && backtestResults.trades.map((trade) => (
                            <div 
                              key={trade.id} 
                              onClick={() => {
                                setSelectedTrade(trade);
                                setShowModal(true);
                              }}
                              style={{
                                ...styles.positionRow,
                                cursor: 'pointer',
                                border: selectedTrade?.id === trade.id ? '1.5px solid #3b82f6' : '1px solid #1f2937',
                                transform: selectedTrade?.id === trade.id ? 'scale(1.02)' : 'scale(1)',
                                transition: 'all 0.15s'
                              }}
                            >
                              <div style={styles.posDetails}>
                                <span style={styles.posSide(trade.type === 'BUY')}>
                                  {trade.type} @ {trade.entryPrice.toFixed(2)}
                                </span>
                                <span style={{ fontSize: '10px', color: '#6b7280' }}>
                                  Exit: {trade.exitPrice.toFixed(2)} | {trade.time}
                                </span>
                              </div>
                              <span style={styles.posPnl(trade.pnl >= 0)}>
                                {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                              </span>
                            </div>
                          ))}

                          {backtestTab === 'weekly' && backtestResults.weeklyBreakdown && Object.keys(backtestResults.weeklyBreakdown).sort().reverse().map((week) => {
                            const pnl = backtestResults.weeklyBreakdown![week];
                            return (
                              <div key={week} style={styles.positionRow}>
                                <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{week}</span>
                                <span style={styles.posPnl(pnl >= 0)}>
                                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                </span>
                              </div>
                            );
                          })}

                          {backtestTab === 'monthly' && backtestResults.monthlyBreakdown && Object.keys(backtestResults.monthlyBreakdown).sort().reverse().map((month) => {
                            const pnl = backtestResults.monthlyBreakdown![month];
                            return (
                              <div key={month} style={styles.positionRow}>
                                <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{month}</span>
                                <span style={styles.posPnl(pnl >= 0)}>
                                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {renderResizeHandle('backtester')}
                </div>
              );
            }

            if (panelId === 'dashboard') {
              return (
                <div
                  key="dashboard"
                  onDragOver={(e) => handleDragOver(e, 'dashboard')}
                  onDrop={(e) => handleDrop(e, 'dashboard')}
                  style={dragStyles}
                >
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'dashboard')}
                    style={headerStyle}
                  >
                    <span>📡 cTrader Security Webhook Simulator & Realtime Log Stream</span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                  </div>
                  <div className="no-drag" style={{ padding: '0px' }}>
                    <Dashboard />
                  </div>
                  {renderResizeHandle('dashboard')}
                </div>
              );
            }

            return null;
          })}
        </div>

      </main>

      {/* Trade Performance Detail Overlay */}
      {showModal && selectedTrade && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 7, 12, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#0f172a',
            border: `2px solid ${selectedTrade.pnl >= 0 ? '#10b981' : '#ef4444'}`,
            boxShadow: `0 0 25px ${selectedTrade.pnl >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
            borderRadius: '16px',
            width: '90%',
            maxWidth: '480px',
            padding: '24px',
            position: 'relative',
            color: '#f8fafc',
          }}>
            <button 
              onClick={() => setShowModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(148, 163, 184, 0.05)'
              }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: selectedTrade.type === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: selectedTrade.type === 'BUY' ? '#10b981' : '#ef4444'
              }}>
                {selectedTrade.type}
              </span>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#f1f5f9' }}>
                Trade Performance Details
              </h2>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: selectedTrade.pnl >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${selectedTrade.pnl >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '20px'
            }}>
              <div>
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Net Profit/Loss</span>
                <span style={{ fontSize: '20px', fontWeight: 'bold', color: selectedTrade.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {selectedTrade.pnl >= 0 ? '+' : ''}${selectedTrade.pnl.toFixed(2)}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block' }}>Outcome</span>
                <span style={{
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: selectedTrade.pnl >= 0 ? '#10b981' : '#ef4444',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {selectedTrade.pnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {selectedTrade.outcome}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: '13px', marginBottom: '20px' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Entry Price</span>
                <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${selectedTrade.entryPrice.toFixed(2)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Exit Price</span>
                <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${selectedTrade.exitPrice.toFixed(2)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Stop Loss</span>
                <span style={{ color: '#ef4444', fontWeight: '500' }}>${selectedTrade.slPrice.toFixed(2)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Take Profit</span>
                <span style={{ color: '#10b981', fontWeight: '500' }}>${selectedTrade.tpPrice.toFixed(2)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Quantity Size</span>
                <span style={{ color: '#cbd5e1', fontWeight: '500' }}>{selectedTrade.qty.toFixed(4)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Time Closed</span>
                <span style={{ color: '#cbd5e1', fontWeight: '500' }}>{selectedTrade.time}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #1e293b', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={13} /> Duration
                </span>
                <span style={{ color: '#f1f5f9', fontWeight: '500' }}>
                  {selectedTrade.duration} bars / candles
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <HelpCircle size={13} /> Exit Reason
                </span>
                <span style={{
                  color: selectedTrade.exitReason?.includes('Stop Loss') ? '#ef4444' : selectedTrade.exitReason?.includes('Take Profit') ? '#10b981' : '#f1f5f9',
                  fontWeight: 'bold'
                }}>
                  {selectedTrade.exitReason || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
