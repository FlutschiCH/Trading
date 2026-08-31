import React, { useState, useEffect, useMemo, useRef } from 'react';
import { API_BASE_URL } from '../api';

export interface SymbolTimeframeSelectorProps {
  multiSelect?: boolean;
  
  showTimeframe?: boolean;
  showSymbol?: boolean;
  showLabel?: boolean;
  symbolLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  onlyUseAvailableSymbols?: boolean;
  symbolSource?: 'master' | 'fetched' | 'both';
  accountId?: string;
  onRefresh?: () => void;

  // Single-select
  symbol?: string;
  onSymbolChange?: (sym: string) => void;
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;

  // Multi-select
  selectedSymbols?: string[];
  onSelectedSymbolsChange?: (syms: string[]) => void;
  selectedTimeframes?: string[];
  onSelectedTimeframesChange?: (tfs: string[]) => void;

  availableSymbols?: string[];
  availableTimeframes?: string[];
  isLight?: boolean;
}

export const SymbolTimeframeSelector: React.FC<SymbolTimeframeSelectorProps> = ({
  multiSelect = false,
  showTimeframe = true,
  showSymbol = true,
  showLabel = true,
  symbolLabel,
  placeholder = 'Search symbol...',
  disabled = false,
  onlyUseAvailableSymbols = false,
  symbolSource = 'both',
  accountId,
  onRefresh,
  symbol = 'EURUSD',
  onSymbolChange,
  timeframe = '15m',
  onTimeframeChange,
  selectedSymbols = [],
  onSelectedSymbolsChange,
  selectedTimeframes = [],
  onSelectedTimeframesChange,
  availableSymbols = ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD', 'US30', 'GER40'],
  availableTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
  isLight = false,
}) => {
  // Favorites synced with localStorage
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

  // Fetch symbol mappings and connected brokers from backend
  const [symbolMappings, setSymbolMappings] = useState<any[]>([]);
  const [fetchedBrokerSymbols, setFetchedBrokerSymbols] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchConnectedBrokersAndMappings = async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch symbol mappings
      const mappingsRes = await fetch(`${API_BASE_URL}/api/symbol-mappings`);
      const mappingsData = await mappingsRes.json();
      if (mappingsData && mappingsData.status === 'success' && Array.isArray(mappingsData.data)) {
        setSymbolMappings(mappingsData.data);
      }

      // 2. Fetch connected brokers
      const brokersRes = await fetch(`${API_BASE_URL}/api/symbol-mappings/connected-brokers`);
      const brokersData = await brokersRes.json();
      if (brokersData && brokersData.status === 'success' && Array.isArray(brokersData.data)) {
        const brokers: any[] = brokersData.data;
        const targetAccId = accountId || localStorage.getItem('broker_account') || localStorage.getItem('wyckoff_active_account_id') || localStorage.getItem('active_account_id') || localStorage.getItem('wyckoff_active_account');
        let matchedBroker = targetAccId ? brokers.find(b => String(b.account_id) === String(targetAccId)) : null;
        if (!matchedBroker && brokers.length > 0) {
          matchedBroker = brokers[0];
        }
        
        if (matchedBroker && Array.isArray(matchedBroker.symbols) && matchedBroker.symbols.length > 0) {
          setFetchedBrokerSymbols(matchedBroker.symbols);
        } else {
          const allSyms = new Set<string>();
          brokers.forEach(b => {
            if (Array.isArray(b.symbols)) b.symbols.forEach((s: string) => allSyms.add(s));
          });
          setFetchedBrokerSymbols(Array.from(allSyms));
        }
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Error refreshing symbols in SymbolTimeframeSelector:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchConnectedBrokersAndMappings();
  }, [accountId]);

  const mappedMasterSymbols = useMemo(() => {
    const masterSet = new Set<string>();
    const mainToBrokerMap: Record<string, string[]> = {};
    const brokerToMainMap: Record<string, string> = {};

    symbolMappings.forEach((m: any) => {
      const main = (m.main_symbol || '').trim().toUpperCase();
      const brokerSym = (m.broker_symbol || '').trim();
      if (main) {
        masterSet.add(main);
        if (!mainToBrokerMap[main]) mainToBrokerMap[main] = [];
        if (brokerSym && !mainToBrokerMap[main].includes(brokerSym)) {
          mainToBrokerMap[main].push(brokerSym);
          brokerToMainMap[brokerSym] = main;
        }
      }
    });

    return {
      masterList: Array.from(masterSet),
      mainToBrokerMap,
      brokerToMainMap
    };
  }, [symbolMappings]);

  const effectiveAvailableSymbols = useMemo(() => {
    if (availableSymbols && availableSymbols.length > 0) {
      return availableSymbols;
    }
    return fetchedBrokerSymbols;
  }, [availableSymbols, fetchedBrokerSymbols]);

  // Combined symbols list based on symbolSource mode ('master' | 'fetched' | 'both')
  const combinedSymbols = useMemo(() => {
    if (symbolSource === 'fetched' || onlyUseAvailableSymbols) {
      return Array.from(new Set([...effectiveAvailableSymbols, symbol].filter(Boolean)));
    }
    if (symbolSource === 'master') {
      const defaultMasters = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'GER40', 'US30', 'US100', 'NAS100', 'SPX500'];
      return Array.from(new Set([
        ...defaultMasters,
        ...mappedMasterSymbols.masterList,
        ...effectiveAvailableSymbols,
        symbol
      ].filter(Boolean))).sort();
    }
    // symbolSource === 'both' (default view for chart & backtester)
    return Array.from(new Set([
      ...mappedMasterSymbols.masterList,
      ...effectiveAvailableSymbols,
      symbol,
      ...favoriteSymbols
    ].filter(Boolean)));
  }, [symbolSource, onlyUseAvailableSymbols, mappedMasterSymbols, effectiveAvailableSymbols, symbol, favoriteSymbols]);

  // Combined timeframes list
  const combinedTimeframes = useMemo(() => {
    return Array.from(new Set([
      ...availableTimeframes,
      timeframe,
      ...favoriteTimeframes
    ].filter(Boolean)));
  }, [availableTimeframes, timeframe, favoriteTimeframes]);

  // Dropdown states & search
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);

  const symbolDropdownRef = useRef<HTMLDivElement>(null);
  const timeframeDropdownRef = useRef<HTMLDivElement>(null);

  // Filtered & sorted symbol list
  const sortedSymbols = useMemo(() => {
    return [...combinedSymbols]
      .filter(s => {
        const q = symbolSearch.toLowerCase();
        const targets = mappedMasterSymbols.mainToBrokerMap[s] || [];
        return s.toLowerCase().includes(q) || targets.some(t => t.toLowerCase().includes(q));
      })
      .sort((a, b) => {
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
  }, [combinedSymbols, favoriteSymbols, mappedMasterSymbols, symbolSearch]);

  const sortedTimeframes = useMemo(() => {
    return [...combinedTimeframes].sort((a, b) => {
      const aFav = favoriteTimeframes.includes(a);
      const bFav = favoriteTimeframes.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [combinedTimeframes, favoriteTimeframes]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSymbolDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowSymbolDropdown(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % (sortedSymbols.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + (sortedSymbols.length || 1)) % (sortedSymbols.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sortedSymbols[highlightedIndex]) {
        handleSymbolSelect(sortedSymbols[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSymbolDropdown(false);
    }
  };

  const handleSymbolSelect = (sym: string) => {
    if (multiSelect) {
      if (onSelectedSymbolsChange) {
        const exists = selectedSymbols.includes(sym);
        const next = exists ? selectedSymbols.filter(s => s !== sym) : [...selectedSymbols, sym];
        onSelectedSymbolsChange(next);
      }
    } else {
      if (onSymbolChange) onSymbolChange(sym);
      setShowSymbolDropdown(false);
    }
  };

  const handleTimeframeSelect = (tf: string) => {
    if (multiSelect) {
      if (onSelectedTimeframesChange) {
        const exists = selectedTimeframes.includes(tf);
        const next = exists ? selectedTimeframes.filter(t => t !== tf) : [...selectedTimeframes, tf];
        onSelectedTimeframesChange(next);
      }
    } else {
      if (onTimeframeChange) onTimeframeChange(tf);
      setShowTimeframeDropdown(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      {/* Symbol Selector */}
      {showSymbol && (
        <div ref={symbolDropdownRef} style={{ position: 'relative', flex: 1, minWidth: multiSelect ? '280px' : '180px' }}>
          {showLabel && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#475569' : '#9ca3af' }}>
                {symbolLabel ? symbolLabel : (multiSelect
                  ? `Target Symbols (${selectedSymbols.length > 0 ? `${selectedSymbols.length} selected` : `Fallback: ${symbol}`})`
                  : 'Symbol')}
              </span>
              {multiSelect && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onSelectedSymbolsChange && onSelectedSymbolsChange(sortedSymbols.filter(s => favoriteSymbols.includes(s)))}
                    style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                    title="Select starred favorite symbols"
                  >
                    ★ Favorites
                  </button>
                  {mappedMasterSymbols.masterList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onSelectedSymbolsChange && onSelectedSymbolsChange(sortedSymbols.filter(s => mappedMasterSymbols.masterList.includes(s)))}
                      style={{ background: 'none', border: 'none', color: '#a855f7', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                      title="Select all master mapped symbols"
                    >
                      🔀 Master Maps
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectedSymbolsChange && onSelectedSymbolsChange([...sortedSymbols])}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '10px', cursor: 'pointer' }}
                  >
                    All
                  </button>
                  {selectedSymbols.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onSelectedSymbolsChange && onSelectedSymbolsChange([])}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Symbol Input / Trigger */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              readOnly={!showSymbolDropdown}
              disabled={disabled}
              placeholder={placeholder}
              value={multiSelect ? (selectedSymbols.length > 0 ? selectedSymbols.join(', ') : symbol) : (showSymbolDropdown ? symbolSearch : symbol)}
              onFocus={() => {
                setSymbolSearch('');
                setShowSymbolDropdown(true);
              }}
              onClick={() => setShowSymbolDropdown(true)}
              onChange={(e) => {
                setSymbolSearch(e.target.value);
                setShowSymbolDropdown(true);
                if (!multiSelect && onSymbolChange) onSymbolChange(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: isLight ? '#f1f5f9' : '#1e293b',
                color: isLight ? '#0f172a' : '#ffffff',
                border: isLight ? '1px solid #cbd5e1' : (showSymbolDropdown ? '1px solid #3b82f6' : '1px solid #334155'),
                borderRadius: '6px',
                padding: '6px 28px 6px 10px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '10px'
              }}
            >
              {showSymbolDropdown ? '▲' : '▼'}
            </button>
          </div>

          {/* Dropdown Popup */}
          {showSymbolDropdown && (
            <>
              <div
                onClick={() => setShowSymbolDropdown(false)}
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
              />
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                backgroundColor: isLight ? '#ffffff' : '#0f172a',
                border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                borderRadius: '8px',
                zIndex: 1000,
                boxShadow: '0 15px 30px rgba(0, 0, 0, 0.4)',
                minWidth: '240px',
                width: '100%',
                overflow: 'hidden',
                marginTop: '4px'
              }}>
                <div style={{ padding: '6px', borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #334155', backgroundColor: isLight ? '#f8fafc' : '#1e293b', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="🔍 Type to search symbols..."
                    value={symbolSearch}
                    onChange={(e) => {
                      setSymbolSearch(e.target.value);
                      if (!multiSelect && onSymbolChange) onSymbolChange(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    style={{
                      flex: 1,
                      boxSizing: 'border-box',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: isLight ? '1px solid #cbd5e1' : '1px solid #475569',
                      backgroundColor: isLight ? '#ffffff' : '#0f172a',
                      color: isLight ? '#0f172a' : '#ffffff',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchConnectedBrokersAndMappings();
                    }}
                    disabled={isRefreshing}
                    style={{
                      backgroundColor: isLight ? '#e2e8f0' : '#334155',
                      color: isLight ? '#0f172a' : '#38bdf8',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}
                    title="Refresh available symbols from backend"
                  >
                    🔄 {isRefreshing ? '...' : 'Refresh'}
                  </button>
                </div>

                <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px' }}>
                  {sortedSymbols.length > 0 ? (
                    sortedSymbols.slice(0, 100).map((sym, idx) => {
                      const isSelected = multiSelect ? selectedSymbols.includes(sym) : symbol === sym;
                      const isFav = favoriteSymbols.includes(sym);
                      const isMasterMap = mappedMasterSymbols.masterList.includes(sym);
                      const brokerTargets = mappedMasterSymbols.mainToBrokerMap[sym];

                      return (
                        <div
                          key={sym}
                          onClick={() => handleSymbolSelect(sym)}
                          style={{
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: isLight ? '#0f172a' : '#ffffff',
                            backgroundColor: idx === highlightedIndex
                              ? '#2563eb'
                              : (isSelected ? 'rgba(37, 99, 235, 0.2)' : 'transparent'),
                            transition: 'background-color 0.15s',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderRadius: '4px'
                          }}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {multiSelect && <span style={{ fontSize: '12px' }}>{isSelected ? '☑' : '☐'}</span>}
                            <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{sym}</span>
                            {isMasterMap && (
                              <span style={{ fontSize: '9px', color: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.15)', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                                🔀 Master{brokerTargets && brokerTargets.length > 0 ? ` (➔ ${brokerTargets.join(', ')})` : ''}
                              </span>
                            )}
                          </div>
                          <span
                            onClick={(e) => toggleFavoriteSymbol(sym, e)}
                            style={{
                              color: isFav ? '#f59e0b' : '#64748b',
                              fontSize: '14px',
                              padding: '2px 4px',
                              cursor: 'pointer',
                              transition: 'color 0.15s'
                            }}
                            title={isFav ? "Unstar symbol" : "Star favorite symbol"}
                          >
                            {isFav ? '★' : '☆'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '8px 10px', fontSize: '11px', color: '#6b7280', textAlign: 'center' }}>
                      No symbols found
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Timeframe Selector */}
      {showTimeframe && (
        <div ref={timeframeDropdownRef} style={{ position: 'relative', minWidth: multiSelect ? '220px' : '120px' }}>
          {showLabel && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: isLight ? '#475569' : '#9ca3af' }}>
                {multiSelect
                  ? `Target Timeframes (${selectedTimeframes.length > 0 ? `${selectedTimeframes.length} selected` : `Fallback: ${timeframe}`})`
                  : 'Timeframe'}
              </span>
              {multiSelect && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onSelectedTimeframesChange && onSelectedTimeframesChange(sortedTimeframes.filter(t => favoriteTimeframes.includes(t)))}
                    style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                    title="Select starred favorite timeframes"
                  >
                    ★ Favorites
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectedTimeframesChange && onSelectedTimeframesChange([...sortedTimeframes])}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '10px', cursor: 'pointer' }}
                  >
                    All
                  </button>
                  {selectedTimeframes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onSelectedTimeframesChange && onSelectedTimeframesChange([])}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Timeframe Trigger */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowTimeframeDropdown(!showTimeframeDropdown)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: isLight ? '#f1f5f9' : '#1e293b',
                color: isLight ? '#0f172a' : '#ffffff',
                border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '180px'
              }}>
                {multiSelect ? (selectedTimeframes.length > 0 ? selectedTimeframes.join(', ') : timeframe) : timeframe}
              </span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>{showTimeframeDropdown ? '▲' : '▼'}</span>
            </button>
          </div>

          {/* Timeframe Dropdown */}
          {showTimeframeDropdown && (
            <>
              <div
                onClick={() => setShowTimeframeDropdown(false)}
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
              />
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: isLight ? '#ffffff' : '#0f172a',
                border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
                borderRadius: '8px',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                minWidth: '140px',
                padding: '4px',
                marginTop: '4px'
              }}>
                {sortedTimeframes.map((tf) => {
                  const isSelected = multiSelect ? selectedTimeframes.includes(tf) : timeframe === tf;
                  const isFav = favoriteTimeframes.includes(tf);
                  return (
                    <div
                      key={tf}
                      onClick={() => handleTimeframeSelect(tf)}
                      style={{
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: isLight ? '#0f172a' : '#ffffff',
                        backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                        transition: 'background-color 0.15s',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderRadius: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {multiSelect && <span style={{ fontSize: '12px' }}>{isSelected ? '☑' : '☐'}</span>}
                        <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{tf}</span>
                      </div>
                      <span
                        onClick={(e) => toggleFavoriteTimeframe(tf, e)}
                        style={{
                          color: isFav ? '#f59e0b' : '#64748b',
                          fontSize: '14px',
                          padding: '2px 4px',
                          cursor: 'pointer',
                          transition: 'color 0.15s'
                        }}
                        title={isFav ? "Unstar timeframe" : "Star favorite timeframe"}
                      >
                        {isFav ? '★' : '☆'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
