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
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-2xl text-slate-100 mt-6 relative overflow-hidden">
      {/* Glow highlight backdrop */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-6 border-b border-slate-800/80 relative z-10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-400 rounded-xl border border-emerald-500/30 shadow-inner">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xl text-white tracking-tight">1M MetaTrader Candle Collector</h3>
              <span className="px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                Background Service
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Automated 1-minute historical candle syncing into MySQL database per server</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end lg:self-auto">
          {/* Visual Countdown Badge */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-950/70 border border-slate-800 rounded-xl text-xs shadow-inner">
            <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-slate-400 font-medium">Next Sync:</span>
            <span className="font-mono font-bold text-cyan-400 text-sm tracking-wider">{formatCountdown(countdown)}</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/40 transition-all duration-150 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5 relative z-10">
        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Tracked Symbols</span>
            <div className="text-xl font-bold text-white mt-0.5">{symbols.length}</div>
          </div>
          <div className="text-xs font-semibold px-2 py-1 bg-slate-800 text-slate-300 rounded-lg">
            {symbols.filter(s => s.is_active).length} Active
          </div>
        </div>

        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Total Stored Candles</span>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-0.5">
              {symbols.reduce((acc, s) => acc + (s.candle_count || 0), 0).toLocaleString()}
            </div>
          </div>
          <Database className="w-5 h-5 text-slate-600" />
        </div>

        <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Auto-Sync Frequency</span>
            <div className="text-sm font-semibold text-cyan-300 mt-1">Every 10 Minutes</div>
          </div>
          <Clock className="w-5 h-5 text-slate-600" />
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-2.5">
          <XCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Add Symbol Bar */}
      <form onSubmit={handleAddSymbol} className="flex gap-2 relative z-10 mb-5">
        <div className="relative flex-1">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="Enter MetaTrader Symbol (e.g. EURUSD, BTCUSD, XAUUSD)..."
            className="w-full bg-slate-950/90 border border-slate-800 focus:border-emerald-500/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all shadow-inner"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !newSymbol.trim()}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-white border border-slate-700 rounded-xl text-sm font-medium transition cursor-pointer"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          <span>Add Symbol</span>
        </button>
      </form>

      {/* Tracked Symbols List */}
      <div className="space-y-2.5 relative z-10">
        {symbols.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800/80">
            No symbols registered for 1m candle collection yet. Add your first symbol above to begin background collection.
          </div>
        ) : (
          symbols.map((item) => (
            <div
              key={item.symbol}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all duration-200 ${
                item.is_active
                  ? 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700'
                  : 'bg-slate-950/30 border-slate-900/60 opacity-65'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-2.5 h-2.5 rounded-full ${item.is_active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse' : 'bg-slate-600'}`} />
                <div>
                  <div className="font-bold text-base text-white tracking-wide">{item.symbol}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                    <Server className="w-3 h-3 text-slate-500" />
                    <span>Server: <strong className="text-slate-300 font-normal">{item.server || 'Default'}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6 text-xs text-slate-400">
                <div className="text-right">
                  <span className="text-slate-500 text-[11px] block">Stored 1M Candles</span>
                  <span className="font-mono font-bold text-sm text-emerald-400">{item.candle_count.toLocaleString()}</span>
                </div>

                <div className="hidden md:block text-right">
                  <span className="text-slate-500 text-[11px] block">Last Synced</span>
                  <span className="text-slate-300 font-medium">{item.last_synced || 'Pending first sync'}</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Active Toggle Switch */}
                  <button
                    onClick={() => handleToggleSymbol(item.symbol, item.is_active)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      item.is_active
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {item.is_active ? 'Active' : 'Paused'}
                  </button>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveSymbol(item.symbol)}
                    className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg border border-transparent hover:border-red-500/30 transition cursor-pointer"
                    title="Remove symbol"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
