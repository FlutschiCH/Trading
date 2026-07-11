import React, { useEffect, useState, useRef } from 'react';
import { Activity, X, TrendingUp, TrendingDown, Clock, HelpCircle, RefreshCw, Menu, ChevronDown } from 'lucide-react';
import TVChart from './components/tv_chart.tsx';
import WyckoffBacktester from './components/wyckoff_backtester.tsx';
import HowToPage from './components/how_to_page.tsx';
import { API_BASE_URL } from './api';
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

export const getPrecisionForSymbol = (symbol: string) => {
  const symUpper = symbol.toUpperCase();
  const isCrypto = symUpper.includes('BTC') || symUpper.includes('ETH') || symUpper.includes('SOL') || symUpper.includes('LTC') || symUpper.includes('XRP') || symUpper.includes('DOGE') || symUpper.includes('ADA') || symUpper.includes('DOT') || symUpper.includes('LINK');
  const isGold = symUpper.includes('XAU') || symUpper.includes('GOLD') || symUpper.includes('XAG') || symUpper.includes('SILVER');
  const isJpy = symUpper.includes('JPY');
  const isIndex = symUpper.includes('US30') || symUpper.includes('GER40') || symUpper.includes('SPX') || symUpper.includes('NAS') || symUpper.includes('DE40');

  if (isCrypto || isGold || isIndex) {
    return 2;
  } else if (isJpy) {
    return 3;
  }
  return 5;
};

export const formatPrice = (price: number | undefined | null, symbol: string) => {
  if (price === undefined || price === null) return '';
  return price.toFixed(getPrecisionForSymbol(symbol));
};

