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

  // Broker symbols dropdown states
  const [brokerSymbols, setBrokerSymbols] = useState<string[]>([]);
  const [loadingBrokerSymbols, setLoadingBrokerSymbols] = useState(false);
  const [brokerSymbolSearch, setBrokerSymbolSearch] = useState('');
  const [showBrokerSymbolDropdown, setShowBrokerSymbolDropdown] = useState(false);

  const fetchBrokerSymbols = async () => {
    setLoadingBrokerSymbols(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/metatrader/symbols`);
      if (res.ok) {
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

    // Fallback to default symbols if MT5 endpoint returns empty
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
      if (res.ok) {
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

  // Visual countdown timer ticking down every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStats();
          return 600; // Reset to 10 minutes
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

  const handleSelectBrokerSymbol = (sym: string) => {
    setNewSymbol(sym);
    setBrokerSymbolSearch(sym);
    setShowBrokerSymbolDropdown(false);
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
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSuccess(data.message || `Added ${newSymbol}`);
        setNewSymbol('');
        setBrokerSymbolSearch('');
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
      await fetch(`${API_BASE_URL}/api/candle-collector/symbols/${encodeURIComponent(symbol)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      fetchStats();
    } catch (err) {
      console.error('Error toggling symbol:', err);
    }
  };

  const handleRemoveSymbol = async (symbol: string) => {
    if (!confirm(`Are you sure you want to stop collecting 1m candles for ${symbol}?`)) return;
    try {
      await fetch(`${API_BASE_URL}/api/candle-collector/symbols/${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      });
      fetchStats();
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
      const data = await res.json();
      if (res.ok) {
        setSuccess('Manual sync completed successfully.');
        setCountdown(600); // Reset timer
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

  const [showContent, setShowContent] = useState(true);

  const filteredBrokerSymbols = brokerSymbols.filter((s) =>
    s.toLowerCase().includes(brokerSymbolSearch.toLowerCase())
  );

  return (
    <div
      style={{
        backgroundColor: 'var(--app-card-bg, #111827)',
        border: '1px solid var(--app-card-border, #1f2937)',
        borderRadius: '12px',
        overflow: 'hidden',
        marginTop: '24px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--app-panel-header-bg, #1e293b)',
          padding: '10px 16px',
          borderBottom: showContent ? '1px solid var(--app-card-border, #1f2937)' : 'none',
          fontSize: '12px',
          fontWeight: 'bold',
          color: 'var(--app-text, #f3f4f6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database className="w-4 h-4 text-emerald-400" />
          <span>1M MetaTrader Candle Collector</span>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981',
              display: 'inline-block',
            }}
            title="Collector Service Active"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Visual Countdown Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 border border-slate-700/60 rounded text-[11px]">
            <Clock className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span className="text-slate-400">Next Sync:</span>
            <span className="font-mono font-bold text-cyan-400">{formatCountdown(countdown)}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{
              background: 'none',
              border: 'none',
              color: '#10b981',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#34d399')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#10b981')}
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>

          <button
            onClick={() => setShowContent(!showContent)}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              outline: 'none',
            }}
          >
            {showContent ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Panel Content */}
      {showContent && (
        <div style={{ padding: '16px', backgroundColor: 'var(--app-card-bg, #111827)' }}>
          {/* Metric Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Tracked Symbols</span>
                <div className="text-lg font-bold text-white mt-0.5">{symbols.length}</div>
              </div>
              <div className="text-xs font-semibold px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                {symbols.filter((s) => s.is_active).length} Active
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Total Stored Candles</span>
                <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                  {symbols.reduce((acc, s) => acc + (s.candle_count || 0), 0).toLocaleString()}
                </div>
              </div>
              <Database className="w-4 h-4 text-slate-500" />
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Auto-Sync Frequency</span>
                <div className="text-xs font-semibold text-cyan-300 mt-1">Every 10 Minutes</div>
              </div>
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
          </div>

          {/* Notifications */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          {/* Add Symbol Searchable Dropdown Form */}
          <form onSubmit={handleAddSymbol} className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={loadingBrokerSymbols ? 'Loading symbols...' : 'Search/select MetaTrader symbol (e.g. EURUSD.ecn, BTCUSD)...'}
                value={showBrokerSymbolDropdown ? brokerSymbolSearch : newSymbol}
                onFocus={() => {
                  setBrokerSymbolSearch('');
                  setShowBrokerSymbolDropdown(true);
                }}
                onChange={(e) => {
                  setBrokerSymbolSearch(e.target.value);
                  setNewSymbol(e.target.value);
                }}
                style={{
                  backgroundColor: 'var(--app-input-bg, #0b0f19)',
                  borderColor: 'var(--app-input-border, #1f2937)',
                  color: 'var(--app-input-text, #ffffff)',
                }}
                className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />

              {showBrokerSymbolDropdown && (
                <>
                  <div
                    onClick={() => setShowBrokerSymbolDropdown(false)}
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 999,
                    }}
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
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    {filteredBrokerSymbols.length > 0 ? (
                      filteredBrokerSymbols.map((sym) => (
                        <div
                          key={sym}
                          onClick={() => handleSelectBrokerSymbol(sym)}
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            color: '#f8fafc',
                            cursor: 'pointer',
                            borderBottom: '1px solid #1e293b',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          {sym}
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '8px 12px', fontSize: '12px', color: '#64748b' }}>
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
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Add Symbol</span>
            </button>
          </form>

          {/* Tracked Symbols List */}
          <div className="space-y-2">
            {symbols.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs bg-slate-950/40 rounded-lg border border-dashed border-slate-800">
                No symbols registered for 1m candle collection yet. Add your first symbol above to begin background collection.
              </div>
            ) : (
              symbols.map((item) => (
                <div
                  key={item.symbol}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition-all duration-150 ${
                    item.is_active
                      ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-900/30 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        item.is_active ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-slate-600'
                      }`}
                    />
                    <div>
                      <div className="font-bold text-xs text-white tracking-wide">{item.symbol}</div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Server className="w-3 h-3 text-slate-500" />
                        <span>
                          Server: <strong className="text-slate-300 font-normal">{item.server || 'Default'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 text-xs text-slate-400">
                    <div className="text-right">
                      <span className="text-slate-500 text-[10px] block">Stored 1M Candles</span>
                      <span className="font-mono font-bold text-xs text-emerald-400">{item.candle_count.toLocaleString()}</span>
                    </div>

                    <div className="hidden md:block text-right">
                      <span className="text-slate-500 text-[10px] block">Last Synced</span>
                      <span className="text-slate-300 text-[11px]">{item.last_synced || 'Pending first sync'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleSymbol(item.symbol, item.is_active)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition cursor-pointer ${
                          item.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {item.is_active ? 'Active' : 'Paused'}
                      </button>

                      <button
                        onClick={() => handleRemoveSymbol(item.symbol)}
                        className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition cursor-pointer"
                        title="Remove symbol"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
