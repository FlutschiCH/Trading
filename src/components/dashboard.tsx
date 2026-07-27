import React, { useEffect, useState, useRef } from 'react';
import { Activity, X, TrendingUp, TrendingDown, Clock, HelpCircle, RefreshCw, Menu, ChevronDown, Sun, Moon } from 'lucide-react';
import TVChart from './tv_chart';
import WyckoffBacktester from './wyckoff_backtester';
import HowToPage from './how_to_page';
import LiveTradesPanel from './live_trades_panel';
import LiveOverviewPanel from './live_overview_panel';
import SymbolMappingsView from './symbol_mappings_view';
import ComputerManager from './computer_manager';
import { API_BASE_URL } from '../api';
import '../App.css';

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
  sma_20?: number;
  wyckoff_stage?: string;
  support_level?: number;
  resistance_level?: number;
  wyckoff_signal?: string;
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
};export const getWeekStart = (now: Date) => {
  const day = now.getDay();
  const hours = now.getHours();
  const start = new Date(now);
  start.setHours(20, 0, 0, 0);
  
  if (day === 0) { // Sunday
    if (hours < 20) {
      start.setDate(start.getDate() - 7);
    }
  } else {
    start.setDate(start.getDate() - day);
  }
  return start;
};

export const calculateDateBounds = (option: string, customFrom?: string, customTo?: string): { date_from?: number; date_to?: number } => {
  const now = new Date();
  
  if (option === 'last_candles') {
    return {};
  }
  
  if (option === 'this_week') {
    const start = getWeekStart(now);
    return {
      date_from: Math.floor(start.getTime() / 1000),
      date_to: Math.floor(now.getTime() / 1000)
    };
  }
  
  if (option === 'last_week') {
    const end = getWeekStart(now);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return {
      date_from: Math.floor(start.getTime() / 1000),
      date_to: Math.floor(end.getTime() / 1000)
    };
  }
  
  if (option === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return {
      date_from: Math.floor(start.getTime() / 1000),
      date_to: Math.floor(now.getTime() / 1000)
    };
  }
  
  if (option === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return {
      date_from: Math.floor(start.getTime() / 1000),
      date_to: Math.floor(end.getTime() / 1000)
    };
  }
  
  if (option === 'custom' && customFrom && customTo) {
    const start = new Date(customFrom);
    const end = new Date(customTo);
    return {
      date_from: Math.floor(start.getTime() / 1000),
      date_to: Math.floor(end.getTime() / 1000)
    };
  }
  
  if (option === 'from_start_date' && customFrom) {
    const start = new Date(customFrom);
    return {
      date_from: Math.floor(start.getTime() / 1000)
    };
  }
  
  return {};
};

