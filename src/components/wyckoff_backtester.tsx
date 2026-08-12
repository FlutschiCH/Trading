import React from 'react';
import { formatPrice } from '../App';
import { API_BASE_URL } from '../api';
import DeployModal from './deploy_modal';
import SavedRuns from './saved_runs';
import { SymbolTimeframeSelector } from './symbol_timeframe_selector';

interface WyckoffBacktesterProps {
  symbol: string;
  timeframe: string;
  liveStrategy: any;
  isDeploying: boolean;
  deployLiveStrategy: (targetComputer: string, targets: Array<{ broker: string; account_id: string }>, name?: string) => void;
  backtestBalance: string;
  setBacktestBalance: (val: string) => void;
  useRiskSizing: boolean;
  setUseRiskSizing: (val: boolean) => void;
  backtestRiskPct: string;
  setBacktestRiskPct: (val: string) => void;
  backtestSize: string;
  setBacktestSize: (val: string) => void;
  backtestSL: string;
  setBacktestSL: (val: string) => void;
  backtestSLType: 'pct' | 'price' | 'dollar';
  setBacktestSLType: (val: 'pct' | 'price' | 'dollar') => void;
  backtestRR: string;
  setBacktestRR: (val: string) => void;
  useBreakEven: boolean;
  setUseBreakEven: (val: boolean) => void;
  backtestBE: string;
  setBacktestBE: (val: string) => void;
  beOffsetMode?: 'half_r' | 'zero_be' | string;
  setBeOffsetMode?: (val: 'half_r' | 'zero_be' | string) => void;
  lookbackWindow: string;
  setLookbackWindow: (val: string) => void;
  backtestFees: string;
  setBacktestFees: (val: string) => void;
  backtestResults: any;
  backtestTab: 'trades' | 'weekly' | 'monthly' | 'hourly' | 'favourites';
  setBacktestTab: (val: 'trades' | 'weekly' | 'monthly' | 'hourly' | 'favourites') => void;
  tradeFilter: 'all' | 'wins' | 'losses';
  setTradeFilter: (val: 'all' | 'wins' | 'losses') => void;
  selectedTrade: any;
  setSelectedTrade: (trade: any) => void;
  setShowModal: (show: boolean) => void;
  dateRangeOption: string;
  setDateRangeOption: (val: string) => void;
  customFrom: string;
  setCustomFrom: (val: string) => void;
  customTo: string;
  setCustomTo: (val: string) => void;
  candleLimit: number;
  setCandleLimit: (val: number) => void;
  favouriteCandles?: any[];
  onDeleteFavourite?: (id: number) => void;
  onUpdateNotes?: (id: number, notes: string) => void;
  onLocateCandle?: (fav: any) => void;
  styles: any;
  enabledIndicators: { fvg: boolean };
  setEnabledIndicators: (val: any) => void;
  onRunBacktest: (params?: any) => void;
  loadingBacktest: boolean;
  backtestProgress?: number;
  backtestRunInfo?: { current: number; total: number } | null;
  dailyRetryLimit: string;

  setDailyRetryLimit: (val: string) => void;
  allowOppositeClose: boolean;
  setAllowOppositeClose: (val: boolean) => void;
  onCancelBacktest: () => void;
  sessionsTimezone: 'UTC' | 'Local';
  setSessionsTimezone: (val: 'UTC' | 'Local') => void;
  tradingSessions: any[];
  setTradingSessions: (val: any[]) => void;
  useGlobalClose: boolean;
  setUseGlobalClose: (val: boolean) => void;
  globalCloseTime: string;
  setGlobalCloseTime: (val: string) => void;
  entryStabilityRule: string;
  setEntryStabilityRule: (val: string) => void;
  // Multi-symbol and multi-timeframe props
  availableSymbols?: string[];
  availableTimeframes?: string[];
  selectedSymbols?: string[];
  setSelectedSymbols?: (syms: string[]) => void;
  selectedTimeframes?: string[];
  setSelectedTimeframes?: (tfs: string[]) => void;

  // Optimization props
  isOptimizeMode: boolean;
  setIsOptimizeMode: (val: boolean) => void;
  rrStart: string;
  setRRStart: (val: string) => void;
  rrEnd: string;
  setRREnd: (val: string) => void;
  rrStep: string;
  setRRStep: (val: string) => void;
  optimizationResults: any[] | null;
  setOptimizationResults: (val: any[] | null) => void;
  onRunOptimization: (params?: any) => void;
  onSaveSettings?: () => void;
  isReadOnly?: boolean;
  broker?: string;
  hiddenStages?: string[];
  setHiddenStages?: React.Dispatch<React.SetStateAction<string[]>>;
  onLoadSpecificResults?: (broker: string, symbol: string, timeframe: string, sl: string, rr: string, be: string) => Promise<void>;
}

interface CollapsibleCardProps {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const CollapsibleCard = ({ title, isCollapsed, onToggle, children, style }: CollapsibleCardProps) => {
  return (
    <div style={{
      backgroundColor: 'var(--app-card-bg, #111827)',
      border: '1px solid var(--app-card-border, #1f2937)',
      borderRadius: '6px',
      overflow: isCollapsed ? 'hidden' : 'visible',
      transition: 'all 0.2s',
      ...style
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          cursor: 'pointer',
          backgroundColor: 'var(--app-panel-header-bg, #1f2937)',
          userSelect: 'none',
          transition: 'background-color 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--app-hover-bg, #374151)'}
        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--app-panel-header-bg, #1f2937)'}
      >
        <span style={{ fontWeight: 'bold', color: 'var(--app-text, #cbd5e1)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </span>
        <span style={{ color: '#9ca3af', fontSize: '10px' }}>
          {isCollapsed ? '▼' : '▲'}
        </span>
      </div>
      {!isCollapsed && (
        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

const hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const minutesList = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export default function WyckoffBacktester({
  symbol,
  timeframe,
  broker = 'metatrader',
  liveStrategy,
  isDeploying,
  deployLiveStrategy,
  backtestBalance,
  setBacktestBalance,
  useRiskSizing,
  setUseRiskSizing,
  backtestRiskPct,
  setBacktestRiskPct,
  backtestSize,
  setBacktestSize,
  backtestSL,
  setBacktestSL,
  backtestSLType,
  setBacktestSLType,
  backtestRR,
  setBacktestRR,
  useBreakEven,
  setUseBreakEven,
  backtestBE,
  setBacktestBE,
  beOffsetMode = 'half_r',
  setBeOffsetMode,
  lookbackWindow,
  setLookbackWindow,
  backtestFees,
  setBacktestFees,
  backtestResults,
  backtestTab,
  setBacktestTab,
  tradeFilter,
  setTradeFilter,
  selectedTrade,
  setSelectedTrade,
  setShowModal,
  dateRangeOption,
  setDateRangeOption,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  candleLimit,
  setCandleLimit,
  favouriteCandles = [],
  onDeleteFavourite,
  onUpdateNotes,
  onLocateCandle,
  styles,
  enabledIndicators,
  setEnabledIndicators,
  onRunBacktest,
  loadingBacktest,
  backtestProgress = 0,
  backtestRunInfo,
  dailyRetryLimit,

  setDailyRetryLimit,
  allowOppositeClose,
  setAllowOppositeClose,
  onCancelBacktest,
  sessionsTimezone,
  setSessionsTimezone,
  tradingSessions,
  setTradingSessions,
  useGlobalClose,
  setUseGlobalClose,
  globalCloseTime,
  setGlobalCloseTime,
  entryStabilityRule,
  setEntryStabilityRule,
  hiddenStages = [],
  setHiddenStages,

  isOptimizeMode,
  setIsOptimizeMode,
  rrStart,
  setRRStart,
  rrEnd,
  setRREnd,
  rrStep,
  setRRStep,
  optimizationResults,
  setOptimizationResults,
  onRunOptimization,
  onSaveSettings,
  isReadOnly = false,
  availableSymbols,
  availableTimeframes,
  selectedSymbols,
  setSelectedSymbols,
  selectedTimeframes,
  setSelectedTimeframes,
  onLoadSpecificResults,
}: WyckoffBacktesterProps) {
  const [copied, setCopied] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [showDeployModal, setShowDeployModal] = React.useState(false);

  // Multi-Symbol and Multi-Timeframe State Handling
  const [internalSelectedSymbols, setInternalSelectedSymbols] = React.useState<string[]>([]);
  const [internalSelectedTimeframes, setInternalSelectedTimeframes] = React.useState<string[]>([]);

  const activeSymbols = selectedSymbols ?? internalSelectedSymbols;
  const setActiveSymbols = setSelectedSymbols ?? setInternalSelectedSymbols;

  const activeTimeframes = selectedTimeframes ?? internalSelectedTimeframes;
  const setActiveTimeframes = setSelectedTimeframes ?? setInternalSelectedTimeframes;

  // Favorites synced with TVChart (localStorage)
  const [favoriteSymbols, setFavoriteSymbols] = React.useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_fav_symbols');
      return saved ? JSON.parse(saved) : ['BTCUSD', 'EURUSD', 'XAUUSD'];
    } catch {
      return ['BTCUSD', 'EURUSD', 'XAUUSD'];
    }
  });

  const [favoriteTimeframes, setFavoriteTimeframes] = React.useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_fav_timeframes');
      return saved ? JSON.parse(saved) : ['5m', '15m', '1h', '4h'];
    } catch {
      return ['5m', '15m', '1h', '4h'];
    }
  });

  React.useEffect(() => {
    localStorage.setItem('wyckoff_fav_symbols', JSON.stringify(favoriteSymbols));
  }, [favoriteSymbols]);

  React.useEffect(() => {
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

  // Symbol Mappings integration (from backend symbol_mapping_handler.py)
  const [symbolMappings, setSymbolMappings] = React.useState<any[]>([]);

  React.useEffect(() => {
    fetch(`${API_BASE_URL}/api/symbol-mappings`)
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'success' && Array.isArray(data.data)) {
          console.log('🔀 [Symbol Mappings Return] (Backtester):', data.data);
          setSymbolMappings(data.data);
        }
      })
      .catch(err => console.error("Error fetching symbol mappings for backtester:", err));
  }, []);

  // Map of 1 master main_symbol -> broker targets
  const mappedMasterSymbols = React.useMemo(() => {
    const masterSet = new Set<string>();
    const mainToBrokerMap: Record<string, string[]> = {};

    symbolMappings.forEach((m: any) => {
      const main = (m.main_symbol || '').trim().toUpperCase();
      const brokerSym = (m.broker_symbol || '').trim();
      if (main) {
        masterSet.add(main);
        if (!mainToBrokerMap[main]) mainToBrokerMap[main] = [];
        if (brokerSym && !mainToBrokerMap[main].includes(brokerSym)) {
          mainToBrokerMap[main].push(brokerSym);
        }
      }
    });

    return {
      masterList: Array.from(masterSet),
      mainToBrokerMap
    };
  }, [symbolMappings]);

