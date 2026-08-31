import React, { useState, useEffect } from 'react';
import { Bell, Trash2, Edit2, Plus, CheckCircle, AlertCircle, RefreshCw, X } from 'lucide-react';
import { API_BASE_URL } from '../api';

export interface PriceAlert {
  id: number;
  symbol: string;
  target_price: number;
  alert_condition: 'ABOVE' | 'BELOW' | 'CROSSES';
  status: 'ACTIVE' | 'TRIGGERED' | 'DISABLED';
  note?: string;
  created_at?: string;
  triggered_at?: string;
}

interface AlertManagerPanelProps {
  currentSymbol?: string;
}

export const AlertManagerPanel: React.FC<AlertManagerPanelProps> = ({ currentSymbol }) => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [filterSymbol, setFilterSymbol] = useState<string>(currentSymbol || '');

  // Form fields
  const [formSymbol, setFormSymbol] = useState<string>(currentSymbol || 'EURUSD');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formCondition, setFormCondition] = useState<'ABOVE' | 'BELOW' | 'CROSSES'>('CROSSES');
  const [formNote, setFormNote] = useState<string>('');

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/alerts`;
      if (filterSymbol) {
        url += `?symbol=${encodeURIComponent(filterSymbol)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch (e) {
      console.error('Failed to fetch price alerts', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, [filterSymbol]);

  useEffect(() => {
    if (currentSymbol) {
      setFormSymbol(currentSymbol);
    }
  }, [currentSymbol]);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSymbol || !formPrice) return;

    try {
      const res = await fetch(`${API_BASE_URL}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: formSymbol.toUpperCase(),
          target_price: parseFloat(formPrice),
          alert_condition: formCondition,
          note: formNote
        })
      });

      if (res.ok) {
        setShowNewModal(false);
        setFormPrice('');
        setFormNote('');
        fetchAlerts();
      }
    } catch (e) {
      console.error('Error creating alert', e);
    }
  };

  const handleDeleteAlert = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== id));
      }
    } catch (e) {
      console.error('Error deleting alert', e);
    }
  };

  const handleToggleStatus = async (alert: PriceAlert) => {
    const nextStatus = alert.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const res = await fetch(`${API_BASE_URL}/alerts/${alert.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        fetchAlerts();
      }
    } catch (e) {
      console.error('Error updating alert status', e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 p-4 border-l border-slate-800 w-80">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-bold text-lg text-amber-400">
          <Bell className="w-5 h-5 text-amber-400" />
          <span>Price Alerts</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAlerts}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
            title="Refresh alerts"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-slate-950 px-2.5 py-1 rounded text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> New Alert
          </button>
        </div>
      </div>

      {/* Filter by symbol */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Filter by symbol (e.g. EURUSD)"
          value={filterSymbol}
          onChange={e => setFilterSymbol(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Alerts list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {alerts.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-8">
            No alerts set.
          </div>
        ) : (
          alerts.map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 transition-colors ${
                alert.status === 'TRIGGERED'
                  ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                  : alert.status === 'DISABLED'
                  ? 'bg-slate-800/40 border-slate-800 text-slate-500'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="text-sm tracking-wide text-white">{alert.symbol}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${
                    alert.status === 'TRIGGERED'
                      ? 'bg-amber-500 text-slate-950'
                      : alert.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {alert.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span className="font-mono text-sm font-bold text-amber-300">
                  ${alert.target_price.toFixed(5)}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {alert.alert_condition}
                </span>
              </div>

              {alert.note && (
                <div className="text-[11px] text-slate-400 italic">
                  "{alert.note}"
                </div>
              )}

              <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-700/50 text-[10px] text-slate-500">
                <span>{alert.triggered_at ? `Triggered: ${new Date(alert.triggered_at).toLocaleTimeString()}` : alert.created_at ? new Date(alert.created_at).toLocaleDateString() : ''}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleStatus(alert)}
                    className="hover:text-amber-400 transition-colors"
                    title={alert.status === 'ACTIVE' ? 'Disable alert' : 'Enable alert'}
                  >
                    {alert.status === 'ACTIVE' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                  <button
                    onClick={() => handleDeleteAlert(alert.id)}
                    className="hover:text-rose-400 transition-colors"
                    title="Delete alert"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Alert Modal Overlay */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-80 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" /> Set Price Alert
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAlert} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Symbol</label>
                <input
                  type="text"
                  required
                  value={formSymbol}
                  onChange={e => setFormSymbol(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Target Price</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 1.08500"
                  value={formPrice}
                  onChange={e => setFormPrice(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Condition</label>
                <select
                  value={formCondition}
                  onChange={e => setFormCondition(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="CROSSES">Crosses Price</option>
                  <option value="ABOVE">Price Above or Equal</option>
                  <option value="BELOW">Price Below or Equal</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Wyckoff Resistance Level"
                  value={formNote}
                  onChange={e => setFormNote(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                >
                  Create Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
