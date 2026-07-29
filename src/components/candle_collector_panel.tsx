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

export const CandleCollectorPanel: React.FC = () => {
  const [symbols, setSymbols] = useState<TrackedSymbol[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(600); // 10 minutes in seconds

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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg text-slate-100 mt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-white">1M MetaTrader Candle Collector</h3>
            <p className="text-xs text-slate-400">Background ingestion of 1-minute historical candles into MySQL</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Visual Countdown Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs">
            <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="text-slate-400">Next Auto-Sync:</span>
            <span className="font-mono font-bold text-cyan-400">{formatCountdown(countdown)}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Add Symbol Input */}
      <form onSubmit={handleAddSymbol} className="mt-4 flex gap-2">
        <input
          type="text"
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value)}
          placeholder="Enter MT5 Symbol (e.g. EURUSD.ECN, BTCUSD)"
          className="flex-1 bg-slate-950 border border-slate-700/70 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={loading || !newSymbol.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Add Symbol
        </button>
      </form>

      {/* Tracked Symbols List */}
      <div className="mt-5 space-y-2">
        {symbols.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs bg-slate-950/40 rounded-lg border border-dashed border-slate-800">
            No symbols currently tracked for 1m candle collection. Add a symbol above to start saving candles.
          </div>
        ) : (
          symbols.map((item) => (
            <div
              key={item.symbol}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border transition ${
                item.is_active
                  ? 'bg-slate-950/80 border-slate-800/80'
                  : 'bg-slate-950/30 border-slate-900 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="font-bold text-sm text-white tracking-wide">{item.symbol}</div>
                <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-slate-800 rounded text-slate-300">
                  <Server className="w-3 h-3 text-slate-400" />
                  <span>{item.server}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-400">
                <div>
                  <span className="text-slate-500">Candles stored: </span>
                  <span className="font-mono font-semibold text-emerald-400">{item.candle_count.toLocaleString()}</span>
                </div>

                <div className="hidden md:block">
                  <span className="text-slate-500">Last sync: </span>
                  <span className="text-slate-300">{item.last_synced || 'Pending...'}</span>
                </div>

                {/* Active Toggle Switch */}
                <button
                  onClick={() => handleToggleSymbol(item.symbol, item.is_active)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${
                    item.is_active
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {item.is_active ? 'Active' : 'Paused'}
                </button>

                {/* Remove Button */}
                <button
                  onClick={() => handleRemoveSymbol(item.symbol)}
                  className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition"
                  title="Remove symbol"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