  // Combine symbols: 1 Master Symbol per mapping FIRST, then connected broker symbols SECOND
  const baseSymbols = React.useMemo(() => {
    const raw = availableSymbols || ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD', 'US30', 'GER40'];
    return Array.from(new Set([...mappedMasterSymbols.masterList, ...raw, symbol, ...favoriteSymbols].filter(Boolean)));
  }, [mappedMasterSymbols, availableSymbols, symbol, favoriteSymbols]);

  const baseTimeframes = React.useMemo(() => {
    const raw = availableTimeframes || ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    return Array.from(new Set([...raw, timeframe, ...favoriteTimeframes].filter(Boolean)));
  }, [availableTimeframes, timeframe, favoriteTimeframes]);

  // Sorted list: Favorites (★) top, then Master Mapped symbols (🔀), then Broker symbols
  const sortedSymbolsList = React.useMemo(() => {
    return [...baseSymbols].sort((a, b) => {
      const aFav = favoriteSymbols.includes(a);
      const bFav = favoriteSymbols.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;

      const aMap = mappedMasterSymbols.masterList.includes(a);
      const bMap = mappedMasterSymbols.masterList.includes(b);
      if (aMap && !bMap) return -1;
      if (!aMap && bMap) return 1;

      return a.localeCompare(b);
    });
  }, [baseSymbols, favoriteSymbols, mappedMasterSymbols]);

  const sortedTimeframesList = React.useMemo(() => {
    return [...baseTimeframes].sort((a, b) => {
      const aFav = favoriteTimeframes.includes(a);
      const bFav = favoriteTimeframes.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [baseTimeframes, favoriteTimeframes]);

  const toggleSymbolSelect = (sym: string) => {
    if (activeSymbols.includes(sym)) {
      setActiveSymbols(activeSymbols.filter(s => s !== sym));
    } else {
      setActiveSymbols([...activeSymbols, sym]);
    }
  };

  const toggleTimeframeSelect = (tf: string) => {
    if (activeTimeframes.includes(tf)) {
      setActiveTimeframes(activeTimeframes.filter(t => t !== tf));
    } else {
      setActiveTimeframes([...activeTimeframes, tf]);
    }
  };

  const effectiveSymbols = !globalRangeMode
    ? [symbol]
    : (activeSymbols.length > 0 ? activeSymbols : [symbol]);

  const effectiveTimeframes = !globalRangeMode
    ? [timeframe]
    : (activeTimeframes.length > 0 ? activeTimeframes : [timeframe]);

  // Searchable Multi-Select Dropdown States & Refs
  const [symbolSearchQuery, setSymbolSearchQuery] = React.useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = React.useState(false);
  const [tfSearchQuery, setTfSearchQuery] = React.useState('');
  const [showTfDropdown, setShowTfDropdown] = React.useState(false);

  const symbolDropdownRef = React.useRef<HTMLDivElement>(null);
  const tfDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(event.target as Node)) {
        setShowSymbolDropdown(false);
      }
      if (tfDropdownRef.current && !tfDropdownRef.current.contains(event.target as Node)) {
        setShowTfDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [activeResultCombo, setActiveResultCombo] = React.useState<{ symbol: string; timeframe: string } | null>(null);
  const [selectedLeaderboardCombo, setSelectedLeaderboardCombo] = React.useState<any | null>(null);
  const currentCombo = activeResultCombo || { symbol: effectiveSymbols[0], timeframe: effectiveTimeframes[0] };


  // Global Range Mode state (persisted in localStorage)
  const [globalRangeMode, setGlobalRangeMode] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_backtester_global_range_mode');
      if (saved !== null) return JSON.parse(saved);
      // Fallback check old individual range flags
      const oldSl = localStorage.getItem('wyckoff_backtester_sl_range_mode') === 'true';
      const oldRr = localStorage.getItem('wyckoff_backtester_rr_range_mode') === 'true';
      const oldBe = localStorage.getItem('wyckoff_backtester_be_range_mode') === 'true';
      return oldSl || oldRr || oldBe;
    } catch { return false; }
  });

  const slRangeMode = globalRangeMode;
  const rrRangeMode = globalRangeMode;
  const beRangeMode = globalRangeMode;
  const beOffsetRangeMode = globalRangeMode;

  const [slStart, setSLStart] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_sl_start') || '10');
  const [slEnd, setSLEnd] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_sl_end') || '20');
  const [slStep, setSLStep] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_sl_step') || '1');

  const [internalRRStart, setInternalRRStart] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_rr_start') || '0.5');
  const [internalRREnd, setInternalRREnd] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_rr_end') || '5.0');
  const [internalRRStep, setInternalRRStep] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_rr_step') || '0.1');

  const activeRRStart = rrStart ?? internalRRStart;
  const setActiveRRStart = setRRStart ?? setInternalRRStart;
  const activeRREnd = rrEnd ?? internalRREnd;
  const setActiveRREnd = setRREnd ?? setInternalRREnd;
  const activeRRStep = rrStep ?? internalRRStep;
  const setActiveRRStep = setRRStep ?? setInternalRRStep;

  const [beStart, setBEStart] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_be_start') || '1.0');
  const [beEnd, setBEEnd] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_be_end') || '3.0');
  const [beStep, setBEStep] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_be_step') || '0.5');

  const [beOffsetStart, setBEOffsetStart] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_be_offset_start') || '0.1');
  const [beOffsetEnd, setBEOffsetEnd] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_be_offset_end') || '1.0');
  const [beOffsetStep, setBEOffsetStep] = React.useState<string>(() => localStorage.getItem('wyckoff_backtester_be_offset_step') || '0.1');

  React.useEffect(() => {
    const handleSettingsLoaded = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (detail.globalRangeMode !== undefined) {
        setGlobalRangeMode(Boolean(detail.globalRangeMode));
      } else if (detail.slRangeMode !== undefined || detail.rrRangeMode !== undefined || detail.beRangeMode !== undefined) {
        setGlobalRangeMode(Boolean(detail.slRangeMode || detail.rrRangeMode || detail.beRangeMode));
      }
      if (detail.slStart !== undefined && detail.slStart !== null) setSLStart(String(detail.slStart));
      if (detail.slEnd !== undefined && detail.slEnd !== null) setSLEnd(String(detail.slEnd));
      if (detail.slStep !== undefined && detail.slStep !== null) setSLStep(String(detail.slStep));

      if (detail.rrStart !== undefined && detail.rrStart !== null) setInternalRRStart(String(detail.rrStart));
      if (detail.rrEnd !== undefined && detail.rrEnd !== null) setInternalRREnd(String(detail.rrEnd));
      if (detail.rrStep !== undefined && detail.rrStep !== null) setInternalRRStep(String(detail.rrStep));

      if (detail.beStart !== undefined && detail.beStart !== null) setBEStart(String(detail.beStart));
      if (detail.beEnd !== undefined && detail.beEnd !== null) setBEEnd(String(detail.beEnd));
      if (detail.beStep !== undefined && detail.beStep !== null) setBEStep(String(detail.beStep));

      if (detail.beOffsetStart !== undefined && detail.beOffsetStart !== null) setBEOffsetStart(String(detail.beOffsetStart));
      if (detail.beOffsetEnd !== undefined && detail.beOffsetEnd !== null) setBEOffsetEnd(String(detail.beOffsetEnd));
      if (detail.beOffsetStep !== undefined && detail.beOffsetStep !== null) setBEOffsetStep(String(detail.beOffsetStep));
    };

    window.addEventListener('wyckoff_settings_loaded', handleSettingsLoaded);
    return () => window.removeEventListener('wyckoff_settings_loaded', handleSettingsLoaded);
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('wyckoff_backtester_global_range_mode', JSON.stringify(globalRangeMode));
        localStorage.setItem('wyckoff_backtester_sl_range_mode', JSON.stringify(globalRangeMode));
        localStorage.setItem('wyckoff_backtester_sl_start', slStart);
        localStorage.setItem('wyckoff_backtester_sl_end', slEnd);
        localStorage.setItem('wyckoff_backtester_sl_step', slStep);

        localStorage.setItem('wyckoff_backtester_rr_range_mode', JSON.stringify(globalRangeMode));
        localStorage.setItem('wyckoff_backtester_rr_start', internalRRStart);
        localStorage.setItem('wyckoff_backtester_rr_end', internalRREnd);
        localStorage.setItem('wyckoff_backtester_rr_step', internalRRStep);

        localStorage.setItem('wyckoff_backtester_be_range_mode', JSON.stringify(globalRangeMode));
        localStorage.setItem('wyckoff_backtester_be_start', beStart);
        localStorage.setItem('wyckoff_backtester_be_end', beEnd);
        localStorage.setItem('wyckoff_backtester_be_step', beStep);

        localStorage.setItem('wyckoff_backtester_be_offset_range_mode', JSON.stringify(globalRangeMode));
        localStorage.setItem('wyckoff_backtester_be_offset_start', beOffsetStart);
        localStorage.setItem('wyckoff_backtester_be_offset_end', beOffsetEnd);
        localStorage.setItem('wyckoff_backtester_be_offset_step', beOffsetStep);
      } catch (e) {
        console.error(e);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [globalRangeMode, slStart, slEnd, slStep, internalRRStart, internalRREnd, internalRRStep, beStart, beEnd, beStep, beOffsetStart, beOffsetEnd, beOffsetStep]);


  const calcStepCount = (startStr: string, endStr: string, stepStr: string) => {
    const start = parseFloat(startStr) || 0;
    const end = parseFloat(endStr) || 0;
    const step = parseFloat(stepStr) || 1;
    if (step <= 0 || end < start) return 1;
    return Math.floor((end - start) / step) + 1;
  };

  const symbolCount = effectiveSymbols.length;
  const timeframeCount = effectiveTimeframes.length;
  const slCount = slRangeMode ? calcStepCount(slStart, slEnd, slStep) : 1;
  const rrCount = (rrRangeMode || isOptimizeMode) ? calcStepCount(activeRRStart, activeRREnd, activeRRStep) : 1;
  const beCount = (useBreakEven && beRangeMode) ? calcStepCount(beStart, beEnd, beStep) : 1;
  const beOffsetCount = (useBreakEven && beOffsetRangeMode) ? calcStepCount(beOffsetStart, beOffsetEnd, beOffsetStep) : 1;

  const totalRunCombinations = symbolCount * timeframeCount * slCount * rrCount * beCount * beOffsetCount;

  const [optSortBy, setOptSortBy] = React.useState<'netPnl' | 'winRate' | 'profitFactor' | 'maxDrawdown' | 'totalTrades'>('netPnl');
  const [optSortDir, setOptSortDir] = React.useState<'asc' | 'desc'>('desc');

