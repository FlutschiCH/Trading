import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../api';
import { RefreshCw, Plus, Trash2, Database, Clock, Server, CheckCircle2, XCircle } from 'lucide-react';

interface TrackedSymbol {
  symbol: string;
  is_active: boolean;
  added_at: string | null;
  last_synced: string | null;
  server: string;
  candle_count: number;
}

interface CandleCollectorPanelProps {
  availableSymbols?: string[];
}

export const CandleCollectorPanel: React.FC<CandleCollectorPanelProps> = ({ availableSymbols = [] }) => {
  const [symbols, setSymbols] = useState<TrackedSymbol[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(600); // 10 minutes in seconds

  // Broker symbols & TVChart-style dropdown states
  const [brokerSymbols, setBrokerSymbols] = useState<string[]>([]);
  const [loadingBrokerSymbols, setLoadingBrokerSymbols] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Favorites logic matching TVChart
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wyckoff_fav_symbols');
      return saved ? JSON.parse(saved) : ['BTCUSD', 'EURUSD', 'XAUUSD'];
    } catch {
      return ['BTCUSD', 'EURUSD', 'XAUUSD'];
    }
  });

  useEffect(() => {
    localStorage.setItem('wyckoff_fav_symbols', JSON.stringify(favoriteSymbols));
  }, [favoriteSymbols]);

  const toggleFavoriteSymbol = (sym: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavoriteSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const fetchBrokerSymbols = async () => {
    setLoadingBrokerSymbols(true);
    try {
      const savedId = localStorage.getItem('broker_account') || localStorage.getItem('wyckoff_active_account_id');
      let accId = (savedId && !['none', 'null', 'undefined'].includes(String(savedId).trim().toLowerCase())) ? savedId : null;
      if (!accId) {
        try {
          const saved = localStorage.getItem('wyckoff_active_account');
          if (saved) {
            const parsed = JSON.parse(saved);
            accId = parsed?.account_id || parsed?.id;
          }
        } catch { }
      }
      const queryParam = accId ? `?account_id=${encodeURIComponent(accId)}` : '';
      const res = await fetch(`${API_BASE_URL}/api/metatrader/symbols${queryParam}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
          setBrokerSymbols(data.data);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load MT5 broker symbols:', e);
    } finally {
      setLoadingBrokerSymbols(false);
    }

    const fallbackList = availableSymbols.length > 0
      ? availableSymbols
      : ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD', 'US30', 'GER40'];
    setBrokerSymbols(fallbackList);
  };

  useEffect(() => {
    fetchBrokerSymbols();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/candle-collector/symbols`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        setSymbols(data.symbols || []);
        if (data.next_sync_timestamp && data.next_sync_timestamp > 0) {
          const now = Date.now() / 1000;
          const remaining = Math.max(0, Math.floor(data.next_sync_timestamp - now));
          setCountdown(remaining > 0 ? remaining : 600);
        }
      }
    } catch (err) {
      console.error('Failed to fetch candle collector stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStats();
          return 600;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectSymbol = (sym: string) => {
    setNewSymbol(sym);
    setSymbolSearch(sym);
    setShowSymbolDropdown(false);
  };

  const filteredSymbols = [...brokerSymbols]
    .filter((s) => s.toLowerCase().includes(symbolSearch.toLowerCase()))
    .sort((a, b) => {
      const aFav = favoriteSymbols.includes(a);
      const bFav = favoriteSymbols.includes(b);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.localeCompare(b);
    });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSymbolDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, filteredSymbols.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredSymbols.length) % Math.max(1, filteredSymbols.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSymbols[highlightedIndex]) {
        handleSelectSymbol(filteredSymbols[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSymbolDropdown(false);
    }
  };

  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;

    try {
      setError(null);
      setSuccess(null);
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/candle-collector/symbols`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newSymbol.trim() }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Backend returned non-JSON response (e.g. 404 or 500 HTML error).');
      }
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSuccess(data.message || `Added ${newSymbol}`);
        setNewSymbol('');
        setSymbolSearch('');
        fetchStats();
      } else {
        setError(data.message || 'Failed to add symbol');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSymbol = async (symbol: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/candle-collector/symbols/${encodeURIComponent(symbol)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        fetchStats();
      }
    } catch (err) {
      console.error('Error toggling symbol:', err);
    }
  };

  const handleRemoveSymbol = async (symbol: string) => {
    if (!confirm(`Are you sure you want to stop collecting 1m candles for ${symbol}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/candle-collector/symbols/${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        fetchStats();
      }
    } catch (err) {
      console.error('Error removing symbol:', err);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(null);
      const res = await fetch(`${API_BASE_URL}/api/candle-collector/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Backend returned non-JSON response (e.g. 404 or 500 HTML error).');
      }
      const data = await res.json();
      if (res.ok) {
        setSuccess('Manual sync completed successfully.');
        setCountdown(600);
        fetchStats();
      } else {
        setError(data.message || 'Sync failed');
      }
    } catch (err: any) {
      setError(err.message || 'Sync error');
    } finally {
      setSyncing(false);
    }
  };

  const activeFavSymbols = favoriteSymbols.filter((s) => brokerSymbols.includes(s));

  return (
    <div
      style={{
        backgroundColor: '#0b0f19',
        border: '1px solid #1f2937',
        borderRadius: '8px',
        padding: '12px',
        marginTop: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Header section matching Live Overview panel */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #1f2937',
          paddingBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={14} className="text-emerald-400" />
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>
            1M CANDLE COLLECTOR ({symbols.length})
          </span>
          <button
            onClick={fetchStats}
            title="Refresh collector status"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px',
              borderRadius: '4px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              padding: '3px 8px',
              borderRadius: '12px',
            }}
          >
            <Clock size={12} />
            <span>Next sync in {formatCountdown(countdown)}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              opacity: syncing ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #7f1d1d',
            color: '#ef4444',
            fontSize: '11px',
            padding: '8px 12px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <XCircle size={14} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid #065f46',
            color: '#10b981',
            fontSize: '11px',
            padding: '8px 12px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <CheckCircle2 size={14} />
          <span>{success}</span>
        </div>
      )}

      {/* Add Symbol Input Bar matching TVChart dropdown with favorites */}
      <form onSubmit={handleAddSymbol} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          {/* Quick Favorite Buttons Bar */}
          {activeFavSymbols.length > 0 && !showSymbolDropdown && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', overflowX: 'auto' }}>
              {activeFavSymbols.map((fav) => (
                <button
                  key={`fav-${fav}`}
                  type="button"
                  onClick={() => handleSelectSymbol(fav)}
                  style={{
                    backgroundColor: newSymbol === fav ? 'rgba(59, 130, 246, 0.25)' : '#1e293b',
                    color: newSymbol === fav ? '#60a5fa' : '#cbd5e1',
                    border: `1px solid ${newSymbol === fav ? '#3b82f6' : '#334155'}`,
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  ★ {fav}
                </button>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder={loadingBrokerSymbols ? 'Loading symbols...' : 'Search MetaTrader symbol...'}
            value={showSymbolDropdown ? symbolSearch : newSymbol}
            onFocus={() => {
              setSymbolSearch('');
              setShowSymbolDropdown(true);
            }}
            onChange={(e) => setSymbolSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              backgroundColor: '#1e293b',
              color: '#ffffff',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              outline: 'none',
            }}
          />

          {showSymbolDropdown && (
            <>
              <div
                onClick={() => setShowSymbolDropdown(false)}
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
              />
              <div
                style={{
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
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                  marginTop: '4px',
                }}
              >
                {filteredSymbols.length > 0 ? (
                  filteredSymbols.map((sym, idx) => (
                    <div
                      key={sym}
                      onClick={() => handleSelectSymbol(sym)}
                      style={{
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: '#ffffff',
                        backgroundColor:
                          idx === highlightedIndex
                            ? '#2563eb'
                            : newSymbol === sym
                            ? 'rgba(37, 99, 235, 0.3)'
                            : 'transparent',
                        transition: 'background-color 0.15s',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                    >
                      <span>{sym}</span>
                      <span
                        onClick={(e) => toggleFavoriteSymbol(sym, e)}
                        style={{
                          color: favoriteSymbols.includes(sym) ? '#f59e0b' : '#4b5563',
                          fontSize: '14px',
                          padding: '2px 4px',
                          cursor: 'pointer',
                          transition: 'color 0.15s',
                        }}
                      >
                        ★
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '6px 10px', fontSize: '11px', color: '#6b7280' }}>
                    No matching symbols found
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !newSymbol.trim()}
          style={{
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            opacity: loading || !newSymbol.trim() ? 0.5 : 1,
            transition: 'all 0.2s',
          }}
        >
          <Plus size={14} /> Add Symbol
        </button>
      </form>

      {/* Tracked Symbols List styled matching live_overview_panel strategy cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
        {symbols.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '80px',
              color: '#64748b',
              fontSize: '12px',
              border: '1px dashed #1f2937',
              borderRadius: '6px',
            }}
          >
            <span>No symbols registered for 1m candle collection.</span>
            <span style={{ fontSize: '10px', marginTop: '2px' }}>Add a symbol above to start background collection.</span>
          </div>
        ) : (
          symbols.map((item) => {
            const isPaused = !item.is_active;

            return (
              <div
                key={item.symbol}
                style={{
                  backgroundColor: '#0b0f19',
                  border: '1px solid #1f2937',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  opacity: isPaused ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {/* Left side: Symbol & Server info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: item.is_active ? '#10b981' : '#6b7280',
                      boxShadow: item.is_active ? '0 0 6px #10b981' : 'none',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#ffffff', letterSpacing: '0.5px' }}>
                      {item.symbol}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Server size={10} />
                      <span>{item.server || 'Default MT5 Server'}</span>
                    </div>
                  </div>
                </div>

                {/* Right side: Stored candles count & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>Stored 1M Candles</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981', fontFamily: 'monospace' }}>
                      {item.candle_count.toLocaleString()}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleSymbol(item.symbol, item.is_active)}
                    style={{
                      backgroundColor: item.is_active ? 'rgba(16, 185, 129, 0.15)' : '#1f2937',
                      color: item.is_active ? '#10b981' : '#9ca3af',
                      border: `1px solid ${item.is_active ? 'rgba(16, 185, 129, 0.3)' : '#374151'}`,
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    {item.is_active ? 'Active' : 'Paused'}
                  </button>

                  <button
                    onClick={() => handleRemoveSymbol(item.symbol)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                    title="Remove symbol"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
