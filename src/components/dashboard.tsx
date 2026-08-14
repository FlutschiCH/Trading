import React, { useEffect, useState, useRef } from 'react';
import { Activity, X, TrendingUp, TrendingDown, Clock, HelpCircle, RefreshCw, Menu, ChevronDown, Sun, Moon, Settings, ShieldAlert } from 'lucide-react';
import TVChart from './tv_chart';
import WyckoffBacktester from './wyckoff_backtester';
import HowToPage from './how_to_page';
import LiveTradesPanel from './live_trades_panel';
import LiveOverviewPanel from './live_overview_panel';
import SymbolMappingsView from './symbol_mappings_view';
import ComputerManager from './computer_manager';
import HeaderBar from './header_bar';
import LandscapeMobileOverview from './landscape_mobile_overview';
import MobileTabNav, { type MobileTab } from './mobile_tab_nav';
import { API_BASE_URL } from '../api';
import { isLocalTarget } from './ip_switcher';
import * as apiService from '../services/apiService';
import NotificationSettingsView from './notification_settings_view';
import { AlertManagerPanel } from './alert_manager_panel';
import { CandleCollectorPanel } from './candle_collector_panel';
import { CandleDetailsCard } from './candle_details_card';
import SymbolMappingCard from './symbol_mapping_card';
import Copytrader from './copytrader';
import LogPanel from './log_panel';
import type { Candle, AccountInfo, Position } from '../types/trading';
import { useCandleStore } from '../services/candleStore';
import { usePositionsStore } from '../services/positionsStore';
import { isPollingPaused } from '../services/pollingStore';



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
}; export const getWeekStart = (now: Date) => {
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

  const {
    candles,
    loading: candleStoreLoading,
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
    fetchCandles: storeFetchCandles,
  } = useCandleStore();

  const { positions, refreshPositions: storeRefreshPositions } = usePositionsStore();


  const [availableSymbols, setAvailableSymbols] = useState<string[]>([
    'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY',
    'AUDUSD', 'USDCAD', 'XAUUSD', 'US30', 'GER40'
  ]);

  // Dynamically fetch available symbols from connected broker on startup / broker switch
  useEffect(() => {
    let sourcePath = (candleSource as string) || 'ctrader';
    if (sourcePath === 'localctrader') sourcePath = 'ctrader';

    apiService.fetchMetadataSymbols(sourcePath)
      .then((res: any) => {
        if (!res) return;
        let symList: string[] = [];
        if (Array.isArray(res)) {
          symList = res.map((s: any) => (typeof s === 'string' ? s : s.symbol || s.name || s.symbolName));
        } else if (res.status === 'success' && Array.isArray(res.data)) {
          symList = res.data.map((s: any) => (typeof s === 'string' ? s : s.symbol || s.name || s.symbolName));
        } else if (Array.isArray(res.symbols)) {
          symList = res.symbols.map((s: any) => (typeof s === 'string' ? s : s.symbol || s.name || s.symbolName));
        }

        const cleanList = Array.from(new Set(symList.filter(Boolean)));
        console.log(`📈 [Broker Symbols Return] (${sourcePath}):`, cleanList);
        if (cleanList.length > 0) {
          setAvailableSymbols(cleanList);
        }
      })
      .catch((err: any) => {
        console.error(`Error fetching metadata symbols for ${sourcePath}:`, err);
      });
  }, [candleSource]);
  const [availableTimeframes, setAvailableTimeframes] = useState<string[]>([
    '1m', '5m', '15m', '30m', '1h', '4h', '1d'
  ]);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
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
  const [showLandscapeMode, setShowLandscapeMode] = useState(false);

  // Auto-detect mobile landscape orientation
  useEffect(() => {
    const checkOrientation = () => {
      const isLandscape = window.matchMedia('(orientation: landscape)').matches && window.innerHeight <= 500 && window.innerWidth <= 950;
      if (isLandscape && (window.innerWidth < 768 || ('ontouchstart' in window))) {
        setShowLandscapeMode(prev => prev ? prev : true);
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);
  const [newAccServer, setNewAccServer] = useState('');

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
  const [liveSimulatedTrades, setLiveSimulatedTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [initialCandlesLoaded, setInitialCandlesLoaded] = useState(false);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [backtestRunInfo, setBacktestRunInfo] = useState<{ current: number; total: number } | null>(null);


  const [view, setView] = useState<'dashboard' | 'mappings' | 'trades' | 'computers' | 'notifications' | 'alerts'>('dashboard');

  const [connectionMode, setConnectionMode] = useState<'openapi' | 'fix'>('fix');
  const [showMobileNav, setShowMobileNav] = useState<boolean>(false);

  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState<boolean>(false);
  const [terminalConnectionStatus, setTerminalConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTerminalConnectionStatus('connected');
  }, []);


  const [isConnectedOpenAPI] = useState(true);
  const [isConnectedFIX] = useState(true);
  const [isLiveFeed, setIsLiveFeed] = useState<boolean>(() => localStorage.getItem('wyckoff_is_live_feed') === 'true');

  useEffect(() => {
    localStorage.setItem('wyckoff_is_live_feed', isLiveFeed.toString());
  }, [isLiveFeed]);
  const [autoPollTrades, setAutoPollTrades] = useState<boolean>(() => {
    const val = localStorage.getItem('wyckoff_auto_poll_trades');
    return val === null ? true : val === 'true';
  });
  const [tradesPollInterval, setTradesPollInterval] = useState<number>(() => {
    const val = localStorage.getItem('wyckoff_trades_poll_interval');
    return val ? parseInt(val, 10) : 10;
  });
  const [showTradesSettings, setShowTradesSettings] = useState<boolean>(false);

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
  const [beOffsetMode, setBeOffsetMode] = useState<'half_r' | 'zero_be'>(() => (localStorage.getItem('wyckoff_backtest_be_offset_mode') as any) || 'half_r');
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

  const [executingModalOrder, setExecutingModalOrder] = useState(false);
  const [modalOrderResult, setModalOrderResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const [modalOrderBroker, setModalOrderBroker] = useState<string>('metatrader');
  const [modalOrderVolume, setModalOrderVolume] = useState<number>(0.01);

  useEffect(() => {
    if (selectedTrade) {
      const vol = selectedTrade.qty || selectedTrade.volume || selectedTrade.size || 0.01;
      setModalOrderVolume(Number(vol));
      setModalOrderResult(null);
    }
  }, [selectedTrade]);

  useEffect(() => {
    if (loadingBacktest) {
      const runText = backtestRunInfo && backtestRunInfo.total > 1
        ? `⏳ Run ${backtestRunInfo.current}/${backtestRunInfo.total} (${backtestProgress}%)`
        : `⏳ Running ${backtestProgress}%...`;
      document.title = runText;
    } else if (openPositions && openPositions.length > 0) {
      const totalPnl = openPositions.reduce((sum, pos) => sum + (Number(pos.unrealized_profit) || 0), 0);
      const pnlSign = totalPnl >= 0 ? '+' : '';
      document.title = `${pnlSign}$${totalPnl.toFixed(2)}`;
    } else {
      document.title = `${symbol ? `${symbol} - ` : ''}Wyckoff Trading Platform`;
    }
  }, [loadingBacktest, backtestProgress, backtestRunInfo, openPositions, symbol]);

  const handleExecuteTradeAgain = async () => {
    if (!selectedTrade) return;
    setExecutingModalOrder(true);
    setModalOrderResult(null);

    const isBuy = (selectedTrade.type || selectedTrade.side || 'BUY').toUpperCase() === 'BUY';
    const side = isBuy ? 'buy' : 'sell';

    const slVal = selectedTrade.slPrice ?? selectedTrade.sl ?? selectedTrade.stopLoss;
    const tpVal = selectedTrade.tpPrice ?? selectedTrade.tp ?? selectedTrade.takeProfit;

    const payload: any = {
      broker: modalOrderBroker,
      symbol: symbol,
      side: side,
      order_type: side,
      volume: modalOrderVolume,
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
        setModalOrderResult({ status: 'error', message: data.message || 'Execution failed' });
      } else {
        setModalOrderResult({ status: 'success', message: `Order executed! Ticket/ID: ${data.order_id || data.ticket || data.position_id || 'Success'}` });
        fetchCandles(candleSource, false, true);
      }
    } catch (err: any) {
      setModalOrderResult({ status: 'error', message: err.message || 'Network error' });
    } finally {
      setExecutingModalOrder(false);
    }
  };
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
        if (!parsed.includes('symbol_mapping')) {
          parsed.push('symbol_mapping');
        }
        return parsed;
      }
    } catch { }
    return ['chart', 'backtester', 'trades', 'live_overview', 'symbol_mapping'];
  });
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Responsive mobile states
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<MobileTab>('chart');
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRestartServer = async () => {
    if (!window.confirm("Are you sure you want to update and restart the backend server on the Laptop?")) return;
    try {
      const laptopUrl = 'https://flugrok-production.up.railway.app';
      await fetch(`${laptopUrl}/api/system/restart`, {
        method: 'POST'
      });
    } catch (e) {
      console.error("Error sending restart command:", e);
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
      globalRangeMode: localStorage.getItem('wyckoff_backtester_global_range_mode') === 'true',
      rrRangeMode: localStorage.getItem('wyckoff_backtester_rr_range_mode') === 'true',
      rrStart: rrStart || localStorage.getItem('wyckoff_backtester_rr_start'),
      rrEnd: rrEnd || localStorage.getItem('wyckoff_backtester_rr_end'),
      rrStep: rrStep || localStorage.getItem('wyckoff_backtester_rr_step'),
      slRangeMode: localStorage.getItem('wyckoff_backtester_sl_range_mode') === 'true',
      slStart: localStorage.getItem('wyckoff_backtester_sl_start'),
      slEnd: localStorage.getItem('wyckoff_backtester_sl_end'),
      slStep: localStorage.getItem('wyckoff_backtester_sl_step'),
      beRangeMode: localStorage.getItem('wyckoff_backtester_be_range_mode') === 'true',
      beStart: localStorage.getItem('wyckoff_backtester_be_start'),
      beEnd: localStorage.getItem('wyckoff_backtester_be_end'),
      beStep: localStorage.getItem('wyckoff_backtester_be_step'),
      beOffsetRangeMode: localStorage.getItem('wyckoff_backtester_be_offset_range_mode') === 'true',
      beOffsetStart: localStorage.getItem('wyckoff_backtester_be_offset_start'),
      beOffsetEnd: localStorage.getItem('wyckoff_backtester_be_offset_end'),
      beOffsetStep: localStorage.getItem('wyckoff_backtester_be_offset_step'),
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
      localStorage.setItem('wyckoff_backtest_use_break_even', String(settings.useBreakEven));
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
    if (settings.rrRangeMode !== undefined) {
      localStorage.setItem('wyckoff_backtester_rr_range_mode', String(settings.rrRangeMode));
    }
    if (settings.rrStart !== undefined) {
      setRRStart(settings.rrStart);
      localStorage.setItem('wyckoff_rr_start', settings.rrStart);
      localStorage.setItem('wyckoff_backtester_rr_start', String(settings.rrStart));
    }
    if (settings.rrEnd !== undefined) {
      setRREnd(settings.rrEnd);
      localStorage.setItem('wyckoff_rr_end', settings.rrEnd);
      localStorage.setItem('wyckoff_backtester_rr_end', String(settings.rrEnd));
    }
    if (settings.rrStep !== undefined) {
      setRRStep(settings.rrStep);
      localStorage.setItem('wyckoff_rr_step', settings.rrStep);
      localStorage.setItem('wyckoff_backtester_rr_step', String(settings.rrStep));
    }
    if (settings.slRangeMode !== undefined) {
      localStorage.setItem('wyckoff_backtester_sl_range_mode', String(settings.slRangeMode));
    }
    if (settings.slStart !== undefined) {
      localStorage.setItem('wyckoff_backtester_sl_start', String(settings.slStart));
    }
    if (settings.slEnd !== undefined) {
      localStorage.setItem('wyckoff_backtester_sl_end', String(settings.slEnd));
    }
    if (settings.slStep !== undefined) {
      localStorage.setItem('wyckoff_backtester_sl_step', String(settings.slStep));
    }
    if (settings.beRangeMode !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_range_mode', String(settings.beRangeMode));
    }
    if (settings.beStart !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_start', String(settings.beStart));
    }
    if (settings.beEnd !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_end', String(settings.beEnd));
    }
    if (settings.globalRangeMode !== undefined) {
      localStorage.setItem('wyckoff_backtester_global_range_mode', String(settings.globalRangeMode));
    }
    if (settings.beOffsetStep !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_offset_step', String(settings.beOffsetStep));
    }
    if (settings.beOffsetRangeMode !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_offset_range_mode', String(settings.beOffsetRangeMode));
    }
    if (settings.beOffsetStart !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_offset_start', String(settings.beOffsetStart));
    }
    if (settings.beOffsetEnd !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_offset_end', String(settings.beOffsetEnd));
    }
    if (settings.beOffsetStep !== undefined) {
      localStorage.setItem('wyckoff_backtester_be_offset_step', String(settings.beOffsetStep));
    }
    window.dispatchEvent(new CustomEvent('wyckoff_settings_loaded', { detail: settings }));
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

  useEffect(() => {
    if (selectedStrategyId) {
      setActiveStrategyId(selectedStrategyId);
    } else {
      setActiveStrategyId(null);
    }
  }, [selectedStrategyId, setActiveStrategyId]);


  const lastNotifiedSignalRef = useRef<number>(0);
  const backtestAbortControllerRef = useRef<AbortController | null>(null);
  const activeBacktestIdRef = useRef<string | null>(null);

  const cancelBacktest = () => {
    if (activeBacktestIdRef.current) {
      apiService.cancelBacktest(activeBacktestIdRef.current)
        .catch(err => console.error("Failed to send cancel request to backend:", err));
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
  const [cardHeights, setCardHeights] = useState<{ [key: string]: number }>(() => {
    const saved = localStorage.getItem('wyckoff_desk_card_heights');
    return saved ? JSON.parse(saved) : {};
  });
  const [activeResize, setActiveResize] = useState<{
    id: string;
    direction: 'horizontal' | 'vertical';
    startPos: number;
    startSize: number;
  } | null>(null);

  const handleResizeMouseDown = (e: React.MouseEvent, id: string, direction: 'horizontal' | 'vertical', currentSize: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveResize({
      id,
      direction,
      startPos: direction === 'horizontal' ? e.clientX : e.clientY,
      startSize: currentSize,
    });
  };

  useEffect(() => {
    if (!activeResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (activeResize.direction === 'horizontal') {
        const dx = e.clientX - activeResize.startPos;
        const newWidth = Math.max(280, activeResize.startSize + dx);
        setCardWidths(prev => {
          const next = {
            ...prev,
            [activeResize.id]: newWidth,
          };
          localStorage.setItem('wyckoff_desk_card_widths', JSON.stringify(next));
          return next;
        });
      } else {
        const dy = e.clientY - activeResize.startPos;
        const newHeight = Math.min(800, Math.max(200, activeResize.startSize + dy));
        setCardHeights(prev => {
          const next = {
            ...prev,
            [activeResize.id]: newHeight,
          };
          localStorage.setItem('wyckoff_desk_card_heights', JSON.stringify(next));
          return next;
        });
      }
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
    <>
      {/* Right border width resize handle */}
      <div
        onMouseDown={(e) => {
          const rect = e.currentTarget.parentElement?.getBoundingClientRect();
          const currentWidth = rect ? rect.width : 400;
          handleResizeMouseDown(e, id, 'horizontal', currentWidth);
        }}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '6px',
          height: '100%',
          cursor: 'col-resize',
          backgroundColor: activeResize?.id === id && activeResize?.direction === 'horizontal' ? '#3b82f6' : 'transparent',
          transition: 'background-color 0.2s',
          zIndex: 100,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
        }}
        onMouseLeave={(e) => {
          if (!(activeResize?.id === id && activeResize?.direction === 'horizontal')) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      />
      {/* Bottom border height resize handle */}
      <div
        onMouseDown={(e) => {
          const rect = e.currentTarget.parentElement?.getBoundingClientRect();
          const currentHeight = rect ? rect.height : 400;
          handleResizeMouseDown(e, id, 'vertical', currentHeight);
        }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '6px',
          cursor: 'row-resize',
          backgroundColor: activeResize?.id === id && activeResize?.direction === 'vertical' ? '#3b82f6' : 'transparent',
          transition: 'background-color 0.2s',
          zIndex: 100,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
        }}
        onMouseLeave={(e) => {
          if (!(activeResize?.id === id && activeResize?.direction === 'vertical')) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      />
    </>
  );

  const runBacktest = async (rangeParams?: any) => {
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
          account_id: getSelectedAccountId(),
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
          beOffsetMode,
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
          ...bounds,
          ...(rangeParams || {})
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

  const runOptimization = async (rangeParams?: any) => {
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
      setBacktestRunInfo(null);
      setOptimizationResults(null);
      const bounds = calculateDateBounds(dateRangeOption, customFrom, customTo);
      console.log(`[Optimization] Sending request to ${API_BASE_URL}/api/backtest/optimize...`);
      const response = await fetch(`${API_BASE_URL}/api/backtest/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          account_id: getSelectedAccountId(),
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
          beOffsetMode,
          lookbackWindow: parseInt(lookbackWindow) || 20,
          feesPercent: parseFloat(backtestFees) || 0.0,
          dailyRetryLimit: parseInt(dailyRetryLimit) || 0,
          allowOppositeClose,
          backtestId,
          rrStart: parseFloat(rrStart) || 1.0,
          rrEnd: parseFloat(rrEnd) || 5.0,
          rrStep: parseFloat(rrStep) || 0.5,
          beOffsetRangeMode: rangeParams?.beOffsetRangeMode ?? false,
          beOffsetStart: rangeParams?.beOffsetStart !== undefined ? parseFloat(rangeParams.beOffsetStart) : undefined,
          beOffsetEnd: rangeParams?.beOffsetEnd !== undefined ? parseFloat(rangeParams.beOffsetEnd) : undefined,
          beOffsetStep: rangeParams?.beOffsetStep !== undefined ? parseFloat(rangeParams.beOffsetStep) : undefined,
          enabledIndicators,
          timezone: sessionsTimezone,
          sessions: tradingSessions,
          useGlobalClose,
          globalCloseTime,
          entryStabilityRule,
          ...bounds,
          ...(rangeParams || {})
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Optimization Error] Server returned HTTP ${response.status}:`, errText);
        alert(`Optimization HTTP Error (${response.status}): ${errText}`);
        throw new Error(`Server returned status ${response.status}: ${errText}`);
      }

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
                if (parsed.currentRun !== undefined && parsed.totalRuns !== undefined) {
                  setBacktestRunInfo({ current: parsed.currentRun, total: parsed.totalRuns });
                }
                if (parsed.status === 'success' && parsed.data) {
                  const resData = parsed.data;
                  if (resData.results) {
                    setOptimizationResults(resData.results);
                    console.log(`[Optimization Complete] Finished ${resData.results.length} backtests successfully.`);
                  }
                } else if (parsed.status === 'error') {
                  console.error("[Optimization Stream Error]", parsed.message);
                  alert(`Optimization Error: ${parsed.message}`);
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
        alert(`Optimization Failed: ${e.message || 'Network/Server Error'}`);
      }
    } finally {
      console.timeEnd("Backtest execution duration");
      if (backtestAbortControllerRef.current === controller) {
        backtestAbortControllerRef.current = null;
        setLoadingBacktest(false);
      }
    }
  };

  const loadSpecificResults = async (broker: string, symbol: string, timeframe: string, sl: string, rr: string, be: string) => {
    try {
      const url = `${API_BASE_URL}/api/backtest/results?broker=${broker.toLowerCase()}&symbol=${symbol.toUpperCase()}&timeframe=${timeframe}&sl=${sl}&rr=${rr}&be=${be}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setBacktestResults(json.data);
        setFvgs(json.data.fvgs || []);
        if (json.data.trades && json.data.trades.length > 0) {
          setSelectedTrade(json.data.trades[0]);
        } else {
          setSelectedTrade(null);
        }
      }
    } catch (err) {
      console.error("Failed to load specific results", err);
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
      const result = await apiService.deployLiveStrategy({
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
        beOffsetMode,
        lookbackWindow: parseInt(lookbackWindow) || 20,
        status: 'active',
        timezone: sessionsTimezone,
        sessions: tradingSessions,
        useGlobalClose,
        globalCloseTime,
        entryStabilityRule,
        broker: targetBroker,
        target_computer: targetComputer,
        targets: targets,
        initialBalance: parseFloat(backtestBalance) || 10000.0,
        dateRangeOption,
        customFrom,
        customTo,
        candleLimit: candleLimit || 1000,
      });
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
    localStorage.setItem('wyckoff_backtest_be_offset_mode', beOffsetMode);
  }, [backtestBE, beOffsetMode]);

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
      const sourcePath = candleSource === 'metatrader' ? 'metatrader' : 'ctrader';
      try {
        const symData = await apiService.fetchMetadataSymbols(sourcePath);
        if (symData.status === 'success' && symData.data) {
          setAvailableSymbols(symData.data);
          const savedSymbol = localStorage.getItem('wyckoff_symbol');
          const targetSym = savedSymbol || symbol;
          const matchedSym = symData.data.find((s: string) => s.toLowerCase() === targetSym.toLowerCase());
          if (matchedSym) {
            setSymbol(matchedSym);
          } else if (savedSymbol) {
            setSymbol(savedSymbol);
          }
        }
      } catch (e) {
        console.error('Failed to load symbols:', e);
      }

      try {
        const tfData = await apiService.fetchMetadataTimeframes(sourcePath);
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
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      fetchFavourites();
      try {
        const data = await apiService.fetchLiveStrategies();
        if (data.status === 'success' && Array.isArray(data.strategies)) {
          setLiveStrategies(data.strategies);
        }
      } catch (err) {
        console.error("Failed to fetch live strategies on startup:", err);
      }
    };
    loadLiveStrategyAndPerms();

    const handleTargetChange = async () => {
      console.log('🔄 [IPSwitcher] Target API switched. Refreshing dashboard data without page reload...');
      fetchAccounts();
      fetchActiveAccount();
      fetchAccountData();
      fetchPositionData();
      fetchHistoryTrades();
      fetchFavourites();
      try {
        const data = await apiService.fetchLiveStrategies();
        if (data && data.status === 'success' && Array.isArray(data.strategies)) {
          setLiveStrategies(data.strategies);
        }
      } catch (err) {
        console.error("Failed to fetch live strategies on target switch:", err);
      }
      fetchCandles(candleSource, false, true);
    };

    window.addEventListener('api_target_changed', handleTargetChange);
    return () => {
      window.removeEventListener('api_target_changed', handleTargetChange);
    };
  }, [candleSource]);

  const isValidAcc = (id: any) => {
    if (!id) return false;
    const str = String(id).trim().toLowerCase();
    return str !== '' && str !== 'none' && str !== 'null' && str !== 'undefined';
  };

  const getSelectedAccountId = () => {
    const savedId = localStorage.getItem('broker_account') || localStorage.getItem('wyckoff_active_account_id');
    if (isValidAcc(savedId)) {
      return savedId;
    }
    if (activeAccount && isValidAcc(activeAccount.account_id)) {
      return activeAccount.account_id;
    }
    try {
      const saved = localStorage.getItem('wyckoff_active_account');
      if (saved) {
        const parsed = JSON.parse(saved);
        const candidate = parsed?.account_id || parsed?.id;
        if (isValidAcc(candidate)) {
          return candidate;
        }
      }
    } catch (e) { }
    return undefined;
  };

  // Unified API endpoints
  const fetchAccountData = async (overrideBroker?: string, overrideAccId?: string) => {
    if (isPollingPaused()) return;
    const accId = overrideAccId || getSelectedAccountId();
    if (!isValidAcc(accId)) return;
    const broker = overrideBroker || candleSource;
    try {
      const response = await fetch(`${API_BASE_URL}/api/trade/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: broker, account_id: accId })
      });
      const result = await response.json();
      if (result.status === 'success') {
        setAccountInfo(result.data);
      }
    } catch (error) {
    }
  };

  const fetchPositionData = async (overrideBroker?: string, overrideAccId?: string) => {
    return storeRefreshPositions(overrideBroker, overrideAccId);
  };

  const fetchHistoryTrades = async (overrideBroker?: string, overrideAccId?: string) => {
    const accId = overrideAccId || getSelectedAccountId();
    if (!isValidAcc(accId)) return;
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trade/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: overrideBroker || candleSource, account_id: accId })
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
        localStorage.setItem('broker_account', data.data.account_id);
        localStorage.setItem('wyckoff_active_account', JSON.stringify(data.data));
        localStorage.setItem('wyckoff_active_account_id', data.data.account_id);
        return data.data;
      } else {
        setActiveAccount(null);
        localStorage.removeItem('broker_account');
        localStorage.removeItem('wyckoff_active_account');
        localStorage.removeItem('wyckoff_active_account_id');
        return null;
      }
    } catch (e) {
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
        const switchedAccId = newActive ? newActive.account_id : accountId;
        if (newActive) {
          localStorage.setItem('broker_account', newActive.account_id);
          localStorage.setItem('wyckoff_active_account', JSON.stringify(newActive));
          localStorage.setItem('wyckoff_active_account_id', newActive.account_id);
          if (newActive.broker_type && (newActive.broker_type === 'metatrader' || newActive.broker_type === 'ctrader')) {
            setCandleSource(newActive.broker_type);
          }
        }
        const broker = newActive ? newActive.broker_type : 'metatrader';
        window.dispatchEvent(new CustomEvent('api_target_changed'));
        fetchCandles(broker);
        fetchAccountData(broker, switchedAccId);
        fetchPositionData(broker, switchedAccId);
        fetchHistoryTrades(broker, switchedAccId);
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
      const result = await apiService.fetchFavouritesList();
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
      const result = await apiService.saveFavourite({
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
      });
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
      const result = await apiService.deleteFavourite({ id: favId });
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
      const result = await apiService.updateFavouriteNotes({ id: favId, notes });
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

  const fetchCandles = (overrideBroker?: string, isBackground: boolean = false, forceFullRefresh: boolean = false) => {
    return storeFetchCandles(forceFullRefresh, isBackground);
  };

  // Save autoPollTrades & tradesPollInterval to localStorage
  useEffect(() => {
    localStorage.setItem('wyckoff_auto_poll_trades', autoPollTrades.toString());
  }, [autoPollTrades]);

  useEffect(() => {
    localStorage.setItem('wyckoff_trades_poll_interval', tradesPollInterval.toString());
  }, [tradesPollInterval]);

  // Fetch account data on initial load and setup interval polling when autoPollTrades is enabled.
  useEffect(() => {
    fetchAccountData();

    if (!autoPollTrades) return;

    // Minimum 15 second polling interval to prevent server overload
    const ms = Math.max(15, tradesPollInterval) * 1000;
    const interval = setInterval(() => {
      fetchAccountData();
    }, ms);

    return () => clearInterval(interval);
  }, [candleSource, autoPollTrades, tradesPollInterval]);

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
      position: 'sticky' as const,
      top: 0,
      zIndex: 100,
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
      padding: '4px 8px',
      color: 'var(--app-input-text)',
      outline: 'none',
      fontSize: '12px',
      maxWidth: '180px',
      width: '100%',
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
      <HeaderBar
        isMobile={isMobile}
        theme={theme}
        toggleTheme={toggleTheme}
        connectionMode={connectionMode}
        currentConnected={currentConnected}
        activeAccount={activeAccount}
        accountInfo={accountInfo}
        accounts={accounts}
        handleSwitchAccount={handleSwitchAccount}
        setShowAccountModal={setShowAccountModal}
        handleRestartServer={handleRestartServer}
        setView={(v: string) => setView(v as any)}
        styles={styles}
        onToggleLandscape={() => setShowLandscapeMode(true)}
      />

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
      ) : view === 'notifications' ? (
        <NotificationSettingsView
          setView={setView}
        />
      ) : view === 'alerts' ? (
        <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
          <AlertManagerPanel currentSymbol={symbol} />
        </div>
      ) : (
        <>
          {/* Main Grid View */}
          <main style={styles.mainLayout}>
            {/* Selected Candle Details Inspector Component */}
            <CandleDetailsCard
              selectedCandle={selectedCandle}
              candles={backtestResults?.candles || candles}
              symbol={symbol}
              timeframe={timeframe}
              entryStabilityRule={entryStabilityRule}
              sessionsTimezone={sessionsTimezone}
              tradingSessions={tradingSessions}
              onClose={() => setSelectedCandle(null)}
              formatPrice={formatPrice}
              formatDateTime={formatDateTime}
            />

            {isMobile && (
              <MobileTabNav
                activeTab={mobileTab}
                onTabChange={setMobileTab}
                onToggleLandscape={() => setShowLandscapeMode(true)}
              />
            )}

            {showLandscapeMode && (
              <LandscapeMobileOverview
                onClose={() => setShowLandscapeMode(false)}
                positions={openPositions}
                accountInfo={accountInfo}
                currentSymbol={symbol}
                currentPrice={candles.length > 0 ? candles[candles.length - 1].close : 0}
                onClosePosition={handleClosePosition}
              />
            )}

            {isMobile ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {mobileTab === 'chart' ? (
                  <div style={{
                    width: '100%',
                    backgroundColor: 'var(--app-card-bg)',
                    border: '1px solid var(--app-card-border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: 'var(--app-panel-header-bg)',
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--app-card-border)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'var(--app-text)',
                    }}>
                      <span>📊 Candlestick & Weis Wave Analysis Chart</span>
                    </div>
                    <TVChart
                      theme={theme}
                      symbol={symbol}
                      openPositions={openPositions}
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
                      onRefresh={(broker, isBg) => fetchCandles(broker, isBg, true)}
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
                      isMobile={true}
                    />
                  </div>
                ) : mobileTab === 'backtester' ? (
                  <div style={{
                    width: '100%',
                    backgroundColor: 'var(--app-card-bg)',
                    border: '1px solid var(--app-card-border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: 'var(--app-panel-header-bg)',
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--app-card-border)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'var(--app-text)',
                    }}>
                      <span>⚙️ Wyckoff Backtester</span>
                    </div>
                    <div style={{ padding: '16px', overflowY: 'auto' }}>
                      <WyckoffBacktester
                        isReadOnly={isProdHost && !isAuthenticated}
                        availableSymbols={availableSymbols}
                        availableTimeframes={availableTimeframes}
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
                        beOffsetMode={beOffsetMode}
                        setBeOffsetMode={setBeOffsetMode as any}
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
                        backtestRunInfo={backtestRunInfo}

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
                        onLoadSpecificResults={loadSpecificResults}
                      />
                    </div>
                  </div>
                ) : mobileTab === 'trades' ? (
                  <div style={{
                    width: '100%',
                    backgroundColor: 'var(--app-card-bg)',
                    border: '1px solid var(--app-card-border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: 'var(--app-panel-header-bg)',
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--app-card-border)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'var(--app-text)',
                    }}>
                      <span>📈 Live Trades & P&L</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowTradesSettings(!showTradesSettings);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s',
                          }}
                          title="Trades Panel Settings"
                        >
                          <Settings size={14} />
                        </button>
                        {showTradesSettings && (
                          <>
                            <div
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowTradesSettings(false);
                              }}
                              style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                zIndex: 999
                              }}
                            />
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
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
                                minWidth: '170px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                              }}
                            >
                              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#9ca3af', borderBottom: '1px solid #1f2937', paddingBottom: '6px', marginBottom: '4px', textAlign: 'left' }}>
                                Trades Configuration
                              </div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#ffffff', userSelect: 'none' }}>
                                <input
                                  type="checkbox"
                                  checked={autoPollTrades}
                                  onChange={(e) => setAutoPollTrades(e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                />
                                🔄 Live Auto-Polling
                              </label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
                                <span>Interval (s):</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="300"
                                  value={tradesPollInterval}
                                  onChange={(e) => setTradesPollInterval(Math.max(1, parseInt(e.target.value) || 1))}
                                  style={{
                                    width: '50px',
                                    backgroundColor: '#1e293b',
                                    border: '1px solid #334155',
                                    borderRadius: '4px',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    padding: '2px 4px',
                                    outline: 'none',
                                  }}
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '16px', overflowY: 'auto' }}>
                      <LiveTradesPanel
                        dailyPnl={dailyPnl}
                        weeklyPnl={weeklyPnl}
                        openPositions={openPositions}
                        handleClosePosition={handleClosePosition}
                        isMobileLayout={true}
                      />
                    </div>
                  </div>
                ) : mobileTab === 'live_overview' ? (
                  <div style={{
                    width: '100%',
                    backgroundColor: 'var(--app-card-bg)',
                    border: '1px solid var(--app-card-border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: 'var(--app-panel-header-bg)',
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--app-card-border)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: 'var(--app-text)',
                    }}>
                      <span>⚡ Live Strategies Overview</span>
                    </div>
                    <div style={{ padding: '16px', overflowY: 'auto' }}>
                      <LiveOverviewPanel
                        isMobileLayout={true}
                        selectedStrategyId={selectedStrategyId}
                        isLiveFeed={isLiveFeed}
                        onSelectStrategy={(id) => {
                          setSelectedStrategyId(id);
                          localStorage.setItem('wyckoff_selected_live_strategy_id', id);
                          setIsLiveFeed(true);
                          localStorage.setItem('wyckoff_is_live_feed', 'true');
                          setMobileTab('chart');
                          setTimeout(() => fetchCandles(), 50);
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{
                    width: '100%',
                    height: '500px',
                    backgroundColor: 'var(--app-card-bg)',
                    border: '1px solid var(--app-card-border)',
                    borderRadius: '12px',
                    overflow: 'hidden'
                  }}>
                    <LogPanel isMobileLayout={true} />
                  </div>
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
                    height: cardHeights[panelId] ? `${cardHeights[panelId]}px` : undefined,
                    maxHeight: panelId === 'backtester' ? 'none' : '800px',
                    display: 'flex',

                    flexDirection: 'column' as const,
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
                    flex: 1,
                    overflowY: 'auto' as const,
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
                        <div className="no-drag" style={{ padding: '0px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <TVChart
                            theme={theme}
                            symbol={symbol}
                            openPositions={openPositions}
                            onSymbolChange={setSymbol}
                            timeframe={timeframe}
                            onTimeframeChange={setTimeframe}
                            candleSource={candleSource}
                            onCandleSourceChange={setCandleSource}
                            availableSymbols={availableSymbols}
                            availableTimeframes={availableTimeframes}
                            candles={(() => {
                              const btCandles = backtestResults?.candles || [];
                              if (!isLiveFeed || btCandles.length === 0) return isLiveFeed ? candles : (btCandles.length > 0 ? btCandles : candles);
                              const mergedMap = new Map<number, Candle>();
                              btCandles.forEach((c: Candle) => mergedMap.set(c.time, c));
                              candles.forEach((c: Candle) => mergedMap.set(c.time, c));
                              return Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
                            })()}
                            loading={loading}
                            loadingStrategy={loadingStrategy}
                            onRefresh={(broker, isBg) => fetchCandles(broker, isBg, true)}
                            entryPrice={selectedTrade?.entryPrice}
                            slPrice={selectedTrade?.slPrice}
                            tpPrice={selectedTrade?.tpPrice}
                            trades={(() => {
                              const btTrades = backtestResults?.trades || [];
                              const liveList = liveSimulatedTrades.length > 0 ? liveSimulatedTrades : liveTrades;
                              if (!isLiveFeed) return btTrades.length > 0 ? btTrades : liveList;
                              if (btTrades.length === 0) return liveList;
                              if (liveList.length === 0) return btTrades;
                              const combined = [...btTrades];
                              liveList.forEach((lt: any) => {
                                const exists = combined.some((bt: any) =>
                                  (lt.id && bt.id && lt.id === bt.id) ||
                                  (lt.entryTimestamp && bt.entryTimestamp && lt.entryTimestamp === bt.entryTimestamp && lt.symbol === bt.symbol)
                                );
                                if (!exists) combined.push(lt);
                              });
                              return combined;
                            })()}
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
                        style={{
                          ...dragStyles,
                          maxWidth: cardWidths['backtester'] ? undefined : '480px'
                        }}
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
                            availableSymbols={availableSymbols}
                            availableTimeframes={availableTimeframes}
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
                            beOffsetMode={beOffsetMode}
                            setBeOffsetMode={setBeOffsetMode as any}
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
                            onLoadSpecificResults={loadSpecificResults}
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
                            <span>📈 Live Trades & P&L</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setShowTradesSettings(!showTradesSettings);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#9ca3af',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  transition: 'background-color 0.2s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--app-hover-bg)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                title="Trades Panel Settings"
                              >
                                <Settings size={14} />
                              </button>
                              {showTradesSettings && (
                                <>
                                  <div
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setShowTradesSettings(false);
                                    }}
                                    style={{
                                      position: 'fixed',
                                      top: 0,
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      zIndex: 999
                                    }}
                                  />
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
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
                                      minWidth: '170px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '8px',
                                    }}
                                  >
                                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#9ca3af', borderBottom: '1px solid #1f2937', paddingBottom: '6px', marginBottom: '4px', textAlign: 'left' }}>
                                      Trades Configuration
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#ffffff', userSelect: 'none' }}>
                                      <input
                                        type="checkbox"
                                        checked={autoPollTrades}
                                        onChange={(e) => setAutoPollTrades(e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                      />
                                      🔄 Live Auto-Polling
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
                                      <span>Interval (s):</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max="300"
                                        value={tradesPollInterval}
                                        onChange={(e) => setTradesPollInterval(Math.max(1, parseInt(e.target.value) || 1))}
                                        style={{
                                          width: '50px',
                                          backgroundColor: '#1e293b',
                                          border: '1px solid #334155',
                                          borderRadius: '4px',
                                          color: '#ffffff',
                                          fontSize: '11px',
                                          padding: '2px 4px',
                                          outline: 'none',
                                        }}
                                      />
                                    </div>
                                  </div>
                                </>
                              )}
                              <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header</span>
                            </div>
                          </div>
                        </div>
                        <div className="no-drag" style={contentStyle}>
                          <LiveTradesPanel
                            dailyPnl={dailyPnl}
                            weeklyPnl={weeklyPnl}
                            openPositions={openPositions}
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

                  if (panelId === 'symbol_mapping') {
                    return (
                      <div
                        key="symbol_mapping"
                        onDragOver={(e) => handleDragOver(e, 'symbol_mapping')}
                        onDrop={(e) => handleDrop(e, 'symbol_mapping')}
                        style={dragStyles}
                      >
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, 'symbol_mapping')}
                          style={headerStyle}
                        >
                          <span>🔗 Symbol Mappings Manager</span>
                          <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                        </div>
                        <div className="no-drag" style={contentStyle}>
                          <SymbolMappingCard isReadOnly={isProdHost && !isAuthenticated} />
                        </div>
                        {renderResizeHandle('symbol_mapping')}
                      </div>
                    );
                  }

                  if (panelId === 'copytrader') {
                    return (
                      <div
                        key="copytrader"
                        onDragOver={(e) => handleDragOver(e, 'copytrader')}
                        onDrop={(e) => handleDrop(e, 'copytrader')}
                        style={dragStyles}
                      >
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, 'copytrader')}
                          style={headerStyle}
                        >
                          <span>🔄 Master / Slave Copytrader Manager</span>
                          <span style={{ fontSize: '10px', color: '#9ca3af' }}>⋮ Drag Header to Move</span>
                        </div>
                        <div className="no-drag" style={contentStyle}>
                          <Copytrader />
                        </div>
                        {renderResizeHandle('copytrader')}
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            )}
            <div style={{ marginTop: '24px' }}>
              <Copytrader />
            </div>
            {/* Interactive Realtime Log Panel */}
            {showTerminal && (
              <div style={{
                width: '100%',
                height: '420px',
                marginTop: '24px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
              }}>
                <LogPanel />
              </div>
            )}

            {/* 1M Candle Collector Panel */}
            <CandleCollectorPanel availableSymbols={availableSymbols} />

          </main>



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
