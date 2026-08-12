import React, { useState, useEffect } from 'react';
import { Users, Copy, Plus, Trash2, CheckCircle2, PauseCircle, Play, Laptop, Server } from 'lucide-react';
import { API_BASE_URL } from '../api';

interface SlaveAccount {
  account_id: string;
  broker: string;
  mode: 'direct' | 'multiplier';
  multiplier: number;
  status: 'active' | 'paused';
}

interface CopytraderConfig {
  id: string;
  name: string;
  status: 'active' | 'paused';
  target_computer: string;
  master_account: string;
  master_broker: string;
  slaves: SlaveAccount[];
}

interface AccountItem {
  id: string;
  name: string;
  account_id: string;
  broker_type: string;
}

export const CopytraderCard: React.FC = () => {
  const [configs, setConfigs] = useState<CopytraderConfig[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [computers, setComputers] = useState<string[]>(['All']);
  const [loading, setLoading] = useState<boolean>(false);

  // Form State
  const [name, setName] = useState('');
  const [targetComputer, setTargetComputer] = useState('All');
  const [masterAccount, setMasterAccount] = useState('');
  const [masterBroker, setMasterBroker] = useState('metatrader');
  const [slaves, setSlaves] = useState<SlaveAccount[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchConfigs();
    fetchAccounts();
    fetchComputers();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/configs`);
      const data = await res.json();
      if (data.status === 'success') {
        setConfigs(data.configs || []);
      }
    } catch (e) {
      console.error('Failed to fetch copytrader configs', e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/accounts`);
      const data = await res.json();
      if (data.status === 'success') {
        setAccounts(data.accounts || []);
      }
    } catch (e) {
      console.error('Failed to fetch accounts', e);
    }
  };

  const fetchComputers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/computers`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.computers)) {
        const list = ['All', ...data.computers.map((c: any) => c.name || c.hostname || c)];
        setComputers(Array.from(new Set(list)));
      }
    } catch (e) {
      console.error('Failed to fetch computers', e);
    }
  };

  const handleAddSlave = () => {
    setSlaves([
      ...slaves,
      { account_id: '', broker: 'metatrader', mode: 'direct', multiplier: 1.0, status: 'active' }
    ]);
  };

  const handleRemoveSlave = (index: number) => {
    setSlaves(slaves.filter((_, i) => i !== index));
  };

  const handleSlaveChange = (index: number, field: keyof SlaveAccount, value: any) => {
    const updated = [...slaves];
    updated[index] = { ...updated[index], [field]: value };
    setSlaves(updated);
  };

  const handleSaveConfig = async () => {
    if (!masterAccount) {
      alert('Please select a Master Account.');
      return;
    }
    setLoading(true);

    const payload = {
      id: editingId || `cfg_${Date.now()}`,
      name: name || `Copytrader (${masterAccount})`,
      status: 'active',
      target_computer: targetComputer,
      master_account: masterAccount,
      master_broker: masterBroker,
      slaves: slaves
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.status === 'success') {
        resetForm();
        fetchConfigs();
      } else {
        alert(data.message || 'Failed to save config');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save Copytrader configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Copytrader rule?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/copytrader/config/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        fetchConfigs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setTargetComputer('All');
    setMasterAccount('');
    setMasterBroker('metatrader');
    setSlaves([]);
  };

  const editConfig = (cfg: CopytraderConfig) => {
    setEditingId(cfg.id);
    setName(cfg.name);
    setTargetComputer(cfg.target_computer || 'All');
    setMasterAccount(cfg.master_account);
    setMasterBroker(cfg.master_broker || 'metatrader');
    setSlaves(cfg.slaves || []);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Copy className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold tracking-wide">Copytrader (Master / Slave Engine)</h2>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
          1s Sync Active
        </span>
      </div>

      {/* Editor / Configuration Form */}
      <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-4">
        <h3 className="text-sm font-medium text-slate-300">
          {editingId ? 'Edit Copytrader Setup' : 'Create New Copytrader Setup'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Setup Name</label>
            <input
              type="text"
              placeholder="e.g. Master FTMO -> Slaves"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Target Host / Computer</label>
            <select
              value={targetComputer}
              onChange={(e) => setTargetComputer(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            >
              {computers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Master Account</label>
            <select
              value={masterAccount}
              onChange={(e) => {
                const accId = e.target.value;
                setMasterAccount(accId);
                const matched = accounts.find((a) => a.account_id === accId);
                if (matched) setMasterBroker(matched.broker_type);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select Master Account...</option>
              {accounts.map((acc) => (
                <option key={acc.account_id} value={acc.account_id}>
                  {acc.name} ({acc.account_id}) - {acc.broker_type.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Slaves Builder */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Slave Accounts ({slaves.length})
            </span>
            <button
              onClick={handleAddSlave}
              className="flex items-center gap-1 text-xs bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Slave
            </button>
          </div>

          {slaves.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No slave accounts added yet. Click 'Add Slave' above.</p>
          ) : (
            <div className="space-y-2">
              {slaves.map((slave, idx) => (
                <div key={idx} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-slate-900/80 p-2.5 rounded border border-slate-800">
                  <select
                    value={slave.account_id}
                    onChange={(e) => {
                      const accId = e.target.value;
                      const matched = accounts.find((a) => a.account_id === accId);
                      handleSlaveChange(idx, 'account_id', accId);
                      if (matched) handleSlaveChange(idx, 'broker', matched.broker_type);
                    }}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none"
                  >
                    <option value="">Select Slave Account...</option>
                    {accounts
                      .filter((a) => a.account_id !== masterAccount)
                      .map((acc) => (
                        <option key={acc.account_id} value={acc.account_id}>
                          {acc.name} ({acc.account_id})
                        </option>
                      ))}
                  </select>

                  <select
                    value={slave.mode}
                    onChange={(e) => handleSlaveChange(idx, 'mode', e.target.value as any)}
                    className="w-32 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none"
                  >
                    <option value="direct">Direct (1:1)</option>
                    <option value="multiplier">Multiplier</option>
                  </select>

                  {slave.mode === 'multiplier' && (
                    <div className="flex items-center gap-1 w-28">
                      <span className="text-xs text-slate-400">x</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.01"
                        value={slave.multiplier}
                        onChange={(e) => handleSlaveChange(idx, 'multiplier', parseFloat(e.target.value) || 1.0)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => handleRemoveSlave(idx)}
                    className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                    title="Remove Slave"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {editingId && (
            <button
              onClick={resetForm}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded transition-colors"
            >
              Cancel Edit
            </button>
          )}
          <button
            onClick={handleSaveConfig}
            disabled={loading}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {editingId ? 'Update Copytrader Setup' : 'Save Copytrader Setup'}
          </button>
        </div>
      </div>

      {/* Configs List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Deployed Copytrader Rules</h3>
        {configs.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center border border-dashed border-slate-800 rounded-lg">
            No Copytrader setups configured.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {configs.map((cfg) => (
              <div key={cfg.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">{cfg.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                      cfg.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {cfg.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Host: <strong className="text-slate-300">{cfg.target_computer}</strong></span>
                    <span>Master: <strong className="text-indigo-400">{cfg.master_account}</strong></span>
                    <span>Slaves: <strong className="text-emerald-400">{cfg.slaves?.length || 0}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => editConfig(cfg)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(cfg.id)}
                    className="text-xs bg-red-950/60 hover:bg-red-900/60 border border-red-800/40 text-red-400 px-3 py-1.5 rounded transition-colors"
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
  );
};
export default CopytraderCard;