export default function Dashboard() {

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

  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as 'dark' | 'light') || 'dark');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.style.setProperty('--app-bg', '#f8fafc');
      root.style.setProperty('--app-text', '#0f172a');
      root.style.setProperty('--app-text-muted', '#64748b');
      root.style.setProperty('--app-card-bg', '#ffffff');
      root.style.setProperty('--app-card-border', '#e2e8f0');
      root.style.setProperty('--app-header-bg', '#ffffff');
      root.style.setProperty('--app-panel-header-bg', '#f1f5f9');
      root.style.setProperty('--app-input-bg', '#ffffff');
      root.style.setProperty('--app-input-border', '#cbd5e1');
      root.style.setProperty('--app-input-text', '#0f172a');
      root.style.setProperty('--app-hover-bg', '#f1f5f9');
    } else {
      root.style.setProperty('--app-bg', '#0b0f19');
      root.style.setProperty('--app-text', '#f3f4f6');
      root.style.setProperty('--app-text-muted', '#9ca3af');
      root.style.setProperty('--app-card-bg', '#111827');
      root.style.setProperty('--app-card-border', '#1f2937');
      root.style.setProperty('--app-header-bg', '#111827');
      root.style.setProperty('--app-panel-header-bg', '#1e293b');
      root.style.setProperty('--app-input-bg', '#0b0f19');
      root.style.setProperty('--app-input-border', '#1f2937');
      root.style.setProperty('--app-input-text', '#ffffff');
      root.style.setProperty('--app-hover-bg', '#1e293b');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

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
    return localStorage.getItem('wyckoff_symbol') || 'EURUSD';
  });
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [timeframe, setTimeframe] = useState(() => {
    return localStorage.getItem('wyckoff_timeframe') || '15m';
  });
  const [candleLimit, setCandleLimit] = useState<number>(() => {
    return parseInt(localStorage.getItem('wyckoff_candle_limit') || '5000');
  });
  const [accounts, setAccounts] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_accounts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeAccount, setActiveAccount] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_active_account');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccBroker, setNewAccBroker] = useState<'ctrader' | 'metatrader'>('ctrader');
  const [newAccId, setNewAccId] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccServer, setNewAccServer] = useState('');

  const candleSource = activeAccount ? activeAccount.broker_type : 'metatrader';
  const setCandleSource = (source: 'ctrader' | 'metatrader') => {
    // legacy mock for components relying on setCandleSource
  };
  const [dateRangeOption, setDateRangeOption] = useState<string>(() => {
    return localStorage.getItem('wyckoff_date_range_option') || 'last_candles';
  });
  const [customFrom, setCustomFrom] = useState<string>(() => {
    return localStorage.getItem('wyckoff_custom_from') || '';
  });
  const [customTo, setCustomTo] = useState<string>(() => {
    return localStorage.getItem('wyckoff_custom_to') || '';
  });
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [price, setPrice] = useState('57450.00');
  const [amount, setAmount] = useState('0.1');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [liveSimulatedTrades, setLiveSimulatedTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [initialCandlesLoaded, setInitialCandlesLoaded] = useState(false);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);

  const [view, setView] = useState<'dashboard' | 'mappings' | 'trades'>('dashboard');
  const [connectionMode, setConnectionMode] = useState<'openapi' | 'fix'>('fix');
  const [isConnectedOpenAPI] = useState(true);
  const [isConnectedFIX] = useState(true);
  const [isLiveFeed, setIsLiveFeed] = useState<boolean>(() => {
    return localStorage.getItem('wyckoff_is_live_feed') === 'true';
  });

  // Account & Positions
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);

  // Backtester states
  const [backtestSL, setBacktestSL] = useState(() => localStorage.getItem('wyckoff_backtest_sl') || '20');
  const [backtestSLType, setBacktestSLType] = useState<'pct' | 'price' | 'dollar'>(() => (localStorage.getItem('wyckoff_backtest_sl_type') as 'pct' | 'price' | 'dollar') || 'price');
  const [backtestRR, setBacktestRR] = useState(() => localStorage.getItem('wyckoff_backtest_rr') || '2');
  const [backtestSize, setBacktestSize] = useState(() => localStorage.getItem('wyckoff_backtest_size') || '1');
  const [lookbackWindow, setLookbackWindow] = useState(() => localStorage.getItem('wyckoff_backtest_lookback') || '20');
  const [backtestBalance, setBacktestBalance] = useState(() => localStorage.getItem('wyckoff_backtest_balance') || '10000');
  const [backtestRiskPct, setBacktestRiskPct] = useState(() => localStorage.getItem('wyckoff_backtest_risk_pct') || '1.0');
  const [useRiskSizing, setUseRiskSizing] = useState(() => {
    const val = localStorage.getItem('wyckoff_backtest_use_risk_sizing');
    return val === null ? true : val === 'true';
  });
  const [backtestBE, setBacktestBE] = useState(() => localStorage.getItem('wyckoff_backtest_be') || '1.0');
  const [useBreakEven, setUseBreakEven] = useState(() => {
    const val = localStorage.getItem('wyckoff_backtest_use_be');
    return val === null ? true : val === 'true';
  });
  const [backtestFees, setBacktestFees] = useState(() => localStorage.getItem('wyckoff_backtest_fees') || '0.03');
  const [dailyRetryLimit, setDailyRetryLimit] = useState(() => localStorage.getItem('wyckoff_backtest_daily_retry_limit') || '0');
  const [allowOppositeClose, setAllowOppositeClose] = useState(() => {
    const val = localStorage.getItem('wyckoff_backtest_allow_opposite_close');
    return val === null ? true : val === 'true';
  });
  const [enabledIndicators, setEnabledIndicators] = useState({ fvg: true });
  const [fvgs, setFvgs] = useState<any[]>([]);
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
  const [backtestTab, setBacktestTab] = useState<'trades' | 'weekly' | 'monthly' | 'hourly' | 'favourites'>('trades');
  const [tradeFilter, setTradeFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [selectedCandle, setSelectedCandle] = useState<Candle | null>(null);
  const [favouriteCandles, setFavouriteCandles] = useState<any[]>([]);
  const [favNotesInput, setFavNotesInput] = useState<string>('');
  const [locateTimestamp, setLocateTimestamp] = useState<number | null>(null);
  const [hiddenStages, setHiddenStages] = useState<string[]>([]);
  
  const [historyTrades, setHistoryTrades] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const [entryStabilityRule, setEntryStabilityRule] = useState<string>(() => localStorage.getItem('wyckoff_backtest_entry_stability_rule') || 'default');

  // Sessions & Auto-Close Safeguards
  const [sessionsTimezone, setSessionsTimezone] = useState<'UTC' | 'Local'>(() => (localStorage.getItem('wyckoff_sessions_timezone') as 'UTC' | 'Local') || 'UTC');
  
  // Optimization States
  const [isOptimizeMode, setIsOptimizeMode] = useState<boolean>(() => localStorage.getItem('wyckoff_optimize_mode') === 'true');
  const [rrStart, setRRStart] = useState<string>(() => localStorage.getItem('wyckoff_rr_start') || '1.0');
  const [rrEnd, setRREnd] = useState<string>(() => localStorage.getItem('wyckoff_rr_end') || '5.0');
  const [rrStep, setRRStep] = useState<string>(() => localStorage.getItem('wyckoff_rr_step') || '0.5');
  const [optimizationResults, setOptimizationResults] = useState<any[] | null>(null);
  
  const [tradingSessions, setTradingSessions] = useState<any[]>(() => {
    try {
      const val = localStorage.getItem('wyckoff_trading_sessions');
      if (val) {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      
      const defaults = [
        { id: 'london', start: '08:00', end: '16:00', closeOnEnd: false, weekdays: [1, 2, 3, 4, 5], color: '#3b82f6' },
        { id: 'newyork', start: '13:00', end: '21:00', closeOnEnd: false, weekdays: [1, 2, 3, 4, 5], color: '#10b981' }
      ];
      localStorage.setItem('wyckoff_trading_sessions', JSON.stringify(defaults));
      return defaults;
    } catch {
      return [];
    }
  });
  const [useGlobalClose, setUseGlobalClose] = useState<boolean>(() => localStorage.getItem('wyckoff_use_global_close') === 'true');
  const [globalCloseTime, setGlobalCloseTime] = useState<string>(() => localStorage.getItem('wyckoff_global_close_time') || '21:50');

  const [panelOrder, setPanelOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_desk_panel_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.includes('trades')) {
          if (!parsed.includes('live_overview')) {
            return [...parsed, 'live_overview'];
          }
          return parsed;
        }
        return [...parsed, 'trades', 'live_overview'];
      }
    } catch {}
    return ['chart', 'backtester', 'trades', 'live_overview'];
  });
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Responsive mobile states
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'chart' | 'backtester' | 'trades' | 'live_overview'>('chart');
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRestartServer = async () => {
    if (!window.confirm("Are you sure you want to update and restart the backend server?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/restart`, {
        method: 'POST'
      });
      const data = await res.json();
      alert(data.message || "Restart command sent. The server should be back in a few seconds.");
    } catch (e) {
      alert("Error sending restart command. Please verify the server is running.");
    }
  };

  const getBacktestSettingsObject = () => {
    return {
      backtestSL,
      backtestSLType,
      backtestRR,
      backtestSize,
      lookbackWindow,
      backtestBalance,
      backtestRiskPct,
      useRiskSizing,
      backtestBE,
      useBreakEven,
      backtestFees,
      dailyRetryLimit,
      allowOppositeClose,
      enabledIndicators,
      hiddenStages,
      entryStabilityRule,
      sessionsTimezone,
      tradingSessions,
      useGlobalClose,
      globalCloseTime,
      isOptimizeMode,
      rrStart,
      rrEnd,
      rrStep,
    };
  };

  const applyBacktestSettingsObject = (settings: any) => {
    if (!settings) return;
    if (settings.backtestSL !== undefined) {
      setBacktestSL(settings.backtestSL);
      localStorage.setItem('wyckoff_backtest_sl', settings.backtestSL);
    }
    if (settings.backtestSLType !== undefined) {
      setBacktestSLType(settings.backtestSLType);
      localStorage.setItem('wyckoff_backtest_sl_type', settings.backtestSLType);
    }
    if (settings.backtestRR !== undefined) {
      setBacktestRR(settings.backtestRR);
      localStorage.setItem('wyckoff_backtest_rr', settings.backtestRR);
    }
    if (settings.backtestSize !== undefined) {
      setBacktestSize(settings.backtestSize);
      localStorage.setItem('wyckoff_backtest_size', settings.backtestSize);
    }
    if (settings.lookbackWindow !== undefined) {
      setLookbackWindow(settings.lookbackWindow);
      localStorage.setItem('wyckoff_backtest_lookback', settings.lookbackWindow);
    }
    if (settings.backtestBalance !== undefined) {
      setBacktestBalance(settings.backtestBalance);
      localStorage.setItem('wyckoff_backtest_balance', settings.backtestBalance);
    }
    if (settings.backtestRiskPct !== undefined) {
      setBacktestRiskPct(settings.backtestRiskPct);
      localStorage.setItem('wyckoff_backtest_risk_pct', settings.backtestRiskPct);
    }
    if (settings.useRiskSizing !== undefined) {
      setUseRiskSizing(settings.useRiskSizing);
      localStorage.setItem('wyckoff_backtest_use_risk_sizing', String(settings.useRiskSizing));
    }
    if (settings.backtestBE !== undefined) {
      setBacktestBE(settings.backtestBE);
      localStorage.setItem('wyckoff_backtest_be', settings.backtestBE);
    }
    if (settings.useBreakEven !== undefined) {
      setUseBreakEven(settings.useBreakEven);
      localStorage.setItem('wyckoff_backtest_use_be', String(settings.useBreakEven));
    }
    if (settings.backtestFees !== undefined) {
      setBacktestFees(settings.backtestFees);
      localStorage.setItem('wyckoff_backtest_fees', settings.backtestFees);
    }
    if (settings.dailyRetryLimit !== undefined) {
      setDailyRetryLimit(settings.dailyRetryLimit);
      localStorage.setItem('wyckoff_backtest_daily_retry_limit', settings.dailyRetryLimit);
    }
    if (settings.allowOppositeClose !== undefined) {
      setAllowOppositeClose(settings.allowOppositeClose);
      localStorage.setItem('wyckoff_backtest_allow_opposite_close', String(settings.allowOppositeClose));
    }
    if (settings.enabledIndicators !== undefined) {
      setEnabledIndicators(settings.enabledIndicators);
    }
    if (settings.hiddenStages !== undefined) {
      setHiddenStages(settings.hiddenStages);
    }
    if (settings.entryStabilityRule !== undefined) {
      setEntryStabilityRule(settings.entryStabilityRule);
      localStorage.setItem('wyckoff_backtest_entry_stability_rule', settings.entryStabilityRule);
    }
    if (settings.sessionsTimezone !== undefined) {
      setSessionsTimezone(settings.sessionsTimezone);
      localStorage.setItem('wyckoff_sessions_timezone', settings.sessionsTimezone);
    }
    if (settings.tradingSessions !== undefined) {
      setTradingSessions(settings.tradingSessions);
      localStorage.setItem('wyckoff_trading_sessions', JSON.stringify(settings.tradingSessions));
    }
    if (settings.useGlobalClose !== undefined) {
      setUseGlobalClose(settings.useGlobalClose);
      localStorage.setItem('wyckoff_use_global_close', String(settings.useGlobalClose));
    }
    if (settings.globalCloseTime !== undefined) {
      setGlobalCloseTime(settings.globalCloseTime);
      localStorage.setItem('wyckoff_global_close_time', settings.globalCloseTime);
    }
    if (settings.isOptimizeMode !== undefined) {
      setIsOptimizeMode(settings.isOptimizeMode);
      localStorage.setItem('wyckoff_optimize_mode', String(settings.isOptimizeMode));
    }
    if (settings.rrStart !== undefined) {
      setRRStart(settings.rrStart);
      localStorage.setItem('wyckoff_rr_start', settings.rrStart);
    }
    if (settings.rrEnd !== undefined) {
      setRREnd(settings.rrEnd);
      localStorage.setItem('wyckoff_rr_end', settings.rrEnd);
    }
    if (settings.rrStep !== undefined) {
      setRRStep(settings.rrStep);
      localStorage.setItem('wyckoff_rr_step', settings.rrStep);
    }
  };

  const saveBacktestSettings = async () => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/backtest-settings/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe,
          settings: getBacktestSettingsObject()
        })
      });
      const data = await response.json();
      if (data.status === 'success') {
        alert("Backtest settings successfully saved to database!");
      } else {
        alert(`Error saving backtest settings: ${data.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Network error saving backtest settings: ${err.message || err}`);
    }
  };

  // Load settings when symbol or timeframe changes
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/backtest-settings/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, timeframe })
    })
      .then(res => res.json())
      .then(res => {
        if (res.status === 'success' && res.settings && Object.keys(res.settings).length > 0) {
          applyBacktestSettingsObject(res.settings);
        }
      })
      .catch(err => console.error("Error loading backtest settings:", err));
  }, [symbol, timeframe]);

  // Live strategy states
  const [liveStrategy, setLiveStrategy] = useState<any>(null);
  const [liveStrategies, setLiveStrategies] = useState<any[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(() => localStorage.getItem('wyckoff_selected_live_strategy_id') || '');
  const [isDeploying, setIsDeploying] = useState(false);

  const lastNotifiedSignalRef = useRef<number>(0);
  const backtestAbortControllerRef = useRef<AbortController | null>(null);
  const activeBacktestIdRef = useRef<string | null>(null);

  const cancelBacktest = () => {
    if (activeBacktestIdRef.current) {
      fetch(`${API_BASE_URL}/api/backtest/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backtestId: activeBacktestIdRef.current })
      }).catch(err => console.error("Failed to send cancel request to backend:", err));
    }
    if (backtestAbortControllerRef.current) {
      backtestAbortControllerRef.current.abort();
      backtestAbortControllerRef.current = null;
      setLoadingBacktest(false);
    }
  };

  const triggerPWAEventNotification = (title: string, body: string, soundType: string = 'alert') => {
    // Play local sound on Windows via backend
    fetch(`${API_BASE_URL}/api/notification/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `${title}: ${body}`, sound_type: soundType })
    }).catch(err => console.error("Failed to trigger local backend sound:", err));

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
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    if (!symbol) return;
    
    if (backtestAbortControllerRef.current) {
      backtestAbortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    backtestAbortControllerRef.current = controller;
    const backtestId = Date.now().toString();
    activeBacktestIdRef.current = backtestId;
    
    setLoadingBacktest(true);
    try {
      setBacktestProgress(0);
      const bounds = calculateDateBounds(dateRangeOption, customFrom, customTo);
      const response = await fetch(`${API_BASE_URL}/api/backtest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          candleSource,
          timeframe,
          limit: candleLimit,
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
          dailyRetryLimit: parseInt(dailyRetryLimit) || 0,
          allowOppositeClose,
          backtestId,
          enabledIndicators,
          timezone: sessionsTimezone,
          sessions: tradingSessions,
          useGlobalClose,
          globalCloseTime,
          entryStabilityRule,
          ...bounds
        }),
      });

      if (!response.body) {
        throw new Error("No response body available for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line.trim());
                if (parsed.progress !== undefined) {
                  setBacktestProgress(parsed.progress);
                }
                if (parsed.status === 'success' && parsed.data) {
                  const resData = parsed.data;
                  setBacktestResults(resData);
                  setFvgs(resData.fvgs || []);
                  if (resData.trades && resData.trades.length > 0) {
                    setSelectedTrade(resData.trades[0]);
                  } else {
                    setSelectedTrade(null);
                  }

                  // Notify if a signal occurs on the latest candle
                  const analyzedCandles = resData.candles || [];
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
                } else if (parsed.status === 'error') {
                  throw new Error(parsed.message || "Unknown backtest error");
                }
              } catch (parseErr) {
                console.error("Failed to parse JSON chunk:", parseErr);
              }
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log("Backtest aborted by user.");
      } else {
        console.error("Failed to run backtest on backend:", e);
      }
    } finally {
      console.timeEnd("Backtest execution duration");
      if (backtestAbortControllerRef.current === controller) {
        backtestAbortControllerRef.current = null;
        setLoadingBacktest(false);
      }
    }
  };

  const runOptimization = async () => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    if (!symbol) return;
    
    if (backtestAbortControllerRef.current) {
      backtestAbortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    backtestAbortControllerRef.current = controller;
    const backtestId = Date.now().toString();
    activeBacktestIdRef.current = backtestId;
    
    setLoadingBacktest(true);
    try {
      setBacktestProgress(0);
      setOptimizationResults(null);
      const bounds = calculateDateBounds(dateRangeOption, customFrom, customTo);
      const response = await fetch(`${API_BASE_URL}/api/backtest/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          candleSource,
          timeframe,
          limit: candleLimit,
          symbol,
          slVal: parseFloat(backtestSL) || 1.0,
          slType: backtestSLType,
          size: parseFloat(backtestSize) || 1,
          initialBalance: parseFloat(backtestBalance) || 10000,
          useRiskSizing,
          riskPct: parseFloat(backtestRiskPct) || 1.0,
          useBreakEven,
          beTriggerR: parseFloat(backtestBE) || 1.0,
          lookbackWindow: parseInt(lookbackWindow) || 20,
          feesPercent: parseFloat(backtestFees) || 0.0,
          dailyRetryLimit: parseInt(dailyRetryLimit) || 0,
          allowOppositeClose,
          backtestId,
          rrStart: parseFloat(rrStart) || 1.0,
          rrEnd: parseFloat(rrEnd) || 5.0,
          rrStep: parseFloat(rrStep) || 0.5,
          enabledIndicators,
          timezone: sessionsTimezone,
          sessions: tradingSessions,
          useGlobalClose,
          globalCloseTime,
          entryStabilityRule,
          ...bounds
        }),
      });

      if (!response.body) {
        throw new Error("No response body available for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line.trim());
                if (parsed.progress !== undefined) {
                  setBacktestProgress(parsed.progress);
                }
                if (parsed.status === 'success' && parsed.data) {
                  const resData = parsed.data;
                  if (resData.results) {
                    setOptimizationResults(resData.results);
                  }
                } else if (parsed.status === 'error') {
                  throw new Error(parsed.message || "Unknown optimization error");
                }
              } catch (parseErr) {
                console.error("Failed to parse JSON chunk:", parseErr);
              }
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log("Optimization aborted by user.");
      } else {
        console.error("Failed to run optimization on backend:", e);
      }
    } finally {
      console.timeEnd("Backtest execution duration");
      if (backtestAbortControllerRef.current === controller) {
        backtestAbortControllerRef.current = null;
        setLoadingBacktest(false);
      }
    }
  };
  const deployLiveStrategy = async (targetComputer: string = 'All', targets: Array<{ broker: string; account_id: string }> = [], name: string = '') => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    const targetBroker = candleSource === 'ctrader' ? 'ctrader' : 'metatrader';
    setIsDeploying(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/live/strategy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
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
          status: 'active',
          timezone: sessionsTimezone,
          sessions: tradingSessions,
          useGlobalClose,
          globalCloseTime,
          entryStabilityRule,
          broker: targetBroker,
          target_computer: targetComputer,
          targets: targets
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        setLiveStrategy(result.strategy);
        const brokerTitle = targetBroker === 'ctrader' ? 'cTrader' : 'MetaTrader 5';
        alert(`Successfully deployed strategy to ${brokerTitle} Live execution!\nSymbol: ${symbol}\nTimeframe: ${timeframe}\nTarget Host: ${targetComputer}`);
      }
    } finally {
      setIsDeploying(false);
    }
  };

  // Disabled auto-running backtest on candle loading to show candles first.
  // The user can run the backtest manually via the "Run Backtest" button.

  useEffect(() => {
    localStorage.setItem('wyckoff_symbol', symbol);
  }, [symbol]);

  useEffect(() => {
    localStorage.setItem('wyckoff_timeframe', timeframe);
  }, [timeframe]);

  useEffect(() => {
    localStorage.setItem('wyckoff_candle_limit', candleLimit.toString());
  }, [candleLimit]);

  useEffect(() => {
    localStorage.setItem('wyckoff_candle_source', candleSource);
  }, [candleSource]);

  useEffect(() => {
    localStorage.setItem('wyckoff_date_range_option', dateRangeOption);
  }, [dateRangeOption]);

  useEffect(() => {
    localStorage.setItem('wyckoff_custom_from', customFrom);
  }, [customFrom]);

  useEffect(() => {
    localStorage.setItem('wyckoff_custom_to', customTo);
  }, [customTo]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_sl', backtestSL);
  }, [backtestSL]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_sl_type', backtestSLType);
  }, [backtestSLType]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_rr', backtestRR);
  }, [backtestRR]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_size', backtestSize);
  }, [backtestSize]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_lookback', lookbackWindow);
  }, [lookbackWindow]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_balance', backtestBalance);
  }, [backtestBalance]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_risk_pct', backtestRiskPct);
  }, [backtestRiskPct]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_use_risk_sizing', useRiskSizing.toString());
  }, [useRiskSizing]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_be', backtestBE);
  }, [backtestBE]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_entry_stability_rule', entryStabilityRule);
  }, [entryStabilityRule]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_use_be', useBreakEven.toString());
  }, [useBreakEven]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_fees', backtestFees);
  }, [backtestFees]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_daily_retry_limit', dailyRetryLimit);
  }, [dailyRetryLimit]);

  useEffect(() => {
    localStorage.setItem('wyckoff_backtest_allow_opposite_close', allowOppositeClose.toString());
  }, [allowOppositeClose]);

  useEffect(() => {
    localStorage.setItem('wyckoff_sessions_timezone', sessionsTimezone);
  }, [sessionsTimezone]);

  useEffect(() => {
    localStorage.setItem('wyckoff_optimize_mode', isOptimizeMode.toString());
  }, [isOptimizeMode]);

  useEffect(() => {
    localStorage.setItem('wyckoff_rr_start', rrStart);
  }, [rrStart]);

  useEffect(() => {
    localStorage.setItem('wyckoff_rr_end', rrEnd);
  }, [rrEnd]);

  useEffect(() => {
    localStorage.setItem('wyckoff_rr_step', rrStep);
  }, [rrStep]);

  useEffect(() => {
    localStorage.setItem('wyckoff_trading_sessions', JSON.stringify(tradingSessions));
  }, [tradingSessions]);

  useEffect(() => {
    localStorage.setItem('wyckoff_use_global_close', useGlobalClose.toString());
  }, [useGlobalClose]);

  useEffect(() => {
    localStorage.setItem('wyckoff_global_close_time', globalCloseTime);
  }, [globalCloseTime]);

  // Fetch symbols and timeframes metadata dynamically based on selected candleSource
  useEffect(() => {
    const loadMetadata = async () => {
      const sourcePath = candleSource === 'yfinance' ? 'yfinance' : (candleSource === 'metatrader' ? 'metatrader' : 'ctrader');
      try {
        const symRes = await fetch(`${API_BASE_URL}/api/${sourcePath}/symbols`);
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
        const tfRes = await fetch(`${API_BASE_URL}/api/${sourcePath}/timeframes`);
        const tfData = await tfRes.json();
        if (tfData.status === 'success' && tfData.data) {
          setAvailableTimeframes(tfData.data);
        }
      } catch (e) {
        console.error('Failed to load timeframes:', e);
      }
    };
    loadMetadata();
  }, [candleSource]);

  useEffect(() => {
    const loadLiveStrategyAndPerms = async () => {
      try {
        const stratRes = await fetch(`${API_BASE_URL}/api/live/strategies`);
        const stratData = await stratRes.json();
        if (stratData.status === 'success' && Array.isArray(stratData.strategies)) {
          setLiveStrategies(stratData.strategies);
          // If no selectedStrategyId is saved yet, fallback to the first active strategy
          if (!selectedStrategyId && stratData.strategies.length > 0) {
            setSelectedStrategyId(stratData.strategies[0].id);
            localStorage.setItem('wyckoff_selected_live_strategy_id', stratData.strategies[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load live strategies:', e);
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

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      fetchFavourites();
    };
    loadLiveStrategyAndPerms();
  }, []);

  // Fetch candle data and analyze on Flask backend
  const fetchCandles = async (overrideBroker?: string, isBackground: boolean = false) => {
    if (!isBackground) {
      setLoading(true);
    }
    setLoadingStrategy(true);
    try {
      let rawCandles: Candle[] = [];
      
      if (isLiveFeed && selectedStrategyId) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/live/strategy/cache/${selectedStrategyId}`);
          const result = await response.json();
          if (result && result.status === 'success' && Array.isArray(result.candles)) {
            rawCandles = result.candles.sort((a: Candle, b: Candle) => a.time - b.time);
            setLiveSimulatedTrades([]);
          }
        } catch (err) {
          console.error("Failed to fetch live feed cache:", err);
        }
      }

      if (rawCandles.length === 0 && !isLiveFeed) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/trade/candles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              broker: overrideBroker || candleSource,
              symbol: symbol,
              interval: timeframe,
              limit: candleLimit,
              lookback: parseInt(lookbackWindow) || 20,
            }),
          });
          const result = await response.json();
          if (result && result.status === 'success' && Array.isArray(result.candles)) {
            rawCandles = result.candles.sort((a: Candle, b: Candle) => a.time - b.time);
            setLiveSimulatedTrades(result.trades || []);
          } else if (Array.isArray(result)) {
            rawCandles = result.sort((a: Candle, b: Candle) => a.time - b.time);
            setLiveSimulatedTrades([]);
          }
        } catch (err) {
          console.warn("Using local historical mock generation fallback.");
        }
      }

      if (rawCandles.length > 0) {
        // Set raw candles immediately and stop initial loading to show chart instantly
        setCandles(rawCandles);
        setLoading(false);
        setInitialCandlesLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching candles:', error);
    } finally {
      setLoading(false);
      setLoadingStrategy(false);
      setInitialCandlesLoaded(true);
    }
  };

  // Unified API endpoints
  const fetchAccountData = async (overrideBroker?: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trade/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: overrideBroker || candleSource })
      });
      const result = await response.json();
      if (result.status === 'success') {
        setAccountInfo(result.data);
      }
    } catch (error) {
      console.error('Account data error:', error);
    }
  };

  const fetchPositionData = async (overrideBroker?: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trade/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: overrideBroker || candleSource })
      });
      const result = await response.json();
      if (result.status === 'success') {
        setOpenPositions(result.data);
      }
    } catch (error) {
      console.error('Positions data error:', error);
    }
  };

  const fetchHistoryTrades = async (overrideBroker?: string) => {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trade/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: overrideBroker || candleSource })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setHistoryTrades(data.data || []);
      } else {
        setHistoryError(data.message || 'Failed to fetch trade history.');
      }
    } catch (e) {
      setHistoryError('Failed to fetch trade history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts`);
      const data = await res.json();
      if (data.status === 'success') {
        const list = data.data || [];
        setAccounts(list);
        localStorage.setItem('wyckoff_accounts', JSON.stringify(list));
      }
    } catch (e) {
      console.error("Failed to load accounts:", e);
    }
  };

  const fetchActiveAccount = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts/active`);
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setActiveAccount(data.data);
        localStorage.setItem('wyckoff_active_account', JSON.stringify(data.data));
        return data.data;
      } else {
        setActiveAccount(null);
        localStorage.removeItem('wyckoff_active_account');
        return null;
      }
    } catch (e) {
      console.error("Failed to load active account:", e);
      return null;
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    setAccountInfo(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        const newActive = await fetchActiveAccount();
        const broker = newActive ? newActive.broker_type : 'metatrader';
        fetchCandles(broker);
        fetchAccountData(broker);
        fetchPositionData(broker);
        fetchHistoryTrades(broker);
      } else {
        alert("Failed to switch account: " + data.message);
      }
    } catch (e: any) {
      alert("Error switching account: " + e.message);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName || !newAccId) {
      alert("Please fill name and account ID.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccName,
          broker_type: newAccBroker,
          account_id: newAccId,
          password: newAccPassword,
          server: newAccServer
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setNewAccName('');
        setNewAccId('');
        setNewAccPassword('');
        setNewAccServer('');
        setShowAccountModal(false);
        setAccountInfo(null);
        await fetchAccounts();
        const newActive = await fetchActiveAccount();
        const broker = newActive ? newActive.broker_type : 'metatrader';
        fetchCandles(broker);
        fetchAccountData(broker);
        fetchPositionData(broker);
        fetchHistoryTrades(broker);
      } else {
        alert("Failed to save account: " + data.message);
      }
    } catch (e: any) {
      alert("Error saving account: " + e.message);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!window.confirm("Are you sure you want to delete this account?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAccountInfo(null);
        await fetchAccounts();
        const newActive = await fetchActiveAccount();
        const broker = newActive ? newActive.broker_type : 'metatrader';
        fetchCandles(broker);
        fetchAccountData(broker);
        fetchPositionData(broker);
        fetchHistoryTrades(broker);
      } else {
        alert("Failed to delete account: " + data.message);
      }
    } catch (e: any) {
      alert("Error deleting account: " + e.message);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchActiveAccount();
  }, []);

  const handleClosePosition = async (pos: any) => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    if (!window.confirm(`Are you sure you want to close position ${pos.position_id} (${pos.symbol})?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/trade/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: candleSource,
          position_id: pos.position_id,
          symbol: pos.symbol,
          side: pos.trade_side,
          volume: pos.volume
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchPositionData();
        fetchHistoryTrades();
      } else {
        alert(`Failed to close position: ${data.message}`);
      }
    } catch (e) {
      alert('Failed to close position due to network error.');
    }
  };

  const getPnlStats = () => {
    let daily = 0;
    let weekly = 0;
    const now = new Date();
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    
    const tempNow = new Date();
    const day = tempNow.getDay();
    const diff = tempNow.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(tempNow.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekTs = startOfWeek.getTime() / 1000;

    historyTrades.forEach((t) => {
      if (t.timestamp >= startOfToday) {
        daily += t.profit;
      }
      if (t.timestamp >= startOfWeekTs) {
        weekly += t.profit;
      }
    });

    return { daily, weekly };
  };

  const { daily: dailyPnl, weekly: weeklyPnl } = getPnlStats();

  const fetchFavourites = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/favourites/list`);
      const result = await response.json();
      if (result.status === 'success' && result.data) {
        setFavouriteCandles(result.data);
      }
    } catch (e) {
      console.error('Failed to fetch favourite candles:', e);
    }
  };

  const handleSaveFavourite = async (candle: Candle, notes: string = '') => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/favourites/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol,
          timeframe: timeframe,
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          vsa_patterns: candle.vsa_patterns,
          weis_wave_volume: candle.weis_wave_volume,
          notes: notes
        }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        alert('Candle successfully added to favourites!');
        setSelectedCandle(null);
        setFavNotesInput('');
        fetchFavourites();
      } else {
        alert('Failed to save favourite: ' + result.message);
      }
    } catch (e) {
      console.error('Failed to save favourite candle:', e);
    }
  };

  const handleDeleteFavourite = async (favId: number) => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/favourites/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: favId }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        fetchFavourites();
      } else {
        alert('Failed to delete: ' + result.message);
      }
    } catch (e) {
      console.error('Failed to delete favourite candle:', e);
    }
  };

  const handleUpdateFavouriteNotes = async (favId: number, notes: string) => {
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/favourites/update-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: favId, notes }),
      });
      const result = await response.json();
      if (result.status === 'success') {
        alert('Notes updated!');
        fetchFavourites();
      } else {
        alert('Failed to update notes: ' + result.message);
      }
    } catch (e) {
      console.error('Failed to update notes:', e);
    }
  };

  const handleLocateCandle = (fav: any) => {
    setSymbol(fav.symbol);
    setTimeframe(fav.timeframe);
    setLocateTimestamp(fav.candle_time);
    // Clear after a brief period so it can be re-triggered
    setTimeout(() => {
      setLocateTimestamp(null);
    }, 1000);
  };

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProdHost && !isAuthenticated) {
      alert("Action disabled in read-only mode.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/trade/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker: candleSource,
          symbol: symbol,
          order_type: tradeType,
          volume: parseFloat(amount),
          price: orderType === 'market' ? null : parseFloat(price),
        })
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

  // Automatic candle fetching disabled to prevent overloading the server. Charts only load on manual click/refresh.
  useEffect(() => {
    // Only load metadata and set flags on startup without fetching candles
    setInitialCandlesLoaded(true);
    setLoading(false);
    setLoadingStrategy(false);
  }, [symbol, timeframe, candleLimit, candleSource]);

  // Fetch other account/positions data once candles have initially loaded, and set up polling.
  useEffect(() => {
    if (!initialCandlesLoaded) return;

    fetchAccountData();
    fetchPositionData();
    fetchHistoryTrades(); // Initial load only

    // Poll account and positions every 10s (skip history)
    const interval = setInterval(() => {
      fetchAccountData();
      fetchPositionData();
    }, 10000);
    return () => clearInterval(interval);
  }, [initialCandlesLoaded, symbol, candleSource]);

  // Live Feed auto-update polling
  useEffect(() => {
    if (!isLiveFeed) return;
    fetchCandles(undefined, true);
    const interval = setInterval(() => {
      fetchCandles(undefined, true);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLiveFeed, symbol, timeframe, selectedStrategyId]);

  const currentConnected = true;

  // Shared Inline Styles
  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: 'var(--app-bg)',
      color: 'var(--app-text)',
      display: 'flex',
      flexDirection: 'column' as const,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    header: {
      backgroundColor: 'var(--app-header-bg)',
      borderBottom: '1px solid var(--app-card-border)',
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
      backgroundColor: 'var(--app-bg)',
      border: '1px solid var(--app-card-border)',
      borderRadius: '8px',
      padding: '4px',
      display: 'flex',
      gap: '4px',
    },
    modeBtn: (active: boolean) => ({
      backgroundColor: active ? '#3b82f6' : 'transparent',
      color: active ? '#ffffff' : 'var(--app-text-muted)',
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
      backgroundColor: 'var(--app-bg)',
      border: '1px solid var(--app-card-border)',
      borderRadius: '6px',
      padding: '4px 8px',
      color: 'var(--app-input-text)',
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
      backgroundColor: 'var(--app-card-bg)',
      border: '1px solid var(--app-card-border)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
    },
    cardTitle: {
      color: 'var(--app-text)',
      fontWeight: 'bold',
      fontSize: '14px',
      borderBottom: '1px solid var(--app-card-border)',
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
      backgroundColor: active ? (isBuy ? '#10b981' : '#ef4444') : 'var(--app-hover-bg)',
      color: active ? '#ffffff' : 'var(--app-text-muted)',
    }),
    walletContainer: {
      backgroundColor: 'var(--app-bg)',
      border: '1px solid var(--app-card-border)',
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
      backgroundColor: 'var(--app-bg)',
      border: '1px solid var(--app-card-border)',
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
      backgroundColor: active ? 'var(--app-hover-bg)' : 'transparent',
      color: active ? 'var(--app-text)' : 'var(--app-text-muted)',
      fontWeight: 'bold',
      transition: 'all 0.2s',
    }),
    formGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
    },
    input: {
      backgroundColor: 'var(--app-input-bg)',
      border: '1px solid var(--app-input-border)',
      borderRadius: '6px',
      padding: '6px 10px',
      color: 'var(--app-input-text)',
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
      backgroundColor: 'var(--app-bg)',
      border: '1px solid var(--app-card-border)',
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

  const getLotSize = (sym: string): number => {
    const symUpper = sym.toUpperCase();
    if (symUpper.includes('XAU') || symUpper.includes('GOLD') || symUpper.includes('XAG')) {
      return 100.0;
    }
    const cryptos = ['BTC', 'ETH', 'SOL', 'LTC', 'XRP', 'ADA', 'DOT', 'DOGE', 'LINK', 'UNI', 'PEPE', 'SHIB'];
    if (cryptos.some(c => symUpper.includes(c))) {
      return 1.0;
    }
    const forex = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'SEK', 'NOK', 'SGD', 'HKD', 'ZAR', 'MXN'];
    if (forex.some(c => symUpper.includes(c))) {
      return 100000.0;
    }
    return 1.0;
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
      } else if (liveStrategy.slType === 'dollar') {
        const lotSize = getLotSize(pos.symbol);
        const volume = parseFloat(pos.volume) || 1.0;
        const slDistance = slVal / (volume * lotSize);
        slPrice = isBuy ? entry - slDistance : entry + slDistance;
      } else {
        slPrice = isBuy ? entry * (1 - slVal / 100) : entry * (1 + slVal / 100);
      }
      
      const slDistancePrice = Math.abs(entry - slPrice);
      tpPrice = isBuy ? entry + slDistancePrice * rr : entry - slDistancePrice * rr;
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
          <div style={{ position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={toggleTheme}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--app-panel-header-bg)',
                border: '1px solid var(--app-card-border)',
                cursor: 'pointer',
                borderRadius: '6px',
                padding: '6px',
                color: 'var(--app-text)',
                outline: 'none',
                transition: 'all 0.2s',
              }}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'var(--app-panel-header-bg)',
                border: '1px solid var(--app-card-border)',
                cursor: 'pointer',
                borderRadius: '6px',
                padding: '6px 12px',
                color: 'var(--app-text)',
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
                   <a 
                    href="#symbol-mappings" 
                    className="menu-item" 
                    onClick={(e) => {
                      e.preventDefault();
                      setView('mappings');
                      setShowMenu(false);
                    }}
                  >
                    🔗 Symbol Mappings
                  </a>
                  <a 
                    href="#live-trades" 
                    className="menu-item" 
                    onClick={(e) => {
                      e.preventDefault();
                      setView('trades');
                      setShowMenu(false);
                    }}
                  >
                    📈 Live Trades & History
                  </a>
                  <a 
                    href="#computers" 
                    className="menu-item" 
                    onClick={(e) => {
                      e.preventDefault();
                      setView('computers');
                      setShowMenu(false);
                    }}
                  >
                    💻 Computer Manager
                  </a>
                  <button 
                    onClick={() => {
                      setShowMenu(false);
                      triggerPWAEventNotification("Sound Check", "Local audio sound test completed successfully!", "trade_open");
                    }}
                    className="menu-item"
                    style={{
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      width: '100%',
                      cursor: 'pointer',
                      display: 'block',
                      fontFamily: 'inherit',
                      padding: '8px 16px',
                      color: '#94a3b8'
                    }}
                  >
                    🔔 Test Local Sound
                  </button>
                  <button 
                    onClick={() => {
                      setShowMenu(false);
                      handleRestartServer();
                    }}
                    className="menu-item"
                    style={{
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      width: '100%',
                      cursor: 'pointer',
                      display: 'block',
                      fontFamily: 'inherit',
                      padding: '8px 16px',
                      color: '#ef4444',
                      fontWeight: 'bold'
                    }}
                  >
                    🔄 Update & Restart Server
                  </button>
                  <a href="/how-to" className="menu-item" style={{ borderTop: '1px solid #1e293b', paddingTop: '8px', marginTop: '4px' }} onClick={() => setShowMenu(false)}>
                    📖 How It Works
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Centered Account Selector */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          justifyContent: 'center',
          flex: 1,
          margin: '0 20px',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid var(--app-card-border)',
          borderRadius: '8px',
          padding: '4px 12px',
          maxWidth: '650px'
        }}>
          {activeAccount ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <span style={{
                fontWeight: 'bold',
                color: activeAccount.broker_type === 'ctrader' ? '#f59e0b' : '#3b82f6',
                textTransform: 'uppercase',
                fontSize: '10px',
                backgroundColor: activeAccount.broker_type === 'ctrader' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                padding: '2px 6px',
                borderRadius: '4px'
              }}>
                {activeAccount.broker_type === 'ctrader' ? 'cTrader' : 'MT5'}
              </span>
              <span style={{ color: 'var(--app-text)', fontWeight: 'bold' }}>{activeAccount.name}</span>
              <span style={{ color: 'var(--app-text-muted)', fontSize: '11px' }}>({activeAccount.account_id})</span>
              {accountInfo ? (
                <span style={{ 
                  color: '#10b981', 
                  fontWeight: 'bold', 
                  fontSize: '11px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                  {accountInfo.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountInfo.currency || 'USD'}
                </span>
              ) : (
                <span style={{ color: 'var(--app-text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                  (Loading balance...)
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--app-text-muted)', fontSize: '12px' }}>No Active Account</span>
          )}

          <select
            value={activeAccount?.account_id || ''}
            onChange={(e) => handleSwitchAccount(e.target.value)}
            style={{
              backgroundColor: 'var(--app-panel-header-bg)',
              border: '1px solid var(--app-card-border)',
              color: 'var(--app-text)',
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="" disabled>Switch account...</option>
            {accounts.map((acc) => (
              <option key={acc.account_id} value={acc.account_id}>
                {acc.name} ({acc.broker_type === 'ctrader' ? 'cTrader' : 'MT5'})
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowAccountModal(true)}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ⚙️ Manage
          </button>
        </div>

        {view !== 'mappings' && (
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
              color: candleSource === 'metatrader' ? '#3b82f6' : '#f59e0b',
              fontWeight: 'bold',
              fontSize: '12px',
              backgroundColor: candleSource === 'metatrader' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: `1px solid ${candleSource === 'metatrader' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
              padding: '6px 12px',
              borderRadius: '6px',
              textAlign: 'center',
              ...(isMobile ? { width: '100%' } : {})
            }}>
              {activeAccount ? `${activeAccount.name} Active` : 'No Active Account'}
            </div>
            {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '89.217.138.51') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--app-panel-header-bg)', border: '1px solid var(--app-card-border)', borderRadius: '6px', padding: '4px 8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--app-text-muted)', fontWeight: 'bold' }}>Target API:</span>
                <select
                  value={localStorage.getItem('wyckoff_api_target') || `http://${window.location.hostname}:8751`}
                  onChange={(e) => {
                    localStorage.setItem('wyckoff_api_target', e.target.value);
                    window.location.reload();
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--app-text)',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value={`http://${window.location.hostname}:8751`}>Local Host (8751)</option>
                  <option value="http://89.217.138.51:8751">Laptop Server (89.217.138.51)</option>
                  <option value="https://trading-production-cb87.up.railway.app">Railway Live Container</option>
                </select>
              </div>
            )}
            {(window.location.hostname === 'localhost' || 
              window.location.hostname === '127.0.0.1' ||
              window.location.hostname === '89.217.138.51') && (
              <button
                onClick={async () => {
                  try {
                    const response = await fetch('https://trading-production-cb87.up.railway.app/api/ctrader/order', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ symbol: 'EURUSD', order_type: 'buy', volume: 0.01 })
                    });
                    const data = await response.json();
                    if (data.status === 'success') {
                      alert(`Test Order Placed successfully!\nDetails: ${data.message || JSON.stringify(data)}`);
                    } else {
                      alert(`Test Order Error:\n${data.message || JSON.stringify(data)}`);
                    }
                  } catch (err: any) {
                    alert(`Failed to trigger order: ${err.message}`);
                  }
                }}
                style={{
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  marginLeft: '8px',
                  transition: 'background-color 0.2s',
                  ...(isMobile ? { width: '100%', marginLeft: 0 } : {})
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ef4444')}
              >
                🚀 Test cTrader Order
              </button>
            )}
          </div>
        )}
      </header>

      {window.location.pathname === '/how-to' ? (
        <HowToPage />
      ) : view === 'mappings' ? (
        <SymbolMappingsView
          isMobile={isMobile}
          setView={setView}
          isProdHost={isProdHost}
          isAuthenticated={isAuthenticated}
        />
      ) : view === 'computers' ? (
        <ComputerManager
          setView={setView}
        />
      ) : (
        <>
      {/* Main Grid View */}
      <main style={styles.mainLayout}>
        {selectedCandle && (
          <div style={{
            backgroundColor: '#0f172a',
            border: '1.5px solid #eab308',
            boxShadow: '0 0 15px rgba(234, 179, 8, 0.15)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: '16px',
            position: 'relative'
          }}>
            <button 
              onClick={() => setSelectedCandle(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#f1f5f9' }}>
                  🔍 Selected Candle Details
                </span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 'bold',
                  backgroundColor: timeframe === '1m' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: timeframe === '1m' ? '#10b981' : '#ef4444',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  {timeframe === '1m' ? '1m Candle Supported' : '1m Only (Read Only)'}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Time: {formatDateTime(selectedCandle.time)} | Open: {formatPrice(selectedCandle.open, symbol)} | High: {formatPrice(selectedCandle.high, symbol)} | Low: {formatPrice(selectedCandle.low, symbol)} | Close: {formatPrice(selectedCandle.close, symbol)} | Vol: {selectedCandle.volume.toFixed(1)}
              </span>
              {selectedCandle.vsa_patterns && selectedCandle.vsa_patterns.length > 0 && (
                <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '500' }}>
                  VSA Patterns: {selectedCandle.vsa_patterns.join(', ')}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {timeframe === '1m' ? (
                <>
                  <input 
                    type="text"
                    placeholder="Add custom notes..."
                    value={favNotesInput}
                    onChange={(e) => setFavNotesInput(e.target.value)}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      minWidth: '220px',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => handleSaveFavourite(selectedCandle, favNotesInput)}
                    style={{
                      backgroundColor: '#eab308',
                      color: '#0b0f19',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 16px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 4px 10px rgba(234, 179, 8, 0.2)',
                      transition: 'all 0.2s'
                    }}
                  >
                    ⭐ Favourite Candle
                  </button>
                </>
              ) : (
                <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold' }}>
                  ⚠️ Save to Favourites is only available for 1m timeframe candles
                </span>
              )}
            </div>
          </div>
        )}

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
            <button
              onClick={() => setMobileTab('trades')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: mobileTab === 'trades' ? '#2563eb' : 'transparent',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              📈 Trades
            </button>
            <button
              onClick={() => setMobileTab('live_overview')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: mobileTab === 'live_overview' ? '#2563eb' : 'transparent',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              ⚡ Live Overview
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
                onSymbolChange={setSymbol}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                candleSource={candleSource}
                onCandleSourceChange={setCandleSource}
                availableSymbols={availableSymbols}
                availableTimeframes={availableTimeframes}
                candles={backtestResults?.candles || candles} 
                loading={loading} 
                loadingStrategy={loadingStrategy} 
                onRefresh={fetchCandles} 
                entryPrice={selectedTrade?.entryPrice}
                slPrice={selectedTrade?.slPrice}
                tpPrice={selectedTrade?.tpPrice}
                trades={backtestResults ? backtestResults.trades : (liveSimulatedTrades.length > 0 ? liveSimulatedTrades : liveTrades)}
                selectedTrade={selectedTrade}
                onSelectTrade={(trade) => {
                  setSelectedTrade(trade);
                  setShowModal(true);
                }}
                dateRangeOption={dateRangeOption}
                customFrom={customFrom}
                customTo={customTo}
                onSelectCandle={setSelectedCandle}
                locateTimestamp={locateTimestamp}
                tradeFilter={tradeFilter}
                onTradeFilterChange={setTradeFilter}
                sessions={tradingSessions}
                sessionsTimezone={sessionsTimezone}
                selectedCandle={selectedCandle}
                hiddenStages={hiddenStages}
                isLiveFeed={isLiveFeed}
                onLiveFeedChange={setIsLiveFeed}
              />
            ) : mobileTab === 'backtester' ? (
              <WyckoffBacktester
                isReadOnly={isProdHost && !isAuthenticated}
                symbol={symbol}
                timeframe={timeframe}
                broker={candleSource}
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
                tradeFilter={tradeFilter}
                setTradeFilter={setTradeFilter}
                selectedTrade={selectedTrade}
                setSelectedTrade={setSelectedTrade}
                setShowModal={setShowModal}
                backtestFees={backtestFees}
                setBacktestFees={setBacktestFees}
                enabledIndicators={enabledIndicators}
                setEnabledIndicators={setEnabledIndicators}
                dateRangeOption={dateRangeOption}
                setDateRangeOption={setDateRangeOption}
                customFrom={customFrom}
                setCustomFrom={setCustomFrom}
                customTo={customTo}
                setCustomTo={setCustomTo}
                entryStabilityRule={entryStabilityRule}
                setEntryStabilityRule={setEntryStabilityRule}
                candleLimit={candleLimit}
                setCandleLimit={setCandleLimit}
                favouriteCandles={favouriteCandles}
                onDeleteFavourite={handleDeleteFavourite}
                onUpdateNotes={handleUpdateFavouriteNotes}
                onLocateCandle={handleLocateCandle}
                styles={styles}
                onRunBacktest={runBacktest}
                loadingBacktest={loadingBacktest}
                backtestProgress={backtestProgress}
                dailyRetryLimit={dailyRetryLimit}
                setDailyRetryLimit={setDailyRetryLimit}
                allowOppositeClose={allowOppositeClose}
                setAllowOppositeClose={setAllowOppositeClose}
                onCancelBacktest={cancelBacktest}
                sessionsTimezone={sessionsTimezone}
                setSessionsTimezone={setSessionsTimezone}
                tradingSessions={tradingSessions}
                setTradingSessions={setTradingSessions}
                useGlobalClose={useGlobalClose}
                setUseGlobalClose={setUseGlobalClose}
                globalCloseTime={globalCloseTime}
                setGlobalCloseTime={setGlobalCloseTime}
                hiddenStages={hiddenStages}
                setHiddenStages={setHiddenStages}
                isOptimizeMode={isOptimizeMode}
                setIsOptimizeMode={setIsOptimizeMode}
                rrStart={rrStart}
                setRRStart={setRRStart}
                rrEnd={rrEnd}
                setRREnd={setRREnd}
                rrStep={rrStep}
                setRRStep={setRRStep}
                optimizationResults={optimizationResults}
                setOptimizationResults={setOptimizationResults}
                onRunOptimization={runOptimization}
                onSaveSettings={saveBacktestSettings}
              />
            ) : mobileTab === 'trades' ? (
              <LiveTradesPanel
                dailyPnl={dailyPnl}
                weeklyPnl={weeklyPnl}
                openPositions={openPositions}
                historyTrades={historyTrades}
                loadingHistory={loadingHistory}
                historyError={historyError}
                handleClosePosition={handleClosePosition}
                isMobileLayout={true}
              />
            ) : (
              <LiveOverviewPanel isMobileLayout={true} />
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
              const defaultWidth = panelId === 'chart' ? 'calc(50% - 16px)' : 'calc(25% - 16px)';
              const dragStyles = {
                width: cardWidths[panelId] ? `${cardWidths[panelId]}px` : defaultWidth,
              flexGrow: cardWidths[panelId] ? 0 : 1,
              flexShrink: 1,
              minWidth: '280px',
              border: isDragOver ? '2px dashed #3b82f6' : '1px solid var(--app-card-border)',
              borderRadius: '12px',
              backgroundColor: 'var(--app-card-bg)',
              transition: activeResize ? 'none' : 'border 0.2s, opacity 0.2s',
              opacity: isDragOver ? 0.75 : 1,
              position: 'relative' as const,
              overflow: 'hidden',
            };
 
            const headerStyle = {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--app-panel-header-bg)',
              padding: '10px 16px',
              cursor: 'grab',
              userSelect: 'none' as const,
              borderBottom: '1px solid var(--app-card-border)',
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'var(--app-text)',
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
                      onSymbolChange={setSymbol}
                      timeframe={timeframe}
                      onTimeframeChange={setTimeframe}
                      candleSource={candleSource}
                      onCandleSourceChange={setCandleSource}
                      availableSymbols={availableSymbols}
                      availableTimeframes={availableTimeframes}
                      candles={backtestResults?.candles || candles} 
                      loading={loading} 
                      loadingStrategy={loadingStrategy} 
                      onRefresh={fetchCandles} 
                      entryPrice={selectedTrade?.entryPrice}
                      slPrice={selectedTrade?.slPrice}
                      tpPrice={selectedTrade?.tpPrice}
                      trades={backtestResults ? backtestResults.trades : (liveSimulatedTrades.length > 0 ? liveSimulatedTrades : liveTrades)}
                      selectedTrade={selectedTrade}
                      onSelectTrade={(trade) => {
                        setSelectedTrade(trade);
                        setShowModal(true);
                      }}
                      dateRangeOption={dateRangeOption}
                      customFrom={customFrom}
                      customTo={customTo}
                      onSelectCandle={setSelectedCandle}
                      locateTimestamp={locateTimestamp}
                      enabledIndicators={enabledIndicators}
                      fvgs={fvgs}
                      tradeFilter={tradeFilter}
                      onTradeFilterChange={setTradeFilter}
                      sessions={tradingSessions}
                      sessionsTimezone={sessionsTimezone}
                      selectedCandle={selectedCandle}
                      hiddenStages={hiddenStages}
                      isLiveFeed={isLiveFeed}
                      onLiveFeedChange={setIsLiveFeed}
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
                      isReadOnly={isProdHost && !isAuthenticated}
                      symbol={symbol}
                      timeframe={timeframe}
                      broker={candleSource}
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
                      tradeFilter={tradeFilter}
                      setTradeFilter={setTradeFilter}
                      selectedTrade={selectedTrade}
                      setSelectedTrade={setSelectedTrade}
                      setShowModal={setShowModal}
                      backtestFees={backtestFees}
                      setBacktestFees={setBacktestFees}
                      enabledIndicators={enabledIndicators}
                      setEnabledIndicators={setEnabledIndicators}
                      dateRangeOption={dateRangeOption}
                      setDateRangeOption={setDateRangeOption}
                      customFrom={customFrom}
                      setCustomFrom={setCustomFrom}
                      customTo={customTo}
                      setCustomTo={setCustomTo}
                      entryStabilityRule={entryStabilityRule}
                      setEntryStabilityRule={setEntryStabilityRule}
                      candleLimit={candleLimit}
                      setCandleLimit={setCandleLimit}
                      favouriteCandles={favouriteCandles}
                      onDeleteFavourite={handleDeleteFavourite}
                      onUpdateNotes={handleUpdateFavouriteNotes}
                      onLocateCandle={handleLocateCandle}
                      styles={styles}
                      onRunBacktest={runBacktest}
                      loadingBacktest={loadingBacktest}
                      backtestProgress={backtestProgress}
                      dailyRetryLimit={dailyRetryLimit}
                      setDailyRetryLimit={setDailyRetryLimit}
                      allowOppositeClose={allowOppositeClose}
                      setAllowOppositeClose={setAllowOppositeClose}
                      onCancelBacktest={cancelBacktest}
                      sessionsTimezone={sessionsTimezone}
                      setSessionsTimezone={setSessionsTimezone}
                      tradingSessions={tradingSessions}
                      setTradingSessions={setTradingSessions}
                      useGlobalClose={useGlobalClose}
                      setUseGlobalClose={setUseGlobalClose}
                      globalCloseTime={globalCloseTime}
                      setGlobalCloseTime={setGlobalCloseTime}
                      hiddenStages={hiddenStages}
                      setHiddenStages={setHiddenStages}
                      
                      isOptimizeMode={isOptimizeMode}
                      setIsOptimizeMode={setIsOptimizeMode}
                      rrStart={rrStart}
                      setRRStart={setRRStart}
                      rrEnd={rrEnd}
                      setRREnd={setRREnd}
                      rrStep={rrStep}
                      setRRStep={setRRStep}
                      optimizationResults={optimizationResults}
                      setOptimizationResults={setOptimizationResults}
                      onRunOptimization={runOptimization}
                      onSaveSettings={saveBacktestSettings}
                    />
                  </div>
                  {renderResizeHandle('backtester')}
                </div>
              );
            }

            if (panelId === 'trades') {
              return (
                <div
                  key="trades"
                  onDragOver={(e) => handleDragOver(e, 'trades')}
                  onDrop={(e) => handleDrop(e, 'trades')}
                  style={dragStyles}
                >
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'trades')}
                    style={headerStyle}
                  >
                    <span>📈 Live Trades & P&L</span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                  </div>
                  <div className="no-drag" style={contentStyle}>
                    <LiveTradesPanel
                      dailyPnl={dailyPnl}
                      weeklyPnl={weeklyPnl}
                      openPositions={openPositions}
                      historyTrades={historyTrades}
                      loadingHistory={loadingHistory}
                      historyError={historyError}
                      handleClosePosition={handleClosePosition}
                      isMobileLayout={false}
                    />
                  </div>
                  {renderResizeHandle('trades')}
                </div>
              );
            }

            if (panelId === 'live_overview') {
              return (
                <div
                  key="live_overview"
                  onDragOver={(e) => handleDragOver(e, 'live_overview')}
                  onDrop={(e) => handleDrop(e, 'live_overview')}
                  style={dragStyles}
                >
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, 'live_overview')}
                    style={headerStyle}
                  >
                    <span>⚡ Live Strategies Overview</span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                  </div>
                  <div className="no-drag" style={contentStyle}>
                    <LiveOverviewPanel 
                      isMobileLayout={false} 
                      selectedStrategyId={selectedStrategyId}
                      isLiveFeed={isLiveFeed}
                      onSelectStrategy={(id) => {
                        setSelectedStrategyId(id);
                        localStorage.setItem('wyckoff_selected_live_strategy_id', id);
                        setIsLiveFeed(true);
                        localStorage.setItem('wyckoff_is_live_feed', 'true');
                        // Trigger candle fetch on active display update
                        setTimeout(() => fetchCandles(), 50);
                      }}
                    />
                  </div>
                  {renderResizeHandle('live_overview')}
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

            {selectedTrade.triggerReason && (
              <div style={{
                borderTop: '1px solid #1e293b',
                paddingTop: '16px',
                marginTop: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12px'
              }}>
                <span style={{ color: '#cbd5e1', fontWeight: 'bold', display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Entry Trigger State (VSA & Structural Sweep)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', backgroundColor: 'rgba(30, 41, 59, 0.3)', padding: '10px', borderRadius: '8px' }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Active VSA Patterns</span>
                    <span style={{ color: '#f1f5f9', fontWeight: '500' }}>{selectedTrade.triggerReason.vsa_patterns}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(148, 163, 184, 0.1)', paddingTop: '6px' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Swept Structural Level</span>
                      <span style={{ color: '#f1f5f9', fontWeight: '500' }}>
                        {selectedTrade.triggerReason.sweep_level ? `$${formatPrice(selectedTrade.triggerReason.sweep_level, symbol)}` : 'None'}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>Weis Wave Volume</span>
                      <span style={{ color: '#f1f5f9', fontWeight: '500' }}>
                        {selectedTrade.triggerReason.weis_wave_volume ? selectedTrade.triggerReason.weis_wave_volume.toFixed(1) : '0.0'}
                      </span>
                    </div>
                  </div>
                  {selectedTrade.triggerReason.entry_candle && (
                    <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.1)', paddingTop: '6px' }}>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '10px', marginBottom: '2px' }}>Entry Candle OHLC</span>
                      <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                        O:{formatPrice(selectedTrade.triggerReason.entry_candle.open, symbol)} H:{formatPrice(selectedTrade.triggerReason.entry_candle.high, symbol)} L:{formatPrice(selectedTrade.triggerReason.entry_candle.low, symbol)} C:{formatPrice(selectedTrade.triggerReason.entry_candle.close, symbol)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

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
              {selectedTrade.entryTimestamp && (
                <button
                  onClick={() => {
                    handleLocateCandle({
                      symbol: symbol,
                      timeframe: timeframe,
                      candle_time: selectedTrade.entryTimestamp
                    });
                    setShowModal(false);
                  }}
                  style={{
                    marginTop: '8px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  📍 Go to Trade
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAccountModal && (
        <div
          onClick={() => setShowAccountModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '520px',
              padding: '24px',
              position: 'relative',
              color: '#f8fafc',
            }}
          >
            <button
              onClick={() => setShowAccountModal(false)}
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

            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#f1f5f9' }}>
              📁 Account Management
            </h2>

            {/* List existing accounts */}
            <div style={{ marginBottom: '24px', maxHeight: '200px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Connected Accounts
              </h3>
              {accounts.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '12px', padding: '8px 0' }}>No accounts connected yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {accounts.map((acc) => (
                    <div
                      key={acc.account_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#1e293b',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        border: acc.is_active ? '1px solid #3b82f6' : '1px solid transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontWeight: 'bold',
                          color: acc.broker_type === 'ctrader' ? '#f59e0b' : '#3b82f6',
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          backgroundColor: acc.broker_type === 'ctrader' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {acc.broker_type === 'ctrader' ? 'cTrader' : 'MT5'}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{acc.name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>({acc.account_id})</span>
                        {acc.is_active === 1 && <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}> ● Active</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        {acc.is_active !== 1 && (
                          <button
                            onClick={() => handleSwitchAccount(acc.account_id)}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#3b82f6',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          >
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAccount(acc.account_id)}
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new account form */}
            <form onSubmit={handleAddAccount} style={{ borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px' }}>
                Add New Trading Account
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Account Name Label</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. My FTMO Live"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Broker Platform</label>
                    <select
                      value={newAccBroker}
                      onChange={(e) => setNewAccBroker(e.target.value as 'ctrader' | 'metatrader')}
                      style={{
                        width: '100%',
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="ctrader">cTrader</option>
                      <option value="metatrader">MetaTrader 5</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Account Login / ID</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 17151091"
                      value={newAccId}
                      onChange={(e) => setNewAccId(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    {newAccBroker === 'ctrader' ? 'Access Token / OAuth Token' : 'Password'}
                  </label>
                  <input
                    type="password"
                    placeholder={newAccBroker === 'ctrader' ? 'Paste oauth token' : 'Account password'}
                    value={newAccPassword}
                    onChange={(e) => setNewAccPassword(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                </div>

                {newAccBroker === 'metatrader' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Server Name (MT5 Only)</label>
                    <input
                      type="text"
                      placeholder="e.g. JustMarkets-Demo"
                      value={newAccServer}
                      onChange={(e) => setNewAccServer(e.target.value)}
                      style={{
                        width: '100%',
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginTop: '8px',
                    boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  Connect Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}

    </div>
  );
}