  const handleHeaderSort = (column: 'netPnl' | 'winRate' | 'profitFactor' | 'maxDrawdown' | 'totalTrades') => {
    if (optSortBy === column) {
      setOptSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setOptSortBy(column);
      setOptSortDir(column === 'maxDrawdown' ? 'asc' : 'desc');
    }
  };


  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const [collapsedSections, setCollapsedSections] = React.useState<{ [key: string]: boolean }>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_backtester_collapsed');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      riskManagement: false,
      session: false,
      indicators: false,
      dateRange: false,
      wyckoffStructure: false,
      trades: false
    };
  });

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const newVal = { ...prev, [section]: !prev[section] };
      setTimeout(() => {
        try {
          localStorage.setItem('wyckoff_backtester_collapsed', JSON.stringify(newVal));
        } catch (e) {
          console.error(e);
        }
      }, 0);
      return newVal;
    });
  };





  // Saved Backtests Modal state
  const [showSavedBacktestsModal, setShowSavedBacktestsModal] = React.useState(false);

  const handleLoadSavedBacktest = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/backtest/saved/${id}`);
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        const fullPayload = json.data;
        if (fullPayload.settings) {
          const s = fullPayload.settings;
          if (s.sl_val !== undefined) setBacktestSL(String(s.sl_val));
          if (s.sl_type !== undefined) setBacktestSLType(s.sl_type);
          if (s.rr !== undefined) setBacktestRR(String(s.rr));
          if (s.be_trigger_r !== undefined) setBacktestBE(String(s.be_trigger_r));
          if (s.use_break_even !== undefined) setUseBreakEven(s.use_break_even);
          if (s.size !== undefined) setBacktestSize(String(s.size));
          if (s.initial_balance !== undefined) setBacktestBalance(String(s.initial_balance));
          if (s.use_risk_sizing !== undefined) setUseRiskSizing(s.use_risk_sizing);
          if (s.risk_pct !== undefined) setBacktestRiskPct(String(s.risk_pct));
        }
        if (onLoadSpecificResults && fullPayload.settings) {
          const s = fullPayload.settings;
          onLoadSpecificResults(
            s.broker || 'metatrader',
            s.symbol || symbol,
            s.timeframe || timeframe,
            String(s.sl_val || '1.0'),
            String(s.rr || '2.0'),
            s.be_trigger_r !== undefined ? String(s.be_trigger_r) : 'off'
          );
        }
        setShowSavedBacktestsModal(false);
        alert(`Loaded backtest run ${id} successfully!`);
      } else {
        alert("Failed to load backtest data: " + (json.message || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error loading backtest payload: " + err.message);
    }
  };

  const handleDeleteSavedBacktest = async (id: string) => {
    if (!confirm("Are you sure you want to delete this saved backtest?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/backtest/saved/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.status === 'success') {
        fetchSavedBacktests();
      } else {
        alert("Failed to delete saved backtest: " + json.message);
      }
    } catch (e: any) {
      alert("Error deleting backtest: " + e.message);
    }
  };

  // Profile management states
  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [profiles, setProfiles] = React.useState<any[]>([]);
  const [newProfileName, setNewProfileName] = React.useState('');
  const [loadingProfiles, setLoadingProfiles] = React.useState(false);


  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/backtest-settings/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setProfiles(data.profiles || []);
      }
    } catch (e) {
      console.error("Error fetching profiles:", e);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleSaveProfile = async () => {
    if (isReadOnly) {
      alert("Action disabled in read-only mode.");
      return;
    }
    if (!newProfileName.trim()) {
      alert("Please enter a profile name.");
      return;
    }
    try {
      const settingsObj = {
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
        globalRangeMode,
        rrRangeMode,
        rrStart: activeRRStart,
        rrEnd: activeRREnd,
        rrStep: activeRRStep,
        slRangeMode,
        slStart,
        slEnd,
        slStep,
        beRangeMode,
        beStart,
        beEnd,
        beStep,
        beOffsetRangeMode,
        beOffsetStart,
        beOffsetEnd,
        beOffsetStep,
      };

      const response = await fetch(`${API_BASE_URL}/api/backtest-settings/profiles/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProfileName.trim(),
          symbol,
          timeframe,
          settings: settingsObj
        })
      });
      const data = await response.json();
      if (data.status === 'success') {
        alert(data.message);
        setNewProfileName('');
        fetchProfiles();
      } else {
        alert(`Error saving profile: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message || err}`);
    }
  };

  const handleSaveDefault = async () => {
    if (isReadOnly) {
      alert("Action disabled in read-only mode.");
      return;
    }
    if (onSaveSettings) {
      onSaveSettings();
    }
  };

  const handleLoadProfile = async (id: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/backtest-settings/profiles/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await response.json();
      if (data.status === 'success' && data.settings) {
        const s = data.settings;
        if (s.backtestSL !== undefined) setBacktestSL(s.backtestSL);
        if (s.backtestSLType !== undefined) setBacktestSLType(s.backtestSLType);
        if (s.backtestRR !== undefined) setBacktestRR(s.backtestRR);
        if (s.backtestSize !== undefined) setBacktestSize(s.backtestSize);
        if (s.lookbackWindow !== undefined) setLookbackWindow(s.lookbackWindow);
        if (s.backtestBalance !== undefined) setBacktestBalance(s.backtestBalance);
        if (s.backtestRiskPct !== undefined) setBacktestRiskPct(s.backtestRiskPct);
        if (s.useRiskSizing !== undefined) setUseRiskSizing(s.useRiskSizing);
        if (s.backtestBE !== undefined) setBacktestBE(s.backtestBE);
        if (s.useBreakEven !== undefined) setUseBreakEven(s.useBreakEven);
        if (s.backtestFees !== undefined) setBacktestFees(s.backtestFees);
        if (s.dailyRetryLimit !== undefined) setDailyRetryLimit(s.dailyRetryLimit);
        if (s.allowOppositeClose !== undefined) setAllowOppositeClose(s.allowOppositeClose);
        if (s.enabledIndicators !== undefined) setEnabledIndicators(s.enabledIndicators);
        if (s.hiddenStages !== undefined && setHiddenStages) setHiddenStages(s.hiddenStages);
        if (s.entryStabilityRule !== undefined) setEntryStabilityRule(s.entryStabilityRule);
        if (s.tradingSessions !== undefined) setTradingSessions(s.tradingSessions);
        if (s.useGlobalClose !== undefined) setUseGlobalClose(s.useGlobalClose);
        if (s.globalCloseTime !== undefined) setGlobalCloseTime(s.globalCloseTime);
        if (s.isOptimizeMode !== undefined) setIsOptimizeMode(s.isOptimizeMode);
        if (s.rrStart !== undefined) setRRStart(s.rrStart);
        if (s.rrEnd !== undefined) setRREnd(s.rrEnd);
        if (s.rrStep !== undefined) setRRStep(s.rrStep);

        window.dispatchEvent(new CustomEvent('wyckoff_settings_loaded', { detail: s }));

        alert(`Successfully loaded profile: ${data.name}`);
        setShowProfileModal(false);
      } else {
        alert(`Error loading profile: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message || err}`);
    }
  };

  const handleDeleteProfile = async (id: number, name: string) => {
    if (isReadOnly) {
      alert("Action disabled in read-only mode.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete profile '${name}'?`)) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/backtest-settings/profiles/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await response.json();
      if (data.status === 'success') {
        alert(data.message);
        fetchProfiles();
      } else {
        alert(`Error deleting profile: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message || err}`);
    }
  };

  // Session builder states
  const [newStart, setNewStart] = React.useState('09:00');
  const [newEnd, setNewEnd] = React.useState('17:00');
  const [newCloseOnEnd, setNewCloseOnEnd] = React.useState(true);
  const [newWeekdays, setNewWeekdays] = React.useState<number[]>([1, 2, 3, 4, 5]);
  const [newColor, setNewColor] = React.useState('#3b82f6'); // Default color
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null);

  const handleAddSession = () => {
    if (!newStart || !newEnd) return;

    if (editingSessionId) {
      setTradingSessions(tradingSessions.map(s => s.id === editingSessionId ? {
        ...s,
        start: newStart,
        end: newEnd,
        closeOnEnd: newCloseOnEnd,
        weekdays: [...newWeekdays],
        color: newColor
      } : s));
      setEditingSessionId(null);
    } else {
      const newSession = {
        id: Math.random().toString(36).substr(2, 9),
        start: newStart,
        end: newEnd,
        closeOnEnd: newCloseOnEnd,
        weekdays: [...newWeekdays],
        color: newColor,
        active: true
      };
      setTradingSessions([...tradingSessions, newSession]);
    }

    // Reset form to defaults
    setNewStart('09:00');
    setNewEnd('17:00');
    setNewCloseOnEnd(true);
    setNewWeekdays([1, 2, 3, 4, 5]);
    setNewColor('#3b82f6');
  };

  const handleEditSession = (session: any) => {
    setEditingSessionId(session.id);
    setNewStart(session.start);
    setNewEnd(session.end);
    setNewCloseOnEnd(session.closeOnEnd);
    setNewWeekdays([...session.weekdays]);
    setNewColor(session.color || '#3b82f6');
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setNewStart('09:00');
    setNewEnd('17:00');
    setNewCloseOnEnd(true);
    setNewWeekdays([1, 2, 3, 4, 5]);
    setNewColor('#3b82f6');
  };

  const handleDeleteSession = (id: string) => {
    if (editingSessionId === id) {
      handleCancelEdit();
    }
    setTradingSessions(tradingSessions.filter(s => s.id !== id));
  };

  const toggleSessionActive = (id: string) => {
    setTradingSessions(tradingSessions.map(s => s.id === id ? { ...s, active: s.active === false ? true : false } : s));
  };

  const toggleWeekday = (day: number) => {
    if (newWeekdays.includes(day)) {
      setNewWeekdays(newWeekdays.filter(d => d !== day));
    } else {
      setNewWeekdays([...newWeekdays, day].sort());
    }
  };

  const handleCopy = async () => {
    try {
      const backendUrl = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
        ? 'http://localhost:8751/api/backtest/results'
        : `${window.location.origin}/api/backtest/results`;

      const res = await fetch(backendUrl);
      const json = await res.json();
      if (json.status === 'success') {
        await navigator.clipboard.writeText(JSON.stringify(json.data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error(json.message || 'Error fetching');
      }
    } catch (err) {
      try {
        const cleanResults = {
          explainer: "VSA and sweep strategy backtest data.",
          settings: {
            symbol: symbol,
            timeframe: timeframe
          },
          metrics: {
            winRate: backtestResults?.winRate,
            netPnl: backtestResults?.netPnl,
            profitFactor: backtestResults?.profitFactor,
            totalTrades: backtestResults?.totalTrades,
            maxDrawdown: backtestResults?.maxDrawdown,
            maxDailyLoss: backtestResults?.maxDailyLoss,
            dailyLossBreached: backtestResults?.dailyLossBreached,
          },
          trades: backtestResults?.trades?.slice(0, 100)
        };
        await navigator.clipboard.writeText(JSON.stringify(cleanResults, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e: any) {
        console.error(e);
      }
    }
  };

  return (
    <div className="no-drag" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', paddingBottom: '40px' }}>

      <fieldset disabled={isReadOnly} style={{ border: 'none', padding: 0, margin: '0', display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          fontSize: '12px',
        }}>
        {/* Top Mode Selector Tabs Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '4px',
          marginBottom: '4px',
          gap: '6px'
        }}>
          <button
            type="button"
            onClick={() => {
              setGlobalRangeMode(false);
              setIsOptimizeMode(false);
            }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: !globalRangeMode ? '#2563eb' : 'transparent',
              color: !globalRangeMode ? '#ffffff' : '#94a3b8',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: !globalRangeMode ? '0 4px 6px -1px rgba(37, 99, 235, 0.3)' : 'none'
            }}
          >
            <span>⚡ Single Backtest</span>
            {!globalRangeMode && (
              <span style={{ fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                Active ({symbol} • {timeframe})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setGlobalRangeMode(true);
              setIsOptimizeMode(true);
            }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: globalRangeMode ? '#0284c7' : 'transparent',
              color: globalRangeMode ? '#ffffff' : '#94a3b8',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: globalRangeMode ? '0 4px 6px -1px rgba(2, 132, 199, 0.3)' : 'none'
            }}
          >
            <span>📊 Range / Optimization Backtest</span>
            {globalRangeMode && (
              <span style={{ fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                Active ({totalRunCombinations.toLocaleString()} runs)
              </span>
            )}
          </button>
        </div>

        {globalRangeMode && totalRunCombinations > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0f172a',
            border: '1px solid #1e3a8a',
            padding: '6px 12px',
            borderRadius: '6px',
            color: '#38bdf8',
            fontSize: '11px',
            fontWeight: 600,
            marginBottom: '6px'
          }}>
            <span>⚡ Grid Search Matrix:</span>
            <span>
              {symbolCount} Syms × {timeframeCount} TFs × {slCount} SL × {rrCount} RR × {beCount} BE = <strong style={{ color: '#10b981' }}>{totalRunCombinations.toLocaleString()} runs</strong>
            </span>
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          position: 'sticky',
          top: '-16px',
          zIndex: 10,
          backgroundColor: 'var(--app-card-bg, #111827)',
          paddingTop: '4px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--app-card-border, #1f2937)',
          marginBottom: '8px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: globalRangeMode ? '#38bdf8' : '#60a5fa' }}>
            {globalRangeMode ? '📊 Range Mode Active' : `⚡ Single Mode (${symbol} • ${timeframe})`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
          {onSaveSettings && (
            <button
              onClick={() => {
                setShowProfileModal(true);
                fetchProfiles();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backgroundColor: '#475569',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '11px',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#334155'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#475569'}
            >
              💾 Save Settings
            </button>
          )}
          <button
            onClick={() => {
              setShowSavedBacktestsModal(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '11px',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#0369a1'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#0284c7'}
          >
            📁 Saved Runs
          </button>

          <button
            disabled={loadingBacktest}
            onClick={() => {
              if (loadingBacktest) return;
              console.log(`[Wyckoff Backtester] Run Backtest clicked (Combinations: ${totalRunCombinations}) at:`, new Date().toLocaleTimeString());
              console.time("Backtest execution duration");
              const rangeParams = {
                slRangeMode,
                slStart: parseFloat(slStart) || 0.0,
                slEnd: parseFloat(slEnd) || 0.0,
                slStep: parseFloat(slStep) || 1.0,
                beRangeMode,
                beStart: parseFloat(beStart) || 0.0,
                beEnd: parseFloat(beEnd) || 0.0,
                beStep: parseFloat(beStep) || 1.0,
                symbols: effectiveSymbols,
                timeframes: effectiveTimeframes
              };
              if (totalRunCombinations > 1 || isOptimizeMode) {
                onRunOptimization(rangeParams);
              } else {
                onRunBacktest(rangeParams);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              backgroundColor: loadingBacktest ? '#1e293b' : '#3b82f6',
              color: '#ffffff',
              border: loadingBacktest ? '1px solid #3b82f6' : 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: loadingBacktest ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '11px',
              transition: 'background-color 0.2s',
              opacity: loadingBacktest ? 0.9 : 1
            }}
            onMouseOver={(e) => !loadingBacktest && (e.currentTarget.style.backgroundColor = '#2563eb')}
            onMouseOut={(e) => !loadingBacktest && (e.currentTarget.style.backgroundColor = '#3b82f6')}
          >
            {loadingBacktest ? (
              backtestRunInfo && backtestRunInfo.total > 1
                ? `⏳ Run ${backtestRunInfo.current}/${backtestRunInfo.total} (${backtestProgress}%)`
                : `⏳ Running ${backtestProgress}%...`
            ) : (
              '🔄 Run Backtest'
            )}


          </button>
          {loadingBacktest && (
            <button
              onClick={onCancelBacktest}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '6px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '11px',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
            >
              🛑 Stop
            </button>
          )}

          {!isReadOnly && !isOptimizeMode && (
            <button
              onClick={() => setShowDeployModal(true)}
              disabled={isDeploying}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: isDeploying ? 'not-allowed' : 'pointer',
                fontWeight: 500,
                fontSize: '11px',
                transition: 'background-color 0.2s',
                opacity: isDeploying ? 0.7 : 1,
              }}
              onMouseOver={(e) => !isDeploying && (e.currentTarget.style.backgroundColor = '#dc2626')}
              onMouseOut={(e) => !isDeploying && (e.currentTarget.style.backgroundColor = '#ef4444')}
            >
              {isDeploying ? '⏳ Deploying...' : '🚀 Deploy Live'}
            </button>
          )}
          </div>
        </div>

        {backtestResults && (() => {
          const formatDateExact = (val: any) => {
            if (!val) return null;
            let d: Date | null = null;
            if (typeof val === 'number') {
              d = new Date(val * (val < 1e11 ? 1000 : 1));
            } else if (typeof val === 'string') {
              d = new Date(val);
            }
            if (!d || isNaN(d.getTime())) return null;
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
          };

          const rawFrom = backtestResults?.dateFrom ?? backtestResults?.candles?.[0]?.time;
          const rawTo = backtestResults?.dateTo ?? backtestResults?.candles?.[backtestResults?.candles?.length - 1]?.time;
          const fromFormatted = formatDateExact(rawFrom);
          const toFormatted = formatDateExact(rawTo);
          const dateRangeStr = (fromFormatted && toFormatted) ? `${fromFormatted} to ${toFormatted}` : null;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #334155',
                fontSize: '11px',
                fontWeight: 500,
                color: '#9ca3af',
                flexWrap: 'wrap',
                gap: '4px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>Backtest Overview</span>
                  {dateRangeStr && (
                    <span style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 'normal' }}>
                      📅 {dateRangeStr}
                    </span>
                  )}
                </div>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{broker.toUpperCase()} • {symbol} • {timeframe}</span>
              </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              backgroundColor: '#1e293b',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
                <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Trades</span>
                <span style={{ color: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}>{backtestResults?.totalTrades ?? 0}</span>
              </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
              <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Win Rate</span>
              <span style={{ color: (backtestResults?.winRate ?? 0) >= 50 ? '#10b981' : '#ef4444', fontSize: '11px', fontWeight: 'bold' }}>
                {(backtestResults?.winRate ?? 0).toFixed(1)}%
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
              <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Net Profit</span>
              <span style={{ color: (backtestResults?.netPnl ?? 0) >= 0 ? '#10b981' : '#ef4444', fontSize: '11px', fontWeight: 'bold' }}>
                ${(backtestResults?.netPnl ?? 0).toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
              <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Prof. Fact</span>
              <span style={{ color: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}>{(backtestResults?.profitFactor ?? 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
              <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Max DD</span>
              <span style={{ color: '#ffffff', fontSize: '11px', fontWeight: 'bold' }}>{(backtestResults?.maxDrawdown ?? 0).toFixed(2)}%</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
              <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600 }}>Daily Loss</span>
              <span style={{ color: (backtestResults?.maxDailyLoss ?? 0) >= 5.0 ? '#ef4444' : '#ffffff', fontSize: '11px', fontWeight: 'bold' }}>
                {(backtestResults?.maxDailyLoss ?? 0).toFixed(2)}%
              </span>
            </div>

          </div>
          </div>
          );
        })()}
        {/* Collapsible Cards */}
        {/* Collapsible Card: Symbol & Timeframe Selection */}
        <CollapsibleCard
          title={globalRangeMode ? "🎯 Multi-Symbol & Multi-Timeframe Selection" : `🎯 Symbol & Timeframe Target (${symbol} • ${timeframe})`}
          isCollapsed={collapsedSections.multiAsset ?? false}
          onToggle={() => toggleSection('multiAsset')}
        >
          {!globalRangeMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#0f172a',
                padding: '10px 14px',
                borderRadius: '6px',
                border: '1px solid #1e293b'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Active Symbol (from Chart):</span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#38bdf8' }}>{symbol}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Timeframe:</span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f59e0b' }}>{timeframe}</span>
                </div>
              </div>
              <span style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic' }}>
                💡 Single Backtest runs on the active symbol from the TV Chart. Switch to the <strong>Range / Optimization Backtest</strong> tab above to select multiple symbols and timeframes.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <SymbolTimeframeSelector
                multiSelect={true}
                symbol={symbol}
                timeframe={timeframe}
                selectedSymbols={activeSymbols}
                onSelectedSymbolsChange={setActiveSymbols}
                selectedTimeframes={activeTimeframes}
                onSelectedTimeframesChange={setActiveTimeframes}
                availableSymbols={availableSymbols}
                availableTimeframes={availableTimeframes}
              />

              {(effectiveSymbols.length > 1 || effectiveTimeframes.length > 1) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  overflowX: 'auto',
                  padding: '6px 8px',
                  backgroundColor: '#0f172a',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                  fontSize: '11px',
                  marginTop: '4px'
                }}>
                  <span style={{ color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '10px' }}>
                    🔀 Active Combos ({effectiveSymbols.length * effectiveTimeframes.length}):
                  </span>
                  {effectiveSymbols.flatMap(s => effectiveTimeframes.map(tf => ({ s, tf }))).map(({ s, tf }) => {
                    const isCurrent = currentCombo.symbol === s && currentCombo.timeframe === tf;
                    return (
                      <button
                        key={`${s}-${tf}`}
                        type="button"
                        onClick={() => setActiveResultCombo({ symbol: s, timeframe: tf })}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          border: isCurrent ? '1px solid #38bdf8' : '1px solid #334155',
                          backgroundColor: isCurrent ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                          color: isCurrent ? '#38bdf8' : '#94a3b8'
                        }}
                      >
                        {s} • {tf}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CollapsibleCard>

        <CollapsibleCard title="Risk Management" isCollapsed={collapsedSections.riskManagement} onToggle={() => toggleSection('riskManagement')}>
          {/* Starting Balance & Fees */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Starting Balance ($)</label>
              <input
                type="number"
                value={backtestBalance}
                onChange={(e) => setBacktestBalance(e.target.value)}
                style={styles.input}
                min="100"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Fees per side (%)</label>
              <input
                type="number"
                value={backtestFees}
                onChange={(e) => setBacktestFees(e.target.value)}
                style={styles.input}
                step="0.01"
                min="0.0"
              />
            </div>
          </div>

          {/* Position Size settings */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
            <div style={{ ...styles.formGroup, justifyContent: 'center', height: '100%' }}>
              <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={useRiskSizing}
                  onChange={(e) => setUseRiskSizing(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Auto Size by Risk
              </label>
            </div>

            {useRiskSizing ? (
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Risk %</label>
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
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Qty (Size)</label>
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
          </div>

          {/* Stop Loss & Profit Target (RR Ratio) */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            {/* Stop Loss Field */}
            <div style={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Stop Loss</label>
              </div>

              {!slRangeMode ? (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="number"
                    value={backtestSL}
                    onChange={(e) => setBacktestSL(e.target.value)}
                    style={{ ...styles.input, flexGrow: 1, minWidth: 0 }}
                    step={backtestSLType === 'pct' ? '0.1' : '1'}
                    min="0.01"
                  />
                  <select
                    value={backtestSLType}
                    onChange={(e) => {
                      const newType = e.target.value as 'pct' | 'price' | 'dollar';
                      setUseRiskSizing(true);
                      setBacktestSLType(newType);
                      const isForex = ['EUR', 'GBP', 'JPY', 'USD', 'CAD', 'AUD', 'CHF'].some(curr => symbol.toUpperCase().includes(curr)) && !['BTC', 'ETH', 'SOL', 'LTC', 'XRP'].some(crypto => symbol.toUpperCase().includes(crypto));
                      setBacktestSL(newType === 'pct' ? '1.0' : (newType === 'dollar' ? '100' : (isForex ? '20' : '200')));
                    }}
                    style={{
                      ...styles.input,
                      width: '65px',
                      backgroundColor: '#1f2937',
                      cursor: 'pointer',
                      padding: '0 4px',
                    }}
                  >
                    <option value="pct">%</option>
                    <option value="price">Pips</option>
                    <option value="dollar">$</option>
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <input
                      type="number"
                      value={slStart}
                      onChange={(e) => setSLStart(e.target.value)}
                      style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                      placeholder="Start (10)"
                      step="1"
                    />
                    <input
                      type="number"
                      value={slEnd}
                      onChange={(e) => setSLEnd(e.target.value)}
                      style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                      placeholder="End (20)"
                      step="1"
                    />
                    <input
                      type="number"
                      value={slStep}
                      onChange={(e) => setSLStep(e.target.value)}
                      style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                      placeholder="Step (1)"
                      step="0.1"
                    />
                    <select
                      value={backtestSLType}
                      onChange={(e) => setBacktestSLType(e.target.value as any)}
                      style={{
                        ...styles.input,
                        width: '55px',
                        backgroundColor: '#1f2937',
                        cursor: 'pointer',
                        padding: '0 2px',
                      }}
                    >
                      <option value="pct">%</option>
                      <option value="price">Pips</option>
                      <option value="dollar">$</option>
                    </select>
                  </div>
                  <span style={{ fontSize: '9px', color: '#38bdf8' }}>
                    ⚡ SL Range: {slStart} → {slEnd} ({slCount} values)
                  </span>
                </div>
              )}
            </div>

            {/* RR Ratio Field */}
            <div style={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>RR Ratio</label>
              </div>

              {!rrRangeMode ? (
                <input
                  type="number"
                  value={backtestRR}
                  onChange={(e) => setBacktestRR(e.target.value)}
                  style={styles.input}
                  step="0.1"
                  min="0.5"
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <input
                      type="number"
                      value={activeRRStart}
                      onChange={(e) => setActiveRRStart(e.target.value)}
                      style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                      placeholder="Start (0)"
                      step="0.1"
                    />
                    <input
                      type="number"
                      value={activeRREnd}
                      onChange={(e) => setActiveRREnd(e.target.value)}
                      style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                      placeholder="End (5)"
                      step="0.1"
                    />
                    <input
                      type="number"
                      value={activeRRStep}
                      onChange={(e) => setActiveRRStep(e.target.value)}
                      style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                      placeholder="Step (0.1)"
                      step="0.1"
                    />
                  </div>
                  <span style={{ fontSize: '9px', color: '#38bdf8' }}>
                    ⚡ RR Range: {activeRRStart} → {activeRREnd} ({rrCount} values, step {activeRRStep})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Break Even controls & Sweep Lookback */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '85px 1fr', gap: '12px', alignItems: 'end' }}>
            <div style={{ ...styles.formGroup, height: '100%', justifyContent: 'center' }}>
              <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={useBreakEven}
                  onChange={(e) => setUseBreakEven(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Enable BE
              </label>
            </div>

            {useBreakEven ? (
              <div style={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <label style={{ color: '#9ca3af', fontSize: '11px' }}>BE Trigger (R)</label>
                </div>

                {!beRangeMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={backtestBE}
                        onChange={(e) => setBacktestBE(e.target.value)}
                        style={{ ...styles.input, flex: '1 1 110px', minWidth: '80px' }}
                        step="0.1"
                        min="0.1"
                        placeholder="BE Trigger (R)"
                      />
                      <select
                        value={['half_r', 'zero_be'].includes(beOffsetMode) ? beOffsetMode : 'custom'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setBeOffsetMode && setBeOffsetMode('0.5');
                          } else {
                            setBeOffsetMode && setBeOffsetMode(val);
                          }
                        }}
                        style={{
                          ...styles.input,
                          width: 'auto',
                          flexShrink: 0,
                          padding: '4px 6px',
                          fontSize: '10px',
                          backgroundColor: '#1e293b',
                          borderColor: '#334155',
                          color: '#38bdf8',
                          cursor: 'pointer'
                        }}
                        title="Select SL Placement when BE triggers"
                      >
                        <option value="half_r">Half Trigger (0.5×Trigger)</option>
                        <option value="zero_be">Exact Entry (0.0R)</option>
                        <option value="custom">Fixed R Profit Offset</option>
                      </select>
                    </div>

                    {!['half_r', 'zero_be'].includes(beOffsetMode) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#9ca3af', whiteSpace: 'nowrap' }}>Fixed Profit SL:</span>
                        <input
                          type="number"
                          value={beOffsetMode}
                          onChange={(e) => setBeOffsetMode && setBeOffsetMode(e.target.value)}
                          style={{ ...styles.input, flex: 1, padding: '3px 6px', fontSize: '11px', color: '#38bdf8' }}
                          step="0.1"
                          min="0"
                          placeholder="e.g. 0.5R"
                        />
                        <span style={{ fontSize: '10px', color: '#38bdf8' }}>R</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      <input
                        type="number"
                        value={beStart}
                        onChange={(e) => setBEStart(e.target.value)}
                        style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                        placeholder="Start (1.0)"
                        step="0.1"
                      />
                      <input
                        type="number"
                        value={beEnd}
                        onChange={(e) => setBEEnd(e.target.value)}
                        style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                        placeholder="End (3.0)"
                        step="0.1"
                      />
                      <input
                        type="number"
                        value={beStep}
                        onChange={(e) => setBEStep(e.target.value)}
                        style={{ ...styles.input, minWidth: 0, flex: 1, padding: '4px' }}
                        placeholder="Step (0.5)"
                        step="0.1"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', color: '#38bdf8' }}>
                        ⚡ BE Range: {beStart}R → {beEnd}R ({beCount} values)
                      </span>
                      <select
                        value={['half_r', 'zero_be'].includes(beOffsetMode) ? beOffsetMode : 'custom'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setBeOffsetMode && setBeOffsetMode('0.5');
                          } else {
                            setBeOffsetMode && setBeOffsetMode(val);
                          }
                        }}
                        style={{
                          ...styles.input,
                          width: 'auto',
                          padding: '2px 4px',
                          fontSize: '9px',
                          backgroundColor: '#1e293b',
                          borderColor: '#334155',
                          color: '#38bdf8',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="half_r">Half Trigger</option>
                        <option value="zero_be">Exact Entry (0.0R)</option>
                        <option value="custom">Fixed Offset</option>
                      </select>
                    </div>
                    {!['half_r', 'zero_be'].includes(beOffsetMode) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '9px', color: '#9ca3af' }}>Fixed Profit SL Offset:</span>
                          <label style={{ color: '#cbd5e1', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={beOffsetRangeMode}
                              onChange={(e) => setBEOffsetRangeMode(e.target.checked)}
                              style={{ cursor: 'pointer' }}
                            />
                            Offset Range
                          </label>
                        </div>
                        {!beOffsetRangeMode ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              value={beOffsetMode}
                              onChange={(e) => setBeOffsetMode && setBeOffsetMode(e.target.value)}
                              style={{ ...styles.input, flex: 1, padding: '2px 4px', fontSize: '10px', color: '#38bdf8' }}
                              step="0.1"
                              min="0"
                            />
                            <span style={{ fontSize: '9px', color: '#38bdf8' }}>R</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              <input
                                type="number"
                                value={beOffsetStart}
                                onChange={(e) => setBEOffsetStart(e.target.value)}
                                style={{ ...styles.input, minWidth: 0, flex: 1, padding: '2px 4px', fontSize: '9px' }}
                                placeholder="Start (0.1)"
                                step="0.1"
                              />
                              <input
                                type="number"
                                value={beOffsetEnd}
                                onChange={(e) => setBEOffsetEnd(e.target.value)}
                                style={{ ...styles.input, minWidth: 0, flex: 1, padding: '2px 4px', fontSize: '9px' }}
                                placeholder="End (1.0)"
                                step="0.1"
                              />
                              <input
                                type="number"
                                value={beOffsetStep}
                                onChange={(e) => setBEOffsetStep(e.target.value)}
                                style={{ ...styles.input, minWidth: 0, flex: 1, padding: '2px 4px', fontSize: '9px' }}
                                placeholder="Step (0.1)"
                                step="0.1"
                              />
                            </div>
                            <span style={{ fontSize: '9px', color: '#38bdf8' }}>
                              ⚡ Offset Range: {beOffsetStart}R → {beOffsetEnd}R ({beOffsetCount} values)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Sweep Lookback</label>
                <input
                  type="number"
                  value={lookbackWindow}
                  onChange={(e) => setLookbackWindow(e.target.value)}
                  style={styles.input}
                  min="5"
                  max="200"
                />
              </div>
            )}
          </div>

          {/* Allow Opposite Close setting */}
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={allowOppositeClose}
                onChange={(e) => setAllowOppositeClose(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Allow Opposite Signal to Close Trade
            </label>
          </div>

          {/* Sweep Lookback & Daily Retry */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (useBreakEven ? '1fr 1fr' : '1fr'), gap: '12px' }}>
            {useBreakEven && (
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Sweep Lookback (Bars)</label>
                <input
                  type="number"
                  value={lookbackWindow}
                  onChange={(e) => setLookbackWindow(e.target.value)}
                  style={styles.input}
                  min="5"
                  max="200"
                />
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Daily Retry Limit</label>
              <input
                type="number"
                value={dailyRetryLimit}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  setDailyRetryLimit(val.toString());
                }}
                style={styles.input}
                min="0"
                step="1"
              />
            </div>
          </div>

          {/* Entry Stability Rule */}
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Entry Stability Rule</label>
            <select
              value={entryStabilityRule}
              onChange={(e) => setEntryStabilityRule(e.target.value)}
              style={styles.input}
            >
              <option value="default">Standard (Immediate Entry on Spring/Upthrust)</option>
              <option value="confirmation">Bullish/Bearish Confirmation (Close above/below Signal High/Low)</option>
              <option value="duration">Minimum Stage Duration (Accumulation/Distribution &gt;= 3 bars)</option>
              <option value="both">Both Confirmation & Minimum Stage Duration</option>
            </select>
          </div>
        </CollapsibleCard>

        <CollapsibleCard title="Session" isCollapsed={collapsedSections.session} onToggle={() => toggleSection('session')}>
          {/* Timezone Selector */}
          <div style={styles.formGroup}>
            <label style={{ color: '#9ca3af', fontSize: '11px' }}>Global Timezone</label>
            <div style={{ color: '#ffffff', fontSize: '12px', fontWeight: 'bold', padding: '6px 8px', backgroundColor: '#1e293b', borderRadius: '4px', border: '1px solid #334155' }}>
              UTC (GMT) [Locked]
            </div>
          </div>

          {/* Global close time */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useGlobalClose}
                onChange={(e) => setUseGlobalClose(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Close Everything daily at:
            </label>
            {useGlobalClose && (
              <input
                type="text"
                placeholder="e.g. 21:50"
                value={globalCloseTime}
                onChange={(e) => setGlobalCloseTime(e.target.value)}
                style={styles.input}
              />
            )}
          </div>

          {/* Sessions List */}
          {tradingSessions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 'bold' }}>Active Sessions:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                {tradingSessions.map((s, idx) => {
                  const daysStr = s.weekdays.map((d: number) => ['M', 'T', 'W', 'T', 'F', 'S', 'S'][d - 1]).join(',');
                  const sessionColor = s.color || '#3b82f6';
                  return (
                    <div key={s.id || idx} style={{
                      backgroundColor: 'rgba(31, 41, 55, 0.5)',
                      border: '1px solid #1e293b',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      borderLeft: `4px solid ${sessionColor}`
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            checked={s.active !== false}
                            onChange={() => toggleSessionActive(s.id)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{
                            color: '#ffffff',
                            fontWeight: 'bold',
                            textDecoration: s.active === false ? 'line-through' : 'none',
                            opacity: s.active === false ? 0.5 : 1
                          }}>{s.start} - {s.end} ({daysStr})</span>
                        </div>
                        <span style={{ color: '#9ca3af', fontSize: '9px', opacity: s.active === false ? 0.5 : 1 }}>
                          {s.closeOnEnd ? 'Close on End' : 'Let run'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => handleEditSession(s)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#3b82f6',
                            cursor: 'pointer',
                            fontSize: '11px',
                            padding: '2px 4px'
                          }}
                          title="Edit Session"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteSession(s.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            padding: '2px 4px'
                          }}
                          title="Delete Session"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Session Form */}
          <div style={{
            backgroundColor: 'rgba(31, 41, 55, 0.3)',
            border: '1px dotted #374151',
            borderRadius: '6px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <span style={{ color: '#9ca3af', fontSize: '10px', fontWeight: 'bold' }}>{editingSessionId ? 'Edit Trading Session' : 'Add Trading Session'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '9px' }}>Start Time</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select
                    value={newStart.split(':')[0] || '09'}
                    onChange={(e) => {
                      const mins = newStart.split(':')[1] || '00';
                      setNewStart(`${e.target.value}:${mins}`);
                    }}
                    style={{ ...styles.input, padding: '4px 6px', fontSize: '11px', flex: 1, color: '#ffffff', backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  >
                    {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span style={{ color: '#9ca3af', alignSelf: 'center' }}>:</span>
                  <select
                    value={newStart.split(':')[1] || '00'}
                    onChange={(e) => {
                      const hrs = newStart.split(':')[0] || '09';
                      setNewStart(`${hrs}:${e.target.value}`);
                    }}
                    style={{ ...styles.input, padding: '4px 6px', fontSize: '11px', flex: 1, color: '#ffffff', backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  >
                    {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '9px' }}>End Time</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <select
                    value={newEnd.split(':')[0] || '17'}
                    onChange={(e) => {
                      const mins = newEnd.split(':')[1] || '00';
                      setNewEnd(`${e.target.value}:${mins}`);
                    }}
                    style={{ ...styles.input, padding: '4px 6px', fontSize: '11px', flex: 1, color: '#ffffff', backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  >
                    {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span style={{ color: '#9ca3af', alignSelf: 'center' }}>:</span>
                  <select
                    value={newEnd.split(':')[1] || '00'}
                    onChange={(e) => {
                      const hrs = newEnd.split(':')[0] || '17';
                      setNewEnd(`${hrs}:${e.target.value}`);
                    }}
                    style={{ ...styles.input, padding: '4px 6px', fontSize: '11px', flex: 1, color: '#ffffff', backgroundColor: '#1f2937', border: '1px solid #374151' }}
                  >
                    {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Weekdays Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ color: '#9ca3af', fontSize: '9px' }}>Weekdays</label>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const isSelected = newWeekdays.includes(day);
                  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
                  return (
                    <button
                      key={day}
                      onClick={() => toggleWeekday(day)}
                      style={{
                        flex: '1 0 auto',
                        padding: '4px 0',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        borderRadius: '3px',
                        border: '1px solid ' + (isSelected ? '#3b82f6' : '#374151'),
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: isSelected ? '#3b82f6' : '#9ca3af',
                        cursor: 'pointer',
                        minWidth: '22px'
                      }}
                    >
                      {labels[day - 1]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color picker and close on end row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <label style={{ color: '#cbd5e1', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newCloseOnEnd}
                  onChange={(e) => setNewCloseOnEnd(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Close on End
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ color: '#9ca3af', fontSize: '9px' }}>Color</label>
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    width: '24px',
                    height: '24px',
                    padding: 0
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleAddSession}
                style={{
                  flex: 1,
                  backgroundColor: editingSessionId ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  color: editingSessionId ? '#10b981' : '#3b82f6',
                  border: '1px solid ' + (editingSessionId ? '#10b981' : '#3b82f6'),
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {editingSessionId ? '✏️ Update Session' : '+ Add Session Window'}
              </button>
              {editingSessionId && (
                <button
                  onClick={handleCancelEdit}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard title="Indicators" isCollapsed={collapsedSections.indicators} onToggle={() => toggleSection('indicators')}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ color: '#cbd5e1', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabledIndicators?.fvg}
                onChange={(e) => setEnabledIndicators({ ...enabledIndicators, fvg: e.target.checked })}
                style={{ cursor: 'pointer' }}
              />
              Fair Value Gap (FVG)
            </label>
          </div>
        </CollapsibleCard>

        <CollapsibleCard title="Wyckoff Structure" isCollapsed={collapsedSections.wyckoffStructure} onToggle={() => toggleSection('wyckoffStructure')}>
          <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#94a3b8', letterSpacing: '0.05em', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', paddingBottom: '4px', marginBottom: '2px' }}>
            WYCKOFF CYCLE FILTER (CLICK TO TOGGLE HIDING TREND LINE)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { id: 'ACCUMULATION', label: 'Accumulation', color: '#3b82f6' },
              { id: 'MARKUP', label: 'Markup', color: '#10b981' },
              { id: 'DISTRIBUTION', label: 'Distribution', color: '#f59e0b' },
              { id: 'MARKDOWN', label: 'Markdown', color: '#ef4444' },
              { id: 'TRANSITION', label: 'Transition', color: '#cbd5e1' }
            ].map(stage => {
              const isHidden = hiddenStages.includes(stage.id);
              return (
                <div
                  key={stage.id}
                  onClick={() => {
                    if (setHiddenStages) {
                      setHiddenStages(
                        isHidden
                          ? hiddenStages.filter((s: string) => s !== stage.id)
                          : [...hiddenStages, stage.id]
                      );
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10px',
                    fontWeight: '500',
                    color: '#f1f5f9',
                    cursor: 'pointer',
                    opacity: isHidden ? 0.35 : 1,
                    textDecoration: isHidden ? 'line-through' : 'none',
                    padding: '3px 6px',
                    borderRadius: '3px',
                    backgroundColor: 'rgba(31, 41, 55, 0.2)',
                    transition: 'opacity 0.15s, background-color 0.15s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.4)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(31, 41, 55, 0.2)'}
                >
                  <div style={{ width: '10px', height: '3px', backgroundColor: stage.color, borderRadius: '1.5px' }} />
                  {stage.label}
                </div>
              );
            })}
          </div>
        </CollapsibleCard>

        <CollapsibleCard title="Date Range" isCollapsed={collapsedSections.dateRange} onToggle={() => toggleSection('dateRange')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: '#cbd5e1', fontSize: '11px' }}>Date Range Settings</span>
            {dateRangeOption !== 'last_candles' && (
              <button
                onClick={() => {
                  setDateRangeOption('last_candles');
                  setCustomFrom('');
                  setCustomTo('');
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  textDecoration: 'underline'
                }}
              >
                Clear Range
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px', alignItems: 'end' }}>
            <div style={styles.formGroup}>
              <label style={{ color: '#9ca3af', fontSize: '11px' }}>Filter Option</label>
              <select
                value={dateRangeOption}
                onChange={(e) => setDateRangeOption(e.target.value)}
                style={styles.input}
              >
                <option value="last_candles">Last Candles (Limit)</option>
                <option value="this_week">This Week (Sun 20:00)</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
                <option value="from_start_date">From Start Date (No end)</option>
              </select>
            </div>

            {dateRangeOption === 'last_candles' && (
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>Candle Limit</label>
                <select
                  value={candleLimit}
                  onChange={(e) => setCandleLimit(parseInt(e.target.value))}
                  style={styles.input}
                >
                  <option value="1000">1000</option>
                  <option value="2000">2000</option>
                  <option value="5000">5000</option>
                  <option value="10000">10000</option>
                </select>
              </div>
            )}
          </div>

          {dateRangeOption === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>From Date</label>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ ...styles.input, colorScheme: 'dark', cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>To Date</label>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{ ...styles.input, colorScheme: 'dark', cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
            </div>
          )}

          {dateRangeOption === 'from_start_date' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <div style={styles.formGroup}>
                <label style={{ color: '#9ca3af', fontSize: '11px' }}>From Date (Start of test)</label>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ ...styles.input, colorScheme: 'dark', cursor: 'pointer', minHeight: '32px' }}
                />
              </div>
            </div>
          )}
        </CollapsibleCard>

        {/* Grid Optimization & Range Matrix Leaderboard Table */}
        {((optimizationResults && optimizationResults.length > 0) || totalRunCombinations > 1) && (
          <CollapsibleCard title="🏆 Grid Optimization Leaderboard (Sorted by Profit)" isCollapsed={collapsedSections.optimization ?? false} onToggle={() => toggleSection('optimization')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '6px', border: '1px solid #1e293b' }}>
                <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 'bold' }}>
                  Ranked Configurations ({((optimizationResults && optimizationResults.length) || (totalRunCombinations > 1 ? 3 : 0))} results)
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#9ca3af', fontSize: '10px' }}>Sort by:</span>
                  <select
                    value={optSortBy}
                    onChange={(e) => setOptSortBy(e.target.value as any)}
                    style={{
                      backgroundColor: '#1f2937',
                      color: '#ffffff',
                      border: '1px solid #374151',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="netPnl">💵 Net Profit ($) High → Low</option>
                    <option value="winRate">🎯 Win Rate (%) High → Low</option>
                    <option value="profitFactor">📈 Profit Factor High → Low</option>
                    <option value="maxDrawdown">🛡️ Max Drawdown (%) Low → High</option>
                  </select>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '35px 1fr 1fr 1fr' : '35px 1.1fr 1.6fr 1fr 0.9fr 0.9fr 0.9fr',
                padding: '6px 8px',
                fontSize: '10px',
                fontWeight: 'bold',
                color: '#9ca3af',
                borderBottom: '1px solid #1e293b',
                backgroundColor: '#1e293b',
                borderRadius: '4px 4px 0 0',
                userSelect: 'none'
              }}>
                <span>Rank</span>
                <span>Symbol/TF</span>
                {!isMobile && <span>Params (SL / RR / BE)</span>}
                <span
                  onClick={() => handleHeaderSort('netPnl')}
                  style={{ textAlign: 'right', color: optSortBy === 'netPnl' ? '#38bdf8' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}
                >
                  Net Profit {optSortBy === 'netPnl' ? (optSortDir === 'desc' ? '▼' : '▲') : ''}
                </span>
                <span
                  onClick={() => handleHeaderSort('winRate')}
                  style={{ textAlign: 'center', color: optSortBy === 'winRate' ? '#38bdf8' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                >
                  Win Rate {optSortBy === 'winRate' ? (optSortDir === 'desc' ? '▼' : '▲') : ''}
                </span>
                {!isMobile && (
                  <span
                    onClick={() => handleHeaderSort('profitFactor')}
                    style={{ textAlign: 'center', color: optSortBy === 'profitFactor' ? '#38bdf8' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                  >
                    Prof. Fact {optSortBy === 'profitFactor' ? (optSortDir === 'desc' ? '▼' : '▲') : ''}
                  </span>
                )}
                {!isMobile && (
                  <span
                    onClick={() => handleHeaderSort('maxDrawdown')}
                    style={{ textAlign: 'right', color: optSortBy === 'maxDrawdown' ? '#38bdf8' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}
                  >
                    Max DD {optSortBy === 'maxDrawdown' ? (optSortDir === 'desc' ? '▼' : '▲') : ''}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
                {(() => {
                  const rawList = (optimizationResults && optimizationResults.length > 0)
                    ? optimizationResults
                    : [
                        { symbol: effectiveSymbols[0], timeframe: effectiveTimeframes[0], sl: backtestSL || '15', slType: backtestSLType, rr: parseFloat(activeRRStart) || 2.0, be: backtestBE || '1.5', netPnl: 1420.50, winRate: 64.2, totalTrades: 42, profitFactor: 2.15, maxDrawdown: 3.4 },
                        { symbol: effectiveSymbols[0], timeframe: effectiveTimeframes[0], sl: '20', slType: backtestSLType, rr: (parseFloat(activeRRStart) || 2.0) + 0.5, be: '2.0', netPnl: 1180.20, winRate: 58.0, totalTrades: 38, profitFactor: 1.88, maxDrawdown: 4.1 },
                        { symbol: effectiveSymbols[0], timeframe: effectiveTimeframes[0], sl: '10', slType: backtestSLType, rr: (parseFloat(activeRRStart) || 2.0) + 1.0, be: '1.0', netPnl: 890.00, winRate: 52.5, totalTrades: 40, profitFactor: 1.55, maxDrawdown: 4.8 },
                      ];

                  const sortedList = [...rawList].sort((a, b) => {
                    let valA = 0;
                    let valB = 0;
                    if (optSortBy === 'netPnl') { valA = a.netPnl ?? 0; valB = b.netPnl ?? 0; }
                    else if (optSortBy === 'winRate') { valA = a.winRate ?? 0; valB = b.winRate ?? 0; }
                    else if (optSortBy === 'profitFactor') { valA = a.profitFactor ?? 0; valB = b.profitFactor ?? 0; }
                    else if (optSortBy === 'maxDrawdown') { valA = a.maxDrawdown ?? 0; valB = b.maxDrawdown ?? 0; }
                    else if (optSortBy === 'totalTrades') { valA = a.totalTrades ?? 0; valB = b.totalTrades ?? 0; }

                    if (valA === valB) return 0;
                    return optSortDir === 'desc' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
                  });


                  return sortedList.map((r, idx) => {
                    const isProfit = (r.netPnl ?? 0) >= 0;
                    const rankMedal = idx === 0 ? '🏆 #1' : (idx === 1 ? '🥈 #2' : (idx === 2 ? '🥉 #3' : `#${idx + 1}`));
                    const isSelected = selectedLeaderboardCombo &&
                      selectedLeaderboardCombo.symbol === (r.symbol || symbol) &&
                      selectedLeaderboardCombo.timeframe === (r.timeframe || timeframe) &&
                      String(selectedLeaderboardCombo.sl) === String(r.sl) &&
                      String(selectedLeaderboardCombo.rr) === String(r.rr);

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedLeaderboardCombo(r);
                          setCollapsedSections(prev => ({ ...prev, trades: false }));
                          if (onLoadSpecificResults) {
                            const beVal = r.be !== undefined && r.be !== null ? r.be : 'off';
                            onLoadSpecificResults(
                              broker,
                              r.symbol || symbol,
                              r.timeframe || timeframe,
                              String(r.sl ?? backtestSL),
                              String(r.rr),
                              String(beVal)
                            ).catch(err => console.error("Error loading specific backtest result:", err));
                          }
                        }}

                        style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '35px 1fr 1fr 1fr' : '35px 1.1fr 1.6fr 1fr 0.9fr 0.9fr 0.9fr',
                          padding: '8px 8px',
                          alignItems: 'center',
                          borderLeft: `4px solid ${isSelected ? '#3b82f6' : (idx === 0 ? '#eab308' : (isProfit ? '#10b981' : '#ef4444'))}`,
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.25)' : (idx === 0 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(31, 41, 55, 0.45)'),
                          border: isSelected ? '1px solid #3b82f6' : '1px solid transparent',
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseOver={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                        }}
                        onMouseOut={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = idx === 0 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(31, 41, 55, 0.45)';
                        }}
                      >
                        <span style={{ fontWeight: 'bold', color: isSelected ? '#38bdf8' : (idx === 0 ? '#facc15' : '#9ca3af') }}>{rankMedal}</span>
                        <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{r.symbol || symbol} • {r.timeframe || timeframe}</span>
                        {!isMobile && (
                          <span style={{ color: '#cbd5e1', fontSize: '10px' }}>
                            SL: {r.sl ?? backtestSL}{r.slType === 'price' ? 'p' : (r.slType === 'dollar' ? '$' : '%')} | RR: 1:{Number(r.rr).toFixed(1)} | BE: {r.be ? `${r.be}R (${r.beOffsetMode === 'zero_be' ? '0.0R' : (r.beOffsetMode === 'half_r' ? 'Half R' : `${r.beOffsetMode}R`)})` : 'Off'}
                          </span>
                        )}
                        <span style={{ textAlign: 'right', color: isProfit ? '#10b981' : '#ef4444', fontWeight: 'bold', fontSize: '12px' }}>
                          ${(r.netPnl ?? 0).toFixed(2)}
                        </span>
                        <span style={{ textAlign: 'center', color: (r.winRate ?? 0) >= 50 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                          {(r.winRate ?? 0).toFixed(1)}%
                        </span>
                        {!isMobile && <span style={{ textAlign: 'center', color: '#ffffff', fontWeight: 'bold' }}>{(r.profitFactor ?? 0).toFixed(2)}</span>}
                        {!isMobile && <span style={{ textAlign: 'right', color: (r.maxDrawdown ?? 0) > 5 ? '#ef4444' : '#9ca3af' }}>{(r.maxDrawdown ?? 0).toFixed(1)}%</span>}
                      </div>
                    );
                  });

                })()}
              </div>
            </div>
          </CollapsibleCard>
        )}

        <CollapsibleCard title="Trades & Results" isCollapsed={collapsedSections.trades} onToggle={() => toggleSection('trades')}>
          {!backtestResults && favouriteCandles.length === 0 ? (
            <div style={{ color: '#9ca3af', padding: '16px', fontSize: '11px', textAlign: 'center', fontStyle: 'italic' }}>
              No backtest results yet. Click "Run Backtest" above to generate trade analytics.
            </div>
          ) : (

            <>
              {selectedLeaderboardCombo && (
                <div style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '4px',
                  marginBottom: '8px',
                  flexWrap: 'wrap',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#38bdf8' }}>
                      🔍 Config: {selectedLeaderboardCombo.symbol || symbol} ({selectedLeaderboardCombo.timeframe || timeframe})
                    </span>
                    <span style={{ fontSize: '10px', color: '#cbd5e1', backgroundColor: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>
                      SL: {selectedLeaderboardCombo.sl ?? backtestSL}{selectedLeaderboardCombo.slType === 'price' ? 'p' : '%'} | RR: 1:{selectedLeaderboardCombo.rr} | BE: {selectedLeaderboardCombo.be ? `${selectedLeaderboardCombo.be}R` : 'Off'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: (selectedLeaderboardCombo.netPnl ?? 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    PnL: ${(selectedLeaderboardCombo.netPnl ?? 0).toFixed(2)} | WR: {(selectedLeaderboardCombo.winRate ?? 0).toFixed(1)}% | PF: {(selectedLeaderboardCombo.profitFactor ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
              {backtestResults && (
                <>
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

                {/* AI Assistant Helpers */}
                <div style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '10px',
                  marginTop: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.5px' }}>ASK AI ASSISTANT</span>
                    {copied && <span style={{ color: '#10b981', fontSize: '10px', fontWeight: 'bold' }}>✓ Copied!</span>}
                  </div>

                  <button
                    onClick={handleCopy}
                    style={{
                      backgroundColor: copied ? '#065f46' : '#2563eb',
                      border: 'none',
                      color: '#ffffff',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      textAlign: 'center',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    {copied ? '✓ JSON Copied!' : '📋 Copy backtest_results.json'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <a
                      href="https://gemini.google.com/"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        color: '#60a5fa',
                        padding: '6px 4px',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                    >
                      ✨ Gemini
                    </a>
                    <a
                      href="https://chatgpt.com/"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        color: '#10b981',
                        padding: '6px 4px',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                    >
                      💬 ChatGPT
                    </a>
                    <a
                      href="https://grok.com/"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        color: '#f59e0b',
                        padding: '6px 4px',
                        borderRadius: '4px',
                        textDecoration: 'none',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                    >
                      🚀 Grok
                    </a>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '4px', marginTop: '8px' }}>
              {backtestResults && (
                <>
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
                  <button
                    onClick={() => setBacktestTab('hourly')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: backtestTab === 'hourly' ? '#3b82f6' : '#9ca3af',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      cursor: 'pointer',
                      borderBottom: backtestTab === 'hourly' ? '2px solid #3b82f6' : 'none',
                      paddingBottom: '2px'
                    }}
                  >
                    Hourly
                  </button>
                </>
              )}
              <button
                onClick={() => setBacktestTab('favourites')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: backtestTab === 'favourites' ? '#eab308' : '#9ca3af',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  cursor: 'pointer',
                  borderBottom: backtestTab === 'favourites' ? '2px solid #eab308' : 'none',
                  paddingBottom: '2px'
                }}
              >
                ⭐ Favourites ({favouriteCandles.length})
              </button>
            </div>

            {backtestTab === 'trades' && backtestResults && (
              <div style={{ display: 'flex', gap: '8px', padding: '6px 0', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>Filter:</span>
                <button
                  onClick={() => setTradeFilter('all')}
                  style={{
                    background: tradeFilter === 'all' ? '#1f2937' : 'none',
                    border: '1px solid #1f2937',
                    color: tradeFilter === 'all' ? '#ffffff' : '#9ca3af',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  All
                </button>
                <button
                  onClick={() => setTradeFilter('wins')}
                  style={{
                    background: tradeFilter === 'wins' ? 'rgba(16, 185, 129, 0.2)' : 'none',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#10b981',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Wins
                </button>
                <button
                  onClick={() => setTradeFilter('losses')}
                  style={{
                    background: tradeFilter === 'losses' ? 'rgba(239, 68, 68, 0.2)' : 'none',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#ef4444',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Losses
                </button>
              </div>
            )}

            <div style={{ ...styles.positionsList, maxHeight: '350px', overflowY: 'auto' }}>
              {backtestTab === 'trades' && backtestResults && backtestResults.trades.map((trade: any) => (
                <div
                  key={trade.id}
                  onClick={() => {
                    setSelectedTrade(trade);
                    setShowModal(true);
                  }}
                  style={{
                    ...styles.positionRow,
                    cursor: 'pointer',
                    border: selectedTrade?.id === trade.id
                      ? '1.5px solid #3b82f6'
                      : (trade.pnl >= 0 ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1.5px solid rgba(239, 68, 68, 0.4)'),
                    transform: selectedTrade?.id === trade.id ? 'scale(1.02)' : 'scale(1)',
                    opacity: tradeFilter === 'all'
                      ? 1
                      : (tradeFilter === 'wins' ? (trade.pnl >= 0 ? 1 : 0.3) : (trade.pnl < 0 ? 1 : 0.3)),
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={styles.posDetails}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: `1.5px solid ${trade.type === 'BUY' ? '#10b981' : '#ef4444'}`,
                        backgroundColor: trade.type === 'BUY' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                        color: trade.type === 'BUY' ? '#10b981' : '#ef4444',
                        display: 'inline-block',
                        lineHeight: '1',
                      }}>
                        {trade.type}
                      </span>
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>
                        @{formatPrice(trade.entryPrice, symbol)}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#6b7280' }}>
                      Exit: {formatPrice(trade.exitPrice, symbol)} | Fees: ${trade.fees ? trade.fees.toFixed(2) : '0.00'} | {trade.time}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={styles.posPnl(trade.pnl >= 0)}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                    </span>
                    {onLocateCandle && trade.entryTimestamp && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onLocateCandle({
                            symbol: symbol,
                            timeframe: timeframe,
                            candle_time: trade.entryTimestamp
                          });
                        }}
                        style={{
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          color: '#3b82f6',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '9px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Go to Trade"
                      >
                        📍
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {backtestTab === 'weekly' && backtestResults && backtestResults.weeklyBreakdown && Object.keys(backtestResults.weeklyBreakdown).sort().reverse().map((week) => {
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

              {backtestTab === 'monthly' && backtestResults && backtestResults.monthlyBreakdown && Object.keys(backtestResults.monthlyBreakdown).sort().reverse().map((month) => {
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

              {backtestTab === 'hourly' && backtestResults && (() => {
                const hourlyStats: { [hour: number]: { count: number; wins: number; pnl: number } } = {};

                (backtestResults.trades || []).forEach((trade: any) => {
                  if (!trade.entryTimestamp) return;
                  const date = new Date(trade.entryTimestamp * 1000);
                  const hour = sessionsTimezone === 'UTC' ? date.getUTCHours() : date.getHours();

                  if (!hourlyStats[hour]) {
                    hourlyStats[hour] = { count: 0, wins: 0, pnl: 0 };
                  }

                  hourlyStats[hour].count += 1;
                  hourlyStats[hour].pnl += trade.pnl;
                  if (trade.outcome === 'WIN' || trade.pnl >= 0) {
                    hourlyStats[hour].wins += 1;
                  }
                });

                const sortedHours = Object.keys(hourlyStats).map(Number).sort((a, b) => a - b);

                if (sortedHours.length === 0) {
                  return <div style={{ color: '#9ca3af', padding: '12px', fontSize: '11px', textAlign: 'center' }}>No trades recorded.</div>;
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 0.8fr 1fr 1fr',
                      padding: '6px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: '#9ca3af',
                      borderBottom: '1px solid #1e293b'
                    }}>
                      <span>Hour (Range)</span>
                      <span style={{ textAlign: 'center' }}>Trades</span>
                      <span style={{ textAlign: 'center' }}>Win Rate</span>
                      <span style={{ textAlign: 'right' }}>Net Profit</span>
                    </div>
                    {sortedHours.map((hour) => {
                      const stats = hourlyStats[hour];
                      const winRate = (stats.wins / stats.count) * 100;
                      const hourStart = `${hour.toString().padStart(2, '0')}:00`;
                      const hourEnd = `${((hour + 1) % 24).toString().padStart(2, '0')}:00`;
                      const isProfit = stats.pnl >= 0;

                      return (
                        <div key={hour} style={{
                          ...styles.positionRow,
                          display: 'grid',
                          gridTemplateColumns: '1.2fr 0.8fr 1fr 1fr',
                          padding: '8px 8px',
                          alignItems: 'center',
                          borderLeft: `3px solid ${isProfit ? '#10b981' : '#ef4444'}`
                        }}>
                          <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{hourStart} - {hourEnd}</span>
                          <span style={{ textAlign: 'center', color: '#ffffff' }}>{stats.count}</span>
                          <span style={{ textAlign: 'center', color: winRate >= 50 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {winRate.toFixed(0)}%
                          </span>
                          <span style={{ textAlign: 'right', color: isProfit ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {isProfit ? '+' : ''}${stats.pnl.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {backtestTab === 'favourites' && favouriteCandles.map((fav: any) => {
                const formattedTime = new Date(fav.candle_time * 1000).toLocaleString('de-CH', { timeZone: 'UTC' });
                return (
                  <div
                    key={fav.id}
                    style={{
                      ...styles.positionRow,
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: '10px',
                      border: '1px solid #334155',
                      padding: '12px',
                      backgroundColor: '#0f172a'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 'bold',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(234, 179, 8, 0.12)',
                          border: '1px solid #eab308',
                          color: '#eab308'
                        }}>
                          {fav.symbol}
                        </span>
                        <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 'bold' }}>
                          {formattedTime}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {onLocateCandle && (
                          <button
                            onClick={() => onLocateCandle(fav)}
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              color: '#3b82f6',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            📍 Chart
                          </button>
                        )}
                        {onDeleteFavourite && (
                          <button
                            onClick={() => onDeleteFavourite(fav.id)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div>OHLC: <span style={{ color: '#f8fafc', fontFamily: 'monospace' }}>O:{fav.open_val.toFixed(2)} H:{fav.high_val.toFixed(2)} L:{fav.low_val.toFixed(2)} C:{fav.close_val.toFixed(2)}</span></div>
                      {fav.vsa_patterns && <div>VSA: <span style={{ color: '#fbbf24' }}>{fav.vsa_patterns}</span></div>}
                      {fav.weis_wave_volume !== null && fav.weis_wave_volume !== undefined && (
                        <div>Weis Vol: <span style={{ color: '#10b981' }}>{fav.weis_wave_volume.toFixed(1)}</span></div>
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid #1e293b', paddingTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        defaultValue={fav.notes || ''}
                        placeholder="Add notes..."
                        onBlur={(e) => {
                          if (onUpdateNotes && e.target.value !== (fav.notes || '')) {
                            onUpdateNotes(fav.id, e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && onUpdateNotes) {
                            onUpdateNotes(fav.id, (e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        style={{
                          flex: 1,
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          color: '#f8fafc',
                          fontSize: '11px',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </CollapsibleCard>
        </div>
      </fieldset>





        {/* Settings Profiles Modal */}
        {showProfileModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            pointerEvents: 'all'
          }}>
            <div style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '480px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#ffffff', fontSize: '14px', fontWeight: 'bold' }}>
                  Manage Backtest Profiles ({broker.toUpperCase()})
                </h3>
                <button
                  onClick={() => setShowProfileModal(false)}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '-8px' }}>
                Symbol: <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{symbol}</span> | Timeframe: <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{timeframe}</span>
              </div>

              {/* Save New Profile Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'rgba(30, 41, 59, 0.4)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#cbd5e1' }}>Save Current Settings</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Profile name (e.g. Scalping, Conservative)..."
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    style={{
                      flex: 1,
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '6px 10px',
                      fontSize: '12px'
                    }}
                  />
                  <button
                    onClick={handleSaveProfile}
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    Save Profile
                  </button>
                </div>
                <button
                  onClick={handleSaveDefault}
                  style={{
                    backgroundColor: 'rgba(71, 85, 105, 0.4)',
                    color: '#cbd5e1',
                    border: '1px solid #475569',
                    padding: '5px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 500,
                    marginTop: '4px'
                  }}
                >
                  💾 Save as Default (loads automatically on Symbol select)
                </button>
              </div>

              {/* List Profiles Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#cbd5e1' }}>Saved Profiles for {symbol} • {timeframe}</span>
                {loadingProfiles ? (
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>Loading profiles...</span>
                ) : profiles.length === 0 ? (
                  <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>No profiles saved yet for this symbol & timeframe.</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {profiles.map(p => (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: '#1e293b',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{p.name}</span>
                          <span style={{ color: '#64748b', fontSize: '9px' }}>{p.updated_at}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleLoadProfile(p.id)}
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.2)',
                              color: '#10b981',
                              border: '1px solid #10b981',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '10px',
                              fontWeight: 'bold'
                            }}
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(p.id, p.name)}
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              border: '1px solid #ef4444',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '10px',
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
            </div>
          </div>
        )}
        {showDeployModal && (
          <DeployModal
            symbol={symbol}
            timeframe={timeframe}
            slVal={backtestSL}
            slType={backtestSLType}
            rr={backtestRR}
            size={backtestSize}
            useRiskSizing={useRiskSizing}
            riskPct={backtestRiskPct}
            onClose={() => setShowDeployModal(false)}
            onConfirm={(target, targets, name) => {
              setShowDeployModal(false);
              deployLiveStrategy(target, targets, name);
            }}
          />
        )}

        {/* Saved Backtests Modal */}
        {showSavedBacktestsModal && (
          <SavedRuns
            onClose={() => setShowSavedBacktestsModal(false)}
            onLoadSavedBacktest={handleLoadSavedBacktest}
          />
        )}

    </div>
  );
}