export default function App() {
  // Simple check for how-to page routing (always bypasses password check)
  if (window.location.pathname === '/how-to') {
    return <HowToPage />;
  }

  // Redirect /auth or root path to /dashboard
  if (window.location.pathname === '/auth' || window.location.pathname === '/') {
    window.history.pushState({}, '', '/dashboard');
  }

  // Simple Password Protection Mode on Deployed Host
  const isProdHost = window.location.hostname === 'trading.flutschi.ch';
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (!isProdHost) return true;
    return sessionStorage.getItem('wyckoff_auth_token') === 'true';
  });
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authUsername.trim().toLowerCase() === 'flutschi' && authPassword === 'Godzilla_12') {
      sessionStorage.setItem('wyckoff_auth_token', 'true');
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Invalid username or password.');
    }
  };

  const [availableSymbols, setAvailableSymbols] = useState<string[]>([
    'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 
    'AUDUSD', 'USDCAD', 'XAUUSD', 'US30', 'GER40'
  ]);
  const [availableTimeframes, setAvailableTimeframes] = useState<string[]>([
    '1m', '5m', '15m', '30m', '1h', '4h', '1d'
  ]);
  const [symbol, setSymbol] = useState(() => {
    return localStorage.getItem('wyckoff_symbol') || 'BTCUSD';
  });
  const [timeframe, setTimeframe] = useState(() => {
    return localStorage.getItem('wyckoff_timeframe') || '15m';
  });
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
  const [backtestSL, setBacktestSL] = useState('20');
  const [backtestSLType, setBacktestSLType] = useState<'pct' | 'price'>('price');
  const [backtestRR, setBacktestRR] = useState('2');
  const [backtestSize, setBacktestSize] = useState('1');
  const [lookbackWindow, setLookbackWindow] = useState('20');
  const [backtestBalance, setBacktestBalance] = useState('10000');
  const [backtestRiskPct, setBacktestRiskPct] = useState('1.0');
  const [useRiskSizing, setUseRiskSizing] = useState(true);
  const [backtestBE, setBacktestBE] = useState('1.0');
  const [useBreakEven, setUseBreakEven] = useState(true);
  const [backtestFees, setBacktestFees] = useState('0.03');
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

  const [panelOrder, setPanelOrder] = useState<string[]>(['chart', 'backtester']);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Responsive mobile states
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'chart' | 'backtester'>('chart');
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Live strategy states
  const [liveStrategy, setLiveStrategy] = useState<any>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  const lastNotifiedSignalRef = useRef<number>(0);

  const triggerPWAEventNotification = (title: string, body: string) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload: { title, body }
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.svg' });
    }
  };

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
      const response = await fetch(`${API_BASE_URL}/api/backtest`, {
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
          feesPercent: parseFloat(backtestFees) || 0.0,
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

        // Notify if a signal occurs on the latest candle
        const analyzedCandles = res.data.candles || [];
        if (analyzedCandles.length > 0) {
          const lastCandle = analyzedCandles[analyzedCandles.length - 1];
          if (lastCandle.backtest_signal && lastCandle.time !== lastNotifiedSignalRef.current) {
            lastNotifiedSignalRef.current = lastCandle.time;
            triggerPWAEventNotification(
              `⚡ Wyckoff Signal Triggered!`,
              `${lastCandle.backtest_signal} signal found on ${symbol} (${timeframe}) at price $${lastCandle.close.toFixed(2)}`
            );
          }
        }
      }
    } catch (e) {
      console.error("Failed to run backtest on backend:", e);
    }
  };

  const deployLiveStrategy = async () => {
    setIsDeploying(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/live/strategy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          timeframe,
          slVal: parseFloat(backtestSL) || 1.0,
          slType: backtestSLType,
          rr: parseFloat(backtestRR) || 2.0,
          size: parseFloat(backtestSize) || 1.0,
          useRiskSizing,
          riskPct: parseFloat(backtestRiskPct) || 1.0,
          useBreakEven,
          beTriggerR: parseFloat(backtestBE) || 1.0,
          lookbackWindow: parseInt(lookbackWindow) || 20,
          status: 'active'
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        setLiveStrategy(result.strategy);
        alert(`Successfully deployed strategy to cTrader Live execution!\nSymbol: ${symbol}\nTimeframe: ${timeframe}`);
      }
    } catch (e) {
      console.error("Failed to deploy strategy to live execution:", e);
      alert("Failed to deploy strategy. Is backend running?");
    } finally {
      setIsDeploying(false);
    }
  };

  useEffect(() => {
    runBacktest();
  }, [candles, symbol, backtestSL, backtestSLType, backtestRR, backtestSize, lookbackWindow, backtestBalance, backtestRiskPct, useRiskSizing, backtestBE, useBreakEven, backtestFees]);

  useEffect(() => {
    localStorage.setItem('wyckoff_symbol', symbol);
  }, [symbol]);

  useEffect(() => {
    localStorage.setItem('wyckoff_timeframe', timeframe);
  }, [timeframe]);

  // Fetch symbols and timeframes metadata on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const symRes = await fetch(`${API_BASE_URL}/api/ctrader/symbols`);
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
        const tfRes = await fetch(`${API_BASE_URL}/api/ctrader/timeframes`);
        const tfData = await tfRes.json();
        if (tfData.status === 'success' && tfData.data) {
          setAvailableTimeframes(tfData.data);
        }
      } catch (e) {
        console.error('Failed to load timeframes:', e);
      }

      try {
        const stratRes = await fetch(`${API_BASE_URL}/api/live/strategy`);
        const stratData = await stratRes.json();
        if (stratData.status === 'success' && stratData.strategy) {
          setLiveStrategy(stratData.strategy);
        }
      } catch (e) {
        console.error('Failed to load live strategy:', e);
      }

      // Request browser notification permissions
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
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
        const response = await fetch(`${API_BASE_URL}/api/candles/historical`, {
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
          const analysisResponse = await fetch(`${API_BASE_URL}/api/analyze`, {
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
      const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
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
      const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
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

  const getPipSize = (sym: string, price: number): number => {
    const symUpper = sym.toUpperCase();
    if (symUpper.includes('JPY')) return 0.01;
    if (symUpper.includes('XAU') || symUpper.includes('GOLD') || symUpper.includes('XAG')) return 0.1;
    
    const isCrypto = ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB'].some(c => symUpper.includes(c));
    if (isCrypto) {
      if (price > 1000) return 1.0;
      if (price > 10) return 0.1;
      return 0.001;
    }
    
    const forexCurrencies = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN'];
    if (forexCurrencies.some(curr => symUpper.includes(curr))) {
      return 0.0001;
    }
    
    if (price > 1000) return 1.0;
    if (price > 100) return 0.1;
    if (price > 1) return 0.01;
    return 0.0001;
  };

  const liveTrades = openPositions.map((pos: any) => {
    let slPrice = pos.stop_loss;
    let tpPrice = pos.take_profit;
    
    if (!slPrice && liveStrategy && liveStrategy.symbol === pos.symbol) {
      const slVal = parseFloat(liveStrategy.slVal) || 1.0;
      const rr = parseFloat(liveStrategy.rr) || 2.0;
      const isBuy = pos.trade_side === 'BUY';
      const entry = pos.entry_price;
      
      if (liveStrategy.slType === 'price') {
        const pipSize = getPipSize(pos.symbol, entry);
        slPrice = isBuy ? entry - slVal * pipSize : entry + slVal * pipSize;
      } else {
        slPrice = isBuy ? entry * (1 - slVal / 100) : entry * (1 + slVal / 100);
      }
      
      const slDistance = Math.abs(entry - slPrice);
      tpPrice = isBuy ? entry + slDistance * rr : entry - slDistance * rr;
    }
    
    let entryTimestamp = pos.entry_timestamp;
    if (!entryTimestamp && candles.length > 0) {
      const matchedCandle = candles.find((c) => pos.entry_price >= c.low && pos.entry_price <= c.high);
      entryTimestamp = matchedCandle ? matchedCandle.time : candles[candles.length - 1].time;
    }
    
    return {
      id: pos.position_id,
      symbol: pos.symbol,
      type: pos.trade_side,
      qty: pos.volume,
      entryPrice: pos.entry_price,
      slPrice: slPrice,
      tpPrice: tpPrice,
      entryTimestamp: entryTimestamp,
      exitReason: 'Position still open'
    };
  }).filter((t: any) => t.symbol === symbol);

  return (
    <div style={styles.container}>
      
      {/* Upper Navigation Desk Bar */}
      <header style={{
        ...styles.header,
        ...(isMobile ? { padding: '12px 16px' } : {})
      }}>
        <div style={styles.logoSection}>
          <Activity size={28} style={{ color: '#3b82f6' }} />
          <span style={styles.logoText}>WYCKOFF</span>
          <span 
            title={`cTrader ${connectionMode.toUpperCase()}: ${currentConnected ? 'ONLINE' : 'OFFLINE'}`}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: currentConnected ? '#10b981' : '#ef4444',
              boxShadow: `0 0 8px ${currentConnected ? '#10b981' : '#ef4444'}`,
              display: 'inline-block',
              marginLeft: '4px',
              flexShrink: 0,
            }}
          />
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                cursor: 'pointer',
                borderRadius: '6px',
                padding: '6px 12px',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '11px',
                outline: 'none',
                transition: 'all 0.2s',
              }}
            >
              <Menu size={12} /> Links & Resources <ChevronDown size={12} />
            </button>
            {showMenu && (
              <>
                <div 
                  onClick={() => setShowMenu(false)}
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                    backgroundColor: 'transparent',
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(59, 130, 246, 0.1)',
                  padding: '6px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: '220px',
                  zIndex: 1000,
                }}>
                  <a href="https://openapi.ctrader.com/apps" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                    cTrader Apps
                  </a>
                  <a href="https://gemini.google.com/app/71d33e33a84aa328" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                    Wyckoff Prompt
                  </a>
                  <a href="https://trader.ftmo.com/accounts-overview" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                    FTMO Overview
                  </a>
                  <a href="https://saphir.metanet.ch:8443/phpMyAdmin/index.php?db=aa_wyckoff_trading" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                    Database (phpMyAdmin)
                  </a>
                  <a href="https://railway.com/project/aa01f500-c3df-4d47-b60a-821237699d0d/service/05376c29-94f0-44f3-acc2-93d5d104019f/settings?environmentId=7a63d6ae-f3e6-452d-b527-6311f6f9b551" target="_blank" rel="noopener noreferrer" className="menu-item" onClick={() => setShowMenu(false)}>
                    Railway Settings
                  </a>
                  <a href="/how-to" className="menu-item" style={{ borderTop: '1px solid #1e293b', paddingTop: '8px', marginTop: '4px' }} onClick={() => setShowMenu(false)}>
                    📖 How It Works
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Workspace controls */}
        <div style={{
          ...styles.controlsSection,
          ...(isMobile ? {
            flexDirection: 'column',
            width: '100%',
            gap: '12px',
            marginTop: '12px',
            alignItems: 'stretch',
          } : {})
        }}>
          <div style={{
            ...styles.modeTabs,
            ...(isMobile ? {
              width: '100%',
              display: 'flex',
            } : {})
          }}>
            <button 
              style={{
                ...styles.modeBtn(connectionMode === 'fix'),
                ...(isMobile ? { flex: 1, textAlign: 'center' } : {})
              }}
              onClick={() => setConnectionMode('fix')}
            >
              FIX API
            </button>
            <button 
              style={{
                ...styles.modeBtn(connectionMode === 'openapi'),
                ...(isMobile ? { flex: 1, textAlign: 'center' } : {})
              }}
              onClick={() => setConnectionMode('openapi')}
            >
              OpenAPI
            </button>
          </div>

          <div style={{
            display: 'flex',
            gap: '12px',
            width: isMobile ? '100%' : 'auto',
          }}>
            <div style={{
              ...styles.pairGroup,
              ...(isMobile ? { flex: 1 } : {})
            }}>
              <span style={{ color: '#9ca3af', fontSize: '11px' }}>Symbol</span>
              <select 
                value={symbol} 
                onChange={(e) => setSymbol(e.target.value)}
                style={{
                  ...styles.pairSelect,
                  ...(isMobile ? { width: '100%' } : {})
                }}
              >
                {availableSymbols.map(sym => (
                  <option key={sym} value={sym}>{sym}</option>
                ))}
              </select>
            </div>

            <div style={{
              ...styles.pairGroup,
              ...(isMobile ? { flex: 1 } : {})
            }}>
              <span style={{ color: '#9ca3af', fontSize: '11px' }}>Timeframe</span>
              <select 
                value={timeframe} 
                onChange={(e) => setTimeframe(e.target.value)}
                style={{
                  ...styles.pairSelect,
                  ...(isMobile ? { width: '100%' } : {})
                }}
              >
                {availableTimeframes.map(tf => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main style={styles.mainLayout}>
        {isMobile && (
          <div style={{
            display: 'flex',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            padding: '4px',
            marginBottom: '16px',
            gap: '4px',
          }}>
            <button
              onClick={() => setMobileTab('chart')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: mobileTab === 'chart' ? '#2563eb' : 'transparent',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              📊 Chart View
            </button>
            <button
              onClick={() => setMobileTab('backtester')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: mobileTab === 'backtester' ? '#2563eb' : 'transparent',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              ⚙️ Backtester
            </button>
          </div>
        )}

        {isMobile ? (
          <div style={{
            width: '100%',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            overflow: 'hidden',
            padding: mobileTab === 'chart' ? '0' : '16px',
          }}>
            {mobileTab === 'chart' ? (
              <TVChart 
                symbol={symbol} 
                candles={backtestResults?.candles || candles} 
                loading={loading} 
                onRefresh={fetchCandles} 
                entryPrice={selectedTrade?.entryPrice}
                slPrice={selectedTrade?.slPrice}
                tpPrice={selectedTrade?.tpPrice}
                trades={backtestResults ? backtestResults.trades : liveTrades}
                selectedTrade={selectedTrade}
                onSelectTrade={(trade) => {
                  setSelectedTrade(trade);
                  setShowModal(true);
                }}
              />
            ) : (
              <WyckoffBacktester
                symbol={symbol}
                timeframe={timeframe}
                liveStrategy={liveStrategy}
                isDeploying={isDeploying}
                deployLiveStrategy={deployLiveStrategy}
                backtestBalance={backtestBalance}
                setBacktestBalance={setBacktestBalance}
                useRiskSizing={useRiskSizing}
                setUseRiskSizing={setUseRiskSizing}
                backtestRiskPct={backtestRiskPct}
                setBacktestRiskPct={setBacktestRiskPct}
                backtestSize={backtestSize}
                setBacktestSize={setBacktestSize}
                backtestSL={backtestSL}
                setBacktestSL={setBacktestSL}
                backtestSLType={backtestSLType}
                setBacktestSLType={setBacktestSLType}
                backtestRR={backtestRR}
                setBacktestRR={setBacktestRR}
                useBreakEven={useBreakEven}
                setUseBreakEven={setUseBreakEven}
                backtestBE={backtestBE}
                setBacktestBE={setBacktestBE}
                lookbackWindow={lookbackWindow}
                setLookbackWindow={setLookbackWindow}
                backtestResults={backtestResults}
                backtestTab={backtestTab}
                setBacktestTab={setBacktestTab}
                selectedTrade={selectedTrade}
                setSelectedTrade={setSelectedTrade}
                setShowModal={setShowModal}
                backtestFees={backtestFees}
                setBacktestFees={setBacktestFees}
                styles={styles}
              />
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '24px',
            width: '100%',
          }}>
            {panelOrder.map((panelId) => {
              const isDragOver = dragOverId === panelId;
              const defaultWidth = panelId === 'chart' ? 'calc(66.6% - 16px)' : 'calc(33.3% - 16px)';
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
                    <TVChart 
                      symbol={symbol} 
                      candles={backtestResults?.candles || candles} 
                      loading={loading} 
                      onRefresh={fetchCandles} 
                      entryPrice={selectedTrade?.entryPrice}
                      slPrice={selectedTrade?.slPrice}
                      tpPrice={selectedTrade?.tpPrice}
                      trades={backtestResults ? backtestResults.trades : liveTrades}
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
                    <span>
                      ⚙️ Wyckoff Backtester
                      {liveStrategy && liveStrategy.symbol === symbol && liveStrategy.timeframe === timeframe ? (
                        <span style={{
                          marginLeft: '8px',
                          fontSize: '9px',
                          color: '#10b981',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid #10b981',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          verticalAlign: 'middle',
                        }}>
                          ● LIVE RUNNING
                        </span>
                      ) : (
                        <span style={{
                          marginLeft: '8px',
                          fontSize: '9px',
                          color: '#9ca3af',
                          backgroundColor: 'rgba(156, 163, 175, 0.15)',
                          border: '1px solid #9ca3af',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          verticalAlign: 'middle',
                        }}>
                          NOT DEPLOYED
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                  </div>
                  <div className="no-drag" style={contentStyle}>
                    <WyckoffBacktester
                      symbol={symbol}
                      timeframe={timeframe}
                      liveStrategy={liveStrategy}
                      isDeploying={isDeploying}
                      deployLiveStrategy={deployLiveStrategy}
                      backtestBalance={backtestBalance}
                      setBacktestBalance={setBacktestBalance}
                      useRiskSizing={useRiskSizing}
                      setUseRiskSizing={setUseRiskSizing}
                      backtestRiskPct={backtestRiskPct}
                      setBacktestRiskPct={setBacktestRiskPct}
                      backtestSize={backtestSize}
                      setBacktestSize={setBacktestSize}
                      backtestSL={backtestSL}
                      setBacktestSL={setBacktestSL}
                      backtestSLType={backtestSLType}
                      setBacktestSLType={setBacktestSLType}
                      backtestRR={backtestRR}
                      setBacktestRR={setBacktestRR}
                      useBreakEven={useBreakEven}
                      setUseBreakEven={setUseBreakEven}
                      backtestBE={backtestBE}
                      setBacktestBE={setBacktestBE}
                      lookbackWindow={lookbackWindow}
                      setLookbackWindow={setLookbackWindow}
                      backtestResults={backtestResults}
                      backtestTab={backtestTab}
                      setBacktestTab={setBacktestTab}
                      selectedTrade={selectedTrade}
                      setSelectedTrade={setSelectedTrade}
                      setShowModal={setShowModal}
                      backtestFees={backtestFees}
                      setBacktestFees={setBacktestFees}
                      styles={styles}
                    />
                  </div>
                  {renderResizeHandle('backtester')}
                </div>
              );
            }

            return null;
          })}
        </div>
      )}

      </main>

      {/* Trade Performance Detail Overlay */}
      {showModal && selectedTrade && (
        <div 
          onClick={() => setShowModal(false)}
          style={{
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
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
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
                <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${formatPrice(selectedTrade.entryPrice, symbol)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Exit Price</span>
                <span style={{ color: '#cbd5e1', fontWeight: '500' }}>${formatPrice(selectedTrade.exitPrice, symbol)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Stop Loss</span>
                <span style={{ color: '#ef4444', fontWeight: '500' }}>${formatPrice(selectedTrade.slPrice, symbol)}</span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '11px' }}>Take Profit</span>
                <span style={{ color: '#10b981', fontWeight: '500' }}>${formatPrice(selectedTrade.tpPrice, symbol)}</span>
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
